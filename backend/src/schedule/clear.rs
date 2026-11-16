//! 清空日期必须保留同一业务范围的估分和工时，并以远端回读决定结果。
use super::*;

pub(super) struct ClearSnapshot {
    pub dates: Dates,
    pub retained: serde_json::Map<String, Value>,
    pub retained_complete: bool,
}

pub(super) async fn snapshot(
    client: &dyn TodoSource,
    id: &WorkItemId,
    target: &Target,
    current_user: &str,
    require_complete: bool,
) -> Result<ClearSnapshot, BackendError> {
    let nodes = fetch_nodes(client, id, 0).await?;
    extract(&nodes, target, current_user, require_complete)
}

fn extract(nodes: &[Value], target: &Target, current_user: &str, require_complete: bool) -> Result<ClearSnapshot, BackendError> {
    let error = || BackendError::conflict("无法完整确认当前节点、负责人及排期，请重新读取后核对");
    let matches = nodes.iter().filter(|node| node_key(node) == target.identity.node).collect::<Vec<_>>();
    if matches.len() != 1 || current_user.is_empty() { return Err(error()); }
    let node = matches[0];
    if normalized_node_status(node) != "doing" || (require_complete && node_data_incomplete(node)) { return Err(error()); }
    let owners = node["assignees"]["owners"].as_array().ok_or_else(error)?;
    let value = match target.identity.scope.as_str() {
        "personal" if target.identity.owner.as_deref() == Some(current_user) => {
            if !owners.iter().any(|owner| txt(&owner["user_key"]) == current_user) { return Err(error()); }
            let rows = node["assignee_schedule_list"].as_array().ok_or_else(error)?;
            let rows = rows.iter().filter(|row| txt(&row["assignee"]["user_key"]) == current_user).collect::<Vec<_>>();
            if rows.len() != 1 { return Err(error()); }
            &rows[0]["schedule_info"]
        }
        "node" if owners.len() == 1 && txt(&owners[0]["user_key"]) == current_user => {
            if node.get("assignee_schedule_list").is_some_and(|rows| !rows.is_null() && rows.as_array().is_none_or(|rows| !rows.is_empty())) { return Err(error()); }
            &node["schedule"]
        }
        _ => return Err(error()),
    };
    let object = value.as_object().ok_or_else(error)?;
    // 缺字段不能当作空值，避免覆盖未读取到的工时；null 是实测的明确空值。
    let mut retained = serde_json::Map::new();
    let mut retained_complete = true;
    for key in ["points", "actual_work_time", "planned_construction_period"] {
        match object.get(key) {
            Some(value) if value.is_null() || value.is_number() => { retained.insert(key.into(), value.clone()); }
            None if key == "planned_construction_period" => {}
            _ if require_complete => return Err(error()),
            _ => retained_complete = false,
        }
    }
    if !object.contains_key("estimate_start_time") || !object.contains_key("estimate_finish_time") { return Err(error()); }
    Ok(ClearSnapshot { dates: dates(value).ok_or_else(error)?, retained, retained_complete })
}

pub(super) fn patch(before: &ClearSnapshot) -> Value {
    let mut patch = before.retained.clone();
    patch.insert("clear_schedule".into(), json!(true));
    patch.insert("is_auto".into(), json!(false));
    Value::Object(patch)
}

pub(super) fn dates_cleared(after: &ClearSnapshot) -> bool {
    after.dates.start.is_empty() && after.dates.end.is_empty()
}

pub(super) fn warning(before: &ClearSnapshot, after: &ClearSnapshot) -> Option<String> {
    let fields = [("points", "估分"), ("actual_work_time", "实际工时"), ("planned_construction_period", "计划工期")]
        .into_iter().filter(|(key, _)| before.retained.get(*key) != after.retained.get(*key))
        .map(|(_, label)| label).collect::<Vec<_>>();
    if !after.retained_complete {
        Some(format!("日期已清空，但{}信息未完整返回，请在飞书核对。", if fields.is_empty() { "估分或工时".into() } else { fields.join("、") }))
    } else if !fields.is_empty() {
        Some(format!("日期已清空，但{}与提交前不一致，请在飞书核对。", fields.join("、")))
    } else { None }
}
