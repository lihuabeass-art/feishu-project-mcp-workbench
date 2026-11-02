import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileClock, X } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReleaseNotes } from "../scripts/release-notes.mjs";
import { ExternalLink } from "./ExternalLink";
import { useScrollIsolation } from "./useScrollIsolation";
import "./AppVersion.css";

export function AppVersion({ notes = __RELEASE_NOTES__ }: { notes?: ReleaseNotes }) {
  const [open, setOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState(notes.version);
  const entries = [notes, ...(notes.history || [])];
  const selected = entries.find((entry) => entry.version === selectedVersion) || notes;
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const scrollBoundary = useScrollIsolation(dialog);
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
      <button ref={trigger} type="button" className="app-version" aria-label={`查看 FSTODO v${notes.version} 的更新记录`} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setSelectedVersion(notes.version); setOpen(true); }}>
        FSTODO v{notes.version}<FileClock size={12} aria-hidden="true" />
      </button>
      <div className="mcp-credit"><span className="status-dot" />飞书 MCP 驱动</div>
      {open && createPortal(
        <dialog ref={scrollBoundary} className="release-notes-dialog scroll-isolation-boundary" aria-labelledby="release-notes-title" onCancel={(event) => { event.preventDefault(); setOpen(false); }} onClose={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className="release-notes-shell">
          <div className="release-notes-header">
            <div><h2 id="release-notes-title">更新记录</h2><p>当前安装 v{notes.version} · 共 {entries.length} 个版本</p></div>
            <button type="button" className="icon-button" aria-label="关闭更新记录" onClick={() => setOpen(false)} autoFocus><X size={18} /></button>
          </div>
          <div className="release-notes-body">
            <nav className="release-notes-versions" aria-label="版本记录">
              {entries.map((entry) => <button key={entry.version} type="button" className="release-notes-version" aria-label={`查看 v${entry.version} 的更新记录`} aria-pressed={entry.version === selected.version} onClick={() => setSelectedVersion(entry.version)}>
                <span>v{entry.version}</span>
                <small>{entry.version === notes.version ? "当前版本" : entry.version.includes("-") ? "预发布" : entry.date}</small>
              </button>)}
            </nav>
            <div key={selected.version} className="release-notes-content" tabIndex={0} aria-label={`v${selected.version} 变更说明`}>
              <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ href, children }) => href ? <ExternalLink href={href}>{children}</ExternalLink> : <span>{children}</span> }}>{selected.markdown}</Markdown>
            </div>
          </div>
          <div className="release-notes-footer">所有版本记录均可离线查看</div>
          </div>
        </dialog>, document.body,
      )}
    </div>
  );
}
