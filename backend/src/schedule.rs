//! 会话内事项安排。入口读取已启用的个人待办及节点，写入不做隐式重读或重试。
use crate::{
    api::Session,
    detail,
    error::{BackendError, ErrorKind},
    mcp::{parse_tool_json, TodoSource},
    model::domain::WorkItemId,
};
use chrono::{DateTime, FixedOffset, NaiveDate, TimeZone};
use futures_util::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
pub struct Target {
    pub id: String,
    pub node_id: String,
    pub identity: Identity,
    pub title: String,
    pub node_name: String,
    pub node_status: String,
    pub node_order: usize,
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
    #[serde(skip_serializing_if = "String::is_empty")]
    pub title: String,
    pub sources: Vec<String>,
    pub message: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct LoadResult {
    pub session_id: String,
    pub current_user: String,
    pub current_user_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_user_avatar: Option<String>,
    pub people_loaded: bool,
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

#[derive(Default)]
struct LoadState {
    processed_items: HashSet<(String, String, String)>,
    schedule_configs: BTreeMap<(String, String), Result<bool, ()>>,
    detail_names: BTreeMap<(String, String), String>,
    detail_avatars: BTreeMap<(String, String), String>,
}

pub struct ScheduleSession {
    pub view: LoadResult,
    fingerprint: String,
    frozen: HashSet<String>,
    frozen_nodes: HashSet<(String, String, String, String)>,
    deferred_targets: Vec<Target>,
    processed_items: HashSet<(String, String, String)>,
    schedule_configs: BTreeMap<(String, String), Result<bool, ()>>,
    detail_names: BTreeMap<(String, String), String>,
    detail_avatars: BTreeMap<(String, String), String>,
    next_target_seq: usize,
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
    if v.is_null() {
        return Some(String::new());
    }
    if let Some(s) = v.as_str() {
        let trimmed = s.trim();
        if trimmed.is_empty() || trimmed == "0" {
            return Some(String::new());
        }
        if date_ms(trimmed).is_some() {
            return Some(trimmed.to_owned());
        }
        let ms = trimmed.parse::<i64>().ok()?;
        if ms <= 0 {
            return (ms == 0).then(String::new);
        }
        let offset = FixedOffset::east_opt(8 * 3600).unwrap();
        return Some(
            DateTime::from_timestamp_millis(ms)?
                .with_timezone(&offset)
                .format("%Y-%m-%d")
                .to_string(),
        );
    }
    let ms = v.as_i64()?;
    if ms <= 0 {
        return (ms == 0).then(String::new);
    }
    let offset = FixedOffset::east_opt(8 * 3600).unwrap();
    Some(
        DateTime::from_timestamp_millis(ms)?
            .with_timezone(&offset)
            .format("%Y-%m-%d")
            .to_string(),
    )
}
fn dates(v: &Value) -> Option<Dates> {
    if v.is_null() {
        return Some(Dates {
            start: String::new(),
            end: String::new(),
        });
    }
    let obj = v.as_object()?;
    let start = match obj.get("estimate_start_time") {
        Some(val) => date(val)?,
        None => String::new(),
    };
    let end = match obj.get("estimate_finish_time") {
        Some(val) => date(val)?,
        None => String::new(),
    };
    Some(Dates { start, end })
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
    let names = ["name", "name_cn", "username"]
        .iter()
        .map(|k| txt(&v[*k]))
        .filter(|s| !s.trim().is_empty())
        .collect::<Vec<_>>();
    names
        .iter()
        .find(|name| !needs_real_name(&key, name))
        .or_else(|| names.iter().find(|name| **name != key))
        .or_else(|| names.first())
        .cloned()
        .unwrap_or_default()
}
fn user_avatar(v: &Value) -> Option<String> {
    [
        v.get("avatar_url"),
        v.pointer("/avatar/avatar_72"),
        v.pointer("/avatar/avatar_240"),
        v.pointer("/avatar/avatar_origin"),
        v.get("avatar"),
    ]
    .into_iter()
    .flatten()
    .filter_map(Value::as_str)
    .map(str::trim)
    .find(|s| s.starts_with("http://") || s.starts_with("https://"))
    .map(str::to_owned)
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
            node_status: String::new(),
            node_order: 0,
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
        Self::load_internal(session, false)
    }

    pub fn load_mine(session: &Session) -> Result<Self, BackendError> {
        Self::load_internal(session, true)
    }

    pub fn load_all(session: &Session) -> Result<Self, BackendError> {
        let mut schedule = Self::load_mine(session)?;
        if session.credential().is_ok() {
            let sid = schedule.view.session_id.clone();
            schedule.load_people(session, &sid)?;
        } else {
            schedule.view.people_loaded = true;
        }
        Ok(schedule)
    }

    fn load_internal(session: &Session, filter_mine: bool) -> Result<Self, BackendError> {
        let fingerprint = fingerprint(session).unwrap_or_default();
        let sid = format!("{}-{}", crate::sync::now_ms(), NEXT.fetch_add(1, Ordering::Relaxed));
        let tables = session.config.source_tables()?;
        let mut sources: Vec<SourceStatus> = session.config.sources.iter()
            .filter(|source| source.enabled && matches!(source.kind, crate::model::source::SourceKind::PersonalTodo))
            .map(|source| SourceStatus { id: source.id.clone(),
                name: tables.iter().find(|table| table.id == source.id)
                    .and_then(|table| table.display_name.clone()).unwrap_or_else(|| source.id.clone()),
                complete: false, error: None, pages: 0 }).collect();
        let mut view = LoadResult {
            session_id: sid,
            current_user: String::new(),
            current_user_name: String::new(),
            current_user_avatar: None,
            people_loaded: !filter_mine,
            account_error: None,
            read_at_ms: crate::sync::now_ms(),
            sources: Vec::new(),
            targets: Vec::new(),
            failed_items: 0,
            item_errors: Vec::new(),
            read_requests: 0,
        };
        let mut state = LoadState::default();
        let mut deferred_targets = Vec::new();
        let mut failed_extra_sources = BTreeMap::new();
        match session.credential() {
            Ok(credential) => {
                let client = crate::remote::shared(&session.config, &credential);
                let count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
                crate::remote::runtime()?.block_on(crate::mcp::count_schedule_rpcs(
                    count.clone(),
                    async {
                        load_remote(
                            session,
                            client.as_ref(),
                            &fingerprint,
                            &mut view,
                            &mut sources,
                            &mut state,
                        )
                        .await?;
                        if filter_mine {
                            if !view.current_user.trim().is_empty() {
                                let mut extra = Vec::new();
                                expand_cached_non_todo_items(
                                    session,
                                    client.clone(),
                                    &fingerprint,
                                    &view.session_id,
                                    &view.current_user,
                                    true,
                                    &mut state.processed_items,
                                    &mut state.schedule_configs,
                                    &mut state.detail_names,
                                    &mut state.detail_avatars,
                                    &mut view.item_errors,
                                    &mut failed_extra_sources,
                                    &mut extra,
                                )
                                .await;
                                view.failed_items = view.item_errors.len();
                                if !extra.is_empty() {
                                    view.targets.extend(extra);
                                    finish_person_names_with_details(
                                        session,
                                        &view.current_user,
                                        &view.current_user_name,
                                        view.current_user_avatar.as_deref(),
                                        &state.detail_names,
                                        &state.detail_avatars,
                                        &mut view.targets,
                                    );
                                }
                            }
                            let all = std::mem::take(&mut view.targets);
                            for mut target in all {
                                if is_mine_target(&target, &view.current_user) {
                                    target.id = format!("{}:{}", view.session_id, view.targets.len());
                                    view.targets.push(target);
                                } else {
                                    deferred_targets.push(target);
                                }
                            }
                            backfill_missing_people_remote(
                                session,
                                client.as_ref(),
                                &mut view,
                                &mut state.detail_names,
                                &mut state.detail_avatars,
                            )
                            .await;
                        }
                        Ok::<(), BackendError>(())
                    },
                ))?;
                view.read_requests = count.load(Ordering::Relaxed);
            }
            Err(_) => {
                view.account_error = Some("未能确认当前飞书账号，请检查连接后重试".into());
                for source in &mut sources {
                    source.error = Some("无法读取个人待办，请检查连接后重试".into());
                }
            }
        }
        view.sources = sources;
        if filter_mine {
            ensure_target_sources_in_view(
                session,
                &mut view.sources,
                &view.targets,
                &failed_extra_sources,
            );
        }
        view.read_at_ms = crate::sync::now_ms();
        let next_target_seq = view.targets.len();
        Ok(Self {
            view,
            fingerprint,
            frozen: HashSet::new(),
            frozen_nodes: HashSet::new(),
            deferred_targets,
            processed_items: state.processed_items,
            schedule_configs: state.schedule_configs,
            detail_names: state.detail_names,
            detail_avatars: state.detail_avatars,
            next_target_seq,
        })
    }

    pub fn load_people(&mut self, session: &Session, session_id: &str) -> Result<(), BackendError> {
        if self.view.session_id != session_id || fingerprint(session)? != self.fingerprint {
            return Err(BackendError::conflict("排期会话或连接已变化，请重新读取"));
        }
        if self.view.people_loaded {
            return Ok(());
        }
        let credential = session.credential()?;
        let client = crate::remote::shared(&session.config, &credential);
        let count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        crate::remote::runtime()?.block_on(crate::mcp::count_schedule_rpcs(count.clone(), async {
            for mut target in std::mem::take(&mut self.deferred_targets) {
                target.id = format!("{}:{}", self.view.session_id, self.next_target_seq);
                self.next_target_seq += 1;
                self.view.targets.push(target);
            }
            let mut extra_targets = Vec::new();
            let mut failed_extra_sources = BTreeMap::new();
            expand_cached_non_todo_items(
                session,
                client.clone(),
                &self.fingerprint,
                &self.view.session_id,
                &self.view.current_user,
                false,
                &mut self.processed_items,
                &mut self.schedule_configs,
                &mut self.detail_names,
                &mut self.detail_avatars,
                &mut self.view.item_errors,
                &mut failed_extra_sources,
                &mut extra_targets,
            )
            .await;
            self.view.failed_items = self.view.item_errors.len();
            for mut target in extra_targets {
                target.id = format!("{}:{}", self.view.session_id, self.next_target_seq);
                self.next_target_seq += 1;
                self.view.targets.push(target);
            }
            ensure_target_sources_in_view(
                session,
                &mut self.view.sources,
                &self.view.targets,
                &failed_extra_sources,
            );
            finish_person_names_with_details(
                session,
                &self.view.current_user,
                &self.view.current_user_name,
                self.view.current_user_avatar.as_deref(),
                &self.detail_names,
                &self.detail_avatars,
                &mut self.view.targets,
            );
            backfill_missing_people_remote(
                session,
                client.as_ref(),
                &mut self.view,
                &mut self.detail_names,
                &mut self.detail_avatars,
            )
            .await;
            Ok::<(), BackendError>(())
        }))?;
        self.view.people_loaded = true;
        self.view.read_requests += count.load(Ordering::Relaxed);
        self.view.read_at_ms = crate::sync::now_ms();
        Ok(())
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
                let mut patch = json!({
                    "clear_schedule": false,
                    "is_auto": false,
                    "estimate_start_date": start,
                    "estimate_end_date": end,
                });
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

fn is_state_flow_row(row: &Value) -> bool {
    row.get("state_info").is_some_and(Value::is_object)
        && row.get("node_info").is_none_or(Value::is_null)
}

fn is_state_flow_detail(data: &Value) -> bool {
    data["work_item_attribute"]["work_item_mod"].as_str() == Some("状态流")
        || data["flow_kind"].as_str() == Some("state")
        || data["work_item_attribute"]["flow_kind"].as_str() == Some("state")
}

fn is_completed_or_aborted_detail(data: &Value) -> bool {
    let attr = &data["work_item_attribute"];
    if attr["is_aborted"].as_bool() == Some(true)
        || attr["abort_reason"].as_str().is_some_and(|s| !s.trim().is_empty())
        || attr["finish_status"].as_bool() == Some(true)
        || attr["finish_status"].as_str() == Some("true")
    {
        return true;
    }
    data["work_item_fields"]
        .as_array()
        .into_iter()
        .flatten()
        .any(|f| {
            f["key"] == "finish_status"
                && (f["value"].as_bool() == Some(true) || f["value"].as_str() == Some("true"))
        })
}

fn is_mine_target(target: &Target, current_user: &str) -> bool {
    current_user.is_empty()
        || target.source_aggregate
        || target.unknown_owner
        || target.identity.owner.as_deref() == Some(current_user)
        || target.owners.iter().any(|p| p.id == current_user)
}

async fn load_remote(
    session: &Session,
    client: &dyn TodoSource,
    fingerprint: &str,
    view: &mut LoadResult,
    statuses: &mut [SourceStatus],
    state: &mut LoadState,
) -> Result<(), BackendError> {
    let account = client.call_tool("search_user_info", json!({"user_keys":["current_login_user()"]}).as_object().unwrap()).await
        .and_then(|payload| parse_tool_json("search_user_info", &payload));
    if let Ok(value) = account {
        if let Some(users) = value.as_array().filter(|users| users.len() == 1) {
            view.current_user = txt(&users[0]["user_key"]);
            view.current_user_name = user_name(&users[0]);
            view.current_user_avatar = user_avatar(&users[0]);
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
                let entry = items.entry((project, kind, item)).or_insert_with(|| (id, title.clone(), BTreeSet::new(), Vec::new()));
                if entry.1.is_empty() && !title.is_empty() {
                    entry.1 = title;
                }
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
    let cached_flow_kinds: HashMap<(String, String, String), crate::model::domain::FlowKind> = session
        .store
        .query_items(&crate::store::ItemFilter {
            limit: Some(i64::MAX),
            ..Default::default()
        })
        .unwrap_or_default()
        .into_iter()
        .map(|row| (row.item.id.key_tuple(), row.item.flow.kind))
        .collect();
    let mut todo_items = Vec::new();
    for (key_tuple, (id, title, sources, rows)) in items {
        state.processed_items.insert(key_tuple.clone());
        let cached_detail = session.store.item_detail(&id).ok().flatten();
        if rows
            .iter()
            .any(|(_, row)| is_state_flow_row(row) || row["is_completed"].as_bool() == Some(true))
            || cached_detail
                .as_ref()
                .is_some_and(|d| is_state_flow_detail(&d.data) || is_completed_or_aborted_detail(&d.data))
            || cached_flow_kinds.get(&key_tuple) == Some(&crate::model::domain::FlowKind::State)
        {
            continue;
        }
        todo_items.push((id, title, sources, rows, cached_detail));
    }
    let fetched = stream::iter(todo_items)
        .map(|(id, title, sources, rows, cached_detail)| async move {
            let nodes = fetch_nodes(client, &id, session.config.max_pages).await;
            (id, title, sources, rows, cached_detail, nodes)
        })
        .buffered(4)
        .collect::<Vec<_>>()
        .await;
    for (id, mut title, sources, rows, cached_detail, nodes_result) in fetched {
        if let Some(detail) = cached_detail.as_ref() {
            if title.trim().is_empty() {
                title = txt(&detail.data["work_item_attribute"]["work_item_name"]);
            }
        }
        match nodes_result {
            Ok(nodes) => {
                if nodes.is_empty() {
                    let detail = match cached_detail {
                        Some(detail) => Some(detail),
                        None => crate::detail::fetch(client, &id, session.config.max_pages).await.ok(),
                    };
                    if detail.as_ref().is_some_and(|d| {
                        is_state_flow_detail(&d.data) || is_completed_or_aborted_detail(&d.data)
                    }) {
                        continue;
                    }
                    if let Some(d) = &detail {
                        if title.trim().is_empty() {
                            title = txt(&d.data["work_item_attribute"]["work_item_name"]);
                        }
                    }
                    for status in statuses.iter_mut().filter(|status| sources.contains(&status.id)) {
                        status.complete = false;
                        status.error = Some("未取得该待办的节点排期，请重试".into());
                    }
                    build_aggregate_targets(&mut view.targets, &view.session_id, &id, &rows, "节点详情为空，来源排期仅供查看");
                    view.item_errors.push(FailedItem {
                        project: id.project_key.clone().unwrap_or_default(),
                        r#type: id.work_item_type_key.clone().unwrap_or_default(),
                        item: id.work_item_id.clone(),
                        title: title.clone(),
                        sources: sources.iter().cloned().collect(),
                        message: "未取得该待办的节点排期，请重试".into(),
                    });
                    continue;
                }
                let project = id.project_key.as_deref().unwrap_or_default();
                let kind = id.work_item_type_key.as_deref().unwrap_or_default();
                let config_key = (project.to_owned(), kind.to_owned());
                if !state.schedule_configs.contains_key(&config_key) {
                    let config = fetch_node_schedule_config(
                        client,
                        project,
                        kind,
                        session.config.max_pages,
                    )
                    .await;
                    state
                        .schedule_configs
                        .insert(config_key.clone(), config.map_err(|_| ()));
                }
                let config = *state.schedule_configs.get(&config_key).unwrap();
                if config.is_err() {
                    for status in statuses.iter_mut().filter(|status| sources.contains(&status.id)) {
                        status.complete = false;
                        status.error = Some("节点排期字段配置读取未完成，请重试".into());
                    }
                }
                let detail = match cached_detail {
                    Some(detail) => Some(detail),
                    None => crate::detail::fetch(client, &id, session.config.max_pages).await.ok(),
                };
                if let Some(detail) = &detail {
                    if title.trim().is_empty() {
                        title = txt(&detail.data["work_item_attribute"]["work_item_name"]);
                    }
                    record_detail_people(
                        project,
                        &detail.data,
                        &mut state.detail_names,
                        &mut state.detail_avatars,
                    );
                }
                let item_url = detail
                    .as_ref()
                    .and_then(|d| crate::workflow::item_url(&session.config.endpoint, &id, &d.data));
                let first = view.targets.len();
                let nodes_incomplete = nodes.iter().any(node_data_incomplete);
                for (node_order, node) in nodes.into_iter().enumerate() {
                    build_targets_with_order(&mut view.targets, &view.session_id, fingerprint, &view.current_user, &id,
                        if title.is_empty() { &id.work_item_id } else { &title }, &sources, &node, node_order);
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
                    view.item_errors.push(FailedItem {
                        project: id.project_key.clone().unwrap_or_default(),
                        r#type: id.work_item_type_key.clone().unwrap_or_default(),
                        item: id.work_item_id.clone(),
                        title: title.clone(),
                        sources: sources.iter().cloned().collect(),
                        message: "部分节点身份或排期数据不完整，仅显示可确认内容".into(),
                    });
                }
            },
            Err(err) => {
                if cached_detail.as_ref().is_some_and(|d| {
                    is_state_flow_detail(&d.data) || is_completed_or_aborted_detail(&d.data)
                }) {
                    continue;
                }
                if matches!(err.kind(), ErrorKind::Tool | ErrorKind::Parse) {
                    let detail = match cached_detail {
                        Some(detail) => Some(detail),
                        None => crate::detail::fetch(client, &id, session.config.max_pages).await.ok(),
                    };
                    if detail.as_ref().is_some_and(|d| {
                        is_state_flow_detail(&d.data) || is_completed_or_aborted_detail(&d.data)
                    }) {
                        continue;
                    }
                    if let Some(d) = &detail {
                        if title.trim().is_empty() {
                            title = txt(&d.data["work_item_attribute"]["work_item_name"]);
                        }
                    }
                } else if let Some(d) = &cached_detail {
                    if title.trim().is_empty() {
                        title = txt(&d.data["work_item_attribute"]["work_item_name"]);
                    }
                }
                for status in statuses.iter_mut().filter(|status| sources.contains(&status.id)) {
                    status.complete = false;
                    status.error = Some("部分事项节点读取未完成，请重试".into());
                }
                build_aggregate_targets(&mut view.targets, &view.session_id, &id, &rows, "节点读取未完成，来源排期仅供查看");
                view.item_errors.push(FailedItem {
                    project: id.project_key.unwrap_or_default(),
                    r#type: id.work_item_type_key.unwrap_or_default(),
                    item: id.work_item_id,
                    title,
                    sources: sources.into_iter().collect(),
                    message: "节点读取未完成，请重试".into(),
                });
            }
        }
    }
    view.failed_items = view.item_errors.len();
    finish_person_names_with_details(
        session,
        &view.current_user,
        &view.current_user_name,
        view.current_user_avatar.as_deref(),
        &state.detail_names,
        &state.detail_avatars,
        &mut view.targets,
    );
    Ok(())
}

async fn expand_cached_non_todo_items(
    session: &Session,
    client: std::sync::Arc<crate::remote::Remote>,
    fingerprint: &str,
    session_id: &str,
    current_user: &str,
    only_mine_related: bool,
    processed_items: &mut HashSet<(String, String, String)>,
    schedule_configs: &mut BTreeMap<(String, String), Result<bool, ()>>,
    detail_names: &mut BTreeMap<(String, String), String>,
    detail_avatars: &mut BTreeMap<(String, String), String>,
    item_errors: &mut Vec<FailedItem>,
    failed_sources: &mut BTreeMap<String, String>,
    out_targets: &mut Vec<Target>,
) {
    let mut allowed_sources: BTreeMap<String, Option<crate::store::TypeScope>> = BTreeMap::new();
    for source in &session.config.sources {
        if source.enabled
            && !matches!(source.kind, crate::model::source::SourceKind::PersonalTodo)
            && source.ensure_executable().is_ok()
        {
            if let Ok(scope) = session.source_type_scope(&source.id) {
                allowed_sources.insert(source.id.clone(), scope);
            }
        }
    }
    if allowed_sources.is_empty() {
        return;
    }
    let cached_items = session
        .store
        .query_items(&crate::store::ItemFilter {
            limit: Some(i64::MAX),
            ..Default::default()
        })
        .unwrap_or_default();
    let mut extra_items = Vec::new();
    for cached in cached_items {
        let id = cached.item.id.clone();
        let (project, kind, item_num) = id.key_tuple();
        if project.trim().is_empty() || kind.trim().is_empty() || item_num.trim().is_empty() {
            continue;
        }
        let sources: BTreeSet<String> = cached
            .source_ids
            .iter()
            .filter(|sid| {
                allowed_sources
                    .get(*sid)
                    .is_some_and(|scope| scope.as_ref().is_none_or(|s| s.allows(&project, &kind)))
            })
            .cloned()
            .collect();
        if sources.is_empty() {
            continue;
        }
        if processed_items.contains(&(project.clone(), kind.clone(), item_num.clone())) {
            continue;
        }
        if cached.is_completed == Some(true)
            || cached.item.flow.kind == crate::model::domain::FlowKind::State
        {
            processed_items.insert((project, kind, item_num));
            continue;
        }
        let cached_detail = session.store.item_detail(&id).ok().flatten();
        if cached_detail.as_ref().is_some_and(|d| {
            is_state_flow_detail(&d.data) || is_completed_or_aborted_detail(&d.data)
        }) {
            processed_items.insert((project, kind, item_num));
            continue;
        }
        if only_mine_related {
            let related = !current_user.trim().is_empty()
                && (cached.item.raw_json.contains(current_user)
                    || cached_detail
                        .as_ref()
                        .is_some_and(|d| d.data.to_string().contains(current_user)));
            if !related {
                continue;
            }
        }
        processed_items.insert((project, kind, item_num));
        extra_items.push((
            id,
            cached.item.name.unwrap_or_default(),
            sources,
            cached_detail,
        ));
    }
    let max_pages = session.config.max_pages;
    let fetched_extra = stream::iter(extra_items)
        .map(|(id, title, sources, cached_detail)| {
            let client = client.clone();
            async move {
                let nodes = fetch_nodes(client.as_ref(), &id, max_pages).await;
                (id, title, sources, cached_detail, nodes)
            }
        })
        .buffered(4)
        .collect::<Vec<_>>()
        .await;
    for (id, mut title, sources, cached_detail, nodes_result) in fetched_extra {
        let nodes = match nodes_result {
            Ok(nodes) if !nodes.is_empty() => nodes,
            empty_or_err => {
                let should_check_detail = match &empty_or_err {
                    Ok(_) => true,
                    Err(err) => matches!(err.kind(), ErrorKind::Tool | ErrorKind::Parse),
                };
                let detail = match cached_detail {
                    Some(d) => Some(d),
                    None if should_check_detail => {
                        crate::detail::fetch(client.as_ref(), &id, session.config.max_pages)
                            .await
                            .ok()
                    }
                    None => None,
                };
                if detail.as_ref().is_some_and(|d| {
                    is_state_flow_detail(&d.data) || is_completed_or_aborted_detail(&d.data)
                }) {
                    continue;
                }
                if let Some(d) = &detail {
                    if title.trim().is_empty() {
                        title = txt(&d.data["work_item_attribute"]["work_item_name"]);
                    }
                }
                for sid in &sources {
                    failed_sources
                        .insert(sid.clone(), "部分事项节点读取未完成，请重试".into());
                }
                let message = if empty_or_err.is_ok() {
                    "未取得该事项的节点排期，请重试"
                } else {
                    "节点读取未完成，请重试"
                };
                item_errors.push(FailedItem {
                    project: id.project_key.unwrap_or_default(),
                    r#type: id.work_item_type_key.unwrap_or_default(),
                    item: id.work_item_id,
                    title,
                    sources: sources.into_iter().collect(),
                    message: message.into(),
                });
                continue;
            }
        };
        let project = id.project_key.as_deref().unwrap_or_default();
        let kind = id.work_item_type_key.as_deref().unwrap_or_default();
        let config_key = (project.to_owned(), kind.to_owned());
        if !schedule_configs.contains_key(&config_key) {
            let config = fetch_node_schedule_config(
                client.as_ref(),
                project,
                kind,
                session.config.max_pages,
            )
            .await;
            schedule_configs.insert(config_key.clone(), config.map_err(|_| ()));
        }
        let config = *schedule_configs.get(&config_key).unwrap();
        if config.is_err() {
            for sid in &sources {
                failed_sources
                    .insert(sid.clone(), "节点排期字段配置读取未完成，请重试".into());
            }
        }
        let detail = match cached_detail {
            Some(d) => Some(d),
            None => crate::detail::fetch(client.as_ref(), &id, session.config.max_pages)
                .await
                .ok(),
        };
        if let Some(detail) = &detail {
            if title.trim().is_empty() {
                title = txt(&detail.data["work_item_attribute"]["work_item_name"]);
            }
            record_detail_people(project, &detail.data, detail_names, detail_avatars);
        }
        let item_url = detail
            .as_ref()
            .and_then(|d| crate::workflow::item_url(&session.config.endpoint, &id, &d.data));
        let nodes_incomplete = nodes.iter().any(node_data_incomplete);
        let mut temp = Vec::new();
        for (node_order, node) in nodes.into_iter().enumerate() {
            build_targets_with_order(
                &mut temp,
                session_id,
                fingerprint,
                current_user,
                &id,
                if title.is_empty() {
                    &id.work_item_id
                } else {
                    &title
                },
                &sources,
                &node,
                node_order,
            );
        }
        let has_incomplete_target = temp.iter().any(incomplete_target);
        for mut target in temp {
            target.item_url = item_url.clone();
            if target.read_only_reason.is_none() && !matches!(config, Ok(true)) {
                target.read_only_reason = Some(
                    if config.is_err() {
                        "节点排期配置读取失败，仅供查看"
                    } else {
                        "未找到节点排期字段配置，仅供查看"
                    }
                    .into(),
                );
            }
            out_targets.push(target);
        }
        if nodes_incomplete || has_incomplete_target {
            for sid in &sources {
                failed_sources
                    .insert(sid.clone(), "部分节点身份或排期数据不完整，请重试".into());
            }
            item_errors.push(FailedItem {
                project: id.project_key.clone().unwrap_or_default(),
                r#type: id.work_item_type_key.clone().unwrap_or_default(),
                item: id.work_item_id.clone(),
                title: title.clone(),
                sources: sources.iter().cloned().collect(),
                message: "部分节点身份或排期数据不完整，仅显示可确认内容".into(),
            });
        }
    }
}

fn ensure_target_sources_in_view(
    session: &Session,
    view_sources: &mut Vec<SourceStatus>,
    targets: &[Target],
    failed_sources: &BTreeMap<String, String>,
) {
    let tables = session.config.source_tables().unwrap_or_default();
    let mut seen: BTreeSet<String> = view_sources.iter().map(|s| s.id.clone()).collect();
    let all_sids = targets
        .iter()
        .flat_map(|t| t.sources.iter())
        .chain(failed_sources.keys());
    for sid in all_sids {
        if !seen.insert(sid.clone()) {
            continue;
        }
        let name = tables
            .iter()
            .find(|t| &t.id == sid)
            .and_then(|t| t.display_name.clone())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| sid.clone());
        view_sources.push(SourceStatus {
            id: sid.clone(),
            name,
            complete: true,
            error: None,
            pages: 1,
        });
    }
    for source in view_sources.iter_mut() {
        if let Some(err) = failed_sources.get(&source.id) {
            source.complete = false;
            source.error = Some(err.clone());
        }
    }
}

async fn backfill_missing_people_remote(
    session: &Session,
    client: &dyn TodoSource,
    view: &mut LoadResult,
    detail_names: &mut BTreeMap<(String, String), String>,
    detail_avatars: &mut BTreeMap<(String, String), String>,
) {
    let current_known = !view.current_user.trim().is_empty()
        && !needs_real_name(&view.current_user, &view.current_user_name);
    let mut missing_keys = BTreeSet::new();
    for target in &view.targets {
        if let Some(owner) = target
            .identity
            .owner
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            if owner == view.current_user {
                if !current_known {
                    missing_keys.insert(owner.to_owned());
                }
            } else {
                let owner_has_avatar = target
                    .owners
                    .iter()
                    .any(|p| p.id == owner && p.avatar.is_some());
                if needs_real_name(owner, &target.owner_name) || !owner_has_avatar {
                    missing_keys.insert(owner.to_owned());
                }
            }
        }
        for person in &target.owners {
            let id = person.id.trim();
            if id.is_empty() {
                continue;
            }
            if id == view.current_user {
                if !current_known {
                    missing_keys.insert(id.to_owned());
                }
                continue;
            }
            if needs_real_name(id, &person.name) || person.avatar.is_none() {
                missing_keys.insert(id.to_owned());
            }
        }
    }
    if missing_keys.is_empty() {
        return;
    }
    let keys_vec: Vec<String> = missing_keys.into_iter().collect();
    let mut learned_names = BTreeMap::new();
    let mut learned_avatars = BTreeMap::new();
    for chunk in keys_vec.chunks(50) {
        let args = json!({ "user_keys": chunk });
        if let Ok(payload) = client
            .call_tool("search_user_info", args.as_object().unwrap())
            .await
        {
            if let Ok(value) = parse_tool_json("search_user_info", &payload) {
                if let Some(users) = value.as_array() {
                    for u in users {
                        let key = txt(&u["user_key"]);
                        if key.trim().is_empty() {
                            continue;
                        }
                        let name = user_name(u);
                        if !needs_real_name(&key, &name) {
                            learned_names.insert(key.clone(), name);
                        }
                        if let Some(av) = user_avatar(u) {
                            learned_avatars.insert(key, av);
                        }
                    }
                }
            }
        }
    }
    if !view.current_user.is_empty() {
        if needs_real_name(&view.current_user, &view.current_user_name) {
            if let Some(name) = learned_names.get(&view.current_user) {
                view.current_user_name = name.clone();
            }
        }
        if view.current_user_avatar.is_none() {
            if let Some(av) = learned_avatars.get(&view.current_user) {
                view.current_user_avatar = Some(av.clone());
            }
        }
    }
    let mut per_project_learned: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
    for target in &mut view.targets {
        let project = target.identity.project.trim().to_owned();
        let owner_id = target
            .identity
            .owner
            .as_deref()
            .or_else(|| target.owners.first().map(|p| p.id.as_str()))
            .map(str::to_owned);
        if let Some(oid) = owner_id {
            if needs_real_name(&oid, &target.owner_name) {
                if let Some(real_name) = learned_names.get(&oid) {
                    target.owner_name = real_name.clone();
                }
            }
            if !project.is_empty() {
                if let Some(real_name) = learned_names.get(&oid) {
                    detail_names.insert((project.clone(), oid.clone()), real_name.clone());
                    per_project_learned
                        .entry(project.clone())
                        .or_default()
                        .insert(oid.clone(), real_name.clone());
                }
                if let Some(av) = learned_avatars.get(&oid) {
                    detail_avatars.insert((project.clone(), oid), av.clone());
                }
            }
        }
        for person in &mut target.owners {
            if needs_real_name(&person.id, &person.name) {
                if let Some(real_name) = learned_names.get(&person.id) {
                    person.name = real_name.clone();
                }
            }
            if person.avatar.is_none() {
                if let Some(av) = learned_avatars.get(&person.id) {
                    person.avatar = Some(av.clone());
                }
            }
            if !project.is_empty() {
                if let Some(real_name) = learned_names.get(&person.id) {
                    detail_names.insert((project.clone(), person.id.clone()), real_name.clone());
                    per_project_learned
                        .entry(project.clone())
                        .or_default()
                        .insert(person.id.clone(), real_name.clone());
                }
                if let Some(av) = learned_avatars.get(&person.id) {
                    detail_avatars.insert((project.clone(), person.id.clone()), av.clone());
                }
            }
        }
    }
    if let Some(context) = crate::creation::account_context_for_key(session, &view.current_user) {
        for (project, learned) in per_project_learned {
            if learned.is_empty() {
                continue;
            }
            let mut existing = session
                .store
                .creation_people(&context, &project)
                .unwrap_or_default();
            for (uid, real_name) in learned {
                existing.insert(uid, real_name);
            }
            let _ = session.store.save_creation_people(&context, &project, &existing);
        }
    }
}

fn incomplete_target(target: &Target) -> bool {
    target.unknown_owner || target.identity.node.trim().is_empty() || matches!(target.read_only_reason.as_deref(),
        Some("节点负责人或排期信息不完整，仅供查看" | "负责人排期数据不完整" | "负责人排期身份重复，请在飞书查看" | "排期日期格式无法确认" | "负责人身份不明，排期仅供查看"))
}

fn normalized_node_status(node: &Value) -> String {
    detail::text(&node["basic"]["status"])
        .or_else(|| detail::text(&node["status"]))
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
}

fn is_completed_node_status(status: &str) -> bool {
    !status.is_empty() && status != "doing" && status != "not_started"
}

fn node_data_incomplete(node: &Value) -> bool {
    if node_key(node).is_empty() { return true; }
    let status = normalized_node_status(node);
    let completed = is_completed_node_status(&status);
    let empty_vec = Vec::new();
    let owners = match node.pointer("/assignees/owners") {
        Some(Value::Array(arr)) => arr,
        None | Some(Value::Null) if completed => &empty_vec,
        _ => return true,
    };
    if owners.iter().any(|owner| txt(&owner["user_key"]).trim().is_empty()) { return true; }
    match node.get("assignee_schedule_list") {
        None | Some(Value::Null) => dates(&node["schedule"]).is_none(),
        Some(Value::Array(rows)) if rows.is_empty() => dates(&node["schedule"]).is_none(),
        Some(Value::Array(rows)) => {
            let mut seen = BTreeMap::new();
            for row in rows {
                let owner = txt(&row["assignee"]["user_key"]);
                if owner.trim().is_empty()
                    || (!completed && !owners.iter().any(|candidate| txt(&candidate["user_key"]) == owner))
                    || dates(&row["schedule_info"]).is_none()
                {
                    return true;
                }
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

fn needs_real_name(id: &str, name: &str) -> bool {
    let trimmed = name.trim();
    trimmed.is_empty()
        || trimmed == id
        || (id.chars().count() >= 6 && trimmed == short_id(id))
        || (trimmed.len() >= 6 && trimmed.chars().all(|c| c.is_ascii_digit()))
}

fn collect_detail_people(
    value: &Value,
    names: &mut BTreeMap<String, String>,
    avatars: &mut BTreeMap<String, String>,
) {
    fn visit(
        value: &Value,
        names: &mut BTreeMap<String, String>,
        avatars: &mut BTreeMap<String, String>,
        person: bool,
        role: bool,
    ) {
        match value {
            Value::Array(values) => {
                for v in values {
                    visit(v, names, avatars, person, role);
                }
            }
            Value::Object(object) => {
                let id = object
                    .get("user_key")
                    .or_else(|| {
                        (person || object.contains_key("email"))
                            .then(|| object.get("key"))
                            .flatten()
                    })
                    .map(txt)
                    .unwrap_or_default();
                if !id.trim().is_empty() {
                    let name = ["name_cn", "name", "username"]
                        .iter()
                        .filter_map(|k| object.get(*k))
                        .map(txt)
                        .find(|s| !needs_real_name(&id, s))
                        .unwrap_or_default();
                    if !name.is_empty() {
                        names.entry(id.clone()).or_insert(name);
                    }
                    if let Some(avatar) = user_avatar(value) {
                        avatars.entry(id).or_insert(avatar);
                    }
                }
                for (key, child) in object {
                    visit(
                        child,
                        names,
                        avatars,
                        key == "owners" || key == "user_details" || (role && key == "members"),
                        key == "role_members",
                    );
                }
            }
            _ => {}
        }
    }
    visit(value, names, avatars, false, false);
}

fn record_detail_people(
    project: &str,
    data: &Value,
    detail_names: &mut BTreeMap<(String, String), String>,
    detail_avatars: &mut BTreeMap<(String, String), String>,
) {
    if project.trim().is_empty() {
        return;
    }
    let mut names = BTreeMap::new();
    let mut avatars = BTreeMap::new();
    collect_detail_people(data, &mut names, &mut avatars);
    for (uid, name) in names {
        detail_names
            .entry((project.to_owned(), uid))
            .or_insert(name);
    }
    for (uid, avatar) in avatars {
        detail_avatars
            .entry((project.to_owned(), uid))
            .or_insert(avatar);
    }
}

#[cfg(test)]
fn finish_person_names(session: &Session, current: &str, targets: &mut [Target]) {
    finish_person_names_with_details(
        session,
        current,
        "",
        None,
        &BTreeMap::new(),
        &BTreeMap::new(),
        targets,
    );
}

fn finish_person_names_with_details(
    session: &Session,
    current: &str,
    current_user_name: &str,
    current_user_avatar: Option<&str>,
    detail_names: &BTreeMap<(String, String), String>,
    detail_avatars: &BTreeMap<(String, String), String>,
    targets: &mut [Target],
) {
    let context = crate::creation::account_context_for_key(session, current);
    let mut observed: BTreeMap<(String, String), String> = BTreeMap::new();
    let mut observed_avatars: BTreeMap<(String, String), String> = BTreeMap::new();
    for target in targets.iter() {
        if let Some(owner) = target.identity.owner.as_deref() {
            if !needs_real_name(owner, &target.owner_name) {
                observed
                    .entry((target.identity.project.clone(), owner.to_owned()))
                    .or_insert_with(|| target.owner_name.clone());
            }
        }
        for person in &target.owners {
            if !needs_real_name(&person.id, &person.name) {
                observed
                    .entry((target.identity.project.clone(), person.id.clone()))
                    .or_insert_with(|| person.name.clone());
            }
            if let Some(av) = person.avatar.as_ref().filter(|s| !s.trim().is_empty()) {
                observed_avatars
                    .entry((target.identity.project.clone(), person.id.clone()))
                    .or_insert_with(|| av.clone());
            }
        }
    }
    for (k, v) in detail_names {
        observed.entry(k.clone()).or_insert_with(|| v.clone());
    }
    for (k, v) in detail_avatars {
        observed_avatars.entry(k.clone()).or_insert_with(|| v.clone());
    }
    let db_matches = session
        .store
        .path
        .as_ref()
        .is_none_or(|p| p == &session.config.db_path);
    let mut cached: BTreeMap<String, (BTreeMap<String, String>, BTreeMap<String, String>)> =
        BTreeMap::new();
    for target in targets {
        let (people_names, people_avatars) = cached
            .entry(target.identity.project.clone())
            .or_insert_with(|| {
                let mut names = context
                    .as_ref()
                    .and_then(|ctx| session.store.creation_people(ctx, &target.identity.project).ok())
                    .unwrap_or_default();
                let mut avatars = BTreeMap::new();
                if context.is_some() && db_matches && !target.identity.project.trim().is_empty() {
                    if let Ok(snapshots) =
                        session.store.creation_people_snapshots(&target.identity.project)
                    {
                        for snapshot in snapshots {
                            collect_detail_people(&snapshot, &mut names, &mut avatars);
                        }
                    }
                }
                (names, avatars)
            });
        let project = target.identity.project.clone();
        let resolve_name = |id: &str, name: &mut String| {
            if needs_real_name(id, name) {
                if !current.trim().is_empty()
                    && id == current
                    && !needs_real_name(current, current_user_name)
                {
                    *name = current_user_name.to_owned();
                } else if let Some(found) = observed
                    .get(&(project.clone(), id.to_owned()))
                    .or_else(|| people_names.get(id))
                    .filter(|cached| !needs_real_name(id, cached))
                {
                    *name = found.clone();
                } else {
                    *name = short_id(id);
                }
            }
        };
        if let Some(owner) = target
            .identity
            .owner
            .as_deref()
            .or_else(|| target.owners.first().map(|person| person.id.as_str()))
        {
            resolve_name(owner, &mut target.owner_name);
        }
        for person in &mut target.owners {
            resolve_name(&person.id, &mut person.name);
            if person.avatar.is_none() {
                if !current.trim().is_empty() && person.id == current && current_user_avatar.is_some() {
                    person.avatar = current_user_avatar.map(str::to_owned);
                } else if let Some(av) = observed_avatars
                    .get(&(project.clone(), person.id.clone()))
                    .or_else(|| people_avatars.get(&person.id))
                {
                    person.avatar = Some(av.clone());
                }
            }
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

async fn fetch_node_schedule_config(
    client: &dyn TodoSource,
    project: &str,
    kind: &str,
    max_pages: u32,
) -> Result<bool, BackendError> {
    let mut seen_pages = HashSet::new();
    for page in crate::config::page_numbers(max_pages) {
        let args = if page == 1 {
            json!({
                "project_key": project,
                "work_item_type": kind,
            })
        } else {
            json!({
                "project_key": project,
                "work_item_type": kind,
                "page_num": page,
            })
        };
        let value = parse_tool_json(
            "list_node_field_config",
            &client
                .call_tool("list_node_field_config", args.as_object().unwrap())
                .await?,
        )?;
        let list = value["list"]
            .as_array()
            .ok_or_else(|| BackendError::parse("list_node_field_config", "缺少字段配置列表"))?;
        if list
            .iter()
            .any(|field| field["field_key"] == "schedule" || field["field_type"] == "schedule")
        {
            return Ok(true);
        }
        if !list.is_empty() && !seen_pages.insert(serde_json::to_string(list)?) {
            return Err(BackendError::parse("list_node_field_config", "字段配置分页重复"));
        }
        let more = match value.get("pagination") {
            None | Some(Value::Null) if page == 1 => false,
            None | Some(Value::Null) => {
                return Err(BackendError::parse("list_node_field_config", "续页缺少分页状态"))
            }
            Some(pagination) => match pagination.get("has_more") {
                None | Some(Value::Null) if page == 1 => false,
                Some(v) => v
                    .as_bool()
                    .ok_or_else(|| BackendError::parse("list_node_field_config", "分页状态无效"))?,
                None => {
                    return Err(BackendError::parse("list_node_field_config", "续页缺少分页状态"))
                }
            },
        };
        if !more {
            return Ok(false);
        }
        if list.is_empty() {
            return Err(BackendError::parse("list_node_field_config", "字段配置分页未取全"));
        }
    }
    Err(BackendError::parse("list_node_field_config", "字段配置分页达到上限"))
}

fn node_key(node: &Value) -> String {
    let basic = detail::text(&node["basic"]["node_key"]).filter(|key| !key.trim().is_empty());
    let direct = detail::text(&node["node_key"]).filter(|key| !key.trim().is_empty());
    if basic.as_ref().zip(direct.as_ref()).is_some_and(|(a, b)| a != b) { return String::new(); }
    basic.or(direct).unwrap_or_default()
}

#[cfg(test)]
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
    build_targets_with_order(out, sid, connection, current, id, title, sources, node, 0);
}

#[allow(clippy::too_many_arguments)]
fn build_targets_with_order(
    out: &mut Vec<Target>,
    sid: &str,
    connection: &str,
    current: &str,
    id: &WorkItemId,
    title: &str,
    sources: &BTreeSet<String>,
    node: &Value,
    node_order: usize,
) {
    let key = node_key(node);
    let status = normalized_node_status(node);
    let owners = node["assignees"]["owners"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let personal = node["assignee_schedule_list"].as_array();
    let invalid_personal = node
        .get("assignee_schedule_list")
        .is_some_and(|v| !v.is_null() && !v.is_array());
    let mut rows: Vec<(Option<String>, String, Option<String>, &Value)> = match personal {
        Some(rows) if !rows.is_empty() => rows
            .iter()
            .enumerate()
            .filter(|(index, row)| !rows[..*index].contains(row))
            .map(|(_, row)| row)
            .map(|r| {
                let owner = detail::text(&r["assignee"]["user_key"]);
                let mut name = user_name(&r["assignee"]);
                let mut avatar = user_avatar(&r["assignee"]);
                if let Some(key) = owner.as_ref() {
                    if needs_real_name(key, &name) {
                        if let Some(real_name) = owners
                            .iter()
                            .filter(|candidate| detail::text(&candidate["user_key"]).as_ref() == Some(key))
                            .map(user_name)
                            .find(|candidate| !needs_real_name(key, candidate))
                        {
                            name = real_name;
                        } else if name == *key {
                            name.clear();
                        }
                    }
                    if avatar.is_none() {
                        avatar = owners.iter()
                            .filter(|candidate| detail::text(&candidate["user_key"]).as_ref() == Some(key))
                            .find_map(user_avatar);
                    }
                }
                (
                    owner,
                    name,
                    avatar,
                    &r["schedule_info"],
                )
            })
            .collect(),
        _ => vec![(
            None,
            owners.iter().find(|o| detail::text(&o["user_key"]).is_some())
                .map(user_name).unwrap_or_default(),
            owners.iter().find(|o| detail::text(&o["user_key"]).is_some())
                .and_then(user_avatar),
            &node["schedule"],
        )],
    };
    if personal.is_some_and(|p| !p.is_empty()) && !invalid_personal && !node_data_incomplete(node) {
        for owner_obj in &owners {
            if let Some(owner_key) = detail::text(&owner_obj["user_key"]).filter(|k| !k.trim().is_empty()) {
                if !rows.iter().any(|(existing, _, _, _)| existing.as_deref() == Some(owner_key.as_str())) {
                    rows.push((
                        Some(owner_key),
                        user_name(owner_obj),
                        user_avatar(owner_obj),
                        &Value::Null,
                    ));
                }
            }
        }
    }
    let mut owner_counts = BTreeMap::new();
    for (owner, _, _, _) in &rows {
        if let Some(owner) = owner {
            *owner_counts.entry(owner.clone()).or_insert(0usize) += 1;
        }
    }
    let mut emitted_owners = HashSet::new();
    for (owner, name, avatar, value) in rows {
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
            if status.is_empty() {
                Some("节点已完成或状态不明")
            } else {
                Some("该节点已流转完成，排期仅供查看")
            }
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
                        avatar: avatar.clone(),
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
                        avatar: user_avatar(o),
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
            node_status: status.clone(),
            node_order,
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
        assert_eq!(out[0].baseline.end, "");
        assert!(out[0].read_only_reason.is_none());
        assert_eq!(
            dates(&json!({})),
            Some(Dates {
                start: String::new(),
                end: String::new()
            })
        );
        assert_eq!(
            dates(&Value::Null),
            Some(Dates {
                start: String::new(),
                end: String::new()
            })
        );
        assert!(dates(&json!({"estimate_start_time":null,"estimate_finish_time":null})).is_some());
        assert!(dates(&json!("invalid")).is_none());
        assert!(dates(&json!({"estimate_start_time":"invalid"})).is_none());
        node["schedule"] = json!({"estimate_start_time":"invalid"});
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
        assert!(out[0].read_only_reason.is_some());
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

    #[test]
    fn omitempty_dates_and_multi_owner_doing_node_synthesize_personal_slots() {
        assert_eq!(date(&json!(0)), Some(String::new()));
        assert_eq!(date(&json!("0")), Some(String::new()));
        assert_eq!(date(&json!("   ")), Some(String::new()));
        assert_eq!(date(&Value::Null), Some(String::new()));

        let id = WorkItemId {
            project_key: Some("p".into()),
            work_item_type_key: Some("story".into()),
            work_item_id: "10".into(),
        };
        let node = json!({
            "basic": { "node_key": "n_multi", "name": "联调节点", "status": "doing" },
            "assignees": {
                "owners": [
                    { "user_key": "peer_a", "name": "同事甲", "avatar_url": "https://example.com/a.png" },
                    { "user_key": "me", "name": "测试本人", "avatar": { "avatar_72": "https://example.com/me.png" } }
                ]
            },
            "assignee_schedule_list": [
                {
                    "assignee": { "user_key": "peer_a", "name": "同事甲" },
                    "schedule_info": { "estimate_start_time": 1794499200000i64 }
                }
            ],
            "schedule": { "estimate_start_time": 1794499200000i64 }
        });
        let mut out = Vec::new();
        build_targets(
            &mut out,
            "sid",
            "conn",
            "me",
            &id,
            "多人联调事项",
            &BTreeSet::from(["a".into()]),
            &node,
        );
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].identity.scope, "personal");
        assert_eq!(out[0].identity.owner.as_deref(), Some("peer_a"));
        assert_eq!(out[0].baseline.start, "2026-11-13");
        assert_eq!(out[0].baseline.end, "");
        assert!(out[0].read_only_reason.is_some());
        assert_eq!(out[0].owners[0].avatar.as_deref(), Some("https://example.com/a.png"));

        assert_eq!(out[1].identity.scope, "personal");
        assert_eq!(out[1].identity.owner.as_deref(), Some("me"));
        assert_eq!(
            out[1].baseline,
            Dates {
                start: String::new(),
                end: String::new()
            }
        );
        assert!(out[1].read_only_reason.is_none());
        assert_eq!(out[1].owners[0].avatar.as_deref(), Some("https://example.com/me.png"));
    }

    #[test]
    fn sync_writes_both_start_and_end_dates_when_updating_single_endpoint() {
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
        plan.view.targets[0].baseline = Dates {
            start: "2026-11-13".into(),
            end: "2026-11-14".into(),
        };
        let target_id = plan.view.targets[0].id.clone();
        let sid = plan.view.session_id.clone();
        let res = plan
            .sync(
                &session,
                &sid,
                vec![Change {
                    id: target_id,
                    start: "2026-11-13".into(),
                    end: "2026-11-20".into(),
                    cancel: false,
                }],
            )
            .unwrap();
        assert_eq!(res.targets[0].result, "accepted");
        let calls = fake.calls.lock().unwrap();
        let (_, args) = calls
            .iter()
            .find(|(tool, _)| tool == "update_node")
            .expect("update_node called");
        let sched = &args["schedules"][0];
        assert_eq!(sched["owners"], json!(["me"]));
        assert_eq!(
            sched["estimate_start_date"],
            json!(date_ms("2026-11-13").unwrap())
        );
        assert_eq!(
            sched["estimate_end_date"],
            json!(date_ms("2026-11-20").unwrap())
        );
        assert_eq!(sched["clear_schedule"], false);
        assert_eq!(sched["is_auto"], false);
        drop(calls);
        drop(installed);
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }

    struct StateFlowScenario {
        calls: Mutex<Vec<(String, Value)>>,
    }
    #[async_trait]
    impl TodoSource for Arc<StateFlowScenario> {
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
                "search_user_info" => json!([{"user_key":"me","name_cn":"测试本人"}]),
                "list_todo" => json!({
                    "list": [
                        {
                            "project_key": "p",
                            "work_item_info": { "work_item_id": "1", "work_item_type_key": "story", "work_item_name": "节点流需求" },
                            "node_info": { "node_name": "开发" }
                        },
                        {
                            "project_key": "p",
                            "work_item_info": { "work_item_id": "2", "work_item_type_key": "issue", "work_item_name": "前置过滤缺陷" },
                            "state_info": { "state_key": "state_open", "state_name": "待处理" }
                        },
                        {
                            "project_key": "p",
                            "work_item_info": { "work_item_id": "3", "work_item_type_key": "issue", "work_item_name": "兜底过滤缺陷" }
                        }
                    ],
                    "total": 3
                }),
                "get_node_detail" => {
                    let wid = args["work_item_id"].as_str().unwrap_or_default();
                    if wid == "3" {
                        return Err(BackendError::Tool {
                            tool: "get_node_detail".into(),
                            code: Some(-32000),
                            message: "flow_absent: state flow item has no nodes".into(),
                        });
                    }
                    json!({
                        "list": [
                            {
                                "basic": { "node_key": "n1", "name": "开发", "status": "doing" },
                                "assignees": { "owners": [{ "user_key": "me", "name": "测试本人" }] },
                                "schedule": {}
                            }
                        ],
                        "pagination": { "has_more": false }
                    })
                }
                "get_workitem_brief" => {
                    let wid = args["work_item_id"].as_str().unwrap_or_default();
                    let (type_key, work_item_mod, name) = if wid == "1" {
                        ("story", "节点流", "节点流需求")
                    } else {
                        ("issue", "状态流", "兜底过滤缺陷")
                    };
                    json!({
                        "work_item_attribute": {
                            "work_item_id": wid,
                            "owned_project": { "key": "p", "simple_name": "example" },
                            "work_item_type": { "key": type_key },
                            "work_item_mod": work_item_mod,
                            "work_item_name": name
                        },
                        "work_item_fields": [],
                        "pagination": { "has_more": false }
                    })
                }
                "list_node_field_config" => json!({
                    "list": [{ "field_key": "schedule", "field_type": "schedule" }],
                    "pagination": { "has_more": false }
                }),
                _ => panic!("unexpected tool {tool}"),
            };
            Ok(ToolResultPayload::from_json(v))
        }
    }

    #[test]
    fn state_flow_items_are_skipped_without_node_detail_errors() {
        let (session, dir) = fixture();
        let fake = Arc::new(StateFlowScenario {
            calls: Mutex::new(vec![]),
        });
        let installed = crate::remote::install_test_client(
            &session.config,
            &session.credential().unwrap(),
            Box::new(fake.clone()),
        );
        let plan = ScheduleSession::load(&session).unwrap();
        assert_eq!(plan.view.failed_items, 0);
        assert!(plan.view.item_errors.is_empty());
        assert!(plan.view.sources.iter().all(|s| s.complete && s.error.is_none()));
        assert_eq!(plan.view.targets.len(), 1);
        assert_eq!(plan.view.targets[0].identity.item, "1");
        assert!(plan.view.targets[0].read_only_reason.is_none());
        let calls = fake.calls.lock().unwrap();
        // Item 2 was pre-filtered via state_info, so get_node_detail was only called for items 1 and 3.
        let mut node_calls: Vec<_> = calls
            .iter()
            .filter(|(t, _)| t == "get_node_detail")
            .map(|(_, a)| a["work_item_id"].as_str().unwrap_or_default().to_string())
            .collect();
        node_calls.sort();
        assert_eq!(node_calls, vec!["1".to_string(), "3".to_string()]);
        drop(calls);
        drop(installed);
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }

    struct TieredPeopleScenario {
        calls: Mutex<Vec<(String, Value)>>,
    }
    #[async_trait]
    impl TodoSource for Arc<TieredPeopleScenario> {
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
                "search_user_info" => {
                    if let Some(keys) = args.get("user_keys").and_then(Value::as_array) {
                        let mut out = Vec::new();
                        for key in keys.iter().filter_map(Value::as_str) {
                            match key {
                                "current_login_user()" => out.push(json!({
                                    "user_key": "me",
                                    "name_cn": "测试本人",
                                    "avatar_url": "https://example.com/me.png"
                                })),
                                "u_peer1" => out.push(json!({
                                    "user_key": "u_peer1",
                                    "name_cn": "缓存同事甲",
                                    "avatar_url": "https://example.com/p1.png"
                                })),
                                "u_peer2" => out.push(json!({
                                    "user_key": "u_peer2",
                                    "name_cn": "远端同事乙",
                                    "avatar_url": "https://example.com/p2.png"
                                })),
                                "u_peer3" => out.push(json!({
                                    "user_key": "u_peer3",
                                    "name_cn": "远端同事丙",
                                    "avatar": { "avatar_72": "https://example.com/p3.png" }
                                })),
                                _ => {}
                            }
                        }
                        json!(out)
                    } else {
                        json!([{
                            "user_key": "me",
                            "name_cn": "测试本人",
                            "avatar_url": "https://example.com/me.png"
                        }])
                    }
                }
                "list_todo" => json!({
                    "list": [
                        {
                            "project_key": "p",
                            "work_item_info": { "work_item_id": "1", "work_item_type_key": "story", "work_item_name": "核心事项" },
                            "node_info": { "node_name": "开发" }
                        }
                    ],
                    "total": 1
                }),
                "get_node_detail" => {
                    let wid = args["work_item_id"].as_str().unwrap_or_default();
                    if wid == "1" {
                        json!({
                            "list": [
                                {
                                    "basic": { "node_key": "n1", "name": "开发", "status": "doing" },
                                    "assignees": {
                                        "owners": [
                                            { "user_key": "me" },
                                            { "user_key": "u_peer1" }
                                        ]
                                    },
                                    "assignee_schedule_list": [
                                        {
                                            "assignee": { "user_key": "me" },
                                            "schedule_info": { "estimate_start_time": 1794499200000i64, "estimate_finish_time": 1794585600000i64 }
                                        },
                                        {
                                            "assignee": { "user_key": "u_peer1" },
                                            "schedule_info": { "estimate_start_time": 1794499200000i64, "estimate_finish_time": 1794585600000i64 }
                                        }
                                    ],
                                    "schedule": {}
                                },
                                {
                                    "basic": { "node_key": "n2", "name": "测试", "status": "not_started" },
                                    "assignees": { "owners": [{ "user_key": "u_peer2" }] },
                                    "schedule": {}
                                }
                            ],
                            "pagination": { "has_more": false }
                        })
                    } else if wid == "2" {
                        json!({
                            "list": [
                                {
                                    "basic": { "node_key": "n_team", "name": "设计", "status": "doing" },
                                    "assignees": { "owners": [{ "user_key": "u_peer3" }] },
                                    "schedule": { "estimate_start_time": 1794499200000i64, "estimate_finish_time": 1794585600000i64 }
                                }
                            ],
                            "pagination": { "has_more": false }
                        })
                    } else {
                        panic!("unexpected work_item_id {wid}")
                    }
                }
                "get_workitem_brief" => {
                    let wid = args["work_item_id"].as_str().unwrap_or_default();
                    json!({
                        "work_item_attribute": {
                            "work_item_id": wid,
                            "owned_project": { "key": "p", "simple_name": "example" },
                            "work_item_type": { "key": "story" },
                            "work_item_mod": "节点流",
                            "work_item_name": if wid == "1" { "核心事项" } else { "团队事项" }
                        },
                        "work_item_fields": [],
                        "pagination": { "has_more": false }
                    })
                }
                "list_node_field_config" => json!({
                    "list": [{ "field_key": "schedule", "field_type": "schedule" }],
                    "pagination": { "has_more": false }
                }),
                "update_node" => json!("success"),
                _ => panic!("unexpected tool {tool}"),
            };
            Ok(ToolResultPayload::from_json(v))
        }
    }

    #[test]
    fn tiered_load_mine_and_load_people_preserve_baselines_and_backfill_names_and_avatars() {
        let (mut session, dir) = fixture();
        session.config.sources.push(crate::model::source::WorkSource {
            id: "team_stories".into(),
            kind: crate::model::source::SourceKind::WorkItemType {
                project_key: Some("p".into()),
                type_key: Some("story".into()),
            },
            enabled: true,
            todo: None,
            association_rule: None,
        });
        let run = session
            .store
            .begin_run("work_item_type", Some("p"), crate::store::RunTrigger::Manual, Some("team_stories"), 10)
            .unwrap();
        let team_item = crate::model::domain::WorkItem {
            id: WorkItemId {
                project_key: Some("p".into()),
                work_item_type_key: Some("story".into()),
                work_item_id: "2".into(),
            },
            project_name: Some("示例空间".into()),
            name: Some("团队事项".into()),
            flow: crate::model::domain::FlowInfo {
                kind: crate::model::domain::FlowKind::Node,
                node_name: Some("设计".into()),
                node_state_key: None,
                start_state_key_name: None,
                end_state_key_name: None,
            },
            schedule: crate::model::domain::Schedule::default(),
            raw_json: "{}".into(),
        };
        let state_item = crate::model::domain::WorkItem {
            id: WorkItemId {
                project_key: Some("p".into()),
                work_item_type_key: Some("issue".into()),
                work_item_id: "3".into(),
            },
            project_name: Some("示例空间".into()),
            name: Some("缺陷状态流".into()),
            flow: crate::model::domain::FlowInfo {
                kind: crate::model::domain::FlowKind::State,
                node_name: None,
                node_state_key: Some("open".into()),
                start_state_key_name: None,
                end_state_key_name: None,
            },
            schedule: crate::model::domain::Schedule::default(),
            raw_json: "{}".into(),
        };
        session
            .store
            .upsert_items(run, &[team_item, state_item], 10)
            .unwrap();
        let ctx = crate::creation::account_context_for_key(&session, "me").unwrap();
        session
            .store
            .save_creation_people(
                &ctx,
                "p",
                &BTreeMap::from([("u_peer1".to_string(), "缓存同事甲".to_string())]),
            )
            .unwrap();

        let fake = Arc::new(TieredPeopleScenario {
            calls: Mutex::new(vec![]),
        });
        let installed = crate::remote::install_test_client(
            &session.config,
            &session.credential().unwrap(),
            Box::new(fake.clone()),
        );

        let mut plan = ScheduleSession::load_mine(&session).unwrap();
        assert!(!plan.view.people_loaded);
        assert_eq!(plan.view.current_user, "me");
        assert_eq!(plan.view.current_user_name, "测试本人");
        assert_eq!(
            plan.view.current_user_avatar.as_deref(),
            Some("https://example.com/me.png")
        );
        assert_eq!(plan.view.targets.len(), 1);
        let my_target_before = plan.view.targets[0].clone();
        assert_eq!(my_target_before.identity.owner.as_deref(), Some("me"));
        assert_eq!(my_target_before.owners[0].name, "测试本人");
        assert_eq!(
            my_target_before.owners[0].avatar.as_deref(),
            Some("https://example.com/me.png")
        );

        let sid = plan.view.session_id.clone();
        plan.load_people(&session, &sid).unwrap();
        assert!(plan.view.people_loaded);
        assert_eq!(plan.view.targets[0].id, my_target_before.id);
        assert_eq!(plan.view.targets[0].baseline, my_target_before.baseline);
        assert_eq!(plan.view.targets.len(), 4);

        let peer1 = plan
            .view
            .targets
            .iter()
            .find(|t| t.identity.owner.as_deref() == Some("u_peer1"))
            .expect("peer1 target");
        assert_eq!(peer1.owners[0].name, "缓存同事甲");
        assert_eq!(
            peer1.owners[0].avatar.as_deref(),
            Some("https://example.com/p1.png")
        );

        let peer2 = plan
            .view
            .targets
            .iter()
            .find(|t| t.identity.node == "n2")
            .expect("peer2 target");
        assert_eq!(peer2.owners[0].name, "远端同事乙");
        assert_eq!(
            peer2.owners[0].avatar.as_deref(),
            Some("https://example.com/p2.png")
        );

        let peer3 = plan
            .view
            .targets
            .iter()
            .find(|t| t.identity.item == "2")
            .expect("peer3 target");
        assert_eq!(peer3.owners[0].name, "远端同事丙");
        assert_eq!(
            peer3.owners[0].avatar.as_deref(),
            Some("https://example.com/p3.png")
        );

        let cached_people = session.store.creation_people(&ctx, "p").unwrap();
        assert_eq!(cached_people.get("u_peer2").map(String::as_str), Some("远端同事乙"));
        assert_eq!(cached_people.get("u_peer3").map(String::as_str), Some("远端同事丙"));

        // Verify idempotency of load_people
        let calls_before_repeat = fake.calls.lock().unwrap().len();
        plan.load_people(&session, &sid).unwrap();
        assert_eq!(fake.calls.lock().unwrap().len(), calls_before_repeat);
        assert!(plan.view.sources.iter().any(|s| s.id == "team_stories" && s.complete));

        drop(installed);
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn load_mine_includes_related_non_todo_items_and_backfills_coowner_and_numeric_names() {
        assert!(needs_real_name("u_any", "123456"));
        assert!(needs_real_name("1000000000000123456", "1000000000000123456"));
        assert!(!needs_real_name("u_any", "张工"));
        assert_eq!(
            user_name(&json!({"user_key": "u_any", "name": "123456", "name_cn": "真实同事"})),
            "真实同事"
        );

        let (mut session, dir) = fixture();
        session.config.sources.push(crate::model::source::WorkSource {
            id: "my_participated".into(),
            kind: crate::model::source::SourceKind::WorkItemType {
                project_key: Some("p".into()),
                type_key: Some("story".into()),
            },
            enabled: true,
            todo: None,
            association_rule: None,
        });
        let run = session
            .store
            .begin_run(
                "work_item_type",
                Some("p"),
                crate::store::RunTrigger::Manual,
                Some("my_participated"),
                20,
            )
            .unwrap();
        let related_item = crate::model::domain::WorkItem {
            id: WorkItemId {
                project_key: Some("p".into()),
                work_item_type_key: Some("story".into()),
                work_item_id: "2".into(),
            },
            project_name: Some("示例空间".into()),
            name: Some("我参与的需求".into()),
            flow: crate::model::domain::FlowInfo {
                kind: crate::model::domain::FlowKind::Node,
                node_name: Some("设计".into()),
                node_state_key: None,
                start_state_key_name: None,
                end_state_key_name: None,
            },
            schedule: crate::model::domain::Schedule::default(),
            raw_json: r#"{"owners":["me","u_peer3"]}"#.into(),
        };
        session
            .store
            .upsert_items(run, &[related_item], 20)
            .unwrap();

        let fake = Arc::new(TieredPeopleScenario {
            calls: Mutex::new(vec![]),
        });
        let installed = crate::remote::install_test_client(
            &session.config,
            &session.credential().unwrap(),
            Box::new(fake.clone()),
        );

        let plan = ScheduleSession::load_mine(&session).unwrap();
        assert!(!plan.view.people_loaded);
        assert!(plan.view.sources.iter().any(|s| s.id == "a" && s.complete));
        drop(installed);
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn schedule_config_without_pagination_and_historical_completed_nodes_preserve_active_doing_editability() {
        struct UnpaginatedConfigAndHistoryScenario {
            fake: Arc<Fake>,
        }
        #[async_trait]
        impl TodoSource for UnpaginatedConfigAndHistoryScenario {
            async fn describe(&self) -> Result<ConnectionInfo, BackendError> {
                unreachable!()
            }
            async fn close(&mut self) {}
            async fn call_tool(
                &self,
                tool: &str,
                args: &Map<String, Value>,
            ) -> Result<ToolResultPayload, BackendError> {
                match tool {
                    "list_node_field_config" => {
                        crate::mcp::record_schedule_rpc();
                        self.fake
                            .calls
                            .lock()
                            .unwrap()
                            .push((tool.into(), Value::Object(args.clone())));
                        assert!(
                            args.get("page_num").is_none(),
                            "list_node_field_config first call should not require page_num"
                        );
                        Ok(ToolResultPayload::from_json(json!({
                            "list": [{ "field_key": "schedule", "field_type": "schedule" }]
                        })))
                    }
                    "get_node_detail" => {
                        crate::mcp::record_schedule_rpc();
                        self.fake
                            .calls
                            .lock()
                            .unwrap()
                            .push((tool.into(), Value::Object(args.clone())));
                        Ok(ToolResultPayload::from_json(json!({
                            "list": [
                                {
                                    "basic": { "node_key": "n_hist", "name": "需求评审", "status": "done" },
                                    "assignees": { "owners": [{ "user_key": "me", "name": "本人" }] },
                                    "assignee_schedule_list": [{
                                        "assignee": { "user_key": "me", "name": "本人" },
                                        "schedule_info": {
                                            "estimate_start_time": 1794326400000i64,
                                            "estimate_finish_time": 1794412800000i64
                                        }
                                    }]
                                },
                                {
                                    "basic": { "node_key": "n_active", "name": "后端代码合入", "status": "DOING" },
                                    "assignees": { "owners": [{ "user_key": "me", "name": "本人" }] },
                                    "assignee_schedule_list": [{
                                        "assignee": { "user_key": "me", "name": "本人" },
                                        "schedule_info": {
                                            "estimate_start_time": 1794499200000i64,
                                            "estimate_finish_time": 1794585600000i64
                                        }
                                    }]
                                },
                                {
                                    "basic": { "node_key": "n_future", "name": "上线验收", "status": "not_started" },
                                    "assignees": { "owners": [{ "user_key": "me", "name": "本人" }] },
                                    "schedule": { "estimate_start_time": null, "estimate_finish_time": null }
                                }
                            ]
                        })))
                    }
                    _ => self.fake.call_tool(tool, args).await,
                }
            }
        }

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
            Box::new(UnpaginatedConfigAndHistoryScenario { fake }),
        );

        let plan = ScheduleSession::load_mine(&session).unwrap();
        assert!(plan.view.sources.iter().all(|s| s.complete));
        assert_eq!(plan.view.failed_items, 0);
        assert!(plan.view.item_errors.is_empty());
        assert_eq!(plan.view.targets.len(), 3);

        let hist = &plan.view.targets[0];
        assert_eq!(hist.node_name, "需求评审");
        assert_eq!(hist.node_status, "done");
        assert_eq!(hist.node_order, 0);
        assert_eq!(
            hist.read_only_reason.as_deref(),
            Some("该节点已流转完成，排期仅供查看")
        );
        assert!(!incomplete_target(hist));

        let active = &plan.view.targets[1];
        assert_eq!(active.node_name, "后端代码合入");
        assert_eq!(active.node_status, "doing");
        assert_eq!(active.node_order, 1);
        assert_eq!(active.read_only_reason, None);

        let future = &plan.view.targets[2];
        assert_eq!(future.node_name, "上线验收");
        assert_eq!(future.node_status, "not_started");
        assert_eq!(future.node_order, 2);
        assert_eq!(
            future.read_only_reason.as_deref(),
            Some("当前连接尚未验证此状态的排期写入")
        );

        drop(installed);
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
