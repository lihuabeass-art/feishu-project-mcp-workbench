// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workflow } from "./Workflow";
import { getWorkflowActions } from "./api";
import type { CachedItem, WorkflowAction, WorkflowOptions } from "./types";

vi.mock("./api", () => ({ getWorkflowActions: vi.fn() }));
type Field = WorkflowAction["fields"][number];
const item = {
  id: { project_key: "p", work_item_type_key: "story", work_item_id: "layout" },
  name: "排版需求",
} as CachedItem;
const hint = "按负责人分别填写，单位沿用飞书配置";
const owned = (
  key: string,
  owner: string,
  column: string,
  extra: Partial<Field> = {},
): Field => ({
  key,
  label: `${column} · ${owner}`,
  kind: "number",
  required: false,
  scope: "assignee",
  owner,
  column,
  hint,
  ...extra,
});
function options(fields: Field[]): WorkflowOptions {
  return {
    version: "v1",
    actions: [
      {
        id: "node:confirm:n",
        label: "完成节点",
        kind: "node",
        description: "完成后进入下一节点",
        fields,
      },
    ],
  };
}
const team = () => [
  owned("hours:a", "甲", "实际工时", { required: true }),
  owned("hours:b", "乙", "实际工时", { required: true, initial_value: "2" }),
  owned("points:a", "甲", "估分", { initial_value: "1", step: 0.5 }),
  owned("points:b", "乙", "估分", { initial_value: "1", step: 0.5 }),
];
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(getWorkflowActions).mockResolvedValue(options(team()));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("多位负责人按「人 × 指标」表格排布，说明只出现一次，必填空格有提示且仅写入修改项", async () => {
  const submit = vi
    .fn()
    .mockResolvedValue({ outcome: "verified", verified: true });
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  const table = screen.getByRole("group", { name: "负责人实际工时、估分" });
  expect(
    Array.from(
      table.querySelectorAll(".workflow-owner-name"),
      (name) => name.textContent,
    ),
  ).toEqual(["甲", "乙"]);
  expect(screen.getAllByText(hint)).toHaveLength(1);
  const hours = screen.getByLabelText(
    "实际工时 · 甲（必填）",
  ) as HTMLInputElement;
  expect(table.contains(hours)).toBe(true);
  expect(hours.placeholder).toBe("必填");
  expect(hours.closest(".workflow-owner-cell")?.className).toContain(
    "is-missing",
  );
  expect(screen.getByRole("button", { name: "提交" })).toHaveProperty(
    "disabled",
    true,
  );
  fireEvent.change(hours, { target: { value: "3" } });
  expect(hours.placeholder).toBe("");
  expect(hours.closest(".workflow-owner-cell")?.className).not.toContain(
    "is-missing",
  );
  const points = screen.getByLabelText("估分 · 乙") as HTMLInputElement;
  fireEvent.change(points, { target: { value: "1.5" } });
  const note = screen.getByRole("group", { name: "估分 · 乙云端对照" });
  expect(note.closest(".workflow-owner-cell")).toBeNull();
  expect(note.closest(".workflow-owner-notes")).not.toBeNull();
  expect(note.textContent).toMatch(/^估分原值 1/);
  fireEvent.change(points, { target: { value: "" } });
  expect(points.placeholder).toBe("沿用 1");
  expect(screen.queryByRole("group", { name: "估分 · 乙云端对照" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "提交" }));
  const review = await screen.findByRole("region", { name: "提交前二次确认" });
  expect(review.textContent).not.toContain("完成后进入下一节点");
  await user.click(
    screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(
    screen.getByRole("button", {
      name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/,
    }),
  );
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0].fields).toEqual({ "hours:a": "3" });
});

it("只有一位负责人时逐项排列，保留字段名与说明", async () => {
  vi.mocked(getWorkflowActions).mockResolvedValue(
    options(team().filter((field) => field.owner === "甲")),
  );
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  expect(screen.queryByRole("group", { name: /^负责人/ })).toBeNull();
  expect(document.querySelector(".workflow-owner-table")).toBeNull();
  expect(screen.getByLabelText("实际工时 · 甲（必填）")).toBeTruthy();
  expect(screen.getByLabelText("估分 · 甲")).toBeTruthy();
  expect(screen.getAllByText(hint)).toHaveLength(1);
});

it("编辑页保留动作说明，草稿状态位于底部操作区", async () => {
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  expect(screen.getByText("完成后进入下一节点")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("估分 · 甲"), {
    target: { value: "1.5" },
  });
  const status = await screen.findByText("草稿已保存在本机");
  expect(status.closest(".workflow-footer")).not.toBeNull();
  expect(status.closest(".workflow-scroll")).toBeNull();
});

it("确认页先核对节点，再按负责人归拢全部字段；缺少结构化列名的字段保留完整标签", async () => {
  const fields = [
    {
      key: "doc",
      label: "代码版本号",
      kind: "text",
      required: false,
      scope: "work_item",
      initial_value: "v1",
    } as Field,
    ...team(),
    owned("start:a", "甲", "开始日期", { kind: "date" }),
    owned("start:b", "乙", "开始日期", {
      kind: "date",
      initial_value: "2026-10-27",
    }),
    {
      key: "legacy",
      label: "旧版说明 · 甲",
      kind: "text",
      required: false,
      scope: "assignee",
      owner: "甲",
      initial_value: "完整保留",
    } as Field,
    {
      key: "progress",
      label: "进度",
      kind: "number",
      required: true,
      scope: "node",
      initial_value: "50",
      unit: "percent",
    } as Field,
  ];
  vi.mocked(getWorkflowActions).mockResolvedValue(options(fields));
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  fireEvent.change(screen.getByLabelText("实际工时 · 甲（必填）"), {
    target: { value: "0" },
  });
  fireEvent.change(screen.getByLabelText("开始日期 · 甲"), {
    target: { value: "2026-10-28" },
  });
  await user.click(screen.getByRole("button", { name: "提交" }));
  const review = await screen.findByRole("region", { name: "提交前二次确认" });
  expect(
    Array.from(review.querySelectorAll("h5"), (h) => h.textContent),
  ).toEqual(["节点信息", "负责人信息", "事项信息"]);
  expect(review.querySelectorAll("dt")).toHaveLength(fields.length);
  for (const owner of ["甲", "乙"]) {
    const group = within(review).getByRole("group", { name: owner });
    expect(
      Array.from(
        group.querySelectorAll("dt > span"),
        (label) => label.textContent,
      ),
    ).toEqual(["实际工时", "估分", "开始日期"]);
    expect(
      within(review).getAllByRole("heading", { name: owner }),
    ).toHaveLength(1);
    expect(within(group).getByText("1")).toBeTruthy();
  }
  expect(
    within(within(review).getByRole("group", { name: "甲" })).getByText("0"),
  ).toBeTruthy();
  expect(
    within(review).getByText("旧版说明 · 甲").closest(".workflow-review-owner"),
  ).toBeNull();
  expect(within(review).getByText("完整保留")).toBeTruthy();
  expect(within(review).getByText("2026-10-27")).toBeTruthy();
  const notice = review.querySelector(".workflow-review-notice")!;
  expect(notice.closest(".workflow-footer")).not.toBeNull();
  expect(notice.closest(".workflow-scroll")).toBeNull();
  expect(
    within(review).getByRole("button", { name: "确认完成节点" }),
  ).toHaveProperty("disabled", true);
});
