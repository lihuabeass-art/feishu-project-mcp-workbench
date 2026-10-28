// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workflow } from "./Workflow";
import { getWorkflowActions } from "./api";
import { draftKey, readDraft, writeDraft } from "./workflowDrafts";
import { itemKey } from "./model";
import type { CachedItem, WorkflowOptions, WorkflowResult } from "./types";
vi.mock("./api", () => ({ getWorkflowActions: vi.fn() }));
const item = (project = "p") =>
  ({
    id: {
      project_key: project,
      work_item_type_key: "story",
      work_item_id: "same",
    },
    name: "需求",
  }) as CachedItem;
const options: WorkflowOptions = {
  version: "v1",
  actions: [
    {
      id: "node:confirm:n1",
      label: "完成设计节点",
      kind: "node",
      fields: [{ key: "doc", label: "设计文档", kind: "text", required: true }],
    },
  ],
};
const result: WorkflowResult = {
  outcome: "verified",
  verified: true,
  message: "已完成",
  request_id: "r",
  action_id: "node:confirm:n1",
  resynced: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(getWorkflowActions).mockResolvedValue(options);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const stateOptions: WorkflowOptions = {
  version: "state-v1",
  actions: [
    {
      id: "state:42:RESOLVED",
      label: "流转到「已解决」",
      kind: "state",
      fields: [
        {
          key: "result",
          label: "解决结果",
          kind: "select",
          required: true,
          options: [
            { value: "fixed", label: "已修复" },
            { value: "unreproducible", label: "无法复现" },
          ],
        },
      ],
    },
  ],
};

function numericOptions(initial_value = ""): WorkflowOptions {
  return {
    ...options,
    actions: [
      {
        ...options.actions[0],
        fields: [
          {
            key: "progress",
            label: "进度",
            kind: "number",
            unit: "percent",
            min: 0,
            max: 100,
            required: true,
            initial_value,
          },
          {
            key: "points",
            label: "总估分",
            kind: "number",
            step: 0.5,
            min: 0,
            required: true,
            initial_value: "0",
          },
          { key: "hours", label: "实际工时", kind: "number", required: false },
        ],
      },
    ],
  };
}

it.each(["0", "37.5", "100", "28.000000000000004"])(
  "仅同步进度 %s%% 不要求其他必填项，确认只发送进度字段",
  async (percentage) => {
    const full = numericOptions("20");
    full.actions[0].fields[1].initial_value = "";
    const progress = {
      ...full.actions[0],
      id: "node:progress:n1",
      label: "仅同步进度「设计」",
      fields: [full.actions[0].fields[0]],
    };
    vi.mocked(getWorkflowActions).mockResolvedValue({
      ...full,
      actions: [...full.actions, progress],
    });
    const submit = vi
      .fn()
      .mockResolvedValue({ ...result, action_id: progress.id });
    writeDraft(draftKey(itemKey(item()), full.actions[0].id), {
      fields: { progress: "20", points: "", hours: "" },
      version: full.version,
      updated_at: 1,
    });
    render(<Workflow item={item()} available busy={false} submit={submit} />);
    const user = userEvent.setup();
    const completeAction = await screen.findByRole("button", {
      name: "完成设计节点",
    });
    expect(screen.queryByRole("button", { name: progress.label })).toBeNull();
    expect(screen.queryByRole("button", { name: "仅同步此进度" })).toBeNull();
    await user.click(completeAction);
    fireEvent.change(
      percentage.includes(".")
        ? screen.getByRole("spinbutton", { name: "进度（必填）" })
        : screen.getByRole("slider"),
      { target: { value: percentage } },
    );
    expect(
      (screen.getByRole("button", { name: "提交" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "仅同步此进度" }));
    expect(
      screen.queryByRole("spinbutton", { name: "总估分（必填）" }),
    ).toBeNull();
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe(
      percentage,
    );
    await user.click(screen.getByRole("button", { name: "同步进度" }));
    const review = screen.getByRole("region", { name: "提交前二次确认" });
    expect(
      review.querySelector(".workflow-review-after .workflow-review-value")
        ?.textContent,
    ).toBe(percentage === "28.000000000000004" ? "28%" : `${percentage}%`);
    expect(review.textContent).toContain("云端当前值：20%");
    expect(review.textContent).not.toContain("总估分");
    expect(review.textContent).toContain(
      "进度达到 100% 也不会自动进入下一个节点",
    );
    expect(submit).not.toHaveBeenCalled();
    await user.click(
      screen.getByLabelText("我已核对进度，本次仅同步进度并保留当前节点"),
    );
    await user.click(screen.getByRole("button", { name: "确认同步进度" }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0]).toMatchObject({
      action_id: progress.id,
      fields: { progress: percentage },
    });
    expect(
      readDraft(draftKey(itemKey(item()), full.actions[0].id))?.fields.points,
    ).toBe("");
  },
);

it("完成节点被其他必填项阻止时仍能从原入口进入表单仅同步进度", async () => {
  const full = numericOptions("20");
  const progress = {
    ...full.actions[0],
    id: "node:progress:n1",
    label: "仅同步进度「设计」",
    fields: [full.actions[0].fields[0]],
  };
  const complete = {
    ...full.actions[0],
    disabled_reason: "完成前有暂不支持填写的必填项：附件",
  };
  vi.mocked(getWorkflowActions).mockResolvedValue({
    ...full,
    actions: [complete, progress],
  });
  const submit = vi
    .fn()
    .mockResolvedValue({ ...result, action_id: progress.id });
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  const button = await screen.findByRole("button", { name: complete.label });
  expect((button as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole("button", { name: progress.label })).toBeNull();
  await user.click(button);
  expect(
    (screen.getByRole("button", { name: "提交" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.submit(
    screen.getByRole("button", { name: "提交" }).closest("form")!,
  );
  expect(screen.queryByRole("region", { name: "提交前二次确认" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "仅同步此进度" }));
  await user.click(screen.getByRole("button", { name: "同步进度" }));
  await user.click(
    screen.getByLabelText("我已核对进度，本次仅同步进度并保留当前节点"),
  );
  await user.click(screen.getByRole("button", { name: "确认同步进度" }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0]).toMatchObject({
    action_id: progress.id,
    fields: {},
  });
});

it("百分比拖动与输入双向同步，保存草稿并以百分比确认，正式提交保留数值", async () => {
  vi.mocked(getWorkflowActions).mockResolvedValue(numericOptions("62.5"));
  const submit = vi.fn().mockResolvedValue(result);
  const view = render(
    <Workflow item={item()} available busy={false} submit={submit} />,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成设计节点" }));
  const number = screen.getByRole("spinbutton", {
    name: "进度（必填）",
  }) as HTMLInputElement;
  const slider = screen.getByRole("slider", {
    name: "进度拖动条",
  }) as HTMLInputElement;
  expect(number.value).toBe("62.5");
  expect(slider.value).toBe("62.5");
  fireEvent.change(slider, { target: { value: "65" } });
  expect(number.value).toBe("65");
  await user.clear(number);
  await user.type(number, "37.5");
  expect(slider.value).toBe("37.5");
  expect(
    readDraft(draftKey(itemKey(item()), options.actions[0].id))?.fields
      .progress,
  ).toBe("37.5");
  view.unmount();
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: "完成设计节点" }));
  expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("37.5");
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect(
    screen.getByRole("region", { name: "提交前二次确认" }).textContent,
  ).toContain("37.5%");
  expect(submit).not.toHaveBeenCalled();
  await user.click(
    screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0].fields.progress).toBe("37.5");
});

it("空进度保持未设置，端点可明确选择零，百分比越界阻止本机确认", async () => {
  vi.mocked(getWorkflowActions).mockResolvedValue(numericOptions());
  render(<Workflow item={item()} available busy={false} submit={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成设计节点" }));
  const number = screen.getByRole("spinbutton", {
    name: "进度（必填）",
  }) as HTMLInputElement;
  const slider = screen.getByRole("slider") as HTMLInputElement;
  expect(number.value).toBe("");
  expect(slider.getAttribute("aria-valuetext")).toBe("未设置");
  expect(
    readDraft(draftKey(itemKey(item()), options.actions[0].id)),
  ).toBeNull();
  expect(
    (screen.getByRole("button", { name: "提交" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.pointerDown(slider);
  expect(number.value).toBe("0");
  slider.focus();
  await user.keyboard("{End}");
  expect(number.value).toBe("100");
  await user.keyboard("{ArrowLeft}");
  expect(number.value).toBe("99");
  fireEvent.change(number, { target: { value: "101" } });
  expect(number.validity.rangeOverflow).toBe(true);
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect(screen.queryByRole("region", { name: "提交前二次确认" })).toBeNull();
  fireEvent.change(number, { target: { value: "-1" } });
  expect(number.validity.rangeUnderflow).toBe(true);
});

it("估分加减步长为半分，其他数字继续支持小数，忙碌时同步禁用两个百分比控件", async () => {
  vi.mocked(getWorkflowActions).mockResolvedValue(numericOptions("0"));
  const view = render(
    <Workflow item={item()} available busy={false} submit={vi.fn()} />,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成设计节点" }));
  const points = screen.getByRole("spinbutton", {
    name: "总估分（必填）",
  }) as HTMLInputElement;
  await user.click(screen.getByRole("button", { name: "总估分增加 0.5" }));
  expect(points.value).toBe("0.5");
  points.focus();
  await user.keyboard("{ArrowUp}");
  expect(points.value).toBe("1");
  await user.clear(points);
  await user.type(points, "1.25");
  expect(points.checkValidity()).toBe(true);
  await user.click(screen.getByRole("button", { name: "总估分增加 0.5" }));
  expect(points.value).toBe("1.75");
  await user.click(screen.getByRole("button", { name: "总估分减少 0.5" }));
  expect(points.value).toBe("1.25");
  const hours = screen.getByRole("spinbutton", {
    name: "实际工时",
  }) as HTMLInputElement;
  await user.type(hours, "2.25");
  expect(hours.checkValidity()).toBe(true);
  view.rerender(<Workflow item={item()} available busy submit={vi.fn()} />);
  expect((screen.getByRole("slider") as HTMLInputElement).disabled).toBe(true);
  expect(
    (
      screen.getByRole("spinbutton", {
        name: "进度（必填）",
      }) as HTMLInputElement
    ).disabled,
  ).toBe(true);
});

it("飞书已填的估分和排期回显可编辑输入框，修改后确认并提交新值", async () => {
  vi.mocked(getWorkflowActions).mockResolvedValue({
    ...options,
    actions: [
      {
        ...options.actions[0],
        fields: [
          {
            key: "points",
            label: "总估分",
            kind: "number",
            step: 0.5,
            required: false,
            initial_value: "1",
          },
          {
            key: "start",
            label: "排期开始日期",
            kind: "date",
            required: false,
            initial_value: "2026-10-23",
          },
          {
            key: "end",
            label: "排期结束日期",
            kind: "date",
            required: false,
            initial_value: "2026-10-23",
          },
        ],
      },
    ],
  });
  const submit = vi.fn().mockResolvedValue(result);
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成设计节点" }));
  const points = screen.getByRole("spinbutton", {
    name: "总估分",
  }) as HTMLInputElement;
  const start = screen.getByLabelText("排期开始日期") as HTMLInputElement;
  const end = screen.getByLabelText("排期结束日期") as HTMLInputElement;
  expect(points.value).toBe("1");
  expect(start.value).toBe("2026-10-23");
  expect(end.value).toBe("2026-10-23");
  for (const input of [points, start, end]) {
    expect(input.readOnly).toBe(false);
    expect(input.disabled).toBe(false);
  }
  await user.clear(points);
  await user.type(points, "2.5");
  fireEvent.change(start, { target: { value: "2026-10-24" } });
  fireEvent.change(end, { target: { value: "2026-10-25" } });
  await user.click(screen.getByRole("button", { name: "提交" }));
  const review = screen.getByRole("region", { name: "提交前二次确认" });
  expect(review.textContent).toContain("2.5");
  expect(review.textContent).toContain("2026-10-24");
  expect(submit).not.toHaveBeenCalled();
  await user.click(
    screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0].fields).toEqual({
    points: "2.5",
    start: "2026-10-24",
    end: "2026-10-25",
  });
});

it.each([null, "", "   ", "本机新文档"])(
  "飞书已填值带入表单，空草稿补齐，确认页展示完整有效值（%s）",
  async (draftValue) => {
    const remote = "https://example.test/design";
    vi.mocked(getWorkflowActions).mockResolvedValue({
      ...options,
      actions: [
        {
          ...options.actions[0],
          fields: [
            { ...options.actions[0].fields[0], initial_value: remote },
            {
              key: "hours",
              label: "实际工时",
              kind: "number",
              required: true,
              initial_value: "0",
            },
          ],
        },
      ],
    });
    if (draftValue !== null)
      writeDraft(draftKey(itemKey(item()), options.actions[0].id), {
        fields: { doc: draftValue, hours: "" },
        version: "old",
        updated_at: 1,
      });
    const submit = vi.fn();
    render(<Workflow item={item()} available busy={false} submit={submit} />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "完成设计节点" }),
    );
    const expected = draftValue?.trim() ? draftValue : remote;
    expect(
      (screen.getByLabelText("设计文档（必填）") as HTMLInputElement).value,
    ).toBe(expected);
    expect(
      (screen.getByLabelText("实际工时（必填）") as HTMLInputElement).value,
    ).toBe("0");
    if (draftValue?.trim()) {
      expect(
        screen.getByRole("group", { name: "设计文档冲突处理" }),
      ).toBeTruthy();
    }
    await user.click(screen.getByRole("button", { name: "提交" }));
    expect(
      screen.getByRole("region", { name: "提交前二次确认" }).textContent,
    ).toContain(expected);
    expect(
      screen.getByRole("region", { name: "提交前二次确认" }).textContent,
    ).toContain(remote);
    expect(
      screen.getByRole("region", { name: "提交前二次确认" }).textContent,
    ).toContain("实际工时");
    expect(submit).not.toHaveBeenCalled();
    expect(
      readDraft(draftKey(itemKey(item()), options.actions[0].id))?.fields,
    ).toEqual({ doc: expected, hours: "0" });
  },
);

it("待核实草稿保留原始空值，不用飞书新值改写待核实快照", async () => {
  vi.mocked(getWorkflowActions).mockResolvedValue({
    ...options,
    actions: [
      {
        ...options.actions[0],
        fields: [
          { ...options.actions[0].fields[0], initial_value: "远端新文档" },
        ],
      },
    ],
  });
  const key = draftKey(itemKey(item()), options.actions[0].id);
  writeDraft(key, {
    fields: { doc: "" },
    version: "v1",
    updated_at: 1,
    pending: {
      item_id: item().id,
      action_id: options.actions[0].id,
      version: "v1",
      fields: { doc: "" },
      request_id: "pending",
    },
  });
  render(<Workflow item={item()} available busy={false} submit={vi.fn()} />);
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: "完成设计节点" }));
  expect(
    (screen.getByLabelText("设计文档（必填）") as HTMLInputElement).value,
  ).toBe("");
  expect(
    (screen.getByRole("button", { name: "提交" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(readDraft(key)?.pending?.fields.doc).toBe("");
});

it("状态流必填项在本端选择、恢复草稿，确认展示名称并提交选项 ID", async () => {
  vi.mocked(getWorkflowActions).mockResolvedValue(stateOptions);
  const stateItem = {
    ...item(),
    id: { ...item().id, work_item_type_key: "issue" },
    name: "缺陷",
  };
  const submit = vi
    .fn()
    .mockResolvedValue({ ...result, action_id: "state:42:RESOLVED" });
  const view = render(
    <Workflow item={stateItem} available busy={false} submit={submit} />,
  );
  const user = userEvent.setup();
  const action = await screen.findByRole("button", {
    name: "流转到「已解决」",
  });
  expect((action as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByText("需填写：解决结果")).toBeTruthy();
  await user.click(action);
  expect(
    (screen.getByRole("button", { name: "提交" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await user.click(screen.getByRole("combobox", { name: "解决结果" }));
  await user.click(screen.getByRole("option", { name: "已修复" }));
  expect(submit).not.toHaveBeenCalled();
  view.unmount();
  render(<Workflow item={stateItem} available busy={false} submit={submit} />);
  await user.click(
    await screen.findByRole("button", { name: "流转到「已解决」" }),
  );
  expect(
    screen.getByRole("combobox", { name: "解决结果" }).textContent,
  ).toContain("已修复");
  await user.click(screen.getByRole("button", { name: "提交" }));
  const review = await screen.findByRole("region", { name: "提交前二次确认" });
  expect(review.textContent).toContain("已修复");
  expect(submit).not.toHaveBeenCalled();
  await user.click(
    screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0]).toMatchObject({
    item_id: stateItem.id,
    action_id: "state:42:RESOLVED",
    fields: { result: "fixed" },
  });
});

it("状态流保存字段后结果不明仍保留选择和提交标记，阻止直接重放", async () => {
  vi.mocked(getWorkflowActions).mockResolvedValue(stateOptions);
  const submit = vi.fn().mockResolvedValue({
    ...result,
    outcome: "unknown",
    verified: false,
    message: "字段已保存，状态流转结果尚待核实",
  });
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "流转到「已解决」" }),
  );
  await user.click(screen.getByRole("combobox", { name: "解决结果" }));
  await user.click(screen.getByRole("option", { name: "无法复现" }));
  await user.click(screen.getByRole("button", { name: "提交" }));
  await user.click(
    await screen.findByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
  await screen.findByText(/已阻止重复提交/);
  expect(
    (screen.getByRole("button", { name: "提交" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  const draft = readDraft(
    draftKey(itemKey(item()), stateOptions.actions[0].id),
  );
  expect(draft?.fields.result).toBe("unreproducible");
  expect(draft?.pending?.fields.result).toBe("unreproducible");
  expect(submit).toHaveBeenCalledOnce();
});
async function edit() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成设计节点" }));
  await user.type(screen.getByLabelText("设计文档（必填）"), "文档链接");
  return user;
}
it("输入立即保存本机草稿，关闭重开恢复，不发送正式提交", async () => {
  const submit = vi.fn();
  const view = render(
    <Workflow item={item()} available busy={false} submit={submit} />,
  );
  await edit();
  expect(
    readDraft(draftKey(itemKey(item()), options.actions[0].id))?.fields.doc,
  ).toBe("文档链接");
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toContain("草稿已保存在本机");
  view.unmount();
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成设计节点" }));
  expect(
    (screen.getByLabelText("设计文档（必填）") as HTMLInputElement).value,
  ).toBe("文档链接");
  expect(submit).not.toHaveBeenCalled();
});
it("检查不写入，二次确认展示快照，取消可修改，明确确认仅发送一次", async () => {
  const submit = vi.fn().mockResolvedValue(result);
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  const user = await edit();
  await user.click(screen.getByRole("button", { name: "提交" }));
  await screen.findByRole("region", { name: "提交前二次确认" });
  expect(submit).not.toHaveBeenCalled();
  expect(
    (
      screen.getByRole("button", {
        name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "返回修改" }));
  expect(submit).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("设计文档（必填）"), "更新");
  await user.click(screen.getByRole("button", { name: "提交" }));
  await user.click(
    await screen.findByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.dblClick(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0].fields.doc).toBe("文档链接更新");
  expect(
    readDraft(draftKey(itemKey(item()), options.actions[0].id)),
  ).toBeNull();
});
it("相同编号跨空间草稿隔离", async () => {
  const view = render(
    <Workflow item={item()} available busy={false} submit={vi.fn()} />,
  );
  await edit();
  view.rerender(
    <Workflow item={item("other")} available busy={false} submit={vi.fn()} />,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成设计节点" }));
  expect(
    (screen.getByLabelText("设计文档（必填）") as HTMLInputElement).value,
  ).toBe("");
});
it("进入二次确认前等待云端读取，不发送写入且不标记提交中", async () => {
  const submit = vi.fn();
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  const user = await edit();
  vi.mocked(getWorkflowActions).mockImplementation(() => new Promise(() => {}));
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect(screen.queryByRole("region", { name: "提交前二次确认" })).toBeNull();
  expect(getWorkflowActions).toHaveBeenCalledTimes(3);
  expect(getWorkflowActions).toHaveBeenLastCalledWith(item().id, true);
  expect(submit).not.toHaveBeenCalled();
  expect(
    readDraft(draftKey(itemKey(item()), options.actions[0].id))?.pending,
  ).toBeUndefined();
});
it("最终提交发现远端变化时保留草稿并释放提交标记", async () => {
  const submit = vi.fn().mockRejectedValue({
    kind: "conflict",
    message: "远端流程已变化，请重新读取动作后再执行",
  });
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  const user = await edit();
  await user.click(screen.getByRole("button", { name: "提交" }));
  await user.click(
    screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
  expect((await screen.findByRole("alert")).textContent).toContain("已变化");
  expect(screen.queryByRole("region", { name: "提交前二次确认" })).toBeNull();
  expect(submit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ version: "v1" }),
  );
  const draft = readDraft(draftKey(itemKey(item()), options.actions[0].id));
  expect(draft?.fields.doc).toBe("文档链接");
  expect(draft?.pending).toBeUndefined();
});
it("结果不确定保留草稿和提交标记，重开后阻止直接重试", async () => {
  const submit = vi
    .fn()
    .mockResolvedValue({ ...result, outcome: "unknown", verified: false });
  const view = render(
    <Workflow item={item()} available busy={false} submit={submit} />,
  );
  const user = await edit();
  await user.click(screen.getByRole("button", { name: "提交" }));
  await user.click(
    await screen.findByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  view.unmount();
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: "完成设计节点" }));
  expect(screen.getByText(/已阻止重复提交/)).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "提交" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.getByRole("status").textContent).toContain("待核实");
  expect(screen.getByRole("status").textContent).not.toContain("尚未提交飞书");
});
it("没有明确结论时保留提交标记并提示核实", async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  const user = await edit();
  await user.click(screen.getByRole("button", { name: "提交" }));
  await user.click(
    await screen.findByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "未收到明确",
  );
  expect(
    readDraft(draftKey(itemKey(item()), options.actions[0].id))?.pending,
  ).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "提交" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
it("提交前拒绝后存储又失败时保留锁定且不抛出未处理异常", async () => {
  const submit = vi.fn().mockImplementation(async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("disk full");
    });
    throw { kind: "conflict", message: "忙碌，未提交" };
  });
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  const user = await edit();
  await user.click(screen.getByRole("button", { name: "提交" }));
  await user.click(
    await screen.findByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "状态需要核实",
  );
  expect(
    readDraft(draftKey(itemKey(item()), options.actions[0].id))?.pending,
  ).toBeTruthy();
});
it("飞书已核验成功但草稿清理失败时保留成功事实", async () => {
  const submit = vi.fn().mockImplementation(async () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("disk full");
    });
    return result;
  });
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  const user = await edit();
  await user.click(screen.getByRole("button", { name: "提交" }));
  await user.click(
    await screen.findByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
  expect((await screen.findByRole("alert")).textContent).toContain("已完成");
  expect(screen.getByRole("alert").textContent).toContain("未能清理");
});
it("草稿保存失败明确提示，不显示已保存", async () => {
  const submit = vi.fn();
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成设计节点" }));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("disk full");
  });
  await user.type(screen.getByLabelText("设计文档（必填）"), "草稿");
  expect((await screen.findByRole("alert")).textContent).toContain(
    "自动保存失败",
  );
  expect(screen.getByRole("status").textContent).not.toContain("已自动保存");
  expect(submit).not.toHaveBeenCalled();
});
