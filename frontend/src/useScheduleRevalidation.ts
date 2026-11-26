import { useEffect, useRef } from "react";

export const RECENT_SCHEDULE_INTERVAL = 5 * 60_000;
export const HISTORICAL_SCHEDULE_INTERVAL = 15 * 60_000;
export const SCHEDULE_RETRY_DELAY = 60_000;

export function scheduleReadAvailable() {
  return document.visibilityState !== "hidden" && navigator.onLine !== false;
}

export function useScheduleRevalidation(scope: string, dueAt: number | null, freshUntil: number, refresh: () => void) {
  const refreshRef = useRef(refresh);
  const lastScope = useRef("");
  refreshRef.current = refresh;
  useEffect(() => {
    const entering = scope !== lastScope.current;
    lastScope.current = scope;
    if (!scope || dueAt === null) return;
    let timer: number | undefined;
    const check = (resume = false) => {
      window.clearTimeout(timer);
      if (!scheduleReadAvailable()) return;
      const now = Date.now();
      const wait = (resume && freshUntil <= now ? freshUntil : dueAt) - now;
      if (wait > 0) timer = window.setTimeout(() => check(), wait);
      else refreshRef.current();
    };
    const resume = () => check(true);
    const pause = () => check();
    check(entering);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", pause);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", pause);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [scope, dueAt, freshUntil]);
}
