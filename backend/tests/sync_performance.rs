use std::{collections::HashMap, sync::{Arc, Mutex, atomic::{AtomicUsize, Ordering}}, time::Duration};

use async_trait::async_trait;
use fstodo_backend::{
    mcp::parse_todo_page, model::{domain::to_work_item, source::*}, source_query::{DetailCache, SourceReader},
    sync::sync_personal_todos, BackendError, ConnectionInfo, RunStatus, RunTrigger,
    Store, SyncContext, TodoSource, ToolResultPayload, WorkItemId,
};
use serde_json::{json, Map, Value};

struct DelayedSource {
    pages: Vec<Vec<&'static str>>,
    calls: Mutex<HashMap<String, usize>>,
    active: AtomicUsize,
    peak: AtomicUsize,
    fail: Option<&'static str>,
    versions: HashMap<String, String>,
}

impl DelayedSource {
    fn new(pages: Vec<Vec<&'static str>>) -> Self {
        Self { pages, calls: Mutex::new(HashMap::new()), active: AtomicUsize::new(0), peak: AtomicUsize::new(0), fail: None, versions: HashMap::new() }
    }
    fn count(&self, id: &str) -> usize { *self.calls.lock().unwrap().get(id).unwrap_or(&0) }
}

fn id(n: &str) -> WorkItemId {
    WorkItemId { project_key: Some("p".into()), work_item_type_key: Some("story".into()), work_item_id: n.into() }
}

fn brief(n: &str) -> Value {
    json!({"work_item_attribute":{"owned_project":{"key":"p","name":"空间"},
        "work_item_id":n,"work_item_type":{"key":"story"},"work_item_name":format!("需求{n}"),"work_item_mod":"节点流"},
        "work_item_fields":[{"key":"description","value":"完整描述"}],
        "work_item_current_node":[],"pagination":{"has_more":false}})
}

#[async_trait]
impl TodoSource for DelayedSource {
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> { unreachable!() }
    async fn close(&mut self) {}
    async fn call_tool(&self, tool: &str, args: &Map<String, Value>) -> Result<ToolResultPayload, BackendError> {
        if tool == "list_todo" {
            let page = args["page_num"].as_u64().unwrap() as usize;
            let rows: Vec<Value> = self.pages.get(page - 1).into_iter().flatten().enumerate().map(|(i, n)| {
                json!({"project_key":"p","remote_version":self.versions.get(*n),"work_item_info":{"work_item_type_key":"story","work_item_id":n},
                    "node_info":{"node_name":format!("本人节点-{page}-{i}"),"node_state_key":format!("{page}-{i}")}})
            }).collect();
            return Ok(ToolResultPayload::from_json(json!({"list":rows,"total":self.pages.iter().map(Vec::len).sum::<usize>()})));
        }
        assert_eq!(tool, "get_workitem_brief");
        assert_eq!(args["fields"], json!(["_all"]));
        let n = args["work_item_id"].as_str().unwrap();
        *self.calls.lock().unwrap().entry(n.to_owned()).or_default() += 1;
        let active = self.active.fetch_add(1, Ordering::SeqCst) + 1;
        self.peak.fetch_max(active, Ordering::SeqCst);
        // 交错完成，检查结果顺序与原始清单一致。
        tokio::time::sleep(Duration::from_millis(if n == "1" { 45 } else { 25 })).await;
        self.active.fetch_sub(1, Ordering::SeqCst);
        if self.fail == Some(n) { return Err(BackendError::parse("测试详情", "模拟读取失败")); }
        Ok(ToolResultPayload::from_json(brief(n)))
    }
}

fn config(name: &str) -> WorkSource {
    WorkSource { id: name.into(), enabled: true, kind: SourceKind::PersonalTodo,
        todo: Some(query()), association_rule: None }
}
fn query() -> PersonalTodoQuery {
    PersonalTodoQuery { action: TodoAction::Todo, todo_scope: None, asset_key: None }
}

#[tokio::test]
async fn concurrent_details_preserve_order_without_old_four_request_cap() {
        let fake = DelayedSource::new(vec![vec!["1", "2", "3", "4", "5", "6", "7", "8"]]);
        let store = Store::in_memory().unwrap();
        let config = config("a");
        let reader = SourceReader::new(&fake, &config, &store, None, 5)
            .with_cache(Arc::new(DetailCache::default()));
        let payload = reader.call_list_todo(&query().to_arguments(1)).await.unwrap();
        let page = parse_todo_page("test", &payload).unwrap();
        let names: Vec<_> = page.items.iter().map(|r| to_work_item(r).unwrap().id.work_item_id).collect();
        assert_eq!(names, ["1", "2", "3", "4", "5", "6", "7", "8"]);
        assert_eq!(fake.peak.load(Ordering::SeqCst), 8);
        let p = reader.sync_performance();
        assert_eq!(p.detail_items_fetched, 8);
        assert_eq!(p.requests["get_workitem_brief"].count, 8);
        assert_eq!(p.requests["list_todo"].count, 1);
        assert_eq!(p.peak_in_flight, 8);
}

#[tokio::test]
async fn round_cache_deduplicates_pages_and_sources_but_not_future_rounds() {
    let fake = DelayedSource::new(vec![vec!["1", "2", "1"], vec!["2", "3"]]);
    let store = Store::in_memory().unwrap();
    let shared = Arc::new(DetailCache::default());
    for (name, hits) in [("a", 2), ("b", 5)] {
        let config = config(name);
        let mut reader = SourceReader::new(&fake, &config, &store, None, 5).with_cache(shared.clone());
        let report = sync_personal_todos(&mut reader, &store, &query(), 5, None,
            SyncContext { trigger: RunTrigger::Manual, source_id: Some(name), type_scope: None }).await.unwrap();
        assert!(report.complete);
        assert_eq!(report.items_received, 5);
        assert_eq!(report.pages_fetched, 2);
        assert_eq!(report.performance.detail_cache_hits, hits);
        let saved = store.recent_runs(1).unwrap().remove(0).performance.unwrap();
        assert_eq!(saved.detail_cache_hits, hits);
        assert_eq!(saved.requests["list_todo"].count, 2);
    }
    for n in ["1", "2", "3"] { assert_eq!(fake.count(n), 1); }
    let rows = store.query_items(&Default::default()).unwrap();
    assert_eq!(rows.len(), 3);
    assert!(rows.iter().all(|r| r.source_ids == ["a", "b"]));
    let config = config("next-round");
    let reader = SourceReader::new(&fake, &config, &store, None, 5);
    let payload = reader.call_list_todo(&query().to_arguments(1)).await.unwrap();
    let page = parse_todo_page("test", &payload).unwrap();
    let nodes: Vec<_> = page.items.iter().map(|r| to_work_item(r).unwrap().flow.node_name.unwrap()).collect();
    assert_eq!(nodes, ["本人节点-1-0", "本人节点-1-1", "本人节点-1-2"]);
    assert_eq!(fake.count("1"), 2);
    assert_eq!(fake.count("2"), 2);
}

#[tokio::test]
async fn failed_detail_preserves_membership_and_cache_and_can_retry_in_same_round() {
    let store = Store::in_memory().unwrap();
    let config = config("a");
    let good = DelayedSource::new(vec![vec!["1", "2"]]);
    let mut warm = SourceReader::new(&good, &config, &store, None, 5);
    let ctx = || SyncContext { trigger: RunTrigger::Manual, source_id: Some("a"), type_scope: None };
    sync_personal_todos(&mut warm, &store, &query(), 5, None, ctx()).await.unwrap();
    let previous = store.item_detail(&id("2")).unwrap().unwrap();
    let mut bad = DelayedSource::new(vec![vec!["1", "2", "3"]]);
    bad.fail = Some("2");
    let cache = Arc::new(DetailCache::default());
    let mut failing = SourceReader::new(&bad, &config, &store, None, 5).with_cache(cache.clone());
    assert!(sync_personal_todos(&mut failing, &store, &query(), 5, None, ctx()).await.is_err());
    assert_eq!(store.count_items().unwrap(), 2);
    assert_eq!(store.item_detail(&id("2")).unwrap().unwrap().fetched_at_ms, previous.fetched_at_ms);
    let run = store.recent_runs(1).unwrap().remove(0);
    assert_eq!(run.status, RunStatus::Failed);
    assert_eq!(run.performance.unwrap().requests["get_workitem_brief"].failed, 1);
    let retry = DelayedSource::new(vec![vec!["2"]]);
    let reader = SourceReader::new(&retry, &config, &store, None, 5).with_cache(cache);
    reader.call_list_todo(&query().to_arguments(1)).await.unwrap();
    assert_eq!(retry.count("2"), 1, "失败不能被当成已完成详情复用");
}

#[test]
fn removed_request_settings_are_rejected_and_old_run_migration_is_preserved() {
    use fstodo_backend::config::Config;
    let dir = std::env::temp_dir().join(format!("fstodo-perf-config-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("config.toml");
    for key in ["detail_concurrency", "check_concurrency", "request_timeout_secs"] {
        std::fs::write(&path, format!("{key}=4")).unwrap();
        assert!(Config::load(Some(&path), None).is_err(), "不兼容已删除配置 {key}");
    }
    let db = dir.join("old.db");
    let store = Store::open(&db).unwrap();
    store.begin_run("todo", None, RunTrigger::Manual, Some("a"), 1).unwrap();
    drop(store);
    let old = rusqlite::Connection::open(&db).unwrap();
    old.execute_batch("ALTER TABLE sync_run DROP COLUMN performance_json; PRAGMA user_version=6;").unwrap();
    drop(old);
    let reopened = Store::open(&db).unwrap();
    assert!(reopened.recent_runs(1).unwrap()[0].performance.is_none());
    drop(reopened);
    std::fs::remove_dir_all(dir).unwrap();
}
#[tokio::test]
async fn persistent_versions_only_fetch_changes_and_refreshes_and_reconcile_all_members() {
    let store = Store::in_memory().unwrap();
    let a = config("a");
    let b = config("b");
    let evidence = ["field", "status", "people", "node", "schedule"].map(String::from);
    store.record_version_evidence(&a, "remote_version", &evidence).unwrap();
    store.record_version_evidence(&b, "remote_version", &evidence).unwrap();
    let mut fake = DelayedSource::new(vec![vec!["1", "2"]]);
    fake.versions = [("1".into(),"v1".into()),("2".into(),"v1".into())].into();
    for source in [&a,&b,&a] {
        let mut reader = SourceReader::new(&fake, source, &store, None, 5);
        sync_personal_todos(&mut reader,&store,&query(),5,None,
            SyncContext {trigger:RunTrigger::Manual,source_id:Some(&source.id),type_scope:None}).await.unwrap();
    }
    assert_eq!(fake.count("1"),1,"后续来源与跨轮均没有详情请求");
    assert_eq!(fake.count("2"),1);
    assert!(store.query_items(&Default::default()).unwrap().iter().all(|r| r.source_ids==["a","b"]));

    fake.pages = vec![vec!["2","3"]];
    fake.versions.insert("2".into(),"v2".into());
    fake.versions.insert("3".into(),"v1".into());
    let mut reader = SourceReader::new(&fake,&a,&store,None,5);
    let report=sync_personal_todos(&mut reader,&store,&query(),5,None,
        SyncContext{trigger:RunTrigger::Manual,source_id:Some("a"),type_scope:None}).await.unwrap();
    assert!(report.complete);
    assert_eq!(fake.count("2"),2);
    assert_eq!(fake.count("3"),1);
    let rows=store.query_items(&Default::default()).unwrap();
    assert_eq!(rows.iter().find(|r|r.item.id.work_item_id=="1").unwrap().source_ids,["b"]);
    store.mark_detail_refresh(&id("2")).unwrap();
    let reader=SourceReader::new(&fake,&a,&store,None,5);
    reader.call_list_todo(&query().to_arguments(1)).await.unwrap();
    assert_eq!(fake.count("2"),3,"待刷新标记禁止复用");

    let mut broken=store.item_detail(&id("2")).unwrap().unwrap();
    broken.pages.clear();
    store.save_item_detail_versioned(&broken,Some("remote_version:v2")).unwrap();
    let reader=SourceReader::new(&fake,&a,&store,None,5);
    reader.call_list_todo(&query().to_arguments(1)).await.unwrap();
    assert_eq!(fake.count("2"),4,"不完整缓存必须补拉");
    fake.versions.remove("2");
    let reader=SourceReader::new(&fake,&a,&store,None,5);
    reader.call_list_todo(&query().to_arguments(1)).await.unwrap();
    assert_eq!(fake.count("2"),5,"未知版本不能与未知版本判相等");

    let mut changed=a.clone();
    changed.todo.as_mut().unwrap().action=TodoAction::Done;
    assert!(store.source_version_field(&changed).unwrap().is_none(),"来源配置变更后重新验证");
}

#[test]
fn partial_updates_never_reconcile_absence_and_failed_save_never_advances_version() {
    let store=Store::in_memory().unwrap();
    let mut detail=fstodo_backend::detail::ItemDetail{id:id("1"),fetched_at_ms:1,
        data:brief("1"),pages:vec![brief("1")]};
    store.save_item_detail_versioned(&detail,Some("v1")).unwrap();
    let generation=store.detail_generation(&id("1")).unwrap();
    store.mark_detail_refresh(&id("1")).unwrap();
    assert!(store.save_item_detail_observed(&detail,Some("v2"),generation).is_err());
    assert!(store.detail_versions(&[id("1")]).unwrap()[&id("1").key_tuple()].version.is_none(),
        "并发写操作的失效标记不能被旧详情清除");
    detail.pages.clear();
    store.save_item_detail_versioned(&detail,Some("v3")).unwrap();
    assert!(store.detail_versions(&[id("1")]).unwrap()[&id("1").key_tuple()].version.is_none());

    let page=ToolResultPayload::from_json(json!({"list":[{"project_key":"p",
        "work_item_info":{"work_item_type_key":"story","work_item_id":"1"}}]}));
    let item=to_work_item(&parse_todo_page("test",&page).unwrap().items[0]).unwrap();
    let run=store.begin_run("todo",None,RunTrigger::Manual,Some("a"),1).unwrap();
    store.upsert_items(run,&[item],1).unwrap();
    store.set_run_scan_mode(run,false).unwrap();
    store.finish_run(run,RunStatus::Success,1,0,0,0,0,Some(0),
        Some(fstodo_backend::StopReason::EmptyPage),None,None,&Default::default(),2).unwrap();
    assert_eq!(store.count_items().unwrap(),1,"局部空结果不能移除旧归属");
    let full=store.begin_run("todo",None,RunTrigger::Manual,Some("a"),3).unwrap();
    store.finish_run(full,RunStatus::Success,1,0,0,0,0,Some(0),
        Some(fstodo_backend::StopReason::EmptyPage),None,None,&Default::default(),4).unwrap();
    assert_eq!(store.count_items().unwrap(),0,"完整空结果才可以核销");
}

#[tokio::test]
async fn mixed_version_capabilities_share_fresh_fetches_but_not_stale_persistent_hits() {
    for known_first in [true, false] {
        let store=Store::in_memory().unwrap();
        let a=config("a"); let b=config("b");
        store.record_version_evidence(&a,"remote_version",&["f","s","p","n","t"].map(String::from)).unwrap();
        let mut fake=DelayedSource::new(vec![vec!["1"]]);
        fake.versions.insert("1".into(),"v1".into());
        let cache=Arc::new(DetailCache::default());
        for source in if known_first { [&a,&b] } else { [&b,&a] } {
            SourceReader::new(&fake,source,&store,None,5).with_cache(cache.clone())
                .call_list_todo(&query().to_arguments(1)).await.unwrap();
        }
        assert_eq!(fake.count("1"),1,"不同版本能力的来源共用本轮新拉详情");
        // 明确记录旧的完整缓存；新批次中已知版本命中不代表未知来源也可跨轮复用。
        let detail=store.item_detail(&id("1")).unwrap().unwrap();
        store.save_item_detail_versioned(&detail,Some("remote_version:v1")).unwrap();
        let cache=Arc::new(DetailCache::default());
        SourceReader::new(&fake,&a,&store,None,5).with_cache(cache.clone())
            .call_list_todo(&query().to_arguments(1)).await.unwrap();
        assert_eq!(fake.count("1"),1);
        SourceReader::new(&fake,&b,&store,None,5).with_cache(cache.clone())
            .call_list_todo(&query().to_arguments(1)).await.unwrap();
        assert_eq!(fake.count("1"),2,"历史命中不能掩盖未知来源的详情回退");
        // 已知版本发生冲突时必须获取新详情，不推进为未实际获取的版本。
        fake.versions.insert("1".into(),"v2".into());
        SourceReader::new(&fake,&a,&store,None,5).with_cache(cache.clone())
            .call_list_todo(&query().to_arguments(1)).await.unwrap();
        fake.versions.insert("1".into(),"v3".into());
        SourceReader::new(&fake,&a,&store,None,5).with_cache(cache)
            .call_list_todo(&query().to_arguments(1)).await.unwrap();
        assert_eq!(fake.count("1"),3,"同字段不同版本不能被旧任务吞掉");
        assert_eq!(store.detail_versions(&[id("1")]).unwrap()[&id("1").key_tuple()].version.as_deref(),Some("remote_version:v3"));
    }
}

#[tokio::test]
async fn simultaneous_sources_share_identical_detail_tasks() {
    let fake=DelayedSource::new(vec![vec!["1","2","3","4"]]);
    let store=Store::in_memory().unwrap();
    let a=config("a"); let b=config("b");
    let cache=Arc::new(DetailCache::default());
    let left=SourceReader::new(&fake,&a,&store,None,5).with_cache(cache.clone());
    let right=SourceReader::new(&fake,&b,&store,None,5).with_cache(cache);
    let args=query().to_arguments(1);
    let (x,y)=tokio::join!(left.call_list_todo(&args),right.call_list_todo(&args));
    x.unwrap(); y.unwrap();
    assert_eq!(fake.peak.load(Ordering::SeqCst),4,"Reader 不额外限制请求，实际网络统一调度");
    for n in ["1","2","3","4"] { assert_eq!(fake.count(n),1,"跨来源同项详情任务只能有一个"); }
}

#[tokio::test]
async fn source_checks_and_details_can_overlap_without_phase_budgets() {
    #[derive(Default)]
    struct Lanes {
        checks: AtomicUsize, check_peak: AtomicUsize,
        details: AtomicUsize, detail_peak: AtomicUsize, overlap: AtomicUsize,
    }
    struct SplitSource { number: usize, lanes: Arc<Lanes> }
    #[async_trait]
    impl TodoSource for SplitSource {
        async fn describe(&self) -> Result<ConnectionInfo, BackendError> { unreachable!() }
        async fn close(&mut self) {}
        async fn call_tool(&self, tool: &str, _: &Map<String, Value>) -> Result<ToolResultPayload, BackendError> {
            if tool == "list_todo" {
                let active = self.lanes.checks.fetch_add(1, Ordering::SeqCst) + 1;
                self.lanes.check_peak.fetch_max(active, Ordering::SeqCst);
                if self.lanes.details.load(Ordering::SeqCst) > 0 { self.lanes.overlap.fetch_add(1, Ordering::SeqCst); }
                tokio::time::sleep(Duration::from_millis(10)).await;
                self.lanes.checks.fetch_sub(1, Ordering::SeqCst);
                return Ok(ToolResultPayload::from_json(json!({"total":1,"list":[{"project_key":"p",
                    "work_item_info":{"work_item_type_key":"story","work_item_id":self.number.to_string()}}]})));
            }
            assert_eq!(tool, "get_workitem_brief");
            let active = self.lanes.details.fetch_add(1, Ordering::SeqCst) + 1;
            self.lanes.detail_peak.fetch_max(active, Ordering::SeqCst);
            tokio::time::sleep(Duration::from_millis(40)).await;
            self.lanes.details.fetch_sub(1, Ordering::SeqCst);
            Ok(ToolResultPayload::from_json(brief(&self.number.to_string())))
        }
    }
    let store = Store::in_memory().unwrap();
    let lanes = Arc::new(Lanes::default());
    let cache = Arc::new(DetailCache::default());
    let sources: Vec<_> = (0..6).map(|number| SplitSource { number, lanes: lanes.clone() }).collect();
    let configs: Vec<_> = (0..6).map(|n| config(&n.to_string())).collect();
    let readers: Vec<_> = sources.iter().zip(&configs).map(|(fake, source)|
        SourceReader::new(fake, source, &store, None, 5).with_cache(cache.clone())).collect();
    let args = query().to_arguments(1);
    let results = futures_util::future::join_all(readers.iter().map(|r|r.call_list_todo(&args))).await;
    assert!(results.iter().all(Result::is_ok));
    assert_eq!(lanes.check_peak.load(Ordering::SeqCst), 6);
    assert_eq!(lanes.detail_peak.load(Ordering::SeqCst), 6);
}
