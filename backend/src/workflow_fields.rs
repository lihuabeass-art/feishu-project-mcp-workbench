//! 流转表单与写入计划。这里只描述正式提交；草稿完全留在客户端本机。
use super::{FieldKind, FieldOption, FieldSettings, WorkflowField};
use crate::{api::Session, error::BackendError};
use chrono::{FixedOffset, NaiveDate, TimeZone};
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet};

#[path = "workflow_schema.rs"]
mod schema;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
struct CompoundStep {
    field_key: String,
    owner: String,
}

#[derive(Debug, Clone, Serialize)]
enum Route {
    Node(String),
    WorkItem(String),
    Schedule {
        property: String,
        owner: Option<String>,
    },
    Compound {
        work_item: bool,
        path: Vec<CompoundStep>,
        field: String,
    },
}
#[derive(Debug, Clone, Serialize)]
struct Input {
    field: WorkflowField,
    route: Route,
    remote_type: String,
}
#[derive(Debug, Clone, Serialize)]
struct PageRequired {
    label: String,
    kind: String,
}
#[derive(Debug, Clone, Default, Serialize)]
pub(super) struct NodeForm {
    inputs: Vec<Input>,
    pub blocked: Vec<String>,
    page_required: BTreeMap<String, PageRequired>,
}

fn text(v: &Value) -> String {
    schema::scalar(v)
}

// 系统的负责人完成信息虽声明为复合字段，但不能据此套用普通复合字段写协议。
// 飞书官方节点操作说明要求各负责人在页面填写；实际 update_node 也会拒绝该值。
fn page_only_node_field(key: &str) -> Option<&'static str> {
    match key {
        "owners_finished_info" => Some("负责人完成结论与意见"),
        "owners_node_finished_conclusion" => Some("负责人完成结论"),
        "owners_node_finished_opinion" => Some("负责人完成意见"),
        "actual_work_time" => Some("实际工时"),
        _ => None,
    }
}

fn config_at_path<'a>(configs: &'a [Value], path: &[Value]) -> Option<&'a Value> {
    let mut config = configs.iter().find(|row| row["field_key"] == path[0])?;
    for key in &path[1..] {
        config = config["compound_field_info"].as_array()?.iter().find(|row| row["field_key"] == *key)?;
    }
    Some(config)
}

fn page_only_type<'a>(key: &str, config: &'a Value) -> Option<&'a str> {
    if page_only_node_field(key).is_some() {
        return Some(if key == "actual_work_time" { "actual_work_time" } else { "owners_finished_info" });
    }
    config["field_type"].as_str().filter(|kind| matches!(*kind,
        "vote-boolean" | "vote-option" | "vote-option-multi"))
}

fn select_value(value: &Value) -> String {
    if value.is_string() || value.is_number() || value.is_boolean() { text(value) }
    else { text(value.get("value").or_else(|| value.get("option_id")).unwrap_or(&Value::Null)) }
}

fn initial_value(kind: &FieldKind, value: &Value) -> String {
    match kind {
        FieldKind::Select => select_value(value),
        FieldKind::Date => text(value)
            .parse::<i64>()
            .ok()
            .and_then(|ms| {
                FixedOffset::east_opt(8 * 3600)
                    .unwrap()
                    .timestamp_millis_opt(ms)
                    .single()
            })
            .map(|d| d.format("%Y-%m-%d").to_string())
            .unwrap_or_default(),
        _ => text(value),
    }
}

pub(super) async fn field_configs(
    session: &Session,
    project: &str,
    type_key: &str,
    fresh: bool,
) -> Result<(Vec<Value>, Vec<Value>), BackendError> {
    tokio::try_join!(
        session.field_metadata("list_node_field_config", project, type_key, fresh),
        work_field_configs(session, project, type_key, fresh)
    )
}

pub(super) async fn work_field_configs(
    session: &Session,
    project: &str,
    type_key: &str,
    fresh: bool,
) -> Result<Vec<Value>, BackendError> {
    session.field_metadata("list_workitem_field_config", project, type_key, fresh).await
}

impl NodeForm {
    pub fn unfinished_names(required: &Value, labels: &BTreeMap<String, String>) -> Result<Vec<String>, BackendError> {
        Ok(schema::requirements(required)?.values().map(|row| {
            let key = text(row["_path"].as_array().unwrap().last().unwrap());
            labels.get(&key).cloned().unwrap_or_else(|| text(&row["field_name"]).if_empty(&key))
        }).collect::<BTreeSet<_>>().into_iter().collect())
    }

    pub fn has_page_required(&self) -> bool { !self.page_required.is_empty() }

    pub fn node_block_reason(&self, node_name: &str) -> Option<String> {
        if self.page_required.is_empty() { return super::block_reason("完成", &self.blocked); }
        // 飞书官方 sop-transition-node.md §4.3 原文，仅替换节点名、字段名及类型。
        let mut reasons: Vec<_> = self.page_required.values().map(|PageRequired { label, kind }| format!(
            "节点流转失败。当前节点【{node_name}】设置了必须填写【{label}】（类型：{kind}）才能流转。由于该字段类型不支持自动化补充，请您在飞书项目页面手动填写后，再通知我继续流转。"
        )).collect();
        let other: Vec<_> = self.blocked.iter().filter(|label| !self.page_required.values().any(|required| &required.label == *label)).cloned().collect();
        if let Some(reason) = super::block_reason("完成", &other) { reasons.push(reason); }
        Some(reasons.join("\n"))
    }

    pub fn fields(&self) -> Vec<WorkflowField> {
        self.inputs.iter().map(|i| i.field.clone()).collect()
    }

    /// 只保留真实节点进度字段，其他流转必填项不参与进度同步。
    pub fn progress_only(&self) -> Option<Self> {
        let mut input = self.inputs.iter().find(|input| {
            matches!(&input.route, Route::Node(key) if key == "node_progress")
                && input.field.kind == FieldKind::Number
        })?.clone();
        input.field.required = true;
        Some(Self { inputs: vec![input], ..Self::default() })
    }

    /// 节点排期始终按开始、结束两个日期核对；不带入估分、工时或流转必填项。
    pub fn schedule_only(&self) -> Option<Self> {
        let inputs: Vec<_> = self.inputs.iter().filter(|input| {
            matches!(&input.route, Route::Schedule { property, .. }
                if matches!(property.as_str(), "estimate_start_date" | "estimate_end_date"))
                && input.field.kind == FieldKind::Date
        }).cloned().map(|mut input| {
            input.field.required = true;
            input
        }).collect();
        if inputs.is_empty() { return None; }
        Some(Self { inputs, ..Self::default() })
    }

    pub fn schedule_plan(&self, values: &BTreeMap<String, String>) -> Result<UpdatePlan, BackendError> {
        let plan = self.plan(values)?;
        // 沿用两端云端值时也校验完整日期范围，不能因没有差异写入而跳过。
        for start in self.inputs.iter().filter(|input| matches!(&input.route,
            Route::Schedule { property, .. } if property == "estimate_start_date")) {
            let Route::Schedule { owner, .. } = &start.route else { unreachable!() };
            let end = self.inputs.iter().find(|input| matches!(&input.route,
                Route::Schedule { property, owner: end_owner }
                    if property == "estimate_end_date" && end_owner == owner))
                .ok_or_else(|| BackendError::validation("排期缺少结束日期"))?;
            let effective = |input: &Input| {
                date_ms(values.get(&input.field.key).map(String::as_str)
                    .or(input.field.settings.initial_value.as_deref()).unwrap_or("").trim())
            };
            if effective(start)? > effective(end)? {
                return Err(BackendError::validation("排期结束日期不能早于开始日期"));
            }
        }
        Ok(plan)
    }

    /// 状态流必填项只按工作项字段 key 建表，不能把目标状态当节点写入。
    pub fn build_state(
        transition: &Value,
        required: &Value,
        work_configs: &[Value],
        work: &Value,
    ) -> Result<Self, BackendError> {
        let mut form = Self::default();
        let required_fields = schema::resolved_requirements(required, &[], work_configs)?;
        let mut missing = BTreeMap::new();
        for row in required_fields.values() {
            let key = text(row["_path"].as_array().unwrap().last().unwrap());
            let work_field = row["_scope"] == "work_item";
            if !work_field || row["class"].as_str().is_some_and(|class| class != "field") {
                form.blocked.push(format!("{key}（无法识别可编辑字段）"));
                continue;
            }
            let root = if work_field { schema::root_for(work_configs, row)? } else { None };
            if root.is_none() && row["_path"].as_array().is_some_and(|path| path.len() > 1) {
                let path = row["_path"].as_array().unwrap().iter().map(text).collect::<Vec<_>>().join(" · ");
                form.blocked.push(format!("{path}（缺少支持完整路径的字段配置）"));
                continue;
            }
            let key = root.map(|r| text(&r["field_key"])).unwrap_or(key);
            missing.entry(key).or_insert((row, work_field, true));
        }
        // 已完成的共享字段仍从确认表单读取，供草稿合并，不能填完后就失去云端值。
        for row in transition["confirm_form"].as_array().into_iter().flatten() {
            let key = text(&row["key"]);
            if row["class"] == "field" && !key.is_empty() {
                missing.entry(key).or_insert((row, true, false));
            }
        }
        for (key, (required, work_field, is_required)) in missing {
            let confirm = transition["confirm_form"]
                .as_array()
                .and_then(|rows| rows.iter().find(|r| r["key"] == key));
            let config = work_configs.iter().find(|r| r["field_key"] == key);
            let label = confirm
                .map(|r| text(&r["name"]))
                .unwrap_or_default()
                .if_empty(&config.map(|r| text(&r["field_name"])).unwrap_or_default())
                .if_empty(&key);
            let class = required
                .get("class")
                .and_then(Value::as_str)
                .or_else(|| confirm.and_then(|r| r["class"].as_str()));
            if !work_field || class.is_some_and(|c| c != "field") || config.is_none() {
                if is_required { form.blocked.push(format!("{label}（无法识别可编辑字段）")); }
                continue;
            }
            let config = config.unwrap();
            let current = schema::field_value(&work["work_item_fields"], &key);
            if config["field_type"] == "multi_user_compound_field" {
                form.add_compound(config, &current, true, &[], &[], &[], &required_fields, &BTreeMap::new(), None, work)?;
            } else {
                form.add_basic(config, label, is_required, Route::WorkItem(key), &current);
            }
        }
        Ok(form)
    }

    fn add_basic(&mut self, config: &Value, label: String, required: bool, route: Route, current: &Value) {
        let (kind, options) = match schema::definition(config) {
            Ok(definition) => definition,
            Err(reason) => {
                if required { self.blocked.push(format!("{label}（{reason}）")); }
                return;
            }
        };
        let initial = initial_value(&kind, current);
        self.add(label, kind, required, route, Some(initial), None, None, None);
        let input = self.inputs.last_mut().unwrap();
        input.field.options = options;
        input.remote_type = text(&config["field_type"]);
    }

    fn add_page_basic(&mut self, config: &Value, label: String, route: Route, current: &Value) {
        let previous = self.inputs.len();
        if schema::definition(config).is_ok() {
            self.add_basic(config, label, false, route, current);
        } else {
            // 只读快照不推断投票的写协议；复杂云端值保留原始内容，不能伪装成空值。
            let initial = if current.is_null() { String::new() }
                else if current.is_object() || current.is_array() { current.to_string() }
                else { text(current) };
            self.add(label, FieldKind::Text, false, route, Some(initial), None, None, None);
            self.inputs.last_mut().unwrap().remote_type = text(&config["field_type"]);
        }
        self.mark_page_only(previous);
    }

    #[allow(clippy::too_many_arguments)]
    fn add_compound(
        &mut self, config: &Value, current: &Value, work_item: bool,
        parent_path: &[String], parent_labels: &[String], steps: &[CompoundStep],
        required: &BTreeMap<String, Value>, owner_labels: &BTreeMap<String, String>,
        node_owners: Option<&BTreeSet<String>>, work: &Value,
    ) -> Result<(), BackendError> {
        let key = text(&config["field_key"]);
        let label = text(&config["field_name"]).if_empty(&key);
        let mut path = parent_path.to_vec();
        path.push(key.clone());
        let mut labels = parent_labels.to_vec();
        labels.push(label.clone());
        if schema::needed(required, &path, work_item).is_some() {
            self.blocked.push(format!("{label}（未提供具体子字段的必填配置）"));
        }
        let children = config["compound_field_info"].as_array()
            .filter(|children| !children.is_empty())
            .ok_or_else(|| BackendError::parse("复合字段", format!("{label}缺少子字段配置")))?;
        let current = schema::decoded(current)?;
        if !current.is_null() && !current.is_object() {
            return Err(BackendError::parse("复合字段", format!("{label}的云端值不是负责人映射")));
        }
        let mut owners: BTreeSet<String> = current.as_object().into_iter().flat_map(|v| v.keys().cloned()).collect();
        if steps.is_empty() {
            if let Some(node_owners) = node_owners { owners.extend(node_owners.iter().cloned()); }
        }
        fn has_key(config: &Value, key: &str) -> bool {
            config["field_key"] == key || config["compound_field_info"].as_array()
                .is_some_and(|rows| rows.iter().any(|row| has_key(row, key)))
        }
        let relevant: Vec<&Value> = required.values().filter(|row| {
            if (row["_scope"] == "work_item") != work_item { return false; }
            let declared: Vec<String> = row["_path"].as_array().into_iter().flatten().map(text).collect();
            (declared.len() == 1 && has_key(config, declared.first().map(String::as_str).unwrap_or("")))
                || declared.starts_with(&path)
        }).collect();
        for row in &relevant {
            for constraint in schema::owners_at(row, &path) {
                owners.extend(constraint.as_array().into_iter().flatten().map(text));
            }
        }
        if owners.iter().any(|owner| owner.trim().is_empty()) {
            return Err(BackendError::parse("复合字段", "负责人标识为空"));
        }
        if owners.is_empty() && !relevant.is_empty() {
            self.blocked.push(format!("{label}（无法确认应填写的负责人）"));
        }
        let multiple = owners.len() > 1;
        for (index, owner) in owners.iter().enumerate() {
            let owner_required: BTreeMap<String, Value> = required.iter()
                .filter(|(_, row)| schema::owner_matches(row, &path, owner))
                .map(|(key, row)| (key.clone(), row.clone())).collect();
            let owner_label = owner_labels.get(owner).cloned()
                .or_else(|| owner_name(&Value::Null, work, owner))
                .unwrap_or_else(|| format!("负责人 {}", index + 1));
            if node_owners.is_some_and(|known| !known.contains(owner)) {
                if relevant.iter().any(|row| schema::owners_at(row, &path)
                    .any(|rows| rows.as_array().is_some_and(|rows| rows.iter().any(|v| v == owner)))) {
                    self.blocked.push(format!("{label} · {owner_label}（不是当前节点负责人）"));
                }
                continue;
            }
            let rows = current.get(owner).unwrap_or(&Value::Null);
            if !rows.is_null() && !rows.is_array() {
                return Err(BackendError::parse("复合字段", format!("{label}的负责人子字段不是数组")));
            }
            let mut value_keys = BTreeSet::new();
            if rows.as_array().is_some_and(|rows| rows.iter().any(|row| {
                let key = text(row.get("field_key").or_else(|| row.get("key")).unwrap_or(&Value::Null));
                key.trim().is_empty() || !value_keys.insert(key)
            })) {
                return Err(BackendError::parse("复合字段", "云端子字段缺少唯一的 key"));
            }
            let mut next_steps = steps.to_vec();
            next_steps.push(CompoundStep { field_key: key.clone(), owner: owner.clone() });
            let mut seen = BTreeSet::new();
            for child in children {
                let child_key = text(&child["field_key"]);
                if child_key.trim().is_empty() || !seen.insert(child_key.clone()) {
                    return Err(BackendError::parse("复合字段", "子字段缺少唯一的 key"));
                }
                let value = schema::field_value(rows, &child_key);
                if child["field_type"] == "multi_user_compound_field" {
                    let mut nested_labels = labels.clone();
                    if multiple { nested_labels.push(owner_label.clone()); }
                    self.add_compound(child, &value, work_item, &path, &nested_labels, &next_steps,
                        &owner_required, owner_labels, node_owners, work)?;
                    continue;
                }
                let mut child_path = path.clone();
                child_path.push(child_key.clone());
                let needed = schema::needed(&owner_required, &child_path, work_item).is_some();
                let child_label = text(&child["field_name"]).if_empty(&child_key);
                let column = format!("{} · {child_label}", labels.join(" · "));
                let caption = if multiple { format!("{column} · {owner_label}") } else { column.clone() };
                let previous = self.inputs.len();
                let route = Route::Compound {
                    work_item, path: next_steps.clone(), field: child_key,
                };
                if page_only_type("", child).is_some() {
                    if needed { self.blocked.push(format!("{child_label}（需在飞书项目页面填写）")); }
                    self.add_page_basic(child, caption, route, &value);
                } else {
                    self.add_basic(child, caption, needed, route, &value);
                }
                if self.inputs.len() > previous {
                    self.set_owner_column(Some(owner_label.clone()), column);
                }
            }
        }
        Ok(())
    }

    /// 依据远端真实字段 key 与归属建表，不以中文名称猜写接口。
    pub fn build(
        node: &Value,
        required: &Value,
        node_configs: &[Value],
        work_configs: &[Value],
        work_item: &Value,
    ) -> Result<Self, BackendError> {
        let mut form = Self::default();
        let required_keys = schema::resolved_requirements(required, node_configs, work_configs)?;
        let mut editable_required = required_keys.clone();
        let owner_labels: BTreeMap<_, _> = node_owner_keys(node, required)
            .into_iter()
            .enumerate()
            .map(|(index, key)| {
                let label = owner_name(node, work_item, &key)
                    .unwrap_or_else(|| format!("负责人 {}", index + 1));
                (key, label)
            })
            .collect();
        let show_owner = owner_labels.len() > 1;
        let items = node["form_items"].as_array().cloned().unwrap_or_default();
        let mut keys: BTreeMap<(bool, String), Value> = items
            .iter()
            .filter_map(|f| {
                let key = text(&f["field_key"]);
                let work = f["form_item_type"] == "field" ||
                    (!node_configs.iter().any(|c| c["field_key"] == key) && work_configs.iter().any(|c| c["field_key"] == key));
                (!key.is_empty()).then_some(((work, key), f.clone()))
            })
            .collect();
        for (required_id, req) in &required_keys {
            let key = text(req["_path"].as_array().unwrap().last().unwrap());
            let work_field = req["_scope"] == "work_item";
            let path = req["_path"].as_array().unwrap();
            let config = config_at_path(if work_field { work_configs } else { node_configs }, path);
            let root_key = text(&path[0]);
            let fallback = json!({"field_type":req.get("field_type").or_else(|| req.get("field_type_key")).unwrap_or(&Value::Null)});
            let page_type = page_only_type(if work_field { "" } else { &root_key }, config.unwrap_or(&fallback));
            if let Some(kind) = page_type {
                let label = text(&req["field_name"])
                    .if_empty(&config.map(|c| text(&c["field_name"])).unwrap_or_default())
                    .if_empty(page_only_node_field(&key).unwrap_or(&key));
                let identity = serde_json::to_string(&json!({"scope":req["_scope"],"path":path})).unwrap();
                if form.page_required.insert(identity, PageRequired { label: label.clone(), kind: kind.into() }).is_none() { form.blocked.push(label); }
                editable_required.remove(required_id);
                continue;
            }
            if req["class"].as_str().is_some_and(|class| class != "field") {
                form.blocked.push(format!("{key}（无法识别可编辑字段）"));
                continue;
            }
            let root = schema::root_for(if work_field { work_configs } else { node_configs }, req)?;
            if root.is_none() && req["_path"].as_array().is_some_and(|path| path.len() > 1) {
                let path = req["_path"].as_array().unwrap().iter().map(text).collect::<Vec<_>>().join(" · ");
                form.blocked.push(format!("{path}（缺少支持完整路径的字段配置）"));
                continue;
            }
            let root_key = root.map(|r| text(&r["field_key"])).unwrap_or(key);
            keys.entry((work_field, root_key)).or_insert_with(|| {
                let mut item = root.unwrap_or(req).clone();
                item["form_item_type"] = json!(if work_field { "field" } else { "node_field" });
                item
            });
        }
        // 估分、排期可能只显示在节点汇总区，不在 form_items 内。
        for config in node_configs {
            let key = text(&config["field_key"]);
            if matches!(key.as_str(), "schedule" | "point" | "actual_work_time") {
                keys.entry((false, key)).or_insert_with(|| config.clone());
            }
        }
        for ((work, key), item) in keys {
            let needed = schema::needed(&required_keys, &[key.clone()], work);
            let nc = node_configs.iter().find(|f| f["field_key"] == key);
            let wc = work_configs.iter().find(|f| f["field_key"] == key);
            let config = if work { wc } else { nc };
            let page_only = page_only_type(if work { "" } else { &key }, config.unwrap_or(&Value::Null)).is_some();
            let Some(config) = config else {
                if needed.is_some() && !page_only {
                    form.blocked.push(
                        text(&item["field_name"])
                            .chars()
                            .collect::<String>()
                            .trim()
                            .to_owned()
                            .if_empty(&key),
                    );
                }
                continue;
            };
            let label = text(&item["field_name"])
                .if_empty(&text(&config["field_name"]))
                .if_empty(&key);
            let kind = config["field_type"].as_str().unwrap_or("");
            if kind == "multi_user_compound_field" {
                let current = if work {
                    schema::field_value(&work_item["work_item_fields"], &key)
                } else {
                    item["value"].clone()
                };
                let known_owners: BTreeSet<String> = node["assignees"]["owners"].as_array()
                    .into_iter().flatten().map(|o| text(&o["user_key"]))
                    .filter(|o| !o.is_empty()).collect();
                let previous = form.inputs.len();
                let display_required = BTreeMap::new();
                form.add_compound(config, &current, work, &[], &[], &[],
                    if page_only { &display_required } else { &editable_required }, &owner_labels,
                    (!work).then_some(&known_owners), work_item)?;
                if page_only { form.mark_page_only(previous); }
                continue;
            }
            // 未填负责人仍需补齐；已填负责人的真实值同样回显并允许修改。
            if !work && matches!(key.as_str(), "schedule" | "point" | "actual_work_time") {
                let previous = form.inputs.len();
                let missing_owners = needed
                    .and_then(|v| v["not_finished_owner"].as_array())
                    .filter(|a| !a.is_empty());
                let missing_owners: Option<BTreeSet<Option<String>>> = missing_owners
                    .map(|a| a.iter().map(|v| Some(text(v))).collect());
                let has_value = |schedule: &Value| {
                    if key == "schedule" {
                        ["estimate_start_time", "estimate_finish_time"]
                            .iter()
                            .any(|property| !text(&schedule[*property]).is_empty())
                    } else {
                        !text(
                            &schedule[if key == "point" {
                                "points"
                            } else {
                                "actual_work_time"
                            }],
                        )
                        .is_empty()
                    }
                };
                let configured = items.iter().any(|item| item["field_key"] == key);
                let mut owners = missing_owners.clone().unwrap_or_default();
                let mut has_personal_schedule = false;
                // 必填接口省略负责人不代表节点总排期；归属以节点实际返回的个人排期为准。
                // 已配置字段即使尚空也保留个人身份，避免 unfinished 清单变化使草稿字段消失。
                for row in node["assignee_schedule_list"]
                    .as_array()
                    .into_iter()
                    .flatten()
                {
                    let owner = text(&row["assignee"]["user_key"]);
                    if !owner.is_empty() {
                        has_personal_schedule = true;
                        if needed.is_some() || configured || has_value(&row["schedule_info"]) {
                            owners.insert(Some(owner));
                        }
                    }
                }
                if owners.is_empty() && !has_personal_schedule
                    && (needed.is_some() || configured || has_value(&node["schedule"]))
                {
                    owners.insert(None);
                }
                for owner in owners {
                    if owner.as_ref().is_some_and(|o| o.is_empty()) {
                        return Err(BackendError::parse("负责人排期", "负责人标识为空"));
                    }
                    let suffix = owner
                        .as_ref()
                        .filter(|_| show_owner)
                        .map(|o| format!(" · {}", owner_labels[o]))
                        .unwrap_or_default();
                    let schedule = schedule_source(node, owner.as_deref());
                    let required = needed.is_some() && missing_owners.as_ref()
                        .is_none_or(|missing| missing.contains(&owner));
                    let owner_label = owner.as_ref().and_then(|o| owner_labels.get(o).cloned());
                    if key == "schedule" {
                        for (property, caption) in [
                            ("estimate_start_date", "开始日期"),
                            ("estimate_end_date", "结束日期"),
                        ] {
                            form.add(
                                format!("{label}{suffix} · {caption}"),
                                FieldKind::Date,
                                required,
                                Route::Schedule {
                                    property: property.into(),
                                    owner: owner.clone(),
                                },
                                Some(initial_value(
                                    &FieldKind::Date,
                                    schedule
                                        .map(|s| &s[schedule_key(property)])
                                        .unwrap_or(&Value::Null),
                                )),
                                Some("按北京时间（UTC+8）保存日期".into()),
                                None,
                                None,
                            );
                            form.set_owner_column(owner_label.clone(), format!("{label} · {caption}"));
                        }
                    } else {
                        let property = if key == "point" {
                            "points"
                        } else {
                            "actual_work_time"
                        };
                        let initial = schedule.map(|s| text(&s[property])).unwrap_or_default();
                        form.add(
                            format!("{label}{suffix}"),
                            FieldKind::Number,
                            required,
                            Route::Schedule {
                                property: property.into(),
                                owner,
                            },
                            Some(initial),
                            Some("按负责人分别填写，单位沿用飞书配置".into()),
                            Some(0.0),
                            None,
                        );
                        form.set_owner_column(owner_label, label.clone());
                        if key == "point" {
                            // MCP field configs expose no increment/precision setting.
                            form.inputs.last_mut().unwrap().field.settings.step = Some(0.5);
                        }
                    }
                }
                if page_only { form.mark_page_only(previous); }
                continue;
            }
            let current = if work {
                work_item["work_item_fields"]
                    .as_array()
                    .and_then(|rows| rows.iter().find(|f| f["key"] == key))
                    .map(|f| &f["value"])
                    .unwrap_or(&item["value"])
            } else {
                &item["value"]
            };
            let progress = !work && key == "node_progress";
            let route = if work {
                Route::WorkItem(key)
            } else {
                Route::Node(key)
            };
            let previous = form.inputs.len();
            if page_only {
                form.add_page_basic(config, label, route, current);
            } else {
                form.add_basic(config, label, needed.is_some(), route, current);
            }
            if progress && form.inputs.len() > previous {
                let field = &mut form.inputs.last_mut().unwrap().field;
                if field.kind != FieldKind::Number {
                    form.inputs.pop();
                    form.blocked.push("节点进度字段配置不是数字".into());
                    continue;
                }
                field.settings.initial_value = field.settings.initial_value.as_deref()
                    .and_then(|v| v.parse::<f64>().ok()).map(|n| (n * 100.0).to_string());
                field.settings.unit = Some("percent".into());
                field.settings.min = Some(0.0);
                field.settings.max = Some(100.0);
                field.settings.hint = Some("百分比，0～100；提交时转换为飞书的0～1".into());
            }
        }
        Ok(form)
    }

    fn mark_page_only(&mut self, from: usize) {
        for input in &mut self.inputs[from..] {
            input.field.required = false;
            input.field.settings.read_only = Some(true);
            input.field.settings.hint = Some("仅支持在飞书项目页面填写，当前显示云端值".into());
            // 使用独立身份保留旧版可编辑草稿；旧填写继续作为“本次不提交”内容展示。
            input.field.key = serde_json::to_string(&json!({"ReadOnly":&input.route})).unwrap();
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn add(
        &mut self,
        label: String,
        kind: FieldKind,
        required: bool,
        route: Route,
        initial_value: Option<String>,
        hint: Option<String>,
        min: Option<f64>,
        max: Option<f64>,
    ) {
        let key = serde_json::to_string(&route).expect("route serializes");
        self.inputs.push(Input {
            field: WorkflowField {
                key,
                label,
                kind,
                required,
                options: vec![],
                settings: FieldSettings {
                    initial_value,
                    scope: Some(match &route {
                        Route::WorkItem(_) => "work_item",
                        Route::Node(_) | Route::Schedule { owner: None, .. } => "node",
                        Route::Schedule { owner: Some(_), .. } | Route::Compound { .. } => "assignee",
                    }.into()),
                    hint,
                    min,
                    max,
                    ..FieldSettings::default()
                },
            },
            route,
            remote_type: String::new(),
        });
    }

    fn set_owner_column(&mut self, owner: Option<String>, column: String) {
        if let (Some(owner), Some(input)) = (owner, self.inputs.last_mut()) {
            input.field.settings.owner = Some(owner);
            input.field.settings.column = Some(column);
        }
    }

    pub fn plan(&self, values: &BTreeMap<String, String>) -> Result<UpdatePlan, BackendError> {
        let mut plan = UpdatePlan::default();
        let mut schedules: BTreeMap<Option<String>, Map<String, Value>> = BTreeMap::new();
        let mut compounds: BTreeMap<(bool, Vec<CompoundStep>), Vec<Value>> = BTreeMap::new();
        for input in &self.inputs {
            let field = &input.field;
            if field.settings.read_only == Some(true) {
                if values.contains_key(&field.key) {
                    return Err(BackendError::validation(format!("{}需在飞书页面填写，不能由本次操作修改", field.label)));
                }
                continue;
            }
            let raw = values.get(&field.key)
                .map(String::as_str)
                .or(field.settings.initial_value.as_deref())
                .unwrap_or("").trim();
            if raw.is_empty() {
                if field.required {
                    return Err(BackendError::validation(format!("请填写{}", field.label)));
                }
                continue;
            }
            if !values.contains_key(&field.key) {
                continue;
            }
            let value = match field.kind {
                FieldKind::Select => {
                    if !field.options.iter().any(|o| o.value == raw) {
                        return Err(BackendError::validation(format!(
                            "{}的值不在允许选项内",
                            field.label
                        )));
                    }
                    if input.remote_type == "bool" { json!(raw == "true") } else { json!(raw) }
                }
                FieldKind::Number => {
                    let number = raw
                        .parse::<f64>()
                        .ok()
                        .filter(|n| n.is_finite())
                        .ok_or_else(|| {
                            BackendError::validation(format!("{}需要有效数字", field.label))
                        })?;
                    if field.settings.min.is_some_and(|min| number < min)
                        || field.settings.max.is_some_and(|max| number > max)
                    {
                        return Err(BackendError::validation(format!(
                            "{}超出允许范围",
                            field.label
                        )));
                    }
                    json!(number)
                }
                FieldKind::Date => json!(date_ms(raw)?),
                _ => json!(raw),
            };
            let initial = field.settings.initial_value.as_deref().unwrap_or("").trim();
            if raw == initial || (field.kind == FieldKind::Number &&
                initial.parse::<f64>().is_ok_and(|old| value.as_f64() == Some(old))) {
                continue;
            }
            plan.fields.insert(field.key.clone(), raw.to_owned());
            match &input.route {
                Route::WorkItem(key) => plan
                    .work_fields
                    .push(json!({"field_key":key,"field_value":wire(&value)})),
                Route::Node(key) => {
                    let value = if key == "node_progress" {
                        json!(value.as_f64().unwrap() / 100.0)
                    } else {
                        value
                    };
                    plan.node_fields
                        .push(json!({"field_key":key,"field_value":wire(&value)}));
                }
                Route::Schedule { property, owner } => {
                    schedules
                        .entry(owner.clone())
                        .or_default()
                        .insert(property.clone(), value);
                }
                Route::Compound { work_item, path, field } => {
                    compounds.entry((*work_item, path.clone())).or_default().push(json!({
                        "field_key":field,"field_value":value,"field_type":input.remote_type,
                    }));
                }
            }
        }
        for ((work_item, path), mut fields) in compounds {
            for step in path.iter().rev() {
                let value = json!({"operation_type":1,"group_editor":step.owner,"sub_field_value":fields});
                fields = vec![json!({"field_key":step.field_key,"field_value":wire(&value),"field_type":"multi_user_compound_field"})];
            }
            if let Some(mut field) = fields.pop() {
                field.as_object_mut().unwrap().remove("field_type");
                plan.compound_fields.push((work_item, field));
            }
        }
        for (owner, mut value) in schedules {
            // 只改一个日期时，仍按最终完整排期校验，但不重写另一端的日期。
            let effective_date = |property: &str| -> Result<Option<i64>, BackendError> {
                if let Some(date) = value.get(property).and_then(Value::as_i64) {
                    return Ok(Some(date));
                }
                self.inputs.iter().find(|input| matches!(&input.route,
                    Route::Schedule { property: p, owner: o } if p == property && o == &owner))
                    .and_then(|input| input.field.settings.initial_value.as_deref())
                    .filter(|raw| !raw.trim().is_empty())
                    .map(date_ms).transpose()
            };
            if let (Some(start), Some(end)) = (
                effective_date("estimate_start_date")?,
                effective_date("estimate_end_date")?,
            ) {
                if start > end {
                    return Err(BackendError::validation("排期结束日期不能早于开始日期"));
                }
            }
            value.insert("clear_schedule".into(), json!(false));
            value.insert("is_auto".into(), json!(false));
            if let Some(owner) = owner {
                value.insert("owners".into(), json!([owner]));
                plan.schedules.push(Value::Object(value));
            } else {
                plan.node_schedule = Some(Value::Object(value));
            }
        }
        Ok(plan)
    }

    pub fn verify(
        &self,
        node: &Value,
        work: Option<&Value>,
        values: &BTreeMap<String, String>,
    ) -> Result<(), BackendError> {
        for input in &self.inputs {
            let Some(raw) = values
                .get(&input.field.key)
                .filter(|v| !v.trim().is_empty())
            else {
                continue;
            };
            let actual = match &input.route {
                Route::WorkItem(key) => work
                    .and_then(|w| w["work_item_fields"].as_array())
                    .and_then(|fs| fs.iter().find(|f| f["key"] == *key))
                    .map(|f| f["value"].clone()),
                Route::Node(key) => node["form_items"]
                    .as_array()
                    .and_then(|fs| fs.iter().find(|f| f["field_key"] == *key))
                    .map(|f| f["value"].clone()),
                Route::Schedule { property, owner } => schedule_source(node, owner.as_deref())
                    .map(|s| s[schedule_key(property)].clone()),
                Route::Compound { work_item, path, field } => {
                    let rows = if *work_item {
                        work.map(|work| &work["work_item_fields"]).unwrap_or(&Value::Null)
                    } else { &node["form_items"] };
                    let mut value = Value::Null;
                    for (index, step) in path.iter().enumerate() {
                        let parent = if index == 0 { schema::field_value(rows, &step.field_key) }
                            else { schema::field_value(&value, &step.field_key) };
                        let parent = schema::decoded(&parent)?;
                        value = parent.get(&step.owner).cloned().unwrap_or(Value::Null);
                    }
                    Some(schema::field_value(&value, field))
                }
            };
            let actual = actual.unwrap_or(Value::Null);
            let observed = if input.field.kind == FieldKind::Select {
                select_value(&actual)
            } else {
                text(&actual)
            };
            let matches = match input.field.kind {
                FieldKind::Number => {
                    let expected = raw.parse::<f64>().unwrap();
                    let expected = if matches!(&input.route,Route::Node(k) if k=="node_progress") {
                        expected / 100.0
                    } else {
                        expected
                    };
                    observed
                        .parse::<f64>()
                        .is_ok_and(|v| (v - expected).abs() < 1e-8)
                }
                FieldKind::Date => observed
                    .parse::<i64>()
                    .ok()
                    .and_then(|ms| {
                        FixedOffset::east_opt(8 * 3600)
                            .unwrap()
                            .timestamp_millis_opt(ms)
                            .single()
                    })
                    .is_some_and(|d| d.format("%Y-%m-%d").to_string() == raw.trim()),
                _ => observed.trim() == raw.trim(),
            };
            if !matches {
                let detail = if observed.trim().is_empty() {
                    format!("未读取到{}的有效云端值，尚不能确认字段已保存", input.field.label)
                } else {
                    format!("{}的回读值与本次填写不一致，尚不能确认字段已保存", input.field.label)
                };
                return Err(BackendError::unknown_result(detail));
            }
        }
        Ok(())
    }
}

trait IfEmpty {
    fn if_empty(self, fallback: &str) -> String;
}
impl IfEmpty for String {
    fn if_empty(self, fallback: &str) -> String {
        if self.is_empty() {
            fallback.into()
        } else {
            self
        }
    }
}
fn node_owner_keys(node: &Value, required: &Value) -> BTreeSet<String> {
    node["assignees"]["owners"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|owner| text(&owner["user_key"]))
        .chain(
            node["assignee_schedule_list"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|row| text(&row["assignee"]["user_key"])),
        )
        .chain(
            ["node_fields", "form_items"]
                .into_iter()
                .flat_map(|container| required[container].as_array().into_iter().flatten())
                .flat_map(|field| field["not_finished_owner"].as_array().into_iter().flatten())
                .map(text),
        )
        .filter(|key| !key.is_empty())
        .collect()
}

fn owner_name(node: &Value, work_item: &Value, key: &str) -> Option<String> {
    node["assignees"]["owners"]
        .as_array()
        .into_iter()
        .flatten()
        .chain(
            node["assignee_schedule_list"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|r| &r["assignee"]),
        )
        .chain(
            work_item["work_item_attribute"]["role_members"]
                .as_array()
                .into_iter()
                .flatten()
                .flat_map(|role| role["members"].as_array().into_iter().flatten()),
        )
        .chain(
            work_item["work_item_current_node"]
                .as_array()
                .into_iter()
                .flatten()
                .flat_map(|node| node["owners"].as_array().into_iter().flatten()),
        )
        .chain(
            work_item["work_item_fields"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|field| field["key"] == "current_status_operator")
                .flat_map(|field| field["value"].as_array().into_iter().flatten()),
        )
        .filter(|user| text(&user["user_key"]) == key || text(&user["key"]) == key)
        .find_map(|user| user["name"].as_str().map(str::trim).filter(|name| !name.is_empty()))
        .map(str::to_owned)
}
fn schedule_source<'a>(node: &'a Value, owner: Option<&str>) -> Option<&'a Value> {
    if let Some(owner) = owner {
        node["assignee_schedule_list"]
            .as_array()
            .and_then(|rows| rows.iter().find(|r| r["assignee"]["user_key"] == owner))
            .map(|r| &r["schedule_info"])
    } else {
        node.get("schedule")
    }
}
fn schedule_key(property: &str) -> &str {
    match property {
        "estimate_start_date" => "estimate_start_time",
        "estimate_end_date" => "estimate_finish_time",
        other => other,
    }
}
fn wire(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| value.to_string())
}
fn date_ms(raw: &str) -> Result<i64, BackendError> {
    let date = NaiveDate::parse_from_str(raw, "%Y-%m-%d")
        .map_err(|_| BackendError::validation("日期格式需要为年-月-日"))?;
    Ok(FixedOffset::east_opt(8 * 3600)
        .unwrap()
        .from_local_datetime(&date.and_hms_opt(0, 0, 0).unwrap())
        .single()
        .unwrap()
        .timestamp_millis())
}

#[derive(Debug, Default)]
pub(super) struct UpdatePlan {
    pub fields: BTreeMap<String, String>,
    pub work_fields: Vec<Value>,
    pub node_fields: Vec<Value>,
    pub node_schedule: Option<Value>,
    pub schedules: Vec<Value>,
    compound_fields: Vec<(bool, Value)>,
}
impl UpdatePlan {
    pub fn has_work_fields(&self) -> bool {
        !self.work_fields.is_empty() || self.compound_fields.iter().any(|(work, _)| *work)
    }
    pub fn calls(
        &self,
        project: &str,
        id: &str,
        node: &str,
    ) -> Vec<(&'static str, Map<String, Value>)> {
        let mut calls = Vec::new();
        if !self.work_fields.is_empty() {
            calls.push((
                crate::mcp::feishu::TOOL_UPDATE_FIELD,
                json!({"project_key":project,"work_item_id":id,"fields":self.work_fields})
                    .as_object()
                    .unwrap()
                    .clone(),
            ));
        }
        if !self.node_fields.is_empty()
            || self.node_schedule.is_some()
            || !self.schedules.is_empty()
        {
            let mut args = json!({"project_key":project,"work_item_id":id,"node_id":node})
                .as_object()
                .unwrap()
                .clone();
            if !self.node_fields.is_empty() {
                args.insert("fields".into(), json!(self.node_fields));
            }
            if let Some(s) = &self.node_schedule {
                args.insert("node_schedule".into(), s.clone());
            }
            if !self.schedules.is_empty() {
                args.insert("schedules".into(), json!(self.schedules));
            }
            calls.push((crate::mcp::feishu::TOOL_UPDATE_NODE, args));
        }
        // 同一根字段的不同负责人分别发送增量操作，避免字段 key 重复时被远端覆盖。
        for (work, field) in &self.compound_fields {
            let mut args = json!({"project_key":project,"work_item_id":id,"fields":[field]})
                .as_object().unwrap().clone();
            let tool = if *work { crate::mcp::feishu::TOOL_UPDATE_FIELD } else {
                args.insert("node_id".into(), json!(node));
                crate::mcp::feishu::TOOL_UPDATE_NODE
            };
            calls.push((tool, args));
        }
        calls
    }
}

#[cfg(test)]
#[path = "workflow_generic_tests.rs"]
mod generic_tests;

#[cfg(test)]
mod tests {
    use super::*;
    fn state_form(value: Value) -> NodeForm {
        NodeForm::build_state(
            &json!({"confirm_form":[{"class":"field","key":"result","name":"解决结果"}]}),
            &json!({"form_items":[{"class":"field","key":"result","finished":false,"field_type_key":"select"}]}),
            &[json!({"field_key":"result","field_name":"解决结果","field_type":"select","option":[
                {"option_id":"fixed","option_name":"已修复"},
                {"option_id":"unreproducible","option_name":"无法复现"}
            ]})],
            &json!({"work_item_fields":[{"key":"result","value":value}]}),
        ).unwrap()
    }

    #[test]
    fn state_select_uses_remote_options_and_work_item_route() {
        let form = state_form(json!({"label":"无法复现","value":"unreproducible"}));
        assert!(form.blocked.is_empty());
        let field = &form.fields()[0];
        assert_eq!(field.label, "解决结果");
        assert_eq!(field.kind, FieldKind::Select);
        assert!(field.required);
        assert_eq!(field.settings.scope.as_deref(), Some("work_item"));
        assert_eq!(field.options[0].label, "已修复");
        assert_eq!(
            field.settings.initial_value.as_deref(),
            Some("unreproducible")
        );
        let values = BTreeMap::from([(field.key.clone(), "fixed".into())]);
        let calls = form.plan(&values).unwrap().calls("p", "1", "RESOLVED");
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, "update_field");
        assert_eq!(
            calls[0].1["fields"],
            json!([{"field_key":"result","field_value":"fixed"}])
        );
        assert!(!calls[0].1.contains_key("node_id"));
        for invalid in ["", "已修复", "not-an-option"] {
            assert!(form
                .plan(&BTreeMap::from([(field.key.clone(), invalid.into())]))
                .is_err());
        }
    }

    #[test]
    fn state_select_readback_checks_id_instead_of_label() {
        let form = state_form(Value::Null);
        let values = BTreeMap::from([(form.fields()[0].key.clone(), "fixed".into())]);
        for value in [json!("fixed"), json!({"label":"已修复","value":"fixed"})] {
            assert!(form
                .verify(
                    &Value::Null,
                    Some(&json!({"work_item_fields":[{"key":"result","value":value}]})),
                    &values
                )
                .is_ok());
        }
        for value in [
            Value::Null,
            json!("已修复"),
            json!({"label":"已修复","value":"wrong"}),
        ] {
            assert!(form
                .verify(
                    &Value::Null,
                    Some(&json!({"work_item_fields":[{"key":"result","value":value}]})),
                    &values
                )
                .is_err());
        }
    }

    #[test]
    fn state_fields_cover_text_number_date_and_completed_items() {
        let form = NodeForm::build_state(
            &json!({"confirm_form":[]}),
            &json!({"form_items":[{"key":"note"},{"key":"count"},{"key":"due"},{"key":"done","finished":true}]}),
            &[
                json!({"field_key":"note","field_name":"说明","field_type":"multi-text"}),
                json!({"field_key":"count","field_type":"number"}),
                json!({"field_key":"due","field_type":"date"}),
            ], &json!({}),
        ).unwrap();
        assert!(form.blocked.is_empty());
        assert_eq!(form.fields().len(), 3);
        let values = form
            .inputs
            .iter()
            .map(|i| {
                let v = match i.field.kind {
                    FieldKind::Number => "0",
                    FieldKind::Date => "2026-10-20",
                    _ => "处理说明",
                };
                (i.field.key.clone(), v.into())
            })
            .collect();
        let plan = form.plan(&values).unwrap();
        assert_eq!(plan.work_fields.len(), 3);
        assert!(plan
            .work_fields
            .iter()
            .any(|f| f["field_key"] == "due" && f["field_value"] == "1792425600000"));
        assert!(form.verify(&Value::Null, Some(&json!({"work_item_fields":[
            {"key":"note","value":"处理说明"},{"key":"count","value":0},{"key":"due","value":1792425600000i64}
        ]})), &values).is_ok());
    }

    #[test]
    fn unsupported_state_fields_and_incomplete_options_remain_blocked() {
        let required = json!({"form_items":[{"key":"r","class":"field"}]});
        for config in [
            json!({"field_key":"r","field_type":"file"}),
            json!({"field_key":"r","field_type":"select"}),
            json!({"field_key":"r","field_type":"select","option":[{"option_name":"missing id"}]}),
            json!({"field_key":"r","field_type":"select","option":[{"option_id":"a","option_name":"甲"},{"option_id":"a","option_name":"乙"}]}),
        ] {
            let form = NodeForm::build_state(&json!({}), &required, &[config], &json!({})).unwrap();
            assert_eq!(form.blocked.len(), 1);
            assert!(form.fields().is_empty());
        }
        for required in [
            json!({"form_items":[{"key":"r","class":"role"}]}),
            json!({"node_fields":[{"field_key":"r"}]}),
        ] {
            let form = NodeForm::build_state(
                &json!({}),
                &required,
                &[json!({"field_key":"r","field_type":"text"})],
                &json!({}),
            )
            .unwrap();
            assert_eq!(form.blocked.len(), 1);
            assert!(form.fields().is_empty());
        }
        assert!(
            NodeForm::build_state(&json!({}), &json!({"form_items":[{}]}), &[], &json!({}))
                .is_err()
        );
        assert!(
            NodeForm::build_state(&json!({}), &json!({}), &[], &json!({}))
                .unwrap()
                .fields()
                .is_empty()
        );
    }
    fn example() -> (Value, Value, Vec<Value>, Vec<Value>) {
        (
            json!({"assignees":{"owners":[{"user_key":"a","name":"甲"},{"user_key":"b","name":"乙"}]},"form_items":[
                {"field_key":"point","field_name":"估分","form_item_type":"node_field"},
                {"field_key":"schedule","field_name":"排期","form_item_type":"node_field"},
                {"field_key":"actual_work_time","field_name":"实际工时","form_item_type":"node_field"},
                {"field_key":"node_progress","field_name":"进度","value":"0.5","form_item_type":"node_field"},
                {"field_key":"doc-key","field_name":"前端设计文档","form_item_type":"field"}
            ]}),
            json!({"node_fields":[
            {"field_key":"point","finished":false,"not_finished_owner":["a"]},
            {"field_key":"schedule","finished":false,"not_finished_owner":["a"]},
            {"field_key":"actual_work_time","finished":false,"not_finished_owner":["a","b"]},
            {"field_key":"node_progress","finished":false}
        ],"form_items":[{"key":"doc-key","finished":false}]}),
            vec![
                json!({"field_key":"point","field_type":"number"}),
                json!({"field_key":"schedule","field_type":"schedule"}),
                json!({"field_key":"actual_work_time","field_type":"number"}),
                json!({"field_key":"node_progress","field_type":"number"}),
            ],
            vec![json!({"field_key":"doc-key","field_type":"text"})],
        )
    }
    fn values(form: &NodeForm) -> BTreeMap<String, String> {
        form.inputs
            .iter()
            .filter(|input| input.field.settings.read_only != Some(true))
            .map(|i| {
                let value = match &i.route {
                    Route::WorkItem(_) => "https://example.test/design",
                    Route::Schedule { property, .. } if property == "estimate_start_date" => {
                        "2026-10-20"
                    }
                    Route::Schedule { property, .. } if property == "estimate_end_date" => {
                        "2026-10-21"
                    }
                    Route::Node(_) => "75",
                    _ => "2",
                };
                (i.field.key.clone(), value.into())
            })
            .collect()
    }
    #[test]
    fn progress_controls_and_estimate_increment_follow_field_identity() {
        let (mut node, required, nc, wc) = example();
        // Captions are editable; controls must follow the field key.
        node["form_items"][0]["field_name"] = json!("总估分");
        node["form_items"][3]["field_name"] = json!("完成比例");
        let form = NodeForm::build(&node, &required, &nc, &wc, &json!({})).unwrap();
        for input in &form.inputs {
            let encoded = serde_json::to_value(&input.field).unwrap();
            match &input.route {
                Route::Node(key) if key == "node_progress" => {
                    assert_eq!(encoded["unit"], "percent");
                    assert_eq!(encoded["min"], 0.0);
                    assert_eq!(encoded["max"], 100.0);
                }
                Route::Schedule { property, .. } if property == "points" => {
                    assert_eq!(encoded["step"], 0.5);
                    assert!(encoded.get("unit").is_none());
                }
                _ => {
                    assert!(encoded.get("unit").is_none());
                    assert!(encoded.get("step").is_none());
                }
            }
        }
        let progress = form
            .inputs
            .iter()
            .find(|i| i.field.settings.unit.is_some())
            .unwrap();
        for (display, wire_value) in [("0", "0.0"), ("62.5", "0.625"), ("100", "1.0")] {
            let mut values = values(&form);
            values.insert(progress.field.key.clone(), display.into());
            assert_eq!(
                form.plan(&values).unwrap().node_fields[0]["field_value"],
                wire_value
            );
        }
    }

    #[test]
    fn five_fields_route_to_correct_tools_and_each_owner_is_explicit() {
        let (node, required, nc, wc) = example();
        let form = NodeForm::build(&node, &required, &nc, &wc, &json!({})).unwrap();
        assert_eq!(form.blocked, vec!["实际工时"]);
        assert!(form.fields().iter().any(|f| f.label == "实际工时 · 乙"));
        for input in &form.inputs {
            let scope = match &input.route {
                Route::WorkItem(_) => "work_item",
                Route::Node(_) | Route::Schedule { owner: None, .. } => "node",
                Route::Schedule { owner: Some(_), .. } | Route::Compound { .. } => "assignee",
            };
            assert_eq!(input.field.settings.scope.as_deref(), Some(scope));
        }
        let plan = form.plan(&values(&form)).unwrap();
        let calls = plan.calls("p", "123", "node1");
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].0, "update_field");
        assert_eq!(calls[0].1["fields"][0]["field_key"], "doc-key");
        assert_eq!(calls[1].0, "update_node");
        assert_eq!(calls[1].1["fields"][0]["field_value"], "0.75");
        let schedules = calls[1].1["schedules"].as_array().unwrap();
        assert_eq!(schedules.len(), 1);
        assert_eq!(schedules[0]["owners"], json!(["a"]));
        assert_eq!(schedules[0]["clear_schedule"], false);
        assert_eq!(schedules[0]["is_auto"], false);
        assert!(
            schedules[0].get("actual_work_time").is_none(),
            "实际工时是只读云端值，不得随排期写入"
        );
        assert_eq!(schedules[0]["estimate_start_date"], 1792425600000i64);
    }
    #[test]
    fn owner_fields_expose_owner_and_column_without_touching_other_fields() {
        let (node, required, nc, wc) = example();
        let form = NodeForm::build(&node, &required, &nc, &wc, &json!({})).unwrap();
        let fields = form.fields();
        let layout = |label: &str| {
            let field = fields.iter().find(|f| f.label == label).unwrap();
            (field.settings.owner.as_deref(), field.settings.column.as_deref())
        };
        assert_eq!(layout("实际工时 · 甲"), (Some("甲"), Some("实际工时")));
        assert_eq!(layout("实际工时 · 乙"), (Some("乙"), Some("实际工时")));
        assert_eq!(layout("估分 · 甲"), (Some("甲"), Some("估分")));
        assert_eq!(layout("排期 · 甲 · 开始日期"), (Some("甲"), Some("排期 · 开始日期")));
        assert_eq!(layout("排期 · 甲 · 结束日期"), (Some("甲"), Some("排期 · 结束日期")));
        assert_eq!(layout("进度"), (None, None));
        assert_eq!(layout("前端设计文档"), (None, None));
        let encoded = serde_json::to_value(&fields).unwrap();
        for field in encoded.as_array().unwrap() {
            assert_eq!(field.get("owner").is_some(), field["scope"] == "assignee");
            assert_eq!(field.get("column").is_some(), field["scope"] == "assignee");
        }
    }
    #[test]
    fn remote_values_prefill_work_fields_progress_and_each_owner() {
        let (mut node, required, nc, wc) = example();
        node["form_items"][4]["value"] = json!("旧文档");
        node["schedule"] = json!({"points":99,"actual_work_time":99});
        node["assignee_schedule_list"] = json!([
            {"assignee":{"user_key":"a"},"schedule_info":{
                "points":1,"actual_work_time":0,
                "estimate_start_time":1792684800000i64,"estimate_finish_time":"1792771200000"
            }}
        ]);
        let work =
            json!({"work_item_fields":[{"key":"doc-key","value":"https://example.test/current"}]});
        let form = NodeForm::build(&node, &required, &nc, &wc, &work).unwrap();
        let fields = form.fields();
        for (label, expected) in [
            ("前端设计文档", "https://example.test/current"),
            ("进度", "50"),
            ("估分 · 甲", "1"),
            ("实际工时 · 甲", "0"),
            ("实际工时 · 乙", ""),
            ("排期 · 甲 · 开始日期", "2026-10-23"),
            ("排期 · 甲 · 结束日期", "2026-10-24"),
        ] {
            assert_eq!(
                fields
                    .iter()
                    .find(|f| f.label == label)
                    .unwrap()
                    .settings
                    .initial_value
                    .as_deref(),
                Some(expected)
            );
        }
        let form = NodeForm::build(
            &node,
            &required,
            &nc,
            &wc,
            &json!({
                "work_item_fields":[{"key":"doc-key","value":null}]
            }),
        )
        .unwrap();
        assert_eq!(
            form.fields()
                .iter()
                .find(|f| f.label == "前端设计文档")
                .unwrap()
                .settings
                .initial_value
                .as_deref(),
            Some("")
        );
    }

    #[test]
    fn node_schedule_prefills_partial_dates_and_does_not_rewrite_unchanged_values() {
        let (mut node, mut required, nc, wc) = example();
        for row in required["node_fields"].as_array_mut().unwrap() {
            row.as_object_mut().unwrap().remove("not_finished_owner");
        }
        node["schedule"] =
            json!({"points":0,"actual_work_time":"2.5","estimate_start_time":"1792684800000"});
        let form = NodeForm::build(&node, &required, &nc, &wc, &json!({})).unwrap();
        let fields = form.fields();
        for (label, expected) in [
            ("估分", "0"),
            ("实际工时", "2.5"),
            ("排期 · 开始日期", "2026-10-23"),
            ("排期 · 结束日期", ""),
        ] {
            assert_eq!(
                fields
                    .iter()
                    .find(|f| f.label == label)
                    .unwrap()
                    .settings
                    .initial_value
                    .as_deref(),
                Some(expected)
            );
        }
        node["schedule"]["estimate_finish_time"] = json!(1792771200000i64);
        let form = NodeForm::build(&node, &required, &nc, &wc, &json!({})).unwrap();
        let mut values = values(&form);
        for input in &form.inputs {
            if matches!(input.route, Route::Schedule { .. }) && input.field.settings.read_only != Some(true) {
                values.insert(
                    input.field.key.clone(),
                    input.field.settings.initial_value.clone().unwrap(),
                );
            }
        }
        let plan = form.plan(&values).unwrap();
        assert!(plan.node_schedule.is_none());
    }

    #[test]
    fn completed_summary_fields_stay_editable_and_submit_replacements() {
        let node = json!({"form_items":[],"schedule":{
            "points":1,"actual_work_time":0,
            "estimate_start_time":1792684800000i64,"estimate_finish_time":1792684800000i64
        }});
        let (_, _, nc, _) = example();
        // unfinished 模式不再返回已填写的字段，节点汇总区也没有 form_items。
        let form = NodeForm::build(&node, &json!({}), &nc, &[], &json!({})).unwrap();
        assert_eq!(form.fields().len(), 4);
        let mut values = BTreeMap::new();
        for field in form.fields() {
            assert!(!field.required);
            if field.settings.read_only == Some(true) {
                assert_eq!(field.label, "actual_work_time");
                continue;
            }
            let value = match field.label.as_str() {
                "point" => "2.5",
                "schedule · 开始日期" => "2026-10-24",
                "schedule · 结束日期" => "2026-10-25",
                _ => panic!("unexpected field: {}", field.label),
            };
            assert!(!field.settings.initial_value.as_deref().unwrap().is_empty());
            values.insert(field.key, value.into());
        }
        let plan = form.plan(&values).unwrap();
        let schedule = plan.node_schedule.as_ref().unwrap();
        assert_eq!(schedule["points"].as_f64(), Some(2.5));
        assert!(schedule.get("actual_work_time").is_none());
        assert_eq!(schedule["estimate_start_date"], 1792771200000i64);
        assert_eq!(schedule["estimate_end_date"], 1792857600000i64);
    }

    #[test]
    fn completed_and_missing_owners_are_shown_without_copying_totals() {
        let (mut node, mut required, nc, wc) = example();
        node["schedule"] = json!({"points":99,"actual_work_time":99});
        node["assignee_schedule_list"] = json!([
            {"assignee":{"user_key":"a"},"schedule_info":{
                "points":1,"actual_work_time":0,
                "estimate_start_time":1792684800000i64,"estimate_finish_time":1792684800000i64
            }}
        ]);
        required["node_fields"] = json!([
            {"field_key":"actual_work_time","not_finished_owner":["b"]},
            {"field_key":"node_progress"}
        ]);
        let form = NodeForm::build(&node, &required, &nc, &wc, &json!({})).unwrap();
        let fields = form.fields();
        for (label, expected) in [
            ("估分 · 甲", "1"),
            ("实际工时 · 甲", "0"),
            ("排期 · 甲 · 开始日期", "2026-10-23"),
        ] {
            let field = fields.iter().find(|f| f.label == label).unwrap();
            assert!(!field.required);
            assert_eq!(field.settings.initial_value.as_deref(), Some(expected));
        }
        let missing = fields.iter().find(|f| f.label == "实际工时 · 乙").unwrap();
        assert!(!missing.required);
        assert_eq!(missing.settings.read_only, Some(true));
        assert_eq!(form.blocked, vec!["实际工时"]);
        assert_eq!(missing.settings.initial_value.as_deref(), Some(""));
        assert!(!fields
            .iter()
            .any(|f| f.settings.initial_value.as_deref() == Some("99")));
        let empty = NodeForm::build(&json!({}), &json!({}), &nc, &[], &json!({})).unwrap();
        assert!(
            empty.fields().is_empty(),
            "没有配置值的汇总字段不凭空生成输入框"
        );
    }

    #[test]
    fn personal_schedule_identity_survives_missing_owner_metadata_and_finished_requirements() {
        let configs = vec![
            json!({"field_key":"actual_work_time","field_name":"实际工时","field_type":"number"}),
            json!({"field_key":"schedule","field_name":"排期","field_type":"schedule"}),
        ];
        for owners in [vec!["a"], vec!["a", "b"]] {
            let node = json!({
                "assignees":{"owners":owners.iter().map(|owner| json!({"user_key":owner})).collect::<Vec<_>>()},
                "assignee_schedule_list":owners.iter().map(|owner| json!({
                    "assignee":{"user_key":owner}, "schedule_info":{
                        "actual_work_time":null,"estimate_start_time":null,"estimate_finish_time":null
                    }
                })).collect::<Vec<_>>(),
                "form_items":[
                    {"field_key":"actual_work_time","form_item_type":"node_field"},
                    {"field_key":"schedule","form_item_type":"node_field"}
                ],
                "schedule":{"actual_work_time":99,"estimate_start_time":1792684800000i64,"estimate_finish_time":1792771200000i64}
            });
            let mut previous_keys = None;
            for owner_metadata in [None, Some(json!([])), Some(json!(owners)), Some(json!([owners[0]]))] {
                let mut required = json!({"node_fields":[
                    {"field_key":"actual_work_time"}, {"field_key":"schedule"}
                ]});
                if let Some(owner_metadata) = owner_metadata {
                    for field in required["node_fields"].as_array_mut().unwrap() {
                        field["not_finished_owner"] = owner_metadata.clone();
                    }
                }
                let form = NodeForm::build(&node, &required, &configs, &[], &json!({})).unwrap();
                let fields = form.fields();
                assert_eq!(fields.len(), owners.len() * 3);
                assert!(fields.iter().all(|field| field.settings.scope.as_deref() == Some("assignee")));
                assert!(fields.iter().all(|field| field.settings.initial_value.as_deref() == Some("")),
                    "个人空值不得沿用节点总排期");
                let keys = fields.iter().map(|field| field.key.clone()).collect::<Vec<_>>();
                if let Some(previous) = &previous_keys { assert_eq!(&keys, previous); }
                previous_keys = Some(keys);
            }
            let form = NodeForm::build(&node, &json!({}), &configs, &[], &json!({})).unwrap();
            assert_eq!(form.fields().iter().map(|field| field.key.clone()).collect::<Vec<_>>(), previous_keys.unwrap());
            assert!(form.fields().iter().all(|field| !field.required));
            let submitted = form.inputs.iter().filter(|input| input.field.settings.read_only != Some(true)).map(|input| {
                let value = match &input.route {
                    Route::Schedule { property, .. } if property == "actual_work_time" => "1",
                    Route::Schedule { property, .. } if property == "estimate_start_date" => "2026-10-27",
                    _ => "2026-10-28",
                };
                (input.field.key.clone(), value.into())
            }).collect();
            let plan = form.plan(&submitted).unwrap();
            assert!(plan.node_schedule.is_none());
            assert_eq!(plan.schedules.len(), owners.len());
            for (schedule, owner) in plan.schedules.iter().zip(&owners) {
                assert_eq!(schedule["owners"], json!([owner]));
                assert!(schedule.get("actual_work_time").is_none());
                assert_eq!(schedule["estimate_start_date"], 1793030400000i64);
                assert_eq!(schedule["estimate_end_date"], 1793116800000i64);
            }
            assert!(form.verify(&node, None, &submitted).is_err(),
                "必填清单消失不代表个人排期已保存");
        }
    }

    #[test]
    fn total_schedule_is_used_only_without_personal_schedule_scope() {
        let configs = vec![json!({"field_key":"actual_work_time","field_type":"number"})];
        let node = json!({"form_items":[{"field_key":"actual_work_time"}],"schedule":{"actual_work_time":2}});
        for required in [
            json!({"node_fields":[{"field_key":"actual_work_time"}]}),
            json!({"node_fields":[{"field_key":"actual_work_time","not_finished_owner":[]}]}),
            json!({}),
        ] {
            let form = NodeForm::build(&node, &required, &configs, &[], &json!({})).unwrap();
            assert_eq!(form.fields().len(), 1);
            let field = &form.fields()[0];
            assert_eq!(field.settings.scope.as_deref(), Some("node"));
            assert_eq!(field.settings.initial_value.as_deref(), Some("2"));
            assert_eq!(field.settings.read_only, Some(true));
            assert!(form.plan(&BTreeMap::from([(field.key.clone(), "3".into())])).is_err());
            let plan = form.plan(&BTreeMap::new()).unwrap();
            assert!(plan.node_schedule.is_none());
            assert!(plan.schedules.is_empty());
        }
        let personal = json!({
            "assignee_schedule_list":[{"assignee":{"user_key":"a"},"schedule_info":{"actual_work_time":null}}],
            "schedule":{"actual_work_time":99}
        });
        assert!(NodeForm::build(&personal, &json!({}), &configs, &[], &json!({})).unwrap().fields().is_empty(),
            "只有个人归属但未配置的空字段不得被节点总值替代");
        assert!(NodeForm::build(&json!({}), &json!({}), &configs, &[], &json!({})).unwrap().fields().is_empty());
    }

    #[test]
    fn sole_owner_is_omitted_from_labels_but_preserved_in_submission() {
        let owner = "7629164372933233864";
        let nc =
            vec![json!({"field_key":"point","field_name":"自定义估分名称","field_type":"number"})];
        for required in [
            json!({}),
            json!({"node_fields":[{"field_key":"point","not_finished_owner":[owner]}]}),
        ] {
            let node = json!({
                "assignees":{"owners":[{"user_key":owner}]},
                "assignee_schedule_list":[{"assignee":{"user_key":owner},"schedule_info":{"points":1}}]
            });
            let form = NodeForm::build(&node, &required, &nc, &[], &json!({})).unwrap();
            let fields = form.fields();
            assert_eq!(fields.len(), 1);
            assert_eq!(fields[0].label, "自定义估分名称");
            let values = BTreeMap::from([(fields[0].key.clone(), "2.5".into())]);
            let plan = form.plan(&values).unwrap();
            assert_eq!(plan.schedules[0]["owners"], json!([owner]));
            assert_eq!(plan.schedules[0]["points"].as_f64(), Some(2.5));
        }
    }
    #[test]
    fn multiple_owners_use_detail_names_without_changing_routes_or_readback() {
        let owners = ["7623993469052193756", "7623999881966783446"];
        let (mut node, mut required, nc, wc) = example();
        node["assignees"]["owners"] = json!([
            {"user_key":owners[1]}, {"user_key":owners[0]}
        ]);
        for row in required["node_fields"].as_array_mut().unwrap() {
            if row["field_key"] != "node_progress" {
                row["not_finished_owner"] = json!(owners);
            }
        }
        let work = json!({"work_item_attribute":{"role_members":[
            {"key":"backend","name":"后端负责人","members":[
                {"key":owners[1],"name":"李四"}, {"key":owners[0],"name":"张三"}
            ]}
        ]}});
        let form = NodeForm::build(&node, &required, &nc, &wc, &work).unwrap();
        assert_eq!(form.blocked, vec!["实际工时"]);
        let fields = form.fields();
        for name in ["张三", "李四"] {
            for caption in ["估分", "排期"] {
                let label = format!("{caption} · {name}");
                assert!(fields.iter().any(|f| f.required && f.label.starts_with(&label)));
            }
        }
        assert!(fields.iter().all(|f| owners.iter().all(|id| !f.label.contains(id))));
        let mut submitted = values(&form);
        for input in &form.inputs {
            if let Route::Schedule { property, owner: Some(owner) } = &input.route {
                if property == "points" {
                    submitted.insert(input.field.key.clone(), if owner == owners[0] { "2" } else { "3" }.into());
                }
            }
        }
        let plan = form.plan(&submitted).unwrap();
        assert_eq!(plan.schedules.len(), 2);
        for (index, owner) in owners.iter().enumerate() {
            let schedule = &plan.schedules[index];
            assert_eq!(schedule["owners"], json!([owner]));
            assert!(schedule.get("actual_work_time").is_none());
            assert_eq!(schedule["points"], json!((index + 2) as f64));
            assert_eq!(schedule["estimate_start_date"], 1792425600000i64);
            assert_eq!(schedule["estimate_end_date"], 1792512000000i64);
        }
        node["form_items"][3]["value"] = json!("0.75");
        node["assignee_schedule_list"] = json!(owners.iter().enumerate().map(|(index, owner)| json!({
            "assignee":{"user_key":owner}, "schedule_info":{
                "points": index + 2, "actual_work_time": index + 2,
                "estimate_start_time":1792425600000i64, "estimate_finish_time":1792512000000i64
            }
        })).collect::<Vec<_>>());
        let updated_work = json!({"work_item_fields":[{"key":"doc-key","value":"https://example.test/design"}]});
        assert!(form.verify(&node, Some(&updated_work), &submitted).is_ok());
        node["assignee_schedule_list"][1]["schedule_info"]["points"] = json!(2);
        assert!(form.verify(&node, Some(&updated_work), &submitted).is_err());
    }

    #[test]
    fn owner_names_skip_empty_matches_and_resolve_known_person_containers() {
        let node = json!({"assignees":{"owners":[{"user_key":"a","name":" "}]}});
        for work in [
            json!({"work_item_attribute":{"role_members":[{"members":[{"key":"a","name":"甲"}]}]}}),
            json!({"work_item_current_node":[{"owners":[{"key":"a","name":"甲"}]}]}),
            json!({"work_item_fields":[{"key":"current_status_operator","value":[{"key":"a","name":"甲"}]}]}),
        ] {
            assert_eq!(owner_name(&node, &work, "a").as_deref(), Some("甲"));
            assert_eq!(owner_name(&node, &work, "unknown"), None);
        }
        let mut node = node;
        node["assignee_schedule_list"] = json!([{"assignee":{"user_key":"a","name":"甲"}}]);
        assert_eq!(owner_name(&node, &json!({}), "a").as_deref(), Some("甲"));
        node["assignees"]["owners"][0]["name"] = json!("节点姓名");
        assert_eq!(owner_name(&node, &json!({}), "a").as_deref(), Some("节点姓名"));
    }

    #[test]
    fn unnamed_owners_have_stable_short_labels_and_distinct_write_targets() {
        let owners = ["7623993469052193756", "7623999881966783446"];
        let required = json!({"node_fields":[{"field_key":"point","not_finished_owner":owners}]});
        let config = [json!({"field_key":"point","field_name":"估分","field_type":"number"})];
        let node = json!({"assignees":{"owners":[{"user_key":owners[1]},{"user_key":owners[0]}]}});
        let form = NodeForm::build(&node, &required, &config, &[], &json!({})).unwrap();
        assert_eq!(form.fields().iter().map(|f| f.label.as_str()).collect::<Vec<_>>(), ["估分 · 负责人 1", "估分 · 负责人 2"]);
        let plan = form.plan(&BTreeMap::from([
            (form.fields()[0].key.clone(), "1".into()),
            (form.fields()[1].key.clone(), "2".into()),
        ])).unwrap();
        for (index, owner) in owners.iter().enumerate() {
            assert_eq!(plan.schedules[index]["owners"], json!([owner]));
        }
        let reordered = json!({"assignees":{"owners":[{"user_key":owners[0]},{"user_key":owners[1]}]}});
        let next = NodeForm::build(&reordered, &required, &config, &[], &json!({})).unwrap();
        assert_eq!(serde_json::to_value(form.fields()).unwrap(), serde_json::to_value(next.fields()).unwrap());
    }

    #[test]
    fn invalid_number_progress_and_date_range_fail_before_plan() {
        let (n, r, nc, wc) = example();
        let form = NodeForm::build(&n, &r, &nc, &wc, &json!({})).unwrap();
        let mut v = values(&form);
        let progress = form
            .inputs
            .iter()
            .find(|i| matches!(&i.route,Route::Node(k) if k=="node_progress"))
            .unwrap();
        v.insert(progress.field.key.clone(), "101".into());
        assert!(form.plan(&v).is_err());
        v.insert(progress.field.key.clone(), "NaN".into());
        assert!(form.plan(&v).is_err());
        v = values(&form);
        let start=form.inputs.iter().find(|i|matches!(&i.route,Route::Schedule{property,..} if property=="estimate_start_date")).unwrap();
        v.insert(start.field.key.clone(), "2026-10-30".into());
        assert!(form.plan(&v).is_err());
        v.insert(start.field.key.clone(), "".into());
        assert!(form.plan(&v).is_err());
    }
    #[test]
    fn unsupported_required_fields_remain_blocked_and_malformed_is_error() {
        let n = json!({"form_items":[]});
        let r = json!({"node_fields":[{"field_key":"attachment","finished":false}]});
        let form = NodeForm::build(
            &n,
            &r,
            &[json!({"field_key":"attachment","field_type":"file"})],
            &[],
            &json!({}),
        )
        .unwrap();
        assert_eq!(form.blocked.len(), 1);
        assert!(NodeForm::build(&n, &json!({"node_fields":[{}]}), &[], &[], &json!({})).is_err());
    }
    #[test]
    fn schedule_readback_distinguishes_missing_values_from_mismatch_and_preserves_owner_scope() {
        let configs = [json!({"field_key":"actual_work_time","field_name":"实际工时","field_type":"number"})];
        let node = json!({
            "assignees":{"owners":[{"user_key":"owner"}]},
            "assignee_schedule_list":[{"assignee":{"user_key":"owner"},"schedule_info":{"actual_work_time":0}}]
        });
        let form = NodeForm::build(&node, &json!({}), &configs, &[], &json!({})).unwrap();
        let key = form.fields()[0].key.clone();
        let expected = BTreeMap::from([(key.clone(), "1".into())]);
        for actual in [Value::Null, json!(""), json!("   "), json!(2)] {
            let mut readback = node.clone();
            readback["assignee_schedule_list"][0]["schedule_info"]["actual_work_time"] = actual.clone();
            // 同值的总工时或其他负责人不能代替本次负责人的回读结果。
            readback["schedule"] = json!({"actual_work_time":1});
            readback["assignee_schedule_list"].as_array_mut().unwrap().push(
                json!({"assignee":{"user_key":"other"},"schedule_info":{"actual_work_time":1}}),
            );
            let error = form.verify(&readback, None, &expected).unwrap_err();
            assert_eq!(error.kind(), crate::ErrorKind::UnknownResult);
            let message = error.to_string();
            assert!(!message.contains("流程已变更"));
            assert!(message.contains(if actual == json!(2) { "回读值与本次填写不一致" } else { "未读取到实际工时的有效云端值" }));
        }
        assert!(form.verify(&node, None, &BTreeMap::from([(key, "0".into())])).is_ok(), "有效零值可以通过核验");
    }

    #[test]
    fn readback_mismatch_prevents_advancement() {
        let form = NodeForm::build(
            &json!({"form_items":[{"field_key":"node_progress","value":"0.5"}]}),
            &json!({"node_fields":[]}),
            &[json!({"field_key":"node_progress","field_type":"number"})],
            &[],
            &json!({}),
        )
        .unwrap();
        let v = values(&form);
        assert!(form
            .verify(
                &json!({"form_items":[{"field_key":"node_progress","value":"0.5"}]}),
                None,
                &v
            )
            .is_err());
        assert!(form
            .verify(
                &json!({"form_items":[{"field_key":"node_progress","value":"0.75"}]}),
                None,
                &v
            )
            .is_ok());
    }

    #[test]
    fn patch_validates_required_against_remote_and_writes_only_changed_fields() {
        let (mut node, _, nc, wc) = example();
        node["schedule"] = json!({"points":1});
        let required = json!({"form_items":[{"key":"doc-key"}],"node_fields":[{"field_key":"point"}]});
        let work = json!({"work_item_fields":[{"key":"doc-key","value":"前端：1.2.3"}]});
        let form = NodeForm::build(&node, &required, &nc, &wc, &work).unwrap();
        let doc = form.inputs.iter().find(|i| matches!(&i.route, Route::WorkItem(_))).unwrap();
        let points = form.inputs.iter().find(|i| matches!(&i.route, Route::Schedule { property, .. } if property == "points")).unwrap();
        let values = BTreeMap::from([(points.field.key.clone(), "2".into())]);
        let plan = form.plan(&values).unwrap();
        assert!(plan.work_fields.is_empty(), "共享必填项已有云端值，不应再次写回");
        assert_eq!(plan.fields, values);
        assert_eq!(plan.node_schedule.as_ref().unwrap()["points"], 2.0);
        let same = BTreeMap::from([(doc.field.key.clone(), "前端：1.2.3".into()), (points.field.key.clone(), "1.0".into())]);
        assert!(form.plan(&same).unwrap().calls("p", "1", "n").is_empty());
        let cleared = BTreeMap::from([(doc.field.key.clone(), "".into())]);
        assert!(form.plan(&cleared).is_err(), "显式清空必填项仍必须拒绝");
        let empty = NodeForm::build(&node, &required, &nc, &wc, &json!({})).unwrap();
        assert!(empty.plan(&BTreeMap::new()).is_err(), "云端也缺失的必填项不能漏填");
    }

    #[test]
    fn partial_schedule_patch_checks_the_other_remote_date_without_rewriting_it() {
        let (_, _, nc, _) = example();
        let node = json!({"schedule":{"estimate_start_time":1792684800000i64,"estimate_finish_time":1792771200000i64}});
        let form = NodeForm::build(&node, &json!({}), &nc, &[], &json!({})).unwrap();
        let start = form.inputs.iter().find(|i| matches!(&i.route, Route::Schedule { property, .. } if property == "estimate_start_date")).unwrap();
        assert!(form.plan(&BTreeMap::from([(start.field.key.clone(), "2026-10-25".into())])).is_err());
        let plan = form.plan(&BTreeMap::from([(start.field.key.clone(), "2026-10-22".into())])).unwrap();
        assert!(plan.node_schedule.as_ref().unwrap().get("estimate_end_date").is_none());
    }

    #[test]
    fn completed_state_shared_field_remains_available_for_draft_merging() {
        let form = NodeForm::build_state(
            &json!({"confirm_form":[{"class":"field","key":"version","name":"代码版本号"}]}),
            &json!({}),
            &[json!({"field_key":"version","field_type":"text"})],
            &json!({"work_item_fields":[{"key":"version","value":"前端：1.2.3"}]}),
        ).unwrap();
        let field = &form.fields()[0];
        assert!(!field.required);
        assert_eq!(field.settings.initial_value.as_deref(), Some("前端：1.2.3"));
        assert!(form.plan(&BTreeMap::new()).unwrap().calls("p", "1", "state").is_empty());
    }
}
