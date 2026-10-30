import { invoke } from "@tauri-apps/api/core";
import type { CachedItem, Source } from "./types";
import { typePreference, type SourceTypePreferences } from "./preferences";

export type CreationTarget = {
  source_id: string;
  project_key: string;
  type_key: string;
};
export type CreationOption = {
  value: string;
  label: string;
  color?: string | null;
};
export type CreationLookupResult = {
  options: CreationOption[];
  warning: string | null;
};
export type CreationField = {
  key: string;
  label: string;
  kind: string;
  required: boolean;
  multiple: boolean;
  initial: unknown;
  options: CreationOption[];
  role_id?: string | null;
  reporter_self?: boolean;
};
export type CreationRequest = {
  target: CreationTarget;
  request_id: string;
  version: string;
  fields: Record<string, unknown>;
};
export type CreationResult = {
  outcome: "verified" | "unknown" | "not_submitted";
  message: string;
  request_id: string;
  item_id: CachedItem["id"] | null;
  can_verify: boolean;
};
export type CreationForm = {
  target: CreationTarget;
  context: string;
  version: string;
  fields: CreationField[];
  role_requirements_complete?: boolean;
  pending: { request: CreationRequest; result: CreationResult } | null;
};
export type CreationLocation = CreationTarget & {
  space: string;
  name: string;
  pending_form?: CreationForm;
};
export function creationLocations(
  sources: Source[],
  preferences: SourceTypePreferences,
  selection: { types?: string[]; spaces?: string[] } = {},
): CreationLocation[] {
  const found = new Map<string, CreationLocation>();
  for (const source of sources.filter((s) => s.enabled && s.executable)) {
    for (const type of source.type_scope?.types || []) {
      if (
        (source.project_key && source.project_key !== type.project_key) ||
        (source.work_item_type_key &&
          source.work_item_type_key !== type.type_key)
      )
        continue;
      const preference = typePreference(
        preferences[source.id] || {},
        type.type_key,
      );
      if (preference.create_enabled !== true) continue;
      if (selection.types?.length && !selection.types.includes(type.type_key))
        continue;
      if (
        selection.spaces?.length &&
        !selection.spaces.includes(type.project_key)
      )
        continue;
      const key = JSON.stringify([type.project_key, type.type_key]);
      if (!found.has(key))
        found.set(key, {
          source_id: source.id,
          project_key: type.project_key,
          type_key: type.type_key,
          space: type.project_name || type.project_key,
          name: preference.alias || type.type_name || type.type_key,
        });
    }
  }
  return [...found.values()];
}
export const creationTargetKey = (target: CreationTarget) =>
  JSON.stringify([target.project_key, target.type_key]);
export const getCreationForm = (target: CreationTarget) =>
  invoke<CreationForm>("get_creation_form", { target });
export const getPendingCreations = () =>
  invoke<CreationForm[]>("get_pending_creations");
export const lookupCreationField = (
  target: CreationTarget,
  fieldKey: string,
  query: string,
) =>
  invoke<CreationLookupResult>("lookup_creation_field", {
    target,
    fieldKey,
    query,
  });
export const createWorkItem = (request: CreationRequest) =>
  invoke<CreationResult>("create_work_item", { request });
export const verifyCreation = (
  requestId: string,
  itemNumber?: string,
  localRequest?: CreationRequest,
) =>
  invoke<CreationResult>("verify_work_item_creation", {
    requestId,
    itemNumber: itemNumber || null,
    localRequest: localRequest || null,
  });

export const creationEmpty = (v: unknown) =>
  v == null ||
  (typeof v === "string" && !v.trim()) ||
  (Array.isArray(v) && !v.length);
export function creationInitial(field: CreationField): unknown {
  if (field.kind === "unsupported") return null;
  return (
    field.initial ?? (field.multiple ? [] : field.kind === "bool" ? false : "")
  );
}
export function creationValue(
  field: CreationField,
  value: unknown,
  labels: Record<string, string>,
): string {
  if (creationEmpty(value)) return "未填写";
  if (typeof value === "boolean") return value ? "开启" : "关闭";
  const show = (v: unknown) =>
    labels[`${field.key}:${String(v)}`] ||
    field.options.find((o) => o.value === String(v))?.label ||
    String(v);
  return Array.isArray(value) ? value.map(show).join("、") : show(value);
}
