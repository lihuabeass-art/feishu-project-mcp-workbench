import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  check as checkOfficial,
  type Update as OfficialUpdate,
} from "@tauri-apps/plugin-updater";
import { check } from "./updaterClient";

const closed = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: class {
    onmessage?: (event: unknown) => void;
  },
  Resource: class {
    constructor(public rid: number) {}
    close() {
      return closed(this.rid);
    }
  },
}));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));

beforeEach(() => vi.resetAllMocks());

it("下载失败保留原生会话用于续传，验签返回资源后才允许安装，关闭释放全部资源", async () => {
  const candidate = {
    rid: 10,
    version: "1.1.0",
    currentVersion: "1.0.0",
    close: vi.fn(),
  };
  vi.mocked(checkOfficial).mockResolvedValue(
    candidate as unknown as OfficialUpdate,
  );
  vi.mocked(invoke)
    .mockResolvedValueOnce(20)
    .mockRejectedValueOnce("连接超时")
    .mockResolvedValueOnce(30)
    .mockResolvedValueOnce(undefined);
  const update = (await check({ timeout: 20_000 }))!;
  expect(checkOfficial).toHaveBeenCalledWith({ timeout: 20_000 });
  await expect(update.install()).rejects.toThrow("尚未下载并通过签名校验");
  await expect(update.download(vi.fn())).rejects.toBe("连接超时");
  await expect(update.install()).rejects.toThrow("尚未下载并通过签名校验");
  await update.download(vi.fn());
  expect(
    vi
      .mocked(invoke)
      .mock.calls.filter(([name]) => name === "begin_update_download"),
  ).toHaveLength(1);
  expect(
    vi
      .mocked(invoke)
      .mock.calls.filter(([name]) => name === "download_update")
      .map(([, args]) => (args as { rid: number }).rid),
  ).toEqual([20, 20]);
  await update.install();
  expect(invoke).toHaveBeenLastCalledWith("install_verified_update", {
    rid: 30,
  });
  await update.close();
  expect(closed.mock.calls.map(([rid]) => rid)).toEqual([30, 20]);
  expect(candidate.close).toHaveBeenCalledOnce();
});

it("没有新版不创建下载会话", async () => {
  vi.mocked(checkOfficial).mockResolvedValue(null);
  expect(await check()).toBeNull();
  expect(invoke).not.toHaveBeenCalled();
});
