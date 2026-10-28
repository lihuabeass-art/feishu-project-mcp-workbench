// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { loadSnapshot, refreshWorkspaceCatalog, syncTodos } from "./api";
import type { CachedItem, CatalogRefresh, Snapshot, SpaceCatalog, SyncReport } from "./types";

vi.mock("./api", () => ({ desktop: true, loadSnapshot: vi.fn(), refreshWorkspaceCatalog: vi.fn(),
  syncTodos: vi.fn(), checkConnection: vi.fn(), saveToken: vi.fn(), saveConnectionSettings: vi.fn(),
  refreshSourceTypes: vi.fn(), saveSourceTypes: vi.fn(), clearSourceTypes: vi.fn(), saveTypeOrder: vi.fn(),
  executeWorkflowAction: vi.fn(), cachedItemDetail: vi.fn(), refreshItemDetail: vi.fn(),
  removeWorkSource: vi.fn(), setWorkSourceEnabled: vi.fn(), saveWorkSource: vi.fn(), discoverSourceFields: vi.fn(),
}));
beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); });
afterEach(cleanup);
const projects = ["应用平台", "医生平台", "患者平台"].map((name, i) => ({ field_key: "custom", id: String(i), name, type_key: "story" }));
const catalog: SpaceCatalog[] = [{ project_key: "space", name: "正式研发空间", simple_name: "alias", projects }];
function snapshot(): Snapshot {
  const items: CachedItem[] = [0,1].map((i) => ({
    id: { project_key: "space", work_item_type_key: "story", work_item_id: String(i) },
    source_ids: i === 0 ? ["todo", "stories"] : ["stories"],
    project_name: i === 0 ? "应用平台" : "另一空间名称", related_projects: [projects[i]], name: `需求${i}`,
    flow: { kind: "none", node_name: null, node_state_key: null, start_state_key_name: null, end_state_key_name: null },
    schedule: { start_raw: null, end_raw: null }, raw_json: "{}", identity_missing_flags: [],
    first_seen_at_ms: 1, last_seen_at_ms: 1, seen_count: 1,
  }));
  return { capabilities: { source_queries: true, workspace_catalog: true, workflow: false },
    items, total: 2, last_success: null, runs: [], credential_ready: true, credential_description: "已配置",
    config_path: "config", db_path: "db", workspace_catalog: [],
    sources: [{ id: "todo", kind: "personal_todo", enabled: true, executable: true, reason: null, action: "todo", todo_scope: "in_progress" },
      { id: "stories", builtin_key: "stories", kind: "work_item_type", enabled: true, executable: true, reason: null,
        action: null, todo_scope: null, project_key: "space", work_item_type_key: "story" }],
  };
}
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, name: string) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(screen.getByRole("option", { name }));
  await user.keyboard("{Escape}");
}
function report(incremental: boolean): SyncReport {
  return { status: "success", complete: true, items_upserted: 0, items_inserted: 0, items_updated: 0,
    items_rejected: 0, items_out_of_scope: 0, stop_reason: "empty_page",
    ...(incremental ? { patch: { added: [], modified: [], removed: [], updated_count: 0 } } : {}) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
it("全部来源的重叠事项只出现一次，空间统一命名，所属项目仅显示有工作的候选", async () => {
  vi.mocked(loadSnapshot).mockResolvedValue(snapshot());
  vi.mocked(refreshWorkspaceCatalog).mockResolvedValue({ spaces: catalog, warnings: [] });
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() => expect(refreshWorkspaceCatalog).toHaveBeenCalledOnce());
  const list = screen.getByRole("region", { name: "工作清单" });
  expect(within(list).getAllByText("需求0")).toHaveLength(1);
  expect(await within(list).findAllByText("空间：正式研发空间")).toHaveLength(2);
  await choose(user, "空间", "正式研发空间");
  await choose(user, "所属项目", "医生平台");
  expect(within(list).queryByText("需求0")).toBeNull();
  expect(within(list).getByText("需求1")).toBeTruthy();
  await user.click(screen.getByRole("combobox", { name: "所属项目" }));
  expect(screen.queryByRole("option", { name: "患者平台" })).toBeNull();
  await user.keyboard("{Escape}");
  await user.click(within(list).getAllByRole("button", { name: "清除筛选" })[0]);
  expect(within(list).getByText("需求0")).toBeTruthy();
  expect(within(list).getByText("需求1")).toBeTruthy();
});
it("项目筛选支持连续多选、再次点击取消及全部清空", async () => {
  vi.mocked(loadSnapshot).mockResolvedValue({ ...snapshot(), workspace_catalog: catalog });
  vi.mocked(refreshWorkspaceCatalog).mockResolvedValue({ spaces: catalog, warnings: [] });
  const user = userEvent.setup();
  render(<App />);
  const list = await screen.findByRole("region", { name: "工作清单" });
  await within(list).findByText("需求0");
  await user.click(screen.getByRole("combobox", { name: "所属项目" }));
  await user.click(screen.getByRole("option", { name: "应用平台" }));
  expect(within(list).queryByText("需求1")).toBeNull();
  await user.click(screen.getByRole("option", { name: "医生平台" }));
  expect(within(list).getByText("需求0")).toBeTruthy();
  expect(within(list).getByText("需求1")).toBeTruthy();
  await user.click(screen.getByRole("option", { name: "应用平台" }));
  expect(within(list).queryByText("需求0")).toBeNull();
  await user.click(screen.getByRole("option", { name: "医生平台" }));
  expect(within(list).getByText("需求0")).toBeTruthy();
  expect(within(list).getByText("需求1")).toBeTruthy();
  expect(screen.queryByRole("option", { name: "患者平台" })).toBeNull();
  await user.click(screen.getByRole("option", { name: "全部项目" }));
  expect(within(list).getByText("需求0")).toBeTruthy();
});
it.each([false, true])("目录刷新失败时保留筛选，通过统一入口重试（增量：%s）", async (incremental) => {
  const data = snapshot();
  data.capabilities!.incremental_sync = incremental;
  vi.mocked(loadSnapshot).mockResolvedValue({ ...data, workspace_catalog: catalog });
  vi.mocked(refreshWorkspaceCatalog).mockRejectedValueOnce({ message: "暂时不可读" })
    .mockResolvedValue({ spaces: catalog, warnings: [] });
  vi.mocked(syncTodos).mockResolvedValue(report(incremental));
  const user = userEvent.setup();
  render(<App />);
  expect(await screen.findByText(/空间与项目目录未刷新/)).toBeTruthy();
  await choose(user, "所属项目", "医生平台");
  expect(screen.queryByRole("button", { name: "刷新空间与项目" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "立即刷新" }));
  await waitFor(() => expect(screen.queryByText(/空间与项目目录未刷新/)).toBeNull());
  expect(refreshWorkspaceCatalog).toHaveBeenCalledTimes(2);
  expect(syncTodos).toHaveBeenCalledOnce();
  expect(screen.getByRole("combobox", { name: "所属项目" }).textContent).toBe("医生平台");
});

it.each([false, true])("目录自动读取未完成时立即刷新复用请求，连续点击不重复同步（增量：%s）", async (incremental) => {
  const data = snapshot();
  data.capabilities!.incremental_sync = incremental;
  vi.mocked(loadSnapshot).mockResolvedValue({ ...data, workspace_catalog: catalog });
  const directory = deferred<CatalogRefresh>();
  const sync = deferred<SyncReport>();
  vi.mocked(refreshWorkspaceCatalog).mockReturnValue(directory.promise);
  vi.mocked(syncTodos).mockReturnValue(sync.promise);
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText("需求0");
  await choose(user, "所属项目", "医生平台");
  await user.click(screen.getByRole("button", { name: "立即刷新" }));
  fireEvent.click(screen.getByRole("button", { name: "正在同步" }));
  fireEvent.click(screen.getByRole("button", { name: "正在同步" }));
  await act(async () => sync.resolve(report(incremental)));
  expect(syncTodos).toHaveBeenCalledOnce();
  expect(refreshWorkspaceCatalog).toHaveBeenCalledOnce();
  const renamed = catalog.map((space) => ({ ...space, name: "更新后的研发空间" }));
  await act(async () => directory.resolve({ spaces: renamed, warnings: [] }));
  await choose(user, "所属项目", "医生平台");
  await choose(user, "所属项目", "应用平台");
  expect(screen.getByText("空间：更新后的研发空间")).toBeTruthy();
});

it("同步发现新空间后读取新目录，旧范围的迟到结果不会覆盖新目录", async () => {
  const data = snapshot();
  data.capabilities!.incremental_sync = true;
  vi.mocked(loadSnapshot).mockResolvedValue(data);
  const oldDirectory = deferred<CatalogRefresh>();
  const newSpace: SpaceCatalog = { project_key: "new-space", name: "新空间", simple_name: null, projects: [] };
  vi.mocked(refreshWorkspaceCatalog).mockReturnValueOnce(oldDirectory.promise)
    .mockResolvedValue({ spaces: [...catalog, newSpace], warnings: [] });
  const added = { ...data.items[0], name: "新空间事项", id: { ...data.items[0].id, project_key: "new-space" } };
  vi.mocked(syncTodos).mockResolvedValue({ ...report(true), patch: { added: [added], modified: [], removed: [] } });
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "立即刷新" }));
  expect(await screen.findByText("空间：新空间")).toBeTruthy();
  expect(refreshWorkspaceCatalog).toHaveBeenCalledTimes(2);
  await act(async () => oldDirectory.resolve({ spaces: catalog, warnings: [] }));
  expect(screen.getByText("空间：新空间")).toBeTruthy();
});

it.each([false, true])("两种模式都只显示有工作的空间与项目（清单模式：%s）", async (compact) => {
  const data = snapshot();
  data.items = data.items.slice(0, 1);
  data.total = 1;
  const directory = [...catalog, { project_key: "empty", name: "没有工作的空间", simple_name: null, projects }];
  vi.mocked(loadSnapshot).mockResolvedValue({ ...data, workspace_catalog: directory });
  vi.mocked(refreshWorkspaceCatalog).mockResolvedValue({ spaces: directory, warnings: [] });
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText("需求0");
  if (compact) {
    await user.click(screen.getByRole("button", { name: "切换到清单模式" }));
    await user.click(screen.getByRole("button", { name: "清单筛选" }));
  }
  await user.click(screen.getByRole("combobox", { name: compact ? "清单空间" : "空间" }));
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["全部空间", "正式研发空间"]);
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("combobox", { name: compact ? "清单所属项目" : "所属项目" }));
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["全部项目", "应用平台"]);
});

it("同步移除已选项目的最后一条工作后保留可取消条件，取消后隐藏空项目", async () => {
  const data = snapshot();
  data.capabilities!.incremental_sync = true;
  vi.mocked(loadSnapshot).mockResolvedValue({ ...data, workspace_catalog: catalog });
  vi.mocked(refreshWorkspaceCatalog).mockResolvedValue({ spaces: catalog, warnings: [] });
  vi.mocked(syncTodos).mockResolvedValue({ ...report(true), patch: { added: [], modified: [], removed: [data.items[1].id] } });
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText("需求0");
  await choose(user, "所属项目", "医生平台");
  await user.click(screen.getByRole("button", { name: "立即刷新" }));
  await screen.findByText("没有匹配的工作");
  expect(screen.getByRole("combobox", { name: "所属项目" }).textContent).toBe("医生平台");
  await choose(user, "所属项目", "医生平台");
  expect(screen.getByText("需求0")).toBeTruthy();
  await user.click(screen.getByRole("combobox", { name: "所属项目" }));
  expect(screen.queryByRole("option", { name: "医生平台" })).toBeNull();
});

it("目录不可用且同项目缓存名称不同时，两种模式使用同一份候选", async () => {
  const data = snapshot();
  data.capabilities!.workspace_catalog = false;
  data.items = data.items.map((entry, index) => ({ ...entry, updated_at_ms: index + 1,
    related_projects: [{ ...projects[0], name: index === 0 ? "旧项目名" : "新项目名" }] }));
  vi.mocked(loadSnapshot).mockResolvedValue(data);
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText("需求0");
  await user.click(screen.getByRole("combobox", { name: "所属项目" }));
  const options = screen.getAllByRole("option").map((option) => option.textContent);
  expect(options).toHaveLength(2);
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "切换到清单模式" }));
  await user.click(screen.getByRole("button", { name: "清单筛选" }));
  await user.click(screen.getByRole("combobox", { name: "清单所属项目" }));
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(options);
});

it.each([false, true])("流程候选随搜索联动，零结果已选条件仍可取消（清单模式：%s）", async (compact) => {
  const data = snapshot();
  data.items[0].flow.kind = "node";
  data.items[1].flow.kind = "state";
  vi.mocked(loadSnapshot).mockResolvedValue(data);
  vi.mocked(refreshWorkspaceCatalog).mockResolvedValue({ spaces: catalog, warnings: [] });
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText("需求0");
  if (compact) {
    await user.click(screen.getByRole("button", { name: "切换到清单模式" }));
    await user.click(screen.getByRole("button", { name: "清单筛选" }));
    await user.click(screen.getByText("更多条件"));
  }
  const flow = compact ? "清单流程类型" : "流程类型";
  const search = screen.getByRole("textbox", { name: compact ? "清单搜索工作" : "搜索工作" });
  await user.type(search, "需求0");
  await user.click(screen.getByRole("combobox", { name: flow }));
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["全部流程类型", "节点流"]);
  await user.click(screen.getByRole("option", { name: "节点流" }));
  await user.keyboard("{Escape}");
  await user.clear(search);
  await user.type(search, "需求1");
  await user.click(screen.getByRole("combobox", { name: flow }));
  expect(screen.getAllByRole("option").map((option) => option.textContent))
    .toEqual(["全部流程类型", "状态流", "节点流"]);
  await user.click(screen.getByRole("option", { name: "节点流" }));
  expect(screen.queryByRole("option", { name: "节点流" })).toBeNull();
  await user.keyboard("{Escape}");
  expect(within(screen.getByRole("region", { name: "工作清单" })).getByText("需求1")).toBeTruthy();
});

it.each([false, true])("调整上层筛选清理下层条件的规则一致（清单模式：%s）", async (compact) => {
  const data = snapshot();
  data.items[0].flow.kind = "node";
  data.items[1].flow.kind = "state";
  vi.mocked(loadSnapshot).mockResolvedValue({ ...data, workspace_catalog: catalog });
  vi.mocked(refreshWorkspaceCatalog).mockResolvedValue({ spaces: catalog, warnings: [] });
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText("需求0");
  if (compact) {
    await user.click(screen.getByRole("button", { name: "切换到清单模式" }));
    await user.click(screen.getByRole("button", { name: "清单筛选" }));
    await user.click(screen.getByText("更多条件"));
  }
  const flow = compact ? "清单流程类型" : "流程类型";
  const space = compact ? "清单空间" : "空间";
  const project = compact ? "清单所属项目" : "所属项目";
  await choose(user, flow, "状态流");
  await choose(user, space, "正式研发空间");
  expect(screen.getByRole("combobox", { name: flow }).textContent).toBe("全部流程类型");
  await choose(user, project, "医生平台");
  await choose(user, flow, "状态流");
  await choose(user, project, "全部项目");
  expect(screen.getByRole("combobox", { name: flow }).textContent).toBe("全部流程类型");
  const list = screen.getByRole("region", { name: "工作清单" });
  expect(within(list).getByText("需求0")).toBeTruthy();
  expect(within(list).getByText("需求1")).toBeTruthy();
});
