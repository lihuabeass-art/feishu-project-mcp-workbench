import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";

const inset = 4;
const hitSize = 12;
const revealDistance = 24;
const hideDelay = 800;

export function SchedulePoolList({ children, label }: { children: ReactNode; label?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  return <div className="schedule-pool-list" ref={scrollRef} aria-label={label}>
    <ScheduleScrollbars scrollRef={scrollRef} verticalOnly />
    {children}
  </div>;
}

type Axis = "vertical" | "horizontal";

function thumbMetrics(viewportSize: number, contentSize: number, scrollOffset: number, headerBottom?: number) {
  const maxScroll = contentSize - viewportSize;
  const bodySize = viewportSize - (headerBottom ?? 0);
  const trackStart = headerBottom ?? inset;
  const trackSize = viewportSize - trackStart - inset - hitSize;
  if (maxScroll <= 0 || trackSize <= 24) return null;

  const size = Math.max(24, trackSize * bodySize / (bodySize + maxScroll));
  const travel = trackSize - size;
  const progress = Math.max(0, Math.min(1, scrollOffset / maxScroll));
  return { start: trackStart + progress * travel, size, maxScroll, scrollPerPixel: maxScroll / travel };
}

type Thumb = NonNullable<ReturnType<typeof thumbMetrics>>;

function positionThumb(element: HTMLSpanElement, axis: Axis, thumb: Thumb | null, crossOffset: number) {
  if (element.hidden !== !thumb) element.hidden = !thumb;
  if (!thumb) return;
  const vertical = axis === "vertical";
  const width = `${vertical ? hitSize : thumb.size}px`;
  const height = `${vertical ? thumb.size : hitSize}px`;
  const x = vertical ? crossOffset : thumb.start;
  const y = vertical ? thumb.start : crossOffset;
  const transform = `translate3d(${x}px, ${y}px, 0px)`;
  if (element.style.width !== width) element.style.width = width;
  if (element.style.height !== height) element.style.height = height;
  if (element.style.transform !== transform) element.style.transform = transform;
}

export function ScheduleScrollbars({ scrollRef, calendarRef, headerRef, verticalOnly = false }: {
  scrollRef: RefObject<HTMLDivElement | null>;
  calendarRef?: RefObject<HTMLDivElement | null>;
  headerRef?: RefObject<HTMLDivElement | null>;
  verticalOnly?: boolean;
}) {
  const verticalRef = useRef<HTMLSpanElement>(null);
  const horizontalRef = useRef<HTMLSpanElement>(null);
  const thumbs = useRef<Record<Axis, Thumb | null>>({ vertical: null, horizontal: null });
  const repaint = useRef<(() => void) | null>(null);
  const [visible, setVisible] = useState(false);
  const [nearVertical, setNearVertical] = useState(false);
  const [nearHorizontal, setNearHorizontal] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const drag = useRef<{
    pointerId: number;
    axis: Axis;
    start: number;
    appliedPosition: number;
    offset: number;
    scrollPerPixel: number;
    page: Element | null;
    frame?: number;
    pendingPosition?: number;
  } | null>(null);

  const show = useCallback(() => {
    setVisible(true);
    window.clearTimeout(hideTimer.current);
    if (!drag.current) hideTimer.current = window.setTimeout(() => setVisible(false), hideDelay);
  }, []);

  const onPointerPosition = useCallback((event: Pick<PointerEvent, "pointerType" | "clientX" | "clientY">) => {
    const viewport = scrollRef.current;
    const header = headerRef?.current;
    if (!viewport || (!verticalOnly && !header) || event.pointerType !== "mouse" || drag.current) return;
    const bounds = viewport.getBoundingClientRect();
    const x = event.clientX - bounds.left - viewport.clientLeft;
    const y = event.clientY - bounds.top - viewport.clientTop;
    const right = viewport.clientWidth - x;
    const bottom = viewport.clientHeight - y;
    const insideBody = x >= 0 && y >= 0 && right >= 0 && bottom >= 0 &&
      (!header || event.clientY >= header.getBoundingClientRect().bottom);
    setNearVertical(insideBody && right <= revealDistance && bottom >= inset + hitSize);
    setNearHorizontal(insideBody && bottom <= revealDistance && x >= inset && right >= inset + hitSize);
  }, [headerRef, scrollRef, verticalOnly]);

  useEffect(() => {
    const viewport = scrollRef.current;
    const calendar = calendarRef?.current;
    const header = headerRef?.current;
    const vertical = verticalRef.current;
    const horizontal = horizontalRef.current;
    if (!viewport || (!verticalOnly && (!calendar || !header)) || !vertical || !horizontal) return;

    let dimensions = { width: 0, height: 0, scrollWidth: 0, scrollHeight: 0, headerOffset: 0, headerHeight: 0 };
    let previousTop: number | undefined;
    let previousLeft: number | undefined;
    const paint = (force = false) => {
      const { scrollTop, scrollLeft } = viewport;
      if (!force && scrollTop === previousTop && scrollLeft === previousLeft) return;
      previousTop = scrollTop;
      previousLeft = scrollLeft;
      const { width, height, scrollWidth, scrollHeight, headerOffset, headerHeight } = dimensions;
      // 读取提示在表头上方时，表头先随内容滚动，再吸附到视口顶部。
      const headerBottom = verticalOnly ? undefined : Math.max(0, headerOffset - scrollTop) + headerHeight;
      thumbs.current.vertical = thumbMetrics(height, scrollHeight, scrollTop, headerBottom);
      thumbs.current.horizontal = verticalOnly ? null : thumbMetrics(width, scrollWidth, scrollLeft);
      positionThumb(vertical, "vertical", thumbs.current.vertical, width - hitSize);
      positionThumb(horizontal, "horizontal", thumbs.current.horizontal, height - hitSize);
    };
    const measure = () => {
      const { clientWidth, clientHeight, clientTop, scrollWidth, scrollHeight, scrollTop, scrollLeft } = viewport;
      const viewportTop = viewport.getBoundingClientRect().top + clientTop;
      dimensions = {
        width: clientWidth,
        height: clientHeight,
        scrollWidth,
        scrollHeight,
        headerOffset: calendar ? calendar.getBoundingClientRect().top - viewportTop + scrollTop : 0,
        headerHeight: header?.getBoundingClientRect().height ?? 0,
      };
      paint(true);
      const active = drag.current;
      const thumb = active && thumbs.current[active.axis];
      if (active && thumb) {
        active.start = active.appliedPosition;
        active.offset = active.axis === "vertical" ? scrollTop : scrollLeft;
        active.scrollPerPixel = thumb.scrollPerPixel;
      }
    };
    const onScroll = () => {
      paint();
      if (!drag.current) show();
    };
    const clearProximity = () => {
      setNearVertical(false);
      setNearHorizontal(false);
    };
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(viewport);
    if (calendar) observer?.observe(calendar);
    if (header) observer?.observe(header);
    const observeChildren = () => {
      if (verticalOnly) Array.from(viewport.children).forEach((child) => observer?.observe(child));
      measure();
    };
    const banners = new MutationObserver(observeChildren);
    banners.observe(viewport, { childList: true, subtree: verticalOnly });
    repaint.current = paint;
    viewport.addEventListener("scroll", onScroll, { passive: true });
    viewport.addEventListener("pointerenter", onPointerPosition, { passive: true });
    viewport.addEventListener("pointermove", onPointerPosition, { passive: true });
    viewport.addEventListener("pointerleave", clearProximity);
    observeChildren();
    return () => {
      observer?.disconnect();
      banners.disconnect();
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("pointerenter", onPointerPosition);
      viewport.removeEventListener("pointermove", onPointerPosition);
      viewport.removeEventListener("pointerleave", clearProximity);
      window.clearTimeout(hideTimer.current);
      const active = drag.current;
      if (active?.frame !== undefined) window.cancelAnimationFrame(active.frame);
      active?.page?.classList.remove("is-scrollbar-dragging");
      drag.current = null;
      repaint.current = null;
    };
  }, [calendarRef, headerRef, onPointerPosition, scrollRef, show, verticalOnly]);

  function beginDrag(event: ReactPointerEvent<HTMLSpanElement>, axis: Axis) {
    const viewport = scrollRef.current;
    const thumb = thumbs.current[axis];
    if (!viewport || !thumb || event.button !== 0 || drag.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = axis === "vertical" ? event.clientY : event.clientX;
    drag.current = {
      pointerId: event.pointerId,
      axis,
      start,
      appliedPosition: start,
      offset: axis === "vertical" ? viewport.scrollTop : viewport.scrollLeft,
      scrollPerPixel: thumb.scrollPerPixel,
      page: viewport.closest(".schedule-page"),
    };
    drag.current.page?.classList.add("is-scrollbar-dragging");
    show();
  }

  function flushDrag() {
    const viewport = scrollRef.current;
    const active = drag.current;
    if (!viewport || !active || active.pendingPosition === undefined) return;
    const position = active.pendingPosition;
    active.frame = undefined;
    active.pendingPosition = undefined;
    active.appliedPosition = position;
    const thumb = thumbs.current[active.axis];
    if (!thumb) return;
    const requested = active.offset + (position - active.start) * active.scrollPerPixel;
    const offset = Math.max(0, Math.min(thumb.maxScroll, requested));
    if (active.axis === "vertical") {
      viewport.scrollTop = offset;
    } else {
      viewport.scrollLeft = offset;
    }
    repaint.current?.();
  }

  function moveDrag(event: ReactPointerEvent<HTMLSpanElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    active.pendingPosition = active.axis === "vertical" ? event.clientY : event.clientX;
    active.frame ??= window.requestAnimationFrame(flushDrag);
  }

  function endDrag(event: ReactPointerEvent<HTMLSpanElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.frame !== undefined) {
      window.cancelAnimationFrame(active.frame);
      flushDrag();
    }
    drag.current = null;
    onPointerPosition(event);
    active.page?.classList.remove("is-scrollbar-dragging");
    show();
  }

  return (
    <div className="schedule-scrollbars" aria-hidden="true">
      {(["vertical", "horizontal"] as const).map((axis) => {
        const isVisible = visible || (axis === "vertical" ? nearVertical : nearHorizontal);
        return (
          <span key={axis} ref={axis === "vertical" ? verticalRef : horizontalRef}
            className={`schedule-scroll-thumb is-${axis}${isVisible ? " is-visible" : ""}`}
            onPointerDown={(event) => beginDrag(event, axis)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} />
        );
      })}
    </div>
  );
}
