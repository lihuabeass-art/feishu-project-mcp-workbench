import { useLayoutEffect, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { typeColorStyle } from "./model";
import "./CompactTypeTabs.css";

export type CompactTypeOption = { key: string; label: string; count: number };

export function compactTypeTabId(panelId: string, key: string) {
  return `${panelId}-tab-${key ? `type-${encodeURIComponent(key)}` : "all"}`;
}

export function CompactTypeTabs({ options, selected, total, panelId, onChange }: {
  options: CompactTypeOption[];
  selected: string;
  total: number;
  panelId: string;
  onChange: (key: string) => void;
}) {
  const nav = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const moreButton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const [overflow, setOverflow] = useState(false);
  const [edges, setEdges] = useState({ start: false, end: false });
  const tabs = [{ key: "", label: "全部", count: total }, ...options];

  function updateEdges() {
    const container = viewport.current;
    if (!container) return;
    const next = { start: container.scrollLeft > 1,
      end: container.scrollLeft + container.clientWidth < container.scrollWidth - 1 };
    setEdges((current) => current.start === next.start && current.end === next.end ? current : next);
  }

  // 按整行可用宽度判断是否需要“更多”，避免入口自身占宽导致无法收回。
  // 下划线随文字自然宽度移动；选中项在窗口缩窄或菜单选择后仍保持可见。
  useLayoutEffect(() => {
    const active = buttons.current.get(selected);
    const container = viewport.current;
    const navigation = nav.current;
    const tabTrack = track.current;
    if (!active || !container || !navigation || !tabTrack) return;
    const measure = () => {
      const needsOverflow = tabTrack.scrollWidth > navigation.clientWidth + 1;
      // 入口即将消失时，先将它或菜单中的焦点交回仍在页面上的选中 Tab。
      if (!needsOverflow && (document.activeElement === moreButton.current ||
        menu.current?.contains(document.activeElement))) active.focus({ preventScroll: true });
      setOverflow(needsOverflow);
      setIndicator((current) => {
        const next = { left: active.offsetLeft, width: active.offsetWidth };
        return current?.left === next.left && current.width === next.width ? current : next;
      });
      const left = active.offsetLeft - 12;
      const right = active.offsetLeft + active.offsetWidth + 12;
      if (left < container.scrollLeft) container.scrollLeft = left;
      else if (right > container.scrollLeft + container.clientWidth)
        container.scrollLeft = right - container.clientWidth;
      updateEdges();
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(container);
    observer?.observe(navigation);
    observer?.observe(tabTrack);
    observer?.observe(active);
    return () => observer?.disconnect();
  }, [selected, options, total, overflow]);

  return (
    <div className="list-mode-type-nav" ref={nav}>
    <div className="list-mode-type-viewport" ref={viewport} onScroll={updateEdges}
      data-overflow-start={edges.start} data-overflow-end={edges.end}>
      <div className="list-mode-type-tabs" role="tablist" aria-label="事项类型" ref={track}>
        {indicator && <span className="list-mode-type-indicator" aria-hidden="true"
          style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }} />}
        {tabs.map((tab, index) => (
          <button key={tab.key} type="button" role="tab"
            id={compactTypeTabId(panelId, tab.key)}
            aria-controls={panelId} aria-selected={selected === tab.key}
            tabIndex={selected === tab.key ? 0 : -1}
            className="list-mode-type-tab"
            title={tab.label}
            ref={(node) => { if (node) buttons.current.set(tab.key, node); else buttons.current.delete(tab.key); }}
            onClick={() => onChange(tab.key)}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
              else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = tabs.length - 1;
              else return;
              event.preventDefault();
              buttons.current.get(tabs[next].key)?.focus({ preventScroll: true });
              onChange(tabs[next].key);
            }}>
            <span className="list-mode-type-label">{tab.label}</span>{" "}<span className="list-mode-type-count">{tab.count}</span>
          </button>
        ))}
      </div>
    </div>
    {overflow && <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button ref={moreButton} type="button" className="list-mode-type-more" aria-label="查看全部事项类型" title="查看全部事项类型">
          更多<ChevronDown size={12} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content ref={menu} className="list-mode-type-menu" align="end" sideOffset={6} collisionPadding={10}
          aria-label="全部事项类型">
          <DropdownMenu.Label className="list-mode-type-menu-heading">事项类型</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={selected} onValueChange={onChange}>
            {tabs.map((tab) => <DropdownMenu.RadioItem key={tab.key} value={tab.key} className="list-mode-type-option"
              textValue={tab.label} style={tab.key ? typeColorStyle(tab.key) : undefined}>
              <span className="list-mode-type-option-mark" aria-hidden="true">
                {tab.key && <span className="type-dot" />}
              </span>
              <span className="list-mode-type-option-label">{tab.label}</span>{" "}
              <span className="list-mode-type-option-count">{tab.count}</span>
              <span className="list-mode-type-option-check">
                <DropdownMenu.ItemIndicator><Check size={13} aria-hidden="true" /></DropdownMenu.ItemIndicator>
              </span>
            </DropdownMenu.RadioItem>)}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>}
    </div>
  );
}
