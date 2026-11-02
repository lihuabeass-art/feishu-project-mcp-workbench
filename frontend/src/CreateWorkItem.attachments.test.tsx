// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { CreateWorkItem } from "./CreateWorkItem";
import { CreationAttachmentPicker } from "./CreationAttachmentPicker";
import {
  createWorkItem,
  getCreationForm,
  type CreationForm,
  type CreationLocation,
} from "./creation";
import type { CreationAttachment } from "./creationAttachments";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./creation", async (original) => ({
  ...(await original<typeof import("./creation")>()),
  getCreationForm: vi.fn(),
  createWorkItem: vi.fn(),
}));
const target: CreationLocation = {
  source_id: "source",
  project_key: "space",
  type_key: "issue",
  space: "示例空间",
  name: "缺陷",
};
const attachmentField = {
  key: "custom_file",
  label: "附件",
  kind: "attachment",
  required: true,
  multiple: true,
  initial: null,
  options: [],
};
const form = (): CreationForm => ({
  target,
  context: "account",
  version: "v1",
  pending: null,
  fields: [
    {
      key: "name",
      label: "标题",
      kind: "text",
      required: true,
      multiple: false,
      initial: null,
      options: [],
    },
    attachmentField,
  ],
});
const metadata = (name: string, index: string): CreationAttachment => ({
  id: index.repeat(64),
  name,
  mime_type: "application/pdf",
  size: 6,
  file_token: null,
});
const first = metadata("方案.pdf", "a"),
  second = metadata("补充.pdf", "b");
const file = (name: string) =>
  new File(["sample"], name, { type: "application/pdf" });
const show = () =>
  render(
    <CreateWorkItem
      locations={[target]}
      close={vi.fn()}
      created={vi.fn().mockResolvedValue(undefined)}
    />,
  );
const select = async (files: File[]) => {
  fireEvent.change(screen.getByLabelText("选择附件"), { target: { files } });
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "选择文件" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
};
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(invoke).mockReset();
  vi.mocked(getCreationForm).mockResolvedValue(form());
  vi.mocked(createWorkItem).mockResolvedValue({
    outcome: "verified",
    message: "工作事项已创建，并已从飞书回读确认。",
    request_id: "request",
    item_id: {
      project_key: "space",
      work_item_type_key: "issue",
      work_item_id: "42",
    },
    can_verify: false,
  });
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    const values = args as Record<string, string>;
    if (command === "save_creation_attachment")
      return values.fileName === first.name ? first : second;
    if (command === "upload_creation_attachment") {
      const saved = values.attachmentId === first.id ? first : second;
      return { ...saved, file_token: `token-${saved.id}` };
    }
    throw new Error(`unexpected ${command}`);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("创建表单附件", () => {
  it("选择与移除多个附件，关闭再打开恢复，核对显示名称和大小且不上传", async () => {
    const user = userEvent.setup();
    const view = show();
    await user.type(
      await screen.findByRole("textbox", { name: "标题" }),
      "示例缺陷",
    );
    await select([file(first.name), file(second.name)]);
    expect(screen.getByText(first.name)).toBeTruthy();
    expect(screen.getByText(second.name)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: `移除附件 ${first.name}` }),
    );
    expect(screen.queryByText(first.name)).toBeNull();
    view.unmount();
    show();
    await screen.findByText(second.name);
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    const review = document.querySelector<HTMLElement>(".creation-review")!;
    expect(within(review).getByText(second.name)).toBeTruthy();
    expect(within(review).getByText("6 B")).toBeTruthy();
    expect(review.textContent).not.toContain(second.id);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(createWorkItem).not.toHaveBeenCalled();
  });

  it("仅确认后上传全部文件，再提交完整回执，连续创建清空附件", async () => {
    const user = userEvent.setup();
    show();
    await user.type(
      await screen.findByRole("textbox", { name: "标题" }),
      "示例缺陷",
    );
    await select([file(first.name), file(second.name)]);
    await user.click(screen.getByRole("checkbox", { name: "连续创建" }));
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    expect(invoke).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    await screen.findByText("上一条工作事项已创建并核验，可以继续填写下一条。");
    expect(createWorkItem).toHaveBeenCalledOnce();
    expect(
      vi.mocked(createWorkItem).mock.calls[0][0].fields.custom_file,
    ).toEqual([
      { ...first, file_token: `token-${first.id}` },
      { ...second, file_token: `token-${second.id}` },
    ]);
    expect(screen.queryByText(first.name)).toBeNull();
    expect(screen.queryByText(second.name)).toBeNull();
    expect(
      (screen.getByRole("textbox", { name: "标题" }) as HTMLInputElement).value,
    ).toBe("");
  });

  it("后续上传失败不创建，返回编辑保留两份文件和成功回执", async () => {
    const user = userEvent.setup();
    show();
    await user.type(
      await screen.findByRole("textbox", { name: "标题" }),
      "示例缺陷",
    );
    await select([file(first.name), file(second.name)]);
    vi.mocked(invoke)
      .mockResolvedValueOnce({ ...first, file_token: "uploaded-a" })
      .mockRejectedValueOnce(new Error("暂时无法上传附件"));
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "尚未发起创建",
    );
    expect(createWorkItem).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "返回编辑" }));
    expect(screen.getByText(first.name)).toBeTruthy();
    expect(screen.getByText(second.name)).toBeTruthy();
    const draft = JSON.parse(
      localStorage.getItem('fstodo.creation.v1:account:["space","issue"]')!,
    );
    expect(draft.values.custom_file).toEqual([
      { ...first, file_token: "uploaded-a" },
      second,
    ]);
    expect(draft.request).toBeUndefined();
  });

  it("上传后草稿落盘失败时不发起创建，也不继续上传", async () => {
    const user = userEvent.setup();
    show();
    await user.type(
      await screen.findByRole("textbox", { name: "标题" }),
      "示例缺陷",
    );
    await select([file(first.name), file(second.name)]);
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("disk full");
    });
    await user.click(screen.getByRole("button", { name: "确认创建" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "本机草稿未能保存",
    );
    expect(createWorkItem).not.toHaveBeenCalled();
    expect(
      vi
        .mocked(invoke)
        .mock.calls.filter(
          ([command]) => command === "upload_creation_attachment",
        ),
    ).toHaveLength(1);
    expect(screen.getByText(first.name)).toBeTruthy();
  });

  it("选择空文件报错并允许重新选择，必填附件为空时阻止核对", async () => {
    const next = form();
    next.fields = next.fields.map((field) =>
      field.kind === "attachment" ? { ...field, required: true } : field,
    );
    vi.mocked(getCreationForm).mockResolvedValue(next);
    const user = userEvent.setup();
    show();
    await user.type(
      await screen.findByRole("textbox", { name: "标题" }),
      "示例缺陷",
    );
    await select([new File([], "empty.pdf")]);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "附件不能为空",
    );
    expect(invoke).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "核对内容" }));
    expect(screen.getByText("请填写「附件」")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "确认创建" })).toBeNull();
  });

  it("字段账号切换时丢弃迟到的本机保存结果", async () => {
    let finish!: (file: CreationAttachment) => void;
    vi.mocked(invoke).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const changed = vi.fn(),
      busy = vi.fn();
    const view = render(
      <CreationAttachmentPicker
        form={form()}
        field={attachmentField}
        value={[]}
        onChange={changed}
        onBusyChange={busy}
      />,
    );
    fireEvent.change(screen.getByLabelText("选择附件"), {
      target: { files: [file(first.name)] },
    });
    await waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    expect(busy).toHaveBeenCalledWith(true);
    view.rerender(
      <CreationAttachmentPicker
        form={{ ...form(), context: "another-account" }}
        field={attachmentField}
        value={[]}
        onChange={changed}
        onBusyChange={busy}
      />,
    );
    await act(async () => finish(first));
    expect(changed).not.toHaveBeenCalled();
    expect(screen.queryByText(first.name)).toBeNull();
  });
});
