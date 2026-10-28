//! Bounded local performance logs. Only fixed labels, durations and result categories are accepted.
use std::{
    fs,
    io::{self, BufRead, Read, Write},
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const FILE_BYTES: u64 = 1024 * 1024;
const FILE_COUNT: usize = 10;
const RETENTION: Duration = Duration::from_secs(7 * 24 * 60 * 60);
static LOCK: Mutex<()> = Mutex::new(());
static STARTED: OnceLock<()> = OnceLock::new();

#[derive(Default)]
struct Trace {
    id: u64,
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
    static NEXT: AtomicU64 = AtomicU64::new(1);
    let trace = Arc::new(Trace {
        id: NEXT.fetch_add(1, Ordering::Relaxed),
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
    for index in 0..FILE_COUNT {
        let path = dir.join(format!("performance-{index}.jsonl"));
        if let Ok(meta) = fs::metadata(&path) {
            if first_record_time(&path)
                .or_else(|| meta.modified().ok())
                .and_then(|at| now.duration_since(at).ok())
                .is_some_and(|age| age >= RETENTION)
            {
                fs::remove_file(path)?;
            }
        }
    }
    Ok(())
}

fn first_record_time(path: &Path) -> Option<SystemTime> {
    let input = fs::File::open(path).ok()?.take(1024);
    let mut line = String::new();
    io::BufReader::new(input).read_line(&mut line).ok()?;
    let data: serde_json::Value = serde_json::from_str(&line).ok()?;
    UNIX_EPOCH.checked_add(Duration::from_millis(data["at_ms"].as_u64()?))
}

fn append(dir: &Path, line: &[u8]) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    prune(dir, SystemTime::now())?;
    let active = dir.join("performance-0.jsonl");
    if fs::metadata(&active).map_or(0, |m| m.len()) + line.len() as u64 > FILE_BYTES {
        let oldest = dir.join(format!("performance-{}.jsonl", FILE_COUNT - 1));
        if oldest.exists() {
            fs::remove_file(oldest)?;
        }
        for index in (0..FILE_COUNT - 1).rev() {
            let source = dir.join(format!("performance-{index}.jsonl"));
            if source.exists() {
                fs::rename(source, dir.join(format!("performance-{}.jsonl", index + 1)))?;
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
    init();
    let value = event(operation, started, outcome, reused);
    let Ok(mut line) = serde_json::to_vec(&value) else {
        return;
    };
    line.push(b'\n');
    let _lock = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(dir) = directory() {
        let _ = append(&dir, &line);
    }
}

fn event(operation: &'static str, started: Instant, outcome: &'static str, reused: bool) -> serde_json::Value {
    let mut value = serde_json::json!({"at_ms": crate::sync::now_ms(), "operation": operation,
        "duration_ms": started.elapsed().as_millis() as u64, "outcome": outcome, "reused": reused});
    let _ = TRACE.try_with(|trace| {
        value["request_id"] = format!("{}-{}", std::process::id(), trace.id).into();
        if operation == "workflow_discovery" {
            value["tool_calls"] = trace.tools.load(Ordering::Relaxed).into();
            value["handshakes"] = trace.handshakes.load(Ordering::Relaxed).into();
        }
    });
    value
}

#[cfg(test)]
mod tests {
    use super::*;

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
        for _ in 0..FILE_COUNT + 3 {
            append(&dir, &line).unwrap();
        }
        let logs: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| e.path().extension().is_some_and(|x| x == "jsonl"))
            .collect();
        assert_eq!(logs.len(), FILE_COUNT);
        assert_eq!(
            logs.iter()
                .map(|e| e.metadata().unwrap().len())
                .sum::<u64>(),
            FILE_BYTES * FILE_COUNT as u64
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
                "{{\"at_ms\":{old}}}\n{{\"at_ms\":{}}}\n",
                crate::sync::now_ms()
            ),
        )
        .unwrap();
        prune(&dir, SystemTime::now()).unwrap();
        assert!(!dir.join("performance-0.jsonl").exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
