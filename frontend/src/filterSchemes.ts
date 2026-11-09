import { emptyWorkFilters, type WorkFilters } from "./workFilters";
import { nodeFilterLabel } from "./model";

// 类型由清单导航管理，不属于可复用的筛选方案。
export type FilterSchemeFilters = Omit<WorkFilters, "type" | "typeLabel">;

export interface FilterScheme {
  id: string;
  name: string;
  // 保留旧版文档字段；读取和保存统一为 false，搜索仅作为临时条件。
  includeQuery: boolean;
  filters: FilterSchemeFilters;
}
export interface FilterSchemeDocument {
  schemaVersion: 1;
  schemes: FilterScheme[];
  defaultId: string | null;
}
export const emptySchemeDocument = (): FilterSchemeDocument => ({ schemaVersion: 1, schemes: [], defaultId: null });
const fields = ["space", "project", "flowKind", "nodeName", "stateName"] as const;

function parseFilters(value: unknown): FilterSchemeFilters {
  if (!value || typeof value !== "object") throw new Error("筛选方案条件格式无法读取，原数据已保留");
  const entry = value as Record<string, unknown>;
  const filters = savedFilters(emptyWorkFilters);
  for (const key of fields) {
    if (!Array.isArray(entry[key]) || !(entry[key] as unknown[]).every((value) => typeof value === "string"))
      throw new Error("筛选方案条件格式无法读取，原数据已保留");
    filters[key] = [...new Set(entry[key] as string[])];
  }
  if (typeof entry.query !== "string") throw new Error("筛选方案关键词格式无法读取，原数据已保留");
  filters.query = entry.query;
  for (const key of ["spaceLabel", "projectLabel"] as const) {
    const labels = entry[key];
    if (labels && typeof labels === "object" && !Array.isArray(labels))
      filters[key] = Object.fromEntries(Object.entries(labels).filter(([, value]) => typeof value === "string")) as Record<string, string>;
  }
  return filters;
}

// v0 explicit saved documents used `version` and `defaultSchemeId`. Never import old transient filters.
export function readSchemeDocument(value: unknown): FilterSchemeDocument {
  if (value == null) return emptySchemeDocument();
  if (typeof value !== "object") throw new Error("筛选方案格式无法读取，原数据已保留");
  const entry = value as Record<string, unknown>;
  if (entry.schemaVersion != null ? entry.schemaVersion !== 1 : entry.version !== 0) throw new Error("此版本无法读取筛选方案格式，原数据已保留");
  if (!Array.isArray(entry.schemes)) throw new Error("筛选方案列表无法读取，原数据已保留");
  const ids = new Set<string>();
  const schemes = entry.schemes.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("筛选方案无法读取，原数据已保留");
    const scheme = raw as FilterScheme;
    if (typeof scheme.id !== "string" || !scheme.id || ids.has(scheme.id) || typeof scheme.name !== "string" || !scheme.name.trim() || typeof scheme.includeQuery !== "boolean")
      throw new Error("筛选方案身份或名称无法读取，原数据已保留");
    ids.add(scheme.id);
    return { id: scheme.id, name: scheme.name, includeQuery: false,
      filters: savedFilters(parseFilters(scheme.filters)) };
  });
  const defaultId = entry.schemaVersion === 1 ? entry.defaultId : entry.defaultSchemeId;
  if (defaultId != null && (typeof defaultId !== "string" || !ids.has(defaultId)))
    throw new Error("默认筛选方案引用无法读取，原数据已保留");
  return { schemaVersion: 1, schemes, defaultId: defaultId as string | null ?? null };
}

export function savedFilters(filters: FilterSchemeFilters): FilterSchemeFilters {
  return structuredClone({ query: "", space: filters.space, spaceLabel: filters.spaceLabel,
    project: filters.project, projectLabel: filters.projectLabel, flowKind: filters.flowKind,
    nodeName: filters.nodeName, stateName: filters.stateName });
}
export function schemeAdjusted(filters: WorkFilters, scheme: FilterScheme): boolean {
  return fields.some((key) => JSON.stringify([...new Set(filters[key])].sort()) !== JSON.stringify([...new Set(scheme.filters[key])].sort()));
}
export function schemeSummary(filters: FilterSchemeFilters) {
  const labels = { space: "空间", project: "项目", flowKind: "流程", nodeName: "节点", stateName: "状态" };
  const parts = fields.filter((key) => filters[key].length).map((key) => {
    const names = key === "space" ? filters.spaceLabel : key === "project" ? filters.projectLabel : {};
    return `${labels[key]}：${filters[key].map((value) => names[value] || (key === "nodeName" ? nodeFilterLabel(value) : value)).join("、")}`;
  });
  return parts.join("；") || "不限条件";
}
