// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

it("同一事项的缓存更新不丢失刚核实的飞书入口", async () => {
  vi.mocked(cachedItemDetail).mockResolvedValue({ ...detail, item_url: null });
  vi.mocked(refreshItemDetail).mockResolvedValue(detail);
  const view = render(<WorkItemDetails item={{ ...item, detail_revision: "1" }} enabled />);
  await screen.findByRole("link", { name: "打开飞书事项" });
  view.rerender(<WorkItemDetails item={{ ...item, detail_revision: "2" }} enabled />);
  await waitFor(() => expect(cachedItemDetail).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("link", { name: "打开飞书事项" }).getAttribute("href")).toBe(url);
});

it("检查状态与打开飞书事项、刷新按钮保持同一行不换行", async () => {
  const styles = readFileSync(resolve(__dirname, "./styles.css"), "utf8");
  const styleEl = document.createElement("style");
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
  try {
    vi.mocked(cachedItemDetail).mockResolvedValue(detail);
    vi.mocked(refreshItemDetail).mockResolvedValue(detail);
    render(<WorkItemDetails item={item} enabled />);
    const link = await screen.findByRole("link", { name: "打开飞书事项" });
    const freshness = link.closest(".detail-freshness") as HTMLElement;
    const status = freshness.querySelector(".detail-check-status") as HTMLElement;
    const actions = freshness.querySelector(".detail-freshness-actions") as HTMLElement;
    expect(getComputedStyle(freshness).flexWrap).toBe("nowrap");
    expect(getComputedStyle(status).whiteSpace).toBe("nowrap");
    expect(getComputedStyle(actions).flexShrink).toBe("0");
    expect(getComputedStyle(actions).whiteSpace).toBe("nowrap");
  } finally {
    styleEl.remove();
  }
});
