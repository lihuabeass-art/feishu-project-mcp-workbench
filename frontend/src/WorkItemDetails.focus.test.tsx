// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { WorkItemDetails } from "./WorkItemDetails";
import { classifyFields } from "./detailFields";
import { readPinnedKeys } from "./useDetailDisplay";
import { cachedItemDetail, refreshItemDetail } from "./api";
import type { CachedItem, ItemDetail } from "./types";
vi.mock("./api", () => ({ cachedItemDetail: vi.fn(), refreshItemDetail: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
const item = { id: { project_key: "p", work_item_type_key: "story", work_item_id: "1" },
  flow: { kind: "node", node_name: "联调", node_state_key: "n1" } } as CachedItem;
const fields = [
  { key: "description", name: "正文别名", value: "正文内容" },
  { key: "field_code", name: "随意改名的代码字段", value: "feat/example" },
  { key: "field_doc", name: "设计资料", value: "https://example.com/design" },
  { key: "field_other", name: "需求说明", value: "不能按中文名误判正文" },
];
const detail: ItemDetail = { id: item.id, fetched_at_ms: 1, pages: [], data: {
  work_item_attribute: {}, work_item_fields: fields,
  work_item_current_node: [{ id: "n1", name: "联调", owners: ["甲"] }],
} };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(cachedItemDetail).mockResolvedValue(null);
  vi.mocked(refreshItemDetail).mockResolvedValue(detail);
  vi.mocked(invoke).mockImplementation(async (command) => command === "load_detail_display"
    ? { account: "account-a", document: { schemaVersion: 1, pinnedKeys: ["field_code", "field_doc", "deleted"] } } : undefined);
});
afterEach(cleanup);

it("按真实 key 分层，不按中文名或相同文本猜字段语义，并保留有效零值", () => {
  const result = classifyFields([...fields, { key: "zero", value: 0 }, { key: "false", value: false },
    { key: "updated_by", value: "甲" }, { key: "another", value: "甲" }], ["field_code", "field_doc"], { updated_by: "甲" });
  expect(result.description?.key).toBe("description");
  expect(result.pinned.map((f) => f.key)).toEqual(["field_code", "field_doc"]);
  expect(result.inline.map((f) => f.key)).toEqual(["field_other", "zero", "false", "another"]);
  expect(result.system).toEqual([]);
  expect(readPinnedKeys({ schemaVersion: 1, pinnedKeys: ["field_code", "deleted", "field_code"] })).toEqual(["field_code", "deleted"]);
  expect(() => readPinnedKeys({ schemaVersion: 2, pinnedKeys: [] })).toThrow();
});

it("常显字段只出现一次；节点与负责人合并展示；按 key 保存并跨事项和改名恢复", async () => {
  const view = render(<WorkItemDetails item={item} enabled displaySettingsEnabled />);
  await screen.findByText("feat/example");
  await waitFor(() => expect(document.querySelector(".detail-pinned-fields")?.textContent).toContain("feat/example"));
  expect(screen.getAllByText("联调")).toHaveLength(1);
  expect(screen.getByText("甲")).toBeTruthy();
  expect(screen.queryByText("n1")).toBeNull();
  expect(document.querySelector(".detail-more-content")?.textContent).not.toContain("feat/example");
  expect(document.querySelector(".detail-more-information")?.hasAttribute("open")).toBe(false);
  await userEvent.click(screen.getByText("设置常显字段"));
  await userEvent.click(screen.getByRole("button", { name: "随意改名的代码字段" }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("save_detail_display", {
    account: "account-a", project: "p", kind: "story",
    document: { schemaVersion: 1, pinnedKeys: ["field_doc", "deleted"] },
  }));
  expect(document.querySelector(".detail-more-content")?.textContent).toContain("feat/example");
  const other = { ...item, id: { ...item.id, work_item_id: "2" } };
  vi.mocked(refreshItemDetail).mockResolvedValue({ ...detail, id: other.id, data: { ...detail.data,
    work_item_fields: fields.map((f) => f.key === "field_doc" ? { ...f, name: "改名后的文档" } : f) } });
  view.rerender(<WorkItemDetails item={other} enabled displaySettingsEnabled />);
  await screen.findByText("改名后的文档");
  expect(document.querySelector(".detail-pinned-fields")?.textContent).toContain("改名后的文档");
});

it("同名不同 ID 的并行节点不合并，匹配的个人节点只标记一次", async () => {
  vi.mocked(refreshItemDetail).mockResolvedValue({ ...detail, data: { ...detail.data,
    work_item_current_node: [{ id: "n1", name: "联调", owners: ["甲"] }, { id: "n2", name: "联调", owners: ["乙"] }] } });
  render(<WorkItemDetails item={{ ...item, node_scope: "personal" }} enabled />);
  await screen.findByText("联调（我的待办）");
  expect(screen.getAllByText("联调")).toHaveLength(1);
  expect(screen.getByText("乙")).toBeTruthy();
  expect(screen.queryByText(/我的待办节点/)).toBeNull();
});

it("状态与唯一节点相同时只显示一次，并保留节点负责人", async () => {
  vi.mocked(refreshItemDetail).mockResolvedValue({ ...detail, data: { ...detail.data,
    work_item_attribute: { work_item_status: { name: "联调" } } } });
  render(<WorkItemDetails item={item} enabled />);
  await screen.findByText("正文内容");
  expect(screen.getAllByText("联调")).toHaveLength(1);
  expect(screen.getByText("甲")).toBeTruthy();
});

it("同事项刷新保留更多信息展开，换事项收起；未知个人节点保留独立范围", async () => {
  const view = render(<WorkItemDetails item={{ ...item, node_scope: "personal", flow: { ...item.flow, node_state_key: "other" } }} enabled />);
  await screen.findByText("正文内容");
  expect(document.querySelector(".detail-node-overview")?.textContent).toContain("我的待办节点 · 联调");
  await userEvent.click(screen.getByText("更多信息", { exact: true }));
  await waitFor(() => expect(document.querySelector(".detail-more-information")?.hasAttribute("open")).toBe(true));
  await userEvent.click(screen.getByRole("button", { name: "刷新详情" }));
  await waitFor(() => expect(refreshItemDetail).toHaveBeenCalledTimes(2));
  expect(document.querySelector(".detail-more-information")?.hasAttribute("open")).toBe(true);
  const other = { ...item, id: { ...item.id, work_item_id: "2" } };
  vi.mocked(refreshItemDetail).mockResolvedValue({ ...detail, id: other.id });
  view.rerender(<WorkItemDetails item={other} enabled />);
  await waitFor(() => expect(refreshItemDetail).toHaveBeenCalledTimes(3));
  expect(document.querySelector(".detail-more-information")?.hasAttribute("open")).toBe(false);
});

it("不同账号上下文的迟到设置不能覆盖新账号，保存失败保留原选择", async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(invoke).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const view = render(<WorkItemDetails item={item} enabled displaySettingsEnabled displayContext="a" />);
  view.rerender(<WorkItemDetails item={item} enabled displaySettingsEnabled displayContext="b" />);
  await waitFor(() => expect(document.querySelector(".detail-pinned-fields")?.textContent).toContain("feat/example"));
  await act(async () => resolve({ account: "old", document: { schemaVersion: 1, pinnedKeys: [] } }));
  expect(document.querySelector(".detail-pinned-fields")?.textContent).toContain("feat/example");
  await userEvent.click(screen.getByText("设置常显字段"));
  vi.mocked(invoke).mockRejectedValueOnce(new Error("failed"));
  await userEvent.click(screen.getByRole("button", { name: "随意改名的代码字段" }));
  await screen.findByRole("alert");
  expect(document.querySelector(".detail-pinned-fields")?.textContent).toContain("feat/example");
});
