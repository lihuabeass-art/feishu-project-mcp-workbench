// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useState } from "react";
import { McpTokenGuide } from "./McpTokenGuide";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn() }));

const configurationUrl = "https://project.feishu.cn/b/mcp";
const intro = "打开飞书项目 MCP 配置，选择 HTTP Header，复制 Token 后粘贴到下方。";
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) { this.removeAttribute("open"); },
  });
});
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockResolvedValue(undefined);
});
afterEach(cleanup);
afterAll(() => {
  for (const [name, descriptor] of [["showModal", originalShow], ["close", originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

function GuideHarness() {
  const [open, setOpen] = useState(false);
  return <McpTokenGuide open={open} onOpenChange={setOpen} inputId="test-token">
    <input id="test-token" type="password" defaultValue="" />
  </McpTokenGuide>;
}

function guide() { return <GuideHarness />; }

it("简短引导和获取入口始终保留，教程按受控状态显示", () => {
  const change = vi.fn();
  const view = render(<McpTokenGuide open={false} onOpenChange={change} inputId="test-token"><input id="test-token" /></McpTokenGuide>);
  expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === intro)).toBeTruthy();
  expect(screen.getByLabelText("MCP Token").getAttribute("id")).toBe("test-token");
  expect(screen.getByRole("button", { name: "查看教程" }).getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("region", { name: "获取飞书项目 MCP Token" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "查看教程" }));
  expect(change).toHaveBeenLastCalledWith(true);
  view.rerender(<McpTokenGuide open onOpenChange={change} inputId="test-token"><input id="test-token" /></McpTokenGuide>);
  expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === intro)).toBeTruthy();
  expect(screen.getByRole("link", { name: "获取 Token" }).getAttribute("href")).toBe(configurationUrl);
  expect(screen.getByRole("region", { name: "获取飞书项目 MCP Token" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "收起教程" }));
  expect(change).toHaveBeenLastCalledWith(false);
});

it("按需展开三步教程及备用路径，教程图片从应用内加载", async () => {
  const user = userEvent.setup();
  render(guide());
  const trigger = screen.getByRole("button", { name: "查看教程" });
  await user.click(trigger);
  const panel = screen.getByRole("region", { name: "获取飞书项目 MCP Token" });
  expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(within(panel).getAllByRole("listitem")).toHaveLength(3);
  expect(within(panel).getByRole("link", { name: "打开飞书项目 MCP 配置" }).getAttribute("href")).toBe(configurationUrl);

  const fallback = screen.getByText("找不到配置入口？");
  expect(fallback.closest("details")?.open).toBe(false);
  await user.click(fallback);
  expect(fallback.closest("details")?.open).toBe(true);
  expect(screen.getByRole("button", { name: "放大：从飞书工作台打开飞书项目" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "放大：进入 MCP 配置" })).toBeTruthy();
  const images = within(panel).getAllByRole("img");
  expect(images).toHaveLength(3);
  for (const image of images) {
    expect(image.getAttribute("src")).toBeTruthy();
    expect(image.getAttribute("src")).not.toMatch(/^(?:https?:)?\/\//);
  }
  await user.click(screen.getByRole("button", { name: "收起教程" }));
  expect(screen.queryByRole("region", { name: "获取飞书项目 MCP Token" })).toBeNull();
  expect(invoke).not.toHaveBeenCalled();
});

it("获取入口遵循浏览器窗口偏好，打开失败可原位重试", async () => {
  const user = userEvent.setup();
  render(guide());
  const link = screen.getByRole("link", { name: "获取 Token" });
  localStorage.setItem("fstodo.link-opening-mode.v1", "existing-browser");
  vi.mocked(invoke).mockRejectedValueOnce("无法打开系统浏览器");
  await user.click(link);
  expect(invoke).toHaveBeenLastCalledWith("open_external_url", { url: configurationUrl, newWindow: false });
  expect((await screen.findByRole("alert")).textContent).toContain("无法打开系统浏览器");

  localStorage.setItem("fstodo.link-opening-mode.v1", "new-window");
  await user.click(link);
  expect(invoke).toHaveBeenLastCalledWith("open_external_url", { url: configurationUrl, newWindow: true });
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each(["关闭按钮", "Escape"])("放大图片通过%s关闭后恢复入口焦点，不提交或清空 Token 草稿", async (method) => {
  const user = userEvent.setup();
  const submit = vi.fn();
  render(<form onSubmit={(event) => { event.preventDefault(); submit(); }}>{guide()}</form>);
  const input = screen.getByLabelText("MCP Token") as HTMLInputElement;
  await user.type(input, "test-only-token-draft");
  await user.click(screen.getByRole("button", { name: "查看教程" }));
  await user.click(screen.getByText("找不到配置入口？"));
  for (const title of ["选择 HTTP Header 并复制 Token", "从飞书工作台打开飞书项目", "进入 MCP 配置"]) {
    const trigger = screen.getByRole("button", { name: `放大：${title}` });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: title });
    expect(within(dialog).getByRole("img").getAttribute("src")).toBeTruthy();
    if (method === "Escape") {
      // jsdom 不实现 Escape 的原生 dialog 行为，派发浏览器产生的 cancel 事件。
      fireEvent(dialog, new Event("cancel", { cancelable: true }));
    } else {
      await user.click(within(dialog).getByRole("button", { name: "关闭教程图片" }));
    }
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  }
  expect(input.value).toBe("test-only-token-draft");
  expect(submit).not.toHaveBeenCalled();
});
