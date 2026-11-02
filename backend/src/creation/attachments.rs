//! 附件先保存本机，确认后上传；多附件随创建写入首个，再逐个回读、追加、核验。
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use super::{images, Form, Request, Target};
use crate::{
    api::Session,
    error::BackendError,
    model::WorkItemId,
    store::{CreationImage, CreationImageKey},
};

pub const MAX_BYTES: usize = 8 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Attachment {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub size: usize,
    pub file_token: Option<String>,
}

fn identity(name: &str, mime: &str, bytes: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(name.as_bytes());
    digest.update([0]);
    digest.update(mime.as_bytes());
    digest.update([0]);
    digest.update(bytes);
    format!("{:x}", digest.finalize())
}

fn key<'a>(
    target: &'a Target,
    context: &'a str,
    field: &'a str,
    id: &'a str,
) -> CreationImageKey<'a> {
    CreationImageKey {
        context,
        project_key: &target.project_key,
        type_key: &target.type_key,
        field_key: field,
        image_id: id,
    }
}

fn stored(
    session: &Session,
    target: &Target,
    context: &str,
    field: &str,
    id: &str,
) -> Result<CreationImage, BackendError> {
    images::scope(target, context, field)?;
    if !images::hexadecimal_id(id) {
        return Err(BackendError::validation("附件引用无效，请重新选择文件"));
    }
    let file = session
        .store
        .creation_image(&key(target, context, field, id))?
        .ok_or_else(|| BackendError::validation("未找到本表单的本机附件，请重新选择文件"))?;
    if file.bytes.is_empty()
        || file.bytes.len() > MAX_BYTES
        || identity(&file.file_name, &file.mime_type, &file.bytes) != id
    {
        return Err(BackendError::validation(
            "本机附件缓存无法读取，请重新选择文件",
        ));
    }
    Ok(file)
}

fn metadata(id: &str, file: &CreationImage) -> Attachment {
    Attachment {
        id: id.into(),
        name: file.file_name.clone(),
        mime_type: file.mime_type.clone(),
        size: file.bytes.len(),
        file_token: file.uploaded_token.clone(),
    }
}

pub fn save(
    session: &Session,
    target: &Target,
    context: &str,
    field: &str,
    base64: &str,
    mime: &str,
    name: &str,
) -> Result<Attachment, BackendError> {
    images::scope(target, context, field)?;
    if name.trim().is_empty()
        || name.len() > 240
        || name
            .chars()
            .any(|c| c.is_control() || matches!(c, '/' | '\\'))
    {
        return Err(BackendError::validation("附件名称无效，请重新选择文件"));
    }
    let mime = if mime.is_empty() {
        "application/octet-stream"
    } else {
        mime
    };
    if mime.len() > 200
        || !mime.contains('/')
        || reqwest::header::HeaderValue::from_str(mime).is_err()
    {
        return Err(BackendError::validation("附件格式无效，请重新选择文件"));
    }
    if base64.len() > MAX_BYTES.div_ceil(3) * 4 {
        return Err(BackendError::validation("每个附件不能超过 8 MB"));
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64)
        .map_err(|_| BackendError::validation("未能读取附件，请重新选择文件"))?;
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err(BackendError::validation(
            "附件不能为空，且每个不能超过 8 MB",
        ));
    }
    let id = identity(name, mime, &bytes);
    let file = CreationImage {
        file_name: name.into(),
        mime_type: mime.into(),
        bytes,
        uploaded_url: None,
        uploaded_token: None,
    };
    session
        .store
        .save_creation_image(&key(target, context, field, &id), &file)?;
    // 同一文件再次选择时复用已保存的上传回执。
    get(session, target, context, field, &id)
}

pub fn get(
    session: &Session,
    target: &Target,
    context: &str,
    field: &str,
    id: &str,
) -> Result<Attachment, BackendError> {
    Ok(metadata(id, &stored(session, target, context, field, id)?))
}

pub fn upload(
    session: &Session,
    target: &Target,
    context: &str,
    field: &str,
    id: &str,
) -> Result<Attachment, BackendError> {
    upload_with(session, target, context, field, id, images::post_image)
}

fn upload_with(
    session: &Session,
    target: &Target,
    context: &str,
    field: &str,
    id: &str,
    post: impl FnOnce(&images::UploadTicket, &CreationImage) -> Result<Value, BackendError>,
) -> Result<Attachment, BackendError> {
    let lock = images::upload_lock(session, target, context, field, id)?;
    let _guard = lock
        .try_lock()
        .map_err(|_| BackendError::validation("此附件正在上传，请等待当前任务完成后再操作"))?;
    let file = stored(session, target, context, field, id)?;
    let form = super::discover_fresh(session, target)?;
    if form.context != context
        || !form
            .fields
            .iter()
            .any(|f| f.key == field && f.kind == "attachment")
    {
        return Err(BackendError::validation(
            "附件所属账号或字段已变化，请重新打开表单核对",
        ));
    }
    if file
        .uploaded_token
        .as_deref()
        .is_some_and(|token| file_token(token).is_ok())
    {
        return Ok(metadata(id, &file));
    }
    let authorization = session.call_tool_any(crate::mcp::feishu::TOOL_UPLOAD_FILE, json!({
        "project_key":target.project_key,"work_item_type":target.type_key,"field_key":field,
        "resource_type":15,"file_name":file.file_name,"mime_type":file.mime_type,"size":file.bytes.len()
    }).as_object().unwrap(), true).map_err(images::safe_authorization_failure)?;
    let ticket = images::ticket_for(&authorization, crate::sync::now_ms(), 15)?;
    let response = post(&ticket, &file)?;
    images::checked_upload_status(&response)?;
    let payload = if response.get("data").is_some() {
        if response["code"] != 0 {
            return Err(BackendError::unknown_result(
                "附件上传结果尚未确认，文件和草稿已保留",
            ));
        }
        &response["data"]
    } else {
        &response
    };
    images::checked_upload_status(payload)?;
    let token = file_token(payload["file_token"].as_str().unwrap_or_default())?;
    let url = match payload["file_url"].as_str().filter(|url| !url.is_empty()) {
        Some(url) => images::remote_url(url)?,
        None => String::new(),
    };
    session
        .store
        .mark_creation_image_uploaded(&key(target, context, field, id), &url, &token)?;
    get(session, target, context, field, id)
}

fn file_token(value: &str) -> Result<String, BackendError> {
    // 附件 token 作为 JSON 字符串原样传递，不套用正文 HTML 注释的字符限制。
    if value.is_empty() || value.len() > 8192 || value.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(BackendError::unknown_result("附件上传结果尚未确认，文件和草稿已保留"));
    }
    Ok(value.into())
}

fn files(value: &Value) -> Result<Vec<Attachment>, BackendError> {
    let files: Vec<Attachment> = serde_json::from_value(value.clone())
        .map_err(|_| BackendError::validation("附件列表无效，请重新选择文件"))?;
    let mut ids = std::collections::BTreeSet::new();
    if files.iter().any(|f| {
        f.name.trim().is_empty()
            || f.size == 0
            || f.size > MAX_BYTES
            || !images::hexadecimal_id(&f.id)
            || !ids.insert(&f.id)
            || f.file_token
                .as_deref()
                .is_none_or(|token| file_token(token).is_err())
    }) {
        return Err(BackendError::validation(
            "附件尚未上传或列表无效，请保留草稿后重试",
        ));
    }
    Ok(files)
}

pub(super) fn encode(value: &Value) -> Result<Value, BackendError> {
    let objects = files(value)?.iter().map(|file| json!({
        "name":file.name,"type":file.mime_type,"size":file.size.to_string(),"fileToken":file.file_token
    })).collect::<Vec<_>>();
    Ok(json!(serde_json::to_string(&objects)?))
}

pub(super) fn validate(
    session: &Session,
    form: &Form,
    request: &Request,
) -> Result<(), BackendError> {
    for field in form
        .fields
        .iter()
        .filter(|field| field.kind == "attachment")
    {
        let value = request.fields.get(&field.key).unwrap_or(&Value::Null);
        if super::empty(value) {
            continue;
        }
        for file in files(value)? {
            let actual = get(session, &form.target, &form.context, &field.key, &file.id)?;
            if serde_json::to_value(&file)? != serde_json::to_value(&actual)? {
                return Err(BackendError::validation(
                    "附件与本机上传记录不一致，请重新核对草稿",
                ));
            }
        }
    }
    Ok(())
}

fn remote_files(value: &Value) -> Result<Vec<Value>, BackendError> {
    let decoded = if let Some(value) = value.as_str() {
        serde_json::from_str(value)?
    } else {
        value.clone()
    };
    decoded
        .as_array()
        .cloned()
        .ok_or_else(|| BackendError::validation("尚未取得完整附件列表，请先核对飞书"))
}

fn signatures(files: &[Value]) -> Vec<(String, String, String)> {
    let mut values = files
        .iter()
        .map(|file| {
            (
                super::text(&file["name"]),
                super::text(&file["type"]),
                super::text(&file["size"]),
            )
        })
        .collect::<Vec<_>>();
    values.sort();
    values
}

pub(super) fn matches(submitted: &Value, remote: &Value) -> bool {
    match (remote_files(submitted), remote_files(remote)) {
        (Ok(submitted), Ok(remote)) => signatures(&submitted) == signatures(&remote),
        _ => false,
    }
}

/// 创建请求中的每个附件字段先只写首个，避免多个简化对象触发飞书 unique 校验。
pub(super) fn first_request(form: &Form, request: &Request) -> Request {
    let mut first = request.clone();
    for field in form
        .fields
        .iter()
        .filter(|field| field.kind == "attachment")
    {
        if let Some(list) = first
            .fields
            .get_mut(&field.key)
            .and_then(Value::as_array_mut)
        {
            list.truncate(1);
        }
    }
    first
}

pub(super) fn complete(
    session: &Session,
    form: &Form,
    request: &Request,
    id: &WorkItemId,
) -> Result<(), BackendError> {
    let _access =
        crate::remote::runtime()?.block_on(crate::item_access::lock_workflow(&session.store, id));
    let mut current = first_request(form, request);
    let detail = session.refresh_item_detail_fresh(id)?;
    super::matches_fields(form, &current, &detail)?;
    for field in form
        .fields
        .iter()
        .filter(|field| field.kind == "attachment")
    {
        let Some(list) = request.fields.get(&field.key).and_then(Value::as_array) else {
            continue;
        };
        for next in list.iter().skip(1) {
            // 每次覆盖前重新读取；原样保留 uid/url/未知字段，远端有并发变化则停止。
            let before = session.refresh_item_detail_fresh(id)?;
            super::matches_fields(form, &current, &before)?;
            let mut remote = remote_files(&super::remote_value(&before.data, &field.key))?;
            let appended = remote_files(&encode(&json!([next]))?)?;
            remote.extend(appended);
            let args = json!({"project_key":form.target.project_key,"work_item_id":id.work_item_id,
                "fields":[{"field_key":field.key,"field_value":serde_json::to_string(&remote)?}]});
            let receipt = session.call_tool_any(
                crate::mcp::feishu::TOOL_UPDATE_FIELD,
                args.as_object().unwrap(),
                true,
            );
            current
                .fields
                .get_mut(&field.key)
                .unwrap()
                .as_array_mut()
                .unwrap()
                .push(next.clone());
            // 不论写回执是否可解析，最终只看同字段远端回读；失败不重发写入。
            let checked = session
                .refresh_item_detail_fresh(id)
                .and_then(|detail| super::matches_fields(form, &current, &detail));
            if let Err(error) = checked {
                return Err(receipt.err().unwrap_or(error));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "attachments_tests.rs"]
mod tests;
