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
  { key: "field_other", name: "需求说明", value: "另一份说明" },
];
const detail: ItemDetail = { id: item.id, fetched_at_ms: 1, pages: [], data: {
  work_item_attribute: {}, work_item_fields: fields,
  work_item_current_node: [{ id: "n1", name: "联调", owners: ["甲"] }],
} };
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.mocked(cachedItemDetail).mockResolvedValue(null);
  vi.mocked(refreshItemDetail).mockResolvedValue(detail);
  vi.mocked(invoke).mockImplementation(async (command) => command === "load_detail_display"
    ? { account: "account-a", document: { schemaVersion: 1, pinnedKeys: ["field_code", "field_doc", "deleted"] } } : undefined);
});
afterEach(cleanup);

it("同名说明各自展示，不覆盖其他字段，并保留有效零值", () => {
  const result = classifyFields([...fields, { key: "zero", value: 0 }, { key: "false", value: false },
    { key: "updated_by", value: "甲" }, { key: "another", value: "甲" }], ["field_code", "field_doc"], { updated_by: "甲" });
  expect(result.descriptions.map((f) => f.key)).toEqual(["description", "field_other"]);
  expect(result.pinned.map((f) => f.key)).toEqual(["field_code", "field_doc"]);
  expect(result.inline.map((f) => f.key)).toEqual(["zero", "false", "another"]);
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
  await userEvent.click(screen.getByRole("button", { name: "取消常显随意改名的代码字段" }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("save_detail_display", {
    account: "account-a", project: "p", kind: "story",
    document: { schemaVersion: 2, pinnedKeys: ["field_doc", "deleted"], excludedDefaultKeys: [] },
  }));
  expect(document.querySelector(".detail-more-content")?.textContent).toContain("feat/example");
  const other = { ...item, id: { ...item.id, work_item_id: "2" } };
  vi.mocked(refreshItemDetail).mockResolvedValue({ ...detail, id: other.id, data: { ...detail.data,
    work_item_fields: fields.map((f) => f.key === "field_doc" ? { ...f, name: "改名后的文档" } : f) } });
  view.rerender(<WorkItemDetails item={other} enabled displaySettingsEnabled />);
  await screen.findByText("改名后的文档");
  expect(document.querySelector(".detail-pinned-fields")?.textContent).toContain("改名后的文档");
});

it("自定义说明和版本字段默认可见，不因缺少内置说明而显示为空", async () => {
  vi.mocked(invoke).mockResolvedValue({ account: "account-a", document: null });
  vi.mocked(refreshItemDetail).mockResolvedValue({ ...detail, data: { ...detail.data, work_item_fields: [
    { key: "field_text", name: "需求说明", value: "实际说明内容" },
    { key: "field_version", name: "代码版本号", value: "v1.2" },
    { key: "field_plan", name: "规划版本", value: "2026-Q4" },
  ] } });
  render(<WorkItemDetails item={item} enabled displaySettingsEnabled />);
  expect(await screen.findByText("实际说明内容")).toBeTruthy();
  expect(screen.queryByText(/暂无需求说明/)).toBeNull();
  expect(document.querySelector(".detail-pinned-fields")?.textContent).toContain("v1.2");
  expect(document.querySelector(".detail-pinned-fields")?.textContent).toContain("2026-Q4");
  await userEvent.click(screen.getByText("设置常显字段"));
  expect(screen.queryByRole("button", { name: /(?:设为常显|取消常显)需求说明/ })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "取消常显代码版本号" }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("save_detail_display", {
    account: "account-a", project: "p", kind: "story",
    document: { schemaVersion: 2, pinnedKeys: [], excludedDefaultKeys: ["field_version"] },
  }));
  expect(document.querySelector(".detail-pinned-fields")?.textContent).not.toContain("v1.2");
});

it("未返回说明时不误称为空，同名内置与自定义说明均不丢失", async () => {
  vi.mocked(refreshItemDetail).mockResolvedValueOnce({ ...detail, data: { ...detail.data, work_item_fields: [] } });
  const view = render(<WorkItemDetails item={item} enabled />);
  expect(await screen.findByText("详情未返回已识别的说明字段，可在更多信息或飞书中查看。")).toBeTruthy();
  const other = { ...item, id: { ...item.id, work_item_id: "2" } };
  vi.mocked(refreshItemDetail).mockResolvedValueOnce({ ...detail, id: other.id, data: { ...detail.data, work_item_fields: [
    { key: "description", name: "需求说明", value: "" },
    { key: "field_text", name: "需求说明", value: "真实内容" },
  ] } });
  view.rerender(<WorkItemDetails item={other} enabled />);
  expect(await screen.findByText("真实内容")).toBeTruthy();
  expect(screen.getByText("该字段为空，其他说明可在更多信息或飞书中查看。")).toBeTruthy();
});

it("说明字段缺少 value 时不声称其内容为空", async () => {
  vi.mocked(refreshItemDetail).mockResolvedValue({ ...detail, data: { ...detail.data,
    work_item_fields: [{ key: "description", name: "需求说明" }] } });
  render(<WorkItemDetails item={item} enabled />);
  expect(await screen.findByText("详情未返回该字段的内容，可在飞书中查看。")).toBeTruthy();
  expect(screen.queryByText(/该字段为空/)).toBeNull();
});

it("旧设置升级后保留原字段，默认版本可取消并在重开后保持取消", async () => {
  const versionFields = [
    { key: "field_version", name: "代码版本号", value: "v2" },
    { key: "field_doc", name: "设计资料", value: "文档内容" },
  ];
  vi.mocked(refreshItemDetail).mockResolvedValue({ ...detail, data: { ...detail.data, work_item_fields: versionFields } });
  vi.mocked(invoke).mockResolvedValueOnce({ account: "account-a", document: { schemaVersion: 1, pinnedKeys: ["field_doc", "deleted"] } });
  const view = render(<WorkItemDetails item={item} enabled displaySettingsEnabled />);
  await screen.findByText("v2");
  await waitFor(() => expect(document.querySelector(".detail-pinned-fields")?.textContent).toContain("文档内容"));
  await userEvent.click(screen.getByText("设置常显字段"));
  await userEvent.click(screen.getByRole("button", { name: "取消常显代码版本号" }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("save_detail_display", {
    account: "account-a", project: "p", kind: "story",
    document: { schemaVersion: 2, pinnedKeys: ["field_doc", "deleted"], excludedDefaultKeys: ["field_version"] },
  }));
  view.unmount();
  vi.mocked(invoke).mockResolvedValueOnce({ account: "account-a", document: {
    schemaVersion: 2, pinnedKeys: ["field_doc", "deleted"], excludedDefaultKeys: ["field_version"],
  } });
  render(<WorkItemDetails item={item} enabled displaySettingsEnabled />);
  await screen.findByText("文档内容");
  await waitFor(() => expect(document.querySelector(".detail-pinned-fields")?.textContent).not.toContain("v2"));
  await userEvent.click(screen.getByText("设置常显字段"));
  expect(screen.getByRole("button", { name: "设为常显代码版本号" }).getAttribute("aria-pressed")).toBe("false");
});

it("常显字段配置支持搜索、筛选、清空和键盘关闭", async () => {
  render(<WorkItemDetails item={item} enabled displaySettingsEnabled />);
  await screen.findByText("正文内容");
  const trigger = screen.getByRole("button", { name: /设置常显字段/ });
  await userEvent.click(trigger);
  const search = screen.getByRole("textbox", { name: "搜索常显字段" });
  await userEvent.type(search, "设计");
  expect(screen.getByRole("button", { name: "取消常显设计资料" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "取消常显随意改名的代码字段" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "未显示" }));
  expect(screen.getByText("没有找到匹配的字段。")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "清空常显字段搜索" }));
  expect(document.activeElement).toBe(search);
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("region", { name: "常显字段配置" })).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("三项设计文档固定显示且不进入选择区，字段改名后仍沿用已识别的 key", async () => {
  const initialFields = [
    { key: "desc", name: "需求说明", value: "说明原文" },
    { key: "version", name: "代码版本号", value: "v3" },
    ...["产品设计文档", "后端设计文档", "前端设计文档"].map((name, i) => ({ key: `doc${i}`, name, value: `文档 ${i}` })),
  ];
  vi.mocked(invoke).mockResolvedValue({ account: "account-a", document: null });
  vi.mocked(refreshItemDetail).mockResolvedValue({ ...detail, data: { ...detail.data, work_item_fields: initialFields } });
  const view = render(<WorkItemDetails item={item} enabled displaySettingsEnabled />);
  await screen.findByText("说明原文");
  await waitFor(() => expect(localStorage.length).toBeGreaterThan(0));
  expect(document.querySelector(".detail-pinned-fields")?.textContent).toContain("文档 0");
  expect(document.querySelector(".detail-pinned-fields")?.textContent).toContain("文档 1");
  expect(document.querySelector(".detail-pinned-fields")?.textContent).toContain("文档 2");
  await userEvent.click(screen.getByText("设置常显字段"));
  expect(screen.queryByRole("button", { name: /常显.*设计文档/ })).toBeNull();
  const other = { ...item, id: { ...item.id, work_item_id: "2" } };
  vi.mocked(refreshItemDetail).mockResolvedValue({ ...detail, id: other.id, data: { ...detail.data,
    work_item_fields: initialFields.map((f) => ({ ...f, name: `改名 ${f.key}` })) } });
  view.rerender(<WorkItemDetails item={other} enabled displaySettingsEnabled />);
  await screen.findByText("改名 doc0");
  expect(document.querySelector(".detail-description")?.textContent).toContain("说明原文");
  expect(document.querySelector(".detail-pinned-fields")?.textContent).toContain("v3");
  expect(document.querySelector(".detail-pinned-fields")?.textContent).toContain("文档 2");
});

it("手动常显与概要重复的字段时卡片状态和实际显示一致", () => {
  const alias = { key: "updated_by", name: "更新人", value: "甲" };
  expect(classifyFields([alias], [], { updated_by: "甲" }).pinned).toEqual([]);
  expect(classifyFields([alias], ["updated_by"], { updated_by: "甲" }).pinned).toEqual([alias]);
});

it.each([
  ["account-b", "p", "story"], ["account-a", "other-space", "story"], ["account-a", "p", "issue"],
])("已识别字段隔离范围 %s/%s/%s，不为未返回的字段编造值", async (account, project, kind) => {
  localStorage.setItem(`fstodo.detail-field-identities.v1:${JSON.stringify(["account-a", "p", "story"])}`,
    JSON.stringify({ descriptions: ["custom"], versions: ["missing"], documents: ["missing-doc"] }));
  vi.mocked(invoke).mockResolvedValue({ account, document: null });
  const scopedItem = { ...item, id: { ...item.id, project_key: project, work_item_type_key: kind } };
  vi.mocked(refreshItemDetail).mockResolvedValue({ ...detail, id: scopedItem.id, data: { ...detail.data,
    work_item_fields: [{ key: "custom", name: "其他字段", value: "其他内容" }] } });
  render(<WorkItemDetails item={scopedItem} enabled displaySettingsEnabled />);
  expect(await screen.findByText("详情未返回已识别的说明字段，可在更多信息或飞书中查看。")).toBeTruthy();
  expect(document.querySelector(".detail-pinned-fields")).toBeNull();
  expect(document.querySelector(".detail-more-content")?.textContent).toContain("其他内容");
});

it("同范围的多个详情实例合并字段身份", async () => {
  const second = { ...item, id: { ...item.id, work_item_id: "2" } };
  vi.mocked(invoke).mockResolvedValue({ account: "account-a", document: null });
  vi.mocked(refreshItemDetail).mockImplementation(async (id) => ({ ...detail, id, data: { ...detail.data,
    work_item_fields: [{ key: id.work_item_id === "1" ? "doc-a" : "doc-b", name: "产品设计文档", value: "文档" }] } }));
  render(<><WorkItemDetails item={item} enabled displaySettingsEnabled /><WorkItemDetails item={second} enabled displaySettingsEnabled /></>);
  const key = `fstodo.detail-field-identities.v1:${JSON.stringify(["account-a", "p", "story"])}`;
  await waitFor(() => expect(JSON.parse(localStorage.getItem(key) || "{}").documents).toEqual(expect.arrayContaining(["doc-a", "doc-b"])));
});

it("另一详情识别文档后，已打开的改名字段立即同步显示", async () => {
  let resolve!: (value: ItemDetail) => void;
  const second = { ...item, id: { ...item.id, work_item_id: "2" } };
  vi.mocked(invoke).mockResolvedValue({ account: "account-a", document: null });
  vi.mocked(refreshItemDetail).mockImplementation((id) => id.work_item_id === "1"
    ? new Promise((done) => { resolve = done; })
    : Promise.resolve({ ...detail, id, data: { ...detail.data, work_item_fields: [
      { key: "doc", name: "已改名文档", value: "乙的文档" },
    ] } }));
  const { container } = render(<><WorkItemDetails item={item} enabled displaySettingsEnabled /><WorkItemDetails item={second} enabled displaySettingsEnabled /></>);
  await screen.findByText("乙的文档");
  expect(container.querySelector(".detail-pinned-fields")?.textContent ?? "").not.toContain("乙的文档");
  await act(async () => resolve({ ...detail, data: { ...detail.data, work_item_fields: [
    { key: "doc", name: "产品设计文档", value: "甲的文档" },
  ] } }));
  await waitFor(() => expect([...container.querySelectorAll(".detail-pinned-fields")].some((node) => node.textContent?.includes("乙的文档"))).toBe(true));
});

it("切换账号后未完成远端检查前，不将旧缓存识别结果写入新账号", async () => {
  let resolve!: (value: ItemDetail) => void;
  const old = { ...detail, data: { ...detail.data, work_item_fields: [
    { key: "old-doc", name: "产品设计文档", value: "旧缓存" },
    { key: "old-version", name: "代码版本号", value: "v1" },
  ] } };
  vi.mocked(cachedItemDetail).mockResolvedValue(old);
  vi.mocked(invoke).mockResolvedValueOnce({ account: "account-a", document: null }).mockResolvedValueOnce({ account: "account-b", document: null });
  vi.mocked(refreshItemDetail).mockResolvedValueOnce(old).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const view = render(<WorkItemDetails item={item} enabled displaySettingsEnabled displayContext="a" />);
  await waitFor(() => expect(localStorage.length).toBe(1));
  view.rerender(<WorkItemDetails item={item} enabled displaySettingsEnabled displayContext="b" />);
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  const key = `fstodo.detail-field-identities.v1:${JSON.stringify(["account-b", "p", "story"])}`;
  expect(localStorage.getItem(key)).toBeNull();
  await userEvent.click(screen.getByText("设置常显字段"));
  const version = screen.getByRole("button", { name: "取消常显代码版本号" });
  expect((version as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(version);
  expect(vi.mocked(invoke).mock.calls.some(([command]) => command === "save_detail_display")).toBe(false);
  await act(async () => resolve({ ...detail, data: { ...detail.data, work_item_fields: [] } }));
  await waitFor(() => expect(localStorage.getItem(key)).not.toBeNull());
  expect(JSON.parse(localStorage.getItem(key)!).documents).not.toContain("old-doc");
});

it("重新刷新期间暂停保存，取得可采用的详情后恢复", async () => {
  let resolve!: (value: ItemDetail) => void;
  vi.mocked(refreshItemDetail).mockResolvedValueOnce(detail).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  render(<WorkItemDetails item={item} enabled displaySettingsEnabled />);
  await screen.findByText("正文内容");
  await userEvent.click(screen.getByText("设置常显字段"));
  const card = screen.getByRole("button", { name: "取消常显随意改名的代码字段" }) as HTMLButtonElement;
  expect(card.disabled).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "刷新详情" }));
  expect(card.disabled).toBe(true);
  await act(async () => resolve(detail));
  await waitFor(() => expect(card.disabled).toBe(false));
});

it("同步期间缓存回读为空时不把保留的旧详情作为可保存依据", async () => {
  let resolve!: (value: ItemDetail) => void;
  vi.mocked(cachedItemDetail).mockResolvedValueOnce(detail).mockResolvedValue(null);
  vi.mocked(refreshItemDetail).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const view = render(<WorkItemDetails item={item} enabled displaySettingsEnabled />);
  await screen.findByText("正文内容");
  view.rerender(<WorkItemDetails item={{ ...item, detail_revision: "new" }} enabled displaySettingsEnabled />);
  await waitFor(() => expect(cachedItemDetail).toHaveBeenCalledTimes(2));
  await act(async () => resolve(detail));
  await userEvent.click(screen.getByText("设置常显字段"));
  const card = screen.getByRole("button", { name: "取消常显随意改名的代码字段" }) as HTMLButtonElement;
  expect(card.disabled).toBe(true);
  expect(localStorage.length).toBe(0);
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
  await userEvent.click(screen.getByRole("button", { name: "取消常显随意改名的代码字段" }));
  await screen.findByRole("alert");
  expect(document.querySelector(".detail-pinned-fields")?.textContent).toContain("feat/example");
});
