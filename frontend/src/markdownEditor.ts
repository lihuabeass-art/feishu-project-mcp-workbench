import {
  splitCreationMarkdown,
  type CreationMarkdownPart,
} from "./creationImages";

export type EditorSelection = { start: number; end: number };
type Point = { node: Node; offset: number };
type Unit = { text: string; start: Point; end: Point; textNode?: Text };
const blockTags = new Set(["DIV", "P", "LI", "UL", "OL", "PRE", "BLOCKQUOTE"]);
const caretMarker = "\u200b";
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

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
        const marker = (parent as HTMLElement).hasAttribute?.(
          "data-editor-caret",
        )
          ? textNode.data.indexOf(caretMarker)
          : -1;
        function text(from: number, to: number) {
          result.push({
            text: textNode.data.slice(from, to),
            start: { node, offset: from },
            end: { node, offset: to },
            textNode,
          });
        }
        if (marker < 0) text(0, textNode.length);
        else {
          if (marker) text(0, marker);
          // 仅忽略编辑器图片落点中的占位符，用户输入仍进入正文。
          text(marker + 1, textNode.length);
        }
        const visible =
          marker < 0
            ? textNode.data
            : textNode.data.slice(0, marker) + textNode.data.slice(marker + 1);
        if (visible.length) {
          seen = true;
          endsWithBreak = visible.endsWith("\n");
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

function editorPoint(root: HTMLElement, at: number): Point {
  const content = units(root);
  let cursor = 0;
  const wanted = Math.max(0, at);
  let boundary: Point | undefined;
  let caret: Point | undefined;
  for (const unit of content) {
    if (wanted >= cursor && wanted <= cursor + unit.text.length) {
      if (unit.textNode) {
        const point = {
          node: unit.textNode,
          offset:
            unit.start.offset + Math.min(unit.text.length, wanted - cursor),
        };
        if (unit.text.length) return point;
        caret = point;
      } else {
        boundary = wanted === cursor ? unit.start : unit.end;
        if (wanted < cursor + unit.text.length) return caret || boundary;
      }
    }
    cursor += unit.text.length;
  }
  return caret || boundary || { node: root, offset: root.childNodes.length };
}

export function setEditorSelection(
  root: HTMLElement,
  start: number,
  end = start,
): void {
  const first = editorPoint(root, start),
    last = editorPoint(root, end);
  const range = root.ownerDocument.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset);
  const selection = root.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** 图片边界使用文本落点，避免浏览器按整张图片的高度绘制光标。 */
export function normalizeEditorCaret(root: HTMLElement): void {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.isCollapsed) return;
  const selected = editorSelection(root);
  if (!selected || !atEditorImageBoundary(editorMarkdown(root), selected.start))
    return;
  const point = editorPoint(root, selected.start);
  if (
    selection.anchorNode !== point.node ||
    selection.anchorOffset !== point.offset
  )
    setEditorSelection(root, selected.start);
}

export function atEditorImageBoundary(value: string, at: number): boolean {
  return splitCreationMarkdown(value).some(
    (part) => part.kind === "image" && (part.start === at || part.end === at),
  );
}

/** 图片按整体、文字按字形跨越；占位符不增加方向键或删除的次数。 */
export function adjacentEditorOffset(
  value: string,
  at: number,
  direction: -1 | 1,
): number {
  const image = splitCreationMarkdown(value).find(
    (part) =>
      part.kind === "image" &&
      (direction < 0 ? part.end === at : part.start === at),
  );
  if (image) return direction < 0 ? image.start : image.end;
  if (direction > 0) {
    const first = graphemes
      .segment(value.slice(at))
      [Symbol.iterator]()
      .next().value;
    return at + (first?.segment.length || 0);
  }
  let previous = 0;
  for (const part of graphemes.segment(value.slice(0, at)))
    previous = part.index;
  return previous;
}

export function moveEditorCaret(
  root: HTMLElement,
  direction: -1 | 1,
  extend: boolean,
): boolean {
  const selection = root.ownerDocument.getSelection();
  const selected = editorSelection(root);
  if (!selection || !selected) return false;
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  range.setEnd(selection.focusNode!, selection.focusOffset);
  const focus = editorMarkdown(range.cloneContents()).length;
  const value = editorMarkdown(root);
  if (!atEditorImageBoundary(value, focus)) return false;
  const next =
    selected.start !== selected.end && !extend
      ? direction < 0
        ? selected.start
        : selected.end
      : adjacentEditorOffset(value, focus, direction);
  if (extend) {
    const point = editorPoint(root, next);
    selection.extend(point.node, point.offset);
  } else setEditorSelection(root, next);
  return true;
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
  const nodes: Node[] = [];
  function caret() {
    const previous = nodes.at(-1);
    if (
      previous?.nodeType === Node.ELEMENT_NODE &&
      (previous as HTMLElement).hasAttribute("data-editor-caret")
    )
      return;
    const stop = root.ownerDocument.createElement("span");
    stop.setAttribute("data-editor-caret", "");
    stop.textContent = caretMarker;
    nodes.push(stop);
  }
  for (const part of splitCreationMarkdown(value)) {
    if (part.kind === "image") {
      caret();
      nodes.push(image(part, imageIndex++));
      caret();
    } else nodes.push(root.ownerDocument.createTextNode(part.text));
  }
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
