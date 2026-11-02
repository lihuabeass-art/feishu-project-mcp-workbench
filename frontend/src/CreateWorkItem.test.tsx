// @vitest-environment jsdom
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { CreateWorkItem, creationContinuousKey } from "./CreateWorkItem";
import { creationFieldTipSeenKey, creationVisibilityKey, loadCreationVisibility } from "./CreationFieldVisibility";
import {
  creationPrefillKey,
  saveLocalCreationDefaults,
} from "./CreationSettings";
import {
  creationLocations,
  creationTargetKey,
  createWorkItem,
  getCreationForm,
  lookupCreationField,
  verifyCreation,
  type CreationForm,
  type CreationLocation,
  type CreationResult,
} from "./creation";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./creation", async (original) => ({
  ...(await original<typeof import("./creation")>()),
  getCreationForm: vi.fn(),
  createWorkItem: vi.fn(),
  lookupCreationField: vi.fn(),
  verifyCreation: vi.fn(),
}));
const locations: CreationLocation[] = [
  {
    source_id: "a",
    project_key: "space",
    type_key: "custom",
    space: "示例空间",
    name: "需求反馈",
  },
  {
    source_id: "a",
    project_key: "space",
    type_key: "issue",
    space: "示例空间",
    name: "缺陷跟踪",
  },
];
const target = locations[0];
const form = (): CreationForm => ({
  target,
  version: "v1",
  context: "account-a",
  pending: null,
  fields: [
    {
      key: "name",
      label: "标题",
      kind: "text",
      required: true,
      multiple: false,
      initial: null,
      options: [],
    },
    {
      key: "template",
      label: "流程",
      kind: "select",
      required: true,
      multiple: false,
      initial: "1",
      options: [{ value: "1", label: "通用模板" }],
    },
    {
      key: "description",
      label: "说明",
      kind: "textarea",
      required: true,
      multiple: false,
      initial: null,
      options: [],
    },
    {
      key: "reporter",
      label: "报告人",
      kind: "people",
      required: true,
      multiple: true,
      initial: null,
      options: [],
    },
    {
      key: "zero",
      label: "估算",
      kind: "number",
      required: false,
      multiple: false,
      initial: 0,
      options: [],
    },
  ],
});
const result = (outcome: "verified" | "unknown"): CreationResult => ({
  outcome,
  message:
    outcome === "verified"
      ? "工作事项已创建，并已从飞书回读确认。"
      : "创建结果不确定，草稿已保留。",
  request_id: "r1",
  item_id: {
    project_key: "space",
    work_item_type_key: "custom",
    work_item_id: "42",
  },
  can_verify: outcome === "unknown",
});
function formWithChoices(): CreationForm {
  const next = form();
  next.fields
    .find((field) => field.key === "template")!
    .options.push(
      { value: "2", label: "团队流程" },
      { value: "3", label: "缺陷流程" },
    );
  return next;
}
async function chooseTemplate(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(screen.getByRole("combobox", { name: "流程" }));
  await user.click(screen.getByRole("option", { name: label }));
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(invoke).mockReset();
  vi.mocked(getCreationForm).mockResolvedValue(form());
  vi.mocked(lookupCreationField).mockResolvedValue({
    options: [{ value: "person-a", label: "示例用户" }],
    warning: null,
  });
  vi.mocked(createWorkItem).mockResolvedValue(result("verified"));
  vi.mocked(verifyCreation).mockResolvedValue(result("verified"));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("textbox", { name: "标题" });
  await user.type(screen.getByRole("textbox", { name: "标题" }), "示例事项");
  await user.type(screen.getByRole("textbox", { name: "说明" }), "完整说明");
  await user.click(screen.getByRole("combobox", { name: "报告人" }));
  await user.click(await screen.findByRole("option", { name: "示例用户" }));
  await user.keyboard("{Escape}");
}

describe("通用创建表单", () => {
  it("没有可选字段时不消费小贴士，之后进入有入口的类型才提示", async () => {
    vi.mocked(getCreationForm).mockResolvedValue({ ...form(), fields: form().fields.filter((field) => field.key !== "zero") });
    const mounted = render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await screen.findByRole("textbox", { name: "标题" });
    expect(screen.queryByRole("note")).toBeNull();
    expect(localStorage.getItem(creationFieldTipSeenKey)).toBeNull();
    mounted.unmount();
    vi.mocked(getCreationForm).mockResolvedValue(form());
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    expect(await screen.findByRole("note")).toBeTruthy();
    expect(localStorage.getItem(creationFieldTipSeenKey)).toBe("true");
  });

  it("可选布尔的未填写、主动关闭和清空与核对请求保持一致，连续创建保留选用", async () => {
    const next = form();
    next.fields.push({ key: "flag", label: "可选开关", kind: "bool", required: false, multiple: false, initial: null, options: [] });
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const user = userEvent.setup();
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: /显示字段/ }));
    await user.click(screen.getByRole("combobox", { name: "添加字段" }));
    await user.click(screen.getByRole("option", { name: "可选开关" }));
    const toggle = screen.getByRole("switch", { name: "可选开关" });
    expect(toggle.parentElement?.textContent).toContain("未填写");
    await user.click(toggle);
    expect(toggle.parentElement?.textContent).toContain("开启");
    await user.click(toggle);
    expect(toggle.parentElement?.textContent).toContain("关闭");
    await user.click(screen.getByRole("button", { name: "清空可选开关" }));
    expect(toggle.parentElement?.textContent).toContain("未填写");
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    expect(within(document.querySelector(".creation-review")!).getAllByText("未填写").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /返回/ }));
    await user.click(screen.getByRole("switch", { name: "可选开关" }));
    await user.click(screen.getByRole("switch", { name: "可选开关" }));
    await user.click(screen.getByRole("checkbox", { name: "连续创建" }));
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    expect(within(document.querySelector(".creation-review")!).getByText("关闭")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    await screen.findByText(/上一条工作事项已创建/);
    expect(vi.mocked(createWorkItem).mock.calls[0][0].fields.flag).toBe(false);
    expect(vi.mocked(createWorkItem).mock.calls[0][0].fields.zero).toBe(0);
    expect(screen.getByRole("switch", { name: "可选开关" }).parentElement?.textContent).toContain("未填写");
    expect(getCreationForm).toHaveBeenCalledTimes(2);
  });

  it("字段选择保存失败保持原选择并反馈", async () => {
    const next = form();
    next.fields.push({ key: "extra", label: "可选补充", kind: "text", required: false, multiple: false, initial: null, options: [] });
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const user = userEvent.setup();
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await screen.findByRole("textbox", { name: "标题" });
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === creationVisibilityKey(next)) throw new Error("disk full");
      original.call(this, key, value);
    });
    await user.click(screen.getByRole("button", { name: /显示字段/ }));
    await user.click(screen.getByRole("combobox", { name: "添加字段" }));
    await user.click(screen.getByRole("option", { name: "可选补充" }));
    expect(screen.getByText("字段显示偏好未能保存，请重试。")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "可选补充" })).toBeNull();
    expect(loadCreationVisibility(next)).toEqual([]);
  });
  it("字段小贴士首次进入显示，关闭再开与版本和类型变化均不重复", async () => {
    const user = userEvent.setup();
    const mounted = render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await screen.findByRole("textbox", { name: "标题" });
    expect(await screen.findByRole("note")).toHaveProperty("textContent", expect.stringContaining("缺少需要填写的字段"));
    expect(localStorage.getItem(creationFieldTipSeenKey)).toBe("true");
    await user.click(screen.getByRole("button", { name: "关闭字段小贴士" }));
    expect(screen.queryByRole("note")).toBeNull();
    mounted.unmount();
    vi.mocked(getCreationForm).mockResolvedValue({ ...form(), version: "new-version", target: locations[1] });
    render(<CreateWorkItem locations={locations} initialType="issue" close={vi.fn()} created={vi.fn()} />);
    await screen.findByRole("textbox", { name: "标题" });
    expect(screen.queryByRole("note")).toBeNull();
    expect(creationFieldTipSeenKey).toBe("fstodo.creation-field-tip-seen");
  });
  it("显示选择跨配置版本与来源恢复，账号空间类型隔离且忽略已删除字段", async () => {
    const next = form();
    next.fields.push({ key: "optional", label: "补充信息", kind: "text", required: false, multiple: false, initial: null, options: [] });
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const user = userEvent.setup();
    const mounted = render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await screen.findByRole("textbox", { name: "标题" });
    await user.click(screen.getByRole("button", { name: /显示字段/ }));
    await user.click(screen.getByRole("combobox", { name: "添加字段" }));
    await user.click(screen.getByRole("option", { name: "补充信息" }));
    expect(screen.getByRole("textbox", { name: "补充信息" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "隐藏补充信息" }));
    expect(screen.queryByRole("textbox", { name: "补充信息" })).toBeNull();
    await user.click(screen.getByRole("combobox", { name: "添加字段" }));
    await user.click(screen.getByRole("option", { name: "补充信息" }));
    mounted.unmount();
    // form.version 是远端配置指纹；存储键同样不包含应用版本，升级继续读取。
    const updated = { ...next, version: "new-config", target: { ...target, source_id: "another-source" } };
    expect(loadCreationVisibility(updated)).toEqual(["optional"]);
    expect(loadCreationVisibility({ ...updated, context: "another-account" })).toEqual([]);
    expect(loadCreationVisibility({ ...updated, target: { ...target, project_key: "another-space" } })).toEqual([]);
    expect(loadCreationVisibility({ ...updated, target: { ...target, type_key: "another-type" } })).toEqual([]);
    expect(loadCreationVisibility({ ...updated, fields: form().fields })).toEqual([]);
    vi.mocked(getCreationForm).mockResolvedValue(updated);
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    expect(await screen.findByRole("textbox", { name: "补充信息" })).toBeTruthy();
    expect(creationVisibilityKey(updated)).toBe(creationVisibilityKey(next));
  });

  it("未启用的空布尔和文本不核对也不写入，草稿false和零值自动可见", async () => {
    const next = form();
    next.fields.push(
      { key: "flag", label: "可选开关", kind: "bool", required: false, multiple: false, initial: null, options: [] },
      { key: "empty", label: "空补充", kind: "text", required: false, multiple: false, initial: null, options: [] },
      { key: "saved", label: "已存开关", kind: "bool", required: false, multiple: false, initial: null, options: [] },
    );
    localStorage.setItem(`fstodo.creation.v1:${next.context}:${creationTargetKey(next.target)}`, JSON.stringify({ values: { saved: false }, labels: {} }));
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const user = userEvent.setup();
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await fill(user);
    expect(screen.queryByRole("switch", { name: "可选开关" })).toBeNull();
    expect(screen.getByRole("switch", { name: "已存开关" })).toHaveProperty("checked", false);
    expect(screen.getByLabelText("估算")).toHaveProperty("value", "0");
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    const review = document.querySelector<HTMLElement>(".creation-review")!;
    expect(within(review).queryByText("可选开关")).toBeNull();
    expect(within(review).getByText("已存开关")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    await waitFor(() => expect(createWorkItem).toHaveBeenCalledTimes(1));
    const fields = vi.mocked(createWorkItem).mock.calls[0][0].fields;
    expect(fields).not.toHaveProperty("flag");
    expect(fields).not.toHaveProperty("empty");
    expect(fields.saved).toBe(false);
    expect(fields.zero).toBe(0);
  });
  it("默认收起空可选字段，搜索添加后核对业务字段，核对过程不创建事项", async () => {
    const next = form();
    next.fields.find((field) => field.key === "name")!.label = "需求名称";
    next.fields.find((field) => field.key === "description")!.label = "需求说明";
    next.fields.find((field) => field.key === "template")!.label = "需求流程";
    next.fields.find((field) => field.key === "reporter")!.label = "产品经理";
    next.fields.push(
      { key: "field_project", label: "所属项目", kind: "relation", required: true, multiple: false, initial: null, options: [] },
      { key: "field_feedback", label: "反馈说明", kind: "text", required: false, multiple: false, initial: null, options: [] },
      { key: "field_expected", label: "期望时间", kind: "date", required: false, multiple: false, initial: null, options: [] },
      { key: "field_category", label: "需求分类", kind: "select", required: false, multiple: false, initial: null, options: [{ value: "feature", label: "新增功能" }] },
      { key: "field_source", label: "需求来源", kind: "select", required: false, multiple: false, initial: null, options: [{ value: "customer", label: "客户反馈" }] },
    );
    vi.mocked(getCreationForm).mockResolvedValue(next);
    vi.mocked(lookupCreationField).mockImplementation(async (_, key) => ({
      options: key === "field_project"
        ? [{ value: "project-a", label: "示例项目" }]
        : [{ value: "person-a", label: "示例用户" }],
      warning: null,
    }));
    const user = userEvent.setup();
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await user.type(await screen.findByRole("textbox", { name: "需求名称" }), "示例需求");
    await user.type(screen.getByRole("textbox", { name: "需求说明" }), "完整需求说明");
    expect(screen.queryByRole("textbox", { name: "反馈说明" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /显示字段/ }));
    for (const label of ["反馈说明", "期望时间", "需求分类", "需求来源"]) {
      await user.type(screen.getByRole("textbox", { name: "搜索可选字段" }), label);
      await user.click(screen.getByRole("combobox", { name: "添加字段" }));
      await user.click(screen.getByRole("option", { name: label }));
    }
    expect(screen.getByRole("combobox", { name: "需求流程" })).toBeTruthy();
    for (const [name, choice] of [["所属项目", "示例项目"], ["产品经理", "示例用户"]]) {
      await user.click(screen.getByRole("combobox", { name }));
      await user.click(await screen.findByRole("option", { name: choice }));
      await user.keyboard("{Escape}");
    }
    await user.type(screen.getByRole("textbox", { name: "反馈说明" }), "已有需求的反馈说明");
    fireEvent.change(screen.getByLabelText("期望时间"), { target: { value: "2030-01-01" } });
    for (const [name, choice] of [["需求分类", "新增功能"], ["需求来源", "客户反馈"]]) {
      await user.click(screen.getByRole("combobox", { name }));
      await user.click(screen.getByRole("option", { name: choice }));
    }
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    const review = document.querySelector<HTMLElement>(".creation-review")!;
    for (const value of ["需求名称", "需求说明", "所属项目", "需求流程", "需求分类", "需求来源", "产品经理", "反馈说明", "期望时间", "已有需求的反馈说明", "2030-01-01", "新增功能", "客户反馈", "示例项目", "示例用户"])
      expect(within(review).getByText(value)).toBeTruthy();
    expect(createWorkItem).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("表单空白、头尾、遮罩和滚动边界不带动背景，内部仍可正常滚动", async () => {
    const user = userEvent.setup();
    const backgroundWheel = vi.fn();
    const mounted = render(
      <div onWheel={backgroundWheel}>
        <CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />
        <p>背景清单</p>
      </div>,
    );
    await screen.findByRole("textbox", { name: "标题" });
    const dialog = screen.getByRole("dialog");
    const content = dialog.querySelector<HTMLElement>(".creation-content")!;
    content.style.overflowY = "auto";
    let height = 400;
    Object.defineProperties(content, {
      clientHeight: { value: 100 }, scrollHeight: { get: () => height },
    });
    const blank = document.createElement("div");
    content.append(blank);
    expect(fireEvent.wheel(blank, { deltaY: -80 })).toBe(false);
    expect(fireEvent.wheel(blank, { deltaY: 80 })).toBe(true);
    content.scrollTop = 150;
    expect(fireEvent.wheel(blank, { deltaY: -80 })).toBe(true);
    expect(fireEvent.wheel(blank, { deltaY: 80 })).toBe(true);
    content.scrollTop = 300;
    for (let index = 0; index < 3; index += 1)
      expect(fireEvent.wheel(blank, { deltaY: 80 })).toBe(false);
    height = 100;
    content.scrollTop = 0;
    expect(fireEvent.wheel(blank, { deltaY: 80 })).toBe(false);
    for (const area of [
      dialog.querySelector(".creation-header")!,
      screen.getByRole("button", { name: "核对内容" }),
      dialog.parentElement!,
    ]) expect(fireEvent.wheel(area, { deltaY: 80 })).toBe(false);
    expect(backgroundWheel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("combobox", { name: "流程" }));
    expect(fireEvent.wheel(screen.getByRole("listbox"), { deltaY: 80 })).toBe(false);
    expect(backgroundWheel).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBe(dialog);
    mounted.unmount();
    expect(fireEvent.wheel(blank, { deltaY: 80 })).toBe(true);
    render(<div onWheel={backgroundWheel}>背景清单</div>);
    expect(fireEvent.wheel(screen.getByText("背景清单"), { deltaY: 80 })).toBe(true);
    expect(backgroundWheel).toHaveBeenCalledTimes(1);
  });

  it("完整核对含默认值和人员名称，明确确认后才提交，成功刷新失败也保留成功", async () => {
    const user = userEvent.setup();
    render(
      <CreateWorkItem
        locations={locations}
        close={vi.fn()}
        created={vi.fn().mockRejectedValue(new Error("offline"))}
      />,
    );
    await fill(user);
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    expect(createWorkItem).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "核对创建内容" })).toBeTruthy();
    const review = document.querySelector(".creation-review")!;
    expect(within(review as HTMLElement).getByText("示例用户")).toBeTruthy();
    expect(within(review as HTMLElement).getByText("通用模板")).toBeTruthy();
    expect(within(review as HTMLElement).getByText("0")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    expect(await screen.findByRole("heading", { name: "已创建" })).toBeTruthy();
    expect(createWorkItem).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createWorkItem).mock.calls[0][0].fields).toEqual({
      name: "示例事项",
      template: "1",
      description: "完整说明",
      reporter: ["person-a"],
      zero: 0,
    });
    expect(await screen.findByText(/清单刷新失败/)).toBeTruthy();
  });

  it("关闭重开恢复草稿，空间或类型切换不接收迟到的旧表单", async () => {
    const user = userEvent.setup();
    const props = { locations, close: vi.fn(), created: vi.fn() };
    const mounted = render(<CreateWorkItem {...props} />);
    await screen.findByRole("textbox", { name: "标题" });
    await user.type(screen.getByRole("textbox", { name: "标题" }), "未完草稿");
    mounted.unmount();
    render(<CreateWorkItem {...props} />);
    await waitFor(() =>
      expect(
        (screen.getByRole("textbox", { name: "标题" }) as HTMLInputElement)
          .value,
      ).toBe("未完草稿"),
    );
    let finish!: (f: CreationForm) => void;
    vi.mocked(getCreationForm).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await user.click(screen.getByRole("combobox", { name: "新建类型" }));
    await user.click(screen.getByRole("option", { name: "缺陷跟踪" }));
    vi.mocked(getCreationForm).mockResolvedValue(form());
    await user.click(screen.getByRole("combobox", { name: "新建类型" }));
    await user.click(screen.getByRole("option", { name: "需求反馈" }));
    await screen.findByRole("textbox", { name: "标题" });
    const late = form();
    late.fields[0].label = "迟到的缺陷字段";
    await act(async () => finish(late));
    expect(screen.queryByLabelText("迟到的缺陷字段")).toBeNull();
  });

  it("字段按钮保存本地默认值，新草稿会预填，清除默认值保留当前填写内容", async () => {
    vi.mocked(getCreationForm).mockResolvedValue(formWithChoices());
    const user = userEvent.setup();
    const props = { locations, close: vi.fn(), created: vi.fn() };
    const mounted = render(<CreateWorkItem {...props} />);
    await fill(user);
    await chooseTemplate(user, "团队流程");
    await user.click(
      screen.getByRole("button", { name: "将流程设为本地默认值" }),
    );
    expect(
      screen
        .getByRole("button", { name: "清除流程的本地默认值" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    await user.click(await screen.findByRole("button", { name: "完成" }));
    expect(props.close).toHaveBeenCalledTimes(1);
    mounted.unmount();

    const reopened = render(<CreateWorkItem {...props} />);
    const template = await screen.findByRole("combobox", { name: "流程" });
    expect(
      template.closest(".select-control")?.textContent ||
        template.parentElement?.textContent,
    ).toContain("团队流程");
    expect(
      (screen.getByRole("textbox", { name: "标题" }) as HTMLInputElement).value,
    ).toBe("");
    await user.click(
      screen.getByRole("button", { name: "清除流程的本地默认值" }),
    );
    expect(
      template.closest(".select-control")?.textContent ||
        template.parentElement?.textContent,
    ).toContain("团队流程");
    expect(
      screen
        .getByRole("button", { name: "将流程设为本地默认值" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    reopened.unmount();

    render(<CreateWorkItem {...props} />);
    expect(
      (await screen.findByRole("combobox", { name: "流程" })).textContent,
    ).toContain("通用模板");
    expect(createWorkItem).toHaveBeenCalledTimes(1);
  });

  it("云端移除选项后本地枚举默认值失效留空，不回退其他初始值", async () => {
    const previous = form();
    const template = previous.fields.find((field) => field.key === "template")!;
    template.options.push({ value: "removed", label: "旧流程" });
    saveLocalCreationDefaults(previous, {
      template: { kind: "select", multiple: false, value: "removed" },
    });
    const current = form();
    current.version = "v2";
    vi.mocked(getCreationForm).mockResolvedValue(current);
    const user = userEvent.setup();
    render(
      <CreateWorkItem
        locations={locations}
        close={vi.fn()}
        created={vi.fn()}
      />,
    );
    await fill(user);
    expect(
      screen.getByRole("combobox", { name: "流程" }).textContent,
    ).toContain("待填");
    expect(screen.getByText("本地默认已失效，不再预填")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    expect(screen.getByRole("alert").textContent).toContain("请填写「流程」");
    expect(createWorkItem).not.toHaveBeenCalled();
  });

  it("恢复草稿时保留明确清空的 null、false 和 0，不被本地默认值覆盖", async () => {
    const next = form();
    next.fields.push({
      key: "flag",
      label: "自动检查",
      kind: "bool",
      required: false,
      multiple: false,
      initial: true,
      options: [],
    });
    saveLocalCreationDefaults(next, {
      description: { kind: "textarea", multiple: false, value: "常用说明" },
      zero: { kind: "number", multiple: false, value: 8 },
      flag: { kind: "bool", multiple: false, value: true },
    });
    const storageKey = `fstodo.creation.v1:${next.context}:${creationTargetKey(next.target)}`;
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        values: { description: null, zero: 0, flag: false },
        labels: {},
      }),
    );
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const user = userEvent.setup();
    const props = { locations, close: vi.fn(), created: vi.fn() };
    const mounted = render(<CreateWorkItem {...props} />);
    await screen.findByRole("textbox", { name: "说明" });
    expect(screen.getByRole("textbox", { name: "说明" }).textContent).toBe("");
    expect(
      (screen.getByRole("spinbutton", { name: "估算" }) as HTMLInputElement)
        .value,
    ).toBe("0");
    expect(
      (screen.getByRole("switch", { name: "自动检查" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    await user.type(screen.getByRole("textbox", { name: "标题" }), "继续草稿");
    expect(JSON.parse(localStorage.getItem(storageKey)!).values).toMatchObject({
      description: null,
      zero: 0,
      flag: false,
    });
    mounted.unmount();

    render(<CreateWorkItem {...props} />);
    await screen.findByRole("textbox", { name: "说明" });
    expect(screen.getByRole("textbox", { name: "说明" }).textContent).toBe("");
    expect(
      (screen.getByRole("spinbutton", { name: "估算" }) as HTMLInputElement)
        .value,
    ).toBe("0");
    expect(
      (screen.getByRole("switch", { name: "自动检查" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });

  it("报告人使用Token对应本人并显示姓名，移除后重开保留明确清空的草稿", async () => {
    const next = form();
    Object.assign(
      next.fields.find((field) => field.key === "reporter")!,
      {
        key: "role:reporter",
        role_id: "reporter",
        reporter_self: true,
        initial: ["token-user"],
        options: [{ value: "token-user", label: "Token本人" }],
      },
    );
    next.fields.push({
      key: "role:fix",
      label: "修复人",
      kind: "people",
      required: false,
      multiple: true,
      initial: null,
      options: [],
    });
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const user = userEvent.setup();
    const props = { locations, close: vi.fn(), created: vi.fn() };
    const mounted = render(<CreateWorkItem {...props} />);
    expect(
      (await screen.findByRole("combobox", { name: "报告人" })).textContent,
    ).toContain("Token本人");
    expect(
      screen.getByRole("combobox", { name: "修复人" }).textContent,
    ).not.toContain("Token本人");
    expect(lookupCreationField).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "从报告人移除Token本人" }),
    );
    expect(
      screen.getByRole("combobox", { name: "报告人" }).textContent,
    ).not.toContain("Token本人");
    mounted.unmount();
    render(<CreateWorkItem {...props} />);
    expect(
      (await screen.findByRole("combobox", { name: "报告人" })).textContent,
    ).not.toContain("Token本人");
    const key = `fstodo.creation.v1:${next.context}:${creationTargetKey(target)}`;
    expect(
      JSON.parse(localStorage.getItem(key)!).values["role:reporter"],
    ).toEqual([]);
  });

  it("连续下一条重新预填报告人为本人，其他人员不复制上一条", async () => {
    const next = form();
    Object.assign(
      next.fields.find((field) => field.key === "reporter")!,
      {
        key: "role:reporter",
        role_id: "reporter",
        reporter_self: true,
        initial: ["token-user"],
        options: [{ value: "token-user", label: "Token本人" }],
      },
    );
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const user = userEvent.setup();
    render(
      <CreateWorkItem
        locations={locations}
        close={vi.fn()}
        created={vi.fn()}
      />,
    );
    await screen.findByRole("combobox", { name: "报告人" });
    await user.type(screen.getByRole("textbox", { name: "标题" }), "第一条");
    await user.type(
      screen.getByRole("textbox", { name: "说明" }),
      "第一条说明",
    );
    await user.click(screen.getByRole("combobox", { name: "报告人" }));
    await user.click(await screen.findByRole("option", { name: "示例用户" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("checkbox", { name: "连续创建" }));
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    await screen.findByText(/上一条工作事项已创建并核验/);
    const reporter = screen.getByRole("combobox", { name: "报告人" });
    expect(reporter.textContent).toContain("Token本人");
    expect(reporter.textContent).not.toContain("示例用户");
    expect(
      vi.mocked(createWorkItem).mock.calls[0][0].fields["role:reporter"],
    ).toEqual(["token-user", "person-a"]);
    const key = `fstodo.creation.v1:${next.context}:${creationTargetKey(target)}`;
    expect(
      JSON.parse(localStorage.getItem(key)!).values["role:reporter"],
    ).toEqual(["token-user"]);
  });

  it("本地默认值和编辑草稿按账号上下文及真实类型隔离", async () => {
    let context = "account-a";
    vi.mocked(getCreationForm).mockImplementation(async (selected) => ({
      ...formWithChoices(),
      target: selected,
      context,
    }));
    const user = userEvent.setup();
    const props = { locations, close: vi.fn(), created: vi.fn() };
    const mounted = render(<CreateWorkItem {...props} />);
    await user.type(
      await screen.findByRole("textbox", { name: "标题" }),
      "账号甲的需求",
    );
    await chooseTemplate(user, "团队流程");
    await user.click(
      screen.getByRole("button", { name: "将流程设为本地默认值" }),
    );
    await user.click(screen.getByRole("combobox", { name: "新建类型" }));
    await user.click(screen.getByRole("option", { name: "缺陷跟踪" }));
    expect(
      (
        (await screen.findByRole("textbox", {
          name: "标题",
        })) as HTMLInputElement
      ).value,
    ).toBe("");
    await user.type(
      screen.getByRole("textbox", { name: "标题" }),
      "账号甲的缺陷",
    );
    await chooseTemplate(user, "缺陷流程");
    await user.click(
      screen.getByRole("button", { name: "将流程设为本地默认值" }),
    );
    await user.click(screen.getByRole("combobox", { name: "新建类型" }));
    await user.click(screen.getByRole("option", { name: "需求反馈" }));
    expect(
      (
        (await screen.findByRole("textbox", {
          name: "标题",
        })) as HTMLInputElement
      ).value,
    ).toBe("账号甲的需求");
    expect(
      screen.getByRole("combobox", { name: "流程" }).textContent,
    ).toContain("团队流程");
    mounted.unmount();

    context = "account-b";
    const otherAccount = render(<CreateWorkItem {...props} />);
    expect(
      (
        (await screen.findByRole("textbox", {
          name: "标题",
        })) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(
      screen.getByRole("combobox", { name: "流程" }).textContent,
    ).toContain("通用模板");
    await user.type(
      screen.getByRole("textbox", { name: "标题" }),
      "账号乙的需求",
    );
    await chooseTemplate(user, "缺陷流程");
    await user.click(
      screen.getByRole("button", { name: "将流程设为本地默认值" }),
    );
    otherAccount.unmount();

    context = "account-a";
    render(<CreateWorkItem {...props} />);
    expect(
      (
        (await screen.findByRole("textbox", {
          name: "标题",
        })) as HTMLInputElement
      ).value,
    ).toBe("账号甲的需求");
  });

  it("图片保存期间禁止关闭、切换位置和核对，引用写入草稿后恢复关闭", async () => {
    const imageId = "b".repeat(64);
    const markdownUrl = `fstodo-image:${imageId}`;
    let finish!: (saved: { image_id: string; markdown_url: string }) => void;
    const saved = new Promise<{ image_id: string; markdown_url: string }>(
      (resolve) => {
        finish = resolve;
      },
    );
    vi.mocked(invoke).mockReturnValueOnce(saved).mockResolvedValueOnce({
      data_url: "data:image/png;base64,aW1hZ2U=",
      uploaded_url: null,
    });
    const user = userEvent.setup();
    const close = vi.fn();
    render(
      <CreateWorkItem
        locations={[
          ...locations,
          { ...locations[0], project_key: "other-space", space: "其他空间" },
        ]}
        close={close}
        created={vi.fn()}
      />,
    );
    const description = await screen.findByRole("textbox", {
      name: "说明",
    });
    await user.type(description, "已有说明");
    const image = new File(["image"], "clipboard.png", { type: "image/png" });
    fireEvent(
      description,
      createEvent.paste(description, {
        clipboardData: {
          items: [{ kind: "file", getAsFile: () => image }],
          files: [image],
        },
      }),
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "save_creation_image",
        expect.objectContaining({
          bytesBase64: "aW1hZ2U=",
          mimeType: "image/png",
          fieldKey: "description",
        }),
      ),
    );
    for (const control of [
      screen.getByRole("button", { name: "关闭新建" }),
      screen.getByRole("combobox", { name: "新建空间" }),
      screen.getByRole("combobox", { name: "新建类型" }),
      screen.getByRole("button", { name: "核对内容" }),
    ]) {
      expect((control as HTMLButtonElement).disabled).toBe(true);
      await user.click(control);
    }
    fireEvent.keyDown(description, { key: "Escape", code: "Escape" });
    expect(close).not.toHaveBeenCalled();
    expect(getCreationForm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: "核对创建内容" })).toBeNull();

    await act(async () =>
      finish({ image_id: imageId, markdown_url: markdownUrl }),
    );
    await screen.findByAltText("截图 1");
    const expected = `已有说明![截图](${markdownUrl})`;
    expect(description.textContent).not.toContain("fstodo-image:");
    const storageKey = `fstodo.creation.v1:account-a:${creationTargetKey(target)}`;
    expect(
      JSON.parse(localStorage.getItem(storageKey)!).values.description,
    ).toBe(expected);
    const closeButton = screen.getByRole("button", { name: "关闭新建" });
    expect((closeButton as HTMLButtonElement).disabled).toBe(false);
    expect(
      (screen.getByRole("combobox", { name: "新建空间" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (screen.getByRole("combobox", { name: "新建类型" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (screen.getByRole("button", { name: "核对内容" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    await user.click(closeButton);
    expect(close).toHaveBeenCalledTimes(1);
    expect(createWorkItem).not.toHaveBeenCalled();
  });

  it("正文包含损坏的本机图片引用时保留草稿并阻止核对", async () => {
    const user = userEvent.setup();
    const props = { locations, close: vi.fn(), created: vi.fn() };
    const mounted = render(<CreateWorkItem {...props} />);
    await fill(user);
    const markdown = "完整说明\n![截图](fstodo-image:broken-reference)";
    const editor = screen.getByRole("textbox", { name: "说明" });
    editor.textContent = markdown;
    fireEvent.input(editor);
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "无法识别的本机图片",
    );
    expect(screen.queryByRole("heading", { name: "核对创建内容" })).toBeNull();
    expect(createWorkItem).not.toHaveBeenCalled();
    mounted.unmount();

    render(<CreateWorkItem {...props} />);
    expect(
      (
        await screen.findByRole("textbox", {
          name: "说明",
        })
      ).textContent,
    ).toBe(markdown);
    expect(createWorkItem).not.toHaveBeenCalled();
  });

  it("确认后先上传图片，URL和token保存到草稿后才发送一次创建", async () => {
    const imageId = "c".repeat(64);
    const localMarkdown = `![截图](fstodo-image:${imageId})`;
    const storageKey = `fstodo.creation.v1:account-a:${creationTargetKey(target)}`;
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        values: {
          name: "截图事项",
          template: "1",
          description: `说明\n${localMarkdown}`,
          reporter: ["person-a"],
          zero: 0,
        },
        labels: { "reporter:person-a": "示例用户" },
      }),
    );
    let finish!: (value: { url: string; file_token: string }) => void;
    vi.mocked(invoke).mockImplementation((command) =>
      command === "upload_creation_image"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve({
            data_url: "data:image/png;base64,aW1hZ2U=",
            uploaded_url: null,
            uploaded_token: null,
          }),
    );
    const user = userEvent.setup();
    render(
      <CreateWorkItem
        locations={locations}
        close={vi.fn()}
        created={vi.fn()}
      />,
    );
    await screen.findByAltText("截图 1");
    expect(
      screen.getByRole("textbox", { name: "说明" }).textContent,
    ).not.toContain("fstodo-image:");
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await screen.findByAltText("截图 1");
    expect(
      vi
        .mocked(invoke)
        .mock.calls.some(([command]) => command === "upload_creation_image"),
    ).toBe(false);
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    expect(await screen.findByText("正在上传图片 1/1…")).toBeTruthy();
    expect(createWorkItem).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: "返回编辑" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "关闭新建" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "确认创建" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    vi.mocked(createWorkItem).mockImplementationOnce(async (request) => {
      expect(
        JSON.parse(localStorage.getItem(storageKey)!).values.description,
      ).toBe(request.fields.description);
      return result("verified");
    });
    await act(async () =>
      finish({
        url: "https://project.feishu.cn/example-image.png",
        file_token: "file-token",
      }),
    );
    await screen.findByRole("button", { name: "完成" });
    expect(createWorkItem).toHaveBeenCalledOnce();
    expect(vi.mocked(createWorkItem).mock.calls[0][0].fields.description).toBe(
      "说明\n![截图](https://project.feishu.cn/example-image.png)<!--file-token-->",
    );
  });

  it("图片上传失败时留在核对页并保留本机草稿，不登记或发起创建", async () => {
    const imageId = "d".repeat(64);
    const markdown = `![截图](fstodo-image:${imageId})`;
    const storageKey = `fstodo.creation.v1:account-a:${creationTargetKey(target)}`;
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        values: {
          name: "截图事项",
          template: "1",
          description: markdown,
          reporter: ["person-a"],
        },
        labels: {},
      }),
    );
    vi.mocked(invoke).mockImplementation((command) =>
      command === "upload_creation_image"
        ? Promise.reject(new Error("暂时无法上传图片"))
        : Promise.resolve({
            data_url: "data:image/png;base64,aW1hZ2U=",
            uploaded_url: null,
            uploaded_token: null,
          }),
    );
    const user = userEvent.setup();
    render(
      <CreateWorkItem
        locations={locations}
        close={vi.fn()}
        created={vi.fn()}
      />,
    );
    await screen.findByAltText("截图 1");
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "尚未发起创建",
    );
    expect(screen.getByRole("heading", { name: "核对创建内容" })).toBeTruthy();
    expect(createWorkItem).not.toHaveBeenCalled();
    const saved = JSON.parse(localStorage.getItem(storageKey)!);
    expect(saved.values.description).toBe(markdown);
    expect(saved.request).toBeUndefined();
    expect(
      (screen.getByRole("button", { name: "返回编辑" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("不确定结果不出现重复提交，重新打开只回读核验", async () => {
    const user = userEvent.setup();
    vi.mocked(createWorkItem).mockResolvedValue(result("unknown"));
    const props = { locations, close: vi.fn(), created: vi.fn() };
    const mounted = render(<CreateWorkItem {...props} />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    await screen.findByText("创建结果不确定，草稿已保留。");
    mounted.unmount();
    render(<CreateWorkItem {...props} />);
    await screen.findByRole("button", { name: "重新核验结果" });
    expect(screen.queryByRole("button", { name: "确认创建" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "重新核验结果" }));
    await screen.findByRole("heading", { name: "已创建" });
    expect(createWorkItem).toHaveBeenCalledTimes(1);
    expect(verifyCreation).toHaveBeenCalledTimes(1);
  });

  it("本机草稿丢失仍从后端台账恢复，并可手动给编号只读核验", async () => {
    const next = form();
    next.pending = {
      request: {
        target,
        version: "v1",
        request_id: "saved-request",
        fields: { name: "已提交" },
      },
      result: { ...result("unknown"), item_id: null },
    };
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const user = userEvent.setup();
    render(
      <CreateWorkItem
        locations={locations}
        close={vi.fn()}
        created={vi.fn()}
      />,
    );
    await user.type(
      await screen.findByRole("textbox", { name: "核验事项编号" }),
      "42",
    );
    await user.click(screen.getByRole("button", { name: "重新核验结果" }));
    await screen.findByRole("heading", { name: "已创建" });
    expect(verifyCreation).toHaveBeenCalledWith(
      "saved-request",
      "42",
      next.pending.request,
    );
    expect(createWorkItem).not.toHaveBeenCalled();
  });

  it("无权限或字段配置变化在写入前返回时恢复草稿，不谎报不确定", async () => {
    vi.mocked(createWorkItem).mockRejectedValue({
      kind: "permission",
      message: "没有创建权限",
      before_write: true,
    });
    const user = userEvent.setup();
    render(
      <CreateWorkItem
        locations={locations}
        close={vi.fn()}
        created={vi.fn()}
      />,
    );
    await fill(user);
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    await screen.findByRole("textbox", { name: "标题" });
    expect(screen.queryByRole("button", { name: "重新核验结果" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("没有创建权限");
  });

  it("人员点击即加载，输入自动搜索，保留角色选择并使用红星标识真实必填项", async () => {
    const next = form();
    next.role_requirements_complete = false;
    next.fields.push({
      key: "role:fix",
      label: "修复人",
      kind: "people",
      required: true,
      multiple: true,
      initial: null,
      options: [],
      role_id: "fix",
    });
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const user = userEvent.setup();
    const close = vi.fn();
    render(
      <CreateWorkItem locations={locations} close={close} created={vi.fn()} />,
    );
    await user.click(await screen.findByRole("combobox", { name: "修复人" }));
    expect(screen.queryByRole("button", { name: "查找修复人" })).toBeNull();
    await screen.findByRole("option", { name: "示例用户" });
    expect(lookupCreationField).toHaveBeenCalledWith(target, "role:fix", "");
    await user.type(
      screen.getByRole("textbox", { name: "搜索修复人" }),
      "示例",
    );
    await waitFor(() =>
      expect(lookupCreationField).toHaveBeenCalledWith(
        target,
        "role:fix",
        "示例",
      ),
    );
    await user.keyboard("{ArrowDown}{Enter}{Escape}");
    expect(
      screen.getByRole("combobox", { name: "修复人" }).textContent,
    ).toContain("示例用户");
    expect(close).not.toHaveBeenCalled();
    expect(
      document.querySelector(
        '.creation-field label[for="create-role:fix"] .creation-required',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/飞书未提供部分角色的必填规则/)).toBeTruthy();
  });

  it("停用新建位置仍可直接恢复待核验记录，不依赖元数据读取", async () => {
    const next = form();
    next.pending = {
      request: {
        target,
        version: "v1",
        request_id: "saved-request",
        fields: { name: "已提交" },
      },
      result: result("unknown"),
    };
    render(
      <CreateWorkItem
        locations={[{ ...target, pending_form: next }]}
        close={vi.fn()}
        created={vi.fn()}
      />,
    );
    await screen.findByRole("button", { name: "重新核验结果" });
    expect(getCreationForm).not.toHaveBeenCalled();
    expect(createWorkItem).not.toHaveBeenCalled();
  });

  it("每个人员标签可以单独移除，保留其他人员且不打开搜索", async () => {
    vi.mocked(lookupCreationField).mockResolvedValue({
      options: [
        { value: "a", label: "同事甲" },
        { value: "b", label: "同事乙" },
      ],
      warning: null,
    });
    const user = userEvent.setup();
    render(
      <CreateWorkItem
        locations={locations}
        close={vi.fn()}
        created={vi.fn()}
      />,
    );
    const picker = await screen.findByRole("combobox", { name: "报告人" });
    await user.click(picker);
    await user.click(await screen.findByRole("option", { name: "同事甲" }));
    await user.click(screen.getByRole("option", { name: "同事乙" }));
    await user.keyboard("{Escape}");
    await user.click(
      screen.getByRole("button", { name: "从报告人移除同事甲" }),
    );
    expect(picker.textContent).not.toContain("同事甲");
    expect(picker.textContent).toContain("同事乙");
    expect(picker.getAttribute("aria-expanded")).toBe("false");
    const saved = JSON.parse(
      localStorage.getItem(
        `fstodo.creation.v1:account-a:${JSON.stringify(["space", "custom"])}`,
      )!,
    );
    expect(saved.values.reporter).toEqual(["b"]);
  });

  it("本机保存后尚未登记的请求经核验恢复草稿，不会自动再次创建", async () => {
    const next = form();
    next.pending = {
      request: {
        target,
        version: "v1",
        request_id: "never-dispatched",
        fields: { name: "保留标题" },
      },
      result: { ...result("unknown"), item_id: null },
    };
    vi.mocked(getCreationForm).mockResolvedValue(next);
    vi.mocked(verifyCreation).mockResolvedValue({
      ...result("unknown"),
      outcome: "not_submitted",
      message: "此请求未发往飞书，草稿已恢复。",
      item_id: null,
    });
    const user = userEvent.setup();
    render(
      <CreateWorkItem
        locations={locations}
        close={vi.fn()}
        created={vi.fn()}
      />,
    );
    await user.click(
      await screen.findByRole("button", { name: "重新核验结果" }),
    );
    expect(
      (
        (await screen.findByRole("textbox", {
          name: "标题",
        })) as HTMLInputElement
      ).value,
    ).toBe("保留标题");
    expect(screen.getByRole("alert").textContent).toContain("草稿已恢复");
    expect(createWorkItem).not.toHaveBeenCalled();
  });

  it("必填不支持时明确提示并阻止核对，未填写也不会发写请求", async () => {
    const next = form();
    next.fields[0].kind = "unsupported";
    vi.mocked(getCreationForm).mockResolvedValue(next);
    render(
      <CreateWorkItem
        locations={locations}
        close={vi.fn()}
        created={vi.fn()}
      />,
    );
    await screen.findByText(/此字段暂不支持填写/);
    expect(
      (screen.getByRole("button", { name: "核对内容" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(createWorkItem).not.toHaveBeenCalled();
  });
});

describe("连续创建", () => {
  it("默认关闭，可通过键盘操作并在重新打开后保留本机偏好", async () => {
    const user = userEvent.setup();
    const props = { locations, close: vi.fn(), created: vi.fn() };
    const first = render(<CreateWorkItem {...props} />);
    await screen.findByRole("textbox", { name: "标题" });
    const checkbox = screen.getByRole("checkbox", {
      name: "连续创建",
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    checkbox.focus();
    await user.keyboard(" ");
    expect(checkbox.checked).toBe(true);
    expect(localStorage.getItem(creationContinuousKey)).toBe("true");
    first.unmount();
    render(<CreateWorkItem {...props} />);
    await screen.findByRole("textbox", { name: "标题" });
    expect(
      (screen.getByRole("checkbox", { name: "连续创建" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: "连续创建" }));
    expect(localStorage.getItem(creationContinuousKey)).toBe("false");
    expect(createWorkItem).not.toHaveBeenCalled();
  });

  it("只有创建核验成功才读取同位置下一条，沿用合法本地选项默认且清空正文人员和图片", async () => {
    const current = formWithChoices();
    saveLocalCreationDefaults(current, {
      template: { kind: "select", multiple: false, value: "2" },
    });
    const fresh = formWithChoices();
    fresh.version = "v2";
    fresh.fields.find((field) => field.key === "name")!.initial =
      "云端标题初始值";
    fresh.fields.find((field) => field.key === "description")!.initial =
      "云端正文初始值";
    fresh.fields.find((field) => field.key === "reporter")!.initial = [
      "person-a",
    ];
    vi.mocked(getCreationForm)
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(fresh);
    let finish!: (value: CreationResult) => void;
    vi.mocked(createWorkItem).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    const created = vi.fn();
    render(
      <CreateWorkItem
        locations={locations}
        close={vi.fn()}
        created={created}
      />,
    );
    await fill(user);
    const editor = screen.getByRole("textbox", { name: "说明" });
    editor.textContent =
      "第一条说明 ![截图](https://project.feishu.cn/example.png)";
    fireEvent.input(editor);
    await user.click(screen.getByRole("checkbox", { name: "连续创建" }));
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    expect(getCreationForm).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole("button", { name: "关闭新建" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await act(async () => finish(result("verified")));
    const title = await screen.findByRole("textbox", { name: "标题" });
    expect((title as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("textbox", { name: "说明" }).textContent).toBe("");
    expect(
      screen.getByRole("combobox", { name: "报告人" }).textContent,
    ).not.toContain("示例用户");
    expect(
      screen.getByRole("combobox", { name: "流程" }).textContent,
    ).toContain("团队流程");
    expect(
      (screen.getByRole("checkbox", { name: "连续创建" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(screen.getByText(/上一条工作事项已创建并核验/)).toBeTruthy();
    expect(getCreationForm).toHaveBeenCalledTimes(2);
    expect(getCreationForm).toHaveBeenLastCalledWith(target);
    const saved = JSON.parse(
      localStorage.getItem(
        `fstodo.creation.v1:account-a:${creationTargetKey(target)}`,
      )!,
    );
    expect(saved.request).toBeUndefined();
    expect(saved.result).toBeUndefined();
    expect(saved.values).toMatchObject({
      name: "",
      description: "",
      reporter: [],
      template: "2",
    });
    expect(saved.labels).toEqual({});
    expect(JSON.stringify(saved)).not.toContain("example.png");
    expect(createWorkItem).toHaveBeenCalledTimes(1);
    expect(created).toHaveBeenCalledTimes(1);
  });

  it("结果不明时保留本条，重新核验成功后才继续，恢复入口的旧表单不能用作下一条", async () => {
    const pending = form();
    pending.pending = {
      request: {
        target,
        request_id: "pending-one",
        version: "v1",
        fields: {
          name: "已提交标题",
          template: "1",
          description: "已提交正文",
          reporter: ["person-a"],
        },
      },
      result: result("unknown"),
    };
    localStorage.setItem(creationContinuousKey, "true");
    const key = `fstodo.creation.v1:account-a:${creationTargetKey(target)}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        values: pending.pending.request.fields,
        labels: {},
        continueCreating: true,
        ...pending.pending,
      }),
    );
    const user = userEvent.setup();
    render(
      <CreateWorkItem
        locations={[{ ...target, pending_form: pending }]}
        close={vi.fn()}
        created={vi.fn()}
      />,
    );
    await screen.findByRole("button", { name: "重新核验结果" });
    expect(getCreationForm).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(key)!).values.name).toBe(
      "已提交标题",
    );
    expect(screen.queryByRole("button", { name: "确认创建" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "重新核验结果" }));
    expect(
      (
        (await screen.findByRole("textbox", {
          name: "标题",
        })) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(getCreationForm).toHaveBeenCalledTimes(1);
    expect(verifyCreation).toHaveBeenCalledTimes(1);
    expect(createWorkItem).not.toHaveBeenCalled();
  });

  it.each([
    [
      "业务结果不明",
      () => vi.mocked(createWorkItem).mockResolvedValue(result("unknown")),
    ],
    [
      "传输中断",
      () => vi.mocked(createWorkItem).mockRejectedValue(new Error("连接中断")),
    ],
  ])("%s 不清空本条也不自动开始下一次创建", async (_name, setup) => {
    setup();
    const user = userEvent.setup();
    render(
      <CreateWorkItem
        locations={locations}
        close={vi.fn()}
        created={vi.fn()}
      />,
    );
    await fill(user);
    await user.click(screen.getByRole("checkbox", { name: "连续创建" }));
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    await screen.findByRole("button", { name: "重新核验结果" });
    expect(getCreationForm).toHaveBeenCalledTimes(1);
    expect(createWorkItem).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(
      localStorage.getItem(
        `fstodo.creation.v1:account-a:${creationTargetKey(target)}`,
      )!,
    );
    expect(saved.request).toBeTruthy();
    expect(saved.values.name).toBe("示例事项");
    expect(saved.values.description).toBe("完整说明");
    expect(saved.continueCreating).toBe(true);
    expect(screen.queryByRole("button", { name: "确认创建" })).toBeNull();
  });

  it("创建前校验拒绝时保持本条输入，不开始下一条", async () => {
    vi.mocked(createWorkItem).mockRejectedValue({
      message: "字段配置已更新",
      before_write: true,
    });
    const user = userEvent.setup();
    render(
      <CreateWorkItem
        locations={locations}
        close={vi.fn()}
        created={vi.fn()}
      />,
    );
    await fill(user);
    await user.click(screen.getByRole("checkbox", { name: "连续创建" }));
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    expect(
      (
        (await screen.findByRole("textbox", {
          name: "标题",
        })) as HTMLInputElement
      ).value,
    ).toBe("示例事项");
    expect(screen.getByRole("alert").textContent).toContain("字段配置已更新");
    expect(getCreationForm).toHaveBeenCalledTimes(1);
    expect(createWorkItem).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole("checkbox", { name: "连续创建" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it.each(["not_submitted", "before_write"])(
    "明确未提交（%s）后落盘失败也可恢复再次确认，并保留存储错误",
    async (mode) => {
      const key = `fstodo.creation.v1:account-a:${creationTargetKey(target)}`;
      const original = Storage.prototype.setItem;
      let failedRestore = false;
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
        this: Storage,
        name,
        value,
      ) {
        if (failedRestore && name === key && !JSON.parse(value).request)
          throw new Error("quota");
        original.call(this, name, value);
      });
      vi.mocked(createWorkItem).mockImplementationOnce(async (request) => {
        failedRestore = true;
        if (mode === "before_write")
          throw { message: "校验未通过，尚未提交", before_write: true };
        return {
          ...result("unknown"),
          outcome: "not_submitted",
          request_id: request.request_id,
          message: "已确认未提交",
        };
      });
      const user = userEvent.setup();
      render(
        <CreateWorkItem
          locations={locations}
          close={vi.fn()}
          created={vi.fn()}
        />,
      );
      await fill(user);
      await user.click(screen.getByRole("button", { name: "核对内容" }));
      await user.click(screen.getByRole("button", { name: "确认创建" }));
      await screen.findByRole("textbox", { name: "标题" });
      expect(screen.getByRole("alert").textContent).toContain("未提交");
      expect(screen.getByRole("alert").textContent).toContain(
        "本机草稿未能保存",
      );
      failedRestore = false;
      await user.click(screen.getByRole("button", { name: "核对内容" }));
      await user.click(screen.getByRole("button", { name: "确认创建" }));
      await screen.findByRole("button", { name: "完成" });
      expect(createWorkItem).toHaveBeenCalledTimes(2);
      const calls = vi.mocked(createWorkItem).mock.calls;
      expect(calls[1][0].request_id).not.toBe(calls[0][0].request_id);
    },
  );

  it("下一条读取失败和清单刷新失败保留已创建成功，可重试准备且不再创建", async () => {
    vi.mocked(getCreationForm)
      .mockResolvedValueOnce(form())
      .mockRejectedValueOnce(new Error("表单暂不可用"))
      .mockResolvedValueOnce(form());
    const created = vi.fn().mockRejectedValue(new Error("清单离线"));
    const user = userEvent.setup();
    render(
      <CreateWorkItem
        locations={locations}
        close={vi.fn()}
        created={created}
      />,
    );
    await fill(user);
    await user.click(screen.getByRole("checkbox", { name: "连续创建" }));
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    await screen.findByRole("button", { name: "重试继续创建" });
    expect(screen.getByRole("heading", { name: "已创建" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("已创建成功");
    expect(screen.getByRole("alert").textContent).toContain("清单刷新失败");
    const key = `fstodo.creation.v1:account-a:${creationTargetKey(target)}`;
    expect(JSON.parse(localStorage.getItem(key)!).result.outcome).toBe(
      "verified",
    );
    await user.click(screen.getByRole("button", { name: "重试继续创建" }));
    expect(
      (
        (await screen.findByRole("textbox", {
          name: "标题",
        })) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(createWorkItem).toHaveBeenCalledTimes(1);
    expect(created).toHaveBeenCalledTimes(1);
    expect(getCreationForm).toHaveBeenCalledTimes(3);
  });

  it("清理旧草稿与保存下一条失败保留成功记录，恢复存储后只重试准备", async () => {
    let failNext = false;
    const key = `fstodo.creation.v1:account-a:${creationTargetKey(target)}`;
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      name,
      value,
    ) {
      if (failNext && name === key && !JSON.parse(value).request)
        throw new Error("quota");
      original.call(this, name, value);
    });
    vi.mocked(createWorkItem).mockImplementationOnce(async () => {
      failNext = true;
      return result("verified");
    });
    const user = userEvent.setup();
    render(
      <CreateWorkItem
        locations={locations}
        close={vi.fn()}
        created={vi.fn()}
      />,
    );
    await fill(user);
    await user.click(screen.getByRole("checkbox", { name: "连续创建" }));
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    await screen.findByRole("button", { name: "重试继续创建" });
    expect(screen.getByRole("heading", { name: "已创建" })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(key)!).result.outcome).toBe(
      "verified",
    );
    expect(screen.getByRole("alert").textContent).toContain("已创建成功");
    failNext = false;
    await user.click(screen.getByRole("button", { name: "重试继续创建" }));
    await screen.findByRole("textbox", { name: "标题" });
    expect(JSON.parse(localStorage.getItem(key)!).request).toBeUndefined();
    expect(createWorkItem).toHaveBeenCalledTimes(1);
  });

  it("新版本表单和来源变化后继承稳定键下的默认值、预填偏好及草稿", async () => {
    const previous = formWithChoices();
    saveLocalCreationDefaults(previous, {
      template: { kind: "select", multiple: false, value: "2" },
    });
    localStorage.setItem(creationPrefillKey, "true");
    localStorage.setItem(creationContinuousKey, "true");
    const key = `fstodo.creation.v1:account-a:${creationTargetKey(target)}`;
    localStorage.setItem(
      key,
      JSON.stringify({ values: { name: "升级前未填完的标题" }, labels: {} }),
    );
    const upgraded = formWithChoices();
    upgraded.version = "new-form-version";
    upgraded.target = { ...target, source_id: "new-source" };
    vi.mocked(getCreationForm).mockResolvedValue(upgraded);
    const props = {
      locations: [{ ...target, source_id: "new-source" }],
      close: vi.fn(),
      created: vi.fn(),
    };
    const first = render(<CreateWorkItem {...props} />);
    expect(
      (
        (await screen.findByRole("textbox", {
          name: "标题",
        })) as HTMLInputElement
      ).value,
    ).toBe("升级前未填完的标题");
    expect(
      screen.getByRole("combobox", { name: "流程" }).textContent,
    ).toContain("团队流程");
    expect(
      (screen.getByRole("checkbox", { name: "连续创建" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    first.unmount();
    localStorage.removeItem(key);
    render(<CreateWorkItem {...props} />);
    expect(
      (
        (await screen.findByRole("textbox", {
          name: "标题",
        })) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(
      screen.getByRole("combobox", { name: "流程" }).textContent,
    ).toContain("团队流程");
    expect(localStorage.getItem(creationPrefillKey)).toBe("true");
    expect(localStorage.getItem(creationContinuousKey)).toBe("true");
    expect(createWorkItem).not.toHaveBeenCalled();
  });
});

it("新建位置按真实复合 Key 去重，名称和清单显示不会改变资格，旧配置默认关闭", () => {
  const source = {
    id: "a",
    kind: "personal_todo",
    enabled: true,
    executable: true,
    reason: null,
    action: "todo",
    todo_scope: null,
    type_scope: {
      configured: true,
      selected_count: 0,
      types: [
        {
          project_key: "one",
          project_name: "空间一",
          type_key: "custom",
          type_name: "缺陷",
          selected: false,
        },
        {
          project_key: "two",
          project_name: "空间二",
          type_key: "custom",
          type_name: "需求",
          selected: false,
        },
      ],
    },
  };
  expect(
    creationLocations([source], {
      a: { custom: { enabled: true, alias: "产品经理" } },
    }),
  ).toHaveLength(0);
  const found = creationLocations(
    [source, { ...source, id: "b" }, { ...source, id: "off", enabled: false }],
    {
      a: {
        custom: { enabled: false, alias: "中文别名", create_enabled: true },
      },
      b: {
        custom: { enabled: true, alias: "另一个别名", create_enabled: true },
      },
    },
  );
  expect(found.map((l) => [l.source_id, l.project_key, l.type_key])).toEqual([
    ["a", "one", "custom"],
    ["a", "two", "custom"],
  ]);
});

it("小贴士标记保存失败不影响填写且当前会话不重复", async () => {
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key === creationFieldTipSeenKey) throw new Error("disk full");
    original.call(this, key, value);
  });
  const user = userEvent.setup();
  const mounted = render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
  await screen.findByRole("note");
  await user.type(screen.getByRole("textbox", { name: "标题" }), "继续填写");
  expect(screen.getByRole("textbox", { name: "标题" })).toHaveProperty("value", "继续填写");
  expect(localStorage.getItem(creationFieldTipSeenKey)).toBeNull();
  mounted.unmount();
  render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
  await screen.findByRole("textbox", { name: "标题" });
  expect(screen.queryByRole("note")).toBeNull();
});
