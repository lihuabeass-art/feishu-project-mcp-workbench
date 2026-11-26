// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { cachedItemDetail, refreshItemDetail } from "./api";
import { createScheduleCalendarCache, scheduleItemKey, useScheduleCalendar, useScheduleItemContexts } from "./scheduleHistory";
import { loadScheduleHistory, readCachedScheduleHistory, type ScheduleHistory } from "./scheduleApi";
import { sortScheduleCurrentNodes } from "./scheduleNodeOrder";
import { HISTORICAL_SCHEDULE_INTERVAL } from "./useScheduleRevalidation";
import type { ItemDetail } from "./types";

vi.mock("./api", () => ({ cachedItemDetail: vi.fn(), refreshItemDetail: vi.fn() }));
vi.mock("./scheduleApi", () => ({ loadScheduleHistory: vi.fn(), readCachedScheduleHistory: vi.fn() }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });
const keyFor = (item: string) => scheduleItemKey({ connection: "c", project: "p", type: "story", item, node: "n", scope: "node" });
const detail = (item: string, name?: string): ItemDetail => ({
  id: { project_key: "p", work_item_type_key: "story", work_item_id: item }, fetched_at_ms: 1, pages: [], data: {
    work_item_attribute: { finish_status: !name, work_item_status: "需求上线" }, work_item_fields: [],
    work_item_current_node: name ? [{ id: "n", name, owners: [{ key: "person", name: "负责人甲" }] }] : [],
  },
});

it("日历本机页与网络读取并发，离线时保留最近一次确认的页", async () => {
  const request = { cachePeople: true, connection: "c", currentUser: "me", scopes: [],
    range: { start: "2026-11-23", end: "2026-11-29" } };
  const cached: ScheduleHistory = { connection: "c", complete: true,
    targets: [], people: [{ id: "peer", name: "上次读取人员" }] };
  let finishCache!: (value: ScheduleHistory) => void;
  let fail!: (reason: Error) => void;
  vi.mocked(readCachedScheduleHistory).mockImplementationOnce(() => new Promise((resolve) => { finishCache = resolve; }));
  vi.mocked(loadScheduleHistory).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
  const hook = renderHook(() => useScheduleCalendar(JSON.stringify(["context", request]), []));
  await waitFor(() => expect(loadScheduleHistory).toHaveBeenCalledWith(request));
  expect(readCachedScheduleHistory).toHaveBeenCalledWith(request);
  await act(async () => finishCache(cached));
  expect(hook.result.current.data).toBe(cached);
  expect(hook.result.current.loading).toBe(true);
  await act(async () => fail(new Error("offline")));
  expect(hook.result.current.failed).toBe(true);
  expect(hook.result.current.data?.people).toBe(cached.people);
});

it("只补查当前历史周，同范围复用请求，部分失败保留已确认内容和时间", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(new Date("2026-11-26T02:00:00Z"));
  const base = { connection: "c", currentUser: "me", scopes: [] };
  const key = (start: string, end: string) => JSON.stringify(["account", { ...base, range: { start, end } }]);
  const first = key("2026-11-09", "2026-11-15");
  const second = key("2026-11-16", "2026-11-22");
  const complete: ScheduleHistory = { connection: "c", complete: true, targets: [], people: [{ id: "peer", name: "已确认人员" }] };
  let finish!: (value: ScheduleHistory) => void;
  vi.mocked(loadScheduleHistory).mockResolvedValueOnce(complete).mockResolvedValueOnce(complete)
    .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue(complete);
  const hook = renderHook(({ page, paused }) => useScheduleCalendar(page, [], HISTORICAL_SCHEDULE_INTERVAL, paused), {
    initialProps: { page: first, paused: false },
  });
  await act(async () => {});
  const original = hook.result.current.checkedAt;
  expect(original).toBe(Date.now());
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  hook.rerender({ page: second, paused: false });
  await act(async () => { await vi.advanceTimersByTimeAsync(75); });
  expect(loadScheduleHistory).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(HISTORICAL_SCHEDULE_INTERVAL - 60_075); });
  expect(loadScheduleHistory).toHaveBeenCalledTimes(2);
  hook.rerender({ page: first, paused: false });
  expect(hook.result.current.checkedAt).toBe(original);
  await act(async () => { await vi.advanceTimersByTimeAsync(75); });
  expect(loadScheduleHistory).toHaveBeenCalledTimes(3);
  const manual = hook.result.current.retry();
  await act(async () => { finish({ ...complete, complete: false, people: [{ id: "other", name: "未完整确认" }] }); await manual; });
  expect(loadScheduleHistory).toHaveBeenCalledTimes(3);
  expect(hook.result.current.data?.people).toEqual(complete.people);
  expect(hook.result.current.checkedAt).toBe(original);
  expect(hook.result.current.failed).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(loadScheduleHistory).toHaveBeenCalledTimes(3);
  await act(async () => { window.dispatchEvent(new Event("online")); });
  expect(loadScheduleHistory).toHaveBeenCalledTimes(4);
  expect(hook.result.current.failed).toBe(false);
  expect(hook.result.current.checkedAt).toBe(Date.now());
});

it("历史周读取返回时若已开始交互，保留当前快照并在交互结束后补查", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(new Date("2026-11-26T02:00:00Z"));
  const request = { connection: "c", currentUser: "me", scopes: [], range: { start: "2026-11-09", end: "2026-11-15" } };
  const key = JSON.stringify(["account", request]);
  const initial = { connection: "c", complete: true, targets: [], people: [{ id: "peer", name: "编辑前" }] };
  const changed = { ...initial, people: [{ id: "peer", name: "更新后" }] };
  let finish!: (value: ScheduleHistory) => void;
  vi.mocked(loadScheduleHistory).mockResolvedValueOnce(initial)
    .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue(changed);
  const hook = renderHook(({ paused }) => useScheduleCalendar(key, [], HISTORICAL_SCHEDULE_INTERVAL, paused), {
    initialProps: { paused: false },
  });
  await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(HISTORICAL_SCHEDULE_INTERVAL); });
  hook.rerender({ paused: true });
  await act(async () => { finish(changed); });
  expect(hook.result.current.data?.people).toEqual(initial.people);
  expect(loadScheduleHistory).toHaveBeenCalledTimes(2);
  hook.rerender({ paused: false });
  await act(async () => {});
  expect(loadScheduleHistory).toHaveBeenCalledTimes(3);
  expect(hook.result.current.data?.people).toEqual(changed.people);
});

it("离开事项安排再进入时复用未完成的日历读取与仍新鲜的缓存", async () => {
  const cache = createScheduleCalendarCache();
  const key = JSON.stringify(["account", { range: { start: "2026-11-09", end: "2026-11-15" }, scopes: [] }]);
  const read: ScheduleHistory = { connection: "c", complete: true, targets: [], people: [] };
  let finish!: (value: ScheduleHistory) => void;
  vi.mocked(loadScheduleHistory).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const mount = () => renderHook(() => useScheduleCalendar(key, [], HISTORICAL_SCHEDULE_INTERVAL, false, cache));
  const first = mount();
  await waitFor(() => expect(loadScheduleHistory).toHaveBeenCalledOnce());
  first.unmount();
  const second = mount();
  await act(async () => { finish(read); });
  expect(second.result.current.data).toBe(read);
  second.unmount();
  const third = mount();
  expect(third.result.current.data).toBe(read);
  await act(async () => {});
  expect(loadScheduleHistory).toHaveBeenCalledOnce();
});

it("历史独有事项重新补读失败时，旧缓存不能覆盖已由远端确认的节点和完成状态", async () => {
  const key = keyFor("i");
  const keys = new Set([key]);
  vi.mocked(cachedItemDetail).mockResolvedValue(detail("i"));
  vi.mocked(refreshItemDetail).mockResolvedValueOnce(detail("i", "需求测试")).mockRejectedValueOnce(new Error("offline"));
  const hook = renderHook(({ revision }) => useScheduleItemContexts("account", keys, revision), { initialProps: { revision: 1 } });
  await waitFor(() => expect(hook.result.current?.get(key)?.nodesVerified).toBe(true));
  expect(hook.result.current?.get(key)?.completedStatus).toBeNull();
  hook.rerender({ revision: 2 });
  await waitFor(() => expect(hook.result.current?.get(key)?.failed).toBe(true));
  expect(hook.result.current?.get(key)?.currentNodes?.map((node) => node.name)).toEqual(["需求测试"]);
  expect(hook.result.current?.get(key)?.completedStatus).toBeNull();
});

it("切换账号或事项后，旧节点读取的迟到返回不污染当前内容", async () => {
  let finishOld!: (result: ItemDetail) => void;
  vi.mocked(cachedItemDetail).mockResolvedValue(null);
  vi.mocked(refreshItemDetail).mockImplementation((id) => id.work_item_id === "old"
    ? new Promise((resolve) => { finishOld = resolve; }) : Promise.resolve(detail("new", "新事项节点")));
  const hook = renderHook(({ context, keys }) => useScheduleItemContexts(context, keys, 1), {
    initialProps: { context: "old-account", keys: new Set([keyFor("old")]) },
  });
  await waitFor(() => expect(refreshItemDetail).toHaveBeenCalledTimes(1));
  hook.rerender({ context: "new-account", keys: new Set([keyFor("new")]) });
  await waitFor(() => expect(hook.result.current?.get(keyFor("new"))?.nodesVerified).toBe(true));
  await act(async () => { finishOld(detail("old", "旧事项节点")); });
  expect(hook.result.current?.get(keyFor("old"))).toBeUndefined();
  expect(hook.result.current?.get(keyFor("new"))?.currentNodes?.[0].name).toBe("新事项节点");
});

it("缺少 ID 的同名并行节点按稳定负责人身份保序，重排后不交换且不合并重复节点", async () => {
  const key = keyFor("i");
  const keys = new Set([key]);
  const first = { name: "研发", owners: [{ key: "a", name: "甲" }] };
  const second = { name: "研发", owners: [{ key: "b", name: "乙" }] };
  const result = (nodes: Array<Record<string, unknown>>) => ({ ...detail("i", "研发"), data: {
    ...detail("i", "研发").data, work_item_current_node: nodes,
  } });
  vi.mocked(cachedItemDetail).mockResolvedValue(null);
  vi.mocked(refreshItemDetail).mockResolvedValueOnce(result([second, first, first]))
    .mockResolvedValueOnce(result([first, first, { ...second, owners: [{ key: "b", name: "乙（新）" }] }]));
  const hook = renderHook(({ revision }) => useScheduleItemContexts("account", keys, revision), { initialProps: { revision: 1 } });
  await waitFor(() => expect(hook.result.current?.get(key)?.nodesVerified).toBe(true));
  const identity = { connection: "c", project: "p", type: "story", item: "i", node: "n", scope: "node" as const };
  const sorted = () => sortScheduleCurrentNodes(hook.result.current!.get(key)!.currentNodes!, [], identity);
  expect(sorted().map((node) => node.owners[0].id)).toEqual(["a", "a", "b"]);
  const original = sorted().map((node) => node.id);
  expect(new Set(original).size).toBe(3);
  hook.rerender({ revision: 2 });
  await waitFor(() => expect(refreshItemDetail).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(sorted().find((node) => node.owners[0].id === "b")?.owners[0].name).toBe("乙（新）"));
  expect(sorted().map((node) => node.id)).toEqual(original);
});
