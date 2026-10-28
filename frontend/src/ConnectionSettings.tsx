import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectionSettings as Settings } from "./types";
import type { SaveFeedback } from "./SettingsSaveStatus";

const toDraft = (settings: Settings) => ({
  endpoint: settings.endpoint,
});

export function ConnectionSettings({
  settings,
  disabled,
  save,
  onFeedback,
  onUnsavedChange,
}: {
  settings: Settings;
  disabled: boolean;
  save: (settings: Settings) => Promise<boolean>;
  onFeedback: (feedback: SaveFeedback | null) => void;
  onUnsavedChange?: (unsaved: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(settings));
  const saveRef = useRef(save);
  saveRef.current = save;
  const attempted = useRef("");
  useEffect(() => {
    setDraft(toDraft(settings));
  }, [settings.endpoint]);
  const input = useMemo<Settings>(
    () => ({
      endpoint: draft.endpoint.trim(),
    }),
    [draft],
  );
  const changed = (Object.keys(input) as (keyof Settings)[]).some(
    (key) => input[key] !== settings[key],
  );
  const unsavedListener = useRef(onUnsavedChange);
  unsavedListener.current = onUnsavedChange;
  useEffect(() => {
    onUnsavedChange?.(changed);
  }, [changed, onUnsavedChange]);
  useEffect(() => () => unsavedListener.current?.(false), []);
  const valid = (() => {
    try {
      if (new URL(input.endpoint).protocol !== "https:") return false;
    } catch {
      return false;
    }
    return true;
  })();
  const persist = useCallback(() => {
    const signature = JSON.stringify(input);
    if (disabled || !changed || !valid || attempted.current === signature)
      return;
    attempted.current = signature;
    void saveRef.current(input);
  }, [input, disabled, changed, valid, onFeedback]);
  useEffect(() => {
    if (!changed) {
      if (!attempted.current) onFeedback(null);
      return;
    }
    if (disabled || attempted.current === JSON.stringify(input)) return;
    onFeedback(
      valid
        ? { state: "waiting" }
        : {
            state: "invalid",
            message: "请填写有效的 HTTPS 地址，填写完成后自动保存。",
          },
    );
    const timer = window.setTimeout(persist, 600);
    return () => window.clearTimeout(timer);
  }, [persist, changed, disabled, input, valid, onFeedback]);
  const update = (key: string, value: string) => {
    attempted.current = "";
    setDraft((previous) => ({ ...previous, [key]: value }));
  };
  return (
    <form
      className="connection-settings"
      aria-label="应用配置"
      onSubmit={(event) => {
        event.preventDefault();
        persist();
      }}
      onBlur={persist}
    >
      <div className="section-heading">
        <h2>应用配置</h2>
      </div>
      <fieldset disabled={disabled}>
        <div className="configuration-grid">
          <label className="configuration-wide">
            MCP 服务地址
            <input
              aria-label="MCP 服务地址"
              type="url"
              required
              value={draft.endpoint}
              onChange={(e) => update("endpoint", e.target.value)}
            />
            <small>使用 HTTPS 地址。</small>
          </label>
        </div>
      </fieldset>
    </form>
  );
}
