//! 创建表单截图：先写本机草稿缓存，再由用户显式上传。
//! 上传签名只在后端内存中使用，不进入 SQLite、日志或 IPC。
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, OnceLock, TryLockError, Weak},
    time::Duration,
};

use base64::Engine;
use reqwest::{header::HeaderValue, Client, Url};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use super::{discover_fresh, Target};
use crate::{
    api::Session,
    error::{BackendError, ErrorKind},
    mcp::feishu::TOOL_UPLOAD_FILE,
    store::{CreationImage, CreationImageKey, UploadedCreationImageKey},
};

const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_RESPONSE_BYTES: usize = 64 * 1024;
const UPLOAD_PATH: &str = "/goapi/v5/platform/file/stream/mcp/upload/16/:part_number";
type UploadLocks = Mutex<HashMap<String, Weak<Mutex<()>>>>;
static UPLOAD_LOCKS: OnceLock<UploadLocks> = OnceLock::new();

#[derive(Serialize)]
pub struct SavedImage {
    pub image_id: String,
    pub markdown_url: String,
}
#[derive(Serialize)]
pub struct ImagePreview {
    pub data_url: String,
    pub uploaded_url: Option<String>,
    pub uploaded_token: Option<String>,
}
#[derive(Serialize)]
pub struct UploadedImage {
    pub url: String,
    pub file_token: String,
}

pub(super) fn hexadecimal_id(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

pub(super) fn scope(target: &Target, context: &str, field_key: &str) -> Result<(), BackendError> {
    if !hexadecimal_id(context)
        || [
            target.source_id.as_str(),
            target.project_key.as_str(),
            target.type_key.as_str(),
            field_key,
        ]
        .iter()
        .any(|v| v.trim().is_empty() || v.len() > 512 || v.chars().any(char::is_control))
    {
        return Err(BackendError::validation(
            "文件所属表单已变化，请重新打开新建表单",
        ));
    }
    Ok(())
}

fn key<'a>(
    target: &'a Target,
    context: &'a str,
    field_key: &'a str,
    image_id: &'a str,
) -> CreationImageKey<'a> {
    CreationImageKey {
        context,
        project_key: &target.project_key,
        type_key: &target.type_key,
        field_key,
        image_id,
    }
}

fn image_mime(bytes: &[u8]) -> Result<&'static str, BackendError> {
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err(BackendError::validation(
            "截图不能为空，且每张不能超过 8 MB",
        ));
    }
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Ok("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Ok("image/jpeg")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Ok("image/webp")
    } else {
        Err(BackendError::validation(
            "截图仅支持 PNG、JPEG 和 WebP 图片",
        ))
    }
}

fn image_id(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn file_name(value: &str, mime: &str) -> Result<String, BackendError> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(format!(
            "截图.{}",
            match mime {
                "image/jpeg" => "jpg",
                "image/webp" => "webp",
                _ => "png",
            }
        ));
    }
    if value.len() > 240
        || value
            .chars()
            .any(|c| c.is_control() || matches!(c, '/' | '\\'))
    {
        return Err(BackendError::validation("图片名称无效，请重新复制截图"));
    }
    Ok(value.into())
}

fn stored_image(
    session: &Session,
    identity: &CreationImageKey<'_>,
) -> Result<CreationImage, BackendError> {
    if !hexadecimal_id(identity.image_id) {
        return Err(BackendError::validation("本机图片引用无效，请重新粘贴截图"));
    }
    let image = session
        .store
        .creation_image(identity)?
        .ok_or_else(|| BackendError::validation("未找到本表单的本机图片，请重新粘贴截图"))?;
    checked_image(image, identity.image_id)
}

fn checked_image(image: CreationImage, identity: &str) -> Result<CreationImage, BackendError> {
    if image_mime(&image.bytes)? != image.mime_type || image_id(&image.bytes) != identity {
        return Err(BackendError::validation(
            "本机图片缓存无法读取，请保留文字后重新粘贴截图",
        ));
    }
    Ok(image)
}

/// 只保存本机数据，断网或来源停用时也不会丢失正在编辑的草稿。
pub fn save(
    session: &Session,
    target: &Target,
    context: &str,
    field_key: &str,
    bytes_base64: &str,
    mime_type: &str,
    name: &str,
) -> Result<SavedImage, BackendError> {
    scope(target, context, field_key)?;
    if bytes_base64.len() > MAX_BYTES.div_ceil(3) * 4 {
        return Err(BackendError::validation(
            "图片不能超过 8 MB，请缩小截图后重试",
        ));
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(bytes_base64)
        .map_err(|_| BackendError::validation("未能读取剪贴板图片，请重新复制截图"))?;
    let actual_mime = image_mime(&bytes)?;
    if actual_mime != mime_type {
        return Err(BackendError::validation(
            "图片格式与内容不一致，请重新复制截图",
        ));
    }
    let image_id = image_id(&bytes);
    let image = CreationImage {
        bytes,
        mime_type: actual_mime.into(),
        file_name: file_name(name, actual_mime)?,
        uploaded_url: None,
        uploaded_token: None,
    };
    session
        .store
        .save_creation_image(&key(target, context, field_key, &image_id), &image)?;
    Ok(SavedImage {
        markdown_url: format!("fstodo-image:{image_id}"),
        image_id,
    })
}

pub fn get(
    session: &Session,
    target: &Target,
    context: &str,
    field_key: &str,
    image_id: &str,
) -> Result<ImagePreview, BackendError> {
    scope(target, context, field_key)?;
    let image = stored_image(session, &key(target, context, field_key, image_id))?;
    Ok(preview(image))
}

fn preview(image: CreationImage) -> ImagePreview {
    let uploaded = stored_upload(&image);
    ImagePreview {
        data_url: format!(
            "data:{};base64,{}",
            image.mime_type,
            base64::engine::general_purpose::STANDARD.encode(&image.bytes)
        ),
        uploaded_url: uploaded.as_ref().map(|value| value.url.clone()),
        uploaded_token: uploaded.map(|value| value.file_token),
    }
}

/// Markdown 已替换为远端引用后，仍从本机原图恢复预览，不发起下载或 MCP 读取。
pub fn get_uploaded(
    session: &Session,
    target: &Target,
    context: &str,
    field_key: &str,
    url: &str,
    token: &str,
) -> Result<ImagePreview, BackendError> {
    scope(target, context, field_key)?;
    let invalid = || BackendError::validation("图片链接或标识无效，请重新打开表单后重试");
    let url = remote_url(url).map_err(|_| invalid())?;
    let token = file_token(token).map_err(|_| invalid())?;
    let (identity, image) = session
        .store
        .uploaded_creation_image(&UploadedCreationImageKey {
            context,
            project_key: &target.project_key,
            type_key: &target.type_key,
            field_key,
            url: &url,
            file_token: &token,
        })?
        .ok_or_else(|| BackendError::validation("未找到本表单的已上传图片预览，原有链接已保留"))?;
    Ok(preview(checked_image(image, &identity)?))
}

pub(super) fn upload_lock(
    session: &Session,
    target: &Target,
    context: &str,
    field_key: &str,
    image_id: &str,
) -> Result<Arc<Mutex<()>>, BackendError> {
    let identity = super::digest(&(
        &session.config.db_path,
        context,
        &target.project_key,
        &target.type_key,
        field_key,
        image_id,
    ));
    let mut locks = UPLOAD_LOCKS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| BackendError::validation("图片上传任务暂不可用，请重新打开软件后重试"))?;
    locks.retain(|_, lock| lock.strong_count() > 0);
    if let Some(lock) = locks.get(&identity).and_then(Weak::upgrade) {
        return Ok(lock);
    }
    let lock = Arc::new(Mutex::new(()));
    locks.insert(identity, Arc::downgrade(&lock));
    Ok(lock)
}

// 不实现 Debug/Serialize，避免签名随诊断或 IPC 被带出后端。
pub(super) struct UploadTicket {
    url: Url,
    sign: HeaderValue,
    target_unit: Option<HeaderValue>,
}

fn ticket(value: &Value, now_ms: i64) -> Result<UploadTicket, BackendError> {
    ticket_for(value, now_ms, 16)
}

pub(super) fn ticket_for(value: &Value, now_ms: i64, resource_type: u8) -> Result<UploadTicket, BackendError> {
    let upload_path = match resource_type {
        15 => "/goapi/v5/platform/file/stream/mcp/upload/15/:part_number",
        16 => UPLOAD_PATH,
        _ => return Err(BackendError::validation("上传资源类型无效")),
    };
    let failure = || BackendError::validation("文件上传授权不完整，请稍后重试");
    if value["is_multipart"] == true {
        return Err(BackendError::validation("暂不支持分片文件上传，请缩小文件后重试"));
    }
    if value["is_multipart"] != false {
        return Err(failure());
    }
    let mut url = value["upload_url"]
        .as_str()
        .and_then(|v| Url::parse(v).ok())
        .ok_or_else(failure)?;
    if url.scheme() != "https"
        || url.host_str() != Some("project.feishu.cn")
        || url.port_or_known_default() != Some(443)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != upload_path
    {
        return Err(BackendError::validation("文件上传地址不合法，请稍后重试"));
    }
    // 每个文件上传前即时获取授权；0、缺失和 null 均未声明截止时间。
    // 有明确截止时间时，仍校验 Unix 秒 / 毫秒，绝不复用或持久化票据。
    match value.get("sign_expire_time") {
        None | Some(Value::Null) => {}
        Some(value) => {
            let expire = value.as_i64().filter(|v| *v >= 0).ok_or_else(|| {
                BackendError::validation("文件上传授权有效期无效，请稍后重试")
            })?;
            if expire > 0 {
                let expire_ms = if expire < 1_000_000_000_000 {
                    expire.checked_mul(1000).ok_or_else(failure)?
                } else {
                    expire
                };
                if expire_ms <= now_ms {
                    return Err(BackendError::validation("文件上传授权已过期，请重试上传"));
                }
            }
        }
    }
    let raw_sign = value["sign"]
        .as_str()
        .filter(|v| !v.is_empty() && v.len() <= 8192)
        .ok_or_else(failure)?;
    let mut sign = HeaderValue::from_str(raw_sign).map_err(|_| failure())?;
    sign.set_sensitive(true);
    let target_unit = match value.get("target_unit_code") {
        None | Some(Value::Null) => None,
        Some(Value::String(unit)) if unit.is_empty() => None,
        Some(Value::String(unit)) => Some(HeaderValue::from_str(unit).map_err(|_| failure())?),
        _ => return Err(failure()),
    };
    url.set_path(&upload_path.replace(":part_number", "0"));
    Ok(UploadTicket {
        url,
        sign,
        target_unit,
    })
}

pub(super) fn remote_url(value: &str) -> Result<String, BackendError> {
    let failure = || {
        BackendError::unknown_result(
            "文件上传结果尚未确认，本机文件和草稿已保留，请稍后核对或重新上传",
        )
    };
    let url = Url::parse(value).map_err(|_| failure())?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url
            .path()
            .starts_with("/goapi/v5/platform/file/stream/mcp/upload/")
        || url
            .query_pairs()
            .any(|(key, _)| matches!(key.as_ref(), "sign" | "upload_sign" | "X-Meego-File-Sign"))
    {
        return Err(failure());
    }
    Ok(url.to_string().replace('(', "%28").replace(')', "%29"))
}

pub(super) fn file_token(value: &str) -> Result<String, BackendError> {
    let failure = || {
        BackendError::unknown_result(
            "文件上传结果尚未确认，本机文件和草稿已保留，请稍后核对或重新上传",
        )
    };
    if value.is_empty()
        || value.len() > 8192
        || value.contains("--")
        || value
            .chars()
            .any(|c| c.is_whitespace() || c.is_control() || matches!(c, '<' | '>'))
    {
        return Err(failure());
    }
    Ok(value.into())
}

pub(super) fn checked_upload_status(value: &Value) -> Result<(), BackendError> {
    let failure = || {
        BackendError::unknown_result(
            "文件上传结果尚未确认，本机文件和草稿已保留，请稍后核对或重新上传",
        )
    };
    if !value.is_object() {
        return Err(failure());
    }
    for key in ["code", "err_code", "error_code"] {
        if let Some(code) = value.get(key) {
            if code.as_i64() != Some(0) {
                return Err(failure());
            }
        }
    }
    if value.get("success").is_some_and(|v| v != true)
        || ["error", "err"].iter().any(|key| {
            value.get(*key).is_some_and(|v| {
                !v.is_null() && v != "" && !v.as_object().is_some_and(|v| v.is_empty())
            })
        })
        || ["err_msg", "error_message"]
            .iter()
            .any(|key| value.get(*key).is_some_and(|v| !v.is_null() && v != ""))
    {
        return Err(failure());
    }
    if value.get("un_upload_index").is_some_and(|value| {
        !value.is_null() && !value.as_array().is_some_and(|indexes| indexes.is_empty())
    }) {
        return Err(failure());
    }
    Ok(())
}

fn uploaded_image(value: &Value) -> Result<UploadedImage, BackendError> {
    let failure = || {
        BackendError::unknown_result(
            "图片上传结果尚未确认，本机图片和草稿已保留，请稍后核对或重新上传",
        )
    };
    checked_upload_status(value)?;
    let payload = if let Some(data) = value.get("data") {
        if value.get("code").and_then(Value::as_i64) != Some(0) {
            return Err(failure());
        }
        checked_upload_status(data)?;
        data
    } else {
        value
    };
    Ok(UploadedImage {
        url: payload["file_url"]
            .as_str()
            .ok_or_else(failure)
            .and_then(remote_url)?,
        file_token: payload["file_token"]
            .as_str()
            .ok_or_else(failure)
            .and_then(file_token)?,
    })
}

fn stored_upload(image: &CreationImage) -> Option<UploadedImage> {
    // 旧缓存只有 URL 时仍保留原图，但不能把不完整回执当作上传成功。
    Some(UploadedImage {
        url: remote_url(image.uploaded_url.as_deref()?).ok()?,
        file_token: file_token(image.uploaded_token.as_deref()?).ok()?,
    })
}

pub(super) fn safe_authorization_failure(error: BackendError) -> BackendError {
    // 签名接口错误可能回显参数或响应，丢弃原文，保留可操作的错误类别。
    match error.kind() {
        ErrorKind::Auth => BackendError::Auth {
            endpoint: "飞书项目".into(),
            challenge: None,
            detail: "请检查当前连接凭证后重试文件上传".into(),
        },
        ErrorKind::Credential => BackendError::credential("请检查当前连接凭证后重试文件上传"),
        ErrorKind::Permission => {
            BackendError::permission("当前账号暂不能上传文件，请检查飞书项目权限")
        }
        ErrorKind::Connection => BackendError::Connection {
            endpoint: "飞书项目".into(),
            detail: "暂时无法获取文件上传授权，请稍后重试".into(),
        },
        _ => BackendError::validation(
            "未取得文件上传授权，请检查连接和权限后重试；本机文件和草稿已保留",
        ),
    }
}

fn image_request(
    client: &Client,
    ticket: &UploadTicket,
    image: &CreationImage,
) -> reqwest::RequestBuilder {
    let mut request = client
        .post(ticket.url.clone())
        .header("X-Meego-File-Sign", ticket.sign.clone())
        .header(reqwest::header::CONTENT_TYPE, &image.mime_type)
        .body(image.bytes.clone());
    if let Some(unit) = &ticket.target_unit {
        request = request.header("x-target-unit", unit.clone());
    }
    request
}

pub(super) fn post_image(ticket: &UploadTicket, image: &CreationImage) -> Result<Value, BackendError> {
    let unknown = || {
        BackendError::unknown_result(
            "文件上传结果尚未确认，本机文件和草稿已保留，请稍后核对或重新上传",
        )
    };
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|_| unknown())?;
    // 独立 HTTP client 不携带 MCP token；只向经过白名单校验的签名地址发送一次二进制。
    crate::remote::runtime()?.block_on(async {
        let mut response = image_request(&client, ticket, image)
            .send()
            .await
            .map_err(|_| unknown())?;
        if !response.status().is_success() {
            return Err(unknown());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| unknown())? {
            if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
                return Err(unknown());
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(|_| unknown())
    })
}

pub fn upload(
    session: &Session,
    target: &Target,
    context: &str,
    field_key: &str,
    image_id: &str,
) -> Result<UploadedImage, BackendError> {
    upload_with(session, target, context, field_key, image_id, post_image)
}

fn upload_with(
    session: &Session,
    target: &Target,
    context: &str,
    field_key: &str,
    image_id: &str,
    post: impl FnOnce(&UploadTicket, &CreationImage) -> Result<Value, BackendError>,
) -> Result<UploadedImage, BackendError> {
    scope(target, context, field_key)?;
    let lock = upload_lock(session, target, context, field_key, image_id)?;
    let _guard = lock.try_lock().map_err(|failure| match failure {
        TryLockError::WouldBlock => {
            BackendError::validation("这张图片正在上传，请等待当前上传完成后再操作")
        }
        TryLockError::Poisoned(_) => {
            BackendError::validation("图片上传任务暂不可用，请重新打开软件后重试")
        }
    })?;
    let identity = key(target, context, field_key, image_id);
    let image = stored_image(session, &identity)?;
    // 绕过待核验创建记录恢复分支，重新读取当前账号、字段和本机创建开关。
    let form = discover_fresh(session, target)?;
    if form.context != context
        || !form
            .fields
            .iter()
            .any(|f| f.key == field_key && f.kind == "textarea")
    {
        return Err(BackendError::validation(
            "图片所属账号或字段已变化，请重新打开表单后核对",
        ));
    }
    if let Some(uploaded) = stored_upload(&image) {
        return Ok(uploaded);
    }
    let authorization = session.call_tool_any(TOOL_UPLOAD_FILE, json!({
        "project_key":target.project_key, "resource_type":16, "work_item_type":target.type_key,
        "field_key":field_key, "file_name":image.file_name, "mime_type":image.mime_type, "size":image.bytes.len()
    }).as_object().unwrap(), true).map_err(safe_authorization_failure)?;
    let ticket = ticket(&authorization, crate::sync::now_ms())?;
    let uploaded = uploaded_image(&post(&ticket, &image)?)?;
    session
        .store
        .mark_creation_image_uploaded(&identity, &uploaded.url, &uploaded.file_token)?;
    Ok(uploaded)
}

#[cfg(test)]
#[path = "images_tests.rs"]
mod tests;
