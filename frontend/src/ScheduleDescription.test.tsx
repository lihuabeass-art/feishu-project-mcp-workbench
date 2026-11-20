// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { cachedItemDetail, refreshItemDetail } from "./api";
import { ScheduleDescription } from "./ScheduleDescription";
import type { ItemDetail } from "./types";

vi.mock("./api", () => ({ cachedItemDetail: vi.fn(), refreshItemDetail: vi.fn(), loadFieldImage: vi.fn() }));
const detail = (type: string, item: string, name: string, value: string): ItemDetail => ({
  id: { project_key: "p", work_item_type_key: type, work_item_id: item }, fetched_at_ms: 1,
  data: { work_item_attribute: {}, work_item_fields: [{ key: "description", name, value }] }, pages: [],
});
afterEach(() => { cleanup(); vi.resetAllMocks(); localStorage.clear(); });

it("展示需求缓存与更新后的富文本说明", async () => {
  vi.mocked(cachedItemDetail).mockResolvedValue(detail("story", "1", "需求说明", "缓存说明"));
  let resolve!: (value: ItemDetail) => void;
  vi.mocked(refreshItemDetail).mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<ScheduleDescription connection="c" project="p" type="story" item="1" />);
  expect(await screen.findByText("缓存说明")).toBeTruthy();
  resolve(detail("story", "1", "需求说明", "**最新说明**"));
  expect(await screen.findByText("最新说明")).toBeTruthy();
});

it("展示缺陷说明并在读取失败时保留缓存与重试", async () => {
  vi.mocked(cachedItemDetail).mockResolvedValue(detail("issue", "2", "缺陷描述", "缺陷内容"));
  vi.mocked(refreshItemDetail).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(detail("issue", "2", "缺陷描述", "已恢复"));
  render(<ScheduleDescription connection="c" project="p" type="issue" item="2" />);
  expect(await screen.findByText("缺陷内容")).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: "重试" }));
  expect(await screen.findByText("已恢复")).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole("button", { name: "重试" })).toBeNull());
});

it("识别自定义缺陷说明，并在云端缺少字段时保留缓存", async () => {
  const cached = detail("issue", "2", "缺陷说明", "原有缺陷说明");
  cached.data.work_item_fields[0].key = "custom";
  vi.mocked(cachedItemDetail).mockResolvedValue(cached);
  const incomplete = detail("issue", "2", "其他", "其他内容");
  incomplete.data.work_item_fields = [];
  vi.mocked(refreshItemDetail).mockResolvedValue(incomplete);
  render(<ScheduleDescription connection="c" project="p" type="issue" item="2" />);
  expect(await screen.findByText("原有缺陷说明")).toBeTruthy();
  expect(await screen.findByRole("button", { name: "重试" })).toBeTruthy();
});

it("字段改名后重试且缓存不可用时仍保留当前说明", async () => {
  localStorage.setItem(`fstodo.detail-field-identities.v1:${JSON.stringify(["c", "p", "issue"])}`, JSON.stringify({ descriptions: ["custom"], versions: [], documents: [] }));
  const cached = detail("issue", "2", "改名后的字段", "已显示的说明");
  cached.data.work_item_fields[0].key = "custom";
  vi.mocked(cachedItemDetail).mockResolvedValueOnce(cached).mockResolvedValueOnce(null);
  vi.mocked(refreshItemDetail).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ...cached, data: { ...cached.data, work_item_fields: [] } });
  render(<ScheduleDescription connection="c" project="p" type="issue" item="2" />);
  fireEvent.click(await screen.findByRole("button", { name: "重试" }));
  expect(await screen.findByText("已显示的说明")).toBeTruthy();
  await waitFor(() => expect(screen.getByRole("button", { name: "重试" })).toBeTruthy());
});
