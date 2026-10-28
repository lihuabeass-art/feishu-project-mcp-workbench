export function SteppedNumberInput({
  label,
  labelledBy,
  value,
  step,
  min,
  max,
  required,
  disabled,
  placeholder,
  onChange,
}: {
  label: string;
  labelledBy: string;
  value: string;
  step: number;
  min?: number;
  max?: number;
  required: boolean;
  disabled: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  function adjust(direction: number) {
    const current = Number(value || 0);
    const next = Math.min(
      max ?? Infinity,
      Math.max(min ?? -Infinity, current + direction * step),
    );
    onChange(String(Number(next.toFixed(10))));
  }
  return (
    <div className="workflow-stepped-number">
      <input
        type="number"
        aria-labelledby={labelledBy}
        min={min}
        max={max}
        step="any"
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            adjust(e.key === "ArrowUp" ? 1 : -1);
          }
        }}
      />
      <span className="workflow-number-buttons">
        <button
          type="button"
          aria-label={`${label}减少 ${step}`}
          disabled={disabled || (min !== undefined && Number(value) <= min)}
          onClick={() => adjust(-1)}
        >
          −
        </button>
        <button
          type="button"
          aria-label={`${label}增加 ${step}`}
          disabled={disabled || (max !== undefined && Number(value) >= max)}
          onClick={() => adjust(1)}
        >
          +
        </button>
      </span>
    </div>
  );
}
