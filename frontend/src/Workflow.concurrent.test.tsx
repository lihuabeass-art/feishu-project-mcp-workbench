// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getWorkflowActions } from "./api";
import { itemKey } from "./model";
import { Workflow } from "./Workflow";
import { draftKey, readDraft } from "./workflowDrafts";
import type { CachedItem, WorkflowOptions, WorkflowResult } from "./types";

vi.mock("./api", () => ({ getWorkflowActions: vi.fn() }));
const item = { id: { project_key: "p", work_item_type_key: "story", work_item_id: "1" }, name: "需求" } as CachedItem;
const options: WorkflowOptions = {
  version: "all-v1", action_versions: { "node:confirm:a": "action-a", "node:confirm:b": "action-b" },
  actions: ["a", "b"].map((id) => ({ id: `node:confirm:${id}`, label: `完成节点${id}`, kind: "node",
    fields: [{ key: "doc", label: "文档", kind: "text", required: true, initial_value: "云端文档" }] })),
};
const result = (action: string, outcome: WorkflowResult["outcome"] = "verified"): WorkflowResult => ({
  outcome, verified: outcome === "verified", message: `${action}结果`, request_id: action,
  action_id: `node:confirm:${action}`, resynced: true,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const draft = (id: string) => readDraft(draftKey(itemKey(item), `node:confirm:${id}`));
async function confirm(user: ReturnType<typeof userEvent.setup>, id: string) {
  await user.click(await screen.findByRole("button", { name: `完成节点${id}` }));
  await user.click(screen.getByRole("button", { name: "提交" }));
  await user.click(screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"));
  await user.click(screen.getByRole("button", { name: "确认完成节点" }));
}
beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); vi.mocked(getWorkflowActions).mockResolvedValue(options); });
afterEach(cleanup);

it.each(["verified", "unknown", "rejected"] as const)("A提交期间B可独立填写确认，A的%s迟到结果不清除B核对页和草稿", async (outcome) => {
  const first = deferred<WorkflowResult>();
  const second = deferred<WorkflowResult>();
  const submit = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  render(<Workflow item={item} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  await confirm(user, "a");
  expect(submit).toHaveBeenCalledOnce();
  expect(submit.mock.calls[0][0].version).toBe("action-a");
  expect((screen.getByRole("button", { name: "正在提交…" }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "返回，处理其他操作" }));
  expect((screen.getByRole("button", { name: "完成节点a（正在提交…）" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "完成节点a（正在提交…）" }));
  expect(submit).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "完成节点b" }));
  fireEvent.change(screen.getByLabelText("文档（必填）"), { target: { value: "B草稿" } });
  await user.click(screen.getByRole("button", { name: "提交" }));
  await act(async () => {
    if (outcome === "rejected") first.reject({ kind: "conflict", message: "A云端已变化" });
    else first.resolve(result("a", outcome));
  });
  expect(screen.getByRole("region", { name: "提交前二次确认" }).textContent).toContain("B草稿");
  expect(draft("b")?.fields.doc).toBe("B草稿");
  expect(draft("a")?.pending !== undefined).toBe(outcome === "unknown");
  await user.click(screen.getByLabelText("我已核对填写内容，理解提交后的修改限制"));
  await user.click(screen.getByRole("button", { name: "确认完成节点" }));
  expect(submit).toHaveBeenCalledTimes(2);
  expect(submit.mock.calls[1][0]).toEqual(expect.objectContaining({ action_id: "node:confirm:b", version: "action-b", fields: { doc: "B草稿" } }));
  await act(async () => second.resolve(result("b")));
  await waitFor(() => expect(draft("b")).toBeNull());
  if (outcome === "unknown") {
    await user.click(await screen.findByRole("button", { name: "完成节点a" }));
    expect((screen.getByRole("button", { name: "提交" }) as HTMLButtonElement).disabled).toBe(true);
    expect(draft("a")?.pending).toBeTruthy();
  }
});

it("关闭二次确认时也能在A提交期间返回并提交B，两份提交标记互不覆盖", async () => {
  localStorage.setItem("fstodo.workflow-skip-confirmation.v1", "true");
  const first = deferred<WorkflowResult>(), second = deferred<WorkflowResult>();
  const submit = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  render(<Workflow item={item} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成节点a" }));
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect(submit).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "返回，保留草稿" }));
  await user.click(screen.getByRole("button", { name: "完成节点b" }));
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect(submit).toHaveBeenCalledTimes(2);
  expect(draft("a")?.pending?.action_id).toBe("node:confirm:a");
  expect(draft("b")?.pending?.action_id).toBe("node:confirm:b");
  await act(async () => { first.resolve(result("a")); second.resolve(result("b")); });
});

it.each(["verified", "unknown"] as const)("提交中关闭并重开详情后保留全局防重，原请求%s不影响另一草稿", async (outcome) => {
  const first = deferred<WorkflowResult>();
  const submit = vi.fn().mockReturnValue(first.promise);
  const view = render(<Workflow item={item} available busy={false} submit={submit} />);
  const user = userEvent.setup();
  await confirm(user, "a");
  const requestId = draft("a")?.pending?.request_id;
  view.unmount();
  render(<Workflow item={item} available busy={false} submit={submit} />);
  const active = await screen.findByRole("button", { name: "完成节点a（正在提交…）" });
  expect((active as HTMLButtonElement).disabled).toBe(true);
  await user.click(active);
  expect(screen.queryByRole("button", { name: "重新读取云端，保留草稿" })).toBeNull();
  expect(draft("a")?.pending?.request_id).toBe(requestId);
  await user.click(screen.getByRole("button", { name: "完成节点b" }));
  fireEvent.change(screen.getByLabelText("文档（必填）"), { target: { value: "重开后的B草稿" } });
  await act(async () => first.resolve(result("a", outcome)));
  expect(screen.getByLabelText("文档（必填）")).toHaveProperty("value", "重开后的B草稿");
  expect(draft("b")?.fields.doc).toBe("重开后的B草稿");
  expect(draft("a")?.pending?.request_id).toBe(outcome === "unknown" ? requestId : undefined);
  await user.click(screen.getByRole("button", { name: "返回，保留草稿" }));
  await user.click(screen.getByRole("button", { name: "完成节点a" }));
  expect((screen.getByRole("button", { name: "提交" }) as HTMLButtonElement).disabled).toBe(outcome === "unknown");
  expect(submit).toHaveBeenCalledOnce();
});
