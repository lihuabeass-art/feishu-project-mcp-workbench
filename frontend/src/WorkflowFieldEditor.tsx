import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { CreationLookup } from "./CreationLookup";
import { CreationSelect } from "./CreationSelect";
import type { CreationForm, CreationLookupResult } from "./creation";
import type { CachedItem, WorkflowAction } from "./types";
import { workflowValue } from "./workflowValues";
import { MarkdownClipboard } from "./MarkdownClipboard";
import { asError } from "./model";

export function WorkflowFieldEditor({ itemId, actionId, field, value, labels, disabled, onChange, onBusyChange }: {
  itemId: CachedItem["id"]; actionId: string; field: WorkflowAction["fields"][number]; value: string;
  labels: Record<string, string>; disabled: boolean;
  onChange: (value: string, labels?: Record<string, string>) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const scopeKey = JSON.stringify([itemId, actionId, field.key]);
  const lookup = useRef<{ key: string; request: Promise<CreationLookupResult> | null } | null>(null);
  function loadOptions() {
    if (lookup.current?.key !== scopeKey) lookup.current = { key: scopeKey, request: null };
    const cache = lookup.current;
    if (!cache.request) {
      const request = invoke<CreationLookupResult>("lookup_workflow_field", { itemId, actionId, fieldKey: field.key, query: "" });
      cache.request = request;
      request.catch(() => { if (cache.request === request) cache.request = null; });
    }
    return cache.request;
  }
  const [scope, setScope] = useState<{ key: string; target: CreationForm["target"]; context: string }>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  useEffect(() => {
    if (field.editor?.kind === "people" || field.editor?.kind === "relation")
      void loadOptions().catch(() => {});
  }, [scopeKey, field.editor?.kind]);
  useEffect(() => {
    if (field.editor?.kind !== "textarea") return;
    let cancelled = false;
    setError("");
    busyCallback.current(true);
    invoke<Pick<CreationForm, "target" | "context">>("get_workflow_editor_context", { itemId })
      .then((context) => { if (!cancelled) setScope({ ...context, key: scopeKey }); })
      .catch((failure) => { if (!cancelled) setError(asError(failure).message); })
      .finally(() => { if (!cancelled) busyCallback.current(false); });
    return () => { cancelled = true; busyCallback.current(false); };
  }, [scopeKey, retry]);
  const editor = { ...field.editor!, key: field.key, label: field.label, options: field.options || [] };
  const current = workflowValue(field, value);
  const update = (next: unknown, nextLabels?: Record<string, string>) => onChange(
    editor.multiple ? JSON.stringify(next) : String(next ?? ""), nextLabels,
  );
  const form: CreationForm = {
    target: { source_id: "workflow", project_key: itemId.project_key!, type_key: itemId.work_item_type_key! },
    context: JSON.stringify(itemId), version: actionId, fields: [editor], pending: null,
  };
  if (editor.kind === "textarea") {
    if (scope?.key !== scopeKey) return <div role="status">{error || "正在准备图文编辑…"}
      {error && <button type="button" className="text-button" disabled={disabled} onClick={() => setRetry((v) => v + 1)}>重新读取</button>}
    </div>;
    return <MarkdownClipboard id={`workflow-rich-${field.key}`} ariaLabel={field.label} required={field.required}
      value={value} onChange={onChange} target={scope.target} context={scope.context}
      fieldKey={field.rich_text?.image_field_key || field.editor!.key}
      workflow={{ itemId, actionId, fieldKey: field.key, imageFieldKey: field.rich_text?.image_field_key }} allowImages={!!field.rich_text?.image_field_key}
      disabled={disabled} onBusyChange={onBusyChange} />;
  }
  if (editor.kind === "people" || editor.kind === "relation") return <CreationLookup
    form={form} field={editor} value={current} labels={labels} disabled={disabled} allowClear={editor.multiple} change={update}
    loadOptions={loadOptions} localFilter
  />;
  if (editor.kind === "select") return <CreationSelect field={editor} value={current} onChange={update} disabled={disabled} />;
  return null;
}
