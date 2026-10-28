import type { CSSProperties } from "react";
import type { AppError, CachedItem, FlowKind, RelatedProject, SpaceCatalog } from "./types";

export const missingProject = "missing-project";
export type FilterSelection = string | readonly string[];
const filterValues = (selection: FilterSelection): readonly string[] =>
  typeof selection === "string" ? selection ? [selection] : [] : selection;
const matchesFilter = (value: string | null, selection: FilterSelection) => {
  const values = filterValues(selection);
  return !values.length || (value !== null && values.includes(value));
};
export const relatedProjectKey = (space: string | null, project: RelatedProject) =>
  // 关联字段属于事项类型；同一个项目可被多个类型的不同字段引用。
  JSON.stringify([space, project.id]);

export function projectFilterOptions(items: CachedItem[], catalog: SpaceCatalog[], type: FilterSelection, space: FilterSelection) {
  // 目录只补充正式名称，候选身份由当前工作事项决定。
  const names = new Map<string, string>();
  for (const entry of catalog) {
    for (const project of entry.projects) {
      names.set(relatedProjectKey(entry.project_key, project), project.name);
    }
  }
  const options = new Map<string, string>();
  const scoped = items.filter((item) => matchesFilter(item.id.project_key, space) && matchesFilter(item.id.work_item_type_key, type));
  for (const item of scoped) {
    for (const project of item.related_projects || []) {
      const key = relatedProjectKey(item.id.project_key, project);
      if (!options.has(key)) options.set(key, names.get(key) || project.name);
    }
  }
  const result = [...options].sort((a, b) => a[1].localeCompare(b[1], "zh-CN") || a[0].localeCompare(b[0]))
    .map(([value, label]) => ({ value, label }));
  if (scoped.some((item) => !item.related_projects?.length)) result.push({ value: missingProject, label: "未提供所属项目" });
  return result;
}

export const itemKey = (item: CachedItem) =>
  JSON.stringify([
    item.id.project_key,
    item.id.work_item_type_key,
    item.id.work_item_id,
  ]);
export function orderTypeKeys(keys: string[], savedOrder: string[]) {
  const available = new Set(keys);
  const added = new Set<string>();
  const ordered: string[] = [];
  for (const key of savedOrder) {
    if (available.has(key) && !added.has(key)) {
      ordered.push(key);
      added.add(key);
    }
  }
  for (const key of keys) {
    if (!added.has(key)) {
      ordered.push(key);
      added.add(key);
    }
  }
  return ordered;
}
export function moveTypeKey(
  keys: string[],
  fromKey: string,
  targetKey: string,
  after: boolean,
) {
  if (fromKey === targetKey || !keys.includes(fromKey)) return null;
  const next = keys.filter((key) => key !== fromKey);
  const targetIndex = next.indexOf(targetKey);
  if (targetIndex < 0) return null;
  next.splice(targetIndex + Number(after), 0, fromKey);
  return next.some((key, index) => key !== keys[index]) ? next : null;
}
const typePalette = [
  "#9f90c8",
  "#d39a68",
  "#79a98f",
  "#6f9fc6",
  "#c9849a",
  "#b8a557",
  "#5fa9a6",
  "#a98d74",
];
// 按类型标识哈希取色：颜色不随排序、增删类型变化。
export function typeColor(key: string | null) {
  let hash = 2166136261;
  for (const char of key || "") {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 16777619);
  }
  return typePalette[(hash >>> 0) % typePalette.length];
}
const hexRgb = (hex: string) => {
  const value = parseInt(hex.slice(1), 16);
  return [value >> 16, (value >> 8) & 255, value & 255];
};
const typeInkBase = hexRgb("#2f4038");
// 输出 rgb 分量与预混深色，避免依赖旧版 macOS WebKit 不支持的 color-mix()。
export function typeColorStyle(key: string | null) {
  const color = typeColor(key);
  const rgb = hexRgb(color);
  const ink = rgb.map((v, i) => Math.round(v * 0.75 + typeInkBase[i] * 0.25));
  return {
    "--type-color": color,
    "--type-rgb": rgb.join(", "),
    "--type-ink": `rgb(${ink.join(", ")})`,
  } as CSSProperties;
}
export const typeLabel = (key: string | null) =>
  key === "story" ? "需求" : key === "issue" ? "缺陷" : key || "类型未提供";
export const flowLabel: Record<FlowKind, string> = {
  node: "节点流",
  state: "状态流",
  both: "节点与状态",
  none: "流程未提供",
};
export const actionLabel: Record<string, string> = {
  todo: "待办",
  done: "已完成",
  overdue: "已逾期",
  this_week: "本周",
};
export const scopeLabel: Record<string, string> = {
  all: "全部进度",
  in_progress: "进行中",
  not_started: "未开始",
};
export const stopLabel: Record<string, string> = {
  total_reached: "已取完远端结果",
  empty_page: "空页结束",
  short_page: "末页结束",
  max_pages: "达到分页上限，结果不完整",
  error: "同步中断",
};
export function localTime(value: number | null | undefined) {
  return value == null
    ? "尚无记录"
    : new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(value);
}

export function orderWorkItems(items: CachedItem[]) {
  const updateTime = (item: CachedItem) =>
    item.updated_at_ms != null && Number.isFinite(item.updated_at_ms)
      ? item.updated_at_ms
      : Number.NEGATIVE_INFINITY;
  return [...items].sort((a, b) =>
    Number(a.is_completed === true) - Number(b.is_completed === true) ||
    updateTime(b) - updateTime(a) ||
    itemKey(a).localeCompare(itemKey(b)),
  );
}

export function filterItems(
  items: CachedItem[],
  query: string,
  type: FilterSelection,
  project: FilterSelection,
  flowKind: FilterSelection,
  nodeName: FilterSelection,
  stateName: FilterSelection,
  relatedProject: FilterSelection = "",
) {
  const text = query.trim().toLocaleLowerCase();
  const selectedProjects = filterValues(relatedProject);
  return items.filter(
    (item) =>
      matchesFilter(item.id.work_item_type_key, type) &&
      matchesFilter(item.id.project_key, project) &&
      (!selectedProjects.length || selectedProjects.some((selectedProject) => selectedProject === missingProject
        ? !item.related_projects?.length
        : item.related_projects?.some((p) => relatedProjectKey(item.id.project_key, p) === selectedProject))) &&
      matchesFilter(item.flow.kind, flowKind) &&
      matchesFilter(item.flow.node_name, nodeName) &&
      matchesFilter(item.flow.start_state_key_name, stateName) &&
      (!text ||
        [item.name, item.id.work_item_id, item.project_name, ...(item.related_projects || []).map((p) => p.name)].some((v) =>
          v?.toLocaleLowerCase().includes(text),
        )),
  );
}

function valueFacet(
  items: CachedItem[],
  getValue: (item: CachedItem) => string | null,
  selected: FilterSelection,
) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = getValue(item);
    if (value?.trim()) counts.set(value, (counts.get(value) || 0) + 1);
  }
  // An active filter must remain visible so the user can remove it, even at zero results.
  const selectedValues = filterValues(selected);
  for (const value of selectedValues) if (!counts.has(value)) counts.set(value, 0);
  const options = [...counts]
    .sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
    .map(([value, count]) => ({ value, label: `${value}（${count}）`, count }));
  return {
    options,
    visible: selectedValues.length > 0 || options.some(({ count }) => count > 0 && count < items.length),
  };
}

export function workflowFacets(
  items: CachedItem[],
  query: string,
  type: FilterSelection,
  project: FilterSelection,
  flowKind: FilterSelection,
  nodeName: FilterSelection,
  stateName: FilterSelection,
  relatedProject: FilterSelection = "",
) {
  // Apply the other filters, but exclude each facet's own selection to allow switching values.
  return {
    node: valueFacet(
      filterItems(items, query, type, project, flowKind, "", stateName, relatedProject),
      (item) => item.flow.node_name,
      nodeName,
    ),
    state: valueFacet(
      filterItems(items, query, type, project, flowKind, nodeName, "", relatedProject),
      (item) => item.flow.start_state_key_name,
      stateName,
    ),
  };
}
export function asError(error: unknown): AppError {
  if (typeof error === "object" && error !== null && "message" in error) {
    return {
      kind: "kind" in error ? String(error.kind) : "unknown",
      message: String(error.message),
    };
  }
  return { kind: "unknown", message: String(error) };
}

/**
 * 错误种类面向用户的说法。`kind` 是后端给机器判断的短码（`error.rs::as_str`），
 * 原样贴到界面上就是让用户去猜内部术语；认不出的种类保留原文——宁可少说一层包装，
 * 也不编一句更好看的错。
 */
const ERROR_KIND_LABELS: Record<string, string> = {
  config: "配置问题",
  credential: "凭证问题",
  connection: "连不上服务",
  auth: "凭证被服务端拒绝",
  tool: "服务端处理出错",
  parse: "响应结构不认识",
  store: "本地缓存读写失败",
  storage: "本机存储读写失败",
  not_implemented: "该来源尚未支持",
  conflict: "信息已过期或互相冲突",
  validation: "本端已拒绝该请求",
  permission: "飞书侧权限不足",
  unknown_result: "结果不确定",
  action_failed: "动作执行失败",
  incomplete: "本轮同步不完整",
  internal: "桌面端内部中断",
  window: "窗口操作失败",
  unknown: "未能分类的错误",
};

export function errorKindLabel(kind: string): string {
  return ERROR_KIND_LABELS[kind] ?? kind;
}
