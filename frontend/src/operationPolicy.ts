/** Only operations that change the connection/account context exclude other work. */
export type WorkspaceActivity = {
  context: boolean;
  sync: boolean;
  check: boolean;
  discovery: boolean;
  order: boolean;
  workflow: boolean;
  creation: boolean;
};

export function workspaceActionBlocked(action: keyof WorkspaceActivity, activity: WorkspaceActivity): boolean {
  if (activity.context) return true;
  // 流程由事项与动作自行防重，其他流程在途不占用整个工作区。
  if (action === "workflow") return false;
  return action === "context" ? Object.values(activity).some(Boolean) : activity[action];
}
