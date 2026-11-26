import { Fragment, memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  GitBranch,
  Info,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import { DateRangePicker } from "./DateRangePicker";
import { ScheduleDateControls, ScheduleViewControls } from "./ScheduleViewControls";
import { fitScheduleView, scheduleViewsKey, validViewDate, type ScheduleViewSettings } from "./scheduleViews";
import { Select } from "./Select";
import { ScheduleDescription } from "./ScheduleDescription";
import { ScheduleAvatar, ScheduleAvatarCacheProvider } from "./ScheduleAvatar";
import { ScheduleNodeOwners, ScheduleParallelNodesSummary } from "./ScheduleNodeOwners";
import { sortScheduleCurrentNodes } from "./scheduleNodeOrder";
import { defectKey, ScheduleDefectInspector, ScheduleDefectList, useScheduleDefects, type ScheduleDefect } from "./ScheduleDefects";
import { useScrollIsolation } from "./useScrollIsolation";
import { nodeWorkflowActionIds, Workflow, type WorkflowItem, type WorkflowNavigationState, type WorkflowSubmit } from "./Workflow";
import { draftKey, readDraft } from "./workflowDrafts";
import { useWorkflowSubmissions, workflowSubmissions } from "./workflowSubmissions";
import type { RelatedProject, Snapshot } from "./types";
import { asError, itemKey, missingProject, projectFilterOptions, relatedProjectKey, workItemStatusName } from "./model";
import { readFailureMessage } from "./readFeedback";
import { sourceName, sourcePresets } from "./sourcePresets";
import {
  closeScheduleSession,
  loadSchedulePeople,
  loadScheduleSession,
  readCachedSchedulePeople,
  submitScheduleTargets,
  type SchedulePerson,
  type ScheduleRead,
  type ScheduleRecord,
} from "./scheduleApi";
import { patchScheduleData } from "./scheduleReadPatch";
import { useScheduleProgress, type ScheduleRequest } from "./scheduleProgress";
import { useScheduleProfiles } from "./useScheduleProfiles";
import { scheduleHistoryRequest, scheduleItemKey, useScheduleCalendar, useScheduleItemContexts, type ScheduleCalendarCache, type ScheduleCurrentNode } from "./scheduleHistory";
import { HISTORICAL_SCHEDULE_INTERVAL, RECENT_SCHEDULE_INTERVAL } from "./useScheduleRevalidation";
import {
  applyQuickSchedulePreset,
  classifyScheduleReview,
  editSchedule,
  hasBaselineSchedule,
  resizeSchedule,
  revertSchedule,
  scheduleChanged,
  scheduleSpanDays,
  scheduleValidation,
  settleSchedule,
  shiftSchedule,
  validSchedule,
  type ScheduleQuickPreset,
  type ScheduleTarget,
} from "./scheduleSession";
import "./schedule.css";

type Entry = ScheduleTarget & { record: ScheduleRecord; resultMessage?: string | null; resultWarning?: string | null };
type LiveScheduleNode = { entry: Entry; owners: Set<string>; unknownOwner: boolean; mine: boolean };
export type ScheduleGuard = { dirty: boolean; busy: boolean; uncertain: boolean; interacting?: boolean; defectWorkflow?: WorkflowNavigationState };
type Drag = { id: string; kind: "new" | "move" | "start" | "end"; grabbed: string };

function workflowItemFor(entry: Entry): WorkflowItem {
  return {
    id: {
      project_key: entry.identity.project,
      work_item_type_key: entry.identity.type,
      work_item_id: entry.identity.item,
    },
    name: entry.record.title,
  };
}

function nodeWorkflowNeedsVerification(entry: Entry) {
  const identity = itemKey(workflowItemFor(entry));
  return nodeWorkflowActionIds(entry.identity.node).some((id) => {
    const key = draftKey(identity, id);
    if (workflowSubmissions.has(key)) return true;
    try { return !!readDraft(key)?.pending; } catch { return false; }
  });
}

export type ScheduleMode = "mine" | "people";

export interface ScheduleSessionController {
  read: ScheduleRead | null;
  pending: Promise<ScheduleRead> | null;
  progressRequest?: ScheduleRequest | null;
  partial?: ScheduleRead;
  refreshing?: boolean;
  refreshError?: string;
  checkedAt?: number;
  calendarRefreshEnabled?: boolean;
  onPeopleChecking?: (sessionId: string) => void;
  onPeopleChecked?: (read?: ScheduleRead) => void;
  onInteraction?: () => void;
  endInteraction?: () => void;
  candidate?: ScheduleRead | null;
  consumeCandidate?: (next: ScheduleRead, adopt: boolean) => boolean;
  updateRead: (next: ScheduleRead) => void;
  reload: (options?: { includePeople?: boolean; forceReset?: boolean; afterWorkflow?: boolean }) => Promise<ScheduleRead>;
}

const normalizeNodeStatus = (status?: string | null) => (status ?? "").trim().toLowerCase();

const isCurrentSchedulableStatus = (status?: string | null) => {
  const normalized = normalizeNodeStatus(status);
  return normalized === "" || normalized === "doing";
};

const isPastTransitionedStatus = (status?: string | null) => {
  const normalized = normalizeNodeStatus(status);
  return normalized !== "" && normalized !== "doing" && normalized !== "not_started";
};

const belongsInMine = (record: ScheduleRecord, accountUnconfirmed = false) =>
  !record.peopleOnly && (record.mine || record.sourceAggregate ||
    (accountUnconfirmed && (Boolean(record.identity.owner || record.ownerIds.some(Boolean)) ||
      (record.cacheKind === "detail_node" && !record.identity.node))));

const resolveDefaultReadOnlyReason = (record: ScheduleRecord): string | undefined => {
  if (record.readOnlyReason) return record.readOnlyReason;
  if (isPastTransitionedStatus(record.nodeStatus)) return "该节点已流转完成，排期仅供查看";
  if (normalizeNodeStatus(record.nodeStatus) === "not_started")
    return "当前连接尚未验证此状态的排期写入";
  if (!record.identity.owner && !record.ownerIds.some(Boolean))
    return "未能确认负责人，排期仅供查看";
  return undefined;
};

const visibleReadOnlyReason = (reason?: string | null) =>
  reason === "当前连接尚未验证此状态的排期写入" ? undefined : reason;

const createScheduleEntry = (record: ScheduleRecord): Entry => ({
  id: record.id,
  nodeId: record.identity.node,
  identity: record.identity,
  baseline: { ...record.dates },
  dates: { ...record.dates },
  cancel: false,
  ...(record.result ? { result: record.result } : {}),
  ...(record.resultMessage !== undefined ? { resultMessage: record.resultMessage } : {}),
  ...(record.resultWarning !== undefined ? { resultWarning: record.resultWarning } : {}),
  readOnlyReason: resolveDefaultReadOnlyReason(record),
  record,
});

const isFallbackPersonName = (name: string | undefined | null, id: string) =>
  !name ||
  !name.trim() ||
  name.trim() === "当前用户" ||
  name === id ||
  /^\d+$/.test(name.trim()) ||
  (id.length >= 6 && name === Array.from(id).slice(-6).join(""));

const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const today = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const monday = (value: string) =>
  addDays(value, -((new Date(`${value}T00:00:00Z`).getUTCDay() + 6) % 7));
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
// 节点实例 ID 随事项变化，使用节点名称保证相同环节跨事项保持同色。
const nodeColorStyle = (record: ScheduleRecord): React.CSSProperties => {
  const key = record.nodeName.trim() || record.identity.node;
  let hash = Array.from(key).reduce((value, char) => (value * 31 + char.codePointAt(0)!) >>> 0, 0);
  // 混合高低位，避免中文名称直接取模时集中落到同一个颜色。
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return { "--schedule-node-hue": hash % 360 } as React.CSSProperties;
};
const scheduleNodeAction =
  /(?:分析|设计|评审|研发|开发|联调|自测|测试|验收|上线|发布|部署|合入|确认|准备|排查|修复|回归|交付)(?=\s*(?:[与和及、]|$))/u;
const compactScheduleNodeName = (name: string) => {
  const label = name.trim().replace(/(?<=\S)(?:\s*(?:阶段|工作|任务|环节|会议))+$/u, "");
  return label.match(scheduleNodeAction)?.[0] ??
    label.match(/^\p{Script=Han}*(\p{Script=Han}{2})$/u)?.[1];
};
const unreadRelatedProject = "unread-related-project";
const mergeResultWarnings = (previous?: string | null, next?: string | null) =>
  Array.from(new Set([...(previous || "").split("\n"), ...(next || "").split("\n")].filter(Boolean))).join("\n") || undefined;

function ScheduleRefreshNotice({ refreshing }: { refreshing: boolean }) {
  const [visible, setVisible] = useState(refreshing);

  useEffect(() => {
    if (refreshing) {
      setVisible(true);
      return;
    }
    const timeout = window.setTimeout(() => setVisible(false), 180);
    return () => window.clearTimeout(timeout);
  }, [refreshing]);

  if (!visible) return null;
  return createPortal(
    <div className={`schedule-refresh-notice${refreshing ? "" : " is-leaving"}`}>
      <div role="status" aria-live="polite" aria-atomic="true">
        <span className="schedule-refresh-notice-icon" aria-hidden="true"><RefreshCw size={17} /></span>
        <div>
          <strong>正在刷新最新排期</strong>
          <p>暂时保留上次读取的内容，可继续编辑</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const encouragements = [
  "把今天安排好，给从容留一点空间。",
  "一步一步来，认真走过的路都算数。",
  "先做好眼前的一件事，进展就会发生。",
  "保持热爱，也记得照顾自己的节奏。",
  "让重要的事，有一段专属的时间。",
  "不必填满每一天，留白也是好安排。",
  "今天的小小推进，也值得为自己鼓掌。",
  "带着期待出发，按自己的节奏前进。",
  "专注当下，让努力慢慢开花。",
  "忙碌之余，也给自己一个深呼吸。",
  "把大目标拆小，把每一步走稳。",
  "愿今天的你，有方向，也有好心情。",
];

function ScheduleGreeting({ person, name }: { person?: SchedulePerson; name?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", weekday: "long", hour: "numeric", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value || "";
  const hour = Number(part("hour"));
  const greeting = hour < 6 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "午安" : hour < 18 ? "下午好" : "晚上好";
  const day = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 8) / 86_400_000);
  return (
    <div className="schedule-greeting" aria-label="今日问候">
      <ScheduleAvatar person={person} />
      <div className="schedule-greeting-copy">
        <div className="schedule-greeting-date">{greeting} {part("month")}月{part("day")}日{part("weekday")}</div>
        {name && <strong>{name}</strong>}
        <p>{encouragements[day % encouragements.length]}</p>
      </div>
    </div>
  );
}

function NodeDwellTime({ startedAt }: { startedAt?: number | null }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = startedAt != null && Number.isFinite(startedAt) && startedAt > 0 && startedAt <= now
    ? now - startedAt : null;
  if (elapsed == null) {
    return <small title="飞书未提供可确认的节点实际进入时间">停留时间未知</small>;
  }

  const dayMs = 86_400_000;
  const [unit, unitMs] = elapsed < 3_600_000 ? ["分钟", 60_000]
    : elapsed < dayMs ? ["小时", 3_600_000]
    : ["天", dayMs];
  const belowOneMinute = elapsed < 60_000;
  const value = Math.max(1, Math.floor(elapsed / unitMs));
  const longDwell = elapsed >= 7 * dayMs;
  return (
    <small
      className="schedule-dwell-time"
      title={`节点进入时间：${new Date(startedAt!).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`}
    >
      {belowOneMinute ? "已停留不足 " : "已停留 "}
      <span className={`schedule-dwell-duration${longDwell ? " is-long-dwell" : ""}`}>
        <strong className="schedule-dwell-value" key={`${belowOneMinute}-${value}-${unit}`}>{value}</strong>{" "}{unit}
      </span>
    </small>
  );
}

const ScheduleRowNodeSummary = memo(function ScheduleRowNodeSummary({
  entry, liveNodes, detailNodes, records, highlightOwnerId, highlightMine, personFor, displayPerson, contextMessage,
}: {
  entry: Entry;
  liveNodes?: Map<string, LiveScheduleNode>;
  detailNodes?: ScheduleCurrentNode[];
  records?: ScheduleRecord[];
  highlightOwnerId: string;
  highlightMine: boolean;
  personFor: (entry: Entry, id: string) => SchedulePerson | undefined;
  displayPerson: (entry: Entry, id: string) => string;
  contextMessage?: string;
}) {
  const currentNodes = sortScheduleCurrentNodes(detailNodes ?? Array.from(liveNodes?.values() || [])
    .map(({ entry, owners, unknownOwner }) => ({ id: entry.identity.node || entry.id,
      name: entry.record.nodeName, owners: [...owners].map((id) => ({ ...personFor(entry, id), id,
        name: displayPerson(entry, id) })), unknownOwner })), records ?? [], entry.identity);
  const resolvedNodes = currentNodes.map(({ id, name, owners, unknownOwner }) => {
    const nodeOwners: SchedulePerson[] = owners.map((person) => {
      const known = personFor(entry, person.id);
      return {
        ...known,
        ...person,
        connection: entry.identity.connection,
        project: entry.identity.project,
        avatar: person.avatar || known?.avatar,
        name: isFallbackPersonName(person.name, person.id) ? displayPerson(entry, person.id) : person.name,
      };
    });
    if (unknownOwner) nodeOwners.push({ id: "", name: "尚有负责人身份不明" });
    if (!nodeOwners.length) nodeOwners.push({ id: "", name: "负责人不明" });
    const liveNode = liveNodes?.get(id);
    const isCurrentOwner = Boolean(
      (highlightOwnerId && (owners.some((person) => person.id === highlightOwnerId) || liveNode?.owners.has(highlightOwnerId))) ||
      (highlightMine && liveNode?.mine),
    );
    return { id, name, owners: nodeOwners, style: nodeColorStyle({ ...entry.record, nodeName: name }), isCurrentOwner };
  });

  if (!resolvedNodes.length && !contextMessage) return null;
  const primaryNode = resolvedNodes.length > 2 ? resolvedNodes.find((node) => node.isCurrentOwner) ?? resolvedNodes[0] : undefined;
  const visibleNodes = primaryNode ? [primaryNode] : resolvedNodes;
  const hiddenNodes = primaryNode ? resolvedNodes.filter((node) => node !== primaryNode) : [];
  return (
    <small className="schedule-row-current schedule-row-current-nodes">
      {visibleNodes.map((node, index) => (
        <Fragment key={node.id}>
          {index > 0 && <span className="schedule-current-node-sep" aria-hidden="true">·</span>}
          <ScheduleNodeOwners name={node.name} owners={node.owners} style={node.style} isCurrentOwner={node.isCurrentOwner} />
        </Fragment>
      ))}
      {hiddenNodes.length > 0 && <ScheduleParallelNodesSummary nodes={resolvedNodes} hiddenNodes={hiddenNodes} />}
      {resolvedNodes.length === 0 && <span className="schedule-node-context-status">{contextMessage}</span>}
    </small>
  );
});

export function SchedulePage({
  onGuardChange,
  requestReload,
  snapshot,
  waitingForSnapshot = false,
  calendarContext = "",
  peopleCacheContext = "",
  calendarCache,
  viewMode,
  onViewModeChange,
  preloadedSession,
  workflow,
  defectRevision = 0,
  workflowRefreshRevision = 0,
}: {
  onGuardChange: (guard: ScheduleGuard) => void;
  requestReload: (reload: () => void) => void;
  snapshot?: Snapshot | null;
  waitingForSnapshot?: boolean;
  calendarContext?: string;
  peopleCacheContext?: string;
  calendarCache?: ScheduleCalendarCache;
  viewMode?: ScheduleMode;
  onViewModeChange?: (view: ScheduleMode) => void;
  preloadedSession?: ScheduleSessionController;
  workflow?: { context: string; busy: boolean; submit: WorkflowSubmit };
  defectRevision?: number;
  workflowRefreshRevision?: number;
}) {
  const initialRead = preloadedSession?.read || null;
  const [epoch, setEpoch] = useState(0);
  const [read, storeRead] = useState<ScheduleRead | null>(() => initialRead);
  const readRef = useRef(read);
  const setRead = (next: ScheduleRead | null) => {
    readRef.current = next;
    storeRead(next);
  };
  const [entries, setEntries] = useState<Entry[]>(() =>
    initialRead ? initialRead.targets.map(createScheduleEntry) : [],
  );
  const [loading, setLoading] = useState(() => !initialRead);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState("");
  const peopleLoadingRef = useRef(false);
  const peopleRequestRef = useRef<{ sessionId: string; promise: Promise<void> } | null>(null);
  const currentSessionIdRef = useRef(initialRead?.sessionId || "");
  const forceResetRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const submittingScheduleNodes = useRef(new Set<string>());
  const [report, setReport] = useState("");
  const [successToast, setSuccessToast] = useState<{ id: number; accepted: number } | null>(null);
  const [selected, setSelected] = useState("");
  const [poolSelection, setPoolSelection] = useState<{ identity: string; owner: string; view: "mine" | "people"; week: string } | null>(null);
  const scrolledPoolSelection = useRef<NonNullable<typeof poolSelection> | null>(null);
  const calendarScrollRef = useRef<HTMLDivElement>(null);
  const calendarHeaderRef = useRef<HTMLDivElement>(null);
  const poolCalendarRowRef = useRef<HTMLDivElement>(null);
  const [defectSelection, setDefectSelection] = useState<{ defect: ScheduleDefect; auth: string } | null>(null);
  const [defectGroups, setDefectGroups] = useState(() => new Map<string, boolean>());
  const [defectWorkflow, setDefectWorkflow] = useState<WorkflowNavigationState | null>(null);
  const [defectWorkflowLoading, setDefectWorkflowLoading] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [workflowSelection, setWorkflowSelection] = useState("");
  const [workflowEditorOpen, setWorkflowEditorOpen] = useState(false);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const workflowPanelId = useId();
  const workflowTrigger = useRef<HTMLButtonElement>(null);
  useWorkflowSubmissions();
  const [localView, setLocalView] = useState<ScheduleMode>("mine");
  const view = viewMode ?? localView;
  const setView = onViewModeChange ?? setLocalView;
  const [cachedPeople, setCachedPeople] = useState<{ context: string; read: ScheduleRead }>();
  const [localProgress, setLocalProgress] = useState<{ context: string; request: ScheduleRequest }>();
  const progress = useScheduleProgress(preloadedSession?.progressRequest ??
    (localProgress?.context === peopleCacheContext ? localProgress.request : null));
  useEffect(() => {
    if (!peopleCacheContext) return;
    let active = true;
    readCachedSchedulePeople().then((cached) => {
      if (active && cached) setCachedPeople((current) => current?.context === peopleCacheContext ? current :
        { context: peopleCacheContext, read: cached });
    }).catch(() => {});
    return () => { active = false; };
  }, [peopleCacheContext]);
  const livePeopleComplete = read && read.peopleLoaded !== false && !read.accountError &&
    (read.complete || (!read.sources.length && !read.itemErrors?.length));
  const scopedPeopleCache = view === "people" && !livePeopleComplete && cachedPeople?.context === peopleCacheContext &&
      (!read?.connection || read.connection === cachedPeople.read.connection) &&
      (!read?.currentUserId || read.currentUserId === cachedPeople.read.currentUserId)
    ? cachedPeople.read : null;
  const cachedPeopleRead = scopedPeopleCache?.targets.length ? scopedPeopleCache : null;
  const baseRead = cachedPeopleRead ?? read;
  const calendarRead = (!read || read.peopleLoaded === false) ? scopedPeopleCache ?? read : baseRead;
  const compatiblePreview = (part: { connection?: string; currentUserId?: string | null } | undefined) =>
    part && !read?.accountError &&
    (!baseRead?.connection || part.connection === baseRead.connection) &&
    (!baseRead?.currentUserId || part.currentUserId === baseRead.currentUserId);
  const stream = compatiblePreview(progress) ? progress : undefined;
  const partial = view === "people" && compatiblePreview(preloadedSession?.partial) ? preloadedSession?.partial : undefined;
  const displayRead = baseRead ?? partial ?? (stream && { ...stream, accountError: null, currentUserAvatar: null,
    spaceNames: undefined, peopleLoaded: false, readAt: "", sessionId: "", sources: [], complete: false });
  const displayUserId = displayRead?.currentUserId;
  const cachedPeopleEntries = useMemo(() => cachedPeopleRead?.targets.map(createScheduleEntry), [cachedPeopleRead]);
  const previewPeople = useMemo(() => [...partial?.people || [], ...stream?.people || []], [partial, stream]);
  const displayEntries = useMemo(() => {
    if (!cachedPeopleEntries && !partial && !stream) return entries;
    const combined = new Map(cachedPeopleEntries?.map((entry) => [entry.id, entry]));
    const liveIds = new Set(entries.map((entry) => entry.id));
    for (const entry of entries) combined.set(entry.id, entry);
    const start = read?.recentRange?.start ?? monday(today());
    const end = read?.recentRange?.end ?? addDays(start, 13);
    for (const target of [...partial?.targets || [], ...stream?.targets || []]) {
      // 预览也提供事项的并行节点上下文，排期行在视图内按归属筛选。
      if (view === "mine" && validSchedule(target.dates) && (target.dates.end < start || target.dates.start > end)) continue;
      const existing = combined.get(target.id);
      if (existing && liveIds.has(target.id) && (scheduleChanged(existing) || existing.result || !existing.readOnlyReason)) continue;
      combined.set(target.id, createScheduleEntry({ ...target, readOnlyReason: target.readOnlyReason || "排期预览，仅供查看" }));
    }
    return [...combined.values()];
  }, [cachedPeopleEntries, entries, partial, stream, view, read?.recentRange]);
  const viewModeRef = useRef(view);
  viewModeRef.current = view;
  const [mineWeek, setMineWeek] = useState(() => monday(today()));
  const [peopleWeek, setPeopleWeek] = useState(() => monday(today()));
  const [peopleViewDays, setPeopleViewDays] = useState(7);
  const [minePeriods, setMinePeriods] = useState<1 | 2>(1);
  const [peoplePeriods, setPeoplePeriods] = useState<1 | 2>(1);
  const week = view === "mine" ? mineWeek : peopleWeek;
  const setWeek = view === "mine" ? setMineWeek : setPeopleWeek;
  const viewDays = view === "mine" ? 7 : peopleViewDays;
  const viewPeriods = view === "mine" ? minePeriods : peoplePeriods;
  const daySpan = viewDays * viewPeriods;
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [mineProject, setMineProject] = useState("");
  const [peopleProject, setPeopleProject] = useState("");
  const [mineRelatedProject, setMineRelatedProject] = useState("");
  const [peopleRelatedProject, setPeopleRelatedProject] = useState("");
  const project = view === "mine" ? mineProject : peopleProject;
  const setProject = view === "mine" ? setMineProject : setPeopleProject;
  const relatedProject = view === "mine" ? mineRelatedProject : peopleRelatedProject;
  const setRelatedProject = view === "mine" ? setMineRelatedProject : setPeopleRelatedProject;
  const [person, setPerson] = useState<string[]>([]);
  const [personQuery, setPersonQuery] = useState("");
  const [personSearchRequest, setPersonSearchRequest] = useState(0);
  const [editableOnly, setEditableOnly] = useState(false);
  const [poolCollapsed, setPoolCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [poolTab, setPoolTab] = useState<"pending" | "outside" | "defects">("pending");
  const defectRead = useScheduleDefects(read, snapshot, defectRevision, calendarContext);
  const [reviewOpen, setReviewOpen] = useState(false);
  const scheduleReviewBlockedIds = useRef("");
  const [hoveredTarget, setHoveredTarget] = useState<{ id: string; owner?: string }>();
  const [preview, setPreview] = useState<{ id: string; start: string; end: string } | null>(null);
  const drag = useRef<Drag | null>(null);
  const blankGridRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const reviewBackdropRef = useRef<HTMLDivElement>(null);
  const reviewScrollRef = useScrollIsolation(reviewBackdropRef);

  const currentToday = today();
  const days = Array.from({ length: daySpan }, (_, index) => addDays(week, index));
  const windowStart = days[0];
  const windowEnd = days[days.length - 1];
  const thisWeek = read?.recentRange?.start ?? monday(currentToday);
  const viewingHistory = windowStart < thisWeek;
  const preloadsEnabled = preloadedSession?.calendarRefreshEnabled !== false;
  const [calendarKey, preloadCalendarKeys, calendarReady] = useMemo((): [string, string[], boolean] => {
    const request = scheduleHistoryRequest(calendarRead, snapshot, view, { start: windowStart, end: windowEnd });
    if (!request) return ["", [], false];
    if (view === "people" && peopleCacheContext && request.connection && request.currentUser) request.cachePeople = true;
    const keyForWeek = (offset: number) => {
      const start = addDays(windowStart, offset);
      const end = addDays(windowEnd, offset);
      if (!validViewDate(start) || !validViewDate(end)) return "";
      return JSON.stringify([calendarContext, { ...request, range: { start, end } }]);
    };
    const visibleKey = keyForWeek(0);
    // 个人待办没有事项时，日历接口仍可按已启用来源发现历史查询范围。
    const canDiscoverScopes = snapshot?.sources.some((source) => source.enabled && source.executable && source.kind === "personal_todo");
    const scopeReady = Boolean(request.connection && request.currentUser && (request.scopes.length || canDiscoverScopes) &&
      !calendarRead?.accountError && (view !== "people" || calendarRead?.peopleLoaded !== false));
    const neighbors = scopeReady && preloadsEnabled
      ? [-1, 1, -2, 2].map((step) => keyForWeek(step * viewDays)).filter(Boolean)
      : [];
    return [visibleKey, neighbors, scopeReady];
  }, [calendarRead, snapshot, view, calendarContext, peopleCacheContext, windowStart, windowEnd, viewDays, preloadsEnabled]);
  const defectWorkflowInteraction = Boolean(defectWorkflowLoading || defectWorkflow?.editing || defectWorkflow?.busy || defectWorkflow?.uncertain);
  const workflowInteraction = workflowEditorOpen || workflowLoading || defectWorkflowInteraction || viewSettingsOpen;
  const dirty = entries.some(scheduleChanged);
  const uncertain = entries.some((entry) => entry.result === "uncertain");
  const interacting = reviewOpen || dragging || peopleLoading || datePickerOpen || workflowInteraction;
  const managedCalendar = preloadedSession?.calendarRefreshEnabled !== undefined && calendarReady;
  const {
    data: currentHistory, loading: calendarLoading, failed: calendarFailed, checkedAt: calendarCheckedAt, retry: retryCalendar,
  } = useScheduleCalendar(
    calendarKey,
    preloadCalendarKeys,
    managedCalendar ? (viewingHistory ? HISTORICAL_SCHEDULE_INTERVAL : RECENT_SCHEDULE_INTERVAL) : undefined,
    managedCalendar && (!preloadedSession?.calendarRefreshEnabled || dirty || busy || uncertain || interacting),
    calendarCache,
  );
  const historicalEntries = useMemo(
    () => currentHistory?.targets.map(createScheduleEntry) || [],
    [currentHistory],
  );
  const recentCheckedAt = cachedPeopleRead?.readAtMs ?? preloadedSession?.checkedAt;
  const lastCheckFailed = Boolean(preloadedSession?.refreshError || (managedCalendar && calendarFailed));
  const showingPartialPeople = view === "people" && !livePeopleComplete && !cachedPeopleRead;
  const lastCheckedAt = viewingHistory ? calendarCheckedAt : managedCalendar
    ? recentCheckedAt !== undefined && calendarCheckedAt !== undefined ? Math.min(recentCheckedAt, calendarCheckedAt)
      : lastCheckFailed ? recentCheckedAt : undefined
    : recentCheckedAt;
  const persistentWarnings = Array.from(new Set(entries.flatMap((entry) =>
    entry.resultWarning ? entry.resultWarning.split("\n") : [],
  )));
  const nodeKey = (entry: Entry) =>
    JSON.stringify([
      entry.identity.connection,
      entry.identity.project,
      entry.identity.type,
      entry.identity.item,
      entry.identity.node,
    ]);
  const frozenNodes = new Set(entries.filter((entry) => entry.result === "uncertain").map(nodeKey));

  useLayoutEffect(() => {
    onGuardChange({ dirty, busy, uncertain, ...(interacting ? { interacting: true } : {}),
      ...(defectWorkflow && (defectWorkflow.dirty || defectWorkflow.busy || defectWorkflow.uncertain) ? { defectWorkflow } : {}) });
  }, [dirty, busy, uncertain, interacting, defectWorkflow, onGuardChange]);
  useLayoutEffect(() => () => preloadedSession?.endInteraction?.(), []);

  useEffect(() => {
    if (!successToast) return;
    const timer = window.setTimeout(() => {
      setSuccessToast(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [successToast]);

  useEffect(() => {
    if (waitingForSnapshot) return;
    let active = true;
    if (!preloadedSession?.read) setSelected("");
    setHoveredTarget(undefined);
    setReport("");
    setSuccessToast(null);
    setReviewOpen(false);
    setPeopleError("");
    setLocalProgress(undefined);
    peopleLoadingRef.current = false;
    setPeopleLoading(false);

    if (preloadedSession) {
      if (epoch === 0 && preloadedSession.read) {
        currentSessionIdRef.current = preloadedSession.read.sessionId;
        setRead(preloadedSession.read);
        setEntries(preloadedSession.read.targets.map(createScheduleEntry));
        setError("");
        setLoading(false);
        return () => {
          active = false;
          currentSessionIdRef.current = "";
          peopleLoadingRef.current = false;
        };
      }
      const cachedRead = preloadedSession.read;
      currentSessionIdRef.current = cachedRead?.sessionId || "";
      setLoading(true);
      setError("");
      setRead(preloadedSession.read);
      setEntries(preloadedSession.read?.targets.map(createScheduleEntry) || []);
      const forceReset = forceResetRef.current;
      forceResetRef.current = false;
      const request =
        epoch === 0 && preloadedSession.pending
          ? preloadedSession.pending
          : preloadedSession.reload(
              forceReset
                ? { includePeople: viewModeRef.current === "people", forceReset: true }
                : { includePeople: viewModeRef.current === "people" },
            );
      request
        .then((result) => {
          if (!active) return;
          // 有缓存时由控制器统一采用候选；这里不能用 Promise 的旧结果覆盖读取期间产生的草稿。
          if (cachedRead && (preloadedSession.consumeCandidate || cachedRead.sessionId === result.sessionId)) return;
          currentSessionIdRef.current = result.sessionId;
          setRead(result);
          setEntries(result.targets.map(createScheduleEntry));
          preloadedSession.updateRead(result);
        })
        .catch((failure: unknown) => {
          if (active) setError(`读取事项安排失败：${readFailureMessage(asError(failure).kind)}`);
        })
        .finally(() => {
          if (active) { setLoading(false); setManualRefreshing(false); }
        });
      return () => {
        active = false;
        currentSessionIdRef.current = "";
        peopleLoadingRef.current = false;
      };
    }

    currentSessionIdRef.current = "";
    setLoading(true);
    setError("");
    setRead(null);
    setEntries([]);
    const request = loadScheduleSession();
    setLocalProgress({ context: peopleCacheContext, request });
    request
      .then((result) => {
        if (!active) return;
        currentSessionIdRef.current = result.sessionId;
        setRead(result);
        setEntries(result.targets.map(createScheduleEntry));
      })
      .catch((failure: unknown) => {
        if (active) setError(`读取事项安排失败：${readFailureMessage(asError(failure).kind)}`);
      })
      .finally(() => {
        if (active) { setLoading(false); setManualRefreshing(false); setLocalProgress(undefined); }
      });
    return () => {
      active = false;
      currentSessionIdRef.current = "";
      peopleLoadingRef.current = false;
      void closeScheduleSession(request).catch(() => {});
    };
  }, [epoch, waitingForSnapshot]);

  const triggerLoadPeople = (currentRead: ScheduleRead) => {
    if (currentRead.peopleLoaded !== false || peopleLoadingRef.current) return;
    preloadedSession?.onInteraction?.();
    const targetSessionId = currentRead.sessionId;
    preloadedSession?.onPeopleChecking?.(targetSessionId);
    currentSessionIdRef.current = targetSessionId;
    peopleLoadingRef.current = true;
    setPeopleLoading(true);
    setPeopleError("");
    const request = loadSchedulePeople(targetSessionId);
    setLocalProgress({ context: peopleCacheContext, request });
    const promise = request
      .then((nextRead) => {
        if (currentSessionIdRef.current !== targetSessionId) return;
        const latest = readRef.current ?? currentRead;
        const local = new Map(latest.targets.filter((target) => target.result).map((target) => [target.id, target]));
        const targets = nextRead.targets.map((target) => {
          const result = local.get(target.id);
          return result ? { ...target, dates: result.dates, result: result.result,
            resultMessage: result.resultMessage, resultWarning: result.resultWarning } : target;
        });
        const compatible = patchScheduleData(latest, { ...nextRead, targets }, !nextRead.complete);
        setRead(compatible);
        setEntries((current) => {
          const existingMap = new Map(current.map((item) => [item.id, item]));
          const merged: Entry[] = [];
          const seen = new Set<string>();
          for (const record of compatible.targets) {
            seen.add(record.id);
            const prevEntry = existingMap.get(record.id);
            if (prevEntry) {
              const keepLocal = scheduleChanged(prevEntry) || prevEntry.result === "uncertain";
              if (prevEntry.record === record) { merged.push(prevEntry); continue; }
              merged.push({
                ...prevEntry,
                baseline: keepLocal ? prevEntry.baseline : { ...record.dates },
                dates: keepLocal ? prevEntry.dates : { ...record.dates },
                readOnlyReason: resolveDefaultReadOnlyReason(record),
                record,
              });
            } else {
              merged.push(createScheduleEntry(record));
            }
          }
          for (const prevEntry of current) {
            if (!seen.has(prevEntry.id)) merged.push(prevEntry);
          }
          return merged;
        });
        preloadedSession?.updateRead(compatible);
        preloadedSession?.onPeopleChecked?.(compatible);
        if (compatible.peopleLoaded === true && !compatible.accountError && !compatible.itemErrors?.length &&
          (compatible.complete || !compatible.sources.length)) {
          setCachedPeople({ context: peopleCacheContext, read: compatible });
        }
      })
      .catch((failure: unknown) => {
        if (currentSessionIdRef.current !== targetSessionId) return;
        setPeopleError(`读取团队成员排期失败：${readFailureMessage(asError(failure).kind)}`);
        preloadedSession?.onPeopleChecked?.();
      })
      .finally(() => {
        if (peopleRequestRef.current?.promise === promise) peopleRequestRef.current = null;
        if (currentSessionIdRef.current === targetSessionId) {
          peopleLoadingRef.current = false;
          setPeopleLoading(false);
          setLocalProgress((prior) => prior?.request === request ? undefined : prior);
        }
      });
    peopleRequestRef.current = { sessionId: targetSessionId, promise };
  };

  const peopleSessionId = view === "people" && read?.peopleLoaded === false ? read.sessionId : "";
  useEffect(() => {
    if (peopleSessionId && read) triggerLoadPeople(read);
  }, [peopleSessionId]);

  useLayoutEffect(() => {
    if (!preloadedSession) return;
    const protectedInteraction = dirty || busy || busyRef.current || uncertain || reviewOpen || dragging || peopleLoading || datePickerOpen || workflowInteraction;
    const next = preloadedSession.candidate ?? preloadedSession.read;
    if (preloadedSession.candidate && preloadedSession.consumeCandidate?.(preloadedSession.candidate, !protectedInteraction) === false) return;
    if (protectedInteraction) return;
    if (
      next &&
      next.sessionId !== currentSessionIdRef.current
    ) {
      currentSessionIdRef.current = next.sessionId;
      peopleLoadingRef.current = false;
      setPeopleLoading(false);
      setPeopleError("");
      setRead(next);
      if (next.peopleLoaded === true && (next.complete || (!next.sources.length && !next.itemErrors?.length)) && !next.accountError) {
        setCachedPeople({ context: peopleCacheContext, read: next });
      }
      const selectedIdentity = displayEntries.find((entry) => entry.id === selected)?.identity;
      setSelected(selectedIdentity ? next.targets.find((target) => target.id === selected)?.id ??
        next.targets.find((target) => JSON.stringify(target.identity) === JSON.stringify(selectedIdentity))?.id ?? "" : selected);
      setEntries((current) => {
        const prior = new Map(current.map((entry) => [entry.id, entry]));
        const updated = next.targets.map((record) => {
          const entry = prior.get(record.id);
          return entry?.record === record ? entry : createScheduleEntry(record);
        });
        return updated.length === current.length && updated.every((entry, index) => entry === current[index]) ? current : updated;
      });
      setError("");
      setLoading(false);
      if (viewModeRef.current === "people" && next.peopleLoaded === false) {
        triggerLoadPeople(next);
      }
      return;
    }
    if (!preloadedSession.read && preloadedSession.pending && currentSessionIdRef.current) {
      let active = true;
      currentSessionIdRef.current = "";
      peopleLoadingRef.current = false;
      setPeopleLoading(false);
      setPeopleError("");
      setLoading(true);
      setError("");
      const req = preloadedSession.pending;
      req
        .then((result) => {
          if (!active) return;
          currentSessionIdRef.current = result.sessionId;
          setRead(result);
          setEntries(result.targets.map(createScheduleEntry));
          if (viewModeRef.current === "people" && result.peopleLoaded === false) {
            triggerLoadPeople(result);
          }
        })
        .catch((failure: unknown) => {
          if (active) setError(`读取事项安排失败：${readFailureMessage(asError(failure).kind)}`);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }
  }, [preloadedSession?.candidate, preloadedSession?.read, preloadedSession?.pending, dirty, busy, uncertain, reviewOpen, dragging, peopleLoading, datePickerOpen, workflowInteraction]);

  const knownPeople = useMemo(() => [...currentHistory?.people || [], ...baseRead?.people || [], ...previewPeople],
    [currentHistory?.people, baseRead?.people, previewPeople]);
  const profiles = useScheduleProfiles(peopleCacheContext, displayRead?.connection, displayUserId, knownPeople);
  const people = useMemo(() => {
    const values = new Map<string, SchedulePerson>();
    for (const item of knownPeople) {
      const key = JSON.stringify([item.connection || null, item.project || null, item.id]);
      const prior = values.get(key);
      const profile = profiles?.get(item.id);
      const name = [item.name, prior?.name, profile?.name].find((name) => name && !isFallbackPersonName(name, item.id));
      values.set(key, { ...item, name: name || item.name, avatar: item.avatar || prior?.avatar || profile?.avatar });
    }
    return values;
  }, [knownPeople, profiles]);
  const currentUserAvatar = displayRead?.currentUserAvatar;
  const personFor = useCallback((entry: Entry, id: string): SchedulePerson | undefined => {
    if (!id) return undefined;
    const scoped = people.get(
      JSON.stringify([entry.identity.connection, entry.identity.project, id]),
    );
    const global = people.get(JSON.stringify([null, null, id]));
    const fallbackAvatar =
      id === displayUserId ? currentUserAvatar || undefined : undefined;
    if (scoped && !isFallbackPersonName(scoped.name, id)) {
      return {
        ...scoped,
        avatar: scoped.avatar || global?.avatar || fallbackAvatar,
      };
    }
    if (global && !isFallbackPersonName(global.name, id)) {
      return {
        ...scoped,
        ...global,
        avatar: scoped?.avatar || global.avatar || fallbackAvatar,
      };
    }
    const base = scoped || global;
    if (base) {
      return {
        ...global,
        ...base,
        avatar: scoped?.avatar || global?.avatar || fallbackAvatar,
      };
    }
    return undefined;
  }, [people, displayUserId, currentUserAvatar]);
  const resolveOwnerId = (entry: Entry, owner: string) =>
    owner ||
    entry.record.ownerId ||
    entry.record.ownerIds[0] ||
    (entry.record.mine ? displayUserId || "" : "") ||
    "";
  const fallbackBySpace = useMemo(() => {
    const groups = new Map<string, Map<string, number>>();
    for (const entry of displayEntries) {
      const key = JSON.stringify([entry.identity.connection, entry.identity.project]);
      const owners = groups.get(key) || new Map<string, number>();
      for (const id of [entry.record.ownerId, ...entry.record.ownerIds]) {
        if (!id || id === displayUserId || owners.has(id)) continue;
        const name = personFor(entry, id)?.name;
        if (!name || isFallbackPersonName(name, id)) owners.set(id, owners.size + 1);
      }
      groups.set(key, owners);
    }
    return groups;
  }, [displayEntries, displayUserId, personFor]);
  const displayPerson = useCallback((entry: Entry, id: string) => {
    if (!id) return "负责人不明";
    const rawName = personFor(entry, id)?.name;
    if (!rawName || isFallbackPersonName(rawName, id)) {
      if (id === displayUserId) return "当前用户";
      const group = fallbackBySpace.get(JSON.stringify([entry.identity.connection, entry.identity.project]));
      return group && group.size > 1 && group.has(id) ? `团队成员 ${group.get(id)}` : "团队成员";
    }
    const peers = [...people.values()].filter(
      (item) =>
        item.connection === entry.identity.connection &&
        item.project === entry.identity.project &&
        item.name === rawName &&
        item.id !== id,
    );
    if (!peers.length) return rawName;
    const chars = Array.from(id);
    let length = Math.min(6, chars.length);
    while (
      length < chars.length &&
      peers.some(
        (peer) => Array.from(peer.id).slice(-length).join("") === chars.slice(-length).join(""),
      )
    )
      length++;
    return `${rawName} (${chars.slice(-length).join("")})`;
  }, [personFor, displayUserId, fallbackBySpace, people]);
  const groupKey = (entry: Entry, id: string) =>
    JSON.stringify([entry.identity.connection, entry.identity.project, id]);
  const collapseKey = (area: string, entry: Entry, owner: string) =>
    JSON.stringify([area, groupKey(entry, owner)]);
  const groupHidden = (area: string, entry: Entry, owner: string) =>
    view === "people" && collapsedGroups.has(collapseKey(area, entry, owner));
  const renderGroupToggle = (area: string, entry: Entry, owner: string, count: number) => {
    const collapsed = groupHidden(area, entry, owner);
    const name = owner ? displayPerson(entry, owner) : "负责人不明";
    return (
      <button
        type="button"
        className="schedule-group"
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "展开" : "收起"}${name}的${area === "calendar" ? "日历安排" : area === "pending" ? "待排期" : "已排期"}，共${count}项`}
        onClick={() => {
          const key = collapseKey(area, entry, owner);
          setCollapsedGroups((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          });
        }}
      >
        <ScheduleAvatar person={personFor(entry, resolveOwnerId(entry, owner))} />
        <span className="schedule-group-name">{name}</span>
        <span className="schedule-group-count" aria-hidden="true">{count} 项</span>
        <ChevronDown className="schedule-group-chevron" size={15} aria-hidden="true" />
      </button>
    );
  };
  const ownerLabel = (entry: Entry, owner: string) => {
    const ids =
      entry.identity.scope === "node"
        ? entry.record.ownerIds.filter(Boolean)
        : [owner || entry.identity.owner || ""].filter(Boolean);
    const labels = Array.from(new Set(ids)).map((id) => displayPerson(entry, id));
    if (entry.record.unknownOwner) labels.push("尚有负责人身份不明");
    return labels.join("、") || "负责人不明";
  };
  const targetScopeLabel = (entry: Entry) =>
    entry.record.cacheKind === "associated_item"
      ? "事项排期"
      : entry.record.cacheKind === "detail_node"
      ? "事项详情缓存节点"
      : entry.record.sourceAggregate
        ? "来源聚合日期"
        : entry.identity.scope === "node"
          ? "节点共同排期"
          : "";
  const targetLabel = (entry: Entry, owner: string) =>
    [targetScopeLabel(entry), ownerLabel(entry, owner)].filter(Boolean).join(" ");
  const projectNames = new Map<string, string>();
  for (const space of snapshot?.workspace_catalog || []) {
    const name = space.name || space.simple_name;
    if (!name) continue;
    projectNames.set(space.project_key, name);
    if (space.simple_name) projectNames.set(space.simple_name, name);
  }
  for (const [space, name] of Object.entries({ ...displayRead?.spaceNames, ...read?.spaceNames })) {
    projectNames.set(space, name);
  }
  const typeNames = new Map(
    (snapshot?.sources || []).flatMap((item) =>
      (item.type_scope?.types || []).map(
        (typeItem) => [JSON.stringify([typeItem.project_key, typeItem.type_key]), typeItem.type_name] as const,
      ),
    ),
  );

  const isCurrentSchedulablePoolNode = (entry: Entry) =>
    isCurrentSchedulableStatus(entry.record.nodeStatus) &&
    (entry.record.scheduleRequired !== false ||
      validSchedule(entry.dates) ||
      scheduleChanged(entry));
  const isPastTransitionedNode = (entry: Entry) =>
    isPastTransitionedStatus(entry.record.nodeStatus);

  const isEditableTarget = (entry: Entry) =>
    !read?.accountError &&
    !entry.record.sourceAggregate &&
    entry.record.mine &&
    !entry.readOnlyReason &&
    !isPastTransitionedNode(entry) &&
    normalizeNodeStatus(entry.record.nodeStatus) !== "not_started" &&
    !frozenNodes.has(nodeKey(entry));
  const readUnavailable = !read;
  const canEdit = (entry: Entry) => view === "mine" && isEditableTarget(entry) && !busy && !readUnavailable;

  const itemIdentityKey = (entry: Entry) =>
    JSON.stringify([
      entry.identity.connection,
      entry.identity.project,
      entry.identity.type,
      entry.identity.item,
      entry.record.title,
    ]);

  const cachedItems = new Map((snapshot?.items || []).map((item) => [itemKey(item), item]));
  const inViewScope = (entry: Entry) => view === "people" || belongsInMine(entry.record, !!read?.accountError);
  const filterEntries = [...displayEntries, ...historicalEntries].filter(inViewScope);
  const scheduleProjectsByItem = new Map<string, RelatedProject[]>();
  for (const entry of [...historicalEntries, ...cachedPeopleEntries || [], ...entries]) {
    if (entry.record.relatedProjects !== undefined) {
      scheduleProjectsByItem.set(itemKey(workflowItemFor(entry)), entry.record.relatedProjects);
    }
  }
  const itemProjects = (key: string) => scheduleProjectsByItem.get(key) ?? cachedItems.get(key)?.related_projects;
  const matchesRelatedProject = (space: string, projects: RelatedProject[] | undefined) =>
    !relatedProject || (relatedProject === unreadRelatedProject
      ? projects === undefined
      : relatedProject === missingProject
        ? projects?.length === 0
        : projects?.some((entry) => relatedProjectKey(space, entry) === relatedProject));
  const loadedSchedulePeople = useMemo(() => [...people.values()], [people]);
  const loadedOwnerKeys = new Set(loadedSchedulePeople
    .filter((owner) => owner.id && (!read?.connection || !owner.connection || owner.connection === read.connection))
    .map((owner) => JSON.stringify([owner.project || null, owner.id])));
  const defects = defectRead.defects.flatMap((defect) => {
    if ((project && defect.project !== project) || !matchesRelatedProject(defect.project, itemProjects(defectKey(defect)))) return [];
    const owners = defect.owners.filter((owner) => view === "mine" ? owner.id === read?.currentUserId
      : (!person.length || person.includes(owner.id)) && (loadedOwnerKeys.has(JSON.stringify([defect.project, owner.id]))
        || loadedOwnerKeys.has(JSON.stringify([null, owner.id]))));
    return owners.length ? [{ ...defect, owners }] : [];
  });
  const selectedDefectKey = defectSelection ? defectKey(defectSelection.defect) : "";
  const liveDefect = defects.find((defect) => defectKey(defect) === selectedDefectKey);
  const selectedDefect = defectSelection?.auth === defectRead.auth && defectRead.ready
    ? liveDefect || (defectWorkflowInteraction ? defectSelection.defect : undefined) : undefined;
  const defectReadFailed = defectRead.failedProjects.some((space) => !project || project === space);
  const defectLoading = defectRead.loading || (view === "people" && read?.peopleLoaded === false && !peopleError);
  const showDefectCount = defectRead.ready && (defects.length > 0 || (!defectLoading && !defectReadFailed));
  const cachedItemFor = (entry: Entry) => cachedItems.get(JSON.stringify([
    entry.identity.project, entry.identity.type, entry.identity.item,
  ]));
  const teamReadMissing = view === "people" && filterEntries.length === 0 &&
    (loading || !!error || (read !== null && !livePeopleComplete) || lastCheckFailed);
  const teamReadMessage = teamReadMissing
    ? loading || peopleLoading || (read?.peopleLoaded === false && !peopleError)
      ? "正在读取人员排期…"
      : "暂未取得人员排期，请重新读取。"
    : "";
  const noAssociatedSchedule = view === "people" && livePeopleComplete && filterEntries.length === 0;
  const projectItems = [];
  let hasUnreadProjects = false;
  for (const entry of filterEntries) {
    if (project && entry.identity.project !== project) continue;
    const item = workflowItemFor(entry);
    const projects = itemProjects(itemKey(item));
    if (projects === undefined) hasUnreadProjects = true;
    else projectItems.push({ id: item.id, related_projects: projects });
  }
  const relatedProjectOptions = projectFilterOptions(projectItems, snapshot?.workspace_catalog || [], "", "");
  if (hasUnreadProjects) {
    relatedProjectOptions.push({ value: unreadRelatedProject, label: "项目信息未读取" });
  }
  if (relatedProject && !relatedProjectOptions.some((option) => option.value === relatedProject)) {
    const catalogOption = snapshot?.workspace_catalog?.flatMap((space) => space.projects.map((entry) => ({
      value: relatedProjectKey(space.project_key, entry), label: entry.name,
    }))).find((option) => option.value === relatedProject);
    relatedProjectOptions.push(catalogOption || { value: relatedProject, label: "已保存的项目筛选（暂无事项）" });
  }

  const matchesFilters = (entry: Entry) =>
      (!project || entry.identity.project === project) &&
      inViewScope(entry) &&
      matchesRelatedProject(entry.identity.project, itemProjects(itemKey(workflowItemFor(entry)))) &&
      (view !== "people" || person.length === 0 || entry.record.ownerIds.some((id) => person.includes(id))) &&
      (view !== "mine" || !editableOnly || isEditableTarget(entry));
  const visible = displayEntries.filter(matchesFilters);
  const liveSchedules = new Set<string>();
  const calendarOwnerKey = (entry: Entry, owner?: string | null) => JSON.stringify([nodeKey(entry), owner]);
  for (const entry of visible) {
    if (!entry.identity.node) continue;
    for (const owner of entry.record.ownerIds) {
      const ownerKey = calendarOwnerKey(entry, owner);
      // 历史接口是同一节点排期的补充快照；日期变化不能生成第二条节点。
      // 当前无有效日期且没有本地变更时，仍允许历史快照补齐可用内容。
      if (validSchedule(entry.dates) || scheduleChanged(entry) || entry.result === "accepted") liveSchedules.add(ownerKey);
    }
  }
  const calendarEntries = [...visible, ...historicalEntries.filter((entry) => {
    const ownerKey = calendarOwnerKey(entry, entry.record.ownerId);
    return matchesFilters(entry) && !liveSchedules.has(ownerKey);
  })];

  const personOptions = new Map<string, Set<string>>();
  for (const item of loadedSchedulePeople) {
    if (item.id === displayUserId) continue;
    if (project && item.project && item.project !== project) continue;
    if (!person.includes(item.id) && !`${item.name} ${item.id}`.toLowerCase().includes(personQuery.toLowerCase())) continue;
    const names = personOptions.get(item.id) || new Set<string>();
    names.add(item.name || item.id);
    personOptions.set(item.id, names);
  }
  const personBaseLabels = Array.from(personOptions, ([id, names]) => {
    const realNames = Array.from(names).filter((name) => !isFallbackPersonName(name, id));
    const baseLabel = realNames.length ? realNames.join(" / ") : "成员";
    return [id, baseLabel] as const;
  });
  const personLabelCounts = new Map<string, string[]>();
  for (const [id, label] of personBaseLabels) {
    const ids = personLabelCounts.get(label) || [];
    ids.push(id);
    personLabelCounts.set(label, ids);
  }
  const personFilterEntries: Array<[string, string]> = personBaseLabels.map(([id, label]) => {
    const peerIds = (personLabelCounts.get(label) || []).filter((otherId) => otherId !== id);
    if (!peerIds.length) return [id, label];
    const chars = Array.from(id);
    let length = Math.min(6, chars.length);
    while (
      length < chars.length &&
      peerIds.some(
        (peerId) =>
          Array.from(peerId).slice(-length).join("") === chars.slice(-length).join(""),
      )
    ) {
      length++;
    }
    return [id, `${label} (${chars.slice(-length).join("")})`];
  });
  const currentUserGlobal = displayUserId
    ? people.get(JSON.stringify([null, null, displayUserId]))
    : undefined;
  const currentUserScopedReal = displayUserId
    ? loadedSchedulePeople.find((item) => item.id === displayUserId && !isFallbackPersonName(item.name, displayUserId))
    : undefined;
  const currentUserName = currentUserGlobal && !isFallbackPersonName(currentUserGlobal.name, displayUserId || "")
    ? currentUserGlobal.name
    : currentUserScopedReal?.name;
  if (displayUserId) {
    personFilterEntries.unshift([displayUserId, currentUserName ? `${currentUserName}（我）` : "我"]);
  }
  const currentUserDisplayName = currentUserName || "当前用户";
  const currentUserPerson: SchedulePerson | undefined = displayUserId
    ? {
        id: displayUserId,
        name: currentUserDisplayName,
        avatar:
          currentUserGlobal?.avatar ||
          currentUserScopedReal?.avatar ||
          displayRead?.currentUserAvatar ||
          undefined,
      }
    : currentUserGlobal;

  const scopeSourceErrors = read?.sources.filter((source) => source.error) || [];
  const scopeErrors = read?.itemErrors || [];

  const personRows = (items: Entry[]): { entry: Entry; owner: string }[] =>
    items
      .flatMap((entry) =>
        (entry.record.ownerIds.length ? entry.record.ownerIds : [""])
          .filter((id) => person.length === 0 || person.includes(id))
          .map((owner) => ({ entry, owner, name: personFor(entry, owner)?.name || owner, group: groupKey(entry, owner) })),
      )
      .sort((a, b) => a.name.localeCompare(b.name) || a.group.localeCompare(b.group));

  const selectPersonRow = (entry: Entry, owner: string) => {
    setPoolSelection(null);
    setDefectSelection(null);
    setSelected(entry.id);
    setSelectedPerson(view === "people" ? owner : null);
  };
  const personItemKey = (entry: Entry, owner: string) =>
    JSON.stringify([groupKey(entry, owner), view === "people" ? scheduleItemKey(entry.identity) : itemIdentityKey(entry)]);

  const inWindow = (entry: Entry) => validSchedule(entry.dates) &&
    entry.dates.start <= windowEnd && entry.dates.end >= windowStart;
  const selectPoolRow = (entry: Entry, owner: string, locateWeek = false) => {
    selectPersonRow(entry, owner);
    const targetWeek = validSchedule(entry.dates) && (locateWeek || !inWindow(entry))
      ? monday(entry.dates.start) : week;
    if (targetWeek !== week) setWeek(targetWeek);
    setPoolSelection({ identity: JSON.stringify(entry.identity), owner, view, week: targetWeek });
    if (groupHidden("calendar", entry, owner)) {
      setCollapsedGroups((current) => {
        const next = new Set(current);
        next.delete(collapseKey("calendar", entry, owner));
        return next;
      });
    }
  };
  const poolEntry = poolSelection?.view === view && poolSelection.week === week
    ? visible.find((entry) => entry.id === selected && JSON.stringify(entry.identity) === poolSelection.identity)
    : undefined;
  const activePoolSelection = poolEntry ? poolSelection : null;
  const matchesPoolItem = (entry: Entry, owner: string) => poolEntry &&
    scheduleItemKey(entry.identity) === scheduleItemKey(poolEntry.identity) &&
    (view !== "people" || owner === activePoolSelection?.owner);
  const scheduled = calendarEntries.filter(
    inWindow,
  );
  const scheduledEntries = new Set(scheduled);
  const recordsByItem = useMemo(() => {
    const index = new Map<string, ScheduleRecord[]>();
    for (const { record } of entries) {
      const key = scheduleItemKey(record.identity);
      const existing = index.get(key);
      if (existing) existing.push(record);
      else index.set(key, [record]);
    }
    return index;
  }, [entries]);
  // 事项当前节点独立于本行人员、日期及人员筛选；并行节点分别展示完整负责人。
  const currentNodesByItem = useMemo(() => {
    const index = new Map<string, Map<string, LiveScheduleNode>>();
    for (const entry of displayEntries) {
      if (entry.record.sourceAggregate || !entry.record.nodeName.trim() || normalizeNodeStatus(entry.record.nodeStatus) !== "doing") continue;
      const key = scheduleItemKey(entry.identity);
      const nodes = index.get(key) || new Map<string, LiveScheduleNode>();
      const node = entry.identity.node || entry.id;
      const current = nodes.get(node) || { entry, owners: new Set<string>(), unknownOwner: false, mine: false };
      for (const owner of entry.record.ownerIds) if (owner) current.owners.add(owner);
      current.unknownOwner ||= !!entry.record.unknownOwner;
      current.mine ||= !!entry.record.mine;
      nodes.set(node, current);
      index.set(key, nodes);
    }
    return index;
  }, [displayEntries]);
  const currentWeekStart = monday(currentToday);
  const supplementPeopleItems = view === "people" && windowEnd >= currentWeekStart && windowStart <= addDays(currentWeekStart, 6);
  const closedScheduleItems = new Set(displayEntries.filter(({ record }) => record.itemClosed === true ||
    (record.itemClosed === undefined && record.cacheKind === "associated_item" && normalizeNodeStatus(record.nodeStatus) === "finished"))
    .map((entry) => scheduleItemKey(entry.identity)));
  const peopleCalendarEntries = supplementPeopleItems
    ? [...scheduled, ...visible.filter((entry) =>
        !scheduledEntries.has(entry) && !closedScheduleItems.has(scheduleItemKey(entry.identity)) && cachedItemFor(entry)?.is_completed !== true &&
        (entry.record.cacheKind === "associated_item" && !validSchedule(entry.dates) ||
          !entry.record.sourceAggregate && !!entry.identity.node))]
    : scheduled;
  const rawScheduledRows =
    view === "people"
      ? personRows(peopleCalendarEntries)
      : scheduled.map((entry) => ({ entry, owner: entry.record.ownerId || "" }));
  if (poolEntry && activePoolSelection && !validSchedule(poolEntry.dates) &&
    !rawScheduledRows.some(({ entry, owner }) => matchesPoolItem(entry, owner))) {
    rawScheduledRows.push({ entry: poolEntry, owner: activePoolSelection.owner });
  }

  const groupedRowMap = new Map<string, { key: string; owner: string; entries: Entry[] }>();
  for (const { entry, owner } of rawScheduledRows) {
    const key =
      view === "people"
        ? personItemKey(entry, owner)
        : JSON.stringify([
            groupKey(entry, resolveOwnerId(entry, owner)),
            targetLabel(entry, owner),
            itemIdentityKey(entry),
          ]);
    const existing = groupedRowMap.get(key);
    if (existing) {
      if (!existing.entries.some((item) => item.id === entry.id)) {
        existing.entries.push(entry);
      }
    } else {
      groupedRowMap.set(key, { key, owner, entries: [entry] });
    }
  }

  const candidateRows = Array.from(groupedRowMap.values()).map(({ key, owner, entries: groupEntries }) => {
    const sorted = [...groupEntries].sort(
      (a, b) =>
        (a.record.nodeOrder ?? 0) - (b.record.nodeOrder ?? 0) ||
        a.dates.start.localeCompare(b.dates.start) ||
        a.dates.end.localeCompare(b.dates.end) ||
        a.id.localeCompare(b.id),
    );
    const laneLastEndCol: number[] = [];
    // A lane can be reused by checking its last end only when dates are processed left to right.
    const chronological = sorted.filter((entry) => scheduledEntries.has(entry)).sort((a, b) => a.dates.start.localeCompare(b.dates.start));
    const bars = chronological.map((entry) => {
      const startCol = Math.max(
        0,
        days.findIndex((day) => day >= entry.dates.start),
      );
      const endCol = days.reduce(
        (value, day, index) => (day <= entry.dates.end ? index : value),
        0,
      );
      let lane = laneLastEndCol.findIndex((lastEnd) => lastEnd < startCol);
      if (lane === -1) {
        lane = laneLastEndCol.length;
        laneLastEndCol.push(endCol);
      } else {
        laneLastEndCol[lane] = endCol;
      }
      const visibleCols = Math.max(1, endCol - startCol + 1);
      const isSingleCol = daySpan === 14 ? visibleCols <= 2 : visibleCols === 1;
      const isNarrowBar = daySpan === 14 ? visibleCols <= 4 : visibleCols <= 2;
      return {
        entry,
        startCol,
        endCol,
        lane,
        isSingleCol,
        isNarrowBar,
      };
    });
    const laneCount = Math.max(1, laneLastEndCol.length);
    const primaryEntry =
      sorted.find((item) => canEdit(item) && normalizeNodeStatus(item.record.nodeStatus) === "doing") ||
      sorted.find((item) => normalizeNodeStatus(item.record.nodeStatus) === "doing") ||
      sorted.find((item) => canEdit(item)) ||
      sorted[0];
    const rowOwner = view === "people" ? owner : resolveOwnerId(primaryEntry, owner);
    return { key, owner: rowOwner, primaryEntry, bars, laneCount };
  });
  const historyKeys = new Set(historicalEntries.map((entry) => scheduleItemKey(entry.identity)));
  const displayedHistoryKeys = new Set<string>();
  for (const { primaryEntry } of candidateRows) {
    const key = scheduleItemKey(primaryEntry.identity);
    if (calendarKey && historyKeys.has(key)) displayedHistoryKeys.add(key);
  }
  const contextKeys = new Set(displayedHistoryKeys);
  for (const { primaryEntry, bars } of candidateRows) {
    const key = scheduleItemKey(primaryEntry.identity);
    const supplementNeedsStatus = view === "people" && bars.length === 0 && primaryEntry.record.itemClosed === undefined;
    const needsNodeContext = !primaryEntry.record.sourceAggregate &&
      (!currentNodesByItem.has(key) || (view === "mine" && read?.peopleLoaded === false));
    if (primaryEntry.identity.project && primaryEntry.identity.type && primaryEntry.identity.item &&
      (supplementNeedsStatus || needsNodeContext)) contextKeys.add(key);
  }
  // 新到的预览已经包含节点内容，等本轮结束再为缺少上下文的事项补查。
  if (stream || calendarLoading) {
    const settled = new Set((baseRead?.targets || []).map((target) => scheduleItemKey(target.identity)));
    for (const key of contextKeys) if (!settled.has(key)) contextKeys.delete(key);
  }
  const settledHistory = calendarLoading ? undefined : currentHistory?.targets;
  const contextRevision = useMemo(() => [baseRead?.targets, settledHistory, workflowRefreshRevision],
    [baseRead?.targets, settledHistory, workflowRefreshRevision]);
  const itemContexts = useScheduleItemContexts(calendarContext, contextKeys, contextRevision);
  const rows = candidateRows.filter(({ primaryEntry, bars }) => {
    if (view !== "people" || bars.length > 0 || primaryEntry.record.itemClosed === false) return true;
    return !itemContexts?.get(scheduleItemKey(primaryEntry.identity))?.completedStatus;
  });
  const poolRowKey = poolEntry && (rows.find(({ owner, primaryEntry, bars }) =>
    matchesPoolItem(primaryEntry, owner) && (primaryEntry.id === poolEntry.id || bars.some(({ entry }) => entry.id === poolEntry.id))) ??
    rows.find(({ owner, primaryEntry }) => matchesPoolItem(primaryEntry, owner)))?.key;
  useLayoutEffect(() => {
    if (!activePoolSelection || scrolledPoolSelection.current === activePoolSelection) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const smooth = !reduceMotion && typeof calendarScrollRef.current?.scrollTo === "function";
    const centerRow = () => {
      const container = calendarScrollRef.current;
      const header = calendarHeaderRef.current;
      const row = poolCalendarRowRef.current;
      if (!container || !header || !row || row.hidden) return;
      const rowBounds = row.getBoundingClientRect();
      const viewportTop = container.getBoundingClientRect().top + container.clientTop;
      const visibleTop = Math.max(viewportTop, header.getBoundingClientRect().bottom);
      const visibleBottom = viewportTop + container.clientHeight;
      if (visibleBottom <= visibleTop) return;
      scrolledPoolSelection.current = activePoolSelection;
      const offset = (rowBounds.top + rowBounds.bottom - visibleTop - visibleBottom) / 2;
      const top = Math.max(0, Math.min(container.scrollTop + offset, container.scrollHeight - container.clientHeight));
      if (smooth) {
        container.scrollTo({ top, behavior: "smooth" });
      } else {
        container.scrollTop = top;
      }
    };
    if (!smooth) {
      centerRow();
      return;
    }
    // 先完成高亮和检查器的首次绘制，再测量并启动滚动。
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(centerRow);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activePoolSelection, poolRowKey]);

  const pending = visible.filter(
    (entry) => isCurrentSchedulablePoolNode(entry) && !validSchedule(entry.dates),
  );
  const pendingRows =
    view === "people"
      ? personRows(pending)
      : pending.map((entry) => ({ entry, owner: entry.record.ownerId || "" }));

  // 已排期是稳定清单；日历导航只改变视窗，不改变成员或计数。
  const outside = visible.filter(
    (entry) => !isPastTransitionedNode(entry) && validSchedule(entry.dates) &&
      (view === "people" || isEditableTarget(entry)),
  );
  const outsideRows =
    view === "people"
      ? personRows(outside)
      : outside.map((entry) => ({ entry, owner: entry.record.ownerId || "" }));

  const selectedEntry = calendarEntries.find((entry) => entry.id === selected)
    ?? historicalEntries.find((entry) => entry.id === selected && matchesFilters(entry));
  const selectedScopeLabel = selectedEntry ? targetScopeLabel(selectedEntry) : "";
  const selectedPeopleRows = view === "people" && selectedEntry ? personRows([selectedEntry]) : [];
  const activePerson = selectedPeopleRows.find(({ owner }) => owner === selectedPerson)?.owner
    ?? selectedPeopleRows[0]?.owner;
  const highlightTarget = (id: string, owner?: string) => {
    setHoveredTarget({ id, owner: view === "people" ? owner : undefined });
  };
  const clearTargetHighlight = (id: string, owner?: string) => {
    setHoveredTarget((current) =>
      current?.id === id && current.owner === (view === "people" ? owner : undefined)
        ? undefined
        : current,
    );
  };
  const selectedNodeKey = selectedEntry ? nodeKey(selectedEntry) : "";
  const workflowKey = workflow && !cachedPeopleRead && selectedEntry && entries.some((entry) => entry.id === selectedEntry.id) && !selectedEntry.id.startsWith("history:") && selectedEntry.identity.node.trim() &&
    selectedEntry.identity.project.trim() && selectedEntry.identity.type.trim() && selectedEntry.identity.item.trim()
    ? JSON.stringify([workflow.context, selectedNodeKey]) : "";
  const workflowOpen = !!workflowKey && workflowSelection === workflowKey;
  useLayoutEffect(() => { setWorkflowSelection(""); }, [workflowKey]);
  const nodeHasScheduleDraft = workflowOpen && entries.some((entry) => nodeKey(entry) === selectedNodeKey && scheduleChanged(entry));
  const workflowWriteBlocked = frozenNodes.has(selectedNodeKey)
    ? "此节点的排期提交结果待核实。请先核对飞书排期。"
    : busy && submittingScheduleNodes.current.has(selectedNodeKey) ? "此节点的排期正在同步，请等待结果。" : undefined;
  const siblingNodes = (() => {
    if (!selectedEntry) return [];
    const targetItemKey = itemIdentityKey(selectedEntry);
    const candidates = calendarEntries.filter(
      (item) =>
        itemIdentityKey(item) === targetItemKey &&
        (view !== "people" ||
          (activePerson ? item.record.ownerIds.includes(activePerson) : !item.record.ownerIds.length)) &&
        (item.id === selectedEntry.id ||
          validSchedule(item.dates) ||
          isCurrentSchedulablePoolNode(item)),
    );
    const comparePreference = (a: Entry, b: Entry): number => {
      if ((a.id === selectedEntry.id) !== (b.id === selectedEntry.id)) {
        return a.id === selectedEntry.id ? -1 : 1;
      }
      if (view === "mine") {
        const aEditable = canEdit(a);
        const bEditable = canEdit(b);
        if (aEditable !== bEditable) return aEditable ? -1 : 1;
        if (a.record.mine !== b.record.mine) return a.record.mine ? -1 : 1;
      }
      const aValid = validSchedule(a.dates);
      const bValid = validSchedule(b.dates);
      if (aValid !== bValid) return aValid ? -1 : 1;
      if (aValid && bValid) {
        const endCmp = b.dates.end.localeCompare(a.dates.end);
        if (endCmp !== 0) return endCmp;
        const startCmp = b.dates.start.localeCompare(a.dates.start);
        if (startCmp !== 0) return startCmp;
      }
      return a.id.localeCompare(b.id);
    };
    const dedupedByNode = new Map<string, Entry>();
    for (const item of candidates) {
      const key = item.identity.node || item.record.nodeName || item.id;
      const prev = dedupedByNode.get(key);
      if (!prev || comparePreference(item, prev) < 0) {
        dedupedByNode.set(key, item);
      }
    }
    return Array.from(dedupedByNode.values()).sort((a, b) => {
      const aPendingActive = !validSchedule(a.dates);
      const bPendingActive = !validSchedule(b.dates);
      if (aPendingActive !== bPendingActive) {
        return aPendingActive ? -1 : 1;
      }
      if (!aPendingActive && !bPendingActive) {
        const endCmp = b.dates.end.localeCompare(a.dates.end);
        if (endCmp !== 0) return endCmp;
        const startCmp = b.dates.start.localeCompare(a.dates.start);
        if (startCmp !== 0) return startCmp;
      }
      const orderCmp = (b.record.nodeOrder ?? 0) - (a.record.nodeOrder ?? 0);
      if (orderCmp !== 0) return orderCmp;
      return a.id.localeCompare(b.id);
    });
  })();

  const pendingScheduleChanges = entries.filter((entry) => scheduleChanged(entry) && !frozenNodes.has(nodeKey(entry)));
  const blockedScheduleIds = new Set(pendingScheduleChanges.filter(nodeWorkflowNeedsVerification).map((entry) => entry.id));
  const blockedScheduleSignature = JSON.stringify([...blockedScheduleIds]);
  const changedEntries = pendingScheduleChanges.filter((entry) => !blockedScheduleIds.has(entry.id));
  const changedEntryIds = JSON.stringify(changedEntries.map((entry) => entry.id));
  const reviewScope = entries.filter(
    (entry) =>
      (isEditableTarget(entry) && isCurrentSchedulablePoolNode(entry)) ||
      (scheduleChanged(entry) && !frozenNodes.has(nodeKey(entry))),
  );
  const addedEntries = changedEntries.filter(
    (entry) => classifyScheduleReview(entry) === "added",
  );
  const modifiedEntries = changedEntries.filter(
    (entry) => classifyScheduleReview(entry) === "modified",
  );
  const unchangedEntries = reviewScope.filter((entry) => !scheduleChanged(entry));

  useEffect(() => {
    if (!reviewOpen) return;
    if (scheduleReviewBlockedIds.current !== blockedScheduleSignature) {
      setReviewOpen(false);
      setReport("可同步的排期范围已变化，请重新核对。");
    } else if (changedEntries.length === 0) setReviewOpen(false);
  }, [reviewOpen, blockedScheduleSignature, changedEntries.length]);

  useEffect(() => {
    if (!reviewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        setReviewOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reviewOpen]);

  const dateStatus = (entry: Entry) => {
    if (entry.cancel && scheduleChanged(entry)) return "清空草稿已保留 暂不可提交";
    if ((!entry.record.cacheKind || entry.record.cacheKind === "node") && !entry.record.sourceAggregate) {
      if (validSchedule(entry.dates))
        return `已排期：${entry.dates.start} ~ ${entry.dates.end}（共 ${scheduleSpanDays(entry.dates)} 个自然日）`;
      return entry.dates.start || entry.dates.end ? "日期待补齐" : "待安排";
    }
    const label = (state?: string) =>
      ({
        empty: "明确为空",
        missing: "字段缺失",
        invalid: "日期无效",
        unknown: "未知",
        value: "有值",
      }[state || "unknown"] || "未知");
    return `开始：${entry.dates.start || label(entry.record.startState)}；结束：${entry.dates.end || label(entry.record.endState)}`;
  };
  const pendingCardDetails = (entry: Entry, owner: string) => {
    const status = dateStatus(entry);
    if (view === "mine") return `${targetLabel(entry, owner)} ${status}`;
    return [
      entry.record.cacheKind === "detail_node"
        ? "事项详情缓存节点"
        : entry.identity.scope === "node" && !entry.record.sourceAggregate && "节点共同排期",
      entry.record.sourceAggregate && targetScopeLabel(entry),
      entry.record.unknownOwner && "尚有负责人身份不明",
      status !== "待安排" && status,
    ].filter(Boolean).join(" ");
  };
  const projectLabel = (entry: Entry) =>
    projectNames.get(entry.identity.project) || entry.record.projectName || entry.identity.project;
  const typeLabel = (entry: Entry) =>
    typeNames.get(JSON.stringify([entry.identity.project, entry.identity.type])) ||
    entry.record.typeName ||
    entry.identity.type;
  const formatBaselineRange = (dates: { start: string; end: string }) => {
    const s = dates.start.trim();
    const e = dates.end.trim();
    return s && e ? `${s} ~ ${e}` : s || e;
  };
  const isOpaqueKey = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return true;
    return (
      (!/[\u3400-\u9fff]/.test(trimmed) && /^[a-z0-9_.:-]+$/i.test(trimmed)) ||
      trimmed === "p" ||
      trimmed === "t"
    );
  };
  const knownSourceMap: Record<string, string> = {
    "personal-todo": "个人待办",
    personal_todo: "个人待办",
    "participated-story": "参与的需求",
    participated_story: "参与的需求",
    "participating-requirements": "参与的需求",
    participating_requirements: "参与的需求",
    "schedule-associated-stories": "人员排期关联需求",
    "related-story": "我参与的需求",
    related_story: "我参与的需求",
    "related-issue": "关联缺陷",
    related_issue: "关联缺陷",
  };
  const readableSourceName = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return "工作来源";
    const matched = read?.sources.find((src) => src.id === trimmed || src.name === trimmed);
    const lookupId = matched?.id || trimmed;
    // 兼容旧排期快照中和工作来源同名的查询状态。
    if (lookupId === "schedule-associated-stories") return knownSourceMap[lookupId];
    if (matched?.name && !isOpaqueKey(matched.name)) return matched.name;
    const snapMatched = snapshot?.sources.find((src) => src.id === lookupId || src.id === trimmed);
    if (snapMatched) {
      const presetResolved = sourceName(snapMatched);
      if (presetResolved && !isOpaqueKey(presetResolved)) return presetResolved;
    }
    const presetById = sourcePresets.find((p) => p.key === lookupId || p.key === trimmed)?.name;
    if (presetById) return presetById;
    if (matched?.name) {
      const presetByName = sourcePresets.find((p) => p.key === matched.name.trim())?.name;
      if (presetByName) return presetByName;
    }
    if (knownSourceMap[lookupId]) return knownSourceMap[lookupId];
    if (knownSourceMap[trimmed]) return knownSourceMap[trimmed];
    if (matched?.name && knownSourceMap[matched.name.trim()]) return knownSourceMap[matched.name.trim()];
    if (!isOpaqueKey(trimmed)) return trimmed;
    return "工作来源";
  };
  const formatScopeError = (item: NonNullable<ScheduleRead["itemErrors"]>[number]) => {
    const matchedEntry = entries.find(
      (e) =>
        e.identity.project === item.project &&
        e.identity.type === item.type &&
        e.identity.item === item.item,
    );
    const catalogSpace =
      projectNames.get(item.project) ||
      (matchedEntry && matchedEntry.record.projectName !== item.project
        ? matchedEntry.record.projectName
        : "");
    const spaceLabel =
      catalogSpace && !isOpaqueKey(catalogSpace)
        ? catalogSpace
        : !isOpaqueKey(item.project) && item.project.trim()
          ? item.project
          : "当前空间";
    const knownTypeMap: Record<string, string> = {
      story: "需求",
      issue: "缺陷",
      bug: "缺陷",
      task: "任务",
      sub_task: "子任务",
    };
    const catalogType =
      typeNames.get(JSON.stringify([item.project, item.type])) ||
      typeNames.get(`${item.project}:${item.type}`) ||
      typeNames.get(item.type) ||
      knownTypeMap[item.type] ||
      (!isOpaqueKey(item.type) && /[\u3400-\u9fff]/.test(item.type) ? item.type : "事项");
    const resolvedTitle = item.title?.trim() || matchedEntry?.record.title?.trim() || "";
    const shortId =
      item.item.trim() && !/^\d{15,}$/.test(item.item.trim()) && !isOpaqueKey(item.item.trim())
        ? `#${item.item.trim()}`
        : /^\d{1,14}$/.test(item.item.trim())
          ? `#${item.item.trim()}`
          : "";
    const itemLabel = resolvedTitle
      ? `${catalogType}「${resolvedTitle}」${shortId}`
      : shortId
        ? `${catalogType} ${shortId}`
        : catalogType;
    const sourceLabels = Array.from(new Set(item.sources.map(readableSourceName).filter(Boolean)));
    const sourceSuffix = sourceLabels.length > 0 ? `（${sourceLabels.join("、")}）` : "";
    return `${spaceLabel} ${itemLabel}${sourceSuffix}：${item.message}`;
  };

  const update = (id: string, fn: (entry: Entry) => ScheduleTarget) => {
    preloadedSession?.onInteraction?.();
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...fn(entry) } : entry)),
    );
  };
  const options = (values: Array<[string, string]>, all: string) => [
    { value: "", label: all },
    ...Array.from(new Map(values)).map(([value, label]) => ({ value, label })),
  ];

  const applyQuickPreset = (id: string, preset: ScheduleQuickPreset) => {
    setDefectSelection(null);
    setSelected(id);
    const target = entries.find((item) => item.id === id);
    const planned =
      target && canEdit(target)
        ? applyQuickSchedulePreset(target.dates, preset, currentToday)
        : null;
    update(id, (entry) => {
      if (!canEdit(entry)) return entry;
      const nextDates = applyQuickSchedulePreset(entry.dates, preset, currentToday);
      return nextDates ? editSchedule(entry, nextDates) : entry;
    });
    if (planned && (planned.end < windowStart || planned.start > windowEnd)) {
      setWeek(monday(planned.start));
    }
  };

  const scheduleIntoViewedWeek = (id: string) => {
    setDefectSelection(null);
    setSelected(id);
    update(id, (entry) => {
      if (!canEdit(entry)) return entry;
      const span = Math.max(1, scheduleSpanDays(entry.dates) || 1);
      if (currentToday >= windowStart && currentToday <= windowEnd) {
        const start = currentToday;
        const weekSunday = addDays(monday(currentToday), 6);
        const rawEnd = addDays(start, span - 1);
        const rangeEnd = windowEnd < weekSunday ? windowEnd : weekSunday;
        const end = rawEnd <= rangeEnd ? rawEnd : rangeEnd;
        return editSchedule(entry, { start, end: end < start ? start : end });
      }
      const start = week;
      const weekFriday = addDays(week, 4);
      const rawEnd = addDays(start, span - 1);
      const rangeEnd = windowEnd < weekFriday ? windowEnd : weekFriday;
      const end = rawEnd <= rangeEnd ? rawEnd : rangeEnd;
      return editSchedule(entry, { start, end: end < start ? start : end });
    });
  };

  const revertAll = () => {
    if (busyRef.current) return;
    setEntries((current) =>
      current.map((entry) =>
        frozenNodes.has(nodeKey(entry)) ? entry : { ...entry, ...revertSchedule(entry) },
      ),
    );
    setReviewOpen(false);
  };

  const startDrag = (event: DragEvent, entry: Entry, kind: Drag["kind"], grabbed: string) => {
    if (!canEdit(entry)) {
      event.preventDefault();
      return;
    }
    drag.current = { id: entry.id, kind, grabbed };
    preloadedSession?.onInteraction?.();
    setDragging(true);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", entry.id);
    setDefectSelection(null);
    setSelected(entry.id);
  };

  const previewDay = (day: string) => {
    const current = drag.current;
    const entry = entries.find((item) => item.id === current?.id);
    if (!current || !entry) return;
    const span = Math.max(1, scheduleSpanDays(entry.dates) || 1);
    const dates =
      current.kind === "new"
        ? { start: day, end: addDays(day, span - 1) }
        : current.kind === "move"
          ? shiftSchedule(entry.dates, current.grabbed, day)
          : resizeSchedule(entry.dates, current.kind, day);
    if (dates)
      setPreview((old) =>
        old?.id === entry.id && old.start === dates.start && old.end === dates.end
          ? old
          : { id: entry.id, ...dates },
      );
  };

  const dropDay = (event: DragEvent, day: string) => {
    event.preventDefault();
    const current = drag.current;
    drag.current = null;
    setDragging(false);
    setPreview(null);
    if (!current || busyRef.current) return;
    update(current.id, (entry) => {
      if (!canEdit(entry)) return entry;
      const span = Math.max(1, scheduleSpanDays(entry.dates) || 1);
      const dates =
        current.kind === "new"
          ? { start: day, end: addDays(day, span - 1) }
          : current.kind === "move"
            ? shiftSchedule(entry.dates, current.grabbed, day)
            : resizeSchedule(entry.dates, current.kind, day);
      return dates ? editSchedule(entry, dates) : entry;
    });
  };

  const blankDropDay = (clientX: number) => {
    const rect = blankGridRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    // 名称列下方没有日期归属，默认排入当前窗口内的今天或窗口首日。
    if (clientX < rect.left) {
      return currentToday >= windowStart && currentToday <= windowEnd
        ? currentToday
        : windowStart;
    }
    const index = Math.min(days.length - 1, Math.floor(((clientX - rect.left) / rect.width) * days.length));
    return days[index];
  };

  const poolDrop = (event: DragEvent) => {
    event.preventDefault();
    const current = drag.current;
    drag.current = null;
    setDragging(false);
    setPreview(null);
    if (!current || current.kind === "new" || busyRef.current) return;
    update(current.id, (entry) =>
      !hasBaselineSchedule(entry.baseline) ? revertSchedule(entry) : entry,
    );
  };

  function openReviewOrValidate() {
    if (busyRef.current || readUnavailable) return;
    const changed = changedEntries;
    const invalid = changed
      .map((entry) => ({ entry, message: scheduleValidation(entry) }))
      .filter((entry) => entry.message);
    if (!changed.length) return;
    if (invalid.length) {
      setDefectSelection(null);
      setSelected(invalid[0].entry.id);
      setSuccessToast(null);
      setReport(`无法同步：${invalid[0].entry.record.title}：${invalid[0].message}`);
      return;
    }
    scheduleReviewBlockedIds.current = blockedScheduleSignature;
    setReviewOpen(true);
  }

  async function submit() {
    if (busyRef.current || readUnavailable) return;
    const changed = pendingScheduleChanges.filter((entry) => !nodeWorkflowNeedsVerification(entry));
    if (JSON.stringify(changed.map((entry) => entry.id)) !== changedEntryIds) {
      setReviewOpen(false);
      setReport("部分节点的流程操作正在提交或待核实，请重新核对可同步的排期。");
      return;
    }
    const invalid = changed
      .map((entry) => ({ entry, message: scheduleValidation(entry) }))
      .filter((entry) => entry.message);
    if (!changed.length) return;
    if (invalid.length) {
      setReviewOpen(false);
      setDefectSelection(null);
      setSelected(invalid[0].entry.id);
      setSuccessToast(null);
      setReport(`无法同步：${invalid[0].entry.record.title}：${invalid[0].message}`);
      return;
    }
    const frozen = changed.map((entry) => ({
      id: entry.id,
      identity: entry.identity,
      dates: { ...entry.dates },
      cancel: entry.cancel,
    }));
    setReviewOpen(false);
    busyRef.current = true;
    submittingScheduleNodes.current = new Set(changed.map(nodeKey));
    onGuardChange({ dirty: true, busy: true, uncertain });
    setBusy(true);
    setSuccessToast(null);
    setReport("");
    try {
      if (!read) throw new Error("排期会话已结束");
      const response = await submitScheduleTargets(read.sessionId, frozen);
      const results = new Map(response.results.map((result) => [result.id, result]));
      setEntries((current) =>
        current.map((entry) => {
          const submission = frozen.find((item) => item.id === entry.id);
          if (!submission) return entry;
          const outcome = results.get(entry.id)?.result || "uncertain";
          return {
            ...entry,
            ...settleSchedule(
              entry,
              submission.dates,
              outcome,
            ),
            record:
              outcome === "accepted"
                ? { ...entry.record, dates: { ...submission.dates } }
                : entry.record,
            resultMessage: results.get(entry.id)?.message,
            resultWarning: mergeResultWarnings(entry.resultWarning, results.get(entry.id)?.warning),
          };
        }),
      );
      const latest = readRef.current;
      if (latest && latest.sessionId === read?.sessionId) {
        const nextRead: ScheduleRead = {
          ...latest,
          targets: latest.targets.map((record) => {
            const submission = frozen.find((item) => item.id === record.id);
            if (!submission) return record;
            const outcome = results.get(record.id)?.result || "uncertain";
            const resultMessage = results.get(record.id)?.message;
            const resultWarning = mergeResultWarnings(record.resultWarning, results.get(record.id)?.warning);
            if (outcome === "accepted" || outcome === "uncertain") {
              return {
                ...record,
                dates: { ...submission.dates },
                result: outcome,
                resultMessage,
                resultWarning,
              };
            }
            return record;
          }),
        };
        setRead(nextRead);
        preloadedSession?.updateRead(nextRead);
      }
      const count = (result: string) =>
        frozen.filter((item) => (results.get(item.id)?.result || "uncertain") === result).length;
      const accepted = count("accepted");
      const failed = count("failed");
      const uncertainCount = count("uncertain");
      const unsent = count("unsent");
      const warnings = response.results.filter((result) => result.warning);
      const cleared = frozen.filter((item) => item.cancel && results.get(item.id)?.result === "accepted").length;
      if (accepted > 0 && failed === 0 && uncertainCount === 0 && unsent === 0 && warnings.length === 0) {
        setReport("");
        setSuccessToast({ id: Date.now(), accepted });
      } else {
        setSuccessToast(null);
        setReport(
          warnings.length > 0 && failed === 0 && uncertainCount === 0 && unsent === 0
            ? ""
            : `本次同步：${cleared ? `已核验清空 ${cleared} 项，` : ""}收到成功回执 ${accepted - cleared} 项，失败 ${failed} 项，结果不确定 ${uncertainCount} 项，未发送 ${unsent} 项。${accepted > cleared ? "普通改期的成功回执尚未回读核验。" : ""}`,
        );
      }
    } catch (failure) {
      // 只有桌面命令明确标记发送前失败时才能安全重试。
      const err = failure as { schedule_not_sent?: boolean; message?: string } | null;
      const unsent = err?.schedule_not_sent === true;
      setEntries((current) =>
        current.map((entry) => {
          const item = frozen.find((value) => value.id === entry.id);
          return item
            ? {
                ...entry,
                ...settleSchedule(entry, item.dates, unsent ? "unsent" : "uncertain"),
                resultMessage: unsent ? err?.message : undefined,
              }
            : entry;
        }),
      );
      const latest = readRef.current;
      if (!unsent && latest && latest.sessionId === read?.sessionId) {
        const nextRead: ScheduleRead = {
          ...latest,
          targets: latest.targets.map((record) => {
            const item = frozen.find((value) => value.id === record.id);
            return item
              ? { ...record, dates: { ...item.dates }, result: "uncertain" }
              : record;
          }),
        };
        setRead(nextRead);
        preloadedSession?.updateRead(nextRead);
      }
      setSuccessToast(null);
      setReport(
        `本次同步：收到成功回执 0 项，失败 0 项，结果不确定 ${unsent ? 0 : frozen.length} 项，未发送 ${unsent ? frozen.length : 0} 项。${unsent ? err?.message || "会话校验未通过" : "请先在飞书核对；本次不会自动重发。"}`,
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const todayInWindow = currentToday >= windowStart && currentToday <= windowEnd;
  const scheduledTodayCount = outsideRows.filter(
    ({ entry }) => entry.dates.start <= currentToday && entry.dates.end >= currentToday,
  ).length;
  const editablePendingCount = view === "mine" ? pending.filter(isEditableTarget).length : null;
  const viewStorageKey = scheduleViewsKey(snapshot?.settings?.endpoint, read?.accountError ? null : read?.currentUserId);
  const applyViewSettings = (settings: ScheduleViewSettings, restoring = false) => {
    setPeopleWeek(fitScheduleView({ ...settings, days: settings.days * peoplePeriods }).start);
    setPeopleViewDays(settings.days);
    // 只在完整读取明确证明选项已失效时剔除；部分读取不能清空已保存的筛选。
    const projects = new Set([
      ...entries.map((entry) => entry.identity.project),
      ...(read?.historyScopes || []).map((scope) => scope.project),
      ...projectNames.keys(),
    ]);
    const peopleReadComplete = read?.complete && read.peopleLoaded !== false;
    const project = restoring && peopleReadComplete && settings.project && !projects.has(settings.project) ? "" : settings.project;
    setPeopleProject(project);
    // 清单目录只覆盖已读取的类型，不能用缺少候选推断某个排期项目已删除。
    let related = settings.relatedProject;
    if (restoring && related && related !== missingProject && related !== unreadRelatedProject) {
      try {
        const key: unknown = JSON.parse(related);
        if (!Array.isArray(key) || key.length !== 2 || key.some((value) => typeof value !== "string" || !value)) {
          related = "";
        } else if (peopleReadComplete && read.spaceNames && !projects.has(key[0])) {
          related = "";
        }
      } catch { related = ""; }
    }
    setPeopleRelatedProject(related);
    const people = new Set(read?.people.map((person) => person.id));
    setPerson(restoring && read?.complete && read.peopleLoaded !== false ? settings.people.filter((id) => people.has(id)) : settings.people);
  };

  const refreshSchedule = (afterWorkflow = false) => {
    setManualRefreshing(true);
    setError("");
    const calendarRequest = retryCalendar(afterWorkflow);
    if (preloadedSession?.read && (afterWorkflow || (preloadedSession.consumeCandidate && !dirty && !uncertain))) {
      // 候选读取保留当前编辑会话；由控制器按最新交互状态决定是否采用。
      const includePeople = viewModeRef.current === "people";
      const peopleRequest = peopleRequestRef.current;
      const pendingPeople = includePeople && peopleRequest?.sessionId === preloadedSession.read.sessionId ? peopleRequest.promise : null;
      const reload = () => preloadedSession.reload({ includePeople, ...(afterWorkflow ? { afterWorkflow: true } : {}) });
      const scheduleRequest = (afterWorkflow && pendingPeople ? pendingPeople.then(reload) : pendingPeople ?? reload())
        .catch((failure: unknown) => setError(`读取事项安排失败：${readFailureMessage(asError(failure).kind)}`));
      void Promise.allSettled([calendarRequest, scheduleRequest])
        .finally(() => setManualRefreshing(false));
    } else {
      if (!read) forceResetRef.current = true;
      setEpoch((value) => value + 1);
    }
  };
  const handledWorkflowRefresh = useRef(workflowRefreshRevision);
  useEffect(() => {
    // 正式桌面流程和排期控制器同时提供；无控制器的只读页面不自动重建会话。
    if (!preloadedSession || handledWorkflowRefresh.current === workflowRefreshRevision || workflow?.busy || workflowInteraction) return;
    handledWorkflowRefresh.current = workflowRefreshRevision;
    refreshSchedule(true);
  }, [workflowRefreshRevision, workflow?.busy, workflowInteraction]);

  const avatarConnection = displayRead?.connection || displayEntries[0]?.identity.connection;
  const avatarScope = !displayRead?.accountError && avatarConnection && displayRead?.currentUserId
    ? JSON.stringify([calendarContext, avatarConnection, displayRead.currentUserId]) : null;
  const avatarPeople = loadedSchedulePeople;
  const notifyInteraction = (event: React.SyntheticEvent) => {
    if (event.target instanceof Element && !event.target.closest("[data-schedule-refresh]")) preloadedSession?.onInteraction?.();
  };
  const hasPeopleSnapshot = read?.peopleLoaded === true;
  const readingPeople = view === "people" && (peopleLoading || preloadedSession?.refreshing);
  const displayedCheckTime = cachedPeopleRead ? cachedPeopleRead.readAtMs : lastCheckedAt;
  const checkedDate = displayedCheckTime === undefined ? undefined : new Date(displayedCheckTime);
  const checkTime = checkedDate ? (
    <time dateTime={checkedDate.toISOString()} title={checkedDate.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}>
      {today(checkedDate) !== currentToday && `${checkedDate.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric" })} `}
      {checkedDate.toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false })}
    </time>
  ) : cachedPeopleRead?.readAt;
  return (
    <ScheduleAvatarCacheProvider scope={avatarScope} connection={peopleCacheContext && avatarScope ? avatarConnection : undefined} people={avatarPeople}>
    <section className="schedule-page" aria-label="事项安排" onPointerDownCapture={notifyInteraction} onFocusCapture={notifyInteraction}>
          <>
            <div className="overview schedule-overview">
              <ScheduleGreeting person={currentUserPerson} name={displayUserId ? currentUserDisplayName : undefined} />
              <div className="overview-actions schedule-overview-actions">
                {(readingPeople || cachedPeopleRead || checkedDate || lastCheckFailed) && <div className="schedule-check-status" role="status">
                  <div className="schedule-check-details">
                    {readingPeople && <span className="schedule-check-progress">
                      <LoaderCircle size={14} aria-hidden="true" />
                      {cachedPeopleRead || hasPeopleSnapshot ? "正在更新人员排期" : "正在加载人员排期"}
                    </span>}
                    {cachedPeopleRead ? <span className="schedule-check-cache">
                      {!readingPeople && <Clock3 size={14} aria-hidden="true" />}
                      <span>显示缓存{checkTime && <> · {checkTime}</>}</span>
                    </span> : checkedDate && <span>上次检查 {checkTime}</span>}
                  </div>
                  {lastCheckFailed && !readingPeople && <span>{partial?.itemErrors?.length
                    ? `还有 ${partial.itemErrors.length} 项未能确认，稍后自动补查`
                    : `暂未取得最新排期${(displayRead || currentHistory) && !showingPartialPeople ? "，已保留上次内容" : ""}`}</span>}
                </div>}
                <button
                  type="button"
                  className="secondary"
                  data-schedule-refresh
                  disabled={busy || manualRefreshing || (loading && !read)}
                  onClick={() => requestReload(() => refreshSchedule())}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  {manualRefreshing || (loading && !read) ? "正在刷新…" : "重新读取"}
                </button>
                {changedEntries.length > 0 && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={revertAll}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    全部还原
                  </button>
                )}
                <button
                  type="button"
                  className="primary"
                  disabled={changedEntries.length === 0 || busy || readUnavailable}
                  onClick={openReviewOrValidate}
                >
                  <Check size={14} aria-hidden="true" />
                  {busy
                    ? "正在同步…"
                    : changedEntries.length > 0
                      ? `核对并同步 (${changedEntries.length})`
                      : "同步排期"}
                </button>
              </div>
            </div>

            <ScheduleRefreshNotice refreshing={manualRefreshing} />
            {read && error && !preloadedSession?.refreshError && <p className="banner warning" role="alert">{error}；已保留上次内容，可继续编辑，稍后重试。</p>}
            {read?.accountError && (
              <div className="banner warning" role="alert">
                {read.accountError}；以下显示当前来源中可读取的安排，均为只读。
              </div>
            )}
            {(scopeSourceErrors.length > 0 || scopeErrors.length > 0) && !readingPeople && (
              <div className="banner warning">
                <div>
                  {scopeErrors.length > 0 && (
                    <strong>部分事项读取不完整，已保留本次成功读取的内容。</strong>
                  )}
                  {scopeSourceErrors.map((source) => (
                    <p key={source.id}>{readableSourceName(source.name || source.id)}：{source.error}</p>
                  ))}
                  {scopeErrors.map((item, index) => (
                    <p key={index}>{formatScopeError(item)}</p>
                  ))}
                </div>
              </div>
            )}
            {read && peopleError && !peopleLoading && (
              <div className="banner warning" role="alert">
                <span>{peopleError}</span>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => triggerLoadPeople(read)}
                >
                  重试加载成员
                </button>
              </div>
            )}
            {(report || uncertain || persistentWarnings.length > 0) && (
              <div className="schedule-feedback" role="alert">
                <Info size={17} aria-hidden="true" />
                <div className="schedule-feedback-content">
                  <strong>{uncertain ? "部分排期尚未核验" : "排期同步提示"}</strong>
                  {uncertain || report.startsWith("本次同步：") ? (
                    <>
                      <p>{uncertain
                        ? "编辑内容已保留，请先核对飞书中的实际结果。重新读取将结束本次编辑。"
                        : "未完成的编辑已保留，可查看各节点结果后重试。"}</p>
                      {report && <details><summary>查看同步详情</summary><p>{report}</p></details>}
                    </>
                  ) : report && <p>{report}</p>}
                  {persistentWarnings.filter((warning) => warning !== report).map((warning) => (
                    <p key={warning}>
                      <span className="schedule-feedback-targets">
                        {entries.filter((entry) => entry.resultWarning?.split("\n").includes(warning))
                          .map((entry) => `${entry.record.title} ${entry.record.nodeName} ${targetLabel(entry, entry.record.ownerId || "")}`).join("；")}
                      </span>
                      {warning}
                    </p>
                  ))}
                </div>
                {uncertain && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    title="结束本次编辑并重新读取云端排期"
                    onClick={() => requestReload(() => {
                      forceResetRef.current = true;
                      setManualRefreshing(true);
                      setEpoch((value) => value + 1);
                    })}
                  >
                    重新读取
                  </button>
                )}
              </div>
            )}
            {successToast && (
              <div className="workflow-toasts">
                <div className="banner success workflow-toast" role="status">
                  <Check size={17} aria-hidden="true" />
                  <div>
                    <strong>排期已同步</strong>
                    <p>已保存 {successToast.accepted} 项节点排期</p>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="关闭排期同步提示"
                    onClick={() => setSuccessToast(null)}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}

            <div className="work-panel schedule-panel">
              <div className="schedule-toolbar">
                <div className="schedule-toolbar-left">
                  <div className="schedule-tabs" role="group" aria-label="排期视角">
                    <button
                      type="button"
                      className={view === "mine" ? "active" : ""}
                      onClick={() => setView("mine")}
                    >
                      我的排期
                    </button>
                    <button
                      type="button"
                      className={view === "people" ? "active" : ""}
                      onClick={() => setView("people")}
                    >
                      人员排期
                    </button>
                  </div>
                  <Select
                    ariaLabel="筛选空间"
                    value={project}
                    onChange={(value) => {
                      setProject(value);
                      setRelatedProject("");
                    }}
                    options={options(
                      filterEntries.map((item) => [item.identity.project, projectLabel(item)]),
                      "全部空间",
                    )}
                  />
                  <Select
                    ariaLabel="筛选所属项目"
                    value={relatedProject}
                    onChange={setRelatedProject}
                    options={[{ value: "", label: "全部项目" }, ...relatedProjectOptions]}
                  />
                  {view === "people" && (
                    <>
                      <input
                        className="schedule-person-search"
                        aria-label="搜索人员"
                        placeholder="搜索人员"
                        value={personQuery}
                        onChange={(event) => {
                          setPersonQuery(event.target.value);
                          setPersonSearchRequest((request) => request + 1);
                        }}
                      />
                      <Select
                        ariaLabel="筛选人员"
                        openRequest={personSearchRequest}
                        multiple
                        value={person}
                        onChange={setPerson}
                        options={options(personFilterEntries, "全部人员")}
                      />
                    </>
                  )}
                  {view === "mine" && (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={editableOnly}
                      className="schedule-switch"
                      onClick={() => setEditableOnly((current) => !current)}
                    >
                      <span className="schedule-switch-track" aria-hidden="true">
                        <span className="schedule-switch-thumb" />
                      </span>
                      <span>仅看可排期</span>
                    </button>
                  )}
                </div>

                <div className="schedule-toolbar-right">
                  <button
                    type="button"
                    className="secondary schedule-pool-toggle"
                    aria-expanded={!poolCollapsed}
                    onClick={() => setPoolCollapsed((current) => !current)}
                  >
                    {poolCollapsed ? (
                      <PanelLeftOpen size={14} aria-hidden="true" />
                    ) : (
                      <PanelLeftClose size={14} aria-hidden="true" />
                    )}
                    {poolCollapsed ? `展开待排池 (${pendingRows.length})` : "收起待排池"}
                  </button>

                  {view === "mine" && <ScheduleDateControls
                    current={{ start: mineWeek, days: 7, perspective: "mine", project: mineProject, relatedProject: mineRelatedProject, people: [], editableOnly }}
                    periods={minePeriods} onPeriodsChange={setMinePeriods} today={currentToday}
                    onApply={(settings) => setMineWeek(settings.start)} />}
                  <ScheduleViewControls key={viewStorageKey || "unconfirmed-account"} enabled={view === "people"} storageKey={viewStorageKey}
                    current={{ start: peopleWeek, days: peopleViewDays, perspective: "people", project: peopleProject, relatedProject: peopleRelatedProject, people: person, editableOnly: false }}
                    periods={peoplePeriods} onPeriodsChange={(periods) => {
                      setPeopleWeek(fitScheduleView({ start: peopleWeek, days: peopleViewDays * periods, perspective: "people", project: peopleProject, relatedProject: peopleRelatedProject, people: person, editableOnly: false }).start);
                      setPeoplePeriods(periods);
                    }} today={currentToday} onApply={applyViewSettings} onOpenChange={setViewSettingsOpen} />
                  <div className="schedule-range-summary" role="group" aria-label="已排期清单统计">
                    <span>已排 <strong>{outsideRows.length}</strong></span>
                    {todayInWindow && <span>今日有排期 <strong>{scheduledTodayCount}</strong></span>}
                    {changedEntries.length > 0 && <span>含未同步草稿</span>}
                  </div>
                </div>
              </div>

              <div className={`schedule-layout ${poolCollapsed ? "is-pool-collapsed" : ""} ${!selectedEntry && !selectedDefect ? "is-inspector-closed" : ""}`}>
                {!poolCollapsed && (
                  <aside
                    className="schedule-pending"
                    onDragOver={(event) => {
                      const dragged = entries.find((item) => item.id === drag.current?.id);
                      if (
                        drag.current &&
                        drag.current.kind !== "new" &&
                        dragged &&
                        !hasBaselineSchedule(dragged.baseline)
                      ) {
                        event.preventDefault();
                        setPreview(null);
                      }
                    }}
                    onDrop={poolDrop}
                  >
                    <div className="schedule-pool-tabs" role="tablist" aria-label="排期与缺陷清单">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={poolTab === "pending"}
                        className={poolTab === "pending" ? "active" : ""}
                        onClick={() => setPoolTab("pending")}
                      >
                        {displayRead ? `待排期 (${pendingRows.length})` : "待排期"}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={poolTab === "outside"}
                        className={poolTab === "outside" ? "active" : ""}
                        onClick={() => setPoolTab("outside")}
                      >
                        {displayRead ? `已排期 (${outsideRows.length})` : "已排期"}
                      </button>
                      <button type="button" role="tab" aria-selected={poolTab === "defects"} aria-label={showDefectCount ? `未解决缺陷 ${defects.length}` : "未解决缺陷"}
                        className={poolTab === "defects" ? "active" : ""} onClick={() => setPoolTab("defects")}>
                        未解决缺陷{showDefectCount && <span className="schedule-defect-count"> ({defects.length})</span>}
                      </button>
                    </div>

                    {poolTab === "defects" ? (
                      <ScheduleDefectList defects={defects} currentUser={read?.currentUserId || ""} team={view === "people"}
                        knownPeople={loadedSchedulePeople}
                        selected={selectedDefectKey} select={(defect) => { setSelected(""); setDatePickerOpen(false); setDefectSelection({ defect, auth: defectRead.auth }); }}
                        groupStates={defectGroups} onGroupChange={(owner, expanded) => setDefectGroups((current) => new Map(current).set(owner, expanded))}
                        loading={(!read && !error) || defectLoading} failed={defectReadFailed || (!read && !!error)} ready={defectRead.ready}
                        retry={read ? defectRead.retry : () => requestReload(() => { forceResetRef.current = true; setEpoch((value) => value + 1); })} />
                    ) : !displayRead ? (
                      error ? <p className="schedule-pool-empty" role="alert">{error}，可重新读取。</p>
                        : <p className="schedule-pool-empty" role="status">正在读取事项清单…</p>
                    ) : poolTab === "pending" ? (
                      <>
                        {editablePendingCount !== null && editablePendingCount < pendingRows.length && (
                          <p className="schedule-pool-editable-count">其中 {editablePendingCount} 项可排期</p>
                        )}
                        <div className="schedule-pool-list">
                          {pendingRows.map(({ entry, owner }, index) => (
                            <Fragment key={`${entry.id}:${owner}`}>
                              {view === "people" &&
                                (index === 0 ||
                                  groupKey(pendingRows[index - 1].entry, pendingRows[index - 1].owner) !==
                                    groupKey(entry, owner)) && (
                                  renderGroupToggle("pending", entry, owner, pendingRows.filter((row) => groupKey(row.entry, row.owner) === groupKey(entry, owner)).length)
                                )}
                              <div
                                hidden={groupHidden("pending", entry, owner)}
                                className={`schedule-pending-card ${entry.id === selected && (view !== "people" || owner === activePerson) ? "selected" : ""}`}
                              >
                                <button
                                  type="button"
                                  className="schedule-pending-item"
                                  draggable={canEdit(entry)}
                                  onDragStart={(event) => startDrag(event, entry, "new", "")}
                                  onDragEnd={() => {
                                    drag.current = null;
                                    setDragging(false);
                                    setPreview(null);
                                  }}
                                  onClick={() => selectPoolRow(entry, owner)}
                                >
                                  <span className="schedule-pending-head">
                                    <strong>{entry.record.title}</strong>
                                    {!canEdit(entry) && (
                                      <span className="schedule-readonly-pill" aria-hidden="true">
                                        只读
                                      </span>
                                    )}
                                  </span>
                                  <span className="schedule-pending-meta">
                                    {entry.record.nodeName && (
                                      <span className="schedule-current-node is-pending" style={nodeColorStyle(entry.record)}>
                                        {entry.record.nodeName}
                                      </span>
                                    )}
                                    <span className="schedule-pending-details">{pendingCardDetails(entry, owner)}</span>
                                  </span>
                                  {isCurrentSchedulableStatus(entry.record.nodeStatus) && !entry.record.sourceAggregate && (
                                    <NodeDwellTime startedAt={entry.record.nodeStartedAtMs} />
                                  )}
                                  {visibleReadOnlyReason(entry.readOnlyReason) && entry.readOnlyReason !== "仅可编辑明确属于自己的排期" && <small>{entry.readOnlyReason}</small>}
                                </button>
                                {canEdit(entry) && (
                                  <div
                                    className="schedule-pending-quick"
                                    aria-label={`${entry.record.title}快捷排期`}
                                  >
                                    <span>快捷落位：</span>
                                    <button
                                      type="button"
                                      className="schedule-quick-chip"
                                      onClick={() => applyQuickPreset(entry.id, "today")}
                                    >
                                      今天
                                    </button>
                                    <button
                                      type="button"
                                      className="schedule-quick-chip"
                                      onClick={() => applyQuickPreset(entry.id, "twoDays")}
                                    >
                                      今明
                                    </button>
                                    <button
                                      type="button"
                                      className="schedule-quick-chip"
                                      onClick={() => applyQuickPreset(entry.id, "thisWeek")}
                                    >
                                      本周
                                    </button>
                                  </div>
                                )}
                              </div>
                            </Fragment>
                          ))}
                          {pendingRows.length === 0 && !teamReadMessage && (
                            <p className="schedule-pool-empty">
                              当前筛选下暂无待排期事项
                            </p>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="schedule-pool-list">
                          {outsideRows.map(({ entry, owner }, index) => (
                            <Fragment key={`${entry.id}:${owner}`}>
                              {view === "people" &&
                                (index === 0 ||
                                  groupKey(outsideRows[index - 1].entry, outsideRows[index - 1].owner) !==
                                    groupKey(entry, owner)) && (
                                  renderGroupToggle("outside", entry, owner, outsideRows.filter((row) => groupKey(row.entry, row.owner) === groupKey(entry, owner)).length)
                                )}
                              <div
                                hidden={groupHidden("outside", entry, owner)}
                                className={`schedule-pending-card schedule-outside-card ${entry.id === selected ? "selected" : ""}`}
                              >
                                <button
                                  type="button"
                                  className={`schedule-outside-item ${entry.id === selected ? "selected" : ""}`}
                                  draggable={canEdit(entry)}
                                  onDragStart={(event) => startDrag(event, entry, "new", "")}
                                  onDragEnd={() => {
                                    drag.current = null;
                                    setDragging(false);
                                    setPreview(null);
                                  }}
                                  onClick={() => selectPoolRow(entry, owner)}
                                >
                                  <span className="schedule-pending-head">
                                    <strong>{entry.record.title}</strong>
                                    {!canEdit(entry) && (
                                      <span className="schedule-readonly-pill" aria-hidden="true">
                                        只读
                                      </span>
                                    )}
                                  </span>
                                  {entry.record.nodeName && (
                                    <span className="schedule-pending-meta">
                                      <span className="schedule-current-node is-pending" style={nodeColorStyle(entry.record)}>
                                        {entry.record.nodeName}
                                      </span>
                                    </span>
                                  )}
                                  <span className="schedule-outside-range">
                                    {entry.dates.start} ~ {entry.dates.end}
                                  </span>
                                </button>
                                <div
                                  className="schedule-pending-quick"
                                  aria-label={`${entry.record.title}跨周排期操作`}
                                >
                                  {canEdit(entry) ? (
                                    <>
                                      <button
                                        type="button"
                                        className="schedule-quick-chip"
                                        onClick={() => applyQuickPreset(entry.id, "today")}
                                      >
                                        今天
                                      </button>
                                      <button
                                        type="button"
                                        className="schedule-quick-chip"
                                        onClick={() => scheduleIntoViewedWeek(entry.id)}
                                      >
                                        排入本周
                                      </button>
                                    </>
                                  ) : (
                                    <span>已排期</span>
                                  )}
                                  <button
                                    type="button"
                                    className="schedule-quick-chip"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      selectPoolRow(entry, owner, true);
                                    }}
                                  >
                                    定位该周 ↗
                                  </button>
                                </div>
                              </div>
                            </Fragment>
                          ))}
                          {outsideRows.length === 0 && (
                            !teamReadMessage && <p className="schedule-pool-empty">当前筛选下暂无已排期节点</p>
                          )}
                        </div>
                      </>
                    )}
                  </aside>
                )}

                <div className="schedule-main" ref={calendarScrollRef}>
                  {calendarLoading && !currentHistory && <div className="banner" role="status">{viewingHistory ? "正在读取历史排期…" : "正在读取日历排期…"}</div>}
                  {calendarFailed && (!managedCalendar || !currentHistory) && (
                    <div className="banner" role="status">
                      <span>{viewingHistory ? "暂时无法完整读取历史排期。" : "暂时无法完整读取日历排期。"}</span>
                      <button type="button" className="secondary" onClick={() => void retryCalendar()}>{viewingHistory ? "重试历史排期" : "重试日历排期"}</button>
                    </div>
                  )}
                  <div
                    className={`schedule-calendar is-${view}`}
                    style={{ "--schedule-cols": days.length } as React.CSSProperties}
                  >
                    <div className="schedule-calendar-header" ref={calendarHeaderRef}>
                      <div className="schedule-corner-cell">
                        <span>事项 / 节点归属</span>
                        <small>共 {rows.length} 项</small>
                      </div>
                      <div className="schedule-days">
                        {days.map((day) => {
                          const weekdayIndex =
                            (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
                          const isWeekend = weekdayIndex >= 5;
                          const isToday = day === currentToday;
                          return (
                            <div
                              key={day}
                              className={[
                                isWeekend && "weekend",
                                isToday && "today",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              onDragOver={(event) => {
                                if (drag.current) {
                                  event.preventDefault();
                                  previewDay(day);
                                }
                              }}
                              onDrop={(event) => dropDay(event, day)}
                            >
                              <span>
                                {isToday ? "今天" : `周${weekdays[weekdayIndex]}`}
                              </span>
                              <strong>{day.slice(5)}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {preview && preview.start <= windowEnd && preview.end >= windowStart && (
                      <div className="schedule-preview">
                        <span
                          style={{
                            gridColumn: `${Math.max(0, days.findIndex((day) => day >= preview.start)) + 1} / ${days.reduce((value, day, index) => (day <= preview.end ? index : value), 0) + 2}`,
                          }}
                        >
                          {preview.start} → {preview.end}
                        </span>
                      </div>
                    )}

                    {rows.map((row, rowIndex) => {
                      const { key, owner, primaryEntry, bars, laneCount } = row;
                      const rowSelected = poolRowKey ? key === poolRowKey : (view !== "people" || owner === activePerson) &&
                        (bars.some((b) => b.entry.id === selected) || primaryEntry.id === selected);
                      const cachedItem = cachedItemFor(primaryEntry);
                      const historyKey = scheduleItemKey(primaryEntry.identity);
                      const itemContext = contextKeys.has(historyKey) ? itemContexts?.get(historyKey) : undefined;
                      const liveNodes = currentNodesByItem.get(historyKey);
                      const hasLiveCurrentNodes = !!liveNodes;
                      const detailNodes = itemContext?.nodesVerified || !hasLiveCurrentNodes ? itemContext?.currentNodes : undefined;
                      const historyStatus = !hasLiveCurrentNodes || itemContext?.statusVerified ? itemContext?.completedStatus : undefined;
                      const completedStatus = historyStatus !== undefined ? historyStatus
                        : cachedItem?.is_completed === true && (view !== "people" || !hasLiveCurrentNodes) ? workItemStatusName(cachedItem) : null;
                      const showRowAvatar = Boolean(read?.accountError && view === "mine");
                      const highlightOwnerId = view === "people" ? owner : !read?.accountError ? read?.currentUserId || "" : "";
                      const contextMessage = contextKeys.has(historyKey)
                        ? itemContext?.currentNodes ? "暂无进行中节点" : itemContext?.failed ? "当前节点暂未读取，可刷新重试"
                          : itemContext ? "未取得当前节点信息" : "正在读取当前节点…"
                        : undefined;
                      return (
                        <Fragment key={key}>
                          {view === "people" &&
                            (rowIndex === 0 ||
                              groupKey(rows[rowIndex - 1].primaryEntry, rows[rowIndex - 1].owner) !==
                                groupKey(primaryEntry, owner)) && (
                              renderGroupToggle("calendar", primaryEntry, owner, rows.filter((item) => groupKey(item.primaryEntry, item.owner) === groupKey(primaryEntry, owner)).length)
                            )}
                          <div ref={key === poolRowKey ? poolCalendarRowRef : undefined} hidden={groupHidden("calendar", primaryEntry, owner)} className={`schedule-row ${rowSelected ? "selected" : ""}`}>
                            <div
                              className="schedule-row-label"
                              onClick={() => selectPersonRow(primaryEntry, owner)}
                            >
                              {showRowAvatar && (
                                <ScheduleAvatar
                                  person={personFor(
                                    primaryEntry,
                                    resolveOwnerId(primaryEntry, owner),
                                  )}
                                />
                              )}
                              <span>
                                <strong>{primaryEntry.record.title}</strong>
                                {completedStatus ? (
                                  <small className="schedule-row-current" title={`事项已完成：${completedStatus}`}>
                                    <span className="schedule-completed-status">
                                      <Check size={11} strokeWidth={3} aria-hidden="true" />
                                      <span>{completedStatus}</span>
                                    </span>
                                  </small>
                                ) : (
                                  <ScheduleRowNodeSummary entry={primaryEntry} liveNodes={liveNodes} detailNodes={detailNodes}
                                    records={recordsByItem.get(historyKey)} personFor={personFor} displayPerson={displayPerson}
                                    highlightOwnerId={highlightOwnerId} highlightMine={view === "mine" && !read?.accountError} contextMessage={contextMessage} />
                                )}
                              </span>
                            </div>
                            <div
                              className="schedule-row-grid"
                              style={
                                laneCount > 1
                                  ? ({
                                      gridTemplateRows: `repeat(${laneCount}, minmax(var(--schedule-lane-height), 1fr))`,
                                    } as React.CSSProperties)
                                  : undefined
                              }
                              onDragOver={(event) => {
                                if (drag.current) {
                                  event.preventDefault();
                                  const rect = event.currentTarget.getBoundingClientRect();
                                  const col = Math.max(
                                    0,
                                    Math.min(
                                      days.length - 1,
                                      Math.floor(
                                        ((event.clientX - rect.left) / rect.width) * days.length,
                                      ),
                                    ),
                                  );
                                  previewDay(days[col]);
                                }
                              }}
                              onDrop={(event) => {
                                const rect = event.currentTarget.getBoundingClientRect();
                                const index = Math.max(
                                  0,
                                  Math.min(
                                    days.length - 1,
                                    Math.floor(
                                      ((event.clientX - rect.left) / rect.width) * days.length,
                                    ),
                                  ),
                                );
                                dropDay(event, days[index]);
                              }}
                            >
                              {days.map((day, dayIndex) => {
                                const weekdayIndex =
                                  (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
                                return (
                                  <div
                                    key={day}
                                    style={{
                                      gridColumn: dayIndex + 1,
                                      gridRow: laneCount > 1 ? `1 / ${laneCount + 1}` : 1,
                                    }}
                                    className={[
                                      "schedule-day-cell",
                                      weekdayIndex >= 5 && "weekend",
                                      day === currentToday && "today",
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                  />
                                );
                              })}
                              {bars.map(
                                ({
                                  entry,
                                  startCol,
                                  endCol,
                                  lane,
                                  isSingleCol,
                                  isNarrowBar,
                                }) => {
                                  const editable = canEdit(entry);
                                  const changed = scheduleChanged(entry);
                                  const isFrozen =
                                    frozenNodes.has(nodeKey(entry)) || entry.result === "uncertain";
                                  const pastNode = isPastTransitionedNode(entry);
                                  const barStateClass = isFrozen
                                    ? "is-uncertain"
                                    : pastNode
                                      ? "is-readonly is-past-node"
                                      : !editable
                                        ? "is-readonly"
                                        : changed
                                          ? "is-draft"
                                          : entry.result
                                            ? `is-${entry.result}`
                                            : "is-cloud";
                                  const barTitleText = entry.record.nodeName || entry.record.title;
                                  const displayTitle =
                                    compactScheduleNodeName(entry.record.nodeName) ?? barTitleText;
                                  const spanDays = scheduleSpanDays(entry.dates);
                                  const isBarHovered = hoveredTarget?.id === entry.id &&
                                    (view !== "people" || hoveredTarget.owner === owner);
                                  const ariaName = `${entry.record.title}${
                                    entry.record.nodeName &&
                                    entry.record.nodeName !== entry.record.title
                                      ? ` ${entry.record.nodeName}`
                                      : ""
                                  }`;
                                  return (
                                    <Fragment key={entry.id}>
                                      <button
                                        type="button"
                                        aria-label={ariaName}
                                        className={[
                                          "schedule-bar",
                                          barStateClass,
                                          view === "mine" && editable && !isFrozen && !pastNode && "is-schedulable",
                                          isNarrowBar && "is-narrow-bar",
                                          isSingleCol && "is-single-day-bar",
                                          entry.dates.start < windowStart && "is-clipped-start",
                                          entry.dates.end > windowEnd && "is-clipped-end",
                                          isBarHovered && "is-hovered",
                                          rowSelected && entry.id === selected && "selected",
                                        ]
                                          .filter(Boolean)
                                          .join(" ")}
                                        style={{
                                          ...nodeColorStyle(entry.record),
                                          gridColumn: `${startCol + 1} / ${endCol + 2}`,
                                          gridRow: lane + 1,
                                        }}
                                        draggable={editable}
                                        onDragStart={(event) => {
                                          setHoveredTarget(undefined);
                                          const rect = event.currentTarget.getBoundingClientRect();
                                          const width = rect.width / (endCol - startCol + 1);
                                          const index = Math.max(
                                            startCol,
                                            Math.min(
                                              endCol,
                                              startCol +
                                                Math.floor((event.clientX - rect.left) / width),
                                            ),
                                          );
                                          startDrag(event, entry, "move", days[index]);
                                        }}
                                        onDragEnd={() => {
                                          drag.current = null;
                                          setDragging(false);
                                          setPreview(null);
                                        }}
                                        onMouseEnter={() => highlightTarget(entry.id, owner)}
                                        onMouseLeave={() => clearTargetHighlight(entry.id, owner)}
                                        onFocus={() => highlightTarget(entry.id, owner)}
                                        onBlur={() => clearTargetHighlight(entry.id, owner)}
                                        onClick={() => selectPersonRow(entry, owner)}
                                      >
                                        {entry.dates.start < windowStart ? (
                                          <span className="schedule-bar-clip" aria-hidden="true">
                                            ‹
                                          </span>
                                        ) : (
                                          editable && (
                                            <span
                                              className="schedule-handle start"
                                              draggable
                                              onDragStart={(event) => {
                                                event.stopPropagation();
                                                setHoveredTarget(undefined);
                                                startDrag(event, entry, "start", entry.dates.start);
                                              }}
                                              aria-hidden="true"
                                            />
                                          )
                                        )}
                                        <span className="schedule-bar-title">{displayTitle}</span>
                                        <span className="schedule-bar-badges" aria-hidden="true">
                                          <span className="schedule-bar-days">{spanDays}d</span>
                                          {changed && (
                                            <span className="schedule-bar-badge is-draft">
                                              {classifyScheduleReview(entry) === "added"
                                                ? "新增"
                                                : "已改"}
                                            </span>
                                          )}
                                        </span>
                                        {entry.dates.end > windowEnd ? (
                                          <span className="schedule-bar-clip" aria-hidden="true">
                                            ›
                                          </span>
                                        ) : (
                                          editable && (
                                            <span
                                              className="schedule-handle end"
                                              draggable
                                              onDragStart={(event) => {
                                                event.stopPropagation();
                                                setHoveredTarget(undefined);
                                                startDrag(event, entry, "end", entry.dates.end);
                                              }}
                                              aria-hidden="true"
                                            />
                                          )
                                        )}
                                      </button>
                                      {isBarHovered && !drag.current && (
                                        <span
                                          className={[
                                            "schedule-bar-popover",
                                            startCol >= days.length - 2 && "is-align-right",
                                            pastNode
                                              ? "is-past"
                                              : editable
                                                ? "is-editable"
                                                : "is-readonly",
                                          ]
                                            .filter(Boolean)
                                            .join(" ")}
                                          style={{
                                            gridColumn: `${startCol + 1} / ${endCol + 2}`,
                                            gridRow: lane + 1,
                                          }}
                                          aria-hidden="true"
                                        >
                                          <span className="schedule-bar-popover-card">
                                            <span
                                              className={`schedule-popover-badge ${pastNode ? "is-past" : editable ? "is-editable" : "is-readonly"}`}
                                            >
                                              {pastNode
                                                ? "已流转"
                                                : editable
                                                  ? "当前可排"
                                                  : "只读"}
                                            </span>
                                            <strong className="schedule-popover-title">
                                              {barTitleText}
                                            </strong>
                                            <span className="schedule-popover-meta">
                                              {`${entry.dates.start.slice(5)} ~ ${entry.dates.end.slice(5)} (${spanDays}d)`}
                                            </span>
                                          </span>
                                        </span>
                                      )}
                                    </Fragment>
                                  );
                                },
                              )}
                            </div>
                          </div>
                        </Fragment>
                      );
                    })}

                    <div
                      className="schedule-blank-area"
                      onDragOver={(event) => {
                        if (!drag.current) return;
                        const day = blankDropDay(event.clientX);
                        if (!day) return;
                        event.preventDefault();
                        previewDay(day);
                      }}
                      onDrop={(event) => {
                        const day = blankDropDay(event.clientX);
                        if (day) dropDay(event, day);
                      }}
                    >
                      <div className="schedule-empty-body">
                        <div
                          ref={blankGridRef}
                          className="schedule-empty-grid"
                        />
                          {rows.length === 0 && !calendarLoading && !calendarFailed && <p className="schedule-empty">
                          {teamReadMessage || (noAssociatedSchedule
                            ? "当前账号暂无可显示的关联需求排期。"
                            : view === "people" && person.length > 0 && visible.length === 0
                              ? "当前范围未包含该人员的安排"
                              : viewingHistory ? "所选日期暂无可显示的安排" : "本周暂无可显示的安排")}
                        </p>}
                      </div>
                    </div>
                  </div>
                </div>

                {selectedDefect && <ScheduleDefectInspector key={`${read?.connection}:${selectedDefectKey}`} defect={selectedDefect}
                  connection={read?.connection || workflow?.context || ""} projectName={projectNames.get(selectedDefect.project) || selectedDefect.project}
                  workflow={workflow} stale={!liveDefect} onWorkflowRead={setDefectWorkflowLoading} onWorkflowNavigation={setDefectWorkflow}
                  close={() => setDefectSelection(null)} />}
                {!selectedDefect && selectedEntry && <aside className="schedule-inspector" aria-label="排期检查器">
                  <div className="schedule-inspector-head">
                    <strong>排期检查器</strong>
                    <div className="schedule-inspector-head-actions">
                      {scheduleChanged(selectedEntry) && (
                        <span className="schedule-inspector-dirty">本地草稿</span>
                      )}
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="关闭排期检查器"
                        title="关闭排期检查器"
                        onClick={() => { setSelected(""); setDatePickerOpen(false); }}
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                    <div className="schedule-editor">
                      <div className="schedule-editor-meta">
                        <span className="schedule-editor-tag">
                          {projectLabel(selectedEntry)} {typeLabel(selectedEntry)}
                        </span>
                      </div>
                      <ScheduleDescription key={JSON.stringify([selectedEntry.identity.connection, selectedEntry.identity.project, selectedEntry.identity.type, selectedEntry.identity.item])}
                        connection={selectedEntry.identity.connection} project={selectedEntry.identity.project} type={selectedEntry.identity.type} item={selectedEntry.identity.item}
                        heading={<h3>{selectedEntry.record.title}</h3>} itemUrl={selectedEntry.record.itemUrl}
                        needsRemoteCheck={frozenNodes.has(nodeKey(selectedEntry))} />
                      {(siblingNodes.length > 1 || workflowKey) && (
                        <div
                          className="schedule-sibling-nodes"
                          role="group"
                          aria-label="事项节点"
                        >
                          <span className="schedule-sibling-label">
                            事项节点（{siblingNodes.length}）
                          </span>
                          <div className="schedule-sibling-list">
                            {siblingNodes.map((node) => {
                              const isCurrent = node.id === selectedEntry.id;
                              const isPast = isPastTransitionedNode(node);
                              const editableNode = canEdit(node);
                              const dateText = validSchedule(node.dates)
                                ? node.dates.start === node.dates.end
                                  ? node.dates.start.slice(5)
                                  : `${node.dates.start.slice(5)}~${node.dates.end.slice(5)}`
                                : "未排期";
                              return (
                                <button
                                  key={node.id}
                                  type="button"
                                  className={`schedule-sibling-chip ${isCurrent ? "active" : ""} ${hoveredTarget?.id === node.id && (view !== "people" || hoveredTarget.owner === activePerson) ? "is-hovered" : ""} ${isPast ? "is-past" : editableNode ? "is-editable" : "is-readonly"}`}
                                  style={nodeColorStyle(node.record)}
                                  aria-pressed={isCurrent}
                                  onClick={() => setSelected(node.id)}
                                  onMouseEnter={() => highlightTarget(node.id, activePerson)}
                                  onMouseLeave={() => clearTargetHighlight(node.id, activePerson)}
                                >
                                  <strong>{node.record.nodeName || node.record.title}</strong>
                                  <span>{dateText}</span>
                                </button>
                              );
                            })}
                          </div>
                          {workflowKey && workflow && (
                            <div className="schedule-node-workflow">
                              <div className="schedule-node-workflow-header">
                                <div className="schedule-node-workflow-context">
                                  <span id={`${workflowPanelId}-node-label`}>当前节点</span>
                                  <strong id={`${workflowPanelId}-node`}>{selectedEntry.record.nodeName || selectedEntry.record.title}</strong>
                                </div>
                                <button ref={workflowTrigger} type="button" className="schedule-node-workflow-trigger"
                                  aria-expanded={workflowOpen} aria-describedby={`${workflowPanelId}-node-label ${workflowPanelId}-node`}
                                  aria-controls={workflowOpen ? workflowPanelId : undefined}
                                  onClick={() => setWorkflowSelection(workflowOpen ? "" : workflowKey)}>
                                  <GitBranch size={13} aria-hidden="true" />
                                  {workflowOpen ? "收起流程动作" : "查看可用流程动作"}
                                  <ChevronDown className="schedule-node-workflow-chevron" size={12} aria-hidden="true" />
                                </button>
                              </div>
                              {workflowOpen && (
                                <div id={workflowPanelId}>
                                  <Workflow key={workflowKey} item={workflowItemFor(selectedEntry)} available busy={workflow.busy}
                                    submit={workflow.submit} onEditorChange={setWorkflowEditorOpen} onInitialReadChange={setWorkflowLoading}
                                    scheduleNode={{
                                      id: selectedEntry.identity.node,
                                      name: selectedEntry.record.nodeName || selectedEntry.record.title,
                                      triggerRef: workflowTrigger,
                                      draftNotice: nodeHasScheduleDraft ? "此节点有未同步的排期草稿。草稿会保留，请核对本次流程使用的日期。" : undefined,
                                      writeBlocked: workflowWriteBlocked,
                                    }} />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {view === "mine" && (
                        <section className="schedule-editor-dates" aria-label="节点排期">
                          {scheduleChanged(selectedEntry) && nodeWorkflowNeedsVerification(selectedEntry) && (
                            <p className="hint">此节点的流程操作正在提交或待核实，排期草稿已保留。</p>
                          )}
                          <div className="schedule-editor-section-head">
                            <strong>节点排期</strong>
                            {validSchedule(selectedEntry.dates) && (
                              <span className="schedule-span-info">
                                共 {scheduleSpanDays(selectedEntry.dates)} 个自然日
                              </span>
                            )}
                          </div>
                          {canEdit(selectedEntry) && (
                            <div
                              className="schedule-inspector-presets"
                              role="group"
                              aria-label="快捷排期预设"
                            >
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => applyQuickPreset(selectedEntry.id, "today")}
                              >
                                今天
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => applyQuickPreset(selectedEntry.id, "twoDays")}
                              >
                                今明两天
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => applyQuickPreset(selectedEntry.id, "thisWeek")}
                              >
                                本周内
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => applyQuickPreset(selectedEntry.id, "nextWeek")}
                              >
                                排到下周
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                disabled={!validSchedule(selectedEntry.dates)}
                                onClick={() => applyQuickPreset(selectedEntry.id, "plus1")}
                              >
                                顺延 +1 天
                              </button>
                            </div>
                          )}
                          <DateRangePicker
                            onOpenChange={setDatePickerOpen}
                            start={selectedEntry.dates.start}
                            end={selectedEntry.dates.end}
                            startLabel="开始日期"
                            endLabel="结束日期"
                            disabled={!canEdit(selectedEntry)}
                            onChange={(start, end) =>
                              update(selectedEntry.id, (entry) =>
                                editSchedule(entry, { start, end }),
                              )
                            }
                          />
                          {scheduleChanged(selectedEntry) &&
                            hasBaselineSchedule(selectedEntry.baseline) && (
                              <div className="schedule-cloud-baseline">
                                <span>云端当前值：</span>
                                <strong>{formatBaselineRange(selectedEntry.baseline)}</strong>
                              </div>
                            )}
                          {canEdit(selectedEntry) && scheduleChanged(selectedEntry) && (
                            <button
                              type="button"
                              className="secondary schedule-revert-btn"
                              onClick={() => update(selectedEntry.id, revertSchedule)}
                            >
                              <RotateCcw size={13} aria-hidden="true" />
                              {hasBaselineSchedule(selectedEntry.baseline)
                                ? "还原云端日期"
                                : "撤回待排期"}
                            </button>
                          )}
                          {selectedEntry.cancel && scheduleChanged(selectedEntry) && (
                            <p className="schedule-clear-note">
                              清空排期暂不可用，原草稿已保留。请还原云端日期或在飞书中核对处理。
                            </p>
                          )}
                        </section>
                      )}
                      {(view !== "mine" || !validSchedule(selectedEntry.dates)) && (
                        <p>{dateStatus(selectedEntry)}</p>
                      )}
                      {(selectedScopeLabel || selectedEntry.record.fetchedAt) && (
                        <details key={selectedEntry.id} className="schedule-read-meta">
                          <summary>数据读取信息</summary>
                          {selectedScopeLabel && <p>{selectedScopeLabel}</p>}
                          {selectedEntry.record.fetchedAt && <p>事项详情抓取时间 {selectedEntry.record.fetchedAt}</p>}
                        </details>
                      )}
                      {visibleReadOnlyReason(selectedEntry.readOnlyReason) && <p>{selectedEntry.readOnlyReason}</p>}
                      {selectedEntry.resultMessage?.replace(/^收到成功回执，未回读核验[；;]?\s*/, "") && (
                        <p>{selectedEntry.resultMessage.replace(/^收到成功回执，未回读核验[；;]?\s*/, "")}</p>
                      )}
                      {frozenNodes.has(nodeKey(selectedEntry)) && (
                        <p>该节点存在结果不确定的排期，请先在飞书核对并重新读取。</p>
                      )}
                      {scheduleChanged(selectedEntry) && scheduleValidation(selectedEntry) && (
                        <p role="alert">{scheduleValidation(selectedEntry)}</p>
                      )}
                    </div>
                </aside>}
              </div>
            </div>

            {reviewOpen &&
              createPortal(
                <div
                  ref={reviewScrollRef}
                  className="schedule-dialog-backdrop scroll-isolation-boundary"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="schedule-review-title"
                  onClick={(event) => {
                    if (event.target === event.currentTarget && !busy) setReviewOpen(false);
                  }}
                >
                  <div className="schedule-dialog schedule-review-dialog">
                    <div className="schedule-review-header">
                      <div>
                        <h2 id="schedule-review-title">核对排期变更并同步</h2>
                        <p>
                          完整核对当前节点排期生效值；实际请求仅提交本次新增或修改的差异节点。
                        </p>
                      </div>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="关闭核对弹窗"
                        disabled={busy}
                        onClick={() => setReviewOpen(false)}
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <div className="schedule-review-summary" aria-label="排期变更统计">
                      <span className="schedule-review-pill is-added">
                        本次新增 {addedEntries.length} 项
                      </span>
                      <span className="schedule-review-pill is-modified">
                        本次修改 {modifiedEntries.length} 项
                      </span>
                      <span className="schedule-review-pill is-unchanged">
                        沿用云端 {unchangedEntries.length} 项
                      </span>
                    </div>

                    <div className="schedule-review-body">
                      {[...addedEntries, ...modifiedEntries].map((entry) => {
                        const kind = classifyScheduleReview(entry);
                        const isAdded = kind === "added";
                        return (
                          <div key={entry.id} className="schedule-review-card">
                            <div className="schedule-review-card-top">
                              <div>
                                <div className="schedule-review-card-title">
                                  <span
                                    className={`schedule-review-badge ${isAdded ? "is-added" : "is-modified"}`}
                                  >
                                    {entry.cancel ? "本次清空" : isAdded ? "本次新增" : "本次修改"}
                                  </span>
                                  <strong>{entry.record.title}</strong>
                                </div>
                                <small>
                                  {projectLabel(entry)} {entry.record.nodeName}{" "}
                                  {targetLabel(entry, entry.record.ownerId || "")}
                                </small>
                              </div>
                              <button
                                type="button"
                                className="secondary"
                                disabled={busy}
                                onClick={() => update(entry.id, revertSchedule)}
                              >
                                还原此项
                              </button>
                            </div>
                            {isAdded ? (
                              <div className="schedule-review-value is-added">
                                <span>本次提交值</span>
                                <strong>
                                  {entry.dates.start} ~ {entry.dates.end}（共{" "}
                                  {scheduleSpanDays(entry.dates)} 天）
                                </strong>
                              </div>
                            ) : (
                              <div className="schedule-review-value is-modified">
                                <span className="schedule-review-cloud">
                                  云端当前值：{formatBaselineRange(entry.baseline)}
                                </span>
                                <span className="schedule-review-arrow" aria-hidden="true">
                                  →
                                </span>
                                <strong className="schedule-review-next">
                                  {entry.cancel
                                    ? "清空草稿已保留，暂不可提交"
                                    : `本次提交值：${entry.dates.start} ~ ${entry.dates.end}（共 ${scheduleSpanDays(entry.dates)} 天）`}
                                </strong>
                              </div>
                            )}
                            {entry.cancel && <p>请先还原云端日期或在飞书中核对处理。</p>}
                          </div>
                        );
                      })}

                      {unchangedEntries.length > 0 && (
                        <div className="schedule-review-unchanged">
                          <h3>沿用云端（{unchangedEntries.length} 项 本次不发送写请求）</h3>
                          {unchangedEntries.map((entry) => (
                            <div key={entry.id} className="schedule-review-unchanged-row">
                              <div>
                                <span className="schedule-review-badge is-unchanged">
                                  沿用云端
                                </span>
                                <strong>{entry.record.title}</strong>
                                <small>
                                  {entry.record.nodeName}{" "}
                                  {targetLabel(entry, entry.record.ownerId || "")}
                                </small>
                              </div>
                              <span className="schedule-review-unchanged-val">
                                {validSchedule(entry.baseline)
                                  ? `${entry.baseline.start} ~ ${entry.baseline.end}`
                                  : hasBaselineSchedule(entry.baseline)
                                    ? formatBaselineRange(entry.baseline)
                                    : "未排期"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="schedule-review-footer">
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => setReviewOpen(false)}
                      >
                        返回继续调整
                      </button>
                      <button
                        type="button"
                        className="primary"
                        disabled={busy}
                        onClick={() => void submit()}
                      >
                        <Check size={14} aria-hidden="true" />
                        确认同步
                      </button>
                    </div>
                  </div>
                </div>,
                document.body,
              )}
          </>
      <span className="sr-only">
        <CalendarDays size={1} />
      </span>
    </section>
    </ScheduleAvatarCacheProvider>
  );
}
