// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WorkItemDetails } from "./WorkItemDetails";
import { cachedItemDetail, refreshItemDetail } from "./api";
import type { CachedItem, ItemDetail } from "./types";

vi.mock("./api", () => ({ cachedItemDetail: vi.fn(), refreshItemDetail: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const item = { id: { project_key: "p", work_item_type_key: "story", work_item_id: "1" }, name: "需求甲" } as CachedItem;
const url = "https://project.feishu.cn/example/story/detail/1";
const detail: ItemDetail = { id: item.id, item_url: url, fetched_at_ms: 1, pages: [],
  data: { work_item_attribute: {}, work_item_fields: [] } };

it("使用当前事项详情中的地址提供飞书入口，切换事项时不沿用旧地址", async () => {
  vi.mocked(cachedItemDetail).mockResolvedValueOnce(detail).mockReturnValue(new Promise(() => {}));
  vi.mocked(refreshItemDetail).mockReturnValue(new Promise(() => {}));
  const view = render(<WorkItemDetails item={item} enabled />);
  expect((await screen.findByRole("link", { name: "打开飞书事项" })).getAttribute("href")).toBe(url);
  view.rerender(<WorkItemDetails item={{ ...item, id: { ...item.id, work_item_id: "2" } }} enabled />);
  expect(screen.queryByRole("link", { name: "打开飞书事项" })).toBeNull();
});

it("没有可信的事项地址时不显示跳转入口", async () => {
  vi.mocked(cachedItemDetail).mockResolvedValue({ ...detail, item_url: null });
  vi.mocked(refreshItemDetail).mockResolvedValue({ ...detail, item_url: null });
  render(<WorkItemDetails item={item} enabled />);
  await screen.findByText("角色与人员");
  expect(screen.queryByRole("link", { name: "打开飞书事项" })).toBeNull();
});
