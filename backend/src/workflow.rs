//! 流程动作：发现 → 校验 → 执行 → 回读核验。
//!
//! 这个模块存在的全部理由，是「客户端能不能自己猜出怎么推进流程」这个问句。
//! 答案是不能，所以这里定的规矩都很硬：
//!
//! | 规矩 | 依据 |
//! |---|---|
//! | 动作只从远端读接口来，绝不按节点名字猜 | `transition_node` 只认 `node_id`（模板 `state_key`），`transition_state` 只认 `transition_id`；名字相同不代表 id 相同 |
//! | 字段草稿不写远端；确认后先更新字段、再检查必填、最后流转 | 不把字段参数塞入 transition_*；不支持的字段仍明确阻断 |
//! | `node` 与 `state` 动作分开列，绝不合并成一个「完成」 | 两条通路的写入参数完全不同，合并等于替用户选了一条 |
//! | 写之前先落 `pending` 流水 | 超时/断连时「不知道改没改成」必须有证据，且永不自动重试写 |
//! | 只有回读核验通过才 `verified = true` | 工具返回成功不等于状态真的变了 |
//!
//! 关于 `node_id`：实测 `get_node_detail` 接受 `basic.node_key`（如 `state_11`），
//! 传 `node_uuid`（`node_state_11_1000000001`）会报 `NodeNotFound`；`update_node` 的文档
//! 也写明 `node_id` 是「所属工作项对应的模板 state_key」。因此这里一律用 `basic.node_key`。

use std::collections::{BTreeMap, BTreeSet};
use std::sync::Mutex;
use futures_util::{stream, StreamExt, TryStreamExt};

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::api::Session;
use crate::error::{BackendError, ErrorKind};
use crate::mcp::feishu::{
    TOOL_GET_NODE_DETAIL, TOOL_GET_TRANSITABLE_STATES, TOOL_GET_TRANSITION_REQUIRED,
    TOOL_TRANSITION_NODE, TOOL_TRANSITION_STATE,
};
use crate::model::domain::WorkItemId;
use crate::store::ActionRecord;
use crate::sync::now_ms;
#[path = "workflow_fields.rs"]
mod editing;
#[path = "workflow_links.rs"]
mod links;

/// 界面上一个可填字段的控件类型。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FieldKind {
    Text,
    Textarea,
    Select,
    Number,
    Date,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct FieldSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initial_value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub read_only: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    /// 负责人字段的展示名与去掉负责人后的列标题，供界面按「人 × 指标」排布。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FieldOption {
    pub value: String,
    pub label: String,
}

/// 动作需要用户提供的输入。
///
/// 节点/状态字段由独立的更新接口提交并回读，再调用流转接口；不支持的必填类型
/// 继续走 disabled_reason。回滚原因仍直接传给节点流转接口。
#[derive(Debug, Clone, Serialize)]
pub struct WorkflowField {
    pub key: String,
    pub label: String,
    pub kind: FieldKind,
    pub required: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<FieldOption>,
    #[serde(flatten)]
    pub settings: FieldSettings,
}

/// 动作属于哪条通路。前端按这个分开展示，永不合并。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionKind {
    Node,
    State,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkflowAction {
    pub id: String,
    pub label: String,
    pub kind: ActionKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disabled_reason: Option<String>,
    /// 未满足的流转必填项无法在本地补填，界面应提供当前事项的飞书填写入口。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manual_fill_required: Option<bool>,
    /// 动作涉及须在页面处理的字段，点击时直接打开飞书，不进入本机草稿。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires_feishu: Option<bool>,
    pub fields: Vec<WorkflowField>,
}

/// 一次发现的完整结果。`version` 是快照指纹，执行时必须原样带回。
#[derive(Debug, Clone, Serialize)]
pub struct WorkflowOptions {
    pub version: String,
    /// 同一轮已读事项的飞书项目详情页；无法确认完整身份或域名时省略。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_url: Option<String>,
    pub actions: Vec<WorkflowAction>,
}

/// 执行请求。`version` 不匹配就拒绝执行，`request_id` 是幂等键。
#[derive(Debug, Clone, Deserialize)]
pub struct WorkflowRequest {
    pub item_id: WorkItemId,
    pub action_id: String,
    pub version: String,
    pub request_id: String,
    /// 仅包含本次修改的字段；缺省字段按最新快照校验，不写回。
    #[serde(default)]
    pub fields: BTreeMap<String, String>,
}

/// 执行结论。
///
/// `verified` 只在 [`ActionOutcome::Verified`] 时为 `true`。
/// 写请求已经发出去但结果不明时是 `Unknown`——**既不是失败也不是成功**。
///
/// [`ActionOutcome::Failed`] 目前**不由 [`execute`] 产出**：写请求一旦发出，本端能诚实
/// 表达的结论只有「回读确认变了」和「确认不了」两种，把确认不了说成失败正是在催用户
/// 重试写入。发送前的拒绝走 [`BackendError`]（校验/冲突/权限），不占用此结论。
/// 该变体保留给台账已有的 `failed` 状态（人工或历史行），界面仍要能读它。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionOutcome {
    Verified,
    Failed,
    Unknown,
}

impl ActionOutcome {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Verified => "verified",
            Self::Failed => "failed",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkflowResult {
    pub outcome: ActionOutcome,
    pub verified: bool,
    pub message: String,
    pub request_id: String,
    pub action_id: String,
    /// 核验通过后是否重跑了一次同步（本地缓存因此刷新）。
    /// `false` 只说明缓存可能暂时陈旧，不影响 `verified` 的结论。
    pub resynced: bool,
}

/// 回读核验的判据。
#[derive(Debug, Clone, Serialize)]
enum Expectation {
    /// 节点流转后该节点不再是这个状态：confirm → 不再 `doing`；rollback → 不再 `finished`。
    NodeNot { node_key: String, status: String },
    /// 状态流工作项的当前状态必须等于目标状态。
    StateIs { from: String, target: String },
}

/// 发现出来的一个动作，含要发给服务端的**原始**参数。
///
/// 参数在发现阶段就按服务端给的形状构造好（`transition_id` 是数字就按工具声明转成字符串），
/// 执行时只补用户填的那一个字段，避免中途转换类型把请求改坏。
#[derive(Debug, Clone)]
struct DiscoveredAction {
    view: WorkflowAction,
    tool: &'static str,
    args: Map<String, Value>,
    expect: Expectation,
    /// 台账里的动作类别。
    ledger_kind: &'static str,
    /// 台账里的目标（节点 key 或目标状态 key）。
    target: String,
    form: editing::NodeForm,
}

/// 一次发现的内部结果。
pub struct Discovery {
    pub version: String,
    item_url: Option<String>,
    entries: Vec<DiscoveredAction>,
}

impl Discovery {
    pub fn options(&self) -> WorkflowOptions {
        // 节点动作按操作语义稳定分组，组内沿用远端顺序；状态流继续用已有排序规则。
        let mut nodes: Vec<_> = self.entries.iter().filter(|entry| entry.view.kind == ActionKind::Node).collect();
        nodes.sort_by_key(|entry| match entry.ledger_kind {
            "node_confirm" => 0,
            "node_progress" | "node_schedule" => 1,
            "node_rollback" => 2,
            _ => 3,
        });
        let mut states: Vec<_> = self.entries.iter().filter(|entry| entry.view.kind == ActionKind::State).collect();
        states.sort_by(|a, b| snapshot_entry_order(a, b));
        let mut nodes = nodes.into_iter();
        let mut states = states.into_iter();
        let actions = self.entries.iter().map(|entry| match entry.view.kind {
            ActionKind::Node => nodes.next().unwrap(),
            ActionKind::State => states.next().unwrap(),
        }.view.clone()).collect();
        WorkflowOptions {
            version: self.version.clone(),
            item_url: self.item_url.clone(),
            actions,
        }
    }
}

// ---------------------------------------------------------------- 发现

/// 发现某个事项当前可用的流程动作（全部走读接口，不写任何东西）。
pub fn discover(session: &Session, id: &WorkItemId) -> Result<Discovery, BackendError> {
    discover_with_freshness(session, id, false)
}

fn discover_with_freshness(session: &Session, id: &WorkItemId, fresh: bool) -> Result<Discovery, BackendError> {
    crate::remote::runtime()?.block_on(crate::diagnostics::workflow(discover_async(session, id, fresh)))
}

async fn discover_async(session: &Session, id: &WorkItemId, fresh: bool) -> Result<Discovery, BackendError> {
    let project_key = id.project_key.clone().unwrap_or_default();
    let type_key = id.work_item_type_key.clone().unwrap_or_default();
    if project_key.trim().is_empty() {
        return Err(BackendError::validation(
            "事项缺少 project_key，无法定位流程；请先同步出完整身份再操作",
        ));
    }
    if type_key.trim().is_empty() {
        return Err(BackendError::validation(
            "事项缺少 work_item_type_key，无法定位流程；请先同步出完整身份再操作",
        ));
    }
    if id.work_item_id.trim().is_empty() {
        return Err(BackendError::validation(
            "事项缺少 work_item_id，无法定位流程",
        ));
    }

    let mut entries: Vec<DiscoveredAction> = Vec::new();
    let mut first_flow_error: Option<BackendError> = None;

    // Use the explicit model from a complete remote detail, never infer it from a type name.
    // UI details and this request share the same in-flight read; execution bypasses all TTL caches.
    let detail = session.refresh_item_detail_async(id, fresh).await?;
    let item_url = links::item_url(&session.config.endpoint, id, &detail.data);
    let results = match detail.data["work_item_attribute"]["work_item_mod"].as_str() {
        Some("节点流") => vec![node_entries(session, id, &detail, fresh).await],
        Some("状态流") => vec![state_entries(session, id, &detail, fresh).await],
        _ => {
            let (node, state) = tokio::join!(node_entries(session, id, &detail, fresh), state_entries(session, id, &detail, fresh));
            vec![node, state]
        }
    };
    for result in results {
        match result {
            Ok(v) => entries.extend(v),
            Err(e) if flow_absent(&e) => first_flow_error = first_flow_error.or(Some(e)),
            Err(e) => return Err(e),
        }
    }

    // 两条通路都读不到才报错：只有一条读不到是常态（story 走节点流、issue 走状态流），
    // 但「两条都失败」说明凭证/网络/权限出了问题，不能显示成「没有可执行动作」。
    if entries.is_empty() {
        if let Some(e) = first_flow_error {
            return Err(e);
        }
    }

    let version = fingerprint(&entries);
    Ok(Discovery { version, item_url, entries })
}

/// 只要动作清单，供 IPC / CLI 直接用。
pub fn actions(session: &Session, id: &WorkItemId) -> Result<WorkflowOptions, BackendError> {
    discover(session, id).map(|d| d.options())
}

/// 草稿冲突检查使用完整远端快照，绕过详情与字段配置缓存。
pub fn fresh_actions(session: &Session, id: &WorkItemId) -> Result<WorkflowOptions, BackendError> {
    discover_with_freshness(session, id, true).map(|d| d.options())
}

/// 「这条流程通路不存在」的判据：服务端把它当业务错误拒绝了（`Tool`）。
///
/// 实测：对 story 调 `get_transitable_states` 返回
/// `biz error: story work item flow mode not state flow`，正是这一类。
/// 鉴权/权限/连接/超时/解析类错误**绝不**归到这里——那些必须如实上抛。
fn flow_absent(error: &BackendError) -> bool {
    error.kind() == ErrorKind::Tool
}

/// 读接口的定位参数：节点详情 / 可流转状态 / 必填项三个读工具都要求这三个字段。
fn read_args(project_key: &str, type_key: &str, work_item_id: &str) -> Map<String, Value> {
    let mut args = Map::new();
    args.insert("project_key".to_string(), json!(project_key));
    args.insert("work_item_type_key".to_string(), json!(type_key));
    args.insert("work_item_id".to_string(), json!(work_item_id));
    args
}

/// 写接口的定位参数：只带工具自己声明过的字段，一个多余参数都不塞。
fn write_args(project_key: &str, work_item_id: &str) -> Map<String, Value> {
    let mut args = Map::new();
    args.insert("project_key".to_string(), json!(project_key));
    args.insert("work_item_id".to_string(), json!(work_item_id));
    args
}

/// `transition_state` 把 `transition_id` 声明成 string，实测 `get_transitable_states` 给的
/// 却是数字（`10001`）：数字按声明转成字符串，本来就是字符串的原样回传，不做别的加工。
/// 同时返回「要发给服务端的值」和「它的纯文本写法」：动作 id 里要用纯文本，
/// 不能把 JSON 的引号一起拼进去（`state:"10002":REOPENED` 这种 id 没人能手抄）。
fn normalize_transition_id(value: &Value) -> (Value, String) {
    match value {
        Value::Number(number) => (Value::String(number.to_string()), number.to_string()),
        Value::String(text) => (Value::String(text.clone()), text.clone()),
        other => {
            let text = other.to_string();
            (other.clone(), text)
        }
    }
}

/// 节点数组在响应里的容器键：实测不带 `node_id_list` 时给 `list`，其它调用形态给过 `detail`。
const NODE_CONTAINERS: [&str; 4] = ["list", "detail", "nodes", "data"];

fn node_list(value: &Value) -> Vec<Value> {
    NODE_CONTAINERS
        .iter()
        .find_map(|key| value.get(*key).and_then(Value::as_array))
        .cloned()
        .unwrap_or_default()
}

/// 节点 key：实测在 `basic.node_key`，顶层 `node_key` 作为兼容分支。
fn node_key_of(node: &Value) -> String {
    node.get("basic")
        .and_then(|b| b.get("node_key"))
        .or_else(|| node.get("node_key"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

/// 节点状态：`basic.status` 优先，兼容顶层 `status`；都没有时返回空串。
///
/// 空串不是「数据缺失」而是判据本身：实测做完的节点根本不带 status 字段。
fn node_status_of(node: &Value) -> String {
    node.get("basic")
        .and_then(|b| b.get("status"))
        .or_else(|| node.get("status"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

/// 节点分页的硬上限：真到不了头就报错，绝不静默交半份清单。
const MAX_NODE_PAGES: u32 = 50;

/// 分页取回事项的全部节点。
///
/// 实测（story 1000000001，`total: 21`）：`page_size` 传 100 会被无视、仍按 20 条返回，
/// 所以只能按 `page_num` 一页页翻到 `has_more` 为假；只取第一页会漏掉第 21 个节点。
fn fetch_nodes(
    session: &Session,
    project_key: &str,
    type_key: &str,
    work_item_id: &str,
) -> Result<Vec<Value>, BackendError> {
    crate::remote::runtime()?.block_on(fetch_nodes_async(session, project_key, type_key, work_item_id))
}

async fn fetch_nodes_async(
    session: &Session, project_key: &str, type_key: &str, work_item_id: &str,
) -> Result<Vec<Value>, BackendError> {
    let mut all: Vec<Value> = Vec::new();
    let mut seen: BTreeSet<String> = BTreeSet::new();
    for page in 1..=MAX_NODE_PAGES {
        let mut args = read_args(project_key, type_key, work_item_id);
        args.insert("page_num".to_string(), json!(page));
        let value = session.read_tool(TOOL_GET_NODE_DETAIL, &args).await?;
        let batch = node_list(&value);
        if batch.is_empty() {
            return Ok(all);
        }
        // 服务端如果无视 page_num（page_size 就被无视过），撞见重复页要马上停，别原地打转。
        let keys: BTreeSet<String> = batch.iter().map(node_key_of).collect();
        if !seen.is_disjoint(&keys) {
            return Err(BackendError::parse(
                "get_node_detail",
                format!(
                    "第 {page} 页返回了与前面重复的节点，分页可能未被支持；已取到 {} 个节点后停止",
                    all.len()
                ),
            ));
        }
        seen.extend(keys);
        all.extend(batch);
        let has_more = value
            .get("pagination")
            .and_then(|p| p.get("has_more"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if !has_more {
            return Ok(all);
        }
    }
    Err(BackendError::parse(
        "get_node_detail",
        format!(
            "节点分页翻了 {MAX_NODE_PAGES} 页仍未到头，已停止：服务端分页行为异常，不能拿一份不完整的节点清单去决定动作"
        ),
    ))
}

/// 节点流动作：`doing` 节点给 confirm，已完成的节点给 rollback。
///
/// `not_started` 的节点不给任何动作——本端没有「直接跳到某个未开始节点」的接口。
///
/// 「已完成」的判据来自实测（story 1000000001，21 个节点）：`basic.status` 只出现过
/// `doing` 与 `not_started` 两个取值，**真正做完的节点根本不带 status 字段**。
/// 所以这里按「既不是 doing 也不是 not_started」认定已完成，而不是去猜一个完成态的英文 token。
async fn node_entries(session: &Session, id: &WorkItemId, detail: &crate::detail::ItemDetail, fresh: bool) -> Result<Vec<DiscoveredAction>, BackendError> {
    let (project_key, type_key, work_item_id) = id.key_tuple();
    let mut out = Vec::new();
    let nodes = fetch_nodes_async(session, &project_key, &type_key, &work_item_id).await?;
    let active_keys: Vec<_> = nodes.iter().filter(|n| node_status_of(n) == "doing").map(node_key_of).filter(|k| !k.is_empty()).collect();
    let read_required = || stream::iter(active_keys.iter().map(|key| async {
        Ok::<_, BackendError>((key.clone(), required_value_async(session, &project_key, &type_key, &work_item_id, key).await?))
    })).buffer_unordered(crate::mcp::scheduler::MAX_PENDING_READS).try_collect::<BTreeMap<_, _>>();
    let (required_nodes, configs) = if active_keys.is_empty() {
        (BTreeMap::new(), (Vec::new(), Vec::new()))
    } else {
        tokio::try_join!(read_required(), editing::field_configs(session, &project_key, &type_key, fresh))?
    };
    for node in nodes {
        let node_key = node_key_of(&node);
        if node_key.is_empty() {
            continue;
        }
        let name = node
            .get("basic")
            .and_then(|b| b.get("name"))
            .and_then(Value::as_str)
            .unwrap_or(node_key.as_str())
            .to_string();
        let status = node_status_of(&node);
        let mut args = write_args(&project_key, &work_item_id);
        args.insert("node_id".to_string(), json!(&node_key));

        match status.as_str() {
            "doing" => {
                let required = &required_nodes[&node_key];
                let (nc, wc) = &configs;
                let form = editing::NodeForm::build(&node, required, nc, wc, &detail.data)?;
                if let Some(progress) = form.progress_only() {
                    out.push(DiscoveredAction {
                        view: WorkflowAction {
                            id: format!("node:progress:{node_key}"),
                            label: format!("仅同步进度「{name}」"),
                            kind: ActionKind::Node,
                            description: Some("只将进度百分比同步到飞书，保持当前节点；即使进度为 100% 也不会推进流程。".into()),
                            disabled_reason: None,
                            manual_fill_required: None,
                            requires_feishu: None,
                            fields: progress.fields(),
                        },
                        tool: crate::mcp::feishu::TOOL_UPDATE_NODE,
                        args: args.clone(),
                        expect: Expectation::NodeNot {
                            node_key: node_key.clone(),
                            status: status.clone(),
                        },
                        ledger_kind: "node_progress",
                        target: node_key.clone(),
                        form: progress,
                    });
                }
                if let Some(schedule) = form.schedule_only() {
                    out.push(DiscoveredAction {
                        view: WorkflowAction {
                            id: format!("node:schedule:{node_key}"),
                            label: format!("仅同步日期「{name}」"),
                            kind: ActionKind::Node,
                            description: Some("仅同步排期的开始和结束日期，保持当前节点进行中。".into()),
                            disabled_reason: None,
                            manual_fill_required: None,
                            requires_feishu: None,
                            fields: schedule.fields(),
                        },
                        tool: crate::mcp::feishu::TOOL_UPDATE_NODE,
                        args: args.clone(),
                        expect: Expectation::NodeNot {
                            node_key: node_key.clone(),
                            status: status.clone(),
                        },
                        ledger_kind: "node_schedule",
                        target: node_key.clone(),
                        form: schedule,
                    });
                }
                args.insert("action".to_string(), json!("confirm"));
                out.push(DiscoveredAction {
                    view: WorkflowAction {
                        id: format!("node:confirm:{node_key}"),
                        label: format!("完成节点「{name}」"),
                        kind: ActionKind::Node,
                        description: None,
                        disabled_reason: form.node_block_reason(&name),
                        manual_fill_required: form.requires_manual_fill().then_some(true),
                        requires_feishu: form.requires_feishu().then_some(true),
                        fields: form.fields(),
                    },
                    tool: TOOL_TRANSITION_NODE,
                    args,
                    expect: Expectation::NodeNot {
                        node_key: node_key.clone(),
                        status: status.clone(),
                    },
                    ledger_kind: "node_confirm",
                    target: node_key,
                    form,
                });
            }
            // 未开始的节点没有任何动作：没有「跳级」接口，硬给一个按钮就是给用户挖坑。
            "not_started" => {}
            _ => {
                args.insert("action".to_string(), json!("rollback"));
                out.push(DiscoveredAction {
                    view: WorkflowAction {
                        id: format!("node:rollback:{node_key}"),
                        label: format!("回滚节点「{name}」"),
                        kind: ActionKind::Node,
                        description: Some("节点已完成，回滚后可重新处理".into()),
                        disabled_reason: None,
                        manual_fill_required: None,
                        requires_feishu: None,
                        // 回滚原因是工具要求（action=rollback 必须给），本端能填，所以开放。
                        fields: vec![WorkflowField {
                            key: "rollback_reason".to_string(),
                            label: "回滚原因".to_string(),
                            kind: FieldKind::Textarea,
                            required: true,
                            options: vec![],
                            settings: FieldSettings::default(),
                        }],
                    },
                    tool: TOOL_TRANSITION_NODE,
                    args,
                    // 判据是「状态相对发现时变了」：实测已完成节点不带 status，
                    // 回滚成功后它重新变成 doing，这个变化是肉眼可核的。
                    expect: Expectation::NodeNot {
                        node_key: node_key.clone(),
                        status,
                    },
                    ledger_kind: "node_rollback",
                    target: node_key,
                    form: editing::NodeForm::default(),
                });
            }
        }
    }
    Ok(out)
}

/// 状态流动作：`get_transitable_states` 给了几条合法流转，就有几个动作。
async fn state_entries(
    session: &Session,
    id: &WorkItemId,
    detail: &crate::detail::ItemDetail,
    fresh: bool,
) -> Result<Vec<DiscoveredAction>, BackendError> {
    let (project_key, type_key, work_item_id) = id.key_tuple();
    let states = session.read_tool(
        TOOL_GET_TRANSITABLE_STATES,
        &state_lookup_args(session, id)?,
    ).await?;
    let current = states
        .get("state_name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let source_state = states["state_key"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| BackendError::parse("可流转状态", "缺少当前状态 key"))?;
    let mut configs = None;
    let transitions = states.get("transition").and_then(Value::as_array).cloned().unwrap_or_default();
    let targets: BTreeSet<_> = transitions.iter().filter(|t| t.get("id").is_some()).filter_map(|t| t["state_key"].as_str()).collect();
    let required_targets: BTreeMap<_, _> = stream::iter(targets.into_iter().map(|key| async {
        Ok::<_, BackendError>((key.to_owned(), required_value_async(session, &project_key, &type_key, &work_item_id, key).await?))
    })).buffer_unordered(crate::mcp::scheduler::MAX_PENDING_READS).try_collect().await?;

    let mut out = Vec::new();
    for transition in states
        .get("transition")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(id_value) = transition.get("id").cloned() else {
            continue;
        };
        let Some(target_key) = transition.get("state_key").and_then(Value::as_str) else {
            continue;
        };
        let target_name = transition
            .get("state_name")
            .and_then(Value::as_str)
            .unwrap_or(target_key)
            .to_string();

        let required = &required_targets[target_key];
        let needs_form = ["form_items", "node_fields"].iter().any(|k| {
            required[*k]
                .as_array()
                .is_some_and(|rows| rows.iter().any(|r| r["finished"] != true))
        }) || transition["confirm_form"].as_array().is_some_and(|rows|
            rows.iter().any(|row| row["class"] == "field"));
        let form = if !needs_form {
            editing::NodeForm::default()
        } else {
            let configs = match &configs {
                Some(c) => c,
                None => configs.insert(
                    editing::work_field_configs(session, &project_key, &type_key, fresh).await.map_err(|e| {
                        BackendError::parse("状态表单字段配置", e.safe_message(None))
                    })?,
                ),
            };
            editing::NodeForm::build_state(transition, required, configs, &detail.data)?
        };
        let (transition_id, transition_id_text) = normalize_transition_id(&id_value);
        let mut args = write_args(&project_key, &work_item_id);
        args.insert("transition_id".to_string(), transition_id.clone());
        out.push(DiscoveredAction {
            view: WorkflowAction {
                // 动作 id 直接用服务端给的流转 id：中途换标识就是自找对不上。
                id: format!("state:{transition_id_text}:{target_key}"),
                label: format!("流转到「{target_name}」"),
                kind: ActionKind::State,
                description: if current.is_empty() {
                    None
                } else {
                    Some(format!("当前状态：{current}"))
                },
                disabled_reason: block_reason("流转", &form.blocked),
                manual_fill_required: form.requires_manual_fill().then_some(true),
                requires_feishu: form.requires_feishu().then_some(true),
                fields: form.fields(),
            },
            tool: TOOL_TRANSITION_STATE,
            args,
            expect: Expectation::StateIs {
                from: source_state.to_string(),
                target: target_key.to_string(),
            },
            ledger_kind: "state_transition",
            target: target_key.to_string(),
            form,
        });
    }
    Ok(out)
}

fn node_field_labels(node: &Value) -> BTreeMap<String, String> {
    let mut labels = BTreeMap::new();
    for item in node
        .get("form_items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if let (Some(key), Some(name)) = (
            item.get("field_key").and_then(Value::as_str),
            item.get("field_name").and_then(Value::as_str),
        ) {
            labels.insert(key.to_string(), name.to_string());
        }
    }
    labels
}

/// 目标节点/状态上还缺哪些必填项（人话名字，去重、稳定序）。
///
/// 读不到必填项时**不返回空列表**而是报错：未知不等于没有，
/// 把「未知」当「无必填」就是给用户开一个必然失败的按钮。
fn required_value(
    session: &Session,
    project_key: &str,
    type_key: &str,
    work_item_id: &str,
    state_key: &str,
) -> Result<Value, BackendError> {
    crate::remote::runtime()?.block_on(required_value_async(session, project_key, type_key, work_item_id, state_key))
}

async fn required_value_async(
    session: &Session, project_key: &str, type_key: &str, work_item_id: &str, state_key: &str,
) -> Result<Value, BackendError> {
    // 入参单独组装：写接口那套（node_id / transition_id）一个都不带过来——
    // 网关对未声明字段的处理未经验证，不把「请求能不能成」交给运气。
    let mut args = read_args(project_key, type_key, work_item_id);
    args.insert("state_key".to_string(), json!(state_key));
    // mode=unfinished：只回未完成的必填项，正是这里要的判据。
    args.insert("mode".to_string(), json!("unfinished"));
    let value = session
        .read_tool(TOOL_GET_TRANSITION_REQUIRED, &args).await
        .map_err(|e| e.with_permission_detected())
        .map_err(|e| {
            BackendError::parse(
                "required_fields",
                format!(
                    "无法确认「{state_key}」的必填项，因此不提供该动作：{}",
                    e.safe_message(None)
                ),
            )
        })?;
    parse_required_value(value)
}

/// `mode=unfinished` 的空结果会省略数组，返回 `{}`（issue 7140568716 实测）。
/// 只兼容这个明确的空对象；非空未知结构仍然报错，不能当作没有必填项。
fn parse_required_value(value: Value) -> Result<Value, BackendError> {
    if value.as_object().is_some_and(Map::is_empty) {
        return Ok(value);
    }
    if !["node_fields", "form_items"]
        .iter()
        .any(|k| value.get(k).is_some_and(Value::is_array))
    {
        return Err(BackendError::parse(
            "required_fields",
            "缺少必填项数组，无法确认完整性",
        ));
    }
    if ["node_fields", "form_items"]
        .iter()
        .any(|k| value.get(k).is_some_and(|rows| !rows.is_array()))
    {
        return Err(BackendError::parse("required_fields", "必填项不是数组"));
    }
    for container in ["node_fields", "form_items"] {
        if let Some(rows) = value[container].as_array() {
            for row in rows {
                if !row.is_object()
                    || (row["finished"] != true
                        && !["key", "field_key"]
                            .iter()
                            .any(|key| row[*key].as_str().is_some_and(|s| !s.trim().is_empty())))
                {
                    return Err(BackendError::parse("required_fields", "必填项缺少字段 key"));
                }
            }
        }
    }
    Ok(value)
}

/// 归一化两种响应形状：状态流 `form_items[].key`、节点流 `node_fields[].field_key`。
fn unfinished_names(value: &Value, labels: &BTreeMap<String, String>) -> Result<Vec<String>, BackendError> {
    editing::NodeForm::unfinished_names(value, labels)
}

/// 必填项没填完 → 禁用原因；没有缺失 → `None`（动作可执行）。
fn block_reason(verb: &str, unfinished: &[String]) -> Option<String> {
    if unfinished.is_empty() {
        return None;
    }
    Some(format!(
        "{verb}前有暂不支持填写的必填项：{}。请在飞书补齐后重新读取动作。",
        unfinished.join("、")
    ))
}

/// 快照与状态流动作沿用的归一排序。
fn snapshot_entry_order(a: &DiscoveredAction, b: &DiscoveredAction) -> std::cmp::Ordering {
    let a_off = a.view.disabled_reason.is_some();
    let b_off = b.view.disabled_reason.is_some();
    a_off.cmp(&b_off).then_with(|| a.view.id.cmp(&b.view.id))
}

/// 快照指纹：动作清单或写入参数一变就变，界面持有的版本因此不可能对上新状态。
fn fingerprint(entries: &[DiscoveredAction]) -> String {
    // 保留原有指纹输入归一规则，展示排序不改变执行快照的版本。
    let mut entries: Vec<_> = entries.iter().collect();
    entries.sort_by(|a, b| snapshot_entry_order(a, b));
    let mut canonical = String::new();
    for entry in entries {
        // serde_json 的 Map 是有序 map，同一份内容序列化结果稳定。
        let args = serde_json::to_string(&entry.args).unwrap_or_default();
        let disabled = entry.view.disabled_reason.clone().unwrap_or_default();
        canonical.push_str(&serde_json::to_string(&entry.form).unwrap_or_default());
        canonical.push_str(&serde_json::to_string(&entry.expect).unwrap_or_default());
        canonical.push_str(&format!(
            "{}\u{1}{}\u{1}{}\u{1}{args}\n",
            entry.view.id, entry.view.label, disabled
        ));
    }
    format!("v1:{:016x}", fnv1a64(&canonical))
}

/// FNV-1a 64 位。只当快照指纹用（比对用），不是安全散列，所以不引第三方依赖。
fn fnv1a64(text: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in text.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

// ---------------------------------------------------------------- 执行

// 在重新发现动作之前占用事项，避免同进程的不同 request_id 同时使用旧快照。
static EXECUTING_ITEMS: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());
struct ItemExecution(String);
impl ItemExecution {
    fn acquire(id: &WorkItemId) -> Result<Self, BackendError> {
        let key = item_key(id);
        if !EXECUTING_ITEMS
            .lock()
            .expect("workflow mutex poisoned")
            .insert(key.clone())
        {
            return Err(BackendError::conflict(
                "该事项已有提交正在执行，请等待结果后再操作",
            ));
        }
        Ok(Self(key))
    }
}
impl Drop for ItemExecution {
    fn drop(&mut self) {
        EXECUTING_ITEMS
            .lock()
            .expect("workflow mutex poisoned")
            .remove(&self.0);
    }
}

/// 字段更新和推进不能组成事务；明确区分在哪个阶段停止，禁止越过未核验的字段。
enum SubmissionError {
    FieldWrite(BackendError),
    FieldCheck(FieldCheckFailure),
    Transition(BackendError),
}

struct FieldCheckFailure {
    error: BackendError,
    fields_saved: bool,
}

impl From<BackendError> for FieldCheckFailure {
    fn from(error: BackendError) -> Self {
        Self {
            error,
            fields_saved: false,
        }
    }
}

fn submit_with_fields(
    calls: &[(&str, Map<String, Value>)],
    mut update: impl FnMut(&str, &Map<String, Value>) -> Result<Value, BackendError>,
    check: impl FnOnce() -> Result<(), FieldCheckFailure>,
    advance: impl FnOnce() -> Result<Value, BackendError>,
) -> Result<Value, SubmissionError> {
    if !calls.is_empty() {
        for (tool, args) in calls {
            update(tool, args).map_err(SubmissionError::FieldWrite)?;
        }
        check().map_err(SubmissionError::FieldCheck)?;
    }
    advance().map_err(SubmissionError::Transition)
}

/// 字段更新之后，原状态和所选流转必须仍然成立；这里只读，不重新生成用户表单。
fn check_state_transition(states: &Value, entry: &DiscoveredAction) -> Result<(), BackendError> {
    let Expectation::StateIs { from, target } = &entry.expect else {
        return Err(BackendError::validation("此动作不是状态流转"));
    };
    if states["state_key"].as_str() != Some(from.as_str()) {
        return Err(BackendError::conflict(
            "字段保存期间状态已变化，未发送流转请求",
        ));
    }
    let available = states["transition"].as_array().is_some_and(|rows| {
        rows.iter().any(|row| {
            row["state_key"].as_str() == Some(target.as_str())
                && normalize_transition_id(&row["id"]).0 == entry.args["transition_id"]
        })
    });
    if !available {
        return Err(BackendError::conflict(
            "字段保存后所选流转已不可用，未发送流转请求",
        ));
    }
    Ok(())
}

fn check_updated_fields(
    session: &Session,
    request: &WorkflowRequest,
    entry: &DiscoveredAction,
    plan: &editing::UpdatePlan,
) -> Result<(), FieldCheckFailure> {
    let (project, type_key, item) = request.item_id.key_tuple();
    let mut values = plan.fields.clone();
    if matches!(entry.ledger_kind, "node_progress" | "node_schedule") {
        // 未改字段也要回读；排期两端及节点状态必须全部符合本次核对值。
        for field in &entry.view.fields {
            values.entry(field.key.clone()).or_insert_with(|| {
                field.settings.initial_value.clone().unwrap_or_default()
            });
        }
    }
    let work = if plan.has_work_fields() {
        Some(session.refresh_item_detail_fresh(&request.item_id)?)
    } else {
        None
    };
    let mut checked_node = None;
    let labels = match &entry.expect {
        Expectation::StateIs { .. } => {
            entry.form.verify(
                &Value::Null,
                work.as_ref().map(|d| &d.data),
                &values,
            )?;
            BTreeMap::new()
        }
        Expectation::NodeNot { .. } => {
            let nodes = fetch_nodes(session, &project, &type_key, &item)?;
            let node = nodes
                .iter()
                .find(|n| node_key_of(n) == entry.target)
                .ok_or_else(|| BackendError::conflict("字段提交后未找到原节点"))?;
            if node_status_of(node) != "doing" {
                return Err(
                    BackendError::conflict("字段提交期间节点已被其他人推进，未重复推进").into(),
                );
            }
            entry
                .form
                .verify(node, work.as_ref().map(|d| &d.data), &values)?;
            checked_node = Some(node.clone());
            node_field_labels(node)
        }
    };
    if matches!(entry.ledger_kind, "node_progress" | "node_schedule") {
        return Ok(());
    }
    let ready = (|| -> Result<(), BackendError> {
        let required = required_value(session, &project, &type_key, &item, &entry.target)?;
        let remaining = unfinished_names(&required, &labels)?;
        if !remaining.is_empty() {
            if let Some(node) = &checked_node {
                let (nc, wc) = crate::remote::runtime()?.block_on(editing::field_configs(session, &project, &type_key, false))?;
                let form = editing::NodeForm::build(node, &required, &nc, &wc,
                    work.as_ref().map(|detail| &detail.data).unwrap_or(&Value::Null))?;
                if form.has_page_required() {
                    let name = node["basic"]["name"].as_str().unwrap_or(&entry.target);
                    return Err(BackendError::workflow_blocked(form.node_block_reason(name).unwrap()));
                }
            }
            return Err(BackendError::validation(format!(
                "仍缺必填项：{}",
                remaining.join("、")
            )));
        }
        if matches!(entry.expect, Expectation::StateIs { .. }) {
            let states = session.call_read_tool(
                TOOL_GET_TRANSITABLE_STATES,
                &state_lookup_args(session, &request.item_id)?,
            )?;
            check_state_transition(&states, entry)?;
        }
        Ok(())
    })();
    ready.map_err(|error| FieldCheckFailure {
        error,
        fields_saved: true,
    })
}

/// 执行一个动作。
///
/// 顺序是刻意的：**重新发现 → 版本比对 → 必填校验 → 幂等登记 → 写 → 回读核验**。
/// 版本比对放在写之前，因为界面里的动作清单可能已经陈旧；
/// 幂等登记放在写之前，因为超时后我们再也拿不到第二个「到底改没改」的证据。
pub fn execute(
    session: &Session,
    request: &WorkflowRequest,
) -> Result<WorkflowResult, BackendError> {
    if request.request_id.trim().is_empty() {
        return Err(BackendError::validation(
            "request_id 不能为空：它是幂等键，缺了就无从去重",
        ));
    }
    let _execution = ItemExecution::acquire(&request.item_id)?;
    let detail_access = crate::remote::runtime()?.block_on(crate::item_access::lock_workflow(&session.store, &request.item_id));
    let discovery = discover_with_freshness(session, &request.item_id, true)?;
    if discovery.version != request.version {
        return Err(BackendError::conflict(format!(
            "远端流程已变化（当前 {}，界面持有 {}），请重新读取动作后再执行",
            discovery.version, request.version
        )));
    }
    let entry = discovery
        .entries
        .iter()
        .find(|e| e.view.id == request.action_id)
        .ok_or_else(|| {
            BackendError::validation(format!(
                "动作 {} 在当前流程里已不存在（可能刚被别人推进过），未执行",
                request.action_id
            ))
        })?;
    if let Some(reason) = &entry.view.disabled_reason {
        if entry.form.has_page_required() {
            return Err(BackendError::workflow_blocked(reason.clone()));
        }
        return Err(BackendError::validation(format!(
            "动作「{}」当前不可执行：{reason}",
            entry.view.label
        )));
    }

    // 不认识的字段先拒掉：悄悄丢掉用户填的内容，等于假装执行成功了。
    if let Some(unknown) = request
        .fields
        .keys()
        .find(|key| !entry.view.fields.iter().any(|f| &f.key == *key))
    {
        return Err(BackendError::validation(format!(
            "动作「{}」不接受字段 {unknown}，未执行",
            entry.view.label
        )));
    }
    let mut args = entry.args.clone();
    for field in &entry.view.fields {
        if field.settings.read_only == Some(true) { continue; }
        let value = request
            .fields
            .get(&field.key)
            .map(String::as_str)
            .or(field.settings.initial_value.as_deref())
            .map(|v| v.trim())
            .unwrap_or("");
        if value.is_empty() {
            if field.required {
                return Err(BackendError::validation(format!(
                    "必填字段「{}」不能为空，未执行",
                    field.label
                )));
            }
            continue;
        }
        if field.kind == FieldKind::Select && !field.options.iter().any(|o| o.value == value) {
            return Err(BackendError::validation(format!(
                "字段「{}」的值 {value} 不在允许选项内，未执行",
                field.label
            )));
        }
        if field.key == "rollback_reason" {
            args.insert(field.key.clone(), json!(value));
        }
    }
    let plan = if entry.ledger_kind == "node_schedule" {
        entry.form.schedule_plan(&request.fields)?
    } else {
        entry.form.plan(&request.fields)?
    };

    // 幂等登记：这一步之前，本次调用一个字节的写请求都没发出去。
    let record = ActionRecord {
        request_id: request.request_id.clone(),
        item_id: item_key(&request.item_id),
        action_kind: entry.ledger_kind.to_string(),
        target: entry.target.clone(),
        version: discovery.version.clone(),
        status: "pending".to_string(),
        verified: false,
        detail: None,
        created_at: now_ms(),
        finished_at: None,
    };
    if !session.store.begin_action(&record)? {
        return Err(BackendError::conflict(
            "这个请求已提交过，或该事项另有写入尚未结束；不会交错发起写操作，请先核对远端状态与本地动作记录",
        ));
    }

    session.store.mark_detail_refresh(&request.item_id)?;

    // 错误文本落库/回显前用凭证擦一遍（与同步台账同一套规矩）。
    let secret = session
        .credential()
        .ok()
        .map(|c| c.token().expose().to_string());
    // 收尾台账。写请求**已经发出去之后**，台账记不记得上都不能改变结论：把「结果不确定」
    // 换成一个普通错误，等于藏掉最该说的那句话，还顺手把用户推向重试写入。
    // 所以台账失败只回一句要贴在结论后面的说明，不把结论顶掉。
    let finish = |status: &str, verified: bool, detail: Option<String>| -> String {
        match session.store.finish_action(
            &request.request_id,
            status,
            verified,
            detail.as_deref(),
            now_ms(),
        ) {
            Ok(()) => String::new(),
            Err(e) => format!(
                "（本地动作台账未能记录：{}）",
                e.safe_message(secret.as_deref())
            ),
        }
    };

    // 数据库占用覆盖共用缓存的进程；占用后再核对，避免发现与登记之间的旧快照。
    let current = discover_with_freshness(session, &request.item_id, true).and_then(|latest| {
        if latest.version == request.version {
            Ok(())
        } else {
            Err(BackendError::conflict(
                "登记提交期间远端节点或字段已变化，本次未发送写入，请重新核对草稿",
            ))
        }
    });
    if let Err(error) = current {
        let note = finish("failed", false, Some(error.safe_message(secret.as_deref())));
        if !note.is_empty() {
            return Err(BackendError::conflict(format!(
                "本次未发送写入，但提交记录未能结束，请先核对本地动作记录。{note}"
            )));
        }
        return Err(error);
    }

    let (project, _, item) = request.item_id.key_tuple();
    let calls = plan.calls(&project, &item, &entry.target);
    if entry.ledger_kind == "node_schedule" {
        // 排期仅产生一次节点更新；无论回执能否识别，最终结果都由两端日期回读决定。
        let receipt_error = calls.iter().try_for_each(|(tool, args)| {
            session.call_tool_any(tool, args, true).map(|_| ())
        }).err().map(|error| error.safe_message(secret.as_deref()));
        match check_updated_fields(session, request, entry, &plan) {
            Ok(()) => {
                let note = finish("verified", true, receipt_error);
                drop(detail_access);
                let resynced = session.sync_personal_todos(None, crate::store::RunTrigger::Manual).is_ok();
                return Ok(WorkflowResult {
                    outcome: ActionOutcome::Verified,
                    verified: true,
                    message: format!("开始和结束日期已同步到飞书并回读确认，当前节点保持进行中。{}{note}",
                        if resynced { "本地缓存已刷新。" } else { "本地缓存暂未刷新，下次同步会更新。" }),
                    request_id: request.request_id.clone(),
                    action_id: entry.view.id.clone(),
                    resynced,
                });
            }
            Err(failure) => {
                let detail = failure.error.safe_message(secret.as_deref());
                let ledger_detail = receipt_error.map(|receipt| format!("{receipt}；{detail}"))
                    .unwrap_or_else(|| detail.clone());
                let note = finish("unknown", false, Some(ledger_detail));
                return Ok(WorkflowResult {
                    outcome: ActionOutcome::Unknown,
                    verified: false,
                    message: format!("日期同步结果不确定，尚未发送流程推进请求：{detail}。草稿已保留，请先核对飞书后再处理。{note}"),
                    request_id: request.request_id.clone(),
                    action_id: entry.view.id.clone(),
                    resynced: false,
                });
            }
        }
    }
    let submitted = if entry.ledger_kind == "node_progress" && calls.is_empty() {
        check_updated_fields(session, request, entry, &plan)
            .map(|_| Value::Null)
            .map_err(SubmissionError::FieldCheck)
    } else { submit_with_fields(
        &calls,
        |tool, args| session.call_tool_any(tool, args, true),
        || check_updated_fields(session, request, entry, &plan),
        || {
            if entry.ledger_kind == "node_progress" {
                Ok(Value::Null)
            } else {
                session.call_tool_any(entry.tool, &args, true)
            }
        },
    ) };
    let transition = match submitted {
        Err(failure @ (SubmissionError::FieldWrite(_) | SubmissionError::FieldCheck(_))) => {
            let (e, progress, write_failed) = match failure {
                SubmissionError::FieldWrite(e) => (e, "字段提交结果尚待核实", true),
                SubmissionError::FieldCheck(failure) => (
                    failure.error,
                    if failure.fields_saved {
                        "字段已保存并回读确认"
                    } else {
                        "字段保存结果尚未通过核验"
                    },
                    false,
                ),
                SubmissionError::Transition(_) => unreachable!(),
            };
            let detail = e.safe_message(secret.as_deref());
            let note = finish("unknown", false, Some(detail.clone()));
            let feedback = if write_failed {
                match e.kind() {
                    ErrorKind::Permission => "飞书拒绝了字段修改权限，请核对应用所用账号的权限",
                    ErrorKind::Auth | ErrorKind::Credential => "连接认证未通过，请检查连接设置",
                    _ => "暂时无法确认飞书是否已保存字段",
                }
            } else { &detail };
            return Ok(WorkflowResult{outcome:ActionOutcome::Unknown,verified:false,message:format!("{progress}，尚未发送流程推进请求：{feedback}。草稿已保留，请先核对飞书后再处理。{note}"),request_id:request.request_id.clone(),action_id:entry.view.id.clone(),resynced:false});
        }
        Err(SubmissionError::Transition(e)) => Err(e),
        Ok(value) => Ok(value),
    };
    if entry.ledger_kind == "node_progress" {
        // 字段值与节点仍为 doing 已由 check_updated_fields 回读确认。
        let note = finish("verified", true, None);
        drop(detail_access);
        let resynced = session
            .sync_personal_todos(None, crate::store::RunTrigger::Manual)
            .is_ok();
        return Ok(WorkflowResult {
            outcome: ActionOutcome::Verified,
            verified: true,
            message: format!("进度已同步到飞书并回读确认，当前节点保持进行中。{}{note}",
                if resynced { "本地缓存已刷新。" } else { "本地缓存暂未刷新，下次同步会更新。" }),
            request_id: request.request_id.clone(),
            action_id: entry.view.id.clone(),
            resynced,
        });
    }
    let saved_note = if calls.is_empty() {
        ""
    } else {
        "字段已保存并回读确认。"
    };
    // 写入回执与业务结果分开处理：回执异常留在台账，最终结论只取决于远端回读。
    let receipt_error = transition.err().map(BackendError::with_permission_detected);
    let permission_denied = receipt_error
        .as_ref()
        .is_some_and(|error| error.kind() == ErrorKind::Permission);
    let receipt_error = receipt_error.map(|error| error.safe_message(secret.as_deref()));
    // 权限原文保留在动作台账；通知说明应用账号与网页账号可能不同，不把内部错误直接铺给用户。
    let permission_message = |readback: &str| format!(
        "{saved_note}飞书返回权限不足：应用所用凭证对应的账号无法执行「{}」。\
         请核对该账号是否与飞书页面的操作账号一致，并使用有权限账号的凭证。\
         {readback}，结果不确定。草稿已保留，请先在飞书核对状态，不要直接重试；本次不会自动重放写入。",
        entry.view.label
    );
    match verify(session, &request.item_id, &entry.expect) {
        Ok(true) => {
            let note = finish("verified", true, receipt_error);
            drop(detail_access);
            let resynced = session
                .sync_personal_todos(None, crate::store::RunTrigger::Manual)
                .is_ok();
            Ok(WorkflowResult {
                outcome: ActionOutcome::Verified,
                verified: true,
                message: format!(
                    "「{}」已执行，回读确认远端状态已变化。{}{note}",
                    entry.view.label,
                    if resynced {
                        "本地缓存已刷新。"
                    } else {
                        "本地缓存暂未刷新，下次同步会更新。"
                    }
                ),
                request_id: request.request_id.clone(),
                action_id: entry.view.id.clone(),
                resynced,
            })
        }
        Ok(false) => {
            let detail = match receipt_error {
                Some(error) => format!("{error}；回读未确认预期状态"),
                None => "工具返回成功，但回读未见状态变化".to_string(),
            };
            let note = finish("unknown", false, Some(detail.clone()));
            Ok(WorkflowResult {
                outcome: ActionOutcome::Unknown,
                verified: false,
                message: if permission_denied {
                    format!("{}{note}", permission_message("回读尚未确认流程已推进"))
                } else {
                    format!(
                        "{saved_note}「{}」的写入结果不确定（{detail}）。草稿已保留，\
                         请先在飞书端确认，不要直接重试；本次不会自动重放写入。{note}",
                        entry.view.label
                    )
                },
                request_id: request.request_id.clone(),
                action_id: entry.view.id.clone(),
                resynced: false,
            })
        }
        Err(e) => {
            let readback_error = e.safe_message(secret.as_deref());
            let detail = match receipt_error {
                Some(error) => format!("{error}；回读核验失败：{readback_error}"),
                None => format!("回读核验失败：{readback_error}"),
            };
            let note = finish("unknown", false, Some(detail.clone()));
            Ok(WorkflowResult {
                outcome: ActionOutcome::Unknown,
                verified: false,
                message: if permission_denied {
                    format!("{}{note}", permission_message("远端状态回读失败"))
                } else {
                    format!(
                        "{saved_note}「{}」的写入已发出，但{detail}。结果不确定，草稿已保留，\
                         请先在飞书端确认，不要直接重试；本次不会自动重放写入。{note}",
                        entry.view.label
                    )
                },
                request_id: request.request_id.clone(),
                action_id: entry.view.id.clone(),
                resynced: false,
            })
        }
    }
}

/// 台账里事项的主键写法（与 `work_item` 的复合主键同一套三元组）。
fn item_key(id: &WorkItemId) -> String {
    let (project_key, type_key, work_item_id) = id.key_tuple();
    format!("{project_key}|{type_key}|{work_item_id}")
}

/// 回读核验：只有这里说 `true`，才允许对用户声称「已生效」。
fn verify(session: &Session, id: &WorkItemId, expect: &Expectation) -> Result<bool, BackendError> {
    let (project_key, type_key, work_item_id) = id.key_tuple();
    match expect {
        Expectation::StateIs { target, .. } => {
            let states = session.call_read_tool(
                TOOL_GET_TRANSITABLE_STATES,
                &state_lookup_args(session, id)?,
            )?;
            Ok(states.get("state_key").and_then(Value::as_str) == Some(target.as_str()))
        }
        Expectation::NodeNot { node_key, status } => {
            let nodes = fetch_nodes(session, &project_key, &type_key, &work_item_id)?;
            let observed = nodes.iter().find(|node| node_key_of(node) == *node_key);
            // 节点从响应里整个消失也按「没核验上」处理：不知道它变成了什么，就不能声称成功。
            Ok(observed.is_some_and(|node| node_status_of(node) != *status))
        }
    }
}

/// 组装 `get_transitable_states` 的入参。
///
/// 这个工具硬性要求一个非空 `node_id`，但对状态流工作项它并不参与判定：实测给
/// issue 1000000002 传故事节点用的 `state_11`，服务端仍按该事项**当前真实状态**
/// （`RESOLVED`）回流转表。而 `list_todo` 对状态流给的 `state_info` 两个键名都是空串、
/// 对节点流给的 `node_state_key` 其实是 node_uuid——缓存里根本没有可用的状态 key。
/// 所以这里缓存有值就用、没有就拿 work_item_id 过参数校验：
/// 这个入参既不参与判定，也不进写请求（写只用 `transition_id`），最坏情况是读失败并被如实报出。
fn state_lookup_args(
    session: &Session,
    id: &WorkItemId,
) -> Result<Map<String, Value>, BackendError> {
    let (project_key, type_key, work_item_id) = id.key_tuple();
    let mut args = read_args(&project_key, &type_key, &work_item_id);
    let node_id = session
        .store
        .current_flow_key(id)?
        .unwrap_or_else(|| work_item_id.clone());
    args.insert("node_id".to_string(), json!(node_id));
    Ok(args)
}

#[cfg(test)]
#[path = "workflow_performance_tests.rs"]
mod performance_tests;

#[cfg(test)]
#[path = "workflow_progress_tests.rs"]
mod progress_tests;

#[cfg(test)]
#[path = "workflow_concurrency_tests.rs"]
mod concurrency_tests;

#[cfg(test)]
#[path = "workflow_schedule_tests.rs"]
mod schedule_tests;

#[cfg(test)]
#[path = "workflow_transition_tests.rs"]
mod transition_tests;

#[cfg(test)]
#[path = "workflow_compound_tests.rs"]
mod compound_tests;

#[cfg(test)]
mod tests {
    // 固定事项、流转与字段标识均为合成 fixture，保持字符串 / 数字类型和相互引用。
    use super::*;

    #[test]
    fn same_item_execution_is_exclusive_and_released_on_drop() {
        let id = WorkItemId {
            project_key: Some("lock-test".into()),
            work_item_type_key: Some("story".into()),
            work_item_id: "1".into(),
        };
        let first = ItemExecution::acquire(&id).unwrap();
        assert!(ItemExecution::acquire(&id).is_err());
        let other = WorkItemId {
            project_key: Some("other-lock-test".into()),
            ..id.clone()
        };
        assert!(ItemExecution::acquire(&other).is_ok());
        drop(first);
        assert!(ItemExecution::acquire(&id).is_ok());
    }

    fn labels() -> BTreeMap<String, String> {
        BTreeMap::from([
            ("field_fixture".to_string(), "详情描述".to_string()),
            ("actual_work_time".to_string(), "实际工时".to_string()),
        ])
    }

    #[test]
    fn empty_required_response_allows_state_transition() {
        // issue 7140568716 → IN PROGRESS：all/finished 返回 finished=true 的角色项，
        // unfinished 则返回 {}。无未完成必填项时应能加载并启用流转动作。
        let required = parse_required_value(json!({})).unwrap();
        let unfinished = unfinished_names(&required, &labels()).unwrap();
        assert!(unfinished.is_empty());
        assert_eq!(block_reason("流转", &unfinished), None);
    }

    #[test]
    fn required_arrays_keep_missing_fields_blocked() {
        let required = json!({"form_items": [{"key": "field_fixture", "finished": false}]});
        let parsed = parse_required_value(required.clone()).unwrap();
        assert_eq!(parsed, required);
        let unfinished = unfinished_names(&parsed, &labels()).unwrap();
        assert_eq!(unfinished, vec!["详情描述".to_string()]);
        assert!(block_reason("流转", &unfinished).is_some());
        for empty in [json!({"form_items": []}), json!({"node_fields": []})] {
            let parsed = parse_required_value(empty).unwrap();
            assert!(unfinished_names(&parsed, &labels()).unwrap().is_empty());
        }
    }

    #[test]
    fn unknown_required_response_still_fails_closed() {
        for value in [
            Value::Null,
            json!([]),
            json!({"form_items": null}),
            json!({"node_fields": {}}),
            json!({"data": {"form_items": []}}),
            json!({"error": "permission denied"}),
        ] {
            let error = parse_required_value(value).unwrap_err();
            assert_eq!(error.kind(), ErrorKind::Parse);
            assert!(error.to_string().contains("required_fields"));
        }
    }

    #[test]
    fn state_shape_and_node_shape_are_normalised_to_names() {
        // 实测两种响应形状：状态流给 form_items[].key，节点流给 node_fields[].field_key。
        let state = json!({"form_items": [{"class": "field", "field_type_key": "text", "finished": false, "key": "field_fixture"}]});
        // 节点流：schedule / point / actual_work_time 正是 state_fixture 实测未完成的三个字段。
        let node = json!({"node_fields": [
            {"field_key": "actual_work_time", "field_type_key": "number"},
            {"field_key": "schedule", "field_type_key": "schedule"},
            {"field_key": "point", "field_type_key": "number", "finished": true}
        ]});
        assert_eq!(
            unfinished_names(&state, &labels()).unwrap(),
            vec!["详情描述".to_string()]
        );
        // 认识的键翻成中文名（去重后只剩一个），不认识的键原样保留，finished=true 的不算缺失。
        assert_eq!(
            unfinished_names(&node, &labels()).unwrap(),
            vec!["schedule".to_string(), "实际工时".to_string()]
        );
    }

    #[test]
    fn missing_finished_flag_counts_as_unfinished() {
        // 服务端没写 finished 时按未完成算：宁可少给动作，不可给一个必然失败的按钮。
        let value = json!({"form_items": [{"key": "field_fixture"}]});
        assert_eq!(
            unfinished_names(&value, &labels()).unwrap(),
            vec!["详情描述".to_string()]
        );
        assert_eq!(
            unfinished_names(&json!({}), &labels()).unwrap(),
            Vec::<String>::new()
        );
    }

    #[test]
    fn block_reason_names_every_missing_field() {
        assert_eq!(block_reason("完成", &[]), None);
        let reason =
            block_reason("流转", &["详情描述".to_string(), "解决结果".to_string()]).unwrap();
        assert!(reason.contains("详情描述") && reason.contains("解决结果"));
        assert!(reason.contains("暂不支持填写"));
    }

    #[test]
    fn flow_absent_only_accepts_business_tool_error() {
        let tool = BackendError::Tool {
            tool: "get_transitable_states".into(),
            code: None,
            message: "flow mode not state flow".into(),
        };
        assert!(flow_absent(&tool), "业务拒绝才说明这条通路不存在");
        assert!(
            !flow_absent(&BackendError::permission("无权限")),
            "权限问题绝不能被当成没有流程"
        );
        assert!(!flow_absent(&BackendError::validation("缺身份")));
    }

    fn entry(id: &str, args: Value, disabled: Option<String>) -> DiscoveredAction {
        DiscoveredAction {
            view: WorkflowAction {
                id: id.to_string(),
                label: "x".to_string(),
                kind: ActionKind::Node,
                description: None,
                disabled_reason: disabled,
                manual_fill_required: None,
                requires_feishu: None,
                fields: vec![],
            },
            tool: TOOL_TRANSITION_NODE,
            args: args.as_object().unwrap().clone(),
            expect: Expectation::StateIs {
                from: "OPEN".into(),
                target: "CLOSED".into(),
            },
            ledger_kind: "node_confirm",
            target: "state_11".into(),
            form: editing::NodeForm::default(),
        }
    }

    fn node_display_entry(id: &str, kind: &'static str) -> DiscoveredAction {
        let mut action = entry(id, json!({"node_id":id}), None);
        action.ledger_kind = kind;
        action.expect = Expectation::NodeNot { node_key: id.into(),
            status: if kind == "node_rollback" { "finished" } else { "doing" }.into() };
        action
    }

    #[test]
    fn node_display_prioritizes_current_completion_and_preserves_remote_order_in_each_group() {
        let mut page_completion = node_display_entry("node:confirm:z", "node_confirm");
        page_completion.view.label = "技术方案评审".into();
        page_completion.view.disabled_reason = Some("需在飞书页面处理".into());
        page_completion.view.requires_feishu = Some(true);
        page_completion.view.manual_fill_required = Some(true);
        let mut local_completion = node_display_entry("node:confirm:a", "node_confirm");
        local_completion.view.label = "产品验收".into();
        let entries = vec![
            node_display_entry("node:rollback:z", "node_rollback"),
            node_display_entry("node:progress:z", "node_progress"),
            node_display_entry("node:schedule:z", "node_schedule"),
            page_completion,
            node_display_entry("node:rollback:a", "node_rollback"),
            node_display_entry("node:schedule:a", "node_schedule"),
            local_completion,
            node_display_entry("node:progress:a", "node_progress"),
        ];
        let original_ids: Vec<_> = entries.iter().map(|entry| entry.view.id.clone()).collect();
        let version = fingerprint(&entries);
        let discovery = Discovery { version: version.clone(), item_url: None, entries };
        let options = discovery.options();
        let displayed: Vec<_> = options.actions.iter().map(|action| action.id.as_str()).collect();
        assert_eq!(displayed, vec!["node:confirm:z", "node:confirm:a", "node:progress:z",
            "node:schedule:z", "node:schedule:a", "node:progress:a", "node:rollback:z", "node:rollback:a"]);
        assert_eq!(options.actions[0].requires_feishu, Some(true));
        assert!(options.actions[0].disabled_reason.is_some(), "页面完成动作不因本地不能写入而排在历史回滚后面");
        assert_eq!(options.version, version, "展示排序不修改执行版本");
        assert_eq!(discovery.entries.iter().map(|entry| entry.view.id.clone()).collect::<Vec<_>>(), original_ids);
        let mut reversed = discovery.entries.clone();
        reversed.reverse();
        assert_eq!(fingerprint(&reversed), version, "快照仍使用原disabled/id归一输入，与展示顺序无关");
    }

    #[test]
    fn node_display_keeps_pure_rollback_business_order() {
        let entries = vec![
            node_display_entry("node:rollback:z", "node_rollback"),
            node_display_entry("node:rollback:a", "node_rollback"),
            node_display_entry("node:rollback:m", "node_rollback"),
        ];
        let options = Discovery { version: fingerprint(&entries), item_url: None, entries }.options();
        assert_eq!(options.actions.iter().map(|action| action.id.as_str()).collect::<Vec<_>>(),
            vec!["node:rollback:z", "node:rollback:a", "node:rollback:m"]);
    }

    #[test]
    fn state_display_keeps_existing_availability_then_id_order() {
        let mut entries = Vec::new();
        for (id, disabled) in [("state:z", false), ("state:a", true), ("state:b", false), ("state:c", true)] {
            let mut action = entry(id, json!({"transition_id":id}), disabled.then(|| "当前不可用".into()));
            action.view.kind = ActionKind::State;
            action.ledger_kind = "state_transition";
            action.tool = TOOL_TRANSITION_STATE;
            entries.push(action);
        }
        let options = Discovery { version: fingerprint(&entries), item_url: None, entries }.options();
        assert_eq!(options.actions.iter().map(|action| action.id.as_str()).collect::<Vec<_>>(),
            vec!["state:b", "state:z", "state:a", "state:c"]);
    }

    #[test]
    fn fingerprint_tracks_action_set_and_write_arguments() {
        let base = entry(
            "node:confirm:state_11",
            json!({"node_id": "state_11", "action": "confirm"}),
            None,
        );
        let same = entry(
            "node:confirm:state_11",
            json!({"action": "confirm", "node_id": "state_11"}),
            None,
        );
        assert_eq!(
            fingerprint(&[base.clone()]),
            fingerprint(&[same]),
            "键序不影响指纹"
        );

        let changed_arg = entry(
            "node:confirm:state_11",
            json!({"node_id": "state_12", "action": "confirm"}),
            None,
        );
        assert_ne!(
            fingerprint(&[base.clone()]),
            fingerprint(&[changed_arg]),
            "写入参数变了必须换版本"
        );

        let disabled = entry(
            "node:confirm:state_11",
            json!({"node_id": "state_11", "action": "confirm"}),
            Some("缺必填".into()),
        );
        assert_ne!(
            fingerprint(&[base.clone()]),
            fingerprint(&[disabled]),
            "必填状态变了必须换版本"
        );

        let extra = entry(
            "node:rollback:state_10",
            json!({"node_id": "state_10"}),
            None,
        );
        assert_ne!(
            fingerprint(&[base.clone()]),
            fingerprint(&[base.clone(), extra]),
            "多一个动作必须换版本"
        );
        assert_ne!(
            fingerprint(&[]),
            fingerprint(&[base]),
            "空清单与非空清单不同"
        );
    }

    #[test]
    fn request_shape_matches_the_frontend_contract() {
        let request: WorkflowRequest = serde_json::from_str(
            r#"{"item_id":{"project_key":"p","work_item_type_key":"story","work_item_id":"1000000001"},
                "action_id":"node:confirm:state_fixture","version":"v1:0000000000000000",
                "request_id":"8c9a-1","fields":{}}"#,
        )
        .unwrap();
        assert_eq!(request.action_id, "node:confirm:state_fixture");
        assert_eq!(request.item_id.project_key.as_deref(), Some("p"));

        // 身份缺失在触网之前就被拒（前端也挡一层，但后端不能信前端）。
        let partial: WorkflowRequest = serde_json::from_str(
            r#"{"item_id":{"project_key":null,"work_item_type_key":"story","work_item_id":"1"},
                "action_id":"x","version":"v","request_id":"r","fields":{}}"#,
        )
        .unwrap();
        assert_eq!(
            partial.item_id.project_key, None,
            "缺 project_key 是合法输入形状，由 discover 明确拒绝"
        );
    }

    #[test]
    fn result_serialisation_keeps_the_fields_the_ui_reads() {
        let json = serde_json::to_value(WorkflowResult {
            outcome: ActionOutcome::Unknown,
            verified: false,
            message: "结果不确定".into(),
            request_id: "r".into(),
            action_id: "a".into(),
            resynced: false,
        })
        .unwrap();
        assert_eq!(json["verified"], false);
        assert_eq!(json["outcome"], "unknown");
        assert!(json["message"].as_str().unwrap().contains("不确定"));
    }

    #[test]
    fn action_json_omits_absent_optional_keys() {
        let action = WorkflowAction {
            id: "state:10001:CLOSED".into(),
            label: "流转到「已关闭」".into(),
            kind: ActionKind::State,
            description: None,
            disabled_reason: Some("缺必填项".into()),
            manual_fill_required: None,
            requires_feishu: None,
            fields: vec![],
        };
        let json = serde_json::to_value(&action).unwrap();
        assert!(
            json.get("description").is_none(),
            "没有的可选键不要出现，界面按存在与否判断"
        );
        assert_eq!(json["kind"], "state");
        assert_eq!(json["disabled_reason"], "缺必填项");
        assert!(json.get("manual_fill_required").is_none(), "普通禁用原因不隐含飞书补填要求");
        assert!(json.get("requires_feishu").is_none(), "普通禁用原因不允许直接打开飞书执行");
        let manual = WorkflowAction { manual_fill_required: Some(true), requires_feishu: Some(true), ..action };
        let manual_json = serde_json::to_value(manual).unwrap();
        assert_eq!(manual_json["manual_fill_required"], true);
        assert_eq!(manual_json["requires_feishu"], true);
    }

    #[test]
    fn node_container_accepts_both_observed_shapes() {
        // 实测不带 node_id_list 时容器是 list；另一形态给过 detail。两者都要能读出来。
        let list = json!({"list": [{"basic": {"node_key": "state_fixture"}}], "pagination": {"has_more": false}});
        let detail = json!({"detail": [{"basic": {"node_key": "start"}}]});
        assert_eq!(node_list(&list).len(), 1);
        assert_eq!(node_list(&detail).len(), 1);
        assert!(node_list(&json!({"work_item_id": "1000000002"})).is_empty());
    }

    #[test]
    fn node_status_absent_is_not_treated_as_missing_data() {
        // 实测：doing / not_started 会写 status，做完的节点不带这个字段。
        let doing = json!({"basic": {"node_key": "state_fixture", "status": "doing"}});
        let done = json!({"basic": {"node_key": "state_11", "name": "后端研发"}});
        let flat = json!({"node_key": "start", "status": "not_started"});
        assert_eq!(node_status_of(&doing), "doing");
        assert_eq!(node_status_of(&done), "");
        assert_eq!(node_status_of(&flat), "not_started");
        assert_eq!(node_key_of(&doing), "state_fixture");
        assert_eq!(node_key_of(&flat), "start");
        assert_eq!(node_key_of(&json!({})), "");
    }

    #[test]
    fn transition_id_number_is_stringified_per_schema() {
        // 工具声明 string、响应给 number：按声明转字符串；id 文本不能带 JSON 引号，
        // 否则动作 id 会变成 state:"10001":DONE 这种没法复用的一串。
        let (value, text) = normalize_transition_id(&json!(10001));
        assert_eq!(value, json!("10001"));
        assert_eq!(text, "10001");
        let (value, text) = normalize_transition_id(&json!("abc123"));
        assert_eq!(value, json!("abc123"));
        assert_eq!(text, "abc123");
    }

    fn state_entry() -> DiscoveredAction {
        let mut action = entry("state:42:CLOSED", json!({"transition_id":"42"}), None);
        action.view.kind = ActionKind::State;
        action.target = "CLOSED".into();
        action
    }

    #[test]
    fn state_changed_or_transition_removed_after_saving_blocks_advance() {
        let entry = state_entry();
        let current = json!({"state_key":"OPEN","transition":[{"id":42,"state_key":"CLOSED"}]});
        assert!(check_state_transition(&current, &entry).is_ok());
        for changed in [
            json!({"state_key":"CLOSED","transition":[{"id":42,"state_key":"CLOSED"}]}),
            json!({"state_key":"OPEN","transition":[]}),
            json!({"state_key":"OPEN","transition":[{"id":43,"state_key":"CLOSED"}]}),
            json!({"state_key":"OPEN","transition":[{"id":42,"state_key":"OTHER"}]}),
        ] {
            assert!(check_state_transition(&changed, &entry).is_err());
        }
    }

    #[test]
    fn state_source_and_field_options_are_versioned() {
        let base = state_entry();
        let mut changed = base.clone();
        changed.expect = Expectation::StateIs {
            from: "OTHER".into(),
            target: "CLOSED".into(),
        };
        assert_ne!(fingerprint(&[base]), fingerprint(&[changed]));
        let mut base = state_entry();
        let build = |option: &str| {
            editing::NodeForm::build_state(
            &json!({}), &json!({"form_items":[{"key":"r"}]}),
            &[json!({"field_key":"r","field_type":"select","option":[{"option_id":option,"option_name":"选项"}]})], &json!({})
        ).unwrap()
        };
        base.form = build("a");
        let mut changed = base.clone();
        changed.form = build("b");
        assert_ne!(fingerprint(&[base]), fingerprint(&[changed]));
    }

    #[test]
    fn fields_must_be_saved_and_checked_before_transition_and_never_replayed() {
        use std::cell::RefCell;
        let calls = vec![("update_field", Map::new())];
        for stop in ["", "update", "check", "advance"] {
            let events = RefCell::new(Vec::new());
            let result = submit_with_fields(
                &calls,
                |_, _| {
                    events.borrow_mut().push("update");
                    if stop == "update" {
                        Err(BackendError::conflict("写入不明"))
                    } else {
                        Ok(json!({}))
                    }
                },
                || {
                    events.borrow_mut().push("check");
                    if stop == "check" {
                        Err(BackendError::conflict("回读不符或仍缺必填").into())
                    } else {
                        Ok(())
                    }
                },
                || {
                    events.borrow_mut().push("advance");
                    if stop == "advance" {
                        Err(BackendError::conflict("流转未确认"))
                    } else {
                        Ok(json!({}))
                    }
                },
            );
            match stop {
                "update" => {
                    assert!(matches!(result, Err(SubmissionError::FieldWrite(_))));
                    assert_eq!(*events.borrow(), vec!["update"]);
                }
                "check" => {
                    assert!(matches!(result, Err(SubmissionError::FieldCheck(_))));
                    assert_eq!(*events.borrow(), vec!["update", "check"]);
                }
                "advance" => {
                    assert!(matches!(result, Err(SubmissionError::Transition(_))));
                    assert_eq!(*events.borrow(), vec!["update", "check", "advance"]);
                }
                _ => {
                    assert!(result.is_ok());
                    assert_eq!(*events.borrow(), vec!["update", "check", "advance"]);
                }
            }
        }
        let result = submit_with_fields(
            &[],
            |_, _| panic!("无字段不能写字段"),
            || panic!("无字段不走节点核验"),
            || Ok(json!({})),
        );
        assert!(result.is_ok());
    }
}
