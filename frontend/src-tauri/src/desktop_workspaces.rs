//! One command, with native implementations kept behind platform gates.
//! Windows pinning uses winvd's private Shell COM bindings (Windows 11 24H2+).
//! macOS uses Tauri's NSWindow collection behavior for ordinary desktop Spaces.

#[tauri::command]
pub async fn set_follow_virtual_desktop(
    window: tauri::WebviewWindow,
    enabled: bool,
) -> Result<bool, String> {
    #[cfg(windows)]
    {
        // Keep the HWND lookup and winvd's thread-local COM objects on one worker.
        tauri::async_runtime::spawn_blocking(move || set_windows(&window, enabled))
            .await
            .map_err(|_| "虚拟桌面设置任务中断，请重试".to_string())?
    }
    #[cfg(target_os = "macos")]
    {
        window
            .set_visible_on_all_workspaces(enabled)
            .map_err(|error| format!("无法设置桌面跟随：{error}"))?;
        Ok(enabled)
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = (window, enabled);
        Err("当前平台暂不支持跟随虚拟桌面".into())
    }
}

#[cfg(windows)]
fn set_windows(window: &tauri::WebviewWindow, enabled: bool) -> Result<bool, String> {
    let handle = window
        .hwnd()
        .map_err(|error| format!("无法取得窗口句柄：{error}"))?;
    // Tauri and winvd use different windows crate versions; only pass the HWND.
    let handle = windows::Win32::Foundation::HWND(handle.0);
    set_windows_handle(handle, enabled)
}

#[cfg(windows)]
fn set_windows_handle(
    handle: windows::Win32::Foundation::HWND,
    enabled: bool,
) -> Result<bool, String> {
    use std::time::{Duration, Instant};
    use windows::Win32::UI::WindowsAndMessaging::IsWindowVisible;

    let deadline = Instant::now() + Duration::from_secs(5);
    let mut wait = || {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return false;
        }
        std::thread::sleep(remaining.min(Duration::from_millis(100)));
        true
    };
    // The webview can invoke this while ThemeProvider still keeps the window hidden.
    // Even after show(), Explorer may need time to register its application view.
    retry_window_not_found(
        || {
            if !unsafe { IsWindowVisible(handle) }.as_bool() {
                return Err(winvd::Error::WindowNotFound);
            }
            if enabled {
                winvd::pin_window(handle)
            } else {
                winvd::unpin_window(handle)
            }
        },
        &mut wait,
    )
    .map_err(windows_error_message)?;
    // A delayed read must not repeat the write. Both phases share the same deadline.
    let actual = retry_window_not_found(|| winvd::is_pinned_window(handle), &mut wait)
        .map_err(windows_error_message)?;
    if actual != enabled {
        return Err("系统尚未应用桌面跟随设置，请重试".into());
    }
    Ok(actual)
}

#[cfg(windows)]
fn retry_window_not_found<T>(
    mut action: impl FnMut() -> winvd::Result<T>,
    mut wait: impl FnMut() -> bool,
) -> winvd::Result<T> {
    loop {
        match action() {
            Err(winvd::Error::WindowNotFound) if wait() => continue,
            result => return result,
        }
    }
}

#[cfg(windows)]
fn windows_error_message(error: winvd::Error) -> String {
    match error {
        winvd::Error::WindowNotFound =>
            "Windows 尚未识别 FSTODO 窗口，未能应用桌面跟随设置，请稍后重试。".into(),
        _ => format!(
            "无法确认桌面跟随状态：{error:?}。此功能需要 Windows 11 24H2（26100.2605）及以上，请重试"
        ),
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::{retry_window_not_found, set_windows_handle, windows_error_message};
    use std::time::{Duration, Instant};
    use windows::core::w;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DestroyWindow, DispatchMessageW, PeekMessageW, ShowWindow, MSG, PM_REMOVE,
        SW_SHOWNOACTIVATE, WS_EX_APPWINDOW, WS_OVERLAPPEDWINDOW, WS_VISIBLE,
    };

    #[test]
    fn waits_for_explorer_to_register_the_window() {
        let mut results = [
            Err(winvd::Error::WindowNotFound),
            Err(winvd::Error::WindowNotFound),
            Ok(true),
        ]
        .into_iter();
        let mut waits = 0;
        let result = retry_window_not_found(
            || results.next().expect("unexpected extra attempt"),
            || {
                waits += 1;
                true
            },
        );
        assert_eq!(result, Ok(true));
        assert_eq!(waits, 2);
    }

    #[test]
    fn stops_waiting_when_the_window_does_not_become_ready() {
        let mut attempts = 0;
        let mut waits = 0;
        let result = retry_window_not_found::<()>(
            || {
                attempts += 1;
                Err(winvd::Error::WindowNotFound)
            },
            || {
                waits += 1;
                waits < 3
            },
        );
        assert_eq!(result, Err(winvd::Error::WindowNotFound));
        assert_eq!(attempts, 3);
        let message = windows_error_message(result.unwrap_err());
        assert!(message.contains("请稍后重试"));
        assert!(!message.contains("24H2"));
    }

    #[test]
    fn does_not_delay_or_hide_other_system_errors() {
        for error in [
            winvd::Error::ClassNotRegistered,
            winvd::Error::RpcServerNotAvailable,
        ] {
            let result = retry_window_not_found::<()>(
                || Err(error.clone()),
                || panic!("only WindowNotFound may wait"),
            );
            assert_eq!(result, Err(error));
        }
    }

    struct TestWindow(HWND);
    impl Drop for TestWindow {
        fn drop(&mut self) {
            // This window was created on this test thread and is never shared.
            let _ = unsafe { DestroyWindow(self.0) };
        }
    }

    fn pump_messages() {
        let mut message = MSG::default();
        while unsafe { PeekMessageW(&mut message, None, 0, 0, PM_REMOVE) }.as_bool() {
            unsafe { DispatchMessageW(&message) };
        }
        std::thread::sleep(Duration::from_millis(10));
    }

    #[test]
    #[ignore = "creates temporary native windows; requires an interactive Windows 11 desktop"]
    fn startup_waits_for_a_hidden_window_before_applying_either_preference() {
        for enabled in [true, false] {
            let window = TestWindow(
                unsafe {
                    CreateWindowExW(
                        WS_EX_APPWINDOW,
                        w!("STATIC"),
                        w!("FSTODO delayed-show verification"),
                        WS_OVERLAPPEDWINDOW,
                        40,
                        40,
                        320,
                        100,
                        None,
                        None,
                        None,
                        None,
                    )
                }
                .expect("create hidden verification window"),
            );
            let handle = window.0 .0 as usize;
            let worker =
                std::thread::spawn(move || set_windows_handle(HWND(handle as *mut _), enabled));
            let show_at = Instant::now() + Duration::from_millis(250);
            while Instant::now() < show_at {
                pump_messages();
            }
            let finished_while_hidden = worker.is_finished();
            let _ = unsafe { ShowWindow(window.0, SW_SHOWNOACTIVATE) };
            while !worker.is_finished() {
                pump_messages();
            }
            let result = worker.join().expect("desktop-follow worker panicked");
            assert!(
                !finished_while_hidden,
                "must wait until the window is shown"
            );
            assert_eq!(result, Ok(enabled));
            assert_eq!(winvd::is_pinned_window(window.0), Ok(enabled));
            assert_eq!(set_windows_handle(window.0, false), Ok(false));
        }
    }

    #[test]
    #[ignore = "creates a temporary native window; requires an interactive Windows 11 desktop"]
    fn native_window_can_be_pinned_and_unpinned() {
        // STATIC is a system window class; no application WndProc is needed.
        let window = TestWindow(
            unsafe {
                CreateWindowExW(
                    WS_EX_APPWINDOW,
                    w!("STATIC"),
                    w!("FSTODO desktop-follow verification"),
                    WS_OVERLAPPEDWINDOW | WS_VISIBLE,
                    40,
                    40,
                    320,
                    100,
                    None,
                    None,
                    None,
                    None,
                )
            }
            .expect("create verification window"),
        );
        // Give Explorer time to register an application view for the new window.
        for _ in 0..20 {
            let mut message = MSG::default();
            while unsafe { PeekMessageW(&mut message, None, 0, 0, PM_REMOVE) }.as_bool() {
                unsafe { DispatchMessageW(&message) };
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        assert_eq!(set_windows_handle(window.0, true), Ok(true));
        assert_eq!(winvd::is_pinned_window(window.0), Ok(true));
        assert_eq!(set_windows_handle(window.0, false), Ok(false));
        assert_eq!(winvd::is_pinned_window(window.0), Ok(false));
    }
}
