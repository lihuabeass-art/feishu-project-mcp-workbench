import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, CircleAlert, FileText, LoaderCircle, X } from "lucide-react";
import { Select } from "./Select";
import { useScrollIsolation } from "./useScrollIsolation";
import { CreationLookup } from "./CreationLookup";
import { CreationSelect } from "./CreationSelect";
import { CreationFieldTip, CreationFieldVisibility, creationVisibilityKey, fixedCreationField, loadCreationVisibility, visibleCreationFields } from "./CreationFieldVisibility";
import { CreationAttachmentPicker } from "./CreationAttachmentPicker";
import { CreationReview } from "./CreationReview";
import { creationAttachments, uploadCreationAttachments } from "./creationAttachments";
import { asError } from "./model";
import {
  createWorkItem,
  acknowledgeCreationRecovery,
  creationEmpty,
  creationTargetKey,
  getCreationForm,
  lookupCreationField,
  resolveCreationRelationLabels,
  verifyCreation,
  type CreationField,
  type CreationForm,
  type CreationLocation,
  type CreationLookupResult,
  type CreationRequest,
  type CreationResult,
} from "./creation";
import "./creation.css";
import { MarkdownClipboard } from "./MarkdownClipboard";
import {
  hasInvalidLocalCreationImages,
  hasLocalCreationImages,
  uploadCreationImages,
} from "./creationImages";
import {
  loadLocalCreationDefaults,
  localCreationInitial,
  matchesLocalCreationDefault,
  saveLocalCreationDefaults,
  validLocalCreationDefault,
  type LocalCreationDefaults,
} from "./CreationSettings";

type Draft = {
  requiredFieldKeys?: string[];
  reviewFieldKeys?: string[];
  recoveredRequestId?: string;
  values: Record<string, unknown>;
  labels: Record<string, string>;
  request?: CreationRequest;
  result?: CreationResult;
  continueCreating?: boolean;
};
const draftKey = (form: CreationForm) =>
  `fstodo.creation.v1:${form.context}:${creationTargetKey(form.target)}`;
export const creationContinuousKey = "fstodo.creation-continuous.v1";
function requiredCreationKeys(form: CreationForm, ...groups: (string[] | undefined)[]) {
  return [...new Set(groups.flatMap((keys) => keys || []))].filter((key) => form.fields.some((field) => field.key === key));
}
function includeRequiredVisibility(form: CreationForm, keys: string[]) {
  const selected = loadCreationVisibility(form);
  const next = [...new Set([...selected, ...keys])];
  if (keys.some((key) => !selected.includes(key))) localStorage.setItem(creationVisibilityKey(form), JSON.stringify(next));
  return next;
}

function loadContinuousCreation(): boolean {
  try {
    return localStorage.getItem(creationContinuousKey) === "true";
  } catch {
    return false;
  }
}

export function CreateWorkItem({
  locations: providedLocations,
  initialType,
  initialSpace,
  entryIntent = "recovery",
  recordsChanged,
  close,
  created,
}: {
  locations: CreationLocation[];
  initialType?: string;
  initialSpace?: string;
  entryIntent?: "create" | "recovery";
  recordsChanged?: () => void;
  close: () => void;
  created: () => Promise<void>;
}) {
  const [recoveryEntries] = useState(providedLocations);
  const locations = entryIntent === "recovery" && recoveryEntries.some((entry) => entry.pending_form?.pending) ? recoveryEntries : providedLocations;
  const [locationKey, setLocationKey] = useState(() =>
    creationTargetKey(
      locations.find(
        (l) =>
          (!initialType || l.type_key === initialType) &&
          (!initialSpace || l.project_key === initialSpace),
      ) || locations[0],
    ),
  );
  const location = locations.find((l) => creationTargetKey(l) === locationKey);
  const [form, setForm] = useState<CreationForm | null>(null);
  const peopleLookup = useRef<{ form: CreationForm; request: Promise<CreationLookupResult> | null } | null>(null);
  const relationLookup = useRef<{ form: CreationForm; requests: Map<string, Promise<CreationLookupResult>> } | null>(null);
  function loadPeople(currentForm: CreationForm, fieldKey: string): Promise<CreationLookupResult> {
    if (peopleLookup.current?.form !== currentForm)
      peopleLookup.current = { form: currentForm, request: null };
    const cache = peopleLookup.current;
    if (!cache.request) {
      const request = lookupCreationField(currentForm.target, fieldKey, "");
      cache.request = request;
      request.catch(() => {
        if (cache.request === request) cache.request = null;
      });
    }
    return cache.request;
  }
  function loadRelation(currentForm: CreationForm, fieldKey: string): Promise<CreationLookupResult> {
    if (relationLookup.current?.form !== currentForm)
      relationLookup.current = { form: currentForm, requests: new Map() };
    const cache = relationLookup.current;
    let request = cache.requests.get(fieldKey);
    if (!request) {
      request = lookupCreationField(currentForm.target, fieldKey, "");
      cache.requests.set(fieldKey, request);
      request.catch(() => { if (cache.requests.get(fieldKey) === request) cache.requests.delete(fieldKey); });
    }
    return request;
  }
  useEffect(() => {
    const field = form?.fields.find((item) => item.kind === "people");
    if (form && field) void loadPeople(form, field.key).catch(() => {});
    if (form) for (const relation of form.fields.filter((item) => item.kind === "relation"))
      void loadRelation(form, relation.key).catch(() => {});
  }, [form]);
  const [draft, setDraft] = useState<Draft>({ values: {}, labels: {} });
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [defaults, setDefaults] = useState<LocalCreationDefaults>({});
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [imageBusyFields, setImageBusyFields] = useState<
    Record<string, boolean>
  >({});
  const imageBusy = Object.values(imageBusyFields).some(Boolean);
  const imageBusyRef = useRef<Record<string, boolean>>({});
  const [stage, setStage] = useState<"edit" | "review" | "result">("edit");
  const [pendingEntry, setPendingEntry] = useState(false);
  const hasMultipleRecords = entryIntent === "recovery" && locations.filter((entry) => entry.pending_form?.pending).length > 1;
  const [recordsOverview, setRecordsOverview] = useState(hasMultipleRecords);
  const [recoveredRecords, setRecoveredRecords] = useState<string[]>([]);
  const recoveryLocations = locations.filter((entry) => entry.pending_form?.pending && !recoveredRecords.includes(entry.pending_form.pending.request.request_id));
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [itemNumber, setItemNumber] = useState("");
  const [reload, setReload] = useState(0);
  const [continuous, setContinuous] = useState(loadContinuousCreation);
  const [preparingNext, setPreparingNext] = useState(false);
  const [nextFailed, setNextFailed] = useState(false);
  const [previousCreated, setPreviousCreated] = useState("");
  const [entryGeneration, setEntryGeneration] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const recoveryNotice = useRef<HTMLDivElement>(null);
  const [recoveryFocus, setRecoveryFocus] = useState(0);
  const handledRecoveryFocus = useRef(0);
  useLayoutEffect(() => {
    if (stage !== "edit" || recoveryFocus <= handledRecoveryFocus.current || !recoveryNotice.current || !content.current) return;
    handledRecoveryFocus.current = recoveryFocus;
    content.current.scrollTop += recoveryNotice.current.getBoundingClientRect().top - content.current.getBoundingClientRect().top - 12;
    recoveryNotice.current.focus({ preventScroll: true });
  }, [stage, recoveryFocus]);
  const backdropScrollRef = useScrollIsolation();
  const busyRef = useRef(false);
  const closeRef = useRef(close);
  closeRef.current = close;
  useLayoutEffect(() => {
    if (stage !== "review") return;
    if (content.current) content.current.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
  }, [stage]);
  useEffect(() => {
    function preferenceChanged(event: StorageEvent) {
      if (event.key === creationContinuousKey || event.key === null)
        setContinuous(loadContinuousCreation());
    }
    window.addEventListener("storage", preferenceChanged);
    return () => window.removeEventListener("storage", preferenceChanged);
  }, []);
  useEffect(() => {
    if (entryGeneration > 0 && stage === "edit")
      panel.current?.querySelector<HTMLInputElement>("#create-name")?.focus();
  }, [entryGeneration, stage]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    function keyboard(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      const popup = document.querySelector(
        ".select-menu, .creation-lookup-menu",
      );
      if (e.key === "Escape" && !popup) {
        e.preventDefault();
        if (
          !busyRef.current &&
          !Object.values(imageBusyRef.current).some(Boolean)
        )
          closeRef.current();
      }
      if (e.key !== "Tab" || popup) return;
      const controls = [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) || []),
      ].filter((element) => !element.closest("[hidden]"));
      const first = controls[0],
        last = controls.at(-1);
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === panel.current ||
          document.activeElement === heading.current)
      ) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, []);
  const sourceId = location?.source_id;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setItemNumber("");
    setForm(null);
    setDefaults({});
    setNextFailed(false);
    setPreviousCreated("");
    setImageBusyFields({});
    imageBusyRef.current = {};
    if (!location) {
      setLoading(false);
      return;
    }
    (location.pending_form && !recoveredRecords.includes(location.pending_form.pending?.request.request_id || "")
      ? Promise.resolve(location.pending_form)
      : getCreationForm(location)
    )
      .then(async (next) => {
        if (cancelled) return;
        let saved: Draft | null = null;
        try {
          saved = JSON.parse(
            localStorage.getItem(draftKey(next)) || "null",
          ) as Draft | null;
        } catch {
          /* 草稿读取失败不影响远端台账恢复 */
        }
        const localDefaults = loadLocalCreationDefaults(next);
        const values = Object.fromEntries(
          next.fields.map((f) => [
            f.key,
            saved?.values && Object.hasOwn(saved.values, f.key)
              ? saved.values[f.key]
              : f.kind === "bool" && !f.required && f.initial == null ? null : localCreationInitial(f, localDefaults),
          ]),
        );
        let restored: Draft = next.pending
          ? {
              values: next.pending.request.fields,
              labels: saved?.labels || {},
              continueCreating: saved?.continueCreating,
              reviewFieldKeys: saved?.reviewFieldKeys,
              requiredFieldKeys: requiredCreationKeys(next, saved?.requiredFieldKeys, saved?.reviewFieldKeys),
              ...next.pending,
            }
          : {
              recoveredRequestId: saved?.recoveredRequestId,
              reviewFieldKeys: saved?.reviewFieldKeys,
              requiredFieldKeys: requiredCreationKeys(next, saved?.requiredFieldKeys, saved?.reviewFieldKeys),
              values,
              labels: saved?.labels || {},
              ...(saved?.request
                ? { request: saved.request, result: saved.result }
                : {}),
              continueCreating: saved?.continueCreating,
            };
        if (restored.result?.outcome === "not_submitted" && saved?.recoveredRequestId === restored.request?.request_id) {
          const recoveredRequestId = restored.request!.request_id;
          setError(requiredCreationKeys(next, restored.result.rejected_field_keys).length ? "" : restored.result.message);
          restored = { values: saved?.recoveredRequestId === recoveredRequestId ? saved.values : restored.values, labels: saved?.recoveredRequestId === recoveredRequestId ? saved.labels : restored.labels, requiredFieldKeys: restored.requiredFieldKeys, reviewFieldKeys: restored.reviewFieldKeys, continueCreating: restored.continueCreating, recoveredRequestId };
          try {
            localStorage.setItem(draftKey(next), JSON.stringify(restored));
            includeRequiredVisibility(next, restored.requiredFieldKeys || []);
            await acknowledgeCreationRecovery(recoveredRequestId);
            setRecoveredRecords((ids) => [...ids, recoveredRequestId]);
            recordsChanged?.();
          } catch {
            setError("草稿恢复尚未完成，本机记录或恢复确认未能保存。请保留此窗口，重新打开后可继续恢复。");
          }
        }
        if (cancelled) return;
        setForm(next);
        try { setSelectedFields(includeRequiredVisibility(next, restored.requiredFieldKeys || [])); }
        catch { setSelectedFields([...new Set([...loadCreationVisibility(next), ...(restored.requiredFieldKeys || [])])]); setError("字段显示偏好未能保存，草稿已保留，请检查本机存储后重试。"); }
        setDefaults(localDefaults);
        draftRef.current = restored;
        setDraft(restored);
        setPendingEntry(entryIntent === "create" && !!restored.request && restored.result?.outcome !== "not_submitted");
        setStage(restored.request ? "result" : "edit");
      })
      .catch((e) => {
        if (!cancelled) setError(asError(e).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locationKey, sourceId, reload]);
  function save(next: Draft, keepInMemory = false): boolean {
    if (!form) return false;
    try {
      localStorage.setItem(draftKey(form), JSON.stringify(next));
      draftRef.current = next;
      setDraft(next);
      return true;
    } catch {
      if (keepInMemory) {
        draftRef.current = next;
        setDraft(next);
      }
      setError("本机草稿未能保存，请检查磁盘空间后重试。");
      return false;
    }
  }
  const formIdentity = form && creationTargetKey(form.target) === locationKey
    ? JSON.stringify([form.context, form.target.source_id, form.target.project_key, form.target.type_key, form.version])
    : "";
  const currentForm = useRef(form);
  currentForm.current = form;
  const activeFormIdentity = useRef(formIdentity);
  activeFormIdentity.current = formIdentity;
  const selectedRelationIds = (value: unknown) =>
    (Array.isArray(value) ? value : creationEmpty(value) ? [] : [value]).map(String);
  const usableRelationLabel = (label: string | undefined, id: string) => !!label?.trim() && label.trim() !== id;
  const unresolvedRelations = form?.fields.filter((field) => field.kind === "relation").map((field) => ({
    fieldKey: field.key,
    ids: selectedRelationIds(draft.values[field.key]).filter((id) =>
      !usableRelationLabel(draft.labels[`${field.key}:${id}`], id)),
  })).filter((field) => field.ids.length) || [];
  const unresolvedRelationKey = JSON.stringify(unresolvedRelations);
  useEffect(() => {
    if (!form || !formIdentity || !unresolvedRelations.length) return;
    let cancelled = false;
    const identity = formIdentity;
    const requested = unresolvedRelations;
    Promise.allSettled(requested.map(async (entry) => {
      const field = form.fields.find((field) => field.key === entry.fieldKey)!;
      const staticOptions = field.options.filter((option) => entry.ids.includes(option.value) && usableRelationLabel(option.label, option.value));
      const ids = entry.ids.filter((id) => !staticOptions.some((option) => option.value === id));
      const found = ids.length ? await resolveCreationRelationLabels(form.target, entry.fieldKey, ids) : { options: [], warning: null };
      return { ...entry, found: { ...found, options: [...staticOptions, ...found.options] } };
    })).then((results) => {
      if (cancelled || activeFormIdentity.current !== identity) return;
      const latest = draftRef.current;
      const labels = { ...latest.labels };
      let changed = false;
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const { fieldKey, ids, found } = result.value;
        const field = currentForm.current?.fields.find((entry) => entry.key === fieldKey && entry.kind === "relation");
        if (!field) continue;
        const selected = selectedRelationIds(latest.values[fieldKey]);
        for (const option of found.options) {
          const key = `${fieldKey}:${option.value}`;
          if (!ids.includes(option.value) || !selected.includes(option.value) ||
              !usableRelationLabel(option.label, option.value) ||
              usableRelationLabel(labels[key], option.value)) continue;
          labels[key] = option.label;
          changed = true;
        }
      }
      if (changed) save({ ...latest, labels }, true);
    });
    return () => { cancelled = true; };
  }, [formIdentity, unresolvedRelationKey]);
  function withLatestRequestLabels(next: Draft, identity: string): Draft {
    const latest = draftRef.current;
    if (activeFormIdentity.current !== identity || !next.request ||
        latest.request?.request_id !== next.request.request_id) return next;
    return { ...next, labels: { ...next.labels, ...latest.labels } };
  }
  function change(
    key: string,
    value: unknown,
    labels: Record<string, string> = {},
  ) {
    if (draftRef.current.request && draftRef.current.result?.outcome !== "not_submitted") return;
    save(
      {
        ...(draftRef.current.request ? { request: draftRef.current.request, result: draftRef.current.result } : {}),
        reviewFieldKeys: draftRef.current.reviewFieldKeys,
        requiredFieldKeys: draftRef.current.requiredFieldKeys,
        recoveredRequestId: draftRef.current.recoveredRequestId,
        values: { ...draftRef.current.values, [key]: value },
        labels: { ...draftRef.current.labels, ...labels },
      },
      true,
    );
  }
  async function restoreUnsubmitted(message: string, requestId?: string, focusNotice = false) {
    const requiredFieldKeys = requiredCreationKeys(form!, draftRef.current.requiredFieldKeys, draftRef.current.reviewFieldKeys, draftRef.current.result?.rejected_field_keys);
    const reviewFieldKeys = requiredCreationKeys(form!, draftRef.current.result?.outcome === "not_submitted" ? draftRef.current.result.rejected_field_keys : draftRef.current.reviewFieldKeys);
    const explainedRejection = draftRef.current.result?.outcome === "not_submitted" && reviewFieldKeys.length > 0;
    const persisted = save(
      {
        recoveredRequestId: requestId ?? draftRef.current.recoveredRequestId,
        requiredFieldKeys,
        reviewFieldKeys,
        values: draftRef.current.values,
        labels: draftRef.current.labels,
      },
      true,
    );
    let visibilitySaved = true;
    try { setSelectedFields(includeRequiredVisibility(form!, requiredFieldKeys)); }
    catch { visibilitySaved = false; setSelectedFields([...new Set([...selectedFields, ...requiredFieldKeys])]); }
    setStage("edit");
    if (focusNotice && reviewFieldKeys.length) setRecoveryFocus((value) => value + 1);
    setError(
      !visibilitySaved ? "字段显示偏好未能保存，当前填写和本次必填要求已保留。请检查本机存储后重新打开恢复。" : persisted
        ? explainedRejection ? "" : message
        : `${message} 本机草稿未能保存，当前填写仍保留在此窗口，请检查磁盘空间后重试。`,
    );
    if (persisted && visibilitySaved && requestId) {
      try { await acknowledgeCreationRecovery(requestId); setRecoveredRecords((ids) => [...ids, requestId]); recordsChanged?.(); }
      catch { setError(`${message} 恢复确认未能保存，重新打开后可继续恢复。`); }
    }
  }
  function updateDefault(field: CreationField, remove = false) {
    if (!form) return;
    const next = { ...defaults };
    if (remove) delete next[field.key];
    else {
      const entry = {
        kind: field.kind,
        multiple: field.multiple,
        value: draft.values[field.key],
      };
      if (!validLocalCreationDefault(field, entry)) return;
      next[field.key] = entry;
    }
    try {
      saveLocalCreationDefaults(form, next);
      setDefaults(next);
      setError("");
    } catch {
      setError("本地默认值未能保存，当前填写内容已保留，请重试。");
    }
  }
  function updateContinuous(next: boolean) {
    try {
      localStorage.setItem(creationContinuousKey, String(next));
      setContinuous(next);
      setError("");
    } catch {
      setError("连续创建偏好未能保存，请重试。");
    }
  }
  async function prepareNext(completedForm: CreationForm, refreshWarning = "") {
    if (draftRef.current.result?.outcome !== "verified") return;
    setPreparingNext(true);
    setNextFailed(false);
    setError("");
    try {
      // 连续创建必须重新发现，不能复用恢复待核验记录时携带的 pending_form。
      const next = await getCreationForm(completedForm.target);
      if (
        next.context !== completedForm.context ||
        creationTargetKey(next.target) !==
          creationTargetKey(completedForm.target) ||
        next.pending
      )
        throw new Error(
          "创建位置或账号已变化，或仍有其他待核验记录，请重新核对。",
        );
      const localDefaults = loadLocalCreationDefaults(next);
      const nextDraft: Draft = {
        values: Object.fromEntries(
          next.fields.map((field) => [
            field.key,
            field.key === "name" ||
            field.kind === "textarea" ||
            field.kind === "attachment" ||
            (field.kind === "people" && !field.reporter_self)
              ? field.multiple
                ? []
                : ""
              : field.kind === "bool" && !field.required && field.initial == null ? null : localCreationInitial(field, localDefaults),
          ]),
        ),
        labels: {},
      };
      // 同一稳定键一次替换旧请求与草稿，写入失败仍保留已确认的成功记录。
      localStorage.setItem(draftKey(next), JSON.stringify(nextDraft));
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      setForm(next);
      setSelectedFields(loadCreationVisibility(next));
      setDefaults(localDefaults);
      setItemNumber("");
      setImageBusyFields({});
      imageBusyRef.current = {};
      setPreviousCreated("上一条工作事项已创建并核验，可以继续填写下一条。");
      setEntryGeneration((generation) => generation + 1);
      setStage("edit");
      setError(refreshWarning);
    } catch (failure) {
      setNextFailed(true);
      setError(
        `工作事项已创建成功，但未能准备下一条：${asError(failure).message} 请重试继续创建。${refreshWarning}`,
      );
    } finally {
      setPreparingNext(false);
    }
  }
  async function afterVerified(completed: Draft, completedForm: CreationForm) {
    if (completed.request) {
      setRecoveredRecords((ids) => [...new Set([...ids, completed.request!.request_id])]);
      recordsChanged?.();
    }
    let refreshWarning = "";
    try {
      await created();
    } catch {
      refreshWarning = "工作事项已确认创建，清单刷新失败，可稍后刷新。";
    }
    if (completed.continueCreating)
      await prepareNext(completedForm, refreshWarning);
    else if (refreshWarning) setError(refreshWarning);
  }
  async function retryNext() {
    if (
      !form ||
      busyRef.current ||
      draftRef.current.result?.outcome !== "verified"
    )
      return;
    busyRef.current = true;
    setBusy(true);
    try {
      await prepareNext(form);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function review() {
    if (!form || imageBusy) return;
    try {
      for (const field of form.fields.filter((field) => field.kind === "attachment"))
        creationAttachments(draft.values[field.key]);
    } catch (failure) {
      setError(asError(failure).message);
      return;
    }
    if (
      form.fields.some(
        (f) =>
          f.kind === "textarea" &&
          hasInvalidLocalCreationImages(draft.values[f.key]),
      )
    ) {
      setError(
        "正文含无法识别的本机图片，请重新粘贴后核对。图片和草稿已保留。",
      );
      return;
    }
    const missing = form.fields.find(
      (f) =>
        (f.required || draft.requiredFieldKeys?.includes(f.key)) &&
        (creationEmpty(draft.values[f.key]) || f.kind === "unsupported"),
    );
    if (missing) {
      setError(
        missing.kind === "unsupported"
          ? `「${missing.label}」暂不支持填写，请前往飞书项目创建。`
          : `请填写「${missing.label}」`,
      );
      return;
    }
    setError("");
    if (draft.reviewFieldKeys?.length) {
      setSelectedFields([...new Set([...selectedFields, ...draft.reviewFieldKeys])]);
      if (!save({ ...draftRef.current, reviewFieldKeys: undefined })) return;
    }
    setStage("review");
  }
  async function submit() {
    if (!form || busyRef.current || imageBusy || draft.request) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      // 此时尚未登记或发送创建；单张图片成功即保存引用，失败可保留草稿。
      let values: Record<string, unknown>;
      try {
        values = await uploadCreationImages(
          form,
          draftRef.current.values,
          (next) => save({ ...draftRef.current, values: next }, true),
          (completed, total) =>
            setUploadProgress(
              completed < total
                ? `正在上传图片 ${completed + 1}/${total}…`
                : "图片已上传，正在准备创建…",
            ),
        );
        values = await uploadCreationAttachments(
          form, values,
          (next) => save({ ...draftRef.current, values: next }, true),
          (completed, total) => setUploadProgress(completed < total
            ? `正在上传附件 ${completed + 1}/${total}…` : "附件已上传，正在准备创建…"),
        );
      } catch (failure) {
        setError(
          `${asError(failure).message} 尚未发起创建，文件和草稿已保留。`,
        );
        return;
      }
      if (Object.values(values).some(hasLocalCreationImages)) {
        setError("正文仍有待处理的本机图片，请返回编辑后核对。");
        return;
      }
      const fields = Object.fromEntries(
        visibleCreationFields(form, selectedFields, values)
          .filter((f) => f.kind !== "unsupported")
          .map((f) => [f.key, values[f.key]]),
      );
      const request: CreationRequest = {
        target: form.target,
        version: form.version,
        request_id: crypto.randomUUID(),
        fields,
      };
      const pending: Draft = {
        ...draftRef.current,
        values,
        request,
        continueCreating: continuous,
      };
      if (!save(pending)) return;
      setUploadProgress("");
      setStage("result");
      const result = await createWorkItem(request);
      const completed = withLatestRequestLabels({ ...pending, result }, formIdentity);
      save(completed, true);
      if (result.outcome === "verified") {
        await afterVerified(completed, form);
      }
    } catch (e) {
      // 后端返回的校验错误发生在写入前；传输中断则保留请求，交给只读核验。
      if (
        typeof e === "object" &&
        e &&
        "before_write" in e &&
        e.before_write === true
      ) {
        await restoreUnsubmitted(asError(e).message);
      } else {
        setError(asError(e).message);
      }
    } finally {
      setUploadProgress("");
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function verify() {
    if (!draft.request || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await verifyCreation(
        draft.request.request_id,
        itemNumber,
        draft.request,
      );
      const completed = withLatestRequestLabels({ ...draft, result }, formIdentity);
      save(completed, true);
      if (result.outcome === "verified") {
        if (form) await afterVerified(completed, form);
      }
    } catch (e) {
      setError(asError(e).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const confirmed = draft.result?.outcome === "verified";
  const rejected = draft.result?.outcome === "not_submitted";
  const locked = !!draft.request && !confirmed && !rejected;
  async function returnToDraft() {
    setPendingEntry(false);
    if (rejected) await restoreUnsubmitted(draft.result!.message, draft.request?.request_id, true);
    else setStage("edit");
  }
  const spaces = [
    ...new Map(
      locations.map((l) => [
        l.project_key,
        { value: l.project_key, label: l.space },
      ]),
    ).values(),
  ];
  const blocked =
    !location ||
    form?.fields.some((f) => (f.required || draft.requiredFieldKeys?.includes(f.key)) && f.kind === "unsupported");
  function control(f: CreationField) {
    const value = draft.values[f.key];
    if (!form) return null;
    if (f.kind === "attachment")
      return <CreationAttachmentPicker
        key={`${entryGeneration}:${form.context}:${creationTargetKey(form.target)}:${f.key}`}
        form={form} field={f} value={value} onChange={(value) => change(f.key, value)}
        onBusyChange={(busy) => {
          imageBusyRef.current = { ...imageBusyRef.current, [f.key]: busy };
          setImageBusyFields(imageBusyRef.current);
        }} />;
    if (f.kind === "people" || f.kind === "relation")
      return (
        <CreationLookup
          key={`${entryGeneration}:${form.version}:${f.key}`}
          form={form}
          field={f}
          value={value}
          labels={draft.labels}
          change={(v, labels) => change(f.key, v, labels)}
          loadOptions={() => f.kind === "people" ? loadPeople(form, f.key) : loadRelation(form, f.key)}
          localFilter
        />
      );
    if (f.kind === "select")
      return (
        <CreationSelect
          field={f}
          value={value}
          onChange={(v) => change(f.key, v)}
          savedDefault={defaults[f.key]}
          onToggleDefault={() =>
            updateDefault(
              f,
              matchesLocalCreationDefault(f, value, defaults[f.key]),
            )
          }
        />
      );
    if (f.kind === "bool")
      return (
        <label className="type-toggle">
          <input
            type="checkbox"
            role="switch"
            aria-label={f.label}
            checked={value === true}
            onChange={(e) => change(f.key, e.target.checked)}
          />
          <span className="type-switch-track" aria-hidden="true" />
          {creationEmpty(value) ? "未填写" : value === true ? "开启" : "关闭"}
        </label>
      );
    if (f.kind === "unsupported")
      return (
        <p className="hint">
          此字段暂不支持填写
          {f.required ? "，请前往飞书项目创建。" : "，将沿用飞书默认值。"}
        </p>
      );
    if (f.kind === "textarea")
      return (
        <MarkdownClipboard
          key={`${entryGeneration}:${form.context}:${creationTargetKey(form.target)}:${f.key}`}
          id={`create-${f.key}`}
          ariaLabel={f.label}
          required={f.required}
          value={String(value ?? "")}
          onChange={(value) => change(f.key, value)}
          target={form.target}
          context={form.context}
          fieldKey={f.key}
          onBusyChange={(busy) => {
            imageBusyRef.current = { ...imageBusyRef.current, [f.key]: busy };
            setImageBusyFields(imageBusyRef.current);
          }}
        />
      );
    return (
      <input
        id={`create-${f.key}`}
        aria-label={f.label}
        aria-required={f.required}
        type={
          f.kind === "date" ? "date" : f.kind === "number" ? "number" : "text"
        }
        placeholder="待填"
        step={f.kind === "number" ? "any" : undefined}
        value={String(value ?? "")}
        onChange={(e) => change(f.key, e.target.value)}
      />
    );
  }
  const reviewFields = form?.fields.filter((field) => draft.reviewFieldKeys?.includes(field.key)) || [];
  const requiredFieldKeys = form ? requiredCreationKeys(form, draft.requiredFieldKeys) : [];
  function focusCreationField(key: string) {
    const field = document.getElementById(`creation-field-${key}`);
    field?.scrollIntoView?.({ block: "center" });
    const primary = document.getElementById(`create-${key}`);
    const control = primary || field?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, [contenteditable="true"], [role="combobox"]');
    control?.focus({ preventScroll: true });
  }
  const displayedFields = form ? visibleCreationFields(form, [...selectedFields, ...requiredFieldKeys, ...reviewFields.map((field) => field.key)], draft.values).map((field) => requiredFieldKeys.includes(field.key) ? { ...field, required: true } : field) : [];
  const groups = [
    {
      title: "基本信息",
      fields:
        displayedFields.filter(
          (f) => f.kind !== "people" && f.kind !== "relation",
        ) || [],
    },
    {
      title: "关联信息",
      fields: displayedFields.filter((f) => f.kind === "relation"),
    },
    {
      title: "人员信息",
      fields: displayedFields.filter((f) => f.kind === "people"),
    },
  ];
  return createPortal(
    <div className="creation-backdrop scroll-isolation-boundary" ref={backdropScrollRef}>
      <section
        className="creation-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="creation-title"
        tabIndex={-1}
        ref={panel}
      >
        <header className="creation-header">
          <div>
            <h2 id="creation-title" ref={heading} tabIndex={-1}>
              {recordsOverview ? "创建记录" : stage === "edit" && locked ? "查看已提交草稿" : stage === "review"
                ? "核对创建内容"
                : stage === "result"
                  ? confirmed
                    ? "已创建"
                    : busy
                      ? "正在处理"
                      : rejected ? "创建未成功" : pendingEntry ? "新建工作事项" : "核对创建结果"
                  : `新建${location?.name || "工作事项"}`}
            </h2>
            <p className="hint">
              {recordsOverview ? "逐条查看提交结果，草稿会保留在本机" : stage === "edit" && locked ? "上次提交内容已保留，请先核验创建结果" : stage === "edit"
                ? "填写内容后核对并创建"
                : `${location?.space || ""} / ${location?.name || "工作事项"}`}
            </p>
          </div>
          {!recordsOverview && hasMultipleRecords && <button className="secondary" disabled={busy || imageBusy} onClick={() => setRecordsOverview(true)}>全部记录（{recoveryLocations.length}）</button>}
          <button
            className="icon-button"
            aria-label="关闭新建"
            disabled={busy || imageBusy}
            onClick={close}
          >
            <X size={19} />
          </button>
        </header>
        <div className="creation-content" ref={content}>
          {recordsOverview ? <div className="creation-records"><p className="hint">共 {recoveryLocations.length} 条需要处理的创建记录。选择一条查看提交内容与结果。</p>{recoveryLocations.map((entry) => {
            const pending = entry.pending_form!.pending!;
            const failed = pending.result.outcome === "not_submitted";
            return <article className="creation-record-card" key={pending.request.request_id}><span className="creation-record-state">{failed ? "创建未成功" : "结果待核验"}</span><h3>{String(pending.request.fields.name || "未填写标题")}</h3><p>{entry.space} · {entry.name}</p><button className="secondary" onClick={() => { setLocationKey(creationTargetKey(entry)); setRecordsOverview(false); setStage("result"); }}>{failed ? "查看失败并恢复草稿" : "查看并核验结果"}</button></article>;
          })}{!recoveryLocations.length && <p>没有待处理的创建记录。</p>}</div> : <>
          {stage === "edit" && (
            <div className="creation-location">
              <div>
                <span>空间</span>
                <Select
                  ariaLabel="新建空间"
                  disabled={imageBusy}
                  value={location?.project_key || ""}
                  options={spaces}
                  onChange={(key) =>
                    setLocationKey(
                      creationTargetKey(
                        locations.find((l) => l.project_key === key)!,
                      ),
                    )
                  }
                />
              </div>
              <div>
                <span>工作类型</span>
                <Select
                  ariaLabel="新建类型"
                  disabled={imageBusy}
                  value={locationKey}
                  options={locations
                    .filter((l) => l.project_key === location?.project_key)
                    .map((l) => ({
                      value: creationTargetKey(l),
                      label: l.name,
                    }))}
                  onChange={setLocationKey}
                />
              </div>
            </div>
          )}
          {loading ? (
            <p className="creation-loading" role="status">
              <LoaderCircle size={18} className="spin" />
              正在读取创建表单…
            </p>
          ) : form && stage === "edit" ? (
            <>
              {previousCreated && (
                <p className="creation-continuous-success" role="status">
                  <Check size={16} />
                  {previousCreated}
                </p>
              )}
              {locked && <div className="creation-pending-note" role="status"><CircleAlert size={18} /><div><strong>这份草稿仍有待核验的提交</strong><p>当前仅供查看；为避免重复创建，确认上次结果前不能编辑或再次提交。</p></div><button className="secondary" onClick={() => setStage("result")}>核验创建结果</button></div>}
              {!!reviewFields.length && <div className="creation-required-notice" role="note" tabIndex={-1} ref={recoveryNotice} aria-label="已自动显示本次创建必填字段"><CircleAlert size={20} aria-hidden="true" /><div><strong>已自动显示本次创建必填字段</strong><p>飞书提交校验返回这些本次必填字段。原填写已保留，请核对后继续。</p><div className="creation-review-links">{reviewFields.map((field) => <button className="text-button" key={field.key} aria-label={field.label} onClick={() => focusCreationField(field.key)}>{field.label}<span className="creation-review-link-state">{creationEmpty(draft.values[field.key]) ? "尚未填写，请补充" : "已有内容，请核对"}</span></button>)}</div></div></div>}
              {!locked && <p className="hint">
                标有 <span className="creation-required">*</span>{" "}
                的字段为必填。填写会自动保存到本机，关闭窗口或重启后可继续。
              </p>}
              {locked ? <CreationReview form={form} groups={groups} values={draft.request!.fields} labels={draft.labels} /> : <fieldset className="creation-fields creation-draft-fields">
                {form.fields.some((field) => !fixedCreationField(field)) && <CreationFieldTip />}
                <CreationFieldVisibility key={`${form.context}:${creationTargetKey(form.target)}`} form={form}
                  requiredKeys={requiredFieldKeys}
                  selected={selectedFields} values={draft.values} disabled={imageBusy}
                  onChange={(keys) => {
                    try {
                      localStorage.setItem(creationVisibilityKey(form), JSON.stringify(keys));
                      setSelectedFields(keys);
                      setError("");
                    } catch { setError("字段显示偏好未能保存，请重试。"); }
                  }} />
                {!groups.find((group) => group.title === "人员信息")?.fields.length &&
                  form.role_requirements_complete === false && (
                    <p className="creation-role-note hint">
                      飞书未提供部分角色的必填规则，请在「显示字段 → 人员信息」中按该类型的要求添加并填写人员。
                    </p>
                  )}
                {groups
                  .filter((g) => g.fields.length)
                  .map((g) => (
                    <section
                      className="creation-group"
                      key={g.title}
                      aria-label={g.title}
                    >
                      <h3>{g.title}</h3>
                      {g.title === "人员信息" &&
                        form.role_requirements_complete === false && (
                          <p className="creation-role-note hint">
                            飞书未提供部分角色的必填规则，请按该类型在飞书中的要求填写人员。
                          </p>
                        )}
                      {g.fields.map((f) => (
                        <div className="creation-field" key={f.key} id={`creation-field-${f.key}`}>
                          <label htmlFor={`create-${f.key}`}>
                            {f.label}
                            {f.required && (
                              <span
                                className="creation-required"
                                aria-label="必填"
                              >
                                {" "}
                                *
                              </span>
                            )}
                          </label>
                          <div className="creation-field-value">
                            {requiredFieldKeys.includes(f.key) && <p className="creation-field-required-status"><CircleAlert size={14} aria-hidden="true" /><strong>本次创建必填</strong>{reviewFields.some((field) => field.key === f.key) && <span>{creationEmpty(draft.values[f.key]) ? "尚未填写，请补充" : "已有内容，请核对"}</span>}</p>}
                            {control(f)}
                            {f.kind === "bool" && !f.required && !creationEmpty(draft.values[f.key]) && (
                              <button type="button" className="text-button" onClick={() => change(f.key, null)}>
                                清空{f.label}
                              </button>
                            )}
                            {f.kind === "select" &&
                              defaults[f.key] &&
                              !validLocalCreationDefault(
                                f,
                                defaults[f.key],
                              ) && (
                                <p className="hint">本地默认已失效，不再预填</p>
                              )}
                          </div>
                        </div>
                      ))}
                    </section>
                  ))}
              </fieldset>}
            </>
          ) : form && stage === "review" ? (
            <>
              <div className="creation-review-intro">
                <p>请核对以下内容，确认后将创建到飞书项目。</p>
                <span>共 {displayedFields.length} 项</span>
              </div>
              {form.fields.some((field) =>
                hasLocalCreationImages(draft.values[field.key]),
              ) && (
                <p className="hint">
                  确认创建后会先上传正文图片，再创建工作事项。
                </p>
              )}
              {form.fields.some((field) => field.kind === "attachment" && !creationEmpty(draft.values[field.key])) &&
                <p className="hint">确认创建后会先上传附件；全部附件写入并从飞书回读核对后才显示成功。</p>}
              <CreationReview
                form={form}
                groups={groups}
                values={draft.values}
                labels={draft.labels}
              />
            </>
          ) : (
            form && (
              <div
                className={`creation-result ${confirmed ? "creation-success" : ""}`}
                role="status"
              >
                <div className="creation-result-heading">
                  <span className="creation-result-icon">{busy ? <LoaderCircle size={23} className="spin" /> : confirmed ? <Check size={23} /> : <CircleAlert size={23} />}</span>
                  <div><h3>{busy ? "正在确认创建结果" : confirmed ? "工作事项已创建" : rejected ? "飞书未接受本次创建" : pendingEntry ? "此位置有一条待核验创建" : "创建结果尚未确认"}</h3><p>
                  {busy && !confirmed
                    ? "正在提交并从飞书回读核对，请稍候…"
                    : pendingEntry ? "请先处理上次提交。可以返回查看草稿，或核验它是否已在飞书创建，避免重复提交。"
                    : draft.result?.message ||
                      "提交结果尚未确认，草稿已保留。请先在飞书核对，避免重复创建。"}
                </p></div></div>
                <div className="creation-result-summary"><FileText size={18} /><div><span>本次草稿 · {location?.name || "工作事项"}</span><strong>{String(draft.values.name || "未填写标题")}</strong><small>{location?.space}</small></div></div>
                {preparingNext && (
                  <p className="hint" role="status">
                    正在准备下一条创建表单…
                  </p>
                )}
                {draft.result?.item_id && (
                  <strong>事项编号 {draft.result.item_id.work_item_id}</strong>
                )}
                {!confirmed && !rejected && !busy && (
                  <>
                    <p className="hint">
                      这里只会读取和核对结果，不会再次创建。
                    </p>
                    {!draft.result?.item_id && !pendingEntry && (
                      <details className="creation-manual-verify"><summary>已在飞书找到新事项？使用编号定位</summary><p className="hint" id="creation-number-help">仅在飞书确认出现了本次新建事项后使用。编号来自该事项的详情页，例如 123456；不是本机提交记录编号。不知道编号时可先返回草稿查看内容。</p><label>
                        飞书事项编号（可选）
                        <input
                          aria-label="核验事项编号"
                          aria-describedby="creation-number-help"
                          inputMode="numeric"
                          value={itemNumber}
                          onChange={(e) => setItemNumber(e.target.value)}
                        />
                      </label></details>
                    )}
                    <button className="primary" onClick={() => { if (pendingEntry) setPendingEntry(false); else void verify(); }}>
                      {pendingEntry ? "去核验上次创建" : "重新核验结果"}
                    </button>
                  </>
                )}
              </div>
            )
          )}
          {error && (
            <p className="error-text creation-error" role="alert">
              {error}
            </p>
          )}
          {uploadProgress && (
            <p className="hint creation-upload-progress" role="status">
              <LoaderCircle size={14} className="spin" />
              {uploadProgress}
            </p>
          )}
          {!loading && !form && (
            <button
              className="secondary"
              onClick={() => setReload((v) => v + 1)}
            >
              重新读取表单
            </button>
          )}
          </>}
        </div>
        {!recordsOverview && <footer className="creation-footer">
          <span className="hint">
            {stage === "edit"
              ? "草稿仅保存在本机"
              : stage === "review"
                ? "创建权限以飞书项目为准"
                : ""}
          </span>
          {(stage === "edit" || stage === "review") && (
            <label className="type-toggle creation-continuous">
              <span>连续创建</span>
              <input
                type="checkbox"
                role="switch"
                aria-label="连续创建"
                aria-describedby="creation-continuous-hint"
                checked={continuous}
                disabled={loading || busy || imageBusy}
                onChange={(event) => updateContinuous(event.target.checked)}
              />
              <span className="type-switch-track" aria-hidden="true" />
              <span className="sr-only" id="creation-continuous-hint">
                创建并核验成功后，保留当前空间和类型，继续填写下一条。
              </span>
            </label>
          )}
          {stage === "edit" && (
            <button
              className="primary"
              disabled={loading || !!blocked || !form || imageBusy}
              onClick={() => locked ? setStage("result") : review()}
            >
              {locked ? "核验创建结果" : "核对内容"}
            </button>
          )}
          {stage === "review" && (
            <>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setStage("edit")}
              >
                <ArrowLeft size={14} />
                返回编辑
              </button>
              <button
                className="primary"
                disabled={busy || !!blocked}
                onClick={() => void submit()}
              >
                确认创建
              </button>
            </>
          )}
          {stage === "result" && confirmed && (
            <>
              {draft.continueCreating && !preparingNext && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void retryNext()}
                >
                  {nextFailed ? "重试继续创建" : "继续创建下一条"}
                </button>
              )}
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  try {
                    if (form) localStorage.removeItem(draftKey(form));
                    close();
                  } catch {
                    setError(
                      "创建已确认，本机草稿清理失败。请检查磁盘后重试。",
                    );
                  }
                }}
              >
                完成
              </button>
            </>
          )}
          {stage === "result" && !confirmed && !busy && <button className={rejected ? "primary" : "secondary"} onClick={() => void returnToDraft()}><ArrowLeft size={14} />返回草稿</button>}
        </footer>}
      </section>
    </div>,
    document.body,
  );
}
