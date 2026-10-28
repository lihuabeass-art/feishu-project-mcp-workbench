// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppVersion } from "./AppVersion";
import type { ReleaseNotes } from "../scripts/release-notes.mjs";

const notes: ReleaseNotes = {
  version: "1.2.3", tag: "v1.2.3", previousTag: "v1.2.2", commit: "abc", date: "2026-10-27",
  markdown: "# FSTODO 1.2.3\n\n## 问题修复\n\n- 修复版本归属说明\n",
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

it("点击版本可离线查看当前版本记录，无需访问 GitHub", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<AppVersion notes={notes} />);
  fireEvent.click(screen.getByRole("button", { name: "查看 FSTODO v1.2.3 的更新记录" }));
  expect(screen.getByRole("dialog", { name: "更新记录" })).toBeTruthy();
  expect(screen.getByText("修复版本归属说明")).toBeTruthy();
  expect(screen.getByText("当前版本记录可离线查看")).toBeTruthy();
  expect(screen.queryByRole("link")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "关闭更新记录" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("Escape 取消关闭弹窗后把焦点还给版本入口，正文可键盘聚焦滚动", () => {
  render(<AppVersion notes={notes} />);
  const trigger = screen.getByRole("button", { name: "查看 FSTODO v1.2.3 的更新记录" });
  trigger.focus();
  fireEvent.click(trigger);
  screen.getByLabelText("当前版本变更说明").focus();
  expect(document.activeElement).toBe(screen.getByLabelText("当前版本变更说明"));
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
