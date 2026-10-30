import { useEffect, useId, useRef, useState } from "react";
import {
  creationEmpty,
  creationInitial,
  creationTargetKey,
  type CreationField,
  type CreationForm,
} from "./creation";
import type { SaveFeedback } from "./SettingsSaveStatus";

export const creationPrefillKey = "fstodo.creation-prefill-local-defaults.v1";
export type LocalCreationDefaults = Record<
  string,
  { kind: string; multiple: boolean; value: unknown }
>;

const defaultsKey = (form: CreationForm) =>
  `fstodo.creation-defaults.v1:${form.context}:${creationTargetKey(form.target)}`;

export function loadCreationPrefill(): boolean {
  try {
    return localStorage.getItem(creationPrefillKey) !== "false";
  } catch {
    return true;
  }
}

export function loadLocalCreationDefaults(
  form: CreationForm,
): LocalCreationDefaults {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(defaultsKey(form)) || "{}",
    );
    if (!stored || typeof stored !== "object" || Array.isArray(stored))
      return {};
    return Object.fromEntries(
      Object.entries(stored).filter(
        ([, entry]) =>
          entry &&
          typeof entry === "object" &&
          !Array.isArray(entry) &&
          typeof entry.kind === "string" &&
          typeof entry.multiple === "boolean" &&
          Object.hasOwn(entry, "value"),
      ),
    );
  } catch {
    return {};
  }
}

export function saveLocalCreationDefaults(
  form: CreationForm,
  defaults: LocalCreationDefaults,
): void {
  localStorage.setItem(defaultsKey(form), JSON.stringify(defaults));
}

export const canSetCreationDefault = (field: CreationField): boolean =>
  field.kind === "select";

export function validLocalCreationDefault(
  field: CreationField,
  saved: LocalCreationDefaults[string] | undefined,
): boolean {
  if (
    !saved ||
    !canSetCreationDefault(field) ||
    saved.kind !== field.kind ||
    saved.multiple !== field.multiple ||
    creationEmpty(saved.value)
  )
    return false;
  const values = field.multiple ? saved.value : [saved.value];
  return (
    Array.isArray(values) &&
    values.length > 0 &&
    values.every(
      (value) =>
        typeof value === "string" &&
        field.options.some((option) => option.value === value),
    )
  );
}

export function matchesLocalCreationDefault(
  field: CreationField,
  value: unknown,
  saved: LocalCreationDefaults[string] | undefined,
): boolean {
  if (
    !validLocalCreationDefault(field, saved) ||
    !validLocalCreationDefault(field, {
      kind: field.kind,
      multiple: field.multiple,
      value,
    })
  )
    return false;
  if (!field.multiple) return saved!.value === value;
  const current = new Set(value as string[]);
  const previous = new Set(saved!.value as string[]);
  return (
    current.size === previous.size && [...current].every((v) => previous.has(v))
  );
}

export function localCreationInitial(
  field: CreationField,
  defaults: LocalCreationDefaults,
  enabled: boolean,
): unknown {
  if (!canSetCreationDefault(field)) return creationInitial(field);
  const saved = Object.hasOwn(defaults, field.key)
    ? defaults[field.key]
    : undefined;
  if (!enabled || !saved) return creationInitial(field);
  if (validLocalCreationDefault(field, saved))
    return structuredClone(saved.value);
  return field.multiple ? [] : "";
}

export function CreationSettings({
  disabled = false,
  onFeedback,
}: {
  disabled?: boolean;
  onFeedback?: (feedback: SaveFeedback | null) => void;
}) {
  const id = useId();
  const [enabled, setEnabled] = useState(loadCreationPrefill);
  const [error, setError] = useState("");
  const lastAttempt = useRef(enabled);

  useEffect(() => {
    function changed(event: StorageEvent) {
      if (event.key !== creationPrefillKey && event.key !== null) return;
      setEnabled(loadCreationPrefill());
      setError("");
    }
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  function change(next: boolean) {
    lastAttempt.current = next;
    onFeedback?.({ state: "saving" });
    try {
      localStorage.setItem(creationPrefillKey, String(next));
      setEnabled(next);
      setError("");
      onFeedback?.({ state: "saved" });
    } catch {
      const message = "本地默认值预填偏好未能保存，请重试。";
      setError(message);
      onFeedback?.({
        state: "failed",
        message,
        retry: () => change(lastAttempt.current),
      });
    }
  }

  return (
    <section className="link-settings" aria-label="新建表单偏好">
      <div className="section-heading">
        <div>
          <h2>新建表单</h2>
        </div>
      </div>
      <label className="desktop-setting-row">
        <span className="desktop-setting-copy">
          <span className="desktop-setting-title" id={`${id}-title`}>
            预填本地默认值
          </span>
          <span
            className="desktop-setting-description"
            id={`${id}-description`}
          >
            在新建表单的下拉框中，点击已选项旁的星标保存本地默认值。开启后自动预填，飞书已移除的选项不会继续使用；已编辑的草稿继续保留。
          </span>
        </span>
        <span className="settings-switch">
          <input
            type="checkbox"
            role="switch"
            aria-labelledby={`${id}-title`}
            aria-describedby={`${id}-description`}
            checked={enabled}
            disabled={disabled}
            onChange={(event) => change(event.target.checked)}
          />
          <span className="settings-switch-track" aria-hidden="true" />
        </span>
      </label>
      {!onFeedback && error && (
        <div>
          <p className="error-text" role="alert">
            {error}
          </p>
          <button
            className="secondary"
            disabled={disabled}
            onClick={() => change(lastAttempt.current)}
          >
            重试保存预填偏好
          </button>
        </div>
      )}
    </section>
  );
}
