import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { DateRangePicker } from "./DateRangePicker";
import { Select } from "./Select";
import { ExternalLink } from "./ExternalLink";
import type { Snapshot } from "./types";
import { asError } from "./model";
import { readFailureMessage } from "./readFeedback";
import { closeScheduleSession, loadScheduleSession, submitScheduleTargets, type SchedulePerson, type ScheduleRead, type ScheduleRecord } from "./scheduleApi";
import { cancelSchedule, editSchedule, resizeSchedule, scheduleChanged, scheduleValidation, settleSchedule, shiftSchedule, validSchedule, type ScheduleTarget } from "./scheduleSession";
import "./schedule.css";

type Entry = ScheduleTarget & { record: ScheduleRecord; resultMessage?: string | null };
type Guard = { dirty: boolean; busy: boolean; uncertain: boolean };
type Drag = { id: string; kind: "new" | "move" | "start" | "end"; grabbed: string };
const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
};
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const monday = (value: string) => addDays(value, -((new Date(`${value}T00:00:00Z`).getUTCDay() + 6) % 7));
const initials = (name: string) => /[\u3400-\u9fff]/.test(name) ? Array.from(name)[0] : name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const resultLabel = { accepted: "上次提交：收到成功回执", failed: "上次提交：失败", uncertain: "上次提交：结果不确定", unsent: "上次提交：未发送" } as const;
function Avatar({ person }: { person?: SchedulePerson }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [person?.avatar]);
  const color = Array.from(person?.id || "").reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) % 4;
  return <span className={`schedule-avatar schedule-avatar-${color}`} aria-hidden="true">{person?.avatar && !failed ? <img src={person.avatar} alt="" onError={() => setFailed(true)} /> : person?.name ? initials(person.name) : <UserRound size={16} />}</span>;
}

export function SchedulePage({ onGuardChange, requestReload, snapshot }: { onGuardChange: (guard: Guard) => void; requestReload: (reload: () => void) => void; snapshot?: Snapshot | null }) {
  const [epoch, setEpoch] = useState(0);
  const [read, setRead] = useState<ScheduleRead | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [report, setReport] = useState("");
  const [selected, setSelected] = useState("");
  const [week, setWeek] = useState(() => monday(today()));
  const [view, setView] = useState<"mine" | "people">("mine");
  const [source, setSource] = useState("");
  const [project, setProject] = useState("");
  const [type, setType] = useState("");
  const [person, setPerson] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const [preview, setPreview] = useState<{ id: string; start: string; end: string } | null>(null);
  const drag = useRef<Drag | null>(null);
  const dirty = entries.some(scheduleChanged);
  const uncertain = entries.some((entry) => entry.result === "uncertain");
  const nodeKey = (entry: Entry) => JSON.stringify([entry.identity.connection, entry.identity.project, entry.identity.type, entry.identity.item, entry.identity.node]);
  const frozenNodes = new Set(entries.filter((entry) => entry.result === "uncertain").map(nodeKey));
  useEffect(() => { onGuardChange({ dirty, busy, uncertain }); }, [dirty, busy, uncertain, onGuardChange]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setRead(null); setEntries([]); setSelected(""); setReport("");
    const request = loadScheduleSession();
    request.then((result) => {
      if (!active) return;
      setRead(result);
      setEntries(result.targets.map((record) => ({ id: record.id, nodeId: record.identity.node, identity: record.identity, baseline: { ...record.dates }, dates: { ...record.dates }, cancel: false, readOnlyReason: record.readOnlyReason || (!record.identity.owner && !record.ownerIds.some(Boolean) ? "未能确认负责人，排期仅供查看" : undefined), record })));
    }).catch((failure: unknown) => { if (active) setError(`读取事项安排失败：${readFailureMessage(asError(failure).kind)}`); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; void closeScheduleSession(request).catch(() => {}); };
  }, [epoch]);
  const people = useMemo(() => new Map(read?.people.map((item) => [JSON.stringify([item.connection || null, item.project || null, item.id]), item]) || []), [read]);
  const personFor = (entry: Entry, id: string) => people.get(JSON.stringify([entry.identity.connection, entry.identity.project, id])) || people.get(JSON.stringify([null, null, id]));
  const displayPerson = (entry: Entry, id: string) => {
    const name = personFor(entry, id)?.name || id;
    const peers = (read?.people || []).filter((item) => item.connection === entry.identity.connection && item.project === entry.identity.project && item.name === name && item.id !== id);
    if (!peers.length) return name;
    const chars = Array.from(id);
    let length = Math.min(6, chars.length);
    while (length < chars.length && peers.some((peer) => Array.from(peer.id).slice(-length).join("") === chars.slice(-length).join(""))) length++;
    return `${name} (${chars.slice(-length).join("")})`;
  };
  const groupKey = (entry: Entry, id: string) => JSON.stringify([entry.identity.connection, entry.identity.project, id]);
  const projectNames = new Map((snapshot?.workspace_catalog || []).map((item) => [item.project_key, item.name || item.simple_name || item.project_key]));
  const typeNames = new Map((snapshot?.sources || []).flatMap((item) => (item.type_scope?.types || []).map((type) => [JSON.stringify([type.project_key, type.type_key]), type.type_name] as const)));
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  const visible = entries.filter((entry) => (!source || entry.record.sourceIds.includes(source)) && (!project || entry.identity.project === project) && (!type || JSON.stringify([entry.identity.project, entry.identity.type]) === type) && (view !== "people" || !person || entry.record.ownerIds.includes(person)) && (view === "people" || !!read?.accountError || entry.record.mine || entry.record.sourceAggregate || entry.record.unknownOwner || (!entry.identity.owner && !entry.record.ownerIds.some(Boolean))));
  const personOptions = new Map<string, Set<string>>();
  for (const item of read?.people || []) {
    if (project && item.project && item.project !== project) continue;
    if (!`${item.name} ${item.id}`.toLowerCase().includes(personQuery.toLowerCase())) continue;
    const names = personOptions.get(item.id) || new Set<string>(); names.add(item.name || item.id); personOptions.set(item.id, names);
  }
  const scopeSources = source ? read?.sources.filter((item) => item.id === source) || [] : read?.sources || [];
  const scopeErrors = read?.itemErrors?.filter((item) => !source || item.sources.includes(source)) || [];
  const scopeComplete = source ? scopeSources.length > 0 && scopeSources.every((item) => item.complete) && scopeErrors.length === 0 : read?.complete;
  const personRows = (items: Entry[]) => items.flatMap((entry) => (entry.record.ownerIds.length ? entry.record.ownerIds : [""]).filter((id) => !person || id === person).map((owner) => ({ entry, owner }))).sort((a, b) => (personFor(a.entry, a.owner)?.name || a.owner).localeCompare(personFor(b.entry, b.owner)?.name || b.owner) || groupKey(a.entry, a.owner).localeCompare(groupKey(b.entry, b.owner)));
  const scheduled = visible.filter((entry) => validSchedule(entry.dates) && entry.dates.start <= days[6] && entry.dates.end >= days[0]);
  const rows = view === "people" ? personRows(scheduled) : scheduled.map((entry) => ({ entry, owner: entry.record.ownerId || "" }));
  const pending = visible.filter((entry) => !validSchedule(entry.dates));
  const pendingRows = view === "people" ? personRows(pending) : pending.map((entry) => ({ entry, owner: entry.record.ownerId || "" }));
  const selectedEntry = visible.find((entry) => entry.id === selected);
  const canEdit = (entry: Entry) => view === "mine" && !read?.accountError && !entry.record.sourceAggregate && entry.record.mine && !entry.readOnlyReason && !frozenNodes.has(nodeKey(entry)) && !busy;
  const ownerLabel = (entry: Entry, owner: string) => {
    const ids = entry.identity.scope === "node" ? entry.record.ownerIds.filter(Boolean) : [owner || entry.identity.owner || ""].filter(Boolean);
    const labels = Array.from(new Set(ids)).map((id) => displayPerson(entry, id));
    if (entry.record.unknownOwner) labels.push("尚有负责人身份不明");
    return labels.join("、") || "负责人不明";
  };
  const targetLabel = (entry: Entry, owner: string) => `${entry.record.cacheKind === "detail_node" ? "事项详情缓存节点 · " : entry.record.sourceAggregate ? "来源聚合日期 · " : entry.identity.scope === "node" ? "节点共同排期 · " : ""}${ownerLabel(entry, owner)}`;
  const dateStatus = (entry: Entry) => {
    if ((!entry.record.cacheKind || entry.record.cacheKind === "node") && !entry.record.sourceAggregate) return entry.dates.start || entry.dates.end ? "日期待补齐" : "待安排";
    const label = (state?: string) => ({ empty: "明确为空", missing: "字段缺失", invalid: "日期无效", unknown: "未知", value: "有值" }[state || "unknown"] || "未知");
    return `开始：${entry.dates.start || label(entry.record.startState)}；结束：${entry.dates.end || label(entry.record.endState)}`;
  };
  const update = (id: string, fn: (entry: Entry) => ScheduleTarget) => setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...fn(entry) } : entry));
  const options = (values: Array<[string, string]>, all: string) => [{ value: "", label: all }, ...Array.from(new Map(values)).map(([value, label]) => ({ value, label }))];
  const startDrag = (event: DragEvent, entry: Entry, kind: Drag["kind"], grabbed: string) => {
    if (!canEdit(entry)) { event.preventDefault(); return; }
    drag.current = { id: entry.id, kind, grabbed }; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", entry.id); setSelected(entry.id);
  };
  const previewDay = (day: string) => {
    const current = drag.current; const entry = entries.find((item) => item.id === current?.id);
    if (!current || !entry) return;
    const dates = current.kind === "new" ? { start: day, end: day } : current.kind === "move" ? shiftSchedule(entry.dates, current.grabbed, day) : resizeSchedule(entry.dates, current.kind, day);
    if (dates) setPreview((old) => old?.id === entry.id && old.start === dates.start && old.end === dates.end ? old : { id: entry.id, ...dates });
  };
  const dropDay = (event: DragEvent, day: string) => {
    event.preventDefault(); const current = drag.current; drag.current = null; setPreview(null); if (!current || busyRef.current) return;
    update(current.id, (entry) => {
      if (!canEdit(entry)) return entry;
      const dates = current.kind === "new" ? { start: day, end: day } : current.kind === "move" ? shiftSchedule(entry.dates, current.grabbed, day) : resizeSchedule(entry.dates, current.kind, day);
      return dates ? editSchedule(entry, dates) : entry;
    });
  };
  const cancelDrop = (event: DragEvent) => { event.preventDefault(); const current = drag.current; drag.current = null; setPreview(null); if (current && current.kind !== "new" && !busyRef.current) update(current.id, cancelSchedule); };
  async function submit() {
    if (busyRef.current) return;
    const changed = entries.filter((entry) => scheduleChanged(entry) && !frozenNodes.has(nodeKey(entry)));
    const invalid = changed.map((entry) => ({ entry, message: scheduleValidation(entry) })).filter((entry) => entry.message);
    if (!changed.length) return;
    if (invalid.length) { setSelected(invalid[0].entry.id); setReport(`无法同步：${invalid[0].entry.record.title}：${invalid[0].message}`); return; }
    const frozen = changed.map((entry) => ({ id: entry.id, identity: entry.identity, dates: { ...entry.dates }, cancel: entry.cancel }));
    busyRef.current = true; onGuardChange({ dirty: true, busy: true, uncertain }); setBusy(true); setReport("");
    try {
      if (!read) throw new Error("排期会话已结束");
      const response = await submitScheduleTargets(read.sessionId, frozen);
      const results = new Map(response.results.map((result) => [result.id, result]));
      setEntries((current) => current.map((entry) => {
        const submission = frozen.find((item) => item.id === entry.id); if (!submission) return entry;
        return { ...entry, ...settleSchedule(entry, submission.dates, results.get(entry.id)?.result || "uncertain"), resultMessage: results.get(entry.id)?.message };
      }));
      const count = (result: string) => frozen.filter((item) => (results.get(item.id)?.result || "uncertain") === result).length;
      setReport(`本次同步：收到成功回执 ${count("accepted")} 项，失败 ${count("failed")} 项，结果不确定 ${count("uncertain")} 项，未发送 ${count("unsent")} 项；实际写请求 ${response.writeRequests} 次。成功回执未回读核验。`);
    } catch (failure) {
      // 只有桌面命令明确标记发送前失败时才能安全重试。
      const error = failure as { schedule_not_sent?: boolean; message?: string } | null;
      const unsent = error?.schedule_not_sent === true;
      setEntries((current) => current.map((entry) => { const item = frozen.find((value) => value.id === entry.id); return item ? { ...entry, ...settleSchedule(entry, item.dates, unsent ? "unsent" : "uncertain"), resultMessage: unsent ? error?.message : undefined } : entry; }));
      setReport(`本次同步：收到成功回执 0 项，失败 0 项，结果不确定 ${unsent ? 0 : frozen.length} 项，未发送 ${unsent ? frozen.length : 0} 项。${unsent ? error?.message || "会话校验未通过" : "请先在飞书核对；本次不会自动重发。"}`);
    } finally { busyRef.current = false; setBusy(false); }
  }
  return <section className="schedule-page" aria-label="事项安排">
    <div className="schedule-heading"><div><h1>事项安排</h1><p>当前个人待办覆盖事项的节点安排</p></div><button className="primary" disabled={!entries.some((entry) => scheduleChanged(entry) && !frozenNodes.has(nodeKey(entry))) || busy || loading} onClick={() => void submit()}>{busy ? "正在同步…" : "同步排期"}</button></div>
    {loading ? <p role="status">正在读取个人待办及节点排期…</p> : error ? <div className="banner warning" role="alert">{error} <button className="secondary" onClick={() => setEpoch((value) => value + 1)}>重新读取</button></div> : read && <>
      <div className="schedule-scope">来源：{scopeSources.map((item) => item.name).join("、") || "无可执行来源"}{scopeSources.length > 0 && ` · ${scopeComplete ? "完整读取" : "部分读取失败"}`} · 读取时间 {read.readAt}{read.readRequests !== undefined && ` · 读取请求 ${read.readRequests} 次`}<p>来源筛选按事项归属；节点不一定都出现在该来源的待办中。</p>{scopeSources.filter((item) => item.error).map((item) => <p key={item.id}>{item.name}：{item.error}</p>)}</div>
      {read.accountError && <div className="banner warning" role="alert">{read.accountError}；以下显示当前来源中可读取的安排，均为只读。</div>}
      {!!scopeErrors.length && <div className="banner warning">部分事项读取不完整，已保留本次成功读取的内容。{scopeErrors.map((item, index) => <p key={index}>{item.project} / {item.type} / {item.item} · {item.sources.map((id) => read.sources.find((source) => source.id === id)?.name || id).join("、")}：{item.message}</p>)}</div>}
      {report && <div className="banner warning" role="status">{report}</div>}
      {uncertain && <div className="banner warning">部分排期可能已保存，请在飞书核对。<button className="secondary" disabled={busy} onClick={() => requestReload(() => setEpoch((value) => value + 1))}>放弃本次编辑并重新读取</button></div>}
      <div className="schedule-toolbar"><div className="schedule-tabs" role="group" aria-label="排期视角"><button className={view === "mine" ? "active" : ""} onClick={() => setView("mine")}>我的排期</button><button className={view === "people" ? "active" : ""} onClick={() => setView("people")}>按人查看</button></div>
        <Select ariaLabel="筛选来源" value={source} onChange={setSource} options={options(read.sources.map((item) => [item.id, item.name]), "全部来源")} />
        <Select ariaLabel="筛选空间" value={project} onChange={(value) => { setProject(value); setType(""); }} options={options(entries.map((item) => [item.identity.project, projectNames.get(item.identity.project) || item.record.projectName || item.identity.project]), "全部空间")} />
        <Select ariaLabel="筛选类型" value={type} onChange={setType} options={options(entries.filter((item) => !project || item.identity.project === project).map((item) => [JSON.stringify([item.identity.project, item.identity.type]), `${projectNames.get(item.identity.project) || item.record.projectName || item.identity.project} · ${typeNames.get(JSON.stringify([item.identity.project, item.identity.type])) || item.record.typeName || item.identity.type}`]), "全部类型")} />
        {view === "people" && <><input aria-label="搜索人员" placeholder="搜索人员" value={personQuery} onChange={(event) => setPersonQuery(event.target.value)} /><Select ariaLabel="筛选人员" value={person} onChange={setPerson} options={options(Array.from(personOptions, ([id, names]) => [id, `${Array.from(names).join(" / ")} · ${id}`]), "全部人员")} /></>}
      </div>
      <div className="schedule-layout"><aside className="schedule-pending" onDragOver={(event) => { if (drag.current && drag.current.kind !== "new") { event.preventDefault(); setPreview(null); } }} onDrop={cancelDrop}><h2>日期未完整</h2><p>拖到日历安排日期，拖回此处取消排期。</p>{pendingRows.map(({ entry, owner }, index) => <Fragment key={`${entry.id}:${owner}`} >{view === "people" && (index === 0 || groupKey(pendingRows[index - 1].entry, pendingRows[index - 1].owner) !== groupKey(entry, owner)) && <div className="schedule-group"><Avatar person={personFor(entry, owner)} />{personFor(entry, owner)?.name || owner || "负责人不明"}{owner && <small>{owner}</small>}</div>}<button className="schedule-pending-item" draggable={canEdit(entry) && !entry.dates.start && !entry.dates.end} onDragStart={(event) => startDrag(event, entry, "new", "")} onDragEnd={() => { drag.current = null; setPreview(null); }} onClick={() => setSelected(entry.id)}><strong>{entry.record.title}</strong><span>{entry.record.nodeName} · {view === "people" ? <>{personFor(entry, owner)?.name || owner || "负责人不明"}{owner && ` (${owner})`} · {entry.record.cacheKind === "detail_node" ? "事项详情缓存节点 · " : entry.identity.scope === "node" && !entry.record.sourceAggregate && "节点共同排期 · "}{entry.record.sourceAggregate && "来源聚合日期 · "}{entry.record.unknownOwner && "尚有负责人身份不明 · "}</> : <>{targetLabel(entry, owner)} · </>}{dateStatus(entry)}</span>{entry.result && <span className="schedule-result">{resultLabel[entry.result]}</span>}{entry.readOnlyReason && <small>{entry.readOnlyReason}</small>}</button></Fragment>)}</aside>
        <div className="schedule-main"><div className="schedule-week-nav"><button className="icon-button" aria-label="上一周" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft size={18} /></button><strong>{days[0]} — {days[6]}</strong><button className="icon-button" aria-label="下一周" onClick={() => setWeek(addDays(week, 7))}><ChevronRight size={18} /></button><button className="secondary" onClick={() => setWeek(monday(today()))}>本周</button></div>
          <div className="schedule-calendar"><div className="schedule-days">{days.map((day, index) => <div key={day} className={index > 4 ? "weekend" : ""} onDragOver={(event) => { if (drag.current) { event.preventDefault(); previewDay(day); } }} onDrop={(event) => dropDay(event, day)}><span>周{["一", "二", "三", "四", "五", "六", "日"][index]}</span><strong>{day.slice(5)}</strong></div>)}</div>
            {preview && preview.start <= days[6] && preview.end >= days[0] && <div className="schedule-preview"><span style={{ gridColumn: `${Math.max(0, days.findIndex((day) => day >= preview.start)) + 1} / ${days.reduce((value, day, index) => day <= preview.end ? index : value, 0) + 2}` }}>{preview.start} → {preview.end}</span></div>}
            {rows.map(({ entry, owner }, rowIndex) => {
              const start = Math.max(0, days.findIndex((day) => day >= entry.dates.start)); const last = days.reduce((value, day, index) => day <= entry.dates.end ? index : value, 0);
              const weekendAt = Math.max(0, (5 - start) / (last - start + 1) * 100);
              return <Fragment key={`${entry.id}:${owner}`}>{view === "people" && (rowIndex === 0 || groupKey(rows[rowIndex - 1].entry, rows[rowIndex - 1].owner) !== groupKey(entry, owner)) && <div className="schedule-group"><Avatar person={personFor(entry, owner)} />{personFor(entry, owner)?.name || owner || "负责人不明"}{owner && <small>{owner}</small>}</div>}<div className="schedule-row"><div className="schedule-row-label"><Avatar person={personFor(entry, owner)} /><span>{entry.record.title}<small>{entry.record.nodeName} · {targetLabel(entry, owner)}</small>{entry.result && <small className="schedule-result">{resultLabel[entry.result]}</small>}</span></div><div className="schedule-row-grid" onDragOver={(event) => { if (drag.current) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); previewDay(days[Math.max(0, Math.min(6, Math.floor((event.clientX - rect.left) / rect.width * 7)))]); } }} onDrop={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const index = Math.max(0, Math.min(6, Math.floor((event.clientX - rect.left) / rect.width * 7))); dropDay(event, days[index]); }}>{days.map((day, index) => <div key={day} className={index > 4 ? "weekend" : ""} />)}<button type="button" className={`schedule-bar ${entry.id === selected ? "selected" : ""}`} style={{ gridColumn: `${start + 1} / ${last + 2}`, gridRow: 1, ...(last >= 5 ? { background: `linear-gradient(to right, var(--surface-selected) ${weekendAt}%, var(--surface-soft) ${weekendAt}%)` } : {}) }} draggable={canEdit(entry)} onDragStart={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const width = rect.width / (last - start + 1); const index = Math.max(start, Math.min(last, start + Math.floor((event.clientX - rect.left) / width))); startDrag(event, entry, "move", days[index]); }} onDragEnd={() => { drag.current = null; setPreview(null); }} onClick={() => setSelected(entry.id)} title={`${entry.record.title} · ${entry.record.nodeName}`}>
                {entry.dates.start < days[0] ? "‹ " : canEdit(entry) && <span className="schedule-handle start" draggable onDragStart={(event) => { event.stopPropagation(); startDrag(event, entry, "start", entry.dates.start); }} aria-hidden="true" />}{entry.record.title}{entry.result && ` · ${resultLabel[entry.result]}`}{entry.dates.end > days[6] ? " ›" : canEdit(entry) && <span className="schedule-handle end" draggable onDragStart={(event) => { event.stopPropagation(); startDrag(event, entry, "end", entry.dates.end); }} aria-hidden="true" />}</button></div></div></Fragment>;
            })}
            {rows.length === 0 && <div className="schedule-empty-body"><div className="schedule-empty-grid" onDragOver={(event) => { if (drag.current) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); previewDay(days[Math.max(0, Math.min(6, Math.floor((event.clientX - rect.left) / rect.width * 7)))]); } }} onDrop={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const index = Math.max(0, Math.min(6, Math.floor((event.clientX - rect.left) / rect.width * 7))); dropDay(event, days[index]); }}>{days.map((day, index) => <div key={day} className={index > 4 ? "weekend" : ""} />)}</div><p className="schedule-empty">{view === "people" && person && visible.length === 0 ? "当前范围未包含该人员的安排" : "本周暂无可显示的安排"}</p></div>}
          </div>
          {selectedEntry && <div className="schedule-editor"><div><h3>{selectedEntry.record.title}</h3><p>{selectedEntry.record.nodeName} · {targetLabel(selectedEntry, selectedEntry.record.ownerId || "")} {scheduleChanged(selectedEntry) && "· 未同步"}</p></div>{view === "mine" && <><DateRangePicker start={selectedEntry.dates.start} end={selectedEntry.dates.end} startLabel="开始日期" endLabel="结束日期" disabled={!canEdit(selectedEntry)} onChange={(start, end) => update(selectedEntry.id, (entry) => editSchedule(entry, { start, end }))} /><button className="secondary" disabled={!canEdit(selectedEntry) || (!selectedEntry.dates.start && !selectedEntry.dates.end)} onClick={() => update(selectedEntry.id, cancelSchedule)}>取消排期</button></>}<p>{dateStatus(selectedEntry)}</p>{selectedEntry.record.fetchedAt && <p>事项详情抓取时间 {selectedEntry.record.fetchedAt}</p>}{selectedEntry.readOnlyReason && <p>{selectedEntry.readOnlyReason}</p>}{selectedEntry.resultMessage && <p>{selectedEntry.resultMessage}</p>}{frozenNodes.has(nodeKey(selectedEntry)) && <p>该节点存在结果不确定的排期，请先在飞书核对并重新读取。</p>}{selectedEntry.record.itemUrl ? <ExternalLink href={selectedEntry.record.itemUrl}>在飞书查看</ExternalLink> : frozenNodes.has(nodeKey(selectedEntry)) && <p>无法确认飞书事项链接，请在飞书中按事项名称查找并核对。</p>}{scheduleChanged(selectedEntry) && scheduleValidation(selectedEntry) && <p role="alert">{scheduleValidation(selectedEntry)}</p>}</div>}
        </div></div>
      {view === "mine" && <div className="schedule-person"><Avatar person={people.get(JSON.stringify([null, null, read.currentUserId || ""]))} />{people.get(JSON.stringify([null, null, read.currentUserId || ""]))?.name || read.currentUserId || "当前用户"}</div>}
    </>}
    <span className="sr-only"><CalendarDays size={1} /></span>
  </section>;
}
