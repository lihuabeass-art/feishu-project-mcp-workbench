import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Check, ChevronRight, RefreshCw } from "lucide-react";
import { cachedItemDetail, refreshItemDetail } from "./api";
import { asError, itemKey, localTime } from "./model";
import { readFailureMessage } from "./readFeedback";
import type { CachedItem, ItemDetail } from "./types";
import { BusinessField } from "./BusinessField";
import { ExternalLink } from "./ExternalLink";
import { useDetailDisplay } from "./useDetailDisplay";
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

function CurrentNodes({ nodes, personalId }: { nodes: Array<Record<string, unknown>>; personalId?: string | null }) {
  return (
    <dl className="role-members">
      {nodes.map((node, i) => (
        <div key={`${String(node.id ?? "")}-${i}`}>
          <dt>{String(node.name ?? "名称未提供")}{personalId != null && node.id === personalId ? "（我的待办）" : ""}</dt>
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

function NodeOverview({ item, detail, mergedStatusNode }: { item: CachedItem; detail?: ItemDetail; mergedStatusNode?: boolean }) {
  const nodes = detail?.data.work_item_current_node;
  const flow = item.flow;
  const personal = item.node_scope === "personal";
  const personalMatch = personal && !!flow?.node_state_key && nodes?.some((node) => node.id === flow.node_state_key && node.name === flow.node_name);
  // 完整节点只替代共享摘要；个人来源节点属于不同业务范围，不能按同名合并。
  const showSummary = flow && (flow.kind === "node" || flow.kind === "both") && ((personal && !personalMatch) || nodes === undefined);
  const state = flow && (flow.kind === "state" || flow.kind === "both") ?
    [flow.start_state_key_name, flow.end_state_key_name].filter(Boolean).join(" → ") : "";
  const status = detail && readable(detail.data.work_item_attribute.work_item_status);
  if ((!nodes?.length || mergedStatusNode) && !showSummary && (!state || state === status)) return null;
  return <section className="detail-node-overview">
    {!!nodes?.length && !mergedStatusNode && <><h4>当前节点</h4><CurrentNodes nodes={nodes} personalId={personalMatch ? flow.node_state_key : undefined} /></>}
    {showSummary && <p className="hint">{personal ? "我的待办节点" : "当前节点"} · <span>{flow.node_name || "名称未提供"}</span></p>}
    {!!state && state !== status && <p className="hint">状态 · {state}</p>}
  </section>;
}

function DetailBody({ detail, item, display, children }: { detail: ItemDetail; item: CachedItem;
  display: ReturnType<typeof useDetailDisplay>; children?: ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [configure, setConfigure] = useState(false);
  const attribute = detail.data.work_item_attribute;
  const { summary, description, pinned, inline, block, empty, system } = classifyFields(
    detail.data.work_item_fields, display.keys, attribute,
  );
  const descriptionTitle = description?.name?.trim() || (
    detail.id.work_item_type_key === "story" ? "需求说明" :
      detail.id.work_item_type_key === "issue" ? "缺陷描述" : "事项说明"
  );
  const created = actorAt(attribute.create_by, attribute.create_time);
  const updated = actorAt(attribute.updated_by, attribute.update_time);
  const nodes = detail.data.work_item_current_node;
  const statusNode = nodes?.length === 1 && nodes[0].name === readable(attribute.work_item_status) ? nodes[0] : undefined;
  const statusNodeOwners = statusNode && !isEmpty(statusNode.owners) &&
    JSON.stringify(statusNode.owners) !== JSON.stringify(summary.operators?.value) ? statusNode.owners : undefined;
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
          {statusNode && item.node_scope === "personal" && statusNode.id === item.flow?.node_state_key && statusNode.name === item.flow.node_name && <span className="muted">（我的待办）</span>}
          {statusNodeOwners !== undefined && <div><FieldValue value={statusNodeOwners} /></div>}
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
      <section className="detail-description" aria-label={descriptionTitle}>
        <h4>{descriptionTitle}</h4>
        {description ? (
          isEmpty(description.value) ? <p className="hint">暂无{descriptionTitle}</p> :
            <BusinessField value={description.value} itemId={detail.id} fieldKey={description.key} />
        ) : (
          <p className="hint">暂无{descriptionTitle}</p>
        )}
      </section>
      <NodeOverview item={item} detail={detail} mergedStatusNode={!!statusNode} />
      {pinned.length > 0 && <dl className="business-fields detail-pinned-fields">{pinned.map(field)}</dl>}
      <div className="detail-display-settings">
        <button type="button" className="text-button" aria-expanded={configure}
          onClick={() => setConfigure((value) => !value)}>设置常显字段</button>
        {configure && <div>
          <p className="hint">选择代码版本、设计文档等需要直接查看的字段，按当前账号、空间和事项类型保存。</p>
          {display.busy && <p className="hint" role="status">正在处理常显设置…</p>}
          {display.available && <div className="detail-field-choices">{detail.data.work_item_fields
            .filter((f) => !["description", "priority", "current_status_operator"].includes(f.key))
            .map((f) => <button key={f.key} type="button" className="secondary" aria-pressed={display.keys.includes(f.key)}
              disabled={display.busy} title={f.key} onClick={() => void display.toggle(f.key)}>
              {display.keys.includes(f.key) && <Check size={13} aria-hidden="true" />}{fieldName(f)}</button>)}</div>}
          {!display.available && !display.busy && !display.error && <p className="hint">当前连接暂不能保存常显设置。</p>}
        </div>}
        {display.error && <p className="error-text" role="alert">{display.error}<button className="text-button" onClick={display.retry}>重新读取设置</button></p>}
      </div>
      <details className="detail-more-information" open={moreOpen}
        onToggle={(event) => setMoreOpen(event.currentTarget.open)}>
        <summary>
          <ChevronRight size={13} aria-hidden="true" />
          <span>{moreOpen ? "收起更多信息" : "更多信息"}</span>
          <span className="detail-more-hint">角色、其他字段</span>
        </summary>
        <div className="detail-more-content">
          <section>
            <h4>角色与人员</h4>
            <RoleMembers value={attribute.role_members} />
          </section>
          <section>
            <h4>其他业务字段</h4>
            {inline.length > 0 && (
              <dl className="inline-fields">{inline.map(field)}</dl>
            )}
            {block.length > 0 && (
              <dl className="business-fields">{block.map(field)}</dl>
            )}
            {!inline.length && !block.length && (
              <p className="hint">没有其他已填写的业务字段。</p>
            )}
            {empty.length > 0 && (
              <p className="hint">未填写：{empty.map(fieldName).join("、")}</p>
            )}
          </section>
          {more.length > 0 && (
            <details className="more-fields">
              <summary>系统字段（{more.length}）</summary>
              <dl className="inline-fields">
                {more.map((f, i) => (
                  <div key={`${f.key}-${i}`}>
                    <dt>{f.name || f.key}</dt>
                    <dd><FieldValue value={f.value} /></dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          {children}
        </div>
      </details>
    </>
  );
}

export function WorkItemDetails({
  item,
  enabled,
  onRefreshed,
  children,
  displaySettingsEnabled = false,
  displayContext = "",
}: {
  item: CachedItem;
  enabled: boolean;
  onRefreshed?: () => Promise<void>;
  children?: ReactNode;
  displaySettingsEnabled?: boolean;
  displayContext?: string;
}) {
  const display = useDetailDisplay(displaySettingsEnabled && enabled, displayContext, item.id.project_key, item.id.work_item_type_key);
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
          setDetail(previous => previous && previous.id.project_key === cached.id.project_key &&
            previous.id.work_item_type_key === cached.id.work_item_type_key &&
            previous.id.work_item_id === cached.id.work_item_id
            ? { ...cached, item_url: cached.item_url ?? previous.item_url }
            : cached);
          setCacheError("");
        }
      } catch (e) {
        if (active && request === cacheRead.current) setCacheError(readFailureMessage(asError(e).kind));
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
          const cached = changedDuringRefresh ? await cachedItemDetail(item.id) : null;
          const current = changedDuringRefresh && cached
            ? { ...cached, item_url: cached.item_url ?? (
              cached.id.project_key === latest.id.project_key &&
              cached.id.work_item_type_key === latest.id.work_item_type_key &&
              cached.id.work_item_id === latest.id.work_item_id ? latest.item_url : null) }
            : changedDuringRefresh ? null : latest;
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
        if (active) setError(readFailureMessage(asError(e).kind));
      } finally {
        if (active) setLoading(false);
      }
      if (active && refreshed) {
        try {
          await onRefreshed?.();
        } catch (e) {
          if (active) setSummaryError(readFailureMessage(asError(e).kind));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [identity, enabled, attempt, onRefreshed]); // 复合身份变化时，旧请求不能写入新事项。
  if (!enabled) return <><NodeOverview item={item} />{children}</>;
  const checkStatus = loading
    ? "正在检查最新信息…"
    : error
      ? "检查失败"
      : detail
        ? `${hasChecked ? "已检查" : "上次获取"} · ${localTime(detail.fetched_at_ms)}`
        : "尚未检查";
  return (
    <div className="detail-section remote-details">
      <div className="detail-freshness">
        <p className="hint detail-check-status" role="status" aria-atomic="true">
          {checkStatus}
        </p>
        <div className="detail-freshness-actions">
          {detail?.item_url && detail.id.project_key === item.id.project_key &&
            detail.id.work_item_type_key === item.id.work_item_type_key &&
            detail.id.work_item_id === item.id.work_item_id && (
              <div className="workflow-manual-fill detail-item-link">
                <ExternalLink href={detail.item_url} title={`在飞书项目中打开「${item.name || item.id.work_item_id}」`}>
                  打开飞书事项<ArrowUpRight size={13} aria-hidden="true" />
                </ExternalLink>
              </div>
            )}
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
      {detail && <DetailBody key={identity} detail={detail} item={item} display={display}>{children}</DetailBody>}
      {!detail && <NodeOverview item={item} />}
      {!detail && !loading && !error && <p className="hint">尚未取得详情。</p>}
      {!detail && children}
    </div>
  );
}
