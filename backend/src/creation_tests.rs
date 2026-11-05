use super::*;
use crate::{
    detail::ItemDetail,
    mcp::{ConnectionInfo, TodoSource, ToolResultPayload},
    store::{CachedType, TypePreference},
};
use async_trait::async_trait;
use serde_json::Map;
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc, Mutex,
};

struct Fake {
    mode: &'static str,
    writes: AtomicUsize,
    fields: Mutex<Vec<Value>>,
    user: Mutex<String>,
    relation_queries: Mutex<Vec<String>>,
    fail_read: AtomicBool,
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
        let mut configs = json!([
            {"field_key":"name","field_name":"标题","field_type":"text"},
            {"field_key":"template","field_name":"流程","field_type":"_work_item_template","option":[
                {"option_id":123,"option_name":"通用模板"},{"option_id":456,"option_name":"已停用","disabled":true}]},
            {"field_key":"description","field_name":"说明","field_type":"multi-text"},
            {"field_key":"priority","field_name":"优先级","field_type":"select","option":[{"option_id":"p1","option_name":"高"}]},
            {"field_key":"reporter","field_name":"报告人","field_type":"multi-user"},
            {"field_key":"related","field_name":"所属项目","field_type":"workitem_related_select","related_work_item_info":[{"project_key":"space","work_item_type":"project"}]}
        ]);
        if self.mode.starts_with("optional-fields") {
            configs.as_array_mut().unwrap().extend([
                json!({"field_key":"field_feedback","field_name":"反馈说明","field_type":"text"}),
                json!({"field_key":"field_expected","field_name":"期望时间","field_type":"date"}),
                json!({"field_key":"field_category","field_name":"需求分类","field_type":"select","option":[{"option_id":"category_feature","option_name":"新增功能"}]}),
                json!({"field_key":"field_source","field_name":"需求来源","field_type":"select","option":[{"option_id":"source_customer","option_name":"客户反馈"}]}),
                json!({"field_key":"field_received","field_name":"需求接收","field_type":"bool"}),
                json!({"field_key":"business","field_name":"业务线","field_type":"_business","option":[{"option_id":"business_app","option_name":"应用平台"}]}),
                json!({"field_key":"watchers","field_name":"关注人","field_type":"multi-user"}),
                json!({"field_key":"field_future","field_name":"未来业务字段","field_type":"future_type"}),
            ]);
            for (key, kind) in [
                ("start_time", "date"), ("owner", "user"), ("owned_project", "owned_project"),
                ("work_item_id", "number"), ("current_status_operator", "multi-user"),
                ("work_item_type_key", "select"), ("updated_by", "user"), ("updated_at", "date"),
                ("auto_number", "number"), ("is_frozen", "bool"), ("template_version", "number"),
                ("finish_time", "date"), ("finish_status", "bool"), ("abort_reason", "select"),
                ("abort_detail", "text"), ("work_item_status", "_work_item_status"),
            ] {
                configs.as_array_mut().unwrap().push(json!({"field_key":key,"field_name":key,"field_type":kind}));
            }
        }
        if self.mode.starts_with("relation-multi") {
            configs[5]["related_work_item_info"] = json!([{"project_key":"space","work_item_type":"project"},{"project_key":"space","work_item_type":"other"}]);
        }
        let mut value = match tool {
            "get_workitem_field_meta" => json!({"FieldConfList":[
                {"field_key":"name","field_name":"标题","is_required":1},
                {"field_key":"template","field_name":"流程","is_required":1},
                {"field_key":"description","field_name":"说明","is_required":1},
                {"field_key":"priority","field_name":"优先级","is_required":1,"default_value":{
                    "default_appear":1,"value":base64::engine::general_purpose::STANDARD.encode(r#"{"label":"高","value":"p1"}"#)}},
                {"field_key":"reporter","field_name":"报告人","is_required":1},
                {"field_key":"related","field_name":"所属项目","is_required":1}
            ]}),
            "list_workitem_field_config" => {
                let fields = configs.as_array().unwrap();
                if self.mode.starts_with("optional-fields") {
                    let page = args["page_num"].as_u64().unwrap();
                    let split = 8;
                    json!({"list":if page == 1 { &fields[..split] } else { &fields[split..] },"pagination":{"has_more":page == 1}})
                } else {
                    json!({"list":configs,"pagination":{"has_more":false}})
                }
            },
            "list_workitem_role_config" => json!({"list":[
                {"role_id":"fix_owner","role_name":"修复负责人","is_required":true,"is_member_multi":true},
                {"role_id":"quality_owner","role_name":"质量负责人"}
            ],"pagination":{"has_more":false}}),
            "search_user_info" => match args["user_keys"][0].as_str().unwrap() {
                "current_login_user()" | "测试用户" => {
                    json!([{"user_key":*self.user.lock().unwrap(),"name_cn":"测试用户"}])
                }
                "示例同事" => json!([{"user_key":"ou_colleague","name_cn":"示例同事"}]),
                _ => json!([]),
            },
            "search_by_mql" if self.mode.starts_with("lookup-pages") => {
                if args.get("mql").is_some() {
                    assert_eq!(args["mql"], "SELECT `work_item_id`, `name` FROM `space`.`project`");
                    json!({"session_id":"lookup-session","list":[{"count":51,"group_infos":[{"group_id":"g"}]}],"data":{"g":(1..=50).map(|id| json!({"moql_field_list":[{"key":"work_item_id","value":{"long_value":id}},{"key":"name","value":{"string_value":format!("事项{id}")}}]})).collect::<Vec<_>>()}})
                } else {
                    assert_eq!(args["session_id"], "lookup-session");
                    assert_eq!(args["group_pagination_list"][0]["page_num"], 2);
                    let id = if self.mode == "lookup-pages-duplicate" { 1 } else { 51 };
                    let rows = if self.mode == "lookup-pages-missing" { vec![] } else { vec![json!({"moql_field_list":[{"key":"work_item_id","value":{"long_value":id}},{"key":"name","value":{"string_value":"末页事项"}}]})] };
                    json!({"data":{"g":rows}})
                }
            },
            "search_by_mql" if self.mode.starts_with("relation-") => {
                let mql = args["mql"].as_str().unwrap();
                self.relation_queries.lock().unwrap().push(mql.into());
                assert!(mql.contains("WHERE `work_item_id` IN ("));
                assert!(!mql.contains("LIKE") && !mql.contains("LIMIT 20"));
                if self.mode == "relation-failure" || (self.mode == "relation-multi-failure" && mql.contains("`other`")) { return Err(BackendError::validation("fixture read unavailable")); }
                if self.mode == "relation-multi-zero" && mql.contains("`other`") {
                    return Ok(ToolResultPayload { is_error: false, structured: Some(json!({"list":null,"session_id":"fixture-session","data":{},"search_status_info":null,"extra_info":null})), text_blocks: vec![] });
                }
                let range = if mql.contains("`other`") { "space.other" } else { "space.project" };
                let title = if self.mode == "relation-multi-empty-title" && range == "space.other" { "  " } else { "精确查询名称" };
                let count = if self.mode == "relation-multi-incomplete" && range == "space.other" { 2 } else { 1 };
                json!({"session_id":"fixture-session","list":[{"count":count,"group_infos":[{"group_id":"fixture-group"}]}],"data":{"fixture-group":[{"moql_field_list":[{"key":"work_item_id","value":{"long_value":999}},{"key":"name","value":{"string_value":title}}]}]}})
            },
            "search_by_mql" => json!({"data":{"space.project":[{"moql_field_list":[
                {"key":"work_item_id","value":{"long_value":789}},{"key":"name","value":{"string_value":"示例项目"}}
            ]}]}}),
            "create_workitem" => {
                self.writes.fetch_add(1, Ordering::SeqCst);
                *self.fields.lock().unwrap() = args["fields"].as_array().unwrap().clone();
                assert!(args["fields"].as_array().unwrap().iter().all(|f| f["field_value"].is_string()), "create transport requires string field values");
                match self.mode {
                    "required-rejection" => return Err(BackendError::Tool { tool: tool.into(), code: None, message: "error=ErrFieldRequired,message={field_name}({field_key}) 必填,远端说明,远端角色(description,role_space_custom-key_quality_owner) 必填,retriable=false\nlogid: fixture-only".into() }),
                    "gateway-rejection" => return Err(BackendError::Tool { tool: tool.into(), code: None, message: "error=MCPGatewayRequestMismatch,message=argument arguments.fields[1].field_value must be string, got number,retriable=false\nlogid: fixture-only".into() }),
                    "unknown" | "old_item" | "unknown-changed-fields" | "missing-create-time" => {
                        return Ok(ToolResultPayload {
                            is_error: false,
                            structured: None,
                            text_blocks: vec!["success".into(), "log_id: example".into()],
                        })
                    }
                    "error" => {
                        return Ok(ToolResultPayload {
                            is_error: true,
                            structured: Some(json!({"work_item_id":42})),
                            text_blocks: vec!["denied".into()],
                        })
                    }
                    "precedence" => {
                        return Ok(ToolResultPayload {
                            is_error: false,
                            structured: Some(json!({"unexpected":true})),
                            text_blocks: vec![r#"{"work_item_id":42}"#.into()],
                        })
                    }
                    _ => json!({"work_item_id":42}),
                }
            }
            "get_workitem_brief" => {
                if self.fail_read.load(Ordering::SeqCst) {
                    return Err(BackendError::validation("fixture read unavailable"));
                }
                let stored = self.fields.lock().unwrap();
                let fields = stored
                    .iter()
                    .map(|f| {
                        let value = if self.mode == "trimmed-body" && f["field_key"] == "description" {
                            json!(f["field_value"].as_str().unwrap().trim())
                        } else if self.mode == "normalized-image-body" && f["field_key"] == "description" {
                            json!("![](https://example.invalid/image.png)<!-- image:{\"uuid\":\"12345678-1234-1234-1234-123456789abc\"} -->\n\n示例正文")
                        } else if self.mode.starts_with("pure-image-placeholder") && f["field_key"] == "description" {
                            let suffix = if self.mode.ends_with("omitted") { "" } else { "\n\n\u{200b}" };
                            json!(format!("![](https://example.invalid/image.png)<!-- image:{{\"uuid\":\"12345678-1234-1234-1234-123456789abc\"}} -->{suffix}"))
                        } else {
                            match f["field_key"].as_str().unwrap() {
                                "template" | "reporter" | "role_owners" | "field_expected" | "field_received" => serde_json::from_str(f["field_value"].as_str().unwrap()).unwrap(),
                                _ => f["field_value"].clone(),
                            }
                        };
                        json!({"key":f["field_key"],"value":value})
                    })
                    .collect::<Vec<_>>();
                let role_value: Value = stored.iter().find(|f|f["field_key"]=="role_owners").map(|f| serde_json::from_str(f["field_value"].as_str().unwrap()).unwrap()).unwrap_or(json!([]));
                let roles=role_value.as_array().into_iter().flatten()
                    .map(|r|json!({"key":r["role"],"members":r["owners"].as_array().unwrap().iter().map(|u|json!({"key":u})).collect::<Vec<_>>()})).collect::<Vec<_>>();
                let changed = self.mode.ends_with("changed-fields");
                json!({"work_item_attribute":{"work_item_id":if self.mode == "wrong-id"{43}else{42},"work_item_name":if self.mode == "mismatch" || changed{"其他标题"}else{"示例工作"},
                    "owned_project":{"key":if self.mode == "wrong-space"{"other-space"}else{"space"}},"work_item_type":{"key":if self.mode == "wrong-type"{"other-type"}else{"custom-key"}},
                    "template":{"id":if changed{456}else{123}},"role_members":if changed{vec![]}else{roles},
                    "create_time":if self.mode=="missing-create-time"{Value::Null}else{json!(if self.mode=="old_item"{1}else{crate::sync::now_ms()})}},
                    "work_item_fields":if changed{vec![]}else{fields},"pagination":{"has_more":false}})
            }
            _ => panic!("unexpected {tool}"),
        };
        if self.mode.starts_with("optional-fields") && tool == "get_workitem_field_meta" {
            value["FieldConfList"].as_array_mut().unwrap().push(json!({
                "field_key":"field_expected", "field_name":"期望时间", "field_type_key":"date",
                "is_required":0, "default_value":{"default_appear":1,"value":base64::engine::general_purpose::STANDARD.encode(r#"{"value":1893427200000}"#)}
            }));
            if self.mode.ends_with("required") {
                value["FieldConfList"].as_array_mut().unwrap().push(json!({
                    "field_key":"field_future", "field_name":"未来业务字段", "field_type_key":"future_type", "is_required":1
                }));
            }
        }
        if self.mode.starts_with("reporter-prefill") {
            if matches!(tool, "get_workitem_field_meta" | "list_workitem_field_config") {
                let list = if tool == "get_workitem_field_meta" { "FieldConfList" } else { "list" };
                for field in value[list].as_array_mut().unwrap() {
                    if field["field_key"] == "reporter" {
                        field["field_key"] = json!("issue_reporter");
                        if self.mode.ends_with("single") && tool == "list_workitem_field_config" {
                            field["field_type"] = json!("user");
                        }
                    }
                }
                value[list].as_array_mut().unwrap().push(json!({
                    "field_key":"custom_reporter", "field_name":"报告人", "field_type":"multi-user"
                }));
            }
            if tool == "list_workitem_role_config" && !self.mode.ends_with("field") {
                value["list"].as_array_mut().unwrap().extend([
                    json!({"role_id":"reporter","role_name":"报告人"}),
                    json!({"role_id":"custom_reporter_role","role_name":"报告人"}),
                ]);
            }
        }
        Ok(ToolResultPayload {
            is_error: false,
            structured: Some(value),
            text_blocks: vec![],
        })
    }
}

struct Harness {
    session: Session,
    fake: Arc<Fake>,
    _remote: crate::remote::TestRemote,
    dir: std::path::PathBuf,
}

#[test]
fn relation_candidates_load_all_pages_and_reject_duplicates() {
    let h = Harness::new("lookup-pages");
    let result = lookup(&h.session, &h.target(), "related", "").unwrap();
    assert_eq!(result.options.len(), 51);
    assert_eq!(result.options.last().unwrap().label, "末页事项");
    let broken = Harness::new("lookup-pages-duplicate");
    assert!(lookup(&broken.session, &broken.target(), "related", "").is_err());
    let missing = Harness::new("lookup-pages-missing");
    assert!(lookup(&missing.session, &missing.target(), "related", "").is_err());
}
impl Harness {
    fn new(mode: &'static str) -> Self {
        let dir = std::env::temp_dir().join(format!(
            "fstodo-create-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("token"), "creation-test-only-token").unwrap();
        std::fs::write(dir.join("config.toml"),format!("token_env='FSTODO_ABSENT_CREATION_TEST_TOKEN'\ntoken_file='{}'\n[[source]]\nid='test-source'\nkind='personal_todo'\nenabled=true\naction='todo'\n",dir.join("token").display().to_string().replace('\\',"/"))).unwrap();
        let session = Session::open(
            crate::Config::load(Some(&dir.join("config.toml")), Some(&dir.join("cache.db")))
                .unwrap(),
        )
        .unwrap();
        let fake = Arc::new(Fake {
            mode,
            writes: AtomicUsize::new(0),
            fields: Mutex::new(vec![]),
            user: Mutex::new("ou_person".into()),
            relation_queries: Mutex::new(vec![]),
            fail_read: AtomicBool::new(mode == "read-error"),
        });
        let remote = crate::remote::install_test_client(
            &session.config,
            &session.credential().unwrap(),
            Box::new(fake.clone()),
        );
        let source = &session.config.sources[0].id;
        session
            .store
            .save_source_types(
                source,
                &[CachedType {
                    project_key: "space".into(),
                    type_key: "custom-key".into(),
                    ..Default::default()
                }],
                1,
            )
            .unwrap();
        session
            .store
            .set_source_type_preferences(
                source,
                &BTreeMap::from([(
                    "custom-key".into(),
                    TypePreference {
                        enabled: false,
                        alias: "任何中文名".into(),
                        create_enabled: true,
                    },
                )]),
            )
            .unwrap();
        Self {
            session,
            fake,
            _remote: remote,
            dir,
        }
    }
    fn target(&self) -> Target {
        Target {
            source_id: self.session.config.sources[0].id.clone(),
            project_key: "space".into(),
            type_key: "custom-key".into(),
        }
    }
    fn request(&self) -> Request {
        let form = discover(&self.session, &self.target()).unwrap();
        Request {
            target: self.target(),
            request_id: "request-one".into(),
            version: form.version,
            fields: BTreeMap::from([
                ("name".into(), json!("示例工作")),
                ("description".into(), json!("完整说明")),
                ("template".into(), json!("123")),
                ("priority".into(), json!("p1")),
                ("reporter".into(), json!(["ou_person"])),
                ("related".into(), json!("789")),
                ("role:fix_owner".into(), json!(["ou_person"])),
            ]),
        }
    }
    fn restore_pending(&self, request_id: &str) {
        // 直接构造旧版台账；finish_action 只允许 pending 收尾，不能反向修改成功记录。
        let conn = rusqlite::Connection::open(self.dir.join("cache.db")).unwrap();
        assert_eq!(conn.execute("UPDATE workflow_action_run SET status='unknown', verified=0 WHERE request_id=?1 AND status='verified'", [request_id]).unwrap(), 1);
        let record = self.session.store.action_by_request(request_id).unwrap().unwrap();
        assert_eq!(record.status, "unknown");
        assert!(!record.verified);
        assert!(pending_forms(&self.session).unwrap().iter().any(|form| form.pending.as_ref().unwrap().request.request_id == request_id));
    }
}
impl Drop for Harness {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

#[test]
fn pure_image_placeholder_is_transport_only_and_read_verification_never_recreates() {
    for mode in ["pure-image-placeholder", "pure-image-placeholder-omitted"] {
        let h = Harness::new(mode);
        let mut request = h.request();
        let original = "![截图](https://example.invalid/image.png)<!--fixture-token-->";
        request.fields.insert("description".into(), json!(original));
        let result = execute(&h.session, &request).unwrap();
        assert_eq!(result.outcome, "verified");
        assert_eq!(request.fields["description"], original);
        let sent = h.fake.fields.lock().unwrap();
        assert_eq!(sent.iter().find(|field|field["field_key"]=="description").unwrap()["field_value"], format!("{original}\u{200b}"));
        drop(sent);
        let record = h.session.store.action_by_request(&request.request_id).unwrap().unwrap();
        let saved: Value = serde_json::from_str(record.detail.as_deref().unwrap()).unwrap();
        assert_eq!(saved["request"]["fields"]["description"], original);
        h.restore_pending(&request.request_id);
        assert_eq!(verify(&h.session, &request.request_id, None, None).unwrap().outcome, "verified");
        assert_eq!(execute(&h.session, &request).unwrap().outcome, "verified");
        assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
    }
}

#[test]
fn normalized_uploaded_image_is_verified_on_execute_and_later_read_without_rewriting() {
    let h = Harness::new("normalized-image-body");
    let mut request = h.request();
    request.fields.insert("description".into(), json!("![截图](https://example.invalid/image.png)<!--fixture-token-->示例正文"));
    let result = execute(&h.session, &request).unwrap();
    assert_eq!(result.outcome, "verified");
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
    // 模拟上一版本因富文本格式变化保留的待核验台账，只核验既有编号。
    h.restore_pending(&request.request_id);
    assert_eq!(verify(&h.session, &request.request_id, None, None).unwrap().outcome, "verified");
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
    assert_eq!(execute(&h.session, &request).unwrap().outcome, "verified");
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
}

#[test]
fn selected_relation_mql_requires_complete_single_group() {
    let complete = json!({"session_id":"fixture-session","list":[{"count":1,"group_infos":[{"group_id":"fixture-group"}]}],"data":{"fixture-group":[{}]}});
    assert_eq!(selected_relation_rows(&complete, 50).unwrap().len(), 1);
    for broken in [
        json!({"session_id":"fixture-session","list":[{"count":2,"group_infos":[{"group_id":"fixture-group"}]}],"data":{"fixture-group":[{}]}}),
        json!({"session_id":"fixture-session","list":[{"count":1,"group_infos":[{"group_id":"fixture-group"},{"group_id":"other"}]}],"data":{"fixture-group":[{}]}}),
        json!({"session_id":"fixture-session","list":[{"count":1,"group_infos":[{"group_id":"fixture-group"}]}],"data":{"space.project":[{}]}}),
    ] { assert!(selected_relation_rows(&broken, 50).is_err()); }
}

#[test]
fn selected_relation_labels_use_scoped_cache_and_exact_id_queries() {
    fn cache(h: &Harness, project: &str, kind: &str, id: &str, title: &str) {
        let conn = rusqlite::Connection::open(h.dir.join("cache.db")).unwrap();
        conn.execute("INSERT INTO work_item(project_key,work_item_type_key,work_item_id,work_item_name,flow_kind,raw_json,first_seen_at_ms,last_seen_at_ms) VALUES(?1,?2,?3,?4,'none','{}',1,1)", rusqlite::params![project,kind,id,title]).unwrap();
    }
    let h = Harness::new("relation-cache");
    cache(&h, "space", "project", "789", "缓存标题");
    cache(&h, "elsewhere", "project", "999", "其他空间标题");
    cache(&h, "space", "elsewhere", "999", "其他类型标题");
    let result = resolve_relation_labels(&h.session, &h.target(), "related", vec!["789".into()]).unwrap();
    assert_eq!(result.options[0].label, "缓存标题");
    assert!(h.fake.relation_queries.lock().unwrap().is_empty());
    let result = resolve_relation_labels(&h.session, &h.target(), "related", vec!["999".into()]).unwrap();
    assert_eq!(result.options[0].label, "精确查询名称");
    assert_eq!(h.fake.relation_queries.lock().unwrap().len(), 1);
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 0);
    for mode in ["relation-multi", "relation-multi-failure", "relation-multi-empty-title", "relation-multi-incomplete"] {
        let h = Harness::new(mode);
        cache(&h, "space", "project", "999", "缓存标题");
        let result = resolve_relation_labels(&h.session, &h.target(), "related", vec!["999".into()]).unwrap();
        assert!(result.options.is_empty(), "must not guess across allowed ranges");
        assert!(result.warning.is_some());
        assert_eq!(h.fake.writes.load(Ordering::SeqCst), 0);
    }
    let h = Harness::new("relation-multi-zero");
    cache(&h, "space", "project", "999", "缓存标题");
    let result = resolve_relation_labels(&h.session, &h.target(), "related", vec!["999".into()]).unwrap();
    assert_eq!(result.options[0].label, "缓存标题");
    assert!(result.warning.is_none());
    let h = Harness::new("relation-failure");
    cache(&h, "space", "project", "789", "缓存标题");
    let result = resolve_relation_labels(&h.session, &h.target(), "related", vec!["789".into(), "999".into()]).unwrap();
    assert_eq!(result.options.len(), 1);
    assert_eq!(result.options[0].value, "789");
    assert!(result.warning.is_some());
    for ids in [vec!["1 OR 1=1".into()], vec!["0".into()], vec!["1".into(); 51]] {
        assert!(resolve_relation_labels(&h.session, &h.target(), "related", ids).is_err());
    }
    assert!(resolve_relation_labels(&h.session, &h.target(), "name", vec!["789".into()]).is_err());
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 0);
}

#[test]
fn transport_stringifies_typed_values_without_double_encoding_text() {
    let cases = [
        (json!(123), "123"),
        (json!(0), "0"),
        (json!(1893427200000_i64), "1893427200000"),
        (json!(false), "false"),
        (json!(["person"]), "[\"person\"]"),
        (json!([{"role":"owner","owners":["person"]}]), "[{\"owners\":[\"person\"],\"role\":\"owner\"}]"),
        (json!("[{\"token\":\"example\"}]"), "[{\"token\":\"example\"}]"),
        (json!(" \n正文  \n"), " \n正文  \n"),
    ];
    let fields = transport_fields(cases.iter().map(|(value, _)| json!({"field_key":"example","field_value":value})).collect());
    for ((_, expected), sent) in cases.iter().zip(fields) {
        assert_eq!(sent["field_value"].as_str().unwrap(), *expected);
    }
}

#[test]
fn required_rejection_preserves_populated_draft_and_uses_form_labels() {
    let h = Harness::new("required-rejection");
    let request = h.request();
    let result = execute(&h.session, &request).unwrap();
    assert_eq!(result.outcome, "not_submitted");
    assert_eq!(result.rejected_field_keys, vec!["description", "role:quality_owner"]);
    assert_eq!(result.message, "飞书未通过必填校验：说明、质量负责人。事项未创建，草稿已保留，请返回草稿核对后重新创建。");
    for _ in 0..2 {
        let pending = pending_forms(&h.session).unwrap().pop().unwrap().pending.unwrap();
        assert_eq!(pending.request.fields, request.fields);
        assert_eq!(pending.result.message, result.message);
        assert_eq!(pending.result.rejected_field_keys, result.rejected_field_keys);
    }
    assert_eq!(verify(&h.session, &request.request_id, None, None).unwrap().message, result.message);
    acknowledge_recovery(&h.session, &request.request_id).unwrap();
    assert!(pending_forms(&h.session).unwrap().is_empty());
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
}

#[test]
fn required_rejection_role_mapping_requires_current_space_and_type() {
    let h = Harness::new("required-rejection");
    let request = h.request();
    let form = discover(&h.session, &request.target).unwrap();
    for key in ["role_other_custom-key_quality_owner", "role_space_other_quality_owner", "role_quality_owner"] {
        let saved = json!({"form":form,"diagnostic":format!("工具调用失败: 工具 create_workitem 返回错误（code=None）: error=ErrFieldRequired,message={{field_name}}({{field_key}}) 必填,任意远端名称({key}) 必填,retriable=false")});
        let result = rejected_result(&request, &saved);
        assert!(result.rejected_field_keys.is_empty());
        assert!(result.message.contains("其他必填项（请在飞书核对）"));
        assert!(!result.message.contains("质量负责人"));
    }
}

#[test]
fn historical_required_rejection_is_narrow_and_does_not_consume_recovery() {
    let message = "error=ErrFieldRequired,message={field_name}({field_key}) 必填,旧显示名,陌生字段(description,unknown_field) 必填,retriable=false\nlogid: fixture-history";
    let h = Harness::new("unknown");
    let request = h.request();
    execute(&h.session, &request).unwrap();
    let record = h.session.store.action_by_request(&request.request_id).unwrap().unwrap();
    let mut saved: Value = serde_json::from_str(record.detail.as_deref().unwrap()).unwrap();
    saved["diagnostic"] = json!(format!("工具调用失败: 工具 create_workitem 返回错误（code=None）: {message}"));
    h.session.store.save_creation_detail(&request.request_id, &saved.to_string()).unwrap();
    for _ in 0..2 {
        let pending = pending_forms(&h.session).unwrap().pop().unwrap().pending.unwrap();
        assert_eq!(pending.request.fields, request.fields);
        assert!(pending.result.message.contains("说明、其他必填项（请在飞书核对）"));
        assert_eq!(pending.result.rejected_field_keys, vec!["description"]);
        assert!(!pending.result.message.contains("unknown_field"));
        assert_eq!(verify(&h.session, &request.request_id, None, None).unwrap().outcome, "not_submitted");
    }
    acknowledge_recovery(&h.session, &request.request_id).unwrap();
    acknowledge_recovery(&h.session, &request.request_id).unwrap();
    assert!(pending_forms(&h.session).unwrap().is_empty());
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
    for invalid in [
        message.replace("retriable=false", "retriable=true"),
        message.replace("{field_name}({field_key}) 必填,", ""),
        message.replace("ErrFieldRequired", "OtherErrFieldRequired"),
        format!("prefix {message}"),
        format!("{message}\nerror=Other"),
        message.replace("description,unknown_field", "description"),
    ] { assert!(required_rejection_keys(&invalid).is_none(), "{invalid}"); }
}

#[test]
fn gateway_rejection_is_terminal_without_repeating_creation() {
    let h = Harness::new("gateway-rejection");
    let request = h.request();
    let result = execute(&h.session, &request).unwrap();
    assert_eq!(result.outcome, "not_submitted");
    assert!(!result.can_verify);
    assert_eq!(verify(&h.session, &request.request_id, None, None).unwrap().outcome, "not_submitted");
    assert_eq!(execute(&h.session, &request).unwrap().outcome, "not_submitted");
    assert_eq!(h.session.store.action_by_request(&request.request_id).unwrap().unwrap().status, "unknown");
    acknowledge_recovery(&h.session, &request.request_id).unwrap();
    let mut next = request.clone(); next.request_id = "request-two".into();
    execute(&h.session, &next).unwrap();
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 2);
}

#[test]
fn rejected_history_does_not_bypass_current_creation_admission() {
    for case in ["disabled", "source", "version"] {
        let mut h = Harness::new("gateway-rejection");
        let request = h.request();
        execute(&h.session, &request).unwrap();
        assert_eq!(pending_forms(&h.session).unwrap().len(), 1);
        assert_eq!(pending_forms(&h.session).unwrap().len(), 1);
        let mut next = request.clone(); next.request_id = "new-request".into();
        match case {
            "disabled" => h.session.store.set_source_type_preferences(&h.target().source_id, &BTreeMap::new()).unwrap(),
            "source" => h.session.config.sources[0].enabled = false,
            _ => next.version = "outdated".into(),
        }
        assert!(execute(&h.session, &next).is_err());
        acknowledge_recovery(&h.session, &request.request_id).unwrap();
        assert!(execute(&h.session, &next).is_err());
        assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
    }
}

#[test]
fn historical_gateway_rejection_recovers_only_proven_uncreated_records() {
    for via_form in [false, true] {
        let h = Harness::new("unknown");
        let request = h.request();
        execute(&h.session, &request).unwrap();
        let record = h.session.store.action_by_request(&request.request_id).unwrap().unwrap();
        let mut saved: Value = serde_json::from_str(record.detail.as_deref().unwrap()).unwrap();
        saved["diagnostic"] = json!("工具调用失败: 工具 create_workitem 返回错误（code=None）: error=MCPGatewayRequestMismatch,message=argument arguments.fields[1].field_value must be string, got number,retriable=false\nlogid: fixture-only");
        h.session.store.save_creation_detail(&request.request_id, &saved.to_string()).unwrap();
        if via_form {
            let pending = pending_forms(&h.session).unwrap().pop().unwrap().pending.unwrap();
            assert_eq!(pending.request.fields, request.fields);
            assert_eq!(pending.result.outcome, "not_submitted");
        }
        for _ in 0..2 { assert_eq!(verify(&h.session, &request.request_id, None, None).unwrap().outcome, "not_submitted"); }
        assert_eq!(execute(&h.session, &request).unwrap().outcome, "not_submitted");
        assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
        assert_eq!(h.session.store.action_by_request(&request.request_id).unwrap().unwrap().status, "unknown");
        assert_eq!(pending_forms(&h.session).unwrap().len(), 1);
        assert_eq!(pending_forms(&h.session).unwrap().len(), 1);
        acknowledge_recovery(&h.session, &request.request_id).unwrap();
        assert!(pending_forms(&h.session).unwrap().is_empty());
        assert_eq!(h.session.store.action_by_request(&request.request_id).unwrap().unwrap().status, "failed");
    }
    for message in ["MCPGatewayRequestMismatch", "error=MCPGatewayRequestMismatch,message=argument arguments.fields[1].field_value must be string, got number,retriable=true", "error=MCPGatewayRequestMismatch,message=business failed,retriable=false"] {
        assert!(!gateway_field_rejection(message));
    }
}

#[test]
fn reporter_prefill_matches_system_identity_and_current_token_user_only() {
    for mode in ["reporter-prefill", "reporter-prefill-single", "reporter-prefill-field"] {
        let h = Harness::new(mode);
        let form = discover(&h.session, &h.target()).unwrap();
        let key = if mode.ends_with("field") { "issue_reporter" } else { "role:reporter" };
        let reporter = form.fields.iter().find(|field| field.key == key).unwrap();
        assert!(reporter.reporter_self);
        assert_eq!(reporter.initial, if mode.ends_with("single") { json!("ou_person") } else { json!(["ou_person"]) });
        assert_eq!(reporter.options[0].label, "测试用户");
        assert!(form.fields.iter().filter(|field| field.key != key).all(|field| !field.reporter_self));
        for field in form.fields.iter().filter(|field| field.key.starts_with("custom_reporter") || field.key == "role:custom_reporter_role" || field.key == "role:fix_owner") {
            assert!(field.initial.is_null());
        }
        *h.fake.user.lock().unwrap() = "ou_other_token_user".into();
        let other = discover(&h.session, &h.target()).unwrap();
        assert_ne!(other.context, form.context);
        assert_eq!(other.fields.iter().find(|field| field.key == key).unwrap().options[0].value, "ou_other_token_user");
        assert_eq!(h.fake.writes.load(Ordering::SeqCst), 0);
    }
}

#[test]
fn optional_business_fields_are_discovered_across_pages_without_writing() {
    let h = Harness::new("optional-fields");
    let form = discover(&h.session, &h.target()).unwrap();
    for (key, label, kind) in [
        ("field_feedback", "反馈说明", "text"),
        ("field_expected", "期望时间", "date"),
        ("field_category", "需求分类", "select"),
        ("field_source", "需求来源", "select"),
        ("field_received", "需求接收", "bool"),
        ("business", "业务线", "select"),
        ("watchers", "关注人", "people"),
        ("field_future", "未来业务字段", "unsupported"),
    ] {
        let field = form.fields.iter().find(|field| field.key == key).unwrap();
        assert_eq!(field.label, label);
        assert_eq!(field.kind, kind);
        assert!(!field.required);
        assert_eq!(form.fields.iter().filter(|field| field.key == key).count(), 1);
    }
    assert_eq!(form.fields.len(), 16); // 6 个原字段、8 个可选业务字段、2 个角色。
    assert_eq!(form.fields.iter().find(|field| field.key == "field_expected").unwrap().initial, json!("2030-01-01"));
    assert_eq!(form.fields.iter().find(|field| field.key == "field_category").unwrap().options[0].value, "category_feature");
    assert!(form.fields.iter().find(|field| field.key == "watchers").unwrap().multiple);

    // 空白可选字段与只读系统字段均不进入提交计划；0/false 等有效值继续保留。
    let mut request = h.request();
    let original = plan(&form, &request).unwrap();
    assert_eq!(original.len(), 7);
    request.fields.extend([
        ("field_feedback".into(), json!("来自已有需求的反馈")),
        ("field_expected".into(), json!("2030-01-01")),
        ("field_category".into(), json!("category_feature")),
        ("field_source".into(), json!("source_customer")),
        ("field_received".into(), json!(false)),
        ("business".into(), json!("business_app")),
    ]);
    let fields = plan(&form, &request).unwrap();
    for (key, expected) in [
        ("field_feedback", json!("来自已有需求的反馈")),
        ("field_expected", json!(1893427200000_i64)),
        ("field_category", json!("category_feature")),
        ("field_source", json!("source_customer")),
        ("field_received", json!(false)),
        ("business", json!("business_app")),
    ] {
        assert_eq!(fields.iter().find(|field| field["field_key"] == key).unwrap()["field_value"], expected);
    }
    request.fields.insert("updated_at".into(), json!("2030-01-01"));
    assert!(plan(&form, &request).is_err());
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 0);
}

#[test]
fn unsupported_required_business_fields_still_block_submission() {
    let h = Harness::new("optional-fields-required");
    let form = discover(&h.session, &h.target()).unwrap();
    let field = form.fields.iter().find(|field| field.key == "field_future").unwrap();
    assert!(field.required);
    assert_eq!(field.kind, "unsupported");
    assert!(plan(&form, &h.request()).is_err());
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 0);
}

#[test]
fn generic_form_uses_real_keys_defaults_and_selectors() {
    let h = Harness::new("ok");
    let form = discover(&h.session, &h.target()).unwrap();
    assert_eq!(
        form.fields
            .iter()
            .find(|f| f.key == "template")
            .unwrap()
            .initial,
        json!("123")
    );
    assert_eq!(
        form.fields
            .iter()
            .find(|f| f.key == "priority")
            .unwrap()
            .initial,
        json!("p1")
    );
    assert!(!form.role_requirements_complete);
    assert!(
        form.fields
            .iter()
            .find(|f| f.key == "role:fix_owner")
            .unwrap()
            .required
    );
    assert!(
        !form
            .fields
            .iter()
            .find(|f| f.key == "role:quality_owner")
            .unwrap()
            .required
    );
    assert_eq!(
        lookup(&h.session, &h.target(), "reporter", "")
            .unwrap()
            .options[0]
            .value,
        "ou_person"
    );
    assert_eq!(
        lookup(&h.session, &h.target(), "related", "示例")
            .unwrap()
            .options[0]
            .value,
        "789"
    );
    let request = h.request();
    let result = execute(&h.session, &request).unwrap();
    assert_eq!(result.outcome, "verified");
    let fields = h.fake.fields.lock().unwrap();
    assert_eq!(
        fields
            .iter()
            .find(|f| f["field_key"] == "template")
            .unwrap()["field_value"],
        "123"
    );
    assert_eq!(
        fields
            .iter()
            .find(|f| f["field_key"] == "reporter")
            .unwrap()["field_value"],
        json!("[\"ou_person\"]")
    );
    assert_eq!(
        fields
            .iter()
            .find(|f| f["field_key"] == "role_owners")
            .unwrap()["field_value"],
        json!("[{\"owners\":[\"ou_person\"],\"role\":\"fix_owner\"}]")
    );
    drop(fields);
    assert_eq!(execute(&h.session, &request).unwrap().outcome, "verified");
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
}

#[test]
fn markdown_body_is_submitted_without_trimming_semantic_whitespace() {
    let h = Harness::new("ok");
    let mut request = h.request();
    let body = "\n\n    indented code\n\n正文末尾硬换行  \n下一行\n\n";
    request.fields.insert("description".into(), json!(body));
    request.fields.insert("name".into(), json!("  示例工作  "));
    assert_eq!(execute(&h.session, &request).unwrap().outcome, "verified");
    let fields = h.fake.fields.lock().unwrap();
    assert_eq!(fields.iter().find(|f| f["field_key"] == "description").unwrap()["field_value"], body);
    assert_eq!(fields.iter().find(|f| f["field_key"] == "name").unwrap()["field_value"], "示例工作");
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
}

#[test]
fn created_item_does_not_require_identical_fields_and_legacy_pending_can_recover() {
    for mode in ["trimmed-body", "changed-fields", "mismatch"] {
        let h = Harness::new(mode);
        let mut request = h.request();
        request.fields.insert("description".into(), json!("    indented code\n\n![截图](https://example.invalid/original.png)<!--fixture-token-->"));
        assert_eq!(execute(&h.session, &request).unwrap().outcome, "verified", "{mode}");
        assert!(pending_forms(&h.session).unwrap().is_empty());
        // 模拟旧版因字段差异留下的已知编号台账，重新核验只读且释放创建锁。
        h.restore_pending(&request.request_id);
        h.fake.fail_read.store(true, Ordering::SeqCst);
        assert!(verify(&h.session, &request.request_id, None, None).is_err());
        assert_eq!(h.session.store.action_by_request(&request.request_id).unwrap().unwrap().status, "unknown");
        h.fake.fail_read.store(false, Ordering::SeqCst);
        assert_eq!(verify(&h.session, &request.request_id, None, None).unwrap().outcome, "verified");
        assert!(discover(&h.session, &h.target()).unwrap().pending.is_none());
        let saved = h.session.store.action_by_request(&request.request_id).unwrap().unwrap();
        let saved: Value = serde_json::from_str(saved.detail.as_deref().unwrap()).unwrap();
        assert_eq!(saved["request"]["fields"], serde_json::to_value(&request.fields).unwrap());
        assert_eq!(execute(&h.session, &request).unwrap().outcome, "verified");
        assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
        let mut next = request.clone();
        next.request_id = "request-two".into();
        assert_eq!(execute(&h.session, &next).unwrap().outcome, "verified");
        assert_eq!(h.fake.writes.load(Ordering::SeqCst), 2);
    }
}

#[test]
fn read_failure_keeps_pending_until_item_can_be_confirmed_without_recreating() {
    let h = Harness::new("read-error");
    let request = h.request();
    assert_eq!(execute(&h.session, &request).unwrap().outcome, "unknown");
    assert!(verify(&h.session, &request.request_id, None, None).is_err());
    h.fake.fail_read.store(false, Ordering::SeqCst);
    assert_eq!(verify(&h.session, &request.request_id, None, None).unwrap().outcome, "verified");
    assert!(pending_forms(&h.session).unwrap().is_empty());
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
}

#[test]
fn manual_number_recovery_does_not_compare_fields() {
    let h = Harness::new("unknown-changed-fields");
    let request = h.request();
    assert_eq!(execute(&h.session, &request).unwrap().outcome, "unknown");
    assert_eq!(verify(&h.session, &request.request_id, Some("42"), None).unwrap().outcome, "verified");
    assert!(pending_forms(&h.session).unwrap().is_empty());
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
}

#[test]
fn manual_number_without_creation_time_stays_pending() {
    let h = Harness::new("missing-create-time");
    let request = h.request();
    assert_eq!(execute(&h.session, &request).unwrap().outcome, "unknown");
    assert!(verify(&h.session, &request.request_id, Some("42"), None).is_err());
    assert_eq!(pending_forms(&h.session).unwrap().len(), 1);
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
}

#[test]
fn whitespace_only_required_body_is_rejected_before_creation() {
    let h = Harness::new("ok");
    let mut request = h.request();
    request.fields.insert("description".into(), json!(" \n\t "));
    assert!(execute(&h.session, &request).is_err());
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 0);
}

#[test]
fn default_off_and_preflight_failures_never_write() {
    let h = Harness::new("ok");
    let mut request = h.request();
    request.fields.remove("related");
    assert!(execute(&h.session, &request).is_err());
    request = h.request();
    request.fields.remove("role:fix_owner");
    assert!(execute(&h.session, &request).is_err());
    request = h.request();
    request.fields.insert("outside".into(), json!(1));
    assert!(execute(&h.session, &request).is_err());
    request = h.request();
    request.version = "stale".into();
    assert!(execute(&h.session, &request).is_err());
    let preferences: crate::store::TypePreferences =
        serde_json::from_value(json!({"custom-key":{"enabled":true,"alias":"产品经理"}})).unwrap();
    assert!(!preferences["custom-key"].create_enabled);
    h.session
        .store
        .set_source_type_preferences(&h.target().source_id, &preferences)
        .unwrap();
    assert!(discover(&h.session, &h.target()).is_err());
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 0);
}

#[test]
fn uncertain_receipts_are_persisted_block_retries_and_can_only_be_read_back() {
    for mode in ["unknown", "error", "precedence", "wrong-id", "wrong-space", "wrong-type"] {
        let h = Harness::new(mode);
        let request = h.request();
        let result = execute(&h.session, &request).unwrap();
        assert_eq!(result.outcome, "unknown");
        let recovered = discover(&h.session, &h.target()).unwrap().pending.unwrap();
        assert_eq!(recovered.request.fields, request.fields);
        let mut another = request.clone();
        another.request_id = "second-attempt".into();
        assert!(execute(&h.session, &another).is_err());
        if mode == "unknown" {
            assert_eq!(
                verify(&h.session, &request.request_id, Some("42"), None)
                    .unwrap()
                    .outcome,
                "verified"
            );
            assert!(discover(&h.session, &h.target()).unwrap().pending.is_none());
        } else {
            assert!(verify(&h.session, &request.request_id, None, None).is_err());
        }
        assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
    }
}

#[test]
fn interrupted_request_keeps_fields_and_same_target_lock_across_sources() {
    let mut h = Harness::new("ok");
    let request = h.request();
    let form = discover(&h.session, &h.target()).unwrap();
    let record = ActionRecord {
        request_id: request.request_id.clone(),
        item_id: ledger_key(&request.target, &form.context),
        action_kind: "create_workitem".into(),
        target: serde_json::to_string(&request.target).unwrap(),
        version: form.version.clone(),
        status: "pending".into(),
        verified: false,
        detail: Some(json!({"request":request,"form":form,"item_id":null}).to_string()),
        created_at: 1,
        finished_at: None,
    };
    assert!(h.session.store.begin_action(&record).unwrap());
    assert_eq!(
        discover(&h.session, &h.target())
            .unwrap()
            .pending
            .unwrap()
            .request
            .request_id,
        "request-one"
    );
    h.session
        .store
        .set_source_type_preferences(&h.target().source_id, &BTreeMap::new())
        .unwrap();
    h.session.config.sources[0].enabled = false;
    assert_eq!(pending_forms(&h.session).unwrap().len(), 1);
    assert!(discover(&h.session, &h.target()).unwrap().pending.is_some());
    assert_eq!(execute(&h.session, &request).unwrap().outcome, "unknown");
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 0);
    let mut other = request.target.clone();
    other.source_id = "another-source".into();
    assert_eq!(
        ledger_key(&request.target, &form.context),
        ledger_key(&other, &form.context)
    );
}

#[test]
fn unsupported_required_fields_and_invalid_values_do_not_pass_plan() {
    let h = Harness::new("ok");
    let request = h.request();
    let mut form = discover(&h.session, &h.target()).unwrap();
    form.fields[0].kind = "unsupported".into();
    assert!(plan(&form, &request).is_err());
    let form = discover(&h.session, &h.target()).unwrap();
    let mut request = request;
    request
        .fields
        .insert("priority".into(), json!("disabled-option"));
    assert!(plan(&form, &request).is_err());
    let mut f = form.fields[0].clone();
    f.kind = "number".into();
    assert_eq!(encode(&f, &json!(0)).unwrap(), json!(0.0));
    f.kind = "bool".into();
    assert_eq!(encode(&f, &json!(false)).unwrap(), json!(false));
    let mut form = form;
    let mut optional = f;
    optional.key = "optional-future".into();
    optional.kind = "unsupported".into();
    optional.required = false;
    form.fields.push(optional);
    request.fields.insert("priority".into(), json!("p1"));
    request
        .fields
        .insert("optional-future".into(), json!({"server":"default"}));
    assert!(!plan(&form, &request)
        .unwrap()
        .iter()
        .any(|f| f["field_key"] == "optional-future"));
}

#[test]
fn pending_records_follow_stable_user_and_database_context() {
    let h = Harness::new("unknown");
    let request = h.request();
    execute(&h.session, &request).unwrap();
    let context = account(&h.session).unwrap();
    std::fs::write(h.dir.join("token"), "rotated-test-token").unwrap();
    let _rotated = crate::remote::install_test_client(
        &h.session.config,
        &h.session.credential().unwrap(),
        Box::new(h.fake.clone()),
    );
    assert_eq!(account(&h.session).unwrap(), context);
    assert_eq!(pending_forms(&h.session).unwrap().len(), 1);
    *h.fake.user.lock().unwrap() = "other-user".into();
    assert!(pending_forms(&h.session).unwrap().is_empty());
    assert!(verify(&h.session, &request.request_id, Some("42"), None).is_err());
    let other = Harness::new("ok");
    assert_ne!(account(&other.session).unwrap(), context);
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
}

#[test]
fn manual_number_cannot_confirm_an_older_identical_item() {
    let h = Harness::new("old_item");
    let request = h.request();
    assert_eq!(execute(&h.session, &request).unwrap().outcome, "unknown");
    assert!(verify(&h.session, &request.request_id, Some("42"), None).is_err());
    assert_eq!(pending_forms(&h.session).unwrap().len(), 1);
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
}

#[test]
fn people_default_candidates_include_cached_participants_and_exact_matches_support_partial_names() {
    let h = Harness::new("ok");
    let id = WorkItemId {
        project_key: Some("space".into()),
        work_item_type_key: Some("custom-key".into()),
        work_item_id: "cached".into(),
    };
    h.session.store.save_item_detail(&ItemDetail{id,fetched_at_ms:1,pages:vec![],data:json!({
        "work_item_attribute":{"role_members":[{"key":"fix_owner","name":"修复角色","members":[{"key":"ou_developer","name":"李开发"}]}]},
        "nodes":[{"owners":[{"key":"ou_owner","name":"陈负责人"}]}],
        "work_item_fields":[{"key":"relation","value":{"key":"not-a-person","name":"这不是人"}}],
        "unrelated":{"members":[{"key":"not-a-user","name":"这也不是人"}]}
    })}).unwrap();
    let initial = lookup(&h.session, &h.target(), "reporter", "")
        .unwrap()
        .options;
    assert!(initial.iter().any(|p| p.value == "ou_developer"));
    assert!(initial.iter().any(|p| p.value == "ou_owner"));
    assert!(initial.iter().any(|p| p.value == "ou_person"));
    assert!(!initial.iter().any(|p| ["fix_owner", "not-a-person", "not-a-user"].contains(&p.value.as_str())));
    let partial = lookup(&h.session, &h.target(), "reporter", "开发")
        .unwrap()
        .options;
    assert_eq!(partial.len(), 1);
    assert_eq!(partial[0].label, "李开发");
    assert_eq!(lookup(&h.session, &h.target(), "reporter", "负责人").unwrap().options[0].value, "ou_owner");
    assert_eq!(
        lookup(&h.session, &h.target(), "reporter", "示例同事")
            .unwrap()
            .options[0]
            .value,
        "ou_colleague"
    );
    assert_eq!(
        lookup(&h.session, &h.target(), "role:fix_owner", "同事")
            .unwrap()
            .options[0]
            .label,
        "示例同事"
    );
    let other_context = "another-account";
    assert!(h
        .session
        .store
        .creation_people(other_context, "space")
        .unwrap()
        .is_empty());
    assert!(h
        .session
        .store
        .creation_people(&account(&h.session).unwrap(), "other-space")
        .unwrap()
        .is_empty());
}

#[test]
fn unregistered_local_draft_is_recovered_and_late_original_call_cannot_write() {
    let h = Harness::new("ok");
    let mut request = h.request();
    assert_eq!(
        verify(&h.session, &request.request_id, None, Some(&request))
            .unwrap()
            .outcome,
        "not_submitted"
    );
    assert_eq!(
        execute(&h.session, &request).unwrap().outcome,
        "not_submitted"
    );
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 0);
    request.request_id = "confirmed-new-attempt".into();
    assert_eq!(execute(&h.session, &request).unwrap().outcome, "verified");
    assert_eq!(h.fake.writes.load(Ordering::SeqCst), 1);
}
