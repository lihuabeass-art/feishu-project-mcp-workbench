use super::*;
use crate::{
    mcp::{ConnectionInfo, TodoSource, ToolResultPayload},
    model::source::{SourceKind, WorkSource},
    source_query::{DetailCache, SourceReader},
    store::{RunStatus, RunTrigger},
    sync::{SyncContext, SyncReport},
};
use async_trait::async_trait;
use std::sync::{atomic::{AtomicBool, AtomicUsize, Ordering}, mpsc, Arc};
use std::time::Duration;
use tokio::sync::{Notify, Semaphore};

struct ConcurrentSource {
    project: String,
    progress: AtomicUsize,
    writes: AtomicUsize,
    transitions: AtomicUsize,
    allow_transition: AtomicBool,
    completed: AtomicBool,
    remove_after_complete: AtomicBool,
    list_reads: AtomicUsize,
    detail_reads: Mutex<BTreeMap<String, usize>>,
    pause_detail: AtomicBool,
    detail_started: Notify,
    detail_gate: Semaphore,
    pause_write: AtomicBool,
    write_started: Notify,
    write_gate: Semaphore,
    other_detail: Notify,
    include_other: AtomicBool,
    fail_after_write: AtomicBool,
}

#[async_trait]
impl TodoSource for Arc<ConcurrentSource> {
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> { unreachable!() }
    async fn close(&mut self) {}
    async fn call_tool(&self, tool: &str, args: &Map<String, Value>) -> Result<ToolResultPayload, BackendError> {
        let row = |id: &str| json!({"project_key":self.project,
            "work_item_info":{"work_item_id":id,"work_item_type_key":"story"},
            "node_info":{"node_name":if self.completed.load(Ordering::SeqCst) {"后续节点"} else {"研发"},
                "node_state_key":if self.completed.load(Ordering::SeqCst) {"n2"} else {"n1"}},"remote_version":"before"});
        let value = match tool {
            "get_workitem_brief" => {
                let id = args["work_item_id"].as_str().unwrap();
                *self.detail_reads.lock().unwrap().entry(id.into()).or_default() += 1;
                if id == "1" && self.pause_detail.swap(false, Ordering::SeqCst) {
                    self.detail_started.notify_one();
                    tokio::time::timeout(Duration::from_secs(5), self.detail_gate.acquire()).await.unwrap().unwrap().forget();
                }
                if id == "2" { self.other_detail.notify_one(); }
                if self.progress.load(Ordering::SeqCst) > 0 && self.fail_after_write.load(Ordering::SeqCst) {
                    return Err(BackendError::parse("并发详情测试", "模拟真实读取失败"));
                }
                json!({"work_item_attribute":{"work_item_id":id,"owned_project":{"key":self.project},
                    "work_item_type":{"key":"story"},"work_item_mod":"节点流",
                    "work_item_name":format!("需求{id}-进度{}",self.progress.load(Ordering::SeqCst))},
                    "work_item_fields":[],"work_item_current_node":[],"pagination":{"has_more":false}})
            }
            "get_node_detail" => json!({"list":[{"basic":{"node_key":"n1","name":"研发",
                "status":if self.completed.load(Ordering::SeqCst) {"finished"} else {"doing"}},
                "form_items":[{"field_key":"node_progress","field_type":"number",
                    "value":self.progress.load(Ordering::SeqCst) as f64 / 100.0}]}],"pagination":{"has_more":false}}),
            "get_transition_required" => json!({}),
            "list_node_field_config" => json!({"list":[{"field_key":"node_progress","field_type":"number"}],
                "pagination":{"has_more":false}}),
            "list_workitem_field_config" => json!({"list":[],"pagination":{"has_more":false}}),
            "get_view_detail" => {
                let ids = if self.include_other.load(Ordering::SeqCst) { vec!["1", "2"] } else { vec!["1"] };
                let rows = ids.iter().map(|id| json!({"work_item_attribute":{"work_item_id":id,
                    "work_item_type":{"key":"story"},"owned_project":{"key":self.project}},
                    "remote_version":"before"})).collect::<Vec<_>>();
                json!({"work_item_list":rows,"pagination":{"total":ids.len(),"has_more":false}})
            }
            "list_todo" => {
                self.list_reads.fetch_add(1, Ordering::SeqCst);
                if self.completed.load(Ordering::SeqCst) && self.remove_after_complete.load(Ordering::SeqCst) {
                    json!({"list":[],"total":0})
                } else { json!({"list":[row("1")],"total":1}) }
            }
            "update_node" => {
                self.writes.fetch_add(1, Ordering::SeqCst);
                if self.pause_write.swap(false, Ordering::SeqCst) {
                    self.write_started.notify_one();
                    tokio::time::timeout(Duration::from_secs(5), self.write_gate.acquire()).await.unwrap().unwrap().forget();
                }
                let value = args["fields"][0]["field_value"].as_str().unwrap().parse::<f64>().unwrap();
                self.progress.store((value * 100.0).round() as usize, Ordering::SeqCst);
                return Ok(ToolResultPayload::from_text("success"));
            }
            "transition_node" => {
                assert!(self.allow_transition.load(Ordering::SeqCst), "进度同步不能推进流程");
                assert_eq!(args["node_id"], "n1");
                assert_eq!(args["action"], "confirm");
                self.transitions.fetch_add(1, Ordering::SeqCst);
                if self.pause_write.swap(false, Ordering::SeqCst) {
                    self.write_started.notify_one();
                    tokio::time::timeout(Duration::from_secs(5), self.write_gate.acquire()).await.unwrap().unwrap().forget();
                }
                self.completed.store(true, Ordering::SeqCst);
                return Ok(ToolResultPayload::from_text("success"));
            }
            "transition_state" => panic!("节点流程不调用状态推进"),
            _ => panic!("unexpected tool {tool}"),
        };
        Ok(ToolResultPayload::from_json(value))
    }
}

fn setup() -> (Arc<Session>, Arc<ConcurrentSource>, crate::remote::TestRemote, std::path::PathBuf) {
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    let index = NEXT.fetch_add(1, Ordering::SeqCst);
    let project = format!("concurrent-detail-{index}");
    let dir = std::env::temp_dir().join(format!("fstodo-concurrent-detail-{}-{index}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let token = dir.join("token.txt");
    std::fs::write(&token, "test-only-token").unwrap();
    let config = dir.join("config.toml");
    std::fs::write(&config, format!("token_env='FSTODO_ABSENT_CONCURRENT_DETAIL_TOKEN'\ntoken_file='{}'\n",
        token.to_string_lossy().replace('\\', "/"))).unwrap();
    let mut settings = crate::Config::load(Some(&config), Some(&dir.join("cache.db"))).unwrap();
    settings.sources = vec![WorkSource { id: "todo".into(), enabled: true, kind: SourceKind::PersonalTodo,
        todo: Some(crate::model::source::PersonalTodoQuery { action: crate::model::source::TodoAction::Todo,
            todo_scope: None, asset_key: None }), association_rule: None }];
    let session = Arc::new(Session::open(settings).unwrap());
    let source = Arc::new(ConcurrentSource {
        project, progress: AtomicUsize::new(0), writes: AtomicUsize::new(0), transitions: AtomicUsize::new(0),
        allow_transition: AtomicBool::new(false), completed: AtomicBool::new(false), remove_after_complete: AtomicBool::new(false),
        list_reads: AtomicUsize::new(0),
        detail_reads: Mutex::new(BTreeMap::new()), pause_detail: AtomicBool::new(false), detail_started: Notify::new(),
        detail_gate: Semaphore::new(0), pause_write: AtomicBool::new(false), write_started: Notify::new(),
        write_gate: Semaphore::new(0), other_detail: Notify::new(), include_other: AtomicBool::new(false),
        fail_after_write: AtomicBool::new(false),
    });
    let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(source.clone()));
    (session, source, installed, dir)
}

fn identity(source: &ConcurrentSource) -> WorkItemId {
    WorkItemId { project_key: Some(source.project.clone()), work_item_type_key: Some("story".into()), work_item_id: "1".into() }
}

fn request(session: &Session, source: &ConcurrentSource) -> WorkflowRequest {
    let item_id = identity(source);
    let options = actions(session, &item_id).unwrap();
    let action = options.actions.iter().find(|action| action.id == "node:progress:n1").unwrap();
    WorkflowRequest { item_id, action_id: action.id.clone(), version: options.version,
        request_id: "concurrent-progress".into(), fields: BTreeMap::from([(action.fields[0].key.clone(), "75".into())]) }
}

fn view(source: &ConcurrentSource) -> WorkSource {
    WorkSource { id: "view".into(), enabled: true, kind: SourceKind::View {
        project_key: Some(source.project.clone()), view_id: Some("view-id".into()),
    }, todo: None, association_rule: None }
}

fn background(session: Arc<Session>, source: Arc<ConcurrentSource>, cache: Arc<DetailCache>) -> mpsc::Receiver<Result<SyncReport, BackendError>> {
    let (send, receive) = mpsc::channel();
    std::thread::spawn(move || {
        let config = view(&source);
        let result = crate::remote::runtime().unwrap().block_on(async {
            let mut reader = SourceReader::new(&source, &config, &session.store, None, 5).with_cache(cache);
            let query = crate::model::source::PersonalTodoQuery { action: crate::model::source::TodoAction::Todo, todo_scope: None, asset_key: None };
            tokio::time::timeout(Duration::from_secs(5), crate::sync::sync_personal_todos(&mut reader, &session.store, &query, 5, None,
                SyncContext { trigger: RunTrigger::Automatic, source_id: Some("view"), type_scope: None })).await
                .expect("后台详情读取不能等待自身锁")
        });
        let _ = send.send(result);
    });
    receive
}

fn execute_background(session: Arc<Session>, request: WorkflowRequest) -> mpsc::Receiver<Result<WorkflowResult, BackendError>> {
    let (send, receive) = mpsc::channel();
    std::thread::spawn(move || { let _ = send.send(execute(&session, &request)); });
    receive
}

fn signal(notify: &Notify) {
    crate::remote::runtime().unwrap().block_on(async {
        tokio::time::timeout(Duration::from_secs(3), notify.notified()).await.expect("未收到测试阶段信号")
    });
}

struct DelayedPersonalSource {
    source: Arc<ConcurrentSource>,
    list_reads: AtomicUsize,
    initial_started: Notify,
    initial_gate: Semaphore,
    refreshed_started: Notify,
    refreshed_gate: Semaphore,
}

#[async_trait]
impl TodoSource for Arc<DelayedPersonalSource> {
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> { unreachable!() }
    async fn close(&mut self) {}
    async fn call_tool(&self, tool: &str, args: &Map<String, Value>) -> Result<ToolResultPayload, BackendError> {
        let payload = self.source.call_tool(tool, args).await?;
        if tool == "list_todo" {
            let (started, gate) = match self.list_reads.fetch_add(1, Ordering::SeqCst) {
                0 => (&self.initial_started, &self.initial_gate),
                1 => (&self.refreshed_started, &self.refreshed_gate),
                _ => return Ok(payload),
            };
            started.notify_one();
            tokio::time::timeout(Duration::from_secs(5), gate.acquire()).await.unwrap().unwrap().forget();
        }
        Ok(payload)
    }
}

fn personal_background(session: Arc<Session>, source: Arc<DelayedPersonalSource>) -> mpsc::Receiver<Result<SyncReport, BackendError>> {
    let (send, receive) = mpsc::channel();
    std::thread::spawn(move || {
        let config = &session.config.sources[0];
        let result = crate::remote::runtime().unwrap().block_on(async {
            let mut reader = SourceReader::new(&source, config, &session.store, None, 5);
            tokio::time::timeout(Duration::from_secs(5), crate::sync::sync_personal_todos(&mut reader, &session.store,
                config.todo.as_ref().unwrap(), 5, None,
                SyncContext { trigger: RunTrigger::Automatic, source_id: Some("todo"), type_scope: None })).await
                .expect("个人待办重读不能阻塞流程后的同步")
        });
        let _ = send.send(result);
    });
    receive
}

#[test]
fn workflow_waits_for_older_detail_save_and_post_write_sync_does_not_reenter_lock() {
    let (session, source, installed, dir) = setup();
    let request = request(&session, &source);
    source.pause_detail.store(true, Ordering::SeqCst);
    let sync = background(session.clone(), source.clone(), Arc::new(DetailCache::default()));
    signal(&source.detail_started);
    let result = execute_background(session.clone(), request);
    assert!(matches!(result.recv_timeout(Duration::from_millis(50)), Err(mpsc::RecvTimeoutError::Timeout)));
    assert_eq!(source.writes.load(Ordering::SeqCst), 0, "旧详情落库之前不发送新写入");
    source.detail_gate.add_permits(1);
    assert_eq!(sync.recv_timeout(Duration::from_secs(5)).unwrap().unwrap().status, RunStatus::Success);
    let result = result.recv_timeout(Duration::from_secs(5)).unwrap().unwrap();
    assert!(result.verified && result.resynced, "最终同步须释放同事项协调锁后执行: {result:?}; {:?}", session.store.recent_runs(5).unwrap());
    assert_eq!(source.writes.load(Ordering::SeqCst), 1);
    assert!(source.list_reads.load(Ordering::SeqCst) > 0);
    assert_eq!(session.cached_item_detail(&identity(&source)).unwrap().unwrap().data["work_item_attribute"]["work_item_name"], "需求1-进度75");
    drop(installed); drop(session); std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn active_write_delays_only_its_detail_and_waited_source_does_not_bind_old_list_version() {
    let (session, source, installed, dir) = setup();
    let request = request(&session, &source);
    let evidence = ["field", "status", "people", "node", "schedule"].map(String::from);
    session.store.record_version_evidence(&view(&source), "remote_version", &evidence).unwrap();
    let cache = Arc::new(DetailCache::default());
    assert!(background(session.clone(), source.clone(), cache.clone()).recv_timeout(Duration::from_secs(5)).unwrap().unwrap().complete);
    source.include_other.store(true, Ordering::SeqCst);
    source.pause_write.store(true, Ordering::SeqCst);
    let result = execute_background(session.clone(), request);
    signal(&source.write_started);
    let before = *source.detail_reads.lock().unwrap().get("1").unwrap();
    let sync = background(session.clone(), source.clone(), cache);
    signal(&source.other_detail);
    assert_eq!(*source.detail_reads.lock().unwrap().get("1").unwrap(), before, "同事项详情应等写入结束");
    assert!(matches!(sync.recv_timeout(Duration::from_millis(50)), Err(mpsc::RecvTimeoutError::Timeout)));
    source.write_gate.add_permits(1);
    let result = result.recv_timeout(Duration::from_secs(5)).unwrap().unwrap();
    assert!(result.verified && result.resynced, "{result:?}; {:?}", session.store.recent_runs(5).unwrap());
    assert_eq!(sync.recv_timeout(Duration::from_secs(5)).unwrap().unwrap().status, RunStatus::Success);
    let id = identity(&source);
    assert_eq!(session.cached_item_detail(&id).unwrap().unwrap().data["work_item_attribute"]["work_item_name"], "需求1-进度75");
    assert!(session.store.detail_versions(&[id.clone()]).unwrap()[&id.key_tuple()].version.is_none(),
        "旧来源版本不能绑定到等待写入后的详情");
    assert_eq!(source.writes.load(Ordering::SeqCst), 1);
    drop(installed); drop(session); std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn real_detail_failure_after_waiting_for_write_still_fails_source_and_preserves_cache() {
    let (session, source, installed, dir) = setup();
    let request = request(&session, &source);
    let previous = session.cached_item_detail(&identity(&source)).unwrap().unwrap();
    source.pause_write.store(true, Ordering::SeqCst);
    source.fail_after_write.store(true, Ordering::SeqCst);
    source.include_other.store(true, Ordering::SeqCst);
    let result = execute_background(session.clone(), request);
    signal(&source.write_started);
    let sync = background(session.clone(), source.clone(), Arc::new(DetailCache::default()));
    signal(&source.other_detail);
    source.write_gate.add_permits(1);
    assert!(result.recv_timeout(Duration::from_secs(5)).unwrap().unwrap().verified);
    let error = sync.recv_timeout(Duration::from_secs(5)).unwrap().unwrap_err();
    assert_eq!(error.kind(), ErrorKind::Parse);
    assert!(error.to_string().contains("模拟真实读取失败"));
    assert_eq!(session.cached_item_detail(&identity(&source)).unwrap().unwrap().data, previous.data);
    assert!(session.store.recent_runs(10).unwrap().iter().filter(|run| run.source_id.as_deref() == Some("view"))
        .all(|run| run.status == RunStatus::Failed));
    assert_eq!(source.writes.load(Ordering::SeqCst), 1);
    drop(installed); drop(session); std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn node_confirmation_serializes_detail_read_and_releases_lock_before_refreshing_todos() {
    let (session, source, installed, dir) = setup();
    let item_id = identity(&source);
    let options = actions(&session, &item_id).unwrap();
    let request = WorkflowRequest { item_id: item_id.clone(), action_id: "node:confirm:n1".into(),
        version: options.version, request_id: "concurrent-confirm".into(), fields: BTreeMap::new() };
    source.allow_transition.store(true, Ordering::SeqCst);
    source.pause_write.store(true, Ordering::SeqCst);
    source.include_other.store(true, Ordering::SeqCst);
    let result = execute_background(session.clone(), request);
    signal(&source.write_started);
    let sync = background(session.clone(), source.clone(), Arc::new(DetailCache::default()));
    signal(&source.other_detail);
    assert!(matches!(sync.recv_timeout(Duration::from_millis(50)), Err(mpsc::RecvTimeoutError::Timeout)));
    source.write_gate.add_permits(1);
    let result = result.recv_timeout(Duration::from_secs(5)).unwrap().unwrap();
    assert!(result.verified && result.resynced, "{result:?}");
    assert_eq!(sync.recv_timeout(Duration::from_secs(5)).unwrap().unwrap().status, RunStatus::Success);
    assert_eq!(source.transitions.load(Ordering::SeqCst), 1);
    assert_eq!(source.writes.load(Ordering::SeqCst), 0);
    let records = session.recent_actions(&item_id, 1).unwrap();
    assert_eq!(records[0].status, "verified");
    assert!(source.list_reads.load(Ordering::SeqCst) > 0);
    let cached = session.store.query_items(&Default::default()).unwrap();
    let item = cached.iter().find(|item| item.item.id == item_id).unwrap();
    assert_eq!(item.personal_flows["todo"].node_name.as_deref(), Some("后续节点"));
    drop(installed); drop(session); std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn waited_personal_page_rereads_new_node_before_late_apply() {
    waited_personal_page_rereads_after_confirmation(false);
}

#[test]
fn waited_personal_page_cannot_restore_removed_membership() {
    waited_personal_page_rereads_after_confirmation(true);
}

fn waited_personal_page_rereads_after_confirmation(remove: bool) {
    let (session, source, installed, dir) = setup();
    source.remove_after_complete.store(remove, Ordering::SeqCst);
    crate::remote::runtime().unwrap().block_on(async {
        let config = &session.config.sources[0];
        let mut reader = SourceReader::new(&source, config, &session.store, None, 5);
        crate::sync::sync_personal_todos(&mut reader, &session.store, config.todo.as_ref().unwrap(), 5, None,
            SyncContext { trigger: RunTrigger::Automatic, source_id: Some("todo"), type_scope: None }).await.unwrap();
    });
    let item_id = identity(&source);
    let options = actions(&session, &item_id).unwrap();
    let request = WorkflowRequest { item_id: item_id.clone(), action_id: "node:confirm:n1".into(),
        version: options.version, request_id: "personal-page-confirm".into(), fields: BTreeMap::new() };
    let delayed = Arc::new(DelayedPersonalSource { source: source.clone(), list_reads: AtomicUsize::new(0),
        initial_started: Notify::new(), initial_gate: Semaphore::new(0),
        refreshed_started: Notify::new(), refreshed_gate: Semaphore::new(0) });
    let sync = personal_background(session.clone(), delayed.clone());
    signal(&delayed.initial_started);
    source.allow_transition.store(true, Ordering::SeqCst);
    source.pause_write.store(true, Ordering::SeqCst);
    let result = execute_background(session.clone(), request);
    signal(&source.write_started);
    delayed.initial_gate.add_permits(1);
    assert!(matches!(sync.recv_timeout(Duration::from_millis(50)), Err(mpsc::RecvTimeoutError::Timeout)));
    source.write_gate.add_permits(1);
    signal(&delayed.refreshed_started);
    let result = result.recv_timeout(Duration::from_secs(5)).unwrap().unwrap();
    assert!(result.verified && result.resynced, "{result:?}");
    let assert_personal_state = || {
        let items = session.store.query_items(&Default::default()).unwrap();
        let item = items.iter().find(|item| item.item.id == item_id);
        if remove {
            assert!(!item.is_some_and(|item| item.source_ids.iter().any(|id| id == "todo")),
                "已经离开待办的事项不能被旧页恢复个人来源");
        } else {
            assert_eq!(item.unwrap().personal_flows["todo"].node_name.as_deref(), Some("后续节点"));
        }
    };
    assert_personal_state();
    delayed.refreshed_gate.add_permits(1);
    assert_eq!(sync.recv_timeout(Duration::from_secs(5)).unwrap().unwrap().status, RunStatus::Success);
    assert_personal_state();
    assert_eq!(delayed.list_reads.load(Ordering::SeqCst), 2, "旧个人页须只读重取后才能成功");
    assert_eq!(source.transitions.load(Ordering::SeqCst), 1);
    assert_eq!(source.writes.load(Ordering::SeqCst), 0);
    drop(installed); drop(session); std::fs::remove_dir_all(dir).unwrap();
}
