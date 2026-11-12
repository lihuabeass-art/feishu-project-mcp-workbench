#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod external_links;
mod desktop_workspaces;
mod display_mode;
mod update_download;
mod update_check;
mod update_proxy;
#[cfg(windows)]
mod update_cleanup;
#[cfg(test)]
mod sync_permissions_tests;

use fstodo_backend::api::Session;
use fstodo_backend::config::{Config, ConnectionSettings};
use fstodo_backend::error::BackendError;
use fstodo_backend::mcp::ConnectionInfo;
use fstodo_backend::model::domain::WorkItemId;
use fstodo_backend::store::{CachedItem, CachedType, ItemFilter, RunTrigger, SyncRun, TypeScope};
use fstodo_backend::workflow::{self, WorkflowOptions, WorkflowRequest, WorkflowResult};
use serde::Serialize;
use tauri::{Manager, Emitter};

// 排期基线与不确定写保护只存本进程；锁同时阻止重新读取覆盖在途写入。
static SCHEDULE_SESSION: std::sync::Mutex<Option<fstodo_backend::schedule::ScheduleSession>> = std::sync::Mutex::new(None);

fn lock_schedule<T>(mutex: &std::sync::Mutex<Option<T>>) -> Result<std::sync::MutexGuard<'_, Option<T>>, BackendError> {
    match mutex.try_lock() {
        Ok(guard) => Ok(guard),
        Err(std::sync::TryLockError::WouldBlock) => Err(BackendError::conflict("排期正在同步或读取，请稍候")),
        Err(std::sync::TryLockError::Poisoned(_)) => Err(BackendError::conflict("上次排期任务中断，结果可能不确定，请先在飞书核对并结束当前会话")),
    }
}

fn close_schedule<T>(mutex: &std::sync::Mutex<Option<T>>, matches: impl FnOnce(&T) -> bool) -> Result<(), BackendError> {
    let mut guard = match mutex.try_lock() {
        Ok(guard) => guard,
        Err(std::sync::TryLockError::WouldBlock) => return Err(BackendError::conflict("排期正在同步，请等待本次结果")),
        Err(std::sync::TryLockError::Poisoned(error)) => error.into_inner(),
    };
    if guard.as_ref().is_some_and(|s| !matches(s)) {
        return Err(BackendError::conflict("排期会话已变化，请重新读取"));
    }
    *guard = None;
    mutex.clear_poison();
    Ok(())
}

#[tauri::command]
async fn load_schedule_session() -> Result<fstodo_backend::schedule::LoadResult, UiError> {
    blocking(|| {
        let mut guard = lock_schedule(&SCHEDULE_SESSION)?;
        if guard.is_some() { return Err(BackendError::conflict("请先结束当前排期会话，再重新读取")); }
        let session = open_session()?;
        let schedule = fstodo_backend::schedule::ScheduleSession::load(&session)?;
        let view = schedule.view.clone();
        *guard = Some(schedule);
        Ok(view)
    }).await
}

#[tauri::command]
async fn sync_schedule_session(session_id: String, changes: Vec<fstodo_backend::schedule::Change>) -> Result<fstodo_backend::schedule::SyncResult, UiError> {
    blocking_schedule_sync(move || {
        let mut guard = lock_schedule(&SCHEDULE_SESSION)?;
        let schedule = guard.as_mut().ok_or_else(|| BackendError::conflict("排期会话已结束，请重新读取"))?;
        schedule.sync(&open_session()?, &session_id, changes)
    }).await
}

#[tauri::command]
async fn close_schedule_session(session_id: String) -> Result<(), UiError> {
    blocking(move || {
        close_schedule(&SCHEDULE_SESSION, |s| s.view.session_id == session_id)
    }).await
}

#[derive(Serialize)]
struct UiError {
    kind: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    schedule_not_sent: Option<bool>,
}

impl From<BackendError> for UiError {
    fn from(error: BackendError) -> Self {
        // 即便上游把令牌回显进错误，IPC 也不暴露凭证值。
        let secret = open_session()
            .ok()
            .and_then(|session| session.credential().ok());
        Self {
            kind: error.kind().as_str().to_string(),
            message: error.safe_message(secret.as_ref().map(|c| c.token().expose())),
            schedule_not_sent: None,
        }
    }
}

#[derive(Serialize)]
struct SourceView {
    id: String,
    builtin_key: Option<String>,
    display_name: Option<String>,
    kind: String,
    enabled: bool,
    executable: bool,
    reason: Option<String>,
    action: Option<String>,
    todo_scope: Option<String>,
    asset_key: Option<String>,
    type_scope: SourceTypeScopeView,
    project_key: Option<String>,
    work_item_type_key: Option<String>,
    view_id: Option<String>,
    association_rule: Option<String>,
}

#[derive(Serialize)]
struct SourceTypeView {
    project_key: String,
    project_name: String,
    type_key: String,
    type_name: String,
    selected: bool,
}

#[derive(Serialize)]
struct SourceTypeScopeView {
    configured: bool,
    selected_count: usize,
    types: Vec<SourceTypeView>,
}

fn type_scope_view(types: Vec<CachedType>, scope: Option<TypeScope>) -> SourceTypeScopeView {
    SourceTypeScopeView {
        configured: scope.is_some(),
        selected_count: scope.as_ref().map_or(0, TypeScope::len),
        types: types
            .into_iter()
            .map(|t| SourceTypeView {
                selected: scope
                    .as_ref()
                    .is_none_or(|s| s.allows(&t.project_key, &t.type_key)),
                project_key: t.project_key,
                project_name: t.project_name,
                type_key: t.type_key,
                type_name: t.type_name,
            })
            .collect(),
    }
}

#[derive(Serialize)]
struct TypeDiscoveryView {
    discovered_count: usize,
    failed: Vec<(String, String)>,
    failure_kinds: Vec<String>,
    type_scope: SourceTypeScopeView,
}

fn ensure_source_enabled(session: &Session, source_id: &str) -> Result<(), BackendError> {
    if session
        .config
        .sources
        .iter()
        .any(|s| s.id == source_id && s.enabled)
    {
        Ok(())
    } else {
        Err(BackendError::config(
            "所选来源已停用或不存在，请在工作来源中选择其他来源",
        ))
    }
}

#[derive(Serialize)]
struct Capabilities {
    /// 流程动作可用（= `config.workflow_enabled`）。关闭时界面只显示接入状态。
    workflow: bool,
    source_queries: bool,
    details: bool,
    type_order: bool,
    source_type_preferences: bool,
    incremental_sync: bool,
    progressive_sync: bool,
    workspace_catalog: bool,
    creation: bool,
    filter_schemes: bool,
    detail_display: bool,
}

#[derive(Serialize)]
struct Snapshot {
    /// 后端能力位。缺字段 = 旧后端，界面据此保持只读，不发不存在的 IPC。
    capabilities: Capabilities,
    items: Vec<CachedItem>,
    total: i64,
    last_success: Option<SyncRun>,
    runs: Vec<SyncRun>,
    sources: Vec<SourceView>,
    type_order: Vec<String>,
    source_type_preferences: Option<fstodo_backend::store::SourceTypePreferences>,
    workspace_catalog: Vec<fstodo_backend::catalog::SpaceCatalog>,
    config_path: String,
    db_path: String,
    credential_ready: bool,
    credential_description: String,
    settings: ConnectionSettings,
}

fn open_session() -> Result<Session, BackendError> {
    Session::open(Config::load(None, None)?.for_desktop())
}

// Session 内部会创建 tokio runtime，必须在阻塞线程调用，避免嵌套运行时及阻塞 UI。
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, BackendError> + Send + 'static,
) -> Result<T, UiError> {
    tauri::async_runtime::spawn_blocking(move || work().map_err(UiError::from))
        .await
        .map_err(|_| UiError {
            kind: "internal".into(),
            message: "本地任务中断，请重试".into(),
            schedule_not_sent: None,
        })?
}

// sync 的 Err 只会在发出任何写请求前返回；在途结果由 SyncResult 表达。
// 任务崩溃可能发生在发送后，因此不能给 JoinError 添加未发送标记。
async fn blocking_schedule_sync<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, BackendError> + Send + 'static,
) -> Result<T, UiError> {
    tauri::async_runtime::spawn_blocking(move || work().map_err(|error| {
        let mut error = UiError::from(error);
        error.schedule_not_sent = Some(true);
        error
    }))
    .await
    .map_err(|_| UiError { kind: "internal".into(), message: "本地任务中断，请先在飞书核对".into(), schedule_not_sent: None })?
}

#[tauri::command]
async fn load_snapshot() -> Result<Snapshot, UiError> {
    blocking(|| {
        let session = open_session()?;
        let credential = session.describe_credential();
        let source_tables = session.config.source_tables()?;
        let sources = session
            .config
            .sources
            .iter()
            .map(|s| {
                let result = s.ensure_executable();
                Ok(SourceView {
                    id: s.id.clone(),
                    builtin_key: source_tables.iter().find(|t| t.id == s.id).and_then(|t| t.resolved_builtin_key().map(str::to_owned)),
                    display_name: source_tables.iter().find(|t| t.id == s.id).and_then(|t| t.display_name.clone()),
                    kind: s.kind.name().into(),
                    enabled: s.enabled,
                    executable: s.enabled && result.is_ok(),
                    reason: if !s.enabled {
                        Some("来源已停用".into())
                    } else {
                        result.err().map(|e| e.to_string())
                    },
                    action: s.todo.as_ref().map(|q| q.action.as_str().into()),
                    asset_key: s.todo.as_ref().and_then(|q| q.asset_key.clone()),
                    todo_scope: s
                        .todo
                        .as_ref()
                        .and_then(|q| q.todo_scope.map(|v| v.as_str().into())),
                    type_scope: type_scope_view(
                        session.source_types(&s.id)?,
                        session.source_type_scope(&s.id)?,
                    ),
                    project_key: match &s.kind {fstodo_backend::SourceKind::WorkItemType{project_key,..}|fstodo_backend::SourceKind::View{project_key,..}=>project_key.clone(),_=>None},
                    work_item_type_key: match &s.kind {fstodo_backend::SourceKind::WorkItemType{type_key,..}=>type_key.clone(),_=>None},
                    view_id: match &s.kind {fstodo_backend::SourceKind::View{view_id,..}=>view_id.clone(),_=>None},
                    association_rule: s.association_rule.clone(),
                })
            })
            .collect::<Result<Vec<_>, BackendError>>()?;
        Ok(Snapshot {
            capabilities: Capabilities {
                workflow: session.config.workflow_enabled,
                source_queries: true,
                details: true,
                type_order: true,
                source_type_preferences: true,
                incremental_sync: true,
                progressive_sync: true,
                workspace_catalog: true,
                creation: true,
                filter_schemes: true,
                detail_display: true,
            },
            // 缓存是累积集合，不能把默认 200 条截断误报成全部。
            items: session.query_cached_items(&ItemFilter {
                limit: Some(i64::MAX),
                ..Default::default()
            })?,
            total: session.count_cached_items()?,
            last_success: session.last_successful_sync()?,
            runs: session.recent_runs(20)?,
            sources,
            type_order: session.type_order()?,
            source_type_preferences: session.store.source_type_preferences()?,
            workspace_catalog: session.store.workspace_catalog()?,
            config_path: session
                .config
                .loaded_from
                .as_ref()
                .unwrap_or(&session.config.default_config_path)
                .display()
                .to_string(),
            db_path: session.config.db_path.display().to_string(),
            credential_ready: credential.is_ok(),
            credential_description: credential.unwrap_or_else(|e| UiError::from(e).message),
            settings: session.config.connection_settings()?,
        })
    })
    .await
}

#[derive(Serialize)]
struct ItemDetailView {
    #[serde(flatten)]
    detail: fstodo_backend::detail::ItemDetail,
    item_url: Option<String>,
}

fn detail_view(session: &Session, detail: fstodo_backend::detail::ItemDetail) -> ItemDetailView {
    let item_url = workflow::item_url(&session.config.endpoint, &detail.id, &detail.data);
    ItemDetailView { detail, item_url }
}

fn refreshed_detail_view(session: &Session, detail: fstodo_backend::detail::ItemDetail) -> ItemDetailView {
    let item_url = workflow::resolve_item_url(session, &detail.id, &detail.data);
    ItemDetailView { detail, item_url }
}

#[tauri::command]
async fn cached_item_detail(item_id: WorkItemId) -> Result<Option<ItemDetailView>, UiError> {
    blocking(move || {
        let session = open_session()?;
        Ok(session.cached_item_detail(&item_id)?.map(|detail| detail_view(&session, detail)))
    }).await
}

#[tauri::command]
async fn refresh_item_detail(item_id: WorkItemId) -> Result<ItemDetailView, UiError> {
    blocking(move || {
        let session = open_session()?;
        Ok(refreshed_detail_view(&session, session.refresh_item_detail(&item_id)?))
    }).await
}

#[tauri::command]
async fn load_field_image(item_id: WorkItemId, field_key: String, url: String, refresh: bool) -> Result<String, UiError> {
    blocking(move || fstodo_backend::field_images::load(&open_session()?, &item_id, &field_key, &url, refresh)).await
}

#[tauri::command]
async fn resolve_link_metadata(url: String) -> Option<fstodo_backend::link_metadata::LinkMetadata> {
    fstodo_backend::link_metadata::resolve(&url).await
}

#[tauri::command]
async fn discover_source_fields(project_key: String, type_key: String) -> Result<serde_json::Value, UiError> {
    blocking(move || open_session()?.source_fields(&project_key,&type_key)).await
}

#[tauri::command]
async fn refresh_workspace_catalog() -> Result<fstodo_backend::catalog::CatalogRefresh, UiError> {
    blocking(move || open_session()?.refresh_workspace_catalog()).await
}

#[tauri::command]
async fn discover_spaces() -> Result<fstodo_backend::catalog::SpaceDiscovery, UiError> {
    blocking(move || open_session()?.discover_spaces()).await
}

#[tauri::command]
async fn save_work_source(source: fstodo_backend::config::SourceTable) -> Result<(), UiError> {
    blocking(move || open_session()?.config.save_source(source)).await
}

#[tauri::command]
async fn remove_work_source(source_id: String) -> Result<(), UiError> {
    blocking(move || open_session()?.config.remove_source(&source_id)).await
}

#[tauri::command]
async fn set_work_source_enabled(source_id: String, enabled: bool) -> Result<(), UiError> {
    blocking(move || open_session()?.config.set_source_enabled(&source_id, enabled)).await
}

#[tauri::command]
async fn sync_todos(window: tauri::WebviewWindow, source_id: String, automatic: Option<bool>, source_ids: Option<Vec<String>>, request_id: Option<String>) -> Result<serde_json::Value, UiError> {
    blocking(move || {
        let session = open_session()?;
        // UI 只能同步启用的来源，不利用显式 ID 绕过 enabled。
        if source_id != "*" { ensure_source_enabled(&session, &source_id)?; }
        let trigger = if automatic.unwrap_or(false) {
            RunTrigger::Automatic
        } else {
            RunTrigger::Manual
        };
        if let Some(ids) = source_ids {
            let sequence = std::sync::atomic::AtomicU64::new(0);
            return session.sync_sources_with_progress(&ids, trigger, |mut event| {
                if let Some(request_id) = &request_id {
                    event["request_id"] = serde_json::json!(request_id);
                    event["sequence"] = serde_json::json!(sequence.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1);
                    let _ = window.emit("sync-progress", event);
                }
            });
        }
        let report = if source_id=="*" {session.sync_enabled_sources(trigger)}else{session.sync_personal_todos(Some(&source_id), trigger)}?;
        Ok(serde_json::to_value(report)?)
    })
    .await
}

#[tauri::command]
async fn refresh_source_types(source_id: String) -> Result<TypeDiscoveryView, UiError> {
    blocking(move || {
        let session = open_session()?;
        ensure_source_enabled(&session, &source_id)?;
        let result = session.refresh_source_types(&source_id)?;
        Ok(TypeDiscoveryView {
            discovered_count: result.types.len(),
            failed: result.failed,
            failure_kinds: result.failure_kinds,
            type_scope: type_scope_view(session.source_types(&source_id)?, session.source_type_scope(&source_id)?),
        })
    })
    .await
}

#[tauri::command]
async fn save_source_types(source_id: String, type_keys: Vec<String>) -> Result<usize, UiError> {
    blocking(move || {
        let session = open_session()?;
        ensure_source_enabled(&session, &source_id)?;
        session.set_source_type_scope(&source_id, &type_keys)
    })
    .await
}

#[tauri::command]
async fn clear_source_types(source_id: String) -> Result<bool, UiError> {
    blocking(move || {
        let session = open_session()?;
        ensure_source_enabled(&session, &source_id)?;
        session.clear_source_type_scope(&source_id)
    })
    .await
}

#[tauri::command]
async fn save_type_order(type_keys: Vec<String>) -> Result<(), UiError> {
    blocking(move || open_session()?.set_type_order(&type_keys)).await
}

#[tauri::command]
async fn initialize_source_type_preferences(
    preferences: fstodo_backend::store::SourceTypePreferences,
) -> Result<fstodo_backend::store::SourceTypePreferences, UiError> {
    blocking(move || open_session()?.store.initialize_source_type_preferences(&preferences)).await
}

#[tauri::command]
async fn save_source_type_preferences(
    source_id: String,
    preferences: fstodo_backend::store::TypePreferences,
) -> Result<(), UiError> {
    blocking(move || open_session()?.store.set_source_type_preferences(&source_id, &preferences)).await
}

#[tauri::command]
async fn check_connection() -> Result<ConnectionInfo, UiError> {
    blocking(|| open_session()?.check_connection()).await
}

#[tauri::command]
async fn load_filter_schemes() -> Result<fstodo_backend::filter_schemes::FilterSchemePreferences, UiError> {
    blocking(|| fstodo_backend::filter_schemes::load(&open_session()?)).await
}

#[tauri::command]
async fn save_filter_schemes(account: String, document: serde_json::Value) -> Result<(), UiError> {
    blocking(move || fstodo_backend::filter_schemes::save(&open_session()?, &account, &document)).await
}

#[tauri::command]
async fn load_detail_display(project: String, kind: String) -> Result<fstodo_backend::filter_schemes::FilterSchemePreferences, UiError> {
    blocking(move || {
        let session = open_session()?;
        let account = fstodo_backend::filter_schemes::account(&session)?;
        let document = session.store.detail_display(&account, &project, &kind)?;
        Ok(fstodo_backend::filter_schemes::FilterSchemePreferences { account, document })
    }).await
}

#[tauri::command]
async fn save_detail_display(account: String, project: String, kind: String, document: serde_json::Value) -> Result<(), UiError> {
    blocking(move || {
        let session = open_session()?;
        if fstodo_backend::filter_schemes::account(&session)? != account {
            return Err(BackendError::validation("飞书账号已变化，请重新加载详情显示设置"));
        }
        session.store.set_detail_display(&account, &project, &kind, &document)
    }).await
}

#[tauri::command]
async fn save_token(token: String) -> Result<String, UiError> {
    blocking(move || open_session()?.save_token(&token)).await
}

#[tauri::command]
async fn save_connection_settings(settings: ConnectionSettings) -> Result<(), UiError> {
    blocking(move || {
        let config = Config::load(None, None)?;
        let _candidate = Session::open(config.preview_connection_settings(&settings)?.for_desktop())?;
        config.save_connection_settings(&settings)
    }).await
}

/// 开关只认 config.toml 的 `workflow_enabled`。
///
/// 两个流程命令都必须先过这里：开关的意义不能建立在「前端自觉不调用」上，
/// 否则手工构造一次 invoke 就绕过去了。
fn ensure_workflow_enabled(session: &Session) -> Result<(), BackendError> {
    if session.config.workflow_enabled {
        return Ok(());
    }
    Err(BackendError::config(
        "流程操作暂不可用，请重新打开桌面应用后重试",
    ))
}

#[tauri::command]
async fn get_workflow_actions(item_id: WorkItemId, fresh: Option<bool>) -> Result<WorkflowOptions, UiError> {
    blocking(move || {
        let session = open_session()?;
        ensure_workflow_enabled(&session)?;
        if fresh.unwrap_or(false) {
            workflow::fresh_actions(&session, &item_id)
        } else {
            workflow::actions(&session, &item_id)
        }
    })
    .await
}

#[tauri::command]
async fn lookup_workflow_field(item_id: WorkItemId, action_id: String, field_key: String, query: String) -> Result<fstodo_backend::creation::LookupResult, UiError> {
    blocking(move || {
        let session = open_session()?;
        ensure_workflow_enabled(&session)?;
        workflow::lookup_field(&session, &item_id, &action_id, &field_key, &query)
    }).await
}

#[tauri::command]
async fn get_workflow_editor_context(item_id: WorkItemId) -> Result<workflow::editor::Context, UiError> {
    blocking(move || workflow::editor::context(&open_session()?, &item_id)).await
}

#[tauri::command]
async fn upload_workflow_image(item_id: WorkItemId, action_id: String, field_key: String, context: String, image_id: String) -> Result<fstodo_backend::UploadedCreationImage, UiError> {
    blocking(move || workflow::editor::upload(&open_session()?, &item_id, &action_id, &field_key, &context, &image_id)).await
}

#[tauri::command]
async fn get_pending_creations() -> Result<Vec<fstodo_backend::creation::Form>, UiError> {
    blocking(move || fstodo_backend::creation::pending_forms(&open_session()?)).await
}

#[tauri::command]
async fn get_creation_form(target: fstodo_backend::creation::Target) -> Result<fstodo_backend::creation::Form, UiError> {
    blocking(move || fstodo_backend::creation::discover(&open_session()?, &target)).await
}

#[tauri::command]
async fn resolve_creation_relation_labels(target: fstodo_backend::creation::Target, field_key: String, ids: Vec<String>) -> Result<fstodo_backend::creation::LookupResult, UiError> {
    blocking(move || fstodo_backend::creation::resolve_relation_labels(&open_session()?, &target, &field_key, ids)).await
}

#[tauri::command]
async fn lookup_creation_field(target: fstodo_backend::creation::Target, field_key: String, query: String) -> Result<fstodo_backend::creation::LookupResult, UiError> {
    blocking(move || fstodo_backend::creation::lookup(&open_session()?, &target, &field_key, &query)).await
}

#[tauri::command]
async fn save_creation_image(target: fstodo_backend::creation::Target, context: String, field_key: String, bytes_base64: String, mime_type: String, file_name: String) -> Result<fstodo_backend::SavedCreationImage, UiError> {
    blocking(move || fstodo_backend::creation::images::save(&open_session()?, &target, &context, &field_key, &bytes_base64, &mime_type, &file_name)).await
}

#[tauri::command]
async fn get_creation_image(target: fstodo_backend::creation::Target, context: String, field_key: String, image_id: String) -> Result<fstodo_backend::CreationImagePreview, UiError> {
    blocking(move || fstodo_backend::creation::images::get(&open_session()?, &target, &context, &field_key, &image_id)).await
}

#[tauri::command]
async fn get_uploaded_creation_image(target: fstodo_backend::creation::Target, context: String, field_key: String, url: String, file_token: String) -> Result<fstodo_backend::CreationImagePreview, UiError> {
    blocking(move || fstodo_backend::creation::images::get_uploaded(&open_session()?, &target, &context, &field_key, &url, &file_token)).await
}

#[tauri::command]
async fn upload_creation_image(target: fstodo_backend::creation::Target, context: String, field_key: String, image_id: String) -> Result<fstodo_backend::UploadedCreationImage, UiError> {
    blocking(move || fstodo_backend::creation::images::upload(&open_session()?, &target, &context, &field_key, &image_id)).await
}

#[tauri::command]
async fn cached_field_image(item_id: WorkItemId, field_key: String, url: String) -> Result<Option<String>, UiError> {
    blocking(move || fstodo_backend::field_images::cached(&open_session()?, &item_id, &field_key, &url)).await
}

#[tauri::command]
async fn list_related_defects(item_id: WorkItemId) -> Result<fstodo_backend::related_defects::RelatedDefects, UiError> {
    blocking(move || fstodo_backend::related_defects::list(&open_session()?, &item_id)).await
}

#[tauri::command]
async fn create_work_item(request: fstodo_backend::creation::Request) -> Result<fstodo_backend::creation::ResultView, serde_json::Value> {
    // execute 发出写请求之后始终返回 ResultView；仅校验和登记前失败可恢复编辑。
    // 线程中断不具备该保证，不能标记为 before_write。
    tauri::async_runtime::spawn_blocking(move || {
        open_session().and_then(|session| fstodo_backend::creation::execute(&session, &request))
            .map_err(|e| { let error=UiError::from(e); serde_json::json!({"kind":error.kind,"message":error.message,"before_write":true}) })
    }).await.map_err(|_| serde_json::json!({"kind":"internal","message":"创建任务中断，请先核对结果","before_write":false}))?
}

#[tauri::command]
async fn save_creation_attachment(target: fstodo_backend::creation::Target, context: String, field_key: String, bytes_base64: String, mime_type: String, file_name: String) -> Result<fstodo_backend::creation::attachments::Attachment, UiError> {
    blocking(move || fstodo_backend::creation::attachments::save(&open_session()?, &target, &context, &field_key, &bytes_base64, &mime_type, &file_name)).await
}

#[tauri::command]
async fn get_creation_attachment(target: fstodo_backend::creation::Target, context: String, field_key: String, attachment_id: String) -> Result<fstodo_backend::creation::attachments::Attachment, UiError> {
    blocking(move || fstodo_backend::creation::attachments::get(&open_session()?, &target, &context, &field_key, &attachment_id)).await
}

#[tauri::command]
async fn upload_creation_attachment(target: fstodo_backend::creation::Target, context: String, field_key: String, attachment_id: String) -> Result<fstodo_backend::creation::attachments::Attachment, UiError> {
    blocking(move || fstodo_backend::creation::attachments::upload(&open_session()?, &target, &context, &field_key, &attachment_id)).await
}

#[tauri::command]
async fn acknowledge_creation_recovery(request_id: String) -> Result<(), UiError> {
    blocking(move || fstodo_backend::creation::acknowledge_recovery(&open_session()?, &request_id)).await
}

#[tauri::command]
async fn verify_work_item_creation(request_id: String, item_number: Option<String>, local_request: Option<fstodo_backend::creation::Request>) -> Result<fstodo_backend::creation::ResultView, UiError> {
    blocking(move || fstodo_backend::creation::verify(&open_session()?, &request_id, item_number.as_deref(),local_request.as_ref())).await
}

#[tauri::command]
async fn execute_workflow_action(request: WorkflowRequest) -> Result<WorkflowResult, UiError> {
    blocking(move || {
        let session = open_session()?;
        ensure_workflow_enabled(&session)?;
        workflow::execute(&session, &request)
    })
    .await
}

#[tauri::command]
fn prepare_app_update(app: tauri::AppHandle) {
    // 更新插件与重启不会走窗口关闭事件，提前保留当前窗口的位置和尺寸。
    display_mode::remember_on_close(&app, "main");
}

fn main() {
    let builder = tauri::Builder::default();
    // Debug builds must never download or replace the development executable.
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    builder
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            display_mode::restore(app);
            #[cfg(all(windows, not(debug_assertions)))]
            if let Ok(data_dir) = app.path().app_local_data_dir() {
                update_cleanup::schedule(app.package_info().version.clone(), data_dir);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                display_mode::remember_on_close(window.app_handle(), window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            external_links::open_external_url,
            desktop_workspaces::set_follow_virtual_desktop,
            display_mode::get_display_mode,
            display_mode::set_display_mode,
            display_mode::set_compact_pinned,
            display_mode::window_action,
            prepare_app_update,
            update_check::check_app_update,
            update_download::begin_update_download,
            update_download::download_update,
            update_download::install_verified_update,
            cached_item_detail,
            cached_field_image,
            refresh_item_detail,
            load_field_image,
            resolve_link_metadata,
            discover_source_fields,
            refresh_workspace_catalog,
            discover_spaces,
            save_work_source,
            remove_work_source,
            set_work_source_enabled,
            load_snapshot,
            sync_todos,
            check_connection,
            save_token,
            save_connection_settings,
            refresh_source_types,
            save_source_types,
            clear_source_types,
            save_type_order,
            initialize_source_type_preferences,
            save_source_type_preferences,
            load_filter_schemes,
            save_filter_schemes,
            load_detail_display,
            save_detail_display,
            get_workflow_actions,
            lookup_workflow_field,
            get_workflow_editor_context,
            upload_workflow_image,
            get_pending_creations,
            list_related_defects,
            get_creation_form,
            lookup_creation_field,
            resolve_creation_relation_labels,
            save_creation_image,
            get_creation_image,
            get_uploaded_creation_image,
            upload_creation_image,
            save_creation_attachment,
            get_creation_attachment,
            upload_creation_attachment,
            create_work_item,
            verify_work_item_creation,
            acknowledge_creation_recovery,
            execute_workflow_action,
            load_schedule_session,
            sync_schedule_session,
            close_schedule_session
        ])
        .run(tauri::generate_context!())
        .expect("无法启动 FSTODO 桌面窗口");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn poisoned_schedule_requires_explicit_matching_close_before_reuse() {
        let mutex = std::sync::Arc::new(std::sync::Mutex::new(Some("old".to_string())));
        let worker = mutex.clone();
        assert!(std::thread::spawn(move || {
            let _guard = worker.lock().unwrap();
            panic!("模拟同步发出后崩溃");
        }).join().is_err());
        assert!(lock_schedule(&mutex).is_err());
        assert!(close_schedule(&mutex, |id| id == "other").is_err());
        assert!(lock_schedule(&mutex).is_err());
        close_schedule(&mutex, |id| id == "old").unwrap();
        assert!(lock_schedule(&mutex).unwrap().is_none());
        *lock_schedule(&mutex).unwrap() = Some("new".into());
        assert_eq!(lock_schedule(&mutex).unwrap().as_deref(), Some("new"));
        let guard = lock_schedule(&mutex).unwrap();
        assert!(close_schedule(&mutex, |_| true).is_err());
        drop(guard);
    }

    #[test]
    fn schedule_sync_marks_only_returned_pre_send_errors() {
        for error in [
            BackendError::Config { message: "配置不可用".into() },
            BackendError::Credential { message: "凭证不可用".into() },
            BackendError::validation("排期无效"),
            BackendError::conflict("会话已变化"),
        ] {
            let error = tauri::async_runtime::block_on(blocking_schedule_sync::<()>(move || Err(error))).err().unwrap();
            assert_eq!(serde_json::to_value(error).unwrap()["schedule_not_sent"], true);
        }
        let (sent, observed) = std::sync::mpsc::channel();
        let error = tauri::async_runtime::block_on(blocking_schedule_sync::<()>(move || {
            sent.send(()).unwrap();
            panic!("模拟发送后任务崩溃");
        })).err().unwrap();
        observed.recv().unwrap();
        assert!(serde_json::to_value(error).unwrap().get("schedule_not_sent").is_none());
    }

    fn cached_types() -> Vec<CachedType> {
        vec![
            CachedType {
                project_key: "a".into(),
                type_key: "story".into(),
                ..Default::default()
            },
            CachedType {
                project_key: "b".into(),
                type_key: "story".into(),
                ..Default::default()
            },
        ]
    }

    #[test]
    fn unconfigured_scope_and_confirmed_empty_remain_distinct() {
        let all = type_scope_view(cached_types(), None);
        assert!(!all.configured);
        assert!(all.types.iter().all(|t| t.selected));
        let empty = type_scope_view(cached_types(), Some(TypeScope::default()));
        assert!(empty.configured);
        assert_eq!(empty.selected_count, 0);
        assert!(empty.types.iter().all(|t| !t.selected));
    }

    #[test]
    fn selection_projection_preserves_project_and_original_type_key() {
        let scope = TypeScope::from_pairs([("a", "story")]);
        let view = type_scope_view(cached_types(), Some(scope));
        assert_eq!(view.selected_count, 1);
        assert!(view.types[0].selected);
        assert!(!view.types[1].selected);
        assert_eq!(view.types[0].type_key, "story");
    }
}
