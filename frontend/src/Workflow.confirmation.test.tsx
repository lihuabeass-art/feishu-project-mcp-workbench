// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Workflow } from "./Workflow";
import { getWorkflowActions } from "./api";
import { itemKey } from "./model";
import { draftKey, readDraft } from "./workflowDrafts";
import { saveWorkflowSkipConfirmation } from "./workflowPreferences";
import type {
  CachedItem,
  WorkflowAction,
  WorkflowOptions,
  WorkflowResult,
} from "./types";

vi.mock("./api", () => ({ getWorkflowActions: vi.fn() }));
const item = {
  id: { project_key: "space", work_item_type_key: "story", work_item_id: "42" },
  name: "测试需求",
} as CachedItem;
const action: WorkflowAction = {
  id: "node:confirm:design",
  kind: "node",
  label: "完成设计节点",
  fields: [
    {
      key: "doc",
      label: "设计稿",
      kind: "text",
      required: true,
      initial_value: "原设计稿",
    },
  ],
};
const options = (next = action, version = "v1"): WorkflowOptions => ({
  version,
  actions: [next],
});
const result: WorkflowResult = {
  outcome: "verified",
  verified: true,
  message: "已完成",
  request_id: "r",
  action_id: action.id,
  resynced: true,
};
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.mocked(getWorkflowActions).mockResolvedValue(options());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("默认仍先核对且不提交，恢复开关后现有编辑器立即恢复确认", async () => {
  saveWorkflowSkipConfirmation(true);
  const submit = vi.fn().mockResolvedValue(result);
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: action.label }));
  saveWorkflowSkipConfirmation(false);
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect(
    await screen.findByRole("region", { name: "提交前二次确认" }),
  ).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
});

it.each([
  ["节点完成", action.id, "node"],
  ["节点回滚", "node:rollback:design", "node"],
  ["状态流转", "state:resolve", "state"],
] as const)(
  "关闭确认时%s直接提交，但使用最新版本、差异字段并先保存提交标记",
  async (_label, id, kind) => {
    const nextAction = { ...action, id, kind };
    vi.mocked(getWorkflowActions)
      .mockResolvedValueOnce(options(nextAction))
      .mockResolvedValueOnce(options(nextAction))
      .mockResolvedValue(
        options(
          {
            ...nextAction,
            fields: [
              ...nextAction.fields,
              {
                key: "remote-only",
                label: "新云端字段",
                kind: "text",
                required: false,
                initial_value: "云端保留",
              },
            ],
          },
          "v2",
        ),
      );
    saveWorkflowSkipConfirmation(true);
    const key = draftKey(itemKey(item), id);
    const submit = vi.fn().mockImplementation(async (request) => {
      expect(readDraft(key)?.pending).toEqual(request);
      expect(readDraft(key)?.fields["remote-only"]).toBe("云端保留");
      return { ...result, action_id: id };
    });
    const user = userEvent.setup();
    render(<Workflow item={item} available busy={false} submit={submit} />);
    await user.click(await screen.findByRole("button", { name: action.label }));
    await user.clear(screen.getByRole("textbox", { name: /^设计稿/ }));
    await user.type(
      screen.getByRole("textbox", { name: /^设计稿/ }),
      "新设计稿",
    );
    await user.click(screen.getByRole("button", { name: "提交" }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0]).toMatchObject({
      item_id: item.id,
      action_id: id,
      version: "v2",
      fields: { doc: "新设计稿" },
    });
    expect(screen.queryByRole("region", { name: "提交前二次确认" })).toBeNull();
  },
);

it.each(["progress", "schedule"])(
  "开关不会跳过仅同步 %s 的确认，也不会发送流程推进",
  async (kind) => {
    const fields: WorkflowAction["fields"] =
      kind === "progress"
        ? [
            {
              key: "progress",
              label: "进度",
              kind: "number",
              required: true,
              unit: "percent",
              initial_value: "50",
            },
          ]
        : [
            {
              key: "start",
              label: "开始日期",
              kind: "date",
              required: true,
              initial_value: "2030-01-01",
            },
            {
              key: "end",
              label: "结束日期",
              kind: "date",
              required: true,
              initial_value: "2030-01-02",
            },
          ];
    const transition = { ...action, fields };
    const sync = {
      ...transition,
      id: `node:${kind}:design`,
      label: `同步${kind}`,
    };
    vi.mocked(getWorkflowActions).mockResolvedValue({
      version: "v1",
      actions: [transition, sync],
    });
    saveWorkflowSkipConfirmation(true);
    const submit = vi.fn();
    const user = userEvent.setup();
    render(<Workflow item={item} available busy={false} submit={submit} />);
    await user.click(await screen.findByRole("button", { name: action.label }));
    await user.click(
      screen.getByRole("button", {
        name: kind === "progress" ? "仅同步此进度" : "仅同步此日期",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: kind === "progress" ? "同步进度" : "同步日期",
      }),
    );
    expect(
      await screen.findByRole("region", { name: "提交前二次确认" }),
    ).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  },
);

it.each(["同事的新设计稿", "", "   "])(
  "跳过确认仍阻止新云端冲突（%j），展示后再由用户主动提交",
  async (remote) => {
    saveWorkflowSkipConfirmation(true);
    const submit = vi.fn().mockResolvedValue(result);
    const user = userEvent.setup();
    render(<Workflow item={item} available busy={false} submit={submit} />);
    await user.click(await screen.findByRole("button", { name: action.label }));
    await user.clear(screen.getByRole("textbox", { name: /^设计稿/ }));
    await user.type(
      screen.getByRole("textbox", { name: /^设计稿/ }),
      "本地设计稿",
    );
    vi.mocked(getWorkflowActions).mockResolvedValue(
      options(
        { ...action, fields: [{ ...action.fields[0], initial_value: remote }] },
        "v2",
      ),
    );
    await user.click(screen.getByRole("button", { name: "提交" }));
    if (remote.trim()) expect(await screen.findByText(remote)).toBeTruthy();
    else {
      expect((await screen.findByRole("alert")).textContent).toContain(
        "云端原值已清空",
      );
      expect(document.querySelector(".workflow-review-comparison")).toBeNull();
    }
    expect(submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "提交" }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  },
);

it("跳过确认仍拦截存储失败，写入结果不确定后保留草稿并禁止重复提交", async () => {
  saveWorkflowSkipConfirmation(true);
  const submit = vi
    .fn()
    .mockResolvedValue({ ...result, outcome: "unknown", verified: false });
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: action.label }));
  const original = Storage.prototype.setItem;
  const storage = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(function (this: Storage, key, value) {
      if (JSON.parse(value).pending) throw new Error("quota");
      original.call(this, key, value);
    });
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
  storage.mockRestore();
  await user.click(screen.getByRole("button", { name: "提交" }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  const key = draftKey(itemKey(item), action.id);
  expect(readDraft(key)?.pending).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "提交" }));
  expect(submit).toHaveBeenCalledOnce();
});
