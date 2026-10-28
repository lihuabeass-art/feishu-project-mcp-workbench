//! 保留 HTTP 认证、权限状态与 429 的 Retry-After；其余会话、JSON-RPC 与 SSE 生命周期仍由 rmcp 管理。
//! POST 响应适配遵循 rmcp 3.5.1 的 reqwest 客户端，额外保留状态分类与频控头。
use futures_util::{stream::BoxStream, StreamExt};
use http::{HeaderName, HeaderValue};
use rmcp::{
    model::{ClientJsonRpcMessage, JsonRpcMessage, ServerJsonRpcMessage},
    transport::streamable_http_client::{
        AuthRequiredError, InsufficientScopeError, SseError, StreamableHttpClient,
        StreamableHttpError, StreamableHttpPostResponse,
    },
};
use sse_stream::{Sse, SseStream};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, SystemTime},
};

#[derive(Debug, thiserror::Error)]
pub enum HttpError {
    #[error("HTTP 429 Too Many Requests")]
    Throttled { retry_after: Option<Duration> },
    #[error(transparent)]
    Client(#[from] reqwest::Error),
    #[error(transparent)]
    Other(#[from] Box<dyn std::error::Error + Send + Sync>),
}

#[derive(Clone)]
pub struct HttpClient(reqwest::Client);
impl HttpClient {
    pub fn new() -> Result<Self, reqwest::Error> {
        // 写操作的重放只能由业务幂等链路决定，HTTP 层不自动重试。
        reqwest::Client::builder()
            .retry(reqwest::retry::never())
            .connect_timeout(Duration::from_secs(30))
            .build()
            .map(Self)
    }
}

fn retry_after(value: &str) -> Option<Duration> {
    if let Ok(seconds) = value.trim().parse::<u64>() {
        return Some(Duration::from_secs(seconds));
    }
    let date = chrono::DateTime::parse_from_rfc2822(value).ok()?;
    let at: SystemTime = date.with_timezone(&chrono::Utc).into();
    Some(at.duration_since(SystemTime::now()).unwrap_or_default())
}

impl StreamableHttpClient for HttpClient {
    type Error = HttpError;

    async fn post_message(
        &self,
        uri: Arc<str>,
        message: ClientJsonRpcMessage,
        session: Option<Arc<str>>,
        auth: Option<String>,
        headers: HashMap<HeaderName, HeaderValue>,
    ) -> Result<StreamableHttpPostResponse, StreamableHttpError<HttpError>> {
        self.post_message_with_max_sse_event_size(
            uri,
            message,
            session,
            auth,
            headers,
            16 * 1024 * 1024,
        )
        .await
    }

    async fn post_message_with_max_sse_event_size(
        &self,
        uri: Arc<str>,
        message: ClientJsonRpcMessage,
        session: Option<Arc<str>>,
        auth: Option<String>,
        headers: HashMap<HeaderName, HeaderValue>,
        max_event: usize,
    ) -> Result<StreamableHttpPostResponse, StreamableHttpError<HttpError>> {
        let mut request = self
            .0
            .post(uri.as_ref())
            .header("accept", "text/event-stream, application/json");
        for (key, value) in headers {
            request = request.header(key, value);
        }
        if let Some(auth) = auth {
            request = request.bearer_auth(auth);
        }
        if let Some(session) = &session {
            request = request.header("mcp-session-id", session.as_ref());
        }
        let response = request
            .json(&message)
            .send()
            .await
            .map_err(|e| StreamableHttpError::Client(e.into()))?;
        let status = response.status();
        if status == http::StatusCode::TOO_MANY_REQUESTS {
            return Err(StreamableHttpError::Client(HttpError::Throttled {
                retry_after: response
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .and_then(retry_after),
            }));
        }
        let challenge = response
            .headers()
            .get("www-authenticate")
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default();
        // HTTP 状态已明确认证/权限失败，不依赖服务端是否附带挑战头或 JSON-RPC 响应体。
        // SDK 要求字符串；空串只表示没有挑战头，业务映射仍会还原为 None。
        if status == http::StatusCode::UNAUTHORIZED {
            return Err(StreamableHttpError::AuthRequired(AuthRequiredError::new(
                challenge.into(),
            )));
        }
        if status == http::StatusCode::FORBIDDEN {
            return Err(StreamableHttpError::InsufficientScope(
                InsufficientScopeError::new(challenge.into(), None),
            ));
        }
        if matches!(
            status,
            http::StatusCode::ACCEPTED | http::StatusCode::NO_CONTENT
        ) {
            return Ok(StreamableHttpPostResponse::Accepted);
        }
        if status == http::StatusCode::NOT_FOUND && session.is_some() {
            return Err(StreamableHttpError::SessionExpired);
        }
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let session = response
            .headers()
            .get("mcp-session-id")
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        let notification = !matches!(message, ClientJsonRpcMessage::Request(_));
        if status.is_success() && response.content_length() == Some(0) && notification {
            return Ok(StreamableHttpPostResponse::Accepted);
        }
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            if content_type.starts_with("application/json") {
                if let Ok(error @ JsonRpcMessage::Error(_)) =
                    serde_json::from_str::<ServerJsonRpcMessage>(&body)
                {
                    return Ok(StreamableHttpPostResponse::Json(error, session));
                }
            }
            return Err(StreamableHttpError::UnexpectedServerResponse(
                format!("HTTP {status}: {body}").into(),
            ));
        }
        if content_type.starts_with("text/event-stream") {
            // 在解析前按原始事件字节计数，跨 chunk 保持边界，限制未结束事件的内存占用。
            let mut event_bytes = 0usize;
            let mut line_bytes = 0usize;
            let mut previous_cr = false;
            let bytes = response.bytes_stream().map(move |chunk| {
                let chunk = chunk.map_err(std::io::Error::other)?;
                for &byte in &chunk {
                    if previous_cr && byte == b'\n' {
                        previous_cr = false;
                        continue;
                    }
                    event_bytes += 1;
                    if byte == b'\r' || byte == b'\n' {
                        if line_bytes == 0 {
                            event_bytes = 0;
                        }
                        line_bytes = 0;
                    } else {
                        line_bytes += 1;
                    }
                    previous_cr = byte == b'\r';
                    if event_bytes > max_event {
                        return Err(std::io::Error::other("MCP SSE event exceeds size limit"));
                    }
                }
                Ok(chunk)
            });
            return Ok(StreamableHttpPostResponse::Sse(
                SseStream::from_bytes_stream(bytes).boxed(),
                session,
            ));
        }
        if content_type.starts_with("application/json") {
            let body = response
                .bytes()
                .await
                .map_err(|e| StreamableHttpError::Client(e.into()))?;
            return match serde_json::from_slice(&body) {
                Ok(message) => Ok(StreamableHttpPostResponse::Json(message, session)),
                Err(_) if notification => Ok(StreamableHttpPostResponse::Accepted),
                Err(error) => Err(StreamableHttpError::Deserialize(error)),
            };
        }
        Err(StreamableHttpError::UnexpectedContentType(Some(
            content_type,
        )))
    }

    async fn delete_session(
        &self,
        uri: Arc<str>,
        session: Arc<str>,
        auth: Option<String>,
        headers: HashMap<HeaderName, HeaderValue>,
    ) -> Result<(), StreamableHttpError<HttpError>> {
        self.0
            .delete_session(uri, session, auth, headers)
            .await
            .map_err(|e| StreamableHttpError::Client(HttpError::Other(Box::new(e))))
    }

    async fn get_stream(
        &self,
        uri: Arc<str>,
        session: Option<Arc<str>>,
        last: Option<String>,
        auth: Option<String>,
        headers: HashMap<HeaderName, HeaderValue>,
    ) -> Result<BoxStream<'static, Result<Sse, SseError>>, StreamableHttpError<HttpError>> {
        self.get_stream_with_max_sse_event_size(uri, session, last, auth, headers, 16 * 1024 * 1024)
            .await
    }

    async fn get_stream_with_max_sse_event_size(
        &self,
        uri: Arc<str>,
        session: Option<Arc<str>>,
        last: Option<String>,
        auth: Option<String>,
        headers: HashMap<HeaderName, HeaderValue>,
        max_event: usize,
    ) -> Result<BoxStream<'static, Result<Sse, SseError>>, StreamableHttpError<HttpError>> {
        self.0
            .get_stream_with_max_sse_event_size(uri, session, last, auth, headers, max_event)
            .await
            .map_err(|e| StreamableHttpError::Client(HttpError::Other(Box::new(e))))
    }
}

/// rmcp 的 Client 变体没有 source 标注，需要显式取出具体传输错误。
pub fn throttle(error: &(dyn std::error::Error + 'static)) -> Option<Option<Duration>> {
    if let Some(StreamableHttpError::Client(HttpError::Throttled { retry_after })) =
        error.downcast_ref::<StreamableHttpError<HttpError>>()
    {
        return Some(*retry_after);
    }
    error.source().and_then(throttle)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    fn endpoint(response: &'static str) -> (Arc<str>, std::thread::JoinHandle<()>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let uri = format!("http://{}", listener.local_addr().unwrap()).into();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = Vec::new();
            loop {
                let mut buffer = [0u8; 4096];
                let count = socket.read(&mut buffer).unwrap();
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..count]);
                if let Some(end) = request.windows(4).position(|w| w == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&request[..end]);
                    let length = headers
                        .lines()
                        .find_map(|line| {
                            line.to_lowercase()
                                .strip_prefix("content-length: ")
                                .and_then(|v| v.parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if request.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            socket.write_all(response.as_bytes()).unwrap();
        });
        (uri, server)
    }

    fn message() -> ClientJsonRpcMessage {
        serde_json::from_value(serde_json::json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_todo","arguments":{}}})).unwrap()
    }

    #[tokio::test]
    async fn http_auth_and_permission_statuses_survive_missing_challenges_and_jsonrpc_bodies() {
        use crate::error::{BackendError, ErrorKind};
        use rmcp::{service::ClientInitializeError, transport::DynamicTransportError};

        for (wire, expected, has_challenge) in [
            ("HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Bearer error=\"invalid_token\"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", ErrorKind::Auth, true),
            ("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", ErrorKind::Auth, false),
            ("HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"jsonrpc\":\"2.0\",\"id\":1,\"error\":{\"code\":-32000,\"message\":\"request rejected\"}}", ErrorKind::Auth, false),
            ("HTTP/1.1 403 Forbidden\r\nWWW-Authenticate: Bearer error=\"insufficient_scope\"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", ErrorKind::Permission, true),
            ("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", ErrorKind::Permission, false),
            ("HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"jsonrpc\":\"2.0\",\"id\":1,\"error\":{\"code\":-32000,\"message\":\"request rejected\"}}", ErrorKind::Permission, false),
        ] {
            let (uri, server) = endpoint(wire);
            let error = HttpClient::new().unwrap()
                .post_message(uri.clone(), message(), None, None, HashMap::new())
                .await.err().expect("HTTP 拒绝必须保留错误分类");
            let mapped = super::super::feishu::map_initialize_error(&uri, ClientInitializeError::TransportError {
                error: DynamicTransportError::from_parts("streamable_http", std::any::TypeId::of::<()>(), Box::new(error)),
                context: "send initialize request".into(),
            });
            assert_eq!(mapped.kind(), expected, "{wire}");
            if let BackendError::Auth { challenge, .. } = mapped {
                assert_eq!(challenge.is_some(), has_challenge);
            }
            server.join().unwrap();
        }
    }

    #[tokio::test]
    async fn http_server_failures_are_not_credential_errors() {
        use rmcp::{service::ClientInitializeError, transport::DynamicTransportError};

        let (uri, server) = endpoint("HTTP/1.1 500 Internal Server Error\r\nWWW-Authenticate: Bearer error=\"invalid_token\"\r\nConnection: close\r\n\r\nauthentication service unavailable");
        let error = HttpClient::new().unwrap()
            .post_message(uri.clone(), message(), None, None, HashMap::new())
            .await.err().expect("HTTP 500 必须保留服务失败");
        let mapped = super::super::feishu::map_initialize_error(&uri, ClientInitializeError::TransportError {
            error: DynamicTransportError::from_parts("streamable_http", std::any::TypeId::of::<()>(), Box::new(error)),
            context: "send initialize request".into(),
        });
        assert_eq!(mapped.kind(), crate::error::ErrorKind::Connection);
        server.join().unwrap();

        let (uri, server) = endpoint("HTTP/1.1 500 Internal Server Error\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"jsonrpc\":\"2.0\",\"id\":1,\"error\":{\"code\":-32000,\"message\":\"token expired\"}}");
        let result = HttpClient::new().unwrap()
            .post_message(uri, message(), None, None, HashMap::new()).await.unwrap();
        assert!(matches!(result, StreamableHttpPostResponse::Json(JsonRpcMessage::Error(_), _)),
            "未知 JSON-RPC 错误保留为协议消息，不能按文字猜测凭证无效");
        server.join().unwrap();
    }

    #[tokio::test]
    async fn http_429_keeps_retry_after_without_replaying_http_post() {
        let (uri, server) = endpoint("HTTP/1.1 429 Too Many Requests\r\nRetry-After: 12\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        let result = HttpClient::new()
            .unwrap()
            .post_message(uri, message(), None, None, HashMap::new())
            .await;
        assert!(
            matches!(result, Err(StreamableHttpError::Client(HttpError::Throttled { retry_after: Some(d) })) if d == Duration::from_secs(12))
        );
        server.join().unwrap();
    }

    #[tokio::test]
    async fn json_and_sse_responses_keep_protocol_messages_and_session_identity() {
        for (wire, sse) in [
            ("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nMcp-Session-Id: abc\r\nConnection: close\r\n\r\n{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"content\":[]}}", false),
            ("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nMcp-Session-Id: abc\r\nConnection: close\r\n\r\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"content\":[]}}\r\n\r\n", true),
        ] {
            let (uri, server) = endpoint(wire);
            let response = HttpClient::new().unwrap().post_message(uri, message(), None, None, HashMap::new()).await.unwrap();
            match response {
                StreamableHttpPostResponse::Json(_, session) => { assert!(!sse); assert_eq!(session.as_deref(), Some("abc")); }
                StreamableHttpPostResponse::Sse(mut stream, session) => {
                    assert!(sse); assert_eq!(session.as_deref(), Some("abc"));
                    let event = stream.next().await.unwrap().unwrap();
                    assert!(serde_json::from_str::<ServerJsonRpcMessage>(event.data.as_deref().unwrap()).is_ok());
                }
                _ => panic!("unexpected response"),
            }
            server.join().unwrap();
        }
    }

    #[test]
    fn retry_after_parses_seconds_and_http_date() {
        assert_eq!(retry_after("12"), Some(Duration::from_secs(12)));
        assert_eq!(
            retry_after("Wed, 21 Oct 2015 07:28:00 GMT"),
            Some(Duration::ZERO)
        );
        assert_eq!(retry_after("invalid"), None);
    }
}
