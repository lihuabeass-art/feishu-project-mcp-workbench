// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  act,
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
import type { CachedItem, WorkflowOptions } from "./types";

vi.mock("./api", () => ({ getWorkflowActions: vi.fn() }));
const item = {
  id: { project_key: "p", work_item_type_key: "story", work_item_id: "1" },
  name: "需求",
} as CachedItem;
const options = (remote: string, version = "v1"): WorkflowOptions => ({
  version,
  actions: [
    {
      id: "a",
      label: "完成节点",
      kind: "node",
      fields: [
        {
          key: "shared",
          label: "文档",
          kind: "text",
          required: true,
          initial_value: remote,
          scope: "work_item",
        },
        {
          key: "hours",
          label: "工时",
          kind: "number",
          required: false,
          initial_value: "1",
          scope: "assignee",
        },
      ],
    },
  ],
});
const key = draftKey(itemKey(item), "a");
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.mocked(getWorkflowActions).mockResolvedValue(options("原值"));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("重新打开旧草稿显示两份值，可在原框采用云端且保留其他本机填写", async () => {
  writeDraft(key, {
    fields: { shared: "本机文档", hours: "2" },
    base_fields: { shared: "原值", hours: "1" },
    version: "v1",
    updated_at: 1,
  });
  vi.mocked(getWorkflowActions).mockResolvedValue(options("同事文档", "v2"));
  const submit = vi.fn();
  let view = render(
    <Workflow item={item} available busy={false} submit={submit} />,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  expect(screen.queryByText(/其他.*协作人也可能修改/)).toBeNull();
  expect(
    screen.getByRole("group", { name: "文档冲突处理" }).textContent,
  ).toContain("同事文档");
  expect(
    (screen.getByRole("button", { name: "提交" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  for (const name of ["采用云端值", "使用编辑后的内容", "检查云端变化"]) {
    expect(screen.queryByRole("button", { name })).toBeNull();
  }
  view.unmount();
  view = render(
    <Workflow item={item} available busy={false} submit={submit} />,
  );
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  fireEvent.change(screen.getByLabelText("文档（必填）"), {
    target: { value: "同事文档" },
  });
  expect(
    (screen.getByLabelText("文档（必填）") as HTMLInputElement).value,
  ).toBe("同事文档");
  expect((screen.getByLabelText("工时") as HTMLInputElement).value).toBe("2");
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect(
    await screen.findByRole("region", { name: "提交前二次确认" }),
  ).toBeTruthy();
  expect(readDraft(key)?.fields).toEqual({ shared: "同事文档", hours: "2" });
  expect(submit).not.toHaveBeenCalled();
});

it("提交前新发现冲突先展示，保留本机输入不改也可正常提交确认", async () => {
  const submit = vi
    .fn()
    .mockResolvedValue({ outcome: "verified", verified: true });
  render(<Workflow item={item} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  fireEvent.change(screen.getByLabelText("文档（必填）"), {
    target: { value: "我的文档" },
  });
  vi.mocked(getWorkflowActions).mockResolvedValue(options("同事文档", "v2"));
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect(
    await screen.findByRole("group", { name: "文档冲突处理" }),
  ).toBeTruthy();
  expect(screen.queryByRole("region", { name: "提交前二次确认" })).toBeNull();
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "提交" }));
  await user.click(
    await screen.findByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0]).toMatchObject({
    version: "v2",
    fields: { shared: "我的文档" },
  });
});

it("版本号冲突保留原框输入，展示云端前端版本，可在同框补齐后端版本后提交", async () => {
  const versions = (value: string, version: string) => {
    const next = options(value, version);
    next.actions[0].fields[0].label = "代码版本号";
    return next;
  };
  vi.mocked(getWorkflowActions).mockResolvedValue(versions("", "v1"));
  const submit = vi
    .fn()
    .mockResolvedValue({ outcome: "verified", verified: true });
  render(<Workflow item={item} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  const input = screen.getByLabelText("代码版本号（必填）") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "后端：2.3.4" } });
  vi.mocked(getWorkflowActions).mockResolvedValue(
    versions("前端：1.2.3", "v2"),
  );
  fireEvent.focus(window);
  const conflict = await screen.findByRole("group", {
    name: "代码版本号冲突处理",
  });
  expect(conflict.textContent).toContain("云端最新值：前端：1.2.3");
  expect(input.value).toBe("后端：2.3.4");
  const copy = vi.spyOn(navigator.clipboard, "writeText");
  const readsBeforeCopy = vi.mocked(getWorkflowActions).mock.calls.length;
  await user.click(
    screen.getByRole("button", { name: "复制代码版本号的云端最新值" }),
  );
  expect(copy).toHaveBeenCalledWith("前端：1.2.3");
  expect(input.value).toBe("后端：2.3.4");
  expect(getWorkflowActions).toHaveBeenCalledTimes(readsBeforeCopy);
  expect(submit).not.toHaveBeenCalled();
  await user.hover(
    screen.getByRole("button", { name: "预览代码版本号提交后的飞书内容" }),
  );
  expect(screen.getByRole("tooltip").textContent).toContain("后端：2.3.4");
  const merged = "前端：1.2.3；后端：2.3.4";
  fireEvent.change(input, { target: { value: merged } });
  expect(
    screen.getByRole("group", { name: "代码版本号冲突处理" }),
  ).toBeTruthy();
  expect(screen.getByRole("tooltip").textContent).toContain(merged);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).toBeNull();
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect(
    (await screen.findByRole("region", { name: "提交前二次确认" })).textContent,
  ).toContain(merged);
  await user.click(
    screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0].fields).toEqual({ shared: merged });
});

it("只修改工时不写回已满足的共享必填项，待核实草稿仍保存完整表单", async () => {
  const submit = vi.fn().mockResolvedValue({ outcome: "unknown" });
  render(<Workflow item={item} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  fireEvent.change(screen.getByLabelText("工时"), { target: { value: "2" } });
  vi.mocked(getWorkflowActions).mockResolvedValue(options("前端：1.2.3", "v2"));
  fireEvent.focus(window);
  await waitFor(() =>
    expect(
      (screen.getByLabelText("文档（必填）") as HTMLInputElement).value,
    ).toBe("前端：1.2.3"),
  );
  expect(screen.queryByRole("group", { name: "文档冲突处理" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "提交" }));
  const review = await screen.findByRole("region", { name: "提交前二次确认" });
  expect(review.textContent).toContain("前端：1.2.3");
  expect(review.textContent).toContain("沿用云端");
  await user.click(
    screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0].fields).toEqual({ hours: "2" });
  expect(readDraft(key)?.fields).toEqual({ shared: "前端：1.2.3", hours: "2" });
  expect(readDraft(key)?.pending?.fields).toEqual({ hours: "2" });
});

it("后台读取期间继续输入不会丢失，双方相同的新值无需冲突或重复写入", async () => {
  const submit = vi
    .fn()
    .mockResolvedValue({ outcome: "verified", verified: true });
  render(<Workflow item={item} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  let resolve!: (value: WorkflowOptions) => void;
  vi.mocked(getWorkflowActions).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  fireEvent.focus(window);
  const input = screen.getByLabelText("文档（必填）") as HTMLInputElement;
  expect(input.disabled).toBe(false);
  fireEvent.change(input, { target: { value: "同一版本" } });
  fireEvent.change(screen.getByLabelText("工时"), { target: { value: "3" } });
  const latest = options("同一版本", "v2");
  vi.mocked(getWorkflowActions).mockResolvedValue(latest);
  await act(async () => resolve(latest));
  expect(input.value).toBe("同一版本");
  expect((screen.getByLabelText("工时") as HTMLInputElement).value).toBe("3");
  expect(screen.queryByRole("group", { name: "文档冲突处理" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "提交" }));
  await user.click(
    await screen.findByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0].fields).toEqual({ hours: "3" });
});

it("事项详情更新时保留脏字段并显示冲突最新值，合并后云端再改会重新提示", async () => {
  const submit = vi.fn();
  const view = render(
    <Workflow item={item} available busy={false} submit={submit} />,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  fireEvent.change(screen.getByLabelText("文档（必填）"), {
    target: { value: "后端v1" },
  });
  vi.mocked(getWorkflowActions).mockResolvedValue(options("前端v1", "v2"));
  view.rerender(
    <Workflow
      item={{ ...item, detail_revision: "new" }}
      available
      busy={false}
      submit={submit}
    />,
  );
  expect(
    (await screen.findByRole("group", { name: "文档冲突处理" })).textContent,
  ).toContain("前端v1");
  fireEvent.change(screen.getByLabelText("文档（必填）"), {
    target: { value: "前端v1；后端v1" },
  });
  vi.mocked(getWorkflowActions).mockResolvedValue(options("前端v2", "v3"));
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect(
    (await screen.findByRole("group", { name: "文档冲突处理" })).textContent,
  ).toContain("前端v2");
  expect(
    (screen.getByLabelText("文档（必填）") as HTMLInputElement).value,
  ).toBe("前端v1；后端v1");
  expect(screen.queryByRole("region", { name: "提交前二次确认" })).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});

it("提交前检查取代未完成的后台检查，迟到的旧响应不覆盖确认内容", async () => {
  render(<Workflow item={item} available busy={false} submit={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  let resolve!: (value: WorkflowOptions) => void;
  vi.mocked(getWorkflowActions).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  fireEvent.focus(window);
  vi.mocked(getWorkflowActions).mockResolvedValue(options("原值"));
  fireEvent.change(screen.getByLabelText("工时"), { target: { value: "4" } });
  await user.click(screen.getByRole("button", { name: "提交" }));
  await screen.findByRole("region", { name: "提交前二次确认" });
  await act(async () => resolve(options("迟到的旧内容", "old")));
  expect(readDraft(key)?.fields).toEqual({ shared: "原值", hours: "4" });
  expect(
    screen.getByRole("region", { name: "提交前二次确认" }).textContent,
  ).toContain("4");
});

it("自动检查更新未编辑字段，读取失败保留草稿且不能进入确认", async () => {
  const submit = vi.fn();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  fireEvent.change(screen.getByLabelText("工时"), { target: { value: "2" } });
  vi.mocked(getWorkflowActions).mockResolvedValue(options("同事文档", "v2"));
  fireEvent.focus(window);
  await waitFor(() =>
    expect(
      (screen.getByLabelText("文档（必填）") as HTMLInputElement).value,
    ).toBe("同事文档"),
  );
  expect(screen.queryByRole("group", { name: "文档冲突处理" })).toBeNull();
  vi.mocked(getWorkflowActions).mockRejectedValue({
    kind: "network",
    message: "读取失败",
  });
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect((await screen.findByRole("alert")).textContent).toContain("读取失败");
  expect(readDraft(key)?.fields).toEqual({ shared: "同事文档", hours: "2" });
  expect(screen.queryByRole("region", { name: "提交前二次确认" })).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});

it("核实上次结果后仍比较原草稿基线，不会通过恢复路径跳过冲突", async () => {
  const saved = {
    fields: { shared: "本机文档", hours: "2" },
    base_fields: { shared: "原值", hours: "1" },
    version: "v1",
    updated_at: 1,
  };
  writeDraft(key, {
    ...saved,
    pending: {
      item_id: item.id,
      action_id: "a",
      version: "v1",
      request_id: "r",
      fields: saved.fields,
    },
  });
  vi.mocked(getWorkflowActions).mockResolvedValue(options("同事文档", "v2"));
  render(<Workflow item={item} available busy={false} submit={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  await user.click(
    screen.getByRole("button", { name: "已在飞书核对，重新读取动作" }),
  );
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  expect(screen.getByRole("group", { name: "文档冲突处理" })).toBeTruthy();
  expect(readDraft(key)?.pending).toBeUndefined();
});

it("必填项从云端表单消失时保留本机内容，明确舍弃后才按新表单确认", async () => {
  const submit = vi.fn();
  const view = render(
    <Workflow item={item} available busy={false} submit={submit} />,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  fireEvent.change(screen.getByLabelText("文档（必填）"), {
    target: { value: "本机文档" },
  });
  const next = options("同事文档", "v2");
  next.actions[0].fields.shift();
  vi.mocked(getWorkflowActions).mockResolvedValue(next);
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect(
    (await screen.findByRole("group", { name: "文档已移除草稿" })).textContent,
  ).toContain("本机文档");
  expect(readDraft(key)?.fields.shared).toBe("本机文档");
  view.unmount();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  expect(screen.getByRole("group", { name: "文档已移除草稿" })).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "提交" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "确认舍弃这项草稿" }));
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect(
    await screen.findByRole("region", { name: "提交前二次确认" }),
  ).toBeTruthy();
  expect(readDraft(key)?.fields.shared).toBeUndefined();
  expect(submit).not.toHaveBeenCalled();
});

it("仅同步进度继承冲突，云端再次变化会先展示再允许确认", async () => {
  const progressOptions = (
    initial_value: string,
    version: string,
  ): WorkflowOptions => {
    const field = {
      key: "progress",
      label: "进度",
      kind: "number" as const,
      unit: "percent" as const,
      required: true,
      initial_value,
    };
    return {
      version,
      actions: [
        {
          id: "node:confirm:n",
          label: "完成节点",
          kind: "node",
          fields: [field],
        },
        {
          id: "node:progress:n",
          label: "同步节点进度",
          kind: "node",
          fields: [field],
        },
      ],
    };
  };
  vi.mocked(getWorkflowActions).mockResolvedValue(progressOptions("20", "v1"));
  const submit = vi.fn();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  fireEvent.change(screen.getByRole("slider"), { target: { value: "60" } });
  vi.mocked(getWorkflowActions).mockResolvedValue(progressOptions("40", "v2"));
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect(
    await screen.findByRole("group", { name: "进度冲突处理" }),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "仅同步此进度" }));
  expect(screen.getByRole("group", { name: "进度冲突处理" })).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "同步进度" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  const progressDraft = readDraft(draftKey(itemKey(item), "node:progress:n"));
  expect(progressDraft?.conflicts).toEqual(["progress"]);
  expect(progressDraft?.fields.progress).toBe("60");
  vi.mocked(getWorkflowActions).mockResolvedValue(progressOptions("50", "v3"));
  await user.click(screen.getByRole("button", { name: "同步进度" }));
  expect(
    screen.getByRole("group", { name: "进度冲突处理" }).textContent,
  ).toContain("50%");
  expect(screen.queryByRole("region", { name: "提交前二次确认" })).toBeNull();
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "同步进度" }));
  expect(
    await screen.findByRole("region", { name: "提交前二次确认" }),
  ).toBeTruthy();
  expect(
    readDraft(draftKey(itemKey(item), "node:progress:n"))?.fields.progress,
  ).toBe("60");
});

it("保留的草稿选项已被云端删除时，重新选择前不能进入确认", async () => {
  writeDraft(key, {
    fields: { shared: "deleted", hours: "2" },
    base_fields: { shared: "original", hours: "1" },
    version: "v1",
    updated_at: 1,
  });
  const next = options("active", "v2");
  next.actions[0].fields[0] = {
    ...next.actions[0].fields[0],
    kind: "select",
    options: [{ value: "active", label: "有效版本" }],
  };
  vi.mocked(getWorkflowActions).mockResolvedValue(next);
  const submit = vi.fn();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "请重新选择文档：原选项已不可用。",
  );
  expect(screen.queryByRole("region", { name: "提交前二次确认" })).toBeNull();
  expect(readDraft(key)?.fields.shared).toBe("deleted");
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("combobox", { name: "文档" }));
  await user.click(screen.getByRole("option", { name: "有效版本" }));
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect(
    await screen.findByRole("region", { name: "提交前二次确认" }),
  ).toBeTruthy();
  expect(readDraft(key)?.fields).toEqual({ shared: "active", hours: "2" });
});
