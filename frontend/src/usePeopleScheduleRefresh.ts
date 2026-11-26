import { useEffect, useMemo, useRef, useState } from "react";
import { asError } from "./model";
import { readFailureNeedsAction } from "./readFeedback";
import { discoverSchedulePeopleItems, refreshSchedulePeopleItem, type ScheduleHistoryScope, type SchedulePeopleItem } from "./scheduleApi";
import { RECENT_SCHEDULE_INTERVAL, SCHEDULE_RETRY_DELAY, scheduleReadAvailable } from "./useScheduleRevalidation";

export type PeopleSchedulePatch = Awaited<ReturnType<typeof refreshSchedulePeopleItem>>;
export type ScheduleItemChanges = ReadonlyMap<string, number>;
export type PeopleScheduleRefreshCache = {
  scope?: string;
  patches?: Map<string, PeopleSchedulePatch>;
  teamCheck?: { scope: string; result: TeamCheck };
};
type ItemCheck = { at: number; sequence: number; complete: boolean; change?: number; failures?: number; closed?: boolean; blocked?: boolean };
type TeamCheck = { attemptedAt?: number; checkedAt?: number; complete?: boolean; confirmed?: number; total?: number };
type TeamRound = { after: number; manual: boolean; discovered?: boolean; items?: Map<string, SchedulePeopleItem> };
const CHECK_SPACING = 1_500;
const MAX_AUTOMATIC_ATTEMPTS = 2;

export function peopleScheduleItemKey(connection: string, id: SchedulePeopleItem["id"]) {
  return JSON.stringify([connection, id.project_key, id.work_item_type_key, id.work_item_id]);
}

export function scheduleChangedItemKey(id: SchedulePeopleItem["id"]) {
  return JSON.stringify([id.project_key, id.work_item_type_key, id.work_item_id]);
}

type Input = {
  scope: string;
  connection?: string;
  user?: string | null;
  active: boolean;
  checkedAt?: number;
  failedKeys: ReadonlySet<string>;
  scopes: ScheduleHistoryScope[];
  items: Map<string, SchedulePeopleItem>;
  selected?: SchedulePeopleItem;
  protectedKeys: ReadonlySet<string>;
  changes?: ScheduleItemChanges;
  cache?: PeopleScheduleRefreshCache;
};

export function usePeopleScheduleRefresh(input: Input) {
  const latest = useRef(input);
  latest.current = input;
  const queue = useMemo(() => ({
    discovered: new Map<string, SchedulePeopleItem>(),
    checked: new Map<string, ItemCheck>(),
    deferred: new Map<string, { patch: PeopleSchedulePatch; itemKey: string; change?: number }>(),
    createdAt: Date.now(),
    discoveryAt: undefined as number | undefined,
    discoveryFailures: 0,
    round: undefined as TeamRound | undefined,
    sequence: 0,
    teamCheck: input.cache?.teamCheck?.scope === input.scope ? input.cache.teamCheck.result : undefined,
    pending: new Map<string, Promise<boolean>>(),
    issues: new Map<string, string>(),
    invalidated: new Map<string, number>(),
    nextAt: 0,
  }), [input.scope, input.connection, input.user]);
  const [state, setState] = useState<{ queue: typeof queue; patches: Map<string, PeopleSchedulePatch> }>();
  const [accessIssues, setAccessIssues] = useState<{ queue: typeof queue; entries: Map<string, string> }>();
  const [teamCheck, setTeamCheck] = useState<{ queue: typeof queue; result: TeamCheck }>();
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const currentQueue = () => mounted.current && queue === queueRef.current;
  const cachedPatches = input.cache?.scope === input.scope ? input.cache?.patches : undefined;
  const patches = state?.queue === queue ? state.patches : cachedPatches;

  const updatePatches = (update: (entries: Map<string, PeopleSchedulePatch>) => boolean) => {
    const cache = latest.current.cache;
    if (cache) {
      const updated = new Map(cache.scope === input.scope ? cache.patches : []);
      if (!update(updated)) return;
      cache.scope = input.scope;
      cache.patches = updated;
      setState({ queue, patches: updated });
    } else setState((before) => {
      const updated = new Map(before?.queue === queue ? before.patches : []);
      return update(updated) ? { queue, patches: updated } : before;
    });
  };

  const publish = (key: string, patch: PeopleSchedulePatch, itemKey: string, change?: number) => {
    if (latest.current.protectedKeys.has(key)) {
      queue.deferred.set(key, { patch, itemKey, change });
      return;
    }
    queue.deferred.delete(key);
    updatePatches((entries) => {
      const previous = entries.get(key);
      if (!patch.complete && previous?.complete) return false;
      if (JSON.stringify(previous) === JSON.stringify(patch)) return false;
      entries.set(key, patch);
      return true;
    });
  };

  const setIssue = (key: string, kind?: string, confirmConnection = false) => {
    if (!currentQueue()) return;
    const scope = kind && ["auth", "credential", "config"].includes(kind) ? "" : key;
    let changed = false;
    if (!kind) {
      changed = confirmConnection && queue.issues.delete("");
      changed = queue.issues.delete(key) || changed;
    } else if (readFailureNeedsAction(kind) && queue.issues.get(scope) !== kind) {
      queue.issues.set(scope, kind);
      changed = true;
    }
    if (changed) setAccessIssues({ queue, entries: new Map(queue.issues) });
  };

  const reportTeamCheck = (result: Omit<TeamCheck, "attemptedAt" | "checkedAt">) => {
    if (!currentQueue()) return;
    const previous = queue.teamCheck;
    if (result.complete === undefined && previous && previous.complete === undefined &&
      previous.confirmed === result.confirmed && previous.total === result.total) return;
    const check = { ...result, attemptedAt: queue.discoveryAt ?? previous?.attemptedAt,
      checkedAt: result.complete ? Date.now() : previous?.checkedAt };
    queue.teamCheck = check;
    const cache = latest.current.cache;
    if (cache && result.complete !== undefined) cache.teamCheck = { scope: input.scope, result: check };
    setTeamCheck({ queue, result: check });
  };

  const discover = (manual = false) => {
    if (queue.round) {
      queue.round.manual ||= manual;
      return;
    }
    const { connection, user, scopes } = latest.current;
    if (!connection || !user || !scheduleReadAvailable()) {
      if (manual) reportTeamCheck({ complete: false });
      return;
    }
    const round: TeamRound = { after: queue.sequence, manual };
    queue.round = round;
    queue.discoveryAt = Date.now();
    reportTeamCheck({});
    const confirmConnection = queue.issues.has("");
    void discoverSchedulePeopleItems(connection, user, scopes).then(({ items, complete, error_kind }) => {
      if (!currentQueue()) return false;
      const next = new Map(items.map((item) => [peopleScheduleItemKey(connection, item.id), item]));
      if (complete) queue.discovered = next;
      else for (const [key, item] of next) queue.discovered.set(key, item);
      queue.discoveryFailures = complete ? 0 : queue.discoveryFailures + 1;
      if (complete) setIssue("discovery", undefined, confirmConnection);
      else if (error_kind) setIssue("discovery", error_kind);
      return complete;
    }).catch((failure) => {
      queue.discoveryFailures += 1;
      setIssue("discovery", asError(failure).kind);
      return false;
    }).then((complete) => {
      if (!currentQueue()) return;
      round.discovered = complete;
      round.items = new Map([...queue.discovered, ...latest.current.items]);
      for (const [key, item] of round.items) {
        const prior = queue.checked.get(key);
        if (prior?.closed && prior.complete && !queue.discovered.has(key) &&
          prior.change === latest.current.changes?.get(scheduleChangedItemKey(item.id))) round.items.delete(key);
      }
      if (!round.items.size || queue.issues.has("")) {
        queue.round = undefined;
        reportTeamCheck({ complete: complete && !queue.issues.has("") });
      }
    });
  };

  const read = (item: SchedulePeopleItem): Promise<boolean> => {
    const { connection, user, changes } = latest.current;
    if (!connection || !user || !currentQueue() || !scheduleReadAvailable()) return Promise.resolve(false);
    const key = peopleScheduleItemKey(connection, item.id);
    const pending = queue.pending.get(key);
    if (pending) return pending;
    const changedItemKey = scheduleChangedItemKey(item.id);
    const change = changes?.get(changedItemKey);
    const localRevision = queue.invalidated.get(key);
    const stillCurrent = () => currentQueue() && change === latest.current.changes?.get(changedItemKey) &&
      localRevision === queue.invalidated.get(key);
    const failures = (queue.checked.get(key)?.failures ?? 0) + 1;
    const confirmConnection = queue.issues.has("");
    const recordCheck = (result: Omit<ItemCheck, "at" | "sequence" | "change">) => {
      queue.checked.set(key, { ...result, at: Date.now(), sequence: ++queue.sequence, change });
    };
    const promise = refreshSchedulePeopleItem(connection, user, item).then((patch) => {
      if (!stillCurrent()) return false;
      recordCheck({ complete: patch.complete, failures: patch.complete ? 0 : failures, closed: patch.closed });
      setIssue(key, undefined, confirmConnection);
      publish(key, patch, changedItemKey, change);
      return patch.complete;
    }).catch((failure) => {
      if (!stillCurrent()) return false;
      const kind = asError(failure).kind;
      recordCheck({ complete: false, failures, blocked: readFailureNeedsAction(kind) });
      setIssue(key, kind);
      return false;
    }).finally(() => {
      queue.pending.delete(key);
    });
    queue.pending.set(key, promise);
    queue.nextAt = Date.now() + CHECK_SPACING;
    return promise;
  };

  const actions = useRef({ discover, read, publish, reportTeamCheck });
  actions.current = { discover, read, publish, reportTeamCheck };
  useEffect(() => {
    if (!input.active) return;
    const tick = () => {
      const { connection, protectedKeys, selected, items, changes, checkedAt, failedKeys } = latest.current;
      if (!connection) return;
      if (!scheduleReadAvailable()) {
        if (queue.round?.items && navigator.onLine === false) {
          queue.round = undefined;
          actions.current.reportTeamCheck({ complete: false });
        }
        return;
      }
      for (const [key, { patch, itemKey, change }] of queue.deferred) {
        if (change !== changes?.get(itemKey)) queue.deferred.delete(key);
        else if (!protectedKeys.has(key)) actions.current.publish(key, patch, itemKey, change);
      }
      const now = Date.now();
      const lastDiscoveryAt = queue.discoveryAt ?? queue.teamCheck?.attemptedAt ?? checkedAt ?? queue.createdAt;
      const lastCheckAt = Math.max(lastDiscoveryAt, queue.teamCheck?.checkedAt ?? 0);
      // 一次快速重试后回到定期检查，后台暂态失败不会停掉五分钟刷新。
      const discoveryDelay = queue.discoveryFailures === 1 ? SCHEDULE_RETRY_DELAY : RECENT_SCHEDULE_INTERVAL;
      if (!queue.round && !queue.issues.has("") && !queue.issues.has("discovery") &&
        now - lastCheckAt >= discoveryDelay) actions.current.discover();
      const round = queue.round;
      const remaining = new Map<string, SchedulePeopleItem>();
      if (round?.items) {
        let confirmed = 0;
        for (const [key, item] of round.items) {
          const prior = queue.checked.get(key);
          const change = changes?.get(scheduleChangedItemKey(item.id));
          const attempted = prior && prior.sequence > round.after && prior.change === change;
          if (attempted && prior.complete && !queue.deferred.has(key)) confirmed++;
          if (attempted || protectedKeys.has(key) || queue.issues.has("")) continue;
          if (!round.manual && prior?.blocked && prior.change === change) continue;
          remaining.set(key, item);
        }
        const total = round.items.size;
        if (!remaining.size) {
          queue.round = undefined;
          actions.current.reportTeamCheck({ complete: round.discovered === true && confirmed === total, confirmed, total });
        } else {
          actions.current.reportTeamCheck({ confirmed, total });
        }
      }
      if (queue.issues.has("")) return;
      if (queue.pending.size >= 2 || now < queue.nextAt) return;
      const selectedKey = selected && peopleScheduleItemKey(connection, selected.id);
      const candidates = new Map([...queue.discovered, ...items, ...remaining]);
      if (selected && selectedKey) candidates.set(selectedKey, selected);
      let next: SchedulePeopleItem | undefined;
      let bestPriority = -1;
      let oldest = Infinity;
      for (const [key, item] of candidates) {
        if (protectedKeys.has(key) || queue.pending.has(key)) continue;
        const prior = queue.checked.get(key);
        const change = changes?.get(scheduleChangedItemKey(item.id));
        const changed = change !== undefined && change !== prior?.change;
        const dueForRound = remaining.has(key);
        if (!dueForRound && prior?.blocked && !changed) continue;
        if (!dueForRound && !changed && (prior?.failures ?? 0) >= MAX_AUTOMATIC_ATTEMPTS) continue;
        if (!dueForRound && !changed && prior?.closed && !prior.failures && key !== selectedKey &&
          (!queue.discovered.has(key) || lastDiscoveryAt <= prior.at)) continue;
        const at = prior?.at ?? (items.has(key) && key !== selectedKey && !failedKeys.has(key) && !queue.invalidated.has(key) ? checkedAt ?? 0 : 0);
        if (!dueForRound && !changed && at > 0 && now - at < (prior?.failures === 1 ? SCHEDULE_RETRY_DELAY : RECENT_SCHEDULE_INTERVAL)) continue;
        const priority = changed ? 3 : dueForRound ? 2 : key === selectedKey ? 1 : 0;
        if (priority > bestPriority || (priority === bestPriority && at < oldest)) {
          next = item;
          bestPriority = priority;
          oldest = at;
        }
      }
      if (next) void actions.current.read(next);
    };
    tick();
    const timer = window.setInterval(tick, CHECK_SPACING);
    window.addEventListener("focus", tick);
    window.addEventListener("online", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      window.removeEventListener("online", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [queue, input.active]);

  const issues = accessIssues?.queue === queue ? accessIssues.entries : undefined;
  return {
    patches,
    issue: issues?.get("") || issues?.get("discovery"),
    teamCheck: teamCheck?.queue === queue ? teamCheck.result : queue.teamCheck,
    refresh: () => discover(true),
    invalidate: (keys: string[]) => {
      if (!keys.length || !currentQueue()) return;
      for (const key of keys) {
        queue.invalidated.set(key, (queue.invalidated.get(key) ?? 0) + 1);
        queue.checked.delete(key);
        queue.deferred.delete(key);
      }
      updatePatches((entries) => {
        let changed = false;
        for (const key of keys) changed = entries.delete(key) || changed;
        return changed;
      });
    },
  };
}
