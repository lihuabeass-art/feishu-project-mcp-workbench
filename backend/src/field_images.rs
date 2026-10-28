//! 业务字段图片：引用归属校验、MCP 签名下载与本地二进制缓存。
//! MCP token 和下载签名始终留在后端，IPC 只返回经类型检查的图片 data URL。
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use base64::Engine;
use reqwest::{Client, Url};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::{api::Session, BackendError, WorkItemId};

const MAX_BYTES: usize = 20 * 1024 * 1024;
const CACHE_BYTES: u64 = 256 * 1024 * 1024;
const CACHE_AGE: Duration = Duration::from_secs(7 * 24 * 60 * 60);

fn failure(detail: &str) -> BackendError {
    BackendError::parse("业务字段图片", detail)
}

fn image_mime(bytes: &[u8]) -> Result<&'static str, BackendError> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Ok("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Ok("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Ok("image/gif")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Ok("image/webp")
    } else if bytes.starts_with(b"BM") {
        Ok("image/bmp")
    } else {
        Err(failure("文件不是支持的图片（PNG、JPEG、GIF、WebP、BMP）"))
    }
}

fn data_url(bytes: &[u8]) -> Result<String, BackendError> {
    if bytes.len() > MAX_BYTES {
        return Err(failure("图片超过 20 MB，暂不能预览"));
    }
    Ok(format!(
        "data:{};base64,{}",
        image_mime(bytes)?,
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

fn checked_url(raw: &str) -> Result<Url, BackendError> {
    let url = Url::parse(raw).map_err(|_| failure("图片地址不合法"))?;
    let host = url
        .host_str()
        .ok_or_else(|| failure("图片地址缺少主机名"))?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.parse::<std::net::IpAddr>().is_ok()
        || host.starts_with('[')
    {
        return Err(failure("图片需要不带账号信息的 HTTPS 网络地址"));
    }
    Ok(url)
}

// 字段可以是 Markdown/HTML 字符串、附件数组或富文本节点。只接受快照里已有的引用。
fn contains_reference(value: &Value, url: &str) -> bool {
    match value {
        Value::String(text) => text.match_indices(url).any(|(start, _)| {
            let before = text[..start].chars().next_back();
            let after = text[start + url.len()..].chars().next();
            before.is_none_or(|c| c.is_whitespace() || matches!(c, '(' | '"' | '\'' | '<' | '>'))
                && after
                    .is_none_or(|c| c.is_whitespace() || matches!(c, ')' | '"' | '\'' | '<' | '>'))
        }),
        Value::Array(values) => values.iter().any(|v| contains_reference(v, url)),
        Value::Object(values) => values.values().any(|v| contains_reference(v, url)),
        _ => false,
    }
}

fn cache_root(db_path: &Path) -> PathBuf {
    db_path.with_extension("field-images-v1")
}

pub(crate) fn item_cache_directory(db_path: &Path, key: &(String, String, String)) -> PathBuf {
    let identity = serde_json::to_vec(key).expect("serializable item identity");
    cache_root(db_path).join(format!("{:x}", Sha256::digest(identity)))
}

fn legacy_cache_path(session: &Session, id: &WorkItemId, field: &str, url: &str) -> PathBuf {
    let identity = serde_json::to_vec(&(id, field, url)).expect("serializable image identity");
    cache_root(&session.config.db_path).join(format!("{:x}.img", Sha256::digest(identity)))
}

fn cache_path(session: &Session, id: &WorkItemId, field: &str, url: &str) -> PathBuf {
    let legacy = legacy_cache_path(session, id, field, url);
    // 按事项分目录，删除时不需要从不可逆的图片散列推断归属。
    item_cache_directory(&session.config.db_path, &id.key_tuple()).join(legacy.file_name().unwrap())
}

fn read_cache(path: &Path) -> Option<String> {
    let metadata = path.metadata().ok()?;
    if metadata.len() > MAX_BYTES as u64 || metadata.modified().ok()?.elapsed().ok()? > CACHE_AGE {
        return None;
    }
    data_url(&std::fs::read(path).ok()?).ok()
}

fn save_cache(path: &Path, bytes: &[u8]) {
    let Some(dir) = path.parent() else {
        return;
    };
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }
    // 临时文件名唯一；失败或中断不能留下看似完整的缓存。
    let nonce = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = path.with_extension(format!("{}-{nonce}.tmp", std::process::id()));
    if std::fs::write(&temporary, bytes).is_ok() {
        // Windows 上 rename 不覆盖已有文件。已有有效缓存可继续用，重试会绕过它。
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
        let _ = std::fs::rename(&temporary, path);
    }
    let _ = std::fs::remove_file(&temporary);
    if let Some(root) = dir.parent() {
        prune_cache_root(root, CACHE_BYTES, SystemTime::now());
    }
}

/// 启动时也清理过期图片，包含旧版没有事项目录的缓存。
pub(crate) fn prune_cache(db_path: &Path) {
    prune_cache_root(&cache_root(db_path), CACHE_BYTES, SystemTime::now());
}

fn prune_cache_root(root: &Path, max_bytes: u64, now: SystemTime) {
    let mut entries = Vec::new();
    let mut directories = Vec::new();
    for entry in std::fs::read_dir(root).into_iter().flatten().flatten() {
        if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
            entries.extend(std::fs::read_dir(entry.path()).into_iter().flatten().flatten());
            directories.push(entry.path());
        } else {
            entries.push(entry);
        }
    }
    let mut files: Vec<_> = entries.into_iter()
        .filter(|f| f.path().extension().is_some_and(|e| e == "img"))
        .filter_map(|f| {
            let m = f.metadata().ok()?;
            Some((f.path(), m.len(), m.modified().ok()?))
        }).collect();
    files.sort_by_key(|f| f.2);
    let mut total: u64 = files.iter().map(|f| f.1).sum();
    for (file, size, modified) in files {
        if (total > max_bytes || now.duration_since(modified).unwrap_or_default() > CACHE_AGE)
            && std::fs::remove_file(file).is_ok()
        {
            total = total.saturating_sub(size);
        }
    }
    for directory in directories {
        let _ = std::fs::remove_dir(directory); // 只移除空目录。
    }
}

fn download_metadata(value: &Value) -> Result<(Url, &str), BackendError> {
    if value.get("is_multipart").and_then(Value::as_bool) == Some(true) {
        return Err(failure("该图片需要分片下载，暂不能预览，请在飞书中查看"));
    }
    let url = value
        .get("download_url")
        .and_then(Value::as_str)
        .ok_or_else(|| failure("下载工具未返回 download_url"))?;
    let sign = value
        .get("sign")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| failure("下载工具未返回签名"))?;
    Ok((checked_url(url)?, sign))
}

async fn download(
    client: &Client,
    mut url: Url,
    sign: Option<&str>,
) -> Result<Vec<u8>, BackendError> {
    let signed_host = url.host_str().map(str::to_owned);
    for _ in 0..6 {
        let mut request = client.get(url.clone());
        // 不带 MCP token；签名也绝不跟随跨主机重定向。
        if url.host_str() == signed_host.as_deref() {
            if let Some(sign) = sign {
                request = request.header("X-Meego-File-Sign", sign);
            }
        }
        let mut response = request
            .send()
            .await
            .map_err(|_| failure("图片请求失败或超时，请重试"))?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| failure("图片重定向缺少地址"))?;
            url = checked_url(
                url.join(location)
                    .map_err(|_| failure("图片重定向地址不合法"))?
                    .as_str(),
            )?;
            continue;
        }
        if !response.status().is_success() {
            return Err(failure(&format!(
                "图片下载失败（HTTP {}），请重试",
                response.status().as_u16()
            )));
        }
        if response
            .content_length()
            .is_some_and(|n| n > MAX_BYTES as u64)
        {
            return Err(failure("图片超过 20 MB，暂不能预览"));
        }
        let mime = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        if !mime.is_empty() && !mime.starts_with("image/") && mime != "application/octet-stream" {
            return Err(failure("下载返回的内容不是图片，可能需要重新连接飞书"));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| failure("图片下载中断，请重试"))?
        {
            if bytes.len() + chunk.len() > MAX_BYTES {
                return Err(failure("图片超过 20 MB，暂不能预览"));
            }
            bytes.extend_from_slice(&chunk);
        }
        image_mime(&bytes)?;
        return Ok(bytes);
    }
    Err(failure("图片重定向次数过多"))
}

pub fn load(
    session: &Session,
    id: &WorkItemId,
    field_key: &str,
    raw_url: &str,
    refresh: bool,
) -> Result<String, BackendError> {
    if !id.missing_parts().is_empty() {
        return Err(failure("图片需要完整的工作项身份"));
    }
    let url = checked_url(raw_url)?;
    let detail = session
        .cached_item_detail(id)?
        .ok_or_else(|| failure("请先刷新工作项详情"))?;
    let belongs = detail
        .data
        .get("work_item_fields")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .any(|field| {
            field.get("key").and_then(Value::as_str) == Some(field_key)
                && field
                    .get("value")
                    .is_some_and(|v| contains_reference(v, raw_url))
        });
    if !belongs {
        return Err(failure("图片不属于当前业务字段，请刷新详情"));
    }
    let path = cache_path(session, id, field_key, raw_url);
    if !refresh {
        if let Some(data) = read_cache(&path) {
            return Ok(data);
        }
        let legacy = legacy_cache_path(session, id, field_key, raw_url);
        if let Some(data) = read_cache(&legacy) {
            if let Ok(bytes) = std::fs::read(&legacy) {
                save_cache(&path, &bytes);
                if path.is_file() { let _ = std::fs::remove_file(legacy); }
            }
            return Ok(data);
        }
    }
    let endpoint = checked_url(&session.config.endpoint)?;
    let signed = url.host_str() == endpoint.host_str();
    let metadata = if signed {
        Some(session.call_read_tool("get_download_url", json!({"project_key":id.project_key,"work_item_id":id.work_item_id,"file_url":raw_url}).as_object().unwrap())?)
    } else {
        None
    };
    let (download_url, sign) = match metadata.as_ref() {
        Some(metadata) => {
            let (target, sign) = download_metadata(metadata)?;
            (target, Some(sign))
        }
        None => (url, None),
    };
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| failure("无法建立图片下载连接"))?;
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|_| failure("无法启动图片下载任务"))?;
    let bytes = runtime.block_on(download(&client, download_url, sign))?;
    let result = data_url(&bytes)?;
    save_cache(&path, &bytes);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cached_images_work_offline_and_cannot_cross_field_or_item() {
        let dir = std::env::temp_dir().join(format!(
            "fstodo-images-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let config_path = dir.join("config.toml");
        std::fs::write(&config_path, "").unwrap();
        let config = crate::Config::load(Some(&config_path), Some(&dir.join("test.db"))).unwrap();
        let session = Session::open(config).unwrap();
        let id = WorkItemId {
            project_key: Some("p".into()),
            work_item_type_key: Some("issue".into()),
            work_item_id: "1".into(),
        };
        let url = "https://project.feishu.cn/file/example";
        session.store.save_item_detail(&crate::detail::ItemDetail { id: id.clone(), fetched_at_ms: 0, data: json!({"work_item_fields":[{"key":"description","value":format!("![]({url})")},{"key":"other","value":"other text"}]}), pages: vec![] }).unwrap();
        let path = cache_path(&session, &id, "description", url);
        let legacy = legacy_cache_path(&session, &id, "description", url);
        std::fs::create_dir_all(legacy.parent().unwrap()).unwrap();
        std::fs::write(&legacy, b"\x89PNG\r\n\x1a\nexample").unwrap();
        assert!(load(&session, &id, "description", url, false)
            .unwrap()
            .starts_with("data:image/png;base64,"));
        assert!(path.is_file(), "旧缓存按需迁入对应事项的目录");
        assert!(!legacy.exists());
        assert!(load(&session, &id, "other", url, false).is_err());
        let different = WorkItemId {
            work_item_id: "2".into(),
            ..id.clone()
        };
        assert!(load(&session, &different, "description", url, false).is_err());
        assert_ne!(path, cache_path(&session, &different, "description", url));
        std::fs::write(&path, b"<html>login</html>").unwrap();
        assert!(read_cache(&path).is_none());
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn cache_budget_covers_all_items_and_legacy_files_and_expires_without_new_downloads() {
        let root = std::env::temp_dir().join(format!("fstodo-image-budget-{}-{}",
            std::process::id(), SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(root.join("first")).unwrap();
        std::fs::create_dir_all(root.join("second")).unwrap();
        let now = SystemTime::now();
        let files = [root.join("old.img"), root.join("first/a.img"), root.join("second/b.img")];
        for (index, file) in files.iter().enumerate() {
            std::fs::write(file, b"12345678").unwrap();
            let modified = now - Duration::from_secs(30 - index as u64 * 10);
            std::fs::File::options().write(true).open(file).unwrap()
                .set_times(std::fs::FileTimes::new().set_modified(modified)).unwrap();
        }
        prune_cache_root(&root, 16, now);
        assert!(!files[0].exists(), "跨事项和旧版平铺文件共用容量上限");
        assert!(files[1].exists() && files[2].exists());
        prune_cache_root(&root, 16, now + CACHE_AGE);
        assert!(!files[1].exists() && !files[2].exists());
        assert!(!root.join("first").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn markdown_and_attachment_references_are_bound_to_exact_url() {
        let url = "https://project.feishu.cn/file/a";
        assert!(contains_reference(
            &json!(format!("before ![]({url}) after")),
            url
        ));
        assert!(contains_reference(
            &json!([{"type":"image/png","url":url}]),
            url
        ));
        assert!(!contains_reference(
            &json!(format!("![]({url}suffix)")),
            url
        ));
    }

    #[test]
    fn content_is_sniffed_and_active_content_is_rejected() {
        assert_eq!(
            image_mime(b"\x89PNG\r\n\x1a\nexample").unwrap(),
            "image/png"
        );
        assert!(data_url(b"<html>login</html>").is_err());
        assert!(data_url(b"<svg onload='x()'></svg>").is_err());
        assert!(checked_url("file:///secret.png").is_err());
        assert!(checked_url("https://localhost/a.png").is_err());
        assert!(checked_url("https://u:p@project.feishu.cn/a").is_err());
    }

    #[test]
    fn signed_download_contract_matches_observed_response() {
        let v = json!({"download_url":"https://project.feishu.cn/download/mcp/file","sign":"test-sign","is_multipart":false,"sign_expire_time":1792493077});
        let (url, sign) = download_metadata(&v).unwrap();
        assert_eq!(url.host_str(), Some("project.feishu.cn"));
        assert_eq!(sign, "test-sign");
        assert!(download_metadata(&json!({"is_multipart":true})).is_err());
    }
}
