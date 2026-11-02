// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { FilterSchemeMenu } from "./FilterSchemeMenu";
import { useFilterSchemes } from "./useFilterSchemes";
import { emptyWorkFilters } from "./workFilters";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const onNotice = vi.fn();
afterEach(cleanup);
beforeEach(() => {
  onNotice.mockReset();
  vi.mocked(invoke).mockReset().mockImplementation(async (command) => {
    if (command === "load_filter_schemes") return { account: "user-a", document: {
      schemaVersion: 1, schemes: [{ id: "a", name: "方案甲", includeQuery: false, filters: emptyWorkFilters }], defaultId: null,
    } };
    if (command === "save_filter_schemes") throw { kind: "store", message: "RPC https://service.invalid log_id: synthetic-log" };
  });
  HTMLElement.prototype.hasPointerCapture ||= () => false;
  HTMLElement.prototype.setPointerCapture ||= () => {};
  HTMLElement.prototype.releasePointerCapture ||= () => {};
  HTMLElement.prototype.scrollIntoView ||= () => {};
});
function Harness() {
  const [filters, setFilters] = useState(emptyWorkFilters);
  const controller = useFilterSchemes({ enabled: true, context: "stable", active: true, filters, apply: setFilters });
  return <><FilterSchemeMenu controller={controller} onNotice={onNotice} /><span>{controller.available ? "ready" : "loading"}</span></>;
}
async function open() {
  const user = userEvent.setup();
  render(<Harness />);
  await screen.findByText("ready");
  await user.click(screen.getByRole("button", { name: "筛选方案" }));
  return user;
}

it("load failure shows a local recovery message instead of an empty list or an account prompt, and retry restores schemes", async () => {
  vi.mocked(invoke).mockRejectedValueOnce({ kind: "store", message: "no such table: filter_scheme_preferences" });
  const user = userEvent.setup();
  render(<Harness />);
  const feedback = await screen.findByRole("status");
  expect(feedback.textContent).toBe("筛选方案暂不可用，展开后可重试。");
  expect(screen.getByRole("button", { name: "筛选方案" }).getAttribute("aria-describedby")).toBe(feedback.id);
  expect(screen.getByRole("button", { name: "筛选方案" }).title).toBe(feedback.textContent);
  await user.click(screen.getByRole("button", { name: "筛选方案" }));
  expect(screen.getByRole("alert").textContent).toContain("当前临时条件已保留");
  expect(screen.getByRole("alert").textContent).toContain("本地数据暂时无法读取，请重试");
  expect(screen.queryByText("尚无已保存方案")).toBeNull();
  expect(screen.queryByText("确认飞书账号后可保存个人方案。")).toBeNull();
  expect(document.body.textContent).not.toContain("no such table");
  const save = screen.getByRole("menuitem", { name: "保存当前条件为新方案" });
  expect(save.getAttribute("data-disabled")).not.toBeNull();
  await user.click(screen.getByRole("menuitem", { name: "重新读取方案" }));
  await screen.findByText("ready");
  expect(screen.queryByRole("status")).toBeNull();
  await user.click(screen.getByRole("button", { name: "筛选方案" }));
  expect(screen.getByRole("menuitem", { name: /^方案甲/ })).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: "保存当前条件为新方案" }).getAttribute("data-disabled")).toBeNull();
});

it("failed save keeps name and default choice without a keyword decision, keyboard Escape returns focus and wheel does not escape portal", async () => {
  const user = await open();
  const menu = screen.getByRole("menu");
  const wheel = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
  fireEvent(menu, wheel);
  expect(wheel.defaultPrevented).toBe(true);
  await user.click(screen.getByRole("menuitem", { name: "保存当前条件为新方案" }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "方案名称" })));
  expect(screen.getByRole("switch", { name: "设为默认" }).parentElement?.tagName).toBe("SPAN");
  expect(screen.getByRole("switch", { name: "设为默认" }).getAttribute("aria-describedby")).toBeTruthy();
  expect(screen.getByText("默认方案只能有一个，开启后将替换原默认方案；下次进入我的工作时自动应用。").id).toBe(screen.getByRole("switch", { name: "设为默认" }).getAttribute("aria-describedby"));
  expect(screen.getAllByRole("switch")).toHaveLength(1);
  expect(screen.queryByText("同时保存搜索关键词")).toBeNull();
  await user.type(screen.getByRole("textbox", { name: "方案名称" }), "新方案");
  await user.click(screen.getByRole("switch", { name: /设为默认/ }));
  await user.click(screen.getByRole("button", { name: /^保存$/ }));
  await waitFor(() => expect(screen.getByRole("dialog").textContent).toContain("本地方案暂时无法保存"));
  expect((screen.getByRole("textbox", { name: "方案名称" }) as HTMLInputElement).value).toBe("新方案");
  expect((screen.getByRole("switch", { name: /设为默认/ }) as HTMLInputElement).checked).toBe(true);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "筛选方案" }));
});

it.each(["重命名", "删除方案", "设为默认"])("%s failure retains saved state and never announces success", async (action) => {
  const user = await open();
  const manager = screen.getByRole("menuitem", { name: "管理方案 方案甲" });
  fireEvent.pointerMove(manager, { pointerType: "mouse" });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
  if (!screen.queryByRole("menuitem", { name: action })) {
    manager.focus(); await user.keyboard("{ArrowRight}");
  }
  await user.click(await screen.findByRole("menuitem", { name: action }));
  if (action === "重命名") {
    const input = screen.getByRole("textbox", { name: "方案名称" });
    await user.clear(input); await user.type(input, "新的名称");
    await user.click(screen.getByRole("button", { name: /^保存$/ }));
  } else if (action === "删除方案") await user.click(screen.getByRole("button", { name: "确认删除" }));
  await waitFor(() => expect(screen.getAllByText(/本地方案暂时无法保存/).length).toBeGreaterThan(0));
  expect(screen.queryByText(/默认设置已保存/)).toBeNull();
  expect(onNotice).not.toHaveBeenCalled();
  if (action !== "设为默认") expect(screen.getByRole("dialog")).toBeTruthy();
});
