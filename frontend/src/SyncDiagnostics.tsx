import { useState } from "react";
import { errorKindLabel, localTime, stopLabel } from "./model";
import { sourceName } from "./sourcePresets";
import { syncFailureMessage } from "./readFeedback";
import type { AppError, Source, SyncReport, SyncRun } from "./types";
import "./SyncDiagnostics.css";

// 错误原文已在后端按实际凭证脱敏；展示与复制再隐藏常见凭证格式。
export function diagnosticText(text: string): string {
  return text
    .replace(/\bBearer\s+[^\s,;"'}]+/gi, "Bearer ***")
    .replace(/((?:["']?)(?:x-mcp-token|access_token|refresh_token|token|authorization)["']?\s*[:=]\s*["']?)[^\s,;"'&}]+/gi, "$1***")
    .slice(0, 12000);
}

export function reportFailure(report: SyncReport, runs: SyncRun[] = report.runs || []): AppError {
  // 只按当前运行编号关联，其他来源的历史失败不能成为本次失败原因。
  const run = report.run_id == null ? undefined : runs.find((run) => run.id === report.run_id);
  return {
    kind: run?.error_kind || (report.items_rejected ? "parse" : "incomplete"),
    message: run?.error_message || run?.rejection_detail ||
      (report.rejections?.length ? JSON.stringify(report.rejections) : "") ||
      (report.items_rejected ? `${report.items_rejected} 条记录未能入库` : stopLabel[report.stop_reason] || report.stop_reason),
  };
}

export function SyncDiagnostics({ sources, runs, failures, close }: {
  sources: Source[];
  runs: SyncRun[];
  failures: Array<[string, AppError]>;
  close: () => void;
}) {
  const [copyState, setCopyState] = useState("");
  const name = (id?: string | null) => {
    const source = sources.find((source) => source.id === id);
    return source ? sourceName(source) : id || "未记录来源";
  };
  const recent = runs.slice(0, 20);
  const text = diagnosticText([
    "FSTODO 同步诊断",
    ...failures.map(([id, error]) => `本次会话失败：${name(id)}\n类别：${error.kind}\n${error.message || "未提供详细原因"}`),
    ...recent.map((run) => `运行 #${run.id} · ${name(run.source_id)} · ${localTime(run.started_at_ms)}\n` +
      `状态：${run.status}；触发：${run.trigger || "未记录"}；操作：${run.action}；范围：${run.todo_scope || "默认"}\n` +
      `已读取 ${run.pages_fetched} 页 / ${run.items_received} 条；拒绝 ${run.items_rejected} 条；类别：${run.error_kind || "无"}\n` +
      `${run.error_message || ""}\n${run.rejection_detail || ""}`),
  ].join("\n\n"));
  return <section className="sync-diagnostics" aria-label="同步诊断详情">
    <div className="sync-diagnostics-heading">
      <div><h2>同步诊断</h2><p>本次会话失败与最近 20 次同步记录。历史失败不代表当前仍有故障；详细原因仅在此处展开。</p></div>
      <button className="secondary" onClick={close}>收起诊断</button>
    </div>
    <button className="secondary" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setCopyState("诊断已复制"); }
      catch { setCopyState("复制失败，请展开详情后选择文字复制"); }
    }}>复制同步诊断</button>
    {copyState && <p role="status">{copyState}</p>}
    {failures.map(([id, error]) => <details key={id}>
      <summary>{name(id)} · {errorKindLabel(error.kind)} · 本次会话失败</summary>
      <p>{syncFailureMessage(error.kind, error.message)}。</p>
      <pre>{diagnosticText(error.message || "未提供详细原因")}</pre>
    </details>)}
    {recent.map((run) => <details key={run.id}>
      <summary>{name(run.source_id)} · {localTime(run.started_at_ms)} · {run.status === "failed" ? "失败" : run.status === "success" ? "成功" : "未结束"}</summary>
      <p>运行 #{run.id} · {run.trigger === "manual" ? "手动" : run.trigger === "automatic" ? "自动" : "未记录触发方式"} · 已读取 {run.pages_fetched} 页 / {run.items_received} 条 · 拒绝 {run.items_rejected} 条</p>
      <p>错误类别：{run.error_kind ? errorKindLabel(run.error_kind) : "无"} · 结束原因：{run.stop_reason ? stopLabel[run.stop_reason] || run.stop_reason : "未记录"}</p>
      <pre>{diagnosticText([run.error_message, run.rejection_detail].filter(Boolean).join("\n") || "未记录错误详情")}</pre>
    </details>)}
    {!failures.length && !recent.length && <p>尚无同步记录。点击“立即刷新”后，可在这里查看结果。</p>}
  </section>;
}
