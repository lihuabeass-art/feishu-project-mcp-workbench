import type { ScheduleRecord } from "./scheduleApi";
import type { ScheduleCurrentNode } from "./scheduleHistory";
import type { ScheduleIdentity } from "./scheduleSession";

/** 当前节点标签共用流程顺序；详情返回顺序不参与排序。 */
export function sortScheduleCurrentNodes(
  nodes: ScheduleCurrentNode[], records: ScheduleRecord[], identity: ScheduleIdentity,
): ScheduleCurrentNode[] {
  const sameItem = records.filter((record) => !record.sourceAggregate &&
    record.identity.connection === identity.connection && record.identity.project === identity.project &&
    record.identity.type === identity.type && record.identity.item === identity.item &&
    Number.isInteger(record.nodeOrder) && record.nodeOrder! >= 0);
  const uniqueOrder = (matches: ScheduleRecord[]) => {
    const orders = new Set(matches.map((record) => record.nodeOrder!));
    return orders.size === 1 ? [...orders][0] : undefined;
  };
  const order = (node: ScheduleCurrentNode) =>
    uniqueOrder(sameItem.filter((record) => record.identity.node === node.id)) ??
    uniqueOrder(sameItem.filter((record) => record.nodeName.trim() === node.name.trim())) ?? Infinity;
  const ranked = nodes.map((node) => ({ node, order: order(node) }));
  return ranked.sort((a, b) =>
    (a.order === b.order ? 0 : a.order < b.order ? -1 : 1) ||
    a.node.name.trim().localeCompare(b.node.name.trim(), "zh-CN", { numeric: true }) ||
    a.node.id.localeCompare(b.node.id, "en", { numeric: true })
  ).map(({ node }) => node);
}
