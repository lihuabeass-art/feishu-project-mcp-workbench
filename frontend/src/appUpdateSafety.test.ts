import { describe, expect, it, vi } from "vitest";
import { prepareUpdateInstallation } from "./appUpdateSafety";

describe("安装更新前的写入互斥", () => {
  it("拒绝中断正在执行的流程或业务操作", async () => {
    const flush = vi.fn();
    const onBusyChange = vi.fn();
    for (const [business, workflow] of [[true, false], [false, true]]) {
      await expect(prepareUpdateInstallation({ busy: { current: business }, workflow: { current: workflow }, flush, onBusyChange })).rejects.toThrow("当前操作尚未结束");
    }
    expect(flush).not.toHaveBeenCalled();
    expect(onBusyChange).not.toHaveBeenCalled();
  });

  it("保存队列等待期间已持锁，完成后由安装调用方释放且释放幂等", async () => {
    let finish!: () => void;
    const busy = { current: false };
    const workflow = { current: false };
    const onBusyChange = vi.fn();
    const flush = () => new Promise<void>((resolve) => { finish = resolve; });
    const pending = prepareUpdateInstallation({ busy, workflow, flush, onBusyChange });
    expect(busy.current).toBe(true);
    await expect(prepareUpdateInstallation({ busy, workflow, flush, onBusyChange })).rejects.toThrow("当前操作尚未结束");
    finish();
    const release = await pending;
    expect(busy.current).toBe(true);
    release();
    release();
    expect(busy.current).toBe(false);
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it("未保存输入阻止安装，保存失败恢复业务操作能力", async () => {
    const busy = { current: false };
    const onBusyChange = vi.fn();
    const options = { busy, workflow: { current: false }, onBusyChange, flush: vi.fn().mockRejectedValue(new Error("写盘失败")) };
    await expect(prepareUpdateInstallation({ ...options, blockedReason: "请先保存设置" })).rejects.toThrow("请先保存设置");
    expect(options.flush).not.toHaveBeenCalled();
    await expect(prepareUpdateInstallation(options)).rejects.toThrow("写盘失败");
    expect(busy.current).toBe(false);
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });
});
