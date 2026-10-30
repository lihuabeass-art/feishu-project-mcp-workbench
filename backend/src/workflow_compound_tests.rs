use super::*;
use crate::mcp::{ConnectionInfo, TodoSource, ToolResultPayload};
use async_trait::async_trait;
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc,
};

struct CompoundSource {
    state: bool,
    failure: &'static str,
    value: Mutex<Value>,
    writes: AtomicUsize,
    advances: AtomicUsize,
    required_complete: AtomicBool,
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
            && !matches!(self.failure, "transition_permission" | "system_unverified");
        self.events.lock().unwrap().push(tool.into());
        let system_acceptance = self.failure.starts_with("system_");
        let root = if system_acceptance { "owners_finished_info" } else { "review" };
        let child = if system_acceptance { "owners_node_finished_conclusion" } else { "opinion" };
        let system_config = json!({"field_key":"owners_finished_info","field_name":"负责人完成结论与意见","field_type":"multi_user_compound_field",
            "compound_field_info":[{"field_key":"owners_node_finished_conclusion","field_name":"负责人完成结论","field_type":"select","option":[{"option_id":"system_passed","option_name":"已通过"}]}]});
        let config = if system_acceptance { system_config.clone() } else { json!({"field_key":root,"field_name":"验收信息","field_type":"multi_user_compound_field",
            "compound_field_info":[{"field_key":child,"field_name":"意见","field_type":"multi-pure-text"}]}) };
        let required = if self.failure == "new_system_required" && written {
            json!({"node_fields":[{"field_key":"owners_finished_info","sub_field":[
                {"field_key":"owners_node_finished_conclusion","finished":false,"not_finished_owner":["a"]},
                {"field_key":"owners_node_finished_opinion","finished":true}
            ]}]})
        } else if system_acceptance {
            if self.required_complete.load(Ordering::SeqCst) || matches!(self.failure, "system_optional" | "system_retired" | "system_unverified") {
                json!({})
            } else {
                json!({"node_fields":[{"field_key":child,"finished":self.failure == "system_finished","not_finished_owner":["a"]}]})
            }
        } else if !written || self.failure == "remaining" {
            if self.state {
                json!({"form_items":[{"key":"opinion","class":"field","not_finished_owner":["a"]}]})
            } else {
                json!({"node_fields":[{"field_key":child,"not_finished_owner":["a"]}]})
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
                "work_item_id":"1","owned_project":{"key":"compound-test","simple_name":"compound-example"},"work_item_type":{"key":"story"},
                "work_item_mod":if self.state { "状态流" } else { "节点流" }
            },"work_item_fields":if self.state { vec![json!({"key":"review","value":self.value.lock().unwrap().clone()})] } else { vec![] },
                "pagination":{"has_more":false}}),
            "get_node_detail" => json!({"list":[{
                "basic":{"node_key":"n1","name":"产品经理验收","status":if advanced { "finished" } else { "doing" }},
                "assignees":{"owners":[{"user_key":"a","name":"甲"}]},
                "form_items":[{"field_key":root,"form_item_type":"node_field","value":self.value.lock().unwrap().to_string()}]
            }],"pagination":{"has_more":false}}),
            "get_transitable_states" => {
                json!({"state_key":if advanced { "DONE" } else { "OPEN" },
                "transition":[{"id":"42","state_key":"DONE","name":"已完成"}]})
            }
            "get_transition_required" => {
                assert_eq!(args["mode"], "unfinished");
                required
            },
            "list_node_field_config" => {
                json!({"list":if self.state { vec![] } else if self.failure == "new_system_required" { vec![config, system_config] } else { vec![config] },"pagination":{"has_more":false}})
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
                if self.failure == "rejected" {
                    return Ok(ToolResultPayload::err("error=ErrServiceInternalError,message=Service Internal Error,biz error: invalid owners_finished_info value,retriable=true logid: fixture-rejected-write"));
                }
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
                assert!(matches!(self.failure, "none" | "transition_permission" | "system_optional" | "system_finished" | "system_refreshed" | "system_retired" | "system_unverified"), "字段未核验或仍缺必填时不得推进");
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
        for failure in ["none", "mismatch", "read", "remaining", "receipt", "rejected", "transition_permission", "system_acceptance", "new_system_required"] {
            if state && matches!(failure, "system_acceptance" | "new_system_required") { continue; }
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
                required_complete: AtomicBool::new(false),
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
            assert_eq!(options.item_url.as_deref(), Some("https://project.feishu.cn/compound-example/story/detail/1"));
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
            if failure == "system_acceptance" {
                assert_eq!(action.manual_fill_required, Some(true));
                assert_eq!(action.requires_feishu, Some(true));
                let reason = action.disabled_reason.as_deref().unwrap();
                assert_eq!(reason, "节点流转失败。当前节点【产品经理验收】设置了必须填写【负责人完成结论】（类型：owners_finished_info）才能流转。由于该字段类型不支持自动化补充，请您在飞书项目页面手动填写后，再通知我继续流转。");
                assert!(action.fields.iter().all(|field| field.settings.read_only == Some(true)));
                // 旧界面或本机旧草稿即使构造正式请求，也会在 pending 登记和写入前被拒绝。
                let request = WorkflowRequest {
                    item_id: id.clone(), action_id: action.id.clone(), version: options.version,
                    request_id: "blocked-system-acceptance".into(),
                    fields: BTreeMap::from([("legacy-compound-draft".into(), "system_passed".into())]),
                };
                let error = execute(&session, &request).unwrap_err();
                assert_eq!(error.safe_message(None), reason);
                assert_eq!(source.writes.load(Ordering::SeqCst), 0);
                assert_eq!(source.advances.load(Ordering::SeqCst), 0);
                assert!(session.recent_actions(&id, 1).unwrap().is_empty());
                drop(installed);
                drop(session);
                std::fs::remove_dir_all(dir).unwrap();
                continue;
            }
            assert!(
                action.disabled_reason.is_none(),
                "{:?}",
                action.disabled_reason
            );
            assert_eq!(action.manual_fill_required, None);
            assert_eq!(action.requires_feishu, None);
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
                if failure == "rejected" {
                    assert!(result.message.contains("暂时无法确认飞书是否已保存字段"));
                    for internal in ["ErrServiceInternalError", "owners_finished_info", "retriable", "logid", "update_node", "update_field"] {
                        assert!(!result.message.contains(internal));
                    }
                    let records = session.recent_actions(&id, 1).unwrap();
                    assert!(records[0].detail.as_deref().unwrap().contains("invalid owners_finished_info value"));
                }
                if failure == "new_system_required" {
                    assert!(result.message.contains("节点流转失败。当前节点【产品经理验收】设置了必须填写【负责人完成结论】（类型：owners_finished_info）才能流转。由于该字段类型不支持自动化补充，请您在飞书项目页面手动填写后，再通知我继续流转。"));
                    assert!(!result.message.contains("仍缺必填项"));
                }
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

#[test]
fn page_only_fields_allow_zero_patch_transition_after_required_values_are_satisfied() {
    for failure in ["system_optional", "system_finished", "system_refreshed", "system_retired", "system_unverified"] {
        let dir = std::env::temp_dir().join(format!("fstodo-page-transition-{}-{failure}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let token = dir.join("token.txt");
        std::fs::write(&token, "test-only-token").unwrap();
        let config_path = dir.join("config.toml");
        std::fs::write(&config_path, format!(
            "token_env = 'FSTODO_ABSENT_PAGE_TEST_TOKEN'\ntoken_file = '{}'\n",
            token.to_string_lossy().replace('\\', "/")
        )).unwrap();
        let session = Session::open(crate::Config::load(Some(&config_path), Some(&dir.join("cache.db"))).unwrap()).unwrap();
        let source = Arc::new(CompoundSource {
            state: false, failure,
            value: Mutex::new(if failure == "system_retired" { json!({"a":[{"field_key":"owners_node_finished_conclusion","field_value":"retired-option"}]}) } else { json!({}) }),
            writes: AtomicUsize::new(0), advances: AtomicUsize::new(0), required_complete: AtomicBool::new(false),
            events: Mutex::new(vec![]),
        });
        let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(source.clone()));
        let id = WorkItemId { project_key: Some("compound-test".into()), work_item_type_key: Some("story".into()), work_item_id: "1".into() };
        let mut options = actions(&session, &id).unwrap();
        if failure == "system_refreshed" {
            let previous = options.actions.iter().find(|action| action.id == "node:confirm:n1").unwrap();
            assert!(previous.disabled_reason.is_some());
            assert_eq!(previous.manual_fill_required, Some(true));
            assert_eq!(previous.requires_feishu, Some(true));
            let previous_version = options.version.clone();
            source.required_complete.store(true, Ordering::SeqCst);
            options = actions(&session, &id).unwrap();
            assert_ne!(options.version, previous_version);
            assert_eq!(source.advances.load(Ordering::SeqCst), 0, "重新读取动作本身不能推进流程");
        }
        let action = options.actions.iter().find(|action| action.id == "node:confirm:n1").unwrap();
        assert!(action.disabled_reason.is_none(), "{failure}: {:?}", action.disabled_reason);
        assert_eq!(action.manual_fill_required, None);
        assert_eq!(action.requires_feishu, Some(true), "可选或已满足的页面字段仍直接在飞书处理");
        assert!(action.fields.iter().all(|field| field.settings.read_only == Some(true)));
        let request = WorkflowRequest {
            item_id: id.clone(), action_id: action.id.clone(), version: options.version,
            request_id: format!("page-{failure}"), fields: BTreeMap::new(),
        };
        let result = execute(&session, &request).unwrap();
        assert_eq!(source.writes.load(Ordering::SeqCst), 0, "系统字段不应写入");
        assert_eq!(source.advances.load(Ordering::SeqCst), 1, "允许一次流程推进");
        assert_eq!(result.verified, failure != "system_unverified", "回执 success 不可代替远端状态核验");
        assert_eq!(result.outcome, if failure == "system_unverified" { ActionOutcome::Unknown } else { ActionOutcome::Verified });
        if result.verified {
            let next = actions(&session, &id).unwrap();
            let rollback = next.actions.iter().find(|action| action.id == "node:rollback:n1").unwrap();
            assert_eq!(rollback.requires_feishu, None, "完成节点的页面字段不污染后续回滚动作");
        }
        let events = source.events.lock().unwrap();
        let advance = events.iter().position(|tool| tool == "transition_node").unwrap();
        assert!(events[..advance].iter().any(|tool| tool == "get_transition_required"));
        assert!(events[advance + 1..].iter().any(|tool| tool == "get_node_detail"));
        drop(events);
        assert!(execute(&session, &request).is_err());
        assert_eq!(source.advances.load(Ordering::SeqCst), 1, "不得自动或重复推进");
        drop(installed);
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
