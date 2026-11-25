// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ScheduleNodeOwners, ScheduleParallelNodesSummary } from "./ScheduleNodeOwners";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it("负责人浮层仅展示头像和姓名，离开后关闭且不使用原生提示", () => {
  render(<ScheduleNodeOwners name="后端代码研发" style={{}} isCurrentOwner owners={[{ id: "a", name: "杨顺" }, { id: "b", name: "刘悦然" }]} />);
  const node = screen.getByText("后端代码研发");
  expect(node.classList.contains("is-mine")).toBe(true);
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

it("并行节点聚合徽标在悬停与聚焦时按顺序展示全部并行节点及负责人", () => {
  const nodes = [
    { id: "qa", name: "测试用例设计", style: { "--schedule-node-hue": 140 } as React.CSSProperties, owners: [{ id: "u1", name: "施伟" }] },
    { id: "be", name: "后端代码研发", style: { "--schedule-node-hue": 205 } as React.CSSProperties, owners: [{ id: "me", name: "本人" }], isCurrentOwner: true },
    { id: "fe", name: "前端代码研发", style: { "--schedule-node-hue": 285 } as React.CSSProperties, owners: [{ id: "u2", name: "刘悦然" }] },
  ];
  render(<ScheduleParallelNodesSummary nodes={nodes} hiddenNodes={[nodes[0], nodes[2]]} />);
  const badge = screen.getByText("+2 并行").closest(".schedule-current-nodes-more") as HTMLElement;
  expect(badge.hasAttribute("title")).toBe(false);
  expect(badge.querySelectorAll(".schedule-more-dots > span")).toHaveLength(2);
  fireEvent.focus(badge);
  const tooltip = screen.getByRole("tooltip");
  expect([...tooltip.querySelectorAll(".schedule-parallel-node-name")].map((el) => el.textContent))
    .toEqual(["测试用例设计", "后端代码研发", "前端代码研发"]);
  expect(tooltip.querySelector(".schedule-parallel-node-row.is-mine .schedule-parallel-node-name")?.textContent).toBe("后端代码研发");
  expect([...tooltip.querySelectorAll(".schedule-node-owner > span:last-child")].map((el) => el.textContent))
    .toEqual(["施伟", "本人", "刘悦然"]);
  fireEvent.keyDown(badge, { key: "Escape" });
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

it("并行节点浮层可移入滚动，边界滚轮不穿透，键盘焦点移入后仍可查看并关闭", () => {
  vi.useFakeTimers();
  const nodes = Array.from({ length: 40 }, (_, index) => ({ id: String(index), name: `节点 ${index}`, style: {}, owners: [{ id: `u${index}`, name: `负责人 ${index}` }] }));
  render(<ScheduleParallelNodesSummary nodes={nodes} hiddenNodes={nodes.slice(1)} />);
  const badge = screen.getByText("+39 并行").closest(".schedule-current-nodes-more") as HTMLElement;
  fireEvent.mouseEnter(badge);
  const tooltip = screen.getByRole("tooltip");
  fireEvent.mouseLeave(badge);
  fireEvent.mouseEnter(tooltip);
  act(() => vi.advanceTimersByTime(150));
  expect(screen.getByRole("tooltip").querySelectorAll(".schedule-parallel-node-row")).toHaveLength(40);
  const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100 });
  tooltip.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(true);
  act(() => badge.focus());
  fireEvent.keyDown(badge, { key: "ArrowDown" });
  expect(document.activeElement).toBe(tooltip);
  fireEvent.mouseLeave(tooltip);
  act(() => vi.advanceTimersByTime(150));
  expect(screen.getByRole("tooltip")).toBeTruthy();
  fireEvent.keyDown(tooltip, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(document.activeElement).toBe(badge);
});
