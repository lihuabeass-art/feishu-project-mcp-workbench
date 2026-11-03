import { invoke } from "@tauri-apps/api/core";
import type { CreationForm, CreationTarget } from "./creation";
import type { CachedItem } from "./types";

export const maxCreationImageBytes = 8 * 1024 * 1024;
export const creationImageMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
export type CreationImageScope = {
  target: CreationTarget;
  context: string;
  fieldKey: string;
  workflow?: { itemId: CachedItem["id"]; actionId: string; fieldKey: string; imageFieldKey?: string };
};
export type SavedCreationImage = { image_id: string; markdown_url: string };
export type CreationImagePreview = {
  data_url: string;
  uploaded_url?: string | null;
  uploaded_token?: string | null;
};
export type UploadedCreationImage = { url: string; file_token: string };
export type CreationMarkdownPart =
  | { kind: "text"; text: string; start: number; end: number }
  | {
      kind: "image";
      markdown: string;
      url: string;
      alt: string;
      start: number;
      end: number;
      fileToken?: string;
    };

export const saveCreationImage = (
  scope: CreationImageScope,
  bytesBase64: string,
  mimeType: string,
  fileName: string,
) =>
  invoke<SavedCreationImage>("save_creation_image", {
    ...scope,
    bytesBase64,
    mimeType,
    fileName,
  });
export const getCreationImage = (scope: CreationImageScope, imageId: string) =>
  invoke<CreationImagePreview>("get_creation_image", { ...scope, imageId });
export const getUploadedCreationImage = (
  scope: CreationImageScope,
  url: string,
  fileToken: string,
) =>
  invoke<CreationImagePreview>("get_uploaded_creation_image", {
    ...scope,
    url,
    fileToken,
  });
export const uploadCreationImage = (
  scope: CreationImageScope,
  imageId: string,
) => scope.workflow
  ? invoke<UploadedCreationImage>("upload_workflow_image", { itemId: scope.workflow.itemId, actionId: scope.workflow.actionId, fieldKey: scope.workflow.fieldKey, context: scope.context, imageId })
  : invoke<UploadedCreationImage>("upload_creation_image", { ...scope, imageId });

export const isLocalCreationImageUrl = (url: string) =>
  /^fstodo-image:[a-f0-9]{64}$/.test(url);
export const localCreationImageId = (url: string): string | null =>
  isLocalCreationImageUrl(url) ? url.slice("fstodo-image:".length) : null;

function validFileToken(token: string): boolean {
  return (
    !!token &&
    token.length <= 8192 &&
    !/[\s<>\x00-\x1f\x7f]/.test(token) &&
    !token.includes("--")
  );
}

/** 仅把图片语法转换成可视节点，其余 Markdown 文字保持原样。 */
export function splitCreationMarkdown(
  markdown: string,
): CreationMarkdownPart[] {
  const parts: CreationMarkdownPart[] = [];
  const pattern =
    /!\[((?:\\.|[^\]\\\n])*)\]\((fstodo-image:[a-f0-9]{64}|https:\/\/[^\s)]+)\)(?:<!--([^<>]*?)-->)?/g;
  let cursor = 0;
  for (const match of markdown.matchAll(pattern)) {
    const start = match.index;
    // 代码块与行内代码中的示例继续作为文字编辑。
    const prefix = markdown.slice(0, start);
    const fenceLines = prefix
      .split("\n")
      .filter((line) => /^\s*(?:```|~~~)/.test(line));
    const linePrefix = prefix.slice(prefix.lastIndexOf("\n") + 1);
    if (
      fenceLines.length % 2 ||
      (linePrefix.match(/(?<!\\)`/g)?.length || 0) % 2
    )
      continue;
    if (start > cursor)
      parts.push({
        kind: "text",
        text: markdown.slice(cursor, start),
        start: cursor,
        end: start,
      });
    const token = match[3]?.trim();
    parts.push({
      kind: "image",
      markdown: match[0],
      url: match[2],
      alt: match[1].replace(/\\([\\\[\]])/g, "$1"),
      start,
      end: start + match[0].length,
      ...(token && validFileToken(token) && !token.startsWith("image:")
        ? { fileToken: token }
        : {}),
    });
    cursor = start + match[0].length;
  }
  if (cursor < markdown.length || !parts.length)
    parts.push({
      kind: "text",
      text: markdown.slice(cursor),
      start: cursor,
      end: markdown.length,
    });
  return parts;
}

export function localCreationImageIds(markdown: string): string[] {
  return [
    ...new Set(
      [...markdown.matchAll(/fstodo-image:([a-f0-9]{64})\b/g)].map(
        (match) => match[1],
      ),
    ),
  ];
}
export const hasLocalCreationImages = (value: unknown) =>
  typeof value === "string" && value.includes("fstodo-image:");

export function hasInvalidLocalCreationImages(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return splitCreationMarkdown(value).some(
    (part) => part.kind === "text" && part.text.includes("fstodo-image:"),
  );
}

export function creationImageRemoteUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("图片上传结果缺少可用链接，请保留草稿后重试。");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("图片上传结果缺少可用链接，请保留草稿后重试。");
  return url.href.replaceAll("(", "%28").replaceAll(")", "%29");
}

export function replaceCreationImageReference(
  markdown: string,
  imageId: string,
  remoteUrl: string,
  fileToken: string,
): string {
  if (!validFileToken(fileToken))
    throw new Error("图片上传结果缺少有效文件标识，请保留草稿后重试。");
  const url = creationImageRemoteUrl(remoteUrl);
  return splitCreationMarkdown(markdown)
    .map((part) =>
      part.kind === "image" && part.url === `fstodo-image:${imageId}`
        ? `![${part.alt.replace(/([\\\[\]])/g, "\\$1")}](${url})<!--${fileToken}-->`
        : part.kind === "image"
          ? part.markdown
          : part.text,
    )
    .join("");
}

/** 确认创建时上传；逐张保存成功结果后，才允许后续创建请求。 */
export async function uploadCreationImages(
  form: CreationForm,
  values: Record<string, unknown>,
  onUploaded: (values: Record<string, unknown>) => boolean,
  onProgress: (completed: number, total: number) => void,
): Promise<Record<string, unknown>> {
  if (Object.values(values).some(hasInvalidLocalCreationImages))
    throw new Error(
      "正文含无法识别的本机图片，请返回编辑后重新粘贴。图片和草稿已保留。",
    );
  const jobs = form.fields
    .filter((field) => field.kind === "textarea")
    .flatMap((field) =>
      localCreationImageIds(String(values[field.key] ?? "")).map((imageId) => ({
        field,
        imageId,
      })),
    );
  let next = { ...values };
  for (const [index, { field, imageId }] of jobs.entries()) {
    onProgress(index, jobs.length);
    const uploaded = await uploadCreationImage(
      { target: form.target, context: form.context, fieldKey: field.key },
      imageId,
    );
    next = {
      ...next,
      [field.key]: replaceCreationImageReference(
        String(next[field.key] ?? ""),
        imageId,
        uploaded.url,
        uploaded.file_token,
      ),
    };
    if (!onUploaded(next))
      throw new Error("图片已上传，但本机草稿未能保存，请保留此窗口后重试。");
    onProgress(index + 1, jobs.length);
  }
  if (Object.values(next).some(hasLocalCreationImages))
    throw new Error("正文仍有待处理的本机图片，请返回编辑后核对。");
  return next;
}

export async function clipboardImageBase64(file: File): Promise<string> {
  if (!creationImageMimeTypes.has(file.type))
    throw new Error("截图仅支持 PNG、JPEG 和 WebP 图片。");
  if (!file.size) throw new Error("剪贴板图片为空，请重新复制截图。");
  if (file.size > maxCreationImageBytes)
    throw new Error("图片不能超过 8 MB，请缩小截图后重试。");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("未能读取剪贴板图片，请重新复制后重试。"));
    reader.onabort = () => reject(new Error("图片读取已中断，请重新粘贴。"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const split = result.indexOf(",");
      if (split < 0)
        reject(new Error("未能读取剪贴板图片，请重新复制后重试。"));
      else resolve(result.slice(split + 1));
    };
    reader.readAsDataURL(file);
  });
}
