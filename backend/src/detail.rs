//! 工作项逻辑字段的完整分页快照，与待办摘要分开保存。
use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{
    error::BackendError,
    mcp::{parse_tool_json, TodoSource},
    model::domain::WorkItemId,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemDetail {
    pub id: WorkItemId,
    pub fetched_at_ms: i64,
    pub data: Value,
    /// 各页原文，保留未知字段和分页信息。
    pub pages: Vec<Value>,
}

pub fn identity(value: &Value) -> Result<WorkItemId, BackendError> {
    let a = value
        .get("work_item_attribute")
        .ok_or_else(|| BackendError::parse("工作项详情", "缺少 work_item_attribute"))?;
    let project = text(&a["owned_project"]["key"]);
    let type_key = text(&a["work_item_type"]["key"]);
    let id = text(&a["work_item_id"]);
    if project.is_none() || type_key.is_none() || id.is_none() {
        return Err(BackendError::parse(
            "工作项详情",
            "远端详情缺少空间、类型或编号",
        ));
    }
    Ok(WorkItemId {
        project_key: project,
        work_item_type_key: type_key,
        work_item_id: id.unwrap(),
    })
}

pub(crate) fn text(value: &Value) -> Option<String> {
    match value {
        Value::String(s) if !s.trim().is_empty() => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

pub async fn fetch(
    client: &dyn TodoSource,
    requested: &WorkItemId,
    max_pages: u32,
) -> Result<ItemDetail, BackendError> {
    let project = requested
        .project_key
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| BackendError::validation("读取详情需要空间标识"))?;
    if requested.work_item_id.trim().is_empty() {
        return Err(BackendError::validation(
            "读取详情需要工作项编号",
        ));
    }
    let mut pages = Vec::new();
    let mut fields = Vec::new();
    let mut token: Option<String> = None;
    let mut seen = HashSet::new();
    let mut first: Option<Value> = None;
    let mut canonical = None;
    for _ in crate::config::page_numbers(max_pages) {
        let mut args = json!({"project_key":project,"work_item_id":requested.work_item_id,
            "fields":["_all"],"page_size":200})
        .as_object()
        .unwrap()
        .clone();
        if let Some(t) = &token {
            args.insert("page_token".into(), Value::String(t.clone()));
        }
        let value = parse_tool_json(
            "get_workitem_brief",
            &client.call_tool("get_workitem_brief", &args).await?,
        )?;
        let id = identity(&value)?;
        let a = &value["work_item_attribute"];
        if id.work_item_id != requested.work_item_id
            || (id.project_key.as_deref() != Some(project)
                && a["owned_project"]["simple_name"].as_str() != Some(project))
            || requested
                .work_item_type_key
                .as_ref()
                .is_some_and(|k| Some(k) != id.work_item_type_key.as_ref())
            || canonical.as_ref().is_some_and(|previous| previous != &id)
        {
            return Err(BackendError::parse(
                "工作项详情",
                "远端返回的复合身份与请求或前页不一致",
            ));
        }
        canonical = Some(id);
        if first.is_none() {
            first = Some(value.clone());
        }
        if let Some(list) = value.get("work_item_fields") {
            fields.extend(
                list.as_array()
                    .ok_or_else(|| BackendError::parse("工作项详情", "work_item_fields 不是数组"))?
                    .iter()
                    .cloned(),
            );
        }
        let more = value["pagination"]["has_more"].as_bool().ok_or_else(|| {
            BackendError::parse("工作项详情", "缺少 pagination.has_more，无法确认完整性")
        })?;
        let next = text(&value["pagination"]["next_page_token"]);
        pages.push(value);
        if !more {
            let mut data = first.unwrap();
            data["work_item_fields"] = Value::Array(fields);
            data.as_object_mut().unwrap().remove("pagination");
            return Ok(ItemDetail {
                id: canonical.unwrap(),
                fetched_at_ms: crate::sync::now_ms(),
                data,
                pages,
            });
        }
        let next = next
            .ok_or_else(|| BackendError::parse("工作项详情", "还有字段但没有 next_page_token"))?;
        if !seen.insert(next.clone()) {
            return Err(BackendError::parse("工作项详情", "字段分页游标重复"));
        }
        token = Some(next);
    }
    Err(BackendError::parse(
        "工作项详情",
        "达到字段分页上限，详情未取全",
    ))
}

/// 待办保留分配给本人的节点，状态流使用详情中的当前状态。
pub fn todo_summary(detail: &ItemDetail, mut row: Value) -> Value {
    let a = &detail.data["work_item_attribute"];
    if let Some(name) = text(&a["work_item_name"]) {
        row["work_item_info"]["work_item_name"] = Value::String(name);
    }
    if a["work_item_mod"].as_str() == Some("状态流") {
        row["node_info"] = Value::Null;
        row["state_info"] = json!({"start_state_key_name":a["work_item_status"]["name"]});
    }
    row
}

/// 从真实详情派生清单摘要。完整节点数组、字段和角色仍在详情快照中。
pub fn summary(detail: &ItemDetail, source_record: Value) -> Value {
    let data = &detail.data;
    let a = &data["work_item_attribute"];
    let nodes = data["work_item_current_node"].as_array();
    let mut node_names: Vec<&str> = nodes
        .into_iter()
        .flatten()
        .filter_map(|n| n["name"].as_str())
        .collect();
    node_names.sort_unstable();
    node_names.dedup();
    let single_node = nodes.filter(|ns| ns.len() == 1).and_then(|ns| ns.first());
    let is_state = a["work_item_mod"].as_str() == Some("状态流");
    let schedule = data["work_item_fields"]
        .as_array()
        .and_then(|fs| fs.iter().find(|f| f["key"] == "schedule"));
    json!({
        "project_key":detail.id.project_key,"project_name":a["owned_project"]["name"],
        "work_item_info":{"work_item_id":detail.id.work_item_id,"work_item_type_key":detail.id.work_item_type_key,
            "work_item_name":a["work_item_name"]},
        "node_info":{"node_name":if node_names.is_empty(){None}else{Some(node_names.join(" / "))},
            "node_state_key":single_node.and_then(|n| n["id"].as_str())},
        "state_info":{"start_state_key_name":if is_state {a["work_item_status"]["name"].clone()}else{Value::Null}},
        "schedule":schedule.map(|f|json!({
            "start_time":schedule_text(&f["value"]["start_time"]),
            "end_time":schedule_text(&f["value"]["end_time"])
        })).unwrap_or(Value::Null),
        "source_record":source_record
    })
}

fn schedule_text(value: &Value) -> Option<String> {
    text(value).or_else(|| text(&value["iso_time"]))
}
