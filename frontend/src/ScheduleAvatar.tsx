import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { UserRound } from "lucide-react";
import type { SchedulePerson } from "./scheduleApi";
import { cachedScheduleAvatar, loadScheduleAvatarImage, rejectScheduleAvatar, rememberScheduleAvatar, scheduleAvatarImage, scheduleAvatarImageKey, scheduleAvatarKey, subscribeScheduleAvatar } from "./scheduleAvatarCache";

const AvatarScope = createContext<string | null>(null);
const AvatarConnection = createContext<string | undefined>(undefined);

export function ScheduleAvatarCacheProvider({ scope, connection, people, children }: {
  scope: string | null; connection?: string; people: SchedulePerson[]; children: ReactNode;
}) {
  useLayoutEffect(() => {
    for (const person of people) rememberScheduleAvatar(scheduleAvatarKey(scope, person), person.avatar);
  }, [scope, people]);
  return <AvatarScope.Provider value={scope}><AvatarConnection.Provider value={connection}>{children}</AvatarConnection.Provider></AvatarScope.Provider>;
}

const initials = (name: string) =>
  /[\u3400-\u9fff]/.test(name)
    ? Array.from(name)[0]
    : name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export function ScheduleAvatar({ person }: { person?: SchedulePerson }) {
  const scope = useContext(AvatarScope);
  const connection = useContext(AvatarConnection);
  const key = scheduleAvatarKey(scope, person);
  const cached = useSyncExternalStore(
    useCallback((listener) => subscribeScheduleAvatar(key, listener), [key]),
    useCallback(() => cachedScheduleAvatar(key), [key]),
  );
  const avatar = cached || cachedScheduleAvatar(key, person?.avatar);
  const imageKey = scheduleAvatarImageKey(connection, avatar);
  const [image, setImage] = useState<{ key: string; data: string | null }>();
  const imageData = image?.key === imageKey ? image?.data : imageKey ? scheduleAvatarImage(imageKey) : undefined;
  useEffect(() => {
    if (!imageKey) return;
    let active = true;
    void loadScheduleAvatarImage(imageKey).then((data) => { if (active) setImage({ key: imageKey, data }); });
    return () => { active = false; };
  }, [imageKey]);
  const src = imageKey ? imageData === null ? avatar : imageData : avatar;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [key, avatar]);
  useEffect(() => rememberScheduleAvatar(key, person?.avatar, false), [key, person?.avatar]);
  const color = Array.from(person?.id || "").reduce(
    (hash, char) => ((hash * 31 + char.charCodeAt(0)) >>> 0), 0,
  ) % 4;
  const hasRealInitials = Boolean(person?.name && !/^\d+$/.test(person.name.trim()));
  return <span className={`schedule-avatar schedule-avatar-${color}`} aria-hidden="true">
    {src && avatar && !failed ? <img src={src} alt="" onError={() => {
      if (imageKey && imageData) { setImage({ key: imageKey, data: null }); return; }
      const current = cachedScheduleAvatar(key);
      if (current && current !== avatar) return;
      rejectScheduleAvatar(key, avatar);
      setFailed(true);
    }} />
      : hasRealInitials && person?.name ? initials(person.name) : <UserRound size={16} />}
  </span>;
}
