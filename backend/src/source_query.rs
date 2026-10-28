//! 已验证的 MCP 查询适配：统一复用同步台账，但保留各工具自己的分页协议。
use std::{collections::HashMap, sync::{Arc, Mutex}, time::Instant};

use async_trait::async_trait;
use futures_util::{stream, StreamExt, TryStreamExt};
use serde_json::{json, Map, Value};
use tokio::sync::OnceCell;

use crate::{
    association::AssociationRule,
    detail,
    error::BackendError,
    mcp::{parse_tool_json, ConnectionInfo, TodoSource, ToolResultPayload},
    model::{
        domain::WorkItemId,
        source::{SourceKind, WorkSource},
    },
    store::{Store, TypeScope},
    sync_metrics::{elapsed_ms, MeteredSource, Metrics, SyncPerformance},
};

type ItemKey = (String, String, String);
type DetailEntry = Arc<OnceCell<Arc<detail::ItemDetail>>>;

/// 只在一次手动/自动同步内存活；完整成功且已保存的详情才能被复用。
#[derive(Default)]
pub struct DetailCache {
    entries: Mutex<HashMap<(ItemKey, Option<String>, i64), DetailEntry>>,
    fresh: Mutex<HashMap<(ItemKey, i64), Vec<(Option<String>, DetailEntry)>>>,
}

impl DetailCache {
    /// 只有本批次实际拉取的详情才能跨版本能力复用；已知版本冲突必须另取。
    fn fresh_entry(&self, key: ItemKey, version: Option<String>, generation: i64) -> DetailEntry {
        let mut fresh = self.fresh.lock().expect("detail cache poisoned");
        let slots = fresh.entry((key, generation)).or_default();
        if let Some((observed, entry)) = slots.iter_mut().rev()
            .find(|(observed, _)| version.is_none() || observed.is_none() || *observed == version) {
            if observed.is_none() { *observed = version; }
            return entry.clone();
        }
        let entry = Arc::new(OnceCell::new());
        slots.push((version, entry.clone()));
        entry
    }

    fn entry(&self, key: ItemKey, version: Option<String>, generation: i64) -> DetailEntry {
        self.entries.lock().expect("detail cache poisoned")
            .entry((key, version, generation)).or_default().clone()
    }
}

#[derive(Clone, Default)]
struct QueryState {
    session: Option<String>,
    group: Option<String>,
    total: Option<i64>,
    received: usize,
}

pub struct SourceReader<'a> {
    pub client: &'a dyn TodoSource,
    pub source: &'a WorkSource,
    pub store: &'a Store,
    pub scope: Option<&'a TypeScope>,
    pub max_pages: u32,
    state: Mutex<QueryState>,
    cache: Arc<DetailCache>,
    metrics: Metrics,
}

impl<'a> SourceReader<'a> {
    pub fn new(
        client: &'a dyn TodoSource,
        source: &'a WorkSource,
        store: &'a Store,
        scope: Option<&'a TypeScope>,
        max_pages: u32,
    ) -> Self {
        Self {
            client,
            source,
            store,
            scope,
            max_pages,
            state: Mutex::new(QueryState::default()),
            cache: Arc::new(DetailCache::default()),
            metrics: Metrics::default(),
        }
    }

    pub fn with_cache(mut self, cache: Arc<DetailCache>) -> Self {
        self.cache = cache;
        self
    }

    fn measured(&self) -> MeteredSource<'_> {
        MeteredSource { client: self.client, metrics: &self.metrics, priority: crate::mcp::scheduler::Priority::Background }
    }

    fn measured_check(&self) -> MeteredSource<'_> {
        MeteredSource { client: self.client, metrics: &self.metrics, priority: crate::mcp::scheduler::Priority::Check }
    }

    async fn enrich(&self, row: Value, versions: &HashMap<ItemKey, crate::store::DetailCacheState>, version_field: Option<&str>) -> Result<Value, BackendError> {
        let requested = WorkItemId {
            project_key: detail::text(&row["project_key"]),
            work_item_type_key: detail::text(&row["work_item_info"]["work_item_type_key"]),
            work_item_id: detail::text(&row["work_item_info"]["work_item_id"]).unwrap_or_default(),
        };
        let (p, t, _) = requested.key_tuple();
        if requested.work_item_id.is_empty() || requested.project_key.is_none()
            || requested.work_item_type_key.is_none()
            || self.scope.is_some_and(|scope| !scope.allows(&p, &t)) {
            return Ok(row);
        }
        let version = version_field.and_then(|field| row_version(&row, field));
        let cached = versions.get(&requested.key_tuple());
        let generation = cached.map_or(0, |c| c.generation);
        let entry = self.cache.entry(requested.key_tuple(), version.clone(), generation);
        let mut fetched = false;
        let detail = entry.get_or_try_init(|| async {
            fetched = true;
            if version.as_ref().is_some_and(|v| cached.and_then(|c| c.version.as_ref()) == Some(v)) {
                if let Ok(Some(detail)) = self.store.item_detail(&requested) {
                    self.metrics.update(|p| p.detail_cache_hits += 1);
                    return Ok(Arc::new(detail));
                }
            }
            let fresh = self.cache.fresh_entry(requested.key_tuple(), version.clone(), generation);
            let mut fetched_remote = false;
            let detail = fresh.get_or_try_init(|| async {
                fetched_remote = true;
                let detail = detail::fetch(&self.measured(), &requested, self.max_pages).await?;
                let started = Instant::now();
                let saved = self.store.save_item_detail_observed(&detail, version.as_deref(), generation);
                self.metrics.update(|p| p.detail_store_ms += elapsed_ms(started));
                saved?;
                self.metrics.update(|p| p.detail_items_fetched += 1);
                Ok::<_, BackendError>(Arc::new(detail))
            }).await?;
            if !fetched_remote { self.metrics.update(|p| p.detail_cache_hits += 1); }
            Ok::<_, BackendError>(detail.clone())
        }).await?;
        if !fetched { self.metrics.update(|p| p.detail_cache_hits += 1); }
        // 别名请求也可供后续使用正式 project_key 的来源复用。
        self.cache.entries.lock().expect("detail cache poisoned")
            .entry((detail.id.key_tuple(), version, generation)).or_insert_with(|| entry.clone());
        Ok(if matches!(self.source.kind, SourceKind::PersonalTodo) {
            detail::todo_summary(detail, row)
        } else { detail::summary(detail, row) })
    }

    async fn read(&self, tool: &str, args: Value) -> Result<Value, BackendError> {
        parse_tool_json(
            tool,
            &self
                .measured_check()
                .call_tool(tool, args.as_object().unwrap())
                .await?,
        )
    }

    async fn mql_page(
        &self,
        project: &str,
        type_key: &str,
        page: u32,
    ) -> Result<(Vec<Value>, Option<i64>), BackendError> {
        let state = self.state.lock().unwrap().clone();
        let args = if page == 1 {
            let rule = AssociationRule::parse(self.source.association_rule.as_deref())?;
            validate_personnel(&self.measured_check(), project, type_key, &rule, self.max_pages).await?;
            {
                let mut query = rule.query(project,type_key)?;
                if let Some(field) = self.store.source_version_field(self.source)? {
                    let field = crate::association::identifier(&field)?;
                    query = query.replacen(" FROM ", &format!(", {field} FROM "), 1);
                }
                json!({"project_key":project,"mql":query})
            }
        } else {
            json!({"project_key":project,"session_id":state.session,
                "group_pagination_list":[{"group_id":state.group,"page_num":page}]})
        };
        let value = self.read("search_by_mql", args).await?;
        let mut state = state;
        if page == 1 {
            // 飞书实测的零结果结构；工具层先检查 isError，不能把错误当空结果。
            if value.get("list") == Some(&Value::Null)
                && value["data"].as_object().is_some_and(|d| d.is_empty())
                && detail::text(&value["session_id"]).is_some()
                && value.get("search_status_info") == Some(&Value::Null)
                && value.get("extra_info") == Some(&Value::Null)
            {
                return Ok((Vec::new(), Some(0)));
            }
            let list = value["list"]
                .as_array()
                .filter(|v| v.len() == 1)
                .ok_or_else(|| BackendError::parse("MQL查询", "缺少唯一查询结果的 list"))?;
            state.total = list[0]["count"].as_i64().filter(|n| *n >= 0);
            if state.total.is_none() {
                return Err(BackendError::parse("MQL查询", "缺少有效 count"));
            }
            state.session = detail::text(&value["session_id"]);
            let groups = list[0]["group_infos"].as_array();
            if groups.is_some_and(|g| g.len() > 1) {
                return Err(BackendError::parse("MQL查询", "未分组查询意外返回多个分组"));
            }
            state.group = groups
                .and_then(|g| g.first())
                .and_then(|g| detail::text(&g["group_id"]));
        }
        let rows = match state.group.as_ref().and_then(|g| value["data"].get(g)) {
            Some(Value::Array(rows)) => rows.clone(),
            None | Some(Value::Null) if state.total == Some(0) => Vec::new(),
            _ => return Err(BackendError::parse("MQL查询", "缺少 data[group_id] 数组")),
        };
        state.received += rows.len();
        if (rows.is_empty() && state.total.is_some_and(|n| state.received < n as usize))
            || state.total.is_some_and(|n| state.received > n as usize)
        {
            return Err(BackendError::parse(
                "MQL分页",
                "条数与 count 不一致，结果未取全",
            ));
        }
        if state.total.is_some_and(|n| n as usize > state.received)
            && (state.session.is_none() || state.group.is_none())
        {
            return Err(BackendError::parse(
                "MQL分页",
                "缺少续页 session_id/group_id",
            ));
        }
        let total = state.total;
        *self.state.lock().unwrap() = state;
        let mut normalized = Vec::new();
        for row in rows {
            let fields = row["moql_field_list"]
                .as_array()
                .ok_or_else(|| BackendError::parse("MQL记录", "缺少 moql_field_list"))?;
            let id = fields
                .iter()
                .find(|f| f["key"] == "work_item_id")
                .and_then(|f| {
                    detail::text(&f["value"]["long_value"])
                        .or_else(|| detail::text(&f["value"]["string_value"]))
                })
                .ok_or_else(|| BackendError::parse("MQL记录", "缺少 work_item_id"))?;
            let name = fields
                .iter()
                .find(|f| f["key"] == "name")
                .map(|f| f["value"]["string_value"].clone())
                .unwrap_or(Value::Null);
            normalized.push(
                json!({"project_key":project,"work_item_info":{"work_item_id":id,
                "work_item_type_key":type_key,"work_item_name":name},"source_record":row}),
            );
        }
        Ok((normalized, total))
    }
}

#[async_trait]
impl TodoSource for SourceReader<'_> {
    fn is_full_scan(&self) -> bool { true }
    fn sync_performance(&self) -> SyncPerformance { self.metrics.snapshot() }
    fn query_kind(&self) -> Option<&str> {
        if matches!(self.source.kind, SourceKind::PersonalTodo) {
            None
        } else {
            Some(self.source.kind.name())
        }
    }
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> {
        self.measured_check().describe().await
    }
    async fn close(&mut self) {} // 会话由 Session 统一关闭。
    async fn call_tool(
        &self,
        tool: &str,
        args: &Map<String, Value>,
    ) -> Result<ToolResultPayload, BackendError> {
        self.measured().call_tool(tool, args).await
    }
    async fn call_list_todo(
        &self,
        args: &Map<String, Value>,
    ) -> Result<ToolResultPayload, BackendError> {
        let page = args.get("page_num").and_then(Value::as_u64).unwrap_or(1) as u32;
        let query_timer = self.metrics.phase(true);
        let (rows, total) = match &self.source.kind {
            SourceKind::PersonalTodo => {
                let payload = self.measured_check().call_list_todo(args).await?;
                let value = parse_tool_json("list_todo", &payload)?;
                // 原始待办解析器负责逐条拒绝统计；不能在这里把异常条目丢掉。
                let rows = if let Some(a) = value.as_array() {
                    a.clone()
                } else {
                    value["list"]
                        .as_array()
                        .ok_or_else(|| BackendError::parse("个人待办", "缺少 list 数组"))?
                        .clone()
                };
                let total = value.get("total").and_then(|n| {
                    n.as_i64()
                        .or_else(|| n.as_str().and_then(|s| s.parse().ok()))
                });
                (rows, total)
            }
            SourceKind::WorkItemType {
                project_key: Some(p),
                type_key: Some(t),
            } => self.mql_page(p, t, page).await?,
            SourceKind::View {
                project_key: Some(p),
                view_id: Some(v),
            } => {
                let value = self
                    .read(
                        "get_view_detail",
                        json!({"project_key":p,"view_id":v,"page_num":page,
                    "fields": ({
                        let mut fields = vec!["work_item_id".to_string(),"name".to_string(),"work_item_type_key".to_string()];
                        if let Some(field) = self.store.source_version_field(self.source)? { fields.push(field); }
                        fields
                    })}),
                    )
                    .await?;
                let rows = value["work_item_list"]
                    .as_array()
                    .ok_or_else(|| BackendError::parse("视图查询", "缺少 work_item_list"))?;
                let total = value["pagination"]["total"]
                    .as_i64()
                    .filter(|n| *n >= 0)
                    .ok_or_else(|| BackendError::parse("视图查询", "缺少有效 pagination.total"))?;
                let more = value["pagination"]["has_more"]
                    .as_bool()
                    .ok_or_else(|| BackendError::parse("视图查询", "缺少 pagination.has_more"))?;
                let received = self.state.lock().unwrap().received + rows.len();
                if (received < total as usize && (!more || rows.is_empty()))
                    || (received >= total as usize && more)
                {
                    return Err(BackendError::parse(
                        "视图分页",
                        "分页结束标记与总条数不一致",
                    ));
                }
                self.state.lock().unwrap().received = received;
                let mut normalized = Vec::new();
                for row in rows {
                    let id = detail::identity(row)?;
                    normalized.push(json!({"project_key":id.project_key,"work_item_info":{"work_item_id":id.work_item_id,
                        "work_item_type_key":id.work_item_type_key},"source_record":row}));
                }
                (normalized, Some(total))
            }
            _ => return Err(BackendError::validation("来源缺少空间、类型或视图标识")),
        };
        drop(query_timer);
        let _details_timer = self.metrics.phase(false);
        // 先按页批量读小字段；未取详情的成员仍交给同步驱动核对归属。
        let field = self.store.source_version_field(self.source)?;
        let ids: Vec<_> = rows.iter().map(row_identity).collect();
        let versions = self.store.detail_versions(&ids)?;
        // 保留原始清单顺序；同项待办的不同本人节点仍逐条派生摘要。
        let enriched: Vec<Value> = stream::iter(rows).map(|row| self.enrich(row, &versions, field.as_deref()))
            .buffered(crate::mcp::scheduler::MAX_PENDING_READS).try_collect().await?;
        Ok(ToolResultPayload::from_json(
            json!({"list":enriched,"total":total}),
        ))
    }
}

fn row_identity(row: &Value) -> WorkItemId {
    WorkItemId { project_key: detail::text(&row["project_key"]),
        work_item_type_key: detail::text(&row["work_item_info"]["work_item_type_key"]),
        work_item_id: detail::text(&row["work_item_info"]["work_item_id"]).unwrap_or_default() }
}

/// 只有具有五类变更证据的字段会进入这里；缺失值保持未知。
pub(crate) fn row_version(row: &Value, field: &str) -> Option<String> {
    let record = row.get("source_record").unwrap_or(row);
    let value = record.get(field)
        .or_else(|| record.get("work_item_info").and_then(|v| v.get(field)))
        .or_else(|| record.get("work_item_attribute").and_then(|v| v.get(field)))
        .and_then(detail::text)
        .or_else(|| record["moql_field_list"].as_array()?.iter()
            .find(|f| f["key"] == field).and_then(|f| {
                detail::text(&f["value"]["string_value"]).or_else(|| detail::text(&f["value"]["long_value"]))
            }));
    value.map(|v| format!("{field}:{v}"))
}

pub(crate) fn version_sample_identity(source: &WorkSource, row: &Value) -> Result<WorkItemId, BackendError> {
    let id = match &source.kind {
        SourceKind::PersonalTodo => row_identity(row),
        SourceKind::WorkItemType {project_key,type_key} => {
            let fields = row["moql_field_list"].as_array().ok_or_else(||BackendError::validation("证据缺少 MQL 字段数组"))?;
            let value = fields.iter().find(|f|f["key"]=="work_item_id")
                .and_then(|f|detail::text(&f["value"]["long_value"]).or_else(||detail::text(&f["value"]["string_value"])))
                .ok_or_else(||BackendError::validation("证据缺少 MQL 工作项 ID"))?;
            WorkItemId{project_key:project_key.clone(),work_item_type_key:type_key.clone(),work_item_id:value}
        },
        SourceKind::View {..} => detail::identity(row)?,
    };
    if !id.missing_parts().is_empty() { return Err(BackendError::validation("版本证据需要完整工作项身份")); }
    Ok(id)
}

pub async fn metadata(
    client: &dyn TodoSource,
    tool: &str,
    project: &str,
    type_key: &str,
    max_pages: u32,
) -> Result<Vec<Value>, BackendError> {
    let mut rows = Vec::new();
    for page in crate::config::page_numbers(max_pages) {
        let args = json!({"project_key":project,"work_item_type":type_key,"page_num":page});
        let v = parse_tool_json(
            tool,
            &client.call_tool(tool, args.as_object().unwrap()).await?,
        )?;
        let list = v["list"]
            .as_array()
            .ok_or_else(|| BackendError::parse(tool, "缺少 list 数组"))?;
        rows.extend(list.iter().cloned());
        match v["pagination"]["has_more"].as_bool() {
            Some(false) => return Ok(rows),
            Some(true) if !list.is_empty() => {}
            _ => return Err(BackendError::parse(tool, "字段或角色分页信息不完整")),
        }
    }
    Err(BackendError::parse(tool, "达到字段或角色发现分页上限"))
}

async fn validate_personnel(
    client: &dyn TodoSource,
    p: &str,
    t: &str,
    rule: &AssociationRule,
    max: u32,
) -> Result<(), BackendError> {
    if let AssociationRule::Personnel { fields, roles, .. } = rule {
        if !fields.is_empty() {
            let configs = metadata(client, "list_workitem_field_config", p, t, max).await?;
            for key in fields {
                if !configs.iter().any(|f| {
                    f["field_key"] == *key
                        && matches!(f["field_type"].as_str(), Some("user" | "multi-user"))
                }) {
                    return Err(BackendError::validation(format!(
                        "人员字段 {key} 不存在或不是人员类型，请重新发现字段"
                    )));
                }
            }
        }
        if !roles.is_empty() {
            let configs = metadata(client, "list_workitem_role_config", p, t, max).await?;
            for name in roles {
                if !configs.iter().any(|r| r["role_name"] == *name) {
                    return Err(BackendError::validation(format!(
                        "角色 {name} 不存在，请重新发现角色"
                    )));
                }
            }
        }
    }
    Ok(())
}
