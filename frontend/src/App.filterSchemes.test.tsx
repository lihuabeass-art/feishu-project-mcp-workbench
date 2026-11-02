// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import { loadSnapshot } from "./api";
import { emptyWorkFilters } from "./workFilters";
import type { Snapshot } from "./types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("./api", () => ({
  desktop: true, loadSnapshot: vi.fn(), syncTodos: vi.fn(), checkConnection: vi.fn(),
  saveToken: vi.fn(), saveConnectionSettings: vi.fn(), getWorkflowActions: vi.fn(),
  executeWorkflowAction: vi.fn(), refreshSourceTypes: vi.fn(), saveSourceTypes: vi.fn(),
  clearSourceTypes: vi.fn(), saveTypeOrder: vi.fn(), cachedItemDetail: vi.fn(), refreshItemDetail: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(loadSnapshot).mockResolvedValue({
    items: [], total: 0, last_success: null, runs: [],
    sources: [{ id: "source-a", kind: "personal_todo", enabled: true, executable: true, reason: null, action: "todo", todo_scope: "in_progress" }],
    config_path: "config.toml", db_path: "cache.db", credential_ready: true, credential_description: "测试凭证",
    capabilities: { workflow: false, filter_schemes: true },
  } satisfies Snapshot);
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "load_filter_schemes") return { account: "user-a", document: {
      schemaVersion: 1, schemes: [{ id: "a", name: "日常待办", includeQuery: false, filters: emptyWorkFilters }], defaultId: null,
    } };
  });
  HTMLElement.prototype.hasPointerCapture ||= () => false;
  HTMLElement.prototype.setPointerCapture ||= () => {};
  HTMLElement.prototype.releasePointerCapture ||= () => {};
  HTMLElement.prototype.scrollIntoView ||= () => {};
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each(["full", "compact"])("%s 模式将默认设置结果交给统一消息提示，并支持关闭及再次提示", async (mode) => {
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("load_filter_schemes"));
  if (mode === "compact") {
    await user.click(screen.getByRole("button", { name: "切换到清单模式" }));
    await user.click(screen.getByRole("button", { name: "清单筛选" }));
  }
  for (const action of ["设为默认", "取消默认"]) {
    const trigger = screen.getByRole("button", { name: "筛选方案" });
    await user.click(trigger);
    const manager = await screen.findByRole("menuitem", { name: "管理方案 日常待办" });
    act(() => manager.focus());
    await user.keyboard("{ArrowRight}");
    await user.click(await screen.findByRole("menuitem", { name: action }));
    const text = await screen.findByText("默认设置已保存，下次进入我的工作时生效");
    const notice = text.closest<HTMLElement>("[role='status']")!;
    expect(notice.classList.contains("toast")).toBe(true);
    expect(trigger.parentElement?.contains(text)).toBe(false);
    await user.click(within(notice).getByRole("button", { name: "关闭结果提示" }));
    expect(screen.queryByText("默认设置已保存，下次进入我的工作时生效")).toBeNull();
  }
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "save_filter_schemes")).toHaveLength(2);
});
