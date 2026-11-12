// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import { cachedItemDetail, loadSnapshot, refreshItemDetail, refreshSourceTypes } from "./api";
import { flushSourceTypePreferences } from "./preferences";
import type { Snapshot } from "./types";

vi.mock("./api", () => ({
  desktop: true,
  loadSnapshot: vi.fn(),
  refreshSourceTypes: vi.fn(),
  cachedItemDetail: vi.fn(),
  refreshItemDetail: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", async (original) => ({
  ...(await original<typeof import("@tauri-apps/api/core")>()),
  invoke: vi.fn(),
}));

function snapshot(): Snapshot {
  return {
    capabilities: { workflow: false, source_type_preferences: true },
    source_type_preferences: {
      a: { story: { enabled: false, alias: "研发" } },
    },
    sources: [
      {
        id: "a",
        display_name: "我的待办",
        kind: "personal_todo",
        enabled: true,
        executable: true,
        reason: null,
        action: "todo",
        todo_scope: "in_progress",
        type_scope: {
          configured: true,
          selected_count: 0,
          types: [
            {
              project_key: "space",
              project_name: "空间",
              type_key: "story",
              type_name: "需求",
              selected: false,
            },
          ],
        },
      },
    ],
    items: [],
    total: 0,
    runs: [],
    last_success: null,
    credential_ready: false,
    credential_description: "未配置",
    config_path: "config.toml",
    db_path: "cache.db",
  };
}

beforeEach(async () => {
  await flushSourceTypePreferences();
  vi.resetAllMocks();
  localStorage.clear();
});
afterEach(cleanup);

async function openTypes() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "工作来源" }));
  return user;
}

it("需求研发详情可打开关联缺陷并携带当前需求新建，需求反馈不显示入口", async () => {
  const data = snapshot();
  data.capabilities = { workflow: false, details: true, creation: true, source_type_preferences: true };
  data.credential_ready = true;
  data.source_type_preferences = { a: { story: { enabled: true, alias: "" }, issue: { enabled: true, alias: "", create_enabled: true }, feedback: { enabled: true, alias: "" } } };
  data.sources[0].type_scope!.types.push(
    { project_key: "space", project_name: "空间", type_key: "issue", type_name: "缺陷跟踪", selected: true },
    { project_key: "space", project_name: "空间", type_key: "feedback", type_name: "需求反馈", selected: true },
  );
  const makeItem = (kind: string, name: string, id: string) => ({ id: { project_key: "space", work_item_type_key: kind, work_item_id: id }, name, project_name: "空间", flow: { kind: "none" as const, node_name: null, node_state_key: null, start_state_key_name: null, end_state_key_name: null }, schedule: { start_raw: null, end_raw: null }, raw_json: "{}", identity_missing_flags: [], first_seen_at_ms: 1, last_seen_at_ms: 1, seen_count: 1 });
  data.items = [makeItem("story", "需求甲", "123"), makeItem("feedback", "反馈乙", "456")];
  data.total = 2;
  vi.mocked(loadSnapshot).mockResolvedValue(data);
  vi.mocked(cachedItemDetail).mockResolvedValue(null);
  vi.mocked(refreshItemDetail).mockImplementation(async (id) => ({ id, fetched_at_ms: 1, data: { work_item_attribute: {}, work_item_fields: [] }, pages: [] }));
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "get_pending_creations") return [];
    if (command === "list_related_defects") return { relation_field: "parent", mine_available: true, incomplete_details: 0, items: [{ item: makeItem("issue", "已有缺陷", "789"), status: "处理中", operators: [], mine: true }] };
    if (command === "get_creation_form") return { target: (args as { target: unknown }).target, context: "account", version: "v1", pending: null, fields: [{ key: "name", label: "缺陷名称", kind: "text", required: true, multiple: false, initial: null, options: [] }, { key: "parent", label: "所属需求", kind: "relation", required: false, multiple: false, initial: null, options: [], related: [{ project_key: "space", type_key: "story" }] }] };
    if (command === "lookup_creation_field") return { options: [], warning: null };
    return undefined;
  });
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByText("需求甲"));
  await waitFor(() => expect(vi.mocked(refreshItemDetail).mock.calls.some(([id]) => id.work_item_id === "123")).toBe(true));
  const requirementReads = vi.mocked(refreshItemDetail).mock.calls.filter(([id]) => id.work_item_id === "123").length;
  await user.click(await screen.findByRole("button", { name: /已有缺陷/ }));
  expect(await screen.findByRole("button", { name: /返回需求详情/ })).toBeTruthy();
  expect(vi.mocked(refreshItemDetail).mock.calls.some(([id]) => id.work_item_id === "789")).toBe(false);
  expect(vi.mocked(invoke).mock.calls.some(([command]) => command === "get_workflow_actions" || command === "load_field_image" || command === "resolve_link_metadata")).toBe(false);
  await user.click(screen.getByRole("button", { name: /返回需求详情/ }));
  expect(vi.mocked(refreshItemDetail).mock.calls.filter(([id]) => id.work_item_id === "123")).toHaveLength(requirementReads);
  await user.click(await screen.findByRole("button", { name: "＋ 新建缺陷" }));
  const dialog = await screen.findByRole("dialog");
  expect(await within(dialog).findByText("需求甲")).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: "关闭新建" }));
  await user.click(screen.getByText("反馈乙"));
  expect(screen.queryByRole("region", { name: "关联缺陷" })).toBeNull();
});

it("只在当前已开启新建的类型显示入口，关闭的类型不能借用其他类型开关", async () => {
  const data=snapshot();data.capabilities!.creation=true;
  data.source_type_preferences={a:{story:{enabled:true,alias:"需求研发",create_enabled:false},issue:{enabled:true,alias:"缺陷跟踪",create_enabled:true}}};
  data.sources[0].type_scope!.types.push({project_key:"space",project_name:"空间",type_key:"issue",type_name:"缺陷跟踪",selected:false});
  vi.mocked(loadSnapshot).mockResolvedValue(data);
  vi.mocked(invoke).mockImplementation(async (command,args)=>{
    if(command==="get_pending_creations")return [];
    if(command==="get_creation_form")return {target:(args as {target:unknown}).target,context:"account",version:"v1",fields:[],pending:null};
    return undefined;
  });
  const user=userEvent.setup();render(<App />);
  await screen.findByRole("button",{name:/全部工作/});
  expect(screen.queryByRole("button",{name:"新建工作事项"})).toBeNull();
  const tabs=within(document.querySelector(".tabs") as HTMLElement);
  await user.click(tabs.getByRole("button",{name:/需求研发/}));
  await waitFor(()=>expect(screen.queryByRole("button",{name:"新建工作事项"})).toBeNull());
  await user.click(tabs.getByRole("button",{name:/缺陷跟踪/}));
  await user.click(await screen.findByRole("button",{name:"新建工作事项"}));
  await screen.findByRole("heading",{name:"新建缺陷跟踪"});
  expect(invoke).toHaveBeenCalledWith("get_creation_form",{target:expect.objectContaining({type_key:"issue"})});
  await user.click(screen.getByRole("combobox",{name:"新建类型"}));
  expect(screen.queryByRole("option",{name:"需求研发"})).toBeNull();
});

it("升级后界面缓存丢失时，清单显示和别名从数据库恢复，同步选择保持独立", async () => {
  vi.mocked(loadSnapshot).mockResolvedValue(snapshot());
  render(<App />);
  await openTypes();
  expect(
    (
      screen.getByRole("switch", {
        name: "研发在清单中显示",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  expect(
    (screen.getByRole("switch", { name: "允许新建研发" }) as HTMLInputElement)
      .checked,
  ).toBe(false);
  expect(
    (
      screen.getByRole("textbox", {
        name: "需求的显示别名",
      }) as HTMLInputElement
    ).value,
  ).toBe("研发");
  expect(invoke).not.toHaveBeenCalledWith(
    "initialize_source_type_preferences",
    expect.anything(),
  );
});

it("切换和别名修改落库后，清空界面缓存并重启仍保留最新选择", async () => {
  const data = snapshot();
  vi.mocked(loadSnapshot).mockImplementation(async () => structuredClone(data));
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "save_source_type_preferences") {
      const value = args as {
        sourceId: string;
        preferences: NonNullable<Snapshot["source_type_preferences"]>[string];
      };
      data.source_type_preferences![value.sourceId] = structuredClone(
        value.preferences,
      );
    }
    return undefined;
  });
  let app = render(<App />);
  const user = await openTypes();
  await user.click(screen.getByRole("switch", { name: "研发在清单中显示" }));
  await user.type(
    screen.getByRole("textbox", { name: "需求的显示别名" }),
    "组",
  );
  await flushSourceTypePreferences();
  expect(data.source_type_preferences!.a.story).toEqual({
    enabled: true,
    alias: "研发组",
  });
  expect(data.sources[0].type_scope!.types[0].selected).toBe(false);
  app.unmount();
  localStorage.clear();
  app = render(<App />);
  await openTypes();
  expect(
    (
      screen.getByRole("switch", {
        name: "研发组在清单中显示",
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(
    (screen.getByRole("switch", { name: "允许新建研发组" }) as HTMLInputElement)
      .checked,
  ).toBe(false);
  app.unmount();
});

it("数据库保存失败时恢复已确认的开关状态，之后可以重试", async () => {
  vi.mocked(loadSnapshot).mockResolvedValue(snapshot());
  vi.mocked(invoke)
    .mockRejectedValueOnce(new Error("磁盘不可写"))
    .mockResolvedValue(undefined);
  render(<App />);
  const user = await openTypes();
  await user.click(screen.getByRole("switch", { name: "研发在清单中显示" }));
  await screen.findByText("类型偏好保存失败，请检查本机存储后重试。");
  expect(
    (
      screen.getByRole("switch", {
        name: "研发在清单中显示",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  await user.click(screen.getByRole("switch", { name: "研发在清单中显示" }));
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  expect(
    (
      screen.getByRole("switch", {
        name: "研发在清单中显示",
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
});

it("已停用来源的清单显示和别名仍可保存，新建默认关闭", async () => {
  const data = snapshot();
  data.sources.push({
    ...structuredClone(data.sources[0]),
    id: "b",
    display_name: "已停用来源",
    enabled: false,
    executable: false,
  });
  vi.mocked(loadSnapshot).mockResolvedValue(data);
  vi.mocked(invoke).mockResolvedValue(undefined);
  render(<App />);
  const user = await openTypes();
  await user.click(screen.getByRole("radio", { name: "已停用来源" }));
  await user.click(screen.getByRole("switch", { name: "需求在清单中显示" }));
  await user.type(
    screen.getByRole("textbox", { name: "需求的显示别名" }),
    "归档",
  );
  await flushSourceTypePreferences();
  expect(invoke).toHaveBeenLastCalledWith("save_source_type_preferences", {
    sourceId: "b",
    preferences: { story: { enabled: false, alias: "归档" } },
  });
  expect(
    (screen.getByRole("switch", { name: "允许新建归档" }) as HTMLInputElement)
      .checked,
  ).toBe(false);
});

it("配置回读期间的新选择不会被较早读取的数据库状态覆盖", async () => {
  let finishRead!: (value: Snapshot) => void;
  vi.mocked(loadSnapshot)
    .mockResolvedValueOnce(snapshot())
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRead = resolve;
        }),
    );
  vi.mocked(refreshSourceTypes).mockResolvedValue({
    discovered_count: 1,
    failed: [],
  });
  vi.mocked(invoke).mockResolvedValue(undefined);
  render(<App />);
  const user = await openTypes();
  await user.click(screen.getByRole("button", { name: "发现类型" }));
  await waitFor(() => expect(loadSnapshot).toHaveBeenCalledTimes(2));
  await user.click(screen.getByRole("switch", { name: "研发在清单中显示" }));
  await flushSourceTypePreferences();
  await act(async () => finishRead(snapshot()));
  await screen.findByText("已发现 1 个空间与类型组合。");
  expect(
    (
      screen.getByRole("switch", {
        name: "研发在清单中显示",
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
});
