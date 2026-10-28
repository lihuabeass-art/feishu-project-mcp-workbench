use encoding_rs::{Encoding, UTF_8};
use reqwest::Url;
use scraper::{Html, Selector};
use serde_json::Value;

use super::{LinkKind, LinkMetadata};

pub(super) fn title(text: &str) -> Option<String> {
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let text: String = text.chars().filter(|c| !c.is_control()).take(512).collect();
    (!text.is_empty()).then_some(text)
}

pub(super) struct FeishuResource {
    pub api_host: &'static str,
    pub token: String,
    pub doc_type: &'static str,
}

pub(super) fn feishu_resource(url: &Url) -> Option<FeishuResource> {
    let host = url.host_str()?;
    let api_host = if host == "feishu.cn" || host.ends_with(".feishu.cn") {
        "open.feishu.cn"
    } else if ["larksuite.com", "larkoffice.com"]
        .iter()
        .any(|suffix| host == *suffix || host.ends_with(&format!(".{suffix}")))
    {
        "open.larksuite.com"
    } else {
        return None;
    };
    let mut parts = url.path_segments()?;
    let doc_type = match parts.next()? {
        "wiki" => "wiki",
        "file" => "file",
        "docx" => "docx",
        "docs" | "doc" => "doc",
        "sheets" => "sheet",
        "base" => "bitable",
        "mindnotes" => "mindnote",
        "slides" => "slides",
        _ => return None,
    };
    let token = parts.next()?;
    if token.is_empty() || !token.bytes().all(|b| b.is_ascii_alphanumeric()) {
        return None;
    }
    Some(FeishuResource {
        api_host,
        token: token.into(),
        doc_type,
    })
}

pub(super) fn feishu_metadata(value: &Value, resource: &FeishuResource) -> Option<LinkMetadata> {
    if value.get("code")?.as_i64()? != 0 {
        return None;
    }
    let data = value.get("data")?;
    let raw_title = if resource.doc_type == "wiki" {
        data.get("node")?.get("title")?.as_str()?
    } else {
        data.get("metas")?
            .as_array()?
            .iter()
            .find(|meta| {
                meta.get("doc_token").and_then(Value::as_str) == Some(resource.token.as_str())
                    && meta.get("doc_type").and_then(Value::as_str) == Some(resource.doc_type)
            })?
            .get("title")?
            .as_str()?
    };
    Some(LinkMetadata {
        title: title(raw_title)?,
        kind: if resource.doc_type == "file" {
            LinkKind::File
        } else {
            LinkKind::Document
        },
    })
}

fn charset(header: &str) -> Option<&'static Encoding> {
    header.split(';').skip(1).find_map(|part| {
        let (key, value) = part.trim().split_once('=')?;
        key.trim()
            .eq_ignore_ascii_case("charset")
            .then(|| Encoding::for_label(value.trim().trim_matches(['\'', '"']).as_bytes()))?
    })
}

pub(super) fn html_metadata(
    bytes: &[u8],
    content_type: &str,
    feishu: bool,
) -> Option<LinkMetadata> {
    let mime = content_type.split(';').next()?.trim();
    if !mime.eq_ignore_ascii_case("text/html")
        && !mime.eq_ignore_ascii_case("application/xhtml+xml")
    {
        return None;
    }
    // BOM > HTTP charset > HTML meta charset > UTF-8；只解码抓取到的有限内容。
    let (encoding, skip) = Encoding::for_bom(bytes).unwrap_or_else(|| {
        let preview =
            Html::parse_document(&String::from_utf8_lossy(&bytes[..bytes.len().min(4096)]));
        let selector = Selector::parse("meta").unwrap();
        let meta_charset = preview.select(&selector).find_map(|meta| {
            meta.value()
                .attr("charset")
                .and_then(|v| Encoding::for_label(v.as_bytes()))
                .or_else(|| {
                    meta.value()
                        .attr("http-equiv")?
                        .eq_ignore_ascii_case("content-type")
                        .then(|| charset(meta.value().attr("content").unwrap_or("")))?
                })
        });
        (charset(content_type).or(meta_charset).unwrap_or(UTF_8), 0)
    });
    let (text, _, _) = encoding.decode(&bytes[skip..]);
    let html = Html::parse_document(&text);
    let metas = Selector::parse("head meta").unwrap();
    let mut og = None;
    let mut twitter = None;
    for meta in html.select(&metas) {
        let name = meta
            .value()
            .attr("property")
            .or_else(|| meta.value().attr("name"))
            .unwrap_or("");
        let content = meta.value().attr("content").and_then(title);
        if name.eq_ignore_ascii_case("og:title") && og.is_none() {
            og = content;
        } else if name.eq_ignore_ascii_case("twitter:title") && twitter.is_none() {
            twitter = content;
        }
    }
    let name = og.or(twitter).or_else(|| {
        html.select(&Selector::parse("head title").unwrap())
            .find_map(|element| title(&element.text().collect::<String>()))
    })?;
    if feishu {
        let lower = name.to_lowercase();
        if [
            "飞书",
            "飞书云文档",
            "飞书文档",
            "feishu",
            "lark",
            "lark docs",
            "feishu docs",
            "登录",
            "login",
            "sign in",
        ]
        .contains(&lower.as_str())
            || lower.starts_with("登录 - ")
            || lower.starts_with("登录飞书")
            || lower.starts_with("log in")
            || lower.starts_with("sign in - ")
            || lower.contains("无权限")
            || lower.contains("access denied")
        {
            return None;
        }
    }
    Some(LinkMetadata {
        title: name,
        kind: if feishu {
            LinkKind::Document
        } else {
            LinkKind::Webpage
        },
    })
}
