import { invoke } from "@tauri-apps/api/core";
import type { ScheduleDates, ScheduleIdentity, ScheduleResult } from "./scheduleSession";

/** 排期专用 IPC 契约；不使用工作流提交或共享缓存刷新。 */
export interface SchedulePerson { id: string; name: string; avatar?: string | null; position?: string | null; connection?: string; project?: string }
export interface ScheduleSource { id: string; name: string; complete: boolean; error?: string | null }
export interface ScheduleRecord {
  id: string; identity: ScheduleIdentity; title: string; nodeName: string;
  ownerId?: string | null; sourceIds: string[]; projectName: string; typeName: string;
  dates: ScheduleDates; mine: boolean; readOnlyReason?: string | null; itemUrl?: string | null;
  ownerIds: string[];
  sourceAggregate?: boolean;
  cacheKind?: string; startState?: string; endState?: string; fetchedAt?: string | null;
  unknownOwner?: boolean;
}
export interface ScheduleRead {
  sessionId: string;
  sources: ScheduleSource[]; people: SchedulePerson[]; targets: ScheduleRecord[];
  currentUserId?: string | null; accountError?: string | null; readAt: string; complete: boolean; readRequests?: number;
  itemErrors?: Array<{ project: string; type: string; item: string; sources: string[]; message: string }>;
}
export interface ScheduleWriteTarget { id: string; identity: ScheduleIdentity; dates: ScheduleDates; cancel: boolean }
export interface ScheduleWriteResult {
  results: Array<{ id: string; result: ScheduleResult; message?: string | null }>;
  writeRequests: number;
}

interface WireTarget { id: string; identity: ScheduleIdentity; title: string; node_name: string; owners: SchedulePerson[]; unknown_owner: boolean; item_url?: string | null; sources: string[]; baseline: ScheduleDates; read_only_reason?: string | null; source_aggregate: boolean; cache_kind?: string; start_state?: string; end_state?: string; fetched_at_ms?: number | null }
interface WireRead { session_id: string; current_user: string; current_user_name: string; account_error?: string | null; read_at_ms: number; sources: ScheduleSource[]; targets: WireTarget[]; failed_items: number; item_errors?: ScheduleRead["itemErrors"]; read_requests?: number }
interface WireResult { targets: ScheduleWriteResult["results"]; write_requests: number }
let lifecycle: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = lifecycle.then(operation, operation);
  lifecycle = result.catch(() => {});
  return result;
}
export const loadScheduleSession = () => enqueue(async (): Promise<ScheduleRead> => {
  const result = await invoke<WireRead>("load_schedule_session");
  const people = new Map<string, SchedulePerson>();
  for (const target of result.targets) for (const owner of target.owners || []) {
    const { connection, project } = target.identity;
    const key = JSON.stringify([connection, project, owner.id]);
    const previous = people.get(key);
    const isFallback = (name: string) => !name.trim() || name === owner.id || name === Array.from(owner.id).slice(-6).join("");
    people.set(key, { ...previous, ...owner, connection, project, name: previous && !isFallback(previous.name) && isFallback(owner.name) ? previous.name : owner.name || previous?.name || owner.id,
      avatar: owner.avatar || previous?.avatar, position: owner.position || previous?.position });
  }
  if (result.current_user) people.set(JSON.stringify([null, null, result.current_user]), { id: result.current_user, name: result.current_user_name || result.current_user });
  return {
    sessionId: result.session_id, currentUserId: result.current_user, accountError: result.account_error,
    readAt: new Date(result.read_at_ms).toLocaleString(), sources: result.sources, readRequests: result.read_requests, itemErrors: result.item_errors,
    complete: result.sources.length > 0 && result.failed_items === 0 && result.sources.every((item) => item.complete), people: [...people.values()],
    targets: result.targets.map((target) => ({
      id: target.id, identity: target.identity, title: target.title, nodeName: target.node_name,
      ownerId: target.identity.owner || (target.owners.length === 1 ? target.owners[0].id : null),
      ownerIds: target.owners.map((owner) => owner.id), unknownOwner: target.unknown_owner, sourceIds: target.sources,
      projectName: target.identity.project, typeName: target.identity.type, dates: target.baseline,
      mine: !!result.current_user && (target.identity.owner === result.current_user || target.owners.some((owner) => owner.id === result.current_user)),
      sourceAggregate: target.source_aggregate, readOnlyReason: target.source_aggregate ? target.read_only_reason || "来源聚合日期缺少准确节点和负责人信息，仅供查看" : target.read_only_reason, itemUrl: target.item_url,
      cacheKind: target.cache_kind, startState: target.start_state, endState: target.end_state, fetchedAt: target.fetched_at_ms ? new Date(target.fetched_at_ms).toLocaleString() : null,
    })),
  };
});
export const closeScheduleSession = (request: Promise<ScheduleRead>) => enqueue(async () => {
  const read = await request.catch(() => null);
  if (read) await invoke<void>("close_schedule_session", { sessionId: read.sessionId });
});
export const submitScheduleTargets = async (sessionId: string, targets: ScheduleWriteTarget[]): Promise<ScheduleWriteResult> => {
  const result = await invoke<WireResult>("sync_schedule_session", { sessionId, changes: targets.map((target) => ({ id: target.id, start: target.dates.start, end: target.dates.end, cancel: target.cancel })) });
  return { results: result.targets, writeRequests: result.write_requests };
};
