import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileClock, X } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReleaseNotes } from "../scripts/release-notes.mjs";
import { ExternalLink } from "./ExternalLink";
import "./AppVersion.css";

export function AppVersion({ notes = __RELEASE_NOTES__ }: { notes?: ReleaseNotes }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    element.showModal();
    return () => {
      element.close();
      trigger.current?.focus();
    };
  }, [open]);
  return (
    <div className="local-badge app-version-badge">
      <button ref={trigger} type="button" className="app-version" aria-label={`查看 FSTODO v${notes.version} 的更新记录`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        FSTODO v{notes.version}<FileClock size={12} aria-hidden="true" />
      </button>
      <div className="mcp-credit"><span className="status-dot" />飞书 MCP 驱动</div>
      {open && createPortal(
        <dialog ref={dialog} className="release-notes-dialog" aria-labelledby="release-notes-title" onCancel={(event) => { event.preventDefault(); setOpen(false); }} onClose={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className="release-notes-header">
            <div><h2 id="release-notes-title">更新记录</h2><p>FSTODO v{notes.version}</p></div>
            <button type="button" className="icon-button" aria-label="关闭更新记录" onClick={() => setOpen(false)} autoFocus><X size={18} /></button>
          </div>
          <div className="release-notes-content" tabIndex={0} aria-label="当前版本变更说明">
            <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ href, children }) => href ? <ExternalLink href={href}>{children}</ExternalLink> : <span>{children}</span> }}>{notes.markdown}</Markdown>
          </div>
          <div className="release-notes-footer">当前版本记录可离线查看</div>
        </dialog>, document.body,
      )}
    </div>
  );
}
