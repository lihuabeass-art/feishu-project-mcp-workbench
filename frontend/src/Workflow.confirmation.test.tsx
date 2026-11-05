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
import { draftKey, readDraft, writeDraft } from "./workflowDrafts";
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
  [action.id, "node", "提交"],
  ["node:rollback:design", "node", "提交"],
  ["state:resolve", "state", "提交"],
] as const)("%s 在后续云端请求不可用时直接进入二次确认", async (id, kind, label) => {
  const nextAction = { ...action, id, kind };
  vi.mocked(getWorkflowActions).mockResolvedValueOnce(options(nextAction))
    .mockImplementation(() => new Promise(() => {}));
  const submit = vi.fn();
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: action.label }));
  await user.click(screen.getByRole("button", { name: label }));
  expect(screen.getByRole("region", { name: "提交前二次确认" }).textContent).toContain("原设计稿");
  expect(getWorkflowActions).toHaveBeenCalledExactlyOnceWith(item.id);
  expect(readDraft(draftKey(itemKey(item), id))?.pending).toBeUndefined();
  expect(submit).not.toHaveBeenCalled();
});

it.each([false, true])("旧草稿最终提交冲突后可重读云端再提交，不重复使用旧版本（跳过确认：%s）", async (skip) => {
  saveWorkflowSkipConfirmation(skip);
  const key = draftKey(itemKey(item), action.id);
  writeDraft(key, { fields: { doc: "本机设计稿" }, base_fields: { doc: "旧设计稿" }, version: "old", updated_at: 1 });
  const submit = vi.fn().mockRejectedValueOnce({ kind: "conflict", message: "远端流程已变化，请重新读取动作后再执行" })
    .mockResolvedValue(result);
  const user = userEvent.setup();
  const view = render(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: action.label }));
  const send = async () => {
    await user.click(screen.getByRole("button", { name: "提交" }));
    if (!skip) {
      await user.click(screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"));
      await user.click(screen.getByRole("button", { name: "确认完成节点" }));
    }
  };
  await send();
  expect((await screen.findByRole("alert")).textContent).toContain("已变化");
  expect(getWorkflowActions).toHaveBeenCalledExactlyOnceWith(item.id);
  expect(submit.mock.calls[0][0]).toMatchObject({ version: "old", fields: { doc: "本机设计稿" } });
  expect(readDraft(key)?.pending).toBeUndefined();
  expect(readDraft(key)?.requires_refresh).toBe(true);
  expect((screen.getByRole("button", { name: "提交" }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "返回，保留草稿" }));
  await user.click(screen.getByRole("button", { name: action.label }));
  expect(getWorkflowActions).toHaveBeenCalledExactlyOnceWith(item.id);
  expect((screen.getByRole("button", { name: "提交" }) as HTMLButtonElement).disabled).toBe(true);
  view.unmount();
  const otherItem = { ...item, id: { ...item.id, project_key: "other-space" } };
  const reopened = render(<Workflow item={otherItem} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: action.label }));
  expect((screen.getByRole("button", { name: "提交" }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole("button", { name: "重新读取云端，保留草稿" })).toBeNull();
  reopened.rerender(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: action.label }));
  expect(getWorkflowActions).toHaveBeenCalledTimes(3);
  expect((screen.getByRole("button", { name: "提交" }) as HTMLButtonElement).disabled).toBe(true);
  vi.mocked(getWorkflowActions).mockRejectedValueOnce({ kind: "network", message: "临时读取失败" });
  await user.click(screen.getByRole("button", { name: "重新读取云端，保留草稿" }));
  expect((await screen.findByRole("alert")).textContent).toContain("临时读取失败");
  expect(readDraft(key)?.fields.doc).toBe("本机设计稿");
  expect(readDraft(key)?.requires_refresh).toBe(true);
  expect((screen.getByRole("button", { name: "提交" }) as HTMLButtonElement).disabled).toBe(true);
  const continued = "本机设计稿，冲突后继续补充";
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("quota"); });
  fireEvent.change(screen.getByLabelText("设计稿（必填）"), { target: { value: continued } });
  expect((screen.getByRole("alert")).textContent).toContain("草稿自动保存失败");
  expect(readDraft(key)?.fields.doc).toBe("本机设计稿");
  storage.mockRestore();
  vi.mocked(getWorkflowActions).mockResolvedValue(options({ ...action, fields: [{ ...action.fields[0], initial_value: "同事设计稿" }] }, "v2"));
  await user.click(screen.getByRole("button", { name: "重新读取云端，保留草稿" }));
  await waitFor(() => expect(readDraft(key)?.version).toBe("v2"));
  expect((screen.getByLabelText("设计稿（必填）") as HTMLInputElement).value).toBe(continued);
  expect(readDraft(key)?.fields.doc).toBe(continued);
  expect(readDraft(key)?.requires_refresh).toBeUndefined();
  expect(screen.getByRole("group", { name: "设计稿冲突处理" }).textContent).toContain("同事设计稿");
  expect(submit).toHaveBeenCalledOnce();
  await send();
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  expect(submit.mock.calls[1][0]).toMatchObject({ version: "v2", fields: { doc: continued } });
});

it("冲突后继续编辑且保存失败，重读发现动作消失时仍保留内存输入", async () => {
  saveWorkflowSkipConfirmation(true);
  const key = draftKey(itemKey(item), action.id);
  const submit = vi.fn().mockRejectedValue({ kind: "conflict", message: "远端流程已变化" });
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: action.label }));
  await user.click(screen.getByRole("button", { name: "提交" }));
  await screen.findByRole("button", { name: "重新读取云端，保留草稿" });
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  fireEvent.change(screen.getByLabelText("设计稿（必填）"), { target: { value: "仅在内存的新设计稿" } });
  vi.mocked(getWorkflowActions).mockResolvedValue({ version: "v2", actions: [] });
  await user.click(screen.getByRole("button", { name: "重新读取云端，保留草稿" }));
  expect((await screen.findByRole("alert")).textContent).toContain("草稿保存失败");
  expect((screen.getByLabelText("设计稿（必填）") as HTMLInputElement).value).toBe("仅在内存的新设计稿");
  expect(submit).toHaveBeenCalledOnce();
  storage.mockRestore();
  await user.click(screen.getByRole("button", { name: "重新读取云端，保留草稿" }));
  expect((await screen.findByRole("alert")).textContent).toContain("原动作");
  expect(screen.queryByLabelText("设计稿（必填）")).toBeNull();
  expect(readDraft(key)?.fields.doc).toBe("仅在内存的新设计稿");
  expect(submit).toHaveBeenCalledOnce();
});

it.each([
  ["节点完成", action.id, "node"],
  ["节点回滚", "node:rollback:design", "node"],
  ["状态流转", "state:resolve", "state"],
] as const)(
  "关闭确认时%s直接提交当前快照、差异字段并先保存提交标记",
  async (_label, id, kind) => {
    const nextAction = { ...action, id, kind };
    vi.mocked(getWorkflowActions)
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
      expect(readDraft(key)?.fields["remote-only"]).toBeUndefined();
      expect(getWorkflowActions).toHaveBeenCalledExactlyOnceWith(item.id);
      return { ...result, action_id: id };
    });
    const user = userEvent.setup();
    render(<Workflow item={item} available busy={false} submit={submit} />);
    await user.click(await screen.findByRole("button", { name: action.label }));
    expect(getWorkflowActions).toHaveBeenCalledExactlyOnceWith(item.id);
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
      version: "v1",
      fields: { doc: "新设计稿" },
    });
    expect(screen.queryByRole("region", { name: "提交前二次确认" })).toBeNull();
  },
);

it.each([
  ["progress", false, "100"],
  ["schedule", false, ""],
  ["progress", true, "0"],
  ["progress", true, "100"],
  ["schedule", true, ""],
] as const)(
  "仅同步 %s 遵循跳过确认偏好 %s（进度 %s），只提交同步字段",
  async (kind, skip, progress) => {
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
    const transition = { ...action, fields: [...fields, ...action.fields] };
    const sync = {
      ...action,
      id: `node:${kind}:design`,
      label: `同步${kind}`,
      fields,
    };
    const source = {
      version: "v1",
      actions: [transition, sync],
    };
    vi.mocked(getWorkflowActions).mockResolvedValue(source);
    if (skip) saveWorkflowSkipConfirmation(true);
    const key = draftKey(itemKey(item), sync.id);
    const submit = vi.fn().mockImplementation(async (request) => {
      expect(readDraft(key)?.pending).toEqual(request);
      expect(getWorkflowActions).toHaveBeenCalledExactlyOnceWith(item.id);
      return { ...result, action_id: sync.id };
    });
    const user = userEvent.setup();
    render(<Workflow item={item} available busy={false} submit={submit} />);
    await user.click(await screen.findByRole("button", { name: action.label }));
    await user.clear(screen.getByRole("textbox", { name: /^设计稿/ }));
    await user.type(
      screen.getByRole("textbox", { name: /^设计稿/ }),
      "完整表单草稿",
    );
    if (kind === "progress") {
      fireEvent.change(screen.getByRole("slider"), { target: { value: progress } });
    } else {
      fireEvent.change(screen.getByLabelText("开始日期（必填）"), {
        target: { value: "2030-01-02" },
      });
    }
    await user.click(
      screen.getByRole("button", {
        name: kind === "progress" ? "仅同步此进度" : "仅同步此日期",
      }),
    );
    const submitLabel = kind === "progress" ? "同步进度" : "同步日期";
    expect(getWorkflowActions).toHaveBeenCalledExactlyOnceWith(item.id);
    if (skip) {
      expect(
        screen.getByText(`已关闭流程操作二次确认，点击「${submitLabel}」将直接执行。`),
      ).toBeTruthy();
    }
    vi.mocked(getWorkflowActions).mockResolvedValue({ ...source, version: "v2" });
    await user.click(screen.getByRole("button", { name: submitLabel }));
    if (!skip) {
      expect(getWorkflowActions).toHaveBeenCalledExactlyOnceWith(item.id);
      expect(
        await screen.findByRole("region", { name: "提交前二次确认" }),
      ).toBeTruthy();
      expect(submit).not.toHaveBeenCalled();
      await user.click(
        screen.getByRole("button", {
          name: kind === "progress"
            ? "我已核对进度，本次仅同步进度并保留当前节点"
            : "我已核对开始和结束日期，本次仅同步日期并保留当前节点",
        }),
      );
      await user.click(screen.getByRole("button", { name: `确认${submitLabel}` }));
    }
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(screen.queryByRole("region", { name: "提交前二次确认" })).toBeNull();
    expect(submit.mock.calls[0][0]).toMatchObject({
      item_id: item.id,
      action_id: sync.id,
      version: "v1",
    });
    expect(submit.mock.calls[0][0].fields).toEqual(
      kind === "progress" ? { progress } : { start: "2030-01-02" },
    );
    expect(readDraft(draftKey(itemKey(item), transition.id))?.fields.doc).toBe(
      "完整表单草稿",
    );
  },
);

it.each(["同事的新设计稿", "", "   "])(
  "跳过确认时不预读云端值（%j），原快照交由正式提交检查",
  async (remote) => {
    saveWorkflowSkipConfirmation(true);
    const submit = vi.fn().mockImplementation(async () => {
      expect(getWorkflowActions).toHaveBeenCalledExactlyOnceWith(item.id);
      return result;
    });
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
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0]).toMatchObject({ version: "v1", fields: { doc: "本地设计稿" } });
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
