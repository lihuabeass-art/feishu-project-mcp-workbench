use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};
use windows_sys::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows_sys::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows_sys::Win32::UI::Shell::{
    AssocQueryStringW, ASSOCF_IS_PROTOCOL, ASSOCF_NOTRUNCATE, ASSOCSTR_EXECUTABLE,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    AllowSetForegroundWindow, EnumWindows, GetForegroundWindow, GetWindow, GetWindowTextLengthW,
    GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindowAsync,
    GW_OWNER, SW_RESTORE,
};

const ACTIVATION_UNCONFIRMED: &str =
    "链接已交给默认浏览器，但未能确认浏览器已切到前台，请从任务栏查看浏览器。";
const WINDOW_WAIT: Duration = Duration::from_secs(4);
const HANDOFF_WAIT: Duration = Duration::from_millis(500);
const POLL_INTERVAL: Duration = Duration::from_millis(40);

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

#[derive(Clone, Debug, PartialEq, Eq)]
struct BrowserWindow {
    handle: HWND,
    process_id: u32,
    minimized: bool,
}

fn process_image(process_id: u32) -> Option<PathBuf> {
    // SAFETY: the handle is queried with read-only limited rights and closed on every path.
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
        if process.is_null() {
            return None;
        }
        let mut buffer = vec![0; 32768];
        let mut length = buffer.len() as u32;
        let queried = QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut length);
        CloseHandle(process);
        if queried == 0 {
            return None;
        }
        std::fs::canonicalize(PathBuf::from(OsString::from_wide(
            &buffer[..length as usize],
        )))
        .ok()
    }
}

fn window_for_browser(handle: HWND, browser: &Path) -> Option<BrowserWindow> {
    // SAFETY: Win32 validates handles, which may disappear while a browser starts or exits.
    unsafe {
        if IsWindowVisible(handle) == 0 || !GetWindow(handle, GW_OWNER).is_null() {
            return None;
        }
        let mut process_id = 0;
        if GetWindowThreadProcessId(handle, &mut process_id) == 0
            || process_image(process_id).as_deref() != Some(browser)
        {
            return None;
        }
        // Untitled helper windows are not the browser's document window. Window title changes
        // are deliberately not observed: a background page can change its title independently.
        if GetWindowTextLengthW(handle) <= 0 {
            return None;
        }
        Some(BrowserWindow {
            handle,
            process_id,
            minimized: IsIconic(handle) != 0,
        })
    }
}

fn browser_windows(browser: &Path) -> Option<Vec<BrowserWindow>> {
    struct Enumeration<'a> {
        browser: &'a Path,
        windows: Vec<BrowserWindow>,
    }
    unsafe extern "system" fn collect(handle: HWND, data: LPARAM) -> i32 {
        // SAFETY: EnumWindows invokes this synchronously with the live Enumeration pointer below.
        let enumeration = unsafe { &mut *(data as *mut Enumeration<'_>) };
        if let Some(window) = window_for_browser(handle, enumeration.browser) {
            enumeration.windows.push(window);
        }
        1
    }
    let mut enumeration = Enumeration {
        browser,
        windows: Vec::new(),
    };
    // SAFETY: the context outlives the entire synchronous enumeration and callback.
    let result = unsafe {
        EnumWindows(
            Some(collect),
            &mut enumeration as *mut Enumeration<'_> as LPARAM,
        )
    };
    (result != 0).then_some(enumeration.windows)
}

fn activation_target<'a>(
    before: &[BrowserWindow],
    current: &'a [BrowserWindow],
    foreground: HWND,
    launched_process: Option<u32>,
    require_new: bool,
    handoff_waited: bool,
) -> Option<&'a BrowserWindow> {
    let is_new = |window: &&BrowserWindow| {
        !before
            .iter()
            .any(|old| old.handle == window.handle && old.process_id == window.process_id)
    };
    let new: Vec<_> = current.iter().filter(is_new).collect();
    if !new.is_empty() {
        return new
            .iter()
            .copied()
            .find(|window| window.handle == foreground)
            .or_else(|| {
                new.iter()
                    .copied()
                    .find(|window| Some(window.process_id) == launched_process)
            })
            .or_else(|| (new.len() == 1).then_some(new[0]));
    }
    if require_new {
        return None;
    }
    if let Some(window) = current.iter().find(|window| window.handle == foreground) {
        return Some(window);
    }
    if !handoff_waited {
        return None;
    }
    // A system handoff can restore a minimized browser without activating it. Follow only
    // the unique window the system restored; do not restore candidates to discover a target.
    let mut restored = current.iter().filter(|window| {
        !window.minimized
            && before.iter().any(|old| {
                old.handle == window.handle && old.process_id == window.process_id && old.minimized
            })
    });
    if let Some(window) = restored.next() {
        return restored.next().is_none().then_some(window);
    }
    // With several existing windows, only the browser/system knows which received the URL.
    // Do not guess from unrelated title updates or the window enumeration order.
    (current.len() == 1).then(|| &current[0])
}

fn activate_browser_window(window: &BrowserWindow, browser: &Path) -> bool {
    // Recheck identity immediately before acting: handles/PIDs can be recycled during startup.
    if window_for_browser(window.handle, browser)
        .is_none_or(|current| current.process_id != window.process_id)
    {
        return false;
    }
    // SAFETY: the target was matched to the associated executable; no global foreground grant.
    unsafe {
        AllowSetForegroundWindow(window.process_id);
        if IsIconic(window.handle) != 0 {
            // Restore only minimized windows; maximized windows keep their current size.
            ShowWindowAsync(window.handle, SW_RESTORE);
            let deadline = Instant::now() + Duration::from_millis(400);
            while IsIconic(window.handle) != 0 && Instant::now() < deadline {
                std::thread::sleep(POLL_INTERVAL);
            }
        }
        if GetForegroundWindow() == window.handle && IsIconic(window.handle) == 0 {
            return true;
        }
        SetForegroundWindow(window.handle);
        // Cross-thread activation can complete asynchronously. Read back briefly without
        // repeating SetForegroundWindow or stealing focus again after the one activation.
        let deadline = Instant::now() + Duration::from_millis(400);
        loop {
            if GetForegroundWindow() == window.handle && IsIconic(window.handle) == 0 {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            std::thread::sleep(POLL_INTERVAL);
        }
    }
}

pub(super) fn open_url(url: &tauri::Url, new_window: bool) -> Result<(), String> {
    let browser = default_browser(url.scheme())
        .ok()
        .and_then(|path| std::fs::canonicalize(path).ok());
    let before = browser.as_deref().and_then(browser_windows);
    if let Some(window) = before.as_ref().and_then(|windows| windows.first()) {
        // SAFETY: only a PID whose full executable path matched the default association is granted.
        unsafe {
            AllowSetForegroundWindow(window.process_id);
        }
    }

    let command = browser
        .as_deref()
        .filter(|_| new_window)
        .and_then(|path| new_window_command(path, url));
    let require_new = command.is_some();
    let launched_process = if let Some(mut command) = command {
        let child = command
            .spawn()
            .map_err(|_| "无法新建默认浏览器窗口，请复制链接手动打开".to_string())?;
        if before.as_ref().is_some_and(Vec::is_empty) {
            // SAFETY: this is the browser process just started by this foreground action.
            unsafe {
                AllowSetForegroundWindow(child.id());
            }
        }
        Some(child.id())
    } else {
        // Preserve system handling, including existing-browser preference and association wrappers.
        // This is the only open attempt; failure and activation failure never reopen the URL.
        tauri_plugin_opener::open_url(url.as_str(), None::<&str>)
            .map_err(|_| "无法通过默认浏览器打开链接".to_string())?;
        None
    };

    let (Some(browser), Some(before)) = (browser, before) else {
        return Err(ACTIVATION_UNCONFIRMED.into());
    };
    let started = Instant::now();
    loop {
        let current = browser_windows(&browser).ok_or(ACTIVATION_UNCONFIRMED)?;
        // SAFETY: GetForegroundWindow is a read-only query and accepts no pointer arguments.
        let foreground = unsafe { GetForegroundWindow() };
        if let Some(window) = activation_target(
            &before,
            &current,
            foreground,
            launched_process,
            require_new,
            started.elapsed() >= HANDOFF_WAIT,
        ) {
            return activate_browser_window(window, &browser)
                .then_some(())
                .ok_or_else(|| ACTIVATION_UNCONFIRMED.into());
        }
        if started.elapsed() >= WINDOW_WAIT {
            return Err(ACTIVATION_UNCONFIRMED.into());
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window(handle: usize, process_id: u32) -> BrowserWindow {
        BrowserWindow {
            handle: handle as HWND,
            process_id,
            minimized: false,
        }
    }

    #[test]
    fn new_window_handoff_selects_the_new_window_in_the_existing_process() {
        let before = vec![window(1, 10)];
        let current = vec![before[0].clone(), window(2, 10)];
        let target = activation_target(&before, &current, 1 as HWND, Some(99), true, true).unwrap();
        assert_eq!(target.handle, 2 as HWND);
        assert!(activation_target(&before, &before, 1 as HWND, Some(99), true, true).is_none());
    }

    #[test]
    fn existing_browser_does_not_choose_a_background_title_change_over_the_url_receiver() {
        let before = vec![window(1, 10), window(2, 20)];
        // Window A changes a background page title; B receives the requested URL without a
        // title change. Neither event identifies a target through these public window handles.
        let current = before.clone();
        assert!(
            activation_target(&before, &current, std::ptr::null_mut(), None, false, true).is_none()
        );
        assert_eq!(
            activation_target(&before, &current, 2 as HWND, None, false, true)
                .unwrap()
                .handle,
            2 as HWND
        );
        assert_eq!(
            activation_target(
                &before,
                &current[1..],
                std::ptr::null_mut(),
                None,
                false,
                true
            )
            .unwrap()
            .handle,
            2 as HWND
        );
        assert!(
            activation_target(&before, &current, std::ptr::null_mut(), None, false, false)
                .is_none()
        );
    }

    #[test]
    fn existing_browser_follows_the_unique_window_restored_by_the_system() {
        let mut restored_window = window(2, 20);
        restored_window.minimized = true;
        let before = vec![window(1, 10), restored_window];
        let current = vec![before[0].clone(), window(2, 20)];
        assert_eq!(
            activation_target(&before, &current, std::ptr::null_mut(), None, false, true)
                .unwrap()
                .handle,
            2 as HWND
        );
        assert!(
            activation_target(&before, &current, std::ptr::null_mut(), None, true, true).is_none(),
            "a restored existing window cannot stand in for a requested new window"
        );
    }

    #[test]
    fn multiple_restored_existing_windows_remain_ambiguous() {
        let current = vec![window(1, 10), window(2, 20)];
        let before: Vec<_> = current
            .iter()
            .cloned()
            .map(|mut window| {
                window.minimized = true;
                window
            })
            .collect();
        assert!(
            activation_target(&before, &current, std::ptr::null_mut(), None, false, true).is_none()
        );
        assert_eq!(
            activation_target(&before, &current, 2 as HWND, None, false, true)
                .unwrap()
                .handle,
            2 as HWND,
            "system foreground remains an explicit selection"
        );
    }

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

    #[test]
    #[ignore = "requires a foreground-eligible caller or test-only debugger; opens example.com twice"]
    fn live_browser_new_window_and_minimized_existing_window_are_activated() {
        // A background shell may lack SetForegroundWindow permission. A debugger may provide
        // the documented test-process eligibility; it must not debug the user's browser.
        let url =
            tauri::Url::parse("https://example.com/?fstodo-foreground-check=new-window").unwrap();
        let browser = std::fs::canonicalize(default_browser(url.scheme()).unwrap()).unwrap();
        assert!(
            new_window_command(&browser, &url).is_some(),
            "live check needs a supported new-window browser"
        );
        let before = browser_windows(&browser).unwrap();
        open_url(&url, true).expect(
            "live test needs Windows foreground eligibility; a background task may be denied",
        );
        // SAFETY: these read-only queries use the foreground window returned by Windows.
        let new_handle = unsafe { GetForegroundWindow() };
        let new_window = window_for_browser(new_handle, &browser).unwrap();
        assert!(!before.iter().any(
            |window| window.handle == new_handle && window.process_id == new_window.process_id
        ));
        println!(
            "new-window foreground verified: hwnd={new_handle:?} pid={} image={}; previous browser windows: {}",
            new_window.process_id, browser.display(), before.len()
        );

        // SAFETY: this is only the window just created by this ignored live test, never a user window.
        unsafe {
            ShowWindowAsync(
                new_handle,
                windows_sys::Win32::UI::WindowsAndMessaging::SW_MINIMIZE,
            );
        }
        let deadline = Instant::now() + Duration::from_secs(1);
        while unsafe { IsIconic(new_handle) } == 0 && Instant::now() < deadline {
            std::thread::sleep(POLL_INTERVAL);
        }
        assert_ne!(unsafe { IsIconic(new_handle) }, 0);
        let existing_url =
            tauri::Url::parse("https://example.com/?fstodo-foreground-check=existing-window")
                .unwrap();
        open_url(&existing_url, false).unwrap();
        assert_eq!(unsafe { GetForegroundWindow() }, new_handle);
        assert_eq!(unsafe { IsIconic(new_handle) }, 0);
        assert!(window_for_browser(new_handle, &browser).is_some());
        println!("existing-browser handoff and minimized restore verified: hwnd={new_handle:?} pid={}; test window left open", new_window.process_id);
    }
}
