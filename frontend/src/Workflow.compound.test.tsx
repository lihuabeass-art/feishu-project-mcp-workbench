// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workflow } from "./Workflow";
import { getWorkflowActions } from "./api";
import type { CachedItem, WorkflowOptions } from "./types";

vi.mock("./api", () => ({ getWorkflowActions: vi.fn() }));
const item = { id: { project_key: "p", work_item_type_key: "story", work_item_id: "compound" }, name: "产品验收" } as CachedItem;
const key = (owner: string, field: string) => JSON.stringify({ Compound: { work_item: false, path: [{ field_key: "review", owner }], field } });
const options: WorkflowOptions = { version: "compound-v1", actions: [{
  id: "node:confirm:acceptance", label: "完成产品经理验收", kind: "node", fields: [
    { key: key("a", "decision"), label: "验收信息 · 结论 · 甲", kind: "select", required: true, scope: "assignee", owner: "甲", column: "验收信息 · 结论",
      options: [{ value: "pass", label: "已通过" }, { value: "reject", label: "未通过" }] },
    { key: key("a", "opinion"), label: "验收信息 · 意见 · 甲", kind: "textarea", required: true, scope: "assignee", owner: "甲", column: "验收信息 · 意见" },
    { key: key("b", "decision"), label: "验收信息 · 结论 · 乙", kind: "select", required: false, scope: "assignee", owner: "乙", column: "验收信息 · 结论",
      initial_value: "reject", options: [{ value: "pass", label: "已通过" }, { value: "reject", label: "未通过" }] },
  ],
}] };

beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); vi.mocked(getWorkflowActions).mockResolvedValue(options); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("负责人复合字段恢复草稿、按名称确认云端值，并保留路径仅提交实际填写项", async () => {
  const user = userEvent.setup();
  const submit = vi.fn().mockResolvedValue({ outcome: "verified", verified: true });
  const view = render(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: "完成产品经理验收" }));
  await user.click(screen.getByRole("combobox", { name: "验收信息 · 结论 · 甲" }));
  await user.click(screen.getByRole("option", { name: "已通过" }));
  fireEvent.change(screen.getByLabelText("验收信息 · 意见 · 甲（必填）"), { target: { value: "功能验收通过\n补充说明" } });
  view.unmount();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: "完成产品经理验收" }));
  expect((screen.getByLabelText("验收信息 · 意见 · 甲（必填）") as HTMLTextAreaElement).value).toBe("功能验收通过\n补充说明");
  await user.click(screen.getByRole("button", { name: "提交" }));
  const review = await screen.findByRole("region", { name: "提交前二次确认" });
  expect(review.querySelectorAll("dt")).toHaveLength(3);
  expect(within(review).getByText("已通过")).toBeTruthy();
  expect(within(review).getByText("未通过")).toBeTruthy();
  expect(within(review).getByText("沿用云端")).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"));
  await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit.mock.calls[0][0].fields).toEqual({ [key("a", "decision")]: "pass", [key("a", "opinion")]: "功能验收通过\n补充说明" });
});
