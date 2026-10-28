// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { loadSnapshot, saveConnectionSettings } from "./api";
import { invoke } from "@tauri-apps/api/core";
import type { Snapshot } from "./types";

const updater = vi.hoisted(() => ({ prepare: undefined as (() => Promise<() => void>) | undefined }));
vi.mock("./useAppUpdater", () => ({
  useAppUpdater: (options: { prepareInstall: () => Promise<() => void> }) => {
    updater.prepare = options.prepareInstall;
    return {};
  },
}));
vi.mock("./AppUpdater", () => ({ AppUpdateSettings: () => null, AppUpdateDialog: () => null }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: vi.fn() }));
vi.mock("./api", () => ({
  desktop: true,
  loadSnapshot: vi.fn(), syncTodos: vi.fn(), checkConnection: vi.fn(), saveToken: vi.fn(),
  saveConnectionSettings: vi.fn(), getWorkflowActions: vi.fn(), executeWorkflowAction: vi.fn(),
  refreshSourceTypes: vi.fn(), saveSourceTypes: vi.fn(), clearSourceTypes: vi.fn(),
  saveTypeOrder: vi.fn(), cachedItemDetail: vi.fn(), refreshItemDetail: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(invoke).mockResolvedValue(undefined);
  vi.mocked(loadSnapshot).mockResolvedValue({
    items: [], total: 0, sources: [], runs: [], last_success: null,
    config_path: "config.toml", db_path: "cache.db", credential_ready: true,
    credential_description: "已配置", settings: { endpoint: "https://example.com/mcp" },
  } as Snapshot);
});
afterEach(cleanup);

it.each(["invalid", "failed"])("关闭 %s 保存提示后仍阻止更新退出，恢复原值后可准备安装", async (kind) => {
  vi.mocked(saveConnectionSettings).mockRejectedValue({ kind: "storage", message: "写盘失败" });
  render(<App />);
  await screen.findByText("工作，从这里汇合");
  fireEvent.click(screen.getByRole("button", { name: "连接与配置" }));
  const endpoint = await screen.findByLabelText("MCP 服务地址");
  const draft = kind === "invalid" ? "not-a-url" : "https://next.example.com/mcp";
  fireEvent.change(endpoint, { target: { value: draft } });
  fireEvent.blur(endpoint);
  await screen.findByText(kind === "invalid" ? /请填写有效的 HTTPS 地址/ : /应用配置自动保存失败/, {}, { timeout: 4000 });
  fireEvent.click(screen.getByRole("button", { name: "关闭设置提示" }));
  expect((endpoint as HTMLInputElement).value).toBe(draft);
  await expect(updater.prepare!()).rejects.toThrow("MCP 服务地址尚未保存");
  expect(invoke).not.toHaveBeenCalledWith("prepare_app_update");

  fireEvent.change(endpoint, { target: { value: "https://example.com/mcp" } });
  let release!: () => void;
  await act(async () => { release = await updater.prepare!(); });
  expect(invoke).toHaveBeenCalledWith("prepare_app_update");
  act(() => release());
});
