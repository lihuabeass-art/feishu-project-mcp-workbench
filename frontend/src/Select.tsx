import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectProps = {
  options: SelectOption[];
  ariaLabel: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
} & (
  | { multiple?: false; value: string; onChange: (value: string) => void }
  | { multiple: true; value: string[]; onChange: (value: string[]) => void }
);

type MenuPosition = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

export function Select(props: SelectProps) {
  const {
    value,
    options,
    multiple = false,
    ariaLabel,
    id,
    disabled = false,
    required = false,
    className = "",
  } = props;
  const generatedId = useId();
  const listboxId = `${generatedId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const isSelected = (option: SelectOption) => Array.isArray(value)
    ? option.value ? value.includes(option.value) : value.length === 0
    : option.value === value;
  const selectedIndex = options.findIndex(isSelected);
  const selected = options[selectedIndex];
  const selectedLabels = Array.isArray(value)
    ? value.map((entry) => options.find((option) => option.value === entry)?.label || entry)
    : [];
  const selectionLabel = selectedLabels.length > 1
    ? `${selectedLabels[0]} 等 ${selectedLabels.length} 项`
    : selectedLabels[0] || selected?.label || "请选择";

  const firstEnabled = () => options.findIndex((option) => !option.disabled);
  const lastEnabled = () => {
    for (let index = options.length - 1; index >= 0; index -= 1) {
      if (!options[index].disabled) return index;
    }
    return -1;
  };
  const initialActive = () =>
    selectedIndex >= 0 && !options[selectedIndex].disabled
      ? selectedIndex
      : firstEnabled();

  function updatePosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 10;
    const gap = 8;
    const estimatedHeight = Math.min(options.length * 42 + 12, 280);
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding - gap;
    const spaceAbove = rect.top - viewportPadding - gap;
    const placeAbove =
      spaceBelow < Math.min(estimatedHeight, 180) && spaceAbove > spaceBelow;
    const width = Math.min(
      Math.max(rect.width, 180),
      window.innerWidth - viewportPadding * 2,
    );
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      window.innerWidth - width - viewportPadding,
    );
    setMenuPosition({
      left,
      width,
      maxHeight: Math.max(96, placeAbove ? spaceAbove : spaceBelow),
      ...(placeAbove
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
    });
  }

  function show() {
    if (disabled || options.length === 0) return;
    setActiveIndex(initialActive());
    setOpen(true);
  }

  function hide() {
    setOpen(false);
    setMenuPosition(null);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    if (props.multiple) {
      props.onChange(!option.value ? [] : props.value.includes(option.value)
        ? props.value.filter((entry) => entry !== option.value)
        : [...props.value, option.value]);
      setActiveIndex(index);
    } else {
      props.onChange(option.value);
      hide();
    }
    triggerRef.current?.focus();
  }

  function moveActive(step: 1 | -1) {
    if (!options.length) return;
    let index = activeIndex >= 0 ? activeIndex : initialActive();
    for (let visited = 0; visited < options.length; visited += 1) {
      index = (index + step + options.length) % options.length;
      if (!options[index].disabled) {
        setActiveIndex(index);
        return;
      }
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) show();
      else moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) show();
      else if (activeIndex >= 0) choose(activeIndex);
      return;
    }
    if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(firstEnabled());
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(lastEnabled());
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      hide();
      return;
    }
    if (event.key === "Tab") hide();
  }

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, options.length]);

  useLayoutEffect(() => {
    // 取消已选的零计数候选后，该候选可能消失，键盘活动项须保持有效。
    if (open && (!options[activeIndex] || options[activeIndex].disabled)) {
      setActiveIndex(initialActive());
    }
  }, [open, options, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        hide();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document
      .getElementById(`${listboxId}-option-${activeIndex}`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, listboxId, open]);

  return (
    <span
      className={`select-control ${open ? "open" : ""} ${className}`.trim()}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="select-trigger"
        role="combobox"
        aria-label={ariaLabel}
        title={multiple && selectedLabels.length ? selectedLabels.join("、") : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={
          open && activeIndex >= 0
            ? `${listboxId}-option-${activeIndex}`
            : undefined
        }
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (open ? hide() : show())}
        onKeyDown={onKeyDown}
      >
        <span
          className={!selected || selected.disabled ? "placeholder" : undefined}
        >
          {selectionLabel}
        </span>
        <ChevronDown className="select-chevron" size={16} aria-hidden="true" />
      </button>
      {open &&
        menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            className="select-menu"
            role="listbox"
            aria-multiselectable={multiple || undefined}
            aria-label={ariaLabel}
            style={menuPosition as CSSProperties}
          >
            {options.map((option, index) => (
              <div
                id={`${listboxId}-option-${index}`}
                key={option.value}
                className={`select-option ${index === activeIndex ? "active" : ""} ${isSelected(option) ? "selected" : ""}`.trim()}
                role="option"
                aria-selected={isSelected(option)}
                aria-disabled={option.disabled || undefined}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {isSelected(option) && !option.disabled && (
                  <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}
