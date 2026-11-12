import { localTime } from "./model";
import type { ItemDetail } from "./types";

type Field = ItemDetail["data"]["work_item_fields"][number];

// 飞书项目内置字段的固定 key；空间自定义字段统一为 field_xxxxxx，始终视为业务内容。
// 这些字段是流程内部标识、计数或与概要重复的值，收进“系统字段”而不是丢弃。
const SYSTEM_FIELD_KEYS = new Set([
  "auto_number",
  "template_version",
  "template_type",
  "sub_stage",
  "finish_status",
  "archiving_status",
  "current_status_operator_role",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
]);
export const SUMMARY_FIELD_KEYS = {
  operators: "current_status_operator",
  priority: "priority",
} as const;
const summaryKeys = new Set<string>(Object.values(SUMMARY_FIELD_KEYS));

export function isEmpty(value: unknown) {
  if (value == null || (typeof value === "string" && !value.trim())) return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === "object" && Object.keys(value).length === 0;
}

function isScalar(value: unknown) {
  return value == null || ["string", "number", "boolean"].includes(typeof value);
}

const linkKeys = ["url", "src", "file_url", "download_url", "attrs"];

/** 人员、枚举、关联项、日期等扁平对象的可读文本；无法安全化简时返回 null。 */
export function readable(value: unknown): string | null {
  if (typeof value === "boolean") return value ? "是" : "否";
  if (value === "true" || value === "false") return value === "true" ? "是" : "否";
  if (typeof value === "number") return String(value);
  if (typeof value === "string")
    return value && !value.includes("\n") && !/^https?:/i.test(value) ? value : null;
  if (Array.isArray(value)) {
    if (!value.length) return null;
    const parts = value.map(readable);
    return parts.every((part) => part != null) ? parts.join("、") : null;
  }
  if (value == null || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  if (linkKeys.some((key) => key in object)) return null;
  if (!Object.values(object).every(isScalar)) return null;
  if (typeof object.iso_time === "string") return isoTime(object.iso_time);
  const label = object.label ?? object.name;
  return typeof label === "string" && label ? label : null;
}

export function isoTime(value: unknown) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? value : localTime(ms);
}

/** 短值放在左右对齐的紧凑列表，长文、链接、图片和复杂对象独占整行。 */
export function isInline(value: unknown) {
  const text = readable(value);
  return text != null && text.length <= 40;
}

function isSystemField(field: Field) {
  if (field.key === "is_frozen") return readable(field.value) !== "是";
  return SYSTEM_FIELD_KEYS.has(field.key);
}

export function classifyFields(fields: Field[], pinnedKeys: string[] = [], attribute: Record<string, unknown> = {}, descriptionKeys: string[] = []) {
  // 保留所有同名说明字段，避免不同字段同名时掩盖任何实际内容。
  const descriptions = fields.filter((field) => descriptionKeys.includes(field.key) || field.key === "description" ||
    ["需求说明", "缺陷描述", "事项说明"].includes(field.name?.trim() ?? ""));
  const pinned: Field[] = [];
  const summary: Partial<Record<keyof typeof SUMMARY_FIELD_KEYS, Field>> = {};
  const inline: Field[] = [];
  const block: Field[] = [];
  const empty: Field[] = [];
  const system: Field[] = [];
  for (const field of fields) {
    if (descriptions.includes(field)) continue;
    // 仅按协议中明确的同义 key 与原值消除摘要重复，不按名称或跨语义的相同文本去重。
    const alias = ({ created_by: "create_by", created_at: "create_time", updated_by: "updated_by", updated_at: "update_time",
      work_item_status: "work_item_status" } as Record<string, string>)[field.key];
    if (!pinnedKeys.includes(field.key) && alias && !isEmpty(attribute[alias]) && JSON.stringify(attribute[alias]) === JSON.stringify(field.value)) continue;
    if (summaryKeys.has(field.key) && !isEmpty(field.value)) {
      const slot = field.key === SUMMARY_FIELD_KEYS.priority ? "priority" : "operators";
      summary[slot] ??= field;
    } else if (pinnedKeys.includes(field.key)) {
      pinned.push(field);
    } else if (isSystemField(field)) {
      if (!isEmpty(field.value)) system.push(field);
    } else if (isEmpty(field.value)) empty.push(field);
    else (isInline(field.value) ? inline : block).push(field);
  }
  return { summary, descriptions, pinned, inline, block, empty, system };
}

export function defaultPinnedKeys(fields: Field[]) {
  return fields.filter((field) => ["代码版本号", "代码版本", "版本号", "规划版本"]
    .includes(field.name?.trim() ?? "")).map((field) => field.key);
}

export function fixedDocumentKeys(fields: Field[]) {
  return fields.filter((field) => ["产品设计文档", "后端设计文档", "前端设计文档"]
    .includes(field.name?.trim() ?? "")).map((field) => field.key);
}

// 基础属性中已由标题、概要、角色或技术信息展示的部分。
const SHOWN_ATTRIBUTES = new Set([
  "work_item_id",
  "work_item_name",
  "work_item_status",
  "work_item_type",
  "owned_project",
  "work_item_mod",
  "role_members",
  "create_by",
  "create_time",
  "updated_by",
  "update_time",
]);
const attributeNames: Record<string, string> = { template: "流程模板" };

export function extraAttributes(attribute: Record<string, unknown>) {
  return Object.entries(attribute)
    .filter(([key, value]) => !SHOWN_ATTRIBUTES.has(key) && !isEmpty(value))
    .map(([key, value]) => ({ key, name: attributeNames[key] ?? key, value }));
}

export function fieldName(field: Field) {
  return field.name || field.key;
}
