// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { cachedItemDetail, getWorkflowActions, refreshItemDetail } from "./api";
import { SchedulePage, type ScheduleSessionController } from "./SchedulePage";
import type { ScheduleRead } from "./scheduleApi";

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({ ...await importOriginal<typeof import("@tauri-apps/api/core")>(), invoke: vi.fn() }));
vi.mock("./api", async (importOriginal) => ({ ...await importOriginal<typeof import("./api")>(),
  getWorkflowActions: vi.fn(), cachedItemDetail: vi.fn(), refreshItemDetail: vi.fn(),
}));

const id = { project_key: "space", work_item_type_key: "issue", work_item_id: "100" };
const mine = { project: "space", item: "100", title: "导出漏掉筛选条件", status: "待处理", priority: "P1", owners: [{ id: "me", name: "本人" }] };
const other = { project: "space", item: "200", title: "附件预览空白", status: "处理中", owners: [{ id: "peer", name: "同事", avatar: "https://example.com/avatar.png" }] };
const read: ScheduleRead = { sessionId: "session", connection: "connection", currentUserId: "me", readAt: "today", complete: true,
  peopleLoaded: true, people: [{ id: "me", name: "本人" }, { id: "peer", name: "同事", project: "space" }],
  sources: [], defectProjects: ["space"], targets: [] };
const controller: ScheduleSessionController = { read, pending: null, reload: vi.fn(), updateRead: vi.fn() };
const props = { onGuardChange: vi.fn(), requestReload: (reload: () => void) => reload(), preloadedSession: controller,
  workflow: { context: "context", busy: false, submit: vi.fn() } };

beforeEach(() => {
  vi.mocked(invoke).mockImplementation(async (command) => command === "load_schedule_defects"
    ? { defects: [mine, other], failed_projects: [] } : { targets: [], complete: true });
  vi.mocked(cachedItemDetail).mockResolvedValue(null);
  vi.mocked(refreshItemDetail).mockResolvedValue({ id, fetched_at_ms: 1, pages: [], data: {
    work_item_attribute: {}, work_item_fields: [{ key: "description", name: "缺陷描述", value: "筛选后导出仍包含全部记录" }],
  } });
  vi.mocked(getWorkflowActions).mockResolvedValue({ version: "current", actions: [{ id: "state:fix", kind: "state", label: "解决缺陷", fields: [] }] });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); localStorage.clear(); });

it("自己的缺陷可打开说明和状态流程，人员排期按负责人展开，日历保持独立", async () => {
  render(<SchedulePage {...props} />);
  fireEvent.click(await screen.findByRole("tab", { name: "未解决缺陷 1" }));
  const mineButton = screen.getByRole("button", { name: /导出漏掉筛选条件/ });
  expect(within(mineButton).getByText("P1").getAttribute("data-level")).toBe("1");
  expect(within(mineButton).getByText("待处理").getAttribute("data-tone")).toBe("pending");
  expect(mineButton.textContent).not.toContain("#100");
  expect(screen.queryByRole("button", { name: /附件预览空白/ })).toBeNull();
  const calendar = document.querySelector(".schedule-calendar");
  expect(calendar?.textContent).not.toContain(mine.title);
  fireEvent.click(mineButton);
  const inspector = within(screen.getByLabelText("缺陷详情"));
  await inspector.findByText("筛选后导出仍包含全部记录");
  fireEvent.click(inspector.getByRole("button", { name: "查看可用流程动作" }));
  await inspector.findByRole("button", { name: "解决缺陷" });
  expect(getWorkflowActions).toHaveBeenCalledWith(id);
  expect(inspector.queryByLabelText("开始日期")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  const list = within(screen.getByLabelText("未解决缺陷清单"));
  expect(list.getByRole("button", { name: /本人（我）/ }).getAttribute("aria-expanded")).toBe("true");
  const peer = list.getByRole("button", { name: /同事/ });
  const avatar = peer.querySelector(".schedule-avatar img");
  expect(avatar?.getAttribute("src")).toBe("https://example.com/avatar.png");
  fireEvent.error(avatar!);
  expect(peer.querySelector(".schedule-avatar")?.textContent).toBe("同");
  expect(peer.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(peer);
  expect(list.getByRole("button", { name: /附件预览空白/ })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "未解决缺陷 2" })).toBeTruthy();
});

it("后台缺陷读取发起后打开流程，保留正在填写的缺陷与草稿", async () => {
  vi.mocked(getWorkflowActions).mockResolvedValue({ version: "current", actions: [{ id: "state:fix", kind: "state", label: "解决缺陷",
    fields: [{ key: "reason", label: "解决说明", kind: "text", required: true }] }] });
  const onGuardChange = vi.fn();
  const page = render(<SchedulePage {...props} onGuardChange={onGuardChange} />);
  fireEvent.click(await screen.findByRole("tab", { name: "未解决缺陷 1" }));
  let finish!: (value: { defects: typeof other[]; failed_projects: string[] }) => void;
  vi.mocked(invoke).mockImplementation((command) => command === "load_schedule_defects"
    ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve({ targets: [], complete: true }));
  page.rerender(<SchedulePage {...props} onGuardChange={onGuardChange} defectRevision={1} />);
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button", { name: /导出漏掉筛选条件/ }));
  const inspector = within(screen.getByLabelText("缺陷详情"));
  fireEvent.click(inspector.getByRole("button", { name: "查看可用流程动作" }));
  fireEvent.click(await inspector.findByRole("button", { name: "解决缺陷" }));
  const dialog = within(await screen.findByRole("dialog", { name: "流程操作" }));
  expect(inspector.queryByRole("textbox", { name: /解决说明/ })).toBeNull();
  const field = dialog.getByRole("textbox", { name: /解决说明/ });
  fireEvent.change(field, { target: { value: "本机正在填写的说明" } });
  await act(async () => finish({ defects: [other], failed_projects: [] }));
  expect(dialog.getByRole("textbox", { name: /解决说明/ })).toBe(field);
  expect((field as HTMLInputElement).value).toBe("本机正在填写的说明");
  expect(inspector.getByText("该缺陷已移出当前清单，已保留当前流程编辑。")).toBeTruthy();
  expect(onGuardChange).toHaveBeenLastCalledWith(expect.objectContaining({
    interacting: true, defectWorkflow: expect.objectContaining({ dirty: true }),
  }));
});

it("缺陷状态操作与节点操作使用独立弹层，保留草稿并始终先核对再提交", async () => {
  localStorage.setItem("fstodo.workflow-skip-confirmation.v1", "true");
  vi.mocked(getWorkflowActions).mockResolvedValue({ version: "current", actions: [{ id: "state:fix", kind: "state", label: "解决缺陷",
    fields: [{ key: "reason", label: "解决说明", kind: "text", required: true }] }] });
  const submit = vi.fn().mockResolvedValue({ outcome: "unknown", verified: false });
  render(<SchedulePage {...props} workflow={{ ...props.workflow, submit }} />);
  fireEvent.click(await screen.findByRole("tab", { name: "未解决缺陷 1" }));
  fireEvent.click(screen.getByRole("button", { name: /导出漏掉筛选条件/ }));
  const inspector = within(screen.getByLabelText("缺陷详情"));
  fireEvent.click(inspector.getByRole("button", { name: "查看可用流程动作" }));
  const trigger = await inspector.findByRole("button", { name: "解决缺陷" });
  fireEvent.click(trigger);
  const dialog = within(screen.getByRole("dialog", { name: "流程操作" }));
  fireEvent.change(dialog.getByRole("textbox", { name: /解决说明/ }), { target: { value: "保留本机说明" } });
  fireEvent.click(dialog.getByRole("button", { name: "关闭流程表单" }));
  expect(screen.queryByRole("dialog", { name: "流程操作" })).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  const reopened = within(screen.getByRole("dialog", { name: "流程操作" }));
  expect(reopened.getByRole("textbox", { name: /解决说明/ })).toHaveProperty("value", "保留本机说明");
  fireEvent.click(reopened.getByRole("button", { name: "提交" }));
  const review = within(await reopened.findByRole("region", { name: "提交前二次确认" }));
  expect(review.getByText("保留本机说明")).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(review.getByRole("button", { name: /我已核对/ }));
  fireEvent.click(review.getByRole("button", { name: "确认解决缺陷" }));
  await waitFor(() => expect(submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    action_id: "state:fix", fields: { reason: "保留本机说明" },
  }), "解决缺陷"));
  await reopened.findByText(/上次提交的结果尚待核实/);
  expect(reopened.getByRole("textbox", { name: /解决说明/ })).toHaveProperty("value", "保留本机说明");
});

it("刷新失败保留可用缺陷和详情，成功读取后移除已解决缺陷", async () => {
  const page = render(<SchedulePage {...props} />);
  fireEvent.click(await screen.findByRole("tab", { name: "未解决缺陷 1" }));
  fireEvent.click(screen.getByRole("button", { name: /导出漏掉筛选条件/ }));
  vi.mocked(invoke).mockImplementation(async (command) => command === "load_schedule_defects"
    ? { defects: [], failed_projects: ["space"] } : { targets: [], complete: true });
  page.rerender(<SchedulePage {...props} defectRevision={1} />);
  await screen.findByText("部分缺陷暂未更新，已保留可用清单。");
  expect(screen.getByLabelText("缺陷详情")).toBeTruthy();
  vi.mocked(invoke).mockResolvedValue({ defects: [other], failed_projects: [] });
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await screen.findByRole("tab", { name: "未解决缺陷 0" });
  await waitFor(() => expect(screen.queryByLabelText("缺陷详情")).toBeNull());
});

it("我的缺陷和每个人员分组均按 P0 到 P4 排序，缺少优先级在末尾", async () => {
  const priorities = ["P3", "P0", "p4", null, "P1", " P2 "];
  const defects = priorities.map((priority, index) => ({ ...mine, item: String(index), title: `缺陷 ${index}`, priority }));
  vi.mocked(invoke).mockImplementation(async (command) => command === "load_schedule_defects"
    ? { defects, failed_projects: [] } : { targets: [], complete: true });
  render(<SchedulePage {...props} />);
  fireEvent.click(await screen.findByRole("tab", { name: "未解决缺陷 6" }));
  const list = screen.getByLabelText("未解决缺陷清单");
  const ordered = () => within(list).getAllByRole("button", { name: /缺陷 \d/ }).map((item) => item.querySelector("strong")?.textContent);
  const expected = ["缺陷 1", "缺陷 4", "缺陷 5", "缺陷 0", "缺陷 2", "缺陷 3"];
  expect(ordered()).toEqual(expected);
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  expect(ordered()).toEqual(expected);
});

it("两种排期中处理中缺陷置顶，同一状态组内仍按优先级排序", async () => {
  const defects = [
    { ...mine, item: "201", title: "待处理零级", status: "待处理", priority: "P0" },
    { ...mine, item: "202", title: "处理中三级", status: "处理中", priority: "P3" },
    { ...mine, item: "203", title: "处理中一级", status: "处理中", priority: "P1" },
    { ...mine, item: "204", title: "待处理一级", status: "待处理", priority: "P1" },
  ];
  vi.mocked(invoke).mockImplementation(async (command) => command === "load_schedule_defects"
    ? { defects, failed_projects: [] } : { targets: [], complete: true });
  render(<SchedulePage {...props} />);
  fireEvent.click(await screen.findByRole("tab", { name: "未解决缺陷 4" }));
  const list = within(screen.getByLabelText("未解决缺陷清单"));
  const ordered = () => list.getAllByRole("button", { name: /处理中[一三]级|待处理[零一]级/ })
    .map((item) => item.querySelector("strong")?.textContent);
  const expected = ["处理中一级", "处理中三级", "待处理零级", "待处理一级"];
  expect(ordered()).toEqual(expected);
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  expect(ordered()).toEqual(expected);
  fireEvent.click(screen.getByRole("button", { name: "P1，2 条" }));
  expect(ordered()).toEqual(["处理中一级", "待处理一级"]);
});

it("同一人员标识在不同空间保留对应的名字和头像", async () => {
  const peerInOtherSpace = { ...other, project: "other-space", item: "200", title: "另一空间的缺陷",
    owners: [{ id: "peer", name: "另一位同事", avatar: "https://example.com/other-avatar.png" }] };
  vi.mocked(invoke).mockImplementation(async (command) => command === "load_schedule_defects"
    ? { defects: [other, peerInOtherSpace], failed_projects: [] } : { targets: [], complete: true });
  render(<SchedulePage {...props} preloadedSession={{ ...controller, read: { ...read, defectProjects: ["space", "other-space"],
    people: [...read.people, { id: "peer", name: "另一位同事", project: "other-space" }],
  } }} />);
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  fireEvent.click(await screen.findByRole("tab", { name: "未解决缺陷 2" }));
  const groups = within(screen.getByLabelText("未解决缺陷清单"));
  const first = groups.getByRole("button", { name: /^同事/ });
  const second = groups.getByRole("button", { name: /^另一位同事/ });
  expect(first.querySelector("img")?.getAttribute("src")).toBe("https://example.com/avatar.png");
  expect(second.querySelector("img")?.getAttribute("src")).toBe("https://example.com/other-avatar.png");
  fireEvent.click(second);
  expect(groups.getByRole("button", { name: /另一空间的缺陷/ })).toBeTruthy();
  expect(groups.queryByRole("button", { name: /附件预览空白/ })).toBeNull();
});

it("优先级栏统计当前视图，点击按级别筛选，共同负责缺陷只计算一次", async () => {
  const shared = { ...mine, owners: [...mine.owners, ...other.owners] };
  const urgent = { ...other, priority: "P0" };
  vi.mocked(invoke).mockImplementation(async (command) => command === "load_schedule_defects"
    ? { defects: [urgent, shared], failed_projects: [] } : { targets: [], complete: true });
  render(<SchedulePage {...props} />);
  fireEvent.click(await screen.findByRole("tab", { name: "未解决缺陷 1" }));
  const filters = within(screen.getByRole("group", { name: "按缺陷优先级查看" }));
  expect(filters.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
    "P0，0 条", "P1，1 条", "P2，0 条", "P3，0 条", "P4，0 条",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  const p0 = filters.getByRole("button", { name: "P0，1 条" });
  expect(filters.getByRole("button", { name: "P1，1 条" })).toBeTruthy();
  fireEvent.click(p0);
  expect(p0.getAttribute("aria-pressed")).toBe("true");
  const list = within(screen.getByLabelText("未解决缺陷清单"));
  expect(list.queryByRole("button", { name: /本人（我）/ })).toBeNull();
  fireEvent.click(list.getByRole("button", { name: /同事/ }));
  expect(list.getByRole("button", { name: /附件预览空白/ })).toBeTruthy();
  expect(list.queryByRole("button", { name: /导出漏掉筛选条件/ })).toBeNull();
  fireEvent.click(filters.getByRole("button", { name: "P4，0 条" }));
  expect(list.getByText("当前筛选下暂无 P4 缺陷")).toBeTruthy();
  fireEvent.click(filters.getByRole("button", { name: "P4，0 条" }));
  expect(list.getAllByRole("button", { name: /导出漏掉筛选条件/ })).toHaveLength(2);
  expect(list.getByRole("button", { name: /附件预览空白/ })).toBeTruthy();
});

it("负责人分组与全部计数只来自已加载人员，排除跨空间同标识与未分配缺陷", async () => {
  const outside = { id: "unloaded", name: "未加载同事" };
  const shared = { ...mine, owners: [...mine.owners, outside] };
  const defects = [shared, { ...other, priority: "P0" },
    { ...other, item: "outside", priority: "P0", owners: [outside] },
    { ...other, item: "unassigned", priority: "P0", owners: [] },
    { ...other, project: "other-space", title: "不同空间同标识", priority: "P0" }];
  vi.mocked(invoke).mockImplementation(async (command) => command === "load_schedule_defects"
    ? { defects, failed_projects: [] } : { targets: [], complete: true });
  render(<SchedulePage {...props} preloadedSession={{ ...controller, read: { ...read, defectProjects: ["space", "other-space"] } }} />);
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  fireEvent.click(await screen.findByRole("tab", { name: "未解决缺陷 2" }));
  const priorities = within(screen.getByRole("group", { name: "按缺陷优先级查看" }));
  expect(priorities.getByRole("button", { name: "P0，1 条" })).toBeTruthy();
  expect(priorities.getByRole("button", { name: "P1，1 条" })).toBeTruthy();
  const list = within(screen.getByLabelText("未解决缺陷清单"));
  expect(list.getByRole("button", { name: /本人（我）.*1 条/ })).toBeTruthy();
  expect(list.getByRole("button", { name: /^同事.*1 条/ })).toBeTruthy();
  expect(list.queryByRole("button", { name: /未加载同事|未分配负责人|不同空间同标识/ })).toBeNull();
  fireEvent.click(screen.getByRole("combobox", { name: "筛选人员" }));
  expect(screen.queryByRole("option", { name: "未加载同事" })).toBeNull();
  fireEvent.click(screen.getByRole("option", { name: "同事" }));
  expect(screen.getByRole("tab", { name: "未解决缺陷 1" })).toBeTruthy();
  expect(priorities.getByRole("button", { name: "P1，0 条" })).toBeTruthy();
});
