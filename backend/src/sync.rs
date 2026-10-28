//! 个人待办同步驱动：翻页 → 解析 → 转换 → 落库 → 记账。
//!
//! 三条硬约束的落点（任务书二.5）：
//!
//! 1. **取不到数据绝不写成成功**：任何一页出错都直接结束本次运行，
//!    并在 `sync_run` 留下 `failed` 记录与错误分类；`last_successful_sync()` 不会指向它。
//! 2. **失败保留缓存**：完整成功后才按来源核对清单，失败不撤销来源归属。
//! 3. **翻页结束的原因必须可查**：`stop_reason` 落库并回传，
//!    「自然取完」与「被 max_pages 截断」在数据上是可区分的。
//!
//! 翻页终止判据（按可靠性排序）：
//!
//! | 情况 | 依据 | 结论 |
//! |---|---|---|
//! | 本页 0 条 | 服务端没有更多数据 | 完整 |
//! | 累计条数 ≥ 响应 `total` | 服务端自己声明的总数 | 完整 |
//! | 响应没有 `total` | 继续取到空页 | 不以未验证的页宽推断完整性 |
//! | 达到 `max_pages` | 防失控上限 | **不完整**，本次记为失败 |
//!
//! 无 total 时继续请求至空页；未到 total 就返回空页视为失败，避免部分结果移除有效事项。

use std::collections::{BTreeMap, HashSet};
use std::time::Instant;

use serde::Serialize;

use crate::error::BackendError;
use crate::mcp::{parse_todo_page, TodoSource};
use crate::model::domain::{to_work_item, RejectReason, WorkItem};
use crate::model::source::PersonalTodoQuery;
use crate::store::{RunStatus, RunTrigger, StopReason, Store, TypeScope, UpsertStats};
use crate::sync_metrics::{elapsed_ms, SyncPerformance};

/// `tools/list` 描述里的每页条数（调查结论 6.4）。
///
/// 保留用于诊断提示，不作为分页结束判据。
pub const PAGE_SIZE_ASSUMED: usize = 50;

/// `rejection_detail` 里每个原因码最多保留的样本文本长度。
const REJECTION_SAMPLE_CHARS: usize = 180;

/// 当前时刻（毫秒）。单独抽出便于以后换成可注入时钟。
pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// 一次同步的结果。
///
/// **判断成败要看 `status`，不要看 `Result::is_ok()`**：
/// `Ok(report)` 只表示「流程跑完了没有异常抛出」，
/// 触到 `max_pages` 时同样返回 `Ok`，但 `status` 是 [`RunStatus::Failed`]、
/// `stop_reason` 是 [`StopReason::MaxPages`]——数据不完整，不能算成功同步。
#[derive(Debug, Clone, Serialize)]
pub struct SyncReport {
    pub run_id: i64,
    pub status: RunStatus,
    pub action: String,
    pub todo_scope: Option<String>,
    pub pages_fetched: usize,
    /// 收到的条目数（含结构不符被拒绝的条目）。
    pub items_received: usize,
    pub items_upserted: usize,
    pub items_inserted: usize,
    pub items_updated: usize,
    pub items_rejected: usize,
    /// 本次同步是谁发起的（`manual` = CLI 或用户点刷新，`automatic` = 前端定时）。
    pub trigger: RunTrigger,
    /// 来源 id；配置里只有一个可执行来源时可能为 `None`。
    pub source_id: Option<String>,
    /// 因「不在已确认的类型范围内」而未入库的条数。与 `items_rejected` 不同：
    /// 这些条目数据本身没问题，是用户选择不拉，绝不能被当成同步异常。
    pub items_out_of_scope: usize,
    /// 响应里最后见到的 `total`（取不到则 `None`，不凭空补）。
    pub remote_total: Option<i64>,
    pub stop_reason: StopReason,
    /// 数据是否完整（`stop_reason.data_may_be_incomplete()` 的镜像，方便调用方直接判断）。
    pub complete: bool,
    pub full_scan: bool,
    /// 被拒绝条目的原因码统计与样本，按原因码排序。
    pub rejections: Vec<RejectionStat>,
    pub performance: SyncPerformance,
}

impl SyncReport {
    pub fn is_success(&self) -> bool {
        self.status == RunStatus::Success
    }
}

/// 某个拒绝原因码的统计。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RejectionStat {
    pub code: String,
    pub count: usize,
    /// 该原因码第一次出现的详情（截断后），用于排查；不含凭证。
    pub sample: String,
}

#[derive(Default)]
struct RejectionLedger {
    inner: BTreeMap<String, RejectionStat>,
}

impl RejectionLedger {
    fn add(&mut self, reason: &RejectReason) {
        let entry = self.inner.entry(reason.code.to_string()).or_insert_with(|| RejectionStat {
            code: reason.code.to_string(),
            count: 0,
            sample: truncate(&reason.detail, REJECTION_SAMPLE_CHARS),
        });
        entry.count += 1;
    }

    fn stats(&self) -> Vec<RejectionStat> {
        self.inner.values().cloned().collect()
    }

    fn total(&self) -> usize {
        self.inner.values().map(|s| s.count).sum()
    }

    /// 落库文本：紧凑 JSON，按原因码排序，不含响应原文全量。
    fn as_json(&self) -> Option<String> {
        if self.inner.is_empty() {
            return None;
        }
        let value: Vec<serde_json::Value> = self
            .inner
            .values()
            .map(|s| serde_json::json!({ "code": s.code, "count": s.count, "sample": s.sample }))
            .collect();
        serde_json::to_string(&value).ok()
    }
}

/// 这次同步的上下文。三者都只是诊断与本地过滤信息，不改变翻页完整性判定。
/// 刻意不实现 `Default`：发起方式必须显式给，不能默默算成「手动」。
#[derive(Debug, Clone, Copy)]
pub struct SyncContext<'a> {
    /// 手动还是自动，落 `sync_run.trigger`。
    pub trigger: RunTrigger,
    /// 来源 id，落 `sync_run.source_id`；配置里恰好一个来源时也可以是 `None`。
    pub source_id: Option<&'a str>,
    /// 用户确认过的类型范围；`None` = 从未确认，全量保留（与升级前行为一致）。
    pub type_scope: Option<&'a TypeScope>,
}

/// 同步个人待办。
///
/// 出错时返回 `Err`，同时已经写入了 `failed` 运行记录（已落地页的数据保留）。
/// 返回值里的 `SyncReport::status` 才是本次是否算「成功同步」的结论。
///
/// `secret` 传当前已加载的凭证原文（离线/测试传 `None`）：
/// 失败落库前用它对错误文本做二次擦除，防上游回显把 token 写进台账。
pub async fn sync_personal_todos(
    source: &mut dyn TodoSource,
    store: &Store,
    query: &PersonalTodoQuery,
    max_pages: u32,
    secret: Option<&str>,
    ctx: SyncContext<'_>,
) -> Result<SyncReport, BackendError> {
    let started = now_ms();
    let clock = Instant::now();
    let query_label = source.query_kind().unwrap_or(query.action.as_str()).to_owned();
    let scope = query.todo_scope.map(|s| s.as_str().to_string());
    let run_id = store.begin_run(
        &query_label,
        scope.as_deref(),
        ctx.trigger,
        ctx.source_id,
        started,
    )?;

    store.set_run_scan_mode(run_id, source.is_full_scan())?;
    let mut summary_store_ms = 0;
    let result = async {
    let mut pages_fetched = 0usize;
    let mut received = 0usize;
    let mut upserted = UpsertStats::default();
    let mut remote_total: Option<i64> = None;
    let mut rejections = RejectionLedger::default();
    let mut out_of_scope = 0usize;
    let mut seen_items = HashSet::new();
    let mut stop = StopReason::EmptyPage;

    for page_num in crate::config::page_numbers(max_pages) {
        let outcome = async {
            let payload = source.call_list_todo(&query.to_arguments(page_num)).await?;
            parse_todo_page(crate::mcp::feishu::TOOL_LIST_TODO, &payload)
        }
        .await;

        let page = match outcome {
            Ok(page) => page,
            Err(e) => {
                // 已取得的部分保留（upsert 已提交），但整次运行记为失败：
                // 「半套数据」不能冒充一次成功的完整同步。
                // fail_run 自身失败不得吞掉主错误：用户拿到的退出码以 Auth/Tool 等主因语义为准，
                // 台账收尾是尽力而为（最坏残留一行 running，不影响『最近成功』判定）。
                let _ = fail_run(store, run_id, pages_fetched, received, upserted, &rejections, out_of_scope, remote_total, &e, secret);
                return Err(e);
            }
        };

        pages_fetched += 1;
        if page.total.is_some() {
            remote_total = page.total;
        }

        for reason in &page.rejected {
            rejections.add(reason);
        }

        let mut items: Vec<WorkItem> = Vec::with_capacity(page.items.len());
        for record in &page.items {
            match to_work_item(record) {
                Ok(item) => items.push(item),
                Err(reason) => rejections.add(&reason),
            }
        }

        // 收到的条数按「接口给了多少条」计，拒绝掉的也算收到过
        received += page.items.len() + page.rejected.len();

        // 类型范围在**本地**过滤，不改 `list_todo` 的查询条件：那套条件已验证过「与我相关」的语义，
        // 换成按类型筛请求可能悄悄改变可见范围。被筛掉的条数单独记 `items_out_of_scope`，
        // 绝不混进 `items_rejected`（后者是「数据形状不对」，前者的数据是好的）。
        let items = match ctx.type_scope {
            Some(scope) => {
                let mut kept = Vec::with_capacity(items.len());
                for item in items {
                    let (project_key, type_key, _) = item.id.key_tuple();
                    if scope.allows(&project_key, &type_key) {
                        kept.push(item);
                    } else {
                        out_of_scope += 1;
                    }
                }
                kept
            }
            None => items,
        };

        seen_items.extend(items.iter().map(|item| item.id.key_tuple()));

        let store_started = Instant::now();
        let saved = store.upsert_items(run_id, &items, now_ms());
        summary_store_ms += elapsed_ms(store_started);
        let stats = match saved {
            Ok(stats) => stats,
            Err(e) => {
                // 落库失败也必须收尾运行记录，否则这一行永远停在 running；策略同上：主错误优先返回
                let _ = fail_run(store, run_id, pages_fetched, received, upserted, &rejections, out_of_scope, remote_total, &e, secret);
                return Err(e);
            }
        };
        upserted.inserted += stats.inserted;
        upserted.updated += stats.updated;

        // 终止判定：空页（核对 total）→ 到 total → 上限
        let page_received = page.items.len() + page.rejected.len();
        if page_received == 0 && remote_total.is_some_and(|n| received < n as usize) {
            let e = BackendError::parse("待办分页", "尚未达到 total 就返回空页，结果不完整");
            let _ = fail_run(store, run_id, pages_fetched, received, upserted, &rejections, out_of_scope, remote_total, &e, secret);
            return Err(e);
        }
        if page_received == 0 {
            stop = StopReason::EmptyPage;
            break;
        }
        if let Some(total) = remote_total {
            if received as i64 >= total {
                stop = StopReason::TotalReached;
                break;
            }
            // 还没到 total：即使本页不足假定页宽也继续，避免按未实测的 50 提前收尾
        }

        if page_num == max_pages {
            stop = StopReason::MaxPages;
            break;
        }
    }

    let complete = !stop.data_may_be_incomplete() && rejections.total() == 0;
    let status = if complete { RunStatus::Success } else { RunStatus::Failed };
    let error_note = match stop {
        StopReason::MaxPages => Some((
            "incomplete".to_string(),
            format!(
                "达到 max_pages={max_pages} 上限（每页假定 {PAGE_SIZE_ASSUMED} 条），数据可能不完整；\
                 本次不计为成功同步，可调大 max_pages 后重试"
            ),
        )),
        _ if rejections.total() > 0 => Some(("parse".to_string(),
            "部分事项无法解析，保留已有清单，请重试同步".to_string())),
        _ => None,
    };

// 终局收尾与 fail_run 不同：这里没有主错误可保护，那次 UPDATE 失败就必须如实上抛——
// 否则台账行留在 running、报告被丢弃，CLI 反而看不到真实状态。
    store.finish_run_with_scope(
        run_id,
        status,
        pages_fetched as i64,
        received as i64,
        (upserted.inserted + upserted.updated) as i64,
        rejections.total() as i64,
        out_of_scope as i64,
        remote_total,
        Some(stop),
        error_note.as_ref().map(|(k, m)| (k.as_str(), m.as_str())),
        rejections.as_json().as_deref(),
        &seen_items,
        ctx.type_scope,
        now_ms(),
    )?;

    Ok(SyncReport {
        run_id,
        status,
        action: query_label,
        todo_scope: scope,
        trigger: ctx.trigger,
        source_id: ctx.source_id.map(|s| s.to_string()),
        pages_fetched,
        items_received: received,
        items_upserted: upserted.inserted + upserted.updated,
        items_inserted: upserted.inserted,
        items_updated: upserted.updated,
        items_rejected: rejections.total(),
        items_out_of_scope: out_of_scope,
        remote_total,
        stop_reason: stop,
        complete,
        full_scan: source.is_full_scan(),
        rejections: rejections.stats(),
        performance: SyncPerformance::default(),
    })
    }.await;
    let mut performance = source.sync_performance();
    performance.elapsed_ms = elapsed_ms(clock);
    performance.summary_store_ms = summary_store_ms;
    // 诊断失败不覆盖同步的业务结果，失败运行同样尽力保留统计。
    let _ = store.save_run_performance(run_id, &performance);
    result.map(|mut report: SyncReport| { report.performance = performance; report })
}

/// 失败收尾：保留已落地数据 + 写入 failed 记录。
#[allow(clippy::too_many_arguments)]
fn fail_run(
    store: &Store,
    run_id: i64,
    pages_fetched: usize,
    received: usize,
    upserted: UpsertStats,
    rejections: &RejectionLedger,
    out_of_scope: usize,
    remote_total: Option<i64>,
    error: &BackendError,
    secret: Option<&str>,
) -> Result<(), BackendError> {
    // 错误文本落库前用已加载凭证做二次擦除（构造侧已保证凭证不进错误文本，这是第二道防线）
    let safe = error.safe_message(secret);
    store.finish_run(
        run_id,
        RunStatus::Failed,
        pages_fetched as i64,
        received as i64,
        (upserted.inserted + upserted.updated) as i64,
        rejections.total() as i64,
        out_of_scope as i64,
        remote_total,
        Some(StopReason::Error),
        Some((error.kind().as_str(), safe.as_str())),
        rejections.as_json().as_deref(),
        &HashSet::new(),
        now_ms(),
    )
}

fn truncate(text: &str, max: usize) -> String {
    let count = text.chars().count();
    if count <= max {
        return text.to_string();
    }
    let cut: String = text.chars().take(max).collect();
    format!("{cut}…")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ledger_counts_and_keeps_one_sample_per_code() {
        let mut l = RejectionLedger::default();
        l.add(&RejectReason::new("missing_work_item_id", "第 1 条"));
        l.add(&RejectReason::new("missing_work_item_id", "第 2 条很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长"));
        l.add(&RejectReason::new("item_shape_mismatch", "形状不符"));
        let stats = l.stats();
        assert_eq!(stats.len(), 2, "按原因码聚合");
        assert_eq!(stats[0].code, "item_shape_mismatch");
        assert_eq!(stats[1].code, "missing_work_item_id");
        assert_eq!(stats[1].count, 2);
        assert_eq!(l.total(), 3);
        assert!(stats[1].sample.chars().count() <= REJECTION_SAMPLE_CHARS + 1, "样本要截断");
        let json = l.as_json().unwrap();
        assert!(json.contains("missing_work_item_id"));
        assert_eq!(RejectionLedger::default().as_json(), None, "无拒绝时不写空 JSON");
    }

    #[test]
    fn max_pages_is_marked_incomplete() {
        assert!(StopReason::MaxPages.data_may_be_incomplete());
        assert!(StopReason::Error.data_may_be_incomplete());
        assert!(!StopReason::TotalReached.data_may_be_incomplete());
        assert!(!StopReason::EmptyPage.data_may_be_incomplete());
        assert!(!StopReason::ShortPage.data_may_be_incomplete());
    }
}
