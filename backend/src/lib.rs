//! 飞书个人工作台 · 本地数据层。
//!
//! 本轮范围（任务书一）：只做「本地配置 → 飞书项目 MCP 会话 → 个人待办分页读取
//! → 接口侧结构 → 内部模型 → SQLite 缓存 → 缓存查询」这条闭环，
//! 不碰界面、轮询、规则引擎、远端写入。
//!
//! 分层与依赖方向：
//!
//! ```text
//! api ──► sync ──► mcp::feishu ──► rmcp（协议栈）
//!   │        │  └─► mcp::parse ──► model::raw
//!   │        └────────────────────► model::domain（转换）
//!   └─────────────────────────────► store（SQLite）
//! ```
//!
//! `rmcp` 的类型只在 [`mcp::feishu`] 内部出现；`sync`、`store`、`api` 只认
//! [`mcp::TodoSource`] 与 [`model`]，因此脱敏样本可以离线跑完解析/转换/落库全链路
//! （见 `tests/`）。
//!
//! 各模块的设计理由与字段取舍见 `docs/`；本轮能力边界与残余风险见
//! `docs/验收与限制.md`。

pub mod api;
pub mod association;
pub mod catalog;
pub mod detail;
mod diagnostics;
mod remote;
pub mod field_images;
pub mod link_metadata;
pub mod source_query;
pub mod config;
pub mod credentials;
pub mod error;
pub mod mcp;
pub mod model;
pub mod paths;
pub mod store;
pub mod sync;
pub mod sync_metrics;
pub mod workflow;

pub use config::{Config, DEFAULT_ENDPOINT, DEFAULT_MAX_PAGES, DEFAULT_TOKEN_ENV};
pub use credentials::{Credential, SecretToken};
pub use error::{BackendError, ErrorKind};
pub use mcp::{ConnectionInfo, TodoSource, ToolResultPayload};
pub use model::{
    FlowInfo, FlowKind, PersonalTodoQuery, RejectReason, SourceKind, TodoAction, TodoScope,
    WorkItem, WorkItemId, WorkSource,
};
pub use store::{
    ActionRecord, CachedItem, DiscoveredType, ItemFilter, RunStatus, RunTrigger, StopReason, Store,
    SyncRun, TypeScope,
};
pub use sync::{RejectionStat, SyncContext, SyncReport};

/// crate 版本，供 CLI 与以后诊断面板回显。
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
