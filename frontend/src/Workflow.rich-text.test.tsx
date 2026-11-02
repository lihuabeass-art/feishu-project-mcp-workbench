// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getWorkflowActions, loadFieldImage } from "./api";
import { Workflow } from "./Workflow";
import { draftKey, readDraft, writeDraft } from "./workflowDrafts";
import { itemKey } from "./model";
import type { CachedItem, WorkflowOptions } from "./types";

vi.mock("./api", () => ({
  getWorkflowActions: vi.fn(),
  loadFieldImage: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn() }));
const item = {
  id: {
    project_key: "space",
    work_item_type_key: "story",
    work_item_id: "123",
  },
  name: "图文需求",
} as CachedItem;
const url = "https://project.feishu.cn/example/story/detail/123";
const imageUrl =
  "https://project.feishu.cn/goapi/v5/platform/file/stream/download/workflow-example";
const markdown = `已有说明\n\n![](${imageUrl})<!-- image:{"width":408,"uuid":"example"} -->\n\n图片后的文字`;
const readonlyKey = JSON.stringify({ ReadOnly: { WorkItem: "description" } });
function options(
  kind: "node" | "state" = "node",
  value = markdown,
): WorkflowOptions {
  return {
    version: "v1",
    item_url: url,
    actions: [
      {
        id: kind === "node" ? "node:confirm:n1" : "state:resolve:done",
        kind,
        label: kind === "node" ? "完成节点" : "流转到已完成",
        fields: [
          {
            key: readonlyKey,
            label: "需求说明",
            kind: "textarea",
            required: false,
            read_only: true,
            rich_text: { image_field_key: "description" },
            scope: "work_item",
            initial_value: value,
          },
          {
            key: "doc",
            label: "设计文档",
            kind: "text",
            required: false,
            initial_value: "旧文档",
          },
        ],
      },
    ],
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockResolvedValue(undefined);
  vi.mocked(loadFieldImage).mockResolvedValue(
    "data:image/png;base64,iVBORw0KGgo=",
  );
  vi.mocked(getWorkflowActions).mockResolvedValue(options());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["node", "state"] as const)(
  "%s 非必填富文本只读显示图片，核对保留完整云端值且只写可编辑差异",
  async (kind) => {
    const current = options(kind);
    vi.mocked(getWorkflowActions).mockResolvedValue(current);
    const submit = vi
      .fn()
      .mockResolvedValue({ outcome: "unknown", verified: false });
    const view = render(
      <Workflow item={item} available busy={false} submit={submit} />,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: current.actions[0].label }),
    );
    expect(screen.queryByRole("textbox", { name: "需求说明" })).toBeNull();
    expect(await screen.findByAltText("业务字段图片")).toBeTruthy();
    expect(screen.getByText("图片后的文字")).toBeTruthy();
    expect(view.container.textContent).not.toContain("image:");
    expect(view.container.textContent).not.toContain(imageUrl);
    expect(loadFieldImage).toHaveBeenCalledWith(
      item.id,
      "description",
      imageUrl,
      false,
    );
    expect(screen.getByRole("link", { name: "在飞书中修改" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "去飞书填写" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "放大查看图片" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.clear(screen.getByRole("textbox", { name: "设计文档" }));
    await user.type(
      screen.getByRole("textbox", { name: "设计文档" }),
      "新文档",
    );
    await user.click(screen.getByRole("button", { name: "提交" }));
    const review = await screen.findByRole("region", {
      name: "提交前二次确认",
    });
    expect(await within(review).findByAltText("业务字段图片")).toBeTruthy();
    expect(review.textContent).toContain("1 项修改");
    expect(review.textContent).toContain("1 项沿用云端");
    expect(review.textContent).not.toContain(imageUrl);
    expect(review.textContent).not.toContain("image:");
    await user.click(
      screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"),
    );
    await user.click(
      screen.getByRole("button", {
        name: kind === "node" ? "确认完成节点" : "确认流转到已完成",
      }),
    );
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0].fields).toEqual({ doc: "新文档" });
    expect(invoke).not.toHaveBeenCalled();
  },
);

it.each([false, true])(
  "结构化富文本（数组：%s）在编辑和核对页保留图文，不显示 JSON 源码",
  async (array) => {
    const content = [
      { type: "paragraph", content: [{ type: "text", text: "结构化说明" }] },
      { type: "image", attrs: { src: imageUrl }, alt: "结构化图片" },
    ];
    const value = array ? content : { type: "doc", content };
    const current = options("node", JSON.stringify(value));
    current.actions[0].fields[0].rich_text = {
      image_field_key: "description",
      structured_value: value,
    };
    vi.mocked(getWorkflowActions).mockResolvedValue(current);
    const view = render(
      <Workflow item={item} available busy={false} submit={vi.fn()} />,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "完成节点" }),
    );
    expect(await screen.findByAltText("结构化图片")).toBeTruthy();
    expect(screen.getByText("结构化说明")).toBeTruthy();
    expect(view.container.textContent).not.toContain('"type"');
    expect(view.container.textContent).not.toContain(imageUrl);
    await userEvent.click(screen.getByRole("button", { name: "提交" }));
    const review = await screen.findByRole("region", {
      name: "提交前二次确认",
    });
    expect(await within(review).findByAltText("结构化图片")).toBeTruthy();
    expect(review.textContent).toContain("结构化说明");
    expect(review.textContent).not.toContain('"type"');
    expect(review.textContent).not.toContain(imageUrl);
  },
);

it.each(["", " \n\t"])("非必填富文本为空（%j）仍可零差异推进，旧可编辑草稿保留为本次不提交", async (value) => {
  const current = options("node", value);
  vi.mocked(getWorkflowActions).mockResolvedValue(current);
  const oldKey = JSON.stringify({ WorkItem: "description" });
  const storageKey = draftKey(itemKey(item), current.actions[0].id);
  writeDraft(storageKey, {
    version: "old",
    updated_at: 1,
    fields: { [oldKey]: "旧的本机说明" },
    base_fields: { [oldKey]: "旧云端说明" },
    field_labels: { [oldKey]: "需求说明" },
  });
  const submit = vi
    .fn()
    .mockResolvedValue({ outcome: "verified", verified: true });
  render(<Workflow item={item} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  expect(screen.getByText("未填写")).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "需求说明" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "提交" }));
  const review = await screen.findByRole("region", { name: "提交前二次确认" });
  expect(review.textContent).toContain("2 项沿用云端");
  expect(review.textContent).toContain("本次不提交");
  expect(review.textContent).toContain("旧的本机说明");
  await user.click(
    screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"),
  );
  await user.click(screen.getByRole("button", { name: "确认完成节点" }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0].fields).toEqual({});
  expect(readDraft(storageKey)?.fields[oldKey]).toBe("旧的本机说明");
  expect(loadFieldImage).not.toHaveBeenCalled();
});

it("仍缺必填的富文本动作直接去飞书，不打开本地编辑或核对页", async () => {
  const current = options();
  Object.assign(current.actions[0], {
    requires_feishu: true,
    manual_fill_required: true,
    disabled_reason: "请在飞书补齐说明",
  });
  vi.mocked(getWorkflowActions).mockResolvedValue(current);
  const submit = vi.fn();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "完成节点" }),
  );
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("open_external_url", {
      url,
      newWindow: true,
    }),
  );
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("region", { name: "提交前二次确认" })).toBeNull();
  expect(localStorage.length).toBe(0);
  expect(loadFieldImage).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

it("节点富文本缺少可核对的事项图片字段时不猜归属，保留文字并提示去飞书查看", async () => {
  const current = options();
  current.actions[0].fields[0].rich_text = {};
  vi.mocked(getWorkflowActions).mockResolvedValue(current);
  render(<Workflow item={item} available busy={false} submit={vi.fn()} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "完成节点" }),
  );
  expect(await screen.findByText("请在飞书中查看图片")).toBeTruthy();
  expect(screen.getByText("图片后的文字")).toBeTruthy();
  expect(screen.getByRole("link", { name: "在飞书中修改" })).toBeTruthy();
  expect(loadFieldImage).not.toHaveBeenCalled();
});
