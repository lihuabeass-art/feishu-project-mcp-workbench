import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  RotateCcw,
  UserRound,
  X,
} from "lucide-react";
import { DateRangePicker } from "./DateRangePicker";
import { Select } from "./Select";
import { ExternalLink } from "./ExternalLink";
import { useScrollIsolation } from "./useScrollIsolation";
import type { Snapshot } from "./types";
import { asError } from "./model";
import { readFailureMessage } from "./readFeedback";
import { sourceName, sourcePresets } from "./sourcePresets";
import {
  closeScheduleSession,
  loadSchedulePeople,
  loadScheduleSession,
  submitScheduleTargets,
  type SchedulePerson,
  type ScheduleRead,
  type ScheduleRecord,
} from "./scheduleApi";
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

type Entry = ScheduleTarget & { record: ScheduleRecord; resultMessage?: string | null };
type Guard = { dirty: boolean; busy: boolean; uncertain: boolean };
type Drag = { id: string; kind: "new" | "move" | "start" | "end"; grabbed: string };

export interface ScheduleSessionController {
  read: ScheduleRead | null;
  pending: Promise<ScheduleRead> | null;
  updateRead: (next: ScheduleRead) => void;
  reload: (options?: { includePeople?: boolean }) => Promise<ScheduleRead>;
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

const resolveDefaultReadOnlyReason = (record: ScheduleRecord): string | undefined => {
  if (record.readOnlyReason) return record.readOnlyReason;
  if (isPastTransitionedStatus(record.nodeStatus)) return "该节点已流转完成，排期仅供查看";
  if (normalizeNodeStatus(record.nodeStatus) === "not_started")
    return "当前连接尚未验证此状态的排期写入";
  if (!record.identity.owner && !record.ownerIds.some(Boolean))
    return "未能确认负责人，排期仅供查看";
  return undefined;
};

const createScheduleEntry = (record: ScheduleRecord): Entry => ({
  id: record.id,
  nodeId: record.identity.node,
  identity: record.identity,
  baseline: { ...record.dates },
  dates: { ...record.dates },
  cancel: false,
  ...(record.result ? { result: record.result } : {}),
  ...(record.resultMessage !== undefined ? { resultMessage: record.resultMessage } : {}),
  readOnlyReason: resolveDefaultReadOnlyReason(record),
  record,
});

const isFallbackPersonName = (name: string | undefined | null, id: string) =>
  !name ||
  !name.trim() ||
  name === id ||
  /^\d+$/.test(name.trim()) ||
  (id.length >= 6 && name === Array.from(id).slice(-6).join(""));

const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const monday = (value: string) =>
  addDays(value, -((new Date(`${value}T00:00:00Z`).getUTCDay() + 6) % 7));
const initials = (name: string) =>
  /[\u3400-\u9fff]/.test(name)
    ? Array.from(name)[0]
    : name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase();
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
const resultLabel = {
  accepted: "上次提交：收到成功回执",
  failed: "上次提交：失败",
  uncertain: "上次提交：结果不确定",
  unsent: "上次提交：未发送",
} as const;

function Avatar({ person }: { person?: SchedulePerson }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [person?.avatar]);
  const color =
    Array.from(person?.id || "").reduce(
      (hash, char) => ((hash * 31 + char.charCodeAt(0)) >>> 0),
      0,
    ) % 4;
  const hasRealInitials = Boolean(person?.name && !/^\d+$/.test(person.name.trim()));
  return (
    <span className={`schedule-avatar schedule-avatar-${color}`} aria-hidden="true">
      {person?.avatar && !failed ? (
        <img src={person.avatar} alt="" onError={() => setFailed(true)} />
      ) : hasRealInitials && person?.name ? (
        initials(person.name)
      ) : (
        <UserRound size={16} />
      )}
    </span>
  );
}

export function SchedulePage({
  onGuardChange,
  requestReload,
  snapshot,
  preloadedSession,
}: {
  onGuardChange: (guard: Guard) => void;
  requestReload: (reload: () => void) => void;
  snapshot?: Snapshot | null;
  preloadedSession?: ScheduleSessionController;
}) {
  const initialRead = preloadedSession?.read || null;
  const [epoch, setEpoch] = useState(0);
  const [read, setRead] = useState<ScheduleRead | null>(() => initialRead);
  const [entries, setEntries] = useState<Entry[]>(() =>
    initialRead ? initialRead.targets.map(createScheduleEntry) : [],
  );
  const [loading, setLoading] = useState(() => !initialRead);
  const [error, setError] = useState("");
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState("");
  const peopleLoadingRef = useRef(false);
  const currentSessionIdRef = useRef(initialRead?.sessionId || "");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [report, setReport] = useState("");
  const [successToast, setSuccessToast] = useState<{ id: number; accepted: number } | null>(null);
  const [selected, setSelected] = useState("");
  const [week, setWeek] = useState(() => monday(today()));
  const [daySpan, setDaySpan] = useState<7 | 14>(7);
  const [view, setView] = useState<"mine" | "people">("mine");
  const viewModeRef = useRef(view);
  viewModeRef.current = view;
  const [source, setSource] = useState("");
  const [project, setProject] = useState("");
  const [type, setType] = useState("");
  const [person, setPerson] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const [editableOnly, setEditableOnly] = useState(false);
  const [poolCollapsed, setPoolCollapsed] = useState(false);
  const [poolTab, setPoolTab] = useState<"pending" | "outside">("pending");
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState("");
  const [preview, setPreview] = useState<{ id: string; start: string; end: string } | null>(null);
  const drag = useRef<Drag | null>(null);
  const reviewBackdropRef = useRef<HTMLDivElement>(null);
  const reviewScrollRef = useScrollIsolation(reviewBackdropRef);

  const currentToday = today();
  const dirty = entries.some(scheduleChanged);
  const uncertain = entries.some((entry) => entry.result === "uncertain");
  const nodeKey = (entry: Entry) =>
    JSON.stringify([
      entry.identity.connection,
      entry.identity.project,
      entry.identity.type,
      entry.identity.item,
      entry.identity.node,
    ]);
  const frozenNodes = new Set(entries.filter((entry) => entry.result === "uncertain").map(nodeKey));

  useEffect(() => {
    onGuardChange({ dirty, busy, uncertain });
  }, [dirty, busy, uncertain, onGuardChange]);

  useEffect(() => {
    if (!successToast) return;
    const timer = window.setTimeout(() => {
      setSuccessToast(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [successToast]);

  useEffect(() => {
    let active = true;
    setSelected("");
    setHoveredId("");
    setReport("");
    setSuccessToast(null);
    setReviewOpen(false);
    setPeopleError("");
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
      currentSessionIdRef.current = "";
      setLoading(true);
      setError("");
      setRead(null);
      setEntries([]);
      const request =
        epoch === 0 && preloadedSession.pending
          ? preloadedSession.pending
          : preloadedSession.reload({ includePeople: viewModeRef.current === "people" });
      request
        .then((result) => {
          if (!active) return;
          currentSessionIdRef.current = result.sessionId;
          setRead(result);
          setEntries(result.targets.map(createScheduleEntry));
          preloadedSession.updateRead(result);
        })
        .catch((failure: unknown) => {
          if (active) setError(`读取事项安排失败：${readFailureMessage(asError(failure).kind)}`);
        })
        .finally(() => {
          if (active) setLoading(false);
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
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      currentSessionIdRef.current = "";
      peopleLoadingRef.current = false;
      void closeScheduleSession(request).catch(() => {});
    };
  }, [epoch]);

  const triggerLoadPeople = (currentRead: ScheduleRead) => {
    if (currentRead.peopleLoaded !== false || peopleLoadingRef.current) return;
    const targetSessionId = currentRead.sessionId;
    currentSessionIdRef.current = targetSessionId;
    peopleLoadingRef.current = true;
    setPeopleLoading(true);
    setPeopleError("");
    loadSchedulePeople(targetSessionId)
      .then((nextRead) => {
        if (currentSessionIdRef.current !== targetSessionId) return;
        setRead(nextRead);
        setEntries((current) => {
          const existingMap = new Map(current.map((item) => [item.id, item]));
          const merged: Entry[] = [];
          const seen = new Set<string>();
          for (const record of nextRead.targets) {
            seen.add(record.id);
            const prevEntry = existingMap.get(record.id);
            if (prevEntry) {
              const keepLocal = scheduleChanged(prevEntry) || prevEntry.result === "uncertain";
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
        preloadedSession?.updateRead(nextRead);
      })
      .catch((failure: unknown) => {
        if (currentSessionIdRef.current !== targetSessionId) return;
        setPeopleError(`读取团队成员排期失败：${readFailureMessage(asError(failure).kind)}`);
      })
      .finally(() => {
        if (currentSessionIdRef.current === targetSessionId) {
          peopleLoadingRef.current = false;
          setPeopleLoading(false);
        }
      });
  };

  useEffect(() => {
    if (!preloadedSession || dirty || busy || busyRef.current || uncertain) return;
    if (
      preloadedSession.read &&
      preloadedSession.read.sessionId !== currentSessionIdRef.current
    ) {
      currentSessionIdRef.current = preloadedSession.read.sessionId;
      peopleLoadingRef.current = false;
      setPeopleLoading(false);
      setPeopleError("");
      setRead(preloadedSession.read);
      setEntries(preloadedSession.read.targets.map(createScheduleEntry));
      setError("");
      setLoading(false);
      if (viewModeRef.current === "people" && preloadedSession.read.peopleLoaded === false) {
        triggerLoadPeople(preloadedSession.read);
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
  }, [preloadedSession?.read, preloadedSession?.pending, dirty, busy, uncertain]);

  const people = useMemo(
    () =>
      new Map(
        read?.people.map((item) => [
          JSON.stringify([item.connection || null, item.project || null, item.id]),
          item,
        ]) || [],
      ),
    [read],
  );
  const personFor = (entry: Entry, id: string): SchedulePerson | undefined => {
    if (!id) return undefined;
    const scoped = people.get(
      JSON.stringify([entry.identity.connection, entry.identity.project, id]),
    );
    const global = people.get(JSON.stringify([null, null, id]));
    const fallbackAvatar =
      id === read?.currentUserId ? read?.currentUserAvatar || undefined : undefined;
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
  };
  const resolveOwnerId = (entry: Entry, owner: string) =>
    owner ||
    entry.record.ownerId ||
    entry.record.ownerIds[0] ||
    (entry.record.mine ? read?.currentUserId || "" : "") ||
    "";
  const displayPerson = (entry: Entry, id: string) => {
    if (!id) return "负责人不明";
    const rawName = personFor(entry, id)?.name;
    if (!rawName || isFallbackPersonName(rawName, id)) {
      if (id === read?.currentUserId) return "当前用户";
      const fallbackPeerIds = Array.from(
        new Set(
          entries
            .filter(
              (item) =>
                item.identity.connection === entry.identity.connection &&
                item.identity.project === entry.identity.project,
            )
            .flatMap((item) => [
              ...(item.record.ownerId ? [item.record.ownerId] : []),
              ...item.record.ownerIds,
            ])
            .filter((peerId) => {
              if (!peerId || peerId === read?.currentUserId) return false;
              const peerName = personFor(entry, peerId)?.name;
              return !peerName || isFallbackPersonName(peerName, peerId);
            }),
        ),
      );
      if (fallbackPeerIds.length <= 1) return "团队成员";
      const idx = fallbackPeerIds.indexOf(id);
      return idx >= 0 ? `团队成员 ${idx + 1}` : "团队成员";
    }
    const peers = (read?.people || []).filter(
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
  };
  const groupKey = (entry: Entry, id: string) =>
    JSON.stringify([entry.identity.connection, entry.identity.project, id]);
  const ownerLabel = (entry: Entry, owner: string) => {
    const ids =
      entry.identity.scope === "node"
        ? entry.record.ownerIds.filter(Boolean)
        : [owner || entry.identity.owner || ""].filter(Boolean);
    const labels = Array.from(new Set(ids)).map((id) => displayPerson(entry, id));
    if (entry.record.unknownOwner) labels.push("尚有负责人身份不明");
    return labels.join("、") || "负责人不明";
  };
  const targetLabel = (entry: Entry, owner: string) =>
    `${
      entry.record.cacheKind === "detail_node"
        ? "事项详情缓存节点 · "
        : entry.record.sourceAggregate
          ? "来源聚合日期 · "
          : entry.identity.scope === "node"
            ? "节点共同排期 · "
            : ""
    }${ownerLabel(entry, owner)}`;
  const projectNames = new Map(
    (snapshot?.workspace_catalog || []).map((item) => [
      item.project_key,
      item.name || item.simple_name || item.project_key,
    ]),
  );
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
  const canEdit = (entry: Entry) => view === "mine" && isEditableTarget(entry) && !busy;

  const baseWeekStart = week;
  const baseWeekEnd = addDays(week, 6);
  const days = Array.from({ length: daySpan }, (_, index) => addDays(week, index));
  const windowStart = days[0];
  const windowEnd = days[days.length - 1];

  const itemIdentityKey = (entry: Entry) =>
    JSON.stringify([
      entry.identity.connection,
      entry.identity.project,
      entry.identity.type,
      entry.identity.item,
      entry.record.title,
    ]);

  const visible = entries.filter(
    (entry) =>
      (!source || entry.record.sourceIds.includes(source)) &&
      (!project || entry.identity.project === project) &&
      (!type || JSON.stringify([entry.identity.project, entry.identity.type]) === type) &&
      (view !== "people" || !person || entry.record.ownerIds.includes(person)) &&
      (view === "people" ||
        !!read?.accountError ||
        entry.record.mine ||
        entry.record.sourceAggregate ||
        entry.record.unknownOwner ||
        (!isPastTransitionedNode(entry) &&
          !entry.identity.owner &&
          !entry.record.ownerIds.some(Boolean))) &&
      (view !== "mine" || !editableOnly || isEditableTarget(entry)),
  );

  const personOptions = new Map<string, Set<string>>();
  for (const item of read?.people || []) {
    if (project && item.project && item.project !== project) continue;
    if (!`${item.name} ${item.id}`.toLowerCase().includes(personQuery.toLowerCase())) continue;
    const names = personOptions.get(item.id) || new Set<string>();
    names.add(item.name || item.id);
    personOptions.set(item.id, names);
  }
  const personBaseLabels = Array.from(personOptions, ([id, names]) => {
    const realNames = Array.from(names).filter((n) => !isFallbackPersonName(n, id));
    const baseLabel =
      realNames.length > 0
        ? realNames.join(" / ")
        : id === read?.currentUserId
          ? "当前用户"
          : "成员";
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
  const currentUserGlobal = read?.currentUserId
    ? people.get(JSON.stringify([null, null, read.currentUserId]))
    : undefined;
  const currentUserScopedReal = read?.currentUserId
    ? read.people.find(
        (item) =>
          item.id === read.currentUserId && !isFallbackPersonName(item.name, read.currentUserId!),
      )
    : undefined;
  const currentUserDisplayName =
    (currentUserGlobal && !isFallbackPersonName(currentUserGlobal.name, read?.currentUserId || "")
      ? currentUserGlobal.name
      : currentUserScopedReal?.name) || "当前用户";
  const currentUserPerson: SchedulePerson | undefined = read?.currentUserId
    ? {
        id: read.currentUserId,
        name: currentUserDisplayName,
        avatar:
          currentUserGlobal?.avatar ||
          currentUserScopedReal?.avatar ||
          read.currentUserAvatar ||
          undefined,
      }
    : currentUserGlobal;

  const scopeSources = source
    ? read?.sources.filter((item) => item.id === source) || []
    : read?.sources || [];
  const scopeErrors =
    read?.itemErrors?.filter((item) => !source || item.sources.includes(source)) || [];
  const scopeComplete = source
    ? scopeSources.length > 0 && scopeSources.every((item) => item.complete) && scopeErrors.length === 0
    : read?.complete;

  const personRows = (items: Entry[]) =>
    items
      .flatMap((entry) =>
        (entry.record.ownerIds.length ? entry.record.ownerIds : [""])
          .filter((id) => !person || id === person)
          .map((owner) => ({ entry, owner })),
      )
      .sort(
        (a, b) =>
          (personFor(a.entry, a.owner)?.name || a.owner).localeCompare(
            personFor(b.entry, b.owner)?.name || b.owner,
          ) || groupKey(a.entry, a.owner).localeCompare(groupKey(b.entry, b.owner)),
      );

  const scheduled = visible.filter(
    (entry) =>
      validSchedule(entry.dates) &&
      entry.dates.start <= windowEnd &&
      entry.dates.end >= windowStart,
  );
  const rawScheduledRows =
    view === "people"
      ? personRows(scheduled)
      : scheduled.map((entry) => ({ entry, owner: entry.record.ownerId || "" }));

  const groupedRowMap = new Map<string, { key: string; owner: string; entries: Entry[] }>();
  for (const { entry, owner } of rawScheduledRows) {
    const key =
      view === "people"
        ? JSON.stringify([groupKey(entry, owner), itemIdentityKey(entry)])
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

  const rows = Array.from(groupedRowMap.values()).map(({ key, owner, entries: groupEntries }) => {
    const sorted = [...groupEntries].sort(
      (a, b) =>
        (a.record.nodeOrder ?? 0) - (b.record.nodeOrder ?? 0) ||
        a.dates.start.localeCompare(b.dates.start) ||
        a.dates.end.localeCompare(b.dates.end) ||
        a.id.localeCompare(b.id),
    );
    const laneLastEndCol: number[] = [];
    const bars = sorted.map((entry) => {
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

  const pending = visible.filter(
    (entry) => isCurrentSchedulablePoolNode(entry) && !validSchedule(entry.dates),
  );
  const pendingRows =
    view === "people"
      ? personRows(pending)
      : pending.map((entry) => ({ entry, owner: entry.record.ownerId || "" }));

  const outside = visible.filter(
    (entry) =>
      isCurrentSchedulablePoolNode(entry) &&
      validSchedule(entry.dates) &&
      (entry.dates.end < baseWeekStart || entry.dates.start > baseWeekEnd),
  );
  const outsideRows =
    view === "people"
      ? personRows(outside)
      : outside.map((entry) => ({ entry, owner: entry.record.ownerId || "" }));

  const selectedEntry = visible.find((entry) => entry.id === selected);
  const siblingNodes = (() => {
    if (!selectedEntry) return [];
    const targetItemKey = itemIdentityKey(selectedEntry);
    const candidates = visible.filter(
      (item) =>
        itemIdentityKey(item) === targetItemKey &&
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
      } else if (person) {
        const aMatch = a.record.ownerIds.includes(person);
        const bMatch = b.record.ownerIds.includes(person);
        if (aMatch !== bMatch) return aMatch ? -1 : 1;
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
      const aPendingActive = !validSchedule(a.dates) && isCurrentSchedulablePoolNode(a);
      const bPendingActive = !validSchedule(b.dates) && isCurrentSchedulablePoolNode(b);
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

  const changedEntries = entries.filter(
    (entry) => scheduleChanged(entry) && !frozenNodes.has(nodeKey(entry)),
  );
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
    if (reviewOpen && changedEntries.length === 0) setReviewOpen(false);
  }, [reviewOpen, changedEntries.length]);

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
    "related-story": "我参与的需求",
    related_story: "我参与的需求",
    "related-issue": "关联缺陷",
    related_issue: "关联缺陷",
  };
  const readableSourceName = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return "工作来源";
    const matched = read?.sources.find((src) => src.id === trimmed || src.name === trimmed);
    if (matched?.name && !isOpaqueKey(matched.name)) return matched.name;
    const lookupId = matched?.id || trimmed;
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
    return `${spaceLabel} · ${itemLabel}${sourceSuffix}：${item.message}`;
  };

  const update = (id: string, fn: (entry: Entry) => ScheduleTarget) =>
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...fn(entry) } : entry)),
    );
  const options = (values: Array<[string, string]>, all: string) => [
    { value: "", label: all },
    ...Array.from(new Map(values)).map(([value, label]) => ({ value, label })),
  ];

  const applyQuickPreset = (id: string, preset: ScheduleQuickPreset) => {
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
    setSelected(id);
    update(id, (entry) => {
      if (!canEdit(entry)) return entry;
      const span = Math.max(1, scheduleSpanDays(entry.dates) || 1);
      if (currentToday >= windowStart && currentToday <= windowEnd) {
        const start = currentToday;
        const weekSunday = addDays(monday(currentToday), 6);
        const rawEnd = addDays(start, span - 1);
        const end = rawEnd <= weekSunday ? rawEnd : weekSunday;
        return editSchedule(entry, { start, end: end < start ? start : end });
      }
      const start = week;
      const weekFriday = addDays(week, 4);
      const rawEnd = addDays(start, span - 1);
      const end = rawEnd <= weekFriday ? rawEnd : weekFriday;
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
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", entry.id);
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

  const poolDrop = (event: DragEvent) => {
    event.preventDefault();
    const current = drag.current;
    drag.current = null;
    setPreview(null);
    if (!current || current.kind === "new" || busyRef.current) return;
    update(current.id, (entry) =>
      !hasBaselineSchedule(entry.baseline) ? revertSchedule(entry) : entry,
    );
  };

  function openReviewOrValidate() {
    if (busyRef.current) return;
    const changed = entries.filter(
      (entry) => scheduleChanged(entry) && !frozenNodes.has(nodeKey(entry)),
    );
    const invalid = changed
      .map((entry) => ({ entry, message: scheduleValidation(entry) }))
      .filter((entry) => entry.message);
    if (!changed.length) return;
    if (invalid.length) {
      setSelected(invalid[0].entry.id);
      setSuccessToast(null);
      setReport(`无法同步：${invalid[0].entry.record.title}：${invalid[0].message}`);
      return;
    }
    setReviewOpen(true);
  }

  async function submit() {
    if (busyRef.current) return;
    const changed = entries.filter(
      (entry) => scheduleChanged(entry) && !frozenNodes.has(nodeKey(entry)),
    );
    const invalid = changed
      .map((entry) => ({ entry, message: scheduleValidation(entry) }))
      .filter((entry) => entry.message);
    if (!changed.length) return;
    if (invalid.length) {
      setReviewOpen(false);
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
          };
        }),
      );
      if (preloadedSession && read) {
        const nextRead: ScheduleRead = {
          ...read,
          targets: read.targets.map((record) => {
            const submission = frozen.find((item) => item.id === record.id);
            if (!submission) return record;
            const outcome = results.get(record.id)?.result || "uncertain";
            const resultMessage = results.get(record.id)?.message;
            if (outcome === "accepted" || outcome === "uncertain") {
              return {
                ...record,
                dates: { ...submission.dates },
                result: outcome,
                resultMessage,
              };
            }
            return record;
          }),
        };
        setRead(nextRead);
        preloadedSession.updateRead(nextRead);
      }
      const count = (result: string) =>
        frozen.filter((item) => (results.get(item.id)?.result || "uncertain") === result).length;
      const accepted = count("accepted");
      const failed = count("failed");
      const uncertainCount = count("uncertain");
      const unsent = count("unsent");
      if (accepted > 0 && failed === 0 && uncertainCount === 0 && unsent === 0) {
        setReport("");
        setSuccessToast({ id: Date.now(), accepted });
      } else {
        setSuccessToast(null);
        setReport(
          `本次同步：收到成功回执 ${accepted} 项，失败 ${failed} 项，结果不确定 ${uncertainCount} 项，未发送 ${unsent} 项；实际写请求 ${response.writeRequests} 次。成功回执未回读核验。`,
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
      if (!unsent && preloadedSession && read) {
        const nextRead: ScheduleRead = {
          ...read,
          targets: read.targets.map((record) => {
            const item = frozen.find((value) => value.id === record.id);
            return item
              ? { ...record, dates: { ...item.dates }, result: "uncertain" }
              : record;
          }),
        };
        setRead(nextRead);
        preloadedSession.updateRead(nextRead);
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

  const activeTodayCount = scheduled.filter(
    (entry) => entry.dates.start <= currentToday && entry.dates.end >= currentToday,
  ).length;
  const dailyLoads = days.map(
    (day) =>
      scheduled.filter((entry) => entry.dates.start <= day && entry.dates.end >= day).length,
  );

  return (
    <section className="schedule-page" aria-label="事项安排">
      {loading ? (
        <div className="overview schedule-overview">
          <div className="schedule-overview-metrics">
            <span className="overview-icon">
              <CalendarDays size={20} />
            </span>
            <div>
              <span>事项安排</span>
              <p role="status">正在读取个人待办及节点排期…</p>
            </div>
          </div>
          <div className="overview-actions schedule-overview-actions">
            <button type="button" className="primary" disabled>
              同步排期
            </button>
          </div>
        </div>
      ) : error ? (
        <div className="banner warning" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="secondary"
            onClick={() => setEpoch((value) => value + 1)}
          >
            重新读取
          </button>
        </div>
      ) : (
        read && (
          <>
            <div className="overview schedule-overview">
              <div className="schedule-overview-metrics">
                <span className="overview-icon">
                  <CalendarDays size={20} />
                </span>
                <div className="schedule-metric">
                  <span>待排期节点</span>
                  <strong>
                    {pending.length}
                    <small>{pending.filter(canEdit).length} 项可排期</small>
                  </strong>
                </div>
                <div className="overview-divider" />
                <div className="schedule-metric">
                  <span>视窗内已排</span>
                  <strong>
                    {scheduled.length}
                    <small>今日进行 {activeTodayCount}</small>
                  </strong>
                </div>
                <div className="overview-divider" />
                <div className="schedule-metric">
                  <span>本地排期草稿</span>
                  <strong>
                    {changedEntries.length}
                    <small>
                      {changedEntries.length > 0
                        ? `新增 ${addedEntries.length} · 修改 ${modifiedEntries.length}`
                        : "尚无改动"}
                    </small>
                  </strong>
                </div>
              </div>

              <div className="overview-actions schedule-overview-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => requestReload(() => setEpoch((value) => value + 1))}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  重新读取
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
                  disabled={changedEntries.length === 0 || busy || loading}
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

            <div className="schedule-scope">
              <div className="schedule-scope-summary">
                <span
                  className={`schedule-scope-dot ${scopeSources.length === 0 ? "is-idle" : scopeComplete ? "is-ok" : "is-warn"}`}
                  aria-hidden="true"
                />
                <span className="schedule-scope-text">
                  来源：{scopeSources.map((item) => readableSourceName(item.name || item.id)).join("、") || "无可执行来源"}
                  {scopeSources.length > 0 && ` · ${scopeComplete ? "完整读取" : "部分读取失败"}`} · 读取时间{" "}
                  {read.readAt}
                  {read.readRequests !== undefined && ` · 读取请求 ${read.readRequests} 次`}
                </span>
                {view === "mine" && (
                  <span className="schedule-person">
                    <Avatar person={currentUserPerson} />
                    {currentUserDisplayName}
                  </span>
                )}
                <button
                  type="button"
                  className="secondary schedule-diagnostics-toggle"
                  aria-expanded={diagnosticsOpen}
                  onClick={() => setDiagnosticsOpen((open) => !open)}
                >
                  {diagnosticsOpen ? "收起诊断" : "读取说明"}
                  <ChevronDown size={13} aria-hidden="true" />
                </button>
              </div>
              {diagnosticsOpen && (
                <div className="schedule-diagnostics-drawer">
                  <p>来源筛选按事项归属；节点不一定都出现在该来源的待办中。</p>
                </div>
              )}
              {scopeSources
                .filter((item) => item.error)
                .map((item) => (
                  <p key={item.id} className="schedule-source-error">
                    {readableSourceName(item.name || item.id)}：{item.error}
                  </p>
                ))}
            </div>

            {read.accountError && (
              <div className="banner warning" role="alert">
                {read.accountError}；以下显示当前来源中可读取的安排，均为只读。
              </div>
            )}
            {!!scopeErrors.length && (
              <div className="banner warning">
                <div>
                  <strong>部分事项读取不完整，已保留本次成功读取的内容。</strong>
                  {scopeErrors.map((item, index) => (
                    <p key={index}>{formatScopeError(item)}</p>
                  ))}
                </div>
              </div>
            )}
            {peopleLoading && (
              <div className="banner preview" role="status">
                <span>正在加载团队成员排期…</span>
              </div>
            )}
            {peopleError && !peopleLoading && (
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
            {report && (
              <div className="banner warning" role="alert">
                {report}
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
            {uncertain && (
              <div className="banner warning">
                <span>部分排期可能已保存，请在飞书核对。</span>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => requestReload(() => setEpoch((value) => value + 1))}
                >
                  放弃本次编辑并重新读取
                </button>
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
                      onClick={() => {
                        setView("people");
                        if (read && read.peopleLoaded === false) {
                          triggerLoadPeople(read);
                        }
                      }}
                    >
                      按人查看
                    </button>
                  </div>
                  <Select
                    ariaLabel="筛选来源"
                    value={source}
                    onChange={setSource}
                    options={options(
                      read.sources.map((item) => [item.id, readableSourceName(item.name || item.id)]),
                      "全部来源",
                    )}
                  />
                  <Select
                    ariaLabel="筛选空间"
                    value={project}
                    onChange={(value) => {
                      setProject(value);
                      setType("");
                    }}
                    options={options(
                      entries.map((item) => [item.identity.project, projectLabel(item)]),
                      "全部空间",
                    )}
                  />
                  <Select
                    ariaLabel="筛选类型"
                    value={type}
                    onChange={setType}
                    options={options(
                      entries
                        .filter((item) => !project || item.identity.project === project)
                        .map((item) => [
                          JSON.stringify([item.identity.project, item.identity.type]),
                          `${projectLabel(item)} · ${typeLabel(item)}`,
                        ]),
                      "全部类型",
                    )}
                  />
                  {view === "people" && (
                    <>
                      <input
                        className="schedule-person-search"
                        aria-label="搜索人员"
                        placeholder="搜索人员"
                        value={personQuery}
                        onChange={(event) => setPersonQuery(event.target.value)}
                      />
                      <Select
                        ariaLabel="筛选人员"
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
                    {poolCollapsed ? "展开待排池" : "收起待排池"}
                  </button>

                  <div className="schedule-tabs" role="group" aria-label="时间跨度">
                    <button
                      type="button"
                      className={daySpan === 7 ? "active" : ""}
                      aria-pressed={daySpan === 7}
                      onClick={() => setDaySpan(7)}
                    >
                      单周 7天
                    </button>
                    <button
                      type="button"
                      className={daySpan === 14 ? "active" : ""}
                      aria-pressed={daySpan === 14}
                      onClick={() => setDaySpan(14)}
                    >
                      双周 14天
                    </button>
                  </div>

                  <div className="schedule-week-nav">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="上一周"
                      onClick={() => setWeek(addDays(week, -7))}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <strong>
                      {windowStart} — {windowEnd}
                    </strong>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="下一周"
                      onClick={() => setWeek(addDays(week, 7))}
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setWeek(monday(today()))}
                    >
                      本周
                    </button>
                  </div>
                </div>
              </div>

              <div className={`schedule-layout ${poolCollapsed ? "is-pool-collapsed" : ""}`}>
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
                    <div className="schedule-pool-tabs" role="tablist" aria-label="待排与非当前视窗切换">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={poolTab === "pending"}
                        className={poolTab === "pending" ? "active" : ""}
                        onClick={() => setPoolTab("pending")}
                      >
                        待排期 ({pendingRows.length})
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={poolTab === "outside"}
                        className={poolTab === "outside" ? "active" : ""}
                        onClick={() => setPoolTab("outside")}
                      >
                        其他周已排 ({outsideRows.length})
                      </button>
                    </div>

                    {poolTab === "pending" ? (
                      <>
                        <p className="schedule-pool-hint">
                          点快捷胶囊一键排期，或拖入右侧日历设期；新增草稿可拖回此处撤回。
                        </p>
                        <div className="schedule-pool-list">
                          {pendingRows.map(({ entry, owner }, index) => (
                            <Fragment key={`${entry.id}:${owner}`}>
                              {view === "people" &&
                                (index === 0 ||
                                  groupKey(pendingRows[index - 1].entry, pendingRows[index - 1].owner) !==
                                    groupKey(entry, owner)) && (
                                  <div className="schedule-group">
                                    <Avatar person={personFor(entry, resolveOwnerId(entry, owner))} />
                                    <span>{owner ? displayPerson(entry, owner) : "负责人不明"}</span>
                                  </div>
                                )}
                              <div
                                className={`schedule-pending-card ${entry.id === selected ? "selected" : ""}`}
                              >
                                <button
                                  type="button"
                                  className="schedule-pending-item"
                                  draggable={canEdit(entry)}
                                  onDragStart={(event) => startDrag(event, entry, "new", "")}
                                  onDragEnd={() => {
                                    drag.current = null;
                                    setPreview(null);
                                  }}
                                  onClick={() => setSelected(entry.id)}
                                >
                                  <span className="schedule-pending-head">
                                    <strong>{entry.record.title}</strong>
                                    {!canEdit(entry) && (
                                      <span className="schedule-readonly-pill" aria-hidden="true">
                                        只读
                                      </span>
                                    )}
                                  </span>
                                  <span>
                                    {entry.record.nodeName} ·{" "}
                                    {view === "people" ? (
                                      <>
                                        {owner ? displayPerson(entry, owner) : "负责人不明"} ·{" "}
                                        {entry.record.cacheKind === "detail_node"
                                          ? "事项详情缓存节点 · "
                                          : entry.identity.scope === "node" &&
                                            !entry.record.sourceAggregate &&
                                            "节点共同排期 · "}
                                        {entry.record.sourceAggregate && "来源聚合日期 · "}
                                        {entry.record.unknownOwner && "尚有负责人身份不明 · "}
                                      </>
                                    ) : (
                                      <>{targetLabel(entry, owner)} · </>
                                    )}
                                    {dateStatus(entry)}
                                  </span>
                                  {entry.result && (
                                    <span className="schedule-result">
                                      {resultLabel[entry.result]}
                                    </span>
                                  )}
                                  {entry.readOnlyReason && <small>{entry.readOnlyReason}</small>}
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
                          {pendingRows.length === 0 && (
                            <p className="schedule-pool-empty">当前筛选下暂无待排期事项</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="schedule-pool-hint">
                          点击卡片在右侧调整或直接拖入当前周日历；也可一键排入本周或定位至对应周。
                        </p>
                        <div className="schedule-pool-list">
                          {outsideRows.map(({ entry, owner }, index) => (
                            <Fragment key={`${entry.id}:${owner}`}>
                              {view === "people" &&
                                (index === 0 ||
                                  groupKey(outsideRows[index - 1].entry, outsideRows[index - 1].owner) !==
                                    groupKey(entry, owner)) && (
                                  <div className="schedule-group">
                                    <Avatar person={personFor(entry, resolveOwnerId(entry, owner))} />
                                    <span>{owner ? displayPerson(entry, owner) : "负责人不明"}</span>
                                  </div>
                                )}
                              <div
                                className={`schedule-pending-card schedule-outside-card ${entry.id === selected ? "selected" : ""}`}
                              >
                                <button
                                  type="button"
                                  className={`schedule-outside-item ${entry.id === selected ? "selected" : ""}`}
                                  draggable={canEdit(entry)}
                                  onDragStart={(event) => startDrag(event, entry, "new", "")}
                                  onDragEnd={() => {
                                    drag.current = null;
                                    setPreview(null);
                                  }}
                                  onClick={() => setSelected(entry.id)}
                                >
                                  <span className="schedule-pending-head">
                                    <strong>{entry.record.title}</strong>
                                    {!canEdit(entry) && (
                                      <span className="schedule-readonly-pill" aria-hidden="true">
                                        只读
                                      </span>
                                    )}
                                  </span>
                                  <span>
                                    {entry.record.nodeName} · {targetLabel(entry, owner)}
                                  </span>
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
                                    <span>其他周排期</span>
                                  )}
                                  <button
                                    type="button"
                                    className="schedule-quick-chip"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setWeek(monday(entry.dates.start));
                                      setSelected(entry.id);
                                    }}
                                  >
                                    定位该周 ↗
                                  </button>
                                </div>
                              </div>
                            </Fragment>
                          ))}
                          {outsideRows.length === 0 && (
                            <p className="schedule-pool-empty">没有散落在其他周的已排事项</p>
                          )}
                        </div>
                      </>
                    )}
                  </aside>
                )}

                <div className="schedule-main">
                  <div
                    className="schedule-calendar"
                    style={{ "--schedule-cols": days.length } as React.CSSProperties}
                  >
                    <div className="schedule-calendar-header">
                      <div className="schedule-corner-cell">
                        <span>事项 / 节点归属</span>
                        <small>共 {rows.length} 项</small>
                      </div>
                      <div className="schedule-days">
                        {days.map((day, index) => {
                          const weekdayIndex =
                            (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
                          const isWeekend = weekdayIndex >= 5;
                          const isToday = day === currentToday;
                          const load = dailyLoads[index];
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
                              {(view === "people" ? load > 0 : load >= 3) && (
                                <small className="schedule-day-load" aria-hidden="true">
                                  {load}项
                                </small>
                              )}
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
                      const rowSelected = bars.some((b) => b.entry.id === selected);
                      const resultEntry =
                        bars.find((b) => b.entry.id === selected && b.entry.result)?.entry ||
                        bars.find((b) => b.entry.result)?.entry;
                      return (
                        <Fragment key={key}>
                          {view === "people" &&
                            (rowIndex === 0 ||
                              groupKey(rows[rowIndex - 1].primaryEntry, rows[rowIndex - 1].owner) !==
                                groupKey(primaryEntry, owner)) && (
                              <div className="schedule-group">
                                <Avatar
                                  person={personFor(
                                    primaryEntry,
                                    resolveOwnerId(primaryEntry, owner),
                                  )}
                                />
                                <span>
                                  {owner ? displayPerson(primaryEntry, owner) : "负责人不明"}
                                </span>
                              </div>
                            )}
                          <div className={`schedule-row ${rowSelected ? "selected" : ""}`}>
                            <div
                              className="schedule-row-label"
                              onClick={() => setSelected(primaryEntry.id)}
                            >
                              <Avatar
                                person={personFor(
                                  primaryEntry,
                                  resolveOwnerId(primaryEntry, owner),
                                )}
                              />
                              <span>
                                <strong>{primaryEntry.record.title}</strong>
                                <small>
                                  {bars.length > 1
                                    ? `${primaryEntry.record.nodeName}（共 ${bars.length} 个节点） · ${targetLabel(primaryEntry, owner)}`
                                    : `${primaryEntry.record.nodeName} · ${targetLabel(primaryEntry, owner)}`}
                                </small>
                                {resultEntry?.result && (
                                  <small className="schedule-result">
                                    {resultLabel[resultEntry.result]}
                                  </small>
                                )}
                              </span>
                            </div>
                            <div
                              className="schedule-row-grid"
                              style={
                                laneCount > 1
                                  ? ({
                                      "--schedule-lanes": laneCount,
                                      gridTemplateRows: `repeat(${laneCount}, minmax(44px, auto))`,
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
                                  const spanDays = scheduleSpanDays(entry.dates);
                                  const isBarHovered = hoveredId === entry.id;
                                  const ariaName = `${entry.record.title}${
                                    entry.record.nodeName &&
                                    entry.record.nodeName !== entry.record.title
                                      ? ` · ${entry.record.nodeName}`
                                      : ""
                                  }${entry.result ? ` · ${resultLabel[entry.result]}` : ""}`;
                                  return (
                                    <Fragment key={entry.id}>
                                      <button
                                        type="button"
                                        aria-label={ariaName}
                                        className={[
                                          "schedule-bar",
                                          barStateClass,
                                          isNarrowBar && "is-narrow-bar",
                                          isSingleCol && "is-single-day-bar",
                                          isBarHovered && "is-hovered",
                                          entry.id === selected && "selected",
                                        ]
                                          .filter(Boolean)
                                          .join(" ")}
                                        style={{
                                          gridColumn: `${startCol + 1} / ${endCol + 2}`,
                                          gridRow: lane + 1,
                                        }}
                                        draggable={editable}
                                        onDragStart={(event) => {
                                          setHoveredId("");
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
                                          setPreview(null);
                                        }}
                                        onMouseEnter={() => setHoveredId(entry.id)}
                                        onMouseLeave={() =>
                                          setHoveredId((curr) =>
                                            curr === entry.id ? "" : curr,
                                          )
                                        }
                                        onFocus={() => setHoveredId(entry.id)}
                                        onBlur={() =>
                                          setHoveredId((curr) =>
                                            curr === entry.id ? "" : curr,
                                          )
                                        }
                                        onClick={() => setSelected(entry.id)}
                                        title={`${entry.record.title} · ${barTitleText}（${entry.dates.start} ~ ${entry.dates.end}，共 ${spanDays} 天）`}
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
                                                setHoveredId("");
                                                startDrag(event, entry, "start", entry.dates.start);
                                              }}
                                              aria-hidden="true"
                                            />
                                          )
                                        )}
                                        <span className="schedule-bar-title">
                                          {barTitleText}
                                          {entry.result && ` · ${resultLabel[entry.result]}`}
                                        </span>
                                        <span className="schedule-bar-badges" aria-hidden="true">
                                          <span className="schedule-bar-days">{spanDays}d</span>
                                          {changed && (
                                            <span className="schedule-bar-badge is-draft">
                                              {classifyScheduleReview(entry) === "added"
                                                ? "新增"
                                                : "已改"}
                                            </span>
                                          )}
                                          {!editable && !isFrozen && (
                                            <span
                                              className={`schedule-bar-badge ${pastNode ? "is-past" : "is-readonly"}`}
                                            >
                                              {pastNode ? (
                                                <>
                                                  <Check size={11} strokeWidth={2.4} />
                                                  <span className="schedule-bar-past-text">
                                                    已流转
                                                  </span>
                                                </>
                                              ) : (
                                                <Lock size={11} />
                                              )}
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
                                                setHoveredId("");
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

                    {rows.length === 0 && (
                      <div className="schedule-empty-body">
                        <div
                          className="schedule-empty-grid"
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
                          {days.map((day) => {
                            const weekdayIndex =
                              (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
                            return (
                              <div
                                key={day}
                                className={[
                                  weekdayIndex >= 5 && "weekend",
                                  day === currentToday && "today",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              />
                            );
                          })}
                        </div>
                        <p className="schedule-empty">
                          {view === "people" && person && visible.length === 0
                            ? "当前范围未包含该人员的安排"
                            : "本周暂无可显示的安排"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <aside className="schedule-inspector" aria-label="排期检查器">
                  <div className="schedule-inspector-head">
                    <strong>排期检查器</strong>
                    {selectedEntry && scheduleChanged(selectedEntry) && (
                      <span className="schedule-inspector-dirty">本地草稿</span>
                    )}
                  </div>
                  {selectedEntry ? (
                    <div className="schedule-editor">
                      <div className="schedule-editor-meta">
                        <span className="schedule-editor-tag">
                          {projectLabel(selectedEntry)} · {typeLabel(selectedEntry)}
                        </span>
                        {selectedEntry.record.itemUrl && (
                          <div className="workflow-manual-fill detail-item-link">
                            <ExternalLink
                              href={selectedEntry.record.itemUrl}
                              title="在浏览器打开飞书事项"
                            >
                              打开飞书事项
                              <ArrowUpRight size={13} aria-hidden="true" />
                            </ExternalLink>
                          </div>
                        )}
                      </div>
                      <div>
                        <h3>{selectedEntry.record.title}</h3>
                        <p>
                          {selectedEntry.record.nodeName} ·{" "}
                          {targetLabel(selectedEntry, selectedEntry.record.ownerId || "")}{" "}
                          {scheduleChanged(selectedEntry) && "· 未同步"}
                        </p>
                      </div>
                      {siblingNodes.length > 1 && (
                        <div
                          className="schedule-sibling-nodes"
                          role="group"
                          aria-label="同事项节点"
                        >
                          <span className="schedule-sibling-label">
                            同事项节点（{siblingNodes.length}）
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
                                : "待安排";
                              const stateText = isPast
                                ? "已流转只读"
                                : editableNode
                                  ? "当前可排"
                                  : "只读";
                              return (
                                <button
                                  key={node.id}
                                  type="button"
                                  className={`schedule-sibling-chip ${isCurrent ? "active" : ""} ${hoveredId === node.id ? "is-hovered" : ""} ${isPast ? "is-past" : editableNode ? "is-editable" : "is-readonly"}`}
                                  aria-pressed={isCurrent}
                                  onClick={() => setSelected(node.id)}
                                  onMouseEnter={() => setHoveredId(node.id)}
                                  onMouseLeave={() =>
                                    setHoveredId((curr) => (curr === node.id ? "" : curr))
                                  }
                                >
                                  <strong>{node.record.nodeName || node.record.title}</strong>
                                  <span>
                                    {dateText} · {stateText}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {view === "mine" && (
                        <>
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
                          {validSchedule(selectedEntry.dates) && (
                            <p className="schedule-span-info">
                              共 {scheduleSpanDays(selectedEntry.dates)} 个自然日
                            </p>
                          )}
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
                          {hasBaselineSchedule(selectedEntry.baseline) && (
                            <p className="schedule-clear-note">
                              当前飞书连接暂未验证清空排期接口；如需清空已有排期，请在飞书中修改。
                            </p>
                          )}
                        </>
                      )}
                      <p>{dateStatus(selectedEntry)}</p>
                      {selectedEntry.record.fetchedAt && (
                        <p>事项详情抓取时间 {selectedEntry.record.fetchedAt}</p>
                      )}
                      {selectedEntry.readOnlyReason && <p>{selectedEntry.readOnlyReason}</p>}
                      {selectedEntry.resultMessage && <p>{selectedEntry.resultMessage}</p>}
                      {frozenNodes.has(nodeKey(selectedEntry)) && (
                        <p>该节点存在结果不确定的排期，请先在飞书核对并重新读取。</p>
                      )}
                      {!selectedEntry.record.itemUrl &&
                        frozenNodes.has(nodeKey(selectedEntry)) && (
                          <p>无法确认飞书事项链接，请在飞书中按事项名称查找并核对。</p>
                        )}
                      {scheduleChanged(selectedEntry) && scheduleValidation(selectedEntry) && (
                        <p role="alert">{scheduleValidation(selectedEntry)}</p>
                      )}
                    </div>
                  ) : (
                    <div className="schedule-inspector-empty">
                      <p>点击左侧待排卡片或日历中的排期长条，在此查看和调整节点日期。</p>
                    </div>
                  )}
                </aside>
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
                                    {isAdded ? "本次新增" : "本次修改"}
                                  </span>
                                  <strong>{entry.record.title}</strong>
                                </div>
                                <small>
                                  {projectLabel(entry)} · {entry.record.nodeName} ·{" "}
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
                                  本次提交值：{entry.dates.start} ~ {entry.dates.end}（共{" "}
                                  {scheduleSpanDays(entry.dates)} 天）
                                </strong>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {unchangedEntries.length > 0 && (
                        <div className="schedule-review-unchanged">
                          <h3>沿用云端（{unchangedEntries.length} 项 · 本次不发送写请求）</h3>
                          {unchangedEntries.map((entry) => (
                            <div key={entry.id} className="schedule-review-unchanged-row">
                              <div>
                                <span className="schedule-review-badge is-unchanged">
                                  沿用云端
                                </span>
                                <strong>{entry.record.title}</strong>
                                <small>
                                  {entry.record.nodeName} ·{" "}
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
        )
      )}
      <span className="sr-only">
        <CalendarDays size={1} />
      </span>
    </section>
  );
}
