import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { cachedItemDetail, refreshItemDetail } from "./api";
import { loadScheduleHistory, readCachedScheduleHistory, type ScheduleHistory, type ScheduleHistoryRequest, type SchedulePerson, type ScheduleRead } from "./scheduleApi";
import { patchScheduleData } from "./scheduleReadPatch";
import type { ScheduleDates, ScheduleIdentity } from "./scheduleSession";
import type { ItemDetail, Snapshot } from "./types";
import { SCHEDULE_RETRY_DELAY, scheduleReadAvailable, useScheduleRevalidation } from "./useScheduleRevalidation";

export function scheduleHistoryRequest(
  read: ScheduleRead | null,
  snapshot: Snapshot | null | undefined,
  view: "mine" | "people",
  range: ScheduleDates,
): ScheduleHistoryRequest | null {
  if (snapshot?.credential_ready === false) return null;
  const currentUser = read?.currentUserId || undefined;
  const connection = read?.connection || read?.targets[0]?.identity.connection || undefined;

  const types = new Map<string, Set<string>>();
  const users = new Map<string, Set<string>>();
  const addType = (project: string | null | undefined, type: string | null | undefined) => {
    if (!project || !type) return;
    if (!types.has(project)) types.set(project, new Set());
    types.get(project)!.add(type);
  };
  const addUser = (project: string, id: string) => {
    if (!users.has(project)) users.set(project, new Set());
    users.get(project)!.add(id);
  };
  for (const scope of read?.historyScopes || []) {
    addType(scope.project, scope.work_item_type);
    if (view === "people") for (const id of scope.users) addUser(scope.project, id);
  }
  for (const target of read?.targets || []) addType(target.identity.project, target.identity.type);
  for (const source of snapshot?.sources || []) {
    if (!source.enabled || !source.executable) continue;
    if (source.type_scope?.configured) {
      for (const type of source.type_scope.types) {
        if (type.selected) addType(type.project_key, type.type_key);
      }
    } else {
      addType(source.project_key, source.work_item_type_key);
      for (const item of snapshot?.items || []) {
        if (item.source_ids?.includes(source.id)) addType(item.id.project_key, item.id.work_item_type_key);
      }
    }
  }
  if (view === "people") {
    for (const person of read?.people || []) {
      if (!person.project || !person.id || (person.connection && person.connection !== connection)) continue;
      addUser(person.project, person.id);
    }
  }
  const scopes = [...types.keys()].sort().flatMap((project) => {
    const members = [...users.get(project) || []].filter((id) => id !== currentUser).sort();
    return [...types.get(project)!].sort().map((type) => ({ project, work_item_type: type, users: members }));
  });
  return { connection, range, scopes, currentUser };
}

type HistoryPage = {
  data?: ScheduleHistory;
  loading: boolean;
  preloaded: boolean;
  checkedAt?: number;
  attemptedAt?: number;
  failed?: boolean;
};

function preserveHistory(previous?: ScheduleHistory, incoming?: ScheduleHistory): ScheduleHistory | undefined {
  if (incoming) return patchScheduleData(previous, incoming, !incoming.complete);
  return previous ? { ...previous, complete: false } : undefined;
}

const MAX_CACHED_PAGES = 12;
const MAX_PRELOADS = 2;
const NAVIGATION_SETTLE_MS = 75;

export type ScheduleCalendarCache = ReturnType<typeof createScheduleCalendarCache>;

export function createScheduleCalendarCache() {
  let pages = new Map<string, HistoryPage>();
  const listeners = new Set<() => void>();
  const cache = {
    pending: new Map<string, Promise<void>>(),
    preloading: new Set<string>(),
    visibleKey: "",
    protectedKeys: [] as string[],
    paused: false,
    getPages: () => pages,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    updatePage: (key: string, update: (prior?: HistoryPage) => HistoryPage) => {
      const next = new Map(pages);
      next.delete(key);
      next.set(key, update(pages.get(key)));
      for (const [candidate, page] of next) {
        if (next.size <= MAX_CACHED_PAGES) break;
        if (candidate !== key && !page.loading && !cache.protectedKeys.includes(candidate)) next.delete(candidate);
      }
      pages = next;
      for (const listener of listeners) listener();
    },
  };
  return cache;
}

export function scheduleItemKey({ connection, project, type, item }: ScheduleIdentity) {
  return JSON.stringify([connection, project, type, item]);
}

function completedStatus(detail: ItemDetail): string | null | undefined {
  const finished = detail.data.work_item_fields.find((field) => field.key === "finish_status")?.value
    ?? detail.data.work_item_attribute.finish_status;
  if (finished === false || finished === "false") return null;
  if (finished !== true && finished !== "true") return undefined;
  const status = detail.data.work_item_attribute.work_item_status;
  const name = status && typeof status === "object" && "name" in status ? status.name : status;
  return (typeof name === "string" && name.trim()) || "已完成";
}

export type ScheduleCurrentNode = { id: string; name: string; owners: SchedulePerson[]; unknownOwner: boolean };
type ScheduleItemContext = { completedStatus?: string | null; currentNodes?: ScheduleCurrentNode[];
  nodesVerified?: boolean; statusVerified?: boolean; failed?: boolean };

function currentNodes(detail: ItemDetail): ScheduleCurrentNode[] | undefined {
  if (!Array.isArray(detail.data.work_item_current_node)) return undefined;
  const occurrences = new Map<string, number>();
  return detail.data.work_item_current_node.flatMap((node) => {
    if (typeof node.name !== "string" || !node.name.trim()) return [];
    const rawOwners = Array.isArray(node.owners) ? node.owners : [];
    const owners = new Map<string, SchedulePerson>();
    let unknownOwner = false;
    for (const owner of rawOwners) {
      const value = owner && typeof owner === "object" ? owner as Record<string, unknown> : {};
      const id = typeof owner === "string" ? owner : value.key ?? value.user_key ?? value.id;
      if (typeof id !== "string" || !id.trim()) { unknownOwner = true; continue; }
      owners.set(id, { id, name: typeof value.name === "string" ? value.name : id,
        avatar: typeof value.avatar === "string" ? value.avatar : undefined });
    }
    const nodeId = node.id ?? node.node_key;
    let id = typeof nodeId === "string" && nodeId.trim() ? nodeId
      : typeof nodeId === "number" && Number.isSafeInteger(nodeId) ? String(nodeId) : undefined;
    if (!id) {
      const key = JSON.stringify([node.name.trim(), [...owners.keys()].sort(), unknownOwner]);
      const occurrence = occurrences.get(key) || 0;
      occurrences.set(key, occurrence + 1);
      id = `detail-node:${key}:${occurrence}`;
    }
    return [{ id, name: node.name,
      owners: [...owners.values()], unknownOwner }];
  });
}

export function useScheduleItemContexts(context: string, itemKeys: Set<string>, revision: unknown) {
  const request = JSON.stringify([...itemKeys].sort());
  const [contexts, setContexts] = useState<{ context: string; values: Map<string, ScheduleItemContext> }>();
  useEffect(() => {
    const keys: string[] = JSON.parse(request);
    if (!keys.length) return;
    let active = true;
    const publish = (key: string, detail: ItemDetail | null, remote = false) => {
      if (!active || !detail) return;
      const status = completedStatus(detail);
      const nodes = currentNodes(detail);
      setContexts((previous) => {
        const values = previous?.context === context ? previous.values : new Map<string, ScheduleItemContext>();
        const known = values.get(key);
        return { context, values: new Map(values).set(key, { ...known,
          ...(status !== undefined && (remote || !known?.statusVerified) ? { completedStatus: status, statusVerified: remote } : {}),
          ...(nodes !== undefined && (remote || !known?.nodesVerified) ? { currentNodes: nodes, nodesVerified: remote } : {}), failed: false }) };
      });
    };
    const pending = keys.values();
    const readItems = async () => {
      for (const key of pending) {
        if (!active) break;
        const [, project_key, work_item_type_key, work_item_id] = JSON.parse(key);
        const id = { project_key, work_item_type_key, work_item_id };
        try { publish(key, await cachedItemDetail(id)); } catch { /* 仍可向飞书读取。 */ }
        if (!active) break;
        try { publish(key, await refreshItemDetail(id), true); } catch {
          if (active) setContexts((previous) => {
            const values = previous?.context === context ? previous.values : new Map<string, ScheduleItemContext>();
            return { context, values: new Map(values).set(key, { ...values.get(key), failed: true }) };
          });
        }
      }
    };
    const timer = window.setTimeout(() => {
      // 只补读当前日历的事项，限制并发，不阻塞排期加载与编辑。
      void readItems();
      void readItems();
    }, NAVIGATION_SETTLE_MS);
    return () => { active = false; window.clearTimeout(timer); };
  }, [context, request, revision]);
  return contexts?.context === context ? contexts.values : undefined;
}

export function useScheduleCalendar(visibleKey: string, preloadKeys: string[], interval?: number, paused = false, sharedCache?: ScheduleCalendarCache) {
  const [cache] = useState(() => sharedCache ?? createScheduleCalendarCache());
  const pages = useSyncExternalStore(cache.subscribe, cache.getPages);
  useLayoutEffect(() => {
    cache.visibleKey = visibleKey;
    cache.protectedKeys = [visibleKey, ...preloadKeys];
    cache.paused = paused;
    return () => {
      cache.visibleKey = "";
      cache.protectedKeys = [];
      cache.paused = false;
    };
  }, [cache, visibleKey, preloadKeys, paused]);
  const [settledKey, setSettledKey] = useState(visibleKey);
  const navigationSettled = settledKey === visibleKey;
  useEffect(() => {
    if (navigationSettled) return;
    const timeout = window.setTimeout(() => setSettledKey(visibleKey), NAVIGATION_SETTLE_MS);
    return () => window.clearTimeout(timeout);
  }, [visibleKey, navigationSettled]);

  const load = useCallback((key: string, preloaded = false) => {
    if (!key) return Promise.resolve();
    const existing = cache.pending.get(key);
    if (existing) return existing;
    if (preloaded) cache.preloading.add(key);
    const attemptedAt = Date.now();
    cache.updatePage(key, (prior) => ({ ...prior, loading: true, preloaded, attemptedAt }));
    let finished = false;
    const finish = (data?: ScheduleHistory) => {
      finished = true;
      cache.pending.delete(key);
      cache.preloading.delete(key);
      const checkedAt = Date.now();
      const protectedView = cache.paused && cache.visibleKey === key;
      cache.updatePage(key, (prior) => {
        if (protectedView) return { ...prior, loading: false, preloaded, attemptedAt: undefined };
        return {
          ...prior,
          data: !data?.complete && !data?.targets.length && prior?.data?.complete ? prior.data : preserveHistory(prior?.data, data),
          loading: false,
          preloaded,
          ...(data?.complete ? { checkedAt, failed: false } : { attemptedAt: checkedAt, failed: true }),
        };
      });
    };
    const request: ScheduleHistoryRequest = JSON.parse(key)[1];
    let cached: Promise<void> | undefined;
    if (request.cachePeople && !cache.getPages().get(key)?.data) {
      cached = readCachedScheduleHistory(request).then((data) => {
        if (data && !finished && !(cache.paused && cache.visibleKey === key)) {
          cache.updatePage(key, (prior) => ({ ...prior, data: prior?.data ? preserveHistory(data, prior.data) : data, loading: true, preloaded }));
        }
      }, () => {});
    }
    const result = Promise.resolve().then(() => {
      const remote = loadScheduleHistory(request);
      const feed = remote.progress;
      if (!feed) return remote;
      const publish = () => {
        const batch = feed.getSnapshot();
        if (!batch || (cache.paused && cache.visibleKey === key)) return;
        cache.updatePage(key, (prior) => ({ ...prior, loading: true, preloaded,
          data: preserveHistory(prior?.data, { ...batch, complete: false }) }));
      };
      const unsubscribe = feed.subscribe(publish);
      publish();
      return remote.finally(unsubscribe);
    }).then(
      async (data) => { if (!data?.complete) await cached; finish(data); },
      async () => { await cached; finish(); },
    );
    cache.pending.set(key, result);
    return result;
  }, [cache]);

  const [context, request]: [string?, ScheduleHistoryRequest?] = visibleKey ? JSON.parse(visibleKey) : [];
  const compatible = request?.connection ? Array.from(pages).reverse().find(([key, page]) => {
    if (key === visibleKey || page.data?.connection !== request.connection) return false;
    const [priorContext, prior]: [string, ScheduleHistoryRequest] = JSON.parse(key);
    return priorContext === context && !prior.connection && prior.range.start === request.range.start && prior.range.end === request.range.end;
  }) : undefined;
  const exactBootstrap = compatible && request?.scopes.length && compatible[1].data?.complete &&
    JSON.stringify(JSON.parse(compatible[0])[1].scopes) === JSON.stringify(request.scopes);
  const visible = pages.get(visibleKey) ?? (exactBootstrap ? compatible?.[1] : undefined);
  const needsVisibleRead = Boolean(visibleKey && (!visible || (visible.preloaded && !visible.loading && !visible.checkedAt)));
  useEffect(() => {
    if (interval === undefined && navigationSettled && needsVisibleRead) void load(visibleKey);
  }, [visibleKey, needsVisibleRead, navigationSettled, load, interval]);

  const freshUntil = visible?.checkedAt === undefined || interval === undefined ? 0 : visible.checkedAt + interval;
  const dueAt = interval === undefined || paused || !navigationSettled || visible?.loading ? null : Math.max(
    visible?.attemptedAt === undefined ? 0 : visible.attemptedAt + SCHEDULE_RETRY_DELAY,
    freshUntil,
  );
  useScheduleRevalidation(navigationSettled ? visibleKey : "", dueAt, freshUntil, () => { void load(visibleKey); });
  useEffect(() => {
    if (!navigationSettled || !preloadKeys.length) return;
    let timer: number | undefined;
    const preloadNeighbors = () => {
      window.clearTimeout(timer);
      if (!scheduleReadAvailable()) return;
      const now = Date.now();
      let nextRetry = Infinity;
      for (const key of preloadKeys) {
        if (cache.preloading.size >= MAX_PRELOADS) break;
        const page = cache.getPages().get(key);
        if (!page || (page.failed && !page.loading && now - (page.attemptedAt ?? now) >= SCHEDULE_RETRY_DELAY)) {
          void load(key, true);
        } else if (page.failed && !page.loading && page.attemptedAt !== undefined) {
          nextRetry = Math.min(nextRetry, page.attemptedAt + SCHEDULE_RETRY_DELAY);
        }
      }
      if (Number.isFinite(nextRetry)) timer = window.setTimeout(preloadNeighbors, Math.max(1, nextRetry - now));
    };
    preloadNeighbors();
    window.addEventListener("online", preloadNeighbors);
    document.addEventListener("visibilitychange", preloadNeighbors);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", preloadNeighbors);
      document.removeEventListener("visibilitychange", preloadNeighbors);
    };
  }, [cache, preloadKeys, pages, navigationSettled, load]);

  return {
    data: visible?.data ?? compatible?.[1].data,
    loading: needsVisibleRead || Boolean(visible?.loading),
    checkedAt: visible?.checkedAt,
    failed: Boolean(visible?.failed && !visible.preloaded),
    retry: (afterWrite = false) => {
      const pending = cache.pending.get(visibleKey);
      return afterWrite && pending ? pending.then(() => load(visibleKey)) : load(visibleKey);
    },
  };
}
