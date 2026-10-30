// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MarkdownPreview } from "./MarkdownPreview";
import {
  getCreationImage,
  getUploadedCreationImage,
  uploadCreationImage,
  type CreationImagePreview,
} from "./creationImages";

vi.mock("./creationImages", async (original) => ({
  ...(await original<typeof import("./creationImages")>()),
  getCreationImage: vi.fn(),
  getUploadedCreationImage: vi.fn(),
  uploadCreationImage: vi.fn(),
}));
const imageId = "a".repeat(64),
  dataUrl = "data:image/png;base64,aW1hZ2U=";
const scope = {
  target: { source_id: "source", project_key: "space", type_key: "issue" },
  context: "account",
  fieldKey: "description",
};
const markdown = `前文![截图](fstodo-image:${imageId})后文`;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCreationImage).mockResolvedValue({ data_url: dataUrl });
  vi.mocked(getUploadedCreationImage).mockResolvedValue({ data_url: dataUrl });
});
afterEach(cleanup);

it("核对页显示真实本机图片和前后文字，不显示内部引用或发起上传", async () => {
  const rendered = render(<MarkdownPreview value={markdown} scope={scope} />);
  expect((await screen.findByAltText("截图 1")).getAttribute("src")).toBe(
    dataUrl,
  );
  expect(rendered.container.textContent).toContain("前文");
  expect(rendered.container.textContent).toContain("后文");
  expect(rendered.container.textContent).not.toContain("fstodo-image:");
  expect(uploadCreationImage).not.toHaveBeenCalled();
});
it("带文件token的已上传图片只从本机恢复，不把token显示为正文", async () => {
  const url = "https://project.feishu.cn/image.png",
    token = "fixture_file_token";
  const rendered = render(
    <MarkdownPreview value={`![截图](${url})<!--${token}-->`} scope={scope} />,
  );
  expect((await screen.findByAltText("截图 1")).getAttribute("src")).toBe(
    dataUrl,
  );
  expect(getUploadedCreationImage).toHaveBeenCalledWith(scope, url, token);
  expect(rendered.container.textContent).not.toContain(token);
  expect(rendered.container.querySelector('[src^="https:"]')).toBeNull();
});
it("暂时无法读取时保留图片位置，可明确重读且不上传", async () => {
  vi.mocked(getCreationImage).mockRejectedValueOnce(
    new Error("本机缓存暂不可读"),
  );
  render(<MarkdownPreview value={markdown} scope={scope} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "重新读取图片" }));
  await screen.findByAltText("截图 1");
  expect(getCreationImage).toHaveBeenCalledTimes(2);
  expect(uploadCreationImage).not.toHaveBeenCalled();
});
it("切换字段后迟到的旧预览不会出现在新的核对内容中", async () => {
  let finish!: (result: CreationImagePreview) => void;
  vi.mocked(getCreationImage).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const rendered = render(<MarkdownPreview value={markdown} scope={scope} />);
  rendered.rerender(
    <MarkdownPreview
      value="其他字段正文"
      scope={{ ...scope, fieldKey: "another" }}
    />,
  );
  await act(async () => finish({ data_url: dataUrl }));
  expect(screen.queryByAltText("截图 1")).toBeNull();
  expect(rendered.container.textContent).toBe("其他字段正文");
});
it("没有token的外部图片提供替代信息，危险HTML始终作为文本", async () => {
  const rendered = render(
    <MarkdownPreview
      value={
        "<script>alert(1)</script>![外部图](https://example.test/image.png)"
      }
      scope={scope}
    />,
  );
  await screen.findByText("外部图片，创建后可在飞书查看");
  expect(rendered.container.querySelector("img,script")).toBeNull();
  expect(getUploadedCreationImage).not.toHaveBeenCalled();
  expect(getCreationImage).not.toHaveBeenCalled();
});
