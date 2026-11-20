import { useEffect, useId, useState } from "react";
import { ChevronDown, GitBranch, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ScheduleDescription } from "./ScheduleDescription";
import { ScheduleAvatar } from "./ScheduleAvatar";
import type { SchedulePerson, ScheduleRead } from "./scheduleApi";
import type { Snapshot } from "./types";
import { Workflow, type WorkflowNavigationState, type WorkflowSubmit } from "./Workflow";

export type ScheduleDefect = {
  project: string;
  item: string;
  title: string;
  status: string;
  priority?: string | null;
  owners: SchedulePerson[];
};

type DefectResult = { defects: ScheduleDefect[]; failed_projects: string[] };
type DefectState = DefectResult & { key: string; auth: string; loading: boolean };

export function defectKey(defect: ScheduleDefect) {
  return JSON.stringify([defect.project, "issue", defect.item]);
}

function priorityLevel(priority?: string | null) {
  const level = /^P([0-4])$/i.exec(priority?.trim() || "")?.[1];
  return level === undefined ? undefined : Number(level);
}

const priorityLevels = [0, 1, 2, 3, 4];

function DefectPriority({ priority }: { priority?: string | null }) {
  if (!priority) return null;
  const level = priorityLevel(priority);
  return <span className="schedule-defect-priority" data-level={level}>{level === undefined ? priority : `P${level}`}</span>;
}

const isInProgress = (status: string) => status === "处理中";

function DefectStatus({ status }: { status: string }) {
  const tone = isInProgress(status) ? "active" : status === "挂起" ? "paused"
    : status === "待处理" || status === "重新打开" ? "pending" : undefined;
  return <span className="schedule-defect-status" data-tone={tone}>{status}</span>;
}

export function useScheduleDefects(read: ScheduleRead | null, snapshot: Snapshot | null | undefined, revision: number, context?: string) {
  const connection = read?.connection || read?.targets[0]?.identity.connection;
  const projects = new Set<string>();
  const addProject = (project?: string | null) => { if (project) projects.add(project); };
  for (const project of read?.defectProjects || []) addProject(project);
  for (const target of read?.targets || []) addProject(target.identity.project);
  for (const scope of read?.historyScopes || []) addProject(scope.project);
  const sources = (snapshot?.sources || []).filter((source) => source.enabled && source.executable);
  const sourceIds = new Set(sources.map((source) => source.id));
  for (const source of sources) {
    if (source.type_scope?.configured) {
      for (const type of source.type_scope.types) if (type.selected) addProject(type.project_key);
    } else {
      addProject(source.project_key);
    }
  }
  for (const item of snapshot?.items || []) {
    if (item.source_ids?.some((id) => sourceIds.has(id))) addProject(item.id.project_key);
  }
  const key = connection && read?.currentUserId && !read.accountError && projects.size
    ? JSON.stringify({ connection, projects: [...projects].sort() }) : "";
  const auth = JSON.stringify([context, connection, read?.currentUserId]);
  const [state, setState] = useState<DefectState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const sessionId = read?.sessionId;

  useEffect(() => {
    if (!key) return;
    const request: { connection: string; projects: string[] } = JSON.parse(key);
    const scope = new Set(request.projects);
    let active = true;
    setState((current) => ({
      key, auth, loading: true,
      defects: current?.auth === auth ? current.defects.filter((defect) => scope.has(defect.project)) : [],
      failed_projects: current?.auth === auth ? current.failed_projects.filter((project) => scope.has(project)) : [],
    }));
    const settle = (result: DefectResult) => {
      if (!active) return;
      const failed = new Set(result.failed_projects);
      setState((current) => ({
        key, auth, loading: false, failed_projects: result.failed_projects,
        defects: [...(current?.auth === auth ? current.defects.filter((defect) => failed.has(defect.project)) : []), ...result.defects],
      }));
    };
    void Promise.resolve().then(() => invoke<DefectResult>("load_schedule_defects", request))
      .then(settle, () => settle({ defects: [], failed_projects: request.projects }));
    return () => { active = false; };
  }, [key, auth, sessionId, revision, attempt]);

  const visible = key && state?.auth === auth ? state : null;
  return {
    auth,
    defects: visible?.defects.filter((defect) => projects.has(defect.project)) || [],
    loading: Boolean(key && (visible?.key !== key || visible.loading)),
    failedProjects: visible?.failed_projects.filter((project) => projects.has(project)) || [],
    ready: Boolean(key),
    retry: () => setAttempt((value) => value + 1),
  };
}

export function ScheduleDefectList({ defects, currentUser, team, knownPeople, selected, select, groupStates, onGroupChange, loading, failed, ready, retry }: {
  defects: ScheduleDefect[];
  currentUser: string;
  team: boolean;
  knownPeople: SchedulePerson[];
  selected: string;
  select: (defect: ScheduleDefect) => void;
  groupStates: ReadonlyMap<string, boolean>;
  onGroupChange: (owner: string, expanded: boolean) => void;
  loading: boolean;
  failed: boolean;
  ready: boolean;
  retry: () => void;
}) {
  const [selectedPriority, setSelectedPriority] = useState<number | null>(null);
  const counts = priorityLevels.map(() => 0);
  for (const defect of defects) {
    const level = priorityLevel(defect.priority);
    if (level !== undefined) counts[level] += 1;
  }
  const sorted = defects.filter((defect) => selectedPriority === null || priorityLevel(defect.priority) === selectedPriority).sort((a, b) =>
    Number(isInProgress(b.status)) - Number(isInProgress(a.status)) ||
    (priorityLevel(a.priority) ?? 5) - (priorityLevel(b.priority) ?? 5) || a.title.localeCompare(b.title, "zh-CN"));
  const renderRow = (defect: ScheduleDefect) => {
    const key = defectKey(defect);
    return <div key={key} className={`schedule-pending-card${key === selected ? " selected" : ""}`}>
      <button type="button" className="schedule-pending-item" aria-pressed={key === selected} onClick={() => select(defect)}>
        <span className="schedule-pending-head schedule-defect-title"><strong>{defect.title}</strong><DefectPriority priority={defect.priority} /></span>
        <span className="schedule-pending-meta">
          <DefectStatus status={defect.status} />
        </span>
      </button>
    </div>;
  };
  const groups = new Map<string, { person: SchedulePerson; defects: ScheduleDefect[] }>();
  if (team) for (const defect of sorted) {
    for (const owner of defect.owners) {
      const key = JSON.stringify([defect.project, owner.id]);
      const known = knownPeople.find((person) => person.id === owner.id && person.project === defect.project)
        ?? knownPeople.find((person) => person.id === owner.id && !person.project);
      const group = groups.get(key) ?? {
        person: { ...owner, name: owner.name || known?.name || "成员", avatar: known?.avatar || owner.avatar }, defects: [],
      };
      group.defects.push(defect);
      groups.set(key, group);
    }
  }
  const rank = (id: string) => id === currentUser ? 0 : 1;
  const owners = [...groups].sort(([, first], [, second]) => rank(first.person.id) - rank(second.person.id)
    || first.person.name.localeCompare(second.person.name, "zh-CN"));
  return <>
    {(defects.length > 0 || (ready && !loading && !failed)) && (
      <div className="schedule-defect-priority-filters" role="group" aria-label="按缺陷优先级查看">
        {priorityLevels.map((level) => {
          const label = `P${level}`;
          const active = selectedPriority === level;
          return <button key={level} type="button" className="secondary" aria-label={`${label}，${counts[level]} 条`}
            aria-description={active ? "再次点击查看全部优先级" : undefined} aria-pressed={active}
            onClick={() => setSelectedPriority(active ? null : level)}>
            <DefectPriority priority={label} /><span className="schedule-defect-count">{counts[level]}</span>
          </button>;
        })}
      </div>
    )}
    <div className="schedule-pool-list" aria-label="未解决缺陷清单">
      {failed && <p className="schedule-pool-empty" role="status">
        {defects.length ? "部分缺陷暂未更新，已保留可用清单。" : "暂时无法读取全部缺陷。"}{" "}
        <button type="button" className="schedule-quick-chip" disabled={loading} onClick={retry}>重试</button>
      </p>}
      {!defects.length && !failed && <p className="schedule-pool-empty" role="status">
        {loading ? "正在读取未解决缺陷…" : ready ? "当前筛选下暂无未解决缺陷" : "暂未取得可读取缺陷的空间"}
      </p>}
      {defects.length > 0 && sorted.length === 0 && <p className="schedule-pool-empty" role="status">当前筛选下暂无 P{selectedPriority} 缺陷</p>}
      {team ? owners.map(([key, group]) => {
        const mine = group.person.id === currentUser;
        const expanded = groupStates.get(key) ?? mine;
        return <div key={key} className="schedule-defect-group">
          <button type="button" className="schedule-group" aria-expanded={expanded} onClick={() => onGroupChange(key, !expanded)}>
            <ScheduleAvatar person={group.person} />
            <span className="schedule-group-name">{group.person.name}{mine && "（我）"}</span>
            <span className="schedule-group-count">{group.defects.length} 条</span>
            <ChevronDown size={14} className="schedule-group-chevron" aria-hidden="true" />
          </button>
          {expanded && group.defects.map(renderRow)}
        </div>;
      }) : sorted.map(renderRow)}
    </div>
  </>;
}

export function ScheduleDefectInspector({ defect, connection, projectName, workflow, stale, onWorkflowRead, onWorkflowNavigation, close }: {
  defect: ScheduleDefect;
  connection: string;
  projectName: string;
  workflow?: { busy: boolean; submit: WorkflowSubmit };
  stale: boolean;
  onWorkflowRead: (loading: boolean) => void;
  onWorkflowNavigation: (state: WorkflowNavigationState | null) => void;
  close: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const id = { project_key: defect.project, work_item_type_key: "issue", work_item_id: defect.item };
  return <aside className="schedule-inspector" aria-label="缺陷详情">
    <div className="schedule-inspector-head">
      <strong>缺陷详情</strong>
      <button type="button" className="icon-button" aria-label="关闭缺陷详情" onClick={close}><X size={16} aria-hidden="true" /></button>
    </div>
    <div className="schedule-editor">
      <div className="schedule-editor-meta"><span className="schedule-editor-tag">{projectName} · 缺陷跟踪</span></div>
      <div className="schedule-editor-heading"><h3 className="schedule-defect-title">{defect.title} <DefectPriority priority={defect.priority} /></h3></div>
      <ScheduleDescription connection={connection} project={defect.project} type="issue" item={defect.item} showItemLink />
      {stale && <p className="hint" role="status">该缺陷已移出当前清单，已保留当前流程编辑。</p>}
      <div className="schedule-sibling-nodes">
        <div className="schedule-node-workflow">
          <div className="schedule-node-workflow-header">
            <div className="schedule-node-workflow-context"><span>缺陷状态</span><DefectStatus status={defect.status} /></div>
            {workflow && <button type="button" className="schedule-node-workflow-trigger" aria-expanded={open} aria-controls={open ? panel : undefined} onClick={() => setOpen((value) => !value)}>
              <GitBranch size={13} aria-hidden="true" />
              {open ? "收起流程动作" : "查看可用流程动作"}
              <ChevronDown className="schedule-node-workflow-chevron" size={12} aria-hidden="true" />
            </button>}
          </div>
          {workflow && open && <div id={panel}>
            <Workflow item={{ id, name: defect.title }} available busy={workflow.busy} submit={workflow.submit}
              onInitialReadChange={onWorkflowRead} onNavigationStateChange={onWorkflowNavigation} />
          </div>}
        </div>
      </div>
    </div>
  </aside>;
}
