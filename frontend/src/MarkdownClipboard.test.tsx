// @vitest-environment jsdom
import { useLayoutEffect, useState } from "react";
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MarkdownClipboard,
  type MarkdownClipboardProps,
} from "./MarkdownClipboard";
import { editorMarkdown, setEditorSelection } from "./markdownEditor";
import {
  getCreationImage,
  getUploadedCreationImage,
  saveCreationImage,
  uploadCreationImage,
  type CreationImagePreview,
} from "./creationImages";

vi.mock("./creationImages", async (original) => ({
  ...(await original<typeof import("./creationImages")>()),
  saveCreationImage: vi.fn(),
  getCreationImage: vi.fn(),
  getUploadedCreationImage: vi.fn(),
  uploadCreationImage: vi.fn(),
}));
const imageId = "a".repeat(64),
  otherImageId = "b".repeat(64);
const localUrl = `fstodo-image:${imageId}`;
const imageMarkdown = `![截图](${localUrl})`;
const remoteUrl = "https://project.feishu.cn/example.png",
  fileToken = "fixture_file_token";
const dataUrl = "data:image/png;base64,aW1hZ2U=";
const scope = {
  target: { source_id: "source", project_key: "space", type_key: "issue" },
  context: "account-cache",
  fieldKey: "description",
};
const file = () => new File(["image"], "clipboard.png", { type: "image/png" });
function pasteImage(control: HTMLElement, image = file()) {
  const event = createEvent.paste(control, {
    clipboardData: {
      items: [{ kind: "file", getAsFile: () => image }],
      files: [image],
    },
  });
  fireEvent(control, event);
  return event;
}
function pasteText(control: HTMLElement, text: string, html = "") {
  const event = createEvent.paste(control, {
    clipboardData: {
      items: [],
      files: [],
      getData: (format: string) => (format === "text/plain" ? text : html),
    },
  });
  fireEvent(control, event);
  return event;
}
function select(control: HTMLElement, start: number, end = start) {
  control.focus();
  setEditorSelection(control, start, end);
}
function nativeInput(control: HTMLElement, text: string) {
  control.replaceChildren(document.createTextNode(text));
  fireEvent.input(control);
}
function Harness({
  initial = "",
  changed = vi.fn(),
  ...rest
}: Partial<MarkdownClipboardProps> & {
  initial?: string;
  changed?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <MarkdownClipboard
      id="markdown"
      ariaLabel="缺陷描述"
      {...scope}
      {...rest}
      value={value}
      onChange={(next) => {
        changed(next);
        setValue(next);
      }}
    />
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(saveCreationImage).mockResolvedValue({
    image_id: imageId,
    markdown_url: localUrl,
  });
  vi.mocked(getCreationImage).mockResolvedValue({
    data_url: dataUrl,
    uploaded_url: null,
    uploaded_token: null,
  });
  vi.mocked(getUploadedCreationImage).mockResolvedValue({
    data_url: dataUrl,
    uploaded_url: remoteUrl,
    uploaded_token: fileToken,
  });
  vi.mocked(uploadCreationImage).mockResolvedValue({
    url: remoteUrl,
    file_token: fileToken,
  });
});
afterEach(cleanup);

describe("Markdown 图片编辑", () => {
  it("普通粘贴只插入纯文本，保留换行和选区，不执行HTML", () => {
    const changed = vi.fn();
    render(<Harness initial="前替换后" changed={changed} />);
    const control = screen.getByRole("textbox");
    select(control, 1, 3);
    expect(
      pasteText(
        control,
        "<img src=x onerror=alert(1)>\n第二行",
        "<b>网页HTML</b>",
      ).defaultPrevented,
    ).toBe(true);
    expect(editorMarkdown(control)).toBe(
      "前<img src=x onerror=alert(1)>\n第二行后",
    );
    expect(control.querySelector("img,b,script")).toBeNull();
    expect(changed).toHaveBeenLastCalledWith(
      "前<img src=x onerror=alert(1)>\n第二行后",
    );
    expect(saveCreationImage).not.toHaveBeenCalled();
    expect(uploadCreationImage).not.toHaveBeenCalled();
  });

  it("截图保存后在原选区直接显示图片，正文保留引用，界面不露源码也不上传", async () => {
    const changed = vi.fn();
    const busy = vi.fn();
    render(
      <Harness initial="前替换后" changed={changed} onBusyChange={busy} />,
    );
    const control = screen.getByRole("textbox");
    select(control, 1, 3);
    pasteImage(control);
    const image = await screen.findByAltText("截图 1");
    expect(image.getAttribute("src")).toBe(dataUrl);
    expect(editorMarkdown(control)).toBe(`前${imageMarkdown}后`);
    expect(control.textContent).not.toContain("fstodo-image:");
    expect(control.textContent).not.toContain("![截图]");
    expect(control.querySelector('[contenteditable="false"]')).toBeTruthy();
    expect(saveCreationImage).toHaveBeenCalledWith(
      scope,
      "aW1hZ2U=",
      "image/png",
      "clipboard.png",
    );
    expect(
      changed.mock.calls.every(
        ([value]) => !String(value).includes("data:image"),
      ),
    ).toBe(true);
    expect(uploadCreationImage).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /上传图片/ })).toBeNull();
    expect(busy).toHaveBeenCalledWith(true);
    expect(busy).toHaveBeenLastCalledWith(false);
  });

  it("关闭重开读取本机图片，即使缓存已有上传链接也不更改正文或自动上传", async () => {
    vi.mocked(getCreationImage).mockResolvedValue({
      data_url: dataUrl,
      uploaded_url: remoteUrl,
      uploaded_token: fileToken,
    });
    const changed = vi.fn();
    const first = render(<Harness initial={imageMarkdown} changed={changed} />);
    await screen.findByAltText("截图 1");
    first.unmount();
    render(<Harness initial={imageMarkdown} changed={changed} />);
    await screen.findByAltText("截图 1");
    expect(editorMarkdown(screen.getByRole("textbox"))).toBe(imageMarkdown);
    expect(changed).not.toHaveBeenCalled();
    expect(getCreationImage).toHaveBeenLastCalledWith(scope, imageId);
    expect(uploadCreationImage).not.toHaveBeenCalled();
  });

  it("可只删除指定图片且保留前后文字和另一张图，撤销重做仍保留完整图片引用", async () => {
    const second = `![截图](fstodo-image:${otherImageId})`;
    const initial = `前${imageMarkdown}中${second}后`;
    render(<Harness initial={initial} />);
    await screen.findByAltText("截图 2");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "删除图片 1" }));
    const control = screen.getByRole("textbox");
    expect(editorMarkdown(control)).toBe(`前中${second}后`);
    expect(control.querySelectorAll("img")).toHaveLength(1);
    fireEvent.keyDown(control, { key: "z", ctrlKey: true });
    expect(editorMarkdown(control)).toBe(initial);
    expect(control.querySelectorAll("img")).toHaveLength(2);
    fireEvent.keyDown(control, { key: "z", ctrlKey: true, shiftKey: true });
    expect(editorMarkdown(control)).toBe(`前中${second}后`);
    expect(uploadCreationImage).not.toHaveBeenCalled();
  });

  it("图片保存期间继续输入，迟到结果在当前光标插入并保留新文字", async () => {
    let finish!: (value: { image_id: string; markdown_url: string }) => void;
    vi.mocked(saveCreationImage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<Harness initial="原文" />);
    const control = screen.getByRole("textbox");
    select(control, 2);
    pasteImage(control);
    await waitFor(() => expect(saveCreationImage).toHaveBeenCalledOnce());
    nativeInput(control, "原文继续输入");
    select(control, 6);
    await act(async () =>
      finish({ image_id: imageId, markdown_url: localUrl }),
    );
    await screen.findByAltText("截图 1");
    expect(editorMarkdown(control)).toBe(`原文继续输入${imageMarkdown}`);
  });

  it("保存回执在输入法组合期间到达时保持活动文本节点，结束后才插图并释放busy", async () => {
    let finish!: (value: { image_id: string; markdown_url: string }) => void;
    vi.mocked(saveCreationImage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const busy = vi.fn();
    render(<Harness initial="原文" onBusyChange={busy} />);
    const control = screen.getByRole("textbox");
    select(control, 2);
    pasteImage(control);
    await waitFor(() => expect(saveCreationImage).toHaveBeenCalledOnce());
    const text = control.firstChild as Text;
    fireEvent.compositionStart(control);
    text.data = "原文中";
    fireEvent.input(control, {
      inputType: "insertCompositionText",
      isComposing: true,
    });
    await act(async () =>
      finish({ image_id: imageId, markdown_url: localUrl }),
    );
    expect(control.firstChild).toBe(text);
    expect(text.isConnected).toBe(true);
    expect(editorMarkdown(control)).toBe("原文中");
    expect(screen.queryByAltText("截图 1")).toBeNull();
    expect(busy).toHaveBeenLastCalledWith(true);
    text.data = "原文中文";
    fireEvent.input(control, {
      inputType: "insertCompositionText",
      isComposing: true,
    });
    setEditorSelection(control, 4);
    fireEvent.compositionEnd(control);
    await screen.findByAltText("截图 1");
    expect(editorMarkdown(control)).toBe(`原文中文${imageMarkdown}`);
    expect(busy).toHaveBeenLastCalledWith(false);
    expect(saveCreationImage).toHaveBeenCalledOnce();
    expect(uploadCreationImage).not.toHaveBeenCalled();
  });

  it.each(["切换作用域", "卸载"])(
    "等待输入法结束时%s会取消待插入任务并释放busy",
    async (action) => {
      let finish!: (value: { image_id: string; markdown_url: string }) => void;
      vi.mocked(saveCreationImage).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const changed = vi.fn(),
        busy = vi.fn();
      const rendered = render(
        <MarkdownClipboard
          id="markdown"
          ariaLabel="说明"
          {...scope}
          value="旧表单"
          onChange={changed}
          onBusyChange={busy}
        />,
      );
      const control = screen.getByRole("textbox");
      select(control, 3);
      pasteImage(control);
      await waitFor(() => expect(saveCreationImage).toHaveBeenCalledOnce());
      fireEvent.compositionStart(control);
      (control.firstChild as Text).data = "旧表单中";
      fireEvent.input(control, {
        inputType: "insertCompositionText",
        isComposing: true,
      });
      await act(async () =>
        finish({ image_id: imageId, markdown_url: localUrl }),
      );
      expect(busy).toHaveBeenLastCalledWith(true);
      changed.mockClear();
      if (action === "卸载") rendered.unmount();
      else
        rendered.rerender(
          <MarkdownClipboard
            id="markdown"
            ariaLabel="说明"
            {...scope}
            target={{ ...scope.target, type_key: "another" }}
            value="新表单"
            onChange={changed}
            onBusyChange={busy}
          />,
        );
      await act(async () => {});
      expect(busy).toHaveBeenLastCalledWith(false);
      expect(changed).not.toHaveBeenCalled();
      expect(getCreationImage).not.toHaveBeenCalled();
      if (action !== "卸载") {
        fireEvent.compositionEnd(screen.getByRole("textbox"));
        expect(editorMarkdown(screen.getByRole("textbox"))).toBe("新表单");
        expect(screen.queryByAltText("截图 1")).toBeNull();
      }
    },
  );

  it("等待组合完成后的多图粘贴逐张保存，后一张失败也保留已插入图片和完整中文", async () => {
    let finish!: (value: { image_id: string; markdown_url: string }) => void;
    vi.mocked(saveCreationImage)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error("第二张截图保存失败"));
    const busy = vi.fn();
    render(<Harness initial="说明" onBusyChange={busy} />);
    const control = screen.getByRole("textbox");
    select(control, 2);
    const files = [file(), file()];
    fireEvent.paste(control, {
      clipboardData: {
        items: files.map((image) => ({ kind: "file", getAsFile: () => image })),
        files,
      },
    });
    await waitFor(() => expect(saveCreationImage).toHaveBeenCalledOnce());
    fireEvent.compositionStart(control);
    (control.firstChild as Text).data = "说明中文";
    fireEvent.input(control, {
      inputType: "insertCompositionText",
      isComposing: true,
    });
    setEditorSelection(control, 4);
    await act(async () =>
      finish({ image_id: imageId, markdown_url: localUrl }),
    );
    expect(saveCreationImage).toHaveBeenCalledOnce();
    fireEvent.compositionEnd(control);
    await screen.findByAltText("截图 1");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "第二张截图保存失败",
    );
    expect(editorMarkdown(control)).toBe(`说明中文${imageMarkdown}`);
    expect(saveCreationImage).toHaveBeenCalledTimes(2);
    expect(busy).toHaveBeenLastCalledWith(false);
  });

  it("保存失败保留最新正文，不插入失效图片引用", async () => {
    vi.mocked(saveCreationImage).mockRejectedValueOnce(
      new Error("本机存储空间不足"),
    );
    const changed = vi.fn();
    render(<Harness initial="保留原文" changed={changed} />);
    const control = screen.getByRole("textbox");
    select(control, 4);
    pasteImage(control);
    await screen.findByRole("alert");
    expect(editorMarkdown(control)).toBe("保留原文");
    expect(changed).not.toHaveBeenCalled();
    expect(control.querySelector("img")).toBeNull();
  });

  it("切换类型后忽略上一表单迟到的保存结果", async () => {
    let finish!: (value: { image_id: string; markdown_url: string }) => void;
    vi.mocked(saveCreationImage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const changed = vi.fn();
    const busy = vi.fn();
    const rendered = render(
      <MarkdownClipboard
        id="markdown"
        ariaLabel="说明"
        {...scope}
        value="旧表单"
        onChange={changed}
        onBusyChange={busy}
      />,
    );
    const control = screen.getByRole("textbox");
    select(control, 3);
    pasteImage(control);
    await waitFor(() => expect(saveCreationImage).toHaveBeenCalledOnce());
    rendered.rerender(
      <MarkdownClipboard
        id="markdown"
        ariaLabel="说明"
        {...scope}
        target={{ ...scope.target, type_key: "story" }}
        value="新表单"
        onChange={changed}
        onBusyChange={busy}
      />,
    );
    await act(async () =>
      finish({ image_id: imageId, markdown_url: localUrl }),
    );
    expect(editorMarkdown(screen.getByRole("textbox"))).toBe("新表单");
    expect(changed).not.toHaveBeenCalled();
    expect(screen.queryByAltText("截图 1")).toBeNull();
    expect(busy).toHaveBeenLastCalledWith(false);
  });

  it("同一图片编号跨作用域切换首帧不显示旧预览，旧读取响应也不污染新表单", async () => {
    const frame = vi.fn();
    let finish!: (value: CreationImagePreview) => void;
    function Scoped({ typeKey }: { typeKey: string }) {
      useLayoutEffect(() => {
        frame(screen.queryByAltText("截图 1"));
      }, [typeKey]);
      return (
        <MarkdownClipboard
          id="markdown"
          ariaLabel="说明"
          {...scope}
          target={{ ...scope.target, type_key: typeKey }}
          value={imageMarkdown}
          onChange={vi.fn()}
        />
      );
    }
    const rendered = render(<Scoped typeKey="issue" />);
    await screen.findByAltText("截图 1");
    vi.mocked(getCreationImage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    rendered.rerender(<Scoped typeKey="story" />);
    expect(frame).toHaveBeenLastCalledWith(null);
    expect(screen.queryByAltText("截图 1")).toBeNull();
    rendered.rerender(
      <MarkdownClipboard
        id="markdown"
        ariaLabel="说明"
        {...scope}
        target={{ ...scope.target, type_key: "third" }}
        value="另一个表单"
        onChange={vi.fn()}
      />,
    );
    await act(async () =>
      finish({
        data_url: dataUrl,
        uploaded_url: remoteUrl,
        uploaded_token: fileToken,
      }),
    );
    expect(screen.queryByAltText("截图 1")).toBeNull();
    expect(editorMarkdown(screen.getByRole("textbox"))).toBe("另一个表单");
  });

  it("带文件token的已上传图片从本机缓存恢复，保留token且不外连", async () => {
    const markdown = `前![截图](${remoteUrl})<!--${fileToken}-->后`;
    const changed = vi.fn();
    render(<Harness initial={markdown} changed={changed} />);
    expect((await screen.findByAltText("截图 1")).getAttribute("src")).toBe(
      dataUrl,
    );
    expect(getUploadedCreationImage).toHaveBeenCalledWith(
      scope,
      remoteUrl,
      fileToken,
    );
    expect(editorMarkdown(screen.getByRole("textbox"))).toBe(markdown);
    expect(screen.getByRole("textbox").textContent).not.toContain(fileToken);
    expect(changed).not.toHaveBeenCalled();
    expect(uploadCreationImage).not.toHaveBeenCalled();
  });

  it("外部图片没有本机token时展示替代信息，不请求图片地址或标成草稿损坏", async () => {
    render(<Harness initial={`正文![外部示意图](${remoteUrl})`} />);
    await screen.findByText("外部图片，创建后可在飞书查看");
    expect(screen.getByRole("textbox").querySelector("img")).toBeNull();
    expect(getCreationImage).not.toHaveBeenCalled();
    expect(getUploadedCreationImage).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("中文输入法输入期间不重建文本节点，组合结束后可一次撤销", () => {
    const changed = vi.fn();
    render(<Harness initial="说明" changed={changed} />);
    const control = screen.getByRole("textbox");
    select(control, 2);
    const text = control.firstChild as Text;
    fireEvent.compositionStart(control);
    text.data = "说明中";
    fireEvent.input(control, {
      inputType: "insertCompositionText",
      isComposing: true,
    });
    expect(control.firstChild).toBe(text);
    const enter = createEvent.keyDown(control, {
      key: "Enter",
      keyCode: 229,
      isComposing: true,
    });
    fireEvent(control, enter);
    expect(enter.defaultPrevented).toBe(false);
    text.data = "说明中文";
    fireEvent.input(control, {
      inputType: "insertCompositionText",
      isComposing: true,
    });
    fireEvent.compositionEnd(control);
    expect(control.firstChild).toBe(text);
    expect(editorMarkdown(control)).toBe("说明中文");
    expect(changed).toHaveBeenLastCalledWith("说明中文");
    fireEvent.keyDown(control, { key: "z", ctrlKey: true });
    expect(editorMarkdown(control)).toBe("说明");
  });

  it("回车保留换行，Delete和Backspace整张删除图片，不留下半条引用", async () => {
    render(<Harness initial={`前${imageMarkdown}后`} />);
    await screen.findByAltText("截图 1");
    const control = screen.getByRole("textbox");
    select(control, 1);
    fireEvent.keyDown(control, { key: "Delete" });
    expect(editorMarkdown(control)).toBe("前后");
    fireEvent.keyDown(control, { key: "z", ctrlKey: true });
    select(control, 1 + imageMarkdown.length);
    fireEvent.keyDown(control, { key: "Backspace" });
    expect(editorMarkdown(control)).toBe("前后");
    select(control, 1);
    fireEvent.keyDown(control, { key: "Enter" });
    pasteText(control, "新行");
    expect(editorMarkdown(control)).toBe("前\n新行后");
  });

  it("复制剪切保留Markdown与图片token，剪切后可撤销恢复", async () => {
    const markdown = `前![截图](${remoteUrl})<!--${fileToken}-->后`;
    render(<Harness initial={markdown} />);
    await screen.findByAltText("截图 1");
    const control = screen.getByRole("textbox");
    select(control, 0, markdown.length);
    const setData = vi.fn();
    fireEvent.copy(control, { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith("text/plain", markdown);
    fireEvent.cut(control, { clipboardData: { setData } });
    expect(editorMarkdown(control)).toBe("");
    fireEvent.keyDown(control, { key: "z", ctrlKey: true });
    expect(editorMarkdown(control)).toBe(markdown);
  });

  it("拒绝SVG与超限图片，禁用状态也不保存或改写正文", async () => {
    const rendered = render(<Harness initial="保留内容" />);
    const control = screen.getByRole("textbox");
    pasteImage(
      control,
      new File(["<svg />"], "image.svg", { type: "image/svg+xml" }),
    );
    expect(screen.getByRole("alert").textContent).toContain("仅支持 PNG");
    pasteImage(
      control,
      new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.png", {
        type: "image/png",
      }),
    );
    expect(screen.getByRole("alert").textContent).toContain("不能超过 8 MB");
    rendered.rerender(<Harness initial="保留内容" disabled />);
    pasteImage(control);
    pasteText(control, "不能插入");
    expect(editorMarkdown(control)).toBe("保留内容");
    expect(saveCreationImage).not.toHaveBeenCalled();
    expect(control.getAttribute("contenteditable")).toBe("false");
  });
});
