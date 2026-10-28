// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkSources } from "./WorkSources";
import { removeWorkSource, setWorkSourceEnabled, saveWorkSource } from "./api";
import type { Source } from "./types";

vi.mock("./api", () => ({
  removeWorkSource: vi.fn(),
  setWorkSourceEnabled: vi.fn(),
  saveWorkSource: vi.fn(),
  discoverSourceFields: vi.fn(),
}));
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
const todo: Source = {
  id: "personal-todo",
  builtin_key: "todo",
  kind: "personal_todo",
  enabled: true,
  executable: true,
  reason: null,
  action: "todo",
  todo_scope: "in_progress",
};
const custom: Source = {
  ...todo,
  id: "custom",
  builtin_key: null,
  display_name: "我的视图",
  kind: "view",
  action: null,
  todo_scope: null,
  project_key: "space",
  view_id: "view",
};
function setup(sources = [todo, custom]) {
  const saved = vi.fn().mockResolvedValue(undefined);
  render(
    <WorkSources
      sources={sources}
      items={[]}
      selectedId={todo.id}
      select={vi.fn()}
      disabled={false}
      editable
      saved={saved}
    />,
  );
  return { user: userEvent.setup(), saved };
}

it("内置与自定义有平级添加入口，内置不可编辑，自定义可编辑名称", async () => {
  const { user } = setup();
  expect(screen.queryByRole("button", { name: "编辑我的待办" })).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "编辑我的视图 · space" }),
  );
  expect(screen.getByRole("textbox", { name: "来源名称" })).toHaveProperty(
    "value",
    "我的视图",
  );
  await user.click(screen.getByRole("button", { name: "取消" }));
  await user.click(screen.getByRole("button", { name: "添加内置来源" }));
  expect(screen.getByRole("region", { name: "内置来源目录" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "已添加" })).toHaveProperty(
    "disabled",
    true,
  );
  await user.click(screen.getByRole("button", { name: "添加自定义来源" }));
  expect(screen.queryByRole("region", { name: "内置来源目录" })).toBeNull();
  expect(screen.getByRole("textbox", { name: "来源名称" })).toHaveProperty(
    "value",
    "",
  );
});

it("移除需确认，失败保留来源并允许重试", async () => {
  const { user, saved } = setup();
  vi.mocked(removeWorkSource)
    .mockRejectedValueOnce({ message: "保存失败" })
    .mockResolvedValueOnce(undefined);
  await user.click(screen.getByRole("button", { name: "移除我的待办" }));
  expect(removeWorkSource).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "确认移除" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "保存失败",
  );
  expect(saved).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "确认移除" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(removeWorkSource).toHaveBeenLastCalledWith("personal-todo");
  expect(screen.queryByRole("button", { name: "确认移除" })).toBeNull();
});

it("可停用内置来源，未绑定的需求来源只开放空间绑定", async () => {
  const pending: Source = {
    ...todo,
    id: "related-story",
    builtin_key: "stories",
    kind: "work_item_type",
    executable: false,
    action: null,
    todo_scope: null,
    work_item_type_key: "story",
    association_rule: '{"kind":"all_participants"}',
  };
  const { user } = setup([todo, pending]);
  await user.click(screen.getByRole("switch", { name: "启用我的待办" }));
  await waitFor(() =>
    expect(setWorkSourceEnabled).toHaveBeenCalledWith("personal-todo", false),
  );
  await user.click(
    screen.getByRole("button", { name: "设置空间我参与的需求" }),
  );
  expect(screen.getByLabelText("来源空间标识")).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "来源名称" })).toBeNull();
  expect(screen.queryByRole("combobox", { name: "本人关联规则" })).toBeNull();
});

it("来源卡片与空间选择显示中文名称，保存时仍使用空间标识", async () => {
  const named: Source = {
    ...custom,
    type_scope: {
      configured: false,
      selected_count: 0,
      types: [
        {
          project_key: "space",
          project_name: "研发空间",
          type_key: "story",
          type_name: "需求",
          selected: true,
        },
      ],
    },
  };
  const { user } = setup([todo, named]);
  expect(screen.getByText("空间：研发空间").getAttribute("title")).toBe(
    "space",
  );
  await user.click(screen.getByRole("button", { name: "添加内置来源" }));
  await user.click(screen.getByRole("button", { name: "添加我参与的需求" }));
  expect(saveWorkSource).not.toHaveBeenCalled();
  await user.click(screen.getByRole("combobox", { name: "来源空间" }));
  await user.click(screen.getByRole("option", { name: "研发空间 · space" }));
  await user.click(screen.getByRole("button", { name: "保存工作来源" }));
  await waitFor(() =>
    expect(saveWorkSource).toHaveBeenCalledWith(
      expect.objectContaining({
        builtin_key: "stories",
        project_key: "space",
      }),
    ),
  );
});

it("没有已同步空间时可手动添加需求来源", async () => {
  const { user } = setup([todo]);
  await user.click(screen.getByRole("button", { name: "添加内置来源" }));
  await user.click(screen.getByRole("button", { name: "添加我参与的需求" }));
  expect(screen.getByText(/可先同步「我的待办」获取空间名称/)).toBeTruthy();
  await user.type(screen.getByLabelText("来源空间标识"), "new-space");
  await user.click(screen.getByRole("button", { name: "保存工作来源" }));
  await waitFor(() =>
    expect(saveWorkSource).toHaveBeenCalledWith(
      expect.objectContaining({
        project_key: "new-space",
      }),
    ),
  );
});

it("未知空间名称回退到标识，编辑已有来源保留空间", async () => {
  const { user } = setup();
  expect(screen.getByText("空间：space")).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: "编辑我的视图 · space" }),
  );
  expect(screen.getByRole("combobox", { name: "来源空间" }).textContent).toBe(
    "space",
  );
  await user.click(screen.getByRole("button", { name: "保存工作来源" }));
  await waitFor(() =>
    expect(saveWorkSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "custom",
        project_key: "space",
        view_id: "view",
      }),
    ),
  );
});

it.each([
  ["stories", "我参与的需求", "story"],
  ["issues", "我参与的缺陷", "issue"],
])(
  "已添加的 %s 来源仍可为其他空间添加，同空间不重复保存",
  async (builtin_key, name, typeKey) => {
    const existing: Source = {
      ...custom,
      id: `builtin-${builtin_key}`,
      display_name: null,
      builtin_key,
      kind: "work_item_type",
      work_item_type_key: typeKey,
      view_id: null,
      association_rule: '{"kind":"all_participants"}',
    };
    const { user } = setup([todo, existing]);
    await user.click(screen.getByRole("button", { name: "添加内置来源" }));
    await user.click(screen.getByRole("button", { name: `添加${name}` }));
    await user.click(screen.getByRole("combobox", { name: "来源空间" }));
    await user.click(screen.getByRole("option", { name: "space" }));
    await user.click(screen.getByRole("button", { name: "保存工作来源" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "此空间已添加相同的内置来源，请选择其他空间。",
    );
    expect(saveWorkSource).not.toHaveBeenCalled();
    await user.click(screen.getByRole("combobox", { name: "来源空间" }));
    await user.click(
      screen.getByRole("option", { name: "请选择空间，或手动填写标识" }),
    );
    await user.type(screen.getByLabelText("来源空间标识"), "other-space");
    await user.click(screen.getByRole("button", { name: "保存工作来源" }));
    await waitFor(() =>
      expect(saveWorkSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: `builtin-${builtin_key}-2`,
          builtin_key,
          project_key: "other-space",
        }),
      ),
    );
  },
);

it("多空间同名来源的选择、启停与移除均明确操作空间", async () => {
  const story = (project_key: string): Source => ({
    ...custom,
    id: `stories-${project_key}`,
    display_name: null,
    builtin_key: "stories",
    kind: "work_item_type",
    project_key,
    work_item_type_key: "story",
    view_id: null,
  });
  const { user } = setup([todo, story("space-a"), story("space-b")]);
  expect(
    screen.getByRole("radio", { name: "我参与的需求 · space-a" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("radio", { name: "我参与的需求 · space-b" }),
  ).toBeTruthy();
  await user.click(
    screen.getByRole("switch", { name: "启用我参与的需求 · space-b" }),
  );
  await waitFor(() =>
    expect(setWorkSourceEnabled).toHaveBeenCalledWith("stories-space-b", false),
  );
  await user.click(
    screen.getByRole("button", { name: "移除我参与的需求 · space-b" }),
  );
  expect(
    screen.getByRole("group", { name: "确认移除我参与的需求 · space-b" }),
  ).toBeTruthy();
  expect(screen.getByText("移除“我参与的需求 · space-b”？")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "确认移除" }));
  await waitFor(() =>
    expect(removeWorkSource).toHaveBeenCalledWith("stories-space-b"),
  );
});
