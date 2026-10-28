import type { CSSProperties } from "react";

export function PercentageInput({
  label,
  labelledBy,
  value,
  required,
  disabled,
  placeholder = "未设置",
  onChange,
}: {
  label: string;
  labelledBy: string;
  value: string;
  required: boolean;
  disabled: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const empty = !value.trim();
  const numeric = Number(value);
  const position = Number.isFinite(numeric)
    ? Math.min(100, Math.max(0, numeric))
    : 0;
  return (
    <div className="workflow-percentage">
      <input
        className="workflow-percentage-slider"
        style={{ "--percentage": `${position}%` } as CSSProperties}
        type="range"
        aria-label={`${label}拖动条`}
        aria-valuetext={empty ? "未设置" : `${value}%`}
        min={0}
        max={100}
        // Preserve fractional existing values until the user moves the slider.
        step={Number.isInteger(position) ? 1 : "any"}
        value={position}
        disabled={disabled}
        onPointerDown={() => {
          if (empty) onChange("0");
        }}
        onKeyDown={(e) => {
          const increments: Record<string, number> = {
            ArrowLeft: -1,
            ArrowDown: -1,
            ArrowRight: 1,
            ArrowUp: 1,
            PageDown: -10,
            PageUp: 10,
          };
          if (e.key === "Home" || e.key === "End" || e.key in increments) {
            e.preventDefault();
            const next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? 100
                  : Math.min(100, Math.max(0, position + increments[e.key]));
            onChange(String(Number(next.toFixed(10))));
          }
        }}
        onChange={(e) => onChange(String(Math.round(Number(e.target.value))))}
      />
      <span className="workflow-percentage-value">
        <input
          type="number"
          aria-labelledby={labelledBy}
          min={0}
          max={100}
          step="any"
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span aria-hidden="true">%</span>
      </span>
    </div>
  );
}
