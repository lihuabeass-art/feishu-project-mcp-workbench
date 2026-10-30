import {
  splitCreationMarkdown,
  type CreationMarkdownPart,
} from "./creationImages";

export type EditorSelection = { start: number; end: number };
type Point = { node: Node; offset: number };
type Unit = { text: string; start: Point; end: Point; textNode?: Text };
const blockTags = new Set(["DIV", "P", "LI", "UL", "OL", "PRE", "BLOCKQUOTE"]);

function units(root: Node): Unit[] {
  function children(parent: Node): { content: Unit[]; endsWithBreak: boolean } {
    const result: Unit[] = [];
    let seen = false;
    let endsWithBreak = false;
    Array.from(parent.childNodes).forEach((node, index) => {
      const before = { node: parent, offset: index };
      const after = { node: parent, offset: index + 1 };
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text;
        result.push({
          text: textNode.data,
          start: { node, offset: 0 },
          end: { node, offset: textNode.length },
          textNode,
        });
        if (textNode.length) {
          seen = true;
          endsWithBreak = textNode.data.endsWith("\n");
        }
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node as HTMLElement;
      const markdown = element.getAttribute("data-creation-markdown");
      if (markdown !== null) {
        result.push({ text: markdown, start: before, end: after });
        seen = true;
        endsWithBreak = markdown.endsWith("\n");
        return;
      }
      if (["SCRIPT", "STYLE"].includes(element.tagName)) return;
      if (element.tagName === "BR") {
        if (
          !element.hasAttribute("data-editor-sentinel") &&
          parent.childNodes.length !== 1
        ) {
          result.push({ text: "\n", start: before, end: after });
          seen = true;
          endsWithBreak = true;
        }
        return;
      }
      const nested = children(element);
      const block = blockTags.has(element.tagName);
      if (block && seen && !endsWithBreak)
        result.push({
          text: "\n",
          start: before,
          end: { node: element, offset: 0 },
        });
      result.push(...nested.content);
      // 空段仍占一行；它前面的段落分隔符不能充当它自身的显式换行。
      if (block || nested.content.some((unit) => unit.text.length)) {
        seen = true;
        endsWithBreak = nested.endsWithBreak;
      }
    });
    return { content: result, endsWithBreak };
  }
  return children(root).content;
}

/** 原文只来自文本节点或本组件创建的图片标记，不序列化 HTML。 */
export function editorMarkdown(root: Node): string {
  return units(root)
    .map((unit) => unit.text)
    .join("");
}

export function editorOffsetBefore(root: HTMLElement, node: Node): number {
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  range.setEndBefore(node);
  return editorMarkdown(range.cloneContents()).length;
}

export function editorSelection(root: HTMLElement): EditorSelection | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.rangeCount) return null;
  const selected = selection.getRangeAt(0);
  if (
    !root.contains(selected.startContainer) ||
    !root.contains(selected.endContainer)
  )
    return null;
  function offset(node: Node, at: number) {
    const range = root.ownerDocument.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, at);
    return editorMarkdown(range.cloneContents()).length;
  }
  return {
    start: offset(selected.startContainer, selected.startOffset),
    end: offset(selected.endContainer, selected.endOffset),
  };
}

export function setEditorSelection(
  root: HTMLElement,
  start: number,
  end = start,
): void {
  const content = units(root);
  function point(at: number): Point {
    let cursor = 0;
    const wanted = Math.max(0, at);
    for (const unit of content) {
      if (wanted <= cursor + unit.text.length) {
        if (unit.textNode)
          return {
            node: unit.textNode,
            offset: Math.min(unit.text.length, wanted - cursor),
          };
        return wanted === cursor ? unit.start : unit.end;
      }
      cursor += unit.text.length;
    }
    return { node: root, offset: root.childNodes.length };
  }
  const first = point(start),
    last = point(end);
  const range = root.ownerDocument.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset);
  const selection = root.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function renderEditorMarkdown(
  root: HTMLElement,
  value: string,
  image: (
    part: Extract<CreationMarkdownPart, { kind: "image" }>,
    index: number,
  ) => Node,
): void {
  let imageIndex = 0;
  const nodes = splitCreationMarkdown(value).map((part) =>
    part.kind === "image"
      ? image(part, imageIndex++)
      : root.ownerDocument.createTextNode(part.text),
  );
  if (!value || value.endsWith("\n")) {
    const sentinel = root.ownerDocument.createElement("br");
    sentinel.setAttribute("data-editor-sentinel", "");
    nodes.push(sentinel);
  }
  root.replaceChildren(...nodes);
  root.dataset.empty = String(!value);
}

export function editorImagesMatch(root: HTMLElement, value: string): boolean {
  const expected = splitCreationMarkdown(value)
    .filter((part) => part.kind === "image")
    .map((part) => part.markdown);
  const actual = Array.from(
    root.querySelectorAll<HTMLElement>("[data-creation-markdown]"),
  ).map((node) => node.getAttribute("data-creation-markdown"));
  return (
    expected.length === actual.length &&
    expected.every((markdown, index) => markdown === actual[index])
  );
}
