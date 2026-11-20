import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import type { SchedulePerson } from "./scheduleApi";

const initials = (name: string) =>
  /[\u3400-\u9fff]/.test(name)
    ? Array.from(name)[0]
    : name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export function ScheduleAvatar({ person }: { person?: SchedulePerson }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [person?.avatar]);
  const color = Array.from(person?.id || "").reduce(
    (hash, char) => ((hash * 31 + char.charCodeAt(0)) >>> 0), 0,
  ) % 4;
  const hasRealInitials = Boolean(person?.name && !/^\d+$/.test(person.name.trim()));
  return <span className={`schedule-avatar schedule-avatar-${color}`} aria-hidden="true">
    {person?.avatar && !failed ? <img src={person.avatar} alt="" onError={() => setFailed(true)} />
      : hasRealInitials && person?.name ? initials(person.name) : <UserRound size={16} />}
  </span>;
}
