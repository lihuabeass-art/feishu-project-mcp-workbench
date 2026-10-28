import { useRef, useState } from "react";
import { Select } from "./Select";
import type { SaveFeedback } from "./SettingsSaveStatus";
import {
  loadLinkOpeningMode,
  saveLinkOpeningMode,
  type LinkOpeningMode,
} from "./linkPreferences";

export function LinkSettings({ onFeedback, disabled = false }: {
  onFeedback: (feedback: SaveFeedback | null) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState(loadLinkOpeningMode);
  const feedbackEvent = useRef(0);
  return (
    <section className="link-settings" aria-label="链接打开设置">
      <div className="section-heading">
        <div>
          <h2>链接打开方式</h2>
          <p>使用系统默认浏览器打开。</p>
        </div>
        <Select
          ariaLabel="链接打开方式"
          disabled={disabled}
          value={mode}
          options={[
            { value: "new-window", label: "新窗口" },
            { value: "existing-browser", label: "已有浏览器" },
          ]}
          onChange={(value) => {
            const next = value as LinkOpeningMode;
            try {
              saveLinkOpeningMode(next);
              setMode(next);
              onFeedback({ state: "saved", eventId: ++feedbackEvent.current });
            } catch {
              onFeedback({ state: "failed", message: "链接打开方式保存失败，请重新选择。" });
            }
          }}
        />
      </div>
      <p className="hint">
        {mode === "new-window"
          ? "新建浏览器窗口，方便在当前桌面查看。"
          : "优先在已有浏览器中打开，窗口和标签位置由浏览器决定。"}
      </p>
    </section>
  );
}
