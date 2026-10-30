use super::*;
use crate::{
    mcp::{ConnectionInfo, TodoSource, ToolResultPayload},
    store::{CachedType, TypePreference},
};
use async_trait::async_trait;
use serde_json::Map;
use std::{
    collections::BTreeMap,
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
};

const PNG: &[u8] = b"\x89PNG\r\n\x1a\nexample-image";
const REMOTE_URL: &str = "https://project.feishu.cn/goapi/v1/tos/file/example-image.png";
const FILE_TOKEN: &str = "fixture-file-token-only";
const SIGN: &str = "fixture-upload-sign-only";

struct Fake {
    reads: AtomicUsize,
    signatures: AtomicUsize,
    arguments: Mutex<Value>,
    textarea: AtomicBool,
    user: Mutex<String>,
    fail_authorization: AtomicBool,
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
        self.reads.fetch_add(1, Ordering::SeqCst);
        let value = match tool {
            "search_user_info" => {
                json!([{"user_key":*self.user.lock().unwrap(),"name_cn":"示例用户"}])
            }
            "get_workitem_field_meta" => json!({"FieldConfList":[
                {"field_key":"name","field_name":"标题","is_required":1},
                {"field_key":"description","field_name":"说明","is_required":1}
            ]}),
            "list_workitem_field_config" => json!({"list":[
                {"field_key":"name","field_name":"标题","field_type":"text"},
                {"field_key":"template","field_name":"模板","field_type":"_work_item_template","option":[{"option_id":1,"option_name":"默认模板"}]},
                {"field_key":"description","field_name":"说明","field_type":if self.textarea.load(Ordering::SeqCst){"multi-text"}else{"text"}}
            ],"pagination":{"has_more":false}}),
            "list_workitem_role_config" => json!({"list":[],"pagination":{"has_more":false}}),
            "upload_file" => {
                self.signatures.fetch_add(1, Ordering::SeqCst);
                *self.arguments.lock().unwrap() = json!(args);
                if self.fail_authorization.load(Ordering::SeqCst) {
                    return Ok(ToolResultPayload {
                        is_error: true,
                        structured: None,
                        text_blocks: vec![format!("server echoed {SIGN}")],
                    });
                }
                signature()
            }
            _ => panic!("unexpected tool {tool}"),
        };
        Ok(ToolResultPayload {
            is_error: false,
            structured: Some(value),
            text_blocks: vec![],
        })
    }
}

fn signature() -> Value {
    json!({"upload_url":format!("https://project.feishu.cn{UPLOAD_PATH}"),"is_multipart":false,
        "sign_expire_time":crate::sync::now_ms()+60_000,"sign":SIGN})
}

struct Harness {
    session: Session,
    fake: Arc<Fake>,
    _remote: crate::remote::TestRemote,
    dir: std::path::PathBuf,
}

impl Harness {
    fn new() -> Self {
        let dir = std::env::temp_dir().join(format!(
            "fstodo-create-image-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("token"), "image-test-token-only").unwrap();
        std::fs::write(dir.join("config.toml"), format!("token_env='FSTODO_ABSENT_IMAGE_TEST_TOKEN'\ntoken_file='{}'\n[[source]]\nid='source'\nkind='personal_todo'\nenabled=true\naction='todo'\n",dir.join("token").display().to_string().replace('\\',"/"))).unwrap();
        let session = Session::open(
            crate::Config::load(Some(&dir.join("config.toml")), Some(&dir.join("cache.db")))
                .unwrap(),
        )
        .unwrap();
        let fake = Arc::new(Fake {
            reads: AtomicUsize::new(0),
            signatures: AtomicUsize::new(0),
            arguments: Mutex::new(Value::Null),
            textarea: AtomicBool::new(true),
            user: Mutex::new("example-person".into()),
            fail_authorization: AtomicBool::new(false),
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
                    type_key: "issue".into(),
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
                    "issue".into(),
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
            source_id: self.session.config.sources[0].id.clone(),
            project_key: "space".into(),
            type_key: "issue".into(),
        }
    }
    fn context(&self) -> String {
        super::super::account(&self.session).unwrap()
    }
    fn save(&self, context: &str) -> SavedImage {
        save(
            &self.session,
            &self.target(),
            context,
            "description",
            &base64::engine::general_purpose::STANDARD.encode(PNG),
            "image/png",
            "截图.png",
        )
        .unwrap()
    }
}

impl Drop for Harness {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

#[test]
fn screenshots_are_local_persistent_and_shared_between_sources_but_not_scopes() {
    let h = Harness::new();
    let context = h.context();
    let reads = h.fake.reads.load(Ordering::SeqCst);
    let saved = h.save(&context);
    assert_eq!(
        saved.markdown_url,
        format!("fstodo-image:{}", saved.image_id)
    );
    let second = Session::open(h.session.config.clone()).unwrap();
    let mut target = h.target();
    target.source_id = "another-source".into();
    let preview = get(&second, &target, &context, "description", &saved.image_id).unwrap();
    assert_eq!(
        preview.data_url,
        format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(PNG)
        )
    );
    assert!(preview.uploaded_url.is_none());
    assert!(preview.uploaded_token.is_none());
    assert!(get(
        &second,
        &target,
        &"b".repeat(64),
        "description",
        &saved.image_id
    )
    .is_err());
    assert!(get(&second, &target, &context, "another-field", &saved.image_id).is_err());
    target.project_key = "another-space".into();
    assert!(get(&second, &target, &context, "description", &saved.image_id).is_err());
    target.project_key = "space".into();
    target.type_key = "story".into();
    assert!(get(&second, &target, &context, "description", &saved.image_id).is_err());
    assert_eq!(h.fake.reads.load(Ordering::SeqCst), reads);
    assert_eq!(h.fake.signatures.load(Ordering::SeqCst), 0);
}

#[test]
fn save_checks_content_mime_base64_and_size_before_caching() {
    let h = Harness::new();
    let target = h.target();
    let context = "a".repeat(64);
    for (bytes, mime) in [
        (b"<svg />".as_slice(), "image/svg+xml"),
        (PNG, "image/jpeg"),
        (&[], "image/png"),
    ] {
        assert!(save(
            &h.session,
            &target,
            &context,
            "description",
            &base64::engine::general_purpose::STANDARD.encode(bytes),
            mime,
            "image.png"
        )
        .is_err());
    }
    assert!(save(
        &h.session,
        &target,
        &context,
        "description",
        "invalid-base64",
        "image/png",
        "image.png"
    )
    .is_err());
    assert!(save(
        &h.session,
        &target,
        &context,
        "description",
        &"a".repeat(MAX_BYTES.div_ceil(3) * 4 + 1),
        "image/png",
        "image.png"
    )
    .is_err());
    let mut big = vec![0; MAX_BYTES + 1];
    big[..8].copy_from_slice(&PNG[..8]);
    assert!(save(
        &h.session,
        &target,
        &context,
        "description",
        &base64::engine::general_purpose::STANDARD.encode(big),
        "image/png",
        "image.png"
    )
    .is_err());
    for (bytes, mime) in [
        (b"\xff\xd8\xffexample-jpeg".as_slice(), "image/jpeg"),
        (b"RIFF1234WEBPexample-webp".as_slice(), "image/webp"),
    ] {
        let saved = save(
            &h.session,
            &target,
            &context,
            "description",
            &base64::engine::general_purpose::STANDARD.encode(bytes),
            mime,
            "",
        )
        .unwrap();
        assert!(get(
            &h.session,
            &target,
            &context,
            "description",
            &saved.image_id
        )
        .unwrap()
        .data_url
        .starts_with(&format!("data:{mime};base64,")));
    }
    assert_eq!(h.fake.reads.load(Ordering::SeqCst), 0);
}

#[test]
fn upload_checks_fresh_form_then_caches_url_and_token_without_reuploading() {
    let h = Harness::new();
    let context = h.context();
    let saved = h.save(&context);
    let target = h.target();
    let result = upload_with(
        &h.session,
        &target,
        &context,
        "description",
        &saved.image_id,
        |ticket, image| {
            assert_eq!(
                ticket.url.as_str(),
                "https://project.feishu.cn/goapi/v5/platform/file/stream/mcp/upload/16/0"
            );
            assert_eq!(ticket.sign.to_str().unwrap(), SIGN);
            assert!(ticket.sign.is_sensitive());
            assert_eq!(image.bytes, PNG);
            Ok(json!({"code":0,"data":{"file_url":REMOTE_URL,"file_token":FILE_TOKEN,"un_upload_index":[]}}))
        },
    )
    .unwrap();
    assert_eq!(result.url, REMOTE_URL);
    assert_eq!(result.file_token, FILE_TOKEN);
    let args = h.fake.arguments.lock().unwrap().clone();
    assert_eq!(
        args,
        json!({"project_key":"space","resource_type":16,"work_item_type":"issue","field_key":"description","file_name":"截图.png","mime_type":"image/png","size":PNG.len()})
    );
    assert!(args.get("work_item_id").is_none());
    h.save(&context); // 再次粘贴相同图片不会抹掉已经确认的链接。
    let preview = get(
        &h.session,
        &target,
        &context,
        "description",
        &saved.image_id,
    )
    .unwrap();
    assert_eq!(preview.uploaded_url.as_deref(), Some(REMOTE_URL));
    assert_eq!(preview.uploaded_token.as_deref(), Some(FILE_TOKEN));
    assert_eq!(
        upload_with(
            &h.session,
            &target,
            &context,
            "description",
            &saved.image_id,
            |_, _| panic!("must not upload again")
        )
        .unwrap()
        .url,
        REMOTE_URL
    );
    assert_eq!(h.fake.signatures.load(Ordering::SeqCst), 1);
}

#[test]
fn uploaded_markdown_preview_reopens_from_scoped_local_cache_without_network() {
    let h = Harness::new();
    let context = h.context();
    let saved = h.save(&context);
    let target = h.target();
    let uploaded = upload_with(
        &h.session,
        &target,
        &context,
        "description",
        &saved.image_id,
        |_, _| Ok(json!({"file_url":REMOTE_URL,"file_token":FILE_TOKEN})),
    )
    .unwrap();
    let reads = h.fake.reads.load(Ordering::SeqCst);
    let second = Session::open(h.session.config.clone()).unwrap();
    let mut other_source = target.clone();
    other_source.source_id = "another-source".into();
    let preview = get_uploaded(
        &second,
        &other_source,
        &context,
        "description",
        &uploaded.url,
        &uploaded.file_token,
    )
    .unwrap();
    assert!(preview.data_url.starts_with("data:image/png;base64,"));
    assert_eq!(preview.uploaded_url.as_deref(), Some(REMOTE_URL));
    assert_eq!(preview.uploaded_token.as_deref(), Some(FILE_TOKEN));
    let serialized = serde_json::to_string(&preview).unwrap();
    assert!(!serialized.contains(SIGN));
    assert!(get_uploaded(
        &second,
        &target,
        &"b".repeat(64),
        "description",
        REMOTE_URL,
        FILE_TOKEN
    )
    .is_err());
    assert!(get_uploaded(
        &second,
        &target,
        &context,
        "other-field",
        REMOTE_URL,
        FILE_TOKEN
    )
    .is_err());
    assert!(get_uploaded(
        &second,
        &target,
        &context,
        "description",
        REMOTE_URL,
        "other-token"
    )
    .is_err());
    assert!(get_uploaded(
        &second,
        &target,
        &context,
        "description",
        "https://example.test/other.png",
        FILE_TOKEN
    )
    .is_err());
    let mut other_scope = target.clone();
    other_scope.project_key = "other-space".into();
    assert!(get_uploaded(
        &second,
        &other_scope,
        &context,
        "description",
        REMOTE_URL,
        FILE_TOKEN
    )
    .is_err());
    other_scope.project_key = target.project_key.clone();
    other_scope.type_key = "other-type".into();
    assert!(get_uploaded(
        &second,
        &other_scope,
        &context,
        "description",
        REMOTE_URL,
        FILE_TOKEN
    )
    .is_err());
    assert_eq!(h.fake.reads.load(Ordering::SeqCst), reads);
    assert_eq!(h.fake.signatures.load(Ordering::SeqCst), 1);
}

#[test]
fn legacy_url_without_token_preserves_original_and_requires_new_explicit_upload() {
    let h = Harness::new();
    let context = h.context();
    let saved = h.save(&context);
    let target = h.target();
    rusqlite::Connection::open(&h.session.config.db_path)
        .unwrap()
        .execute(
            "UPDATE creation_image SET uploaded_url=?1,uploaded_token=NULL WHERE context=?2",
            rusqlite::params![REMOTE_URL, context],
        )
        .unwrap();
    let preview = get(
        &h.session,
        &target,
        &context,
        "description",
        &saved.image_id,
    )
    .unwrap();
    assert!(preview.data_url.starts_with("data:image/png;base64,"));
    assert!(preview.uploaded_url.is_none());
    assert!(preview.uploaded_token.is_none());
    assert!(get_uploaded(
        &h.session,
        &target,
        &context,
        "description",
        REMOTE_URL,
        FILE_TOKEN
    )
    .is_err());
    let uploaded = upload_with(
        &h.session,
        &target,
        &context,
        "description",
        &saved.image_id,
        |_, _| Ok(json!({"file_url":REMOTE_URL,"file_token":FILE_TOKEN})),
    )
    .unwrap();
    assert_eq!(uploaded.file_token, FILE_TOKEN);
    assert_eq!(h.fake.signatures.load(Ordering::SeqCst), 1);
}

#[test]
fn upload_refuses_disabled_creation_changed_account_or_non_markdown_field() {
    let h = Harness::new();
    let context = h.context();
    let saved = h.save(&context);
    let target = h.target();
    h.fake.textarea.store(false, Ordering::SeqCst);
    assert!(upload_with(
        &h.session,
        &target,
        &context,
        "description",
        &saved.image_id,
        |_, _| panic!("invalid field")
    )
    .is_err());
    h.fake.textarea.store(true, Ordering::SeqCst);
    *h.fake.user.lock().unwrap() = "another-person".into();
    assert!(upload_with(
        &h.session,
        &target,
        &context,
        "description",
        &saved.image_id,
        |_, _| panic!("wrong account")
    )
    .is_err());
    *h.fake.user.lock().unwrap() = "example-person".into();
    h.session
        .store
        .set_source_type_preferences(
            &target.source_id,
            &BTreeMap::from([(
                "issue".into(),
                TypePreference {
                    enabled: true,
                    alias: String::new(),
                    create_enabled: false,
                },
            )]),
        )
        .unwrap();
    assert!(upload_with(
        &h.session,
        &target,
        &context,
        "description",
        &saved.image_id,
        |_, _| panic!("creation disabled")
    )
    .is_err());
    assert!(get(
        &h.session,
        &target,
        &context,
        "description",
        &saved.image_id
    )
    .is_ok());
    assert_eq!(h.fake.signatures.load(Ordering::SeqCst), 0);
}

#[test]
fn unknown_upload_results_preserve_local_image_and_do_not_retry() {
    let h = Harness::new();
    let context = h.context();
    let saved = h.save(&context);
    let target = h.target();
    let posts = AtomicUsize::new(0);
    let error = upload_with(
        &h.session,
        &target,
        &context,
        "description",
        &saved.image_id,
        |_, _| {
            posts.fetch_add(1, Ordering::SeqCst);
            Ok(json!({"code":0,"data":{"file_url":REMOTE_URL,"file_token":FILE_TOKEN,"un_upload_index":[0]}}))
        },
    )
    .err()
    .unwrap();
    assert_eq!(error.kind(), ErrorKind::UnknownResult);
    assert!(get(
        &h.session,
        &target,
        &context,
        "description",
        &saved.image_id
    )
    .unwrap()
    .uploaded_url
    .is_none());
    assert_eq!(posts.load(Ordering::SeqCst), 1);
    assert_eq!(h.fake.signatures.load(Ordering::SeqCst), 1);
}

#[test]
fn concurrent_uploads_return_in_progress_then_reuse_confirmed_result() {
    let h = Harness::new();
    let context = h.context();
    let saved = h.save(&context);
    let target = h.target();
    let posts = AtomicUsize::new(0);
    let (started, wait_started) = std::sync::mpsc::channel();
    let (release, wait_release) = std::sync::mpsc::channel();
    let wait_release = Mutex::new(wait_release);
    std::thread::scope(|threads| {
        let first = threads.spawn(|| {
            upload_with(
                &h.session,
                &target,
                &context,
                "description",
                &saved.image_id,
                |_, _| {
                    posts.fetch_add(1, Ordering::SeqCst);
                    started.send(()).unwrap();
                    wait_release
                        .lock()
                        .unwrap()
                        .recv_timeout(Duration::from_secs(2))
                        .unwrap();
                    Ok(json!({"file_url":REMOTE_URL,"file_token":FILE_TOKEN}))
                },
            )
            .unwrap()
            .url
        });
        wait_started.recv_timeout(Duration::from_secs(2)).unwrap();
        let second = upload_with(
            &h.session,
            &target,
            &context,
            "description",
            &saved.image_id,
            |_, _| panic!("concurrent upload must not POST"),
        );
        assert!(second
            .err()
            .unwrap()
            .safe_message(None)
            .contains("正在上传"));
        release.send(()).unwrap();
        assert_eq!(first.join().unwrap(), REMOTE_URL);
    });
    assert_eq!(
        upload_with(
            &h.session,
            &target,
            &context,
            "description",
            &saved.image_id,
            |_, _| panic!("cached result must not POST")
        )
        .unwrap()
        .url,
        REMOTE_URL
    );
    assert_eq!(posts.load(Ordering::SeqCst), 1);
    assert_eq!(h.fake.signatures.load(Ordering::SeqCst), 1);
}

#[test]
fn uncertain_first_upload_never_triggers_queued_post_without_new_explicit_retry() {
    let h = Harness::new();
    let context = h.context();
    let saved = h.save(&context);
    let target = h.target();
    let posts = AtomicUsize::new(0);
    let (started, wait_started) = std::sync::mpsc::channel();
    let (release, wait_release) = std::sync::mpsc::channel();
    let wait_release = Mutex::new(wait_release);
    std::thread::scope(|threads| {
        let first = threads.spawn(|| {
            upload_with(
                &h.session,
                &target,
                &context,
                "description",
                &saved.image_id,
                |_, _| {
                    posts.fetch_add(1, Ordering::SeqCst);
                    started.send(()).unwrap();
                    wait_release
                        .lock()
                        .unwrap()
                        .recv_timeout(Duration::from_secs(2))
                        .unwrap();
                    Err(BackendError::unknown_result(
                        "fixture unknown upload result",
                    ))
                },
            )
        });
        wait_started.recv_timeout(Duration::from_secs(2)).unwrap();
        let second = upload_with(
            &h.session,
            &target,
            &context,
            "description",
            &saved.image_id,
            |_, _| panic!("queued request must not POST"),
        );
        assert!(second
            .err()
            .unwrap()
            .safe_message(None)
            .contains("正在上传"));
        release.send(()).unwrap();
        assert_eq!(
            first.join().unwrap().err().unwrap().kind(),
            ErrorKind::UnknownResult
        );
    });
    assert_eq!(posts.load(Ordering::SeqCst), 1);
    assert_eq!(h.fake.signatures.load(Ordering::SeqCst), 1);
    assert!(get(
        &h.session,
        &target,
        &context,
        "description",
        &saved.image_id
    )
    .unwrap()
    .uploaded_url
    .is_none());
    // 首次结果不明不会清除原图；后续一次新的明确调用才能再次上传。
    assert_eq!(
        upload_with(
            &h.session,
            &target,
            &context,
            "description",
            &saved.image_id,
            |_, _| {
                posts.fetch_add(1, Ordering::SeqCst);
                Ok(json!({"file_url":REMOTE_URL,"file_token":FILE_TOKEN}))
            }
        )
        .unwrap()
        .url,
        REMOTE_URL
    );
    assert_eq!(posts.load(Ordering::SeqCst), 2);
    assert_eq!(h.fake.signatures.load(Ordering::SeqCst), 2);
}

#[test]
fn signed_destination_and_expiration_are_strictly_validated() {
    let now = crate::sync::now_ms();
    assert!(ticket(&signature(), now).is_ok());
    let mut seconds = signature();
    seconds["sign_expire_time"] = json!(now / 1000 + 60);
    assert!(ticket(&seconds, now).is_ok());
    for (key, replacement) in [
        (
            "upload_url",
            json!(
                "http://project.feishu.cn/goapi/v5/platform/file/stream/mcp/upload/16/:part_number"
            ),
        ),
        (
            "upload_url",
            json!(format!(
                "https://project.feishu.cn.attacker.test{UPLOAD_PATH}"
            )),
        ),
        (
            "upload_url",
            json!(format!(
                "https://person:secret@project.feishu.cn{UPLOAD_PATH}"
            )),
        ),
        (
            "upload_url",
            json!(format!("https://project.feishu.cn:8443{UPLOAD_PATH}")),
        ),
        (
            "upload_url",
            json!(format!(
                "https://project.feishu.cn{UPLOAD_PATH}?sign=secret"
            )),
        ),
        (
            "upload_url",
            json!("https://project.feishu.cn/another-path"),
        ),
        ("is_multipart", json!(true)),
        ("sign_expire_time", json!(now - 1)),
        ("sign", json!("bad\r\nheader")),
    ] {
        let mut value = signature();
        value[key] = replacement;
        assert!(ticket(&value, now).is_err());
    }
}

#[test]
fn target_unit_is_optional_and_forwarded_with_sensitive_signature_only_to_upload_request() {
    let now = crate::sync::now_ms();
    let mut authorization = signature();
    authorization["target_unit_code"] = json!("fixture-target-unit");
    let prepared = ticket(&authorization, now).unwrap();
    let image = CreationImage {
        mime_type: "image/png".into(),
        file_name: "截图.png".into(),
        bytes: PNG.to_vec(),
        uploaded_url: None,
        uploaded_token: None,
    };
    let client = Client::builder().build().unwrap();
    let request = image_request(&client, &prepared, &image).build().unwrap();
    assert_eq!(request.method(), reqwest::Method::POST);
    assert_eq!(request.headers()["x-target-unit"], "fixture-target-unit");
    assert_eq!(request.headers()["X-Meego-File-Sign"], SIGN);
    assert!(request.headers()["X-Meego-File-Sign"].is_sensitive());
    assert!(!request
        .headers()
        .contains_key(reqwest::header::AUTHORIZATION));
    for value in [Value::Null, json!("")] {
        authorization["target_unit_code"] = value;
        let prepared = ticket(&authorization, now).unwrap();
        let request = image_request(&client, &prepared, &image).build().unwrap();
        assert!(!request.headers().contains_key("x-target-unit"));
    }
    for value in [json!(1), json!("bad\r\nheader")] {
        authorization["target_unit_code"] = value;
        assert!(ticket(&authorization, now).is_err());
    }
    assert!(ticket(&signature(), now).unwrap().target_unit.is_none());
}

#[test]
fn final_response_requires_confirmed_file_url_and_token_and_rejects_incomplete_uploads() {
    for value in [
        json!("success"),
        json!({"url":REMOTE_URL}),
        json!({"code":0,"data":{"url":REMOTE_URL,"token":FILE_TOKEN}}),
        json!({"code":0,"data":REMOTE_URL}),
        json!({"data":{"file_url":REMOTE_URL,"file_token":FILE_TOKEN}}),
        json!({"file_url":REMOTE_URL}),
        json!({"file_token":FILE_TOKEN}),
        json!({"file_url":REMOTE_URL,"file_token":""}),
        json!({"file_url":REMOTE_URL,"file_token":" "}),
        json!({"file_url":REMOTE_URL,"file_token":"token\r\nheader"}),
        json!({"file_url":REMOTE_URL,"file_token":"token-->"}),
        json!({"file_url":REMOTE_URL,"file_token":"token--suffix"}),
        json!({"file_url":REMOTE_URL,"file_token":42}),
        json!({"file_url":REMOTE_URL,"file_token":FILE_TOKEN,"code":403}),
        json!({"code":403,"data":{"file_url":REMOTE_URL,"file_token":FILE_TOKEN}}),
        json!({"code":0,"data":{"file_url":REMOTE_URL,"file_token":FILE_TOKEN,"code":403}}),
        json!({"file_url":REMOTE_URL,"file_token":FILE_TOKEN,"success":false}),
        json!({"file_url":REMOTE_URL,"file_token":FILE_TOKEN,"err":{"message":"denied"}}),
        json!({"file_url":"http://example.test/image.png","file_token":FILE_TOKEN}),
        json!({"file_url":format!("https://project.feishu.cn{UPLOAD_PATH}"),"file_token":FILE_TOKEN}),
        json!({"file_url":format!("{REMOTE_URL}?sign=secret"),"file_token":FILE_TOKEN}),
        json!({"file_url":REMOTE_URL,"file_token":FILE_TOKEN,"un_upload_index":[0]}),
        json!({"file_url":REMOTE_URL,"file_token":FILE_TOKEN,"un_upload_index":0}),
        json!({"code":0,"data":{"file_url":REMOTE_URL,"file_token":FILE_TOKEN,"un_upload_index":[1]}}),
    ] {
        let error = uploaded_image(&value).err().unwrap();
        assert_eq!(error.kind(), ErrorKind::UnknownResult);
        assert!(!error.safe_message(None).contains(FILE_TOKEN));
    }
    for value in [
        json!({"file_url":REMOTE_URL,"file_token":FILE_TOKEN}),
        json!({"file_url":REMOTE_URL,"file_token":FILE_TOKEN,"un_upload_index":[]}),
        json!({"code":0,"data":{"file_url":REMOTE_URL,"file_token":FILE_TOKEN,"un_upload_index":null}}),
    ] {
        let uploaded = uploaded_image(&value).unwrap();
        assert_eq!(uploaded.url, REMOTE_URL);
        assert_eq!(uploaded.file_token, FILE_TOKEN);
    }
    let normalized = uploaded_image(
        &json!({"file_url":"https://example.test/image(1).png","file_token":FILE_TOKEN}),
    )
    .unwrap();
    assert_eq!(normalized.url, "https://example.test/image%281%29.png");
}

#[test]
fn authorization_errors_are_not_retried_or_allowed_to_expose_signature() {
    let h = Harness::new();
    let context = h.context();
    let saved = h.save(&context);
    h.fake.fail_authorization.store(true, Ordering::SeqCst);
    let error = upload_with(
        &h.session,
        &h.target(),
        &context,
        "description",
        &saved.image_id,
        |_, _| panic!("no signed request"),
    )
    .err()
    .unwrap();
    assert!(!error.safe_message(None).contains(SIGN));
    assert_eq!(h.fake.signatures.load(Ordering::SeqCst), 1);
    assert!(h
        .session
        .call_read_tool("upload_file", json!({}).as_object().unwrap())
        .is_err());
    assert_eq!(h.fake.signatures.load(Ordering::SeqCst), 1);
}

#[test]
fn creation_never_sends_local_or_corrupt_image_references() {
    let h = Harness::new();
    let form = discover_fresh(&h.session, &h.target()).unwrap();
    for reference in [
        format!("fstodo-image:{}", "a".repeat(64)),
        "fstodo-image:invalid".into(),
    ] {
        let request = super::super::Request {
            target: h.target(),
            request_id: "request".into(),
            version: form.version.clone(),
            fields: BTreeMap::from([
                ("name".into(), json!("示例缺陷")),
                ("template".into(), json!("1")),
                ("description".into(), json!(format!("![截图]({reference})"))),
            ]),
        };
        assert!(super::super::plan(&form, &request).is_err());
    }
    assert_eq!(h.fake.signatures.load(Ordering::SeqCst), 0);
}
