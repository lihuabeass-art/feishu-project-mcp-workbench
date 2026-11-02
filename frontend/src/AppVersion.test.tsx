// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppVersion } from "./AppVersion";
import type { ReleaseNotes } from "../scripts/release-notes.mjs";

const notes: ReleaseNotes = {
  version: "1.2.3", tag: "v1.2.3", previousTag: "v1.2.2", commit: "abc", date: "2026-10-27",
  markdown: "# FSTODO 1.2.3\n\n## 问题修复\n\n- 修复版本归属说明\n",
  history: [
    { version: "1.2.2", tag: "v1.2.2", previousTag: "v1.0.0", commit: "old", date: "2026-10-26", markdown: "# FSTODO 1.2.2\n\n- 保留历史草稿\n" },
    { version: "1.0.0", tag: "v1.0.0", previousTag: null, commit: "first", date: "2026-10-20", markdown: "# FSTODO 1.0.0\n\n首个正式版本\n" },
  ],
};
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => {
  for (const [name, descriptor] of [["showModal", originalShow], ["close", originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

it("点击版本默认显示当前记录，可离线切换全部历史版本，重新打开回到当前版本", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<AppVersion notes={notes} />);
  fireEvent.click(screen.getByRole("button", { name: "查看 FSTODO v1.2.3 的更新记录" }));
  expect(screen.getByRole("dialog", { name: "更新记录" })).toBeTruthy();
  expect(screen.getByText("修复版本归属说明")).toBeTruthy();
  expect(screen.getByText("所有版本记录均可离线查看")).toBeTruthy();
  expect(screen.getByText("当前安装 v1.2.3 · 共 3 个版本")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "查看 v1.2.2 的更新记录" }));
  expect(screen.getByText("保留历史草稿")).toBeTruthy();
  expect(screen.queryByText("修复版本归属说明")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "查看 v1.0.0 的更新记录" }));
  expect(screen.getByText("首个正式版本")).toBeTruthy();
  expect(screen.queryByRole("link")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "关闭更新记录" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "查看 FSTODO v1.2.3 的更新记录" }));
  expect(screen.getByText("修复版本归属说明")).toBeTruthy();
});

it("Escape 取消关闭弹窗后把焦点还给版本入口，正文可键盘聚焦滚动", () => {
  render(<AppVersion notes={notes} />);
  const trigger = screen.getByRole("button", { name: "查看 FSTODO v1.2.3 的更新记录" });
  trigger.focus();
  fireEvent.click(trigger);
  screen.getByLabelText("v1.2.3 变更说明").focus();
  expect(document.activeElement).toBe(screen.getByLabelText("v1.2.3 变更说明"));
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("版本列表和正文保留内部滚动，边界、标题、底栏与遮罩隔离背景，关闭后恢复", () => {
  const backgroundWheel = vi.fn();
  const mounted = render(<div onWheel={backgroundWheel}><span>背景清单</span><AppVersion notes={notes} /></div>);
  fireEvent.click(screen.getByRole("button", { name: "查看 FSTODO v1.2.3 的更新记录" }));
  const dialog = screen.getByRole("dialog");
  for (const container of [screen.getByRole("navigation", { name: "版本记录" }), screen.getByLabelText("v1.2.3 变更说明")]) {
    container.style.overflowY = "auto";
    let height = 300;
    Object.defineProperties(container, { clientHeight: { value: 100 }, scrollHeight: { get: () => height } });
    for (const [top, deltaY, blocked] of [[0, -80, true], [0, 80, false], [80, 80, false], [80, -80, false], [200, 80, true], [200, -80, false]] as const) {
      container.scrollTop = top;
      const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY });
      fireEvent(container, event);
      expect(event.defaultPrevented).toBe(blocked);
    }
    height = 100;
    container.scrollTop = 0;
    for (const deltaY of [-80, 80, 80]) expect(fireEvent.wheel(container, { deltaY })).toBe(false);
  }
  for (const target of [dialog, screen.getByRole("heading", { name: "更新记录" }), screen.getByText("所有版本记录均可离线查看")]) {
    expect(fireEvent.wheel(target, { deltaY: 80 })).toBe(false);
  }
  expect(backgroundWheel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "关闭更新记录" }));
  expect(fireEvent.wheel(screen.getByText("背景清单"), { deltaY: 80 })).toBe(true);
  expect(backgroundWheel).toHaveBeenCalledTimes(1);
  mounted.unmount();
  expect(fireEvent.wheel(dialog, { deltaY: 80 })).toBe(true);
});
