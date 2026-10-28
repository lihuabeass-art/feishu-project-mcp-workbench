use super::*;
use crate::mcp::{ConnectionInfo, TodoSource, ToolResultPayload};
use async_trait::async_trait;
use std::sync::{atomic::{AtomicUsize, Ordering}, Arc};

struct ScheduleSource {
    project_key: &'static str,
    dates: Mutex<[i64; 2]>,
    writes: Mutex<Vec<Map<String, Value>>>,
    receipt: ToolResultPayload,
    personal: bool,
    mismatch: Option<usize>,
    advanced: bool,
    fail_readback: bool,
    reads: AtomicUsize,
}

fn date(raw: &str) -> i64 {
    use chrono::{FixedOffset, NaiveDate, TimeZone};
    FixedOffset::east_opt(8 * 3600).unwrap()
        .from_local_datetime(&NaiveDate::parse_from_str(raw, "%Y-%m-%d").unwrap().and_hms_opt(0, 0, 0).unwrap())
        .single().unwrap().timestamp_millis()
}

#[async_trait]
impl TodoSource for Arc<ScheduleSource> {
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> { unreachable!() }
    async fn close(&mut self) {}
    async fn call_tool(&self, tool: &str, args: &Map<String, Value>) -> Result<ToolResultPayload, BackendError> {
        let value = match tool {
            "get_workitem_brief" => json!({"work_item_attribute":{
                "work_item_id":"1","owned_project":{"key":self.project_key},
                "work_item_type":{"key":"story"},"work_item_mod":"节点流"
            },"work_item_fields":[],"pagination":{"has_more":false}}),
            "get_node_detail" => {
                self.reads.fetch_add(1, Ordering::SeqCst);
                let written = !self.writes.lock().unwrap().is_empty();
                if written && self.fail_readback { return Err(BackendError::conflict("模拟日期回读失败")); }
                let dates = *self.dates.lock().unwrap();
                let mut node = json!({"basic":{"node_key":"n1","name":"研发",
                    "status":if written && self.advanced {"finished"} else {"doing"}},
                    "schedule":{"estimate_start_time":dates[0],"estimate_finish_time":dates[1],"points":5,"actual_work_time":3},
                    "form_items":[{"field_key":"node_progress","value":"0.5"}]
                });
                if self.personal {
                    node["assignee_schedule_list"] = json!([{"assignee":{"user_key":"a","name":"甲"},
                        "schedule_info":{"estimate_start_time":dates[0],"estimate_finish_time":dates[1],"points":5,"actual_work_time":3}}]);
                }
                json!({"list":[node],"pagination":{"has_more":false}})
            }
            "get_transition_required" => json!({"node_fields":[{"field_key":"schedule"},{"field_key":"attachment"}]}),
            "list_node_field_config" => json!({"list":[
                {"field_key":"schedule","field_name":"排期","field_type":"schedule"},
                {"field_key":"point","field_name":"估分","field_type":"number"},
                {"field_key":"actual_work_time","field_name":"实际工时","field_type":"number"},
                {"field_key":"node_progress","field_name":"进度","field_type":"number"},
                {"field_key":"attachment","field_type":"file"}
            ],"pagination":{"has_more":false}}),
            "list_workitem_field_config" => json!({"list":[],"pagination":{"has_more":false}}),
            "update_node" => {
                self.writes.lock().unwrap().push(args.clone());
                let schedule = if self.personal { &args["schedules"][0] } else { &args["node_schedule"] };
                let mut dates = self.dates.lock().unwrap();
                for (index, property) in ["estimate_start_date", "estimate_end_date"].iter().enumerate() {
                    if let Some(value) = schedule[*property].as_i64() { dates[index] = value; }
                }
                if let Some(index) = self.mismatch { dates[index] += 86_400_000; }
                return Ok(self.receipt.clone());
            }
            "transition_node" | "transition_state" | "update_field" => panic!("日期同步不得调用 {tool}"),
            _ => return Err(BackendError::validation("测试不提供列表同步")),
        };
        Ok(ToolResultPayload::from_json(value))
    }
}

fn session() -> (Session, std::path::PathBuf) {
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!("fstodo-schedule-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::SeqCst)));
    std::fs::create_dir_all(&dir).unwrap();
    let token = dir.join("token.txt");
    std::fs::write(&token, "test-only-token").unwrap();
    let config = dir.join("config.toml");
    std::fs::write(&config, format!("token_env = 'FSTODO_ABSENT_SCHEDULE_TEST_TOKEN'\ntoken_file = '{}'\n", token.to_string_lossy().replace('\\', "/"))).unwrap();
    (Session::open(crate::Config::load(Some(&config), Some(&dir.join("cache.db"))).unwrap()).unwrap(), dir)
}

#[test]
fn schedule_sync_checks_both_dates_and_status_for_node_and_personal_schedules() {
    let receipts = [
        ToolResultPayload::from_text("success"),
        ToolResultPayload::from_text("success\nlog_id: diagnostic-id"),
        ToolResultPayload {text_blocks:vec!["success".into(),"log_id: diagnostic-id".into()], ..Default::default()},
        ToolResultPayload::from_text("unknown receipt"),
        ToolResultPayload::err("success"),
        ToolResultPayload {structured:Some(json!({})), text_blocks:vec!["unknown receipt".into()], is_error:false},
    ];
    for personal in [false, true] {
        for receipt in &receipts {
            for (change_start, mismatch, advanced, fail_readback) in [
                (true, None, false, false),
                (false, None, false, false),
                (false, Some(0), false, false), // 沿用云端的开始日期也必须回读核验。
                (true, Some(1), false, false),
                (true, None, true, false),
                (true, None, false, true),
            ] {
                let (session, dir) = session();
                let source = Arc::new(ScheduleSource {
                    project_key:"schedule-test",
                    dates:Mutex::new([date("2026-10-27"),date("2026-10-28")]), writes:Mutex::new(vec![]),
                    receipt:receipt.clone(), personal, mismatch, advanced, fail_readback, reads:AtomicUsize::new(0),
                });
                let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(source.clone()));
                let id = WorkItemId {project_key:Some("schedule-test".into()),work_item_type_key:Some("story".into()),work_item_id:"1".into()};
                let options = actions(&session, &id).unwrap();
                assert!(options.actions.iter().find(|a|a.id=="node:confirm:n1").unwrap().disabled_reason.is_some());
                let action = options.actions.iter().find(|a|a.id=="node:schedule:n1").unwrap();
                assert!(action.disabled_reason.is_none());
                assert_eq!(action.fields.len(), 2);
                assert!(action.fields.iter().all(|f| f.kind == FieldKind::Date && f.required));
                let fields = action.fields.iter().filter_map(|field| {
                    if field.label.contains("开始日期") {
                        change_start.then(|| (field.key.clone(), "2026-10-28".into()))
                    } else { Some((field.key.clone(), "2026-10-30".into())) }
                }).collect();
                let request = WorkflowRequest {item_id:id,action_id:action.id.clone(),version:options.version,request_id:"schedule".into(),fields};
                let result = execute(&session, &request).unwrap();
                let writes = source.writes.lock().unwrap();
                assert_eq!(writes.len(), 1, "日期更新不得重放");
                let mut expected = json!({"project_key":"schedule-test","work_item_id":"1","node_id":"n1"});
                let mut patch = json!({"estimate_end_date":date("2026-10-30"),"clear_schedule":false,"is_auto":false});
                if change_start { patch["estimate_start_date"] = json!(date("2026-10-28")); }
                if personal {
                    patch["owners"] = json!(["a"]);
                    expected["schedules"] = json!([patch]);
                } else { expected["node_schedule"] = patch; }
                assert_eq!(&writes[0], expected.as_object().unwrap(), "不得带入进度、估分、工时、文档或推进参数");
                assert_eq!(result.verified, mismatch.is_none() && !advanced && !fail_readback);
                assert_eq!(result.outcome, if result.verified {ActionOutcome::Verified} else {ActionOutcome::Unknown});
                if result.verified {
                    assert!(result.message.contains("开始和结束日期"));
                    assert!(result.message.contains("当前节点保持进行中"));
                    assert!(!result.message.contains("unknown receipt"));
                    assert!(source.reads.load(Ordering::SeqCst) >= 4);
                } else {
                    assert!(result.message.contains("结果不确定"));
                    assert!(result.message.contains("草稿已保留"));
                }
                drop(writes);
                drop(installed);
                drop(session);
                std::fs::remove_dir_all(dir).unwrap();
            }
        }
    }
}

#[test]
fn schedule_sync_requires_valid_pair_rejects_other_fields_and_checks_unchanged_remote_dates() {
    let (session, dir) = session();
    let source = Arc::new(ScheduleSource {
        project_key:"schedule-validation-test",
        dates:Mutex::new([date("2026-10-27"),date("2026-10-28")]),writes:Mutex::new(vec![]),
        receipt:ToolResultPayload::from_text("success"),personal:false,mismatch:None,advanced:false,fail_readback:false,reads:AtomicUsize::new(0),
    });
    let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(source.clone()));
    let id = WorkItemId {project_key:Some(source.project_key.into()),work_item_type_key:Some("story".into()),work_item_id:"1".into()};
    let options = actions(&session, &id).unwrap();
    let action = options.actions.iter().find(|a|a.id=="node:schedule:n1").unwrap();
    let start = &action.fields.iter().find(|f| f.label.contains("开始日期")).unwrap().key;
    let end = &action.fields.iter().find(|f| f.label.contains("结束日期")).unwrap().key;
    for fields in [
        BTreeMap::from([(start.clone(), "".into())]),
        BTreeMap::from([(end.clone(), "   ".into())]),
        BTreeMap::from([(end.clone(), "not-a-date".into())]),
        BTreeMap::from([(end.clone(), "2026-10-26".into())]),
        BTreeMap::from([("node_progress".into(), "100".into())]),
    ] {
        assert!(execute(&session, &WorkflowRequest {item_id:id.clone(),action_id:action.id.clone(),version:options.version.clone(),request_id:"invalid".into(),fields}).is_err());
    }
    assert!(source.writes.lock().unwrap().is_empty());
    let result = execute(&session, &WorkflowRequest {item_id:id,action_id:action.id.clone(),version:options.version,request_id:"unchanged".into(),fields:BTreeMap::new()}).unwrap();
    assert!(result.verified);
    assert!(source.writes.lock().unwrap().is_empty());
    assert!(source.reads.load(Ordering::SeqCst) >= 4, "无差异仍须远端回读核验两端");
    drop(installed);
    drop(session);
    std::fs::remove_dir_all(dir).unwrap();
}
