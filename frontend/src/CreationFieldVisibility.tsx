import { useEffect, useState } from "react";
import { Select } from "./Select";
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
    <p>缺少需要填写的字段？点击「显示字段」自行添加，软件会记住你的选择，升级后也会保留。</p>
    <button type="button" className="text-button" aria-label="关闭字段小贴士" onClick={() => setVisible(false)}>关闭</button>
  </div>;
}
export const fixedCreationField = (field: CreationField) =>
  field.required || field.kind === "people" || Boolean(field.role_id) ||
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

export function CreationFieldVisibility({ form, selected, values, disabled, onChange }: {
  form: CreationForm; selected: string[]; values: Record<string, unknown>;
  disabled: boolean; onChange: (keys: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const optional = form.fields.filter((field) => !fixedCreationField(field));
  if (!optional.length) return null;
  const visible = visibleCreationFields(form, selected, values);
  const candidates = optional.filter((field) => !visible.includes(field) &&
    field.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="creation-field-visibility">
    <button type="button" className="text-button" aria-expanded={open} disabled={disabled}
      onClick={() => setOpen(!open)}>显示字段 · {visible.length}/{form.fields.length}</button>
    {open && <div className="creation-field-choices">
      <p className="hint">选择常用字段，本机记住此账号、空间与类型的选择。已有内容的字段须先清空才能隐藏。</p>
      <input aria-label="搜索可选字段" placeholder="搜索可选字段" value={query} disabled={disabled}
        onChange={(event) => setQuery(event.target.value)} />
      <Select ariaLabel="添加字段" value="" disabled={disabled || !candidates.length}
        options={[{ value: "", label: candidates.length ? "添加字段" : "没有可添加的字段", disabled: true },
          ...candidates.map((field) => ({ value: field.key, label: field.label }))]}
        onChange={(key) => { onChange([...new Set([...selected, key])]); setQuery(""); }} />
      <div className="creation-visible-tags">{optional.filter((field) => visible.includes(field)).map((field) =>
        <button type="button" key={field.key} disabled={disabled || !creationEmpty(values[field.key])}
          aria-label={`隐藏${field.label}`} onClick={() => onChange(selected.filter((key) => key !== field.key))}>
          {field.label} ×</button>)}</div>
    </div>}
  </div>;
}
