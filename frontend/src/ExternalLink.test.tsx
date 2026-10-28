// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { BusinessField } from "./BusinessField";
import { FieldValue } from "./WorkItemDetails";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn() }));
const url = "https://example.feishu.cn/drive/folder/abc?from=from_copylink";
const itemId = {
  project_key: "p",
  work_item_type_key: "issue",
  work_item_id: "1",
};
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockResolvedValue(undefined);
});
afterEach(cleanup);

it.each([
  url,
  `[产品设计文档](${url})`,
  `<a href="${url}">产品设计文档</a>`,
  { type: "hyperlink", url, text: "产品设计文档" },
  { type: "application/pdf", url, name: "产品设计文档" },
  "![旧图片](http://example.com/a.png)",
])("业务字段各类链接交给系统浏览器：%j", async (value) => {
  render(<BusinessField itemId={itemId} fieldKey="f" value={value} />);
  const link = screen.getByRole("link");
  expect(fireEvent.click(link)).toBe(false);
  expect(invoke).toHaveBeenCalledWith("open_external_url", {
    url: link.getAttribute("href"),
    newWindow: true,
  });
});

it("详情网址支持键盘激活和中键，并保留查询参数", async () => {
  render(<FieldValue value={url} />);
  const link = screen.getByRole("link");
  link.focus();
  await userEvent.keyboard("{Enter}");
  expect(invoke).toHaveBeenCalledWith("open_external_url", {
    url,
    newWindow: true,
  });
  expect(
    fireEvent(
      link,
      new MouseEvent("auxclick", {
        button: 1,
        bubbles: true,
        cancelable: true,
      }),
    ),
  ).toBe(false);
  expect(invoke).toHaveBeenCalledTimes(2);
  fireEvent(
    link,
    new MouseEvent("auxclick", { button: 2, bubbles: true, cancelable: true }),
  );
  expect(invoke).toHaveBeenCalledTimes(2);
});

it("浏览器预览保留原生链接行为", () => {
  vi.mocked(isTauri).mockReturnValue(false);
  render(<FieldValue value={url} />);
  const link = screen.getByRole("link");
  // 记录处理器是否阻止默认行为，同时避免 jsdom 实际导航。
  let prevented = true;
  const stopNavigation = (event: Event) => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", stopNavigation);
  fireEvent.click(link);
  document.removeEventListener("click", stopNavigation);
  expect(prevented).toBe(false);
  expect(invoke).not.toHaveBeenCalled();
  expect(link.getAttribute("target")).toBe("_blank");
});

it("已有链接在切换设置后立即使用已有浏览器，再切回新窗口", () => {
  render(<FieldValue value={url} />);
  const link = screen.getByRole("link");
  localStorage.setItem("fstodo.link-opening-mode.v1", "existing-browser");
  fireEvent.click(link);
  expect(invoke).toHaveBeenLastCalledWith("open_external_url", {
    url,
    newWindow: false,
  });
  localStorage.setItem("fstodo.link-opening-mode.v1", "new-window");
  fireEvent.click(link);
  expect(invoke).toHaveBeenLastCalledWith("open_external_url", {
    url,
    newWindow: true,
  });
});

it("系统打开失败时显示可重试的提示", async () => {
  vi.mocked(invoke).mockRejectedValueOnce(
    "链接打开失败：无法新建默认浏览器窗口",
  );
  render(<FieldValue value={url} />);
  await userEvent.click(screen.getByRole("link"));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "无法新建默认浏览器窗口",
  );
  await userEvent.click(screen.getByRole("link"));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("业务字段不把可执行协议呈现为链接", () => {
  render(
    <BusinessField
      itemId={itemId}
      fieldKey="f"
      value={
        '[危险链接](javascript:alert%281%29)\n\n<a href="file:///C:/secret">本地文件</a>'
      }
    />,
  );
  expect(screen.queryByRole("link")).toBeNull();
  expect(invoke).not.toHaveBeenCalled();
});
