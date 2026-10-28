import type { WorkflowAction } from "./types";

type Field = WorkflowAction["fields"][number];

export interface OwnerTable {
  key: string;
  columns: string[];
  owners: string[];
  cells: Record<string, Field>;
  hints: string[];
}

export type FieldSegment =
  | { kind: "field"; field: Field; showHint: boolean }
  | { kind: "owners"; table: OwnerTable };

export const ownerCell = (owner: string, column: string) =>
  `${owner}\n${column}`;

// 侧栏较窄，每张表最多两列，日期与数值分表以保证输入框宽度。
const MAX_COLUMNS = 2;

export function layoutFields(fields: Field[]): FieldSegment[] {
  const grouped = fields.filter(
    (field) => field.scope === "assignee" && field.owner && field.column,
  );
  const owners = [...new Set(grouped.map((field) => field.owner!))];
  const tables: Array<OwnerTable & { date: boolean }> = [];
  if (owners.length > 1) {
    for (const field of grouped) {
      const column = field.column!;
      const date = field.kind === "date";
      let table = tables.find((candidate) =>
        candidate.columns.includes(column),
      );
      if (!table) {
        const last = tables[tables.length - 1];
        if (last && last.date === date && last.columns.length < MAX_COLUMNS) {
          table = last;
        } else {
          table = {
            key: column,
            columns: [],
            owners: [],
            cells: {},
            hints: [],
            date,
          };
          tables.push(table);
        }
        table.columns.push(column);
      }
      table.cells[ownerCell(field.owner!, column)] = field;
      if (field.hint && !table.hints.includes(field.hint))
        table.hints.push(field.hint);
    }
    for (const table of tables) {
      table.owners = owners.filter((owner) =>
        table.columns.some((column) => table.cells[ownerCell(owner, column)]),
      );
    }
  }
  const inTable = new Set(
    tables.flatMap((table) =>
      Object.values(table.cells).map((field) => field.key),
    ),
  );
  const segments: FieldSegment[] = [];
  let placed = false;
  for (const field of fields) {
    if (!inTable.has(field.key)) {
      segments.push({ kind: "field", field, showHint: !!field.hint });
    } else if (!placed) {
      placed = true;
      for (const table of tables) segments.push({ kind: "owners", table });
    }
  }
  // 相邻字段说明相同时只在最后一项下方展示一次。
  segments.forEach((segment, index) => {
    const next = segments[index + 1];
    if (
      segment.kind === "field" &&
      next?.kind === "field" &&
      next.field.hint === segment.field.hint
    )
      segment.showHint = false;
  });
  return segments;
}
