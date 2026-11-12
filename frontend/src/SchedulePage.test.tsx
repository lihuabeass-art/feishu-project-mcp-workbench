// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SchedulePage } from "./SchedulePage";
import { closeScheduleSession, loadScheduleSession, submitScheduleTargets, type ScheduleRead } from "./scheduleApi";
vi.mock("./scheduleApi", () => ({ loadScheduleSession: vi.fn(), closeScheduleSession: vi.fn(), submitScheduleTargets: vi.fn() }));
const identity = { connection: "c", project: "p", type: "t", item: "i", node: "n", scope: "personal" as const, owner: "me" };
const data = (): ScheduleRead => ({ sessionId: "session", currentUserId: "me", readAt: "today", complete: false, sources: [{ id: "s", name: "我的来源", complete: false, error: "部分事项读取失败" }], people: [{ id: "me", name: "本人" }], targets: [{ id: "one", identity, title: "任务一", nodeName: "开发", ownerId: "me", ownerIds: ["me"], sourceIds: ["s"], projectName: "空间", typeName: "需求", dates: { start: "", end: "" }, mine: true }] });
beforeEach(() => { vi.mocked(loadScheduleSession).mockResolvedValue(data()); vi.mocked(closeScheduleSession).mockResolvedValue(); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const setup = async () => { const guard = vi.fn(); render(<SchedulePage onGuardChange={guard} requestReload={(reload) => reload()} />); await screen.findByText(/部分读取失败/); return guard; };

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

it("本地来源缓存提示包含事项身份和来源，并随来源筛选", async () => {
  const read = data();
  read.sources = [{ id: "a", name: "来源甲", complete: false }, { id: "b", name: "来源乙", complete: false }];
  read.itemErrors = [{ project: "空间甲", type: "需求", item: "123", sources: ["a"], message: "该来源的本地缓存不完整" }];
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  expect(screen.getByText("空间甲 / 需求 / 123 · 来源甲：该来源的本地缓存不完整")).toBeTruthy();
  fireEvent.click(screen.getByRole("combobox", { name: "筛选来源" }));
  fireEvent.click(screen.getByRole("option", { name: "来源乙" }));
  expect(screen.queryByText(/该来源的本地缓存不完整/)).toBeNull();
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
});

it("单次读取后筛选和编辑不触发请求，直接同步差异并以回执推进基线", async () => {
  const guard = await setup();
  expect(screen.getByText(/部分读取失败/)).toBeTruthy();
  fireEvent.click(screen.getByText("任务一"));
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-11-13" } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-11-16" } });
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
  expect(submitScheduleTargets).not.toHaveBeenCalled();
  vi.mocked(submitScheduleTargets).mockResolvedValue({ results: [{ id: "one", result: "accepted", message: "收到成功回执，未回读核验" }], writeRequests: 1 });
  fireEvent.click(screen.getByRole("button", { name: "同步排期" }));
  await screen.findByText(/收到成功回执 1 项/);
  expect(submitScheduleTargets).toHaveBeenCalledWith("session", [{ id: "one", identity, dates: { start: "2026-11-13", end: "2026-11-16" }, cancel: false }]);
  await waitFor(() => expect(guard).toHaveBeenLastCalledWith({ dirty: false, busy: false, uncertain: false }));
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
});

it("取消保留意图并阻止未验证的清空请求", async () => {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const read = data(); read.targets[0].dates = { start: day, end: day }; vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  fireEvent.click(document.querySelector(".schedule-bar")!);
  fireEvent.click(screen.getByRole("button", { name: "取消排期" }));
  fireEvent.click(screen.getByRole("button", { name: "同步排期" }));
  expect(screen.getAllByText(/尚未验证取消日期/).length).toBeGreaterThan(0);
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("结果不确定时冻结目标且不会自动重发或重新读取", async () => {
  await setup(); fireEvent.click(screen.getByText("任务一"));
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-11-13" } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-11-16" } });
  vi.mocked(submitScheduleTargets).mockResolvedValue({ results: [{ id: "one", result: "uncertain" }], writeRequests: 1 });
  fireEvent.click(screen.getByRole("button", { name: "同步排期" }));
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
  fireEvent.click(screen.getByRole("button", { name: "同步排期" }));
  await screen.findByText(/未发送 1 项/);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe("2026-11-13");
  await waitFor(() => expect(guard).toHaveBeenLastCalledWith({ dirty: true, busy: false, uncertain: false }));
  expect(submitScheduleTargets).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "同步排期" }));
  await screen.findByText(/收到成功回执 1 项/);
  expect(submitScheduleTargets).toHaveBeenCalledTimes(2);
});

it.each([{ kind: "validation", message: "断线" }, { kind: "internal", message: "任务中断" }, new Error("IPC 断线")])("无发送前标记的异常保守冻结目标", async (failure) => {
  await setup();
  fireEvent.click(screen.getByText("任务一"));
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-11-13" } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-11-16" } });
  vi.mocked(submitScheduleTargets).mockRejectedValue(failure);
  fireEvent.click(screen.getByRole("button", { name: "同步排期" }));
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
  fireEvent.click(screen.getByRole("button", { name: "同步排期" }));
  await screen.findByText(/失败 1 项/);
  fireEvent.click(screen.getByRole("button", { name: "同步排期" }));
  await waitFor(() => expect(submitScheduleTargets).toHaveBeenCalledTimes(2));
  expect(vi.mocked(submitScheduleTargets).mock.calls[1][1].map((item) => item.id)).toEqual(["one"]);
});

it("待安排拖到日期后可拉伸，再拖回只生成取消意图", async () => {
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
  fireEvent.click(screen.getByRole("button", { name: "同步排期" }));
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
  fireEvent.click(screen.getByRole("button", { name: "同步排期" }));
  await screen.findByText(/结果不确定 1 项/);
  fireEvent.click(screen.getByRole("button", { name: "同步排期" }));
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
  fireEvent.click(screen.getByRole("button", { name: "同步排期" }));
  await screen.findByText(/收到成功回执 1 项，失败 1 项，结果不确定 1 项，未发送 1 项/);
  for (const [index, label] of ["上次提交：收到成功回执", "上次提交：失败", "上次提交：结果不确定", "上次提交：未发送"].entries()) {
    const bar = screen.getByRole("button", { name: new RegExp(`任务${["一", "二", "三", "四"][index]} · ${label}`) });
    expect(bar.closest(".schedule-row")?.querySelector(".schedule-result")?.textContent).toBe(label);
  }
  fireEvent.click(screen.getByRole("button", { name: /任务一 · 上次提交：收到成功回执/ }));
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
  const bar = screen.getByRole("button", { name: "身份不明" });
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
  fireEvent.click(screen.getByRole("button", { name: "共同任务" }));
  expect(screen.getByText("仅可编辑明确属于自己的排期")).toBeTruthy();
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
});

it.each([false, true])("混合负责人共同排期只读（包含身份不明者：%s）", async (unknownOwner) => {
  const read = data(); const base = read.targets[0];
  read.people.push({ id: "other", name: "同事" });
  read.targets = [{ ...base, id: "mixed", title: "混合共同任务", identity: { ...identity, scope: "node", owner: undefined }, ownerId: null, ownerIds: unknownOwner ? ["me"] : ["me", "other"], unknownOwner, dates: { start: currentWeekDay(0), end: currentWeekDay(0) }, readOnlyReason: "仅可编辑明确属于自己的排期" }];
  vi.mocked(loadScheduleSession).mockResolvedValue(read); await setup();
  const bar = screen.getByRole("button", { name: "混合共同任务" });
  expect(bar.getAttribute("draggable")).toBe("false");
  fireEvent.click(bar);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "取消排期" }) as HTMLButtonElement).disabled).toBe(true);
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("默认显示来源聚合日期且保持只读，按人查看不虚构负责人", async () => {
  const read = data();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  read.targets = [{ ...read.targets[0], id: "aggregate", title: "来源记录", identity: { ...identity, scope: "node", node: "", owner: "" }, ownerId: null, ownerIds: [], mine: false, sourceAggregate: true, readOnlyReason: "详情读取失败，仅供查看", dates: { start: day, end: day } }];
  vi.mocked(loadScheduleSession).mockResolvedValue(read); await setup();
  expect(screen.getByText(/来源聚合日期/)).toBeTruthy();
  expect(screen.queryByText(/节点共同排期/)).toBeNull();
  const bar = screen.getByRole("button", { name: "来源记录" });
  expect(bar.getAttribute("draggable")).toBe("false");
  fireEvent.click(bar);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "取消排期" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "按人查看" }));
  expect(screen.getByText("负责人不明")).toBeTruthy();
  expect(screen.queryByText(/节点共同排期/)).toBeNull();
  fireEvent.click(screen.getByRole("combobox", { name: "筛选人员" }));
  fireEvent.click(screen.getByRole("option", { name: "本人 · me" }));
  expect(screen.queryByRole("button", { name: "来源记录" })).toBeNull();
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

it("已排期长条可由键盘选择并进入日期和取消操作", async () => {
  const read = data(); const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  read.targets[0].dates = { start: day, end: day }; vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup(); const user = userEvent.setup();
  const bar = screen.getByRole("button", { name: "任务一" }); bar.focus(); expect(document.activeElement).toBe(bar);
  await user.keyboard("{Enter}");
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(day);
  await user.click(screen.getByRole("button", { name: "取消排期" }));
  expect(screen.getByText(/尚未验证取消日期/)).toBeTruthy();
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
  fireEvent.click(screen.getByRole("option", { name: "同事 · other" }));
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
  fireEvent.click(screen.getByRole("option", { name: "本人 · me" }));
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
  expect(pending.textContent).toContain("李四 (same) · 节点共同排期");
  expect(pending.querySelector('img[src="a.png"]')).toBeTruthy();
  expect(pending.querySelector('img[src="b.png"]')).toBeTruthy();
  expect(document.querySelector(".schedule-row-label")?.textContent).toContain("李四");
  const shared = screen.getByRole("button", { name: /李四.*节点共同排期/ });
  expect(shared.getAttribute("draggable")).toBe("false");
  fireEvent.click(shared);
  expect(document.querySelector(".schedule-editor")?.textContent).toContain("节点共同排期");
  expect(screen.queryByLabelText("开始日期")).toBeNull();
  fireEvent.click(screen.getByRole("combobox", { name: "筛选人员" }));
  fireEvent.click(screen.getByRole("option", { name: /same/ }));
  expect(pending.textContent).not.toContain("张三 (other)");
  expect(pending.textContent).toContain("李四 (same)");
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
