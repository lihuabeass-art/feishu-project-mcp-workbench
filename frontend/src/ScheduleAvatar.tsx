import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { UserRound } from "lucide-react";
import type { SchedulePerson } from "./scheduleApi";
import { cachedScheduleAvatar, rejectScheduleAvatar, rememberScheduleAvatar, scheduleAvatarKey, subscribeScheduleAvatar } from "./scheduleAvatarCache";

const AvatarScope = createContext<string | null>(null);

export function ScheduleAvatarCacheProvider({ scope, people, children }: {
  scope: string | null; people: SchedulePerson[]; children: ReactNode;
}) {
  useLayoutEffect(() => {
    for (const person of people) rememberScheduleAvatar(scheduleAvatarKey(scope, person), person.avatar);
  }, [scope, people]);
  return <AvatarScope.Provider value={scope}>{children}</AvatarScope.Provider>;
}

const initials = (name: string) =>
  /[\u3400-\u9fff]/.test(name)
    ? Array.from(name)[0]
    : name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export function ScheduleAvatar({ person }: { person?: SchedulePerson }) {
  const scope = useContext(AvatarScope);
  const key = scheduleAvatarKey(scope, person);
  const cached = useSyncExternalStore(
    useCallback((listener) => subscribeScheduleAvatar(key, listener), [key]),
    useCallback(() => cachedScheduleAvatar(key), [key]),
  );
  const avatar = cached || cachedScheduleAvatar(key, person?.avatar);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [key, avatar]);
  useEffect(() => rememberScheduleAvatar(key, person?.avatar, false), [key, person?.avatar]);
  const color = Array.from(person?.id || "").reduce(
    (hash, char) => ((hash * 31 + char.charCodeAt(0)) >>> 0), 0,
  ) % 4;
  const hasRealInitials = Boolean(person?.name && !/^\d+$/.test(person.name.trim()));
  return <span className={`schedule-avatar schedule-avatar-${color}`} aria-hidden="true">
    {avatar && !failed ? <img src={avatar} alt="" onError={() => {
      const current = cachedScheduleAvatar(key);
      if (current && current !== avatar) return;
      rejectScheduleAvatar(key, avatar);
      setFailed(true);
    }} />
      : hasRealInitials && person?.name ? initials(person.name) : <UserRound size={16} />}
  </span>;
}
