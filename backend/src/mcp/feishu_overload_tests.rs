//! 过载回执的识别、冷却与有界只读重试；全部使用虚构响应和 SDK 内存传输。
use super::*;
use std::sync::atomic::AtomicUsize;

const OVERLOAD: &str = "error=RPCError,message=error_code=1606 cds_key=example|read|prod|onDynamicOverload, retriable=true";

fn error_result(payload: ToolResultPayload) -> Value {
    let mut value = serde_json::json!({
        "isError": payload.is_error,
        "content": payload.text_blocks.iter().map(|text| serde_json::json!({"type":"text","text":text})).collect::<Vec<_>>()
    });
    if let Some(structured) = payload.structured {
        value["structuredContent"] = structured;
    }
    value
}

#[test]
fn observed_dynamic_overload_formats_share_throttle_feedback() {
    for payload in [
        ToolResultPayload::err(OVERLOAD),
        ToolResultPayload::err(format!("{OVERLOAD}\nlog_id: example-diagnostic")),
        ToolResultPayload {
            is_error: true,
            text_blocks: vec![OVERLOAD.into(), "log_id: example-diagnostic".into()],
            structured: None,
        },
        ToolResultPayload::err(OVERLOAD.to_uppercase()),
        ToolResultPayload {
            is_error: true,
            text_blocks: vec![],
            structured: Some(
                serde_json::json!({"error_code":1606,"message":"onDynamicOverload","retriable":true}),
            ),
        },
        ToolResultPayload::err(
            serde_json::json!({"code":1606,"message":"onDynamicOverload","retriable":true})
                .to_string(),
        ),
    ] {
        assert_eq!(throttle_payload(&payload), Some(None));
    }
    assert_eq!(throttle_value(-32000, OVERLOAD, None), Some(None));
    assert_eq!(
        throttle_payload(&ToolResultPayload {
            is_error: true,
            text_blocks: vec![],
            structured: Some(
                serde_json::json!({"error_code":1606,"message":"onDynamicOverload","retriable":true,"retry_after":3})
            ),
        }),
        Some(Some(Duration::from_secs(3)))
    );
}

#[test]
fn overload_requires_complete_signal_and_respects_structured_authority() {
    for text in [
        "error_code=1606 ordinary failure retriable=true",
        "onDynamicOverload retriable=true",
        "error_code=1606 onDynamicOverload",
        "error_code=1606 onDynamicOverload retriable=false",
        "error_code=16060 onDynamicOverload retriable=true",
        "error_code=1606 not_onDynamicOverload retriable=true",
        "error_code=1606 onDynamicOverload retriable=trueish",
    ] {
        assert_eq!(throttle_payload(&ToolResultPayload::err(text)), None);
    }
    assert_eq!(
        throttle_payload(&ToolResultPayload::from_text(OVERLOAD)),
        None,
        "正常读取结果不能触发重试"
    );
    for structured in [
        serde_json::json!({}),
        serde_json::json!({"code":0,"message":"success"}),
        serde_json::json!({"code":401,"message":OVERLOAD}),
        serde_json::json!({"code":403,"message":OVERLOAD}),
        serde_json::json!({"code":1606,"message":OVERLOAD,"retriable":false}),
    ] {
        assert_eq!(
            throttle_payload(&ToolResultPayload {
                is_error: true,
                text_blocks: vec![OVERLOAD.into()],
                structured: Some(structured),
            }),
            None,
            "附带文本不能覆盖结构化结果"
        );
    }
    for code in [401, 403] {
        assert_eq!(throttle_value(code, OVERLOAD, None), None);
        assert_eq!(throttle_value(code, "Too many requests", None), None);
    }
}

#[tokio::test(start_paused = true)]
async fn overload_read_recovery_cools_and_reduces_shared_budget() {
    let calls = Arc::new(AtomicUsize::new(0));
    let mut client = FeishuMcp::new("https://example.invalid/mcp", SecretToken::new("test-only"));
    client.scheduler = Arc::new(Scheduler::default());
    *client.session.lock().await = Some(ActiveSession::new(
        tests::scripted_session_repeating(
            error_result(ToolResultPayload::err(OVERLOAD)),
            1,
            calls.clone(),
        )
        .await,
    ));
    let original_identity = client.ensure_session().await.unwrap().1;
    let started = tokio::time::Instant::now();
    let result = client
        .call_tool("get_workitem_brief", &Map::new())
        .await
        .unwrap();
    assert!(!result.is_error);
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    assert!(
        started.elapsed() >= Duration::from_secs(1),
        "过载后须先冷却"
    );
    assert!(
        Arc::ptr_eq(
            &original_identity,
            &client.ensure_session().await.unwrap().1
        ),
        "业务过载不应重建会话"
    );

    // 初始窗口为 8；一次过载后共享预算只容纳 4 个请求，第 5 个须排队。
    let permits = futures_util::future::join_all((0..4).map(|_| client.scheduler.acquire())).await;
    assert!(
        tokio::time::timeout(Duration::from_millis(10), client.scheduler.acquire())
            .await
            .is_err()
    );
    drop(permits);
    client.close().await;
}

#[tokio::test(start_paused = true)]
async fn overload_retries_are_bounded_and_never_replay_writes_or_unknown_tools() {
    for (tool, expected) in [
        ("get_workitem_brief", 3),
        ("transition_node", 1),
        ("transition_state", 1),
        ("update_node", 1),
        ("update_field", 1),
        ("unknown_tool", 1),
    ] {
        let calls = Arc::new(AtomicUsize::new(0));
        let mut client =
            FeishuMcp::new("https://example.invalid/mcp", SecretToken::new("test-only"));
        client.scheduler = Arc::new(Scheduler::default());
        *client.session.lock().await = Some(ActiveSession::new(
            tests::scripted_session_repeating(
                error_result(ToolResultPayload::err(OVERLOAD)),
                usize::MAX,
                calls.clone(),
            )
            .await,
        ));
        let started = tokio::time::Instant::now();
        let result = client.call_tool(tool, &Map::new()).await.unwrap();
        assert!(result.is_error);
        assert_eq!(
            result.text_blocks,
            vec![OVERLOAD],
            "耗尽后保留原始错误供诊断"
        );
        assert_eq!(calls.load(Ordering::SeqCst), expected, "{tool}");
        if expected == 3 {
            assert!(
                started.elapsed() >= Duration::from_secs(3),
                "重复过载须按 1、2 秒退避"
            );
        }
        client.close().await;
    }
}

#[tokio::test(start_paused = true)]
async fn ordinary_tool_errors_are_returned_without_retry() {
    let calls = Arc::new(AtomicUsize::new(0));
    let mut client = FeishuMcp::new("https://example.invalid/mcp", SecretToken::new("test-only"));
    client.scheduler = Arc::new(Scheduler::default());
    *client.session.lock().await = Some(ActiveSession::new(
        tests::scripted_session_repeating(
            error_result(ToolResultPayload::err(
                "error_code=1606 ordinary failure retriable=true",
            )),
            usize::MAX,
            calls.clone(),
        )
        .await,
    ));
    assert!(
        client
            .call_tool("get_workitem_brief", &Map::new())
            .await
            .unwrap()
            .is_error
    );
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    client.close().await;
}
