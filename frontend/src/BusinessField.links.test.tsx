// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BusinessField } from "./BusinessField";
import { loadLinkMetadata, type LinkMetadata } from "./linkMetadata";

vi.mock("./linkMetadata", () => ({ loadLinkMetadata: vi.fn() }));
const id = { project_key: "p", work_item_type_key: "story", work_item_id: "1" };
const url = "https://tenant.feishu.cn/file/File123";
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadLinkMetadata).mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("裸链接异步显示文件名与图标，原始跳转地址和周围文字保持完整", async () => {
  vi.mocked(loadLinkMetadata).mockResolvedValue({
    title: "现状盘点.md",
    kind: "file",
  });
  render(
    <BusinessField
      itemId={id}
      fieldKey="design"
      value={`前端文档：${url} 和后端文档`}
    />,
  );
  const link = await screen.findByRole("link", { name: "现状盘点.md" });
  expect(link.getAttribute("href")).toBe(url);
  expect(link.getAttribute("title")).toBe(url);
  expect(link.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  expect(screen.getByText(/前端文档/).textContent).toContain("和后端文档");
});

it("保留 Markdown、HTML、富文本和附件中的原有名称，且无需查询", () => {
  render(
    <BusinessField
      itemId={id}
      fieldKey="design"
      value={[
        `[人工名称](${url})`,
        `<a href="${url}"><strong>HTML 名称</strong></a>`,
        { type: "hyperlink", url, text: "富文本名称" },
        { type: "hyperlink", url, title: "原始标题" },
        { type: "application/pdf", url, name: "原始附件.pdf" },
        { url, label: "原始标签" },
      ]}
    />,
  );
  for (const name of [
    "人工名称",
    "HTML 名称",
    "富文本名称",
    "原始标题",
    "原始附件.pdf",
    "原始标签",
  ]) {
    expect(screen.getByRole("link", { name }).getAttribute("href")).toBe(url);
  }
  expect(loadLinkMetadata).not.toHaveBeenCalled();
});

it("权限不足或解析异常时保留可点击的网址，不把错误混入业务字段", async () => {
  vi.mocked(loadLinkMetadata).mockRejectedValue(new Error("permission denied"));
  const view = render(
    <BusinessField itemId={id} fieldKey="design" value={url} />,
  );
  await waitFor(() => expect(loadLinkMetadata).toHaveBeenCalledOnce());
  expect(screen.getByRole("link", { name: url }).getAttribute("href")).toBe(
    url,
  );
  expect(view.container.textContent).not.toContain("permission denied");
});

it("切换链接后旧标题不能覆盖新链接，切换为自定义名称后保留自定义名称", async () => {
  let resolveOld!: (value: LinkMetadata | null) => void;
  vi.mocked(loadLinkMetadata)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValue({ title: "新网页", kind: "webpage" });
  const view = render(
    <BusinessField itemId={id} fieldKey="design" value={url} />,
  );
  await waitFor(() => expect(loadLinkMetadata).toHaveBeenCalledOnce());
  view.rerender(
    <BusinessField
      itemId={id}
      fieldKey="design"
      value="https://example.com/new"
    />,
  );
  await screen.findByRole("link", { name: "新网页" });
  await act(async () => resolveOld({ title: "迟到的旧标题", kind: "file" }));
  expect(screen.queryByText("迟到的旧标题")).toBeNull();
  view.rerender(
    <BusinessField
      itemId={id}
      fieldKey="design"
      value="[新的人工名称](https://example.com/new)"
    />,
  );
  expect(screen.getByRole("link", { name: "新的人工名称" })).toBeTruthy();
});

it("仅在链接接近可视区域时补标题", async () => {
  let reveal!: () => void;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        reveal = () => callback([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.mocked(loadLinkMetadata).mockResolvedValue({
    title: "设计文档",
    kind: "document",
  });
  render(
    <BusinessField
      itemId={id}
      fieldKey="design"
      value={{ type: "hyperlink", url }}
    />,
  );
  expect(loadLinkMetadata).not.toHaveBeenCalled();
  act(() => reveal());
  await screen.findByRole("link", { name: "设计文档" });
});

it("远端标题作为文本显示，保留 URL 查询参数与锚点", async () => {
  vi.mocked(loadLinkMetadata).mockResolvedValue({
    title: '<img src=x onerror="alert(1)">',
    kind: "webpage",
  });
  const original = "https://example.com/?a=1&b=2#section";
  const view = render(
    <BusinessField itemId={id} fieldKey="design" value={original} />,
  );
  const link = await screen.findByRole("link", {
    name: '<img src=x onerror="alert(1)">',
  });
  expect(link.getAttribute("href")).toBe(original);
  expect(view.container.querySelector("img")).toBeNull();
});

it("GFM 自动识别的 www. 裸网址也补标题，保留 GFM 生成的 HTTP 地址", async () => {
  vi.mocked(loadLinkMetadata).mockResolvedValue({
    title: "普通网站",
    kind: "webpage",
  });
  render(
    <BusinessField
      itemId={id}
      fieldKey="design"
      value="www.example.com/page"
    />,
  );
  const link = await screen.findByRole("link", { name: "普通网站" });
  expect(link.getAttribute("href")).toBe("http://www.example.com/page");
  expect(loadLinkMetadata).toHaveBeenCalledWith("http://www.example.com/page");
});

it("空白链接文字回退为网址，数字名称零仍作为原始名称保留", async () => {
  render(
    <BusinessField
      itemId={id}
      fieldKey="design"
      value={`<a href="${url}"> </a> 和 <a href="https://example.com/zero">0</a>`}
    />,
  );
  await waitFor(() => expect(loadLinkMetadata).toHaveBeenCalledOnce());
  expect(screen.getByRole("link", { name: url }).getAttribute("href")).toBe(
    url,
  );
  expect(screen.getByRole("link", { name: "0" }).getAttribute("href")).toBe(
    "https://example.com/zero",
  );
  expect(loadLinkMetadata).toHaveBeenCalledWith(url);
});
