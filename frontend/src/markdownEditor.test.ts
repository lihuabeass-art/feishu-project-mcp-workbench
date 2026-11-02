// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import {
  editorMarkdown,
  editorOffsetBefore,
  editorSelection,
  moveEditorCaret,
  normalizeEditorCaret,
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

it("纯图片及相邻图片两侧都有文字落点，所有边界可恢复且占位符不进入正文", () => {
  const control = root(local + local);
  for (const at of [0, local.length, local.length * 2]) {
    setEditorSelection(control, at);
    const selection = document.getSelection()!;
    expect(selection.anchorNode?.nodeType).toBe(Node.TEXT_NODE);
    expect(
      selection.anchorNode?.parentElement?.hasAttribute("data-editor-caret"),
    ).toBe(true);
    expect(editorSelection(control)).toEqual({ start: at, end: at });
  }
  expect(editorMarkdown(control)).toBe(local + local);
  expect(
    editorOffsetBefore(
      control,
      control.querySelectorAll("[data-creation-markdown]")[1],
    ),
  ).toBe(local.length);
});

it("浏览器在图片外边界落下的光标被归位到文字，不抢走图片选区或其他输入框选区", () => {
  const control = root(local);
  const range = document.createRange();
  range.setStartAfter(control.querySelector("[data-creation-markdown]")!);
  range.collapse(true);
  document.getSelection()!.removeAllRanges();
  document.getSelection()!.addRange(range);
  normalizeEditorCaret(control);
  expect(document.getSelection()!.anchorNode?.nodeType).toBe(Node.TEXT_NODE);
  expect(editorSelection(control)).toEqual({
    start: local.length,
    end: local.length,
  });
  setEditorSelection(control, 0, local.length);
  normalizeEditorCaret(control);
  expect(editorSelection(control)).toEqual({ start: 0, end: local.length });
  const outside = root("另一个输入框");
  setEditorSelection(outside, 2);
  normalizeEditorCaret(control);
  expect(editorSelection(outside)).toEqual({ start: 2, end: 2 });
});

it("方向键整张跨越图片并保留反向扩展选区，离开图片时按完整字形移动", () => {
  const value = `👨‍👩‍👧‍👦${local}e\u0301`;
  const control = root(value);
  const start = value.indexOf("!["),
    end = start + local.length;
  setEditorSelection(control, start);
  expect(moveEditorCaret(control, 1, false)).toBe(true);
  expect(editorSelection(control)).toEqual({ start: end, end });
  expect(moveEditorCaret(control, -1, true)).toBe(true);
  expect(editorSelection(control)).toEqual({ start, end });
  expect(moveEditorCaret(control, 1, true)).toBe(true);
  expect(editorSelection(control)).toEqual({ start: end, end });
  expect(moveEditorCaret(control, 1, false)).toBe(true);
  expect(editorSelection(control)).toEqual({
    start: value.length,
    end: value.length,
  });
  setEditorSelection(control, start);
  expect(moveEditorCaret(control, -1, false)).toBe(true);
  expect(editorSelection(control)).toEqual({ start: 0, end: 0 });
});

it("落点中的新输入和用户原有的零宽字符都保留，只有编辑器占位符被排除", () => {
  const control = root(`原有\u200b文字${local}`);
  const stop = control.querySelectorAll("[data-editor-caret]")[1];
  stop.firstChild!.textContent += "新输入";
  expect(editorMarkdown(control)).toBe(`原有\u200b文字${local}新输入`);
  setEditorSelection(control, editorMarkdown(control).length);
  expect(editorSelection(control)?.start).toBe(editorMarkdown(control).length);
});

it("图片旁已有文字时优先使用真实文本落点，普通文字选区不做归位", () => {
  const control = root(`${local}后文`);
  setEditorSelection(control, local.length);
  expect(document.getSelection()!.anchorNode?.textContent).toBe("后文");
  const plain = document.createElement("div");
  document.body.append(plain);
  plain.append(document.createTextNode("前"), document.createTextNode("后"));
  const range = document.createRange();
  range.setStart(plain.lastChild!, 0);
  range.collapse(true);
  document.getSelection()!.removeAllRanges();
  document.getSelection()!.addRange(range);
  normalizeEditorCaret(plain);
  expect(document.getSelection()!.anchorNode).toBe(plain.lastChild);
});
