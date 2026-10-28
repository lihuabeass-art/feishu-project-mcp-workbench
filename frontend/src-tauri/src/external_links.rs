fn browser_url(value: &str) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(value).map_err(|_| "链接地址无效".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("仅支持 HTTP 或 HTTPS 网页链接".into());
    }
    Ok(url)
}

#[tauri::command]
pub async fn open_external_url(url: String, new_window: Option<bool>) -> Result<(), String> {
    let url = browser_url(&url)?;
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        if new_window.unwrap_or(true) {
            return windows::open_new_window(&url);
        }
        #[cfg(not(windows))]
        let _ = new_window;
        tauri_plugin_opener::open_url(url.as_str(), None::<&str>)
            .map_err(|_| "无法通过默认浏览器打开链接".to_string())
    })
    .await
    .map_err(|_| "打开链接任务中断，请重试".to_string())?
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
