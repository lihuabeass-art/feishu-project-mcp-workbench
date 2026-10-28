//! 完整模式与清单模式共用主窗口。切换时由这里改变窗口外框、尺寸与置顶，
//! 两种模式的位置和尺寸分别保存在应用配置目录，启动时在显示窗口前恢复。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewWindow};

const FILE_NAME: &str = "display-mode.json";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    #[default]
    Full,
    Compact,
}

struct Spec {
    width: f64,
    height: f64,
    min_width: f64,
    min_height: f64,
}

impl Mode {
    fn spec(self) -> Spec {
        match self {
            Mode::Full => Spec { width: 1240.0, height: 800.0, min_width: 760.0, min_height: 580.0 },
            Mode::Compact => Spec { width: 360.0, height: 640.0, min_width: 300.0, min_height: 400.0 },
        }
    }
}

/// 位置使用物理像素（多显示器坐标系一致），尺寸使用逻辑像素（跟随缩放比例）。
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
struct Geometry {
    x: i32,
    y: i32,
    width: f64,
    height: f64,
}

#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
struct Stored {
    #[serde(default)]
    mode: Mode,
    #[serde(default)]
    full: Option<Geometry>,
    #[serde(default)]
    full_maximized: bool,
    #[serde(default)]
    compact: Option<Geometry>,
    /// 未记录时按首次进入清单模式处理，默认置顶。
    #[serde(default)]
    pinned: Option<bool>,
}

impl Stored {
    fn pinned(&self) -> bool {
        self.pinned.unwrap_or(true)
    }

    fn remember(&mut self, mode: Mode, current: Option<Geometry>, maximized: bool) {
        match mode {
            Mode::Full => {
                self.full_maximized = maximized;
                if current.is_some() {
                    self.full = current;
                }
            }
            Mode::Compact => {
                if current.is_some() {
                    self.compact = current;
                }
            }
        }
    }

    fn geometry(&self, mode: Mode) -> Option<Geometry> {
        match mode {
            Mode::Full => self.full,
            Mode::Compact => self.compact,
        }
    }
}

pub struct DisplayModeStore {
    path: Option<PathBuf>,
    stored: Mutex<Stored>,
}

impl DisplayModeStore {
    fn save(&self, stored: &Stored) -> Option<String> {
        let path = self.path.as_ref()?;
        let write = || -> std::io::Result<()> {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(path, serde_json::to_vec_pretty(stored)?)
        };
        write().err().map(|error| error.to_string())
    }
}

#[derive(Serialize)]
pub struct DisplayState {
    mode: Mode,
    pinned: bool,
    /// 窗口已切换但设置未能写入本机时的说明；重启后可能恢复原设置。
    warning: Option<String>,
}

fn message(error: tauri::Error) -> String {
    error.to_string()
}

fn capture(window: &WebviewWindow) -> tauri::Result<Option<Geometry>> {
    if window.is_maximized()? || window.is_minimized()? {
        return Ok(None);
    }
    let scale = window.scale_factor()?;
    let position = window.outer_position()?;
    let size = window.inner_size()?.to_logical::<f64>(scale);
    Ok(Some(Geometry { x: position.x, y: position.y, width: size.width, height: size.height }))
}

/// 以标题栏左侧一点判断：显示器拔掉后，记录的位置可能已不在任何屏幕上。
fn title_point_visible(geometry: &Geometry, monitors: &[(i32, i32, u32, u32)]) -> bool {
    let (x, y) = (geometry.x.saturating_add(48), geometry.y.saturating_add(16));
    monitors.iter().any(|&(left, top, width, height)| {
        x >= left && y >= top && i64::from(x) < i64::from(left) + i64::from(width)
            && i64::from(y) < i64::from(top) + i64::from(height)
    })
}

fn on_screen(window: &WebviewWindow, geometry: &Geometry) -> bool {
    let monitors = window.available_monitors().unwrap_or_default();
    let rects: Vec<_> = monitors
        .iter()
        .map(|m| (m.position().x, m.position().y, m.size().width, m.size().height))
        .collect();
    title_point_visible(geometry, &rects)
}

/// 没有清单模式记录时保持原窗口右上角不动，切换前后视线落点一致。
fn anchored_position(anchor: &Geometry, outer_width: i32, width: f64, scale: f64) -> (i32, i32) {
    let target = (width * scale).round() as i32;
    (anchor.x.saturating_add(outer_width).saturating_sub(target), anchor.y)
}

fn apply(
    window: &WebviewWindow,
    mode: Mode,
    target: Option<Geometry>,
    pinned: bool,
    maximize: bool,
) -> tauri::Result<()> {
    let spec = mode.spec();
    let anchor = capture(window)?;
    let outer_width = window.outer_size()?.width as i32;
    if window.is_maximized()? {
        window.unmaximize()?;
    }
    window.set_decorations(mode == Mode::Full)?;
    window.set_min_size(Some(LogicalSize::new(spec.min_width, spec.min_height)))?;
    let (width, height) = target
        .map(|g| (g.width.max(spec.min_width), g.height.max(spec.min_height)))
        .unwrap_or((spec.width, spec.height));
    window.set_size(LogicalSize::new(width, height))?;
    match (target, anchor, mode) {
        (Some(g), _, _) => window.set_position(PhysicalPosition::new(g.x, g.y))?,
        (None, Some(a), Mode::Compact) => {
            let (x, y) = anchored_position(&a, outer_width, width, window.scale_factor()?);
            window.set_position(PhysicalPosition::new(x, y))?;
        }
        _ => window.center()?,
    }
    window.set_always_on_top(mode == Mode::Compact && pinned)?;
    if maximize {
        window.maximize()?;
    }
    Ok(())
}

/// 在 setup 中调用：隐藏状态下恢复上次的模式，再由 ThemeProvider 恢复配色后显示。
pub fn restore(app: &tauri::App) {
    let path = app.path().app_config_dir().ok().map(|dir| dir.join(FILE_NAME));
    let stored = path
        .as_ref()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|bytes| serde_json::from_slice::<Stored>(&bytes).ok())
        .unwrap_or_default();
    if let Some(window) = app.get_webview_window("main") {
        let mode = stored.mode;
        let target = stored.geometry(mode).filter(|g| on_screen(&window, g));
        // 完整模式没有记录时保留配置里的默认尺寸与居中。启动时不恢复最大化：
        // Windows 上最大化会直接显示窗口，抢在前端同步原生配色之前。
        if mode == Mode::Compact || target.is_some() {
            let _ = apply(&window, mode, target, stored.pinned(), false);
        }
    }
    app.manage(DisplayModeStore { path, stored: Mutex::new(stored) });
}

/// 关闭窗口前记下当前模式的位置与尺寸。命令持锁期间会等待主线程，这里只能 try_lock。
pub fn remember_on_close(app: &AppHandle, label: &str) {
    let Some(window) = app.get_webview_window(label) else { return };
    let store = app.state::<DisplayModeStore>();
    let Ok(mut stored) = store.stored.try_lock() else { return };
    let maximized = window.is_maximized().unwrap_or(false);
    let current = capture(&window).ok().flatten();
    let mode = stored.mode;
    stored.remember(mode, current, maximized);
    let _ = store.save(&stored);
}

/// 切换命令持锁时会等待主线程，读取命令也不能在主线程上等锁。
#[tauri::command]
pub async fn get_display_mode(store: tauri::State<'_, DisplayModeStore>) -> Result<DisplayState, String> {
    let stored = store.stored.lock().map_err(|_| "窗口设置暂不可用，请重启应用".to_string())?;
    Ok(DisplayState { mode: stored.mode, pinned: stored.pinned(), warning: None })
}

#[tauri::command]
pub async fn set_display_mode(
    window: WebviewWindow,
    store: tauri::State<'_, DisplayModeStore>,
    mode: Mode,
) -> Result<DisplayState, String> {
    let mut stored = store.stored.lock().map_err(|_| "窗口设置暂不可用，请重启应用".to_string())?;
    if stored.mode != mode {
        let maximized = window.is_maximized().map_err(message)?;
        let current = capture(&window).map_err(message)?;
        let previous = stored.mode;
        stored.remember(previous, current, maximized);
    }
    let target = stored.geometry(mode).filter(|g| on_screen(&window, g));
    let maximize = mode == Mode::Full && stored.full_maximized;
    apply(&window, mode, target, stored.pinned(), maximize).map_err(message)?;
    stored.mode = mode;
    let warning = store.save(&stored);
    Ok(DisplayState { mode, pinned: stored.pinned(), warning })
}

#[tauri::command]
pub async fn set_compact_pinned(
    window: WebviewWindow,
    store: tauri::State<'_, DisplayModeStore>,
    pinned: bool,
) -> Result<DisplayState, String> {
    let mut stored = store.stored.lock().map_err(|_| "窗口设置暂不可用，请重启应用".to_string())?;
    if stored.mode == Mode::Compact {
        window.set_always_on_top(pinned).map_err(message)?;
    }
    stored.pinned = Some(pinned);
    let warning = store.save(&stored);
    Ok(DisplayState { mode: stored.mode, pinned, warning })
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WindowAction {
    Drag,
    Minimize,
    Close,
}

/// 清单模式隐藏了系统标题栏，拖动、最小化和关闭改由自绘标题栏触发。
#[tauri::command]
pub fn window_action(window: WebviewWindow, action: WindowAction) -> Result<(), String> {
    match action {
        WindowAction::Drag => window.start_dragging(),
        WindowAction::Minimize => window.minimize(),
        WindowAction::Close => window.close(),
    }
    .map_err(message)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: (i32, i32, u32, u32) = (0, 0, 1920, 1080);

    fn geometry(x: i32, y: i32) -> Geometry {
        Geometry { x, y, width: 360.0, height: 640.0 }
    }

    #[test]
    fn remembers_each_mode_separately_and_keeps_old_geometry_when_maximized() {
        let mut stored = Stored::default();
        stored.remember(Mode::Full, Some(geometry(10, 20)), false);
        stored.remember(Mode::Compact, Some(geometry(1500, 40)), false);
        assert_eq!(stored.geometry(Mode::Full), Some(geometry(10, 20)));
        assert_eq!(stored.geometry(Mode::Compact), Some(geometry(1500, 40)));
        stored.remember(Mode::Full, None, true);
        assert!(stored.full_maximized);
        assert_eq!(stored.geometry(Mode::Full), Some(geometry(10, 20)));
    }

    #[test]
    fn first_compact_entry_defaults_to_pinned_and_later_choice_wins() {
        let mut stored = Stored::default();
        assert!(stored.pinned());
        stored.pinned = Some(false);
        let restored: Stored = serde_json::from_slice(&serde_json::to_vec(&stored).unwrap()).unwrap();
        assert!(!restored.pinned());
    }

    #[test]
    fn older_or_partial_files_fall_back_to_full_mode() {
        let stored: Stored = serde_json::from_str("{}").unwrap();
        assert_eq!(stored, Stored::default());
        let compact: Stored = serde_json::from_str(r#"{"mode":"compact"}"#).unwrap();
        assert_eq!(compact.mode, Mode::Compact);
        assert_eq!(compact.compact, None);
    }

    #[test]
    fn geometry_on_a_disconnected_monitor_is_ignored() {
        assert!(title_point_visible(&geometry(1500, 40), &[SCREEN]));
        assert!(!title_point_visible(&geometry(2400, 40), &[SCREEN]));
        assert!(title_point_visible(&geometry(-1800, 40), &[(-1920, 0, 1920, 1080), SCREEN]));
    }

    #[test]
    fn compact_window_keeps_the_previous_top_right_corner() {
        let full = Geometry { x: 300, y: 100, width: 1240.0, height: 800.0 };
        assert_eq!(anchored_position(&full, 1240, 360.0, 1.0), (1180, 100));
        assert_eq!(anchored_position(&full, 1860, 360.0, 1.5), (1620, 100));
    }
}
