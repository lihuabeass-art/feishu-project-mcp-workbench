// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useDisplayMode } from "./displayMode";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(), invoke: vi.fn() }));

type State = { mode: "full" | "compact"; pinned: boolean; warning: string | null };

function deferred() {
  let resolve!: (value: State) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<State>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const state = (mode: State["mode"], pinned = true, warning: string | null = null): State => ({ mode, pinned, warning });

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(isTauri).mockReturnValue(true);
});
afterEach(cleanup);

async function mount(initial: State, onError = vi.fn()) {
  vi.mocked(invoke).mockResolvedValueOnce(initial);
  const hook = renderHook(() => useDisplayMode(onError));
  expect(hook.result.current.ready).toBe(false);
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  return { hook, onError };
}

it("桌面端读到上次的模式后才就绪，期间不渲染布局", async () => {
  const { hook } = await mount(state("compact", false));
  expect(invoke).toHaveBeenCalledWith("get_display_mode");
  expect(hook.result.current.mode).toBe("compact");
  expect(hook.result.current.pinned).toBe(false);
});

it("进入清单先换布局再改窗口，回到完整模式等窗口放大后再换布局", async () => {
  const { hook } = await mount(state("full"));
  const shrink = deferred();
  vi.mocked(invoke).mockReturnValueOnce(shrink.promise);
  act(() => hook.result.current.change("compact"));
  expect(invoke).toHaveBeenLastCalledWith("set_display_mode", { mode: "compact" });
  expect(hook.result.current.mode).toBe("compact");
  expect(hook.result.current.busy).toBe(true);
  await act(async () => shrink.resolve(state("compact")));
  expect(hook.result.current.busy).toBe(false);

  const grow = deferred();
  vi.mocked(invoke).mockReturnValueOnce(grow.promise);
  act(() => hook.result.current.change("full"));
  expect(hook.result.current.mode).toBe("compact");
  await act(async () => grow.resolve(state("full")));
  expect(hook.result.current.mode).toBe("full");
});

it("窗口切换失败时回到原布局并提示，不重复发送", async () => {
  const { hook, onError } = await mount(state("full"));
  const shrink = deferred();
  vi.mocked(invoke).mockReturnValueOnce(shrink.promise);
  act(() => hook.result.current.change("compact"));
  act(() => hook.result.current.change("compact"));
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "set_display_mode")).toHaveLength(1);
  await act(async () => shrink.reject(new Error("denied")));
  expect(hook.result.current.mode).toBe("full");
  expect(onError).toHaveBeenCalledWith("显示模式切换失败：denied");
});

it("窗口已切换但设置未能写入时保留新模式并提示重启后可能恢复", async () => {
  const { hook, onError } = await mount(state("full"));
  vi.mocked(invoke).mockResolvedValueOnce(state("compact", true, "access denied"));
  await act(async () => hook.result.current.change("compact"));
  expect(hook.result.current.mode).toBe("compact");
  expect(onError.mock.calls[0][0]).toContain("重启后可能恢复原设置");
});

it("置顶失败时恢复原状态", async () => {
  const { hook, onError } = await mount(state("compact", true));
  vi.mocked(invoke).mockRejectedValueOnce(new Error("busy"));
  await act(async () => hook.result.current.pin(false));
  expect(invoke).toHaveBeenLastCalledWith("set_compact_pinned", { pinned: false });
  expect(hook.result.current.pinned).toBe(true);
  expect(onError).toHaveBeenCalledWith("窗口置顶设置失败：busy");
});

it("读取失败仍然就绪并按完整模式显示，同时提示", async () => {
  vi.mocked(invoke).mockRejectedValueOnce(new Error("poisoned"));
  const onError = vi.fn();
  const hook = renderHook(() => useDisplayMode(onError));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(hook.result.current.mode).toBe("full");
  expect(onError).toHaveBeenCalledWith("未能读取显示模式：poisoned");
});

it("自绘标题栏的拖动、最小化与关闭交给桌面端", async () => {
  const { hook } = await mount(state("compact"));
  vi.mocked(invoke).mockResolvedValue(undefined);
  await act(async () => hook.result.current.windowAction("drag"));
  expect(invoke).toHaveBeenLastCalledWith("window_action", { action: "drag" });
});
