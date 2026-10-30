import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Source } from "./types";
import { typePreference, type TypePreferences } from "./preferences";
import { typeColorStyle } from "./model";
import { useTypeReorder } from "./useTypeReorder";
import { sourceName } from "./sourcePresets";

export function SourceTypes({
  source,
  sourceLabel,
  readFailure,
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
  readFailure?: string;
  disabled: boolean;
  canReorder?: boolean;
  label: (key: string) => string;
  typeName: (key: string) => string;
  typeKeys: string[];
  preferences: TypePreferences;
  updatePreferences: (value: TypePreferences) => void;
  saveTypeOrder: (keys: string[]) => void;
  apply: (
    action: "refresh",
  ) => Promise<boolean>;
}) {
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
          <p>所有工作类型均参与同步。清单显示、允许新建与别名按来源独立设置，自动保存。</p>
          <p id="type-creation-help">新建功能默认关闭；开启后，可在此类型下新建工作事项。</p>
        </div>
        {source && (
          <button
            className="secondary"
            disabled={disabled}
            onClick={() => void apply("refresh")}
          >
            <RefreshCw size={14} />
            发现类型
          </button>
        )}
      </div>
      {readFailure && <p className="hint" role="status">{readFailure}</p>}
      {!scope && (
        <p className="hint">
          {source
            ? "当前服务未提供来源类型清单，暂时无法配置工作类型。"
            : "选择一个工作来源后，可发现类型并设置清单显示与别名。"}
        </p>
      )}
      <div className="type-settings unified-types" role="list">
        {keys.map((key) => {
          const preference = typePreference(preferences, key);
          const alias = Object.hasOwn(aliasDrafts, key)
            ? aliasDrafts[key]
            : preference.alias;
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
                <label className="type-toggle">
                  <input type="checkbox" role="switch" aria-label={`允许新建${label(key)}`}
                    aria-describedby="type-creation-help" checked={preference.create_enabled === true}
                    onChange={(e) => updatePreferences({ ...preferences,
                      [key]: { ...preference, create_enabled: e.target.checked } })} />
                  <span className="type-switch-track" aria-hidden="true" />允许新建
                </label>
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
        清单显示与别名仅影响本机的当前来源，隐藏类型仍会正常同步。同一来源内，同一类型在各空间一并设置。名称实时生效，清空即可恢复原名。
      </p>
    </section>
  );
}
