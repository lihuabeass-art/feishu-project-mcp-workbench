use super::*;
use crate::mcp::{ConnectionInfo, TodoSource, ToolResultPayload};
use async_trait::async_trait;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

struct TransitionSource {
    mode: &'static str,
    receipt: Option<ToolResultPayload>,
    readback: &'static str,
    writes: AtomicUsize,
    readbacks: AtomicUsize,
}

#[async_trait]
impl TodoSource for Arc<TransitionSource> {
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> {
        unreachable!()
    }

    async fn close(&mut self) {}

    async fn call_tool(
        &self,
        tool: &str,
        args: &Map<String, Value>,
    ) -> Result<ToolResultPayload, BackendError> {
        let written = self.writes.load(Ordering::SeqCst) > 0;
        if written && matches!(tool, "get_node_detail" | "get_transitable_states") {
            self.readbacks.fetch_add(1, Ordering::SeqCst);
            if self.readback == "failed" {
                return Err(BackendError::conflict("模拟远端回读失败"));
            }
        }
        let value = match tool {
            "get_workitem_brief" => json!({"work_item_attribute":{
                "work_item_id":"1","owned_project":{"key":"transition-test"},
                "work_item_type":{"key":"story"},"work_item_mod":self.mode
            },"work_item_fields":[],"pagination":{"has_more":false}}),
            "get_node_detail" => {
                let nodes = if written && self.readback == "missing" {
                    vec![]
                } else if written && self.readback == "applied" {
                    // 实测已完成节点仍有 node_key，但不再带 status。
                    vec![json!({"basic":{"node_key":"n1","name":"后端方案设计"}})]
                } else {
                    vec![json!({"basic":{"node_key":"n1","name":"后端方案设计","status":"doing"}})]
                };
                json!({"list":nodes,"pagination":{"has_more":false}})
            }
            "get_transitable_states" => json!({
                "state_key": if written {
                    match self.readback {
                        "applied" => json!("DONE"),
                        "missing" => Value::Null,
                        _ => json!("OTHER"),
                    }
                } else { json!("OPEN") },
                "transition":[{"id":"42","state_key":"DONE","name":"已完成"}]
            }),
            "get_transition_required" => json!({}),
            "list_node_field_config" | "list_workitem_field_config" => {
                json!({"list":[],"pagination":{"has_more":false}})
            }
            "transition_node" | "transition_state" => {
                assert_eq!(
                    tool,
                    if self.mode == "节点流" {
                        "transition_node"
                    } else {
                        "transition_state"
                    }
                );
                assert_eq!(args["work_item_id"], "1");
                assert_eq!(args["project_key"], "transition-test");
                if tool == "transition_node" {
                    assert_eq!(args["node_id"], "n1");
                    assert_eq!(args["action"], "confirm");
                } else {
                    assert_eq!(args["transition_id"], "42");
                }
                self.writes.fetch_add(1, Ordering::SeqCst);
                return self
                    .receipt
                    .clone()
                    .ok_or_else(|| BackendError::conflict("模拟写入响应超时"));
            }
            _ => return Err(BackendError::validation("测试不提供列表同步")),
        };
        Ok(ToolResultPayload::from_json(value))
    }
}

#[test]
fn transition_result_depends_on_remote_readback_instead_of_receipt_format() {
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    let receipts = [
        (
            "json_extra_fields",
            Some(ToolResultPayload::from_json(
                json!({"new_field":{"value":1}}),
            )),
            false,
        ),
        (
            "success",
            Some(ToolResultPayload::from_text("success")),
            false,
        ),
        (
            "success_log_block",
            Some(ToolResultPayload {
                text_blocks: vec!["success".into(), "log_id: diagnostic-id".into()],
                ..Default::default()
            }),
            false,
        ),
        (
            "success_log_line",
            Some(ToolResultPayload::from_text(
                "success\r\nlog_id: diagnostic-id\r\n",
            )),
            false,
        ),
        (
            "unknown_text",
            Some(ToolResultPayload::from_text("unrecognised receipt")),
            true,
        ),
        ("empty", Some(ToolResultPayload::default()), true),
        ("tool_error", Some(ToolResultPayload::err("success")), true),
        (
            "permission_denied",
            Some(ToolResultPayload::err(
                "error=ErrWorkItemNoPermission,message=No Permission,[confirmNodeHandler.checkAbortFrozenAndAuth] ExistsNoPermissionCase,retriable=false logid: permission-diagnostic-id",
            )),
            true,
        ),
        (
            "structured_result",
            Some(ToolResultPayload {
                structured: Some(json!({"code":42})),
                text_blocks: vec!["success".into()],
                is_error: false,
            }),
            false,
        ),
        ("timeout", None, true),
    ];
    for mode in ["节点流", "状态流"] {
        for (name, receipt, receipt_error) in &receipts {
            for readback in ["applied", "mismatch", "missing", "failed"] {
                let case = format!("{mode}/{name}/{readback}");
                let dir = std::env::temp_dir().join(format!(
                    "fstodo-transition-{}-{}",
                    std::process::id(),
                    NEXT.fetch_add(1, Ordering::SeqCst)
                ));
                std::fs::create_dir_all(&dir).unwrap();
                let token = dir.join("token.txt");
                std::fs::write(&token, "test-only-token").unwrap();
                let config_path = dir.join("config.toml");
                std::fs::write(
                    &config_path,
                    format!(
                        "token_env = 'FSTODO_ABSENT_TRANSITION_TEST_TOKEN'\ntoken_file = '{}'\n",
                        token.to_string_lossy().replace('\\', "/")
                    ),
                )
                .unwrap();
                let config =
                    crate::Config::load(Some(&config_path), Some(&dir.join("cache.db"))).unwrap();
                let session = Session::open(config).unwrap();
                let source = Arc::new(TransitionSource {
                    mode,
                    receipt: receipt.clone(),
                    readback,
                    writes: AtomicUsize::new(0),
                    readbacks: AtomicUsize::new(0),
                });
                let installed = crate::remote::install_test_client(
                    &session.config,
                    &session.credential().unwrap(),
                    Box::new(source.clone()),
                );
                let id = WorkItemId {
                    project_key: Some("transition-test".into()),
                    work_item_type_key: Some("story".into()),
                    work_item_id: "1".into(),
                };
                let options = actions(&session, &id).unwrap();
                let action = options
                    .actions
                    .iter()
                    .find(|a| a.disabled_reason.is_none())
                    .unwrap();
                let request = WorkflowRequest {
                    item_id: id.clone(),
                    action_id: action.id.clone(),
                    version: options.version,
                    request_id: "transition-test".into(),
                    fields: BTreeMap::new(),
                };
                let result = execute(&session, &request).unwrap();
                let verified = readback == "applied";
                assert_eq!(
                    source.writes.load(Ordering::SeqCst),
                    1,
                    "{case}: 不得重发写入"
                );
                assert_eq!(
                    source.readbacks.load(Ordering::SeqCst),
                    1,
                    "{case}: 必须远端回读"
                );
                assert_eq!(result.verified, verified, "{case}");
                assert_eq!(
                    result.outcome,
                    if verified {
                        ActionOutcome::Verified
                    } else {
                        ActionOutcome::Unknown
                    },
                    "{case}"
                );
                let records = session.recent_actions(&id, 10).unwrap();
                assert_eq!(records.len(), 1, "{case}");
                assert_eq!(records[0].verified, verified, "{case}");
                assert_eq!(
                    records[0].status,
                    if verified { "verified" } else { "unknown" },
                    "{case}"
                );
                if verified {
                    assert!(
                        result.message.contains("已执行，回读确认"),
                        "{case}: {}",
                        result.message
                    );
                    assert!(
                        !result.message.contains("错误") && !result.message.contains("解析"),
                        "{case}: {}",
                        result.message
                    );
                    assert_eq!(
                        records[0].detail.is_some(),
                        *receipt_error,
                        "{case}: 回执异常只留台账"
                    );
                } else {
                    assert!(
                        result.message.contains("结果不确定")
                            && result.message.contains("草稿已保留"),
                        "{case}: {}",
                        result.message
                    );
                    assert!(!result.resynced, "{case}");
                    if *name == "permission_denied" {
                        assert!(result.message.contains("飞书返回权限不足"), "{case}");
                        assert!(result.message.contains(&action.label), "{case}");
                        assert!(result.message.contains("应用所用凭证对应的账号"), "{case}");
                        assert!(result.message.contains("飞书页面的操作账号"), "{case}");
                        assert!(result.message.contains("不要直接重试"), "{case}");
                        assert!(result.message.contains(if readback == "failed" {
                            "远端状态回读失败"
                        } else {
                            "回读尚未确认流程已推进"
                        }), "{case}");
                        assert!(!result.message.contains("字段已保存"), "{case}");
                        for technical in ["ErrWorkItemNoPermission", "confirmNodeHandler", "permission-diagnostic-id"] {
                            assert!(!result.message.contains(technical), "{case}");
                            assert!(records[0].detail.as_ref().unwrap().contains(technical), "{case}");
                        }
                    } else {
                        assert!(!result.message.contains("飞书返回权限不足"), "{case}");
                    }
                    if readback == "failed" {
                        assert!(
                            records[0]
                                .detail
                                .as_ref()
                                .unwrap()
                                .contains("模拟远端回读失败"),
                            "{case}"
                        );
                    }
                }
                if verified && *name == "permission_denied" {
                    assert!(!result.message.contains("权限不足"), "{case}");
                    assert!(records[0].detail.as_ref().unwrap().contains("ErrWorkItemNoPermission"), "{case}");
                }
                // 同一请求再次提交，无论已核验还是结果不确定，都不能重复写入。
                assert!(execute(&session, &request).is_err(), "{case}");
                assert_eq!(
                    source.writes.load(Ordering::SeqCst),
                    1,
                    "{case}: 幂等台账必须阻止重放"
                );
                drop(installed);
                drop(session);
                std::fs::remove_dir_all(dir).unwrap();
            }
        }
    }
}
