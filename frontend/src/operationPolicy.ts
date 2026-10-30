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
  return action === "context" ? Object.values(activity).some(Boolean) : activity[action];
}
