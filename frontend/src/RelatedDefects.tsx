import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { asError } from "./model";
import { readFailureMessage } from "./readFeedback";
import type { CachedItem } from "./types";
import "./related-defects.css";

type Defect = { item: CachedItem; status: string | null; operators: string[]; mine: boolean | null };
type Result = { relation_field: string; items: Defect[]; mine_available: boolean; incomplete_details: number };

export function RelatedDefects({ item, canCreate, open, create, revision }: {
  item: CachedItem; canCreate: boolean; open: (item: CachedItem) => void; create: (fieldKey: string) => void; revision: string;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [mine, setMine] = useState(false);
  useEffect(() => {
    let active = true;
    setError("");
    // 这个命令只读取本地事项和详情，不调用飞书。
    invoke<Result>("list_related_defects", { itemId: item.id }).then((data) => {
      if (active) { setResult(data); if (!data.mine_available) setMine(false); }
    }).catch((failure) => { if (active) setError(readFailureMessage(asError(failure).kind)); });
    return () => { active = false; };
  }, [revision, item.id.project_key, item.id.work_item_type_key, item.id.work_item_id]);
  const rows = result?.items.filter((entry) => !mine || entry.mine) || [];
  return <section className="related-defects" aria-label="关联缺陷">
    <div className="related-defects-head"><h3>关联缺陷 {result && <span>（{result.items.length}）</span>}</h3>
      {canCreate && result && <button type="button" className="secondary" disabled={!!error} onClick={() => create(result.relation_field)}>＋ 新建缺陷</button>}</div>
    <p className="hint">显示本机已同步的缺陷，随工作来源同步更新。</p>
    {error && <p className="error-text" role="alert">本机缺陷读取失败：{error}{result && "，保留上次读取的结果。"}</p>}
    {result && <>
      <div className="related-defects-tools"><div className="related-defects-filters" role="group" aria-label="关联缺陷筛选"><button type="button" aria-pressed={!mine} onClick={() => setMine(false)}>全部</button><button type="button" aria-pressed={mine} disabled={!result.mine_available} onClick={() => setMine(true)}>与我相关</button></div></div>
      {mine && <p className="hint">仅显示已在本机个人待办或参与来源中确认的缺陷。</p>}
      {result.incomplete_details > 0 && <p className="hint">部分本机缺陷尚无完整关联信息，请通过已有工作来源同步补齐。</p>}
      {!rows.length && <p className="hint">{mine ? "本机暂无确认与我相关的缺陷。" : "本机暂无关联缺陷。"}</p>}
      {rows.map((entry) => <button type="button" className="related-defect-row" key={entry.item.id.work_item_id} onClick={() => open(entry.item)}>
        <strong>{entry.item.name || "名称未提供"}</strong><span>#{entry.item.id.work_item_id}{entry.status ? ` · ${entry.status}` : ""}{entry.operators.length ? ` · 当前负责人：${entry.operators.join("、")}` : ""}</span></button>)}
    </>}
  </section>;
}
