//! 流程中的人员、关联事项、多选与图文，复用已实现的字段协议。
use super::*;
use crate::creation::{Field, OptionValue};

pub(super) fn editor(config: &Value, label: &str, required: bool, current: &Value) -> Option<Field> {
    let mut field = crate::creation::field(config, config);
    if !matches!(field.kind.as_str(), "people" | "relation" | "textarea")
        && !(field.kind == "select" && field.multiple) { return None; }
    if field.kind == "textarea" && !current.is_null() && !current.is_string() { return None; }
    if field.kind == "relation" && field.related.is_empty() { return None; }
    field.label = label.into();
    field.required = required;
    field.initial = Value::Null;
    // 当前值的显示名称只参与展示；关系候选仍受配置约束，不能扩大到任意事项。
    if matches!(field.kind.as_str(), "people" | "relation") {
        for row in current.as_array().cloned().unwrap_or_else(|| vec![current.clone()]) {
            let ids = crate::creation::id_values(&row);
            let name = row.get("name").or_else(|| row.get("name_cn")).or_else(|| row.get("label")).and_then(Value::as_str);
            if let (Some(id), Some(name)) = (ids.first().filter(|id| !id.is_empty()), name) {
                field.options.push(OptionValue { value:id.clone(), label:name.into(), color:None });
            }
        }
    }
    Some(field)
}

pub(super) fn initial(field: &Field, current: &Value) -> String {
    if field.kind == "textarea" { return text(current); }
    let values: Vec<_> = crate::creation::id_values(current).into_iter().filter(|v| !v.is_empty()).collect();
    if field.multiple { serde_json::to_string(&values).unwrap() }
    else { values.first().cloned().unwrap_or_default() }
}

pub(super) fn value(field: &Field, raw: &str) -> Result<Value, BackendError> {
    if raw.trim().is_empty() { return Ok(Value::Null); }
    if field.multiple {
        serde_json::from_str(raw).map_err(|_| BackendError::validation(format!("请重新选择{}", field.label)))
    } else { Ok(json!(raw)) }
}

pub(super) fn empty(value: &Value) -> bool {
    value.is_null() || value.as_array().is_some_and(Vec::is_empty) || value.as_str().is_some_and(|v| v.trim().is_empty())
}

pub(super) fn matches(field: &Field, raw: &str, actual: &Value, image_matches: impl FnMut(crate::creation::richtext::ImageChange<'_>) -> bool) -> Result<bool, BackendError> {
    let expected = crate::creation::encode(field, &value(field, raw)?)?;
    Ok(if field.kind == "textarea" {
        match (expected.as_str(), actual.as_str()) {
            (Some(expected), Some(actual)) => crate::creation::richtext::matches_with_images(expected, actual, image_matches),
            _ => expected == *actual,
        }
    } else {
        let ids = |value: &Value| crate::creation::id_values(value).into_iter().filter(|id| !id.is_empty()).collect::<Vec<_>>();
        ids(&expected) == ids(actual)
    })
}

pub(super) fn role_value(work: &Value, role: &str) -> Value {
    work["work_item_attribute"]["role_members"].as_array().into_iter().flatten()
        .find(|row| row["key"] == role || row["role_id"] == role || row["role"] == role)
        .map(|row| row["members"].clone()).unwrap_or_else(|| json!([]))
}
