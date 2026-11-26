use super::*;
use crate::{error::ErrorKind, model::source::PersonalTodoQuery, RunStatus, RunTrigger, SyncContext};

struct PayloadSource(ToolResultPayload);

#[async_trait]
impl TodoSource for PayloadSource {
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> { unreachable!() }
    async fn close(&mut self) {}
    async fn call_tool(&self, tool: &str, _: &Map<String, Value>) -> Result<ToolResultPayload, BackendError> {
        assert_eq!(tool, "list_todo");
        Ok(self.0.clone())
    }
}

fn source() -> WorkSource {
    WorkSource { id: "builtin-todo".into(), kind: SourceKind::PersonalTodo, enabled: true,
        todo: Some(query()), association_rule: None }
}

fn query() -> PersonalTodoQuery {
    PersonalTodoQuery { action: crate::model::source::TodoAction::Todo, todo_scope: None, asset_key: None }
}

// 不完整身份用于验证原始条目原样传递，不触发与本测试无关的详情补齐。
fn row() -> Value {
    json!({"work_item_info":{"work_item_id":"todo-1","work_item_name":"示例待办"}})
}

async fn both_pages(payload: ToolResultPayload, rows: Vec<Value>, total: Option<i64>) {
    let fake = PayloadSource(payload);
    let store = Store::in_memory().unwrap();
    let source = source();
    let reader = SourceReader::new(&fake, &source, &store, None, 5);
    let args = query().to_arguments(1);
    assert_eq!(reader.personal_page(&args).await.unwrap(), (rows.clone(), total));
    assert_eq!(reader.schedule_page(&args).await.unwrap(), (rows, total));
}

#[tokio::test]
async fn todo_readers_choose_page_after_metadata_without_dropping_invalid_rows() {
    let rows = vec![row(), json!({"unexpected":"retained-for-rejection"})];
    both_pages(ToolResultPayload { text_blocks: vec![
        json!({"page_num":1,"total":999}).to_string(),
        json!({"list":rows,"total":"2"}).to_string(),
        "log_id: synthetic-log".into(),
    ], ..Default::default() }, rows, Some(2)).await;
    both_pages(ToolResultPayload { text_blocks: vec![
        json!({"page_num":1}).to_string(), json!([row()]).to_string(),
    ], ..Default::default() }, vec![row()], None).await;
}

#[tokio::test]
async fn todo_readers_keep_split_json_and_known_diagnostic_suffix_support() {
    let data = json!({"list":[row()],"total":1}).to_string();
    let split = data.find("[").unwrap() + 1;
    both_pages(ToolResultPayload { text_blocks: vec![data[..split].into(), data[split..].into()],
        ..Default::default() }, vec![row()], Some(1)).await;
    both_pages(ToolResultPayload::from_text(format!("{data}\nlog_id: synthetic-log")),
        vec![row()], Some(1)).await;
    both_pages(ToolResultPayload::from_json(json!({"list":[],"total":0})), vec![], Some(0)).await;
}

#[tokio::test]
async fn todo_readers_preserve_structured_authority_and_tool_errors() {
    both_pages(ToolResultPayload { structured: Some(json!({"list":[row()],"total":1})),
        text_blocks: vec![json!({"list":[],"total":0}).to_string()], is_error: false },
        vec![row()], Some(1)).await;
    for (payload, kind) in [
        (ToolResultPayload { structured: Some(json!({"data":{"list":[]}})),
            text_blocks: vec![json!({"list":[],"total":0}).to_string()], is_error: false }, ErrorKind::Parse),
        (ToolResultPayload { structured: Some(json!({"list":[]})),
            text_blocks: vec!["service rejected".into()], is_error: true }, ErrorKind::Tool),
    ] {
        let fake = PayloadSource(payload);
        let store = Store::in_memory().unwrap();
        let source = source();
        let reader = SourceReader::new(&fake, &source, &store, None, 5);
        let args = query().to_arguments(1);
        assert_eq!(reader.personal_page(&args).await.unwrap_err().kind(), kind);
        assert_eq!(reader.schedule_page(&args).await.unwrap_err().kind(), kind);
    }
}

#[tokio::test]
async fn todo_readers_accept_explicit_zero_count_with_null_list_on_first_page() {
    let empty = json!({"total":0,"list":null});
    both_pages(ToolResultPayload { text_blocks: vec![empty.to_string(), "log_id: synthetic-log".into()],
        ..Default::default() }, vec![], Some(0)).await;
    both_pages(ToolResultPayload::from_json(empty.clone()), vec![], Some(0)).await;

    let fake = PayloadSource(ToolResultPayload::from_json(empty.clone()));
    let store = Store::in_memory().unwrap();
    let source = source();
    let reader = SourceReader::new(&fake, &source, &store, None, 5);
    let args = query().to_arguments(2);
    assert_eq!(reader.personal_page(&args).await.unwrap_err().kind(), ErrorKind::Parse);
    assert_eq!(reader.schedule_page(&args).await.unwrap_err().kind(), ErrorKind::Parse);

    let fake = PayloadSource(ToolResultPayload { structured: Some(empty), is_error: true, ..Default::default() });
    let reader = SourceReader::new(&fake, &source, &store, None, 5);
    let args = query().to_arguments(1);
    assert_eq!(reader.personal_page(&args).await.unwrap_err().kind(), ErrorKind::Tool);
    assert_eq!(reader.schedule_page(&args).await.unwrap_err().kind(), ErrorKind::Tool);
}

#[tokio::test]
async fn unknown_todo_shape_is_diagnostic_failure_and_keeps_cached_source_items() {
    let store = Store::in_memory().unwrap();
    let source = source();
    let query = query();
    let ctx = || SyncContext { trigger: RunTrigger::Manual, source_id: Some("builtin-todo"), type_scope: None };
    let fake = PayloadSource(ToolResultPayload { text_blocks: vec![
        json!({"page_num":1,"total":1}).to_string(),
        json!({"list":[row()],"total":1}).to_string(),
    ], ..Default::default() });
    let mut reader = SourceReader::new(&fake, &source, &store, None, 5);
    let report = crate::sync::sync_personal_todos(&mut reader, &store, &query, 5, None, ctx()).await.unwrap();
    assert!(report.complete);
    assert_eq!(store.count_items().unwrap(), 1);

    let invalid_payloads = [
        ToolResultPayload::from_json(json!({"code":42,"data":{"items":[]},"msg":"private-business-value"})),
        ToolResultPayload::from_json(json!({"total":0})),
        ToolResultPayload::from_json(json!({"list":null})),
        ToolResultPayload::from_json(json!({"list":null,"total":1})),
    ];
    for payload in invalid_payloads {
        let fake = PayloadSource(payload);
        let mut reader = SourceReader::new(&fake, &source, &store, None, 5);
        let error = crate::sync::sync_personal_todos(&mut reader, &store, &query, 5, None, ctx()).await.unwrap_err();
        assert_eq!(error.kind(), ErrorKind::Parse);
        assert_eq!(store.count_items().unwrap(), 1, "失败不能清空已有待办");
        let runs = store.recent_runs(1).unwrap();
        assert_eq!(runs[0].status, RunStatus::Failed);
        assert_eq!(runs[0].pages_fetched, 0);
        assert!(!runs[0].error_message.as_ref().unwrap().contains("private-business-value"));
        let schedule_error = reader.schedule_page(&query.to_arguments(1)).await.unwrap_err();
        assert_eq!(schedule_error.kind(), ErrorKind::Parse);
    }
    let fake = PayloadSource(ToolResultPayload::from_json(json!({"code":42,"data":{"items":[]},"msg":"private-business-value"})));
    let reader = SourceReader::new(&fake, &source, &store, None, 5);
    for error in [reader.personal_page(&query.to_arguments(1)).await.unwrap_err(),
        reader.schedule_page(&query.to_arguments(1)).await.unwrap_err()] {
        let message = error.to_string();
        assert!(message.contains("顶层键: [code, data, msg]"), "{message}");
        assert!(!message.contains("private-business-value"));
    }
}
