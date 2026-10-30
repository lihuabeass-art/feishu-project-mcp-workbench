export type FlowKind = "node" | "state" | "both" | "none";
export interface RelatedProject {
  field_key: string;
  id: string;
  name: string;
}
export interface SpaceCatalog {
  project_key: string;
  name: string | null;
  simple_name: string | null;
  projects: (RelatedProject & { type_key: string })[];
}
export interface CatalogRefresh {
  spaces: SpaceCatalog[];
  warnings: string[];
}
export interface CachedItem {
  // 旧版桌面后端不返回此字段。
  source_ids?: string[];
  personal_flows?: Record<string, CachedItem["flow"]>;
  personal_schedules?: Record<string, CachedItem["schedule"]>;
  id: {
    project_key: string | null;
    work_item_type_key: string | null;
    work_item_id: string;
  };
  project_name: string | null;
  related_projects?: RelatedProject[];
  name: string | null;
  // 来自飞书完整详情；旧版后端或缺失详情时可能未提供。
  created_at_ms?: number | null;
  updated_at_ms?: number | null;
  is_completed?: boolean | null;
  // 完整详情内容版本，用于回读已落库的新详情；不随抓取时间变化。
  detail_revision?: string | null;
  flow: {
    kind: FlowKind;
    node_name: string | null;
    node_state_key: string | null;
    start_state_key_name: string | null;
    end_state_key_name: string | null;
  };
  schedule: { start_raw: string | null; end_raw: string | null };
  raw_json: string;
  identity_missing_flags: string[];
  first_seen_at_ms: number;
  last_seen_at_ms: number;
  seen_count: number;
}
export interface SyncRun {
  id: number;
  started_at_ms: number;
  finished_at_ms: number | null;
  action: string;
  todo_scope: string | null;
  status: "running" | "success" | "failed";
  pages_fetched: number;
  items_received: number;
  items_upserted: number;
  items_rejected: number;
  remote_total: number | null;
  stop_reason: string | null;
  error_kind: string | null;
  error_message: string | null;
  rejection_detail: string | null;
  // 后端 v3 起附带；界面不展示同步台账，这里只是把 IPC 契约写全。
  trigger?: "manual" | "automatic";
  source_id?: string | null;
  items_out_of_scope?: number;
}
export interface Source {
  id: string;
  builtin_key?: string | null;
  display_name?: string | null;
  kind: string;
  enabled: boolean;
  executable: boolean;
  reason: string | null;
  action: string | null;
  todo_scope: string | null;
  type_scope?: SourceTypeScope;
  asset_key?: string | null;
  project_key?: string | null;
  work_item_type_key?: string | null;
  view_id?: string | null;
  association_rule?: string | null;
}
export interface SourceTypeScope {
  configured: boolean;
  selected_count: number;
  types: Array<{
    project_key: string;
    project_name: string;
    type_key: string;
    type_name: string;
    selected: boolean;
  }>;
}
export interface ConnectionSettings {
  endpoint: string;
}
export interface Snapshot {
  settings?: ConnectionSettings;
  capabilities?: {
    workflow: boolean;
    source_queries?: boolean;
    incremental_sync?: boolean;
    details?: boolean;
    type_order?: boolean;
    source_type_preferences?: boolean;
    workspace_catalog?: boolean;
  };
  items: CachedItem[];
  total: number;
  last_success: SyncRun | null;
  runs: SyncRun[];
  sources: Source[];
  type_order?: string[];
  source_type_preferences?: import("./preferences").SourceTypePreferences | null;
  workspace_catalog?: SpaceCatalog[];
  config_path: string;
  db_path: string;
  credential_ready: boolean;
  credential_description: string;
}
export interface ItemPatch {
  // 本地上下文补齐也可能需要传输 modified；更新提示只统计已确认的业务变化。
  updated_count?: number;
  added: CachedItem[];
  modified: CachedItem[];
  removed: CachedItem["id"][];
}
export interface SyncReport {
  patch?: ItemPatch;
  checks?: { source_id: string; report: SyncReport | null; error_kind: string | null; error_message: string | null }[];
  total?: number;
  runs?: SyncRun[];
  last_success?: SyncRun | null;
  status: "success" | "failed";
  complete: boolean;
  items_upserted: number;
  items_inserted: number;
  items_updated: number;
  items_rejected: number;
  stop_reason: string;
  // 后端 v3 起附带；旧后端不返回时按未知处理。
  run_id?: number;
  trigger?: "manual" | "automatic";
  source_id?: string | null;
  items_out_of_scope?: number;
}
export interface ConnectionInfo {
  session_established: boolean;
  server_name: string | null;
  server_version: string | null;
}

export interface ItemDetail {
  id: CachedItem["id"];
  fetched_at_ms: number;
  data: {
    work_item_attribute: Record<string, unknown>;
    work_item_current_node?: Array<Record<string, unknown>>;
    work_item_fields: Array<{ key: string; name?: string; value?: unknown }>;
  };
  pages: unknown[];
}
export interface SourceFields {
  fields: Array<{ field_key: string; field_name: string; field_type: string }>;
  roles: Array<{ role_id: string; role_name: string }>;
}
export interface WorkSourceInput {
  id: string;
  builtin_key?: string;
  display_name?: string;
  kind: string;
  enabled: boolean;
  project_key?: string;
  work_item_type_key?: string;
  view_id?: string;
  action?: string;
  todo_scope?: string;
  asset_key?: string;
  association_rule?: string;
}
export interface AppError {
  kind: string;
  message: string;
}

export interface WorkflowAction {
  id: string;
  label: string;
  kind: "node" | "state";
  description?: string;
  disabled_reason?: string;
  fields: Array<{
    key: string;
    label: string;
    kind: "text" | "textarea" | "select" | "number" | "date";
    required: boolean;
    initial_value?: string;
    read_only?: boolean;
    scope?: "work_item" | "node" | "assignee";
    min?: number;
    max?: number;
    step?: number;
    unit?: "percent";
    hint?: string;
    owner?: string;
    column?: string;
    options?: Array<{ value: string; label: string }>;
  }>;
}
export interface WorkflowOptions {
  version: string;
  actions: WorkflowAction[];
}
export interface WorkflowRequest {
  item_id: CachedItem["id"];
  action_id: string;
  version: string;
  request_id: string;
  // 仅包含本次实际修改的非空字段；缺省字段保留云端值。
  fields: Record<string, string>;
}

// 三种结论在后端是不同的事实，界面不能把 unknown 当成失败。
export interface WorkflowResult {
  outcome: "verified" | "failed" | "unknown";
  verified: boolean;
  message: string;
  request_id: string;
  action_id: string;
  resynced: boolean;
}
