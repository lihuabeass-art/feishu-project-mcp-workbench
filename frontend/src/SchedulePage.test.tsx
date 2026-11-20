// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { SchedulePage, type ScheduleSessionController } from "./SchedulePage";
import { getWorkflowActions } from "./api";
import { saveWorkflowSkipConfirmation } from "./workflowPreferences";
import type { Snapshot, WorkflowAction, WorkflowOptions, WorkflowResult } from "./types";
import { closeScheduleSession, loadScheduleHistory, loadSchedulePeople, loadScheduleSession, submitScheduleTargets, type ScheduleHistory, type ScheduleRead } from "./scheduleApi";
const loadCss = async (rel: string) => {
  const fsModule = "node:fs";
  const fs = (await import(/* @vite-ignore */ fsModule)) as {
    readFileSync: (path: URL, encoding: string) => string;
  };
  return fs.readFileSync(new URL(rel, import.meta.url), "utf8");
};
vi.mock("./scheduleApi", () => ({ loadScheduleSession: vi.fn(), loadScheduleHistory: vi.fn(), loadSchedulePeople: vi.fn(), closeScheduleSession: vi.fn(), submitScheduleTargets: vi.fn() }));
vi.mock("./api", () => ({ getWorkflowActions: vi.fn() }));
const identity = { connection: "c", project: "p", type: "t", item: "i", node: "n", scope: "personal" as const, owner: "me" };
const data = (): ScheduleRead => ({ sessionId: "session", currentUserId: "me", readAt: "today", complete: false, sources: [{ id: "s", name: "我的来源", complete: false, error: "部分事项读取失败" }], people: [{ id: "me", name: "本人" }], targets: [{ id: "one", identity, title: "任务一", nodeName: "开发", ownerId: "me", ownerIds: ["me"], sourceIds: ["s"], projectName: "空间", typeName: "需求", dates: { start: "", end: "" }, mine: true }] });
const projectSnapshot = (read: ScheduleRead): Snapshot => ({
  items: read.targets.map((target, index) => ({
    id: { project_key: target.identity.project, work_item_type_key: target.identity.type, work_item_id: target.identity.item },
    project_name: target.projectName, name: target.title,
    related_projects: index === 2 ? [] : [{ field_key: `field-${target.identity.type}`, id: "project-a", name: "AI 应用开发平台" },
      ...(index === 0 ? [{ field_key: "another", id: "project-b", name: "项目乙" }] : [])],
    flow: { kind: "none", node_name: null, node_state_key: null, start_state_key_name: null, end_state_key_name: null },
    schedule: { start_raw: null, end_raw: null }, raw_json: "{}", identity_missing_flags: [], first_seen_at_ms: 0, last_seen_at_ms: 0, seen_count: 1,
  })),
  total: read.targets.length, sources: [], runs: [], last_success: null, config_path: "", db_path: "", credential_ready: true, credential_description: "",
});
beforeEach(() => {
  vi.mocked(loadScheduleSession).mockResolvedValue(data());
  vi.mocked(loadScheduleHistory).mockResolvedValue({ people: [], targets: [], complete: true });
  vi.mocked(closeScheduleSession).mockResolvedValue();
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const setup = async () => { const guard = vi.fn(); render(<SchedulePage onGuardChange={guard} requestReload={(reload) => reload()} />); await screen.findByLabelText("今日问候"); return guard; };

it("日期格式化结果不是 ISO 文本时仍能打开事项安排", async () => {
  const NativeDateTimeFormat = Intl.DateTimeFormat;
  const formatter = vi.spyOn(Intl, "DateTimeFormat").mockImplementation((...args) => {
    const real = new NativeDateTimeFormat(...args);
    return new Proxy(real, {
      get(target, property) {
        if (property === "format") return () => "11/20/2026";
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  });
  try {
    await setup();
    expect(screen.getByLabelText("今日问候")).toBeTruthy();
  } finally {
    formatter.mockRestore();
  }
});

it("旧版 WebKit 无颜色混合时排期条保留主题背景和边框", async () => {
  const css = await loadCss("./schedule.css");
  const bar = css.match(/\.schedule-bar\s*\{([^}]+)\}/)?.[1] ?? "";
  const node = css.match(/\.schedule-current-node\s*\{([^}]+)\}/)?.[1] ?? "";
  expect(bar).toMatch(/background:\s*var\(--surface-selected\);[\s\S]*background:\s*linear-gradient/);
  expect(bar).toMatch(/border:\s*1px solid var\(--border-strong\)/);
  expect(node).toMatch(/border:\s*1px solid var\(--border-strong\)/);
  expect(node).toMatch(/background:\s*var\(--surface-selected\)/);
  expect(css).toContain("@supports not (background: color-mix(in srgb, black, white))");
  const fallback = css.slice(css.indexOf("@supports not (color: color-mix(in srgb, red, blue))"));
  expect(fallback).toMatch(/\.schedule-bar\s*\{[^}]*background:\s*var\(--surface-selected\)/);
  expect(fallback).toMatch(/\.schedule-bar\.is-cloud\s*\{[^}]*background:\s*var\(--surface-selected\)/);
  expect(fallback).toMatch(/\.schedule-bar\.is-draft\s*\{[^}]*background:\s*var\(--surface-tint\)/);
  expect(fallback).toMatch(/\.schedule-bar\.is-readonly\s*\{[^}]*background:\s*var\(--surface-soft\)/);
  expect(fallback).toMatch(/\.schedule-bar\.is-uncertain\s*\{[^}]*background:\s*var\(--warning-bg\)/);
  expect(css.indexOf("@supports not (color: color-mix(in srgb, red, blue))"))
    .toBeGreaterThan(css.lastIndexOf("color-mix(in srgb, var("));
});
const confirmSync = () => {
  fireEvent.click(within(document.querySelector(".schedule-overview") as HTMLElement).getByRole("button", { name: /核对并同步|同步排期/ }));
  const dialog = screen.queryByRole("dialog", { name: "核对排期变更并同步" });
  if (dialog) fireEvent.click(within(dialog).getByRole("button", { name: /确认同步/ }));
};

it("只在显式展开时读取流程，并隔离切换节点后的迟到返回", async () => {
  const read = data();
  read.targets.push({ ...read.targets[0], id: "two", identity: { ...identity, node: "n-next" }, nodeName: "后续开发" });
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  let finishFirst!: (options: WorkflowOptions) => void;
  const firstAction: WorkflowAction = { id: "node:confirm:n", kind: "node", label: "完成开发", fields: [] };
  const secondAction: WorkflowAction = { id: "node:confirm:n-next", kind: "node", label: "完成后续开发", fields: [] };
  vi.mocked(getWorkflowActions).mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
  vi.mocked(getWorkflowActions).mockResolvedValue({ version: "v1", actions: [firstAction, secondAction] });
  const consumeCandidate = vi.fn((_candidate: ScheduleRead, adopt: boolean) => adopt);
  const controller: ScheduleSessionController = { read, pending: null, reload: vi.fn(), updateRead: vi.fn(), consumeCandidate };
  const props = { onGuardChange: vi.fn(), requestReload: (reload: () => void) => reload(), workflow: { context: "test", busy: false, submit: vi.fn() } };
  const page = render(<StrictMode><SchedulePage {...props} preloadedSession={controller} /></StrictMode>);

  await screen.findByLabelText("今日问候");
  expect(getWorkflowActions).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("button", { name: /任务一.*开发/ })[0]);
  const inspector = within(screen.getByLabelText("排期检查器"));
  expect(getWorkflowActions).not.toHaveBeenCalled();
  const trigger = inspector.getByRole("button", { name: "查看可用流程动作", description: "当前节点 开发" });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(trigger);
  const expanded = inspector.getByRole("button", { name: "收起流程动作", description: "当前节点 开发" });
  expect(expanded.getAttribute("aria-expanded")).toBe("true");
  expect(document.getElementById(expanded.getAttribute("aria-controls")!)).toBeTruthy();
  expect(getWorkflowActions).toHaveBeenCalledExactlyOnceWith({ project_key: "p", work_item_type_key: "t", work_item_id: "i" }, true);
  const candidate = { ...read, sessionId: "background" };
  page.rerender(<StrictMode><SchedulePage {...props} preloadedSession={{ ...controller, candidate }} /></StrictMode>);
  expect(consumeCandidate).toHaveBeenCalledWith(candidate, false);
  expect((inspector.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(false);
  page.rerender(<StrictMode><SchedulePage {...props} preloadedSession={controller} /></StrictMode>);
  fireEvent.click(inspector.getByRole("button", { name: /后续开发/ }));
  expect(getWorkflowActions).toHaveBeenCalledTimes(1);
  expect(inspector.queryByText("正在读取可用动作…")).toBeNull();
  fireEvent.click(inspector.getByRole("button", { name: "查看可用流程动作", description: "当前节点 后续开发" }));
  await inspector.findByRole("button", { name: "完成后续开发" });
  await act(async () => { finishFirst({ version: "old", actions: [firstAction] }); });
  expect(inspector.queryByRole("button", { name: "完成开发" })).toBeNull();
  expect(inspector.getByRole("button", { name: "完成后续开发" })).toBeTruthy();
});

it("单节点可填写并二次确认，保留排期草稿且仅提交当前流程差异", async () => {
  localStorage.clear();
  saveWorkflowSkipConfirmation(true);
  const action: WorkflowAction = { id: "node:confirm:n", kind: "node", label: "完成开发", fields: [
    { key: "doc", label: "设计文档", kind: "text", required: true, initial_value: "云端设计" },
    ...[
      { property: "estimate_start_date", label: "开始日期", initial_value: "2026-11-25" },
      { property: "estimate_end_date", label: "结束日期", initial_value: "2026-11-26" },
    ].map(({ property, label, initial_value }) => ({
      key: JSON.stringify({ Schedule: { property, owner: null } }), label,
      kind: "date" as const, required: true, initial_value, scope: "node" as const,
    })),
  ] };
  const result: WorkflowResult = { outcome: "verified", verified: true, message: "已完成", request_id: "r", action_id: action.id, resynced: true };
  const submit = vi.fn().mockResolvedValue(result);
  vi.mocked(getWorkflowActions).mockResolvedValue({ version: "v1", action_versions: { [action.id]: "node-v1" }, actions: [action] });
  try {
    render(<SchedulePage onGuardChange={vi.fn()} requestReload={(reload) => reload()}
      workflow={{ context: "test", busy: false, submit }} />);
    fireEvent.click(await screen.findByText("任务一"));
    const inspector = within(screen.getByLabelText("排期检查器"));
    fireEvent.click(inspector.getByRole("button", { name: "今天" }));
    const trigger = inspector.getByRole("button", { name: "查看可用流程动作" });
    fireEvent.click(trigger);
    fireEvent.click(await inspector.findByRole("button", { name: "完成开发" }));
    const form = () => screen.getByRole("dialog", { name: "开发 · 流程操作" });
    const dialog = within(form());
    expect(dialog.getByText(/此节点有未同步的排期草稿/)).toBeTruthy();
    fireEvent.change(dialog.getByLabelText(/设计文档/), { target: { value: "更新后的设计" } });
    const heading = dialog.getByRole("heading", { name: "开发 · 流程操作" });
    const wheel = createEvent.wheel(heading, { deltaY: 60, cancelable: true });
    fireEvent(heading, wheel);
    expect(wheel.defaultPrevented).toBe(true);
    fireEvent.keyDown(form(), { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(inspector.getByRole("button", { name: "完成开发" }));
    const reopened = within(form());
    expect((reopened.getByLabelText(/设计文档/) as HTMLInputElement).value).toBe("更新后的设计");
    fireEvent.click(reopened.getByRole("button", { name: "提交" }));
    const review = within(await reopened.findByRole("region", { name: "提交前二次确认" }));
    expect(review.getByText("云端设计")).toBeTruthy();
    expect(review.getByText("更新后的设计")).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(review.getByRole("button", { name: /我已核对/ }));
    fireEvent.click(review.getByRole("button", { name: /确认/ }));
    await waitFor(() => expect(submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      action_id: "node:confirm:n", version: "node-v1", fields: { doc: "更新后的设计" },
    }), "完成开发"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "开发 · 流程操作" })).toBeNull());
    expect(inspector.getByText("本地草稿")).toBeTruthy();
    expect(submitScheduleTargets).not.toHaveBeenCalled();
  } finally {
    localStorage.clear();
  }
});

it("按人待排期显示各节点停留时间，隐藏重复操作说明和权限说明", async () => {
  const read = data();
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now);
  read.people.push({ id: "other", name: "同事" });
  read.targets = [
    { ...read.targets[0], nodeStatus: "doing", nodeStartedAtMs: now - 3 * 86_400_000, mine: false, ownerId: "other", ownerIds: ["other"], identity: { ...identity, owner: "other" }, readOnlyReason: "仅可编辑明确属于自己的排期" },
    { ...read.targets[0], id: "two", title: "任务二", nodeStartedAtMs: now - 5 * 3_600_000, identity: { ...identity, node: "n2" } },
    { ...read.targets[0], id: "unknown", title: "未知时间节点", identity: { ...identity, node: "n3" } },
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  await screen.findByRole("button", { name: /已停留 3 天/ });
  expect(screen.getByRole("button", { name: /已停留 5 小时/ })).toBeTruthy();
  expect(screen.getByText("停留时间未知")).toBeTruthy();
  const card = screen.getByRole("button", { name: /任务一/ });
  expect(card.getAttribute("draggable")).toBe("false");
  expect(card.querySelector(".schedule-current-node.is-pending")?.textContent).toBe("开发");
  expect(card.textContent).not.toContain("同事");
  expect(card.textContent).not.toContain("待安排");
  expect(card.textContent).not.toContain("仅可编辑明确属于自己的排期");
  expect(screen.queryByText(/点快捷胶囊一键排期/)).toBeNull();
});

it("待排期节点停留满七天时强调天数徽标", async () => {
  const read = data();
  const now = Date.now();
  const weekMs = 7 * 86_400_000;
  vi.spyOn(Date, "now").mockReturnValue(now);
  read.targets = [weekMs - 1, weekMs, 2 * weekMs].map((elapsed, index) => ({
    ...read.targets[0],
    id: `dwell-${index}`,
    identity: { ...identity, node: `dwell-${index}` },
    nodeStatus: "doing",
    nodeStartedAtMs: now - elapsed,
  }));
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();

  const sixDays = await screen.findByRole("button", { name: /已停留 6 天/ });
  const sevenDays = screen.getByRole("button", { name: /已停留 7 天/ });
  const fourteenDays = screen.getByRole("button", { name: /已停留 14 天/ });
  expect(sixDays.querySelector(".schedule-dwell-duration.is-long-dwell")).toBeNull();
  expect(sevenDays.querySelector(".schedule-dwell-duration.is-long-dwell")).toBeTruthy();
  expect(fourteenDays.querySelector(".schedule-dwell-duration.is-long-dwell")).toBeTruthy();
});

it("重新读取使用独立悬浮消息，结束时淡出，连续读取不会被旧计时器关闭", async () => {
  const read = data();
  let finish!: (value: ScheduleRead) => void;
  const controller: ScheduleSessionController = { read, pending: null, refreshing: false, updateRead: vi.fn(), reload: vi.fn(() => new Promise<ScheduleRead>((resolve) => { finish = resolve; })) };
  const props = { onGuardChange: vi.fn(), requestReload: (reload: () => void) => reload() };
  const page = render(<SchedulePage {...props} preloadedSession={controller} />);
  await screen.findByText("任务一");
  const refresh = (refreshing: boolean) => page.rerender(<SchedulePage {...props} preloadedSession={{ ...controller, refreshing }} />);
  refresh(true);
  expect(screen.queryByText("正在刷新最新排期")).toBeNull();
  refresh(false);
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  const refreshStatus = () => screen.getByText("正在刷新最新排期").closest('[role="status"]');
  const notice = refreshStatus()?.parentElement as HTMLElement;
  expect(notice.classList.contains("schedule-refresh-notice")).toBe(true);
  expect(notice.parentElement).toBe(document.body);
  expect(page.container.contains(notice)).toBe(false);
  finish(read);
  await waitFor(() => expect(notice.classList.contains("is-leaving")).toBe(true));
  expect(notice.classList.contains("is-leaving")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  await new Promise((resolve) => setTimeout(resolve, 220));
  expect(refreshStatus()?.parentElement).toBe(notice);
  expect(notice.classList.contains("is-leaving")).toBe(false);
  finish(read);
  await waitFor(() => expect(document.querySelector(".schedule-refresh-notice")).toBeNull());
});

it.each(["refreshing", "failed"])("后台%s保留有效会话，持续允许编辑、核对与提交", async (phase) => {
  const read = data();
  const controller: ScheduleSessionController = { read, pending: null, refreshing: false, refreshError: "", updateRead: vi.fn(), reload: vi.fn().mockResolvedValue({ ...read, sessionId: "new-session" }) };
  const props = { onGuardChange: vi.fn(), requestReload: (reload: () => void) => reload(), preloadedSession: controller };
  const page = render(<SchedulePage {...props} />);
  fireEvent.click(await screen.findByText("任务一"));
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(false);
  controller.refreshing = true;
  page.rerender(<SchedulePage {...props} preloadedSession={{ ...controller }} />);
  expect(screen.getAllByText("任务一").length).toBeGreaterThan(0);
  expect(screen.queryByText("正在刷新最新排期")).toBeNull();
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(false);
  expect((screen.getByRole("button", { name: "正在刷新…" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-11-16" } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-11-17" } });
  fireEvent.click(screen.getByRole("button", { name: /核对并同步|同步排期/ }));
  expect(screen.getByRole("dialog", { name: "核对排期变更并同步" })).toBeTruthy();
  controller.refreshing = phase === "refreshing";
  controller.refreshError = phase === "failed" ? "最新排期读取未完成，已保留上次内容，可继续编辑，稍后重试。" : "";
  page.rerender(<SchedulePage {...props} preloadedSession={{ ...controller }} />);
  if (controller.refreshError) expect(screen.getByText(controller.refreshError)).toBeTruthy();
  expect(screen.getAllByText("任务一").length).toBeGreaterThan(0);
  vi.mocked(submitScheduleTargets).mockResolvedValueOnce({ results: [{ id: "one", result: "accepted" }], writeRequests: 1 });
  fireEvent.click(within(screen.getByRole("dialog", { name: "核对排期变更并同步" })).getByRole("button", { name: /确认同步/ }));
  await waitFor(() => expect(submitScheduleTargets).toHaveBeenCalledWith("session", expect.arrayContaining([expect.objectContaining({ id: "one", dates: { start: "2026-11-16", end: "2026-11-17" } })])));
});

it("候选快照在拖动期间丢弃，拖放草稿仍绑定原会话并可核对提交", async () => {
  const read = data();
  const consumeCandidate = vi.fn((_next: ScheduleRead, adopt: boolean) => adopt);
  const controller: ScheduleSessionController = { read, pending: null, refreshing: true, updateRead: vi.fn(), reload: vi.fn(), consumeCandidate };
  const props = { onGuardChange: vi.fn(), requestReload: (reload: () => void) => reload(), preloadedSession: controller };
  const page = render(<SchedulePage {...props} />);
  const transfer = { effectAllowed: "", setData: vi.fn() };
  fireEvent.dragStart(await screen.findByRole("button", { name: /任务一/ }), { dataTransfer: transfer });
  const candidate = { ...read, sessionId: "candidate", targets: [{ ...read.targets[0], id: "new-id", title: "候选内容" }] };
  page.rerender(<SchedulePage {...props} preloadedSession={{ ...controller, candidate }} />);
  expect(consumeCandidate).toHaveBeenCalledWith(candidate, false);
  expect(screen.queryByText("候选内容")).toBeNull();
  fireEvent.drop(document.querySelectorAll(".schedule-days > div")[1], { dataTransfer: transfer });
  vi.mocked(submitScheduleTargets).mockResolvedValueOnce({ results: [{ id: "one", result: "accepted" }], writeRequests: 1 });
  confirmSync();
  await waitFor(() => expect(submitScheduleTargets).toHaveBeenCalledWith("session", expect.arrayContaining([expect.objectContaining({ id: "one" })])));
});

it("空闲采用候选时按业务身份保留选中节点，使用新会话目标提交", async () => {
  const read = data();
  const consumeCandidate = vi.fn().mockReturnValue(true);
  const controller: ScheduleSessionController = { read, pending: null, updateRead: vi.fn(), reload: vi.fn(), consumeCandidate };
  const props = { onGuardChange: vi.fn(), requestReload: (reload: () => void) => reload(), preloadedSession: controller };
  const page = render(<SchedulePage {...props} />);
  fireEvent.click(await screen.findByText("任务一"));
  const candidate = { ...read, sessionId: "candidate", targets: [{ ...read.targets[0], id: "new-id" }] };
  page.rerender(<SchedulePage {...props} preloadedSession={{ ...controller, candidate }} />);
  expect(consumeCandidate).toHaveBeenCalledWith(candidate, true);
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-11-16" } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-11-17" } });
  vi.mocked(submitScheduleTargets).mockResolvedValueOnce({ results: [{ id: "new-id", result: "accepted" }], writeRequests: 1 });
  confirmSync();
  await waitFor(() => expect(submitScheduleTargets).toHaveBeenCalledWith("candidate", expect.arrayContaining([expect.objectContaining({ id: "new-id" })])));
});

it("日期选择器已打开时不采用候选，也不关闭正在选择的日历", async () => {
  const read = data();
  const consumeCandidate = vi.fn((_next: ScheduleRead, adopt: boolean) => adopt);
  const controller: ScheduleSessionController = { read, pending: null, updateRead: vi.fn(), reload: vi.fn(), consumeCandidate };
  const props = { onGuardChange: vi.fn(), requestReload: (reload: () => void) => reload(), preloadedSession: controller };
  const page = render(<SchedulePage {...props} />);
  fireEvent.click(await screen.findByText("任务一"));
  fireEvent.click(screen.getByLabelText("开始日期"));
  expect(screen.getByRole("dialog")).toBeTruthy();
  const candidate = { ...read, sessionId: "candidate", targets: [{ ...read.targets[0], id: "new-id" }] };
  page.rerender(<SchedulePage {...props} preloadedSession={{ ...controller, candidate }} />);
  expect(consumeCandidate).toHaveBeenCalledWith(candidate, false);
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("手动重读再次失败仍展示旧快照及恢复入口，不把内容替换成整页错误", async () => {
  const controller: ScheduleSessionController = { read: data(), pending: null, updateRead: vi.fn(), reload: vi.fn().mockRejectedValue({ kind: "connection" }) };
  render(<SchedulePage onGuardChange={vi.fn()} requestReload={(reload) => reload()} preloadedSession={controller} />);
  fireEvent.click(await screen.findByText("任务一"));
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  await screen.findByText(/读取事项安排失败.*已保留上次内容/);
  expect(screen.getAllByText("任务一").length).toBeGreaterThan(0);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(false);
  expect((screen.getByRole("button", { name: "重新读取" }) as HTMLButtonElement).disabled).toBe(false);
  vi.mocked(controller.reload).mockResolvedValueOnce({ ...data(), sessionId: "recovered" });
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "重新读取" }) as HTMLButtonElement).disabled).toBe(false));
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(false);
  expect(screen.queryByText(/读取事项安排失败.*已保留上次内容/)).toBeNull();
});

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
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  expect(screen.getAllByText(/尚有负责人身份不明/).length).toBeGreaterThan(0);
});

it.each([true, false])("零来源不再占用常驻说明栏（完整性标记 %s）", async (complete) => {
  const read = data(); read.sources = []; read.targets = []; read.complete = complete;
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  render(<SchedulePage onGuardChange={vi.fn()} requestReload={vi.fn()} />);
  await screen.findByLabelText("今日问候");
  expect(document.querySelector(".schedule-scope")).toBeNull();
  expect(screen.queryByText(/无可执行来源|完整读取|部分读取失败/)).toBeNull();
});

it("概览保留头像与今日问候，日期统计标明草稿且保留真实读取失败反馈", async () => {
  const read = data(); read.sources = [{ id: "s", name: "我的来源", complete: true }]; read.complete = true;
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  const page = render(<SchedulePage onGuardChange={vi.fn()} requestReload={vi.fn()} />);
  const greeting = await screen.findByLabelText("今日问候");
  expect(greeting.closest(".schedule-overview")).toBeTruthy();
  expect(greeting.querySelector(".schedule-avatar")).toBeTruthy();
  expect(greeting.textContent).toContain("本人");
  expect(greeting.textContent).toMatch(/\d+月\d+日星期/);
  expect(greeting.querySelector("p")?.textContent).toBeTruthy();
  expect(screen.queryByText("含未同步草稿")).toBeNull();
  fireEvent.click(within(screen.getByLabelText("任务一快捷排期")).getByRole("button", { name: "今天" }));
  const summary = within(screen.getByRole("group", { name: "当前日期范围排期统计" }));
  expect(summary.getByText("含未同步草稿")).toBeTruthy();
  expect(screen.getAllByText("含未同步草稿")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "全部还原" }));
  expect(screen.queryByText("含未同步草稿")).toBeNull();
  expect(screen.queryByText("本地排期草稿")).toBeNull();
  expect(screen.queryByText(/完整读取|读取时间|读取请求/)).toBeNull();
  expect(screen.queryByRole("button", { name: "读取说明" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  expect(screen.getByLabelText("今日问候")).toBe(greeting);
  page.unmount();
  vi.mocked(loadScheduleSession).mockResolvedValue(data());
  render(<SchedulePage onGuardChange={vi.fn()} requestReload={vi.fn()} />);
  expect(await screen.findByText(/部分事项读取失败/)).toBeTruthy();
});

it("今日问候跨上海午夜及午后时段更新，卸载后清理计时器", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-11-16T23:59:30+08:00"));
    const page = render(<SchedulePage preloadedSession={{ read: data(), pending: null, updateRead: vi.fn(), reload: vi.fn() }} onGuardChange={vi.fn()} requestReload={vi.fn()} />);
    const greeting = screen.getByLabelText("今日问候");
    const quote = greeting.querySelector("p")!.textContent;
    expect(greeting.textContent).toContain("晚上好 · 11月16日星期一");
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(greeting.textContent).toContain("夜深了 · 11月17日星期二");
    expect(greeting.querySelector("p")!.textContent).not.toBe(quote);
    vi.setSystemTime(new Date("2026-11-17T13:59:30+08:00"));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(greeting.textContent).toContain("下午好 · 11月17日星期二");
    page.unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("所属项目按空间和项目身份筛选，跨类型合并且支持多项目及无项目信息", async () => {
  const read = data();
  read.targets.push(
    { ...read.targets[0], id: "two", title: "另一空间任务", identity: { ...identity, project: "other", item: "other" }, projectName: "另一空间" },
    { ...read.targets[0], id: "missing", title: "无项目任务", identity: { ...identity, item: "missing" } },
    { ...read.targets[0], id: "issue", title: "同项目缺陷", identity: { ...identity, type: "issue", item: "issue" } },
  );
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  render(<SchedulePage snapshot={projectSnapshot(read)} onGuardChange={vi.fn()} requestReload={vi.fn()} />);
  await screen.findByText("任务一");
  expect(screen.queryByRole("combobox", { name: "筛选来源" })).toBeNull();
  expect(screen.queryByRole("combobox", { name: "筛选类型" })).toBeNull();
  const chooseProject = (name: string) => {
    fireEvent.click(screen.getByRole("combobox", { name: "筛选所属项目" }));
    fireEvent.click(screen.getByRole("option", { name }));
  };
  fireEvent.click(screen.getByRole("combobox", { name: "筛选空间" }));
  fireEvent.click(screen.getByRole("option", { name: "空间" }));
  chooseProject("AI 应用开发平台");
  expect(screen.getByText("任务一")).toBeTruthy();
  expect(screen.getByText("同项目缺陷")).toBeTruthy();
  expect(screen.queryByText("另一空间任务")).toBeNull();
  expect(screen.queryByText("无项目任务")).toBeNull();
  chooseProject("项目乙");
  expect(screen.getByText("任务一")).toBeTruthy();
  expect(screen.queryByText("同项目缺陷")).toBeNull();
  chooseProject("未提供所属项目");
  expect(screen.getByText("无项目任务")).toBeTruthy();
  chooseProject("全部项目");
  expect(screen.getByText("同项目缺陷")).toBeTruthy();
  chooseProject("项目乙");
  fireEvent.click(screen.getByRole("combobox", { name: "筛选空间" }));
  fireEvent.click(screen.getByRole("option", { name: "另一空间" }));
  expect(screen.getByText("另一空间任务")).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "筛选所属项目" }).textContent).toContain("全部项目");
  chooseProject("AI 应用开发平台");
  expect(screen.queryByText("任务一")).toBeNull();
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("项目筛选区分缺少事项缓存与已读取但未提供项目，候选仅来自排期事项", async () => {
  const read = data();
  read.targets.push(
    { ...read.targets[0], id: "uncached", title: "未读取项目任务", identity: { ...identity, item: "uncached" } },
    { ...read.targets[0], id: "missing", title: "无项目任务", identity: { ...identity, item: "missing" } },
  );
  const snapshot = projectSnapshot(read);
  snapshot.items.splice(1, 1);
  snapshot.items.push({ ...snapshot.items[0], id: { ...snapshot.items[0].id, work_item_id: "outside" }, related_projects: [{ field_key: "project", id: "outside", name: "无排期的项目" }] });
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  render(<SchedulePage snapshot={snapshot} onGuardChange={vi.fn()} requestReload={vi.fn()} />);
  await screen.findByText("任务一");
  fireEvent.click(screen.getByRole("combobox", { name: "筛选所属项目" }));
  expect(screen.queryByRole("option", { name: "无排期的项目" })).toBeNull();
  fireEvent.click(screen.getByRole("option", { name: "项目信息未读取" }));
  expect(screen.getByText("未读取项目任务")).toBeTruthy();
  expect(screen.queryByText("无项目任务")).toBeNull();
  fireEvent.click(screen.getByRole("combobox", { name: "筛选所属项目" }));
  fireEvent.click(screen.getByRole("option", { name: "未提供所属项目" }));
  expect(screen.queryByText("未读取项目任务")).toBeNull();
  expect(screen.getByText("无项目任务")).toBeTruthy();
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
});

it("删除常驻来源栏后仍展示所有关联读取失败", async () => {
  const read = data();
  read.sources = [{ id: "a", name: "完整来源", complete: true }, { id: "b", name: "失败来源", complete: false, error: "分页失败" }];
  read.itemErrors = [{ project: "p", type: "t", item: "bad", sources: ["b"], message: "详情失败" }, { project: "p", type: "t", item: "shared", sources: ["a", "b"], message: "共同事项失败" }];
  // 来源 a 也包含共同失败，因此不应错误显示完整。
  read.sources[0].complete = false;
  read.sources.push({ id: "c", name: "独立完整来源", complete: true });
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  expect(screen.queryByRole("combobox", { name: "筛选来源" })).toBeNull();
  expect(screen.getByText(/分页失败/)).toBeTruthy();
  expect(screen.getByText(/详情失败/)).toBeTruthy();
  expect(screen.getByText(/共同事项失败/)).toBeTruthy();
  expect(document.querySelector(".schedule-scope")).toBeNull();
  expect(screen.getByText(/详情失败/)).toBeTruthy();
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
});

it("本地来源缓存提示包含可读事项身份和来源，不裸露内部长键", async () => {
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
  expect(document.body.textContent).not.toContain("9000000000000654321");
  expect(document.body.textContent).not.toContain("space_key_xyz");
  expect(document.body.textContent).not.toContain("raw_internal_source");
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
});

it("单次读取后筛选和编辑不触发请求，经二次确认后同步差异并以回执推进基线", async () => {
  const guard = await setup();
  expect(screen.getByText(/部分事项读取失败/)).toBeTruthy();
  fireEvent.click(screen.getByText("任务一"));
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-11-13" } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-11-16" } });
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
  expect(submitScheduleTargets).not.toHaveBeenCalled();
  vi.mocked(submitScheduleTargets).mockResolvedValue({ results: [{ id: "one", result: "accepted", message: "收到成功回执，未回读核验" }], writeRequests: 1 });
  confirmSync();
  await screen.findByText("排期已同步");
  expect(screen.queryByText("含未同步草稿")).toBeNull();
  expect(screen.queryByText("收到成功回执，未回读核验")).toBeNull();
  expect(screen.queryByText(/上次提交：/)).toBeNull();
  expect(screen.getByText("已保存 1 项节点排期")).toBeTruthy();
  const successBanner = screen.getByText("排期已同步").closest('[role="status"]')!;
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
  expect(screen.queryByRole("button", { name: "清空排期" })).toBeNull();
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
  expect(warningBanner.className).toContain("schedule-feedback");
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

it("提交结果保留汇总与不确定保护，排期条、行标题和待排卡片不重复展示上次提交文字", async () => {
  const read = data();
  read.targets = ["一", "二", "三", "四"].map((suffix, index) => ({ ...read.targets[0], id: String(index), title: `任务${suffix}`, identity: { ...identity, node: `n${index}` } }));
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  for (const suffix of ["一", "二", "三", "四"]) {
    fireEvent.click(within(document.querySelector(".schedule-pending") as HTMLElement)
      .getByRole("button", { name: new RegExp(`^任务${suffix}`) }));
    fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: today } });
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: today } });
  }
  vi.mocked(submitScheduleTargets).mockResolvedValue({ results: ["accepted", "failed", "uncertain", "unsent"].map((result, index) => ({ id: String(index), result: result as "accepted" | "failed" | "uncertain" | "unsent" })), writeRequests: 3 });
  confirmSync();
  await screen.findByText(/收到成功回执 1 项，失败 1 项，结果不确定 1 项，未发送 1 项/);
  for (const suffix of ["一", "二", "三", "四"]) {
    const bar = screen.getByRole("button", { name: `任务${suffix} · 开发` });
    expect(bar.querySelector(".schedule-bar-title")?.textContent).toBe("开发");
    expect(bar.closest(".schedule-row")?.textContent).not.toContain("上次提交");
  }
  expect(screen.queryByText(/上次提交：/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "任务三 · 开发" }));
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  expect(screen.getByText("该节点存在结果不确定的排期，请先在飞书核对并重新读取。")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "任务一 · 开发" }));
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "" } });
  expect(screen.getByRole("button", { name: /任务一/ }).className).toContain("schedule-pending-item");
  expect(screen.queryByText(/上次提交：/)).toBeNull();
  expect(document.querySelector(".schedule-inspector-dirty")?.textContent).toBe("本地草稿");
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
  expect(document.querySelector(".schedule-row-current")).toBeNull();
  const bar = screen.getByRole("button", { name: /^身份不明/ });
  expect(bar.getAttribute("draggable")).toBe("false"); fireEvent.click(bar);
  expect(screen.getByText("负责人排期数据不完整")).toBeTruthy();
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /无人负责/ }));
  expect(screen.getAllByText("未能确认负责人，排期仅供查看").length).toBeGreaterThan(0);
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("没有进行中节点时隐藏日历副标题，待安排仍显示负责人", async () => {
  const read = data(); const base = read.targets[0]; read.people.push({ id: "other", name: "同事" });
  read.targets = [{ ...base, id: "shared", title: "共同任务", identity: { ...identity, scope: "node", owner: "" }, ownerId: null, ownerIds: ["me", "other"], dates: { start: currentWeekDay(0), end: currentWeekDay(0) }, readOnlyReason: "仅可编辑明确属于自己的排期" }, base];
  vi.mocked(loadScheduleSession).mockResolvedValue(read); await setup();
  expect(document.querySelector(".schedule-row-current")).toBeNull();
  const pending = screen.getByRole("button", { name: /任务一/ });
  expect(pending.querySelector(".schedule-current-node.is-pending")?.textContent).toBe("开发");
  expect(pending.querySelector(".schedule-pending-details")?.textContent).toBe("本人 · 待安排");
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

it("默认显示来源聚合日期且保持只读，人员排期不虚构负责人", async () => {
  const read = data();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  read.targets = [{ ...read.targets[0], id: "aggregate", title: "来源记录", identity: { ...identity, scope: "node", node: "", owner: "" }, ownerId: null, ownerIds: [], mine: false, sourceAggregate: true, readOnlyReason: "详情读取失败，仅供查看", dates: { start: day, end: day } }];
  vi.mocked(loadScheduleSession).mockResolvedValue(read); await setup();
  expect(document.querySelector(".schedule-row-current")).toBeNull();
  expect(screen.queryByText(/节点共同排期/)).toBeNull();
  const bar = screen.getByRole("button", { name: /来源记录/ });
  expect(bar.getAttribute("draggable")).toBe("false");
  fireEvent.click(bar);
  expect(document.querySelector(".schedule-editor-heading")?.textContent).toBe("来源记录");
  expect(document.querySelector(".schedule-read-meta")?.textContent).toContain("来源聚合日期");
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  expect(screen.getByText("负责人不明")).toBeTruthy();
  expect(screen.queryByText(/节点共同排期/)).toBeNull();
  fireEvent.click(screen.getByRole("combobox", { name: "筛选人员" }));
  fireEvent.click(screen.getByRole("option", { name: "本人" }));
  expect(screen.queryByRole("button", { name: /来源记录/ })).toBeNull();
  expect(await screen.findByText("当前范围未包含该人员的安排")).toBeTruthy();
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
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  const pending = screen.getByRole("button", { name: /聚合记录/ });
  expect(pending.querySelector(".schedule-pending-details")?.textContent)
    .toBe("来源聚合日期 · 开始：2026-11-12；结束：未知");
});

it.each([
  [{ kind: "connection", message: "内部地址和令牌" }, "暂时无法连接服务，请稍后重试"],
  [{ kind: "auth", message: "敏感凭证" }, "连接凭证已失效，请在连接设置中更新 Token"],
  [{ kind: "conflict", message: "内部冲突栈" }, "当前会话或数据状态已变化，请重新读取"],
  [new Error("内部异常"), "暂时无法获取最新信息，请稍后重试"],
])("读取失败按错误类别显示脱敏反馈", async (failure, message) => {
  vi.mocked(loadScheduleSession).mockRejectedValueOnce(failure);
  render(<SchedulePage onGuardChange={vi.fn()} requestReload={vi.fn()} />);
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain(message);
  expect(alert.textContent).not.toMatch(/\[object Object\]|内部地址|敏感凭证|内部冲突栈|内部异常/);
});

it("读取失败横幅点击重新读取时携带 forceReset 重新建立会话", async () => {
  const recovered = data();
  const reload = vi
    .fn()
    .mockRejectedValueOnce({ kind: "conflict", message: "旧会话残留" })
    .mockResolvedValueOnce(recovered);
  render(
    <SchedulePage
      preloadedSession={{ read: null, pending: null, updateRead: vi.fn(), reload }}
      onGuardChange={vi.fn()}
      requestReload={(fn) => fn()}
    />,
  );
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("当前会话或数据状态已变化，请重新读取");
  expect(reload).toHaveBeenNthCalledWith(1, { includePeople: false });

  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  expect(await screen.findByRole("button", { name: /任务一/ })).toBeTruthy();
  expect(reload).toHaveBeenNthCalledWith(2, { includePeople: false, forceReset: true });
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
  expect(grid.children).toHaveLength(0);
  vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({ left: 100, right: 800, width: 700, top: 0, bottom: 180, height: 180, x: 100, y: 0, toJSON: () => ({}) });
  fireEvent.dragStart(screen.getByRole("button", { name: /任务一/ }), { dataTransfer: transfer });
  const over = createEvent.dragOver(grid, { dataTransfer: transfer }); Object.defineProperty(over, "clientX", { value: 150 + index * 100 }); fireEvent(grid, over);
  const drop = createEvent.drop(grid, { dataTransfer: transfer }); Object.defineProperty(drop, "clientX", { value: 150 + index * 100 }); fireEvent(grid, drop);
  const headers = document.querySelectorAll(".schedule-days > div");
  const end = (screen.getByLabelText("结束日期") as HTMLInputElement).value;
  expect(end.slice(5)).toBe(headers[index].querySelector("strong")?.textContent);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(end);
});

const blankDragEvent = (target: Element, kind: "dragOver" | "drop", clientX: number) => {
  const event = createEvent[kind](target);
  Object.defineProperty(event, "clientX", { value: clientX });
  fireEvent(target, event);
  return event;
};

it.each([7, 14].flatMap((span) => Array.from({ length: span }, (_, index) => [span, index])))
  ("已有排期时，%i 天视图下方留白的第 %i 列可预览并新增排期草稿", async (span, index) => {
    const read = data();
    read.targets.push({ ...read.targets[0], id: "scheduled", title: "已有安排", identity: { ...identity, item: "scheduled" }, dates: { start: currentWeekDay(0), end: currentWeekDay(0) } });
    vi.mocked(loadScheduleSession).mockResolvedValue(read);
    await setup();
    if (span === 14) fireEvent.click(screen.getByRole("button", { name: "双周 14天" }));
    expect(document.querySelectorAll(".schedule-row")).toHaveLength(1);
    expect(screen.queryByText("本周暂无可显示的安排")).toBeNull();
    const grid = document.querySelector(".schedule-empty-grid") as HTMLElement;
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({ left: 300, width: span * 100 } as DOMRect);
    fireEvent.dragStart(screen.getByRole("button", { name: /任务一/ }), { dataTransfer: { effectAllowed: "", setData: vi.fn() } });
    expect(grid.children).toHaveLength(0);
    expect(blankDragEvent(grid, "dragOver", 350 + index * 100).defaultPrevented).toBe(true);
    expect(document.querySelector(".schedule-preview")?.textContent).toBe(`${currentWeekDay(index)} → ${currentWeekDay(index)}`);
    blankDragEvent(grid, "drop", 350 + index * 100);
    expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(currentWeekDay(index));
    expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(currentWeekDay(index));
    expect(document.querySelectorAll(".schedule-row")).toHaveLength(2);
    expect(document.querySelector(".schedule-preview")).toBeNull();
    expect(submitScheduleTargets).not.toHaveBeenCalled();
  });

it.each([false, true])("名称列下方留白可接收拖放，按今天是否在当前窗口选择默认日期（未来周=%s）", async (futureWeek) => {
  await setup();
  if (futureWeek) fireEvent.click(screen.getByRole("button", { name: "下一周" }));
  const grid = document.querySelector(".schedule-empty-grid") as HTMLElement;
  vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({ left: 300, width: 700 } as DOMRect);
  const blank = document.querySelector(".schedule-blank-area")!;
  const expected = futureWeek ? currentWeekDay(7) : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  fireEvent.dragStart(screen.getByRole("button", { name: /任务一/ }), { dataTransfer: { effectAllowed: "", setData: vi.fn() } });
  blankDragEvent(blank, "dragOver", 150);
  expect(document.querySelector(".schedule-preview")?.textContent).toBe(`${expected} → ${expected}`);
  blankDragEvent(blank, "drop", 150);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(expected);
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(expected);
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("已有多日排期可移到下方留白并拉伸，取消拖动或外部拖放不创建额外草稿", async () => {
  const read = data();
  read.targets[0].dates = { start: currentWeekDay(0), end: currentWeekDay(1) };
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  fireEvent.click(screen.getByRole("button", { name: /任务一/ }));
  const grid = document.querySelector(".schedule-empty-grid") as HTMLElement;
  vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({ left: 300, width: 700 } as DOMRect);
  expect(blankDragEvent(grid, "dragOver", 650).defaultPrevented).toBe(false);
  blankDragEvent(grid, "drop", 650);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(currentWeekDay(0));
  const transfer = { effectAllowed: "", setData: vi.fn() };
  const bar = document.querySelector(".schedule-bar") as HTMLElement;
  vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({ left: 300, width: 200 } as DOMRect);
  const start = createEvent.dragStart(bar, { dataTransfer: transfer });
  Object.defineProperty(start, "clientX", { value: 350 });
  fireEvent(bar, start);
  blankDragEvent(grid, "dragOver", 650);
  fireEvent.dragEnd(bar);
  expect(document.querySelector(".schedule-preview")).toBeNull();
  blankDragEvent(grid, "drop", 650);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(currentWeekDay(0));
  fireEvent(bar, start);
  blankDragEvent(grid, "drop", 650);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(currentWeekDay(3));
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(currentWeekDay(4));
  fireEvent.dragStart(bar.querySelector(".schedule-handle.end")!, { dataTransfer: transfer });
  blankDragEvent(grid, "drop", 950);
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(currentWeekDay(6));
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("搜索人员时自动展开筛选并显示匹配项", async () => {
  const read = data();
  read.people.push({ id: "other", name: "刘同事" });
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  const search = screen.getByLabelText("搜索人员");
  const filter = screen.getByRole("combobox", { name: "筛选人员" });
  fireEvent.change(search, { target: { value: "刘" } });
  expect(filter.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("option", { name: "刘同事" })).toBeTruthy();
  expect(screen.queryByRole("option", { name: "本人" })).toBeNull();
  fireEvent.click(screen.getByRole("option", { name: "刘同事" }));
  expect(screen.getByRole("option", { name: "刘同事" }).getAttribute("aria-selected")).toBe("true");
  fireEvent.click(filter);
  expect(filter.getAttribute("aria-expanded")).toBe("false");
  fireEvent.change(search, { target: { value: "" } });
  expect(filter.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("option", { name: "本人" })).toBeTruthy();
});

it("按人筛选后切回我的排期不会沿用隐藏的人员筛选", async () => {
  const read = data(); read.people.push({ id: "other", name: "同事" });
  read.targets.push({ ...read.targets[0], id: "two", title: "同事任务", ownerId: "other", ownerIds: ["other"], mine: false, identity: { ...identity, owner: "other", node: "other" } });
  vi.mocked(loadScheduleSession).mockResolvedValue(read); await setup();
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  fireEvent.click(screen.getByRole("combobox", { name: "筛选人员" }));
  fireEvent.click(screen.getByRole("option", { name: "同事" }));
  expect(screen.queryByRole("button", { name: /任务一/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "我的排期" }));
  expect(screen.getByRole("button", { name: /任务一/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /同事任务/ })).toBeNull();
});

it("人员筛选支持连续多选、取消及清空，并按负责人显示共同排期", async () => {
  const read = data();
  read.people.push({ id: "other", name: "同事" }, { id: "third", name: "第三人" });
  read.targets.push(
    { ...read.targets[0], id: "shared", title: "共同任务", ownerId: null, ownerIds: ["me", "other", "third"], mine: false, identity: { ...identity, item: "shared", scope: "node", owner: undefined } },
    { ...read.targets[0], id: "third", title: "第三人任务", ownerId: "third", ownerIds: ["third"], mine: false, identity: { ...identity, item: "third", owner: "third" } },
  );
  vi.mocked(loadScheduleSession).mockResolvedValue(read); await setup();
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  fireEvent.click(screen.getByRole("combobox", { name: "筛选人员" }));
  fireEvent.click(screen.getByRole("option", { name: "本人" }));
  fireEvent.click(screen.getByRole("option", { name: "同事" }));
  expect(screen.getByRole("option", { name: "本人" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("option", { name: "同事" }).getAttribute("aria-selected")).toBe("true");
  const pending = document.querySelector(".schedule-pending")!;
  expect(pending.textContent).toContain("本人");
  expect(pending.textContent).toContain("同事");
  expect(pending.textContent).not.toContain("第三人任务");
  expect(pending.textContent).not.toContain("第三人 ·");
  fireEvent.click(screen.getByRole("option", { name: "本人" }));
  expect(pending.textContent).not.toContain("任务一");
  expect(pending.textContent).toContain("同事");
  fireEvent.click(screen.getByRole("option", { name: "全部人员" }));
  expect(pending.textContent).toContain("任务一");
  expect(pending.textContent).toContain("第三人任务");
});

it("筛选排除当前目标时隐藏编辑区，恢复筛选后保留会话", async () => {
  const read = data();
  read.targets.push({ ...read.targets[0], id: "other", title: "另一项目任务", identity: { ...identity, project: "other", item: "other" }, projectName: "另一空间" });
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  render(<SchedulePage snapshot={projectSnapshot(read)} onGuardChange={vi.fn()} requestReload={vi.fn()} />);
  await screen.findByText("任务一");
  fireEvent.click(screen.getByRole("button", { name: /另一项目任务/ }));
  expect(screen.getByLabelText("开始日期")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-11-16" } });
  fireEvent.click(screen.getByRole("combobox", { name: "筛选所属项目" }));
  fireEvent.click(screen.getByRole("option", { name: "项目乙" }));
  expect(screen.queryByLabelText("开始日期")).toBeNull();
  fireEvent.click(screen.getByRole("combobox", { name: "筛选所属项目" }));
  fireEvent.click(screen.getByRole("option", { name: "全部项目" }));
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe("2026-11-16");
});

it("人员有待安排事项但本周无排期时说明本周为空", async () => {
  await setup();
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  fireEvent.click(screen.getByRole("combobox", { name: "筛选人员" }));
  fireEvent.click(screen.getByRole("option", { name: "本人" }));
  expect(await screen.findByText("本周暂无可显示的安排")).toBeTruthy();
  expect(screen.queryByText("当前范围未包含该人员的安排")).toBeNull();
});

it("人员分组在待排池和日历独立折叠，键盘展开并保留选择与草稿", async () => {
  const read = data();
  read.targets.push({ ...read.targets[0], id: "scheduled", title: "已安排任务", identity: { ...identity, item: "scheduled" }, dates: { start: currentWeekDay(0), end: currentWeekDay(0) } });
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  fireEvent.click(screen.getByRole("button", { name: /任务一/ }));
  const pendingToggle = screen.getByRole("button", { name: "收起本人的待排期，共1项" });
  fireEvent.click(pendingToggle);
  expect(pendingToggle.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("button", { name: /任务一/ })).toBeNull();
  expect(document.querySelector(".schedule-editor")?.textContent).toContain("任务一");
  expect(document.querySelector(".schedule-row")?.hasAttribute("hidden")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "收起本人的日历安排，共1项" }));
  expect(document.querySelector(".schedule-row")?.hasAttribute("hidden")).toBe(true);
  pendingToggle.focus();
  await userEvent.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: /任务一/ })).toBeTruthy();
  expect(document.querySelector(".schedule-row")?.hasAttribute("hidden")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "我的排期" }));
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: currentWeekDay(1) } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: currentWeekDay(1) } });
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  fireEvent.click(screen.getByRole("button", { name: "展开本人的日历安排，共2项" }));
  fireEvent.click(screen.getByRole("button", { name: "我的排期" }));
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(currentWeekDay(1));
  expect(document.querySelectorAll(".schedule-row[hidden]")).toHaveLength(0);
});

it("人员排期计入当前周和其他周的只读排期，跨空间相同人员 ID 的待排分组不串联", async () => {
  const read = data();
  const base = read.targets[0];
  read.targets.push(
    { ...base, id: "other-space", title: "另一空间待排", identity: { ...identity, project: "q" } },
    { ...base, id: "current", title: "本周任务", identity: { ...identity, item: "current", owner: "other" }, ownerId: "other", ownerIds: ["other"], mine: false, dates: { start: currentWeekDay(0), end: currentWeekDay(0) } },
    { ...base, id: "outside", title: "其他周任务", identity: { ...identity, item: "outside" }, dates: { start: "2020-01-01", end: "2020-01-01" } },
  );
  read.people.push({ id: "other", name: "同事" });
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  expect(screen.getByRole("tab", { name: "已排期 (1)" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  fireEvent.click(screen.getAllByRole("button", { name: "收起本人的待排期，共1项" })[0]);
  expect(screen.queryByRole("button", { name: /任务一/ })).toBeNull();
  expect(screen.getByRole("button", { name: /另一空间待排/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "已排期 (2)" }));
  const pool = within(document.querySelector<HTMLElement>(".schedule-pending")!);
  expect(pool.getByRole("button", { name: /本周任务/ }).getAttribute("draggable")).toBe("false");
  const otherWeekCard = pool.getByRole("button", { name: /其他周任务/ }).closest<HTMLElement>(".schedule-outside-card")!;
  expect(within(otherWeekCard).queryByRole("button", { name: "排入本周" })).toBeNull();
  fireEvent.click(within(otherWeekCard).getByRole("button", { name: /定位该周/ }));
  expect(screen.getByRole("button", { name: /其他周任务 · 开发/ })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "已排期 (2)" })).toBeTruthy();
  fireEvent.click(screen.getByRole("combobox", { name: "筛选人员" }));
  fireEvent.click(screen.getByRole("option", { name: "同事" }));
  expect(screen.getByRole("tab", { name: "已排期 (1)" })).toBeTruthy();
  expect(pool.queryByRole("button", { name: /其他周任务/ })).toBeNull();
  fireEvent.click(screen.getByRole("option", { name: "同事" }));
  fireEvent.keyDown(screen.getByRole("combobox", { name: "筛选人员" }), { key: "Escape" });
  fireEvent.click(screen.getByRole("tab", { name: /待排期/ }));
  expect(screen.queryByRole("button", { name: /任务一/ })).toBeNull();
  expect(screen.getByRole("button", { name: /另一空间待排/ })).toBeTruthy();
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
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  const pending = document.querySelector(".schedule-pending")!;
  expect(pending.querySelectorAll(".schedule-group")).toHaveLength(3);
  expect(pending.textContent).toContain("张三 (same)");
  expect(pending.textContent).toContain("张三 (other)");
  expect(Array.from(pending.querySelectorAll(".schedule-group")).some((group) => group.textContent?.includes("李四"))).toBe(true);
  expect(pending.querySelector('img[src="a.png"]')).toBeTruthy();
  expect(pending.querySelector('img[src="b.png"]')).toBeTruthy();
  expect(document.querySelector('.schedule-row-label img[src="b.png"]')).toBeTruthy();
  const shared = within(pending as HTMLElement).getByRole("button", { name: /同标题.*节点共同排期/ });
  expect(shared.getAttribute("draggable")).toBe("false");
  fireEvent.click(shared);
  expect(document.querySelector(".schedule-read-meta")?.textContent).toContain("节点共同排期");
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

it("排期检查器合并当前节点与日期信息，隐藏清空入口并保留云端日期对比", async () => {
  const read = data();
  read.targets[0].dates = { start: currentWeekDay(0), end: currentWeekDay(0) };
  read.targets[0].fetchedAt = "2026-11-16 09:00";
  read.targets.push({
    ...read.targets[0], id: "sibling", nodeName: "方案设计",
    identity: { ...identity, node: "design" },
  });
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  fireEvent.click(screen.getAllByRole("button", { name: /任务一/ })[0]);
  const editor = document.querySelector(".schedule-editor")!;
  const heading = editor.querySelector(".schedule-editor-heading")!;
  expect(heading.textContent).toBe("任务一");
  const nodes = within(editor as HTMLElement).getByRole("group", { name: "事项节点" });
  const currentNode = nodes.querySelector('[aria-pressed="true"]')!;
  expect(currentNode.textContent).toBe(`开发${currentWeekDay(0).slice(5)}`);
  expect(nodes.textContent).toContain("方案设计");
  expect(editor.textContent).not.toContain("已排期：");
  expect(editor.querySelectorAll(".schedule-span-info")).toHaveLength(1);
  expect(within(editor as HTMLElement).queryByRole("button", { name: "清空排期" })).toBeNull();
  const readMeta = editor.querySelector(".schedule-read-meta") as HTMLDetailsElement;
  expect(readMeta.open).toBe(false);
  expect(readMeta.textContent).toContain("2026-11-16 09:00");
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: currentWeekDay(1) } });
  expect(editor.querySelector(".schedule-span-info")?.textContent).toBe("共 2 个自然日");
  expect(editor.querySelector(".schedule-cloud-baseline")?.textContent).toContain(`${currentWeekDay(0)} ~ ${currentWeekDay(0)}`);
  expect(document.querySelector(".schedule-inspector-dirty")?.textContent).toBe("本地草稿");
  expect(heading.textContent).not.toContain("未同步");
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("关闭排期检查器释放日历空间，重新选择节点保留未提交日期", async () => {
  const read = data();
  read.targets[0].dates = { start: currentWeekDay(0), end: currentWeekDay(0) };
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  fireEvent.click(screen.getByRole("button", { name: /任务一/ }));
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: currentWeekDay(1) } });
  fireEvent.click(screen.getByRole("button", { name: "关闭排期检查器" }));
  expect(screen.queryByRole("complementary", { name: "排期检查器" })).toBeNull();
  expect(document.querySelector(".schedule-layout")?.classList.contains("is-inspector-closed")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /任务一/ }));
  expect(screen.getByRole("complementary", { name: "排期检查器" })).toBeTruthy();
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(currentWeekDay(1));
  expect(document.querySelector(".schedule-inspector-dirty")?.textContent).toBe("本地草稿");
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("隐藏清空按钮及常驻说明，正常日期编辑仍可提交", async () => {
  const read = data();
  read.targets[0].dates = { start: currentWeekDay(0), end: currentWeekDay(1) };
  read.targets[0].itemUrl = "https://project.feishu.cn/example/story/detail/1";
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  fireEvent.click(screen.getByRole("button", { name: /任务一/ }));
  expect(screen.queryByRole("button", { name: "清空排期" })).toBeNull();
  expect(screen.queryByText(/当前清空接口会清掉估分/)).toBeNull();
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(currentWeekDay(0));
  expect(document.querySelector(".schedule-inspector-dirty")).toBeNull();
  expect(submitScheduleTargets).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "打开飞书事项" }).getAttribute("href")).toBe(read.targets[0].itemUrl);
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: currentWeekDay(2) } });
  vi.mocked(submitScheduleTargets).mockResolvedValueOnce({
    results: [{ id: "one", result: "accepted", message: "收到成功回执，未回读核验" }], writeRequests: 1,
  });
  confirmSync();
  await waitFor(() => expect(submitScheduleTargets).toHaveBeenCalledTimes(1));
  expect(vi.mocked(submitScheduleTargets).mock.calls[0][1][0].cancel).toBe(false);
});

it("未确认当前账号时禁止编辑", async () => {
  const read = data(); read.readRequests = 1; read.accountError = "未能确认当前飞书账号";
  read.targets[0].sourceAggregate = true; read.targets[0].readOnlyReason = "缓存不足，仅供查看";
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  render(<SchedulePage onGuardChange={vi.fn()} requestReload={vi.fn()} />);
  await screen.findByText(/未能确认当前飞书账号/);
  expect(screen.getByText(/部分事项读取失败/)).toBeTruthy();
  fireEvent.click(screen.getByText("任务一"));
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("详情缓存节点保留日期状态与抓取时间，无法编辑或误称待安排", async () => {
  const read = data(); read.accountError = "本地缓存未确认当前飞书账号"; read.readRequests = 0;
  read.targets = [{ ...read.targets[0], identity: { ...identity, node: "", owner: undefined, scope: "node" }, ownerId: null, ownerIds: [], mine: false, cacheKind: "detail_node", startState: "empty", endState: "invalid", fetchedAt: "抓取时刻", readOnlyReason: "缓存不足以确认写入归属及字段配置，仅供查看" }];
  vi.mocked(loadScheduleSession).mockResolvedValue(read); render(<SchedulePage onGuardChange={vi.fn()} requestReload={vi.fn()} />);
  expect(await screen.findByLabelText("今日问候")).toBeTruthy();
  const row = screen.getByRole("button", { name: /任务一/ });
  expect(row.textContent).toContain("事项详情缓存节点"); expect(row.textContent).toContain("开始：明确为空；结束：日期无效");
  expect(row.textContent).not.toContain("待安排"); fireEvent.click(row);
  expect(screen.getByText("事项详情抓取时间 抓取时刻")).toBeTruthy();
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("在日期范围旁统计排期，翻到其他周时隐藏今日统计", async () => {
  const read = data();
  read.targets.push({
    ...read.targets[0],
    id: "scheduled",
    identity: { ...identity, node: "scheduled" },
    dates: { start: currentWeekDay(0), end: currentWeekDay(6) },
  });
  vi.mocked(loadScheduleSession).mockResolvedValue(read);

  await setup();
  const summary = screen.getByRole("group", { name: "当前日期范围排期统计" });
  expect(summary.textContent).toBe("已排 1今日有排期 1");
  expect(screen.getByRole("tab", { name: "待排期 (1)" })).toBeTruthy();
  expect(screen.queryByText(/其中 .* 项可排期/)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "下一周" }));
  expect(summary.textContent).toBe("已排 0");
});

it.each([
  { view: "我的排期", weekOffset: 0 },
  { view: "人员排期", weekOffset: 0 },
  { view: "人员排期", weekOffset: -14 },
])("$view 从偏移 $weekOffset 天的日期进入视角即预取两侧，翻页后继续补齐", async ({ view, weekOffset }) => {
  const read = data();
  const isPeople = view === "人员排期";
  const owner = isPeople ? "peer" : "me";
  const previousStart = currentWeekDay(weekOffset - 7);
  read.people.push({ id: "peer", name: "同事", connection: "c", project: "p" });
  const historyRecord = { ...read.targets[0], id: "history:past", title: "旧周完成事项", nodeName: "历史开发",
    identity: { ...identity, item: "old", owner }, ownerId: owner, ownerIds: [owner], mine: owner === "me",
    dates: { start: currentWeekDay(weekOffset - 9), end: currentWeekDay(weekOffset - 6) }, readOnlyReason: "历史排期，仅供查看" };
  const laterRecord = { ...historyRecord, id: "history:later", title: "更远一周的安排",
    dates: { start: currentWeekDay(14), end: currentWeekDay(15) } };
  read.targets.push({ ...historyRecord, id: "recent", title: "当前日期的排期", nodeStatus: "doing", readOnlyReason: undefined,
    dates: { start: currentWeekDay(0), end: currentWeekDay(6) } });
  let finishPeople: ((result: ScheduleRead) => void) | undefined;
  vi.mocked(loadScheduleSession).mockResolvedValue(isPeople
    ? { ...read, peopleLoaded: false, people: read.people.filter((person) => person.id === "me"), targets: read.targets.filter((record) => record.mine) }
    : read);
  vi.mocked(loadSchedulePeople).mockImplementation(() => new Promise((resolve) => { finishPeople = resolve; }));
  let finishTeamCalendar: (() => void) | undefined;
  vi.mocked(loadScheduleHistory).mockImplementation(async ({ range, scopes }) => {
    if (isPeople && range.start === currentWeekDay(weekOffset) && scopes.some((scope) => scope.users.includes("peer"))) {
      await new Promise<void>((resolve) => { finishTeamCalendar = resolve; });
    }
    const targets = range.start === previousStart ? [historyRecord] : range.start === currentWeekDay(14) ? [laterRecord] : [];
    return { people: [], targets, complete: true };
  });
  await setup();
  for (let offset = 0; offset > weekOffset; offset -= 7) {
    fireEvent.click(screen.getByRole("button", { name: "上一周" }));
  }
  fireEvent.click(screen.getByRole("button", { name: view }));
  expect(screen.getByRole("tab", { name: "待排期 (1)" })).toBeTruthy();
  const previousRequest = expect.objectContaining({
    range: { start: previousStart, end: currentWeekDay(weekOffset - 1) },
    scopes: [{ project: "p", work_item_type: "t", users: isPeople ? ["peer"] : [] }],
  });
  if (isPeople) {
    expect(loadScheduleHistory).not.toHaveBeenCalledWith(previousRequest);
    await waitFor(() => expect(finishPeople).toBeTypeOf("function"));
    await act(async () => { finishPeople?.({ ...read, peopleLoaded: true }); });
  }
  await waitFor(() => expect(loadScheduleHistory).toHaveBeenCalledWith(previousRequest));
  await waitFor(() => expect(loadScheduleHistory).toHaveBeenCalledWith(expect.objectContaining({
    range: { start: currentWeekDay(weekOffset + 7), end: currentWeekDay(weekOffset + 13) },
    scopes: [{ project: "p", work_item_type: "t", users: isPeople ? ["peer"] : [] }],
  })));
  await waitFor(() => expect(loadScheduleHistory).toHaveBeenCalledWith(expect.objectContaining({
    range: { start: currentWeekDay(weekOffset - 14), end: currentWeekDay(weekOffset - 8) },
    scopes: [{ project: "p", work_item_type: "t", users: isPeople ? ["peer"] : [] }],
  })));
  if (isPeople) expect(finishTeamCalendar).toBeTypeOf("function");
  const calendar = within(document.querySelector(".schedule-calendar") as HTMLElement);
  expect(calendar.queryByRole("button", { name: /旧周完成事项/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "上一周" }));
  fireEvent.click(calendar.getByRole("button", { name: /旧周完成事项.*历史开发/ }));
  expect(vi.mocked(loadScheduleHistory).mock.calls.filter(([request]) =>
    request.range.start === previousStart && request.scopes.some((scope) => scope.users.includes("peer")) === isPeople,
  )).toHaveLength(1);
  await waitFor(() => expect(loadScheduleHistory).toHaveBeenCalledWith(expect.objectContaining({
    range: { start: currentWeekDay(weekOffset - 21), end: currentWeekDay(weekOffset - 15) },
    scopes: [{ project: "p", work_item_type: "t", users: isPeople ? ["peer"] : [] }],
  })));
  expect(screen.queryByText("正在读取历史排期…")).toBeNull();
  expect(screen.getByRole("tab", { name: "已排期 (1)" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "待排期 (1)" })).toBeTruthy();
  const inspector = within(screen.getByLabelText("排期检查器"));
  if (view === "我的排期") {
    expect((inspector.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  } else {
    expect(inspector.queryByLabelText("开始日期")).toBeNull();
    expect(inspector.getByText(/共 4 个自然日/)).toBeTruthy();
  }
  fireEvent.click(within(document.querySelector(".schedule-week-nav") as HTMLElement).getByRole("button", { name: "本周" }));
  expect(calendar.queryByRole("button", { name: /旧周完成事项/ })).toBeNull();
  if (finishTeamCalendar) await act(async () => { finishTeamCalendar?.(); });
  if (weekOffset === 0) {
    const next = screen.getByRole("button", { name: "下一周" });
    fireEvent.click(next);
    await waitFor(() => expect(loadScheduleHistory).toHaveBeenCalledWith(expect.objectContaining({
      range: { start: currentWeekDay(14), end: currentWeekDay(20) },
      scopes: [{ project: "p", work_item_type: "t", users: isPeople ? ["peer"] : [] }],
    })));
    fireEvent.click(next);
    expect(calendar.getByRole("button", { name: /更远一周的安排/ })).toBeTruthy();
    await waitFor(() => expect(loadScheduleHistory).toHaveBeenCalledWith(expect.objectContaining({
      range: { start: currentWeekDay(28), end: currentWeekDay(34) },
      scopes: [{ project: "p", work_item_type: "t", users: isPeople ? ["peer"] : [] }],
    })));
    expect(vi.mocked(loadScheduleHistory).mock.calls.filter(([request]) =>
      request.range.start === currentWeekDay(14) && request.scopes.some((scope) => scope.users.includes("peer")) === isPeople,
    )).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "已排期 (1)" })).toBeTruthy();
  }
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("日历按真实节点去重，保留名称相同的不同节点", async () => {
  const read = data();
  const current = { ...read.targets[0], nodeName: "开发", dates: { start: currentWeekDay(0), end: currentWeekDay(2) } };
  read.targets = [current];
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  vi.mocked(loadScheduleHistory).mockResolvedValue({ people: [], complete: true, targets: [
    { ...current, id: "history:same-node", readOnlyReason: "仅供查看" },
    { ...current, id: "history:different-node", readOnlyReason: "仅供查看", identity: { ...current.identity, node: "other-node" } },
  ] });
  await setup();
  const calendar = document.querySelector(".schedule-calendar")!;
  await waitFor(() => expect(calendar.querySelectorAll(".schedule-bar")).toHaveLength(2));
  expect(calendar.querySelectorAll(".schedule-bar.is-readonly")).toHaveLength(1);
});

it("快速往返只补最终日期附近的缓存，后台预取最多同时两页", async () => {
  const releaseNeighbors = new Map<string, () => void>();
  const requestedStarts = () => vi.mocked(loadScheduleHistory).mock.calls.map(([request]) => request.range.start);
  vi.mocked(loadScheduleHistory).mockImplementation(async ({ range }) => {
    if (range.start === currentWeekDay(-7) || range.start === currentWeekDay(7)) {
      await new Promise<void>((resolve) => { releaseNeighbors.set(range.start, resolve); });
    }
    return { people: [], targets: [], complete: true };
  });
  await setup();
  await waitFor(() => expect(releaseNeighbors.size).toBe(2));
  expect(requestedStarts()).not.toContain(currentWeekDay(-14));
  expect(requestedStarts()).not.toContain(currentWeekDay(14));
  await act(async () => { for (const release of releaseNeighbors.values()) release(); });
  await waitFor(() => expect(requestedStarts()).toContain(currentWeekDay(14)));

  const next = screen.getByRole("button", { name: "下一周" });
  const previous = screen.getByRole("button", { name: "上一周" });
  vi.useFakeTimers();
  try {
    for (let i = 0; i < 5; i++) fireEvent.click(next);
    for (let i = 0; i < 4; i++) fireEvent.click(previous);
    expect(requestedStarts()).not.toContain(currentWeekDay(21));
    expect(requestedStarts()).not.toContain(currentWeekDay(35));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(requestedStarts()).toContain(currentWeekDay(21));
    expect(requestedStarts()).not.toContain(currentWeekDay(28));
    expect(requestedStarts()).not.toContain(currentWeekDay(35));
    const requestKeys = vi.mocked(loadScheduleHistory).mock.calls.map(([request]) => JSON.stringify(request));
    expect(new Set(requestKeys).size).toBe(requestKeys.length);
  } finally {
    vi.useRealTimers();
  }
});

it("快速切周时隔离迟到的日历结果并保留草稿", async () => {
  let finishFirst!: (result: ScheduleHistory) => void;
  let olderAttempts = 0;
  vi.mocked(loadScheduleHistory).mockImplementation(async ({ range }) => {
    if (range.start === currentWeekDay(-7)) return new Promise((resolve) => { finishFirst = resolve; });
    if (range.start === currentWeekDay(-14) && ++olderAttempts <= 2) throw new Error("offline");
    return { people: [], targets: [], complete: true };
  });
  await setup();
  const previous = screen.getByRole("button", { name: "上一周" });
  fireEvent.click(previous);
  expect(screen.getByText("正在读取历史排期…")).toBeTruthy();
  await waitFor(() => expect(finishFirst).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button", { name: /任务一/ }));
  fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: currentWeekDay(0) } });
  fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: currentWeekDay(0) } });
  expect(screen.getByText("本地草稿")).toBeTruthy();
  await waitFor(() => expect(olderAttempts).toBe(1));
  fireEvent.click(previous);
  const retry = await screen.findByRole("button", { name: "重试历史排期" });
  await act(async () => { finishFirst({ people: [], targets: [], complete: true }); });
  expect(screen.getByRole("button", { name: "重试历史排期" })).toBe(retry);
  fireEvent.click(retry);
  await screen.findByText("所选日期暂无可显示的安排");
  expect(screen.getByText("本地草稿")).toBeTruthy();
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
});

it("右侧日历失败不清空左侧事项，切周独立加载日期范围", async () => {
  vi.mocked(loadScheduleHistory).mockImplementation(async ({ range }) => {
    if (range.start === currentWeekDay(0)) throw new Error("offline");
    return { people: [], targets: [], complete: true };
  });
  await setup();
  await screen.findByRole("button", { name: "重试日历排期" });
  expect(screen.getByRole("tab", { name: "待排期 (1)" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "上一周" }));
  await screen.findByText("所选日期暂无可显示的安排");
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
});

it("左侧仍在加载或加载失败时，右侧已能显示排期和翻周", async () => {
  let failLeft!: (error: Error) => void;
  vi.mocked(loadScheduleSession).mockImplementation(() => new Promise((_, reject) => { failLeft = reject; }));
  const record = { ...data().targets[0], id: "history:boot", title: "先显示的日历事件",
    dates: { start: currentWeekDay(0), end: currentWeekDay(1) }, readOnlyReason: "排期仅供查看" };
  vi.mocked(loadScheduleHistory).mockResolvedValue({ people: [], targets: [record], complete: true, connection: "c" });
  render(<SchedulePage onGuardChange={vi.fn()} requestReload={vi.fn()} />);

  const calendar = within(document.querySelector(".schedule-calendar") as HTMLElement);
  expect(await calendar.findByRole("button", { name: /先显示的日历事件/ })).toBeTruthy();
  expect(screen.getByText("正在读取事项清单…")).toBeTruthy();
  expect(loadScheduleHistory).toHaveBeenCalledWith(expect.objectContaining({ range: { start: currentWeekDay(0), end: currentWeekDay(6) } }));
  await act(async () => { failLeft(new Error("offline")); });
  expect(screen.getByText(/读取事项安排失败.*可重新读取/)).toBeTruthy();
  expect(calendar.getByRole("button", { name: /先显示的日历事件/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "上一周" }));
  await waitFor(() => expect(loadScheduleHistory).toHaveBeenCalledWith(expect.objectContaining({ range: { start: currentWeekDay(-7), end: currentWeekDay(-1) } })));
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
});

it("已排期包含当前及多个历史未来周，定位与切周后计数、卡片和选择保持稳定", async () => {
  const read = data();
  read.targets = [
    { ...read.targets[0], dates: { start: currentWeekDay(0), end: currentWeekDay(0) } },
    { ...read.targets[0], id: "past", title: "过去安排", identity: { ...identity, node: "past" }, dates: { start: currentWeekDay(-14), end: currentWeekDay(-12) } },
    { ...read.targets[0], id: "future", title: "未来安排", identity: { ...identity, node: "future" }, dates: { start: currentWeekDay(21), end: currentWeekDay(23) } },
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  fireEvent.click(screen.getByRole("tab", { name: "已排期 (3)" }));
  const pool = document.querySelector(".schedule-pool-list") as HTMLElement;
  expect(within(pool).getByRole("button", { name: /任务一/ })).toBeTruthy();
  fireEvent.click(within(pool).getByRole("button", { name: /未来安排/ }));
  fireEvent.click(within(screen.getByLabelText("未来安排跨周排期操作")).getByRole("button", { name: /定位该周/ }));
  expect(screen.getByRole("tab", { name: "已排期 (3)" }).getAttribute("aria-selected")).toBe("true");
  expect(within(pool).getByRole("button", { name: /未来安排/ }).className).toContain("selected");
  expect(within(document.querySelector(".schedule-calendar") as HTMLElement).getByRole("button", { name: /未来安排/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "上一周" }));
  fireEvent.click(screen.getByRole("button", { name: "下一周" }));
  fireEvent.click(screen.getByRole("button", { name: "双周 14天" }));
  expect(screen.getByRole("tab", { name: "已排期 (3)" })).toBeTruthy();
  expect(within(pool).getAllByRole("button", { name: /任务一|过去安排|未来安排/ })).toHaveLength(3);
  expect(submitScheduleTargets).not.toHaveBeenCalled();
});

it("待排期空态仅反映左侧清单，切换日历范围不会重新读取左侧", async () => {
  const read = data();
  read.targets[0].dates = { start: currentWeekDay(0), end: currentWeekDay(1) };
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();

  const empty = screen.getByText("当前筛选下暂无待排期事项");
  fireEvent.click(screen.getByRole("button", { name: "双周 14天" }));
  expect(screen.getByText("当前筛选下暂无待排期事项")).toBe(empty);
  fireEvent.click(screen.getByRole("button", { name: "下一周" }));
  expect(screen.getByText("当前筛选下暂无待排期事项")).toBe(empty);
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
});

it("默认单周 7 天，支持切换双周 14 天（含双周跨界裁切与第 2 周拖拽落点）与『已排期』一键跳转定位", async () => {
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
  expect(screen.getByRole("tab", { name: "已排期 (2)" })).toBeTruthy();
  // 单周视图下第 2 周开始的事项不在当前 7 天视窗内
  expect(screen.queryByRole("button", { name: /跨双周右界任务/ })).toBeNull();

  // 切换到双周 14 天后，跨双周右界任务进入视窗（第 9 列至第 14 列，右端裁切显示 ›），且『已排期』数量锚定单周口径保持 2 不变
  fireEvent.click(screen.getByRole("button", { name: "双周 14天" }));
  expect(screen.getByRole("tab", { name: "已排期 (2)" })).toBeTruthy();
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

  const outsideTab = screen.getByRole("tab", { name: /已排期/ });
  fireEvent.click(outsideTab);
  const outsideCard = screen.getByRole("button", { name: /三周后专项/ });
  expect(outsideCard.querySelector(".schedule-current-node.is-pending")?.textContent).toBe("开发");
  expect(outsideCard.textContent).not.toContain("本人");
  expect(outsideCard.textContent).toContain(`${farStart} ~ ${farEnd}`);
  expect(outsideCard.getAttribute("draggable")).toBe("true");

  // 1. 点击卡片主体仅在右侧检查器选中该事项，不强制跳离当前周
  fireEvent.click(outsideCard);
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(farStart);
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(farEnd);
  expect(outsideCard.className).toContain("schedule-outside-item");

  // 2. 将已排期事项直接拖入当前周日历第 2 列（索引 1），保留其原本 3 天跨度
  const singleWeekHeaders = document.querySelectorAll(".schedule-days > div");
  fireEvent.dragStart(outsideCard, { dataTransfer: transfer });
  fireEvent.drop(singleWeekHeaders[1], { dataTransfer: transfer });
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(currentWeekDay(1));
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(currentWeekDay(3));
  expect(within(document.querySelector(".schedule-calendar") as HTMLElement).getByRole("button", { name: /三周后专项/ }).className).toContain("schedule-bar");

  // 3. 还原云端日期后回到已排期，点击『排入本周』一键排入当前周（保留 3 天跨度）
  fireEvent.click(screen.getByRole("button", { name: "还原云端日期" }));
  const outsideQuick = screen.getByLabelText("三周后专项跨周排期操作");
  fireEvent.click(within(outsideQuick).getByRole("button", { name: "排入本周" }));
  expect(within(document.querySelector(".schedule-calendar") as HTMLElement).getByRole("button", { name: /三周后专项/ }).className).toContain("schedule-bar");

  // 4. 还原后点击『定位该周 ↗』跳转到该事项所在周并在日历视窗中显示长条
  fireEvent.click(screen.getByRole("button", { name: "还原云端日期" }));
  fireEvent.click(within(screen.getByLabelText("三周后专项跨周排期操作")).getByRole("button", { name: /定位该周/ }));
  expect(within(document.querySelector(".schedule-calendar") as HTMLElement).getByRole("button", { name: /三周后专项/ }).className).toContain("schedule-bar");
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).value).toBe(farStart);
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(farEnd);
});

it("『仅看可排期』现代滑动开关过滤只读事项且不与人员排期串扰", async () => {
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

  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
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
  fireEvent.click(screen.getByRole("button", { name: /^展开待排池 \(\d+\)$/ }));
  expect(document.querySelector(".schedule-pending")).toBeTruthy();

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

  expect(screen.getByLabelText("今日问候").textContent).toContain("王小明");
  expect(screen.getByLabelText("今日问候").querySelector('img[src="https://example.com/me-avatar.png"]')).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /任务一/ }));
  const heading = document.querySelector(".schedule-editor-heading")!;
  expect(heading.querySelector("p")).toBeNull();
  const linkWrap = heading.querySelector(".schedule-editor-actions.detail-item-link");
  expect(linkWrap).toBeTruthy();
  const linkBtn = within(linkWrap as HTMLElement).getByRole("link", { name: /打开飞书事项/ });
  expect(linkBtn.getAttribute("title")).toBe("在浏览器打开飞书事项");

  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
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
  expect(document.querySelector(".schedule-scope")).toBeNull();
  expect(screen.queryByRole("combobox", { name: "筛选来源" })).toBeNull();
});

it("按需加载全员排期期间若重新读取新会话，旧会话迟到响应不会污染新会话", async () => {
  const sessionOne: ScheduleRead = { ...data(), sessionId: "s-old", peopleLoaded: false };
  const sessionTwo: ScheduleRead = {
    ...data(),
    sessionId: "s-new",
    peopleLoaded: true,
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
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  expect(loadSchedulePeople).toHaveBeenCalledWith("s-old");

  // 在旧请求完成前点击『重新读取』切换到新会话 s-new
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  expect(reload).toHaveBeenCalledWith(expect.objectContaining({ includePeople: true }));
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

  // 切换到『人员排期』时按需触发 loadSchedulePeople，完成后合并同事事项且不丢失本人未保存草稿
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  await waitFor(() => expect(loadSchedulePeople).toHaveBeenCalledWith("session"));
  expect(await screen.findByRole("button", { name: /李同事的开发节点/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: "核对并同步 (1)" })).toBeTruthy();
  expect(updateRead).toHaveBeenCalledWith(fullRead);

  // 组件卸载（如切回其他主导航页）时不销毁预加载会话
  unmount();
  expect(closeScheduleSession).not.toHaveBeenCalled();
});

it("我的排期和人员排期共用动作词简称及日期分轨，聚焦可查看全名", async () => {
  const read = data();
  const base = read.targets[0];
  read.targets = [
    { name: "联调与自测", order: 0, day: 3 },
    { name: "后端方案设计", order: 1, day: 0 },
    { name: "后端代码研发", order: 2, day: 3 },
    { name: "接口对接任务", order: 3, day: 5, endDay: 6 },
    { name: "需求分析阶段", order: 4, day: 2 },
    { name: "跨团队权限改造及旧版配置兼容迁移需求评审会议", order: 5, day: 1 },
  ].map(({ name, order, day, endDay = day }) => ({
    ...base,
    id: `node-${order}`,
    nodeName: name,
    nodeOrder: order,
    identity: { ...base.identity, node: `node-${order}` },
    dates: { start: currentWeekDay(day), end: currentWeekDay(endDay) },
  }));
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();

  const design = screen.getByRole("button", { name: /后端方案设计/ });
  const integration = screen.getByRole("button", { name: /联调与自测/ });
  const development = screen.getByRole("button", { name: /后端代码研发/ });
  const handoff = screen.getByRole("button", { name: /接口对接任务/ });
  expect(document.querySelectorAll(".schedule-row")).toHaveLength(1);
  expect(design.style.gridRow).toBe(integration.style.gridRow);
  expect(development.style.gridRow).toBe("2");
  expect(handoff.classList.contains("is-single-day-bar")).toBe(false);

  const initialPlacement = [development.style.gridColumn, development.style.gridRow];
  const longName = read.targets[5].nodeName;
  for (const viewName of ["我的排期", "人员排期"]) {
    fireEvent.click(screen.getByRole("button", { name: viewName }));
    const activeDevelopment = screen.getByRole("button", { name: /后端代码研发/ });
    expect([activeDevelopment.style.gridColumn, activeDevelopment.style.gridRow]).toEqual(initialPlacement);
    for (const [name, shortName] of [
      ["后端方案设计", "设计"],
      ["联调与自测", "联调"],
      ["后端代码研发", "研发"],
      ["接口对接任务", "对接"],
      ["需求分析阶段", "分析"],
      [longName, "评审"],
    ]) {
      const bar = screen.getByRole("button", { name: new RegExp(name) });
      expect(bar.querySelector(".schedule-bar-title")?.textContent).toBe(shortName);
    }
    const longBar = screen.getByRole("button", { name: new RegExp(longName) });
    fireEvent.focus(longBar);
    expect(document.querySelector(".schedule-popover-title")?.textContent).toBe(longName);
    fireEvent.blur(longBar);
  }
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

  // 待排期只收纳当前待安排节点；只读的已排期节点不进入侧栏。
  expect(screen.getByRole("tab", { name: "待排期 (1)" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "已排期 (0)" })).toBeTruthy();
  const pendingPool = document.querySelector(".schedule-pending")!;
  expect(pendingPool.textContent).toContain("灰度联调验收");
  expect(pendingPool.textContent).not.toContain("后端代码合入");
  expect(pendingPool.textContent).not.toContain("后端方案设计");
  expect(pendingPool.textContent).not.toContain("灰度和上线");

  // 2. 甘特图中同一事项在本周内的多个节点合并为唯一一横排，且重叠日期（day 1）自动分配到不同子轨道不互相遮挡
  const ganttRows = document.querySelectorAll(".schedule-row");
  expect(ganttRows).toHaveLength(1);
  expect(ganttRows[0].querySelector(".schedule-row-current")).toBeNull();
  const codeBar = screen.getByRole("button", { name: /核心架构演进专项 · 后端代码研发/ });
  const testBar = screen.getByRole("button", { name: /核心架构演进专项 · 联调与自测/ });
  expect(codeBar.querySelector(".schedule-bar-title")?.textContent).toBe("研发");
  expect(testBar.querySelector(".schedule-bar-title")?.textContent).toBe("联调");
  expect(codeBar.style.gridRow).toBe("1");
  expect(testBar.style.gridRow).toBe("2");
  expect(codeBar.getAttribute("draggable")).toBe("false");
  expect(testBar.getAttribute("draggable")).toBe("false");
  expect(codeBar.classList.contains("is-past-node")).toBe(true);

  // 3. 点击历史已流转节点在右侧检查器查看其只读状态，并通过『事项节点』切换器切换到当前可编辑节点
  fireEvent.click(codeBar);
  expect(screen.getByText("该节点已流转完成，排期仅供查看")).toBeTruthy();
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  const siblingGroup = screen.getByRole("group", { name: "事项节点" });
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
  expect(stageBar.querySelector(".schedule-bar-title")?.textContent).toBe("验收");
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
    const toast = screen.getByText("排期已同步").closest('[role="status"]')!;
    expect(toast.className).toContain("banner");
    expect(toast.className).toContain("success");
    expect(toast.className).toContain("workflow-toast");
    expect(toast.textContent).toContain("排期已同步");
    expect(toast.textContent).toContain("已保存 1 项节点排期");
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.queryByText("排期已同步")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("排期已同步")).toBeNull();

    // 2. 存在失败结果：展示持久的局部反馈（role="alert"），3 秒后仍不消失
    fireEvent.click(screen.getByRole("button", { name: /失败排期事项/ }));
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: currentWeekDay(4) } });
    vi.mocked(submitScheduleTargets).mockResolvedValueOnce({
      results: [{ id: "fail-target", result: "failed", message: "无权限修改" }],
      writeRequests: 1,
    });
    confirmSync();
    await act(async () => {});
    const alertBanner = screen.getByRole("alert");
    expect(alertBanner.className).toContain("schedule-feedback");
    expect(alertBanner.textContent).toContain("失败 1 项");
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("alert").textContent).toContain("失败 1 项");
  } finally {
    vi.useRealTimers();
  }
});

it("事项节点过滤无关无排期节点、按节点去重多人记录、并按最新时间在最上方倒序排列", async () => {
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
  const siblingGroup = screen.getByRole("group", { name: "事项节点" });
  expect(siblingGroup.querySelector(".schedule-sibling-label")?.textContent).toBe("事项节点（3）");

  const chips = Array.from(siblingGroup.querySelectorAll(".schedule-sibling-chip"));
  expect(chips).toHaveLength(3);
  expect(chips[0].querySelector("span")?.textContent).toBe("未排期");
  expect(siblingGroup.textContent).not.toMatch(/只读|当前可排|已流转/);
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

it("通用样式后加载仍保留排期概览两列、正常姓名字号及面板圆角裁切", async () => {
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
    const overview = document.querySelector(".schedule-overview")!;
    expect(getComputedStyle(overview).gridTemplateColumns).toBe("minmax(0, 1fr) auto");
    expect(getComputedStyle(screen.getByLabelText("今日问候").querySelector("strong")!).fontSize).toBe("14px");
    expect(Array.from(overview.children).map((child) => child.className)).toEqual([
      "schedule-greeting", "overview-actions schedule-overview-actions",
    ]);
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
        dates: { start: currentWeekDay(-1), end: currentWeekDay(1) },
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
    expect(rowLabel.querySelector(".schedule-current-node")?.textContent).toBe("前端代码开发");
    expect(rowEl.querySelectorAll(".schedule-lane-node")).toHaveLength(0);
    expect(rowEl.querySelectorAll(".schedule-bar-side-label")).toHaveLength(0);

    // 2. 短条保持紧凑，已流转与其他不可编辑节点统一实线，不重复展示锁标识。
    const envBar = screen.getByRole("button", { name: /排期节点辨识专项 · 前端环境准备/ });
    const prdBar = screen.getByRole("button", { name: /排期节点辨识专项 · 产品方案评审/ });
    const feBar = screen.getByRole("button", { name: /排期节点辨识专项 · 前端代码开发/ });
    expect(envBar.classList.contains("is-narrow-bar")).toBe(true);
    expect(envBar.classList.contains("is-single-day-bar")).toBe(false);
    expect(envBar.classList.contains("is-clipped-start")).toBe(true);
    expect(envBar.querySelector(".schedule-bar-clip")?.textContent).toBe("‹");
    expect(getComputedStyle(envBar.querySelector(".schedule-bar-badges") as HTMLElement).display).toBe("inline-flex");
    expect(getComputedStyle(envBar.querySelector(".schedule-bar-days") as HTMLElement).display).toBe("none");
    expect(envBar.querySelector(".schedule-bar-past-text")).toBeNull();

    expect(prdBar.classList.contains("is-single-day-bar")).toBe(true);
    expect(prdBar.classList.contains("is-past-node")).toBe(true);
    expect(feBar.classList.contains("is-narrow-bar")).toBe(true);
    expect(feBar.classList.contains("is-cloud")).toBe(true);
    expect(feBar.classList.contains("is-schedulable")).toBe(true);
    expect(prdBar.classList.contains("is-schedulable")).toBe(false);
    expect(prdBar.querySelector(".schedule-bar-state-icon")).toBeNull();
    expect(feBar.querySelector(".schedule-bar-state-icon")).toBeNull();
    expect(prdBar.querySelector(".schedule-bar-badge.is-past")).toBeNull();
    expect(prdBar.querySelector(".schedule-bar-badge.is-readonly")).toBeNull();

    const prdBadges = prdBar.querySelector(".schedule-bar-badges") as HTMLElement;
    const feDays = feBar.querySelector(".schedule-bar-days") as HTMLElement;
    const prdTitle = prdBar.querySelector(".schedule-bar-title") as HTMLElement;
    const feTitle = feBar.querySelector(".schedule-bar-title") as HTMLElement;
    expect(getComputedStyle(prdBadges).display).toBe("none");
    expect(getComputedStyle(feDays).display).toBe("none");
    expect(getComputedStyle(prdTitle).whiteSpace).toBe("nowrap");
    expect(getComputedStyle(prdBar).borderTopStyle).toBe("solid");
    expect(getComputedStyle(feBar).borderTopStyle).toBe("solid");
    expect(getComputedStyle(feTitle).fontWeight).toBe("600");
    expect(getComputedStyle(prdTitle).fontWeight).toBe("600");
    expect(getComputedStyle(prdTitle).color).toBe(getComputedStyle(feTitle).color);

    // 3. 悬停与键盘聚焦排期条时触发原位上浮完整卡片（靠近右边缘自动右对齐防溢出）
    fireEvent.mouseEnter(prdBar);
    const popover = document.querySelector(".schedule-bar-popover") as HTMLElement;
    expect(popover).toBeTruthy();
    expect(prdBar.hasAttribute("title")).toBe(false);
    expect(popover.classList.contains("is-align-right")).toBe(true);
    expect(popover.textContent).toContain("已流转");
    expect(popover.textContent).toContain("产品方案评审");
    expect(getComputedStyle(popover.querySelector(".schedule-popover-title")!).whiteSpace).toBe("normal");
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

    // 4. 2d 草稿条保留『已改』角标，双周视图的窄条优先给标题留空间。
    fireEvent.click(feBar);
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: currentWeekDay(1) } });
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: currentWeekDay(3) } });
    // 先把结束日期改为周三使之仍为 2d 草稿：开始周二、结束周三但与原 baseline 不同（把开始改为周三、结束周四）
    fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: currentWeekDay(2) } });
    const feBarDraft = screen.getByRole("button", { name: /排期节点辨识专项 · 前端代码开发/ });
    expect(feBarDraft.classList.contains("is-narrow-bar")).toBe(true);
    expect(feBarDraft.classList.contains("is-draft")).toBe(true);
    expect(getComputedStyle(feBarDraft.querySelector(".schedule-bar-badges") as HTMLElement).display).toBe("inline-flex");
    document.documentElement.dataset.appearance = "pearl";
    expect(getComputedStyle(feBarDraft).borderTopWidth).toBe("1.5px");
    expect(getComputedStyle(prdBar).borderTopStyle).toBe("solid");
    delete document.documentElement.dataset.appearance;

    fireEvent.click(screen.getByRole("button", { name: "双周 14天" }));
    const feBarBiweekly = screen.getByRole("button", { name: /排期节点辨识专项 · 前端代码开发/ });
    expect(feBarBiweekly.classList.contains("is-single-day-bar")).toBe(true);
    expect(getComputedStyle(feBarBiweekly.querySelector(".schedule-bar-badges") as HTMLElement).display).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
    expect(document.querySelector(".schedule-bar.is-schedulable")).toBeNull();
    for (const title of document.querySelectorAll(".schedule-bar-title")) {
      expect(getComputedStyle(title).whiteSpace).toBe("nowrap");
      expect(getComputedStyle(title).fontWeight).toBe("600");
      expect(getComputedStyle(title).color).toBe(getComputedStyle(feTitle).color);
    }
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

  // 选中当前用户的『后端方案设计』时，由于同事项下其余节点属于他人，『事项节点』不混入闫国强/刘悦然的节点
  fireEvent.click(screen.getByRole("button", { name: /操作日志页面中新增操作类型：发布后端方案设计/ }));
  expect(screen.queryByRole("group", { name: "事项节点" })).toBeNull();

  // 2. 切换到『人员排期』时，闫国强、刘悦然、施伟各自归入本人分组与独立行，绝不把闫国强的『产品方案设计』合并到刘悦然行内
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));
  const peopleFrontend = screen.getByRole("button", { name: /发布 · 前端方案设计/ }).closest(".schedule-row");
  const peopleProduct = screen.getByRole("button", { name: /发布 · 产品方案设计/ }).closest(".schedule-row");
  const peopleTesting = screen.getByRole("button", { name: /平台操作记录 · 需求测试/ }).closest(".schedule-row");
  expect(peopleFrontend).not.toBe(peopleProduct);
  for (const row of [peopleFrontend, peopleProduct, peopleTesting]) {
    expect(row?.querySelector(".schedule-row-current")).toBeNull();
  }
  fireEvent.click(screen.getByRole("button", { name: /发布 · 前端方案设计/ }));
  expect(screen.queryByRole("group", { name: "事项节点" })).toBeNull();

  // 3. 即便在账号未确认的回退只读模式（accountError）下展示全部目标，『我的排期』也按负责人分别成行，不把闫国强节点挂在刘悦然名下
  cleanup();
  const fallbackRead = {
    ...read,
    currentUserId: "",
    accountError: "未能确认当前飞书账号，请检查连接后重试",
  };
  vi.mocked(loadScheduleSession).mockResolvedValue(fallbackRead);
  await setup();
  const fallbackFrontend = screen.getByRole("button", { name: /发布 · 前端方案设计/ }).closest(".schedule-row");
  const fallbackProduct = screen.getByRole("button", { name: /发布 · 产品方案设计/ }).closest(".schedule-row");
  expect(fallbackFrontend).not.toBe(fallbackProduct);
  expect(fallbackFrontend?.querySelector(".schedule-row-current")).toBeNull();
});

it("人员排期的副标题、排期条及详情只显示当前行负责人的节点", async () => {
  const read = data();
  const base = read.targets[0];
  const dates = { start: currentWeekDay(0), end: currentWeekDay(0) };
  read.people = [{ id: "me", name: "前端同事" }, { id: "peer", name: "后端同事" }];
  read.targets = [
    { ...base, id: "frontend", nodeName: "前端研发", nodeStatus: "doing", dates },
    {
      ...base,
      id: "backend",
      nodeName: "后端研发",
      nodeStatus: "doing",
      identity: { ...identity, node: "backend", owner: "peer" },
      ownerId: "peer",
      ownerIds: ["peer"],
      mine: false,
      dates,
    },
    {
      ...base,
      id: "shared",
      nodeName: "共同联调",
      nodeStatus: "finished",
      identity: { ...identity, node: "shared", scope: "node", owner: undefined },
      ownerId: null,
      ownerIds: ["me", "peer"],
      dates,
    },
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  fireEvent.click(screen.getByRole("button", { name: "人员排期" }));

  for (const [mine, other] of [["前端研发", "后端研发"], ["后端研发", "前端研发"]]) {
    const row = screen.getByRole("button", { name: `任务一 · ${mine}` }).closest(".schedule-row") as HTMLElement;
    expect(row.querySelector(".schedule-row-current")?.getAttribute("title"))
      .toBe(`当前节点：${mine}`);
    expect(within(row).queryByRole("button", { name: `任务一 · ${other}` })).toBeNull();
    const sharedBar = within(row).getByRole("button", { name: "任务一 · 共同联调" });
    fireEvent.mouseEnter(sharedBar);
    expect(row.querySelector(".schedule-bar-popover")?.textContent).toContain("共同联调");
    expect(document.querySelectorAll(".schedule-bar-popover")).toHaveLength(1);
    fireEvent.mouseLeave(sharedBar);
    fireEvent.focus(sharedBar);
    expect(row.querySelector(".schedule-bar-popover")).toBeTruthy();
    expect(document.querySelectorAll(".schedule-bar-popover")).toHaveLength(1);
    fireEvent.blur(sharedBar);
    fireEvent.click(sharedBar);
    expect(row.classList.contains("selected")).toBe(true);
    const scope = within(screen.getByRole("group", { name: "事项节点" }));
    expect(scope.getByRole("button", { name: new RegExp(mine) })).toBeTruthy();
    expect(scope.queryByRole("button", { name: new RegExp(other) })).toBeNull();
  }
});

it("节点身份缺失时不把多条进行中记录合并成一个当前节点", async () => {
  const read = data();
  const base = read.targets[0];
  read.targets = [
    {
      ...base,
      nodeStatus: "finished",
      dates: { start: currentWeekDay(0), end: currentWeekDay(0) },
    },
    ...["节点甲", "节点乙"].map((nodeName) => ({
      ...base,
      id: nodeName,
      identity: { ...base.identity, node: "" },
      nodeName,
      nodeStatus: "doing",
    })),
  ];
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  await setup();
  const row = screen.getByRole("button", { name: "任务一 · 开发" }).closest(".schedule-row");
  expect(row).toBeTruthy();
  expect(row?.querySelector(".schedule-row-current")).toBeNull();
});

it("缓存确认事项已完成后，仍在当前排期会话中的行展示终态", async () => {
  const read = data();
  read.targets[0].nodeStatus = "doing";
  read.targets[0].dates = { start: currentWeekDay(0), end: currentWeekDay(0) };
  const snapshot = projectSnapshot(read);
  snapshot.items[0].is_completed = true;
  snapshot.items[0].status_name = "需求上线";
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  render(<SchedulePage snapshot={snapshot} onGuardChange={vi.fn()} requestReload={(reload) => reload()} />);
  const row = (await screen.findByRole("button", { name: "任务一 · 开发" })).closest(".schedule-row");
  expect(row?.querySelector(".schedule-row-current")?.textContent).toBe("需求上线");
  expect(row?.querySelector(".schedule-current-node")).toBeNull();
});
