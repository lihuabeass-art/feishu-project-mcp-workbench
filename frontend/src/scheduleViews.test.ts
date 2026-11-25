// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import {
  fitScheduleView, loadScheduleViews, resolveScheduleView, saveScheduleViews, scheduleViewMatches, scheduleViewsKey,
  validViewDate, viewRangeDays, type SavedScheduleView,
} from "./scheduleViews";

const view = (): SavedScheduleView => ({ id: "tuesday", name: "周二例会", dateMode: "weekly", settings: {
  start: "2026-11-24", days: 8, perspective: "people", project: "space-key", relatedProject: "project-key",
  people: ["me", "peer"], editableOnly: false,
} });
beforeEach(() => localStorage.clear());

it("首尾两天都计入范围，支持跨月跨年、闰日和单日，拒绝无效日期", () => {
  expect(viewRangeDays("2026-11-24", "2026-12-01")).toBe(8);
  expect(viewRangeDays("2026-12-31", "2027-01-01")).toBe(2);
  expect(viewRangeDays("2028-02-28", "2028-03-01")).toBe(3);
  expect(viewRangeDays("2026-11-24", "2026-11-24")).toBe(1);
  expect(validViewDate("2026-02-29")).toBe(false);
  expect(validViewDate("2026-02-30")).toBe(false);
  expect(validViewDate("invalid")).toBe(false);
});

it("每周滚动恢复相同星期与天数，固定日期完整保留", () => {
  expect(resolveScheduleView(view(), "2027-01-06").start).toBe("2027-01-05");
  expect(resolveScheduleView(view(), "2027-01-04").start).toBe("2027-01-05");
  const fixed = { ...view(), dateMode: "fixed" as const };
  expect(resolveScheduleView(fixed, "2027-01-06").start).toBe("2026-11-24");
  expect(resolveScheduleView(fixed, "2027-01-06").days).toBe(8);
  expect(scheduleViewMatches(view(), { ...view().settings, start: "2027-01-05", people: ["peer", "me"] })).toBe(true);
  expect(scheduleViewMatches(fixed, { ...view().settings, start: "2027-01-05" })).toBe(false);
});

it("稳定服务与账号身份隔离，凭证参数变化不丢视图，跨版本恢复原偏好", () => {
  const key = scheduleViewsKey("https://mcp.example.com/service/?token=old", "me")!;
  expect(key).toBe(scheduleViewsKey("https://mcp.example.com/service?token=new", "me"));
  expect(scheduleViewsKey("https://mcp.example.com/service", "peer")).not.toBe(key);
  expect(scheduleViewsKey("https://other.example.com/service", "me")).not.toBe(key);
  expect(scheduleViewsKey(undefined, null)).toBeNull();
  saveScheduleViews(key, { active: "tuesday", views: [view()] });
  localStorage.setItem("fstodo.schedule-preferences.v0", "legacy-untouched");
  expect(loadScheduleViews(key)).toEqual({ active: "tuesday", views: [view()] });
  expect(localStorage.getItem("fstodo.schedule-preferences.v0")).toBe("legacy-untouched");
  expect(loadScheduleViews(scheduleViewsKey("https://mcp.example.com/service", "peer"))).toEqual({ active: "", views: [] });
});

it("逐项过滤损坏的保存视图，保留其他视图及筛选，不全量重置", () => {
  const key = scheduleViewsKey(undefined, "me")!;
  localStorage.setItem(key, JSON.stringify({ active: "bad", views: [view(), { ...view(), id: "bad", settings: { ...view().settings, days: 500 } }, view()] }));
  expect(loadScheduleViews(key)).toEqual({ active: "", views: [view()] });
  localStorage.setItem(key, "broken json");
  expect(loadScheduleViews(key)).toEqual({ active: "", views: [] });
});

it("切换跨度与翻周在合法日期边界内调整起点", () => {
  expect(fitScheduleView({ ...view().settings, start: "9999-12-31", days: 14 }).start).toBe("9999-12-18");
  expect(fitScheduleView({ ...view().settings, start: "0001-01-01" }, -7).start).toBe("0001-01-01");
});

it("兼容旧版视图，仅恢复为人员排期设置并忽略个人专用开关", () => {
  const key = scheduleViewsKey(undefined, "me")!;
  saveScheduleViews(key, { active: "tuesday", views: [{ ...view(), settings: { ...view().settings, perspective: "mine", editableOnly: true } }] });
  const stored = localStorage.getItem(key);
  expect(loadScheduleViews(key).views[0].settings).toEqual({ ...view().settings, perspective: "people", editableOnly: false });
  expect(localStorage.getItem(key)).toBe(stored);
});
