// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SourceEditor } from "./SourceEditor";
import { WorkItemDetails, FieldValue } from "./WorkItemDetails";
import {
  cachedItemDetail,
  refreshItemDetail,
  discoverSourceFields,
  saveWorkSource,
} from "./api";
import type { CachedItem, ItemDetail, Source } from "./types";

vi.mock("./api", () => ({
  cachedItemDetail: vi.fn(),
  refreshItemDetail: vi.fn(),
  discoverSourceFields: vi.fn(),
  saveWorkSource: vi.fn(),
}));
const item = (id: string) =>
  ({
    id: { project_key: "p", work_item_type_key: "story", work_item_id: id },
  }) as CachedItem;
const detail = (id: string, text: string): ItemDetail => ({
  id: item(id).id,
  fetched_at_ms: 1,
  data: {
    work_item_attribute: {},
    work_item_fields: [{ key: "description", name: "描述", value: text }],
  },
  pages: [],
});
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(screen.getByRole("option", { name: option }));
}

it("内置逾期待办使用固定规则和独立稳定标识", async () => {
  const user = userEvent.setup();
  render(
    <SourceEditor
      sources={[]}
      builtinKey="overdue"
      cancel={vi.fn()}
      items={[]}
      disabled={false}
      saved={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  expect(screen.queryByRole("textbox", { name: "来源名称" })).toBeNull();
  expect(screen.queryByRole("combobox", { name: "来源查询方式" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "保存工作来源" }));
  await waitFor(() =>
    expect(saveWorkSource).toHaveBeenCalledWith({
      id: "builtin-overdue",
      builtin_key: "overdue",
      kind: "personal_todo",
      enabled: true,
      action: "overdue",
      todo_scope: "all",
    }),
  );
});

it("预制参与缺陷在飞书端查询全部参与人并使用缺陷类型", async () => {
  const user = userEvent.setup();
  render(
    <SourceEditor
      sources={[]}
      builtinKey="issues"
      cancel={vi.fn()}
      items={[item("1")]}
      disabled={false}
      saved={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  expect(screen.getByLabelText("来源空间标识")).toHaveProperty("value", "");
  await user.click(screen.getByRole("button", { name: "保存工作来源" }));
  expect(saveWorkSource).not.toHaveBeenCalled();
  await chooseOption(user, "来源空间", "p");
  await user.click(screen.getByRole("button", { name: "保存工作来源" }));
  await waitFor(() =>
    expect(saveWorkSource).toHaveBeenCalledWith({
      id: "builtin-issues",
      builtin_key: "issues",
      kind: "work_item_type",
      enabled: true,
      project_key: "p",
      work_item_type_key: "issue",
      association_rule: JSON.stringify({ kind: "all_participants" }),
    }),
  );
});

it("自定义人员规则必须选择实际字段或角色", async () => {
  const user = userEvent.setup();
  render(
    <SourceEditor
      sources={[]}
      cancel={vi.fn()}
      items={[item("1")]}
      disabled={false}
      saved={vi.fn()}
    />,
  );
  await user.type(
    screen.getByRole("textbox", { name: "来源名称" }),
    "我的职责",
  );
  await chooseOption(user, "来源空间", "p");
  await chooseOption(user, "本人关联规则", "指定人员字段或角色包含我");
  await user.click(screen.getByRole("button", { name: "保存工作来源" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "请先发现并选择至少一个人员字段或角色。",
  );
  expect(saveWorkSource).not.toHaveBeenCalled();
});

it("旧 personal-todo 显示中文但保存时保留标识和凭据范围", async () => {
  const user = userEvent.setup();
  const source: Source = {
    id: "personal-todo",
    kind: "personal_todo",
    enabled: true,
    executable: true,
    reason: null,
    action: "todo",
    todo_scope: "in_progress",
    asset_key: "asset",
  };
  render(
    <SourceEditor
      sources={[source]}
      editingSource={source}
      cancel={vi.fn()}
      items={[]}
      disabled={false}
      saved={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  await chooseOption(user, "待办进度", "尚未开始");
  await user.click(screen.getByRole("button", { name: "保存工作来源" }));
  await waitFor(() =>
    expect(saveWorkSource).toHaveBeenCalledWith({
      id: "personal-todo",
      display_name: "我的待办",
      kind: "personal_todo",
      enabled: true,
      action: "todo",
      todo_scope: "not_started",
      asset_key: "asset",
    }),
  );
});

it("新增自定义来源禁止覆盖已有中文显示名", async () => {
  const user = userEvent.setup();
  const source: Source = {
    id: "personal-todo",
    kind: "personal_todo",
    enabled: true,
    executable: true,
    reason: null,
    action: "todo",
    todo_scope: "in_progress",
  };
  render(
    <SourceEditor
      sources={[source]}
      cancel={vi.fn()}
      items={[]}
      disabled={false}
      saved={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  await user.type(
    screen.getByRole("textbox", { name: "来源名称" }),
    "我的待办",
  );
  await chooseOption(user, "来源查询方式", "我的工作");
  await user.click(screen.getByRole("button", { name: "保存工作来源" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "来源名称已存在，请使用其他名称。",
  );
  expect(saveWorkSource).not.toHaveBeenCalled();
});

it("人员字段和角色使用发现的原始标识保存，并支持全部条件", async () => {
  const user = userEvent.setup();
  vi.mocked(discoverSourceFields).mockResolvedValue({
    fields: [{ field_key: "fixer", field_name: "修复人", field_type: "user" }],
    roles: [{ role_id: "server", role_name: "后端研发" }],
  });
  render(
    <SourceEditor
      sources={[]}
      cancel={vi.fn()}
      items={[item("1")]}
      disabled={false}
      saved={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  await user.type(
    screen.getByRole("textbox", { name: "来源名称" }),
    "职责来源",
  );
  await chooseOption(user, "来源空间", "p");
  await chooseOption(user, "本人关联规则", "指定人员字段或角色包含我");
  await user.click(screen.getByRole("button", { name: "发现人员字段与角色" }));
  await user.click(
    await screen.findByRole("button", { name: "修复人 · fixer" }),
  );
  await user.click(screen.getByRole("button", { name: "角色：后端研发" }));
  await user.click(screen.getByRole("switch", { name: "全部条件同时满足" }));
  await user.click(screen.getByRole("button", { name: "保存工作来源" }));
  await waitFor(() => expect(saveWorkSource).toHaveBeenCalledOnce());
  const input = vi.mocked(saveWorkSource).mock.calls[0][0];
  expect(JSON.parse(input.association_rule!)).toEqual({
    kind: "personnel",
    fields: ["fixer"],
    roles: ["后端研发"],
    match_all: true,
  });
});

it("编辑个人待办保留 asset_key 和未设置的 todo_scope", async () => {
  const user = userEvent.setup();
  const source: Source = {
    id: "personal",
    kind: "personal_todo",
    enabled: true,
    executable: true,
    reason: null,
    action: "done",
    todo_scope: null,
    asset_key: "asset",
  };
  render(
    <SourceEditor
      sources={[source]}
      editingSource={source}
      cancel={vi.fn()}
      items={[]}
      disabled={false}
      saved={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  await user.clear(screen.getByRole("textbox", { name: "来源名称" }));
  await user.type(
    screen.getByRole("textbox", { name: "来源名称" }),
    "已办归档",
  );
  await user.click(screen.getByRole("button", { name: "保存工作来源" }));
  await waitFor(() =>
    expect(saveWorkSource).toHaveBeenCalledWith({
      id: "personal",
      display_name: "已办归档",
      kind: "personal_todo",
      enabled: true,
      action: "done",
      asset_key: "asset",
    }),
  );
});

it("详情刷新失败仍展示完整缓存", async () => {
  vi.mocked(cachedItemDetail).mockResolvedValue(detail("1", "缓存描述"));
  vi.mocked(refreshItemDetail).mockRejectedValue({
    kind: "connection",
    message: "网络断开",
  });
  render(<WorkItemDetails item={item("1")} enabled />);
  expect(await screen.findByText("缓存描述")).toBeTruthy();
  expect((await screen.findByRole("alert")).textContent).toContain(
    "当前显示上次保存的信息",
  );
});

it("当前事项内容版本改变时保留旧内容回读缓存，不重发飞书请求", async () => {
  const current = { ...item("1"), detail_revision: "v1" };
  vi.mocked(cachedItemDetail).mockResolvedValue(detail("1", "旧正文"));
  vi.mocked(refreshItemDetail).mockResolvedValue(detail("1", "旧正文"));
  const view = render(<WorkItemDetails item={current} enabled />);
  await screen.findByText("旧正文");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "刷新详情" })).toBeTruthy(),
  );
  let finish!: (value: ItemDetail) => void;
  vi.mocked(cachedItemDetail).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  view.rerender(
    <WorkItemDetails item={{ ...current, detail_revision: "v2" }} enabled />,
  );
  expect(screen.getByText("旧正文")).toBeTruthy();
  await act(async () => finish(detail("1", "新正文")));
  expect(screen.getByText("新正文")).toBeTruthy();
  expect(refreshItemDetail).toHaveBeenCalledOnce();
  view.rerender(
    <WorkItemDetails
      item={{ ...current, detail_revision: "v2", last_seen_at_ms: 100 }}
      enabled
    />,
  );
  expect(cachedItemDetail).toHaveBeenCalledTimes(2);
});

it("自动回读失败保留详情，后续版本恢复且较旧的回读不能覆盖新版本", async () => {
  const current = { ...item("1"), detail_revision: "v1" };
  vi.mocked(cachedItemDetail).mockResolvedValue(detail("1", "旧正文"));
  vi.mocked(refreshItemDetail).mockResolvedValue(detail("1", "旧正文"));
  const view = render(<WorkItemDetails item={current} enabled />);
  await screen.findByText("旧正文");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "刷新详情" })).toBeTruthy(),
  );
  vi.mocked(cachedItemDetail).mockRejectedValueOnce({
    message: "缓存暂不可读",
  });
  view.rerender(
    <WorkItemDetails item={{ ...current, detail_revision: "v2" }} enabled />,
  );
  await screen.findByText(/详情读取失败：暂时无法获取最新信息，请稍后重试/);
  expect(screen.queryByText(/缓存暂不可读/)).toBeNull();
  expect(screen.getByText("旧正文")).toBeTruthy();
  let oldRead!: (value: ItemDetail) => void;
  vi.mocked(cachedItemDetail).mockReturnValueOnce(
    new Promise((resolve) => {
      oldRead = resolve;
    }),
  );
  view.rerender(
    <WorkItemDetails item={{ ...current, detail_revision: "v3" }} enabled />,
  );
  vi.mocked(cachedItemDetail).mockResolvedValue(detail("1", "最新正文"));
  view.rerender(
    <WorkItemDetails item={{ ...current, detail_revision: "v4" }} enabled />,
  );
  await screen.findByText("最新正文");
  await act(async () => oldRead(detail("1", "迟到正文")));
  expect(screen.queryByText("迟到正文")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("同步先更新时，打开事项的迟到响应从已提交缓存取值", async () => {
  const current = { ...item("1"), detail_revision: "v1" };
  vi.mocked(cachedItemDetail).mockResolvedValue(detail("1", "旧正文"));
  let remote!: (value: ItemDetail) => void;
  vi.mocked(refreshItemDetail).mockReturnValue(
    new Promise((resolve) => {
      remote = resolve;
    }),
  );
  const view = render(<WorkItemDetails item={current} enabled />);
  await screen.findByText("旧正文");
  vi.mocked(cachedItemDetail).mockResolvedValue(detail("1", "同步新正文"));
  view.rerender(
    <WorkItemDetails item={{ ...current, detail_revision: "v2" }} enabled />,
  );
  await screen.findByText("同步新正文");
  await act(async () => remote(detail("1", "迟到旧正文")));
  expect(screen.getByText("同步新正文")).toBeTruthy();
  expect(screen.queryByText("迟到旧正文")).toBeNull();
});

it("切换事项后忽略旧详情响应", async () => {
  let resolveOld!: (value: ItemDetail) => void;
  vi.mocked(cachedItemDetail).mockResolvedValue(null);
  vi.mocked(refreshItemDetail).mockImplementation((id) =>
    id.work_item_id === "1"
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : Promise.resolve(detail("2", "第二条详情")),
  );
  const view = render(<WorkItemDetails item={item("1")} enabled />);
  await waitFor(() => expect(refreshItemDetail).toHaveBeenCalledOnce());
  view.rerender(<WorkItemDetails item={item("2")} enabled />);
  await screen.findByText("第二条详情");
  await act(async () => resolveOld(detail("1", "第一条旧响应")));
  expect(screen.queryByText("第一条旧响应")).toBeNull();
  expect(screen.getByText("第二条详情")).toBeTruthy();
});

it("只有远端详情刷新成功后才通知列表回读摘要", async () => {
  vi.mocked(cachedItemDetail).mockResolvedValue(detail("1", "缓存描述"));
  vi.mocked(refreshItemDetail).mockResolvedValue(detail("1", "最新描述"));
  const onRefreshed = vi.fn().mockResolvedValue(undefined);
  render(
    <WorkItemDetails item={item("1")} enabled onRefreshed={onRefreshed} />,
  );
  await screen.findByText("最新描述");
  await waitFor(() => expect(onRefreshed).toHaveBeenCalledOnce());
});

it("各项目角色按名称稳定排序，缓存和刷新顺序不影响展示及人员对应关系", async () => {
  const roles = [
    { name: "报告人", members: ["报告成员"] },
    { label: "产品经理", members: ["产品成员"] },
    { name: "修复人", members: ["修复成员甲", "修复成员乙"] },
    { name: "测试负责人", members: ["测试成员"] },
    { name: "设计师", members: ["设计成员"] },
    { name: "安全负责人", members: ["安全成员"] },
  ];
  const withRoles = (id: string, members: unknown[]) => ({
    ...detail(id, "角色详情"),
    data: {
      ...detail(id, "角色详情").data,
      work_item_attribute: { role_members: members },
    },
  });
  let resolveRefresh!: (value: ItemDetail) => void;
  const cached = withRoles("1", roles);
  vi.mocked(cachedItemDetail).mockResolvedValue(cached);
  vi.mocked(refreshItemDetail).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
  );
  const view = render(<WorkItemDetails item={item("1")} enabled />);
  const roleSection = () =>
    screen.getByRole("heading", { name: "角色与人员" }).nextElementSibling!;
  const visibleRoles = () =>
    Array.from(roleSection().querySelectorAll(":scope > div > dt")).map(
      (dt) => dt.textContent,
    );
  const expected = [
    "安全负责人",
    "报告人",
    "测试负责人",
    "产品经理",
    "设计师",
    "修复人",
  ];
  await screen.findByText("角色详情");
  expect(visibleRoles()).toEqual(expected);
  expect(cached.data.work_item_attribute.role_members).toEqual(roles);

  await act(async () => resolveRefresh(withRoles("1", [...roles].reverse())));
  expect(visibleRoles()).toEqual(expected);
  const fixer = Array.from(roleSection().querySelectorAll(":scope > div")).find(
    (role) => role.querySelector("dt")?.textContent === "修复人",
  )!;
  expect(fixer.querySelector("dd")?.textContent).toBe("修复成员甲、修复成员乙");

  const otherItem = item("2");
  otherItem.id.project_key = "other-project";
  const otherDetail = withRoles("2", [
    { name: "运维", members: ["运维成员"] },
    { label: "前端研发", members: ["前端成员"] },
    { name: "后端研发", members: ["后端成员"] },
  ]);
  otherDetail.id = otherItem.id;
  vi.mocked(cachedItemDetail).mockResolvedValue(null);
  vi.mocked(refreshItemDetail).mockResolvedValue(otherDetail);
  view.rerender(<WorkItemDetails item={otherItem} enabled />);
  await waitFor(() =>
    expect(visibleRoles()).toEqual(["后端研发", "前端研发", "运维"]),
  );
});

it("详情按用途分层：概要提炼负责人，空字段合并，系统字段收进更多字段", async () => {
  const user = { email: "a@x", key: "1", name: "施伟" };
  vi.mocked(cachedItemDetail).mockResolvedValue(null);
  vi.mocked(refreshItemDetail).mockResolvedValue({
    ...detail("1", "缺陷正文"),
    data: {
      work_item_attribute: {
        work_item_status: { key: "IN PROGRESS", name: "处理中" },
        create_by: user,
        create_time: "2026-10-20T10:39:58+08:00",
        template: { id: 1, name: "通用缺陷" },
        role_members: [
          { key: "pm", name: "产品经理" },
          { key: "fixer", name: "修复人", members: [user] },
        ],
      },
      work_item_fields: [
        { key: "current_status_operator", name: "当前负责人", value: [user] },
        { key: "priority", name: "优先级", value: { label: "P0", value: "0" } },
        { key: "auto_number", name: "自增数字", value: "1277" },
        { key: "archiving_status", name: "是否完成", value: "false" },
        { key: "is_frozen", name: "是否冻结", value: "false" },
        { key: "issue_reporter", name: "报告人", value: null },
        { key: "discovery_version", name: "发现版本", value: null },
        {
          key: "field_2c8f1d",
          name: "复现概率",
          value: { label: "必现", value: "x" },
        },
        { key: "description", name: "缺陷描述", value: "缺陷正文" },
      ],
    },
  });
  render(<WorkItemDetails item={item("1")} enabled />);
  await screen.findByText("缺陷正文");
  const summary = document.querySelector(".detail-summary")!;
  expect(summary.textContent).toContain("处理中");
  expect(summary.textContent).toContain("当前负责人施伟");
  expect(summary.textContent).toContain("优先级P0");
  expect(summary.textContent).toContain("创建施伟 · ");
  expect(screen.getByText("必现")).toBeTruthy();
  expect(screen.getByText("未填写：报告人、发现版本")).toBeTruthy();
  expect(screen.getByText("未指派：产品经理")).toBeTruthy();
  expect(
    document.querySelector(".remote-details details:not(.more-fields)"),
  ).toBeNull();
  const more = document.querySelector(".more-fields")!;
  expect(more.hasAttribute("open")).toBe(false);
  expect(more.querySelector("summary")?.textContent).toBe("更多字段（4）");
  expect(more.textContent).toContain("自增数字1277");
  expect(more.textContent).toContain("是否完成否");
  expect(more.textContent).toContain("是否冻结否");
  expect(more.textContent).toContain("流程模板通用缺陷");
});

it("业务字段按文本显示，不执行 HTML 或脚本链接", () => {
  const view = render(
    <FieldValue value={"<img src=x onerror=alert(1)>\n第二行"} />,
  );
  expect(view.container.querySelector("img")).toBeNull();
  expect(view.container.textContent).toContain("\n第二行");
  view.rerender(<FieldValue value="javascript:alert(1)" />);
  expect(view.container.querySelector("a")).toBeNull();
});
