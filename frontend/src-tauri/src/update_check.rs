use serde::Serialize;
use std::time::Duration;
use tauri::{Manager, ResourceId, Webview};
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    rid: ResourceId,
    current_version: String,
    version: String,
    body: Option<String>,
    raw_json: serde_json::Value,
}

fn message(error: tauri_plugin_updater::Error) -> String {
    match error {
        tauri_plugin_updater::Error::Reqwest(error) => {
            let reason = if error.is_timeout() {
                "连接更新服务器超时"
            } else if error.is_connect() {
                "无法连接更新服务器"
            } else {
                "未能获取更新信息"
            };
            format!("{reason}。请检查系统代理或网络后重试，也可以通过浏览器下载安装包。")
        }
        error => error.to_string(),
    }
}

#[tauri::command]
pub async fn check_app_update(
    webview: Webview,
    timeout: Option<u64>,
) -> Result<Option<Metadata>, String> {
    if cfg!(debug_assertions) {
        return Err("开发模式已禁用软件更新，请在正式安装版中更新。".into());
    }
    let timeout = Duration::from_millis(timeout.unwrap_or(20_000).clamp(1_000, 60_000));
    let updater = webview
        .updater_builder()
        .timeout(timeout)
        .configure_client(crate::update_proxy::configure)
        .build()
        .map_err(message)?;
    // The proxy adapter bounds OS lookups and yields the runtime worker. Keep
    // an overall deadline as well as the updater's individual request timeout.
    let mut task = tauri::async_runtime::spawn(async move { updater.check().await });
    let update = match tokio::time::timeout(timeout, &mut task).await {
        Ok(result) => result
            .map_err(|_| "更新检查任务中断".to_owned())?
            .map_err(message)?,
        Err(_) => {
            task.abort();
            return Err(
                "检查更新超时。请检查系统代理或网络后重试，也可以通过浏览器下载安装包。".into(),
            );
        }
    };
    Ok(update.map(|update| Metadata {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        body: update.body.clone(),
        raw_json: update.raw_json.clone(),
        rid: webview.resources_table().add(update),
    }))
}
