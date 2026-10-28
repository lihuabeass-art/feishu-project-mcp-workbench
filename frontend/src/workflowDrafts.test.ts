import { expect, it } from "vitest";
import {
  changedFields,
  migrateScheduleDraft,
  reconcileDraft,
} from "./workflowDrafts";
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
  "云端表单移除字段后继续保留草稿 %s 供界面核对",
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

const scheduleKey = (property: string, owner: string | null = null) =>
  JSON.stringify({ Schedule: { property, owner } });
const scheduleAction = (owners = ["a"], remote = "4"): WorkflowAction => ({
  id: "node:confirm:n",
  label: "完成节点",
  kind: "node",
  fields: owners.map((owner) => ({
    key: scheduleKey("actual_work_time", owner),
    label: `远端定义名称 ${owner}`,
    kind: "number",
    required: true,
    initial_value: remote,
    scope: "assignee",
  })),
});

it.each(["1", "0", ""])(
  "旧总排期修改值 %s 按属性恢复到唯一个人字段并核对当前云端",
  (local) => {
    const old = scheduleKey("actual_work_time");
    const target = scheduleKey("actual_work_time", "a");
    const next = scheduleAction();
    const saved = {
      fields: { [old]: local },
      base_fields: { [old]: "原总排期" },
      version: "v1",
      updated_at: 1,
    };
    const merged = reconcileDraft(next, saved, "v2");
    expect(merged.fields).toEqual({ [target]: local });
    expect(merged.base_fields).toEqual({ [target]: "4" });
    expect(merged.conflicts).toEqual([target]);
    expect(saved.fields).toEqual({ [old]: local });
    expect(changedFields(next, merged.fields, merged.base_fields)).toEqual(
      local ? { [target]: local } : {},
    );
  },
);

it("未改过的节点总汇总值不复制给个人，云端相同值迁移后无需重写", () => {
  const old = scheduleKey("actual_work_time");
  const target = scheduleKey("actual_work_time", "a");
  const saved = {
    fields: { [old]: "1" },
    base_fields: { [old]: "1" },
    version: "v1",
    updated_at: 1,
  };
  expect(reconcileDraft(scheduleAction(), saved, "v2").fields).toEqual({
    [target]: "4",
  });
  const merged = reconcileDraft(
    scheduleAction(["a"], "2"),
    { ...saved, fields: { [old]: "2" } },
    "v2",
  );
  expect(merged.fields).toEqual({ [target]: "2" });
  expect(merged.conflicts).toEqual([]);
  expect(
    changedFields(
      scheduleAction(["a"], "2"),
      merged.fields,
      merged.base_fields,
    ),
  ).toEqual({});
});

it("多负责人或目标已有不同本机修改时不猜测归属、不覆盖任意一份草稿", () => {
  const old = scheduleKey("actual_work_time");
  const target = scheduleKey("actual_work_time", "a");
  const saved = {
    fields: { [old]: "1" },
    base_fields: { [old]: "" },
    version: "v1",
    updated_at: 1,
  };
  const multiple = reconcileDraft(scheduleAction(["a", "b"]), saved, "v2");
  expect(multiple.fields[old]).toBe("1");
  expect(multiple.fields[target]).toBe("4");
  expect(multiple.fields[scheduleKey("actual_work_time", "b")]).toBe("4");
  const occupied = reconcileDraft(
    scheduleAction(),
    {
      ...saved,
      fields: { ...saved.fields, [target]: "3" },
      base_fields: { ...saved.base_fields, [target]: "4" },
    },
    "v2",
  );
  expect(occupied.fields).toEqual({ [old]: "1", [target]: "3" });
});

it("待核实快照在重新读取恢复前不迁移，不按相同名称迁移其他范围或属性", () => {
  const old = scheduleKey("actual_work_time");
  const saved = {
    fields: { [old]: "1" },
    base_fields: { [old]: "" },
    version: "v1",
    updated_at: 1,
  };
  const pending = {
    ...saved,
    pending: {
      item_id: {
        project_key: "p",
        work_item_type_key: "story",
        work_item_id: "1",
      },
      action_id: "node:confirm:n",
      version: "v1",
      request_id: "r",
      fields: saved.fields,
    },
  };
  expect(migrateScheduleDraft(scheduleAction(), pending)).toBe(pending);
  const unrelated = scheduleAction();
  unrelated.fields[0].key = scheduleKey("points", "a");
  const merged = reconcileDraft(unrelated, saved, "v2");
  expect(merged.fields[old]).toBe("1");
  expect(merged.fields[scheduleKey("points", "a")]).toBe("4");
});
