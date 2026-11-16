struct ClearFake {
    base: Arc<Fake>,
    node: Mutex<Value>,
    written: AtomicBool,
    personal: bool,
    behavior: &'static str,
    receipt: ToolResultPayload,
}

#[async_trait]
impl TodoSource for Arc<ClearFake> {
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> { unreachable!() }
    async fn close(&mut self) {}
    async fn call_tool(&self, tool: &str, args: &Map<String, Value>) -> Result<ToolResultPayload, BackendError> {
        if tool == "get_node_detail" {
            crate::mcp::record_schedule_rpc();
            let mut node = self.node.lock().unwrap().clone();
            if self.written.load(Ordering::SeqCst) && self.behavior == "read_fail" {
                return Err(BackendError::parse("test", "read failed"));
            }
            let key = if self.personal { "schedule_info" } else { "schedule" };
            let schedule = if self.personal { &mut node["assignee_schedule_list"][0][key] } else { &mut node[key] };
            if self.written.load(Ordering::SeqCst) {
                if self.behavior != "dates_unchanged" {
                    schedule["estimate_start_time"] = Value::Null;
                    schedule["estimate_finish_time"] = Value::Null;
                }
                if self.behavior == "lost_work" { schedule["actual_work_time"] = Value::Null; }
                if self.behavior == "lost_points" { schedule["points"] = Value::Null; }
                if self.behavior == "missing_after" { schedule.as_object_mut().unwrap().remove("actual_work_time"); }
                if self.behavior == "all_lost" {
                    for field in ["points", "actual_work_time", "planned_construction_period"] { schedule[field] = Value::Null; }
                }
                if self.behavior == "advanced" { node["basic"]["status"] = json!("finished"); }
                if self.behavior == "other_bad" && self.personal {
                    node["assignees"]["owners"].as_array_mut().unwrap().push(json!({"user_key":"other"}));
                    node["assignee_schedule_list"].as_array_mut().unwrap().push(json!({"assignee":{"user_key":"other"},"schedule_info":{"estimate_start_time":"bad-date"}}));
                }
            }
            return Ok(ToolResultPayload::from_json(json!({"list":[node],"pagination":{"has_more":false}})));
        }
        if tool == "update_node" {
            crate::mcp::record_schedule_rpc();
            self.base.calls.lock().unwrap().push((tool.into(), Value::Object(args.clone())));
            self.written.store(true, Ordering::SeqCst);
            return Ok(self.receipt.clone());
        }
        self.base.call_tool(tool, args).await
    }
}

#[test]
fn clear_schedule_preserves_non_date_values_and_requires_readback_even_for_bad_receipts() {
    for personal in [false, true] {
        for receipt in [
            ToolResultPayload::from_text("success"),
            ToolResultPayload::from_text("success\nlog_id: test-id"),
            ToolResultPayload { text_blocks: vec!["success".into(), "log_id: test-id".into()], ..Default::default() },
            ToolResultPayload::from_text("unknown text"),
            ToolResultPayload::err("success"),
            ToolResultPayload { structured: Some(json!({"error_code": 1})), text_blocks: vec!["success".into()], ..Default::default() },
        ] {
            for behavior in ["ok", "dates_unchanged", "lost_work", "lost_points", "missing_after", "all_lost", "other_bad", "advanced", "read_fail"] {
                let (session, dir) = fixture();
                let base = Arc::new(Fake { calls: Mutex::new(vec![]), fail_detail: AtomicBool::new(false), partial_page: AtomicBool::new(false), receipts: Mutex::new(vec![]) });
                let value = json!({"estimate_start_time":1794499200000i64,"estimate_finish_time":1794499200000i64,"points":0,"actual_work_time":2.5,"planned_construction_period":3});
                let mut node = json!({"basic":{"node_key":"n1","name":"开发","status":"doing"},"assignees":{"owners":[{"user_key":"me"}]},"schedule":value});
                if personal {
                    node["assignee_schedule_list"] = json!([{"assignee":{"user_key":"me"},"schedule_info":value}]);
                }
                let fake = Arc::new(ClearFake { base: base.clone(), node: Mutex::new(node), written: AtomicBool::new(false), personal, behavior, receipt: receipt.clone() });
                let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(fake));
                let mut plan = ScheduleSession::load(&session).unwrap();
                let sid = plan.view.session_id.clone();
                let target = plan.view.targets.iter().find(|target| target.node_id == "n1").unwrap().clone();
                assert!(target.read_only_reason.is_none());
                let clear_change = || Change { id: target.id.clone(), start: String::new(), end: String::new(), cancel: true };
                let result = plan.sync(&session, &sid, vec![clear_change()]).unwrap();
                let ok = matches!(behavior, "ok" | "lost_work" | "lost_points" | "missing_after" | "all_lost" | "other_bad");
                assert_eq!(result.targets[0].result, if ok { "accepted" } else { "uncertain" });
                assert_eq!(result.targets[0].warning.is_some(), matches!(behavior, "lost_work" | "lost_points" | "missing_after" | "all_lost"), "日期成功与非日期字段差异分别反馈");
                if behavior == "all_lost" { assert!(result.targets[0].warning.as_deref().unwrap().contains("估分、实际工时、计划工期")); }
                if behavior == "missing_after" { assert!(result.targets[0].warning.as_deref().unwrap().contains("信息未完整返回")); }
                let actions = session.store.recent_actions("p|story|1", 1).unwrap();
                assert_eq!(actions[0].verified, ok);
                if !schedule_receipt_accepted(&receipt) {
                    assert!(actions[0].detail.as_deref().unwrap().contains("写入回执"), "异常回执只能留档，不能覆盖日期核验结果");
                }
                assert_eq!(result.write_requests, 1, "前后读取不能计入写请求次数");
                let calls = base.calls.lock().unwrap();
                let writes = calls.iter().filter(|(tool, _)| tool == "update_node").collect::<Vec<_>>();
                assert_eq!(writes.len(), 1);
                let patch = if personal { &writes[0].1["schedules"][0] } else { &writes[0].1["node_schedule"] };
                assert_eq!(patch["clear_schedule"], true);
                assert_eq!(patch["is_auto"], false);
                assert_eq!(patch["points"], 0);
                assert_eq!(patch["actual_work_time"], 2.5);
                assert_eq!(patch["planned_construction_period"], 3);
                assert!(patch.get("estimate_start_date").is_none());
                assert!(patch.get("estimate_end_date").is_none());
                if personal { assert_eq!(patch["owners"], json!(["me"])); }
                drop(calls);
                if !ok {
                    assert_eq!(plan.view.targets.iter().find(|item| item.id == target.id).unwrap().baseline, target.baseline);
                    assert!(plan.sync(&session, &sid, vec![clear_change()]).is_err(), "不确定不能自动重发");
                } else {
                    assert!(plan.view.targets.iter().find(|item| item.id == target.id).unwrap().baseline.start.is_empty());
                }
                drop(installed); drop(plan); drop(session); std::fs::remove_dir_all(dir).unwrap();
            }
        }
    }
}

#[test]
fn clear_schedule_preflight_rejects_stale_missing_or_readonly_scope_without_writing() {
    for behavior in ["stale", "missing_work", "duplicate_owner", "other_owner", "finished"] {
        let (session, dir) = fixture();
        let base = Arc::new(Fake { calls: Mutex::new(vec![]), fail_detail: AtomicBool::new(false), partial_page: AtomicBool::new(false), receipts: Mutex::new(vec![]) });
        let node = json!({"basic":{"node_key":"n1","name":"开发","status":"doing"},"assignees":{"owners":[{"user_key":"me"}]},
            "assignee_schedule_list":[{"assignee":{"user_key":"me"},"schedule_info":{"estimate_start_time":1794499200000i64,"estimate_finish_time":1794499200000i64,"points":1,"actual_work_time":null}}]});
        let fake = Arc::new(ClearFake { base: base.clone(), node: Mutex::new(node), written: AtomicBool::new(false), personal: true, behavior: "ok", receipt: ToolResultPayload::from_text("success") });
        let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(fake.clone()));
        let mut plan = ScheduleSession::load(&session).unwrap();
        let sid = plan.view.session_id.clone();
        let target = plan.view.targets.iter().find(|target| target.node_id == "n1").unwrap().clone();
        {
            let mut node = fake.node.lock().unwrap();
            match behavior {
                "stale" => node["assignee_schedule_list"][0]["schedule_info"]["estimate_start_time"] = json!(1794585600000i64),
                "missing_work" => { node["assignee_schedule_list"][0]["schedule_info"].as_object_mut().unwrap().remove("actual_work_time"); }
                "duplicate_owner" => { let row = node["assignee_schedule_list"][0].clone(); node["assignee_schedule_list"].as_array_mut().unwrap().push(row); }
                "other_owner" => node["assignees"]["owners"] = json!([{"user_key":"other"}]),
                "finished" => node["basic"]["status"] = json!("finished"),
                _ => unreachable!(),
            }
        }
        let result = plan.sync(&session, &sid, vec![Change { id: target.id, start: String::new(), end: String::new(), cancel: true }]).unwrap();
        assert_eq!(result.targets[0].result, "unsent");
        assert_eq!(result.write_requests, 0);
        assert!(!base.calls.lock().unwrap().iter().any(|(tool, _)| tool == "update_node"));
        drop(installed); drop(plan); drop(session); std::fs::remove_dir_all(dir).unwrap();
    }
}
