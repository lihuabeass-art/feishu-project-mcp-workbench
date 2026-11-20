import { useEffect, useRef, useState } from "react";
import { cachedItemDetail, refreshItemDetail } from "./api";
import { BusinessField } from "./BusinessField";
import { ExternalLink } from "./ExternalLink";
import { ArrowUpRight } from "lucide-react";
import { isEmpty } from "./detailFields";
import { useDetailFieldIdentity } from "./useDetailFieldIdentity";
import type { ItemDetail } from "./types";

export function ScheduleDescription({ project, type, item, connection, showItemLink }: { project: string; type: string; item: string; connection: string; showItemLink?: boolean }) {
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const fields = detail?.data.work_item_fields ?? [];
  const identities = useDetailFieldIdentity(fields, connection, project, type, !!detail);
  const current = useRef({ detail, keys: identities.descriptions });
  current.current = { detail, keys: identities.descriptions };
  useEffect(() => {
    let active = true;
    const id = { project_key: project, work_item_type_key: type, work_item_id: item };
    setLoading(true);
    setFailed(false);
    void (async () => {
      let cached: ItemDetail | null = null;
      try {
        cached = await cachedItemDetail(id);
        if (active && cached && !current.current.detail) setDetail(cached);
      } catch { /* 缓存不可用时仍尝试读取云端。 */ }
      try {
        const fresh = await refreshItemDetail(id);
        const previous = current.current.detail || cached;
        const cachedDescriptions = previous?.data.work_item_fields.filter((field) =>
          current.current.keys.includes(field.key) || field.key === "description" || ["需求说明", "缺陷描述", "缺陷说明", "事项说明"].includes(field.name?.trim() || "")) ?? [];
        const incomplete = cachedDescriptions.some((field) =>
          !fresh.data.work_item_fields.some((next) => next.key === field.key && next.value !== undefined));
        if (active) {
          if (incomplete) setFailed(true);
          else setDetail(fresh);
        }
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [project, type, item, connection, attempt]);
  const descriptions = fields.filter((field) => identities.descriptions.includes(field.key));
  const title = type === "story" ? "需求说明" : type === "issue" ? "缺陷描述" : "事项说明";
  return <>
  {showItemLink && detail?.item_url && <div className="schedule-editor-actions workflow-manual-fill detail-item-link">
    <ExternalLink href={detail.item_url} title="在浏览器打开飞书事项">打开飞书事项 <ArrowUpRight size={13} aria-hidden="true" /></ExternalLink>
  </div>}
  <section className="schedule-description" aria-label={title}>
    <strong>{title}</strong>
    {descriptions.map((field, index) => <div key={`${field.key}-${index}`}>
      {descriptions.length > 1 && <b>{field.name || title}</b>}
      {field.value === undefined ? <p className="hint">详情未返回该字段的内容，可在飞书中查看。</p> : isEmpty(field.value) ? <p className="hint">该字段为空。</p> :
        <BusinessField value={field.value} itemId={detail!.id} fieldKey={field.key} />}
    </div>)}
    {!descriptions.length && <p className="hint">{loading ? "正在读取说明…" : failed ? "暂时无法读取说明。" : "详情未返回已识别的说明字段，可在飞书中查看。"}</p>}
    {failed && <p className="hint">{detail ? "暂时无法获取最新说明，已保留缓存。" : "请稍后重试。"} <button type="button" className="secondary" onClick={() => setAttempt((value) => value + 1)}>重试</button></p>}
  </section></>;
}
