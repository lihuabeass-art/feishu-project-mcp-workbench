// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { RelatedDefects } from "./RelatedDefects";
import type { CachedItem } from "./types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const item = { id: { project_key: "space", work_item_type_key: "story", work_item_id: "11" }, name: "当前需求", flow: { kind: "node" }, schedule: {} } as CachedItem;
const rows = [
  { item: { ...item, id: { project_key: "space", work_item_type_key: "issue", work_item_id: "21" }, name: "我的缺陷" }, status: "待处理", operators: ["开发"], mine: true },
  { item: { ...item, id: { project_key: "space", work_item_type_key: "issue", work_item_id: "22" }, name: "其他缺陷" }, status: "处理中", operators: [], mine: null },
];
beforeEach(() => { vi.resetAllMocks(); vi.mocked(invoke).mockResolvedValue({ relation_field: "relation", items: rows, mine_available: true, incomplete_details: 0 }); });
afterEach(cleanup);

it("自动读取本机缺陷，筛选已知个人来源并打开缺陷", async () => {
  const open = vi.fn(), create = vi.fn(), user = userEvent.setup();
  render(<RelatedDefects item={item} canCreate open={open} create={create} revision="0" />);
  await screen.findByText("我的缺陷");
  expect(screen.queryByText(/显示本机已同步的缺陷/)).toBeNull();
  expect(invoke).toHaveBeenCalledWith("list_related_defects", { itemId: item.id });
  await user.click(screen.getByRole("button", { name: "与我相关" }));
  expect(screen.queryByText("其他缺陷")).toBeNull();
  await user.click(screen.getByRole("button", { name: /我的缺陷/ }));
  expect(open.mock.calls[0][0].id).toEqual(rows[0].item.id);
  await user.click(screen.getByRole("button", { name: "＋ 新建缺陷" }));
  expect(create).toHaveBeenCalledWith("relation");
});

it("没有关联缺陷且关闭新建时隐藏整栏", async () => {
  vi.mocked(invoke).mockResolvedValue({ relation_field: "relation", items: [], mine_available: false, incomplete_details: 1 });
  const view = render(<RelatedDefects item={item} canCreate open={vi.fn()} create={vi.fn()} revision="0" />);
  await screen.findByRole("button", { name: "＋ 新建缺陷" });
  view.rerender(<RelatedDefects item={item} canCreate={false} open={vi.fn()} create={vi.fn()} revision="0" />);
  expect(screen.queryByRole("region", { name: "关联缺陷" })).toBeNull();
});

it("没有关联缺陷但开启新建时只保留新建入口", async () => {
  vi.mocked(invoke).mockResolvedValue({ relation_field: "relation", items: [], mine_available: false, incomplete_details: 1 });
  const create = vi.fn();
  render(<RelatedDefects item={item} canCreate open={vi.fn()} create={create} revision="0" />);
  await userEvent.click(await screen.findByRole("button", { name: "＋ 新建缺陷" }));
  expect(create).toHaveBeenCalledWith("relation");
  expect(screen.queryByRole("group", { name: "关联缺陷筛选" })).toBeNull();
  expect(screen.queryByText(/本机|同步/)).toBeNull();
});

it("已有同步改变本机内容时自动更新，开启新建后才提供入口", async () => {
  const view = render(<RelatedDefects item={item} canCreate={false} open={vi.fn()} create={vi.fn()} revision="first" />);
  await screen.findByText("我的缺陷");
  expect(screen.queryByRole("button", { name: "＋ 新建缺陷" })).toBeNull();
  vi.mocked(invoke).mockResolvedValue({ relation_field: "relation", items: [rows[1]], mine_available: true, incomplete_details: 0 });
  view.rerender(<RelatedDefects item={item} canCreate open={vi.fn()} create={vi.fn()} revision="after-sync" />);
  await waitFor(() => expect(screen.queryByText("我的缺陷")).toBeNull());
  expect(screen.getByText("其他缺陷")).toBeTruthy();
  expect(screen.getByRole("button", { name: "＋ 新建缺陷" })).toBeTruthy();
  expect(vi.mocked(invoke).mock.calls.every(([command]) => command === "list_related_defects")).toBe(true);
});
