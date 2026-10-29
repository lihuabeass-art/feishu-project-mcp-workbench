// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import App from "./App";
import { typeColor } from "./model";
import {
  executeWorkflowAction,
  checkConnection,
  getWorkflowActions,
  loadSnapshot,
  saveToken,
  saveConnectionSettings,
  syncTodos,
  refreshSourceTypes,
  saveSourceTypes,
  clearSourceTypes,
  saveTypeOrder,
  cachedItemDetail,
  refreshItemDetail,
} from "./api";
import type { CachedItem, ConnectionInfo, ItemDetail, Snapshot, WorkflowResult } from "./types";

vi.mock("./api", () => ({
  desktop: true,
  loadSnapshot: vi.fn(),
  syncTodos: vi.fn(),
  checkConnection: vi.fn(),
  saveToken: vi.fn(),
  saveConnectionSettings: vi.fn(),
  getWorkflowActions: vi.fn(),
  executeWorkflowAction: vi.fn(),
  refreshSourceTypes: vi.fn(),
  saveSourceTypes: vi.fn(),
  clearSourceTypes: vi.fn(),
  saveTypeOrder: vi.fn(),
  cachedItemDetail: vi.fn(),
  refreshItemDetail: vi.fn(),
}));

function item(project: string, name: string, kind = "story"): CachedItem {
  return {
    id: {
      project_key: project,
      work_item_type_key: kind,
      work_item_id: "same-id",
    },
    name,
    project_name: project,
    flow: {
      kind: "both",
      node_name: "研发",
      node_state_key: null,
      start_state_key_name: "待处理",
      end_state_key_name: "修复中",
    },
    schedule: { start_raw: null, end_raw: null },
    raw_json: "{}",
    identity_missing_flags: [],
    first_seen_at_ms: 1,
    last_seen_at_ms: 2,
    seen_count: 1,
  };
}
function snapshot(): Snapshot {
  return {
    items: [item("space-a", "需求甲"), item("space-b", "缺陷乙", "issue")],
    total: 2,
    last_success: null,
    runs: [],
    sources: ["source-a", "source-b"].map((id) => ({
      id,
      kind: "personal_todo",
      enabled: true,
      executable: true,
      reason: null,
      action: "todo",
      todo_scope: "in_progress",
      type_scope: {
        configured: false,
        selected_count: 2,
        types: ["story", "issue"].map((type_key) => ({
          project_key: "space-a", project_name: "空间甲", type_key,
          type_name: type_key === "story" ? "需求" : "缺陷", selected: true,
        })),
      },
    })),
    config_path: "config.toml",
    db_path: "cache.db",
    credential_ready: true,
    credential_description: "环境变量",
  };
}

async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(screen.getByRole("option", { name: option }));
  await user.keyboard("{Escape}");
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(loadSnapshot).mockResolvedValue(snapshot());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("连接检查与可重复查看的教程", () => {
  const connected: ConnectionInfo = { session_established: true, server_name: "Meego MCP Server", server_version: "1.0.0" };
  const intro = "打开飞书项目 MCP 配置，选择 HTTP Header，复制 Token 后粘贴到下方。";

  async function openSettings() {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    await user.click(screen.getByRole("button", { name: "连接与配置" }));
    return user;
  }

  it("已保存凭证仍显示引导，展开教程跨页面和保存保留且不会误提交草稿", async () => {
    const user = await openSettings();
    expect(screen.getByText("Token 已保存")).toBeTruthy();
    expect(screen.getByText(/^尚未检查连接/)).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === intro)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "查看教程" }));
    await user.click(screen.getByRole("button", { name: /我的工作/ }));
    await user.click(screen.getByRole("button", { name: "连接与配置" }));
    expect(screen.getByRole("region", { name: "获取飞书项目 MCP Token" })).toBeTruthy();

    const input = screen.getByLabelText("MCP Token") as HTMLInputElement;
    await user.type(input, "replacement-test-token");
    expect((screen.getByRole("button", { name: "检查连接" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("请先保存下方 Token，再检查连接。")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "收起教程" }));
    await user.click(screen.getByRole("button", { name: "查看教程" }));
    expect(input.value).toBe("replacement-test-token");
    expect(saveToken).not.toHaveBeenCalled();
    vi.mocked(saveToken).mockResolvedValue("新本地凭证摘要");
    await user.click(screen.getByRole("button", { name: "保存 Token" }));
    await screen.findByText("新本地凭证摘要");
    expect(input.value).toBe("");
    expect((screen.getByRole("button", { name: "检查连接" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("region", { name: "获取飞书项目 MCP Token" })).toBeTruthy();
  });

  it.each([
    ["auth", "凭证未通过验证", true],
    ["permission", "飞书侧权限不足", false],
    ["connection", "暂时无法连接", false],
    ["tool", "连接检查未完成", false],
    ["credential", "本机凭证不可用", true],
  ] as const)("按 %s 分类显示检查失败，不用其他失败冒充凭证问题", async (kind, title, hasGuideAction) => {
    vi.mocked(checkConnection).mockRejectedValue({ kind, message: `${kind} 测试失败详情` });
    const user = await openSettings();
    await user.click(screen.getByRole("button", { name: "检查连接" }));
    await screen.findByText(title);
    expect(screen.getByText(`${kind} 测试失败详情`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "查看教程" })).toBeTruthy();
    if (hasGuideAction) {
      await user.click(screen.getByRole("button", { name: "查看获取教程" }));
      expect(screen.getByRole("region", { name: "获取飞书项目 MCP Token" })).toBeTruthy();
    } else {
      expect(screen.queryByText("凭证未通过验证")).toBeNull();
      expect(screen.queryByText("本机凭证不可用")).toBeNull();
      expect(screen.queryByRole("button", { name: "查看获取教程" })).toBeNull();
    }
    await user.click(screen.getByRole("button", { name: /我的工作/ }));
    await user.click(screen.getByRole("button", { name: "连接与配置" }));
    expect(screen.getByText(title)).toBeTruthy();
  });

  it("重试检查时保留上次错误，成功后替换旧结论且教程始终可访问", async () => {
    vi.mocked(checkConnection).mockRejectedValueOnce({ kind: "connection", message: "网络暂时不可达" });
    const user = await openSettings();
    await user.click(screen.getByRole("button", { name: "检查连接" }));
    await screen.findByText("暂时无法连接");
    let finish!: (value: ConnectionInfo) => void;
    vi.mocked(checkConnection).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await user.click(screen.getByRole("button", { name: "检查连接" }));
    expect(screen.getByText("正在检查连接…")).toBeTruthy();
    expect(screen.getByText("网络暂时不可达")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "查看教程" }));
    expect(screen.getByRole("region", { name: "获取飞书项目 MCP Token" })).toBeTruthy();
    await act(async () => finish(connected));
    await screen.findByText("连接已通过检查");
    expect(screen.queryByText("网络暂时不可达")).toBeNull();
    expect(screen.queryByText("暂时无法连接")).toBeNull();
    expect(screen.getByRole("button", { name: "收起教程" })).toBeTruthy();
  });

  it("检查成功后的本地回读失败不会覆盖为凭证错误", async () => {
    vi.mocked(checkConnection).mockResolvedValue(connected);
    const user = await openSettings();
    vi.mocked(loadSnapshot).mockRejectedValueOnce({ kind: "auth", message: "本地页面回读测试失败" });
    await user.click(screen.getByRole("button", { name: "检查连接" }));
    await screen.findByText("连接已通过检查");
    await waitFor(() => expect((screen.getByRole("button", { name: "检查连接" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText("凭证未通过验证")).toBeNull();
    expect(screen.queryByText("本机凭证不可用")).toBeNull();
  });

  it("替换 Token 失败保留上次检查结论，保存成功后回到待检查", async () => {
    vi.mocked(checkConnection).mockRejectedValue({ kind: "auth", message: "原凭证未通过验证" });
    const user = await openSettings();
    await user.click(screen.getByRole("button", { name: "检查连接" }));
    await screen.findByText("凭证未通过验证");
    await user.type(screen.getByLabelText("MCP Token"), "next-test-token");
    vi.mocked(saveToken).mockRejectedValueOnce({ kind: "credential", message: "本机保存测试失败" });
    await user.click(screen.getByRole("button", { name: "保存 Token" }));
    await screen.findByText(/Token 保存失败：本机保存测试失败/);
    expect(screen.getByText("凭证未通过验证")).toBeTruthy();
    vi.mocked(saveToken).mockResolvedValueOnce("新凭证摘要");
    await user.click(screen.getByRole("button", { name: "保存 Token" }));
    await screen.findByText("新凭证摘要");
    expect(screen.getByText(/^尚未检查连接/)).toBeTruthy();
    expect(screen.queryByText("凭证未通过验证")).toBeNull();
  });

  it("连接设置保存失败保留检查结论，成功保存后清除旧结论", async () => {
    const settings = { endpoint: "https://project.feishu.cn/mcp_server/v1" };
    vi.mocked(loadSnapshot).mockResolvedValue({ ...snapshot(), settings });
    vi.mocked(checkConnection).mockResolvedValue(connected);
    const user = await openSettings();
    await user.click(screen.getByRole("button", { name: "检查连接" }));
    await screen.findByText("连接已通过检查");
    vi.mocked(saveConnectionSettings).mockRejectedValueOnce({ kind: "config", message: "配置写入测试失败" });
    fireEvent.change(screen.getByLabelText("MCP 服务地址"), { target: { value: "https://next.example.com/mcp" } });
    await screen.findByText(/配置写入测试失败/);
    expect(screen.getByText("连接已通过检查")).toBeTruthy();
    expect((screen.getByRole("button", { name: "检查连接" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("服务地址尚未保存，保存后再检查连接。")).toBeTruthy();
    vi.mocked(saveConnectionSettings).mockResolvedValueOnce();
    vi.mocked(loadSnapshot).mockResolvedValue({ ...snapshot(), settings: { endpoint: "https://next.example.com/mcp" } });
    await user.click(screen.getByRole("button", { name: "重试自动保存" }));
    await screen.findByText(/^尚未检查连接/);
    expect(screen.queryByText("连接已通过检查")).toBeNull();
  });
});

describe("工作台交互", () => {
  it("连接与配置默认新窗口，切换打开方式后自动保存并在重开时恢复", async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await screen.findByText("需求甲");
    await user.click(screen.getByRole("button", { name: "连接与配置" }));
    expect(screen.getByRole("combobox", { name: "链接打开方式" }).textContent).toContain("新窗口");
    await chooseOption(user, "链接打开方式", "已有浏览器");
    expect(localStorage.getItem("fstodo.link-opening-mode.v1")).toBe("existing-browser");
    expect(screen.getByText("设置已保存并生效。")).toBeTruthy();
    expect(screen.queryByText(/选择后自动保存在本机/)).toBeNull();
    view.unmount();
    render(<App />);
    await screen.findByText("需求甲");
    await user.click(screen.getByRole("button", { name: "连接与配置" }));
    expect(screen.getByRole("combobox", { name: "链接打开方式" }).textContent).toContain("已有浏览器");
    await chooseOption(user, "链接打开方式", "新窗口");
    expect(localStorage.getItem("fstodo.link-opening-mode.v1")).toBe("new-window");
  });

  it("切换来源立即筛选缓存与计数，共同事项去重，启用来源合集排除停用来源", async () => {
    const data = snapshot();
    data.capabilities = { workflow: false, source_queries: true };
    const personal = { ...item("space-a", "个人待办事项"), source_ids: ["source-a"] };
    const related = { ...item("space-b", "关联需求事项"), source_ids: ["source-b"] };
    const shared = { ...item("space-c", "共同事项"), source_ids: ["source-a", "source-b"] };
    const disabled = { ...item("space-d", "停用来源事项"), source_ids: ["disabled"] };
    data.items = [personal, related, shared, disabled];
    data.total = 4;
    data.sources.push(
      { ...data.sources[0], id: "empty" },
      { ...data.sources[0], id: "disabled", enabled: false, executable: false },
    );
    vi.mocked(loadSnapshot).mockResolvedValue(data);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("个人待办事项");
    expect(screen.getByText("关联需求事项")).toBeTruthy();
    expect(screen.getAllByText("共同事项")).toHaveLength(1);
    expect(screen.queryByText("停用来源事项")).toBeNull();
    expect(screen.getByText("3 条结果")).toBeTruthy();

    await chooseOption(user, "显示来源", "source-a");
    expect(screen.getByText("个人待办事项")).toBeTruthy();
    expect(screen.queryByText("关联需求事项")).toBeNull();
    expect(screen.getByText("2 条结果")).toBeTruthy();
    await chooseOption(user, "空间", "空间甲");
    await user.click(screen.getByRole("button", { name: /个人待办事项需求/ }));
    expect(screen.getByRole("complementary", { name: "事项详情" })).toBeTruthy();

    await chooseOption(user, "显示来源", "source-b");
    expect(screen.queryByRole("complementary", { name: "事项详情" })).toBeNull();
    expect(screen.queryByText("个人待办事项")).toBeNull();
    expect(screen.getByText("关联需求事项")).toBeTruthy();
    expect(screen.getByText("共同事项")).toBeTruthy();
    expect(screen.getByText("2 条结果")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "空间" }).textContent).toContain("全部空间");

    await chooseOption(user, "显示来源", "empty");
    expect(screen.queryByText("共同事项")).toBeNull();
    expect(screen.getByText("0 条结果")).toBeTruthy();
    expect(screen.queryByText("尚未选择显示类型")).toBeNull();
    await chooseOption(user, "显示来源", "全部来源");
    expect(screen.getByText("3 条结果")).toBeTruthy();
    await chooseOption(user, "显示来源", "source-a");
    await user.type(screen.getByRole("textbox", { name: "搜索工作" }), "个人");
    await user.click(screen.getByRole("button", { name: /个人待办事项需求/ }));
    await user.click(screen.getByRole("button", { name: "工作来源" }));
    await user.click(screen.getByRole("radio", { name: /^source-b/ }));
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByText("关联需求事项")).toBeTruthy();
    expect(screen.getByText("2 条结果")).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "事项详情" })).toBeNull();
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(syncTodos).not.toHaveBeenCalled();
  });

  it("节点候选随空间缩小，选中后可切换，零结果时仍可取消", async () => {
    const data = snapshot();
    const merge = item("space-a", "合入任务");
    merge.id.work_item_id = "merge";
    merge.flow.node_name = "后端代码合入";
    const design = item("space-a", "设计任务");
    design.id.work_item_id = "design";
    design.flow.node_name = "后端方案设计";
    const other = item("space-b", "其他空间任务");
    other.flow.node_name = "其他节点";
    data.items = [merge, design, other];
    data.total = 3;
    vi.mocked(loadSnapshot).mockResolvedValue(data);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("合入任务");
    await chooseOption(user, "空间", "空间甲");
    await user.click(screen.getByRole("combobox", { name: "当前节点" }));
    expect(screen.queryByRole("option", { name: "其他节点（1）" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "后端代码合入（1）" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByText("设计任务")).toBeNull();
    await user.click(screen.getByRole("combobox", { name: "当前节点" }));
    expect(screen.getByRole("option", { name: "后端方案设计（1）" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await user.type(screen.getByRole("textbox", { name: "搜索工作" }), "设计");
    expect(screen.getByText("没有匹配的工作")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "当前节点" }).textContent).toContain("后端代码合入（0）");
    await chooseOption(user, "当前节点", "全部节点");
    expect(screen.getByText("设计任务")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "当前节点" })).toBeNull();
  });

  it("手动立即刷新并移除已离开当前范围的事项", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("缺陷乙");
    await chooseOption(user, "显示来源", "source-a");
    vi.mocked(syncTodos).mockResolvedValue(successfulReport);
    const latest = snapshot();
    latest.items = [latest.items[0]];
    latest.total = 1;
    vi.mocked(loadSnapshot).mockResolvedValue(latest);
    await user.click(screen.getByRole("button", { name: "立即刷新" }));
    await waitFor(() => expect(screen.queryByText("缺陷乙")).toBeNull());
    expect(syncTodos).toHaveBeenCalledWith("source-a", false);
    expect(screen.queryByText(/累积缓存|所有数据保存在这台设备上/)).toBeNull();
  });

  it("同步后所选空间没有事项时保留空间名称，清除筛选后可看到其他空间", async () => {
    const data = snapshot();
    data.items[0].project_name = "研发空间";
    vi.mocked(loadSnapshot).mockResolvedValue(data);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    await chooseOption(user, "显示来源", "source-a");
    await chooseOption(user, "空间", "研发空间");
    vi.mocked(syncTodos).mockResolvedValue(successfulReport);
    vi.mocked(loadSnapshot).mockResolvedValue({ ...data, items: [data.items[1]], total: 1 });
    await user.click(screen.getByRole("button", { name: "立即刷新" }));
    await screen.findByText("0 条结果");
    expect(screen.getByRole("combobox", { name: "空间" }).textContent).toContain("研发空间");
    expect(screen.queryByText("缺陷乙")).toBeNull();
    await chooseOption(user, "空间", "全部空间");
    expect(screen.getByText("缺陷乙")).toBeTruthy();
    expect(screen.getByText("1 条结果")).toBeTruthy();
  });

  it("详情的旧快照迟到时不能覆盖同步后的最新清单", async () => {
    const user = userEvent.setup();
    const initial: Snapshot = { ...snapshot(), capabilities: { workflow: false, details: true } };
    vi.mocked(loadSnapshot).mockResolvedValue(initial);
    vi.mocked(cachedItemDetail).mockResolvedValue(null);
    vi.mocked(refreshItemDetail).mockResolvedValue({
      id: initial.items[0].id, fetched_at_ms: 1,
      data: { work_item_attribute: {}, work_item_fields: [] }, pages: [],
    });
    render(<App />);
    await screen.findByText("需求甲");
    await chooseOption(user, "显示来源", "source-a");
    let resolveOld!: (value: Snapshot) => void;
    vi.mocked(loadSnapshot).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    await user.click(screen.getByRole("button", { name: /需求甲.*需求/ }));
    await waitFor(() => expect(loadSnapshot).toHaveBeenCalledTimes(2));
    const latest = { ...initial, items: [initial.items[0]], total: 1 };
    vi.mocked(loadSnapshot).mockResolvedValue(latest);
    vi.mocked(syncTodos).mockResolvedValue(successfulReport);
    await user.click(screen.getByRole("button", { name: "立即刷新" }));
    await waitFor(() => expect(screen.queryByText("缺陷乙")).toBeNull());
    await act(async () => resolveOld(initial));
    expect(screen.queryByText("缺陷乙")).toBeNull();
    expect(loadSnapshot).toHaveBeenCalledTimes(3);
  });

  it("工作来源与连接配置独立显示各自内容，侧栏去掉工作台标签", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    expect(screen.queryByText("个人工作台")).toBeNull();
    expect(screen.queryByText("LOCAL")).toBeNull();

    const sourcesButton = screen.getByRole("button", { name: "工作来源" });
    const settingsButton = screen.getByRole("button", { name: "连接与配置" });
    await user.click(sourcesButton);
    await user.click(screen.getByRole("radio", { name: "source-a" }));
    expect(screen.getByRole("region", { name: "工作来源" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "工作类型" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "工作来源" })).toBeTruthy();
    expect(screen.getByLabelText("需求的显示别名")).toBeTruthy();
    expect(screen.queryByLabelText("MCP Token")).toBeNull();
    expect(screen.queryByRole("button", { name: "检查连接" })).toBeNull();
    expect(sourcesButton.classList.contains("active")).toBe(true);
    expect(settingsButton.classList.contains("active")).toBe(false);
    expect(document.querySelector(".topbar")?.textContent).toContain("工作来源");

    await user.click(settingsButton);
    expect(screen.getByRole("region", { name: "连接与配置" })).toBeTruthy();
    expect(screen.getByLabelText("MCP Token")).toBeTruthy();
    expect(screen.getByRole("button", { name: "检查连接" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "工作类型" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "工作来源" })).toBeNull();
    expect(screen.queryByLabelText("需求的显示别名")).toBeNull();
    expect(sourcesButton.classList.contains("active")).toBe(false);
    expect(settingsButton.classList.contains("active")).toBe(true);
    expect(document.querySelector(".topbar")?.textContent).toContain("连接与配置");

    expect(screen.queryByRole("button", { name: "管理" })).toBeNull();
    await user.click(sourcesButton);
    expect(screen.getByRole("region", { name: "工作来源" })).toBeTruthy();
    expect(screen.getByLabelText("需求的显示别名")).toBeTruthy();
  });

  it("发现的中文名用于侧栏和清单，合并后的类型行分别管理显示、别名与同步", async () => {
    const key = "69183a7a26f4d15e79765b76";
    const data = snapshot();
    data.items = [item("space-a", "专项事项", key)];
    data.total = 1;
    data.sources[0].type_scope = {
      configured: false,
      selected_count: 0,
      types: ["space-a", "space-b"].map((project_key) => ({
        project_key, project_name: project_key, type_key: key,
        type_name: "专项需求", selected: true,
      })),
    };
    data.sources[1].type_scope = {
      ...data.sources[0].type_scope,
      types: data.sources[0].type_scope.types.map((t) => ({ ...t, type_name: "其他需求" })),
    };
    data.sources.reverse();
    vi.mocked(loadSnapshot).mockResolvedValue(data);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("专项事项");
    expect(screen.getAllByRole("button", { name: /^专项需求/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /专项事项专项需求/ })).toBeTruthy();
    await chooseOption(user, "显示来源", "source-a");
    await user.click(screen.getByRole("button", { name: "工作来源" }));
    expect(screen.getAllByLabelText("专项需求的显示别名")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "类型与别名" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "同步类型范围" })).toBeNull();
    await user.click(screen.getByRole("switch", { name: "专项需求在清单中显示" }));
    expect((screen.getByRole("switch", { name: "同步专项需求" }) as HTMLInputElement).checked).toBe(true);
    expect(saveSourceTypes).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /我的工作/ }));
    expect(screen.queryByText("专项事项")).toBeNull();
    await user.click(screen.getByRole("button", { name: "工作来源" }));
    await user.click(screen.getByRole("switch", { name: "专项需求在清单中显示" }));
    await user.type(screen.getByLabelText("专项需求的显示别名"), "重点需求");
    expect(screen.queryByRole("button", { name: /^保存$/ })).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("专项需求的显示别名"));
    expect(screen.getAllByRole("button", { name: /^重点需求/ }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /我的工作/ }));
    expect(screen.getAllByRole("button", { name: /^重点需求/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /专项事项重点需求/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /专项事项/ }));
    expect(screen.getByRole("complementary", { name: "事项详情" }).textContent).toContain(key);
    await user.click(screen.getByRole("button", { name: "工作来源" }));
    await user.clear(screen.getByLabelText("专项需求的显示别名"));
    expect(screen.getAllByRole("button", { name: /^专项需求/ }).length).toBeGreaterThan(0);
  });

  it("发现类型回读范围，开关自动保存空集，恢复全部使用独立接口", async () => {
    const data = snapshot();
    data.sources[0].type_scope = {
      configured: false,
      selected_count: 0,
      types: [
        {
          project_key: "space-a",
          project_name: "空间甲",
          type_key: "new-type",
          type_name: "新类型",
          selected: true,
        },
      ],
    };
    vi.mocked(loadSnapshot).mockResolvedValue(data);
    vi.mocked(refreshSourceTypes).mockResolvedValue({
      discovered_count: 1,
      failed: [["space-b", "读取失败"]],
    });
    vi.mocked(saveSourceTypes).mockImplementation(async () => {
      data.sources[0].type_scope = {
        ...data.sources[0].type_scope!,
        configured: true,
        types: data.sources[0].type_scope!.types.map(t => ({ ...t, selected: false })),
      };
      return 0;
    });
    vi.mocked(clearSourceTypes).mockImplementation(async () => {
      data.sources[0].type_scope = {
        ...data.sources[0].type_scope!,
        configured: false,
        types: data.sources[0].type_scope!.types.map(t => ({ ...t, selected: true })),
      };
      return true;
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    await chooseOption(user, "显示来源", "source-a");
    await user.click(screen.getByRole("button", { name: "工作来源" }));
    await user.click(screen.getByRole("button", { name: "发现类型" }));
    expect(refreshSourceTypes).toHaveBeenCalledWith("source-a");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "space-b：读取失败",
    );
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("switch", { name: "同步新类型" }));
    await waitFor(() =>
      expect(saveSourceTypes).toHaveBeenCalledWith("source-a", []),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "恢复全部同步" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(clearSourceTypes).not.toHaveBeenCalled();
    expect((screen.getByRole("switch", { name: "同步新类型" }) as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole("button", { name: "恢复全部同步" }));
    await waitFor(() =>
      expect(clearSourceTypes).toHaveBeenCalledWith("source-a"),
    );
    expect(saveSourceTypes).toHaveBeenCalledTimes(1);
  });

  it("保存 token 后清空密码框，切换页面只回显后端脱敏摘要", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    await user.click(screen.getByRole("button", { name: "连接与配置" }));
    const input = screen.getByLabelText("MCP Token") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.value).toBe("");
    const masked = "本地加密凭证（***（长度 15 字符））";
    vi.mocked(saveToken).mockResolvedValue(masked);
    vi.mocked(loadSnapshot).mockResolvedValue({
      ...snapshot(),
      credential_description: masked,
    });
    await user.type(input, "test-only-token");
    await user.click(screen.getByRole("button", { name: "查看教程" }));
    expect(screen.getByRole("button", { name: "放大：选择 HTTP Header 并复制 Token" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "收起教程" }));
    expect(input.value).toBe("test-only-token");
    expect(saveToken).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "保存 Token" }));
    await screen.findByText(masked);
    expect(saveToken).toHaveBeenCalledWith("test-only-token");
    expect(input.value).toBe("");
    expect(await screen.findByText("设置已保存并生效。", {}, { timeout: 3500 })).toBeTruthy();
    expect(document.body.textContent).not.toContain("test-only-token");
    await user.click(screen.getByRole("button", { name: /我的工作/ }));
    await user.click(screen.getByRole("button", { name: "连接与配置" }));
    expect(screen.getByText(masked)).toBeTruthy();
    expect((screen.getByLabelText("MCP Token") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("button", { name: "重新读取配置" })).toBeNull();
  });

  it("全局配置保存后自动回读，失败时保留草稿并可重试", async () => {
    const settings = {
      endpoint: "https://project.feishu.cn/mcp_server/v1"
    };
    const data = { ...snapshot(), settings };
    vi.mocked(loadSnapshot).mockResolvedValue(data);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    await user.click(screen.getByRole("button", { name: "连接与配置" }));
    expect((screen.getByLabelText("MCP 服务地址") as HTMLInputElement).value).toBe(settings.endpoint);
    expect(screen.queryByText(/修改配置文件后点击/)).toBeNull();
    expect(screen.queryByRole("button", { name: "重新读取配置" })).toBeNull();
    for (const label of ["同步翻页上限", "同步记录保留条数", "缓存数据库路径", "凭证环境变量名", "备用凭证文件", "允许流程操作", "同时检查的工作来源数", "同时读取的事项详情数", "请求超时（秒）"]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
    expect(screen.queryByRole("button", { name: "保存配置" })).toBeNull();
    vi.mocked(saveConnectionSettings).mockRejectedValueOnce({ kind: "config", message: "配置写入失败" });
    fireEvent.change(screen.getByLabelText("MCP 服务地址"), { target: { value: "https://next.example.com/mcp" } });
    await screen.findByText(/配置写入失败/);
    expect((screen.getByLabelText("MCP 服务地址") as HTMLInputElement).value).toBe("https://next.example.com/mcp");
    expect(loadSnapshot).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: /我的工作/ }));
    await user.click(screen.getByRole("button", { name: "连接与配置" }));
    expect((screen.getByLabelText("MCP 服务地址") as HTMLInputElement).value).toBe("https://next.example.com/mcp");
    expect(screen.getByText(/配置写入失败/)).toBeTruthy();
    const next = { endpoint: "https://next.example.com/mcp" };
    vi.mocked(saveConnectionSettings).mockResolvedValueOnce();
    vi.mocked(loadSnapshot).mockResolvedValue({ ...data, settings: next });
    await user.click(screen.getByRole("button", { name: "重试自动保存" }));
    await screen.findByText("设置已保存并生效。", {}, { timeout: 3500 });
    expect(saveConnectionSettings).toHaveBeenLastCalledWith(next);
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "保存配置" })).toBeNull();
    expect(screen.queryByRole("button", { name: "管理工作来源" })).toBeNull();
  });

  it("配置已保存但回读失败时停止旧快照同步，重试后恢复最新数据", async () => {
    const settings = {
      endpoint: "https://project.feishu.cn/mcp_server/v1"
    };
    const data = { ...snapshot(), settings, capabilities: { workflow: true, incremental_sync: true } };
    vi.mocked(loadSnapshot).mockResolvedValueOnce(data)
      .mockRejectedValueOnce({ kind: "store", message: "目标缓存暂时被占用" });
    vi.mocked(saveConnectionSettings).mockResolvedValueOnce();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    await user.click(screen.getByRole("button", { name: "连接与配置" }));
    fireEvent.change(screen.getByLabelText("MCP 服务地址"), { target: { value: "https://next.example.com/mcp" } });
    await screen.findByText(/配置已保存，但页面刷新失败/);
    await user.click(screen.getByRole("button", { name: /我的工作/ }));
    expect(screen.queryByText("需求甲")).toBeNull();
    expect((screen.getByRole("button", { name: "立即刷新" }) as HTMLButtonElement).disabled).toBe(true);
    vi.useFakeTimers();
    await tick(600000);
    expect(syncTodos).not.toHaveBeenCalled();
    vi.useRealTimers();
    const targetItem = { ...data.items[0], name: "目标数据库事项" };
    vi.mocked(loadSnapshot).mockResolvedValue({ ...data, settings: { endpoint: "https://next.example.com/mcp" }, items: [targetItem] });
    await user.click(screen.getByRole("button", { name: "重试刷新页面" }));
    await screen.findByText("目标数据库事项");
    expect(screen.queryByText("需求甲")).toBeNull();
    expect(screen.queryByRole("button", { name: "重试刷新页面" })).toBeNull();
  });

  it("输入后立即用快捷键离开设置页仍自动保存，回到设置页显示新值", async () => {
    const settings = { endpoint: "https://project.feishu.cn/mcp_server/v1" };
    const next = { endpoint: "https://next.example.com/mcp" };
    vi.mocked(loadSnapshot).mockResolvedValue({ ...snapshot(), settings });
    vi.mocked(saveConnectionSettings).mockResolvedValue();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    await user.click(screen.getByRole("button", { name: "连接与配置" }));
    fireEvent.change(screen.getByLabelText("MCP 服务地址"), { target: { value: next.endpoint } });
    vi.mocked(loadSnapshot).mockResolvedValue({ ...snapshot(), settings: next });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("region", { name: "工作清单" })).toBeTruthy();
    await waitFor(() => expect(saveConnectionSettings).toHaveBeenCalledExactlyOnceWith(next));
    await user.click(screen.getByRole("button", { name: "连接与配置" }));
    await waitFor(() =>
      expect((screen.getByLabelText("MCP 服务地址") as HTMLInputElement).value).toBe(next.endpoint),
    );
    expect(await screen.findByText("设置已保存并生效。", {}, { timeout: 3500 })).toBeTruthy();
  });

  it("保存失败不显示成功，保留旧凭证摘要，离开配置页清空输入", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    await user.click(screen.getByRole("button", { name: "连接与配置" }));
    const input = screen.getByLabelText("MCP Token") as HTMLInputElement;
    expect(
      (screen.getByRole("button", { name: "保存 Token" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    vi.mocked(saveToken).mockRejectedValue({
      kind: "credential",
      message: "加密失败",
    });
    await user.type(input, "test-secret");
    await user.click(screen.getByRole("button", { name: "保存 Token" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "加密失败",
    );
    expect(screen.queryByText("Token 已保存，可以检查连接。")).toBeNull();
    expect(screen.queryByText("设置已保存并生效。")).toBeNull();
    expect(screen.getByText("环境变量")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "工作来源" }));
    await user.click(screen.getByRole("button", { name: "连接与配置" }));
    expect((screen.getByLabelText("MCP Token") as HTMLInputElement).value).toBe(
      "",
    );
  });
  it("从其他页面按 Ctrl K 返回清单并聚焦搜索", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    await user.click(screen.getByRole("button", { name: "工作来源" }));
    await user.keyboard("{Control>}k{/Control}");
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "搜索工作" }),
    );
  });
  it("多个来源时要求选择，未完成报告不显示成功且回读缓存", async () => {
    const user = userEvent.setup();
    render(<App />);
    const sync = await screen.findByRole("button", { name: "立即刷新" });
    expect((sync as HTMLButtonElement).disabled).toBe(true);
    await chooseOption(user, "显示来源", "source-b");
    vi.mocked(syncTodos).mockResolvedValue({
      status: "failed",
      complete: false,
      items_upserted: 1,
      items_inserted: 1,
      items_updated: 0,
      items_rejected: 0,
      stop_reason: "max_pages",
    });
    await user.click(sync);
    expect(syncTodos).toHaveBeenCalledWith("source-b", false);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("同步未完成"),
    );
    await waitFor(() => expect(loadSnapshot).toHaveBeenCalledTimes(2));
    expect(screen.getByText("需求甲")).toBeTruthy();
  });

  it("异常时回读部分结果和失败记录，保留旧缓存", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    await chooseOption(user, "显示来源", "source-a");
    vi.mocked(syncTodos).mockRejectedValue({
      kind: "connection",
      message: "连接中断",
    });
    await user.click(screen.getByRole("button", { name: "立即刷新" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("连接中断"),
    );
    await waitFor(() => expect(loadSnapshot).toHaveBeenCalledTimes(2));
    expect(screen.getByText("缺陷乙")).toBeTruthy();
  });

  it("相同事项编号不会串空间，详情分别显示节点与状态，搜索可清除", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /缺陷乙/ }));
    const detail = screen.getByRole("complementary", { name: "事项详情" });
    expect(detail.textContent).toContain("space-b");
    expect(detail.textContent).toContain("节点 · 研发");
    expect(detail.textContent).toContain("状态 · 待处理");
    expect(detail.textContent).toContain("修复中");
    await user.click(screen.getByRole("button", { name: "关闭详情" }));
    await user.type(
      screen.getByRole("textbox", { name: "搜索工作" }),
      "不存在",
    );
    expect(screen.getByText("没有匹配的工作")).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: "清除筛选" })[0]);
    expect(screen.getByText("缺陷乙")).toBeTruthy();
  });

  it.each(["侧边栏", "顶部栏"])("仅通过%s切换类型不显示清除筛选，清除普通条件保留当前类型", async (entry) => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    const list = screen.getByRole("region", { name: "工作清单" });
    const navigation = entry === "侧边栏"
      ? screen.getByRole("group", { name: "我的类型" })
      : list;
    expect(screen.queryByRole("button", { name: "清除筛选" })).toBeNull();
    await user.click(within(navigation).getByRole("button", { name: /^需求\s*1$/ }));
    expect(within(list).getByText("需求甲")).toBeTruthy();
    expect(within(list).queryByText("缺陷乙")).toBeNull();
    expect(screen.queryByRole("button", { name: "清除筛选" })).toBeNull();

    await chooseOption(user, "空间", "空间甲");
    await user.type(screen.getByRole("textbox", { name: "搜索工作" }), "不存在");
    expect(within(list).getByText("没有匹配的工作")).toBeTruthy();
    await user.click(within(list).getAllByRole("button", { name: "清除筛选" })[0]);
    expect(screen.getByRole("combobox", { name: "空间" }).textContent).toBe("全部空间");
    expect((screen.getByRole("textbox", { name: "搜索工作" }) as HTMLInputElement).value).toBe("");
    expect(within(list).getByText("需求甲")).toBeTruthy();
    expect(within(list).queryByText("缺陷乙")).toBeNull();
    expect(within(list).getByRole("button", { name: /^需求\s*1$/ }).classList.contains("active")).toBe(true);
    expect(screen.queryByRole("button", { name: "清除筛选" })).toBeNull();
    await user.click(within(list).getByRole("button", { name: /^全部工作/ }));
    expect(within(list).getByText("缺陷乙")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "清除筛选" })).toBeNull();
  });

  it("侧栏类型可拖动或用 Alt+方向键排序，并按类型标识着色", async () => {
    vi.mocked(saveTypeOrder).mockResolvedValue(undefined);
    render(<App />);
    await screen.findByText("需求甲");
    const nav = () => screen.getByRole("group", { name: "我的类型" });
    const sidebarType = (name: RegExp) =>
      within(nav()).getByRole("button", { name });
    const story = sidebarType(/^需求/);
    const issue = sidebarType(/^缺陷/);
    expect(story.style.getPropertyValue("--type-color")).toBe(typeColor("story"));
    expect(issue.style.getPropertyValue("--type-color")).toBe(typeColor("issue"));

    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), types: [] };
    fireEvent.dragStart(issue, { dataTransfer });
    fireEvent.dragOver(story, { dataTransfer });
    fireEvent.drop(story, { dataTransfer });
    await waitFor(() =>
      expect(saveTypeOrder).toHaveBeenCalledWith(["issue", "story"], false),
    );
    await waitFor(() =>
      expect(
        within(nav())
          .getAllByRole("button")
          .map((button) => button.textContent),
      ).toEqual(["缺陷1", "需求1"]),
    );

    fireEvent.keyDown(sidebarType(/^缺陷/), { key: "ArrowDown", altKey: true });
    await waitFor(() =>
      expect(saveTypeOrder).toHaveBeenLastCalledWith(["story", "issue"], false),
    );
  });

  it("类型别名持久化且不改变原始标识，取消勾选仅隐藏相应类型", async () => {
    const user = userEvent.setup();
    const app = render(<App />);
    await screen.findByText("需求甲");
    await user.click(screen.getByRole("button", { name: "工作来源" }));
    await user.click(screen.getByRole("radio", { name: "source-a" }));
    await user.type(screen.getByLabelText("需求的显示别名"), "产品研发");
    expect(JSON.parse(localStorage.getItem("fstodo.source-type-preferences.v2")!)["source-a"].story.alias).toBe("产品研发");
    await user.click(screen.getByRole("switch", { name: "缺陷在清单中显示" }));
    await user.click(screen.getByRole("button", { name: /我的工作/ }));
    expect(screen.queryByText("缺陷乙")).toBeNull();
    await user.click(screen.getByRole("button", { name: /需求甲/ }));
    const detail = screen.getByRole("complementary", { name: "事项详情" });
    expect(detail.textContent).toContain("产品研发");
    expect(detail.textContent).toContain("story");
    expect(getWorkflowActions).not.toHaveBeenCalled();
    app.unmount();
    render(<App />);
    await screen.findByText("需求甲");
    await chooseOption(user, "显示来源", "source-a");
    expect(screen.queryByText("缺陷乙")).toBeNull();
    expect(screen.getAllByText("产品研发").length).toBeGreaterThan(0);
  });

  it("流程动作由服务返回，必填后确认才提交原始身份并回读", async () => {
    vi.mocked(loadSnapshot).mockResolvedValue({
      ...snapshot(),
      capabilities: { workflow: true },
    });
    vi.mocked(getWorkflowActions).mockResolvedValue({
      version: "v1",
      actions: [
        {
          id: "rollback-node",
          label: "回滚研发节点",
          kind: "node",
          fields: [
            {
              key: "reason",
              label: "回滚原因",
              kind: "textarea",
              required: true,
            },
          ],
        },
      ],
    });
    vi.mocked(executeWorkflowAction).mockResolvedValue({
      outcome: "verified",
      verified: true,
      message: "回滚已核验",
      request_id: "req-0",
      action_id: "rollback-node",
      resynced: true,
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /需求甲/ }));
    await user.click(
      await screen.findByRole("button", { name: "回滚研发节点" }),
    );
    expect(executeWorkflowAction).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: "提交" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.type(screen.getByLabelText("回滚原因（必填）"), "需要调整方案");
    await user.click(screen.getByRole("button", { name: "提交" }));
    await user.click(await screen.findByLabelText("我已核对填写内容，理解提交后的修改限制"));
    await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
    expect(await screen.findByRole("status")).toHaveProperty(
      "textContent",
      "回滚已核验",
    );
    expect(executeWorkflowAction).toHaveBeenCalledOnce();
    expect(executeWorkflowAction).toHaveBeenCalledWith(
      expect.objectContaining({
        item_id: {
          project_key: "space-a",
          work_item_type_key: "story",
          work_item_id: "same-id",
        },
        action_id: "rollback-node",
        version: "v1",
        fields: { reason: "需要调整方案" },
        request_id: expect.any(String),
      }),
    );
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });

  it("结果不确定时既不报成功，也不催用户重试", async () => {
    vi.mocked(loadSnapshot).mockResolvedValue({
      ...snapshot(),
      capabilities: { workflow: true },
    });
    vi.mocked(getWorkflowActions).mockResolvedValue({
      version: "v1",
      actions: [
        {
          id: "state:1:DONE",
          label: "流转到已关闭",
          kind: "state",
          fields: [],
        },
      ],
    });
    vi.mocked(executeWorkflowAction).mockResolvedValue({
      outcome: "unknown",
      verified: false,
      message:
        "写请求已发出，但没能回读核验。请先在飞书核对该事项，不要直接重试。",
      request_id: "req-1",
      action_id: "state:1:DONE",
      resynced: false,
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /需求甲/ }));
    await user.click(
      await screen.findByRole("button", { name: "流转到已关闭" }),
    );
    await user.click(screen.getByRole("button", { name: "提交" }));
    await user.click(await screen.findByLabelText("我已核对填写内容，理解提交后的修改限制"));
    await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("不要直接重试");
    expect(alert.textContent).not.toContain("成功");
  });

  it("旧后端不支持流程能力时提示更新且不发起动作请求", async () => {
    vi.mocked(loadSnapshot).mockResolvedValue({
      ...snapshot(),
      capabilities: { workflow: false },
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /需求甲/ }));
    const detail = screen.getByRole("complementary", { name: "事项详情" });
    expect(detail.textContent).toContain("请更新桌面应用后重试");
    expect(getWorkflowActions).not.toHaveBeenCalled();
  });

  it("动作明确失败按失败呈现，不与结果不确定混为一谈", async () => {
    vi.mocked(loadSnapshot).mockResolvedValue({
      ...snapshot(),
      capabilities: { workflow: true },
    });
    vi.mocked(getWorkflowActions).mockResolvedValue({
      version: "v1",
      actions: [
        {
          id: "state:1:DONE",
          label: "流转到已关闭",
          kind: "state",
          fields: [],
        },
      ],
    });
    vi.mocked(executeWorkflowAction).mockResolvedValue({
      outcome: "failed",
      verified: false,
      message: "服务端拒绝了这次流转：目标状态已不存在。",
      request_id: "req-2",
      action_id: "state:1:DONE",
      resynced: false,
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /需求甲/ }));
    await user.click(
      await screen.findByRole("button", { name: "流转到已关闭" }),
    );
    await user.click(screen.getByRole("button", { name: "提交" }));
    await user.click(await screen.findByLabelText("我已核对填写内容，理解提交后的修改限制"));
    await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("服务端拒绝了这次流转");
    expect(alert.textContent).toContain("动作执行失败");
    expect(alert.textContent).not.toContain("不要直接重试");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("写后回读缓存失败不得吞掉写入结论", async () => {
    // 「写请求已发出、结果不确定」是本轮最不能丢的一句话。回读失败只是本地列表没刷新，
    // 不能顶掉结论，也不能把回读再跑一遍。
    vi.mocked(loadSnapshot)
      .mockResolvedValueOnce({
        ...snapshot(),
        capabilities: { workflow: true },
      })
      .mockRejectedValueOnce({ kind: "store", message: "本地缓存被占用" });
    vi.mocked(getWorkflowActions).mockResolvedValue({
      version: "v1",
      actions: [
        {
          id: "state:1:DONE",
          label: "流转到已关闭",
          kind: "state",
          fields: [],
        },
      ],
    });
    vi.mocked(executeWorkflowAction).mockResolvedValue({
      outcome: "unknown",
      verified: false,
      message:
        "写请求已发出，但没能回读核验。请先在飞书核对该事项，不要直接重试。",
      request_id: "req-3",
      action_id: "state:1:DONE",
      resynced: false,
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /需求甲/ }));
    await user.click(
      await screen.findByRole("button", { name: "流转到已关闭" }),
    );
    await user.click(screen.getByRole("button", { name: "提交" }));
    await user.click(await screen.findByLabelText("我已核对填写内容，理解提交后的修改限制"));
    await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("不要直接重试");
    expect(alert.textContent).toContain("本地缓存被占用");
    expect(alert.textContent).not.toContain("成功");
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });
});

const successfulReport = {
  status: "success" as const,
  complete: true,
  items_upserted: 2,
  items_inserted: 0,
  items_updated: 2,
  items_rejected: 0,
  stop_reason: "total_reached",
};
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function timedApp() {
  vi.useFakeTimers();
  render(<App />);
  await act(async () => {});
  await act(async () => {
    fireEvent.click(screen.getByRole("combobox", { name: "显示来源" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("option", { name: "source-a" }));
  });
}

describe("同步与流程独立执行", () => {
  const workflowResult: WorkflowResult = {
    outcome: "verified",
    verified: true,
    message: "节点推进已核验",
    request_id: "request",
    action_id: "confirm",
    resynced: true,
  };

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    return { promise, resolve, reject };
  }

  function setup(details = false) {
    const data = snapshot();
    data.sources = [data.sources[0]];
    data.capabilities = { workflow: true, details };
    vi.mocked(loadSnapshot).mockResolvedValue(data);
    vi.mocked(getWorkflowActions).mockResolvedValue({
      version: "v1",
      actions: [{ id: "confirm", label: "完成研发节点", kind: "node", fields: [] }],
    });
    return data;
  }

  async function submit(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: /需求甲/ }));
    await user.click(await screen.findByRole("button", { name: "完成研发节点" }));
    await user.click(screen.getByRole("button", { name: "提交" }));
    await user.click(screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"));
    await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));
    expect(executeWorkflowAction).toHaveBeenCalledOnce();
  }

  it.each([
    [true, true], [true, false], [false, true], [false, false],
  ])("双向并行且只释放自己的锁（同步先启动=%s，流程先结束=%s）", async (syncFirst, workflowFinishesFirst) => {
    setup();
    const sync = deferred<typeof successfulReport>();
    const workflow = deferred<WorkflowResult>();
    vi.mocked(syncTodos).mockReturnValueOnce(sync.promise).mockResolvedValue(successfulReport);
    vi.mocked(executeWorkflowAction).mockReturnValue(workflow.promise);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    if (syncFirst) await user.click(screen.getByRole("button", { name: "立即刷新" }));
    await submit(user);
    if (!syncFirst) await user.click(screen.getByRole("button", { name: "立即刷新" }));
    expect(syncTodos).toHaveBeenCalledOnce();
    // 重复点击不能重入同步，也不能重复发出正式写入。
    fireEvent.click(screen.getByRole("button", { name: "正在同步" }));
    fireEvent.click(screen.getByRole("button", { name: "正在提交…" }));
    expect(syncTodos).toHaveBeenCalledOnce();
    expect(executeWorkflowAction).toHaveBeenCalledOnce();

    if (workflowFinishesFirst) {
      await act(async () => workflow.resolve(workflowResult));
      expect(screen.getByRole("status").textContent).toBe("节点推进已核验");
      expect((screen.getByRole("button", { name: "正在同步" }) as HTMLButtonElement).disabled).toBe(true);
      await act(async () => sync.resolve(successfulReport));
      expect(screen.getByRole("status").textContent).toBe("节点推进已核验");
    } else {
      await act(async () => sync.resolve(successfulReport));
      expect((screen.getByRole("button", { name: "立即刷新" }) as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByRole("button", { name: "正在提交…" }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByText(/同步完成，新增/)).toBeNull();
      await act(async () => workflow.resolve(workflowResult));
      expect(screen.getByRole("status").textContent).toBe("节点推进已核验");
    }
    await user.click(screen.getByRole("button", { name: "立即刷新" }));
    await waitFor(() => expect(syncTodos).toHaveBeenCalledTimes(2));
    expect(executeWorkflowAction).toHaveBeenCalledOnce();
  });

  it("并行同步失败不会清除流程核验成功的提示", async () => {
    setup();
    const sync = deferred<typeof successfulReport>();
    vi.mocked(syncTodos).mockReturnValue(sync.promise);
    vi.mocked(executeWorkflowAction).mockResolvedValue(workflowResult);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "立即刷新" }));
    await submit(user);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("节点推进已核验"));
    await act(async () => sync.reject({ kind: "connection", message: "同步网络失败" }));
    expect(screen.getByRole("status").textContent).toBe("节点推进已核验");
    expect(screen.getByText("同步网络失败")).toBeTruthy();
  });

  it.each(["verified", "unknown"] as const)("流程结论 %s 已到但缓存回读未结束时，同步不能清除结论", async (outcome) => {
    const data = setup();
    const cache = deferred<Snapshot>();
    vi.mocked(loadSnapshot).mockResolvedValueOnce(data).mockReturnValueOnce(cache.promise).mockResolvedValue(data);
    vi.mocked(syncTodos).mockResolvedValue(successfulReport);
    const message = outcome === "unknown" ? "写入结果不确定，请先核对飞书状态" : workflowResult.message;
    vi.mocked(executeWorkflowAction).mockResolvedValue({ ...workflowResult, outcome, message, verified: outcome === "verified" });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    await submit(user);
    const conclusion = () => screen.getByText(message).closest('[role]')?.textContent;
    await waitFor(() => expect(conclusion()).toContain(message));
    await user.click(screen.getByRole("button", { name: "立即刷新" }));
    await waitFor(() => expect(loadSnapshot).toHaveBeenCalledTimes(3));
    expect(conclusion()).toContain(message);
    expect(screen.queryByText(/同步完成，新增/)).toBeNull();
    await act(async () => cache.resolve(data));
    expect(conclusion()).toContain(message);
    expect(executeWorkflowAction).toHaveBeenCalledOnce();
  });

  it("流程提交等待期间仍按时自动同步", async () => {
    setup();
    const workflow = deferred<WorkflowResult>();
    vi.mocked(executeWorkflowAction).mockReturnValue(workflow.promise);
    vi.mocked(syncTodos).mockResolvedValue(successfulReport);
    vi.useFakeTimers();
    render(<App />);
    await act(async () => {});
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /需求甲/ })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "完成研发节点" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "提交" })));
    fireEvent.click(screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ })));
    expect(executeWorkflowAction).toHaveBeenCalledOnce();
    await tick(120000);
    expect(syncTodos).toHaveBeenCalledWith("source-a", true);
    expect((screen.getByRole("button", { name: "正在提交…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/同步完成，新增/)).toBeNull();
    await act(async () => workflow.resolve(workflowResult));
    expect(screen.getByRole("status").textContent).toBe("节点推进已核验");
  });

  it("同步与动作读取尚未结束时，打开事项仍独立显示完整详情", async () => {
    const data = setup(true);
    const sync = deferred<typeof successfulReport>();
    const actions = deferred<Awaited<ReturnType<typeof getWorkflowActions>>>();
    vi.mocked(syncTodos).mockReturnValue(sync.promise);
    vi.mocked(getWorkflowActions).mockReturnValue(actions.promise);
    vi.mocked(cachedItemDetail).mockResolvedValue(null);
    const detail: ItemDetail = {
      id: data.items[0].id,
      fetched_at_ms: 1,
      data: {
        work_item_attribute: {},
        work_item_fields: [{ key: "description", name: "描述", value: "独立取得的事项详情" }],
      },
      pages: [],
    };
    vi.mocked(refreshItemDetail).mockResolvedValue(detail);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "立即刷新" }));
    await user.click(screen.getByRole("button", { name: /需求甲/ }));
    expect(await screen.findByText("独立取得的事项详情")).toBeTruthy();
    expect(screen.getByText("正在读取可用动作…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "正在同步" })).toBeTruthy();
    await act(async () => {
      actions.resolve({ version: "v1", actions: [] });
      sync.resolve(successfulReport);
    });
  });
});
describe("栏目切换回顶过渡", () => {
  afterEach(() => {
    document.documentElement.scrollTop = 0;
    vi.unstubAllGlobals();
  });

  it("首帧时间早于动画起点时不会先向下跳动", async () => {
    await timedApp();
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    document.documentElement.scrollTop = 1200;
    fireEvent.click(screen.getAllByRole("button", { name: /^缺陷\s*1$/ })[1]);

    await act(async () => frame!(performance.now() - 100));
    expect(document.documentElement.scrollTop).toBe(1200);
    expect(screen.getByText("需求甲")).toBeTruthy();

    await act(async () => frame!(performance.now() + 400));
    expect(document.documentElement.scrollTop).toBe(0);
    expect(screen.queryByText("需求甲")).toBeNull();
    expect(screen.getByText("缺陷乙")).toBeTruthy();
  });

  it.each([0, 1])("入口 %i 先平滑回顶，再用短清单替换长清单", async (entry) => {
    const data = snapshot();
    data.items = [
      ...Array.from({ length: 30 }, (_, index) =>
        item(`space-${index}`, `需求 ${index}`),
      ),
      item("issue-space", "缺陷乙", "issue"),
    ];
    vi.mocked(loadSnapshot).mockResolvedValue(data);
    await timedApp();
    document.documentElement.scrollTop = 1200;

    fireEvent.click(
      screen.getAllByRole("button", { name: /^缺陷\s*1$/ })[entry],
    );
    expect(document.documentElement.scrollTop).toBe(1200);
    expect(screen.getByText("需求 0")).toBeTruthy();
    await tick(160);
    expect(document.documentElement.scrollTop).toBeGreaterThan(0);
    expect(document.documentElement.scrollTop).toBeLessThan(1200);
    expect(screen.getByText("需求 0")).toBeTruthy();

    await tick(300);
    expect(document.documentElement.scrollTop).toBe(0);
    expect(screen.queryByText("需求 0")).toBeNull();
    expect(screen.getByText("缺陷乙")).toBeTruthy();
  });

  it("快速切换以最后一次选择为准，离开工作页会取消未完成的切换", async () => {
    await timedApp();
    document.documentElement.scrollTop = 1200;
    fireEvent.click(screen.getAllByRole("button", { name: /^缺陷\s*1$/ })[0]);
    await tick(100);
    fireEvent.click(screen.getAllByRole("button", { name: /^需求\s*1$/ })[1]);
    await tick(500);
    expect(screen.getByText("需求甲")).toBeTruthy();
    expect(screen.queryByText("缺陷乙")).toBeNull();

    document.documentElement.scrollTop = 1200;
    fireEvent.click(screen.getAllByRole("button", { name: /^缺陷\s*1$/ })[1]);
    await tick(100);
    fireEvent.click(screen.getByRole("button", { name: "工作来源" }));
    const stoppedAt = document.documentElement.scrollTop;
    await tick(500);
    expect(document.documentElement.scrollTop).toBe(stoppedAt);
    fireEvent.click(screen.getByRole("button", { name: /我的工作/ }));
    expect(screen.getByText("需求甲")).toBeTruthy();
    expect(screen.getByText("缺陷乙")).toBeTruthy();
  });

  it("已在顶部时立即切换，侧栏将应用版本与飞书 MCP 驱动分行显示", async () => {
    render(<App />);
    await screen.findByText("需求甲");
    fireEvent.click(screen.getAllByRole("button", { name: /^缺陷\s*1$/ })[1]);
    expect(screen.queryByText("需求甲")).toBeNull();
    expect(screen.getByText("缺陷乙")).toBeTruthy();
    expect(screen.getByText("飞书 MCP 驱动")).toBeTruthy();
    expect(screen.getByText(`FSTODO v${__APP_VERSION__}`)).toBeTruthy();
    expect(screen.getByText("飞书 MCP 驱动").textContent).toBe("飞书 MCP 驱动");
    fireEvent.click(screen.getByRole("button", { name: /^全部工作/ }));
    expect(screen.getByText("需求甲")).toBeTruthy();
  });

  it("系统要求减少动态效果时立即回顶并切换", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<App />);
    await screen.findByText("需求甲");
    document.documentElement.scrollTop = 1200;
    fireEvent.click(screen.getAllByRole("button", { name: /^缺陷\s*1$/ })[0]);
    expect(document.documentElement.scrollTop).toBe(0);
    expect(screen.queryByText("需求甲")).toBeNull();
    expect(screen.getByText("缺陷乙")).toBeTruthy();
  });
});

describe("自动同步与提示时序", () => {
  it.each([false, true])("筛选期间同步（自动=%s）按最新条件更新结果并排除不匹配事项", async (automatic) => {
    const data = snapshot();
    const original = { ...item("space-a", "旧目标事项"), source_ids: ["source-a"] };
    const beforeChange = { ...original, name: "旧目标待转事项", id: { ...original.id, work_item_id: "changed-out" } };
    const otherNode = { ...original, id: { ...original.id, work_item_id: "other-node" }, flow: { ...original.flow, node_name: "设计" } };
    const otherState = { ...original, id: { ...original.id, work_item_id: "other-state" }, flow: { ...original.flow, start_state_key_name: "已完成" } };
    data.items = [original, beforeChange, otherNode, otherState];
    data.total = data.items.length;
    vi.mocked(loadSnapshot).mockResolvedValue(data);
    let finishSync!: (report: typeof successfulReport) => void;
    vi.mocked(syncTodos).mockReturnValue(new Promise((resolve) => { finishSync = resolve; }));
    await timedApp();
    const choose = async (label: string, option: string) => {
      await act(async () => { fireEvent.click(screen.getByRole("combobox", { name: label })); });
      await act(async () => { fireEvent.click(screen.getByRole("option", { name: option })); });
    };
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /^需求\s*4$/ })[1]); });
    await choose("空间", "空间甲");
    await choose("流程类型", "节点与状态");
    await choose("当前节点", "研发（3）");
    await choose("当前状态", "待处理（2）");
    await act(async () => { fireEvent.change(screen.getByRole("textbox", { name: "搜索工作" }), { target: { value: "旧" } }); });
    expect(screen.getByText("旧目标待转事项")).toBeTruthy();
    expect(screen.getByText("2 条结果")).toBeTruthy();
    if (automatic) await tick(120000);
    else await act(async () => { fireEvent.click(screen.getByRole("button", { name: "立即刷新" })); });
    expect(syncTodos).toHaveBeenCalledWith("source-a", automatic);
    // 同步请求尚未完成时继续修改筛选，回读后应采用此刻的条件。
    await act(async () => { fireEvent.change(screen.getByRole("textbox", { name: "搜索工作" }), { target: { value: "目标" } }); });
    const updated = { ...original, name: "更新后的目标事项" };
    const added = { ...original, name: "新增目标事项", id: { ...original.id, work_item_id: "new" } };
    const changedOut = { ...beforeChange, name: "目标已转设计", flow: { ...original.flow, node_name: "设计" } };
    const nonMatching: CachedItem[] = [
      { ...original, name: "无关键词事项" },
      { ...original, name: "目标其他类型", id: { ...original.id, work_item_type_key: "issue" } },
      { ...original, name: "目标其他空间", id: { ...original.id, project_key: "space-b" } },
      { ...original, name: "目标其他流程", flow: { ...original.flow, kind: "node" as const } },
      { ...original, name: "目标其他状态", flow: { ...original.flow, start_state_key_name: "已完成" } },
      { ...original, name: "目标其他来源", source_ids: ["source-b"] },
    ].map((entry, index) => ({ ...entry, id: { ...entry.id, work_item_id: `excluded-${index}` } }));
    vi.mocked(loadSnapshot).mockResolvedValue({ ...data, items: [updated, added, changedOut, ...nonMatching], total: 9 });
    await act(async () => { finishSync(successfulReport); });
    expect(screen.getByText("更新后的目标事项")).toBeTruthy();
    expect(screen.getByText("新增目标事项")).toBeTruthy();
    expect(screen.queryByText("旧目标事项")).toBeNull();
    expect(screen.queryByText("旧目标待转事项")).toBeNull();
    for (const excluded of [changedOut, ...nonMatching]) expect(screen.queryByText(excluded.name!)).toBeNull();
    expect(screen.getByText("2 条结果")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "搜索工作" }) as HTMLInputElement).value).toBe("目标");
    expect(screen.getByRole("combobox", { name: "空间" }).textContent).toContain("空间甲");
    expect(screen.getByRole("combobox", { name: "当前节点" }).textContent).toContain("研发");
    expect(screen.getByRole("combobox", { name: "当前状态" }).textContent).toContain("待处理");
  });

  it("两分钟自动同步静默，手动成功悬浮5秒后消失", async () => {
    vi.mocked(syncTodos).mockResolvedValue(successfulReport);
    await timedApp();
    await tick(119999);
    expect(syncTodos).not.toHaveBeenCalled();
    await tick(1);
    expect(syncTodos).toHaveBeenCalledTimes(1);
    expect(syncTodos).toHaveBeenLastCalledWith("source-a", true);
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "立即刷新" }));
    });
    expect(screen.getByRole("status").classList.contains("toast")).toBe(true);
    expect(syncTodos).toHaveBeenLastCalledWith("source-a", false);
    await tick(4999);
    expect(screen.getByRole("status")).toBeTruthy();
    await tick(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("连续失败持续按4/8分钟退避，重启继续重试，自动成功恢复两分钟周期", async () => {
    vi.mocked(syncTodos).mockRejectedValue({
      kind: "connection",
      message: "网络中断",
    });
    await timedApp();
    await tick(120000);
    expect(syncTodos).toHaveBeenCalledTimes(1);
    await tick(239999);
    expect(syncTodos).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(syncTodos).toHaveBeenCalledTimes(2);
    await tick(480000);
    expect(syncTodos).toHaveBeenCalledTimes(3);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    await tick(480000);
    expect(syncTodos).toHaveBeenCalledTimes(4);
    await tick(480000);
    expect(syncTodos).toHaveBeenCalledTimes(5);
    cleanup();
    render(<App />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole("combobox", { name: "显示来源" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: "source-a" }));
    });
    await tick(479999);
    expect(syncTodos).toHaveBeenCalledTimes(5);
    vi.mocked(syncTodos).mockResolvedValue(successfulReport);
    await tick(1);
    expect(syncTodos).toHaveBeenCalledTimes(6);
    await tick(120000);
    expect(syncTodos).toHaveBeenCalledTimes(7);
  });

  it("鉴权错误也保留低频检查，关闭失败提示不取消重试", async () => {
    vi.mocked(syncTodos).mockRejectedValue({
      kind: "auth",
      message: "凭证已过期",
    });
    await timedApp();
    await tick(120000);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "关闭同步错误提示" }));
    });
    await tick(240000);
    expect(syncTodos).toHaveBeenCalledTimes(2);
    await tick(480000);
    expect(syncTodos).toHaveBeenCalledTimes(3);
    expect(
      screen.getByText("自动同步将在 8 分钟间隔后重试"),
    ).toBeTruthy();
  });

  it.each(["online", "focus"])("收到 %s 后提前重试失败来源，恢复成功后回到正常周期", async (event) => {
    vi.mocked(syncTodos).mockRejectedValueOnce({ kind: "connection", message: "网络中断" })
      .mockResolvedValue(successfulReport);
    await timedApp();
    await tick(120000);
    expect(syncTodos).toHaveBeenCalledTimes(1);
    await act(async () => { window.dispatchEvent(new Event(event)); });
    await tick(0);
    expect(syncTodos).toHaveBeenCalledTimes(2);
    expect(syncTodos).toHaveBeenLastCalledWith("source-a", true);
    await tick(119999);
    expect(syncTodos).toHaveBeenCalledTimes(2);
    await tick(1);
    expect(syncTodos).toHaveBeenCalledTimes(3);
  });

  it("恢复事件与未完成的重试合并，不启动重叠请求", async () => {
    let finish!: (report: typeof successfulReport) => void;
    vi.mocked(syncTodos).mockRejectedValueOnce({ kind: "connection", message: "网络中断" })
      .mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await timedApp();
    await tick(120000);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await tick(0);
    expect(syncTodos).toHaveBeenCalledTimes(2);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("focus"));
    });
    await tick(600000);
    expect(syncTodos).toHaveBeenCalledTimes(2);
    await act(async () => finish(successfulReport));
    expect(syncTodos).toHaveBeenCalledTimes(2);
  });

  it("同步未结束时不会启动重叠请求", async () => {
    let resolve!: (report: typeof successfulReport) => void;
    vi.mocked(syncTodos).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await timedApp();
    await tick(120000);
    await tick(600000);
    fireEvent.click(screen.getByRole("button", { name: "正在同步" }));
    expect(syncTodos).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(successfulReport);
    });
    await tick(119999);
    expect(syncTodos).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(syncTodos).toHaveBeenCalledTimes(2);
  });
});

describe("所有来源调度与清单 patch", () => {
  function scheduledData() {
    const data = snapshot();
    data.capabilities = { workflow: false, source_queries: true, incremental_sync: true };
    data.items[0].source_ids = ["source-a"];
    data.items[1].source_ids = ["source-b"];
    vi.mocked(loadSnapshot).mockResolvedValue(data);
    return data;
  }
  const patchReport = (ids = ["source-a", "source-b"]) => ({
    ...successfulReport,
    patch: { added: [], modified: [], removed: [] },
    checks: ids.map((source_id) => ({
      source_id, report: successfulReport as typeof successfulReport | null,
      error_kind: null as string | null, error_message: null as string | null,
    })),
  });

  it("手动刷新跟随所选来源，空 patch 明确提示无变化，全部来源仍检查全部", async () => {
    scheduledData();
    // 来源写库统计可以包含中间过程，用户提示以最终 patch 为准。
    vi.mocked(syncTodos).mockResolvedValue({ ...patchReport(), items_updated: 14 });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    await chooseOption(user, "显示来源", "source-a");
    await user.click(screen.getByRole("button", { name: "立即刷新" }));
    expect(syncTodos).toHaveBeenLastCalledWith("*", false, ["source-a"]);
    expect(await screen.findByText("检查完成，数据无变化。")).toBeTruthy();
    expect(screen.getByText("1 条结果")).toBeTruthy();
    await chooseOption(user, "显示来源", "全部来源");
    await user.click(screen.getByRole("button", { name: "立即刷新" }));
    expect(syncTodos).toHaveBeenLastCalledWith("*", false, ["source-a", "source-b"]);
  });

  it("旧后端的全部来源仍可手动刷新", async () => {
    const data = scheduledData();
    data.capabilities!.incremental_sync = false;
    vi.mocked(syncTodos).mockResolvedValue(successfulReport);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "立即刷新" }));
    expect(syncTodos).toHaveBeenCalledWith("*", false);
  });

  it("只补齐节点排期上下文时更新界面但提示无变化，真实改期仍提示更新", async () => {
    const data=scheduledData();
    const shared={...data.items[0], source_ids:["source-a","source-b"],
      personal_schedules:{"source-a":{start_raw:"2026-10-19",end_raw:"2026-10-23"}}};
    vi.mocked(syncTodos).mockResolvedValueOnce({...patchReport(),patch:{added:[],modified:[shared],removed:[],updated_count:0}})
      .mockResolvedValueOnce({...patchReport(),patch:{added:[],modified:[{...shared,
        personal_schedules:{"source-a":{start_raw:"2026-10-20",end_raw:"2026-10-25"}}}],removed:[],updated_count:1}});
    const user=userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    await chooseOption(user,"显示来源","source-a");
    await user.click(screen.getByRole("button",{name:"立即刷新"}));
    expect(await screen.findByText("检查完成，数据无变化。")).toBeTruthy();
    await user.click(screen.getByRole("button",{name:/需求甲需求/}));
    expect(screen.getByText("2026-10-19")).toBeTruthy();
    await user.click(screen.getByRole("button",{name:"关闭详情"}));
    await chooseOption(user,"显示来源","source-b");
    await user.click(screen.getByRole("button",{name:/需求甲需求/}));
    expect(screen.queryByText("2026-10-19")).toBeNull();
    await user.click(screen.getByRole("button",{name:"关闭详情"}));
    await chooseOption(user,"显示来源","source-a");
    await user.click(screen.getByRole("button",{name:"立即刷新"}));
    expect(await screen.findByText("同步完成，新增 0 条、更新 1 条。")).toBeTruthy();
  });

  it("共同事项按显示来源使用本人节点，关联来源与全部来源保留完整流程", async () => {
    const data = scheduledData();
    const shared = data.items[0];
    shared.source_ids = ["source-a", "source-b"];
    shared.flow = { ...shared.flow, kind: "node", node_name: "本人节点 / 其他节点" };
    shared.personal_flows = { "source-a": { ...shared.flow, node_name: "本人节点" } };
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("节点 · 本人节点 / 其他节点");
    await chooseOption(user, "显示来源", "source-a");
    expect(screen.getByText("节点 · 本人节点")).toBeTruthy();
    await chooseOption(user, "显示来源", "source-b");
    expect(screen.getByText("节点 · 本人节点 / 其他节点")).toBeTruthy();
    // 仅在个人来源被选中且完整流程仍为节点流时使用本人节点。
    shared.flow = { ...shared.flow, kind: "state", node_name: null, start_state_key_name: "已完成", end_state_key_name: null };
    vi.mocked(syncTodos).mockResolvedValue({ ...patchReport(), patch: { added: [], modified: [shared], removed: [] } });
    await chooseOption(user, "显示来源", "source-a");
    await user.click(screen.getByRole("button", { name: "立即刷新" }));
    expect(await screen.findByText("状态 · 已完成")).toBeTruthy();
  });

  it("来源设置中选中不可执行来源时禁止手动刷新", async () => {
    const data = scheduledData();
    data.sources[1] = { ...data.sources[1], enabled: false, executable: false };
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "工作来源" }));
    await user.click(screen.getByRole("radio", { name: "source-b" }));
    expect((screen.getByRole("button", { name: "立即刷新" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("停留在 A 时仍调度 B，空 patch 保留选中项、搜索和滚动位置且不全量回读", async () => {
    scheduledData();
    vi.mocked(syncTodos).mockResolvedValue(patchReport());
    vi.useFakeTimers();
    render(<App />);
    await act(async () => {});
    await act(async () => fireEvent.click(screen.getByRole("combobox", { name: "显示来源" })));
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "source-a" })));
    fireEvent.change(screen.getByRole("textbox", { name: "搜索工作" }), { target: { value: "需求" } });
    fireEvent.click(screen.getByRole("button", { name: /需求甲/ }));
    document.documentElement.scrollTop = 340;
    await tick(120000);
    expect(syncTodos).toHaveBeenCalledWith("*", true, ["source-a", "source-b"]);
    expect(loadSnapshot).toHaveBeenCalledOnce();
    expect(screen.getByRole("complementary", { name: "事项详情" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "搜索工作" }) as HTMLInputElement).value).toBe("需求");
    expect(document.documentElement.scrollTop).toBe(340);
    document.documentElement.scrollTop = 0;
  });

  it("来源失败各自退避，其他来源按原周期检查，网络恢复只提前重试失败来源", async () => {
    scheduledData();
    const report = patchReport();
    report.checks[0] = { source_id: "source-a", report: null,
      error_kind: "connection", error_message: "网络中断" };
    vi.mocked(syncTodos).mockResolvedValueOnce(report)
      .mockResolvedValueOnce(patchReport(["source-b"]))
      .mockResolvedValue(patchReport(["source-a"]));
    vi.useFakeTimers();
    render(<App />);
    await act(async () => {});
    await tick(120000);
    await tick(120000);
    expect(syncTodos).toHaveBeenNthCalledWith(2, "*", true, ["source-b"]);
    const policies = JSON.parse(localStorage.getItem("fstodo.sync-policy.v1") || "{}");
    expect(policies["source-a"].failures).toBe(1);
    expect(policies["source-b"].failures).toBe(0);
    expect(policies["source-b"].lastSuccessAt).toBeGreaterThan(0);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await tick(0);
    expect(syncTodos).toHaveBeenNthCalledWith(3, "*", true, ["source-a"]);
  });

  it("历史已暂停来源在重启后重新进入自动检查并保留成功时间", async () => {
    scheduledData();
    const now = Date.now();
    localStorage.setItem("fstodo.sync-policy.v1", JSON.stringify({
      "source-a": { failures: 3, paused: true, nextAt: now + 1000, lastSuccessAt: 123 },
      "source-b": { failures: 4, paused: true, nextAt: now + 1000, lastSuccessAt: 456 },
    }));
    vi.mocked(syncTodos).mockResolvedValue(patchReport());
    vi.useFakeTimers();
    render(<App />);
    await act(async () => {});
    const policies = JSON.parse(localStorage.getItem("fstodo.sync-policy.v1") || "{}");
    expect(policies["source-a"].lastSuccessAt).toBe(123);
    expect(policies["source-b"].lastSuccessAt).toBe(456);
    await tick(1000);
    expect(syncTodos).toHaveBeenCalledOnce();
    expect(syncTodos).toHaveBeenCalledWith("*", true, ["source-a", "source-b"]);
  });

  it("自动检查 A 时立即刷新合并 A 并补查 B，多次点击不重复请求", async () => {
    scheduledData();
    const now = Date.now();
    localStorage.setItem("fstodo.sync-policy.v1", JSON.stringify({
      "source-a": { failures: 0, paused: false, nextAt: now + 120000 },
      "source-b": { failures: 0, paused: false, nextAt: now + 240000 },
    }));
    let resolve!: (report: ReturnType<typeof patchReport>) => void;
    vi.mocked(syncTodos).mockReturnValueOnce(new Promise((done) => { resolve = done; }))
      .mockResolvedValue(patchReport());
    vi.useFakeTimers();
    render(<App />);
    await act(async () => {});
    await tick(120000);
    expect(syncTodos).toHaveBeenCalledWith("*", true, ["source-a"]);
    fireEvent.click(screen.getByRole("button", { name: "正在同步" }));
    fireEvent.click(screen.getByRole("button", { name: "正在同步" }));
    await act(async () => resolve(patchReport()));
    expect(syncTodos).toHaveBeenCalledTimes(2);
    expect(syncTodos).toHaveBeenLastCalledWith("*", false, ["source-b"]);
  });

  it("patch 按空间类型编号合并修改和移除，保留同号的另一个事项", async () => {
    const data = scheduledData();
    const changed = { ...data.items[1], name: "缺陷已更新" };
    vi.mocked(syncTodos).mockResolvedValue({ ...patchReport(),
      patch: { added: [], modified: [changed], removed: [data.items[0].id] } });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "立即刷新" }));
    expect(await screen.findByText("缺陷已更新")).toBeTruthy();
    expect(screen.queryByText("需求甲")).toBeNull();
    expect(loadSnapshot).toHaveBeenCalledOnce();
  });
});
