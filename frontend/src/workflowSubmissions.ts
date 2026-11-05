import { useSyncExternalStore } from "react";

// 生命周期覆盖详情关闭、事项切换和布局切换；组件卸载不代表写入已经结束。
let active: ReadonlyMap<string, string> = new Map();
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => active;

export const workflowSubmissions = {
  has: (key: string) => active.has(key),
  begin(key: string, requestId: string) {
    if (active.has(key)) return false;
    active = new Map(active).set(key, requestId);
    publish();
    return true;
  },
  finish(key: string, requestId: string) {
    if (active.get(key) !== requestId) return;
    const next = new Map(active);
    next.delete(key);
    active = next;
    publish();
  },
};

export const useWorkflowSubmissions = () => useSyncExternalStore(subscribe, snapshot);
