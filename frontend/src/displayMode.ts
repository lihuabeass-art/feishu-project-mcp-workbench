import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

export type DisplayMode = "full" | "compact";
export type WindowAction = "drag" | "minimize" | "close";
type DisplayState = { mode: DisplayMode; pinned: boolean; warning: string | null };

// 浏览器预览没有窗口可改，只切换布局；桌面端由 Rust 保存模式、置顶与两种模式各自的窗口位置。
const previewKey = "fstodo.display-mode.v1";

function loadPreview(): { mode: DisplayMode; pinned: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(previewKey) || "{}");
    return { mode: saved.mode === "compact" ? "compact" : "full", pinned: saved.pinned !== false };
  } catch {
    return { mode: "full", pinned: true };
  }
}

function savePreview(state: { mode: DisplayMode; pinned: boolean }) {
  try {
    localStorage.setItem(previewKey, JSON.stringify(state));
  } catch {
    /* 预览环境不保存也不影响本次切换。 */
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const unsaved = "本次切换已生效，但窗口设置未能保存在本机；重启后可能恢复原设置。";

export function useDisplayMode(onError: (message: string) => void) {
  const desktop = isTauri();
  const [state, setState] = useState(() => (desktop ? { mode: "full" as DisplayMode, pinned: true } : loadPreview()));
  const [ready, setReady] = useState(!desktop);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const initial = useRef<Promise<DisplayState> | null>(null);
  const report = useRef(onError);
  report.current = onError;

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    // StrictMode 重放 effect 时共用同一次读取。
    initial.current ??= invoke<DisplayState>("get_display_mode");
    initial.current
      .then((actual) => {
        if (active) setState({ mode: actual.mode, pinned: actual.pinned });
      })
      .catch((failure: unknown) => {
        if (active) report.current(`未能读取显示模式：${message(failure)}`);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [desktop]);

  async function change(mode: DisplayMode) {
    if (inFlight.current || mode === state.mode) return;
    if (!desktop) {
      setState((current) => {
        const next = { ...current, mode };
        savePreview(next);
        return next;
      });
      return;
    }
    const previous = state.mode;
    inFlight.current = true;
    setBusy(true);
    // 进入清单先换布局再缩窗口，回到完整模式先放大窗口再换布局，避免布局在不合适的尺寸里挤压。
    if (mode === "compact") setState((current) => ({ ...current, mode }));
    try {
      const actual = await invoke<DisplayState>("set_display_mode", { mode });
      setState({ mode: actual.mode, pinned: actual.pinned });
      if (actual.warning) report.current(`${unsaved}（${actual.warning}）`);
    } catch (failure) {
      setState((current) => ({ ...current, mode: previous }));
      report.current(`显示模式切换失败：${message(failure)}`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function pin(pinned: boolean) {
    if (inFlight.current) return;
    if (!desktop) {
      setState((current) => {
        const next = { ...current, pinned };
        savePreview(next);
        return next;
      });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setState((current) => ({ ...current, pinned }));
    try {
      const actual = await invoke<DisplayState>("set_compact_pinned", { pinned });
      setState({ mode: actual.mode, pinned: actual.pinned });
      if (actual.warning) report.current(`${unsaved}（${actual.warning}）`);
    } catch (failure) {
      setState((current) => ({ ...current, pinned: !pinned }));
      report.current(`窗口置顶设置失败：${message(failure)}`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function windowAction(action: WindowAction) {
    if (!desktop) return;
    try {
      await invoke("window_action", { action });
    } catch (failure) {
      report.current(message(failure));
    }
  }

  return {
    desktop,
    mode: state.mode,
    pinned: state.pinned,
    ready,
    busy,
    change: (mode: DisplayMode) => void change(mode),
    pin: (pinned: boolean) => void pin(pinned),
    windowAction: (action: WindowAction) => void windowAction(action),
  };
}
