//! 会话内事项安排。入口读取已启用的个人待办及节点，写入不做隐式重读或重试。
use crate::{
    api::Session,
    detail,
    error::{BackendError, ErrorKind},
    mcp::{parse_tool_json, TodoSource},
    model::domain::WorkItemId,
};
use chrono::{DateTime, FixedOffset, NaiveDate, TimeZone};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Dates {
    pub start: String,
    pub end: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct Identity {
    pub connection: String,
    pub project: String,
    pub r#type: String,
    pub item: String,
    pub node: String,
    pub scope: String,
    pub owner: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
pub struct Person {
    pub id: String,
    pub name: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct Target {
    pub id: String,
    pub node_id: String,
    pub identity: Identity,
    pub title: String,
    pub node_name: String,
    pub owner_name: String,
    pub owners: Vec<Person>,
    pub unknown_owner: bool,
    pub item_url: Option<String>,
    pub sources: Vec<String>,
    pub baseline: Dates,
    pub read_only_reason: Option<String>,
    /// 来源待办的聚合日期，没有确认节点或负责人归属。
    pub source_aggregate: bool,
    pub cache_kind: &'static str,
    pub start_state: &'static str,
    pub end_state: &'static str,
    pub fetched_at_ms: Option<i64>,
}
#[derive(Clone, Debug, Serialize)]
pub struct SourceStatus {
    pub id: String,
    pub name: String,
    pub complete: bool,
    pub error: Option<String>,
    pub pages: u32,
}
#[derive(Clone, Debug, Serialize)]
pub struct FailedItem {
    pub project: String,
    pub r#type: String,
    pub item: String,
    pub sources: Vec<String>,
    pub message: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct LoadResult {
    pub session_id: String,
    pub current_user: String,
    pub current_user_name: String,
    pub account_error: Option<String>,
    pub read_at_ms: i64,
    pub sources: Vec<SourceStatus>,
    pub targets: Vec<Target>,
    pub failed_items: usize,
    pub item_errors: Vec<FailedItem>,
    pub read_requests: usize,
}
#[derive(Debug, Deserialize)]
pub struct Change {
    pub id: String,
    pub start: String,
    pub end: String,
    #[serde(default)]
    pub cancel: bool,
}
#[derive(Debug, Serialize)]
pub struct TargetResult {
    pub id: String,
    pub result: &'static str,
    pub message: &'static str,
}
#[derive(Debug, Serialize)]
pub struct SyncResult {
    pub targets: Vec<TargetResult>,
    pub write_requests: usize,
}

pub struct ScheduleSession {
    pub view: LoadResult,
    fingerprint: String,
    frozen: HashSet<String>,
    frozen_nodes: HashSet<(String, String, String, String)>,
}

fn fingerprint(session: &Session) -> Result<String, BackendError> {
    let credential = session.credential()?;
    Ok(format!(
        "{:x}",
        Sha256::digest(
            format!(
                "{}\0{}",
                session.config.endpoint,
                credential.token().expose()
            )
            .as_bytes()
        )
    ))
}
fn txt(v: &Value) -> String {
    detail::text(v).unwrap_or_default()
}
fn date(v: &Value) -> Option<String> {
    if v.is_null() || v.as_str().is_some_and(|s| s.trim().is_empty()) {
        return Some(String::new());
    }
    let ms = v
        .as_i64()
        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))?;
    let offset = FixedOffset::east_opt(8 * 3600).unwrap();
    Some(
        DateTime::from_timestamp_millis(ms)?
            .with_timezone(&offset)
            .format("%Y-%m-%d")
            .to_string(),
    )
}
fn dates(v: &Value) -> Option<Dates> {
    if !v.is_object() {
        return None;
    }
    Some(Dates {
        start: date(v.get("estimate_start_time")?)?,
        end: date(v.get("estimate_finish_time")?)?,
    })
}
fn date_ms(s: &str) -> Option<i64> {
    let d = NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()?;
    if d.format("%Y-%m-%d").to_string() != s {
        return None;
    }
    Some(
        FixedOffset::east_opt(8 * 3600)?
            .from_local_datetime(&d.and_hms_opt(0, 0, 0)?)
            .single()?
            .timestamp_millis(),
    )
}
fn user_name(v: &Value) -> String {
    let key = txt(&v["user_key"]);
    let names = ["name", "name_cn"]
        .iter()
        .map(|k| txt(&v[*k]))
        .filter(|s| !s.trim().is_empty())
        .collect::<Vec<_>>();
    names.iter().find(|name| **name != key)
        .or_else(|| names.first())
        .cloned()
        .unwrap_or_default()
}

// Observed list_todo schedule is a node aggregate, never a personal or item date.
fn build_aggregate_targets(
    out: &mut Vec<Target>,
    sid: &str,
    id: &WorkItemId,
    rows: &[(String, Value)],
    reason: &str,
) {
    let mut identical = BTreeMap::<String, usize>::new();
    for (source, row) in rows {
        let Some(schedule) = row.get("schedule") else {
            continue;
        };
        if !schedule.is_object() {
            continue;
        }
        let start = schedule
            .get("start_time")
            .and_then(date)
            .unwrap_or_default();
        let end = schedule.get("end_time").and_then(date).unwrap_or_default();
        if start.is_empty() && end.is_empty() {
            continue;
        }
        let title = txt(&row["work_item_info"]["work_item_name"]);
        let node_name = txt(&row["node_info"]["node_name"]);
        let signature = row.to_string();
        if let Some(index) = identical.get(&signature) {
            if !out[*index].sources.contains(source) { out[*index].sources.push(source.clone()); }
            continue;
        }
        identical.insert(signature, out.len());
        out.push(Target {
            id: format!("{sid}:{}", out.len()),
            node_id: String::new(),
            identity: Identity {
                connection: String::new(),
                project: id.project_key.clone().unwrap_or_default(),
                r#type: id.work_item_type_key.clone().unwrap_or_default(),
                item: id.work_item_id.clone(),
                node: String::new(),
                scope: "node".into(),
                owner: None,
            },
            title: if title.is_empty() {
                id.work_item_id.clone()
            } else {
                title
            },
            node_name,
            owner_name: String::new(),
            owners: Vec::new(),
            unknown_owner: false,
            item_url: None,
            sources: vec![source.clone()],
            baseline: Dates { start, end },
            read_only_reason: Some(reason.into()),
            source_aggregate: true,
            cache_kind: "source_summary", start_state: "unknown", end_state: "unknown", fetched_at_ms: None,
        });
    }
}

// Existing transport tests distinguish an explicit invalid token from insufficient scope.
// Such a receipt stops the queue, but does not prove the sent write had no effect.
fn explicit_auth_marker(text: &str) -> bool {
    let text = text.to_ascii_lowercase();
    text.contains("invalid_token") || text.contains("token expired") || text.contains("401 unauthorized")
}
fn explicit_auth_failure(payload: &crate::mcp::ToolResultPayload) -> bool {
    match &payload.structured {
        Some(value) => value.get("code").and_then(Value::as_i64) == Some(401) || ["error", "error_code", "code", "error_message", "message"]
            .iter()
            .filter_map(|key| value.get(*key))
            .any(|v| explicit_auth_marker(&v.to_string())),
        None => {
            let joined = payload.text_blocks.join("\n");
            (payload.is_error && explicit_auth_marker(&joined))
                || std::iter::once(joined.as_str())
                    .chain(payload.text_blocks.iter().map(String::as_str))
                    .filter_map(|text| serde_json::from_str::<Value>(text).ok())
                    .any(|value| value.get("code").and_then(Value::as_i64) == Some(401))
        }
    }
}

// Treat all unstructured text as one receipt: the shared JSON reader otherwise
// falls back to individual blocks and could ignore an adjacent error block.
fn schedule_receipt_accepted(payload: &crate::mcp::ToolResultPayload) -> bool {
    let combined = crate::mcp::ToolResultPayload {
        is_error: payload.is_error,
        structured: payload.structured.clone(),
        text_blocks: vec![payload.text_blocks.iter().filter(|s| !s.trim().is_empty()).cloned().collect::<Vec<_>>().join("\n")],
    };
    match crate::mcp::parse::parse_write_response("update_node", &combined) {
        Ok(Value::String(s)) if s == "success" => true,
        Ok(Value::Object(map)) => {
            let no_error = map.get("error").is_none_or(Value::is_null)
                && map.get("success").is_none_or(|v| v.as_bool() == Some(true))
                && map.get("code").is_none_or(|v| v.as_i64() == Some(0))
                && map.get("error_code").is_none_or(|v| v.as_i64() == Some(0))
                && map.get("error_message").is_none_or(|v| v.is_null() || v.as_str() == Some(""));
            no_error && (map.get("code").and_then(Value::as_i64) == Some(0) || map.get("success").and_then(Value::as_bool) == Some(true))
        },
        _ => false,
    }
}

impl ScheduleSession {
    pub fn load(session: &Session) -> Result<Self, BackendError> {
        let fingerprint = fingerprint(session).unwrap_or_default();
        let sid = format!("{}-{}", crate::sync::now_ms(), NEXT.fetch_add(1, Ordering::Relaxed));
        let tables = session.config.source_tables()?;
        let mut sources: Vec<SourceStatus> = session.config.sources.iter()
            .filter(|source| source.enabled && matches!(source.kind, crate::model::source::SourceKind::PersonalTodo))
            .map(|source| SourceStatus { id: source.id.clone(),
                name: tables.iter().find(|table| table.id == source.id)
                    .and_then(|table| table.display_name.clone()).unwrap_or_else(|| source.id.clone()),
                complete: false, error: None, pages: 0 }).collect();
        let mut view = LoadResult { session_id: sid, current_user: String::new(), current_user_name: String::new(),
            account_error: None, read_at_ms: crate::sync::now_ms(), sources: Vec::new(), targets: Vec::new(),
            failed_items: 0, item_errors: Vec::new(), read_requests: 0 };
        match session.credential() {
            Ok(credential) => {
                let client = crate::remote::shared(&session.config, &credential);
                let count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
                crate::remote::runtime()?.block_on(crate::mcp::count_schedule_rpcs(count.clone(),
                    load_remote(session, client.as_ref(), &fingerprint, &mut view, &mut sources)))?;
                view.read_requests = count.load(Ordering::Relaxed);
            }
            Err(_) => {
                view.account_error = Some("未能确认当前飞书账号，请检查连接后重试".into());
                for source in &mut sources { source.error = Some("无法读取个人待办，请检查连接后重试".into()); }
            }
        }
        view.sources = sources;
        view.read_at_ms = crate::sync::now_ms();
        Ok(Self { view, fingerprint, frozen: HashSet::new(), frozen_nodes: HashSet::new() })
    }

    pub fn sync(
        &mut self,
        session: &Session,
        session_id: &str,
        changes: Vec<Change>,
    ) -> Result<SyncResult, BackendError> {
        self.sync_with_lock_timeout(session, session_id, changes, std::time::Duration::from_secs(30))
    }

    fn sync_with_lock_timeout(
        &mut self,
        session: &Session,
        session_id: &str,
        changes: Vec<Change>,
        lock_timeout: std::time::Duration,
    ) -> Result<SyncResult, BackendError> {
        if self.view.session_id != session_id || fingerprint(session)? != self.fingerprint {
            return Err(BackendError::conflict("排期会话或连接已变化，请重新读取"));
        }
        let mut seen = HashSet::new();
        let mut prepared = Vec::new();
        for change in changes {
            if !seen.insert(change.id.clone()) {
                return Err(BackendError::validation("排期目标重复"));
            }
            let target = self
                .view
                .targets
                .iter()
                .find(|t| t.id == change.id)
                .ok_or_else(|| BackendError::validation("排期目标不属于当前读取会话"))?;
            let node = (
                target.identity.project.clone(),
                target.identity.r#type.clone(),
                target.identity.item.clone(),
                target.identity.node.clone(),
            );
            if self.frozen.contains(&change.id) || self.frozen_nodes.contains(&node) {
                return Err(BackendError::validation(
                    "该节点存在结果不确定的排期，请先在飞书核对并重新读取",
                ));
            }
            if let Some(reason) = &target.read_only_reason {
                return Err(BackendError::validation(reason.clone()));
            }
            if change.cancel {
                return Err(BackendError::validation("当前连接尚未验证取消日期"));
            }
            let (start, end) = (date_ms(&change.start), date_ms(&change.end));
            if start.is_none() || end.is_none() || start > end {
                return Err(BackendError::validation("请填写有效的开始和结束日期"));
            }
            if target.baseline.start == change.start && target.baseline.end == change.end {
                return Err(BackendError::validation("排期没有变化"));
            }
            prepared.push((target.clone(), change, start.unwrap(), end.unwrap()));
        }
        if prepared.is_empty() {
            return Err(BackendError::validation("没有可同步的排期变化"));
        }
        let credential = session.credential()?;
        let client = crate::remote::shared(&session.config, &credential);
        let rpc_count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        crate::remote::runtime()?.block_on(crate::mcp::count_schedule_rpcs(rpc_count.clone(), async {
            let mut result = SyncResult { targets: Vec::new(), write_requests: 0 };
            let mut stopped = false; let mut uncertain_nodes = HashSet::new();
            for (target, change, start, end) in prepared {
                let node = (target.identity.project.clone(), target.identity.r#type.clone(), target.identity.item.clone(), target.identity.node.clone());
                if stopped || uncertain_nodes.contains(&node) { result.targets.push(TargetResult { id: change.id, result: "unsent", message: "本次未发送" }); continue; }
                let item_id = WorkItemId { project_key: Some(target.identity.project.clone()),
                    work_item_type_key: Some(target.identity.r#type.clone()), work_item_id: target.identity.item.clone() };
                let _access = match tokio::time::timeout(lock_timeout, crate::item_access::lock_workflow(&session.store, &item_id)).await {
                    Ok(access) => access,
                    Err(_) => { result.targets.push(TargetResult { id: change.id, result: "unsent", message: "等待事项写入超时，本次未发送" }); continue; }
                };
                let request_id = format!("schedule-{}-{}-{}", std::process::id(), self.view.session_id, NEXT.fetch_add(1, Ordering::Relaxed));
                let record = crate::store::ActionRecord {
                    request_id: request_id.clone(),
                    item_id: format!("{}|{}|{}", target.identity.project, target.identity.r#type, target.identity.item),
                    action_kind: "schedule_planner".into(), target: match target.identity.owner.as_ref() {
                        Some(owner) => format!("{}|{}", target.identity.node, owner),
                        None => target.identity.node.clone(),
                    },
                    version: String::new(), status: "pending".into(), verified: false, detail: None,
                    created_at: crate::sync::now_ms(), finished_at: None,
                };
                match session.store.begin_action(&record) {
                    Ok(true) => {},
                    _ => { result.targets.push(TargetResult { id: change.id, result: "unsent", message: "事项正在写入或台账不可用，本次未发送" }); continue; }
                }
                if session.store.mark_detail_refresh(&item_id).is_err() {
                    let _ = session.store.finish_action(&request_id, "failed", false, Some("本地缓存状态登记失败，未发送"), crate::sync::now_ms());
                    result.targets.push(TargetResult { id: change.id, result: "unsent", message: "本地登记失败，本次未发送" });
                    continue;
                }
                let mut patch = json!({"clear_schedule":false,"is_auto":false});
                if target.baseline.start != change.start { patch["estimate_start_date"] = json!(start); }
                if target.baseline.end != change.end { patch["estimate_end_date"] = json!(end); }
                let mut args = json!({"project_key":target.identity.project,"work_item_id":target.identity.item,"node_id":target.identity.node});
                if target.identity.scope == "personal" { patch["owners"] = json!([target.identity.owner]); args["schedules"] = json!([patch]); } else { args["node_schedule"] = patch; }
                let before_write = rpc_count.load(Ordering::Relaxed);
                let response = client.call_tool("update_node", args.as_object().unwrap()).await;
                let connection_error; let mut rejected = false;
                let accepted = match response {
                    Ok(payload) => { connection_error = explicit_auth_failure(&payload); schedule_receipt_accepted(&payload) },
                    Err(e) => { connection_error = matches!(e.kind(), ErrorKind::Auth | ErrorKind::Credential | ErrorKind::Connection) || matches!(&e, BackendError::Tool { code, message, .. } if *code == Some(401) || explicit_auth_marker(message)); rejected = matches!(e, BackendError::Permission { .. }) || rpc_count.load(Ordering::Relaxed) == before_write; false }
                };
                let accepted = accepted && !connection_error;
                let (status, detail) = if accepted { ("unknown", "收到成功回执，未回读核验") }
                    else if rejected { ("failed", if rpc_count.load(Ordering::Relaxed) == before_write { "请求未发送" } else { "请求被权限拒绝" }) }
                    else { ("unknown", "已发送，结果不确定") };
                let ledger_failed = session.store.finish_action(&request_id, status, false, Some(detail), crate::sync::now_ms()).is_err();
                if accepted {
                    if let Some(t) = self.view.targets.iter_mut().find(|t| t.id == change.id) { t.baseline = Dates { start: change.start, end: change.end }; }
                    result.targets.push(TargetResult { id: change.id, result: "accepted", message: if ledger_failed { "收到成功回执，未回读核验；本地台账记录失败" } else { "收到成功回执，未回读核验" } });
                } else if rejected {
                    stopped |= connection_error;
                    let message = if rpc_count.load(Ordering::Relaxed) == before_write { "请求未发送，请检查连接后重试" } else { "连接或权限拒绝了本次请求" };
                    result.targets.push(TargetResult { id: change.id, result: "failed", message: if ledger_failed { "请求失败，本地台账记录失败" } else { message } });
                } else {
                    self.frozen.insert(change.id.clone()); self.frozen_nodes.insert(node.clone()); uncertain_nodes.insert(node); stopped |= connection_error;
                    result.targets.push(TargetResult { id: change.id, result: "uncertain", message: if ledger_failed { "暂时无法确认是否保存，请先在飞书核对；本地台账记录失败" } else { "暂时无法确认是否保存，请先在飞书核对" } });
                }
            }
            result.write_requests = rpc_count.load(Ordering::Relaxed);
            Ok(result)
        }))
    }
}

async fn load_remote(session: &Session, client: &dyn TodoSource, fingerprint: &str,
    view: &mut LoadResult, statuses: &mut [SourceStatus]) -> Result<(), BackendError> {
    let account = client.call_tool("search_user_info", json!({"user_keys":["current_login_user()"]}).as_object().unwrap()).await
        .and_then(|payload| parse_tool_json("search_user_info", &payload));
    if let Ok(value) = account {
        if let Some(users) = value.as_array().filter(|users| users.len() == 1) {
            view.current_user = txt(&users[0]["user_key"]);
            view.current_user_name = user_name(&users[0]);
        }
    }
    if view.current_user.trim().is_empty() {
        view.current_user.clear();
        view.account_error = Some("未能确认当前飞书账号，请检查连接后重试".into());
    }
    let mut items: BTreeMap<(String, String, String), (WorkItemId, String, BTreeSet<String>, Vec<(String, Value)>)> = BTreeMap::new();
    for status in statuses.iter_mut() {
        let source = session.config.sources.iter().find(|source| source.id == status.id).unwrap();
        if source.ensure_executable().is_err() {
            status.error = Some("个人待办来源配置不完整".into());
            continue;
        }
        let scope = match session.source_type_scope(&source.id) {
            Ok(scope) => scope,
            Err(_) => { status.error = Some("无法读取来源范围".into()); continue; }
        };
        let reader = crate::source_query::SourceReader::new(client, source, &session.store, scope.as_ref(), session.config.max_pages);
        let query = source.todo.as_ref().unwrap();
        let mut received = 0usize;
        let mut total = None;
        let mut seen_pages = HashSet::new();
        let mut seen_rows = HashSet::new();
        for page in crate::config::page_numbers(session.config.max_pages) {
            let (rows, page_total) = match reader.schedule_page(&query.to_arguments(page)).await {
                Ok(result) => result,
                Err(_) => { status.error = Some("个人待办读取未完成，请重试".into()); break; }
            };
            status.pages += 1;
            if let Some(next_total) = page_total {
                if next_total < 0 || total.is_some_and(|previous| previous != next_total) {
                    status.error = Some("个人待办分页总数发生变化，读取未完成".into());
                }
                total = Some(next_total);
            }
            if !rows.is_empty() && !seen_pages.insert(serde_json::to_string(&rows)?) {
                status.error = Some("个人待办分页重复，读取未完成".into()); break;
            }
            let fingerprints: HashSet<_> = rows.iter().map(serde_json::to_string).collect::<Result<_, _>>()?;
            if fingerprints.iter().any(|row| seen_rows.contains(row)) {
                status.error = Some("个人待办分页存在重复记录，读取未完成".into());
            }
            seen_rows.extend(fingerprints);
            received += rows.len();
            let empty = rows.is_empty();
            for row in rows {
                let id = WorkItemId { project_key: detail::text(&row["project_key"]),
                    work_item_type_key: detail::text(&row["work_item_info"]["work_item_type_key"]),
                    work_item_id: txt(&row["work_item_info"]["work_item_id"]) };
                let (project, kind, item) = id.key_tuple();
                if id.project_key.as_deref().is_none_or(|value| value.trim().is_empty())
                    || id.work_item_type_key.as_deref().is_none_or(|value| value.trim().is_empty())
                    || item.trim().is_empty() {
                    status.error = Some("部分待办身份不完整，读取未完成".into()); continue;
                }
                if scope.as_ref().is_some_and(|scope| !scope.allows(&project, &kind)) { continue; }
                let title = txt(&row["work_item_info"]["work_item_name"]);
                let entry = items.entry((project, kind, item)).or_insert_with(|| (id, title, BTreeSet::new(), Vec::new()));
                entry.2.insert(source.id.clone());
                entry.3.push((source.id.clone(), row));
            }
            if empty {
                if total.is_some_and(|n| n < 0 || received < n as usize) { status.error = Some("个人待办分页不完整，请重试".into()); }
                else if status.error.is_none() { status.complete = true; }
                break;
            }
            if total.is_some_and(|n| n >= 0 && received > n as usize) {
                status.error = Some("个人待办分页数量与总数不一致，读取未完成".into());
                break;
            }
            if total.is_some_and(|n| n >= 0 && received == n as usize) {
                if status.error.is_none() { status.complete = true; }
                break;
            }
            if page == session.config.max_pages { status.error = Some("个人待办分页达到上限，读取未完成".into()); }
        }
    }
    let mut schedule_configs = BTreeMap::new();
    for (_, (id, title, sources, rows)) in items {
        match fetch_nodes(client, &id, session.config.max_pages).await {
            Ok(nodes) => {
                if nodes.is_empty() {
                    for status in statuses.iter_mut().filter(|status| sources.contains(&status.id)) {
                        status.complete = false;
                        status.error = Some("未取得该待办的节点排期，请重试".into());
                    }
                    build_aggregate_targets(&mut view.targets, &view.session_id, &id, &rows, "节点详情为空，来源排期仅供查看");
                    view.item_errors.push(FailedItem { project: id.project_key.clone().unwrap_or_default(),
                        r#type: id.work_item_type_key.clone().unwrap_or_default(), item: id.work_item_id.clone(),
                        sources: sources.iter().cloned().collect(), message: "未取得该待办的节点排期，请重试".into() });
                    continue;
                }
                let project = id.project_key.as_deref().unwrap_or_default();
                let kind = id.work_item_type_key.as_deref().unwrap_or_default();
                let config_key = (project.to_owned(), kind.to_owned());
                if !schedule_configs.contains_key(&config_key) {
                    let config = crate::source_query::metadata(client, "list_node_field_config", project, kind, session.config.max_pages).await;
                    schedule_configs.insert(config_key.clone(), config.map(|fields| fields.iter().any(|field| field["field_key"] == "schedule")));
                }
                let config = schedule_configs.get(&config_key).unwrap();
                if config.is_err() {
                    for status in statuses.iter_mut().filter(|status| sources.contains(&status.id)) {
                        status.complete = false;
                        status.error = Some("节点排期字段配置读取未完成，请重试".into());
                    }
                }
                let item_url = match crate::detail::fetch(client, &id, session.config.max_pages).await {
                    Ok(detail) => crate::workflow::item_url(&session.config.endpoint, &id, &detail.data),
                    Err(_) => None,
                };
                let first = view.targets.len();
                let nodes_incomplete = nodes.iter().any(node_data_incomplete);
                for node in nodes {
                    build_targets(&mut view.targets, &view.session_id, fingerprint, &view.current_user, &id,
                        if title.is_empty() { &id.work_item_id } else { &title }, &sources, &node);
                }
                for target in &mut view.targets[first..] {
                    target.item_url = item_url.clone();
                    if target.read_only_reason.is_none() && !matches!(config, Ok(true)) {
                        target.read_only_reason = Some(if config.is_err() { "节点排期配置读取失败，仅供查看" } else { "未找到节点排期字段配置，仅供查看" }.into());
                    }
                }
                if nodes_incomplete || view.targets[first..].iter().any(incomplete_target) {
                    for status in statuses.iter_mut().filter(|status| sources.contains(&status.id)) {
                        status.complete = false;
                        status.error = Some("部分节点身份或排期数据不完整，请重试".into());
                    }
                    view.item_errors.push(FailedItem { project: id.project_key.clone().unwrap_or_default(),
                        r#type: id.work_item_type_key.clone().unwrap_or_default(), item: id.work_item_id.clone(),
                        sources: sources.iter().cloned().collect(), message: "部分节点身份或排期数据不完整，仅显示可确认内容".into() });
                }
            },
            Err(_) => {
                for status in statuses.iter_mut().filter(|status| sources.contains(&status.id)) {
                    status.complete = false;
                    status.error = Some("部分事项节点读取未完成，请重试".into());
                }
                build_aggregate_targets(&mut view.targets, &view.session_id, &id, &rows, "节点读取未完成，来源排期仅供查看");
                view.item_errors.push(FailedItem { project: id.project_key.unwrap_or_default(), r#type: id.work_item_type_key.unwrap_or_default(),
                    item: id.work_item_id, sources: sources.into_iter().collect(), message: "节点读取未完成，请重试".into() });
            }
        }
    }
    view.failed_items = view.item_errors.len();
    finish_person_names(session, &view.current_user, &mut view.targets);
    Ok(())
}

fn incomplete_target(target: &Target) -> bool {
    target.unknown_owner || target.identity.node.trim().is_empty() || matches!(target.read_only_reason.as_deref(),
        Some("节点负责人或排期信息不完整，仅供查看" | "负责人排期数据不完整" | "负责人排期身份重复，请在飞书查看" | "排期日期格式无法确认" | "负责人身份不明，排期仅供查看"))
}

fn node_data_incomplete(node: &Value) -> bool {
    if node_key(node).is_empty() { return true; }
    let Some(owners) = node.pointer("/assignees/owners").and_then(Value::as_array) else { return true; };
    if owners.iter().any(|owner| txt(&owner["user_key"]).trim().is_empty()) { return true; }
    match node.get("assignee_schedule_list") {
        None | Some(Value::Null) => dates(&node["schedule"]).is_none(),
        Some(Value::Array(rows)) if rows.is_empty() => dates(&node["schedule"]).is_none(),
        Some(Value::Array(rows)) => {
            let mut seen = BTreeMap::new();
            for row in rows {
                let owner = txt(&row["assignee"]["user_key"]);
                if owner.trim().is_empty() || !owners.iter().any(|candidate| txt(&candidate["user_key"]) == owner)
                    || dates(&row["schedule_info"]).is_none() { return true; }
                if let Some(previous) = seen.insert(owner, row) {
                    if previous != row { return true; }
                }
            }
            false
        },
        Some(_) => true,
    }
}

fn short_id(id: &str) -> String {
    id.chars()
        .rev()
        .take(6)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect()
}

fn finish_person_names(session: &Session, current: &str, targets: &mut [Target]) {
    let context = crate::creation::account_context_for_key(session, current);
    let mut observed: BTreeMap<(String, String), String> = BTreeMap::new();
    for target in targets.iter() {
        if let Some(owner) = target.identity.owner.as_deref() {
            if !target.owner_name.trim().is_empty() && target.owner_name != owner {
                observed.entry((target.identity.project.clone(), owner.to_owned()))
                    .or_insert_with(|| target.owner_name.clone());
            }
        }
        for person in &target.owners {
            if !person.name.trim().is_empty() && person.name != person.id {
                observed.entry((target.identity.project.clone(), person.id.clone()))
                    .or_insert_with(|| person.name.clone());
            }
        }
    }
    let mut cached = BTreeMap::new();
    for target in targets {
        let people = cached.entry(target.identity.project.clone()).or_insert_with(|| {
            context.as_ref().and_then(|context| {
                session.store.creation_people(context, &target.identity.project).ok()
            }).unwrap_or_default()
        });
        let resolve = |id: &str, name: &mut String| {
            if name.trim().is_empty() || name == id {
                *name = observed.get(&(target.identity.project.clone(), id.to_owned()))
                    .or_else(|| people.get(id))
                    .filter(|cached| !cached.trim().is_empty() && cached.as_str() != id)
                    .cloned()
                    .unwrap_or_else(|| short_id(id));
            }
        };
        if let Some(owner) = target.identity.owner.as_deref()
            .or_else(|| target.owners.first().map(|person| person.id.as_str())) {
            resolve(owner, &mut target.owner_name);
        }
        for person in &mut target.owners {
            resolve(&person.id, &mut person.name);
        }
    }
}

async fn fetch_nodes(
    client: &dyn TodoSource,
    id: &WorkItemId,
    max_pages: u32,
) -> Result<Vec<Value>, BackendError> {
    let mut nodes = Vec::new();
    let mut seen = BTreeMap::new();
    let mut unidentified = HashSet::new();
    let mut pages = HashSet::new();
    for page in crate::config::page_numbers(max_pages) {
        let args = json!({"project_key":id.project_key,"work_item_type_key":id.work_item_type_key,"work_item_id":id.work_item_id,"page_num":page});
        let value = parse_tool_json(
            "get_node_detail",
            &client
                .call_tool("get_node_detail", args.as_object().unwrap())
                .await?,
        )?;
        let list = ["list", "detail", "nodes", "data"]
            .iter()
            .find_map(|k| value[*k].as_array())
            .ok_or_else(|| BackendError::parse("节点", "缺少节点列表"))?;
        if !list.is_empty() && !pages.insert(serde_json::to_string(list)?) {
            return Err(BackendError::parse("节点", "节点分页重复"));
        }
        let more = match value.get("pagination") {
            None | Some(Value::Null) if page == 1 => false,
            None | Some(Value::Null) => {
                return Err(BackendError::parse("节点", "续页缺少分页状态"))
            }
            Some(pagination) => pagination
                .get("has_more")
                .and_then(Value::as_bool)
                .ok_or_else(|| BackendError::parse("节点", "分页状态无效"))?,
        };
        for node in list {
            let key = node_key(node);
            if !key.is_empty() {
                if let Some(previous) = seen.get(&key) {
                    if previous != node { return Err(BackendError::parse("节点", "节点身份重复且内容冲突")); }
                    continue;
                }
                seen.insert(key, node.clone());
            } else if !unidentified.insert(serde_json::to_string(node)?) {
                continue;
            }
            nodes.push(node.clone());
        }
        if !more {
            return Ok(nodes);
        }
        if list.is_empty() {
            return Err(BackendError::parse("节点", "节点分页未取全"));
        }
    }
    Err(BackendError::parse("节点", "节点分页达到上限"))
}

fn node_key(node: &Value) -> String {
    let basic = detail::text(&node["basic"]["node_key"]).filter(|key| !key.trim().is_empty());
    let direct = detail::text(&node["node_key"]).filter(|key| !key.trim().is_empty());
    if basic.as_ref().zip(direct.as_ref()).is_some_and(|(a, b)| a != b) { return String::new(); }
    basic.or(direct).unwrap_or_default()
}

fn build_targets(
    out: &mut Vec<Target>,
    sid: &str,
    connection: &str,
    current: &str,
    id: &WorkItemId,
    title: &str,
    sources: &BTreeSet<String>,
    node: &Value,
) {
    let key = node_key(node);
    let status = detail::text(&node["basic"]["status"])
        .or_else(|| detail::text(&node["status"]))
        .unwrap_or_default();
    let owners = node["assignees"]["owners"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let personal = node["assignee_schedule_list"].as_array();
    let invalid_personal = node
        .get("assignee_schedule_list")
        .is_some_and(|v| !v.is_null() && !v.is_array());
    let rows: Vec<(Option<String>, String, &Value)> = match personal {
        Some(rows) if !rows.is_empty() => rows
            .iter()
            .enumerate()
            .filter(|(index, row)| !rows[..*index].contains(row))
            .map(|(_, row)| row)
            .map(|r| {
                let owner = detail::text(&r["assignee"]["user_key"]);
                let mut name = user_name(&r["assignee"]);
                if name.is_empty() || owner.as_deref() == Some(name.as_str()) {
                    if let Some(key) = owner.as_ref() {
                        name = owners.iter()
                            .filter(|candidate| detail::text(&candidate["user_key"]).as_ref() == Some(key))
                            .map(user_name)
                            .find(|name| !name.is_empty() && name != key)
                            .unwrap_or_default();
                    }
                }
                (
                    owner,
                    name,
                    &r["schedule_info"],
                )
            })
            .collect(),
        _ => vec![(
            None,
            owners.iter().find(|o| detail::text(&o["user_key"]).is_some())
                .map(user_name).unwrap_or_default(),
            &node["schedule"],
        )],
    };
    let mut owner_counts = BTreeMap::new();
    for (owner, _, _) in &rows {
        if let Some(owner) = owner {
            *owner_counts.entry(owner.clone()).or_insert(0usize) += 1;
        }
    }
    let mut emitted_owners = HashSet::new();
    for (owner, name, value) in rows {
        if owner.as_ref().is_some_and(|owner| !emitted_owners.insert(owner.clone())) { continue; }
        let parsed = dates(value);
        let baseline = parsed.clone().unwrap_or_else(|| Dates {
            start: value
                .get("estimate_start_time")
                .and_then(date)
                .unwrap_or_default(),
            end: value
                .get("estimate_finish_time")
                .and_then(date)
                .unwrap_or_default(),
        });
        let sole =
            !current.is_empty() && owners.len() == 1 && txt(&owners[0]["user_key"]) == current;
        let reason = if current.is_empty() {
            Some("未能确认当前飞书账号")
        } else if key.is_empty() {
            Some("未能确认节点身份，排期仅供查看")
        } else if invalid_personal {
            Some("负责人排期数据不完整")
        } else if owner
            .as_ref()
            .is_some_and(|o| owner_counts.get(o).copied().unwrap_or(0) > 1)
        {
            Some("负责人排期身份重复，请在飞书查看")
        } else if parsed.is_none() {
            Some("排期日期格式无法确认")
        } else if status == "not_started" {
            Some("当前连接尚未验证此状态的排期写入")
        } else if status != "doing" {
            Some("节点已完成或状态不明")
        } else if owner.is_none() && personal.is_some_and(|p| !p.is_empty()) {
            Some("负责人身份不明，排期仅供查看")
        } else if owner.is_none() && owners.is_empty() {
            Some("节点无人负责，排期仅供查看")
        } else if owner.is_none() && owners.iter().all(|o| detail::text(&o["user_key"]).is_none()) {
            Some("负责人身份不明，排期仅供查看")
        } else if owner.is_none() && !sole {
            Some("仅可编辑明确属于自己的排期")
        } else if node_data_incomplete(node) {
            Some("节点负责人或排期信息不完整，仅供查看")
        } else if owner.as_deref().is_some_and(|o| o == current)
            || (owner.is_none() && sole && personal.is_none_or(|p| p.is_empty()))
        {
            None
        } else {
            Some("仅可编辑明确属于自己的排期")
        };
        let scope = if personal.is_some_and(|p| !p.is_empty()) {
            "personal"
        } else {
            "node"
        };
        let id_string = format!("{sid}:{}", out.len());
        let people = if scope == "personal" {
            owner
                .as_ref()
                .map(|key| {
                    vec![Person {
                        id: key.clone(),
                        name: if name.is_empty() {
                            key.clone()
                        } else {
                            name.clone()
                        },
                    }]
                })
                .unwrap_or_default()
        } else {
            owners
                .iter()
                .filter_map(|o| {
                    let key = detail::text(&o["user_key"])?;
                    let name = user_name(o);
                    Some(Person {
                        name: if name.is_empty() { key.clone() } else { name },
                        id: key,
                    })
                })
                .collect()
        };
        out.push(Target {
            id: id_string,
            node_id: key.clone(),
            identity: Identity {
                connection: connection.into(),
                project: id.project_key.clone().unwrap_or_default(),
                r#type: id.work_item_type_key.clone().unwrap_or_default(),
                item: id.work_item_id.clone(),
                node: key.clone(),
                scope: scope.into(),
                owner: owner.clone(),
            },
            title: title.into(),
            node_name: txt(&node["basic"]["name"]),
            owner_name: if name.is_empty() {
                owner.unwrap_or_default()
            } else {
                name
            },
            owners: people,
            unknown_owner: scope == "node" && owners.iter().any(|o| detail::text(&o["user_key"]).is_none()),
            item_url: None,
            sources: sources.iter().cloned().collect(),
            baseline,
            read_only_reason: reason.map(str::to_owned),
            source_aggregate: false,
            cache_kind: "node", start_state: "unknown", end_state: "unknown", fetched_at_ms: None,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_reports_unknown_owners_and_preserves_specific_errors() {
        let id = WorkItemId { project_key: Some("p".into()), work_item_type_key: Some("t".into()), work_item_id: "i".into() };
        let make = |node: Value| {
            let mut out = Vec::new();
            build_targets(&mut out, "s", "c", "me", &id, "title", &BTreeSet::new(), &node);
            out.remove(0)
        };
        let base = json!({"basic":{"node_key":"n","status":"doing"},"assignees":{"owners":[]},"schedule":{"estimate_start_time":null,"estimate_finish_time":null}});
        assert_eq!(make(base.clone()).read_only_reason.as_deref(), Some("节点无人负责，排期仅供查看"));
        let mut personal = base.clone();
        personal["assignee_schedule_list"] = json!([{"assignee":{},"schedule_info":{"estimate_start_time":null,"estimate_finish_time":null}}]);
        assert_eq!(make(personal.clone()).read_only_reason.as_deref(), Some("负责人身份不明，排期仅供查看"));
        personal["basic"]["node_key"] = json!("");
        assert_eq!(make(personal).read_only_reason.as_deref(), Some("未能确认节点身份，排期仅供查看"));
        let mut mixed = base;
        mixed["assignees"]["owners"] = json!([{"user_key":"me","name":"本人"},{"name":"未知"}]);
        let target = make(mixed);
        assert!(target.unknown_owner);
        assert_eq!(target.owners.len(), 1);
        assert_eq!(target.read_only_reason.as_deref(), Some("仅可编辑明确属于自己的排期"));
        assert_eq!(serde_json::to_value(target).unwrap()["unknown_owner"], true);
    }
    use crate::mcp::{ConnectionInfo, ToolResultPayload};
    use async_trait::async_trait;
    use serde_json::Map;
    use std::sync::{
        atomic::{AtomicBool, AtomicUsize},
        Arc, Mutex,
    };

    struct Fake {
        calls: Mutex<Vec<(String, Value)>>,
        fail_detail: AtomicBool,
        partial_page: AtomicBool,
        receipts: Mutex<Vec<ToolResultPayload>>,
    }
    #[async_trait]
    impl TodoSource for Arc<Fake> {
        async fn describe(&self) -> Result<ConnectionInfo, BackendError> {
            unreachable!()
        }
        async fn close(&mut self) {}
        async fn call_tool(
            &self,
            tool: &str,
            args: &Map<String, Value>,
        ) -> Result<ToolResultPayload, BackendError> {
            crate::mcp::record_schedule_rpc();
            self.calls
                .lock()
                .unwrap()
                .push((tool.into(), Value::Object(args.clone())));
            let v = match tool {
                "search_user_info" => json!([{"user_key":"me","name_cn":"本人"}]),
                "list_todo" => {
                    if self.partial_page.load(Ordering::SeqCst) && args["page_num"] == 2 {
                        return Err(BackendError::parse("测试", "第二页失败"));
                    }
                    json!({"list":[{"project_key":"p","work_item_info":{"work_item_id":"1","work_item_type_key":"story","work_item_name":"测试事项"},"node_info":{"node_name":"开发"},"schedule":{"start_time":"1750000000000","end_time":""}}],"total":if self.partial_page.load(Ordering::SeqCst) {2} else {1}})
                }
                "get_workitem_brief" => {
                    if self.fail_detail.load(Ordering::SeqCst) {
                        return Err(BackendError::parse("测试", "离线失败"));
                    }
                    json!({"work_item_attribute":{"work_item_id":"1","owned_project":{"key":"p","simple_name":"example"},"work_item_type":{"key":"story"},"work_item_name":"测试事项"},"work_item_fields":[],"pagination":{"has_more":false}})
                }
                "get_node_detail" if self.fail_detail.load(Ordering::SeqCst) => return Err(BackendError::parse("测试", "节点失败")),
                "get_node_detail" => json!({"list":[
                    {"basic":{"node_key":"n1","name":"开发","status":"doing"},"assignees":{"owners":[{"user_key":"me","name":"本人"}]},"assignee_schedule_list":[{"assignee":{"user_key":"me","name":"本人"},"schedule_info":{"estimate_start_time":null,"estimate_finish_time":null}}],"schedule":{"estimate_start_time":1794499200000i64,"estimate_finish_time":1794499200000i64}},
                    {"basic":{"node_key":"n2","status":"not_started"},"assignees":{"owners":[{"user_key":"me","name":"本人"}]},"schedule":{"estimate_start_time":null,"estimate_finish_time":null}}
                ],"pagination":{"has_more":false}}),
                "list_node_field_config" => {
                    json!({"list":[{"field_key":"schedule","field_type":"schedule"}],"pagination":{"has_more":false}})
                }
                "update_node" => return Ok(self.receipts.lock().unwrap().remove(0)),
                _ => panic!("unexpected tool {tool}"),
            };
            Ok(ToolResultPayload::from_json(v))
        }
    }
    struct ReadScenario {
        fake: Arc<Fake>,
        pages: Vec<Value>,
        config: Option<Value>,
    }
    struct EmptyNodes(Arc<Fake>, bool);
    #[async_trait]
    impl TodoSource for EmptyNodes {
        async fn describe(&self) -> Result<ConnectionInfo, BackendError> { unreachable!() }
        async fn close(&mut self) {}
        async fn call_tool(&self, tool: &str, args: &Map<String, Value>) -> Result<ToolResultPayload, BackendError> {
            if tool == "get_node_detail" {
                crate::mcp::record_schedule_rpc();
                return Ok(ToolResultPayload::from_json(json!({"list":[],"pagination":{"has_more":false}})));
            }
            let mut result = self.0.call_tool(tool, args).await?;
            if self.1 && tool == "list_todo" { result.structured.as_mut().unwrap()["list"][0]["node_info"] = Value::Null; }
            Ok(result)
        }
    }
    #[async_trait]
    impl TodoSource for ReadScenario {
        async fn describe(&self) -> Result<ConnectionInfo, BackendError> { unreachable!() }
        async fn close(&mut self) {}
        async fn call_tool(&self, tool: &str, args: &Map<String, Value>) -> Result<ToolResultPayload, BackendError> {
            if tool == "list_node_field_config" || (tool == "list_todo" && !self.pages.is_empty()) {
                crate::mcp::record_schedule_rpc();
                self.fake.calls.lock().unwrap().push((tool.into(), Value::Object(args.clone())));
                if tool == "list_node_field_config" {
                    return self.config.clone().map(ToolResultPayload::from_json)
                        .ok_or_else(|| BackendError::parse("测试", "字段配置失败"));
                }
                let index = args["page_num"].as_u64().unwrap() as usize - 1;
                return Ok(ToolResultPayload::from_json(self.pages[index].clone()));
            }
            self.fake.call_tool(tool, args).await
        }
    }
    struct ErrorThenSuccess {
        fake: Arc<Fake>,
        error: Mutex<Option<BackendError>>,
    }
    #[async_trait]
    impl TodoSource for ErrorThenSuccess {
        async fn describe(&self) -> Result<ConnectionInfo, BackendError> { unreachable!() }
        async fn close(&mut self) {}
        async fn call_tool(&self, tool: &str, args: &Map<String, Value>) -> Result<ToolResultPayload, BackendError> {
            if tool == "update_node" {
                if let Some(error) = self.error.lock().unwrap().take() {
                    crate::mcp::record_schedule_rpc();
                    self.fake.calls.lock().unwrap().push((tool.into(), Value::Object(args.clone())));
                    return Err(error);
                }
            }
            self.fake.call_tool(tool, args).await
        }
    }
    fn fixture() -> (Session, std::path::PathBuf) {
        static N: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "fstodo-planner-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::SeqCst)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let token = dir.join("token");
        std::fs::write(&token, "fixture-token").unwrap();
        let path = dir.join("config.toml");
        std::fs::write(&path, format!("token_env='FSTODO_TEST_PLANNER_ABSENT'\ntoken_file='{}'\n[[source]]\nid='a'\nkind='personal_todo'\naction='todo'\nenabled=true\n", token.to_string_lossy().replace('\\', "/"))).unwrap();
        (
            Session::open(crate::Config::load(Some(&path), Some(&dir.join("cache.db"))).unwrap())
                .unwrap(),
            dir,
        )
    }
    // Write-path tests need a confirmed node target; local load deliberately cannot
    // infer these credentials and field capabilities from cached aggregate rows.
    fn writable_plan(session: &Session) -> ScheduleSession {
        let mut plan = ScheduleSession::load(session).unwrap();
        plan.view.targets.clear();
        let id = WorkItemId { project_key: Some("p".into()), work_item_type_key: Some("story".into()), work_item_id: "1".into() };
        let node = json!({"basic":{"node_key":"n1","name":"开发","status":"doing"},
            "assignees":{"owners":[{"user_key":"me","name":"本人"}]},
            "assignee_schedule_list":[{"assignee":{"user_key":"me","name":"本人"},"schedule_info":{"estimate_start_time":null,"estimate_finish_time":null}}]});
        build_targets(&mut plan.view.targets, &plan.view.session_id, "connection", "me", &id, "测试事项", &BTreeSet::from(["a".into()]), &node);
        plan
    }

    #[test]
    fn load_reads_personal_sources_and_deduplicates_nodes() {
        let (mut session, dir) = fixture();
        let mut other = session.config.sources[0].clone(); other.id = "b".into();
        session.config.sources.push(other);
        let old = crate::model::domain::WorkItem {
            id: WorkItemId { project_key: Some("p".into()), work_item_type_key: Some("story".into()), work_item_id: "1".into() },
            project_name: None, name: Some("旧缓存事项".into()),
            flow: crate::model::domain::FlowInfo { kind: crate::model::domain::FlowKind::Node, node_name: Some("开发".into()), node_state_key: None, start_state_key_name: None, end_state_key_name: None },
            schedule: crate::model::domain::Schedule { start_raw: Some("2020-01-01".into()), end_raw: Some("2020-01-02".into()) }, raw_json: "{}".into(),
        };
        let run = session.store.begin_run("todo", None, crate::store::RunTrigger::Manual, Some("a"), 1).unwrap();
        session.store.upsert_items(run, &[old], 1).unwrap();
        let fake = Arc::new(Fake { calls: Mutex::new(vec![]), fail_detail: AtomicBool::new(false), partial_page: AtomicBool::new(false), receipts: Mutex::new(vec![]) });
        let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(fake.clone()));
        let plan = ScheduleSession::load(&session).unwrap();
        assert_eq!(plan.view.current_user, "me");
        assert!(plan.view.sources.iter().all(|s| s.complete && s.pages == 1));
        assert_eq!(plan.view.targets.len(), 2);
        assert_eq!(plan.view.targets[0].sources, ["a", "b"]);
        assert_eq!(plan.view.targets[0].title, "测试事项");
        assert_eq!(plan.view.targets[0].baseline, Dates { start: String::new(), end: String::new() });
        assert!(plan.view.targets[0].read_only_reason.is_none());
        assert_eq!(plan.view.targets[0].item_url.as_deref(), Some("https://project.feishu.cn/example/story/detail/1"));
        assert!(plan.view.targets[1].read_only_reason.is_some());
        let calls = fake.calls.lock().unwrap();
        assert_eq!(calls.iter().filter(|(tool, _)| tool == "list_todo").count(), 2);
        assert_eq!(calls.iter().filter(|(tool, _)| tool == "get_node_detail").count(), 1);
        assert_eq!(calls.iter().filter(|(tool, _)| tool == "update_node").count(), 0);
        assert_eq!(plan.view.read_requests, calls.len());
        drop(calls); drop(installed); drop(session); std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn missing_or_failed_schedule_config_never_opens_editing() {
        for config in [None, Some(json!({"list":[],"pagination":{"has_more":false}}))] {
            let (session, dir) = fixture();
            let fake = Arc::new(Fake { calls: Mutex::new(vec![]), fail_detail: AtomicBool::new(false), partial_page: AtomicBool::new(false), receipts: Mutex::new(vec![]) });
            let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(ReadScenario { fake: fake.clone(), pages: vec![], config: config.clone() }));
            let plan = ScheduleSession::load(&session).unwrap();
            assert!(!plan.view.targets.is_empty());
            assert!(plan.view.targets.iter().all(|target| target.read_only_reason.is_some()));
            assert!(plan.view.targets[0].read_only_reason.as_deref().unwrap().contains("配置"));
            if config.is_none() { assert!(!plan.view.sources[0].complete); }
            assert_eq!(fake.calls.lock().unwrap().iter().filter(|(tool, _)| tool == "update_node").count(), 0);
            drop(installed); drop(session); std::fs::remove_dir_all(dir).unwrap();
        }
    }

    #[test]
    fn empty_nodes_conflicting_with_todo_are_incomplete_and_read_only() {
        for without_node_info in [false, true] {
            let (session, dir) = fixture();
            let fake = Arc::new(Fake { calls: Mutex::new(vec![]), fail_detail: AtomicBool::new(false), partial_page: AtomicBool::new(false), receipts: Mutex::new(vec![]) });
            let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(EmptyNodes(fake, without_node_info)));
            let plan = ScheduleSession::load(&session).unwrap();
            assert!(!plan.view.sources[0].complete);
            assert_eq!(plan.view.failed_items, 1);
            assert!(!plan.view.targets.is_empty());
            assert!(plan.view.targets.iter().all(|target| target.source_aggregate && target.read_only_reason.is_some()));
            drop(installed); drop(session); std::fs::remove_dir_all(dir).unwrap();
        }
    }

    #[test]
    fn inconsistent_totals_and_missing_item_identity_are_not_complete() {
        let row = json!({"project_key":"p","work_item_info":{"work_item_id":"1","work_item_type_key":"story","work_item_name":"任务"}});
        let other = json!({"project_key":"p","work_item_info":{"work_item_id":"2","work_item_type_key":"story"}});
        let missing = json!({"work_item_info":{"work_item_id":"1","work_item_type_key":"story"}});
        let scenarios = vec![
            vec![json!({"list":[row.clone()],"total":"invalid"})],
            vec![json!({"list":[row.clone(), other.clone()],"total":1})],
            vec![json!({"list":[row.clone()],"total":3}), json!({"list":[other.clone()],"total":2})],
            vec![json!({"list":[row.clone()],"total":3}), json!({"list":[row, other],"total":3})],
            vec![json!({"list":[missing],"total":1})],
        ];
        for pages in scenarios {
            let (session, dir) = fixture();
            let fake = Arc::new(Fake { calls: Mutex::new(vec![]), fail_detail: AtomicBool::new(false), partial_page: AtomicBool::new(false), receipts: Mutex::new(vec![]) });
            let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(ReadScenario { fake, pages, config: Some(json!({"list":[{"field_key":"schedule"}],"pagination":{"has_more":false}})) }));
            let plan = ScheduleSession::load(&session).unwrap();
            assert!(!plan.view.sources[0].complete);
            assert!(plan.view.sources[0].error.is_some());
            assert!(plan.view.targets.iter().all(|target| !target.identity.project.is_empty()));
            drop(installed); drop(session); std::fs::remove_dir_all(dir).unwrap();
        }
    }

    #[test]
    fn partial_page_is_not_reported_complete() {
        let (session, dir) = fixture();
        let fake = Arc::new(Fake { calls: Mutex::new(vec![]), fail_detail: AtomicBool::new(false), partial_page: AtomicBool::new(true), receipts: Mutex::new(vec![]) });
        let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(fake));
        let plan = ScheduleSession::load(&session).unwrap();
        assert!(!plan.view.sources[0].complete);
        assert!(plan.view.sources[0].error.is_some());
        assert_eq!(plan.view.sources[0].pages, 1);
        assert!(!plan.view.targets.is_empty());
        drop(installed); drop(session); std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn page_limit_marks_source_incomplete() {
        let (mut session, dir) = fixture();
        session.config.max_pages = 1;
        let fake = Arc::new(Fake { calls: Mutex::new(vec![]), fail_detail: AtomicBool::new(false), partial_page: AtomicBool::new(true), receipts: Mutex::new(vec![]) });
        let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(fake));
        let plan = ScheduleSession::load(&session).unwrap();
        assert!(!plan.view.sources[0].complete);
        assert!(plan.view.sources[0].error.as_deref().unwrap().contains("上限"));
        drop(installed); drop(session); std::fs::remove_dir_all(dir).unwrap();
    }

    fn change(id: &str) -> Change {
        Change {
            id: id.into(),
            start: "2026-11-13".into(),
            end: "2026-11-16".into(),
            cancel: false,
        }
    }

    #[test]
    fn mixed_shared_node_targets_are_readable_but_never_written() {
        let (session, dir) = fixture();
        let fake = Arc::new(Fake { calls: Mutex::new(vec![]), fail_detail: AtomicBool::new(false), partial_page: AtomicBool::new(false), receipts: Mutex::new(vec![]) });
        let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(fake.clone()));
        let mut plan = ScheduleSession::load(&session).unwrap();
        let sid = plan.view.session_id.clone();
        let id = WorkItemId { project_key: Some("p".into()), work_item_type_key: Some("story".into()), work_item_id: "1".into() };
        for (owners, unknown) in [
            (json!([{"user_key":"me"},{"user_key":"other"}]), false),
            (json!([{"user_key":"me"},{"name":"身份不明"}]), true),
        ] {
            let node = json!({"basic":{"node_key":"n","status":"doing"},"assignees":{"owners":owners},"schedule":{"estimate_start_time":1794499200000i64,"estimate_finish_time":1794499200000i64}});
            let mut targets = Vec::new();
            build_targets(&mut targets, &sid, "c", "me", &id, "共同任务", &BTreeSet::new(), &node);
            assert_eq!(targets.len(), 1);
            let target = &targets[0];
            assert_eq!(target.identity.scope, "node");
            assert!(!target.baseline.start.is_empty() && !target.baseline.end.is_empty());
            assert_eq!(target.unknown_owner, unknown);
            assert_eq!(target.read_only_reason.as_deref(), Some("仅可编辑明确属于自己的排期"));
            let target_id = target.id.clone();
            plan.view.targets = targets;
            let error = plan.sync(&session, &sid, vec![change(&target_id)]).unwrap_err();
            assert!(error.to_string().contains("仅可编辑明确属于自己的排期"));
            assert_eq!(fake.calls.lock().unwrap().iter().filter(|(tool, _)| tool == "update_node").count(), 0);
        }
        drop(installed); drop(session); std::fs::remove_dir_all(dir).unwrap();
    }

    fn named_targets(project: &str) -> Vec<Target> {
        let id = WorkItemId {
            project_key: Some(project.into()),
            work_item_type_key: Some("story".into()),
            work_item_id: "1".into(),
        };
        let node = json!({"basic":{"node_key":"n","status":"doing"},
            "assignees":{"owners":[{"user_key":"user-123456"}]},
            "assignee_schedule_list":[{"assignee":{"user_key":"user-123456"},
                "schedule_info":{"estimate_start_time":null,"estimate_finish_time":null}}]});
        let mut targets = Vec::new();
        build_targets(&mut targets, "s", "c", "me", &id, "title", &BTreeSet::new(), &node);
        targets
    }

    #[test]
    fn person_names_prefer_current_data_then_same_project_cache_then_short_id() {
        let (session, dir) = fixture();
        let context = crate::creation::account_context_for_key(&session, "me").unwrap();
        session.store.save_creation_people(&context, "real", &BTreeMap::from([
            ("user-123456".into(), "缓存姓名".into()),
        ])).unwrap();
        let mut cached = named_targets("real");
        let mut current = named_targets("real");
        current[0].owner_name = "本轮姓名".into();
        current[0].owners[0].name = "本轮姓名".into();
        let mut other = named_targets("alias");
        finish_person_names(&session, "me", &mut cached);
        finish_person_names(&session, "me", &mut current);
        finish_person_names(&session, "me", &mut other);
        for (targets, expected) in [(&cached, "缓存姓名"), (&current, "本轮姓名"), (&other, "123456")] {
            assert_eq!(targets[0].owner_name, expected);
            assert_eq!(targets[0].owners[0].name, expected);
        }
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn person_cache_is_isolated_by_account_connection_and_database() {
        let (mut session, dir) = fixture();
        let context = crate::creation::account_context_for_key(&session, "me").unwrap();
        session.store.save_creation_people(&context, "real", &BTreeMap::from([
            ("user-123456".into(), "私有姓名".into()),
        ])).unwrap();
        for current in ["", "   ", "other"] {
            let mut targets = named_targets("real");
            finish_person_names(&session, current, &mut targets);
            assert_eq!(targets[0].owner_name, "123456");
            assert_eq!(targets[0].owners[0].name, "123456");
        }
        let endpoint = session.config.endpoint.clone();
        session.config.endpoint = "https://other.example".into();
        let mut targets = named_targets("real");
        finish_person_names(&session, "me", &mut targets);
        assert_eq!(targets[0].owners[0].name, "123456");
        session.config.endpoint = endpoint;
        session.config.db_path = dir.join("other.db");
        let mut targets = named_targets("real");
        finish_person_names(&session, "me", &mut targets);
        assert_eq!(targets[0].owners[0].name, "123456");
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn observed_names_propagate_only_within_same_project_and_shared_owner_is_resolved() {
        let (session, dir) = fixture();
        let context = crate::creation::account_context_for_key(&session, "me").unwrap();
        session.store.save_creation_people(&context, "real", &BTreeMap::from([
            ("user-123456".into(), "旧缓存".into()),
        ])).unwrap();
        let mut targets = named_targets("real");
        targets[0].owner_name = "本轮姓名".into();
        targets[0].owners[0].name = "本轮姓名".into();
        targets.extend(named_targets("real"));
        targets.extend(named_targets("other"));
        let mut shared = named_targets("real").remove(0);
        shared.identity.owner = None;
        targets.push(shared);
        finish_person_names(&session, "me", &mut targets);
        assert_eq!(targets[1].owner_name, "本轮姓名");
        assert_eq!(targets[1].owners[0].name, "本轮姓名");
        assert_eq!(targets[2].owners[0].name, "123456");
        assert_eq!(targets[3].owner_name, "本轮姓名");
        assert_eq!(targets[3].owners[0].name, "本轮姓名");
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn shared_owner_ignores_unidentified_people_and_prefers_real_name_cn() {
        let (session, dir) = fixture();
        let id = WorkItemId { project_key: Some("real".into()), work_item_type_key: Some("story".into()), work_item_id: "1".into() };
        let node = json!({"basic":{"node_key":"n","status":"doing"},
            "assignees":{"owners":[{"name":"身份不明"}, {"user_key":"user-123456","name":"user-123456","name_cn":"本轮姓名"}]},
            "schedule":{"estimate_start_time":null,"estimate_finish_time":null}});
        let mut targets = Vec::new();
        build_targets(&mut targets, "s", "c", "me", &id, "title", &BTreeSet::new(), &node);
        finish_person_names(&session, "me", &mut targets);
        assert_eq!(targets[0].owner_name, "本轮姓名");
        assert_eq!(targets[0].owners.len(), 1);
        assert_eq!(targets[0].owners[0].name, "本轮姓名");
        assert_eq!(user_name(&json!({"user_key":"u","name":"u","name_cn":"真实姓名"})), "真实姓名");
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn canonical_target_uses_same_identity_for_lock_write_and_ledger() {
        let (session, dir) = fixture();
        let fake = Arc::new(Fake { calls: Mutex::new(vec![]), fail_detail: AtomicBool::new(false), partial_page: AtomicBool::new(false), receipts: Mutex::new(vec![ToolResultPayload::from_text("success")]) });
        let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(fake.clone()));
        let mut plan = writable_plan(&session);
        let target = &mut plan.view.targets[0];
        target.identity.project = "real".into();
        target.sources = vec!["a".into(), "b".into()];
        let target_id = target.id.clone();
        let sid = plan.view.session_id.clone();
        let canonical = WorkItemId { project_key: Some("real".into()), work_item_type_key: Some("story".into()), work_item_id: "1".into() };
        let guard = crate::remote::runtime().unwrap().block_on(crate::item_access::lock_workflow(&session.store, &canonical));
        let blocked = plan.sync_with_lock_timeout(&session, &sid, vec![change(&target_id)], std::time::Duration::from_millis(50)).unwrap();
        assert_eq!(blocked.targets[0].result, "unsent");
        assert_eq!(blocked.write_requests, 0);
        drop(guard);
        assert_eq!(plan.sync(&session, &sid, vec![change(&target_id)]).unwrap().targets[0].result, "accepted");
        assert_eq!(fake.calls.lock().unwrap().iter().find(|(t, _)| t == "update_node").unwrap().1["project_key"], "real");
        assert_eq!(session.store.recent_actions("real|story|1", 10).unwrap().len(), 1);
        assert!(session.store.recent_actions("alias|story|1", 10).unwrap().is_empty());
        drop(installed); drop(session); std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn receipt_requires_the_whole_unstructured_response_to_be_valid() {
        let payload = |blocks: &[&str]| ToolResultPayload {
            text_blocks: blocks.iter().map(|s| (*s).to_owned()).collect(),
            ..Default::default()
        };
        for blocks in [vec!["success"], vec!["success", "log_id: sample"], vec!["success\nlog_id: sample"], vec!["{\"code\":0}", "log_id: sample"], vec!["{\"code\":0}\nlog_id: sample"]] {
            assert!(schedule_receipt_accepted(&payload(&blocks)), "{blocks:?}");
        }
        for blocks in [vec!["{\"code\":0}", "error: rejected"], vec!["{\"code\":0}\nerror: rejected"], vec!["error: rejected", "{\"code\":0}"], vec!["success", "error: rejected"], vec![""], vec!["unknown"]] {
            assert!(!schedule_receipt_accepted(&payload(&blocks)), "{blocks:?}");
        }
        assert!(!schedule_receipt_accepted(&ToolResultPayload::err("success")));
        assert!(schedule_receipt_accepted(&ToolResultPayload { structured: Some(json!({"code":0})), text_blocks: vec!["error: rejected".into()], is_error: false }));
        assert!(!schedule_receipt_accepted(&ToolResultPayload { structured: Some(json!({"success":false})), text_blocks: vec!["success".into()], is_error: false }));
        assert!(!schedule_receipt_accepted(&ToolResultPayload { structured: Some(json!({"code":0})), text_blocks: vec!["success".into()], is_error: true }));
    }

    #[test]
    fn single_target_receipt_without_readback() {
        let (session, dir) = fixture();
        let fake = Arc::new(Fake {
            calls: Mutex::new(vec![]),
            fail_detail: AtomicBool::new(false),
            partial_page: AtomicBool::new(false),
            receipts: Mutex::new(vec![ToolResultPayload::from_text("success\nlog_id: test")]),
        });
        let installed = crate::remote::install_test_client(
            &session.config,
            &session.credential().unwrap(),
            Box::new(fake.clone()),
        );
        let mut plan = writable_plan(&session);
        assert_eq!(plan.view.targets.len(), 1);
        let target = plan.view.targets[0].clone();
        assert_eq!(target.baseline.start, "", "个人空值不能继承节点总日期");
        assert!(target.read_only_reason.is_none());
        let before = fake.calls.lock().unwrap().len();
        assert_eq!(plan.view.read_requests, before);
        let sid = plan.view.session_id.clone();
        let result = plan.sync(&session, &sid, vec![change(&target.id)]).unwrap();
        assert_eq!(result.targets[0].result, "accepted");
        assert_eq!(result.write_requests, 1);
        let actions = session.store.recent_actions("p|story|1", 10).unwrap();
        assert_eq!(actions[0].status, "unknown");
        assert!(!actions[0].verified);
        assert_eq!(
            actions[0].detail.as_deref(),
            Some("收到成功回执，未回读核验")
        );
        let calls = fake.calls.lock().unwrap();
        assert_eq!(calls.len(), before + 1);
        let args = &calls.last().unwrap().1;
        assert_eq!(args["schedules"][0]["owners"], json!(["me"]));
        assert_eq!(
            args["schedules"][0]["estimate_start_date"],
            json!(date_ms("2026-11-13").unwrap())
        );
        assert_eq!(args["schedules"][0]["clear_schedule"], false);
        assert!(args.get("node_schedule").is_none() && args.get("fields").is_none());
        drop(calls);
        let next = ScheduleSession::load(&session).unwrap();
        assert!(!next.view.targets.is_empty());
        assert!(next.view.read_requests > 0);
        drop(installed);
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn invalid_batch_sends_nothing_and_unknown_receipt_freezes_target() {
        let (session, dir) = fixture();
        let fake = Arc::new(Fake {
            calls: Mutex::new(vec![]),
            fail_detail: AtomicBool::new(false),
            partial_page: AtomicBool::new(false),
            receipts: Mutex::new(vec![ToolResultPayload {
                text_blocks: vec!["{\"code\":0}".into(), "error: rejected".into()],
                ..Default::default()
            }]),
        });
        let installed = crate::remote::install_test_client(
            &session.config,
            &session.credential().unwrap(),
            Box::new(fake.clone()),
        );
        let mut plan = writable_plan(&session);
        let sid = plan.view.session_id.clone();
        let id = plan.view.targets[0].id.clone();
        let before = fake.calls.lock().unwrap().len();
        let mut invalid = change(&id);
        invalid.cancel = true;
        assert!(plan.sync(&session, &sid, vec![invalid]).is_err());
        assert_eq!(fake.calls.lock().unwrap().len(), before);
        assert_eq!(
            plan.sync(&session, &sid, vec![change(&id)])
                .unwrap()
                .targets[0]
                .result,
            "uncertain"
        );
        assert!(plan.view.targets[0].baseline.start.is_empty());
        assert!(plan.sync(&session, &sid, vec![change(&id)]).is_err());
        assert_eq!(fake.calls.lock().unwrap().len(), before + 1);
        drop(installed);
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn receipts_are_conservative_and_uncertain_node_does_not_stop_other_nodes() {
        let (session, dir) = fixture();
        let fake = Arc::new(Fake {
            calls: Mutex::new(vec![]),
            fail_detail: AtomicBool::new(false),
            partial_page: AtomicBool::new(false),
            receipts: Mutex::new(vec![
                ToolResultPayload {
                    structured: Some(json!({"success":false})),
                    text_blocks: vec!["success".into()],
                    is_error: false,
                },
                ToolResultPayload {
                    text_blocks: vec!["success".into(), "log_id: sample".into()],
                    ..Default::default()
                },
            ]),
        });
        let installed = crate::remote::install_test_client(
            &session.config,
            &session.credential().unwrap(),
            Box::new(fake.clone()),
        );
        let mut plan = writable_plan(&session);
        let first = plan.view.targets[0].clone();
        let mut same_node = first.clone();
        same_node.id = "same-node".into();
        let mut other = first.clone();
        other.id = "other-node".into();
        other.identity.node = "other".into();
        other.node_id = "other".into();
        plan.view.targets.extend([same_node, other]);
        let sid = plan.view.session_id.clone();
        let before = fake.calls.lock().unwrap().len();
        let result = plan
            .sync(
                &session,
                &sid,
                vec![change(&first.id), change("same-node"), change("other-node")],
            )
            .unwrap();
        assert_eq!(
            result.targets.iter().map(|r| r.result).collect::<Vec<_>>(),
            vec!["uncertain", "unsent", "accepted"]
        );
        assert_eq!(result.write_requests, 2);
        assert!(plan
            .sync(&session, &sid, vec![change("same-node")])
            .is_err());
        assert_eq!(fake.calls.lock().unwrap().len(), before + 2);
        drop(installed);
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn personal_schedule_reuses_only_matching_owner_names() {
        let id = WorkItemId {
            project_key: Some("p".into()),
            work_item_type_key: Some("t".into()),
            work_item_id: "1".into(),
        };
        let node = json!({
            "basic":{"node_key":"n","status":"doing"},
            "assignees":{"owners":[
                {"user_key":"other","name":"其他人"},
                {"user_key":"me","name_cn":"本人"},
                {"user_key":"placeholder","name":"节点真实姓名"}
            ]},
            "assignee_schedule_list":[
                {"assignee":{"user_key":"me"},"schedule_info":{"estimate_start_time":null,"estimate_finish_time":null}},
                {"assignee":{"user_key":"missing"},"schedule_info":{"estimate_start_time":null,"estimate_finish_time":null}},
                {"assignee":{"user_key":"other","name":"排期姓名"},"schedule_info":{"estimate_start_time":null,"estimate_finish_time":null}},
                {"assignee":{"user_key":"placeholder","name":"placeholder"},"schedule_info":{"estimate_start_time":null,"estimate_finish_time":null}}
            ]
        });
        let mut targets = Vec::new();
        build_targets(&mut targets, "s", "c", "me", &id, "title", &BTreeSet::new(), &node);
        for (target, (key, name)) in targets.iter().zip([
            ("me", "本人"), ("missing", "missing"), ("other", "排期姓名"), ("placeholder", "节点真实姓名")
        ]) {
            assert_eq!(target.identity.owner.as_deref(), Some(key));
            assert_eq!(target.owner_name, name);
            assert_eq!(target.owners[0].id, key);
            assert_eq!(target.owners[0].name, name);
        }
        assert_eq!(targets.len(), 4);
    }

    #[test]
    fn duplicate_identical_owner_schedules_merge_but_conflicts_stay_read_only() {
        let id = WorkItemId { project_key: Some("p".into()), work_item_type_key: Some("t".into()), work_item_id: "1".into() };
        let schedule = json!({"assignee":{"user_key":"me"},"schedule_info":{"estimate_start_time":null,"estimate_finish_time":null}});
        let mut node = json!({"basic":{"node_key":"n","status":"doing"},"assignees":{"owners":[{"user_key":"me"}]},"assignee_schedule_list":[schedule.clone(),schedule.clone()]});
        let mut targets = Vec::new();
        build_targets(&mut targets, "s", "c", "me", &id, "title", &BTreeSet::new(), &node);
        assert_eq!(targets.len(), 1);
        assert!(targets[0].read_only_reason.is_none());
        node["assignee_schedule_list"][1]["schedule_info"]["estimate_start_time"] = json!(1794499200000i64);
        targets.clear();
        build_targets(&mut targets, "s", "c", "me", &id, "title", &BTreeSet::new(), &node);
        assert_eq!(targets.len(), 1);
        assert!(targets.iter().all(|target| target.read_only_reason.is_some()));
        assert!(targets.iter().all(incomplete_target));
    }

    #[test]
    fn incomplete_node_data_is_detected_even_when_status_or_account_is_read_only() {
        let missing_owner = json!({"basic":{"node_key":"n","status":"not_started"},"assignees":{"owners":[{"user_key":"me"}]},
            "assignee_schedule_list":[{"assignee":{},"schedule_info":{"estimate_start_time":null,"estimate_finish_time":null}}]});
        assert!(node_data_incomplete(&missing_owner));
        let missing_owners = json!({"basic":{"node_key":"n","status":"doing"},"schedule":{"estimate_start_time":null,"estimate_finish_time":null}});
        assert!(node_data_incomplete(&missing_owners));
        let empty_owners = json!({"basic":{"node_key":"n","status":"doing"},"assignees":{"owners":[]},"schedule":{"estimate_start_time":null,"estimate_finish_time":null}});
        assert!(!node_data_incomplete(&empty_owners));
    }

    #[test]
    fn conflicting_node_or_owner_identity_cannot_be_edited() {
        let id = WorkItemId { project_key: Some("p".into()), work_item_type_key: Some("t".into()), work_item_id: "1".into() };
        let base = json!({"basic":{"node_key":"n","status":"doing"},"assignees":{"owners":[{"user_key":"me"}]},
            "assignee_schedule_list":[{"assignee":{"user_key":"me"},"schedule_info":{"estimate_start_time":null,"estimate_finish_time":null}}]});
        let mut conflicting_key = base.clone(); conflicting_key["node_key"] = json!("another-node");
        let mut missing_owners = base.clone(); missing_owners["assignees"] = json!({});
        let mut different_owner = base.clone(); different_owner["assignees"]["owners"] = json!([{"user_key":"other"}]);
        let mut unknown_row = base; unknown_row["assignee_schedule_list"].as_array_mut().unwrap().push(json!({"assignee":{},"schedule_info":{"estimate_start_time":null,"estimate_finish_time":null}}));
        for node in [conflicting_key, missing_owners, different_owner, unknown_row] {
            assert!(node_data_incomplete(&node));
            let mut targets = Vec::new();
            build_targets(&mut targets, "s", "c", "me", &id, "任务", &BTreeSet::new(), &node);
            assert!(!targets.is_empty());
            assert!(targets.iter().all(|target| target.read_only_reason.is_some()));
        }
    }

    #[test]
    fn identical_source_aggregates_merge_sources_without_inventing_ownership() {
        let id = WorkItemId { project_key: Some("p".into()), work_item_type_key: Some("t".into()), work_item_id: "1".into() };
        let row = json!({"node_info":{"node_name":"开发"},"schedule":{"start_time":"1794499200000","end_time":"1794499200000"}});
        let mut targets = Vec::new();
        build_aggregate_targets(&mut targets, "s", &id, &[("a".into(), row.clone()), ("b".into(), row)], "只读");
        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].sources, ["a", "b"]);
        assert!(targets[0].source_aggregate && targets[0].read_only_reason.is_some());
    }

    #[test]
    fn personal_and_shared_scope_preserve_identity_and_guard_malformed_data() {
        let id = WorkItemId {
            project_key: Some("p".into()),
            work_item_type_key: Some("t".into()),
            work_item_id: "1".into(),
        };
        let mut out = Vec::new();
        let node = json!({"basic":{"node_key":"n","status":"doing"},"assignees":{"owners":[{"user_key":"me"},{"user_key":"other"}]},"schedule":{}});
        build_targets(
            &mut out,
            "s",
            "c",
            "me",
            &id,
            "title",
            &BTreeSet::new(),
            &node,
        );
        assert_eq!(out[0].identity.scope, "node");
        assert_eq!(out[0].owners.len(), 2);
        assert!(out[0].read_only_reason.is_some());
        let mut malformed = node;
        malformed["assignees"]["owners"] = json!([{"user_key":"me"}]);
        malformed["assignee_schedule_list"] = json!("unexpected");
        out.clear();
        build_targets(
            &mut out,
            "s",
            "c",
            "me",
            &id,
            "title",
            &BTreeSet::new(),
            &malformed,
        );
        assert!(out[0].read_only_reason.is_some());
        out.clear();
        let unknown = json!({"basic":{"node_key":"n","status":"doing"},"assignees":{"owners":[{"user_key":"me"}]},"schedule":{}});
        build_targets(
            &mut out,
            "s",
            "c",
            "",
            &id,
            "title",
            &BTreeSet::new(),
            &unknown,
        );
        assert_eq!(
            out[0].read_only_reason.as_deref(),
            Some("未能确认当前飞书账号")
        );
        assert_eq!(date_ms("2026-02-30"), None);
        assert_eq!(date_ms("2026-1-01"), None);
    }

    #[test]
    fn node_failure_preserves_only_read_only_aggregate() {
        let (session, dir) = fixture();
        let fake = Arc::new(Fake { calls: Mutex::new(vec![]), fail_detail: AtomicBool::new(true), partial_page: AtomicBool::new(false), receipts: Mutex::new(vec![]) });
        let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(fake));
        let plan = ScheduleSession::load(&session).unwrap();
        assert_eq!(plan.view.failed_items, 1);
        assert!(!plan.view.sources[0].complete);
        assert!(plan.view.targets.iter().all(|t| t.source_aggregate && t.read_only_reason.is_some()));
        assert_eq!(plan.view.item_errors[0].sources, ["a"]);
        drop(installed); drop(session); std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn missing_dates_and_node_identity_never_create_writable_baselines() {
        let id = WorkItemId {
            project_key: Some("p".into()),
            work_item_type_key: Some("t".into()),
            work_item_id: "1".into(),
        };
        let mut out = Vec::new();
        let node = json!({"basic":{"status":"doing"},"assignees":{"owners":[{"user_key":"me"}]},
            "schedule":{"estimate_start_time":1750000000000i64,"estimate_finish_time":null}});
        build_targets(
            &mut out,
            "s",
            "c",
            "me",
            &id,
            "title",
            &BTreeSet::new(),
            &node,
        );
        assert!(!out[0].baseline.start.is_empty());
        assert!(out[0]
            .read_only_reason
            .as_ref()
            .unwrap()
            .contains("节点身份"));
        let mut node = node;
        node["basic"]["node_key"] = json!("n");
        node["schedule"]
            .as_object_mut()
            .unwrap()
            .remove("estimate_finish_time");
        out.clear();
        build_targets(
            &mut out,
            "s",
            "c",
            "me",
            &id,
            "title",
            &BTreeSet::new(),
            &node,
        );
        assert!(!out[0].baseline.start.is_empty());
        assert!(out[0].read_only_reason.is_some());
        assert!(dates(&json!({})).is_none());
        assert!(dates(&json!({"estimate_start_time":null,"estimate_finish_time":null})).is_some());
    }

    struct NodePages(Vec<Value>);
    #[async_trait]
    impl TodoSource for NodePages {
        async fn describe(&self) -> Result<ConnectionInfo, BackendError> {
            unreachable!()
        }
        async fn close(&mut self) {}
        async fn call_tool(
            &self,
            _: &str,
            args: &Map<String, Value>,
        ) -> Result<ToolResultPayload, BackendError> {
            Ok(ToolResultPayload::from_json(
                self.0[(args["page_num"].as_u64().unwrap() - 1) as usize].clone(),
            ))
        }
    }

    #[test]
    fn node_pagination_accepts_observed_detail_without_pagination_but_rejects_unsafe_pages() {
        let id = WorkItemId {
            project_key: Some("p".into()),
            work_item_type_key: Some("t".into()),
            work_item_id: "1".into(),
        };
        let one = json!({"basic":{"node_key":"n"}});
        let rt = crate::remote::runtime().unwrap();
        assert_eq!(
            rt.block_on(fetch_nodes(
                &NodePages(vec![json!({"detail":[one.clone()]})]),
                &id,
                3
            ))
            .unwrap()
            .len(),
            1
        );
        assert_eq!(rt.block_on(fetch_nodes(
            &NodePages(vec![json!({"list":[one.clone(),one.clone()],"pagination":{"has_more":false}})]), &id, 3
        )).unwrap().len(), 1);
        assert_eq!(rt.block_on(fetch_nodes(
            &NodePages(vec![json!({"list":[{"basic":{"name":"身份不明"}},{"basic":{"name":"身份不明"}}],"pagination":{"has_more":false}})]), &id, 3
        )).unwrap().len(), 1);
        assert!(rt.block_on(fetch_nodes(
            &NodePages(vec![json!({"list":[one.clone(),{"basic":{"node_key":"n","name":"冲突"}}],"pagination":{"has_more":false}})]), &id, 3
        )).is_err());
        assert!(rt
            .block_on(fetch_nodes(
                &NodePages(vec![json!({"list":[one.clone()],"pagination":{}})]),
                &id,
                3
            ))
            .is_err());
        assert!(rt
            .block_on(fetch_nodes(
                &NodePages(vec![
                    json!({"list":[one.clone()],"pagination":{"has_more":true}}),
                    json!({"list":[one.clone()],"pagination":{"has_more":false}})
                ]),
                &id,
                3
            ))
            .is_err());
        assert!(rt
            .block_on(fetch_nodes(
                &NodePages(vec![
                    json!({"list":[{"basic":{"node_key":"n1"}}],"pagination":{"has_more":true}}),
                    json!({"detail":[{"basic":{"node_key":"n2"}}]})
                ]),
                &id,
                3
            ))
            .is_err());
        assert!(rt
            .block_on(fetch_nodes(
                &NodePages(vec![json!({"list":[],"pagination":{"has_more":true}})]),
                &id,
                3
            ))
            .is_err());
        assert!(rt
            .block_on(fetch_nodes(
                &NodePages(vec![json!({"list":[one],"pagination":{"has_more":true}})]),
                &id,
                1
            ))
            .is_err());
    }

    #[test]
    fn sent_auth_receipt_stops_queue_and_preserves_uncertain_guard_and_ledger() {
        for receipt in [
            ToolResultPayload::err("token expired"),
            ToolResultPayload::err("401 Unauthorized"),
            ToolResultPayload {
                structured: Some(json!({"success":false,"error":"invalid_token"})),
                text_blocks: vec!["success".into()],
                is_error: false,
            },
            ToolResultPayload { structured: Some(json!({"code":401,"message":"unauthorized"})), text_blocks: vec!["success".into()], is_error: false },
            ToolResultPayload { structured: None, text_blocks: vec![r#"{"code":401,"message":"unauthorized"}"#.into(), "log_id: abc".into()], is_error: false },
        ] {
            let (session, dir) = fixture();
            let fake = Arc::new(Fake {
                calls: Mutex::new(vec![]),
                fail_detail: AtomicBool::new(false),
                partial_page: AtomicBool::new(false),
                receipts: Mutex::new(vec![receipt]),
            });
            let installed = crate::remote::install_test_client(
                &session.config,
                &session.credential().unwrap(),
                Box::new(fake.clone()),
            );
            let mut plan = writable_plan(&session);
            let first = plan.view.targets[0].clone();
            let mut other = first.clone();
            other.id = "other".into();
            other.identity.node = "other".into();
            plan.view.targets.push(other);
            let sid = plan.view.session_id.clone();
            let result = plan
                .sync(&session, &sid, vec![change(&first.id), change("other")])
                .unwrap();
            assert_eq!(
                result.targets.iter().map(|r| r.result).collect::<Vec<_>>(),
                vec!["uncertain", "unsent"]
            );
            assert_eq!(result.write_requests, 1);
            assert!(plan.sync(&session, &sid, vec![change(&first.id)]).is_err());
            let records = session.store.recent_actions("p|story|1", 10).unwrap();
            assert_eq!(records.len(), 1);
            assert_eq!(records[0].status, "unknown");
            assert!(!records[0].verified);
            assert!(!format!("{:?}", records[0]).contains("fixture-token"));
            drop(installed);
            drop(session);
            std::fs::remove_dir_all(dir).unwrap();
        }
        assert!(!explicit_auth_failure(&ToolResultPayload {
            structured: Some(json!({"success":false,"error":"permission denied"})),
            text_blocks: vec!["token expired".into()],
            is_error: false
        }));
        assert!(explicit_auth_failure(&ToolResultPayload {
            structured: Some(json!({"code":"invalid_token"})),
            text_blocks: vec![],
            is_error: false,
        }));
        for text in ["request 401 failed", r#"{"message":"401"}"#, r#"{"code":"401"}"#, r#"{"code":401} trailing"#] {
            assert!(!explicit_auth_failure(&ToolResultPayload::from_text(text)), "{text}");
        }
        assert!(!explicit_auth_failure(&ToolResultPayload {
            structured: Some(json!({"code":403})),
            text_blocks: vec![r#"{"code":401}"#.into()],
            is_error: false,
        }));
    }

    #[test]
    fn sent_rpc_errors_stop_only_for_explicit_auth_and_preserve_uncertainty() {
        for (error, stop) in [
            (BackendError::Tool { tool: "update_node".into(), code: Some(-32000), message: "invalid_token".into() }, true),
            (BackendError::Tool { tool: "update_node".into(), code: Some(-32000), message: "Token expired".into() }, true),
            (BackendError::Tool { tool: "update_node".into(), code: Some(401), message: "unauthorized".into() }, true),
            (BackendError::Tool { tool: "update_node".into(), code: Some(403), message: "permission denied".into() }, false),
            (BackendError::Tool { tool: "update_node".into(), code: Some(400), message: "business error".into() }, false),
            (BackendError::Tool { tool: "update_node".into(), code: Some(-32000), message: "permission denied".into() }, false),
        ] {
            let (session, dir) = fixture();
            let fake = Arc::new(Fake { calls: Mutex::new(vec![]), fail_detail: AtomicBool::new(false), partial_page: AtomicBool::new(false), receipts: Mutex::new(vec![ToolResultPayload::from_text("success")]) });
            let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(ErrorThenSuccess { fake: fake.clone(), error: Mutex::new(Some(error)) }));
            let mut plan = writable_plan(&session);
            let first = plan.view.targets[0].clone();
            let mut same = first.clone(); same.id = "same".into();
            let mut other = first.clone(); other.id = "other".into(); other.identity.node = "other".into();
            plan.view.targets.extend([same, other]);
            let sid = plan.view.session_id.clone();
            let result = plan.sync(&session, &sid, vec![change(&first.id), change("same"), change("other")]).unwrap();
            assert_eq!(result.targets.iter().map(|r| r.result).collect::<Vec<_>>(), vec!["uncertain", "unsent", if stop { "unsent" } else { "accepted" }]);
            assert_eq!(result.write_requests, if stop { 1 } else { 2 });
            assert!(plan.sync(&session, &sid, vec![change(&first.id)]).is_err());
            let records = session.store.recent_actions("p|story|1", 10).unwrap();
            assert!(records.iter().any(|record| record.target == "n1|me" && record.status == "unknown" && !record.verified));
            drop(installed); drop(session); std::fs::remove_dir_all(dir).unwrap();
        }
    }

    #[test]
    fn transport_permission_rejection_keeps_baseline_and_allows_queue_and_retry() {
        let (session, dir) = fixture();
        let fake = Arc::new(Fake { calls: Mutex::new(vec![]), fail_detail: AtomicBool::new(false), partial_page: AtomicBool::new(false), receipts: Mutex::new(vec![ToolResultPayload::from_text("success"), ToolResultPayload::from_text("success"), ToolResultPayload::from_text("success")]) });
        let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(ErrorThenSuccess { fake: fake.clone(), error: Mutex::new(Some(BackendError::Permission { detail: "insufficient scope".into() })) }));
        let mut plan = writable_plan(&session);
        let first = plan.view.targets[0].clone();
        let mut same = first.clone(); same.id = "same".into();
        let mut other = first.clone(); other.id = "other".into(); other.identity.node = "other".into();
        plan.view.targets.extend([same, other]);
        let sid = plan.view.session_id.clone();
        let result = plan.sync(&session, &sid, vec![change(&first.id), change("same"), change("other")]).unwrap();
        assert_eq!(result.targets.iter().map(|r| r.result).collect::<Vec<_>>(), vec!["failed", "accepted", "accepted"]);
        assert_eq!(result.write_requests, 3);
        assert_eq!(plan.view.targets[0].baseline, first.baseline);
        assert!(session.store.recent_actions("p|story|1", 10).unwrap().iter().any(|record| record.target == "n1|me" && record.status == "failed" && record.detail.as_deref() == Some("请求被权限拒绝")));
        let retry = plan.sync(&session, &sid, vec![change(&first.id)]).unwrap();
        assert_eq!(retry.targets[0].result, "accepted");
        assert_eq!(retry.write_requests, 1);
        drop(installed); drop(session); std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn existing_pending_workflow_action_prevents_planner_write() {
        let (session, dir) = fixture();
        let fake = Arc::new(Fake {
            calls: Mutex::new(vec![]),
            fail_detail: AtomicBool::new(false),
            partial_page: AtomicBool::new(false),
            receipts: Mutex::new(vec![]),
        });
        let installed = crate::remote::install_test_client(
            &session.config,
            &session.credential().unwrap(),
            Box::new(fake.clone()),
        );
        let mut plan = writable_plan(&session);
        let id = plan.view.targets[0].id.clone();
        let sid = plan.view.session_id.clone();
        assert!(session
            .store
            .begin_action(&crate::store::ActionRecord {
                request_id: "workflow-pending".into(),
                item_id: "p|story|1".into(),
                action_kind: "node_schedule".into(),
                target: "n1".into(),
                version: "v".into(),
                status: "pending".into(),
                verified: false,
                detail: None,
                created_at: 0,
                finished_at: None
            })
            .unwrap());
        let before = fake.calls.lock().unwrap().len();
        let result = plan.sync(&session, &sid, vec![change(&id)]).unwrap();
        assert_eq!(result.targets[0].result, "unsent");
        assert_eq!(result.write_requests, 0);
        assert_eq!(fake.calls.lock().unwrap().len(), before);
        drop(installed);
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn planner_waits_for_same_item_workflow_lock() {
        let (session, dir) = fixture();
        let fake = Arc::new(Fake {
            calls: Mutex::new(vec![]),
            fail_detail: AtomicBool::new(false),
            partial_page: AtomicBool::new(false),
            receipts: Mutex::new(vec![ToolResultPayload::from_text("success")]),
        });
        let installed = crate::remote::install_test_client(
            &session.config,
            &session.credential().unwrap(),
            Box::new(fake.clone()),
        );
        let mut plan = writable_plan(&session);
        let sid = plan.view.session_id.clone();
        let target = plan.view.targets[0].id.clone();
        let id = WorkItemId {
            project_key: Some("p".into()),
            work_item_type_key: Some("story".into()),
            work_item_id: "1".into(),
        };
        let guard = crate::remote::runtime()
            .unwrap()
            .block_on(crate::item_access::lock_workflow(&session.store, &id));
        let (tx, rx) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || {
            tx.send(
                plan.sync(&session, &sid, vec![change(&target)])
                    .unwrap()
                    .targets[0]
                    .result,
            )
            .unwrap();
            session
        });
        assert!(rx
            .recv_timeout(std::time::Duration::from_millis(150))
            .is_err());
        assert!(!fake
            .calls
            .lock()
            .unwrap()
            .iter()
            .any(|(tool, _)| tool == "update_node"));
        drop(guard);
        assert_eq!(
            rx.recv_timeout(std::time::Duration::from_secs(10)).unwrap(),
            "accepted"
        );
        let session = thread.join().unwrap();
        drop(installed);
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn planner_lock_timeout_skips_unsent_target_and_processes_other_item() {
        let (session, dir) = fixture();
        let fake = Arc::new(Fake { calls: Mutex::new(vec![]), fail_detail: AtomicBool::new(false), partial_page: AtomicBool::new(false), receipts: Mutex::new(vec![ToolResultPayload::from_text("success"), ToolResultPayload::from_text("success")]) });
        let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(fake.clone()));
        let mut plan = writable_plan(&session);
        let first = plan.view.targets[0].clone();
        let mut other = first.clone(); other.id = "other-item".into(); other.identity.item = "2".into();
        plan.view.targets.push(other);
        let sid = plan.view.session_id.clone();
        let id = WorkItemId { project_key: Some("p".into()), work_item_type_key: Some("story".into()), work_item_id: "1".into() };
        let guard = crate::remote::runtime().unwrap().block_on(crate::item_access::lock_workflow(&session.store, &id));
        let result = plan.sync_with_lock_timeout(&session, &sid, vec![change(&first.id), change("other-item")], std::time::Duration::from_millis(50)).unwrap();
        assert_eq!(result.targets.iter().map(|r| r.result).collect::<Vec<_>>(), vec!["unsent", "accepted"]);
        assert_eq!(result.write_requests, 1);
        assert_eq!(plan.view.targets[0].baseline, first.baseline);
        assert!(session.store.recent_actions("p|story|1", 10).unwrap().is_empty());
        drop(guard);
        let retry = plan.sync_with_lock_timeout(&session, &sid, vec![change(&first.id)], std::time::Duration::from_secs(1)).unwrap();
        assert_eq!(retry.targets[0].result, "accepted");
        drop(installed); drop(session); std::fs::remove_dir_all(dir).unwrap();
    }
}
