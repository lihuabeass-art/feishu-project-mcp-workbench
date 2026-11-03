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
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useScrollIsolation } from "./useScrollIsolation";
import "./dateRangePicker.css";

type Endpoint = "start" | "end";
type Props = {
  start: string;
  end: string;
  startLabel: string;
  endLabel: string;
  startRequired?: boolean;
  endRequired?: boolean;
  disabled?: boolean;
  onChange: (start: string, end: string) => void;
};

function dateValue(date: Date) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) &&
    date.getFullYear() > 0 &&
    dateValue(date) === value
    ? date
    : null;
}

function beijingToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function firstOfMonth(value: string) {
  return `${value.slice(0, 7)}-01`;
}

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
const weekNames = ["日", "一", "二", "三", "四", "五", "六"];

export function DateRangePicker({
  start,
  end,
  startLabel,
  endLabel,
  startRequired = false,
  endRequired = false,
  disabled = false,
  onChange,
}: Props) {
  const id = useId();
  const popupId = `${id}-calendar`;
  const phaseId = `${id}-phase`;
  const titleId = `${id}-month`;
  const [today] = useState(beijingToday);
  const initial = parseDate(start) ? start : parseDate(end) ? end : today;
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Endpoint>("start");
  const [month, setMonth] = useState(() => firstOfMonth(initial));
  const [focusedDay, setFocusedDay] = useState(initial);
  const [preview, setPreview] = useState<string | null>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  const rangeRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const popupScrollRef = useScrollIsolation(popupRef);
  const focusRequest = useRef<string | null>(null);
  const validStart = !!parseDate(start);
  const validEnd = !!parseDate(end);
  const reversed = validStart && validEnd && end < start;
  const visible = open && !disabled;

  function show(endpoint: Endpoint, keyboard = false) {
    if (disabled) return;
    const value = endpoint === "start" ? start : end;
    const target = parseDate(value) ? value : validStart ? start : today;
    setPhase(endpoint);
    setPreview(null);
    setMonth(firstOfMonth(target));
    setFocusedDay(target);
    if (keyboard) focusRequest.current = target;
    setOpen(true);
  }

  function hide(restoreFocus = false) {
    setOpen(false);
    setPreview(null);
    focusRequest.current = null;
    if (restoreFocus) (phase === "start" ? startRef : endRef).current?.focus();
  }

  function updatePosition() {
    const rect = rangeRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (
      rect.bottom < 0 ||
      rect.top >= window.innerHeight ||
      rect.right < 0 ||
      rect.left >= window.innerWidth
    ) {
      hide();
      return;
    }
    const padding = 10;
    const gap = 6;
    const width = Math.min(312, Math.max(0, window.innerWidth - padding * 2));
    const below = Math.max(0, window.innerHeight - rect.bottom - padding - gap);
    const above = Math.max(0, rect.top - padding - gap);
    const height = popupRef.current?.scrollHeight || 360;
    const placeAbove = below < height && above > below;
    setPosition({
      width,
      left: Math.max(
        padding,
        Math.min(rect.left, window.innerWidth - width - padding),
      ),
      maxHeight: placeAbove ? above : below,
      ...(placeAbove
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
    });
  }

  useLayoutEffect(() => {
    if (visible) updatePosition();
  }, [visible, month, phase, start, end]);

  useLayoutEffect(() => {
    if (!visible || !focusRequest.current) return;
    popupRef.current
      ?.querySelector<HTMLButtonElement>(
        `[data-date="${focusRequest.current}"]`,
      )
      ?.focus();
    focusRequest.current = null;
  }, [visible, month, focusedDay]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    endRef.current?.setCustomValidity(
      reversed ? "结束日期不能早于开始日期" : "",
    );
  }, [reversed]);

  useEffect(() => {
    if (!visible) return;
    function outside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !rangeRef.current?.contains(event.target) &&
        !popupRef.current?.contains(event.target)
      )
        hide();
    }
    function scroll(event: Event) {
      if (
        event.target instanceof Node &&
        popupRef.current?.contains(event.target)
      )
        return;
      updatePosition();
    }
    window.addEventListener("pointerdown", outside);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", scroll, true);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [visible, phase]);

  function choose(value: string) {
    setPreview(null);
    if (phase === "start" || !validStart || value < start) {
      onChange(value, "");
      setPhase("end");
      setFocusedDay(value);
      return;
    }
    onChange(start, value);
    setOpen(false);
    endRef.current?.focus();
  }

  function moveMonth(step: number) {
    const date = parseDate(month)!;
    date.setMonth(date.getMonth() + step);
    if (date.getFullYear() < 1 || date.getFullYear() > 9999) return;
    const value = dateValue(date);
    setMonth(value);
    setFocusedDay(value);
    setPreview(null);
  }

  function inputKey(
    event: KeyboardEvent<HTMLInputElement>,
    endpoint: Endpoint,
  ) {
    if (event.key === "Escape" && visible) {
      event.preventDefault();
      event.stopPropagation();
      hide(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      show(endpoint, true);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (endpoint === "start" && validStart) {
        show("end", true);
      } else if (endpoint === "end" && validStart && validEnd && !reversed) {
        hide();
      } else show(endpoint, true);
    }
  }

  function dayKey(event: KeyboardEvent<HTMLButtonElement>, value: string) {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const date = parseDate(value)!;
    if (event.key in offsets) date.setDate(date.getDate() + offsets[event.key]);
    else if (event.key === "Home")
      date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    else if (event.key === "End")
      date.setDate(date.getDate() + 6 - ((date.getDay() + 6) % 7));
    else if (event.key === "PageUp" || event.key === "PageDown") {
      const day = date.getDate();
      date.setDate(1);
      date.setMonth(date.getMonth() + (event.key === "PageDown" ? 1 : -1));
      const last = new Date(date.getTime());
      last.setMonth(last.getMonth() + 1, 0);
      date.setDate(Math.min(day, last.getDate()));
    } else return;
    event.preventDefault();
    if (date.getFullYear() < 1 || date.getFullYear() > 9999) return;
    const next = dateValue(date);
    focusRequest.current = next;
    setFocusedDay(next);
    setMonth(firstOfMonth(next));
    setPreview(next);
  }

  const currentMonth = parseDate(month)!;
  const firstWeekday = (currentMonth.getDay() + 6) % 7;
  const lastDay = new Date(currentMonth.getTime());
  lastDay.setMonth(lastDay.getMonth() + 1, 0);
  const last = lastDay.getDate();
  const monthTitle = `${currentMonth.getFullYear()}年${currentMonth.getMonth() + 1}月`;
  const rangeEnd =
    phase === "end" && preview && preview >= start ? preview : end;
  const input = (endpoint: Endpoint) => {
    const isStart = endpoint === "start";
    const value = isStart ? start : end;
    return (
      <label
        className={`date-range-endpoint${visible && phase === endpoint ? " is-active" : ""}`}
      >
        <span>{isStart ? "开始日期" : "结束日期"}</span>
        <input
          ref={isStart ? startRef : endRef}
          type="date"
          aria-label={isStart ? startLabel : endLabel}
          aria-haspopup="dialog"
          aria-expanded={visible && phase === endpoint}
          aria-controls={visible ? popupId : undefined}
          aria-invalid={(!isStart && reversed) || undefined}
          required={isStart ? startRequired : endRequired}
          disabled={disabled}
          min={!isStart && validStart ? start : undefined}
          value={value}
          onClick={() => show(endpoint)}
          onKeyDown={(event) => inputKey(event, endpoint)}
          onChange={(event) => {
            const next = event.target.value;
            onChange(isStart ? next : start, isStart ? end : next);
            if (isStart && parseDate(next)) {
              setPhase("end");
              setMonth(firstOfMonth(next));
              setFocusedDay(next);
              setPreview(null);
              setOpen(true);
            } else if (
              !isStart &&
              parseDate(next) &&
              validStart &&
              next >= start
            )
              hide();
          }}
        />
      </label>
    );
  };

  return (
    <div className="date-range-picker">
      <div
        className={`date-range-inputs${disabled ? " is-disabled" : ""}${reversed ? " is-invalid" : ""}`}
        ref={rangeRef}
      >
        {input("start")}
        <ArrowRight
          className="date-range-separator"
          size={13}
          aria-hidden="true"
        />
        {input("end")}
        <button
          type="button"
          className="date-range-calendar-trigger"
          aria-label="选择日期范围"
          aria-haspopup="dialog"
          aria-expanded={visible}
          aria-controls={visible ? popupId : undefined}
          disabled={disabled}
          onClick={() => (visible ? hide() : show("start", true))}
        >
          <CalendarDays size={15} aria-hidden="true" />
        </button>
      </div>
      {reversed && (
        <small className="date-range-error" role="alert">
          结束日期不能早于开始日期
        </small>
      )}
      {visible &&
        createPortal(
          <div
            ref={popupScrollRef}
            id={popupId}
            className="date-range-calendar scroll-isolation-boundary"
            role="dialog"
            aria-labelledby={titleId}
            aria-describedby={phaseId}
            style={position}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                hide(true);
              }
            }}
          >
            <div
              className="date-range-instruction"
              id={phaseId}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <strong>
                {phase === "start" || !validStart
                  ? "请选择开始日期"
                  : "请选择结束日期"}
              </strong>
              <span>
                {phase === "start" || !validStart
                  ? "选好后自动接着选结束"
                  : "点更早日期可重设开始"}
              </span>
            </div>
            <div className="date-range-month-nav">
              <button
                type="button"
                aria-label="上个月"
                disabled={month === "0001-01-01"}
                onClick={() => moveMonth(-1)}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <strong id={titleId}>{monthTitle}</strong>
              <button
                type="button"
                aria-label="下个月"
                disabled={month === "9999-12-01"}
                onClick={() => moveMonth(1)}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="date-range-weekdays" aria-hidden="true">
              {weekdays.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div
              className="date-range-days"
              onPointerLeave={() => setPreview(null)}
            >
              {Array.from({ length: 42 }, (_, cell) => {
                const day = cell - firstWeekday + 1;
                if (day < 1 || day > last)
                  return (
                    <span
                      className="date-range-blank"
                      key={`blank-${cell}`}
                      aria-hidden="true"
                    />
                  );
                const date = new Date(currentMonth.getTime());
                date.setDate(day);
                const value = dateValue(date);
                const selectedStart = value === start;
                const selectedEnd = value === end;
                const inRange =
                  validStart &&
                  !!parseDate(rangeEnd) &&
                  value >= start &&
                  value <= rangeEnd;
                return (
                  <button
                    key={value}
                    type="button"
                    className="date-range-day"
                    data-date={value}
                    data-selected={selectedStart || selectedEnd}
                    data-in-range={inRange}
                    data-edge={
                      selectedStart && selectedEnd
                        ? "both"
                        : selectedStart
                          ? "start"
                          : selectedEnd
                            ? "end"
                            : undefined
                    }
                    data-preview={
                      (phase === "end" &&
                        value === preview &&
                        value >= start) ||
                      undefined
                    }
                    aria-label={`${currentMonth.getFullYear()}年${currentMonth.getMonth() + 1}月${day}日，星期${weekNames[date.getDay()]}${selectedStart ? "，开始日期" : ""}${selectedEnd ? "，结束日期" : ""}`}
                    aria-pressed={selectedStart || selectedEnd}
                    aria-current={value === today ? "date" : undefined}
                    tabIndex={value === focusedDay ? 0 : -1}
                    onFocus={() => setFocusedDay(value)}
                    onPointerEnter={() => setPreview(value)}
                    onClick={() => choose(value)}
                    onKeyDown={(event) => dayKey(event, value)}
                  >
                    <span>{day}</span>
                  </button>
                );
              })}
            </div>
            <div className="date-range-calendar-footer">
              <span>
                {validStart
                  ? `${start.replaceAll("-", "/")} — ${validEnd ? end.replaceAll("-", "/") : "待选结束"}`
                  : "北京时间（UTC+8）"}
              </span>
              <button type="button" onClick={() => hide(true)}>
                收起
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
