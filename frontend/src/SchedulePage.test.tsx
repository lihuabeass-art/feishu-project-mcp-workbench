// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SchedulePage, type ScheduleSessionController } from "./SchedulePage";
import { closeScheduleSession, loadSchedulePeople, loadScheduleSession, submitScheduleTargets, type ScheduleRead } from "./scheduleApi";
const loadCss = async (rel: string) => {
  const fsModule = "node:fs";
  const fs = (await import(/* @vite-ignore */ fsModule)) as {
    readFileSync: (path: URL, encoding: string) => string;
  };
  return fs.readFileSync(new URL(rel, import.meta.url), "utf8");
};
vi.mock("./scheduleApi", () => ({ loadScheduleSession: vi.fn(), loadSchedulePeople: vi.fn(), closeScheduleSession: vi.fn(), submitScheduleTargets: vi.fn() }));
const identity = { connection: "c", project: "p", type: "t", item: "i", node: "n", scope: "personal" as const, owner: "me" };
const data = (): ScheduleRead => ({ sessionId: "session", currentUserId: "me", readAt: "today", complete: false, sources: [{ id: "s", name: "我的来源", complete: false, error: "部分事项读取失败" }], people: [{ id: "me", name: "本人" }], targets: [{ id: "one", identity, title: "任务一", nodeName: "开发", ownerId: "me", ownerIds: ["me"], sourceIds: ["s"], projectName: "空间", typeName: "需求", dates: { start: "", end: "" }, mine: true }] });
beforeEach(() => { vi.mocked(loadScheduleSession).mockResolvedValue(data()); vi.mocked(closeScheduleSession).mockResolvedValue(); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const setup = async () => { const guard = vi.fn(); render(<SchedulePage onGuardChange={guard} requestReload={(reload) => reload()} />); await screen.findByText(/部分读取失败/); return guard; };
const confirmSync = () => {
  fireEvent.click(screen.getByRole("button", { name: /核对并同步|同步排期/ }));
  const dialog = screen.queryByRole("dialog", { name: "核对排期变更并同步" });
  if (dialog) fireEvent.click(within(dialog).getByRole("button", { name: /确认同步/ }));
};

it("共同及个人排期区分同空间同名人员并显示身份不明的负责人", async () => {
  const read = data();
  read.people = [{ id: "user-a123456", name: "同名", connection: "c", project: "p" }, { id: "user-b123456", name: "同名", connection: "c", project: "p" }, { id: "other", name: "同名", connection: "c", project: "other" }];
  read.targets = [
    { ...read.targets[0], identity: { ...identity, scope: "node", owner: undefined }, ownerId: null, ownerIds: ["user-a123456", "user-b123456"], unknownOwner: true, readOnlyReason: "只读" },
    { ...read.targets[0], id: "two", title: "任务二", identity: { ...identity, owner: "user-a123456" }, ownerId: "user-a123456", ownerIds: ["user-a123456"] },
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  expect(screen.getByText(/同名 \(a123456\)、同名 \(b123456\)、尚有负责人身份不明/)).toBeTruthy();
  expect(screen.getByText(/同名 \(a123456\) · 待安排/)).toBeTruthy();
  fireEvent.click(screen.getByText("任务一"));
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "按人查看" }));
  expect(screen.getAllByText(/尚有负责人身份不明/).length).toBeGreaterThan(0);
});

it.each([true, false])("零来源只显示无可执行来源（完整性标记 %s）", async (complete) => {
  const read = data(); read.sources = []; read.targets = []; read.complete = complete;
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  render(<SchedulePage onGuardChange={vi.fn()} requestReload={vi.fn()} />);
  await screen.findByText(/无可执行来源/);
  const scope = document.querySelector(".schedule-scope")!.textContent!;
  expect(scope).toContain("来源：无可执行来源");
  expect(scope).not.toMatch(/完整读取|部分读取失败/);
});

it("全部来源成功时显示完整读取", async () => {
  const read = data(); read.sources = [{ id: "s", name: "我的来源", complete: true }]; read.complete = true;
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  render(<SchedulePage onGuardChange={vi.fn()} requestReload={vi.fn()} />);
  await screen.findByText(/完整读取/);
  expect(document.querySelector(".schedule-scope")?.textContent).not.toContain("部分读取失败");
});

it("同名类型按空间与类型的复合身份筛选", async () => {
  const read = data();
  read.targets.push({ ...read.targets[0], id: "two", title: "另一空间任务", identity: { ...identity, project: "other", item: "other" }, projectName: "另一空间" });
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  fireEvent.click(screen.getByRole("combobox", { name: "筛选类型" }));
  fireEvent.click(screen.getByRole("option", { name: "空间 · 需求" }));
  expect(screen.getByText("任务一")).toBeTruthy();
  expect(screen.queryByText("另一空间任务")).toBeNull();
  fireEvent.click(screen.getByRole("combobox", { name: "筛选空间" }));
  fireEvent.click(screen.getByRole("option", { name: "另一空间" }));
  expect(screen.getByText("另一空间任务")).toBeTruthy();
});

it("来源筛选只展示所选来源的完整性和关联失败，全部来源恢复整体", async () => {
  const read = data();
  read.sources = [{ id: "a", name: "完整来源", complete: true }, { id: "b", name: "失败来源", complete: false, error: "分页失败" }];
  read.itemErrors = [{ project: "p", type: "t", item: "bad", sources: ["b"], message: "详情失败" }, { project: "p", type: "t", item: "shared", sources: ["a", "b"], message: "共同事项失败" }];
  // 来源 a 也包含共同失败，因此不应错误显示完整。
  read.sources[0].complete = false;
  read.sources.push({ id: "c", name: "独立完整来源", complete: true });
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  const choose = (name: string) => { fireEvent.click(screen.getByRole("combobox", { name: "筛选来源" })); fireEvent.click(screen.getByRole("option", { name })); };
  expect(screen.getByText(/分页失败/)).toBeTruthy();
  expect(screen.getByText(/详情失败/)).toBeTruthy();
  choose("独立完整来源");
  expect(document.querySelector(".schedule-scope")?.textContent).toContain("来源：独立完整来源 · 完整读取");
  expect(screen.queryByText(/分页失败|详情失败|共同事项失败/)).toBeNull();
  choose("完整来源");
  expect(document.querySelector(".schedule-scope")?.textContent).toContain("部分读取失败");
  expect(screen.getByText(/共同事项失败/)).toBeTruthy();
  expect(screen.queryByText(/分页失败|详情失败/)).toBeNull();
  choose("失败来源");
  expect(screen.getByText(/分页失败/)).toBeTruthy();
  expect(screen.getByText(/详情失败/)).toBeTruthy();
  expect(screen.getByText(/共同事项失败/)).toBeTruthy();
  choose("全部来源");
  expect(document.querySelector(".schedule-scope")?.textContent).toContain("部分读取失败");
  expect(screen.getByText(/详情失败/)).toBeTruthy();
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
});

it("本地来源缓存提示包含可读事项身份和来源，不裸露内部长键，并随来源筛选", async () => {
  const read = data();
  read.sources = [{ id: "a", name: "来源甲", complete: false }, { id: "b", name: "来源乙", complete: false }];
  read.itemErrors = [
    { project: "空间甲", type: "需求", item: "123", sources: ["a"], message: "该来源的本地缓存不完整" },
    { project: "9000000000000654321", type: "issue", item: "456", title: "登录异常修复", sources: ["personal-todo"], message: "读取超时" },
    { project: "space_key_xyz", type: "custom_type_key", item: "789", sources: ["raw_internal_source"], message: "连接中断" },
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  expect(screen.getByText("空间甲 · 需求 #123（来源甲）：该来源的本地缓存不完整")).toBeTruthy();
  expect(screen.getByText("当前空间 · 缺陷「登录异常修复」#456（个人待办）：读取超时")).toBeTruthy();
  expect(screen.getByText("当前空间 · 事项 #789（工作来源）：连接中断")).toBeTruthy();
  expect(document.querySelector(".schedule-scope")?.textContent).not.toContain("9000000000000654321");
  expect(document.querySelector(".schedule-scope")?.textContent).not.toContain("space_key_xyz");
  expect(document.querySelector(".schedule-scope")?.textContent).not.toContain("raw_internal_source");
  fireEvent.click(screen.getByRole("combobox", { name: "筛选来源" }));
  fireEvent.click(screen.getByRole("option", { name: "来源乙" }));
  expect(screen.queryByText(/该来源的本地缓存不完整/)).toBeNull();
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
});

it("单次读取后筛选和编辑不触发请求，经二次确认后同步差异并以回执推进基线", async () => {
  const guard = await setup();
  expect(screen.getByText(/部分读取失败/)).toBeTruthy();
  fireEvent.click(screen.getByText("任务一"));
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-11-13" } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-11-16" } });
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
  expect(submitScheduleTargets).not.toHaveBeenCalled();
  vi.mocked(submitScheduleTargets).mockResolvedValue({ results: [{ id: "one", result: "accepted", message: "收到成功回执，未回读核验" }], writeRequests: 1 });
  confirmSync();
  await screen.findByText("排期已同步");
  expect(screen.getByText("已保存 1 项节点排期")).toBeTruthy();
  const successBanner = screen.getByRole("status");
  expect(successBanner.className).toContain("success");
  expect(successBanner.className).toContain("workflow-toast");
  expect(submitScheduleTargets).toHaveBeenCalledWith("session", [{ id: "one", identity, dates: { start: "2026-11-13", end: "2026-11-16" }, cancel: false }]);
  await waitFor(() => expect(guard).toHaveBeenLastCalledWith({ dirty: false, busy: false, uncertain: false }));
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
});

it("诚实区分撤回待排期与还原云端日期，单端缺失时阻断同步并提示补齐", async () => {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const read = data();
  read.targets.push({ ...read.targets[0], id: "cloud", title: "云端已有任务", identity: { ...identity, node: "n2" }, dates: { start: day, end: day } });
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();

  // 1. 云端无日期事项填入草稿后提供“撤回待排期”，撤回后恢复为空且无报错
  fireEvent.click(screen.getByRole("button", { name: /任务一/ }));
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: day } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: day } });
  expect(screen.queryByText(/云端当前值/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "撤回待排期" }));
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe("");
  expect((screen.getByRole("button", { name: "同步排期" }) as HTMLButtonElement).disabled).toBe(true);

  // 2. 云端已有日期事项修改后展示云端当前值并提供“还原云端日期”，温和说明飞书清空方式，不暴露假取消排期按钮
  fireEvent.click(screen.getByRole("button", { name: /云端已有任务/ }));
  expect(screen.queryByRole("button", { name: "取消排期" })).toBeNull();
  expect(screen.getByText(/暂未验证清空排期接口/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "" } });
  expect(screen.getByText(/云端当前值/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /核对并同步/ }));
  expect(screen.getAllByText(/请填写有效的开始和结束日期/).length).toBeGreaterThan(0);
  expect(submitScheduleTargets).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "还原云端日期" }));
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(day);
});

it("结果不确定时冻结目标且不会自动重发或重新读取", async () => {
  await setup(); fireEvent.click(screen.getByText("任务一"));
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-11-13" } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-11-16" } });
  vi.mocked(submitScheduleTargets).mockResolvedValue({ results: [{ id: "one", result: "uncertain" }], writeRequests: 1 });
  confirmSync();
  await screen.findByText(/收到成功回执 0 项/);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "同步排期" }) as HTMLButtonElement).disabled).toBe(true);
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
  expect(submitScheduleTargets).toHaveBeenCalledTimes(1);
});

it.each(["config", "credential", "validation", "conflict"])("发送前 %s 错误保留编辑并允许手动重试", async (kind) => {
  const guard = await setup();
  fireEvent.click(screen.getByText("任务一"));
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-11-13" } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-11-16" } });
  vi.mocked(submitScheduleTargets).mockRejectedValueOnce({ kind, message: "发送前失败", schedule_not_sent: true }).mockResolvedValueOnce({ results: [{ id: "one", result: "accepted" }], writeRequests: 1 });
  confirmSync();
  await screen.findByText(/未发送 1 项/);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe("2026-11-13");
  await waitFor(() => expect(guard).toHaveBeenLastCalledWith({ dirty: true, busy: false, uncertain: false }));
  expect(submitScheduleTargets).toHaveBeenCalledTimes(1);
  confirmSync();
  await screen.findByText("排期已同步");
  expect(screen.getByText("已保存 1 项节点排期")).toBeTruthy();
  expect(submitScheduleTargets).toHaveBeenCalledTimes(2);
});

it.each([{ kind: "validation", message: "断线" }, { kind: "internal", message: "任务中断" }, new Error("IPC 断线")])("无发送前标记的异常保守冻结目标", async (failure) => {
  await setup();
  fireEvent.click(screen.getByText("任务一"));
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-11-13" } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-11-16" } });
  vi.mocked(submitScheduleTargets).mockRejectedValue(failure);
  confirmSync();
  await screen.findByText(/结果不确定 1 项/);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe("2026-11-13");
  expect((screen.getByRole("button", { name: "同步排期" }) as HTMLButtonElement).disabled).toBe(true);
  expect(submitScheduleTargets).toHaveBeenCalledTimes(1);
});

it("明确权限拒绝保留编辑，成功目标不再重发", async () => {
  const read = data(); read.targets.push({ ...read.targets[0], id: "two", title: "任务二", identity: { ...identity, node: "other" } });
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  for (const title of ["任务一", "任务二"]) {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(title) }));
    fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-11-13" } });
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-11-14" } });
  }
  vi.mocked(submitScheduleTargets).mockResolvedValueOnce({ results: [{ id: "one", result: "failed" }, { id: "two", result: "accepted" }], writeRequests: 2 }).mockResolvedValueOnce({ results: [{ id: "one", result: "accepted" }], writeRequests: 1 });
  confirmSync();
  await screen.findByText(/失败 1 项/);
  const warningBanner = screen.getByRole("alert");
  expect(warningBanner.className).toContain("warning");
  expect(warningBanner.className).not.toContain("success");
  confirmSync();
  await waitFor(() => expect(submitScheduleTargets).toHaveBeenCalledTimes(2));
  expect(vi.mocked(submitScheduleTargets).mock.calls[1][1].map((item) => item.id)).toEqual(["one"]);
  const successToast = await screen.findByRole("status");
  expect(successToast.className).toContain("success");
  expect(successToast.className).toContain("workflow-toast");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("待安排拖到日期后可拉伸，再拖回待排池直接撤回新增草稿且不报错", async () => {
  await setup();
  const transfer = { effectAllowed: "", setData: vi.fn() };
  fireEvent.dragStart(screen.getByRole("button", { name: /任务一/ }), { dataTransfer: transfer });
  const days = document.querySelectorAll(".schedule-days > div");
  fireEvent.drop(days[1], { dataTransfer: transfer });
  const bar = document.querySelector(".schedule-bar") as HTMLElement;
  expect(bar).toBeTruthy();
  const row = document.querySelector(".schedule-row-grid") as HTMLElement;
  vi.spyOn(row, "getBoundingClientRect").mockReturnValue({ left: 0, right: 700, width: 700, top: 0, bottom: 52, height: 52, x: 0, y: 0, toJSON: () => ({}) });
  fireEvent.dragStart(bar.querySelector(".schedule-handle.end")!, { dataTransfer: transfer });
  const drop = createEvent.drop(row, { dataTransfer: transfer }); Object.defineProperty(drop, "clientX", { value: 350 }); fireEvent(row, drop);
  const start = (screen.getByLabelText("开始日期") as HTMLInputElement).value;
  const end = (screen.getByLabelText("结束日期") as HTMLInputElement).value;
  expect((Date.parse(end) - Date.parse(start)) / 86400000).toBe(2);
  fireEvent.dragStart(bar, { dataTransfer: transfer, clientX: 1 });
  fireEvent.drop(document.querySelector(".schedule-pending")!, { dataTransfer: transfer });
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe("");
  expect((screen.getByRole("button", { name: "同步排期" }) as HTMLButtonElement).disabled).toBe(true);
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

const currentWeekDay = (offset: number) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7 + offset);
  return date.toISOString().slice(0, 10);
};

it("跨周任务按本周裁切，保留真实端点并在切周后显示对应端点", async () => {
  const read = data();
  read.targets = [
    { ...read.targets[0], id: "left", title: "跨入本周", dates: { start: currentWeekDay(-2), end: currentWeekDay(2) } },
    { ...read.targets[0], id: "right", title: "跨出本周", dates: { start: currentWeekDay(4), end: currentWeekDay(9) } },
    { ...read.targets[0], id: "both", title: "跨越整周", dates: { start: currentWeekDay(-2), end: currentWeekDay(9) } },
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read); await setup();
  const left = screen.getByRole("button", { name: /跨入本周/ });
  const right = screen.getByRole("button", { name: /跨出本周/ });
  const both = screen.getByRole("button", { name: /跨越整周/ });
  expect(left.style.gridColumn).toBe("1 / 4");
  expect(left.textContent).toContain("‹");
  expect(left.querySelector(".schedule-handle.start")).toBeNull();
  expect(left.querySelector(".schedule-handle.end")).toBeTruthy();
  expect(right.style.gridColumn).toBe("5 / 8");
  expect(right.textContent).toContain("›");
  expect(right.querySelector(".schedule-handle.start")).toBeTruthy();
  expect(right.querySelector(".schedule-handle.end")).toBeNull();
  expect(both.style.gridColumn).toBe("1 / 8");
  expect(both.textContent).toMatch(/‹.*›/);
  expect(both.querySelectorAll(".schedule-handle")).toHaveLength(0);
  fireEvent.click(left);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(currentWeekDay(-2));
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(currentWeekDay(2));
  fireEvent.click(screen.getByRole("button", { name: "下一周" }));
  const next = screen.getByRole("button", { name: /跨出本周/ });
  expect(next.style.gridColumn).toBe("1 / 4");
  expect(next.querySelector(".schedule-handle.start")).toBeNull();
  expect(next.querySelector(".schedule-handle.end")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /跨入本周/ })).toBeNull();
});

it("拖动两端更新日期并限制端点不能交叉，提交最终日期", async () => {
  const read = data(); read.targets[0].dates = { start: currentWeekDay(1), end: currentWeekDay(4) };
  vi.mocked(loadScheduleSession).mockResolvedValue(read); await setup();
  const transfer = { effectAllowed: "", setData: vi.fn() };
  const grid = document.querySelector(".schedule-row-grid") as HTMLElement;
  vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({ left: 0, right: 700, width: 700, top: 0, bottom: 52, height: 52, x: 0, y: 0, toJSON: () => ({}) });
  const dragEdge = (edge: "start" | "end", index: number) => {
    fireEvent.dragStart(document.querySelector(`.schedule-handle.${edge}`)!, { dataTransfer: transfer });
    const over = createEvent.dragOver(grid, { dataTransfer: transfer }); Object.defineProperty(over, "clientX", { value: index * 100 + 50 }); fireEvent(grid, over);
    const drop = createEvent.drop(grid, { dataTransfer: transfer }); Object.defineProperty(drop, "clientX", { value: index * 100 + 50 }); fireEvent(grid, drop);
  };
  dragEdge("start", 2);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(currentWeekDay(2));
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(currentWeekDay(4));
  dragEdge("end", 0);
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(currentWeekDay(2));
  dragEdge("start", 6);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(currentWeekDay(2));
  dragEdge("end", 6);
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(currentWeekDay(6));
  vi.mocked(submitScheduleTargets).mockResolvedValue({ results: [{ id: "one", result: "accepted" }], writeRequests: 1 });
  confirmSync();
  await waitFor(() => expect(submitScheduleTargets).toHaveBeenCalledWith("session", [{ id: "one", identity, dates: { start: currentWeekDay(2), end: currentWeekDay(6) }, cancel: false }]));
});

it("结果不确定的目标保持冻结，独立节点的未发送目标仍可提交", async () => {
  const read = data();
  read.targets.push({ ...read.targets[0], id: "two", title: "任务二", identity: { ...identity, node: "other" } });
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  for (const title of ["任务一", "任务二"]) {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(title) }));
    fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-11-13" } });
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-11-14" } });
  }
  vi.mocked(submitScheduleTargets).mockResolvedValueOnce({ results: [{ id: "one", result: "uncertain" }, { id: "two", result: "unsent" }], writeRequests: 1 }).mockResolvedValueOnce({ results: [{ id: "two", result: "accepted" }], writeRequests: 1 });
  confirmSync();
  await screen.findByText(/结果不确定 1 项/);
  confirmSync();
  await waitFor(() => expect(submitScheduleTargets).toHaveBeenCalledTimes(2));
  expect(vi.mocked(submitScheduleTargets).mock.calls[1][1].map((item) => item.id)).toEqual(["two"]);
});

it("每个目标直接展示对应结果，并与本次汇总一致", async () => {
  const read = data();
  read.targets = ["一", "二", "三", "四"].map((suffix, index) => ({ ...read.targets[0], id: String(index), title: `任务${suffix}`, identity: { ...identity, node: `n${index}` } }));
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  for (const suffix of ["一", "二", "三", "四"]) {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`任务${suffix}开发 · 本人 · 待安排`) }));
    fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: today } });
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: today } });
  }
  vi.mocked(submitScheduleTargets).mockResolvedValue({ results: ["accepted", "failed", "uncertain", "unsent"].map((result, index) => ({ id: String(index), result: result as "accepted" | "failed" | "uncertain" | "unsent" })), writeRequests: 3 });
  confirmSync();
  await screen.findByText(/收到成功回执 1 项，失败 1 项，结果不确定 1 项，未发送 1 项/);
  for (const [index, label] of ["上次提交：收到成功回执", "上次提交：失败", "上次提交：结果不确定", "上次提交：未发送"].entries()) {
    const bar = screen.getByRole("button", { name: new RegExp(`任务${["一", "二", "三", "四"][index]}.*${label}`) });
    expect(bar.closest(".schedule-row")?.querySelector(".schedule-result")?.textContent).toBe(label);
  }
  fireEvent.click(screen.getByRole("button", { name: /任务一.*上次提交：收到成功回执/ }));
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "" } });
  expect(screen.getByRole("button", { name: /任务一.*上次提交：收到成功回执/ }).className).toContain("schedule-pending-item");
  expect(screen.getByText(/未同步/)).toBeTruthy();
});

it("账号识别失败时显示原因和可读目标，禁止编辑", async () => {
  const read = data(); read.currentUserId = ""; read.accountError = "未能确认当前飞书账号"; read.targets[0].mine = false;
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  expect(screen.getByRole("alert").textContent).toContain("未能确认当前飞书账号");
  fireEvent.click(screen.getByRole("button", { name: /任务一/ }));
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "同步排期" }) as HTMLButtonElement).disabled).toBe(true);
});

it("我的排期保留负责人不明目标及只读原因，排除明确属于他人的目标", async () => {
  const read = data(); const base = read.targets[0];
  read.people.push({ id: "other", name: "同事" });
  read.targets = [base,
    { ...base, id: "unknown", title: "身份不明", identity: { ...identity, scope: "node", owner: "" }, ownerId: null, ownerIds: [], mine: false, readOnlyReason: "负责人排期数据不完整", dates: { start: currentWeekDay(0), end: currentWeekDay(0) } },
    { ...base, id: "none", title: "无人负责", identity: { ...identity, scope: "node", owner: "" }, ownerId: null, ownerIds: [], mine: false },
    { ...base, id: "mixed", title: "共同负责人未确认", identity: { ...identity, scope: "node", owner: "" }, ownerId: "other", ownerIds: ["other"], unknownOwner: true, mine: false, readOnlyReason: "仅可编辑明确属于自己的排期" },
    { ...base, id: "other", title: "他人排期", identity: { ...identity, owner: "other" }, ownerId: "other", ownerIds: ["other"], mine: false, readOnlyReason: "仅可编辑明确属于自己的排期" },
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read); await setup();
  expect(screen.queryByRole("button", { name: /他人排期/ })).toBeNull();
  expect(screen.getByRole("button", { name: /共同负责人未确认/ }).textContent).toContain("尚有负责人身份不明");
  expect(screen.getByRole("button", { name: /无人负责/ }).textContent).toContain("负责人不明");
  expect(document.querySelector(".schedule-row-label")?.textContent).toContain("节点共同排期 · 负责人不明");
  const bar = screen.getByRole("button", { name: /^身份不明/ });
  expect(bar.getAttribute("draggable")).toBe("false"); fireEvent.click(bar);
  expect(screen.getByText("负责人排期数据不完整")).toBeTruthy();
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /无人负责/ }));
  expect(screen.getAllByText("未能确认负责人，排期仅供查看").length).toBeGreaterThan(0);
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("共同排期列出所有可确认负责人，待安排也显示负责人", async () => {
  const read = data(); const base = read.targets[0]; read.people.push({ id: "other", name: "同事" });
  read.targets = [{ ...base, id: "shared", title: "共同任务", identity: { ...identity, scope: "node", owner: "" }, ownerId: null, ownerIds: ["me", "other"], dates: { start: currentWeekDay(0), end: currentWeekDay(0) }, readOnlyReason: "仅可编辑明确属于自己的排期" }, base];
  vi.mocked(loadScheduleSession).mockResolvedValue(read); await setup();
  expect(document.querySelector(".schedule-row-label")?.textContent).toContain("节点共同排期 · 本人、同事");
  expect(screen.getByRole("button", { name: /任务一/ }).textContent).toContain("开发 · 本人 · 待安排");
  fireEvent.click(screen.getByRole("button", { name: /共同任务/ }));
  expect(screen.getByText("仅可编辑明确属于自己的排期")).toBeTruthy();
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
});

it.each([false, true])("混合负责人共同排期只读（包含身份不明者：%s）", async (unknownOwner) => {
  const read = data(); const base = read.targets[0];
  read.people.push({ id: "other", name: "同事" });
  read.targets = [{ ...base, id: "mixed", title: "混合共同任务", identity: { ...identity, scope: "node", owner: undefined }, ownerId: null, ownerIds: unknownOwner ? ["me"] : ["me", "other"], unknownOwner, dates: { start: currentWeekDay(0), end: currentWeekDay(0) }, readOnlyReason: "仅可编辑明确属于自己的排期" }];
  vi.mocked(loadScheduleSession).mockResolvedValue(read); await setup();
  const bar = screen.getByRole("button", { name: /混合共同任务/ });
  expect(bar.getAttribute("draggable")).toBe("false");
  fireEvent.click(bar);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).disabled).toBe(true);
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("默认显示来源聚合日期且保持只读，按人查看不虚构负责人", async () => {
  const read = data();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  read.targets = [{ ...read.targets[0], id: "aggregate", title: "来源记录", identity: { ...identity, scope: "node", node: "", owner: "" }, ownerId: null, ownerIds: [], mine: false, sourceAggregate: true, readOnlyReason: "详情读取失败，仅供查看", dates: { start: day, end: day } }];
  vi.mocked(loadScheduleSession).mockResolvedValue(read); await setup();
  expect(screen.getByText(/来源聚合日期/)).toBeTruthy();
  expect(screen.queryByText(/节点共同排期/)).toBeNull();
  const bar = screen.getByRole("button", { name: /来源记录/ });
  expect(bar.getAttribute("draggable")).toBe("false");
  fireEvent.click(bar);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "按人查看" }));
  expect(screen.getByText("负责人不明")).toBeTruthy();
  expect(screen.queryByText(/节点共同排期/)).toBeNull();
  fireEvent.click(screen.getByRole("combobox", { name: "筛选人员" }));
  fireEvent.click(screen.getByRole("option", { name: "本人" }));
  expect(screen.queryByRole("button", { name: /来源记录/ })).toBeNull();
  expect(screen.getByText("当前范围未包含该人员的安排")).toBeTruthy();
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("单端来源聚合日期在待安排中标明来源并保留原值", async () => {
  const read = data();
  read.targets = [{ ...read.targets[0], title: "聚合记录", identity: { ...identity, scope: "node", owner: "" }, ownerId: null, ownerIds: [], mine: false, sourceAggregate: true, readOnlyReason: "详情读取失败，仅供查看", dates: { start: "2026-11-12", end: "" } }];
  vi.mocked(loadScheduleSession).mockResolvedValue(read); await setup();
  expect(screen.getByText(/来源聚合日期 · 负责人不明 · 开始：2026-11-12；结束：未知/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /聚合记录/ }));
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe("2026-11-12");
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
});

it.each([
  [{ kind: "connection", message: "内部地址和令牌" }, "暂时无法连接服务，请稍后重试"],
  [{ kind: "auth", message: "敏感凭证" }, "连接凭证已失效，请在连接设置中更新 Token"],
  [new Error("内部异常"), "暂时无法获取最新信息，请稍后重试"],
])("读取失败按错误类别显示脱敏反馈", async (failure, message) => {
  vi.mocked(loadScheduleSession).mockRejectedValueOnce(failure);
  render(<SchedulePage onGuardChange={vi.fn()} requestReload={vi.fn()} />);
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain(message);
  expect(alert.textContent).not.toMatch(/\[object Object\]|内部地址|敏感凭证|内部异常/);
});

it("已排期长条可由键盘选择并进入日期与顺延操作", async () => {
  const read = data(); const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  read.targets[0].dates = { start: day, end: day }; vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup(); const user = userEvent.setup();
  const bar = screen.getByRole("button", { name: /任务一/ }); bar.focus(); expect(document.activeElement).toBe(bar);
  await user.keyboard("{Enter}");
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(day);
  await user.click(screen.getByRole("button", { name: "顺延 +1 天" }));
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value > day).toBe(true);
  await user.click(screen.getByRole("button", { name: "还原云端日期" }));
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(day);
});

it.each([0, 1, 2, 3, 4, 5, 6])("空周日历主体第 %i 列能接收待安排事项", async (index) => {
  await setup(); const transfer = { effectAllowed: "", setData: vi.fn() };
  const grid = document.querySelector(".schedule-empty-grid") as HTMLElement;
  expect(grid.querySelectorAll(":scope > div")).toHaveLength(7);
  vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({ left: 100, right: 800, width: 700, top: 0, bottom: 180, height: 180, x: 100, y: 0, toJSON: () => ({}) });
  fireEvent.dragStart(screen.getByRole("button", { name: /任务一/ }), { dataTransfer: transfer });
  const over = createEvent.dragOver(grid, { dataTransfer: transfer }); Object.defineProperty(over, "clientX", { value: 150 + index * 100 }); fireEvent(grid, over);
  const drop = createEvent.drop(grid, { dataTransfer: transfer }); Object.defineProperty(drop, "clientX", { value: 150 + index * 100 }); fireEvent(grid, drop);
  const headers = document.querySelectorAll(".schedule-days > div");
  const end = (screen.getByLabelText("结束日期") as HTMLInputElement).value;
  expect(end.slice(5)).toBe(headers[index].querySelector("strong")?.textContent);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(end);
});

it("按人筛选后切回我的排期不会沿用隐藏的人员筛选", async () => {
  const read = data(); read.people.push({ id: "other", name: "同事" });
  read.targets.push({ ...read.targets[0], id: "two", title: "同事任务", ownerId: "other", ownerIds: ["other"], mine: false, identity: { ...identity, owner: "other", node: "other" } });
  vi.mocked(loadScheduleSession).mockResolvedValue(read); await setup();
  fireEvent.click(screen.getByRole("button", { name: "按人查看" }));
  fireEvent.click(screen.getByRole("combobox", { name: "筛选人员" }));
  fireEvent.click(screen.getByRole("option", { name: "同事" }));
  expect(screen.queryByRole("button", { name: /任务一/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "我的排期" }));
  expect(screen.getByRole("button", { name: /任务一/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /同事任务/ })).toBeNull();
});

it("筛选排除当前目标时隐藏编辑区，恢复筛选后保留会话", async () => {
  const read = data();
  read.sources.push({ id: "other", name: "其他来源", complete: true });
  vi.mocked(loadScheduleSession).mockResolvedValue(read); await setup();
  fireEvent.click(screen.getByRole("button", { name: /任务一/ }));
  expect(screen.getByLabelText("开始日期")).toBeTruthy();
  fireEvent.click(screen.getByRole("combobox", { name: "筛选来源" }));
  fireEvent.click(screen.getByRole("option", { name: "其他来源" }));
  expect(screen.queryByLabelText("开始日期")).toBeNull();
  fireEvent.click(screen.getByRole("combobox", { name: "筛选来源" }));
  fireEvent.click(screen.getByRole("option", { name: "全部来源" }));
  expect(screen.getByLabelText("开始日期")).toBeTruthy();
});

it("人员有待安排事项但本周无排期时说明本周为空", async () => {
  await setup();
  fireEvent.click(screen.getByRole("button", { name: "按人查看" }));
  fireEvent.click(screen.getByRole("combobox", { name: "筛选人员" }));
  fireEvent.click(screen.getByRole("option", { name: "本人" }));
  expect(screen.getByText("本周暂无可显示的安排")).toBeTruthy();
  expect(screen.queryByText("当前范围未包含该人员的安排")).toBeNull();
});

it("按人分组待安排及日历，跨空间同 ID 保留姓名头像与共同排期归属", async () => {
  const read = data();
  read.people = [{ id: "same", name: "张三", avatar: "a.png", connection: "c", project: "p" }, { id: "same", name: "李四", avatar: "b.png", connection: "c", project: "q" }, { id: "other", name: "张三", connection: "c", project: "p" }];
  const base = read.targets[0];
  read.targets = [
    { ...base, id: "a", title: "同标题", ownerId: "same", ownerIds: ["same"], identity: { ...identity, owner: "same" }, mine: false },
    { ...base, id: "b", title: "同标题", ownerId: "other", ownerIds: ["other"], identity: { ...identity, owner: "other" }, mine: false },
    { ...base, id: "c", title: "同标题", ownerId: null, ownerIds: ["same"], identity: { ...identity, project: "q", scope: "node", owner: "" }, mine: false },
    { ...base, id: "d", title: "已排期", ownerId: "same", ownerIds: ["same"], identity: { ...identity, project: "q", owner: "same" }, dates: { start: currentWeekDay(0), end: currentWeekDay(0) }, mine: false },
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read); await setup();
  fireEvent.click(screen.getByRole("button", { name: "按人查看" }));
  const pending = document.querySelector(".schedule-pending")!;
  expect(pending.querySelectorAll(".schedule-group")).toHaveLength(3);
  expect(pending.textContent).toContain("张三 (same)");
  expect(pending.textContent).toContain("张三 (other)");
  expect(pending.textContent).toContain("李四 · 节点共同排期");
  expect(pending.querySelector('img[src="a.png"]')).toBeTruthy();
  expect(pending.querySelector('img[src="b.png"]')).toBeTruthy();
  expect(document.querySelector(".schedule-row-label")?.textContent).toContain("李四");
  const shared = screen.getByRole("button", { name: /李四.*节点共同排期/ });
  expect(shared.getAttribute("draggable")).toBe("false");
  fireEvent.click(shared);
  expect(document.querySelector(".schedule-editor")?.textContent).toContain("节点共同排期");
  expect(screen.queryByLabelText("开始日期")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /已排期/ }));
  expect(document.querySelector(".schedule-editor")?.textContent).toContain(`已排期：${currentWeekDay(0)} ~ ${currentWeekDay(0)}（共 1 个自然日）`);
  expect(document.querySelector(".schedule-editor")?.textContent).not.toContain("日期待补齐");
  fireEvent.click(screen.getByRole("combobox", { name: "筛选人员" }));
  fireEvent.click(screen.getByRole("option", { name: "张三 / 李四" }));
  expect(pending.textContent).not.toContain("张三 (other)");
  expect(pending.textContent).toContain("李四");
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("未确认当前账号时禁止编辑", async () => {
  const read = data(); read.readRequests = 1; read.accountError = "未能确认当前飞书账号";
  read.targets[0].sourceAggregate = true; read.targets[0].readOnlyReason = "缓存不足，仅供查看";
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  render(<SchedulePage onGuardChange={vi.fn()} requestReload={vi.fn()} />);
  await screen.findByText(/未能确认当前飞书账号/);
  expect(document.querySelector(".schedule-scope")?.textContent).toContain("部分读取失败");
  fireEvent.click(screen.getByText("任务一"));
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("详情缓存节点保留日期状态与抓取时间，无法编辑或误称待安排", async () => {
  const read = data(); read.accountError = "本地缓存未确认当前飞书账号"; read.readRequests = 0;
  read.targets = [{ ...read.targets[0], identity: { ...identity, node: "", owner: undefined, scope: "node" }, ownerId: null, ownerIds: [], mine: false, cacheKind: "detail_node", startState: "empty", endState: "invalid", fetchedAt: "抓取时刻", readOnlyReason: "缓存不足以确认写入归属及字段配置，仅供查看" }];
  vi.mocked(loadScheduleSession).mockResolvedValue(read); render(<SchedulePage onGuardChange={vi.fn()} requestReload={vi.fn()} />);
  expect(await screen.findByText(/读取时间 today/)).toBeTruthy();
  const row = screen.getByRole("button", { name: /任务一/ });
  expect(row.textContent).toContain("事项详情缓存节点"); expect(row.textContent).toContain("开始：明确为空；结束：日期无效");
  expect(row.textContent).not.toContain("待安排"); fireEvent.click(row);
  expect(screen.getByText("事项详情抓取时间 抓取时刻")).toBeTruthy();
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("默认单周 7 天，支持切换双周 14 天（含双周跨界裁切与第 2 周拖拽落点）与『其他周已排』一键跳转定位", async () => {
  const read = data();
  const farStart = currentWeekDay(21);
  const farEnd = currentWeekDay(23);
  read.targets = [
    read.targets[0],
    { ...read.targets[0], id: "biweek-overflow", title: "跨双周右界任务", identity: { ...identity, node: "n-bi" }, dates: { start: currentWeekDay(8), end: currentWeekDay(16) } },
    { ...read.targets[0], id: "far", title: "三周后专项", identity: { ...identity, node: "n-far" }, dates: { start: farStart, end: farEnd } },
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();

  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(7);
  expect(screen.getByRole("tab", { name: "其他周已排 (2)" })).toBeTruthy();
  // 单周视图下第 2 周开始的事项不在当前 7 天视窗内
  expect(screen.queryByRole("button", { name: /跨双周右界任务/ })).toBeNull();

  // 切换到双周 14 天后，跨双周右界任务进入视窗（第 9 列至第 14 列，右端裁切显示 ›），且『其他周已排』数量锚定单周口径保持 2 不变
  fireEvent.click(screen.getByRole("button", { name: "双周 14天" }));
  expect(screen.getByRole("tab", { name: "其他周已排 (2)" })).toBeTruthy();
  const dayHeaders = document.querySelectorAll(".schedule-days > div");
  expect(dayHeaders).toHaveLength(14);
  const biBar = screen.getByRole("button", { name: /跨双周右界任务/ });
  expect(biBar.style.gridColumn).toBe("9 / 15");
  expect(biBar.textContent).toContain("›");
  expect(biBar.querySelector(".schedule-handle.start")).toBeTruthy();
  expect(biBar.querySelector(".schedule-handle.end")).toBeNull();

  // 在双周视图下将待排事项拖拽到第 2 周日期列（索引 10）
  const transfer = { effectAllowed: "", setData: vi.fn() };
  fireEvent.dragStart(screen.getByRole("button", { name: /任务一/ }), { dataTransfer: transfer });
  fireEvent.drop(dayHeaders[10], { dataTransfer: transfer });
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(currentWeekDay(10));
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(currentWeekDay(10));

  fireEvent.click(screen.getByRole("button", { name: "单周 7天" }));
  expect(document.querySelectorAll(".schedule-days > div")).toHaveLength(7);

  const outsideTab = screen.getByRole("tab", { name: /其他周已排/ });
  fireEvent.click(outsideTab);
  const outsideCard = screen.getByRole("button", { name: /三周后专项/ });
  expect(outsideCard.textContent).toContain(`${farStart} ~ ${farEnd}`);
  expect(outsideCard.getAttribute("draggable")).toBe("true");

  // 1. 点击卡片主体仅在右侧检查器选中该事项，不强制跳离当前周
  fireEvent.click(outsideCard);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(farStart);
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(farEnd);
  expect(outsideCard.className).toContain("schedule-outside-item");

  // 2. 将其他周已排事项直接拖入当前周日历第 2 列（索引 1），保留其原本 3 天跨度
  const singleWeekHeaders = document.querySelectorAll(".schedule-days > div");
  fireEvent.dragStart(outsideCard, { dataTransfer: transfer });
  fireEvent.drop(singleWeekHeaders[1], { dataTransfer: transfer });
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(currentWeekDay(1));
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(currentWeekDay(3));
  expect(screen.getByRole("button", { name: /三周后专项/ }).className).toContain("schedule-bar");

  // 3. 还原云端日期后回到其他周已排，点击『排入本周』一键排入当前周（保留 3 天跨度）
  fireEvent.click(screen.getByRole("button", { name: "还原云端日期" }));
  const outsideQuick = screen.getByLabelText("三周后专项跨周排期操作");
  fireEvent.click(within(outsideQuick).getByRole("button", { name: "排入本周" }));
  expect(screen.getByRole("button", { name: /三周后专项/ }).className).toContain("schedule-bar");

  // 4. 还原后点击『定位该周 ↗』跳转到该事项所在周并在日历视窗中显示长条
  fireEvent.click(screen.getByRole("button", { name: "还原云端日期" }));
  fireEvent.click(within(screen.getByLabelText("三周后专项跨周排期操作")).getByRole("button", { name: /定位该周/ }));
  expect(screen.getByRole("button", { name: /三周后专项/ }).className).toContain("schedule-bar");
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(farStart);
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(farEnd);
});

it("『仅看可排期』现代滑动开关过滤只读事项且不与按人查看串扰", async () => {
  const read = data();
  read.people.push({ id: "other", name: "同事" });
  read.targets = [
    read.targets[0],
    { ...read.targets[0], id: "ro", title: "多人共同只读项", identity: { ...identity, scope: "node", owner: undefined, node: "n-ro" }, ownerId: null, ownerIds: ["me", "other"], readOnlyReason: "多人共同排期节点，仅可编辑明确归属本人的独立排期" },
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();

  expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  const toggle = screen.getByRole("switch", { name: /仅看可排期/ });
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(screen.getByRole("button", { name: /多人共同只读项/ })).toBeTruthy();

  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(screen.queryByRole("button", { name: /多人共同只读项/ })).toBeNull();
  expect(screen.getByRole("button", { name: /任务一/ })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "按人查看" }));
  expect(screen.queryByRole("switch", { name: /仅看可排期/ })).toBeNull();
  expect(screen.getAllByRole("button", { name: /多人共同只读项/ }).length).toBeGreaterThan(0);
});

it("待排卡片支持快捷排期胶囊落位，单端缺日期的可编辑项也支持拖拽设期", async () => {
  const read = data();
  read.targets = [
    read.targets[0],
    { ...read.targets[0], id: "partial", title: "单端缺结束任务", identity: { ...identity, node: "n-partial" }, dates: { start: currentWeekDay(0), end: "" } },
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();

  const partialBtn = screen.getByRole("button", { name: /单端缺结束任务/ });
  expect(partialBtn.getAttribute("draggable")).toBe("true");

  const transfer = { effectAllowed: "", setData: vi.fn() };
  fireEvent.dragStart(partialBtn, { dataTransfer: transfer });
  const days = document.querySelectorAll(".schedule-days > div");
  fireEvent.drop(days[2], { dataTransfer: transfer });
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(currentWeekDay(2));
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(currentWeekDay(2));

  const quickBar = screen.getByLabelText("任务一快捷排期");
  fireEvent.click(within(quickBar).getByRole("button", { name: "今明" }));
  expect(screen.getByRole("button", { name: /任务一/ }).className).toContain("schedule-bar");

  // 单周视图下点击检查器『排到下周』预设后，自动将日历视窗跳转到下周周一并直接展示长条
  fireEvent.click(screen.getByRole("button", { name: "排到下周" }));
  expect(screen.getByRole("button", { name: /任务一/ }).className).toContain("schedule-bar");
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(currentWeekDay(7));
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(currentWeekDay(11));
});

it("提交前二次确认弹层严格区分本次新增（含纯空白原值）、本次修改（含单端原值）与沿用云端，新增无空对比框且不扩大写入范围，并完整隔离弹层滚动", async () => {
  const read = data();
  const baseStart = currentWeekDay(1);
  const baseEnd = currentWeekDay(2);
  read.targets = [
    { ...read.targets[0], id: "added-item", title: "新增排期事项", identity: { ...identity, node: "n-add" }, dates: { start: "", end: "" } },
    { ...read.targets[0], id: "ws-item", title: "纯空白原值事项", identity: { ...identity, node: "n-ws" }, dates: { start: "   ", end: "\t" } },
    { ...read.targets[0], id: "mod-item", title: "修改排期事项", identity: { ...identity, node: "n-mod" }, dates: { start: baseStart, end: baseEnd } },
    { ...read.targets[0], id: "partial-base", title: "单端原值事项", identity: { ...identity, node: "n-part" }, dates: { start: baseStart, end: "   " } },
    { ...read.targets[0], id: "keep-item", title: "未改动云端事项", identity: { ...identity, node: "n-keep" }, dates: { start: baseStart, end: baseEnd } },
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();

  // 1. 为空白事项与纯空白原值事项填入日期（均应识别为本次新增）
  fireEvent.click(screen.getByRole("button", { name: /新增排期事项/ }));
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: currentWeekDay(0) } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: currentWeekDay(1) } });

  fireEvent.click(screen.getByRole("button", { name: /纯空白原值事项/ }));
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: currentWeekDay(1) } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: currentWeekDay(2) } });

  // 2. 修改已有云端排期事项及单端原值事项（均应识别为本次修改）
  fireEvent.click(screen.getByRole("button", { name: /修改排期事项/ }));
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: currentWeekDay(4) } });

  fireEvent.click(screen.getByRole("button", { name: /单端原值事项/ }));
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: currentWeekDay(3) } });

  // 打开核对弹层
  fireEvent.click(screen.getByRole("button", { name: "核对并同步 (4)" }));
  const dialog = screen.getByRole("dialog", { name: "核对排期变更并同步" });
  expect(dialog.classList.contains("scroll-isolation-boundary")).toBe(true);

  // 顶部统计严格对应 2 新增、2 修改、1 沿用云端
  const summary = within(dialog).getByLabelText("排期变更统计");
  expect(summary.textContent).toContain("本次新增 2 项");
  expect(summary.textContent).toContain("本次修改 2 项");
  expect(summary.textContent).toContain("沿用云端 1 项");

  // 新增项（含纯空白原值）严禁显示空云端对比框、空值占位或对比箭头 →
  const addedValues = dialog.querySelectorAll(".schedule-review-value.is-added");
  expect(addedValues).toHaveLength(2);
  for (const addedValue of Array.from(addedValues)) {
    expect(addedValue.textContent).not.toContain("→");
    expect(addedValue.textContent).not.toMatch(/云端当前|未设|未排期|空/);
  }

  // 修改项显示云端当前值 → 本次提交值对比；单端原值去除空白且不拼接多余波浪号或空占位
  const modValues = dialog.querySelectorAll(".schedule-review-value.is-modified");
  expect(modValues).toHaveLength(2);
  expect(modValues[0].textContent).toContain(`云端当前值：${baseStart} ~ ${baseEnd}`);
  expect(modValues[0].textContent).toContain("→");
  expect(modValues[0].textContent).toContain(`本次提交值：${baseStart} ~ ${currentWeekDay(4)}`);
  expect(modValues[1].textContent).toContain(`云端当前值：${baseStart}`);
  expect(modValues[1].textContent).not.toContain(`云端当前值：${baseStart} ~`);
  expect(modValues[1].textContent).toContain("→");
  expect(modValues[1].textContent).toContain(`本次提交值：${baseStart} ~ ${currentWeekDay(3)}`);

  // 沿用云端项完整展示
  const unchangedSection = dialog.querySelector(".schedule-review-unchanged")!;
  expect(unchangedSection.textContent).toContain("未改动云端事项");
  expect(unchangedSection.textContent).toContain("沿用云端");

  // 验证弹层滚动隔离：覆盖长列表中段/顶部/底部、短列表、标题栏、统计栏、底栏、遮罩及连续滚轮输入
  const reviewBody = dialog.querySelector(".schedule-review-body") as HTMLElement;
  reviewBody.style.overflowY = "auto";
  let scrollTop = 0;
  let scrollHeight = 600;
  let clientHeight = 200;
  Object.defineProperty(reviewBody, "scrollTop", { get: () => scrollTop, configurable: true });
  Object.defineProperty(reviewBody, "scrollHeight", { get: () => scrollHeight, configurable: true });
  Object.defineProperty(reviewBody, "clientHeight", { get: () => clientHeight, configurable: true });

  const dispatchWheel = (target: Element, deltaY: number, deltaX = 0) => {
    const evt = new WheelEvent("wheel", { deltaX, deltaY, bubbles: true, cancelable: true });
    target.dispatchEvent(evt);
    return evt.defaultPrevented;
  };

  // 长列表顶部：向上滚阻止穿透，向下滚允许内部滚动
  scrollTop = 0;
  expect(dispatchWheel(reviewBody, -60)).toBe(true);
  expect(dispatchWheel(reviewBody, 60)).toBe(false);
  // 长列表中段：上下滚动均允许内部消费
  scrollTop = 180;
  expect(dispatchWheel(reviewBody, -60)).toBe(false);
  expect(dispatchWheel(reviewBody, 60)).toBe(false);
  // 长列表底部：向下滚阻止穿透，向上滚允许内部滚动
  scrollTop = 400;
  expect(dispatchWheel(reviewBody, 60)).toBe(true);
  expect(dispatchWheel(reviewBody, -60)).toBe(false);
  // 短列表（无滚动空间）：上下均阻止穿透
  scrollTop = 0;
  scrollHeight = 160;
  clientHeight = 200;
  expect(dispatchWheel(reviewBody, -40)).toBe(true);
  expect(dispatchWheel(reviewBody, 40)).toBe(true);
  // 触控板水平滑动（deltaX）及标题栏、统计提示区、底部操作栏、遮罩层、连续滚轮输入均阻止穿透
  expect(dispatchWheel(reviewBody, 0, 60)).toBe(true);
  expect(dispatchWheel(reviewBody, 0, -60)).toBe(true);
  for (const el of [
    dialog.querySelector(".schedule-review-header")!,
    dialog.querySelector(".schedule-review-summary")!,
    dialog.querySelector(".schedule-review-footer")!,
    dialog,
  ]) {
    expect(dispatchWheel(el, 80)).toBe(true);
    expect(dispatchWheel(el, -80)).toBe(true);
    expect(dispatchWheel(el, 0, 50)).toBe(true);
  }

  // 验证弹层内单条还原后计数实时更新
  const cards = dialog.querySelectorAll(".schedule-review-card");
  expect(cards).toHaveLength(4);
  fireEvent.click(within(cards[0] as HTMLElement).getByRole("button", { name: "还原此项" }));
  fireEvent.click(within(cards[1] as HTMLElement).getByRole("button", { name: "还原此项" }));
  fireEvent.click(within(cards[3] as HTMLElement).getByRole("button", { name: "还原此项" }));
  expect(summary.textContent).toContain("本次新增 0 项");
  expect(summary.textContent).toContain("本次修改 1 项");
  expect(summary.textContent).toContain("沿用云端 4 项");

  // 确认同步仅发送剩余修改的 1 项，不扩大写入范围到未改动项，且关闭弹层后外部恢复正常滚动
  vi.mocked(submitScheduleTargets).mockResolvedValue({
    results: [{ id: "mod-item", result: "accepted" }],
    writeRequests: 1,
  });
  fireEvent.click(within(dialog).getByRole("button", { name: /确认同步/ }));
  await waitFor(() => expect(submitScheduleTargets).toHaveBeenCalledTimes(1));
  expect(vi.mocked(submitScheduleTargets).mock.calls[0][1].map((item) => item.id)).toEqual([
    "mod-item",
  ]);
  expect(screen.queryByRole("dialog", { name: "核对排期变更并同步" })).toBeNull();
  expect(dispatchWheel(document.querySelector(".schedule-page")!, 80)).toBe(false);
});

it("核对弹层支持 Escape 关闭与全部还原自动关闭，概览卡支持全部还原与待排池收起展开", async () => {
  const read = data();
  await setup();

  // 收起与展开待排池
  fireEvent.click(screen.getByRole("button", { name: "收起待排池" }));
  expect(document.querySelector(".schedule-pending")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "展开待排池" }));
  expect(document.querySelector(".schedule-pending")).toBeTruthy();

  // 展开与收起读取诊断说明
  fireEvent.click(screen.getByRole("button", { name: "读取说明" }));
  expect(screen.getByText(/来源筛选按事项归属/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "收起诊断" }));
  expect(screen.queryByText(/来源筛选按事项归属/)).toBeNull();

  // 快捷落位产生草稿后打开弹层，按 Escape 关闭，再点全部还原清空草稿
  const quickBar = screen.getByLabelText(`${read.targets[0].title}快捷排期`);
  fireEvent.click(within(quickBar).getByRole("button", { name: "今天" }));
  fireEvent.click(screen.getByRole("button", { name: "核对并同步 (1)" }));
  expect(screen.getByRole("dialog", { name: "核对排期变更并同步" })).toBeTruthy();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "核对排期变更并同步" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "全部还原" }));
  expect((screen.getByRole("button", { name: "同步排期" }) as HTMLButtonElement).disabled).toBe(true);
});

it("本人尾号兜底自动替换为真实姓名与头像，纯数字回退名不显示单数字头像，检查器提供胶囊式『打开飞书事项』按钮", async () => {
  const uid = "9000000000000654321";
  const read = data();
  read.currentUserId = uid;
  read.currentUserAvatar = "https://example.com/me-avatar.png";
  read.people = [
    { id: uid, name: "王小明", avatar: "https://example.com/me-avatar.png" },
    { id: uid, name: "654321", connection: "c", project: "p" },
    { id: "1000000000000999999", name: "999999", connection: "c", project: "p" },
  ];
  read.targets = [
    {
      ...read.targets[0],
      identity: { ...identity, owner: uid },
      ownerId: uid,
      ownerIds: [uid],
      itemUrl: "https://project.feishu.cn/p/story/detail/101",
    },
    {
      ...read.targets[0],
      id: "num-colleague",
      title: "未知同事任务",
      identity: { ...identity, owner: "1000000000000999999", node: "n2" },
      ownerId: "1000000000000999999",
      ownerIds: ["1000000000000999999"],
      mine: false,
    },
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();

  expect(document.querySelector(".schedule-scope")?.textContent).toContain("王小明");
  expect(document.querySelector('.schedule-scope img[src="https://example.com/me-avatar.png"]')).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /任务一/ }));
  const linkWrap = document.querySelector(".schedule-editor-meta .workflow-manual-fill.detail-item-link");
  expect(linkWrap).toBeTruthy();
  const linkBtn = within(linkWrap as HTMLElement).getByRole("link", { name: /打开飞书事项/ });
  expect(linkBtn.getAttribute("title")).toBe("在浏览器打开飞书事项");

  fireEvent.click(screen.getByRole("button", { name: "按人查看" }));
  const pending = document.querySelector(".schedule-pending")!;
  expect(pending.textContent).toContain("王小明");
  expect(pending.textContent).toContain("团队成员");
  expect(pending.textContent).not.toContain(uid);
  expect(pending.textContent).not.toContain("999999");
  expect(pending.textContent).not.toContain("1000000000000999999");
  expect(Array.from(pending.querySelectorAll(".schedule-group")).every((el) => !el.hasAttribute("title"))).toBe(true);
  // 纯数字回退名不渲染单个数字字符作为头像，而是渲染通用人物 SVG 图标
  const avatars = Array.from(pending.querySelectorAll(".schedule-avatar"));
  expect(avatars.some((el) => el.textContent === "9" || el.textContent === "6")).toBe(false);
  // 筛选人员下拉框不裸露 19 位 user_key，纯数字回退名展示为“成员”
  fireEvent.click(screen.getByRole("combobox", { name: "筛选人员" }));
  expect(screen.getByRole("option", { name: "王小明" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "成员" })).toBeTruthy();
  expect(screen.queryByRole("option", { name: new RegExp(uid) })).toBeNull();
  expect(screen.queryByRole("option", { name: /1000000000000999999/ })).toBeNull();
});

it("无未保存草稿时若外部预加载会话轮换为新 sessionId，自动同步刷新排期视图", async () => {
  const sessionOne: ScheduleRead = { ...data(), sessionId: "s-1" };
  const sessionTwo: ScheduleRead = {
    ...data(),
    sessionId: "s-2",
    sources: [
      { id: "src-overdue", name: "src-overdue", complete: true },
      { id: "related-story", name: "", complete: true },
    ],
    targets: [{ ...data().targets[0], id: "rotated-target", title: "外部轮换后的新事项" }],
  };
  const snapWithPresets = {
    items: [],
    total: 0,
    last_success: null,
    runs: [],
    sources: [
      {
        id: "src-overdue",
        builtin_key: "overdue",
        display_name: null,
        kind: "personal_todo",
        enabled: true,
        executable: true,
        reason: null,
        action: "overdue",
        todo_scope: "all",
      },
    ],
    config_path: "",
    db_path: "",
    credential_ready: true,
    credential_description: "",
  };
  const updateRead = vi.fn();
  const reload = vi.fn().mockResolvedValue(sessionTwo);

  const { rerender } = render(
    <SchedulePage
      snapshot={snapWithPresets}
      preloadedSession={{ read: sessionOne, pending: null, updateRead, reload }}
      onGuardChange={vi.fn()}
      requestReload={(fn) => fn()}
    />,
  );
  expect(screen.getByRole("button", { name: /任务一/ })).toBeTruthy();

  rerender(
    <SchedulePage
      snapshot={snapWithPresets}
      preloadedSession={{ read: sessionTwo, pending: null, updateRead, reload }}
      onGuardChange={vi.fn()}
      requestReload={(fn) => fn()}
    />,
  );
  expect(await screen.findByRole("button", { name: /外部轮换后的新事项/ })).toBeTruthy();
  expect(document.querySelector(".schedule-scope")?.textContent).toContain("逾期待办");
  expect(document.querySelector(".schedule-scope")?.textContent).toContain("我参与的需求");
  fireEvent.click(screen.getByRole("combobox", { name: "筛选来源" }));
  expect(screen.getByRole("option", { name: "逾期待办" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "我参与的需求" })).toBeTruthy();
});

it("按需加载全员排期期间若重新读取新会话，旧会话迟到响应不会污染新会话", async () => {
  const sessionOne: ScheduleRead = { ...data(), sessionId: "s-old", peopleLoaded: false };
  const sessionTwo: ScheduleRead = {
    ...data(),
    sessionId: "s-new",
    peopleLoaded: false,
    targets: [{ ...data().targets[0], id: "new-target", title: "新会话事项" }],
  };
  let resolveOldPeople!: (value: ScheduleRead) => void;
  vi.mocked(loadSchedulePeople).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOldPeople = resolve;
      }),
  );

  const updateRead = vi.fn();
  const reload = vi.fn().mockResolvedValue(sessionTwo);
  const controller: ScheduleSessionController = {
    read: sessionOne,
    pending: null,
    updateRead,
    reload,
  };

  render(
    <SchedulePage
      preloadedSession={controller}
      onGuardChange={vi.fn()}
      requestReload={(fn) => fn()}
    />,
  );

  // 触发旧会话 s-old 的按需人员加载
  fireEvent.click(screen.getByRole("button", { name: "按人查看" }));
  expect(loadSchedulePeople).toHaveBeenCalledWith("s-old");

  // 在旧请求完成前点击『重新读取』切换到新会话 s-new
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  expect(await screen.findByRole("button", { name: /新会话事项/ })).toBeTruthy();

  // 此时旧会话的 loadSchedulePeople 才迟到返回，不得覆盖新会话事项或污染 preloadedSession
  resolveOldPeople({
    ...sessionOne,
    peopleLoaded: true,
    targets: [{ ...sessionOne.targets[0], id: "stale-colleague", title: "过期会话同事事项" }],
  });
  await waitFor(() => expect(screen.getByRole("button", { name: /新会话事项/ })).toBeTruthy());
  expect(screen.queryByRole("button", { name: /过期会话同事事项/ })).toBeNull();
  expect(updateRead).toHaveBeenLastCalledWith(sessionTwo);
});

it("按需加载全员排期并保留未同步草稿，预加载会话在切换与挂载间直接复用", async () => {
  const initialRead = data();
  initialRead.peopleLoaded = false;
  const fullRead: ScheduleRead = {
    ...initialRead,
    peopleLoaded: true,
    people: [...initialRead.people, { id: "colleague-1", name: "李同事", avatar: "https://example.com/c.png", connection: "c", project: "p" }],
    targets: [
      ...initialRead.targets,
      {
        ...initialRead.targets[0],
        id: "colleague-target",
        title: "李同事的开发节点",
        identity: { ...identity, owner: "colleague-1", node: "n-col" },
        ownerId: "colleague-1",
        ownerIds: ["colleague-1"],
        mine: false,
      },
    ],
  };
  vi.mocked(loadSchedulePeople).mockResolvedValue(fullRead);

  const updateRead = vi.fn();
  const reload = vi.fn().mockResolvedValue(fullRead);
  const controller: ScheduleSessionController = {
    read: initialRead,
    pending: null,
    updateRead,
    reload,
  };

  const { unmount } = render(
    <SchedulePage
      preloadedSession={controller}
      onGuardChange={vi.fn()}
      requestReload={(fn) => fn()}
    />,
  );

  // 预加载会话已就绪时直接展示，不额外调用 loadScheduleSession
  expect(screen.getByRole("button", { name: /任务一/ })).toBeTruthy();
  expect(loadScheduleSession).not.toHaveBeenCalled();

  // 先在『我的排期』下修改本人草稿
  const quickBar = screen.getByLabelText("任务一快捷排期");
  fireEvent.click(within(quickBar).getByRole("button", { name: "今天" }));
  expect(screen.getByRole("button", { name: "核对并同步 (1)" })).toBeTruthy();

  // 切换到『按人查看』时按需触发 loadSchedulePeople，完成后合并同事事项且不丢失本人未保存草稿
  fireEvent.click(screen.getByRole("button", { name: "按人查看" }));
  await waitFor(() => expect(loadSchedulePeople).toHaveBeenCalledWith("session"));
  expect(await screen.findByRole("button", { name: /李同事的开发节点/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: "核对并同步 (1)" })).toBeTruthy();
  expect(updateRead).toHaveBeenCalledWith(fullRead);

  // 组件卸载（如切回其他主导航页）时不销毁预加载会话
  unmount();
  expect(closeScheduleSession).not.toHaveBeenCalled();
});

it("同一事项多节点在甘特图合并为单横排并按重叠自动分轨，历史已流转节点不进待排池且只读，当前进行中节点可编辑改期", async () => {
  const read = data();
  const base = read.targets[0];
  read.targets = [
    {
      ...base,
      id: "node-design-old",
      title: "核心架构演进专项",
      nodeName: "后端方案设计",
      nodeStatus: "completed",
      nodeOrder: 0,
      identity: { ...identity, item: "story-multi", node: "n-design" },
      dates: { start: currentWeekDay(-10), end: currentWeekDay(-9) },
    },
    {
      ...base,
      id: "node-code-done",
      title: "核心架构演进专项",
      nodeName: "后端代码研发",
      nodeStatus: "completed",
      nodeOrder: 1,
      identity: { ...identity, item: "story-multi", node: "n-code" },
      dates: { start: currentWeekDay(0), end: currentWeekDay(1) },
    },
    {
      ...base,
      id: "node-test-done",
      title: "核心架构演进专项",
      nodeName: "联调与自测",
      nodeStatus: "done",
      nodeOrder: 2,
      identity: { ...identity, item: "story-multi", node: "n-test" },
      dates: { start: currentWeekDay(1), end: currentWeekDay(2) },
    },
    {
      ...base,
      id: "node-stage-doing",
      title: "核心架构演进专项",
      nodeName: "灰度联调验收",
      nodeStatus: "doing",
      nodeOrder: 3,
      scheduleRequired: true,
      identity: { ...identity, item: "story-multi", node: "n-stage" },
      dates: { start: "", end: "" },
    },
    {
      ...base,
      id: "node-merge-doing-noreq",
      title: "核心架构演进专项",
      nodeName: "后端代码合入",
      nodeStatus: "doing",
      nodeOrder: 4,
      scheduleRequired: false,
      identity: { ...identity, item: "story-multi", node: "n-merge" },
      dates: { start: "", end: "" },
    },
    {
      ...base,
      id: "node-future",
      title: "核心架构演进专项",
      nodeName: "灰度和上线",
      nodeStatus: "not_started",
      nodeOrder: 5,
      identity: { ...identity, item: "story-multi", node: "n-future" },
      dates: { start: "", end: "" },
    },
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();

  // 1. 左侧待排期与其他周已排只收纳当前活跃且需要排期的 doing 节点，排除 scheduleRequired === false、已流转完成或未开始的节点
  expect(screen.getByRole("tab", { name: "待排期 (1)" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "其他周已排 (0)" })).toBeTruthy();
  const pendingPool = document.querySelector(".schedule-pending")!;
  expect(pendingPool.textContent).toContain("灰度联调验收");
  expect(pendingPool.textContent).not.toContain("后端代码合入");
  expect(pendingPool.textContent).not.toContain("后端方案设计");
  expect(pendingPool.textContent).not.toContain("灰度和上线");

  // 2. 甘特图中同一事项在本周内的多个节点合并为唯一一横排，且重叠日期（day 1）自动分配到不同子轨道不互相遮挡
  const ganttRows = document.querySelectorAll(".schedule-row");
  expect(ganttRows).toHaveLength(1);
  const codeBar = screen.getByRole("button", { name: /核心架构演进专项 · 后端代码研发/ });
  const testBar = screen.getByRole("button", { name: /核心架构演进专项 · 联调与自测/ });
  expect(codeBar.querySelector(".schedule-bar-title")?.textContent).toBe("后端代码研发");
  expect(testBar.querySelector(".schedule-bar-title")?.textContent).toBe("联调与自测");
  expect(codeBar.style.gridRow).toBe("1");
  expect(testBar.style.gridRow).toBe("2");
  expect(codeBar.getAttribute("draggable")).toBe("false");
  expect(testBar.getAttribute("draggable")).toBe("false");
  expect(codeBar.classList.contains("is-past-node")).toBe(true);

  // 3. 点击历史已流转节点在右侧检查器查看其只读状态，并通过『同事项节点』切换器切换到当前可编辑节点
  fireEvent.click(codeBar);
  expect(screen.getByText("该节点已流转完成，排期仅供查看")).toBeTruthy();
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  const siblingGroup = screen.getByRole("group", { name: "同事项节点" });
  expect(siblingGroup.textContent).toContain("后端方案设计");
  expect(siblingGroup.textContent).toContain("灰度联调验收");
  expect(siblingGroup.textContent).not.toContain("后端代码合入");
  expect(siblingGroup.textContent).not.toContain("灰度和上线");
  fireEvent.click(within(siblingGroup).getByRole("button", { name: /灰度联调验收/ }));
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(false);

  // 4. 将当前可编辑的『灰度联调验收』排到本周（day 3 ~ day 4），与前序节点共享同一横排且无重叠时复用第 1 轨
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: currentWeekDay(3) } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: currentWeekDay(4) } });
  expect(document.querySelectorAll(".schedule-row")).toHaveLength(1);
  const stageBar = screen.getByRole("button", { name: /核心架构演进专项 · 灰度联调验收/ });
  expect(stageBar.querySelector(".schedule-bar-title")?.textContent).toBe("灰度联调验收");
  expect(stageBar.getAttribute("draggable")).toBe("true");
  expect(stageBar.style.gridRow).toBe("1");
});

it("纯成功同步展示悬浮绿色 Toast 并在 3 秒后自动消失，含失败或不确定结果时保持持久警告横幅不自动消失", async () => {
  const read = data();
  read.targets = [
    { ...read.targets[0], id: "ok-target", title: "正常排期事项", identity: { ...identity, node: "n-ok" }, dates: { start: currentWeekDay(1), end: currentWeekDay(2) } },
    { ...read.targets[0], id: "fail-target", title: "失败排期事项", identity: { ...identity, node: "n-fail" }, dates: { start: currentWeekDay(1), end: currentWeekDay(2) } },
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  vi.useFakeTimers();
  try {
    // 1. 纯成功同步：展示 .banner.success.workflow-toast，3 秒后自动消失
    fireEvent.click(screen.getByRole("button", { name: /正常排期事项/ }));
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: currentWeekDay(3) } });
    vi.mocked(submitScheduleTargets).mockResolvedValueOnce({
      results: [{ id: "ok-target", result: "accepted" }],
      writeRequests: 1,
    });
    confirmSync();
    await act(async () => {});
    const toast = screen.getByRole("status");
    expect(toast.className).toContain("banner");
    expect(toast.className).toContain("success");
    expect(toast.className).toContain("workflow-toast");
    expect(toast.textContent).toContain("排期已同步");
    expect(toast.textContent).toContain("已保存 1 项节点排期");
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.queryByRole("status")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("status")).toBeNull();

    // 2. 存在失败结果：展示持久 .banner.warning（role="alert"），3 秒后仍不消失
    fireEvent.click(screen.getByRole("button", { name: /失败排期事项/ }));
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: currentWeekDay(4) } });
    vi.mocked(submitScheduleTargets).mockResolvedValueOnce({
      results: [{ id: "fail-target", result: "failed", message: "无权限修改" }],
      writeRequests: 1,
    });
    confirmSync();
    await act(async () => {});
    const alertBanner = screen.getByRole("alert");
    expect(alertBanner.className).toContain("banner");
    expect(alertBanner.className).toContain("warning");
    expect(alertBanner.textContent).toContain("失败 1 项");
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("alert").textContent).toContain("失败 1 项");
  } finally {
    vi.useRealTimers();
  }
});

it("同事项节点过滤无关无排期节点、按节点去重多人记录、并按最新时间在最上方倒序排列", async () => {
  const read = data();
  const base = read.targets[0];
  read.people.push({ id: "peer-1", name: "同事甲" }, { id: "peer-2", name: "同事乙" });
  read.targets = [
    // 早期已排期历史节点（11-01 ~ 11-03）
    {
      ...base,
      id: "hist-early",
      title: "多阶段研发需求",
      nodeName: "产品方案评审",
      nodeStatus: "done",
      nodeOrder: 0,
      scheduleRequired: false,
      identity: { ...identity, item: "story-order", node: "n-prd" },
      dates: { start: "2026-11-01", end: "2026-11-03" },
    },
    // 无排期的历史已流转节点（应被过滤）
    {
      ...base,
      id: "hist-empty",
      title: "多阶段研发需求",
      nodeName: "架构初审",
      nodeStatus: "done",
      nodeOrder: 1,
      scheduleRequired: false,
      identity: { ...identity, item: "story-order", node: "n-arch" },
      dates: { start: "", end: "" },
    },
    // 多人共同参与的历史节点（11-10 ~ 11-16）：同一 node "n-dev" 存在多条记录，应去重为 1 条且排在 11-03 之上
    {
      ...base,
      id: "hist-dev-peer",
      title: "多阶段研发需求",
      nodeName: "后端设计开发",
      nodeStatus: "done",
      nodeOrder: 2,
      scheduleRequired: false,
      ownerId: "peer-1",
      ownerIds: ["peer-1"],
      mine: false,
      identity: { ...identity, item: "story-order", node: "n-dev", owner: "peer-1" },
      dates: { start: "2026-11-08", end: "2026-11-12" },
    },
    {
      ...base,
      id: "hist-dev-me",
      title: "多阶段研发需求",
      nodeName: "后端设计开发",
      nodeStatus: "done",
      nodeOrder: 2,
      scheduleRequired: false,
      ownerId: "me",
      ownerIds: ["me"],
      mine: true,
      identity: { ...identity, item: "story-order", node: "n-dev", owner: "me" },
      dates: { start: "2026-11-10", end: "2026-11-16" },
    },
    // 当前进行中且需要排期但尚未填日期的节点（应置顶排在第 1 位）
    {
      ...base,
      id: "curr-qa-doing",
      title: "多阶段研发需求",
      nodeName: "集成测试",
      nodeStatus: "doing",
      nodeOrder: 3,
      scheduleRequired: true,
      identity: { ...identity, item: "story-order", node: "n-qa" },
      dates: { start: "", end: "" },
    },
    // 当前进行中但不需要排期的节点（scheduleRequired: false 且无日期，应被过滤）
    {
      ...base,
      id: "curr-merge-noreq",
      title: "多阶段研发需求",
      nodeName: "代码合入",
      nodeStatus: "doing",
      nodeOrder: 4,
      scheduleRequired: false,
      identity: { ...identity, item: "story-order", node: "n-merge" },
      dates: { start: "", end: "" },
    },
    // 未开始无日期节点（应被过滤）
    {
      ...base,
      id: "future-release",
      title: "多阶段研发需求",
      nodeName: "正式发布",
      nodeStatus: "not_started",
      nodeOrder: 5,
      scheduleRequired: false,
      identity: { ...identity, item: "story-order", node: "n-rel" },
      dates: { start: "", end: "" },
    },
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();

  // 选中当前待排节点『集成测试』
  fireEvent.click(screen.getByRole("button", { name: /多阶段研发需求集成测试/ }));
  const siblingGroup = screen.getByRole("group", { name: "同事项节点" });
  expect(siblingGroup.querySelector(".schedule-sibling-label")?.textContent).toBe("同事项节点（3）");

  const chips = Array.from(siblingGroup.querySelectorAll(".schedule-sibling-chip"));
  expect(chips).toHaveLength(3);
  // 排序核验：1. 当前待排『集成测试』置顶 -> 2. 较新历史节点『后端设计开发 (11-10~11-16)』 -> 3. 较早历史节点『产品方案评审 (11-01~11-03)』
  expect(chips.map((chip) => chip.querySelector("strong")?.textContent)).toEqual([
    "集成测试",
    "后端设计开发",
    "产品方案评审",
  ]);
  expect(chips[1].textContent).toContain("11-10~11-16");
  expect(chips[2].textContent).toContain("11-01~11-03");
  // 被过滤的无关节点绝不出现
  expect(siblingGroup.textContent).not.toContain("架构初审");
  expect(siblingGroup.textContent).not.toContain("代码合入");
  expect(siblingGroup.textContent).not.toContain("正式发布");
});

it("排期主面板在 styles.css 后加载时仍保持 overflow: hidden 以裁切圆角", async () => {
  const scheduleStyleEl = document.createElement("style");
  scheduleStyleEl.textContent = await loadCss("./schedule.css");
  const stylesStyleEl = document.createElement("style");
  stylesStyleEl.textContent = await loadCss("./styles.css");
  // 按 main.tsx 的模块求值顺序注入（App -> schedule.css 在 styles.css 之前）
  document.head.append(scheduleStyleEl, stylesStyleEl);
  try {
    await setup();
    const panel = document.querySelector(".work-panel.schedule-panel") as HTMLElement;
    expect(panel).toBeTruthy();
    expect(getComputedStyle(panel).overflow).toBe("hidden");
  } finally {
    scheduleStyleEl.remove();
    stylesStyleEl.remove();
  }
});

it("多节点与单节点左侧事项栏保持统一简洁布局，短排期条内聚展示节点名且不向相邻日期格渲染额外框体，悬停聚焦展示原位浮层卡片", async () => {
  const scheduleStyleEl = document.createElement("style");
  scheduleStyleEl.textContent = await loadCss("./schedule.css");
  document.head.append(scheduleStyleEl);
  try {
    const read = data();
    const base = read.targets[0];
    read.targets = [
      {
        ...base,
        id: "n-env",
        title: "排期节点辨识专项",
        nodeName: "前端环境准备",
        nodeStatus: "done",
        nodeOrder: 0,
        identity: { ...identity, item: "story-visual", node: "node-3" },
        dates: { start: currentWeekDay(0), end: currentWeekDay(0) },
      },
      {
        ...base,
        id: "n-fe-dev",
        title: "排期节点辨识专项",
        nodeName: "前端代码开发",
        nodeStatus: "doing",
        nodeOrder: 1,
        scheduleRequired: true,
        identity: { ...identity, item: "story-visual", node: "node-4" },
        dates: { start: currentWeekDay(1), end: currentWeekDay(2) },
      },
      {
        ...base,
        id: "n-tech",
        title: "排期节点辨识专项",
        nodeName: "技术架构设计",
        nodeStatus: "completed",
        nodeOrder: 2,
        identity: { ...identity, item: "story-visual", node: "node-2" },
        dates: { start: currentWeekDay(2), end: currentWeekDay(2) },
      },
      {
        ...base,
        id: "n-prd",
        title: "排期节点辨识专项",
        nodeName: "产品方案评审",
        nodeStatus: "done",
        nodeOrder: 3,
        identity: { ...identity, item: "story-visual", node: "node-1" },
        dates: { start: currentWeekDay(6), end: currentWeekDay(6) },
      },
    ];
    vi.mocked(loadScheduleSession).mockResolvedValue(read);
    await setup();

    // 1. 左侧事项栏与单节点行保持完全一致的简洁结构，不渲染多余子卡片，右侧网格也不在相邻日期格渲染任何额外胶囊框
    const rowEl = document.querySelector(".schedule-row") as HTMLElement;
    expect(rowEl).toBeTruthy();
    const rowLabel = rowEl.querySelector(".schedule-row-label") as HTMLElement;
    expect(rowLabel.textContent).toContain("排期节点辨识专项");
    expect(rowLabel.textContent).toContain("前端代码开发（共 4 个节点）");
    expect(rowEl.querySelectorAll(".schedule-lane-node")).toHaveLength(0);
    expect(rowEl.querySelectorAll(".schedule-bar-side-label")).toHaveLength(0);

    // 2. 短条（1d/2d）移除重复前置图标：1d 条隐藏尾部角标并启用紧凑双行，2d 条仅隐藏天数与『已流转』文字而保留状态微章；当前可排实线高亮卡片与已流转虚线弱化卡片层级分明
    const prdBar = screen.getByRole("button", { name: /排期节点辨识专项 · 产品方案评审/ });
    const feBar = screen.getByRole("button", { name: /排期节点辨识专项 · 前端代码开发/ });
    expect(prdBar.classList.contains("is-single-day-bar")).toBe(true);
    expect(prdBar.classList.contains("is-past-node")).toBe(true);
    expect(feBar.classList.contains("is-narrow-bar")).toBe(true);
    expect(feBar.classList.contains("is-cloud")).toBe(true);
    expect(prdBar.querySelector(".schedule-bar-state-icon")).toBeNull();
    expect(feBar.querySelector(".schedule-bar-state-icon")).toBeNull();
    expect(prdBar.querySelector(".schedule-bar-badge.is-past")).toBeTruthy();
    expect(prdBar.querySelector(".schedule-bar-badge.is-readonly")).toBeNull();

    const prdBadges = prdBar.querySelector(".schedule-bar-badges") as HTMLElement;
    const feDays = feBar.querySelector(".schedule-bar-days") as HTMLElement;
    const prdTitle = prdBar.querySelector(".schedule-bar-title") as HTMLElement;
    const feTitle = feBar.querySelector(".schedule-bar-title") as HTMLElement;
    expect(getComputedStyle(prdBadges).display).toBe("none");
    expect(getComputedStyle(feDays).display).toBe("none");
    expect(getComputedStyle(prdTitle).whiteSpace).toBe("normal");
    expect(getComputedStyle(prdBar).borderTopStyle).toBe("dashed");
    expect(getComputedStyle(feBar).borderTopStyle).toBe("solid");
    expect(getComputedStyle(feTitle).fontWeight).toBe("600");
    expect(getComputedStyle(prdTitle).fontWeight).toBe("400");

    // 3. 悬停与键盘聚焦排期条时触发原位上浮完整卡片（靠近右边缘自动右对齐防溢出）
    fireEvent.mouseEnter(prdBar);
    const popover = document.querySelector(".schedule-bar-popover") as HTMLElement;
    expect(popover).toBeTruthy();
    expect(popover.classList.contains("is-align-right")).toBe(true);
    expect(popover.textContent).toContain("已流转");
    expect(popover.textContent).toContain("产品方案评审");
    expect(popover.textContent).toContain("(1d)");
    fireEvent.mouseLeave(prdBar);
    expect(document.querySelector(".schedule-bar-popover")).toBeNull();

    fireEvent.focus(feBar);
    const focusPopover = document.querySelector(".schedule-bar-popover") as HTMLElement;
    expect(focusPopover).toBeTruthy();
    expect(focusPopover.textContent).toContain("当前可排");
    expect(focusPopover.textContent).toContain("前端代码开发");
    expect(focusPopover.textContent).toContain("(2d)");
    fireEvent.blur(feBar);
    expect(document.querySelector(".schedule-bar-popover")).toBeNull();

    // 4. 2d 草稿条保留『已改』角标，而切换至双周 14 天视图时 2d 条自动切换为 is-single-day-bar 双行紧凑模式
    fireEvent.click(feBar);
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: currentWeekDay(1) } });
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: currentWeekDay(3) } });
    // 先把结束日期改为周三使之仍为 2d 草稿：开始周二、结束周三但与原 baseline 不同（把开始改为周三、结束周四）
    fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: currentWeekDay(2) } });
    const feBarDraft = screen.getByRole("button", { name: /排期节点辨识专项 · 前端代码开发/ });
    expect(feBarDraft.classList.contains("is-narrow-bar")).toBe(true);
    expect(feBarDraft.classList.contains("is-draft")).toBe(true);
    expect(getComputedStyle(feBarDraft.querySelector(".schedule-bar-badges") as HTMLElement).display).toBe("inline-flex");

    fireEvent.click(screen.getByRole("button", { name: "双周 14天" }));
    const feBarBiweekly = screen.getByRole("button", { name: /排期节点辨识专项 · 前端代码开发/ });
    expect(feBarBiweekly.classList.contains("is-single-day-bar")).toBe(true);
    expect(getComputedStyle(feBarBiweekly.querySelector(".schedule-bar-badges") as HTMLElement).display).toBe("none");
  } finally {
    scheduleStyleEl.remove();
  }
});

it("我的排期与个人待办不混入同事项下他人的历史已流转节点，且不会将不同负责人的节点错误合并到同一行", async () => {
  const read = data();
  const base = read.targets[0];
  read.sources = [{ id: "personal-todo", name: "个人待办", complete: true }];
  read.people = [
    { id: "me", name: "杨顺", connection: "c", project: "p" },
    { id: "yan", name: "闫国强", connection: "c", project: "p" },
    { id: "liu", name: "刘悦然", connection: "c", project: "p" },
    { id: "shi", name: "施伟", connection: "c", project: "p" },
  ];
  read.targets = [
    // 事项 7165715799：当前用户『杨顺』负责待排『后端方案设计』，『闫国强』已完成『产品方案设计』，『刘悦然』已完成『前端方案设计』
    {
      ...base,
      id: "7165715799-prd-yan",
      title: "操作日志页面中新增操作类型：发布",
      nodeName: "产品方案设计",
      nodeStatus: "finished",
      nodeOrder: 0,
      scheduleRequired: false,
      ownerId: "yan",
      ownerIds: ["yan"],
      sourceIds: ["personal-todo"],
      mine: false,
      readOnlyReason: "该节点已流转完成，排期仅供查看",
      identity: { ...identity, item: "7165715799", node: "state_0", owner: "yan" },
      dates: { start: currentWeekDay(2), end: currentWeekDay(2) },
    },
    {
      ...base,
      id: "7165715799-fe-liu",
      title: "操作日志页面中新增操作类型：发布",
      nodeName: "前端方案设计",
      nodeStatus: "finished",
      nodeOrder: 2,
      scheduleRequired: false,
      ownerId: "liu",
      ownerIds: ["liu"],
      sourceIds: ["personal-todo"],
      mine: false,
      readOnlyReason: "该节点已流转完成，排期仅供查看",
      identity: { ...identity, item: "7165715799", node: "state_44", owner: "liu" },
      dates: { start: currentWeekDay(3), end: currentWeekDay(3) },
    },
    {
      ...base,
      id: "7165715799-be-me",
      title: "操作日志页面中新增操作类型：发布",
      nodeName: "后端方案设计",
      nodeStatus: "doing",
      nodeOrder: 3,
      scheduleRequired: true,
      ownerId: "me",
      ownerIds: ["me"],
      sourceIds: ["personal-todo"],
      mine: true,
      readOnlyReason: null,
      identity: { ...identity, item: "7165715799", node: "state_45", owner: "me" },
      dates: { start: "", end: "" },
    },
    // 事项 7138355755：当前用户『杨顺』负责『后端代码合入』，『施伟』已完成『需求测试』
    {
      ...base,
      id: "7138355755-qa-shi",
      title: "支持运营管理员查看平台操作记录",
      nodeName: "需求测试",
      nodeStatus: "finished",
      nodeOrder: 8,
      scheduleRequired: false,
      ownerId: "shi",
      ownerIds: ["shi"],
      sourceIds: ["personal-todo"],
      mine: false,
      readOnlyReason: "该节点已流转完成，排期仅供查看",
      identity: { ...identity, item: "7138355755", node: "state_12", owner: "shi" },
      dates: { start: currentWeekDay(0), end: currentWeekDay(2) },
    },
    {
      ...base,
      id: "7138355755-merge-me",
      title: "支持运营管理员查看平台操作记录",
      nodeName: "后端代码合入",
      nodeStatus: "doing",
      nodeOrder: 10,
      scheduleRequired: true,
      ownerId: "me",
      ownerIds: ["me"],
      sourceIds: ["personal-todo"],
      mine: true,
      readOnlyReason: null,
      identity: { ...identity, item: "7138355755", node: "state_20", owner: "me" },
      dates: { start: "", end: "" },
    },
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();

  // 1. 在『我的排期』下，甘特图绝不出现闫国强、刘悦然、施伟的节点，待排池只显示当前用户自己的 2 个待排节点
  expect(document.querySelectorAll(".schedule-row")).toHaveLength(0);
  expect(screen.queryByText(/闫国强/)).toBeNull();
  expect(screen.queryByText(/刘悦然/)).toBeNull();
  expect(screen.queryByText(/施伟/)).toBeNull();
  expect(screen.getByRole("tab", { name: "待排期 (2)" })).toBeTruthy();

  // 选中当前用户的『后端方案设计』时，由于同事项下其余节点属于他人，『同事项节点』不混入闫国强/刘悦然的节点
  fireEvent.click(screen.getByRole("button", { name: /操作日志页面中新增操作类型：发布后端方案设计/ }));
  expect(screen.queryByRole("group", { name: "同事项节点" })).toBeNull();

  // 2. 切换到『按人查看』时，闫国强、刘悦然、施伟各自归入本人分组与独立行，绝不把闫国强的『产品方案设计』合并到刘悦然行内
  fireEvent.click(screen.getByRole("button", { name: "按人查看" }));
  const peopleRows = Array.from(document.querySelectorAll(".schedule-row-label")).map(
    (el) => el.textContent || "",
  );
  expect(peopleRows.some((text) => text.includes("前端方案设计 · 刘悦然"))).toBe(true);
  expect(peopleRows.some((text) => text.includes("产品方案设计 · 闫国强"))).toBe(true);
  expect(peopleRows.some((text) => text.includes("需求测试 · 施伟"))).toBe(true);
  expect(peopleRows.some((text) => text.includes("前端方案设计（共 2 个节点） · 刘悦然"))).toBe(false);

  // 3. 即便在账号未确认的回退只读模式（accountError）下展示全部目标，『我的排期』也按负责人分别成行，不把闫国强节点挂在刘悦然名下
  cleanup();
  const fallbackRead = {
    ...read,
    currentUserId: "",
    accountError: "未能确认当前飞书账号，请检查连接后重试",
  };
  vi.mocked(loadScheduleSession).mockResolvedValue(fallbackRead);
  await setup();
  const fallbackRows = Array.from(document.querySelectorAll(".schedule-row-label")).map(
    (el) => el.textContent || "",
  );
  expect(fallbackRows.some((text) => text.includes("前端方案设计 · 刘悦然"))).toBe(true);
  expect(fallbackRows.some((text) => text.includes("产品方案设计 · 闫国强"))).toBe(true);
  expect(fallbackRows.some((text) => text.includes("前端方案设计（共 2 个节点） · 刘悦然"))).toBe(false);
});
