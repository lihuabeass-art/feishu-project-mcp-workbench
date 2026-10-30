// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { loadSnapshot, refreshSourceTypes, saveSourceTypes, syncTodos } from "./api";
import type { CachedItem, Snapshot, SourceTypeScope, SyncReport } from "./types";

vi.mock("./api", () => ({
  desktop: true, loadSnapshot: vi.fn(), refreshSourceTypes: vi.fn(), syncTodos: vi.fn(),
  checkConnection: vi.fn(), saveToken: vi.fn(), saveConnectionSettings: vi.fn(),
  saveSourceTypes: vi.fn(), clearSourceTypes: vi.fn(), saveTypeOrder: vi.fn(),
  getWorkflowActions: vi.fn(), executeWorkflowAction: vi.fn(), cachedItemDetail: vi.fn(), refreshItemDetail: vi.fn(),
}));

const typeKey = "703000000001";
function scope(name: string): SourceTypeScope {
  return { configured: false, selected_count: 1, types: [
    { project_key: "space", project_name: "研发空间", type_key: typeKey, type_name: name, selected: true },
  ] };
}
function item(key = typeKey): CachedItem {
  return { id: { project_key: "space", work_item_type_key: key, work_item_id: key },
    source_ids: ["a"], name: key === typeKey ? "反馈事项" : "新增类型事项", project_name: "研发空间",
    flow: { kind: "none", node_name: null, node_state_key: null, start_state_key_name: null, end_state_key_name: null },
    schedule: { start_raw: null, end_raw: null }, raw_json: "{}", identity_missing_flags: [],
    first_seen_at_ms: 1, last_seen_at_ms: 1, seen_count: 1 };
}
function snapshot(name: string | null = typeKey): Snapshot {
  return { capabilities: { workflow: false, source_queries: true, incremental_sync: true },
    items: [item()], total: 1, last_success: null, runs: [], credential_ready: true,
    credential_description: "已保存凭证", config_path: "config.toml", db_path: "cache.db",
    sources: [{ id: "a", kind: "personal_todo", enabled: true, executable: true, reason: null,
      action: "todo", todo_scope: "in_progress", type_scope: name === null ? { ...scope(""), types: [] } : scope(name) }] };
}
function report(): SyncReport {
  return { status: "success", complete: true, stop_reason: "empty_page", items_inserted: 0,
    items_updated: 0, items_upserted: 0, items_rejected: 0,
    patch: { added: [], modified: [], removed: [], updated_count: 0 } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const discovery = (name: string) => ({ discovered_count: 1, failed: [] as [string, string][], type_scope: scope(name) });
const named = (name: string) => screen.getAllByRole("button", { name: new RegExp(`^${name}`) });

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(loadSnapshot).mockResolvedValue(snapshot());
  vi.mocked(refreshSourceTypes).mockResolvedValue(discovery("需求反馈"));
  vi.mocked(syncTodos).mockResolvedValue(report());
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each([null, typeKey, "远端改名前名称"])("启动时自动刷新旧缓存名称 %s，直接更新侧栏与事项", async (oldName) => {
  vi.mocked(loadSnapshot).mockResolvedValue(snapshot(oldName));
  render(<App />);
  await waitFor(() => expect(named("需求反馈").length).toBeGreaterThan(0));
  expect(screen.getByRole("button", { name: /反馈事项需求反馈/ })).toBeTruthy();
  expect(refreshSourceTypes).toHaveBeenCalledExactlyOnceWith("a");
  expect(loadSnapshot).toHaveBeenCalledOnce();
  expect(syncTodos).not.toHaveBeenCalled();
  expect(saveSourceTypes).not.toHaveBeenCalled();
});

it("事项无业务变化的手动刷新仍取得远端新名称，不产生事项更新计数", async () => {
  render(<App />);
  await waitFor(() => expect(named("需求反馈").length).toBeGreaterThan(0));
  vi.mocked(refreshSourceTypes).mockResolvedValue(discovery("产品反馈"));
  await userEvent.click(screen.getByRole("button", { name: "立即刷新" }));
  await waitFor(() => expect(named("产品反馈").length).toBeGreaterThan(0));
  expect(screen.getByText("检查完成，数据无变化。")).toBeTruthy();
  expect(screen.queryByText(/更新 1 条/)).toBeNull();
  expect(loadSnapshot).toHaveBeenCalledOnce();
  expect(refreshSourceTypes).toHaveBeenCalledTimes(2);
});

it("自动同步同样跟随远端改名，不弹出同步成功提示", async () => {
  vi.useFakeTimers();
  render(<App />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(named("需求反馈").length).toBeGreaterThan(0);
  vi.mocked(refreshSourceTypes).mockResolvedValue(discovery("自动改名"));
  await act(async () => { await vi.advanceTimersByTimeAsync(120_001); });
  expect(syncTodos).toHaveBeenCalledExactlyOnceWith("*", true, ["a"]);
  expect(named("自动改名").length).toBeGreaterThan(0);
  expect(screen.queryByText("检查完成，数据无变化。")).toBeNull();
});

it("远端改名保留显示别名，清空别名后立即使用最新远端名称", async () => {
  localStorage.setItem("fstodo.source-type-preferences.v2", JSON.stringify({ a: {
    [typeKey]: { enabled: true, alias: "个人反馈" },
  } }));
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() => expect(refreshSourceTypes).toHaveBeenCalledOnce());
  await waitFor(() => expect(named("个人反馈").length).toBeGreaterThan(0));
  vi.mocked(refreshSourceTypes).mockResolvedValue(discovery("产品反馈"));
  await user.click(screen.getByRole("button", { name: "立即刷新" }));
  await waitFor(() => expect(refreshSourceTypes).toHaveBeenCalledTimes(2));
  await user.click(screen.getByRole("button", { name: "工作来源" }));
  const alias = await screen.findByLabelText("产品反馈的显示别名") as HTMLInputElement;
  expect(alias.value).toBe("个人反馈");
  expect(named("个人反馈").length).toBeGreaterThan(0);
  await user.clear(alias);
  expect(named("产品反馈").length).toBeGreaterThan(0);
  expect(saveSourceTypes).not.toHaveBeenCalled();
});

it("后台失败不覆盖缓存或操作反馈，下一次成功同步补齐新出现的类型", async () => {
  vi.mocked(loadSnapshot).mockResolvedValue(snapshot("原名称"));
  vi.mocked(refreshSourceTypes).mockRejectedValueOnce({ kind: "connection", message: "RPC diagnostic" });
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() => expect(refreshSourceTypes).toHaveBeenCalledOnce());
  expect(named("原名称").length).toBeGreaterThan(0);
  expect(screen.queryByRole("alert")).toBeNull();
  await user.click(screen.getByRole("button", { name: "工作来源" }));
  await user.click(screen.getByRole("button", { name: /我的工作/ }));
  expect(refreshSourceTypes).toHaveBeenCalledOnce();
  const incoming = discovery("恢复后名称");
  incoming.type_scope.types.push({ ...incoming.type_scope.types[0], type_key: "703000000002", type_name: "新增类型" });
  vi.mocked(refreshSourceTypes).mockResolvedValue(incoming);
  vi.mocked(syncTodos).mockResolvedValue({ ...report(), items_inserted: 1,
    patch: { added: [item("703000000002")], modified: [], removed: [], updated_count: 0 } });
  await user.click(screen.getByRole("button", { name: "立即刷新" }));
  await waitFor(() => expect(named("新增类型").length).toBeGreaterThan(0));
  expect(named("恢复后名称").length).toBeGreaterThan(0);
  expect(screen.getByText("同步完成，新增 1 条、更新 0 条。")).toBeTruthy();
  expect(screen.queryByText(/RPC diagnostic/)).toBeNull();
});

it("较早发起的缓存回读不覆盖后取得的新名称，也不回滚同步范围", async () => {
  const incoming = deferred<ReturnType<typeof discovery>>();
  vi.mocked(refreshSourceTypes).mockReturnValueOnce(incoming.promise);
  const oldSnapshot = snapshot("旧名称");
  const reloaded = deferred<Snapshot>();
  vi.mocked(loadSnapshot).mockResolvedValueOnce(oldSnapshot).mockReturnValueOnce(reloaded.promise);
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText("反馈事项");
  await user.click(screen.getByRole("button", { name: "工作来源" }));
  await user.click(screen.getByRole("switch", { name: "同步旧名称" }));
  await waitFor(() => expect(loadSnapshot).toHaveBeenCalledTimes(2));
  await act(async () => { incoming.resolve(discovery("新名称")); });
  const saved = structuredClone(oldSnapshot);
  saved.sources[0].type_scope!.configured = true;
  saved.sources[0].type_scope!.types[0].selected = false;
  await act(async () => { reloaded.resolve(saved); });
  expect(screen.getByLabelText("新名称的显示别名")).toBeTruthy();
  expect((screen.getByRole("switch", { name: "同步新名称" }) as HTMLInputElement).checked).toBe(false);
});

it.each(["auth", "permission", "config"])("类型目录 %s 错误在对应来源说明，恢复后清除且不改变同步结论", async (kind) => {
  vi.mocked(refreshSourceTypes).mockRejectedValueOnce({ kind, message: "RPC hidden technical detail" });
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText("反馈事项");
  expect(screen.queryByRole("alert")).toBeNull();
  await user.click(screen.getByRole("button", { name: "工作来源" }));
  expect((await screen.findByRole("status")).textContent).toContain("类型名称未刷新");
  expect(screen.queryByText(/hidden technical detail/)).toBeNull();
  await user.click(screen.getByRole("button", { name: /我的工作/ }));
  await user.click(screen.getByRole("button", { name: "立即刷新" }));
  await waitFor(() => expect(named("需求反馈").length).toBeGreaterThan(0));
  expect(screen.getByText("检查完成，数据无变化。")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "工作来源" }));
  expect(screen.queryByText(/^类型名称未刷新/)).toBeNull();
});

it("部分空间需要权限处理时保留成功名称，并给出来源内说明", async () => {
  vi.mocked(refreshSourceTypes).mockResolvedValue({ ...discovery("需求反馈"),
    failed: [["hidden-space", "RPC hidden diagnostic"]], failure_kinds: ["permission"] });
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() => expect(named("需求反馈").length).toBeGreaterThan(0));
  expect(screen.queryByRole("alert")).toBeNull();
  await user.click(screen.getByRole("button", { name: "工作来源" }));
  expect(screen.getByRole("status").textContent).toContain("检查账号在原软件中的访问权限");
  expect(screen.queryByText(/hidden-space|RPC hidden/)).toBeNull();
});
