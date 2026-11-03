import type { CSSProperties } from "react";
import { Star } from "lucide-react";
import { Select } from "./Select";
import {
  matchesLocalCreationDefault,
  validLocalCreationDefault,
  type LocalCreationDefaults,
} from "./CreationSettings";
import type { CreationField, CreationOption } from "./creation";
import "./CreationSelect.css";

export type CreationSelectProps = {
  field: CreationField;
  value: unknown;
  onChange: (value: string | string[]) => void;
  savedDefault?: LocalCreationDefaults[string];
  onToggleDefault?: () => void;
  disabled?: boolean;
};

const colors = [
  "#3370ff",
  "#14a68c",
  "#7f62d1",
  "#d36b32",
  "#bf5b8f",
  "#3796b5",
  "#9a7b24",
  "#5c8c45",
];
const namedColors: Record<string, string> = {
  blue: "#3370ff",
  green: "#34a870",
  teal: "#14a68c",
  cyan: "#3796b5",
  purple: "#7f62d1",
  violet: "#7f62d1",
  orange: "#d36b32",
  red: "#d95154",
  pink: "#bf5b8f",
  yellow: "#b08c27",
  gray: "#7d8795",
  grey: "#7d8795",
};

function optionColor(option: CreationOption): string {
  const supplied = option.color?.trim();
  if (supplied) {
    if (/^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i.test(supplied))
      return supplied;
    if (namedColors[supplied.toLowerCase()])
      return namedColors[supplied.toLowerCase()];
    if (typeof CSS !== "undefined" && CSS.supports?.("color", supplied))
      return supplied;
  }
  let hash = 2166136261;
  for (const character of option.value)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return colors[hash % colors.length];
}

function Chip({
  option,
  hidden = false,
}: {
  option: CreationOption;
  hidden?: boolean;
}) {
  return (
    <span
      className="creation-option-chip"
      style={{ "--creation-chip-color": optionColor(option) } as CSSProperties}
      title={option.label}
      aria-hidden={hidden || undefined}
    >
      {option.label}
    </span>
  );
}

export function CreationSelect({
  field,
  value,
  onChange,
  savedDefault,
  onToggleDefault,
  disabled = false,
}: CreationSelectProps) {
  const selection = field.multiple
    ? Array.isArray(value)
      ? value.map(String).filter(Boolean)
      : []
    : String(value ?? "");
  const values = Array.isArray(selection)
    ? selection
    : selection
      ? [selection]
      : [];
  const selected = values.map(
    (entry) =>
      field.options.find((option) => option.value === entry) || {
        value: entry,
        label: entry,
      },
  );
  const currentDefault = matchesLocalCreationDefault(
    field,
    value,
    savedDefault,
  );
  const canSaveDefault = validLocalCreationDefault(field, {
    kind: field.kind,
    multiple: field.multiple,
    value,
  });
  const adjacent = (
    <span className="creation-select-content">
      {selected.length ? (
        selected.map((option) => (
          <Chip key={option.value} option={option} hidden />
        ))
      ) : (
        <span className="creation-select-placeholder" aria-hidden="true">
          待填
        </span>
      )}
      {onToggleDefault && <button
        type="button"
        className={`creation-select-star${currentDefault ? " is-default" : ""}`}
        aria-label={
          currentDefault
            ? `清除${field.label}的本地默认值`
            : `将${field.label}设为本地默认值`
        }
        aria-pressed={currentDefault}
        title={
          !canSaveDefault
            ? "选择后可设为默认值"
            : currentDefault
              ? "取消本地默认值"
              : "设为本地默认值"
        }
        disabled={disabled || !canSaveDefault}
        onClick={(event) => {
          event.stopPropagation();
          onToggleDefault();
        }}
      >
        <Star
          size={15}
          strokeWidth={1.7}
          fill={currentDefault ? "currentColor" : "none"}
          aria-hidden="true"
        />
      </button>}
    </span>
  );
  const shared = {
    id: `create-${field.key}`,
    ariaLabel: field.label,
    required: field.required,
    disabled,
    className: "creation-select-control",
    menuClassName: "creation-select-menu",
    options: [{ value: "", label: "待填" }, ...field.options],
    adjacent,
    renderOption: (option: CreationOption) =>
      option.value ? (
        <Chip option={option} />
      ) : (
        <span className="creation-select-placeholder">{option.label}</span>
      ),
  };
  return field.multiple ? (
    <Select
      {...shared}
      multiple
      value={selection as string[]}
      onChange={onChange}
    />
  ) : (
    <Select {...shared} value={selection as string} onChange={onChange} />
  );
}
