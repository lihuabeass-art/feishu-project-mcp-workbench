import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Pencil, RotateCcw, Save, X } from "lucide-react";
import { DateRangePicker } from "./DateRangePicker";
import { Select } from "./Select";
import { useScrollIsolation } from "./useScrollIsolation";
import {
  fitScheduleView, loadScheduleViews, MAX_VIEW_DAYS, resolveScheduleView, saveScheduleViews, scheduleViewMatches,
  shiftViewDate, viewRangeDays, viewWeekday, type SavedScheduleView, type ScheduleViewSettings, type ScheduleViews,
} from "./scheduleViews";
import "./scheduleViews.css";

type DateControlsProps = {
  current: ScheduleViewSettings;
  periods: 1 | 2;
  today: string;
  onApply: (settings: ScheduleViewSettings, restoring?: boolean) => void;
  onPeriodsChange: (periods: 1 | 2) => void;
};

export function ScheduleDateControls({ current, periods, today, onApply, onPeriodsChange, children }: DateControlsProps & { children?: ReactNode }) {
  const displayDays = current.days * periods;
  const navigate = (offset: number) => onApply({ ...current, start: fitScheduleView({ ...current, days: displayDays }, offset).start });
  return <>
    <div className="schedule-tabs" role="group" aria-label="时间跨度">
      {([1, 2] as const).map((value) => <button key={value} type="button" className={periods === value ? "active" : ""}
        aria-pressed={periods === value} onClick={() => onPeriodsChange(value)}>{value === 1 ? "单周" : "双周"}</button>)}
    </div>
    {children}
    <div className="schedule-week-nav">
      <button type="button" className="icon-button" aria-label="上一周" onClick={() => navigate(-current.days)}><ChevronLeft size={16} /></button>
      <strong>{current.start} — {shiftViewDate(current.start, displayDays - 1)}</strong>
      <button type="button" className="icon-button" aria-label="下一周" onClick={() => navigate(current.days)}><ChevronRight size={16} /></button>
      <button type="button" className="secondary" onClick={() => onApply({ ...current,
        start: shiftViewDate(today, viewWeekday(current.start) - viewWeekday(today)) })}>本周</button>
    </div>
  </>;
}

export function ScheduleViewControls({ enabled, storageKey, current, periods, today, onApply, onPeriodsChange, onOpenChange }: DateControlsProps & {
  enabled: boolean;
  storageKey: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [saved, setSaved] = useState<ScheduleViews>({ active: "", views: [] });
  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(current.start);
  const [end, setEnd] = useState(() => shiftViewDate(current.start, current.days - 1));
  const [name, setName] = useState("");
  const [dateMode, setDateMode] = useState<SavedScheduleView["dateMode"]>("weekly");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const titleId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogOpening = useRef(false);
  const scrollRef = useScrollIsolation<HTMLDivElement>();
  const menuScrollRef = useScrollIsolation<HTMLDivElement>();
  const applyRef = useRef(onApply);
  applyRef.current = onApply;
  const initialized = useRef(false);
  useLayoutEffect(() => {
    if (!enabled || initialized.current) return;
    initialized.current = true;
    const restored = loadScheduleViews(storageKey);
    setSaved(restored);
    const view = restored.views.find((view) => view.id === restored.active);
    if (view) applyRef.current(resolveScheduleView(view, today), true);
  }, [enabled, storageKey, today]); // 首次进入人员排期才恢复；往返页面保留当前人员视图。
  useLayoutEffect(() => { onOpenChange(enabled && (open || menuOpen)); return () => onOpenChange(false); }, [enabled, open, menuOpen, onOpenChange]);
  useEffect(() => {
    if (enabled) return;
    dialogOpening.current = false;
    setOpen(false);
    setMenuOpen(false);
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !open) return;
    dialogRef.current?.focus();
    return () => { trigger.current?.focus(); };
  }, [enabled, open]);

  const active = saved.views.find((view) => view.id === saved.active);
  const modified = active && !scheduleViewMatches(active, current);
  const count = viewRangeDays(start, end);
  const rangeError = !count ? "请选择有效的开始与结束日期" : count < 1 ? "结束日期不能早于开始日期"
    : count > MAX_VIEW_DAYS ? `一个视图区间最多 ${MAX_VIEW_DAYS} 天，请缩短日期范围` : "";

  function persist(value: ScheduleViews) {
    try { saveScheduleViews(storageKey, value); setSaved(value); setError(""); return true; }
    catch { setError("视图未能保存到本机，请检查本机存储后重试；当前日期和草稿已保留。"); return false; }
  }
  function show(mode: "range" | "save" | "edit") {
    dialogOpening.current = true;
    setStart(current.start);
    setEnd(shiftViewDate(current.start, current.days - 1));
    setName(mode === "edit" ? active?.name || "" : "");
    setDateMode(mode === "edit" ? active?.dateMode || "weekly" : "weekly");
    setSaving(mode !== "range"); setEditing(mode === "edit");
    setError(""); setDeleting(false); setMenuOpen(false); setOpen(true);
  }
  function close() { dialogOpening.current = false; setOpen(false); trigger.current?.focus(); }
  function clearView() {
    if (saved.active && !persist({ ...saved, active: "" })) return;
    setError("");
    onPeriodsChange(1);
    onApply({ start: shiftViewDate(today, -viewWeekday(today)), days: 7, perspective: "people",
      project: "", relatedProject: "", people: [], editableOnly: false });
  }
  function save() {
    if (rangeError || !name.trim()) return;
    if (saved.views.some((view) => view.name === name.trim() && (!editing || view.id !== active?.id))) {
      setError("已有同名视图，请换一个名称或编辑已有视图。"); return;
    }
    const view: SavedScheduleView = {
      id: editing && active ? active.id : crypto.randomUUID(), name: name.trim(), dateMode,
      settings: { ...current, people: [...current.people], start, days: count },
    };
    const views = editing ? saved.views.map((old) => old.id === view.id ? view : old) : [...saved.views, view];
    if (persist({ active: view.id, views })) { onApply(view.settings); close(); }
  }
  if (!enabled) return null;
  return <>
    <ScheduleDateControls current={current} periods={periods} today={today} onApply={onApply} onPeriodsChange={onPeriodsChange}>
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenu.Trigger asChild>
        <button type="button" ref={trigger} className="secondary schedule-view-trigger" aria-label="排期视图">
          <span>{active?.name || "视图"}</span>{modified && <span className="schedule-view-dot" aria-label="视图有调整" />}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="theme-menu schedule-view-menu scroll-isolation-boundary" ref={menuScrollRef}
          align="end" sideOffset={6} collisionPadding={10}
          onCloseAutoFocus={(event) => { if (dialogOpening.current) event.preventDefault(); }}>
          {saved.views.length > 0 && <>
            <DropdownMenu.Label className="theme-menu-label">已保存的视图</DropdownMenu.Label>
            <DropdownMenu.RadioGroup value={saved.active} onValueChange={(id) => {
              if (!persist({ ...saved, active: id })) return;
              const view = saved.views.find((view) => view.id === id);
              if (view) onApply(resolveScheduleView(view, today), true);
            }}>
              {saved.views.map((view) => <DropdownMenu.RadioItem key={view.id} value={view.id} className="theme-menu-item">
                <span>{view.name}</span><DropdownMenu.ItemIndicator className="theme-menu-check"><Check size={14} /></DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>)}
            </DropdownMenu.RadioGroup>
            <DropdownMenu.Separator className="theme-menu-separator" />
          </>}
          <DropdownMenu.Item className="theme-menu-item" onSelect={() => show("range")}>
            <CalendarDays size={15} aria-hidden="true" /><span>自定义日期范围…</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className="theme-menu-item" disabled={!storageKey} onSelect={() => show("save")}>
            <Save size={15} aria-hidden="true" /><span>保存为新视图…</span>
          </DropdownMenu.Item>
          {active && <DropdownMenu.Item className="theme-menu-item" onSelect={() => show("edit")}>
            <Pencil size={15} aria-hidden="true" /><span>编辑当前视图…</span>
          </DropdownMenu.Item>}
          <DropdownMenu.Separator className="theme-menu-separator" />
          <DropdownMenu.Item className="theme-menu-item" onSelect={clearView}>
            <RotateCcw size={15} aria-hidden="true" /><span>清除视图</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
    </ScheduleDateControls>
    {error && !open && <small role="alert">{error}</small>}
    {open && createPortal(<div className="schedule-view-backdrop scroll-isolation-boundary" ref={scrollRef}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="schedule-view-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.stopPropagation(); close(); }
          if (event.key === "Tab") {
            const elements = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')];
            const first = elements[0], last = elements[elements.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first?.focus(); }
          }
        }}>
        <header><h2 id={titleId}>{saving ? editing ? "编辑视图" : "保存视图" : "自定义日期范围"}</h2>
          <button type="button" className="icon-button" aria-label="关闭视图设置" onClick={close}><X size={18} /></button></header>
        <section aria-label="视图日期范围">
          <DateRangePicker start={start} end={end} startLabel="视图开始日期" endLabel="视图结束日期"
            startRequired endRequired onChange={(start, end) => { setStart(start); setEnd(end); }} />
          <p className={rangeError ? "schedule-view-error" : ""} role={rangeError ? "status" : undefined}>
            {rangeError || `含首尾共 ${count} 天，单周显示 ${count} 天，双周显示 ${count * 2} 天。`}</p>
        </section>
        {saving && <section className="schedule-view-save-fields" aria-label="保存当前排期视图">
          <label className="schedule-view-name">视图名称<input value={name} maxLength={40} placeholder="例如：周二例会"
            onChange={(event) => { setName(event.target.value); setError(""); }} /></label>
          <div className="schedule-view-date-mode"><span>日期方式</span><Select ariaLabel="保存日期方式" value={dateMode}
            options={[{ value: "weekly", label: "每周滚动" }, { value: "fixed", label: "固定日期" }]}
            onChange={(value) => setDateMode(value as SavedScheduleView["dateMode"])} /></div>
          <p>{dateMode === "weekly" ? "每次打开定位到本周相同起始星期。" : "每次打开恢复这段确切日期。"}当前筛选一并保存，仅本机、当前账号可用。</p>
        </section>}
        {error && <p className="schedule-view-error" role="alert">{error}</p>}
        {deleting ? <div className="schedule-view-delete" role="group" aria-label="确认删除视图">
          <p>删除「{active?.name}」？当前排期和草稿会保留。</p>
          <button type="button" className="secondary" onClick={() => setDeleting(false)}>取消</button>
          <button type="button" className="primary" onClick={() => {
            if (persist({ active: "", views: saved.views.filter((view) => view.id !== saved.active) })) close();
          }}>确认删除视图</button>
        </div> : <footer className="schedule-view-actions">
          {editing ? <button type="button" className="schedule-view-text-action" onClick={() => setDeleting(true)}>删除视图</button>
            : !saving && storageKey ? <button type="button" className="schedule-view-text-action" onClick={() => setSaving(true)}>保存为视图…</button> : null}
          <span />
          <button type="button" className="secondary" onClick={close}>取消</button>
          <button type="button" className="primary" disabled={!!rangeError || (saving && (!name.trim() || !storageKey))}
            onClick={() => { if (saving) save(); else { onApply({ ...current, start, days: count }); close(); } }}>
            {saving ? editing ? "保存更改" : "保存并应用" : "应用"}
          </button>
        </footer>}
      </div>
    </div>, document.body)}
  </>;
}
