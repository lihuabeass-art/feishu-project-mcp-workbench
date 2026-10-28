//! 飞书 `list_todo` 接口侧原始结构。
//!
//! 与《飞书项目MCP调查结论.md》第 3 节记录的实测结构一一对应，
//! 并且**只描述观测到的字段**：
//!
//! ```text
//! work_item_info { work_item_id, work_item_type_key, work_item_name }
//! project_key / project_name
//! schedule { start_time, end_time }
//! node_info { node_name, node_state_key }
//! state_info { start_state_key_name, end_state_key_name }
//! ```
//!
//! 设计约定（理由见 `docs/数据模型与接口契约.md`）：
//!
//! 1. 本层**保留响应原样**：空字符串仍为空字符串，缺失仍为缺失，不做任何业务补全。
//!    归一化只发生在 [`crate::model::domain`] 一层，且原始 JSON 始终随条目落库。
//! 2. 字段一律 `Option`：调查记录明确「可选字段、空字符串和缺失值按实际响应处理」。
//!    服务端未声明某字段必填，我方就不把它当必填假设。
//! 3. 标量走 [`LooseStr`] 宽容反序列化：若同一字段某天从字符串变成数字，
//!    结果是「值被保留」而不是「整页解析失败」，避免把类型抖动放大成同步失败。
//! 4. 未知字段不丢：整条原始 JSON 在进入本层之前就已被截留（见 [`RawTodoRecord::raw`]）。

use serde::Deserialize;
use serde_json::{Map, Value};

use crate::model::domain::RejectReason;

/// 宽容标量：`string` / `number` / `bool` 一律收成文本，`null` 由外层 `Option` 收成 `None`。
///
/// 这是纯粹的机械转换（数字→十进制文本），不赋予任何业务含义。
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct LooseStr(pub String);

impl LooseStr {
    /// 是否为「空文本」——即响应里给了空字符串。
    pub fn is_blank(&self) -> bool {
        self.0.trim().is_empty()
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl<'de> Deserialize<'de> for LooseStr {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::Error as _;

        struct Visitor;

        impl<'de> serde::de::Visitor<'de> for Visitor {
            type Value = LooseStr;

            fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str("a string, integer, float or boolean")
            }

            fn visit_str<E: serde::de::Error>(self, v: &str) -> Result<LooseStr, E> {
                Ok(LooseStr(v.to_owned()))
            }

            fn visit_string<E: serde::de::Error>(self, v: String) -> Result<LooseStr, E> {
                Ok(LooseStr(v))
            }

            fn visit_u64<E: serde::de::Error>(self, v: u64) -> Result<LooseStr, E> {
                Ok(LooseStr(v.to_string()))
            }

            fn visit_i64<E: serde::de::Error>(self, v: i64) -> Result<LooseStr, E> {
                Ok(LooseStr(v.to_string()))
            }

            fn visit_f64<E: serde::de::Error>(self, v: f64) -> Result<LooseStr, E> {
                if v.fract() == 0.0 && v.abs() < 1e15 {
                    Ok(LooseStr(format!("{}", v as i64)))
                } else {
                    Ok(LooseStr(v.to_string()))
                }
            }

            fn visit_bool<E: serde::de::Error>(self, v: bool) -> Result<LooseStr, E> {
                Ok(LooseStr(v.to_string()))
            }

            fn visit_unit<E: serde::de::Error>(self) -> Result<LooseStr, E> {
                Ok(LooseStr(String::new()))
            }

            fn visit_none<E: serde::de::Error>(self) -> Result<LooseStr, E> {
                Ok(LooseStr(String::new()))
            }

            fn visit_some<D>(self, d: D) -> Result<LooseStr, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                d.deserialize_any(Visitor)
            }
        }

        // 数组/对象等结构落到这里会直接报错，而不是被悄悄丢掉。
        deserializer.deserialize_any(Visitor).map_err(|e| {
            D::Error::custom(format!("期望标量值但结构与声明不符: {e}"))
        })
    }
}

/// 把 `Option<LooseStr>` 折成「有实际内容的文本」；空字符串与缺失都归 `None`。
///
/// 归一化只影响派生列，原始响应仍完整保存在 `work_item.raw_json`。
pub(crate) fn meaningful(raw: Option<LooseStr>) -> Option<String> {
    raw.filter(|v| !v.is_blank()).map(|v| v.0)
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct RawWorkItemInfo {
    pub work_item_id: Option<LooseStr>,
    pub work_item_type_key: Option<LooseStr>,
    pub work_item_name: Option<LooseStr>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct RawSchedule {
    /// 时间类型与本地转换约定尚未确定（设计文档 U4），因此本轮只原样保存文本。
    pub start_time: Option<LooseStr>,
    pub end_time: Option<LooseStr>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct RawNodeInfo {
    pub node_name: Option<LooseStr>,
    pub node_state_key: Option<LooseStr>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct RawStateInfo {
    pub start_state_key_name: Option<LooseStr>,
    pub end_state_key_name: Option<LooseStr>,
}

/// 一条个人待办事项在接口侧的样子。
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct RawTodoItem {
    pub project_key: Option<LooseStr>,
    pub project_name: Option<LooseStr>,
    pub work_item_info: Option<RawWorkItemInfo>,
    pub schedule: Option<RawSchedule>,
    pub node_info: Option<RawNodeInfo>,
    pub state_info: Option<RawStateInfo>,
}

/// 单条记录：原始 JSON + 按已知结构解析出的视图。
///
/// `raw` 是服务端返回的那一段原文（重新序列化，字段值不变），
/// 用于后续补字段映射（U4）时无需重新联网。
#[derive(Debug, Clone)]
pub struct RawTodoRecord {
    pub raw: Value,
    pub item: RawTodoItem,
}

/// 一页个人待办。
#[derive(Debug, Clone, Default)]
pub struct RawTodoPage {
    /// 响应里的 `total`，仅在能无损读成整数时给出。
    pub total: Option<i64>,
    /// `total` 的原文（例如 `"8"`），无法转整数时仍然保留。
    pub total_raw: Option<String>,
    pub items: Vec<RawTodoRecord>,
    /// 本页里**结构不符、被拒绝**的条目原因。
    ///
    /// 单条坏数据不让整页失败（见 `mcp/parse.rs` 规则 4），但也不能悄悄丢掉：
    /// 计数与原因会汇总进 `sync_run.rejection_detail`。
    pub rejected: Vec<RejectReason>,
    /// 顶层除 `list` 之外的其余键，原样保留、不做解读。
    pub top_level: Map<String, Value>,
}

impl RawTodoPage {
    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loose_str_accepts_string_number_bool() {
        for (input, want) in [
            (r#""WI-1""#, "WI-1"),
            ("123", "123"),
            ("-7", "-7"),
            ("true", "true"),
            ("12.0", "12"),
            (r#""""#, ""),
        ] {
            let got: LooseStr = serde_json::from_str(input).unwrap();
            assert_eq!(got.as_str(), want, "输入 {input}");
        }
    }

    #[test]
    fn null_becomes_none_not_empty_string() {
        #[derive(Deserialize)]
        struct S {
            #[allow(dead_code)]
            v: Option<LooseStr>,
        }
        let s: S = serde_json::from_str(r#"{"v": null}"#).unwrap();
        assert!(s.v.is_none(), "null 应视为缺失，而不是空字符串");

        let s: S = serde_json::from_str("{}").unwrap();
        assert!(s.v.is_none());

        let s: S = serde_json::from_str(r#"{"v": ""}"#).unwrap();
        assert!(s.v.is_some(), "空字符串是响应给出来的值，不应与缺失混淆");
        assert!(s.v.unwrap().is_blank());
    }

    #[test]
    fn unknown_fields_do_not_break_parsing() {
        let item: RawTodoItem = serde_json::from_str(
            r#"{
                "project_key": "b",
                "brand_new_field": {"a": 1},
                "work_item_info": {"work_item_id": 42, "work_item_type_key": "story", "extra": null}
            }"#,
        )
        .unwrap();
        assert_eq!(item.work_item_info.unwrap().work_item_id.unwrap().as_str(), "42");
    }

    #[test]
    fn object_in_scalar_field_is_a_parse_error_not_silently_dropped() {
        let r = serde_json::from_str::<RawTodoItem>(r#"{"project_key": {"nested": 1}}"#);
        assert!(r.is_err(), "结构不符必须报错");
    }
}
