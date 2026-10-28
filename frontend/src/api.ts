import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  CachedItem,
  ConnectionInfo,
  Snapshot,
  SyncReport,
  WorkflowOptions,
  WorkflowRequest,
  WorkflowResult,
  ItemDetail,
  SourceFields,
  WorkSourceInput,
  ConnectionSettings,
  CatalogRefresh,
} from "./types";

export const desktop = isTauri();
export const refreshWorkspaceCatalog = () =>
  invoke<CatalogRefresh>("refresh_workspace_catalog");
const localTypeOrderKey = "fstodo.type-order";

function readLocalTypeOrder(): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(localTypeOrderKey) || "[]",
    );
    return Array.isArray(value)
      ? value.filter((key): key is string => typeof key === "string")
      : [];
  } catch {
    return [];
  }
}

// 浏览器用于检查布局；真实数据只从桌面 IPC 读取，不注入演示事项。
const browserSnapshot: Snapshot = {
  settings: {
    endpoint: "https://project.feishu.cn/mcp_server/v1",
  },
  items: [],
  total: 0,
  last_success: null,
  runs: [],
  sources: [],
  type_order: [],
  config_path: "%APPDATA%\\FSTODO\\config.toml",
  db_path: "%LOCALAPPDATA%\\FSTODO\\fstodo.db",
  credential_ready: false,
  credential_description: "浏览器预览无法读取本地凭证",
};
export const loadSnapshot = async () => {
  const snapshot = desktop
    ? await invoke<Snapshot>("load_snapshot")
    : browserSnapshot;
  const localOrder = readLocalTypeOrder();
  if (snapshot.capabilities?.type_order) {
    return snapshot.type_order?.length || !localOrder.length
      ? snapshot
      : { ...snapshot, type_order: localOrder };
  }
  return { ...snapshot, type_order: localOrder };
};
export const syncTodos = (sourceId: string, automatic = false, sourceIds?: string[]) =>
  invoke<SyncReport>("sync_todos", { sourceId, automatic, ...(sourceIds ? { sourceIds } : {}) });
export const refreshSourceTypes = (sourceId: string) =>
  invoke<{ discovered_count: number; failed: [string, string][] }>(
    "refresh_source_types",
    { sourceId },
  );
export const saveSourceTypes = (sourceId: string, typeKeys: string[]) =>
  invoke<number>("save_source_types", { sourceId, typeKeys });
export const clearSourceTypes = (sourceId: string) =>
  invoke<boolean>("clear_source_types", { sourceId });
export const saveTypeOrder = async (
  typeKeys: string[],
  backendSupported: boolean,
) => {
  if (backendSupported) {
    await invoke<void>("save_type_order", { typeKeys });
    return;
  }
  localStorage.setItem(localTypeOrderKey, JSON.stringify(typeKeys));
};
export const checkConnection = () => invoke<ConnectionInfo>("check_connection");
export const saveToken = (token: string) =>
  invoke<string>("save_token", { token });
export const saveConnectionSettings = (settings: ConnectionSettings) =>
  invoke<void>("save_connection_settings", { settings });

export const cachedItemDetail = (itemId: CachedItem["id"]) =>
  invoke<ItemDetail | null>("cached_item_detail", { itemId });
export const refreshItemDetail = (itemId: CachedItem["id"]) =>
  invoke<ItemDetail>("refresh_item_detail", { itemId });
export const loadFieldImage = (
  itemId: CachedItem["id"],
  fieldKey: string,
  url: string,
  refresh = false,
) => invoke<string>("load_field_image", { itemId, fieldKey, url, refresh });
export const discoverSourceFields = (projectKey: string, typeKey: string) =>
  invoke<SourceFields>("discover_source_fields", { projectKey, typeKey });
export const saveWorkSource = (source: WorkSourceInput) =>
  invoke<void>("save_work_source", { source });
export const removeWorkSource = (sourceId: string) =>
  invoke<void>("remove_work_source", { sourceId });
export const setWorkSourceEnabled = (sourceId: string, enabled: boolean) =>
  invoke<void>("set_work_source_enabled", { sourceId, enabled });

export const getWorkflowActions = (itemId: CachedItem["id"], fresh = false) =>
  invoke<WorkflowOptions>("get_workflow_actions", { itemId, fresh });
export const executeWorkflowAction = (request: WorkflowRequest) =>
  invoke<WorkflowResult>("execute_workflow_action", { request });
