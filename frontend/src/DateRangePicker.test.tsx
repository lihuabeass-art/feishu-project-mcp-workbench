// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateRangePicker } from "./DateRangePicker";

function Harness({
  start = "2026-11-02",
  end = "2026-11-03",
  disabled = false,
}) {
  const [value, setValue] = useState({ start, end });
  return (
    <form>
      <DateRangePicker
        {...value}
        startLabel="开始日期"
        endLabel="结束日期"
        startRequired
        endRequired
        disabled={disabled}
        onChange={(start, end) => setValue({ start, end })}
      />
      <button type="button">其他操作</button>
    </form>
  );
}

const input = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const day = (value: string) =>
  screen.getByRole("button", { name: new RegExp(`^${value}，`) });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("同一日历连续选择开始和结束，选开始时清空旧结束，选完后回到结束输入框", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(input("开始日期"));
  await user.click(day("2026年11月5日"));
  expect(input("开始日期").value).toBe("2026-11-05");
  expect(input("结束日期").value).toBe("");
  expect(screen.getByRole("dialog").textContent).toContain("请选择结束日期");
  await user.click(day("2026年11月9日"));
  expect(input("结束日期").value).toBe("2026-11-09");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(input("结束日期"));
});

it("等待结束时也能重选开始，之后继续选择结束；只改结束不会改变开始", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(input("开始日期"));
  await user.click(day("2026年11月5日"));
  await user.click(input("开始日期"));
  await user.click(day("2026年11月7日"));
  expect(input("开始日期").value).toBe("2026-11-07");
  expect(input("结束日期").value).toBe("");
  await user.click(day("2026年11月10日"));
  await user.click(input("结束日期"));
  await user.click(day("2026年11月12日"));
  expect(input("开始日期").value).toBe("2026-11-07");
  expect(input("结束日期").value).toBe("2026-11-12");
});

it("结束阶段选更早日期会重设起点，并支持起止同一天", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(input("开始日期"));
  await user.click(day("2026年11月9日"));
  await user.click(day("2026年11月6日"));
  expect(input("开始日期").value).toBe("2026-11-06");
  expect(input("结束日期").value).toBe("");
  expect(screen.getByRole("dialog").textContent).toContain("请选择结束日期");
  await user.click(day("2026年11月6日"));
  expect(input("结束日期").value).toBe("2026-11-06");
});

it("单月日历跨年翻页仍接着选择结束，日期不发生时区偏移", async () => {
  const user = userEvent.setup();
  render(<Harness start="2026-12-31" end="2027-01-02" />);
  await user.click(input("开始日期"));
  await user.click(day("2026年12月31日"));
  await user.click(screen.getByRole("button", { name: "下个月" }));
  expect(screen.getByRole("dialog").textContent).toContain("请选择结束日期");
  await user.click(day("2027年1月2日"));
  expect(input("开始日期").value).toBe("2026-12-31");
  expect(input("结束日期").value).toBe("2027-01-02");
});

it("方向键跨月和 Enter 可连续选起止，Escape 关闭后返回输入框", async () => {
  const user = userEvent.setup();
  render(<Harness start="2026-11-30" end="2026-12-03" />);
  input("开始日期").focus();
  await user.keyboard("{ArrowDown}{ArrowRight}");
  expect(document.activeElement).toBe(day("2026年12月1日"));
  await user.keyboard("{Enter}");
  expect(input("开始日期").value).toBe("2026-12-01");
  expect(document.activeElement).toBe(day("2026年12月1日"));
  await user.keyboard("{ArrowRight}{Enter}");
  expect(input("结束日期").value).toBe("2026-12-02");
  expect(document.activeElement).toBe(input("结束日期"));
  await user.keyboard("{ArrowDown}{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(input("结束日期"));
});

it("手工输入可只修改开始，保留原结束；结束早于开始时阻止表单提交", async () => {
  render(<Harness />);
  fireEvent.change(input("开始日期"), { target: { value: "2026-11-01" } });
  expect(input("结束日期").value).toBe("2026-11-03");
  fireEvent.change(input("结束日期"), { target: { value: "2026-10-30" } });
  expect(screen.getByRole("alert").textContent).toBe(
    "结束日期不能早于开始日期",
  );
  expect(input("结束日期").checkValidity()).toBe(false);
  fireEvent.change(input("结束日期"), { target: { value: "2026-11-02" } });
  expect(input("结束日期").checkValidity()).toBe(true);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("Portal 日历隔离标题、日期和留白处的滚轮，关闭清理监听且背景恢复滚动", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(input("开始日期"));
  const popup = screen.getByRole("dialog");
  for (const target of [
    popup,
    screen.getByText("请选择开始日期"),
    day("2026年11月5日"),
  ]) {
    for (const deltaY of [-50, 50, 2, 2]) {
      const wheel = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY,
      });
      target.dispatchEvent(wheel);
      expect(wheel.defaultPrevented).toBe(true);
      expect(screen.getByRole("dialog")).toBe(popup);
    }
  }
  await user.click(screen.getByRole("button", { name: "收起" }));
  const wheel = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 50,
  });
  popup.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(false);
  const background = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 50,
  });
  document.body.dispatchEvent(background);
  expect(background.defaultPrevented).toBe(false);
});

it("弹层内长内容保留原生内部滚动，边界处才阻止滚动穿透", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(input("开始日期"));
  const popup = screen.getByRole("dialog");
  popup.style.overflowY = "auto";
  Object.defineProperties(popup, {
    scrollHeight: { value: 600 },
    clientHeight: { value: 250 },
  });
  popup.scrollTop = 100;
  const middle = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 40,
  });
  popup.dispatchEvent(middle);
  expect(middle.defaultPrevented).toBe(false);
  popup.scrollTop = 350;
  const bottom = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 40,
  });
  popup.dispatchEvent(bottom);
  expect(bottom.defaultPrevented).toBe(true);
});

it("调整窗口或外部滚动使输入框移出视口时收起日历，并保留未完成草稿", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(input("开始日期"));
  await user.click(day("2026年11月5日"));
  const anchor = input("开始日期").closest(".date-range-inputs")!;
  const bounds = vi.spyOn(anchor, "getBoundingClientRect");
  bounds.mockReturnValue(new DOMRect(20, window.innerHeight + 100, 300, 60));
  fireEvent.resize(window);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(input("开始日期").value).toBe("2026-11-05");
  expect(input("结束日期").value).toBe("");
  bounds.mockReturnValue(new DOMRect(20, 100, 300, 60));
  await user.click(input("结束日期"));
  expect(screen.getByRole("dialog").textContent).toContain("请选择结束日期");
  bounds.mockReturnValue(new DOMRect(20, -100, 300, 60));
  fireEvent.scroll(window);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(input("开始日期").value).toBe("2026-11-05");
  for (const left of [-400, window.innerWidth + 100]) {
    bounds.mockReturnValue(new DOMRect(20, 100, 300, 60));
    await user.click(input("结束日期"));
    bounds.mockReturnValue(new DOMRect(left, 100, 300, 60));
    fireEvent.resize(window);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(input("开始日期").value).toBe("2026-11-05");
    expect(input("结束日期").value).toBe("");
  }
});

it("点击外部或被禁用时关闭弹层，保留未完成的日期草稿", async () => {
  const user = userEvent.setup();
  const view = render(<Harness />);
  await user.click(input("开始日期"));
  await user.click(day("2026年11月5日"));
  await user.click(screen.getByRole("button", { name: "其他操作" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(input("开始日期").value).toBe("2026-11-05");
  expect(input("结束日期").value).toBe("");
  await user.click(input("结束日期"));
  view.rerender(<Harness disabled />);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(input("开始日期").disabled).toBe(true);
  expect(input("开始日期").value).toBe("2026-11-05");
});
