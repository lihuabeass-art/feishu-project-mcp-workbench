// @vitest-environment jsdom
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { DesktopSettings, useDesktopSettings } from "./DesktopSettings";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn() }));
const key = "fstodo.follow-virtual-desktop.v1";

function Host({ hidden = false }: { hidden?: boolean }) {
  const settings = useDesktopSettings();
  const [visible, setVisible] = useState(!hidden);
  return (
    <>
      <button onClick={() => setVisible(!visible)}>显示设置</button>
      {visible && <DesktopSettings settings={settings} />}
    </>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockImplementation(async (_command, args) =>
    (args as { enabled: boolean }).enabled,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("启动即恢复偏好，设置页关闭也生效，StrictMode 不重复发命令", async () => {
  localStorage.setItem(key, "true");
  render(<StrictMode><Host hidden /></StrictMode>);
  await waitFor(() => expect(invoke).toHaveBeenCalledOnce());
  expect(invoke).toHaveBeenCalledWith("set_follow_virtual_desktop", { enabled: true });
  await act(async () => {});
  fireEvent.click(screen.getByText("显示设置"));
  expect((screen.getByRole("switch", { name: "跟随虚拟桌面" }) as HTMLInputElement).checked).toBe(true);
  expect(invoke).toHaveBeenCalledOnce();
});

it("默认开启，用户关闭选择立即保存并在重挂载后恢复", async () => {
  const host = render(<Host />);
  const checkbox = screen.getByRole("switch", { name: "跟随虚拟桌面" }) as HTMLInputElement;
  await waitFor(() => expect(checkbox.disabled).toBe(false));
  expect(checkbox.checked).toBe(true);
  expect(invoke).toHaveBeenCalledWith("set_follow_virtual_desktop", { enabled: true });
  fireEvent.click(checkbox);
  await waitFor(() => expect(localStorage.getItem(key)).toBe("false"));
  expect(checkbox.checked).toBe(false);
  fireEvent.click(checkbox);
  await waitFor(() => expect(localStorage.getItem(key)).toBe("true"));
  expect(checkbox.checked).toBe(true);
  fireEvent.click(checkbox);
  await waitFor(() => expect(localStorage.getItem(key)).toBe("false"));
  expect(checkbox.checked).toBe(false);
  host.unmount();
  render(<Host />);
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(5));
  expect(invoke).toHaveBeenLastCalledWith("set_follow_virtual_desktop", { enabled: false });
});

it("系统调用完成前锁定开关，失败不保存，重试同一选择", async () => {
  render(<Host />);
  const checkbox = screen.getByRole("switch", { name: "跟随虚拟桌面" }) as HTMLInputElement;
  await waitFor(() => expect(checkbox.disabled).toBe(false));
  let reject!: (reason: string) => void;
  vi.mocked(invoke).mockImplementationOnce(() =>
    new Promise((_resolve, fail) => { reject = fail; }),
  );
  fireEvent.click(checkbox);
  expect(checkbox.disabled).toBe(true);
  expect(checkbox.checked).toBe(true);
  await act(async () => reject("系统拒绝窗口固定"));
  expect(screen.getByRole("alert").textContent).toBe("系统拒绝窗口固定");
  expect(localStorage.getItem(key)).toBeNull();
  fireEvent.click(screen.getByText("重试窗口设置"));
  await waitFor(() => expect(checkbox.checked).toBe(false));
  expect(localStorage.getItem(key)).toBe("false");
});

it("恢复失败不谎报开启，保留偏好并允许重试恢复", async () => {
  localStorage.setItem(key, "true");
  vi.mocked(invoke).mockRejectedValueOnce("暂时无法连接桌面服务");
  render(<Host />);
  await screen.findByRole("alert");
  const checkbox = screen.getByRole("switch", { name: "跟随虚拟桌面" }) as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
  expect(localStorage.getItem(key)).toBe("true");
  fireEvent.click(screen.getByText("重试窗口设置"));
  await waitFor(() => expect(checkbox.checked).toBe(true));
});

it("保存失败明确区分当前已生效，重试可补存偏好", async () => {
  render(<Host />);
  const checkbox = screen.getByRole("switch", { name: "跟随虚拟桌面" }) as HTMLInputElement;
  await waitFor(() => expect(checkbox.disabled).toBe(false));
  vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("disk full");
  });
  fireEvent.click(checkbox);
  expect((await screen.findByRole("alert")).textContent).toContain("本次设置已生效");
  expect(checkbox.checked).toBe(false);
  expect(localStorage.getItem(key)).toBeNull();
  fireEvent.click(screen.getByText("重试窗口设置"));
  await waitFor(() => expect(localStorage.getItem(key)).toBe("false"));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("浏览器预览禁用开关，不发原生命令", () => {
  vi.mocked(isTauri).mockReturnValue(false);
  render(<Host />);
  expect((screen.getByRole("switch", { name: "跟随虚拟桌面" }) as HTMLInputElement).disabled).toBe(true);
  expect(screen.getByText(/浏览器预览无法设置窗口行为/)).toBeTruthy();
  expect(invoke).not.toHaveBeenCalled();
});
