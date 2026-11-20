//! Preserve explicit environment proxy precedence when system proxy is enabled.

#[cfg(target_os = "macos")]
fn env_proxy(upper: &str, lower: &str) -> Option<String> {
    std::env::var(upper).or_else(|_| std::env::var(lower)).ok()
}

#[cfg(any(target_os = "macos", test))]
fn explicit_environment(
    mut builder: reqwest::ClientBuilder,
    all: &str,
    http: Option<&str>,
    https: Option<&str>,
    no_proxy: Option<reqwest::NoProxy>,
) -> reqwest::ClientBuilder {
    let Ok(all_proxy) = reqwest::Proxy::all(all) else {
        return builder;
    };
    if let Some(proxy) = http.and_then(|value| reqwest::Proxy::http(value).ok()) {
        builder = builder.proxy(proxy.no_proxy(no_proxy.clone()));
    }
    if let Some(proxy) = https.and_then(|value| reqwest::Proxy::https(value).ok()) {
        builder = builder.proxy(proxy.no_proxy(no_proxy.clone()));
    }
    builder.proxy(all_proxy.no_proxy(no_proxy))
}

pub(crate) fn configure(builder: reqwest::ClientBuilder) -> reqwest::ClientBuilder {
    #[cfg(target_os = "macos")]
    {
        // hyper-util otherwise lets a system HTTP(S) proxy override ALL_PROXY.
        // Keep the previous environment-only precedence when ALL_PROXY is set.
        if std::env::var_os("REQUEST_METHOD").is_none() {
            if let Some(all) = env_proxy("ALL_PROXY", "all_proxy").filter(|v| !v.is_empty()) {
                return explicit_environment(
                    builder,
                    &all,
                    env_proxy("HTTP_PROXY", "http_proxy").as_deref(),
                    env_proxy("HTTPS_PROXY", "https_proxy").as_deref(),
                    reqwest::NoProxy::from_env(),
                );
            }
        }
    }
    builder
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn response_server() -> (String, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream.set_read_timeout(Some(std::time::Duration::from_secs(3))).unwrap();
            let mut bytes = [0; 4096];
            let count = stream.read(&mut bytes).unwrap();
            stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n").unwrap();
            String::from_utf8_lossy(&bytes[..count]).into_owned()
        });
        (address, handle)
    }

    #[tokio::test]
    async fn explicit_http_proxy_and_no_proxy_take_precedence_over_all_proxy() {
        let (http_proxy, http_request) = response_server();
        let (all_proxy, all_request) = response_server();
        let (direct_server, direct_request) = response_server();
        let builder = explicit_environment(
            reqwest::Client::builder(),
            &all_proxy,
            Some(&http_proxy),
            None,
            reqwest::NoProxy::from_string("127.0.0.1"),
        );
        let client = builder.build().unwrap();
        assert!(client.get("http://proxy-test.invalid/path").send().await.unwrap().status().is_success());
        assert!(http_request.join().unwrap().starts_with("GET http://proxy-test.invalid/path"));
        assert!(client.get(&direct_server).send().await.unwrap().status().is_success());
        assert!(direct_request.join().unwrap().starts_with("GET / "));

        // An all-proxy-only client still uses that proxy for non-exempt hosts.
        let client = explicit_environment(reqwest::Client::builder(), &all_proxy, None, None, None)
            .build().unwrap();
        assert!(client.get("http://all-proxy-test.invalid/").send().await.unwrap().status().is_success());
        assert!(all_request.join().unwrap().starts_with("GET http://all-proxy-test.invalid/"));
    }

    #[tokio::test]
    async fn explicit_https_proxy_takes_precedence_over_all_proxy() {
        let (https_proxy, request) = response_server();
        let client = explicit_environment(
            reqwest::Client::builder(),
            "http://127.0.0.1:1",
            None,
            Some(&https_proxy),
            None,
        )
        .build()
        .unwrap();
        // The fake proxy closes after CONNECT. The TLS failure is expected.
        assert!(client.get("https://proxy-test.invalid/").send().await.is_err());
        assert!(request.join().unwrap().starts_with("CONNECT proxy-test.invalid:443"));
    }
}
