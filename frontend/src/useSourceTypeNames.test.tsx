// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { refreshSourceTypes } from "./api";
import { applySourceTypeNames, useSourceTypeNames } from "./useSourceTypeNames";
import type { Snapshot, SourceTypeScope } from "./types";

vi.mock("./api", () => ({ refreshSourceTypes: vi.fn() }));
const scope = (name: string): SourceTypeScope => ({ configured: false, selected_count: 1, types: [
  { project_key: "space", project_name: "空间", type_key: "type", type_name: name, selected: true },
] });
const data = (): Snapshot => ({ items: [], total: 0, last_success: null, runs: [], credential_ready: true,
  credential_description: "凭证", config_path: "config", db_path: "cache",
  sources: [{ id: "a", kind: "personal_todo", enabled: true, executable: true, action: "todo",
    reason: null, todo_scope: "in_progress", type_scope: scope("旧名称") }] });
const response = (name: string) => ({ discovered_count: 1, failed: [] as [string, string][], type_scope: scope(name) });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { vi.resetAllMocks(); vi.mocked(refreshSourceTypes).mockResolvedValue(response("新名称")); });
afterEach(cleanup);

it("停用来源、无凭证和无法确定空间时不发自动请求", async () => {
  const snapshot = data();
  snapshot.sources.push({ ...snapshot.sources[0], id: "disabled", enabled: false });
  snapshot.sources.push({ ...snapshot.sources[0], id: "incomplete", executable: false });
  const onTypes = vi.fn();
  const { rerender } = renderHook(({ snapshot }) => useSourceTypeNames(snapshot, true, 0, onTypes), { initialProps: { snapshot } });
  await waitFor(() => expect(onTypes).toHaveBeenCalledOnce());
  expect(refreshSourceTypes).toHaveBeenCalledExactlyOnceWith("a");
  rerender({ snapshot: { ...snapshot, credential_ready: false } });
  const empty = data();
  empty.sources[0].type_scope!.types = [];
  rerender({ snapshot: empty });
  await act(async () => {});
  expect(refreshSourceTypes).toHaveBeenCalledOnce();
});

it("复用手动发现的在途请求，同步完成后串行再查并丢弃较早的结果", async () => {
  const first = deferred<ReturnType<typeof response>>();
  vi.mocked(refreshSourceTypes).mockReturnValueOnce(first.promise).mockResolvedValueOnce(response("同步后名称"));
  const onTypes = vi.fn();
  const { result } = renderHook(() => useSourceTypeNames(data(), true, 0, onTypes));
  await waitFor(() => expect(refreshSourceTypes).toHaveBeenCalledOnce());
  let manual!: ReturnType<typeof result.current.refresh>;
  act(() => {
    manual = result.current.refresh("a");
    result.current.afterSync(["a"]);
    result.current.afterSync(["a"]);
  });
  expect(refreshSourceTypes).toHaveBeenCalledOnce();
  await act(async () => { first.resolve(response("启动时名称")); await manual; });
  await waitFor(() => expect(onTypes).toHaveBeenCalledOnce());
  expect(refreshSourceTypes).toHaveBeenCalledTimes(2);
  expect(onTypes.mock.calls[0][1].types[0].type_name).toBe("同步后名称");
});

it("旧后端不自动发现，手动发现仍交给后端反馈凭证错误", async () => {
  const snapshot = data();
  snapshot.sources[0].type_scope = undefined;
  const onTypes = vi.fn();
  const { result, rerender } = renderHook(({ snapshot }) => useSourceTypeNames(snapshot, true, 0, onTypes), { initialProps: { snapshot } });
  act(() => result.current.afterSync(["a"]));
  expect(refreshSourceTypes).not.toHaveBeenCalled();
  rerender({ snapshot: { ...snapshot, credential_ready: false } });
  const error = { kind: "credential", message: "本机凭证不可用" };
  vi.mocked(refreshSourceTypes).mockRejectedValueOnce(error);
  await act(async () => { await expect(result.current.refresh("a")).rejects.toEqual(error); });
  expect(refreshSourceTypes).toHaveBeenCalledExactlyOnceWith("a");
  expect(result.current.failures.a).toContain("重新保存 Token");
});

it.each(["connection", "source", "credential", "unmount"])("%s 变化后不应用旧请求的名称", async (change) => {
  const first = deferred<ReturnType<typeof response>>();
  vi.mocked(refreshSourceTypes).mockReturnValueOnce(first.promise);
  const onTypes = vi.fn();
  const initial = { snapshot: data(), revision: 0 };
  const { rerender, unmount } = renderHook(({ snapshot, revision }) => useSourceTypeNames(snapshot, true, revision, onTypes), { initialProps: initial });
  await waitFor(() => expect(refreshSourceTypes).toHaveBeenCalledOnce());
  const next = structuredClone(initial);
  if (change === "connection") next.snapshot.db_path = "other-cache";
  if (change === "source") next.snapshot.sources[0].enabled = false;
  if (change === "credential") next.revision++;
  if (change === "unmount") unmount();
  else rerender(next);
  await act(async () => { first.resolve(response("过期名称")); });
  expect(onTypes.mock.calls.every((call) => call[1].types[0].type_name !== "过期名称")).toBe(true);
});

it("名称合并保留当前同步选择、显示偏好、事项和同步台账", () => {
  const snapshot = data();
  snapshot.sources[0].type_scope!.configured = true;
  snapshot.sources[0].type_scope!.types[0].selected = false;
  snapshot.source_type_preferences = { a: { type: { enabled: false, alias: "别名" } } };
  const fresh = scope("新名称");
  fresh.types.push({ ...fresh.types[0], project_key: "new-space" });
  const merged = applySourceTypeNames(snapshot, "a", fresh);
  expect(merged.sources[0].type_scope!.types.map((type) => type.selected)).toEqual([false, false]);
  expect(merged.sources[0].type_scope!.configured).toBe(true);
  expect(merged.source_type_preferences).toBe(snapshot.source_type_preferences);
  expect(merged.items).toBe(snapshot.items);
  expect(merged.runs).toBe(snapshot.runs);
  expect(merged.last_success).toBe(snapshot.last_success);
  expect(merged.total).toBe(snapshot.total);
});
