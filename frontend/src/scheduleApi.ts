import { Channel, invoke } from "@tauri-apps/api/core";
import { ScheduleProgressFeed, type ScheduleRequest } from "./scheduleProgress";
import type { ScheduleDates, ScheduleIdentity, ScheduleResult } from "./scheduleSession";
import type { CachedItem, RelatedProject } from "./types";

/** 排期专用 IPC 契约；不使用工作流提交或共享缓存刷新。 */
export interface SchedulePerson { id: string; name: string; avatar?: string | null; position?: string | null; connection?: string; project?: string }
export interface ScheduleSource { id: string; name: string; complete: boolean; error?: string | null }
export interface ScheduleRecord {
  id: string; identity: ScheduleIdentity; title: string; nodeName: string;
  nodeStatus?: string; nodeOrder?: number; scheduleRequired?: boolean; itemClosed?: boolean;
  nodeStartedAtMs?: number | null;
  ownerId?: string | null; sourceIds: string[]; projectName: string; typeName: string;
  relatedProjects?: RelatedProject[];
  dates: ScheduleDates; mine: boolean; readOnlyReason?: string | null; itemUrl?: string | null;
  ownerIds: string[];
  sourceAggregate?: boolean;
  peopleOnly?: boolean;
  cacheKind?: string; startState?: string; endState?: string; fetchedAt?: string | null;
  unknownOwner?: boolean;
  result?: ScheduleResult; resultMessage?: string | null; resultWarning?: string | null;
}
export interface ScheduleRead {
  sessionId: string;
  connection?: string;
  recentRange?: ScheduleDates | null;
  historyScopes?: ScheduleHistoryScope[];
  defectProjects?: string[];
  spaceNames?: Record<string, string>;
  sources: ScheduleSource[]; people: SchedulePerson[]; targets: ScheduleRecord[];
  currentUserId?: string | null; currentUserAvatar?: string | null; peopleLoaded?: boolean;
  accountError?: string | null; readAt: string; readAtMs?: number; complete: boolean; readRequests?: number;
  itemErrors?: Array<{ project: string; type: string; item: string; title?: string; sources: string[]; message: string }>;
}
export interface ScheduleHistoryScope { project: string; work_item_type: string; users: string[] }
export interface ScheduleHistoryRequest { connection?: string; range: ScheduleDates; scopes: ScheduleHistoryScope[]; currentUser?: string; cachePeople?: boolean }
export interface ScheduleHistory { people: SchedulePerson[]; targets: ScheduleRecord[]; complete: boolean; connection?: string }
export interface SchedulePeopleItem { id: CachedItem["id"]; sources: string[] }
export interface ScheduleWriteTarget { id: string; identity: ScheduleIdentity; dates: ScheduleDates; cancel: boolean }
export interface ScheduleWriteResult {
  results: Array<{ id: string; result: ScheduleResult; message?: string | null; warning?: string | null }>;
  writeRequests: number;
}

interface WireTarget { id: string; identity: ScheduleIdentity; title: string; node_name: string; node_status?: string; item_closed?: boolean; node_started_at_ms?: number | null; node_order?: number; schedule_required?: boolean; owners: SchedulePerson[]; unknown_owner: boolean; item_url?: string | null; related_projects?: RelatedProject[]; sources: string[]; baseline: ScheduleDates; read_only_reason?: string | null; source_aggregate: boolean; people_only?: boolean; cache_kind?: string; start_state?: string; end_state?: string; fetched_at_ms?: number | null }
interface WireRead { session_id: string; connection?: string; recent_range?: ScheduleDates | null; history_scopes?: ScheduleHistoryScope[]; defect_projects?: string[]; space_names?: Record<string, string>; current_user: string; current_user_name: string; current_user_avatar?: string | null; people_loaded?: boolean; people?: SchedulePerson[]; account_error?: string | null; read_at_ms: number; sources: ScheduleSource[]; targets: WireTarget[]; failed_items: number; item_errors?: ScheduleRead["itemErrors"]; read_requests?: number }
interface WireResult { targets: ScheduleWriteResult["results"]; write_requests: number }
let lifecycle: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = lifecycle.then(operation, operation);
  lifecycle = result.catch(() => {});
  return result;
}
function isFallbackPersonName(name: string | undefined | null, id: string): boolean {
  if (!name || !name.trim()) return true;
  const trimmed = name.trim();
  return (
    trimmed === id ||
    /^\d{6,}$/.test(trimmed) ||
    (id.length >= 6 && trimmed === Array.from(id).slice(-6).join(""))
  );
}
function mapScheduleRecords(result: Pick<WireRead, "targets" | "current_user" | "current_user_name" | "current_user_avatar" | "people">) {
  const people = new Map<string, SchedulePerson>();
  const currentHasRealName =
    Boolean(result.current_user) &&
    !isFallbackPersonName(result.current_user_name, result.current_user);
  const owners = [...result.people || [], ...result.targets.flatMap((target) =>
    (target.owners || []).map((owner) => ({ ...owner, connection: target.identity.connection, project: target.identity.project })),
  )];
  for (const owner of owners) {
    const { connection, project } = owner;
    const key = JSON.stringify([connection, project, owner.id]);
    const previous = people.get(key);
    const candidateName =
      owner.id === result.current_user && isFallbackPersonName(owner.name, owner.id) && currentHasRealName
        ? result.current_user_name
        : owner.name;
    const resolvedName =
      previous && !isFallbackPersonName(previous.name, owner.id) && isFallbackPersonName(candidateName, owner.id)
        ? previous.name
        : candidateName || previous?.name || owner.id;
    const resolvedAvatar =
      owner.avatar ||
      previous?.avatar ||
      (owner.id === result.current_user ? result.current_user_avatar : undefined);
    people.set(key, {
      ...previous,
      ...owner,
      connection,
      project,
      name: resolvedName,
      avatar: resolvedAvatar,
      position: owner.position || previous?.position,
    });
  }
  if (result.current_user) {
    const scopedRealName = Array.from(people.values()).find(
      (person) => person.id === result.current_user && !isFallbackPersonName(person.name, result.current_user),
    )?.name;
    const globalName = currentHasRealName
      ? result.current_user_name
      : scopedRealName || "当前用户";
    people.set(JSON.stringify([null, null, result.current_user]), {
      id: result.current_user,
      name: globalName,
      ...(result.current_user_avatar ? { avatar: result.current_user_avatar } : {}),
    });
  }
  return {
    people: [...people.values()],
    targets: result.targets.map((target): ScheduleRecord => ({
      id: target.id, identity: target.identity, title: target.title, nodeName: target.node_name,
      nodeStatus: target.node_status ?? "", nodeOrder: target.node_order ?? 0, scheduleRequired: target.schedule_required !== false,
      itemClosed: target.item_closed,
      nodeStartedAtMs: target.node_started_at_ms,
      ownerId: target.identity.owner || (target.owners.length === 1 ? target.owners[0].id : null),
      ownerIds: target.owners.map((owner) => owner.id), unknownOwner: target.unknown_owner, sourceIds: target.sources,
      projectName: target.identity.project, typeName: target.identity.type, dates: target.baseline,
      relatedProjects: target.related_projects,
      mine: !!result.current_user && (target.identity.owner === result.current_user || target.owners.some((owner) => owner.id === result.current_user)),
      sourceAggregate: target.source_aggregate, readOnlyReason: target.source_aggregate ? target.read_only_reason || "来源聚合日期缺少准确节点和负责人信息，仅供查看" : target.read_only_reason, itemUrl: target.item_url,
      peopleOnly: target.people_only ?? false,
      cacheKind: target.cache_kind, startState: target.start_state, endState: target.end_state, fetchedAt: target.fetched_at_ms ? new Date(target.fetched_at_ms).toLocaleString() : null,
    })),
  };
}
function mapWireRead(result: WireRead): ScheduleRead {
  return {
    sessionId: result.session_id,
    connection: result.connection,
    recentRange: result.recent_range,
    historyScopes: result.history_scopes,
    defectProjects: result.defect_projects,
    spaceNames: result.space_names,
    currentUserId: result.current_user,
    currentUserAvatar: result.current_user_avatar,
    peopleLoaded: result.people_loaded ?? true,
    accountError: result.account_error,
    readAt: new Date(result.read_at_ms).toLocaleString(),
    readAtMs: result.read_at_ms,
    sources: result.sources,
    readRequests: result.read_requests,
    itemErrors: result.item_errors,
    complete: result.sources.length > 0 && result.failed_items === 0 && result.sources.every((item) => item.complete),
    ...mapScheduleRecords(result),
  };
}

interface WireHistory { targets: WireTarget[]; complete: boolean; connection: string; current_user: string }

function mapHistory(result: WireHistory): ScheduleHistory {
  return { complete: result.complete, connection: result.connection, ...mapScheduleRecords({ targets: result.targets, current_user: result.current_user, current_user_name: "" }) };
}

export function loadScheduleHistory(request: ScheduleHistoryRequest) {
  return streamRead("load_schedule_calendar", { ...request }, mapHistory);
}

export async function readCachedScheduleHistory({ cachePeople: _cachePeople, ...request }: ScheduleHistoryRequest): Promise<ScheduleHistory | undefined> {
  const result = await invoke<WireHistory | null>("read_cached_schedule_calendar", request);
  return result ? mapHistory(result) : undefined;
}

export async function readCachedSchedulePeople(): Promise<ScheduleRead | null> {
  const result = await invoke<WireRead | null>("read_cached_schedule_people");
  return result ? mapWireRead(result) : null;
}

export function discoverSchedulePeopleItems(connection: string, currentUser: string, scopes: ScheduleHistoryScope[]) {
  return invoke<{ items: SchedulePeopleItem[]; complete: boolean; error_kind?: string }>("discover_schedule_people_items", { connection, currentUser, scopes });
}

export async function refreshSchedulePeopleItem(connection: string, currentUser: string, item: SchedulePeopleItem) {
  const result = await invoke<Pick<WireRead, "targets" | "current_user"> & { closed: boolean; complete: boolean }>(
    "refresh_schedule_people_item", { connection, currentUser, item });
  const { targets, people } = mapScheduleRecords({ ...result, current_user_name: "" });
  return { targets, people: people.filter((person) => person.project), closed: result.closed, complete: result.complete };
}
// 候选读取不占编辑会话的串行队列；当前会话的提交无需等待后台网络读取。
function streamRead<Wire, T>(command: string, args: Record<string, unknown> | undefined, map: (wire: Wire) => T, ready?: Promise<void>): Promise<T> & { progress?: ScheduleProgressFeed } {
  const progress = new ScheduleProgressFeed();
  const run = async () => {
    if (ready) await ready;
    const native = (globalThis as { __TAURI_INTERNALS__?: { transformCallback?: unknown } }).__TAURI_INTERNALS__;
    if (typeof native?.transformCallback === "function") {
      const channel = new Channel<{ connection: string; current_user: string; targets: WireTarget[] }>();
      channel.onmessage = (batch) => progress.append({ connection: batch.connection, currentUserId: batch.current_user,
        ...mapScheduleRecords({ ...batch, current_user_name: "" }) });
      args = { ...args, onProgress: channel };
    }
    return map(await (args ? invoke<Wire>(command, args) : invoke<Wire>(command)));
  };
  return Object.assign(run().finally(() => progress.finish()), { progress });
}
export const loadScheduleSession = (options?: { includePeople?: boolean; resumePartial?: boolean }, ready?: Promise<void>): ScheduleRequest => {
  return streamRead("load_schedule_session", options, mapWireRead, ready);
};
const peopleRequests = new Map<string, ScheduleRequest>();
export const loadSchedulePeople = (sessionId: string): ScheduleRequest => {
  const pending = peopleRequests.get(sessionId);
  if (pending) return pending;
  const request = streamRead("load_schedule_people", { sessionId }, mapWireRead);
  void request.then(() => peopleRequests.delete(sessionId), () => peopleRequests.delete(sessionId));
  peopleRequests.set(sessionId, request);
  return request;
};
export const closeScheduleSession = async (request: Promise<ScheduleRead>) => {
  // 会话可能尚在等待关闭前序会话；不能占住 IPC 队列后再等它，
  // 否则它后续的 load 会排到本次 close 后面，形成循环等待。
  const read = await request.catch(() => null);
  if (read) await enqueue(() => invoke<void>("close_schedule_session", { sessionId: read.sessionId }));
};
export const resetScheduleSession = (options?: { force?: boolean }) => enqueue(async () => {
  await invoke<void>(
    "reset_schedule_session",
    options?.force === undefined ? undefined : { force: options.force },
  );
});
export const submitScheduleTargets = (sessionId: string, targets: ScheduleWriteTarget[]): Promise<ScheduleWriteResult> => enqueue(async () => {
  const result = await invoke<WireResult>("sync_schedule_session", { sessionId, changes: targets.map((target) => ({ id: target.id, start: target.dates.start, end: target.dates.end, cancel: target.cancel })) });
  return { results: result.targets, writeRequests: result.write_requests };
});
