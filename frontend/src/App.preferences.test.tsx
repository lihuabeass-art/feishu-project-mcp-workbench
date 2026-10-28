// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import { loadSnapshot, refreshSourceTypes } from "./api";
import { flushSourceTypePreferences } from "./preferences";
import type { Snapshot } from "./types";

vi.mock("./api", () => ({
  desktop: true,
  loadSnapshot: vi.fn(),
  refreshSourceTypes: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", async (original) => ({
  ...(await original<typeof import("@tauri-apps/api/core")>()),
  invoke: vi.fn(),
}));

function snapshot(): Snapshot {
  return {
    capabilities: { workflow: false, source_type_preferences: true },
    source_type_preferences: {
      a: { story: { enabled: false, alias: "研发" } },
    },
    sources: [
      {
        id: "a",
        display_name: "我的待办",
        kind: "personal_todo",
        enabled: true,
        executable: true,
        reason: null,
        action: "todo",
        todo_scope: "in_progress",
        type_scope: {
          configured: true,
          selected_count: 0,
          types: [
            {
              project_key: "space",
              project_name: "空间",
              type_key: "story",
              type_name: "需求",
              selected: false,
            },
          ],
        },
      },
    ],
    items: [],
    total: 0,
    runs: [],
    last_success: null,
    credential_ready: false,
    credential_description: "未配置",
    config_path: "config.toml",
    db_path: "cache.db",
  };
}

beforeEach(async () => {
  await flushSourceTypePreferences();
  vi.resetAllMocks();
  localStorage.clear();
});
afterEach(cleanup);

async function openTypes() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "工作来源" }));
  return user;
}

it("升级后界面缓存丢失时，清单显示和别名从数据库恢复，同步选择保持独立", async () => {
  vi.mocked(loadSnapshot).mockResolvedValue(snapshot());
  render(<App />);
  await openTypes();
  expect(
    (
      screen.getByRole("switch", {
        name: "研发在清单中显示",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  expect(
    (screen.getByRole("switch", { name: "同步研发" }) as HTMLInputElement)
      .checked,
  ).toBe(false);
  expect(
    (
      screen.getByRole("textbox", {
        name: "需求的显示别名",
      }) as HTMLInputElement
    ).value,
  ).toBe("研发");
  expect(invoke).not.toHaveBeenCalledWith(
    "initialize_source_type_preferences",
    expect.anything(),
  );
});

it("切换和别名修改落库后，清空界面缓存并重启仍保留最新选择", async () => {
  const data = snapshot();
  vi.mocked(loadSnapshot).mockImplementation(async () => structuredClone(data));
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "save_source_type_preferences") {
      const value = args as {
        sourceId: string;
        preferences: NonNullable<Snapshot["source_type_preferences"]>[string];
      };
      data.source_type_preferences![value.sourceId] = structuredClone(
        value.preferences,
      );
    }
    return undefined;
  });
  let app = render(<App />);
  const user = await openTypes();
  await user.click(screen.getByRole("switch", { name: "研发在清单中显示" }));
  await user.type(
    screen.getByRole("textbox", { name: "需求的显示别名" }),
    "组",
  );
  await flushSourceTypePreferences();
  expect(data.source_type_preferences!.a.story).toEqual({
    enabled: true,
    alias: "研发组",
  });
  expect(data.sources[0].type_scope!.types[0].selected).toBe(false);
  app.unmount();
  localStorage.clear();
  app = render(<App />);
  await openTypes();
  expect(
    (
      screen.getByRole("switch", {
        name: "研发组在清单中显示",
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(
    (screen.getByRole("switch", { name: "同步研发组" }) as HTMLInputElement)
      .checked,
  ).toBe(false);
  app.unmount();
});

it("数据库保存失败时恢复已确认的开关状态，之后可以重试", async () => {
  vi.mocked(loadSnapshot).mockResolvedValue(snapshot());
  vi.mocked(invoke)
    .mockRejectedValueOnce(new Error("磁盘不可写"))
    .mockResolvedValue(undefined);
  render(<App />);
  const user = await openTypes();
  await user.click(screen.getByRole("switch", { name: "研发在清单中显示" }));
  await screen.findByText("类型偏好保存失败，请检查本机存储后重试。");
  expect(
    (
      screen.getByRole("switch", {
        name: "研发在清单中显示",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  await user.click(screen.getByRole("switch", { name: "研发在清单中显示" }));
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  expect(
    (
      screen.getByRole("switch", {
        name: "研发在清单中显示",
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
});

it("已停用来源的清单显示和别名仍可保存，同步开关保持禁用", async () => {
  const data = snapshot();
  data.sources.push({
    ...structuredClone(data.sources[0]),
    id: "b",
    display_name: "已停用来源",
    enabled: false,
    executable: false,
  });
  vi.mocked(loadSnapshot).mockResolvedValue(data);
  vi.mocked(invoke).mockResolvedValue(undefined);
  render(<App />);
  const user = await openTypes();
  await user.click(screen.getByRole("radio", { name: "已停用来源" }));
  await user.click(screen.getByRole("switch", { name: "需求在清单中显示" }));
  await user.type(
    screen.getByRole("textbox", { name: "需求的显示别名" }),
    "归档",
  );
  await flushSourceTypePreferences();
  expect(invoke).toHaveBeenLastCalledWith("save_source_type_preferences", {
    sourceId: "b",
    preferences: { story: { enabled: false, alias: "归档" } },
  });
  expect(
    (screen.getByRole("switch", { name: "同步归档" }) as HTMLInputElement)
      .disabled,
  ).toBe(true);
});

it("配置回读期间的新选择不会被较早读取的数据库状态覆盖", async () => {
  let finishRead!: (value: Snapshot) => void;
  vi.mocked(loadSnapshot)
    .mockResolvedValueOnce(snapshot())
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRead = resolve;
        }),
    );
  vi.mocked(refreshSourceTypes).mockResolvedValue({
    discovered_count: 1,
    failed: [],
  });
  vi.mocked(invoke).mockResolvedValue(undefined);
  render(<App />);
  const user = await openTypes();
  await user.click(screen.getByRole("button", { name: "发现类型" }));
  await waitFor(() => expect(loadSnapshot).toHaveBeenCalledTimes(2));
  await user.click(screen.getByRole("switch", { name: "研发在清单中显示" }));
  await flushSourceTypePreferences();
  await act(async () => finishRead(snapshot()));
  await screen.findByText("已发现 1 个空间与类型组合。");
  expect(
    (
      screen.getByRole("switch", {
        name: "研发在清单中显示",
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
});
