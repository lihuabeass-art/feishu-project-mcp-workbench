import { invoke } from "@tauri-apps/api/core";
import type { SchedulePerson } from "./scheduleApi";

// 进程内同步头像地址，照片内容由桌面缓存按连接与地址保存。
const avatars = new Map<string, string>();
const candidates = new Map<string, Set<string>>();
const failed = new Map<string, Set<string>>();
const listeners = new Map<string, Set<() => void>>();
const imageRequests = new Map<string, Promise<string | null>>();
const images = new Map<string, string>();

export function scheduleAvatarImageKey(connection: string | undefined, url: string | undefined): string | undefined {
  if (!connection || !url) return;
  try {
    const address = new URL(url);
    if (address.protocol === "https:" && /(^|\.)(feishucdn\.com|larksuitecdn\.com|byteimg\.com)$/.test(address.hostname)) {
      return JSON.stringify([connection, url]);
    }
  } catch { /* 其他来源使用浏览器原有图片加载路径。 */ }
}

export function scheduleAvatarImage(key: string): string | undefined {
  return images.get(key);
}

export function loadScheduleAvatarImage(key: string): Promise<string | null> {
  const existing = scheduleAvatarImage(key);
  if (existing) return Promise.resolve(existing);
  const pending = imageRequests.get(key);
  if (pending) return pending;
  const [connection, url] = JSON.parse(key) as [string, string];
  const request = invoke<string | null>("load_schedule_avatar", { connection, url }).then((image) => {
    if (image) {
      images.set(key, image);
      if (images.size > 256) images.delete(images.keys().next().value!);
    }
    return image;
  }, () => null).finally(() => imageRequests.delete(key));
  imageRequests.set(key, request);
  return request;
}

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
