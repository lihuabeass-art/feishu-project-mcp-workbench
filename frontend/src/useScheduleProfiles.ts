import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SchedulePerson } from "./scheduleApi";

export function missingScheduleName(name: string | undefined, id: string) {
  return !name?.trim() || name === id || /^\d{6,}$/.test(name) || (id.length >= 6 && name === Array.from(id).slice(-6).join(""));
}

// 新出现的成员加入同一个队列。事项的到达和离开都不取消正在读取的资料。
export function useScheduleProfiles(context: string, connection: string | undefined, user: string | null | undefined, people: SchedulePerson[]) {
  const queue = useMemo(() => ({ ids: new Set<string>(), cached: new Set<string>(), active: true, wake: () => {} }), [context, connection, user]);
  const [result, setResult] = useState<{ queue: typeof queue; profiles: Map<string, SchedulePerson> }>();
  useEffect(() => {
    if (!context || !connection || !user) return;
    queue.active = true;
    let active = true;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const nextRead = new Map<string, number>();
    const attempts = new Map<string, number>();
    const schedule = (delay: number) => { clearTimeout(timer); timer = setTimeout(drain, delay); };
    const drain = async () => {
      if (!active || busy || navigator.onLine === false || document.visibilityState === "hidden") return;
      const now = Date.now();
      const pending = [...queue.ids].filter((id) => (nextRead.get(id) ?? 0) <= now).slice(0, 50);
      if (!pending.length) {
        const next = Math.min(...[...queue.ids].map((id) => nextRead.get(id) ?? Infinity));
        if (Number.isFinite(next)) schedule(Math.max(1, next - now));
        return;
      }
      busy = true;
      let profiles: SchedulePerson[] = [];
      try { profiles = await invoke<SchedulePerson[]>("load_schedule_profiles", { connection, currentUser: user, ids: pending }) || []; }
      catch { /* 暂态失败在本队列内补查，排期继续显示。 */ }
      if (!active) return;
      const found = new Set(profiles.map((person) => person.id));
      if (profiles.length) setResult((prior) => {
        const values = new Map(prior?.queue === queue ? prior.profiles : []);
        for (const person of profiles) values.set(person.id, person);
        return { queue, profiles: values };
      });
      for (const id of pending) {
        const count = found.has(id) ? 0 : (attempts.get(id) ?? 0) + 1;
        attempts.set(id, count);
        nextRead.set(id, Date.now() + (count === 1 ? 2_000 : count === 2 ? 10_000 : 15 * 60_000));
      }
      busy = false;
      schedule(0);
    };
    const online = () => { for (const [id, count] of attempts) if (count) nextRead.delete(id); schedule(0); };
    queue.wake = () => schedule(0);
    window.addEventListener("online", online);
    const visible = () => { if (document.visibilityState !== "hidden") schedule(0); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false; queue.active = false; clearTimeout(timer); queue.wake = () => {};
      window.removeEventListener("online", online); document.removeEventListener("visibilitychange", visible);
    };
  }, [context, connection, user, queue]);
  useEffect(() => {
    queue.ids = new Set(people.filter((p) => p.id && (!p.connection || p.connection === connection) &&
      (missingScheduleName(p.name, p.id) || !p.avatar)).map((p) => p.id));
    queue.wake();
    if (!context || !connection || !user) return;
    const missing = [...queue.ids].filter((id) => !queue.cached.has(id));
    for (let i = 0; i < missing.length; i += 50) {
      const ids = missing.slice(i, i + 50);
      for (const id of ids) queue.cached.add(id);
      void invoke<SchedulePerson[]>("load_schedule_profiles", { connection, currentUser: user, ids, cachedOnly: true }).then((profiles) => {
        if (!profiles?.length || !queue.active) return;
        setResult((prior) => {
          const values = new Map(prior?.queue === queue ? prior.profiles : []);
          for (const p of profiles) if (!values.has(p.id)) values.set(p.id, p);
          return { queue, profiles: values };
        });
      }).catch(() => {});
    }
  }, [queue, people, context, connection, user]);
  return result?.queue === queue ? result.profiles : undefined;
}
