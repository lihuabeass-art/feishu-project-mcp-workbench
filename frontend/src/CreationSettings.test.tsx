// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canSetCreationDefault,
  CreationSettings,
  creationPrefillKey,
  loadCreationPrefill,
  loadLocalCreationDefaults,
  localCreationInitial,
  matchesLocalCreationDefault,
  saveLocalCreationDefaults,
  validLocalCreationDefault,
  type LocalCreationDefaults,
} from "./CreationSettings";
import type { CreationField, CreationForm } from "./creation";

const field = (patch: Partial<CreationField> = {}): CreationField => ({
  key: "priority",
  label: "优先级",
  kind: "select",
  required: true,
  multiple: false,
  initial: "normal",
  options: [
    { value: "high", label: "高" },
    { value: "normal", label: "普通" },
  ],
  ...patch,
});
const form = (patch: Partial<CreationForm> = {}): CreationForm => ({
  target: { source_id: "source-a", project_key: "space", type_key: "issue" },
  context: "account-database-context",
  version: "schema-1",
  fields: [field()],
  pending: null,
  ...patch,
});
const defaults = (value: unknown = "high"): LocalCreationDefaults => ({
  priority: { kind: "select", multiple: false, value },
});

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("本地默认值与最新字段选项", () => {
  it("最新选项仍有原 ID 才采用本地默认，删除后留空而不回退云端默认", () => {
    expect(localCreationInitial(field(), defaults(), true)).toBe("high");
    expect(
      localCreationInitial(
        field({ options: [{ value: "normal", label: "普通" }] }),
        defaults(),
        true,
      ),
    ).toBe("");
    expect(
      localCreationInitial(
        field({
          label: "新的中文名称",
          options: [{ value: "high", label: "改名" }],
        }),
        defaults(),
        true,
      ),
    ).toBe("high");
  });

  it("多选任一选项失效就不预填整个字段，多选规则变化也不复用旧值", () => {
    const saved: LocalCreationDefaults = {
      priority: { kind: "select", multiple: true, value: ["high", "normal"] },
    };
    const selected = localCreationInitial(
      field({ multiple: true }),
      saved,
      true,
    );
    expect(selected).toEqual(["high", "normal"]);
    (selected as string[]).push("changed-copy");
    expect(saved.priority.value).toEqual(["high", "normal"]);
    expect(
      localCreationInitial(
        field({ multiple: true, options: [{ value: "high", label: "高" }] }),
        saved,
        true,
      ),
    ).toEqual([]);
    expect(localCreationInitial(field(), saved, true)).toBe("");
    expect(
      localCreationInitial(field({ kind: "text" }), defaults(), true),
    ).toBe("normal");
  });

  it("默认值按账号数据库上下文、空间、类型隔离，字段中文名和配置版本不改变保存身份", () => {
    const original = form();
    saveLocalCreationDefaults(original, defaults());
    expect(loadLocalCreationDefaults(original)).toEqual(defaults());
    expect(
      loadLocalCreationDefaults(
        form({ version: "schema-2", fields: [field({ label: "新名称" })] }),
      ),
    ).toEqual(defaults());
    expect(
      loadLocalCreationDefaults(
        form({ target: { ...original.target, source_id: "source-b" } }),
      ),
    ).toEqual(defaults());
    for (const other of [
      form({ context: "other-account-or-database" }),
      form({ target: { ...original.target, project_key: "other-space" } }),
      form({ target: { ...original.target, type_key: "story" } }),
    ]) {
      expect(loadLocalCreationDefaults(other)).toEqual({});
    }
  });

  it("只有枚举下拉框支持本地默认值，旧文本、数字、布尔和日期缓存保留但不再预填", () => {
    const saved: LocalCreationDefaults = {
      text: { kind: "text", multiple: false, value: "旧文本默认值" },
      textarea: { kind: "textarea", multiple: false, value: "旧说明默认值" },
      number: { kind: "number", multiple: false, value: 8 },
      bool: { kind: "bool", multiple: false, value: true },
      date: { kind: "date", multiple: false, value: "2026-10-30" },
    };
    saveLocalCreationDefaults(form(), saved);
    const loaded = loadLocalCreationDefaults(form());
    expect(loaded).toEqual(saved);
    for (const kind of ["text", "textarea", "number", "bool", "date"]) {
      const initial = kind === "number" ? 0 : kind === "bool" ? false : "";
      const current = field({ key: kind, kind, initial });
      expect(canSetCreationDefault(current)).toBe(false);
      expect(validLocalCreationDefault(current, loaded[kind])).toBe(false);
      expect(localCreationInitial(current, loaded, true)).toBe(initial);
    }
    expect(loadLocalCreationDefaults(form())).toEqual(saved);
    expect(canSetCreationDefault(field())).toBe(true);
  });

  it("星标只匹配当前有效选择，多选顺序变化仍视为相同默认值", () => {
    expect(
      matchesLocalCreationDefault(field(), "high", defaults().priority),
    ).toBe(true);
    expect(
      matchesLocalCreationDefault(field(), "normal", defaults().priority),
    ).toBe(false);
    expect(matchesLocalCreationDefault(field(), "", defaults().priority)).toBe(
      false,
    );
    const current = field({ multiple: true });
    const saved = { kind: "select", multiple: true, value: ["normal", "high"] };
    expect(
      matchesLocalCreationDefault(current, ["high", "normal"], saved),
    ).toBe(true);
    expect(matchesLocalCreationDefault(current, ["high"], saved)).toBe(false);
    expect(
      matchesLocalCreationDefault(
        field({ options: [] }),
        "high",
        defaults().priority,
      ),
    ).toBe(false);
  });

  it("未保存或关闭本地预填时沿用飞书表单默认，不为人员与关联事项套用未经校验的默认", () => {
    expect(localCreationInitial(field(), {}, true)).toBe("normal");
    expect(localCreationInitial(field(), defaults(), false)).toBe("normal");
    for (const kind of ["people", "relation", "unsupported"]) {
      const f = field({ kind });
      expect(canSetCreationDefault(f)).toBe(false);
      expect(
        validLocalCreationDefault(f, {
          kind,
          multiple: false,
          value: "person-or-item",
        }),
      ).toBe(false);
    }
  });

  it("损坏缓存不会让新表单崩溃，无法保存则把失败交给调用者保留当前填写值", () => {
    const key = `fstodo.creation-defaults.v1:${form().context}:${JSON.stringify(["space", "issue"])}`;
    localStorage.setItem(key, "not-json");
    expect(loadLocalCreationDefaults(form())).toEqual({});
    localStorage.setItem(
      key,
      JSON.stringify({ priority: { kind: "select" }, malformed: ["x"] }),
    );
    expect(loadLocalCreationDefaults(form())).toEqual({});
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    expect(() => saveLocalCreationDefaults(form(), defaults())).toThrow(
      "disk full",
    );
  });
});

describe("本地默认值预填偏好", () => {
  it("默认开启，关闭后重挂载仍关闭，键盘可以重新开启", async () => {
    const user = userEvent.setup();
    const mounted = render(<CreationSettings />);
    const toggle = screen.getByRole("switch", {
      name: "预填本地默认值",
    }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    await user.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(loadCreationPrefill()).toBe(false);
    mounted.unmount();
    render(<CreationSettings />);
    const restored = screen.getByRole("switch", {
      name: "预填本地默认值",
    }) as HTMLInputElement;
    expect(restored.checked).toBe(false);
    restored.focus();
    await user.keyboard(" ");
    expect(restored.checked).toBe(true);
    expect(localStorage.getItem(creationPrefillKey)).toBe("true");
  });

  it("其他窗口更新同一偏好时同步显示，禁用时不能修改", async () => {
    const mounted = render(<CreationSettings />);
    localStorage.setItem(creationPrefillKey, "false");
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: creationPrefillKey,
          newValue: "false",
        }),
      ),
    );
    expect(
      (
        screen.getByRole("switch", {
          name: "预填本地默认值",
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    mounted.rerender(<CreationSettings disabled />);
    await userEvent
      .setup()
      .click(screen.getByRole("switch", { name: "预填本地默认值" }));
    expect(localStorage.getItem(creationPrefillKey)).toBe("false");
  });

  it("存储失败保留原偏好并提供重试，不谎报保存成功", async () => {
    const user = userEvent.setup();
    render(<CreationSettings />);
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    await user.click(screen.getByRole("switch", { name: "预填本地默认值" }));
    expect(screen.getByRole("alert").textContent).toContain("未能保存");
    expect(
      (
        screen.getByRole("switch", {
          name: "预填本地默认值",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(localStorage.getItem(creationPrefillKey)).toBeNull();
    await user.click(screen.getByRole("button", { name: "重试保存预填偏好" }));
    expect(loadCreationPrefill()).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
