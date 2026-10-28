// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompactTypeTabs, type CompactTypeOption } from "./CompactTypeTabs";

const options: CompactTypeOption[] = [
  { key: "story", label: "需求开发", count: 3 },
  { key: "issue", label: "缺陷跟踪", count: 1 },
  { key: "task", label: "设计任务", count: 0 },
  { key: "milestone", label: "里程碑", count: 5 },
  { key: "incident", label: "异常处理", count: 2 },
];
const tabWidth = 100;
let availableWidth: number;
const observers = new Set<ResizeObserverMock>();

class ResizeObserverMock {
  readonly elements = new Set<Element>();
  constructor(readonly callback: ResizeObserverCallback) {
    observers.add(this);
  }
  observe(element: Element) { this.elements.add(element); }
  unobserve(element: Element) { this.elements.delete(element); }
  disconnect() { this.elements.clear(); observers.delete(this); }
}

function resize(width: number) {
  availableWidth = width;
  act(() => {
    for (const observer of [...observers]) {
      if ([...observer.elements].some((element) => element.matches(
        ".list-mode-type-nav, .list-mode-type-viewport, .list-mode-type-tabs",
      ))) observer.callback([], observer as unknown as ResizeObserver);
    }
  });
}

function Harness({ initial = "", onChange = () => {} }: {
  initial?: string;
  onChange?: (key: string) => void;
}) {
  const [selected, setSelected] = useState(initial);
  return <CompactTypeTabs options={options} selected={selected} total={11} panelId="work-list"
    onChange={(key) => { setSelected(key); onChange(key); }} />;
}

function expectSelectedVisible(tab: HTMLElement) {
  const viewport = tab.closest(".list-mode-type-viewport") as HTMLElement;
  expect(tab.offsetLeft).toBeGreaterThanOrEqual(viewport.scrollLeft);
  expect(tab.offsetLeft + tab.offsetWidth).toBeLessThanOrEqual(viewport.scrollLeft + viewport.clientWidth);
}

beforeEach(() => {
  availableWidth = 800;
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    if (this.matches(".list-mode-type-nav")) return availableWidth;
    if (this.matches(".list-mode-type-viewport")) {
      const more = this.parentElement?.querySelector('[aria-label="查看全部事项类型"]');
      return availableWidth - (more ? 40 : 0);
    }
    return 0;
  });
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.matches(".list-mode-type-tabs") ? this.querySelectorAll('[role="tab"]').length * tabWidth : 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.getAttribute("role") === "tab" ? tabWidth : 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute("role") !== "tab") return 0;
    return [...this.parentElement!.querySelectorAll('[role="tab"]')].indexOf(this) * tabWidth;
  });
});

afterEach(() => {
  cleanup();
  observers.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("清单类型的溢出菜单", () => {
  it("宽度足够和恰好容纳时不显示更多，缩窄后出现，扩宽后移除", () => {
    render(<Harness />);
    expect(screen.getAllByRole("tab")).toHaveLength(options.length + 1);
    expect(screen.queryByRole("button", { name: "查看全部事项类型" })).toBeNull();
    resize(600);
    expect(screen.queryByRole("button", { name: "查看全部事项类型" })).toBeNull();
    resize(260);
    expect(screen.getByRole("button", { name: "查看全部事项类型" })).toBeTruthy();
    resize(800);
    expect(screen.queryByRole("button", { name: "查看全部事项类型" })).toBeNull();
    expect(screen.getByRole("tab", { name: /^全部\s*11$/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("菜单包含全部类型，选择屏外类型后关闭回焦并滚入视野，Tab 顺序不变", async () => {
    availableWidth = 260;
    const change = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial="story" onChange={change} />);
    const tabsBefore = screen.getAllByRole("tab").map((tab) => tab.id);
    const trigger = screen.getByRole("button", { name: "查看全部事项类型" });
    await user.click(trigger);
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitemradio").map((entry) => entry.textContent?.replace(/\s+/g, "")))
      .toEqual(["全部11", "需求开发3", "缺陷跟踪1", "设计任务0", "里程碑5", "异常处理2"]);
    expect(within(menu).getByRole("menuitemradio", { name: /^需求开发\s*3$/ }).getAttribute("aria-checked")).toBe("true");
    await user.click(within(menu).getByRole("menuitemradio", { name: /^异常处理\s*2$/ }));
    expect(change).toHaveBeenCalledExactlyOnceWith("incident");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    const selected = screen.getByRole("tab", { name: /^异常处理\s*2$/ });
    expect(selected.getAttribute("aria-selected")).toBe("true");
    expectSelectedVisible(selected);
    expect(screen.getAllByRole("tab").map((tab) => tab.id)).toEqual(tabsBefore);
  });

  it("键盘打开菜单后 Escape 关闭并回焦，原类型保持不变", async () => {
    availableWidth = 260;
    const change = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial="issue" onChange={change} />);
    const trigger = screen.getByRole("button", { name: "查看全部事项类型" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeTruthy();
    await user.keyboard("{End}{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: /^缺陷跟踪\s*1$/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("菜单允许选择零项类型和全部，扩宽时关闭已打开的溢出菜单", async () => {
    availableWidth = 260;
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "查看全部事项类型" }));
    await user.click(screen.getByRole("menuitemradio", { name: /^设计任务\s*0$/ }));
    expect(screen.getByRole("tab", { name: /^设计任务\s*0$/ }).getAttribute("aria-selected")).toBe("true");
    await user.click(screen.getByRole("button", { name: "查看全部事项类型" }));
    expect(screen.getByRole("menuitemradio", { name: /^设计任务\s*0$/ }).getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("menuitemradio", { name: /^全部\s*11$/ }));
    expect(screen.getByRole("tab", { name: /^全部\s*11$/ }).getAttribute("aria-selected")).toBe("true");
    await user.click(screen.getByRole("button", { name: "查看全部事项类型" }));
    resize(800);
    expect(screen.queryByRole("button", { name: "查看全部事项类型" })).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /^全部\s*11$/ }));
  });

  it("更多按钮聚焦时扩宽将焦点交还当前 Tab，其他控件聚焦时扩宽不抢焦点", () => {
    availableWidth = 260;
    render(<><Harness initial="issue" /><input aria-label="清单搜索" /></>);
    const selected = screen.getByRole("tab", { name: /^缺陷跟踪\s*1$/ });
    screen.getByRole("button", { name: "查看全部事项类型" }).focus();
    resize(800);
    expect(screen.queryByRole("button", { name: "查看全部事项类型" })).toBeNull();
    expect(document.activeElement).toBe(selected);

    resize(260);
    expect(screen.getByRole("button", { name: "查看全部事项类型" })).toBeTruthy();
    const search = screen.getByRole("textbox", { name: "清单搜索" });
    search.focus();
    resize(800);
    expect(screen.queryByRole("button", { name: "查看全部事项类型" })).toBeNull();
    expect(document.activeElement).toBe(search);
    expect(selected.getAttribute("aria-selected")).toBe("true");
  });

  it("进入清单继承屏外类型时自动定位，菜单准确标记当前类型且不重新提交", async () => {
    availableWidth = 260;
    const change = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial="incident" onChange={change} />);
    const selected = screen.getByRole("tab", { name: /^异常处理\s*2$/ });
    expect(selected.getAttribute("aria-selected")).toBe("true");
    expectSelectedVisible(selected);
    expect(change).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "查看全部事项类型" }));
    expect(screen.getByRole("menuitemradio", { name: /^异常处理\s*2$/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitemradio", { name: /^全部\s*11$/ }).getAttribute("aria-checked")).toBe("false");
  });
});
