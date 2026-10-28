//! 同步诊断：只记录耗时、计数和工具名，不记录参数、响应或凭证。
use std::{collections::BTreeMap, sync::Mutex, time::Instant};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::{error::BackendError, mcp::{ConnectionInfo, TodoSource, ToolResultPayload}};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RequestTiming {
    pub count: usize,
    /// 各次请求耗时之和；并发时可能超过整轮实际耗时。
    pub elapsed_ms: u64,
    pub failed: usize,
    pub cancelled: usize,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SyncPerformance {
    /// 同步驱动实际耗时，不含会话关闭、IPC 与页面刷新。
    pub elapsed_ms: u64,
    /// 清单查询及其字段/角色校验的实际耗时。
    pub query_ms: u64,
    /// 详情补全阶段实际耗时，包含详情落库。
    pub details_ms: u64,
    pub detail_store_ms: u64,
    pub summary_store_ms: u64,
    pub detail_items_fetched: usize,
    pub detail_cache_hits: usize,
    pub peak_in_flight: usize,
    pub requests: BTreeMap<String, RequestTiming>,
}

impl SyncPerformance {
    pub fn merge(&mut self, other: &Self) {
        self.elapsed_ms += other.elapsed_ms;
        self.query_ms += other.query_ms;
        self.details_ms += other.details_ms;
        self.detail_store_ms += other.detail_store_ms;
        self.summary_store_ms += other.summary_store_ms;
        self.detail_items_fetched += other.detail_items_fetched;
        self.detail_cache_hits += other.detail_cache_hits;
        self.peak_in_flight = self.peak_in_flight.max(other.peak_in_flight);
        for (tool, value) in &other.requests {
            let total = self.requests.entry(tool.clone()).or_default();
            total.count += value.count;
            total.elapsed_ms += value.elapsed_ms;
            total.failed += value.failed;
            total.cancelled += value.cancelled;
        }
    }
}

pub(crate) fn elapsed_ms(start: Instant) -> u64 {
    start.elapsed().as_millis() as u64
}

#[derive(Default)]
pub(crate) struct Metrics {
    inner: Mutex<(SyncPerformance, usize)>,
}

impl Metrics {
    pub fn snapshot(&self) -> SyncPerformance {
        self.inner.lock().expect("sync metrics poisoned").0.clone()
    }

    pub fn update(&self, update: impl FnOnce(&mut SyncPerformance)) {
        update(&mut self.inner.lock().expect("sync metrics poisoned").0);
    }

    pub fn phase(&self, query: bool) -> PhaseTimer<'_> {
        PhaseTimer { metrics: self, query, start: Instant::now() }
    }

    fn request(&self, tool: &str) -> RequestTimer<'_> {
        let mut state = self.inner.lock().expect("sync metrics poisoned");
        state.0.requests.entry(tool.to_owned()).or_default().count += 1;
        state.1 += 1;
        state.0.peak_in_flight = state.0.peak_in_flight.max(state.1);
        RequestTimer { metrics: self, tool: tool.to_owned(), start: Instant::now(), failed: None }
    }
}

pub(crate) struct PhaseTimer<'a> {
    metrics: &'a Metrics,
    query: bool,
    start: Instant,
}

impl Drop for PhaseTimer<'_> {
    fn drop(&mut self) {
        self.metrics.update(|p| {
            if self.query { p.query_ms += elapsed_ms(self.start); }
            else { p.details_ms += elapsed_ms(self.start); }
        });
    }
}

struct RequestTimer<'a> {
    metrics: &'a Metrics,
    tool: String,
    start: Instant,
    failed: Option<bool>,
}

impl Drop for RequestTimer<'_> {
    fn drop(&mut self) {
        let mut state = self.metrics.inner.lock().expect("sync metrics poisoned");
        state.1 -= 1;
        let timing = state.0.requests.get_mut(&self.tool).expect("request registered");
        timing.elapsed_ms += elapsed_ms(self.start);
        match self.failed {
            Some(true) => timing.failed += 1,
            None => timing.cancelled += 1,
            _ => {}
        }
    }
}

pub(crate) struct MeteredSource<'a> {
    pub client: &'a dyn TodoSource,
    pub metrics: &'a Metrics,
    pub priority: crate::mcp::scheduler::Priority,
}

#[async_trait]
impl TodoSource for MeteredSource<'_> {
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> {
        crate::mcp::scheduler::with_priority(self.priority, self.client.describe()).await
    }
    async fn close(&mut self) {} // 客户端生命周期由 Session 管理。
    async fn call_tool(&self, tool: &str, args: &Map<String, Value>) -> Result<ToolResultPayload, BackendError> {
        let mut timer = self.metrics.request(tool);
        let result = crate::mcp::scheduler::with_priority(self.priority, self.client.call_tool(tool, args)).await;
        timer.failed = Some(result.as_ref().map_or(true, |payload| payload.is_error));
        result
    }
}
