use super::{
    detail, json, parse_tool_json, BackendError, HistoryScope, TodoSource, Value, WorkItemId,
};
use std::collections::BTreeSet;

pub(super) const SOURCE_ID: &str = "schedule-people-current";
const TOOL: &str = "search_by_mql";
pub(super) const MEMBERS_PER_QUERY: usize = 20;

/// `list_schedule` 只返回有日期的记录。按已知人员读取当前需求，再用节点详情确认归属和日期。
pub(super) async fn current_stories(
    client: &dyn TodoSource,
    scope: &HistoryScope,
    users: &[String],
    max_pages: u32,
) -> Result<Vec<(WorkItemId, String)>, BackendError> {
    let project = crate::association::identifier(&scope.project)?;
    let mut members = Vec::new();
    for id in users {
        if id.is_empty()
            || !id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        {
            return Err(BackendError::validation("人员排期负责人标识无效"));
        }
        members.push(format!("'X<id:{id}>'"));
    }
    let query = format!(
        "SELECT `work_item_id`, `name` FROM {project}.`story` WHERE `current_status_operator` IN ({}) AND `finish_status` = false",
        members.join(", ")
    );
    let invalid = || BackendError::parse(TOOL, "人员当前事项分页不完整");
    let mut args = json!({"project_key": scope.project, "mql": query});
    let mut cursor = None;
    let mut group = None;
    let mut total = 0;
    let mut seen = BTreeSet::new();
    let mut items = Vec::new();
    for page in crate::config::page_numbers(max_pages) {
        let data = parse_tool_json(
            TOOL,
            &client.call_tool(TOOL, args.as_object().unwrap()).await?,
        )?;
        if page == 1 {
            cursor = detail::text(&data["session_id"]);
            if cursor.is_some()
                && data.get("list") == Some(&Value::Null)
                && data["data"].as_object().is_some_and(|data| data.is_empty())
                && data.get("search_status_info") == Some(&Value::Null)
                && data.get("extra_info") == Some(&Value::Null)
            {
                return Ok(items);
            }
            let list = data["list"]
                .as_array()
                .filter(|list| list.len() == 1)
                .ok_or_else(invalid)?;
            total = list[0]["count"].as_u64().ok_or_else(invalid)?;
            if total == 0 {
                return Ok(items);
            }
            let groups = list[0]["group_infos"]
                .as_array()
                .filter(|groups| groups.len() == 1)
                .ok_or_else(invalid)?;
            group = detail::text(&groups[0]["group_id"]);
        }
        let rows = group
            .as_ref()
            .and_then(|group| data["data"].get(group))
            .and_then(Value::as_array)
            .filter(|rows| !rows.is_empty())
            .ok_or_else(invalid)?;
        for row in rows {
            let fields = row["moql_field_list"].as_array().ok_or_else(invalid)?;
            let field = |key| {
                fields
                    .iter()
                    .find(|field| field["key"] == key)
                    .map(|field| &field["value"])
            };
            let id = field("work_item_id")
                .and_then(|value| {
                    detail::text(&value["long_value"])
                        .or_else(|| detail::text(&value["string_value"]))
                })
                .ok_or_else(invalid)?;
            if !seen.insert(id.clone()) {
                return Err(invalid());
            }
            let title = field("name")
                .and_then(|value| detail::text(&value["string_value"]))
                .unwrap_or_default();
            items.push((
                WorkItemId {
                    project_key: Some(scope.project.clone()),
                    work_item_type_key: Some(scope.work_item_type.clone()),
                    work_item_id: id,
                },
                title,
            ));
        }
        let received = items.len() as u64;
        if received == total {
            return Ok(items);
        }
        if received > total || cursor.is_none() {
            return Err(invalid());
        }
        args = json!({"project_key":scope.project,"session_id":cursor,
            "group_pagination_list":[{"group_id":group,"page_num":page+1}]});
    }
    Err(invalid())
}
