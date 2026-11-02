import { useEffect, useRef, useState } from "react";
import { FileUp, Paperclip, X } from "lucide-react";
import type { CreationField, CreationForm } from "./creation";
import { asError } from "./model";
import {
  attachmentBase64,
  attachmentSize,
  creationAttachments,
  saveCreationAttachment,
  type CreationAttachment,
} from "./creationAttachments";

export function CreationAttachmentPicker({
  form,
  field,
  value,
  onChange,
  onBusyChange,
}: {
  form: CreationForm;
  field: CreationField;
  value: unknown;
  onChange: (value: CreationAttachment[]) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const change = useRef(onChange);
  const reportBusy = useRef(onBusyChange);
  change.current = onChange;
  reportBusy.current = onBusyChange;
  const latest = useRef(value);
  latest.current = value;
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  let files: CreationAttachment[] = [],
    invalid = "";
  try {
    files = creationAttachments(value);
  } catch (failure) {
    invalid = asError(failure).message;
  }
  const scope = {
    target: form.target,
    context: form.context,
    fieldKey: field.key,
  };
  const identity = JSON.stringify([
    form.context,
    form.target.project_key,
    form.target.type_key,
    field.key,
  ]);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      reportBusy.current(false);
    };
  }, [identity]);

  async function select(selected: File[]) {
    if (busy.current || !selected.length) return;
    const selectingFor = identity;
    busy.current = true;
    setSaving(true);
    reportBusy.current(true);
    setError("");
    try {
      let next = creationAttachments(latest.current);
      for (const file of selected) {
        const saved = await saveCreationAttachment(
          scope,
          await attachmentBase64(file),
          file.type || "application/octet-stream",
          file.name,
        );
        if (!mounted.current || currentIdentity.current !== selectingFor)
          return;
        next = [...next.filter((entry) => entry.id !== saved.id), saved];
        change.current(next);
      }
    } catch (failure) {
      if (mounted.current && currentIdentity.current === selectingFor)
        setError(asError(failure).message);
    } finally {
      busy.current = false;
      if (mounted.current) {
        setSaving(false);
        reportBusy.current(false);
      }
    }
  }

  return (
    <div className="creation-attachments">
      <input
        ref={picker}
        id={`create-${field.key}`}
        className="creation-file-input"
        type="file"
        multiple
        tabIndex={-1}
        aria-label={`选择${field.label}`}
        aria-required={field.required}
        disabled={saving}
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = "";
          void select(files);
        }}
      />
      <button
        type="button"
        className="creation-attachment-add"
        disabled={saving}
        onClick={() => picker.current?.click()}
      >
        <FileUp size={16} />
        {saving ? "正在保存附件…" : "选择文件"}
      </button>
      <p className="hint">可选择多个文件，每个不超过 8 MB。确认创建后上传。</p>
      {!!files.length && (
        <ul
          className="creation-attachment-list"
          aria-label={`${field.label}列表`}
        >
          {files.map((file) => (
            <li key={file.id}>
              <Paperclip size={15} aria-hidden="true" />
              <span className="creation-attachment-name">
                {file.name}
                <small>{attachmentSize(file.size)}</small>
              </span>
              <button
                type="button"
                aria-label={`移除附件 ${file.name}`}
                disabled={saving}
                onClick={() => {
                  setError("");
                  onChange(files.filter((entry) => entry.id !== file.id));
                }}
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {(error || invalid) && (
        <p role="alert" className="error-text">
          {error || invalid}
        </p>
      )}
      {!!invalid && (
        <button type="button" onClick={() => onChange([])}>
          清空无效附件
        </button>
      )}
    </div>
  );
}

export function CreationAttachmentReview({ value }: { value: unknown }) {
  try {
    const files = creationAttachments(value);
    return files.length ? (
      <ul className="creation-attachment-list">
        {files.map((file) => (
          <li key={file.id}>
            <Paperclip size={15} aria-hidden="true" />
            <span className="creation-attachment-name">
              {file.name}
              <small>{attachmentSize(file.size)}</small>
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <>未填写</>
    );
  } catch (failure) {
    return <span role="alert">{asError(failure).message}</span>;
  }
}
