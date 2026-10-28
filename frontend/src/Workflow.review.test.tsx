// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
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
import type { CachedItem, WorkflowOptions } from "./types";

vi.mock("./api", () => ({ getWorkflowActions: vi.fn() }));
const item = {
  id: { project_key: "p", work_item_type_key: "story", work_item_id: "review" },
  name: "待推进的需求",
} as CachedItem;
const notes = "云端说明第一行\n第二行";
function options(): WorkflowOptions {
  return {
    version: "v1",
    actions: [
      {
        id: "node:confirm:n",
        label: "完成开发节点",
        kind: "node",
        fields: [
          {
            key: "doc",
            label: "代码版本号",
            kind: "text",
            required: true,
            initial_value: "旧版本",
            scope: "work_item",
          },
          {
            key: "progress",
            label: "进度",
            kind: "number",
            required: true,
            initial_value: "50",
            unit: "percent",
            scope: "node",
          },
          {
            key: "points:a",
            label: "估分 · 甲",
            kind: "number",
            required: false,
            initial_value: "1",
            scope: "assignee",
            step: 0.5,
          },
          {
            key: "points:b",
            label: "估分 · 乙",
            kind: "number",
            required: false,
            initial_value: "1",
            scope: "assignee",
            step: 0.5,
          },
          {
            key: "hours:a",
            label: "工时 · 甲",
            kind: "number",
            required: false,
            initial_value: "0",
            scope: "assignee",
          },
          {
            key: "start:a",
            label: "排期 · 甲 · 开始日期",
            kind: "date",
            required: false,
            initial_value: "2026-10-27",
            scope: "assignee",
          },
          {
            key: "end:a",
            label: "排期 · 甲 · 结束日期",
            kind: "date",
            required: false,
            initial_value: "2026-10-27",
            scope: "assignee",
          },
          {
            key: "result",
            label: "解决结果",
            kind: "select",
            required: true,
            initial_value: "fixed",
            scope: "work_item",
            options: [{ value: "fixed", label: "已修复" }],
          },
          {
            key: "notes",
            label: "说明",
            kind: "textarea",
            required: false,
            initial_value: notes,
            scope: "work_item",
          },
          {
            key: "empty",
            label: "补充信息",
            kind: "text",
            required: false,
            scope: "work_item",
          },
        ],
      },
    ],
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(getWorkflowActions).mockResolvedValue(options());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function reviewRow(label: string) {
  const review = screen.getByRole("region", { name: "提交前二次确认" });
  return within(review)
    .getByText(label, { selector: "dt > span" })
    .closest("div")!;
}
async function confirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(
    screen.getByRole("button", {
      name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/,
    }),
  );
}

it("修改部分字段后完整展示两位负责人的未改估分、零值工时及所有字段，实际仅写入修改项", async () => {
  const submit = vi
    .fn()
    .mockResolvedValue({ outcome: "verified", verified: true });
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: "完成开发节点" }));
  fireEvent.change(screen.getByLabelText("代码版本号（必填）"), {
    target: { value: "新版本" },
  });
  fireEvent.change(screen.getByLabelText("进度（必填）"), {
    target: { value: "100" },
  });
  fireEvent.change(screen.getByLabelText("排期 · 甲 · 开始日期"), {
    target: { value: "2026-10-28" },
  });
  await user.click(screen.getByRole("button", { name: "提交" }));
  const review = await screen.findByRole("region", { name: "提交前二次确认" });
  expect(review.querySelectorAll("dt")).toHaveLength(
    options().actions[0].fields.length,
  );
  for (const owner of ["甲", "乙"]) {
    const row = within(reviewRow(`估分 · ${owner}`));
    expect(row.getByText("1")).toBeTruthy();
    expect(row.getByText("沿用云端")).toBeTruthy();
  }
  expect(within(reviewRow("工时 · 甲")).getByText("0")).toBeTruthy();
  expect(
    within(reviewRow("排期 · 甲 · 结束日期")).getByText("2026-10-27"),
  ).toBeTruthy();
  expect(within(reviewRow("解决结果")).getByText("已修复")).toBeTruthy();
  expect(reviewRow("说明").textContent).toContain(notes);
  expect(within(reviewRow("补充信息")).getByText("未填写")).toBeTruthy();
  const version = within(reviewRow("代码版本号"));
  expect(version.getByText("本次修改")).toBeTruthy();
  expect(version.getByText("新版本")).toBeTruthy();
  expect(
    within(
      version.getByRole("group", { name: "代码版本号云端当前值" }),
    ).getByText("旧版本"),
  ).toBeTruthy();
  const progress = within(reviewRow("进度"));
  expect(progress.getByText("100%")).toBeTruthy();
  expect(
    within(progress.getByRole("group", { name: "进度云端当前值" })).getByText(
      "50%",
    ),
  ).toBeTruthy();
  expect(within(review).getByLabelText("核对概览").textContent).toContain(
    "3 项修改",
  );
  expect(within(review).getByLabelText("核对概览").textContent).toContain(
    "7 项沿用云端",
  );
  expect(within(review).getByRole("region", { name: "事项信息" })).toBeTruthy();
  expect(within(review).getByRole("region", { name: "节点信息" })).toBeTruthy();
  expect(
    within(review).getByRole("region", { name: "负责人信息" }),
  ).toBeTruthy();
  expect(review.textContent).toContain("未修改的字段沿用云端值");
  expect(submit).not.toHaveBeenCalled();
  await confirm(user);
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0].fields).toEqual({
    doc: "新版本",
    progress: "100",
    "start:a": "2026-10-28",
  });
});

it("短值、长值和多行内容使用相同的字段、数值、状态结构，完整保留对比标签", async () => {
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: "完成开发节点" }));
  const long = "feat/xiaojianqiu/chat-thinking-display";
  fireEvent.change(screen.getByLabelText("代码版本号（必填）"), {
    target: { value: long },
  });
  fireEvent.change(screen.getByLabelText("估分 · 甲"), {
    target: { value: "1.5" },
  });
  fireEvent.change(screen.getByLabelText("说明"), {
    target: { value: `${notes}\n第三行` },
  });
  await user.click(screen.getByRole("button", { name: "提交" }));
  await screen.findByRole("region", { name: "提交前二次确认" });
  const points = reviewRow("估分 · 甲");
  expect(points.className).toContain("is-changed");
  expect(points.querySelector(".workflow-review-arrow")).not.toBeNull();
  for (const label of ["估分 · 甲", "代码版本号", "说明"]) {
    const row = reviewRow(label);
    expect(row.className).toBe("workflow-review-row is-changed");
    for (const valueLabel of ["云端当前值：", "本次提交值"])
      expect(within(row).getByText(valueLabel).className).not.toContain(
        "sr-only",
      );
    expect(within(row).getByText("本次修改").closest("dd")).not.toBeNull();
    expect(within(row).getByText("本次修改").closest("dt")).toBeNull();
  }
  expect(reviewRow("代码版本号").textContent).toContain(long);
  const unchanged = reviewRow("估分 · 乙");
  expect(unchanged.className).not.toContain("is-changed");
  expect(unchanged.querySelector(".workflow-review-arrow")).toBeNull();
});

it.each([undefined, "", " \n "])(
  "云端日期为 %j 时仅显示新值，零值估分仍展示对比且提交范围不变",
  async (empty) => {
    const current = options();
    current.actions[0].fields.find(
      (field) => field.key === "end:a",
    )!.initial_value = empty;
    current.actions[0].fields.find(
      (field) => field.key === "points:a",
    )!.initial_value = "0";
    vi.mocked(getWorkflowActions).mockResolvedValue(current);
    const submit = vi
      .fn()
      .mockResolvedValue({ outcome: "verified", verified: true });
    const user = userEvent.setup();
    render(<Workflow item={item} available busy={false} submit={submit} />);
    await user.click(
      await screen.findByRole("button", { name: "完成开发节点" }),
    );
    fireEvent.change(screen.getByLabelText("排期 · 甲 · 结束日期"), {
      target: { value: "2026-10-28" },
    });
    fireEvent.change(screen.getByLabelText("估分 · 甲"), {
      target: { value: "1" },
    });
    await user.click(screen.getByRole("button", { name: "提交" }));
    await screen.findByRole("region", { name: "提交前二次确认" });
    const date = reviewRow("排期 · 甲 · 结束日期");
    expect(
      within(date).queryByRole("group", {
        name: "排期 · 甲 · 结束日期云端当前值",
      }),
    ).toBeNull();
    expect(date.querySelector(".workflow-review-comparison")).toBeNull();
    expect(date.querySelector(".workflow-review-arrow")).toBeNull();
    expect(within(date).getByText("本次新增")).toBeTruthy();
    expect(within(date).queryByText("本次修改")).toBeNull();
    expect(
      within(date).getByRole("group", {
        name: "排期 · 甲 · 结束日期本次提交值",
      }).textContent,
    ).toContain("2026-10-28");
    expect(
      within(reviewRow("估分 · 甲")).getByRole("group", {
        name: "估分 · 甲云端当前值",
      }).textContent,
    ).toContain("0");
    expect(within(reviewRow("估分 · 甲")).getByText("本次修改")).toBeTruthy();
    const summary = screen.getByLabelText("核对概览");
    expect(summary.textContent).toContain("1 项新增");
    expect(summary.textContent).toContain("1 项修改");
    expect(summary.textContent).toContain("8 项沿用云端");
    await confirm(user);
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0].fields).toEqual({
      "end:a": "2026-10-28",
      "points:a": "1",
    });
  },
);

it.each(["node", "state"] as const)(
  "%s 流程无字段修改时仍展示完整云端值，确认后仅执行流程操作",
  async (kind) => {
    const current = options();
    current.actions[0].kind = kind;
    current.actions[0].id = kind === "node" ? "node:confirm:n" : "state:next";
    if (kind === "state") current.actions[0].label = "流转到「已完成」";
    vi.mocked(getWorkflowActions).mockResolvedValue(current);
    const submit = vi
      .fn()
      .mockResolvedValue({ outcome: "verified", verified: true });
    const user = userEvent.setup();
    render(<Workflow item={item} available busy={false} submit={submit} />);
    await user.click(
      await screen.findByRole("button", { name: current.actions[0].label }),
    );
    await user.click(screen.getByRole("button", { name: "提交" }));
    const review = await screen.findByRole("region", {
      name: "提交前二次确认",
    });
    expect(review.querySelectorAll("dt")).toHaveLength(
      current.actions[0].fields.length,
    );
    expect(within(review).getAllByText("沿用云端")).toHaveLength(
      current.actions[0].fields.length,
    );
    expect(within(reviewRow("代码版本号")).getByText("旧版本")).toBeTruthy();
    expect(within(reviewRow("估分 · 甲")).getByText("1")).toBeTruthy();
    expect(within(reviewRow("解决结果")).getByText("已修复")).toBeTruthy();
    expect(review.textContent).toContain("字段无修改，仅执行流程操作。");
    await confirm(user);
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0].fields).toEqual({});
  },
);

it("旧表单缺少字段范围时完整显示，保留字段顺序和返回修改后的本机填写", async () => {
  const current = options();
  for (const field of current.actions[0].fields) delete field.scope;
  vi.mocked(getWorkflowActions).mockResolvedValue(current);
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: "完成开发节点" }));
  fireEvent.change(screen.getByLabelText("代码版本号（必填）"), {
    target: { value: "本机填写" },
  });
  await user.click(screen.getByRole("button", { name: "提交" }));
  const review = await screen.findByRole("region", { name: "提交前二次确认" });
  const group = within(review).getByRole("region", { name: "字段信息" });
  expect(
    Array.from(
      group.querySelectorAll("dt > span"),
      (label) => label.textContent,
    ),
  ).toEqual(current.actions[0].fields.map((field) => field.label));
  await user.click(screen.getByRole("button", { name: "返回修改" }));
  expect(
    (screen.getByLabelText("代码版本号（必填）") as HTMLInputElement).value,
  ).toBe("本机填写");
});

it("可选说明留空时确认页显示实际保留的云端内容，本机修改值按提交规则去除首尾空白", async () => {
  const submit = vi
    .fn()
    .mockResolvedValue({ outcome: "verified", verified: true });
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: "完成开发节点" }));
  fireEvent.change(screen.getByLabelText("说明"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("代码版本号（必填）"), {
    target: { value: " 新版本 " },
  });
  await user.click(screen.getByRole("button", { name: "提交" }));
  await screen.findByRole("region", { name: "提交前二次确认" });
  expect(reviewRow("说明").textContent).toContain(notes);
  expect(within(reviewRow("说明")).getByText("沿用云端")).toBeTruthy();
  expect(within(reviewRow("代码版本号")).getByText("新版本").textContent).toBe(
    "新版本",
  );
  await confirm(user);
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0].fields).toEqual({ doc: " 新版本 " });
});

it("确认页使用提交前刚读取的完整云端快照，迟到的旧响应不回退未修改的估分", async () => {
  const submit = vi
    .fn()
    .mockResolvedValue({ outcome: "verified", verified: true });
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  const open = await screen.findByRole("button", { name: "完成开发节点" });
  let resolve!: (value: WorkflowOptions) => void;
  vi.mocked(getWorkflowActions).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await user.click(open);
  fireEvent.change(screen.getByLabelText("代码版本号（必填）"), {
    target: { value: "新版本" },
  });
  const latest = options();
  latest.version = "v2";
  latest.actions[0].fields.find(
    (field) => field.key === "points:a",
  )!.initial_value = "2";
  vi.mocked(getWorkflowActions).mockResolvedValue(latest);
  await user.click(screen.getByRole("button", { name: "提交" }));
  await screen.findByRole("region", { name: "提交前二次确认" });
  expect(within(reviewRow("估分 · 甲")).getByText("2")).toBeTruthy();
  await act(async () => resolve(options()));
  expect(within(reviewRow("估分 · 甲")).getByText("2")).toBeTruthy();
  expect(within(reviewRow("估分 · 甲")).queryByText("1")).toBeNull();
  await confirm(user);
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0]).toMatchObject({
    version: "v2",
    fields: { doc: "新版本" },
  });
});

it.each([
  ["node:confirm:n", "node", "完成开发节点", "确认完成节点"],
  ["node:rollback:n", "node", "回滚到开发节点", "确认回滚节点"],
  ["state:42:done", "state", "流转到「已完成」", "确认流转到「已完成」"],
  ["node:progress:n", "node", "同步开发进度", "确认同步进度"],
  ["legacy", "node", "旧版动作", "确认提交并执行"],
] as const)(
  "%s 的最终按钮明确表达动作并保留核对门槛",
  async (id, kind, label, expected) => {
    const current = options();
    current.actions[0] = {
      id,
      kind,
      label,
      fields: [current.actions[0].fields[1]],
    };
    if (id.startsWith("node:progress:"))
      current.actions.unshift({
        ...current.actions[0],
        id: "node:confirm:n",
        label: "完成开发节点",
      });
    vi.mocked(getWorkflowActions).mockResolvedValue(current);
    const submit = vi
      .fn()
      .mockResolvedValue({ outcome: "verified", verified: true });
    const user = userEvent.setup();
    render(<Workflow item={item} available busy={false} submit={submit} />);
    await user.click(
      await screen.findByRole("button", { name: current.actions[0].label }),
    );
    fireEvent.change(screen.getByLabelText("进度（必填）"), {
      target: { value: "100" },
    });
    if (id.startsWith("node:progress:"))
      await user.click(screen.getByRole("button", { name: "仅同步此进度" }));
    await user.click(
      screen.getByRole("button", {
        name: id.startsWith("node:progress:") ? "同步进度" : "提交",
      }),
    );
    const review = await screen.findByRole("region", {
      name: "提交前二次确认",
    });
    const button = within(review).getByRole("button", { name: expected });
    expect(button).toHaveProperty("disabled", true);
    expect(submit).not.toHaveBeenCalled();
    if (id.startsWith("node:rollback:"))
      expect(review.textContent).toContain("提交后将回滚节点");
    if (id.startsWith("node:progress:"))
      expect(review.textContent).toContain("100% 也不会自动进入下一个节点");
    await user.click(within(review).getByRole("button", { name: /^我已核对/ }));
    expect(button).toHaveProperty("disabled", false);
    await user.click(button);
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0]).toMatchObject({
      action_id: id,
      fields: { progress: "100" },
    });
  },
);
