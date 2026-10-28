//! Bounded HTTP ranges avoid keeping a single GitHub asset connection open for
//! the entire package. Only fully received ranges survive retries in this run.
use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};
use reqwest::{header, Client, StatusCode, Url};
use serde::Serialize;
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{ipc::Channel, Manager, Resource, ResourceId, Webview};
use tauri_plugin_updater::Update;

#[derive(Clone, Copy)]
struct Policy {
    segment_bytes: usize,
    attempts: u32,
    retry_delay: Duration,
}

const POLICY: Policy = Policy {
    segment_bytes: 512 * 1024,
    attempts: 3,
    retry_delay: Duration::from_secs(1),
};

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
        downloaded: usize,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
    #[serde(rename_all = "camelCase")]
    Retrying {
        attempt: u32,
        max_attempts: u32,
    },
    Finished,
}

#[derive(Default)]
struct Buffer {
    bytes: Vec<u8>,
    total: Option<u64>,
    complete: bool,
}

struct DownloadSession {
    update: Arc<Update>,
    public_key: String,
    buffer: tokio::sync::Mutex<Buffer>,
}
impl Resource for DownloadSession {}

// This resource can only be constructed after verifying the complete package.
// Keeping its Update alongside the bytes also prevents mixing two releases.
struct VerifiedPackage(Mutex<Option<(Arc<Update>, Vec<u8>)>>);
impl Resource for VerifiedPackage {}

#[tauri::command]
pub fn begin_update_download(webview: Webview, rid: ResourceId) -> Result<ResourceId, String> {
    let update = webview
        .resources_table()
        .get::<Update>(rid)
        .map_err(|e| e.to_string())?;
    let public_key = webview
        .app_handle()
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|config| config.get("pubkey"))
        .and_then(|key| key.as_str())
        .filter(|key| !key.is_empty())
        .ok_or("未配置更新签名公钥")?
        .to_owned();
    Ok(webview.resources_table().add(DownloadSession {
        update,
        public_key,
        buffer: Default::default(),
    }))
}

fn client(read_timeout: Duration, request_timeout: Duration) -> Result<Client, String> {
    Client::builder()
        .user_agent("FSTODO-Updater")
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(read_timeout)
        .timeout(request_timeout)
        .build()
        .map_err(|_| "无法创建更新下载连接".into())
}

#[tauri::command]
pub async fn download_update(
    webview: Webview,
    rid: ResourceId,
    on_event: Channel<DownloadEvent>,
) -> Result<ResourceId, String> {
    let session = webview
        .resources_table()
        .get::<DownloadSession>(rid)
        .map_err(|e| e.to_string())?;
    let mut buffer = session
        .buffer
        .try_lock()
        .map_err(|_| "更新包正在下载，请稍候")?;
    if buffer.complete {
        return Err("更新包已下载，请重新检查更新".into());
    }
    let client = client(Duration::from_secs(20), Duration::from_secs(120))?;
    transfer(
        &client,
        &session.update.download_url,
        &mut buffer,
        POLICY,
        &mut |event| {
            let _ = on_event.send(event);
        },
    )
    .await?;
    if let Err(error) = verify(
        &buffer.bytes,
        &session.update.signature,
        &session.public_key,
    ) {
        // A replaced or corrupt asset must never poison subsequent manual retries.
        *buffer = Buffer::default();
        return Err(error);
    }
    buffer.complete = true;
    let package = VerifiedPackage(Mutex::new(Some((
        session.update.clone(),
        std::mem::take(&mut buffer.bytes),
    ))));
    let rid = webview.resources_table().add(package);
    let _ = on_event.send(DownloadEvent::Finished);
    Ok(rid)
}

#[tauri::command]
pub async fn install_verified_update(webview: Webview, rid: ResourceId) -> Result<(), String> {
    let package = webview
        .resources_table()
        .get::<VerifiedPackage>(rid)
        .map_err(|e| e.to_string())?;
    let (update, bytes) = package
        .0
        .lock()
        .map_err(|_| "安装包状态不可用")?
        .take()
        .ok_or("安装包已交付安装，请重新检查更新")?;
    // Update::install does not verify signatures itself. The private resource
    // type above is the boundary; never accept bytes or a path from the UI.
    tauri::async_runtime::spawn_blocking(move || update.install(bytes).map_err(|e| e.to_string()))
        .await
        .map_err(|_| "更新安装任务中断".to_owned())?
}

fn verify(bytes: &[u8], signature: &str, public_key: &str) -> Result<(), String> {
    fn decode(value: &str) -> Result<String, String> {
        String::from_utf8(STANDARD.decode(value).map_err(|_| "更新签名编码无效")?)
            .map_err(|_| "更新签名文本无效".into())
    }
    let key = PublicKey::decode(&decode(public_key)?).map_err(|_| "更新签名公钥无效")?;
    let signature = Signature::decode(&decode(signature)?).map_err(|_| "更新包签名无效")?;
    key.verify(bytes, &signature, true)
        .map_err(|_| "更新包签名校验失败，已丢弃下载内容，请重新检查更新".into())
}

enum Failure {
    Retry(String),
    Fatal(String),
}

fn network_error(error: reqwest::Error) -> Failure {
    // Do not expose temporary signed redirect URLs in UI errors.
    Failure::Retry(if error.is_timeout() {
        "下载连接超时或长时间未收到数据".into()
    } else if error.is_connect() {
        "无法连接更新下载服务器，请检查网络或代理".into()
    } else {
        "更新下载连接中断".into()
    })
}

struct Segment {
    bytes: Vec<u8>,
    total: u64,
    whole: bool,
}

fn content_range(value: &str) -> Option<(u64, u64, u64)> {
    let (range, total) = value.strip_prefix("bytes ")?.split_once('/')?;
    let (start, end) = range.split_once('-')?;
    Some((start.parse().ok()?, end.parse().ok()?, total.parse().ok()?))
}

async fn fetch(
    client: &Client,
    url: &Url,
    offset: usize,
    total: Option<u64>,
    size: usize,
) -> Result<Segment, Failure> {
    let end = (offset as u64 + size as u64 - 1).min(total.unwrap_or(u64::MAX).saturating_sub(1));
    // Start from the permanent release URL each time: GitHub's redirect URL can expire.
    let mut response = client
        .get(url.clone())
        .header(header::ACCEPT_ENCODING, "identity")
        .header(header::RANGE, format!("bytes={offset}-{end}"))
        .send()
        .await
        .map_err(network_error)?;
    let status = response.status();
    if status == StatusCode::REQUEST_TIMEOUT
        || status == StatusCode::TOO_MANY_REQUESTS
        || status.is_server_error()
    {
        return Err(Failure::Retry(format!(
            "下载服务器暂不可用（HTTP {}）",
            status.as_u16()
        )));
    }
    let (expected, length, whole) = if status == StatusCode::PARTIAL_CONTENT {
        let (start, actual_end, length) = response
            .headers()
            .get(header::CONTENT_RANGE)
            .and_then(|v| v.to_str().ok())
            .and_then(content_range)
            .ok_or_else(|| Failure::Fatal("下载服务器返回了无效的分段范围".into()))?;
        if start != offset as u64
            || actual_end < start
            || actual_end > end
            || actual_end >= length
            || total.is_some_and(|t| t != length)
        {
            return Err(Failure::Fatal(
                "更新包大小或分段范围发生变化，请重新检查更新".into(),
            ));
        }
        (Some(actual_end - start + 1), Some(length), false)
    } else if status == StatusCode::OK {
        // Servers without Range support return a whole file. Never append it to
        // existing ranges; replace them only after the entire response succeeds.
        (response.content_length(), response.content_length(), true)
    } else {
        return Err(Failure::Fatal(format!(
            "无法下载更新包（HTTP {}），请重新检查更新",
            status.as_u16()
        )));
    };
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        if expected.is_some_and(|n| bytes.len() as u64 + chunk.len() as u64 > n) {
            return Err(Failure::Fatal("下载服务器返回的内容超出声明范围".into()));
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() || expected.is_some_and(|n| n != bytes.len() as u64) {
        return Err(Failure::Retry("更新包分段未完整接收".into()));
    }
    Ok(Segment {
        total: length.unwrap_or(bytes.len() as u64),
        bytes,
        whole,
    })
}

async fn transfer(
    client: &Client,
    url: &Url,
    buffer: &mut Buffer,
    policy: Policy,
    event: &mut impl FnMut(DownloadEvent),
) -> Result<(), String> {
    event(DownloadEvent::Started {
        content_length: buffer.total,
        downloaded: buffer.bytes.len(),
    });
    while buffer.total.is_none_or(|n| (buffer.bytes.len() as u64) < n) {
        let mut attempt = 1;
        let segment = loop {
            match fetch(
                client,
                url,
                buffer.bytes.len(),
                buffer.total,
                policy.segment_bytes,
            )
            .await
            {
                Ok(segment) => break segment,
                Err(Failure::Fatal(error)) => {
                    *buffer = Buffer::default();
                    return Err(error);
                }
                Err(Failure::Retry(error)) => {
                    if attempt >= policy.attempts {
                        return Err(format!(
                            "{error}；已尝试 {} 次，可点击重试继续下载",
                            policy.attempts
                        ));
                    }
                    attempt += 1;
                    event(DownloadEvent::Retrying {
                        attempt,
                        max_attempts: policy.attempts,
                    });
                    tokio::time::sleep(policy.retry_delay * (attempt - 1)).await;
                }
            }
        };
        if segment.whole {
            buffer.bytes.clear();
        }
        buffer.total = Some(segment.total);
        event(DownloadEvent::Started {
            content_length: buffer.total,
            downloaded: buffer.bytes.len(),
        });
        let size = segment.bytes.len();
        buffer.bytes.extend(segment.bytes);
        event(DownloadEvent::Progress { chunk_length: size });
    }
    Ok(())
}

#[cfg(test)]
#[path = "update_download_tests.rs"]
mod tests;
