import {
  creationEmpty,
  creationInitial,
  creationTargetKey,
  type CreationField,
  type CreationForm,
} from "./creation";

export type LocalCreationDefaults = Record<
  string,
  { kind: string; multiple: boolean; value: unknown }
>;

const defaultsKey = (form: CreationForm) =>
  `fstodo.creation-defaults.v1:${form.context}:${creationTargetKey(form.target)}`;

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
): unknown {
  if (!canSetCreationDefault(field)) return creationInitial(field);
  const saved = Object.hasOwn(defaults, field.key)
    ? defaults[field.key]
    : undefined;
  if (!saved) return creationInitial(field);
  if (validLocalCreationDefault(field, saved))
    return structuredClone(saved.value);
  return field.multiple ? [] : "";
}
