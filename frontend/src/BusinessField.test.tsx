// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BusinessField } from "./BusinessField";
import { loadFieldImage } from "./api";

vi.mock("./api", () => ({ loadFieldImage: vi.fn() }));
const itemId = {
  project_key: "p",
  work_item_type_key: "issue",
  work_item_id: "1",
};
const url =
  "https://project.feishu.cn/goapi/v5/platform/file/stream/download/example";
const data = "data:image/png;base64,iVBORw0KGgo=";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.mocked(loadFieldImage).mockResolvedValue(data);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("图片进入可视范围后才请求，并支持嵌套 HTML 中的 Markdown 图片", async () => {
  let reveal!: () => void;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(
        callback: (entries: Array<{ isIntersecting: boolean }>) => void,
      ) {
        reveal = () => callback([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect() {}
    },
  );
  render(
    <BusinessField
      itemId={itemId}
      fieldKey="f"
      value={`<span><span>说明 ![](${url})</span></span>`}
    />,
  );
  expect(loadFieldImage).not.toHaveBeenCalled();
  expect(screen.getByText("图片待加载")).toBeTruthy();
  act(() => reveal());
  await screen.findByAltText("业务字段图片");
  expect(loadFieldImage).toHaveBeenCalledOnce();
});

it("真实样式的 Markdown 图文保持顺序，并通过所属字段下载无后缀图片", async () => {
  const view = render(
    <BusinessField
      itemId={itemId}
      fieldKey="description"
      value={`复现步骤\n\n![](${url})<!-- image:{"width":820} -->\n\n预期结果`}
    />,
  );
  const img = await screen.findByAltText("业务字段图片");
  expect(img.getAttribute("src")).toBe(data);
  expect(loadFieldImage).toHaveBeenCalledWith(
    itemId,
    "description",
    url,
    false,
  );
  expect(view.container.textContent).toContain("复现步骤");
  expect(view.container.textContent).toContain("预期结果");
  expect(view.container.textContent).not.toContain("image:");
  expect(
    screen.getByText("复现步骤").compareDocumentPosition(img) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    img.compareDocumentPosition(screen.getByText("预期结果")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it("HTML 图片、图片附件和结构化图片节点共用预览，普通网址仍是链接", async () => {
  const view = render(
    <BusinessField
      itemId={itemId}
      fieldKey="f"
      value={[
        `<span>说明</span><img src="${url}" alt="截图" onerror="alert(1)"><script>alert(1)</script>`,
        { type: "image/png", name: "附件截图", url },
        { type: "image", attrs: { src: url }, alt: "节点截图" },
        "https://example.com/business",
      ]}
    />,
  );
  await screen.findByAltText("截图");
  await screen.findByAltText("附件截图");
  await screen.findByAltText("节点截图");
  expect(view.container.querySelector("script")).toBeNull();
  expect(view.container.querySelector("[onerror]")).toBeNull();
  expect(screen.getByRole("link").getAttribute("href")).toBe(
    "https://example.com/business",
  );
});

it("下载失败不影响文字，重试绕过旧缓存，解码失败也可重试", async () => {
  vi.mocked(loadFieldImage)
    .mockRejectedValueOnce({ message: "签名已过期" })
    .mockResolvedValue(data);
  render(
    <BusinessField
      itemId={itemId}
      fieldKey="f"
      value={`保留的描述\n\n![](${url})`}
    />,
  );
  await screen.findByText("图片加载失败");
  expect(screen.getByText("保留的描述")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "重试图片" }));
  const img = await screen.findByAltText("业务字段图片");
  expect(loadFieldImage).toHaveBeenLastCalledWith(itemId, "f", url, true);
  fireEvent.error(img);
  expect(screen.getByText("图片加载失败")).toBeTruthy();
});

it("预览支持缩放、Escape 关闭与焦点恢复", async () => {
  const user = userEvent.setup();
  render(
    <BusinessField
      itemId={itemId}
      fieldKey="f"
      value={`![界面截图](${url})`}
    />,
  );
  const open = await screen.findByRole("button", { name: "放大查看界面截图" });
  await user.click(open);
  expect(screen.getByRole("dialog", { name: "图片预览" })).toBeTruthy();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "关闭图片预览" }),
  );
  await user.click(screen.getByRole("button", { name: "放大图片" }));
  expect(screen.getByRole("button", { name: "重置图片大小" }).textContent).toBe(
    "125%",
  );
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(open);
});

it("切换事项忽略旧图片请求，并关闭旧预览", async () => {
  let resolveOld!: (data: string) => void;
  vi.mocked(loadFieldImage).mockImplementation((id) =>
    id.work_item_id === "1"
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : Promise.resolve(data),
  );
  const view = render(
    <BusinessField itemId={itemId} fieldKey="f" value={`![](${url})`} />,
  );
  await waitFor(() => expect(loadFieldImage).toHaveBeenCalledOnce());
  view.rerender(
    <BusinessField
      itemId={{ ...itemId, work_item_id: "2" }}
      fieldKey="f"
      value={`![](${url})`}
    />,
  );
  const img = await screen.findByAltText("业务字段图片");
  await act(async () => resolveOld("data:image/png;base64,old"));
  expect(img.getAttribute("src")).toBe(data);
});

it("不可执行协议不会发图片下载请求", () => {
  const view = render(
    <BusinessField
      itemId={itemId}
      fieldKey="f"
      value={
        '![x](javascript:alert%281%29)\n\n<img src="file:///private.png"><iframe src="https://example.com" />'
      }
    />,
  );
  expect(loadFieldImage).not.toHaveBeenCalled();
  expect(view.container.querySelector("iframe")).toBeNull();
});

it("明确的非图片附件保留文件链接", () => {
  render(
    <BusinessField
      itemId={itemId}
      fieldKey="files"
      value={{ type: "application/pdf", name: "说明.pdf", url }}
    />,
  );
  expect(
    screen.getByRole("link", { name: "说明.pdf" }).getAttribute("href"),
  ).toBe(url);
  expect(loadFieldImage).not.toHaveBeenCalled();
});

it("file_url 附件与没有类型的富文本容器直接按顺序显示图文", async () => {
  const view = render(
    <BusinessField
      itemId={itemId}
      fieldKey="f"
      value={{
        children: [
          { text: "第一段" },
          { type: "image/png", name: "附件", file_url: url },
          { text: "最后一段" },
        ],
      }}
    />,
  );
  const image = await screen.findByAltText("附件");
  expect(
    screen.getByText("第一段").compareDocumentPosition(image) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    image.compareDocumentPosition(screen.getByText("最后一段")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(view.container.querySelector("details")).toBeNull();
});

it("HTTP 图片保留可打开的链接，不发出必然失败的下载请求", () => {
  render(
    <BusinessField
      itemId={itemId}
      fieldKey="f"
      value={[
        "![旧图片](http://example.com/a.png)",
        {
          type: "image/png",
          url: "http://example.com/b.png",
          name: "附件图片",
        },
      ]}
    />,
  );
  expect(screen.getAllByRole("link")).toHaveLength(2);
  expect(loadFieldImage).not.toHaveBeenCalled();
});
