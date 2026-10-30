use super::*;
use crate::{
    mcp::{ConnectionInfo, TodoSource, ToolResultPayload},
    store::{CachedType, TypePreference},
};
use async_trait::async_trait;
use serde_json::Map;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};

struct Fake {
    mode: &'static str,
    writes: AtomicUsize,
    fields: Mutex<Vec<Value>>,
    user: Mutex<String>,
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
        let configs = json!([
            {"field_key":"name","field_name":"标题","field_type":"text"},
            {"field_key":"template","field_name":"流程","field_type":"_work_item_template","option":[
                {"option_id":123,"option_name":"通用模板"},{"option_id":456,"option_name":"已停用","disabled":true}]},
            {"field_key":"description","field_name":"说明","field_type":"multi-text"},
            {"field_key":"priority","field_name":"优先级","field_type":"select","option":[{"option_id":"p1","option_name":"高"}]},
            {"field_key":"reporter","field_name":"报告人","field_type":"multi-user"},
            {"field_key":"related","field_name":"所属项目","field_type":"workitem_related_select","related_work_item_info":[{"project_key":"space","work_item_type":"project"}]}
        ]);
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
            "list_workitem_field_config" => json!({"list":configs,"pagination":{"has_more":false}}),
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
            "search_by_mql" => json!({"data":{"space.project":[{"moql_field_list":[
                {"key":"work_item_id","value":{"long_value":789}},{"key":"name","value":{"string_value":"示例项目"}}
            ]}]}}),
            "create_workitem" => {
                self.writes.fetch_add(1, Ordering::SeqCst);
                *self.fields.lock().unwrap() = args["fields"].as_array().unwrap().clone();
                match self.mode {
                    "unknown" | "old_item" => {
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
                let stored = self.fields.lock().unwrap();
                let fields = stored
                    .iter()
                    .map(|f| {
                        let value = if self.mode == "trimmed-body" && f["field_key"] == "description" {
                            json!(f["field_value"].as_str().unwrap().trim())
                        } else {
                            f["field_value"].clone()
                        };
                        json!({"key":f["field_key"],"value":value})
                    })
                    .collect::<Vec<_>>();
                let roles=stored.iter().find(|f|f["field_key"]=="role_owners").and_then(|f|f["field_value"].as_array()).into_iter().flatten()
                    .map(|r|json!({"key":r["role"],"members":r["owners"].as_array().unwrap().iter().map(|u|json!({"key":u})).collect::<Vec<_>>()})).collect::<Vec<_>>();
                json!({"work_item_attribute":{"work_item_id":42,"work_item_name":if self.mode == "mismatch"{"其他标题"}else{"示例工作"},
                    "owned_project":{"key":"space"},"work_item_type":{"key":"custom-key"},"template":{"id":123},"role_members":roles,
                    "create_time":if self.mode=="old_item"{1}else{crate::sync::now_ms()}},
                    "work_item_fields":fields,"pagination":{"has_more":false}})
            }
            _ => panic!("unexpected {tool}"),
        };
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
}
impl Drop for Harness {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
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
        123
    );
    assert_eq!(
        fields
            .iter()
            .find(|f| f["field_key"] == "reporter")
            .unwrap()["field_value"],
        json!(["ou_person"])
    );
    assert_eq!(
        fields
            .iter()
            .find(|f| f["field_key"] == "role_owners")
            .unwrap()["field_value"],
        json!([{"role":"fix_owner","owners":["ou_person"]}])
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
fn changed_markdown_whitespace_keeps_result_uncertain_and_draft_intact() {
    let h = Harness::new("trimmed-body");
    let mut request = h.request();
    request.fields.insert("description".into(), json!("    indented code\n\n"));
    assert_eq!(execute(&h.session, &request).unwrap().outcome, "unknown");
    let pending = discover(&h.session, &h.target()).unwrap().pending.unwrap();
    assert_eq!(pending.request.fields, request.fields);
    assert!(verify(&h.session, &request.request_id, None, None).is_err());
    assert_eq!(execute(&h.session, &request).unwrap().outcome, "unknown");
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
    for mode in ["unknown", "error", "precedence", "mismatch"] {
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
