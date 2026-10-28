import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cachedItemDetail, refreshItemDetail } from "./api";
import { asError, itemKey, localTime } from "./model";
import type { CachedItem, ItemDetail } from "./types";
import { BusinessField } from "./BusinessField";
import { ExternalLink } from "./ExternalLink";
import {
  classifyFields,
  extraAttributes,
  fieldName,
  isEmpty,
  isoTime,
  readable,
} from "./detailFields";

const roleName = (role: unknown): string => {
  if (role === null || typeof role !== "object") return String(role ?? "");
  const object = role as Record<string, unknown>;
  return String(object.label ?? object.name ?? "");
};

function RoleMembers({ value }: { value: unknown }) {
  if (!Array.isArray(value) || !value.length)
    return <span className="muted">未提供</span>;
  // 角色由各项目/类型配置，统一按显示名称排序，保留角色内的人员顺序。
  const roles = [...value].sort((a, b) =>
    roleName(a).localeCompare(roleName(b), "zh-CN"),
  );
  const members = (role: unknown) =>
    role !== null && typeof role === "object"
      ? (role as Record<string, unknown>).members
      : undefined;
  const assigned = roles.filter((role) => !isEmpty(members(role)));
  const vacant = roles.filter((role) => isEmpty(members(role)));
  return (
    <>
      {assigned.length > 0 && (
        <dl className="role-members">
          {assigned.map((role, i) => (
            <div key={`${roleName(role)}-${i}`}>
              <dt>{roleName(role)}</dt>
              <dd>
                <FieldValue value={members(role)} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {vacant.length > 0 && (
        <p className="hint">未指派：{vacant.map(roleName).join("、")}</p>
      )}
    </>
  );
}

function CurrentNodes({ nodes }: { nodes: Array<Record<string, unknown>> }) {
  return (
    <dl className="role-members">
      {nodes.map((node, i) => (
        <div key={`${String(node.id ?? "")}-${i}`}>
          <dt>{String(node.name ?? node.id ?? "未命名节点")}</dt>
          <dd>
            {isEmpty(node.owners) ? (
              <span className="muted">未指派</span>
            ) : (
              <FieldValue value={node.owners} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function actorAt(actor: unknown, time: unknown) {
  return [readable(actor), isoTime(time)].filter(Boolean).join(" · ");
}

export function FieldValue({ value }: { value: unknown }) {
  if (value == null || value === "")
    return <span className="muted">未提供</span>;
  if (typeof value === "string") {
    if (/^https?:\/\/\S+$/i.test(value))
      return (
        <ExternalLink href={value}>
          {value}
        </ExternalLink>
      );
    if (value === "true" || value === "false")
      return <span>{readable(value)}</span>;
    return <span className="field-text">{value}</span>;
  }
  if (typeof value !== "object") return <span>{readable(value)}</span>;
  const text = readable(value);
  if (text != null) return <span>{text}</span>;
  if (Array.isArray(value))
    return value.length ? (
      <div className="field-values">
        {value.map((v, i) => (
          <div key={i}>
            <FieldValue value={v} />
          </div>
        ))}
      </div>
    ) : (
      <span className="muted">无</span>
    );
  const object = value as Record<string, unknown>;
  // 枚举、用户、关联工作项、日期均优先显示可读值；完整对象仍可展开查看。
  const label = object.label ?? object.name ?? object.iso_time;
  return (
    <details className="field-object">
      <summary>{label != null ? String(label) : "查看字段内容"}</summary>
      <dl>
        {Object.entries(object).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>
              <FieldValue value={v} />
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function DetailBody({ detail }: { detail: ItemDetail }) {
  const attribute = detail.data.work_item_attribute;
  const { summary, inline, block, empty, system } = classifyFields(
    detail.data.work_item_fields,
  );
  const created = actorAt(attribute.create_by, attribute.create_time);
  const updated = actorAt(attribute.updated_by, attribute.update_time);
  const extras = extraAttributes(attribute);
  const more = [...system, ...extras];
  const field = (f: (typeof inline)[number], i: number) => (
    <div key={`${f.key}-${i}`}>
      <dt>{fieldName(f)}</dt>
      <dd>
        <BusinessField value={f.value} itemId={detail.id} fieldKey={f.key} />
      </dd>
    </div>
  );
  return (
    <>
      <dl className="detail-summary">
        <dt>当前状态</dt>
        <dd>
          <FieldValue value={attribute.work_item_status} />
        </dd>
        {summary.operators && (
          <>
            <dt>{fieldName(summary.operators)}</dt>
            <dd>
              <FieldValue value={summary.operators.value} />
            </dd>
          </>
        )}
        {summary.priority && (
          <>
            <dt>{fieldName(summary.priority)}</dt>
            <dd>
              <FieldValue value={summary.priority.value} />
            </dd>
          </>
        )}
        {created && (
          <>
            <dt>创建</dt>
            <dd>{created}</dd>
          </>
        )}
        {updated && (
          <>
            <dt>更新</dt>
            <dd>{updated}</dd>
          </>
        )}
      </dl>
      <h4>角色与人员</h4>
      <RoleMembers value={attribute.role_members} />
      {!!detail.data.work_item_current_node?.length && (
        <>
          <h4>全部当前节点</h4>
          <CurrentNodes nodes={detail.data.work_item_current_node} />
        </>
      )}
      <h4>业务字段</h4>
      {inline.length > 0 && (
        <dl className="inline-fields">{inline.map(field)}</dl>
      )}
      {block.length > 0 && (
        <dl className="business-fields">{block.map(field)}</dl>
      )}
      {!inline.length && !block.length && (
        <p className="hint">没有已填写的业务字段。</p>
      )}
      {empty.length > 0 && (
        <p className="hint">未填写：{empty.map(fieldName).join("、")}</p>
      )}
      {more.length > 0 && (
        <details className="more-fields">
          <summary>更多字段（{more.length}）</summary>
          <dl className="inline-fields">
            {more.map((f, i) => (
              <div key={`${f.key}-${i}`}>
                <dt>{f.name || f.key}</dt>
                <dd>
                  <FieldValue value={f.value} />
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </>
  );
}

export function WorkItemDetails({
  item,
  enabled,
  onRefreshed,
}: {
  item: CachedItem;
  enabled: boolean;
  onRefreshed?: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [error, setError] = useState("");
  const [cacheError, setCacheError] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const identity = itemKey(item);
  const cacheRead = useRef(0);
  const displayedIdentity = useRef(identity);
  useEffect(() => {
    let active = true;
    const request = ++cacheRead.current;
    if (displayedIdentity.current !== identity) {
      displayedIdentity.current = identity;
      setDetail(null);
      setHasChecked(false);
      setCacheError("");
    }
    if (!enabled) return;
    // 同步补丁与缓存快照都携带内容版本；仅回读当前事项，不重复请求飞书。
    void (async () => {
      try {
        const cached = await cachedItemDetail(item.id);
        if (active && request === cacheRead.current && cached) {
          setDetail(cached);
          setCacheError("");
        }
      } catch (e) {
        if (active && request === cacheRead.current) setCacheError(asError(e).message);
      }
    })();
    return () => { active = false; };
  }, [identity, enabled, item.detail_revision]);

  useEffect(() => {
    let active = true;
    const startingRead = cacheRead.current;
    setError("");
    setSummaryError("");
    if (!enabled) return;
    setLoading(true);
    void (async () => {
      let refreshed = false;
      try {
        const latest = await refreshItemDetail(item.id);
        if (active) {
          const changedDuringRefresh = startingRead !== cacheRead.current;
          const request = ++cacheRead.current;
          // 同步可能已先更新缓存，迟到的远端响应不能直接覆盖该快照。
          const current = changedDuringRefresh ? await cachedItemDetail(item.id) : latest;
          if (!active) return;
          // 内容采用最新回读；本次检查的成功结果不随缓存读取序号失效。
          setHasChecked(true);
          if (request === cacheRead.current && current) {
            setDetail(current);
            setCacheError("");
          }
          setError("");
          refreshed = true;
        }
      } catch (e) {
        if (active) setError(asError(e).message);
      } finally {
        if (active) setLoading(false);
      }
      if (active && refreshed) {
        try {
          await onRefreshed?.();
        } catch (e) {
          if (active) setSummaryError(asError(e).message);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [identity, enabled, attempt, onRefreshed]); // 复合身份变化时，旧请求不能写入新事项。
  if (!enabled) return null;
  const checkStatus = loading
    ? "正在检查最新信息…"
    : error
      ? "检查失败"
      : detail
        ? `${hasChecked ? "已检查" : "上次获取"} · ${localTime(detail.fetched_at_ms)}`
        : "尚未检查";
  return (
    <div className="detail-section remote-details">
      <h3>完整工作信息</h3>
      <div className="detail-freshness">
        <p className="hint detail-check-status" role="status" aria-atomic="true">
          {checkStatus}
        </p>
        <button
          type="button"
          className="icon-button detail-refresh"
          aria-label={loading ? "正在检查最新信息" : "刷新详情"}
          title={loading ? "正在检查最新信息" : "刷新详情"}
          disabled={loading}
          onClick={() => setAttempt((n) => n + 1)}
        >
          <RefreshCw size={14} className={loading ? "spin" : undefined} aria-hidden="true" />
        </button>
      </div>
      {(error || cacheError) && (
        <p className="error-text" role="alert">
          {error ? `检查失败：${error}` : `详情读取失败：${cacheError}`}
          {detail ? `。当前显示上次保存的信息（获取于 ${localTime(detail.fetched_at_ms)}）。` : ""}
        </p>
      )}
      {summaryError && (
        <p className="error-text" role="alert">
          详情已检查，清单摘要读取失败：{summaryError}
        </p>
      )}
      {detail && <DetailBody detail={detail} />}
      {!detail && !loading && !error && <p className="hint">尚未取得详情。</p>}
    </div>
  );
}
