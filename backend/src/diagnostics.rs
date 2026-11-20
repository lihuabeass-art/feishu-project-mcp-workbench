//! Bounded local diagnostics. Performance events use fixed labels and result categories;
//! catalog failures additionally retain a redacted, bounded backend error for diagnosis.
use std::{
    fs,
    io::{self, BufRead, Read, Write},
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const FILE_BYTES: u64 = 1024 * 1024;
const FILE_COUNT: usize = 10;
const RETENTION: Duration = Duration::from_secs(7 * 24 * 60 * 60);
static LOCK: Mutex<()> = Mutex::new(());
static STARTED: OnceLock<()> = OnceLock::new();
static NEXT_TRACE: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
struct Trace {
    id: u64,
    schedule: bool,
    partial: AtomicBool,
    tools: AtomicU64,
    handshakes: AtomicU64,
}
tokio::task_local! { static TRACE: Arc<Trace>; }

/// 已发请求独立存活时，继续归属发起它的流程诊断上下文。
pub(crate) fn spawn<F>(future: F) -> tokio::task::JoinHandle<F::Output>
where
    F: std::future::Future + Send + 'static,
    F::Output: Send + 'static,
{
    let trace = TRACE.try_with(Arc::clone).ok();
    tokio::spawn(async move {
        match trace {
            Some(trace) => TRACE.scope(trace, future).await,
            None => future.await,
        }
    })
}

pub(crate) async fn workflow<T>(
    future: impl std::future::Future<Output = Result<T, crate::BackendError>>,
) -> Result<T, crate::BackendError> {
    let trace = Arc::new(Trace {
        id: NEXT_TRACE.fetch_add(1, Ordering::Relaxed),
        ..Default::default()
    });
    TRACE
        .scope(trace, async {
            let started = Instant::now();
            let result = future.await;
            record(
                "workflow_discovery",
                started,
                result.as_ref().map_or_else(|e| e.kind().as_str(), |_| "ok"),
                false,
            );
            result
        })
        .await
}

/// 排期读取与内部工具共享编号，开始记录可定位尚未结束的读取。
pub(crate) fn schedule_read<T>(
    work: impl FnOnce() -> Result<T, crate::BackendError>,
) -> Result<T, crate::BackendError> {
    // 全员入口包含本人读取和团队补读，内部步骤继续使用同一整轮编号。
    if TRACE.try_with(|trace| trace.schedule).unwrap_or(false) {
        return work();
    }
    let trace = Arc::new(Trace { id: NEXT_TRACE.fetch_add(1, Ordering::Relaxed), schedule: true, ..Default::default() });
    TRACE.sync_scope(trace, || {
        let started = Instant::now();
        record("schedule_read", started, "started", false);
        let result = work();
        record("schedule_read", started, schedule_outcome(&result), false);
        result
    })
}

fn schedule_outcome<T>(result: &Result<T, crate::BackendError>) -> &'static str {
    result.as_ref().map_or_else(|error| error.kind().as_str(), |_| {
        if TRACE.try_with(|trace| trace.partial.load(Ordering::Relaxed)).unwrap_or(false) { "partial" } else { "ok" }
    })
}

pub(crate) fn schedule_stage(stage: &'static str) {
    record(stage, Instant::now(), "started", false);
}

pub(crate) fn schedule_result(targets: usize, failed_items: usize, complete: bool) {
    if !complete {
        let _ = TRACE.try_with(|trace| trace.partial.store(true, Ordering::Relaxed));
    }
    let mut value = event("schedule_result", Instant::now(), if complete { "ok" } else { "partial" }, false);
    value["targets"] = targets.into();
    value["failed_items"] = failed_items.into();
    write_event("performance", &value);
}

pub(crate) fn tool_started() {
    let _ = TRACE.try_with(|t| t.tools.fetch_add(1, Ordering::Relaxed));
}
pub(crate) fn handshake_started() {
    let _ = TRACE.try_with(|t| t.handshakes.fetch_add(1, Ordering::Relaxed));
}

pub(crate) fn init() {
    STARTED.get_or_init(|| {
        let _ = maintain();
        std::thread::Builder::new()
            .name("fstodo-log-cleanup".into())
            .spawn(|| loop {
                std::thread::sleep(Duration::from_secs(60 * 60));
                let _ = maintain();
            })
            .ok();
    });
}

fn directory() -> Option<std::path::PathBuf> {
    crate::paths::default_db_path()
        .ok()?
        .parent()
        .map(|p| p.join("logs"))
}

fn maintain() -> io::Result<()> {
    let _lock = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(dir) = directory() {
        prune(&dir, SystemTime::now())?;
    }
    Ok(())
}

fn prune(dir: &Path, now: SystemTime) -> io::Result<()> {
    // Touch only this logger's fixed filenames; leave unrelated files alone.
    let mut failed = None;
    for prefix in ["performance", "catalog"] {
        for index in 0..FILE_COUNT {
            let path = dir.join(format!("{prefix}-{index}.jsonl"));
            if let Ok(meta) = fs::symlink_metadata(&path) {
                if meta.is_file() && first_record_time(&path)
                    .or_else(|| meta.modified().ok())
                    .and_then(|at| now.duration_since(at).ok())
                    .is_some_and(|age| age >= RETENTION)
                {
                    if let Err(error) = fs::remove_file(path) {
                        if error.kind() != io::ErrorKind::NotFound {
                            failed = Some(error);
                        }
                    }
                }
            }
        }
    }
    failed.map_or(Ok(()), Err)
}

fn first_record_time(path: &Path) -> Option<SystemTime> {
    // A redacted catalog error may contain 4,096 characters before JSON escaping.
    let input = fs::File::open(path).ok()?.take(32 * 1024);
    let mut line = String::new();
    io::BufReader::new(input).read_line(&mut line).ok()?;
    let data: serde_json::Value = serde_json::from_str(&line).ok()?;
    UNIX_EPOCH.checked_add(Duration::from_millis(data["at_ms"].as_u64()?))
}

fn append(dir: &Path, prefix: &str, line: &[u8]) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    let active = dir.join(format!("{prefix}-0.jsonl"));
    if fs::metadata(&active).map_or(0, |m| m.len()) + line.len() as u64 > FILE_BYTES {
        let oldest = dir.join(format!("{prefix}-{}.jsonl", FILE_COUNT - 1));
        if oldest.exists() {
            fs::remove_file(oldest)?;
        }
        for index in (0..FILE_COUNT - 1).rev() {
            let source = dir.join(format!("{prefix}-{index}.jsonl"));
            if source.exists() {
                fs::rename(source, dir.join(format!("{prefix}-{}.jsonl", index + 1)))?;
            }
        }
    }
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(active)?
        .write_all(line)
}

pub(crate) fn record(
    operation: &'static str,
    started: Instant,
    outcome: &'static str,
    reused: bool,
) {
    write_event("performance", &event(operation, started, outcome, reused));
}

pub(crate) fn record_catalog_failure(error: &crate::BackendError, secret: Option<&str>) {
    write_event("catalog", &catalog_failure_event(error, secret));
}

fn catalog_failure_event(error: &crate::BackendError, secret: Option<&str>) -> serde_json::Value {
    let mut value = event("workspace_catalog", Instant::now(), error.kind().as_str(), false);
    value["error_message"] = error.safe_message(secret).chars().take(4096).collect::<String>().into();
    value
}

fn write_event(prefix: &'static str, value: &serde_json::Value) {
    init();
    let Ok(mut line) = serde_json::to_vec(value) else {
        return;
    };
    line.push(b'\n');
    let _lock = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(dir) = directory() {
        let _ = append(&dir, prefix, &line);
    }
}

fn event(operation: &'static str, started: Instant, outcome: &'static str, reused: bool) -> serde_json::Value {
    let mut value = serde_json::json!({"at_ms": crate::sync::now_ms(), "operation": operation,
        "duration_ms": started.elapsed().as_millis() as u64, "outcome": outcome, "reused": reused});
    let _ = TRACE.try_with(|trace| {
        value["request_id"] = format!("{}-{}", std::process::id(), trace.id).into();
        if operation == "workflow_discovery" || operation == "schedule_read" {
            value["tool_calls"] = trace.tools.load(Ordering::Relaxed).into();
            value["handshakes"] = trace.handshakes.load(Ordering::Relaxed).into();
        }
    });
    value
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schedule_partial_result_reaches_round_summary_without_leaking_to_next_read() {
        let outcome = schedule_read(|| {
            schedule_result(1, 1, false);
            assert_eq!(schedule_outcome(&Err::<(), _>(crate::BackendError::validation("fixture"))), "validation");
            Ok(schedule_outcome(&Ok(())))
        }).unwrap();
        assert_eq!(outcome, "partial");
        assert!(TRACE.try_with(|_| ()).is_err());
        assert_eq!(schedule_read(|| Ok(schedule_outcome(&Ok(())))).unwrap(), "ok");
    }

    #[test]
    fn schedule_trace_survives_sync_entry_runtime_and_detached_tool() {
        let mut outer_id = serde_json::Value::Null;
        let (tool, summary) = schedule_read(|| {
            outer_id = event("schedule_read", Instant::now(), "started", false)["request_id"].clone();
            schedule_read(|| crate::remote::runtime()?.block_on(async {
            let tool = spawn(async {
                tool_started();
                event("get_node_detail", Instant::now(), "ok", false)
            }).await.unwrap();
            Ok((tool, event("schedule_read", Instant::now(), "ok", false)))
            }))
        }).unwrap();
        assert!(summary.get("request_id").is_some());
        assert_eq!(tool["request_id"], summary["request_id"]);
        assert_eq!(summary["request_id"], outer_id);
        assert_eq!(summary["tool_calls"], 1);
    }

    #[tokio::test]
    async fn schedule_trace_links_stages_tools_and_final_counts_without_business_data() {
        let trace = Arc::new(Trace { id: 73, ..Default::default() });
        let (stage, tool, summary) = TRACE.scope(trace, async {
            let stage = event("schedule_nodes", Instant::now(), "started", false);
            let tool = spawn(async {
                tool_started();
                event("get_node_detail", Instant::now(), "ok", false)
            }).await.unwrap();
            (stage, tool, event("schedule_read", Instant::now(), "ok", false))
        }).await;
        assert_eq!(stage["request_id"], tool["request_id"]);
        assert_eq!(stage["request_id"], summary["request_id"]);
        assert_eq!(summary["tool_calls"], 1);
        assert!(summary.get("arguments").is_none());
        assert!(summary.get("targets").is_none());
    }

    #[test]
    fn catalog_failure_diagnostics_preserve_context_but_redact_tokens_and_bound_text() {
        let error = crate::BackendError::Tool {
            tool: "search_by_mql".into(), code: None,
            message: format!("RPCError: search timeout; token=fixture-token; log_id: example-log {}", "x".repeat(5000)),
        };
        let value = catalog_failure_event(&error, Some("fixture-token"));
        assert_eq!(value["operation"], "workspace_catalog");
        assert_eq!(value["outcome"], "tool");
        let message = value["error_message"].as_str().unwrap();
        assert!(message.contains("search_by_mql") && message.contains("example-log"));
        assert!(message.contains("***") && !message.contains("fixture-token"));
        assert_eq!(message.chars().count(), 4096);
    }

    #[tokio::test]
    async fn detached_attempts_keep_workflow_counts_and_request_identity() {
        let trace = Arc::new(Trace { id: 42, ..Default::default() });
        let (attempt, summary) = TRACE.scope(trace, async {
            let attempt = spawn(async {
                handshake_started();
                tool_started();
                event("get_workitem_brief", Instant::now(), "ok", false)
            }).await.unwrap();
            (attempt, event("workflow_discovery", Instant::now(), "ok", false))
        }).await;
        assert_eq!(summary["tool_calls"], 1);
        assert_eq!(summary["handshakes"], 1);
        assert_eq!(attempt["request_id"], format!("{}-42", std::process::id()));
        assert_eq!(attempt["request_id"], summary["request_id"]);
        let unrelated = spawn(async {
            event("get_workitem_brief", Instant::now(), "ok", false)
        }).await.unwrap();
        assert!(unrelated.get("request_id").is_none(), "无流程上下文的请求不能串用旧编号");
    }
    #[test]
    fn logs_rotate_by_size_expire_and_preserve_other_files() {
        let dir = std::env::temp_dir().join(format!(
            "fstodo-logs-{}-{}",
            std::process::id(),
            crate::sync::now_ms()
        ));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("keep.txt"), "keep").unwrap();
        let line = vec![b'x'; FILE_BYTES as usize];
        for prefix in ["performance", "catalog"] {
            for _ in 0..FILE_COUNT + 3 {
                append(&dir, prefix, &line).unwrap();
            }
        }
        let logs: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| e.path().extension().is_some_and(|x| x == "jsonl"))
            .collect();
        assert_eq!(logs.len(), FILE_COUNT * 2);
        assert_eq!(
            logs.iter()
                .map(|e| e.metadata().unwrap().len())
                .sum::<u64>(),
            FILE_BYTES * FILE_COUNT as u64 * 2
        );
        prune(&dir, SystemTime::now() + RETENTION + Duration::from_secs(1)).unwrap();
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn appending_new_records_does_not_extend_old_records_retention() {
        let dir = std::env::temp_dir().join(format!("fstodo-log-age-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let old = crate::sync::now_ms() - RETENTION.as_millis() as i64 - 1000;
        fs::write(
            dir.join("performance-0.jsonl"),
            format!(
                "{{\"at_ms\":{old},\"error_message\":\"{}\"}}\n{{\"at_ms\":{}}}\n",
                "测".repeat(4096),
                crate::sync::now_ms()
            ),
        )
        .unwrap();
        prune(&dir, SystemTime::now()).unwrap();
        assert!(!dir.join("performance-0.jsonl").exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
