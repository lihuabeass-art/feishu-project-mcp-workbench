import { useEffect, useMemo, useState } from "react";
import type { ItemDetail } from "./types";
import { defaultPinnedKeys, fixedDocumentKeys } from "./detailFields";

type Field = ItemDetail["data"]["work_item_fields"][number];
type Identities = { descriptions: string[]; versions: string[]; documents: string[] };
const empty = (): Identities => ({ descriptions: [], versions: [], documents: [] });
function readIdentities(storageKey: string | null): Identities {
  const previous = empty();
  if (storageKey) try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null") as Partial<Identities> | null;
    for (const group of ["descriptions", "versions", "documents"] as const)
      if (Array.isArray(saved?.[group])) previous[group] = saved[group]!.filter((key): key is string => typeof key === "string" && !!key);
  } catch { /* 不影响本次按名称显示。 */ }
  return previous;
}

// 名称只用于首次发现；同一账号、空间和类型内继续使用字段 key，字段改名不影响识别。
export function useDetailFieldIdentity(fields: Field[], account: string | null, project: string | null, kind: string | null, verified: boolean) {
  const storageKey = account && project && kind ? `fstodo.detail-field-identities.v1:${JSON.stringify([account, project, kind])}` : null;
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = (event: Event) => {
      const key = event instanceof StorageEvent ? event.key : (event as CustomEvent<string>).detail;
      if (key === storageKey) setRevision((value) => value + 1);
    };
    window.addEventListener("storage", changed);
    window.addEventListener("fstodo-detail-identities-changed", changed);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener("fstodo-detail-identities-changed", changed);
    };
  }, [storageKey]);
  const identities = useMemo(() => {
    const previous = readIdentities(storageKey);
    const descriptions = fields.filter((field) => field.key === "description" ||
      ["需求说明", "缺陷描述", "事项说明"].includes(field.name?.trim() ?? "")).map((field) => field.key);
    return {
      descriptions: [...new Set([...previous.descriptions, ...descriptions])],
      versions: [...new Set([...previous.versions, ...defaultPinnedKeys(fields)])],
      documents: [...new Set([...previous.documents, ...fixedDocumentKeys(fields)])],
    };
  }, [fields, storageKey, revision]);
  useEffect(() => {
    if (storageKey && verified) try {
      // 写入前合并最新值，避免同一窗口的多个详情实例覆盖彼此发现的字段。
      const latest = readIdentities(storageKey);
      for (const group of ["descriptions", "versions", "documents"] as const)
        latest[group] = [...new Set([...latest[group], ...identities[group]])];
      const serialized = JSON.stringify(latest);
      if (localStorage.getItem(storageKey) !== serialized) {
        localStorage.setItem(storageKey, serialized);
        window.dispatchEvent(new CustomEvent("fstodo-detail-identities-changed", { detail: storageKey }));
      }
    }
    catch { /* 存储不可用时仍显示本次识别的字段。 */ }
  }, [storageKey, identities, verified]);
  return identities;
}
