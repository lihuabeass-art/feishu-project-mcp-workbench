//! 关联缺陷只读取已经同步到本机的事项及详情，不访问飞书。
use std::collections::HashSet;
use serde::Serialize;
use serde_json::Value;
use crate::{api::Session, association::AssociationRule, error::BackendError, model::{domain::WorkItemId, source::SourceKind}, store::{CachedItem, ItemFilter}};

// 已从飞书缺陷字段配置及详情回读确认的系统字段；创建时仍由实时表单配置校验其关联范围。
const STORY_FIELD: &str = "_field_linked_story";

#[derive(Debug, Serialize)]
pub struct RelatedDefect {
    pub item: CachedItem,
    pub status: Option<String>,
    pub operators: Vec<String>,
    pub mine: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct RelatedDefects {
    pub relation_field: &'static str,
    pub items: Vec<RelatedDefect>,
    pub mine_available: bool,
    pub incomplete_details: usize,
}

fn relation_matches(value: &Value, target: &str) -> Option<bool> {
    if value.is_null() { return Some(false); }
    crate::detail::text(&value["id"]).map(|id| id == target)
}

fn local_personal_sources(session: &Session, project: &str) -> HashSet<String> {
    session.config.sources.iter().filter(|source| match &source.kind {
        SourceKind::PersonalTodo => true,
        SourceKind::WorkItemType { project_key, type_key } if project_key.as_deref() == Some(project) && type_key.as_deref() == Some("issue") => matches!(
            AssociationRule::parse(source.association_rule.as_deref()),
            Ok(AssociationRule::AllParticipants | AssociationRule::CurrentParticipants)),
        _ => false,
    }).map(|source| source.id.clone()).collect()
}

pub fn list(session: &Session, target: &WorkItemId) -> Result<RelatedDefects, BackendError> {
    let project = target.project_key.as_deref().filter(|p| !p.is_empty()).ok_or_else(|| BackendError::validation("缺少事项空间"))?;
    if target.work_item_type_key.as_deref() != Some("story") || target.work_item_id.is_empty() {
        return Err(BackendError::validation("当前只支持需求研发的关联缺陷"));
    }
    let sources = local_personal_sources(session, project);
    let cached = session.query_cached_items(&ItemFilter { project_key: Some(project.into()), type_key: Some("issue".into()), limit: Some(-1), ..Default::default() })?;
    let mut items = Vec::new();
    let mut incomplete_details = 0;
    for item in cached {
        let Some(detail) = session.cached_item_detail(&item.item.id)? else { incomplete_details += 1; continue; };
        let fields = detail.data["work_item_fields"].as_array();
        let relation = fields.and_then(|fields| fields.iter().find(|f| f["key"] == STORY_FIELD)).and_then(|f| f.get("value")).and_then(|value| relation_matches(value, &target.work_item_id));
        match relation { Some(false) => continue, None => { incomplete_details += 1; continue; }, Some(true) => {} }
        let status = crate::detail::text(&detail.data["work_item_attribute"]["work_item_status"]["name"]);
        let operators = fields.and_then(|fields| fields.iter().find(|f| f["key"] == "current_status_operator")).and_then(|f| f["value"].as_array())
            .map(|users| users.iter().filter_map(|user| crate::detail::text(&user["name"])).collect()).unwrap_or_default();
        let mine = item.source_ids.iter().any(|id| sources.contains(id)).then_some(true);
        items.push(RelatedDefect { item, status, operators, mine });
    }
    Ok(RelatedDefects { relation_field: STORY_FIELD, items, mine_available: !sources.is_empty(), incomplete_details })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn matches_cached_identity_not_name_and_distinguishes_unknown() {
        assert_eq!(relation_matches(&json!({"id":123,"name":"同名"}), "123"), Some(true));
        assert_eq!(relation_matches(&json!({"id":456,"name":"同名"}), "123"), Some(false));
        assert_eq!(relation_matches(&Value::Null, "123"), Some(false));
        assert_eq!(relation_matches(&json!({"name":"同名"}), "123"), None);
    }

    #[test]
    fn reads_all_cached_defects_offline_and_keeps_spaces_separate() {
        use crate::{detail::ItemDetail, model::domain::{FlowInfo, FlowKind, Schedule, WorkItem}, store::RunTrigger};
        let dir = std::env::temp_dir().join(format!("fstodo-related-{}-{}", std::process::id(), crate::sync::now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let config_path = dir.join("config.toml");
        std::fs::write(&config_path, "token_env = 'FSTODO_MISSING_OFFLINE_TEST_TOKEN'\n[[source]]\nid='mine'\nkind='personal_todo'\naction='todo'\ntodo_scope='in_progress'\n").unwrap();
        let session = Session::open(crate::Config::load(Some(&config_path), Some(&dir.join("test.db"))).unwrap()).unwrap();
        let run = session.store.begin_run("todo", None, RunTrigger::Manual, Some("mine"), 1).unwrap();
        let make = |space: &str, id: String| WorkItem {
            id: WorkItemId { project_key: Some(space.into()), work_item_type_key: Some("issue".into()), work_item_id: id },
            project_name: None, name: Some("缺陷".into()), flow: FlowInfo { kind: FlowKind::None, node_name: None, node_state_key: None, start_state_key_name: None, end_state_key_name: None },
            schedule: Schedule::default(), raw_json: "{}".into(),
        };
        let mut items: Vec<_> = (0..205).map(|id| make("p", id.to_string())).collect();
        items[204].id.work_item_id = "zzzz".into();
        items.push(make("other", "same".into()));
        session.store.upsert_items(run, &items, 1).unwrap();
        for (index, item) in items.iter().enumerate() {
            if index == 2 { continue; }
            let value = if index == 204 || index == 205 { json!({"id":123,"name":"同名"}) } else { json!({"id":456,"name":"同名"}) };
            session.store.save_item_detail(&ItemDetail { id: item.id.clone(), fetched_at_ms: 1,
                data: json!({"work_item_attribute":{"work_item_status":{"name":"处理中"}},"work_item_fields":[{"key":STORY_FIELD,"value":value}]}), pages: vec![] }).unwrap();
        }
        let target = WorkItemId { project_key: Some("p".into()), work_item_type_key: Some("story".into()), work_item_id: "123".into() };
        let found = list(&session, &target).unwrap();
        assert_eq!(found.items.len(), 1);
        assert_eq!(found.items[0].item.item.id.work_item_id, "zzzz");
        assert_eq!(found.incomplete_details, 1);
        assert_eq!(found.items[0].status.as_deref(), Some("处理中"));
        assert_eq!(found.items[0].mine, Some(true));
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
