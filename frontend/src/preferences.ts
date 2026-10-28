import { invoke } from "@tauri-apps/api/core";
import type { Snapshot } from "./types";

export interface TypePreference {
  enabled: boolean;
  alias: string;
}
export type TypePreferences = Record<string, TypePreference>;
export type SourceTypePreferences = Record<string, TypePreferences>;
const key = "fstodo.type-preferences.v1";
const sourceKey = "fstodo.source-type-preferences.v2";

function validPreferences(value: unknown): TypePreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) =>
        entry &&
        typeof entry.enabled === "boolean" &&
        typeof entry.alias === "string",
    ),
  );
}

export function loadTypePreferences(): TypePreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || "{}");
    return validPreferences(value);
  } catch {
    return {};
  }
}
export function loadSourceTypePreferences(
  sourceIds: string[],
): SourceTypePreferences {
  try {
    const stored = localStorage.getItem(sourceKey);
    if (stored !== null) {
      const value: unknown = JSON.parse(stored);
      if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
      return Object.fromEntries(
        Object.entries(value).map(([id, preferences]) => [
          id,
          validPreferences(preferences),
        ]),
      );
    }
  } catch {
    return {};
  }
  // 旧版无法判断配置原本属于哪个来源，首次编辑前为现有来源各自复制一份。
  const legacy = loadTypePreferences();
  return Object.fromEntries(
    sourceIds.map((id) => [id, structuredClone(legacy)]),
  );
}

export function saveSourceTypePreferences(value: SourceTypePreferences) {
  localStorage.setItem(sourceKey, JSON.stringify(value));
}

let pendingSave: Promise<void> = Promise.resolve();

export function flushSourceTypePreferences() {
  return pendingSave;
}

export async function restoreSourceTypePreferences(
  snapshot: Snapshot,
): Promise<SourceTypePreferences> {
  if (!snapshot.capabilities?.source_type_preferences)
    return loadSourceTypePreferences(
      snapshot.sources.map((source) => source.id),
    );
  if (snapshot.source_type_preferences != null)
    return snapshot.source_type_preferences;
  // 旧界面缓存只在数据库尚未初始化时导入，之后以数据库为准。
  return invoke<SourceTypePreferences>("initialize_source_type_preferences", {
    preferences: loadSourceTypePreferences(
      snapshot.sources.map((source) => source.id),
    ),
  });
}

export function persistSourceTypePreferences(
  sourceId: string,
  preferences: TypePreferences,
) {
  const value = structuredClone(preferences);
  const saved = pendingSave.then(() =>
    invoke<void>("save_source_type_preferences", {
      sourceId,
      preferences: value,
    }),
  );
  // 连续切换与别名输入依次落库；一次失败不能阻塞之后的保存。
  pendingSave = saved.catch(() => {});
  return saved;
}

export function sourceTypePreferences(
  value: SourceTypePreferences,
  id: string,
): TypePreferences {
  return Object.hasOwn(value, id) ? value[id] : {};
}
export function typePreference(
  value: TypePreferences,
  key: string,
): TypePreference {
  return Object.hasOwn(value, key) ? value[key] : { enabled: true, alias: "" };
}
