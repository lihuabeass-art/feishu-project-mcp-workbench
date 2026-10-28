// @vitest-environment jsdom
import bootstrap from "../public/theme-init.js?raw";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { ThemeControl } from "./ThemeControl";
import {
  appearanceStorageKey,
  ThemeProvider,
  themeStorageKey,
} from "./ThemeProvider";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));
const setWindowTheme =
  vi.fn<(theme: "light" | "dark" | null) => Promise<void>>();
const showWindow = vi.fn<() => Promise<void>>();

let systemDark: boolean;
let media: MediaQueryList;

function mount() {
  return render(
    <StrictMode>
      <ThemeProvider>
        <ThemeControl />
      </ThemeProvider>
    </StrictMode>,
  );
}
async function choose(label: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^外观：/ }));
  await user.click(screen.getByRole("menuitemradio", { name: label }));
}
function systemChanges(dark: boolean) {
  act(() => {
    systemDark = dark;
    media.dispatchEvent(new Event("change"));
  });
}

beforeEach(() => {
  vi.mocked(isTauri).mockReturnValue(false);
  setWindowTheme.mockReset().mockResolvedValue();
  showWindow.mockReset().mockResolvedValue();
  vi.mocked(getCurrentWindow)
    .mockReset()
    .mockReturnValue({
      setTheme: setWindowTheme,
      show: showWindow,
    } as unknown as ReturnType<typeof getCurrentWindow>);
  localStorage.clear();
  systemDark = false;
  media = new EventTarget() as MediaQueryList;
  Object.defineProperties(media, {
    matches: { get: () => systemDark },
    media: { value: "(prefers-color-scheme: dark)" },
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media),
  );
  document.head.innerHTML = '<meta name="theme-color" content="#f3f5f3">';
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.appearance;
  document.documentElement.style.removeProperty("color-scheme");
});

it("首次跟随系统，系统主题变化即时生效，StrictMode 卸载后清理监听", () => {
  systemDark = true;
  const mounted = mount();
  expect(screen.getByRole("button", { name: "外观：跟随系统" })).toBeTruthy();
  expect(document.documentElement.dataset.theme).toBe("dark");
  systemChanges(false);
  expect(document.documentElement.dataset.theme).toBe("light");
  mounted.unmount();
  document.documentElement.dataset.theme = "light";
  systemChanges(true);
  expect(document.documentElement.dataset.theme).toBe("light");
});

it("连续系统切换后恢复过渡，跨窗口切换期间卸载也不会留下全局禁用状态", () => {
  vi.useFakeTimers();
  const mounted = mount();
  act(() => vi.advanceTimersByTime(1));
  expect(document.documentElement.hasAttribute("data-theme-switching")).toBe(
    false,
  );

  systemChanges(true);
  systemChanges(false);
  systemChanges(true);
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(document.documentElement.hasAttribute("data-theme-switching")).toBe(
    true,
  );
  act(() => vi.advanceTimersByTime(1));
  expect(document.documentElement.hasAttribute("data-theme-switching")).toBe(
    false,
  );

  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: themeStorageKey, newValue: "light" }),
    ),
  );
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(document.documentElement.hasAttribute("data-theme-switching")).toBe(
    true,
  );
  mounted.unmount();
  expect(document.documentElement.hasAttribute("data-theme-switching")).toBe(
    false,
  );
  expect(vi.getTimerCount()).toBe(0);
});

it("手动切换立即生效并记住选择，重载后覆盖系统偏好，仍可恢复自动跟随", async () => {
  const mounted = mount();
  await choose("暗黑模式");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(document.documentElement.style.colorScheme).toBe("dark");
  expect(
    document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
  ).toBe("#141414");
  expect(localStorage.getItem(themeStorageKey)).toBe("dark");
  systemChanges(true);
  systemChanges(false);
  expect(document.documentElement.dataset.theme).toBe("dark");
  mounted.unmount();
  mount();
  expect(screen.getByRole("button", { name: "外观：暗黑模式" })).toBeTruthy();
  expect(document.documentElement.dataset.theme).toBe("dark");
  await choose("日间模式");
  systemChanges(true);
  expect(document.documentElement.dataset.theme).toBe("light");
  await choose("跟随系统");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem(themeStorageKey)).toBe("system");
});

it("图标菜单支持键盘选择与焦点返回", async () => {
  mount();
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "外观：跟随系统" });
  trigger.focus();
  await user.keyboard("{Enter}{Home}{ArrowDown}{Enter}");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(document.activeElement).toBe(trigger);
});

it("打开菜单展示明暗模式和主题风格，Escape 关闭且不改变主题", async () => {
  systemDark = true;
  mount();
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "外观：跟随系统" });
  await user.click(trigger);
  expect(screen.getByRole("menu", { name: "外观：跟随系统" })).toBeTruthy();
  expect(screen.getAllByRole("menuitemradio")).toHaveLength(5);
  expect(screen.getByRole("group", { name: "主题风格" })).toBeTruthy();
  expect(
    screen
      .getByRole("menuitemradio", { name: "经典绿意" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(
    screen
      .getByRole("menuitemradio", { name: "跟随系统" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(
    screen
      .getByRole("menuitemradio", { name: "暗黑模式" })
      .getAttribute("aria-checked"),
  ).toBe("false");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem(themeStorageKey)).toBeNull();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(document.documentElement.dataset.theme).toBe("dark");
});

it("其他窗口切换与清除偏好会同步到当前窗口，无效偏好回到系统模式", () => {
  localStorage.setItem(themeStorageKey, "invalid");
  mount();
  expect(screen.getByRole("button", { name: "外观：跟随系统" })).toBeTruthy();
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: themeStorageKey,
        newValue: "dark",
      }),
    ),
  );
  expect(document.documentElement.dataset.theme).toBe("dark");
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: null,
        newValue: null,
      }),
    ),
  );
  expect(document.documentElement.dataset.theme).toBe("light");
});

it("本机存储不可用时仍可切换，并明确提示偏好未保存", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("denied");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  mount();
  await choose("暗黑模式");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(screen.getByRole("alert").textContent).toContain("未能保存在本机");
});

it("桌面标题栏恢复已保存偏好，并随手动切换及跨窗口偏好同步", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  localStorage.setItem(themeStorageKey, "dark");
  mount();
  expect(setWindowTheme).toHaveBeenLastCalledWith("dark");
  await choose("日间模式");
  expect(setWindowTheme).toHaveBeenLastCalledWith("light");
  await choose("暗黑模式");
  expect(setWindowTheme).toHaveBeenLastCalledWith("dark");
  act(() => {
    window.dispatchEvent(
      new StorageEvent("storage", { key: themeStorageKey, newValue: "light" }),
    );
  });
  expect(setWindowTheme).toHaveBeenLastCalledWith("light");
  expect(document.documentElement.dataset.theme).toBe("light");
});

it("恢复跟随系统时释放原生主题覆盖，系统变化由窗口原生跟随", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  mount();
  expect(setWindowTheme).toHaveBeenLastCalledWith(null);
  await choose("暗黑模式");
  await choose("跟随系统");
  expect(setWindowTheme).toHaveBeenLastCalledWith(null);
  const count = setWindowTheme.mock.calls.length;
  systemChanges(true);
  expect(document.documentElement.dataset.theme).toBe("dark");
  systemChanges(false);
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(setWindowTheme).toHaveBeenCalledTimes(count);
});

it("快速偏好变化保留最新标题栏主题，过期失败不会覆盖当前状态", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  let rejectOld!: (reason: Error) => void;
  setWindowTheme.mockImplementation(
    () =>
      new Promise<void>((_, reject) => {
        rejectOld = reject;
      }),
  );
  const mounted = mount();
  setWindowTheme.mockResolvedValue();
  act(() => {
    window.dispatchEvent(
      new StorageEvent("storage", { key: themeStorageKey, newValue: "dark" }),
    );
  });
  act(() => {
    window.dispatchEvent(
      new StorageEvent("storage", { key: themeStorageKey, newValue: "light" }),
    );
  });
  act(() => {
    window.dispatchEvent(
      new StorageEvent("storage", { key: themeStorageKey, newValue: "dark" }),
    );
  });
  expect(setWindowTheme.mock.calls.slice(-3)).toEqual([
    ["dark"],
    ["light"],
    ["dark"],
  ]);
  await act(async () => rejectOld(new Error("old failure")));
  expect(screen.queryByRole("alert")).toBeNull();
  mounted.unmount();
  expect(document.documentElement.hasAttribute("data-theme-switching")).toBe(
    false,
  );
});

it("标题栏同步失败时提示用户，同时保留页面主题和已保存偏好", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  mount();
  setWindowTheme.mockRejectedValue(new Error("denied"));
  await choose("暗黑模式");
  expect(screen.getByRole("alert").textContent).toContain(
    "窗口标题栏外观未能同步",
  );
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem(themeStorageKey)).toBe("dark");
});

it("启动时先恢复原生主题再显示窗口，恢复失败也能进入应用", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  setWindowTheme.mockReturnValue(pending);
  const mounted = mount();
  expect(showWindow).not.toHaveBeenCalled();
  await act(async () => finish());
  expect(showWindow).toHaveBeenCalledTimes(1);
  await choose("暗黑模式");
  expect(showWindow).toHaveBeenCalledTimes(1);
  mounted.unmount();
  showWindow.mockClear();
  setWindowTheme.mockRejectedValue(new Error("denied"));
  mount();
  await act(async () => {});
  expect(showWindow).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("alert").textContent).toContain(
    "窗口标题栏外观未能同步",
  );
});

it("浏览器预览仅切换页面配色，不调用桌面窗口接口", async () => {
  mount();
  await choose("暗黑模式");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(getCurrentWindow).not.toHaveBeenCalled();
});

it.each([
  ["dark", false, "dark"],
  ["light", true, "light"],
  ["system", true, "dark"],
  ["invalid", false, "light"],
])("首帧脚本先于 React 按偏好 %s 恢复主题", (saved, dark, expected) => {
  localStorage.setItem(themeStorageKey, saved);
  systemDark = dark;
  new Function("window", "document", "localStorage", bootstrap)(
    window,
    document,
    localStorage,
  );
  expect(document.documentElement.dataset.theme).toBe(expected);
  expect(document.documentElement.style.colorScheme).toBe(expected);
  mount();
  expect(document.documentElement.dataset.theme).toBe(expected);
});

it("珍珠全息独立于明暗模式，保存后重载并继续跟随系统", async () => {
  const mounted = mount();
  await choose("珍珠全息");
  expect(document.documentElement.dataset.appearance).toBe("pearl");
  expect(localStorage.getItem(appearanceStorageKey)).toBe("pearl");
  expect(document.documentElement.dataset.theme).toBe("light");
  await choose("暗黑模式");
  expect(document.documentElement.dataset.appearance).toBe("pearl");
  expect(
    document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
  ).toBe("#141724");
  mounted.unmount();
  mount();
  expect(
    screen.getByRole("button", { name: "外观：暗黑模式 · 珍珠全息" }),
  ).toBeTruthy();
  await choose("跟随系统");
  systemChanges(true);
  expect(document.documentElement.dataset.theme).toBe("dark");
  systemChanges(false);
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(document.documentElement.dataset.appearance).toBe("pearl");
  await choose("经典绿意");
  expect(document.documentElement.dataset.appearance).toBe("classic");
  expect(localStorage.getItem(themeStorageKey)).toBe("system");
});

it("跨窗口快速切换风格后恢复过渡，清除偏好与卸载不会留下临时标记", () => {
  vi.useFakeTimers();
  const mounted = mount();
  for (const value of ["pearl", "classic", "pearl"]) {
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: appearanceStorageKey,
          newValue: value,
        }),
      ),
    );
  }
  expect(document.documentElement.dataset.appearance).toBe("pearl");
  expect(document.documentElement.hasAttribute("data-theme-switching")).toBe(
    true,
  );
  act(() => vi.advanceTimersByTime(1));
  expect(document.documentElement.hasAttribute("data-theme-switching")).toBe(
    false,
  );
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
  expect(document.documentElement.dataset.appearance).toBe("classic");
  mounted.unmount();
  expect(document.documentElement.hasAttribute("data-theme-switching")).toBe(
    false,
  );
  expect(vi.getTimerCount()).toBe(0);
});

it("风格存储失败保留预览与提示，切换明暗模式不会掩盖未保存的风格", async () => {
  const save = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key,
    value,
  ) {
    if (key === appearanceStorageKey) throw new Error("quota");
    save.call(this, key, value);
  });
  mount();
  await choose("珍珠全息");
  expect(document.documentElement.dataset.appearance).toBe("pearl");
  await choose("暗黑模式");
  expect(screen.getByRole("alert").textContent).toContain(
    "主题风格已切换，但未能保存在本机",
  );
});

it.each([
  ["pearl", "light", "#f3f4fb"],
  ["pearl", "dark", "#141724"],
  ["invalid", "light", "#f3f5f3"],
])("首帧脚本恢复风格 %s 与明暗 %s，挂载前后配色一致", (saved, theme, color) => {
  localStorage.setItem(appearanceStorageKey, saved);
  localStorage.setItem(themeStorageKey, theme);
  new Function("window", "document", "localStorage", bootstrap)(
    window,
    document,
    localStorage,
  );
  const expected = saved === "pearl" ? "pearl" : "classic";
  expect(document.documentElement.dataset.appearance).toBe(expected);
  expect(
    document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
  ).toBe(color);
  mount();
  expect(document.documentElement.dataset.appearance).toBe(expected);
  expect(document.documentElement.dataset.theme).toBe(theme);
  expect(
    document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
  ).toBe(color);
});
