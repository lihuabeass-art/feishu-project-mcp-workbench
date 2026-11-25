import type { SchedulePerson } from "./scheduleApi";

// 仅保存当前渲染进程内已取得的头像地址；不写入持久存储。
const avatars = new Map<string, string>();
const candidates = new Map<string, Set<string>>();
const failed = new Map<string, Set<string>>();
const listeners = new Map<string, Set<() => void>>();

export function scheduleAvatarKey(scope: string | null, person?: SchedulePerson): string | null {
  return scope && person?.id ? JSON.stringify([scope, person.connection || null, person.project || null, person.id]) : null;
}

export function cachedScheduleAvatar(key: string | null, fallback?: string | null): string | undefined {
  return (key ? avatars.get(key) : undefined) ||
    (fallback?.trim() && (!key || !failed.get(key)?.has(fallback)) ? fallback : undefined);
}

export function rememberScheduleAvatar(key: string | null, avatar?: string | null, prefer = true): void {
  if (!key || !avatar?.trim()) return;
  const urls = candidates.get(key) || new Set<string>();
  urls.add(avatar);
  candidates.set(key, urls);
  if (failed.get(key)?.has(avatar) || avatars.get(key) === avatar || (!prefer && avatars.has(key))) return;
  avatars.set(key, avatar);
  for (const listener of listeners.get(key) || []) listener();
}

export function rejectScheduleAvatar(key: string | null, avatar: string): void {
  if (!key) return;
  const rejected = failed.get(key) || new Set<string>();
  rejected.add(avatar);
  failed.set(key, rejected);
  if (avatars.get(key) !== avatar) return;
  const next = [...candidates.get(key) || []].reverse().find((url) => !rejected.has(url));
  if (next) avatars.set(key, next);
  else avatars.delete(key);
  for (const listener of listeners.get(key) || []) listener();
}

export function subscribeScheduleAvatar(key: string | null, listener: () => void): () => void {
  if (!key) return () => {};
  const subscribers = listeners.get(key) || new Set<() => void>();
  subscribers.add(listener);
  listeners.set(key, subscribers);
  return () => {
    subscribers.delete(listener);
    if (!subscribers.size) listeners.delete(key);
  };
}
