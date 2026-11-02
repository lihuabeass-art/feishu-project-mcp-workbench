// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { syncTodos } from "./api";
import type { SyncProgress, SyncReport } from "./types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe("渐进同步事件", () => {
  it("监听先于请求，仅接受本次请求的新批次，并在完成后清理", async () => {
    const unlisten = vi.fn();
    let deliver!: (event: { payload: SyncProgress }) => void;
    vi.mocked(listen).mockImplementation(async (_name, handler) => {
      deliver = handler as typeof deliver;
      return unlisten;
    });
    let finish!: (report: SyncReport) => void;
    vi.mocked(invoke).mockImplementation(() => new Promise((resolve) => { finish = resolve as typeof finish; }));
    const receive = vi.fn();
    const controller = new AbortController();
    const pending = syncTodos("*", false, ["a"], { receive, signal: controller.signal });
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    const args = vi.mocked(invoke).mock.calls[0][1] as { requestId: string };
    const payload: SyncProgress = { request_id: args.requestId, sequence: 1,
      patch: { added: [], modified: [], removed: [] }, total: 0 };
    deliver({ payload: { ...payload, request_id: "other" } });
    deliver({ payload });
    deliver({ payload });
    deliver({ payload: { ...payload, sequence: 0 } });
    deliver({ payload: { ...payload, sequence: 2 } });
    expect(receive).toHaveBeenCalledTimes(2);
    finish({ status: "success", complete: true, items_upserted: 0, items_inserted: 0,
      items_updated: 0, items_rejected: 0, stop_reason: "total_reached" });
    await pending;
    expect(unlisten).toHaveBeenCalledOnce();
    deliver({ payload: { ...payload, sequence: 3 } });
    expect(receive).toHaveBeenCalledTimes(2);
  });

  it("卸载终止监听后丢弃迟到批次，请求失败仍清理", async () => {
    const unlisten = vi.fn();
    let deliver!: (event: { payload: SyncProgress }) => void;
    vi.mocked(listen).mockImplementation(async (_name, handler) => {
      deliver = handler as typeof deliver;
      return unlisten;
    });
    let reject!: (reason: unknown) => void;
    vi.mocked(invoke).mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    const receive = vi.fn();
    const controller = new AbortController();
    const pending = syncTodos("*", true, ["a"], { receive, signal: controller.signal });
    const failure = expect(pending).rejects.toEqual({ kind: "connection" });
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    const args = vi.mocked(invoke).mock.calls[0][1] as { requestId: string };
    controller.abort();
    expect(unlisten).toHaveBeenCalledOnce();
    deliver({ payload: { request_id: args.requestId, sequence: 1,
      patch: { added: [], modified: [], removed: [] }, total: 0 } });
    expect(receive).not.toHaveBeenCalled();
    reject({ kind: "connection" });
    await failure;
    expect(unlisten).toHaveBeenCalledOnce();
  });
});
