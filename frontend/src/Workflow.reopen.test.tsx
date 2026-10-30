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
import { draftKey, readDraft, writeDraft } from "./workflowDrafts";
import { itemKey } from "./model";
import type { CachedItem, WorkflowOptions } from "./types";

vi.mock("./api", () => ({ getWorkflowActions: vi.fn() }));
const item = {
  id: { project_key: "p", work_item_type_key: "story", work_item_id: "reopen" },
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
          label: "代码版本号",
          kind: "text",
          required: false,
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
const estimates = (first: string, second: string, version = "v1") => {
  const next = options("", version);
  next.actions[0].fields = [first, second].map((value, index) => ({
    key: `points:${index}`,
    label: `估分 · ${index === 0 ? "甲" : "乙"}`,
    kind: "number",
    required: false,
    initial_value: value,
    scope: "assignee",
    step: 0.5,
    min: 0,
  }));
  return next;
};
let remote: WorkflowOptions;
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  remote = options("原值");
  // 普通读取仍返回旧缓存，强制读取才能观察到飞书中的修改。
  vi.mocked(getWorkflowActions).mockImplementation(async (_id, fresh) =>
    fresh ? remote : options("原值"),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("事项和负责人字段修改后退出重进仍展示原值对照，普通修改不当作冲突", async () => {
  const submit = vi.fn();
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  expect(
    screen.queryByRole("group", { name: "代码版本号云端对照" }),
  ).toBeNull();
  fireEvent.change(screen.getByLabelText("代码版本号"), {
    target: { value: "本机修改" },
  });
  fireEvent.change(screen.getByLabelText("工时"), { target: { value: "2" } });
  await user.click(screen.getByRole("button", { name: "返回，保留草稿" }));
  await user.click(screen.getByRole("button", { name: "完成节点" }));
  expect((screen.getByLabelText("代码版本号") as HTMLInputElement).value).toBe(
    "本机修改",
  );
  expect(
    screen.getByRole("group", { name: "代码版本号云端对照" }).textContent,
  ).toContain("原值 原值");
  expect(
    screen.getByRole("group", { name: "工时云端对照" }).textContent,
  ).toContain("原值 1");
  expect(screen.queryAllByRole("group", { name: /冲突处理$/ })).toHaveLength(0);
  expect(screen.queryByText(/云端也有修改/)).toBeNull();
  expect(readDraft(key)?.conflicts).toEqual([]);
  expect(submit).not.toHaveBeenCalled();
});

it.each(["1", "0"])(
  "多人估分云端已有 %s 时，本机加半分只显示原值对照，重开保留且可一键恢复",
  async (value) => {
    vi.mocked(getWorkflowActions).mockResolvedValue(estimates(value, value));
    const submit = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <Workflow item={item} available busy={false} submit={submit} />,
    );
    await user.click(await screen.findByRole("button", { name: "完成节点" }));
    const edited = String(Number(value) + 0.5);
    for (const owner of ["甲", "乙"]) {
      const label = `估分 · ${owner}`;
      expect(
        screen.queryByRole("group", { name: `${label}云端对照` }),
      ).toBeNull();
      await user.click(
        screen.getByRole("button", { name: `${label}增加 0.5` }),
      );
      expect(
        screen.getByRole("group", { name: `${label}云端对照` }).textContent,
      ).toContain(`原值 ${value}`);
      expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(
        edited,
      );
      expect(
        screen.queryByRole("group", { name: `${label}冲突处理` }),
      ).toBeNull();
    }
    view.unmount();
    render(<Workflow item={item} available busy={false} submit={submit} />);
    await user.click(await screen.findByRole("button", { name: "完成节点" }));
    for (const owner of ["甲", "乙"]) {
      expect(
        screen.getByRole("group", { name: `估分 · ${owner}云端对照` })
          .textContent,
      ).toContain(`原值 ${value}`);
    }
    await user.click(
      screen.getByRole("button", { name: "将估分 · 甲恢复为原值" }),
    );
    expect((screen.getByLabelText("估分 · 甲") as HTMLInputElement).value).toBe(
      value,
    );
    expect(readDraft(key)?.fields["points:0"]).toBe(value);
    expect(
      screen.queryByRole("group", { name: "估分 · 甲云端对照" }),
    ).toBeNull();
    expect(
      screen.getByRole("group", { name: "估分 · 乙云端对照" }),
    ).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  },
);

it.each([
  {
    scope: "work_item" as const,
    kind: "text" as const,
    label: "代码版本号",
    remote: "前端：1.2.3",
    local: "后端：2.3.4",
  },
  {
    scope: "node" as const,
    kind: "number" as const,
    unit: "percent" as const,
    label: "进度",
    remote: "25",
    local: "50",
  },
  {
    scope: "assignee" as const,
    kind: "number" as const,
    step: 0.5,
    label: "估分 · 甲",
    remote: "1",
    local: "1.5",
  },
  {
    scope: "assignee" as const,
    kind: "date" as const,
    label: "排期 · 开始日期",
    remote: "2026-10-27",
    local: "2026-10-28",
  },
])(
  "$label 与云端不同时只显示同一原值对照，可恢复且不计为冲突",
  async (testCase) => {
    const { remote: initial_value, local, ...field } = testCase;
    const next = options("");
    next.actions[0].fields = [
      { ...field, key: "value", required: false, initial_value },
    ];
    vi.mocked(getWorkflowActions).mockResolvedValue(next);
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<Workflow item={item} available busy={false} submit={submit} />);
    await user.click(await screen.findByRole("button", { name: "完成节点" }));
    const input = screen.getByLabelText(field.label) as HTMLInputElement;
    fireEvent.change(input, { target: { value: local } });
    const reference = screen.getByRole("group", {
      name: `${field.label}云端对照`,
    });
    expect(reference.textContent).toContain(
      `原值 ${field.unit === "percent" ? `${initial_value}%` : initial_value}`,
    );
    expect(
      screen.queryByRole("group", { name: `${field.label}冲突处理` }),
    ).toBeNull();
    expect(screen.queryByText(/云端也有修改/)).toBeNull();
    expect(
      within(reference).queryByRole("button", { name: /预览/ }),
    ).toBeNull();
    const copy = within(reference).queryByRole("button", {
      name: `复制${field.label}的云端最新值`,
    });
    expect(!!copy).toBe(field.kind === "text");
    if (copy) {
      const write = vi.spyOn(navigator.clipboard, "writeText");
      await user.click(copy);
      expect(write).toHaveBeenCalledWith(initial_value);
      expect(input.value).toBe(local);
    }
    await user.click(
      within(reference).getByRole("button", {
        name: `将${field.label}恢复为原值`,
      }),
    );
    expect(input.value).toBe(initial_value);
    expect(
      screen.queryByRole("group", { name: `${field.label}云端对照` }),
    ).toBeNull();
    fireEvent.change(input, { target: { value: local } });
    expect(readDraft(key)?.conflicts).toEqual([]);
    await user.click(screen.getByRole("button", { name: "提交" }));
    await screen.findByRole("region", { name: "提交前二次确认" });
    expect(submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "返回修改" }));
    fireEvent.change(screen.getByLabelText(field.label), {
      target: { value: initial_value },
    });
    expect(
      screen.queryByRole("group", { name: `${field.label}云端对照` }),
    ).toBeNull();
  },
);

it("共用文本留空时完整显示云端值，可复制或填入后在其基础上修改；数值留空只用占位文字", async () => {
  const shared = "feat/xiaojianqiu/chat-thinking-display-and-long-branch";
  remote = options(shared);
  vi.mocked(getWorkflowActions).mockImplementation(async () => remote);
  const submit = vi.fn();
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  const text = screen.getByLabelText("代码版本号") as HTMLInputElement;
  const hours = screen.getByLabelText("工时") as HTMLInputElement;
  fireEvent.change(text, { target: { value: "" } });
  fireEvent.change(hours, { target: { value: "" } });
  const reference = screen.getByRole("group", { name: "代码版本号云端对照" });
  expect(reference.textContent).toContain(`留空沿用云端：${shared}`);
  expect(text.placeholder).toBe("");
  expect(screen.queryByRole("group", { name: "工时云端对照" })).toBeNull();
  expect(hours.placeholder).toBe("沿用 1");
  const write = vi.spyOn(navigator.clipboard, "writeText");
  await user.click(
    within(reference).getByRole("button", {
      name: "复制代码版本号的云端最新值",
    }),
  );
  expect(write).toHaveBeenCalledWith(shared);
  expect(text.value).toBe("");
  await user.click(
    within(reference).getByRole("button", { name: "将云端值填入代码版本号" }),
  );
  expect(text.value).toBe(shared);
  expect(
    screen.queryByRole("group", { name: "代码版本号云端对照" }),
  ).toBeNull();
  fireEvent.change(text, { target: { value: `${shared}；后端：2.3.4` } });
  expect(
    screen.getByRole("group", { name: "代码版本号云端对照" }).textContent,
  ).toContain(`原值 ${shared}`);
  await user.click(screen.getByRole("button", { name: "提交" }));
  const review = await screen.findByRole("region", { name: "提交前二次确认" });
  expect(review.textContent).toContain(`${shared}；后端：2.3.4`);
  expect(
    within(review).getByText("工时").closest(".workflow-review-row")
      ?.textContent,
  ).toContain("沿用云端");
  expect(readDraft(key)?.fields).toMatchObject({
    shared: `${shared}；后端：2.3.4`,
    hours: "",
  });
  expect(submit).not.toHaveBeenCalled();
});

it("云端估分原本为空时，填写本机值不提示云端修改", async () => {
  vi.mocked(getWorkflowActions).mockResolvedValue(estimates("", ""));
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  fireEvent.change(screen.getByLabelText("估分 · 甲"), {
    target: { value: "1.5" },
  });
  expect(screen.queryByRole("group", { name: "估分 · 甲冲突处理" })).toBeNull();
});

it.each([
  ["切回窗口", "1"],
  ["提交前检查", "1"],
  ["切回窗口", "0"],
  ["提交前检查", "0"],
  ["切回窗口", ""],
  ["提交前检查", ""],
  ["切回窗口", " \n "],
  ["提交前检查", " \n "],
])(
  "%s 发现负责人估分云端变为「%s」时保留本机值，空值不提示清空，其他负责人同值不重复写入",
  async (trigger, value) => {
    remote = estimates("2", "2");
    vi.mocked(getWorkflowActions).mockImplementation(async () => remote);
    const submit = vi.fn();
    const user = userEvent.setup();
    render(<Workflow item={item} available busy={false} submit={submit} />);
    await user.click(await screen.findByRole("button", { name: "完成节点" }));
    for (const owner of ["甲", "乙"]) {
      fireEvent.change(screen.getByLabelText(`估分 · ${owner}`), {
        target: { value: "1.5" },
      });
    }
    remote = estimates(value, "1.5", "v2");
    if (trigger === "切回窗口") fireEvent.focus(window);
    else await user.click(screen.getByRole("button", { name: "提交" }));
    if (value.trim()) {
      const conflict = await screen.findByRole("group", {
        name: "估分 · 甲冲突处理",
      });
      expect(conflict.textContent).toContain("云端也有修改");
      expect(conflict.textContent).toContain(`云端最新值：${value}`);
      expect(
        within(conflict).getByRole("button", {
          name: "复制估分 · 甲的云端最新值",
        }),
      ).toBeTruthy();
      expect(
        within(conflict).queryByRole("button", { name: /恢复为原值/ }),
      ).toBeNull();
    } else {
      await waitFor(() =>
        expect(readDraft(key)?.base_fields?.["points:0"]).toBe(value),
      );
      expect(
        screen.queryByRole("group", { name: "估分 · 甲冲突处理" }),
      ).toBeNull();
      expect(screen.queryByText(/云端已清空此字段/)).toBeNull();
    }
    expect(readDraft(key)?.fields["points:0"]).toBe("1.5");
    expect(
      screen.queryByRole("group", { name: "估分 · 乙冲突处理" }),
    ).toBeNull();
    expect(
      screen.queryByRole("group", { name: "估分 · 乙云端对照" }),
    ).toBeNull();
    if (trigger === "提交前检查" && !value.trim()) {
      // 云端空值不制造无提示的首次提交阻断。
      expect(
        screen.getByRole("region", { name: "提交前二次确认" }),
      ).toBeTruthy();
    } else {
      expect(
        (screen.getByLabelText("估分 · 甲") as HTMLInputElement).value,
      ).toBe("1.5");
      expect(
        screen.queryByRole("region", { name: "提交前二次确认" }),
      ).toBeNull();
      await user.click(screen.getByRole("button", { name: "提交" }));
    }
    await screen.findByRole("region", { name: "提交前二次确认" });
    expect(readDraft(key)?.fields).toEqual({
      "points:0": "1.5",
      "points:1": "1.5",
    });
    await user.click(
      screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"),
    );
    await user.click(
      screen.getByRole("button", {
        name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/,
      }),
    );
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0]).toMatchObject({
      version: "v2",
      fields: { "points:0": "1.5" },
    });
  },
);
it("退出表单后去飞书修改，再次进入会自动读取最新值并显示真实冲突", async () => {
  const submit = vi.fn();
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  fireEvent.change(screen.getByLabelText("代码版本号"), {
    target: { value: "后端：2.3.4" },
  });
  await user.click(screen.getByRole("button", { name: "返回，保留草稿" }));
  remote = options("前端：1.2.3", "v2");
  // 从飞书切回时，流程表单尚未打开。
  fireEvent.focus(window);
  await user.click(screen.getByRole("button", { name: "完成节点" }));
  expect(
    (await screen.findByRole("group", { name: "代码版本号冲突处理" }))
      .textContent,
  ).toContain("前端：1.2.3");
  expect((screen.getByLabelText("代码版本号") as HTMLInputElement).value).toBe(
    "后端：2.3.4",
  );
  expect(readDraft(key)?.base_fields?.shared).toBe("前端：1.2.3");
  expect(submit).not.toHaveBeenCalled();
});

it("关闭事项后重开也会绕过旧缓存检查草稿，云端随后再改仍能再次识别", async () => {
  const user = userEvent.setup();
  const submit = vi.fn();
  const view = render(
    <Workflow item={item} available busy={false} submit={submit} />,
  );
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  fireEvent.change(screen.getByLabelText("代码版本号"), {
    target: { value: "后端v1" },
  });
  view.unmount();
  remote = options("前端v1", "v2");
  render(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  expect(
    (await screen.findByRole("group", { name: "代码版本号冲突处理" }))
      .textContent,
  ).toContain("前端v1");
  await user.click(screen.getByRole("button", { name: "返回，保留草稿" }));
  remote = options("前端v2", "v3");
  await user.click(screen.getByRole("button", { name: "完成节点" }));
  expect(
    (await screen.findByRole("group", { name: "代码版本号冲突处理" }))
      .textContent,
  ).toContain("前端v2");
  expect((screen.getByLabelText("代码版本号") as HTMLInputElement).value).toBe(
    "后端v1",
  );
  expect(submit).not.toHaveBeenCalled();
});

it("重开时共享字段未改过则跟随最新云端值，双方改成相同值时不再提示差异", async () => {
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  fireEvent.change(screen.getByLabelText("工时"), { target: { value: "2" } });
  await user.click(screen.getByRole("button", { name: "返回，保留草稿" }));
  remote = options("同事修改", "v2");
  await user.click(screen.getByRole("button", { name: "完成节点" }));
  await waitFor(() =>
    expect(
      (screen.getByLabelText("代码版本号") as HTMLInputElement).value,
    ).toBe("同事修改"),
  );
  expect(
    screen.queryByRole("group", { name: "代码版本号冲突处理" }),
  ).toBeNull();
  fireEvent.change(screen.getByLabelText("代码版本号"), {
    target: { value: "相同新值" },
  });
  await user.click(screen.getByRole("button", { name: "返回，保留草稿" }));
  remote = options("相同新值", "v3");
  await user.click(screen.getByRole("button", { name: "完成节点" }));
  expect((screen.getByLabelText("代码版本号") as HTMLInputElement).value).toBe(
    "相同新值",
  );
  expect(
    screen.queryByRole("group", { name: "代码版本号冲突处理" }),
  ).toBeNull();
});

it("本机输入改回云端当前值后立即移除冲突显示", async () => {
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  fireEvent.change(screen.getByLabelText("代码版本号"), {
    target: { value: "本机修改" },
  });
  remote = options("同事修改", "v2");
  fireEvent.focus(window);
  await screen.findByRole("group", { name: "代码版本号冲突处理" });
  fireEvent.change(screen.getByLabelText("代码版本号"), {
    target: { value: "同事修改" },
  });
  expect(
    screen.queryByRole("group", { name: "代码版本号冲突处理" }),
  ).toBeNull();
});

it("可选工时清空后沿用最新云端值，不再显示冲突；重新填写仍能核对冲突且最终仅写入修改项", async () => {
  const submit = vi
    .fn()
    .mockResolvedValue({ outcome: "verified", verified: true });
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  const hours = screen.getByLabelText("工时") as HTMLInputElement;
  fireEvent.change(hours, { target: { value: "3" } });
  remote = options("原值", "v2");
  remote.actions[0].fields[1].initial_value = "2";
  fireEvent.focus(window);
  const conflict = await screen.findByRole("group", { name: "工时冲突处理" });
  expect(
    within(conflict).getByText("编辑期间云端也有修改，请核对后提交。")
      .className,
  ).not.toContain("sr-only");
  fireEvent.change(hours, { target: { value: "" } });
  expect(hours.placeholder).toBe("沿用 2");
  expect(screen.queryByRole("group", { name: "工时冲突处理" })).toBeNull();
  expect(screen.queryByRole("group", { name: "工时云端对照" })).toBeNull();
  expect(readDraft(key)?.conflicts).toContain("hours");
  fireEvent.change(hours, { target: { value: "4" } });
  expect(
    screen.getByRole("group", { name: "工时冲突处理" }).textContent,
  ).toContain("云端最新值：2");
  fireEvent.change(hours, { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("代码版本号"), {
    target: { value: "本机说明" },
  });
  await user.click(screen.getByRole("button", { name: "提交" }));
  const review = await screen.findByRole("region", { name: "提交前二次确认" });
  const row = within(review)
    .getByText("工时", { selector: "dt > span" })
    .closest("div")!;
  expect(within(row).getByText("2")).toBeTruthy();
  expect(within(row).getByText("沿用云端")).toBeTruthy();
  await user.click(
    screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(screen.getByRole("button", { name: "确认提交并执行" }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0].fields).toEqual({ shared: "本机说明" });
});

it("重开检测失败保留清单和原草稿，明确重试后按最新值显示冲突", async () => {
  const user = userEvent.setup();
  const submit = vi.fn();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  fireEvent.change(screen.getByLabelText("代码版本号"), {
    target: { value: "本机修改" },
  });
  await user.click(screen.getByRole("button", { name: "返回，保留草稿" }));
  const saved = readDraft(key);
  const original = localStorage.getItem(key);
  vi.mocked(getWorkflowActions).mockRejectedValueOnce({
    kind: "network",
    message: "读取失败",
  });
  await user.click(screen.getByRole("button", { name: "完成节点" }));
  expect((await screen.findByRole("alert")).textContent).toContain("动作检查未完成");
  expect(readDraft(key)).toEqual(saved);
  expect(localStorage.getItem(key)).toBe(original);
  expect(screen.queryByLabelText("代码版本号")).toBeNull();
  expect((screen.getByRole("button", { name: "完成节点" }) as HTMLButtonElement).disabled).toBe(false);
  remote = options("云端修改", "v2");
  fireEvent.focus(window);
  expect(localStorage.getItem(key)).toBe(original);
  await user.click(screen.getByRole("button", { name: "完成节点" }));
  expect(
    (await screen.findByRole("group", { name: "代码版本号冲突处理" }))
      .textContent,
  ).toContain("云端修改");
  expect((screen.getByLabelText("代码版本号") as HTMLInputElement).value).toBe(
    "本机修改",
  );
  expect(submit).not.toHaveBeenCalled();
});

it("fresh检测未返回先保留清单，确认本地动作后后台读取仍保留刚输入内容并提示冲突", async () => {
  const user = userEvent.setup();
  const submit = vi.fn();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  const open = await screen.findByRole("button", { name: "完成节点" });
  let resolve!: (value: WorkflowOptions) => void;
  vi.mocked(getWorkflowActions).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await user.click(open);
  expect(screen.queryByLabelText("代码版本号")).toBeNull();
  expect(localStorage.getItem(key)).toBeNull();
  expect((open as HTMLButtonElement).disabled).toBe(true);
  await act(async () => resolve(options("原值")));
  const input = screen.getByLabelText("代码版本号") as HTMLInputElement;
  expect(input.disabled).toBe(false);
  expect(
    (
      screen.getByRole("button", {
        name: "返回，保留草稿",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  expect(getWorkflowActions).toHaveBeenLastCalledWith(item.id, true);
  vi.mocked(getWorkflowActions).mockImplementationOnce(
    () => new Promise((done) => { resolve = done; }),
  );
  fireEvent.focus(window);
  fireEvent.change(input, { target: { value: "后端v1" } });
  fireEvent.change(screen.getByLabelText("工时"), { target: { value: "3" } });
  await act(async () => resolve(options("前端v1", "v2")));
  expect(input.value).toBe("后端v1");
  expect((screen.getByLabelText("工时") as HTMLInputElement).value).toBe("3");
  expect(
    screen.getByRole("group", { name: "代码版本号冲突处理" }).textContent,
  ).toContain("前端v1");
  expect(readDraft(key)?.fields).toEqual({ shared: "后端v1", hours: "3" });
  expect(submit).not.toHaveBeenCalled();
});

it("检测期间不让旧缓存回退草稿，fresh恢复后沿用正确基线且后续读取保留编辑", async () => {
  writeDraft(key, {
    fields: { shared: "上次最新值", hours: "2" },
    base_fields: { shared: "上次最新值", hours: "1" },
    version: "v2",
    updated_at: 1,
  });
  const saved = readDraft(key);
  const original = localStorage.getItem(key);
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={vi.fn()} />);
  const open = await screen.findByRole("button", { name: "完成节点" });
  let resolve!: (value: WorkflowOptions) => void;
  vi.mocked(getWorkflowActions).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await user.click(open);
  expect(screen.queryByLabelText("代码版本号")).toBeNull();
  expect(localStorage.getItem(key)).toBe(original);
  expect(readDraft(key)).toEqual(saved);
  await act(async () => resolve(options("上次最新值", "v2")));
  expect((screen.getByLabelText("代码版本号") as HTMLInputElement).value).toBe(
    "上次最新值",
  );
  expect(
    screen.queryByRole("group", { name: "代码版本号冲突处理" }),
  ).toBeNull();
  fireEvent.change(screen.getByLabelText("工时"), { target: { value: "3" } });
  expect(readDraft(key)?.version).toBe("v2");
  expect(readDraft(key)?.base_fields?.shared).toBe("上次最新值");
  vi.mocked(getWorkflowActions).mockImplementationOnce(
    () => new Promise((done) => { resolve = done; }),
  );
  fireEvent.focus(window);
  await act(async () => resolve(options("云端再次修改", "v3")));
  expect((screen.getByLabelText("代码版本号") as HTMLInputElement).value).toBe(
    "云端再次修改",
  );
  expect((screen.getByLabelText("工时") as HTMLInputElement).value).toBe("3");
  expect(
    screen.queryByRole("group", { name: "代码版本号冲突处理" }),
  ).toBeNull();
});

it("没有基线的旧草稿在fresh前保留未知起点，确认新版本后仍提示核对", async () => {
  writeDraft(key, {
    fields: { shared: "原值" },
    version: "v1",
    updated_at: 1,
  });
  const original = localStorage.getItem(key);
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={vi.fn()} />);
  const open = await screen.findByRole("button", { name: "完成节点" });
  let resolve!: (value: WorkflowOptions) => void;
  vi.mocked(getWorkflowActions).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await user.click(open);
  expect(screen.queryByLabelText("工时")).toBeNull();
  expect(localStorage.getItem(key)).toBe(original);
  expect(readDraft(key)?.base_fields?.shared).toBeUndefined();
  await act(async () => resolve(options("云端新值", "v2")));
  fireEvent.change(screen.getByLabelText("工时"), { target: { value: "3" } });
  expect((screen.getByLabelText("代码版本号") as HTMLInputElement).value).toBe(
    "原值",
  );
  expect(
    screen.getByRole("group", { name: "代码版本号冲突处理" }).textContent,
  ).toContain("云端新值");
});

it("读取期间返回再打开同一节点会重新检查，旧响应不能覆盖本次最新结果", async () => {
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={vi.fn()} />);
  const open = await screen.findByRole("button", { name: "完成节点" });
  await user.click(open);
  let resolve!: (value: WorkflowOptions) => void;
  vi.mocked(getWorkflowActions).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  fireEvent.focus(window);
  fireEvent.change(screen.getByLabelText("代码版本号"), {
    target: { value: "本机修改" },
  });
  await user.click(screen.getByRole("button", { name: "返回，保留草稿" }));
  remote = options("本次最新值", "v3");
  await user.click(screen.getByRole("button", { name: "完成节点" }));
  expect(
    (await screen.findByRole("group", { name: "代码版本号冲突处理" }))
      .textContent,
  ).toContain("本次最新值");
  await act(async () => resolve(options("迟到旧值", "v2")));
  expect(readDraft(key)?.base_fields?.shared).toBe("本次最新值");
  expect((screen.getByLabelText("代码版本号") as HTMLInputElement).value).toBe(
    "本机修改",
  );
});

it("fresh进入表单后focus读取未完成时提交仍独立检查，旧响应不能覆盖二次确认", async () => {
  const user = userEvent.setup();
  const submit = vi.fn();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  const open = await screen.findByRole("button", { name: "完成节点" });
  await user.click(open);
  let resolve!: (value: WorkflowOptions) => void;
  vi.mocked(getWorkflowActions).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  fireEvent.focus(window);
  fireEvent.change(screen.getByLabelText("工时"), { target: { value: "3" } });
  remote = options("原值", "v2");
  await user.click(screen.getByRole("button", { name: "提交" }));
  await screen.findByRole("region", { name: "提交前二次确认" });
  expect(readDraft(key)?.version).toBe("v2");
  expect(getWorkflowActions).toHaveBeenCalledTimes(4);
  await act(async () => resolve(options("迟到旧值", "v1")));
  expect(readDraft(key)?.base_fields?.shared).toBe("原值");
  expect(readDraft(key)?.fields.hours).toBe("3");
  expect(
    screen.getByRole("region", { name: "提交前二次确认" }).textContent,
  ).toContain("3");
  expect(submit).not.toHaveBeenCalled();
});

it("重开时动作已失效则保留完整草稿并显示最新动作列表", async () => {
  const user = userEvent.setup();
  render(<Workflow item={item} available busy={false} submit={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  fireEvent.change(screen.getByLabelText("代码版本号"), {
    target: { value: "本机修改" },
  });
  await user.click(screen.getByRole("button", { name: "返回，保留草稿" }));
  const saved = readDraft(key);
  remote = { version: "v2", actions: [] };
  await user.click(screen.getByRole("button", { name: "完成节点" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "原动作已不可用",
  );
  expect(screen.queryByLabelText("代码版本号")).toBeNull();
  expect(screen.queryByRole("button", { name: "完成节点" })).toBeNull();
  expect(readDraft(key)).toEqual(saved);
});

it("重开读取期间切换事项，迟到的旧响应不改写任一事项的草稿", async () => {
  const user = userEvent.setup();
  const submit = vi.fn();
  const view = render(
    <Workflow item={item} available busy={false} submit={submit} />,
  );
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  fireEvent.change(screen.getByLabelText("代码版本号"), {
    target: { value: "本机修改" },
  });
  await user.click(screen.getByRole("button", { name: "返回，保留草稿" }));
  const saved = readDraft(key);
  let resolve!: (value: WorkflowOptions) => void;
  vi.mocked(getWorkflowActions).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await user.click(screen.getByRole("button", { name: "完成节点" }));
  const other = { ...item, id: { ...item.id, work_item_id: "other" } };
  view.rerender(
    <Workflow item={other} available busy={false} submit={submit} />,
  );
  await screen.findByRole("button", { name: "完成节点" });
  await act(async () => resolve(options("迟到云端值", "v2")));
  expect(readDraft(key)).toEqual(saved);
  expect(readDraft(draftKey(itemKey(other), "a"))).toBeNull();
  expect(
    screen.queryByRole("group", { name: "代码版本号冲突处理" }),
  ).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});
