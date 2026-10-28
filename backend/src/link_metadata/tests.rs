use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};

#[test]
fn html_titles_use_metadata_priority_entities_and_declared_encoding() {
    let html = br#"<html><head><title>Fallback &amp; title</title><meta name="twitter:title" content="Twitter"><meta property="og:title" content="  A &amp; B  "></head></html>"#;
    assert_eq!(
        html_metadata(html, "text/html; charset=utf-8", false)
            .unwrap()
            .title,
        "A & B"
    );
    assert_eq!(
        html_metadata(b"<title>Fallback &amp; title</title>", "text/html", false)
            .unwrap()
            .title,
        "Fallback & title"
    );
    let (gbk, _, _) = encoding_rs::GBK.encode("<meta charset=gbk><title>前端设计文档</title>");
    assert_eq!(
        html_metadata(&gbk, "text/html", false).unwrap().title,
        "前端设计文档"
    );
    assert!(html_metadata(b"<title>secret</title>", "application/pdf", false).is_none());
    assert!(html_metadata("<title>飞书云文档</title>".as_bytes(), "text/html", true).is_none());
    assert!(html_metadata(b"<title>Sign in</title>", "text/html", true).is_none());
    assert!(html_metadata(b"<title> </title>", "text/html", false).is_none());
}

#[test]
fn feishu_tokens_and_response_identity_are_checked() {
    let wiki =
        feishu_resource(&Url::parse("https://tenant.feishu.cn/wiki/Ab123?from=copy").unwrap())
            .unwrap();
    assert_eq!(
        feishu_metadata(
            &json!({"code":0,"data":{"node":{"title":"后端设计"}}}),
            &wiki
        )
        .unwrap()
        .title,
        "后端设计"
    );
    let file =
        feishu_resource(&Url::parse("https://tenant.feishu.cn/file/File123").unwrap()).unwrap();
    let data = json!({"code":0,"data":{"metas":[{"doc_token":"File123","doc_type":"file","title":"现状盘点.md"}]}});
    assert_eq!(feishu_metadata(&data, &file).unwrap().kind, LinkKind::File);
    assert!(feishu_metadata(
        &json!({"code":999,"data":{"node":{"title":"wrong"}}}),
        &wiki
    )
    .is_none());
    assert!(feishu_metadata(&json!({"code":0,"data":{"metas":[{"doc_token":"other","doc_type":"file","title":"wrong"}]}}), &file).is_none());
    for raw in [
        "https://feishu.cn.evil.com/wiki/a",
        "https://evilfeishu.cn/wiki/a",
        "https://tenant.feishu.cn/wiki/%2Fbad",
    ] {
        assert!(feishu_resource(&Url::parse(raw).unwrap()).is_none());
    }
    assert_eq!(
        feishu_resource(&Url::parse("https://tenant.larkoffice.com/docx/Ab123").unwrap())
            .unwrap()
            .api_host,
        "open.larksuite.com"
    );
}

#[test]
fn preview_requests_cannot_target_local_networks_or_embed_credentials() {
    for raw in [
        "file:///secret",
        "javascript:alert(1)",
        "http://localhost/a",
        "https://127.0.0.1",
        "https://[::1]",
        "https://192.168.1.2",
        "https://169.254.169.254",
        "https://u:p@example.com",
        "https://a.local",
        "https://100.64.1.2",
    ] {
        assert!(checked_url(raw).is_none(), "{raw}");
    }
    assert!(checked_url("https://example.com/page#anchor")
        .unwrap()
        .fragment()
        .is_none());
    assert!(!public_ip("::ffff:127.0.0.1".parse().unwrap()));
    assert!(!public_ip("fc00::1".parse().unwrap()));
    assert!(public_ip("8.8.8.8".parse().unwrap()));
}

struct FakeHttp {
    calls: Arc<AtomicUsize>,
    handler: Box<dyn Fn(&Url, Option<Value>, Option<&SecretToken>) -> Response + Send + Sync>,
}

#[async_trait]
impl MetadataHttp for FakeHttp {
    async fn request(
        &self,
        url: &Url,
        body: Option<Value>,
        token: Option<&SecretToken>,
    ) -> Option<Response> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        tokio::task::yield_now().await;
        Some((self.handler)(url, body, token))
    }
}

fn response(body: &str) -> Response {
    Response {
        status: 200,
        location: None,
        content_type: "text/html".into(),
        body: body.as_bytes().to_vec(),
    }
}

#[tokio::test]
async fn duplicate_requests_share_fetch_and_positive_and_negative_cache() {
    let calls = Arc::new(AtomicUsize::new(0));
    let resolver = Resolver::new(FakeHttp {
        calls: calls.clone(),
        handler: Box::new(|url, _, token| {
            assert!(token.is_none());
            response(if url.path() == "/ok" {
                "<title>Business title</title>"
            } else {
                "<body>no title</body>"
            })
        }),
    });
    let (first, second) = tokio::join!(
        resolver.resolve("https://example.com/ok#a", None),
        resolver.resolve("https://example.com/ok#b", None)
    );
    assert_eq!(first, second);
    assert_eq!(first.unwrap().title, "Business title");
    resolver.resolve("https://example.com/ok", None).await;
    assert!(resolver
        .resolve("https://example.com/missing", None)
        .await
        .is_none());
    assert!(resolver
        .resolve("https://example.com/missing", None)
        .await
        .is_none());
    assert_eq!(calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn docs_authorization_is_sent_only_to_fixed_api_and_failure_falls_back() {
    let calls = Arc::new(AtomicUsize::new(0));
    let resolver = Resolver::new(FakeHttp {
        calls: calls.clone(),
        handler: Box::new(|url, body, token| {
            if url.host_str() == Some("open.feishu.cn") {
                assert_eq!(url.path(), "/open-apis/drive/v1/metas/batch_query");
                assert_eq!(body.unwrap()["request_docs"][0]["doc_token"], "File123");
                assert_eq!(token.unwrap().expose(), "docs-only");
                let mut result = response("");
                result.status = 302;
                result.location = Some("https://evil.example/leak".into());
                result
            } else {
                assert_eq!(url.host_str(), Some("tenant.feishu.cn"));
                assert!(token.is_none());
                response("<title>Public file.md</title>")
            }
        }),
    });
    let token = SecretToken::new("docs-only");
    assert_eq!(
        resolver
            .resolve("https://tenant.feishu.cn/file/File123", Some(&token))
            .await
            .unwrap()
            .title,
        "Public file.md"
    );
    assert_eq!(calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn wiki_api_resolves_title_and_new_authorization_bypasses_failure_cache() {
    let resolver = Resolver::new(FakeHttp {
        calls: Arc::new(AtomicUsize::new(0)),
        handler: Box::new(|url, body, token| {
            if url.host_str() == Some("open.feishu.cn") {
                assert!(body.is_none());
                assert!(url
                    .query_pairs()
                    .any(|(key, value)| key == "token" && value == "Wiki123"));
                assert!(token.is_some());
                response(r#"{"code":0,"data":{"node":{"title":"后端设计文档"}}}"#)
            } else {
                response("<title>飞书云文档</title>")
            }
        }),
    });
    let raw = "https://tenant.feishu.cn/wiki/Wiki123";
    assert!(resolver.resolve(raw, None).await.is_none());
    assert_eq!(
        resolver
            .resolve(raw, Some(&SecretToken::new("docs")))
            .await
            .unwrap()
            .title,
        "后端设计文档"
    );
}

#[tokio::test]
async fn redirects_are_bounded_and_cannot_reach_private_addresses() {
    let calls = Arc::new(AtomicUsize::new(0));
    let resolver = Resolver::new(FakeHttp {
        calls: calls.clone(),
        handler: Box::new(|url, _, token| {
            assert!(token.is_none());
            let mut result = response("");
            result.status = 302;
            result.location = Some(
                if url.path() == "/private" {
                    "http://127.0.0.1/secret"
                } else {
                    "/loop"
                }
                .into(),
            );
            result
        }),
    });
    assert!(resolver
        .resolve("https://example.com/private", None)
        .await
        .is_none());
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    assert!(resolver
        .resolve("https://example.com/loop", None)
        .await
        .is_none());
    assert_eq!(calls.load(Ordering::SeqCst), 6);
}

#[tokio::test]
#[ignore = "manual public network smoke test"]
async fn public_webpage_smoke() {
    let metadata = super::resolve("https://example.com/")
        .await
        .expect("public HTML title");
    assert_eq!(metadata.title, "Example Domain");
}
