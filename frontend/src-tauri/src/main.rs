#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod external_links;
mod desktop_workspaces;
mod display_mode;
mod update_download;

use fstodo_backend::api::Session;
use fstodo_backend::config::{Config, ConnectionSettings};
use fstodo_backend::error::BackendError;
use fstodo_backend::mcp::ConnectionInfo;
use fstodo_backend::model::domain::WorkItemId;
use fstodo_backend::store::{CachedItem, CachedType, ItemFilter, RunTrigger, SyncRun, TypeScope};
use fstodo_backend::workflow::{self, WorkflowOptions, WorkflowRequest, WorkflowResult};
use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
struct UiError {
    kind: String,
    message: String,
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
    workspace_catalog: bool,
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
        })?
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
                workspace_catalog: true,
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

#[tauri::command]
async fn cached_item_detail(item_id: WorkItemId) -> Result<Option<fstodo_backend::detail::ItemDetail>, UiError> {
    blocking(move || open_session()?.cached_item_detail(&item_id)).await
}

#[tauri::command]
async fn refresh_item_detail(item_id: WorkItemId) -> Result<fstodo_backend::detail::ItemDetail, UiError> {
    blocking(move || open_session()?.refresh_item_detail(&item_id)).await
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
async fn sync_todos(source_id: String, automatic: Option<bool>, source_ids: Option<Vec<String>>) -> Result<serde_json::Value, UiError> {
    blocking(move || {
        let session = open_session()?;
        // UI 只能同步启用的来源，不利用显式 ID 绕过 enabled。
        if source_id != "*" { ensure_source_enabled(&session, &source_id)?; }
        let trigger = if automatic.unwrap_or(false) {
            RunTrigger::Automatic
        } else {
            RunTrigger::Manual
        };
        if let Some(ids) = source_ids { return session.sync_sources(&ids, trigger); }
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
            update_download::begin_update_download,
            update_download::download_update,
            update_download::install_verified_update,
            cached_item_detail,
            refresh_item_detail,
            load_field_image,
            resolve_link_metadata,
            discover_source_fields,
            refresh_workspace_catalog,
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
            get_workflow_actions,
            execute_workflow_action
        ])
        .run(tauri::generate_context!())
        .expect("无法启动 FSTODO 桌面窗口");
}

#[cfg(test)]
mod tests {
    use super::*;

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
