//! Process lifetime runtime and authenticated MCP context shared by desktop commands.
use crate::{
    config::Config,
    credentials::Credential,
    detail::ItemDetail,
    error::BackendError,
    mcp::{feishu::FeishuMcp, parse_tool_json, ConnectionInfo, TodoSource, ToolResultPayload},
    model::WorkItemId,
};
use async_trait::async_trait;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};
use tokio::sync::OnceCell;

pub(crate) fn runtime() -> Result<&'static tokio::runtime::Runtime, BackendError> {
    static RUNTIME: OnceLock<Result<tokio::runtime::Runtime, String>> = OnceLock::new();
    RUNTIME
        .get_or_init(|| {
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .thread_name("fstodo-mcp")
                .enable_all()
                .build()
                .map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(|e| BackendError::config(format!("无法启动网络运行时：{e}")))
}

#[derive(PartialEq, Eq)]
struct ContextKey {
    endpoint: String,
    token_hash: [u8; 32],
    db: PathBuf,
    max_pages: u32,
}

impl ContextKey {
    fn new(config: &Config, credential: &Credential) -> Self {
        Self {
            endpoint: config.endpoint.clone(),
            token_hash: Sha256::digest(credential.token().expose().as_bytes()).into(),
            db: config.db_path.clone(),
            max_pages: config.max_pages,
        }
    }
}

type DetailSlot = Arc<OnceCell<(Instant, ItemDetail)>>;
type MetadataSlot = Arc<OnceCell<(Instant, Vec<Value>)>>;

pub(crate) struct Remote {
    key: ContextKey,
    client: Box<dyn TodoSource>,
    details: Mutex<HashMap<(WorkItemId, i64), DetailSlot>>,
    metadata: Mutex<HashMap<(String, String, &'static str), MetadataSlot>>,
}

pub(crate) fn shared(config: &Config, credential: &Credential) -> Arc<Remote> {
    static ACTIVE: Mutex<Option<Arc<Remote>>> = Mutex::new(None);
    let key = ContextKey::new(config, credential);
    #[cfg(test)]
    if let Some(remote) = TEST_REMOTES.lock().unwrap().iter().find(|r| r.key == key) {
        return remote.clone();
    }
    let mut active = ACTIVE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(remote) = active.as_ref().filter(|r| r.key == key) {
        return remote.clone();
    }
    let remote = Arc::new(Remote {
        client: Box::new(LiveClient(FeishuMcp::new(
            config.endpoint.clone(),
            credential.token().clone(),
        ))),
        key,
        details: Mutex::new(HashMap::new()),
        metadata: Mutex::new(HashMap::new()),
    });
    *active = Some(remote.clone());
    remote
}

#[cfg(test)]
static TEST_REMOTES: Mutex<Vec<Arc<Remote>>> = Mutex::new(Vec::new());

#[cfg(test)]
pub(crate) struct TestRemote(Arc<Remote>);
#[cfg(test)]
impl Drop for TestRemote {
    fn drop(&mut self) {
        TEST_REMOTES
            .lock()
            .unwrap()
            .retain(|r| !Arc::ptr_eq(r, &self.0));
    }
}
#[cfg(test)]
pub(crate) fn install_test_client(
    config: &Config,
    credential: &Credential,
    client: Box<dyn TodoSource>,
) -> TestRemote {
    let remote = Arc::new(Remote {
        key: ContextKey::new(config, credential),
        client,
        details: Mutex::new(HashMap::new()),
        metadata: Mutex::new(HashMap::new()),
    });
    TEST_REMOTES.lock().unwrap().push(remote.clone());
    TestRemote(remote)
}

impl Remote {
    pub(crate) async fn detail(
        &self,
        id: &WorkItemId,
        generation: i64,
        fresh: bool,
    ) -> Result<ItemDetail, BackendError> {
        if fresh {
            let detail = crate::detail::fetch(self, id, self.key.max_pages).await?;
            let slot = Arc::new(OnceCell::new());
            let _ = slot.set((Instant::now(), detail.clone()));
            self.details
                .lock()
                .unwrap()
                .insert((id.clone(), generation), slot);
            return Ok(detail);
        }
        let started = Instant::now();
        let slot = {
            let mut slots = self.details.lock().unwrap();
            slots.retain(|_, cell| {
                cell.get().map_or_else(
                    || Arc::strong_count(cell) > 1,
                    |(at, _)| at.elapsed() < Duration::from_secs(1),
                )
            });
            if slots.len() >= 128 {
                slots.retain(|_, cell| cell.get().is_none());
            }
            slots.entry((id.clone(), generation)).or_default().clone()
        };
        let mut fetched = false;
        let result = slot
            .get_or_try_init(|| async {
                fetched = true;
                let detail = crate::detail::fetch(self, id, self.key.max_pages).await?;
                Ok::<_, BackendError>((Instant::now(), detail))
            })
            .await;
        crate::diagnostics::record(
            "detail",
            started,
            result.as_ref().map_or_else(|e| e.kind().as_str(), |_| "ok"),
            !fetched,
        );
        result.map(|(_, detail)| detail.clone())
    }

    pub(crate) async fn metadata(
        &self,
        tool: &'static str,
        project: &str,
        kind: &str,
        fresh: bool,
    ) -> Result<Vec<Value>, BackendError> {
        let fetch = || async {
            if tool == "list_node_field_config" {
                let args = serde_json::json!({"project_key":project,"work_item_type":kind});
                let data = parse_tool_json(
                    tool,
                    &self.call_tool(tool, args.as_object().unwrap()).await?,
                )?;
                data["list"]
                    .as_array()
                    .cloned()
                    .ok_or_else(|| BackendError::parse("节点字段配置", "缺少 list"))
            } else {
                crate::source_query::metadata(self, tool, project, kind, self.key.max_pages).await
            }
        };
        if fresh {
            let values = fetch().await?;
            let slot = Arc::new(OnceCell::new());
            let _ = slot.set((Instant::now(), values.clone()));
            self.metadata
                .lock()
                .unwrap()
                .insert((project.into(), kind.into(), tool), slot);
            return Ok(values);
        }
        let started = Instant::now();
        let slot = {
            let mut slots = self.metadata.lock().unwrap();
            slots.retain(|_, cell| {
                cell.get().map_or_else(
                    || Arc::strong_count(cell) > 1,
                    |(at, _)| at.elapsed() < Duration::from_secs(300),
                )
            });
            if slots.len() >= 32 {
                slots.retain(|_, cell| cell.get().is_none());
            }
            slots
                .entry((project.into(), kind.into(), tool))
                .or_default()
                .clone()
        };
        let mut fetched = false;
        let result = slot
            .get_or_try_init(|| async {
                fetched = true;
                Ok::<_, BackendError>((Instant::now(), fetch().await?))
            })
            .await;
        crate::diagnostics::record(
            "metadata_cache",
            started,
            result.as_ref().map_or_else(|e| e.kind().as_str(), |_| "ok"),
            !fetched,
        );
        result.map(|(_, values)| values.clone())
    }
}

#[async_trait]
impl TodoSource for Remote {
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> {
        self.client.describe().await
    }
    async fn call_tool(
        &self,
        tool: &str,
        args: &Map<String, Value>,
    ) -> Result<ToolResultPayload, BackendError> {
        let writes = crate::mcp::feishu::WRITE_TOOLS.contains(&tool);
        if writes {
            self.details.lock().unwrap().clear();
        }
        let result = self.client.call_tool(tool, args).await;
        if writes {
            self.details.lock().unwrap().clear();
        }
        result
    }
    async fn close(&mut self) {} // The authenticated context owns the connection, not an individual command.
}

struct LiveClient(FeishuMcp);
#[async_trait]
impl TodoSource for LiveClient {
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> {
        self.0.describe_reusing().await
    }
    async fn call_tool(
        &self,
        tool: &str,
        args: &Map<String, Value>,
    ) -> Result<ToolResultPayload, BackendError> {
        self.0.call_tool(tool, args).await
    }
    async fn close(&mut self) {
        self.0.close().await;
    }
}

#[async_trait]
impl TodoSource for Arc<Remote> {
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> {
        self.as_ref().describe().await
    }
    async fn call_tool(
        &self,
        tool: &str,
        args: &Map<String, Value>,
    ) -> Result<ToolResultPayload, BackendError> {
        self.as_ref().call_tool(tool, args).await
    }
    async fn close(&mut self) {}
}

#[cfg(test)]
#[path = "remote_tests.rs"]
mod tests;
