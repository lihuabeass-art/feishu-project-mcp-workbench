// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { executeWorkflowAction, getWorkflowActions, loadSnapshot } from "./api";
import { closeScheduleSession, loadScheduleSession, submitScheduleTargets, type ScheduleRead, type ScheduleWriteResult } from "./scheduleApi";

vi.mock("./api", async (original) => ({
  ...await original<typeof import("./api")>(),
  desktop: true,
  getWorkflowActions: vi.fn(),
  executeWorkflowAction: vi.fn(),
  loadSnapshot: vi.fn().mockResolvedValue({ items: [], total: 0, last_success: null, runs: [], sources: [], config_path: "cfg", db_path: "db", credential_ready: true, credential_description: "已配置" }),
}));
vi.mock("./scheduleApi", () => ({
  loadScheduleHistory: vi.fn().mockResolvedValue({ people: [], targets: [], complete: true }),
  loadScheduleSession: vi.fn(), loadSchedulePeople: vi.fn(),
  closeScheduleSession: vi.fn().mockResolvedValue(undefined),
  resetScheduleSession: vi.fn().mockResolvedValue(undefined), submitScheduleTargets: vi.fn(),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });
beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadSnapshot).mockResolvedValue({ items: [], total: 0, last_success: null, runs: [], sources: [], config_path: "cfg", db_path: "db", credential_ready: true, credential_description: "已配置" });
  vi.mocked(closeScheduleSession).mockResolvedValue();
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

it("事项安排的流程确认成功后重新读取排期并保持周视图和节点选择", async () => {
  const snapshot = await loadSnapshot();
  vi.mocked(loadSnapshot).mockResolvedValue({ ...snapshot, capabilities: { ...snapshot.capabilities, workflow: true } });
  const read: ScheduleRead = {
    sessionId: "before", currentUserId: "me", peopleLoaded: false, readAt: "刚刚", complete: true,
    sources: [], people: [{ id: "me", name: "本人" }],
    targets: [{ id: "one", identity: { connection: "c", project: "p", type: "t", item: "i", node: "n", scope: "personal", owner: "me" }, title: "待处理事项", nodeName: "开发", ownerId: "me", ownerIds: ["me"], sourceIds: [], projectName: "空间", typeName: "需求", dates: { start: "2026-11-16", end: "2026-11-17" }, nodeStatus: "doing", mine: true }],
  };
  vi.mocked(loadScheduleSession).mockResolvedValueOnce(read).mockResolvedValue({ ...read, sessionId: "after",
    targets: [{ ...read.targets[0], id: "new-row", title: "核验后事项", nodeStatus: "done" }],
  });
  vi.mocked(getWorkflowActions).mockResolvedValueOnce({ version: "v1", actions: [{ id: "node:confirm:n", kind: "node", label: "完成开发", fields: [] }] })
    .mockResolvedValue({ version: "v2", actions: [] });
  vi.mocked(executeWorkflowAction).mockResolvedValue({ outcome: "verified", verified: true, message: "流程已完成", request_id: "r", action_id: "node:confirm:n", resynced: true });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "事项安排" }));
  const nextWeek = await screen.findByRole("button", { name: "下一周" });
  fireEvent.click(nextWeek);
  const range = nextWeek.parentElement!.querySelector("strong")!.textContent;
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
  fireEvent.click(review.getByRole("button", { name: /确认/ }));
  await waitFor(() => expect(loadScheduleSession).toHaveBeenCalledTimes(2));
  await inspector.findByText("核验后事项");
  expect(nextWeek.parentElement!.querySelector("strong")!.textContent).toBe(range);
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
  await act(async () => finishWrite({ results: [{ id: "one", result: "accepted" }], writeRequests: 1 }));
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe("2026-11-17");
  vi.mocked(loadScheduleSession).mockResolvedValueOnce({ ...read, sessionId: "fresh", targets: [{ ...read.targets[0], id: "fresh-target", title: "后续刷新内容", dates: { start: "2026-11-16", end: "2026-11-17" } }] });
  now += 300_000;
  fireEvent(window, new Event("focus"));
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
  await waitFor(() => expect(loadScheduleSession).toHaveBeenCalledTimes(5));
});
