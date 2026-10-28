// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { cachedItemDetail, getWorkflowActions, loadSnapshot, refreshItemDetail, syncTodos } from "./api";
import type { CachedItem, ItemDetail, Snapshot, SyncReport } from "./types";

vi.mock("./api", () => ({
  desktop: true, loadSnapshot: vi.fn(), syncTodos: vi.fn(), checkConnection: vi.fn(),
  saveToken: vi.fn(), saveConnectionSettings: vi.fn(), getWorkflowActions: vi.fn(),
  executeWorkflowAction: vi.fn(), refreshSourceTypes: vi.fn(), saveSourceTypes: vi.fn(),
  clearSourceTypes: vi.fn(), saveTypeOrder: vi.fn(), cachedItemDetail: vi.fn(), refreshItemDetail: vi.fn(),
}));

beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); });
afterEach(cleanup);

it.each([true, false])("同步后当前详情自动回读，其他事项不干扰阅读与流程草稿（增量=%s）", async (incremental) => {
  const current: CachedItem = {
    id: { project_key: "p", work_item_type_key: "story", work_item_id: "1" },
    source_ids: ["a"], name: "需求甲", project_name: "研发空间", detail_revision: "v1",
    flow: { kind: "node", node_name: "研发", node_state_key: null, start_state_key_name: null, end_state_key_name: null },
    schedule: { start_raw: null, end_raw: null }, raw_json: "{}", identity_missing_flags: [],
    first_seen_at_ms: 1, last_seen_at_ms: 1, seen_count: 1,
  };
  const other = { ...current, id: { ...current.id, work_item_id: "2" }, name: "需求乙" };
  let snapshot: Snapshot = {
    items: [current, other], total: 2, runs: [], last_success: null,
    capabilities: { workflow: true, details: true, incremental_sync: incremental },
    sources: [{ id: "a", kind: "personal_todo", enabled: true, executable: true, reason: null, action: "todo", todo_scope: "in_progress" }],
    config_path: "config.toml", db_path: "cache.db", credential_ready: true, credential_description: "测试",
  };
  let detail: ItemDetail = { id: current.id, fetched_at_ms: 1, pages: [],
    data: { work_item_attribute: {}, work_item_fields: [{ key: "description", value: "初始正文" }] } };
  vi.mocked(loadSnapshot).mockImplementation(async () => snapshot);
  vi.mocked(cachedItemDetail).mockImplementation(async () => detail);
  vi.mocked(refreshItemDetail).mockImplementation(async () => detail);
  vi.mocked(getWorkflowActions).mockResolvedValue({ version: "flow-v1", actions: [{
    id: "complete", label: "完成研发节点", kind: "node", fields: [{ key: "doc", label: "设计文档", kind: "text", required: true }],
  }] });
  const report = (modified: CachedItem[], failed = false): SyncReport => ({
    status: failed ? "failed" : "success", complete: !failed, items_upserted: modified.length,
    items_inserted: 0, items_updated: modified.length, items_rejected: failed ? 1 : 0,
    stop_reason: failed ? "error" : "total_reached",
    ...(incremental ? { patch: { added: [], modified, removed: [] } } : {}),
  });
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole("button", { name: /需求甲.*需求/ }));
  await screen.findByText("初始正文");
  await waitFor(() => expect(screen.getByRole("button", { name: "刷新详情" })).toBeTruthy());
  await user.click(await screen.findByRole("button", { name: "完成研发节点" }));
  const input = screen.getByLabelText("设计文档（必填）");
  await user.type(input, "正在编辑的草稿");
  const panel = screen.getByRole("complementary", { name: "事项详情" });
  panel.scrollTop = 120;
  const reads = vi.mocked(cachedItemDetail).mock.calls.length;
  const workflowReads = vi.mocked(getWorkflowActions).mock.calls.length;
  expect(getWorkflowActions).toHaveBeenLastCalledWith(current.id, true);

  const changedOther = { ...other, detail_revision: "other-v2" };
  snapshot = { ...snapshot, items: [current, changedOther] };
  vi.mocked(syncTodos).mockResolvedValueOnce(report([changedOther]));
  await user.click(screen.getByRole("button", { name: "立即刷新" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "立即刷新" })).toBeTruthy());
  expect(cachedItemDetail).toHaveBeenCalledTimes(reads);
  expect(getWorkflowActions).toHaveBeenCalledTimes(workflowReads);

  const changedCurrent = { ...current, detail_revision: "v2" };
  snapshot = { ...snapshot, items: [changedCurrent, changedOther] };
  detail = { ...detail, fetched_at_ms: 2, data: { ...detail.data,
    work_item_fields: [{ key: "description", value: "后台已落库的新正文" }] } };
  // 部分来源失败也不应丢掉已成功落库的详情变化。
  vi.mocked(syncTodos).mockResolvedValueOnce(report([changedCurrent], true));
  await user.click(screen.getByRole("button", { name: "立即刷新" }));
  await screen.findByText("后台已落库的新正文");
  expect(screen.queryByText("初始正文")).toBeNull();
  expect(refreshItemDetail).toHaveBeenCalledOnce();
  await waitFor(() => expect(getWorkflowActions).toHaveBeenCalledTimes(workflowReads + 1));
  expect(getWorkflowActions).toHaveBeenLastCalledWith(current.id, true);
  expect(screen.getByLabelText("设计文档（必填）")).toBe(input);
  expect(input).toHaveProperty("value", "正在编辑的草稿");
  expect(screen.getByRole("complementary", { name: "事项详情" })).toBe(panel);
  expect(panel.scrollTop).toBe(120);

  await user.click(screen.getByRole("button", { name: "提交" }));
  const review = screen.getByRole("region", { name: "提交前二次确认" });
  expect(review.textContent).toContain("正在编辑的草稿");
  const reviewWorkflowReads = vi.mocked(getWorkflowActions).mock.calls.length;
  expect(reviewWorkflowReads).toBe(workflowReads + 2);
  const changedAgain = { ...changedCurrent, detail_revision: "v3" };
  snapshot = { ...snapshot, items: [changedAgain, changedOther] };
  detail = { ...detail, data: { ...detail.data,
    work_item_fields: [{ key: "description", value: "再次同步的新正文" }] } };
  vi.mocked(syncTodos).mockResolvedValueOnce(report([changedAgain]));
  await user.click(screen.getByRole("button", { name: "立即刷新" }));
  await screen.findByText("再次同步的新正文");
  expect(screen.getByRole("region", { name: "提交前二次确认" })).toBe(review);
  expect(review.textContent).toContain("正在编辑的草稿");
  expect(getWorkflowActions).toHaveBeenCalledTimes(reviewWorkflowReads);
  expect(refreshItemDetail).toHaveBeenCalledOnce();
});
