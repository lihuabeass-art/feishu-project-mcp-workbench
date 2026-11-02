// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import { loadSnapshot } from "./api";
import { emptyWorkFilters } from "./workFilters";
import type { CachedItem, Snapshot } from "./types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("./api", () => ({ desktop: true, loadSnapshot: vi.fn(), syncTodos: vi.fn(),
  checkConnection: vi.fn(), saveToken: vi.fn(), saveConnectionSettings: vi.fn(),
  refreshSourceTypes: vi.fn(), saveSourceTypes: vi.fn(), clearSourceTypes: vi.fn(), saveTypeOrder: vi.fn(),
  cachedItemDetail: vi.fn(), refreshItemDetail: vi.fn(), getWorkflowActions: vi.fn(), executeWorkflowAction: vi.fn(),
}));
const front = "前端代码合入";
const back = "后端代码合入";
const combined = `${front} / ${back}`;
function snapshot(): Snapshot {
  const shared: CachedItem = {
    id: { project_key: "space-a", work_item_type_key: "story", work_item_id: "1" },
    name: "共同需求", project_name: "空间甲", source_ids: ["todo", "stories"],
    flow: { kind: "node", node_name: combined, node_state_key: null, start_state_key_name: null, end_state_key_name: null },
    current_node_names: [front, back],
    personal_flows: { todo: { kind: "node", node_name: back, node_state_key: "back", start_state_key_name: null, end_state_key_name: null } },
    schedule: { start_raw: null, end_raw: null }, raw_json: "{}", identity_missing_flags: [],
    first_seen_at_ms: 1, last_seen_at_ms: 1, seen_count: 1,
  };
  return {
    items: [shared,
      { ...shared, id: { ...shared.id, project_key: "space-b" }, project_name: "空间乙", name: "另一空间同号需求",
        source_ids: ["stories"], personal_flows: {}, flow: { ...shared.flow, node_name: back }, current_node_names: [back] },
      { ...shared, id: { ...shared.id, work_item_id: "2" }, name: "评审需求", source_ids: ["stories"], personal_flows: {},
        flow: { ...shared.flow, node_name: "评审" }, current_node_names: ["评审"] }],
    total: 3, last_success: null, runs: [], credential_ready: true, credential_description: "测试凭证",
    config_path: "config", db_path: "cache", capabilities: { workflow: false, source_queries: true },
    sources: [
      { id: "todo", display_name: "我的待办", kind: "personal_todo", enabled: true, executable: true,
        action: "todo", todo_scope: "in_progress", reason: null },
      { id: "stories", display_name: "我参与的需求", kind: "work_item_type", builtin_key: "stories",
        enabled: true, executable: true, action: null, todo_scope: null, reason: null,
        project_key: "space-a", work_item_type_key: "story" },
    ],
  };
}
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  vi.mocked(loadSnapshot).mockResolvedValue(snapshot());
  HTMLElement.prototype.scrollIntoView ||= () => {};
});
afterEach(cleanup);
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(screen.getByRole("option", { name: option }));
  await user.keyboard("{Escape}");
}
async function nodeFilters(user: ReturnType<typeof userEvent.setup>, mode: string) {
  if (mode === "compact") {
    await user.click(screen.getByRole("button", { name: "切换到清单模式" }));
    await user.click(screen.getByRole("button", { name: "清单筛选" }));
    await user.click(screen.getByText("更多条件"));
  }
  return mode === "compact" ? "清单节点" : "节点";
}

it.each(["full", "compact"])("%s 模式按独立节点筛选，多来源和多节点命中不重复，同号跨空间事项仍保留", async (mode) => {
  const user = userEvent.setup(); render(<App />);
  await screen.findByText("共同需求");
  const label = await nodeFilters(user, mode);
  const list = screen.getByRole("region", { name: "工作清单" });
  await user.click(screen.getByRole("combobox", { name: label }));
  expect(screen.queryByRole("option", { name: `${combined}（1）` })).toBeNull();
  await user.click(screen.getByRole("option", { name: `${back}（2）` }));
  await user.click(screen.getByRole("option", { name: `${front}（1）` }));
  const chips = screen.getByRole("group", { name: "当前筛选条件" });
  const removeLabel = mode === "compact" ? "取消" : "移除";
  expect(within(chips).getByRole("button", { name: new RegExp(`^${removeLabel}节点：${back}`) }).title).toBe("事项当前节点");
  expect(chips.textContent).not.toContain("事项当前节点");
  expect(within(list).getAllByText("共同需求")).toHaveLength(1);
  expect(within(list).getAllByText("另一空间同号需求")).toHaveLength(1);
  expect(within(list).queryByText("评审需求")).toBeNull();
  await user.click(screen.getByRole("option", { name: `${back}（2）` }));
  expect(within(list).getAllByText("共同需求")).toHaveLength(1);
  expect(within(list).queryByText("另一空间同号需求")).toBeNull();
  await user.click(screen.getByRole("option", { name: "全部节点" }));
  expect(within(list).getAllByText("共同需求")).toHaveLength(1);
  expect(within(list).getByText("评审需求")).toBeTruthy();
  await user.keyboard("{Escape}");
});

it("切换来源时节点保持各自范围，两种模式直接展示节点名并保留范围提示", async () => {
  const user = userEvent.setup(); render(<App />);
  await screen.findByText("共同需求");
  await choose(user, "显示来源", "我的待办");
  expect(screen.getByText(back).getAttribute("title")).toBe("我的待办节点");
  expect(screen.queryByText(combined)).toBeNull();
  await user.click(screen.getByRole("button", { name: "切换到清单模式" }));
  expect(within(screen.getByRole("region", { name: "工作清单" })).getByText(back).getAttribute("title")).toBe("我的待办节点");
  await user.click(screen.getByRole("button", { name: "切换到完整模式" }));
  await choose(user, "显示来源", "我参与的需求 · 空间甲");
  expect(screen.getByText(combined).getAttribute("title")).toBe("事项当前节点");
  await choose(user, "节点", `${back}（2）`);
  expect(screen.getByText("2 条结果")).toBeTruthy();
  await choose(user, "显示来源", "全部来源");
  await choose(user, "节点", `${back}（2）`);
  expect(screen.getByText("2 条结果")).toBeTruthy();
  expect(screen.getAllByText("共同需求")).toHaveLength(1);
});

it.each(["full", "compact"])("%s 模式恢复旧组合筛选方案且保留原条件，新候选使用独立节点", async (mode) => {
  const data = snapshot(); data.capabilities!.filter_schemes = true;
  vi.mocked(loadSnapshot).mockResolvedValue(data);
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "load_filter_schemes") return { account: "user-a", document: {
      schemaVersion: 1, defaultId: "legacy", schemes: [{ id: "legacy", name: "旧合入方案", includeQuery: false,
        filters: { ...emptyWorkFilters, nodeName: [combined] } }],
    } };
  });
  const user = userEvent.setup(); render(<App />);
  await screen.findByText("共同需求");
  const label = await nodeFilters(user, mode);
  await waitFor(() => expect(screen.queryByText("评审需求")).toBeNull());
  await user.click(screen.getByRole("combobox", { name: label }));
  expect(screen.getByRole("option", { name: `原条件：${combined}（1）` }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("option", { name: `${front}（1）` })).toBeTruthy();
  await user.click(screen.getByRole("option", { name: "全部节点" }));
  expect(screen.queryByRole("option", { name: `原条件：${combined}（1）` })).toBeNull();
  await user.click(screen.getByRole("option", { name: `${back}（2）` }));
  expect(within(screen.getByRole("region", { name: "工作清单" })).getAllByText("共同需求")).toHaveLength(1);
  expect(within(screen.getByRole("region", { name: "工作清单" })).getByText("另一空间同号需求")).toBeTruthy();
  expect(vi.mocked(invoke).mock.calls.some(([command]) => command === "save_filter_schemes")).toBe(false);
});

it.each(["full", "compact"])("%s 模式选择真实含斜线节点时只匹配该节点", async (mode) => {
  const data = snapshot();
  data.items[2] = { ...data.items[2], name: "独立斜线节点需求", current_node_names: [combined],
    flow: { ...data.items[2].flow, node_name: combined } };
  vi.mocked(loadSnapshot).mockResolvedValue(data);
  const user = userEvent.setup(); render(<App />);
  await screen.findByText("共同需求");
  const label = await nodeFilters(user, mode);
  await choose(user, label, `${combined}（1）`);
  const list = screen.getByRole("region", { name: "工作清单" });
  expect(within(list).getAllByText("独立斜线节点需求")).toHaveLength(1);
  expect(within(list).queryByText("共同需求")).toBeNull();
  expect(within(list).queryByText("另一空间同号需求")).toBeNull();
});
