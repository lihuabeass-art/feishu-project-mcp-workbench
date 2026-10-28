use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use windows_sys::Win32::UI::Shell::{
    AssocQueryStringW, ASSOCF_IS_PROTOCOL, ASSOCF_NOTRUNCATE, ASSOCSTR_EXECUTABLE,
};

fn default_browser(protocol: &str) -> Result<PathBuf, String> {
    let protocol: Vec<u16> = protocol.encode_utf16().chain(Some(0)).collect();
    let flags = ASSOCF_IS_PROTOCOL | ASSOCF_NOTRUNCATE;
    let mut length = 0;
    // SAFETY: protocol is NUL-terminated; a null output buffer requests its required size.
    let result = unsafe {
        AssocQueryStringW(
            flags,
            ASSOCSTR_EXECUTABLE,
            protocol.as_ptr(),
            std::ptr::null(),
            std::ptr::null_mut(),
            &mut length,
        )
    };
    if result < 0 || length == 0 {
        return Err("无法读取系统默认浏览器，请检查 Windows 默认应用设置".into());
    }
    let mut buffer = vec![0; length as usize];
    // SAFETY: all pointers remain valid; buffer contains length writable UTF-16 units.
    let result = unsafe {
        AssocQueryStringW(
            flags,
            ASSOCSTR_EXECUTABLE,
            protocol.as_ptr(),
            std::ptr::null(),
            buffer.as_mut_ptr(),
            &mut length,
        )
    };
    if result != 0 {
        return Err("无法读取系统默认浏览器，请重试".into());
    }
    let end = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
    let path = PathBuf::from(OsString::from_wide(&buffer[..end]));
    if !path.is_absolute()
        || path
            .extension()
            .is_none_or(|ext| !ext.eq_ignore_ascii_case("exe"))
    {
        return Err("系统默认浏览器的程序路径无效".into());
    }
    Ok(path)
}

fn new_window_command(browser: &Path, url: &tauri::Url) -> Option<Command> {
    let executable = browser
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    // Only pass browser-specific switches to handlers known to support them.
    if !matches!(
        executable.as_str(),
        "chrome.exe" | "msedge.exe" | "firefox.exe"
    ) {
        return None;
    }
    let mut command = Command::new(browser);
    // Keep the URL as one argument, including spaces, quotes and query delimiters. No shell.
    command.arg("--new-window").arg(url.as_str());
    Some(command)
}

pub(super) fn open_new_window(url: &tauri::Url) -> Result<(), String> {
    if let Ok(browser) = default_browser(url.scheme()) {
        if let Some(mut command) = new_window_command(&browser, url) {
            return command
                .spawn()
                .map(|_| ())
                .map_err(|_| "无法新建默认浏览器窗口，请重试或复制链接手动打开".into());
        }
    }
    // Preserve system handling for other browsers and association wrappers.
    tauri_plugin_opener::open_url(url.as_str(), None::<&str>)
        .map_err(|_| "无法通过默认浏览器打开链接".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supported_browsers_request_a_new_window_with_one_intact_url_argument() {
        let url = tauri::Url::parse("https://example.com/a%20b?from=copy&text=%22hello%22#section")
            .unwrap();
        for browser in [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Mozilla Firefox\FIREFOX.EXE",
        ] {
            let command = new_window_command(Path::new(browser), &url).unwrap();
            assert_eq!(command.get_program(), browser);
            assert_eq!(
                command.get_args().collect::<Vec<_>>(),
                ["--new-window", url.as_str()]
            );
        }
    }

    #[test]
    fn unknown_handlers_are_left_to_system_handling_without_browser_switches() {
        let url = tauri::Url::parse("https://example.com").unwrap();
        assert!(new_window_command(Path::new(r"C:\Browser\launcher.exe"), &url).is_none());
    }

    #[test]
    #[ignore = "reads the host's default browser association; does not launch it"]
    fn resolves_installed_default_browser_without_launching() {
        for protocol in ["http", "https"] {
            let browser = default_browser(protocol).unwrap();
            assert!(browser.is_file());
            new_window_command(
                &browser,
                &tauri::Url::parse(&format!("{protocol}://example.com")).unwrap(),
            )
            .unwrap();
        }
    }
}
