export const SYNC_INTERVAL = 120_000;
export interface SyncPolicy {
  failures: number;
  nextAt: number;
  lastSuccessAt?: number;
}
const storageKey = "fstodo.sync-policy.v1";
export const freshPolicy = (): SyncPolicy => ({
  failures: 0,
  nextAt: Date.now() + SYNC_INTERVAL,
});
export function nextSyncPolicy(
  previous: SyncPolicy,
  errorKind?: string,
): SyncPolicy {
  if (!errorKind) return { ...freshPolicy(), lastSuccessAt: Date.now() };
  const failures = previous.failures + 1;
  return {
    failures,
    lastSuccessAt: previous.lastSuccessAt,
    nextAt: Date.now() + SYNC_INTERVAL * 2 ** Math.min(failures, 2),
  };
}
export function retryFailedPolicies(
  policies: Record<string, SyncPolicy>,
): Record<string, SyncPolicy> {
  const now = Date.now();
  let next = policies;
  for (const [id, policy] of Object.entries(policies)) {
    if (policy.failures > 0 && policy.nextAt > now) {
      if (next === policies) next = { ...policies };
      next[id] = { ...policy, nextAt: now };
    }
  }
  return next;
}
export function loadSyncPolicies(): Record<string, SyncPolicy> {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(storageKey) || "{}",
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, p]) =>
          p &&
          Number.isInteger(p.failures) &&
          p.failures >= 0 &&
          Number.isFinite(p.nextAt),
      ).map(([id, p]) => [id, {
        failures: p.failures,
        nextAt: p.nextAt,
        lastSuccessAt: p.lastSuccessAt,
      }]), // 兼容旧版已保存的 paused 状态，重新纳入定时重试。
    );
  } catch {
    return {};
  }
}
export function saveSyncPolicies(policies: Record<string, SyncPolicy>) {
  localStorage.setItem(storageKey, JSON.stringify(policies));
}
