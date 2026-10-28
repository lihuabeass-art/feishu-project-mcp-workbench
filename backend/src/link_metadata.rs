//! 链接名称补全。仅返回展示用元数据，不修改业务字段或同步指纹。
//! 云文档使用独立的可选凭证，绝不复用飞书项目 MCP token。
mod network;
mod parse;
#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use reqwest::Url;
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::sync::{OnceCell, Semaphore};

use crate::SecretToken;
use parse::{feishu_metadata, feishu_resource, html_metadata};

const MAX_BYTES: usize = 1024 * 1024;
const MAX_ENTRIES: usize = 256;
const SUCCESS_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const FAILURE_TTL: Duration = Duration::from_secs(60);
const TIMEOUT: Duration = Duration::from_secs(8);
pub const DOCS_TOKEN_ENV: &str = "FSTODO_FEISHU_DOCS_ACCESS_TOKEN";

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LinkKind {
    Webpage,
    Document,
    File,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct LinkMetadata {
    pub title: String,
    pub kind: LinkKind,
}

fn checked_url(raw: &str) -> Option<Url> {
    let mut url = Url::parse(raw).ok()?;
    let host = url.host_str()?.trim_end_matches('.');
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.ends_with(".internal")
        || !host.contains('.') && host.parse::<IpAddr>().is_err()
    {
        return None;
    }
    if let Ok(ip) = host.trim_matches(['[', ']']).parse::<IpAddr>() {
        if !public_ip(ip) {
            return None;
        }
    }
    url.set_fragment(None);
    Some(url)
}

fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            !ip.is_private()
                && !ip.is_loopback()
                && !ip.is_link_local()
                && !ip.is_documentation()
                && a != 0
                && a < 224
                && !(a == 100 && (64..=127).contains(&b))
                && !(a == 198 && (b == 18 || b == 19))
                && !(a == 192 && b == 0 && c == 0)
        }
        IpAddr::V6(ip) => {
            if let Some(v4) = ip.to_ipv4_mapped() {
                return public_ip(IpAddr::V4(v4));
            }
            let segments = ip.segments();
            segments[0] & 0xe000 == 0x2000 && !(segments[0] == 0x2001 && segments[1] == 0x0db8)
        }
    }
}

struct Response {
    status: u16,
    location: Option<String>,
    content_type: String,
    body: Vec<u8>,
}

#[async_trait]
trait MetadataHttp: Send + Sync {
    async fn request(
        &self,
        url: &Url,
        body: Option<Value>,
        token: Option<&SecretToken>,
    ) -> Option<Response>;
}

struct PublicHttp;

#[async_trait]
impl MetadataHttp for PublicHttp {
    async fn request(
        &self,
        url: &Url,
        body: Option<Value>,
        token: Option<&SecretToken>,
    ) -> Option<Response> {
        let url = checked_url(url.as_str())?;
        let host = url.host_str()?.trim_matches(['[', ']']);
        let addresses = network::public_addresses(host, url.port_or_known_default()?).await?;
        // 逐跳验证并固定 DNS 结果，避免重定向或 DNS 变化把自动预览引向本机/内网。
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .timeout(TIMEOUT)
            .resolve_to_addrs(host, &addresses)
            .build()
            .ok()?;
        let mut request = if let Some(body) = body {
            client
                .post(url)
                .header("Content-Type", "application/json")
                .body(serde_json::to_vec(&body).ok()?)
        } else {
            client.get(url)
        };
        if let Some(token) = token {
            request = request.bearer_auth(token.expose());
        }
        let mut response = request.send().await.ok()?;
        let mut result = Response {
            status: response.status().as_u16(),
            location: response
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned),
            content_type: response
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .into(),
            body: Vec::new(),
        };
        if response.status().is_success() {
            while let Some(chunk) = response.chunk().await.ok()? {
                let remaining = MAX_BYTES - result.body.len();
                result
                    .body
                    .extend_from_slice(&chunk[..chunk.len().min(remaining)]);
                if result.body.len() == MAX_BYTES {
                    break;
                }
            }
        }
        Some(result)
    }
}

struct Entry {
    created: Instant,
    result: OnceCell<Option<LinkMetadata>>,
}

struct Resolver {
    http: Box<dyn MetadataHttp>,
    cache: Mutex<HashMap<String, Arc<Entry>>>,
    concurrency: Semaphore,
}

impl Resolver {
    fn new(http: impl MetadataHttp + 'static) -> Self {
        Self {
            http: Box::new(http),
            cache: Mutex::new(HashMap::new()),
            concurrency: Semaphore::new(4),
        }
    }

    async fn resolve(&self, raw: &str, token: Option<&SecretToken>) -> Option<LinkMetadata> {
        let url = checked_url(raw)?;
        let token = token.filter(|_| feishu_resource(&url).is_some());
        // 仅存凭证摘要作为隔离键；配置授权后，之前的失败缓存不会阻止重新读取。
        let key = format!(
            "{}:{:x}",
            url,
            Sha256::digest(token.map_or("", |t| t.expose()))
        );
        let entry = {
            let mut cache = self.cache.lock().ok()?;
            cache.retain(|_, entry| {
                entry.created.elapsed()
                    < if entry.result.get().is_some_and(Option::is_some) {
                        SUCCESS_TTL
                    } else {
                        FAILURE_TTL
                    }
            });
            if !cache.contains_key(&key) && cache.len() >= MAX_ENTRIES {
                let oldest = cache
                    .iter()
                    .min_by_key(|(_, e)| e.created)
                    .map(|(k, _)| k.clone());
                if let Some(oldest) = oldest {
                    cache.remove(&oldest);
                }
            }
            cache
                .entry(key)
                .or_insert_with(|| {
                    Arc::new(Entry {
                        created: Instant::now(),
                        result: OnceCell::new(),
                    })
                })
                .clone()
        };
        entry
            .result
            .get_or_init(|| async {
                let _permit = self.concurrency.acquire().await.ok()?;
                tokio::time::timeout(TIMEOUT, self.fetch(url, token))
                    .await
                    .ok()
                    .flatten()
            })
            .await
            .clone()
    }

    async fn fetch(&self, mut url: Url, token: Option<&SecretToken>) -> Option<LinkMetadata> {
        let resource = feishu_resource(&url);
        if let (Some(resource), Some(token)) = (&resource, token) {
            let (api_url, body) = if resource.doc_type == "wiki" {
                let mut api = Url::parse(&format!(
                    "https://{}/open-apis/wiki/v2/spaces/get_node",
                    resource.api_host
                ))
                .ok()?;
                api.query_pairs_mut()
                    .append_pair("token", &resource.token)
                    .append_pair("obj_type", "wiki");
                (api, None)
            } else {
                (
                    Url::parse(&format!(
                        "https://{}/open-apis/drive/v1/metas/batch_query",
                        resource.api_host
                    ))
                    .ok()?,
                    Some(
                        json!({"request_docs":[{"doc_token":resource.token,"doc_type":resource.doc_type}],"with_url":false}),
                    ),
                )
            };
            // API 回执严格遵循 JSON；不跟随任何携带授权的重定向。
            if let Some(response) = self.http.request(&api_url, body, Some(token)).await {
                if response.status == 200 {
                    if let Some(metadata) = serde_json::from_slice(&response.body)
                        .ok()
                        .and_then(|v| feishu_metadata(&v, resource))
                    {
                        return Some(metadata);
                    }
                }
            }
        }
        for _ in 0..5 {
            let response = self.http.request(&url, None, None).await?;
            if matches!(response.status, 301 | 302 | 303 | 307 | 308) {
                url = checked_url(url.join(response.location.as_deref()?).ok()?.as_str())?;
                continue;
            }
            if response.status != 200 {
                return None;
            }
            if resource.is_some()
                && (url.host_str()?.starts_with("accounts.")
                    || url
                        .path_segments()?
                        .any(|p| matches!(p, "login" | "signin" | "passport")))
            {
                return None;
            }
            let mut metadata =
                html_metadata(&response.body, &response.content_type, resource.is_some())?;
            if resource.as_ref().is_some_and(|r| r.doc_type == "file") {
                metadata.kind = LinkKind::File;
            }
            return Some(metadata);
        }
        None
    }
}

/// 解析失败静默返回 None，由界面保留原始链接。缓存仅驻留进程内。
pub async fn resolve(raw_url: &str) -> Option<LinkMetadata> {
    static RESOLVER: OnceLock<Resolver> = OnceLock::new();
    let token = std::env::var(DOCS_TOKEN_ENV)
        .ok()
        .filter(|v| !v.trim().is_empty())
        .map(|v| SecretToken::new(v.trim().to_owned()));
    RESOLVER
        .get_or_init(|| Resolver::new(PublicHttp))
        .resolve(raw_url, token.as_ref())
        .await
}
