// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Workflow } from "./Workflow";
import { getWorkflowActions } from "./api";
import { itemKey } from "./model";
import { draftKey, readDraft, writeDraft } from "./workflowDrafts";
import type { CachedItem, WorkflowOptions } from "./types";

vi.mock("./api", () => ({ getWorkflowActions: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn() }));

const item = (id = "123", type = "story") => ({
  id: { project_key: "space", work_item_type_key: type, work_item_id: id },
  name: "当前事项",
}) as CachedItem;
const url = "https://project.feishu.cn/example/story/detail/123?from=workflow#node-review";
const officialFailure = "节点流转失败。当前节点【评审】设置了必须填写【负责人完成结论】（类型：owners_finished_info）才能流转。由于该字段类型不支持自动化补充，请您在飞书项目页面手动填写后，再通知我继续流转。";
const pageExplanation = "此操作所需字段暂无法在本软件中处理。点击上方按钮，即可打开对应的飞书事项，填写并完成流程。";
const editorExplanation = "此操作所需字段暂无法在本软件中处理。请通过飞书链接打开对应事项，填写并完成流程。";
const options = (kind: "node" | "state" = "node"): WorkflowOptions => ({
  version: "v1",
  item_url: url,
  actions: [{
    id: kind === "node" ? "node:confirm:review" : "state:resolve:DONE",
    label: kind === "node" ? "完成评审节点" : "流转到已解决",
    kind,
    disabled_reason: officialFailure,
    manual_fill_required: true,
    requires_feishu: true,
    fields: [],
  }],
});
const localOptions = (initial_value = "云端设计稿", version = "v1"): WorkflowOptions => ({
  ...options(),
  version,
  actions: [{
    ...options().actions[0],
    disabled_reason: undefined,
    manual_fill_required: undefined,
    requires_feishu: undefined,
    fields: [{ key: "doc", label: "设计文档", kind: "text", required: false, initial_value }],
  }],
});
function savePending(current = options()) {
  const key = draftKey(itemKey(item()), current.actions[0].id);
  const pending = { item_id: item().id, action_id: current.actions[0].id, version: "v0", request_id: "unknown-before-open", fields: { doc: "本机设计稿" } };
  writeDraft(key, {
    version: "v0", updated_at: 1, fields: { doc: "本机设计稿", legacy: "/" },
    base_fields: { doc: "旧云端设计稿", legacy: "" }, pending,
  });
  return { key, before: readDraft(key), pending };
}
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockResolvedValue(undefined);
  vi.mocked(getWorkflowActions).mockResolvedValue(options());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(["node", "state"] as const)("%s 页面动作点击后先读取最新规则再直接打开事项，不创建草稿或写请求", async (kind) => {
  const current = options(kind);
  const currentItem = item("123", kind === "node" ? "story" : "issue");
  vi.mocked(getWorkflowActions).mockResolvedValue(current);
  localStorage.setItem("fstodo.link-opening-mode.v1", "existing-browser");
  const submit = vi.fn();
  render(<Workflow item={currentItem} available busy={false} submit={submit} />);
  const button = await screen.findByRole("button", { name: current.actions[0].label });
  expect((button as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByText(pageExplanation)).toBeTruthy();
  expect(screen.queryByText(officialFailure)).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  button.focus();
  await userEvent.keyboard("{Enter}");
  await waitFor(() => expect(invoke).toHaveBeenCalledExactlyOnceWith("open_external_url", { url, newWindow: false }));
  expect(getWorkflowActions).toHaveBeenNthCalledWith(2, currentItem.id, true);
  expect(screen.queryByRole("button", { name: "提交" })).toBeNull();
  expect(readDraft(draftKey(itemKey(currentItem), current.actions[0].id))).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});

it.each(["", "passed"])("可选或已满足的页面字段为「%s」时仍直接跳转，不要求本地填写草稿", async (conclusion) => {
  const current = options();
  current.actions[0] = {
    ...current.actions[0], disabled_reason: undefined, manual_fill_required: undefined,
    fields: [{ key: "conclusion", label: "负责人完成结论", kind: "select", required: false, read_only: true, initial_value: conclusion }],
  };
  vi.mocked(getWorkflowActions).mockResolvedValue(current);
  const submit = vi.fn();
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  const button = await screen.findByRole("button", { name: current.actions[0].label });
  expect(screen.getByText(pageExplanation)).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  await userEvent.click(button);
  await waitFor(() => expect(invoke).toHaveBeenCalledOnce());
  expect(screen.queryByRole("button", { name: "提交" })).toBeNull();
  expect(localStorage.length).toBe(0);
  expect(submit).not.toHaveBeenCalled();
});

it("缓存可本地执行但最新规则出现页面字段时，直接跳转而不进入过期表单", async () => {
  vi.mocked(getWorkflowActions).mockResolvedValueOnce(localOptions()).mockResolvedValue(options());
  render(<Workflow item={item()} available busy={false} submit={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: options().actions[0].label }));
  await waitFor(() => expect(invoke).toHaveBeenCalledOnce());
  expect(screen.queryByLabelText("设计文档")).toBeNull();
  expect(localStorage.length).toBe(0);
});

it("页面字段与未确认必填配置混合时仍以结构化标记直达飞书，不建立本地草稿", async () => {
  const current = options();
  current.actions[0].disabled_reason = "部分必填字段配置无法确认，请在飞书项目页面处理。";
  current.actions[0].fields = [
    { key: "opinion", label: "负责人完成意见", kind: "text", required: false, read_only: true },
    { key: "doc", label: "设计文档", kind: "text", required: true },
  ];
  vi.mocked(getWorkflowActions).mockResolvedValue(current);
  const submit = vi.fn();
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  await userEvent.click(await screen.findByRole("button", { name: current.actions[0].label }));
  await waitFor(() => expect(invoke).toHaveBeenCalledOnce());
  expect(screen.queryByLabelText("设计文档（必填）")).toBeNull();
  expect(readDraft(draftKey(itemKey(item()), current.actions[0].id))).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});

it("普通权限禁用不会因提示包含飞书填写字样而放行跳转", async () => {
  const current = options();
  current.actions[0].requires_feishu = undefined;
  current.actions[0].manual_fill_required = undefined;
  current.actions[0].disabled_reason = "当前账号没有节点操作权限，请在飞书项目页面核对权限。";
  vi.mocked(getWorkflowActions).mockResolvedValue(current);
  render(<Workflow item={item()} available busy={false} submit={vi.fn()} />);
  const button = await screen.findByRole("button", { name: current.actions[0].label });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(current.actions[0].disabled_reason!)).toBeTruthy();
  expect(screen.queryByText(pageExplanation)).toBeNull();
  await userEvent.click(button);
  expect(getWorkflowActions).toHaveBeenCalledOnce();
  expect(invoke).not.toHaveBeenCalled();
  expect(screen.queryByRole("link")).toBeNull();
});

it.each([undefined, "not-a-url", "javascript:alert(1)", "file:///C:/private"])(
  "最新事项地址缺失或无效（%s）时局部说明，不创建草稿或打开其他页面", async (item_url) => {
    vi.mocked(getWorkflowActions).mockResolvedValue({ ...options(), item_url });
    render(<Workflow item={item()} available busy={false} submit={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: options().actions[0].label }));
    expect(await screen.findByText("未取得当前事项的有效飞书地址，请在飞书项目中搜索该事项，填写并完成流程。")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button", { name: "提交" })).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  },
);

it("最新动作消失时保留已有草稿，反馈原动作不可用且不开错页", async () => {
  const saved = savePending();
  vi.mocked(getWorkflowActions).mockResolvedValueOnce(options()).mockResolvedValue({ ...options(), version: "v2", actions: [] });
  render(<Workflow item={item()} available busy={false} submit={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: options().actions[0].label }));
  expect(await screen.findByText(/云端流程已变化，原动作已不可用/)).toBeTruthy();
  expect(screen.getByText(/上次提交结果待核实/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "去飞书核对" }).getAttribute("href")).toBe(url);
  expect(readDraft(saved.key)).toEqual(saved.before);
  expect(invoke).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "提交" })).toBeNull();
});

it("最新动作变为普通权限禁用时不能沿用旧跳转标记", async () => {
  const latest = options();
  latest.actions[0] = { ...latest.actions[0], requires_feishu: undefined, manual_fill_required: undefined, disabled_reason: "当前账号没有节点操作权限" };
  vi.mocked(getWorkflowActions).mockResolvedValueOnce(options()).mockResolvedValue(latest);
  render(<Workflow item={item()} available busy={false} submit={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: options().actions[0].label }));
  expect(await screen.findByText("云端动作已不可用，请核对最新提示。已有草稿已保留。")).toBeTruthy();
  expect((screen.getByRole("button", { name: options().actions[0].label }) as HTMLButtonElement).disabled).toBe(true);
  expect(invoke).not.toHaveBeenCalled();
});

it("动作检测失败保留可用清单与旧草稿，可通过同一按钮重试", async () => {
  const saved = savePending();
  vi.mocked(getWorkflowActions).mockResolvedValueOnce(options()).mockRejectedValueOnce("temporary backend failure").mockResolvedValue(options());
  const submit = vi.fn();
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  await userEvent.click(await screen.findByRole("button", { name: options().actions[0].label }));
  const error = await screen.findByRole("alert");
  expect(error.textContent).toBe("动作检查未完成，现有清单和草稿已保留，请重试。");
  expect(screen.getByText(/上次提交结果待核实/)).toBeTruthy();
  expect(readDraft(saved.key)).toEqual(saved.before);
  expect(invoke).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: options().actions[0].label }));
  await waitFor(() => expect(invoke).toHaveBeenCalledOnce());
  expect(readDraft(saved.key)).toEqual(saved.before);
  expect(submit).not.toHaveBeenCalled();
});

it("快速双击同一动作只检查和打开一次", async () => {
  let resolveRead!: (value: WorkflowOptions) => void;
  vi.mocked(getWorkflowActions).mockResolvedValueOnce(options()).mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
  render(<Workflow item={item()} available busy={false} submit={vi.fn()} />);
  const button = await screen.findByRole("button", { name: options().actions[0].label });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(getWorkflowActions).toHaveBeenCalledTimes(2);
  await act(async () => { resolveRead(options()); });
  expect(invoke).toHaveBeenCalledOnce();
  expect(localStorage.length).toBe(0);
});

it("打开失败在当前动作旁提供链接重试，不标记为已打开或清除待核实草稿", async () => {
  const saved = savePending();
  vi.mocked(invoke).mockRejectedValueOnce("无法打开系统浏览器");
  const submit = vi.fn();
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  await userEvent.click(await screen.findByRole("button", { name: options().actions[0].label }));
  const link = await screen.findByRole("link", { name: "去飞书填写" });
  const error = screen.getByRole("alert");
  expect(error.textContent).toBe("打开飞书项目未完成，请重试或使用下方链接打开。");
  expect(error.closest(".workflow-option")?.contains(link)).toBe(true);
  fireEvent.focus(window);
  expect(getWorkflowActions).toHaveBeenCalledTimes(2);
  await userEvent.click(link);
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  expect(readDraft(saved.key)).toEqual(saved.before);
  expect(submit).not.toHaveBeenCalled();
});

it("网页开发模式异步打开被拦截时显示原生链接重试", async () => {
  vi.mocked(isTauri).mockReturnValue(false);
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  render(<Workflow item={item()} available busy={false} submit={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: options().actions[0].label }));
  const link = await screen.findByRole("link", { name: "去飞书填写" });
  expect(link.getAttribute("href")).toBe(url);
  expect(link.getAttribute("target")).toBe("_blank");
  expect(open).toHaveBeenCalledOnce();
  expect(invoke).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
});

it("返回飞书后一次只读检查失败仍保留清单、旧pending提示与可重试入口", async () => {
  const saved = savePending();
  vi.mocked(getWorkflowActions).mockResolvedValueOnce(options()).mockResolvedValueOnce(options()).mockRejectedValueOnce("read failed").mockResolvedValue(options());
  const submit = vi.fn();
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  await userEvent.click(await screen.findByRole("button", { name: options().actions[0].label }));
  await waitFor(() => expect(invoke).toHaveBeenCalledOnce());
  fireEvent.focus(window);
  expect(await screen.findByText("云端检查未完成，现有内容和草稿已保留，请稍后重试。")).toBeTruthy();
  expect(screen.getByRole("button", { name: options().actions[0].label })).toBeTruthy();
  expect(screen.getByText(pageExplanation)).toBeTruthy();
  expect(screen.getByText(/上次提交结果待核实/)).toBeTruthy();
  expect(readDraft(saved.key)).toEqual(saved.before);
  fireEvent.focus(window);
  expect(getWorkflowActions).toHaveBeenCalledTimes(3);
  await userEvent.click(screen.getByRole("button", { name: "重新读取动作" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(getWorkflowActions).toHaveBeenLastCalledWith(item().id, true);
  expect(readDraft(saved.key)).toEqual(saved.before);
  expect(invoke).toHaveBeenCalledOnce();
  expect(submit).not.toHaveBeenCalled();
});

it("已打开编辑器仅新增页面处理标记时提供准确说明和唯一飞书链接", async () => {
  let current = localOptions();
  vi.mocked(getWorkflowActions).mockImplementation(async () => current);
  const submit = vi.fn();
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  await userEvent.click(await screen.findByRole("button", { name: current.actions[0].label }));
  expect(screen.queryByRole("link")).toBeNull();
  current = { ...current, version: "v2", actions: [{ ...current.actions[0], requires_feishu: true }] };
  fireEvent.focus(window);
  await screen.findByText(editorExplanation);
  expect(screen.queryByText(pageExplanation)).toBeNull();
  const links = screen.getAllByRole("link", { name: "去飞书填写" });
  expect(links).toHaveLength(1);
  expect(links[0].getAttribute("href")).toBe(url);
  await userEvent.click(links[0]);
  expect(invoke).toHaveBeenCalledExactlyOnceWith("open_external_url", { url, newWindow: true });
  expect(submit).not.toHaveBeenCalled();
});

it("旧pending编辑器从飞书返回确实只读一次，更新云端展示且保留全部输入、标记和提交保护", async () => {
  const initial = localOptions();
  initial.actions[0].fields.push({ key: "opinion", label: "负责人完成意见", kind: "text", required: false, read_only: true, initial_value: "旧云端意见" });
  let current = initial;
  vi.mocked(getWorkflowActions).mockImplementation(async () => current);
  const saved = savePending(initial);
  const submit = vi.fn();
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  await userEvent.click(await screen.findByRole("button", { name: initial.actions[0].label }));
  const link = await screen.findByRole("link", { name: "去飞书核对" });
  expect((screen.getByRole("button", { name: "提交" }) as HTMLButtonElement).disabled).toBe(true);
  const draftStatus = screen.getByRole("status").textContent;
  const before = readDraft(saved.key);
  const input = screen.getByLabelText("设计文档") as HTMLInputElement;
  const beforeInput = input.value;
  current = { ...initial, version: "v2", actions: [{ ...initial.actions[0], requires_feishu: true, disabled_reason: officialFailure,
    fields: initial.actions[0].fields.map((field) => ({ ...field, initial_value: field.key === "opinion" ? "最新云端意见" : "最新云端设计稿" })) }] };
  await userEvent.click(link);
  const calls = vi.mocked(getWorkflowActions).mock.calls.length;
  fireEvent.focus(window);
  await screen.findByText("最新云端意见");
  expect(getWorkflowActions).toHaveBeenCalledTimes(calls + 1);
  expect(getWorkflowActions).toHaveBeenLastCalledWith(item().id, true);
  expect((screen.getByLabelText("设计文档") as HTMLInputElement).value).toBe(beforeInput);
  expect(readDraft(saved.key)).toEqual(before);
  expect(screen.getByRole("status").textContent).toBe(draftStatus);
  expect(screen.getByText(/已阻止重复提交/)).toBeTruthy();
  expect(screen.getByText(editorExplanation)).toBeTruthy();
  expect(screen.queryByText(pageExplanation)).toBeNull();
  expect(screen.getAllByRole("link", { name: "去飞书核对" })).toHaveLength(1);
  expect(screen.queryByRole("link", { name: "去飞书填写" })).toBeNull();
  expect(screen.getByText(/流程操作可直接在飞书完成/)).toBeTruthy();
  expect(screen.queryByText(officialFailure)).toBeNull();
  expect((screen.getByRole("button", { name: "提交" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.focus(window);
  expect(getWorkflowActions).toHaveBeenCalledTimes(calls + 1);
  expect(submit).not.toHaveBeenCalled();
});

it("实际提交被拒绝时保留原失败反馈，不把写入失败替换为页面操作说明", async () => {
  vi.mocked(getWorkflowActions).mockResolvedValue(localOptions());
  const submit = vi.fn().mockRejectedValue({ kind: "validation", message: officialFailure });
  const user = userEvent.setup();
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  await user.click(await screen.findByRole("button", { name: options().actions[0].label }));
  await user.click(screen.getByRole("button", { name: "提交" }));
  await user.click(await screen.findByLabelText("我已核对填写内容，理解提交后的修改限制"));
  await user.click(screen.getByRole("button", { name: "确认完成节点" }));
  expect((await screen.findByRole("alert")).textContent).toBe(officialFailure);
  expect(submit).toHaveBeenCalledOnce();
  expect(screen.queryByText(pageExplanation)).toBeNull();
  expect(readDraft(draftKey(itemKey(item()), options().actions[0].id))?.pending).toBeUndefined();
});

it("旧pending返回检查失败只增加局部提示，重试只读不调用恢复或写入", async () => {
  vi.mocked(getWorkflowActions).mockResolvedValue(localOptions());
  const saved = savePending(localOptions());
  render(<Workflow item={item()} available busy={false} submit={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: options().actions[0].label }));
  await userEvent.click(await screen.findByRole("link", { name: "去飞书核对" }));
  const before = readDraft(saved.key);
  const status = screen.getByRole("status").textContent;
  vi.mocked(getWorkflowActions).mockRejectedValueOnce("temporary failure");
  fireEvent.focus(window);
  await screen.findByText("云端检查未完成，现有内容和草稿已保留，请稍后重试。");
  await userEvent.click(screen.getByRole("button", { name: "重试云端检查" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(readDraft(saved.key)).toEqual(before);
  expect(screen.getByRole("status").textContent).toBe(status);
  expect((screen.getByRole("button", { name: "提交" }) as HTMLButtonElement).disabled).toBe(true);
});

it("缓存页面动作在fresh v2恢复为本地可写时使用v2初值和提交版本", async () => {
  const latest = localOptions("v2云端设计稿", "v2");
  vi.mocked(getWorkflowActions).mockResolvedValueOnce(options()).mockResolvedValue(latest);
  const submit = vi.fn().mockResolvedValue({ outcome: "unknown", verified: false });
  render(<Workflow item={item()} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: options().actions[0].label }));
  expect((await screen.findByLabelText("设计文档") as HTMLInputElement).value).toBe("v2云端设计稿");
  expect(getWorkflowActions).toHaveBeenCalledTimes(2);
  expect(invoke).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "提交" }));
  await user.click(await screen.findByLabelText("我已核对填写内容，理解提交后的修改限制"));
  await user.click(screen.getByRole("button", { name: "确认完成节点" }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0]).toMatchObject({ version: "v2", fields: {} });
});

it("普通编辑器可见检查与飞书返回焦点共用在途读取，不重复请求", async () => {
  const initial = localOptions();
  initial.actions[0].fields.push({ key: "opinion", label: "负责人完成意见", kind: "text", required: false, read_only: true });
  vi.mocked(getWorkflowActions).mockResolvedValue(initial);
  render(<Workflow item={item()} available busy={false} submit={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: initial.actions[0].label }));
  await userEvent.click(await screen.findByRole("link", { name: "去飞书填写" }));
  let resolveRead!: (value: WorkflowOptions) => void;
  vi.mocked(getWorkflowActions).mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
  const calls = vi.mocked(getWorkflowActions).mock.calls.length;
  fireEvent(document, new Event("visibilitychange"));
  fireEvent.focus(window);
  expect(getWorkflowActions).toHaveBeenCalledTimes(calls + 1);
  await act(async () => { resolveRead(initial); });
  expect(getWorkflowActions).toHaveBeenCalledTimes(calls + 1);
});

it("fresh检测迟到时不能跨事项打开旧页或创建任一事项草稿", async () => {
  let resolveRead!: (value: WorkflowOptions) => void;
  vi.mocked(getWorkflowActions).mockResolvedValueOnce(options()).mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
  const submit = vi.fn();
  const view = render(<Workflow item={item()} available busy={false} submit={submit} />);
  await userEvent.click(await screen.findByRole("button", { name: options().actions[0].label }));
  vi.mocked(getWorkflowActions).mockResolvedValue({ ...options(), item_url: "https://project.feishu.cn/other/story/detail/456" });
  view.rerender(<Workflow item={item("456")} available busy={false} submit={submit} />);
  await waitFor(() => expect(getWorkflowActions).toHaveBeenCalledWith(item("456").id));
  await act(async () => { resolveRead(options()); });
  expect(invoke).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "提交" })).toBeNull();
  expect(localStorage.length).toBe(0);
  expect(submit).not.toHaveBeenCalled();
});

it.each(["success", "failure"])("切换事项后打开回执迟到为%s不会触发错事项回读或错误提示", async (outcome) => {
  let resolveOpen!: () => void;
  let rejectOpen!: (error: unknown) => void;
  vi.mocked(invoke).mockImplementation(() => new Promise<void>((resolve, reject) => { resolveOpen = resolve; rejectOpen = reject; }));
  const submit = vi.fn();
  const view = render(<Workflow item={item()} available busy={false} submit={submit} />);
  await userEvent.click(await screen.findByRole("button", { name: options().actions[0].label }));
  await waitFor(() => expect(invoke).toHaveBeenCalledOnce());
  vi.mocked(getWorkflowActions).mockResolvedValue({ ...options(), item_url: "https://project.feishu.cn/other/story/detail/456" });
  view.rerender(<Workflow item={item("456")} available busy={false} submit={submit} />);
  await waitFor(() => expect(getWorkflowActions).toHaveBeenCalledWith(item("456").id));
  await act(async () => { if (outcome === "success") resolveOpen(); else rejectOpen("旧事项打开失败"); });
  const calls = vi.mocked(getWorkflowActions).mock.calls.length;
  fireEvent.focus(window);
  expect(getWorkflowActions).toHaveBeenCalledTimes(calls);
  expect(getWorkflowActions).not.toHaveBeenCalledWith(item("456").id, true);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});
