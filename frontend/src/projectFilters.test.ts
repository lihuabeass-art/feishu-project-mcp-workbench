import { describe, expect, it } from "vitest";
import { filterItems, missingProject, projectFilterOptions, relatedProjectKey, workflowFacets } from "./model";
import { sourceProjects } from "./sourcePresets";
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
  it("项目选项包含没有当前事项的关联项目，并按空间与类型收窄", () => {
    const options = projectFilterOptions([item("a", "1")], catalog, "story", "a");
    expect(options.map((o) => o.label)).toContain("无事项的患者平台");
    expect(projectFilterOptions([], catalog, "issue", "a")).toEqual([]);
    expect(projectFilterOptions([], catalog, "story", "b")).toEqual([]);
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
    expect(options.map((option) => option.label)).toContain("无事项的患者平台");
    expect(filterItems([a, version], "", "", "", "", "", "", relatedProjectKey("a", project)))
      .toEqual([a, version]);
  });
});
