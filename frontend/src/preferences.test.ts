// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  loadSourceTypePreferences,
  saveSourceTypePreferences,
  sourceTypePreferences,
  typePreference,
  restoreSourceTypePreferences,
  persistSourceTypePreferences,
  flushSourceTypePreferences,
} from "./preferences";
import type { Snapshot } from "./types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(async () => {
  await flushSourceTypePreferences();
  vi.resetAllMocks();
  localStorage.clear();
});

describe("按来源保存类型偏好", () => {
  it("旧配置分别复制给已有来源，之后修改和重载互不影响，新来源使用默认值", () => {
    localStorage.setItem(
      "fstodo.type-preferences.v1",
      JSON.stringify({
        story: { enabled: false, alias: "旧名称" },
      }),
    );
    const preferences = loadSourceTypePreferences(["a", "b"]);
    preferences.a.story = { enabled: true, alias: "甲来源需求" };
    expect(preferences.b.story).toEqual({ enabled: false, alias: "旧名称" });
    saveSourceTypePreferences(preferences);
    const reloaded = loadSourceTypePreferences(["a", "b", "c"]);
    expect(reloaded.a.story).toEqual({ enabled: true, alias: "甲来源需求" });
    expect(reloaded.b.story).toEqual({ enabled: false, alias: "旧名称" });
    expect(
      typePreference(sourceTypePreferences(reloaded, "c"), "story"),
    ).toEqual({ enabled: true, alias: "" });
  });

  it("忽略无效的存储条目，不将来源名称误当成类型偏好", () => {
    localStorage.setItem(
      "fstodo.source-type-preferences.v2",
      JSON.stringify({
        a: { story: null, issue: { enabled: true, alias: "缺陷" } },
        b: [],
      }),
    );
    expect(loadSourceTypePreferences(["a", "b"])).toEqual({
      a: { issue: { enabled: true, alias: "缺陷" } },
      b: {},
    });
  });
});

describe("升级后恢复类型偏好", () => {
  const snapshot = (preferences: Snapshot["source_type_preferences"] = null) =>
    ({
      capabilities: { workflow: false, source_type_preferences: true },
      sources: [{ id: "a" }, { id: "b" }],
      source_type_preferences: preferences,
    }) as Snapshot;

  it.each(["fstodo.type-preferences.v1", "fstodo.source-type-preferences.v2"])(
    "首次启动迁移 %s，使用数据库实际回传的结果",
    async (key) => {
      const types = { story: { enabled: false, alias: "研发" } };
      const legacy = key.endsWith("v1") ? types : { a: types };
      localStorage.setItem(key, JSON.stringify(legacy));
      const current = { a: { issue: { enabled: false, alias: "已有配置" } } };
      vi.mocked(invoke).mockResolvedValue(current);
      expect(await restoreSourceTypePreferences(snapshot())).toEqual(current);
      expect(invoke).toHaveBeenCalledWith(
        "initialize_source_type_preferences",
        {
          preferences: key.endsWith("v1") ? { a: types, b: types } : legacy,
        },
      );
    },
  );

  it("界面缓存丢失或过时均采用数据库配置，已保存的空配置也不重新迁移", async () => {
    const saved = { a: { story: { enabled: false, alias: "研发" } } };
    expect(await restoreSourceTypePreferences(snapshot(saved))).toEqual(saved);
    localStorage.setItem(
      "fstodo.source-type-preferences.v2",
      JSON.stringify(saved),
    );
    expect(await restoreSourceTypePreferences(snapshot({}))).toEqual({});
    expect(invoke).not.toHaveBeenCalled();
  });

  it("迁移写入失败明确报错，保留旧缓存供下次启动重试", async () => {
    const legacy = JSON.stringify({
      a: { story: { enabled: false, alias: "" } },
    });
    localStorage.setItem("fstodo.source-type-preferences.v2", legacy);
    vi.mocked(invoke).mockRejectedValueOnce(new Error("磁盘不可写"));
    await expect(restoreSourceTypePreferences(snapshot())).rejects.toThrow(
      "磁盘不可写",
    );
    expect(localStorage.getItem("fstodo.source-type-preferences.v2")).toBe(
      legacy,
    );
  });

  it("连续操作按顺序保存，失败后仍可继续保存最新状态", async () => {
    let rejectFirst!: (reason: Error) => void;
    vi.mocked(invoke)
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValue(undefined);
    const first = persistSourceTypePreferences("a", {
      story: { enabled: false, alias: "" },
    });
    const failed = expect(first).rejects.toThrow("保存失败");
    const second = persistSourceTypePreferences("a", {
      story: { enabled: true, alias: "新名称" },
    });
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    rejectFirst(new Error("保存失败"));
    await failed;
    await second;
    expect(invoke).toHaveBeenNthCalledWith(2, "save_source_type_preferences", {
      sourceId: "a",
      preferences: { story: { enabled: true, alias: "新名称" } },
    });
  });
});
