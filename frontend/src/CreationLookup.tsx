import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, LoaderCircle, Search, X } from "lucide-react";
import { asError } from "./model";
import { useScrollIsolation } from "./useScrollIsolation";
import {
  lookupCreationField,
  type CreationField,
  type CreationForm,
  type CreationLookupResult,
  type CreationOption,
} from "./creation";

export function CreationLookup({
  form,
  field,
  value,
  labels,
  change,
  loadOptions,
  disabled = false,
  allowClear = true,
}: {
  form: CreationForm;
  field: CreationField;
  value: unknown;
  labels: Record<string, string>;
  change: (value: unknown, labels: Record<string, string>) => void;
  loadOptions?: (query: string) => Promise<CreationLookupResult>;
  disabled?: boolean;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const lookupKey = JSON.stringify([
    form.context,
    form.target.source_id,
    form.target.project_key,
    form.target.type_key,
    field.key,
    query,
  ]);
  const activeLookup = useRef(lookupKey);
  const load = useRef(loadOptions);
  load.current = loadOptions;
  activeLookup.current = lookupKey;
  const [lookup, setLookup] = useState<
    | (CreationLookupResult & {
        key: string;
        busy: boolean;
        error: string;
      })
    | null
  >(null);
  const currentLookup = lookup?.key === lookupKey ? lookup : null;
  const options = currentLookup?.options || [];
  const busy = open && (!currentLookup || currentLookup.busy);
  const error = currentLookup?.error || "";
  const warning = currentLookup?.warning || "";
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const trigger = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuScrollRef = useScrollIsolation(menu);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = (Array.isArray(value) ? value : value ? [value] : []).map(
    String,
  );
  const showLabel = (id: string) =>
    labels[`${field.key}:${id}`] ||
    field.options.find((o) => o.value === id)?.label ||
    options.find((o) => o.value === id)?.label ||
    id;
  function hide() {
    setOpen(false);
    trigger.current?.focus();
  }
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 300), window.innerWidth - 24);
    const below = window.innerHeight - rect.bottom - 16;
    const height = Math.min(330, Math.max(below, rect.top - 16));
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: below >= 200 ? rect.bottom + 6 : Math.max(12, rect.top - height - 6),
      width,
      maxHeight: height,
    });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    function outside(e: PointerEvent) {
      if (
        !trigger.current?.contains(e.target as Node) &&
        !menu.current?.contains(e.target as Node)
      )
        setOpen(false);
    }
    function resize() {
      setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", resize);
    function scroll(e: Event) {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", resize);
      document.removeEventListener("scroll", scroll, true);
    };
  }, [open, position]);
  useEffect(() => {
    if (!open || disabled) {
      setLookup(null);
      return;
    }
    let cancelled = false;
    const isCurrent = () => !cancelled && activeLookup.current === lookupKey;
    setLookup({
      key: lookupKey,
      options: [],
      warning: null,
      busy: true,
      error: "",
    });
    setActive(0);
    const timer = window.setTimeout(
      () => {
        (load.current ? load.current(query) : lookupCreationField(form.target, field.key, query))
          .then((found) => {
            if (isCurrent()) {
              setLookup({ ...found, key: lookupKey, busy: false, error: "" });
              setActive(0);
            }
          })
          .catch((e) => {
            if (isCurrent())
              setLookup({
                key: lookupKey,
                options: [],
                warning: null,
                busy: false,
                error: asError(e).message,
              });
          });
      },
      query ? 250 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, lookupKey, disabled]);
  function choose(option: CreationOption) {
    if (disabled) return;
    const next = field.multiple
      ? selected.includes(option.value)
        ? selected.filter((v) => v !== option.value)
        : [...selected, option.value]
      : option.value;
    change(next, { [`${field.key}:${option.value}`]: option.label });
    if (!field.multiple) hide();
  }
  return (
    <div className="creation-lookup-control">
      <div
        id={`create-${field.key}`}
        className="creation-picker"
        ref={trigger}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label={field.label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-required={field.required}
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.target !== e.currentTarget) return;
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="creation-picker-values">
          {selected.length ? (
            selected.map((id) => (
              <span
                key={id}
                className={
                  field.kind === "people"
                    ? "creation-person-chip"
                    : "creation-relation-chip"
                }
              >
                {field.kind === "people" && (
                  <span className="creation-person-avatar" aria-hidden="true">
                    {showLabel(id).slice(0, 1)}
                  </span>
                )}
                {showLabel(id)}
                {allowClear && <button
                  type="button"
                  className="creation-chip-remove"
                  aria-label={`从${field.label}移除${showLabel(id)}`}
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    change(
                      field.multiple ? selected.filter((v) => v !== id) : "",
                      {},
                    );
                  }}
                >
                  <X size={12} aria-hidden="true" />
                </button>}
              </span>
            ))
          ) : (
            <span className="creation-picker-placeholder">待填</span>
          )}
        </span>
        <ChevronDown size={15} />
      </div>
      {allowClear && selected.length > 0 && (
        <button
          type="button"
          className="creation-picker-clear"
          aria-label={`清空${field.label}`}
          disabled={disabled}
          onClick={() => change(field.multiple ? [] : "", {})}
        >
          <X size={13} />
        </button>
      )}
      {open && !disabled &&
        position &&
        createPortal(
          <div
            className="creation-lookup-menu scroll-isolation-boundary"
            ref={menuScrollRef}
            style={position}
          >
            <div className="creation-lookup-search">
              <Search size={15} />
              <input
                ref={input}
                aria-label={`搜索${field.label}`}
                placeholder={
                  field.kind === "people" ? "搜索人员" : "搜索关联事项"
                }
                value={query}
                maxLength={100}
                aria-controls={listId}
                aria-activedescendant={
                  options[active] ? `${listId}-${active}` : undefined
                }
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    hide();
                  }
                  if (e.key === "Tab") {
                    e.preventDefault();
                    hide();
                  }
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((i) =>
                      Math.max(
                        0,
                        Math.min(
                          options.length - 1,
                          i + (e.key === "ArrowDown" ? 1 : -1),
                        ),
                      ),
                    );
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!busy && options[active]) choose(options[active]);
                  }
                }}
              />
            </div>
            {busy && (
              <p className="creation-picker-status" role="status">
                <LoaderCircle className="spin" size={14} />
                正在搜索…
              </p>
            )}
            {error && (
              <p className="error-text creation-picker-status" role="alert">
                {error}
              </p>
            )}
            {warning && (
              <p className="creation-picker-status" role="status">
                {warning}
              </p>
            )}
            <div
              id={listId}
              role="listbox"
              aria-label={`${field.label}候选`}
              aria-multiselectable={field.multiple}
            >
              {!busy && !error && !options.length && (
                <p className="creation-picker-status">
                  未找到匹配项，请输入更完整的
                  {field.kind === "people" ? "姓名" : "标题"}。
                </p>
              )}
              {options.map((option, index) => (
                <button
                  type="button"
                  tabIndex={-1}
                  role="option"
                  id={`${listId}-${index}`}
                  key={option.value}
                  aria-selected={selected.includes(option.value)}
                  className={`creation-picker-option${index === active ? " active" : ""}`}
                  disabled={busy}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(option)}
                >
                  {field.kind === "people" && (
                    <span className="creation-person-avatar" aria-hidden="true">
                      {option.label.slice(0, 1)}
                    </span>
                  )}
                  <span>{option.label}</span>
                  {selected.includes(option.value) && <Check size={15} />}
                </button>
              ))}
            </div>
            <small className="creation-picker-status">
              {field.kind === "people"
                ? "显示当前空间已知人员；输入姓名片段筛选，完整姓名可补充查询"
                : "最多显示 20 项，输入标题缩小范围"}
            </small>
          </div>,
          document.body,
        )}
    </div>
  );
}
