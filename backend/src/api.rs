//! 对外暴露的三个接口：连接自检 / 同步个人待办 / 查询缓存。
//!
//! 全部是**阻塞式函数**：命令行直接调用，将来的界面层也不必处理 async 传播。
//! 网络任务共用进程内长驻运行时和认证会话；桌面 IPC 返回后连接仍然可用。
//!
//! 接口对失败的处理原则（任务书二.4）：
//!
//! - 返回 [`BackendError`] 的具体变体，调用方能区分连接/鉴权/工具/解析；
//! - 同步失败时缓存保持不动，且不会写入 `success` 运行记录（见 [`crate::sync`]）。

use serde_json::{Map, Value};
use futures_util::future::join_all;

use crate::config::Config;
use crate::credentials;
use crate::error::BackendError;
use crate::mcp::feishu::{TOOL_LIST_WORKITEM_TYPES, WRITE_TOOLS};
use crate::mcp::feishu::FeishuMcp;
use crate::mcp::{parse_tool_json, ConnectionInfo, TodoSource};
use crate::model::source::{PersonalTodoQuery, TodoAction, SourceKind};
use crate::model::domain::WorkItemId;
use crate::store::{
    ActionRecord, CachedItem, CachedType, DiscoveredType, ItemFilter, RunTrigger, Store, SyncRun,
    TypeScope,
};
use crate::sync::{SyncContext, SyncReport};

/// 一次类型发现的完整结果。
///
/// `failed` 记下哪些空间没读到以及为什么：清单少了一个空间是必须让用户看见的事实，
/// 静默交出一份看着完整的清单，等于让人按错的假设去选同步范围。
#[derive(Debug, Clone, Default)]
pub struct TypeDiscovery {
    pub types: Vec<DiscoveredType>,
    /// `(project_key, 已脱敏的错误文本)`。空 = 每个空间都读到了。
    pub failed: Vec<(String, String)>,
    /// 部分失败仍保留稳定错误类别，供来源内提示需要用户处理的问题。
    pub failure_kinds: Vec<String>,
}

/// 一次命令的完整上下文：配置 + 已打开的缓存库。
///
/// 打开即建表（`Store::open` 内部跑迁移），所以 `list` / `last-sync` 在
/// 从未同步过的机器上也能跑通（返回空结果而不是报错）。
pub struct Session {
    pub config: Config,
    pub store: Store,
}

impl Session {
    pub fn open(config: Config) -> Result<Self, BackendError> {
        crate::diagnostics::init();
        let store = Store::open(&config.db_path)?;
        store.adopt_legacy_items(&config.sources.iter().filter(|s| s.enabled)
            .map(|s| s.id.as_str()).collect::<Vec<_>>())?;
        Ok(Self { config, store })
    }

    /// 解析凭证，返回**可安全打印**的来源描述。
    ///
    /// `doctor` 用它确认「凭证到底读到了没有」，回显只有来源与长度。
    pub fn describe_credential(&self) -> Result<String, BackendError> {
        self.credential().map(|c| c.describe())
    }

    pub fn save_token(&self, raw: &str) -> Result<String, BackendError> {
        credentials::save_token(&self.store, raw)
    }

    /// 连接自检：建立 MCP 会话并回读服务端信息。
    ///
    /// 会真实走一次 `initialize`，因此能证明「凭证当前可用」，
    /// 而不是复用上一次的连接结果。
    pub fn check_connection(&self) -> Result<ConnectionInfo, BackendError> {
        let credential = self.credential()?;
        let mut client = FeishuMcp::new(self.config.endpoint.clone(), credential.token().clone());
        let runtime = runtime()?;
        let info = runtime.block_on(client.describe());
        runtime.block_on(client.close());
        info
    }

    /// 调用一个**读侧**工具并返回解析后的 JSON 值（联网）。
    ///
    /// 写侧工具（`WRITE_TOOLS`）在这里被拒绝：写必须走 [`crate::workflow`]，
    /// 那条路径上有身份/必填校验、幂等台账与写后回读核验，不留绕过的口子。
    pub fn call_read_tool(&self, tool: &str, arguments: &Map<String, Value>) -> Result<Value, BackendError> {
        self.call_tool_any(tool, arguments, false)
    }

    pub(crate) async fn read_tool(&self, tool: &str, arguments: &Map<String, Value>) -> Result<Value, BackendError> {
        if WRITE_TOOLS.contains(&tool) { return Err(BackendError::validation("读侧不能调用写工具")); }
        let credential = self.credential()?;
        let client = self.client(&credential);
        parse_tool_json(tool, &client.call_tool(tool, arguments).await?)
    }

    pub(crate) async fn field_metadata(&self, tool: &'static str, project: &str, kind: &str, fresh: bool) -> Result<Vec<Value>, BackendError> {
        let credential = self.credential()?;
        self.client(&credential).metadata(tool, project, kind, fresh).await
    }

    /// 工具调用的统一骨架。`allow_write` 只对 crate 内的流程执行层开放。
    pub(crate) fn call_tool_any(&self, tool: &str, arguments: &Map<String, Value>, allow_write: bool) -> Result<Value, BackendError> {
        if !allow_write && WRITE_TOOLS.contains(&tool) {
            return Err(BackendError::not_implemented(
                format!("{tool}（直接调用）"),
                "写侧工具只能经流程执行入口调用：那里有动作权限与必填字段校验、\
                 同 request_id 幂等台账和写后回读核验",
            ));
        }
        let credential = self.credential()?;
        let mut client = self.client(&credential);
        let runtime = runtime()?;
        let outcome = runtime
            .block_on(client.call_tool(tool, arguments))
            .and_then(|payload| {
                if allow_write && WRITE_TOOLS.contains(&tool) {
                    crate::mcp::parse::parse_write_response(tool, &payload)
                } else {
                    parse_tool_json(tool, &payload)
                }
            });
        // Release this command's handle; the application context retains the authenticated session.
        runtime.block_on(client.close());
        outcome
    }

    /// 同步个人待办。
    ///
    /// `source_id` 为 `None` 时要求配置里恰好有一个可执行的个人待办来源，
    /// 多个则报错要求显式指定——不猜用户想同步哪个范围。
    ///
    /// 返回的 [`SyncReport::status`] 才是成败结论：`max_pages` 截断时
    /// 这里返回 `Ok`，但状态是 `Failed`（数据不完整，不能算成功同步）。
    pub fn sync_personal_todos(
        &self,
        source_id: Option<&str>,
        trigger: RunTrigger,
    ) -> Result<SyncReport, BackendError> {
        self.sync_source(source_id, trigger, std::sync::Arc::new(crate::source_query::DetailCache::default()))
    }

    fn sync_source(
        &self,
        source_id: Option<&str>,
        trigger: RunTrigger,
        cache: std::sync::Arc<crate::source_query::DetailCache>,
    ) -> Result<SyncReport, BackendError> {
        runtime()?.block_on(self.sync_source_async(source_id, trigger, cache, None))
    }

    async fn sync_source_async(
        &self,
        source_id: Option<&str>,
        trigger: RunTrigger,
        cache: std::sync::Arc<crate::source_query::DetailCache>,
        progress: Option<&(dyn Fn() + Send + Sync)>,
    ) -> Result<SyncReport, BackendError> {
        // 来源 id 既用于「本轮是否可执行」的校验，也是类型范围的存储键。
        let source = self.config.select_todo_source(source_id)?.clone();
        let source_id_owned = source.id.clone();
        let query = source.todo.clone().unwrap_or(PersonalTodoQuery{action:TodoAction::Todo,todo_scope:None,asset_key:None});
        // 桌面端始终读取来源内全部类型；CLI 的显式范围继续由调用方选择。
        let scope = self.source_type_scope(&source_id_owned)?;
        let credential = self.credential()?;
        let mut client = self.client(&credential);
        let mut reader=crate::source_query::SourceReader::new(&client,&source,&self.store,scope.as_ref(),self.config.max_pages)
            .with_cache(cache).with_remote(client.as_ref()).with_progress(progress).with_trigger(trigger);
        let report = crate::sync::sync_personal_todos(
            &mut reader,
            &self.store,
            &query,
            self.config.max_pages,
            // 把已加载凭证交给同步层：失败落库前用它擦除错误文本
            Some(credential.token().expose()),
            SyncContext {
                trigger,
                source_id: Some(source_id_owned.as_str()),
                type_scope: scope.as_ref(),
            },
        ).await;
        // 请求失败由 MCP 层作废对应会话；成功会话继续供后续查询复用。
        drop(reader);
        client.close().await;
        // 日志轮转失败绝不能盖掉同步结果（同步结论才是调用方要的东西），所以这里不取错误。
        let _ = self.store.prune_runs(self.config.sync_run_retention);
        report
    }

    /// 查询本地缓存（不调网络）。
    pub fn query_cached_items(&self, filter: &ItemFilter) -> Result<Vec<CachedItem>, BackendError> {
        self.store.query_items(filter)
    }

    pub fn cached_item_detail(&self,id:&WorkItemId)->Result<Option<crate::detail::ItemDetail>,BackendError>{
        self.store.item_detail(id)
    }

    /// 只读取空间及关联项目目录；目录故障保留上次成功缓存，并独立报告。
    pub fn refresh_workspace_catalog(&self) -> Result<crate::catalog::CatalogRefresh, BackendError> {
        let mut credential = None;
        let result = (|| {
            let generation = self.store.begin_workspace_catalog_refresh()?;
            credential = Some(self.credential()?);
            let credential = credential.as_ref().expect("已取得连接凭证");
            let client = self.client(credential);
            let mut inputs = self.store.catalog_inputs()?;
            for source in &self.config.sources {
                match &source.kind {
                    SourceKind::WorkItemType { project_key: Some(key), type_key } => {
                        inputs.entry(key.clone()).or_default().types.extend(type_key.iter().cloned());
                    },
                    SourceKind::View { project_key: Some(key), .. } => { inputs.entry(key.clone()).or_default(); },
                    _ => {},
                }
                for kind in self.store.source_types(&source.id)? {
                    let input = inputs.entry(kind.project_key).or_default();
                    input.names.insert(kind.project_name);
                    input.types.insert(kind.type_key);
                }
            }
            let result = runtime()?.block_on(crate::catalog::refresh_catalog(&client, inputs,
                self.store.workspace_catalog()?, self.config.max_pages, Some(credential.token().expose())))?;
            if !self.store.save_workspace_catalog(generation, &result.spaces)? {
                return Err(BackendError::conflict("空间与项目目录读取已过期，请重新刷新"));
            }
            Ok(result)
        })();
        if let Err(error) = &result {
            crate::diagnostics::record_catalog_failure(error, credential.as_ref().map(|value| value.token().expose()));
        }
        result
    }

    /// 录入人工在测试事项上采集的五类变更证据；本接口不修改飞书事项。
    pub fn verify_source_versions(&self, source_id: &str, field: &str, samples: &Value) -> Result<(), BackendError> {
        let source = self.config.select_todo_source(Some(source_id))?;
        crate::association::identifier(field)?;
        let mut evidence = Vec::new();
        for kind in ["field","status","people","node","schedule"] {
            let sample = &samples[kind];
            let before = crate::source_query::row_version(&sample["before_record"], field);
            let after = crate::source_query::row_version(&sample["after_record"], field);
            let trace = crate::detail::text(&sample["trace"]);
            let pointer = crate::detail::text(&sample["changed_pointer"])
                .ok_or_else(||BackendError::validation(format!("{kind} 缺少变更字段的 JSON pointer")))?;
            let before_value=sample["before_detail"].pointer(&pointer);
            let after_value=sample["after_detail"].pointer(&pointer);
            if before.is_none() || after.is_none() || before == after || trace.is_none()
                || before_value.is_none() || after_value.is_none() || before_value == after_value {
                return Err(BackendError::validation(format!("{kind} 证据需要清单原始记录中可读取且不同的版本，以及详情中的真实变更")));
            }
            let before_id=crate::source_query::version_sample_identity(source,&sample["before_record"])?;
            let after_id=crate::source_query::version_sample_identity(source,&sample["after_record"])?;
            let before_detail_id=crate::detail::identity(&sample["before_detail"])?;
            let after_detail_id=crate::detail::identity(&sample["after_detail"])?;
            if before_id != after_id || before_detail_id != after_detail_id
                || before_id.work_item_id != before_detail_id.work_item_id
                || before_id.work_item_type_key != before_detail_id.work_item_type_key
                || (before_id.project_key != before_detail_id.project_key
                    && before_id.project_key != crate::detail::text(&sample["before_detail"]["work_item_attribute"]["owned_project"]["simple_name"])) {
                return Err(BackendError::validation(format!("{kind} 证据的清单与详情身份不一致")));
            }
            // 日期格式只有日精度，无法区分同一天的连续修改。
            if [before.as_ref().unwrap(),after.as_ref().unwrap()].iter()
                .any(|v| chrono::NaiveDate::parse_from_str(v.strip_prefix(&format!("{field}:")).unwrap_or(v),"%Y-%m-%d").is_ok()) {
                return Err(BackendError::validation("日期精度的字段不能作为可靠版本"));
            }
            evidence.push(serde_json::to_string(sample)?);
        }
        let evidence: [String;5] = evidence.try_into().expect("five change kinds");
        self.store.record_version_evidence(source,field,&evidence)
    }

    /// 调度入口：一个来源失败继续检查其他来源，共用详情任务和请求预算。
    pub fn sync_sources(&self, ids: &[String], trigger: RunTrigger) -> Result<serde_json::Value, BackendError> {
        self.sync_sources_with_progress(ids, trigger, |_| {})
    }

    pub fn sync_sources_with_progress(&self, ids: &[String], trigger: RunTrigger,
        on_patch: impl Fn(Value) + Send + Sync,
    ) -> Result<serde_json::Value, BackendError> {
        if ids.is_empty() { return Err(BackendError::validation("请选择至少一个已启用来源")); }
        let started = std::time::Instant::now();
        let filter = ItemFilter { limit: Some(i64::MAX), ..Default::default() };
        let before = self.store.query_items(&filter)?;
        let progress_state = std::sync::Mutex::new((before.clone(), None, 0usize,
            std::collections::HashMap::<(String, String, String), WorkItemId>::new()));
        let progress = || {
            // 同批来源串行发布，序号与 snapshot 基线保持同一顺序。
            let mut state = progress_state.lock().expect("sync progress poisoned");
            let Ok(after) = self.store.query_items(&filter) else { return; };
            let Ok(mut patch) = cache_patch(&state.0, &after) else { return; };
            patch["removed"] = serde_json::json!([]);
            if patch["added"].as_array().is_some_and(|rows| !rows.is_empty())
                || patch["modified"].as_array().is_some_and(|rows| !rows.is_empty()) {
                if state.1.is_none() {
                    state.1 = Some(crate::sync_metrics::elapsed_ms(started));
                    crate::diagnostics::record("sync_first_patch", started, "ok", false);
                }
                state.2 += 1;
                for sent in patch["added"].as_array().unwrap().iter().chain(patch["modified"].as_array().unwrap()) {
                    if let Ok(id) = serde_json::from_value::<WorkItemId>(sent["id"].clone()) {
                        state.3.insert(id.key_tuple(), id);
                    }
                }
                on_patch(serde_json::json!({"patch":patch,"total":after.len()}));
                state.0 = after;
            }
        };
        let cache = std::sync::Arc::new(crate::source_query::DetailCache::default());
        let mut checks = Vec::new();
        let mut rejected = 0;
        let mut success = true;
        for (id, result) in self.sync_source_batch(ids, trigger, cache, Some(&progress))? {
            match result {
                Ok(report) => {
                    success &= report.is_success() && report.complete;
                    rejected += report.items_rejected;
                    checks.push(serde_json::json!({"source_id":id,"report":report,"error_kind":null,"error_message":null}));
                }
                Err(e) => {
                    success = false;
                    let credential = self.credential().ok();
                    checks.push(serde_json::json!({"source_id":id,"report":null,"error_kind":e.kind().as_str(),
                        "error_message":e.safe_message(credential.as_ref().map(|c|c.token().expose()))}));
                }
            }
        }
        let after = self.store.query_items(&filter)?;
        let business_patch = cache_patch(&before, &after)?;
        // 聚合计数以最终业务差异为准，避免重叠来源的中间摘要覆盖制造修改数。
        let inserted = business_patch["added"].as_array().unwrap().len();
        let updated = business_patch["updated_count"].as_u64().unwrap() as usize;
        let removed = business_patch["removed"].as_array().unwrap().len();
        crate::diagnostics::record("sync_round", started, if success { "ok" } else { "incomplete" }, false);
        let progress_state = progress_state.lock().expect("sync progress poisoned");
        let patch = final_cache_patch(&before, &after, &progress_state.3)?;
        Ok(serde_json::json!({
            "status":if success {"success"} else {"failed"}, "complete":success,
            "items_inserted":inserted,"items_updated":updated,"items_rejected":rejected,
            "items_upserted":inserted+updated,"stop_reason":if success {"total_reached"} else {"error"},
            "changes":{"added":inserted,"updated":updated,"removed":removed},
            "checks":checks,"patch":patch,"total":after.len(),
            "last_success":self.store.last_successful_sync()?,"runs":self.store.recent_runs(20)?,
            "performance":{"elapsed_ms":crate::sync_metrics::elapsed_ms(started),"first_patch_ms":progress_state.1,"patch_batches":progress_state.2}
        }))
    }

    pub fn sync_enabled_sources(&self,trigger:RunTrigger)->Result<SyncReport,BackendError>{
        let ids:Vec<_>=self.config.sources.iter().filter(|s|s.enabled).map(|s|s.id.clone()).collect();
        if ids.is_empty(){return Err(BackendError::config("没有已启用的工作来源"));}
        let mut combined:Option<SyncReport>=None;
        let mut errors=Vec::new();
        let mut primary_error:Option<BackendError>=None;
        let mut succeeded=0;
        let cache=std::sync::Arc::new(crate::source_query::DetailCache::default());
        for (id, result) in self.sync_source_batch(&ids, trigger, cache, None)? {
            let report=match result{Ok(r)=>r,Err(e)=>{
                errors.push(format!("{id}: {e}"));
                if primary_error.is_none() || matches!(e.kind(),crate::error::ErrorKind::Auth|crate::error::ErrorKind::Credential|crate::error::ErrorKind::Config|crate::error::ErrorKind::Validation){primary_error=Some(e);}
                continue;
            }};
            if report.is_success() && report.complete { succeeded+=1; }
            if let Some(total)=&mut combined{
                total.run_id=report.run_id;
                total.pages_fetched+=report.pages_fetched;
                total.items_received+=report.items_received;
                total.items_upserted+=report.items_upserted;
                total.items_inserted+=report.items_inserted;
                total.items_updated+=report.items_updated;
                total.items_rejected+=report.items_rejected;
                total.items_out_of_scope+=report.items_out_of_scope;
                total.remote_total=total.remote_total.zip(report.remote_total).map(|(a,b)|a+b);
                total.rejections.extend(report.rejections);
                total.performance.merge(&report.performance);
                if !report.complete || report.status!=crate::store::RunStatus::Success{
                    total.complete=false;total.status=crate::store::RunStatus::Failed;total.stop_reason=report.stop_reason;
                }
            }else{combined=Some(report);}
        }
        if let Some(source)=primary_error{
            return Err(BackendError::Batch{message:format!("多来源同步部分失败：{succeeded} 个来源完整成功，已入库 {} 条（来源之间可能重叠）；{}。各来源结果已分别记录，已取得的数据保留。",combined.as_ref().map_or(0,|r|r.items_upserted),errors.join("；")),source:Box::new(source)});
        }
        let mut report=combined.ok_or_else(||BackendError::config("没有可同步的工作来源"))?;
        report.source_id=None;report.action="all_sources".into();report.todo_scope=None;
        Ok(report)
    }

    fn sync_source_batch(&self, ids: &[String], trigger: RunTrigger,
        cache: std::sync::Arc<crate::source_query::DetailCache>,
        progress: Option<&(dyn Fn() + Send + Sync)>,
    ) -> Result<Vec<(String, Result<SyncReport, BackendError>)>, BackendError> {
        Ok(runtime()?.block_on(collect_source_checks(ids, |id| {
            let cache = cache.clone();
            async move {
                let result = if self.config.sources.iter().any(|s| s.id == id && s.enabled) {
                    self.sync_source_async(Some(&id), trigger, cache, progress).await
                } else { Err(BackendError::validation("来源不存在或已停用")) };
                result
            }
        })))
    }

    pub fn refresh_item_detail(&self,id:&WorkItemId)->Result<crate::detail::ItemDetail,BackendError>{
        runtime()?.block_on(self.refresh_item_detail_async(id, false))
    }

    pub(crate) fn refresh_item_detail_fresh(&self,id:&WorkItemId)->Result<crate::detail::ItemDetail,BackendError>{
        runtime()?.block_on(self.refresh_item_detail_async(id, true))
    }

    pub(crate) async fn refresh_item_detail_async(&self,id:&WorkItemId,fresh:bool)->Result<crate::detail::ItemDetail,BackendError>{
        if !id.missing_parts().is_empty() {return Err(BackendError::validation("详情需要完整的空间、类型和编号"));}
        let generation=self.store.detail_generation(id)?;
        let credential=self.credential()?;
        let client=self.client(&credential);
        let detail=client.detail(id,generation,fresh).await?;
        self.store.save_item_detail_observed(&detail,None,generation)?;
        Ok(detail)
    }

    pub fn source_fields(&self,project:&str,type_key:&str)->Result<serde_json::Value,BackendError>{
        crate::association::identifier(project)?;
        crate::association::identifier(type_key)?;
        let credential=self.credential()?;
        let mut client=self.client(&credential);
        let runtime=runtime()?;
        let result=runtime.block_on(async {
            let fields=crate::source_query::metadata(&client,"list_workitem_field_config",project,type_key,self.config.max_pages).await?;
            let roles=crate::source_query::metadata(&client,"list_workitem_role_config",project,type_key,self.config.max_pages).await?;
            Ok(serde_json::json!({"fields":fields,"roles":roles}))
        });
        runtime.block_on(client.close());
        result
    }

    pub fn count_cached_items(&self) -> Result<i64, BackendError> {
        self.store.count_items()
    }

    /// 最近一次**成功**同步；没有成功记录时是 `None`，不会拿失败记录顶替。
    pub fn last_successful_sync(&self) -> Result<Option<SyncRun>, BackendError> {
        self.store.last_successful_sync()
    }

    /// 最近 N 次运行（含失败），排查用。
    pub fn recent_runs(&self, limit: i64) -> Result<Vec<SyncRun>, BackendError> {
        self.store.recent_runs(limit)
    }

    // ---------- 工作项类型发现与按来源的同步范围 ----------

    /// 发现并保存某来源可见的工作项类型（联网，只读）。
    ///
    /// 空间清单来自本地缓存里出现过的 `project_key`：MCP 没有「列出我有权限的全部空间」
    /// 的工具（`search_project_info` 必须给空间名），所以只能枚举已经同步到事项的空间。
    /// 因此**新空间要先同步到它的事项，才会出现在类型清单里**——这是接口能力限制，不是实现偷懒。
    ///
    /// 单个空间读失败（无权限、临时故障）不拖垮整次发现：剩下的空间照旧扫完，
    /// 快照按已发现的部分落库，失败清单原样回传给调用方明说。只有**全部空间都失败**
    /// 才报错——那种情况没有任何东西可存，存个空清单会让人以为清单是完整的。
    pub fn refresh_source_types(
        &self,
        source_id: &str,
    ) -> Result<TypeDiscovery, BackendError> {
        let mut projects = self.store.distinct_projects()?;
        // 升级后即使空间暂时没有个人事项，也能刷新此前发现过的类型名称。
        for kind in self.store.source_types(source_id)? {
            if !projects.iter().any(|(key, _)| key == &kind.project_key) {
                projects.push((kind.project_key, kind.project_name));
            }
        }
        if let Some(source)=self.config.sources.iter().find(|s|s.id==source_id){
            let project=match &source.kind{SourceKind::WorkItemType{project_key,..}|SourceKind::View{project_key,..}=>project_key.as_ref(),_=>None};
            if let Some(p)=project {if !projects.iter().any(|(key,_)|key==p){projects.push((p.clone(),p.clone()));}}
        }
        if projects.is_empty() {
            return Err(BackendError::config(
                "本地还没有任何带 project_key 的事项，无法确定要发现哪些空间的类型；请先同步一次",
            ));
        }
        let credential = self.credential().ok();
        let started = std::time::Instant::now();
        let result = refresh_type_snapshot(&self.store, source_id, &projects, crate::sync::now_ms(),
            credential.as_ref().map(|c| c.token().expose()), |project_key| {
            let mut args = Map::new();
            args.insert("project_key".to_string(), Value::String(project_key.to_owned()));
            self.call_read_tool(TOOL_LIST_WORKITEM_TYPES, &args)
        });
        crate::diagnostics::record("type_discovery", started,
            result.as_ref().map_or_else(|e| e.kind().as_str(), |r| if r.failed.is_empty() { "ok" } else { "partial" }), false);
        result
    }

    /// 已保存的类型快照（不联网；没发现过时是空表，不代表远端没有类型）。
    pub fn source_types(&self, source_id: &str) -> Result<Vec<CachedType>, BackendError> {
        self.store.source_types(source_id)
    }

    pub fn type_order(&self) -> Result<Vec<String>, BackendError> {
        self.store.type_order()
    }

    pub fn set_type_order(&self, type_keys: &[String]) -> Result<(), BackendError> {
        self.store.set_type_order(type_keys)
    }

    /// 当前生效的同步类型范围；`None` = 从未确认过（全量，与升级前一致）。
    pub fn source_type_scope(&self, source_id: &str) -> Result<Option<TypeScope>, BackendError> {
        if self.config.desktop_all_types { Ok(None) }
        else { self.store.source_type_scope(source_id) }
    }

    /// 记下用户确认过的类型范围，返回展开后的 `(空间, 类型)` 组合数。
    ///
    /// 选择只按类型键存，展示与偏好仍以原始 type_key 为键。
    ///
    /// 先在快照里核一遍再写：快照没这个键就当场拒，不能先记下行再等下次同步
    /// 静默拉不到东西——那种「已记录但永不生效」的故障最难查。
    pub fn set_source_type_scope(
        &self,
        source_id: &str,
        type_keys: &[String],
    ) -> Result<usize, BackendError> {
        if !type_keys.is_empty() {
            let snapshot = self.store.source_types(source_id)?;
            let missing: Vec<String> = type_keys
                .iter()
                .filter(|k| !snapshot.iter().any(|t| &&t.type_key == k))
                .cloned()
                .collect();
            if !missing.is_empty() {
                let listed = missing
                    .iter()
                    .map(|k| format!("「{k}」"))
                    .collect::<Vec<_>>()
                    .join("、");
                return Err(BackendError::validation(format!(
                    "类型 {listed} 不在来源 {source_id} 的类型快照里，范围未记录。先跑 fstodo types refresh 重新发现，再用 types list 确认可选的 type_key"
                )));
            }
        }
        self.store.set_source_type_scope(source_id, type_keys, crate::sync::now_ms())?;
        Ok(self
            .store
            .source_type_scope(source_id)?
            .map(|scope| scope.len())
            .unwrap_or(0))
    }

    /// 回到「从未确认过范围」：下次同步按全量执行（与升级前一致）。
    ///
    /// 这是把范围恢复成全量的唯一路径——空集合是「用户选了什么都不拉」，
    /// 拿它当「清除」会把行为摆到相反那一面。
    pub fn clear_source_type_scope(&self, source_id: &str) -> Result<bool, BackendError> {
        self.store.clear_source_type_scope(source_id)
    }

    /// 某个事项最近的动作执行流水（排障用；含结果不确定的那几次）。
    pub fn recent_actions(
        &self,
        item_id: &WorkItemId,
        limit: i64,
    ) -> Result<Vec<ActionRecord>, BackendError> {
        let (project_key, type_key, work_item_id) = item_id.key_tuple();
        self.store.recent_actions(&format!("{project_key}|{type_key}|{work_item_id}"), limit)
    }

    pub fn credential(&self) -> Result<crate::credentials::Credential, BackendError> {
        credentials::resolve_with_store(&self.store, &self.config.token_env, self.config.token_file.as_deref())
    }

    fn client(&self, credential: &crate::credentials::Credential) -> std::sync::Arc<crate::remote::Remote> {
        crate::remote::shared(&self.config, credential)
    }
}

fn refresh_type_snapshot(
    store: &Store, source_id: &str, projects: &[(String, String)], now: i64,
    secret: Option<&str>, mut read: impl FnMut(&str) -> Result<Value, BackendError>,
) -> Result<TypeDiscovery, BackendError> {
    let previous = store.source_types(source_id)?;
    let mut out = Vec::new();
    let mut failed = Vec::new();
    let mut failure_kinds = Vec::new();
    let mut first_error: Option<BackendError> = None;
    let needs_action = |error: &BackendError| matches!(error.kind(),
        crate::error::ErrorKind::Auth | crate::error::ErrorKind::Credential |
        crate::error::ErrorKind::Permission | crate::error::ErrorKind::Config);
    for (project_key, project_name) in projects {
        let rows = read(project_key).and_then(|value| value.get("list").and_then(Value::as_array)
            .cloned().ok_or_else(|| BackendError::parse("类型目录", "缺少 list")));
        let rows = match rows {
            Ok(rows) => rows,
            Err(error) => {
                failed.push((project_key.clone(), error.safe_message(secret)));
                failure_kinds.push(error.kind().as_str().to_owned());
                // 全部空间失败时，临时故障不能掩盖另一个空间的权限或配置问题。
                if first_error.as_ref().is_none_or(|previous| !needs_action(previous) && needs_action(&error)) {
                    first_error = Some(error);
                }
                continue;
            },
        };
        let mut seen = std::collections::HashSet::new();
        for row in rows {
            let Some(key) = row["type_key"].as_str().map(str::trim).filter(|s| !s.is_empty()) else { continue };
            if !seen.insert(key.to_owned()) { continue; }
            let old_name = previous.iter().find(|t| t.project_key == *project_key && t.type_key == key)
                .map(|t| t.type_name.as_str());
            // 名称暂缺时保留上次确认值；有效远端名称始终覆盖旧名称。
            let name = row["name"].as_str().map(str::trim).filter(|s| !s.is_empty())
                .or(old_name).unwrap_or(key);
            out.push(DiscoveredType {
                source_id: source_id.into(), project_key: project_key.clone(), project_name: project_name.clone(),
                type_key: key.into(), type_name: name.into(), executable: true, discovered_at_ms: now,
            });
        }
    }
    if out.is_empty() && failed.len() == projects.len() {
        if let Some(error) = first_error { return Err(error); }
    }
    // 空目录没有删除类型的可靠证据；只替换本轮取得非空目录的空间。
    let snapshot: Vec<_> = out.iter().map(|t| CachedType {
        project_key: t.project_key.clone(), project_name: t.project_name.clone(),
        type_key: t.type_key.clone(), type_name: t.type_name.clone(), discovered_at_ms: now,
    }).collect();
    store.save_source_type_projects(source_id, &snapshot, now)?;
    Ok(TypeDiscovery { types: out, failed, failure_kinds })
}

#[cfg(test)]
#[path = "api_type_tests.rs"]
mod type_tests;

/// 检查时间与出现次数属于同步元数据，不触发业务 patch。
fn cache_patch(before: &[CachedItem], after: &[CachedItem]) -> Result<Value, BackendError> {
    let old: std::collections::HashMap<_,_> = before.iter().map(|r|(r.item.id.key_tuple(),r)).collect();
    let new: std::collections::HashSet<_> = after.iter().map(|r|r.item.id.key_tuple()).collect();
    let business = |r: &CachedItem| -> Result<Value, BackendError> {
        let mut v = serde_json::to_value(r)?;
        for key in ["last_seen_at_ms","seen_count","first_seen_at_ms","raw_json"] {
            v.as_object_mut().unwrap().remove(key);
        }
        Ok(v)
    };
    let mut added=Vec::new();
    let mut modified=Vec::new();
    let mut updated_count=0;
    for row in after {
        match old.get(&row.item.id.key_tuple()) {
            None => added.push(row),
            Some(previous) if business(previous)? != business(row)? => {
                modified.push(row);
                // 旧缓存缺少节点排期时，首次补齐需要更新 UI，但不冒充远端业务变更。
                let mut current = business(row)?;
                current["personal_schedules"] = serde_json::to_value(row.personal_schedules.iter()
                    .filter(|(source,_)| previous.personal_schedules.contains_key(*source))
                    .collect::<std::collections::BTreeMap<_,_>>())?;
                if business(previous)? != current { updated_count += 1; }
            },
            _ => {}
        }
    }
    let removed: Vec<_> = before.iter().filter(|r|!new.contains(&r.item.id.key_tuple())).map(|r|&r.item.id).collect();
    Ok(serde_json::json!({"added":added,"modified":modified,"removed":removed,"updated_count":updated_count}))
}

/// 最终响应重放所有曾发布身份的当前值，即使中间事件丢失或事项变更后还原也能收敛。
/// 业务计数始终独立使用整轮 before→after，不能从本函数的传输条数推断。
fn final_cache_patch(before: &[CachedItem], after: &[CachedItem],
    published: &std::collections::HashMap<(String, String, String), WorkItemId>,
) -> Result<Value, BackendError> {
    let mut patch = cache_patch(before, after)?;
    let mut included = std::collections::HashSet::new();
    for row in patch["added"].as_array().unwrap().iter().chain(patch["modified"].as_array().unwrap()) {
        included.insert(serde_json::from_value::<WorkItemId>(row["id"].clone())?.key_tuple());
    }
    let current: std::collections::HashSet<_> = after.iter().map(|row| row.item.id.key_tuple()).collect();
    for row in after.iter().filter(|row| published.contains_key(&row.item.id.key_tuple())) {
        if included.insert(row.item.id.key_tuple()) {
            patch["modified"].as_array_mut().unwrap().push(serde_json::to_value(row)?);
        }
    }
    let mut removed = std::collections::HashSet::new();
    for id in patch["removed"].as_array().unwrap() {
        removed.insert(serde_json::from_value::<WorkItemId>(id.clone())?.key_tuple());
    }
    for (key, id) in published.iter().filter(|(key, _)| !current.contains(*key)) {
        if removed.insert(key.clone()) {
            patch["removed"].as_array_mut().unwrap().push(serde_json::to_value(id)?);
        }
    }
    Ok(patch)
}

// 所有来源先参与调度，慢详情不占检查名额；实际请求由各阶段的共享预算限流。
async fn collect_source_checks<F, Fut>(ids: &[String], mut check: F)
    -> Vec<(String, Result<SyncReport, BackendError>)>
where F: FnMut(String) -> Fut,
      Fut: std::future::Future<Output = Result<SyncReport, BackendError>>,
{
    let mut seen = std::collections::HashSet::new();
    join_all(ids.iter().filter(|id| seen.insert((*id).clone())).map(|id| {
        let task = check(id.clone());
        async move { (id.clone(), task.await) }
    })).await
}

fn runtime() -> Result<&'static tokio::runtime::Runtime, BackendError> {
    crate::remote::runtime()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};

    #[test]
    fn desktop_ignores_legacy_type_exclusions_without_changing_display_preferences() {
        let mut session = Session::open(tmp_config("desktop-all-types")).unwrap();
        session.store.set_source_type_scope("personal-todo", &[], 1).unwrap();
        assert!(session.source_type_scope("personal-todo").unwrap().is_some());
        session.config = session.config.for_desktop();
        assert!(session.source_type_scope("personal-todo").unwrap().is_none());
        assert!(session.store.source_type_scope("personal-todo").unwrap().is_some());
        assert_eq!(session.store.source_type_preferences().unwrap(), None);
    }

    fn tmp_config(name: &str) -> Config {
        // 只测本地路径与缓存行为，不碰网络，因此凭证不参与
        let dir = std::env::temp_dir().join(format!("fstodo-api-{name}-{}", std::process::id()));
        let text = preset();
        std::fs::create_dir_all(&dir).ok();
        let cfg_path = dir.join("config.toml");
        std::fs::write(&cfg_path, text).unwrap();
        Config::load(Some(&cfg_path), Some(&dir.join("t.db"))).unwrap()
    }

    /// `ConfigFile` 只实现了 Deserialize，这里手写一份等价 TOML 供测试写盘。
    fn preset() -> String {
        r#"
endpoint = "https://project.feishu.cn/mcp_server/v1"
token_env = "FSTODO_UNSET_TOKEN_FOR_API_TEST"
max_pages = 20

[[source]]
id = "personal-todo"
kind = "personal_todo"
action = "todo"
todo_scope = "in_progress"
"#
        .to_string()
    }

    #[test]
    fn session_opens_store_and_starts_empty() {
        let config = tmp_config("open");
        let session = Session::open(config).unwrap();
        assert_eq!(session.count_cached_items().unwrap(), 0);
        assert!(session.last_successful_sync().unwrap().is_none(), "没有成功记录时不得凭空给一个");
        assert!(session.query_cached_items(&ItemFilter::default()).unwrap().is_empty());
        assert!(session.recent_runs(10).unwrap().is_empty());
    }

    #[test]
    fn cache_query_is_readable_without_credentials() {
        // 「查询缓存」不应依赖凭证：离线也要能看已有数据
        let config = tmp_config("offline-query");
        let session = Session::open(config).unwrap();
        assert_eq!(session.count_cached_items().unwrap(), 0);
        let err = session.describe_credential().unwrap_err();
        assert_eq!(err.kind(), crate::error::ErrorKind::Credential);
    }

    #[test]
    fn scope_rejects_keys_the_snapshot_has_never_seen() {
        // 「已记录却永不生效」是最难查的故障：范围写入前必须核快照，拒绝时还要一个字节都不写。
        let config = tmp_config("scope-keys");
        let session = Session::open(config).unwrap();
        let now = crate::sync::now_ms();
        session
            .store
            .save_source_types(
                "personal-todo",
                &[CachedType {
                    project_key: "proj-a".into(),
                    project_name: "空间A".into(),
                    type_key: "story".into(),
                    type_name: "需求".into(),
                    discovered_at_ms: now,
                }],
                now,
            )
            .unwrap();

        let err = session
            .set_source_type_scope("personal-todo", &["story".into(), "没见过的键".into()])
            .unwrap_err();
        assert_eq!(err.kind(), crate::error::ErrorKind::Validation);
        assert!(err.safe_message(None).contains("没见过的键"), "要指名是哪个键被拒");
        assert!(
            session.source_type_scope("personal-todo").unwrap().is_none(),
            "校验失败时不得留下半套范围"
        );

        assert_eq!(session.set_source_type_scope("personal-todo", &["story".into()]).unwrap(), 1);
        let scope = session.source_type_scope("personal-todo").unwrap().expect("已确认过范围");
        assert_eq!(scope.len(), 1);
        assert!(scope.allows("proj-a", "story"));
        assert!(scope.allows("proj-b", "story"), "已开启类型在新空间也默认允许");
        assert!(scope.allows("proj-b", "new-type"), "未知新类型默认允许");

        // 空集合 = 明确「一个都不拉」，与「从未确认」是两件事
        assert_eq!(session.set_source_type_scope("personal-todo", &[]).unwrap(), 0);
        assert!(session.source_type_scope("personal-todo").unwrap().is_some());
        assert!(session.clear_source_type_scope("personal-todo").unwrap());
        assert!(
            session.source_type_scope("personal-todo").unwrap().is_none(),
            "清除后回到全量（与升级前一致）"
        );
    }

    #[test]
    fn incomplete_source_refuses_to_sync_before_credentials() {
        let dir = std::env::temp_dir().join(format!("fstodo-api-reserved-{}", std::process::id()));
        std::fs::create_dir_all(&dir).ok();
        let cfg_path = dir.join("config.toml");
        std::fs::write(
            &cfg_path,
            r#"
endpoint = "https://project.feishu.cn/mcp_server/v1"
token_env = "FSTODO_UNSET_TOKEN_FOR_API_TEST"

[[source]]
id = "story-view"
kind = "view"
project_key = "b"
"#,
        )
        .unwrap();
        let config = Config::load(Some(&cfg_path), Some(&dir.join("t.db"))).unwrap();
        let session = Session::open(config).unwrap();
        assert_eq!(
            session
                .sync_personal_todos(Some("story-view"), RunTrigger::Manual)
                .unwrap_err()
                .kind(),
            crate::error::ErrorKind::Validation,
            "来源缺少视图标识时要在触碰网络之前被拒绝"
        );
    }

    #[test]
    fn db_override_wins_and_parent_dir_is_created() {
        let dir = std::env::temp_dir().join(format!("fstodo-api-dbover-{}", std::process::id()));
        let nested = dir.join("deep").join("nested").join("x.db");
        std::fs::create_dir_all(&dir).ok();
        let cfg_path = dir.join("config.toml");
        std::fs::write(&cfg_path, preset()).unwrap();
        let config = Config::load(Some(&cfg_path), Some(&nested)).unwrap();
        assert_eq!(config.db_path, PathBuf::from(&nested));
        let session = Session::open(config).unwrap();
        assert!(Path::new(&nested).is_file(), "打开缓存库时应自动创建父目录");
        assert_eq!(session.store.path.as_deref(), Some(Path::new(&nested)));
        assert_eq!(session.count_cached_items().unwrap(), 0);
    }
}
#[cfg(test)]
#[path = "sync_schedule_tests.rs"]
mod sync_schedule_tests;

#[cfg(test)]
mod incremental_api_tests {
    use super::*;
    #[test]
    fn final_patch_reconciles_reverted_values_temporary_items_and_missed_batches_without_counting_them() {
        let store = Store::in_memory().unwrap();
        let raw = serde_json::json!({"project_key":"p","work_item_info":{
            "work_item_id":"1","work_item_type_key":"story","work_item_name":"初始X"}});
        let item = crate::model::domain::to_work_item(&crate::model::raw::RawTodoRecord {
            item: serde_json::from_value(raw.clone()).unwrap(), raw }).unwrap();
        let run = store.begin_run("todo", None, RunTrigger::Manual, Some("a"), 1).unwrap();
        store.upsert_items(run, &[item], 1).unwrap();
        let before = store.query_items(&ItemFilter::default()).unwrap();
        let original = before[0].clone();
        let mut intermediate = original.clone();
        intermediate.item.name = Some("中间Y".into());
        let mut temporary = intermediate.clone();
        temporary.item.id.work_item_id = "temporary".into();
        let published = [intermediate.clone(), temporary.clone()].into_iter()
            .map(|row| (row.item.id.key_tuple(), row.item.id)).collect();
        let patch = final_cache_patch(&before, &before, &published).unwrap();
        assert_eq!(patch["modified"], serde_json::json!([original]));
        assert_eq!(patch["removed"], serde_json::json!([temporary.item.id]));
        assert_eq!(patch["updated_count"], 0, "还原与临时新增后删除均不是整轮业务变化");
        assert_eq!(patch["added"], serde_json::json!([]));
        for received in [vec![], vec![intermediate.clone()], vec![intermediate, temporary]] {
            let mut visible: std::collections::HashMap<_, _> = before.iter().cloned()
                .chain(received).map(|row| (row.item.id.key_tuple(), serde_json::to_value(row).unwrap())).collect();
            for row in patch["added"].as_array().unwrap().iter().chain(patch["modified"].as_array().unwrap()) {
                let id: WorkItemId = serde_json::from_value(row["id"].clone()).unwrap();
                visible.insert(id.key_tuple(), row.clone());
            }
            for id in patch["removed"].as_array().unwrap() {
                visible.remove(&serde_json::from_value::<WorkItemId>(id.clone()).unwrap().key_tuple());
            }
            assert_eq!(visible.len(), 1);
            assert_eq!(visible.values().next().unwrap()["name"], "初始X");
        }
    }
    #[test]
    fn overlapping_sources_keep_personal_nodes_and_repeated_batches_have_no_patch() {
        let store = Store::in_memory().unwrap();
        let raw=serde_json::json!({"project_key":"p","work_item_info":{
            "work_item_id":"1","work_item_type_key":"story","work_item_name":"事项"},
            "node_info":{"node_name":"本人节点","node_state_key":"mine"}});
        let mut personal=crate::model::domain::to_work_item(&crate::model::raw::RawTodoRecord {
            item:serde_json::from_value(raw.clone()).unwrap(),raw,
        }).unwrap();
        let mut related=personal.clone();
        related.flow.node_name=Some("全部节点一 / 全部节点二".into());
        related.flow.node_state_key=None;
        store.save_item_detail(&crate::detail::ItemDetail { id:personal.id.clone(),fetched_at_ms:1,
            data:serde_json::json!({"work_item_attribute":{},"work_item_current_node":[
                {"id":"one","name":"全部节点一"},{"id":"two","name":"全部节点二"}]}),pages:vec![] }).unwrap();
        let a=store.begin_run("todo",None,RunTrigger::Manual,Some("personal"),1).unwrap();
        let b=store.begin_run("work_item_type",None,RunTrigger::Manual,Some("related"),1).unwrap();
        store.upsert_items(a,&[personal.clone()],1).unwrap();
        let before=store.query_items(&ItemFilter::default()).unwrap();
        for order in [[a,b],[b,a]] {
            for run in order {
                let item=if run==a { &personal } else { &related };
                assert_eq!(store.upsert_items(run,std::slice::from_ref(item),2).unwrap().updated,0);
            }
            let after=store.query_items(&ItemFilter::default()).unwrap();
            // 第一次关联来源登记归属会进入 patch，之后只核对最终流程摘要。
            assert_eq!(after[0].item.flow,before[0].item.flow);
        }
        let before=store.query_items(&ItemFilter::default()).unwrap();
        store.upsert_items(b,&[related.clone()],3).unwrap();
        store.upsert_items(a,&[personal.clone()],3).unwrap();
        let after=store.query_items(&ItemFilter::default()).unwrap();
        assert_eq!(cache_patch(&before,&after).unwrap()["modified"],serde_json::json!([]));
        personal.flow.node_name=Some("本人新节点".into());
        store.upsert_items(a,&[personal.clone()],4).unwrap();
        store.upsert_items(b,&[related.clone()],4).unwrap();
        let after=store.query_items(&ItemFilter::default()).unwrap();
        assert_eq!(after[0].personal_flows["personal"],personal.flow);
        assert_eq!(after[0].item.flow,related.flow);
        assert_eq!(cache_patch(&before,&after).unwrap()["modified"].as_array().unwrap().len(),1);
        related.flow.kind=crate::model::domain::FlowKind::State;
        related.flow.node_name=None;
        related.flow.start_state_key_name=Some("已完成".into());
        store.upsert_items(b,&[related.clone()],5).unwrap();
        assert_eq!(store.query_items(&ItemFilter::default()).unwrap()[0].item.flow,related.flow,
            "关联来源的真实状态不得被个人来源缓存遮蔽");
    }

    #[test]
    fn collection_order_is_not_a_detail_change_but_membership_and_content_are() {
        let store = Store::in_memory().unwrap();
        let raw = serde_json::json!({"project_key":"p","work_item_info":{
            "work_item_id":"1","work_item_type_key":"story","work_item_name":"事项"}});
        let item = crate::model::domain::to_work_item(&crate::model::raw::RawTodoRecord {
            item:serde_json::from_value(raw.clone()).unwrap(),raw,
        }).unwrap();
        let run = store.begin_run("todo",None,RunTrigger::Manual,Some("a"),1).unwrap();
        store.upsert_items(run,&[item.clone()],1).unwrap();
        let mut detail = crate::detail::ItemDetail { id:item.id.clone(),fetched_at_ms:1,pages:vec![],
            data:serde_json::json!({"work_item_attribute":{"role_members":[
                {"key":"dev","members":[{"key":"a"},{"key":"b"}]},{"key":"qa","members":[]}]},
                "work_item_current_node":[{"id":"a","owners":[{"key":"a"},{"key":"b"}]},{"id":"b"}],
                "work_item_fields":[{"key":"description","value":["first","second"]},{"key":"other","value":1}]}) };
        store.save_item_detail(&detail).unwrap();
        let before = store.query_items(&ItemFilter::default()).unwrap();
        detail.data["work_item_attribute"]["role_members"][0]["members"].as_array_mut().unwrap().reverse();
        detail.data["work_item_attribute"]["role_members"].as_array_mut().unwrap().reverse();
        detail.data["work_item_current_node"][0]["owners"].as_array_mut().unwrap().reverse();
        detail.data["work_item_current_node"].as_array_mut().unwrap().reverse();
        detail.data["work_item_fields"].as_array_mut().unwrap().reverse();
        store.save_item_detail(&detail).unwrap();
        let reordered = store.query_items(&ItemFilter::default()).unwrap();
        assert_eq!(cache_patch(&before,&reordered).unwrap()["modified"],serde_json::json!([]));
        for changed in ["members", "node", "field_order"] {
            let mut next = detail.clone();
            match changed {
                "members" => next.data["work_item_attribute"]["role_members"][1]["members"][0]["key"] = serde_json::json!("new"),
                "node" => next.data["work_item_current_node"][0]["id"] = serde_json::json!("new"),
                _ => next.data["work_item_fields"][1]["value"].as_array_mut().unwrap().reverse(),
            }
            store.save_item_detail(&next).unwrap();
            let after = store.query_items(&ItemFilter::default()).unwrap();
            assert_eq!(cache_patch(&before,&after).unwrap()["modified"].as_array().unwrap().len(),1,"{changed}");
        }
    }

    #[test]
    fn detail_only_changes_reach_the_patch_but_fetch_metadata_does_not() {
        let store = Store::in_memory().unwrap();
        let raw = serde_json::json!({"project_key":"p", "work_item_info":{
            "work_item_id":"1", "work_item_type_key":"story", "work_item_name":"事项"}});
        let item = crate::model::domain::to_work_item(&crate::model::raw::RawTodoRecord {
            item: serde_json::from_value(raw.clone()).unwrap(), raw,
        }).unwrap();
        let run = store.begin_run("todo",None,RunTrigger::Manual,Some("a"),1).unwrap();
        store.upsert_items(run,std::slice::from_ref(&item),1).unwrap();
        let mut detail = crate::detail::ItemDetail { id:item.id.clone(),fetched_at_ms:1,
            data:serde_json::json!({"work_item_attribute":{},"work_item_fields":[{"key":"description","value":"旧正文"}]}),
            pages:vec![] };
        store.save_item_detail(&detail).unwrap();
        let before = store.query_items(&ItemFilter::default()).unwrap();
        detail.fetched_at_ms=2;
        detail.pages=vec![serde_json::json!({"cursor":"new-cursor"})];
        store.save_item_detail(&detail).unwrap();
        let unchanged = store.query_items(&ItemFilter::default()).unwrap();
        assert_eq!(cache_patch(&before,&unchanged).unwrap()["modified"],serde_json::json!([]));
        detail.data["work_item_fields"][0]["value"]=serde_json::json!("新正文");
        store.save_item_detail(&detail).unwrap();
        let after = store.query_items(&ItemFilter::default()).unwrap();
        let patch=cache_patch(&before,&after).unwrap();
        assert_eq!(patch["modified"].as_array().unwrap().len(),1);
        assert_ne!(before[0].detail_revision,after[0].detail_revision);
        assert_eq!(before[0].updated_at_ms,after[0].updated_at_ms,"不依赖远端更新时间判断正文变化");
    }

    #[tokio::test]
    async fn slow_details_do_not_prevent_the_ninth_source_from_starting() {
        let barrier = std::sync::Arc::new(tokio::sync::Barrier::new(9));
        let mut ids: Vec<_> = (0..9).map(|n| n.to_string()).collect();
        ids.push("0".into());
        let results = tokio::time::timeout(std::time::Duration::from_secs(2),
            collect_source_checks(&ids, |_| {
                let barrier = barrier.clone();
                async move {
                    barrier.wait().await;
                    Err(BackendError::validation("测试来源"))
                }
            })).await.expect("前八个来源等待详情时第九个来源仍应启动");
        assert_eq!(results.iter().map(|r|r.0.as_str()).collect::<Vec<_>>(),
            (0..9).map(|n|n.to_string()).collect::<Vec<_>>());
    }
    #[test]
    fn source_errors_are_check_results_and_version_evidence_requires_five_real_changes() {
        let dir=std::env::temp_dir().join(format!("fstodo-version-evidence-{}-{}",std::process::id(),crate::sync::now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let path=dir.join("config.toml");
        std::fs::write(&path,"token_env='FSTODO_MISSING_EVIDENCE_TEST_TOKEN'\n[[source]]\nid='a'\nkind='personal_todo'\naction='todo'").unwrap();
        let session=Session::open(Config::load(Some(&path),Some(&dir.join("cache.db"))).unwrap()).unwrap();
        assert!(session.sync_sources(&[],RunTrigger::Manual).is_err());
        let batch=session.sync_sources(&["missing-a".into(),"missing-b".into()],RunTrigger::Manual).unwrap();
        assert_eq!(batch["checks"].as_array().unwrap().len(),2);
        assert!(batch["checks"].as_array().unwrap().iter().all(|r|r["error_kind"]=="validation"));
        assert_eq!(batch["patch"]["removed"],serde_json::json!([]));

        let source=&session.config.sources[0];
        let mut samples=serde_json::json!({});
        for kind in ["field","status","people","node","schedule"] {
            let record=|version:&str|serde_json::json!({"project_key":"p","remote_version":version,
                "work_item_info":{"work_item_id":"1","work_item_type_key":"story"}});
            let detail=|value:&str|serde_json::json!({"work_item_attribute":{"work_item_id":"1",
                "owned_project":{"key":"p"},"work_item_type":{"key":"story"}},
                "work_item_fields":[{"value":value}]});
            samples[kind]=serde_json::json!({"before_record":record("v1"),"after_record":record("v2"),
                "before_detail":detail("old"),"after_detail":detail("new"),
                "changed_pointer":"/work_item_fields/0/value","trace":"offline fixture"});
        }
        samples["schedule"]["after_record"]["remote_version"]=serde_json::json!("v1");
        assert!(session.verify_source_versions(&source.id,"remote_version",&samples).is_err());
        samples["schedule"]["after_record"]["remote_version"]=serde_json::json!("v2");
        session.verify_source_versions(&source.id,"remote_version",&samples).unwrap();
        assert_eq!(session.store.source_version_field(source).unwrap().as_deref(),Some("remote_version"));
        samples["field"]["before_record"]["updated_at"]=serde_json::json!("2026-10-20");
        samples["field"]["after_record"]["updated_at"]=serde_json::json!("2026-10-21");
        assert!(session.verify_source_versions(&source.id,"updated_at",&samples).is_err());
        drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
