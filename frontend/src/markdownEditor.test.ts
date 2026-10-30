// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import {
  editorMarkdown,
  editorOffsetBefore,
  editorSelection,
  renderEditorMarkdown,
  setEditorSelection,
} from "./markdownEditor";

afterEach(() => document.body.replaceChildren());
const local = `![截图](fstodo-image:${"a".repeat(64)})`;
function root(value: string) {
  const control = document.createElement("div");
  document.body.append(control);
  renderEditorMarkdown(control, value, (part) => {
    const image = document.createElement("span");
    image.setAttribute("data-creation-markdown", part.markdown);
    image.contentEditable = "false";
    image.textContent = "这是可视图片和删除按钮，不是原文";
    return image;
  });
  return control;
}
it("文本与原子图片往返序列化不丢空白、转义文本或文件token", () => {
  const value = `前文 <img onerror=x>\n${local}\n![截图](https://project.feishu.cn/image.png)<!--fixture_token-->后文`;
  const control = root(value);
  expect(editorMarkdown(control)).toBe(value);
  expect(control.querySelector("img")).toBeNull();
  expect(control.textContent).not.toContain("fstodo-image:");
});
it("光标与跨图片选区按Markdown偏移恢复，图片内部按钮文字不影响位置", () => {
  const value = `前${local}后`;
  const control = root(value);
  setEditorSelection(control, 1, 1 + local.length);
  expect(editorSelection(control)).toEqual({ start: 1, end: 1 + local.length });
  expect(
    editorOffsetBefore(
      control,
      control.querySelector("[data-creation-markdown]")!,
    ),
  ).toBe(1);
  setEditorSelection(control, value.length);
  expect(editorSelection(control)).toEqual({
    start: value.length,
    end: value.length,
  });
});
it("浏览器生成的段落与空行安全转成换行，空编辑器占位br不进入草稿", () => {
  const control = document.createElement("div");
  const paragraph = document.createElement("div");
  paragraph.textContent = "第二行";
  const empty = document.createElement("div");
  empty.append(document.createElement("br"));
  control.append(document.createTextNode("第一行"), paragraph, empty);
  expect(editorMarkdown(control)).toBe("第一行\n第二行\n");
  const cleared = root("");
  expect(editorMarkdown(cleared)).toBe("");
  const trailing = root("第一行\n");
  expect(editorMarkdown(trailing)).toBe("第一行\n");
});
it.each([
  [["前", "", "后"], "前\n\n后"],
  [["前", "", "", "后"], "前\n\n\n后"],
  [["", "前", "", ""], "\n前\n\n"],
  [["前\n", "后"], "前\n后"],
])(
  "浏览器段落%s保留每个空段，显式文本换行不重复添加",
  (paragraphs, expected) => {
    const control = document.createElement("div");
    for (const text of paragraphs) {
      const paragraph = document.createElement("div");
      if (text) paragraph.append(document.createTextNode(text));
      else paragraph.append(document.createElement("br"));
      control.append(paragraph);
    }
    expect(editorMarkdown(control)).toBe(expected);
  },
);
it("已有文本节点末尾换行与后续空段各自保留，不合并多个空段", () => {
  const control = document.createElement("div");
  control.append(document.createTextNode("前\n"));
  for (const text of ["", "", "后"]) {
    const paragraph = document.createElement("div");
    if (text) paragraph.textContent = text;
    else paragraph.append(document.createElement("br"));
    control.append(paragraph);
  }
  expect(editorMarkdown(control)).toBe("前\n\n\n后");
});
it("外部选区不会被错误当作正文选区", () => {
  const control = root("正文"),
    outside = root("其他区域");
  setEditorSelection(outside, 1);
  expect(editorSelection(control)).toBeNull();
});
