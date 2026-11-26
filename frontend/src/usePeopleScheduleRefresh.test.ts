// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { refreshSchedulePeopleItem, type SchedulePeopleItem } from "./scheduleApi";
import { peopleScheduleItemKey, scheduleChangedItemKey, usePeopleScheduleRefresh, type PeopleSchedulePatch } from "./usePeopleScheduleRefresh";

vi.mock("./scheduleApi", () => ({ refreshSchedulePeopleItem: vi.fn(), discoverSchedulePeopleItems: vi.fn() }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });

const item = (number: string): SchedulePeopleItem => ({
  id: { project_key: "space", work_item_type_key: "story", work_item_id: number }, sources: ["associated"],
});
const first = item("1");
const second = item("2");
const firstKey = peopleScheduleItemKey("c", first.id);
const secondKey = peopleScheduleItemKey("c", second.id);
const complete: PeopleSchedulePatch = { targets: [], people: [], closed: true, complete: true };

function setup() {
  vi.useFakeTimers();
  const input = { scope: "scope", connection: "c", user: "me", active: true, checkedAt: Date.now(),
    failedKeys: new Set<string>(), scopes: [], items: new Map([[firstKey, first], [secondKey, second]]),
    selected: first, protectedKeys: new Set<string>(), changes: new Map<string, number>(),
  };
  const hook = renderHook(usePeopleScheduleRefresh, { initialProps: input });
  return { ...hook, input };
}

it("单事项结果在操作开始后延迟应用，其他事项仍可独立读取和收尾", async () => {
  let finish!: (value: PeopleSchedulePatch) => void;
  vi.mocked(refreshSchedulePeopleItem).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
    .mockResolvedValueOnce(complete);
  const { result, input, rerender } = setup();
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  rerender({ ...input, protectedKeys: new Set([firstKey]), changes: new Map([[scheduleChangedItemKey(second.id), 1]]) });
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(refreshSchedulePeopleItem).toHaveBeenNthCalledWith(2, "c", "me", second);
  expect(result.current.patches?.get(secondKey)).toEqual(complete);
  await act(async () => finish({ ...complete, complete: false }));
  expect(result.current.patches?.has(firstKey)).toBe(false);
  rerender(input);
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(result.current.patches?.get(firstKey)).toEqual({ ...complete, complete: false });
});

it("写前迟到结果丢弃，单事项权限失败不占用整体提示并保留其他结果", async () => {
  let finish!: (value: PeopleSchedulePatch) => void;
  vi.mocked(refreshSchedulePeopleItem).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
    .mockRejectedValueOnce({ kind: "permission", message: "detail" }).mockResolvedValueOnce(complete);
  const { result, input, rerender } = setup();
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  const changes = new Map([[scheduleChangedItemKey(first.id), 1], [scheduleChangedItemKey(second.id), 1]]);
  rerender({ ...input, changes });
  await act(async () => finish(complete));
  expect(result.current.patches).toBeUndefined();
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(result.current.issue).toBeUndefined();
  rerender({ ...input, changes, selected: second });
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(result.current.issue).toBeUndefined();
  expect(result.current.patches?.get(secondKey)).toEqual(complete);
  expect(result.current.patches?.has(firstKey)).toBe(false);
});

it("单事项部分读取失败时保留最近一次完整结果", async () => {
  vi.mocked(refreshSchedulePeopleItem).mockResolvedValueOnce(complete)
    .mockResolvedValueOnce({ ...complete, complete: false });
  const { result, input, rerender } = setup();
  await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
  rerender({ ...input, changes: new Map([[scheduleChangedItemKey(first.id), 1]]) });
  await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
  expect(result.current.patches?.get(firstKey)).toEqual(complete);
});
