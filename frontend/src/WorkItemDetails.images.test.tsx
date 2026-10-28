// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkItemDetails } from "./WorkItemDetails";
import { cachedItemDetail, loadFieldImage, refreshItemDetail } from "./api";
import type { CachedItem, ItemDetail } from "./types";

vi.mock("./api", () => ({
  cachedItemDetail: vi.fn(),
  loadFieldImage: vi.fn(),
  refreshItemDetail: vi.fn(),
}));

const item = {
  id: { project_key: "p", work_item_type_key: "issue", work_item_id: "1" },
  detail_revision: "v1",
} as CachedItem;
const url = "https://project.feishu.cn/goapi/v5/platform/file/stream/download/example";
const imageData = "data:image/png;base64,iVBORw0KGgo=";
const detail = (text: string, imageUrl = url): ItemDetail => ({
  id: item.id,
  fetched_at_ms: 1,
  data: {
    work_item_attribute: {},
    work_item_fields: [{
      key: "description",
      name: "描述",
      value: `${text}\n\n![截图](${imageUrl})`,
    }],
  },
  pages: [],
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(cachedItemDetail).mockResolvedValue(detail("旧正文"));
  vi.mocked(refreshItemDetail).mockResolvedValue(detail("旧正文"));
  vi.mocked(loadFieldImage).mockResolvedValue(imageData);
});
afterEach(cleanup);

it("刷新详情开始和结束均保留相同图片节点，不重复下载，仍更新正文", async () => {
  const user = userEvent.setup();
  render(<WorkItemDetails item={item} enabled />);
  const image = await screen.findByAltText("截图");
  const refresh = await screen.findByRole("button", { name: "刷新详情" });
  let finish!: (value: ItemDetail) => void;
  vi.mocked(refreshItemDetail).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));

  await user.click(refresh);
  expect(screen.getByRole("button", { name: "正在检查最新信息" })).toHaveProperty("disabled", true);
  expect(screen.getByAltText("截图")).toBe(image);
  expect(screen.queryByText("正在加载图片…")).toBeNull();

  await act(async () => finish(detail("新正文")));
  expect(screen.getByText("新正文")).toBeTruthy();
  expect(screen.getByAltText("截图")).toBe(image);
  expect(image.getAttribute("src")).toBe(imageData);
  expect(loadFieldImage).toHaveBeenCalledOnce();
});

it("同步回读相同图片时保留节点，图片地址变化时加载新图片", async () => {
  const view = render(<WorkItemDetails item={item} enabled />);
  const image = await screen.findByAltText("截图");
  await screen.findByRole("button", { name: "刷新详情" });
  vi.mocked(cachedItemDetail).mockResolvedValue(detail("同步正文"));
  view.rerender(<WorkItemDetails item={{ ...item, detail_revision: "v2" }} enabled />);
  await screen.findByText("同步正文");
  expect(screen.getByAltText("截图")).toBe(image);
  expect(loadFieldImage).toHaveBeenCalledOnce();

  const nextUrl = `${url}-new`;
  const nextData = "data:image/png;base64,new";
  vi.mocked(cachedItemDetail).mockResolvedValue(detail("更新图片", nextUrl));
  vi.mocked(loadFieldImage).mockResolvedValue(nextData);
  view.rerender(<WorkItemDetails item={{ ...item, detail_revision: "v3" }} enabled />);
  await screen.findByText("更新图片");
  const nextImage = await screen.findByAltText("截图");
  expect(nextImage).not.toBe(image);
  expect(nextImage.getAttribute("src")).toBe(nextData);
  expect(loadFieldImage).toHaveBeenLastCalledWith(item.id, "description", nextUrl, false);
});
