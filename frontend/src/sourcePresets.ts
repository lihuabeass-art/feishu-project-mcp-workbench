import type { CachedItem, Source, SpaceCatalog } from "./types";

export function sourceProjects(sources: Source[], items: CachedItem[], catalog?: SpaceCatalog[]) {
  const names = new Map<string, string>();
  function add(key: string | null | undefined, name?: string | null) {
    if (!key) return;
    if (!names.has(key) || names.get(key) === key) {
      names.set(key, catalog ? `${key}（名称未核实）` : name?.trim() || key);
    }
  }
  for (const item of items) add(item.id.project_key, item.project_name);
  for (const source of sources) {
    for (const type of source.type_scope?.types || []) {
      add(type.project_key, type.project_name);
    }
    add(source.project_key);
  }
  // 支持目录的后端只显示已核实名称；旧版后端沿用原缓存以保持兼容。
  for (const space of catalog || []) {
    names.set(space.project_key, space.name || `${space.project_key}（名称未核实）`);
    if (space.simple_name && names.has(space.simple_name))
      names.set(space.simple_name, space.name || `${space.simple_name}（名称未核实）`);
  }
  return names;
}

export const sourcePresets = [
  {
    key: "todo",
    name: "我的待办",
    description: "分配给我、正在进行的待办。",
    kind: "personal_todo",
    action: "todo",
    scope: "in_progress",
  },
  {
    key: "overdue",
    name: "逾期待办",
    description: "飞书判定已逾期的本人待办，优先处理交付风险。",
    kind: "personal_todo",
    action: "overdue",
    scope: "all",
  },
  {
    key: "week",
    name: "本周待办",
    description: "按飞书的本周工作口径查询，包含尚未开始的待办。",
    kind: "personal_todo",
    action: "this_week",
    scope: "all",
  },
  {
    key: "upcoming",
    name: "尚未开始的待办",
    description: "已分配给我、尚未开始的待办，提前准备后续工作。",
    kind: "personal_todo",
    action: "todo",
    scope: "not_started",
  },
  {
    key: "stories",
    name: "我参与的需求",
    description:
      "所选空间内全部参与人包含我的需求，覆盖历史和后续参与，可能包含已完成事项。",
    kind: "work_item_type",
    typeKey: "story",
    rule: "all_participants",
  },
  {
    key: "issues",
    name: "我参与的缺陷",
    description:
      "所选空间内全部参与人包含我的缺陷，补充个人待办之外的问题跟进。",
    kind: "work_item_type",
    typeKey: "issue",
    rule: "all_participants",
  },
  {
    key: "current",
    name: "当前我参与的工作",
    description:
      "当前参与人包含我；按所选空间和工作类型查询，与全部参与范围区分。",
    kind: "work_item_type",
    rule: "current_participants",
  },
  {
    key: "responsibility",
    name: "按职责跟进的工作",
    description:
      "发现并选择实际人员字段或角色；任一所选职责包含我就纳入，可改为全部满足。",
    kind: "work_item_type",
    rule: "personnel",
  },
  {
    key: "view",
    name: "飞书已保存视图",
    description:
      "复用飞书已保存的筛选组合，例如团队高优缺陷、版本交付或验收清单。",
    kind: "view",
  },
] as const;

// 需要用户指定字段、类型或视图的方案由自定义来源承载。
export const builtinPresets = sourcePresets.slice(0, 6);

export function builtinKey(source: Source): string | undefined {
  return source.builtin_key || undefined;
}

export function sourceName(
  source: Pick<
    Source,
    | "id"
    | "kind"
    | "action"
    | "todo_scope"
    | "work_item_type_key"
    | "association_rule"
    | "display_name"
    | "builtin_key"
  >,
): string {
  const preset = builtinPresets.find((p) => p.key === source.builtin_key);
  if (preset) return preset.name;
  if (source.display_name) return source.display_name;
  if (
    source.kind === "personal_todo" &&
    ["personal-todo", "personaltodo", "personalTodo"].includes(source.id)
  ) {
    if (source.action === "done") return "我的已办";
    if (source.action === "overdue") return "逾期待办";
    if (source.action === "this_week") return "本周待办";
    if (source.todo_scope === "not_started") return "尚未开始的待办";
    return "我的待办";
  }
  if (
    source.id === "related-story" &&
    source.kind === "work_item_type" &&
    source.work_item_type_key === "story"
  ) {
    try {
      if (
        !source.association_rule ||
        JSON.parse(source.association_rule).kind === "all_participants"
      )
        return "我参与的需求";
    } catch {
      /* 自定义规则保留原名称。 */
    }
  }
  return source.id;
}

export const sourceKindName: Record<string, string> = {
  personal_todo: "我的工作",
  work_item_type: "按工作类型与关联规则",
  view: "飞书已保存视图",
};
