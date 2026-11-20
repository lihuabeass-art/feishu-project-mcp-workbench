import { stopLabel } from "./model";
import type { AppError, SyncReport, SyncRun } from "./types";

// 读取错误的技术原文留在诊断台账；界面按稳定错误类别说明下一步。
export function readFailureMessage(kind: string): string {
  switch (kind) {
    case "auth": return "连接凭证已失效，请在连接设置中更新 Token";
    case "credential": return "暂时无法读取连接凭证，请在连接设置中重新保存 Token";
    case "permission": return "没有读取权限，请检查账号在原软件中的访问权限";
    case "config": return "连接配置尚未就绪，请检查连接设置";
    case "connection": return "暂时无法连接服务，请稍后重试";
    case "tool": return "服务暂时无法完成读取，请稍后重试";
    case "store":
    case "storage": return "本地数据暂时无法读取，请重试";
    case "incomplete": return "部分信息尚未获取完成，请稍后刷新";
    case "conflict": return "当前会话或数据状态已变化，请重新读取";
    case "parse": return "已收到服务响应，但内容无法完整解析，请重新读取";
    case "validation": return "读取参数未通过校验，请检查工作来源配置";
    default: return "暂时无法获取最新信息，请稍后重试";
  }
}

export function syncFailureMessage(kind: string, detail = ""): string {
  // 只翻译明确的空间参数失败；出现字段名本身不证明空间缺失。
  if (["tool", "parse", "validation"].includes(kind)) {
    const parameter = "(?:project_key|space_id|asset_key|空间(?:标识|\\s*id))";
    const before = new RegExp(`(?:^|[^\\w])(?:缺少|缺失|未找到|无法获取|无法读取|请传入|请提供|missing|invalid|required)\\s*(?:(?:value|parameter|argument)\\s+(?:for\\s+)?)?[:：]?\\s*["']?(${parameter})(?![\\w])`, "i");
    const after = new RegExp(`(?:^|[^\\w])(${parameter})["']?\\s*[:：]?\\s*(?:(?:is|为)\\s*)?(?:missing|required|invalid|not\\s+found|empty|不能为空|为空|无效|不存在|无法获取|无法读取|未能读取)(?![\\w])`, "i");
    const field = before.exec(detail)?.[1] || after.exec(detail)?.[1];
    if (field) return field.toLowerCase() === "asset_key"
      ? "服务要求的待办查询标识缺失或无效，请检查工作来源配置"
      : "空间上下文未能确认，请检查该账号的空间访问权限";
  }
  return readFailureMessage(kind);
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

export function readFailureNeedsAction(kind: string): boolean {
  return ["auth", "credential", "permission", "config"].includes(kind);
}
