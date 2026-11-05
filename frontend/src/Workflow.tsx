import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowUpRight, Check, CircleAlert, ClipboardCheck } from "lucide-react";
import { getWorkflowActions } from "./api";
import { asError, itemKey } from "./model";
import { ExternalLink, openExternalUrl } from "./ExternalLink";
import { Select } from "./Select";
import { PercentageInput } from "./PercentageInput";
import { SteppedNumberInput } from "./SteppedNumberInput";
import { DateRangePicker } from "./DateRangePicker";
import { displayFieldValue, WorkflowConflict } from "./WorkflowConflict";
import { WorkflowReviewFields } from "./WorkflowReviewFields";
import { WorkflowCloudValue } from "./WorkflowCloudValue";
import { WorkflowFieldEditor } from "./WorkflowFieldEditor";
import { withWorkflowLabels, workflowValueEmpty } from "./workflowValues";
import { invoke } from "@tauri-apps/api/core";
import type { CreationForm } from "./creation";
import { hasInvalidLocalCreationImages, localCreationImageIds, replaceCreationImageReference, uploadCreationImage } from "./creationImages";
import { layoutFields, ownerCell, scheduleDatePairs, type ScheduleDatePair } from "./workflowLayout";
import { loadWorkflowSkipConfirmation, useWorkflowSkipConfirmation } from "./workflowPreferences";
import { useWorkflowSubmissions, workflowSubmissions as submissions } from "./workflowSubmissions";
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
const canSkipConfirmation = (candidate: WorkflowAction) =>
  candidate.kind === "state" ||
  candidate.id.startsWith("node:confirm:") ||
  candidate.id.startsWith("node:rollback:") ||
  candidate.id.startsWith("node:progress:") ||
  candidate.id.startsWith("node:schedule:");
const feishuActionExplanation = "此操作所需字段暂无法在本软件中处理。点击上方按钮，即可打开对应的飞书事项，填写并完成流程。";
const feishuEditorExplanation = "此操作所需字段暂无法在本软件中处理。请通过飞书链接打开对应事项，填写并完成流程。";

function validItemUrl(url?: string) {
  try {
    if (url && ["https:", "http:"].includes(new URL(url).protocol)) return url;
  } catch {
    // 地址由后端核实，缺失或非法时不推测其他页面。
  }
  return undefined;
}

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
  const skipConfirmation = useWorkflowSkipConfirmation();
  const [options, setOptions] = useState<WorkflowOptions | null>(null);
  const [action, setAction] = useState<WorkflowAction | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [baseFields, setBaseFields] = useState<Record<string, string>>({});
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [review, setReview] = useState<WorkflowRequest | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const executing = useWorkflowSubmissions();
  const [blocked, setBlocked] = useState(false);
  const [rejectedConflictActions, setRejectedConflictActions] = useState<string[]>([]);
  const rejectedConflict = !!action && rejectedConflictActions.includes(action.id);
  const [draftStatus, setDraftStatus] = useState("");
  const [error, setError] = useState("");
  const [returnCheckError, setReturnCheckError] = useState("");
  const [actionOpenError, setActionOpenError] = useState<{ id: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [fieldBusy, setFieldBusy] = useState<Record<string, boolean>>({});
  const [revision, setRevision] = useState(0);
  const flight = useRef(false);
  const fieldId = useId();
  const workflowRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const identity = itemKey(item);
  const executingAction = !!action && executing.has(draftKey(identity, action.id));
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const optionsIdentity = useRef(identity);
  const manualFillReturn = useRef<string | null>(null);
  const manualFillEpoch = useRef(0);
  const reads = useRef(0);
  const backgroundRead = useRef<number | null>(null);
  const returnCheckRead = useRef<number | null>(null);
  const selectionRead = useRef<number | null>(null);
  const refreshUnavailableActions = useRef(false);
  const knownPendingActions = useRef({ identity, actions: new Map<string, string>() });
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
  const checkRemoteRef = useRef<(onReturn?: boolean) => void>(() => {});
  checkRemoteRef.current = (onReturn) => void checkRemote(onReturn);
  useEffect(() => {
    reads.current += 1;
    let active = true;
    setOptions(null);
    setAction(null);
    setReview(null);
    setError("");
    setReturnCheckError("");
    setActionOpenError(null);
    selectionRead.current = null;
    refreshUnavailableActions.current = false;
    setBlocked(false);
    setPending(false);
    if (!available || !item.id.project_key || !item.id.work_item_type_key)
      return;
    setLoading(true);
    void getWorkflowActions(item.id)
      .then((v) => {
        if (active) {
          optionsIdentity.current = identity;
          rememberPendingActions(v);
          setOptions(v);
        }
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

  useEffect(() => {
    manualFillEpoch.current += 1;
    manualFillReturn.current = null;
    knownPendingActions.current = { identity, actions: new Map() };
    setRejectedConflictActions([]);
    return () => {
      manualFillEpoch.current += 1;
      manualFillReturn.current = null;
    };
  }, [identity]);

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
    const onFocus = () => {
      const origin = manualFillReturn.current;
      manualFillReturn.current = null;
      checkRemoteRef.current(origin === identityRef.current);
    };
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

  async function checkRemote(onReturn = false) {
    const current = editor.current;
    if (
      !available ||
      !current.options ||
      (!current.action && !onReturn && !refreshUnavailableActions.current) ||
      current.review ||
      (current.blocked && !onReturn) ||
      current.busy ||
      flight.current ||
      (current.action && submissions.has(draftKey(identity, current.action.id))) ||
      selectionRead.current !== null
    )
      return;
    if (backgroundRead.current === reads.current) {
      if (onReturn) {
        returnCheckRead.current = backgroundRead.current;
        setReturnCheckError("");
      }
      return;
    }
    const origin = identity,
      epoch = manualFillEpoch.current,
      actionId = current.action?.id,
      read = ++reads.current;
    backgroundRead.current = read;
    if (onReturn) {
      returnCheckRead.current = read;
      setReturnCheckError("");
    }
    try {
      const latest = await readCurrentActions(actionId, () =>
        reads.current === read && identityRef.current === origin && manualFillEpoch.current === epoch,
      );
      if (
        reads.current !== read ||
        identityRef.current !== origin ||
        manualFillEpoch.current !== epoch
      ) return;
      const now = editor.current;
      const fromReturn = returnCheckRead.current === read;
      if (
        now.action?.id !== actionId ||
        !now.options ||
        now.review ||
        (now.blocked && !fromReturn) ||
        now.busy ||
        flight.current ||
        (now.action && submissions.has(draftKey(origin, now.action.id)))
      )
        return;
      rememberPendingActions(latest);
      const nextAction = latest.actions.find((next) => next.id === actionId);
      if (!now.action || (fromReturn && now.blocked)) {
        // 返回检查只更新可展示的云端信息；提交标记和本机编辑快照仍由明确恢复操作处理。
        setOptions(latest);
        if (nextAction) setAction(withWorkflowLabels(nextAction, now.fieldLabels));
        setReturnCheckError(
          now.action && !nextAction
            ? "云端已不再提供原动作，草稿和提交标记已保留，请先核对飞书状态。"
            : "",
        );
        if (!now.action) {
          setError("");
        }
        return;
      }
      if (!nextAction) {
        if (!preserveEditorDraft(origin, now)) return;
        refreshUnavailableActions.current = true;
        setOptions(latest);
        setAction(null);
        setError(
          "流程已刷新，原动作已不可用。草稿已保留，请选择当前动作。",
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
      const key = draftKey(origin, nextAction.id);
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
      setAction(withWorkflowLabels(nextAction, merged.field_labels));
      setFields(merged.fields);
      setBaseFields(merged.base_fields);
      setFieldLabels(merged.field_labels);
      setConflicts(merged.conflicts);
      setRejectedConflictActions((ids) => ids.filter((id) => id !== nextAction.id));
      setDraftStatus(
        hasDraft ? "草稿已保存在本机" : "修改会自动保存为本机草稿",
      );
      setError("");
      setReturnCheckError("");
    } catch (e) {
      if (
        reads.current === read &&
        identityRef.current === origin &&
        manualFillEpoch.current === epoch
      ) {
        if (returnCheckRead.current === read)
          setReturnCheckError("云端检查未完成，现有内容和草稿已保留，请稍后重试。");
        else setError(`云端检查未完成：${asError(e).message}`);
      }
    } finally {
      if (backgroundRead.current === read) backgroundRead.current = null;
    }
  }

  async function readCurrentActions(actionId: string | undefined, isCurrent: () => boolean) {
    let latest = await getWorkflowActions(item.id, true);
    if (actionId && !latest.actions.some((candidate) => candidate.id === actionId) && isCurrent())
      latest = await getWorkflowActions(item.id, true);
    return actionId && latest.action_versions?.[actionId]
      ? { ...latest, version: latest.action_versions[actionId] }
      : latest;
  }

  function preserveEditorDraft(origin: string, current: typeof editor.current) {
    if (!current.action || !current.options) return true;
    try {
      const saved = readDraft(draftKey(origin, current.action.id));
      if (saved?.pending) {
        setBlocked(true);
        setError("该动作已有待核实的提交，本窗口内容未覆盖原草稿，请先核对飞书状态。");
        return false;
      }
      if (!saved && !Object.entries(current.fields).some(
        ([key, value]) => value !== current.baseFields[key],
      )) return true;
      if (saved && !saved.pending && saved.version === current.options.version &&
        JSON.stringify(saved.fields) === JSON.stringify(current.fields) &&
        JSON.stringify(saved.base_fields) === JSON.stringify(current.baseFields) &&
        JSON.stringify(saved.field_labels) === JSON.stringify(current.fieldLabels) &&
        JSON.stringify(saved.conflicts) === JSON.stringify(current.conflicts)) return true;
      writeDraft(draftKey(origin, current.action.id), {
        fields: current.fields,
        base_fields: current.baseFields,
        field_labels: current.fieldLabels,
        conflicts: current.conflicts,
        requires_refresh: rejectedConflictActions.includes(current.action.id) || undefined,
        version: current.options.version,
        updated_at: Date.now(),
      });
      return true;
    } catch {
      setError("草稿保存失败，当前输入仅保留在本次窗口中；请勿关闭页面，稍后重试。");
      return false;
    }
  }

  async function selectAction(candidate: WorkflowAction) {
    if (
      !options ||
      optionsIdentity.current !== identity ||
      busy ||
      flight.current ||
      selectionRead.current !== null
    ) return;
    const origin = identity,
      epoch = manualFillEpoch.current,
      read = ++reads.current;
    selectionRead.current = read;
    backgroundRead.current = null;
    setPending(true);
    setActionOpenError(null);
    setReturnCheckError("");
    setError("");
    const isCurrent = () => identityRef.current === origin &&
      manualFillEpoch.current === epoch && reads.current === read;
    try {
      if (candidate.requires_feishu) {
        const href = validItemUrl(options.item_url);
        if (!href) {
          setActionOpenError({ id: candidate.id, message: "未取得当前事项的有效飞书地址，请在飞书项目中搜索该事项，填写并完成流程。" });
          return;
        }
        try {
          await openExternalUrl(href);
          if (isCurrent()) manualFillReturn.current = origin;
        } catch {
          if (isCurrent()) setActionOpenError({ id: candidate.id, message: "打开飞书项目未完成，请重试或使用下方链接打开。" });
        }
        return;
      }
      if (candidate.disabled_reason && !syncFor(candidate, "progress") && !syncFor(candidate, "schedule")) {
        setActionOpenError({ id: candidate.id, message: "云端动作已不可用，请核对最新提示。已有草稿已保留。" });
        return;
      }
      choose(candidate);
    } finally {
      if (selectionRead.current === read) {
        selectionRead.current = null;
        if (identityRef.current === origin && manualFillEpoch.current === epoch) setPending(false);
      }
    }
  }
  function choose(next: WorkflowAction, values: Record<string, string> = {}, source = options) {
    if (!source || busy || flight.current) return;
    source = { ...source, version: source.action_versions?.[next.id] ?? source.version };
    refreshUnavailableActions.current = false;
    reads.current += 1;
    backgroundRead.current = null;
    setError("");
    setReturnCheckError("");
    setActionOpenError(null);
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
              requires_refresh: saved?.requires_refresh,
              conflicts: [
                ...(saved?.conflicts ?? []).filter(
                  (key) => !transferred.includes(key),
                ),
                ...conflicts.filter((key) => transferred.includes(key)),
              ],
              version: source.version,
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
      const initial = reconcileDraft(next, null, source.version);
      const savedFields = Object.fromEntries(
        Object.entries(draft?.fields ?? {}).filter(
          ([key, value]) => draft?.base_fields?.[key] !== undefined || !!value.trim(),
        ),
      );
      // 进入表单先恢复编辑快照，云端差异由后续检查和提交前核对处理。
      const restored =
        !draft || draft.pending
          ? reconcileDraft(next, draft, source.version)
          : {
              fields: { ...initial.fields, ...savedFields },
              base_fields: {
                ...Object.fromEntries(
                  Object.entries(initial.base_fields).filter(
                    ([key]) => savedFields[key] === undefined,
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
      if (draft?.requires_refresh)
        setRejectedConflictActions((ids) => [...new Set([...ids, next.id])]);
      setDraftStatus(
        draft?.pending
          ? "已恢复本机草稿，上次提交结果待核实。"
          : draft
            ? "已恢复本机草稿"
            : "修改会自动保存为本机草稿",
      );
      setOptions({ ...source, version: draft?.version ?? source.version });
      setAction(withWorkflowLabels(next, restored.field_labels));
    } catch (e) {
      setError(asError(e).message);
    }
  }
  function change(key: string, value: string, labels: Record<string, string> = {}) {
    changeFields({ [key]: value }, labels);
  }
  function changeFields(changes: Record<string, string>, labels: Record<string, string> = {}) {
    if (!action || !options || action.requires_feishu) return;
    const next = { ...fields, ...changes };
    const nextLabels = { ...fieldLabels, ...labels };
    setFieldLabels(nextLabels);
    setAction(withWorkflowLabels(action, nextLabels));
    editor.current.fields = next;
    setFields(next);
    setReview(null);
    try {
      writeDraft(draftKey(identity, action.id), {
        fields: next,
        base_fields: baseFields,
        field_labels: nextLabels,
        conflicts,
        requires_refresh: rejectedConflict || undefined,
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
      action.requires_feishu ||
      busy ||
      flight.current ||
      submissions.has(draftKey(identity, action.id)) ||
      blocked ||
      rejectedConflict ||
      Object.values(fieldBusy).some(Boolean)
    )
      return;
    const origin = identity;
    const read = ++reads.current;
    flight.current = true;
    setPending(true);
    setError("");
    try {
      // 核对页使用当前编辑快照，云端版本与动作可用性留到正式提交时校验。
      const previous = editor.current;
      const merged = reconcileDraft(
        action,
        {
          fields: previous.fields,
          base_fields: previous.baseFields,
          field_labels: previous.fieldLabels,
          conflicts: previous.conflicts,
          version: options.version,
          updated_at: Date.now(),
        },
        options.version,
      );
      writeDraft(draftKey(identity, action.id), {
        ...merged,
        version: options.version,
        updated_at: Date.now(),
      });
      setAction(withWorkflowLabels(action, merged.field_labels));
      setFields(merged.fields);
      setBaseFields(merged.base_fields);
      setFieldLabels(merged.field_labels);
      setConflicts(merged.conflicts);
      setReview(null);
      setDraftStatus("草稿已保存在本机");
      const skipReview = canSkipConfirmation(action) && loadWorkflowSkipConfirmation();
      const missing = action.fields.find(
        (field) => field.required && workflowValueEmpty(field, merged.fields[field.key]),
      );
      if (missing) {
        setError(`请完成必填字段：${missing.label}`);
        return;
      }
      const invalidOption = action.fields.find(
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
      for (const field of action.fields.filter((field) => !field.read_only && field.editor?.kind === "textarea")) {
        let markdown = merged.fields[field.key] || "";
        if (hasInvalidLocalCreationImages(markdown)) throw new Error("正文含无法识别的本机图片，请重新粘贴，草稿已保留。");
        const images = localCreationImageIds(markdown);
        if (!images.length) continue;
        if (!field.rich_text?.image_field_key) throw new Error("此节点字段无法确认图片归属，请在飞书中修改图片。");
        const scope = await invoke<Pick<CreationForm, "target" | "context">>("get_workflow_editor_context", { itemId: item.id });
        for (const imageId of images) {
          if (identityRef.current !== origin || reads.current !== read) return;
          const uploaded = await uploadCreationImage({ ...scope, fieldKey: field.rich_text.image_field_key, workflow: { itemId: item.id, actionId: action.id, fieldKey: field.key } }, imageId);
          if (identityRef.current !== origin || reads.current !== read) return;
          markdown = replaceCreationImageReference(markdown, imageId, uploaded.url, uploaded.file_token);
          merged.fields[field.key] = markdown;
          writeDraft(draftKey(origin, action.id), { ...merged, version: options.version, updated_at: Date.now() });
          if (identityRef.current !== origin || reads.current !== read) return;
          setFields({ ...merged.fields });
          editor.current.fields = { ...merged.fields };
        }
      }
      const request: WorkflowRequest = {
        item_id: item.id,
        action_id: action.id,
        version: options.version,
        fields: changedFields(action, merged.fields, merged.base_fields),
        request_id: crypto.randomUUID(),
      };
      if (skipReview) {
        void execute(request, action, merged);
      } else {
        setReview(request);
        setAcknowledged(false);
      }
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
      action.requires_feishu ||
      busy ||
      flight.current ||
      submissions.has(draftKey(identity, action.id)) ||
      blocked ||
      rejectedConflict ||
      !acknowledged
    )
      return;
    await execute(review, action, {
      fields,
      base_fields: baseFields,
      field_labels: fieldLabels,
      conflicts,
    });
  }
  async function execute(
    request: WorkflowRequest,
    action: WorkflowAction,
    draft: ReturnType<typeof reconcileDraft>,
  ) {
    const { fields, base_fields: baseFields, field_labels: fieldLabels, conflicts } = draft;
    const origin = identity,
      key = draftKey(identity, action.id);
    if (!submissions.begin(key, request.request_id)) return;
    const isCurrent = () => identityRef.current === origin && editor.current.action?.id === action.id;
    reads.current += 1;
    setError("");
    try {
      if (readDraft(key)?.pending) {
        setBlocked(true);
        submissions.finish(key, request.request_id);
        return;
      }
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
      submissions.finish(key, request.request_id);
      return;
    }
    try {
      setBlocked(true);
      setDraftStatus("本机草稿已保留，正在等待飞书提交结果。");
      const result = await submit(request);
      if (!result || result.outcome === "unknown" || (result.outcome === "verified" && !result.verified)) {
        if (isCurrent()) {
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
        if (readDraft(key)?.pending?.request_id !== request.request_id)
          throw new Error("提交标记已变化，保留当前草稿");
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
      if (!isCurrent()) {
        if (identityRef.current === origin) refreshUnavailableActions.current = true;
        return;
      }
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
          if (readDraft(key)?.pending?.request_id !== request.request_id)
            throw new Error("提交标记已变化，保留当前草稿");
          writeDraft(key, {
            fields,
            base_fields: baseFields,
            field_labels: fieldLabels,
            conflicts,
            requires_refresh: failure.kind === "conflict" || undefined,
            version: request.version,
            updated_at: Date.now(),
          });
        } catch {
          released = false;
        }
      }
      if (identityRef.current === origin && released && failure.kind === "conflict")
        setRejectedConflictActions((ids) => [...new Set([...ids, action.id])]);
      if (isCurrent()) {
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
      submissions.finish(key, request.request_id);
      if (identityRef.current === origin && !editor.current.action)
        checkRemoteRef.current(true);
    }
  }
  async function recover() {
    if (!action || !options || flight.current || busy || submissions.has(draftKey(identity, action.id))) return;
    const origin = identity,
      actionId = action.id,
      key = draftKey(identity, actionId),
      read = ++reads.current;
    backgroundRead.current = null;
    flight.current = true;
    setPending(true);
    setError("");
    try {
      const latest = await readCurrentActions(actionId, () =>
        identityRef.current === origin && reads.current === read,
      );
      if (identityRef.current !== origin || reads.current !== read) return;
      const nextAction = latest.actions.find((next) => next.id === actionId);
      if (!nextAction) {
        if (rejectedConflict && !preserveEditorDraft(origin, editor.current)) return;
        refreshUnavailableActions.current = true;
        setOptions(latest);
        setAction(null);
        setReview(null);
        setBlocked(false);
        setRejectedConflictActions((ids) => ids.filter((id) => id !== actionId));
        setError(
          "云端已不再提供原动作。草稿已保留，请根据当前流程重新选择动作。",
        );
        return;
      }
      // 已拒绝的请求没有待核实快照，继续编辑时以内存为准，避免覆盖保存失败的新输入。
      const saved = rejectedConflict ? null : readDraft(key);
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
      setAction(withWorkflowLabels(nextAction, merged.field_labels));
      setFields(merged.fields);
      setBaseFields(merged.base_fields);
      setFieldLabels(merged.field_labels);
      setConflicts(merged.conflicts);
      setReview(null);
      setAcknowledged(false);
      setBlocked(false);
      setRejectedConflictActions((ids) => ids.filter((id) => id !== actionId));
      setDraftStatus(
        nextAction.requires_feishu
          ? "已重新读取云端，草稿已保留。请在飞书项目中核对并完成流程；上次提交结果仍以云端为准。"
          : "已重新读取云端，草稿已保留。请核对当前值后继续；上次提交结果仍以云端为准。",
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
  const navigationLocked = busy || pending || Object.values(fieldBusy).some(Boolean);
  const locked = navigationLocked || executingAction;
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
      action.requires_feishu ||
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
        requires_refresh: rejectedConflict || undefined,
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
            disabled={locked || blocked || !!action?.requires_feishu}
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
            disabled={locked || blocked || !!action?.requires_feishu}
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
  function syncFor(candidate: WorkflowAction, kind: "progress" | "schedule", source = options) {
    return candidate.id.startsWith("node:confirm:")
      ? source?.actions.find(
          (next) =>
            !next.disabled_reason &&
            next.id === candidate.id.replace("node:confirm:", `node:${kind}:`),
        )
      : undefined;
  }
  const progressAction = action ? syncFor(action, "progress") : undefined;
  const scheduleAction = action ? syncFor(action, "schedule") : undefined;
  const layout = layoutFields(action?.fields ?? []);
  const standaloneKeys = new Set(layout.flatMap((segment) => segment.kind === "field" ? [segment.field.key] : []));
  const pairs = scheduleDatePairs(action?.fields ?? []);
  const pairByKey = new Map(pairs.flatMap((pair) => [[pair.start.key, pair], [pair.end.key, pair]] as const));
  const standalonePair = (field: Field) => {
    const pair = pairByKey.get(field.key);
    return pair && standaloneKeys.has(pair.start.key) && standaloneKeys.has(pair.end.key) ? pair : undefined;
  };
  const segments = layout.filter((segment) => segment.kind !== "field" || standalonePair(segment.field)?.end.key !== segment.field.key);
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
  const remoteOf = (field: Field) => blocked || field.read_only
    ? field.initial_value ?? baseFields[field.key] ?? ""
    : baseFields[field.key] ?? field.initial_value ?? "";
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
        itemId={item.id}
        field={field}
        remote={remote}
        value={local}
        conflict={conflict}
        disabled={locked || blocked || !!action?.requires_feishu}
        caption={caption}
        onRestore={() => change(field.key, remote)}
      />
    );
  }
  function control(field: Field, inTable = false) {
    if (field.read_only)
      return (
        <WorkflowCloudValue field={field} value={remoteOf(field)} itemId={item.id} />
      );
    const value = fields[field.key] || "";
    const disabled = locked || blocked || !!action?.requires_feishu;
    const placeholder = placeholderOf(field, inTable);
    const update = (next: string) => change(field.key, next);
    if (field.editor && action) return <WorkflowFieldEditor
      itemId={item.id} actionId={action.id} field={field} value={value} labels={fieldLabels}
      disabled={disabled} onChange={(value, labels) => change(field.key, value, labels)}
      onBusyChange={(busy) => setFieldBusy((previous) => previous[field.key] === busy ? previous : { ...previous, [field.key]: busy })}
    />;
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
  function dateRange(pair: ScheduleDatePair) {
    return <DateRangePicker
      start={fields[pair.start.key] ?? ""} end={fields[pair.end.key] ?? ""}
      startLabel={`${pair.start.label}${pair.start.required ? "（必填）" : ""}`}
      endLabel={`${pair.end.label}${pair.end.required ? "（必填）" : ""}`}
      startRequired={pair.start.required} endRequired={pair.end.required}
      disabled={locked || blocked || !!action?.requires_feishu}
      onChange={(start, end) => changeFields({ [pair.start.key]: start, [pair.end.key]: end })}
    />;
  }
  function feishuLinkFor(candidate: Pick<WorkflowAction, "id">, mode: "fill" | "edit" | "verify" = "fill") {
    if (optionsIdentity.current !== identity) return null;
    const verify = mode === "verify";
    const label = verify ? "去飞书核对" : mode === "edit" ? "在飞书中修改" : "去飞书填写";
    const epoch = manualFillEpoch.current;
    const href = validItemUrl(options?.item_url);
    return (
      <div className="workflow-manual-fill" key={`${identity}:${candidate.id}:${href ?? ""}:${verify}`}>
        {href ? (
          <ExternalLink href={href} title={`在飞书项目中${verify ? "核对" : mode === "edit" ? "修改只读字段" : "填写"}「${item.name || item.id.work_item_id}」`}
            onOpen={() => {
              if (identityRef.current === identity && manualFillEpoch.current === epoch)
                manualFillReturn.current = identity;
            }}>
            {label}<ArrowUpRight size={13} aria-hidden="true" />
          </ExternalLink>
        ) : (
          <p className="hint">未取得当前事项的有效飞书地址，请在飞书项目中搜索该事项{verify ? "后核对" : mode === "edit" ? "后修改只读字段" : "，填写并完成流程"}。</p>
        )}
      </div>
    );
  }
  function manualFillFor(candidate: WorkflowAction, includeReadOnly = false) {
    if (candidate.requires_feishu || (candidate.disabled_reason && candidate.manual_fill_required))
      return feishuLinkFor(candidate);
    if (includeReadOnly && candidate.fields.some((field) => field.read_only))
      return feishuLinkFor(candidate, "edit");
    return null;
  }
  function pendingDraftFor(candidate: Pick<WorkflowAction, "id">) {
    try {
      return !!readDraft(draftKey(identity, candidate.id))?.pending;
    } catch {
      return false;
    }
  }
  function rememberPendingActions(source: WorkflowOptions) {
    if (knownPendingActions.current.identity !== identity)
      knownPendingActions.current = { identity, actions: new Map() };
    for (const candidate of source.actions) {
      if (pendingDraftFor(candidate))
        knownPendingActions.current.actions.set(candidate.id, candidate.label);
    }
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
          {returnCheckError && (
            <div className="workflow-recovery">
              <p className="workflow-error" role="alert">{returnCheckError}</p>
              {action && (
                <button type="button" className="text-button" disabled={locked}
                  onClick={() => void checkRemote(true)}>
                  重试云端检查
                </button>
              )}
            </div>
          )}
          {!action && knownPendingActions.current.identity === identity &&
            [...knownPendingActions.current.actions].filter(([id]) =>
              !flowActions?.some((candidate) => candidate.id === id) && pendingDraftFor({ id }),
            ).map(([id, label]) => (
              <div className="workflow-recovery" key={id}>
                <p className="workflow-error">「{label}」上次提交结果待核实，草稿和提交标记已保留。请在飞书项目中核对。</p>
                {feishuLinkFor({ id }, "verify")}
              </div>
            ))}
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
                      navigationLocked ||
                      executing.has(draftKey(identity, a.id)) ||
                      (!!a.disabled_reason &&
                        !a.requires_feishu &&
                        !syncFor(a, "progress") &&
                        !syncFor(a, "schedule"))
                    }
                    onClick={() => void selectAction(a)}
                  >
                    {a.label}{executing.has(draftKey(identity, a.id)) ? "（正在提交…）" : ""}
                  </button>
                  {(a.requires_feishu || a.disabled_reason) && (
                    <p className="hint">{a.requires_feishu ? feishuActionExplanation : a.disabled_reason}</p>
                  )}
                  {pendingDraftFor(a) && !executing.has(draftKey(identity, a.id)) && (
                    <p className="workflow-error">上次提交结果待核实，已有草稿和提交标记已保留。请在飞书项目中核对。</p>
                  )}
                  {actionOpenError?.id === a.id && (
                    <div className="workflow-recovery">
                      <p className="workflow-error" role="alert">{actionOpenError.message}</p>
                      {a.requires_feishu && validItemUrl(options?.item_url) && feishuLinkFor(a)}
                    </div>
                  )}
                  {!a.requires_feishu && a.disabled_reason &&
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
                  {!a.requires_feishu && !a.disabled_reason && a.fields.some((f) => f.required) && (
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
                onClick={() => options
                  ? void checkRemote(true)
                  : setRevision((v) => v + 1)}
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
                  {!review && (action.requires_feishu || action.disabled_reason) && (
                    <p className="hint">{action.requires_feishu ? feishuEditorExplanation : action.disabled_reason}</p>
                  )}
                  {!review && !blocked && manualFillFor(action, true)}
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
                            const ownerFields = segment.table.columns.flatMap((column) => {
                              const field = segment.table.cells[ownerCell(owner, column)];
                              return field ? [field] : [];
                            });
                            const pair = pairs.find((candidate) => ownerFields.some((field) => field.key === candidate.start.key) && ownerFields.some((field) => field.key === candidate.end.key));
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
                                {pair ? <div className="workflow-owner-date-range">
                                  {dateRange(pair)}
                                  {retainedNote(pair.start)}
                                  {retainedNote(pair.end)}
                                </div> : segment.table.columns.map((column) => {
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
                      ) : standalonePair(segment.field) ? (
                        <div className="workflow-field workflow-date-range" key={segment.field.key}>
                          <span className="workflow-field-label">排期{segment.field.owner ? ` · ${segment.field.owner}` : ""}{standalonePair(segment.field)!.start.required || standalonePair(segment.field)!.end.required ? "（必填）" : ""}</span>
                          {dateRange(standalonePair(segment.field)!)}
                          {[standalonePair(segment.field)!.start, standalonePair(segment.field)!.end].map((field) => <div key={field.key}>{cloudNote(field)}{retainedNote(field)}</div>)}
                          {[...new Set([standalonePair(segment.field)!.start.hint, standalonePair(segment.field)!.end.hint].filter(Boolean))].map((hint) => <small className="hint" key={hint}>{hint}</small>)}
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
                        itemId={item.id}
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
                  {(blocked || rejectedConflict) && !pending && !executingAction && (
                    <div className="workflow-recovery">
                      {blocked && (
                        <p className="workflow-error">
                          {action.requires_feishu
                            ? "这份草稿上次提交的结果尚待核实，已阻止重复提交。请在飞书项目中核对当前状态；需要补充的字段和流程操作可直接在飞书完成。"
                            : "这份草稿上次提交的结果尚待核实，已阻止重复提交。重新读取云端后，可保留草稿并核对当前值，再继续操作。"}
                        </p>
                      )}
                      {feishuLinkFor(action, "verify")}
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
                      {skipConfirmation && canSkipConfirmation(action) && (
                        <p className="workflow-warning">
                          已关闭流程操作二次确认，点击「{progressOnly ? "同步进度" : scheduleOnly ? "同步日期" : "提交"}」将直接执行。
                        </p>
                      )}
                      <div className="workflow-buttons">
                        <button
                          type="button"
                          className="secondary"
                          disabled={navigationLocked}
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
                            rejectedConflict ||
                            !!action.disabled_reason ||
                            !!action.requires_feishu ||
                            action.fields.some(
                              (f) => f.required && workflowValueEmpty(f, fields[f.key]),
                            )
                          }
                        >
                          {executingAction
                            ? "正在提交…"
                            : pending
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
                          disabled={navigationLocked}
                          onClick={() => {
                            if (executingAction) {
                              reads.current += 1;
                              backgroundRead.current = null;
                              setAction(null);
                              setReview(null);
                            } else setReview(null);
                          }}
                        >
                          {executingAction ? "返回，处理其他操作" : "返回修改"}
                        </button>
                        <button
                          type="button"
                          className="primary"
                          disabled={locked || !acknowledged || blocked || rejectedConflict || !!action.requires_feishu}
                          onClick={() => void confirm()}
                        >
                          {pending || executingAction ? "正在提交…" : confirmLabel}
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
