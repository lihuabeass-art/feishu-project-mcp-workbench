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
import { itemKey } from "./model";
import { draftKey, readDraft } from "./workflowDrafts";
import type {
  CachedItem,
  WorkflowAction,
  WorkflowOptions,
  WorkflowResult,
} from "./types";

vi.mock("./api", () => ({ getWorkflowActions: vi.fn() }));
const item = {
  id: {
    project_key: "p",
    work_item_type_key: "story",
    work_item_id: "schedule",
  },
  name: "需求",
} as CachedItem;
const completeId = "node:confirm:n1";
const scheduleId = "node:schedule:n1";
const acknowledgement = "我已核对开始和结束日期，本次仅同步日期并保留当前节点";
const scheduleKey = (property: string, owner: string | null = null) =>
  JSON.stringify({ Schedule: { property, owner } });
const startKey = scheduleKey("estimate_start_date");
const endKey = scheduleKey("estimate_end_date");
const result: WorkflowResult = {
  outcome: "verified",
  verified: true,
  message: "日期同步已核验",
  request_id: "r",
  action_id: scheduleId,
  resynced: false,
};

function options(start = "", end = "", owners: string[] = []): WorkflowOptions {
  const dates: WorkflowAction["fields"] = (
    owners.length ? owners : [null]
  ).flatMap((owner) =>
    [
      { property: "estimate_start_date", column: "开始日期", value: start },
      { property: "estimate_end_date", column: "结束日期", value: end },
    ].map(({ property, column, value }) => ({
      key: scheduleKey(property, owner),
      label: `排期${owner ? ` · ${owner}` : ""} · ${column}`,
      kind: "date" as const,
      required: true,
      initial_value: value,
      scope: owner ? ("assignee" as const) : ("node" as const),
      ...(owner ? { owner, column } : {}),
      hint: "按北京时间（UTC+8）保存日期",
    })),
  );
  return {
    version: "v1",
    actions: [
      {
        id: completeId,
        label: "完成设计节点",
        kind: "node",
        fields: [
          {
            key: "progress",
            label: "进度",
            kind: "number",
            unit: "percent",
            required: true,
            initial_value: "20",
          },
          {
            key: "points",
            label: "估分",
            kind: "number",
            required: true,
            initial_value: "",
          },
          ...dates,
          {
            key: "doc",
            label: "设计文档",
            kind: "text",
            required: true,
            initial_value: "",
          },
          {
            key: "hours",
            label: "工时",
            kind: "number",
            required: false,
            initial_value: "1",
          },
        ],
      },
      { id: scheduleId, label: "同步日期", kind: "node", fields: dates },
    ],
  };
}
async function open(submit = vi.fn()) {
  const view = render(
    <Workflow item={item} available busy={false} submit={submit} />,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成设计节点" }));
  return { view, user };
}
async function confirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "同步日期" }));
  await screen.findByRole("region", { name: "提交前二次确认" });
  await user.click(screen.getByLabelText(acknowledgement));
  await user.click(screen.getByRole("button", { name: "确认同步日期" }));
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

it("日期入口带入开始和结束，其他必填缺失不阻塞，确认只提交日期且保留完整表单草稿", async () => {
  const submit = vi.fn().mockResolvedValue(result);
  const { user } = await open(submit);
  fireEvent.change(screen.getByLabelText("排期 · 开始日期（必填）"), {
    target: { value: "2026-10-28" },
  });
  fireEvent.change(screen.getByLabelText("排期 · 结束日期（必填）"), {
    target: { value: "2026-10-30" },
  });
  fireEvent.change(screen.getByRole("slider"), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("工时"), { target: { value: "3" } });
  expect(
    (screen.getByRole("button", { name: "提交" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "仅同步此日期" }));
  expect(
    (screen.getByLabelText("排期 · 开始日期（必填）") as HTMLInputElement)
      .value,
  ).toBe("2026-10-28");
  expect(
    (screen.getByLabelText("排期 · 结束日期（必填）") as HTMLInputElement)
      .value,
  ).toBe("2026-10-30");
  expect(screen.queryByLabelText("设计文档（必填）")).toBeNull();
  expect(screen.queryByRole("slider")).toBeNull();
  expect(screen.queryByLabelText("工时")).toBeNull();
  await user.click(screen.getByRole("button", { name: "同步日期" }));
  const review = await screen.findByRole("region", { name: "提交前二次确认" });
  expect(review.textContent).toContain("2026-10-28");
  expect(review.textContent).toContain("2026-10-30");
  expect(review.textContent).not.toContain("设计文档");
  expect(review.textContent).not.toContain("估分");
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByLabelText(acknowledgement));
  await user.click(screen.getByRole("button", { name: "确认同步日期" }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0]).toMatchObject({
    action_id: scheduleId,
    fields: { [startKey]: "2026-10-28", [endKey]: "2026-10-30" },
  });
  expect(submit.mock.calls[0][0].fields).toEqual({
    [startKey]: "2026-10-28",
    [endKey]: "2026-10-30",
  });
  expect(readDraft(draftKey(itemKey(item), completeId))?.fields).toMatchObject({
    progress: "100",
    hours: "3",
    [startKey]: "2026-10-28",
    [endKey]: "2026-10-30",
  });
});

it("仅修改开始日期时完整核对两个日期，结束日期沿用云端且不重复写入", async () => {
  vi.mocked(getWorkflowActions).mockResolvedValue(
    options("2026-10-27", "2026-10-30"),
  );
  const submit = vi.fn().mockResolvedValue(result);
  const { user } = await open(submit);
  fireEvent.change(screen.getByLabelText("排期 · 开始日期（必填）"), {
    target: { value: "2026-10-28" },
  });
  await user.click(screen.getByRole("button", { name: "仅同步此日期" }));
  await user.click(screen.getByRole("button", { name: "同步日期" }));
  const review = await screen.findByRole("region", { name: "提交前二次确认" });
  const end = within(review)
    .getByText("排期 · 结束日期", { selector: "dt > span" })
    .closest("div")!;
  expect(end.textContent).toContain("2026-10-30");
  expect(end.textContent).toContain("沿用云端");
  expect(review.textContent).toContain("2026-10-27");
  expect(review.textContent).toContain("2026-10-28");
  expect(review.textContent).not.toContain("仅执行流程操作");
  await user.click(screen.getByLabelText(acknowledgement));
  await user.click(screen.getByRole("button", { name: "确认同步日期" }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0].fields).toEqual({ [startKey]: "2026-10-28" });
});

it.each(["开始日期", "结束日期"])(
  "缺少%s时禁止同步，不发送请求",
  async (missing) => {
    const submit = vi.fn();
    const { user } = await open(submit);
    const filled = missing === "开始日期" ? "结束日期" : "开始日期";
    fireEvent.change(screen.getByLabelText(`排期 · ${filled}（必填）`), {
      target: { value: "2026-10-28" },
    });
    await user.click(screen.getByRole("button", { name: "仅同步此日期" }));
    const button = screen.getByRole("button", {
      name: "同步日期",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await user.click(button);
    expect(screen.queryByRole("region", { name: "提交前二次确认" })).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  },
);

it("多负责人日期表仅有一个日期入口，完整带入每位负责人的开始和结束日期", async () => {
  vi.mocked(getWorkflowActions).mockResolvedValue(
    options("2026-10-27", "2026-10-30", ["甲", "乙"]),
  );
  const submit = vi.fn().mockResolvedValue(result);
  const { user } = await open(submit);
  expect(screen.getAllByRole("button", { name: "仅同步此日期" })).toHaveLength(
    1,
  );
  fireEvent.change(screen.getByLabelText("排期 · 甲 · 开始日期（必填）"), {
    target: { value: "2026-10-28" },
  });
  fireEvent.change(screen.getByLabelText("排期 · 乙 · 结束日期（必填）"), {
    target: { value: "2026-10-31" },
  });
  await user.click(screen.getByRole("button", { name: "仅同步此日期" }));
  for (const owner of ["甲", "乙"]) {
    for (const column of ["开始日期", "结束日期"]) {
      expect(
        (
          screen.getByLabelText(
            `排期 · ${owner} · ${column}（必填）`,
          ) as HTMLInputElement
        ).value,
      ).toBe(
        owner === "甲" && column === "开始日期"
          ? "2026-10-28"
          : owner === "乙" && column === "结束日期"
            ? "2026-10-31"
            : column === "开始日期"
              ? "2026-10-27"
              : "2026-10-30",
      );
    }
  }
  await confirm(user);
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0].fields).toEqual({
    [scheduleKey("estimate_start_date", "甲")]: "2026-10-28",
    [scheduleKey("estimate_end_date", "乙")]: "2026-10-31",
  });
});

it("完成节点被其他未支持必填项阻止时仍可进入日期同步，顶层不重复展示日期动作", async () => {
  const current = options("2026-10-27", "2026-10-30");
  current.actions[0].disabled_reason = "完成前有暂不支持填写的必填项：附件";
  vi.mocked(getWorkflowActions).mockResolvedValue(current);
  const submit = vi.fn().mockResolvedValue(result);
  render(<Workflow item={item} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  const button = await screen.findByRole("button", { name: "完成设计节点" });
  expect((button as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole("button", { name: "同步日期" })).toBeNull();
  await user.click(button);
  await user.click(screen.getByRole("button", { name: "仅同步此日期" }));
  await confirm(user);
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0]).toMatchObject({
    action_id: scheduleId,
    fields: {},
  });
});
