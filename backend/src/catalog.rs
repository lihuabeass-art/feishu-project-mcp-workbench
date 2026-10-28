//! 空间名称与空间内「所属项目」的只读目录，和事项身份分开保存。
use std::collections::{BTreeSet, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{detail::text, error::BackendError, mcp::{parse_tool_json, TodoSource}};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RelatedProject {
    pub field_key: String,
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectOption {
    pub type_key: String,
    #[serde(flatten)]
    pub project: RelatedProject,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceCatalog {
    pub project_key: String,
    pub name: Option<String>,
    pub simple_name: Option<String>,
    pub projects: Vec<ProjectOption>,
}

#[derive(Debug, Default)]
pub struct CatalogInput {
    pub names: BTreeSet<String>,
    pub types: BTreeSet<String>,
}

#[derive(Debug, Serialize)]
pub struct CatalogRefresh {
    pub spaces: Vec<SpaceCatalog>,
    pub warnings: Vec<String>,
}

pub async fn refresh_catalog(client: &dyn TodoSource, inputs: std::collections::BTreeMap<String, CatalogInput>,
    mut spaces: Vec<SpaceCatalog>, max_pages: u32, token: Option<&str>) -> Result<CatalogRefresh, BackendError>
{
    let mut warnings = Vec::new();
    for (key, input) in inputs {
        let previous = spaces.iter().find(|s| s.project_key == key)
            .or_else(|| spaces.iter().find(|s| s.simple_name.as_ref() == Some(&key))).cloned();
        let mut names = input.names;
        if let Some(space) = &previous { names.extend(space.name.iter().chain(space.simple_name.iter()).cloned()); }
        let resolved = resolve_space(client, &key, &names, max_pages).await;
        let mut space = match resolved {
            Ok((id, name, simple)) => {
                // 每次从本轮已合并的目录中取最新值，别名和正式 key 不得互相覆盖。
                let mut space = spaces.iter().find(|s| s.project_key == id).cloned().or(previous.clone())
                    .unwrap_or(SpaceCatalog { project_key:id.clone(), name:None, simple_name:None, projects:Vec::new() });
                space.project_key = id;
                space.name = Some(name);
                space.simple_name = simple;
                space
            },
            Err(e) => {
                warnings.push(format!("空间 {key} 名称未刷新：{}", e.safe_message(token)));
                spaces.iter().find(|s| s.simple_name.as_ref() == Some(&key)).cloned().or(previous)
                    .unwrap_or(SpaceCatalog { project_key:key.clone(), name:None, simple_name:None, projects:Vec::new() })
            },
        };
        // 无论本轮是否核实成功，删除别名快照之前都保留相同范围的历史选项。
        let same_space = |s: &&SpaceCatalog| s.project_key == space.project_key || s.project_key == key
            || space.simple_name.as_ref() == Some(&s.project_key);
        let inherited: Vec<_> = spaces.iter().filter(same_space).flat_map(|s| s.projects.iter()).cloned().collect();
        for option in inherited {
            if !space.projects.iter().any(|p| p.type_key == option.type_key
                && p.project.field_key == option.project.field_key && p.project.id == option.project.id) {
                space.projects.push(option);
            }
        }
        for kind in input.types {
            match project_options(client, &space.project_key, &kind, max_pages).await {
                Ok(options) => { space.projects.retain(|p| p.type_key != kind); space.projects.extend(options); },
                Err(e) => warnings.push(format!("空间 {key} 的项目选项未刷新：{}", e.safe_message(token))),
            }
        }
        spaces.retain(|s| s.project_key != space.project_key && s.project_key != key
            && space.simple_name.as_ref() != Some(&s.project_key));
        spaces.push(space);
    }
    spaces.sort_by(|a,b| a.project_key.cmp(&b.project_key));
    Ok(CatalogRefresh { spaces, warnings })
}

// 两种名称均来自实际详情；其他关联字段（如所属需求、所属模块）不属于项目。
fn is_project_field(name: &Value) -> bool {
    matches!(name.as_str(), Some("所属项目" | "所属合集"))
}

/// 使用实际返回的字段名称识别关联，绝不把 owned_project.name 当作业务项目。
pub fn related_projects(data: &Value) -> Vec<RelatedProject> {
    let mut projects = Vec::new();
    for field in data["work_item_fields"].as_array().into_iter().flatten() {
        if !is_project_field(&field["name"]) { continue; }
        let Some(field_key) = text(&field["key"]) else { continue };
        let values = match &field["value"] {
            Value::Array(values) => values.clone(),
            value => vec![value.clone()],
        };
        for value in values {
            if let (Some(id), Some(name)) = (text(&value["id"]), text(&value["name"])) {
                let project = RelatedProject { field_key: field_key.clone(), id, name };
                if !projects.contains(&project) { projects.push(project); }
            }
        }
    }
    projects
}

pub async fn resolve_space(client: &dyn TodoSource, key: &str, names: &BTreeSet<String>, max_pages: u32)
    -> Result<(String, String, Option<String>), BackendError>
{
    for name in names.iter().map(String::as_str).chain(std::iter::once(key)) {
        for page in crate::config::page_numbers(max_pages) {
            let args = json!({"project_name":name,"page_num":page});
            let value = parse_tool_json("search_project_info", &client.call_tool("search_project_info", args.as_object().unwrap()).await?)?;
            let spaces = value["projects"].as_array().ok_or_else(|| BackendError::parse("空间目录", "缺少 projects"))?;
            if let Some(space) = spaces.iter().find(|space| space["project_key"] == key || space["simple_name"] == key) {
                return Ok((text(&space["project_key"]).ok_or_else(|| BackendError::parse("空间目录", "缺少空间标识"))?,
                    text(&space["name"]).ok_or_else(|| BackendError::parse("空间目录", "缺少空间名称"))?, text(&space["simple_name"])));
            }
            match value["pagination"]["has_more"].as_bool() {
                Some(false) => break,
                Some(true) if !spaces.is_empty() => {},
                _ => return Err(BackendError::parse("空间目录", "空间分页不完整")),
            }
        }
    }
    Err(BackendError::parse("空间目录", format!("未能核实空间 {key} 的名称")))
}

pub async fn project_options(client: &dyn TodoSource, space: &str, kind: &str, max_pages: u32)
    -> Result<Vec<ProjectOption>, BackendError>
{
    let fields = crate::source_query::metadata(client, "list_workitem_field_config", space, kind, max_pages).await?;
    let mut options = Vec::new();
    for field in fields.iter().filter(|f| is_project_field(&f["field_name"]) && f["field_type"] == "workitem_related_select") {
        let key = text(&field["field_key"]).ok_or_else(|| BackendError::parse("项目目录", "缺少关联字段标识"))?;
        let targets = field["related_work_item_info"].as_array().ok_or_else(|| BackendError::parse("项目目录", "缺少关联类型"))?;
        for target in targets {
            let target_space = text(&target["project_key"]).ok_or_else(|| BackendError::parse("项目目录", "缺少关联空间"))?;
            let target_type = text(&target["work_item_type"]).ok_or_else(|| BackendError::parse("项目目录", "缺少关联类型标识"))?;
            for (id, name) in list_projects(client, &target_space, &target_type, max_pages).await? {
                options.push(ProjectOption { type_key: kind.into(), project: RelatedProject { field_key: key.clone(), id, name } });
            }
        }
    }
    Ok(options)
}

async fn list_projects(client: &dyn TodoSource, space: &str, kind: &str, max_pages: u32)
    -> Result<Vec<(String, String)>, BackendError>
{
    let space = crate::association::identifier(space)?;
    let kind = crate::association::identifier(kind)?;
    let mut session = None;
    let mut group = None;
    let mut total = None;
    let mut result = Vec::new();
    let mut seen = HashSet::new();
    for page in crate::config::page_numbers(max_pages) {
        let args = if page == 1 {
            json!({"project_key":space.trim_matches('`'),"mql":format!("SELECT `work_item_id`, `name` FROM {space}.{kind}")})
        } else {
            json!({"project_key":space.trim_matches('`'),"session_id":session,
                "group_pagination_list":[{"group_id":group,"page_num":page}]})
        };
        let value = parse_tool_json("search_by_mql", &client.call_tool("search_by_mql", args.as_object().unwrap()).await?)?;
        if page == 1 {
            // 与来源查询共用已实测的零结果契约；工具错误先由 parse_tool_json 拒绝。
            if value.get("list") == Some(&Value::Null) && value["data"].as_object().is_some_and(|d| d.is_empty())
                && text(&value["session_id"]).is_some() && value.get("search_status_info") == Some(&Value::Null)
                && value.get("extra_info") == Some(&Value::Null) { return Ok(result); }
            let list = value["list"].as_array().filter(|l| l.len() == 1).ok_or_else(|| BackendError::parse("项目目录", "缺少唯一查询结果"))?;
            total = list[0]["count"].as_u64();
            if total.is_none() { return Err(BackendError::parse("项目目录", "缺少有效 count")); }
            let groups = list[0]["group_infos"].as_array();
            if groups.is_some_and(|g| g.len() > 1) { return Err(BackendError::parse("项目目录", "意外返回多个分组")); }
            group = groups.and_then(|g| g.first()).and_then(|g| text(&g["group_id"]));
            session = text(&value["session_id"]);
        }
        let rows = group.as_ref().and_then(|g| value["data"].get(g)).and_then(Value::as_array);
        if rows.is_none() && total != Some(0) { return Err(BackendError::parse("项目目录", "缺少项目记录")); }
        for row in rows.into_iter().flatten() {
            let fields = row["moql_field_list"].as_array().ok_or_else(|| BackendError::parse("项目目录", "缺少项目字段"))?;
            let value = |key: &str| fields.iter().find(|f| f["key"] == key).map(|f| &f["value"]);
            let id = value("work_item_id").and_then(|v| text(&v["long_value"]).or_else(|| text(&v["string_value"])));
            let name = value("name").and_then(|v| text(&v["string_value"]));
            let (Some(id), Some(name)) = (id, name) else { return Err(BackendError::parse("项目目录", "项目缺少 ID 或名称")); };
            if !seen.insert(id.clone()) { return Err(BackendError::parse("项目目录", "项目分页重复")); }
            result.push((id, name));
        }
        if total == Some(result.len() as u64) { return Ok(result); }
        if total.is_some_and(|n| n < result.len() as u64) || rows.is_none_or(Vec::is_empty) || session.is_none() || group.is_none() {
            return Err(BackendError::parse("项目目录", "项目分页不完整"));
        }
    }
    Err(BackendError::parse("项目目录", "达到项目分页上限"))
}

#[cfg(test)]
#[path = "catalog_tests.rs"]
mod tests;
