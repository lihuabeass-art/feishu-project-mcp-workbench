import { filterItems } from "./model";
import type { SelectOption } from "./Select";
import type { CachedItem } from "./types";

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

export const selectionLabels = (options: SelectOption[], values: string[]) => Object.fromEntries(
  values.map((value) => [value, options.find((option) => option.value === value)?.label || value]),
);

export function filterWorkItems(items: CachedItem[], filters: WorkFilters) {
  return filterItems(items, filters.query, filters.type,
    filters.space, filters.flowKind, filters.nodeName, filters.stateName, filters.project);
}

export function workFilterCount(filters: WorkFilters) {
  return Number(!!filters.query.trim()) + [filters.space, filters.project,
    filters.type, filters.flowKind, filters.nodeName, filters.stateName].filter((values) => values.length > 0).length;
}
