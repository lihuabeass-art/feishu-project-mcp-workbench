use super::*;
use crate::{
    mcp::{ConnectionInfo, TodoSource, ToolResultPayload},
    store::{CachedType, TypePreference},
};
use async_trait::async_trait;
use serde_json::Map;
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
};

struct Fake {
    mode: &'static str,
    fields: Mutex<Vec<Value>>,
    creates: AtomicUsize,
    updates: AtomicUsize,
    signatures: AtomicUsize,
    user: Mutex<String>,
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
        let value = match tool {
            "get_workitem_field_meta" => {
                json!({"FieldConfList":[{"field_key":"name","field_name":"标题","is_required":1}]})
            }
            "list_workitem_field_config" => json!({"list":[
                {"field_key":"name","field_name":"标题","field_type":"text"},
                {"field_key":"template","field_name":"模板","field_type":"_work_item_template","option":[{"option_id":123,"option_name":"通用"}]},
                {"field_key":"custom_attachment","field_name":"附件","field_type":"multi-file"}
            ],"pagination":{"has_more":false}}),
            "list_workitem_role_config" => json!({"list":[],"pagination":{"has_more":false}}),
            "search_user_info" => {
                json!([{"user_key":*self.user.lock().unwrap(),"name_cn":"示例用户"}])
            }
            "upload_file" => {
                self.signatures.fetch_add(1, Ordering::SeqCst);
                assert_eq!(args["resource_type"], 15);
                assert_eq!(args["field_key"], "custom_attachment");
                assert_eq!(args["work_item_type"], "custom-type");
                json!({"upload_url":"https://project.feishu.cn/goapi/v5/platform/file/stream/mcp/upload/15/:part_number",
                    "sign":"fixture-sign","sign_expire_time":0,"is_multipart":false})
            }
            "create_workitem" => {
                self.creates.fetch_add(1, Ordering::SeqCst);
                let fields = args["fields"].as_array().unwrap().clone();
                if let Some(field) = fields
                    .iter()
                    .find(|field| field["field_key"] == "custom_attachment")
                {
                    assert_eq!(remote_files(&field["field_value"]).unwrap().len(), 1);
                }
                *self.fields.lock().unwrap() = fields;
                json!({"work_item_id":42})
            }
            "update_field" => {
                self.updates.fetch_add(1, Ordering::SeqCst);
                let next = &args["fields"][0];
                let files = remote_files(&next["field_value"]).unwrap();
                assert_eq!(files[0]["uid"], "server-uid");
                assert_eq!(files[0]["unknown_metadata"], "preserved");
                if self.mode != "mismatch" {
                    let mut fields = self.fields.lock().unwrap();
                    *fields
                        .iter_mut()
                        .find(|field| field["field_key"] == next["field_key"])
                        .unwrap() = next.clone();
                }
                if self.mode == "read-error" {
                    self.fail_read.store(true, Ordering::SeqCst);
                }
                return Ok(ToolResultPayload {
                    is_error: self.mode == "tool-error",
                    structured: None,
                    text_blocks: vec![if self.mode == "tool-error" {
                        "denied"
                    } else {
                        "success\nlog_id: fixture-only"
                    }
                    .into()],
                });
            }
            "get_workitem_brief" => {
                if self.fail_read.load(Ordering::SeqCst) {
                    return Err(BackendError::validation("fixture read unavailable"));
                }
                let fields = self
                    .fields
                    .lock()
                    .unwrap()
                    .iter()
                    .map(|field| {
                        let mut value = field["field_value"].clone();
                        if field["field_key"] == "custom_attachment" {
                            let mut files = remote_files(&value).unwrap();
                            for file in &mut files {
                                file["uid"] = json!("server-uid");
                                file["unknown_metadata"] = json!("preserved");
                                file["fileToken"] = json!("server-resigned-token");
                            }
                            value = json!(serde_json::to_string(&files).unwrap());
                        }
                        json!({"key":field["field_key"],"value":value})
                    })
                    .collect::<Vec<_>>();
                json!({"work_item_attribute":{"work_item_id":42,"work_item_name":"示例事项","owned_project":{"key":"space"},
                    "work_item_type":{"key":"custom-type"},"template":{"id":123},"create_time":crate::sync::now_ms()},
                    "work_item_fields":fields,"pagination":{"has_more":false}})
            }
            _ => panic!("unexpected {tool}"),
        };
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
            "fstodo-attachment-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("token"), "attachment-test-only-token").unwrap();
        std::fs::write(dir.join("config.toml"), format!("token_env='FSTODO_ABSENT_ATTACHMENT_TEST_TOKEN'\ntoken_file='{}'\n[[source]]\nid='source'\nkind='personal_todo'\nenabled=true\naction='todo'\n", dir.join("token").display().to_string().replace('\\', "/"))).unwrap();
        let session = Session::open(
            crate::Config::load(Some(&dir.join("config.toml")), Some(&dir.join("cache.db")))
                .unwrap(),
        )
        .unwrap();
        let fake = Arc::new(Fake {
            mode,
            fields: Mutex::new(vec![]),
            creates: AtomicUsize::new(0),
            updates: AtomicUsize::new(0),
            signatures: AtomicUsize::new(0),
            user: Mutex::new("ou_attachment".into()),
            fail_read: AtomicBool::new(false),
        });
        let remote = crate::remote::install_test_client(
            &session.config,
            &session.credential().unwrap(),
            Box::new(fake.clone()),
        );
        session
            .store
            .save_source_types(
                "source",
                &[CachedType {
                    project_key: "space".into(),
                    type_key: "custom-type".into(),
                    ..Default::default()
                }],
                1,
            )
            .unwrap();
        session
            .store
            .set_source_type_preferences(
                "source",
                &BTreeMap::from([(
                    "custom-type".into(),
                    TypePreference {
                        enabled: true,
                        alias: String::new(),
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
            source_id: "source".into(),
            project_key: "space".into(),
            type_key: "custom-type".into(),
        }
    }
    fn form(&self) -> Form {
        super::super::discover(&self.session, &self.target()).unwrap()
    }
    fn save(&self, name: &str) -> Attachment {
        save(
            &self.session,
            &self.target(),
            &self.form().context,
            "custom_attachment",
            &base64::engine::general_purpose::STANDARD.encode(b"example attachment"),
            "application/pdf",
            name,
        )
        .unwrap()
    }
    fn uploaded(&self, name: &str) -> Attachment {
        let file = self.save(name);
        upload_with(&self.session, &self.target(), &self.form().context, "custom_attachment", &file.id, |_, bytes| {
            assert_eq!(bytes.file_name, name);
            assert_eq!(bytes.bytes, b"example attachment");
            Ok(json!({"code":0,"data":{"file_token":format!("token-{}",file.id),"un_upload_index":[]}}))
        }).unwrap()
    }
    fn request(&self, files: &[Attachment]) -> Request {
        let form = self.form();
        Request {
            target: self.target(),
            request_id: "attachment-request".into(),
            version: form.version,
            fields: BTreeMap::from([
                ("name".into(), json!("示例事项")),
                ("template".into(), json!("123")),
                ("custom_attachment".into(), json!(files)),
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
fn attachment_selection_persists_bytes_names_and_scope_without_network_upload() {
    let h = Harness::new("ok");
    let file = h.save("a.pdf");
    let reopened = Session::open(h.session.config.clone()).unwrap();
    assert_eq!(
        get(
            &reopened,
            &h.target(),
            &h.form().context,
            "custom_attachment",
            &file.id
        )
        .unwrap()
        .name,
        "a.pdf"
    );
    assert!(get(
        &h.session,
        &h.target(),
        &h.form().context,
        "another-field",
        &file.id
    )
    .is_err());
    assert!(save(
        &h.session,
        &h.target(),
        &h.form().context,
        "custom_attachment",
        "",
        "application/pdf",
        "a.pdf"
    )
    .is_err());
    assert!(save(
        &h.session,
        &h.target(),
        &h.form().context,
        "custom_attachment",
        "YQ==",
        "application/pdf",
        "../a.pdf"
    )
    .is_err());
    assert_eq!(h.fake.signatures.load(Ordering::SeqCst), 0);
    assert_eq!(h.fake.creates.load(Ordering::SeqCst), 0);
}

#[test]
fn upload_uses_attachment_resource_and_reuses_receipt_only_in_current_account() {
    let h = Harness::new("ok");
    let field = h
        .form()
        .fields
        .into_iter()
        .find(|field| field.key == "custom_attachment")
        .unwrap();
    assert_eq!(field.kind, "attachment");
    assert!(field.multiple);
    let uploaded = h.uploaded("a.pdf");
    upload_with(
        &h.session,
        &h.target(),
        &h.form().context,
        "custom_attachment",
        &uploaded.id,
        |_, _| panic!("must reuse"),
    )
    .unwrap();
    assert_eq!(h.fake.signatures.load(Ordering::SeqCst), 1);
    let context = h.form().context;
    *h.fake.user.lock().unwrap() = "ou_other".into();
    assert!(upload_with(
        &h.session,
        &h.target(),
        &context,
        "custom_attachment",
        &uploaded.id,
        |_, _| panic!("must reject")
    )
    .is_err());
}

#[test]
fn upload_failure_keeps_bytes_and_never_reuses_incomplete_or_error_receipts() {
    let h = Harness::new("ok");
    let saved = h.save("a.pdf");
    for response in [
        json!({"code":1,"data":{"file_token":"token"}}),
        json!({"file_token":"token","un_upload_index":[0]}),
        json!({"file_token":"token","error":"rejected"}),
        json!({"code":0,"data":{}}),
        json!("success"),
    ] {
        assert!(upload_with(
            &h.session,
            &h.target(),
            &h.form().context,
            "custom_attachment",
            &saved.id,
            |_, _| Ok(response)
        )
        .is_err());
        assert!(get(
            &h.session,
            &h.target(),
            &h.form().context,
            "custom_attachment",
            &saved.id
        )
        .unwrap()
        .file_token
        .is_none());
    }
    assert_eq!(h.fake.signatures.load(Ordering::SeqCst), 5);
    assert_eq!(h.fake.creates.load(Ordering::SeqCst), 0);
}

#[test]
fn unuploaded_or_forged_attachment_never_reaches_creation() {
    let h = Harness::new("ok");
    assert!(super::super::execute(&h.session, &h.request(&[h.save("a.pdf")])).is_err());
    let mut file = h.uploaded("a.pdf");
    file.file_token = Some("forged-token".into());
    assert!(super::super::execute(&h.session, &h.request(&[file])).is_err());
    assert_eq!(h.fake.creates.load(Ordering::SeqCst), 0);
}

#[test]
fn attachment_token_is_preserved_as_an_opaque_json_string() {
    let h = Harness::new("ok");
    let saved = h.save("a.pdf");
    let token = "opaque--token=<value>";
    let uploaded = upload_with(&h.session, &h.target(), &h.form().context, "custom_attachment", &saved.id,
        |_, _| Ok(json!({"file_token":token}))).unwrap();
    let encoded = encode(&json!([uploaded])).unwrap();
    assert_eq!(remote_files(&encoded).unwrap()[0]["fileToken"], token);
}

#[test]
fn multiple_attachments_create_one_then_append_and_preserve_server_objects() {
    for mode in ["ok", "tool-error"] {
        let h = Harness::new(mode);
        let request = h.request(&[
            h.uploaded("a.pdf"),
            h.uploaded("b.pdf"),
            h.uploaded("c.pdf"),
        ]);
        assert_eq!(
            super::super::execute(&h.session, &request).unwrap().outcome,
            "verified"
        );
        assert_eq!(h.fake.creates.load(Ordering::SeqCst), 1);
        assert_eq!(h.fake.updates.load(Ordering::SeqCst), 2);
        assert_eq!(
            super::super::execute(&h.session, &request).unwrap().outcome,
            "verified"
        );
        assert_eq!(h.fake.updates.load(Ordering::SeqCst), 2);
    }
}

#[test]
fn partial_write_or_read_failure_retains_full_request_and_verification_never_rewrites() {
    for mode in ["mismatch", "read-error"] {
        let h = Harness::new(mode);
        let request = h.request(&[
            h.uploaded("a.pdf"),
            h.uploaded("b.pdf"),
            h.uploaded("c.pdf"),
        ]);
        assert_eq!(
            super::super::execute(&h.session, &request).unwrap().outcome,
            "unknown"
        );
        assert_eq!(h.fake.updates.load(Ordering::SeqCst), 1);
        h.fake.fail_read.store(false, Ordering::SeqCst);
        assert!(super::super::verify(&h.session, &request.request_id, None, None).is_err());
        assert_eq!(
            super::super::discover(&h.session, &h.target())
                .unwrap()
                .pending
                .unwrap()
                .request
                .fields,
            request.fields
        );
        assert_eq!(
            super::super::execute(&h.session, &request).unwrap().outcome,
            "unknown"
        );
        assert_eq!(h.fake.creates.load(Ordering::SeqCst), 1);
        assert_eq!(h.fake.updates.load(Ordering::SeqCst), 1);
    }
}

#[test]
fn attachment_readback_checks_name_size_type_and_multiplicity_instead_of_resigned_token() {
    let original = json!([{"name":"a.pdf","type":"application/pdf","size":"12","fileToken":"old"}]);
    let mut changed = original.clone();
    changed[0]["fileToken"] = json!("resigned");
    changed[0]["uid"] = json!("new-metadata");
    assert!(matches(&json!(original.to_string()), &changed));
    changed[0]["size"] = json!("13");
    assert!(!matches(&original, &changed));
    assert!(!matches(&original, &json!([])));
}
