import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert, LoaderCircle, X } from "lucide-react";

const WAITING_MIN_MS = 1000;
const SAVING_MIN_MS = 1000;
const SAVED_VISIBLE_MS = 2000;

export type SaveFeedback = {
  state: "waiting" | "saving" | "saved" | "failed" | "invalid";
  message?: string;
  retry?: () => void;
  eventId?: number;
};

type VisibleSaveStatus = {
  state: SaveFeedback["state"];
  message: string;
  retries: (() => void)[];
  eventId?: number;
};

export function SettingsSaveStatus({
  feedback,
  onDismiss,
  active,
  belowNotice,
}: {
  feedback: (SaveFeedback | null)[];
  onDismiss: () => void;
  active: boolean;
  belowNotice: boolean;
}) {
  const failures = feedback.filter((entry) => entry?.state === "failed");
  const invalid = feedback.find((entry) => entry?.state === "invalid");
  const saving = feedback.some((entry) => entry?.state === "saving");
  const waiting = feedback.some((entry) => entry?.state === "waiting");
  const saved = feedback.some((entry) => entry?.state === "saved");
  const nextState = failures.length
    ? "failed"
    : saving
      ? "saving"
      : invalid
        ? "invalid"
        : waiting
          ? "waiting"
          : saved
            ? "saved"
            : null;
  const nextMessage = failures.length
    ? failures.map((entry) => entry?.message).join(" ")
    : saving
      ? "正在保存设置…"
      : invalid
        ? invalid.message || "请检查无效的设置项。"
        : waiting
          ? "等待自动保存…"
          : saved
            ? "设置已保存并生效。"
            : "";
  const nextStatus: VisibleSaveStatus | null = nextState
    ? {
        state: nextState,
        message: nextMessage,
        eventId: feedback.find(
          (entry) => entry?.state === nextState && entry.eventId !== undefined,
        )?.eventId,
        retries: failures.flatMap((entry) =>
          entry?.retry ? [entry.retry] : [],
        ),
      }
    : null;

  const [visible, setVisible] = useState<VisibleSaveStatus | null>(null);
  const visibleRef = useRef<VisibleSaveStatus | null>(null);
  const visibleAt = useRef(0);
  const timer = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const show = useCallback(
    (status: VisibleSaveStatus) => {
      clearTimer();
      visibleRef.current = status;
      visibleAt.current = Date.now();
      setVisible(status);
      if (status.state === "saved") {
        timer.current = window.setTimeout(() => {
          if (visibleRef.current?.state === "saved") {
            visibleRef.current = null;
            setVisible(null);
          }
          timer.current = null;
        }, SAVED_VISIBLE_MS);
      }
    },
    [clearTimer],
  );
  const showSavingBeforeSaved = useCallback(
    (status: VisibleSaveStatus, waitingRemaining: number) => {
      const beginSaving = () => {
        timer.current = null;
        show({
          state: "saving",
          message: "正在保存设置…",
          retries: [],
        });
        timer.current = window.setTimeout(
          () => show(status),
          SAVING_MIN_MS,
        );
      };
      if (waitingRemaining > 0)
        timer.current = window.setTimeout(beginSaving, waitingRemaining);
      else beginSaving();
    },
    [show],
  );

  useEffect(() => {
    const current = visibleRef.current;
    if (current && nextStatus?.state === current.state && nextStatus) {
      if (
        nextStatus.state === "saved" &&
        nextStatus.eventId !== current.eventId
      ) {
        show(nextStatus);
        return;
      }
      if (nextStatus.message !== current.message) {
        visibleRef.current = nextStatus;
        setVisible(nextStatus);
      }
      return;
    }
    if (!nextStatus) {
      if (current?.state === "saved") return;
      clearTimer();
      visibleRef.current = null;
      setVisible(null);
      return;
    }

    clearTimer();
    if (current?.state === "waiting" && nextStatus.state === "saved") {
      const waitingRemaining = Math.max(
        0,
        WAITING_MIN_MS - (Date.now() - visibleAt.current),
      );
      showSavingBeforeSaved(nextStatus, waitingRemaining);
      return;
    }
    const minimum =
      current?.state === "waiting"
        ? WAITING_MIN_MS
        : current?.state === "saving"
          ? SAVING_MIN_MS
          : 0;
    const remaining = minimum - (Date.now() - visibleAt.current);
    if (
      remaining > 0 &&
      (nextStatus.state === "saving" || nextStatus.state === "saved")
    ) {
      timer.current = window.setTimeout(() => show(nextStatus), remaining);
      return;
    }
    show(nextStatus);
  }, [
    nextStatus?.state,
    nextStatus?.message,
    nextStatus?.eventId,
    clearTimer,
    show,
    showSavingBeforeSaved,
  ]);

  useEffect(() => clearTimer, [clearTimer]);

  const dismiss = () => {
    clearTimer();
    visibleRef.current = null;
    setVisible(null);
    onDismiss();
  };
  if (!visible || !active) return null;

  const pending = visible.state === "saving" || visible.state === "waiting";
  const hasError =
    visible.state === "failed" || visible.state === "invalid";
  return (
    <div
      className={`banner ${hasError ? "error" : "success"} toast settings-save-status${belowNotice ? " below-notice" : ""}`}
      role={hasError ? "alert" : "status"}
    >
      {pending ? (
        <LoaderCircle className="spin" size={17} />
      ) : visible.state === "saved" ? (
        <Check size={17} />
      ) : (
        <CircleAlert size={17} />
      )}
      <span>{visible.message}</span>
      {visible.retries.map((retry, index) => (
        <button
          key={index}
          type="button"
          className="secondary"
          onClick={retry}
        >
          重试自动保存
        </button>
      ))}
      <button
        type="button"
        className="icon-button"
        aria-label="关闭设置提示"
        onClick={dismiss}
      >
        <X size={16} />
      </button>
    </div>
  );
}
