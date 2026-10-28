import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowDownToLine, RefreshCw, X } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink } from "./ExternalLink";
import type { AppUpdaterController } from "./useAppUpdater";
import "./AppUpdater.css";

function status(updater: AppUpdaterController) {
  const { phase, release, failureStage } = updater.state;
  if (!updater.desktop) return "请在桌面应用中检查和安装更新。";
  if (!updater.configured) return "更新源尚未配置。";
  if (phase === "checking") return "正在检查新版本…";
  if (phase === "current") return "当前已是最新版本。";
  if (phase === "downloading") return "正在后台下载完整安装包并校验签名…";
  if (phase === "ready")
    return `v${release?.version} 已下载并通过签名校验，等待安装。`;
  if (phase === "installing") return "正在准备安装，请稍候…";
  if (phase === "error")
    return failureStage === "restart"
      ? "安装已完成，自动重启未成功。请退出后重新打开 FSTODO。"
      : failureStage === "download"
        ? "更新下载或签名校验失败，可以重试。"
        : "更新未完成，可以重试。";
  return "从 GitHub 获取正式发布的新版本并在后台下载，重启安装前由你确认。";
}

export function AppUpdateSettings({
  updater,
}: {
  updater: AppUpdaterController;
}) {
  const id = useId();
  const { phase, release } = updater.state;
  const retained =
    !!release ||
    phase === "error" ||
    phase === "downloading" ||
    phase === "installing";
  return (
    <section
      className="link-settings app-update-settings"
      aria-label="软件更新"
    >
      <div className="section-heading">
        <div>
          <h2>软件更新</h2>
          <p>当前版本 v{__APP_VERSION__}</p>
        </div>
      </div>
      <label className="desktop-setting-row">
        <span className="desktop-setting-copy">
          <span className="desktop-setting-title" id={`${id}-title`}>
            自动检查并下载更新
          </span>
          <span
            className="desktop-setting-description"
            id={`${id}-description`}
          >
            启动后和使用期间定期检查并在后台下载，完成后提示，由你确认重启安装。关闭后停止后续自动检查和下载，已开始的下载会继续。
          </span>
        </span>
        <span className="settings-switch">
          <input
            type="checkbox"
            role="switch"
            aria-labelledby={`${id}-title`}
            aria-describedby={`${id}-description`}
            checked={updater.automatic}
            disabled={
              !updater.desktop || !updater.configured || phase === "installing"
            }
            onChange={(event) => updater.setAutomatic(event.target.checked)}
          />
          <span className="settings-switch-track" aria-hidden="true" />
        </span>
      </label>
      <div className="app-update-settings-actions">
        <p className="hint" role="status">
          {status(updater)}
        </p>
        <button
          type="button"
          className="secondary"
          data-app-update-trigger
          disabled={
            !updater.desktop ||
            !updater.configured ||
            phase === "checking" ||
            phase === "installing"
          }
          onClick={retained ? updater.open : updater.check}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {retained
            ? "查看更新"
            : phase === "checking"
              ? "正在检查…"
              : "检查更新"}
        </button>
      </div>
      {updater.preferenceError && (
        <p className="error-text" role="alert">
          {updater.preferenceError}
        </p>
      )}
    </section>
  );
}

function bytes(value: number) {
  return value < 1024 * 1024
    ? `${(value / 1024).toFixed(0)} KB`
    : `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function AppUpdateDialog({
  updater,
}: {
  updater: AppUpdaterController;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const capturedOpener = useRef(false);
  const id = useId();
  const {
    open,
    noticeVisible,
    phase,
    release,
    downloaded,
    total,
    error,
    failureStage,
  } = updater.state;
  const installing = phase === "installing";
  const dismissRef = useRef(updater.dismiss);
  dismissRef.current = updater.dismiss;
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    if (!capturedOpener.current) {
      restoreFocus.current =
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body
          ? document.activeElement
          : null;
    }
    capturedOpener.current = false;
    element.showModal();
    return () => {
      element.close();
      const candidates = [
        restoreFocus.current,
        document.querySelector<HTMLElement>("[data-app-update-trigger]"),
        ...document.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), [tabindex='0']",
        ),
      ];
      const target = candidates.find((candidate) => {
        if (!candidate?.isConnected || candidate.closest("[hidden], [inert]"))
          return false;
        for (
          let ancestor: HTMLElement | null = candidate;
          ancestor;
          ancestor = ancestor.parentElement
        ) {
          const style = getComputedStyle(ancestor);
          if (style.display === "none" || style.visibility === "hidden")
            return false;
        }
        return true;
      });
      target?.focus();
    };
  }, [open]);
  if (!open) {
    if (
      !updater.desktop ||
      !updater.configured ||
      !noticeVisible ||
      (phase !== "ready" && phase !== "error")
    )
      return null;
    return createPortal(
      <aside
        className="app-update-notice"
        aria-label="软件更新提示"
        tabIndex={0}
      >
        <button
          type="button"
          className="icon-button app-update-notice-close"
          aria-label="关闭软件更新提示"
          onClick={updater.dismissNotice}
        >
          <X size={15} aria-hidden="true" />
        </button>
        <div
          className="app-update-notice-copy"
          role="status"
          aria-live="polite"
        >
          <strong>
            {phase === "ready"
              ? `v${release?.version} 已准备好安装`
              : "软件更新未完成"}
          </strong>
          <p>
            {phase === "ready"
              ? "安装包已下载并通过签名校验，由你确认重启安装。"
              : status(updater)}
          </p>
          {error && <p className="app-update-error">{error}</p>}
        </div>
        <div className="app-update-notice-actions">
          <button
            type="button"
            className="secondary"
            onClick={(event) => {
              restoreFocus.current = event.currentTarget;
              capturedOpener.current = true;
              updater.open();
            }}
          >
            {phase === "ready" && (
              <ArrowDownToLine size={14} aria-hidden="true" />
            )}
            查看更新
          </button>
          {phase === "error" && (
            <button type="button" className="primary" onClick={updater.retry}>
              {failureStage === "restart"
                ? "重试重启"
                : failureStage === "install"
                  ? "重新检查更新"
                  : "重试"}
            </button>
          )}
        </div>
      </aside>,
      document.body,
    );
  }
  const progress =
    total && total > 0 ? Math.min(100, (downloaded / total) * 100) : null;
  return createPortal(
    <dialog
      ref={dialog}
      className="app-update-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-status`}
      aria-busy={installing}
      onCancel={(event) => {
        event.preventDefault();
        if (!installing) dismissRef.current();
      }}
      onClose={() => {
        if (!installing) dismissRef.current();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !installing)
          dismissRef.current();
      }}
    >
      <div className="app-update-header">
        <div>
          <h2 id={`${id}-title`}>
            {release ? `FSTODO v${release.version}` : "软件更新"}
          </h2>
          {release && <p>当前版本 v{release.currentVersion}</p>}
        </div>
        {!installing && (
          <button
            type="button"
            className="icon-button"
            aria-label="关闭软件更新"
            onClick={updater.dismiss}
          >
            <X size={18} />
          </button>
        )}
      </div>
      <div
        className="app-update-content"
        tabIndex={0}
        aria-label="版本更新详情"
      >
        <p
          id={`${id}-status`}
          className="app-update-status"
          role="status"
          aria-live="polite"
        >
          {status(updater)}
        </p>
        {phase === "downloading" && (
          <div className="app-update-download">
            <div
              role="progressbar"
              aria-label="安装包下载进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={
                progress === null ? undefined : Math.floor(progress)
              }
              className={`app-update-progress${progress === null ? " is-indeterminate" : ""}`}
            >
              <span
                style={
                  progress === null ? undefined : { width: `${progress}%` }
                }
              />
            </div>
            <p>
              {bytes(downloaded)}
              {total
                ? ` / ${bytes(total)} · ${Math.floor(progress || 0)}%`
                : " · 正在下载并校验"}
            </p>
          </div>
        )}
        {error && (
          <p className="app-update-error" role="alert">
            {error}
          </p>
        )}
        {phase === "ready" && (
          <p className="app-update-explanation">
            安装将退出 FSTODO
            并替换应用文件。确认后自动安装，完成后重新打开；本机配置与工作数据会保留。
          </p>
        )}
        {installing && (
          <p className="app-update-explanation">
            正在保存设置并交由系统安装更新，请保持应用开启。
          </p>
        )}
        {release && (
          <div className="app-update-notes">
            <h3>本次更新</h3>
            {release.notes ? (
              <Markdown
                remarkPlugins={[remarkGfm]}
                skipHtml
                components={{
                  a: ({ href, children }) =>
                    href ? (
                      <ExternalLink href={href}>{children}</ExternalLink>
                    ) : (
                      <span>{children}</span>
                    ),
                }}
              >
                {release.notes}
              </Markdown>
            ) : (
              <p className="hint">此版本未提供更新说明。</p>
            )}
          </div>
        )}
      </div>
      <div className="app-update-footer">
        {!installing && (
          <button
            type="button"
            className="secondary"
            onClick={updater.dismiss}
            autoFocus
          >
            {phase === "current" ? "关闭" : "稍后再说"}
          </button>
        )}
        {phase === "ready" && (
          <button type="button" className="primary" onClick={updater.install}>
            退出并安装
          </button>
        )}
        {phase === "error" && (
          <button type="button" className="primary" onClick={updater.retry}>
            {failureStage === "restart"
              ? "重试重启"
              : failureStage === "install"
                ? "重新检查更新"
                : "重试"}
          </button>
        )}
        {installing && <span role="status">正在安装…</span>}
      </div>
    </dialog>,
    document.body,
  );
}
