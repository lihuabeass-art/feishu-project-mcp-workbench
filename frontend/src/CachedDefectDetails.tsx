import { useEffect, useState } from "react";
import { cachedItemDetail } from "./api";
import { BusinessField } from "./BusinessField";
import { ExternalLink } from "./ExternalLink";
import { FieldValue } from "./WorkItemDetails";
import { asError, localTime } from "./model";
import { readFailureMessage } from "./readFeedback";
import { isEmpty } from "./detailFields";
import type { CachedItem, ItemDetail } from "./types";

export function CachedDefectDetails({ item }: { item: CachedItem }) {
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setDetail(null);
    cachedItemDetail(item.id).then((value) => { if (active) setDetail(value); })
      .catch((failure) => { if (active) setError(readFailureMessage(asError(failure).kind)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [item.id.project_key, item.id.work_item_type_key, item.id.work_item_id, item.detail_revision]);
  return <section className="detail-section" aria-label="本机缺陷详情">
    {loading && <p className="hint" role="status">正在读取本机详情…</p>}
    {error && <p className="error-text" role="alert">本机详情读取失败：{error}</p>}
    {!loading && !error && !detail && <p className="hint">本机暂无缺陷详情，请通过工作来源同步。</p>}
    {detail && <>
      <div className="detail-freshness"><p className="hint">本机缓存 · {localTime(detail.fetched_at_ms)}</p>{detail.item_url && <ExternalLink href={detail.item_url}>打开飞书事项 ↗</ExternalLink>}</div>
      <dl className="detail-summary"><dt>当前状态</dt><dd><FieldValue value={detail.data.work_item_attribute.work_item_status} /></dd></dl>
      {detail.data.work_item_fields.filter((field) => !isEmpty(field.value)).map((field, index) => <section className="detail-description" key={`${field.key}-${index}`}><h4>{field.name || field.key}</h4><BusinessField itemId={item.id} fieldKey={field.key} value={field.value} cacheOnly /></section>)}
      <p className="hint">此处只显示本机内容。需要流转时可从工作清单打开该缺陷。</p>
    </>}
  </section>;
}
