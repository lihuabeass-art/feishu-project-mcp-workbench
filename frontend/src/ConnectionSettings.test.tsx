// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { ConnectionSettings } from "./ConnectionSettings";
import type { SaveFeedback } from "./SettingsSaveStatus";

const settings = {
  endpoint: "https://example.com/mcp",
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("连续输入合并自动保存，无效值不落盘，恢复原值清除待保存提示", async () => {
  const save = vi.fn().mockResolvedValue(true);
  const onFeedback = vi.fn();
  render(
    <ConnectionSettings
      settings={settings}
      disabled={false}
      save={save}
      onFeedback={onFeedback}
    />,
  );
  const endpoint = screen.getByLabelText("MCP 服务地址");
  fireEvent.change(endpoint, { target: { value: "https://next.example.com" } });
  await act(() => vi.advanceTimersByTimeAsync(400));
  fireEvent.change(endpoint, {
    target: { value: "https://next.example.com/mcp" },
  });
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(save).toHaveBeenCalledExactlyOnceWith({
    ...settings,
    endpoint: "https://next.example.com/mcp",
  });
  fireEvent.change(endpoint, { target: { value: "http://example.com" } });
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(save).toHaveBeenCalledTimes(1);
  expect(onFeedback).toHaveBeenLastCalledWith(
    expect.objectContaining({ state: "invalid" }),
  );
  fireEvent.change(endpoint, { target: { value: settings.endpoint } });
  expect(onFeedback).toHaveBeenLastCalledWith(null);
});

it("仅显示连接地址，离开输入框保存且不重复提交，无效地址不保存", async () => {
  const save = vi.fn().mockResolvedValue(true);
  render(
    <ConnectionSettings
      settings={settings}
      disabled={false}
      save={save}
      onFeedback={vi.fn()}
    />,
  );
  for (const label of [
    "同时检查的工作来源数",
    "同时读取的事项详情数",
    "请求超时（秒）",
  ]) {
    expect(screen.queryByLabelText(label)).toBeNull();
  }
  const endpoint = screen.getByLabelText("MCP 服务地址");
  fireEvent.change(endpoint, {
    target: { value: "https://next.example.com/mcp" },
  });
  fireEvent.blur(endpoint);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(save).toHaveBeenCalledExactlyOnceWith({
    ...settings,
    endpoint: "https://next.example.com/mcp",
  });
  fireEvent.change(endpoint, { target: { value: "not-a-url" } });
  fireEvent.blur(endpoint);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(save).toHaveBeenCalledTimes(1);
});

it("未保存状态独立于提示，无效值和保存失败的提示关闭后仍保留", async () => {
  const onUnsavedChange = vi.fn();
  const save = vi.fn().mockResolvedValue(false);
  function Host() {
    const [feedback, setFeedback] = useState<SaveFeedback | null>(null);
    return (
      <>
        <ConnectionSettings
          settings={settings}
          disabled={false}
          onUnsavedChange={onUnsavedChange}
          onFeedback={setFeedback}
          save={async (next) => {
            const saved = await save(next);
            setFeedback({ state: "failed", message: "连接地址保存失败" });
            return saved;
          }}
        />
        <output data-testid="feedback">{feedback?.state || "closed"}</output>
        <button onClick={() => setFeedback(null)}>关闭提示</button>
      </>
    );
  }
  const host = render(<Host />);
  expect(onUnsavedChange).toHaveBeenLastCalledWith(false);
  const endpoint = screen.getByLabelText("MCP 服务地址");
  fireEvent.change(endpoint, { target: { value: "not-a-url" } });
  expect(screen.getByTestId("feedback").textContent).toBe("invalid");
  expect(onUnsavedChange).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByText("关闭提示"));
  expect(screen.getByTestId("feedback").textContent).toBe("closed");
  expect(onUnsavedChange).toHaveBeenLastCalledWith(true);
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(endpoint, {
    target: { value: "https://next.example.com/mcp" },
  });
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(screen.getByTestId("feedback").textContent).toBe("failed");
  fireEvent.click(screen.getByText("关闭提示"));
  host.rerender(<Host />);
  expect(onUnsavedChange).toHaveBeenLastCalledWith(true);
  expect(
    (screen.getByLabelText("MCP 服务地址") as HTMLInputElement).value,
  ).toBe("https://next.example.com/mcp");
});

it("恢复原值或已保存值回读后清除未保存状态，卸载时也清理通知", async () => {
  const onUnsavedChange = vi.fn();
  const save = vi.fn().mockResolvedValue(true);
  const onFeedback = vi.fn();
  const props = { disabled: false, save, onFeedback, onUnsavedChange };
  const host = render(<ConnectionSettings {...props} settings={settings} />);
  const endpoint = screen.getByLabelText("MCP 服务地址");
  fireEvent.change(endpoint, {
    target: { value: "https://next.example.com/mcp" },
  });
  expect(onUnsavedChange).toHaveBeenLastCalledWith(true);
  fireEvent.change(endpoint, { target: { value: settings.endpoint } });
  expect(onUnsavedChange).toHaveBeenLastCalledWith(false);
  const next = { endpoint: "https://saved.example.com/mcp" };
  fireEvent.change(endpoint, { target: { value: next.endpoint } });
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(save).toHaveBeenCalledExactlyOnceWith(next);
  // A resolved save alone is not enough: the actual saved settings must match.
  expect(onUnsavedChange).toHaveBeenLastCalledWith(true);
  host.rerender(<ConnectionSettings {...props} settings={next} />);
  expect(onUnsavedChange).toHaveBeenLastCalledWith(false);
  fireEvent.change(endpoint, {
    target: { value: "https://unsaved.example.com/mcp" },
  });
  expect(onUnsavedChange).toHaveBeenLastCalledWith(true);
  host.unmount();
  expect(onUnsavedChange).toHaveBeenLastCalledWith(false);
});
