//! 应用内部数据模型（与接口侧结构解耦）。
//!
//! 转换原则：
//!
//! - **不补造业务值**。响应没给的字段在内部模型里就是 `None`，
//!   不会用类型猜测出「待处理」「未排期」这类看起来像业务的默认值。
//! - **流程模型差异保留**。节点流（`node_info`）与状态流（`state_info`）
//!   不折算成同一个「状态」字符串；两者同时为空时记为 [`FlowKind::None`]（未知），
//!   而不是按 `work_item_type_key` 猜一个。理由：`story→节点流`、`issue→状态流`
//!   只是调查中的样本观察（设计文档决策 4 / U3），尚未证实可作映射规则。
//! - **身份可追溯**。`(project_key, work_item_type_key, work_item_id)` 作为缓存主键；
//!   为何不用 `work_item_id` 单键，见 [`WorkItemId`]。

use serde::{Deserialize, Serialize};

use super::raw::{meaningful, RawTodoItem, RawTodoRecord};

/// 缺失即拒绝入库的重试-safe 拒绝原因。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RejectReason {
    /// 稳定短码，用于同步报告与统计。
    pub code: &'static str,
    pub detail: String,
}

impl RejectReason {
    pub fn new(code: &'static str, detail: impl Into<String>) -> Self {
        Self { code, detail: detail.into() }
    }
}

impl std::fmt::Display for RejectReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.detail)
    }
}

/// 工作项身份。
///
/// **为什么用三段复合键**：调查记录只证实了返回体内含这三个字段，
/// 从未证实 `work_item_id` 在跨空间、跨类型范围内全局唯一（U3 未验证）。
/// 用复合键的代价是「若某天 id 全局唯一也只是多存两列」，
/// 而用单键的代价是「若 id 只在空间内唯一，就会串号覆盖别人空间的数据」——
/// 后者是不可逆的数据污染，所以选复合键。
///
/// **缺 `work_item_id` 的记录一律拒绝**：连一次读取都无法定位到同一条事项，
/// 无法承载「重复同步不产生重复事项」这一要求，只能计入拒绝数并如实上报。
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct WorkItemId {
    pub project_key: Option<String>,
    pub work_item_type_key: Option<String>,
    pub work_item_id: String,
}

/// 主键列使用的占位文本：响应未提供该段身份时写入。
///
/// 它是**存储层哨兵**而非业务值，真实「缺失」信息保存在 `identity_missing_flags`。
pub const ABSENT_KEY: &str = "";

impl WorkItemId {
    /// 哪些身份段在响应里缺失（或为空），用于 `identity_missing_flags`。
    pub fn missing_parts(&self) -> Vec<&'static str> {
        let mut v = Vec::new();
        if self.project_key.is_none() {
            v.push("project_key");
        }
        if self.work_item_type_key.is_none() {
            v.push("work_item_type_key");
        }
        v
    }

    /// 落库用三元组（缺失段填 [`ABSENT_KEY`]）。
    pub fn key_tuple(&self) -> (String, String, String) {
        (
            self.project_key.clone().unwrap_or_else(|| ABSENT_KEY.to_string()),
            self.work_item_type_key.clone().unwrap_or_else(|| ABSENT_KEY.to_string()),
            self.work_item_id.clone(),
        )
    }
}

/// 流程模型种类。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FlowKind {
    /// 只有节点信息（调查中的 `story` 样本属于此类）。
    Node,
    /// 只有状态信息（调查中的 `issue` 样本属于此类）。
    State,
    /// 两种信息同时非空。真实语义未确认，本轮不折算。
    Both,
    /// 两种信息都为空或缺失：流程模型未知，不猜测。
    None,
}

impl FlowKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Node => "node",
            Self::State => "state",
            Self::Both => "both",
            Self::None => "none",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "node" => Some(Self::Node),
            "state" => Some(Self::State),
            "both" => Some(Self::Both),
            "none" => Some(Self::None),
            _ => None,
        }
    }
}

/// 流程信息：节点流与状态流各留各的字段，不合并。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FlowInfo {
    pub kind: FlowKind,
    pub node_name: Option<String>,
    pub node_state_key: Option<String>,
    pub start_state_key_name: Option<String>,
    pub end_state_key_name: Option<String>,
}

/// 排期。时间类型与本地转换约定未定（U4），因此只保存响应原文文本。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct Schedule {
    pub start_raw: Option<String>,
    pub end_raw: Option<String>,
}

/// 内部统一工作项模型。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkItem {
    pub id: WorkItemId,
    pub project_name: Option<String>,
    pub name: Option<String>,
    pub flow: FlowInfo,
    pub schedule: Schedule,
    /// 原始响应条目（紧凑 JSON）。派生列不足以表达的信息都落在这里。
    pub raw_json: String,
}

/// 把一条接口侧记录转换为内部模型；无法定位身份的记录返回拒绝原因。
pub fn to_work_item(record: &RawTodoRecord) -> Result<WorkItem, RejectReason> {
    let RawTodoItem { project_key, project_name, work_item_info, schedule, node_info, state_info } =
        record.item.clone();

    let info = work_item_info
        .ok_or_else(|| RejectReason::new("missing_work_item_info", "响应条目里没有 work_item_info 对象"))?;

    let work_item_id = meaningful(info.work_item_id)
        .ok_or_else(|| RejectReason::new("missing_work_item_id", "work_item_id 缺失或为空，无法定位该事项"))?;

    let node_name = node_info.as_ref().and_then(|n| meaningful(n.node_name.clone()));
    let node_state_key = node_info.as_ref().and_then(|n| meaningful(n.node_state_key.clone()));
    let start_state = state_info.as_ref().and_then(|s| meaningful(s.start_state_key_name.clone()));
    let end_state = state_info.as_ref().and_then(|s| meaningful(s.end_state_key_name.clone()));

    let has_node = node_name.is_some() || node_state_key.is_some();
    let has_state = start_state.is_some() || end_state.is_some();
    let kind = match (has_node, has_state) {
        (true, true) => FlowKind::Both,
        (true, false) => FlowKind::Node,
        (false, true) => FlowKind::State,
        (false, false) => FlowKind::None,
    };

    let raw_json = serde_json::to_string(&record.raw)
        .map_err(|e| RejectReason::new("raw_serialize_failed", e.to_string()))?;

    Ok(WorkItem {
        id: WorkItemId {
            project_key: meaningful(project_key),
            work_item_type_key: meaningful(info.work_item_type_key),
            work_item_id,
        },
        project_name: meaningful(project_name),
        name: meaningful(info.work_item_name),
        flow: FlowInfo { kind, node_name, node_state_key, start_state_key_name: start_state, end_state_key_name: end_state },
        schedule: Schedule {
            start_raw: schedule.as_ref().and_then(|s| meaningful(s.start_time.clone())),
            end_raw: schedule.as_ref().and_then(|s| meaningful(s.end_time.clone())),
        },
        raw_json,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::raw::RawTodoItem as R;

    fn record(json: &str) -> RawTodoRecord {
        let raw: serde_json::Value = serde_json::from_str(json).unwrap();
        RawTodoRecord { item: serde_json::from_value::<R>(raw.clone()).unwrap(), raw }
    }

    #[test]
    fn story_sample_maps_to_node_flow() {
        let item = to_work_item(&record(
            r#"{
                "project_key": "b",
                "project_name": "示例空间",
                "work_item_info": {"work_item_id": "WI-1001", "work_item_type_key": "story", "work_item_name": "示例需求A"},
                "schedule": {"start_time": "1750000000000", "end_time": ""},
                "node_info": {"node_name": "研发中", "node_state_key": "developing"},
                "state_info": {"start_state_key_name": "", "end_state_key_name": ""}
            }"#,
        ))
        .unwrap();

        assert_eq!(item.flow.kind, FlowKind::Node);
        assert_eq!(item.flow.node_state_key.as_deref(), Some("developing"));
        // 空字符串不得被补成任何业务值
        assert_eq!(item.flow.start_state_key_name, None);
        assert_eq!(item.flow.end_state_key_name, None);
        // 排期保留原文，不做未确认的单位/时区换算
        assert_eq!(item.schedule.start_raw.as_deref(), Some("1750000000000"));
        assert_eq!(item.schedule.end_raw, None);
        assert!(item.raw_json.contains("示例需求A"));
    }

    #[test]
    fn issue_sample_maps_to_state_flow() {
        let item = to_work_item(&record(
            r#"{
                "project_key": "b",
                "work_item_info": {"work_item_id": "WI-2002", "work_item_type_key": "issue", "work_item_name": "示例缺陷A"},
                "node_info": {"node_name": "", "node_state_key": ""},
                "state_info": {"start_state_key_name": "待处理", "end_state_key_name": ""}
            }"#,
        ))
        .unwrap();
        assert_eq!(item.flow.kind, FlowKind::State);
        assert_eq!(item.flow.start_state_key_name.as_deref(), Some("待处理"));
        assert_eq!(item.flow.node_name, None);
    }

    #[test]
    fn both_empty_is_unknown_flow_not_guessed() {
        let item = to_work_item(&record(
            r#"{
                "work_item_info": {"work_item_id": "3", "work_item_type_key": "story"},
                "node_info": {"node_name": "", "node_state_key": ""},
                "state_info": {"start_state_key_name": "", "end_state_key_name": ""}
            }"#,
        ))
        .unwrap();
        assert_eq!(item.flow.kind, FlowKind::None, "两类信息都为空时不得按类型猜测流程模型");
        assert_eq!(item.name, None, "名称缺失不得补成占位文案");
        assert_eq!(item.id.missing_parts(), vec!["project_key"]);
    }

    #[test]
    fn missing_id_is_rejected() {
        let r = to_work_item(&record(
            r#"{"project_key": "b", "work_item_info": {"work_item_type_key": "story", "work_item_name": "无身份"}}"#,
        ));
        assert_eq!(r.err().map(|e| e.code), Some("missing_work_item_id"));

        let r = to_work_item(&record(r#"{"project_key": "b"}"#));
        assert_eq!(r.err().map(|e| e.code), Some("missing_work_item_info"));
    }

    #[test]
    fn absent_identity_uses_sentinel_but_keeps_flags() {
        let item = to_work_item(&record(
            r#"{"work_item_info": {"work_item_id": "7", "work_item_name": "跨空间未知"}}"#,
        ))
        .unwrap();
        let (p, t, i) = item.id.key_tuple();
        assert_eq!((p.as_str(), t.as_str(), i.as_str()), (ABSENT_KEY, ABSENT_KEY, "7"));
        assert_eq!(item.id.missing_parts(), vec!["project_key", "work_item_type_key"]);
    }
}
