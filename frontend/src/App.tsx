import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppVersion } from "./AppVersion";
import { AppUpdateDialog, AppUpdateSettings } from "./AppUpdater";
import { useAppUpdater } from "./useAppUpdater";
import { prepareUpdateInstallation } from "./appUpdateSafety";
import { workspaceActionBlocked, type WorkspaceActivity } from "./operationPolicy";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Bug,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cloud,
  FileText,
  Plus,
  FolderOpen,
  Inbox,
  Layers3,
  Leaf,
  Link2,
  LoaderCircle,
  PictureInPicture2,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Unplug,
  X,
} from "lucide-react";
import {
  checkConnection,
  desktop,
  loadSnapshot,
  refreshWorkspaceCatalog,
  saveTypeOrder,
  executeWorkflowAction,
  saveToken,
  saveConnectionSettings,
  syncTodos,
} from "./api";
import {
  asError,
  errorKindLabel,
  flowLabel,
  itemKey,
  localTime,
  nodeScopeLabel,
  stopLabel,
  typeLabel,
  orderTypeKeys,
  orderWorkItems,
  typeColorStyle,
} from "./model";
import { typeReorderHint, useTypeReorder } from "./useTypeReorder";
import { applySourceTypeNames, typeNameConnection, typeNameSource, useSourceTypeNames } from "./useSourceTypeNames";
import type { AppError, CachedItem, ConnectionSettings as Settings, Snapshot, WorkflowRequest, WorkflowResult } from "./types";
import { Workflow } from "./Workflow";
import { SourceTypes } from "./SourceTypes";
import { CreateWorkItem } from "./CreateWorkItem";
import { creationLocations, getPendingCreations, type CreationForm, type CreationLocation } from "./creation";
import { WorkSources } from "./WorkSources";
import { sourceName, sourceProjects } from "./sourcePresets";
import { WorkItemDetails } from "./WorkItemDetails";
import { readFailureMessage, readFailureNeedsAction } from "./readFeedback";
import { Select } from "./Select";
import { LinkSettings } from "./LinkSettings";
import { WorkflowSettings } from "./WorkflowSettings";
import { SettingsPage } from "./SettingsPage";
import { DesktopSettings, useDesktopSettings } from "./DesktopSettings";
import { ConnectionSettings } from "./ConnectionSettings";
import { McpTokenGuide } from "./McpTokenGuide";
import { McpConnectionStatus, type ConnectionCheckResult } from "./McpConnectionStatus";
import { SettingsSaveStatus, type SaveFeedback } from "./SettingsSaveStatus";
import { ThemeProvider } from "./ThemeProvider";
import { ThemeControl } from "./ThemeControl";
import { CompactWorkspace } from "./CompactWorkspace";
import { WorkTypeTabs } from "./WorkTypeTabs";
import { FilterSchemeMenu } from "./FilterSchemeMenu";
import { WorkFilterToolbar } from "./WorkFilterToolbar";
import { useFilterSchemes } from "./useFilterSchemes";
import {
  emptyWorkFilters, filterWorkItems,
  workFilterCount, workFilterOptions,
} from "./workFilters";
import { useDisplayMode } from "./displayMode";
import {
  flushSourceTypePreferences,
  restoreSourceTypePreferences,
  persistSourceTypePreferences,
  saveSourceTypePreferences,
  sourceTypePreferences,
  typePreference,
  type TypePreferences,
  type SourceTypePreferences,
} from "./preferences";
import {
  freshPolicy,
  loadSyncPolicies,
  nextSyncPolicy,
  retryFailedPolicies,
  saveSyncPolicies,
} from "./syncPolicy";

type View = "work" | "sources" | "settings";
type Notice = { tone: "success" | "warning"; text: string };
type WorkflowReport = { item: string; message: string; error?: AppError };
function WorkflowSuccessToast({ id, report, dismiss }: { id: string; report: WorkflowReport; dismiss: (id: string, report: WorkflowReport) => void }) {
  useEffect(() => {
    let timer: number | undefined;
    const update = () => {
      if (document.querySelector("dialog[open]")) {
        window.clearTimeout(timer);
        timer = undefined;
      } else if (timer === undefined) {
        timer = window.setTimeout(() => dismiss(id, report), 5000);
      }
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    update();
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, [id, report, dismiss]);
  return <div className="banner success workflow-toast" role="status">
    <Check size={17} />
    <div><strong>{report.item} · 流程操作已完成</strong><p>{report.message}</p></div>
    <button className="icon-button" aria-label={`关闭${report.item}的流程操作提示`} onClick={() => dismiss(id, report)}><X size={16} /></button>
  </div>;
}
type CreationRecordFeedback = { context: string; result: "empty" } |
  { context: string; result: "failed"; error: AppError };
type ManualSync = {
  requested: Set<string>;
  remaining: Set<string>;
  failures: Map<string, AppError>;
  results: string[];
  workflowAttempt: number;
  workflowInFlight: boolean;
};

function Flow({ item }: { item: CachedItem }) {
  const f = item.flow;
  return (
    <div className="flow-lines">
      {(f.kind === "node" || f.kind === "both") && (
        <span title={nodeScopeLabel(item)}>
          <i className="status-dot" />
          {f.node_name || "名称未提供"}
          {f.node_state_key && <small>{f.node_state_key}</small>}
        </span>
      )}
      {(f.kind === "state" || f.kind === "both") && (
        <span>
          <i className="status-dot amber" />
          状态 · {f.start_state_key_name || "未提供"}
          {f.end_state_key_name && (
            <>
              <ArrowRight size={12} />
              {f.end_state_key_name}
            </>
          )}
        </span>
      )}
      {f.kind === "none" && <span className="muted">流程信息未提供</span>}
    </div>
  );
}

function Detail({
  item,
  close,
  label,
  workflowAvailable,
  detailsAvailable,
  onDetailRefreshed,
  busy,
  submit,
  compact = false,
}: {
  item: CachedItem;
  close: () => void;
  label: string;
  workflowAvailable: boolean;
  detailsAvailable: boolean;
  onDetailRefreshed: () => Promise<void>;
  busy: boolean;
  submit: (request: WorkflowRequest) => Promise<WorkflowResult | undefined>;
  compact?: boolean;
}) {
  return (
    <aside className="detail" aria-label="事项详情">
      {compact ? (
        <div className="detail-top">
          <button className="icon-button" aria-label="返回清单" title="返回清单（Esc）" onClick={close}>
            <ArrowLeft size={17} />
          </button>
          <span>事项详情</span>
        </div>
      ) : (
        <div className="detail-top">
          <span>事项详情</span>
          <button className="icon-button" aria-label="关闭详情" onClick={close}>
            <X size={18} />
          </button>
        </div>
      )}
      <div className="detail-content">
        <span
          className="type-tag"
          style={typeColorStyle(item.id.work_item_type_key)}
        >
          {label}
        </span>
        <h2>{item.name || "名称未提供"}</h2>
        <p className="item-id">
          #{item.id.work_item_id} · {item.project_name || "空间名称未提供"}
        </p>
        <div className="detail-section">
          <h3>节点与状态</h3>
          <Flow item={item} />
        </div>
        {(item.schedule.start_raw || item.schedule.end_raw) && (
          <div className="detail-section">
            <h3>排期原文</h3>
            <dl>
              <dt>开始</dt>
              <dd>{item.schedule.start_raw || "未提供"}</dd>
              <dt>结束</dt>
              <dd>{item.schedule.end_raw || "未提供"}</dd>
            </dl>
            <p className="hint">时间单位尚未确认，保留飞书返回值。</p>
          </div>
        )}
        <WorkItemDetails item={item} enabled={detailsAvailable} onRefreshed={onDetailRefreshed} />
        <Workflow
          item={item}
          available={workflowAvailable}
          busy={busy}
          submit={submit}
        />
        <details className="detail-section tech-info">
          <summary>技术信息</summary>
          <dl>
            <dt>空间标识</dt>
            <dd>{item.id.project_key || "未提供"}</dd>
            <dt>类型标识</dt>
            <dd>{item.id.work_item_type_key || "未提供"}</dd>
            <dt>流程模型</dt>
            <dd>{flowLabel[item.flow.kind]}</dd>
            <dt>最近取得</dt>
            <dd>{localTime(item.last_seen_at_ms)}</dd>
          </dl>
        </details>
        {item.identity_missing_flags.length > 0 && (
          <p className="hint">
            部分身份字段未提供：{item.identity_missing_flags.join("、")}
          </p>
        )}
      </div>
    </aside>
  );
}

export default function App() {
  return <ThemeProvider><Workspace /></ThemeProvider>;
}

function Workspace() {
  const desktopSettings = useDesktopSettings();
  const [data, setData] = useState<Snapshot | null>(null);
  const [view, setView] = useState<View>("work");
  const [loading, setLoading] = useState(true);
  const [contextOperation, setContextOperation] = useState<
    "save" | "settings" | "update" | null
  >(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [checkBusy, setCheckBusy] = useState(false);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const workflowSubmissions = useRef(new Set<string>());
  const [workflowReports, setWorkflowReports] = useState<Record<string, WorkflowReport>>({});
  const dismissWorkflowReport = useCallback((id: string, report: WorkflowReport) => {
    setWorkflowReports((current) => {
      if (current[id] !== report) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);
  const [creationOpen, setCreationOpen] = useState(false);
  const [creationBusy, setCreationBusy] = useState(false);
  const [creationRecovery, setCreationRecovery] = useState(false);
  const [creationRecords, setCreationRecords] = useState<{ context: string; forms: CreationForm[]; failed: boolean }>({ context: "", forms: [], failed: false });
  const [creationRecordFeedback, setCreationRecordFeedback] = useState<CreationRecordFeedback | null>(null);
  const [tokenDraft, setTokenDraft] = useState("");
  const [tokenGuideOpen, setTokenGuideOpen] = useState(false);
  const [connectionCheck, setConnectionCheck] = useState<ConnectionCheckResult | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [typeOperationErrors, setTypeOperationErrors] = useState<Partial<Record<"order" | "discovery", AppError>>>({});
  const [settingsRefreshFailed, setSettingsRefreshFailed] = useState(false);
  const [connectionFeedback, setConnectionFeedback] = useState<SaveFeedback | null>(null);
  const [connectionUnsaved, setConnectionUnsaved] = useState(false);
  const [linkFeedback, setLinkFeedback] = useState<SaveFeedback | null>(null);
  const [workflowFeedback, setWorkflowFeedback] = useState<SaveFeedback | null>(null);
  const [desktopFeedback, setDesktopFeedback] = useState<SaveFeedback | null>(null);
  const [credentialFeedback, setCredentialFeedback] = useState<SaveFeedback | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [syncFailure, setSyncFailure] = useState<string | null>(null);
  const syncFailures = useRef(new Map<string, { kind: string; dismissed: boolean }>());
  const [sourceReadFailures, setSourceReadFailures] = useState<Record<string, string>>({});
  const displayMode = useDisplayMode((message) => setError({ kind: "window", message }));
  const compact = displayMode.mode === "compact";
  const compactRef = useRef(compact);
  compactRef.current = compact;
  const [sourcePreferences, setSourcePreferences] = useState<SourceTypePreferences>({});
  const confirmedPreferences = useRef<SourceTypePreferences>({});
  const preferenceRevision = useRef(0);
  const sourcePreferenceRevisions = useRef<Record<string, number>>({});
  const [policies, setPolicies] = useState(loadSyncPolicies);
  const [fallbackPolicy] = useState(freshPolicy);
  const [sourceId, setSourceId] = useState("");
  const [filters, setFilters] = useState(emptyWorkFilters);
  const { query, type, space: project } = filters;
  const setQuery = (query: string) => setFilters((current) => ({ ...current, query }));
  const setType = (type: string[]) => setFilters((current) => ({ ...current, type }));
  const [pendingType, setPendingType] = useState<string | null>(null);
  const [catalogEpoch, setCatalogEpoch] = useState(0);
  const [catalogWarning, setCatalogWarning] = useState("");
  const catalogRequest = useRef(0);
  const catalogInFlight = useRef<{
    scope: string;
    promise: ReturnType<typeof refreshWorkspaceCatalog>;
  } | null>(null);
  const refreshCatalogAfterSync = useRef(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const contextRef = useRef(false);
  const syncRef = useRef(false);
  const checkRef = useRef(false);
  const discoveryRef = useRef(false);
  const orderRef = useRef(false);
  const workflowRef = useRef(false);
  const creationRef = useRef(false);
  const activity: WorkspaceActivity = { context: !!contextOperation, sync: syncBusy, check: checkBusy,
    discovery: discoveryBusy, order: orderBusy, workflow: workflowBusy, creation: creationBusy };
  const currentActivity = (): WorkspaceActivity => ({ context: contextRef.current, sync: syncRef.current,
    check: checkRef.current, discovery: discoveryRef.current, order: orderRef.current,
    workflow: workflowRef.current, creation: creationRef.current });
  const contextChangeDisabled = workspaceActionBlocked("context", activity) || loading;
  const creationDisabled = workspaceActionBlocked("creation", activity) || loading;
  const updater = useAppUpdater({ prepareInstall: () => {
    if (workspaceActionBlocked("context", currentActivity()))
      throw new Error("当前操作尚未结束，请先关闭新建窗口，并等待同步、保存或流程提交完成后再安装。");
    return prepareUpdateInstallation({
    busy: contextRef,
    workflow: workflowRef,
    blockedReason: loading || desktopSettings.busy || displayMode.busy
      ? "当前页面或窗口设置尚未就绪，请稍后再安装。"
      : connectionUnsaved
        ? "MCP 服务地址尚未保存，请先保存或恢复原值后再安装。"
      : tokenDraft.trim()
        ? "Token 输入尚未保存，请先保存或清空输入后再安装。"
        : [connectionFeedback, linkFeedback, workflowFeedback, desktopFeedback, credentialFeedback].some((feedback) =>
          feedback && ["waiting", "saving", "invalid", "failed"].includes(feedback.state))
          ? "设置尚未保存成功，请先完成保存或处理错误后再安装。"
          : undefined,
    onBusyChange: (locked) => setContextOperation(locked ? "update" : null),
    flush: async () => {
      await flushSourceTypePreferences();
      await invoke("prepare_app_update");
    },
    });
  } });
  const workflowAttempt = useRef(0);
  const snapshotRequest = useRef(0);
  const syncPatchRevision = useRef(0);
  const syncProgressAbort = useRef<AbortController | null>(null);
  useEffect(() => () => { syncProgressAbort.current?.abort(); }, []);
  const syncConfiguration = (snapshot: Snapshot) => JSON.stringify([
    snapshot.config_path, snapshot.db_path, snapshot.settings?.endpoint,
    credentialRevision,
  ]);
  const activeSyncConfiguration = useRef<string | null>(null);
  const typeNamesRevision = useRef(0);
  const typeOrderRevision = useRef(0);
  const [credentialRevision, setCredentialRevision] = useState(0);
  const filterSchemes = useFilterSchemes({
    enabled: desktop && !!data?.capabilities?.filter_schemes && !!data.credential_ready,
    context: JSON.stringify([credentialRevision, data?.settings?.endpoint, data?.db_path]),
    active: view === "work" || compact,
    filters,
    apply: (next) => { setPendingType(null); setFilters(next); },
  });
  const receiveTypeNames = useCallback((sourceId: string, types: Parameters<typeof applySourceTypeNames>[2], context: Snapshot) => {
    ++typeNamesRevision.current;
    setData((current) => {
      const source = current?.sources.find((entry) => entry.id === sourceId);
      const original = context.sources.find((entry) => entry.id === sourceId);
      return current && source && original && typeNameConnection(current) === typeNameConnection(context) &&
        typeNameSource(source) === typeNameSource(original) ? applySourceTypeNames(current, sourceId, types) : current;
    });
  }, []);
  const typeNames = useSourceTypeNames(data, desktop && !loading, credentialRevision, receiveTypeNames);
  const searchRef = useRef<HTMLInputElement>(null);
  const autoRunRef = useRef<() => void>(() => {});
  const activeSyncIds = useRef<string[]>([]);
  const postWriteWaiters = useRef<Array<{ resolve: () => void; reject: (error: unknown) => void }>>([]);
  const postWriteRunning = useRef(false);
  const drainPostWrite = useRef<() => void>(() => {});
  useEffect(() => {
    if (syncProgressAbort.current && data && activeSyncConfiguration.current !== syncConfiguration(data))
      syncProgressAbort.current.abort();
  }, [data, credentialRevision]);
  const pendingManual = useRef(new Set<string>());
  const manualSync = useRef<ManualSync | null>(null);
  const incremental = !!data?.capabilities?.incremental_sync;
  const enabledIds = data?.sources.filter((s) => s.enabled && s.executable).map((s) => s.id) || [];
  const policy = Object.hasOwn(policies, sourceId)
    ? policies[sourceId]
    : fallbackPolicy;

  function updatePreferences(next: TypePreferences) {
    if (!sourceId || sourceId === "*") return;
    try {
      const updated = { ...sourcePreferences, [sourceId]: next };
      const durable = !!data?.capabilities?.source_type_preferences;
      if (!durable) saveSourceTypePreferences(updated);
      const revision = ++preferenceRevision.current;
      sourcePreferenceRevisions.current[sourceId] = revision;
      setSourcePreferences(updated);
      setType([]);
      if (durable) {
        const id = sourceId;
        void persistSourceTypePreferences(id, next).then(() => {
          confirmedPreferences.current = { ...confirmedPreferences.current, [id]: next };
          // 保留旧版兼容缓存；缓存不可用不影响数据库中的保存结果。
          try { saveSourceTypePreferences(confirmedPreferences.current); } catch { /* best effort */ }
        }).catch(() => {
          if (sourcePreferenceRevisions.current[id] === revision) {
            setSourcePreferences((current) => ({
              ...current,
              [id]: sourceTypePreferences(confirmedPreferences.current, id),
            }));
          }
          setError({ kind: "storage", message: "类型偏好保存失败，请检查本机存储后重试。" });
        });
      } else {
        confirmedPreferences.current = updated;
      }
    } catch {
      setError({
        kind: "storage",
        message: "类型偏好保存失败，请检查本机存储后重试。",
      });
    }
  }
  async function updateTypeOrder(next: string[]) {
    if (workspaceActionBlocked("order", currentActivity()) || !desktop) return;
    const previous = data?.type_order || [];
    orderRef.current = true;
    setOrderBusy(true);
    ++typeOrderRevision.current;
    setTypeOperationErrors((current) => ({ ...current, order: undefined }));
    setData((current) =>
      current ? { ...current, type_order: next } : current,
    );
    try {
      await saveTypeOrder(next, data?.capabilities?.type_order === true);
    } catch (e) {
      setData((current) =>
        current ? { ...current, type_order: previous } : current,
      );
      setTypeOperationErrors((current) => ({ ...current, order: asError(e) }));
    } finally {
      ++typeOrderRevision.current;
      orderRef.current = false;
      setOrderBusy(false);
    }
  }
  function updatePolicy(kind?: string, id = sourceId) {
    setPolicies((previous) => ({
      ...previous,
      [id]: nextSyncPolicy(
        Object.hasOwn(previous, id) ? previous[id] : fallbackPolicy,
        kind,
      ),
    }));
  }

  const reload = useCallback(async () => {
    const request = ++snapshotRequest.current;
    ++catalogRequest.current;
    const patchRevision = syncPatchRevision.current;
    const namesRevision = typeNamesRevision.current;
    const orderRevision = typeOrderRevision.current;
    const preferencesRevision = preferenceRevision.current;
    await flushSourceTypePreferences();
    const snapshot = await loadSnapshot();
    const preferences = await restoreSourceTypePreferences(snapshot);
    if (request !== snapshotRequest.current) return;
    if (preferencesRevision === preferenceRevision.current) {
      confirmedPreferences.current = preferences;
      setSourcePreferences(preferences);
    }
    setCatalogEpoch((value) => value + 1);
    setSettingsRefreshFailed(false);
    // 配置回读仍须生效，但不能覆盖读取期间已应用的同步事项补丁。
    const patchedDuringRead = patchRevision !== syncPatchRevision.current;
    setData((current) => {
      let next = current && patchedDuringRead ? {
        ...snapshot,
        items: current.items,
        total: current.total,
        runs: current.runs,
        last_success: current.last_success,
      } : snapshot;
      // 回读开始后取得的新名称不能被较早读取的目录覆盖；范围和偏好仍采用回读结果。
      if (current && namesRevision !== typeNamesRevision.current && typeNameConnection(current) === typeNameConnection(snapshot)) {
        for (const source of current.sources) {
          const original = snapshot.sources.find((entry) => entry.id === source.id);
          if (source.type_scope && original && typeNameSource(source) === typeNameSource(original))
            next = applySourceTypeNames(next, source.id, source.type_scope);
        }
      }
      if (current && (orderRef.current || orderRevision !== typeOrderRevision.current))
        next = { ...next, type_order: current.type_order };
      return next;
    });
    setSourceId((previous) => {
      const executable = snapshot.sources.filter((s) => s.executable);
      return (previous === "*" && snapshot.capabilities?.source_queries && executable.length > 0) || executable.some((s) => s.id === previous)
        ? previous
        : executable.length === 1
          ? executable[0].id
          : snapshot.capabilities?.source_queries && executable.length > 0 ? "*" : "";
    });
  }, []);
  async function readCache() {
    setLoading(true);
    setError(null);
    try {
      await reload();
    } catch (e) {
      setError(asError(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void readCache();
  }, []);
  const catalogSignature = JSON.stringify([...new Set([
    ...(data?.items || []).map((item) => JSON.stringify([item.id.project_key, item.id.work_item_type_key])),
    ...(data?.sources || []).flatMap((source) => [
      JSON.stringify([source.project_key, source.work_item_type_key]),
      ...(source.type_scope?.types || []).map((kind) => JSON.stringify([kind.project_key, kind.type_key])),
    ]),
  ])].sort());
  const catalogScope = JSON.stringify([catalogSignature, data?.settings, data?.db_path]);
  useEffect(() => {
    if (!desktop || !data?.capabilities?.workspace_catalog || !data.credential_ready) return;
    const request = ++catalogRequest.current;
    let cancelled = false;
    // 自动读取与统一刷新入口共用同一范围内尚未结束的目录请求。
    if (catalogInFlight.current?.scope !== catalogScope)
      catalogInFlight.current = { scope: catalogScope, promise: refreshWorkspaceCatalog() };
    const task = catalogInFlight.current;
    void task.promise.then((result) => {
      if (cancelled || request !== catalogRequest.current) return;
      setData((current) => current ? { ...current, workspace_catalog: result.spaces } : current);
      const kinds = result.warning_kinds?.length ? result.warning_kinds : result.warnings.length ? ["unknown"] : [];
      setCatalogWarning(kinds.length
        ? `空间与项目目录未刷新，已保留现有内容：${[...new Set(kinds.map(readFailureMessage))].join("；")}。`
        : "");
    }).catch((error) => {
      if (!cancelled && request === catalogRequest.current)
        setCatalogWarning(`空间与项目目录未刷新，已保留现有内容：${readFailureMessage(asError(error).kind)}。`);
    }).finally(() => {
      if (catalogInFlight.current === task) catalogInFlight.current = null;
    });
    return () => { cancelled = true; };
  }, [catalogEpoch, catalogScope, data?.capabilities?.workspace_catalog, data?.credential_ready]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedKey(null);
      if ((event.ctrlKey || event.metaKey) && event.key === "k" && !compactRef.current) {
        event.preventDefault();
        setView("work");
        setSearchFocusRequest((value) => value + 1);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  useEffect(() => {
    if (searchFocusRequest) searchRef.current?.focus();
  }, [searchFocusRequest]);
  useEffect(() => {
    if (view !== "settings") setTokenDraft("");
  }, [view]);
  useEffect(() => {
    if (pendingType === null) return;
    if (view !== "work" || (pendingType ? type.length === 1 && pendingType === type[0] : type.length === 0)) {
      setPendingType(null);
      return;
    }
    const scroller = document.scrollingElement || document.documentElement;
    const startTop = scroller.scrollTop;
    const finish = () => {
      setType(pendingType ? [pendingType] : []);
      setPendingType(null);
    };
    if (
      startTop <= 0 || compact ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      scroller.scrollTop = 0;
      finish();
      return;
    }
    // 保留旧清单高度，先回顶再筛选，避免短清单让浏览器瞬间钳制滚动位置。
    const startedAt = performance.now();
    let frame: number;
    const step = (now: number) => {
      const progress = Math.max(0, Math.min((now - startedAt) / 320, 1));
      scroller.scrollTop = startTop * (1 - progress) ** 3;
      if (progress < 1) frame = requestAnimationFrame(step);
      else finish();
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [pendingType, type, view, compact]);
  useEffect(() => {
    if (notice?.tone !== "success") return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    try {
      saveSyncPolicies(policies);
    } catch {
      setError({
        kind: "storage",
        message: "自动同步状态无法保存，重启后重试计划可能丢失。",
      });
    }
  }, [policies]);
  const automaticReady =
    desktop &&
    !!data?.credential_ready &&
    !!data?.sources.some((s) => (incremental || s.id === sourceId || (sourceId === "*" && data.capabilities?.source_queries)) && s.executable) &&
    !loading;
  useEffect(() => {
    if (!automaticReady || contextOperation || syncBusy) return;
    const ready = incremental
      ? enabledIds.map((id) => policies[id] || fallbackPolicy)
      : [policy];
    if (!ready.length) return;
    const nextAt = Math.min(...ready.map((p) => p.nextAt));
    // 唤醒后最多同步一次，不追赶错过的轮次。互斥锁同时阻止手动/自动重入。
    const timer = window.setTimeout(
      () => autoRunRef.current(),
      Math.max(0, nextAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [automaticReady, contextOperation, syncBusy, policy, sourceId, policies, data, incremental]);
  useEffect(() => {
    if (!automaticReady) return;
    const retry = () => {
      if (navigator.onLine !== false) setPolicies(retryFailedPolicies);
    };
    const visible = () => {
      if (document.visibilityState === "visible") retry();
    };
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [automaticReady]);

  async function saveCredential() {
    if (workspaceActionBlocked("context", currentActivity()) || !desktop || !tokenDraft.trim()) return;
    contextRef.current = true;
    setContextOperation("save");
    setCredentialFeedback({ state: "saving" });
    setError(null);
    setTypeOperationErrors({});
    setCreationRecordFeedback(null);
    setNotice(null);
    try {
      const description = await saveToken(tokenDraft);
      setConnectionCheck(null);
      setTokenDraft("");
      setData((previous) =>
        previous
          ? {
              ...previous,
              credential_ready: true,
              credential_description: description,
            }
          : previous,
      );
      setCredentialFeedback({ state: "saved" });
      setCredentialRevision((value) => value + 1);
      ++catalogRequest.current;
      catalogInFlight.current = null;
      setCatalogEpoch((value) => value + 1);
    } catch (e) {
      // 不回显提交内容；原文只存在当前密码框内。
      setCredentialFeedback({ state: "failed", message: `Token 保存失败：${asError(e).message}` });
    } finally {
      contextRef.current = false;
      setContextOperation(null);
    }
  }

  async function saveSettings(settings: Settings) {
    if (workspaceActionBlocked("context", currentActivity()) || !desktop || loading) return false;
    contextRef.current = true;
    setContextOperation("settings");
    setConnectionFeedback({ state: "saving" });
    setError(null);
    setTypeOperationErrors({});
    setCreationRecordFeedback(null);
    setNotice(null);
    let saved = false;
    try {
      await saveConnectionSettings(settings);
      saved = true;
      setConnectionCheck(null);
      await reload();
      setSelectedKey(null);
      setPolicies(retryFailedPolicies);
      setConnectionFeedback({ state: "saved" });
      return true;
    } catch (e) {
      const failure = asError(e);
      if (saved) {
        // 后端已切换配置，禁止把新数据库的补丁合并到旧数据库快照。
        setData(null);
        setSourceId("");
        setSelectedKey(null);
        setSettingsRefreshFailed(true);
      }
      setConnectionFeedback({ state: "failed", message: saved
        ? `配置已保存，但页面刷新失败：${failure.message}`
        : `应用配置自动保存失败：${failure.message}，修改内容已保留。`,
        retry: saved ? undefined : () => { void saveSettings(settings); },
      });
      return false;
    } finally {
      contextRef.current = false;
      setContextOperation(null);
    }
  }

  function publishSyncFailures() {
    const messages = [...syncFailures.current.values()]
      .filter((failure) => !failure.dismissed)
      .map((failure) => readFailureMessage(failure.kind));
    setSyncFailure(messages.length ? [...new Set(messages)].join("；") + "。" : null);
  }

  function registerManualSync(ids: string[]) {
    manualSync.current ||= {
      requested: new Set(), remaining: new Set(), failures: new Map(), results: [],
      workflowAttempt: workflowAttempt.current, workflowInFlight: workflowRef.current,
    };
    for (const id of ids) {
      if (!manualSync.current.requested.has(id)) manualSync.current.remaining.add(id);
      manualSync.current.requested.add(id);
    }
  }

  async function run(action: "sync" | "check", automatic = false, requestedIds?: string[], afterWrite = false) {
    const ids = requestedIds || (incremental
      ? sourceId === "*" ? enabledIds : enabledIds.filter((id) => id === sourceId)
      : [sourceId]);
    if (action === "sync" && incremental && syncRef.current) {
      if (!automatic && !afterWrite) {
        refreshCatalogAfterSync.current = true;
        registerManualSync(ids);
        ids.filter((id) => manualSync.current!.remaining.has(id) && !activeSyncIds.current.includes(id))
          .forEach((id) => pendingManual.current.add(id));
      }
      return;
    }
    if (action === "sync" && !ids.length) return;
    if (workspaceActionBlocked(action, currentActivity()) || !desktop) return;
    if (action === "sync" && !automatic) {
      refreshCatalogAfterSync.current = true;
      if (!afterWrite) registerManualSync(ids);
    }
    if (action === "sync") {
      syncRef.current = true;
      activeSyncIds.current = ids;
      setSyncBusy(true);
    } else {
      checkRef.current = true;
      setCheckBusy(true);
    }
    const workflowInFlightAtStart = workflowRef.current;
    if (!automatic && !afterWrite && !workflowInFlightAtStart &&
        (!manualSync.current || (!manualSync.current.workflowInFlight && manualSync.current.workflowAttempt === workflowAttempt.current))) {
      setError(null);
      setNotice(null);
    }
    let failure: AppError | null = null;
    let successText = "";
    let patched = false;
    let finalPatchReceived = false;
    let checksReceived = false;
    let cacheReadFailure: AppError | null = null;
    const outcomes = new Map<string, AppError | null>();
    const progressAbort = new AbortController();
    if (workflowInFlightAtStart) progressAbort.abort();
    const patchContext = data && syncConfiguration(data);
    if (action === "sync") activeSyncConfiguration.current = patchContext || null;
    if (action === "sync") syncProgressAbort.current = progressAbort;
    const applyPatch = (report: Pick<import("./types").SyncReport, "patch" | "total" | "runs" | "last_success">) => {
      if (progressAbort.signal.aborted || !report.patch) return;
      patched = true;
      ++syncPatchRevision.current;
      const patch = report.patch;
      const key = (id: CachedItem["id"]) => JSON.stringify([id.project_key, id.work_item_type_key, id.work_item_id]);
      setData((current) => {
        if (!current || syncConfiguration(current) !== patchContext) return current;
        const removed = new Set(patch.removed.map(key));
        const changes = new Map([...patch.added, ...patch.modified].map((item) => [key(item.id), item]));
        const items = patch.added.length || patch.modified.length || patch.removed.length
          ? current.items.filter((item) => !removed.has(key(item.id))).map((item) => {
              const next = changes.get(key(item.id));
              changes.delete(key(item.id));
              return next || item;
            }).concat([...changes.values()]) : current.items;
        return { ...current, items, total: report.total ?? items.length,
          runs: report.runs ?? current.runs,
          last_success: report.last_success === undefined ? current.last_success : report.last_success };
      });
    };
    try {
      if (action === "sync") {
        const report = afterWrite ? await syncTodos("*", false, ids) : incremental
          ? data?.capabilities?.progressive_sync && !workflowInFlightAtStart
            ? await syncTodos("*", automatic, ids, { receive: applyPatch, signal: progressAbort.signal })
            : await syncTodos("*", automatic, ids)
          : await syncTodos(sourceId, automatic);
        if (report.patch) {
          finalPatchReceived = !progressAbort.signal.aborted;
          applyPatch(report);
        }
        if (report.checks) {
          checksReceived = true;
          for (const check of report.checks) {
            if (!ids.includes(check.source_id)) continue;
            const ok = check.report?.status === "success" && check.report.complete && !check.report.items_rejected;
            outcomes.set(check.source_id, ok ? null : {
              kind: check.error_kind || "incomplete", message: "",
            });
          }
        }
        const success =
          report.status === "success" &&
          report.complete &&
          !report.items_rejected;
        if (success) {
          const added = report.changes?.added ?? report.patch?.added.length ?? report.items_inserted;
          const updated = report.changes?.updated ?? report.patch?.updated_count ?? report.patch?.modified.length ?? report.items_updated;
          const removed = report.changes?.removed ?? report.patch?.removed.length ?? 0;
          successText = added || updated || removed
            ? `同步完成，新增 ${added} 条、更新 ${updated} 条${removed ? `、移出 ${removed} 条` : ""}。`
            : "检查完成，数据无变化。";
        }
        else
          failure ||= {
            kind: "incomplete",
            message: `同步未完成：${report.items_rejected ? `${report.items_rejected} 条未能入库` : stopLabel[report.stop_reason] || report.stop_reason}。已取得的内容仍保留。`,
          };
      } else {
        const info = await checkConnection();
        setConnectionCheck(info.session_established
          ? { state: "success", server: [info.server_name || "飞书项目", info.server_version].filter(Boolean).join(" ") }
          : { state: "failed", error: { kind: "connection", message: "连接未建立，请重试。" } });
      }
    } catch (e) {
      if (action === "sync") failure = asError(e);
      else setConnectionCheck({ state: "failed", error: asError(e) });
    } finally {
      // 同步中途失败也可能已落库部分页，必须回读缓存和失败台账。
      try {
        if (!finalPatchReceived) await reload();
      } catch (e) {
        if (action === "sync") cacheReadFailure = asError(e);
        else setError((previous) => previous || asError(e));
      }
      if (action === "sync") {
        progressAbort.abort();
        if (syncProgressAbort.current === progressAbort) syncProgressAbort.current = null;
        if (!pendingManual.current.size) {
          // 全量回读已触发目录读取；增量路径在整轮手动刷新结束后补一次。
          if (patched && refreshCatalogAfterSync.current) setCatalogEpoch((value) => value + 1);
          refreshCatalogAfterSync.current = false;
        }
        for (const id of ids) {
          if (!outcomes.has(id)) {
            const outcome = failure || (checksReceived ? { kind: "incomplete", message: "" } : null);
            outcomes.set(id, outcome);
          }
          if (!outcomes.get(id) && cacheReadFailure) outcomes.set(id, cacheReadFailure);
          updatePolicy(outcomes.get(id)?.kind, id);
        }
        const manual = manualSync.current;
        let joinedManual = false;
        for (const [id, outcome] of outcomes) {
          if (!outcome) {
            syncFailures.current.delete(id);
          } else {
            const previous = syncFailures.current.get(id);
            if (readFailureNeedsAction(outcome.kind)) {
              if (previous?.kind !== outcome.kind) syncFailures.current.set(id, { kind: outcome.kind, dismissed: false });
            } else if (previous) {
              // 新结果已不再指向凭证或权限问题，不能继续显示旧的操作指引。
              if (readFailureNeedsAction(previous.kind)) syncFailures.current.delete(id);
              else previous.kind = outcome.kind;
            }
          }
          if (manual?.remaining.delete(id)) {
            joinedManual = true;
            if (outcome) manual.failures.set(id, outcome);
          }
        }
        if (joinedManual && manual) manual.results.push(
          ids.every((id) => manual.requested.has(id)) ? successText || "刷新完成。" : "刷新完成。");
        if (manual && !manual.remaining.size) {
          const ownsNotice = !manual.workflowInFlight && manual.workflowAttempt === workflowAttempt.current;
          if (manual.failures.size) {
            if (ownsNotice) setNotice(null);
            for (const [id, outcome] of manual.failures)
              syncFailures.current.set(id, { kind: outcome.kind, dismissed: false });
          } else if (ownsNotice) {
            const text = manual.results.every((result) => result === "检查完成，数据无变化。")
              ? "检查完成，数据无变化。" : manual.results.length === 1 ? manual.results[0] : "刷新完成。";
            setNotice({ tone: "success", text });
          }
          manualSync.current = null;
        }
        publishSyncFailures();
        setSourceReadFailures((current) => {
          const next = { ...current };
          for (const [id, outcome] of outcomes) {
            if (outcome) next[id] = outcome.kind;
            else delete next[id];
          }
          return next;
        });
        typeNames.afterSync([...outcomes].filter(([, outcome]) => !outcome).map(([id]) => id));
      }
      if (action === "sync") {
        syncRef.current = false;
        activeSyncIds.current = [];
        setSyncBusy(false);
        queueMicrotask(() => drainPostWrite.current());
        if (pendingManual.current.size) {
          const pending = [...pendingManual.current];
          pendingManual.current.clear();
          queueMicrotask(() => void run("sync", false, pending));
        }
      } else {
        checkRef.current = false;
        setCheckBusy(false);
      }
      if (afterWrite && (failure || cacheReadFailure || [...outcomes.values()].some(Boolean))) {
        throw new Error("清单刷新未完成，已保留现有内容，可稍后刷新。");
      }
    }
  }
  function refreshAfterWrite(): Promise<void> {
    return new Promise((resolve, reject) => {
      postWriteWaiters.current.push({ resolve, reject });
      queueMicrotask(() => drainPostWrite.current());
    });
  }
  drainPostWrite.current = () => {
    if (syncRef.current || postWriteRunning.current || !postWriteWaiters.current.length) return;
    const waiters = postWriteWaiters.current.splice(0);
    const ids = [...new Set(enabledIds)];
    postWriteRunning.current = true;
    void (ids.length ? run("sync", false, ids, true) : reload()).then(
      () => waiters.forEach((waiter) => waiter.resolve()),
      () => waiters.forEach((waiter) => waiter.reject(new Error("清单刷新未完成，已保留现有内容，可稍后刷新。"))),
    ).finally(() => {
      postWriteRunning.current = false;
      queueMicrotask(() => drainPostWrite.current());
    });
  };
  autoRunRef.current = () => {
    const due = enabledIds.filter((id) => {
      const p = policies[id] || fallbackPolicy;
      return p.nextAt <= Date.now();
    });
    void run("sync", true, incremental ? due : undefined);
  };

  async function submitWorkflow(request: WorkflowRequest) {
    if (workspaceActionBlocked("workflow", currentActivity()) || !desktop) throw { kind: "conflict", message: "当前有其他操作正在执行或桌面连接不可用，本次尚未发送，请稍后重新检查。" };
    const identity = itemKey({ id: request.item_id } as CachedItem);
    const scope = JSON.stringify([identity, request.action_id]);
    if (workflowSubmissions.current.has(scope)) throw { kind: "conflict", message: "该流程操作正在提交，请等待结果后再操作。" };
    workflowSubmissions.current.add(scope);
    const item = data?.items.find((item) => itemKey(item) === identity)?.name || "当前事项";
    const report = (message: string, error?: AppError) => setWorkflowReports((current) => ({
      ...current, [request.request_id]: { item, message, error },
    }));
    // 流程可能与完整检查并行。写入开始后停止本轮快照补丁，整轮结束
    // 再回读当前缓存，防止写前已发出的批次覆盖写后核验的清单。
    syncProgressAbort.current?.abort();
    workflowRef.current = true;
    workflowAttempt.current += 1;
    setWorkflowBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await executeWorkflowAction(request);
      // 每次提交保留独立结论；另一操作成功不能覆盖失败或结果不确定。
      const resultError = result.outcome === "verified" && result.verified ? undefined : {
        kind: result.outcome === "failed" ? "action_failed" : "unknown_result", message: result.message,
      };
      report(result.message, resultError);
      try {
        if (result.outcome === "verified" && result.verified) await refreshAfterWrite();
        else await reload();
      } catch (e) {
        // 列表没刷新是另一件事：追加说明，不替换上面那句结论，也不谎称列表是新的。
        const refresh = asError(e);
        const note = result.outcome === "verified" && result.verified
          ? "（清单刷新未完成，已保留现有内容，可稍后刷新。）"
          : `（本地列表未能刷新：${refresh.message}）`;
        report(`${result.message}${note}`, { kind: resultError?.kind ?? refresh.kind, message: `${result.message}${note}` });
      }
      return result;
    } catch (e) {
      report(asError(e).message, asError(e));
      try {
        await reload();
      } catch {
        /* 保留原始操作错误和上次缓存。 */
      }
      throw e;
    } finally {
      workflowSubmissions.current.delete(scope);
      workflowRef.current = workflowSubmissions.current.size > 0;
      setWorkflowBusy(workflowRef.current);
    }
  }

  async function applySourceTypes(
    action: "refresh",
  ): Promise<boolean> {
    if (workspaceActionBlocked("discovery", currentActivity()) || !desktop) return false;
    discoveryRef.current = true;
    setDiscoveryBusy(true);
    const startedDuringWorkflow = workflowRef.current;
    const workflowAtStart = workflowAttempt.current;
    const ownsFeedback = () => !startedDuringWorkflow && workflowAtStart === workflowAttempt.current;
    setTypeOperationErrors((current) => ({ ...current, discovery: undefined }));
    if (ownsFeedback()) {
      setError(null);
      setNotice(null);
    }
    try {
      if (action === "refresh") {
        const result = await typeNames.refresh(sourceId);
        if (!result) return false;
        await reload();
        if (result.failed.length)
          setTypeOperationErrors((current) => ({ ...current, discovery: {
            kind: "discovery_partial",
            message: `部分空间未能读取，类型清单可能不完整：${result.failed.map(([project, message]) => `${project}：${message}`).join("；")}`,
          } }));
        else if (ownsFeedback())
          setNotice({
            tone: result.discovered_count ? "success" : "warning",
            text: result.discovered_count
              ? `已发现 ${result.discovered_count} 个空间与类型组合。`
              : "本次未发现类型，保留原有类型清单。",
          });
      }
      return true;
    } catch (e) {
      setTypeOperationErrors((current) => ({ ...current, discovery: asError(e) }));
      return false;
    } finally {
      discoveryRef.current = false;
      setDiscoveryBusy(false);
    }
  }

  const sourceProjectNames = sourceProjects(data?.sources || [], data?.items || [], data?.workspace_catalog);
  const preferences = sourceTypePreferences(sourcePreferences, sourceId);
  const scopedSources = (data?.sources || []).filter((s) =>
    sourceId === "*" || !sourceId ? s.enabled : s.id === sourceId,
  );
  const sourceTypes = (s: Snapshot["sources"][number]) =>
    (s.type_scope?.types || []).filter((t) =>
      (!s.project_key || t.project_key === s.project_key) &&
      (!s.work_item_type_key || t.type_key === s.work_item_type_key),
    );
  const creationTargets = creationLocations(scopedSources, sourcePreferences, { types: type, spaces: project });
  const canCreate = desktop && data?.capabilities?.creation && type.length === 1 && creationTargets.length > 0;
  const creationContext = `${credentialRevision}:${data?.settings?.endpoint}:${data?.db_path}`;
  const pendingCreations = creationRecords.context === creationContext ? creationRecords.forms : [];
  const creationRecoveryAvailable = pendingCreations.length > 0 || (creationRecords.context === creationContext && creationRecords.failed);
  const recoveryFeedback = creationRecordFeedback?.context === creationContext ? creationRecordFeedback : null;
  const pendingLocations: CreationLocation[] = pendingCreations.map((form) => {
    const source = data?.sources.find((s) => s.id === form.target.source_id);
    const entry = source?.type_scope?.types.find((t) => t.project_key === form.target.project_key && t.type_key === form.target.type_key);
    return { ...form.target, space: entry?.project_name || form.target.project_key, name: entry?.type_name || form.target.type_key, pending_form: form };
  });
  useEffect(() => {
    if (!desktop || !data?.capabilities?.creation) return;
    let cancelled = false;
    getPendingCreations().then((forms) => {
      if (!cancelled) setCreationRecords({ context: creationContext, forms, failed: false });
    }).catch(() => {
      if (!cancelled) setCreationRecords((current) => ({ context: creationContext, forms: current.context === creationContext ? current.forms : [], failed: true }));
    });
    return () => { cancelled = true; };
  }, [creationContext, creationOpen, data?.capabilities?.creation]);
  function closeCreation() {
    creationRef.current = false;
    setCreationBusy(false);
    setCreationOpen(false);
  }
  function openCreation() {
    if (!canCreate || loading || workspaceActionBlocked("creation", currentActivity())) return;
    creationRef.current = true;
    setCreationBusy(true);
    setCreationRecovery(false);
    setCreationOpen(true);
  }
  async function openCreationRecovery() {
    if (!desktop || loading || workspaceActionBlocked("creation", currentActivity())) return;
    creationRef.current = true;
    setCreationBusy(true);
    setCreationRecordFeedback(null);
    try {
      const forms = await getPendingCreations();
      setCreationRecords({ context: creationContext, forms, failed: false });
      if (forms.length) { setCreationRecovery(true); setCreationOpen(true); }
      else {
        closeCreation();
        setCreationRecordFeedback({ context: creationContext, result: "empty" });
      }
    } catch (e) {
      closeCreation();
      setCreationRecords((current) => ({ context: creationContext,
        forms: current.context === creationContext ? current.forms : [], failed: true }));
      setCreationRecordFeedback({ context: creationContext, result: "failed", error: asError(e) });
    }
  }
  const visibleInSource = (key: string, id: string) =>
    typePreference(sourceTypePreferences(sourcePreferences, id), key).enabled;
  const allItems = useMemo(() => {
    const enabledSources = new Set(
      data?.sources.filter((s) => s.enabled).map((s) => s.id),
    );
    return (data?.items || []).filter((item) => {
      // 兼容尚未提供来源归属的旧版桌面后端。
      if (!item.source_ids || !sourceId) return true;
      return sourceId === "*"
        ? item.source_ids.some((id) => enabledSources.has(id))
        : item.source_ids.includes(sourceId);
    }).map((item) => {
      const personal = item.personal_flows?.[sourceId];
      const usePersonal = personal?.kind === "node" && item.flow.kind === "node";
      const name = item.id.project_key ? sourceProjectNames.get(item.id.project_key) : null;
      return { ...item, project_name: name || item.project_name,
        schedule: item.personal_schedules?.[sourceId] || item.schedule,
        flow: usePersonal ? personal : item.flow,
        current_node_names: usePersonal ? (personal.node_name ? [personal.node_name] : []) : item.current_node_names,
        node_scope: usePersonal ? "personal" as const : undefined };
    });
  }, [data, sourceId]);
  const emptySourceFailure = !allItems.length
    ? scopedSources.map((s) => sourceReadFailures[s.id]).find(Boolean) || sourceReadFailures[sourceId]
    : undefined;
  const initialSyncFailure = emptySourceFailure
    ? `尚未取得完整的工作清单。${readFailureMessage(emptySourceFailure)}。` : null;
  const items = useMemo(
    () =>
      allItems.filter(
        (i) =>
          !i.id.work_item_type_key ||
          (sourceId === "*"
            ? (i.source_ids || scopedSources.map((s) => s.id)).some((id) =>
                scopedSources.some((s) => s.id === id) && visibleInSource(i.id.work_item_type_key!, id),
              )
            : visibleInSource(i.id.work_item_type_key, sourceId)),
      ),
    [allItems, sourcePreferences, sourceId, data],
  );
  const discoveredNames = new Map<string, string>();
  // Keep a shared type name stable when sources or discovery results reorder.
  for (const source of [...scopedSources].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const type of [...sourceTypes(source)].sort((a, b) =>
      a.project_key.localeCompare(b.project_key) || a.type_name.localeCompare(b.type_name))) {
      const name = type.type_name.trim();
      if (name && name !== type.type_key && !discoveredNames.has(type.type_key))
        discoveredNames.set(type.type_key, name);
    }
  }
  const typeName = (key: string) => discoveredNames.get(key) || typeLabel(key);
  const displayType = (key: string | null) =>
    key
      ? typePreference(preferences, key).alias || typeName(key)
      : typeLabel(key);
  const displayItemType = (item: CachedItem) => {
    const key = item.id.work_item_type_key;
    if (sourceId !== "*" || !key) return displayType(key);
    const names = scopedSources
      .filter((s) => (!item.source_ids || item.source_ids.includes(s.id)) && visibleInSource(key, s.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((s) => typePreference(sourceTypePreferences(sourcePreferences, s.id), key).alias ||
        sourceTypes(s).find((t) => t.type_key === key)?.type_name || typeName(key));
    return [...new Set(names)].join(" / ") || typeName(key);
  };
  const filtered = useMemo(
    () => orderWorkItems(filterWorkItems(items, filters)),
    [items, filters],
  );
  const nodeLabels = new Set(items.filter((item) => item.flow.kind === "node" || item.flow.kind === "both")
    .map(nodeScopeLabel));
  const nodeFilterHint = nodeLabels.size === 1 ? [...nodeLabels][0] : "当前节点";
  // 两种布局共用条件，清单组件接收完整范围以显示筛选前后的数量。
  const compactItems = useMemo(() => orderWorkItems(items), [items]);
  const selected = filtered.find((i) => itemKey(i) === selectedKey);
  const discoveredTypes = [
    ...new Set([
      ...allItems
        .map((i) => i.id.work_item_type_key)
        .filter((v): v is string => !!v),
      ...scopedSources.flatMap((s) => sourceTypes(s).map((t) => t.type_key)),
    ]),
  ];
  const knownTypes = orderTypeKeys(discoveredTypes, data?.type_order || []);
  const types = knownTypes.filter(
    (key) => sourceId === "*"
      ? scopedSources.some((s) => visibleInSource(key, s.id) && (
          sourceTypes(s).some((t) => t.type_key === key) ||
          items.some((i) => i.id.work_item_type_key === key && (!i.source_ids || i.source_ids.includes(s.id)))
        ))
      : typePreference(preferences, key).enabled,
  );
  const hasFilters = workFilterCount({ ...filters, type: [] }) > 0;
  const sidebarReorder = useTypeReorder({
    keys: types,
    order: knownTypes,
    enabled: desktop && !workspaceActionBlocked("order", activity) && !loading,
    onReorder: (next) => void updateTypeOrder(next),
  });
  const catalog = data?.workspace_catalog || [];
  const facets = workFilterOptions(items, catalog, filters);
  const source = sourceId === "*" && data?.capabilities?.source_queries ? {id:"*",kind:"all_sources",enabled:true,executable:data.sources.some(s=>s.executable),reason:null,action:null,todo_scope:null} : data?.sources.find((s) => s.id === sourceId);
  const changeType = (nextType: string) => {
    if (view !== "work") {
      setPendingType(null);
      setType(nextType ? [nextType] : []);
      setView("work");
    } else {
      setPendingType(nextType);
    }
  };
  const clearFilters = () => {
    setPendingType(null);
    setFilters((current) => ({ ...emptyWorkFilters, type: current.type, typeLabel: current.typeLabel }));
  };
  const resetWorkFilters = () => {
    setPendingType(null);
    setFilters(emptyWorkFilters);
  };
  const changeSource = (id: string) => {
    setSourceId(id);
    resetWorkFilters();
    filterSchemes.detach();
    setSelectedKey(null);
  };
  const syncDisabled =
    !desktop || !source?.executable || !!contextOperation || (syncBusy && !incremental) || loading;
  const hasAlerts = settingsRefreshFailed || !!error || !!syncFailure || !!notice || !!recoveryFeedback || Object.values(workflowReports).some((report) => !!report.error) || Object.values(typeOperationErrors).some(Boolean);
  const alerts = (
    <>
      {settingsRefreshFailed && <div className="banner warning" role="status">
        <span>需要重新加载页面数据后才能继续同步。</span>
        <button className="secondary" disabled={loading || !!contextOperation || syncBusy} onClick={() => void readCache()}>重试刷新页面</button>
      </div>}
      {error && (
        <div className="banner error" role="alert">
          <Unplug size={18} />
          <div>
            <strong>操作未完成 · {errorKindLabel(error.kind)}</strong>
            <p>{error.message}</p>
          </div>
          <button
            className="icon-button"
            aria-label="关闭错误提示"
            onClick={() => setError(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {Object.entries(workflowReports).filter(([, result]) => result.error).map(([id, result]) => (
        <div className="banner error" role="alert" key={id}>
          <Unplug size={18} />
          <div><strong>{result.item} · {errorKindLabel(result.error!.kind)}</strong><p>{result.message}</p></div>
          <button className="icon-button" aria-label={`关闭${result.item}的流程操作提示`}
            onClick={() => setWorkflowReports((current) => { const next = { ...current }; delete next[id]; return next; })}><X size={16} /></button>
        </div>
      ))}
      {(["order", "discovery"] as const).map((action) => {
        const failure = typeOperationErrors[action];
        const title = action === "order" ? "类型排序未保存" : "类型发现未完成";
        return failure && <div className="banner error" role="alert" key={action}>
          <Unplug size={18} />
          <div><strong>{title} · {errorKindLabel(failure.kind)}</strong><p>{failure.message}</p></div>
          <button className="icon-button" aria-label={`关闭${title}提示`}
            onClick={() => setTypeOperationErrors((current) => ({ ...current, [action]: undefined }))}><X size={16} /></button>
        </div>;
      })}
      {recoveryFeedback && <div className={`banner ${recoveryFeedback.result === "failed" ? "error" : "success"}`}
        role={recoveryFeedback.result === "failed" ? "alert" : "status"}>
        {recoveryFeedback.result === "failed" ? <Unplug size={18} /> : <Check size={17} />}
        {recoveryFeedback.result === "failed" ? <div><strong>创建记录读取未完成 · {errorKindLabel(recoveryFeedback.error.kind)}</strong>
          <p>{recoveryFeedback.error.message}</p></div> : <span>没有待核验的创建记录。</span>}
        {recoveryFeedback.result === "failed" && <button className="secondary" disabled={creationDisabled}
          onClick={() => void openCreationRecovery()}>重试读取创建记录</button>}
        <button className="icon-button" aria-label="关闭创建记录读取提示" onClick={() => setCreationRecordFeedback(null)}><X size={16} /></button>
      </div>}
      {syncFailure && (
        <div className="banner error" role="alert">
          <Unplug size={18} />
          <div>
            <strong>同步未完成</strong>
            <p>{syncFailure}</p>
          </div>
          <button
            className="icon-button"
            aria-label="关闭同步错误提示"
            onClick={() => {
              for (const failure of syncFailures.current.values()) failure.dismissed = true;
              publishSyncFailures();
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div
          className={`banner ${notice.tone} ${notice.tone === "success" ? "toast" : ""}`}
          role="status"
        >
          <Check size={17} />
          <span>{notice.text}</span>
          <button
            className="icon-button"
            aria-label="关闭结果提示"
            onClick={() => setNotice(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
  const detailFor = (item: CachedItem, inCompact: boolean) => (
    <Detail
      key={itemKey(item)}
      item={item}
      label={displayItemType(item)}
      close={() => setSelectedKey(null)}
      workflowAvailable={!!data?.capabilities?.workflow}
      detailsAvailable={!!data?.capabilities?.details}
      onDetailRefreshed={reload}
      busy={workspaceActionBlocked("workflow", activity)}
      submit={submitWorkflow}
      compact={inCompact}
    />
  );

  // 桌面端读到上次的显示模式之前不渲染布局，避免清单窗口里先闪一帧完整布局。
  if (!displayMode.ready) return <div className="app-shell" aria-busy="true" />;

  return (
    <>
    <div className="workflow-toasts">
      {Object.entries(workflowReports).filter(([, result]) => !result.error).map(([id, result]) => (
        <WorkflowSuccessToast key={id} id={id} report={result} dismiss={dismissWorkflowReport} />
      ))}
    </div>
    {compact && (
      <CompactWorkspace
        items={compactItems}
        filters={filters}
        schemeMenu={<FilterSchemeMenu controller={filterSchemes} onNotice={(text) => setNotice({ tone: "success", text })} />}
        onFiltersChange={(next) => { setPendingType(null); setFilters(next); }}
        filterOptions={facets}
        nodeFilterHint={nodeFilterHint}
        loading={loading}
        emptyText={
          allItems.length && !items.length
            ? "尚未选择显示类型，可在完整模式的工作来源中设置。"
            : initialSyncFailure || (error
              ? "暂时无法读取工作，请检查上方提示。"
              : "暂无工作。先在完整模式中选择工作来源并同步飞书。")
        }
        typeName={displayItemType}
        typeOptions={[...new Set([...types, ...type])].map((key) => ({
          key, label: displayType(key), count: items.filter((item) => item.id.work_item_type_key === key).length,
        }))}
        selectedKey={selectedKey}
        select={setSelectedKey}
        detail={selected ? detailFor(selected, true) : null}
        alerts={hasAlerts ? alerts : null}
        lastSync={data?.last_success?.finished_at_ms}
        refresh={{ run: () => void run("sync"), disabled: syncDisabled, syncing: syncBusy }}
        pinned={displayMode.pinned}
        pin={displayMode.pin}
        expand={() => displayMode.change("full")}
        windowControls={displayMode.desktop}
        windowAction={displayMode.windowAction}
        modeBusy={displayMode.busy}
        create={canCreate ? openCreation : undefined}
        recoverCreation={creationRecoveryAvailable ? () => void openCreationRecovery() : undefined}
        creationDisabled={creationDisabled}
      />
    )}
    {/* 清单模式只隐藏完整布局，配置编辑器保持挂载，不丢自动保存和失败草稿。 */}
    <div className="app-shell" hidden={compact}>
      <SettingsSaveStatus
        active={view === "settings"}
        belowNotice={view === "settings" && notice?.tone === "success"}
        feedback={[
          connectionFeedback,
          linkFeedback,
          workflowFeedback,
          desktopFeedback,
          credentialFeedback,
        ]}
        onDismiss={() => {
          setConnectionFeedback(null);
          setLinkFeedback(null);
          setWorkflowFeedback(null);
          setDesktopFeedback(null);
          setCredentialFeedback(null);
        }}
      />
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Leaf size={23} strokeWidth={1.7} />
          </span>
          <div>
            <strong>FSTODO</strong>
            <p>让工作，回归有序。</p>
          </div>
        </div>
        <nav aria-label="主要导航">
          <button
            className={view === "work" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setView("work");
              resetWorkFilters();
            }}
          >
            <Inbox size={18} />
            我的工作<span className="nav-count">{items.length}</span>
          </button>
          <button
            className={view === "sources" ? "nav-item active" : "nav-item"}
            onClick={() => setView("sources")}
          >
            <Layers3 size={18} />
            工作来源
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="workspace-label" id="type-nav-label">
          我的类型
        </div>
        <div
          className="type-nav"
          role="group"
          aria-labelledby="type-nav-label"
        >
          {types.length ? (
            types.map((key) => (
              <button
                key={key}
                className={[
                  "type-link",
                  type.includes(key) && view === "work" && "chosen",
                  sidebarReorder.draggingKey === key && "dragging",
                  sidebarReorder.dropTarget?.key === key &&
                    (sidebarReorder.dropTarget.after
                      ? "drop-after"
                      : "drop-before"),
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={typeColorStyle(key)}
                title={sidebarReorder.canReorder ? typeReorderHint : undefined}
                onClick={() => changeType(key)}
                {...sidebarReorder.itemProps<HTMLButtonElement>(key)}
              >
                <span className="type-dot" aria-hidden="true" />
                <span className="type-link-name">{displayType(key)}</span>
                <span className="type-link-count">
                  {items.filter((i) => i.id.work_item_type_key === key).length}
                </span>
              </button>
            ))
          ) : (
            <p className="sidebar-empty">同步后，类型会显示在这里</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <button
            className={view === "settings" ? "nav-item active" : "nav-item"}
            onClick={() => setView("settings")}
          >
            <Settings2 size={17} />
            连接与配置
            <ChevronRight size={14} />
          </button>
          <AppVersion />
        </div>
      </aside>

      <main className={view === "settings" ? "main main-settings" : "main"}>
        <header className="topbar">
          <span>
            <span className="breadcrumb">个人空间</span>
            <ChevronRight size={13} />
            {view === "work"
              ? "我的工作"
              : view === "sources"
                ? "工作来源"
                : "连接与配置"}
          </span>
          <div className="topbar-actions">
            <span className="topbar-right">
              <Cloud size={15} />
              飞书项目 <i />
              <span>本地工作台</span>
            </span>
            <ThemeControl />
            <button
              className="icon-button"
              aria-label="切换到清单模式"
              title="切换到清单模式"
              disabled={displayMode.busy}
              onClick={() => {
                setSelectedKey(null);
                displayMode.change("compact");
              }}
            >
              <PictureInPicture2 size={16} />
            </button>
          </div>
        </header>
        <div className="page">
          {!desktop && (
            <div className="banner preview">
              <CircleHelp size={17} />
              <span>浏览器预览 · 通过桌面应用读取本地缓存与连接飞书。</span>
            </div>
          )}
          {!compact && alerts}

          {view === "work" && (
            <>
              <div className="overview">
                <div className="sync-overview">
                  <span>最近成功同步</span>
                  <p>
                    <Clock3 size={14} />
                    {localTime(data?.last_success?.finished_at_ms)}
                  </p>
                  <p className="auto-sync-status">
                    {incremental
                      ? !automaticReady ? "自动同步等待来源和连接就绪"
                        : enabledIds.some((id) => policies[id]?.failures)
                          ? "各来源独立检查 · 失败来源持续退避重试"
                          : "所有已启用来源每 2 分钟自动检查"
                      : !automaticReady
                        ? "自动同步等待来源和连接就绪"
                        : policy.failures
                          ? `自动同步将在 ${policy.failures === 1 ? 4 : 8} 分钟间隔后重试`
                          : "每 2 分钟自动同步"}
                  </p>
                </div>
                <div className="overview-actions">
                  <label className="sr-only" htmlFor="sync-source">
                    显示来源
                  </label>
                  <Select
                    id="sync-source"
                    ariaLabel="显示来源"
                    value={sourceId}
                    onChange={changeSource}
                    disabled={!desktop}
                    options={[
                      { value: "", label: "选择显示来源", disabled: true },
                      ...(data?.capabilities?.source_queries
                        ? [{ value: "*", label: "全部来源" }]
                        : []),
                      ...(data?.sources.map((s) => ({
                        value: s.id,
                        label: `${sourceName(s)}${s.project_key ? ` · ${sourceProjectNames.get(s.project_key) || s.project_key}` : ""}${!s.executable ? "（不可用）" : ""}`,
                        disabled: !s.executable,
                      })) || []),
                    ]}
                  />
                  <button
                    className="secondary"
                    disabled={syncDisabled}
                    onClick={() => void run("sync")}
                  >
                    <RefreshCw
                      size={16}
                      className={syncBusy ? "spin" : ""}
                    />
                    {syncBusy ? "正在同步" : "立即刷新"}
                  </button>
                </div>
              </div>
              <section className="work-panel" aria-label="工作清单">
                <div className="work-panel-header">
                  <div className="list-toolbar">
                    <WorkTypeTabs selected={type} total={items.length} onChange={changeType}
                      options={types.map((key) => ({ key, label: displayType(key),
                        count: items.filter((item) => item.id.work_item_type_key === key).length }))} />
                    <div className="list-toolbar-actions"><label className="search">
                      <Search size={16} />
                      <input
                        ref={searchRef}
                        aria-label="搜索工作"
                        placeholder="搜索标题、编号、空间或项目…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      <kbd>⌃ K</kbd>
                    </label>
                    {creationRecoveryAvailable && <button className="secondary creation-recovery-button" disabled={creationDisabled}
                      onClick={() => void openCreationRecovery()}>核验创建记录{pendingCreations.length ? ` (${pendingCreations.length})` : ""}</button>}
                    {canCreate && <button className="secondary create-work-button" disabled={creationDisabled}
                      onClick={openCreation}><Plus size={15} />新建工作事项</button>}</div>
                  </div>
                  <WorkFilterToolbar filters={filters} options={facets} resultCount={filtered.length}
                    nodeFilterHint={nodeFilterHint} onChange={(next) => { setPendingType(null); setFilters(next); }}
                    schemeMenu={<FilterSchemeMenu controller={filterSchemes} onNotice={(text) => setNotice({ tone: "success", text })} />} />
                  {catalogWarning && <p className="hint" role="status">{catalogWarning}</p>}
                </div>
                {loading && !data ? (
                  <div className="empty-state">
                    <LoaderCircle className="spin" size={29} />
                    <h2>正在读取本地工作</h2>
                  </div>
                ) : filtered.length ? (
                  <div className="item-list">
                    {filtered.map((item) => (
                      <button
                        key={itemKey(item)}
                        className={`work-item ${selectedKey === itemKey(item) ? "selected" : ""}`}
                        onClick={() => setSelectedKey(itemKey(item))}
                      >
                        <span
                          className="item-type-icon"
                          style={typeColorStyle(item.id.work_item_type_key)}
                        >
                          {item.id.work_item_type_key === "issue" ? (
                            <Bug size={18} />
                          ) : (
                            <FileText size={18} />
                          )}
                        </span>
                        <span className="item-main">
                          <span className="item-title">
                            {item.name || "名称未提供"}
                          </span>
                          <span className="item-meta">
                            <span>
                              {displayItemType(item)}
                            </span>
                            <span>#{item.id.work_item_id}</span>
                            <span>
                              <FolderOpen size={12} />
                              空间：{item.project_name || "空间名称未提供"}
                            </span>
                            {!!item.related_projects?.length && <span>项目：{[...new Set(item.related_projects.map((p) => p.name))].join("、")}</span>}
                            {item.is_completed === true && <span>已完成</span>}
                            <span>
                              {item.updated_at_ms != null
                                ? `更新于 ${localTime(item.updated_at_ms)}`
                                : "更新时间未提供"}
                            </span>
                          </span>
                        </span>
                        <Flow item={item} />
                        <ChevronRight className="item-chevron" size={16} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-illustration">
                      <Inbox size={39} strokeWidth={1.3} />
                      <span>
                        <Leaf size={16} />
                      </span>
                    </div>
                    <h2>
                      {allItems.length && !items.length
                        ? "尚未选择显示类型"
                        : items.length
                          ? "没有匹配的工作"
                          : initialSyncFailure ? "工作清单加载未完成" : error
                            ? "暂时无法读取工作"
                            : "工作，从这里汇合"}
                    </h2>
                    <p>
                      {allItems.length && !items.length
                        ? "在工作来源中勾选需要显示的类型。"
                        : items.length
                          ? "试试其他关键词，或调整筛选条件。"
                          : initialSyncFailure || (error
                            ? "检查上方提示后，重新读取本地缓存。"
                            : "先选择工作来源，再同步飞书。已取得的事项会保存在本地，离线也能查看。")}
                    </p>
                    {items.length && hasFilters ? (
                      <button className="secondary" onClick={clearFilters}>
                        清除筛选
                      </button>
                    ) : (
                      <button
                        className="secondary"
                        onClick={() =>
                          initialSyncFailure ? void run("sync") : error ? void readCache() : setView("sources")
                        }
                      >
                        {error || initialSyncFailure ? (
                          <RefreshCw size={15} />
                        ) : (
                          <Layers3 size={15} />
                        )}
                        {initialSyncFailure ? "重新刷新" : error ? "重新读取" : "查看工作来源"}
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                )}
                <div className="list-footer">
                  <ShieldCheck size={13} />
                  <span>
                    未完成优先 · 按飞书更新时间倒序
                  </span>
                </div>
              </section>
            </>
          )}

          {view === "sources" && (
            <section className="settings-panel" aria-label="工作来源">
              <div className="section-heading">
                <div>
                  <h2>工作来源</h2>
                  <p>管理工作来源与工作类型，按自己的工作范围组织工作台。</p>
                </div>
              </div>
              <WorkSources sources={data?.sources || []} items={data?.items || []}
                workspaceCatalog={data?.workspace_catalog}
                selectedId={sourceId} select={changeSource}
                disabled={!desktop || loading || !!contextOperation}
                editable={!!data?.capabilities?.source_queries}
                saved={async (id) => { await reload(); if (id) changeSource(id); }} />
              <div className="source-actions">
                <button
                  className="primary"
                  disabled={syncDisabled}
                  onClick={() => void run("sync")}
                >
                  <ArrowDownToLine size={16} />
                  {syncBusy ? "正在同步…" : "立即刷新"}
                </button>
                <span>不会更改飞书上的事项</span>
              </div>
              {source && source.id !== "*" ? <SourceTypes
                key={source?.id || "unselected"}
                source={{ ...source, type_scope: source.type_scope && {
                  ...source.type_scope,
                  types: sourceTypes(source),
                } }}
                sourceLabel={`${sourceName(source)}${source.project_key ? ` · ${sourceProjectNames.get(source.project_key) || source.project_key}` : ""}`}
                disabled={!desktop || !source?.executable || workspaceActionBlocked("discovery", activity) || loading}
                canReorder={desktop && !workspaceActionBlocked("order", activity) && !loading}
                label={displayType}
                typeName={typeName}
                typeKeys={knownTypes}
                preferences={preferences}
                readFailure={typeNames.failures[sourceId]}
                updatePreferences={updatePreferences}
                saveTypeOrder={updateTypeOrder}
                apply={applySourceTypes}
              /> : <section className="source-types" aria-label="工作类型">
                <h3>工作类型</h3>
                <p className="hint">请先选择上方的一个工作来源，再设置该来源的工作类型；清单显示、允许新建和别名按来源独立保存。</p>
              </section>}
            </section>
          )}

          {/* 保持配置编辑器挂载，切页不会取消自动保存或丢失失败草稿。 */}
            <SettingsPage active={view === "settings"} sections={[
              { id: "feishu", label: "飞书连接", icon: Cloud, content: <>
              <div className="section-heading">
                <div>
                  <h2>飞书连接</h2>
                  <p>保存 MCP Token，再检查与飞书项目的连接。</p>
                </div>
                <button
                  className="secondary"
                  disabled={!desktop || workspaceActionBlocked("check", activity) || !!tokenDraft.trim() || connectionUnsaved}
                  onClick={() => void run("check")}
                >
                  <Cloud size={16} />
                  {checkBusy ? "检查中…" : "检查连接"}
                </button>
              </div>
              <McpConnectionStatus configured={!!data?.credential_ready}
                description={data?.credential_description} result={connectionCheck}
                checking={checkBusy} onOpenGuide={() => setTokenGuideOpen(true)} />
              {(!!tokenDraft.trim() || connectionUnsaved) && <p className="hint">
                {tokenDraft.trim() ? "请先保存下方 Token，再检查连接。" : "服务地址尚未保存，保存后再检查连接。"}
              </p>}
              {view === "settings" && <form
                className="token-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveCredential();
                }}
              >
                <McpTokenGuide open={tokenGuideOpen} onOpenChange={setTokenGuideOpen} inputId="mcp-token">
                <div className="token-input-row">
                  <input
                    id="mcp-token"
                    type="password"
                    autoComplete="new-password"
                    spellCheck={false}
                    value={tokenDraft}
                    onChange={(event) => setTokenDraft(event.target.value)}
                    placeholder={
                      data?.credential_ready
                        ? "已配置，输入新 token 可替换"
                        : "粘贴飞书项目 MCP token"
                    }
                    disabled={!desktop || contextChangeDisabled}
                    aria-describedby="token-help"
                  />
                  <button
                    className="primary"
                    type="submit"
                    disabled={!desktop || contextChangeDisabled || !tokenDraft.trim()}
                  >
                    <ShieldCheck size={16} />
                    {contextOperation === "save" ? "保存中…" : "保存 Token"}
                  </button>
                </div>
                <p id="token-help" className="hint">
                  加密保存在本机，仅显示脱敏信息。留空不会修改已保存的 token。
                </p>
                </McpTokenGuide>
              </form>}
              </> },
              ...(data?.settings ? [{ id: "connection", label: "应用配置", icon: SlidersHorizontal, content: <ConnectionSettings
                settings={data.settings}
                disabled={!desktop || contextChangeDisabled}
                save={saveSettings}
                onFeedback={setConnectionFeedback}
                onUnsavedChange={setConnectionUnsaved}
              /> }] : []),
              { id: "desktop", label: "窗口与桌面", icon: PictureInPicture2, content: <DesktopSettings settings={desktopSettings} onFeedback={setDesktopFeedback} /> },
              { id: "links", label: "链接打开方式", icon: Link2, content: <LinkSettings onFeedback={setLinkFeedback} disabled={!!contextOperation || loading} /> },
              { id: "workflow", label: "流程操作", icon: ShieldCheck, content: <WorkflowSettings onFeedback={setWorkflowFeedback} disabled={!!contextOperation || loading} /> },
              { id: "updates", label: "软件更新", icon: ArrowDownToLine, content: <AppUpdateSettings updater={updater} /> },
            ]} />
        </div>
      </main>
      {!compact && view === "work" && selected && detailFor(selected, false)}
    </div>
    <AppUpdateDialog updater={updater} />
    {creationOpen && desktop && data?.capabilities?.creation && <CreateWorkItem key={`${creationContext}:${creationRecovery}`}
      entryIntent={creationRecovery ? "recovery" : "create"}
      recordsChanged={() => { void getPendingCreations().then((forms) => setCreationRecords({ context: creationContext, forms, failed: false })).catch(() => setCreationRecords((current) => ({ ...current, failed: true }))); }}
      locations={creationRecovery ? pendingLocations : creationTargets} initialType={!creationRecovery && type.length === 1 ? type[0] : undefined}
      initialSpace={!creationRecovery && project.length === 1 ? project[0] : undefined} close={closeCreation} created={refreshAfterWrite} />}
    </>
  );
}
