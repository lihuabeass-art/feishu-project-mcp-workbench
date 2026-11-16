// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SchedulePage } from "./SchedulePage";
import { closeScheduleSession, loadScheduleSession, type ScheduleRead } from "./scheduleApi";

vi.mock("./scheduleApi", () => ({ loadScheduleSession: vi.fn(), closeScheduleSession: vi.fn(), loadSchedulePeople: vi.fn(), submitScheduleTargets: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("同名节点跨事项及权限保持同色，不同节点区分颜色且不可编辑条不再显示锁", async () => {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const identity = { connection: "c", project: "p", type: "t", item: "i", node: "n", scope: "personal" as const, owner: "me" };
  const base = { identity, nodeName: "前端方案设计", title: "事项甲", ownerId: "me", ownerIds: ["me"], sourceIds: ["s"], projectName: "空间", typeName: "需求", dates: { start: day, end: day }, mine: true };
  const read: ScheduleRead = {
    sessionId: "colors", currentUserId: "me", readAt: "today", complete: true,
    sources: [{ id: "s", name: "来源", complete: true }], people: [{ id: "me", name: "本人" }],
    targets: [
      { ...base, id: "one" },
      { ...base, id: "two", title: "事项乙", identity: { ...identity, item: "other", node: "other-node" }, nodeStatus: "not_started" },
      { ...base, id: "three", nodeName: "需求测试", identity: { ...identity, node: "test" }, nodeStatus: "done" },
    ],
  };
  vi.mocked(loadScheduleSession).mockResolvedValue(read);
  vi.mocked(closeScheduleSession).mockResolvedValue();
  const page = render(<SchedulePage onGuardChange={vi.fn()} requestReload={(reload) => reload()} />);
  await screen.findByLabelText("今日问候");
  const bars = () => Array.from(document.querySelectorAll<HTMLElement>(".schedule-bar"));
  const hue = (bar: HTMLElement) => bar.style.getPropertyValue("--schedule-node-hue");
  const first = bars().find((bar) => bar.getAttribute("aria-label") === "事项甲 · 前端方案设计")!;
  const second = bars().find((bar) => bar.getAttribute("aria-label") === "事项乙 · 前端方案设计")!;
  const past = bars().find((bar) => bar.getAttribute("aria-label") === "事项甲 · 需求测试")!;
  expect(hue(first)).not.toBe("");
  expect(hue(second)).toBe(hue(first));
  expect(hue(past)).not.toBe(hue(first));
  expect(second.classList.contains("is-readonly")).toBe(true);
  expect(second.querySelector(".schedule-bar-badge.is-readonly")).toBeNull();
  expect(past.classList.contains("is-past-node")).toBe(true);
  expect(past.querySelector(".schedule-bar-badge.is-readonly")).toBeNull();
  fireEvent.click(second);
  expect(screen.queryByText("当前连接尚未验证此状态的排期写入")).toBeNull();
  expect((screen.getByLabelText("开始日期") as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(first);
  expect(document.querySelector<HTMLElement>(".schedule-sibling-chip")?.style.getPropertyValue("--schedule-node-hue")).toBe(hue(first));
  const previous = hue(first);
  page.unmount();
  vi.mocked(loadScheduleSession).mockResolvedValue({ ...read, targets: [...read.targets].reverse() });
  render(<SchedulePage onGuardChange={vi.fn()} requestReload={(reload) => reload()} />);
  await screen.findByLabelText("今日问候");
  expect(hue(bars().find((bar) => bar.getAttribute("aria-label") === "事项甲 · 前端方案设计")!)).toBe(previous);
});
