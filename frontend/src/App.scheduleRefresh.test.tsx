// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { executeWorkflowAction, getWorkflowActions, loadSnapshot } from "./api";
import { closeScheduleSession, loadSchedulePeople, loadScheduleSession, readCachedScheduleHistory, readCachedSchedulePeople, submitScheduleTargets, type ScheduleRead, type ScheduleWriteResult } from "./scheduleApi";

vi.mock("./api", async (original) => ({
  ...await original<typeof import("./api")>(),
  desktop: true,
  getWorkflowActions: vi.fn(),
  executeWorkflowAction: vi.fn(),
  loadSnapshot: vi.fn().mockResolvedValue({ items: [], total: 0, last_success: null, runs: [], sources: [], config_path: "cfg", db_path: "db", credential_ready: true, credential_description: "已配置" }),
}));
vi.mock("./scheduleApi", () => ({
  loadScheduleHistory: vi.fn().mockResolvedValue({ people: [], targets: [], complete: true }),
  readCachedScheduleHistory: vi.fn(),
  readCachedSchedulePeople: vi.fn(),
  loadScheduleSession: vi.fn(), loadSchedulePeople: vi.fn(),
  closeScheduleSession: vi.fn().mockResolvedValue(undefined),
  resetScheduleSession: vi.fn().mockResolvedValue(undefined), submitScheduleTargets: vi.fn(),
}));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); vi.restoreAllMocks(); });
beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadSnapshot).mockResolvedValue({ items: [], total: 0, last_success: null, runs: [], sources: [], config_path: "cfg", db_path: "db", credential_ready: true, credential_description: "已配置" });
  vi.mocked(closeScheduleSession).mockResolvedValue();
  vi.mocked(readCachedScheduleHistory).mockResolvedValue(undefined);
  vi.mocked(readCachedSchedulePeople).mockResolvedValue(null);
});

it("完整模式首屏先显示问候，排期读完后在同一张卡片补上姓名和头像", async () => {
  let finishRead!: (read: ScheduleRead) => void;
  vi.mocked(loadScheduleSession).mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve; }));

  render(<App />);
  const page = screen.getByRole("region", { name: "事项安排" });
  const greeting = within(page).getByLabelText("今日问候");
  expect(greeting.textContent).toMatch(/\d+月\d+日星期/);
  expect(greeting.querySelector("p")?.textContent).toBeTruthy();
  expect(greeting.querySelector("strong, img")).toBeNull();
  expect(within(page).queryByText("事项安排", { exact: true })).toBeNull();

  await waitFor(() => expect(loadScheduleSession).toHaveBeenCalledTimes(1));
  await act(async () => finishRead({
    sessionId: "greeting", currentUserId: "me", peopleLoaded: false, readAt: "刚刚", complete: true,
    sources: [], people: [{ id: "me", name: "测试用户", avatar: "https://example.com/avatar.png" }], targets: [],
  }));
  expect(within(page).getByLabelText("今日问候")).toBe(greeting);
  expect(within(greeting).getByText("测试用户")).toBeTruthy();
  expect(greeting.querySelector("img")?.getAttribute("src")).toBe("https://example.com/avatar.png");
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
});

it.each([
  ["verified", "success"], ["verified", "stale"], ["verified", "failure"], ["verified", "slow-list"],
  ["failed", "success"], ["unknown", "success"],
] as const)("事项安排流程%s后以%s读取验证刷新提示、旧请求隔离及选择保留", async (outcome, refreshOutcome) => {
  let now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const snapshot = await loadSnapshot();
  vi.mocked(loadSnapshot).mockResolvedValue({ ...snapshot, capabilities: { ...snapshot.capabilities, workflow: true } });
  const read: ScheduleRead = {
    sessionId: "before", currentUserId: "me", peopleLoaded: false, readAt: "刚刚", complete: true,
    sources: [], people: [{ id: "me", name: "本人" }],
    targets: [{ id: "one", identity: { connection: "c", project: "p", type: "t", item: "i", node: "n", scope: "personal", owner: "me" }, title: "待处理事项", nodeName: "开发", ownerId: "me", ownerIds: ["me"], sourceIds: [], projectName: "空间", typeName: "需求", dates: { start: "2026-11-16", end: "2026-11-17" }, nodeStatus: "doing", mine: true }],
  };
  let finishRead!: (value: ScheduleRead) => void;
  let failRead!: (error: unknown) => void;
  let finishOldRead!: (value: ScheduleRead) => void;
  vi.mocked(loadScheduleSession).mockResolvedValueOnce(read);
  if (refreshOutcome === "stale") vi.mocked(loadScheduleSession).mockImplementationOnce(() => new Promise((resolve) => { finishOldRead = resolve; }));
  vi.mocked(loadScheduleSession).mockImplementationOnce(() => new Promise((resolve, reject) => { finishRead = resolve; failRead = reject; }));
  vi.mocked(getWorkflowActions).mockResolvedValueOnce({ version: "v1", actions: [{ id: "node:confirm:n", kind: "node", label: "完成开发", fields: [] }] })
    .mockResolvedValue({ version: "v2", actions: [] });
  vi.mocked(executeWorkflowAction).mockResolvedValue({ outcome, verified: outcome === "verified", message: `流程结果 ${outcome}`, request_id: "r", action_id: "node:confirm:n", resynced: true });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "事项安排" }));
  const nextWeek = await screen.findByRole("button", { name: "下一周" });
  fireEvent.click(nextWeek);
  const range = nextWeek.parentElement!.querySelector("strong")!.textContent;
  if (refreshOutcome === "stale") {
    now += 300_000;
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(loadScheduleSession).toHaveBeenCalledTimes(2));
  }
  fireEvent.click(await screen.findByRole("tab", { name: "已排期 (1)" }));
  fireEvent.click(screen.getAllByRole("button", { name: /待处理事项.*开发/ })[0]);
  const inspector = within(screen.getByLabelText("排期检查器"));
  expect(getWorkflowActions).not.toHaveBeenCalled();
  fireEvent.click(inspector.getByRole("button", { name: "查看可用流程动作" }));
  fireEvent.click(await inspector.findByRole("button", { name: "完成开发" }));
  const dialog = within(screen.getByRole("dialog", { name: "开发 流程操作" }));
  fireEvent.click(dialog.getByRole("button", { name: "提交" }));
  const review = within(await dialog.findByRole("region", { name: "提交前二次确认" }));
  fireEvent.click(review.getByRole("button", { name: /我已核对/ }));
  let finishSnapshot!: () => void;
  if (refreshOutcome === "slow-list") vi.mocked(loadSnapshot).mockImplementationOnce(() => new Promise((resolve) => { finishSnapshot = () => resolve({ ...snapshot, capabilities: { ...snapshot.capabilities, workflow: true } }); }));
  await act(async () => fireEvent.click(review.getByRole("button", { name: /确认/ })));
  if (outcome !== "verified") {
    await screen.findAllByText(`流程结果 ${outcome}`);
    expect(loadScheduleSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("正在刷新最新排期")).toBeNull();
    return;
  }
  await waitFor(() => expect(loadScheduleSession).toHaveBeenCalledTimes(refreshOutcome === "stale" ? 3 : 2));
  expect(screen.getByText("正在刷新最新排期")).toBeTruthy();
  expect(closeScheduleSession).not.toHaveBeenCalled();
  if (refreshOutcome === "failure") {
    await act(async () => failRead(new Error("offline")));
    expect(screen.getByText("暂未取得最新排期，已保留上次内容")).toBeTruthy();
    expect(inspector.getByText("待处理事项")).toBeTruthy();
    expect(screen.getAllByText("流程结果 verified").length).toBeGreaterThan(0);
    return;
  }
  await act(async () => finishRead({ ...read, sessionId: "after",
    targets: [{ ...read.targets[0], id: "new-row", title: "核验后事项", nodeStatus: "done" }],
  }));
  await inspector.findByText("核验后事项");
  expect(nextWeek.parentElement!.querySelector("strong")!.textContent).toBe(range);
  if (refreshOutcome === "slow-list") await act(async () => finishSnapshot());
  if (refreshOutcome === "stale") {
    await act(async () => finishOldRead({ ...read, sessionId: "old-inflight", targets: [{ ...read.targets[0], title: "过期事项" }] }));
    expect(inspector.queryByText("过期事项")).toBeNull();
    expect(inspector.getByText("核验后事项")).toBeTruthy();
  }
});

it.each(["success", "partial", "rejected"])("真实页面在后台%s期间编辑与提交交错，保留会话并在后续刷新恢复", async (outcome) => {
  let now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const read: ScheduleRead = {
    sessionId: "editing", currentUserId: "me", peopleLoaded: false, readAt: "刚刚", complete: true,
    sources: [{ id: "todo", name: "个人待办", complete: true }], people: [{ id: "me", name: "本人" }],
    targets: [{ id: "one", identity: { connection: "c", project: "p", type: "t", item: "i", node: "n", scope: "personal", owner: "me" }, title: "当前节点", nodeName: "开发", ownerId: "me", ownerIds: ["me"], sourceIds: ["todo"], projectName: "空间", typeName: "需求", dates: { start: "", end: "" }, mine: true }],
  };
  let finishRead!: (read: ScheduleRead) => void;
  let rejectRead!: (error: unknown) => void;
  let finishWrite!: (result: ScheduleWriteResult) => void;
  vi.mocked(loadScheduleSession).mockResolvedValueOnce(read).mockImplementationOnce(() => new Promise((resolve, reject) => { finishRead = resolve; rejectRead = reject; }));
  vi.mocked(submitScheduleTargets).mockImplementationOnce(() => new Promise((resolve) => { finishWrite = resolve; }));
  render(<App />);
  await waitFor(() => expect(loadScheduleSession).toHaveBeenCalledTimes(1));
  fireEvent.click(await screen.findByRole("button", { name: "事项安排" }));
  fireEvent.click(await screen.findByText("当前节点"));
  now += 300_000;
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(loadScheduleSession).toHaveBeenCalledTimes(2));
  expect(closeScheduleSession).not.toHaveBeenCalled();
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(false);
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-11-16" } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-11-17" } });
  fireEvent.click(screen.getByRole("button", { name: /核对并同步|同步排期/ }));
  const dialog = screen.getByRole("dialog", { name: "核对排期变更并同步" });
  expect(dialog.textContent).toContain("当前节点");
  fireEvent.click(within(dialog).getByRole("button", { name: /确认同步/ }));
  await waitFor(() => expect(submitScheduleTargets).toHaveBeenCalledWith("editing", expect.arrayContaining([expect.objectContaining({ id: "one", dates: { start: "2026-11-16", end: "2026-11-17" } })])));
  await act(async () => {
    if (outcome === "rejected") rejectRead({ kind: "connection" });
    else finishRead({ ...read, sessionId: "candidate", complete: outcome !== "partial", sources: [{ id: "todo", name: "个人待办", complete: outcome !== "partial" }], targets: [{ ...read.targets[0], id: "candidate-target", title: "不应覆盖的候选" }] });
  });
  expect(screen.queryByText("不应覆盖的候选")).toBeNull();
  if (outcome !== "rejected") {
    await waitFor(() => expect(closeScheduleSession).toHaveBeenCalledTimes(1));
    expect((await vi.mocked(closeScheduleSession).mock.calls[0][0]).sessionId).toBe("candidate");
  } else expect(closeScheduleSession).not.toHaveBeenCalled();
  vi.mocked(loadScheduleSession).mockResolvedValueOnce({ ...read, sessionId: "fresh", targets: [{ ...read.targets[0], id: "fresh-target", title: "后续刷新内容", dates: { start: "2026-11-16", end: "2026-11-17" } }] });
  await act(async () => finishWrite({ results: [{ id: "one", result: "accepted" }], writeRequests: 1 }));
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe("2026-11-17");
  if (outcome !== "success") {
    now += 300_000;
    fireEvent(window, new Event("focus"));
  }
  await screen.findAllByText("后续刷新内容");
  const closed = await Promise.all(vi.mocked(closeScheduleSession).mock.calls.map(([request]) => request));
  expect(closed.map((value) => value.sessionId)).toContain("editing");
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe("2026-11-17");
  if (outcome === "rejected") vi.mocked(loadScheduleSession).mockRejectedValueOnce({ kind: "connection" });
  else vi.mocked(loadScheduleSession).mockResolvedValueOnce({ ...read, sessionId: "manual", targets: [{ ...read.targets[0], id: "manual-target", title: "手动重读内容", dates: { start: "2026-11-16", end: "2026-11-17" } }] });
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  await waitFor(() => expect(loadScheduleSession).toHaveBeenCalledTimes(4));
  await waitFor(() => expect((screen.getByRole("button", { name: "重新读取" }) as HTMLButtonElement).disabled).toBe(false));
  if (outcome !== "rejected") await screen.findAllByText("手动重读内容");
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe("2026-11-17");
  // 快捷键离页不经过侧栏 navigate，仍须释放日期弹层的交互保护。
  fireEvent.click(screen.getByLabelText("开始日期"));
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  await waitFor(() => expect(screen.queryByRole("region", { name: "事项安排" })).toBeNull());
  vi.mocked(loadScheduleSession).mockResolvedValueOnce({ ...read, sessionId: "after-shortcut" });
  now += 300_000;
  fireEvent(window, new Event("focus"));
  expect(loadScheduleSession).toHaveBeenCalledTimes(4);
  fireEvent.click(screen.getByRole("button", { name: "事项安排" }));
  await waitFor(() => expect(loadScheduleSession).toHaveBeenCalledTimes(5));
});

it("人员排期从成功读取起算，合并手动刷新，离开、最小化、断网时暂停并按原视角补查", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(new Date("2026-11-26T10:00:00+08:00"));
  const visible = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  const initial: ScheduleRead = { sessionId: "mine", currentUserId: "me", peopleLoaded: false,
    complete: true, readAt: "", sources: [], people: [], targets: [] };
  const team = { ...initial, peopleLoaded: true };
  let finish!: (value: ScheduleRead) => void;
  vi.mocked(loadSchedulePeople).mockResolvedValueOnce(team);
  vi.mocked(loadScheduleSession).mockResolvedValueOnce(initial)
    .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
    .mockImplementation(async () => ({ ...team, sessionId: String(Date.now()), readAtMs: Date.now() }));

  await act(async () => { render(<App />); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "人员排期" })); });
  expect(loadSchedulePeople).toHaveBeenCalledOnce();
  const time = () => document.querySelector(".schedule-check-status time")?.getAttribute("datetime");
  expect(time()).toBe("2026-11-26T02:00:00.000Z");
  await act(async () => { await vi.advanceTimersByTimeAsync(299_999); });
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(loadScheduleSession).toHaveBeenLastCalledWith({ includePeople: true });
  expect(screen.getByText("正在更新人员排期").closest(".schedule-overview-actions")).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "重新读取" })); });
  expect(loadScheduleSession).toHaveBeenCalledTimes(2);
  await act(async () => { finish({ ...team, sessionId: "updated", readAtMs: Date.now() }); });
  expect(screen.queryByText("正在更新人员排期")).toBeNull();
  expect(time()).toBe("2026-11-26T02:05:00.000Z");

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /我的工作/ })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
  expect(loadScheduleSession).toHaveBeenCalledTimes(2);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "事项安排" })); });
  expect(screen.getByRole("button", { name: "人员排期" }).classList.contains("active")).toBe(true);
  expect(loadScheduleSession).toHaveBeenCalledTimes(3);
  expect(loadScheduleSession).toHaveBeenLastCalledWith({ includePeople: true });

  visible.mockReturnValue("hidden");
  await act(async () => { fireEvent(document, new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(300_000); });
  expect(loadScheduleSession).toHaveBeenCalledTimes(3);
  visible.mockReturnValue("visible");
  online.mockReturnValue(false);
  await act(async () => { fireEvent(document, new Event("visibilitychange")); });
  expect(loadScheduleSession).toHaveBeenCalledTimes(3);
  online.mockReturnValue(true);
  await act(async () => { fireEvent(window, new Event("online")); fireEvent(window, new Event("focus")); });
  expect(loadScheduleSession).toHaveBeenCalledTimes(4);
  expect(time()).toBe("2026-11-26T02:15:00.000Z");

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "我的排期" })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
  expect(loadScheduleSession).toHaveBeenCalledTimes(5);
  expect(loadScheduleSession).toHaveBeenLastCalledWith({ includePeople: false });
});

it("从空的团队会话刷新取得部分关联需求时显示可确认事项并保留上次完整检查时间", async () => {
  let now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const empty: ScheduleRead = { sessionId: "blank", currentUserId: "me", peopleLoaded: false,
    complete: true, readAt: "刚刚", people: [], targets: [], sources: [] };
  const partial: ScheduleRead = { ...empty, sessionId: "partial", peopleLoaded: true, complete: false,
    people: [{ id: "peer", name: "测试同事" }],
    targets: [{ id: "related", identity: { connection: "c", project: "p", type: "story", item: "i", node: "n", scope: "node" },
      title: "部分成功读取的需求", nodeName: "设计", ownerId: "peer", ownerIds: ["peer"], sourceIds: [],
      projectName: "测试空间", typeName: "需求", dates: { start: "", end: "" }, nodeStatus: "doing", mine: false, peopleOnly: true }],
    sources: [{ id: "associated", name: "我参与的需求", complete: false, error: "部分节点读取未完成" }],
  };
  vi.mocked(loadScheduleSession).mockResolvedValueOnce(empty).mockResolvedValueOnce(partial);
  vi.mocked(loadSchedulePeople).mockResolvedValueOnce({ ...empty, peopleLoaded: true });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "人员排期" }));
  await screen.findByText(/上次检查/);
  const time = () => document.querySelector(".schedule-check-status time")?.getAttribute("datetime");
  const previous = time();
  now += 300_000;
  fireEvent(window, new Event("focus"));
  expect((await screen.findAllByText("部分成功读取的需求")).length).toBeGreaterThan(0);
  expect(screen.getByText("暂未取得最新排期")).toBeTruthy();
  expect(time()).toBe(previous);
});
