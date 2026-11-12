// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { cachedItemDetail, loadFieldImage, refreshItemDetail } from "./api";
import { loadLinkMetadata } from "./linkMetadata";
import { CachedDefectDetails } from "./CachedDefectDetails";
import type { CachedItem } from "./types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./api", () => ({ cachedItemDetail: vi.fn(), loadFieldImage: vi.fn(), refreshItemDetail: vi.fn() }));
vi.mock("./linkMetadata", () => ({ loadLinkMetadata: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("详情、图片与链接只读本机，不触发远端读取", async () => {
  const item = { id: { project_key: "p", work_item_type_key: "issue", work_item_id: "1" } } as CachedItem;
  const url = "https://project.feishu.cn/goapi/v5/platform/file/stream/download/example";
  vi.mocked(cachedItemDetail).mockResolvedValue({ id: item.id, fetched_at_ms: 1, pages: [], data: { work_item_attribute: {}, work_item_fields: [{ key: "description", name: "缺陷描述", value: `说明\n\n![](${url})\n\nhttps://example.com` }] } });
  vi.mocked(invoke).mockResolvedValue(null);
  render(<CachedDefectDetails item={item} />);
  await screen.findByText("缺陷描述");
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("cached_field_image", { itemId: item.id, fieldKey: "description", url }));
  expect(await screen.findByText(/本机尚未缓存图片/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "https://example.com" })).toBeTruthy();
  expect(refreshItemDetail).not.toHaveBeenCalled();
  expect(loadFieldImage).not.toHaveBeenCalled();
  expect(loadLinkMetadata).not.toHaveBeenCalled();
});

it("同步后的详情版本变化时重新读取本机内容", async () => {
  const item = { id: { project_key: "p", work_item_type_key: "issue", work_item_id: "1" }, detail_revision: "one" } as CachedItem;
  const detail = (text: string) => ({ id: item.id, fetched_at_ms: 1, pages: [], data: { work_item_attribute: {}, work_item_fields: [{ key: "description", name: "缺陷描述", value: text }] } });
  vi.mocked(cachedItemDetail).mockResolvedValueOnce(detail("旧内容")).mockResolvedValueOnce(detail("同步后内容"));
  const view = render(<CachedDefectDetails item={item} />);
  await screen.findByText("旧内容");
  view.rerender(<CachedDefectDetails item={{ ...item, detail_revision: "two" }} />);
  await screen.findByText("同步后内容");
  expect(cachedItemDetail).toHaveBeenCalledTimes(2);
  expect(refreshItemDetail).not.toHaveBeenCalled();
});
