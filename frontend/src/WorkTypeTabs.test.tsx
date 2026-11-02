// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTypeTabs } from "./WorkTypeTabs";

const options = [
  { key: "story", label: "需求研发", count: 3 },
  { key: "issue", label: "缺陷跟踪", count: 1 },
  { key: "task", label: "任务", count: 0 },
  { key: "case", label: "测试用例", count: 0 },
  { key: "suite", label: "测试用例集", count: 2 },
];
let availableWidth: number;
let reducedMotion: boolean;
const observers = new Set<ResizeObserverMock>();
class ResizeObserverMock {
  constructor(readonly callback: ResizeObserverCallback) { observers.add(this); }
  observe() {}
  disconnect() { observers.delete(this); }
}

function viewportWidth(element: HTMLElement) {
  return availableWidth - (element.closest(".work-type-nav")?.querySelector(".work-type-scroll-button") ? 64 : 0);
}

function resize(width: number) {
  availableWidth = width;
  act(() => {
    for (const observer of [...observers]) observer.callback([], observer as unknown as ResizeObserver);
  });
}

function Harness({ onChange = () => {} }: { onChange?: (key: string) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  return <WorkTypeTabs options={options} selected={selected} total={6}
    onChange={(key) => { setSelected(key ? [key] : []); onChange(key); }} />;
}

function viewport() { return screen.getByRole("group", { name: "工作类型" }); }
function expectVisible(button: HTMLElement) {
  expect(button.offsetLeft).toBeGreaterThanOrEqual(viewport().scrollLeft);
  expect(button.offsetLeft + button.offsetWidth).toBeLessThanOrEqual(viewport().scrollLeft + viewport().clientWidth);
}

beforeEach(() => {
  availableWidth = 340;
  reducedMotion = false;
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.stubGlobal("matchMedia", () => ({ matches: reducedMotion }));
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    if (this.matches(".work-type-nav")) return availableWidth;
    return this.matches(".work-type-viewport") ? viewportWidth(this) : 0;
  });
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
    if (!this.matches(".work-type-viewport, .work-type-track")) return 0;
    return Math.max(viewportWidth(this), this.querySelectorAll(".tab").length * 100);
  });
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
    return this.matches(".tab") ? [...this.parentElement!.children].indexOf(this) * 100 : 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.matches(".tab") ? 100 : 0;
  });
});

afterEach(() => {
  cleanup();
  observers.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("完整工作台的类型浏览", () => {
  it("普通滚轮、触控板和行/页单位可横向浏览，连续输入及边界不带动背景，缩放保持可用", () => {
    const backgroundWheel = vi.fn();
    render(<div onWheel={backgroundWheel}><Harness /><p>背景清单</p></div>);
    const container = viewport();
    for (let index = 1; index <= 3; index++) {
      expect(fireEvent.wheel(container, { deltaY: 60 })).toBe(false);
      expect(container.scrollLeft).toBe(index * 60);
    }
    expect(fireEvent.wheel(container, { deltaX: -35, deltaY: 4 })).toBe(false);
    expect(container.scrollLeft).toBe(145);
    fireEvent.wheel(container, { deltaY: -2, deltaMode: WheelEvent.DOM_DELTA_LINE });
    expect(container.scrollLeft).toBe(105);
    fireEvent.wheel(container, { deltaY: 1, deltaMode: WheelEvent.DOM_DELTA_PAGE });
    expect(container.scrollLeft).toBe(container.scrollWidth - container.clientWidth);
    expect(fireEvent.wheel(container, { deltaY: 80 })).toBe(false);
    expect(screen.getByRole("button", { name: "向后浏览工作类型" })).toHaveProperty("disabled", true);
    fireEvent.wheel(container, { deltaY: -1000 });
    expect(container.scrollLeft).toBe(0);
    expect(fireEvent.wheel(container, { deltaY: -80 })).toBe(false);
    expect(backgroundWheel).not.toHaveBeenCalled();
    expect(fireEvent.wheel(container, { deltaY: 60, ctrlKey: true })).toBe(true);
    expect(container.scrollLeft).toBe(0);
    expect(backgroundWheel).toHaveBeenCalledOnce();
  });

  it("宽度足够时移除翻页按钮，短列表和空类型不会截获页面滚轮，卸载后清理监听", () => {
    availableWidth = 800;
    const backgroundWheel = vi.fn();
    const { rerender, unmount } = render(<div onWheel={backgroundWheel}><Harness /></div>);
    expect(screen.queryByRole("button", { name: "向后浏览工作类型" })).toBeNull();
    expect(fireEvent.wheel(viewport(), { deltaY: 80 })).toBe(true);
    rerender(<div onWheel={backgroundWheel}><WorkTypeTabs options={[]} selected={[]} total={0} onChange={vi.fn()} /></div>);
    const oldViewport = viewport();
    expect(fireEvent.wheel(oldViewport, { deltaY: 80 })).toBe(true);
    expect(backgroundWheel).toHaveBeenCalledTimes(2);
    const remove = vi.spyOn(oldViewport, "removeEventListener");
    unmount();
    expect(remove).toHaveBeenCalledWith("wheel", expect.any(Function));
  });

  it("只在水平拖动超过阈值后浏览，拖动后的鼠标点击不切换类型，下一次点击和键盘仍可选择", async () => {
    const change = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={change} />);
    const container = viewport();
    const captured = new Set<number>();
    container.setPointerCapture = vi.fn((id) => { captured.add(id); });
    container.hasPointerCapture = vi.fn((id) => captured.has(id));
    container.releasePointerCapture = vi.fn((id) => { captured.delete(id); });
    const story = screen.getByRole("button", { name: /^需求研发/ });
    fireEvent.pointerDown(story, { pointerId: 1, button: 0, buttons: 1, clientX: 220, clientY: 10 });
    fireEvent.pointerMove(container, { pointerId: 1, buttons: 1, clientX: 218, clientY: 10 });
    expect(container.scrollLeft).toBe(0);
    fireEvent.pointerMove(container, { pointerId: 1, buttons: 1, clientX: 100, clientY: 12 });
    expect(container.scrollLeft).toBe(120);
    expect(container.dataset.dragging).toBe("true");
    fireEvent.pointerUp(container, { pointerId: 1, button: 0 });
    fireEvent.click(story, { detail: 1 });
    expect(change).not.toHaveBeenCalled();
    expect(container.dataset.dragging).toBe("false");
    expect(container.releasePointerCapture).toHaveBeenCalledWith(1);
    await user.click(story);
    expect(change).toHaveBeenCalledExactlyOnceWith("story");
    const task = screen.getByRole("button", { name: /^任务/ });
    act(() => task.focus({ preventScroll: true }));
    expectVisible(task);
    await user.keyboard("{Enter}");
    expect(change).toHaveBeenLastCalledWith("task");
    expect(task.getAttribute("aria-pressed")).toBe("true");
  });

  it.each(["pointerCancel", "lostPointerCapture"] as const)("%s 后结束拖动，触摸仍交给原生滚动", (finish) => {
    render(<Harness />);
    const container = viewport();
    container.setPointerCapture = vi.fn();
    container.hasPointerCapture = vi.fn(() => false);
    fireEvent.pointerDown(container, { pointerId: 1, button: 0, buttons: 1, clientX: 220 });
    fireEvent.pointerMove(container, { pointerId: 1, buttons: 1, clientX: 160 });
    fireEvent[finish](container, { pointerId: 1 });
    expect(container.dataset.dragging).toBe("false");
    fireEvent.pointerMove(container, { pointerId: 1, buttons: 1, clientX: 100 });
    expect(container.scrollLeft).toBe(60);
    fireEvent.pointerDown(container, { pointerId: 2, pointerType: "touch", button: 0, buttons: 1, clientX: 200 });
    expect(fireEvent.pointerMove(container, { pointerId: 2, pointerType: "touch", buttons: 1, clientX: 80 })).toBe(true);
    expect(container.scrollLeft).toBe(60);
  });

  it("从左右边缘部分可见的类型按下时保持位置，拖动起点不跳变，直接点击后才定位", () => {
    const change = vi.fn();
    render(<Harness onChange={change} />);
    const container = viewport();
    container.setPointerCapture = vi.fn();
    container.hasPointerCapture = vi.fn(() => false);
    const story = screen.getByRole("button", { name: /^需求研发/ });
    fireEvent.wheel(container, { deltaY: 150 });
    fireEvent.pointerDown(story, { pointerId: 1, button: 0, buttons: 1, clientX: 10 });
    act(() => story.focus());
    expect(container.scrollLeft).toBe(150);
    fireEvent.pointerMove(container, { pointerId: 1, buttons: 1, clientX: 20 });
    expect(container.scrollLeft).toBe(140);
    fireEvent.pointerUp(container, { pointerId: 1 });
    fireEvent.click(story, { detail: 1 });
    expect(change).not.toHaveBeenCalled();

    const cases = screen.getByRole("button", { name: /^测试用例0$/ });
    fireEvent.pointerDown(cases, { pointerId: 2, button: 0, buttons: 1, clientX: 260 });
    act(() => cases.focus());
    expect(container.scrollLeft).toBe(140);
    fireEvent.pointerUp(container, { pointerId: 2 });
    fireEvent.click(cases, { detail: 1 });
    expect(change).toHaveBeenCalledExactlyOnceWith("case");
    expectVisible(cases);
  });

  it("外部选择、键盘焦点和窗口缩窄时定位目标，普通父级更新不会打断手动浏览", () => {
    const change = vi.fn();
    const { rerender } = render(<WorkTypeTabs options={options} selected={[]} total={6} onChange={change} />);
    const selected = screen.getByRole("button", { name: /^测试用例集/ });
    rerender(<WorkTypeTabs options={[...options]} selected={["suite"]} total={6} onChange={change} />);
    expectVisible(selected);
    fireEvent.wheel(viewport(), { deltaY: -1000 });
    rerender(<WorkTypeTabs options={options.map((option) => ({ ...option }))} selected={["suite"]} total={6} onChange={change} />);
    expect(viewport().scrollLeft).toBe(0);
    resize(300);
    expectVisible(selected);
    expect(change).not.toHaveBeenCalled();
    act(() => screen.getByRole("button", { name: /^全部工作/ }).focus({ preventScroll: true }));
    expect(viewport().scrollLeft).toBe(0);
    expect(selected.getAttribute("aria-pressed")).toBe("true");
  });

  it("翻页按钮按可用宽度移动且尊重减少动态效果，扩宽后把按钮焦点交回选中类型", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const container = viewport();
    container.scrollTo = vi.fn((position?: ScrollToOptions | number) => {
      container.scrollLeft = typeof position === "number" ? position : position?.left ?? 0;
    });
    await user.click(screen.getByRole("button", { name: "向后浏览工作类型" }));
    expect(container.scrollTo).toHaveBeenCalledWith({ left: container.clientWidth * 0.8, behavior: "smooth" });
    reducedMotion = true;
    await user.click(screen.getByRole("button", { name: "向前浏览工作类型" }));
    expect(container.scrollLeft).toBe(0);
    expect(container.scrollTo).toHaveBeenCalledOnce();
    screen.getByRole("button", { name: "向后浏览工作类型" }).focus();
    resize(800);
    expect(screen.queryByRole("button", { name: "向后浏览工作类型" })).toBeNull();
    expect(document.activeElement).toBe(within(viewport()).getByRole("button", { name: /^全部工作/ }));
  });
});
