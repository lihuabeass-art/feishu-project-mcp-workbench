// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { executeWorkflowAction, getWorkflowActions, loadSnapshot } from "./api";
import type { CachedItem, Snapshot, WorkflowResult } from "./types";

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

function item(id: string, name: string, kind = "story", flow: CachedItem["flow"]["kind"] = "node"): CachedItem {
  return {
    id: { project_key: "space-a", work_item_type_key: kind, work_item_id: id },
    name,
    project_name: "空间甲",
    flow: {
      kind: flow,
      node_name: flow === "node" ? "研发中" : null,
      node_state_key: null,
      start_state_key_name: flow === "state" ? "待处理" : null,
      end_state_key_name: null,
    },
    schedule: { start_raw: null, end_raw: null },
    raw_json: "{}",
    identity_missing_flags: [],
    first_seen_at_ms: 1,
    last_seen_at_ms: 2,
    seen_count: 1,
    updated_at_ms: Number(id),
  };
}

function snapshot(): Snapshot {
  return {
    items: [item("2", "需求甲"), item("1", "缺陷乙", "issue", "state")],
    total: 2,
    last_success: null,
    runs: [],
    sources: [{
      id: "source-a",
      kind: "personal_todo",
      enabled: true,
      executable: true,
      reason: null,
      action: "todo",
      todo_scope: "in_progress",
    }],
    config_path: "config.toml",
    db_path: "cache.db",
    credential_ready: true,
    credential_description: "环境变量",
  };
}

async function enterListMode(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("需求甲");
  await user.click(screen.getByRole("button", { name: "切换到清单模式" }));
  return screen.getByRole("region", { name: "工作清单" });
}

const rowNamed = (list: HTMLElement, text: string) =>
  within(list).getByText(text).closest("button") as HTMLButtonElement;

async function chooseFilter(user: ReturnType<typeof userEvent.setup>, name: string, value: string) {
  await user.click(screen.getByRole("combobox", { name }));
  await user.click(screen.getByRole("option", { name: value }));
  await user.keyboard("{Escape}");
}

function filterSnapshot(): Snapshot {
  const data = snapshot();
  const pending = { ...item("4", "需求甲"), is_completed: false,
    related_projects: [{ field_key: "project", id: "shared", name: "项目甲" }] };
  const done = { ...item("3", "已完成缺陷", "issue", "state"), is_completed: true,
    related_projects: pending.related_projects };
  const otherSpace = { ...item("2", "跨空间需求"), is_completed: null,
    id: { ...pending.id, project_key: "space-b", work_item_id: "2" },
    project_name: "空间乙",
    related_projects: [{ field_key: "project", id: "shared", name: "项目乙" }] };
  data.items = [pending, done, otherSpace, item("1", "未归项目缺陷", "issue")];
  data.total = data.items.length;
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(loadSnapshot).mockResolvedValue(snapshot());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("清单模式", () => {
  it("在同一窗口切换为紧凑清单，隐藏完整布局，并在重新打开时恢复所选模式", async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    const list = await enterListMode(user);

    expect(screen.queryByRole("navigation", { name: "主要导航" })).toBeNull();
    expect(screen.getByRole("heading", { name: "我的工作2" })).toBeTruthy();
    expect(within(list).getAllByRole("button").map((row) => row.textContent)).toEqual([
      "需求需求甲节点 · 研发中",
      "缺陷缺陷乙状态 · 待处理",
    ]);
    expect(screen.queryByRole("button", { name: "关闭" })).toBeNull();

    view.unmount();
    render(<App />);
    expect(await screen.findByRole("region", { name: "工作清单" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "切换到完整模式" }));
    expect(screen.getByRole("navigation", { name: "主要导航" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "切换到完整模式" })).toBeNull();
  });

  it("切到清单以 Tab 继承类型，搜索独立显示，返回完整模式继续使用", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    await user.type(screen.getByRole("textbox", { name: "搜索工作" }), "缺陷");
    await user.click(screen.getAllByRole("button", { name: /^缺陷\s*1$/ })[1]);
    expect(screen.queryByText("需求甲")).toBeNull();
    await user.click(screen.getByRole("button", { name: "切换到清单模式" }));
    const list = screen.getByRole("region", { name: "工作清单" });
    expect(within(list).queryByText("需求甲")).toBeNull();
    expect(within(list).getByText("缺陷乙")).toBeTruthy();
    expect(screen.getByRole("button", { name: "取消搜索：缺陷" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^缺陷\s*1$/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("button", { name: "取消事项类型：缺陷" })).toBeNull();
    expect(screen.getByRole("button", { name: "清单筛选" }).textContent).toBe("筛选1");
    expect(screen.getByText("1 / 2 项")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "取消搜索：缺陷" }));
    expect(within(list).queryByText("需求甲")).toBeNull();
    expect(screen.getByRole("button", { name: "清单筛选" }).textContent).toBe("筛选");
    expect(screen.queryByRole("group", { name: "当前筛选条件" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "切换到完整模式" }));
    expect((screen.getByRole("textbox", { name: "搜索工作" }) as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("combobox", { name: "事项类型" })).toBeNull();
    expect(within(screen.getByRole("group", { name: "我的类型" })).getByRole("button", { name: /^缺陷\s*1$/ }).classList.contains("chosen")).toBe(true);
    expect(screen.queryByText("需求甲")).toBeNull();
  });

  it("筛选从空间开始联动项目，更多条件默认收起并可组合使用", async () => {
    vi.mocked(loadSnapshot).mockResolvedValue(filterSnapshot());
    const user = userEvent.setup();
    render(<App />);
    const list = await enterListMode(user);
    const toggle = screen.getByRole("button", { name: "清单筛选" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("combobox", { name: "清单流程类型" })).toBeNull();
    expect(within(list).getAllByRole("button")).toHaveLength(4);

    await user.click(toggle);
    expect((screen.getByText("更多条件").closest("details") as HTMLDetailsElement).open).toBe(false);
    await chooseFilter(user, "清单空间", "空间甲");
    expect(within(list).getAllByRole("button")).toHaveLength(3);
    await user.click(screen.getByRole("combobox", { name: "清单所属项目" }));
    expect(screen.queryByRole("option", { name: "项目乙" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "项目甲" }));
    await user.keyboard("{Escape}");
    expect(within(list).getAllByRole("button")).toHaveLength(2);
    await user.click(screen.getByText("更多条件"));
    expect(screen.queryByRole("combobox", { name: "清单事项类型" })).toBeNull();
    expect(screen.queryByText("全部类型")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "清单完成情况" })).toBeNull();
    await chooseFilter(user, "清单流程类型", "节点流");
    expect(within(list).getAllByRole("button")).toHaveLength(1);
    expect(within(list).getByText("需求甲")).toBeTruthy();
    expect(screen.getByText("1 / 4 项")).toBeTruthy();
    expect(toggle.textContent).toBe("筛选3");

    await user.click(toggle);
    expect(screen.queryByRole("combobox", { name: "清单流程类型" })).toBeNull();
    expect(within(list).getAllByRole("button")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "清除" }));
    expect(within(list).getAllByRole("button")).toHaveLength(4);
    expect(toggle.textContent).toBe("筛选");
  });

  it("支持流程筛选和未提供所属项目，无匹配时可一键清除", async () => {
    vi.mocked(loadSnapshot).mockResolvedValue(filterSnapshot());
    const user = userEvent.setup();
    render(<App />);
    const list = await enterListMode(user);
    await user.click(screen.getByRole("button", { name: "清单筛选" }));
    await user.click(screen.getByText("更多条件"));
    await chooseFilter(user, "清单流程类型", "状态流");
    expect(within(list).getAllByRole("button")).toHaveLength(1);
    expect(within(list).getByText("已完成缺陷")).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: "清单搜索工作" }), "需求");
    expect(within(list).getByText("没有符合条件的事项")).toBeTruthy();
    expect(screen.getByText("0 / 4 项")).toBeTruthy();
    await user.click(within(list).getByRole("button", { name: "清除筛选" }));
    expect(within(list).getAllByRole("button")).toHaveLength(4);
    await chooseFilter(user, "清单所属项目", "未提供所属项目");
    expect(within(list).getAllByRole("button")).toHaveLength(1);
    expect(within(list).getByText("未归项目缺陷")).toBeTruthy();
  });

  it("切换空间或项目会清除下层条件，项目内可继续筛流程和状态", async () => {
    vi.mocked(loadSnapshot).mockResolvedValue(filterSnapshot());
    const user = userEvent.setup();
    render(<App />);
    const list = await enterListMode(user);
    await user.click(screen.getByRole("button", { name: "清单筛选" }));
    await chooseFilter(user, "清单空间", "空间甲");
    await chooseFilter(user, "清单所属项目", "项目甲");
    await user.click(screen.getByText("更多条件"));
    await chooseFilter(user, "清单当前状态", "待处理（1）");
    expect(within(list).getAllByRole("button")).toHaveLength(1);
    expect(within(list).getByText("已完成缺陷")).toBeTruthy();
    await chooseFilter(user, "清单所属项目", "全部项目");
    expect(within(list).getAllByRole("button")).toHaveLength(3);
    await chooseFilter(user, "清单所属项目", "项目甲");
    await chooseFilter(user, "清单流程类型", "状态流");
    expect(within(list).getAllByRole("button")).toHaveLength(1);
    await chooseFilter(user, "清单空间", "全部空间");
    await chooseFilter(user, "清单空间", "空间乙");
    expect(screen.getByRole("combobox", { name: "清单所属项目" }).textContent).toContain("全部项目");
    expect(screen.getByRole("combobox", { name: "清单流程类型" }).textContent).toContain("全部流程类型");
    expect(within(list).getByText("跨空间需求")).toBeTruthy();
    expect(screen.getByRole("button", { name: "清单筛选" }).textContent).toBe("筛选1");
    await chooseFilter(user, "清单所属项目", "项目乙");
    expect(within(list).getAllByRole("button")).toHaveLength(1);
  });

  it.each(["空间", "所属项目", "流程类型"])("取消%s标签与下拉取消使用相同的下层清理规则", async (field) => {
    const data = filterSnapshot();
    data.items[2].flow.node_name = "测试";
    vi.mocked(loadSnapshot).mockResolvedValue(data);
    const user = userEvent.setup();
    render(<App />);
    const list = await enterListMode(user);
    await user.click(screen.getByRole("button", { name: "清单筛选" }));
    if (field === "流程类型") {
      await user.click(screen.getByText("更多条件"));
      await chooseFilter(user, "清单流程类型", "节点流");
      await chooseFilter(user, "清单当前节点", "研发中（2）");
      expect(screen.getByRole("button", { name: "取消当前节点：研发中（2）" })).toBeTruthy();
      await user.click(screen.getByRole("button", { name: "取消流程类型：节点流" }));
      expect(screen.queryByRole("button", { name: /取消当前节点/ })).toBeNull();
    } else {
      await chooseFilter(user, "清单空间", "空间甲");
      await chooseFilter(user, "清单所属项目", "项目甲");
      await user.click(screen.getByText("更多条件"));
      await chooseFilter(user, "清单流程类型", "状态流");
      await user.click(screen.getByRole("button", { name: field === "空间" ? "取消空间：空间甲" : "取消所属项目：项目甲" }));
      expect(screen.queryByRole("button", { name: "取消流程类型：状态流" })).toBeNull();
      expect(screen.queryByRole("button", { name: "取消所属项目：项目甲" })).toBeNull();
    }
    expect(within(list).getAllByRole("button")).toHaveLength(field === "所属项目" ? 3 : 4);
  });

  it("本次打开期间两种模式共用搜索和流程条件，重开后全部重置", async () => {
    vi.mocked(loadSnapshot).mockResolvedValue(filterSnapshot());
    const user = userEvent.setup();
    const view = render(<App />);
    await screen.findByText("需求甲");
    await user.type(screen.getByRole("textbox", { name: "搜索工作" }), "需求");
    await user.click(screen.getByRole("button", { name: "切换到清单模式" }));
    await user.click(screen.getByRole("button", { name: "清单筛选" }));
    await user.clear(screen.getByRole("textbox", { name: "清单搜索工作" }));
    await user.type(screen.getByRole("textbox", { name: "清单搜索工作" }), "缺陷");
    await user.click(screen.getByText("更多条件"));
    await chooseFilter(user, "清单流程类型", "状态流");
    await user.click(screen.getByRole("button", { name: "切换到完整模式" }));
    expect((screen.getByRole("textbox", { name: "搜索工作" }) as HTMLInputElement).value).toBe("缺陷");
    expect(screen.queryByText("需求甲")).toBeNull();
    expect(screen.getByText("已完成缺陷")).toBeTruthy();
    expect(screen.queryByText("未归项目缺陷")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "事项类型" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "完成情况" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "流程类型" }).textContent).toBe("状态流");
    await user.click(within(screen.getByRole("group", { name: "我的类型" })).getByRole("button", { name: /^缺陷\s*2$/ }));
    await user.click(screen.getByRole("button", { name: "切换到清单模式" }));
    let list = screen.getByRole("region", { name: "工作清单" });
    expect(within(list).getByText("已完成缺陷")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^缺陷\s*2$/ }).getAttribute("aria-selected")).toBe("true");
    view.unmount();
    render(<App />);
    list = await screen.findByRole("region", { name: "工作清单" });
    await within(list).findByText("需求甲");
    expect(within(list).getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByRole("group", { name: "当前筛选条件" })).toBeNull();
    expect(screen.getByRole("tab", { name: /^全部\s*4$/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "清单筛选" }).textContent).toBe("筛选");
    await user.click(screen.getByRole("button", { name: "清单筛选" }));
    expect((screen.getByRole("textbox", { name: "清单搜索工作" }) as HTMLInputElement).value).toBe("");
    await user.click(screen.getByRole("button", { name: "切换到完整模式" }));
    expect((screen.getByRole("textbox", { name: "搜索工作" }) as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("combobox", { name: "事项类型" })).toBeNull();
    expect(screen.queryByText("全部类型")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "完成情况" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "流程类型" }).textContent).toBe("全部流程类型");
  });

  it("多选空间再次点击可取消，重新打开后重置为空间全部", async () => {
    vi.mocked(loadSnapshot).mockResolvedValue(filterSnapshot());
    const user = userEvent.setup();
    const view = render(<App />);
    let list = await enterListMode(user);
    await user.click(screen.getByRole("button", { name: "清单筛选" }));
    await user.click(screen.getByRole("combobox", { name: "清单空间" }));
    await user.click(screen.getByRole("option", { name: "空间甲" }));
    await user.click(screen.getByRole("option", { name: "空间乙" }));
    expect(within(list).getAllByRole("button")).toHaveLength(4);
    expect(screen.getByRole("combobox", { name: "清单空间" }).textContent).toContain("等 2 项");
    await user.click(screen.getByRole("option", { name: "空间甲" }));
    expect(within(list).getAllByRole("button")).toHaveLength(1);
    expect(within(list).getByText("跨空间需求")).toBeTruthy();
    await user.click(screen.getByRole("option", { name: "空间乙" }));
    expect(within(list).getAllByRole("button")).toHaveLength(4);
    await user.click(screen.getByRole("option", { name: "空间甲" }));
    expect(within(list).getAllByRole("button")).toHaveLength(3);
    view.unmount();
    render(<App />);
    list = await screen.findByRole("region", { name: "工作清单" });
    await within(list).findByText("跨空间需求");
    expect(within(list).getByText("需求甲")).toBeTruthy();
    expect(within(list).getAllByRole("button")).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "清单筛选" }));
    expect(screen.getByRole("combobox", { name: "清单空间" }).textContent).toBe("全部空间");
    expect(screen.getByRole("button", { name: "清单筛选" }).textContent).toBe("筛选");
  });

  it("切换模式保留当前组合条件，零结果时条件仍可见并可清除", async () => {
    vi.mocked(loadSnapshot).mockResolvedValue(filterSnapshot());
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    await chooseFilter(user, "空间", "空间甲");
    await chooseFilter(user, "空间", "空间乙");
    await user.click(within(screen.getByRole("group", { name: "我的类型" })).getByRole("button", { name: /^缺陷\s*2$/ }));
    await chooseFilter(user, "所属项目", "项目甲");
    await chooseFilter(user, "流程类型", "状态流");
    await user.type(screen.getByRole("textbox", { name: "搜索工作" }), "不存在");
    await screen.findByText("没有匹配的工作");
    await user.click(screen.getByRole("button", { name: "切换到清单模式" }));
    const list = screen.getByRole("region", { name: "工作清单" });
    expect(within(list).getByText("没有符合条件的事项")).toBeTruthy();
    expect(screen.getByText("0 / 4 项")).toBeTruthy();
    expect(screen.getByRole("button", { name: "清单筛选" }).textContent).toBe("筛选4");
    const chips = screen.getByRole("group", { name: "当前筛选条件" });
    expect(within(chips).getAllByRole("button")).toHaveLength(5);
    expect(screen.getByRole("tab", { name: /^缺陷\s*2$/ }).getAttribute("aria-selected")).toBe("true");
    await user.click(screen.getByRole("button", { name: "切换到完整模式" }));
    expect(screen.getByRole("combobox", { name: "空间" }).textContent).toContain("等 2 项");
    expect(screen.getByRole("combobox", { name: "所属项目" }).textContent).toBe("项目甲");
    expect(screen.getByRole("combobox", { name: "流程类型" }).textContent).toBe("状态流");
    await user.click(screen.getByRole("button", { name: "切换到清单模式" }));
    await user.click(within(screen.getByRole("region", { name: "工作清单" })).getByRole("button", { name: "清除筛选" }));
    expect(screen.queryByRole("group", { name: "当前筛选条件" })).toBeNull();
    expect(screen.getByRole("tab", { name: /^缺陷\s*2$/ }).getAttribute("aria-selected")).toBe("true");
    await user.click(screen.getByRole("button", { name: "切换到完整模式" }));
    expect(screen.queryByText("需求甲")).toBeNull();
    expect(screen.queryByText("跨空间需求")).toBeNull();
    expect(screen.getByText("已完成缺陷")).toBeTruthy();
    expect(screen.getByText("未归项目缺陷")).toBeTruthy();
  });

  it("清单 Tab 可切换继承的类型并同步到完整模式，全部 Tab 恢复所有类型", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    await user.click(within(screen.getByRole("group", { name: "我的类型" })).getByRole("button", { name: /^需求\s*1$/ }));
    const list = await enterListMode(user);
    expect(within(list).getByText("需求甲")).toBeTruthy();
    expect(within(list).queryByText("缺陷乙")).toBeNull();
    expect(screen.getByRole("tab", { name: /^需求\s*1$/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("button", { name: "取消事项类型：需求" })).toBeNull();
    await user.click(screen.getByRole("tab", { name: /^缺陷\s*1$/ }));
    expect(within(list).queryByText("需求甲")).toBeNull();
    expect(within(list).getByText("缺陷乙")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "切换到完整模式" }));
    expect(within(screen.getByRole("group", { name: "我的类型" })).getByRole("button", { name: /^缺陷\s*1$/ }).classList.contains("chosen")).toBe(true);
    await user.click(screen.getByRole("button", { name: "切换到清单模式" }));
    await user.click(screen.getByRole("tab", { name: /^全部\s*2$/ }));
    expect(screen.getByRole("tab", { name: /^全部\s*2$/ }).getAttribute("aria-selected")).toBe("true");
    expect(within(screen.getByRole("region", { name: "工作清单" })).getAllByRole("button")).toHaveLength(2);
  });

  it("类型 Tab 沿用侧栏的别名、排序和显示范围，并保留零项类型入口", async () => {
    const data = snapshot();
    data.items.push(item("3", "隐藏事项", "hidden-type"));
    data.total = data.items.length;
    data.type_order = ["empty-type", "issue", "story", "hidden-type"];
    data.sources[0].type_scope = {
      configured: false, selected_count: 0,
      types: [
        { type_key: "story", type_name: "需求" },
        { type_key: "issue", type_name: "缺陷" },
        { type_key: "empty-type", type_name: "设计任务" },
        { type_key: "hidden-type", type_name: "隐藏类型" },
      ].map((type) => ({ ...type, project_key: "space-a", project_name: "空间甲", selected: true })),
    };
    localStorage.setItem("fstodo.source-type-preferences.v2", JSON.stringify({
      "source-a": {
        story: { enabled: true, alias: "需求开发" },
        issue: { enabled: true, alias: "缺陷跟踪" },
        "hidden-type": { enabled: false, alias: "" },
      },
    }));
    vi.mocked(loadSnapshot).mockResolvedValue(data);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    const sidebarTypes = within(screen.getByRole("group", { name: "我的类型" })).getAllByRole("button")
      .map((button) => button.textContent?.replace(/\s+/g, ""));
    const list = await enterListMode(user);
    const tabs = within(screen.getByRole("tablist", { name: "事项类型" })).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent?.replace(/\s+/g, ""))).toEqual(["全部2", ...sidebarTypes]);
    expect(sidebarTypes).toEqual(["设计任务0", "缺陷跟踪1", "需求开发1"]);
    expect(screen.queryByRole("tab", { name: /隐藏类型/ })).toBeNull();
    expect(within(list).queryByText("隐藏事项")).toBeNull();
    await user.click(screen.getByRole("tab", { name: /^设计任务\s*0$/ }));
    expect(screen.getByRole("tab", { name: /^设计任务\s*0$/ }).getAttribute("aria-selected")).toBe("true");
    expect(within(list).getByText("当前类型暂无事项")).toBeTruthy();
    expect(screen.getByRole("button", { name: "清单筛选" }).textContent).toBe("筛选");
    expect(screen.queryByRole("button", { name: "清除" })).toBeNull();
    await user.click(within(list).getByRole("button", { name: "查看全部类型" }));
    expect(screen.getByRole("tab", { name: /^全部\s*2$/ }).getAttribute("aria-selected")).toBe("true");
    expect(within(list).getAllByRole("button")).toHaveLength(2);
  });

  it("类型 Tab 支持方向键循环和 Home/End，并关联当前清单面板", async () => {
    const user = userEvent.setup();
    render(<App />);
    const list = await enterListMode(user);
    const tabs = within(screen.getByRole("tablist", { name: "事项类型" })).getAllByRole("tab");
    const expectActive = (index: number) => {
      expect(document.activeElement).toBe(tabs[index]);
      expect(tabs[index].getAttribute("aria-selected")).toBe("true");
      expect(tabs.filter((tab) => tab.getAttribute("tabindex") === "0")).toEqual([tabs[index]]);
      const panel = within(list).getByRole("tabpanel");
      expect(tabs[index].getAttribute("aria-controls")).toBe(panel.id);
      expect(panel.getAttribute("aria-labelledby")).toBe(tabs[index].id);
    };
    tabs[0].focus();
    await user.keyboard("{ArrowLeft}");
    expectActive(tabs.length - 1);
    await user.keyboard("{ArrowRight}");
    expectActive(0);
    expect(within(list).getAllByRole("button")).toHaveLength(2);
    await user.keyboard("{End}");
    expectActive(tabs.length - 1);
    expect(within(list).getAllByRole("button")).toHaveLength(1);
    await user.keyboard("{Home}{ArrowRight}");
    expectActive(1);
    expect(within(list).getAllByRole("button")).toHaveLength(1);
  });

  it("切换类型保留普通筛选，清除筛选及调整空间项目保留当前类型", async () => {
    vi.mocked(loadSnapshot).mockResolvedValue(filterSnapshot());
    const user = userEvent.setup();
    render(<App />);
    const list = await enterListMode(user);
    await user.click(screen.getByRole("button", { name: "清单筛选" }));
    await chooseFilter(user, "清单空间", "空间甲");
    await chooseFilter(user, "清单所属项目", "项目甲");
    await user.type(screen.getByRole("textbox", { name: "清单搜索工作" }), "需求");
    await user.click(screen.getByRole("tab", { name: /^缺陷\s*2$/ }));
    expect(screen.getByRole("button", { name: "取消搜索：需求" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "取消空间：空间甲" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "取消所属项目：项目甲" })).toBeTruthy();
    expect(within(list).getByText("没有符合条件的事项")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "清除" }));
    expect(screen.getByRole("tab", { name: /^缺陷\s*2$/ }).getAttribute("aria-selected")).toBe("true");
    expect(within(list).getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByRole("group", { name: "当前筛选条件" })).toBeNull();
    await chooseFilter(user, "清单空间", "空间甲");
    await chooseFilter(user, "清单所属项目", "项目甲");
    expect(screen.getByRole("tab", { name: /^缺陷\s*2$/ }).getAttribute("aria-selected")).toBe("true");
    expect(within(list).getByText("已完成缺陷")).toBeTruthy();
    expect(within(list).queryByText("需求甲")).toBeNull();
    expect(within(list).queryByText("未归项目缺陷")).toBeNull();
    await user.click(screen.getByRole("tab", { name: /^需求\s*2$/ }));
    expect(screen.getByRole("combobox", { name: "清单空间" }).textContent).toBe("空间甲");
    expect(screen.getByRole("combobox", { name: "清单所属项目" }).textContent).toBe("项目甲");
    expect(within(list).getByText("需求甲")).toBeTruthy();
    expect(within(list).queryByText("跨空间需求")).toBeNull();
  });

  it("切换模式和事项类型使用相同项目候选，不显示其他类型的项目", async () => {
    vi.mocked(loadSnapshot).mockResolvedValue(filterSnapshot());
    const user = userEvent.setup();
    render(<App />);
    await enterListMode(user);
    await user.click(screen.getByRole("tab", { name: /^缺陷\s*2$/ }));
    await user.click(screen.getByRole("button", { name: "清单筛选" }));
    await user.click(screen.getByRole("combobox", { name: "清单所属项目" }));
    expect(screen.getAllByRole("option").map((option) => option.textContent))
      .toEqual(["全部项目", "项目甲", "未提供所属项目"]);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "切换到完整模式" }));
    await user.click(screen.getByRole("combobox", { name: "所属项目" }));
    expect(screen.getAllByRole("option").map((option) => option.textContent))
      .toEqual(["全部项目", "项目甲", "未提供所属项目"]);
  });

  it.each([
    { storageKey: "fstodo.work-filters.v1", completion: ["pending"] },
    { storageKey: "fstodo.work-filters.v1", completion: ["done"] },
    { storageKey: "fstodo.compact-filters.v1", completion: "pending" },
    { storageKey: "fstodo.compact-filters.v1", completion: "done" },
  ])("两种模式忽略旧筛选缓存，修改条件不写入本地（$storageKey，$completion）", async ({ storageKey, completion }) => {
    vi.mocked(loadSnapshot).mockResolvedValue(filterSnapshot());
    const saved = JSON.stringify({ query: "不匹配", space: ["missing"], project: ["missing"],
      type: ["missing"], flowKind: ["node"], nodeName: ["旧节点"], stateName: ["旧状态"], completion });
    localStorage.setItem(storageKey, saved);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("需求甲");
    expect(screen.getByText("已完成缺陷")).toBeTruthy();
    expect(screen.getByText("未归项目缺陷")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "完成情况" })).toBeNull();
    const list = await enterListMode(user);
    expect(within(list).getAllByRole("button")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "清单筛选" }).textContent).toBe("筛选");
    expect(screen.queryByRole("group", { name: "当前筛选条件" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "清单筛选" }));
    await user.click(screen.getByText("更多条件"));
    expect(screen.queryByRole("combobox", { name: "清单完成情况" })).toBeNull();
    await user.type(screen.getByRole("textbox", { name: "清单搜索工作" }), "需求");
    expect(within(list).getAllByRole("button")).toHaveLength(2);
    expect(localStorage.getItem(storageKey)).toBe(saved);
    if (storageKey !== "fstodo.work-filters.v1") expect(localStorage.getItem("fstodo.work-filters.v1")).toBeNull();
  });

  it("键盘 Esc 先关闭下拉，再收起筛选并恢复入口焦点", async () => {
    const user = userEvent.setup();
    render(<App />);
    await enterListMode(user);
    const toggle = screen.getByRole("button", { name: "清单筛选" });
    await user.click(toggle);
    const space = screen.getByRole("combobox", { name: "清单空间" });
    space.focus();
    await user.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Escape}");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("在小窗内打开详情，Esc 或返回按钮回到清单并把焦点还给原事项", async () => {
    const user = userEvent.setup();
    render(<App />);
    const list = await enterListMode(user);

    await user.click(rowNamed(list, "缺陷乙"));
    const detail = screen.getByRole("complementary", { name: "事项详情" });
    expect(within(detail).getByRole("heading", { name: "缺陷乙" })).toBeTruthy();
    expect(document.activeElement).toBe(within(detail).getByRole("button", { name: "返回清单" }));
    expect(list.hasAttribute("inert")).toBe(true);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary", { name: "事项详情" })).toBeNull();
    expect(list.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(rowNamed(list, "缺陷乙"));

    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "返回清单" }));
    expect(screen.queryByRole("complementary", { name: "事项详情" })).toBeNull();
    expect(document.activeElement).toBe(rowNamed(list, "缺陷乙"));
  });

  it("置顶按钮首次默认开启，切换后记住选择", async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await enterListMode(user);
    const pin = screen.getByRole("button", { name: "窗口置顶" });
    expect(pin.getAttribute("aria-pressed")).toBe("true");
    await user.click(pin);
    expect(pin.getAttribute("aria-pressed")).toBe("false");
    view.unmount();
    render(<App />);
    expect((await screen.findByRole("button", { name: "窗口置顶" })).getAttribute("aria-pressed")).toBe("false");
  });

  it.each([
    { outcome: "verified", message: "节点完成已回读核验。", refreshFails: false },
    { outcome: "failed", message: "服务端拒绝本次操作，节点未完成。", refreshFails: false },
    { outcome: "unknown", message: "结果不确定，请先核对飞书状态，不要直接重试。", refreshFails: false },
    { outcome: "verified", message: "节点完成已回读核验。", refreshFails: true },
  ] satisfies { outcome: WorkflowResult["outcome"]; message: string; refreshFails: boolean }[])(
    "流程结果在详情打开时显示于独立提示区（$outcome，列表刷新失败=$refreshFails）",
    async ({ outcome, message, refreshFails }) => {
      const data = { ...snapshot(), capabilities: { workflow: true } };
      vi.mocked(loadSnapshot).mockResolvedValue(data);
      vi.mocked(getWorkflowActions).mockResolvedValue({
        version: "v1",
        actions: [{ id: "confirm", label: "完成研发节点", kind: "node", fields: [] }],
      });
      vi.mocked(executeWorkflowAction).mockResolvedValue({
        outcome, message, verified: outcome === "verified", request_id: "request",
        action_id: "confirm", resynced: outcome === "verified",
      });
      const user = userEvent.setup();
      render(<App />);
      const list = await enterListMode(user);
      await user.click(rowNamed(list, "需求甲"));
      await user.click(await screen.findByRole("button", { name: "完成研发节点" }));
      await user.click(screen.getByRole("button", { name: "提交" }));
      await user.click(screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"));
      if (refreshFails) vi.mocked(loadSnapshot).mockRejectedValueOnce({ kind: "store", message: "缓存被占用" });
      await user.click(screen.getByRole("button", { name: /^确认(?:完成节点|回滚节点|流转到|提交并执行)/ }));

      const feedback = await screen.findByText(refreshFails ? `${message}（本地列表未能刷新：缓存被占用）` : message);
      const alerts = feedback.closest(".list-mode-alerts")!;
      const detail = screen.getByRole("complementary", { name: "事项详情" });
      // 悬浮提示独立于详情覆盖区域，避免相同 z-index 再次遮挡。
      expect(alerts.parentElement).toBe(document.querySelector(".list-mode-shell"));
      expect(alerts.nextElementSibling).toBe(detail.parentElement);
      expect(feedback.closest('[role="status"], [role="alert"]')?.getAttribute("role"))
        .toBe(outcome === "verified" && !refreshFails ? "status" : "alert");
      expect(executeWorkflowAction).toHaveBeenCalledOnce();
      expect(loadSnapshot).toHaveBeenCalledTimes(2);

      await user.click(screen.getByRole("button", { name: "返回清单" }));
      expect(alerts.contains(feedback)).toBe(true);
      await user.click(within(alerts as HTMLElement).getByRole("button", {
        name: outcome === "verified" && !refreshFails ? "关闭结果提示" : "关闭错误提示",
      }));
      expect(document.querySelector(".list-mode-alerts")).toBeNull();
    },
  );

  it("只有被截断的标题在悬停 300ms 后原位展开，按 Esc 收起，提前移开不展开", async () => {
    const user = userEvent.setup();
    render(<App />);
    const list = await enterListMode(user);
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.textContent === "需求甲" ? 60 : 20;
    });
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(40);
    vi.useFakeTimers();
    const peek = () => list.querySelector(".list-mode-peek");

    fireEvent.mouseEnter(rowNamed(list, "缺陷乙"));
    act(() => vi.advanceTimersByTime(400));
    expect(peek()).toBeNull();

    const long = rowNamed(list, "需求甲");
    fireEvent.mouseEnter(long);
    act(() => vi.advanceTimersByTime(200));
    fireEvent.mouseLeave(long);
    act(() => vi.advanceTimersByTime(400));
    expect(peek()).toBeNull();

    fireEvent.mouseEnter(long);
    act(() => vi.advanceTimersByTime(299));
    expect(peek()).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(peek()?.textContent).toBe("需求甲");
    expect(peek()?.getAttribute("aria-hidden")).toBe("true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(peek()).toBeNull();
  });
});
