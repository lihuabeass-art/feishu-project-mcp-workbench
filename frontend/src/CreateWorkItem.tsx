import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, LoaderCircle, X } from "lucide-react";
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
  creationEmpty,
  creationTargetKey,
  getCreationForm,
  verifyCreation,
  type CreationField,
  type CreationForm,
  type CreationLocation,
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
  values: Record<string, unknown>;
  labels: Record<string, string>;
  request?: CreationRequest;
  result?: CreationResult;
  continueCreating?: boolean;
};
const draftKey = (form: CreationForm) =>
  `fstodo.creation.v1:${form.context}:${creationTargetKey(form.target)}`;
export const creationContinuousKey = "fstodo.creation-continuous.v1";

function loadContinuousCreation(): boolean {
  try {
    return localStorage.getItem(creationContinuousKey) === "true";
  } catch {
    return false;
  }
}

export function CreateWorkItem({
  locations,
  initialType,
  initialSpace,
  close,
  created,
}: {
  locations: CreationLocation[];
  initialType?: string;
  initialSpace?: string;
  close: () => void;
  created: () => Promise<void>;
}) {
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
    (location.pending_form
      ? Promise.resolve(location.pending_form)
      : getCreationForm(location)
    )
      .then((next) => {
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
        const restored: Draft = next.pending
          ? {
              values: next.pending.request.fields,
              labels: saved?.labels || {},
              continueCreating: saved?.continueCreating,
              ...next.pending,
            }
          : {
              values,
              labels: saved?.labels || {},
              ...(saved?.request
                ? { request: saved.request, result: saved.result }
                : {}),
              continueCreating: saved?.continueCreating,
            };
        setForm(next);
        setSelectedFields(loadCreationVisibility(next));
        setDefaults(localDefaults);
        draftRef.current = restored;
        setDraft(restored);
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
  function change(
    key: string,
    value: unknown,
    labels: Record<string, string> = {},
  ) {
    save(
      {
        values: { ...draftRef.current.values, [key]: value },
        labels: { ...draftRef.current.labels, ...labels },
      },
      true,
    );
  }
  function restoreUnsubmitted(message: string) {
    const persisted = save(
      {
        values: draftRef.current.values,
        labels: draftRef.current.labels,
      },
      true,
    );
    setStage("edit");
    setError(
      persisted
        ? message
        : `${message} 本机草稿未能保存，当前填写仍保留在此窗口，请检查磁盘空间后重试。`,
    );
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
        f.required &&
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
      if (result.outcome === "not_submitted") {
        restoreUnsubmitted(result.message);
        return;
      }
      const completed = { ...pending, result };
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
        restoreUnsubmitted(asError(e).message);
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
      if (result.outcome === "not_submitted") {
        restoreUnsubmitted(result.message);
        return;
      }
      const completed = { ...draft, result };
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
    form?.fields.some((f) => f.required && f.kind === "unsupported");
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
  const displayedFields = form ? visibleCreationFields(form, selectedFields, draft.values) : [];
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
              {stage === "review"
                ? "核对创建内容"
                : stage === "result"
                  ? confirmed
                    ? "已创建"
                    : busy
                      ? "正在处理"
                      : "核对创建结果"
                  : `新建${location?.name || "工作事项"}`}
            </h2>
            <p className="hint">
              {stage === "edit"
                ? "填写内容后核对并创建"
                : `${location?.space || ""} / ${location?.name || "工作事项"}`}
            </p>
          </div>
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
              <p className="hint">
                标有 <span className="creation-required">*</span>{" "}
                的字段为必填。填写会自动保存到本机，关闭窗口或重启后可继续。
              </p>
              <div className="creation-fields">
                {form.fields.some((field) => !fixedCreationField(field)) && <CreationFieldTip />}
                <CreationFieldVisibility key={`${form.context}:${creationTargetKey(form.target)}`} form={form}
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
                        <div className="creation-field" key={f.key}>
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
              </div>
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
                {confirmed && <Check size={30} />}
                <p>
                  {busy && !confirmed
                    ? "正在提交并从飞书回读核对，请稍候…"
                    : draft.result?.message ||
                      "提交结果尚未确认，草稿已保留。请先在飞书核对，避免重复创建。"}
                </p>
                {preparingNext && (
                  <p className="hint" role="status">
                    正在准备下一条创建表单…
                  </p>
                )}
                {draft.result?.item_id && (
                  <strong>事项编号 {draft.result.item_id.work_item_id}</strong>
                )}
                {!confirmed && !busy && (
                  <>
                    <p className="hint">
                      这里只会读取和核对结果，不会再次创建。
                    </p>
                    {!draft.result?.item_id && (
                      <label>
                        在飞书中找到的事项编号
                        <input
                          aria-label="核验事项编号"
                          inputMode="numeric"
                          value={itemNumber}
                          onChange={(e) => setItemNumber(e.target.value)}
                        />
                      </label>
                    )}
                    <button className="secondary" onClick={() => void verify()}>
                      重新核验结果
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
        </div>
        <footer className="creation-footer">
          <span className="hint">
            {stage === "edit"
              ? "草稿仅保存在本机"
              : stage === "review"
                ? "创建权限以飞书项目为准"
                : ""}
          </span>
          {(stage === "edit" || stage === "review") && (
            <label className="creation-continuous">
              <input
                type="checkbox"
                aria-label="连续创建"
                aria-describedby="creation-continuous-hint"
                checked={continuous}
                disabled={loading || busy || imageBusy}
                onChange={(event) => updateContinuous(event.target.checked)}
              />
              <span className="creation-continuous-box" aria-hidden="true">
                {continuous && <Check size={12} />}
              </span>
              <span>连续创建</span>
              <span className="sr-only" id="creation-continuous-hint">
                创建并核验成功后，保留当前空间和类型，继续填写下一条。
              </span>
            </label>
          )}
          {stage === "edit" && (
            <button
              className="primary"
              disabled={loading || !!blocked || !form || imageBusy}
              onClick={review}
            >
              核对内容
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
        </footer>
      </section>
    </div>,
    document.body,
  );
}
