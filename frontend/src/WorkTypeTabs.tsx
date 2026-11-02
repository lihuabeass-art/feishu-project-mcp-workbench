import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./WorkTypeTabs.css";

type TypeOption = { key: string; label: string; count: number };
type Drag = { pointerId: number; x: number; y: number; left: number; moved: boolean };

export function WorkTypeTabs({ options, selected, total, onChange }: {
  options: TypeOption[];
  selected: string[];
  total: number;
  onChange: (key: string) => void;
}) {
  const nav = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [edges, setEdges] = useState({ start: false, end: false });
  const activeKey = selected.length ? options.find((option) => selected.includes(option.key))?.key : "";
  // 父页面的搜索等更新不应把用户正在浏览的类型栏拉回选中项。
  const contentKey = JSON.stringify([options, total]);
  const selectionKey = JSON.stringify(selected);

  function updateEdges() {
    const container = viewport.current;
    if (!container) return;
    const next = { start: container.scrollLeft > 1,
      end: container.scrollLeft + container.clientWidth < container.scrollWidth - 1 };
    setEdges((current) => current.start === next.start && current.end === next.end ? current : next);
  }

  function scrollTo(left: number, smooth = false) {
    const container = viewport.current;
    if (!container) return;
    const target = Math.max(0, Math.min(left, container.scrollWidth - container.clientWidth));
    if (smooth && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
      container.scrollTo({ left: target, behavior: "smooth" });
    else container.scrollLeft = target;
    updateEdges();
  }

  function reveal(button: HTMLButtonElement) {
    const container = viewport.current;
    if (!container || !container.clientWidth) return;
    const left = button.offsetLeft;
    const right = left + button.offsetWidth;
    if (left < container.scrollLeft + 8) scrollTo(left - 8);
    else if (right > container.scrollLeft + container.clientWidth - 8)
      scrollTo(button.offsetWidth > container.clientWidth ? left : right - container.clientWidth + 8);
  }

  useLayoutEffect(() => {
    const container = viewport.current;
    const navigation = nav.current;
    const tabTrack = track.current;
    if (!container || !navigation || !tabTrack) return;
    function measure() {
      const needsOverflow = tabTrack!.scrollWidth > navigation!.clientWidth + 1;
      const active = buttons.current.get(activeKey ?? "");
      if (!needsOverflow && document.activeElement?.matches(".work-type-scroll-button"))
        active?.focus({ preventScroll: true });
      setOverflow(needsOverflow);
      if (active) reveal(active);
      updateEdges();
    }
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(navigation);
    observer?.observe(container);
    observer?.observe(tabTrack);
    return () => observer?.disconnect();
  }, [activeKey, selectionKey, contentKey, overflow]);

  useLayoutEffect(() => {
    const container = viewport.current;
    if (!container) return;
    function wheel(event: WheelEvent) {
      if (event.ctrlKey || container!.scrollWidth <= container!.clientWidth + 1) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 20
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? container!.clientWidth : 1;
      // 连续滚轮及边界输入只浏览类型，避免把下方工作清单一起滚走。
      event.preventDefault();
      event.stopPropagation();
      scrollTo(container!.scrollLeft + delta * unit);
    }
    container.addEventListener("wheel", wheel, { passive: false });
    return () => container.removeEventListener("wheel", wheel);
  }, []);

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    suppressClick.current = drag.current.moved;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div className="work-type-nav" ref={nav}>
      {overflow && <button type="button" className="icon-button work-type-scroll-button"
        aria-label="向前浏览工作类型" title="向前浏览工作类型" disabled={!edges.start}
        onClick={() => scrollTo(viewport.current!.scrollLeft - viewport.current!.clientWidth * 0.8, true)}>
        <ChevronLeft size={16} aria-hidden="true" />
      </button>}
      <div className="tabs work-type-viewport" role="group" aria-label="工作类型" ref={viewport}
        data-overflow={overflow} data-dragging={dragging} onScroll={updateEdges}
        title={overflow ? "滚轮或左右拖动可浏览更多类型" : undefined}
        onFocusCapture={(event) => {
          // 鼠标按下时先保留目标和拖动起点；选择完成后再定位，键盘焦点则立即可见。
          if (!drag.current && event.target instanceof HTMLButtonElement) reveal(event.target);
        }}
        onPointerDown={(event) => {
          suppressClick.current = false;
          if (event.pointerType !== "mouse" || event.button !== 0 || !overflow) return;
          drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
            left: event.currentTarget.scrollLeft, moved: false };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.pointerId !== event.pointerId) return;
          if (event.buttons !== 1) { endDrag(event); return; }
          const delta = event.clientX - current.x;
          if (!current.moved) {
            if (Math.abs(delta) < 5 || Math.abs(delta) <= Math.abs(event.clientY - current.y)) return;
            current.moved = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
          }
          event.preventDefault();
          scrollTo(current.left - delta);
        }}
        onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
        onDragStart={(event) => event.preventDefault()}
        onClickCapture={(event) => {
          if (!suppressClick.current || event.detail === 0) return;
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}>
        <div className="work-type-track" ref={track}>
          {[{ key: "", label: "全部工作", count: total }, ...options].map((option) => {
            const active = option.key ? selected.includes(option.key) : !selected.length;
            return <button key={option.key} type="button" className={active ? "tab active" : "tab"}
              aria-pressed={active} title={option.label}
              ref={(node) => { if (node) buttons.current.set(option.key, node); else buttons.current.delete(option.key); }}
              onClick={() => onChange(option.key)}>
              {option.label}<span>{option.count}</span>
            </button>;
          })}
        </div>
      </div>
      {overflow && <button type="button" className="icon-button work-type-scroll-button"
        aria-label="向后浏览工作类型" title="向后浏览工作类型" disabled={!edges.end}
        onClick={() => scrollTo(viewport.current!.scrollLeft + viewport.current!.clientWidth * 0.8, true)}>
        <ChevronRight size={16} aria-hidden="true" />
      </button>}
    </div>
  );
}
