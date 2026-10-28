//! 错误分类与脱敏输出。
//!
//! 本轮要求把「连接失败 / 鉴权失败 / 工具错误 / 数据解析错误」明确区分，
//! 且获取失败不得伪装成空清单或同步成功（见任务书二.4）。因此：
//!
//! - 每个变体对应一类可独立处理的故障，`ErrorKind` 用于退出码与 `sync_run.error_kind`；
//! - `BackendError` 一旦被构造出来，同步流程就不会写出 `status='success'`；
//! - 面向用户/日志的字符串一律经 [`BackendError::safe_message`] 输出，
//!   其中会擦除已加载的凭证文本。

use thiserror::Error;

/// 本地后端统一错误。
#[derive(Debug, Error)]
pub enum BackendError {
    /// 多来源部分失败，保留原错误类别供自动同步暂停策略使用。
    #[error("{message}")]
    Batch { message: String, source: Box<BackendError> },
    /// 配置文件/参数不合法，或存在本轮不可执行的配置。
    #[error("配置错误: {message}")]
    Config { message: String },

    /// 凭证未配置、来源不可读，或凭证文件位置不安全。
    #[error("凭证错误: {message}")]
    Credential { message: String },

    /// 无法建立 MCP 会话：DNS、TCP、TLS、超时、协议握手中断等非鉴权类失败。
    #[error("连接失败: 无法与 {endpoint} 建立 MCP 会话（{detail}）")]
    Connection { endpoint: String, detail: String },

    /// 服务端拒绝凭证：401 挑战、scope 不足等。
    #[error("鉴权失败: {endpoint} 拒绝了当前凭证（{detail}）{}",
        challenge.as_deref().map(|c| format!("，WWW-Authenticate: {c}")).unwrap_or_default())]
    Auth {
        endpoint: String,
        /// 服务端给出的 `WWW-Authenticate` 挑战原文（不含凭证本身）。
        challenge: Option<String>,
        detail: String,
    },

    /// MCP 工具被调用成功送达，但服务端判定为错误：JSON-RPC error 或 `isError=true`。
    #[error("工具调用失败: 工具 {tool} 返回错误（code={code:?}）: {message}")]
    Tool {
        tool: String,
        code: Option<i64>,
        message: String,
    },

    /// 收到了内容，但内容不符合约定的返回结构。
    /// 解析失败绝不退化为「空清单」，也不计入成功同步。
    #[error("数据解析失败: {stage}（{detail}）")]
    Parse { stage: String, detail: String },

    /// 本地 SQLite 缓存层失败。
    #[error("本地缓存错误: {detail}")]
    Store { detail: String },

    /// 本轮明确不实现、但已在模型中预留边界的 abilities。
    #[error("能力未实现: {capability}（{reason}）")]
    NotImplemented { capability: String, reason: String },

    /// 流程快照已过期：远端节点/状态在读取动作之后又变了，不能拿旧参数去写。
    #[error("流程已变更: {detail}")]
    Conflict { detail: String },

    /// 请求本身不成立：身份缺段、动作不存在、动作当前不可执行、必填未齐。
    /// 一律在**发出写请求之前**判定，不消耗一次远端写入。
    #[error("请求校验未通过: {detail}")]
    Validation { detail: String },

    /// 服务端按权限拒绝了这次流转（从服务端原文识别，识别不到时仍归 `Tool`）。
    #[error("权限不足: {detail}")]
    Permission { detail: String },

    /// 写请求可能已被服务端处理，但本地无法确认结果（超时、连接中断、回读失败）。
    ///
    /// 这一类的处理原则：**不得宣称失败后自动重试写**，也不得宣称成功。
    #[error("结果不明: {detail}")]
    UnknownResult { detail: String },
}

/// 稳定的错误大类，用于进程退出码与 `sync_run.error_kind` 落库。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKind {
    Config,
    Credential,
    Connection,
    Auth,
    Tool,
    Parse,
    Store,
    NotImplemented,
    Conflict,
    Validation,
    Permission,
    UnknownResult,
}

impl ErrorKind {
    /// 落库用的短标识（进入 `sync_run.error_kind`，不含任何响应原文）。
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Config => "config",
            Self::Credential => "credential",
            Self::Connection => "connection",
            Self::Auth => "auth",
            Self::Tool => "tool",
            Self::Parse => "parse",
            Self::Store => "store",
            Self::NotImplemented => "not_implemented",
            Self::Conflict => "conflict",
            Self::Validation => "validation",
            Self::Permission => "permission",
            Self::UnknownResult => "unknown_result",
        }
    }

    /// 进程退出码：便于脚本区分「需要检查凭证」与「需要检查网络」。
    ///
    /// 11 被 CLI 用作「同步未完成」，这里从 12 起排，互不占用。
    pub fn exit_code(self) -> i32 {
        match self {
            Self::Config => 6,
            Self::Credential => 7,
            Self::Connection => 3,
            Self::Auth => 4,
            Self::Tool => 5,
            Self::Parse => 8,
            Self::Store => 9,
            Self::NotImplemented => 10,
            Self::Conflict => 12,
            Self::Validation => 13,
            Self::Permission => 14,
            Self::UnknownResult => 15,
        }
    }
}

impl BackendError {
    pub fn kind(&self) -> ErrorKind {
        match self {
            Self::Batch { source, .. } => source.kind(),
            Self::Config { .. } => ErrorKind::Config,
            Self::Credential { .. } => ErrorKind::Credential,
            Self::Connection { .. } => ErrorKind::Connection,
            Self::Auth { .. } => ErrorKind::Auth,
            Self::Tool { .. } => ErrorKind::Tool,
            Self::Parse { .. } => ErrorKind::Parse,
            Self::Store { .. } => ErrorKind::Store,
            Self::NotImplemented { .. } => ErrorKind::NotImplemented,
            Self::Conflict { .. } => ErrorKind::Conflict,
            Self::Validation { .. } => ErrorKind::Validation,
            Self::Permission { .. } => ErrorKind::Permission,
            Self::UnknownResult { .. } => ErrorKind::UnknownResult,
        }
    }


    /// 面向日志、终端与 `sync_run.error_message` 的安全文本。
    ///
    /// `secret` 为当前已加载的凭证；出现任何位置都会被替换成 `***`。
    /// 上游（尤其是 MCP SDK）的错误文本可能原样回显请求内容，
    /// 所以「先拼字符串再擦除」是这里的最后一道防线，不指望上游干净。
    pub fn safe_message(&self, secret: Option<&str>) -> String {
        redact(&self.to_string(), secret)
    }

    pub fn config(message: impl Into<String>) -> Self {
        Self::Config { message: message.into() }
    }

    pub fn credential(message: impl Into<String>) -> Self {
        Self::Credential { message: message.into() }
    }

    pub fn parse(stage: impl Into<String>, detail: impl Into<String>) -> Self {
        Self::Parse { stage: stage.into(), detail: detail.into() }
    }

    pub fn not_implemented(capability: impl Into<String>, reason: impl Into<String>) -> Self {
        Self::NotImplemented { capability: capability.into(), reason: reason.into() }
    }

    pub fn conflict(detail: impl Into<String>) -> Self {
        Self::Conflict { detail: detail.into() }
    }

    pub fn validation(detail: impl Into<String>) -> Self {
        Self::Validation { detail: detail.into() }
    }

    pub fn permission(detail: impl Into<String>) -> Self {
        Self::Permission { detail: detail.into() }
    }

    pub fn unknown_result(detail: impl Into<String>) -> Self {
        Self::UnknownResult { detail: detail.into() }
    }

    /// 服务端原文是否明确在说权限。只认这份短名单，认不到就保持 [`ErrorKind::Tool`]，
    /// 不靠猜把普通业务报错粉饰成「没权限」。
    pub fn looks_like_permission(text: &str) -> bool {
        const MARKERS: [&str; 5] = ["permission", "forbidden", "unauthorized", "权限", "无权"];
        let lower = text.to_lowercase();
        MARKERS.iter().any(|m| lower.contains(m))
    }

    /// 工具错误的原地重分类：服务端原文点名权限时升格为 [`BackendError::Permission`]。
    pub fn with_permission_detected(self) -> Self {
        match self {
            Self::Tool { message, .. } if Self::looks_like_permission(&message) => Self::Permission { detail: message },
            other => other,
        }
    }
}

impl From<rusqlite::Error> for BackendError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Store { detail: value.to_string() }
    }
}

impl From<serde_json::Error> for BackendError {
    fn from(value: serde_json::Error) -> Self {
        Self::Parse { stage: "json".into(), detail: value.to_string() }
    }
}

impl From<std::io::Error> for BackendError {
    fn from(value: std::io::Error) -> Self {
        Self::Config { message: value.to_string() }
    }
}

/// 把 `haystack` 中出现的 `needle` 全部替换为 `***`。
///
/// `needle` 为空或长度不足 4 时不替换：过短的「凭证」会误涂正常文本；真实 MCP 令牌远长于此阈值。
pub fn redact(haystack: &str, needle: Option<&str>) -> String {
    let Some(needle) = needle.filter(|s| s.len() >= 4) else {
        return haystack.to_string();
    };
    haystack.replace(needle, "***")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_kinds_are_distinct() {
        let errs = [
            BackendError::config("a"),
            BackendError::credential("a"),
            BackendError::Connection { endpoint: "e".into(), detail: "d".into() },
            BackendError::Auth { endpoint: "e".into(), challenge: None, detail: "d".into() },
            BackendError::Tool { tool: "t".into(), code: Some(1), message: "m".into() },
            BackendError::parse("s", "d"),
            BackendError::Store { detail: "d".into() },
            BackendError::not_implemented("c", "r"),
            BackendError::conflict("流程变了"),
            BackendError::validation("缺身份"),
            BackendError::permission("没权限"),
            BackendError::unknown_result("超时"),
        ];
        let kinds: Vec<_> = errs.iter().map(|e| e.kind()).collect();
        assert_eq!(kinds.len(), 12);
        for (i, a) in kinds.iter().enumerate() {
            for (j, b) in kinds.iter().enumerate() {
                if i != j {
                    assert_ne!(a, b, "错误大类必须互相区分: {a:?} vs {b:?}");
                }
            }
        }
        // 退出码两两不同，且不得占用 CLI 专用的 11（同步未完成）
        let codes: std::collections::HashSet<i32> = kinds.iter().map(|k| k.exit_code()).collect();
        assert_eq!(codes.len(), 12, "退出码要与大类一一对应");
        assert!(!codes.contains(&11), "11 归「同步未完成」专用");
    }

    #[test]
    fn permission_is_only_claimed_when_the_server_says_so() {
        let denied = BackendError::Tool {
            tool: "transition_state".into(),
            code: None,
            message: "error=NoPermission,message=您无权操作该工作项".into(),
        };
        assert_eq!(denied.with_permission_detected().kind(), ErrorKind::Permission);

        // 认不出权限标记就保持 Tool：不靠猜把普通业务报错改判成「没权限」
        let other = BackendError::Tool {
            tool: "transition_state".into(),
            code: None,
            message: "error=NodeNotFound,message=no node matched node_id_list".into(),
        };
        assert_eq!(other.with_permission_detected().kind(), ErrorKind::Tool);
    }

    #[test]
    fn safe_message_scrubs_token_from_upstream_text() {
        let err = BackendError::Tool {
            tool: "list_todo".into(),
            code: Some(-32000),
            message: "invalid X-Mcp-Token: abcdef123456 rejected".into(),
        };
        let safe = err.safe_message(Some("abcdef123456"));
        assert!(!safe.contains("abcdef123456"), "凭证不得出现在错误文本里: {safe}");
        assert!(safe.contains("***"));
        // 不传 secret 时仍应给出可读信息
        assert!(err.safe_message(None).contains("list_todo"));
    }
}
