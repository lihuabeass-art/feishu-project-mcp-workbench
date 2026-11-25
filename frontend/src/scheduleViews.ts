export type ScheduleViewSettings = {
  start: string;
  days: number;
  perspective: "mine" | "people";
  project: string;
  relatedProject: string;
  people: string[];
  editableOnly: boolean;
};
export type SavedScheduleView = {
  id: string;
  name: string;
  dateMode: "weekly" | "fixed";
  settings: ScheduleViewSettings;
};
export type ScheduleViews = { active: string; views: SavedScheduleView[] };

const DAY = 86_400_000;
export const MAX_VIEW_DAYS = 31;

export function validViewDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01" || value > "9999-12-31") return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function shiftViewDate(value: string, days: number) {
  const time = Date.parse(`${value}T00:00:00Z`) + days * DAY;
  if (!Number.isFinite(time)) return "";
  const result = new Date(time).toISOString().slice(0, 10);
  return validViewDate(result) ? result : "";
}

export function fitScheduleView(settings: ScheduleViewSettings, offset = 0): ScheduleViewSettings {
  const first = Date.parse("0001-01-01T00:00:00Z");
  const lastStart = Date.parse("9999-12-31T00:00:00Z") - (settings.days - 1) * DAY;
  const time = Date.parse(`${settings.start}T00:00:00Z`) + offset * DAY;
  return { ...settings, start: new Date(Math.min(lastStart, Math.max(first, time))).toISOString().slice(0, 10) };
}

export function viewRangeDays(start: string, end: string) {
  return validViewDate(start) && validViewDate(end)
    ? (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY + 1
    : 0;
}

export function viewWeekday(start: string) {
  return (new Date(`${start}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function resolveScheduleView(view: SavedScheduleView, today: string): ScheduleViewSettings {
  const start = view.dateMode === "fixed" ? view.settings.start
    : shiftViewDate(today, viewWeekday(view.settings.start) - viewWeekday(today));
  return { ...view.settings, people: [...view.settings.people], start };
}

export function scheduleViewMatches(view: SavedScheduleView, current: ScheduleViewSettings) {
  const saved = view.settings;
  return (view.dateMode === "fixed" ? current.start === saved.start : viewWeekday(current.start) === viewWeekday(saved.start)) &&
    current.days === saved.days && current.perspective === saved.perspective &&
    current.project === saved.project && current.relatedProject === saved.relatedProject &&
    current.editableOnly === saved.editableOnly &&
    JSON.stringify([...current.people].sort()) === JSON.stringify([...saved.people].sort());
}

// 按服务地址与真实账号隔离；凭证指纹、来源配置与软件版本均不参与身份。
export function scheduleViewsKey(endpoint: string | undefined, user: string | null | undefined) {
  if (!user) return null;
  let service = "feishu-project";
  if (endpoint) {
    try { const url = new URL(endpoint); service = `${url.origin}${url.pathname.replace(/\/+$/, "")}`; }
    catch { return null; }
  }
  return `fstodo.schedule-views.v1:${JSON.stringify([service, user])}`;
}

function validSavedView(value: unknown): value is SavedScheduleView {
  if (!value || typeof value !== "object") return false;
  const view = value as SavedScheduleView;
  const s = view.settings;
  return typeof view.id === "string" && !!view.id && typeof view.name === "string" &&
    !!view.name.trim() && view.name.length <= 40 && (view.dateMode === "weekly" || view.dateMode === "fixed") &&
    !!s && typeof s.start === "string" && validViewDate(s.start) &&
    Number.isInteger(s.days) && s.days >= 1 && s.days <= MAX_VIEW_DAYS &&
    validViewDate(shiftViewDate(s.start, s.days - 1)) &&
    (s.perspective === "mine" || s.perspective === "people") &&
    typeof s.project === "string" && typeof s.relatedProject === "string" &&
    typeof s.editableOnly === "boolean" && Array.isArray(s.people) && s.people.every((p) => typeof p === "string" && !!p);
}

export function loadScheduleViews(key: string | null): ScheduleViews {
  if (!key) return { active: "", views: [] };
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    const ids = new Set<string>();
    const views: SavedScheduleView[] = Array.isArray(value?.views) ? value.views.filter((view: unknown) => {
      if (!validSavedView(view) || ids.has(view.id)) return false;
      ids.add(view.id);
      return true;
    }).map((view: SavedScheduleView) => ({ ...view, settings: { ...view.settings, perspective: "people" as const, editableOnly: false } })) : [];
    return { active: views.some((view) => view.id === value.active) ? value.active : "", views };
  } catch { return { active: "", views: [] }; }
}

export function saveScheduleViews(key: string | null, value: ScheduleViews) {
  if (!key) throw new Error("确认当前账号后才能保存视图");
  localStorage.setItem(key, JSON.stringify(value));
}
