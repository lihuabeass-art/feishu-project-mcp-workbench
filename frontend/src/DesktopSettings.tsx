import { useEffect, useId, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { SaveFeedback } from "./SettingsSaveStatus";

const preferenceKey = "fstodo.follow-virtual-desktop.v1";

function loadPreference() {
  try {
    return localStorage.getItem(preferenceKey) !== "false";
  } catch {
    return true;
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

// Mounted in App so restoration runs even when the settings page is closed.
export function useDesktopSettings() {
  const desktop = isTauri();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(desktop);
  const [error, setError] = useState("");
  const initialRequest = useRef<Promise<boolean> | null>(null);
  const lastRequest = useRef({ enabled: loadPreference(), persist: false });
  const inFlight = useRef(desktop);

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    // Share the request across React StrictMode's effect setup/cleanup replay.
    initialRequest.current ??= invoke<boolean>("set_follow_virtual_desktop", {
      enabled: lastRequest.current.enabled,
    });
    initialRequest.current
      .then((actual) => {
        if (active) setEnabled(actual);
      })
      .catch((failure: unknown) => {
        if (active) setError(message(failure));
      })
      .finally(() => {
        if (active) {
          inFlight.current = false;
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [desktop]);

  async function apply(next: boolean, persist = true) {
    if (!desktop || inFlight.current) return;
    inFlight.current = true;
    lastRequest.current = { enabled: next, persist };
    setBusy(true);
    setError("");
    try {
      const actual = await invoke<boolean>("set_follow_virtual_desktop", {
        enabled: next,
      });
      setEnabled(actual);
      if (persist) {
        try {
          localStorage.setItem(preferenceKey, String(actual));
        } catch {
          setError("本次设置已生效，但未能保存在本机；重启后可能恢复原设置，请重试。");
        }
      }
    } catch (failure) {
      setError(message(failure));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return {
    desktop,
    enabled,
    busy,
    error,
    change: (next: boolean) => void apply(next),
    retry: () =>
      void apply(lastRequest.current.enabled, lastRequest.current.persist),
  };
}

export function DesktopSettings({
  settings,
  onFeedback,
}: {
  settings: ReturnType<typeof useDesktopSettings>;
  onFeedback?: (feedback: SaveFeedback | null) => void;
}) {
  const settingId = useId();
  const applied = useRef(false);
  const retryRef = useRef(settings.retry);
  retryRef.current = settings.retry;
  useEffect(() => {
    if (!onFeedback) return;
    if (settings.error) {
      onFeedback({
        state: "failed",
        message: settings.error,
        retry: () => {
          applied.current = true;
          onFeedback({ state: "saving" });
          retryRef.current();
        },
      });
    } else if (applied.current) {
      onFeedback({ state: settings.busy ? "saving" : "saved" });
    }
  }, [settings.busy, settings.error, onFeedback]);
  return (
    <section className="link-settings" aria-label="窗口设置">
      <div className="section-heading">
        <div>
          <h2>窗口与桌面</h2>
        </div>
      </div>
      <label className="desktop-setting-row">
        <span className="desktop-setting-copy">
          <span className="desktop-setting-title" id={`${settingId}-title`}>
            跟随虚拟桌面
          </span>
          <span className="desktop-setting-description" id={`${settingId}-description`}>
            {settings.desktop
              ? "开启后，FSTODO 主窗口会显示在所有虚拟桌面（macOS 的 Space）上。"
              : "浏览器预览无法设置窗口行为，请在桌面应用中使用。"}
          </span>
        </span>
        <span className="settings-switch">
          <input
            type="checkbox"
            role="switch"
            aria-labelledby={`${settingId}-title`}
            aria-describedby={`${settingId}-description`}
            checked={settings.enabled}
            disabled={!settings.desktop || settings.busy}
            onChange={(event) => {
              applied.current = true;
              onFeedback?.({ state: "saving" });
              settings.change(event.target.checked);
            }}
          />
          <span className="settings-switch-track" aria-hidden="true" />
        </span>
      </label>
      {!onFeedback && settings.busy && <p className="hint" role="status">正在应用窗口设置…</p>}
      {!onFeedback && settings.error && (
        <div>
          <p className="error-text" role="alert">{settings.error}</p>
          <button
            className="secondary"
            disabled={settings.busy}
            onClick={settings.retry}
          >
            重试窗口设置
          </button>
        </div>
      )}
    </section>
  );
}
