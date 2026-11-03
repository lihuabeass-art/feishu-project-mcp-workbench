import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { LoaderCircle } from "lucide-react";
import { asError } from "./model";
import type { CreationTarget } from "./creation";
import {
  clipboardImageBase64,
  creationImageMimeTypes,
  maxCreationImageBytes,
  saveCreationImage,
  splitCreationMarkdown,
  type CreationImageScope,
} from "./creationImages";
import {
  creationImagePreviewKey,
  creationImageScopeKey,
  useCreationImagePreviews,
  type CreationImageDisplay,
  type CreationImagePart,
} from "./MarkdownPreview";
import {
  editorImagesMatch,
  editorMarkdown,
  editorOffsetBefore,
  editorSelection,
  adjacentEditorOffset,
  atEditorImageBoundary,
  moveEditorCaret,
  normalizeEditorCaret,
  renderEditorMarkdown,
  setEditorSelection,
  type EditorSelection,
} from "./markdownEditor";
import "./MarkdownClipboard.css";
export { MarkdownPreview } from "./MarkdownPreview";

export type MarkdownClipboardProps = {
  id: string;
  ariaLabel: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  target: CreationTarget;
  context: string;
  fieldKey: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  workflow?: CreationImageScope["workflow"];
  allowImages?: boolean;
};
type Snapshot = EditorSelection & { value: string };

export function MarkdownClipboard({
  id,
  ariaLabel,
  required,
  value,
  onChange,
  target,
  context,
  fieldKey,
  disabled,
  onBusyChange,
  workflow,
  allowImages = true,
}: MarkdownClipboardProps) {
  const editor = useRef<HTMLDivElement>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  const scope: CreationImageScope = { target, context, fieldKey, workflow };
  const scopeKey = creationImageScopeKey(scope);
  const activeKey = useRef(scopeKey);
  activeKey.current = scopeKey;
  const generation = useRef(0);
  const mounted = useRef(false);
  const pending = useRef(0);
  const composing = useRef(false);
  const compositionWaiters = useRef(new Set<(ready: boolean) => void>());
  const compositionStart = useRef<Snapshot | null>(null);
  const beforeInput = useRef<Snapshot | null>(null);
  const lastPublished = useRef(value);
  const renderedScope = useRef("");
  const history = useRef<{
    past: Snapshot[];
    future: Snapshot[];
    present: Snapshot;
  }>({ past: [], future: [], present: { value, start: 0, end: 0 } });
  const painted = useRef(
    new WeakMap<HTMLElement, CreationImageDisplay | undefined>(),
  );
  const [status, setStatus] = useState({
    scope: scopeKey,
    saving: 0,
    error: "",
  });
  const preview = useCreationImagePreviews(splitCreationMarkdown(value), scope);

  function snapshot(): Snapshot {
    const root = editor.current;
    const current = root ? editorMarkdown(root) : lastPublished.current;
    return {
      value: current,
      ...((root && editorSelection(root)) || {
        start: current.length,
        end: current.length,
      }),
    };
  }
  function setError(error: string) {
    setStatus((previous) => ({ ...previous, scope: scopeKey, error }));
  }
  function current(key: string, revision: number) {
    return (
      mounted.current &&
      activeKey.current === key &&
      generation.current === revision
    );
  }
  function releaseCompositionWaiters(ready: boolean) {
    const waiting = [...compositionWaiters.current];
    compositionWaiters.current.clear();
    for (const resolve of waiting) resolve(ready);
  }
  async function waitForComposition(
    key: string,
    revision: number,
  ): Promise<boolean> {
    while (current(key, revision) && composing.current) {
      const ready = await new Promise<boolean>((resolve) => {
        compositionWaiters.current.add(resolve);
      });
      if (!ready) return false;
    }
    return current(key, revision);
  }
  useEffect(() => {
    mounted.current = true;
    const revision = ++generation.current;
    pending.current = 0;
    setStatus({ scope: scopeKey, saving: 0, error: "" });
    return () => {
      mounted.current = false;
      if (generation.current === revision) ++generation.current;
      pending.current = 0;
      releaseCompositionWaiters(false);
      busyCallback.current?.(false);
    };
  }, [scopeKey]);

  useEffect(() => {
    const root = editor.current;
    if (!root) return;
    const normalize = () => {
      if (!disabled && !composing.current) normalizeEditorCaret(root);
    };
    root.ownerDocument.addEventListener("selectionchange", normalize);
    return () =>
      root.ownerDocument.removeEventListener("selectionchange", normalize);
  }, [disabled]);

  function imageNode(part: CreationImagePart, index: number): HTMLElement {
    const doc = editor.current!.ownerDocument;
    const node = doc.createElement("span");
    node.className = "markdown-editor-image";
    node.contentEditable = "false";
    node.setAttribute("contenteditable", "false");
    node.setAttribute("data-creation-markdown", part.markdown);
    node.setAttribute("data-image-key", creationImagePreviewKey(part));
    node.setAttribute(
      "data-image-alt",
      part.alt && part.alt !== "截图" ? part.alt : `截图 ${index + 1}`,
    );
    const display = doc.createElement("span");
    display.className = "markdown-editor-image-display";
    const remove = doc.createElement("button");
    remove.type = "button";
    remove.className = "markdown-editor-image-remove";
    remove.setAttribute("data-remove-image", "");
    remove.setAttribute("aria-label", `删除图片 ${index + 1}`);
    remove.textContent = "×";
    const retry = doc.createElement("button");
    retry.type = "button";
    retry.className = "markdown-image-retry";
    retry.setAttribute("data-retry-image", "");
    retry.textContent = "重新读取图片";
    retry.hidden = true;
    node.append(display, remove, retry);
    return node;
  }
  function paintImages() {
    const root = editor.current;
    if (!root) return;
    for (const node of root.querySelectorAll<HTMLElement>(
      "[data-creation-markdown]",
    )) {
      const image = preview.images[node.getAttribute("data-image-key") || ""];
      const remove = node.querySelector<HTMLButtonElement>(
        "[data-remove-image]",
      );
      const retry = node.querySelector<HTMLButtonElement>("[data-retry-image]");
      if (remove) remove.disabled = !!disabled;
      if (retry) {
        retry.disabled = !!disabled;
        retry.hidden = !image?.error;
      }
      if (painted.current.has(node) && painted.current.get(node) === image)
        continue;
      painted.current.set(node, image);
      const display = node.querySelector<HTMLElement>(
        ".markdown-editor-image-display",
      )!;
      const alt = node.getAttribute("data-image-alt") || "截图";
      function placeholder(message: string) {
        const fallback = root!.ownerDocument.createElement("span");
        fallback.className = "markdown-editor-image-placeholder";
        const label = root!.ownerDocument.createElement("span");
        label.textContent = alt;
        const detail = root!.ownerDocument.createElement("small");
        detail.textContent = message;
        fallback.append(label, detail);
        display.replaceChildren(fallback);
      }
      if (image?.dataUrl) {
        const img = root.ownerDocument.createElement("img");
        img.src = image.dataUrl;
        img.alt = alt;
        img.draggable = false;
        img.addEventListener("error", () => {
          if (!root.contains(img)) return;
          placeholder("图片暂未显示，正文和草稿已保留");
          if (retry) retry.hidden = false;
        });
        display.replaceChildren(img);
      } else
        placeholder(
          image?.external
            ? workflow ? "请在飞书中查看图片" : "外部图片，创建后可在飞书查看"
            : image?.error
              ? "图片暂未显示，正文和草稿已保留"
              : "正在读取本机图片…",
        );
    }
  }
  function renderValue(
    next: string,
    selection?: EditorSelection,
    focus = false,
  ) {
    const root = editor.current;
    if (!root) return;
    renderEditorMarkdown(root, next, imageNode);
    paintImages();
    if (focus) root.focus();
    if (selection) setEditorSelection(root, selection.start, selection.end);
  }
  useLayoutEffect(() => {
    const root = editor.current;
    if (!root) return;
    const changedScope = renderedScope.current !== scopeKey;
    const external = value !== lastPublished.current;
    if (changedScope) {
      renderedScope.current = scopeKey;
      composing.current = false;
      compositionStart.current = null;
      beforeInput.current = null;
      history.current = {
        past: [],
        future: [],
        present: { value, start: 0, end: 0 },
      };
    }
    if (
      changedScope ||
      (!composing.current &&
        (editorMarkdown(root) !== value || !editorImagesMatch(root, value)))
    ) {
      const selection = changedScope
        ? undefined
        : editorSelection(root) || undefined;
      renderValue(value, selection);
    }
    if (!composing.current) {
      lastPublished.current = value;
      if (external)
        history.current = { past: [], future: [], present: snapshot() };
    }
    root.dataset.empty = String(!editorMarkdown(root));
    paintImages();
  }, [scopeKey, value, preview.images, disabled]);

  function publish(next: string) {
    if (editor.current) editor.current.dataset.empty = String(!next);
    if (lastPublished.current === next) return;
    lastPublished.current = next;
    change.current(next);
  }
  function remember(before: Snapshot, next: Snapshot) {
    if (before.value !== next.value) {
      history.current.past.push(before);
      if (history.current.past.length > 100) history.current.past.shift();
      history.current.future = [];
    }
    history.current.present = next;
  }
  function replaceText(text: string, selected?: EditorSelection, focus = true) {
    const before = snapshot(),
      selection = selected || before;
    const next =
      before.value.slice(0, selection.start) +
      text +
      before.value.slice(selection.end);
    const cursor = selection.start + text.length;
    remember(before, { value: next, start: cursor, end: cursor });
    renderValue(next, { start: cursor, end: cursor }, focus);
    publish(next);
  }
  function input() {
    if (disabled) return;
    const next = snapshot();
    if (!composing.current)
      remember(beforeInput.current || history.current.present, next);
    beforeInput.current = null;
    publish(next.value);
    if (
      !composing.current &&
      editor.current &&
      !editorImagesMatch(editor.current, next.value)
    )
      renderValue(next.value, next);
  }
  function undo(redo = false) {
    const source = redo ? history.current.future : history.current.past;
    const next = source.pop();
    if (!next) return;
    (redo ? history.current.past : history.current.future).push(snapshot());
    history.current.present = next;
    renderValue(next.value, next, true);
    publish(next.value);
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (
      disabled ||
      composing.current ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    )
      return;
    if ((event.target as HTMLElement).closest("button")) return;
    if (
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      ["ArrowLeft", "ArrowRight"].includes(event.key) &&
      editor.current &&
      moveEditorCaret(
        editor.current,
        event.key === "ArrowLeft" ? -1 : 1,
        event.shiftKey,
      )
    ) {
      event.preventDefault();
      return;
    }
    const modifier = (event.ctrlKey || event.metaKey) && !event.altKey;
    if (modifier && ["z", "y"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      undo(event.key.toLowerCase() === "y" || event.shiftKey);
      return;
    }
    if (modifier && ["b", "i", "u"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      replaceText("\n");
      return;
    }
    if (!["Backspace", "Delete"].includes(event.key)) return;
    const selected = snapshot();
    if (selected.start !== selected.end) {
      event.preventDefault();
      replaceText("", selected);
      return;
    }
    if (atEditorImageBoundary(selected.value, selected.start)) {
      const next = adjacentEditorOffset(
        selected.value,
        selected.start,
        event.key === "Backspace" ? -1 : 1,
      );
      if (next === selected.start) {
        event.preventDefault();
        return;
      }
      const deletingImage = splitCreationMarkdown(selected.value).some(
        (part) =>
          part.kind === "image" &&
          (event.key === "Backspace"
            ? part.end === selected.start
            : part.start === selected.start),
      );
      if ((event.ctrlKey || event.metaKey || event.altKey) && !deletingImage)
        return;
      event.preventDefault();
      replaceText("", {
        start: Math.min(next, selected.start),
        end: Math.max(next, selected.start),
      });
    }
  }
  async function paste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    const entries = Array.from(event.clipboardData.items || [])
      .filter((entry) => entry.kind === "file")
      .map((entry) => entry.getAsFile())
      .filter((file): file is File => !!file);
    const files = (
      entries.length ? entries : Array.from(event.clipboardData.files || [])
    ).filter((file) => file.type.startsWith("image/"));
    if (!files.length) {
      replaceText(event.clipboardData.getData?.("text/plain") || "");
      return;
    }
    if (!allowImages) { setError("此节点字段暂无法确认图片归属，请在飞书中修改图片。"); return; }
    if (files.some((file) => !creationImageMimeTypes.has(file.type))) {
      setError("截图仅支持 PNG、JPEG 和 WebP 图片。");
      return;
    }
    if (files.some((file) => file.size > maxCreationImageBytes)) {
      setError("图片不能超过 8 MB，请缩小截图后重试。");
      return;
    }
    const key = scopeKey,
      revision = generation.current;
    const original = snapshot();
    ++pending.current;
    setStatus({ scope: key, saving: pending.current, error: "" });
    busyCallback.current?.(true);
    try {
      for (const [index, file] of files.entries()) {
        const bytes = await clipboardImageBase64(file);
        if (!current(key, revision)) return;
        const saved = await saveCreationImage(
          scope,
          bytes,
          file.type,
          file.name || "截图.png",
        );
        if (!current(key, revision)) return;
        if (
          !/^[a-f0-9]{64}$/.test(saved.image_id) ||
          saved.markdown_url !== `fstodo-image:${saved.image_id}`
        )
          throw new Error("图片保存结果无法识别，请保留文字后重新粘贴。");
        // 保存回执可能在输入法组合期间到达；等待组合结束再重建图片节点。
        if (!(await waitForComposition(key, revision))) return;
        const latest = snapshot();
        const selected =
          index === 0 && latest.value === original.value ? original : latest;
        const focus = !!editor.current?.contains(document.activeElement);
        replaceText(`![截图](${saved.markdown_url})`, selected, focus);
      }
    } catch (failure) {
      if (current(key, revision)) setError(asError(failure).message);
    } finally {
      if (current(key, revision)) {
        pending.current = Math.max(0, pending.current - 1);
        setStatus((previous) => ({ ...previous, saving: pending.current }));
        busyCallback.current?.(pending.current > 0);
      }
    }
  }
  return (
    <div className="markdown-clipboard">
      <div
        id={id}
        ref={editor}
        className="markdown-clipboard-editor"
        role="textbox"
        aria-label={ariaLabel}
        aria-required={required}
        aria-multiline="true"
        aria-disabled={disabled || undefined}
        aria-describedby={`${id}-paste-hint`}
        aria-placeholder={allowImages ? "待填，支持 Markdown，可直接粘贴截图" : "待填，支持 Markdown"}
        data-placeholder={allowImages ? "待填，支持 Markdown，可直接粘贴截图" : "待填，支持 Markdown"}
        contentEditable={!disabled}
        suppressContentEditableWarning
        tabIndex={disabled ? -1 : 0}
        onBeforeInput={(event) => {
          if (disabled) {
            event.preventDefault();
            return;
          }
          const type = (event.nativeEvent as InputEvent).inputType || "";
          if (type.startsWith("format")) {
            event.preventDefault();
            return;
          }
          if (
            !composing.current &&
            ["insertParagraph", "insertLineBreak"].includes(type)
          ) {
            event.preventDefault();
            replaceText("\n");
            return;
          }
          beforeInput.current = snapshot();
        }}
        onInput={input}
        onKeyDown={keyboard}
        onPaste={(event) => void paste(event)}
        onDrop={(event) => event.preventDefault()}
        onCompositionStart={() => {
          composing.current = true;
          compositionStart.current = snapshot();
        }}
        onCompositionEnd={() => {
          composing.current = false;
          const next = snapshot();
          remember(compositionStart.current || history.current.present, next);
          compositionStart.current = null;
          publish(next.value);
          if (editor.current && !editorImagesMatch(editor.current, next.value))
            renderValue(next.value, next);
          releaseCompositionWaiters(true);
        }}
        onMouseUp={() => {
          if (!composing.current && editor.current)
            normalizeEditorCaret(editor.current);
          history.current.present = snapshot();
        }}
        onKeyUp={() => {
          if (!composing.current) {
            if (editor.current) normalizeEditorCaret(editor.current);
            history.current.present = snapshot();
          }
        }}
        onCopy={(event) => {
          const selected = snapshot();
          if (selected.start === selected.end) return;
          event.preventDefault();
          event.clipboardData.setData(
            "text/plain",
            selected.value.slice(selected.start, selected.end),
          );
        }}
        onCut={(event) => {
          if (disabled) return;
          const selected = snapshot();
          if (selected.start === selected.end) return;
          event.preventDefault();
          event.clipboardData.setData(
            "text/plain",
            selected.value.slice(selected.start, selected.end),
          );
          replaceText("", selected);
        }}
        onClick={(event) => {
          if (disabled) return;
          const button = (
            event.target as HTMLElement
          ).closest<HTMLButtonElement>("button");
          const node = button?.closest<HTMLElement>("[data-creation-markdown]");
          if (!button || !node || !editor.current?.contains(node)) return;
          event.preventDefault();
          if (button.hasAttribute("data-remove-image")) {
            const start = editorOffsetBefore(editor.current, node);
            replaceText("", {
              start,
              end:
                start +
                (node.getAttribute("data-creation-markdown") || "").length,
            });
          } else if (button.hasAttribute("data-retry-image")) {
            const part = splitCreationMarkdown(
              node.getAttribute("data-creation-markdown") || "",
            ).find((part): part is CreationImagePart => part.kind === "image");
            if (part) void preview.retry(part);
          }
        }}
      />
      <p id={`${id}-paste-hint`} className="hint markdown-clipboard-hint">
        {allowImages ? "支持 Markdown 和直接粘贴截图，图片随草稿保存在本机。" : "支持 Markdown；此字段的图片请在飞书中查看或修改。"}
      </p>
      {status.scope === scopeKey && status.saving > 0 && (
        <p className="hint markdown-clipboard-status" role="status">
          <LoaderCircle size={13} className="spin" />
          正在保存截图…
        </p>
      )}
      {status.scope === scopeKey && status.error && (
        <p className="error-text markdown-clipboard-status" role="alert">
          {status.error}
        </p>
      )}
    </div>
  );
}
