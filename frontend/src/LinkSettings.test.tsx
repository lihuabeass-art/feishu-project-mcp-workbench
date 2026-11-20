// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LinkSettings } from "./LinkSettings";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

it("macOS 使用系统浏览器打开并保留已有偏好", () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15",
  );
  localStorage.setItem("fstodo.link-opening-mode.v1", "new-window");
  render(<LinkSettings onFeedback={vi.fn()} />);
  expect(screen.queryByRole("combobox", { name: "链接打开方式" })).toBeNull();
  expect(screen.getByText("窗口和标签位置由默认浏览器决定。")).toBeTruthy();
  expect(localStorage.getItem("fstodo.link-opening-mode.v1")).toBe("new-window");
});
