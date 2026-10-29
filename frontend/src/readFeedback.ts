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
    default: return "暂时无法获取最新信息，请稍后重试";
  }
}

export function readFailureNeedsAction(kind: string): boolean {
  return ["auth", "credential", "permission", "config"].includes(kind);
}
