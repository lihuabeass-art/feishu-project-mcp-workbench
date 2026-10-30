use hyper_util::client::proxy::matcher::Matcher;
use reqwest::{ClientBuilder, Proxy, Url};
use std::{
    collections::HashMap,
    ffi::c_void,
    ptr,
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Mutex, OnceLock,
    },
    thread,
    time::Duration,
};
use windows_sys::Win32::{Foundation::GlobalFree, Networking::WinHttp::*};

#[derive(Clone, Default)]
struct Settings {
    server: String,
    bypass: String,
    pac: String,
    auto_detect: bool,
}

// WinHTTP owns the returned strings; copy and release every field even when a
// configuration has both a static proxy and an automatic configuration URL.
unsafe fn take_string(value: *mut u16) -> String {
    if value.is_null() {
        return String::new();
    }
    let mut len = 0;
    while *value.add(len) != 0 {
        len += 1;
    }
    let result = String::from_utf16_lossy(std::slice::from_raw_parts(value, len));
    GlobalFree(value.cast());
    result
}

impl Settings {
    fn current() -> Self {
        unsafe {
            let mut config = WINHTTP_CURRENT_USER_IE_PROXY_CONFIG::default();
            let ok = WinHttpGetIEProxyConfigForCurrentUser(&mut config) != 0;
            let settings = Self {
                server: take_string(config.lpszProxy),
                bypass: take_string(config.lpszProxyBypass),
                pac: take_string(config.lpszAutoConfigUrl),
                auto_detect: config.fAutoDetect != 0,
            };
            if ok {
                settings
            } else {
                Self::default()
            }
        }
    }
}

#[derive(Default)]
struct Environment {
    http: String,
    https: String,
    all: String,
    no: String,
}

impl Environment {
    fn current() -> Self {
        fn read(names: &[&str]) -> String {
            names
                .iter()
                .find_map(|name| std::env::var(name).ok().filter(|v| !v.is_empty()))
                .unwrap_or_default()
        }
        Self {
            http: if std::env::var_os("REQUEST_METHOD").is_some() {
                read(&["http_proxy"])
            } else {
                read(&["HTTP_PROXY", "http_proxy"])
            },
            https: read(&["HTTPS_PROXY", "https_proxy"]),
            all: read(&["ALL_PROXY", "all_proxy"]),
            no: read(&["NO_PROXY", "no_proxy"]),
        }
    }

    fn proxy(&self, url: &Url) -> Option<String> {
        let value = if url.scheme() == "https" {
            &self.https
        } else {
            &self.http
        };
        let value = if value.is_empty() { &self.all } else { value };
        (!value.is_empty()).then(|| value.clone())
    }
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}

// WinHTTP handles support use across threads. The resolver's mutex serializes
// access; this owner closes the opaque handle when the client is dropped.
struct Session(usize);

impl Session {
    fn new() -> Option<Self> {
        unsafe {
            let agent = wide("FSTODO-Updater");
            let handle = WinHttpOpen(
                agent.as_ptr(),
                WINHTTP_ACCESS_TYPE_NO_PROXY,
                ptr::null(),
                ptr::null(),
                0,
            );
            if handle.is_null() {
                return None;
            }
            WinHttpSetTimeouts(handle, 3_000, 3_000, 3_000, 3_000);
            Some(Self(handle as usize))
        }
    }

    fn resolve(&self, url: &Url, settings: &Settings) -> Option<(String, String)> {
        unsafe {
            let pac = wide(&settings.pac);
            let mut options = WINHTTP_AUTOPROXY_OPTIONS::default();
            // An explicit PAC URL avoids a slow WPAD search on ordinary LANs.
            if !settings.pac.is_empty() {
                options.dwFlags = WINHTTP_AUTOPROXY_CONFIG_URL;
                options.lpszAutoConfigUrl = pac.as_ptr();
            } else {
                options.dwFlags = WINHTTP_AUTOPROXY_AUTO_DETECT;
                options.dwAutoDetectFlags =
                    WINHTTP_AUTO_DETECT_TYPE_DHCP | WINHTTP_AUTO_DETECT_TYPE_DNS_A;
            }
            // The adapter caches per-origin results for this HTTP client;
            // do not inherit another check's service-level route cache.
            options.dwFlags |= WINHTTP_AUTOPROXY_NO_CACHE_CLIENT | WINHTTP_AUTOPROXY_NO_CACHE_SVC;
            let mut info = WINHTTP_PROXY_INFO::default();
            let url = wide(url.as_str());
            let ok =
                WinHttpGetProxyForUrl(self.0 as *mut c_void, url.as_ptr(), &mut options, &mut info)
                    != 0;
            let server = take_string(info.lpszProxy);
            let bypass = take_string(info.lpszProxyBypass);
            if !ok {
                return None;
            }
            // An empty server from a successful resolution means PAC DIRECT.
            Some((
                if info.dwAccessType == WINHTTP_ACCESS_TYPE_NO_PROXY {
                    String::new()
                } else {
                    server
                },
                bypass,
            ))
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        unsafe {
            WinHttpCloseHandle(self.0 as *mut c_void);
        }
    }
}

type Resolution = Option<(String, String)>;

struct PacRequest {
    generation: u64,
    url: Url,
    settings: Settings,
    reply: mpsc::SyncSender<Resolution>,
}

fn pac_worker() -> Option<&'static mpsc::SyncSender<PacRequest>> {
    static WORKER: OnceLock<Option<mpsc::SyncSender<PacRequest>>> = OnceLock::new();
    WORKER
        .get_or_init(|| {
            // WinHTTP may spend up to a minute executing PAC even after network
            // timeouts. One bounded worker prevents retries accumulating OS calls.
            let (sender, receiver) = mpsc::sync_channel::<PacRequest>(1);
            thread::Builder::new()
                .name("fstodo-update-proxy".into())
                .spawn(move || {
                    let mut session: Option<(u64, Session)> = None;
                    while let Ok(request) = receiver.recv() {
                        // Refresh session-local discovery when the HTTP client
                        // changes. WinHTTP still owns its service script cache.
                        if session.as_ref().map(|(generation, _)| *generation)
                            != Some(request.generation)
                        {
                            session = Session::new().map(|session| (request.generation, session));
                        }
                        let result = session.as_ref().and_then(|(_, session)| {
                            session.resolve(&request.url, &request.settings)
                        });
                        let _ = request.reply.send(result);
                    }
                })
                .ok()?;
            Some(sender)
        })
        .as_ref()
}

fn query_pac(
    sender: &mpsc::SyncSender<PacRequest>,
    url: &Url,
    settings: &Settings,
    generation: u64,
    timeout: Duration,
) -> Resolution {
    let (reply, response) = mpsc::sync_channel(1);
    sender
        .try_send(PacRequest {
            generation,
            url: url.clone(),
            settings: settings.clone(),
            reply,
        })
        .ok()?;
    response.recv_timeout(timeout).ok().flatten()
}

struct Resolver {
    generation: u64,
    settings: Settings,
    routes: HashMap<String, Option<String>>,
}

impl Resolver {
    fn new(settings: Settings) -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(1);
        Self {
            generation: NEXT.fetch_add(1, Ordering::Relaxed),
            settings,
            routes: HashMap::new(),
        }
    }

    fn resolve(&mut self, url: &Url) -> Option<String> {
        let origin = url.origin().ascii_serialization();
        if let Some(route) = self.routes.get(&origin) {
            return route.clone();
        }
        let automatic = if self.settings.auto_detect || !self.settings.pac.is_empty() {
            pac_worker().and_then(|worker| {
                query_pac(
                    worker,
                    url,
                    &self.settings,
                    self.generation,
                    Duration::from_secs(3),
                )
            })
        } else {
            None
        };
        // As recommended by WinHTTP, a failed PAC/WPAD lookup can use the
        // user's static proxy. A successful DIRECT result must stay direct.
        let (server, bypass) = automatic
            .as_ref()
            .map(|(server, bypass)| (server.as_str(), bypass.as_str()))
            .unwrap_or((&self.settings.server, &self.settings.bypass));
        let route = if bypasses(url, bypass) {
            None
        } else {
            proxy_for_scheme(server, url.scheme())
        };
        self.routes.insert(origin, route.clone());
        route
    }
}

fn proxy_for_scheme(value: &str, scheme: &str) -> Option<String> {
    let mut default = None;
    let mut matched = None;
    let mut socks = None;
    for entry in value
        .split(|c: char| c == ';' || c.is_whitespace())
        .filter(|v| !v.is_empty())
    {
        if let Some((key, address)) = entry
            .split_once('=')
            .filter(|(key, _)| !key.contains("://"))
        {
            if key.eq_ignore_ascii_case(scheme) && matched.is_none() {
                matched = Some(address);
            } else if key.eq_ignore_ascii_case("socks") && socks.is_none() {
                socks = Some(address);
            }
        } else if default.is_none() {
            default = Some(entry);
        }
    }
    let (address, default_scheme) = matched
        .or(default)
        .map(|v| (v, "http"))
        .or_else(|| socks.map(|v| (v, "socks4")))?;
    if address.contains("://") {
        Some(address.to_owned())
    } else {
        Some(format!("{default_scheme}://{address}"))
    }
}

fn wildcard(pattern: &str, value: &str) -> bool {
    let (mut p, mut v, mut star, mut restart) = (0, 0, None, 0);
    let (pattern, value) = (pattern.as_bytes(), value.as_bytes());
    while v < value.len() {
        if p < pattern.len() && pattern[p] == value[v] {
            p += 1;
            v += 1;
        } else if p < pattern.len() && pattern[p] == b'*' {
            star = Some(p);
            p += 1;
            restart = v;
        } else if let Some(index) = star {
            restart += 1;
            v = restart;
            p = index + 1;
        } else {
            return false;
        }
    }
    while p < pattern.len() && pattern[p] == b'*' {
        p += 1;
    }
    p == pattern.len()
}

fn bypasses(url: &Url, list: &str) -> bool {
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    let authority = format!("{host}:{}", url.port_or_known_default().unwrap_or(0));
    list.split(|c: char| c == ';' || c.is_whitespace())
        .any(|entry| {
            let entry = entry.to_ascii_lowercase();
            if entry == "<local>" {
                return !host.contains('.');
            }
            let pattern = if let Some((scheme, pattern)) = entry.split_once("://") {
                if scheme != url.scheme() {
                    return false;
                }
                pattern
            } else {
                &entry
            };
            !pattern.is_empty() && (wildcard(pattern, &host) || wildcard(pattern, &authority))
        })
}

fn with_settings(builder: ClientBuilder, settings: Settings, env: Environment) -> ClientBuilder {
    // reqwest 0.12's custom proxy ignores NoProxy, so apply the upstream
    // matcher's NO_PROXY semantics before choosing environment/system routes.
    let bypass = Matcher::builder()
        .all("http://127.0.0.1:9")
        .no(env.no.clone())
        .build();
    let resolver = Mutex::new(Resolver::new(settings));
    builder.proxy(Proxy::custom(move |url| {
        let uri = url.as_str().parse().ok()?;
        bypass.intercept(&uri)?;
        env.proxy(url).or_else(|| {
            let resolve = || resolver.lock().ok()?.resolve(url);
            // Proxy callbacks are synchronous. Let Tokio replace this worker
            // while awaiting the bounded OS lookup, so timers and MCP run.
            if tokio::runtime::Handle::try_current().is_ok_and(|handle| {
                handle.runtime_flavor() == tokio::runtime::RuntimeFlavor::MultiThread
            }) {
                tokio::task::block_in_place(resolve)
            } else {
                resolve()
            }
        })
    }))
}

pub(super) fn configure(builder: ClientBuilder) -> ClientBuilder {
    with_settings(builder, Settings::current(), Environment::current())
}

#[cfg(test)]
mod tests;
