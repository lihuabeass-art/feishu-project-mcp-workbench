// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { CreationForm } from "./creation";
import {
  attachmentBase64,
  creationAttachments,
  maxCreationAttachmentBytes,
  uploadCreationAttachments,
  type CreationAttachment,
} from "./creationAttachments";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const file = (id: string, name: string): CreationAttachment => ({
  id: id.repeat(64),
  name,
  mime_type: "application/pdf",
  size: 6,
  file_token: null,
});
const first = file("a", "方案.pdf"),
  second = file("b", "说明.pdf");
const form: CreationForm = {
  target: { source_id: "source", project_key: "space", type_key: "issue" },
  context: "account",
  version: "v1",
  pending: null,
  fields: [
    {
      key: "custom_file",
      label: "附件",
      kind: "attachment",
      required: false,
      multiple: true,
      initial: null,
      options: [],
    },
  ],
};
beforeEach(() => vi.mocked(invoke).mockReset());

describe("附件上传与草稿契约", () => {
  it("保留文件字节，拒绝空文件和超过上限的文件", async () => {
    expect(await attachmentBase64(new File(["sample"], "方案.pdf"))).toBe(
      "c2FtcGxl",
    );
    await expect(attachmentBase64(new File([], "empty.pdf"))).rejects.toThrow(
      "不能为空",
    );
    const large = new File(["a"], "large.pdf");
    Object.defineProperty(large, "size", {
      value: maxCreationAttachmentBytes + 1,
    });
    await expect(attachmentBase64(large)).rejects.toThrow("8 MB");
  });

  it("无效草稿在上传前拦截", async () => {
    expect(creationAttachments(null)).toEqual([]);
    expect(() => creationAttachments([{ ...first, id: "broken" }])).toThrow(
      "草稿无法读取",
    );
    await expect(
      uploadCreationAttachments(
        form,
        { custom_file: "broken" },
        () => true,
        vi.fn(),
      ),
    ).rejects.toThrow("草稿无法读取");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("逐个上传并保存，每次使用真实字段和账号范围，已有token也交给后端确认", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ ...first, file_token: "token-a" })
      .mockResolvedValueOnce({ ...second, file_token: "token-b" });
    const saved = vi.fn(() => true),
      progress = vi.fn();
    const values = {
      name: "示例事项",
      custom_file: [{ ...first, file_token: "cached" }, second],
    };
    const uploaded = await uploadCreationAttachments(
      form,
      values,
      saved,
      progress,
    );
    expect(invoke).toHaveBeenNthCalledWith(1, "upload_creation_attachment", {
      target: form.target,
      context: form.context,
      fieldKey: "custom_file",
      attachmentId: first.id,
    });
    expect(saved).toHaveBeenCalledTimes(2);
    expect(saved.mock.calls[0]).toEqual([
      {
        name: "示例事项",
        custom_file: [{ ...first, file_token: "token-a" }, second],
      },
    ]);
    expect(uploaded.custom_file).toEqual([
      { ...first, file_token: "token-a" },
      { ...second, file_token: "token-b" },
    ]);
    expect(values.custom_file[0].file_token).toBe("cached");
    expect(progress).toHaveBeenLastCalledWith(2, 2);
  });

  it("后续上传失败保留已保存的回执，不重发前一个上传", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ ...first, file_token: "token-a" })
      .mockRejectedValueOnce(new Error("暂时无法上传"));
    const saved = vi.fn(() => true);
    await expect(
      uploadCreationAttachments(
        form,
        { custom_file: [first, second] },
        saved,
        vi.fn(),
      ),
    ).rejects.toThrow("暂时无法上传");
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(saved).toHaveBeenCalledOnce();
  });

  it("本机保存失败时不上传下一份，不返回可创建的完整字段", async () => {
    vi.mocked(invoke).mockResolvedValue({ ...first, file_token: "token-a" });
    await expect(
      uploadCreationAttachments(
        form,
        { custom_file: [first, second] },
        () => false,
        vi.fn(),
      ),
    ).rejects.toThrow("本机草稿未能保存");
    expect(invoke).toHaveBeenCalledOnce();
  });

  it("上传返回错误文件或缺少token时不写入草稿", async () => {
    const saved = vi.fn(() => true);
    for (const uploaded of [
      first,
      { ...first, name: "wrong.pdf", file_token: "token" },
    ]) {
      vi.mocked(invoke).mockResolvedValue(uploaded);
      await expect(
        uploadCreationAttachments(
          form,
          { custom_file: [first] },
          saved,
          vi.fn(),
        ),
      ).rejects.toThrow("上传结果尚未确认");
    }
    expect(saved).not.toHaveBeenCalled();
  });
});
