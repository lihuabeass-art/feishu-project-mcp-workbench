// @vitest-environment jsdom
import { useEffect, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { loadSnapshot } from "./api";
import { closeScheduleSession, loadScheduleSession, type ScheduleRead } from "./scheduleApi";
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
}));
vi.mock("./SchedulePage", () => ({ SchedulePage: ({ onGuardChange, preloadedSession }: { onGuardChange: (guard: { dirty: boolean; busy: boolean; uncertain: boolean }) => void; preloadedSession?: ScheduleSessionController }) => {
  const [guard, setGuard] = useState({ dirty: false, busy: false, uncertain: false });
  const [sessionId, setSessionId] = useState<string | null>(() => preloadedSession?.read?.sessionId || null);
  useEffect(() => onGuardChange(guard), [guard, onGuardChange]);
  useEffect(() => {
    if (!preloadedSession || preloadedSession.read) return;
    const req = preloadedSession.pending ?? preloadedSession.reload();
    void req.then((res) => setSessionId(res.sessionId));
  }, []);
  return <div><span>排期页面内容</span>{sessionId && <span>已复用预加载会话:{sessionId}</span>}<button onClick={() => setGuard({ dirty: true, busy: false, uncertain: false })}>模拟编辑</button><button onClick={() => setGuard({ dirty: true, busy: true, uncertain: false })}>模拟同步</button><button onClick={() => setGuard({ dirty: true, busy: false, uncertain: true })}>模拟不确定结果</button></div>;
} }));
afterEach(() => { desktopState.value = false; cleanup(); vi.clearAllMocks(); });

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
