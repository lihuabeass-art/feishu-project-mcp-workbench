import { useId } from "react";
import { ArrowRight } from "lucide-react";
import { displayFieldValue } from "./WorkflowConflict";
import type { WorkflowAction, WorkflowRequest } from "./types";

type Field = WorkflowAction["fields"][number];
const sectionOrder = ["node", "assignee", "work_item", "other"];

export function WorkflowReviewFields({
  action,
  changes,
  remote,
}: {
  action: WorkflowAction;
  changes: WorkflowRequest["fields"];
  remote: Record<string, string>;
}) {
  const id = useId();
  const groups = new Map<string, WorkflowAction["fields"]>();
  const titles: Record<string, string> = {
    work_item: "事项信息",
    node: "节点信息",
    assignee: "负责人信息",
    other: "字段信息",
  };
  for (const field of action.fields) {
    const scope = field.scope ?? "other";
    const group = groups.get(scope) ?? [];
    group.push(field);
    groups.set(scope, group);
  }
  const changedCount = action.fields.filter(
    (field) => changes[field.key] !== undefined,
  ).length;
  const modifiedCount = action.fields.filter(
    (field) =>
      changes[field.key] !== undefined &&
      (remote[field.key] ?? field.initial_value ?? "").trim().length > 0,
  ).length;
  const addedCount = changedCount - modifiedCount;

  function row(field: Field, label = field.label) {
    const current = remote[field.key] ?? field.initial_value ?? "";
    const submitted = changes[field.key];
    const changed = submitted !== undefined;
    const hasCurrent = current.trim().length > 0;
    const value = changed ? submitted.trim() : current;
    const display = (text: string) => displayFieldValue(field, text);
    const shown = value.trim() ? display(value) || "未填写" : "未填写";
    return (
      <div
        className={`workflow-review-row${changed ? " is-changed" : ""}`}
        key={field.key}
      >
        <dt>
          <span aria-label={label === field.label ? undefined : field.label}>
            {label}
          </span>
        </dt>
        <dd>
          <div className="workflow-review-content">
            {changed ? (
              <div
                className={
                  hasCurrent ? "workflow-review-comparison" : undefined
                }
              >
                {hasCurrent && (
                  <>
                    <div
                      className="workflow-review-before"
                      role="group"
                      aria-label={`${field.label}云端当前值`}
                    >
                      <small className="workflow-review-value-label">
                        云端当前值：
                      </small>
                      <span className="workflow-review-before-value">
                        {display(current)}
                      </span>
                    </div>
                    <ArrowRight
                      className="workflow-review-arrow"
                      size={14}
                      aria-hidden="true"
                    />
                  </>
                )}
                <div
                  className="workflow-review-after"
                  role="group"
                  aria-label={`${field.label}本次提交值`}
                >
                  <small
                    className={`workflow-review-value-label${hasCurrent ? "" : " sr-only"}`}
                  >
                    本次提交值
                  </small>
                  <span className="workflow-review-value">{shown}</span>
                </div>
              </div>
            ) : (
              <span
                className={`workflow-review-value${value.trim() ? "" : " workflow-review-empty"}`}
              >
                {shown}
              </span>
            )}
          </div>
          <small
            className={`workflow-review-source${changed ? " is-changed" : ""}`}
          >
            {changed ? (hasCurrent ? "本次修改" : "本次新增") : "沿用云端"}
          </small>
        </dd>
      </div>
    );
  }

  function ownerRows(fields: Field[]) {
    const entries: { owner?: string; fields: Field[] }[] = [];
    const owners = new Map<string, { owner: string; fields: Field[] }>();
    for (const field of fields) {
      // 只使用结构化元数据归拢；旧字段保留完整名称，不从标签猜测负责人。
      const owner = field.owner?.trim();
      if (!owner || !field.column?.trim()) {
        entries.push({ fields: [field] });
        continue;
      }
      let entry = owners.get(owner);
      if (!entry) {
        entry = { owner, fields: [] };
        owners.set(owner, entry);
        entries.push(entry);
      }
      entry.fields.push(field);
    }
    return entries.map((entry, index) =>
      entry.owner ? (
        <div
          className="workflow-review-owner"
          role="group"
          aria-labelledby={`${id}-owner-${index}`}
          key={entry.fields[0].key}
        >
          <h6 id={`${id}-owner-${index}`}>{entry.owner}</h6>
          <dl>
            {entry.fields.map((field) => row(field, field.column!.trim()))}
          </dl>
        </div>
      ) : (
        <dl key={entry.fields[0].key}>
          {entry.fields.map((field) => row(field))}
        </dl>
      ),
    );
  }

  return (
    <div className="workflow-review-fields">
      <div className="workflow-review-summary" aria-label="核对概览">
        <span>共 {action.fields.length} 项字段</span>
        <span className="workflow-review-change-count">
          {addedCount} 项新增
        </span>
        <span className="workflow-review-change-count">
          {modifiedCount} 项修改
        </span>
        <span>{action.fields.length - changedCount} 项沿用云端</span>
      </div>
      {sectionOrder
        .filter((scope) => groups.has(scope))
        .map((scope) => {
          const fields = groups.get(scope)!;
          return (
            <section
              className="workflow-review-section"
              key={scope}
              aria-labelledby={`${id}-${scope}`}
            >
              <div className="workflow-review-section-heading">
                <h5 id={`${id}-${scope}`}>{titles[scope]}</h5>
                <span>{fields.length} 项</span>
              </div>
              {scope === "assignee" ? (
                ownerRows(fields)
              ) : (
                <dl>{fields.map((field) => row(field))}</dl>
              )}
            </section>
          );
        })}
    </div>
  );
}
