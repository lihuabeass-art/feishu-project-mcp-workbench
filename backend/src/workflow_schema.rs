//! 远端字段元数据的通用解释；节点流与状态流共用，不按业务字段名猜测类型。
use super::{FieldKind, FieldOption};
use crate::error::BackendError;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn definition(config: &Value) -> Result<(FieldKind, Vec<FieldOption>), String> {
    let kind = match config["field_type"].as_str().unwrap_or("") {
        "text" | "link" => FieldKind::Text,
        "multi-pure-text" | "multi-text" => FieldKind::Textarea,
        "number" => FieldKind::Number,
        "date" => FieldKind::Date,
        "select" | "radio" | "bool" => FieldKind::Select,
        other => return Err(format!("暂不支持 {other}")),
    };
    if config["field_type"] == "bool" {
        return Ok((
            kind,
            vec![
                FieldOption {
                    value: "true".into(),
                    label: "是".into(),
                },
                FieldOption {
                    value: "false".into(),
                    label: "否".into(),
                },
            ],
        ));
    }
    let mut options = Vec::new();
    if kind == FieldKind::Select {
        let mut seen = BTreeSet::new();
        let valid = config["option"].as_array().is_some_and(|rows| {
            !rows.is_empty()
                && rows.iter().all(|row| {
                    let value = scalar(&row["option_id"]);
                    let label = scalar(&row["option_name"]);
                    if value.trim().is_empty()
                        || label.trim().is_empty()
                        || !seen.insert(value.clone())
                    {
                        return false;
                    }
                    options.push(FieldOption { value, label });
                    true
                })
        });
        if !valid {
            return Err("选项配置不完整".into());
        }
    }
    Ok((kind, options))
}

pub(super) fn scalar(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Number(value) => value.to_string(),
        Value::Bool(value) => value.to_string(),
        _ => String::new(),
    }
}

pub(super) fn decoded(value: &Value) -> Result<Value, BackendError> {
    if let Some(raw) = value.as_str() {
        if raw.trim().is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_str(raw).map_err(|_| {
            BackendError::parse("复合字段", "云端值不是有效的 JSON，无法确认负责人和子字段")
        })
    } else {
        Ok(value.clone())
    }
}

pub(super) fn field_value(rows: &Value, key: &str) -> Value {
    rows.as_array()
        .and_then(|rows| {
            rows.iter().find(|row| {
                row.get("field_key")
                    .or_else(|| row.get("key"))
                    .is_some_and(|v| v == key)
            })
        })
        .and_then(|row| row.get("field_value").or_else(|| row.get("value")))
        .cloned()
        .unwrap_or(Value::Null)
}

/// 子字段也建入必填索引，保留远端给出的完整父路径与负责人限制。
pub(super) fn requirements(required: &Value) -> Result<BTreeMap<String, Value>, BackendError> {
    fn collect(
        rows: &[Value],
        path: &[String],
        constraints: &[Value],
        class: Option<&Value>,
        out: &mut BTreeMap<String, Value>,
    ) -> Result<(), BackendError> {
        for row in rows {
            if row["finished"] == true {
                continue;
            }
            let key = scalar(row.get("field_key").unwrap_or(&row["key"]));
            if key.trim().is_empty() {
                return Err(BackendError::parse("必填项", "缺少字段 key"));
            }
            let mut path = path.to_vec();
            path.push(key.clone());
            let owners = row.get("not_finished_owner");
            let class = row.get("class").or(class);
            if owners.is_some_and(|value| {
                !value.is_array()
                    || value
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|o| !o.as_str().is_some_and(|s| !s.trim().is_empty()))
            }) {
                return Err(BackendError::parse("必填项", "负责人列表格式不正确"));
            }
            let children = row
                .get("sub_field")
                .map(|v| {
                    v.as_array()
                        .ok_or_else(|| BackendError::parse("必填项", "子字段不是数组"))
                })
                .transpose()?;
            let mut constraints = constraints.to_vec();
            if let Some(owners) = owners {
                let owner_path = if children.is_some_and(|rows| !rows.is_empty()) {
                    path.clone()
                } else {
                    path[..path.len() - 1].to_vec()
                };
                constraints.push(json!({"path":owner_path,"owners":owners}));
            }
            if let Some(children) = children {
                if !children.is_empty() {
                    collect(children, &path, &constraints, class, out)?;
                    continue;
                }
            }
            let mut entry = row.clone();
            entry["_path"] = json!(path);
            entry["_owner_constraints"] = json!(constraints);
            if let Some(class) = class {
                entry["class"] = class.clone();
            }
            if out
                .insert(serde_json::to_string(&path).unwrap(), entry)
                .is_some()
            {
                return Err(BackendError::parse(
                    "必填项",
                    "子字段 key 重复，无法唯一确认填写归属",
                ));
            }
        }
        Ok(())
    }
    let mut out = BTreeMap::new();
    for container in ["node_fields", "form_items"] {
        if let Some(rows) = required.get(container) {
            let mut scoped = BTreeMap::new();
            collect(
                rows.as_array()
                    .ok_or_else(|| BackendError::parse("必填项", "必填项不是数组"))?,
                &[],
                &[],
                None,
                &mut scoped,
            )?;
            for (key, mut row) in scoped {
                row["_scope"] = json!(if container == "form_items" {
                    "work_item"
                } else {
                    "node"
                });
                out.insert(format!("{container}:{key}"), row);
            }
        }
    }
    Ok(out)
}

pub(super) fn owners_at<'a>(row: &'a Value, path: &[String]) -> impl Iterator<Item = &'a Value> {
    let path = path.to_vec();
    row["_owner_constraints"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(move |constraint| {
            let declared: Vec<String> = constraint["path"]
                .as_array()
                .into_iter()
                .flatten()
                .map(scalar)
                .collect();
            declared == path
        })
        .map(|constraint| &constraint["owners"])
}

pub(super) fn resolved_requirements(
    required: &Value,
    node_configs: &[Value],
    work_configs: &[Value],
) -> Result<BTreeMap<String, Value>, BackendError> {
    fn find(config: &Value, target: &str, parents: &[String]) -> Option<Vec<String>> {
        let mut path = parents.to_vec();
        path.push(scalar(&config["field_key"]));
        if config["field_key"] == target {
            return Some(path);
        }
        config["compound_field_info"]
            .as_array()?
            .iter()
            .find_map(|child| find(child, target, &path))
    }
    let mut rows = requirements(required)?;
    for row in rows.values_mut() {
        let path = row["_path"].as_array().unwrap();
        if path.len() != 1 {
            continue;
        }
        let configs = if row["_scope"] == "work_item" {
            work_configs
        } else {
            node_configs
        };
        if let Some(root) = root_for(configs, row)? {
            let path = find(root, path[0].as_str().unwrap(), &[]).unwrap();
            for constraint in row["_owner_constraints"].as_array_mut().unwrap() {
                if constraint["path"].as_array().is_some_and(Vec::is_empty) {
                    constraint["path"] = json!(&path[..path.len() - 1]);
                }
            }
            row["_path"] = json!(path);
        }
    }
    Ok(rows)
}

pub(super) fn owner_matches(row: &Value, path: &[String], owner: &str) -> bool {
    owners_at(row, path).all(|owners| {
        owners
            .as_array()
            .is_some_and(|rows| rows.is_empty() || rows.iter().any(|value| value == owner))
    })
}

pub(super) fn needed<'a>(
    required: &'a BTreeMap<String, Value>,
    path: &[String],
    work_item: bool,
) -> Option<&'a Value> {
    required.values().find(|row| {
        if (row["_scope"] == "work_item") != work_item {
            return false;
        }
        let declared: Vec<String> = row["_path"]
            .as_array()
            .into_iter()
            .flatten()
            .map(scalar)
            .collect();
        declared == path || (declared.len() == 1 && declared.last() == path.last())
    })
}

/// 必填接口可能只返回子字段 key；从完整配置中唯一地找回其根字段。
pub(super) fn root_for<'a>(
    configs: &'a [Value],
    required: &Value,
) -> Result<Option<&'a Value>, BackendError> {
    fn visit(
        config: &Value,
        path: &mut Vec<String>,
        target: &[String],
        supported: bool,
        matches: &mut Vec<bool>,
    ) {
        path.push(scalar(&config["field_key"]));
        if (target.len() == 1 && path.last() == target.last()) || path == target {
            matches.push(supported);
        }
        // 未支持父类型中的字段位置仍参与歧义检测，但不能成为可写入路径。
        if let Some(children) = config["compound_field_info"].as_array() {
            for child in children {
                visit(
                    child,
                    path,
                    target,
                    supported && config["field_type"] == "multi_user_compound_field",
                    matches,
                );
            }
        }
        path.pop();
    }
    let path: Vec<String> = required["_path"]
        .as_array()
        .into_iter()
        .flatten()
        .map(scalar)
        .collect();
    let mut found = None;
    let mut matches = Vec::new();
    for config in configs {
        let previous = matches.len();
        visit(config, &mut Vec::new(), &path, true, &mut matches);
        if matches.len() > previous && matches.last() == Some(&true) {
            found = Some(config);
        }
    }
    if matches.len() > 1 {
        return Err(BackendError::parse(
            "必填项",
            "字段 key 对应多个复合字段，无法唯一确认归属",
        ));
    }
    Ok(found)
}
