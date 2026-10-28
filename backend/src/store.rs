//! SQLite 本地缓存。
//!
//! 本模块承担任务书二.5 的四条硬要求，实现方式如下：
//!
//! | 要求 | 做法 |
//! |---|---|
//! | 重复同步不产生重复事项 | 主键 = `(project_key, work_item_type_key, work_item_id)`，写入统一走 `INSERT ... ON CONFLICT DO UPDATE`；`first_seen_at_ms` 只在新建时写，`seen_count` 累加 |
//! | 同步失败不得清空缓存 | 失败保留已取得的数据，不撤销任何来源归属 |
//! | 清单跟随来源当前结果 | 完整成功后撤销本来源缺席事项；其他来源仍包含的事项保留，不操作远端 |
//! | 提供最近一次成功同步的信息 | `sync_run` 带 `status`，`last_successful_sync()` 只认 `success`；失败运行永不覆盖它 |
//!
//! 写入按页提交：某页成功就先落地，后续页失败时已落地部分保留，
//! 但整次运行仍记为 `failed`，`last_successful_sync()` 也不会指向它。
//! 「回滚整次同步」也是一种可选策略，但本轮未与产品确认，
//! 因此选择「保留已取得的数据 + 如实标记本次失败」这种不丢信息的一侧。

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::error::BackendError;
use crate::model::domain::{FlowInfo, FlowKind, Schedule, WorkItem, WorkItemId};
use crate::paths;

mod type_preferences;
pub use type_preferences::{SourceTypePreferences, TypePreference, TypePreferences};

/// 当前 schema 版本。升高前请确认迁移语句可重入。
pub const SCHEMA_VERSION: i64 = 17;

/// 事项离开所有来源后，详情与图片保留七天，期间重新出现则取消清理。
const ITEM_CACHE_GRACE_MS: i64 = 7 * 24 * 60 * 60 * 1000;

/// 一次同步是谁发起的。诊断口径：前端每 2 分钟一轮，日志量比手动大一个数量级，
/// 排查时必须能按发起方式分开看（也决定是否受 `sync_run_retention` 轮转影响）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RunTrigger {
    Manual,
    Automatic,
}

impl RunTrigger {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Automatic => "automatic",
        }
    }

    fn parse(s: &str) -> Self {
        match s {
            "automatic" => Self::Automatic,
            _ => Self::Manual,
        }
    }
}

/// 同步运行状态。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Running,
    Success,
    Failed,
}

impl RunStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::Success => "success",
            Self::Failed => "failed",
        }
    }

    fn parse(s: &str) -> Self {
        match s {
            "success" => Self::Success,
            "failed" => Self::Failed,
            _ => Self::Running,
        }
    }
}

/// 本次翻页为什么停止。落库并回传，避免「取完了」和「被上限截断」混淆。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    /// 末页：本页条数少于每页条数（元数据称固定 50 条）。
    ShortPage,
    /// 累计条数已达到响应 `total`。
    TotalReached,
    /// 某页返回 0 条。
    EmptyPage,
    /// 触到 `max_pages` 上限，**数据可能不完整**。
    MaxPages,
    /// 中途出错，数据不完整。
    Error,
}

impl StopReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ShortPage => "short_page",
            Self::TotalReached => "total_reached",
            Self::EmptyPage => "empty_page",
            Self::MaxPages => "max_pages",
            Self::Error => "error",
        }
    }

    fn parse(s: &str) -> Option<Self> {
        match s {
            "short_page" => Some(Self::ShortPage),
            "total_reached" => Some(Self::TotalReached),
            "empty_page" => Some(Self::EmptyPage),
            "max_pages" => Some(Self::MaxPages),
            "error" => Some(Self::Error),
            _ => None,
        }
    }

    /// 是否意味着「远端数据可能没取全」。
    pub fn data_may_be_incomplete(self) -> bool {
        matches!(self, Self::MaxPages | Self::Error)
    }
}

/// 一次同步运行的完整记录（`sync_run` 一行）。
#[derive(Debug, Clone, Serialize)]
pub struct SyncRun {
    pub id: i64,
    pub started_at_ms: i64,
    pub finished_at_ms: Option<i64>,
    pub action: String,
    pub todo_scope: Option<String>,
    /// 谁发起的这一次同步（manual / automatic）。
    pub trigger: RunTrigger,
    /// 发起时使用的来源 id；老库里为 `None`（当时的入口不记来源）。
    pub source_id: Option<String>,
    pub status: RunStatus,
    pub pages_fetched: i64,
    pub items_received: i64,
    pub items_upserted: i64,
    pub items_rejected: i64,
    /// 收到了但落在来源类型范围之外、因此**没有入库**的条数。
    /// 单独计数，是为了让「范围筛掉了」和「结构不符被拒绝」在台账上可区分。
    pub items_out_of_scope: i64,
    pub remote_total: Option<i64>,
    pub stop_reason: Option<StopReason>,
    pub error_kind: Option<String>,
    pub error_message: Option<String>,
    /// 拒绝原因计数，例如 `{"missing_work_item_id":2}`。
    pub rejection_detail: Option<String>,
    /// 老运行没有诊断数据时为 None。
    pub performance: Option<crate::sync_metrics::SyncPerformance>,
}

/// 落库统计。
#[derive(Debug, Clone, Copy, Default, Serialize)]
pub struct UpsertStats {
    pub inserted: usize,
    pub updated: usize,
}

/// 缓存中的一条事项：内部模型 + 本地可见性信息。
#[derive(Debug, Clone, Serialize)]
pub struct CachedItem {
    #[serde(flatten)]
    pub item: WorkItem,
    /// 全部当前来源归属；不能用最近一次同步的来源替代多对多关系。
    pub source_ids: Vec<String>,
    /// 各个人来源的本人节点；全局流程仍来自同一份完整详情。
    pub personal_flows: std::collections::BTreeMap<String, FlowInfo>,
    /// 待办接口的节点排期按来源保留，不能覆盖事项自身排期。
    pub personal_schedules: std::collections::BTreeMap<String, Schedule>,
    /// 飞书完整详情中的业务时间；不使用本地同步时间补齐。
    pub created_at_ms: Option<i64>,
    pub updated_at_ms: Option<i64>,
    /// 只使用远端 finish_status；未提供时保留未知。
    pub is_completed: Option<bool>,
    /// 完整详情内容的版本；抓取时间变化不触发详情页更新。
    pub detail_revision: Option<String>,
    /// 完整详情里的「所属项目」关联；缺字段时为空，不从空间名猜测。
    pub related_projects: Vec<crate::catalog::RelatedProject>,
    pub identity_missing_flags: Vec<String>,
    pub first_seen_at_ms: i64,
    pub last_seen_at_ms: i64,
    pub seen_count: i64,
}

/// 查询条件。本轮只提供已确认有意义的维度。
#[derive(Debug, Clone, Default)]
pub struct ItemFilter {
    pub project_key: Option<String>,
    pub type_key: Option<String>,
    pub flow: Option<FlowKind>,
    /// 名称模糊匹配（大小写不敏感）。
    pub text: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// 远端发现的一个工作项类型（快照行）。`executable = false` 的类型只用于展示，
/// 动作发现会跳过它——没有可执行的动作，UI 上也就不该出现「下一步」。
#[derive(Debug, Clone, Serialize)]
pub struct DiscoveredType {
    pub source_id: String,
    pub project_key: String,
    pub project_name: String,
    pub type_key: String,
    pub type_name: String,
    pub executable: bool,
    pub discovered_at_ms: i64,
}

/// 类型范围快照的一行（写库用，比 `DiscoveredType` 少来源与可执行标记）。
#[derive(Debug, Clone, Default)]
pub struct CachedType {
    pub project_key: String,
    pub project_name: String,
    pub type_key: String,
    pub type_name: String,
    /// 这条快照是什么时候发现的；写入时由 `save_source_types` 统一覆盖。
    pub discovered_at_ms: i64,
}

/// 同步类型范围。显式构造时按空间与类型白名单匹配；持久化配置按关闭类型过滤，
/// 未见过的新类型默认允许。len/is_empty 只描述当前已发现且开启的组合数。
#[derive(Debug, Clone, Default)]
pub struct TypeScope {
    keys: std::collections::HashSet<String>,
    // 保存的用户配置按关闭类型过滤，未见过的类型默认放行。
    disabled_types: Option<std::collections::HashSet<String>>,
}

impl TypeScope {
    /// 由 `(project_key, type_key)` 集合构造范围。
    ///
    /// 键的编码只在这个类型内部出现（`Self::key`），构造与判定都走这里，
    /// 免得编码规则散到同步层和测试里各写一遍。
    pub fn from_pairs<'a, I>(pairs: I) -> Self
    where
        I: IntoIterator<Item = (&'a str, &'a str)>,
    {
        let mut keys = std::collections::HashSet::new();
        for (project_key, type_key) in pairs {
            keys.insert(Self::key(project_key, type_key));
        }
        Self { keys, disabled_types: None }
    }
    fn key(project_key: &str, type_key: &str) -> String {
        format!("{project_key}\u{0}{type_key}")
    }

    pub fn allows(&self, project_key: &str, type_key: &str) -> bool {
        self.disabled_types.as_ref().map_or_else(
            || self.keys.contains(&Self::key(project_key, type_key)),
            |disabled| !disabled.contains(type_key),
        )
    }

    pub fn len(&self) -> usize {
        self.keys.len()
    }

    pub fn is_empty(&self) -> bool {
        self.keys.is_empty()
    }
}

/// 一次动作执行流水。`status` 取 `pending` / `success` / `failed` / `unknown`，
/// `pending` 与 `unknown` 都意味着「本地不知道远端到底改没改」，UI 与 CLI 都不能显示成功。
#[derive(Debug, Clone, Serialize)]
pub struct ActionRecord {
    pub request_id: String,
    pub item_id: String,
    pub action_kind: String,
    pub target: String,
    pub version: String,
    pub status: String,
    pub verified: bool,
    pub detail: Option<String>,
    pub created_at: i64,
    pub finished_at: Option<i64>,
}

const SELECT_COLUMNS: &str = "project_key, work_item_type_key, work_item_id, identity_missing_flags, \
     project_name, work_item_name, flow_kind, node_name, node_state_key, \
     start_state_key_name, end_state_key_name, schedule_start_raw, schedule_end_raw, \
     raw_json, first_seen_at_ms, last_seen_at_ms, seen_count, \
     (SELECT json_group_array(source_id) FROM work_item_source s \
      WHERE s.project_key = work_item.project_key \
        AND s.work_item_type_key = work_item.work_item_type_key \
        AND s.work_item_id = work_item.work_item_id), \
     (SELECT created_at_ms FROM item_detail d WHERE d.project_key=work_item.project_key \
        AND d.type_key=work_item.work_item_type_key AND d.item_id=work_item.work_item_id), \
     (SELECT updated_at_ms FROM item_detail d WHERE d.project_key=work_item.project_key \
        AND d.type_key=work_item.work_item_type_key AND d.item_id=work_item.work_item_id), \
     (SELECT is_completed FROM item_detail d WHERE d.project_key=work_item.project_key \
        AND d.type_key=work_item.work_item_type_key AND d.item_id=work_item.work_item_id), \
     (SELECT content_revision FROM item_detail d WHERE d.project_key=work_item.project_key \
        AND d.type_key=work_item.work_item_type_key AND d.item_id=work_item.work_item_id), \
     (SELECT json_group_object(source_id,json(personal_flow_json)) FROM work_item_source s \
      WHERE s.project_key=work_item.project_key AND s.work_item_type_key=work_item.work_item_type_key \
        AND s.work_item_id=work_item.work_item_id AND personal_flow_json IS NOT NULL), \
     (SELECT related_projects_json FROM item_detail d WHERE d.project_key=work_item.project_key \
        AND d.type_key=work_item.work_item_type_key AND d.item_id=work_item.work_item_id), \
     (SELECT json_group_object(source_id,json(personal_schedule_json)) FROM work_item_source s \
      WHERE s.project_key=work_item.project_key AND s.work_item_type_key=work_item.work_item_type_key \
        AND s.work_item_id=work_item.work_item_id AND personal_schedule_json IS NOT NULL)";

#[derive(Debug, Default)]
pub struct DetailCacheState {
    pub version: Option<String>,
    pub generation: i64,
}

/// 本地缓存库。
pub struct Store {
    conn: Mutex<Connection>,
    pub path: Option<std::path::PathBuf>,
}

impl Store {
    /// 打开（必要时创建）缓存库并跑迁移。
    pub fn open(path: &Path) -> Result<Self, BackendError> {
        paths::ensure_parent_dir(path)?;
        let conn = Connection::open(path)
            .map_err(|e| BackendError::Store {
                detail: format!("无法打开缓存库 {}: {e}", path.display()),
            })?;
        let store = Self { conn: Mutex::new(conn), path: Some(path.to_path_buf()) };
        store.init()?;
        Ok(store)
    }

    /// 内存库，供测试使用。
    pub fn in_memory() -> Result<Self, BackendError> {
        let conn = Connection::open_in_memory().map_err(|e| BackendError::Store { detail: e.to_string() })?;
        let store = Self { conn: Mutex::new(conn), path: None };
        store.init()?;
        Ok(store)
    }

    fn init(&self) -> Result<(), BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        let journal: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0))?;
        if self.path.is_some() && !journal.eq_ignore_ascii_case("wal") {
            let mode: String = conn.query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0))?;
            if !mode.eq_ignore_ascii_case("wal") {
                return Err(BackendError::Store { detail: format!("缓存库无法启用 WAL：{mode}") });
            }
        }
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;

        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(|e| BackendError::Store { detail: e.to_string() })?;

        if version > SCHEMA_VERSION {
            return Err(BackendError::Store {
                detail: format!("缓存库 schema 版本 {version} 高于本程序支持的 {SCHEMA_VERSION}，拒绝降级打开"),
            });
        }

        if version == SCHEMA_VERSION && schema_is_current(&conn)? { return Ok(()); }

        let tx = Transaction::new_unchecked(&conn, TransactionBehavior::Immediate)?;
        // 另一连接可能已在等待写锁期间完成迁移，必须在取得写锁后重新判断。
        let version: i64 = tx.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version > SCHEMA_VERSION {
            return Err(BackendError::Store { detail: format!("缓存库 schema 版本 {version} 高于本程序支持的 {SCHEMA_VERSION}，拒绝降级打开") });
        }
        if version == SCHEMA_VERSION && schema_is_current(&tx)? { return Ok(()); }
        tx.execute_batch(SCHEMA_V1).map_err(|e| BackendError::Store {
            detail: format!("初始化缓存库失败: {e}"),
        })?;
        tx.execute_batch(SCHEMA_V2)?;
        tx.execute_batch(SCHEMA_V3)?;
        tx.execute_batch(SCHEMA_V5)?;
        tx.execute_batch(SCHEMA_V6)?;
        tx.execute_batch(type_preferences::SCHEMA)?;
        if version < 6 {
            // 旧库未记录完整来源归属，先保留为待认领缓存，交给已配置来源逐次核对。
            tx.execute("INSERT OR IGNORE INTO work_item_source
                SELECT '', project_key, work_item_type_key, work_item_id, 0 FROM work_item", [])?;
        }
        tx.execute_batch("CREATE TABLE IF NOT EXISTS item_detail (
            project_key TEXT NOT NULL, type_key TEXT NOT NULL, item_id TEXT NOT NULL,
            snapshot_json TEXT NOT NULL, PRIMARY KEY(project_key,type_key,item_id));")?;

        if version < 8 {
            for table in ["work_item", "work_item_source"] {
                let present: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM pragma_table_info(?1) WHERE name='last_seen_run_id')",
                    [table], |r|r.get(0))?;
                if present { tx.execute_batch(&format!("ALTER TABLE {table} DROP COLUMN last_seen_run_id;"))?; }
            }
        }

        // 按来源保留本人节点，避免关联查询的全部节点反复覆盖个人待办摘要。
        ensure_column(&tx, "work_item_source", "personal_flow_json", "TEXT")?;
        ensure_column(&tx, "work_item_source", "personal_schedule_json", "TEXT")?;

        // 小字段与完整快照一起迁移；不为没有范围查询的远端时间建立索引。
        for (column, decl) in [
            ("cached_remote_version", "TEXT"), ("complete", "INTEGER NOT NULL DEFAULT 0"),
            ("refresh_required", "INTEGER NOT NULL DEFAULT 0"), ("refresh_generation", "INTEGER NOT NULL DEFAULT 0"), ("created_at_ms", "INTEGER"),
            ("updated_at_ms", "INTEGER"), ("is_completed", "INTEGER"), ("content_revision", "TEXT"),
            ("related_projects_json", "TEXT NOT NULL DEFAULT '[]'")
        ] { ensure_column(&tx, "item_detail", column, decl)?; }
        // 仅迁移时回填，普通清单读取只取小版本字段，不扫描完整详情。
        let old: Vec<(i64, String)> = {
            let mut stmt = tx.prepare("SELECT rowid,snapshot_json FROM item_detail WHERE (content_revision IS NULL OR ?1 < 17) AND snapshot_json <> 'null'")?;
            let rows = stmt.query_map([version], |r| Ok((r.get(0)?, r.get(1)?)))?;
            rows.collect::<Result<_, _>>()?
        };
        for (rowid, raw) in old {
            if let Ok(detail) = serde_json::from_str::<crate::detail::ItemDetail>(&raw) {
                tx.execute("UPDATE item_detail SET content_revision=?2,related_projects_json=?3 WHERE rowid=?1",
                    params![rowid, detail_content_revision(&detail)?, serde_json::to_string(&crate::catalog::related_projects(&detail.data))?])?;
            }
        }
        if version < 15 {
            let rows: Vec<(String,String,String,String)> = {
                let mut stmt = tx.prepare("SELECT w.project_key,w.work_item_type_key,w.work_item_id,d.snapshot_json
                    FROM work_item w JOIN item_detail d ON d.project_key=w.project_key AND d.type_key=w.work_item_type_key
                    AND d.item_id=w.work_item_id WHERE d.snapshot_json<>'null'")?;
                let rows = stmt.query_map([], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?)))?;
                rows.collect::<Result<_,_>>()?
            };
            for (p,t,i,detail) in rows {
                // 旧 raw_json 没有可靠的来源归属，不能据此复制节点排期；由各来源首次读取补齐。
                let detail: crate::detail::ItemDetail = serde_json::from_str(&detail)?;
                let schedule = work_item_from_summary(crate::detail::summary(&detail,serde_json::Value::Null))?.schedule;
                tx.execute("UPDATE work_item SET schedule_start_raw=?4,schedule_end_raw=?5
                    WHERE project_key=?1 AND work_item_type_key=?2 AND work_item_id=?3",
                    params![p,t,i,schedule.start_raw,schedule.end_raw])?;
            }
        }
        tx.execute_batch("CREATE TABLE IF NOT EXISTS source_version_evidence (
            source_id TEXT PRIMARY KEY, field TEXT NOT NULL, evidence TEXT NOT NULL, scope TEXT NOT NULL);")?;
        tx.execute_batch("CREATE TABLE IF NOT EXISTS workspace_catalog (
            project_key TEXT PRIMARY KEY, snapshot_json TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS workspace_catalog_refresh (
            id INTEGER PRIMARY KEY CHECK(id=1), generation INTEGER NOT NULL);
            INSERT OR IGNORE INTO workspace_catalog_refresh VALUES (1,0);")?;
        ensure_column(&tx, "source_version_evidence", "scope", "TEXT NOT NULL DEFAULT ''")?;
        if version < 9 {
            // 旧快照没有完整性证据，保留未知，下一次成功详情会补齐。
            let old: Vec<(String, String)> = {
                let mut stmt = tx.prepare("SELECT rowid, snapshot_json FROM item_detail")?;
                let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?.to_string(), r.get(1)?)))?;
                rows.collect::<Result<_, _>>()?
            };
            for (rowid, raw) in old {
                if let Ok(detail) = serde_json::from_str::<crate::detail::ItemDetail>(&raw) {
                    let (created, updated, completed) = detail_activity(&detail);
                    tx.execute("UPDATE item_detail SET created_at_ms=?2,updated_at_ms=?3,is_completed=?4 WHERE rowid=?1",
                        params![rowid,created,updated,completed])?;
                }
            }
        }
        tx.execute_batch("CREATE TABLE IF NOT EXISTS source_type_disabled (
            source_id TEXT NOT NULL, type_key TEXT NOT NULL,
            PRIMARY KEY(source_id, type_key));")?;
        if version < 10 {
            // 只迁移已发现且未选中的类型；未来新类型不再受旧白名单限制。
            tx.execute("INSERT OR IGNORE INTO source_type_disabled
                SELECT DISTINCT t.source_id, t.type_key FROM work_item_type t
                JOIN source_scope_configured c ON c.source_id=t.source_id
                WHERE NOT EXISTS (SELECT 1 FROM source_type_scope s
                    WHERE s.source_id=t.source_id AND s.type_key=t.type_key)", [])?;
        }
        tx.execute_batch("CREATE TABLE IF NOT EXISTS item_cache_gc (
            project_key TEXT NOT NULL, type_key TEXT NOT NULL, item_id TEXT NOT NULL,
            orphaned_at_ms INTEGER NOT NULL, PRIMARY KEY(project_key,type_key,item_id));")?;
        // 升级前已遗留的详情也从首次发现时开始缓冲，不能按旧抓取时间立即清除。
        tx.execute("INSERT OR IGNORE INTO item_cache_gc
            SELECT d.project_key,d.type_key,d.item_id,?1 FROM item_detail d
            WHERE NOT EXISTS (SELECT 1 FROM work_item w WHERE
                w.project_key=d.project_key AND w.work_item_type_key=d.type_key AND w.work_item_id=d.item_id)",
            [crate::sync::now_ms()])?;
        for (column, decl) in SYNC_RUN_V3_COLUMNS {
            ensure_column(&tx, "sync_run", column, decl)?;
        }
        ensure_column(&tx, "sync_run", "performance_json", "TEXT")?;
        ensure_column(&tx, "sync_run", "scan_mode", "TEXT NOT NULL DEFAULT 'full'")?;
        if version < SCHEMA_VERSION {
            tx.pragma_update(None, "user_version", SCHEMA_VERSION)
                .map_err(|e| BackendError::Store { detail: e.to_string() })?;
        }
        tx.commit()?;

        Ok(())
    }

    pub fn save_item_detail(&self, detail: &crate::detail::ItemDetail) -> Result<(), BackendError> {
        self.save_item_detail_versioned(detail, None)
    }

    /// 版本只能与成功保存的完整快照原子推进；没有观测版本保持未知。
    pub fn save_item_detail_versioned(&self, detail: &crate::detail::ItemDetail, version: Option<&str>) -> Result<(), BackendError> {
        self.save_item_detail_observed(detail, version, self.detail_generation(&detail.id)?)
    }

    pub fn detail_generation(&self, id: &WorkItemId) -> Result<i64, BackendError> {
        let (p,t,i)=id.key_tuple();
        Ok(self.conn.lock().expect("store mutex poisoned").query_row(
            "SELECT refresh_generation FROM item_detail WHERE project_key=?1 AND type_key=?2 AND item_id=?3",
            params![p,t,i],|r|r.get(0)).optional()?.unwrap_or(0))
    }

    pub fn save_item_detail_observed(&self, detail: &crate::detail::ItemDetail, version: Option<&str>, generation: i64) -> Result<(), BackendError> {
        let (p,t,i) = detail.id.key_tuple();
        let (created, updated, completed) = detail_activity(detail);
        let complete = detail.pages.last().is_some_and(|page| page["pagination"]["has_more"] == false);
        let detail_version = crate::detail::text(&detail.data["work_item_attribute"]["update_time"])
            .map(|v|format!("update_time:{v}"));
        let version = version.filter(|v| !v.trim().is_empty()).or(detail_version.as_deref());
        let raw = serde_json::to_string(detail).map_err(|e| BackendError::parse("详情缓存",e.to_string()))?;
        let revision = detail_content_revision(detail)?;
        let projects = serde_json::to_string(&crate::catalog::related_projects(&detail.data))?;
        let conn = self.conn.lock().expect("store mutex poisoned");
        let tx = Transaction::new_unchecked(&conn, TransactionBehavior::Immediate)?;
        let current: i64 = tx.query_row(
            "SELECT refresh_generation FROM item_detail WHERE project_key=?1 AND type_key=?2 AND item_id=?3",
            params![p,t,i], |r|r.get(0)).optional()?.unwrap_or(0);
        if current != generation {
            return Err(BackendError::conflict("详情读取期间发生了新的写入，保留待刷新标记，请重新检查"));
        }
        tx.execute(
            "INSERT INTO item_detail(project_key,type_key,item_id,snapshot_json,cached_remote_version,complete,
                refresh_required,created_at_ms,updated_at_ms,is_completed,content_revision,related_projects_json) VALUES (?1,?2,?3,?4,?5,?6,0,?7,?8,?9,?11,?12)
             ON CONFLICT(project_key,type_key,item_id) DO UPDATE SET snapshot_json=excluded.snapshot_json,
                cached_remote_version=CASE WHEN refresh_generation=?10 THEN excluded.cached_remote_version ELSE cached_remote_version END,
                complete=excluded.complete,refresh_required=CASE WHEN refresh_generation=?10 THEN 0 ELSE refresh_required END,
                created_at_ms=excluded.created_at_ms,updated_at_ms=excluded.updated_at_ms,is_completed=excluded.is_completed,
                content_revision=excluded.content_revision,related_projects_json=excluded.related_projects_json",
            params![p,t,i,raw,version.filter(|_| complete),complete,created,updated,completed,generation,revision,projects])?;
        // 详情刷新只能更新已有摘要，不能把已离开清单的事项重新加入。
        let a = &detail.data["work_item_attribute"];
        let state = a["work_item_mod"].as_str() == Some("状态流");
        tx.execute("UPDATE work_item SET
            work_item_name=COALESCE(?4,work_item_name), project_name=COALESCE(?5,project_name),
            flow_kind=CASE WHEN ?6 THEN 'state' ELSE flow_kind END,
            node_name=CASE WHEN ?6 THEN NULL ELSE node_name END,
            node_state_key=CASE WHEN ?6 THEN NULL ELSE node_state_key END,
            start_state_key_name=CASE WHEN ?6 THEN ?7 ELSE start_state_key_name END,
            end_state_key_name=CASE WHEN ?6 THEN NULL ELSE end_state_key_name END
            WHERE project_key=?1 AND work_item_type_key=?2 AND work_item_id=?3",
            params![p,t,i,crate::detail::text(&a["work_item_name"]),
                crate::detail::text(&a["owned_project"]["name"]),state,
                crate::detail::text(&a["work_item_status"]["name"])])?;
        // 在途详情可能晚于清理提交；未重新进入清单的快照仍须进入缓冲清理。
        tx.execute("INSERT OR IGNORE INTO item_cache_gc
            SELECT ?1,?2,?3,?4 WHERE NOT EXISTS (SELECT 1 FROM work_item
                WHERE project_key=?1 AND work_item_type_key=?2 AND work_item_id=?3)",
            params![p,t,i,crate::sync::now_ms()])?;
        tx.commit()?;
        Ok(())
    }

    /// 验证记录必须包含五类变更的实测证据，不能由清单“恰好有时间”推断可靠。
    pub fn record_version_evidence(&self, source: &crate::model::source::WorkSource, field: &str, evidence: &[String; 5]) -> Result<(), BackendError> {
        if evidence.iter().any(|s| s.trim().is_empty()) || field.trim().is_empty() {
            return Err(BackendError::validation("需要字段、状态、人员、节点、排期五类版本验证记录"));
        }
        self.conn.lock().expect("store mutex poisoned").execute(
            "INSERT INTO source_version_evidence VALUES (?1,?2,?3,?4)
             ON CONFLICT(source_id) DO UPDATE SET field=excluded.field,evidence=excluded.evidence,scope=excluded.scope",
            params![source.id,field,serde_json::to_string(evidence)?,format!("{source:?}")])?;
        Ok(())
    }

    pub fn source_version_field(&self, source: &crate::model::source::WorkSource) -> Result<Option<String>, BackendError> {
        Ok(self.conn.lock().expect("store mutex poisoned").query_row(
            "SELECT field FROM source_version_evidence WHERE source_id=?1 AND scope=?2", params![source.id,format!("{source:?}")], |r| r.get(0)).optional()?)
    }

    /// 每页一次连接锁、一次批量身份查询，仅返回小字段，不读取详情 JSON。
    pub fn detail_versions(&self, ids: &[WorkItemId]) -> Result<std::collections::HashMap<(String,String,String), DetailCacheState>, BackendError> {
        let keys: Vec<_> = ids.iter().map(|id| {
            let (p,t,i)=id.key_tuple(); serde_json::json!([p,t,i])
        }).collect();
        let payload = serde_json::to_string(&keys)?;
        let conn = self.conn.lock().expect("store mutex poisoned");
        let mut stmt = conn.prepare("SELECT d.project_key,d.type_key,d.item_id,CASE WHEN d.complete=1 AND d.refresh_required=0 THEN d.cached_remote_version END,d.refresh_generation
            FROM json_each(?1) k JOIN item_detail d ON
            d.project_key=json_extract(k.value,'$[0]') AND d.type_key=json_extract(k.value,'$[1]')
            AND d.item_id=json_extract(k.value,'$[2]')")?;
        let rows = stmt.query_map([payload], |r| Ok(((r.get(0)?,r.get(1)?,r.get(2)?),DetailCacheState { version: r.get(3)?, generation: r.get(4)? })))?;
        Ok(rows.collect::<Result<_,_>>()?)
    }

    pub fn mark_detail_refresh(&self, id: &WorkItemId) -> Result<(), BackendError> {
        let (p,t,i)=id.key_tuple();
        self.conn.lock().expect("store mutex poisoned").execute(
            "INSERT INTO item_detail(project_key,type_key,item_id,snapshot_json,refresh_required,refresh_generation)
             VALUES (?1,?2,?3,'null',1,1) ON CONFLICT(project_key,type_key,item_id) DO UPDATE SET
             refresh_required=1,refresh_generation=refresh_generation+1",
            params![p,t,i])?;
        Ok(())
    }

    /// 旧版没有来源归属：由当前已启用来源分别核对，避免迁移时误丢重叠来源。
    pub fn adopt_legacy_items(&self, source_ids: &[&str]) -> Result<(), BackendError> {
        if source_ids.is_empty() { return Ok(()); }
        let conn = self.conn.lock().expect("store mutex poisoned");
        let legacy: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM work_item_source WHERE source_id='')", [], |r|r.get(0))?;
        if !legacy { return Ok(()); }
        let tx = Transaction::new_unchecked(&conn, TransactionBehavior::Immediate)?;
        for source_id in source_ids {
            tx.execute("INSERT OR IGNORE INTO work_item_source
                (source_id, project_key, work_item_type_key, work_item_id)
                SELECT ?1, project_key, work_item_type_key, work_item_id
                FROM work_item_source WHERE source_id=''", params![source_id])?;
        }
        tx.execute("DELETE FROM work_item_source WHERE source_id=''", [])?;
        tx.commit()?;
        Ok(())
    }

    pub fn item_detail(&self, id: &WorkItemId) -> Result<Option<crate::detail::ItemDetail>, BackendError> {
        let (p,t,i) = id.key_tuple();
        let raw: Option<String> = self.conn.lock().expect("store mutex poisoned").query_row(
            "SELECT snapshot_json FROM item_detail WHERE project_key=?1 AND type_key=?2 AND item_id=?3 AND snapshot_json <> 'null'",
            params![p,t,i], |r| r.get(0)).optional()?;
        raw.map(|s|serde_json::from_str(&s).map_err(|e|BackendError::parse("详情缓存",e.to_string()))).transpose()
    }

    /// 凭证表只接收操作系统密钥加密的密文，不接收令牌原文。
    pub(crate) fn save_token_ciphertext(&self, ciphertext: &[u8]) -> Result<(), BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let tx = Transaction::new_unchecked(&conn, TransactionBehavior::Immediate)?;
        tx.execute(
            "INSERT INTO credential (id, ciphertext) VALUES ('mcp_token', ?1)
             ON CONFLICT(id) DO UPDATE SET ciphertext = excluded.ciphertext",
            params![ciphertext],
        )?;
        // 换凭证与作废旧目录刷新必须一起提交，避免旧账号结果晚到后覆盖缓存。
        tx.execute("UPDATE workspace_catalog_refresh SET generation=generation+1 WHERE id=1", [])?;
        tx.commit()?;
        Ok(())
    }

    pub(crate) fn load_token_ciphertext(&self) -> Result<Option<Vec<u8>>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        Ok(conn.query_row(
            "SELECT ciphertext FROM credential WHERE id = 'mcp_token'",
            [],
            |r| r.get(0),
        ).optional()?)
    }

    /// 登记一次同步运行，返回 `run_id`。
    pub fn begin_run(
        &self,
        action: &str,
        todo_scope: Option<&str>,
        trigger: RunTrigger,
        source_id: Option<&str>,
        now_ms: i64,
    ) -> Result<i64, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        conn.execute(
            "INSERT INTO sync_run (started_at_ms, action, todo_scope, trigger, source_id, status) \
             VALUES (?1, ?2, ?3, ?4, ?5, 'running')",
            params![now_ms, action, todo_scope, trigger.as_str(), source_id],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn set_run_scan_mode(&self, run_id: i64, full: bool) -> Result<(), BackendError> {
        self.conn.lock().expect("store mutex poisoned").execute(
            "UPDATE sync_run SET scan_mode=?2 WHERE id=?1", params![run_id,if full {"full"} else {"partial"}])?;
        Ok(())
    }

    /// 逐页落库：把一页工作项写入缓存。
    ///
    /// 每页一个事务；页与页之间不加全局事务，理由见模块头。
    pub fn upsert_items(&self, run_id: i64, items: &[WorkItem], now_ms: i64) -> Result<UpsertStats, BackendError> {
        let mut stats = UpsertStats::default();
        if items.is_empty() {
            return Ok(stats);
        }
        let conn = self.conn.lock().expect("store mutex poisoned");
        let tx = Transaction::new_unchecked(&conn, TransactionBehavior::Immediate)?;

        let (source_id, personal): (Option<String>, bool) = tx.query_row(
            "SELECT source_id, action IN ('todo','done','overdue','this_week') FROM sync_run WHERE id=?1",
            params![run_id], |r| Ok((r.get(0)?,r.get(1)?)))?;
        // 先整体判定「这些身份键是否已存在」，再执行 UPSERT。
        // 分两趟是为了避开同一连接上两条语句同时借用；页内条数很小，代价可接受。
        let mut existing: Vec<Option<WorkItem>> = Vec::with_capacity(items.len());
        {
            let mut probe = tx.prepare_cached(&format!("SELECT {SELECT_COLUMNS} FROM work_item
                 WHERE project_key = ?1 AND work_item_type_key = ?2 AND work_item_id = ?3 LIMIT 1"))?;
            for item in items {
                let (p, t, i) = item.id.key_tuple();
                let found = probe
                    .query_row(params![p, t, i], |r| Ok(map_cached_item(r)?.item))
                    .optional()?;
                existing.push(found);
            }
        }

        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO work_item (
                    project_key, work_item_type_key, work_item_id, identity_missing_flags,
                    project_name, work_item_name, flow_kind, node_name, node_state_key,
                    start_state_key_name, end_state_key_name, schedule_start_raw, schedule_end_raw,
                    raw_json, first_seen_at_ms, last_seen_at_ms, seen_count)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?15,1)
                 ON CONFLICT(project_key, work_item_type_key, work_item_id) DO UPDATE SET
                    identity_missing_flags = excluded.identity_missing_flags,
                    project_name           = excluded.project_name,
                    work_item_name         = excluded.work_item_name,
                    flow_kind              = excluded.flow_kind,
                    node_name              = excluded.node_name,
                    node_state_key         = excluded.node_state_key,
                    start_state_key_name   = excluded.start_state_key_name,
                    end_state_key_name     = excluded.end_state_key_name,
                    schedule_start_raw     = excluded.schedule_start_raw,
                    schedule_end_raw       = excluded.schedule_end_raw,
                    raw_json               = excluded.raw_json,
                    last_seen_at_ms        = excluded.last_seen_at_ms,
                    seen_count             = seen_count + 1",
            )?;

            let mut batch_latest = std::collections::HashMap::new();
            for (item, probe_existed) in items.iter().zip(existing.iter()) {
                let (p, t, i) = item.id.key_tuple();
                let personal_flow = personal.then(||serde_json::to_string(&item.flow)).transpose()?;
                let personal_schedule = personal.then(||serde_json::to_string(&item.schedule)).transpose()?;
                let old_schedule: Option<String> = tx.query_row("SELECT personal_schedule_json FROM work_item_source
                    WHERE source_id=?1 AND project_key=?2 AND work_item_type_key=?3 AND work_item_id=?4",
                    params![source_id.as_deref().unwrap_or(""),p,t,i], |r|r.get(0)).optional()?.flatten();
                let schedule_changed = personal && old_schedule.as_ref().is_some_and(|old| Some(old) != personal_schedule.as_ref());
                let mut effective = item.clone();
                if personal {
                    let raw: Option<String> = tx.query_row("SELECT snapshot_json FROM item_detail
                        WHERE project_key=?1 AND type_key=?2 AND item_id=?3 AND snapshot_json<>'null'",
                        params![p,t,i],|r|r.get(0)).optional()?;
                    if let Some(raw) = raw {
                        let detail: crate::detail::ItemDetail = serde_json::from_str(&raw)?;
                        let summary = crate::detail::summary(&detail,serde_json::Value::Null);
                        let canonical = work_item_from_summary(summary)?;
                        effective.flow = canonical.flow;
                        effective.schedule = canonical.schedule;
                    }
                }
                let item = &effective;
                // 同页重复身份按上一条实际写入的业务值比较。
                let key = (p.clone(), t.clone(), i.clone());
                let previous = batch_latest.insert(key, item.clone()).or_else(||probe_existed.clone());
                let unchanged = previous.as_ref() == Some(item);
                let business_unchanged = previous.as_ref().is_some_and(|old| old.id == item.id
                    && old.project_name == item.project_name && old.name == item.name
                    && old.flow == item.flow && old.schedule == item.schedule);
                let flags = serde_json::to_string(&item.id.missing_parts())?;
                if !unchanged { stmt.execute(params![
                    p, t, i, flags,
                    item.project_name, item.name,
                    item.flow.kind.as_str(), item.flow.node_name, item.flow.node_state_key,
                    item.flow.start_state_key_name, item.flow.end_state_key_name,
                    item.schedule.start_raw, item.schedule.end_raw,
                    item.raw_json, now_ms,
                ])?; } else {
                    tx.execute("UPDATE work_item SET last_seen_at_ms=?4,seen_count=seen_count+1 WHERE project_key=?1 AND work_item_type_key=?2 AND work_item_id=?3", params![p,t,i,now_ms])?;
                }
                tx.execute("INSERT INTO work_item_source
                    (source_id, project_key, work_item_type_key, work_item_id,personal_flow_json,personal_schedule_json)
                    VALUES (?1,?2,?3,?4,?5,?6)
                    ON CONFLICT(source_id,project_key,work_item_type_key,work_item_id)
                    DO UPDATE SET personal_flow_json=excluded.personal_flow_json,personal_schedule_json=excluded.personal_schedule_json",
                    params![source_id.as_deref().unwrap_or(""),p,t,i,personal_flow,personal_schedule])?;
                tx.execute("DELETE FROM item_cache_gc WHERE project_key=?1 AND type_key=?2 AND item_id=?3",
                    params![p,t,i])?;
                if previous.is_some() {
                    if !business_unchanged || schedule_changed { stats.updated += 1; }
                } else {
                    stats.inserted += 1;
                }
            }
        }

        tx.commit()?;
        Ok(stats)
    }

    /// 结束一次运行。失败与成功走同一入口，由 `status` 区分。
    #[allow(clippy::too_many_arguments)]
    pub fn finish_run(
        &self,
        run_id: i64,
        status: RunStatus,
        pages_fetched: i64,
        items_received: i64,
        items_upserted: i64,
        items_rejected: i64,
        items_out_of_scope: i64,
        remote_total: Option<i64>,
        stop_reason: Option<StopReason>,
        error: Option<(&str, &str)>,
        rejection_detail: Option<&str>,
        seen_items: &std::collections::HashSet<(String, String, String)>,
        now_ms: i64,
    ) -> Result<(), BackendError> {
        self.finish_run_with_scope(run_id, status, pages_fetched, items_received,
            items_upserted, items_rejected, items_out_of_scope, remote_total,
            stop_reason, error, rejection_detail, seen_items, None, now_ms)
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) fn finish_run_with_scope(
        &self,
        run_id: i64,
        status: RunStatus,
        pages_fetched: i64,
        items_received: i64,
        items_upserted: i64,
        items_rejected: i64,
        items_out_of_scope: i64,
        remote_total: Option<i64>,
        stop_reason: Option<StopReason>,
        error: Option<(&str, &str)>,
        rejection_detail: Option<&str>,
        seen_items: &std::collections::HashSet<(String, String, String)>,
        type_scope: Option<&TypeScope>,
        now_ms: i64,
    ) -> Result<(), BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let tx = Transaction::new_unchecked(&conn, TransactionBehavior::Immediate)?;
        tx.execute(
            "UPDATE sync_run SET finished_at_ms = ?2, status = ?3, pages_fetched = ?4,
                items_received = ?5, items_upserted = ?6, items_rejected = ?7,
                items_out_of_scope = ?13,
                remote_total = ?8, stop_reason = ?9, error_kind = ?10, error_message = ?11,
                rejection_detail = ?12
             WHERE id = ?1",
            params![
                run_id, now_ms, status.as_str(), pages_fetched, items_received, items_upserted,
                items_rejected, remote_total, stop_reason.map(|s| s.as_str()),
                error.map(|(k, _)| k), error.map(|(_, m)| m), rejection_detail, items_out_of_scope
            ],
        )?;
        let full: bool = tx.query_row("SELECT scan_mode='full' FROM sync_run WHERE id=?1", [run_id], |r| r.get(0))?;
        if full && status == RunStatus::Success && items_rejected == 0
            && stop_reason.is_some_and(|s| !s.data_may_be_incomplete()) {
            let source_id: Option<String> = tx.query_row(
                "SELECT source_id FROM sync_run WHERE id=?1",
                params![run_id],
                |row| row.get(0),
            ).optional()?.flatten();
            let source_id = source_id.unwrap_or_default();
            let latest_run_id: i64 = tx.query_row(
                "SELECT COALESCE(MAX(id), ?2) FROM sync_run WHERE COALESCE(source_id, '') = ?1",
                params![source_id, run_id],
                |row| row.get(0),
            )?;
            // A newer run may have written partial results while this one was fetching pages.
            if latest_run_id == run_id {
                let mut stale_memberships = Vec::new();
                {
                    let mut stmt = tx.prepare("SELECT project_key, work_item_type_key, work_item_id
                        FROM work_item_source WHERE source_id=?1")?;
                    let rows = stmt.query_map(params![source_id], |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
                    })?;
                    for row in rows {
                        let key = row?;
                        if !seen_items.contains(&key)
                            && type_scope.is_none_or(|scope| scope.allows(&key.0, &key.1)) {
                            stale_memberships.push(key);
                        }
                    }
                }
                for (project_key, type_key, work_item_id) in stale_memberships {
                    tx.execute("DELETE FROM work_item_source
                        WHERE source_id=?1 AND project_key=?2 AND work_item_type_key=?3 AND work_item_id=?4",
                        params![source_id, project_key, type_key, work_item_id])?;
                }
                tx.execute("INSERT OR IGNORE INTO item_cache_gc
                    SELECT project_key,work_item_type_key,work_item_id,?1 FROM work_item w
                    WHERE NOT EXISTS (SELECT 1 FROM work_item_source s WHERE
                        s.project_key=w.project_key AND s.work_item_type_key=w.work_item_type_key
                        AND s.work_item_id=w.work_item_id)", [now_ms])?;
                tx.execute("DELETE FROM work_item WHERE NOT EXISTS (
                    SELECT 1 FROM work_item_source s WHERE s.project_key=work_item.project_key
                    AND s.work_item_type_key=work_item.work_item_type_key
                    AND s.work_item_id=work_item.work_item_id)", [])?;
            }
        }
        tx.commit()?;
        drop(conn);
        if full && status == RunStatus::Success && items_rejected == 0
            && stop_reason.is_some_and(|s| !s.data_may_be_incomplete()) {
            let _ = self.prune_item_caches(now_ms);
            if let Some(path) = &self.path { crate::field_images::prune_cache(path); }
        }
        Ok(())
    }

    /// SQLite 写锁覆盖文件清理，防止另一会话恰在此时重新同步到同一事项。
    pub(crate) fn prune_item_caches(&self, now_ms: i64) -> Result<(), BackendError> {
        let mut conn = self.conn.lock().expect("store mutex poisoned");
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let expired = {
            let mut stmt = tx.prepare("SELECT g.project_key,g.type_key,g.item_id FROM item_cache_gc g
                WHERE g.orphaned_at_ms <= ?1 AND NOT EXISTS (SELECT 1 FROM work_item w
                    WHERE w.project_key=g.project_key AND w.work_item_type_key=g.type_key
                    AND w.work_item_id=g.item_id)")?;
            let rows = stmt.query_map([now_ms.saturating_sub(ITEM_CACHE_GRACE_MS)],
                |r| Ok((r.get::<_, String>(0)?,r.get::<_, String>(1)?,r.get::<_, String>(2)?)))?;
            rows.collect::<Result<Vec<_>, _>>()?
        };
        for key in expired {
            if let Some(db_path) = &self.path {
                let directory = crate::field_images::item_cache_directory(db_path, &key);
                match std::fs::remove_dir_all(directory) {
                    Ok(()) => (),
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
                    Err(_) => continue, // 文件仍被占用时连同详情保留，下次重试。
                }
            }
            tx.execute("DELETE FROM item_detail WHERE project_key=?1 AND type_key=?2 AND item_id=?3",
                params![key.0,key.1,key.2])?;
            tx.execute("DELETE FROM item_cache_gc WHERE project_key=?1 AND type_key=?2 AND item_id=?3",
                params![key.0,key.1,key.2])?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn save_run_performance(&self, run_id: i64, performance: &crate::sync_metrics::SyncPerformance) -> Result<(), BackendError> {
        let value = serde_json::to_string(performance)?;
        self.conn.lock().expect("store mutex poisoned").execute(
            "UPDATE sync_run SET performance_json=?2 WHERE id=?1", params![run_id, value])?;
        Ok(())
    }

    /// 日志轮转：只保留最近 `keep` 条**已结束**的运行记录。
    ///
    /// 自动同步按 2 分钟一轮跑，一天最多 720 条，不清理会无限增长。
    /// 规则刻意保守：`keep == 0` 表示不清理；`running` 行永不删（那是没收尾的现场，
    /// 删了就等于抹掉一次异常的证据）。
    pub fn prune_runs(&self, keep: i64) -> Result<i64, BackendError> {
        if keep <= 0 {
            return Ok(0);
        }
        let conn = self.conn.lock().expect("store mutex poisoned");
        // 只回传删除条数给调用方记录，不往 sync_run 里塞轮转自身的行。
        let deleted = conn.execute(
            "DELETE FROM sync_run
             WHERE status <> 'running' AND id NOT IN (
                 SELECT id FROM sync_run WHERE status <> 'running' ORDER BY id DESC LIMIT ?1
             )",
            params![keep],
        )? as i64;
        Ok(deleted)
    }

    pub fn count_items(&self) -> Result<i64, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM work_item", [], |r| r.get(0))?;
        Ok(n)
    }

    pub fn query_items(&self, filter: &ItemFilter) -> Result<Vec<CachedItem>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let mut sql = format!("SELECT {SELECT_COLUMNS} FROM work_item WHERE 1=1");
        let mut args: Vec<String> = Vec::new();

        if let Some(p) = &filter.project_key {
            sql.push_str(" AND project_key = ?");
            args.push(p.clone());
        }
        if let Some(t) = &filter.type_key {
            sql.push_str(" AND work_item_type_key = ?");
            args.push(t.clone());
        }
        if let Some(f) = filter.flow {
            sql.push_str(" AND flow_kind = ?");
            args.push(f.as_str().to_string());
        }
        if let Some(text) = &filter.text {
            // 大小写不敏感用 SQLite 的 LIKE（ASCII 不敏感）；中文本身无大小写，不受影响。
            // 用户输入里的 LIKE 元字符必须转义，否则 `--text "100%"` 会退化成通配匹配。
            let escaped = text.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
            sql.push_str(" AND work_item_name LIKE ? ESCAPE '\\'");
            args.push(format!("%{escaped}%"));
        }
        sql.push_str(" ORDER BY last_seen_at_ms DESC, project_key, work_item_type_key, work_item_id");
        sql.push_str(" LIMIT ? OFFSET ?");
        args.push((filter.limit.unwrap_or(200)).to_string());
        args.push((filter.offset.unwrap_or(0)).to_string());

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(args.iter()), map_cached_item)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// 最近一次**成功**的同步。没有成功记录时返回 `None`（而不是把失败记录当成功）。
    pub fn last_successful_sync(&self) -> Result<Option<SyncRun>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let row = conn
            .query_row(
                &format!(
                    "SELECT {RUN_COLUMNS} FROM sync_run WHERE status = 'success' ORDER BY id DESC LIMIT 1"
                ),
                [],
                map_run,
            )
            .optional()?;
        Ok(row)
    }

    /// 最近 N 次运行（含失败），供排查与以后显示同步历史。
    pub fn recent_runs(&self, limit: i64) -> Result<Vec<SyncRun>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let mut stmt = conn.prepare(&format!(
            "SELECT {RUN_COLUMNS} FROM sync_run ORDER BY id DESC LIMIT ?1"
        ))?;
        let rows = stmt.query_map(params![limit], map_run)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    // ---------- 工作项类型快照与同步范围（只影响「拉什么」，不改已缓存内容） ----------

    /// 整来源覆盖写入远端发现的类型清单。缓存里没有≠远端没有，
    /// 因此这张表只回答「能选什么」，同步范围仍由 `source_type_scope` 决定。
    pub fn save_source_types(
        &self,
        source_id: &str,
        types: &[CachedType],
        now_ms: i64,
    ) -> Result<(), BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let tx = Transaction::new_unchecked(&conn, TransactionBehavior::Immediate)?;
        tx.execute("DELETE FROM work_item_type WHERE source_id = ?1", params![source_id])?;
        for t in types {
            tx.execute(
                "INSERT INTO work_item_type
                     (source_id, project_key, type_key, project_name, type_name, discovered_at_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(source_id, project_key, type_key) DO UPDATE SET
                     project_name = excluded.project_name,
                     type_name = excluded.type_name,
                     discovered_at_ms = excluded.discovered_at_ms",
                params![source_id, t.project_key, t.type_key, t.project_name, t.type_name, now_ms],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn source_types(&self, source_id: &str) -> Result<Vec<CachedType>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT project_key, type_key, project_name, type_name, discovered_at_ms
               FROM work_item_type AS types
               LEFT JOIN work_item_type_order AS saved_order USING (type_key)
              WHERE source_id = ?1
              ORDER BY saved_order.position IS NULL, saved_order.position, project_name, type_name",
        )?;
        let rows = stmt.query_map(params![source_id], |row| {
            Ok(CachedType {
                project_key: row.get(0)?,
                type_key: row.get(1)?,
                project_name: row.get(2)?,
                type_name: row.get(3)?,
                discovered_at_ms: row.get(4)?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn type_order(&self) -> Result<Vec<String>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT type_key FROM work_item_type_order ORDER BY position, type_key",
        )?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn set_type_order(&self, type_keys: &[String]) -> Result<(), BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let tx = Transaction::new_unchecked(&conn, TransactionBehavior::Immediate)?;
        tx.execute("DELETE FROM work_item_type_order", [])?;
        let mut seen = std::collections::HashSet::new();
        for (position, type_key) in type_keys.iter().filter(|key| !key.is_empty()).enumerate() {
            if !seen.insert(type_key) {
                continue;
            }
            tx.execute(
                "INSERT INTO work_item_type_order (type_key, position) VALUES (?1, ?2)",
                params![type_key, position as i64],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// 记下用户选择：快照中未选择的类型持续关闭，未来新类型默认开启。
    /// 同一类型键在所有空间一起设置；暂时离开发现快照的关闭配置也保留。
    ///
    /// 这里不校验键是否存在于快照——校验放在 `Session::set_source_type_scope`，
    /// 那里能对照快照给出「这个 type_key 没发现过」的人话错误。要回到全量请调
    /// [`Store::clear_source_type_scope`]，不要用空集合冒充。
    pub fn set_source_type_scope(
        &self,
        source_id: &str,
        type_keys: &[String],
        now_ms: i64,
    ) -> Result<(), BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let tx = Transaction::new_unchecked(&conn, TransactionBehavior::Immediate)?;
        tx.execute("DELETE FROM source_type_scope WHERE source_id = ?1", params![source_id])?;
        tx.execute(
            "INSERT INTO source_scope_configured (source_id, updated_at) VALUES (?1, ?2)
             ON CONFLICT(source_id) DO UPDATE SET updated_at = excluded.updated_at",
            params![source_id, now_ms],
        )?;
        // 快照里存在的类型按 (空间, 类型) 展开；快照里没有的键不写入（下次发现会刷新）。
        let payload = serde_json::to_string(type_keys).unwrap_or_else(|_| "[]".to_string());
        tx.execute("DELETE FROM source_type_disabled WHERE source_id=?1
            AND type_key IN (SELECT type_key FROM work_item_type WHERE source_id=?1)",
            params![source_id])?;
        tx.execute("INSERT INTO source_type_disabled (source_id, type_key)
            SELECT DISTINCT source_id, type_key FROM work_item_type
            WHERE source_id=?1 AND type_key NOT IN (SELECT value FROM json_each(?2))",
            params![source_id, payload])?;
        tx.execute(
            "INSERT INTO source_type_scope (source_id, project_key, type_key)
             SELECT s.source_id, s.project_key, s.type_key
               FROM work_item_type s
              WHERE s.source_id = ?1 AND s.type_key IN (SELECT value FROM json_each(?2))",
            params![source_id, payload],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// 回到「从未确认过范围」= 同步按全量执行。两张表必须一起删：
    /// 只删范围行会留下一个「已配置但为空」的状态，那是「用户选了什么都不拉」，
    /// 与调用方想要的全量正好相反。返回是否真的删到过记录。
    pub fn clear_source_type_scope(&self, source_id: &str) -> Result<bool, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let tx = Transaction::new_unchecked(&conn, TransactionBehavior::Immediate)?;
        let rows = tx.execute("DELETE FROM source_type_scope WHERE source_id = ?1", params![source_id])?;
        tx.execute("DELETE FROM source_type_disabled WHERE source_id=?1", params![source_id])?;
        let marked = tx.execute(
            "DELETE FROM source_scope_configured WHERE source_id = ?1",
            params![source_id],
        )?;
        tx.commit()?;
        Ok(rows > 0 || marked > 0)
    }

    /// 同步时的类型范围。`None` = 从未配置（全量）；`Some(scope)` = 排除明确关闭的类型。
    /// 当前已知类型全部关闭时仍允许未来新类型，不能由 is_empty 推断所有类型都被禁止。
    pub fn source_type_scope(&self, source_id: &str) -> Result<Option<TypeScope>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let configured: Option<i64> = conn
            .query_row(
                // 只问「有没有配置行」，不取时间列：这里要的是存在性，不是值。
                r#"SELECT 1 FROM source_scope_configured WHERE source_id = ?1"#,
                params![source_id],
                |r| r.get(0),
            )
            .optional()?;
        if configured.is_none() {
            return Ok(None);
        }
        let disabled_types = {
            let mut stmt = conn.prepare("SELECT type_key FROM source_type_disabled WHERE source_id=?1")?;
            let rows = stmt.query_map(params![source_id], |r| r.get::<_, String>(0))?;
            rows.collect::<Result<std::collections::HashSet<_>, _>>()?
        };
        let mut stmt = conn.prepare(
            "SELECT project_key, type_key FROM work_item_type t WHERE source_id=?1
             AND NOT EXISTS (SELECT 1 FROM source_type_disabled d
                 WHERE d.source_id=t.source_id AND d.type_key=t.type_key)",
        )?;
        let rows = stmt.query_map(params![source_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        let mut keys = std::collections::HashSet::new();
        for row in rows {
            let (project_key, type_key) = row?;
            keys.insert(TypeScope::key(&project_key, &type_key));
        }
        Ok(Some(TypeScope { keys, disabled_types: Some(disabled_types) }))
    }

    // ---------- 动作执行流水（幂等 + 结果不确定时绝不谎报成功） ----------

    /// 远端写之前原子登记。相同请求或同一事项仍有 pending 写入时返回 false，
    /// 不允许不同 request_id 交错更新字段与推进节点（也覆盖共用数据库的进程）。
    pub fn begin_action(
        &self,
        record: &ActionRecord,
    ) -> Result<bool, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let changed = conn.execute(
            "INSERT INTO workflow_action_run
                 (request_id, item_id, action_kind, target, version, status, verified, detail, created_at, finished_at)
             SELECT ?1, ?2, ?3, ?4, ?5, 'pending', 0, NULL, ?6, NULL
              WHERE NOT EXISTS (
                  SELECT 1 FROM workflow_action_run WHERE item_id = ?2 AND status = 'pending'
              )
         ON CONFLICT(request_id) DO NOTHING",
            params![
                record.request_id,
                record.item_id,
                record.action_kind,
                record.target,
                record.version,
                record.created_at
            ],
        )?;
        Ok(changed == 1)
    }

    /// 收尾：状态只接受 verified / failed / unknown 三种，`detail` 必须是已脱敏文本。
    ///
    /// 取值在这里就挡掉：台账是判断「这个 request_id 处理过没有」的唯一依据，
    /// 让任意字符串落库，等于给以后读台账的人（和幂等判断）埋一个读不懂的行。
    pub fn finish_action(
        &self,
        request_id: &str,
        status: &str,
        verified: bool,
        detail: Option<&str>,
        now_ms: i64,
    ) -> Result<(), BackendError> {
        if !matches!(status, "verified" | "failed" | "unknown") {
            return Err(BackendError::validation(format!(
                "动作台账不接受状态 {status}（只支持 verified / failed / unknown）"
            )));
        }
        if verified != (status == "verified") {
            return Err(BackendError::validation("动作台账的 verified 标记必须与收尾状态一致"));
        }
        let conn = self.conn.lock().expect("store mutex poisoned");
        conn.execute(
            "UPDATE workflow_action_run
                SET status = ?2, verified = ?3, detail = ?4, finished_at = ?5
              WHERE request_id = ?1 AND status = 'pending'",
            params![request_id, status, verified as i64, detail, now_ms],
        )?;
        Ok(())
    }

    /// 某个事项最近的动作流水，供 CLI / 排障回看。
    pub fn recent_actions(&self, item_id: &str, limit: i64) -> Result<Vec<ActionRecord>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let mut stmt = conn.prepare(
            r#"SELECT request_id, item_id, action_kind, target, version, status, verified, detail,
                    CAST(created_at AS INTEGER),
                    CASE WHEN finished_at IS NULL THEN NULL ELSE CAST(finished_at AS INTEGER) END
               FROM workflow_action_run WHERE item_id = ?1
              ORDER BY CAST(created_at AS INTEGER) DESC LIMIT ?2"#,
        )?;
        let rows = stmt.query_map(params![item_id, limit], |row| {
            Ok(ActionRecord {
                request_id: row.get(0)?,
                item_id: row.get(1)?,
                action_kind: row.get(2)?,
                target: row.get(3)?,
                version: row.get(4)?,
                status: row.get(5)?,
                verified: row.get::<_, i64>(6)? != 0,
                detail: row.get(7)?,
                created_at: row.get(8)?,
                finished_at: row.get(9)?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// 缓存里出现过的空间 `(project_key, project_name)`，供「按空间发现工作项类型」用。
    ///
    /// 为什么从缓存取而不是问远端：MCP 没有「列出我有权限的全部空间」的工具
    /// （`search_project_info` 必须给空间名），所以能可靠枚举的只有已同步事项所属的空间。
    /// 这个限制要写进文档：新空间第一次不会出现在类型清单里，同步到它的事项之后才会。
    pub fn distinct_projects(&self) -> Result<Vec<(String, String)>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT project_key, COALESCE(MAX(project_name), '')
               FROM work_item WHERE project_key <> ''
              GROUP BY project_key ORDER BY project_key",
        )?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn workspace_catalog(&self) -> Result<Vec<crate::catalog::SpaceCatalog>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let mut stmt = conn.prepare("SELECT snapshot_json FROM workspace_catalog ORDER BY project_key")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        rows.map(|row| Ok(serde_json::from_str(&row?)?)).collect()
    }

    pub fn begin_workspace_catalog_refresh(&self) -> Result<i64, BackendError> {
        Ok(self.conn.lock().expect("store mutex poisoned").query_row(
            "UPDATE workspace_catalog_refresh SET generation=generation+1 WHERE id=1 RETURNING generation",
            [], |row| row.get(0))?)
    }

    pub fn save_workspace_catalog(&self, generation: i64, spaces: &[crate::catalog::SpaceCatalog]) -> Result<bool, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let tx = Transaction::new_unchecked(&conn, TransactionBehavior::Immediate)?;
        let current: i64 = tx.query_row("SELECT generation FROM workspace_catalog_refresh WHERE id=1", [], |row| row.get(0))?;
        if current != generation { return Ok(false); }
        tx.execute("DELETE FROM workspace_catalog", [])?;
        for space in spaces {
            tx.execute("INSERT INTO workspace_catalog VALUES (?1,?2)",
                params![space.project_key, serde_json::to_string(space)?])?;
        }
        tx.commit()?;
        Ok(true)
    }

    pub fn catalog_inputs(&self) -> Result<std::collections::BTreeMap<String, crate::catalog::CatalogInput>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let mut stmt = conn.prepare("SELECT DISTINCT w.project_key,w.project_name,w.work_item_type_key,
            json_extract(NULLIF(d.snapshot_json,'null'),'$.data.work_item_attribute.owned_project.simple_name')
            FROM work_item w LEFT JOIN item_detail d ON d.project_key=w.project_key
            AND d.type_key=w.work_item_type_key AND d.item_id=w.work_item_id WHERE w.project_key<>''")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?,r.get::<_, Option<String>>(1)?,
            r.get::<_, String>(2)?,r.get::<_, Option<String>>(3)?)))?;
        let mut inputs = std::collections::BTreeMap::<String, crate::catalog::CatalogInput>::new();
        for row in rows {
            let (key,name,kind,simple) = row?;
            let input = inputs.entry(key).or_default();
            input.names.extend(name.into_iter().chain(simple));
            if !kind.is_empty() { input.types.insert(kind); }
        }
        Ok(inputs)
    }

    /// 缓存里记着的当前流程 key（节点 key / 状态 key），没同步过就是 `None`。
    ///
    /// 只用来给 `get_transitable_states` 补一个它硬性要求的 `node_id`：
    /// 可流转状态由服务端裁定，本端不拿这个值做任何判断。
    pub fn current_flow_key(&self, id: &WorkItemId) -> Result<Option<String>, BackendError> {
        use rusqlite::OptionalExtension as _;
        let conn = self.conn.lock().expect("store mutex poisoned");
        let value: Option<Option<String>> = conn
            .query_row(
                "SELECT node_state_key FROM work_item
                  WHERE project_key = ?1 AND work_item_type_key = ?2 AND work_item_id = ?3",
                params![
                    id.project_key.clone().unwrap_or_default(),
                    id.work_item_type_key.clone().unwrap_or_default(),
                    id.work_item_id
                ],
                |r| r.get(0),
            )
            .optional()?;
        Ok(value.flatten().filter(|v| !v.trim().is_empty()))
    }

    /// 只给 work_item_id 时，从缓存反查它的 project_key / work_item_type_key。
    ///
    /// CLI 手敲时人只记得住事项编号；缓存里已有的身份不该再要求用户重复提供。
    /// 但**同一编号属于多个空间/类型时不替你猜**：这个身份是要拿去写远端的，
    /// 猜错就是改错了别的事项。查到多于一种身份一律报冲突，让调用方显式指定。
    pub fn cached_identity(
        &self,
        work_item_id: &str,
    ) -> Result<Option<(String, String)>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT DISTINCT project_key, work_item_type_key FROM work_item WHERE work_item_id = ?1 AND COALESCE(TRIM(project_key), '') <> '' AND COALESCE(TRIM(work_item_type_key), '') <> '' LIMIT 2",
        )?;
        let found: Vec<(String, String)> = stmt
            .query_map(params![work_item_id], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        drop(stmt);
        match found.len() {
            0 => Ok(None),
            1 => Ok(Some(found.into_iter().next().unwrap_or_default())),
            _ => Err(BackendError::conflict(format!(
                "编号 {work_item_id} 在本地缓存里同时属于多个空间/类型，无法替你决定要改哪一个；请用 --project 和 --type 明确指定"
            ))),
        }
    }
}

fn work_item_from_summary(raw: serde_json::Value) -> Result<WorkItem, BackendError> {
    crate::model::domain::to_work_item(&crate::model::raw::RawTodoRecord {
        item:serde_json::from_value(raw.clone())?,raw,
    }).map_err(|e|BackendError::parse("详情摘要",e.to_string()))
}

fn detail_content_revision(detail: &crate::detail::ItemDetail) -> Result<String, BackendError> {
    // 角色、人员、当前节点和字段是按身份组织的集合，接口返回顺序不代表业务变化。
    // 只规范这些已知集合；正文、选项等字段值中的数组仍保留顺序语义。
    let mut data = detail.data.clone();
    fn sort_collection(value: &mut serde_json::Value) {
        if let Some(rows) = value.as_array_mut() {
            rows.sort_by_cached_key(|row| row.to_string());
        }
    }
    if let Some(roles) = data.pointer_mut("/work_item_attribute/role_members").and_then(serde_json::Value::as_array_mut) {
        for role in roles { if let Some(members) = role.get_mut("members") { sort_collection(members); } }
    }
    if let Some(nodes) = data.get_mut("work_item_current_node").and_then(serde_json::Value::as_array_mut) {
        for node in nodes { if let Some(owners) = node.get_mut("owners") { sort_collection(owners); } }
    }
    for pointer in ["/work_item_attribute/role_members", "/work_item_current_node", "/work_item_fields"] {
        if let Some(value) = data.pointer_mut(pointer) { sort_collection(value); }
    }
    Ok(format!("{:x}", Sha256::digest(serde_json::to_vec(&data)?)))
}

fn detail_activity(detail: &crate::detail::ItemDetail) -> (Option<i64>, Option<i64>, Option<bool>) {
    let time = |key: &str| detail.data["work_item_attribute"][key].as_str()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok()).map(|t| t.timestamp_millis());
    let completed = detail.data["work_item_fields"].as_array()
        .and_then(|fields| fields.iter().find(|f| f["key"] == "finish_status"))
        .and_then(|f| match &f["value"] {
            serde_json::Value::Bool(v) => Some(*v),
            serde_json::Value::String(v) if v == "true" => Some(true),
            serde_json::Value::String(v) if v == "false" => Some(false), _ => None
        });
    (time("create_time"), time("update_time"), completed)
}

fn map_cached_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<CachedItem> {
    let flags: String = row.get(3)?;
    let flow_kind = FlowKind::parse(&row.get::<_, String>(6)?).unwrap_or(FlowKind::None);
    let item = WorkItem {
        id: WorkItemId {
            project_key: none_if_empty(row.get::<_, Option<String>>(0)?),
            work_item_type_key: none_if_empty(row.get::<_, Option<String>>(1)?),
            work_item_id: row.get(2)?,
        },
        project_name: row.get(4)?,
        name: row.get(5)?,
        // 列里存了什么就还什么，不按 flow_kind 反推缺失字段
        flow: FlowKindInfo {
            kind: flow_kind,
            node_name: row.get(7)?,
            node_state_key: row.get(8)?,
            start_state_key_name: row.get(9)?,
            end_state_key_name: row.get(10)?,
        }
        .into_flow(),
        schedule: Schedule { start_raw: row.get(11)?, end_raw: row.get(12)? },
        raw_json: row.get(13)?,
    };
    Ok(CachedItem {
        item,
        personal_flows: serde_json::from_str(&row.get::<_,String>(22)?).map_err(|error|
            rusqlite::Error::FromSqlConversionFailure(22,rusqlite::types::Type::Text,Box::new(error)))?,
        personal_schedules: serde_json::from_str(&row.get::<_,String>(24)?).map_err(|error|
            rusqlite::Error::FromSqlConversionFailure(24,rusqlite::types::Type::Text,Box::new(error)))?,
        created_at_ms: row.get(18)?,
        updated_at_ms: row.get(19)?,
        is_completed: row.get(20)?,
        detail_revision: row.get(21)?,
        related_projects: serde_json::from_str(&row.get::<_, Option<String>>(23)?.unwrap_or_else(|| "[]".into()))
            .map_err(|error| rusqlite::Error::FromSqlConversionFailure(23,rusqlite::types::Type::Text,Box::new(error)))?,
        source_ids: serde_json::from_str(&row.get::<_, String>(17)?).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(17, rusqlite::types::Type::Text, Box::new(error))
        })?,
        identity_missing_flags: serde_json::from_str(&flags).unwrap_or_default(),
        first_seen_at_ms: row.get(14)?,
        last_seen_at_ms: row.get(15)?,
        seen_count: row.get(16)?,
    })
}

/// 组装行数据用的小结构，避免在 `map_cached_item` 里写长 match。
struct FlowKindInfo {
    kind: FlowKind,
    node_name: Option<String>,
    node_state_key: Option<String>,
    start_state_key_name: Option<String>,
    end_state_key_name: Option<String>,
}

impl FlowKindInfo {
    fn into_flow(self) -> crate::model::domain::FlowInfo {
        crate::model::domain::FlowInfo {
            kind: self.kind,
            node_name: self.node_name,
            node_state_key: self.node_state_key,
            start_state_key_name: self.start_state_key_name,
            end_state_key_name: self.end_state_key_name,
        }
    }
}

/// `sync_run` 的读取列，顺序与 [`map_run`] 的下标一一对应。
const RUN_COLUMNS: &str = "id, started_at_ms, finished_at_ms, action, todo_scope, trigger, source_id, \
     status, pages_fetched, items_received, items_upserted, items_rejected, items_out_of_scope, \
     remote_total, stop_reason, error_kind, error_message, rejection_detail, performance_json";

fn map_run(row: &rusqlite::Row<'_>) -> rusqlite::Result<SyncRun> {
    let trigger: Option<String> = row.get(5)?;
    let status: String = row.get(7)?;
    let stop: Option<String> = row.get(14)?;
    Ok(SyncRun {
        id: row.get(0)?,
        started_at_ms: row.get(1)?,
        finished_at_ms: row.get(2)?,
        action: row.get(3)?,
        todo_scope: row.get(4)?,
        // v1/v2 老库没有这两列（迁移后为 NULL）：如实按 manual 归类，不假装知道发起人
        trigger: trigger.as_deref().map(RunTrigger::parse).unwrap_or(RunTrigger::Manual),
        source_id: row.get(6)?,
        status: RunStatus::parse(&status),
        pages_fetched: row.get(8)?,
        items_received: row.get(9)?,
        items_upserted: row.get(10)?,
        items_rejected: row.get(11)?,
        items_out_of_scope: row.get::<_, i64>(12).unwrap_or(0),
        remote_total: row.get(13)?,
        stop_reason: stop.as_deref().and_then(StopReason::parse),
        error_kind: row.get(15)?,
        error_message: row.get(16)?,
        rejection_detail: row.get(17)?,
        performance: row.get::<_, Option<String>>(18)?
            .and_then(|raw| serde_json::from_str(&raw).ok()),
    })
}

fn none_if_empty(v: Option<String>) -> Option<String> {
    v.filter(|s| !s.is_empty())
}

const SCHEMA_V1: &str = r#"
CREATE TABLE IF NOT EXISTS work_item (
    project_key            TEXT    NOT NULL,
    work_item_type_key     TEXT    NOT NULL,
    work_item_id           TEXT    NOT NULL,
    identity_missing_flags TEXT    NOT NULL DEFAULT '[]',
    project_name           TEXT,
    work_item_name         TEXT,
    flow_kind              TEXT    NOT NULL CHECK (flow_kind IN ('node','state','both','none')),
    node_name              TEXT,
    node_state_key         TEXT,
    start_state_key_name   TEXT,
    end_state_key_name     TEXT,
    schedule_start_raw     TEXT,
    schedule_end_raw       TEXT,
    raw_json               TEXT    NOT NULL,
    first_seen_at_ms       INTEGER NOT NULL,
    last_seen_at_ms        INTEGER NOT NULL,
    last_seen_run_id       INTEGER NOT NULL,
    seen_count             INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (project_key, work_item_type_key, work_item_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_work_item_seen   ON work_item (last_seen_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_work_item_type   ON work_item (work_item_type_key);

CREATE TABLE IF NOT EXISTS sync_run (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at_ms    INTEGER NOT NULL,
    finished_at_ms   INTEGER,
    action           TEXT    NOT NULL,
    todo_scope       TEXT,
    status           TEXT    NOT NULL CHECK (status IN ('running','success','failed')),
    pages_fetched    INTEGER NOT NULL DEFAULT 0,
    items_received   INTEGER NOT NULL DEFAULT 0,
    items_upserted   INTEGER NOT NULL DEFAULT 0,
    items_rejected   INTEGER NOT NULL DEFAULT 0,
    remote_total     INTEGER,
    stop_reason      TEXT CHECK (stop_reason IN ('short_page','total_reached','empty_page','max_pages','error')),
    error_kind       TEXT,
    -- 已脱敏的错误文本（BackendError::safe_message 产物），不含凭证
    error_message    TEXT,
    rejection_detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_run_status ON sync_run (status, id DESC);
"#;

const SCHEMA_V2: &str = r#"
CREATE TABLE IF NOT EXISTS credential (
    id         TEXT PRIMARY KEY CHECK (id = 'mcp_token'),
    ciphertext BLOB NOT NULL
);
"#;
/// v3 新增的表。旧库升级时一并建表；`sync_run` 的新增列见 `SYNC_RUN_V3_COLUMNS`。
///
/// 这三张表都带 `source_id` 但**不建外键**：来源清单来自配置文件而非库表，
/// 引用一个不存在的表会让建表直接失败（`PRAGMA foreign_keys = ON`）。
const SCHEMA_V3: &str = r#"
-- 远端可选工作项类型的快照。「确认过且一个都不选」与「还没发现」是两回事，
-- 前者记在 source_type_scope（空集），后者是这里没有行。
CREATE TABLE IF NOT EXISTS work_item_type (
    source_id        TEXT NOT NULL,
    project_key      TEXT NOT NULL,
    type_key         TEXT NOT NULL,
    project_name     TEXT NOT NULL DEFAULT '',
    type_name        TEXT NOT NULL DEFAULT '',
    discovered_at_ms INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (source_id, project_key, type_key)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS source_scope_configured (
    source_id  TEXT PRIMARY KEY,
    updated_at INTEGER NOT NULL
);

-- 用户确认过的同步类型范围。与 source_scope_configured 配对使用：
-- 有配置行但本表无行 = 明确「一个都不拉」；两表都无 = 从未确认，保持全量。
CREATE TABLE IF NOT EXISTS source_type_scope (
    source_id   TEXT NOT NULL,
    project_key TEXT NOT NULL,
    type_key    TEXT NOT NULL,
    PRIMARY KEY (source_id, project_key, type_key)
) WITHOUT ROWID;

-- 动作执行流水。request_id 是幂等键：远端写之前先落 pending，
-- 因此「超时后不知道有没有改成功」在本地一定有记录，绝不会显示为成功或自动重试。
CREATE TABLE IF NOT EXISTS workflow_action_run (
    request_id  TEXT PRIMARY KEY,
    item_id     TEXT NOT NULL,
    action_kind TEXT NOT NULL,
    target      TEXT NOT NULL,
    version     TEXT NOT NULL,
    status      TEXT NOT NULL,
    verified    INTEGER NOT NULL DEFAULT 0,
    detail      TEXT,
    -- 毫秒时间戳，与 sync_run / work_item 的时间列同一套口径（INTEGER）。
    created_at  INTEGER NOT NULL,
    finished_at INTEGER
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_workflow_action_run_item
    ON workflow_action_run(item_id, created_at DESC);
"#;

const SCHEMA_V5: &str = r#"
-- 全局类型顺序与远端发现快照分开存储，刷新类型清单不会重置用户排序。
CREATE TABLE IF NOT EXISTS work_item_type_order (
    type_key TEXT PRIMARY KEY,
    position INTEGER NOT NULL
) WITHOUT ROWID;
"#;

const SCHEMA_V6: &str = r#"
CREATE TABLE IF NOT EXISTS work_item_source (
    source_id TEXT NOT NULL,
    project_key TEXT NOT NULL,
    work_item_type_key TEXT NOT NULL,
    work_item_id TEXT NOT NULL,
    last_seen_run_id INTEGER NOT NULL,
    PRIMARY KEY(source_id, project_key, work_item_type_key, work_item_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_work_item_source_item
    ON work_item_source(project_key, work_item_type_key, work_item_id);
"#;

/// v3 给 `sync_run` 补的列：`(列名, 列定义)`。SQLite 的 `ADD COLUMN` 不能 IF NOT EXISTS，
/// 所以先查 `PRAGMA table_info` 再决定要不要加，保证迁移可重入。
const SYNC_RUN_V3_COLUMNS: &[(&str, &str)] = &[
    ("trigger", "TEXT NOT NULL DEFAULT 'manual'"),
    ("source_id", "TEXT"),
    ("items_out_of_scope", "INTEGER NOT NULL DEFAULT 0"),
];

// 当前库的打开路径只读检查结构，兼容版本已更新但列迁移未完成的旧缓存。
fn schema_is_current(conn: &Connection) -> Result<bool, BackendError> {
    for (table, required) in [
        ("work_item", &[][..]), ("credential", &[][..]), ("work_item_type", &[][..]),
        ("source_scope_configured", &[][..]), ("source_type_scope", &[][..]),
        ("workflow_action_run", &[][..]), ("work_item_type_order", &[][..]),
        ("work_item_source", &["personal_flow_json", "personal_schedule_json"][..]),
        ("sync_run", &["trigger", "source_id", "items_out_of_scope", "performance_json", "scan_mode"][..]),
        ("item_detail", &["cached_remote_version", "complete", "refresh_required", "refresh_generation", "created_at_ms", "updated_at_ms", "is_completed", "content_revision", "related_projects_json"][..]),
        ("workspace_catalog", &[][..]),
        ("workspace_catalog_refresh", &["generation"][..]),
        ("source_version_evidence", &["scope"][..]),
        ("source_type_disabled", &[][..]), ("item_cache_gc", &[][..]),
        ("source_type_preferences", &["preferences_json"][..]),
    ] {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
        let columns = stmt.query_map([], |r|r.get::<_,String>(1))?.collect::<Result<Vec<_>,_>>()?;
        if columns.is_empty() || required.iter().any(|c| !columns.iter().any(|v| v == c)) { return Ok(false); }
    }
    Ok(true)
}

/// 列不存在时才 `ALTER TABLE ... ADD COLUMN`。
fn ensure_column(
    conn: &Connection,
    table: &str,
    column: &str,
    decl: &str,
) -> Result<(), BackendError> {
    let mut statement = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let existing: Vec<String> = statement
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(Result::ok)
        .collect();
    if existing.iter().any(|name| name == column) {
        return Ok(());
    }
    conn.execute(
        &format!("ALTER TABLE {table} ADD COLUMN {column} {decl}"),
        [],
    )?;
    Ok(())
}

#[cfg(test)]
mod item_cache_gc_tests {
    use super::*;
    use crate::detail::ItemDetail;

    fn seed(store: &Store, source: &str, at: i64) -> WorkItem {
        let run = store.begin_run("todo", None, RunTrigger::Manual, Some(source), at).unwrap();
        store.conn.lock().unwrap().execute("INSERT OR IGNORE INTO work_item
            (project_key,work_item_type_key,work_item_id,flow_kind,raw_json,first_seen_at_ms,last_seen_at_ms)
            VALUES ('p','story','same','none','{}',?1,?1)", [at]).unwrap();
        let item = store.query_items(&ItemFilter::default()).unwrap().remove(0).item;
        store.upsert_items(run, std::slice::from_ref(&item), at).unwrap();
        store.save_item_detail(&ItemDetail { id: item.id.clone(), fetched_at_ms: at,
            data: serde_json::json!({"work_item_fields":[]}), pages: vec![] }).unwrap();
        item
    }

    fn absent(store: &Store, source: &str, status: RunStatus, full: bool, at: i64) {
        let run = store.begin_run("todo", None, RunTrigger::Manual, Some(source), at).unwrap();
        store.set_run_scan_mode(run, full).unwrap();
        store.finish_run(run, status, 1, 0, 0, 0, 0, Some(0), Some(StopReason::EmptyPage),
            None, None, &Default::default(), at).unwrap();
    }

    fn pending(store: &Store) -> i64 {
        store.conn.lock().unwrap().query_row("SELECT count(*) FROM item_cache_gc", [], |r|r.get(0)).unwrap()
    }

    #[test]
    fn deleted_item_caches_wait_for_grace_and_other_sources_and_retry_file_failures() {
        let dir = std::env::temp_dir().join(format!("fstodo-cache-gc-{}-{}",
            std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        let db = dir.join("test.db");
        let store = Store::open(&db).unwrap();
        let at = crate::sync::now_ms();
        let item = seed(&store, "a", at);
        seed(&store, "b", at);
        let images = crate::field_images::item_cache_directory(&db, &item.id.key_tuple());
        std::fs::create_dir_all(&images).unwrap();
        std::fs::write(images.join("cached.img"), b"cached image").unwrap();
        absent(&store, "a", RunStatus::Failed, true, at + 1);
        absent(&store, "a", RunStatus::Success, false, at + 2);
        assert_eq!(pending(&store), 0);
        absent(&store, "a", RunStatus::Success, true, at + 3);
        assert_eq!(pending(&store), 0, "另一个来源仍包含事项");
        absent(&store, "b", RunStatus::Success, true, at + 4);
        assert_eq!(store.count_items().unwrap(), 0);
        assert_eq!(pending(&store), 1);
        drop(store);
        let store = Store::open(&db).unwrap();
        store.prune_item_caches(at + 4 + ITEM_CACHE_GRACE_MS - 1).unwrap();
        assert!(store.item_detail(&item.id).unwrap().is_some());
        assert!(images.join("cached.img").is_file());
        // 用同名文件模拟目录无法删除，详情和待清理标记都应保留以便重试。
        std::fs::remove_dir_all(&images).unwrap();
        std::fs::write(&images, b"blocked directory").unwrap();
        store.prune_item_caches(at + 4 + ITEM_CACHE_GRACE_MS).unwrap();
        assert!(store.item_detail(&item.id).unwrap().is_some());
        assert_eq!(pending(&store), 1);
        std::fs::remove_file(&images).unwrap();
        std::fs::create_dir(&images).unwrap();
        std::fs::write(images.join("cached.img"), b"cached image").unwrap();
        store.prune_item_caches(at + 4 + ITEM_CACHE_GRACE_MS).unwrap();
        assert!(store.item_detail(&item.id).unwrap().is_none());
        assert!(!images.exists());
        assert_eq!(pending(&store), 0);
        drop(store);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn reappearing_item_cancels_cleanup_and_a_later_removal_restarts_grace() {
        let store = Store::in_memory().unwrap();
        let at = crate::sync::now_ms();
        let item = seed(&store, "a", at);
        absent(&store, "a", RunStatus::Success, true, at + 1);
        let run = store.begin_run("todo", None, RunTrigger::Manual, Some("a"), at + 2).unwrap();
        store.upsert_items(run, std::slice::from_ref(&item), at + 2).unwrap();
        assert_eq!(pending(&store), 0);
        store.prune_item_caches(at + 1 + ITEM_CACHE_GRACE_MS).unwrap();
        assert!(store.item_detail(&item.id).unwrap().is_some());
        absent(&store, "a", RunStatus::Success, true, at + 3);
        store.prune_item_caches(at + 1 + ITEM_CACHE_GRACE_MS).unwrap();
        assert!(store.item_detail(&item.id).unwrap().is_some());
        store.prune_item_caches(at + 3 + ITEM_CACHE_GRACE_MS).unwrap();
        assert!(store.item_detail(&item.id).unwrap().is_none());
    }

    #[test]
    fn inflight_detail_written_after_cleanup_still_expires() {
        let store = Store::in_memory().unwrap();
        let at = crate::sync::now_ms();
        let item = seed(&store, "a", at);
        let detail = store.item_detail(&item.id).unwrap().unwrap();
        let generation = store.detail_generation(&item.id).unwrap();
        absent(&store, "a", RunStatus::Success, true, at + 1);
        store.prune_item_caches(at + 1 + ITEM_CACHE_GRACE_MS).unwrap();
        assert!(store.item_detail(&item.id).unwrap().is_none());
        assert_eq!(pending(&store), 0);
        store.save_item_detail_observed(&detail, None, generation).unwrap();
        assert_eq!(pending(&store), 1, "在途详情写回仍登记清理，且不会重加事项摘要");
        assert_eq!(store.count_items().unwrap(), 0);
        store.prune_item_caches(crate::sync::now_ms() + ITEM_CACHE_GRACE_MS).unwrap();
        assert!(store.item_detail(&item.id).unwrap().is_none());
    }

    #[test]
    fn legacy_orphan_details_start_a_new_grace_period_on_upgrade() {
        let store = Store::in_memory().unwrap();
        let item = seed(&store, "a", 1);
        store.conn.lock().unwrap().execute_batch("DELETE FROM work_item_source;
            DELETE FROM work_item; DROP TABLE item_cache_gc; PRAGMA user_version=10;").unwrap();
        let before = crate::sync::now_ms();
        store.init().unwrap();
        let started: i64 = store.conn.lock().unwrap().query_row(
            "SELECT orphaned_at_ms FROM item_cache_gc", [], |r|r.get(0)).unwrap();
        assert!(started >= before);
        store.init().unwrap();
        assert_eq!(store.conn.lock().unwrap().query_row(
            "SELECT orphaned_at_ms FROM item_cache_gc", [], |r|r.get::<_,i64>(0)).unwrap(), started);
        store.prune_item_caches(started + ITEM_CACHE_GRACE_MS - 1).unwrap();
        assert!(store.item_detail(&item.id).unwrap().is_some());
        store.prune_item_caches(started + ITEM_CACHE_GRACE_MS).unwrap();
        assert!(store.item_detail(&item.id).unwrap().is_none());
    }
}

#[cfg(test)]
mod item_activity_tests {
    use super::*;
    use crate::detail::ItemDetail;
    use serde_json::json;

    #[test]
    fn cached_list_reads_remote_activity_from_matching_detail_and_tracks_refreshes() {
        let store = Store::in_memory().unwrap();
        for project in ["p", "other"] {
            store.conn.lock().unwrap().execute(
                "INSERT INTO work_item(project_key,work_item_type_key,work_item_id,
                 flow_kind,raw_json,first_seen_at_ms,last_seen_at_ms)
                 VALUES (?1,'story','same','none','{}',9999,99999)", [project],
            ).unwrap();
        }
        let mut detail = ItemDetail {
            id: WorkItemId { project_key: Some("p".into()),
                work_item_type_key: Some("story".into()), work_item_id: "same".into() },
            fetched_at_ms: 99999,
            data: json!({"work_item_attribute": {
                "create_time":"1970-01-01T08:00:00+08:00",
                "update_time":"1970-01-01T08:00:10+08:00"},
                "work_item_fields":[{"key":"finish_status","value":"true"}]}),
            pages: vec![],
        };
        store.save_item_detail(&detail).unwrap();
        let rows = store.query_items(&ItemFilter::default()).unwrap();
        let row = rows.iter().find(|r| r.item.id.project_key.as_deref() == Some("p")).unwrap();
        assert_eq!(row.created_at_ms, Some(0));
        assert_eq!(row.updated_at_ms, Some(10000));
        assert_eq!(row.is_completed, Some(true));
        let other = rows.iter().find(|r| r.item.id.project_key.as_deref() == Some("other")).unwrap();
        assert_eq!(other.updated_at_ms, None);
        assert_eq!(other.is_completed, None);

        detail.data["work_item_attribute"]["update_time"] = json!("invalid-date");
        detail.data["work_item_fields"][0]["value"] = json!(false);
        store.save_item_detail(&detail).unwrap();
        let rows = store.query_items(&ItemFilter { project_key: Some("p".into()), ..Default::default() }).unwrap();
        assert_eq!(rows[0].updated_at_ms, None, "不能回退到同步时间");
        assert_eq!(rows[0].is_completed, Some(false));

        detail.data["work_item_fields"][0]["value"] = json!("unknown");
        store.save_item_detail(&detail).unwrap();
        assert_eq!(store.query_items(&ItemFilter { project_key: Some("p".into()), ..Default::default() }).unwrap()[0].is_completed, None);
    }
}

#[cfg(test)]
mod type_scope_migration_tests {
    use super::*;

    #[test]
    fn v9_selection_migrates_to_persistent_disabled_types_without_closing_future_types() {
        let path = std::env::temp_dir().join(format!("fstodo-type-scope-{}-{}.db",
            std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        {
            let store = Store::open(&path).unwrap();
            let types = ["on", "off"].map(|key| CachedType {
                project_key: "p".into(), type_key: key.into(), ..Default::default()
            });
            store.save_source_types("s", &types, 1).unwrap();
            store.set_source_type_scope("s", &["on".into()], 2).unwrap();
        }
        {
            // 还原升级前只有白名单与已配置标记的 schema v9。
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch("DROP TABLE source_type_disabled; PRAGMA user_version=9;").unwrap();
        }
        for _ in 0..2 {
            let store = Store::open(&path).unwrap();
            let scope = store.source_type_scope("s").unwrap().unwrap();
            assert_eq!(scope.len(), 1);
            assert!(scope.allows("p", "on"));
            assert!(!scope.allows("p", "off"));
            assert!(!scope.allows("new-project", "off"));
            assert!(scope.allows("p", "future"));
            assert!(store.source_type_scope("other").unwrap().is_none());
        }
        std::fs::remove_file(path).unwrap();
    }
}

#[cfg(test)]
mod credential_migration_tests {
    use super::*;

    #[test]
    fn legacy_cache_is_reconciled_by_each_source_after_upgrade_and_reopen() {
        let dir = std::env::temp_dir().join(format!("fstodo-membership-{}-{}",
            std::process::id(),chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("cache.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(SCHEMA_V1).unwrap();
            conn.pragma_update(None,"user_version",5).unwrap();
            conn.execute("INSERT INTO work_item(project_key,work_item_type_key,work_item_id,
                flow_kind,raw_json,first_seen_at_ms,last_seen_at_ms,last_seen_run_id)
                VALUES ('p','issue','old','state','{}',1,1,1)",[]).unwrap();
        }
        {
            let store = Store::open(&path).unwrap();
            store.adopt_legacy_items(&["a","b"]).unwrap();
            let run = store.begin_run("todo",None,RunTrigger::Manual,Some("a"),2).unwrap();
            // 模拟旧数据的 run id 与新库计数器碰撞也不得保留缺席事项。
            store.finish_run(run,RunStatus::Success,1,0,0,0,0,Some(0),Some(StopReason::EmptyPage),None,None,&Default::default(),3).unwrap();
            assert_eq!(store.count_items().unwrap(),1,"另一来源尚未核对");
        }
        let store = Store::open(&path).unwrap();
        store.adopt_legacy_items(&["a","b"]).unwrap();
        let run = store.begin_run("todo",None,RunTrigger::Manual,Some("b"),4).unwrap();
        store.finish_run(run,RunStatus::Success,1,0,0,0,0,Some(0),Some(StopReason::EmptyPage),None,None,&Default::default(),5).unwrap();
        assert_eq!(store.count_items().unwrap(),0);
        drop(store);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn v1_migration_preserves_existing_history_and_adds_ciphertext_storage() {
        let dir = std::env::temp_dir().join(format!("fstodo-schema-v2-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("cache.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(SCHEMA_V1).unwrap();
            conn.pragma_update(None, "user_version", 1).unwrap();
            conn.execute("INSERT INTO sync_run (started_at_ms, action, status) VALUES (1, 'todo', 'success')", []).unwrap();
        }
        {
            let store = Store::open(&path).unwrap();
            assert_eq!(store.recent_runs(20).unwrap().len(), 1);
            assert!(store.load_token_ciphertext().unwrap().is_none());
            store.save_token_ciphertext(b"ciphertext-only").unwrap();
        }
        let store = Store::open(&path).unwrap();
        assert_eq!(store.load_token_ciphertext().unwrap().unwrap(), b"ciphertext-only");
        assert_eq!(store.recent_runs(20).unwrap().len(), 1);
        drop(store);
        let _ = std::fs::remove_dir_all(dir);
    }
}
#[cfg(test)]
mod detail_atomicity_tests {
    use super::*;
    #[test]
    fn failed_detail_transaction_retains_snapshot_and_version() {
        let store=Store::in_memory().unwrap();
        let id=WorkItemId{project_key:Some("p".into()),work_item_type_key:Some("story".into()),work_item_id:"1".into()};
        let mut detail=crate::detail::ItemDetail{id:id.clone(),fetched_at_ms:1,
            data:serde_json::json!({"work_item_attribute":{},"work_item_fields":[]}),
            pages:vec![serde_json::json!({"pagination":{"has_more":false}})]};
        store.save_item_detail_versioned(&detail,Some("v1")).unwrap();
        let revision: String = store.conn.lock().unwrap().query_row(
            "SELECT content_revision FROM item_detail", [], |r|r.get(0)).unwrap();
        store.conn.lock().unwrap().execute_batch("CREATE TRIGGER reject_detail BEFORE UPDATE ON item_detail
            BEGIN SELECT RAISE(ABORT,'test save failure'); END;").unwrap();
        detail.fetched_at_ms=2;
        detail.data["work_item_fields"]=serde_json::json!([{"key":"description","value":"不得落库的新正文"}]);
        assert!(store.save_item_detail_versioned(&detail,Some("v2")).is_err());
        assert_eq!(store.item_detail(&id).unwrap().unwrap().fetched_at_ms,1);
        assert_eq!(store.detail_versions(&[id.clone()]).unwrap()[&id.key_tuple()].version.as_deref(),Some("v1"));
        assert_eq!(store.conn.lock().unwrap().query_row::<String,_,_>(
            "SELECT content_revision FROM item_detail", [], |r|r.get(0)).unwrap(),revision);
    }
}

#[cfg(test)]
mod additive_migration_tests {
    use super::*;
    #[test]
    fn v14_does_not_copy_unattributed_node_schedule_between_personal_sources() {
        let store=Store::in_memory().unwrap();
        let raw=serde_json::json!({"project_key":"p","work_item_info":{
            "work_item_id":"1","work_item_type_key":"story","work_item_name":"事项"},
            "schedule":{"start_time":"2026-10-19","end_time":"2026-10-23"}});
        let personal=work_item_from_summary(raw).unwrap();
        let detail=crate::detail::ItemDetail { id:personal.id.clone(),fetched_at_ms:1,
            data:serde_json::json!({"work_item_attribute":{},"work_item_fields":[]}),pages:vec![] };
        store.save_item_detail(&detail).unwrap();
        let run=store.begin_run("todo",None,RunTrigger::Manual,Some("personal"),1).unwrap();
        store.upsert_items(run,&[personal.clone()],1).unwrap();
        let mut another=personal.clone();
        another.schedule=Schedule { start_raw:Some("2026-11-01".into()),end_raw:Some("2026-11-02".into()) };
        let other_run=store.begin_run("todo",None,RunTrigger::Manual,Some("another-personal"),1).unwrap();
        store.upsert_items(other_run,&[another.clone()],1).unwrap();
        store.conn.lock().unwrap().execute_batch("ALTER TABLE work_item_source DROP COLUMN personal_schedule_json;
            UPDATE work_item SET schedule_start_raw='2026-10-19',schedule_end_raw='2026-10-23'; PRAGMA user_version=14;").unwrap();
        store.init().unwrap();
        let rows=store.query_items(&ItemFilter::default()).unwrap();
        assert_eq!(rows[0].item.schedule,Schedule::default());
        assert!(rows[0].personal_schedules.is_empty());
        assert_eq!(rows[0].item.raw_json,personal.raw_json);
        assert_eq!(store.item_detail(&detail.id).unwrap().unwrap().data,detail.data);
        assert_eq!(store.upsert_items(run,&[personal.clone()],2).unwrap().updated,0);
        assert_eq!(store.upsert_items(other_run,&[another.clone()],2).unwrap().updated,0);
        let rows=store.query_items(&ItemFilter::default()).unwrap();
        assert_eq!(rows[0].personal_schedules["personal"],personal.schedule);
        assert_eq!(rows[0].personal_schedules["another-personal"],another.schedule);
        assert_eq!(rows[0].item.schedule,Schedule::default());
    }
    #[test]
    fn v13_cache_backfills_projects_without_changing_identity_or_snapshot() {
        let store=Store::in_memory().unwrap();
        let detail=crate::detail::ItemDetail { id:WorkItemId { project_key:Some("p".into()),
            work_item_type_key:Some("story".into()),work_item_id:"1".into() },fetched_at_ms:1,
            data:serde_json::json!({"work_item_fields":[{"name":"所属项目","key":"custom","value":{"id":9,"name":"项目甲"}}]}),pages:vec![] };
        store.save_item_detail(&detail).unwrap();
        store.conn.lock().unwrap().execute_batch("ALTER TABLE item_detail DROP COLUMN related_projects_json;
            DROP TABLE workspace_catalog; PRAGMA user_version=13;").unwrap();
        store.init().unwrap();
        let raw:String=store.conn.lock().unwrap().query_row("SELECT related_projects_json FROM item_detail",[],|r|r.get(0)).unwrap();
        let projects:Vec<crate::catalog::RelatedProject>=serde_json::from_str(&raw).unwrap();
        assert_eq!(projects[0].id,"9");
        assert_eq!(store.item_detail(&detail.id).unwrap().unwrap().data,detail.data);
        assert!(store.workspace_catalog().unwrap().is_empty());
    }
    #[test]
    fn v16_cache_restores_collection_projects_without_business_updates() {
        let store=Store::in_memory().unwrap();
        let detail=crate::detail::ItemDetail { id:WorkItemId { project_key:Some("p".into()),
            work_item_type_key:Some("story".into()),work_item_id:"1".into() },fetched_at_ms:1,
            data:serde_json::json!({"work_item_attribute":{"work_item_name":"需求甲"},
                "work_item_fields":[{"name":"所属合集","key":"collection","value":{"id":9,"name":"项目甲"}}]}),pages:vec![] };
        store.save_item_detail(&detail).unwrap();
        let item=work_item_from_summary(crate::detail::summary(&detail,serde_json::Value::Null)).unwrap();
        let run=store.begin_run("todo",None,RunTrigger::Manual,Some("source"),1).unwrap();
        store.upsert_items(run,&[item.clone()],1).unwrap();
        let before=store.query_items(&ItemFilter::default()).unwrap()[0].detail_revision.clone();
        store.conn.lock().unwrap().execute_batch("UPDATE item_detail SET related_projects_json='[]'; PRAGMA user_version=16;").unwrap();
        for _ in 0..2 {
            store.init().unwrap();
            let rows=store.query_items(&ItemFilter::default()).unwrap();
            assert_eq!(rows[0].related_projects,vec![crate::catalog::RelatedProject {
                field_key:"collection".into(),id:"9".into(),name:"项目甲".into() }]);
            assert_eq!(rows[0].item.id,detail.id);
            assert_eq!(store.item_detail(&detail.id).unwrap().unwrap().data,detail.data);
            assert_eq!(rows[0].detail_revision,before);
        }
        assert_eq!(store.upsert_items(run,&[item],2).unwrap().updated,0);
    }
    #[test]
    fn v12_revision_is_normalized_before_the_first_refresh() {
        let dir=std::env::temp_dir().join(format!("fstodo-normalized-revision-{}-{}",std::process::id(),crate::sync::now_ms()));
        let path=dir.join("cache.db");
        let store=Store::open(&path).unwrap();
        let detail=crate::detail::ItemDetail { id:WorkItemId { project_key:Some("p".into()),
            work_item_type_key:Some("story".into()),work_item_id:"1".into() },fetched_at_ms:1,
            data:serde_json::json!({"work_item_attribute":{"role_members":[{"key":"z"},{"key":"a"}]}}),pages:vec![] };
        store.save_item_detail(&detail).unwrap();
        let old_revision=format!("{:x}",Sha256::digest(serde_json::to_vec(&detail.data).unwrap()));
        store.conn.lock().unwrap().execute("UPDATE item_detail SET content_revision=?1",[&old_revision]).unwrap();
        store.conn.lock().unwrap().execute_batch("PRAGMA user_version=12").unwrap();
        drop(store);
        let store=Store::open(&path).unwrap();
        let revision:String=store.conn.lock().unwrap().query_row("SELECT content_revision FROM item_detail",[],|r|r.get(0)).unwrap();
        assert_ne!(revision,old_revision);
        assert_eq!(revision,detail_content_revision(&detail).unwrap());
        assert_eq!(store.item_detail(&detail.id).unwrap().unwrap().data,detail.data);
        drop(store);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn v11_cache_backfills_detail_content_revision_without_losing_snapshot() {
        let dir=std::env::temp_dir().join(format!("fstodo-detail-revision-{}-{}",std::process::id(),crate::sync::now_ms()));
        let path=dir.join("cache.db");
        let store=Store::open(&path).unwrap();
        let detail=crate::detail::ItemDetail { id:WorkItemId { project_key:Some("p".into()),
            work_item_type_key:Some("story".into()),work_item_id:"1".into() },fetched_at_ms:1,
            data:serde_json::json!({"work_item_fields":[{"key":"description","value":"旧缓存"}]}),pages:vec![] };
        store.save_item_detail(&detail).unwrap();
        store.conn.lock().unwrap().execute_batch("ALTER TABLE item_detail DROP COLUMN content_revision; PRAGMA user_version=11;").unwrap();
        drop(store);
        let store=Store::open(&path).unwrap();
        let revision:String=store.conn.lock().unwrap().query_row("SELECT content_revision FROM item_detail",[],|r|r.get(0)).unwrap();
        assert_eq!(revision,detail_content_revision(&detail).unwrap());
        assert_eq!(store.item_detail(&detail.id).unwrap().unwrap().data,detail.data);
        assert_eq!(store.conn.lock().unwrap().query_row::<i64,_,_>("PRAGMA user_version",[],|r|r.get(0)).unwrap(),SCHEMA_VERSION);
        drop(store);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn reopening_partially_upgraded_cache_adds_missing_columns() {
        let dir=std::env::temp_dir().join(format!("fstodo-additive-migration-{}-{}",std::process::id(),crate::sync::now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let path=dir.join("cache.db");
        drop(Store::open(&path).unwrap());
        let conn=Connection::open(&path).unwrap();
        conn.execute_batch("ALTER TABLE source_version_evidence DROP COLUMN scope;
            ALTER TABLE item_detail DROP COLUMN refresh_generation;").unwrap();
        drop(conn);
        let store=Store::open(&path).unwrap();
        let source=crate::model::source::WorkSource{id:"a".into(),kind:crate::model::source::SourceKind::PersonalTodo,
            enabled:true,todo:None,association_rule:None};
        assert!(store.source_version_field(&source).unwrap().is_none());
        drop(store);
        std::fs::remove_dir_all(dir).unwrap();
    }
}

#[cfg(test)]
mod concurrent_access_tests {
    use super::*;
    use std::{sync::{mpsc, Arc, Barrier}, time::Duration};

    #[test]
    fn open_session_and_cached_reads_do_not_request_a_write_lock() {
        let dir = std::env::temp_dir().join(format!("fstodo-read-during-write-{}-{}",
            std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        let path = dir.join("cache.db");
        let store = Store::open(&path).unwrap();
        let config = dir.join("config.toml");
        std::fs::write(&config, "").unwrap();
        let id = WorkItemId { project_key: Some("p".into()), work_item_type_key: Some("story".into()), work_item_id: "1".into() };
        let detail = crate::detail::ItemDetail { id: id.clone(), fetched_at_ms: 1,
            data: serde_json::json!({"work_item_fields":[]}), pages: vec![] };
        store.save_item_detail(&detail).unwrap();
        let writer = Connection::open(&path).unwrap();
        writer.execute_batch("BEGIN IMMEDIATE; UPDATE item_detail SET snapshot_json='null';").unwrap();
        let (send, receive) = mpsc::channel();
        let read_path = path.clone();
        let worker = std::thread::spawn(move || {
            let session = crate::api::Session::open(crate::config::Config::load(Some(&config), Some(&read_path)).unwrap()).unwrap();
            let cached = session.cached_item_detail(&id).unwrap().unwrap();
            assert_eq!(cached.fetched_at_ms, 1, "写事务提交前仍读到完整旧快照");
            assert!(session.recent_actions(&id, 10).unwrap().is_empty());
            assert_eq!(session.store.detail_generation(&id).unwrap(), 0);
            send.send(()).unwrap();
        });
        let read = receive.recv_timeout(Duration::from_secs(2));
        writer.execute_batch("ROLLBACK").unwrap();
        worker.join().unwrap();
        read.expect("普通会话、详情与流程读取不能等待写事务结束");
        drop(writer); drop(store);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn simultaneous_detail_writes_and_workflow_ledger_writes_all_commit() {
        let dir = std::env::temp_dir().join(format!("fstodo-concurrent-write-{}-{}",
            std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        let path = dir.join("cache.db");
        drop(Store::open(&path).unwrap());
        let barrier = Arc::new(Barrier::new(5));
        let workers: Vec<_> = (0..5).map(|n| {
            let store = Store::open(&path).unwrap();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                for step in 0..20 {
                    let id = WorkItemId { project_key: Some("p".into()), work_item_type_key: Some("story".into()), work_item_id: n.to_string() };
                    if n < 4 {
                        let detail = crate::detail::ItemDetail { id, fetched_at_ms: step,
                            data: serde_json::json!({"work_item_fields":[]}), pages: vec![] };
                        store.save_item_detail(&detail).unwrap();
                    } else {
                        let request = format!("request-{step}");
                        assert!(store.begin_action(&ActionRecord { request_id: request.clone(), item_id: "p|story|4".into(),
                            action_kind: "test".into(), target: "next".into(), version: "v1".into(), status: "pending".into(),
                            verified: false, detail: None, created_at: step, finished_at: None }).unwrap());
                        store.finish_action(&request, "verified", true, None, step).unwrap();
                    }
                }
            })
        }).collect();
        for worker in workers { worker.join().unwrap(); }
        let store = Store::open(&path).unwrap();
        assert_eq!(store.recent_actions("p|story|4", 100).unwrap().len(), 20);
        drop(store);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
