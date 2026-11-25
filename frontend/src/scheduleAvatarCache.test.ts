import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.resetModules());

it("缺失头像不会清空进程内已知地址，订阅者卸载后不再收到更新", async () => {
  const cache = await import("./scheduleAvatarCache");
  const key = cache.scheduleAvatarKey("account", { id: "peer", name: "同事", connection: "c", project: "p" });
  const changed = vi.fn();
  const unsubscribe = cache.subscribeScheduleAvatar(key, changed);
  cache.rememberScheduleAvatar(key, "photo.png");
  cache.rememberScheduleAvatar(key, undefined);
  cache.rememberScheduleAvatar(key, " ");
  expect(cache.cachedScheduleAvatar(key)).toBe("photo.png");
  expect(changed).toHaveBeenCalledTimes(1);
  unsubscribe();
  cache.rememberScheduleAvatar(key, "new-photo.png");
  expect(changed).toHaveBeenCalledTimes(1);
});

it("缓存仅属于当前模块进程实例，新实例不恢复旧头像", async () => {
  const current = await import("./scheduleAvatarCache");
  current.rememberScheduleAvatar("process-avatar", "photo.png");
  expect(current.cachedScheduleAvatar("process-avatar")).toBe("photo.png");
  vi.resetModules();
  const next = await import("./scheduleAvatarCache");
  expect(next.cachedScheduleAvatar("process-avatar")).toBeUndefined();
});

it("相同身份的失效地址统一让位于候选，旧失败回调不会撤掉新头像", async () => {
  const cache = await import("./scheduleAvatarCache");
  cache.rememberScheduleAvatar("same-person", "old.png");
  cache.rememberScheduleAvatar("same-person", "new.png", false);
  cache.rejectScheduleAvatar("same-person", "old.png");
  expect(cache.cachedScheduleAvatar("same-person")).toBe("new.png");
  cache.rejectScheduleAvatar("same-person", "old.png");
  expect(cache.cachedScheduleAvatar("same-person")).toBe("new.png");
  cache.rememberScheduleAvatar("same-person", "old.png");
  expect(cache.cachedScheduleAvatar("same-person")).toBe("new.png");
});
