// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ScheduleNodeOwners } from "./ScheduleNodeOwners";

afterEach(cleanup);

it("负责人浮层仅展示头像和姓名，离开后关闭且不使用原生提示", () => {
  render(<ScheduleNodeOwners name="后端代码研发" style={{}} owners={[{ id: "a", name: "杨顺" }, { id: "b", name: "刘悦然" }]} />);
  const node = screen.getByText("后端代码研发");
  expect(node.hasAttribute("title")).toBe(false);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.mouseEnter(node);
  const tooltip = screen.getByRole("tooltip");
  expect([...tooltip.querySelectorAll(".schedule-node-owner > span:last-child")].map((owner) => owner.textContent)).toEqual(["杨顺", "刘悦然"]);
  expect(tooltip.textContent).not.toContain("后端代码研发");
  expect(tooltip.querySelectorAll(".schedule-avatar")).toHaveLength(2);
  expect(tooltip.id).toBe(node.getAttribute("aria-describedby"));
  expect(node.contains(tooltip)).toBe(false);
  fireEvent.mouseLeave(node);
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it("键盘可查看负责人，Escape 和失焦关闭，滚动保持锚定且窗口变化后关闭", () => {
  const page = render(<ScheduleNodeOwners name="研发" style={{}} owners={[{ id: "a", name: "杨顺" }]} />);
  const node = screen.getByText("研发");
  fireEvent.focus(node);
  expect(screen.getByRole("tooltip").querySelector(".schedule-node-owner > span:last-child")?.textContent).toBe("杨顺");
  fireEvent.keyDown(node, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.blur(node);
  fireEvent.focus(node);
  expect(screen.getByRole("tooltip")).toBeTruthy();
  fireEvent.scroll(window);
  expect(screen.getByRole("tooltip")).toBeTruthy();
  fireEvent.resize(window);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.blur(node);
  fireEvent.focus(node);
  fireEvent.blur(node);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.mouseEnter(node);
  page.unmount();
  expect(screen.queryByRole("tooltip")).toBeNull();
});
