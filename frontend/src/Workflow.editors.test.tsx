// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { Workflow } from "./Workflow";
import { WorkflowReviewFields } from "./WorkflowReviewFields";
import { WorkflowConflict } from "./WorkflowConflict";
import { getWorkflowActions, loadFieldImage } from "./api";
import { itemKey } from "./model";
import { draftKey, readDraft, writeDraft } from "./workflowDrafts";
import type { CachedItem, WorkflowAction, WorkflowOptions } from "./types";

vi.mock("./api", () => ({ getWorkflowActions: vi.fn(), loadFieldImage: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
const item = { id: { project_key:"p", work_item_type_key:"story", work_item_id:"1" }, name:"研发事项" } as CachedItem;
const actionId="node:confirm:n1";
const imageId="a".repeat(64);
const image="data:image/png;base64,iVBORw0KGgo=";
const result={ outcome:"unknown", verified:false, message:"结果待核实", request_id:"r", action_id:actionId, resynced:false };
function options(field: WorkflowAction["fields"][number]): WorkflowOptions {
  return { version:"new", actions:[{id:actionId,label:"完成节点「后端代码研发」",kind:"node",fields:[field]}] };
}
function selected(kind: string, multiple=false): WorkflowAction["fields"][number] {
  return { key:"selection",label:kind==="people"?"研发负责人":"上车版本",kind:"text",required:true,initial_value:multiple?"[]":"",scope:"work_item",
    editor:{key:"remote-field",label:"字段",kind,multiple,required:true,initial:null,options:[]},options:[] };
}
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  vi.mocked(loadFieldImage).mockResolvedValue(image);
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command==="get_workflow_editor_context") return {target:{source_id:"workflow",project_key:"p",type_key:"story"},context:"b".repeat(64)};
    if (command==="lookup_workflow_field") return {options:[{value:"13",label:"十一月版本"},{value:"14",label:"十二月版本"}],warning:null};
    if (command==="get_creation_image" || command==="get_uploaded_creation_image") return {data_url:image};
    if (command==="upload_workflow_image") return {url:"https://project.feishu.cn/workflow-image.png",file_token:"uploaded-token"};
    throw new Error(`unexpected ${command}`);
  });
});
afterEach(cleanup);
async function open(field: WorkflowAction["fields"][number]) {
  vi.mocked(getWorkflowActions).mockResolvedValue(options(field));
  const submit=vi.fn().mockResolvedValue(result);
  render(<Workflow item={item} available busy={false} submit={submit} />);
  await userEvent.click(await screen.findByRole("button",{name:"完成节点「后端代码研发」"}));
  return submit;
}
async function confirm() {
  await userEvent.click(screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"));
  await userEvent.click(screen.getByRole("button",{name:"确认完成节点"}));
}

it("实际工时恢复旧版负责人草稿，确认后仅提交本次工时差异", async () => {
  const key=JSON.stringify({Schedule:{property:"actual_work_time",owner:"a"}});
  writeDraft(draftKey(itemKey(item),actionId),{version:"old",updated_at:1,fields:{[key]:"1.5"},base_fields:{[key]:""}});
  const submit=await open({key,label:"实际工时",kind:"number",required:true,initial_value:"",scope:"assignee",owner:"甲",column:"实际工时",min:0});
  expect((screen.getByLabelText("实际工时（必填）") as HTMLInputElement).value).toBe("1.5");
  await userEvent.click(screen.getByRole("button",{name:"提交"}));
  expect(await screen.findByRole("region",{name:"提交前二次确认"})).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
  await confirm();
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({fields:{[key]:"1.5"}}));
  expect(invoke).not.toHaveBeenCalledWith("open_external_url",expect.anything());
});

it.each([false,true])("关联事项按名称选择并完整核对，multiple=%s", async (multiple) => {
  const submit=await open(selected("relation",multiple));
  await userEvent.click(screen.getByRole("combobox",{name:"上车版本"}));
  await userEvent.click(await screen.findByRole("option",{name:"十一月版本"}));
  if (multiple) await userEvent.keyboard("{Escape}");
  expect(invoke).toHaveBeenCalledWith("lookup_workflow_field",{itemId:item.id,actionId,fieldKey:"selection",query:""});
  await userEvent.click(screen.getByRole("button",{name:"提交"}));
  const review=await screen.findByRole("region",{name:"提交前二次确认"});
  expect(review.textContent).toContain("十一月版本");
  expect(review.textContent).toContain("1 项新增");
  await confirm();
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({fields:{selection:multiple?'["13"]':"13"}}));
});

it.each(["people", "relation"])("流程%s字段进入表单预加载并在本地筛选", async (kind) => {
  await open(selected(kind, true));
  const label = kind === "people" ? "研发负责人" : "上车版本";
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("lookup_workflow_field", { itemId: item.id, actionId, fieldKey: "selection", query: "" }));
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await screen.findByRole("option", { name: "十一月版本" });
  const calls = vi.mocked(invoke).mock.calls.filter(([command]) => command === "lookup_workflow_field").length;
  await userEvent.type(screen.getByRole("textbox", { name: `搜索${label}` }), "十二");
  expect(screen.getByRole("option", { name: "十二月版本" })).toBeTruthy();
  expect(screen.queryByRole("option", { name: "十一月版本" })).toBeNull();
  expect(screen.queryByText("正在搜索…")).toBeNull();
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "lookup_workflow_field")).toHaveLength(calls);
});

it("多人角色空选择继续要求补齐，保留选择名称到草稿", async () => {
  await open(selected("people",true));
  expect((screen.getByRole("button",{name:"提交"}) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByRole("combobox",{name:"研发负责人"}));
  await userEvent.click(await screen.findByRole("option",{name:"十一月版本"}));
  await userEvent.keyboard("{Escape}");
  expect(readDraft(draftKey(itemKey(item),actionId))?.field_labels?.["selection:13"]).toBe("十一月版本");
  await userEvent.click(screen.getByRole("button",{name:"清空研发负责人"}));
  expect((screen.getByRole("button",{name:"提交"}) as HTMLButtonElement).disabled).toBe(true);
});

it("富文本图文草稿按真实事项和字段上传，二次确认后才发送正文", async () => {
  vi.mocked(loadFieldImage).mockRejectedValue(new Error("图片尚未写入云端字段"));
  const key=JSON.stringify({WorkItem:"description"});
  const markdown=`已有文字\n\n![截图](fstodo-image:${imageId})`;
  writeDraft(draftKey(itemKey(item),actionId),{version:"old",updated_at:1,fields:{[key]:markdown},base_fields:{[key]:"已有文字"}});
  const submit=await open({key,label:"需求说明",kind:"textarea",required:true,initial_value:"已有文字",scope:"work_item",
    rich_text:{image_field_key:"description"},editor:{key:"description",label:"需求说明",kind:"textarea",required:true,multiple:false,initial:null,options:[]}});
  expect((await screen.findByRole("textbox",{name:"需求说明"})).getAttribute("contenteditable")).toBe("true");
  await waitFor(()=>expect((screen.getByRole("button",{name:"提交"}) as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(screen.getByRole("button",{name:"提交"}));
  const review = await screen.findByRole("region",{name:"提交前二次确认"});
  expect((await within(review).findByRole("img")).getAttribute("src")).toBe(image);
  expect(loadFieldImage).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenCalledWith("upload_workflow_image",{itemId:item.id,actionId,fieldKey:key,context:"b".repeat(64),imageId});
  expect(submit).not.toHaveBeenCalled();
  await confirm();
  expect(submit.mock.calls[0][0].fields[key]).toBe("已有文字\n\n![截图](https://project.feishu.cn/workflow-image.png)<!--uploaded-token-->");
});

it("节点富文本无法确认图片归属时只编辑文字，不猜工作项图片字段", async () => {
  await open({key:"node-rich",label:"节点说明",kind:"textarea",required:false,initial_value:"文字\n![节点图](https://project.feishu.cn/node.png)",scope:"node",
    rich_text:{},editor:{key:"node-rich",label:"节点说明",kind:"textarea",required:false,multiple:false,initial:null,options:[]}});
  await screen.findByText("请在飞书中查看图片");
  expect(loadFieldImage).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalledWith("get_uploaded_creation_image",expect.anything());
  expect(screen.getByRole("textbox",{name:"节点说明"}).getAttribute("contenteditable")).toBe("true");
});

it("富文本确认保留首行缩进的代码块语义", () => {
  const field:WorkflowAction["fields"][number]={key:"body",label:"说明",kind:"textarea",required:true,initial_value:"",rich_text:{image_field_key:"description"}};
  const action=options(field).actions[0];
  const {container}=render(<WorkflowReviewFields itemId={item.id} action={action} changes={{body:"    示例代码\n"}} remote={{body:""}} />);
  expect(container.querySelector("pre code")?.textContent).toBe("示例代码\n");
});

it("图文云端冲突和本机图片预览隐藏源语法并保留图片", async () => {
  const field:WorkflowAction["fields"][number]={key:"body",label:"说明",kind:"textarea",required:true,rich_text:{image_field_key:"description"},
    editor:{key:"description",label:"说明",kind:"textarea",required:true,multiple:false,initial:null,options:[]}};
  render(<WorkflowConflict itemId={item.id} field={field} remote="云端正文\n![云端图](https://project.feishu.cn/remote.png)" value={`本机正文\n![本机图](fstodo-image:${imageId})`} />);
  expect(await screen.findByRole("img",{name:"云端图"})).toBeTruthy();
  await userEvent.click(screen.getByRole("button",{name:"预览说明提交后的飞书内容"}));
  const tooltip=await screen.findByRole("tooltip");
  expect(await within(tooltip).findByRole("img",{name:"本机图"})).toBeTruthy();
  expect(tooltip.textContent).not.toContain("fstodo-image:");
  expect(tooltip.textContent).not.toContain("![");
});

it("刷新云端后的冲突预览仍使用已选关联名称", async () => {
  const field={...selected("relation"),initial_value:"12",options:[{value:"12",label:"旧版本"}]};
  await open(field);
  await userEvent.click(screen.getByRole("combobox",{name:"上车版本"}));
  await userEvent.click(await screen.findByRole("option",{name:"十一月版本"}));
  vi.mocked(getWorkflowActions).mockResolvedValue(options({...field,initial_value:"14",options:[{value:"14",label:"云端新版本"}]}));
  fireEvent.focus(window);
  await screen.findByRole("group",{name:"上车版本冲突处理"});
  await userEvent.click(screen.getByRole("button",{name:"预览上车版本提交后的飞书内容"}));
  expect((await screen.findByRole("tooltip")).textContent).toContain("十一月版本");
});
