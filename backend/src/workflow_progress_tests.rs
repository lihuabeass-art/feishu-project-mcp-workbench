use super::*;
use crate::mcp::{ConnectionInfo, TodoSource, ToolResultPayload};
use async_trait::async_trait;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

struct ProgressSource {
    node_reads: AtomicUsize,
    value: Mutex<f64>,
    writes: Mutex<Vec<(String, Map<String, Value>)>>,
    fail_write: bool,
    mismatch: bool,
    advanced: bool,
    fail_readback: bool,
}

#[async_trait]
impl TodoSource for Arc<ProgressSource> {
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> {
        unreachable!()
    }
    async fn close(&mut self) {}
    async fn call_tool(
        &self,
        tool: &str,
        args: &Map<String, Value>,
    ) -> Result<ToolResultPayload, BackendError> {
        let value = match tool {
            "get_workitem_brief" => json!({"work_item_attribute":{
                "work_item_id":"1","owned_project":{"key":"p"},
                "work_item_type":{"key":"story"},"work_item_mod":"节点流"
            },"work_item_fields":[],"pagination":{"has_more":false}}),
            "get_node_detail" => {
                self.node_reads.fetch_add(1, Ordering::SeqCst);
                json!({"list":[{
                "basic":{"node_key":"n1","name":"研发","status":
                    if self.advanced && !self.writes.lock().unwrap().is_empty() { "finished" } else { "doing" }},
                "form_items":[{"field_key":"node_progress","field_name":"进度","value":*self.value.lock().unwrap()}]
            }],"pagination":{"has_more":false}})
            },
            // 其余必填项未填、且有不支持类型，不得阻断独立进度同步。
            "get_transition_required" => json!({"node_fields":[
                {"field_key":"actual_work_time"},{"field_key":"attachment"}
            ]}),
            "list_node_field_config" => json!({"list":[
                {"field_key":"node_progress","field_type":"number"},
                {"field_key":"actual_work_time","field_type":"number"},
                {"field_key":"attachment","field_type":"file"}
            ],"pagination":{"has_more":false}}),
            "list_workitem_field_config" => json!({"list":[],"pagination":{"has_more":false}}),
            "update_node" => {
                self.writes
                    .lock()
                    .unwrap()
                    .push((tool.into(), args.clone()));
                if self.fail_write {
                    return Err(BackendError::conflict("模拟写入超时"));
                }
                if !self.mismatch {
                    *self.value.lock().unwrap() = args["fields"][0]["field_value"]
                        .as_str()
                        .unwrap()
                        .parse()
                        .unwrap();
                }
                json!({})
            }
            "transition_node" | "transition_state" | "update_field" => {
                panic!("进度同步不得调用 {tool}")
            }
            _ => return Err(BackendError::validation("测试不提供列表同步")),
        };
        if tool == "get_node_detail"
            && self.fail_readback
            && !self.writes.lock().unwrap().is_empty()
        {
            return Err(BackendError::conflict("模拟写入后回读失败"));
        }
        Ok(ToolResultPayload::from_json(value))
    }
}

#[test]
fn progress_sync_writes_only_percentage_without_advancing_and_checks_readback() {
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    for (percentage, fail_write, mismatch, advanced, fail_readback) in [
        ("0", false, false, false, false),
        ("37.5", false, false, false, false),
        ("100", false, false, false, false),
        ("20", false, false, false, false),
        ("unchanged", false, false, false, false),
        ("50", true, false, false, false),
        ("50", false, true, false, false),
        ("50", false, false, true, false),
        ("50", false, false, false, true),
        ("101", false, false, false, false),
        ("", false, false, false, false),
        ("NaN", false, false, false, false),
    ] {
        let dir = std::env::temp_dir().join(format!(
            "fstodo-progress-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let token = dir.join("token.txt");
        std::fs::write(&token, "test-only-token").unwrap();
        let path = dir.join("config.toml");
        std::fs::write(
            &path,
            format!(
                "token_env = 'FSTODO_ABSENT_PROGRESS_TEST_TOKEN'\ntoken_file = '{}'\n",
                token.to_string_lossy().replace('\\', "/")
            ),
        )
        .unwrap();
        let config = crate::Config::load(Some(&path), Some(&dir.join("cache.db"))).unwrap();
        let session = Session::open(config).unwrap();
        let source = Arc::new(ProgressSource {
            node_reads: AtomicUsize::new(0),
            value: Mutex::new(0.2),
            writes: Mutex::new(vec![]),
            fail_write,
            mismatch,
            advanced,
            fail_readback,
        });
        let installed = crate::remote::install_test_client(
            &session.config,
            &session.credential().unwrap(),
            Box::new(source.clone()),
        );
        let id = WorkItemId {
            project_key: Some("p".into()),
            work_item_type_key: Some("story".into()),
            work_item_id: "1".into(),
        };
        let options = actions(&session, &id).unwrap();
        assert!(options
            .actions
            .iter()
            .find(|a| a.id == "node:confirm:n1")
            .unwrap()
            .disabled_reason
            .is_some());
        let progress = options
            .actions
            .iter()
            .find(|a| a.id == "node:progress:n1")
            .unwrap();
        assert!(progress.disabled_reason.is_none());
        assert_eq!(progress.fields.len(), 1);
        assert!(progress.fields[0].required);
        let request = WorkflowRequest {
            item_id: id,
            action_id: progress.id.clone(),
            version: options.version,
            request_id: format!("progress-{percentage}"),
            fields: if percentage == "unchanged" { BTreeMap::new() } else {
                BTreeMap::from([(progress.fields[0].key.clone(), percentage.into())])
            },
        };
        let result = execute(&session, &request);
        let writes = source.writes.lock().unwrap();
        if matches!(percentage, "101" | "" | "NaN") {
            assert!(result.is_err());
            assert!(writes.is_empty());
        } else if matches!(percentage, "20" | "unchanged") {
            assert!(result.unwrap().verified);
            assert!(writes.is_empty(), "相同进度只核验，不发送字段更新或推进请求");
            assert!(source.node_reads.load(Ordering::SeqCst) >= 4, "必须经过远端回读");
        } else {
            let result = result.unwrap();
            assert_eq!(writes.len(), 1, "写请求不得重放");
            assert_eq!(writes[0].0, "update_node");
            assert_eq!(writes[0].1, json!({"project_key":"p","work_item_id":"1","node_id":"n1",
                "fields":[{"field_key":"node_progress","field_value":json!(percentage.parse::<f64>().unwrap()/100.0).to_string()}]}).as_object().unwrap().clone());
            assert_eq!(
                result.verified,
                !(fail_write || mismatch || advanced || fail_readback)
            );
            assert_eq!(
                result.outcome,
                if result.verified {
                    ActionOutcome::Verified
                } else {
                    ActionOutcome::Unknown
                }
            );
            assert!(result.message.contains(if result.verified {
                "当前节点保持进行中"
            } else {
                "尚未发送流程推进请求"
            }));
            if fail_readback {
                assert!(result.message.contains("草稿已保留"));
            }
        }
        drop(writes);
        drop(installed);
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
