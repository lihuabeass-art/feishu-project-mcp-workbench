//! 飞书官方 url-links.md 的 workitem_detail 路径；不把文档链接当作事项页面。
//! https://github.com/larksuite/meegle-cli/blob/main/skills/meegle/references/url-links.md

use reqwest::Url;
use serde_json::Value;

use crate::model::domain::WorkItemId;

pub(super) fn item_url(endpoint: &str, id: &WorkItemId, detail: &Value) -> Option<String> {
    let endpoint = Url::parse(endpoint).ok()?;
    let host = endpoint.host_str()?.trim_end_matches('.');
    // 目前只确认飞书项目官方 MCP 端点与同站事项页面；代理或自定义端点不推断网页域名。
    if endpoint.scheme() != "https"
        || !endpoint.username().is_empty()
        || endpoint.password().is_some()
        || host != "project.feishu.cn"
        || !matches!(endpoint.path(), "/mcp_server/v1" | "/mcp_server/v1/")
        || endpoint.query().is_some()
        || endpoint.fragment().is_some()
    {
        return None;
    }
    let attribute = &detail["work_item_attribute"];
    let project = &attribute["owned_project"];
    let type_key = attribute["work_item_type"]["key"].as_str()?;
    let item_id = match &attribute["work_item_id"] {
        Value::String(value) => value.clone(),
        Value::Number(value) => value.to_string(),
        _ => return None,
    };
    if project["key"].as_str()? != id.project_key.as_deref()?
        || type_key != id.work_item_type_key.as_deref()?
        || item_id != id.work_item_id
    {
        return None;
    }
    let simple_name = project["simple_name"].as_str()?;
    // 页面路由使用 api_name，不能把自定义类型的 type_key 当作同义值。
    let route_type = match attribute["work_item_type"].get("api_name") {
        Some(Value::String(name)) if !name.trim().is_empty() => name.as_str(),
        None | Some(Value::Null) if matches!(type_key, "story" | "issue") => type_key,
        _ => return None,
    };
    let segments = [simple_name, route_type, "detail", item_id.as_str()];
    let encoded = segments
        .iter()
        .map(|part| encode_segment(part))
        .collect::<Option<Vec<_>>>()?;
    let port = endpoint
        .port()
        .map(|port| format!(":{port}"))
        .unwrap_or_default();
    let url = Url::parse(&format!("https://{host}{port}/{}", encoded.join("/"))).ok()?;
    // 结构和解码后语义共同核对，防止路径归一化或保留路由改变目标身份。
    let decoded = url
        .path_segments()?
        .map(decode_segment)
        .collect::<Option<Vec<_>>>()?;
    if url.host_str()? != host
        || url.port() != endpoint.port()
        || decoded.iter().map(String::as_str).ne(segments)
        || url.query().is_some()
        || url.fragment().is_some()
        || !ordinary_detail_route(&decoded)
    {
        return None;
    }
    Some(url.into())
}

fn ordinary_detail_route(segments: &[String]) -> bool {
    if segments.len() != 4 || segments[2] != "detail" || segments[0] == "meego" {
        return false;
    }
    // url_rules.go 的前置规则会将这些四段路径识别为设置、图表或视图，不能交付为事项。
    if matches!(
        segments[1].as_str(),
        "setting"
            | "chart"
            | "chartdatascope"
            | "chartdatascopeV2"
            | "chartpenetrate"
            | "chartpenetrateV2"
            | "workObjectView"
    ) {
        return false;
    }
    // 官方 decoder 会去掉资源包装并置 is_resource；当前 brief 尚无已核验的资源身份契约。
    !segments[1]
        .strip_prefix('_')
        .and_then(|key| key.strip_suffix("_resource"))
        .is_some_and(|inner| !inner.is_empty())
}

fn encode_segment(value: &str) -> Option<String> {
    if value.trim().is_empty()
        || matches!(value, "." | "..")
        || value
            .chars()
            .any(|ch| ch.is_control() || matches!(ch, '/' | '\\' | '?' | '#'))
    {
        return None;
    }
    let mut encoded = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            encoded.push(char::from(byte));
        } else {
            use std::fmt::Write;
            write!(encoded, "%{byte:02X}").ok()?;
        }
    }
    Some(encoded)
}

fn decode_segment(value: &str) -> Option<String> {
    let mut decoded = Vec::new();
    let mut index = 0;
    while index < value.len() {
        if value.as_bytes()[index] == b'%' {
            decoded.push(u8::from_str_radix(value.get(index + 1..index + 3)?, 16).ok()?);
            index += 3;
        } else {
            decoded.push(value.as_bytes()[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn identity() -> WorkItemId {
        WorkItemId {
            project_key: Some("p".into()),
            work_item_type_key: Some("story".into()),
            work_item_id: "1234".into(),
        }
    }

    fn detail() -> Value {
        json!({"work_item_attribute":{"owned_project":{"key":"p","simple_name":"sample"},
            "work_item_type":{"key":"story"},"work_item_id":1234}})
    }

    #[test]
    fn detail_url_uses_same_read_identity_host_and_official_canonical_route() {
        for (endpoint, expected) in [
            (
                "https://project.feishu.cn/mcp_server/v1",
                "https://project.feishu.cn/sample/story/detail/1234",
            ),
            (
                "https://PROJECT.FEISHU.CN.:8443/mcp_server/v1",
                "https://project.feishu.cn:8443/sample/story/detail/1234",
            ),
        ] {
            assert_eq!(
                item_url(endpoint, &identity(), &detail()).as_deref(),
                Some(expected)
            );
        }
        let mut detail = detail();
        detail["work_item_attribute"]["owned_project"]["simple_name"] = json!("空间 +%~");
        assert_eq!(
            item_url(
                "https://project.feishu.cn/mcp_server/v1",
                &identity(),
                &detail
            )
            .unwrap(),
            "https://project.feishu.cn/%E7%A9%BA%E9%97%B4%20%2B%25~/story/detail/1234"
        );
    }

    #[test]
    fn missing_metadata_or_mismatched_identity_does_not_guess_item_url() {
        for pointer in [
            "/work_item_attribute/owned_project/key",
            "/work_item_attribute/owned_project/simple_name",
            "/work_item_attribute/work_item_type/key",
            "/work_item_attribute/work_item_id",
        ] {
            for value in [Value::Null, json!("different")] {
                if pointer.ends_with("simple_name") && value.is_string() {
                    continue;
                }
                let mut detail = detail();
                *detail.pointer_mut(pointer).unwrap() = value;
                assert!(item_url(
                    "https://project.feishu.cn/mcp_server/v1",
                    &identity(),
                    &detail
                )
                .is_none());
            }
        }
        let mut detail = detail();
        detail["work_item_fields"] =
            json!([{"key":"design","value":"https://example.test/design"}]);
        detail["work_item_attribute"]["owned_project"]["simple_name"] = Value::Null;
        assert!(item_url(
            "https://project.feishu.cn/mcp_server/v1",
            &identity(),
            &detail
        )
        .is_none());
        for endpoint in [
            "",
            "http://project.feishu.cn/mcp",
            "https://project.feishu.cn.example.test/mcp",
            "https://example.test/mcp",
            "https://docs.feishu.cn/mcp",
            "https://user@project.feishu.cn/mcp_server/v1",
            "https://meegle.com/mcp_server/v1",
            "https://project.feishu.cn/custom-mcp",
            "https://project.feishu.cn/mcp_server/v1?proxy=true",
        ] {
            assert!(item_url(endpoint, &identity(), &self::detail()).is_none());
        }
    }

    #[test]
    fn custom_type_requires_explicit_api_name_instead_of_using_identity_key_as_route() {
        let mut id = identity();
        id.work_item_type_key = Some("custom-key".into());
        let mut detail = detail();
        detail["work_item_attribute"]["work_item_type"]["key"] = json!("custom-key");
        assert!(item_url("https://project.feishu.cn/mcp_server/v1", &id, &detail).is_none());
        detail["work_item_attribute"]["work_item_type"]["api_name"] = json!("review_process");
        assert_eq!(
            item_url("https://project.feishu.cn/mcp_server/v1", &id, &detail).as_deref(),
            Some("https://project.feishu.cn/sample/review_process/detail/1234")
        );
        detail["work_item_attribute"]["work_item_type"]["api_name"] = json!("");
        assert!(item_url("https://project.feishu.cn/mcp_server/v1", &id, &detail).is_none());
    }

    #[test]
    fn ambiguous_path_segments_reserved_routes_and_unverified_resource_have_no_item_url() {
        for invalid in [
            "", " ", ".", "..", "a/b", "a\\b", "a?b", "a#b", "a\nb", "a\u{7f}b",
        ] {
            let mut detail = detail();
            detail["work_item_attribute"]["owned_project"]["simple_name"] = json!(invalid);
            assert!(
                item_url(
                    "https://project.feishu.cn/mcp_server/v1",
                    &identity(),
                    &detail
                )
                .is_none(),
                "{invalid:?}"
            );
        }
        for kind in [
            "setting",
            "chart",
            "chartdatascope",
            "chartdatascopeV2",
            "chartpenetrate",
            "chartpenetrateV2",
            "workObjectView",
            "_story_resource",
        ] {
            let mut detail = detail();
            let mut id = identity();
            id.work_item_type_key = Some(kind.into());
            detail["work_item_attribute"]["work_item_type"]["key"] = json!(kind);
            detail["work_item_attribute"]["work_item_type"]["api_name"] = json!(kind);
            assert!(
                item_url("https://project.feishu.cn/mcp_server/v1", &id, &detail).is_none(),
                "{kind}"
            );
        }
        let mut detail = detail();
        detail["work_item_attribute"]["owned_project"]["simple_name"] = json!("meego");
        assert!(item_url(
            "https://project.feishu.cn/mcp_server/v1",
            &identity(),
            &detail
        )
        .is_none());
    }
}
