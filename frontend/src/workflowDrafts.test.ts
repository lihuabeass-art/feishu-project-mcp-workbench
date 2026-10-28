import { expect, it } from "vitest";
import { changedFields, reconcileDraft } from "./workflowDrafts";
import type { WorkflowAction } from "./types";

const action = (remote: string): WorkflowAction => ({
  id: "a",
  label: "完成节点",
  kind: "node",
  fields: [
    {
      key: "shared",
      label: "共享字段",
      kind: "text",
      required: true,
      initial_value: remote,
    },
  ],
});

it("云端移除未改过的回显字段时不制造冲突，实际修改才保留", () => {
  const merged = reconcileDraft(
    { ...action(""), fields: [] },
    draft("原值"),
    "v2",
  );
  expect(merged.fields).toEqual({});
  expect(merged.conflicts).toEqual([]);
});

it("提交补丁排除未修改、相同新值和空的可选项", () => {
  const next = action("云端");
  next.fields.push({
    key: "mine",
    label: "工时",
    kind: "number",
    required: false,
  });
  expect(
    changedFields(
      next,
      { shared: "云端", mine: "2" },
      { shared: "云端", mine: "1" },
    ),
  ).toEqual({ mine: "2" });
  expect(
    changedFields(
      next,
      { shared: " 云端 ", mine: "" },
      { shared: "云端", mine: "1" },
    ),
  ).toEqual({});
});
const draft = (local: string, base = "原值") => ({
  fields: { shared: local },
  base_fields: { shared: base },
  version: "v1",
  updated_at: 1,
});

it.each([
  ["原值", "云端修改", "云端修改", false],
  ["本机修改", "原值", "本机修改", false],
  ["相同新值", "相同新值", "相同新值", false],
  ["本机修改", "云端修改", "本机修改", true],
  ["本机修改", "", "本机修改", true],
  ["", "云端修改", "", true],
])("逐字段合并本机 %s 与云端 %s", (local, remote, expected, conflict) => {
  const merged = reconcileDraft(action(remote), draft(local), "v2");
  expect(merged.fields.shared).toBe(expected);
  expect(merged.conflicts).toEqual(conflict ? ["shared"] : []);
});

it("未处理冲突跨重开保留，云端再次变化时展示最新值", () => {
  const first = reconcileDraft(action("云端一"), draft("本机修改"), "v2");
  const saved = { ...first, version: "v2", updated_at: 2 };
  for (const remote of ["云端一", "云端二"]) {
    const reopened = reconcileDraft(action(remote), saved, "v3");
    expect(reopened.fields.shared).toBe("本机修改");
    expect(reopened.base_fields.shared).toBe(remote);
    expect(reopened.conflicts).toEqual(["shared"]);
  }
});

it("旧版草稿版本变化后异值需要确认，同版本可保留原编辑意图", () => {
  const legacy = { fields: { shared: "旧草稿" }, version: "v1", updated_at: 1 };
  expect(reconcileDraft(action("云端"), legacy, "v2").conflicts).toEqual([
    "shared",
  ]);
  expect(reconcileDraft(action("云端"), legacy, "v1").conflicts).toEqual([]);
});

it("不同字段各自合并，新字段采用云端值", () => {
  const next = action("云端修改");
  next.fields.push({
    key: "mine",
    label: "工时",
    kind: "number",
    required: false,
    initial_value: "1",
  });
  next.fields.push({
    key: "new",
    label: "新字段",
    kind: "text",
    required: false,
    initial_value: "新值",
  });
  const saved = draft("原值");
  const merged = reconcileDraft(
    next,
    {
      ...saved,
      fields: { ...saved.fields, mine: "2" },
      base_fields: { ...saved.base_fields, mine: "1" },
    },
    "v2",
  );
  expect(merged.fields).toEqual({ shared: "云端修改", mine: "2", new: "新值" });
  expect(merged.conflicts).toEqual([]);
});

it.each(["本机修改", ""])(
  "云端表单移除字段后保留草稿 %s 并阻止提交",
  (local) => {
    const next = { ...action(""), fields: [] };
    const merged = reconcileDraft(
      next,
      { ...draft(local), field_labels: { shared: "文档" } },
      "v2",
    );
    expect(merged.fields.shared).toBe(local);
    expect(merged.field_labels.shared).toBe("文档");
    expect(merged.conflicts).toEqual(["shared"]);
    expect(
      reconcileDraft(next, { ...merged, version: "v2", updated_at: 1 }, "v2")
        .conflicts,
    ).toEqual(["shared"]);
  },
);
