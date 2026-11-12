import { describe, expect, it } from "vitest";
import { cancelSchedule, editSchedule, resizeSchedule, scheduleChanged, scheduleValidation, settleSchedule, shiftSchedule, validSchedule, type ScheduleTarget } from "./scheduleSession";

const target = (): ScheduleTarget => ({ id: "connection/space/type/item/node/owner", nodeId: "node", identity: { connection: "connection", project: "space", type: "type", item: "item", node: "node", scope: "personal", owner: "owner" }, baseline: { start: "2026-11-13", end: "2026-11-16" }, dates: { start: "2026-11-13", end: "2026-11-16" }, cancel: false });

describe("事项安排会话", () => {
  it("按自然日移动并保持抓取偏移，包含周末及跨年", () => {
    expect(shiftSchedule(target().dates, "2026-11-15", "2026-11-16")).toEqual({ start: "2026-11-14", end: "2026-11-17" });
    expect(shiftSchedule({ start: "2026-12-31", end: "2027-01-02" }, "2027-01-01", "2027-01-03")).toEqual({ start: "2027-01-02", end: "2027-01-04" });
  });
  it("拉伸不会倒置，单日有效，空端点及错误日期不能提交", () => {
    expect(resizeSchedule(target().dates, "start", "2026-11-20")).toEqual({ start: "2026-11-16", end: "2026-11-16" });
    expect(resizeSchedule(target().dates, "end", "2026-11-01")).toEqual({ start: "2026-11-13", end: "2026-11-13" });
    expect(validSchedule({ start: "2024-02-29", end: "2024-02-29" })).toBe(true);
    expect(validSchedule({ start: "2026-02-29", end: "2026-03-01" })).toBe(false);
    expect(scheduleValidation(editSchedule(target(), { start: "", end: "2026-11-16" }))).toContain("有效");
  });
  it("取消意图不能发送，恢复原值后不再有变化", () => {
    const cancelled = cancelSchedule(target());
    expect(scheduleValidation(cancelled)).toContain("尚未验证取消日期");
    expect(scheduleChanged(editSchedule(cancelled, target().baseline))).toBe(false);
  });
  it("成功只推进冻结值，不确定结果禁止编辑和解除", () => {
    const edited = editSchedule(target(), { start: "2026-11-14", end: "2026-11-17" });
    const submitted = { ...edited.dates };
    const accepted = settleSchedule(edited, submitted, "accepted");
    expect(scheduleChanged(accepted)).toBe(false);
    const uncertain = settleSchedule(edited, submitted, "uncertain");
    expect(editSchedule(uncertain, target().baseline)).toBe(uncertain);
    expect(cancelSchedule(uncertain)).toBe(uncertain);
    expect(settleSchedule(uncertain, submitted, "accepted")).toBe(uncertain);
    expect(scheduleValidation(uncertain)).toContain("无法确认");
  });
  it("只读目标不能通过日期或取消入口修改", () => {
    const readonly = { ...target(), readOnlyReason: "当前连接尚未验证此状态的排期写入" };
    expect(editSchedule(readonly, { start: "2026-11-14", end: "2026-11-17" })).toBe(readonly);
    expect(cancelSchedule(readonly)).toBe(readonly);
  });
  it("不接受缺失的目标身份或超出四位年份的移动", () => {
    const changed = editSchedule(target(), { start: "2026-11-14", end: "2026-11-17" });
    expect(scheduleValidation({ ...changed, nodeId: " " })).toContain("身份不完整");
    expect(scheduleValidation({ ...changed, id: "" })).toContain("身份不完整");
    expect(scheduleValidation({ ...changed, identity: { ...changed.identity, project: "" } })).toContain("身份不完整");
    expect(scheduleValidation({ ...changed, identity: { ...changed.identity, owner: "" } })).toContain("身份不完整");
    expect(validSchedule({ start: "0000-01-01", end: "0000-01-01" })).toBe(false);
    expect(shiftSchedule({ start: "9999-12-31", end: "9999-12-31" }, "9999-12-31", "9999-12-30")).toEqual({ start: "9999-12-30", end: "9999-12-30" });
    expect(shiftSchedule({ start: "9999-12-30", end: "9999-12-31" }, "9999-12-30", "9999-12-31")).toBeNull();
  });
  it("编辑失败或未发送目标时保留上次提交记录", () => {
    const edited = editSchedule(target(), { start: "2026-11-14", end: "2026-11-17" });
    for (const result of ["failed", "unsent"] as const) {
      const settled = settleSchedule(edited, edited.dates, result);
      const revised = editSchedule(settled, { start: "2026-11-15", end: "2026-11-18" });
      expect(revised.result).toBe(result);
      expect(revised.submitted).toEqual(edited.dates);
    }
  });
  it("保留单端基线并校验修改，成功回执只推进冻结的提交值", () => {
    const partial = { ...target(), baseline: { start: "2026-11-13", end: "" }, dates: { start: "2026-11-13", end: "" } };
    expect(scheduleChanged(partial)).toBe(false);
    const incompleteEdit = editSchedule(partial, { start: "2026-11-14", end: "" });
    expect(scheduleValidation(incompleteEdit)).toContain("有效");
    expect(incompleteEdit.baseline).toEqual({ start: "2026-11-13", end: "" });
    const submitted = { start: "2026-11-14", end: "2026-11-17" };
    const current = editSchedule(partial, { start: "2026-11-15", end: "2026-11-18" });
    const settled = settleSchedule(current, submitted, "accepted");
    expect(settled.baseline).toEqual(submitted);
    expect(scheduleChanged(settled)).toBe(true);
  });
});
