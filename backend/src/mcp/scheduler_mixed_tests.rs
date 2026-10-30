use super::*;

/// 使用真实 SourceReader 产生后台详情积压，真实流程发现走共享 Remote、FeishuMcp 与 HTTP。
#[tokio::test]
async fn source_backlog_does_not_block_workflow_or_later_source_checks() {
    let server = Server::new("mixed");
    let mut client = server.client();
    client.describe_reusing().await.unwrap();
    let store = crate::Store::in_memory().unwrap();
    use crate::model::source::{PersonalTodoQuery, SourceKind, TodoAction, WorkSource};
    let source = WorkSource {
        id: "mixed".into(),
        enabled: true,
        kind: SourceKind::PersonalTodo,
        todo: Some(PersonalTodoQuery {
            action: TodoAction::Todo,
            todo_scope: None,
            asset_key: None,
        }),
        association_rule: None,
    };
    let cache = Arc::new(crate::source_query::DetailCache::default());
    let reader = crate::source_query::SourceReader::new(&client, &source, &store, None, 0)
        .with_cache(cache.clone());
    let later_reader =
        crate::source_query::SourceReader::new(&client, &source, &store, None, 0).with_cache(cache);
    let start_check = tokio::sync::Notify::new();
    let args = serde_json::json!({"action":"todo","page_num":1})
        .as_object()
        .unwrap()
        .clone();
    let dir = std::env::temp_dir().join(format!(
        "fstodo-mixed-workflow-{}-{}",
        std::process::id(),
        server.endpoint.rsplit(':').next().unwrap()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let token = dir.join("token.txt");
    std::fs::write(&token, "offline-only").unwrap();
    let settings = dir.join("config.toml");
    std::fs::write(
        &settings,
        format!(
            "token_env='FSTODO_MIXED_MISSING_TOKEN'\ntoken_file='{}'",
            token.to_string_lossy().replace('\\', "/")
        ),
    )
    .unwrap();
    let workflow_config =
        crate::Config::load(Some(&settings), Some(&dir.join("cache.db"))).unwrap();
    let session = crate::api::Session::open(workflow_config).unwrap();
    let installed = crate::remote::install_test_client(
        &session.config,
        &session.credential().unwrap(),
        Box::new(client.clone()),
    );
    let foreground_stage = Arc::new(AtomicUsize::new(0));
    let later_stage = AtomicUsize::new(0);
    let interactive = async {
        tokio::time::timeout(Duration::from_secs(5), async {
            while server.background_active.load(Ordering::SeqCst) < 6
                || client.scheduler.queued() < 20
            {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .unwrap_or_else(|error| panic!("真实后台详情应填满后台窗口并形成积压: {error}; {}; background_active={}; requested={:?}",
            client.scheduler.debug_state(), server.background_active.load(Ordering::SeqCst),
            server.requested.lock().unwrap()));
        let started = std::time::Instant::now();
        start_check.notify_one();
        let foreground_stage_task = foreground_stage.clone();
        let workflow = tokio::task::spawn_blocking(move || {
            foreground_stage_task.store(1, Ordering::SeqCst);
            let id = crate::WorkItemId {
                project_key: Some("p".into()),
                work_item_type_key: Some("story".into()),
                work_item_id: "foreground".into(),
            };
            // 详情面板先读取，同次动作发现应复用详情，第二次应复用字段配置。
            session.refresh_item_detail(&id).unwrap();
            foreground_stage_task.store(2, Ordering::SeqCst);
            assert_eq!(
                crate::workflow::actions(&session, &id)
                    .unwrap()
                    .actions
                    .len(),
                3
            );
            assert_eq!(
                crate::workflow::actions(&session, &id)
                    .unwrap()
                    .actions
                    .len(),
                3
            );
        });
        tokio::time::timeout(Duration::from_secs(3), async {
            let check = async {
                while server.checks_completed.load(Ordering::SeqCst) < 2 {
                    tokio::time::sleep(Duration::from_millis(5)).await;
                }
            };
            let (workflow, ()) = tokio::join!(workflow, check);
            workflow.unwrap();
        })
        .await
        .unwrap_or_else(|error| panic!("前台流程和后续检查不能等后台详情完成: {error}; {}; session_available={}; foreground_stage={}; later_stage={}; requested={:?}",
            client.scheduler.debug_state(), client.session.try_lock().is_ok(), foreground_stage.load(Ordering::SeqCst),
            later_stage.load(Ordering::SeqCst), server.requested.lock().unwrap()));
        assert!(server.background_active.load(Ordering::SeqCst) > 0);
        assert!(!*server.background_gate.0.lock().unwrap());
        assert_eq!(server.init.load(Ordering::SeqCst), 1, "保留跨命令会话复用");
        let requested = server.requested.lock().unwrap();
        assert_eq!(
            requested
                .iter()
                .filter(|(tool, id)| tool == "get_workitem_brief" && id == "foreground")
                .count(),
            1,
            "详情面板和两次流程读取仍共用详情"
        );
        for tool in ["list_node_field_config", "list_workitem_field_config"] {
            assert_eq!(
                requested.iter().filter(|(name, _)| name == tool).count(),
                1,
                "保留字段配置缓存"
            );
        }
        assert_eq!(
            requested
                .iter()
                .filter(|(name, _)| name == "get_transition_required")
                .count(),
            6
        );
        assert!(
            !requested
                .iter()
                .any(|(name, _)| name == "get_transitable_states"),
            "明确节点流不额外探测状态流"
        );
        drop(requested);
        println!(
            "40 条后台详情积压时，详情面板 + 两次流程发现 + 来源检查完成于 {} ms，后台仍未释放",
            started.elapsed().as_millis()
        );
        server.release_background();
    };
    let later = async {
        start_check.notified().await;
        later_stage.store(1, Ordering::SeqCst);
        later_reader.call_list_todo(&args).await
    };
    let (background, later, ()) = tokio::join!(reader.call_list_todo(&args), later, interactive);
    assert!(later.is_ok());
    let payload = background.unwrap();
    let result = crate::mcp::parse_tool_json("list_todo", &payload).unwrap();
    assert_eq!(result["list"].as_array().unwrap().len(), 40);
    for (index, row) in result["list"].as_array().unwrap().iter().enumerate() {
        assert_eq!(row["work_item_info"]["work_item_id"], format!("bg-{index}"));
    }
    assert_eq!(
        server
            .requested
            .lock()
            .unwrap()
            .iter()
            .filter(|(tool, id)| tool == "get_workitem_brief" && id.starts_with("bg-"))
            .count(),
        40,
        "后续来源仍复用本轮详情，不重复拉取"
    );
    drop(installed);
    client.close().await;
    std::fs::remove_dir_all(dir).unwrap();
}
