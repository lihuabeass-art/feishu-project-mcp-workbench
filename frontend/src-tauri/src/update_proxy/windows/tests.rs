use super::*;
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

struct Server {
    url: String,
    requests: Arc<Mutex<Vec<String>>>,
    stop: Arc<AtomicBool>,
    worker: Option<thread::JoinHandle<()>>,
}

impl Server {
    fn new(reply: impl Fn(&str) -> String + Send + 'static) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let requests = Arc::new(Mutex::new(Vec::new()));
        let stop = Arc::new(AtomicBool::new(false));
        let (received, stopped) = (requests.clone(), stop.clone());
        let worker = thread::spawn(move || {
            while !stopped.load(Ordering::Relaxed) {
                let (mut stream, _) = match listener.accept() {
                    Ok(connection) => connection,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(5));
                        continue;
                    }
                    Err(error) => panic!("{error}"),
                };
                // Windows can inherit the listener's nonblocking mode.
                stream.set_nonblocking(false).unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut bytes = Vec::new();
                let mut byte = [0];
                while !bytes.ends_with(b"\r\n\r\n") {
                    stream.read_exact(&mut byte).unwrap();
                    bytes.push(byte[0]);
                }
                let request = String::from_utf8(bytes).unwrap();
                received.lock().unwrap().push(request.clone());
                let _ = stream.write_all(reply(&request).as_bytes());
            }
        });
        Self {
            url,
            requests,
            stop,
            worker: Some(worker),
        }
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Err(error) = self.worker.take().unwrap().join() {
            if !thread::panicking() {
                std::panic::resume_unwind(error);
            }
        }
    }
}

fn ok(body: &str) -> String {
    format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/x-ns-proxy-autoconfig\r\nConnection: close\r\n\r\n{body}", body.len())
}

fn client(settings: Settings, env: Environment) -> reqwest::Client {
    with_settings(reqwest::Client::builder(), settings, env)
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap()
}

fn pac_test_lock() -> std::sync::MutexGuard<'static, ()> {
    // Native tests share the deliberately bounded process-wide PAC worker.
    // Serialize these fixtures; queue saturation has its own isolated test.
    static LOCK: Mutex<()> = Mutex::new(());
    LOCK.lock().unwrap_or_else(|error| error.into_inner())
}

#[test]
fn windows_proxy_formats_select_the_destination_protocol() {
    for (value, scheme, expected) in [
        ("127.0.0.1:7890", "https", "http://127.0.0.1:7890"),
        (
            "http=127.0.0.1:7890;https=127.0.0.1:10809",
            "https",
            "http://127.0.0.1:10809",
        ),
        (
            "HTTPS=https://proxy.example:8443 http=127.0.0.1:7890",
            "http",
            "http://127.0.0.1:7890",
        ),
        (
            "https=127.0.0.1:10809;fallback:80",
            "http",
            "http://fallback:80",
        ),
        ("socks=127.0.0.1:1080", "https", "socks4://127.0.0.1:1080"),
        (
            "socks5h://127.0.0.1:1080",
            "https",
            "socks5h://127.0.0.1:1080",
        ),
        (
            "http://user:pass=word@proxy.example:80",
            "https",
            "http://user:pass=word@proxy.example:80",
        ),
    ] {
        assert_eq!(proxy_for_scheme(value, scheme).as_deref(), Some(expected));
    }
    assert!(proxy_for_scheme("http=127.0.0.1:7890", "https").is_none());
    assert!(proxy_for_scheme("", "https").is_none());
}

#[test]
fn windows_bypass_patterns_preserve_direct_routes() {
    let list = "<local>;*.internal.example;192.168.*;https://secure.example:443";
    for address in [
        "http://intranet/",
        "https://a.internal.example/",
        "http://192.168.1.9/",
        "https://secure.example/",
    ] {
        assert!(bypasses(&Url::parse(address).unwrap(), list));
    }
    for address in [
        "https://github.com/",
        "https://notinternal.example/",
        "http://secure.example/",
        "https://secure.example:8443/",
    ] {
        assert!(!bypasses(&Url::parse(address).unwrap(), list));
    }
}

#[test]
fn a_stalled_native_lookup_is_bounded_and_does_not_queue_unlimited_retries() {
    let (sender, receiver) = mpsc::sync_channel::<PacRequest>(1);
    let url = Url::parse("https://github.com/").unwrap();
    let start = std::time::Instant::now();
    assert!(query_pac(
        &sender,
        &url,
        &Settings::default(),
        0,
        Duration::from_millis(20)
    )
    .is_none());
    assert!(start.elapsed() < Duration::from_secs(1));
    // The outstanding lookup occupies the only queue slot. A retry returns
    // immediately instead of starting a second native lookup or waiting again.
    assert!(query_pac(
        &sender,
        &url,
        &Settings::default(),
        0,
        Duration::from_secs(3)
    )
    .is_none());
    assert!(start.elapsed() < Duration::from_secs(1));
    let _ = receiver.recv().unwrap();
}

#[tokio::test]
async fn a_system_proxy_can_reach_a_hostname_unavailable_to_direct_dns() {
    let proxy = Server::new(|_| ok("manifest"));
    let http = client(
        Settings {
            server: format!("http={};https={}", proxy.url, proxy.url),
            ..Default::default()
        },
        Environment::default(),
    );
    let body = http
        .get("http://metadata.invalid/latest.json")
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    assert_eq!(body, "manifest");
    assert!(
        proxy.requests.lock().unwrap()[0].starts_with("GET http://metadata.invalid/latest.json ")
    );
}

#[tokio::test]
async fn https_connect_uses_the_system_proxy_without_resolving_the_origin_directly() {
    let proxy = Server::new(|_| {
        "HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into()
    });
    let http = client(
        Settings {
            server: format!("https={}", proxy.url),
            ..Default::default()
        },
        Environment::default(),
    );
    assert!(http
        .get("https://metadata.invalid/latest.json")
        .send()
        .await
        .is_err());
    assert!(proxy.requests.lock().unwrap()[0].starts_with("CONNECT metadata.invalid:443 "));
}

#[tokio::test]
async fn explicit_environment_proxy_and_no_proxy_keep_their_precedence() {
    let proxy = Server::new(|_| ok("environment"));
    let direct = Server::new(|_| ok("direct"));
    let http = client(
        Settings {
            server: "127.0.0.1:1".into(),
            ..Default::default()
        },
        Environment {
            http: proxy.url.clone(),
            no: "127.0.0.1".into(),
            ..Default::default()
        },
    );
    assert_eq!(
        http.get("http://metadata.invalid/latest.json")
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap(),
        "environment"
    );
    assert_eq!(
        http.get(&direct.url)
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap(),
        "direct"
    );
    assert_eq!(proxy.requests.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn native_pac_resolves_release_redirects_and_preserves_direct() {
    let _guard = pac_test_lock();
    let package = Server::new(|_| ok("package"));
    let metadata = Server::new(|_| {
        "HTTP/1.1 302 Found\r\nLocation: http://assets.invalid/package\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into()
    });
    let script = format!("function FindProxyForURL(url, host) {{ if (host === 'metadata.invalid') return 'PROXY {}'; if (host === 'assets.invalid') return 'PROXY {}'; return 'DIRECT'; }}", metadata.url.trim_start_matches("http://").trim_end_matches('/'), package.url.trim_start_matches("http://").trim_end_matches('/'));
    let pac = Server::new(move |_| ok(&script));
    let http = client(
        Settings {
            pac: format!("{}proxy.pac", pac.url),
            server: "127.0.0.1:1".into(),
            ..Default::default()
        },
        Environment::default(),
    );
    assert_eq!(
        http.get("http://metadata.invalid/latest.json")
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap(),
        "package"
    );
    let direct = Server::new(|_| ok("direct"));
    assert_eq!(
        http.get(&direct.url)
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap(),
        "direct"
    );
    assert_eq!(metadata.requests.lock().unwrap().len(), 1);
    assert!(package.requests.lock().unwrap()[0].starts_with("GET http://assets.invalid/package "));
    assert!(!pac.requests.lock().unwrap().is_empty());
}

#[tokio::test]
async fn a_broken_pac_can_fall_back_to_the_configured_static_proxy() {
    let _guard = pac_test_lock();
    let proxy = Server::new(|_| ok("fallback"));
    let pac = Server::new(|_| ok("this is not a PAC script"));
    let http = client(
        Settings {
            server: proxy.url.clone(),
            pac: format!("{}proxy.pac", pac.url),
            ..Default::default()
        },
        Environment::default(),
    );
    assert_eq!(
        http.get("http://metadata.invalid/latest.json")
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap(),
        "fallback"
    );
}

#[tokio::test]
async fn a_new_client_uses_the_changed_system_pac_configuration() {
    let _guard = pac_test_lock();
    let first = Server::new(|_| ok("first"));
    let second = Server::new(|_| ok("second"));
    let pac = Server::new(move |_| {
        ok(&format!(
            "function FindProxyForURL(url, host) {{ return 'PROXY {}'; }}",
            first
                .url
                .trim_start_matches("http://")
                .trim_end_matches('/')
        ))
    });
    let settings = Settings {
        pac: format!("{}proxy.pac", pac.url),
        ..Default::default()
    };
    let http = client(settings.clone(), Environment::default());
    assert_eq!(
        http.get("http://metadata.invalid/latest.json")
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap(),
        "first"
    );
    let next_pac = Server::new(move |_| {
        ok(&format!(
            "function FindProxyForURL(url, host) {{ return 'PROXY {}'; }}",
            second
                .url
                .trim_start_matches("http://")
                .trim_end_matches('/')
        ))
    });
    let retry = client(
        Settings {
            pac: format!("{}proxy.pac", next_pac.url),
            ..settings
        },
        Environment::default(),
    );
    assert_eq!(
        retry
            .get("http://metadata.invalid/latest.json")
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap(),
        "second"
    );
    assert_eq!(pac.requests.lock().unwrap().len(), 1);
    assert_eq!(next_pac.requests.lock().unwrap().len(), 1);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 1)]
async fn native_pac_lookup_does_not_starve_a_single_worker_runtime() {
    let _guard = pac_test_lock();
    let proxy = Server::new(|_| ok("package"));
    let script = format!(
        "function FindProxyForURL(url, host) {{ return 'PROXY {}'; }}",
        proxy
            .url
            .trim_start_matches("http://")
            .trim_end_matches('/')
    );
    let pac = Server::new(move |_| {
        thread::sleep(Duration::from_millis(300));
        ok(&script)
    });
    let http = client(
        Settings {
            pac: format!("{}proxy.pac", pac.url),
            ..Default::default()
        },
        Environment::default(),
    );
    let transfer = tokio::spawn(async move {
        http.get("http://metadata.invalid/latest.json")
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap()
    });
    let start = std::time::Instant::now();
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert!(start.elapsed() < Duration::from_millis(250));
    assert_eq!(transfer.await.unwrap(), "package");
}
