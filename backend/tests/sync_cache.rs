//! 离线链路集成测试：脱敏 fixtures → 解析 → 转换 → 落库 → 缓存查询。
// 固定节点模板标识使用合成 fixture，不携带真实业务标识。
//!
//! 全部走 [`TodoSource`] 的假实现，不碰网络、不需要凭证：
//! 真实网络路径的错误分类在 `src/mcp/feishu.rs` 单测里覆盖，
//! 这里验证的是「同步驱动 + SQLite」这一半（任务书四.2/四.3）。

use std::collections::VecDeque;
use std::path::Path;
use std::sync::Mutex;

use async_trait::async_trait;
use fstodo_backend::error::{BackendError, ErrorKind};
use fstodo_backend::mcp::{parse_todo_page, ConnectionInfo, ToolResultPayload, TodoSource};
use fstodo_backend::model::domain::{to_work_item, FlowKind};
use fstodo_backend::model::source::{PersonalTodoQuery, TodoAction, TodoScope};
use fstodo_backend::store::{
    ActionRecord, CachedType, ItemFilter, RunStatus, RunTrigger, StopReason, Store, TypeScope,
};
use fstodo_backend::sync::{sync_personal_todos, SyncContext, SyncReport};
use serde_json::{json, Map, Value};

const EP: &str = "https://project.feishu.cn/mcp_server/v1";

fn fixture(name: &str) -> Value {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name);
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("读取 fixture {} 失败: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("fixture {name} 必须是合法 JSON: {e}"))
}

/// 一条结构完整、身份为 `id` 的事项（与 fixtures 同形）。
fn item(id: &str) -> Value {
    json!({
        "project_key": "space_demo",
        "project_name": "示例空间",
        "work_item_info": { "work_item_id": id, "work_item_type_key": "story", "work_item_name": format!("事项 {id}") },
        "node_info": { "node_name": "研发中", "node_state_key": "developing" },
        "state_info": { "start_state_key_name": "", "end_state_key_name": "" }
    })
}

fn page(total: i64, ids: &[&str]) -> Value {
    json!({ "total": total, "list": ids.iter().map(|i| item(i)).collect::<Vec<_>>() })
}

fn query() -> PersonalTodoQuery {
    PersonalTodoQuery { action: TodoAction::Todo, todo_scope: Some(TodoScope::InProgress), asset_key: None }
}

/// 测试统一走这个包装：本文件所有用例都不带凭证（secret=None）。
/// 真实调用方（api::Session）会把已加载凭证传进来，见 `failed_run_message_is_redacted_with_loaded_secret`。
async fn run_sync(
    source: &mut FakeSource,
    store: &Store,
    q: &PersonalTodoQuery,
    max_pages: u32,
) -> Result<SyncReport, BackendError> {
    sync_personal_todos(
        source,
        store,
        q,
        max_pages,
        None,
        SyncContext { trigger: RunTrigger::Manual, source_id: Some("fake"), type_scope: None },
    )
    .await
}

/// 按脚本逐页应答的取数源。脚本用尽还来要页 = 翻页逻辑有 bug，直接 panic。
struct FakeSource {
    script: Mutex<VecDeque<Scripted>>,
    calls: Mutex<Vec<Map<String, Value>>>,
}

enum Scripted {
    /// 作为 structuredContent 返回
    Json(Value),
    /// 只给文本块（可非 JSON）
    Text(&'static str),
    /// isError = true
    ToolError(&'static str),
    /// 传输 / 鉴权层失败
    Fail(BackendError),
}

impl FakeSource {
    fn new(script: Vec<Scripted>) -> Self {
        Self { script: Mutex::new(script.into()), calls: Mutex::new(Vec::new()) }
    }
    fn call_count(&self) -> usize {
        self.calls.lock().unwrap().len()
    }
    fn calls(&self) -> Vec<Map<String, Value>> {
        self.calls.lock().unwrap().clone()
    }
}

#[async_trait]
impl TodoSource for FakeSource {
    fn is_full_scan(&self) -> bool { true }
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> {
        Ok(ConnectionInfo {
            endpoint: "fake://local".into(),
            session_established: true,
            server_name: Some("fake-source".into()),
            server_version: Some("test".into()),
            protocol_version: Some("2025-03-26".into()),
            capabilities: vec!["tools".into()],
        })
    }

    /// 假实现只服务 `list_todo`：同步层现在只经 `call_tool` 取数。
    async fn call_tool(&self, _tool: &str, arguments: &Map<String, Value>) -> Result<ToolResultPayload, BackendError> {
        self.calls.lock().unwrap().push(arguments.clone());
        match self.script.lock().unwrap().pop_front() {
            Some(Scripted::Json(v)) => Ok(ToolResultPayload::from_json(v)),
            Some(Scripted::Text(t)) => Ok(ToolResultPayload::from_text(t)),
            Some(Scripted::ToolError(t)) => Ok(ToolResultPayload::err(t)),
            Some(Scripted::Fail(e)) => Err(e),
            None => panic!("FakeSource 脚本用尽：翻页请求超出了预期页数"),
        }
    }

    async fn close(&mut self) {}
}

// ---------------------------------------------------------------- 解析 / 转换

#[test]
fn fixture_page_parses_and_converts_node_and_state() {
    let payload = ToolResultPayload::from_json(fixture("page_total_and_list.json"));
    let parsed = parse_todo_page("list_todo", &payload).expect("调查记录里的 {total,list} 形状必须可解析");
    assert_eq!(parsed.total, Some(2));
    assert_eq!(parsed.items.len(), 2);
    assert!(parsed.rejected.is_empty());

    let story = to_work_item(&parsed.items[0]).unwrap();
    assert_eq!(story.flow.kind, FlowKind::Node);
    assert_eq!(story.flow.node_state_key.as_deref(), Some("developing"));
    assert_eq!(story.flow.start_state_key_name, None, "空字符串不得折算成业务值");
    assert_eq!(story.schedule.start_raw.as_deref(), Some("1750000000000"), "排期只存原文");
    assert_eq!(story.schedule.end_raw, None);
    assert!(story.raw_json.contains("示例需求A"), "原始响应必须原样保留");

    let issue = to_work_item(&parsed.items[1]).unwrap();
    assert_eq!(issue.flow.kind, FlowKind::State);
    assert_eq!(issue.flow.start_state_key_name.as_deref(), Some("待处理"));
    assert_eq!(issue.id.work_item_id, "2002", "数字 id 原样转文本，不猜格式");
}

#[test]
fn fixture_bare_array_and_empty_page() {
    let parsed = parse_todo_page("list_todo", &ToolResultPayload::from_json(fixture("page_bare_array.json"))).unwrap();
    assert_eq!(parsed.total, None, "裸数组没有 total，不凭空补");
    assert_eq!(parsed.items.len(), 1);

    let empty = parse_todo_page("list_todo", &ToolResultPayload::from_json(fixture("page_empty_with_total.json"))).unwrap();
    assert_eq!(empty.total, Some(0));
    assert!(empty.items.is_empty(), "真空列表是合法结果，不是解析失败");
}

// ---------------------------------------------------------------- 翻页终止

#[tokio::test]
async fn premature_empty_page_is_failure() {
    let store = Store::in_memory().unwrap();
    // total 声明 3 条但第一页只给 2 条：未到 total 必须继续翻，由空页收尾
    let mut source = FakeSource::new(vec![
        Scripted::Json(page(3, &["WI-1001", "WI-2002"])),
        Scripted::Json(json!({ "total": 3, "list": [] })),
    ]);
    let error = run_sync(&mut source, &store, &query(), 10).await.unwrap_err();
    assert_eq!(error.kind(), ErrorKind::Parse);
    assert_eq!(store.count_items().unwrap(), 2);
    assert!(store.last_successful_sync().unwrap().is_none());
}

#[tokio::test]
async fn sync_stops_at_total_without_asking_for_an_empty_page() {
    let store = Store::in_memory().unwrap();
    let mut source = FakeSource::new(vec![Scripted::Json(page(2, &["WI-1001", "WI-2002"]))]);
    let report = run_sync(&mut source, &store, &query(), 10).await.unwrap();

    assert_eq!(report.stop_reason, StopReason::TotalReached);
    assert_eq!(source.call_count(), 1, "已到 total 还去翻页就是浪费请求");
}

#[tokio::test]
async fn short_page_continues_until_total_reached() {
    // 响应带 total 时，短页不能作为终点：每页 50 条只是元数据说法，未实测
    let store = Store::in_memory().unwrap();
    let mut source = FakeSource::new(vec![
        Scripted::Json(page(5, &["A-1", "A-2"])),
        Scripted::Json(page(5, &["A-3", "A-4", "A-5"])),
    ]);
    let report = run_sync(&mut source, &store, &query(), 10).await.unwrap();

    assert_eq!(report.stop_reason, StopReason::TotalReached);
    assert_eq!(source.call_count(), 2, "第 1 页只有 2 条但 total=5，必须继续翻");
    assert_eq!(store.count_items().unwrap(), 5);
}

#[tokio::test]
async fn short_page_without_total_requires_empty_confirmation() {
    let store = Store::in_memory().unwrap();
    let mut source = FakeSource::new(vec![Scripted::Json(fixture("page_bare_array.json")), Scripted::Json(json!([]))]);
    let report = run_sync(&mut source, &store, &query(), 10).await.unwrap();

    assert_eq!(report.stop_reason, StopReason::EmptyPage);
    assert!(report.is_success());
    assert_eq!(source.call_count(), 2);
}

#[tokio::test]
async fn max_pages_is_incomplete_failure_but_keeps_rows() {
    let store = Store::in_memory().unwrap();
    let bulk: Vec<&str> = (0..50).map(|i| BOXES[i]).collect();
    let mut source = FakeSource::new(vec![
        Scripted::Json(page(1000, &bulk)),
        Scripted::Json(page(1000, &bulk)),
    ]);
    let report = run_sync(&mut source, &store, &query(), 2).await.unwrap();

    assert_eq!(report.stop_reason, StopReason::MaxPages);
    assert_eq!(report.status, RunStatus::Failed, "被上限截断不能算成功同步");
    assert!(!report.complete);
    assert_eq!(store.count_items().unwrap(), 50, "已取到的页保留，不因截断回滚");
    assert!(store.last_successful_sync().unwrap().is_none(), "不完整的运行不得占用『最近成功』");

    let run = store.recent_runs(5).unwrap().remove(0);
    assert_eq!(run.error_kind.as_deref(), Some("incomplete"));
    assert!(run.error_message.as_deref().unwrap().contains("max_pages"));
}

static BOXES: [&str; 50] = {
    // const fn 循环不便，写死 50 个稳定 id（内容无关紧要，只需唯一）
    const A: [&str; 50] = [
        "B-00","B-01","B-02","B-03","B-04","B-05","B-06","B-07","B-08","B-09",
        "B-10","B-11","B-12","B-13","B-14","B-15","B-16","B-17","B-18","B-19",
        "B-20","B-21","B-22","B-23","B-24","B-25","B-26","B-27","B-28","B-29",
        "B-30","B-31","B-32","B-33","B-34","B-35","B-36","B-37","B-38","B-39",
        "B-40","B-41","B-42","B-43","B-44","B-45","B-46","B-47","B-48","B-49",
    ];
    A
};

// ---------------------------------------------------------------- 重复同步 / 失败保缓存

#[tokio::test]
async fn response_metadata_does_not_count_as_a_business_update() {
    let store = Store::in_memory().unwrap();
    let mut first = page(1, &["1"]);
    first["list"][0]["source_record"] = json!({"request_id":"first","fields":["a","b"]});
    let mut source = FakeSource::new(vec![Scripted::Json(first.clone())]);
    run_sync(&mut source,&store,&query(),10).await.unwrap();
    first["list"][0]["source_record"] = json!({"request_id":"second","fields":["b","a"]});
    let mut source = FakeSource::new(vec![Scripted::Json(first.clone())]);
    let report = run_sync(&mut source,&store,&query(),10).await.unwrap();
    assert_eq!((report.items_inserted,report.items_updated),(0,0));
    assert!(store.query_items(&ItemFilter::default()).unwrap()[0].item.raw_json.contains("second"));
    first["list"][0]["node_info"]["node_name"] = json!("新节点");
    let mut source = FakeSource::new(vec![Scripted::Json(first)]);
    assert_eq!(run_sync(&mut source,&store,&query(),10).await.unwrap().items_updated,1);
}

#[tokio::test]
async fn repeated_sync_updates_rows_without_duplicates() {
    let store = Store::in_memory().unwrap();
    let mut s1 = FakeSource::new(vec![Scripted::Json(page(2, &["WI-1001", "WI-2002"]))]);
    let r1 = run_sync(&mut s1, &store, &query(), 10).await.unwrap();
    assert_eq!((r1.items_inserted, r1.items_updated), (2, 0));

    let mut s2 = FakeSource::new(vec![Scripted::Json(page(2, &["WI-1001", "WI-2002"]))]);
    let r2 = run_sync(&mut s2, &store, &query(), 10).await.unwrap();
    assert_eq!((r2.items_inserted, r2.items_updated), (0, 0), "无业务变化不能计为修改");

    assert_eq!(store.count_items().unwrap(), 2, "重复同步不得产生重复事项");
    let row = store.query_items(&ItemFilter::default()).unwrap().into_iter().find(|c| c.item.id.work_item_id == "WI-1001").unwrap();
    assert_eq!(row.seen_count, 2);
}

#[tokio::test]
async fn auth_failure_keeps_cache_and_records_failed_run() {
    // 先成功同步一次，建立缓存与『最近成功』基线
    let store = Store::in_memory().unwrap();
    let mut ok = FakeSource::new(vec![Scripted::Json(page(1, &["WI-1001"]))]);
    let good = run_sync(&mut ok, &store, &query(), 10).await.unwrap();

    let mut bad = FakeSource::new(vec![Scripted::Fail(BackendError::Auth {
        endpoint: EP.into(),
        challenge: Some(r#"Bearer error="invalid_token""#.into()),
        detail: "initialize 返回 401".into(),
    })]);
    let err = run_sync(&mut bad, &store, &query(), 10).await.unwrap_err();

    assert_eq!(err.kind(), ErrorKind::Auth, "鉴权失败不得混进连接失败");
    assert_eq!(store.count_items().unwrap(), 1, "失败的同步不得动已有缓存");

    let last = store.last_successful_sync().unwrap().unwrap();
    assert_eq!(last.id, good.run_id, "失败运行不得顶掉『最近成功』");

    let run = store.recent_runs(5).unwrap().remove(0);
    assert_eq!(run.status, RunStatus::Failed);
    assert_eq!(run.stop_reason, Some(StopReason::Error));
    assert_eq!(run.error_kind.as_deref(), Some("auth"));
    assert!(run.error_message.as_deref().unwrap().contains("invalid_token"), "WWW-Authenticate 原文要留给排查");
}

#[tokio::test]
async fn later_page_failure_keeps_earlier_pages_and_marks_run_failed() {
    let store = Store::in_memory().unwrap();
    let mut source = FakeSource::new(vec![
        Scripted::Json(page(4, &["WI-1001", "WI-2002"])),
        Scripted::Fail(BackendError::Connection { endpoint: EP.into(), detail: "连接被重置".into() }),
    ]);
    let err = run_sync(&mut source, &store, &query(), 10).await.unwrap_err();

    assert_eq!(err.kind(), ErrorKind::Connection);
    assert_eq!(store.count_items().unwrap(), 2, "第一页的数据不回滚");

    let run = store.recent_runs(5).unwrap().remove(0);
    assert_eq!(run.status, RunStatus::Failed);
    assert_eq!(run.pages_fetched, 1);
    assert_eq!(run.items_upserted, 2);
    assert!(store.last_successful_sync().unwrap().is_none(), "半套数据不算成功同步");
}

#[tokio::test]
async fn missing_in_later_complete_sync_leaves_current_list() {
    let store = Store::in_memory().unwrap();
    let mut s1 = FakeSource::new(vec![Scripted::Json(page(2, &["WI-1001", "WI-2002"]))]);
    run_sync(&mut s1, &store, &query(), 10).await.unwrap();

    // 第二次只返回其中一条：另一条已不属于本来源，必须移出当前清单。
    let mut s2 = FakeSource::new(vec![Scripted::Json(page(1, &["WI-1001"]))]);
    let r2 = run_sync(&mut s2, &store, &query(), 10).await.unwrap();
    assert!(r2.is_success());

    assert_eq!(store.count_items().unwrap(), 1);
    assert_eq!(store.query_items(&ItemFilter::default()).unwrap()[0].item.id.work_item_id, "WI-1001");
}

// ---------------------------------------------------------------- 错误分类

#[tokio::test]
async fn source_memberships_survive_overlap_failures_and_log_rotation() {
    let store = Store::in_memory().unwrap();
    let mut first = FakeSource::new(vec![Scripted::Json(page(2, &["shared", "gone"]))]);
    run_sync(&mut first, &store, &query(), 10).await.unwrap();
    let mut second = FakeSource::new(vec![Scripted::Json(page(2, &["shared", "other"]))]);
    sync_personal_todos(&mut second, &store, &query(), 10, None,
        SyncContext { trigger: RunTrigger::Manual, source_id: Some("second"), type_scope: None }).await.unwrap();
    store.prune_runs(1).unwrap();

    let memberships = store.query_items(&ItemFilter::default()).unwrap();
    let sources = |id: &str| {
        let mut ids = memberships.iter().find(|r| r.item.id.work_item_id == id)
            .unwrap().source_ids.clone();
        ids.sort();
        ids
    };
    assert_eq!(sources("shared"), vec!["fake", "second"]);
    assert_eq!(sources("gone"), vec!["fake"]);
    assert_eq!(sources("other"), vec!["second"]);

    // 取数失败、分页截断、条目解析失败均不得撤销旧归属。
    let mut failed = FakeSource::new(vec![Scripted::Json(page(3, &["new"])), Scripted::ToolError("offline")]);
    assert!(run_sync(&mut failed, &store, &query(), 10).await.is_err());
    let mut truncated = FakeSource::new(vec![Scripted::Json(page(3, &["new"]))]);
    assert!(!run_sync(&mut truncated, &store, &query(), 1).await.unwrap().complete);
    let mut rejected = FakeSource::new(vec![Scripted::Json(fixture("page_mixed_quality.json"))]);
    assert!(!run_sync(&mut rejected, &store, &query(), 10).await.unwrap().complete);
    assert!(store.query_items(&ItemFilter::default()).unwrap().iter().any(|r|r.item.id.work_item_id=="gone"));

    let mut empty = FakeSource::new(vec![Scripted::Json(page(0, &[]))]);
    run_sync(&mut empty, &store, &query(), 10).await.unwrap();
    let rows = store.query_items(&ItemFilter::default()).unwrap();
    assert_eq!(rows.len(), 2);
    assert!(rows.iter().all(|r| r.source_ids == vec!["second"]));
    assert!(rows.iter().any(|r| r.item.id.work_item_id == "shared"));
    assert!(rows.iter().any(|r| r.item.id.work_item_id == "other"));

    let mut empty = FakeSource::new(vec![Scripted::Json(page(0, &[]))]);
    sync_personal_todos(&mut empty, &store, &query(), 10, None,
        SyncContext { trigger: RunTrigger::Manual, source_id: Some("second"), type_scope: None }).await.unwrap();
    assert_eq!(store.count_items().unwrap(), 0);
}

#[tokio::test]
async fn narrowed_type_scope_preserves_previously_cached_items_even_when_absent_remotely() {
    let store = Store::in_memory().unwrap();
    let mut first = FakeSource::new(vec![Scripted::Json(page(1, &["old"]))]);
    run_sync(&mut first, &store, &query(), 10).await.unwrap();
    let scope = TypeScope::default();
    let mut second = FakeSource::new(vec![Scripted::Json(page(0, &[]))]);
    sync_personal_todos(&mut second, &store, &query(), 10, None,
        SyncContext { trigger: RunTrigger::Manual, source_id: Some("fake"), type_scope: Some(&scope) }).await.unwrap();
    assert_eq!(store.count_items().unwrap(), 1);
    // 恢复同步后，才依据远端完整结果清理已离开来源的事项。
    let mut third = FakeSource::new(vec![Scripted::Json(page(0, &[]))]);
    run_sync(&mut third, &store, &query(), 10).await.unwrap();
    assert_eq!(store.count_items().unwrap(), 0);
}

#[tokio::test]
async fn narrowed_scope_still_reconciles_enabled_types_and_skips_new_disabled_items() {
    let store = Store::in_memory().unwrap();
    let mut disabled = item("kept");
    disabled["work_item_info"]["work_item_type_key"] = json!("issue");
    let mut first = FakeSource::new(vec![Scripted::Json(json!({
        "total": 2, "list": [item("gone"), disabled]
    }))]);
    run_sync(&mut first, &store, &query(), 10).await.unwrap();
    let scope = TypeScope::from_pairs([("space_demo", "story")]);
    let mut skipped = item("skipped");
    skipped["work_item_info"]["work_item_type_key"] = json!("issue");
    let mut second = FakeSource::new(vec![Scripted::Json(json!({
        "total": 1, "list": [skipped]
    }))]);
    let report = sync_personal_todos(&mut second, &store, &query(), 10, None,
        SyncContext { trigger: RunTrigger::Manual, source_id: Some("fake"), type_scope: Some(&scope) }).await.unwrap();
    assert_eq!(report.items_out_of_scope, 1);
    let items = store.query_items(&ItemFilter::default()).unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].item.id.work_item_id, "kept");
    assert_eq!(items[0].source_ids, ["fake"]);
    assert_eq!(items[0].seen_count, 1, "跳过的类型不伪造刷新次数");
}

#[tokio::test]
async fn tool_error_is_not_reported_as_empty_success() {
    let store = Store::in_memory().unwrap();
    let mut source = FakeSource::new(vec![Scripted::ToolError("token expired")]);
    let err = run_sync(&mut source, &store, &query(), 10).await.unwrap_err();

    assert_eq!(err.kind(), ErrorKind::Tool, "isError=true 是工具错误，不是『待办为空』");
    assert!(err.to_string().contains("token expired"));
    assert_eq!(store.count_items().unwrap(), 0);
    let run = store.recent_runs(5).unwrap().remove(0);
    assert_eq!(run.error_kind.as_deref(), Some("tool"));
}

#[tokio::test]
async fn unknown_container_shape_is_parse_error_with_keys() {
    let store = Store::in_memory().unwrap();
    let mut source = FakeSource::new(vec![Scripted::Json(fixture("page_unknown_container.json"))]);
    let err = run_sync(&mut source, &store, &query(), 10).await.unwrap_err();

    assert_eq!(err.kind(), ErrorKind::Parse);
    let msg = err.to_string();
    assert!(msg.contains("code") && msg.contains("data"), "要把顶层键交出来供适配: {msg}");
    assert!(!msg.contains("成功"), "解析失败不得被说成成功");
}

#[tokio::test]
async fn non_json_text_is_parse_error() {
    let store = Store::in_memory().unwrap();
    let mut source = FakeSource::new(vec![Scripted::Text("502 Bad Gateway: no healthy upstream")]);
    let err = run_sync(&mut source, &store, &query(), 10).await.unwrap_err();

    assert_eq!(err.kind(), ErrorKind::Parse);
    assert!(err.to_string().contains("不是 JSON"), "要说明是『非 JSON』而不是空清单: {err}");
}

// ---------------------------------------------------------------- 质量统计 / 参数透传

#[tokio::test]
async fn mixed_quality_page_counts_rejections_by_code() {
    let store = Store::in_memory().unwrap();
    let mut source = FakeSource::new(vec![Scripted::Json(fixture("page_mixed_quality.json"))]);
    let report = run_sync(&mut source, &store, &query(), 10).await.unwrap();

    assert!(!report.is_success(), "存在无法识别的事项时不能用部分结果替换清单");
    assert!(!report.complete);
    assert_eq!(report.items_received, 3);
    assert_eq!(report.items_upserted, 1);
    assert_eq!(report.items_rejected, 2);
    let codes: Vec<&str> = report.rejections.iter().map(|s| s.code.as_str()).collect();
    assert_eq!(codes, vec!["item_shape_mismatch", "missing_work_item_id"], "按原因码聚合且可数");
    assert_eq!(store.count_items().unwrap(), 1);

    let run = store.recent_runs(5).unwrap().remove(0);
    let detail = run.rejection_detail.expect("拒绝明细要落库");
    assert!(detail.contains("item_shape_mismatch") && detail.contains("missing_work_item_id"));
}

#[tokio::test]
async fn sync_arguments_carry_config_and_increment_pages() {
    let store = Store::in_memory().unwrap();
    let mut source = FakeSource::new(vec![
        Scripted::Json(page(2, &["WI-1001"])),
        Scripted::Json(page(2, &["WI-2002"])),
    ]);
    let q = PersonalTodoQuery { action: TodoAction::Overdue, todo_scope: Some(TodoScope::All), asset_key: None };
    run_sync(&mut source, &store, &q, 10).await.unwrap();

    let calls = source.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0]["action"], json!("overdue"));
    assert_eq!(calls[0]["todo_scope"], json!("all"));
    assert_eq!(calls[0]["page_num"], json!(1));
    assert_eq!(calls[1]["page_num"], json!(2));
    assert!(!calls[0].contains_key("asset_key"), "未配置的可选参数不得出现在请求里");
}

// ---------------------------------------------------------------- checkai 补齐覆盖

#[tokio::test]
async fn failed_run_message_is_redacted_with_loaded_secret() {
    let store = Store::in_memory().unwrap();
    let secret = "TK-SECRET-0123456789";
    let mut source = FakeSource::new(vec![Scripted::Fail(BackendError::Tool {
        tool: "list_todo".into(),
        code: Some(-32000),
        message: format!("upstream echoed the request header: {secret}"),
    })]);
    let _err = sync_personal_todos(
        &mut source,
        &store,
        &query(),
        10,
        Some(secret),
        SyncContext { trigger: RunTrigger::Manual, source_id: None, type_scope: None },
    )
    .await
    .unwrap_err();

    let run = store.recent_runs(5).unwrap().remove(0);
    let msg = run.error_message.expect("失败原因要落库");
    assert!(!msg.contains(secret), "台账里不得出现凭证原文: {msg}");
    assert!(msg.contains("***"), "擦除痕迹可见: {msg}");
}

#[tokio::test]
async fn unlimited_sync_reads_beyond_twenty_pages_until_total() {
    let store = Store::in_memory().unwrap();
    let script = (1..=25).map(|n| Scripted::Json(page(25, &[&n.to_string()]))).collect();
    let mut source = FakeSource::new(script);
    let report = run_sync(&mut source, &store, &query(), 0).await.unwrap();
    assert!(report.complete);
    assert_eq!(report.pages_fetched, 25);
    assert_eq!(report.items_received, 25);
    assert_eq!(store.count_items().unwrap(), 25);
    assert_eq!(source.call_count(), 25);
}

#[tokio::test]
async fn query_filters_cover_project_type_flow_text_and_identity_flags() {
    fn item_named(id: &str, project: Option<&str>, type_key: &str, name: &str) -> Value {
        json!({
            "project_key": project,
            "work_item_info": { "work_item_id": id, "work_item_type_key": type_key, "work_item_name": name },
            "node_info": { "node_name": "研发中", "node_state_key": "developing" },
            "state_info": { "start_state_key_name": "", "end_state_key_name": "" }
        })
    }
    let store = Store::in_memory().unwrap();
    let mut source = FakeSource::new(vec![Scripted::Json(json!({ "total": 3, "list": [
        item_named("F-1", Some("space_demo"), "story", "甲任务"),
        item_named("F-2", Some("space_two"), "issue", "乙缺陷"),
        item_named("F-3", None, "story", "丙任务"),
    ]}))]);
    run_sync(&mut source, &store, &query(), 10).await.unwrap();

    let ids = |items: Vec<fstodo_backend::CachedItem>| -> Vec<String> {
        items.into_iter().map(|c| c.item.id.work_item_id).collect()
    };
    assert_eq!(ids(store.query_items(&ItemFilter { project_key: Some("space_demo".into()), ..Default::default() }).unwrap()), vec!["F-1"]);
    assert_eq!(ids(store.query_items(&ItemFilter { type_key: Some("issue".into()), ..Default::default() }).unwrap()), vec!["F-2"]);
    assert_eq!(ids(store.query_items(&ItemFilter { flow: Some(FlowKind::Node), ..Default::default() }).unwrap()).len(), 3);
    assert_eq!(ids(store.query_items(&ItemFilter { text: Some("乙".into()), ..Default::default() }).unwrap()), vec!["F-2"]);
    assert_eq!(store.query_items(&ItemFilter { limit: Some(2), offset: Some(2), ..Default::default() }).unwrap().len(), 1);

    // 缺 project_key 的行：走真实 SQLite 验证哨兵 + flags，而不是只在内存模型里
    let row = store.query_items(&ItemFilter::default()).unwrap().into_iter().find(|c| c.item.id.work_item_id == "F-3").unwrap();
    assert_eq!(row.identity_missing_flags, vec!["project_key".to_string()]);
    assert_eq!(row.item.id.project_key, None, "缺失段读回来还是 None，不被哨兵伪装成空空间名");

    // 隔一段时间再同步：首见时间不得被覆盖，且时钟必须已前进，否则该断言不可证伪
    tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    let mut s2 = FakeSource::new(vec![Scripted::Json(json!({ "total": 1, "list": [item_named("F-3", None, "story", "丙任务")] }))]);
    run_sync(&mut s2, &store, &query(), 10).await.unwrap();
    let row2 = store.query_items(&ItemFilter::default()).unwrap().into_iter().find(|c| c.item.id.work_item_id == "F-3").unwrap();
    assert!(row2.last_seen_at_ms > row.first_seen_at_ms, "第二次同步必须晚于首见时刻，这保证下一条断言可证伪");
    assert_eq!(row2.first_seen_at_ms, row.first_seen_at_ms, "首见时间一经写入不再改（若 UPSERT 覆盖，此刻已能被看出）");
    assert_eq!(row2.seen_count, 2);
}

#[tokio::test]
async fn text_filter_escapes_like_metacharacters() {
    fn named(id: &str, name: &str) -> Value {
        json!({
            "project_key": "space_demo",
            "work_item_info": { "work_item_id": id, "work_item_type_key": "story", "work_item_name": name },
            "node_info": { "node_name": "研发中", "node_state_key": "developing" },
            "state_info": { "start_state_key_name": "", "end_state_key_name": "" }
        })
    }
    let store = Store::in_memory().unwrap();
    let mut source = FakeSource::new(vec![Scripted::Json(json!({ "total": 4, "list": [
        named("E-1", "含元字符%尾"),
        named("E-2", "含元字符X尾"),
        named("E-3", "含元字符_尾"),
        named("E-4", "含元字符\\尾"),
    ]}))]);
    run_sync(&mut source, &store, &query(), 10).await.unwrap();

    // 若 % 未转义，会被当通配符：E-2 也会命中
    let hit = store.query_items(&ItemFilter { text: Some("%尾".into()), ..Default::default() }).unwrap();
    assert_eq!(hit.len(), 1, "LIKE 元字符必须按字面匹配");
    assert_eq!(hit[0].item.id.work_item_id, "E-1");

    // 若 _ 未转义，它匹配任意单字符：E-2 的「X尾」也会命中
    let hit = store.query_items(&ItemFilter { text: Some("_尾".into()), ..Default::default() }).unwrap();
    assert_eq!(hit.len(), 1, "_ 必须按字面匹配");
    assert_eq!(hit[0].item.id.work_item_id, "E-3");

    // 若 \ 未转义，它被 ESCAPE 字符吃掉变成字面「尾」：四条全命中
    let hit = store.query_items(&ItemFilter { text: Some("\\尾".into()), ..Default::default() }).unwrap();
    assert_eq!(hit.len(), 1, "\\ 本身也是元字符");
    assert_eq!(hit[0].item.id.work_item_id, "E-4");
}

#[tokio::test]
async fn duplicate_identity_within_one_page_counts_as_updated_not_inserted() {
    let store = Store::in_memory().unwrap();
    // 同一页里两条同身份记录（后一条改名）：第二条必须计为 updated
    let first = item("D-1");
    let mut second = item("D-1");
    second["work_item_info"]["work_item_name"] = json!("改名后的 D-1");
    let mut source = FakeSource::new(vec![Scripted::Json(json!({ "total": 2, "list": [first, second] }))]);
    let report = run_sync(&mut source, &store, &query(), 10).await.unwrap();
    assert_eq!(
        (report.items_inserted, report.items_updated),
        (1, 1),
        "同批重复身份的第二条应计为 updated，与 SQLite 实际效果一致"
    );
    let rows = store.query_items(&ItemFilter::default()).unwrap();
    assert_eq!(rows.len(), 1, "同一身份不得产生两行");
    assert_eq!(rows[0].item.name.as_deref(), Some("改名后的 D-1"), "同批内后到者覆盖前者");
}

// ---------------------------------------------------------------- 类型范围与台账轮转

/// 类型范围是**本地**过滤：远端仍按「与我相关」返回全部事项，不在范围内的不入库，
/// 并单独计 `items_out_of_scope`——它和 `items_rejected`（数据形状不对）是两回事。
#[tokio::test]
async fn type_scope_filters_locally_and_counts_out_of_scope() {
    let store = Store::in_memory().unwrap();
    let mut source = FakeSource::new(vec![Scripted::Json(page(2, &["a", "b"]))]);
    let scope = TypeScope::from_pairs([("space_demo", "issue")]);
    let report = sync_personal_todos(
        &mut source,
        &store,
        &query(),
        10,
        None,
        SyncContext {
            trigger: RunTrigger::Automatic,
            source_id: Some("personal-todo"),
            type_scope: Some(&scope),
        },
    )
    .await
    .unwrap();
    assert_eq!(report.items_received, 2, "远端确实给了两条");
    assert_eq!(report.items_upserted, 0, "类型不在范围内就不该入库");
    assert_eq!(report.items_out_of_scope, 2, "被范围挡掉的条数必须单独看得见");
    assert_eq!(report.items_rejected, 0, "范围过滤不是数据异常");
    assert_eq!(report.trigger, RunTrigger::Automatic);
    assert_eq!(report.source_id.as_deref(), Some("personal-todo"));
    assert_eq!(store.count_items().unwrap(), 0);

    // 放开范围：同一批数据必须照常入库。
    let store2 = Store::in_memory().unwrap();
    let mut source2 = FakeSource::new(vec![Scripted::Json(page(2, &["a", "b"]))]);
    let allowed = TypeScope::from_pairs([("space_demo", "story")]);
    let ok = sync_personal_todos(
        &mut source2,
        &store2,
        &query(),
        10,
        None,
        SyncContext { trigger: RunTrigger::Manual, source_id: None, type_scope: Some(&allowed) },
    )
    .await
    .unwrap();
    assert_eq!(ok.items_upserted, 2);
    assert_eq!(ok.items_out_of_scope, 0);
    assert_eq!(store2.count_items().unwrap(), 2);

    let runs = store2.recent_runs(10).unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].trigger, RunTrigger::Manual, "台账要能看出是谁发起的");
    assert_eq!(runs[0].source_id, None);
    assert_eq!(runs[0].items_out_of_scope, 0);
}

/// 空范围 = 明确「什么都不拉」，绝不能被当成「没配置」而退回全量。
#[tokio::test]
async fn empty_scope_means_pull_nothing_not_everything() {
    let store = Store::in_memory().unwrap();
    let mut source = FakeSource::new(vec![Scripted::Json(page(2, &["a", "b"]))]);
    let empty = TypeScope::default();
    let report = sync_personal_todos(
        &mut source,
        &store,
        &query(),
        10,
        None,
        SyncContext { trigger: RunTrigger::Manual, source_id: None, type_scope: Some(&empty) },
    )
    .await
    .unwrap();
    assert_eq!(report.items_out_of_scope, 2, "空集合也是有效范围：全部挡掉");
    assert_eq!(report.items_upserted, 0);
    assert!(report.is_success(), "被范围挡掉不是同步失败，不许记成 failed");
}

/// 没配置范围时必须是 `None`（全量），行为与升级前完全一致。
#[test]
fn unconfigured_scope_is_none_and_prune_is_conservative() {
    let store = Store::in_memory().unwrap();
    assert!(store.source_type_scope("personal-todo").unwrap().is_none());

    for _ in 0..5 {
        let id = store.begin_run("todo", None, RunTrigger::Automatic, None, 1).unwrap();
        store
            .finish_run(
                id,
                RunStatus::Success,
                1,
                1,
                1,
                0,
                0,
                None,
                Some(StopReason::EmptyPage),
                None,
                None,
                &Default::default(),
                2,
            )
            .unwrap();
    }
    // 再留一条没收尾的 running：那是异常现场，轮转不许碰。
    store.begin_run("todo", None, RunTrigger::Automatic, None, 3).unwrap();
    assert_eq!(store.recent_runs(100).unwrap().len(), 6);
    assert_eq!(store.prune_runs(2).unwrap(), 3, "只删已结束的旧行，保留最新 2 条");
    let left = store.recent_runs(100).unwrap();
    assert_eq!(left.len(), 3);
    assert!(left.iter().any(|r| r.status == RunStatus::Running), "running 行永不删");
    assert_eq!(store.prune_runs(0).unwrap(), 0, "0 = 关闭轮转");
    assert_eq!(store.recent_runs(100).unwrap().len(), 3);
}

/// 类型快照与范围选择：确认过但一个都不选，必须与「从未确认」区分开。
#[test]
fn confirmed_empty_scope_is_not_confused_with_unconfigured() {
    let store = Store::in_memory().unwrap();
    store
        .save_source_types(
            "s1",
            &[
                CachedType {
                    project_key: "p1".into(),
                    project_name: "空间一".into(),
                    type_key: "story".into(),
                    type_name: "需求".into(),
                    discovered_at_ms: 0,
                },
                CachedType {
                    project_key: "p1".into(),
                    project_name: "空间一".into(),
                    type_key: "issue".into(),
                    type_name: "缺陷".into(),
                    discovered_at_ms: 0,
                },
                CachedType {
                    project_key: "p2".into(),
                    project_name: "空间二".into(),
                    type_key: "story".into(),
                    type_name: "需求".into(),
                    discovered_at_ms: 0,
                },
            ],
            10,
        )
        .unwrap();
    assert_eq!(store.source_types("s1").unwrap().len(), 3);

    // 选一个跨空间重名的类型：只应展开出它真正存在的那些 (空间, 类型)。
    store.set_source_type_scope("s1", &["story".to_string()], 20).unwrap();
    let scope = store.source_type_scope("s1").unwrap().expect("已确认过");
    assert_eq!(scope.len(), 2, "story 在两个空间各一条");
    assert!(scope.allows("p1", "story") && scope.allows("p2", "story"));
    assert!(!scope.allows("p1", "issue"), "没选的类型不能混进来");

    // 明确一个都不选。
    store.set_source_type_scope("s1", &[], 30).unwrap();
    let empty = store.source_type_scope("s1").unwrap().expect("确认过就是 Some");
    assert!(empty.is_empty());
    assert!(!empty.allows("p1", "story"), "空集就是什么都不放行");

    // 另一个来源从未确认过，不受影响。
    assert!(store.source_type_scope("s2").unwrap().is_none());
}

#[test]
fn new_types_default_on_and_disabled_preferences_survive_discovery_and_other_edits() {
    let store = Store::in_memory().unwrap();
    let known = |key: &str, project: &str| CachedType {
        project_key: project.into(), type_key: key.into(), ..Default::default()
    };
    store.save_source_types("s1", &[known("off", "p1"), known("on", "p1")], 1).unwrap();
    store.set_source_type_scope("s1", &["on".into()], 2).unwrap();
    let scope = store.source_type_scope("s1").unwrap().unwrap();
    assert!(!scope.allows("p1", "off"));
    assert!(!scope.allows("new-project", "off"));
    assert!(scope.allows("p1", "new-type"), "首次发现前也不能过滤新类型事项");
    store.save_source_types("s1", &[known("on", "p1"), known("new-type", "p1")], 3).unwrap();
    assert_eq!(store.source_type_scope("s1").unwrap().unwrap().len(), 2);
    store.set_source_type_scope("s1", &["new-type".into()], 4).unwrap();
    store.save_source_types("s1", &[known("off", "p1"), known("on", "p1"), known("new-type", "p1")], 5).unwrap();
    let scope = store.source_type_scope("s1").unwrap().unwrap();
    assert!(!scope.allows("p1", "off"), "修改其他开关不能丢掉暂时未发现类型的关闭配置");
    assert!(!scope.allows("p1", "on"));
    assert!(scope.allows("p1", "new-type"));
    assert!(store.source_type_scope("s2").unwrap().is_none());
    store.set_source_type_scope("s1", &[], 6).unwrap();
    let empty = store.source_type_scope("s1").unwrap().unwrap();
    assert!(empty.is_empty());
    assert!(empty.allows("p1", "future"), "关闭已知类型不关闭未来新类型");
    store.clear_source_type_scope("s1").unwrap();
    assert!(store.source_type_scope("s1").unwrap().is_none());
}

#[tokio::test]
async fn persisted_type_configuration_accepts_new_type_items_before_discovery() {
    let store = Store::in_memory().unwrap();
    store.save_source_types("fake", &[CachedType {
        project_key: "space_demo".into(), type_key: "issue".into(), ..Default::default()
    }], 1).unwrap();
    store.set_source_type_scope("fake", &[], 2).unwrap();
    let scope = store.source_type_scope("fake").unwrap().unwrap();
    let mut source = FakeSource::new(vec![Scripted::Json(page(1, &["new-story"]))]);
    sync_personal_todos(&mut source, &store, &query(), 10, None,
        SyncContext { trigger: RunTrigger::Manual, source_id: Some("fake"), type_scope: Some(&scope) }).await.unwrap();
    assert_eq!(store.count_items().unwrap(), 1);
    assert!(!store.source_type_scope("fake").unwrap().unwrap().allows("space_demo", "issue"),
        "同步结束不重置用户持续保留的关闭配置");
}

/// 动作台账：幂等键重复必须被拒；收尾只能改 pending 行。
#[test]
fn action_ledger_is_idempotent_and_single_finish() {
    let store = Store::in_memory().unwrap();
    let record = ActionRecord {
        request_id: "r1".into(),
        item_id: "p|story|1".into(),
        action_kind: "node_confirm".into(),
        target: "state_fixture".into(),
        version: "v1:abc".into(),
        status: "pending".into(),
        verified: false,
        detail: None,
        created_at: 1,
        finished_at: None,
    };
    assert!(store.begin_action(&record).unwrap(), "第一次登记应当成功");
    assert!(!store.begin_action(&record).unwrap(), "同一个 request_id 不许登记第二次（=不重复写）");
    let second = ActionRecord { request_id: "r2".into(), ..record.clone() };
    assert!(!store.begin_action(&second).unwrap(), "同一事项的不同请求也不能交错写入");
    let other = ActionRecord { request_id: "other".into(), item_id: "p2|story|1".into(), ..record.clone() };
    assert!(store.begin_action(&other).unwrap(), "其他空间的同编号事项独立提交");

    store.finish_action("r1", "verified", true, None, 2).unwrap();
    let rows = store.recent_actions("p|story|1", 10).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].status, "verified");
    assert!(rows[0].verified);

    // 已收尾的行不能被再次改写（结果不确定的记录不能被后来的人顺手改成成功）。
    store.finish_action("r1", "failed", false, Some("手滑"), 3).unwrap();
    let rows = store.recent_actions("p|story|1", 10).unwrap();
    assert_eq!(rows[0].status, "verified", "只有 pending 行能被收尾");
    assert_eq!(rows[0].detail, None);
    assert!(store.begin_action(&second).unwrap(), "结束后允许新请求，由执行层重新校验远端版本");
}

/// 把一条带完整身份的事项写进缓存。`cached_identity` 只看 (空间, 类型, 编号) 三段。
fn seed_identity(store: &Store, run_id: i64, project: &str, type_key: &str, id: &str) {
    let payload = ToolResultPayload::from_json(json!({
        "total": 1,
        "list": [{
            "project_key": project,
            "project_name": format!("空间 {project}"),
            "work_item_info": {
                "work_item_id": id,
                "work_item_type_key": type_key,
                "work_item_name": format!("事项 {id}")
            },
            "node_info": { "node_name": "研发中", "node_state_key": "developing" },
            "state_info": { "start_state_key_name": "", "end_state_key_name": "" }
        }]
    }));
    let parsed = parse_todo_page("list_todo", &payload).expect("种子数据必须可解析");
    let mut items = Vec::new();
    for record in &parsed.items {
        items.push(to_work_item(record).unwrap());
    }
    store.upsert_items(run_id, &items, 1).unwrap();
}

/// 只敲编号时的身份补齐：缓存里唯一一条给得出，跨空间撞号必须拒——
/// 这个身份是要拿去写远端的，猜错就是改了别的事项。
#[test]
fn cached_identity_resolves_unique_id_and_refuses_ambiguity() {
    let store = Store::in_memory().unwrap();
    let run = store.begin_run("todo", None, RunTrigger::Manual, None, 1).unwrap();

    assert_eq!(store.cached_identity("9001").unwrap(), None, "缓存里没有就不编造");

    seed_identity(&store, run, "space_a", "story", "9001");
    assert_eq!(
        store.cached_identity("9001").unwrap(),
        Some(("space_a".to_string(), "story".to_string())),
        "只有一种身份时按缓存补齐"
    );

    // 同一编号又出现在另一个空间：此时任何一种猜测都有一半是错的。
    seed_identity(&store, run, "space_b", "issue", "9001");
    let ambiguous = store.cached_identity("9001").unwrap_err();
    assert_eq!(
        ambiguous.kind(),
        ErrorKind::Conflict,
        "撞号要报冲突，退出码得跟普通校验错分开"
    );
    assert!(
        ambiguous.to_string().contains("--project"),
        "错误里要直接给出补救办法，实际文本：{ambiguous}"
    );
}

/// `types use --clear` 的语义：清除后回到「未确认 = 全量」，
/// 不能留下一个「已确认但为空」的范围——那是完全相反的行为。
#[test]
fn clear_scope_returns_to_unconfigured_full_sync() {
    let store = Store::in_memory().unwrap();
    store
        .save_source_types(
            "s1",
            &[CachedType {
                project_key: "p1".into(),
                project_name: "空间一".into(),
                type_key: "story".into(),
                type_name: "需求".into(),
                discovered_at_ms: 10,
            }],
            10,
        )
        .unwrap();
    store.set_source_type_scope("s1", &["story".to_string()], 20).unwrap();
    assert!(store.source_type_scope("s1").unwrap().is_some(), "先确认出一个非空范围");

    assert!(store.clear_source_type_scope("s1").unwrap(), "确有配置可清");
    assert!(
        store.source_type_scope("s1").unwrap().is_none(),
        "清除后必须回到未确认=全量"
    );
    assert!(!store.clear_source_type_scope("s1").unwrap(), "再清一次没东西可删");
    assert!(
        !store.source_types("s1").unwrap().is_empty(),
        "清范围不许顺手把类型快照也清掉"
    );
}

/// 台账的状态取值受限：任意字符串落库，以后读台账的人和幂等判断都看不懂。
#[test]
fn action_ledger_rejects_unknown_status() {
    let store = Store::in_memory().unwrap();
    store
        .begin_action(&ActionRecord {
            request_id: "r9".into(),
            item_id: "p|story|1".into(),
            action_kind: "node_confirm".into(),
            target: "state_1".into(),
            version: "v1:x".into(),
            status: "pending".into(),
            verified: false,
            detail: None,
            created_at: 1,
            finished_at: None,
        })
        .unwrap();

    // detail 与 verified=true 一起递进去：若校验只挡 status 却先把别的列写了，
    // 下面读回来的行就会留下被污染的证据。
    let err = store
        .finish_action("r9", "ok", true, Some("不该落到台账里的收尾内容"), 2)
        .unwrap_err();
    assert_eq!(err.kind(), ErrorKind::Validation, "台账外的状态值不许写进去");
    assert!(
        err.safe_message(None).contains("只支持"),
        "拒绝时要说明允许哪些状态，别只说「不行」"
    );

    let pending = store.recent_actions("p|story|1", 10).unwrap().remove(0);
    assert_eq!(pending.status, "pending", "被拒的收尾不许改动状态");
    assert!(!pending.verified, "被拒的收尾不许把 verified 置真");
    assert_eq!(pending.detail, None, "被拒的收尾不许把 detail 写进行里");
    assert_eq!(pending.finished_at, None, "被拒的收尾不许盖上完成时间");

    for (status, verified) in [("unknown", true), ("failed", true), ("verified", false)] {
        assert_eq!(store.finish_action("r9", status, verified, None, 3).unwrap_err().kind(), ErrorKind::Validation);
    }
    assert_eq!(store.recent_actions("p|story|1", 10).unwrap()[0].status, "pending");
    store.finish_action("r9", "unknown", false, None, 3).unwrap();
    let rows = store.recent_actions("p|story|1", 10).unwrap();
    assert_eq!(rows[0].status, "unknown", "三个合法状态照常可写");
    assert_eq!(rows[0].finished_at, Some(3), "合法收尾要落上完成时间");

    // 结论已定就不许再被后续收尾改写：台账是幂等判断的唯一依据
    store.finish_action("r9", "verified", true, Some("迟到的结论"), 4).unwrap();
    let rows = store.recent_actions("p|story|1", 10).unwrap();
    assert_eq!(rows[0].status, "unknown", "只改写 pending 行，已定结论不许覆盖");
    assert_eq!(rows[0].detail, None, "迟到的 detail 同样不许覆盖已定结论");
}
