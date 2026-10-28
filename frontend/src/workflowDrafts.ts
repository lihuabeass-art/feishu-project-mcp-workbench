import type { WorkflowAction, WorkflowRequest } from "./types";

export interface WorkflowDraft {
  fields: Record<string, string>;
  updated_at: number;
  version: string;
  base_fields?: Record<string, string>;
  field_labels?: Record<string, string>;
  conflicts?: string[];
  pending?: WorkflowRequest;
}
export function draftKey(identity: string, actionId: string) {
  return "fstodo.workflow-draft.v1:" + JSON.stringify([identity, actionId]);
}
export function readDraft(key: string): WorkflowDraft | null {
  const text = localStorage.getItem(key);
  if (!text) return null;
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object")
    throw new Error("本地草稿格式无效，未覆盖原草稿。");
  const draft = value as WorkflowDraft;
  const isFields = (value: unknown): value is Record<string, string> =>
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "string");
  if (
    !isFields(draft.fields) ||
    (draft.base_fields !== undefined && !isFields(draft.base_fields)) ||
    (draft.field_labels !== undefined && !isFields(draft.field_labels)) ||
    (draft.conflicts !== undefined &&
      (!Array.isArray(draft.conflicts) ||
        draft.conflicts.some((key) => typeof key !== "string")))
  )
    throw new Error("本地草稿字段无效，未覆盖原草稿。");
  return draft;
}
export function writeDraft(key: string, draft: WorkflowDraft) {
  localStorage.setItem(key, JSON.stringify(draft));
}
export function remoteFields(action: WorkflowAction) {
  return Object.fromEntries(
    action.fields.map((f) => [f.key, f.initial_value ?? ""]),
  );
}

export function changedFields(
  action: WorkflowAction,
  fields: Record<string, string>,
  base: Record<string, string>,
) {
  return Object.fromEntries(
    action.fields
      .filter((field) => {
        const value = fields[field.key]?.trim() ?? "";
        // 空的可选项沿用“不修改”的约定，不能借此清空云端字段。
        return value !== "" && value !== (base[field.key]?.trim() ?? "");
      })
      .map((field) => [field.key, fields[field.key]]),
  );
}

export function reconcileDraft(
  action: WorkflowAction,
  draft: WorkflowDraft | null,
  version: string,
) {
  const base_fields = remoteFields(action);
  const fields = { ...base_fields };
  const field_labels = {
    ...draft?.field_labels,
    ...Object.fromEntries(action.fields.map((f) => [f.key, f.label])),
  };
  const conflicts: string[] = [];
  for (const field of action.fields) {
    const key = field.key,
      remote = base_fields[key];
    const local = draft?.fields[key];
    if (local === undefined) continue;
    if (draft?.pending) {
      fields[key] = local;
      continue;
    }
    const base = draft?.base_fields?.[key];
    if (base === undefined) {
      // 旧草稿缺少起点，空值沿用旧版补齐规则；非空异值必须人工核对。
      if (local.trim()) {
        fields[key] = local;
        if (draft?.version !== version && local !== remote) conflicts.push(key);
      }
    } else if (draft?.conflicts?.includes(key) && local !== remote) {
      fields[key] = local;
      conflicts.push(key);
    } else if (local !== base) {
      fields[key] = local;
      if (remote !== base && local !== remote) conflicts.push(key);
    }
  }
  // 已填完的必填项可能不再返回。保留其本机内容，人工舍弃前不能提交未知字段。
  for (const [key, local] of Object.entries(draft?.fields ?? {})) {
    if (action.fields.some((field) => field.key === key)) continue;
    const base = draft?.base_fields?.[key];
    if (
      draft?.pending ||
      draft?.conflicts?.includes(key) ||
      (base === undefined ? local.trim() : local !== base)
    ) {
      fields[key] = local;
      if (base !== undefined) base_fields[key] = base;
      conflicts.push(key);
    }
  }
  return { fields, base_fields, field_labels, conflicts };
}
