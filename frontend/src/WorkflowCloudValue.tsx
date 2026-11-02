import { BusinessField } from "./BusinessField";
import { displayFieldValue } from "./WorkflowConflict";
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
  if (field.read_only && field.rich_text && value.trim())
    return (
      <div className="workflow-review-value" style={{ whiteSpace: "normal" }}>
        <BusinessField
          itemId={itemId}
          fieldKey={field.rich_text.image_field_key}
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
