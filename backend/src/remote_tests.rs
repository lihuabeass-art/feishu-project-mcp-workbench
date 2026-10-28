use super::*;
use serde_json::json;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

#[derive(Clone, Default)]
struct Fake {
    details: Arc<AtomicUsize>,
    configs: Arc<AtomicUsize>,
    broken: Arc<AtomicBool>,
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
        tokio::time::sleep(Duration::from_millis(20)).await;
        if tool == "get_workitem_brief" {
            self.details.fetch_add(1, Ordering::SeqCst);
            Ok(ToolResultPayload::from_json(
                json!({"work_item_attribute": {
                "work_item_id":args["work_item_id"], "work_item_type":{"key":"story"},
                "owned_project":{"key":args["project_key"]}},
                "work_item_fields":[], "pagination":{"has_more":false}}),
            ))
        } else {
            self.configs.fetch_add(1, Ordering::SeqCst);
            if self.broken.load(Ordering::SeqCst) {
                return Ok(ToolResultPayload::from_json(json!({"invalid":true})));
            }
            Ok(ToolResultPayload::from_json(
                json!({"list":[{"field_key":"x"}], "pagination":{"has_more":false}}),
            ))
        }
    }
}

fn reader(fake: Fake) -> Remote {
    Remote {
        key: ContextKey {
            endpoint: "test".into(),
            token_hash: [0; 32],
            db: PathBuf::new(),
            max_pages: 0,
        },
        client: Box::new(fake),
        details: Mutex::new(HashMap::new()),
        metadata: Mutex::new(HashMap::new()),
    }
}
fn id() -> WorkItemId {
    WorkItemId {
        project_key: Some("p".into()),
        work_item_type_key: Some("story".into()),
        work_item_id: "1".into(),
    }
}

#[tokio::test]
async fn detail_flights_merge_but_writes_and_generations_force_new_reads() {
    let fake = Fake::default();
    let remote = reader(fake.clone());
    let id = id();
    let (a, b) = tokio::join!(remote.detail(&id, 0, false), remote.detail(&id, 0, false));
    assert_eq!(a.unwrap().data, b.unwrap().data);
    assert_eq!(fake.details.load(Ordering::SeqCst), 1);
    remote.detail(&id, 0, false).await.unwrap();
    assert_eq!(
        fake.details.load(Ordering::SeqCst),
        1,
        "同一轮详情和动作加载共用结果"
    );
    remote.detail(&id, 0, true).await.unwrap();
    remote.detail(&id, 1, false).await.unwrap();
    assert_eq!(
        fake.details.load(Ordering::SeqCst),
        3,
        "提交检查和写后新代次不能使用旧详情"
    );
    let slot = Arc::new(OnceCell::new());
    slot.set((Instant::now() - Duration::from_secs(2), a_detail(&id)))
        .unwrap();
    remote.details.lock().unwrap().insert((id.clone(), 1), slot);
    remote.detail(&id, 1, false).await.unwrap();
    assert_eq!(
        fake.details.load(Ordering::SeqCst),
        4,
        "过期的短时结果必须重读"
    );
}

fn a_detail(id: &WorkItemId) -> ItemDetail {
    ItemDetail {
        id: id.clone(),
        fetched_at_ms: 0,
        data: json!({}),
        pages: vec![],
    }
}

#[tokio::test]
async fn complete_metadata_is_shared_scoped_expires_and_execution_bypasses_it() {
    let fake = Fake::default();
    let remote = reader(fake.clone());
    let (a, b) = tokio::join!(
        remote.metadata("list_workitem_field_config", "p", "story", false),
        remote.metadata("list_workitem_field_config", "p", "story", false)
    );
    assert_eq!(a.unwrap(), b.unwrap());
    assert_eq!(fake.configs.load(Ordering::SeqCst), 1);
    remote
        .metadata("list_workitem_field_config", "other", "story", false)
        .await
        .unwrap();
    remote
        .metadata("list_workitem_field_config", "p", "story", true)
        .await
        .unwrap();
    assert_eq!(fake.configs.load(Ordering::SeqCst), 3);
    let slot = Arc::new(OnceCell::new());
    slot.set((Instant::now() - Duration::from_secs(301), vec![]))
        .unwrap();
    remote.metadata.lock().unwrap().insert(
        ("p".into(), "story".into(), "list_workitem_field_config"),
        slot,
    );
    remote
        .metadata("list_workitem_field_config", "p", "story", false)
        .await
        .unwrap();
    assert_eq!(fake.configs.load(Ordering::SeqCst), 4);
}

#[tokio::test]
async fn malformed_metadata_is_not_cached_as_empty_success() {
    let fake = Fake::default();
    fake.broken.store(true, Ordering::SeqCst);
    let remote = reader(fake.clone());
    assert!(remote
        .metadata("list_node_field_config", "p", "story", false)
        .await
        .is_err());
    fake.broken.store(false, Ordering::SeqCst);
    assert_eq!(
        remote
            .metadata("list_node_field_config", "p", "story", false)
            .await
            .unwrap()
            .len(),
        1
    );
    assert_eq!(fake.configs.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn writes_invalidate_shared_display_details_without_replaying_the_write() {
    let fake = Fake::default();
    let remote = reader(fake.clone());
    let id = id();
    remote.detail(&id, 0, false).await.unwrap();
    remote.call_tool("update_field", &Map::new()).await.unwrap();
    remote.detail(&id, 0, false).await.unwrap();
    assert_eq!(fake.details.load(Ordering::SeqCst), 2);
    assert_eq!(fake.configs.load(Ordering::SeqCst), 1, "写请求只发送一次");
}

#[test]
fn application_context_reuses_connections_and_changes_with_settings_or_credentials() {
    let dir = std::env::temp_dir().join(format!("fstodo-remote-context-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("config.toml");
    std::fs::write(&path, "").unwrap();
    let config = Config::load(Some(&path), Some(&dir.join("cache.db"))).unwrap();
    let token = dir.join("token");
    std::fs::write(&token, "test-token-one").unwrap();
    let credential =
        crate::credentials::resolve("FSTODO_ABSENT_CONTEXT_TEST_TOKEN", Some(&token)).unwrap();
    let first = shared(&config, &credential);
    assert!(Arc::ptr_eq(&first, &shared(&config, &credential)));
    let mut changed = config.clone();
    changed.endpoint = "https://example.com/mcp".into();
    assert!(!Arc::ptr_eq(&first, &shared(&changed, &credential)));
    let current = shared(&config, &credential);
    std::fs::write(&token, "test-token-two").unwrap();
    let updated =
        crate::credentials::resolve("FSTODO_ABSENT_CONTEXT_TEST_TOKEN", Some(&token)).unwrap();
    assert!(!Arc::ptr_eq(&current, &shared(&config, &updated)));
    std::fs::remove_dir_all(dir).unwrap();
}
