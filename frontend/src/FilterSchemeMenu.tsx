import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Bookmark, Check, ChevronDown, CircleAlert } from "lucide-react";
import { schemeSummary } from "./filterSchemes";
import type { FilterSchemesController } from "./useFilterSchemes";
import { useScrollIsolation } from "./useScrollIsolation";
import "./FilterSchemeMenu.css";

export function FilterSchemeMenu({ controller: c, onNotice }: { controller: FilterSchemesController; onNotice: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ kind: "save" | "rename" | "delete"; id?: string } | null>(null);
  const [name, setName] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const title = useId();
  const feedbackId = useId();
  const defaultLabel = useId(), defaultHelp = useId();
  const openingDialog = useRef(false);
  const menuIsolation = useScrollIsolation();
  const modalIsolation = useScrollIsolation();
  const close = () => { setForm(null); trigger.current?.focus(); };
  useEffect(() => {
    if (!form) return;
    const root = dialog.current;
    root?.querySelector<HTMLElement>("input, button")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab" || !root) return;
      const controls = [...root.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)")];
      const first = controls[0], last = controls[controls.length - 1];
      if (!root.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [form]);
  const begin = (kind: "save" | "rename" | "delete", id?: string) => {
    openingDialog.current = true;
    setName(c.document.schemes.find((scheme) => scheme.id === id)?.name || "");
    setMakeDefault(false); setForm({ kind, id }); setOpen(false);
  };
  const duplicate = c.document.schemes.some((scheme) => scheme.id !== form?.id && scheme.name.trim() === name.trim());
  const feedback = c.error ? (c.available ? c.error : "筛选方案暂不可用，展开后可重试。") : "";
  return <div className="filter-scheme-control">
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger asChild><button ref={trigger} className="filter-scheme-trigger" aria-label="筛选方案" aria-describedby={feedback ? feedbackId : undefined} title={feedback || (c.current ? `筛选方案：${c.current.name}` : "选择、保存和管理一组筛选条件")}>
        {c.error ? <CircleAlert className="filter-scheme-icon-error" size={15} aria-hidden="true" /> : <Bookmark className="filter-scheme-icon" size={15} aria-hidden="true" />}<span>{c.current?.name || "筛选方案"}</span>{c.adjusted && <small>已调整</small>}<ChevronDown size={12} aria-hidden="true" />
      </button></Menu.Trigger>
      <Menu.Portal><Menu.Content ref={menuIsolation} className="filter-scheme-menu scroll-isolation-boundary" sideOffset={6} align="start" collisionPadding={10}
        onCloseAutoFocus={(event) => { if (openingDialog.current) { event.preventDefault(); openingDialog.current = false; dialog.current?.querySelector<HTMLElement>("input, button")?.focus(); } }}>
        <Menu.Item className="filter-scheme-item" onSelect={() => c.apply(null)}>不限条件</Menu.Item>
        {c.document.schemes.map((scheme) => <Menu.Sub key={scheme.id}>
          <div className="filter-scheme-row">
            <Menu.Item className="filter-scheme-item filter-scheme-apply" onSelect={() => c.apply(scheme.id)}>
              <span className="filter-scheme-name">{c.current?.id === scheme.id && !c.adjusted && <Check size={14} />}<strong>{scheme.name}</strong>{c.document.defaultId === scheme.id && <small>默认</small>}</span>
              <span className="filter-scheme-summary">{schemeSummary(scheme.filters)}</span>
            </Menu.Item>
            <Menu.SubTrigger className="filter-scheme-manage" disabled={c.busy} aria-label={`管理方案 ${scheme.name}`}>管理</Menu.SubTrigger>
          </div>
          <Menu.Portal><Menu.SubContent ref={menuIsolation} className="filter-scheme-menu filter-scheme-actions scroll-isolation-boundary" collisionPadding={10}>
            <Menu.Item className="filter-scheme-item" onSelect={() => { void c.setDefault(c.document.defaultId === scheme.id ? null : scheme.id).then((saved) => { if (saved) onNotice("默认设置已保存，下次进入我的工作时生效"); }); }}>{c.document.defaultId === scheme.id ? "取消默认" : "设为默认"}</Menu.Item>
            <Menu.Item className="filter-scheme-item" onSelect={() => begin("rename", scheme.id)}>重命名</Menu.Item>
            <Menu.Item className="filter-scheme-item" onSelect={() => begin("delete", scheme.id)}>删除方案</Menu.Item>
          </Menu.SubContent></Menu.Portal>
        </Menu.Sub>)}
        {!c.document.schemes.length && !c.error && <p className="filter-scheme-hint">{c.busy ? "正在确认账号与读取方案…" : "尚无已保存方案"}</p>}
        {c.adjusted && <>
          <Menu.Separator className="filter-scheme-separator" />
          <Menu.Item className="filter-scheme-item" onSelect={() => c.apply(c.current!.id)}>恢复原方案</Menu.Item>
          <Menu.Item className="filter-scheme-item" disabled={c.busy} onSelect={() => void c.update()}>更新方案</Menu.Item>
        </>}
        <Menu.Separator className="filter-scheme-separator" />
        <Menu.Item className="filter-scheme-item" disabled={!c.available || c.busy} onSelect={() => begin("save")}>{c.adjusted ? "另存为新方案" : "保存当前条件为新方案"}</Menu.Item>
        {!c.available && !c.busy && !c.error && <p className="filter-scheme-hint">确认飞书账号后可保存个人方案。</p>}
        {c.error && <><p className="filter-scheme-hint filter-scheme-error" role="alert">{c.error}</p><Menu.Item className="filter-scheme-item" onSelect={c.retry}>重新读取方案</Menu.Item></>}
      </Menu.Content></Menu.Portal>
    </Menu.Root>
    {feedback && <span id={feedbackId} className="sr-only" role="status">{feedback}</span>}
    {form && createPortal(<div className="filter-scheme-backdrop scroll-isolation-boundary" ref={modalIsolation}>
      <div className="filter-scheme-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={title}>
        <form onSubmit={async (event) => {
          event.preventDefault();
          if (form.kind !== "delete" && (!name.trim() || duplicate)) return;
          const saved = form.kind === "save" ? await c.save(name, makeDefault)
            : form.kind === "rename" ? await c.rename(form.id!, name) : await c.remove(form.id!);
          if (saved) close();
        }}>
          <h3 id={title}>{form.kind === "save" ? "保存筛选方案" : form.kind === "rename" ? "重命名筛选方案" : "删除筛选方案"}</h3>
          {form.kind === "delete" ? <p>删除“{name}”？当前筛选条件将保留；默认绑定随方案一同移除。</p> : <>
            <label className="filter-scheme-name-input">方案名称<input aria-label="方案名称" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" /></label>
            {duplicate && <p role="alert">已存在同名方案，请使用不同名称。</p>}
            {form.kind === "save" &&
              <label className="filter-scheme-switch-row"><span><span id={defaultLabel}>设为默认</span><small id={defaultHelp}>默认方案只能有一个，开启后将替换原默认方案；下次进入我的工作时自动应用。</small></span><span className="settings-switch"><input type="checkbox" role="switch" aria-labelledby={defaultLabel} aria-describedby={defaultHelp} checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} /><span className="settings-switch-track" aria-hidden="true" /></span></label>
            }
          </>}
          {c.error && <p role="alert">{c.error}</p>}
          <div className="filter-scheme-dialog-actions"><button type="button" className="secondary" disabled={c.busy} onClick={close}>取消</button><button type="submit" disabled={c.busy || (form.kind !== "delete" && (!name.trim() || duplicate))}>{c.busy ? "正在保存…" : form.kind === "delete" ? "确认删除" : "保存"}</button></div>
        </form>
      </div>
    </div>, document.body)}
  </div>;
}
