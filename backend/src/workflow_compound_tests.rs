use super::*;
use crate::mcp::{ConnectionInfo, TodoSource, ToolResultPayload};
use async_trait::async_trait;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

struct CompoundSource {
    state: bool,
    failure: &'static str,
    value: Mutex<Value>,
    writes: AtomicUsize,
    advances: AtomicUsize,
    events: Mutex<Vec<String>>,
}

#[async_trait]
impl TodoSource for Arc<CompoundSource> {
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
        let advanced = self.advances.load(Ordering::SeqCst) > 0
            && self.failure != "transition_permission";
        self.events.lock().unwrap().push(tool.into());
        let config = json!({"field_key":"review","field_name":"验收信息","field_type":"multi_user_compound_field",
            "compound_field_info":[{"field_key":"opinion","field_name":"意见","field_type":"multi-pure-text"}]});
        let required = if !written || self.failure == "remaining" {
            if self.state {
                json!({"form_items":[{"key":"opinion","class":"field","not_finished_owner":["a"]}]})
            } else {
                json!({"node_fields":[{"field_key":"opinion","not_finished_owner":["a"]}]})
            }
        } else {
            json!({})
        };
        if written
            && self.failure == "read"
            && tool
                == if self.state {
                    "get_workitem_brief"
                } else {
                    "get_node_detail"
                }
        {
            return Err(BackendError::conflict("模拟复合字段回读失败"));
        }
        let value = match tool {
            "get_workitem_brief" => json!({"work_item_attribute":{
                "work_item_id":"1","owned_project":{"key":"compound-test"},"work_item_type":{"key":"story"},
                "work_item_mod":if self.state { "状态流" } else { "节点流" }
            },"work_item_fields":if self.state { vec![json!({"key":"review","value":self.value.lock().unwrap().clone()})] } else { vec![] },
                "pagination":{"has_more":false}}),
            "get_node_detail" => json!({"list":[{
                "basic":{"node_key":"n1","name":"产品经理验收","status":if advanced { "finished" } else { "doing" }},
                "assignees":{"owners":[{"user_key":"a","name":"甲"}]},
                "form_items":[{"field_key":"review","form_item_type":"node_field","value":self.value.lock().unwrap().to_string()}]
            }],"pagination":{"has_more":false}}),
            "get_transitable_states" => {
                json!({"state_key":if advanced { "DONE" } else { "OPEN" },
                "transition":[{"id":"42","state_key":"DONE","name":"已完成"}]})
            }
            "get_transition_required" => required,
            "list_node_field_config" => {
                json!({"list":if self.state { vec![] } else { vec![config] },"pagination":{"has_more":false}})
            }
            "list_workitem_field_config" => {
                json!({"list":if self.state { vec![config] } else { vec![] },"pagination":{"has_more":false}})
            }
            "update_node" | "update_field" => {
                assert_eq!(
                    tool,
                    if self.state {
                        "update_field"
                    } else {
                        "update_node"
                    }
                );
                assert_eq!(args["fields"].as_array().unwrap().len(), 1);
                assert_eq!(args["fields"][0]["field_key"], "review");
                let patch: Value =
                    serde_json::from_str(args["fields"][0]["field_value"].as_str().unwrap())
                        .unwrap();
                assert_eq!(
                    patch,
                    json!({"operation_type":1,"group_editor":"a","sub_field_value":[
                    {"field_key":"opinion","field_value":"验收完成","field_type":"multi-pure-text"}]})
                );
                self.writes.fetch_add(1, Ordering::SeqCst);
                if self.failure == "receipt" {
                    return Ok(ToolResultPayload::err("success"));
                }
                // 不一致案例让另一负责人得到相同值，不能冒充目标负责人的写入成功。
                self.value.lock().unwrap()[if self.failure == "mismatch" { "b" } else { "a" }] =
                    patch["sub_field_value"].clone();
                return Ok(if self.state {
                    ToolResultPayload::from_json(json!({}))
                } else {
                    ToolResultPayload::from_text("success\nlog_id: compound-test")
                });
            }
            "transition_node" | "transition_state" => {
                assert!(matches!(self.failure, "none" | "transition_permission"), "字段未核验或仍缺必填时不得推进");
                assert_eq!(
                    tool,
                    if self.state {
                        "transition_state"
                    } else {
                        "transition_node"
                    }
                );
                self.advances.fetch_add(1, Ordering::SeqCst);
                if self.failure == "transition_permission" {
                    return Ok(ToolResultPayload::err("error=ErrWorkItemNoPermission,message=No Permission,logid: compound-permission-id"));
                }
                return Ok(ToolResultPayload::from_text("success"));
            }
            _ => return Err(BackendError::validation("测试不提供列表同步")),
        };
        Ok(ToolResultPayload::from_json(value))
    }
}

#[test]
fn compound_execution_checks_exact_owner_remote_values_and_required_fields_before_advancing() {
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    for state in [false, true] {
        for failure in ["none", "mismatch", "read", "remaining", "receipt", "transition_permission"] {
            let dir = std::env::temp_dir().join(format!(
                "fstodo-compound-{}-{}",
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
                    "token_env = 'FSTODO_ABSENT_COMPOUND_TEST_TOKEN'\ntoken_file = '{}'\n",
                    token.to_string_lossy().replace('\\', "/")
                ),
            )
            .unwrap();
            let session = Session::open(
                crate::Config::load(Some(&config_path), Some(&dir.join("cache.db"))).unwrap(),
            )
            .unwrap();
            let source = Arc::new(CompoundSource {
                state,
                failure,
                value: Mutex::new(json!({})),
                writes: AtomicUsize::new(0),
                advances: AtomicUsize::new(0),
                events: Mutex::new(vec![]),
            });
            let installed = crate::remote::install_test_client(
                &session.config,
                &session.credential().unwrap(),
                Box::new(source.clone()),
            );
            let id = WorkItemId {
                project_key: Some("compound-test".into()),
                work_item_type_key: Some("story".into()),
                work_item_id: "1".into(),
            };
            let options = actions(&session, &id).unwrap();
            let action = options
                .actions
                .iter()
                .find(|a| {
                    a.id == if state {
                        "state:42:DONE"
                    } else {
                        "node:confirm:n1"
                    }
                })
                .unwrap();
            assert!(
                action.disabled_reason.is_none(),
                "{:?}",
                action.disabled_reason
            );
            assert_eq!(action.fields.len(), 1);
            let request = WorkflowRequest {
                item_id: id.clone(),
                action_id: action.id.clone(),
                version: options.version,
                request_id: "compound".into(),
                fields: BTreeMap::from([(action.fields[0].key.clone(), "验收完成".into())]),
            };
            let result = execute(&session, &request).unwrap();
            assert_eq!(source.writes.load(Ordering::SeqCst), 1);
            assert_eq!(
                source.advances.load(Ordering::SeqCst),
                usize::from(matches!(failure, "none" | "transition_permission"))
            );
            assert_eq!(result.verified, failure == "none");
            assert_eq!(
                result.outcome,
                if failure == "none" {
                    ActionOutcome::Verified
                } else {
                    ActionOutcome::Unknown
                }
            );
            if failure == "none" {
                let events = source.events.lock().unwrap();
                let write = events
                    .iter()
                    .position(|e| e == if state { "update_field" } else { "update_node" })
                    .unwrap();
                let advance = events
                    .iter()
                    .position(|e| {
                        e == if state {
                            "transition_state"
                        } else {
                            "transition_node"
                        }
                    })
                    .unwrap();
                assert!(events[write + 1..advance].iter().any(|e| e
                    == if state {
                        "get_workitem_brief"
                    } else {
                        "get_node_detail"
                    }));
                assert!(events[write + 1..advance]
                    .iter()
                    .any(|e| e == "get_transition_required"));
            } else if failure == "transition_permission" {
                assert!(result.message.contains("字段已保存并回读确认"));
                assert!(result.message.contains("飞书返回权限不足"));
                assert!(result.message.contains("草稿已保留"));
                assert!(!result.message.contains("ErrWorkItemNoPermission"));
                let records = session.recent_actions(&id, 1).unwrap();
                assert_eq!(records[0].status, "unknown");
                assert!(records[0].detail.as_ref().unwrap().contains("ErrWorkItemNoPermission"));
            } else {
                assert!(
                    result.message.contains("草稿已保留")
                        && result.message.contains("尚未发送流程推进请求")
                );
                assert_eq!(session.recent_actions(&id, 1).unwrap()[0].status, "unknown");
            }
            assert!(execute(&session, &request).is_err());
            assert_eq!(
                source.writes.load(Ordering::SeqCst),
                1,
                "结果不明也不得重发"
            );
            drop(installed);
            drop(session);
            std::fs::remove_dir_all(dir).unwrap();
        }
    }
}
