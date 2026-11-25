// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { cachedItemDetail, refreshItemDetail } from "./api";
import { scheduleItemKey, useScheduleItemContexts } from "./scheduleHistory";
import type { ItemDetail } from "./types";

vi.mock("./api", () => ({ cachedItemDetail: vi.fn(), refreshItemDetail: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const keyFor = (item: string) => scheduleItemKey({ connection: "c", project: "p", type: "story", item, node: "n", scope: "node" });
const detail = (item: string, name?: string): ItemDetail => ({
  id: { project_key: "p", work_item_type_key: "story", work_item_id: item }, fetched_at_ms: 1, pages: [], data: {
    work_item_attribute: { finish_status: !name, work_item_status: "需求上线" }, work_item_fields: [],
    work_item_current_node: name ? [{ id: "n", name, owners: [{ key: "person", name: "负责人甲" }] }] : [],
  },
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
