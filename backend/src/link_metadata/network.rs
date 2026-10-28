//! 普通 DNS 优先；代理返回 Fake-IP 时，独立解析真实公网地址后再固定连接目标。
use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

use reqwest::Url;
use serde_json::Value;

use super::public_ip;

fn fake_ip(ip: IpAddr) -> bool {
    matches!(ip, IpAddr::V4(ip) if ip.octets()[0] == 198 && matches!(ip.octets()[1], 18 | 19))
}

fn needs_public_dns(addresses: &[SocketAddr]) -> Option<bool> {
    if addresses.is_empty()
        || addresses
            .iter()
            .any(|addr| !public_ip(addr.ip()) && !fake_ip(addr.ip()))
    {
        return None;
    }
    Some(addresses.iter().any(|addr| fake_ip(addr.ip())))
}

fn doh_addresses(value: &Value, host: &str, port: u16) -> Option<Vec<SocketAddr>> {
    if value.get("Status")?.as_u64()? != 0 {
        return None;
    }
    let question = value.get("Question")?;
    // AliDNS 的 Question 为单对象；确认返回结果确实属于请求的主机名。
    if !question
        .get("name")?
        .as_str()?
        .trim_end_matches('.')
        .eq_ignore_ascii_case(host.trim_end_matches('.'))
        || question.get("type")?.as_u64()? != 1
    {
        return None;
    }
    let addresses: Vec<_> = value
        .get("Answer")?
        .as_array()?
        .iter()
        .filter(|answer| answer.get("type").and_then(Value::as_u64) == Some(1))
        .map(|answer| {
            answer
                .get("data")?
                .as_str()?
                .parse::<IpAddr>()
                .ok()
                .map(|ip| SocketAddr::new(ip, port))
        })
        .collect::<Option<Vec<_>>>()?;
    if addresses.is_empty()
        || addresses.len() > 32
        || addresses.iter().any(|addr| !public_ip(addr.ip()))
    {
        return None;
    }
    Some(addresses)
}

pub(super) async fn public_addresses(host: &str, port: u16) -> Option<Vec<SocketAddr>> {
    let system: Vec<_> = tokio::net::lookup_host((host, port)).await.ok()?.collect();
    if !needs_public_dns(&system)? {
        return Some(system);
    }
    // 仅 Fake-IP 触发：固定官方 DoH 地址与 TLS 主机名，不直接放行保留网段。
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .timeout(Duration::from_secs(3))
        .resolve_to_addrs(
            "dns.alidns.com",
            &[
                SocketAddr::from(([223, 5, 5, 5], 443)),
                SocketAddr::from(([223, 6, 6, 6], 443)),
            ],
        )
        .build()
        .ok()?;
    let mut query = Url::parse("https://dns.alidns.com/resolve").ok()?;
    query
        .query_pairs_mut()
        .append_pair("name", host)
        .append_pair("type", "A");
    let mut response = client.get(query).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        if bytes.len() + chunk.len() > 64 * 1024 {
            return None;
        }
        bytes.extend_from_slice(&chunk);
    }
    doh_addresses(&serde_json::from_slice(&bytes).ok()?, host, port)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn fake_ip_requires_independent_resolution_but_real_private_addresses_stay_blocked() {
        let addresses = |ips: &[&str]| {
            ips.iter()
                .map(|ip| SocketAddr::new(ip.parse().unwrap(), 443))
                .collect::<Vec<_>>()
        };
        assert_eq!(needs_public_dns(&addresses(&["198.18.4.96"])), Some(true));
        assert_eq!(
            needs_public_dns(&addresses(&["198.18.4.96", "8.8.8.8"])),
            Some(true)
        );
        assert_eq!(needs_public_dns(&addresses(&["8.8.8.8"])), Some(false));
        assert_eq!(
            needs_public_dns(&addresses(&["198.18.4.96", "127.0.0.1"])),
            None
        );
        assert_eq!(needs_public_dns(&addresses(&["10.0.0.1"])), None);
        assert_eq!(needs_public_dns(&[]), None);
    }

    #[test]
    fn doh_answers_require_matching_question_and_only_public_targets() {
        let mut answer = json!({"Status":0,"Question":{"name":"example.com.","type":1},"Answer":[{"type":5,"data":"cdn.example.com."},{"type":1,"data":"8.8.8.8"}]});
        assert_eq!(
            doh_addresses(&answer, "example.com", 8443).unwrap(),
            vec![SocketAddr::from(([8, 8, 8, 8], 8443))]
        );
        assert!(doh_addresses(&answer, "other.example", 443).is_none());
        for ip in [
            "127.0.0.1",
            "10.0.0.1",
            "169.254.169.254",
            "198.18.4.96",
            "not an IP",
        ] {
            answer["Answer"][1]["data"] = json!(ip);
            assert!(doh_addresses(&answer, "example.com", 443).is_none());
        }
        answer["Status"] = json!(3);
        assert!(doh_addresses(&answer, "example.com", 443).is_none());
    }
}
