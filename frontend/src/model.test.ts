import { describe, expect, it } from "vitest";
import {
  filterItems,
  moveTypeKey,
  orderWorkItems,
  typeColor,
  workflowFacets,
} from "./model";
import type { CachedItem } from "./types";

function item(id: string, node: string | null, state: string | null): CachedItem {
  return {
    id: { project_key: "space-a", work_item_type_key: "story", work_item_id: id },
    project_name: "空间甲",
    name: id,
    flow: {
      kind: "both", node_name: node, node_state_key: null,
      start_state_key_name: state, end_state_key_name: null,
    },
    schedule: { start_raw: null, end_raw: null },
    raw_json: "{}", identity_missing_flags: [],
    first_seen_at_ms: 1, last_seen_at_ms: 1, seen_count: 1,
  };
}

const rows = [
  item("合入任务甲", "后端代码合入", "处理中"),
  item("合入任务乙", "后端代码合入", "已解决"),
  item("设计任务", "后端方案设计", "处理中"),
];

describe("工作清单排序", () => {
  it("未完成和未知事项优先，组内使用飞书更新时间而不是创建或同步时间", () => {
    const oldButUpdated = { ...item("旧需求最近更新", null, null), is_completed: false,
      created_at_ms: 1, updated_at_ms: 300, first_seen_at_ms: 1 };
    const newButQuiet = { ...item("新需求较早更新", null, null), is_completed: false,
      created_at_ms: 200, updated_at_ms: 200, first_seen_at_ms: 9000 };
    const unknown = { ...item("未提供完成标记", null, null), updated_at_ms: 250 };
    const completed = { ...item("已完成但刚刚更新", null, null), is_completed: true,
      updated_at_ms: 9999 };
    const input = [completed, newButQuiet, unknown, oldButUpdated];
    expect(orderWorkItems(input)).toEqual([oldButUpdated, unknown, newButQuiet, completed]);
    expect(input[0]).toBe(completed);
  });

  it("缺失或非法更新时间排在同组末尾，时间相同按复合身份稳定排序", () => {
    const missing = { ...item("c", null, null), first_seen_at_ms: 9999 };
    const invalid = { ...item("d", null, null), updated_at_ms: NaN };
    const a = { ...item("a", null, null), updated_at_ms: 100 };
    const b = { ...item("b", null, null), updated_at_ms: 100 };
    const done = { ...item("完成时间缺失", null, null), is_completed: true };
    expect(orderWorkItems([done, invalid, b, missing, a])).toEqual([a, b, missing, invalid, done]);
    expect(orderWorkItems([a, missing, done, b, invalid])).toEqual([a, b, missing, invalid, done]);
  });
});

describe("节点和状态的动态筛选候选", () => {
  it("同一筛选内多值取并集，不同筛选取交集，空数组不限制", () => {
    const other = { ...item("其他空间缺陷", "测试", "处理中"),
      id: { project_key: "space-b", work_item_type_key: "issue", work_item_id: "4" },
      flow: { ...rows[0].flow, kind: "node" as const, node_name: "测试" } };
    const data = [...rows, other];
    expect(filterItems(data, "", ["story", "issue"], ["space-a", "space-b"], ["both", "node"],
      ["后端代码合入", "测试"], ["处理中", "已解决"])).toEqual([rows[0], rows[1], other]);
    expect(filterItems(data, "", [], [], [], [], [])).toEqual(data);
    expect(filterItems(data, "任务", [], [], [], ["后端方案设计", "测试"], ["处理中"]))
      .toEqual([rows[2]]);
  });

  it("多选保留每个零结果条件，也保留同一筛选中的候选与准确计数", () => {
    const result = workflowFacets(rows, "", [], [], [], ["后端代码合入", "不存在的节点"], ["已解决", "不存在的状态"]);
    expect(result.node.options).toContainEqual({ value: "后端代码合入", label: "后端代码合入（1）", count: 1 });
    expect(result.node.options).toContainEqual({ value: "不存在的节点", label: "不存在的节点（0）", count: 0 });
    expect(result.state.options).toContainEqual({ value: "不存在的状态", label: "不存在的状态（0）", count: 0 });
    expect(result.state.options).toContainEqual({ value: "处理中", label: "处理中（1）", count: 1 });
  });

  it("按搜索、空间、事项类型和流程类型缩小候选，移除没有匹配事项的节点", () => {
    const unrelated = item("外围任务", "其他节点", "处理中");
    unrelated.id.project_key = "space-b";
    const differentType = item("合入任务丙", "另一类型节点", "处理中");
    differentType.id.work_item_type_key = "issue";
    const differentFlow = item("合入任务丁", "另一流程节点", "处理中");
    differentFlow.flow.kind = "node";
    const result = workflowFacets(
      [...rows, unrelated, differentType, differentFlow],
      "合入", "story", "space-a", "both", "", "",
    );
    expect(result.node.options.map(({ value, count }) => [value, count]))
      .toEqual([["后端代码合入", 2]]);
    expect(result.node.visible).toBe(false);
  });

  it("选中某节点后保留同一筛选中的其他可选节点及准确数量", () => {
    const result = workflowFacets(rows, "", "", "", "", "后端代码合入", "");
    expect(result.node.options).toContainEqual({
      value: "后端方案设计", label: "后端方案设计（1）", count: 1,
    });
    expect(result.node.options).toContainEqual({
      value: "后端代码合入", label: "后端代码合入（2）", count: 2,
    });
    expect(filterItems(rows, "", "", "", "", "后端代码合入", "")).toHaveLength(2);
  });

  it("候选应用其他字段的筛选条件，并对节点和状态使用相同规则", () => {
    const byState = workflowFacets(rows, "", "", "", "", "", "已解决");
    expect(byState.node.options.map(({ value }) => value)).toEqual(["后端代码合入"]);
    expect(byState.node.visible).toBe(false);
    const byNode = workflowFacets(rows, "", "", "", "", "后端方案设计", "");
    expect(byNode.state.options.map(({ value }) => value)).toEqual(["处理中"]);
    expect(byNode.state.visible).toBe(false);
  });

  it("没有候选时隐藏，单个值覆盖全部事项时隐藏", () => {
    for (const data of [[], [item("无字段", null, null)], [rows[0]]]) {
      const result = workflowFacets(data, "", "", "", "", "", "");
      expect(result.node.visible).toBe(false);
      expect(result.state.visible).toBe(false);
    }
  });

  it("只有一个值但能排除未提供字段的事项时仍显示", () => {
    const result = workflowFacets(
      [rows[0], item("无字段", null, null), item("空白字段", "  ", "  ")],
      "", "", "", "", "", "",
    );
    expect(result.node.visible).toBe(true);
    expect(result.state.visible).toBe(true);
    expect(result.node.options).toHaveLength(1);
  });

  it("已选条件变成零结果时保留可取消的零计数选项，不移除选择", () => {
    const result = workflowFacets(rows, "设计", "", "", "", "后端代码合入", "已解决");
    expect(result.node.visible).toBe(true);
    expect(result.node.options).toContainEqual({
      value: "后端代码合入", label: "后端代码合入（0）", count: 0,
    });
    expect(result.state.visible).toBe(true);
    expect(result.state.options).toContainEqual({
      value: "已解决", label: "已解决（0）", count: 0,
    });
    expect(filterItems(rows, "设计", "", "", "", "后端代码合入", "已解决")).toEqual([]);
  });
});

describe("类型顺序与颜色", () => {
  it("拖到目标前后插入，位置未变化时不触发保存", () => {
    const keys = ["story", "issue", "task"];
    expect(moveTypeKey(keys, "task", "story", false)).toEqual(["task", "story", "issue"]);
    expect(moveTypeKey(keys, "story", "task", true)).toEqual(["issue", "task", "story"]);
    expect(moveTypeKey(keys, "story", "issue", false)).toBeNull();
    expect(moveTypeKey(keys, "story", "story", true)).toBeNull();
    expect(moveTypeKey(keys, "unknown", "story", false)).toBeNull();
  });

  it("颜色由类型标识决定，不随顺序变化，也不限于内置类型", () => {
    const custom = "69183a7a26f4d15e79765b76";
    expect(typeColor("story")).toBe(typeColor("story"));
    expect(typeColor("story")).not.toBe(typeColor("issue"));
    expect(typeColor(custom)).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(["story", "issue", "task", "sprint", "version", custom].map(typeColor)).size).toBeGreaterThan(3);
  });
});
