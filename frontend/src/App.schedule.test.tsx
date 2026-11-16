// @vitest-environment jsdom
import { useEffect, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { loadSnapshot } from "./api";
import { closeScheduleSession, loadScheduleSession, resetScheduleSession, type ScheduleRead } from "./scheduleApi";
import type { ScheduleSessionController } from "./SchedulePage";

const desktopState = vi.hoisted(() => ({ value: false }));
vi.mock("./api", async (original) => {
  const actual = await original<typeof import("./api")>();
  return {
    ...actual,
    get desktop() {
      return desktopState.value;
    },
    loadSnapshot: vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      last_success: null,
      runs: [],
      sources: [],
      config_path: "",
      db_path: "",
      credential_ready: false,
      credential_description: "",
    }),
  };
});
vi.mock("./scheduleApi", () => ({
  loadScheduleSession: vi.fn(),
  closeScheduleSession: vi.fn().mockResolvedValue(undefined),
  resetScheduleSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./SchedulePage", () => ({ SchedulePage: ({ onGuardChange, preloadedSession }: { onGuardChange: (guard: { dirty: boolean; busy: boolean; uncertain: boolean }) => void; preloadedSession?: ScheduleSessionController }) => {
  const [guard, setGuard] = useState({ dirty: false, busy: false, uncertain: false });
  const [sessionId, setSessionId] = useState<string | null>(() => preloadedSession?.read?.sessionId || null);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => onGuardChange(guard), [guard, onGuardChange]);
  useEffect(() => {
    if (!preloadedSession || preloadedSession.read) return;
    const req = preloadedSession.pending ?? preloadedSession.reload();
    void req.then((res) => { setLoadFailed(false); setSessionId(res.sessionId); }, () => setLoadFailed(true));
  }, []);
  return <div><span>排期页面内容</span><span>当前显示会话:{preloadedSession?.read?.sessionId}</span>{preloadedSession?.refreshError && <span>{preloadedSession.refreshError}</span>}{sessionId && <span>已复用预加载会话:{sessionId}</span>}{loadFailed && <span>读取出错</span>}<button onClick={() => setGuard({ dirty: true, busy: false, uncertain: false })}>模拟编辑</button><button onClick={() => setGuard({ dirty: true, busy: true, uncertain: false })}>模拟同步</button><button onClick={() => setGuard({ dirty: true, busy: false, uncertain: true })}>模拟不确定结果</button><button onClick={() => void preloadedSession?.reload({ includePeople: false, forceReset: true }).then((res) => { setLoadFailed(false); setSessionId(res.sessionId); }, () => setLoadFailed(true))}>模拟出错后重新读取</button><button onClick={() => preloadedSession?.updateRead({ sessionId: "stale-closed", currentUserId: "me", peopleLoaded: false, readAt: "", complete: true, sources: [], people: [], targets: [] })}>模拟过期更新</button></div>;
} }));
beforeEach(() => {
  vi.mocked(loadSnapshot).mockReset().mockResolvedValue({ items: [], total: 0, last_success: null, runs: [], sources: [], config_path: "", db_path: "", credential_ready: false, credential_description: "" });
  vi.mocked(closeScheduleSession).mockReset().mockResolvedValue();
  vi.mocked(resetScheduleSession).mockReset().mockResolvedValue();
  vi.mocked(loadScheduleSession).mockReset();
});
afterEach(() => { desktopState.value = false; cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

it("导航离开前保留编辑，明确放弃后才能离开", async () => {
  render(<App />); const entry = await screen.findByText("事项安排"); expect(entry.hidden).toBe(false); expect(getComputedStyle(entry).display).not.toBe("none"); fireEvent.click(entry);
  await screen.findByText("排期页面内容"); fireEvent.click(screen.getByText("模拟编辑"));
  fireEvent.click(screen.getByRole("button", { name: /工作来源/ }));
  const dialog = screen.getByRole("dialog");
  expect(dialog.textContent).toContain("未同步的编辑内容即将丢失");
  const backdrop = dialog.closest(".schedule-dialog-backdrop")!;
  expect(backdrop.classList.contains("scroll-isolation-boundary")).toBe(true);
  const wheel = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
  backdrop.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
  expect(screen.getByText("排期页面内容")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /工作来源/ }));
  fireEvent.click(screen.getByRole("button", { name: "放弃并继续" }));
  await waitFor(() => expect(screen.queryByText("排期页面内容")).toBeNull());
});
it("同步在途时阻止导航和关闭", async () => {
  render(<App />); const entry = await screen.findByText("事项安排"); expect(entry.hidden).toBe(false); expect(getComputedStyle(entry).display).not.toBe("none"); fireEvent.click(entry);
  await screen.findByText("排期页面内容"); fireEvent.click(screen.getByText("模拟同步"));
  const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /工作来源/ }));
  expect(screen.getByRole("dialog").textContent).toContain("排期正在同步，请等待本次结果");
  expect(screen.queryByRole("button", { name: "放弃并继续" })).toBeNull();
});

it("同步期间的提示在结束后不能变成空的放弃操作并清除保护", async () => {
  render(<App />); const entry = await screen.findByText("事项安排"); expect(entry.hidden).toBe(false); expect(getComputedStyle(entry).display).not.toBe("none"); fireEvent.click(entry);
  fireEvent.click(await screen.findByText("模拟同步"));
  fireEvent.click(screen.getByRole("button", { name: /工作来源/ }));
  fireEvent.click(screen.getByText("模拟不确定结果"));
  expect(screen.queryByRole("button", { name: "放弃并继续" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "知道了" }));
  const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /工作来源/ }));
  expect(screen.getByRole("dialog").textContent).toContain("部分排期可能已保存");
  expect(screen.getByRole("button", { name: "放弃并继续" })).toBeTruthy();
});

it("桌面凭证就绪后后台预加载本人排期，首次进入与跨页签往返直接复用会话", async () => {
  desktopState.value = true;
  vi.mocked(loadSnapshot).mockResolvedValueOnce({
    items: [],
    total: 0,
    last_success: null,
    runs: [],
    sources: [],
    config_path: "cfg",
    db_path: "db",
    credential_ready: true,
    credential_description: "已配置",
  });
  const preloaded: ScheduleRead = {
    sessionId: "preloaded-1",
    currentUserId: "me",
    peopleLoaded: false,
    readAt: "2026-11-15 01:00:00",
    complete: true,
    sources: [],
    people: [],
    targets: [],
  };
  vi.mocked(loadScheduleSession).mockResolvedValue(preloaded);

  render(<App />);
  await waitFor(() => expect(loadScheduleSession).toHaveBeenCalledWith({ includePeople: false }));
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);

  const entry = await screen.findByText("事项安排");
  fireEvent.click(entry);
  expect(await screen.findByText("已复用预加载会话:preloaded-1")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /我的工作/ }));
  expect(closeScheduleSession).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText("事项安排"));
  expect(await screen.findByText("已复用预加载会话:preloaded-1")).toBeTruthy();
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
});

it("启动预加载后五分钟才后台补读，聚焦与进入页面复用在途读取，草稿期间暂缓", async () => {
  desktopState.value = true;
  let now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const interval = vi.spyOn(window, "setInterval");
  vi.mocked(loadSnapshot).mockResolvedValueOnce({ items: [], total: 0, last_success: null, runs: [], sources: [], config_path: "cfg", db_path: "db", credential_ready: true, credential_description: "已配置" });
  const read: ScheduleRead = { sessionId: "fresh", currentUserId: "me", peopleLoaded: false, readAt: "刚刚", complete: true, sources: [], people: [], targets: [] };
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  render(<App />);
  await waitFor(() => expect(loadScheduleSession).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(interval.mock.calls.some(([, delay]) => delay === 300_000)).toBe(true));
  now += 60_000;
  fireEvent(window, new Event("focus"));
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("事项安排"));
  expect(await screen.findByText("已复用预加载会话:fresh")).toBeTruthy();
  let finish!: (read: ScheduleRead) => void;
  vi.mocked(loadScheduleSession).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  now += 240_000;
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(loadScheduleSession).toHaveBeenCalledTimes(2));
  fireEvent(window, new Event("focus"));
  expect(loadScheduleSession).toHaveBeenCalledTimes(2);
  expect(screen.getByText("已复用预加载会话:fresh")).toBeTruthy();
  finish({ ...read, sessionId: "refreshed" });
  await waitFor(() => expect(closeScheduleSession).toHaveBeenCalled());
  fireEvent.click(screen.getByText("模拟编辑"));
  now += 300_000;
  fireEvent(window, new Event("focus"));
  expect(loadScheduleSession).toHaveBeenCalledTimes(2);
});

it.each(["partial", "account", "rejected"])("后台刷新 %s 保留上次快照，下一次重读关闭实际后端会话后恢复", async (failure) => {
  desktopState.value = true;
  let now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.mocked(loadSnapshot).mockResolvedValueOnce({ items: [], total: 0, last_success: null, runs: [], sources: [], config_path: "cfg", db_path: "db", credential_ready: true, credential_description: "已配置" });
  const read: ScheduleRead = { sessionId: "old", currentUserId: "me", peopleLoaded: false, readAt: "上次读取", complete: true, sources: [{ id: "todo", name: "待办", complete: true }], people: [], targets: [] };
  vi.mocked(loadScheduleSession).mockResolvedValueOnce(read);
  render(<App />);
  await waitFor(() => expect(loadScheduleSession).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText("事项安排"));
  await screen.findByText("当前显示会话:old");
  if (failure === "rejected") vi.mocked(loadScheduleSession).mockRejectedValueOnce({ kind: "connection" });
  else vi.mocked(loadScheduleSession).mockResolvedValueOnce({ ...read, sessionId: "partial-backend", complete: failure === "account", accountError: failure === "account" ? "无法确认账号" : null, sources: [{ id: "todo", name: "待办", complete: false, error: "分页未完成" }] });
  now += 300_000;
  fireEvent(window, new Event("focus"));
  await screen.findByText(/已保留上次内容/);
  expect(screen.getByText("当前显示会话:old")).toBeTruthy();
  vi.mocked(loadScheduleSession).mockResolvedValueOnce({ ...read, sessionId: "recovered" });
  // 失败后快照仍然过期：一分钟后重新聚焦应恢复，而非再等五分钟。
  now += 60_000;
  fireEvent(window, new Event("focus"));
  await screen.findByText("当前显示会话:recovered");
  const previous = vi.mocked(closeScheduleSession).mock.calls.at(-1)![0];
  expect((await previous).sessionId).toBe(failure === "rejected" ? "old" : "partial-backend");
  expect(screen.queryByText(/已保留上次内容/)).toBeNull();
});

it("后台预加载尚在途时进入事项安排直接复用同一未决 Promise，且放弃不确定状态后自动失效旧会话", async () => {
  desktopState.value = true;
  vi.mocked(loadSnapshot).mockResolvedValueOnce({
    items: [],
    total: 0,
    last_success: null,
    runs: [],
    sources: [],
    config_path: "cfg",
    db_path: "db",
    credential_ready: true,
    credential_description: "已配置",
  });
  let resolvePreload!: (value: ScheduleRead) => void;
  vi.mocked(loadScheduleSession)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePreload = resolve;
        }),
    )
    .mockResolvedValueOnce({
      sessionId: "fresh-after-uncertain",
      currentUserId: "me",
      peopleLoaded: false,
      readAt: "2026-11-15 01:05:00",
      complete: true,
      sources: [],
      people: [],
      targets: [],
    });

  render(<App />);
  await waitFor(() => expect(loadScheduleSession).toHaveBeenCalledTimes(1));

  // 预加载 Promise 尚未 resolve 时立即点击进入『事项安排』，必须复用 in-flight Promise，不二次调用或关闭
  fireEvent.click(await screen.findByText("事项安排"));
  await screen.findByText("排期页面内容");
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
  expect(closeScheduleSession).not.toHaveBeenCalled();

  resolvePreload({
    sessionId: "in-flight-1",
    currentUserId: "me",
    peopleLoaded: false,
    readAt: "2026-11-15 01:00:00",
    complete: true,
    sources: [],
    people: [],
    targets: [],
  });
  expect(await screen.findByText("已复用预加载会话:in-flight-1")).toBeTruthy();

  // 产生 uncertain 结果后离开并确认『放弃并继续』，应关闭并清理旧缓存会话；再次进入时重新拉取干净会话
  fireEvent.click(screen.getByText("模拟不确定结果"));
  fireEvent.click(screen.getByRole("button", { name: /工作来源/ }));
  fireEvent.click(screen.getByRole("button", { name: "放弃并继续" }));
  await waitFor(() => expect(closeScheduleSession).toHaveBeenCalledTimes(1));

  fireEvent.click(screen.getByText("事项安排"));
  expect(await screen.findByText("已复用预加载会话:fresh-after-uncertain")).toBeTruthy();
  expect(loadScheduleSession).toHaveBeenCalledTimes(2);
});

it("首屏快照加载完成前提前点击事项安排发起的会话不会被快照完成后的预加载打断", async () => {
  desktopState.value = true;
  let resolveSnapshot!: (value: Awaited<ReturnType<typeof loadSnapshot>>) => void;
  vi.mocked(loadSnapshot).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveSnapshot = resolve;
      }),
  );
  vi.mocked(loadScheduleSession).mockResolvedValue({
    sessionId: "early-session-1",
    currentUserId: "me",
    peopleLoaded: false,
    readAt: "2026-11-15 01:10:00",
    complete: true,
    sources: [],
    people: [],
    targets: [],
  });

  render(<App />);
  // 此时 loadSnapshot 尚未完成，用户直接点击『事项安排』由 SchedulePage 发起 reload
  fireEvent.click(await screen.findByText("事项安排"));
  expect(await screen.findByText("已复用预加载会话:early-session-1")).toBeTruthy();
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);

  // 随后首屏快照返回，预加载指纹对齐当前会话，不得关闭或重复请求
  resolveSnapshot({
    items: [],
    total: 0,
    last_success: null,
    runs: [],
    sources: [{ id: "s1", kind: "personal_todo", enabled: true, executable: true, reason: null, action: "todo", todo_scope: "in_progress" }],
    config_path: "cfg",
    db_path: "db",
    credential_ready: true,
    credential_description: "已配置",
  });
  await waitFor(() => expect(screen.getByText("已复用预加载会话:early-session-1")).toBeTruthy());
  expect(loadScheduleSession).toHaveBeenCalledTimes(1);
  expect(closeScheduleSession).not.toHaveBeenCalled();
});

it("后台预加载遇残留干净会话冲突时自动非强制重置恢复，过期会话 updateRead 不覆盖当前会话", async () => {
  desktopState.value = true;
  vi.mocked(loadSnapshot).mockResolvedValueOnce({
    items: [],
    total: 0,
    last_success: null,
    runs: [],
    sources: [],
    config_path: "cfg",
    db_path: "db",
    credential_ready: true,
    credential_description: "已配置",
  });
  const recovered: ScheduleRead = {
    sessionId: "recovered-1",
    currentUserId: "me",
    peopleLoaded: false,
    readAt: "2026-11-15 02:00:00",
    complete: true,
    sources: [],
    people: [],
    targets: [],
  };
  vi.mocked(loadScheduleSession)
    .mockRejectedValueOnce({ kind: "conflict", message: "请先结束当前排期会话，再重新读取" })
    .mockResolvedValueOnce(recovered);

  render(<App />);
  await waitFor(() => expect(resetScheduleSession).toHaveBeenCalledWith({ force: false }));
  await waitFor(() => expect(loadScheduleSession).toHaveBeenCalledTimes(2));

  fireEvent.click(await screen.findByText("事项安排"));
  expect(await screen.findByText("已复用预加载会话:recovered-1")).toBeTruthy();

  // 过期 sessionId 的 updateRead 不得覆盖已激活的 recovered-1
  fireEvent.click(screen.getByText("模拟过期更新"));
  fireEvent.click(screen.getByRole("button", { name: /我的工作/ }));
  fireEvent.click(screen.getByText("事项安排"));
  expect(await screen.findByText("已复用预加载会话:recovered-1")).toBeTruthy();
});

it("非强制重置遇阻塞/不确定会话失败时不静默强清，用户出错后点击重新读取可强制恢复", async () => {
  desktopState.value = true;
  vi.mocked(loadSnapshot).mockResolvedValueOnce({
    items: [],
    total: 0,
    last_success: null,
    runs: [],
    sources: [],
    config_path: "cfg",
    db_path: "db",
    credential_ready: true,
    credential_description: "已配置",
  });
  vi.mocked(loadScheduleSession)
    .mockRejectedValueOnce({ kind: "conflict", message: "请先结束当前排期会话，再重新读取" })
    .mockRejectedValueOnce({ kind: "conflict", message: "请先结束当前排期会话，再重新读取" })
    .mockResolvedValueOnce({
      sessionId: "forced-1",
      currentUserId: "me",
      peopleLoaded: false,
      readAt: "2026-11-15 02:05:00",
      complete: true,
      sources: [],
      people: [],
      targets: [],
    });
  vi.mocked(resetScheduleSession)
    .mockRejectedValueOnce({ kind: "conflict", message: "当前排期存在未确认结果，请先在飞书核对并重新读取" })
    .mockRejectedValueOnce({ kind: "conflict", message: "当前排期存在未确认结果，请先在飞书核对并重新读取" })
    .mockResolvedValueOnce(undefined);

  render(<App />);
  await waitFor(() => expect(resetScheduleSession).toHaveBeenCalledWith({ force: false }));

  fireEvent.click(await screen.findByText("事项安排"));
  expect(await screen.findByText("读取出错")).toBeTruthy();
  expect(resetScheduleSession).not.toHaveBeenCalledWith({ force: true });

  fireEvent.click(screen.getByText("模拟出错后重新读取"));
  await waitFor(() => expect(resetScheduleSession).toHaveBeenCalledWith({ force: true }));
  expect(await screen.findByText("已复用预加载会话:forced-1")).toBeTruthy();
});
