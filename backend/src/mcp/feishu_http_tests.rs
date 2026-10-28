//! 真实 HTTP + rmcp 链路回归，不访问远程服务。
use super::*;
use std::{
    io::{Read, Write},
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
    thread,
};

struct Server {
    endpoint: String,
    stop: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
    init: Arc<AtomicUsize>,
    calls: Arc<AtomicUsize>,
    active: Arc<AtomicUsize>,
    peak: Arc<AtomicUsize>,
    initialized_at: Arc<std::sync::Mutex<Vec<std::time::Instant>>>,
    background_gate: Arc<(std::sync::Mutex<bool>, std::sync::Condvar)>,
    background_active: Arc<AtomicUsize>,
    requested: Arc<std::sync::Mutex<Vec<(String, String)>>>,
    checks_completed: Arc<AtomicUsize>,
}

impl Server {
    fn new(mode: &'static str) -> Self {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let stop = Arc::new(AtomicBool::new(false));
        let init = Arc::new(AtomicUsize::new(0));
        let calls = Arc::new(AtomicUsize::new(0));
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let initialized_at = Arc::new(std::sync::Mutex::new(Vec::new()));
        let background_gate = Arc::new((std::sync::Mutex::new(false), std::sync::Condvar::new()));
        let background_active = Arc::new(AtomicUsize::new(0));
        let requested = Arc::new(std::sync::Mutex::new(Vec::new()));
        let checks_completed = Arc::new(AtomicUsize::new(0));
        let worker = {
            let stop = stop.clone();
            let init = init.clone();
            let calls = calls.clone();
            let active = active.clone();
            let peak = peak.clone();
            let times = initialized_at.clone();
            let gate = background_gate.clone();
            let background_active = background_active.clone();
            let requested = requested.clone();
            let checks_completed = checks_completed.clone();
            thread::spawn(move || {
                let mut children = Vec::new();
                while !stop.load(Ordering::SeqCst) {
                    let (mut socket, _) = match listener.accept() {
                        Ok(s) => s,
                        Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(2));
                            continue;
                        }
                        Err(e) => panic!("{e}"),
                    };
                    let init = init.clone();
                    let calls = calls.clone();
                    let active = active.clone();
                    let peak = peak.clone();
                    let times = times.clone();
                    let gate = gate.clone();
                    let background_active = background_active.clone();
                    let requested = requested.clone();
                    let checks_completed = checks_completed.clone();
                    children.push(thread::spawn(move || {
                        socket.set_nonblocking(false).unwrap();
                        socket.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
                        let mut request = Vec::new();
                        let (end, length) = loop {
                            let mut buffer = [0u8; 4096];
                            let count = socket.read(&mut buffer).unwrap_or(0);
                            if count == 0 { return; }
                            request.extend_from_slice(&buffer[..count]);
                            if let Some(end) = request.windows(4).position(|w|w == b"\r\n\r\n") {
                                let headers = String::from_utf8_lossy(&request[..end]);
                                let length = headers.lines().find_map(|l|l.to_lowercase().strip_prefix("content-length: ").and_then(|v|v.parse::<usize>().ok())).unwrap_or(0);
                                if request.len() >= end + 4 + length { break (end, length); }
                            }
                        };
                        let body: Value = serde_json::from_slice(&request[end+4..end+4+length]).unwrap_or(Value::Null);
                        let mut status = "200 OK";
                        let mut result = serde_json::json!({"content":[]});
                        let mut counted = false;
                        match body["method"].as_str() {
                            Some("initialize") => {
                                let attempt = init.fetch_add(1, Ordering::SeqCst);
                                times.lock().unwrap().push(std::time::Instant::now());
                                if mode == "init429" && attempt == 0 { status = "429 Too Many Requests"; }
                                result = serde_json::json!({"protocolVersion":body["params"]["protocolVersion"],"capabilities":{},"serverInfo":{"name":"wire","version":"1"}});
                            }
                            Some("tools/call") => {
                                requested.lock().unwrap().push((body["params"]["name"].as_str().unwrap().to_string(),
                                    body["params"]["arguments"]["work_item_id"].as_str().unwrap_or("").to_string()));
                                let attempt = calls.fetch_add(1, Ordering::SeqCst);
                                counted = true;
                                peak.fetch_max(active.fetch_add(1, Ordering::SeqCst)+1, Ordering::SeqCst);
                                if mode == "expired" { status = "404 Not Found"; }
                                else if mode == "tool429" && attempt == 0 { status = "429 Too Many Requests"; }
                                else if mode == "slow" { thread::sleep(Duration::from_millis(800)); }
                                else if mode == "tool429" { thread::sleep(Duration::from_millis(200)); }
                                if mode == "mixed" {
                                    let tool = body["params"]["name"].as_str().unwrap();
                                    let id = body["params"]["arguments"]["work_item_id"].as_str().unwrap_or("");
                                    if tool == "get_workitem_brief" && id.starts_with("bg-") {
                                        background_active.fetch_add(1, Ordering::SeqCst);
                                        let (lock, changed) = &*gate;
                                        let mut released = lock.lock().unwrap();
                                        while !*released { released = changed.wait(released).unwrap(); }
                                        background_active.fetch_sub(1, Ordering::SeqCst);
                                    }
                                    let data = match tool {
                                        "list_todo" => serde_json::json!({"list":(0..40).map(|n|serde_json::json!({
                                            "project_key":"p","work_item_info":{"work_item_type_key":"story","work_item_id":format!("bg-{n}")}
                                        })).collect::<Vec<_>>(),"total":40}),
                                        "get_workitem_brief" => serde_json::json!({"work_item_attribute":{
                                            "owned_project":{"key":"p"},"work_item_type":{"key":"story"},"work_item_id":id,
                                            "work_item_name":id,"work_item_mod":"节点流"},"work_item_fields":[],"pagination":{"has_more":false}}),
                                        "get_node_detail" => serde_json::json!({"list":[
                                            {"basic":{"node_key":"a","status":"doing"}},
                                            {"basic":{"node_key":"b","status":"doing"}},
                                            {"basic":{"node_key":"c","status":"doing"}}
                                        ],"pagination":{"has_more":false}}),
                                        "get_transition_required" => serde_json::json!({}),
                                        _ => serde_json::json!({"list":[],"pagination":{"has_more":false}}),
                                    };
                                    result = serde_json::json!({"content":[],"structuredContent":data});
                                }
                            }
                            _ => { status = "202 Accepted"; }
                        }
                        let json = serde_json::json!({"jsonrpc":"2.0","id":body["id"],"result":result}).to_string();
                        let _ = write!(socket, "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nMcp-Session-Id: wire\r\nRetry-After: 1\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{json}", json.len());
                        if body["params"]["name"] == "list_todo" { checks_completed.fetch_add(1, Ordering::SeqCst); }
                        if counted { active.fetch_sub(1, Ordering::SeqCst); }
                    }));
                }
                for child in children {
                    child.join().unwrap();
                }
            })
        };
        Self {
            endpoint,
            stop,
            thread: Some(worker),
            init,
            calls,
            active,
            peak,
            initialized_at,
            background_gate,
            background_active,
            requested,
            checks_completed,
        }
    }

    fn client(&self) -> FeishuMcp {
        let mut client = FeishuMcp::new(&self.endpoint, SecretToken::new("offline-test"));
        client.scheduler = Arc::new(Scheduler::default());
        client
    }

    fn release_background(&self) {
        let (lock, changed) = &*self.background_gate;
        *lock.lock().unwrap() = true;
        changed.notify_all();
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.release_background();
        self.stop.store(true, Ordering::SeqCst);
        self.thread.take().unwrap().join().unwrap();
    }
}

#[path = "scheduler_mixed_tests.rs"]
mod mixed_tests;

#[tokio::test]
async fn sdk_posts_exceed_sixteen_and_cancelled_calls_keep_budget_until_completion() {
    let server = Server::new("slow");
    let mut client = server.client();
    client.scheduler.test_window(32);
    client.describe_reusing().await.unwrap();
    let tasks: Vec<_> = (0..24)
        .map(|_| {
            let client = client.clone();
            tokio::spawn(async move { client.call_tool("get_workitem_brief", &Map::new()).await })
        })
        .collect();
    tokio::time::timeout(Duration::from_secs(5), async {
        while server.calls.load(Ordering::SeqCst) < 24 {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    assert!(server.peak.load(Ordering::SeqCst) > 16);
    for task in tasks {
        task.abort();
        let _ = task.await;
    }
    assert!(server.active.load(Ordering::SeqCst) > 0);
    assert!(
        client.scheduler.active() > 0,
        "已发请求在调用方取消后仍应占用调度名额"
    );
    tokio::time::timeout(Duration::from_secs(5), async {
        while client.scheduler.active() > 0 {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    client.close().await;
}

#[tokio::test]
async fn http_throttle_preserves_shared_session_and_waits_before_retry() {
    let server = Server::new("tool429");
    let mut client = server.client();
    let started = std::time::Instant::now();
    let args = Map::new();
    let (a, b) = tokio::join!(
        client.call_tool("get_workitem_brief", &args),
        client.call_tool("get_node_detail", &args)
    );
    assert!(a.is_ok(), "{a:?}");
    assert!(b.is_ok(), "{b:?}");
    assert_eq!(server.init.load(Ordering::SeqCst), 1);
    assert_eq!(server.calls.load(Ordering::SeqCst), 3);
    assert!(started.elapsed() >= Duration::from_secs(1));
    client.close().await;
}

#[tokio::test]
async fn initialization_throttle_cools_all_waiters_then_read_recovers() {
    let server = Server::new("init429");
    let mut client = server.client();
    let args = Map::new();
    let (a, b, c) = tokio::join!(
        client.call_tool("get_workitem_brief", &args),
        client.call_tool("get_node_detail", &args),
        client.describe_reusing()
    );
    assert!(a.is_ok(), "{a:?}");
    assert!(b.is_ok(), "{b:?}");
    assert!(c.is_ok(), "{c:?}");
    let times = server.initialized_at.lock().unwrap();
    assert_eq!(times.len(), 2);
    assert!(times[1].duration_since(times[0]) >= Duration::from_secs(1));
    drop(times);
    client.close().await;
}

#[tokio::test]
async fn expired_sessions_do_not_replay_writes_or_unknown_tools() {
    for tool in ["update_field", "unknown_tool"] {
        let server = Server::new("expired");
        let mut client = server.client();
        assert!(client.call_tool(tool, &Map::new()).await.is_err());
        assert_eq!(server.init.load(Ordering::SeqCst), 1);
        assert_eq!(server.calls.load(Ordering::SeqCst), 1);
        client.close().await;
    }
}

#[tokio::test]
async fn lifecycle_lock_contention_does_not_requeue_a_live_peer() {
    let server = Server::new("normal");
    let mut client = server.client();
    client.describe_reusing().await.unwrap();
    client.scheduler.test_window(1);
    let held = client.scheduler.acquire().await;
    let request = tokio::spawn({
        let client = client.clone();
        async move { client.call_tool("get_workitem_brief", &Map::new()).await }
    });
    tokio::time::timeout(Duration::from_secs(3), async {
        while client.scheduler.queued() == 0 {
            tokio::task::yield_now().await;
        }
    }).await.unwrap();
    // 取得 Peer 后发生的正常锁争用不能被当成代次失效、导致丢弃名额重排。
    let guard = client.session.lock().await;
    drop(held);
    tokio::time::timeout(Duration::from_secs(3), request)
        .await.expect("有效 Peer 在生命周期锁暂被占用时仍应发送")
        .unwrap().unwrap();
    assert_eq!(server.init.load(Ordering::SeqCst), 1);
    assert_eq!(server.calls.load(Ordering::SeqCst), 1);
    drop(guard);
    client.close().await;
}

#[tokio::test]
async fn queued_old_peer_yields_its_slot_to_a_waiting_handshake() {
    let server = Server::new("normal");
    let mut client = server.client();
    client.describe_reusing().await.unwrap();
    client.scheduler.test_window(1);
    let held = client.scheduler.acquire().await;
    let queued = tokio::spawn({
        let client = client.clone();
        async move { client.call_tool("get_workitem_brief", &Map::new()).await }
    });
    tokio::time::timeout(Duration::from_secs(5), async {
        while client.scheduler.queued() < 1 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    client.invalidate(None).await;
    let handshake = tokio::spawn({
        let client = client.clone();
        async move { client.describe_reusing().await }
    });
    tokio::time::timeout(Duration::from_secs(5), async {
        while client.scheduler.queued() < 2 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    drop(held);
    tokio::time::timeout(Duration::from_secs(5), async {
        assert!(queued.await.unwrap().is_ok());
        assert!(handshake.await.unwrap().is_ok());
    })
    .await
    .expect("单名额下旧调用应让出名额，不能与握手互等");
    assert_eq!(server.init.load(Ordering::SeqCst), 2);
    client.close().await;
}
