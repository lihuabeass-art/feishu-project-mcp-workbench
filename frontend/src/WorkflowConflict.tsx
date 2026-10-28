import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpToLine,
  Check,
  CircleAlert,
  Copy,
  Eye,
  RotateCcw,
} from "lucide-react";
import { formatPercentage } from "./percentage";
import type { WorkflowAction } from "./types";

async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // 部分桌面 WebView 不提供 Clipboard API，沿用系统复制操作。
  }
  const active = document.activeElement;
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("aria-hidden", "true");
  input.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(input);
  try {
    input.select();
    if (!document.execCommand?.("copy")) throw new Error("copy failed");
  } finally {
    input.remove();
    if (active instanceof HTMLElement) active.focus({ preventScroll: true });
  }
}

export function displayFieldValue(
  field: WorkflowAction["fields"][number],
  text: string,
) {
  return (
    field.options?.find((o) => o.value === text)?.label ||
    (text && field.unit === "percent" ? formatPercentage(text) : text)
  );
}

export function WorkflowConflict({
  field,
  remote,
  value,
  conflict = true,
  disabled = false,
  caption,
  onRestore,
}: {
  field: WorkflowAction["fields"][number];
  remote: string;
  value: string;
  conflict?: boolean;
  disabled?: boolean;
  /** 负责人表格中提示移出单元格时，用于标明所属列。 */
  caption?: string;
  onRestore?: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<"" | "copied" | "failed">("");
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const mounted = useRef(false);
  const remoteRef = useRef(remote);
  remoteRef.current = remote;
  const tooltipId = useId();
  const explanationId = useId();
  const display = (text: string) => displayFieldValue(field, text) || "（空）";
  const trimmed = value.trim();
  const invalidOption =
    field.kind === "select" &&
    !!trimmed &&
    !field.options?.some((option) => option.value === trimmed);
  const invalid =
    invalidOption ||
    (field.required && !trimmed) ||
    (field.kind === "number" &&
      !!trimmed &&
      (!Number.isFinite(Number(trimmed)) ||
        (field.min !== undefined && Number(trimmed) < field.min) ||
        (field.max !== undefined && Number(trimmed) > field.max)));
  const preview = trimmed || remote;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(closeTimer.current);
    };
  }, []);
  useEffect(() => setCopyStatus(""), [remote]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(360, window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom;
      const bottom = below < 160 && rect.top > below;
      setPosition({
        width,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        ...(bottom
          ? { bottom: window.innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 }),
        maxHeight: Math.max(
          40,
          Math.min(260, (bottom ? rect.top : below) - 18),
        ),
      });
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      const active = document.activeElement;
      if (active !== trigger.current && !tooltip.current?.contains(active))
        setOpen(false);
    }, 150);
  };
  async function copy() {
    const copied = remote;
    try {
      await copyText(field.kind === "select" ? display(copied) : copied);
      if (mounted.current && remoteRef.current === copied)
        setCopyStatus("copied");
    } catch {
      if (mounted.current && remoteRef.current === copied)
        setCopyStatus("failed");
    }
  }

  const captionText = caption && (
    <span className="workflow-field-note-caption">{caption}</span>
  );
  const copyButton = (
    <button
      type="button"
      className="workflow-note-chip workflow-conflict-copy"
      aria-label={`复制${field.label}的云端最新值`}
      onClick={() => void copy()}
    >
      {copyStatus === "copied" ? (
        <Check size={11} aria-hidden="true" />
      ) : (
        <Copy size={11} aria-hidden="true" />
      )}
      <span>{copyStatus === "copied" ? "已复制" : "复制"}</span>
    </button>
  );

  if (!conflict) {
    if (!remote.trim()) return null;
    // 文本字段可能多人共用，需能复制云端值后在其基础上合并。
    const copyable = field.kind === "text" || field.kind === "textarea";
    return (
      <div
        className="workflow-field-note"
        role="group"
        aria-label={`${field.label}云端对照`}
      >
        <span className="workflow-field-note-text">
          {captionText}
          {!trimmed && !field.required ? "留空沿用云端：" : "原值 "}
          <span className="workflow-conflict-value">{display(remote)}</span>
        </span>
        <span className="workflow-field-note-actions">
          {copyable && copyButton}
          {onRestore && (
            <button
              type="button"
              className="workflow-note-chip"
              disabled={disabled}
              aria-label={
                trimmed
                  ? `将${field.label}恢复为原值`
                  : `将云端值填入${field.label}`
              }
              onClick={onRestore}
            >
              {trimmed ? (
                <RotateCcw size={11} aria-hidden="true" />
              ) : (
                <ArrowUpToLine size={11} aria-hidden="true" />
              )}
              <span>{trimmed ? "恢复" : "填入"}</span>
            </button>
          )}
        </span>
        {copyStatus === "failed" && (
          <small role="status" className="workflow-error">
            复制失败，可选中云端值复制。
          </small>
        )}
        {copyStatus === "copied" && (
          <span className="sr-only" role="status">
            云端最新值已复制
          </span>
        )}
      </div>
    );
  }

  if (!remote.trim()) {
    return (
      <div
        className="workflow-field-note is-conflict"
        role="group"
        aria-label={`${field.label}冲突处理`}
      >
        <CircleAlert
          className="workflow-field-note-icon"
          size={12}
          aria-hidden="true"
        />
        <span className="workflow-field-note-text">
          {captionText}
          云端已清空此字段，本机填写已保留，请核对后提交。
        </span>
      </div>
    );
  }

  return (
    <div
      className="workflow-field-note is-conflict workflow-conflict"
      role="group"
      aria-label={`${field.label}冲突处理`}
      aria-describedby={explanationId}
    >
      <CircleAlert
        className="workflow-field-note-icon"
        size={12}
        aria-hidden="true"
      />
      <span className="workflow-field-note-text workflow-conflict-remote">
        <span id={explanationId} className="workflow-conflict-explanation">
          编辑期间云端也有修改，请核对后提交。
        </span>
        {captionText}
        <span className="workflow-conflict-label">云端最新值：</span>
        <span className="workflow-conflict-value">{display(remote)}</span>
      </span>
      <span className="workflow-field-note-actions">
        {copyButton}
        <button
          type="button"
          className="workflow-note-chip workflow-conflict-preview"
          ref={trigger}
          aria-label={`预览${field.label}提交后的飞书内容`}
          aria-describedby={open ? tooltipId : undefined}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
          onClick={show}
        >
          <Eye size={12} aria-hidden="true" />
        </button>
      </span>
      {copyStatus === "failed" && (
        <small role="status" className="workflow-error">
          复制失败，可选中云端值复制。
        </small>
      )}
      {copyStatus === "copied" && (
        <span className="sr-only" role="status">
          云端最新值已复制
        </span>
      )}
      {open &&
        createPortal(
          <div
            id={tooltipId}
            ref={tooltip}
            role="tooltip"
            className="workflow-conflict-tooltip"
            style={position}
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
            tabIndex={0}
          >
            <div className="workflow-preview-heading">
              <span className="workflow-preview-icon" aria-hidden="true">
                <Eye size={15} />
              </span>
              <strong>飞书结果预览</strong>
              <span className="workflow-preview-timing">
                {invalid ? "待填写" : "提交成功后"}
              </span>
            </div>
            {invalid ? (
              <p className="workflow-preview-invalid">
                {invalidOption
                  ? "原选项已不可用，请重新选择。"
                  : "请先填写有效内容。"}
              </p>
            ) : (
              <div className="workflow-preview-result">
                <span className="workflow-preview-label">{field.label}</span>
                <p className="workflow-conflict-value">{display(preview)}</p>
              </div>
            )}
            {!invalid && !trimmed && (
              <p className="workflow-preview-note">留空将保留云端内容</p>
            )}
            <p className="workflow-preview-note">
              编辑期间云端也有修改，可保留、替换或合并后提交。
            </p>
          </div>,
          document.body,
        )}
    </div>
  );
}
