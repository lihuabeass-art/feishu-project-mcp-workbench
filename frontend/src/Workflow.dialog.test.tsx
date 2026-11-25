// @vitest-environment jsdom
import { createRef } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { getWorkflowActions } from "./api";
import { Workflow } from "./Workflow";
import type { WorkflowAction } from "./types";

vi.mock("./api", () => ({ getWorkflowActions: vi.fn() }));
const item = { id: { project_key: "space", work_item_type_key: "issue", work_item_id: "dialog" }, name: "滚动与核对" };
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); });

it.each(["state", "node", "schedule-node"] as const)("%s 的填写与核对统一在独立弹层，关闭不触发外层 Escape 并保留草稿", async (kind) => {
  const action: WorkflowAction = { id: kind === "state" ? "state:fix" : "node:confirm:n", kind: kind === "state" ? "state" : "node", label: "处理流程",
    fields: [{ key: "notes", label: "说明", kind: "text", required: false }] };
  vi.mocked(getWorkflowActions).mockResolvedValue({ version: "v1", actions: [action] });
  const outerEscape = vi.fn();
  const triggerRef = createRef<HTMLButtonElement>();
  const view = render(<div onKeyDown={outerEscape}>
    <button ref={triggerRef}>查看节点动作</button>
    <Workflow item={item} available busy={false} submit={vi.fn()}
      scheduleNode={kind === "schedule-node" ? { id: "n", name: "开发", triggerRef } : undefined} />
  </div>);
  const trigger = await screen.findByRole("button", { name: "处理流程" });
  fireEvent.click(trigger);
  const title = kind === "schedule-node" ? "开发 流程操作" : "流程操作";
  const dialog = screen.getByRole("dialog", { name: title });
  expect(view.container.contains(dialog)).toBe(false);
  expect(document.activeElement).toBe(within(dialog).getByRole("heading", { name: title }));
  fireEvent.change(within(dialog).getByRole("textbox", { name: "说明" }), { target: { value: "未提交的草稿" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "提交" }));
  expect(within(dialog).getByRole("region", { name: "提交前二次确认" }).textContent).toContain("未提交的草稿");
  expect(document.activeElement).toBe(within(dialog).getByRole("heading", { name: title }));
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(outerEscape).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(kind === "schedule-node" ? triggerRef.current : trigger);
  fireEvent.click(trigger);
  expect(screen.getByRole("textbox", { name: "说明" })).toHaveProperty("value", "未提交的草稿");
});

it("滚动区允许内部滚动，顶部、底部、短表单、标题与遮罩隔离背景，关闭后释放监听", async () => {
  vi.mocked(getWorkflowActions).mockResolvedValue({ version: "v1", actions: [{ id: "state:fix", kind: "state", label: "处理流程", fields: [] }] });
  const backgroundWheel = vi.fn();
  render(<div onWheel={backgroundWheel}><p>背景</p><Workflow item={item} available busy={false} submit={vi.fn()} /></div>);
  fireEvent.click(await screen.findByRole("button", { name: "处理流程" }));
  const dialog = screen.getByRole("dialog", { name: "流程操作" });
  const stage = dialog.querySelector<HTMLElement>(".workflow-stage")!;
  stage.style.overflowY = "auto";
  let height = 600;
  Object.defineProperties(stage, { clientHeight: { value: 200 }, scrollHeight: { get: () => height } });
  const wheel = (target: Element, deltaY: number) => {
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY });
    fireEvent(target, event);
    return event.defaultPrevented;
  };
  for (const [top, delta, blocked] of [[0, -40, true], [0, 40, false], [100, 40, false], [100, -40, false], [400, 40, true], [400, -40, false]] as const) {
    stage.scrollTop = top;
    expect(wheel(stage.querySelector("strong")!, delta)).toBe(blocked);
  }
  expect(wheel(within(dialog).getByRole("heading"), 40)).toBe(true);
  expect(wheel(dialog.parentElement!, 40)).toBe(true);
  height = 200;
  stage.scrollTop = 0;
  for (const delta of [40, 40, -40]) expect(wheel(stage, delta)).toBe(true);
  expect(backgroundWheel).not.toHaveBeenCalled();
  const backdrop = dialog.parentElement!;
  fireEvent.click(within(dialog).getByRole("button", { name: "关闭流程表单" }));
  expect(wheel(backdrop, 40)).toBe(false);
  expect(wheel(screen.getByText("背景"), 40)).toBe(false);
  expect(backgroundWheel).toHaveBeenCalledOnce();
});

it("从回滚下拉进入后关闭弹层将焦点还给回滚按钮", async () => {
  vi.mocked(getWorkflowActions).mockResolvedValue({ version: "v1", actions: ["a", "b"].map((node) => ({
    id: `node:rollback:${node}`, kind: "node", label: `回滚到${node}`, fields: [],
  })) });
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={vi.fn()} />);
  const trigger = await screen.findByRole("combobox", { name: "回滚节点" });
  await user.click(trigger);
  await user.click(screen.getByRole("option", { name: "回滚到a" }));
  await user.click(screen.getByRole("button", { name: "关闭流程表单" }));
  expect(document.activeElement).toBe(trigger);
});
