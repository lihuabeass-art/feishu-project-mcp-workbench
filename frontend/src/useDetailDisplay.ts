import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function readPinnedKeys(document: unknown): string[] {
  if (document == null) return [];
  if (typeof document !== "object" || (document as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    !Array.isArray((document as { pinnedKeys?: unknown }).pinnedKeys) ||
    !(document as { pinnedKeys: unknown[] }).pinnedKeys.every((key) => typeof key === "string" && key.length > 0)) {
    throw new Error("详情显示设置格式暂不兼容");
  }
  return [...new Set((document as { pinnedKeys: string[] }).pinnedKeys)];
}

export function useDetailDisplay(enabled: boolean, context: string, project: string | null, kind: string | null) {
  const scope = JSON.stringify([context, project, kind]);
  const generation = useRef(0);
  const [state, setState] = useState<{ scope: string; account: string; keys: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const request = ++generation.current;
    setState(null); setError("");
    if (!enabled || !project || !kind) { setBusy(false); return; }
    setBusy(true);
    invoke<{ account: string; document: unknown }>("load_detail_display", { project, kind }).then((result) => {
      if (request === generation.current) setState({ scope, account: result.account, keys: readPinnedKeys(result.document) });
    }).catch(() => {
      if (request === generation.current) setError("常显设置读取失败，可重试；其他字段仍可在更多信息中查看。");
    }).finally(() => { if (request === generation.current) setBusy(false); });
    return () => { ++generation.current; };
  }, [enabled, scope, retry]);
  const current = state?.scope === scope ? state : null;
  return {
    keys: current?.keys ?? [], busy, error, available: !!current,
    retry: () => setRetry((value) => value + 1),
    async toggle(key: string) {
      if (!current || busy) return;
      const request = generation.current;
      const keys = current.keys.includes(key) ? current.keys.filter((entry) => entry !== key) : [...current.keys, key];
      setBusy(true); setError("");
      try {
        await invoke("save_detail_display", { account: current.account, project, kind, document: { schemaVersion: 1, pinnedKeys: keys } });
        if (request === generation.current) setState({ ...current, keys });
      } catch {
        if (request === generation.current) setError("常显设置未保存，原设置已保留，请重试。");
      } finally { if (request === generation.current) setBusy(false); }
    },
  };
}
