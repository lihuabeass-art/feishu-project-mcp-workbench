import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CircleAlert } from "lucide-react";
import type { SaveFeedback } from "./SettingsSaveStatus";
import { useScrollIsolation } from "./useScrollIsolation";
import {
  saveWorkflowSkipConfirmation,
  useWorkflowSkipConfirmation,
} from "./workflowPreferences";
import "./WorkflowSettings.css";

export function WorkflowSettings({
  disabled = false,
  onFeedback,
}: {
  disabled?: boolean;
  onFeedback?: (feedback: SaveFeedback | null) => void;
}) {
  const id = useId();
  const enabled = useWorkflowSkipConfirmation();
  const [confirming, setConfirming] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const toggle = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const isolationRef = useScrollIsolation();

  useEffect(() => {
    if (!confirming || !dialog.current) return;
    const element = dialog.current;
    element.showModal();
    cancel.current?.focus();
    return () => {
      element.close();
      toggle.current?.focus();
    };
  }, [confirming]);

  useEffect(() => {
    if (disabled || enabled) setConfirming(false);
  }, [disabled, enabled]);

  function change(next: boolean) {
    if (disabled) return;
    try {
      saveWorkflowSkipConfirmation(next);
      setError("");
      setConfirming(false);
      onFeedback?.({ state: "saved" });
    } catch {
      const message = "流程二次确认偏好未能保存，请重试。";
      setError(message);
      onFeedback?.({ state: "failed", message });
    }
  }

  return (
    <section className="link-settings" aria-label="流程操作设置">
      <div className="section-heading">
        <h2>流程操作</h2>
      </div>
      <label className="desktop-setting-row">
        <span className="desktop-setting-copy">
          <span className="desktop-setting-title" id={`${id}-title`}>
            关闭流程操作二次确认
          </span>
          <span
            className="desktop-setting-description"
            id={`${id}-description`}
          >
            默认保留二次确认。开启后，完成节点、回滚节点、状态流转以及仅同步进度和日期将直接提交；新建表单仍需核对。此设置仅在本机生效。
          </span>
        </span>
        <span className="settings-switch">
          <input
            ref={toggle}
            type="checkbox"
            role="switch"
            checked={enabled}
            disabled={disabled}
            aria-labelledby={`${id}-title`}
            aria-describedby={`${id}-description`}
            onChange={(event) => {
              setError("");
              if (event.target.checked) {
                setAcknowledged(false);
                setConfirming(true);
              } else change(false);
            }}
          />
          <span className="settings-switch-track" aria-hidden="true" />
        </span>
      </label>
      {!confirming && error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {confirming &&
        createPortal(
          <dialog
            ref={dialog}
            className="workflow-confirmation-dialog"
            aria-labelledby={`${id}-confirm-title`}
            aria-describedby={`${id}-risk`}
            onCancel={(event) => {
              event.preventDefault();
              setConfirming(false);
            }}
            onClose={() => setConfirming(false)}
            onClick={(event) => {
              if (event.target === event.currentTarget) setConfirming(false);
            }}
          >
            <div
              ref={isolationRef}
              className="workflow-confirmation-overlay scroll-isolation-boundary"
              onClick={(event) => {
                if (event.target === event.currentTarget) setConfirming(false);
              }}
            >
              <div className="workflow-confirmation-content">
                <div className="workflow-confirmation-heading">
                  <CircleAlert size={22} aria-hidden="true" />
                  <h2 id={`${id}-confirm-title`}>关闭前，请三思</h2>
                </div>
                <p id={`${id}-risk`}>
                  开启后，完成节点、回滚节点、状态流转以及仅同步进度和日期在提交时将直接执行，不再展示最终字段值供你二次核对。部分操作可能无法撤回或再次修改。
                </p>
                <p>
                  新建表单的二次确认始终保留。你可以随时关闭此开关，恢复流程操作的二次确认。
                </p>
                <button
                  type="button"
                  className="workflow-acknowledge"
                  aria-pressed={acknowledged}
                  onClick={() => setAcknowledged((value) => !value)}
                >
                  <span className="workflow-acknowledge-box" aria-hidden="true">
                    {acknowledged && <Check size={12} strokeWidth={3} />}
                  </span>
                  我已了解风险，仍要关闭流程操作二次确认
                </button>
                {error && (
                  <p className="error-text" role="alert">
                    {error}
                  </p>
                )}
                <div className="workflow-confirmation-actions">
                  <button
                    ref={cancel}
                    type="button"
                    className="secondary"
                    onClick={() => setConfirming(false)}
                  >
                    保留二次确认
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={disabled || !acknowledged}
                    onClick={() => change(true)}
                  >
                    仍要关闭
                  </button>
                </div>
              </div>
            </div>
          </dialog>,
          document.body,
        )}
    </section>
  );
}
