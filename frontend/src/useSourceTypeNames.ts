import { useCallback, useEffect, useRef, useState } from "react";
import { refreshSourceTypes } from "./api";
import { asError } from "./model";
import { readFailureMessage, readFailureNeedsAction } from "./readFeedback";
import type { Snapshot, Source, SourceTypeScope } from "./types";

export const typeNameConnection = (data: Snapshot) =>
  JSON.stringify([data.db_path, data.settings, data.credential_ready, data.credential_description]);
export const typeNameSource = (source: Source) => JSON.stringify([
  source.id, source.kind, source.enabled, source.executable, source.project_key,
  source.work_item_type_key, source.view_id, source.asset_key, source.association_rule,
]);

// 自动发现只补充目录；用户刚修改的同步范围继续以当前界面为准。
export function applySourceTypeNames(data: Snapshot, sourceId: string, fresh: SourceTypeScope): Snapshot {
  return { ...data, sources: data.sources.map((source) => {
    if (source.id !== sourceId) return source;
    const previous = source.type_scope;
    if (!previous) return { ...source, type_scope: fresh };
    const selected = new Map(previous.types.map((type) => [type.type_key, type.selected]));
    const identity = (type: SourceTypeScope["types"][number]) => JSON.stringify([type.project_key, type.type_key]);
    const incoming = new Set(fresh.types.map(identity));
    const types = [...fresh.types, ...previous.types.filter((type) => !incoming.has(identity(type)))]
      .map((type) => ({ ...type, selected: previous.configured ? selected.get(type.type_key) ?? type.selected : true }));
    return { ...source, type_scope: { ...previous, types, selected_count: types.filter((type) => type.selected).length } };
  }) };
}

type Discovery = Awaited<ReturnType<typeof refreshSourceTypes>>;
type Task = { key: string; started: boolean; promise: Promise<Discovery | undefined> };

export function useSourceTypeNames(
  data: Snapshot | null,
  ready: boolean,
  credentialRevision: number,
  onTypes: (sourceId: string, types: SourceTypeScope, context: Snapshot) => void,
) {
  const live = useRef({ data, credentialRevision, onTypes });
  live.current = { data, credentialRevision, onTypes };
  const active = useRef(true);
  const pending = useRef(new Map<string, Task>());
  const latest = useRef(new Map<string, number>());
  const attempted = useRef(new Map<string, string>());
  const sequence = useRef(0);
  const [failures, setFailures] = useState<Record<string, { key: string; kind: string }>>({});
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const refresh = useCallback((sourceId: string, afterSync = false): Promise<Discovery | undefined> => {
    const context = live.current.data;
    const source = context?.sources.find((entry) => entry.id === sourceId);
    if (!context || !source?.enabled || !source.executable) return Promise.resolve(undefined);
    const revision = live.current.credentialRevision;
    const key = JSON.stringify([typeNameConnection(context), typeNameSource(source), revision]);
    const previous = pending.current.get(sourceId);
    // 手动发现可复用在途请求；同步结束后需要再读一次，以包含本轮新出现的空间和类型。
    if (previous?.key === key && (!afterSync || !previous.started)) return previous.promise;
    const request = ++sequence.current;
    latest.current.set(sourceId, request);
    const matches = () => {
      const current = live.current.data;
      const currentSource = current?.sources.find((entry) => entry.id === sourceId);
      return active.current && current && currentSource && revision === live.current.credentialRevision &&
        typeNameConnection(current) === typeNameConnection(context) && typeNameSource(currentSource) === typeNameSource(source);
    };
    let task: Task;
    const receiveFailure = (kind?: string) => {
      if (!matches() || latest.current.get(sourceId) !== request) return;
      setFailures((current) => {
        const next = { ...current };
        if (kind && readFailureNeedsAction(kind)) next[sourceId] = { key, kind };
        else delete next[sourceId];
        return next;
      });
    };
    const promise = Promise.resolve(previous?.promise).catch(() => undefined).then(async () => {
      if (!matches()) return undefined;
      task.started = true;
      const result = await refreshSourceTypes(sourceId);
      receiveFailure(result?.failure_kinds?.find(readFailureNeedsAction));
      if (result?.type_scope && matches() && latest.current.get(sourceId) === request)
        live.current.onTypes(sourceId, result.type_scope, context);
      return result;
    }).catch((error) => {
      receiveFailure(asError(error).kind);
      throw error;
    }).finally(() => {
      if (pending.current.get(sourceId) === task) pending.current.delete(sourceId);
    });
    task = { key, started: false, promise };
    pending.current.set(sourceId, task);
    return promise;
  }, []);

  const sources = data?.sources.filter((source) => source.enabled && source.executable && source.type_scope && (
    source.project_key || source.type_scope.types.length || data.items.some((item) => item.id.project_key &&
      (!item.source_ids || item.source_ids.includes(source.id)))
  )) || [];
  const scope = data ? JSON.stringify([typeNameConnection(data), credentialRevision, sources.map(typeNameSource)]) : "";
  useEffect(() => {
    if (!ready || !live.current.data?.credential_ready) return;
    const ids = new Set(sources.map((source) => source.id));
    for (const id of attempted.current.keys()) if (!ids.has(id)) attempted.current.delete(id);
    for (const source of sources) {
      const key = JSON.stringify([typeNameConnection(live.current.data), credentialRevision, typeNameSource(source)]);
      if (attempted.current.get(source.id) === key) continue;
      attempted.current.set(source.id, key);
      // 暂态失败保留缓存；由下一轮成功同步再尝试，不覆盖清单或流程操作的反馈。
      void refresh(source.id).catch(() => {});
    }
  }, [ready, scope, refresh]);

  const afterSync = useCallback((sourceIds: string[]) => {
    const current = live.current.data;
    if (!current?.credential_ready) return;
    void Promise.allSettled(sourceIds.filter((id) => current.sources.some((source) => source.id === id && source.type_scope))
      .map((id) => refresh(id, true)));
  }, [refresh]);
  const visibleFailures: Record<string, string> = {};
  if (data) for (const source of data.sources) {
    const failure = failures[source.id];
    const key = JSON.stringify([typeNameConnection(data), typeNameSource(source), credentialRevision]);
    if (failure?.key === key) visibleFailures[source.id] = `类型名称未刷新：${readFailureMessage(failure.kind)}。`;
  }
  return { refresh, afterSync, failures: visibleFailures };
}
