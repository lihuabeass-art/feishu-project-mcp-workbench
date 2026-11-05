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
  saveLocalCreationDefaults,
} from "./CreationSettings";
import {
  creationLocations,
  creationTargetKey,
  createWorkItem,
  getCreationForm,
  lookupCreationField,
  resolveCreationRelationLabels,
  verifyCreation,
  type CreationForm,
  type CreationLocation,
  type CreationResult,
} from "./creation";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("./creation", async (original) => ({
  ...(await original<typeof import("./creation")>()),
  getCreationForm: vi.fn(),
  createWorkItem: vi.fn(),
  lookupCreationField: vi.fn(),
  resolveCreationRelationLabels: vi.fn(),
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
  vi.mocked(resolveCreationRelationLabels).mockReset().mockResolvedValue({ options: [], warning: null });
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
  it.each([{ tester: [] }, { tester: ["person-a"] }])("必填提示链接聚焦人员主控件和富文本正文，已有值=$tester", async ({ tester }) => {
    const next = form();
    next.fields.push({ key: "tester", label: "测试负责人", kind: "people", required: false, multiple: true, initial: [], options: [] });
    const values = { name: "快捷定位", description: "已填写的正文", tester, reporter: ["a"], template: "1", zero: 0 };
    next.pending = { request: { target, request_id: "focus-required", version: "v1", fields: values }, result: { ...result("unknown"), outcome: "not_submitted", item_id: null, rejected_field_keys: ["tester", "description"] } };
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const user = userEvent.setup();
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "返回草稿" }));
    const notice = screen.getByRole("note", { name: "已自动显示本次创建必填字段" });
    await user.click(within(notice).getByRole("button", { name: "测试负责人" }));
    const people = screen.getByRole("combobox", { name: "测试负责人" });
    expect(document.activeElement).toBe(people);
    expect(people.getAttribute("aria-expanded")).toBe("false");
    await user.click(within(notice).getByRole("button", { name: "说明" }));
    const description = screen.getByRole("textbox", { name: "说明" });
    expect(document.activeElement).toBe(description);
    expect(description.getAttribute("contenteditable")).toBe("true");
    expect(JSON.parse(localStorage.getItem(`fstodo.creation.v1:account-a:${creationTargetKey(target)}`)!).values).toEqual(values);
  });

  it.each(["create", "verify"])("%s等待结果时补齐的关联名称不会被旧操作快照覆盖", async (mode) => {
    const next = form();
    next.fields.push({ key: "parent", label: "所属需求", kind: "relation", required: false, multiple: false, initial: null, options: [] });
    const values = { name: "交错提交", description: "说明", reporter: ["a"], template: "1", parent: "987", zero: 0 };
    const request = { target, version: "v1", request_id: "pending-label-interleave", fields: values };
    const outcome = { ...result("unknown"), item_id: null };
    if (mode === "verify") next.pending = { request, result: outcome };
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const key = `fstodo.creation.v1:account-a:${creationTargetKey(target)}`;
    if (mode === "create") localStorage.setItem(key, JSON.stringify({ values, labels: {} }));
    let resolveLabel!: (value: { options: { value: string; label: string }[]; warning: null }) => void;
    let resolveOperation!: (value: CreationResult) => void;
    vi.mocked(resolveCreationRelationLabels).mockReturnValueOnce(new Promise((resolve) => { resolveLabel = resolve; }));
    const operation = new Promise<CreationResult>((resolve) => { resolveOperation = resolve; });
    if (mode === "create") vi.mocked(createWorkItem).mockReturnValueOnce(operation);
    else vi.mocked(verifyCreation).mockReturnValueOnce(operation);
    const user = userEvent.setup();
    const props = { locations, close: vi.fn(), created: vi.fn() };
    const mounted = render(<CreateWorkItem {...props} />);
    if (mode === "create") {
      await user.click(await screen.findByRole("button", { name: "核对内容" }));
      await user.click(screen.getByRole("button", { name: "确认创建" }));
      await waitFor(() => expect(createWorkItem).toHaveBeenCalledOnce());
    } else {
      await user.click(await screen.findByRole("button", { name: "重新核验结果" }));
      await waitFor(() => expect(verifyCreation).toHaveBeenCalledOnce());
    }
    const originalRequest = JSON.parse(localStorage.getItem(key) || "null")?.request || request;
    await act(async () => resolveLabel({ options: [{ value: "987", label: "交错读取仍保留的需求名称" }], warning: null }));
    expect(JSON.parse(localStorage.getItem(key)!).labels["parent:987"]).toBe("交错读取仍保留的需求名称");
    await act(async () => resolveOperation(outcome));
    const completed = JSON.parse(localStorage.getItem(key)!);
    expect(completed.labels["parent:987"]).toBe("交错读取仍保留的需求名称");
    expect(completed.request).toEqual(originalRequest);
    expect(completed.result).toEqual(outcome);
    mounted.unmount();
    vi.mocked(resolveCreationRelationLabels).mockRejectedValue(new Error("后续读取失败"));
    render(<CreateWorkItem {...props} />);
    await user.click(await screen.findByRole("button", { name: "返回草稿" }));
    expect(await screen.findByText("交错读取仍保留的需求名称")).toBeTruthy();
    expect(resolveCreationRelationLabels).toHaveBeenCalledOnce();
    expect(createWorkItem).toHaveBeenCalledTimes(mode === "create" ? 1 : 0);
    expect(verifyCreation).toHaveBeenCalledTimes(mode === "verify" ? 1 : 0);
  });

  it("恢复仅ID关联后补名，保留查询期间编辑，核对与重开共用持久名称", async () => {
    const next = form();
    next.fields.push({ key: "parent", label: "所属需求", kind: "relation", required: false, multiple: false, initial: null, options: [] });
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const key = `fstodo.creation.v1:account-a:${creationTargetKey(target)}`;
    const values = { name: "原草稿", description: "说明", reporter: ["a"], template: "1", parent: "123", zero: 0 };
    localStorage.setItem(key, JSON.stringify({ values, labels: { "parent:123": "123" }, reviewFieldKeys: ["parent"], recoveredRequestId: "old" }));
    let complete!: (value: { options: { value: string; label: string }[]; warning: null }) => void;
    vi.mocked(resolveCreationRelationLabels).mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const user = userEvent.setup();
    const props = { locations, close: vi.fn(), created: vi.fn() };
    const mounted = render(<CreateWorkItem {...props} />);
    fireEvent.change(await screen.findByRole("textbox", { name: "标题" }), { target: { value: "查询中编辑标题" } });
    await act(async () => complete({ options: [{ value: "123", label: "统一搜索体验" }], warning: null }));
    expect(await screen.findByText("统一搜索体验")).toBeTruthy();
    expect(resolveCreationRelationLabels).toHaveBeenCalledWith(target, "parent", ["123"]);
    await user.click(screen.getByRole("combobox", { name: "所属需求" }));
    await user.keyboard("{Escape}");
    expect(screen.getByText("统一搜索体验")).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem(key)!);
    expect(saved.values).toEqual({ ...values, name: "查询中编辑标题" });
    expect(saved.reviewFieldKeys).toEqual(["parent"]);
    expect(saved.requiredFieldKeys).toEqual(["parent"]);
    expect(saved.recoveredRequestId).toBe("old");
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    expect(within(document.querySelector(".creation-review")!).getByText("统一搜索体验")).toBeTruthy();
    mounted.unmount();
    render(<CreateWorkItem {...props} />);
    expect(await screen.findByText("统一搜索体验")).toBeTruthy();
    expect(resolveCreationRelationLabels).toHaveBeenCalledTimes(1);
    expect(createWorkItem).not.toHaveBeenCalled();
  });

  it("未知提交只读稿独立补关联名称，不改变原请求或重发", async () => {
    const next = form();
    next.fields.push({ key: "parent", label: "所属需求", kind: "relation", required: false, multiple: false, initial: null, options: [] });
    const request = { target, version: "v1", request_id: "unknown-label", fields: { name: "提交草稿", parent: "456" } };
    const outcome = { ...result("unknown"), item_id: null };
    next.pending = { request, result: outcome };
    vi.mocked(getCreationForm).mockResolvedValue(next);
    vi.mocked(resolveCreationRelationLabels).mockResolvedValue({ options: [{ value: "456", label: "工作台需求" }], warning: null });
    const user = userEvent.setup();
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "返回草稿" }));
    expect(await screen.findByText("工作台需求")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "所属需求" })).toBeNull();
    const saved = JSON.parse(localStorage.getItem(`fstodo.creation.v1:account-a:${creationTargetKey(target)}`)!);
    expect(saved.request).toEqual(request);
    expect(saved.result).toEqual(outcome);
    expect(saved.values).toEqual(request.fields);
    expect(createWorkItem).not.toHaveBeenCalled();
    expect(verifyCreation).not.toHaveBeenCalled();
  });

  it("关联补名迟到及失败不污染其他位置，不清空选择或提示对象不存在", async () => {
    const first = form();
    first.fields.push({ key: "parent", label: "所属需求", kind: "relation", required: false, multiple: false, initial: "789", options: [] });
    const second = { ...first, target: locations[1], context: "account-b" };
    vi.mocked(getCreationForm).mockImplementation(async (target) => target.type_key === "issue" ? second : first);
    let complete!: (value: { options: { value: string; label: string }[]; warning: null }) => void;
    vi.mocked(resolveCreationRelationLabels).mockReturnValueOnce(new Promise((resolve) => { complete = resolve; })).mockRejectedValueOnce(new Error("读取暂时失败"));
    const user = userEvent.setup();
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await screen.findByRole("combobox", { name: "所属需求" });
    await user.click(screen.getByRole("combobox", { name: "新建类型" }));
    await user.click(screen.getByRole("option", { name: "缺陷跟踪" }));
    await waitFor(() => expect(resolveCreationRelationLabels).toHaveBeenCalledTimes(2));
    await act(async () => complete({ options: [{ value: "789", label: "旧账号名称" }], warning: null }));
    expect(screen.queryByText("旧账号名称")).toBeNull();
    expect(screen.getByRole("combobox", { name: "所属需求" }).textContent).toContain("789");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(createWorkItem).not.toHaveBeenCalled();
  });

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
    await user.click(screen.getByRole("button", { name: "显示可选开关" }));
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
    await user.click(screen.getByRole("switch", { name: "连续创建" }));
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
    await user.click(screen.getByRole("button", { name: "显示可选补充" }));
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
    await user.click(screen.getByRole("button", { name: "显示补充信息" }));
    expect(screen.getByRole("textbox", { name: "补充信息" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "隐藏补充信息" }));
    expect(screen.queryByRole("textbox", { name: "补充信息" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "显示补充信息" }));
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

  it("空人员与角色按需显示，已填写人员先清空才能隐藏，旧配置在升级后继续恢复", async () => {
    const next = form();
    next.fields.push(
      { key: "watchers", label: "关注人", kind: "people", required: false, multiple: true, initial: null, options: [] },
      { key: "role:pm", label: "项目经理", kind: "people", required: false, multiple: true, initial: null, options: [], role_id: "pm" },
      { key: "optional", label: "补充信息", kind: "text", required: false, multiple: false, initial: null, options: [] },
    );
    // 沿用旧版数组格式及存储键，失效字段逐项忽略。
    localStorage.setItem(creationVisibilityKey(next), JSON.stringify(["optional", "removed"]));
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const user = userEvent.setup();
    const close = vi.fn();
    const mounted = render(<CreateWorkItem locations={locations} close={close} created={vi.fn()} />);
    await screen.findByRole("textbox", { name: "标题" });
    expect(screen.getByRole("textbox", { name: "补充信息" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "关注人" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "项目经理" })).toBeNull();
    const trigger = screen.getByRole("button", { name: /显示字段/ });
    await user.click(trigger);
    await user.click(within(screen.getByRole("group", { name: "字段分类" })).getByRole("button", { name: "人员信息" }));
    expect(within(screen.getByRole("group", { name: "固定显示的字段" })).getByText("报告人")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "隐藏报告人" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "显示关注人" }));
    await user.click(screen.getByRole("button", { name: "显示项目经理" }));
    await user.click(screen.getByRole("combobox", { name: "项目经理" }));
    await user.click(await screen.findByRole("option", { name: "示例用户" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "隐藏项目经理" })).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "清空项目经理" }));
    await user.click(screen.getByRole("button", { name: "隐藏项目经理" }));
    expect(screen.queryByRole("combobox", { name: "项目经理" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "显示项目经理" }));
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(trigger);
    expect(close).not.toHaveBeenCalled();
    mounted.unmount();

    const updated = { ...next, version: "new-config", target: { ...target, source_id: "other-source" },
      fields: next.fields.filter((field) => field.key !== "optional").map((field) =>
        field.key === "role:pm" ? { ...field, label: "项目负责人" } : field) };
    expect(loadCreationVisibility(updated)).toEqual(["watchers", "role:pm"]);
    expect(loadCreationVisibility({ ...updated, context: "other-account" })).toEqual([]);
    expect(loadCreationVisibility({ ...updated, target: { ...target, project_key: "other-space" } })).toEqual([]);
    expect(loadCreationVisibility({ ...updated, target: { ...target, type_key: "other-type" } })).toEqual([]);
    vi.mocked(getCreationForm).mockResolvedValue(updated);
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    expect(await screen.findByRole("combobox", { name: "关注人" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "项目负责人" })).toBeTruthy();
    expect(creationVisibilityKey(updated)).toBe(creationVisibilityKey(next));
  });

  it("所有可选人员收起后仍说明角色必填规则与添加入口", async () => {
    const next = form();
    next.role_requirements_complete = false;
    next.fields.find((field) => field.key === "reporter")!.required = false;
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const user = userEvent.setup();
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await screen.findByRole("textbox", { name: "标题" });
    expect(screen.queryByRole("region", { name: "人员信息" })).toBeNull();
    expect(screen.getByText(/请在「显示字段 → 人员信息」/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /显示字段/ }));
    await user.click(screen.getByRole("button", { name: "显示报告人" }));
    expect(screen.getByRole("region", { name: "人员信息" })).toBeTruthy();
    expect(screen.getByText(/请按该类型在飞书中的要求填写人员/)).toBeTruthy();
  });

  it("未启用的空布尔、文本和人员不核对也不写入，草稿false和零值自动可见", async () => {
    const next = form();
    next.fields.push(
      { key: "flag", label: "可选开关", kind: "bool", required: false, multiple: false, initial: null, options: [] },
      { key: "empty", label: "空补充", kind: "text", required: false, multiple: false, initial: null, options: [] },
      { key: "saved", label: "已存开关", kind: "bool", required: false, multiple: false, initial: null, options: [] },
      { key: "watchers", label: "关注人", kind: "people", required: false, multiple: true, initial: null, options: [] },
      { key: "role:pm", label: "项目经理", kind: "people", required: false, multiple: true, initial: null, options: [], role_id: "pm" },
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
    expect(fields).not.toHaveProperty("watchers");
    expect(fields).not.toHaveProperty("role:pm");
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
      const search = screen.getByRole("textbox", { name: "搜索可选字段" });
      await user.clear(search);
      await user.type(search, label);
      await user.click(screen.getByRole("button", { name: `显示${label}` }));
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

  it("关闭流程确认也不跳过新建核对，完整显示默认值和人员名称，确认后才创建", async () => {
    localStorage.setItem("fstodo.workflow-skip-confirmation.v1", "true");
    const user = userEvent.setup();
    render(
      <CreateWorkItem
        locations={locations}
        close={vi.fn()}
        created={vi.fn().mockRejectedValue(new Error("offline"))}
      />,
    );
    await fill(user);
    const content = document.querySelector<HTMLElement>(".creation-content")!;
    content.scrollTop = 320;
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    expect(createWorkItem).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "核对创建内容" }));
    expect(content.scrollTop).toBe(0);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "确认创建" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "关闭新建" }));
    const review = screen.getByRole("region", { name: "创建内容核对" });
    const basic = within(review).getByRole("region", { name: "基本信息" });
    const people = within(review).getByRole("region", { name: "人员信息" });
    expect(within(people).getByText("示例用户")).toBeTruthy();
    expect(within(basic).getByText("通用模板")).toBeTruthy();
    expect(within(basic).getByText("0")).toBeTruthy();
    expect(within(review).queryByText("本次新增")).toBeNull();
    expect(within(review).queryByText("沿用飞书默认值")).toBeNull();
    await user.click(screen.getByRole("button", { name: "返回编辑" }));
    expect(screen.getByRole("textbox", { name: "标题" })).toHaveProperty("value", "示例事项");
    await user.click(screen.getByRole("button", { name: "核对内容" }));
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
    expect(screen.queryByRole("combobox", { name: "修复人" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /显示字段/ }));
    await user.click(screen.getByRole("button", { name: "显示修复人" }));
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("combobox", { name: "修复人" }).textContent,
    ).not.toContain("Token本人");
    expect(lookupCreationField).toHaveBeenCalledWith(target, "role:reporter", "");
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
    await user.click(screen.getByRole("switch", { name: "连续创建" }));
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

  it("进入表单预加载人员，多个角色共享候选，输入只筛选缓存", async () => {
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
    vi.mocked(lookupCreationField).mockResolvedValue({
      options: [{ value: "person-a", label: "示例用户" }, { value: "person-b", label: "其他用户" }],
      warning: null,
    });
    const user = userEvent.setup();
    const close = vi.fn();
    render(
      <CreateWorkItem locations={locations} close={close} created={vi.fn()} />,
    );
    const fixer = await screen.findByRole("combobox", { name: "修复人" });
    await waitFor(() => expect(lookupCreationField).toHaveBeenCalledWith(target, "reporter", ""));
    expect(lookupCreationField).toHaveBeenCalledTimes(1);
    await user.click(fixer);
    expect(screen.queryByRole("button", { name: "查找修复人" })).toBeNull();
    await screen.findByRole("option", { name: "示例用户" });
    expect(lookupCreationField).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("combobox", { name: "报告人" }));
    await screen.findByRole("option", { name: "示例用户" });
    expect(lookupCreationField).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    await user.click(fixer);
    await user.type(
      screen.getByRole("textbox", { name: "搜索修复人" }),
      "示例",
    );
    expect(screen.getByRole("option", { name: "示例用户" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "其他用户" })).toBeNull();
    expect(screen.queryByText("正在搜索…")).toBeNull();
    expect(lookupCreationField).toHaveBeenCalledTimes(1);
    await user.clear(screen.getByRole("textbox", { name: "搜索修复人" }));
    await user.type(screen.getByRole("textbox", { name: "搜索修复人" }), "不存在");
    expect(screen.getByText("已加载的人员中没有匹配项。")).toBeTruthy();
    expect(lookupCreationField).toHaveBeenCalledTimes(1);
    await user.clear(screen.getByRole("textbox", { name: "搜索修复人" }));
    await user.type(screen.getByRole("textbox", { name: "搜索修复人" }), "示例");
    await user.keyboard("{ArrowDown}{Enter}{Escape}");
    expect(
      screen.getByRole("combobox", { name: "修复人" }).textContent,
    ).toContain("示例用户");
    await user.click(screen.getByRole("combobox", { name: "报告人" }));
    await screen.findByRole("option", { name: "示例用户" });
    expect(lookupCreationField).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(close).not.toHaveBeenCalled();
    expect(
      document.querySelector(
        '.creation-field label[for="create-role:fix"] .creation-required',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/飞书未提供部分角色的必填规则/)).toBeTruthy();
  });

  it("人员预加载失败后打开字段可重试", async () => {
    vi.mocked(lookupCreationField)
      .mockRejectedValueOnce(new Error("暂时无法加载"))
      .mockResolvedValue({ options: [{ value: "person-a", label: "示例用户" }], warning: null });
    const user = userEvent.setup();
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    const reporter = await screen.findByRole("combobox", { name: "报告人" });
    await waitFor(() => expect(lookupCreationField).toHaveBeenCalledTimes(1));
    await user.click(reporter);
    await screen.findByRole("option", { name: "示例用户" });
    expect(lookupCreationField).toHaveBeenCalledTimes(2);
  });

  it("隐藏和显示的关联字段均预加载，搜索筛选各自的完整候选", async () => {
    const next = form();
    next.fields.push(
      { key: "related", label: "所属项目", kind: "relation", required: true, multiple: false, initial: null, options: [] },
      { key: "other", label: "关联版本", kind: "relation", required: false, multiple: false, initial: null, options: [] },
    );
    vi.mocked(getCreationForm).mockResolvedValue(next);
    vi.mocked(lookupCreationField).mockImplementation(async (_, key) => ({
      options: key === "related" ? Array.from({ length: 25 }, (_, i) => ({ value: String(i), label: `项目${i}` }))
        : [{ value: key, label: key }], warning: null,
    }));
    const user = userEvent.setup();
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    const related = await screen.findByRole("combobox", { name: "所属项目" });
    await waitFor(() => expect(lookupCreationField).toHaveBeenCalledWith(target, "other", ""));
    expect(lookupCreationField).toHaveBeenCalledWith(target, "related", "");
    const count = vi.mocked(lookupCreationField).mock.calls.length;
    await user.click(related);
    await screen.findByRole("option", { name: "项目24" });
    await user.type(screen.getByRole("textbox", { name: "搜索所属项目" }), "项目24");
    expect(screen.getByRole("option", { name: "项目24" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "项目1" })).toBeNull();
    expect(screen.queryByText("正在搜索…")).toBeNull();
    expect(lookupCreationField).toHaveBeenCalledTimes(count);
  });

  it("人员与多个关联字段预加载并发启动，无需等待其他字段完成", async () => {
    const next = form();
    next.fields.push(
      { key: "related-a", label: "项目", kind: "relation", required: true, multiple: false, initial: null, options: [] },
      { key: "related-b", label: "版本", kind: "relation", required: true, multiple: false, initial: null, options: [] },
    );
    vi.mocked(getCreationForm).mockResolvedValue(next);
    vi.mocked(lookupCreationField).mockImplementation(() => new Promise(() => {}));
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await waitFor(() => expect(lookupCreationField).toHaveBeenCalledTimes(3));
    expect(vi.mocked(lookupCreationField).mock.calls.map(([, key]) => key)).toEqual(expect.arrayContaining(["reporter", "related-a", "related-b"]));
  });

  it("切换新建位置后预加载新位置人员，不使用迟到的旧结果", async () => {
    const first = form();
    const second = { ...form(), target: locations[1], context: "account-b" };
    vi.mocked(getCreationForm).mockImplementation(async (location) => location.type_key === "issue" ? second : first);
    let finish!: (value: { options: { value: string; label: string }[]; warning: null }) => void;
    vi.mocked(lookupCreationField).mockImplementation((location) => location.type_key === "issue"
      ? Promise.resolve({ options: [{ value: "new", label: "新位置人员" }], warning: null })
      : new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await waitFor(() => expect(lookupCreationField).toHaveBeenCalledWith(target, "reporter", ""));
    await user.click(screen.getByRole("combobox", { name: "新建类型" }));
    await user.click(screen.getByRole("option", { name: "缺陷跟踪" }));
    await waitFor(() => expect(lookupCreationField).toHaveBeenCalledWith(locations[1], "reporter", ""));
    await act(async () => finish({ options: [{ value: "old", label: "旧位置人员" }], warning: null }));
    await user.click(await screen.findByRole("combobox", { name: "报告人" }));
    await screen.findByRole("option", { name: "新位置人员" });
    expect(screen.queryByRole("option", { name: "旧位置人员" })).toBeNull();
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

  it.each(["historical", "fresh"])("%s拒绝返回草稿定位本次必填提示，保留已选人员并持续校验", async (mode) => {
    const next = form();
    next.fields.push({ key: "tester", label: "测试负责人", kind: "people", required: false, multiple: true, initial: [], options: [] });
    const values = { name: "保留已填写事项", description: "![](https://example.com/retained.png)", reporter: ["a"], template: "1", zero: 0, tester: ["person-a"] };
    const rejected = { ...result("unknown"), outcome: "not_submitted" as const, item_id: null, message: "本次提交需要测试负责人", rejected_field_keys: ["tester", "removed"] };
    const key = `fstodo.creation.v1:account-a:${creationTargetKey(target)}`;
    if (mode === "historical") next.pending = { request: { target, version: "v1", request_id: "required-filled", fields: values }, result: rejected };
    else { localStorage.setItem(key, JSON.stringify({ values, labels: { "tester:person-a": "测试同学" } })); vi.mocked(createWorkItem).mockResolvedValueOnce(rejected); }
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const user = userEvent.setup();
    const props = { locations, close: vi.fn(), created: vi.fn() };
    const mounted = render(<CreateWorkItem {...props} />);
    if (mode === "fresh") { await user.click(await screen.findByRole("button", { name: "核对内容" })); await user.click(screen.getByRole("button", { name: "确认创建" })); }
    await user.click(await screen.findByRole("button", { name: "返回草稿" }));
    const notice = screen.getByRole("note", { name: "已自动显示本次创建必填字段" });
    expect(document.activeElement).toBe(notice);
    expect(screen.getByRole("combobox", { name: "测试负责人" }).getAttribute("aria-required")).toBe("true");
    expect(JSON.parse(localStorage.getItem(key)!).values).toEqual(values);
    expect(JSON.parse(localStorage.getItem(key)!).requiredFieldKeys).toEqual(["tester"]);
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await user.click(screen.getByRole("button", { name: "返回编辑" }));
    expect(screen.queryByRole("note", { name: "已自动显示本次创建必填字段" })).toBeNull();
    expect(document.activeElement).not.toBe(notice);
    const personLabel = mode === "fresh" ? "测试同学" : "person-a";
    await user.click(screen.getByRole("button", { name: `从测试负责人移除${personLabel}` }));
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    expect(screen.getByRole("alert").textContent).toContain("请填写「测试负责人」");
    mounted.unmount();
    render(<CreateWorkItem {...props} />);
    const tester = await screen.findByRole("combobox", { name: "测试负责人" });
    expect(tester.getAttribute("aria-required")).toBe("true");
    expect(screen.queryByRole("note", { name: "已自动显示本次创建必填字段" })).toBeNull();
  });

  it("本次必填显示偏好保存失败保留草稿且不提前确认恢复", async () => {
    const next = form();
    next.fields.push({ key: "tester", label: "测试负责人", kind: "people", required: false, multiple: true, initial: [], options: [] });
    next.pending = { request: { target, version: "v1", request_id: "required-visibility-save", fields: { name: "保留草稿", tester: ["a"] } }, result: { ...result("unknown"), outcome: "not_submitted", item_id: null, rejected_field_keys: ["tester"] } };
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const original = Storage.prototype.setItem;
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === creationVisibilityKey(next)) throw new Error("quota");
      original.call(this, key, value);
    });
    const user = userEvent.setup();
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "返回草稿" }));
    expect(screen.getByRole("alert").textContent).toContain("字段显示偏好未能保存");
    expect(vi.mocked(invoke).mock.calls.some(([command]) => command === "acknowledge_creation_recovery")).toBe(false);
    expect(screen.getByRole("combobox", { name: "测试负责人" }).textContent).toContain("a");
    expect(JSON.parse(localStorage.getItem(`fstodo.creation.v1:account-a:${creationTargetKey(target)}`)!).values.tester).toEqual(["a"]);
    storage.mockRestore();
  });

  it("累计已确认必填但只核对最新拒绝字段，不影响其他类型", async () => {
    const next = form();
    next.fields.push({ key: "tester", label: "测试负责人", kind: "people", required: false, multiple: true, initial: [], options: [] });
    const values = { name: "最新校验", description: "已有描述", reporter: ["a"], template: "1", tester: ["a"], zero: 0 };
    const key = `fstodo.creation.v1:account-a:${creationTargetKey(target)}`;
    localStorage.setItem(key, JSON.stringify({ values, labels: {}, requiredFieldKeys: ["description"], reviewFieldKeys: ["description"] }));
    next.pending = { request: { target, request_id: "latest-rejected", version: "v1", fields: values }, result: { ...result("unknown"), outcome: "not_submitted", item_id: null, rejected_field_keys: ["tester"] } };
    const other = { ...next, target: locations[1], pending: null };
    vi.mocked(getCreationForm).mockImplementation(async (target) => target.type_key === "issue" ? other : next);
    const user = userEvent.setup();
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "返回草稿" }));
    const notice = screen.getByRole("note", { name: "已自动显示本次创建必填字段" });
    expect(within(notice).getByRole("button", { name: "测试负责人" })).toBeTruthy();
    expect(within(notice).queryByRole("button", { name: "说明" })).toBeNull();
    const saved = JSON.parse(localStorage.getItem(key)!);
    expect(saved.requiredFieldKeys).toEqual(["description", "tester"]);
    expect(saved.reviewFieldKeys).toEqual(["tester"]);
    expect(saved.values).toEqual(values);
    vi.mocked(createWorkItem).mockRejectedValueOnce({ before_write: true, message: "本次没有创建权限" });
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("本次没有创建权限"));
    await user.click(screen.getByRole("combobox", { name: "新建类型" }));
    await user.click(screen.getByRole("option", { name: "缺陷跟踪" }));
    await screen.findByRole("textbox", { name: "标题" });
    expect(screen.queryByRole("combobox", { name: "测试负责人" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /显示字段 ·/ }));
    await user.click(screen.getByRole("button", { name: "显示测试负责人" }));
    expect(screen.getByRole("combobox", { name: "测试负责人" }).getAttribute("aria-required")).toBe("false");
  });

  it("连续创建的新草稿保留字段显示偏好但不继承上次提交的必填观察", async () => {
    const next = form();
    next.fields.push({ key: "tester", label: "测试负责人", kind: "people", required: false, multiple: true, initial: [], options: [] });
    next.pending = { request: { target, request_id: "previous-required", version: "v1", fields: { name: "上一条", description: "已有内容", reporter: ["a"], template: "1", tester: ["a"], zero: 0 } }, result: { ...result("unknown"), outcome: "not_submitted", item_id: null, rejected_field_keys: ["tester"] } };
    vi.mocked(getCreationForm).mockResolvedValueOnce(next).mockResolvedValue({ ...next, pending: null });
    const user = userEvent.setup();
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "返回草稿" }));
    await user.click(screen.getByRole("switch", { name: "连续创建" }));
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    await screen.findByText("上一条工作事项已创建并核验，可以继续填写下一条。");
    expect(screen.getByRole("combobox", { name: "测试负责人" }).getAttribute("aria-required")).toBe("false");
    expect(screen.queryByText("本次创建必填")).toBeNull();
    const saved = JSON.parse(localStorage.getItem(`fstodo.creation.v1:account-a:${creationTargetKey(target)}`)!);
    expect(saved.requiredFieldKeys).toBeUndefined();
    expect(saved.values.tester).toEqual([]);
  });

  it("飞书校验提及的可选空角色恢复后显式展示，保留图片并跨重开提示直到重新核对", async () => {
    const next = form();
    next.fields.push({ key: "tester", label: "测试负责人", kind: "people", required: false, multiple: true, initial: [], options: [] });
    const image = "![](https://example.com/retained.png)";
    next.pending = { request: { target, version: "v1", request_id: "rejected-fields", fields: { name: "原标题", description: image, reporter: ["a"], template: "1", zero: 0 } }, result: { ...result("unknown"), outcome: "not_submitted", item_id: null, message: "请核对测试负责人", rejected_field_keys: ["tester", "description", "removed"] } };
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const user = userEvent.setup();
    const props = { locations, close: vi.fn(), created: vi.fn() };
    const mounted = render(<CreateWorkItem {...props} />);
    await user.click(await screen.findByRole("button", { name: "返回草稿" }));
    expect(screen.getByRole("button", { name: "测试负责人" })).toBeTruthy();
    expect(screen.getByText("已自动显示本次创建必填字段")).toBeTruthy();
    const notice = screen.getByRole("note", { name: "已自动显示本次创建必填字段" });
    expect(within(notice).getByRole("button", { name: "说明" }).textContent).toContain("已有内容，请核对");
    expect(within(notice).getByRole("button", { name: "测试负责人" }).textContent).toContain("尚未填写，请补充");
    const key = `fstodo.creation.v1:account-a:${creationTargetKey(target)}`;
    expect(JSON.parse(localStorage.getItem(key)!).values.description).toBe(image);
    expect(JSON.parse(localStorage.getItem(key)!).reviewFieldKeys).toEqual(["tester", "description"]);
    expect(JSON.parse(localStorage.getItem(key)!).requiredFieldKeys).toEqual(["tester", "description"]);
    expect(loadCreationVisibility(next)).toContain("tester");
    await user.click(screen.getByRole("button", { name: /显示字段 ·/ }));
    expect(screen.getByRole("button", { name: "隐藏测试负责人" })).toHaveProperty("disabled", true);
    expect(screen.getByText("本次创建必填 · 已显示")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /显示字段 ·/ }));
    mounted.unmount();
    render(<CreateWorkItem {...props} />);
    await screen.findByText("已自动显示本次创建必填字段");
    expect(next.fields.find((field) => field.key === "tester")!.required).toBe(false);
    fireEvent.change(screen.getByRole("textbox", { name: "标题" }), { target: { value: "已核对标题" } });
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    expect(screen.getByRole("alert").textContent).toContain("请填写「测试负责人」");
    expect(screen.queryByRole("heading", { name: "核对创建内容" })).toBeNull();
    await user.click(screen.getByRole("combobox", { name: "测试负责人" }));
    await user.click(await screen.findByRole("option", { name: "示例用户" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await screen.findByRole("heading", { name: "核对创建内容" });
    expect(JSON.parse(localStorage.getItem(key)!).reviewFieldKeys).toBeUndefined();
    expect(screen.queryByText("已自动显示本次创建必填字段")).toBeNull();
    await user.click(screen.getByRole("button", { name: "返回编辑" }));
    expect(screen.getByRole("combobox", { name: "测试负责人" }).getAttribute("aria-required")).toBe("true");
    expect(screen.queryByText("已自动显示本次创建必填字段")).toBeNull();
    expect(JSON.parse(localStorage.getItem(key)!).requiredFieldKeys).toEqual(["tester", "description"]);
    expect(createWorkItem).not.toHaveBeenCalled();
  });

  it("两条恢复记录总览均可打开，失败恢复后移除记录且保留编辑草稿", async () => {
    const first = form();
    first.pending = { request: { target, version: "v1", request_id: "record-one", fields: { name: "待核验需求" } }, result: { ...result("unknown"), item_id: null } };
    const second = form();
    second.target = { ...target, type_key: "issue" };
    second.pending = { request: { target: second.target, version: "v1", request_id: "record-two", fields: { name: "失败缺陷" } }, result: { ...result("unknown"), outcome: "not_submitted", message: "测试负责人未通过校验", item_id: null } };
    const recordsChanged = vi.fn();
    const user = userEvent.setup();
    render(<CreateWorkItem locations={[{ ...locations[0], pending_form: first }, { ...locations[0], ...second.target, name: "缺陷", pending_form: second }]} entryIntent="recovery" recordsChanged={recordsChanged} close={vi.fn()} created={vi.fn()} />);
    expect(await screen.findByText("待核验需求")).toBeTruthy();
    expect(screen.getByText("失败缺陷")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "查看失败并恢复草稿" }));
    await screen.findByText("测试负责人未通过校验");
    await user.click(screen.getByRole("button", { name: "返回草稿" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "标题" }), { target: { value: "修改后缺陷" } });
    expect(recordsChanged).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "全部记录（1）" }));
    expect(screen.queryByText("失败缺陷")).toBeNull();
    await user.click(screen.getByRole("button", { name: "查看并核验结果" }));
    await screen.findByText("待核验需求");
    expect(screen.getByRole("button", { name: "重新核验结果" })).toBeTruthy();
    vi.mocked(verifyCreation).mockResolvedValue(result("verified"));
    await user.click(screen.getByRole("button", { name: "重新核验结果" }));
    await screen.findByRole("heading", { name: "已创建" });
    expect(recordsChanged).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "全部记录（0）" }));
    expect(screen.getByText("没有待处理的创建记录。")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "查看并核验结果" })).toBeNull();
    expect(createWorkItem).not.toHaveBeenCalled();
    const key = `fstodo.creation.v1:account-a:${creationTargetKey(second.target)}`;
    expect(JSON.parse(localStorage.getItem(key)!).values.name).toBe("修改后缺陷");
  });

  it("切换恢复记录不把上一条手动编号带到下一条", async () => {
    const forms = [form(), { ...form(), target: { ...target, type_key: "issue" } }];
    forms.forEach((entry, index) => { entry.pending = { request: { target: entry.target, request_id: `number-${index}`, version: "v1", fields: { name: `编号隔离${index}` } }, result: { ...result("unknown"), item_id: null } }; });
    const user = userEvent.setup();
    render(<CreateWorkItem entryIntent="recovery" locations={forms.map((entry) => ({ ...locations[0], ...entry.target, pending_form: entry }))} close={vi.fn()} created={vi.fn()} />);
    await user.click((await screen.findAllByRole("button", { name: "查看并核验结果" }))[0]);
    await user.click(screen.getByText("已在飞书找到新事项？使用编号定位"));
    await user.type(screen.getByRole("textbox", { name: "核验事项编号" }), "111");
    await user.click(screen.getByRole("button", { name: "全部记录（2）" }));
    await user.click(screen.getAllByRole("button", { name: "查看并核验结果" })[1]);
    await screen.findByText("编号隔离1");
    await user.click(screen.getByText("已在飞书找到新事项？使用编号定位"));
    expect(screen.getByRole("textbox", { name: "核验事项编号" })).toHaveProperty("value", "");
    await user.click(screen.getByRole("button", { name: "重新核验结果" }));
    expect(verifyCreation).toHaveBeenCalledWith("number-1", "", expect.objectContaining({ request_id: "number-1" }));
  });

  it("新建入口发现未确认提交先说明原因，返回草稿只读且重开仍不能重复创建", async () => {
    const next = form();
    next.pending = { request: { target, version: "v1", request_id: "pending-create", fields: { name: "上次提交标题" } }, result: { ...result("unknown"), item_id: null } };
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const user = userEvent.setup();
    const props = { locations, entryIntent: "create" as const, close: vi.fn(), created: vi.fn() };
    const mounted = render(<CreateWorkItem {...props} />);
    expect(await screen.findByText("此位置有一条待核验创建")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "核验事项编号" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "返回草稿" }));
    expect(screen.getByRole("heading", { name: "查看已提交草稿" })).toBeTruthy();
    expect(screen.getByText("上次提交标题")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "标题" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "报告人" })).toBeNull();
    expect(document.querySelector('[contenteditable="true"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "确认创建" })).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "核验创建结果" })[0]);
    await user.click(screen.getByText("已在飞书找到新事项？使用编号定位"));
    expect(screen.getByText(/编号来自该事项的详情页/)).toBeTruthy();
    mounted.unmount();
    render(<CreateWorkItem {...props} />);
    await screen.findByText("此位置有一条待核验创建");
    expect(createWorkItem).not.toHaveBeenCalled();
  });

  it("网关明确拒绝的历史创建恢复为可编辑草稿，不要求不存在的编号", async () => {
    const next = form();
    next.pending = {
      request: { target, version: "v1", request_id: "rejected-request", fields: { name: "保留标题" } },
      result: { ...result("unknown"), outcome: "not_submitted", item_id: null, message: "飞书未接受本次创建参数，事项未创建。草稿已保留，请重新核对后创建。" },
    };
    vi.mocked(getCreationForm).mockResolvedValue(next);
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await screen.findByRole("heading", { name: "创建未成功" });
    expect(screen.getByText(/飞书未接受本次创建参数/)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "核验事项编号" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "返回草稿" }));
    expect((await screen.findByRole("textbox", { name: "标题" }) as HTMLInputElement).value).toBe("保留标题");
    expect(screen.getByRole("alert").textContent).toContain("事项未创建");
    expect(screen.queryByRole("button", { name: "重新核验结果" })).toBeNull();
    expect(createWorkItem).not.toHaveBeenCalled();
    expect(verifyCreation).not.toHaveBeenCalled();
    const saved = JSON.parse(localStorage.getItem(`fstodo.creation.v1:account-a:${creationTargetKey(target)}`)!);
    expect(saved.values.name).toBe("保留标题");
    expect(saved.request).toBeUndefined();
  });

  it.each(["storage", "ack"])("拒绝记录恢复%s失败后重开保留恢复入口和已编辑草稿", async (failure) => {
    const next = form();
    next.pending = {
      request: { target, version: "v1", request_id: "recover-again", fields: { name: "旧请求标题" } },
      result: { ...result("unknown"), outcome: "not_submitted", item_id: null, message: "事项未创建，草稿已保留" },
    };
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const original = Storage.prototype.setItem;
    const storage = failure === "storage" ? vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key.startsWith("fstodo.creation.v1:")) throw new Error("full");
      original.call(this, key, value);
    }) : null;
    if (failure === "ack") vi.mocked(invoke).mockRejectedValueOnce(new Error("ack failed"));
    const rendered = render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "返回草稿" }));
    await screen.findByRole("textbox", { name: "标题" });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(failure === "storage" ? "草稿未能保存" : "恢复"));
    storage?.mockImplementation(original);
    fireEvent.change(screen.getByRole("textbox", { name: "标题" }), { target: { value: "继续编辑标题" } });
    rendered.unmount();
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    expect((await screen.findByRole("textbox", { name: "标题" }) as HTMLInputElement).value).toBe("继续编辑标题");
    expect(createWorkItem).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("acknowledge_creation_recovery", { requestId: "recover-again" });
    storage?.mockRestore();
  });

  it("恢复确认失败后再次创建在写入前被拒绝，重开仍保留原恢复关联和新编辑", async () => {
    const next = form();
    next.pending = {
      request: { target, version: "v1", request_id: "original-recovery", fields: { name: "旧请求标题", description: "说明", reporter: ["a"], template: "1", zero: 0 } },
      result: { ...result("unknown"), outcome: "not_submitted", item_id: null, message: "事项未创建，草稿已保留" },
    };
    vi.mocked(getCreationForm).mockResolvedValue(next);
    vi.mocked(invoke).mockRejectedValueOnce(new Error("ack failed"));
    vi.mocked(createWorkItem).mockRejectedValueOnce({ before_write: true, message: "仍有待恢复记录" });
    const user = userEvent.setup();
    const mounted = render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "返回草稿" }));
    await screen.findByRole("textbox", { name: "标题" });
    fireEvent.change(screen.getByRole("textbox", { name: "标题" }), { target: { value: "新编辑标题" } });
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("仍有待恢复记录"));
    const saved = JSON.parse(localStorage.getItem(`fstodo.creation.v1:account-a:${creationTargetKey(target)}`)!);
    expect(saved.recoveredRequestId).toBe("original-recovery");
    expect(saved.values.name).toBe("新编辑标题");
    expect(invoke).toHaveBeenCalledTimes(1);
    mounted.unmount();
    render(<CreateWorkItem locations={locations} close={vi.fn()} created={vi.fn()} />);
    expect((await screen.findByRole("textbox", { name: "标题" }) as HTMLInputElement).value).toBe("新编辑标题");
    expect(invoke).toHaveBeenLastCalledWith("acknowledge_creation_recovery", { requestId: "original-recovery" });
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
    await user.click(await screen.findByRole("button", { name: "返回草稿" }));
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
    const checkbox = screen.getByRole("switch", {
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
      (screen.getByRole("switch", { name: "连续创建" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    await user.click(screen.getByRole("switch", { name: "连续创建" }));
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
    await user.click(screen.getByRole("switch", { name: "连续创建" }));
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
      (screen.getByRole("switch", { name: "连续创建" }) as HTMLInputElement)
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
    await user.click(screen.getByRole("switch", { name: "连续创建" }));
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
    await user.click(screen.getByRole("switch", { name: "连续创建" }));
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
      (screen.getByRole("switch", { name: "连续创建" }) as HTMLInputElement)
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
      if (mode === "not_submitted") await user.click(await screen.findByRole("button", { name: "返回草稿" }));
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
    await user.click(screen.getByRole("switch", { name: "连续创建" }));
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
    await user.click(screen.getByRole("switch", { name: "连续创建" }));
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

  it("旧版关闭预填后仍自动应用稳定键下的默认值，升级和来源变化保留草稿", async () => {
    const previous = formWithChoices();
    saveLocalCreationDefaults(previous, {
      template: { kind: "select", multiple: false, value: "2" },
    });
    localStorage.setItem("fstodo.creation-prefill-local-defaults.v1", "false");
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
      (screen.getByRole("switch", { name: "连续创建" }) as HTMLInputElement)
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
    expect(localStorage.getItem("fstodo.creation-prefill-local-defaults.v1")).toBe("false");
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
