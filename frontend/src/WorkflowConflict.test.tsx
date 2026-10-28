// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowConflict } from "./WorkflowConflict";
import type { WorkflowAction } from "./types";

const field: WorkflowAction["fields"][number] = {
  key: "versions",
  label: "代码版本号",
  kind: "textarea",
  required: true,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([
  ["28.000000000000004", "28%"],
  ["37.50000000000001", "37.5%"],
  ["12.3456", "12.35%"],
  ["0", "0%"],
  ["100", "100%"],
])("进度 %s 的云端值和结果预览简洁显示为 %s", async (remote, expected) => {
  const user = userEvent.setup();
  render(
    <WorkflowConflict
      field={{
        ...field,
        key: "progress",
        label: "进度",
        kind: "number",
        unit: "percent",
      }}
      remote={remote}
      value={remote}
    />,
  );
  expect(screen.getByText(expected)).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: "预览进度提交后的飞书内容" }),
  );
  expect(
    screen.getByRole("tooltip").querySelector(".workflow-conflict-value")
      ?.textContent,
  ).toBe(expected);
});

it("普通对照：文本可复制，数值仅恢复；可选留空说明沿用云端，必填留空不宣称沿用", async () => {
  const user = userEvent.setup();
  const copy = vi.spyOn(navigator.clipboard, "writeText");
  const restore = vi.fn();
  const optional = { ...field, kind: "text" as const, required: false };
  const view = render(
    <WorkflowConflict
      field={optional}
      remote="前端：1.2.3"
      value=""
      conflict={false}
      onRestore={restore}
    />,
  );
  const note = screen.getByRole("group", { name: "代码版本号云端对照" });
  expect(note.textContent).toContain("留空沿用云端：前端：1.2.3");
  expect(screen.queryByText(/云端也有修改/)).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "复制代码版本号的云端最新值" }),
  );
  expect(copy).toHaveBeenCalledWith("前端：1.2.3");
  expect(screen.getByRole("status").textContent).toBe("云端最新值已复制");
  await user.click(
    screen.getByRole("button", { name: "将云端值填入代码版本号" }),
  );
  expect(restore).toHaveBeenCalledOnce();
  view.rerender(
    <WorkflowConflict
      field={{ ...optional, required: true }}
      remote="前端：1.2.3"
      value=" "
      conflict={false}
      onRestore={restore}
    />,
  );
  expect(note.textContent).toContain("原值 前端：1.2.3");
  expect(note.textContent).not.toContain("留空沿用云端");
  view.rerender(
    <WorkflowConflict
      field={{ ...optional, kind: "number", label: "估分" }}
      remote="1"
      value="2"
      conflict={false}
      onRestore={restore}
    />,
  );
  const points = screen.getByRole("group", { name: "估分云端对照" });
  expect(within(points).queryByRole("button", { name: /复制/ })).toBeNull();
  expect(
    within(points).getByRole("button", { name: "将估分恢复为原值" }),
  ).toBeTruthy();
});

it("云端多行内容完整复制，云端再次变化后清除旧的复制反馈", async () => {
  const user = userEvent.setup();
  const copy = vi.spyOn(navigator.clipboard, "writeText");
  const remote = "前端：1.2.3\n组件：" + "abcdef0123456789".repeat(20);
  const view = render(
    <WorkflowConflict field={field} remote={remote} value="后端：2.3.4" />,
  );
  expect(
    screen.getByText(remote, { normalizer: (text) => text }).textContent,
  ).toBe(remote);
  await user.click(
    screen.getByRole("button", { name: "复制代码版本号的云端最新值" }),
  );
  expect(copy).toHaveBeenCalledWith(remote);
  expect(screen.getByRole("status").textContent).toBe("云端最新值已复制");
  view.rerender(
    <WorkflowConflict field={field} remote="前端：1.2.4" value="后端：2.3.4" />,
  );
  expect(screen.queryByRole("status")).toBeNull();
  expect(
    screen.getByRole("button", { name: "复制代码版本号的云端最新值" })
      .textContent,
  ).toBe("复制");
});

it("复制失败提供可见反馈，保留云端参考值与本机预览", async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
    new Error("denied"),
  );
  render(
    <WorkflowConflict field={field} remote="前端：1.2.3" value="后端：2.3.4" />,
  );
  await user.click(
    screen.getByRole("button", { name: "复制代码版本号的云端最新值" }),
  );
  expect((await screen.findByRole("status")).textContent).toBe(
    "复制失败，可选中云端值复制。",
  );
  expect(screen.getByText("前端：1.2.3")).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: "预览代码版本号提交后的飞书内容" }),
  );
  expect(screen.getByRole("tooltip").textContent).toContain("后端：2.3.4");
});

it("键盘可打开完整多行预览，编辑后实时更新，Escape 关闭", async () => {
  const user = userEvent.setup();
  const merged = "前端：1.2.3\n后端：2.3.4\n" + "abcdef0123456789".repeat(20);
  const view = render(
    <WorkflowConflict field={field} remote="前端：1.2.3" value={merged} />,
  );
  await user.tab();
  await user.tab();
  const trigger = screen.getByRole("button", {
    name: "预览代码版本号提交后的飞书内容",
  });
  expect(document.activeElement).toBe(trigger);
  expect(screen.getByRole("tooltip").textContent).toContain(merged);
  expect(trigger.getAttribute("aria-describedby")).toBe(
    screen.getByRole("tooltip").id,
  );
  const rewritten = "  重写后的最终版本\n前后端统一：3.0.0  ";
  view.rerender(
    <WorkflowConflict field={field} remote="前端：1.2.3" value={rewritten} />,
  );
  expect(screen.getByRole("tooltip").textContent).toContain(rewritten.trim());
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it("可将鼠标移入预览并选择长内容，离开后自动关闭", async () => {
  const user = userEvent.setup();
  render(
    <WorkflowConflict field={field} remote="前端：1.2.3" value="后端：2.3.4" />,
  );
  const trigger = screen.getByRole("button", {
    name: "预览代码版本号提交后的飞书内容",
  });
  await user.hover(trigger);
  const tooltip = screen.getByRole("tooltip");
  await user.unhover(trigger);
  await user.hover(tooltip);
  expect(screen.getByRole("tooltip")).toBe(tooltip);
  await user.unhover(tooltip);
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
});

it("可选项留空预览保留云端，必填项留空不宣称可以保存", async () => {
  const user = userEvent.setup();
  const view = render(
    <WorkflowConflict
      field={{ ...field, required: false }}
      remote="前端：1.2.3"
      value="  "
    />,
  );
  await user.hover(
    screen.getByRole("button", { name: "预览代码版本号提交后的飞书内容" }),
  );
  expect(screen.getByRole("tooltip").textContent).toContain("前端：1.2.3");
  expect(screen.getByRole("tooltip").textContent).toContain(
    "留空将保留云端内容",
  );
  view.rerender(
    <WorkflowConflict field={field} remote="前端：1.2.3" value="  " />,
  );
  expect(screen.getByRole("tooltip").textContent).toContain(
    "请先填写有效内容。",
  );
  expect(screen.getByRole("tooltip").textContent).not.toContain("提交成功后");
});

it("云端删除草稿所选选项后，预览要求重新选择且不展示无效 ID 为最终结果", async () => {
  const user = userEvent.setup();
  render(
    <WorkflowConflict
      field={{
        ...field,
        kind: "select",
        options: [{ value: "active", label: "有效版本" }],
      }}
      remote="active"
      value="deleted"
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "预览代码版本号提交后的飞书内容" }),
  );
  expect(screen.getByRole("tooltip").textContent).toContain(
    "原选项已不可用，请重新选择。",
  );
  expect(screen.getByRole("tooltip").textContent).not.toContain("提交成功后");
  expect(screen.getByRole("tooltip").textContent).not.toContain("deleted");
});
