import type { WorkflowAction } from "./types";
import { formatPercentage } from "./percentage";
export type WorkflowField = WorkflowAction["fields"][number];

export function displayFieldValue(field: WorkflowField, text: string) {
  if (field.editor?.multiple) {
    const values = workflowValue(field, text);
    if (Array.isArray(values)) return values.map((value) => field.options?.find((o) => o.value === value)?.label || value).join("、");
  }
  return field.options?.find((o) => o.value === text)?.label ||
    (text && field.unit === "percent" ? formatPercentage(text) : text);
}

export function workflowValue(field: WorkflowField, raw: string): unknown {
  if (!field.editor?.multiple) return raw;
  try { return JSON.parse(raw || "[]"); } catch { return []; }
}

export function workflowValueEmpty(field: WorkflowField, raw: string | undefined) {
  if (!raw?.trim()) return true;
  const value = workflowValue(field, raw);
  return Array.isArray(value) && value.length === 0;
}

export function withWorkflowLabels(action: WorkflowAction, labels: Record<string, string>): WorkflowAction {
  return { ...action, fields: action.fields.map((field) => {
    if (!field.editor) return field;
    const prefix = `${field.key}:`;
    const known = new Map(field.options?.map((o) => [o.value, o.label]));
    for (const [key, label] of Object.entries(labels)) {
      if (key.startsWith(prefix)) known.set(key.slice(prefix.length), label);
    }
    return { ...field, options: [...known].map(([value, label]) => ({ value, label })) };
  }) };
}
