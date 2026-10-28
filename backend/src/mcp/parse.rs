//! `list_todo` 返回载荷 → 接口侧分页结构。
//!
//! 这一层是「数据解析错误」与「伪装成空清单」的分界线，规则：
//!
//! 1. `isError = true` 一律是**工具错误**，绝不退化成空页。
//! 2. 载荷里既没有 `structuredContent` 也没有可解析的文本 JSON → **解析错误**。
//!    「什么都没解析出来」和「服务端说你就是没待办」是两件事，后者必须真的带 `list: []`。
//! 3. 只接受三种顶层形状：`{"total":..,"list":[..]}`、`{"list":[..]}`、裸数组。
//!    出现别的形状就报错并把顶层键列出来，**不去猜** `data`/`items`/`records` 哪个才是清单
//!    （猜错的代价是把「零条」当成「取完了」）。
//! 4. 单条结构不符只拒绝该条并记录原因，其他条照常保留；页级形状问题才让整页失败。
//! 5. 顶层除 `list` 以外的键原样保存在 `top_level`，不做解读。

use serde_json::{Map, Value};

use crate::error::BackendError;
use crate::mcp::ToolResultPayload;
use crate::model::domain::RejectReason;
use crate::model::raw::{RawTodoItem, RawTodoPage, RawTodoRecord};

/// 工具返回的可读文本上限：够定位问题，又不会把整页响应灌进日志。
const TEXT_PREVIEW: usize = 600;

pub fn parse_todo_page(tool: &str, payload: &ToolResultPayload) -> Result<RawTodoPage, BackendError> {
    reject_tool_error(tool, payload)?;

    let value = pick_json(tool, payload, &is_page_shape, PAGE_SHAPE_HINT)?;

    match value {
        Value::Object(map) => build_from_object(tool, map),
        Value::Array(items) => {
            let (records, rejected) = collect_items(tool, &items);
            Ok(RawTodoPage { total: None, total_raw: None, items: records, rejected, top_level: Map::new() })
        }
        other => Err(BackendError::parse(
            format!("{tool}.result"),
            format!("返回体既不是对象也不是数组，而是 {}", kind_of(&other)),
        )),
    }
}

/// 数据页的唯一已见形状：裸数组，或含 `list` 的对象。
const PAGE_SHAPE_HINT: &str = "页形状〔含 list 的对象或裸数组〕";

fn is_page_shape(value: &Value) -> bool {
    matches!(value, Value::Array(_)) || value.get("list").is_some()
}

/// 通用「把工具返回取成一个 JSON 值」。
///
/// 与 [`parse_todo_page`] 的差别只在形状判定：`get_node_detail`、`list_workitem_types`
/// 这类工具的顶层就是业务对象，没有 `list` 可要求，因此这里接受任何对象或数组，
/// 由调用方按自己的字段契约再判定。`isError = true` 仍是工具错误，不退化成「没有数据」。
pub fn parse_tool_json(tool: &str, payload: &ToolResultPayload) -> Result<Value, BackendError> {
    reject_tool_error(tool, payload)?;
    pick_json(tool, payload, &|_| true, "对象或数组")
}

/// 节点/状态流转和节点更新实测回执为纯文本 success，可附带 log_id；这只确认收到回执，
/// 是否生效仍由 workflow 的远端回读核验，其他工具保持原 JSON 契约。
pub(crate) fn parse_write_response(tool: &str, payload: &ToolResultPayload) -> Result<Value, BackendError> {
    reject_tool_error(tool, payload)?;
    if matches!(tool, crate::mcp::feishu::TOOL_TRANSITION_NODE
        | crate::mcp::feishu::TOOL_TRANSITION_STATE | crate::mcp::feishu::TOOL_UPDATE_NODE)
        && payload.structured.is_none()
    {
        let joined = join_text(&payload.text_blocks);
        let mut lines = joined.lines().map(str::trim).filter(|line| !line.is_empty());
        if lines.next() == Some("success") && lines.all(|line| {
            line.strip_prefix("log_id:").is_some_and(|id| !id.trim().is_empty())
        }) {
            return Ok(Value::String("success".into()));
        }
    }
    parse_tool_json(tool, payload)
}

fn reject_tool_error(tool: &str, payload: &ToolResultPayload) -> Result<(), BackendError> {
    if payload.is_error {
        return Err(BackendError::Tool {
            tool: tool.to_string(),
            code: None,
            message: truncate(&join_text(&payload.text_blocks), TEXT_PREVIEW),
        });
    }
    Ok(())
}

/// 选择可信的 JSON 来源。
///
/// 有 `structuredContent` 就只信它——它比文本块更权威；
/// 若它形状不对，退化去读文本块反而会把真实的结构变更掩盖成「成功但零条」。
///
/// `accepts` 是**形状判定**而不是猜字段：`list_todo` 要求对象含 `list`，
/// 通用入口不额外要求。没有任何候选满足形状时，把第一个对象原样上抛，
/// 交给上层按「未知容器报顶层键」的既有契约处理，不静默。
fn pick_json(
    tool: &str,
    payload: &ToolResultPayload,
    accepts: &dyn Fn(&Value) -> bool,
    shape_hint: &str,
) -> Result<Value, BackendError> {
    if let Some(structured) = payload.structured.clone() {
        return Ok(structured);
    }

    let joined = join_text(&payload.text_blocks);
    if joined.trim().is_empty() {
        return Err(BackendError::parse(
            format!("{tool}.result"),
            "工具既没有 structuredContent，也没有文本内容，无法判定是「无数据」还是「响应异常」",
        ));
    }

    // 候选顺序：拼接全文优先（保留「载荷跨块」的容错），再逐非空文本块。
    // 真实 Meego 响应（2026-10 实测）：content[0] 是完整 JSON，content[1] 是
    // `log_id: …` 诊断块——拼接全文必然 trailing characters，诊断块不得成为失败因素。
    let mut candidates: Vec<(Option<usize>, &str)> = vec![(None, joined.as_str())];
    for (i, b) in payload.text_blocks.iter().enumerate() {
        if b.trim().is_empty() || candidates.iter().any(|(_, c)| *c == b.as_str()) {
            continue;
        }
        candidates.push((Some(i), b.as_str()));
    }

    let mut fallback_obj: Option<Value> = None;
    let mut fallback_scalar: Option<Value> = None;
    let mut first_error: Option<(Option<usize>, &str, serde_json::Error)> = None;
    for (source, text) in candidates.iter() {
        match parse_json_candidate(text) {
            Ok(v @ (Value::Array(_) | Value::Object(_))) => {
                if accepts(&v) {
                    return Ok(v);
                }
                if fallback_obj.is_none() {
                    fallback_obj = Some(v);
                }
            }
            Ok(other) => {
                if fallback_scalar.is_none() {
                    fallback_scalar = Some(other);
                }
            }
            Err(e) => {
                if first_error.is_none() {
                    first_error = Some((*source, *text, e));
                }
            }
        }
    }

    // 有对象/数组但都不满足形状：第一个原样上抛（契约路径：缺 list + 顶层键名），不静默
    if let Some(v) = fallback_obj {
        return Ok(v);
    }
    // 全是标量：如实上抛，交给上层报「既不是对象也不是数组」，不猜、不补
    if let Some(v) = fallback_scalar {
        return Ok(v);
    }
    match first_error {
        Some((source, text, e)) => {
            let label = match source {
                None => "拼接全文".to_string(),
                Some(i) => format!("content[{i}]"),
            };
            Err(BackendError::parse(
                format!("{tool}.result"),
                format!(
                    "文本内容不是 JSON（来源 {label}，共 {} 个候选，无一为{shape_hint}）: {e}；原文(截断预览): {}",
                    candidates.len(),
                    truncate(text.trim(), TEXT_PREVIEW)
                ),
            ))
        }
        // 理论不可达：有候选就要么解析成功要么报错，且上面已排除全空
        None => Err(BackendError::parse(format!("{tool}.result"), "没有可用的文本候选")),
    }
}

/// 单个候选的 JSON 解析；文本块里再套一层 JSON 字符串（二次编码）时解开一次。
/// 这是容错，不是猜测：解出来仍然必须命中 [`build_from_object`] 认可的形状。
/// **该二次编码路径未在真实响应中观测到。**
fn parse_json_candidate(text: &str) -> Result<Value, serde_json::Error> {
    let value = match serde_json::from_str::<Value>(text) {
        Ok(value) => value,
        Err(original) => {
            // 同一文本块内也可能是 JSON + 换行 + log_id。只容忍已知诊断行，
            // 不吞掉第二个 JSON、任意垃圾或残缺数据，以免把不完整响应当成功。
            let mut stream = serde_json::Deserializer::from_str(text).into_iter::<Value>();
            let Some(Ok(value)) = stream.next() else { return Err(original) };
            let suffix = &text[stream.byte_offset()..];
            if !suffix.starts_with(['\r', '\n']) || !suffix.lines().filter(|line| !line.trim().is_empty()).all(|line| {
                line.trim().strip_prefix("log_id:").is_some_and(|id| !id.trim().is_empty())
            }) {
                return Err(original);
            }
            value
        }
    };
    match value {
        Value::String(inner) => serde_json::from_str::<Value>(&inner),
        other => Ok(other),
    }
}

fn build_from_object(tool: &str, mut map: Map<String, Value>) -> Result<RawTodoPage, BackendError> {
    let list = match map.remove("list") {
        Some(Value::Array(items)) => items,
        Some(other) => {
            return Err(BackendError::parse(
                format!("{tool}.result.list"),
                format!("list 字段应为数组，实际是 {}", kind_of(&other)),
            ))
        }
        None => {
            // 不猜字段名，直接把顶层键交出去，便于按真实响应补适配
            let keys: Vec<&str> = map.keys().map(|k| k.as_str()).collect();
            return Err(BackendError::parse(
                format!("{tool}.result"),
                format!(
                    "对象里没有 list 字段（顶层键: [{}]）；本轮不猜测其他字段名，请按真实响应补适配",
                    keys.join(", ")
                ),
            ));
        }
    };

    let (total_raw, total) = match map.remove("total") {
        None => (None, None),
        Some(v) => {
            let raw = scalar_text(&v);
            let num = raw.as_deref().and_then(|s| s.trim().parse::<i64>().ok());
            (raw, num)
        }
    };

    let (items, rejected) = collect_items(tool, &list);
    Ok(RawTodoPage { total, total_raw, items, rejected, top_level: map })
}

fn collect_items(tool: &str, list: &[Value]) -> (Vec<RawTodoRecord>, Vec<RejectReason>) {
    let mut records = Vec::with_capacity(list.len());
    let mut rejected = Vec::new();

    for (idx, raw) in list.iter().enumerate() {
        match serde_json::from_value::<RawTodoItem>(raw.clone()) {
            Ok(item) => records.push(RawTodoRecord { raw: raw.clone(), item }),
            Err(e) => rejected.push(RejectReason::new(
                "item_shape_mismatch",
                format!("{tool} 第 {} 条与已知结构不符: {e}", idx + 1),
            )),
        }
    }

    (records, rejected)
}

fn join_text(blocks: &[String]) -> String {
    blocks
        .iter()
        .map(|s| s.as_str())
        .filter(|s| !s.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// JSON 标量 → 文本；对象/数组返回 `None`（不硬编一个看起来像值的字符串）。
fn scalar_text(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        Value::Null => None,
        _ => None,
    }
}

fn kind_of(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "布尔值",
        Value::Number(_) => "数字",
        Value::String(_) => "字符串",
        Value::Array(_) => "数组",
        Value::Object(_) => "对象",
    }
}

fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let cut: String = text.chars().take(max).collect();
    format!("{cut}…（已截断，原文 {} 字符）", text.chars().count())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn observed_writes_accept_success_receipt_with_diagnostic_blocks() {
        for blocks in [
            vec!["success"],
            vec!["success", "log_id: diagnostic-id"],
            vec!["success\r\nlog_id: diagnostic-id\r\n"],
        ] {
            let payload = ToolResultPayload {
                text_blocks: blocks.into_iter().map(str::to_string).collect(),
                ..Default::default()
            };
            for tool in ["transition_node", "transition_state", "update_node"] {
                assert_eq!(parse_write_response(tool, &payload).unwrap(), Value::String("success".into()), "{tool}");
                assert!(parse_tool_json(tool, &payload).is_err(), "只有写入入口接受成功回执: {tool}");
            }
            assert!(parse_tool_json("get_transitable_states", &payload).is_err(), "读接口不能把成功文本当业务数据");
        }
    }

    #[test]
    fn write_receipt_does_not_hide_errors_unknown_content_or_structured_results() {
        for tool in ["transition_node", "transition_state", "update_node"] {
            assert_eq!(parse_write_response(tool, &ToolResultPayload::err("success")).unwrap_err().kind(),
                crate::error::ErrorKind::Tool);
            for text in ["", "log_id: diagnostic-id", "successfully updated", "success\nerror: failed", "success\nlog_id:", "failure"] {
                assert!(parse_write_response(tool, &ToolResultPayload::from_text(text)).is_err(), "{tool}: {text}");
            }
            let payload = ToolResultPayload { structured: Some(serde_json::json!({"code":42})),
                text_blocks: vec!["success".into()], is_error:false };
            assert_eq!(parse_write_response(tool, &payload).unwrap(), serde_json::json!({"code":42}));
            assert_eq!(parse_write_response(tool, &ToolResultPayload::from_text("{\"ok\":true}")).unwrap(),
                serde_json::json!({"ok":true}));
        }
        assert!(parse_write_response("update_field", &ToolResultPayload::from_text("success")).is_err(),
            "未实测的其他写工具保持原契约");
    }

    fn page(json: &str) -> ToolResultPayload {
        ToolResultPayload::from_json(serde_json::from_str(json).unwrap())
    }

    #[test]
    fn parses_investigated_shape_with_total() {
        let payload = page(
            r#"{"total": 2, "list": [
                {"project_key":"b","work_item_info":{"work_item_id":"1","work_item_type_key":"story","work_item_name":"示例需求A"}},
                {"project_key":"b","work_item_info":{"work_item_id":"2","work_item_type_key":"issue","work_item_name":"示例缺陷A"}}
            ]}"#,
        );
        let p = parse_todo_page("list_todo", &payload).unwrap();
        assert_eq!(p.total, Some(2));
        assert_eq!(p.items.len(), 2);
        assert!(p.rejected.is_empty());
    }

    #[test]
    fn text_block_json_is_accepted_and_raw_is_preserved() {
        let payload = ToolResultPayload::from_text(
            r#"{"total":"1","list":[{"work_item_info":{"work_item_id":"7","extra_field":{"k":[1,2]}}}]}"#,
        );
        let p = parse_todo_page("list_todo", &payload).unwrap();
        assert_eq!(p.total_raw.as_deref(), Some("1"));
        assert_eq!(p.total, Some(1));
        assert!(p.items[0].raw.to_string().contains("extra_field"), "未知字段必须留在 raw 里");
    }

    #[test]
    fn double_encoded_json_is_tolerated() {
        let inner = r#"{"list":[{"work_item_info":{"work_item_id":"1"}}]}"#;
        let payload = ToolResultPayload::from_text(serde_json::to_string(inner).unwrap());
        let p = parse_todo_page("list_todo", &payload).unwrap();
        assert_eq!(p.items.len(), 1);
    }

    #[test]
    fn json_and_log_id_in_one_block_parse_without_truncating_data() {
        let payload = ToolResultPayload::from_text(
            "{\"total\":0,\"list\":[]}\r\nlog_id: diagnostic-id\r\n",
        );
        let p = parse_todo_page("list_todo", &payload).unwrap();
        assert_eq!(p.total, Some(0));
        assert!(p.items.is_empty());
        for suffix in ["\n{\"list\":[1]}", "\nunknown text", "\nlog_id:", "log_id: x"] {
            let payload = ToolResultPayload::from_text(format!("{{\"list\":[]}}{suffix}"));
            assert!(parse_todo_page("list_todo", &payload).is_err(), "不应吞掉未知尾部: {suffix}");
        }
    }

    #[test]
    fn real_shape_json_block_plus_logid_block_parses() {
        // 真实 Meego 响应形状（2026-10 实测）：块 0 是完整 JSON，块 1 是 log_id 诊断行。
        // 拼接全文会 trailing characters——逐块候选必须救回来，诊断块不得成为失败因素。
        let payload = ToolResultPayload {
            is_error: false,
            text_blocks: vec![
            r#"{"total":4,"list":[{"project_key":"69ce0be5fa159d37331c0859","work_item_info":{"work_item_id":7125530080,"work_item_type_key":"story","work_item_name":"模型管理"}},{"project_key":"69ce0be5fa159d37331c0859","work_item_info":{"work_item_id":7000000001,"work_item_type_key":"story","work_item_name":"第二条"}}]}"#.to_string(),
                "log_id: 2026101914430474D4FE7EA02C0093B975".to_string(),
            ],
            structured: None,
        };
        let p = parse_todo_page("list_todo", &payload).expect("JSON 数据块 + 诊断块必须能解析");
        assert_eq!(p.total, Some(4));
        assert_eq!(p.items.len(), 2);
    }

    #[test]
    fn metadata_object_block_cannot_steal_the_page_block() {
        // 页形状约束的对象候选必须含 `list`：元数据块在前、数据块在后时选数据块
        let payload = ToolResultPayload {
            is_error: false,
            text_blocks: vec![
                r#"{"page_num":1,"total":4,"page_size":50}"#.to_string(),
                r#"{"total":4,"list":[{"project_key":"p","work_item_info":{"work_item_id":"1","work_item_type_key":"story","work_item_name":"真数据"}}]}"#.to_string(),
            ],
            structured: None,
        };
        let p = parse_todo_page("list_todo", &payload).expect("含 list 的候选必须赢过元数据候选");
        assert_eq!(p.items.len(), 1);
        assert_eq!(p.total, Some(4));
    }

    #[test]
    fn all_scalar_candidates_report_neither_object_nor_array() {
        let e = parse_todo_page("list_todo", &ToolResultPayload::from_text("42")).unwrap_err();
        assert_eq!(e.kind(), crate::error::ErrorKind::Parse);
        assert!(e.to_string().contains("既不是对象也不是数组"), "标量如实上抛给上层判定: {e}");
    }

    #[test]
    fn parse_failure_message_names_source_candidate_count_and_serde_reason() {
        let payload = ToolResultPayload::from_text("这不是 JSON\nlog_id: x");
        let e = parse_todo_page("list_todo", &payload).unwrap_err();
        let msg = e.to_string();
        assert!(msg.contains("来源 拼接全文"), "报错须指明失败来源: {msg}");
        assert!(msg.contains("个候选"), "报错须给出候选数: {msg}");
        assert!(msg.contains("页形状"), "报错须说明形状要求: {msg}");
        assert!(msg.contains("line"), "报错须带 serde 原因（含行列）: {msg}");
    }

    #[test]
    fn unknown_container_in_text_block_still_names_top_level_keys() {
        // fallback_obj 上抛路径（文本块选源）：无 list 的对象必须按契约报顶层键，
        // 而不是落进「没有可用的文本候选」——删掉上抛分支本测试必挂
        let payload = ToolResultPayload {
            is_error: false,
            text_blocks: vec![
                r#"{"code":1,"msg":"ok","data":{"items":[1,2]}}"#.to_string(),
                "log_id: abc".to_string(),
            ],
            structured: None,
        };
        let e = parse_todo_page("list_todo", &payload).unwrap_err();
        let msg = e.to_string();
        assert!(msg.contains("没有 list 字段"), "必须直指缺 list: {msg}");
        assert!(msg.contains("code") && msg.contains("data"), "必须列出顶层键: {msg}");
    }

    #[test]
    fn bare_array_text_block_with_logid_parses() {
        // 裸数组候选即时采信（数组臂），后面的诊断块不得干扰
        let payload = ToolResultPayload {
            is_error: false,
            text_blocks: vec![
                r#"[{"project_key":"p","work_item_info":{"work_item_id":"9","work_item_type_key":"story","work_item_name":"裸数组条目"}}]"#.to_string(),
                "log_id: abc".to_string(),
            ],
            structured: None,
        };
        let p = parse_todo_page("list_todo", &payload).expect("裸数组候选必须被采信");
        assert_eq!(p.items.len(), 1);
    }

    #[test]
    fn duplicate_blocks_count_once_in_candidates() {
        // 两块内容相同：joined="A\nA" + 去重后的一块 = 2 个候选；重复块不重复入候选
        let dup = "完全不是 JSON".to_string();
        let payload = ToolResultPayload { is_error: false, text_blocks: vec![dup.clone(), dup], structured: None };
        let e = parse_todo_page("list_todo", &payload).unwrap_err();
        assert!(e.to_string().contains("共 2 个候选"), "重复块只进一次候选: {e}");
    }

    #[test]
    fn genuinely_empty_list_is_success_but_absent_payload_is_parse_error() {
        let empty = parse_todo_page("list_todo", &page(r#"{"total":0,"list":[]}"#)).unwrap();
        assert!(empty.is_empty(), "服务端明确给了空清单，这就是空清单");
        assert_eq!(empty.total, Some(0));

        // 没有任何内容：不能当成「用户没有待办」
        let e = parse_todo_page("list_todo", &ToolResultPayload::default()).unwrap_err();
        assert_eq!(e.kind(), crate::error::ErrorKind::Parse);

        let e = parse_todo_page("list_todo", &ToolResultPayload::from_text("请求参数不合法")).unwrap_err();
        assert_eq!(e.kind(), crate::error::ErrorKind::Parse);
        assert!(e.to_string().contains("请求参数不合法"), "解析错误要带上原文: {e}");
    }

    #[test]
    fn tool_error_is_not_empty_list() {
        let payload = ToolResultPayload { is_error: true, text_blocks: vec!["权限不足".into()], structured: None };
        let e = parse_todo_page("list_todo", &payload).unwrap_err();
        assert_eq!(e.kind(), crate::error::ErrorKind::Tool);
        assert!(e.to_string().contains("权限不足"));
    }

    #[test]
    fn unknown_container_shape_is_reported_with_top_level_keys() {
        let e = parse_todo_page("list_todo", &page(r#"{"data":{"items":[]},"code":0}"#)).unwrap_err();
        assert_eq!(e.kind(), crate::error::ErrorKind::Parse);
        let msg = e.to_string();
        assert!(msg.contains("data") && msg.contains("code"), "要给出顶层键便于排查: {msg}");
        assert!(!msg.contains("成功"), "不得被报告成成功: {msg}");
    }

    #[test]
    fn bad_item_shape_rejects_only_that_item() {
        let payload = page(
            r#"{"list":[{"work_item_info":{"work_item_id":"1"}}, {"work_item_info": "不是对象"}]}"#,
        );
        let p = parse_todo_page("list_todo", &payload).unwrap();
        assert_eq!(p.items.len(), 1);
        assert_eq!(p.rejected.len(), 1);
        assert_eq!(p.rejected[0].code, "item_shape_mismatch");
    }

    #[test]
    fn bare_array_is_accepted() {
        let p = parse_todo_page("list_todo", &page(r#"[{"work_item_info":{"work_item_id":"9"}}]"#)).unwrap();
        assert_eq!(p.items.len(), 1);
        assert_eq!(p.total, None, "裸数组没有 total，就不要凭空造一个");
    }
}
