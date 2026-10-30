use super::*;
use crate::mcp::{ConnectionInfo, TodoSource, ToolResultPayload};
use async_trait::async_trait;
use std::{
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};

struct Fake {
    mode: &'static str,
    calls: Mutex<BTreeMap<String, usize>>,
    active: AtomicUsize,
    peak: AtomicUsize,
    block_next_detail: AtomicBool,
    detail_release: tokio::sync::Notify,
}
impl Fake {
    fn count(&self, tool: &str) -> usize {
        *self.calls.lock().unwrap().get(tool).unwrap_or(&0)
    }
}
#[async_trait]
impl TodoSource for Arc<Fake> {
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> {
        unreachable!()
    }
    async fn close(&mut self) {}
    async fn call_tool(
        &self,
        tool: &str,
        args: &Map<String, Value>,
    ) -> Result<ToolResultPayload, BackendError> {
        *self.calls.lock().unwrap().entry(tool.into()).or_default() += 1;
        let value = match tool {
            "get_workitem_brief" => {
                if self.block_next_detail.swap(false, Ordering::SeqCst) {
                    self.detail_release.notified().await;
                }
                json!({"work_item_attribute":{"work_item_id":"1","owned_project":{"key":"p"},
                "work_item_type":{"key":"custom"},"work_item_mod":self.mode},"work_item_fields":[],"pagination":{"has_more":false}})
            }
            "get_node_detail" => json!({"list":[
                {"basic":{"node_key":"a","status":"doing"}},
                {"basic":{"node_key":"b","status":"doing"}},
                {"basic":{"node_key":"c","status":"doing"}}
            ],"pagination":{"has_more":false}}),
            "get_transitable_states" => json!({"state_key":"OPEN","transition":[
                {"id":1,"state_key":"a"},{"id":2,"state_key":"b"},{"id":3,"state_key":"c"}]}),
            "get_transition_required" => {
                assert!(args["state_key"].is_string());
                let active = self.active.fetch_add(1, Ordering::SeqCst) + 1;
                self.peak.fetch_max(active, Ordering::SeqCst);
                tokio::time::sleep(Duration::from_millis(20)).await;
                self.active.fetch_sub(1, Ordering::SeqCst);
                json!({})
            }
            "list_node_field_config" | "list_workitem_field_config" => {
                json!({"list":[],"pagination":{"has_more":false}})
            }
            _ => panic!("unexpected tool: {tool}"),
        };
        Ok(ToolResultPayload::from_json(value))
    }
}

fn setup(
    mode: &'static str,
) -> (
    Session,
    Arc<Fake>,
    crate::remote::TestRemote,
    std::path::PathBuf,
) {
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "fstodo-workflow-perf-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::SeqCst)
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let token = dir.join("token.txt");
    std::fs::write(&token, "test-only-token").unwrap();
    let config_path = dir.join("config.toml");
    std::fs::write(&config_path, format!("token_env = 'FSTODO_ABSENT_PERF_TEST_TOKEN'\ntoken_file = '{}'\n", token.to_string_lossy().replace('\\', "/"))).unwrap();
    let config = crate::Config::load(Some(&config_path), Some(&dir.join("cache.db"))).unwrap();
    let session = Session::open(config).unwrap();
    let fake = Arc::new(Fake {
        mode,
        calls: Mutex::new(BTreeMap::new()),
        active: AtomicUsize::new(0),
        peak: AtomicUsize::new(0),
        block_next_detail: AtomicBool::new(false),
        detail_release: tokio::sync::Notify::new(),
    });
    let installed = crate::remote::install_test_client(
        &session.config,
        &session.credential().unwrap(),
        Box::new(fake.clone()),
    );
    (session, fake, installed, dir)
}

#[tokio::test]
async fn node_discovery_reuses_details_metadata_and_checks_required_fields_concurrently() {
    let (session, fake, installed, dir) = setup("节点流");
    let id = WorkItemId {
        project_key: Some("p".into()),
        work_item_type_key: Some("custom".into()),
        work_item_id: "1".into(),
    };
    fake.block_next_detail.store(true, Ordering::SeqCst);
    // Keep the UI detail pending until action discovery has also been polled. This proves
    // in-flight reuse without assuming the host completes the test within the 1-second TTL.
    let (detail, first, ()) = tokio::join!(biased;
        session.refresh_item_detail_async(&id, false),
        discover_async(&session, &id, false),
        async { fake.detail_release.notify_one(); },
    );
    detail.unwrap();
    let first = first.unwrap().options();
    assert_eq!(first.actions.len(), 3);
    assert_eq!(fake.count("get_workitem_brief"), 1);
    assert_eq!(
        fake.count("get_transitable_states"),
        0,
        "明确节点流不探测状态流"
    );
    assert_eq!(fake.peak.load(Ordering::SeqCst), 3, "所有必填项参与调度，不再受用户检查并发值限制");
    discover_async(&session, &id, false).await.unwrap();
    assert_eq!(fake.count("list_node_field_config"), 1);
    assert_eq!(fake.count("list_workitem_field_config"), 1);
    assert_eq!(
        fake.count("get_transition_required"),
        6,
        "可执行条件每次仍重新检查"
    );
    let detail_reads_before_fresh = fake.count("get_workitem_brief");
    discover_async(&session, &id, true).await.unwrap();
    assert_eq!(fake.count("get_workitem_brief"), detail_reads_before_fresh + 1,
        "提交前检查必须额外读取一次详情，不依赖此前普通读取是否已过期");
    assert_eq!(
        fake.count("list_node_field_config"),
        2,
        "提交前检查绕过元数据缓存"
    );
    drop(installed);
    drop(session);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn state_discovery_uses_explicit_model_and_concurrent_target_checks() {
    let (session, fake, installed, dir) = setup("状态流");
    let id = WorkItemId {
        project_key: Some("p".into()),
        work_item_type_key: Some("custom".into()),
        work_item_id: "1".into(),
    };
    let options = actions(&session, &id).unwrap();
    assert_eq!(options.actions.len(), 3);
    assert!(options.actions.iter().all(|a| a.kind == ActionKind::State));
    assert_eq!(fake.count("get_node_detail"), 0);
    assert_eq!(fake.count("get_transition_required"), 3);
    assert_eq!(fake.peak.load(Ordering::SeqCst), 3);
    assert_eq!(
        fake.count("list_workitem_field_config"),
        0,
        "没有表单不加载配置"
    );
    drop(installed);
    drop(session);
    std::fs::remove_dir_all(dir).unwrap();
}
