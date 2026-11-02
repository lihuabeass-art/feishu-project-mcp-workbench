import { invoke } from "@tauri-apps/api/core";
import type { CreationForm } from "./creation";
import type { CreationImageScope } from "./creationImages";

export const maxCreationAttachmentBytes = 8 * 1024 * 1024;
export type CreationAttachment = {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  file_token: string | null;
};
export const saveCreationAttachment = (
  scope: CreationImageScope,
  bytesBase64: string,
  mimeType: string,
  fileName: string,
) =>
  invoke<CreationAttachment>("save_creation_attachment", {
    ...scope,
    bytesBase64,
    mimeType,
    fileName,
  });
export const getCreationAttachment = (
  scope: CreationImageScope,
  attachmentId: string,
) =>
  invoke<CreationAttachment>("get_creation_attachment", {
    ...scope,
    attachmentId,
  });
export const uploadCreationAttachment = (
  scope: CreationImageScope,
  attachmentId: string,
) =>
  invoke<CreationAttachment>("upload_creation_attachment", {
    ...scope,
    attachmentId,
  });

export function creationAttachments(value: unknown): CreationAttachment[] {
  if (value == null || value === "") return [];
  if (
    !Array.isArray(value) ||
    value.some(
      (file) =>
        !file ||
        typeof file !== "object" ||
        !/^[a-f0-9]{64}$/.test(file.id) ||
        typeof file.name !== "string" ||
        !file.name.trim() ||
        typeof file.mime_type !== "string" ||
        !Number.isSafeInteger(file.size) ||
        file.size <= 0 ||
        file.size > maxCreationAttachmentBytes ||
        (file.file_token != null && typeof file.file_token !== "string"),
    )
  )
    throw new Error("附件草稿无法读取，请移除后重新选择文件。");
  return value as CreationAttachment[];
}

export function attachmentSize(size: number): string {
  return size < 1024
    ? `${size} B`
    : size < 1024 * 1024
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function attachmentBase64(file: File): Promise<string> {
  if (!file.size || file.size > maxCreationAttachmentBytes)
    return Promise.reject(new Error("附件不能为空，且每个不能超过 8 MB。"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reader.onabort = () =>
      reject(new Error("未能读取附件，请重新选择文件。"));
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      const comma = value.indexOf(",");
      if (comma < 0) reject(new Error("未能读取附件，请重新选择文件。"));
      else resolve(value.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

/** 用户确认后逐个上传、保存草稿，全部完成后才允许创建。 */
export async function uploadCreationAttachments(
  form: CreationForm,
  values: Record<string, unknown>,
  onSaved: (values: Record<string, unknown>) => boolean,
  onProgress: (completed: number, total: number) => void,
): Promise<Record<string, unknown>> {
  const jobs = form.fields
    .filter((field) => field.kind === "attachment")
    .flatMap((field) =>
      creationAttachments(values[field.key]).map((file) => ({ field, file })),
    );
  let next = { ...values };
  for (const [index, { field, file }] of jobs.entries()) {
    onProgress(index, jobs.length);
    // 即使草稿已有 token，也由后端核对当前账号、字段与真实缓存，复用成功回执。
    const uploaded = await uploadCreationAttachment(
      { target: form.target, context: form.context, fieldKey: field.key },
      file.id,
    );
    if (
      uploaded.id !== file.id ||
      uploaded.name !== file.name ||
      uploaded.size !== file.size ||
      uploaded.mime_type !== file.mime_type ||
      !uploaded.file_token
    )
      throw new Error("附件上传结果尚未确认，文件和草稿已保留。");
    next = {
      ...next,
      [field.key]: creationAttachments(next[field.key]).map((entry) =>
        entry.id === file.id ? uploaded : entry,
      ),
    };
    if (!onSaved(next))
      throw new Error("附件已上传，但本机草稿未能保存，请保留此窗口后重试。");
    onProgress(index + 1, jobs.length);
  }
  return next;
}
