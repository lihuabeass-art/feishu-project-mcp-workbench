// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import {
  discoverSourceFields,
  loadSnapshot,
  refreshSourceTypes,
  saveSourceTypes,
  saveWorkSource,
  syncTodos,
} from "./api";
import type { CachedItem, Snapshot, SyncReport } from "./types";

vi.mock("./api", () => ({
  desktop: true,
  loadSnapshot: vi.fn(),
  syncTodos: vi.fn(),
  checkConnection: vi.fn(),
  saveToken: vi.fn(),
  getWorkflowActions: vi.fn(),
  executeWorkflowAction: vi.fn(),
  refreshSourceTypes: vi.fn(),
  saveSourceTypes: vi.fn(),
  clearSourceTypes: vi.fn(),
  saveTypeOrder: vi.fn(),
  cachedItemDetail: vi.fn(),
  refreshItemDetail: vi.fn(),
  discoverSourceFields: vi.fn(),
  saveWorkSource: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});
afterEach(cleanup);

it("来源的类型、显示偏好、别名和同步范围互不串用，全部来源按可见归属汇总", async () => {
  const makeItem = (
    id: string,
    sources: string[],
    type = "story",
  ): CachedItem => ({
    id: { project_key: "space-a", work_item_type_key: type, work_item_id: id },
    source_ids: sources,
    name: id,
    project_name: "空间甲",
    flow: {
      kind: "none",
      node_name: null,
      node_state_key: null,
      start_state_key_name: null,
      end_state_key_name: null,
    },
    schedule: { start_raw: null, end_raw: null },
    raw_json: "{}",
    identity_missing_flags: [],
    first_seen_at_ms: 1,
    last_seen_at_ms: 1,
    seen_count: 1,
  });
  const data: Snapshot = {
    capabilities: { workflow: false, source_queries: true },
    items: [
      makeItem("仅甲事项", ["a"]),
      makeItem("仅乙事项", ["b"]),
      makeItem("共有事项", ["a", "b"]),
      makeItem("旧缓存事项", ["a"], "cached-only"),
    ],
    total: 4,
    last_success: null,
    runs: [],
    credential_ready: true,
    credential_description: "已配置",
    config_path: "config.toml",
    db_path: "cache.db",
    sources: ["a", "b"].map((id) => ({
      id,
      display_name: id === "a" ? "甲来源" : "乙来源",
      kind: "personal_todo",
      enabled: true,
      executable: true,
      reason: null,
      action: "todo",
      todo_scope: "in_progress",
      type_scope: {
        configured: false,
        selected_count: 1,
        types: [
          {
            project_key: "space-a",
            project_name: "空间甲",
            type_key: "story",
            type_name: "需求",
            selected: true,
          },
          ...(id === "b"
            ? [
                {
                  project_key: "space-a",
                  project_name: "空间甲",
                  type_key: "issue",
                  type_name: "缺陷",
                  selected: true,
                },
              ]
            : []),
        ],
      },
    })),
  };
  localStorage.setItem(
    "fstodo.type-preferences.v1",
    JSON.stringify({
      ghost: { enabled: true, alias: "外部类型" },
    }),
  );
  vi.mocked(loadSnapshot).mockImplementation(async () => structuredClone(data));
  vi.mocked(saveSourceTypes).mockImplementation(async (id, keys) => {
    const source = data.sources.find((s) => s.id === id)!;
    source.type_scope = {
      ...source.type_scope!,
      configured: true,
      types: source.type_scope!.types.map((t) => ({
        ...t,
        selected: keys.includes(t.type_key),
      })),
    };
    return keys.length;
  });
  const user = userEvent.setup();
  let app = render(<App />);
  await screen.findByText("共有事项");
  await user.click(screen.getByRole("button", { name: "工作来源" }));
  expect(screen.getByText(/请先选择上方的一个工作来源/)).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "需求的显示别名" })).toBeNull();
  await user.click(screen.getByRole("radio", { name: "甲来源" }));
  const panel = () => within(screen.getByRole("region", { name: "工作类型" }));
  expect(panel().getByText("当前来源：甲来源")).toBeTruthy();
  expect(panel().getAllByRole("listitem")).toHaveLength(1);
  expect(panel().queryByText("未在所选来源发现")).toBeNull();
  expect(panel().queryByText("cached-only")).toBeNull();
  expect(panel().queryByText("外部类型")).toBeNull();
  await user.type(panel().getByLabelText("需求的显示别名"), "甲需求");
  await user.click(panel().getByRole("switch", { name: "甲需求在清单中显示" }));
  await user.click(panel().getByRole("switch", { name: "同步甲需求" }));
  expect(saveSourceTypes).toHaveBeenLastCalledWith("a", []);
  await waitFor(() =>
    expect(
      (panel().getByRole("switch", { name: "同步甲需求" }) as HTMLInputElement)
        .disabled,
    ).toBe(false),
  );
  await user.click(screen.getByRole("radio", { name: "乙来源" }));
  expect(panel().getByText("当前来源：乙来源")).toBeTruthy();
  expect(panel().getAllByRole("listitem")).toHaveLength(2);
  expect(
    (panel().getByLabelText("需求的显示别名") as HTMLInputElement).value,
  ).toBe("");
  expect(
    (
      panel().getByRole("switch", {
        name: "需求在清单中显示",
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(
    (panel().getByRole("switch", { name: "同步需求" }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  await user.type(panel().getByLabelText("需求的显示别名"), "乙需求");
  await user.click(screen.getByRole("button", { name: /我的工作/ }));
  await user.click(screen.getByRole("combobox", { name: "显示来源" }));
  await user.click(screen.getByRole("option", { name: "全部来源" }));
  expect(screen.queryByText("仅甲事项")).toBeNull();
  expect(screen.getByRole("button", { name: /共有事项乙需求/ })).toBeTruthy();
  expect(screen.getByText("仅乙事项")).toBeTruthy();
  app.unmount();
  app = render(<App />);
  await screen.findByText("共有事项");
  await user.click(screen.getByRole("button", { name: "工作来源" }));
  await user.click(screen.getByRole("radio", { name: "甲来源" }));
  expect(
    (panel().getByLabelText("需求的显示别名") as HTMLInputElement).value,
  ).toBe("甲需求");
  expect(
    (
      panel().getByRole("switch", {
        name: "甲需求在清单中显示",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  await user.click(screen.getByRole("radio", { name: "乙来源" }));
  await user.click(panel().getByRole("switch", { name: "乙需求在清单中显示" }));
  await user.click(screen.getByRole("button", { name: /我的工作/ }));
  await user.click(screen.getByRole("combobox", { name: "显示来源" }));
  await user.click(screen.getByRole("option", { name: "全部来源" }));
  expect(screen.queryByText("共有事项")).toBeNull();
  expect(screen.queryByText("仅乙事项")).toBeNull();
  app.unmount();
  data.sources[1] = {
    ...data.sources[1],
    kind: "work_item_type",
    project_key: "space-a",
    work_item_type_key: "story",
  };
  render(<App />);
  await screen.findByText("旧缓存事项");
  await user.click(screen.getByRole("button", { name: "工作来源" }));
  await user.click(screen.getByRole("radio", { name: "乙来源 · 空间甲" }));
  expect(panel().getByText("当前来源：乙来源 · 空间甲")).toBeTruthy();
  expect(panel().getAllByRole("listitem")).toHaveLength(1);
  expect(panel().queryByText("缺陷")).toBeNull();
});

describe("工作来源配置与同步互不阻塞", () => {
  it.each(["success", "failure", "patch-during-reload"])(
    "同步未结束时可编辑、添加并保存本地配置，兼容同步%s",
    async (outcome) => {
      let data: Snapshot = {
        capabilities: {
          workflow: false,
          source_queries: true,
          incremental_sync: true,
        },
        items: [],
        total: 0,
        last_success: null,
        runs: [],
        sources: [
          {
            id: "现有来源",
            kind: "personal_todo",
            enabled: true,
            executable: true,
            reason: null,
            action: "todo",
            todo_scope: "in_progress",
          },
        ],
        config_path: "config.toml",
        db_path: "cache.db",
        credential_ready: true,
        credential_description: "已配置",
      };
      vi.mocked(loadSnapshot).mockImplementation(async () =>
        structuredClone(data),
      );
      vi.mocked(saveWorkSource).mockImplementation(async (input) => {
        const source = {
          ...input,
          executable: input.enabled,
          reason: null,
          action: input.action ?? null,
          todo_scope: input.todo_scope ?? null,
        };
        data = {
          ...data,
          sources: [...data.sources.filter((s) => s.id !== input.id), source],
        };
      });
      const syncedItem: CachedItem = {
        id: {
          project_key: "space-a",
          work_item_type_key: "story",
          work_item_id: "1",
        },
        name: "同步新增事项",
        project_name: "空间甲",
        source_ids: ["现有来源"],
        flow: {
          kind: "state",
          node_name: null,
          node_state_key: null,
          start_state_key_name: "待处理",
          end_state_key_name: null,
        },
        schedule: { start_raw: null, end_raw: null },
        raw_json: "{}",
        identity_missing_flags: [],
        first_seen_at_ms: 1,
        last_seen_at_ms: 2,
        seen_count: 1,
      };
      const report: SyncReport = {
        status: "success",
        complete: true,
        items_rejected: 0,
        items_inserted: 1,
        items_updated: 0,
        items_upserted: 1,
        stop_reason: "completed",
        patch: { added: [syncedItem], modified: [], removed: [] },
        total: 1,
      };
      let finish!: (report: SyncReport) => void;
      let fail!: (error: unknown) => void;
      vi.mocked(syncTodos).mockReturnValue(
        new Promise((resolve, reject) => {
          finish = resolve;
          fail = reject;
        }),
      );
      const user = userEvent.setup();
      const choose = async (label: string, option: string) => {
        await user.click(screen.getByRole("combobox", { name: label }));
        await user.click(screen.getByRole("option", { name: option }));
      };
      render(<App />);
      await screen.findByRole("combobox", { name: "显示来源" });
      await user.click(screen.getByRole("button", { name: "工作来源" }));
      await user.click(screen.getByRole("button", { name: "立即刷新" }));
      expect(syncTodos).toHaveBeenCalledWith("*", false, ["现有来源"]);

      await user.click(screen.getByRole("button", { name: "编辑现有来源" }));
      await choose("个人工作范围", "我的已办");
      await user.click(screen.getByRole("button", { name: "保存工作来源" }));
      await screen.findByText("工作来源已保存，下次同步使用这些条件。");
      expect(saveWorkSource).toHaveBeenLastCalledWith({
        id: "现有来源",
        display_name: "现有来源",
        kind: "personal_todo",
        enabled: true,
        action: "done",
        todo_scope: "in_progress",
      });

      await user.click(screen.getByRole("button", { name: "添加内置来源" }));
      await user.click(screen.getByRole("button", { name: "添加逾期待办" }));
      let finishReload!: (snapshot: Snapshot) => void;
      if (outcome === "patch-during-reload") {
        vi.mocked(loadSnapshot).mockReturnValueOnce(
          new Promise((resolve) => {
            finishReload = resolve;
          }),
        );
      }
      await user.click(screen.getByRole("button", { name: "保存工作来源" }));
      if (outcome === "patch-during-reload") {
        await waitFor(() => expect(loadSnapshot).toHaveBeenCalledTimes(3));
        await act(async () => {
          finish(report);
        });
        await act(async () => {
          finishReload(structuredClone(data));
        });
      }
      await screen.findByText("工作来源已保存，下次同步使用这些条件。");
      expect(saveWorkSource).toHaveBeenLastCalledWith({
        id: "builtin-overdue",
        builtin_key: "overdue",
        kind: "personal_todo",
        enabled: true,
        action: "overdue",
        todo_scope: "all",
      });
      if (outcome === "patch-during-reload") {
        expect(
          (screen.getByRole("radio", { name: "逾期待办" }) as HTMLInputElement)
            .checked,
        ).toBe(true);
        await user.click(screen.getByRole("button", { name: /我的工作/ }));
        await choose("显示来源", "现有来源");
        expect(screen.getByText("同步新增事项")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "工作来源" }));
      }
      if (outcome !== "patch-during-reload") {
        expect(screen.getByRole("button", { name: "正在同步…" })).toBeTruthy();
      }
      expect(screen.queryByRole("button", { name: "重新读取配置" })).toBeNull();
      expect(discoverSourceFields).not.toHaveBeenCalled();
      expect(refreshSourceTypes).not.toHaveBeenCalled();
      expect(syncTodos).toHaveBeenCalledTimes(1);

      await act(async () => {
        if (outcome === "failure")
          fail({ kind: "connection", message: "网络中断" });
        else if (outcome === "success") finish(report);
      });
      await screen.findByRole("button", { name: "立即刷新" });
      await user.click(screen.getByRole("button", { name: "编辑现有来源" }));
      expect(
        screen.getByRole("combobox", { name: "个人工作范围" }).textContent,
      ).toContain("我的已办");
      await user.click(screen.getByRole("button", { name: "取消" }));
      expect(screen.queryByRole("button", { name: "编辑逾期待办" })).toBeNull();
      vi.mocked(syncTodos).mockResolvedValueOnce({
        ...report,
        patch: { added: [], modified: [], removed: [] },
      });
      await user.click(screen.getByRole("button", { name: "立即刷新" }));
      expect(syncTodos).toHaveBeenLastCalledWith("*", false, [
        outcome === "patch-during-reload" ? "现有来源" : "builtin-overdue",
      ]);
      if (outcome !== "failure") {
        await user.click(screen.getByRole("button", { name: /我的工作/ }));
        await choose("显示来源", "现有来源");
        expect(screen.getByText("同步新增事项")).toBeTruthy();
      }
    },
  );
});
