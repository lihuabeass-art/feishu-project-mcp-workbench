//! 飞书项目 MCP 只读接入。
//!
//! 分工：
//!
//! - [`feishu`]：基于官方 MCP Rust SDK（`rmcp`）的真实客户端，负责
//!   `initialize` → 会话 → `tools/call`，并把 SDK 错误翻译成本地错误分类。
//! - [`parse`]：把 `tools/call` 的返回载荷翻译成接口侧结构；与 SDK 完全无关，
//!   因此脱敏样本可以离线跑完整条「解析 → 转换 → 落库」链路。
//! - [`TodoSource`]：以上两者共同的窄接口。同步流程只依赖这个 trait，
//!   测试里换成假实现即可覆盖分页、失败、重复同步等行为，不碰网络。
//!
//! 读侧用 `list_todo` 取个人待办；流程动作读 `get_node_detail` /
//! `get_transitable_states` / `get_transition_required`，写侧只有 `transition_node` 与
//! `transition_state` 两个入口，且必须经 [`crate::workflow`] 的校验与回读核验才允许调用。

use std::fmt;

use async_trait::async_trait;
use serde_json::{Map, Value};

use crate::error::BackendError;

pub mod feishu;
pub mod parse;
pub(crate) mod scheduler;
mod http;

pub use parse::{parse_todo_page, parse_tool_json};

/// `tools/call` 返回载荷的 SDK 无关表示。
///
/// MCP 允许工具把结果放在 `structuredContent` 或 `content[]` 文本块里，
/// 两者都可能出现在同一个响应中，所以这里原样收下来，交给 [`parse`] 决定。
#[derive(Debug, Clone, Default)]
pub struct ToolResultPayload {
    /// 服务端把这次调用判定为错误（`isError: true`）。
    pub is_error: bool,
    /// `content[]` 里所有文本块，按原顺序。
    pub text_blocks: Vec<String>,
    /// `structuredContent`，缺省即 `None`。
    pub structured: Option<Value>,
}

impl ToolResultPayload {
    /// 由脱敏样本构造（测试与非 MCP 通道复用）。
    pub fn from_json(value: Value) -> Self {
        Self { is_error: false, text_blocks: Vec::new(), structured: Some(value) }
    }

    pub fn from_text(text: impl Into<String>) -> Self {
        Self { is_error: false, text_blocks: vec![text.into()], structured: None }
    }

    pub fn err(text: impl Into<String>) -> Self {
        Self { is_error: true, text_blocks: vec![text.into()], structured: None }
    }
}

/// 连接信息。`check` 命令回传这个结构，其中不含凭证。
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct ConnectionInfo {
    pub endpoint: String,
    pub session_established: bool,
    pub server_name: Option<String>,
    pub server_version: Option<String>,
    pub protocol_version: Option<String>,
    /// 服务端声明的能力名（例如 `tools`、`logging`），仅作观察记录。
    pub capabilities: Vec<String>,
}

impl fmt::Display for ConnectionInfo {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{} ← {} {}（协议 {}，能力 {}）",
            self.endpoint,
            self.server_name.as_deref().unwrap_or("<未提供>"),
            self.server_version.as_deref().unwrap_or("<未提供>"),
            self.protocol_version.as_deref().unwrap_or("<未提供>"),
            if self.capabilities.is_empty() { "<未声明>".to_string() } else { self.capabilities.join(", ") }
        )
    }
}

/// 取数来源的窄接口。
///
/// `call_list_todo` 保留为便捷入口（同步流程与既有测试都按名字读它），
/// 真正的分发在 `call_tool`——新增工具不必再往 trait 上堆方法。
#[async_trait]
pub trait TodoSource: Send + Sync {
    /// 通用同步台账中的来源类别；旧待办实现沿用 action。
    fn query_kind(&self) -> Option<&str> { None }
    /// 局部结果只合并，不核销未出现的来源归属。
    fn is_full_scan(&self) -> bool { false }
    /// 同步适配器的诊断快照；普通工具实现不需要维护这份统计。
    fn sync_performance(&self) -> crate::sync_metrics::SyncPerformance { Default::default() }
    /// 建立/复用会话并回报服务端信息。
    async fn describe(&self) -> Result<ConnectionInfo, BackendError>;

    /// 调用任意 MCP 工具。参数与工具名由调用方给出，
    /// 返回原始载荷——**解析发生在 [`parse`]，不在实现里**。
    async fn call_tool(&self, tool: &str, arguments: &Map<String, Value>) -> Result<ToolResultPayload, BackendError>;

    /// 调用 `list_todo`。参数由 [`crate::model::source::PersonalTodoQuery`] 生成。
    async fn call_list_todo(&self, arguments: &Map<String, Value>) -> Result<ToolResultPayload, BackendError> {
        self.call_tool(crate::mcp::feishu::TOOL_LIST_TODO, arguments).await
    }

    /// 关闭会话。实现必须允许重复调用。
    async fn close(&mut self);
}
