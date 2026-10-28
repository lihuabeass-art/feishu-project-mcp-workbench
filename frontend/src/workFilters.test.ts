import { describe, expect, it } from "vitest";
import { missingProject, relatedProjectKey } from "./model";
import { changeWorkFilter, emptyWorkFilters, workFilterOptions, type WorkFilters } from "./workFilters";
import type { CachedItem, FlowKind } from "./types";

function item(id: string, space: string, kind: FlowKind, project: string | null, node: string | null, state: string | null): CachedItem {
  return {
    id: { project_key: space, work_item_type_key: space === "b" ? "issue" : "story", work_item_id: id },
    name: `工作${id}`, project_name: `空间${space}`,
    related_projects: project ? [{ id: project, name: `项目${project}`, field_key: "project" }] : [],
    flow: { kind, node_name: node, start_state_key_name: state, node_state_key: null, end_state_key_name: null },
    schedule: { start_raw: null, end_raw: null }, raw_json: "{}", identity_missing_flags: [],
    first_seen_at_ms: 1, last_seen_at_ms: 1, seen_count: 1,
  };
}
const rows = [
  item("1", "a", "node", "1", "研发", null),
  item("2", "a", "state", "2", null, "待处理"),
  item("3", "b", "both", "3", "测试", "已解决"),
  item("4", "a", "none", null, null, null),
];
const projectKey = (index: number) => relatedProjectKey(rows[index].id.project_key, rows[index].related_projects![0]);
const values = (options: { value: string }[]) => options.map((option) => option.value);

describe("统一工作筛选候选", () => {
  it.each(["node", "state", "both", "none"] as const)("只有 %s 流程的工作时仅显示对应流程候选", (kind) => {
    const result = workFilterOptions(rows.filter((row) => row.flow.kind === kind), [], emptyWorkFilters);
    expect(values(result.flowKinds)).toEqual([kind]);
  });

  it.each([
    { query: "工作1" }, { type: ["story"], project: [projectKey(0)] },
    { space: ["a"], nodeName: ["研发"] },
  ] satisfies Partial<WorkFilters>[])("流程候选应用搜索、事项类型、空间、项目和节点约束：%j", (conditions) => {
    const result = workFilterOptions(rows, [], { ...emptyWorkFilters, ...conditions });
    expect(values(result.flowKinds)).toEqual(["node"]);
  });

  it("空间与项目候选应用其他条件，节点和状态使用同一范围", () => {
    const result = workFilterOptions(rows, [], { ...emptyWorkFilters, flowKind: ["both"] });
    expect(values(result.spaces)).toEqual(["b"]);
    expect(values(result.projects)).toEqual([projectKey(2)]);
    expect(values(result.node.options)).toEqual(["测试"]);
    expect(values(result.state.options)).toEqual(["已解决"]);
    const searched = workFilterOptions(rows, [], { ...emptyWorkFilters, query: "工作1" });
    expect(values(searched.spaces)).toEqual(["a"]);
    expect(values(searched.projects)).toEqual([projectKey(0)]);
  });

  it.each([
    { space: ["a"] }, { project: [projectKey(0)] }, { flowKind: ["node"] },
    { nodeName: ["研发"] }, { stateName: ["待处理"] },
  ] satisfies Partial<WorkFilters>[])("每类候选排除自身已选条件以支持切换和多选：%j", (conditions) => {
    const all = workFilterOptions(rows, [], emptyWorkFilters);
    const result = workFilterOptions(rows, [], { ...emptyWorkFilters, ...conditions });
    if ("space" in conditions) expect(result.spaces).toEqual(all.spaces);
    if ("project" in conditions) expect(result.projects).toEqual(all.projects);
    if ("flowKind" in conditions) expect(result.flowKinds).toEqual(all.flowKinds);
    if ("nodeName" in conditions) expect(result.node.options).toEqual(all.node.options);
    if ("stateName" in conditions) expect(result.state.options).toEqual(all.state.options);
  });

  it("已选流程变成零结果时保留中文名称，取消后移除空候选", () => {
    const result = workFilterOptions([rows[0]], [], { ...emptyWorkFilters, flowKind: ["state"] });
    expect(result.flowKinds).toEqual([{ value: "node", label: "节点流" }, { value: "state", label: "状态流" }]);
    expect(values(workFilterOptions([rows[0]], [], emptyWorkFilters).flowKinds)).toEqual(["node"]);
  });

  it("空工作与无匹配搜索不会产生未选候选，未提供项目仅在实际存在时出现", () => {
    for (const data of [[], rows]) {
      const result = workFilterOptions(data, [], { ...emptyWorkFilters, query: "不存在的工作" });
      expect(result.spaces).toEqual([]);
      expect(result.projects).toEqual([]);
      expect(result.flowKinds).toEqual([]);
      expect(result.node.options).toEqual([]);
      expect(result.state.options).toEqual([]);
    }
    expect(values(workFilterOptions(rows, [], { ...emptyWorkFilters, flowKind: ["none"] }).projects))
      .toEqual([missingProject]);
    expect(values(workFilterOptions(rows, [], { ...emptyWorkFilters, flowKind: ["node"] }).projects))
      .not.toContain(missingProject);
  });

  it("调整上层条件统一清理下层选择，保留搜索、类型和有效的上层条件", () => {
    const filters: WorkFilters = { ...emptyWorkFilters, query: "工作", type: ["story"], typeLabel: { story: "需求" },
      space: ["a"], spaceLabel: { a: "空间a" }, project: [projectKey(0)], projectLabel: { [projectKey(0)]: "项目1" },
      flowKind: ["node"], nodeName: ["研发"], stateName: ["待处理"] };
    const options = [{ value: "b", label: "空间b" }];
    expect(changeWorkFilter(filters, "space", ["b"], options)).toEqual({ ...emptyWorkFilters,
      query: "工作", type: ["story"], typeLabel: { story: "需求" }, space: ["b"], spaceLabel: { b: "空间b" } });
    const changedProject = changeWorkFilter(filters, "project", [], []);
    expect(changedProject).toEqual({ ...emptyWorkFilters, query: "工作", type: ["story"], typeLabel: { story: "需求" },
      space: ["a"], spaceLabel: { a: "空间a" } });
    expect(changeWorkFilter(filters, "flowKind", ["state"], []))
      .toEqual({ ...filters, flowKind: ["state"], nodeName: [], stateName: [] });
  });
});
