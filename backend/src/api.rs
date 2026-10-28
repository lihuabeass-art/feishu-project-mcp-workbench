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
        runtime()?.block_on(self.sync_source_async(source_id, trigger, cache))
    }

    async fn sync_source_async(
        &self,
        source_id: Option<&str>,
        trigger: RunTrigger,
        cache: std::sync::Arc<crate::source_query::DetailCache>,
    ) -> Result<SyncReport, BackendError> {
        // 来源 id 既用于「本轮是否可执行」的校验，也是类型范围的存储键。
        let source = self.config.select_todo_source(source_id)?.clone();
        let source_id_owned = source.id.clone();
        let query = source.todo.clone().unwrap_or(PersonalTodoQuery{action:TodoAction::Todo,todo_scope:None,asset_key:None});
        // 类型范围只认「用户确认过」的集合；从没确认过就是 None（全量），与升级前行为完全一致。
        let scope = self.store.source_type_scope(&source_id_owned)?;
        let credential = self.credential()?;
        let mut client = self.client(&credential);
        let mut reader=crate::source_query::SourceReader::new(&client,&source,&self.store,scope.as_ref(),self.config.max_pages)
            .with_cache(cache);
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
        let generation = self.store.begin_workspace_catalog_refresh()?;
        let credential = self.credential()?;
        let client = self.client(&credential);
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
        if ids.is_empty() { return Err(BackendError::validation("请选择至少一个已启用来源")); }
        let filter = ItemFilter { limit: Some(i64::MAX), ..Default::default() };
        let before = self.store.query_items(&filter)?;
        let cache = std::sync::Arc::new(crate::source_query::DetailCache::default());
        let mut checks = Vec::new();
        let mut rejected = 0;
        let mut success = true;
        for (id, result) in self.sync_source_batch(ids, trigger, cache)? {
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
        let patch = cache_patch(&before, &after)?;
        // 聚合计数以最终业务差异为准，避免重叠来源的中间摘要覆盖制造修改数。
        let inserted = patch["added"].as_array().unwrap().len();
        let updated = patch["updated_count"].as_u64().unwrap() as usize;
        Ok(serde_json::json!({
            "status":if success {"success"} else {"failed"}, "complete":success,
            "items_inserted":inserted,"items_updated":updated,"items_rejected":rejected,
            "items_upserted":inserted+updated,"stop_reason":if success {"total_reached"} else {"error"},
            "checks":checks,"patch":patch,"total":after.len(),
            "last_success":self.store.last_successful_sync()?,"runs":self.store.recent_runs(20)?
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
        for (id, result) in self.sync_source_batch(&ids, trigger, cache)? {
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
    ) -> Result<Vec<(String, Result<SyncReport, BackendError>)>, BackendError> {
        Ok(runtime()?.block_on(collect_source_checks(ids, |id| {
            let cache = cache.clone();
            async move {
                let result = if self.config.sources.iter().any(|s| s.id == id && s.enabled) {
                    self.sync_source_async(Some(&id), trigger, cache).await
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
        if let Some(source)=self.config.sources.iter().find(|s|s.id==source_id){
            let project=match &source.kind{SourceKind::WorkItemType{project_key,..}|SourceKind::View{project_key,..}=>project_key.as_ref(),_=>None};
            if let Some(p)=project {if !projects.iter().any(|(key,_)|key==p){projects.push((p.clone(),p.clone()));}}
        }
        if projects.is_empty() {
            return Err(BackendError::config(
                "本地还没有任何带 project_key 的事项，无法确定要发现哪些空间的类型；请先同步一次",
            ));
        }
        let now = crate::sync::now_ms();
        let mut out: Vec<DiscoveredType> = Vec::new();
        let mut failed: Vec<(String, String)> = Vec::new();
        let mut first_error: Option<BackendError> = None;
        // 失败文本必须带凭证做脱敏：safe_message 拿不到 token 时根本不擦除，
        // 而上游（MCP SDK）的错误文本会原样回显请求内容。取不到凭证就退化为不脱敏
        // ——那种情况连调用都发不出去，错误另有出处。
        let credential = self.credential().ok();
        for (project_key, project_name) in &projects {
            let mut args = Map::new();
            args.insert("project_key".to_string(), Value::String(project_key.clone()));
            let value = match self.call_read_tool(TOOL_LIST_WORKITEM_TYPES, &args) {
                Ok(value) => value,
                Err(e) => {
                    // 文本先取（已脱敏），再把错误本体留下：全失败时要拿它当整体错误返回，
                    // 保留原本的错种（连接/鉴权/工具）而不是退化成一句泛泛的失败。
                    let text = e.safe_message(credential.as_ref().map(|c| c.token().expose()));
                    failed.push((project_key.clone(), text));
                    if first_error.is_none() {
                        first_error = Some(e);
                    }
                    continue;
                }
            };
            for row in value.get("list").and_then(Value::as_array).into_iter().flatten() {
                let type_key = row
                    .get("type_key")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim()
                    .to_string();
                // 没有 type_key 的行既不能拿来筛也不能拿来写，直接不要：留着只会让界面出现一个选了没用的选项。
                if type_key.is_empty() {
                    continue;
                }
                out.push(DiscoveredType {
                    source_id: source_id.to_string(),
                    project_key: project_key.clone(),
                    // 响应里没有空间名，用缓存里那份（同一个 project_key 的名字）。
                    project_name: project_name.clone(),
                    type_name: row
                        .get("name")
                        .and_then(Value::as_str)
                        .filter(|s| !s.trim().is_empty())
                        .unwrap_or(&type_key)
                        .to_string(),
                    type_key,
                    // 恒为 true：响应里的 `is_disable` 语义没做过验证（实测见过取值 2），
                    // 拿一个没验证过的字段去过滤可选项，风险是「把能用的类型藏掉」。
                    // 真正的可执行性由动作发现来判定——那里读不到动作就是没有动作。
                    executable: true,
                    discovered_at_ms: now,
                });
            }
        }
        if out.is_empty() && failed.len() == projects.len() {
            if let Some(error) = first_error {
                return Err(error);
            }
        }
        // 一个类型都没发现时**不动旧快照**：清空它会让之后每次 `types use` 都报「不在快照里」，
        // 而这次调用看起来仍是成功的——那是把可用状态销毁了却不留痕迹。远端真的删光了类型
        // 是另一回事，本轮没有那样的证据，就不拿「覆盖」去冒充「同步」。
        if !out.is_empty() {
            let snapshot: Vec<CachedType> = out
                .iter()
                .map(|t| CachedType {
                    project_key: t.project_key.clone(),
                    project_name: t.project_name.clone(),
                    type_key: t.type_key.clone(),
                    type_name: t.type_name.clone(),
                    discovered_at_ms: t.discovered_at_ms,
                })
                .collect();
            self.store.save_source_types(source_id, &snapshot, now)?;
        }
        Ok(TypeDiscovery { types: out, failed })
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
        self.store.source_type_scope(source_id)
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
