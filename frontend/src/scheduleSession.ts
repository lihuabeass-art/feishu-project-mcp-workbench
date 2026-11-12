/** 会话内排期计算；日期均为自然日，不依赖浏览器所在时区。 */
export interface ScheduleDates {
  start: string;
  end: string;
}

export type ScheduleResult = "accepted" | "failed" | "uncertain" | "unsent";
export interface ScheduleIdentity {
  connection: string;
  project: string;
  type: string;
  item: string;
  node: string;
  scope: "personal" | "node";
  owner?: string;
}
export interface ScheduleTarget {
  /** 由连接、空间、类型、事项、节点和负责人组成的稳定身份。 */
  id: string;
  nodeId: string;
  identity: ScheduleIdentity;
  baseline: ScheduleDates;
  dates: ScheduleDates;
  /** 清空是独立意图，不由日期输入过程中的空端点推断。 */
  cancel: boolean;
  readOnlyReason?: string;
  result?: ScheduleResult;
  submitted?: ScheduleDates;
}

const dayMs = 86_400_000;

function dayNumber(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime() / dayMs;
}

function dayString(day: number): string {
  return new Date(day * dayMs).toISOString().slice(0, 10);
}

export function validSchedule(dates: ScheduleDates): boolean {
  const start = dayNumber(dates.start);
  const end = dayNumber(dates.end);
  return start !== null && end !== null && start <= end;
}

export function shiftSchedule(dates: ScheduleDates, grabbed: string, dropped: string): ScheduleDates | null {
  const start = dayNumber(dates.start), end = dayNumber(dates.end);
  const from = dayNumber(grabbed), to = dayNumber(dropped);
  if (start === null || end === null || start > end || from === null || to === null) return null;
  const nextStart = dayString(start + to - from), nextEnd = dayString(end + to - from);
  return validSchedule({ start: nextStart, end: nextEnd }) ? { start: nextStart, end: nextEnd } : null;
}

export function resizeSchedule(dates: ScheduleDates, edge: "start" | "end", dropped: string): ScheduleDates | null {
  const start = dayNumber(dates.start), end = dayNumber(dates.end), target = dayNumber(dropped);
  if (start === null || end === null || start > end || target === null) return null;
  return edge === "start"
    ? { start: dayString(Math.min(target, end)), end: dates.end }
    : { start: dates.start, end: dayString(Math.max(target, start)) };
}

export function scheduleChanged(target: ScheduleTarget): boolean {
  if (target.cancel) return Boolean(target.baseline.start || target.baseline.end);
  return target.dates.start !== target.baseline.start || target.dates.end !== target.baseline.end;
}

export function editSchedule(target: ScheduleTarget, dates: ScheduleDates): ScheduleTarget {
  if (target.readOnlyReason || target.result === "uncertain") return target;
  return { ...target, dates, cancel: false };
}

export function cancelSchedule(target: ScheduleTarget): ScheduleTarget {
  if (target.readOnlyReason || target.result === "uncertain") return target;
  return { ...target, dates: { start: "", end: "" }, cancel: true };
}

/** 清空协议尚未验证；本函数绝不将其视为可发送的写入。 */
export function scheduleValidation(target: ScheduleTarget): string | null {
  if (!scheduleChanged(target)) return null;
  if (target.result === "uncertain") return "暂时无法确认是否保存，请先在飞书核对";
  if (target.readOnlyReason) return target.readOnlyReason;
  const identity = target.identity;
  if (!target.id.trim() || !target.nodeId.trim() || !identity ||
      ![identity.connection, identity.project, identity.type, identity.item, identity.node].every(value => value?.trim()) ||
      identity.node !== target.nodeId || (identity.scope !== "personal" && identity.scope !== "node") ||
      (identity.scope === "personal" && !identity.owner?.trim())) return "排期目标身份不完整，请重新读取";
  if (target.cancel) return "当前连接尚未验证取消日期";
  if (!validSchedule(target.dates)) return "请填写有效的开始和结束日期，结束日期不能早于开始日期";
  return null;
}

/** 只以冻结的提交值推进基线；未知结果保持冻结，不能凭再次编辑解除。 */
export function settleSchedule(target: ScheduleTarget, submitted: ScheduleDates, result: ScheduleResult): ScheduleTarget {
  if (target.result === "uncertain") return target;
  const frozen = { ...submitted };
  if (result === "accepted") return { ...target, baseline: frozen, result, submitted: frozen };
  return { ...target, result, submitted: frozen };
}
