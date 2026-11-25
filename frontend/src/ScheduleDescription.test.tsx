// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

it("排期检查器按需求编号、代码版本号顺序展示缓存与最新字段，保留多行内容", async () => {
  const cached = detail("story", "1", "需求说明", "说明");
  cached.data.work_item_fields.push(
    { key: "version", name: "代码版本号", value: "后端：feat/example/model-catalog-sync\n（example-service）" },
    { key: "number", name: "需求编号", value: "REQ-20261125-0001" },
    { key: "other", name: "其他字段", value: "不展示的内容" },
  );
  vi.mocked(cachedItemDetail).mockResolvedValue(cached);
  let resolve!: (value: ItemDetail) => void;
  vi.mocked(refreshItemDetail).mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<ScheduleDescription connection="c" project="p" type="story" item="1" />);
  await screen.findByText("REQ-20261125-0001");
  const fields = document.querySelector(".schedule-inspector-fields")!;
  expect([...fields.querySelectorAll("dt")].map((node) => node.textContent)).toEqual(["需求编号", "代码版本号"]);
  expect(within(fields as HTMLElement).getByText("REQ-20261125-0001")).toBeTruthy();
  expect(fields.textContent).toContain("（example-service）");
  expect(fields.textContent).toContain("feat/example/model-catalog-sync");
  expect(screen.queryByText("不展示的内容")).toBeNull();
  resolve({ ...cached, data: { ...cached.data, work_item_fields: cached.data.work_item_fields.map((field) =>
    field.key === "version" ? { ...field, value: "后端：v2" } : field) } });
  expect(await screen.findByText("后端：v2")).toBeTruthy();
});

it("字段部分缺失时保留已有信息，重试后接受真实清空并保留有效零值", async () => {
  const cached = detail("story", "1", "需求说明", "说明");
  cached.data.work_item_fields.push(
    { key: "number", name: "需求编号", value: "REQ-0001" },
    { key: "version", name: "代码版本号", value: "v1" },
  );
  vi.mocked(cachedItemDetail).mockResolvedValue(cached);
  vi.mocked(refreshItemDetail).mockResolvedValueOnce(detail("story", "1", "需求说明", "说明"))
    .mockResolvedValueOnce({ ...cached, data: { ...cached.data, work_item_fields: cached.data.work_item_fields.map((field) =>
      field.key === "version" ? { ...field, value: "   " } : field.key === "number" ? { ...field, value: 0 } : field) } });
  render(<ScheduleDescription connection="c" project="p" type="story" item="1" />);
  fireEvent.click(await screen.findByRole("button", { name: "重试" }));
  expect(screen.getByText("REQ-0001")).toBeTruthy();
  expect(screen.getByText("v1")).toBeTruthy();
  expect(await screen.findByText("未填写")).toBeTruthy();
  expect(screen.getByText("0")).toBeTruthy();
  expect(screen.queryByText("v1")).toBeNull();
});

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
