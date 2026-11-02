import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emptyWorkFilters, type WorkFilters } from "./workFilters";
import { emptySchemeDocument, readSchemeDocument, savedFilters, schemeAdjusted, type FilterSchemeDocument } from "./filterSchemes";
import { asError } from "./model";
import { readFailureMessage } from "./readFeedback";

export function useFilterSchemes({ enabled, context, active, filters, apply }: {
  enabled: boolean; context: string; active: boolean; filters: WorkFilters; apply: (filters: WorkFilters) => void;
}) {
  const [document, setDocument] = useState(emptySchemeDocument);
  const [account, setAccount] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const applyRef = useRef(apply); applyRef.current = apply;
  const activeRef = useRef(active); activeRef.current = active;
  const pendingEntry = useRef(true);
  const lastAccount = useRef<string | null>(null);
  const current = document.schemes.find((scheme) => scheme.id === currentId);
  const applyDocumentDefault = (next: FilterSchemeDocument) => {
    const scheme = next.schemes.find((scheme) => scheme.id === next.defaultId);
    applyRef.current(scheme ? structuredClone(scheme.filters) : structuredClone(emptyWorkFilters));
    setCurrentId(scheme?.id ?? null);
  };
  useEffect(() => {
    const request = ++generation.current;
    setAccount(null); setDocument(emptySchemeDocument()); setError("");
    if (!enabled) { setBusy(false); return; }
    setBusy(true);
    void invoke<{ account: string; document: unknown }>("load_filter_schemes").then((result) => {
      if (request !== generation.current) return;
      let next: FilterSchemeDocument;
      try {
        next = readSchemeDocument(result.document);
      } catch (cause) {
        // Only the local document parser's fixed messages are suitable for display.
        setError(`筛选方案未加载，当前临时条件已保留。${(cause as Error).message}，请升级应用或恢复兼容的方案数据后重新读取。`);
        return;
      }
      setDocument(next); setAccount(result.account);
      const changedAccount = lastAccount.current !== null && lastAccount.current !== result.account;
      lastAccount.current = result.account;
      if (changedAccount) { pendingEntry.current = true; setCurrentId(null); }
      if (activeRef.current && pendingEntry.current) { applyDocumentDefault(next); pendingEntry.current = false; }
    }).catch((cause) => {
      if (request === generation.current) setError(`筛选方案未加载，当前临时条件已保留。${readFailureMessage(asError(cause).kind)}。`);
    }).finally(() => { if (request === generation.current) setBusy(false); });
    return () => { ++generation.current; };
  }, [enabled, context, retry]);
  useEffect(() => {
    if (!active) { pendingEntry.current = true; return; }
    if (account && pendingEntry.current) { applyDocumentDefault(document); pendingEntry.current = false; }
  }, [active, account]);
  async function persist(next: FilterSchemeDocument, after?: () => void) {
    if (!account || busy) return false;
    const request = generation.current;
    setBusy(true); setError("");
    try {
      await invoke("save_filter_schemes", { account, document: next });
      if (request !== generation.current) return false;
      setDocument(next); after?.();
      return true;
    } catch (cause) {
      if (request === generation.current) {
        const kind = asError(cause).kind;
        const nextStep = kind === "store" || kind === "storage"
          ? "本地方案暂时无法保存，请稍后重试"
          : kind === "validation" ? "账号身份未能确认，请重新读取方案后再试" : readFailureMessage(kind);
        setError(`筛选方案未保存，原方案与当前输入已保留。${nextStep}。`);
      }
      return false;
    } finally { if (request === generation.current) setBusy(false); }
  }
  return {
    document, current, adjusted: !!current && schemeAdjusted(filters, current), busy, available: !!account, error,
    retry: () => setRetry((value) => value + 1),
    apply(id: string | null) {
      const scheme = document.schemes.find((entry) => entry.id === id);
      apply(scheme ? structuredClone(scheme.filters) : structuredClone(emptyWorkFilters)); setCurrentId(scheme?.id ?? null);
    },
    detach: () => setCurrentId(null),
    save(name: string, includeQuery: boolean, makeDefault: boolean) {
      const scheme = { id: crypto.randomUUID(), name: name.trim(), includeQuery, filters: savedFilters(filters, includeQuery) };
      return persist({ ...document, schemes: [...document.schemes, scheme], defaultId: makeDefault ? scheme.id : document.defaultId }, () => {
        setCurrentId(scheme.id); apply(structuredClone(scheme.filters));
      });
    },
    update() {
      if (!current) return;
      const updated = { ...current, filters: savedFilters(filters, current.includeQuery) };
      return persist({ ...document, schemes: document.schemes.map((scheme) => scheme.id === current.id ? updated : scheme) });
    },
    rename(id: string, name: string) { return persist({ ...document, schemes: document.schemes.map((scheme) => scheme.id === id ? { ...scheme, name: name.trim() } : scheme) }); },
    remove(id: string) { return persist({ ...document, schemes: document.schemes.filter((scheme) => scheme.id !== id), defaultId: document.defaultId === id ? null : document.defaultId }, () => { if (currentId === id) setCurrentId(null); }); },
    setDefault(id: string | null) { return persist({ ...document, defaultId: id }); },
  };
}
export type FilterSchemesController = ReturnType<typeof useFilterSchemes>;
