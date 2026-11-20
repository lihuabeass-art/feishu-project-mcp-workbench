import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cachedItemDetail, refreshItemDetail } from "./api";
import { loadScheduleHistory, type ScheduleHistory, type ScheduleHistoryRequest, type ScheduleRead } from "./scheduleApi";
import type { ScheduleDates, ScheduleIdentity } from "./scheduleSession";
import type { ItemDetail, Snapshot } from "./types";

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

type HistoryPage = { data?: ScheduleHistory; loading: boolean; preloaded: boolean };

function preserveHistory(previous?: ScheduleHistory, incoming?: ScheduleHistory): ScheduleHistory | undefined {
  if (!previous || incoming?.complete) return incoming;
  const targets = new Map([...previous.targets, ...incoming?.targets || []].map((target) => [target.id, target]));
  const people = new Map([...previous.people, ...incoming?.people || []].map((person) => [
    JSON.stringify([person.connection, person.project, person.id]), person,
  ]));
  return { complete: false, connection: incoming?.connection ?? previous.connection, targets: [...targets.values()], people: [...people.values()] };
}

const MAX_CACHED_PAGES = 12;
const MAX_PRELOADS = 2;
const NAVIGATION_SETTLE_MS = 75;

export function scheduleItemKey({ connection, project, type, item }: ScheduleIdentity) {
  return JSON.stringify([connection, project, type, item]);
}

function completedStatus(detail: ItemDetail): string | null | undefined {
  const finished = detail.data.work_item_fields.find((field) => field.key === "finish_status")?.value;
  if (finished === false || finished === "false") return null;
  if (finished !== true && finished !== "true") return undefined;
  const status = detail.data.work_item_attribute.work_item_status;
  const name = status && typeof status === "object" && "name" in status ? status.name : status;
  return (typeof name === "string" && name.trim()) || "已完成";
}

export function useScheduleHistoryStatuses(context: string, itemKeys: Set<string>, revision: unknown) {
  const request = JSON.stringify([...itemKeys].sort());
  const [statuses, setStatuses] = useState<{ context: string; values: Map<string, string | null> }>();
  useEffect(() => {
    const keys: string[] = JSON.parse(request);
    if (!keys.length) return;
    let active = true;
    const publish = (key: string, detail: ItemDetail | null) => {
      if (!active || !detail) return;
      const value = completedStatus(detail);
      if (value === undefined) return;
      setStatuses((previous) => {
        const values = previous?.context === context ? previous.values : new Map<string, string | null>();
        if (values.get(key) === value) return previous;
        return { context, values: new Map(values).set(key, value) };
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
        try { publish(key, await refreshItemDetail(id)); } catch { /* 保留已有状态。 */ }
      }
    };
    const timer = window.setTimeout(() => {
      // 只补读当前日历的事项，限制并发，不阻塞排期加载与编辑。
      void readItems();
      void readItems();
    }, NAVIGATION_SETTLE_MS);
    return () => { active = false; window.clearTimeout(timer); };
  }, [context, request, revision]);
  return statuses?.context === context ? statuses.values : undefined;
}

export function useScheduleCalendar(visibleKey: string, preloadKeys: string[]) {
  const [pages, setPages] = useState(() => new Map<string, HistoryPage>());
  const pending = useRef(new Set<string>());
  const preloading = useRef(new Set<string>());
  const protectedKeys = useRef([visibleKey, ...preloadKeys]);
  useLayoutEffect(() => { protectedKeys.current = [visibleKey, ...preloadKeys]; }, [visibleKey, preloadKeys]);
  const [settledKey, setSettledKey] = useState(visibleKey);
  const navigationSettled = settledKey === visibleKey;
  useEffect(() => {
    if (navigationSettled) return;
    const timeout = window.setTimeout(() => setSettledKey(visibleKey), NAVIGATION_SETTLE_MS);
    return () => window.clearTimeout(timeout);
  }, [visibleKey, navigationSettled]);

  const updatePage = useCallback((key: string, update: (prior?: HistoryPage) => HistoryPage) => {
    setPages((current) => {
      const next = new Map(current);
      next.delete(key);
      next.set(key, update(current.get(key)));
      for (const [candidate, page] of next) {
        if (next.size <= MAX_CACHED_PAGES) break;
        if (candidate !== key && !page.loading && !protectedKeys.current.includes(candidate)) next.delete(candidate);
      }
      return next;
    });
  }, []);

  const load = useCallback((key: string, preloaded = false) => {
    if (!key || pending.current.has(key)) return;
    pending.current.add(key);
    if (preloaded) preloading.current.add(key);
    updatePage(key, (prior) => ({ data: prior?.data, loading: true, preloaded }));
    const finish = (data?: ScheduleHistory) => {
      pending.current.delete(key);
      preloading.current.delete(key);
      updatePage(key, (prior) => ({ data: preserveHistory(prior?.data, data), loading: false, preloaded }));
    };
    Promise.resolve().then(() => loadScheduleHistory(JSON.parse(key)[1])).then(finish, () => finish());
  }, [updatePage]);

  const [context, request]: [string?, ScheduleHistoryRequest?] = visibleKey ? JSON.parse(visibleKey) : [];
  const compatible = request?.connection ? Array.from(pages).reverse().find(([key, page]) => {
    if (key === visibleKey || page.data?.connection !== request.connection) return false;
    const [priorContext, prior]: [string, ScheduleHistoryRequest] = JSON.parse(key);
    return priorContext === context && !prior.connection && prior.range.start === request.range.start && prior.range.end === request.range.end;
  }) : undefined;
  const exactBootstrap = compatible && request?.scopes.length && compatible[1].data?.complete &&
    JSON.stringify(JSON.parse(compatible[0])[1].scopes) === JSON.stringify(request.scopes);
  const visible = pages.get(visibleKey) ?? (exactBootstrap ? compatible?.[1] : undefined);
  const needsVisibleRead = Boolean(visibleKey && (!visible || (visible.preloaded && !visible.loading && !visible.data?.complete)));
  useEffect(() => {
    if (navigationSettled && needsVisibleRead) load(visibleKey);
  }, [visibleKey, needsVisibleRead, navigationSettled, load]);

  useEffect(() => {
    if (!navigationSettled) return;
    for (const key of preloadKeys) {
      if (preloading.current.size >= MAX_PRELOADS) break;
      if (!pages.has(key)) load(key, true);
    }
  }, [preloadKeys, pages, navigationSettled, load]);

  return {
    data: visible?.data ?? compatible?.[1].data,
    loading: needsVisibleRead || Boolean(visible?.loading),
    failed: Boolean(visible && !visible.preloaded && !visible.loading && !visible.data?.complete),
    retry: () => load(visibleKey),
  };
}
