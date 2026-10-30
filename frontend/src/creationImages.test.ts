// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { CreationForm } from "./creation";
import {
  hasInvalidLocalCreationImages,
  replaceCreationImageReference,
  splitCreationMarkdown,
  uploadCreationImages,
} from "./creationImages";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const first = "a".repeat(64);
const second = "b".repeat(64);
const image = (id: string) => `![截图](fstodo-image:${id})`;
const form: CreationForm = {
  target: { source_id: "source", project_key: "space", type_key: "issue" },
  context: "account",
  version: "form-version",
  pending: null,
  fields: [
    {
      key: "description",
      label: "说明",
      kind: "textarea",
      required: false,
      multiple: false,
      initial: null,
      options: [],
    },
  ],
};
beforeEach(() => vi.mocked(invoke).mockReset());

describe("创建正文图片的真实上传契约", () => {
  it("保留文字顺序和文件token，仅将图片语法交给图片节点呈现", () => {
    const markdown = `前文\n${image(first)}\n![已上传](https://example.test/image.png)<!--token_1=-->\n后文`;
    const parts = splitCreationMarkdown(markdown);
    expect(parts.filter((part) => part.kind === "image")).toMatchObject([
      { url: `fstodo-image:${first}`, alt: "截图" },
      { url: "https://example.test/image.png", fileToken: "token_1=" },
    ]);
    expect(
      parts
        .map((part) => (part.kind === "image" ? part.markdown : part.text))
        .join(""),
    ).toBe(markdown);
    expect(
      splitCreationMarkdown(`\` ${image(first)} \``).every(
        (part) => part.kind === "text",
      ),
    ).toBe(true);
  });

  it("同时替换重复图片引用，正文包含返回URL与文件token，缺token时拒绝", () => {
    const markdown = `前${image(first)}中${image(first)}后`;
    expect(
      replaceCreationImageReference(
        markdown,
        first,
        "https://example.test/image(1).png",
        "file_token=",
      ),
    ).toBe(
      "前![截图](https://example.test/image%281%29.png)<!--file_token=-->中![截图](https://example.test/image%281%29.png)<!--file_token=-->后",
    );
    expect(() =>
      replaceCreationImageReference(
        markdown,
        first,
        "https://example.test/image.png",
        "",
      ),
    ).toThrow("文件标识");
    expect(() =>
      replaceCreationImageReference(
        markdown,
        first,
        "https://example.test/image.png",
        "x-->bad",
      ),
    ).toThrow("文件标识");
  });

  it("每张成功后立即保存URL和token，后续上传失败保留已成功的图片且不自动重传", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        url: "https://example.test/one.png",
        file_token: "token-one",
      })
      .mockRejectedValueOnce(new Error("第二张上传失败"));
    const saved = vi.fn((_values: Record<string, unknown>) => true);
    const values = {
      name: "标题",
      description: `${image(first)}\n${image(second)}`,
    };
    await expect(
      uploadCreationImages(form, values, saved, vi.fn()),
    ).rejects.toThrow("第二张上传失败");
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(saved).toHaveBeenCalledOnce();
    expect(saved.mock.calls[0][0]).toMatchObject({
      name: "标题",
      description: `![截图](https://example.test/one.png)<!--token-one-->\n${image(second)}`,
    });
    expect(values.description).toContain(`fstodo-image:${first}`);
  });

  it("同字段重复图只上传一次，等待保存成功后才返回可创建字段", async () => {
    vi.mocked(invoke).mockResolvedValue({
      url: "https://example.test/one.png",
      file_token: "token-one",
    });
    const saved = vi.fn((_values: Record<string, unknown>) => true);
    const result = await uploadCreationImages(
      form,
      { description: `${image(first)}\n${image(first)}` },
      saved,
      vi.fn(),
    );
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("upload_creation_image", {
      target: form.target,
      context: form.context,
      fieldKey: "description",
      imageId: first,
    });
    expect(result.description).not.toContain("fstodo-image:");
    expect(String(result.description).match(/<!--token-one-->/g)).toHaveLength(
      2,
    );
    expect(saved).toHaveBeenCalledWith(result);
  });

  it("草稿保存失败时停止处理，不上传下一张", async () => {
    vi.mocked(invoke).mockResolvedValue({
      url: "https://example.test/one.png",
      file_token: "token-one",
    });
    await expect(
      uploadCreationImages(
        form,
        { description: `${image(first)}${image(second)}` },
        () => false,
        vi.fn(),
      ),
    ).rejects.toThrow("本机草稿未能保存");
    expect(invoke).toHaveBeenCalledOnce();
  });

  it("损坏引用先拦截，未取得token时不把成功URL保存成完整图片", async () => {
    expect(hasInvalidLocalCreationImages(image(first))).toBe(false);
    const saved = vi.fn(() => true);
    await expect(
      uploadCreationImages(
        form,
        { description: "![截图](fstodo-image:broken)" },
        saved,
        vi.fn(),
      ),
    ).rejects.toThrow("无法识别");
    expect(invoke).not.toHaveBeenCalled();
    vi.mocked(invoke).mockResolvedValue({
      url: "https://example.test/one.png",
    });
    await expect(
      uploadCreationImages(form, { description: image(first) }, saved, vi.fn()),
    ).rejects.toThrow("文件标识");
    expect(saved).not.toHaveBeenCalled();
  });
});
