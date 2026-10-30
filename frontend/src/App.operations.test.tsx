// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import { checkConnection, executeWorkflowAction, getWorkflowActions, loadSnapshot, refreshSourceTypes, saveConnectionSettings, saveToken, saveTypeOrder, syncTodos } from "./api";
import type { CreationForm } from "./creation";
import type { ConnectionInfo, Snapshot, WorkflowResult } from "./types";

const updater = vi.hoisted(() => ({ prepareInstall: async (): Promise<() => void> => () => {} }));
vi.mock("./useAppUpdater", () => ({ useAppUpdater: (options: typeof updater) => {
  updater.prepareInstall = options.prepareInstall;
  return {};
} }));
vi.mock("./AppUpdater", () => ({ AppUpdateDialog: () => null, AppUpdateSettings: () => null }));
// This suite verifies the workspace's operation boundaries, independently of form submission.
vi.mock("./CreateWorkItem", () => ({ CreateWorkItem: ({ close }: { close: () => void }) =>
  <div role="dialog" aria-label="新建窗口"><button onClick={close}>关闭新建窗口</button></div> }));
vi.mock("./api", () => ({
  desktop: true,
  loadSnapshot: vi.fn(), syncTodos: vi.fn(), checkConnection: vi.fn(),
  saveToken: vi.fn(), saveConnectionSettings: vi.fn(), saveTypeOrder: vi.fn(),
  refreshSourceTypes: vi.fn(), refreshWorkspaceCatalog: vi.fn(),
  getWorkflowActions: vi.fn(), executeWorkflowAction: vi.fn(),
  cachedItemDetail: vi.fn(), refreshItemDetail: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", async (original) => ({
  ...(await original<typeof import("@tauri-apps/api/core")>()), invoke: vi.fn(),
}));

const report = { status: "success" as const, complete: true, items_upserted: 0,
  items_inserted: 0, items_updated: 0, items_rejected: 0, stop_reason: "total_reached" };
const connected: ConnectionInfo = { session_established: true, server_name: "飞书", server_version: "1" };
const pending: CreationForm = {
  target: { source_id: "a", project_key: "space", type_key: "story" },
  context: "account", version: "v1", fields: [], pending: null,
};
function snapshot(): Snapshot {
  return {
    capabilities: { workflow: false, creation: true, source_type_preferences: true, type_order: true },
    source_type_preferences: { a: {
      story: { enabled: true, alias: "需求", create_enabled: true },
      issue: { enabled: true, alias: "缺陷", create_enabled: false },
    } },
    type_order: ["story", "issue"],
    sources: [{ id: "a", kind: "personal_todo", enabled: true, executable: true,
      reason: null, action: "todo", todo_scope: "in_progress", type_scope: {
        configured: false, selected_count: 2, types: ["story", "issue"].map((type_key) => ({
          project_key: "space", project_name: "空间", type_key,
          type_name: type_key === "story" ? "需求" : "缺陷", selected: true,
        })),
      } }],
    items: [], total: 0, last_success: null, runs: [], config_path: "config.toml", db_path: "cache.db",
    credential_ready: true, credential_description: "已保存", settings: { endpoint: "https://mcp.example.com" },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const button = (name: string | RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;
const click = (name: string | RegExp) => fireEvent.click(button(name));
function selectStory(mode: "full" | "compact") {
  if (mode === "full") fireEvent.click(within(document.querySelector(".tabs")!).getByRole("button", { name: /需求/ }));
  else fireEvent.click(screen.getByRole("tab", { name: /需求/ }));
}
async function ready(mode: "full" | "compact" = "full") {
  localStorage.setItem("fstodo.display-mode.v1", JSON.stringify({ mode }));
  render(<App />);
  await act(async () => {});
  selectStory(mode);
  await act(async () => {});
  screen.getByRole("button", { name: "新建工作事项" });
}
function enableWorkflow(result: "unknown" | "verified") {
  const data = snapshot();
  data.capabilities!.workflow = true;
  data.items = [{ id: { project_key: "space", work_item_type_key: "story", work_item_id: "1" },
    name: "待处理需求", project_name: "空间", flow: { kind: "node", node_name: "研发", node_state_key: null,
      start_state_key_name: null, end_state_key_name: null }, schedule: { start_raw: null, end_raw: null },
    raw_json: "{}", identity_missing_flags: [], first_seen_at_ms: 1, last_seen_at_ms: 2, seen_count: 1 }];
  data.total = 1;
  vi.mocked(loadSnapshot).mockResolvedValue(data);
  vi.mocked(getWorkflowActions).mockResolvedValue({ version: "v1",
    actions: [{ id: "confirm", label: "完成研发节点", kind: "node", fields: [] }] });
  const workflow: WorkflowResult = { outcome: result, verified: result === "verified", request_id: "workflow-request",
    action_id: "confirm", resynced: true, message: result === "unknown" ? "流程结果不确定，请先核对飞书状态" : "流程推进已核验" };
  vi.mocked(executeWorkflowAction).mockResolvedValue(workflow);
  return workflow.message;
}
async function submitWorkflow() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /待处理需求/ }));
  await user.click(await screen.findByRole("button", { name: "完成研发节点" }));
  await user.click(screen.getByRole("button", { name: "提交" }));
  await user.click(screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"));
  await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
}
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  const data = snapshot();
  vi.mocked(loadSnapshot).mockResolvedValue(data);
  vi.mocked(syncTodos).mockResolvedValue(report);
  vi.mocked(checkConnection).mockResolvedValue(connected);
  vi.mocked(refreshSourceTypes).mockResolvedValue({ discovered_count: 2, failed: [], type_scope: data.sources[0].type_scope! });
  vi.mocked(invoke).mockImplementation(async (command) => command === "get_pending_creations" ? [pending] : undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each([ ["full", false], ["compact", false], ["full", true], ["compact", true] ] as const)(
  "%s 布局%s自动同步期间仍可打开新建与核验，不发送创建请求", async (mode, automatic) => {
    const sync = deferred<typeof report>();
    vi.mocked(syncTodos).mockReturnValue(sync.promise);
    if (automatic) vi.useFakeTimers();
    await ready(mode);
    if (automatic) await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    else click("立即刷新");
    expect(syncTodos).toHaveBeenCalledOnce();
    expect(button("新建工作事项").disabled).toBe(false);
    expect(button(/核验创建记录/).disabled).toBe(false);
    click("新建工作事项");
    expect(screen.getByRole("dialog", { name: "新建窗口" })).toBeTruthy();
    click("关闭新建窗口");
    click(/核验创建记录/);
    await act(async () => {});
    expect(screen.getByRole("dialog", { name: "新建窗口" })).toBeTruthy();
    expect(vi.mocked(invoke).mock.calls.some(([command]) => command === "create_work_item")).toBe(false);
    await act(async () => sync.resolve(report));
  },
);

it.each([true, false])("同步与连接检查只释放自己的状态（检查先结束=%s）", async (checkFirst) => {
  const sync = deferred<typeof report>();
  const check = deferred<ConnectionInfo>();
  vi.mocked(syncTodos).mockReturnValue(sync.promise);
  vi.mocked(checkConnection).mockReturnValue(check.promise);
  await ready(); click("立即刷新"); click("连接与配置"); click("检查连接");
  expect(checkConnection).toHaveBeenCalledOnce();
  expect((screen.getByLabelText("MCP Token") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("combobox", { name: "链接打开方式" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("combobox", { name: "链接打开方式" }));
  fireEvent.click(screen.getByRole("option", { name: "已有浏览器" }));
  expect(screen.getByRole("combobox", { name: "链接打开方式" }).textContent).toContain("已有浏览器");
  if (checkFirst) await act(async () => check.resolve(connected));
  else await act(async () => sync.resolve(report));
  expect((screen.getByLabelText("MCP Token") as HTMLInputElement).disabled).toBe(true);
  if (!checkFirst) {
    expect(button("检查中…").disabled).toBe(true);
    fireEvent.click(button("检查中…"));
    expect(checkConnection).toHaveBeenCalledOnce();
  }
  click(/我的工作/); selectStory("full");
  expect(button("新建工作事项").disabled).toBe(false);
  if (checkFirst) {
    expect(button("正在同步").disabled).toBe(true);
    fireEvent.click(button("正在同步"));
    expect(syncTodos).toHaveBeenCalledOnce();
    await act(async () => sync.resolve(report));
  } else await act(async () => check.resolve(connected));
  click("连接与配置");
  expect((screen.getByLabelText("MCP Token") as HTMLInputElement).disabled).toBe(false);
});

it("发现类型失败仅释放发现状态，同步和创建入口不受影响", async () => {
  const sync = deferred<typeof report>();
  const discovery = deferred<Awaited<ReturnType<typeof refreshSourceTypes>>>();
  vi.mocked(syncTodos).mockReturnValue(sync.promise);
  await ready(); click("立即刷新"); click("工作来源");
  vi.mocked(refreshSourceTypes).mockReturnValueOnce(discovery.promise);
  click("发现类型"); await act(async () => {});
  expect(button("发现类型").disabled).toBe(true);
  await act(async () => discovery.reject({ kind: "connection", message: "类型读取失败" }));
  expect(button("发现类型").disabled).toBe(false);
  expect(button("正在同步…").disabled).toBe(true);
  click(/我的工作/); selectStory("full");
  expect(button("新建工作事项").disabled).toBe(false);
  await act(async () => sync.resolve(report));
});

it("同步回读不会覆盖并行保存的本地类型排序，排序也不会锁住创建", async () => {
  const sync = deferred<typeof report>(); const order = deferred<void>();
  vi.mocked(syncTodos).mockReturnValue(sync.promise);
  vi.mocked(saveTypeOrder).mockReturnValue(order.promise);
  await ready(); click("立即刷新");
  const typeNav = within(document.querySelector(".type-nav")!);
  fireEvent.keyDown(typeNav.getByRole("button", { name: /需求/ }), { key: "ArrowDown", altKey: true });
  expect(saveTypeOrder).toHaveBeenCalledWith(["issue", "story"], true);
  expect(button("新建工作事项").disabled).toBe(false);
  await act(async () => sync.resolve(report));
  expect(typeNav.getAllByRole("button")[0].textContent).toContain("缺陷");
  click("连接与配置");
  expect((screen.getByLabelText("MCP Token") as HTMLInputElement).disabled).toBe(true);
  await act(async () => order.resolve());
  expect((screen.getByLabelText("MCP Token") as HTMLInputElement).disabled).toBe(false);
  expect(typeNav.getAllByRole("button")[0].textContent).toContain("缺陷");
});

it.each(["token", "endpoint"] as const)("%s 保存期间两种布局统一保护新建与核验入口", async (action) => {
  const save = deferred<string>();
  vi.mocked(saveToken).mockReturnValue(save.promise);
  vi.mocked(saveConnectionSettings).mockImplementation(() => save.promise.then(() => undefined));
  await ready(); click("连接与配置");
  if (action === "token") {
    fireEvent.change(screen.getByLabelText("MCP Token"), { target: { value: "test-token" } });
    click("保存 Token");
  } else {
    const input = screen.getByLabelText("MCP 服务地址");
    fireEvent.change(input, { target: { value: "https://new-mcp.example.com" } });
    fireEvent.blur(input);
    await waitFor(() => expect(saveConnectionSettings).toHaveBeenCalledOnce());
  }
  click(/我的工作/); selectStory("full");
  expect(button("新建工作事项").disabled).toBe(true);
  expect(button(/核验创建记录/).disabled).toBe(true);
  click("切换到清单模式");
  expect(button("新建工作事项").disabled).toBe(true);
  expect(button("核验创建记录").disabled).toBe(true);
  fireEvent.click(button("新建工作事项"));
  expect(screen.queryByRole("dialog", { name: "新建窗口" })).toBeNull();
  await act(async () => save.resolve("已保存的新凭证"));
  expect(button("新建工作事项").disabled).toBe(false);
});

it("创建窗口打开及核验记录读取期间禁止切换上下文和安装，关闭后恢复", async () => {
  await ready(); click("新建工作事项"); click("连接与配置");
  expect((screen.getByLabelText("MCP Token") as HTMLInputElement).disabled).toBe(true);
  expect(screen.getByLabelText("MCP 服务地址").matches(":disabled")).toBe(true);
  await expect(Promise.resolve().then(() => updater.prepareInstall())).rejects.toThrow("当前操作尚未结束");
  click("关闭新建窗口");
  expect((screen.getByLabelText("MCP Token") as HTMLInputElement).disabled).toBe(false);
  const recovery = deferred<CreationForm[]>();
  vi.mocked(invoke).mockImplementation(async (command) => command === "get_pending_creations" ? recovery.promise : undefined);
  click(/我的工作/); selectStory("full"); click(/核验创建记录/); click("连接与配置");
  expect((screen.getByLabelText("MCP Token") as HTMLInputElement).disabled).toBe(true);
  await expect(Promise.resolve().then(() => updater.prepareInstall())).rejects.toThrow("当前操作尚未结束");
  await act(async () => recovery.resolve([]));
  expect((screen.getByLabelText("MCP Token") as HTMLInputElement).disabled).toBe(false);
});

it.each(["full", "compact"] as const)("%s 核验记录读取失败保留并行流程的不确定结论，重试仅清自身反馈", async (mode) => {
  const message = enableWorkflow("unknown");
  await ready(mode);
  const recovery = deferred<CreationForm[]>();
  vi.mocked(invoke).mockImplementation(async (command) => command === "get_pending_creations" ? recovery.promise : undefined);
  click(/核验创建记录/);
  await submitWorkflow();
  await screen.findByText(message);
  await act(async () => recovery.reject({ kind: "storage", message: "创建记录暂时无法读取" }));
  expect(screen.getByText(message)).toBeTruthy();
  expect(screen.getByText("创建记录暂时无法读取")).toBeTruthy();
  expect(button("重试读取创建记录").disabled).toBe(false);
  if (mode === "compact") {
    click("返回清单");
    expect(button("核验创建记录").disabled).toBe(false);
  } else expect(button(/核验创建记录/).disabled).toBe(false);
  const retry = deferred<CreationForm[]>();
  vi.mocked(invoke).mockImplementation(async (command) => command === "get_pending_creations" ? retry.promise : undefined);
  click("重试读取创建记录");
  expect(screen.queryByText("创建记录暂时无法读取")).toBeNull();
  expect(screen.getByText(message)).toBeTruthy();
  await act(async () => retry.resolve([]));
  expect(screen.getByText(message)).toBeTruthy();
  expect(screen.getByText("没有待核验的创建记录。")).toBeTruthy();
});

it.each(["unknown", "verified"] as const)("核验记录读取为空时保留并行流程的 %s 结论", async (outcome) => {
  const message = enableWorkflow(outcome);
  await ready();
  const recovery = deferred<CreationForm[]>();
  vi.mocked(invoke).mockImplementation(async (command) => command === "get_pending_creations" ? recovery.promise : undefined);
  click(/核验创建记录/);
  await submitWorkflow();
  await screen.findByText(message);
  await act(async () => recovery.resolve([]));
  expect(screen.getByText(message)).toBeTruthy();
  expect(screen.getByText("没有待核验的创建记录。")).toBeTruthy();
});

it("创建记录缓存为空且读取失败时，完整与清单模式都保留核验重试入口", async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "get_pending_creations") throw { kind: "storage", message: "读取失败" };
    return undefined;
  });
  await ready();
  click(/核验创建记录/);
  await screen.findByText("读取失败");
  expect(button(/核验创建记录/).disabled).toBe(false);
  click("切换到清单模式");
  expect(button("核验创建记录").disabled).toBe(false);
});

it("安装准备持锁期间两种布局的新建与核验一致禁用，失败后只释放安装锁", async () => {
  const preparation = deferred<void>();
  await ready();
  vi.mocked(invoke).mockImplementation(async (command) => command === "get_pending_creations" ? [pending]
    : command === "prepare_app_update" ? preparation.promise : undefined);
  let install!: Promise<() => void>;
  await act(async () => { install = updater.prepareInstall(); });
  expect(button("新建工作事项").disabled).toBe(true);
  click("切换到清单模式");
  expect(button("新建工作事项").disabled).toBe(true);
  expect(button("核验创建记录").disabled).toBe(true);
  const failure = expect(install).rejects.toThrow("持久化失败");
  await act(async () => preparation.reject(new Error("持久化失败")));
  await failure;
  expect(button("新建工作事项").disabled).toBe(false);
});
