//! 飞书项目官方 MCP 端点的真实客户端。
//!
//! 协议栈完全交给官方 Rust SDK `rmcp`：`initialize` 握手、会话头（`Mcp-Session-Id`）、
//! JSON-RPC 编解码、`tools/call` 都由 SDK 负责，本模块只做三件事：
//!
//! 1. **带上凭证**：以 `X-Mcp-Token` 自定义头发送（调查结论 1 节实测路径）。
//! 2. **翻译错误**：把 SDK 的错误类型映射成 [`BackendError`] 的对应类别
//!    （连接 / 鉴权 / 权限 / 工具 / 解析），避免把权限或网络故障当作凭证错误。
//! 3. **收敛会话生命周期**：连接可复用、失败即作废重建、关闭可重复调用。
//!
//! 凭证只在 [`FeishuMcp::headers`] 里被读一次用于构造 HTTP 头，
//! 不进入返回值、日志或错误文本（错误文本再经 `BackendError::safe_message` 兜底擦除）。

use std::collections::HashMap;
use std::sync::{atomic::{AtomicBool, Ordering}, Arc};
use std::time::Duration;

use async_trait::async_trait;
use http::header::{HeaderName, HeaderValue};
use rmcp::model::{
    CallToolRequestParams, ContentBlock, ErrorData, ServerCapabilities, ServerPeerInfo,
};
use rmcp::service::{
    ClientInitializeError, Peer, RoleClient, RunningService, ServiceError, ServiceExt,
};
use rmcp::transport::streamable_http_client::{
    AuthRequiredError, InsufficientScopeError, StreamableHttpClientTransport,
    StreamableHttpClientTransportConfig,
};
use serde_json::{Map, Value};
use tokio::sync::Mutex;

use super::{
    http::{self as transport_http, HttpClient},
    scheduler::{Feedback, Scheduler, CONNECT_TIMEOUT, OPERATION_TIMEOUT},
};
use crate::credentials::SecretToken;
use crate::error::BackendError;
use crate::mcp::{ConnectionInfo, TodoSource, ToolResultPayload};

/// 本模块会调用的工具名（全部来自 `tools/list` 元数据，见 `飞书项目MCP调查结论.md`）。
///
/// 写侧包括字段更新与节点/状态流转。它们只允许由
/// [`crate::workflow`] 在校验 + 幂等 + 回读核验的闭环里调用，其他模块不得直接拼参数发写请求。
pub const TOOL_LIST_TODO: &str = "list_todo";
pub const TOOL_LIST_WORKITEM_TYPES: &str = "list_workitem_types";
pub const TOOL_SEARCH_PROJECT_INFO: &str = "search_project_info";
pub const TOOL_GET_NODE_DETAIL: &str = "get_node_detail";
pub const TOOL_GET_TRANSITABLE_STATES: &str = "get_transitable_states";
pub const TOOL_GET_TRANSITION_REQUIRED: &str = "get_transition_required";
pub const TOOL_TRANSITION_NODE: &str = "transition_node";
pub const TOOL_TRANSITION_STATE: &str = "transition_state";
pub const TOOL_UPDATE_NODE: &str = "update_node";
pub const TOOL_UPDATE_FIELD: &str = "update_field";

/// 写侧工具集合：诊断入口据此拒绝「顺手调一个写工具」。
pub const WRITE_TOOLS: [&str; 4] = [
    TOOL_TRANSITION_NODE,
    TOOL_TRANSITION_STATE,
    TOOL_UPDATE_NODE,
    TOOL_UPDATE_FIELD,
];

/// 凭证所在的请求头名（小写是 `http::HeaderName` 的规范形式，匹配时不区分大小写）。
const TOKEN_HEADER: &str = "x-mcp-token";

/// 关闭会话的等待上限：`close` 只是清理，不该把命令行卡住。
const CLOSE_TIMEOUT: Duration = Duration::from_secs(2);

type Session = RunningService<RoleClient, ()>;

struct ActiveSession {
    service: Session,
    identity: Arc<AtomicBool>,
}

impl ActiveSession {
    fn new(service: Session) -> Self {
        Self {
            service,
            identity: Arc::new(AtomicBool::new(true)),
        }
    }
}

/// 飞书项目 MCP 客户端。
#[derive(Clone)]
pub struct FeishuMcp {
    endpoint: String,
    token: SecretToken,
    scheduler: Arc<Scheduler>,
    /// 已建立的会话；`None` 表示未连接或已因失败作废。
    session: Arc<Mutex<Option<ActiveSession>>>,
}

impl FeishuMcp {
    /// 同一端点与凭证共用自适应调度器，用户无需配置请求参数。
    pub fn new(endpoint: impl Into<String>, token: SecretToken) -> Self {
        let endpoint = endpoint.into();
        let scheduler = Scheduler::shared(&endpoint, token.expose());
        Self {
            endpoint,
            token,
            scheduler,
            session: Arc::new(Mutex::new(None)),
        }
    }

    pub fn endpoint(&self) -> &str {
        &self.endpoint
    }

    /// 构造携带凭证的自定义头。
    ///
    /// `rmcp` 的 `custom_headers` 会加到每个 HTTP 请求上（POST 与后续 GET/SSE 都用同一份），
    /// 因此 token 只需在这里被取出原文一次。
    fn headers(&self) -> Result<HashMap<HeaderName, HeaderValue>, BackendError> {
        let name = HeaderName::from_static(TOKEN_HEADER);
        let value =
            HeaderValue::from_str(self.token.expose()).map_err(|e| BackendError::Credential {
                message: format!(
                    "凭证无法作为 {TOKEN_HEADER} 请求头发送（{e}）；\
                 凭证应是一行不含换行/控制字符的纯文本"
                ),
            })?;
        let mut map = HashMap::new();
        map.insert(name, value);
        Ok(map)
    }

    /// 建立一次新会话（含 `initialize` 握手）。
    async fn connect(&self) -> Result<Session, BackendError> {
        let config = StreamableHttpClientTransportConfig::with_uri(self.endpoint.clone())
            .max_concurrent_requests(super::scheduler::MAX_IN_FLIGHT)
            .reinit_on_expired_session(false)
            .custom_headers(self.headers()?);
        let http = HttpClient::new().map_err(|e| BackendError::Connection {
            endpoint: self.endpoint.clone(),
            detail: e.to_string(),
        })?;
        let transport = StreamableHttpClientTransport::with_client(http, config);

        tokio::time::timeout(CONNECT_TIMEOUT, ().serve(transport))
            .await
            .map_err(|_| BackendError::Connection {
                endpoint: self.endpoint.clone(),
                detail: format!(
                    "MCP initialize 在 {} 秒内没有完成；请检查网络/代理",
                    CONNECT_TIMEOUT.as_secs()
                ),
            })?
            .map_err(|e| {
                let throttle = match &e {
                    ClientInitializeError::TransportError { error, .. } => {
                        transport_http::throttle(error)
                    }
                    _ => transport_http::throttle(&e),
                };
                if let Some(delay) = throttle {
                    self.scheduler.throttle(delay);
                    return BackendError::Tool {
                        tool: "initialize".into(),
                        code: Some(429),
                        message: "MCP 初始化受到限流，已暂停调度".into(),
                    };
                }
                map_initialize_error(&self.endpoint, e)
            })
    }

    /// 拿到可用会话，必要时新建。
    async fn ensure_session(&self) -> Result<(Peer<RoleClient>, Arc<AtomicBool>), BackendError> {
        self.ensure_session_until(tokio::time::Instant::now() + OPERATION_TIMEOUT)
            .await
    }

    async fn ensure_session_until(
        &self,
        deadline: tokio::time::Instant,
    ) -> Result<(Peer<RoleClient>, Arc<AtomicBool>), BackendError> {
        let started = std::time::Instant::now();
        let guard = self.session.clone().lock_owned().await;
        let reused = guard.is_some();
        let snapshot = if guard.is_none() {
            // 锁内排队：失败后的下一次握手也必须重新经过共享冷却。
            let permit = self.scheduler.acquire().await;
            let client = self.clone();
            crate::diagnostics::spawn(async move {
                let mut guard = guard;
                let _permit = permit;
                crate::diagnostics::handshake_started();
                let result = tokio::time::timeout_at(deadline, client.connect())
                    .await
                    .map_err(|_| BackendError::config("MCP 建立会话超时"))?;
                let outcome = result.as_ref().map_or_else(|e| e.kind().as_str(), |_| "ok");
                let snapshot = match result {
                    Ok(service) => {
                        let session = ActiveSession::new(service);
                        let snapshot = (session.service.peer().clone(), session.identity.clone());
                        *guard = Some(session);
                        Ok(snapshot)
                    }
                    Err(error) => Err(error),
                };
                drop(guard);
                crate::diagnostics::record("mcp_session", started, outcome, false);
                snapshot
            })
            .await
            .map_err(|_| BackendError::config("MCP 会话任务意外结束"))?
        } else {
            let session = guard.as_ref().expect("session initialized");
            let snapshot = (session.service.peer().clone(), session.identity.clone());
            drop(guard);
            Ok(snapshot)
        };
        if reused {
            crate::diagnostics::record("mcp_session", started, "ok", true);
        }
        // Peer 快照和日志均不让网络等待或磁盘写入占用会话生命周期锁。
        snapshot
    }

    /// Normal reads reuse the live session; an explicit connection check still calls describe().
    pub(crate) async fn describe_reusing(&self) -> Result<ConnectionInfo, BackendError> {
        tokio::time::timeout(OPERATION_TIMEOUT, self.ensure_session())
            .await
            .map_err(|_| BackendError::config("连接信息等待调度超时"))??;
        let guard = self.session.lock().await;
        guard
            .as_ref()
            .map(|s| connection_info(&self.endpoint, &s.service))
            .ok_or_else(|| BackendError::config("连接已失效，请重新读取"))
    }

    /// 仅作废发生故障的那一代会话，旧请求晚到的错误不能关闭新连接。
    async fn invalidate(&self, identity: Option<&Arc<AtomicBool>>) {
        let old = {
            let mut guard = self.session.lock().await;
            if identity
                .is_some_and(|id| guard.as_ref().is_none_or(|s| !Arc::ptr_eq(id, &s.identity)))
            {
                return;
            }
            if let Some(session) = guard.as_ref() {
                session.identity.store(false, Ordering::Release);
            }
            guard.take()
        };
        if let Some(mut session) = old {
            // 关闭只是尽力清理；超时或报错都不改变「会话已作废」这一事实
            let _ = tokio::time::timeout(
                CLOSE_TIMEOUT,
                session.service.close_with_timeout(CLOSE_TIMEOUT),
            )
            .await;
        }
    }
}

#[async_trait]
impl TodoSource for FeishuMcp {
    /// 每次都重新握手：`check` 的用途就是证明「现在」能连上并通过鉴权，
    /// 复用旧会话会让结果变成「之前连上过」。
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> {
        let permit = tokio::time::timeout(OPERATION_TIMEOUT, self.scheduler.acquire())
            .await
            .map_err(|_| BackendError::Connection {
                endpoint: self.endpoint.clone(),
                detail: "连接检查等待调度超时".into(),
            })?;
        let client = self.clone();
        let session = match crate::diagnostics::spawn(async move {
            let _permit = permit;
            client.connect().await
        })
        .await
        .map_err(|_| BackendError::config("MCP 连接检查任务意外结束"))?
        {
            Ok(s) => s,
            Err(e) => {
                // 鉴权失败时不要把上一条可能仍可用的会话留着：让用户看到真实状态
                self.invalidate(None).await;
                return Err(e);
            }
        };
        let info = connection_info(&self.endpoint, &session);
        let old = {
            let mut guard = self.session.lock().await;
            if let Some(old) = guard.as_ref() {
                old.identity.store(false, Ordering::Release);
            }
            guard.replace(ActiveSession::new(session))
        };
        if let Some(mut old) = old {
            let _ =
                tokio::time::timeout(CLOSE_TIMEOUT, old.service.close_with_timeout(CLOSE_TIMEOUT))
                    .await;
        }
        Ok(info)
    }

    /// 通用 `tools/call`：工具名 + 参数由调用方给出，本层不解读返回值。
    ///
    /// 三条错误路径的区别是刻意的：
    /// - `McpError`（请求已送达、服务端判错）→ 会话保留，按工具错误上抛；
    /// - 其他 `ServiceError`（传输/协议故障）→ 作废会话；
    /// - 超时 → 作废会话（服务端可能已处理，状态未知，不能留着复用）。
    async fn call_tool(
        &self,
        tool: &str,
        arguments: &Map<String, Value>,
    ) -> Result<ToolResultPayload, BackendError> {
        let deadline = tokio::time::Instant::now() + OPERATION_TIMEOUT;
        let mut retries = 0;
        loop {
            let session = tokio::time::timeout_at(deadline, self.ensure_session_until(deadline))
                .await
                .map_err(|_| BackendError::Connection {
                    endpoint: self.endpoint.clone(),
                    detail: format!("{tool} 建立会话超时"),
                })?;
            let (peer, identity) = match session {
                Ok(session) => session,
                Err(error) => {
                    if matches!(
                        &error,
                        BackendError::Tool {
                            code: Some(429),
                            ..
                        }
                    ) && retryable_read(tool)
                        && retries < 2
                    {
                        retries += 1;
                        continue;
                    }
                    return Err(error);
                }
            };
            let permit = tokio::time::timeout_at(deadline, self.scheduler.acquire())
                .await
                .map_err(|_| BackendError::Connection {
                    endpoint: self.endpoint.clone(),
                    detail: format!("{tool} 等待请求调度超时"),
                })?;
            // 排队期间会话可能已被另一请求替换；尚未发送，不消耗重试次数。
            if !identity.load(Ordering::Acquire) {
                drop(permit);
                continue;
            }
            let timeout = self.scheduler.timeout(tool);
            let client = self.clone();
            let owned_tool = tool.to_owned();
            let arguments = arguments.clone();
            // 调用方取消后，已发请求仍由独立任务持有名额，直到响应或有界超时清理完成。
            let (result, throttle) = crate::diagnostics::spawn(async move {
                let tool = owned_tool.as_str();
                let started = std::time::Instant::now();
                crate::diagnostics::tool_started();
                let params =
                    CallToolRequestParams::new(tool.to_string()).with_arguments(arguments.clone());
                let outcome = tokio::time::timeout_at(
                    deadline.min(tokio::time::Instant::now() + timeout),
                    peer.call_tool(params),
                )
                .await;
                let throttle = match &outcome {
                    Ok(Err(ServiceError::TransportSend(error))) => transport_http::throttle(error),
                    Ok(Err(ServiceError::McpError(data))) => {
                        throttle_value(data.code.0 as i64, &data.message, data.data.as_ref())
                    }
                    Ok(Ok(result)) => throttle_payload(&to_payload(result.clone())),
                    _ => None,
                };
                let result = match outcome {
                    Ok(Ok(result)) => Ok(to_payload(result)),
                    Ok(Err(ServiceError::McpError(data))) => Err(map_mcp_error(tool, data)),
                    Ok(Err(other)) => {
                        if throttle.is_none() {
                            client.invalidate(Some(&identity)).await;
                        }
                        Err(map_service_error(&client.endpoint, tool, other))
                    }
                    Err(_) => {
                        client.invalidate(Some(&identity)).await;
                        Err(BackendError::Connection {
                            endpoint: client.endpoint.clone(),
                            detail: format!("{tool} 请求超时；结果不明的写操作不会自动重发"),
                        })
                    }
                };
                let feedback = if let Some(delay) = throttle {
                    Feedback::Throttled(delay)
                } else if result.as_ref().is_ok_and(|payload| !payload.is_error) {
                    Feedback::Success
                } else if result
                    .as_ref()
                    .is_err_and(|e| e.kind() == crate::error::ErrorKind::Connection)
                {
                    Feedback::Congested
                } else {
                    Feedback::Failed
                };
                permit.finish(tool, started.elapsed(), feedback);
                drop(permit);
                crate::diagnostics::record(
                    log_label(tool),
                    started,
                    result.as_ref().map_or_else(
                        |e| e.kind().as_str(),
                        |p| if p.is_error { "tool" } else { "ok" },
                    ),
                    false,
                );
                (result, throttle)
            })
            .await
            .map_err(|_| BackendError::config("MCP 请求任务意外结束"))?;
            if throttle.is_some()
                && retryable_read(tool)
                && retries < 2
                && tokio::time::Instant::now() < deadline
            {
                retries += 1;
                continue;
            }
            return result;
        }
    }

    /// 可重复调用：`close` 在 SDK 侧对已关闭会话是幂等的。
    async fn close(&mut self) {
        let session = {
            let mut guard = self.session.lock().await;
            if let Some(session) = guard.as_ref() {
                session.identity.store(false, Ordering::Release);
            }
            guard.take()
        };
        if let Some(session) = session {
            let mut session = session;
            let _ = tokio::time::timeout(
                CLOSE_TIMEOUT,
                session.service.close_with_timeout(CLOSE_TIMEOUT),
            )
            .await;
        }
    }
}

#[cfg(test)]
#[path = "feishu_http_tests.rs"]
mod http_tests;

fn retryable_read(tool: &str) -> bool {
    matches!(
        tool,
        "list_todo"
            | "list_workitem_types"
            | "search_project_info"
            | "search_user_info"
            | "get_workitem_brief"
            | "get_view_detail"
            | "search_by_mql"
            | "get_node_detail"
            | "get_transitable_states"
            | "get_transition_required"
            | "list_node_field_config"
            | "list_workitem_field_config"
            | "list_workitem_role_config"
    )
}

fn throttle_value(code: i64, message: &str, data: Option<&Value>) -> Option<Option<Duration>> {
    let lower = message.to_lowercase();
    if code == 429
        || lower.contains("rate limit")
        || lower.contains("too many requests")
        || message.contains("限流")
        || message.contains("请求过于频繁")
    {
        return Some(
            data.and_then(|v| v.get("retry_after"))
                .and_then(Value::as_u64)
                .map(Duration::from_secs),
        );
    }
    None
}

fn throttle_payload(payload: &ToolResultPayload) -> Option<Option<Duration>> {
    if !payload.is_error {
        return None;
    }
    let values = payload.structured.iter().cloned().chain(
        payload
            .text_blocks
            .iter()
            .filter_map(|s| serde_json::from_str::<Value>(s).ok()),
    );
    for value in values {
        let code = value
            .get("code")
            .or_else(|| value.get("error_code"))
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let message = value
            .get("message")
            .or_else(|| value.get("msg"))
            .and_then(Value::as_str)
            .unwrap_or("");
        if let Some(delay) = throttle_value(code, message, Some(&value)) {
            return Some(delay);
        }
    }
    payload
        .text_blocks
        .iter()
        .find_map(|text| throttle_value(0, text, None))
}

fn log_label(tool: &str) -> &'static str {
    match tool {
        "get_node_detail" => "get_node_detail",
        "get_transitable_states" => "get_transitable_states",
        "get_transition_required" => "get_transition_required",
        "list_node_field_config" => "list_node_field_config",
        "list_workitem_field_config" => "list_workitem_field_config",
        "get_workitem_brief" => "get_workitem_brief",
        "list_todo" => "list_todo",
        "transition_node" => "transition_node",
        "transition_state" => "transition_state",
        "update_node" => "update_node",
        "update_field" => "update_field",
        _ => "other_tool",
    }
}

/// `tools/call` 结果 → SDK 无关载荷。
///
/// 非文本内容块（图片/资源等）本轮不消费，但也不丢：解析层仍会因为
/// 「既无 structuredContent 也无可解析文本」而报解析错误，不会当成空清单。
fn to_payload(result: rmcp::model::CallToolResult) -> ToolResultPayload {
    ToolResultPayload {
        is_error: result.is_error.unwrap_or(false),
        text_blocks: result
            .content
            .iter()
            .filter_map(|block| match block {
                ContentBlock::Text(t) => Some(t.text.clone()),
                _ => None,
            })
            .collect(),
        structured: result.structured_content,
    }
}

fn connection_info(endpoint: &str, session: &Session) -> ConnectionInfo {
    let peer: Option<std::sync::Arc<ServerPeerInfo>> = session.peer_info();
    match peer {
        Some(info) => ConnectionInfo {
            endpoint: endpoint.to_string(),
            session_established: true,
            server_name: info.server_info.as_ref().map(|s| s.name.clone()),
            server_version: info.server_info.as_ref().map(|s| s.version.clone()),
            protocol_version: Some(info.protocol_version.as_str().to_string()),
            capabilities: capability_names(&info.capabilities),
        },
        // 走到这里说明握手成功但没拿到 initialize 结果——照实说明，不编造服务端信息
        None => ConnectionInfo {
            endpoint: endpoint.to_string(),
            session_established: true,
            server_name: None,
            server_version: None,
            protocol_version: None,
            capabilities: Vec::new(),
        },
    }
}

/// 能力名只作观察记录（`check` 输出用），不做任何行为推断。
fn capability_names(caps: &ServerCapabilities) -> Vec<String> {
    let mut names = Vec::new();
    if caps.tools.is_some() {
        names.push("tools".to_string());
    }
    if caps.resources.is_some() {
        names.push("resources".to_string());
    }
    if caps.prompts.is_some() {
        names.push("prompts".to_string());
    }
    if caps.logging.is_some() {
        names.push("logging".to_string());
    }
    if caps.completions.is_some() {
        names.push("completions".to_string());
    }
    if caps.experimental.is_some() {
        names.push("experimental".to_string());
    }
    if caps.extensions.is_some() {
        names.push("extensions".to_string());
    }
    names
}

/// `initialize` 阶段的错误翻译。
///
/// 分类原则：**服务端明确拒绝凭证 → 鉴权**（用户要去看 token）；
/// **服务端明确拒绝访问 → 权限**（不能认定凭证无效）；
/// **服务端返回 JSON-RPC 错误 → 工具错误**（请求已送达，问题在服务端逻辑）；
/// **其余（DNS/TCP/TLS/超时/协议中断）→ 连接**（用户要去看网络）。
pub(crate) fn map_initialize_error(endpoint: &str, error: ClientInitializeError) -> BackendError {
    let source: &(dyn std::error::Error + 'static) = match &error {
        ClientInitializeError::TransportError { error, .. } => error,
        _ => &error,
    };
    if let Some(mapped) = map_authorization_error(endpoint, source, &error.to_string()) {
        return mapped;
    }
    if let ClientInitializeError::JsonRpcError(data) = &error {
        return map_mcp_error("initialize", data.clone());
    }
    BackendError::Connection {
        endpoint: endpoint.to_string(),
        detail: error.to_string(),
    }
}

/// JSON-RPC error → 工具错误。`data` 原文附上（服务端常把业务错误码放在这里）。
pub(crate) fn map_mcp_error(tool: &str, data: ErrorData) -> BackendError {
    let mut message = data.message.to_string();
    if let Some(extra) = data.data.as_ref() {
        message.push_str(&format!("；附加信息: {extra}"));
    }
    BackendError::Tool {
        tool: tool.to_string(),
        code: Some(i64::from(data.code.0)),
        message,
    }
}

/// 会话建立之后、单次请求期间的错误翻译。
///
/// 注意 `ServiceError::McpError` 由调用方单独处理（会话仍可用），
/// 这里剩下的是传输层与协议层故障——一律作废会话后按连接/鉴权/权限归类。
pub(crate) fn map_service_error(endpoint: &str, tool: &str, error: ServiceError) -> BackendError {
    match &error {
        ServiceError::McpError(data) => return map_mcp_error(tool, data.clone()),
        ServiceError::Timeout { timeout } => {
            return BackendError::Connection {
                endpoint: endpoint.to_string(),
                detail: format!("{tool} 超时（{} 秒）", timeout.as_secs_f64()),
            };
        }
        _ => {}
    }

    // 会话中途收到 401/403：认证、权限与网络故障保持独立。
    // 注意 TransportSend(DynamicTransportError) 在 rmcp 3.5.1 未声明 #[source]，
    // source 链在这一层是断的，必须显式进入 DynamicTransportError 再往下走。
    let source: &(dyn std::error::Error + 'static) = match &error {
        ServiceError::TransportSend(dte) => dte,
        _ => &error,
    };
    if let Some(mapped) = map_authorization_error(endpoint, source, &error.to_string()) {
        return mapped;
    }

    BackendError::Connection {
        endpoint: endpoint.to_string(),
        detail: format!("{tool} 调用失败: {error}"),
    }
}

/// 在错误的 `source` 链中按结构化类型区分认证失败与权限不足，不从错误文字猜测。
///
/// SDK 会把传输层错误逐层装箱（`ClientInitializeError` → `DynamicTransportError` →
/// `StreamableHttpError` → `AuthRequiredError`），逐层 downcast 比匹配每层的变体更稳：
/// 中间层增减不影响识别。
fn map_authorization_error(
    endpoint: &str,
    error: &(dyn std::error::Error + 'static),
    detail: &str,
) -> Option<BackendError> {
    let mut current: Option<&(dyn std::error::Error + 'static)> = Some(error);
    while let Some(e) = current {
        if let Some(a) = e.downcast_ref::<AuthRequiredError>() {
            return Some(BackendError::Auth {
                endpoint: endpoint.to_string(),
                challenge: (!a.www_authenticate_header.is_empty())
                    .then(|| a.www_authenticate_header.clone()),
                detail: detail.to_string(),
            });
        }
        if e.is::<InsufficientScopeError>() {
            return Some(BackendError::Permission {
                detail: format!("{endpoint} 拒绝访问: {detail}"),
            });
        }
        current = e.source();
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::model::ErrorCode;
    use rmcp::transport::DynamicTransportError;
    use rmcp::{
        service::{RxJsonRpcMessage, TxJsonRpcMessage},
        transport::Transport,
    };

    const EP: &str = "https://project.feishu.cn/mcp_server/v1";

    // 使用真实 SDK Peer 的内存传输，验证客户端释放锁后能够同时送达请求。
    struct TestTransport {
        tx: tokio::sync::mpsc::UnboundedSender<TxJsonRpcMessage<RoleClient>>,
        rx: tokio::sync::mpsc::UnboundedReceiver<RxJsonRpcMessage<RoleClient>>,
    }

    impl Transport<RoleClient> for TestTransport {
        type Error = std::io::Error;
        fn send(
            &mut self,
            item: TxJsonRpcMessage<RoleClient>,
        ) -> impl std::future::Future<Output = Result<(), Self::Error>> + Send + 'static {
            let result = self
                .tx
                .send(item)
                .map_err(|_| std::io::Error::other("test transport closed"));
            async move { result }
        }
        async fn receive(&mut self) -> Option<RxJsonRpcMessage<RoleClient>> {
            self.rx.recv().await
        }
        async fn close(&mut self) -> Result<(), Self::Error> {
            Ok(())
        }
    }

    async fn test_session() -> Session {
        let (to_server, mut requests) = tokio::sync::mpsc::unbounded_channel();
        let (responses, from_server) = tokio::sync::mpsc::unbounded_channel();
        let barrier = Arc::new(tokio::sync::Barrier::new(2));
        tokio::spawn(async move {
            while let Some(message) = requests.recv().await {
                let value = serde_json::to_value(message).unwrap();
                if value["method"] == "initialize" {
                    responses.send(serde_json::from_value(serde_json::json!({"jsonrpc":"2.0","id":value["id"],
                        "result":{"protocolVersion":value["params"]["protocolVersion"],"capabilities":{},
                            "serverInfo":{"name":"test","version":"1"}}})).unwrap()).unwrap();
                } else if value["method"] == "tools/call" {
                    let responses = responses.clone();
                    let barrier = barrier.clone();
                    tokio::spawn(async move {
                        // 若会话锁跨请求持有，第二个请求无法到达，外层超时即测试失败。
                        barrier.wait().await;
                        let _ = responses.send(
                            serde_json::from_value(
                                serde_json::json!({"jsonrpc":"2.0","id":value["id"],
                            "result":{"content":[{"type":"text","text":"{}"}]}}),
                            )
                            .unwrap(),
                        );
                    });
                }
            }
        });
        ().serve(TestTransport {
            tx: to_server,
            rx: from_server,
        })
        .await
        .unwrap()
    }

    async fn scripted_session(first: Value, calls: Arc<std::sync::atomic::AtomicUsize>) -> Session {
        use std::sync::atomic::Ordering;
        let (to_server, mut requests) = tokio::sync::mpsc::unbounded_channel();
        let (responses, from_server) = tokio::sync::mpsc::unbounded_channel();
        tokio::spawn(async move {
            while let Some(message) = requests.recv().await {
                let value = serde_json::to_value(message).unwrap();
                let result = if value["method"] == "initialize" {
                    serde_json::json!({"protocolVersion":value["params"]["protocolVersion"],"capabilities":{},"serverInfo":{"name":"test","version":"1"}})
                } else if value["method"] == "tools/call" {
                    if calls.fetch_add(1, Ordering::SeqCst) == 0 {
                        first.clone()
                    } else {
                        serde_json::json!({"content":[{"type":"text","text":"{}"}]})
                    }
                } else {
                    continue;
                };
                let _ = responses.send(
                    serde_json::from_value(
                        serde_json::json!({"jsonrpc":"2.0","id":value["id"],"result":result}),
                    )
                    .unwrap(),
                );
            }
        });
        ().serve(TestTransport {
            tx: to_server,
            rx: from_server,
        })
        .await
        .unwrap()
    }

    #[tokio::test(start_paused = true)]
    async fn throttled_reads_wait_and_retry_while_writes_and_unknown_tools_are_never_replayed() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        for (tool, expected) in [
            ("get_workitem_brief", 2),
            ("update_field", 1),
            ("unknown_tool", 1),
        ] {
            let calls = Arc::new(AtomicUsize::new(0));
            let mut client = FeishuMcp::new(EP, SecretToken::new("retry-test"));
            client.scheduler = Arc::new(Scheduler::default());
            *client.session.lock().await = Some(ActiveSession::new(scripted_session(serde_json::json!({
                "content":[],"isError":true,"structuredContent":{"code":429,"message":"Too many requests","retry_after":2}
            }), calls.clone()).await));
            let started = tokio::time::Instant::now();
            let result = client.call_tool(tool, &Map::new()).await.unwrap();
            assert_eq!(calls.load(Ordering::SeqCst), expected);
            assert_eq!(result.is_error, expected == 1);
            if expected == 2 {
                assert!(started.elapsed() >= Duration::from_secs(2));
            }
            client.close().await;
        }
    }

    #[test]
    fn http_throttle_survives_sdk_error_wrapping() {
        let error = boxed_transport(
            rmcp::transport::streamable_http_client::StreamableHttpError::Client(
                transport_http::HttpError::Throttled {
                    retry_after: Some(Duration::from_secs(7)),
                },
            ),
        );
        assert_eq!(
            transport_http::throttle(&error),
            Some(Some(Duration::from_secs(7)))
        );
        assert!(throttle_payload(&ToolResultPayload::err("permission denied")).is_none());
    }

    #[tokio::test]
    async fn shared_peer_calls_overlap_and_close_is_repeatable() {
        let mut client = FeishuMcp::new(EP, SecretToken::new("test"));
        *client.session.lock().await = Some(ActiveSession::new(test_session().await));
        let args = Map::new();
        let (first, second) = tokio::time::timeout(Duration::from_secs(1), async {
            tokio::join!(
                client.call_tool("get_workitem_brief", &args),
                client.call_tool("get_workitem_brief", &args)
            )
        })
        .await
        .expect("两个 SDK 请求必须同时送达");
        assert!(first.is_ok());
        assert!(second.is_ok());
        client.close().await;
        client.close().await;
        assert!(client.session.lock().await.is_none());
    }

    #[tokio::test(start_paused = true)]
    async fn queued_calls_refresh_a_session_replaced_before_dispatch() {
        let mut client = FeishuMcp::new(EP, SecretToken::new("queued-session"));
        client.scheduler = Arc::new(Scheduler::default());
        *client.session.lock().await = Some(ActiveSession::new(test_session().await));
        client.scheduler.throttle(Some(Duration::from_secs(2)));
        let first = tokio::spawn({
            let client = client.clone();
            async move { client.call_tool("get_workitem_brief", &Map::new()).await }
        });
        let second = tokio::spawn({
            let client = client.clone();
            async move { client.call_tool("get_workitem_brief", &Map::new()).await }
        });
        // 两个调用已取到旧 Peer，正在等待限流冷却。
        for _ in 0..10 {
            tokio::task::yield_now().await;
        }
        client.invalidate(None).await;
        *client.session.lock().await = Some(ActiveSession::new(test_session().await));
        assert!(first.await.unwrap().is_ok());
        assert!(second.await.unwrap().is_ok());
        client.close().await;
    }

    #[tokio::test]
    async fn late_failure_cannot_invalidate_replacement_session() {
        let mut client = FeishuMcp::new(EP, SecretToken::new("test"));
        let old = ActiveSession::new(test_session().await);
        let old_identity = old.identity.clone();
        *client.session.lock().await = Some(old);
        let fresh = ActiveSession::new(test_session().await);
        let fresh_identity = fresh.identity.clone();
        let mut previous = client.session.lock().await.replace(fresh).unwrap();
        previous
            .service
            .close_with_timeout(CLOSE_TIMEOUT)
            .await
            .unwrap();
        client.invalidate(Some(&old_identity)).await;
        assert!(Arc::ptr_eq(
            &client.ensure_session().await.unwrap().1,
            &fresh_identity
        ));
        client.invalidate(Some(&fresh_identity)).await;
        assert!(client.session.lock().await.is_none());
        client.close().await;
    }

    #[test]
    fn application_runtime_keeps_session_alive_between_commands() {
        let runtime = crate::remote::runtime().unwrap();
        let mut client = FeishuMcp::new(EP, SecretToken::new("test"));
        runtime.block_on(async {
            *client.session.lock().await = Some(ActiveSession::new(test_session().await));
        });
        let original = runtime.block_on(client.ensure_session()).unwrap().1;
        for _ in 0..2 {
            runtime.block_on(async {
                assert_eq!(
                    client
                        .describe_reusing()
                        .await
                        .unwrap()
                        .server_name
                        .as_deref(),
                    Some("test")
                );
                let args = Map::new();
                let (a, b) = tokio::time::timeout(Duration::from_secs(1), async {
                    tokio::join!(
                        client.call_tool("get_workitem_brief", &args),
                        client.call_tool("get_workitem_brief", &args)
                    )
                })
                .await
                .unwrap();
                assert!(a.is_ok() && b.is_ok());
            });
        }
        assert!(Arc::ptr_eq(
            &original,
            &runtime.block_on(client.ensure_session()).unwrap().1
        ));
        runtime.block_on(client.close());
    }

    /// 把传输层错误装箱成 SDK 在真实链路上产出的形状。
    fn boxed_transport(e: impl std::error::Error + Send + Sync + 'static) -> DynamicTransportError {
        DynamicTransportError::from_parts(
            "streamable_http",
            std::any::TypeId::of::<()>(),
            Box::new(e),
        )
    }

    fn init_transport_err(
        e: impl std::error::Error + Send + Sync + 'static,
    ) -> ClientInitializeError {
        ClientInitializeError::TransportError {
            error: boxed_transport(e),
            context: "send initialize request".into(),
        }
    }

    #[test]
    fn auth_challenge_is_detected_and_preserved() {
        // 实测形态：伪造 token 时 initialize 失败为 AuthRequired，并带 WWW-Authenticate
        let challenge = r#"Bearer resource_metadata="https://project.feishu.cn/.well-known/oauth-protected-resource""#;
        let mapped = map_initialize_error(
            EP,
            init_transport_err(AuthRequiredError::new(challenge.to_string())),
        );
        assert_eq!(mapped.kind(), crate::error::ErrorKind::Auth);
        match &mapped {
            BackendError::Auth {
                endpoint,
                challenge: got,
                ..
            } => {
                assert_eq!(endpoint, EP);
                assert_eq!(got.as_deref(), Some(challenge), "挑战原文要留给用户排查");
            }
            other => panic!("应为 Auth，实际 {other:?}"),
        }
    }

    #[test]
    fn insufficient_scope_is_permission_not_invalid_credentials() {
        let e = InsufficientScopeError::new(
            "Bearer error=\"insufficient_scope\"".to_string(),
            Some("read".into()),
        );
        let mapped = map_initialize_error(EP, init_transport_err(e));
        assert_eq!(mapped.kind(), crate::error::ErrorKind::Permission);
    }

    #[test]
    fn non_auth_initialize_failure_is_connection() {
        let mapped = map_initialize_error(
            EP,
            init_transport_err(std::io::Error::other("connection refused")),
        );
        assert_eq!(mapped.kind(), crate::error::ErrorKind::Connection);
        assert!(
            mapped.to_string().contains(EP),
            "连接错误要带上端点: {mapped}"
        );
    }

    #[test]
    fn initialize_jsonrpc_error_is_tool_error_not_connection() {
        let err = ClientInitializeError::JsonRpcError(ErrorData {
            code: ErrorCode(-32601),
            message: "method not found".into(),
            data: None,
        });
        let mapped = map_initialize_error(EP, err);
        assert_eq!(mapped.kind(), crate::error::ErrorKind::Tool);
        assert!(
            mapped.to_string().contains("-32601"),
            "错误码要保留: {mapped}"
        );
    }

    #[test]
    fn service_error_kinds_are_separated() {
        let mcp = map_service_error(
            EP,
            TOOL_LIST_TODO,
            ServiceError::McpError(ErrorData {
                code: ErrorCode(-32000),
                message: "token expired".into(),
                data: Some(serde_json::json!({ "asset_key": "ak-1" })),
            }),
        );
        assert_eq!(mcp.kind(), crate::error::ErrorKind::Tool);
        assert!(
            mcp.to_string().contains("asset_key"),
            "服务端附加信息要保留: {mcp}"
        );

        let conn = map_service_error(EP, TOOL_LIST_TODO, ServiceError::TransportClosed);
        assert_eq!(conn.kind(), crate::error::ErrorKind::Connection);

        let mid_session_auth = ServiceError::TransportSend(boxed_transport(
            rmcp::transport::streamable_http_client::StreamableHttpError::<std::io::Error>::AuthRequired(
                AuthRequiredError::new("Bearer error=\"invalid_token\"".to_string()),
            ),
        ));
        assert_eq!(
            map_service_error(EP, TOOL_LIST_TODO, mid_session_auth).kind(),
            crate::error::ErrorKind::Auth
        );

        let mid_session_permission = ServiceError::TransportSend(boxed_transport(
            rmcp::transport::streamable_http_client::StreamableHttpError::<std::io::Error>::InsufficientScope(
                InsufficientScopeError::new("Bearer error=\"insufficient_scope\"".to_string(), None),
            ),
        ));
        assert_eq!(
            map_service_error(EP, TOOL_LIST_TODO, mid_session_permission).kind(),
            crate::error::ErrorKind::Permission
        );
        assert_eq!(
            map_service_error(EP, TOOL_LIST_TODO, ServiceError::Timeout { timeout: Duration::from_secs(30) }).kind(),
            crate::error::ErrorKind::Connection
        );
    }

    #[test]
    fn token_never_appears_in_header_error_or_payload() {
        // 非法 header 值（含换行）必须报凭证错误，且错误文本不含原文
        let mcp = FeishuMcp::new(EP, SecretToken::new("line1\nline2-secret"));
        let e = mcp.headers().unwrap_err();
        assert_eq!(e.kind(), crate::error::ErrorKind::Credential);
        assert!(
            !e.to_string().contains("line2-secret"),
            "错误文本不得回显凭证: {e}"
        );
        assert!(!format!("{:?}", mcp.token).contains("line2-secret"));

        let ok = FeishuMcp::new(EP, SecretToken::new("plain-token-value"));
        let headers = ok.headers().unwrap();
        let (_name, value) = headers.iter().next().unwrap();
        assert_eq!(
            value.to_str().unwrap(),
            "plain-token-value",
            "构造 HTTP 头是唯一允许接触原文的地方"
        );
    }

    #[test]
    fn payload_keeps_structured_and_error_flag() {
        // CallToolResult 是 #[non_exhaustive]，只能按线上格式反序列化构造
        let result: rmcp::model::CallToolResult = serde_json::from_value(serde_json::json!({
            "content": [{ "type": "text", "text": "{\"list\":[]}" }],
            "structuredContent": { "total": 0, "list": [] },
            "isError": true,
        }))
        .expect("线上格式的 CallToolResult 必须能反序列化");
        let payload = to_payload(result);
        assert!(
            payload.is_error,
            "isError 必须原样保留，交给解析层判成工具错误"
        );
        assert_eq!(payload.text_blocks.len(), 1);
        assert!(payload.structured.is_some());
    }
}
