// @vitest-environment jsdom
import { useRef } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SchedulePoolList, ScheduleScrollbars } from "./ScheduleScrollbars";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("清单滚动条随滚动和靠近边缘显示，并随内容变化隐藏", () => {
  vi.useFakeTimers();
  let measure!: () => void;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { measure = callback; }
    observe() {}
    disconnect() {}
  });
  const { container } = render(<SchedulePoolList><div>事项</div></SchedulePoolList>);
  const viewport = container.querySelector<HTMLElement>(".schedule-pool-list")!;
  let height = 640;
  Object.defineProperties(viewport, {
    clientWidth: { value: 320 }, clientHeight: { value: 240 },
    scrollWidth: { value: 320 }, scrollHeight: { get: () => height },
  });
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 90, 320, 240));
  measure();
  const vertical = viewport.querySelector<HTMLElement>(".is-vertical")!;
  const horizontal = viewport.querySelector<HTMLElement>(".is-horizontal")!;
  expect(vertical.hidden).toBe(false);
  expect(horizontal.hidden).toBe(true);
  fireEvent.scroll(viewport);
  expect(vertical.classList.contains("is-visible")).toBe(true);
  act(() => vi.advanceTimersByTime(800));
  expect(vertical.classList.contains("is-visible")).toBe(false);
  fireEvent.pointerEnter(viewport, { clientX: 415, clientY: 190, pointerType: "mouse" });
  expect(vertical.classList.contains("is-visible")).toBe(true);
  fireEvent.pointerLeave(viewport);
  height = 240;
  measure();
  expect(vertical.hidden).toBe(true);
});

function renderCalendar() {
  let measure!: () => void;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { measure = callback; }
    observe() {}
    disconnect() {}
  });

  function Calendar() {
    const scrollRef = useRef<HTMLDivElement>(null);
    const calendarRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    return (
      <div className="schedule-page">
        <div ref={scrollRef} data-testid="viewport">
          <ScheduleScrollbars scrollRef={scrollRef} calendarRef={calendarRef} headerRef={headerRef} />
          <div ref={calendarRef} data-testid="calendar">
            <div ref={headerRef} data-testid="header" />
          </div>
        </div>
      </div>
    );
  }

  const { getByTestId, unmount } = render(<Calendar />);
  const viewport = getByTestId("viewport");
  let scrollHeight = 640;
  Object.defineProperties(viewport, {
    clientWidth: { value: 320 },
    clientHeight: { value: 240 },
    scrollWidth: { value: 560 },
    scrollHeight: { get: () => scrollHeight },
  });
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 90, 320, 240));
  vi.spyOn(getByTestId("calendar"), "getBoundingClientRect")
    .mockImplementation(() => new DOMRect(100, 90 - viewport.scrollTop, 560, scrollHeight));
  const headerBounds = vi.spyOn(getByTestId("header"), "getBoundingClientRect")
    .mockReturnValue(new DOMRect(100, 90, 560, 48));
  measure();
  const resizeContent = (height: number) => {
    scrollHeight = height;
    measure();
  };
  return { viewport, headerBounds, measure, resizeContent, unmount };
}

it("纵向滑块在日期表头下起步，并延伸至排期正文底部", () => {
  const { viewport, headerBounds, measure } = renderCalendar();
  fireEvent.scroll(viewport);
  const vertical = viewport.querySelector<HTMLElement>(".schedule-scroll-thumb.is-vertical")!;
  const horizontal = viewport.querySelector<HTMLElement>(".schedule-scroll-thumb.is-horizontal")!;
  expect(vertical.style.transform).toBe("translate3d(308px, 48px, 0px)");
  expect(horizontal.style.transform).toBe("translate3d(4px, 228px, 0px)");

  headerBounds.mockReturnValue(new DOMRect(100, 90, 560, 64));
  measure();
  expect(vertical.style.transform).toBe("translate3d(308px, 64px, 0px)");
  expect(horizontal.style.transform).toBe("translate3d(4px, 228px, 0px)");

  viewport.scrollTop = 400;
  fireEvent.scroll(viewport);
  const [, top] = vertical.style.transform.match(/[\d.]+px/g)!;
  expect(parseFloat(top) + parseFloat(vertical.style.height)).toBeCloseTo(224);
});

it("鼠标靠近滑块所在边缘时只显示对应滑块，离开后恢复自动隐藏", () => {
  vi.useFakeTimers();
  const { viewport } = renderCalendar();
  fireEvent.scroll(viewport);
  act(() => vi.advanceTimersByTime(1000));
  const visibleThumbs = () => Array.from(viewport.querySelectorAll(".schedule-scroll-thumb.is-visible"));
  const vertical = viewport.querySelector(".schedule-scroll-thumb.is-vertical");
  const horizontal = viewport.querySelector(".schedule-scroll-thumb.is-horizontal");
  const move = (clientX: number, clientY: number, pointerType = "mouse") =>
    fireEvent.pointerMove(viewport, { clientX, clientY, pointerType });

  expect(visibleThumbs()).toEqual([]);
  fireEvent.pointerEnter(viewport, { clientX: 405, clientY: 190, pointerType: "mouse" });
  expect(visibleThumbs()).toEqual([vertical]);
  fireEvent.scroll(viewport);
  expect(visibleThumbs()).toEqual([vertical, horizontal]);
  act(() => vi.advanceTimersByTime(1000));
  expect(visibleThumbs()).toEqual([vertical]);

  move(405, 110);
  expect(visibleThumbs()).toEqual([]);
  move(405, 190, "touch");
  expect(visibleThumbs()).toEqual([]);
  move(220, 315);
  expect(visibleThumbs()).toEqual([horizontal]);
  move(220, 190);
  expect(visibleThumbs()).toEqual([]);
  move(405, 190);
  expect(visibleThumbs()).toEqual([vertical]);
  fireEvent.pointerLeave(viewport, { pointerType: "mouse" });
  expect(visibleThumbs()).toEqual([]);
});

it("每帧只应用最新的拖动位置，松手时补齐最后一次移动并恢复装饰动画", () => {
  let frame!: FrameRequestCallback;
  const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const { viewport, unmount } = renderCalendar();
  const page = viewport.closest(".schedule-page")!;
  const vertical = viewport.querySelector<HTMLElement>(".schedule-scroll-thumb.is-vertical")!;
  const capture = vi.fn();
  Object.defineProperty(vertical, "setPointerCapture", { value: capture });
  const pointer = { pointerId: 1, pointerType: "mouse", button: 0, clientX: 414 };

  fireEvent.pointerDown(vertical, { ...pointer, clientY: 160 });
  expect(capture).toHaveBeenCalledWith(1);
  expect(page.classList.contains("is-scrollbar-dragging")).toBe(true);
  fireEvent.pointerMove(vertical, { ...pointer, clientY: 182 });
  fireEvent.pointerMove(vertical, { ...pointer, clientY: 205 });
  expect(requestFrame).toHaveBeenCalledTimes(1);
  expect(viewport.scrollTop).toBe(0);
  frame(16);
  const framePosition = viewport.scrollTop;
  expect(framePosition).toBeGreaterThan(100);
  expect(vertical.style.transform).not.toBe("translate3d(308px, 48px, 0px)");

  fireEvent.pointerMove(vertical, { ...pointer, clientY: 235 });
  fireEvent.pointerUp(vertical, { ...pointer, clientY: 235 });
  expect(cancelFrame).toHaveBeenCalledWith(1);
  expect(viewport.scrollTop).toBeCloseTo(framePosition * (235 - 160) / (205 - 160));
  expect(page.classList.contains("is-scrollbar-dragging")).toBe(false);

  fireEvent.pointerDown(vertical, { ...pointer, clientY: 235 });
  fireEvent.pointerMove(vertical, { ...pointer, clientY: 250 });
  unmount();
  expect(cancelFrame).toHaveBeenCalledTimes(2);
  expect(page.classList.contains("is-scrollbar-dragging")).toBe(false);
});

it("拖动中表头和内容变化时从当前位置继续，越过轨道时限制在滚动范围内", () => {
  let frame!: FrameRequestCallback;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const { viewport, headerBounds, measure, resizeContent } = renderCalendar();
  const page = viewport.closest(".schedule-page")!;
  const vertical = viewport.querySelector<HTMLElement>(".schedule-scroll-thumb.is-vertical")!;
  Object.defineProperty(vertical, "setPointerCapture", { value: vi.fn() });
  const pointer = { pointerId: 1, pointerType: "mouse", button: 0, clientX: 414 };

  fireEvent.pointerDown(vertical, { ...pointer, clientY: 160 });
  fireEvent.pointerMove(vertical, { ...pointer, clientY: 180 });
  frame(16);
  const beforeResize = viewport.scrollTop;
  headerBounds.mockReturnValue(new DOMRect(100, 90, 560, 64));
  measure();
  expect(viewport.scrollTop).toBe(beforeResize);
  fireEvent.pointerMove(vertical, { ...pointer, clientY: 185 });
  frame(32);
  expect(viewport.scrollTop - beforeResize).toBeCloseTo(18);

  const beforeContentResize = viewport.scrollTop;
  resizeContent(720);
  expect(viewport.scrollTop).toBe(beforeContentResize);
  fireEvent.pointerMove(vertical, { ...pointer, clientY: 190 });
  frame(48);
  expect(viewport.scrollTop - beforeContentResize).toBeCloseTo(20.5);

  fireEvent.pointerMove(vertical, { ...pointer, clientY: 1000 });
  fireEvent.pointerCancel(vertical, { ...pointer, clientY: 1000 });
  expect(viewport.scrollTop).toBe(480);
  expect(page.classList.contains("is-scrollbar-dragging")).toBe(false);

  fireEvent.pointerDown(vertical, { ...pointer, clientY: 302 });
  fireEvent.pointerMove(vertical, { ...pointer, clientY: -100 });
  fireEvent.lostPointerCapture(vertical, { ...pointer, clientY: -100 });
  expect(viewport.scrollTop).toBe(0);
  expect(vertical.style.transform).toBe("translate3d(308px, 64px, 0px)");
  expect(page.classList.contains("is-scrollbar-dragging")).toBe(false);
});
