import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Check, CircleAlert, ClipboardCheck } from "lucide-react";
import { getWorkflowActions } from "./api";
import { asError, itemKey } from "./model";
import { Select } from "./Select";
import { PercentageInput } from "./PercentageInput";
import { SteppedNumberInput } from "./SteppedNumberInput";
import { displayFieldValue, WorkflowConflict } from "./WorkflowConflict";
import { WorkflowReviewFields } from "./WorkflowReviewFields";
import { layoutFields, ownerCell } from "./workflowLayout";
import {
  changedFields,
  draftKey,
  migrateScheduleDraft,
  reconcileDraft,
  scheduleDraftTargets,
  readDraft,
  writeDraft,
} from "./workflowDrafts";
import type {
  CachedItem,
  WorkflowAction,
  WorkflowOptions,
  WorkflowRequest,
  WorkflowResult,
} from "./types";

type Field = WorkflowAction["fields"][number];

export function Workflow({
  item,
  available,
  busy,
  submit,
}: {
  item: CachedItem;
  available: boolean;
  busy: boolean;
  submit: (request: WorkflowRequest) => Promise<WorkflowResult | undefined>;
}) {
  const [options, setOptions] = useState<WorkflowOptions | null>(null);
  const [action, setAction] = useState<WorkflowAction | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [baseFields, setBaseFields] = useState<Record<string, string>>({});
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [review, setReview] = useState<WorkflowRequest | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const flight = useRef(false);
  const fieldId = useId();
  const workflowRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const identity = itemKey(item);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const reads = useRef(0);
  const backgroundRead = useRef<number | null>(null);
  const editor = useRef({
    action,
    options,
    fields,
    baseFields,
    fieldLabels,
    conflicts,
    review,
    blocked,
    busy,
  });
  editor.current = {
    action,
    options,
    fields,
    baseFields,
    fieldLabels,
    conflicts,
    review,
    blocked,
    busy,
  };
  const checkRemoteRef = useRef(() => {});
  checkRemoteRef.current = () => void checkRemote();
  useEffect(() => {
    reads.current += 1;
    let active = true;
    setOptions(null);
    setAction(null);
    setReview(null);
    setError("");
    setBlocked(false);
    setPending(false);
    if (!available || !item.id.project_key || !item.id.work_item_type_key)
      return;
    setLoading(true);
    void getWorkflowActions(item.id)
      .then((v) => {
        if (active) setOptions(v);
      })
      .catch((e) => {
        if (active) setError(asError(e).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      reads.current += 1;
    };
  }, [identity, available, revision]);

  useLayoutEffect(() => {
    const workflow = workflowRef.current;
    const content = contentRef.current;
    if (!action || !workflow || !content) return;

    // Open long forms at the last field; review content starts at its heading.
    let followEnd = !review;
    content.scrollTop = review ? 0 : content.scrollHeight;
    const detail = workflow.closest<HTMLElement>(".detail");
    if (!detail) return;

    const trackScroll = () => {
      followEnd =
        content.scrollHeight - content.clientHeight - content.scrollTop <= 1;
    };
    const reveal = () => {
      if (followEnd) content.scrollTop = content.scrollHeight;
      const viewport = detail.getBoundingClientRect();
      const header = detail.querySelector<HTMLElement>(".detail-top");
      const top = viewport.top + (header?.offsetHeight ?? 0) + 16;
      const bottom = viewport.bottom - 16;
      const bounds = workflow.getBoundingClientRect();
      if (bounds.bottom > bottom) detail.scrollTop += bounds.bottom - bottom;
      else if (bounds.top < top) detail.scrollTop += bounds.top - top;
    };
    reveal();
    content.addEventListener("scroll", trackScroll);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reveal);
    observer?.observe(workflow);
    observer?.observe(content);
    observer?.observe(detail);
    return () => {
      content.removeEventListener("scroll", trackScroll);
      observer?.disconnect();
    };
  }, [action?.id, !!review]);

  useEffect(() => {
    const onFocus = () => checkRemoteRef.current();
    const onVisible = () => {
      if (document.visibilityState === "visible") checkRemoteRef.current();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  useEffect(() => {
    if (action) checkRemoteRef.current();
  }, [action?.id]);
  const lastItemVersion = useRef({
    identity,
    detail: item.detail_revision,
    updated: item.updated_at_ms,
  });
  useEffect(() => {
    const previous = lastItemVersion.current;
    lastItemVersion.current = {
      identity,
      detail: item.detail_revision,
      updated: item.updated_at_ms,
    };
    if (
      previous.identity === identity &&
      (previous.detail !== item.detail_revision ||
        previous.updated !== item.updated_at_ms)
    ) {
      checkRemoteRef.current();
    }
  }, [identity, item.detail_revision, item.updated_at_ms]);

  async function checkRemote() {
    const current = editor.current;
    if (
      !available ||
      !current.action ||
      !current.options ||
      current.review ||
      current.blocked ||
      current.busy ||
      flight.current ||
      backgroundRead.current !== null
    )
      return;
    const origin = identity,
      actionId = current.action.id,
      read = ++reads.current;
    backgroundRead.current = read;
    try {
      const latest = await getWorkflowActions(item.id, true);
      if (reads.current !== read || identityRef.current !== origin) return;
      const now = editor.current;
      if (
        now.action?.id !== actionId ||
        !now.options ||
        now.review ||
        now.blocked ||
        now.busy ||
        flight.current
      )
        return;
      const nextAction = latest.actions.find((next) => next.id === actionId);
      if (!nextAction) {
        setOptions(latest);
        setAction(null);
        setError(
          "云端流程已变化，原动作已不可用。草稿已保留，请重新选择动作。",
        );
        return;
      }
      const merged = reconcileDraft(
        nextAction,
        {
          fields: now.fields,
          base_fields: now.baseFields,
          field_labels: now.fieldLabels,
          conflicts: now.conflicts,
          version: now.options.version,
          updated_at: Date.now(),
        },
        latest.version,
      );
      const key = draftKey(origin, actionId);
      const hasDraft =
        readDraft(key) !== null ||
        Object.entries(now.fields).some(
          ([key, value]) => value !== now.baseFields[key],
        );
      if (hasDraft)
        writeDraft(key, {
          ...merged,
          version: latest.version,
          updated_at: Date.now(),
        });
      setOptions(latest);
      setAction(nextAction);
      setFields(merged.fields);
      setBaseFields(merged.base_fields);
      setFieldLabels(merged.field_labels);
      setConflicts(merged.conflicts);
      setDraftStatus(
        hasDraft ? "草稿已保存在本机" : "修改会自动保存为本机草稿",
      );
      setError("");
    } catch (e) {
      if (reads.current === read && identityRef.current === origin)
        setError(`云端检查未完成：${asError(e).message}`);
    } finally {
      if (backgroundRead.current === read) backgroundRead.current = null;
    }
  }

  function choose(next: WorkflowAction, values: Record<string, string> = {}) {
    if (!options || busy || flight.current) return;
    reads.current += 1;
    backgroundRead.current = null;
    setError("");
    setReview(null);
    setAcknowledged(false);
    setBlocked(false);
    try {
      const saved = readDraft(draftKey(identity, next.id));
      const transferred = Object.keys(values);
      const previousDraft =
        !saved?.pending && transferred.length
          ? {
              fields: { ...saved?.fields, ...values },
              base_fields: {
                ...saved?.base_fields,
                ...Object.fromEntries(
                  transferred.map((key) => [key, baseFields[key]]),
                ),
              },
              field_labels: { ...saved?.field_labels, ...fieldLabels },
              conflicts: [
                ...(saved?.conflicts ?? []).filter(
                  (key) => !transferred.includes(key),
                ),
                ...conflicts.filter((key) => transferred.includes(key)),
              ],
              version: options.version,
              updated_at: Date.now(),
            }
          : saved;
      const draft = migrateScheduleDraft(next, previousDraft);
      if (
        (transferred.length || draft !== previousDraft) &&
        draft &&
        !draft.pending
      )
        writeDraft(draftKey(identity, next.id), draft);
      const initial = reconcileDraft(next, null, options.version);
      // 先恢复上次编辑快照，后台读取后再推进基线，避免旧缓存制造冲突。
      const restored =
        !draft || draft.pending
          ? reconcileDraft(next, draft, options.version)
          : {
              fields: { ...initial.fields, ...draft.fields },
              base_fields: {
                ...Object.fromEntries(
                  Object.entries(initial.base_fields).filter(
                    ([key]) => draft.fields[key] === undefined,
                  ),
                ),
                ...draft.base_fields,
              },
              field_labels: { ...draft.field_labels, ...initial.field_labels },
              conflicts: draft.conflicts ?? [],
            };
      setFields(restored.fields);
      setBaseFields(restored.base_fields);
      setFieldLabels(restored.field_labels);
      setConflicts(restored.conflicts);
      setBlocked(!!draft?.pending);
      setDraftStatus(
        draft?.pending
          ? "已恢复本机草稿，上次提交结果待核实。"
          : draft
            ? "已恢复本机草稿"
            : "修改会自动保存为本机草稿",
      );
      if (draft && !draft.pending)
        setOptions({ ...options, version: draft.version });
      setAction(next);
    } catch (e) {
      setError(asError(e).message);
    }
  }
  function change(key: string, value: string) {
    if (!action || !options) return;
    const next = { ...fields, [key]: value };
    editor.current.fields = next;
    setFields(next);
    setReview(null);
    try {
      writeDraft(draftKey(identity, action.id), {
        fields: next,
        base_fields: baseFields,
        field_labels: fieldLabels,
        conflicts,
        version: options.version,
        updated_at: Date.now(),
      });
      setDraftStatus("草稿已保存在本机");
      setError("");
    } catch {
      setDraftStatus("");
      setError("草稿自动保存失败，当前输入仅保留在本次窗口中；请勿关闭页面。");
    }
  }
  async function prepare() {
    if (
      !action ||
      !options ||
      action.disabled_reason ||
      busy ||
      flight.current ||
      blocked
    )
      return;
    const origin = identity;
    const read = ++reads.current;
    flight.current = true;
    setPending(true);
    setError("");
    try {
      const latest = await getWorkflowActions(item.id, true);
      if (identityRef.current !== origin || reads.current !== read) return;
      const nextAction = latest.actions.find((next) => next.id === action.id);
      if (!nextAction) {
        setOptions(latest);
        setAction(null);
        setReview(null);
        setError(
          "云端流程已变化，原动作已不可用。草稿已保留，请重新选择动作。",
        );
        return;
      }
      const previous = editor.current;
      const merged = reconcileDraft(
        nextAction,
        {
          fields: previous.fields,
          base_fields: previous.baseFields,
          field_labels: previous.fieldLabels,
          conflicts: previous.conflicts,
          version: options.version,
          updated_at: Date.now(),
        },
        latest.version,
      );
      writeDraft(draftKey(identity, action.id), {
        ...merged,
        version: latest.version,
        updated_at: Date.now(),
      });
      setOptions(latest);
      setAction(nextAction);
      setFields(merged.fields);
      setBaseFields(merged.base_fields);
      setFieldLabels(merged.field_labels);
      setConflicts(merged.conflicts);
      setReview(null);
      setDraftStatus("草稿已保存在本机");
      // 新出现或再次变化的冲突先展示；已展示的值由正常提交确认最终内容。
      if (
        merged.conflicts.some(
          (key) =>
            nextAction.fields.some((field) => field.key === key) &&
            !!merged.base_fields[key]?.trim() &&
            (!previous.conflicts.includes(key) ||
              previous.baseFields[key] !== merged.base_fields[key]),
        )
      ) {
        return;
      }
      if (nextAction.disabled_reason) return;
      const missing = nextAction.fields.find(
        (field) => field.required && !merged.fields[field.key]?.trim(),
      );
      if (missing) {
        setError(`请完成必填字段：${missing.label}`);
        return;
      }
      const invalidOption = nextAction.fields.find(
        (field) =>
          !field.read_only &&
          field.kind === "select" &&
          merged.fields[field.key]?.trim() &&
          !field.options?.some(
            (option) => option.value === merged.fields[field.key].trim(),
          ),
      );
      if (invalidOption) {
        setError(`请重新选择${invalidOption.label}：原选项已不可用。`);
        return;
      }
      setReview({
        item_id: item.id,
        action_id: action.id,
        version: latest.version,
        fields: changedFields(nextAction, merged.fields, merged.base_fields),
        request_id: crypto.randomUUID(),
      });
      setAcknowledged(false);
    } catch (e) {
      if (identityRef.current === origin && reads.current === read)
        setError(asError(e).message);
    } finally {
      flight.current = false;
      if (identityRef.current === origin) setPending(false);
    }
  }
  async function confirm() {
    if (
      !review ||
      !action ||
      busy ||
      flight.current ||
      blocked ||
      !acknowledged
    )
      return;
    const origin = identity,
      key = draftKey(identity, action.id),
      request = review;
    flight.current = true;
    reads.current += 1;
    setPending(true);
    setError("");
    try {
      writeDraft(key, {
        fields,
        base_fields: baseFields,
        field_labels: fieldLabels,
        conflicts,
        version: request.version,
        updated_at: Date.now(),
        pending: request,
      });
    } catch {
      setError("无法记录本次提交，尚未向飞书发送请求。请检查本机存储。");
      flight.current = false;
      setPending(false);
      return;
    }
    try {
      setBlocked(true);
      setDraftStatus("本机草稿已保留，正在等待飞书提交结果。");
      const result = await submit(request);
      if (!result || result.outcome === "unknown") {
        if (identityRef.current === origin) {
          setReview(null);
          setDraftStatus("本机草稿已保留，本次提交结果待核实。");
          setError(
            result
              ? ""
              : "未收到明确的提交结论，请先核对飞书状态，草稿已保留。",
          );
        }
        return;
      }
      let cleanupError = "";
      try {
        if (result.outcome === "verified") {
          const retained = Object.fromEntries(
            Object.entries(fields).filter(
              ([field]) => !action.fields.some((known) => known.key === field),
            ),
          );
          const retainedKeys = Object.keys(retained);
          if (retainedKeys.length) {
            writeDraft(key, {
              fields: retained,
              base_fields: Object.fromEntries(
                Object.entries(baseFields).filter(([field]) =>
                  retainedKeys.includes(field),
                ),
              ),
              field_labels: Object.fromEntries(
                Object.entries(fieldLabels).filter(([field]) =>
                  retainedKeys.includes(field),
                ),
              ),
              conflicts: retainedKeys,
              version: request.version,
              updated_at: Date.now(),
            });
          } else localStorage.removeItem(key);
        } else
          writeDraft(key, {
            fields,
            base_fields: baseFields,
            field_labels: fieldLabels,
            conflicts,
            version: request.version,
            updated_at: Date.now(),
          });
      } catch {
        cleanupError = `${result.message}。本机草稿提交标记未能清理，再次操作前请核对飞书状态。`;
      }
      if (identityRef.current !== origin) return;
      setAction(null);
      setReview(null);
      if (cleanupError) setError(cleanupError);
      else setRevision((v) => v + 1);
    } catch (e) {
      const failure = asError(e);
      const rejected = [
        "conflict",
        "validation",
        "config",
        "credential",
      ].includes(failure.kind);
      let released = rejected;
      if (rejected) {
        try {
          writeDraft(key, {
            fields,
            base_fields: baseFields,
            field_labels: fieldLabels,
            conflicts,
            version: request.version,
            updated_at: Date.now(),
          });
        } catch {
          released = false;
        }
      }
      if (identityRef.current === origin) {
        setBlocked(!released);
        setReview(null);
        setDraftStatus(
          released
            ? "本机草稿已保留，本次请求被拒绝。"
            : "本机草稿和提交标记已保留，请核对提交状态。",
        );
        setError(
          released
            ? failure.message
            : `提交状态需要核实：${failure.message}。草稿已保留，请先核对飞书状态。`,
        );
      }
    } finally {
      flight.current = false;
      if (identityRef.current === origin) setPending(false);
    }
  }
  async function recover() {
    if (!action || !options || flight.current || busy) return;
    const origin = identity,
      actionId = action.id,
      key = draftKey(identity, actionId),
      read = ++reads.current;
    backgroundRead.current = null;
    flight.current = true;
    setPending(true);
    setError("");
    try {
      const latest = await getWorkflowActions(item.id, true);
      if (identityRef.current !== origin || reads.current !== read) return;
      const nextAction = latest.actions.find((next) => next.id === actionId);
      if (!nextAction) {
        setOptions(latest);
        setAction(null);
        setReview(null);
        setBlocked(false);
        setError(
          "云端已不再提供原动作。草稿已保留，请根据当前流程重新选择动作。",
        );
        return;
      }
      const saved = readDraft(key);
      const merged = reconcileDraft(
        nextAction,
        {
          fields: saved?.fields ?? fields,
          base_fields: saved?.base_fields ?? baseFields,
          field_labels: saved?.field_labels ?? fieldLabels,
          conflicts: saved?.conflicts ?? conflicts,
          version: saved?.version ?? options.version,
          updated_at: Date.now(),
        },
        latest.version,
      );
      writeDraft(key, {
        ...merged,
        version: latest.version,
        updated_at: Date.now(),
      });
      setOptions(latest);
      setAction(nextAction);
      setFields(merged.fields);
      setBaseFields(merged.base_fields);
      setFieldLabels(merged.field_labels);
      setConflicts(merged.conflicts);
      setReview(null);
      setAcknowledged(false);
      setBlocked(false);
      setDraftStatus(
        "已重新读取云端，草稿已保留。请核对当前值后继续；上次提交结果仍以云端为准。",
      );
    } catch (e) {
      if (identityRef.current === origin && reads.current === read)
        setError(
          `重新读取未完成：${asError(e).message}。草稿和提交标记已保留。`,
        );
    } finally {
      flight.current = false;
      if (identityRef.current === origin) setPending(false);
    }
  }
  const locked = busy || pending;
  const retainedKeys = Object.keys(fields).filter(
    (key) => action && !action.fields.some((field) => field.key === key),
  );
  const retainedTargets = new Map(
    retainedKeys.map((key) => [
      key,
      action ? scheduleDraftTargets(action, key) : [],
    ]),
  );
  function restoreRetained(source: string, target: string) {
    if (
      !action ||
      !options ||
      locked ||
      blocked ||
      !retainedTargets.get(source)?.some((field) => field.key === target)
    )
      return;
    const next = { ...fields };
    const base = { ...baseFields };
    const labels = { ...fieldLabels };
    const previous = next[target];
    next[target] = next[source];
    // 用户明确选择此前草稿；已有的不同本机修改仍保留为可切换的另一份内容。
    const keepPrevious =
      previous !== undefined &&
      previous !== next[source] &&
      (conflicts.includes(target) || previous !== base[target]);
    if (keepPrevious) {
      next[source] = previous;
      base[source] = base[target] ?? "";
    } else {
      delete next[source];
      delete base[source];
      delete labels[source];
    }
    const remaining = conflicts.filter(
      (key) => key !== source && key !== target,
    );
    if (keepPrevious) remaining.push(source);
    if (
      next[target] !== base[target] &&
      (conflicts.includes(target) || !!base[target]?.trim())
    )
      remaining.push(target);
    try {
      writeDraft(draftKey(identity, action.id), {
        fields: next,
        base_fields: base,
        field_labels: labels,
        conflicts: remaining,
        version: options.version,
        updated_at: Date.now(),
      });
      editor.current.fields = next;
      setFields(next);
      setBaseFields(base);
      setFieldLabels(labels);
      setConflicts(remaining);
      setReview(null);
      setDraftStatus("草稿已保存在本机");
      setError("");
    } catch {
      setError("无法保存草稿恢复结果，原有两份内容均已保留，请重试。");
    }
  }
  function retainedNote(field: Field) {
    return retainedKeys
      .filter((key) => {
        const targets = retainedTargets.get(key);
        return targets?.length === 1 && targets[0].key === field.key;
      })
      .map((key) => (
        <div
          className="workflow-conflict"
          role="group"
          aria-label={`${field.label}此前草稿`}
          key={key}
        >
          <p className="hint">
            另有此前草稿：{fields[key] || "（空）"}
            。当前输入已保留，可选择填入；本次仅提交输入框中的值。
          </p>
          <button
            type="button"
            className="text-button"
            disabled={locked || blocked}
            onClick={() => restoreRetained(key, field.key)}
          >
            将此前草稿填入{field.label}
          </button>
        </div>
      ));
  }
  function retainedDrafts() {
    const keys = review
      ? retainedKeys
      : retainedKeys.filter((key) => retainedTargets.get(key)?.length !== 1);
    if (!keys.length) return null;
    const content = keys.map((key) => (
      <div
        className="workflow-recovery"
        role="group"
        aria-label={`${fieldLabels[key] || "原表单字段"}保留草稿`}
        key={key}
      >
        <p className="hint">
          {fieldLabels[key] || "原表单字段"}
          不在本次提交字段中，以下内容仍保留在本机。
        </p>
        <p>本次不提交：{fields[key] || "（空）"}</p>
        {!review && (retainedTargets.get(key)?.length ?? 0) > 1 && (
          <Select
            ariaLabel={`将${fieldLabels[key] || "原表单字段"}草稿填入`}
            disabled={locked || blocked}
            value=""
            onChange={(target) => restoreRetained(key, target)}
            options={[
              { value: "", label: "选择要填入的负责人字段" },
              ...retainedTargets
                .get(key)!
                .map((field) => ({ value: field.key, label: field.label })),
            ]}
          />
        )}
      </div>
    ));
    return review ? (
      <div aria-label="本次未提交的保留草稿">{content}</div>
    ) : (
      <details className="workflow-recovery">
        <summary>其他保留草稿（{keys.length}）</summary>
        {content}
      </details>
    );
  }
  const flowActions = options?.actions.filter(
    (candidate) =>
      !candidate.id.startsWith("node:progress:") &&
      !candidate.id.startsWith("node:schedule:"),
  );
  const progressOnly = action?.id.startsWith("node:progress:") ?? false;
  const scheduleOnly = action?.id.startsWith("node:schedule:") ?? false;
  function syncFor(candidate: WorkflowAction, kind: "progress" | "schedule") {
    return candidate.id.startsWith("node:confirm:")
      ? options?.actions.find(
          (next) =>
            !next.disabled_reason &&
            next.id === candidate.id.replace("node:confirm:", `node:${kind}:`),
        )
      : undefined;
  }
  const progressAction = action ? syncFor(action, "progress") : undefined;
  const scheduleAction = action ? syncFor(action, "schedule") : undefined;
  const segments = layoutFields(action?.fields ?? []);
  const scheduleKeys = new Set(
    scheduleAction?.fields.map((field) => field.key),
  );
  const scheduleSegment = segments.reduce((last, segment, index) => {
    const segmentFields =
      segment.kind === "field"
        ? [segment.field]
        : Object.values(segment.table.cells);
    return segmentFields.some((field) => scheduleKeys.has(field.key))
      ? index
      : last;
  }, -1);
  function scheduleButton() {
    if (!scheduleAction) return null;
    return (
      <button
        type="button"
        className="secondary"
        disabled={locked || blocked}
        onClick={() =>
          choose(
            scheduleAction,
            Object.fromEntries(
              scheduleAction.fields.map((field) => [
                field.key,
                fields[field.key] ?? "",
              ]),
            ),
          )
        }
      >
        仅同步此日期
      </button>
    );
  }
  const acknowledgement = progressOnly
    ? "我已核对进度，本次仅同步进度并保留当前节点"
    : scheduleOnly
      ? "我已核对开始和结束日期，本次仅同步日期并保留当前节点"
      : "我已核对填写内容，理解提交后的修改限制";
  const rollback = action?.id.startsWith("node:rollback:") ?? false;
  const confirmLabel = progressOnly
    ? "确认同步进度"
    : scheduleOnly
      ? "确认同步日期"
      : rollback
        ? "确认回滚节点"
        : action?.id.startsWith("node:confirm:")
          ? "确认完成节点"
          : action?.kind === "state"
            ? `确认${action.label}`
            : "确认提交并执行";
  const fieldIndex = new Map(
    action?.fields.map((field, index) => [field.key, index]),
  );
  const labelId = (field: Field) => `${fieldId}-${fieldIndex.get(field.key)}`;
  const remoteOf = (field: Field) =>
    baseFields[field.key] ?? field.initial_value ?? "";
  // 数值和下拉留空时用占位文字说明沿用云端；文本需复制云端值协作修改，日期控件不显示占位文字。
  const compactKeep = (field: Field) =>
    field.kind === "number" || field.kind === "select";
  function placeholderOf(field: Field, inTable = false) {
    const remote = remoteOf(field).trim();
    if ((fields[field.key] ?? "").trim()) return undefined;
    if (field.required) return inTable ? "必填" : undefined;
    if (!remote || !compactKeep(field)) return undefined;
    return `沿用 ${displayFieldValue(field, remote)}`;
  }
  function cloudNote(field: Field, caption?: string) {
    if (field.read_only) return null;
    const remote = remoteOf(field);
    const local = fields[field.key] ?? "";
    if (local.trim() === remote.trim()) return null;
    // 可选字段留空时实际沿用最新云端值；保留草稿冲突记录，但不显示待解决的覆盖冲突。
    const conflict =
      conflicts.includes(field.key) && (field.required || !!local.trim());
    if (
      !conflict &&
      (!field.scope ||
        !remote.trim() ||
        (!local.trim() && !field.required && compactKeep(field)))
    )
      return null;
    return (
      <WorkflowConflict
        key={field.key}
        field={field}
        remote={remote}
        value={local}
        conflict={conflict}
        disabled={locked || blocked}
        caption={caption}
        onRestore={() => change(field.key, remote)}
      />
    );
  }
  function control(field: Field, inTable = false) {
    if (field.read_only)
      return (
        <span className="workflow-review-value">
          {displayFieldValue(field, remoteOf(field)) || "未填写"}
        </span>
      );
    const value = fields[field.key] || "";
    const disabled = locked || blocked;
    const placeholder = placeholderOf(field, inTable);
    const update = (next: string) => change(field.key, next);
    if (field.kind === "select")
      return (
        <Select
          ariaLabel={field.label}
          required={field.required}
          disabled={disabled}
          value={value}
          onChange={update}
          options={[
            { value: "", label: placeholder ?? "请选择" },
            ...(field.options || []),
          ]}
        />
      );
    if (field.kind === "textarea")
      return (
        <textarea
          aria-labelledby={labelId(field)}
          placeholder={placeholder}
          required={field.required}
          disabled={disabled}
          value={value}
          onChange={(e) => update(e.target.value)}
        />
      );
    if (field.kind === "number" && field.unit === "percent")
      return (
        <PercentageInput
          label={field.label}
          labelledBy={labelId(field)}
          placeholder={placeholder}
          required={field.required}
          disabled={disabled}
          value={value}
          onChange={update}
        />
      );
    if (field.kind === "number" && field.step)
      return (
        <SteppedNumberInput
          label={field.label}
          labelledBy={labelId(field)}
          placeholder={placeholder}
          min={field.min}
          max={field.max}
          step={field.step}
          required={field.required}
          disabled={disabled}
          value={value}
          onChange={update}
        />
      );
    return (
      <input
        aria-labelledby={labelId(field)}
        type={
          field.kind === "number"
            ? "number"
            : field.kind === "date"
              ? "date"
              : "text"
        }
        step="any"
        min={field.min}
        max={field.max}
        placeholder={placeholder}
        required={field.required}
        disabled={disabled}
        value={value}
        onChange={(e) => update(e.target.value)}
      />
    );
  }
  return (
    <section
      className={`detail-section workflow${action && options ? " workflow-active" : ""}`}
      ref={workflowRef}
    >
      <h3>流程操作</h3>
      {!available ? (
        <p className="hint">当前版本暂不支持流程操作，请更新桌面应用后重试。</p>
      ) : !item.id.project_key || !item.id.work_item_type_key ? (
        <p className="hint">事项身份不完整，暂不能操作。</p>
      ) : (
        <>
          {loading && <p className="hint">正在读取可用动作…</p>}
          {error && !action && (
            <p className="workflow-error" role="alert">
              {error}
            </p>
          )}
          {!loading && !action && (
            <>
              {flowActions?.length === 0 && (
                <p className="hint">当前没有可执行的动作。</p>
              )}
              {flowActions?.map((a) => (
                <div className="workflow-option" key={a.id}>
                  <button
                    className="secondary"
                    disabled={
                      locked ||
                      (!!a.disabled_reason &&
                        !syncFor(a, "progress") &&
                        !syncFor(a, "schedule"))
                    }
                    onClick={() => choose(a)}
                  >
                    {a.label}
                  </button>
                  {a.disabled_reason && (
                    <p className="hint">{a.disabled_reason}</p>
                  )}
                  {a.disabled_reason &&
                    (syncFor(a, "progress") || syncFor(a, "schedule")) && (
                      <p className="hint">
                        可进入表单同步
                        {[
                          syncFor(a, "progress") && "进度",
                          syncFor(a, "schedule") && "日期",
                        ]
                          .filter(Boolean)
                          .join("、")}
                        ；完成节点前仍需补齐上述必填项。
                      </p>
                    )}
                  {!a.disabled_reason && a.fields.some((f) => f.required) && (
                    <p className="hint">
                      需填写：
                      {a.fields
                        .filter((f) => f.required)
                        .map((f) => f.label)
                        .join("、")}
                    </p>
                  )}
                </div>
              ))}
              <button
                className="text-button"
                disabled={locked}
                onClick={() => setRevision((v) => v + 1)}
              >
                重新读取动作
              </button>
            </>
          )}
          {action && options && (
            <form
              className="workflow-editor"
              onSubmit={(e) => {
                e.preventDefault();
                if (!review) void prepare();
              }}
            >
              <div
                className={`workflow-stage${review ? " workflow-review" : ""}`}
                role={review ? "region" : undefined}
                aria-label={review ? "提交前二次确认" : undefined}
              >
                <div className="workflow-scroll" ref={contentRef}>
                  {!review && <strong>{action.label}</strong>}
                  {!review && action.description && (
                    <p className="hint">{action.description}</p>
                  )}
                  {!review && action.disabled_reason && (
                    <p className="hint">{action.disabled_reason}</p>
                  )}
                  {!review ? (
                    segments.map((segment, index) =>
                      segment.kind === "owners" ? (
                        <div
                          className="workflow-owner-table"
                          role="group"
                          aria-label={`负责人${segment.table.columns.join("、")}`}
                          key={segment.table.key}
                          style={
                            {
                              "--workflow-owner-columns":
                                segment.table.columns.length,
                            } as CSSProperties
                          }
                        >
                          <div
                            className="workflow-owner-head"
                            aria-hidden="true"
                          >
                            <span>负责人</span>
                            {segment.table.columns.map((column) => (
                              <span key={column}>{column}</span>
                            ))}
                          </div>
                          {segment.table.owners.map((owner) => {
                            const notes = segment.table.columns.flatMap(
                              (column) => {
                                const field =
                                  segment.table.cells[ownerCell(owner, column)];
                                const note = field && cloudNote(field, column);
                                return note ? [note] : [];
                              },
                            );
                            return (
                              <div className="workflow-owner-row" key={owner}>
                                <span className="workflow-owner-name">
                                  {owner}
                                </span>
                                {segment.table.columns.map((column) => {
                                  const field =
                                    segment.table.cells[
                                      ownerCell(owner, column)
                                    ];
                                  if (!field)
                                    return (
                                      <span
                                        className="workflow-owner-cell is-empty"
                                        aria-hidden="true"
                                        key={column}
                                      >
                                        —
                                      </span>
                                    );
                                  const missing =
                                    field.required &&
                                    !(fields[field.key] ?? "").trim();
                                  return (
                                    <div
                                      className={`workflow-owner-cell${missing ? " is-missing" : ""}`}
                                      key={column}
                                    >
                                      <span
                                        className="workflow-owner-caption"
                                        aria-hidden="true"
                                      >
                                        {column}
                                      </span>
                                      <span
                                        className="sr-only"
                                        id={labelId(field)}
                                      >
                                        {field.label}
                                        {field.required ? "（必填）" : ""}
                                      </span>
                                      {control(field, true)}
                                      {retainedNote(field)}
                                    </div>
                                  );
                                })}
                                {notes.length > 0 && (
                                  <div className="workflow-owner-notes">
                                    {notes}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {segment.table.hints.map((hint) => (
                            <small className="hint" key={hint}>
                              {hint}
                            </small>
                          ))}
                          {index === scheduleSegment && scheduleButton()}
                        </div>
                      ) : (
                        <div
                          className={`workflow-field${
                            segment.field.kind === "date" ||
                            segment.field.kind === "select" ||
                            (segment.field.kind === "number" &&
                              segment.field.unit !== "percent")
                              ? " is-inline"
                              : ""
                          }`}
                          key={segment.field.key}
                        >
                          <span
                            className="workflow-field-label"
                            id={labelId(segment.field)}
                          >
                            {segment.field.label}
                            {segment.field.required ? "（必填）" : ""}
                          </span>
                          {control(segment.field)}
                          {cloudNote(segment.field)}
                          {retainedNote(segment.field)}
                          {segment.showHint && (
                            <small className="hint">{segment.field.hint}</small>
                          )}
                          {segment.field.unit === "percent" &&
                            progressAction && (
                              <button
                                type="button"
                                className="secondary"
                                disabled={
                                  locked ||
                                  blocked ||
                                  !!progressAction.disabled_reason
                                }
                                onClick={() =>
                                  choose(progressAction, {
                                    [segment.field.key]:
                                      fields[segment.field.key] || "",
                                  })
                                }
                              >
                                仅同步此进度
                              </button>
                            )}
                          {index === scheduleSegment && scheduleButton()}
                        </div>
                      ),
                    )
                  ) : (
                    <>
                      <div className="workflow-review-heading">
                        <ClipboardCheck size={16} aria-hidden="true" />
                        <h4>请再次确认</h4>
                      </div>
                      <div className="workflow-review-context">
                        <p className="workflow-review-item">
                          <strong>{item.name || item.id.work_item_id}</strong>
                          <small>#{item.id.work_item_id}</small>
                        </p>
                        <p className="workflow-review-action">
                          <span>即将执行</span>
                          <strong>{action.label}</strong>
                        </p>
                      </div>
                      <WorkflowReviewFields
                        action={action}
                        changes={review.fields}
                        remote={baseFields}
                      />
                      {!progressOnly &&
                        !scheduleOnly &&
                        Object.keys(review.fields).length === 0 && (
                          <p className="hint">字段无修改，仅执行流程操作。</p>
                        )}
                    </>
                  )}
                  {retainedDrafts()}
                </div>
                <div className="workflow-footer">
                  {error && (
                    <p className="workflow-error" role="alert">
                      {error}
                    </p>
                  )}
                  {blocked && !pending && (
                    <div className="workflow-recovery">
                      <p className="workflow-error">
                        这份草稿上次提交的结果尚待核实，已阻止重复提交。重新读取云端后，可保留草稿并核对当前值，再继续操作。
                      </p>
                      <button
                        type="button"
                        className="secondary"
                        disabled={locked}
                        onClick={() => void recover()}
                      >
                        重新读取云端，保留草稿
                      </button>
                    </div>
                  )}
                  {!review ? (
                    <>
                      <p className="draft-status" role="status">
                        {draftStatus}
                      </p>
                      <div className="workflow-buttons">
                        <button
                          type="button"
                          className="secondary"
                          disabled={locked}
                          onClick={() => {
                            reads.current += 1;
                            backgroundRead.current = null;
                            setAction(null);
                          }}
                        >
                          返回，保留草稿
                        </button>
                        <button
                          className="primary"
                          disabled={
                            locked ||
                            blocked ||
                            !!action.disabled_reason ||
                            action.fields.some(
                              (f) => f.required && !fields[f.key]?.trim(),
                            )
                          }
                        >
                          {pending
                            ? "正在检查…"
                            : progressOnly
                              ? "同步进度"
                              : scheduleOnly
                                ? "同步日期"
                                : "提交"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="workflow-review-notice">
                        <CircleAlert size={14} aria-hidden="true" />
                        <p className="workflow-warning">
                          {progressOnly
                            ? "仅同步以上进度并保持当前节点，不提交其他字段；进度达到 100% 也不会自动进入下一个节点。"
                            : scheduleOnly
                              ? "仅同步以上开始和结束日期，保留当前节点；未修改的日期沿用云端值。"
                              : rollback
                                ? "提交后将回滚节点；未修改的字段沿用云端值，请核对目标节点和填写内容。"
                                : "未修改的字段沿用云端值；流程操作后可能无法返回或再次修改。"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="workflow-acknowledge"
                        aria-label={acknowledgement}
                        aria-pressed={acknowledged}
                        disabled={locked}
                        onClick={() => setAcknowledged((value) => !value)}
                      >
                        <span
                          className="workflow-acknowledge-box"
                          aria-hidden="true"
                        >
                          {acknowledged && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span>{acknowledgement}</span>
                      </button>
                      <div className="workflow-buttons">
                        <button
                          type="button"
                          className="secondary"
                          disabled={locked}
                          onClick={() => setReview(null)}
                        >
                          返回修改
                        </button>
                        <button
                          type="button"
                          className="primary"
                          disabled={locked || !acknowledged || blocked}
                          onClick={() => void confirm()}
                        >
                          {pending ? "正在提交…" : confirmLabel}
                        </button>
                      </div>
                      <p className="draft-status" role="status">
                        {draftStatus}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
