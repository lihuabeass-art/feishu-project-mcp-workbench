import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Select } from "./Select";
import { changeWorkFilter, emptyWorkFilters, workFilterCount, type WorkFilterOptions, type WorkFilters } from "./workFilters";
import { useScrollIsolation } from "./useScrollIsolation";
import "./WorkFilterToolbar.css";

type FilterKey = "space" | "project" | "flowKind" | "nodeName" | "stateName";

export function WorkFilterToolbar({ filters, options, onChange, resultCount, schemeMenu, nodeFilterHint = "当前节点" }: {
  filters: WorkFilters;
  options: WorkFilterOptions;
  onChange: (filters: WorkFilters) => void;
  resultCount: number;
  schemeMenu?: ReactNode;
  nodeFilterHint?: string;
}) {
  const toolbar = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const focusAfterChange = useRef<FilterKey | "first" | null>(null);
  const focusAfterResize = useRef(false);
  const focusedElement = useRef<HTMLElement | null>(null);
  const panelId = useId();
  const panelIsolation = useScrollIsolation();
  const [collapsed, setCollapsed] = useState(false);
  const measuredCollapsed = useRef(false);
  const [open, setOpen] = useState(false);
  const count = workFilterCount({ ...filters, type: [] });
  const fields = [
    { key: "space", label: "空间", shortLabel: "空间", empty: "全部空间", options: options.spaces, visible: options.spaces.length > 0, width: 104 },
    { key: "project", label: "所属项目", shortLabel: "项目", empty: "全部项目", options: options.projects, visible: options.projects.length > 0, width: 104 },
    { key: "flowKind", label: "流程类型", shortLabel: "流程", empty: "全部流程类型", options: options.flowKinds, visible: options.flowKinds.length > 0, width: 112 },
    { key: "nodeName", label: "节点", shortLabel: "节点", empty: "全部节点", options: options.node.options, visible: options.node.visible, width: 88 },
    { key: "stateName", label: "当前状态", shortLabel: "状态", empty: "全部状态", options: options.state.options, visible: options.state.visible, width: 88 },
  ].filter((field) => field.visible || filters[field.key as FilterKey].length > 0);
  // 与固定的控件宽度共用预算，展开面板后仍能按列表宽度恢复整行入口。
  const inlineWidth = 32 + (schemeMenu ? 160 : 0) + 64 + fields.reduce((total, field) => total + field.width + 8, 0);

  function focusControl(key: FilterKey | "first" = "first") {
    const field = key === "first" ? null : controls.current?.querySelector<HTMLElement>(`[data-filter-key="${key}"] .select-trigger`);
    const target = collapsed ? toggle.current : field || controls.current?.querySelector<HTMLElement>(".select-trigger");
    (target || toolbar.current?.querySelector<HTMLButtonElement>(".filter-scheme-trigger") || toolbar.current)?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    const element = toolbar.current;
    if (!element) return;
    const measure = () => {
      const width = element.getBoundingClientRect().width;
      if (!width) return;
      const next = width < inlineWidth;
      measuredCollapsed.current = next;
      if (next === collapsed) return;
      focusAfterResize.current = !!controls.current?.contains(document.activeElement) || document.activeElement === toggle.current;
      setOpen(false);
      setCollapsed(next);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [inlineWidth, collapsed]);

  useLayoutEffect(() => {
    // 条件变化也可能引起下一次布局提交，等入口真正挂载后再消费焦点请求。
    if (measuredCollapsed.current !== collapsed) return;
    const lostFocus = focusedElement.current && !focusedElement.current.isConnected &&
      (!document.activeElement || document.activeElement === document.body);
    if (focusAfterChange.current || focusAfterResize.current || lostFocus) {
      const key = focusAfterChange.current || "first";
      focusAfterChange.current = null;
      focusAfterResize.current = false;
      focusControl(key);
    }
  });

  function change(key: FilterKey, values: string[]) {
    const field = fields.find((entry) => entry.key === key)!;
    onChange(key === "nodeName" || key === "stateName"
      ? { ...filters, [key]: values }
      : changeWorkFilter(filters, key, values, field.options));
  }

  function clear() {
    focusAfterChange.current = "first";
    onChange({ ...emptyWorkFilters, type: filters.type, typeLabel: filters.typeLabel });
  }

  const chips = [
    ...(filters.query.trim() ? [{ id: "query", label: `搜索：${filters.query}`, hint: undefined, remove: () => {
      focusAfterChange.current = "first";
      onChange({ ...filters, query: "" });
    } }] : []),
    ...fields.flatMap((field) => {
      const key = field.key as FilterKey;
      return filters[key].map((value) => ({
        id: `${key}:${value}`,
        hint: key === "nodeName" ? nodeFilterHint : undefined,
        label: `${field.label}：${field.options.find((option) => option.value === value)?.label ||
          (key === "space" ? filters.spaceLabel[value] : key === "project" ? filters.projectLabel[value] : null) || value}`,
        remove: () => {
          focusAfterChange.current = key;
          change(key, filters[key].filter((entry) => entry !== value));
        },
      }));
    }),
  ];

  const filterControls = <div className="work-filter-fields" ref={controls}>
    {fields.map((field) => {
      const key = field.key as FilterKey;
      const values = filters[key];
      const summarize = !collapsed && (key === "nodeName" || key === "stateName" || values.length > 1);
      return <label key={key} className="work-filter-field" data-filter-key={key}
        title={key === "nodeName" ? nodeFilterHint : undefined}
        style={{ "--work-filter-width": `${field.width}px` } as CSSProperties}>
        <span className={collapsed ? "work-filter-label" : "sr-only"}>{field.label}</span>
        <Select multiple className="compact" ariaLabel={field.label} value={values}
          onChange={(next) => change(key, next)}
          triggerLabel={summarize ? <span className="work-filter-summary">{field.shortLabel}
            {values.length > 0 && <span className="work-filter-badge">{values.length}</span>}
          </span> : undefined}
          options={[{ value: "", label: field.empty }, ...field.options]} />
      </label>;
    })}
  </div>;

  return <div ref={toolbar} className={`work-filter-toolbar${collapsed ? " is-collapsed" : ""}`} tabIndex={-1}
    onFocusCapture={(event) => { focusedElement.current = toolbar.current?.contains(event.target) ? event.target as HTMLElement : null; }}
    onBlurCapture={(event) => {
      if (!(event.relatedTarget instanceof Node) || !toolbar.current?.contains(event.relatedTarget)) focusedElement.current = null;
    }}
    onKeyDown={(event) => {
      // Select 的 Portal 先消费 Escape；再次按下才收起筛选面板。
      if (event.key === "Escape" && !event.defaultPrevented && collapsed && open && toolbar.current?.contains(event.target as Node)) {
        event.preventDefault(); setOpen(false); toggle.current?.focus();
      }
    }}>
    <div className="work-filter-row">
      {schemeMenu && <div className="work-filter-scheme">{schemeMenu}</div>}
      {collapsed ? <button ref={toggle} type="button" className="secondary work-filter-toggle" aria-label="筛选工作"
        aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((current) => !current)}>
        <SlidersHorizontal size={14} aria-hidden="true" />筛选
        {count > 0 && <span className="work-filter-badge">{count}</span>}
      </button> : filterControls}
      <span className="result-count" aria-live="polite">{resultCount} 条结果</span>
    </div>
    {chips.length > 0 && <div className="work-filter-chips" role="group" aria-label="当前筛选条件">
      {chips.map((chip) => <button key={chip.id} type="button" className="work-filter-chip" aria-label={`移除${chip.label}`} title={chip.hint}
        onClick={chip.remove}><span>{chip.label}</span><X size={12} aria-hidden="true" /></button>)}
      <button type="button" className="text-button work-filter-clear" onClick={clear}>清除筛选</button>
    </div>}
    {collapsed && open && <div id={panelId} className="work-filter-panel scroll-isolation-boundary" ref={panelIsolation}
      role="region" aria-label="工作筛选条件">
      {filterControls}
      <div className="work-filter-panel-footer"><button type="button" className="text-button" onClick={() => {
        setOpen(false); toggle.current?.focus();
      }}>收起筛选</button></div>
    </div>}
  </div>;
}
