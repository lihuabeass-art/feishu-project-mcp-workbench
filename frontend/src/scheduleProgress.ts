import { useSyncExternalStore } from "react";
import type { SchedulePerson, ScheduleRead, ScheduleRecord } from "./scheduleApi";

export interface SchedulePreview {
  connection: string;
  currentUserId: string;
  targets: ScheduleRecord[];
  people: SchedulePerson[];
}

// 一次 IPC 读取独占一份进度。晚到的旧请求只能更新自己的预览。
export class ScheduleProgressFeed {
  private targets = new Map<string, ScheduleRecord>();
  private people = new Map<string, SchedulePerson>();
  private listeners = new Set<() => void>();
  private snapshot?: SchedulePreview;
  private timer?: ReturnType<typeof setTimeout>;
  private ended = false;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.snapshot;
  append(batch: SchedulePreview) {
    if (this.ended || !batch.currentUserId || !batch.connection) return;
    if (this.snapshot && (this.snapshot.connection !== batch.connection || this.snapshot.currentUserId !== batch.currentUserId)) return;
    for (const target of batch.targets) this.targets.set(target.id, target);
    for (const person of batch.people) this.people.set(JSON.stringify([person.project, person.id]), person);
    const publish = () => {
      this.timer = undefined;
      this.snapshot = { connection: batch.connection, currentUserId: batch.currentUserId,
        targets: [...this.targets.values()], people: [...this.people.values()] };
      for (const notify of this.listeners) notify();
    };
    if (!this.snapshot) publish();
    else this.timer ??= setTimeout(publish, 50);
  }
  finish() { this.ended = true; clearTimeout(this.timer); }
}

export type ScheduleRequest = Promise<ScheduleRead> & { progress?: ScheduleProgressFeed };
const emptySubscribe = () => () => {};
const emptySnapshot = () => undefined;
export function useScheduleProgress(request?: ScheduleRequest | null) {
  const feed = request?.progress;
  return useSyncExternalStore(feed?.subscribe ?? emptySubscribe, feed?.getSnapshot ?? emptySnapshot);
}
