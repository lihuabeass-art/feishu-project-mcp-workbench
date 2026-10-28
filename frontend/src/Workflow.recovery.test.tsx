// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workflow } from "./Workflow";
import { getWorkflowActions } from "./api";
import { itemKey } from "./model";
import { draftKey, readDraft, writeDraft } from "./workflowDrafts";
import type { CachedItem, WorkflowOptions, WorkflowResult } from "./types";

vi.mock("./api", () => ({ getWorkflowActions: vi.fn() }));
const item = {
  id: { project_key: "p", work_item_type_key: "story", work_item_id: "1" },
  name: "需求",
} as CachedItem;
const actionId = "node:confirm:n1";
const key = draftKey(itemKey(item), actionId);
const options = (
  doc = "原文档",
  hours = "1",
  version = "v1",
): WorkflowOptions => ({
  version,
  actions: [
    {
      id: actionId,
      label: "完成节点",
      kind: "node",
      fields: [
        {
          key: "doc",
          label: "文档",
          kind: "text",
          required: true,
          initial_value: doc,
          scope: "work_item",
        },
        {
          key: "hours",
          label: "实际工时",
          kind: "number",
          required: false,
          initial_value: hours,
          scope: "assignee",
        },
      ],
    },
  ],
});
const verified: WorkflowResult = {
  outcome: "verified",
  verified: true,
  message: "完成节点已核验",
  request_id: "new",
  action_id: actionId,
  resynced: false,
};
function savePending(doc = "草稿文档") {
  writeDraft(key, {
    fields: { doc, hours: "2" },
    base_fields: { doc: "原文档", hours: "1" },
    field_labels: { doc: "文档", hours: "实际工时" },
    version: "v1",
    updated_at: 1,
    pending: {
      item_id: item.id,
      action_id: actionId,
      version: "v1",
      request_id: "old-request",
      fields: { doc, hours: "2" },
    },
  });
}
async function open(submit = vi.fn()) {
  const view = render(
    <Workflow item={item} available busy={false} submit={submit} />,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  return { view, user };
}
async function confirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "提交" }));
  await user.click(
    await screen.findByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(screen.getByRole("button", { name: "确认完成节点" }));
}
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.mocked(getWorkflowActions).mockResolvedValue(options());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("重新读取发现草稿值已在云端时可继续，仅推进流程且不重写相同字段", async () => {
  savePending();
  vi.mocked(getWorkflowActions).mockResolvedValue(
    options("草稿文档", "2", "v2"),
  );
  const submit = vi.fn().mockResolvedValue(verified);
  const { user } = await open(submit);
  expect(
    (screen.getByRole("button", { name: "提交" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await user.click(
    screen.getByRole("button", { name: "重新读取云端，保留草稿" }),
  );
  expect(readDraft(key)?.pending).toBeUndefined();
  expect(
    (screen.getByLabelText("文档（必填）") as HTMLInputElement).value,
  ).toBe("草稿文档");
  expect(screen.queryByRole("group", { name: "文档冲突处理" })).toBeNull();
  expect(submit).not.toHaveBeenCalled();
  await confirm(user);
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0]).toMatchObject({ version: "v2", fields: {} });
  expect(submit.mock.calls[0][0].request_id).not.toBe("old-request");
});

it("重新读取发现不同云端值时显示原草稿，可修改后核对差异再提交", async () => {
  savePending();
  vi.mocked(getWorkflowActions).mockResolvedValue(
    options("同事文档", "3", "v2"),
  );
  const submit = vi.fn().mockResolvedValue(verified);
  const { user } = await open(submit);
  await user.click(
    screen.getByRole("button", { name: "重新读取云端，保留草稿" }),
  );
  expect(
    screen.getByRole("group", { name: "文档冲突处理" }).textContent,
  ).toContain("同事文档");
  const doc = screen.getByLabelText("文档（必填）") as HTMLInputElement;
  expect(doc.disabled).toBe(false);
  expect(doc.value).toBe("草稿文档");
  fireEvent.change(doc, { target: { value: "同事文档；草稿文档" } });
  await user.click(screen.getByRole("button", { name: "提交" }));
  const review = await screen.findByRole("region", { name: "提交前二次确认" });
  expect(review.textContent).toContain("同事文档；草稿文档");
  expect(review.textContent).toContain("云端当前值：同事文档");
  expect(submit).not.toHaveBeenCalled();
  await user.click(
    screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(screen.getByRole("button", { name: "确认完成节点" }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0].fields).toEqual({
    doc: "同事文档；草稿文档",
    hours: "2",
  });
});

it.each(["read", "storage"])(
  "恢复时 %s 失败继续保留提交标记和完整草稿",
  async (failure) => {
    savePending();
    const original = localStorage.getItem(key);
    const submit = vi.fn();
    const { user } = await open(submit);
    if (failure === "read")
      vi.mocked(getWorkflowActions).mockRejectedValueOnce(
        new Error("读取失败"),
      );
    else
      vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
        throw new Error("存储失败");
      });
    await user.click(
      screen.getByRole("button", { name: "重新读取云端，保留草稿" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "草稿和提交标记已保留",
    );
    expect(localStorage.getItem(key)).toBe(original);
    expect(
      (screen.getByRole("button", { name: "提交" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(submit).not.toHaveBeenCalled();
  },
);

it.each(["草稿文档", ""])(
  "恢复后非当前表单草稿 %s 在确认页展示，成功后仍保留且不发送",
  async (doc) => {
    savePending(doc);
    const latest = options("草稿文档", "2", "v2");
    latest.actions[0].fields.shift();
    vi.mocked(getWorkflowActions).mockResolvedValue(latest);
    const submit = vi.fn().mockResolvedValue(verified);
    const { view, user } = await open(submit);
    await user.click(
      screen.getByRole("button", { name: "重新读取云端，保留草稿" }),
    );
    expect(
      screen.getByRole("group", { name: "文档保留草稿" }).textContent,
    ).toContain("本次不提交");
    expect(screen.queryByRole("button", { name: /舍弃/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "提交" }));
    const review = await screen.findByRole("region", {
      name: "提交前二次确认",
    });
    expect(review.textContent).toContain(doc || "（空）");
    expect(review.textContent).toContain("本次不提交");
    await user.click(
      screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"),
    );
    await user.click(screen.getByRole("button", { name: "确认完成节点" }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0].fields).toEqual({});
    expect(readDraft(key)?.fields).toEqual({ doc });
    expect(readDraft(key)?.pending).toBeUndefined();
    view.unmount();
    await open(submit);
    expect(
      (await screen.findByRole("group", { name: "文档保留草稿" })).textContent,
    ).toContain(doc || "（空）");
    expect(readDraft(key)?.fields.doc).toBe(doc);
  },
);

it("恢复读取后原动作已不可用时保留原提交草稿，回到最新动作列表", async () => {
  savePending();
  const original = localStorage.getItem(key);
  const submit = vi.fn();
  const { user } = await open(submit);
  vi.mocked(getWorkflowActions).mockResolvedValue({
    version: "v2",
    actions: [],
  });
  await user.click(
    screen.getByRole("button", { name: "重新读取云端，保留草稿" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "云端已不再提供原动作",
  );
  expect(screen.getByText("当前没有可执行的动作。")).toBeTruthy();
  expect(localStorage.getItem(key)).toBe(original);
  expect(submit).not.toHaveBeenCalled();
});

it("恢复读取双击只读取一次，切换事项后的迟到响应不改写原草稿和新事项", async () => {
  savePending();
  const original = localStorage.getItem(key);
  const submit = vi.fn();
  const { user, view } = await open(submit);
  let resolve!: (value: WorkflowOptions) => void;
  vi.mocked(getWorkflowActions).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const before = vi.mocked(getWorkflowActions).mock.calls.length;
  await user.dblClick(
    screen.getByRole("button", { name: "重新读取云端，保留草稿" }),
  );
  expect(getWorkflowActions).toHaveBeenCalledTimes(before + 1);
  const other = {
    ...item,
    id: { ...item.id, work_item_id: "2" },
    name: "其他需求",
  };
  view.rerender(
    <Workflow item={other} available busy={false} submit={submit} />,
  );
  await screen.findByRole("button", { name: "完成节点" });
  await act(async () => resolve(options("迟到文档", "9", "late")));
  expect(localStorage.getItem(key)).toBe(original);
  expect(screen.queryByText("迟到文档")).toBeNull();
  expect(screen.queryByText(/已重新读取云端/)).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});

const scheduleKey = (property: string, owner: string | null = null) =>
  JSON.stringify({ Schedule: { property, owner } });
const legacyHours = scheduleKey("actual_work_time");
const ownerHours = scheduleKey("actual_work_time", "a");
function scheduleOptions(remote = "", owners = ["a"]): WorkflowOptions {
  return {
    version: "v2",
    actions: [
      {
        id: actionId,
        label: "完成节点",
        kind: "node",
        fields: owners.flatMap((owner) => [
          {
            key: scheduleKey("actual_work_time", owner),
            label: `实际工时 ${owner}`,
            kind: "number" as const,
            required: true,
            initial_value: remote,
            scope: "assignee" as const,
          },
          {
            key: scheduleKey("estimate_start_date", owner),
            label: `开始日期 ${owner}`,
            kind: "date" as const,
            required: false,
            initial_value: "",
            scope: "assignee" as const,
          },
          {
            key: scheduleKey("estimate_end_date", owner),
            label: `结束日期 ${owner}`,
            kind: "date" as const,
            required: false,
            initial_value: "",
            scope: "assignee" as const,
          },
        ]),
      },
    ],
  };
}
function saveLegacy(pending = false, occupied = false) {
  const fields = {
    [legacyHours]: "1",
    [scheduleKey("estimate_start_date")]: "2026-10-27",
    [scheduleKey("estimate_end_date")]: "2026-10-28",
    ...(occupied ? { [ownerHours]: "3" } : {}),
  };
  writeDraft(key, {
    fields,
    base_fields: Object.fromEntries(
      Object.keys(fields).map((field) => [field, ""]),
    ),
    field_labels: {
      [legacyHours]: "实际工时",
      [scheduleKey("estimate_start_date")]: "开始日期",
      [scheduleKey("estimate_end_date")]: "结束日期",
    },
    version: "v1",
    updated_at: 1,
    ...(pending
      ? {
          pending: {
            item_id: item.id,
            action_id: actionId,
            version: "v1",
            request_id: "old",
            fields,
          },
        }
      : {}),
  });
}

it("旧总排期草稿打开时直接填入对应个人输入框并保存新身份，不等待后台读取", async () => {
  saveLegacy();
  const latest = scheduleOptions();
  vi.mocked(getWorkflowActions).mockResolvedValueOnce(latest);
  let resolve!: (value: WorkflowOptions) => void;
  vi.mocked(getWorkflowActions).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { view, user } = await open();
  expect(
    (screen.getByLabelText("实际工时 a（必填）") as HTMLInputElement).value,
  ).toBe("1");
  expect((screen.getByLabelText("开始日期 a") as HTMLInputElement).value).toBe(
    "2026-10-27",
  );
  expect((screen.getByLabelText("结束日期 a") as HTMLInputElement).value).toBe(
    "2026-10-28",
  );
  expect(screen.queryByText(/其他保留草稿/)).toBeNull();
  expect(readDraft(key)?.fields[legacyHours]).toBeUndefined();
  expect(readDraft(key)?.fields[ownerHours]).toBe("1");
  vi.mocked(getWorkflowActions).mockResolvedValue(latest);
  await act(async () => resolve(latest));
  view.unmount();
  await open();
  expect(
    (screen.getByLabelText("实际工时 a（必填）") as HTMLInputElement).value,
  ).toBe("1");
  expect(screen.queryByText(/其他保留草稿/)).toBeNull();
  await user.click(screen.getByRole("button", { name: "提交" }));
  const review = await screen.findByRole("region", { name: "提交前二次确认" });
  expect(review.textContent).toContain("2026-10-27");
});

it.each(["", "4"])(
  "待核实旧草稿仅在fresh恢复后迁移，云端 %s 与迁移填写分别展示",
  async (remote) => {
    saveLegacy(true);
    const original = localStorage.getItem(key);
    const latest = scheduleOptions(remote);
    vi.mocked(getWorkflowActions).mockResolvedValue(latest);
    const submit = vi.fn().mockResolvedValue(verified);
    const { user } = await open(submit);
    expect(localStorage.getItem(key)).toBe(original);
    expect(readDraft(key)?.pending?.fields[legacyHours]).toBe("1");
    await user.click(
      screen.getByRole("button", { name: "重新读取云端，保留草稿" }),
    );
    expect(
      (screen.getByLabelText("实际工时 a（必填）") as HTMLInputElement).value,
    ).toBe("1");
    expect(readDraft(key)?.fields[legacyHours]).toBeUndefined();
    expect(readDraft(key)?.pending).toBeUndefined();
    expect(screen.queryByText(/其他保留草稿/)).toBeNull();
    if (remote)
      expect(
        screen.getByRole("group", { name: "实际工时 a冲突处理" }).textContent,
      ).toContain("4");
    else {
      expect(
        screen.queryByRole("group", { name: "实际工时 a冲突处理" }),
      ).toBeNull();
      expect(screen.queryByText(/云端已清空此字段/)).toBeNull();
    }
    await confirm(user);
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0].fields).toEqual({
      [ownerHours]: "1",
      [scheduleKey("estimate_start_date", "a")]: "2026-10-27",
      [scheduleKey("estimate_end_date", "a")]: "2026-10-28",
    });
  },
);

it("不同本机内容保留在对应输入框旁，可显式切换此前草稿且不丢另一份", async () => {
  saveLegacy(false, true);
  vi.mocked(getWorkflowActions).mockResolvedValue(scheduleOptions());
  const { user } = await open();
  const input = screen.getByLabelText("实际工时 a（必填）") as HTMLInputElement;
  expect(input.value).toBe("3");
  expect(
    screen.getByRole("group", { name: "实际工时 a此前草稿" }).textContent,
  ).toContain("1");
  expect(screen.queryByText(/其他保留草稿/)).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "将此前草稿填入实际工时 a" }),
  );
  expect(input.value).toBe("1");
  expect(
    screen.getByRole("group", { name: "实际工时 a此前草稿" }).textContent,
  ).toContain("3");
  expect(readDraft(key)?.fields[legacyHours]).toBe("3");
  expect(readDraft(key)?.fields[ownerHours]).toBe("1");
  expect(screen.queryByText(/云端已清空此字段/)).toBeNull();
});

it("多负责人不自动复制旧草稿，表单末尾可明确选择恢复的负责人字段", async () => {
  saveLegacy();
  vi.mocked(getWorkflowActions).mockResolvedValue(
    scheduleOptions("", ["a", "b"]),
  );
  const { user } = await open();
  expect(
    (screen.getByLabelText("实际工时 a（必填）") as HTMLInputElement).value,
  ).toBe("");
  expect(
    (screen.getByLabelText("实际工时 b（必填）") as HTMLInputElement).value,
  ).toBe("");
  await user.click(screen.getByText("其他保留草稿（3）"));
  await user.click(
    screen.getByRole("combobox", { name: "将实际工时草稿填入" }),
  );
  await user.click(screen.getByRole("option", { name: "实际工时 b" }));
  expect(
    (screen.getByLabelText("实际工时 b（必填）") as HTMLInputElement).value,
  ).toBe("1");
  expect(
    (screen.getByLabelText("实际工时 a（必填）") as HTMLInputElement).value,
  ).toBe("");
  expect(readDraft(key)?.fields[legacyHours]).toBeUndefined();
});

it("迁移持久保存失败时原草稿字节保持不变，错误明确可重试", async () => {
  saveLegacy();
  const original = localStorage.getItem(key);
  vi.mocked(getWorkflowActions).mockResolvedValue(scheduleOptions());
  vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("存储失败");
  });
  await open();
  expect((await screen.findByRole("alert")).textContent).toContain("存储失败");
  expect(localStorage.getItem(key)).toBe(original);
});
