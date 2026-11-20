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
  peopleLoaded: true, people: [{ id: "me", name: "本人" }], sources: [], defectProjects: ["space"], targets: [] };
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
afterEach(() => { cleanup(); vi.resetAllMocks(); });

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
  const field = await inspector.findByRole("textbox", { name: /解决说明/ });
  fireEvent.change(field, { target: { value: "本机正在填写的说明" } });
  await act(async () => finish({ defects: [other], failed_projects: [] }));
  expect(inspector.getByRole("textbox", { name: /解决说明/ })).toBe(field);
  expect((field as HTMLInputElement).value).toBe("本机正在填写的说明");
  expect(inspector.getByText("该缺陷已移出当前清单，已保留当前流程编辑。")).toBeTruthy();
  expect(onGuardChange).toHaveBeenLastCalledWith(expect.objectContaining({
    interacting: true, defectWorkflow: expect.objectContaining({ dirty: true }),
  }));
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

it("同一人员标识在不同空间保留对应的名字和头像", async () => {
  const peerInOtherSpace = { ...other, project: "other-space", item: "200", title: "另一空间的缺陷",
    owners: [{ id: "peer", name: "另一位同事", avatar: "https://example.com/other-avatar.png" }] };
  vi.mocked(invoke).mockImplementation(async (command) => command === "load_schedule_defects"
    ? { defects: [other, peerInOtherSpace], failed_projects: [] } : { targets: [], complete: true });
  render(<SchedulePage {...props} preloadedSession={{ ...controller, read: { ...read, defectProjects: ["space", "other-space"] } }} />);
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
