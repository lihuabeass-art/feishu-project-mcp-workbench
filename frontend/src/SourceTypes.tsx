import { useRef, useState } from "react";
import { LoaderCircle, RefreshCw, RotateCcw } from "lucide-react";
import type { Source } from "./types";
import { typePreference, type TypePreferences } from "./preferences";
import { typeColorStyle } from "./model";
import { useTypeReorder } from "./useTypeReorder";
import { sourceName } from "./sourcePresets";

export function SourceTypes({
  source,
  sourceLabel,
  disabled,
  canReorder = false,
  label,
  typeName,
  typeKeys,
  preferences,
  updatePreferences,
  saveTypeOrder,
  apply,
}: {
  source?: Source;
  sourceLabel?: string;
  disabled: boolean;
  canReorder?: boolean;
  label: (key: string) => string;
  typeName: (key: string) => string;
  typeKeys: string[];
  preferences: TypePreferences;
  updatePreferences: (value: TypePreferences) => void;
  saveTypeOrder: (keys: string[]) => void;
  apply: (
    action: "refresh" | "save",
    keys?: string[] | null,
  ) => Promise<boolean>;
}) {
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const savingRef = useRef(false);
  const [aliasDrafts, setAliasDrafts] = useState<Record<string, string>>({});
  const scope = source?.type_scope;
  const availableKeys = [...new Set(scope?.types.map((t) => t.type_key) || [])];
  const keys = [
    ...typeKeys.filter((key) => availableKeys.includes(key)),
    ...availableKeys.filter((key) => !typeKeys.includes(key)),
  ];
  const reorder = useTypeReorder({
    keys,
    enabled: canReorder,
    onReorder: saveTypeOrder,
  });
  const all = !scope?.configured;
  const selectedKeys = all
    ? availableKeys
    : [
        ...new Set(
          scope?.types.filter((t) => t.selected).map((t) => t.type_key) || [],
        ),
      ];
  const syncDisabled = disabled || savingKey !== null;

  async function saveSync(key: string, nextKeys: string[] | null) {
    if (syncDisabled || savingRef.current) return;
    savingRef.current = true;
    setSavingKey(key);
    try {
      await apply("save", nextKeys);
    } finally {
      savingRef.current = false;
      setSavingKey(null);
    }
  }

  return (
    <section className="source-types" aria-label="工作类型">
      <div className="section-heading">
        <div>
          <h3>工作类型</h3>
          {source && (
            <p className="type-source-context">
              <strong>当前来源：{sourceLabel || sourceName(source)}</strong>
            </p>
          )}
          <p>清单显示、别名和同步范围按来源独立设置，所有设置自动保存。</p>
        </div>
        {source && (
          <button
            className="secondary"
            disabled={syncDisabled}
            onClick={() => void apply("refresh")}
          >
            <RefreshCw size={14} />
            发现类型
          </button>
        )}
      </div>
      {scope ? (
        <div className="type-sync-summary">
          <div>
            <strong>
              {savingKey !== null && (
                <LoaderCircle
                  size={13}
                  className="type-saving"
                  aria-hidden="true"
                />
              )}
              {all
                ? `全部 ${availableKeys.length} 种类型参与同步`
                : `${selectedKeys.length} / ${availableKeys.length} 种类型参与同步`}
            </strong>
            <p>新发现的类型默认开启；仅明确关闭的类型不参与后续同步。</p>
          </div>
          {!all && (
            <button
              className="type-sync-reset"
              disabled={syncDisabled}
              onClick={() => void saveSync("restore-all", null)}
            >
              <RotateCcw size={13} aria-hidden="true" />
              恢复全部同步
            </button>
          )}
        </div>
      ) : (
        <p className="hint">
          {source
            ? "当前服务未提供来源类型清单，暂时无法配置工作类型。"
            : "选择一个工作来源后，可发现类型并设置同步范围。"}
        </p>
      )}
      <div className="type-settings unified-types" role="list">
        {keys.map((key) => {
          const preference = typePreference(preferences, key);
          const alias = Object.hasOwn(aliasDrafts, key)
            ? aliasDrafts[key]
            : preference.alias;
          const available = availableKeys.includes(key);
          const projects = [
            ...new Set(
              scope?.types
                .filter((t) => t.type_key === key)
                .map((t) => t.project_name || t.project_key) || [],
            ),
          ];
          return (
            <div
              className={[
                "type-setting",
                reorder.draggingKey === key && "type-setting-dragging",
                reorder.dropTarget?.key === key &&
                  (reorder.dropTarget.after ? "drop-after" : "drop-before"),
              ]
                .filter(Boolean)
                .join(" ")}
              key={key}
              role="listitem"
              aria-label={label(key)}
              aria-roledescription={
                reorder.canReorder ? "可拖动工作类型" : undefined
              }
              {...reorder.itemProps<HTMLDivElement>(key)}
            >
              <div className="type-identity">
                <strong>
                  <span
                    className="type-dot"
                    style={typeColorStyle(key)}
                    aria-hidden="true"
                  />
                  {label(key)}
                </strong>
                <span className="type-original">
                  {typeName(key) !== label(key) && <>{typeName(key)} · </>}
                  {key}
                </span>
                {projects.length > 0 && (
                  <span className="type-original">{projects.join("、")}</span>
                )}
              </div>
              <div className="type-controls">
                <label className="type-toggle">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={`${label(key)}在清单中显示`}
                    checked={preference.enabled}
                    onChange={(e) =>
                      updatePreferences({
                        ...preferences,
                        [key]: { ...preference, enabled: e.target.checked },
                      })
                    }
                  />
                  <span className="type-switch-track" aria-hidden="true" />
                  清单显示
                </label>
                {scope && (
                  <label className="type-toggle">
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={`同步${label(key)}`}
                      disabled={syncDisabled || !available}
                      checked={available && selectedKeys.includes(key)}
                      onChange={(e) =>
                        void saveSync(
                          key,
                          e.target.checked
                            ? [...selectedKeys, key]
                            : selectedKeys.filter((k) => k !== key),
                        )
                      }
                    />
                    <span className="type-switch-track" aria-hidden="true" />
                    同步
                  </label>
                )}
              </div>
              <input
                className="type-alias-input"
                aria-label={`${typeName(key)}的显示别名`}
                placeholder="自定义名称"
                maxLength={40}
                value={alias}
                onChange={(e) => {
                  const value = e.target.value;
                  setAliasDrafts({ ...aliasDrafts, [key]: value });
                  updatePreferences({
                    ...preferences,
                    [key]: { ...preference, alias: value.trim() },
                  });
                }}
              />
            </div>
          );
        })}
        {!keys.length && (
          <p className="hint">
            当前来源尚未发现工作类型。先同步一次，再点击「发现类型」。
          </p>
        )}
      </div>
      <p className="hint">
        清单显示与别名仅影响本机的当前来源；同步开关仅影响当前来源，在下次同步时生效，关闭后已有事项仍保留，不影响单条事项刷新或流程操作。同一来源内，同一类型在各空间一并设置。名称实时生效，清空即可恢复原名。
      </p>
      {scope && !all && !selectedKeys.length && (
        <p className="scope-warning">
          当前已发现的类型均已关闭，将跳过这些类型的拉取；新发现的类型仍默认开启。
        </p>
      )}
    </section>
  );
}
