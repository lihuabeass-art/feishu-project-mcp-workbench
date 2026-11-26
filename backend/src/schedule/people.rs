use super::{
    detail, fetch_nodes, is_completed_or_aborted_detail, is_state_flow_detail, json, parse_tool_json,
    BackendError, HistoryScope, TodoSource, Value, WorkItemId,
};
use futures_util::{stream, StreamExt};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

pub(super) const SOURCE_ID: &str = "schedule-people-current";
pub(super) const ASSOCIATED_SOURCE_ID: &str = "schedule-associated-stories";
const TOOL: &str = "search_by_mql";
pub(super) const MEMBERS_PER_QUERY: usize = 20;
const CLOSED_STORY_TTL: Duration = Duration::from_secs(15 * 60);
const MAX_CLOSED_STORIES: usize = 512;

pub(super) struct Story {
    pub id: WorkItemId,
    pub title: String,
    pub finished: bool,
}

type NodeRead = (Result<Vec<Value>, BackendError>, Option<detail::ItemDetail>);
type ClosedStoryKey = (String, (String, String, String));
type ClosedStoryReads = BTreeMap<ClosedStoryKey, (Instant, Vec<Value>, detail::ItemDetail)>;
static CLOSED_STORIES: OnceLock<Mutex<ClosedStoryReads>> = OnceLock::new();

pub(super) async fn read_associated_nodes(
    client: &dyn TodoSource,
    connection: &str,
    id: &WorkItemId,
    finished: bool,
    max_pages: u32,
) -> NodeRead {
    let key = (connection.to_owned(), id.key_tuple());
    let cache = CLOSED_STORIES.get_or_init(Mutex::default);
    {
        let mut entries = cache.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if finished {
            if let Some((at, nodes, detail)) = entries.get(&key) {
                if at.elapsed() < CLOSED_STORY_TTL {
                    return (Ok(nodes.clone()), Some(detail.clone()));
                }
            }
        }
        entries.remove(&key);
    }
    let detail = match detail::fetch(client, id, max_pages).await {
        Ok(detail) => detail,
        Err(error) => return (Err(error), None),
    };
    let nodes = if is_state_flow_detail(&detail.data) {
        Ok(Vec::new())
    } else {
        fetch_nodes(client, id, max_pages).await
    };
    if let Ok(rows) = &nodes {
        let closed = finished && is_completed_or_aborted_detail(&detail.data);
        if closed && !rows.iter().any(super::node_data_incomplete) {
            let mut entries = cache.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            entries.retain(|_, (at, _, _)| at.elapsed() < CLOSED_STORY_TTL);
            if entries.len() < MAX_CLOSED_STORIES {
                entries.insert(key, (Instant::now(), rows.clone(), detail.clone()));
            }
        }
    }
    (nodes, Some(detail))
}

pub(super) async fn associated_stories(
    client: &dyn TodoSource,
    spaces: &[crate::catalog::SpaceCatalog],
    max_pages: u32,
) -> (Vec<Story>, bool, Option<crate::error::ErrorKind>) {
    let mut reads = stream::iter(spaces).map(|space| async move {
        let project = &space.project_key;
        let tool = crate::mcp::feishu::TOOL_LIST_WORKITEM_TYPES;
        let args = json!({"project_key": project});
        let response = parse_tool_json(tool, &client.call_tool(tool, args.as_object().unwrap()).await?)?;
        let types = response["list"].as_array().ok_or_else(|| BackendError::parse(tool, "缺少空间工作项类型列表"))?;
        if types.iter().any(|kind| kind["type_key"].as_str().is_none_or(str::is_empty)) {
            return Err(BackendError::parse(tool, "空间工作项类型列表不完整"));
        }
        if !types.iter().any(|kind| kind["type_key"] == "story") {
            return Ok(Vec::new());
        }
        let identifier = crate::association::identifier(project)?;
        let association = crate::association::AssociationRule::AllParticipants.expression()?;
        let query = format!("SELECT `work_item_id`, `name`, `finish_status` FROM {identifier}.`story` WHERE {association}");
        read_stories(client, project, query, max_pages).await
    }).buffered(3);
    let mut items = Vec::new();
    let mut complete = true;
    let mut issue = None;
    while let Some(read) = reads.next().await {
        match read {
            Ok(rows) => items.extend(rows),
            Err(error) => {
                complete = false;
                issue = super::people_refresh::discovery_issue(&error).or(issue);
            }
        }
    }
    (items, complete, issue)
}

/// `list_schedule` 只返回有日期的记录。按已知人员读取当前需求，再用节点详情确认归属和日期。
pub(super) async fn current_stories(
    client: &dyn TodoSource,
    scope: &HistoryScope,
    users: &[String],
    max_pages: u32,
) -> Result<Vec<Story>, BackendError> {
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
    read_stories(client, &scope.project, query, max_pages).await
}

async fn read_stories(
    client: &dyn TodoSource,
    project: &str,
    query: String,
    max_pages: u32,
) -> Result<Vec<Story>, BackendError> {
    let invalid = || BackendError::parse(TOOL, "人员需求分页不完整");
    let mut args = json!({"project_key": project, "mql": query});
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
            items.push(Story {
                id: WorkItemId {
                    project_key: Some(project.into()),
                    work_item_type_key: Some("story".into()),
                    work_item_id: id,
                },
                title,
                finished: field("finish_status").is_some_and(|value| value["bool_value"] == true),
            });
        }
        let received = items.len() as u64;
        if received == total {
            return Ok(items);
        }
        if received > total || cursor.is_none() {
            return Err(invalid());
        }
        args = json!({"project_key":project,"session_id":cursor,
            "group_pagination_list":[{"group_id":group,"page_num":page+1}]});
    }
    Err(invalid())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp::{ConnectionInfo, ToolResultPayload};
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[derive(Default)]
    struct ClosedStory(AtomicUsize);

    #[async_trait::async_trait]
    impl TodoSource for ClosedStory {
        async fn describe(&self) -> Result<ConnectionInfo, BackendError> { unreachable!() }
        async fn close(&mut self) {}
        async fn call_tool(&self, tool: &str, _args: &serde_json::Map<String, Value>) -> Result<ToolResultPayload, BackendError> {
            assert_eq!(tool, "get_workitem_brief");
            self.0.fetch_add(1, Ordering::Relaxed);
            Ok(ToolResultPayload::from_json(json!({
                "work_item_attribute":{"work_item_id":"closed","owned_project":{"key":"space"},
                    "work_item_type":{"key":"story"},"work_item_mod":"状态流","finish_status":true},
                "work_item_fields":[],"pagination":{"has_more":false}
            })))
        }
    }

    #[tokio::test]
    async fn completed_story_cache_is_account_scoped_expires_and_is_discarded_on_reopen() {
        let client = ClosedStory::default();
        let id = WorkItemId { project_key: Some("space".into()), work_item_type_key: Some("story".into()), work_item_id: "closed".into() };
        let read = |connection, finished| read_associated_nodes(&client, connection, &id, finished, 2);
        let calls = || client.0.load(Ordering::Relaxed);
        assert!(read("first-account", true).await.1.is_some());
        assert!(read("first-account", true).await.1.is_some());
        assert_eq!(calls(), 1);
        assert!(read("second-account", true).await.1.is_some());
        assert_eq!(calls(), 2);
        let key = ("first-account".to_owned(), id.key_tuple());
        CLOSED_STORIES.get().unwrap().lock().unwrap().get_mut(&key).unwrap().0 = Instant::now() - CLOSED_STORY_TTL;
        assert!(read("first-account", true).await.1.is_some());
        assert_eq!(calls(), 3);
        assert!(read("first-account", false).await.1.is_some());
        assert_eq!(calls(), 4);
        assert!(!CLOSED_STORIES.get().unwrap().lock().unwrap().contains_key(&key));
        assert!(read("second-account", true).await.1.is_some());
        assert_eq!(calls(), 4);
    }
}
