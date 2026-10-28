import { useEffect, useState } from "react";
import { discoverSourceFields, saveWorkSource } from "./api";
import { asError } from "./model";
import { Select } from "./Select";
import {
  builtinPresets,
  sourceKindName,
  sourceName,
  sourceProjects,
} from "./sourcePresets";
import type {
  CachedItem,
  Source,
  SourceFields,
  WorkSourceInput,
  SpaceCatalog,
} from "./types";

export function SourceEditor({
  sources,
  items,
  workspaceCatalog,
  disabled,
  saved,
  editingSource,
  builtinKey,
  cancel,
}: {
  sources: Source[];
  items: CachedItem[];
  workspaceCatalog?: SpaceCatalog[];
  disabled: boolean;
  saved: (id: string) => Promise<void>;
  editingSource?: Source;
  builtinKey?: string;
  cancel: () => void;
}) {
  const [editing, setEditing] = useState("");
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("work_item_type");
  const [project, setProject] = useState("");
  const [manualProject, setManualProject] = useState(false);
  const [typeKey, setTypeKey] = useState("story");
  const [viewId, setViewId] = useState("");
  const [action, setAction] = useState("todo");
  const [todoScope, setTodoScope] = useState("");
  const [assetKey, setAssetKey] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [rule, setRule] = useState("all_participants");
  const [fields, setFields] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [matchAll, setMatchAll] = useState(false);
  const [expression, setExpression] = useState("");
  const [metadata, setMetadata] = useState<SourceFields | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const projects = sourceProjects(sources, items, workspaceCatalog);
  const locked = disabled || pending;
  const editedSource = sources.find((source) => source.id === editing);
  const builtin = builtinPresets.find((p) => p.key === builtinKey);
  const toggle = (values: string[], key: string) =>
    values.includes(key) ? values.filter((v) => v !== key) : [...values, key];
  function edit(value: string) {
    setEditing(value);
    setMetadata(null);
    setError("");
    setMessage("");
    const source = sources.find((s) => s.id === value);
    if (!source) {
      setId("");
      setName("");
      setKind("work_item_type");
      setEnabled(true);
      setRule("all_participants");
      setFields([]);
      setRoles([]);
      setMatchAll(false);
      setExpression("");
      setViewId("");
      setAction("todo");
      setTodoScope("");
      setAssetKey("");
      return;
    }
    setId(source.id);
    setName(sourceName(source));
    setKind(source.kind);
    setEnabled(source.enabled);
    setProject(source.project_key || "");
    setTypeKey(source.work_item_type_key || "story");
    setViewId(source.view_id || "");
    setAction(source.action || "todo");
    setTodoScope(source.todo_scope || "");
    setAssetKey(source.asset_key || "");
    try {
      const value = source.association_rule
        ? JSON.parse(source.association_rule)
        : { kind: "all_participants" };
      setRule(value.kind);
      setFields(value.fields || []);
      setRoles(value.roles || []);
      setMatchAll(!!value.match_all);
      setExpression(value.expression || "");
    } catch {
      setRule("custom");
      setExpression(source.association_rule || "");
    }
  }
  function usePreset(key: string) {
    const value = builtinPresets.find((p) => p.key === key);
    if (!value) return;
    let newId = `builtin-${key}`;
    let suffix = 2;
    while (sources.some((source) => source.id === newId))
      newId = `builtin-${key}-${suffix++}`;
    setId(newId);
    setName(value.name);
    setKind(value.kind);
    setEnabled(true);
    setAction("action" in value ? value.action : "todo");
    setTodoScope("scope" in value ? value.scope : "");
    setAssetKey("");
    setTypeKey("typeKey" in value ? value.typeKey : typeKey);
    setRule("rule" in value ? value.rule : "all_participants");
    setFields([]);
    setRoles([]);
    setMatchAll(false);
    setExpression("");
    setViewId("");
    setMetadata(null);
    setError("");
    setMessage("");
  }
  useEffect(() => {
    if (editingSource) edit(editingSource.id);
    else if (builtinKey) usePreset(builtinKey);
    // 每次打开表单使用独立实例；快照刷新不覆盖正在输入的草稿。
  }, []);
  async function discover() {
    setPending(true);
    setError("");
    try {
      setMetadata(await discoverSourceFields(project.trim(), typeKey.trim()));
    } catch (e) {
      setError(asError(e).message);
    } finally {
      setPending(false);
    }
  }
  async function save() {
    setPending(true);
    setError("");
    setMessage("");
    try {
      if (!builtin && !name.trim()) throw new Error("请填写来源名称。");
      if (
        !builtin &&
        !editing &&
        sources.some(
          (source) =>
            sourceName(source) === name.trim() || source.id === name.trim(),
        )
      ) {
        throw new Error("来源名称已存在，请使用其他名称。");
      }
      const input: WorkSourceInput = {
        id: editing || (builtin ? id : name.trim()),
        kind,
        enabled,
        ...(builtin
          ? { builtin_key: builtin.key }
          : { display_name: name.trim() }),
      };
      if (kind === "personal_todo") {
        input.action = action;
        if (todoScope) input.todo_scope = todoScope;
        if (assetKey.trim()) input.asset_key = assetKey.trim();
      } else {
        if (!project.trim()) throw new Error("请选择空间或填写空间标识。");
        input.project_key = project.trim();
        if (kind === "view") input.view_id = viewId.trim();
        else {
          if (rule === "personnel" && !fields.length && !roles.length) {
            throw new Error("请先发现并选择至少一个人员字段或角色。");
          }
          input.work_item_type_key = typeKey.trim();
          input.association_rule = JSON.stringify(
            rule === "personnel"
              ? { kind: rule, fields, roles, match_all: matchAll }
              : rule === "custom"
                ? { kind: rule, expression }
                : { kind: rule },
          );
        }
      }
      if (
        builtin &&
        sources.some(
          (source) =>
            source.id !== input.id &&
            source.builtin_key === builtin.key &&
            (kind === "personal_todo" ||
              source.project_key?.trim() === input.project_key),
        )
      ) {
        throw new Error(
          kind === "personal_todo"
            ? "此内置来源已经添加。"
            : "此空间已添加相同的内置来源，请选择其他空间。",
        );
      }
      await saveWorkSource(input);
      await saved(input.id);
    } catch (e) {
      setError(asError(e).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      className="source-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="section-heading">
        <div>
          <h3>
            {builtin
              ? editedSource
                ? "设置来源空间"
                : `添加${builtin.name}`
              : editing
                ? "编辑自定义来源"
                : "添加自定义来源"}
          </h3>
          <p>
            {builtin
              ? builtin.description
              : "设置查询范围与关联规则，保存后在下次同步生效。"}
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={cancel}
          disabled={pending}
        >
          取消
        </button>
      </div>
      <fieldset disabled={locked}>
        {builtin && (
          <p className="hint">
            内置来源的名称与查询规则固定。如需其他筛选条件，请添加自定义来源。
          </p>
        )}
        {!builtin && (
          <>
            <label>
              来源名称
              <input
                aria-label="来源名称"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              查询方式
              <Select
                ariaLabel="来源查询方式"
                value={kind}
                onChange={(value) => {
                  setKind(value);
                  setMetadata(null);
                }}
                options={[
                  { value: "work_item_type", label: "按工作项类型与关联规则" },
                  { value: "view", label: "按飞书已保存视图" },
                  {
                    value: "personal_todo",
                    label: sourceKindName.personal_todo,
                  },
                ]}
              />
            </label>
          </>
        )}
        {kind === "personal_todo" && !builtin && (
          <>
            <label>
              工作范围
              <Select
                ariaLabel="个人工作范围"
                value={action}
                onChange={setAction}
                options={[
                  { value: "todo", label: "我的待办" },
                  { value: "overdue", label: "逾期待办" },
                  { value: "this_week", label: "本周待办" },
                  { value: "done", label: "我的已办" },
                ]}
              />
            </label>
            <label>
              待办进度
              <Select
                ariaLabel="待办进度"
                value={todoScope}
                onChange={setTodoScope}
                options={[
                  { value: "", label: "使用飞书默认范围" },
                  { value: "all", label: "全部进度" },
                  { value: "in_progress", label: "进行中" },
                  { value: "not_started", label: "尚未开始" },
                ]}
              />
            </label>
            <label>
              个人待办资产标识（可选）
              <input
                value={assetKey}
                onChange={(e) => setAssetKey(e.target.value)}
                placeholder="仅在飞书报错要求时填写"
              />
            </label>
            <p className="hint">
              由飞书按当前登录用户查询；保存后在下一次同步生效。
            </p>
          </>
        )}
        {kind !== "personal_todo" && (
          <>
            {projects.size > 0 && (
              <label>
                空间
                <Select
                  ariaLabel="来源空间"
                  value={!manualProject && projects.has(project) ? project : ""}
                  disabled={locked}
                  onChange={(value) => {
                    setProject(value);
                    setManualProject(!value);
                    setMetadata(null);
                  }}
                  options={[
                    { value: "", label: "请选择空间，或手动填写标识" },
                    ...Array.from(projects, ([value, label]) => ({
                      value,
                      label: label === value ? value : `${label} · ${value}`,
                    })),
                  ]}
                />
              </label>
            )}
            {(manualProject || !projects.has(project)) && (
              <label>
                空间标识
                <input
                  aria-label="来源空间标识"
                  aria-describedby="source-project-help"
                  required
                  value={project}
                  onChange={(e) => {
                    setProject(e.target.value);
                    setManualProject(true);
                    setMetadata(null);
                  }}
                  placeholder="填写飞书空间标识，不是空间名称"
                />
              </label>
            )}
            <p className="hint" id="source-project-help">
              仅查询所选空间。候选来自本机已同步的事项与已发现的工作类型；
              {projects.size > 0
                ? "其他空间可选择手动填写标识。"
                : "可先同步「我的待办」获取空间名称，也可手动填写空间标识。"}
            </p>
            {builtinKey === "stories" && <p className="hint">同步该空间内我参与的需求，进入工作清单后可再按「所属项目」筛选。</p>}
          </>
        )}
        {kind === "view" && !builtin && (
          <>
            <label>
              视图 ID
              <input
                aria-label="来源视图ID"
                required
                value={viewId}
                onChange={(e) => setViewId(e.target.value)}
              />
            </label>
            <p className="hint">
              使用飞书中已保存的普通视图及其筛选条件。需要仅查看本人相关工作时，请在该视图中保存对应条件。
            </p>
          </>
        )}
        {kind === "work_item_type" && !builtin && (
          <>
            <label>
              工作项类型标识
              <input
                aria-label="来源工作项类型"
                required
                value={typeKey}
                onChange={(e) => {
                  setTypeKey(e.target.value);
                  setMetadata(null);
                }}
                placeholder="如 story、issue、sub_task 或自定义类型标识"
              />
            </label>
            <label>
              与我相关的规则
              <Select
                ariaLabel="本人关联规则"
                value={rule}
                onChange={setRule}
                options={[
                  { value: "all_participants", label: "全部参与人包含我" },
                  { value: "current_participants", label: "当前参与人包含我" },
                  { value: "personnel", label: "指定人员字段或角色包含我" },
                  { value: "custom", label: "自定义 MQL 条件" },
                ]}
              />
            </label>
            {rule === "personnel" && (
              <>
                <button
                  type="button"
                  className="secondary"
                  disabled={!project.trim() || !typeKey.trim()}
                  onClick={() => void discover()}
                >
                  发现人员字段与角色
                </button>
                <div className="rule-options">
                  {(metadata?.fields || [])
                    .filter((f) =>
                      ["user", "multi-user"].includes(f.field_type),
                    )
                    .map((f) => (
                      <button
                        type="button"
                        className="rule-choice"
                        key={f.field_key}
                        aria-pressed={fields.includes(f.field_key)}
                        onClick={() => setFields(toggle(fields, f.field_key))}
                      >
                        {f.field_name} · {f.field_key}
                      </button>
                    ))}
                  {(metadata?.roles || []).map((r) => (
                    <button
                      type="button"
                      className="rule-choice"
                      key={r.role_id}
                      aria-pressed={roles.includes(r.role_name)}
                      onClick={() => setRoles(toggle(roles, r.role_name))}
                    >
                      角色：{r.role_name}
                    </button>
                  ))}
                </div>
                {(fields.length > 0 || roles.length > 0) && (
                  <p className="hint">
                    已选：{[...fields, ...roles].join("、")}
                  </p>
                )}
                <label className="source-switch-setting">
                  <span>
                    全部条件同时满足
                    <small id="source-match-all-help">
                      关闭时，任一所选条件满足即可。
                    </small>
                  </span>
                  <span className="type-toggle">
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label="全部条件同时满足"
                      aria-describedby="source-match-all-help"
                      checked={matchAll}
                      onChange={(e) => setMatchAll(e.target.checked)}
                    />
                    <span className="type-switch-track" aria-hidden="true" />
                  </span>
                </label>
              </>
            )}
            {rule === "custom" && (
              <label>
                筛选条件
                <textarea
                  aria-label="自定义MQL条件"
                  required
                  rows={4}
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                  placeholder="只填写 WHERE 后面的条件，可使用 current_login_user()"
                />
              </label>
            )}
            <p className="hint">
              条件在飞书端查询，不受“进行中待办”范围限制；可能包含已完成事项。
            </p>
          </>
        )}
        <label className="source-switch-setting">
          <span>
            启用这个来源
            <small id="source-enabled-help">
              开启后参与自动同步，关闭后保留来源配置。
            </small>
          </span>
          <span className="type-toggle">
            <input
              type="checkbox"
              role="switch"
              aria-label="启用这个来源"
              aria-describedby="source-enabled-help"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="type-switch-track" aria-hidden="true" />
          </span>
        </label>
        <button className="primary" type="submit">
          {pending ? "处理中…" : "保存工作来源"}
        </button>
      </fieldset>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </form>
  );
}
