import { BookOpen, CircleCheck, CircleHelp, CircleAlert, LoaderCircle } from "lucide-react";
import type { AppError } from "./types";
import "./McpConnectionStatus.css";

export type ConnectionCheckResult =
  | { state: "success"; server: string }
  | { state: "failed"; error: AppError };

function failureHelp(kind: string) {
  switch (kind) {
    case "auth": return {
      title: "凭证未通过验证",
      help: "飞书项目未接受当前 Token。请重新复制完整 Token，保存后再检查连接。",
      tutorial: true,
    };
    case "credential": return {
      title: "本机凭证不可用",
      help: "未能读取或使用本机保存的 Token。请重新粘贴并保存，再检查连接。",
      tutorial: true,
    };
    case "permission": return {
      title: "飞书侧权限不足",
      help: "请确认飞书项目已启用 MCP，并检查账号及 MCP 的访问权限；需要时联系管理员。",
      tutorial: false,
    };
    case "connection": return {
      title: "暂时无法连接",
      help: "可能是网络、服务地址或服务暂时不可用。请检查网络和地址，稍后重试；本次无法判断 Token 是否有效。",
      tutorial: false,
    };
    default: return {
      title: "连接检查未完成",
      help: "请查看错误详情，处理后重新检查连接；本次无法判断 Token 是否有效。",
      tutorial: false,
    };
  }
}

export function McpConnectionStatus({ configured, description, result, checking, onOpenGuide }: {
  configured: boolean;
  description?: string;
  result: ConnectionCheckResult | null;
  checking: boolean;
  onOpenGuide: () => void;
}) {
  const failure = result?.state === "failed" ? failureHelp(result.error.kind) : null;
  const success = result?.state === "success";
  const tone = checking ? "neutral" : failure ? "warning" : success ? "success" : "neutral";
  const Icon = checking ? LoaderCircle : failure ? CircleAlert : success ? CircleCheck : CircleHelp;
  const title = checking ? "正在检查连接…" : failure?.title || (success ? "连接已通过检查" : configured ? "Token 已保存" : "尚未配置 Token");
  const help = failure?.help || (success
    ? `已与 ${result.server} 建立连接。`
    : configured ? "尚未检查连接。点击上方「检查连接」验证是否可用。" : "按下方教程获取并保存 Token，再检查连接。");

  return (
    <div className={`mcp-connection-status ${tone}`}>
      <div className="mcp-connection-summary" role="status" aria-live="polite">
        <Icon size={16} className={checking ? "spin" : undefined} aria-hidden="true" />
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </div>
      <p>{help}</p>
      {failure?.tutorial && <button type="button" className="mcp-connection-guide" onClick={onOpenGuide}>
        <BookOpen size={14} aria-hidden="true" />查看获取教程
      </button>}
      {result?.state === "failed" && <details className="mcp-connection-details">
        <summary>错误详情</summary>
        <p>{result.error.message}</p>
      </details>}
    </div>
  );
}
