// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkflowSettings } from "./WorkflowSettings";
import {
  loadWorkflowSkipConfirmation,
  workflowSkipConfirmationKey,
} from "./workflowPreferences";

const originalShow = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "showModal",
);
const originalClose = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "close",
);
beforeEach(() => {
  localStorage.clear();
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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const [name, descriptor] of [
    ["showModal", originalShow],
    ["close", originalClose],
  ] as const) {
    if (descriptor)
      Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});
const toggle = () =>
  screen.getByRole("switch", {
    name: "关闭流程操作二次确认",
  }) as HTMLInputElement;
const acknowledge = "我已了解风险，仍要关闭流程操作二次确认";

it("默认保留确认；取消、Esc 和点击遮罩均不改变偏好并返回焦点", async () => {
  const user = userEvent.setup();
  render(<WorkflowSettings />);
  expect(toggle().checked).toBe(false);
  expect(toggle().getAttribute("aria-describedby")).toBeTruthy();
  expect(
    document.getElementById(toggle().getAttribute("aria-describedby")!)?.textContent,
  ).toContain("仅同步进度和日期将直接提交；新建表单仍需核对");
  await user.click(toggle());
  const dialog = screen.getByRole("dialog", { name: "关闭前，请三思" });
  expect(toggle().checked).toBe(false);
  expect(
    (screen.getByRole("button", { name: "仍要关闭" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(dialog.textContent).toContain("新建表单的二次确认始终保留");
  expect(dialog.textContent).toContain("仅同步进度和日期在提交时将直接执行");
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "保留二次确认" }),
  );
  await user.click(screen.getByRole("button", { name: "保留二次确认" }));
  expect(loadWorkflowSkipConfirmation()).toBe(false);
  expect(document.activeElement).toBe(toggle());
  await user.click(toggle());
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  await user.click(toggle());
  fireEvent.click(document.querySelector(".workflow-confirmation-overlay")!);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(localStorage.getItem(workflowSkipConfirmationKey)).toBeNull();
});

it("键盘确认风险后才启用，重挂载恢复；恢复二次确认即时生效且再次关闭仍须确认", async () => {
  const user = userEvent.setup();
  const mounted = render(<WorkflowSettings />);
  toggle().focus();
  await user.keyboard(" ");
  const risk = screen.getByRole("button", { name: acknowledge });
  risk.focus();
  await user.keyboard(" ");
  await user.click(screen.getByRole("button", { name: "仍要关闭" }));
  expect(toggle().checked).toBe(true);
  expect(loadWorkflowSkipConfirmation()).toBe(true);
  mounted.unmount();
  render(<WorkflowSettings />);
  expect(toggle().checked).toBe(true);
  await user.click(toggle());
  expect(toggle().checked).toBe(false);
  expect(screen.queryByRole("dialog")).toBeNull();
  await user.click(toggle());
  expect(
    screen
      .getByRole("button", { name: acknowledge })
      .getAttribute("aria-pressed"),
  ).toBe("false");
  expect(
    (screen.getByRole("button", { name: "仍要关闭" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("保存失败时不关闭二次确认，确认弹窗保留以便重新保存", async () => {
  const feedback = vi.fn();
  const user = userEvent.setup();
  render(<WorkflowSettings onFeedback={feedback} />);
  await user.click(toggle());
  await user.click(screen.getByRole("button", { name: acknowledge }));
  vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("quota");
  });
  await user.click(screen.getByRole("button", { name: "仍要关闭" }));
  expect(screen.getByRole("alert").textContent).toContain("未能保存");
  expect(toggle().checked).toBe(false);
  expect(feedback).toHaveBeenLastCalledWith(
    expect.objectContaining({ state: "failed" }),
  );
  await user.click(screen.getByRole("button", { name: "仍要关闭" }));
  expect(toggle().checked).toBe(true);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("跨窗口同步与清空存储均更新开关；禁用或中途禁用不能确认关闭", async () => {
  const user = userEvent.setup();
  const mounted = render(<WorkflowSettings />);
  localStorage.setItem(workflowSkipConfirmationKey, "true");
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: workflowSkipConfirmationKey }),
    ),
  );
  expect(toggle().checked).toBe(true);
  localStorage.clear();
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
  expect(toggle().checked).toBe(false);
  await user.click(toggle());
  mounted.rerender(<WorkflowSettings disabled />);
  expect(screen.queryByRole("dialog")).toBeNull();
  await user.click(toggle());
  expect(loadWorkflowSkipConfirmation()).toBe(false);
});

it("旧版其他偏好或无效值不会关闭确认，无法读取存储时保留确认", () => {
  localStorage.setItem("fstodo.creation-prefill-local-defaults.v1", "true");
  for (const value of ["false", "1", "invalid", '"true"']) {
    localStorage.setItem(workflowSkipConfirmationKey, value);
    expect(loadWorkflowSkipConfirmation()).toBe(false);
  }
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(loadWorkflowSkipConfirmation()).toBe(false);
});

it("确认弹窗的说明、操作栏及遮罩滚轮均隔离背景，内部长内容保留原生滚动", async () => {
  const user = userEvent.setup();
  render(<WorkflowSettings />);
  await user.click(toggle());
  const content = document.querySelector<HTMLElement>(
    ".workflow-confirmation-content",
  )!;
  const overlay = document.querySelector<HTMLElement>(
    ".workflow-confirmation-overlay",
  )!;
  content.style.overflowY = "auto";
  Object.defineProperties(content, {
    clientHeight: { value: 100 },
    scrollHeight: { value: 300 },
  });
  function wheel(target: Element, deltaY: number) {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY,
    });
    fireEvent(target, event);
    return event.defaultPrevented;
  }
  content.scrollTop = 100;
  expect(wheel(content.querySelector("p")!, 20)).toBe(false);
  content.scrollTop = 0;
  expect(wheel(content, -20)).toBe(true);
  content.scrollTop = 200;
  expect(wheel(content.querySelector("button")!, 20)).toBe(true);
  expect(wheel(overlay, 20)).toBe(true);
});
