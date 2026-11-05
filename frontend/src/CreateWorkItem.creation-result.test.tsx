// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { CreateWorkItem } from "./CreateWorkItem";
import { createWorkItem, getCreationForm, type CreationForm } from "./creation";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("./creation", async (original) => ({
  ...(await original<typeof import("./creation")>()),
  createWorkItem: vi.fn(),
  getCreationForm: vi.fn(),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const target = { source_id: "source", project_key: "space", type_key: "issue" };
const form: CreationForm = {
    target, context: "account", version: "v1", pending: null,
    fields: [
      { key: "name", label: "缺陷名称", kind: "text", required: true, multiple: false, initial: null, options: [] },
      { key: "description", label: "缺陷描述", kind: "textarea", required: true, multiple: false, initial: null, options: [] },
    ],
};

it("连续创建在确认事项存在后进入新草稿，第二条可编辑并以独立请求创建", async () => {
  localStorage.clear();
  vi.mocked(getCreationForm).mockImplementation(async () => ({ ...form }));
  vi.mocked(createWorkItem).mockImplementation(async (request) => ({
    outcome: "verified", request_id: request.request_id, can_verify: false,
    message: "工作事项已创建，并已从飞书回读确认。",
    item_id: { project_key: "space", work_item_type_key: "issue", work_item_id: String(100 + vi.mocked(createWorkItem).mock.calls.length) },
  }));
  const user = userEvent.setup();
  const created = vi.fn();
  render(<CreateWorkItem locations={[{ ...target, space: "示例空间", name: "缺陷" }]} close={vi.fn()} created={created} />);
  await screen.findByRole("textbox", { name: "缺陷名称" });
  await user.click(screen.getByRole("switch", { name: "连续创建" }));

  for (const number of [1, 2]) {
    const title = await screen.findByRole("textbox", { name: "缺陷名称" });
    expect((title as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("textbox", { name: "缺陷描述" }).textContent).toBe("");
    expect(screen.queryByText("这份草稿仍有待核验的提交")).toBeNull();
    await user.type(title, `第${number}条缺陷`);
    await user.type(screen.getByRole("textbox", { name: "缺陷描述" }), `第${number}条描述`);
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    await waitFor(() => expect(created).toHaveBeenCalledTimes(number));
  }

  await screen.findByRole("textbox", { name: "缺陷名称" });
  expect(createWorkItem).toHaveBeenCalledTimes(2);
  const [first, second] = vi.mocked(createWorkItem).mock.calls.map(([request]) => request);
  expect(first.fields).toMatchObject({ name: "第1条缺陷", description: "第1条描述" });
  expect(second.fields).toMatchObject({ name: "第2条缺陷", description: "第2条描述" });
  expect(second.request_id).not.toBe(first.request_id);
  expect(getCreationForm).toHaveBeenCalledTimes(3);
});

it.each([false, true])("附件追加提示不改变创建成功，并保留提示，连续创建=%s", async (continuous) => {
  localStorage.clear();
  const warning = "事项 101 已创建，但部分附件追加尚未确认，请在飞书核对附件。";
  vi.mocked(getCreationForm).mockImplementation(async () => ({ ...form }));
  vi.mocked(createWorkItem).mockImplementation(async (request) => ({
    outcome: "verified", request_id: request.request_id, can_verify: false, warning,
    message: "工作事项已创建，并已从飞书回读确认。",
    item_id: { project_key: "space", work_item_type_key: "issue", work_item_id: "101" },
  }));
  const user = userEvent.setup();
  const created = vi.fn();
  render(<CreateWorkItem locations={[{ ...target, space: "示例空间", name: "缺陷" }]} close={vi.fn()} created={created} />);
  await user.type(await screen.findByRole("textbox", { name: "缺陷名称" }), "已创建事项");
  await user.type(screen.getByRole("textbox", { name: "缺陷描述" }), "描述");
  if (continuous) await user.click(screen.getByRole("switch", { name: "连续创建" }));
  await user.click(screen.getByRole("button", { name: "核对内容" }));
  await user.click(screen.getByRole("button", { name: "确认创建" }));
  if (continuous) {
    expect(((await screen.findByRole("textbox", { name: "缺陷名称" })) as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("alert").textContent).toContain(warning);
  } else {
    await screen.findByRole("heading", { name: "工作事项已创建" });
    expect(screen.getByText(warning)).toBeTruthy();
  }
  expect(screen.queryByRole("button", { name: "重新核验结果" })).toBeNull();
  expect(createWorkItem).toHaveBeenCalledTimes(1);
});
