import { expect, it } from "vitest";
import { sortScheduleCurrentNodes } from "./scheduleNodeOrder";
import type { ScheduleCurrentNode } from "./scheduleHistory";
import type { ScheduleRecord } from "./scheduleApi";

const identity = { connection: "c", project: "p", type: "story", item: "i", node: "n", scope: "node" as const };
const node = (id: string, name: string): ScheduleCurrentNode => ({ id, name, owners: [], unknownOwner: false });
const nodes = [node("test", "测试用例设计"), node("backend", "后端代码研发"), node("frontend", "前端代码研发")];
const records = nodes.map((item): ScheduleRecord => ({
  id: item.id, identity: { ...identity, node: item.id }, nodeName: item.name, title: "事项",
  nodeOrder: { frontend: 4, backend: 5, test: 8 }[item.id], ownerIds: [], sourceIds: [],
  projectName: "空间", typeName: "需求", dates: { start: "", end: "" }, mine: false,
}));

it("详情与会话标签均按事项流程序号排列，不受输入顺序影响", () => {
  for (const input of [nodes, [...nodes].reverse(), [nodes[1], nodes[0], nodes[2]]]) {
    expect(sortScheduleCurrentNodes(input, records, identity).map((item) => item.id)).toEqual(["frontend", "backend", "test"]);
  }
  expect(nodes.map((item) => item.id)).toEqual(["test", "backend", "frontend"]);
});

it("其他连接、空间或事项的同名节点顺序不串入当前事项", () => {
  const templates = records.map((record) => ({ ...record, identity: { ...record.identity, item: "other-item" } }));
  const unrelated = records.map((record) => ({ ...record, nodeOrder: 20 - record.nodeOrder!, identity: { ...record.identity, project: "other-space" } }));
  const otherConnection = records.map((record) => ({ ...record, nodeOrder: 20 - record.nodeOrder!, identity: { ...record.identity, connection: "another" } }));
  const details = nodes.map((item) => ({ ...item, id: `detail-${item.id}` }));
  expect(sortScheduleCurrentNodes(details, [...templates, ...unrelated, ...otherConnection], identity).map((item) => item.name))
    .toEqual(["测试用例设计", "后端代码研发", "前端代码研发"]);
});

it("顺序缺失或相同使用固定名称和节点身份兜底，不沿用接口顺序", () => {
  const unknown = [node("node-10", "Beta"), node("node-2", "Beta"), node("alpha", "Alpha")];
  for (const input of [unknown, [...unknown].reverse()]) {
    expect(sortScheduleCurrentNodes(input, [], identity).map((item) => item.id)).toEqual(["alpha", "node-2", "node-10"]);
  }
});
