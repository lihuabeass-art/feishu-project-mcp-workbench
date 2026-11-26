import { expect, it } from "vitest";
import type { ScheduleHistory, ScheduleRecord } from "./scheduleApi";
import { patchScheduleData } from "./scheduleReadPatch";

const record = (id: string): ScheduleRecord => ({
  id, identity: { connection: "c", project: "p", type: "story", item: id, node: "n", scope: "node" },
  title: id, nodeName: "开发", ownerIds: ["owner"], sourceIds: [], projectName: "空间", typeName: "需求",
  dates: { start: "2026-11-26", end: "2026-11-26" }, mine: false,
});

it("重复与重排结果复用原行，真实改期、空值、新增和移除只更新受影响的行", () => {
  const [a, b, c, d] = ["a", "b", "c", "d"].map(record);
  const people = [{ id: "p", name: "测试人员", avatar: "a.png" }];
  const before: ScheduleHistory = { connection: "c", complete: true, people, targets: [a, b, c] };
  const unchanged = patchScheduleData(before, { ...before, targets: [{ ...b }, { ...a, fetchedAt: "新抓取时间" }, { ...c }] });
  expect(unchanged.targets).toBe(before.targets);
  expect(unchanged.people).toBe(people);
  const cleared = { ...b, dates: { start: "", end: "" } };
  const refreshed = patchScheduleData(before, { ...before, targets: [{ ...a }, cleared, d] });
  expect(refreshed.targets).toEqual([a, cleared, d]);
  expect(refreshed.targets[0]).toBe(a);
  const partial = patchScheduleData(before, { ...before, complete: false, targets: [cleared] }, true);
  expect(partial.targets).toEqual([a, cleared, c]);
});
