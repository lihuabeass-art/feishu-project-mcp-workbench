// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { loadScheduleSession } from "./scheduleApi";
import { SchedulePage } from "./SchedulePage";
import { useScheduleProfiles } from "./useScheduleProfiles";

const ipc = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: ipc.invoke, Channel: class { onmessage?: (batch: unknown) => void } }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); ipc.invoke.mockReset(); });

it("慢事项在途时逐项显示，人员资料独立补齐且同一成员只查询一次", async () => {
  vi.stubGlobal("__TAURI_INTERNALS__", { transformCallback: () => {} });
  let deliver!: (value: unknown) => void;
  let finish!: (value: unknown) => void;
  let resolveProfile!: (value: unknown) => void;
  ipc.invoke.mockImplementation((command, args) => {
    if (command === "load_schedule_session") {
      deliver = (value) => args.onProgress.onmessage(value);
      return new Promise((resolve) => { finish = resolve; });
    }
    if (command === "load_schedule_profiles") return args.cachedOnly ? Promise.resolve([]) : new Promise((resolve) => { resolveProfile = resolve; });
    if (command === "load_schedule_calendar") return Promise.resolve({ complete: true, targets: [], current_user: "me" });
    if (command === "load_schedule_defects") return Promise.resolve({ defects: [], failed_projects: [] });
    return Promise.resolve(null);
  });
  const request = loadScheduleSession({ includePeople: true });
  const page = render(<SchedulePage peopleCacheContext="scope" calendarContext="c" viewMode="people"
    preloadedSession={{ pending: request, progressRequest: request, read: null, updateRead: vi.fn(), reload: () => request }}
    onGuardChange={vi.fn()} requestReload={(reload) => reload()} />);
  const row = (id: string) => ({ id, identity: { connection: "c", project: "p", type: "story", item: id, node: "node", scope: "personal", owner: "peer" },
    title: id, node_name: "开发", node_status: "doing", owners: [{ id: "peer", name: "peer" }],
    people_only: true, sources: ["team"], baseline: { start: "", end: "" } });
  const batch = (id: string) => ({ current_user: "me", connection: "c", targets: [row(id)] });
  act(() => deliver(batch("先读到的事项")));
  expect((await screen.findAllByText("先读到的事项")).length).toBeGreaterThan(0);
  await waitFor(() => expect(resolveProfile).toBeTypeOf("function"));
  act(() => deliver(batch("随后读到的事项")));
  expect((await screen.findAllByText("随后读到的事项")).length).toBeGreaterThan(0);
  await act(async () => resolveProfile([{ id: "peer", name: "林晓", avatar: "https://example.org/peer.png" }]));
  expect((await screen.findAllByText("林晓")).length).toBeGreaterThan(0);
  expect(page.container.querySelector('img[src="https://example.org/peer.png"]')).toBeTruthy();
  expect(ipc.invoke.mock.calls.filter(([command, args]) => command === "load_schedule_profiles" && !args.cachedOnly && args.ids.includes("peer"))).toHaveLength(1);
  await act(async () => finish({ session_id: "done", connection: "c", current_user: "me", current_user_name: "本人",
    people_loaded: true, read_at_ms: Date.now(), sources: [{ id: "team", complete: true }], failed_items: 0,
    targets: [row("先读到的事项"), row("随后读到的事项")] }));
  expect(screen.getAllByText("林晓").length).toBeGreaterThan(0);
});

it("人员资料遇到断网后重新联网会补查，换账号后丢弃旧结果", async () => {
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const people = [{ connection: "c", project: "p", id: "a", name: "a" }];
  let late!: (value: unknown) => void;
  const remote = vi.fn().mockImplementationOnce(() => Promise.reject(new Error("offline")))
    .mockImplementationOnce(() => new Promise((resolve) => { late = resolve; }))
    .mockResolvedValue([{ id: "a", name: "新账号人员" }]);
  ipc.invoke.mockImplementation((_command, args) => args.cachedOnly ? Promise.resolve([{ id: "a", name: "缓存成员" }]) : remote());
  try {
    const hook = renderHook(({ user }) => useScheduleProfiles("workspace", "c", user, people), { initialProps: { user: "first" } });
    await waitFor(() => expect(hook.result.current?.get("a")?.name).toBe("缓存成员"));
    expect(remote).not.toHaveBeenCalled();
    online.mockReturnValue(true);
    act(() => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(remote).toHaveBeenCalledTimes(1));
    act(() => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(late).toBeTypeOf("function"));
    hook.rerender({ user: "second" });
    await waitFor(() => expect(hook.result.current?.get("a")?.name).toBe("新账号人员"));
    await act(async () => late([{ id: "a", name: "旧账号人员" }]));
    expect(hook.result.current?.get("a")?.name).toBe("新账号人员");
  } finally { online.mockRestore(); }
});
