//! 流程图文编辑使用稳定的账号、真实事项和字段身份保存图片草稿。
use super::*;
use crate::creation::{images, Target};
use sha2::{Digest, Sha256};
use base64::Engine;

#[derive(Serialize)]
pub struct Context {
    pub target: Target,
    pub context: String,
}

pub fn context(session: &Session, id: &WorkItemId) -> Result<Context, BackendError> {
    if !session.config.workflow_enabled || !id.missing_parts().is_empty() {
        return Err(BackendError::validation("当前事项的流程编辑不可用"));
    }
    let account = crate::creation::account(session)?;
    let context = format!("{:x}", Sha256::digest(serde_json::to_vec(&("workflow", account, id))?));
    Ok(Context { target:Target { source_id:"workflow".into(), project_key:id.project_key.clone().unwrap(), type_key:id.work_item_type_key.clone().unwrap() }, context })
}

pub fn upload(session: &Session, id: &WorkItemId, action_id: &str, field_key: &str, expected_context: &str, image_id: &str) -> Result<images::UploadedImage, BackendError> {
    let scope = context(session, id)?;
    if scope.context != expected_context { return Err(BackendError::validation("图片所属账号已变化，请重新打开表单")); }
    let options = fresh_actions(session, id)?;
    let field = options.actions.iter().find(|a| a.id == action_id && a.disabled_reason.is_none())
        .and_then(|a| a.fields.iter().find(|f| f.key == field_key && f.settings.read_only != Some(true)))
        .filter(|f| f.settings.editor.as_ref().is_some_and(|e| e.kind == "textarea"))
        .and_then(|f| f.settings.rich_text.as_ref()).and_then(|r| r.image_field_key.as_deref())
        .ok_or_else(|| BackendError::validation("当前字段的图片归属无法确认，请重新读取云端"))?;
    images::upload_existing(session, &scope.target, &scope.context, field, image_id, &id.work_item_id)
}

pub(super) fn image_matches(session: &Session, id: &WorkItemId, field: &WorkflowField, image: crate::creation::richtext::ImageChange<'_>) -> bool {
    let check = || -> Result<bool, BackendError> {
        let key = field.settings.rich_text.as_ref().and_then(|r| r.image_field_key.as_deref())
            .ok_or_else(|| BackendError::validation("无法确认图片所属字段"))?;
        let scope = context(session, id)?;
        let original = images::get_uploaded(session, &scope.target, &scope.context, key, image.original_url, image.original_token)?;
        let remote = crate::field_images::load(session, id, key, image.remote_url, true)?;
        let bytes = |url: &str| -> Result<Vec<u8>, BackendError> {
            base64::engine::general_purpose::STANDARD.decode(url.split_once(',').map(|(_, value)| value).unwrap_or(""))
                .map_err(|_| BackendError::validation("图片内容无法核对"))
        };
        Ok(Sha256::digest(bytes(&original.data_url)?) == Sha256::digest(bytes(&remote)?))
    };
    check().unwrap_or(false)
}
