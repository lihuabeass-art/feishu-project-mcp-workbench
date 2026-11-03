import { BusinessField } from "./BusinessField";
import { useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { displayFieldValue } from "./workflowValues";
import { getCreationImage, getUploadedCreationImage, localCreationImageId, splitCreationMarkdown } from "./creationImages";
import { loadFieldImage } from "./api";
import type { CreationForm } from "./creation";
import type { CachedItem, WorkflowAction } from "./types";

export function WorkflowCloudValue({
  field,
  value,
  itemId,
}: {
  field: WorkflowAction["fields"][number];
  value: string;
  itemId: CachedItem["id"];
}) {
  const parts = useMemo(() => splitCreationMarkdown(value), [value]);
  const imageField = field.rich_text?.image_field_key;
  const loadImage = useCallback(async (url: string) => {
    const part = parts.find((part) => part.kind === "image" && part.url === url);
    const imageId = localCreationImageId(url);
    const fileToken = part?.kind === "image" ? part.fileToken : undefined;
    if (imageId || fileToken) {
      const context = await invoke<Pick<CreationForm, "target" | "context">>("get_workflow_editor_context", { itemId });
      const scope = { ...context, fieldKey: imageField! };
      if (imageId) return (await getCreationImage(scope, imageId)).data_url;
      try { return (await getUploadedCreationImage(scope, url, fileToken!)).data_url; }
      catch { /* 已有云端图片可能尚未存入本机上传缓存，继续按真实字段读取。 */ }
    }
    return loadFieldImage(itemId, imageField!, url);
  }, [itemId, imageField, parts]);
  if (field.rich_text && value.trim())
    return (
      <div className="workflow-review-value" style={{ whiteSpace: "normal" }}>
        <BusinessField
          itemId={itemId}
          fieldKey={field.rich_text.image_field_key}
          loadImage={field.editor && imageField ? loadImage : undefined}
          value={field.rich_text.structured_value ?? value}
        />
      </div>
    );
  return (
    <span
      className={`workflow-review-value${value.trim() ? "" : " workflow-review-empty"}`}
    >
      {value.trim() ? displayFieldValue(field, value) || "未填写" : "未填写"}
    </span>
  );
}
