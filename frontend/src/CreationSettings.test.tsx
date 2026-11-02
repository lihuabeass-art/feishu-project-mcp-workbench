// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canSetCreationDefault,
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
  vi.restoreAllMocks();
});

describe("本地默认值与最新字段选项", () => {
  it("最新选项仍有原 ID 才采用本地默认，删除后留空而不回退云端默认", () => {
    expect(localCreationInitial(field(), defaults())).toBe("high");
    expect(
      localCreationInitial(
        field({ options: [{ value: "normal", label: "普通" }] }),
        defaults(),
      ),
    ).toBe("");
    expect(
      localCreationInitial(
        field({
          label: "新的中文名称",
          options: [{ value: "high", label: "改名" }],
        }),
        defaults(),
      ),
    ).toBe("high");
  });

  it("多选任一选项失效就不预填整个字段，多选规则变化也不复用旧值", () => {
    const saved: LocalCreationDefaults = {
      priority: { kind: "select", multiple: true, value: ["high", "normal"] },
    };
    const selected = localCreationInitial(field({ multiple: true }), saved);
    expect(selected).toEqual(["high", "normal"]);
    (selected as string[]).push("changed-copy");
    expect(saved.priority.value).toEqual(["high", "normal"]);
    expect(
      localCreationInitial(
        field({ multiple: true, options: [{ value: "high", label: "高" }] }),
        saved,
      ),
    ).toEqual([]);
    expect(localCreationInitial(field(), saved)).toBe("");
    expect(localCreationInitial(field({ kind: "text" }), defaults())).toBe(
      "normal",
    );
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
      expect(localCreationInitial(current, loaded)).toBe(initial);
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

  it("未保存本地默认时沿用飞书表单默认，不为人员与关联事项套用未经校验的默认", () => {
    expect(localCreationInitial(field(), {})).toBe("normal");
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
