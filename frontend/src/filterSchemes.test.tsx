// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { emptyWorkFilters, type WorkFilters } from "./workFilters";
import { readSchemeDocument, savedFilters, schemeAdjusted, schemeSummary, type FilterSchemeDocument } from "./filterSchemes";
import { useFilterSchemes } from "./useFilterSchemes";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const combination: WorkFilters = { ...emptyWorkFilters, type: ["story", "issue"], space: ["space-a", "space-b"],
  project: ["space-a|project-1"], flowKind: ["node", "state"], nodeName: ["开发", "测试"], stateName: ["待处理"],
  query: "临时搜索", spaceLabel: { "space-a": "空间甲" } };
const seed = (): FilterSchemeDocument => ({ schemaVersion: 1, schemes: [
  { id: "a", name: "方案甲", includeQuery: false, filters: savedFilters(combination) },
  { id: "b", name: "方案乙", includeQuery: true, filters: { ...combination, query: "已保存搜索" } },
], defaultId: "a" });
afterEach(cleanup);

describe("saved filter document compatibility", () => {
  it.each([0, 1])("preserves identities, conditions, labels and default while clearing legacy keywords in v%s documents", (version) => {
    const old = version === 0 ? { version: 0, schemes: seed().schemes, defaultSchemeId: "b" } : { ...seed(), defaultId: "b" };
    const original = structuredClone(old);
    const migrated = readSchemeDocument(old);
    expect(migrated).toEqual({ ...seed(), defaultId: "b", schemes: seed().schemes.map((scheme) => ({ ...scheme, includeQuery: false, filters: { ...scheme.filters, query: "" } })) });
    expect(readSchemeDocument(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated);
    expect(old).toEqual(original);
  });
  it("compares business sets, ignoring labels and all temporary search, including legacy schemes", () => {
    const current = { ...combination, type: ["issue", "story"], spaceLabel: { "space-a": "改名" } };
    expect(schemeAdjusted(current, seed().schemes[0])).toBe(false);
    expect(schemeAdjusted({ ...current, nodeName: ["新节点"] }, seed().schemes[0])).toBe(true);
    expect(schemeAdjusted(current, seed().schemes[1])).toBe(false);
    expect(schemeSummary(current)).not.toContain("搜索");
  });
  it("does not silently overwrite unreadable data or import transient filter caches", () => {
    expect(() => readSchemeDocument(combination)).toThrow();
    expect(() => readSchemeDocument({ ...seed(), schemaVersion: 100 })).toThrow();
    expect(() => readSchemeDocument({ ...seed(), schemaVersion: 2, version: 0 })).toThrow();
    expect(() => readSchemeDocument({ ...seed(), defaultId: "missing" })).toThrow();
  });
});

describe("saved filter lifecycle", () => {
  let stored: Record<string, FilterSchemeDocument>;
  let account: string;
  const writes: unknown[] = [];
  beforeEach(() => {
    account = "user-a"; stored = { "user-a": seed() }; writes.length = 0;
    vi.mocked(invoke).mockReset().mockImplementation(async (command, args) => {
      if (command === "load_filter_schemes") return { account, document: structuredClone(stored[account] ?? null) };
      if (command === "save_filter_schemes") {
        const payload = args as { account: string; document: FilterSchemeDocument };
        if (payload.account !== account) throw new Error("账号已变化");
        writes.push(structuredClone(payload)); stored[account] = structuredClone(payload.document); return;
      }
      throw new Error(`Unexpected command: ${command}`);
    });
  });
  const setup = () => renderHook(({ active, context = "credential-1" }: { active: boolean; context?: string }) => {
    const [filters, setFilters] = useState(structuredClone(emptyWorkFilters));
    const controller = useFilterSchemes({ enabled: true, context, active, filters, apply: setFilters });
    return { filters, setFilters, controller };
  }, { initialProps: { active: true, context: "credential-1" } });

  it("restores only on entry; refresh/layout renders and temporary adjustments never persist", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.controller.available).toBe(true));
    expect(result.current.filters).toEqual(seed().schemes[0].filters);
    act(() => result.current.setFilters({ ...combination, query: "temporary", nodeName: ["无结果节点"] }));
    rerender({ active: true, context: "credential-1" });
    expect(result.current.filters.nodeName).toEqual(["无结果节点"]);
    expect(result.current.controller.adjusted).toBe(true);
    expect(writes).toHaveLength(0);
    rerender({ active: false, context: "credential-1" });
    rerender({ active: true, context: "credential-1" });
    expect(result.current.filters).toEqual(seed().schemes[0].filters);
  });
  it("keeps current and default independent, explicit update and rename preserve identity, delete retains temporary filters", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.controller.available).toBe(true));
    act(() => result.current.controller.apply("b"));
    await act(() => result.current.controller.setDefault("a"));
    expect(result.current.controller.current?.id).toBe("b");
    expect(result.current.filters.query).toBe("");
    act(() => result.current.setFilters({ ...result.current.filters, nodeName: ["零结果保留"] }));
    await act(() => result.current.controller.update());
    await act(() => result.current.controller.rename("b", "改名后"));
    expect(stored[account].schemes[1]).toMatchObject({ id: "b", name: "改名后", filters: { nodeName: ["零结果保留"] } });
    await act(() => result.current.controller.setDefault("b"));
    await act(() => result.current.controller.remove("b"));
    expect(result.current.filters.nodeName).toEqual(["零结果保留"]);
    expect(result.current.controller.current).toBeUndefined();
    expect(stored[account].defaultId).toBeNull();
    rerender({ active: false, context: "credential-1" }); rerender({ active: true, context: "credential-1" });
    expect(result.current.filters).toEqual(emptyWorkFilters);
  });

  it("replacing the unique default preserves every scheme and canceling it clears only the binding", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.controller.available).toBe(true));
    const schemes = structuredClone(result.current.controller.document.schemes);
    for (const id of ["b", "a", "b"]) {
      await act(() => result.current.controller.setDefault(id));
      expect(stored[account].defaultId).toBe(id);
      expect(stored[account].schemes.filter((scheme) => scheme.id === stored[account].defaultId)).toHaveLength(1);
      expect(result.current.controller.document.schemes).toEqual(schemes);
      expect(result.current.controller.current?.id).toBe("a");
    }
    await act(() => result.current.controller.save("新的默认方案", true));
    expect(stored[account].defaultId).toBe(result.current.controller.current?.id);
    expect(stored[account].schemes.filter((scheme) => scheme.id === stored[account].defaultId)).toHaveLength(1);
    expect(stored[account].schemes.slice(0, 2)).toEqual(schemes);
    await act(() => result.current.controller.setDefault(null));
    expect(stored[account].defaultId).toBeNull();
    expect(stored[account].schemes).toHaveLength(3);
  });
  it("same account credential rotation retains every scheme, different account cannot read or overwrite it", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.controller.available).toBe(true));
    act(() => result.current.setFilters({ ...combination, nodeName: ["轮换前临时条件"] }));
    rerender({ active: true, context: "rotated-credential" });
    await waitFor(() => expect(result.current.controller.document.schemes).toHaveLength(2));
    expect(result.current.filters.nodeName).toEqual(["轮换前临时条件"]);
    expect(result.current.controller.current?.id).toBe("a");
    expect(result.current.controller.adjusted).toBe(true);
    act(() => result.current.controller.retry());
    await waitFor(() => expect(result.current.controller.available).toBe(true));
    expect(result.current.filters.nodeName).toEqual(["轮换前临时条件"]);
    expect(result.current.controller.current?.id).toBe("a");
    const original = structuredClone(stored["user-a"]);
    account = "user-b";
    rerender({ active: true, context: "another-account" });
    await waitFor(() => expect(result.current.controller.available).toBe(true));
    expect(result.current.controller.document.schemes).toHaveLength(0);
    await act(() => result.current.controller.save("乙账号方案", true));
    expect(stored["user-a"]).toEqual(original);
    expect(stored["user-b"].schemes).toHaveLength(1);
  });
  it("identity failure retains temporary conditions and disables persistence; retry is explicit", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.controller.available).toBe(true));
    act(() => result.current.setFilters(combination));
    vi.mocked(invoke).mockRejectedValueOnce(new Error("身份读取失败"));
    rerender({ active: true, context: "changed" });
    await waitFor(() => expect(result.current.controller.error).toContain("暂时无法获取最新信息"));
    expect(result.current.filters).toEqual(combination);
    expect(result.current.controller.available).toBe(false);
    expect(writes).toHaveLength(0);
  });
  it("saving always clears temporary search and failures do not mutate the document", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.controller.available).toBe(true));
    act(() => result.current.setFilters(combination));
    await act(() => result.current.controller.save("新方案", true));
    expect(result.current.filters.query).toBe("");
    expect(stored[account].schemes[2]).toMatchObject({ includeQuery: false, filters: { ...combination, query: "" } });
    expect(stored[account].schemes).toHaveLength(3);
    expect(stored[account].defaultId).toBe(result.current.controller.current?.id);
    vi.mocked(invoke).mockRejectedValueOnce(new Error("磁盘失败"));
    await act(() => result.current.controller.remove("a"));
    expect(result.current.controller.document.schemes).toHaveLength(3);
    expect(result.current.controller.error).toContain("原方案与当前输入已保留");
  });

  it("legacy default, explicit apply and restore clear search without rewriting stored data on read", async () => {
    stored[account].defaultId = "b";
    const original = structuredClone(stored[account]);
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.controller.available).toBe(true));
    expect(result.current.controller.current?.id).toBe("b");
    expect(result.current.filters).toEqual({ ...original.schemes[1].filters, query: "" });
    act(() => result.current.setFilters({ ...combination, query: "再次搜索" }));
    expect(result.current.controller.adjusted).toBe(false);
    act(() => result.current.controller.apply("b"));
    expect(result.current.filters.query).toBe("");
    act(() => result.current.setFilters({ ...combination, query: "离开前搜索", nodeName: ["临时节点"] }));
    rerender({ active: false, context: "credential-1" });
    rerender({ active: true, context: "credential-1" });
    expect(result.current.filters).toEqual({ ...original.schemes[1].filters, query: "" });
    expect(stored[account]).toEqual(original);
    expect(writes).toHaveLength(0);
  });

  it("update excludes search and clears it only after a successful write", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.controller.available).toBe(true));
    const temporary = { ...combination, nodeName: ["新节点"] };
    act(() => result.current.setFilters(temporary));
    const original = structuredClone(stored[account]);
    vi.mocked(invoke).mockRejectedValueOnce({ kind: "store", message: "fixture failure" });
    await act(() => result.current.controller.update());
    expect(result.current.filters).toEqual(temporary);
    expect(stored[account]).toEqual(original);
    await act(() => result.current.controller.update());
    expect(result.current.filters).toEqual({ ...temporary, query: "" });
    expect(stored[account].schemes[0]).toMatchObject({ id: "a", includeQuery: false, filters: { ...temporary, query: "" } });
  });

  it.each(["conditions", "scheme"])("late update completion preserves a newer %s selection", async (choice) => {
    const { result } = setup();
    await waitFor(() => expect(result.current.controller.available).toBe(true));
    const submitted = { ...combination, nodeName: ["提交时节点"] };
    act(() => result.current.setFilters(submitted));
    let complete!: () => void;
    vi.mocked(invoke).mockImplementationOnce(async (_command, args) => {
      await new Promise<void>((resolve) => { complete = resolve; });
      const payload = args as { account: string; document: FilterSchemeDocument };
      stored[payload.account] = structuredClone(payload.document);
    });
    let updating!: ReturnType<typeof result.current.controller.update>;
    act(() => { updating = result.current.controller.update(); });
    if (choice === "conditions") act(() => result.current.setFilters({ ...submitted, query: "较新的搜索", nodeName: ["较新的节点"] }));
    else act(() => result.current.controller.apply("b"));
    const selected = structuredClone(result.current.filters);
    const selectedId = result.current.controller.current?.id;
    await act(async () => { complete(); await updating; });
    expect(result.current.filters).toEqual(selected);
    expect(result.current.controller.current?.id).toBe(selectedId);
    expect(stored[account].schemes[0].filters).toEqual({ ...submitted, query: "" });
  });
  it.each(["auth", "permission", "connection", "store", "validation", "unknown"])("%s IPC errors expose only stable actionable categories", async (kind) => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.controller.available).toBe(true));
    const raw = "search_user_info RPC https://service.invalid/private instance demo log_id: synthetic-log";
    vi.mocked(invoke).mockRejectedValueOnce({ kind, message: raw });
    await act(() => result.current.controller.rename("a", "未保存名称"));
    expect(result.current.controller.document.schemes[0].name).toBe("方案甲");
    expect(result.current.controller.error).toContain("未保存");
    expect(result.current.controller.error).not.toMatch(/RPC|search_user_info|https:|instance|log_id|synthetic-log/);
    if (kind === "auth") expect(result.current.controller.error).toContain("连接设置中更新 Token");
    if (kind === "permission") expect(result.current.controller.error).toContain("原软件中的访问权限");
    if (kind === "store") expect(result.current.controller.error).toContain("本地方案暂时无法保存");
    vi.mocked(invoke).mockRejectedValueOnce({ kind, message: raw });
    rerender({ active: true, context: `retry-${kind}` });
    await waitFor(() => expect(result.current.controller.error).toContain("未加载"));
    expect(result.current.controller.error).not.toMatch(/RPC|search_user_info|https:|instance|log_id|synthetic-log/);
    expect(writes).toHaveLength(0);
  });
  it("unknown saved format preserves durable data and temporary filters without blaming the connection", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.controller.available).toBe(true));
    act(() => result.current.setFilters(combination));
    const original = structuredClone(stored[account]);
    vi.mocked(invoke).mockResolvedValueOnce({ account, document: { schemaVersion: 100, schemes: original.schemes, defaultId: "a" } });
    rerender({ active: true, context: "newer-document-format" });
    await waitFor(() => expect(result.current.controller.error).toContain("此版本无法读取筛选方案格式，原数据已保留"));
    expect(result.current.controller.error).not.toContain("连接");
    expect(result.current.controller.available).toBe(false);
    expect(result.current.filters).toEqual(combination);
    expect(stored[account]).toEqual(original);
    expect(writes).toHaveLength(0);
  });
});
