// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Cloud } from "lucide-react";
import { SettingsPage, type SettingsSection } from "./SettingsPage";

const sections: SettingsSection[] = [
  {
    id: "connection",
    label: "应用配置",
    icon: Cloud,
    content: (
      <>
        <h2>应用配置</h2>
        <input aria-label="待保存的连接" />
      </>
    ),
  },
  {
    id: "desktop",
    label: "窗口与桌面",
    icon: Cloud,
    content: <h2>窗口与桌面</h2>,
  },
  { id: "updates", label: "软件更新", icon: Cloud, content: <h2>软件更新</h2> },
];
let scrollPosition = 0;
let stacked = false;
const scrollTo = vi.fn();
function mount() {
  const mounted = render(<SettingsPage active sections={sections} />);
  const viewport = screen.getByRole("region", { name: "设置内容" });
  Object.defineProperties(viewport, {
    scrollTop: { configurable: true, get: () => scrollPosition },
    clientHeight: { configurable: true, value: 500 },
    scrollHeight: { configurable: true, value: 1600 },
  });
  viewport.scrollTo = scrollTo;
  viewport.style.overflowY = "auto";
  return { ...mounted, viewport };
}
async function scroll(viewport: HTMLElement, position: number) {
  await act(async () => {
    scrollPosition = position;
    fireEvent.scroll(viewport);
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => resolve()),
    );
  });
}
beforeEach(() => {
  scrollPosition = 0;
  stacked = false;
  scrollTo.mockReset();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const positions: Record<string, number> = {
        "settings-connection": 4,
        "settings-desktop": 504,
        "settings-updates": 1004,
      };
      const top = this.classList.contains("settings-layout")
        ? 180
        : this.id in positions
          ? 180 + positions[this.id] - scrollPosition
          : 184;
      const left = this.classList.contains("settings-content")
        ? stacked
          ? 0
          : 220
        : 0;
      const width = this.classList.contains("settings-index")
        ? stacked
          ? 600
          : 172
        : 600;
      return {
        top,
        left,
        right: left + width,
        bottom: top + 400,
        width,
        height: 400,
        x: left,
        y: top,
        toJSON() {},
      };
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("全部设置在同一滚动模块，点击不滚动页面，标题留在模块外且保留表单", async () => {
  const user = userEvent.setup();
  const { viewport } = mount();
  expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
  expect(
    viewport.contains(
      screen.getByRole("heading", { name: /^设置$/ }),
    ),
  ).toBe(false);
  expect(
    viewport.contains(screen.getByRole("navigation", { name: "设置索引" })),
  ).toBe(true);
  expect(screen.queryByText("本页设置")).toBeNull();
  const input = screen.getByRole("textbox", { name: "待保存的连接" });
  await user.type(input, "未保存草稿");
  await user.click(screen.getByRole("link", { name: "窗口与桌面" }));
  expect(scrollTo).toHaveBeenCalledWith({ top: 500, behavior: "smooth" });
  expect(window.scrollTo).not.toHaveBeenCalled();
  expect((input as HTMLInputElement).value).toBe("未保存草稿");
});
it("键盘定位将焦点交给目标分组，不让浏览器带动外层页面", async () => {
  const user = userEvent.setup();
  mount();
  screen.getByRole("link", { name: "窗口与桌面" }).focus();
  await user.keyboard("{Enter}");
  expect(scrollTo).toHaveBeenCalledWith({ top: 500, behavior: "smooth" });
  expect(document.activeElement).toBe(
    document.getElementById("settings-desktop"),
  );
  expect(window.scrollTo).not.toHaveBeenCalled();
});
it("模块内自由滚动高亮当前分组，底部分组同样可定位", async () => {
  const { viewport } = mount();
  await scroll(viewport, 500);
  expect(
    screen
      .getByRole("link", { name: "窗口与桌面" })
      .getAttribute("aria-current"),
  ).toBe("location");
  await scroll(viewport, 1000);
  expect(
    screen.getByRole("link", { name: "软件更新" }).getAttribute("aria-current"),
  ).toBe("location");
});
it("点击应用配置后保持目标高亮，经过窗口与桌面不会反复切换，到达后恢复跟踪", async () => {
  scrollPosition = 650;
  const user = userEvent.setup();
  const { viewport } = mount();
  const appLink = screen.getByRole("link", { name: "应用配置" });
  const desktopLink = screen.getByRole("link", { name: "窗口与桌面" });
  expect(desktopLink.getAttribute("aria-current")).toBe("location");
  await user.click(appLink);
  for (const position of [640, 600, 500]) {
    await scroll(viewport, position);
    expect(appLink.getAttribute("aria-current")).toBe("location");
  }
  await scroll(viewport, 0);
  await scroll(viewport, 500);
  expect(desktopLink.getAttribute("aria-current")).toBe("location");
});
it.each(["wheel", "touchstart", "keydown", "scrollend"])(
  "%s 后能接管尚未完成的索引定位",
  async (input) => {
    const user = userEvent.setup();
    const { viewport } = mount();
    await user.click(screen.getByRole("link", { name: "软件更新" }));
    fireEvent(
      viewport,
      input === "keydown"
        ? new KeyboardEvent(input, { key: "PageUp", bubbles: true })
        : new Event(input),
    );
    await scroll(viewport, 500);
    expect(
      screen
        .getByRole("link", { name: "窗口与桌面" })
        .getAttribute("aria-current"),
    ).toBe("location");
  },
);
it("连续选择以最后一次目标为准，内部控件结束滚动不会提前解除定位", async () => {
  const user = userEvent.setup();
  const { viewport } = mount();
  await user.click(screen.getByRole("link", { name: "软件更新" }));
  await user.click(screen.getByRole("link", { name: "应用配置" }));
  fireEvent(
    screen.getByRole("textbox"),
    new Event("scrollend", { bubbles: true }),
  );
  await scroll(viewport, 500);
  expect(
    screen.getByRole("link", { name: "应用配置" }).getAttribute("aria-current"),
  ).toBe("location");
  await scroll(viewport, 0);
});
it("窄布局定位避开顶部索引，减少动态效果时直接定位", async () => {
  stacked = true;
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const user = userEvent.setup();
  mount();
  Object.defineProperty(
    screen.getByRole("navigation", { name: "设置索引" }),
    "offsetHeight",
    { value: 140 },
  );
  await user.click(screen.getByRole("link", { name: "窗口与桌面" }));
  expect(scrollTo).toHaveBeenCalledWith({ top: 352, behavior: "auto" });
});
it("滚动区域边界阻止穿透，中段保留原生滚动", () => {
  const { viewport } = mount();
  const middle = new WheelEvent("wheel", {
    deltaY: 60,
    bubbles: true,
    cancelable: true,
  });
  scrollPosition = 300;
  fireEvent(viewport, middle);
  expect(middle.defaultPrevented).toBe(false);
  scrollPosition = 1100;
  const bottom = new WheelEvent("wheel", {
    deltaY: 60,
    bubbles: true,
    cancelable: true,
  });
  fireEvent(viewport, bottom);
  expect(bottom.defaultPrevented).toBe(true);
  scrollPosition = 0;
  const top = new WheelEvent("wheel", {
    deltaY: -60,
    bubbles: true,
    cancelable: true,
  });
  fireEvent(viewport, top);
  expect(top.defaultPrevented).toBe(true);
});
it("切页隐藏时仍保留表单和模块滚动位置，恢复页面和动态分组后重新跟踪", async () => {
  const user = userEvent.setup();
  const mounted = mount();
  await user.type(screen.getByRole("textbox"), "保存中草稿");
  await scroll(mounted.viewport, 500);
  mounted.rerender(<SettingsPage active={false} sections={sections} />);
  expect(screen.queryByRole("navigation", { name: "设置索引" })).toBeNull();
  mounted.rerender(<SettingsPage active sections={sections.slice(0, 2)} />);
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
    "保存中草稿",
  );
  expect(mounted.viewport.scrollTop).toBe(500);
  expect(screen.queryByRole("link", { name: "软件更新" })).toBeNull();
  await waitFor(() =>
    expect(
      screen
        .getByRole("link", { name: "窗口与桌面" })
        .getAttribute("aria-current"),
    ).toBe("location"),
  );
});
