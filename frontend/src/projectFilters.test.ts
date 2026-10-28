import { describe, expect, it } from "vitest";
import { filterItems, missingProject, projectFilterOptions, relatedProjectKey, workflowFacets } from "./model";
import { sourceProjects } from "./sourcePresets";
import { emptyWorkFilters, workLocationOptions } from "./workFilters";
import type { CachedItem, SpaceCatalog } from "./types";

const project = { field_key: "custom-project", id: "1", name: "应用平台" };
const item = (space: string, id: string, assigned = true): CachedItem => ({
  id: { project_key: space, work_item_type_key: "story", work_item_id: id },
  project_name: "不稳定的事项空间名", name: id, related_projects: assigned ? [project] : [],
  flow: { kind: "node", node_name: space, node_state_key: null, start_state_key_name: null, end_state_key_name: null },
  schedule: { start_raw: null, end_raw: null }, raw_json: "{}", identity_missing_flags: [],
  first_seen_at_ms: 1, last_seen_at_ms: 1, seen_count: 1,
});
const catalog: SpaceCatalog[] = [{ project_key: "a", name: "正式空间", simple_name: "alias", projects: [
  { ...project, type_key: "story" }, { ...project, id: "2", name: "无事项的患者平台", type_key: "story" },
] }];

describe("空间与所属项目", () => {
  it("多选项目按空间和项目身份匹配，可同时选择未提供项目且不重复事项", () => {
    const a = item("a", "1"), b = item("b", "2"), missing = item("a", "3", false);
    const otherField = { ...item("a", "4"), related_projects: [{ ...project, field_key: "other" }] };
    expect(filterItems([a, b, missing, otherField], "", [], ["a", "b"], [], [], [],
      [relatedProjectKey("a", project), relatedProjectKey("b", project), missingProject])).toEqual([a, b, missing, otherField]);
    expect(projectFilterOptions([a, b, missing], catalog, ["story", "issue"], ["a", "b"]).map((option) => option.value))
      .toEqual(expect.arrayContaining([relatedProjectKey("a", project), relatedProjectKey("b", project), missingProject]));
  });

  it("正式空间名优先于事项与类型快照中的名字，顺序变化也不覆盖", () => {
    const a = item("a", "1");
    const b = { ...item("a", "2"), project_name: "另一个错误名称" };
    expect(sourceProjects([], [a, b], catalog).get("a")).toBe("正式空间");
    expect(sourceProjects([], [b, a], catalog).get("a")).toBe("正式空间");
    expect([...sourceProjects([], [a, b], catalog).keys()]).toEqual(["a"]);
  });
  it("首次目录核实失败时不把事项中的项目名当作正式空间名", () => {
    expect(sourceProjects([], [item("a", "1")], []).get("a")).toBe("a（名称未核实）");
  });
  it("项目选项仅包含当前事项关联的项目，并按空间与类型收窄", () => {
    const options = projectFilterOptions([item("a", "1")], catalog, "story", "a");
    expect(options).toEqual([{ value: relatedProjectKey("a", project), label: project.name }]);
    expect(projectFilterOptions([], catalog, "story", "a")).toEqual([]);
    expect(projectFilterOptions([], catalog, "issue", "a")).toEqual([]);
    expect(projectFilterOptions([], catalog, "story", "b")).toEqual([]);
  });
  it("目录只更新正式项目名，目录缺失时仍显示事项中的项目且不修改目录", () => {
    const a = { ...item("a", "1"), related_projects: [{ ...project, name: "旧项目名" }] };
    const before = JSON.stringify(catalog);
    expect(projectFilterOptions([a], catalog, "story", "a")[0].label).toBe(project.name);
    expect(projectFilterOptions([a], [], "story", "a")[0].label).toBe("旧项目名");
    expect(JSON.stringify(catalog)).toBe(before);
  });
  it("项目范围按实际事项类型与空间收窄，不因目录中缺少该类型而丢失项目", () => {
    const a = item("a", "1");
    const issue = { ...item("a", "2"), id: { ...a.id, work_item_type_key: "issue" },
      related_projects: [{ ...project, id: "3", name: "缺陷项目" }] };
    const b = item("b", "3");
    expect(workLocationOptions([a, issue, b], catalog, { ...emptyWorkFilters, type: ["issue"], space: ["a"] }).projects)
      .toEqual([{ value: relatedProjectKey("a", issue.related_projects[0]), label: "缺陷项目" }]);
    expect(projectFilterOptions([a, issue, b], catalog, ["story", "issue"], ["a", "b"]))
      .toHaveLength(3);
  });
  it("空间候选仅来自工作事项，目录补充正式名称；空目录与空工作分别处理", () => {
    const directory = [...catalog, { project_key: "empty", name: "无工作的空间", simple_name: null, projects: [] }];
    expect(workLocationOptions([item("a", "1")], directory, emptyWorkFilters).spaces)
      .toEqual([{ value: "a", label: "正式空间" }]);
    expect(workLocationOptions([item("b", "2")], [], emptyWorkFilters).spaces)
      .toEqual([{ value: "b", label: "不稳定的事项空间名" }]);
    expect(workLocationOptions([], directory, emptyWorkFilters)).toEqual({ spaces: [], projects: [] });
  });
  it("已选空间和项目变成零结果后保留名称，取消后不再出现在候选中", () => {
    const key = relatedProjectKey("a", project);
    const filters = { ...emptyWorkFilters, space: ["a"], spaceLabel: { a: "已选空间" },
      project: [key], projectLabel: { [key]: "已选项目" } };
    expect(workLocationOptions([], catalog, filters)).toEqual({
      spaces: [{ value: "a", label: "已选空间" }], projects: [{ value: key, label: "已选项目" }],
    });
    expect(workLocationOptions([], catalog, emptyWorkFilters)).toEqual({ spaces: [], projects: [] });
  });
  it("事项排序不同不改变两种模式的空间与项目候选顺序", () => {
    const a = { ...item("a", "1"), project_name: "空间甲" };
    const b = { ...item("b", "2"), project_name: "空间乙" };
    const options = workLocationOptions([a, b], [], emptyWorkFilters);
    expect(options.spaces).toEqual([{ value: "a", label: "空间甲" }, { value: "b", label: "空间乙" }]);
    expect(workLocationOptions([b, a], [], emptyWorkFilters)).toEqual(options);
  });
  it("同一项目跨关联字段匹配，不同空间和同名不同编号项目隔离，缺少关联时不猜测", () => {
    const a = item("a", "1");
    const b = item("b", "2");
    const missing = item("a", "3", false);
    const otherField = { ...item("a", "4"), related_projects: [{ ...project, field_key: "other" }] };
    const sameName = { ...item("a", "5"), related_projects: [{ ...project, id: "different" }] };
    const key = relatedProjectKey("a", project);
    expect(filterItems([a,b,missing,otherField,sameName], "", "", "", "", "", "", key)).toEqual([a,otherField]);
    expect(filterItems([a,b,missing], "", "", "", "", "", "", missingProject)).toEqual([missing]);
    expect(workflowFacets([a,b], "", "", "", "", "", "", key).node.options.map((o) => o.value)).toEqual(["a"]);
    expect(filterItems([a,b], "应用平台", "", "", "", "", "")).toEqual([a,b]);
  });
  it("同一项目在需求、版本和缓存中使用不同字段时只显示一个选项并共同匹配", () => {
    const a = item("a", "1");
    const version = { ...item("a", "2"), id: { ...a.id, work_item_type_key: "version", work_item_id: "2" },
      related_projects: [{ ...project, field_key: "version-project" }] };
    const directory: SpaceCatalog[] = [{ ...catalog[0], projects: [
      ...catalog[0].projects, { ...project, field_key: "version-project", type_key: "version" },
    ] }];
    const options = projectFilterOptions([a, version], directory, "", "a");
    expect(options.filter((option) => option.label === project.name)).toHaveLength(1);
    expect(options.map((option) => option.label)).not.toContain("无事项的患者平台");
    expect(filterItems([a, version], "", "", "", "", "", "", relatedProjectKey("a", project)))
      .toEqual([a, version]);
  });
});
