import { expect, it } from "vitest";
import { layoutFields, ownerCell } from "./workflowLayout";
import type { WorkflowAction } from "./types";

type Field = WorkflowAction["fields"][number];

const owned = (
  key: string,
  owner: string,
  column: string,
  extra: Partial<Field> = {},
): Field => ({
  key,
  label: `${column} · ${owner}`,
  kind: "number",
  required: false,
  scope: "assignee",
  owner,
  column,
  ...extra,
});
const plain = (key: string, extra: Partial<Field> = {}): Field => ({
  key,
  label: key,
  kind: "text",
  required: false,
  scope: "node",
  ...extra,
});

it("多位负责人按指标分表，日期与数值分开且每表最多两列，放在首个负责人字段处", () => {
  const segments = layoutFields([
    plain("进度", { kind: "number", unit: "percent" }),
    owned("hours:a", "甲", "实际工时", { hint: "按负责人分别填写" }),
    owned("hours:b", "乙", "实际工时", { hint: "按负责人分别填写" }),
    owned("points:a", "甲", "估分"),
    owned("points:b", "乙", "估分"),
    owned("extra:a", "甲", "额外工时"),
    owned("start:a", "甲", "排期 · 开始日期", { kind: "date" }),
    owned("end:a", "甲", "排期 · 结束日期", { kind: "date" }),
    owned("start:b", "乙", "排期 · 开始日期", { kind: "date" }),
    owned("end:b", "乙", "排期 · 结束日期", { kind: "date" }),
    plain("文档"),
  ]);
  expect(segments.map((segment) => segment.kind)).toEqual([
    "field",
    "owners",
    "owners",
    "owners",
    "field",
  ]);
  const tables = segments.flatMap((segment) =>
    segment.kind === "owners" ? [segment.table] : [],
  );
  expect(tables.map((table) => table.columns)).toEqual([
    ["实际工时", "估分"],
    ["额外工时"],
    ["排期 · 开始日期", "排期 · 结束日期"],
  ]);
  expect(tables.map((table) => table.owners)).toEqual([
    ["甲", "乙"],
    ["甲"],
    ["甲", "乙"],
  ]);
  expect(tables[0].hints).toEqual(["按负责人分别填写"]);
  expect(tables[0].cells[ownerCell("乙", "估分")].key).toBe("points:b");
  expect(tables[1].cells[ownerCell("乙", "额外工时")]).toBeUndefined();
});

it("只有一位负责人或缺少结构化元数据时保持逐项排列", () => {
  for (const fields of [
    [owned("hours:a", "甲", "实际工时"), owned("points:a", "甲", "估分")],
    [
      { ...owned("hours:a", "甲", "实际工时"), owner: undefined },
      owned("hours:b", "乙", "实际工时"),
    ],
  ]) {
    expect(
      layoutFields(fields).every((segment) => segment.kind === "field"),
    ).toBe(true);
  }
});

it("相邻字段说明相同时只在最后一项展示一次，不同说明各自保留", () => {
  const segments = layoutFields([
    plain("a", { hint: "同一说明" }),
    plain("b", { hint: "同一说明" }),
    plain("c", { hint: "另一说明" }),
    plain("d"),
  ]);
  expect(
    segments.map((segment) =>
      segment.kind === "field" ? segment.showHint : null,
    ),
  ).toEqual([false, true, true, false]);
});
