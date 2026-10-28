use async_trait::async_trait;
use fstodo_backend::{
    association::AssociationRule, detail, model::domain::WorkItemId, model::source::*,
    source_query::SourceReader, BackendError, ConnectionInfo, RunTrigger, Store, SyncContext,
    TodoSource, ToolResultPayload,
};
use serde_json::{json, Map, Value};
use std::{collections::VecDeque, sync::Mutex};

struct Fake {
    steps: Mutex<VecDeque<(&'static str, Value, Value)>>,
}
impl Fake {
    fn new(steps: Vec<(&'static str, Value, Value)>) -> Self {
        Self {
            steps: Mutex::new(steps.into()),
        }
    }
}
#[async_trait]
impl TodoSource for Fake {
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> {
        unreachable!()
    }
    async fn close(&mut self) {}
    async fn call_tool(
        &self,
        tool: &str,
        args: &Map<String, Value>,
    ) -> Result<ToolResultPayload, BackendError> {
        let mut steps = self.steps.lock().unwrap();
        // 同页详情可并发抵达，按参数匹配；分页和其他工具的先后边界仍严格校验。
        let index = if tool == "get_workitem_brief" {
            steps.iter().take_while(|(expected, _, _)| *expected == tool)
                .position(|(_, subset, _)| subset.as_object().unwrap().iter()
                    .all(|(k, v)| args.get(k) == Some(v)))
                .expect("unexpected detail call or pagination order")
        } else { 0 };
        let (expected, subset, response) = steps.remove(index).expect("unexpected remote call");
        drop(steps);
        assert_eq!(tool, expected);
        for (k, v) in subset.as_object().unwrap() {
            assert_eq!(args.get(k), Some(v), "{tool} parameter {k}");
        }
        if args.contains_key("session_id") {
            assert!(!args.contains_key("mql"), "续页绝不能重新执行 MQL");
        }
        Ok(ToolResultPayload::from_json(response))
    }
}
fn id(n: &str) -> WorkItemId {
    WorkItemId {
        project_key: Some("p".into()),
        work_item_type_key: Some("story".into()),
        work_item_id: n.into(),
    }
}
fn brief(n: &str) -> Value {
    json!({"work_item_attribute":{"owned_project":{"key":"p","name":"空间"},
    "work_item_id":n,"work_item_type":{"key":"story","name":"需求"},"work_item_name":format!("需求{n}"),"work_item_mod":"节点流"},
    "work_item_current_node":[{"id":"n1","name":"后端研发"},{"id":"n2","name":"前端研发"}],
    "work_item_fields":[{"key":"description","name":"描述","value":"完整描述"}],
    "pagination":{"has_more":false,"total":1}})
}
fn mql_row(n: i64) -> Value {
    json!({"moql_field_list":[{"key":"work_item_id","value":{"long_value":n}},
    {"key":"name","value":{"string_value":format!("需求{n}")}}]})
}
fn source(rule: Option<String>) -> WorkSource {
    WorkSource {
        id: "related".into(),
        kind: SourceKind::WorkItemType {
            project_key: Some("p".into()),
            type_key: Some("story".into()),
        },
        enabled: true,
        todo: None,
        association_rule: rule,
    }
}
fn query() -> PersonalTodoQuery {
    PersonalTodoQuery {
        action: TodoAction::Todo,
        todo_scope: None,
        asset_key: None,
    }
}

#[tokio::test]
async fn unlimited_detail_and_metadata_read_all_pages() {
    let mut steps = Vec::new();
    for page in 1..=25 {
        let mut response = brief("1");
        response["pagination"] = json!({"has_more":page < 25,"next_page_token":format!("p{page}")});
        let args = if page == 1 { json!({"work_item_id":"1"}) }
            else { json!({"page_token":format!("p{}",page - 1)}) };
        steps.push(("get_workitem_brief", args, response));
    }
    for page in 1..=25 {
        steps.push(("list_workitem_field_config", json!({"page_num":page}),
            json!({"list":[{"field_key":format!("f{page}")}],"pagination":{"has_more":page < 25}})));
    }
    let fake = Fake::new(steps);
    let detail = detail::fetch(&fake, &id("1"), 0).await.unwrap();
    assert_eq!(detail.pages.len(), 25);
    assert_eq!(detail.data["work_item_fields"].as_array().unwrap().len(), 25);
    let fields = fstodo_backend::source_query::metadata(&fake, "list_workitem_field_config", "p", "story", 0).await.unwrap();
    assert_eq!(fields.len(), 25);
    assert!(fake.steps.lock().unwrap().is_empty());
}

#[test]
fn rules_compile_fields_roles_and_custom_without_todo_scope() {
    let rule = AssociationRule::Personnel {
        fields: vec!["fixer".into()],
        roles: vec!["后端开发工程师".into()],
        match_all: false,
    };
    let sql = rule.query("p", "issue").unwrap();
    assert!(sql.contains("`fixer`"));
    assert!(sql.contains("`__后端开发工程师`"));
    assert!(sql.contains(" OR "));
    assert!(sql.contains("current_login_user()"));
    assert!(!sql.contains("in_progress"));
    assert!(AssociationRule::Custom {
        expression: "".into()
    }
    .expression()
    .is_err());
    assert!(AssociationRule::AllParticipants
        .query("bad`project", "story")
        .is_err());
    for expression in [
        "true LIMIT 1",
        "true GROUP BY `owner`",
        "true -- hidden",
        "(true",
        "true UNION SELECT `name`",
        "true;",
        "true /*hidden*/",
    ] {
        assert!(
            AssociationRule::Custom {
                expression: expression.into()
            }
            .expression()
            .is_err(),
            "{expression}"
        );
    }
    assert!(AssociationRule::Custom {
        expression: "any_relation_match(`关联`, x -> x.`name<target:all>` like '%LIMIT%')".into()
    }
    .expression()
    .is_ok());
    assert!(AssociationRule::parse(Some(
        r#"{"kind":"personnel","fields":[],"roles":[],"match_all":false}"#
    ))
    .unwrap()
    .expression()
    .is_err());
}

#[tokio::test]
async fn actual_mql_empty_shape_is_success_but_malformed_payload_is_failure() {
    for (response, success) in [
        (
            json!({"list":null,"session_id":"s","data":{},"search_status_info":null,"extra_info":null}),
            true,
        ),
        (json!({"list":null,"data":{}}), false),
    ] {
        let fake = Fake::new(vec![("search_by_mql", json!({}), response)]);
        let store = Store::in_memory().unwrap();
        let source = source(None);
        let reader = SourceReader::new(&fake, &source, &store, None, 5);
        let result = reader.call_list_todo(&query().to_arguments(1)).await;
        assert_eq!(result.is_ok(), success);
        if let Ok(payload) = result {
            let page = fstodo_backend::mcp::parse_todo_page("MQL", &payload).unwrap();
            assert!(page.items.is_empty());
        }
    }
}

#[tokio::test]
async fn personnel_rules_use_discovered_fields_and_role_names() {
    let rule = AssociationRule::Personnel {
        fields: vec!["owner".into(), "watchers".into()],
        roles: vec!["后端开发工程师".into()],
        match_all: false,
    };
    let fake = Fake::new(vec![
        (
            "list_workitem_field_config",
            json!({}),
            json!({"list":[{"field_key":"owner","field_type":"user"},{"field_key":"watchers","field_type":"multi-user"}],"pagination":{"has_more":false}}),
        ),
        (
            "list_workitem_role_config",
            json!({}),
            json!({"list":[{"role_id":"server","role_name":"后端开发工程师"}],"pagination":{"has_more":false}}),
        ),
        (
            "search_by_mql",
            json!({"mql":rule.query("p","story").unwrap()}),
            json!({"list":null,"session_id":"s","data":{},"search_status_info":null,"extra_info":null}),
        ),
    ]);
    let store = Store::in_memory().unwrap();
    let source = source(Some(serde_json::to_string(&rule).unwrap()));
    let reader = SourceReader::new(&fake, &source, &store, None, 5);
    reader
        .call_list_todo(&query().to_arguments(1))
        .await
        .unwrap();
    assert!(fake.steps.lock().unwrap().is_empty());
}

#[test]
fn detail_summary_handles_structured_schedule_without_losing_raw_detail() {
    let mut data = brief("1");
    data["work_item_fields"] = json!([{"key":"schedule","value":{"start_time":{"iso_time":"2026-10-20"},"end_time":{"unexpected":true}}}]);
    let detail = detail::ItemDetail {
        id: id("1"),
        fetched_at_ms: 1,
        data,
        pages: vec![],
    };
    let summary = detail::summary(&detail, json!({}));
    let payload = ToolResultPayload::from_json(json!({"list":[summary],"total":1}));
    let page = fstodo_backend::mcp::parse_todo_page("details", &payload).unwrap();
    assert_eq!(page.items.len(), 1);
    assert_eq!(
        detail.data["work_item_fields"][0]["value"]["end_time"]["unexpected"],
        true
    );
}

#[tokio::test]
async fn mql_session_pagination_and_details_are_persisted() {
    let mut steps = vec![(
        "search_by_mql",
        json!({"project_key":"p","mql":AssociationRule::AllParticipants.query("p","story").unwrap()}),
        json!({"list":[{"count":51,"group_infos":[{"group_id":"g"}]}],"session_id":"session","data":{"g":(1..=50).map(mql_row).collect::<Vec<_>>()}}),
    )];
    for n in 1..=50 {
        steps.push((
            "get_workitem_brief",
            json!({"fields":["_all"],"work_item_id":n.to_string()}),
            brief(&n.to_string()),
        ));
    }
    steps.push((
        "search_by_mql",
        json!({"session_id":"session","group_pagination_list":[{"group_id":"g","page_num":2}]}),
        json!({"data":{"g":[mql_row(51)]}}),
    ));
    steps.push((
        "get_workitem_brief",
        json!({"work_item_id":"51"}),
        brief("51"),
    ));
    let fake = Fake::new(steps);
    let store = Store::in_memory().unwrap();
    let config = source(None);
    let mut reader = SourceReader::new(&fake, &config, &store, None, 5);
    let report = fstodo_backend::sync::sync_personal_todos(
        &mut reader,
        &store,
        &query(),
        5,
        None,
        SyncContext {
            trigger: RunTrigger::Manual,
            source_id: Some("related"),
            type_scope: None,
        },
    )
    .await
    .unwrap();
    assert!(report.complete);
    assert_eq!(report.pages_fetched, 2);
    assert_eq!(report.items_upserted, 51);
    assert_eq!(store.count_items().unwrap(), 51);
    let detail = store.item_detail(&id("51")).unwrap().unwrap();
    assert_eq!(detail.data["work_item_fields"][0]["value"], "完整描述");
    assert_eq!(
        detail.data["work_item_current_node"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert!(fake.steps.lock().unwrap().is_empty());
}

#[tokio::test]
async fn detail_cursor_pages_merge_and_old_cache_survives_failed_refresh() {
    let mut first = brief("1");
    first["pagination"] = json!({"has_more":true,"next_page_token":"next"});
    let mut second = brief("1");
    second["work_item_fields"] = json!([{"key":"priority","value":{"label":"P1"}}]);
    let fake = Fake::new(vec![
        ("get_workitem_brief", json!({}), first),
        ("get_workitem_brief", json!({"page_token":"next"}), second),
    ]);
    let detail = detail::fetch(&fake, &id("1"), 5).await.unwrap();
    assert_eq!(detail.pages.len(), 2);
    assert_eq!(detail.data["work_item_fields"].as_array().unwrap().len(), 2);
    let store = Store::in_memory().unwrap();
    store.save_item_detail(&detail).unwrap();
    let wrong = Fake::new(vec![("get_workitem_brief", json!({}), brief("2"))]);
    assert!(detail::fetch(&wrong, &id("1"), 5).await.is_err());
    assert_eq!(
        store.item_detail(&id("1")).unwrap().unwrap().data,
        detail.data
    );
}

#[tokio::test]
async fn missing_mql_cursor_is_failure_not_empty_success() {
    let fake = Fake::new(vec![(
        "search_by_mql",
        json!({}),
        json!({"list":[{"count":51,"group_infos":[{"group_id":"g"}]}],"data":{"g":[mql_row(1)]}}),
    )]);
    let store = Store::in_memory().unwrap();
    let source = source(None);
    let mut reader = SourceReader::new(&fake, &source, &store, None, 5);
    assert!(fstodo_backend::sync::sync_personal_todos(
        &mut reader,
        &store,
        &query(),
        5,
        None,
        SyncContext {
            trigger: RunTrigger::Manual,
            source_id: Some("related"),
            type_scope: None
        }
    )
    .await
    .is_err());
    assert!(store.last_successful_sync().unwrap().is_none());
    assert_eq!(
        store.recent_runs(1).unwrap()[0].status,
        fstodo_backend::RunStatus::Failed
    );
}

#[tokio::test]
async fn state_todo_and_detail_refresh_share_latest_status_without_readding_missing_items() {
    let mut data = brief("1");
    data["work_item_attribute"]["work_item_mod"] = json!("状态流");
    data["work_item_attribute"]["work_item_status"] = json!({"name":"已解决"});
    let row = json!({"project_key":"p", "work_item_info":{"work_item_type_key":"story","work_item_id":"1"},
        "state_info":{"start_state_key_name":"待处理"}});
    let fake = Fake::new(vec![
        ("list_todo", json!({}), json!({"list":[row],"total":1})),
        ("get_workitem_brief", json!({}), data.clone()),
    ]);
    let store = Store::in_memory().unwrap();
    let config = WorkSource { kind: SourceKind::PersonalTodo, todo:Some(query()), ..source(None) };
    let mut reader = SourceReader::new(&fake, &config, &store, None, 5);
    fstodo_backend::sync::sync_personal_todos(&mut reader,&store,&query(),5,None,
        SyncContext{trigger:RunTrigger::Manual,source_id:Some("related"),type_scope:None}).await.unwrap();
    let rows = store.query_items(&Default::default()).unwrap();
    assert_eq!(rows[0].item.flow.start_state_key_name.as_deref(),Some("已解决"));
    data["work_item_attribute"]["work_item_status"] = json!({"name":"已关闭"});
    let latest = detail::ItemDetail { id:id("1"),fetched_at_ms:9,data,pages:vec![] };
    store.save_item_detail(&latest).unwrap();
    let rows = store.query_items(&Default::default()).unwrap();
    assert_eq!(rows[0].item.flow.start_state_key_name.as_deref(),Some("已关闭"));
    assert_eq!(rows[0].seen_count,1,"刷新详情不改变待办归属及出现次数");
    let run = store.begin_run("todo",None,RunTrigger::Manual,Some("related"),10).unwrap();
    store.finish_run(run,fstodo_backend::RunStatus::Success,1,0,0,0,0,Some(0),
        Some(fstodo_backend::StopReason::EmptyPage),None,None,&Default::default(),11).unwrap();
    store.save_item_detail(&latest).unwrap();
    assert_eq!(store.count_items().unwrap(),0,"详情刷新不能重新加入已离开清单的事项");
}

#[tokio::test]
async fn view_uses_saved_filter_and_validates_pagination() {
    let row = brief("1");
    let fake = Fake::new(vec![
        (
            "get_view_detail",
            json!({"project_key":"p","view_id":"v","page_num":1}),
            json!({"work_item_list":[row],"pagination":{"total":1,"has_more":false}}),
        ),
        (
            "get_workitem_brief",
            json!({"work_item_id":"1"}),
            brief("1"),
        ),
    ]);
    let store = Store::in_memory().unwrap();
    let source = WorkSource {
        kind: SourceKind::View {
            project_key: Some("p".into()),
            view_id: Some("v".into()),
        },
        ..source(None)
    };
    let reader = SourceReader::new(&fake, &source, &store, None, 5);
    let payload = reader
        .call_list_todo(&query().to_arguments(1))
        .await
        .unwrap();
    let page = fstodo_backend::mcp::parse_todo_page("view", &payload).unwrap();
    assert_eq!(page.items.len(), 1);
    assert_eq!(store.item_detail(&id("1")).unwrap().unwrap().id, id("1"));
}

#[test]
fn saving_source_preserves_settings_and_existing_default() {
    use fstodo_backend::config::{Config, SourceTable};
    let dir = std::env::temp_dir().join(format!("fstodo-source-config-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("config.toml");
    std::fs::write(
        &path,
        "workflow_enabled = false\nmax_pages = 7\ntoken_env = 'CUSTOM_ENV'\n\
         [[source]]\nid = 'existing-todo'\nkind = 'personal_todo'\nenabled = true\naction = 'todo'\n",
    )
    .unwrap();
    let config = Config::load(Some(&path), None).unwrap();
    config
        .save_source(SourceTable {
            id: "related".into(),
            kind: "work_item_type".into(),
            enabled: true,
            project_key: Some("p".into()),
            work_item_type_key: Some("story".into()),
            ..Default::default()
        })
        .unwrap();
    let updated = Config::load(Some(&path), None).unwrap();
    assert_eq!(updated.sources.len(), 2);
    assert_eq!(updated.sources[0].id, "existing-todo");
    assert_eq!(updated.max_pages, 7);
    assert_eq!(updated.token_env, "CUSTOM_ENV");
    assert!(!updated.workflow_enabled);
    let bytes = std::fs::read(&path).unwrap();
    assert!(updated
        .save_source(SourceTable {
            id: "bad".into(),
            kind: "view".into(),
            enabled: true,
            ..Default::default()
        })
        .is_err());
    assert_eq!(bytes, std::fs::read(&path).unwrap());
    std::fs::remove_dir_all(dir).unwrap();
}
