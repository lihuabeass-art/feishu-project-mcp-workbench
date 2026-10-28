import { useRef, useState } from "react";
import { Check, Layers3, Pencil, Plus, Trash2 } from "lucide-react";
import { removeWorkSource, setWorkSourceEnabled } from "./api";
import { actionLabel, asError, scopeLabel } from "./model";
import {
  builtinKey,
  builtinPresets,
  sourceKindName,
  sourceName,
  sourceProjects,
} from "./sourcePresets";
import { SourceEditor } from "./SourceEditor";
import type { CachedItem, Source, SpaceCatalog } from "./types";

type Editor =
  | { mode: "custom" }
  | { mode: "builtin"; key: string }
  | { mode: "edit"; source: Source };

export function WorkSources({
  sources,
  items,
  workspaceCatalog,
  selectedId,
  select,
  disabled,
  editable,
  saved,
}: {
  sources: Source[];
  items: CachedItem[];
  workspaceCatalog?: SpaceCatalog[];
  selectedId: string;
  select: (id: string) => void;
  disabled: boolean;
  editable: boolean;
  saved: (id?: string) => Promise<void>;
}) {
  const [catalog, setCatalog] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const locked = disabled || pending;
  const projects = sourceProjects(sources, items, workspaceCatalog);

  async function mutate(action: () => Promise<void>, success: string) {
    if (locked || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await action();
      await saved();
      setRemoving(null);
      setMessage(success);
    } catch (e) {
      setError(asError(e).message);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function open(value: Editor) {
    setEditor(value);
    setCatalog(false);
    setRemoving(null);
    setError("");
    setMessage("");
  }

  return (
    <section
      className="source-types work-sources"
      aria-label="已添加的工作来源"
    >
      <div className="section-heading">
        <div>
          <h3>已添加的工作来源</h3>
          <p>
            首次使用先同步「我的待办」；需要跟进更多工作时，再按需添加来源。
          </p>
          <p>选择来源卡片可设置下方的工作类型。</p>
        </div>
        {editable && (
          <div className="source-management-actions">
            <button
              className="secondary"
              disabled={locked || !!editor}
              onClick={() => {
                setCatalog(!catalog);
                setRemoving(null);
              }}
            >
              <Plus size={14} />
              添加内置来源
            </button>
            <button
              className="secondary"
              disabled={locked || !!editor}
              onClick={() => open({ mode: "custom" })}
            >
              <Plus size={14} />
              添加自定义来源
            </button>
          </div>
        )}
      </div>
      <div className="source-list" role="radiogroup" aria-label="选择工作来源">
        {sources.map((source) => {
          const key = builtinKey(source);
          const preset = builtinPresets.find((p) => p.key === key);
          const needsProject =
            !!preset && source.kind === "work_item_type" && !source.project_key;
          const label = `${sourceName(source)}${
            source.project_key
              ? ` · ${projects.get(source.project_key) || source.project_key}`
              : ""
          }`;
          return (
            <div
              className={`source-card ${selectedId === source.id ? "selected" : ""}`}
              key={source.id}
            >
              <label className="source-selection">
                <input
                  type="radio"
                  name="source"
                  value={source.id}
                  checked={selectedId === source.id}
                  disabled={locked || !!editor}
                  onChange={() => select(source.id)}
                  aria-label={label}
                />
                <span className="source-radio-mark" aria-hidden="true">
                  <Check size={13} />
                </span>
                <span className="source-symbol">
                  <Layers3 size={22} />
                </span>
                <span className="source-info">
                  <strong>
                    {sourceName(source)}{" "}
                    <span className="source-origin">
                      {preset ? "内置" : "自定义"}
                    </span>
                  </strong>
                  <span>
                    {preset?.description ||
                      (source.action
                        ? `${actionLabel[source.action] || source.action} · ${scopeLabel[source.todo_scope || ""] || "飞书默认进度"}`
                        : sourceKindName[source.kind] || source.kind)}
                  </span>
                  {source.project_key && (
                    <small title={source.project_key}>
                      空间：
                      {projects.get(source.project_key) || source.project_key}
                    </small>
                  )}
                  {needsProject ? (
                    <small>设置飞书空间后即可同步需求。</small>
                  ) : (
                    source.reason && <small>{source.reason}</small>
                  )}
                </span>
              </label>
              <div className="source-card-actions">
                <span
                  className={`pill ${source.executable ? "" : "unavailable"}`}
                >
                  {needsProject
                    ? "待设置空间"
                    : source.executable
                      ? "可同步"
                      : source.enabled
                        ? "不可用"
                        : "已停用"}
                </span>
                {editable && (
                  <>
                    <label className="type-toggle">
                      <input
                        type="checkbox"
                        role="switch"
                        aria-label={`启用${label}`}
                        aria-describedby={`source-enabled-${source.id}`}
                        checked={source.enabled}
                        disabled={locked || !!editor}
                        onChange={(e) =>
                          void mutate(
                            () =>
                              setWorkSourceEnabled(source.id, e.target.checked),
                            "来源启用状态已保存。",
                          )
                        }
                      />
                      <span className="type-switch-track" aria-hidden="true" />
                      <span id={`source-enabled-${source.id}`}>参与同步</span>
                    </label>
                    {(!preset || needsProject) && (
                      <button
                        className="secondary"
                        disabled={locked || !!editor}
                        aria-label={`${needsProject ? "设置空间" : "编辑"}${label}`}
                        onClick={() => open({ mode: "edit", source })}
                      >
                        <Pencil size={13} />
                        {needsProject ? "设置空间" : "编辑"}
                      </button>
                    )}
                    <button
                      className="source-remove"
                      disabled={locked || !!editor}
                      aria-label={`移除${label}`}
                      onClick={() => {
                        setRemoving(source.id);
                        setError("");
                        setMessage("");
                      }}
                    >
                      <Trash2 size={14} />
                      移除
                    </button>
                  </>
                )}
              </div>
              {removing === source.id && (
                <div
                  className="source-remove-confirm"
                  role="group"
                  aria-label={`确认移除${label}`}
                >
                  <div>
                    <strong>移除“{label}”？</strong>
                    <p>
                      移除后停止从此来源同步，保留本地已缓存的事项；飞书上的数据不受影响。
                    </p>
                  </div>
                  <button
                    className="secondary"
                    disabled={locked}
                    onClick={() => setRemoving(null)}
                  >
                    取消
                  </button>
                  <button
                    className="source-remove"
                    disabled={locked}
                    onClick={() =>
                      void mutate(
                        () => removeWorkSource(source.id),
                        "工作来源已移除，可随时重新添加。",
                      )
                    }
                  >
                    {pending ? "正在移除…" : "确认移除"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {!sources.length && (
          <div className="compact-empty">
            <Layers3 size={27} />
            <p>尚未添加工作来源，从内置来源开始，或创建自己的查询规则。</p>
          </div>
        )}
      </div>
      {catalog && (
        <section className="source-catalog" aria-label="内置来源目录">
          <div className="section-heading">
            <div>
              <h4>内置来源</h4>
              <p>使用固定的查询规则；需要空间的来源可按不同空间多次添加。</p>
            </div>
            <button className="secondary" onClick={() => setCatalog(false)}>
              收起
            </button>
          </div>
          <div className="source-catalog-grid">
            {builtinPresets.map((preset) => {
              const added =
                preset.kind === "personal_todo" &&
                sources.some((source) => builtinKey(source) === preset.key);
              return (
                <div className="source-catalog-card" key={preset.key}>
                  <strong>{preset.name}</strong>
                  <p>{preset.description}</p>
                  <button
                    className="secondary"
                    disabled={locked || added}
                    onClick={() => open({ mode: "builtin", key: preset.key })}
                  >
                    {added ? "已添加" : `添加${preset.name}`}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {editor && (
        <SourceEditor
          key={
            editor.mode === "edit"
              ? editor.source.id
              : editor.mode === "builtin"
                ? editor.key
                : "custom"
          }
          sources={sources}
          items={items}
          workspaceCatalog={workspaceCatalog}
          disabled={locked}
          editingSource={editor.mode === "edit" ? editor.source : undefined}
          builtinKey={
            editor.mode === "builtin"
              ? editor.key
              : editor.mode === "edit"
                ? builtinKey(editor.source)
                : undefined
          }
          cancel={() => setEditor(null)}
          saved={async (id) => {
            await saved(id);
            setEditor(null);
            setMessage("工作来源已保存，下次同步使用这些条件。");
          }}
        />
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
