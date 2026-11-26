import type { ScheduleHistory, SchedulePerson, ScheduleRead, ScheduleRecord } from "./scheduleApi";

const personKey = ({ connection, project, id }: SchedulePerson) => JSON.stringify([connection, project, id]);
const recordKey = ({ id }: ScheduleRecord) => id;
const recordContent = ({ fetchedAt: _fetchedAt, ...record }: ScheduleRecord) => record;

function patchRows<T>(
  previous: T[], incoming: T[], key: (row: T) => string, retainMissing: boolean,
  content: (row: T) => unknown = (row) => row,
  merge: (prior: T, next: T) => T = (_prior, next) => next,
): T[] {
  const changes = new Map(incoming.map((row) => [key(row), row]));
  const rows = previous.flatMap((prior) => {
    const id = key(prior);
    const next = changes.get(id);
    changes.delete(id);
    if (!next) return retainMissing ? [prior] : [];
    const merged = merge(prior, next);
    return [JSON.stringify(content(merged)) === JSON.stringify(content(prior)) ? prior : merged];
  }).concat([...changes.values()]);
  return rows.length === previous.length && rows.every((row, index) => row === previous[index]) ? previous : rows;
}

export function patchScheduleData<T extends ScheduleRead | ScheduleHistory>(previous: T | undefined | null, next: T, retainMissing = false): T {
  if (!previous || previous.connection !== next.connection ||
      ("currentUserId" in previous && "currentUserId" in next && previous.currentUserId !== next.currentUserId)) return next;
  return {
    ...next,
    ...("sessionId" in previous && "sessionId" in next && previous.spaceNames
      ? { spaceNames: { ...previous.spaceNames, ...next.spaceNames } } : {}),
    targets: patchRows(previous.targets, next.targets, recordKey, retainMissing, recordContent, (prior, record) =>
      record.relatedProjects === undefined && prior.relatedProjects !== undefined
        ? { ...record, relatedProjects: prior.relatedProjects } : record),
    people: patchRows(previous.people, next.people, personKey, retainMissing),
  };
}
