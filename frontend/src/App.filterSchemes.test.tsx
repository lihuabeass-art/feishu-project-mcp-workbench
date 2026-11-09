// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import { loadSnapshot } from "./api";
import { emptyWorkFilters } from "./workFilters";
import type { CachedItem, Snapshot } from "./types";

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

function typeNavigationSnapshot(): Snapshot {
  const item = (id: string, type: string, space: string): CachedItem => ({
    id: { project_key: space, work_item_type_key: type, work_item_id: id },
    name: `${space}-${type}`, project_name: space === "space-a" ? "空间甲" : "空间乙",
    flow: { kind: "node", node_name: "开发", node_state_key: null, start_state_key_name: null, end_state_key_name: null },
    schedule: { start_raw: null, end_raw: null }, raw_json: "{}", identity_missing_flags: [],
    first_seen_at_ms: 1, last_seen_at_ms: 1, seen_count: 1,
  });
  return {
    items: [item("1", "story", "space-a"), item("2", "issue", "space-a"),
      item("3", "story", "space-b"), item("4", "issue", "space-b")],
    total: 4, last_success: null, runs: [], credential_ready: true, credential_description: "测试凭证",
    config_path: "config.toml", db_path: "cache.db", capabilities: { workflow: false, filter_schemes: true },
    sources: [{ id: "source-a", kind: "personal_todo", enabled: true, executable: true,
      reason: null, action: "todo", todo_scope: "in_progress", type_scope: { configured: true, selected_count: 2, types: [
        { project_key: "space-a", project_name: "空间甲", type_key: "story", type_name: "需求研发", selected: true },
        { project_key: "space-a", project_name: "空间甲", type_key: "issue", type_name: "缺陷跟踪", selected: true },
      ] } }],
  };
}

it.each(["full", "compact"])("%s 模式下方案与类型独立，旧方案和不限条件均保留当前类型", async (mode) => {
  vi.mocked(loadSnapshot).mockResolvedValue(typeNavigationSnapshot());
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "load_filter_schemes") return { account: "user-a", document: {
      schemaVersion: 1, defaultId: "a", schemes: [
        { id: "a", name: "空间甲方案", includeQuery: false,
          filters: { ...emptyWorkFilters, type: ["story"], typeLabel: { story: "需求研发" },
            space: ["space-a"], spaceLabel: { "space-a": "空间甲" } } },
        { id: "b", name: "空间乙方案", includeQuery: false,
          filters: { ...emptyWorkFilters, type: ["story"], space: ["space-b"], spaceLabel: { "space-b": "空间乙" } } },
      ],
    } };
  });
  const user = userEvent.setup(); render(<App />);
  await screen.findByText("space-a-story");
  await waitFor(() => expect(screen.getByRole("button", { name: "筛选方案" }).textContent).toContain("空间甲方案"));
  expect(screen.getByText("space-a-issue")).toBeTruthy();
  expect(screen.queryByText("space-b-story")).toBeNull();
  if (mode === "compact") await user.click(screen.getByRole("button", { name: "切换到清单模式" }));
  const list = () => within(screen.getByRole("region", { name: "工作清单" }));
  const types = () => screen.getByRole(mode === "full" ? "group" : "tablist", { name: mode === "full" ? "工作类型" : "事项类型" });
  const typeRole = mode === "full" ? "button" : "tab";
  const selectedAttribute = mode === "full" ? "aria-pressed" : "aria-selected";
  await user.click(within(types()).getByRole(typeRole, { name: /缺陷跟踪/ }));
  expect(list().queryByText("space-a-story")).toBeNull();
  expect(list().getByText("space-a-issue")).toBeTruthy();
  if (mode === "compact") await user.click(screen.getByRole("button", { name: "清单筛选" }));
  const trigger = screen.getByRole("button", { name: "筛选方案" });
  expect(trigger.textContent).toContain("空间甲方案");
  expect(trigger.textContent).not.toContain("已调整");
  await user.click(trigger);
  expect(screen.getByRole("menuitem", { name: /^空间甲方案/ }).textContent).not.toContain("事项类型");
  await user.click(screen.getByRole("menuitem", { name: /^空间乙方案/ }));
  expect(within(types()).getByRole(typeRole, { name: /缺陷跟踪/ }).getAttribute(selectedAttribute)).toBe("true");
  expect(list().getByText("space-b-issue")).toBeTruthy();
  expect(list().queryByText("space-a-issue")).toBeNull();
  expect(list().queryByText("space-b-story")).toBeNull();
  await user.click(trigger);
  await user.click(screen.getByRole("menuitem", { name: "不限条件" }));
  expect(list().getByText("space-a-issue")).toBeTruthy();
  expect(list().getByText("space-b-issue")).toBeTruthy();
  expect(list().queryByText("space-a-story")).toBeNull();
  expect(within(types()).getByRole(typeRole, { name: /缺陷跟踪/ }).getAttribute(selectedAttribute)).toBe("true");
  await user.click(trigger);
  await user.click(screen.getByRole("menuitem", { name: /^空间甲方案/ }));
  await user.click(within(types()).getByRole(typeRole, { name: /^全部/ }));
  expect(list().getByText("space-a-story")).toBeTruthy();
  expect(list().getByText("space-a-issue")).toBeTruthy();
  expect(trigger.textContent).not.toContain("已调整");
  expect(vi.mocked(invoke).mock.calls.some(([command]) => command === "save_filter_schemes")).toBe(false);
});

it("从其他页面通过侧栏类型进入时，默认方案保留刚选的类型", async () => {
  vi.mocked(loadSnapshot).mockResolvedValue(typeNavigationSnapshot());
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "load_filter_schemes") return { account: "user-a", document: {
      schemaVersion: 1, defaultId: "a", schemes: [{ id: "a", name: "默认空间", includeQuery: false,
        filters: { ...emptyWorkFilters, type: ["story"], space: ["space-a"] } }],
    } };
  });
  const user = userEvent.setup(); render(<App />);
  await screen.findByText("space-a-issue");
  await user.click(screen.getByRole("button", { name: "工作来源" }));
  await user.click(within(screen.getByRole("group", { name: "我的类型" })).getByRole("button", { name: /缺陷跟踪/ }));
  expect(screen.getByText("space-a-issue")).toBeTruthy();
  expect(screen.queryByText("space-a-story")).toBeNull();
  expect(screen.queryByText("space-b-issue")).toBeNull();
  expect(screen.getByRole("button", { name: "筛选方案" }).textContent).not.toContain("已调整");
});

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
