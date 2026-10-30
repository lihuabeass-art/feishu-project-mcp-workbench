fn browser_url(value: &str) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(value).map_err(|_| "链接地址无效".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("仅支持 HTTP 或 HTTPS 网页链接".into());
    }
    Ok(url)
}

#[tauri::command]
pub async fn open_external_url(
    window: tauri::WebviewWindow,
    url: String,
    new_window: Option<bool>,
) -> Result<(), String> {
    let url = browser_url(&url)?;
    let handoff = crate::display_mode::begin_external_open(&window)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            windows::open_url(&url, new_window.unwrap_or(true))
        }
        #[cfg(not(windows))]
        {
            let _ = new_window;
            tauri_plugin_opener::open_url(url.as_str(), None::<&str>)
                .map_err(|_| "无法通过默认浏览器打开链接".to_string())
        }
    })
    .await
    .unwrap_or_else(|_| Err("打开链接任务中断，请重试".to_string()));
    match result {
        Ok(()) => {
            crate::display_mode::await_external_return(window, handoff);
            Ok(())
        }
        Err(error) => {
            crate::display_mode::cancel_external_open(&window, handoff)
                .map_err(|restore| format!("{error}；窗口置顶恢复失败：{restore}"))?;
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_web_links_and_preserves_path_query_and_fragment() {
        for value in [
            "https://example.feishu.cn/drive/folder/abc?from=from_copylink#section",
            "http://example.com/path?a=1&b=2",
        ] {
            assert_eq!(browser_url(value).unwrap().as_str(), value);
        }
    }

    #[test]
    fn rejects_non_web_links_before_calling_system_opener() {
        for value in [
            "javascript:alert(1)",
            "file:///C:/secret.txt",
            "mailto:a@example.com",
            "data:text/html,test",
            "relative/path",
            "",
        ] {
            assert!(browser_url(value).is_err(), "{value}");
        }
    }
}
#[cfg(windows)]
mod windows;
