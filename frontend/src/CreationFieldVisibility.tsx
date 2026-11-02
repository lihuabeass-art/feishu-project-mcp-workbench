import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Link2, LockKeyhole, Plus, Search, SlidersHorizontal, UsersRound, X } from "lucide-react";
import { useScrollIsolation } from "./useScrollIsolation";
import { creationEmpty, creationTargetKey, type CreationField, type CreationForm } from "./creation";

export const creationVisibilityKey = (form: CreationForm) =>
  `fstodo.creation-visible-fields.v1:${form.context}:${creationTargetKey(form.target)}`;
export const creationFieldTipSeenKey = "fstodo.creation-field-tip-seen";
let tipShownInSession = false;
export function CreationFieldTip() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(creationFieldTipSeenKey) === "true") return;
    } catch { /* 读取失败不阻止填写；本次会话仍只展示一次。 */ }
    if (tipShownInSession) return;
    setVisible(true);
    try { localStorage.setItem(creationFieldTipSeenKey, "true"); }
    catch { tipShownInSession = true; /* 不宣称持久保存成功，也不打断表单。 */ }
  }, []);
  if (!visible) return null;
  return <div className="creation-field-tip" role="note">
    <p>缺少需要填写的字段？在「显示字段」中按需添加字段和人员角色，软件会记住你的选择，升级后也会保留。</p>
    <button type="button" className="text-button" aria-label="关闭字段小贴士" onClick={() => setVisible(false)}>关闭</button>
  </div>;
}
export const fixedCreationField = (field: CreationField) =>
  field.required ||
  ["name", "template", "description"].includes(field.key);
export function loadCreationVisibility(form: CreationForm): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(creationVisibilityKey(form)) || "[]");
    return Array.isArray(saved) ? saved.filter((key): key is string =>
      typeof key === "string" && form.fields.some((field) => field.key === key)) : [];
  } catch { return []; }
}
export const visibleCreationFields = (form: CreationForm, selected: string[], values: Record<string, unknown>) =>
  form.fields.filter((field) => fixedCreationField(field) || selected.includes(field.key) || !creationEmpty(values[field.key]));

const fieldGroups = [
  { key: "all", label: "全部" },
  { key: "basic", label: "基本信息" },
  { key: "relation", label: "关联信息" },
  { key: "people", label: "人员信息" },
] as const;
const fieldGroup = (field: CreationField) =>
  field.kind === "people" || field.role_id ? "people" : field.kind === "relation" ? "relation" : "basic";

export function CreationFieldVisibility({ form, selected, values, disabled, onChange }: {
  form: CreationForm; selected: string[]; values: Record<string, unknown>;
  disabled: boolean; onChange: (keys: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("all");
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const choicesScrollRef = useScrollIsolation();
  const optional = form.fields.filter((field) => !fixedCreationField(field));
  if (!optional.length) return null;
  const visible = visibleCreationFields(form, selected, values);
  const matches = (field: CreationField) => (group === "all" || fieldGroup(field) === group) &&
    field.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const candidates = optional.filter(matches);
  const fixed = form.fields.filter((field) => fixedCreationField(field) && matches(field));
  return <div className="creation-field-visibility">
    <button type="button" className="creation-field-toggle" ref={triggerRef}
      aria-label={`显示字段 · ${visible.length}/${form.fields.length}`} aria-expanded={open}
      aria-controls={panelId} disabled={disabled} onClick={() => setOpen(!open)}>
      <span className="creation-field-toggle-icon" aria-hidden="true"><SlidersHorizontal size={18} /></span>
      <span className="creation-field-toggle-copy"><strong>显示字段</strong><small>常用字段与人员角色，按需显示</small></span>
      <span className="creation-field-count">{visible.length}<span> / {form.fields.length}</span></span>
      <ChevronDown size={16} className="creation-field-chevron" aria-hidden="true" />
    </button>
    {open && <div id={panelId} className="creation-field-choices scroll-isolation-boundary"
      ref={choicesScrollRef} role="region" aria-label="表单字段配置"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}>
      <div className="creation-field-search">
        <Search size={16} aria-hidden="true" />
        <input ref={searchRef} aria-label="搜索可选字段" placeholder="搜索字段或人员角色" value={query} disabled={disabled}
          onChange={(event) => setQuery(event.target.value)} />
        {query && <button type="button" className="icon-button" aria-label="清空字段搜索" disabled={disabled}
          onClick={() => { setQuery(""); searchRef.current?.focus(); }}><X size={14} /></button>}
      </div>
      <div className="creation-field-categories" role="group" aria-label="字段分类">
        {fieldGroups.filter((entry) => entry.key === "all" || form.fields.some((field) => fieldGroup(field) === entry.key))
          .map((entry) => <button type="button" key={entry.key} aria-pressed={group === entry.key}
            disabled={disabled} onClick={() => setGroup(entry.key)}>{entry.label}</button>)}
      </div>
      <div className="creation-field-cards scroll-isolation-boundary" role="group" aria-label="可选字段">
        {candidates.map((field) => {
          const shown = visible.includes(field);
          const filled = !creationEmpty(values[field.key]);
          const status = filled ? "已填写" : shown ? "已显示" : "点击添加";
          const Icon = fieldGroup(field) === "people" ? UsersRound : fieldGroup(field) === "relation" ? Link2 : SlidersHorizontal;
          return <button type="button" key={field.key} className="creation-field-card"
            aria-label={`${shown ? "隐藏" : "显示"}${field.label}`} aria-pressed={shown}
            disabled={disabled || filled} title={filled ? "已有内容，请先清空后隐藏" : undefined}
            onClick={() => onChange(shown ? selected.filter((key) => key !== field.key) : [...new Set([...selected, field.key])])}>
            <Icon size={16} className="creation-field-card-icon" aria-hidden="true" />
            <span className="creation-field-card-copy"><span>{field.label}</span><small>{status}</small></span>
            <span className="creation-field-card-state" aria-hidden="true">
              {filled ? <LockKeyhole size={13} /> : shown ? <Check size={14} /> : <Plus size={14} />}
            </span>
          </button>;
        })}
        {!candidates.length && <p className="creation-field-empty" role="status">
          {fixed.length ? "该分类中匹配的字段均为固定显示。" : "没有找到匹配的字段，试试其他名称。"}
        </p>}
      </div>
      {fixed.length > 0 && <div className="creation-field-fixed" role="group" aria-label="固定显示的字段">
        <span>始终显示</span>
        {fixed.map((field) => <span className="creation-field-fixed-tag" key={field.key}>
          <LockKeyhole size={11} aria-hidden="true" />{field.label}{field.required && <small>必填</small>}
        </span>)}
      </div>}
      <div className="creation-field-config-note">
        <span><Check size={13} aria-hidden="true" />本机保存 · 升级保留</span>
        <p>必填和已有内容的字段保留显示。选择仅用于当前账号、空间和类型。</p>
      </div>
    </div>}
  </div>;
}
