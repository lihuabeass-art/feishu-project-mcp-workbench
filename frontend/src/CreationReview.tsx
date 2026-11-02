import { useId } from "react";
import { CreationAttachmentReview } from "./CreationAttachmentPicker";
import { MarkdownPreview } from "./MarkdownPreview";
import {
  creationEmpty,
  creationValue,
  type CreationField,
  type CreationForm,
} from "./creation";

export function CreationReview({
  form,
  groups,
  values,
  labels,
}: {
  form: CreationForm;
  groups: { title: string; fields: CreationField[] }[];
  values: Record<string, unknown>;
  labels: Record<string, string>;
}) {
  const id = useId();
  return (
    <div className="creation-review" role="region" aria-label="创建内容核对">
      {groups
        .filter((group) => group.fields.length)
        .map((group, index) => (
          <section
            className="creation-review-section"
            key={group.title}
            aria-labelledby={`${id}-${index}`}
          >
            <header className="creation-review-section-heading">
              <h3 id={`${id}-${index}`}>{group.title}</h3>
              <span>{group.fields.length} 项</span>
            </header>
            <dl>
              {group.fields.map((field) => {
                const value = values[field.key];
                const empty = creationEmpty(value);
                const wide =
                  field.kind === "textarea" || field.kind === "attachment";
                return (
                  <div
                    className={`creation-review-row${wide ? " is-wide" : ""}${field.key === "name" ? " is-title" : ""}`}
                    key={field.key}
                  >
                    <dt>{field.label}</dt>
                    <dd className={empty ? "creation-review-empty" : undefined}>
                      {field.kind === "attachment" ? (
                        <CreationAttachmentReview value={value} />
                      ) : field.kind === "textarea" && !empty ? (
                        <MarkdownPreview
                          value={String(value)}
                          scope={{
                            target: form.target,
                            context: form.context,
                            fieldKey: field.key,
                          }}
                        />
                      ) : (
                        creationValue(field, value, labels)
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
    </div>
  );
}
