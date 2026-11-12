// @vitest-environment jsdom
import { useEffect, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
vi.mock("./api", async (original) => ({ ...(await original<typeof import("./api")>()), desktop: false, loadSnapshot: vi.fn().mockResolvedValue({ items: [], total: 0, last_success: null, runs: [], sources: [], config_path: "", db_path: "", credential_ready: false, credential_description: "" }) }));
vi.mock("./SchedulePage", () => ({ SchedulePage: ({ onGuardChange }: { onGuardChange: (guard: { dirty: boolean; busy: boolean; uncertain: boolean }) => void }) => {
  const [guard, setGuard] = useState({ dirty: false, busy: false, uncertain: false });
  useEffect(() => onGuardChange(guard), [guard, onGuardChange]);
  return <div><span>排期页面内容</span><button onClick={() => setGuard({ dirty: true, busy: false, uncertain: false })}>模拟编辑</button><button onClick={() => setGuard({ dirty: true, busy: true, uncertain: false })}>模拟同步</button><button onClick={() => setGuard({ dirty: true, busy: false, uncertain: true })}>模拟不确定结果</button></div>;
} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("导航离开前保留编辑，明确放弃后才能离开", async () => {
  render(<App />); const entry = await screen.findByText("事项安排"); expect(entry.hidden).toBe(false); expect(getComputedStyle(entry).display).not.toBe("none"); fireEvent.click(entry);
  await screen.findByText("排期页面内容"); fireEvent.click(screen.getByText("模拟编辑"));
  fireEvent.click(screen.getByRole("button", { name: /工作来源/ }));
  expect(screen.getByRole("dialog").textContent).toContain("未同步的编辑内容即将丢失");
  fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
  expect(screen.getByText("排期页面内容")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /工作来源/ }));
  fireEvent.click(screen.getByRole("button", { name: "放弃并继续" }));
  await waitFor(() => expect(screen.queryByText("排期页面内容")).toBeNull());
});
it("同步在途时阻止导航和关闭", async () => {
  render(<App />); const entry = await screen.findByText("事项安排"); expect(entry.hidden).toBe(false); expect(getComputedStyle(entry).display).not.toBe("none"); fireEvent.click(entry);
  await screen.findByText("排期页面内容"); fireEvent.click(screen.getByText("模拟同步"));
  const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /工作来源/ }));
  expect(screen.getByRole("dialog").textContent).toContain("排期正在同步，请等待本次结果");
  expect(screen.queryByRole("button", { name: "放弃并继续" })).toBeNull();
});

it("同步期间的提示在结束后不能变成空的放弃操作并清除保护", async () => {
  render(<App />); const entry = await screen.findByText("事项安排"); expect(entry.hidden).toBe(false); expect(getComputedStyle(entry).display).not.toBe("none"); fireEvent.click(entry);
  fireEvent.click(await screen.findByText("模拟同步"));
  fireEvent.click(screen.getByRole("button", { name: /工作来源/ }));
  fireEvent.click(screen.getByText("模拟不确定结果"));
  expect(screen.queryByRole("button", { name: "放弃并继续" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "知道了" }));
  const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /工作来源/ }));
  expect(screen.getByRole("dialog").textContent).toContain("部分排期可能已保存");
  expect(screen.getByRole("button", { name: "放弃并继续" })).toBeTruthy();
});
