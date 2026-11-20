import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadScheduleHistory, type ScheduleHistory, type ScheduleHistoryRequest, type ScheduleRead } from "./scheduleApi";
import type { ScheduleDates } from "./scheduleSession";
import type { Snapshot } from "./types";

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

export function useScheduleCalendar(visibleKey: string, previousKey: string) {
  const [pages, setPages] = useState(() => new Map<string, HistoryPage>());
  const pending = useRef(new Set<string>());
  const protectedKeys = useRef([visibleKey, previousKey]);
  useLayoutEffect(() => { protectedKeys.current = [visibleKey, previousKey]; }, [visibleKey, previousKey]);

  const updatePage = useCallback((key: string, update: (prior?: HistoryPage) => HistoryPage) => {
    setPages((current) => {
      const next = new Map(current);
      next.delete(key);
      next.set(key, update(current.get(key)));
      for (const [candidate, page] of next) {
        if (next.size <= 6) break;
        if (candidate !== key && !page.loading && !protectedKeys.current.includes(candidate)) next.delete(candidate);
      }
      return next;
    });
  }, []);

  const load = useCallback((key: string, preloaded: boolean) => {
    if (!key || pending.current.has(key)) return;
    pending.current.add(key);
    updatePage(key, (prior) => ({ data: prior?.data, loading: true, preloaded }));
    const finish = (data?: ScheduleHistory) => {
      pending.current.delete(key);
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
  const previous = pages.get(previousKey);
  const needsVisibleRead = Boolean(visibleKey && (!visible || (visible.preloaded && !visible.loading && !visible.data?.complete)));
  useEffect(() => {
    if (needsVisibleRead) load(visibleKey, false);
  }, [visibleKey, needsVisibleRead, load]);

  const canPreload = Boolean(previousKey && !previous && (!visibleKey || (visible?.data?.complete && !visible.loading)));
  useEffect(() => {
    if (!canPreload) return;
    const timer = window.setTimeout(() => load(previousKey, true), 250);
    return () => window.clearTimeout(timer);
  }, [previousKey, canPreload, load]);

  return {
    data: visible?.data ?? compatible?.[1].data,
    loading: needsVisibleRead || Boolean(visible?.loading),
    failed: Boolean(visible && !visible.preloaded && !visible.loading && !visible.data?.complete),
    retry: () => load(visibleKey, false),
  };
}
