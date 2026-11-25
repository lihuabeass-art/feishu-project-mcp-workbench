// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SchedulePage } from "./SchedulePage";
import { closeScheduleSession, loadScheduleHistory, loadScheduleSession, submitScheduleTargets, type ScheduleRead } from "./scheduleApi";
import type { Snapshot } from "./types";
import { loadScheduleViews, saveScheduleViews, scheduleViewsKey } from "./scheduleViews";

vi.mock("./scheduleApi", () => ({ loadScheduleSession: vi.fn(), loadScheduleHistory: vi.fn(), loadSchedulePeople: vi.fn(), closeScheduleSession: vi.fn(), submitScheduleTargets: vi.fn() }));
vi.mock("./api", () => ({ cachedItemDetail: vi.fn(), getWorkflowActions: vi.fn(), refreshItemDetail: vi.fn() }));
const key = scheduleViewsKey(undefined, "me")!;
const identity = { connection: "credential-fingerprint", project: "p", type: "t", item: "i", node: "n", scope: "personal" as const, owner: "me" };
const read = (): ScheduleRead => ({ sessionId: "session", currentUserId: "me", readAt: "today", complete: true, peopleLoaded: true,
  sources: [], people: [{ id: "me", name: "本人" }], targets: [{ id: "one", identity, title: "任务一", nodeName: "开发",
    ownerId: "me", ownerIds: ["me"], sourceIds: [], projectName: "空间", typeName: "需求", dates: { start: "", end: "" }, mine: true }] });
beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadScheduleSession).mockResolvedValue(read());
  vi.mocked(loadScheduleHistory).mockResolvedValue({ people: [], targets: [], complete: true });
  vi.mocked(closeScheduleSession).mockResolvedValue();
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.restoreAllMocks(); });
const mount = async (people = true) => {
  const page = render(<SchedulePage onGuardChange={vi.fn()} requestReload={(reload) => reload()} />);
  await screen.findByLabelText("今日问候");
  if (people) fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  return page;
};
function menu() { fireEvent.keyDown(screen.getByRole("button", { name: "排期视图" }), { key: "Enter" }); }
function editor(action = "自定义日期范围…") {
  menu(); fireEvent.click(screen.getByRole("menuitem", { name: action }));
  return within(screen.getByRole("dialog"));
}
function enableSaving(dialog: ReturnType<typeof within>) {
  fireEvent.click(dialog.getByRole("button", { name: "保存为视图…" }));
}
function dates(start = "2026-11-24", end = "2026-12-01") {
  fireEvent.change(screen.getByLabelText("视图开始日期"), { target: { value: start } });
  fireEvent.change(screen.getByLabelText("视图结束日期"), { target: { value: end } });
}

it("周二到下周二显示完整 8 列，跨范围裁切正确，草稿与后台读取时的导航均保留", async () => {
  const data = read();
  data.targets.push({ ...data.targets[0], id: "cross", title: "跨界任务", identity: { ...identity, node: "cross" }, dates: { start: "2026-11-23", end: "2026-12-02" } });
  vi.mocked(loadScheduleSession).mockResolvedValue(data);
  const page = await mount(false);
  fireEvent.click(screen.getByText("任务一"));
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-11-25" } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-11-26" } });
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  const dialog = editor(); dates();
  fireEvent.click(dialog.getByRole("button", { name: "应用" }));
  const headers = document.querySelectorAll(".schedule-days > div");
  expect(headers).toHaveLength(8);
  expect(headers[0].textContent).toContain("11-24");
  expect(headers[7].textContent).toContain("12-01");
  expect(screen.getByRole("button", { name: /跨界任务 开发/ }).style.gridColumn).toBe("1 / 9");
  fireEvent.click(screen.getByRole("button", { name: "我的排期" }));
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe("2026-11-25");
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(7);
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  fireEvent.click(screen.getByRole("button", { name: "下一周" }));
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(8);
  expect(document.querySelector(".schedule-days > div")?.textContent).toContain("12-02");
  expect(submitScheduleTargets).not.toHaveBeenCalled();
  page.unmount();
});

it("保存固定日期与筛选，重进页面恢复，改名更新与删除仅影响当前视图", async () => {
  let page = await mount();
  const dialog = editor(); dates();
  enableSaving(dialog);
  fireEvent.click(dialog.getByRole("combobox", { name: "保存日期方式" }));
  fireEvent.click(screen.getByRole("option", { name: "固定日期" }));
  fireEvent.change(dialog.getByLabelText("视图名称"), { target: { value: "周二到下周二" } });
  fireEvent.click(dialog.getByRole("button", { name: "保存并应用" }));
  expect(loadScheduleViews(key).views[0].settings.days).toBe(8);
  page.unmount(); page = await mount();
  await waitFor(() => expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(8));
  expect(screen.getByRole("button", { name: "排期视图" }).textContent).toContain("周二到下周二");
  const manage = editor("编辑当前视图…");
  fireEvent.change(manage.getByLabelText("视图名称"), { target: { value: "发布窗口" } });
  fireEvent.click(manage.getByRole("button", { name: "保存更改" }));
  expect(loadScheduleViews(key).views).toHaveLength(1);
  expect(loadScheduleViews(key).views[0].name).toBe("发布窗口");
  const remove = editor("编辑当前视图…");
  fireEvent.click(remove.getByRole("button", { name: "删除视图" }));
  fireEvent.click(remove.getByRole("button", { name: "确认删除视图" }));
  expect(loadScheduleViews(key).views).toHaveLength(0);
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(8);
  page.unmount();
});

it("只剔除已失效的空间和人员选项，保留有效人员与日期跨度", async () => {
  saveScheduleViews(key, { active: "v", views: [{ id: "v", name: "成员安排", dateMode: "fixed", settings: {
    start: "2026-11-24", days: 8, perspective: "people", project: "removed", relatedProject: "", people: ["me", "removed"], editableOnly: false,
  } }] });
  await mount();
  await waitFor(() => expect(screen.getByRole("combobox", { name: "筛选人员" }).textContent).toContain("本人"));
  expect(screen.getByRole("combobox", { name: "筛选人员" }).textContent).not.toContain("removed");
  expect(screen.getByRole("combobox", { name: "筛选空间" }).textContent).toContain("全部空间");
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(8);
  expect(loadScheduleViews(key).views[0].settings.people).toEqual(["me", "removed"]);
});

it("校验反向、超长和不完整日期，存储失败保留设置及当前草稿", async () => {
  await mount();
  const dialog = editor(); dates("2026-11-24", "2026-11-20");
  expect((dialog.getByRole("button", { name: "应用" }) as HTMLButtonElement).disabled).toBe(true);
  dates("2026-11-24", "2027-01-01");
  expect(dialog.getByText(/一个视图区间最多 31 天/)).toBeTruthy();
  dates();
  enableSaving(dialog);
  fireEvent.change(dialog.getByLabelText("视图名称"), { target: { value: "保存失败" } });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  fireEvent.click(dialog.getByRole("button", { name: "保存并应用" }));
  expect(dialog.getByRole("alert").textContent).toContain("未能保存到本机");
  expect((dialog.getByLabelText("视图开始日期") as HTMLInputElement).value).toBe("2026-11-24");
});

it("弹层空白不穿透滚动，Escape 关闭并归还焦点", async () => {
  await mount();
  const trigger = screen.getByRole("button", { name: "排期视图" });
  trigger.focus(); const dialog = editor();
  const title = dialog.getByRole("heading", { name: "自定义日期范围" });
  const event = createEvent.wheel(title, { deltaY: 60, cancelable: true }); fireEvent(title, event);
  expect(event.defaultPrevented).toBe(true);
  fireEvent.keyDown(screen.getByRole("dialog", { name: "自定义日期范围" }), { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "自定义日期范围" })).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("恢复历史范围时不因历史事项尚未加载而清空目录中仍存在的项目", async () => {
  const relatedProject = JSON.stringify(["p", "project-still-exists"]);
  saveScheduleViews(key, { active: "v", views: [{ id: "v", name: "历史项目", dateMode: "fixed", settings: {
    start: "2025-01-01", days: 8, perspective: "mine", project: "p", relatedProject, people: [], editableOnly: false,
  } }] });
  const snapshot: Snapshot = { items: [], total: 0, runs: [], sources: [], last_success: null, config_path: "", db_path: "",
    credential_ready: true, credential_description: "", workspace_catalog: [{ project_key: "p", name: "空间", simple_name: "space",
      projects: [{ field_key: "project-field", id: "project-still-exists", name: "历史项目甲", type_key: "t" }] }] };
  render(<SchedulePage onGuardChange={vi.fn()} requestReload={(reload) => reload()} snapshot={snapshot} />);
  await screen.findByLabelText("今日问候");
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  expect(screen.getByRole("combobox", { name: "筛选所属项目" }).textContent).toContain("历史项目甲");
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(8);
});

it.each(["0001-01-01", "9999-12-31"])("边界 %s 切换单周双周与前后周保持合法日期", async (date) => {
  await mount(); const dialog = editor(); dates(date, date);
  fireEvent.click(dialog.getByRole("button", { name: "应用" }));
  fireEvent.click(screen.getByRole("button", { name: "单周" }));
  fireEvent.click(screen.getByRole("button", { name: "双周" }));
  fireEvent.click(screen.getByRole("button", { name: "上一周" }));
  fireEvent.click(screen.getByRole("button", { name: "下一周" }));
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(2);
  expect(document.querySelector(".schedule-week-nav strong")?.textContent).toMatch(/^\d{4}-\d{2}-\d{2} — \d{4}-\d{2}-\d{2}$/);
});

it("工具栏仅保留一个视图入口，单周双周按 8 天视图区间展开且不修改保存内容", async () => {
  await mount();
  expect(screen.queryByRole("button", { name: "自定义日期范围" })).toBeNull();
  expect(screen.queryByRole("button", { name: "管理视图" })).toBeNull();
  expect(screen.queryByRole("button", { name: /7天|14天/ })).toBeNull();
  const dialog = editor("保存为新视图…"); dates();
  fireEvent.change(dialog.getByLabelText("视图名称"), { target: { value: "周二周期" } });
  fireEvent.click(dialog.getByRole("button", { name: "保存并应用" }));
  const stored = localStorage.getItem(key);
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(8);
  fireEvent.click(screen.getByRole("button", { name: "双周" }));
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(16);
  expect(localStorage.getItem(key)).toBe(stored);
  expect(screen.queryByLabelText("视图有调整")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "单周" }));
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(8);
  fireEvent.click(screen.getByRole("button", { name: "双周" }));
  const second = editor("保存为新视图…"); dates("2026-11-24", "2026-12-24");
  fireEvent.change(second.getByLabelText("视图名称"), { target: { value: "长周期" } });
  fireEvent.click(second.getByRole("button", { name: "保存并应用" }));
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(62);
  menu(); fireEvent.click(screen.getByRole("menuitemradio", { name: "周二周期" }));
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(16);
  expect(screen.getByRole("button", { name: "双周" }).getAttribute("aria-pressed")).toBe("true");
});

it("个人排期不显示视图入口，也不自动应用旧版保存的日期、筛选与个人视角标记", async () => {
  saveScheduleViews(key, { active: "old", views: [{ id: "old", name: "旧版视图", dateMode: "fixed", settings: {
    start: "2026-11-24", days: 8, perspective: "mine", project: "p", relatedProject: "", people: ["me"], editableOnly: true,
  } }] });
  const stored = localStorage.getItem(key);
  await mount(false);
  expect(screen.queryByRole("button", { name: "排期视图" })).toBeNull();
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(7);
  expect(document.querySelector(".schedule-days > div")?.textContent).toContain("周一");
  expect(screen.getByRole("combobox", { name: "筛选空间" }).textContent).toContain("全部空间");
  expect(screen.getByRole("switch", { name: "仅看可排期" }).getAttribute("aria-checked")).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  expect(screen.getByRole("button", { name: "排期视图" }).textContent).toContain("旧版视图");
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(8);
  expect(screen.queryByRole("switch", { name: "仅看可排期" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "我的排期" }));
  expect(screen.queryByRole("button", { name: "排期视图" })).toBeNull();
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(7);
  expect(screen.getByRole("combobox", { name: "筛选空间" }).textContent).toContain("全部空间");
  expect(screen.getByRole("switch", { name: "仅看可排期" }).getAttribute("aria-checked")).toBe("false");
  expect(localStorage.getItem(key)).toBe(stored);
});

it("个人和人员排期独立保留日期、单双周、空间与所属项目，保存视图不会覆盖个人设置", async () => {
  const data = read();
  data.targets.push({ ...data.targets[0], id: "second", title: "另一任务", projectName: "第二空间", identity: { ...identity, project: "q", item: "second" } });
  vi.mocked(loadScheduleSession).mockResolvedValue(data);
  const related = (space: string, id: string) => JSON.stringify([space, id]);
  const snapshot: Snapshot = { items: data.targets.map((target) => ({
    id: { project_key: target.identity.project, work_item_type_key: "t", work_item_id: target.identity.item },
    project_name: target.projectName, name: target.title, related_projects: [{ field_key: "project", id: target.identity.project === "p" ? "a" : "b", name: target.identity.project === "p" ? "项目甲" : "项目乙" }],
    flow: { kind: "none", node_name: null, node_state_key: null, start_state_key_name: null, end_state_key_name: null },
    schedule: { start_raw: null, end_raw: null }, raw_json: "{}", identity_missing_flags: [], first_seen_at_ms: 0, last_seen_at_ms: 0, seen_count: 1,
  })), total: 2, runs: [], sources: [], last_success: null, config_path: "", db_path: "", credential_ready: true, credential_description: "" };
  render(<SchedulePage onGuardChange={vi.fn()} requestReload={(reload) => reload()} snapshot={snapshot} />);
  await screen.findByLabelText("今日问候");
  fireEvent.click(screen.getByRole("combobox", { name: "筛选空间" }));
  fireEvent.click(screen.getByRole("option", { name: "空间" }));
  fireEvent.click(screen.getByRole("combobox", { name: "筛选所属项目" }));
  fireEvent.click(screen.getByRole("option", { name: "项目甲" }));
  fireEvent.click(screen.getByRole("switch", { name: "仅看可排期" }));
  fireEvent.click(screen.getByRole("button", { name: "双周" }));
  fireEvent.click(screen.getByRole("button", { name: "下一周" }));
  const personalRange = document.querySelector(".schedule-week-nav strong")?.textContent;
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  expect(screen.getByRole("combobox", { name: "筛选空间" }).textContent).toContain("全部空间");
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(7);
  fireEvent.click(screen.getByRole("combobox", { name: "筛选空间" }));
  fireEvent.click(screen.getByRole("option", { name: "第二空间" }));
  fireEvent.click(screen.getByRole("combobox", { name: "筛选所属项目" }));
  fireEvent.click(screen.getByRole("option", { name: "项目乙" }));
  const dialog = editor("保存为新视图…"); dates();
  fireEvent.change(dialog.getByLabelText("视图名称"), { target: { value: "团队周期" } });
  fireEvent.click(dialog.getByRole("button", { name: "保存并应用" }));
  expect(loadScheduleViews(key).views[0].settings).toMatchObject({ project: "q", relatedProject: related("q", "b"), perspective: "people", editableOnly: false });
  fireEvent.click(screen.getByRole("button", { name: "双周" }));
  fireEvent.click(screen.getByRole("button", { name: "下一周" }));
  const peopleRange = document.querySelector(".schedule-week-nav strong")?.textContent;
  fireEvent.click(screen.getByRole("button", { name: "我的排期" }));
  expect(document.querySelector(".schedule-week-nav strong")?.textContent).toBe(personalRange);
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(14);
  expect(screen.getByRole("combobox", { name: "筛选空间" }).textContent).toContain("空间");
  expect(screen.getByRole("combobox", { name: "筛选所属项目" }).textContent).toContain("项目甲");
  expect(screen.getByRole("switch", { name: "仅看可排期" }).getAttribute("aria-checked")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "单周" }));
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  expect(document.querySelector(".schedule-week-nav strong")?.textContent).toBe(peopleRange);
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(16);
  expect(screen.getByRole("combobox", { name: "筛选空间" }).textContent).toContain("第二空间");
  expect(screen.getByRole("combobox", { name: "筛选所属项目" }).textContent).toContain("项目乙");
});
