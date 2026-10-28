// @vitest-environment jsdom
import { StrictMode } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { isTauri } from "@tauri-apps/api/core";
import {
  check,
  type Update,
  type DownloadEvent,
} from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useAppUpdater } from "./useAppUpdater";
import { AppUpdateDialog, AppUpdateSettings } from "./AppUpdater";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("./ExternalLink", () => ({
  ExternalLink: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function candidate() {
  return {
    version: "1.1.0",
    currentVersion: "1.0.0",
    body: "- 改善更新体验",
    download: vi.fn(async (_onEvent: (event: DownloadEvent) => void) => {}),
    install: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
}

function Host({
  configured = true,
  prepareInstall,
}: {
  configured?: boolean;
  prepareInstall?: () => Promise<() => void>;
}) {
  const updater = useAppUpdater({ configured, prepareInstall });
  return (
    <>
      <AppUpdateSettings updater={updater} />
      <AppUpdateDialog updater={updater} />
      <output data-testid="phase">{updater.state.phase}</output>
    </>
  );
}

const originalShow = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "showModal",
);
const originalClose = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "close",
);
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(check).mockResolvedValue(null);
  vi.mocked(relaunch).mockResolvedValue();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
afterAll(() => {
  for (const [name, descriptor] of [
    ["showModal", originalShow],
    ["close", originalClose],
  ] as const) {
    if (descriptor)
      Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

it("未配置更新源和浏览器预览均不请求更新服务", async () => {
  vi.useFakeTimers();
  const first = render(<Host configured={false} />);
  expect(screen.getByText("更新源尚未配置。")).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "检查更新" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000);
  });
  expect(check).not.toHaveBeenCalled();
  first.unmount();
  vi.mocked(isTauri).mockReturnValue(false);
  render(<Host />);
  expect(screen.getByText("请在桌面应用中检查和安装更新。")).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000);
  });
  expect(check).not.toHaveBeenCalled();
});

it("StrictMode 启动延迟只检查一次，每六小时再检查，无更新时不弹窗", async () => {
  vi.useFakeTimers();
  render(
    <StrictMode>
      <Host />
    </StrictMode>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(9999);
  });
  expect(check).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(check).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000 - 10000);
  });
  expect(check).toHaveBeenCalledTimes(2);
});

it("关闭自动检查持久保存且仍可手动检查，检查失败不显示最新版", async () => {
  localStorage.setItem("fstodo.automatic-updates.v1", "false");
  vi.mocked(check).mockRejectedValueOnce(new Error("网络连接失败"));
  render(<Host />);
  expect(
    (
      screen.getByRole("switch", {
        name: "自动检查并下载更新",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
  await screen.findByText("网络连接失败");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("网络连接失败")).toBeTruthy();
  expect(screen.queryByText("当前已是最新版本。")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() =>
    expect(screen.getByTestId("phase").textContent).toBe("current"),
  );
  expect(check).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("switch", { name: "自动检查并下载更新" }));
  expect(localStorage.getItem("fstodo.automatic-updates.v1")).toBe("true");
});

it("手动检查后台下载且验签完成后仍须确认安装，安装等待保存且重启失败不重复安装", async () => {
  const update = candidate();
  const transfer = deferred<void>();
  let event!: (event: DownloadEvent) => void;
  update.download.mockImplementation((listener) => {
    event = listener;
    return transfer.promise;
  });
  vi.mocked(check).mockResolvedValue(update as unknown as Update);
  const prepared = deferred<() => void>();
  const releaseLock = vi.fn();
  const prepare = vi.fn(() => prepared.promise);
  vi.mocked(relaunch).mockRejectedValueOnce(new Error("系统未能重启"));
  render(<Host prepareInstall={prepare} />);
  fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
  await waitFor(() => expect(update.download).toHaveBeenCalledOnce());
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(update.install).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "查看更新" }));
  act(() => {
    event({ event: "Started", data: { contentLength: 100 } });
    event({ event: "Progress", data: { chunkLength: 50 } });
  });
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
    "50",
  );
  act(() => event({ event: "Finished" }));
  expect(screen.getByTestId("phase").textContent).toBe("downloading");
  expect(screen.queryByRole("button", { name: "退出并安装" })).toBeNull();
  await act(async () => transfer.resolve());
  expect(update.install).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "稍后再说" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.queryByRole("complementary", { name: "软件更新提示" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "查看更新" }));
  fireEvent.click(screen.getByRole("button", { name: "退出并安装" }));
  expect(prepare).toHaveBeenCalledOnce();
  expect(update.install).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "关闭软件更新" })).toBeNull();
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  await act(async () => prepared.resolve(releaseLock));
  await screen.findByRole("button", { name: "重试重启" });
  expect(update.install).toHaveBeenCalledOnce();
  expect(releaseLock).toHaveBeenCalledOnce();
  expect(update.close).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "重试重启" }));
  await waitFor(() => expect(relaunch).toHaveBeenCalledTimes(2));
  expect(update.install).toHaveBeenCalledOnce();
});

it("后台下载失败保留可见重试入口，未知大小使用不确定进度，查看后关闭恢复焦点", async () => {
  const update = candidate();
  update.download.mockRejectedValueOnce(new Error("下载中断"));
  const transfer = deferred<void>();
  update.download.mockImplementationOnce(() => transfer.promise);
  vi.mocked(check).mockResolvedValue(update as unknown as Update);
  render(<Host />);
  const trigger = screen.getByRole("button", { name: "检查更新" });
  trigger.focus();
  fireEvent.click(trigger);
  await screen.findByText("下载中断");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(update.download).toHaveBeenCalledTimes(2);
  expect(check).toHaveBeenCalledOnce();
  const view = screen.getByRole("button", { name: "查看更新" });
  view.focus();
  fireEvent.click(view);
  expect(screen.getByRole("progressbar").hasAttribute("aria-valuenow")).toBe(
    false,
  );
  await act(async () => transfer.resolve());
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(view);
});

it("关闭后台提示保留验签安装包与设置入口，轮询或关开自动更新不会重新提示或下载", async () => {
  vi.useFakeTimers();
  const update = candidate();
  vi.mocked(check).mockResolvedValue(update as unknown as Update);
  render(<Host />);
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  fireEvent.click(screen.getByRole("button", { name: "关闭软件更新提示" }));
  expect(
    screen.queryByRole("complementary", { name: "软件更新提示" }),
  ).toBeNull();
  expect(screen.getByTestId("phase").textContent).toBe("ready");
  expect(screen.getByRole("button", { name: "查看更新" })).toBeTruthy();
  await act(async () => vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000));
  const toggle = screen.getByRole("switch", { name: "自动检查并下载更新" });
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(
    screen.queryByRole("complementary", { name: "软件更新提示" }),
  ).toBeNull();
  expect(check).toHaveBeenCalledOnce();
  expect(update.download).toHaveBeenCalledOnce();
  expect(update.install).not.toHaveBeenCalled();
  expect(update.close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "查看更新" }));
  expect(screen.getByRole("button", { name: "退出并安装" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "稍后再说" }));
  expect(
    screen.queryByRole("complementary", { name: "软件更新提示" }),
  ).toBeNull();
});

it("从非模态提示打开确认窗后，稍后再说会关闭提示并将焦点移回稳定设置入口", async () => {
  const update = candidate();
  vi.mocked(check).mockResolvedValue(update as unknown as Update);
  render(<Host />);
  fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
  const notice = await screen.findByRole("complementary", {
    name: "软件更新提示",
  });
  const opener = within(notice).getByRole("button", { name: "查看更新" });
  const settingsEntry = within(
    screen.getByRole("region", { name: "软件更新" }),
  ).getByRole("button", { name: "查看更新" });
  opener.focus();
  fireEvent.click(opener);
  expect(opener.isConnected).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "稍后再说" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.queryByRole("complementary", { name: "软件更新提示" }),
  ).toBeNull();
  expect(document.activeElement).toBe(settingsEntry);
  expect(update.download).toHaveBeenCalledOnce();
  expect(update.install).not.toHaveBeenCalled();
});

it("StrictMode 自动检查仅下载一次，完成时仅非模态提示且不触发安装保护或抢焦点", async () => {
  vi.useFakeTimers();
  const update = candidate();
  const transfer = deferred<void>();
  update.download.mockImplementation(() => transfer.promise);
  vi.mocked(check).mockResolvedValue(update as unknown as Update);
  const prepare = vi.fn();
  render(
    <StrictMode>
      <Host prepareInstall={prepare} />
    </StrictMode>,
  );
  const toggle = screen.getByRole("switch", { name: "自动检查并下载更新" });
  toggle.focus();
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(check).toHaveBeenCalledOnce();
  expect(update.download).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(toggle);
  await act(async () => {
    transfer.resolve();
    await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000);
  });
  expect(
    screen.getByRole("complementary", { name: "软件更新提示" }),
  ).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(toggle);
  expect(screen.getByTestId("phase").textContent).toBe("ready");
  expect(prepare).not.toHaveBeenCalled();
  expect(update.install).not.toHaveBeenCalled();
  expect(update.download).toHaveBeenCalledOnce();
  expect(check).toHaveBeenCalledOnce();
});

it("检查中关闭自动更新会丢弃晚到结果，关闭后手动检查仍在后台下载", async () => {
  vi.useFakeTimers();
  const response = deferred<Update | null>();
  const ignored = candidate();
  const manual = candidate();
  vi.mocked(check)
    .mockReturnValueOnce(response.promise)
    .mockResolvedValueOnce(manual as unknown as Update);
  render(<Host />);
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  fireEvent.click(screen.getByRole("switch", { name: "自动检查并下载更新" }));
  await act(async () => response.resolve(ignored as unknown as Update));
  expect(ignored.download).not.toHaveBeenCalled();
  expect(ignored.close).toHaveBeenCalledOnce();
  expect(screen.getByTestId("phase").textContent).toBe("idle");
  expect(screen.queryByRole("dialog")).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000));
  expect(check).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
  await act(async () => {});
  expect(manual.download).toHaveBeenCalledOnce();
  expect(screen.getByTestId("phase").textContent).toBe("ready");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("检查与下载共用并发锁，已有验签安装包不会因手动检查或轮询重复下载", async () => {
  vi.useFakeTimers();
  const update = candidate();
  const transfer = deferred<void>();
  update.download.mockImplementation(() => transfer.promise);
  vi.mocked(check).mockResolvedValue(update as unknown as Update);
  const host = renderHook(() => useAppUpdater({ configured: true }));
  await act(async () => {
    host.result.current.check();
    host.result.current.check();
  });
  act(() => host.result.current.check());
  expect(check).toHaveBeenCalledOnce();
  expect(update.download).toHaveBeenCalledOnce();
  await act(async () => transfer.resolve());
  await act(async () => {
    host.result.current.check();
    await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000);
  });
  expect(host.result.current.state.phase).toBe("ready");
  expect(update.download).toHaveBeenCalledOnce();
  expect(check).toHaveBeenCalledOnce();
});

it("真正卸载后等当前下载结束再关闭资源，不继续安装", async () => {
  const update = candidate();
  const transfer = deferred<void>();
  update.download.mockImplementation(() => transfer.promise);
  vi.mocked(check).mockResolvedValue(update as unknown as Update);
  const host = renderHook(() => useAppUpdater({ configured: true }));
  await act(async () => host.result.current.check());
  host.unmount();
  await act(async () => {});
  expect(update.close).not.toHaveBeenCalled();
  await act(async () => transfer.resolve());
  expect(update.close).toHaveBeenCalledOnce();
  expect(update.install).not.toHaveBeenCalled();
});

it("并发检查去重，真正卸载后关闭晚到的更新资源", async () => {
  const response = deferred<Update | null>();
  const update = candidate();
  vi.mocked(check).mockReturnValue(response.promise);
  const host = renderHook(() => useAppUpdater({ configured: true }));
  act(() => {
    host.result.current.check();
    host.result.current.check();
  });
  await act(async () => {});
  expect(check).toHaveBeenCalledOnce();
  host.unmount();
  await act(async () => response.resolve(update as unknown as Update));
  expect(update.close).toHaveBeenCalledOnce();
});

it("安装前保存失败释放更新界面且不安装，卸载中完成保存也不继续安装", async () => {
  const update = candidate();
  vi.mocked(check).mockResolvedValue(update as unknown as Update);
  const prepared = deferred<() => void>();
  const prepare = vi
    .fn()
    .mockRejectedValueOnce(new Error("设置尚未保存"))
    .mockImplementation(() => prepared.promise);
  const host = render(<Host prepareInstall={prepare} />);
  fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
  await screen.findByRole("complementary", { name: "软件更新提示" });
  fireEvent.click(
    within(
      screen.getByRole("complementary", { name: "软件更新提示" }),
    ).getByRole("button", { name: "查看更新" }),
  );
  await screen.findByRole("button", { name: "退出并安装" });
  fireEvent.click(screen.getByRole("button", { name: "退出并安装" }));
  await screen.findByText("设置尚未保存");
  expect(update.install).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "重新检查更新" }));
  await screen.findByRole("button", { name: "退出并安装" });
  fireEvent.click(screen.getByRole("button", { name: "退出并安装" }));
  host.unmount();
  const releaseLock = vi.fn();
  await act(async () => prepared.resolve(releaseLock));
  expect(update.install).not.toHaveBeenCalled();
  expect(releaseLock).toHaveBeenCalledOnce();
});
