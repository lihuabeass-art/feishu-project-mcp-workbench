import { filterItems, flowLabel, projectFilterOptions, workflowFacets } from "./model";
import type { SelectOption } from "./Select";
import type { CachedItem, SpaceCatalog } from "./types";

export type WorkFilters = {
  query: string;
  space: string[];
  spaceLabel: Record<string, string>;
  type: string[];
  typeLabel: Record<string, string>;
  project: string[];
  projectLabel: Record<string, string>;
  flowKind: string[];
  nodeName: string[];
  stateName: string[];
};

export const emptyWorkFilters: WorkFilters = {
  query: "", space: [], spaceLabel: {}, project: [], projectLabel: {},
  type: [], typeLabel: {}, flowKind: [], nodeName: [], stateName: [],
};

export function keepFilterSelection(options: SelectOption[], values: string[], labels: Record<string, string>) {
  return [...options, ...values.filter((value) => !options.some((option) => option.value === value))
    .map((value) => ({ value, label: labels[value] || value }))];
}

export type WorkLocationOptions = { spaces: SelectOption[]; projects: SelectOption[] };

// 两种布局共用工作范围与已选条件；目录不增加没有工作事项的空间或项目。
export function workLocationOptions(items: CachedItem[], catalog: SpaceCatalog[], filters: WorkFilters): WorkLocationOptions {
  const names = new Map(catalog.map((space) =>
    [space.project_key, space.name || space.simple_name || space.project_key]));
  const spaceItems = filterWorkItems(items, { ...filters, space: [] });
  const projectItems = filterWorkItems(items, { ...filters, project: [] });
  const spaces = [...new Map(spaceItems.filter((item) => item.id.project_key).map((item) =>
    [item.id.project_key!, names.get(item.id.project_key!) || item.project_name || item.id.project_key!])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "zh-CN") || a[0].localeCompare(b[0]))
    .map(([value, label]) => ({ value, label }));
  return {
    spaces: keepFilterSelection(spaces, filters.space, filters.spaceLabel),
    projects: keepFilterSelection(projectFilterOptions(projectItems, catalog, "", ""),
      filters.project, filters.projectLabel),
  };
}

// 每个候选应用其他条件，排除自身选择，避免多选后无法继续选择同类值。
export function workFilterOptions(items: CachedItem[], catalog: SpaceCatalog[], filters: WorkFilters) {
  const flowItems = filterWorkItems(items, { ...filters, flowKind: [] });
  const kinds = new Set(flowItems.map((item) => item.flow.kind));
  return {
    ...workLocationOptions(items, catalog, filters),
    flowKinds: keepFilterSelection(Object.entries(flowLabel)
      .filter(([value]) => kinds.has(value as CachedItem["flow"]["kind"]))
      .map(([value, label]) => ({ value, label })), filters.flowKind, flowLabel),
    ...workflowFacets(items, filters.query, filters.type, filters.space, filters.flowKind,
      filters.nodeName, filters.stateName, filters.project),
  };
}

export type WorkFilterOptions = ReturnType<typeof workFilterOptions>;

export const selectionLabels = (options: SelectOption[], values: string[]) => Object.fromEntries(
  values.map((value) => [value, options.find((option) => option.value === value)?.label || value]),
);

export function changeWorkFilter(filters: WorkFilters, key: "space" | "project" | "flowKind",
  values: string[], options: SelectOption[]): WorkFilters {
  if (key === "flowKind") return { ...filters, flowKind: values, nodeName: [], stateName: [] };
  const base = { ...emptyWorkFilters, query: filters.query, type: filters.type, typeLabel: filters.typeLabel };
  if (key === "space") return { ...base, space: values, spaceLabel: selectionLabels(options, values) };
  return { ...base, space: filters.space, spaceLabel: filters.spaceLabel,
    project: values, projectLabel: selectionLabels(options, values) };
}

export function filterWorkItems(items: CachedItem[], filters: WorkFilters) {
  return filterItems(items, filters.query, filters.type,
    filters.space, filters.flowKind, filters.nodeName, filters.stateName, filters.project);
}

export function workFilterCount(filters: WorkFilters) {
  return Number(!!filters.query.trim()) + [filters.space, filters.project,
    filters.type, filters.flowKind, filters.nodeName, filters.stateName].filter((values) => values.length > 0).length;
}
