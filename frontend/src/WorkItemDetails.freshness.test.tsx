// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkItemDetails } from "./WorkItemDetails";
import { cachedItemDetail, refreshItemDetail } from "./api";
import { localTime } from "./model";
import type { CachedItem, ItemDetail } from "./types";

vi.mock("./api", () => ({
  cachedItemDetail: vi.fn(),
  refreshItemDetail: vi.fn(),
}));

const item = {
  id: { project_key: "p", work_item_type_key: "story", work_item_id: "1" },
  detail_revision: "v1",
} as CachedItem;
const detail = (fetchedAt: number, text = "事项正文"): ItemDetail => ({
  id: item.id,
  fetched_at_ms: fetchedAt,
  data: {
    work_item_attribute: {},
    work_item_fields: [{ key: "description", name: "描述", value: text }],
  },
  pages: [],
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it("打开已有缓存仍检查远端，无变化也在真实读取结束后显示快照检查时间", async () => {
  const remote = deferred<ItemDetail>();
  vi.mocked(cachedItemDetail).mockResolvedValue(detail(60_000));
  vi.mocked(refreshItemDetail).mockReturnValue(remote.promise);
  render(<WorkItemDetails item={item} enabled />);

  await screen.findByText("事项正文");
  expect(screen.getByRole("status").textContent).toBe("正在检查最新信息…");
  expect(screen.getByRole("button", { name: "正在检查最新信息" })).toHaveProperty("disabled", true);
  expect(refreshItemDetail).toHaveBeenCalledOnce();

  await act(async () => remote.resolve(detail(120_000)));
  expect(screen.getByRole("status").textContent).toBe(`已检查 · ${localTime(120_000)}`);
  expect(screen.getByRole("button", { name: "刷新详情" })).toHaveProperty("disabled", false);
  expect(screen.getByText("事项正文")).toBeTruthy();
});

it("联网失败后迟到的缓存不能变成检查成功，手动重试成功后恢复检查时间", async () => {
  const cached = deferred<ItemDetail | null>();
  const remote = deferred<ItemDetail>();
  vi.mocked(cachedItemDetail).mockReturnValue(cached.promise);
  vi.mocked(refreshItemDetail).mockReturnValueOnce(remote.promise);
  render(<WorkItemDetails item={item} enabled />);

  await act(async () => remote.reject({ message: "网络断开" }));
  await act(async () => cached.resolve(detail(60_000, "上次正文")));
  expect(screen.getByRole("status").textContent).toBe("检查失败");
  expect(screen.getByRole("alert").textContent).toContain("网络断开");
  expect(screen.getByRole("alert").textContent).toContain(`当前显示上次保存的信息（获取于 ${localTime(60_000)}）`);
  expect(screen.getByText("上次正文")).toBeTruthy();

  vi.mocked(refreshItemDetail).mockResolvedValueOnce(detail(180_000, "最新正文"));
  await userEvent.setup().click(screen.getByRole("button", { name: "刷新详情" }));
  await screen.findByText("最新正文");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe(`已检查 · ${localTime(180_000)}`);
  expect(refreshItemDetail).toHaveBeenCalledTimes(2);
});

it("缓存暂不可读但远端成功时展示已检查，后续同步只回读新快照并更新检查时间", async () => {
  vi.mocked(cachedItemDetail).mockRejectedValueOnce({ message: "缓存暂不可读" });
  vi.mocked(refreshItemDetail).mockResolvedValue(detail(120_000));
  const view = render(<WorkItemDetails item={item} enabled />);
  await screen.findByText(`已检查 · ${localTime(120_000)}`);
  expect(screen.queryByRole("alert")).toBeNull();

  vi.mocked(cachedItemDetail).mockResolvedValue(detail(240_000, "后台取得的新正文"));
  view.rerender(<WorkItemDetails item={{ ...item, detail_revision: "v2" }} enabled />);
  await screen.findByText("后台取得的新正文");
  expect(screen.getByRole("status").textContent).toBe(`已检查 · ${localTime(240_000)}`);
  expect(refreshItemDetail).toHaveBeenCalledOnce();
});

it.each([false, true])("后台回读新快照期间，本次联网失败仍显示失败（此前已检查=%s）", async (previouslyChecked) => {
  const remote = deferred<ItemDetail>();
  vi.mocked(cachedItemDetail).mockResolvedValue(detail(60_000));
  vi.mocked(refreshItemDetail).mockReturnValue(remote.promise);
  if (previouslyChecked) {
    vi.mocked(refreshItemDetail).mockResolvedValueOnce(detail(120_000));
  }
  const view = render(<WorkItemDetails item={item} enabled />);
  if (previouslyChecked) {
    await screen.findByText(`已检查 · ${localTime(120_000)}`);
    await userEvent.setup().click(screen.getByRole("button", { name: "刷新详情" }));
  }

  vi.mocked(cachedItemDetail).mockResolvedValue(detail(240_000, "同步后的正文"));
  view.rerender(<WorkItemDetails item={{ ...item, detail_revision: "v2" }} enabled />);
  await screen.findByText("同步后的正文");
  await act(async () => remote.reject({ message: "本次联网检查失败" }));
  expect(screen.getByRole("status").textContent).toBe("检查失败");
  expect(screen.getByRole("alert").textContent).toContain("本次联网检查失败");
  expect(screen.getByText("同步后的正文")).toBeTruthy();
});

it("详情成功但清单摘要回读失败时保留已检查，下一次检查成功后清除摘要错误", async () => {
  vi.mocked(cachedItemDetail).mockResolvedValue(detail(60_000));
  vi.mocked(refreshItemDetail).mockResolvedValue(detail(120_000, "最新正文"));
  const onRefreshed = vi.fn().mockRejectedValueOnce({ message: "清单暂不可读" });
  render(<WorkItemDetails item={item} enabled onRefreshed={onRefreshed} />);

  await screen.findByText(/清单摘要读取失败/);
  expect(screen.getByRole("status").textContent).toBe(`已检查 · ${localTime(120_000)}`);
  expect(screen.getByRole("alert").textContent).toContain("清单暂不可读");
  expect(screen.getByRole("alert").textContent).not.toContain("上次保存的信息");
  expect(screen.getByText("最新正文")).toBeTruthy();

  vi.mocked(refreshItemDetail).mockResolvedValueOnce(detail(240_000, "再次检查的正文"));
  await userEvent.setup().click(screen.getByRole("button", { name: "刷新详情" }));
  await screen.findByText("再次检查的正文");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe(`已检查 · ${localTime(240_000)}`);
  expect(onRefreshed).toHaveBeenCalledTimes(2);
});

it("成功检查与连续两次后台回读交错时保留最新正文并显示已检查", async () => {
  const remote = deferred<ItemDetail>();
  const responseRead = deferred<ItemDetail | null>();
  vi.mocked(cachedItemDetail).mockResolvedValue(detail(60_000));
  vi.mocked(refreshItemDetail).mockReturnValue(remote.promise);
  const onRefreshed = vi.fn().mockResolvedValue(undefined);
  const view = render(<WorkItemDetails item={item} enabled onRefreshed={onRefreshed} />);
  await screen.findByText("事项正文");

  vi.mocked(cachedItemDetail).mockResolvedValueOnce(detail(120_000, "第一次后台正文"));
  view.rerender(<WorkItemDetails item={{ ...item, detail_revision: "v2" }} enabled onRefreshed={onRefreshed} />);
  await screen.findByText("第一次后台正文");
  vi.mocked(cachedItemDetail).mockReturnValueOnce(responseRead.promise);
  await act(async () => remote.resolve(detail(180_000, "较早远端正文")));
  expect(cachedItemDetail).toHaveBeenCalledTimes(3);

  vi.mocked(cachedItemDetail).mockResolvedValueOnce(detail(240_000, "最新后台正文"));
  view.rerender(<WorkItemDetails item={{ ...item, detail_revision: "v3" }} enabled onRefreshed={onRefreshed} />);
  await screen.findByText("最新后台正文");
  await act(async () => responseRead.resolve(detail(180_000, "较早回读正文")));
  expect(screen.getByRole("status").textContent).toBe(`已检查 · ${localTime(240_000)}`);
  expect(screen.getByText("最新后台正文")).toBeTruthy();
  expect(screen.queryByText("较早回读正文")).toBeNull();
  expect(refreshItemDetail).toHaveBeenCalledOnce();
  expect(onRefreshed).toHaveBeenCalledOnce();
});

it("切换事项时重置检查结果，旧事项的已检查状态不能用于新事项", async () => {
  vi.mocked(cachedItemDetail).mockResolvedValue(null);
  vi.mocked(refreshItemDetail).mockResolvedValueOnce(detail(120_000));
  const view = render(<WorkItemDetails item={item} enabled />);
  await screen.findByText(`已检查 · ${localTime(120_000)}`);

  const other = { ...item, id: { ...item.id, work_item_id: "2" } };
  const remote = deferred<ItemDetail>();
  vi.mocked(refreshItemDetail).mockReturnValueOnce(remote.promise);
  view.rerender(<WorkItemDetails item={other} enabled />);
  expect(screen.getByRole("status").textContent).toBe("正在检查最新信息…");
  expect(screen.queryByText("事项正文")).toBeNull();

  await act(async () => remote.reject({ message: "暂时无法连接" }));
  expect(screen.getByRole("status").textContent).toBe("检查失败");
  expect(screen.queryByText(/已检查/)).toBeNull();
});
