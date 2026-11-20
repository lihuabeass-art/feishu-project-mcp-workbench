// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Settings } from "lucide-react";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("没有 scrollend 时，平滑滚动被中断后设置索引仍会恢复跟踪", () => {
  vi.useFakeTimers();
  render(
    <SettingsPage
      active
      sections={[
        { id: "first", label: "连接", icon: Settings, content: "连接设置" },
        { id: "second", label: "外观", icon: Settings, content: "外观设置" },
      ]}
    />,
  );
  const viewport = screen.getByRole("region", { name: "设置内容" });
  const connection = screen.getByRole("region", { name: "连接" });
  const appearance = screen.getByRole("region", { name: "外观" });
  Object.defineProperties(viewport, {
    clientHeight: { value: 100 },
    scrollHeight: { value: 300 },
    scrollTo: { value: vi.fn() },
  });
  connection.getBoundingClientRect = () => new DOMRect(0, -viewport.scrollTop, 0, 100);
  appearance.getBoundingClientRect = () => new DOMRect(0, 100 - viewport.scrollTop, 0, 100);

  const chosen = screen.getByRole("link", { name: "外观" });
  fireEvent.click(chosen);
  expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 96, behavior: "smooth" });
  viewport.scrollTop = 20;
  fireEvent.scroll(viewport);
  act(() => vi.advanceTimersByTime(100));
  expect(chosen.getAttribute("aria-current")).toBe("location");

  act(() => vi.advanceTimersByTime(200));
  expect(screen.getByRole("link", { name: "连接" }).getAttribute("aria-current")).toBe("location");
});
