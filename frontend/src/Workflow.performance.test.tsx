// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workflow } from "./Workflow";
import { getWorkflowActions } from "./api";
import { draftKey, writeDraft, readDraft } from "./workflowDrafts";
import { itemKey } from "./model";
import type { CachedItem, WorkflowOptions, WorkflowRequest } from "./types";

vi.mock("./api", () => ({ getWorkflowActions: vi.fn() }));
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); });

it("核实草稿后直接使用刚取得的动作，避免再次请求整套流程", async () => {
  const item = { id: { project_key: "p", work_item_type_key: "story", work_item_id: "1" }, name: "需求" } as CachedItem;
  const options: WorkflowOptions = { version: "v1", actions: [{ id: "a", kind: "node", label: "完成节点", fields: [] }] };
  const pending: WorkflowRequest = { item_id: item.id, action_id: "a", version: "v1", fields: {}, request_id: "r" };
  const key = draftKey(itemKey(item), "a");
  writeDraft(key, { fields: {}, version: "v1", updated_at: Date.now(), pending });
  vi.mocked(getWorkflowActions).mockResolvedValueOnce(options).mockResolvedValueOnce({
    version: "v2", actions: [{ ...options.actions[0], label: "完成新节点" }],
  });
  render(<Workflow item={item} available busy={false} submit={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "完成节点" }));
  await user.click(screen.getByRole("button", { name: "已在飞书核对，重新读取动作" }));
  expect(await screen.findByRole("button", { name: "完成新节点" })).toBeTruthy();
  await waitFor(() => expect(getWorkflowActions).toHaveBeenCalledTimes(2));
  expect(readDraft(key)?.pending).toBeUndefined();
  expect(readDraft(key)?.version).toBe("v1"); // 核实提交结果不能为旧草稿换上最新版本。
});
