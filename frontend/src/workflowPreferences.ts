import { useSyncExternalStore } from "react";

export const workflowSkipConfirmationKey =
  "fstodo.workflow-skip-confirmation.v1";
const changeEvent = "fstodo-workflow-confirmation-change";

export function loadWorkflowSkipConfirmation(): boolean {
  try {
    return localStorage.getItem(workflowSkipConfirmationKey) === "true";
  } catch {
    return false;
  }
}

export function saveWorkflowSkipConfirmation(value: boolean): void {
  localStorage.setItem(workflowSkipConfirmationKey, String(value));
  window.dispatchEvent(new Event(changeEvent));
}

function subscribe(changed: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === workflowSkipConfirmationKey || event.key === null)
      changed();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(changeEvent, changed);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(changeEvent, changed);
  };
}

export function useWorkflowSkipConfirmation(): boolean {
  return useSyncExternalStore(subscribe, loadWorkflowSkipConfirmation);
}
