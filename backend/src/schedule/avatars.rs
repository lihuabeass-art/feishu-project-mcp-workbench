use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{sync::OnceLock, time::Duration};

const MAX_BYTES: usize = 128 * 1024;
static DOWNLOADS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(4);
static CLIENT: OnceLock<Option<reqwest::Client>> = OnceLock::new();

fn avatar_url(url: &str) -> Option<reqwest::Url> {
    let url = reqwest::Url::parse(url).ok()?;
    let host = url.host_str()?;
    let trusted = ["feishucdn.com", "larksuitecdn.com", "byteimg.com"]
        .iter()
        .any(|domain| {
            host == *domain
                || host
                    .strip_suffix(domain)
                    .is_some_and(|prefix| prefix.ends_with('.'))
        });
    (trusted
        && url.scheme() == "https"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none())
    .then_some(url)
}

pub fn load_avatar(
    session: &Session,
    connection: &str,
    url: &str,
) -> Result<Option<String>, BackendError> {
    let Some(url) = avatar_url(url) else {
        return Ok(None);
    };
    if fingerprint(session)? != connection {
        return Ok(None);
    }
    let key = format!("{:x}", Sha256::digest(url.as_str().as_bytes()));
    let cached = session
        .store
        .read_schedule_avatar(connection, &key)
        .ok()
        .flatten();
    let image = if let Some(image) = cached {
        Some(image)
    } else {
        let downloaded = crate::remote::runtime()?.block_on(async {
            let _permit = DOWNLOADS.acquire().await.ok()?;
            // 排队期间另一个窗口可能已缓存了同一地址。
            if let Ok(Some(image)) = session.store.read_schedule_avatar(connection, &key) {
                return Some(image);
            }
            let image = download(url).await?;
            let _ = session
                .store
                .save_schedule_avatar(connection, &key, &image.0, &image.1);
            Some(image)
        });
        downloaded
    };
    Ok(image.map(|(mime, bytes)| format!("data:{mime};base64,{}", STANDARD.encode(bytes))))
}

async fn download(url: reqwest::Url) -> Option<(String, Vec<u8>)> {
    let client = CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .https_only(true)
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(5))
                .build()
                .ok()
        })
        .as_ref()?;
    let mut response = client.get(url).send().await.ok()?.error_for_status().ok()?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|len| len > MAX_BYTES as u64)
    {
        return None;
    }
    let mime = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)?
        .to_str()
        .ok()?
        .split(';')
        .next()?
        .trim()
        .to_ascii_lowercase();
    if !matches!(
        mime.as_str(),
        "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/avif"
    ) {
        return None;
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        if bytes.len() + chunk.len() > MAX_BYTES {
            return None;
        }
        bytes.extend_from_slice(&chunk);
    }
    (!bytes.is_empty()).then_some((mime, bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_public_avatar_cdn_https_addresses_are_downloaded() {
        assert!(avatar_url("https://p3-imfile.feishucdn.com/avatar.png").is_some());
        assert!(avatar_url("https://p3.byteimg.com/avatar.webp").is_some());
        for url in [
            "http://feishucdn.com/a",
            "https://feishucdn.com.example/a",
            "https://fakefeishucdn.com/a",
            "https://user@feishucdn.com/a",
            "https://feishucdn.com:1234/a",
            "https://127.0.0.1/a",
        ] {
            assert!(avatar_url(url).is_none());
        }
    }
}
