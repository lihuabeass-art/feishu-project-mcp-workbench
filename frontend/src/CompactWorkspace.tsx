import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Bug,
  ChevronDown,
  FileText,
  Leaf,
  LoaderCircle,
  Maximize2,
  Minus,
  Pin,
  PinOff,
  RefreshCw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { itemKey, localTime, typeColorStyle } from "./model";
import { CompactTypeTabs, compactTypeTabId, type CompactTypeOption } from "./CompactTypeTabs";
import { Select } from "./Select";
import {
  changeWorkFilter, emptyWorkFilters, filterWorkItems,
  workFilterCount, type WorkFilters, type WorkFilterOptions,
} from "./workFilters";
import "./CompactWorkspace.filters.css";
import type { CachedItem } from "./types";
import type { WindowAction } from "./displayMode";

type Peek = { key: string; up: boolean };
function truncated(row: HTMLElement) {
  const title = row.querySelector<HTMLElement>(".list-mode-title");
  return !!title && title.scrollHeight > title.clientHeight + 1;
}

function keyboardFocus(element: HTMLElement) {
  try {
    return element.matches(":focus-visible");
  } catch {
    return false;
  }
}

function FlowLine({ item }: { item: CachedItem }) {
  const f = item.flow;
  return (
    <span className="list-mode-flow">
      {(f.kind === "node" || f.kind === "both") && (
        <span>
          <i className="status-dot" />
          节点 · {f.node_name || "名称未提供"}
        </span>
      )}
      {(f.kind === "state" || f.kind === "both") && (
        <span>
          <i className="status-dot amber" />
          状态 · {f.start_state_key_name || "未提供"}
          {f.end_state_key_name && (
            <>
              <ArrowRight size={11} />
              {f.end_state_key_name}
            </>
          )}
        </span>
      )}
      {f.kind === "none" && <span className="muted">流程信息未提供</span>}
    </span>
  );
}

export function CompactWorkspace({
  items,
  filters,
  onFiltersChange,
  loading,
  emptyText,
  typeName,
  typeOptions,
  filterOptions: facets,
  selectedKey,
  select,
  detail,
  alerts,
  lastSync,
  refresh,
  pinned,
  pin,
  expand,
  windowControls,
  windowAction,
  modeBusy,
}: {
  items: CachedItem[];
  filters: WorkFilters;
  onFiltersChange: (filters: WorkFilters) => void;
  loading: boolean;
  emptyText: string;
  typeName: (item: CachedItem) => string;
  typeOptions: CompactTypeOption[];
  filterOptions: WorkFilterOptions;
  selectedKey: string | null;
  select: (key: string | null) => void;
  detail: ReactNode;
  alerts: ReactNode;
  lastSync: number | null | undefined;
  refresh: { run: () => void; disabled: boolean; syncing: boolean };
  pinned: boolean;
  pin: (pinned: boolean) => void;
  expand: () => void;
  windowControls: boolean;
  windowAction: (action: WindowAction) => void;
  modeBusy: boolean;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
  const typePanelId = useId();
  const filterButton = useRef<HTMLButtonElement>(null);
  const [peek, setPeek] = useState<Peek | null>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const listRef = useRef<HTMLDivElement>(null);
  const peekRef = useRef<HTMLSpanElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const opened = useRef<string | null>(null);
  const restoring = useRef(false);
  const hoverTimer = useRef<number | undefined>(undefined);
  const showDetail = !!detail;
  const cancelHover = () => window.clearTimeout(hoverTimer.current);
  const extraCount = [filters.flowKind, filters.nodeName, filters.stateName].filter((values) => values.length > 0).length;
  const filterCount = workFilterCount({ ...filters, type: [] });
  const selectedType = filters.type[0] || "";
  const { spaces, projects, flowKinds } = facets;
  const visibleItems = filterWorkItems(items, filters);

  function changeFilters(next: WorkFilters) {
    onFiltersChange(next);
    cancelHover();
    setPeek(null);
    if (listRef.current) listRef.current.scrollTop = 0;
  }

  function changeType(key: string) {
    if (key === selectedType) return;
    changeFilters({ ...filters, type: key ? [key] : [],
      typeLabel: key ? { [key]: typeOptions.find((option) => option.key === key)?.label || key } : {} });
  }

  function clearFilters() {
    changeFilters({ ...emptyWorkFilters, type: filters.type, typeLabel: filters.typeLabel });
  }

  const activeFilters = [
    ...(filters.query.trim() ? [{ id: "query", label: `搜索：${filters.query}`,
      remove: () => changeFilters({ ...filters, query: "" }) }] : []),
    ...([
      { key: "space", label: "空间", options: spaces },
      { key: "project", label: "所属项目", options: projects },
      { key: "flowKind", label: "流程类型", options: flowKinds },
      { key: "nodeName", label: "当前节点", options: facets.node.options },
      { key: "stateName", label: "当前状态", options: facets.state.options },
    ] as const).flatMap(({ key, label, options }) => filters[key].map((value) => ({
      id: `${key}:${value}`, label: `${label}：${options.find((option) => option.value === value)?.label || value}`,
      remove: () => {
        const values = filters[key].filter((entry) => entry !== value);
        changeFilters(key === "nodeName" || key === "stateName"
          ? { ...filters, [key]: values }
          : changeWorkFilter(filters, key, values, options));
      },
    }))),
  ];

  useEffect(() => cancelHover, []);

  useEffect(() => {
    if (!peek) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPeek(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [peek]);

  // 靠近清单底部时向上展开，展开层不推挤也不被裁切。
  useLayoutEffect(() => {
    if (!peek || peek.up || !peekRef.current || !listRef.current) return;
    if (peekRef.current.getBoundingClientRect().bottom > listRef.current.getBoundingClientRect().bottom - 6)
      setPeek({ ...peek, up: true });
  }, [peek]);

  // 详情覆盖在清单之上、清单保持挂载，返回时滚动位置自然保留，焦点回到原事项。
  useEffect(() => {
    if (showDetail && selectedKey) {
      setFiltersOpen(false);
      opened.current = selectedKey;
      cancelHover();
      setPeek(null);
      shellRef.current?.querySelector<HTMLButtonElement>(".detail-top button")?.focus();
    } else if (!showDetail && opened.current) {
      const row = rows.current.get(opened.current);
      opened.current = null;
      restoring.current = true;
      row?.focus({ preventScroll: true });
      restoring.current = false;
    }
  }, [showDetail, selectedKey]);

  return (
    <div className="list-mode-shell" ref={shellRef}>
      <header
        className="list-mode-titlebar"
        onMouseDown={(event) => {
          if (event.button === 0 && event.detail < 2 && !(event.target as HTMLElement).closest("button"))
            windowAction("drag");
        }}
      >
        <span className="list-mode-brand" aria-hidden="true">
          <Leaf size={13} strokeWidth={1.8} />
        </span>
        <h1 className="list-mode-heading">
          我的工作<span>{items.length}</span>
        </h1>
        <div className="list-mode-actions">
          <button
            className="icon-button"
            aria-label={refresh.syncing ? "正在同步" : "立即刷新"}
            title={refresh.syncing ? "正在同步" : "立即刷新"}
            disabled={refresh.disabled}
            onClick={refresh.run}
          >
            <RefreshCw size={15} className={refresh.syncing ? "spin" : ""} />
          </button>
          <button
            className={pinned ? "icon-button active" : "icon-button"}
            aria-label="窗口置顶"
            aria-pressed={pinned}
            title={pinned ? "取消置顶" : "置顶窗口"}
            disabled={modeBusy}
            onClick={() => pin(!pinned)}
          >
            {pinned ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
          <button
            className="icon-button"
            aria-label="切换到完整模式"
            title="切换到完整模式"
            disabled={modeBusy}
            onClick={expand}
          >
            <Maximize2 size={15} />
          </button>
          {windowControls && (
            <>
              <i className="list-mode-divider" aria-hidden="true" />
              <button className="icon-button" aria-label="最小化" title="最小化" onClick={() => windowAction("minimize")}>
                <Minus size={15} />
              </button>
              <button className="icon-button list-mode-close" aria-label="关闭" title="关闭" onClick={() => windowAction("close")}>
                <X size={15} />
              </button>
            </>
          )}
        </div>
      </header>
      {alerts && <div className="list-mode-alerts">{alerts}</div>}
      <div className="list-mode-body">
        <div
          className="list-mode-filters"
          inert={showDetail}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.defaultPrevented && filtersOpen) {
              setFiltersOpen(false);
              filterButton.current?.focus();
            }
          }}
        >
          <CompactTypeTabs options={typeOptions} selected={selectedType} total={items.length}
            panelId={typePanelId} onChange={changeType} />
          <div className="list-mode-filterbar">
            <button
              ref={filterButton}
              className={`list-mode-filter-toggle${filterCount ? " active" : ""}`}
              aria-label="清单筛选"
              aria-expanded={filtersOpen}
              aria-controls={filtersId}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal size={13} aria-hidden="true" />
              筛选{filterCount > 0 && <span>{filterCount}</span>}
            </button>
            {filterCount > 0 && <button className="text-button" onClick={clearFilters}>清除</button>}
            <span className="list-mode-result-count" role="status">
              {filterCount || selectedType ? `${visibleItems.length} / ${items.length} 项` : "全部事项"}
            </span>
          </div>
          {activeFilters.length > 0 && <div className="list-mode-filter-chips" role="group" aria-label="当前筛选条件">
            {activeFilters.map((filter) => <button key={filter.id} className="list-mode-filter-chip"
              aria-label={`取消${filter.label}`} onClick={filter.remove}>
              <span>{filter.label}</span><X size={11} aria-hidden="true" />
            </button>)}
          </div>}
          {filtersOpen && <section id={filtersId} className="list-mode-filter-panel" aria-label="清单筛选条件">
            <label>
              <span>搜索</span>
              <input className="list-mode-filter-search" aria-label="清单搜索工作" value={filters.query}
                placeholder="搜索标题、编号、空间或项目…"
                onChange={(event) => changeFilters({ ...filters, query: event.target.value })} />
            </label>
            {spaces.length > 0 && <label>
              <span>空间</span>
              <Select multiple ariaLabel="清单空间" className="compact" value={filters.space}
                onChange={(space) => changeFilters(changeWorkFilter(filters, "space", space, spaces))}
                options={[{ value: "", label: "全部空间" }, ...spaces]} />
            </label>}
            {projects.length > 0 && <label>
              <span>所属项目</span>
              <Select multiple ariaLabel="清单所属项目" className="compact" value={filters.project}
                onChange={(project) => changeFilters(changeWorkFilter(filters, "project", project, projects))}
                options={[{ value: "", label: "全部项目" }, ...projects]} />
            </label>}
            <details className="list-mode-filter-more">
              <summary>更多条件{extraCount > 0 && <span>{extraCount}</span>}<ChevronDown size={12} aria-hidden="true" /></summary>
              <div className="list-mode-filter-extra">
                {flowKinds.length > 0 && <label>
                  <span>流程类型</span>
                  <Select multiple ariaLabel="清单流程类型" className="compact" value={filters.flowKind}
                    onChange={(flowKind) => changeFilters(changeWorkFilter(filters, "flowKind", flowKind, flowKinds))}
                    options={[{ value: "", label: "全部流程类型" }, ...flowKinds]} />
                </label>}
                {facets.node.visible && <label>
                  <span>当前节点</span>
                  <Select multiple ariaLabel="清单当前节点" className="compact" value={filters.nodeName}
                    onChange={(nodeName) => changeFilters({ ...filters, nodeName })}
                    options={[{ value: "", label: "全部节点" }, ...facets.node.options]} />
                </label>}
                {facets.state.visible && <label>
                  <span>当前状态</span>
                  <Select multiple ariaLabel="清单当前状态" className="compact" value={filters.stateName}
                    onChange={(stateName) => changeFilters({ ...filters, stateName })}
                    options={[{ value: "", label: "全部状态" }, ...facets.state.options]} />
                </label>}
              </div>
            </details>
          </section>}
        </div>
        <div
          className="list-mode-list"
          ref={listRef}
          aria-label="工作清单"
          role="region"
          inert={showDetail}
          onScroll={() => {
            cancelHover();
            setPeek(null);
          }}
        >
          <div key={selectedType} id={typePanelId} role="tabpanel" className="list-mode-type-panel"
            aria-labelledby={compactTypeTabId(typePanelId, selectedType)} tabIndex={0}>
          {loading && !items.length ? (
            <div className="list-mode-empty">
              <LoaderCircle className="spin" size={20} />
              <p>正在读取本地工作</p>
            </div>
          ) : visibleItems.length ? (
            visibleItems.map((item) => {
              const key = itemKey(item);
              const open = peek?.key === key;
              const name = item.name || "名称未提供";
              return (
                <button
                  key={key}
                  ref={(node) => {
                    if (node) rows.current.set(key, node);
                    else rows.current.delete(key);
                  }}
                  className={`list-mode-item${selectedKey === key ? " selected" : ""}${item.is_completed === true ? " done" : ""}`}
                  onClick={() => select(key)}
                  onMouseEnter={(event) => {
                    const row = event.currentTarget;
                    cancelHover();
                    // 延迟由计时器而非 CSS 动画实现：减少动态效果时动画被全局关闭，划过清单仍不能逐行弹出。
                    hoverTimer.current = window.setTimeout(() => {
                      if (truncated(row)) setPeek({ key, up: false });
                    }, 300);
                  }}
                  onMouseLeave={() => {
                    cancelHover();
                    setPeek((current) => (current?.key === key ? null : current));
                  }}
                  onFocus={(event) => {
                    if (!restoring.current && keyboardFocus(event.currentTarget) && truncated(event.currentTarget))
                      setPeek({ key, up: false });
                  }}
                  onBlur={() => setPeek((current) => (current?.key === key ? null : current))}
                >
                  <span className="list-mode-type" style={typeColorStyle(item.id.work_item_type_key)} title={typeName(item)}>
                    {item.id.work_item_type_key === "issue" ? <Bug size={16} /> : <FileText size={16} />}
                    <span className="sr-only">{typeName(item)}</span>
                  </span>
                  <span className="list-mode-main">
                    <span className="list-mode-title-wrap">
                      <span className="list-mode-title">{name}</span>
                      {open && (
                        <span
                          ref={peekRef}
                          className={`list-mode-peek${peek.up ? " up" : ""}`}
                          aria-hidden="true"
                        >
                          {name}
                        </span>
                      )}
                    </span>
                    <FlowLine item={item} />
                  </span>
                </button>
              );
            })
          ) : (
            <div className="list-mode-empty">
              <p>{filterCount ? "没有符合条件的事项" : selectedType ? "当前类型暂无事项" : emptyText}</p>
              {filterCount ? (
                <button className="secondary" onClick={clearFilters}>清除筛选</button>
              ) : selectedType ? (
                <button className="secondary" onClick={() => changeType("")}>查看全部类型</button>
              ) : (
                <button className="secondary" onClick={expand} disabled={modeBusy}>打开完整模式</button>
              )}
            </div>
          )}
          </div>
        </div>
        <footer className="list-mode-footer">
          <span>最近同步 {localTime(lastSync)}</span>
          <span>未完成优先</span>
        </footer>
        {detail}
      </div>
    </div>
  );
}
