use super::{fingerprint, user_avatar, user_name, Person};
use crate::{
    api::Session,
    association::identifier,
    detail,
    error::BackendError,
    mcp::{parse_tool_json, TodoSource},
};
use futures_util::stream::{self, StreamExt};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

const TOOL: &str = "search_by_mql";
const TYPE: &str = "issue";

#[derive(Debug, Serialize)]
pub struct Defect {
    pub project: String,
    pub item: String,
    pub title: String,
    pub status: String,
    pub priority: Option<String>,
    pub owners: Vec<Person>,
}

#[derive(Debug, Default, Serialize)]
pub struct DefectRead {
    pub defects: Vec<Defect>,
    pub failed_projects: Vec<String>,
}

pub fn load_defects(
    session: &Session,
    connection: &str,
    projects: Vec<String>,
) -> Result<DefectRead, BackendError> {
    if fingerprint(session)? != connection {
        return Err(BackendError::conflict("连接已变化，请重新读取缺陷"));
    }
    let credential = session.credential()?;
    let client = crate::remote::shared(&session.config, &credential);
    let projects = projects.into_iter().collect::<BTreeSet<_>>();
    crate::remote::runtime()?.block_on(async {
        let results = stream::iter(projects)
            .map(|project| async {
                let mut result =
                    load_project(client.as_ref(), &project, session.config.max_pages).await;
                if let Ok(defects) = &mut result {
                    fill_owner_avatars(client.as_ref(), &project, defects).await;
                }
                (project, result)
            })
            .buffered(3)
            .collect::<Vec<_>>()
            .await;
        let mut read = DefectRead::default();
        for (project, result) in results {
            match result {
                Ok(defects) => read.defects.extend(defects),
                Err(_) => read.failed_projects.push(project),
            }
        }
        Ok(read)
    })
}

async fn fill_owner_avatars(client: &dyn TodoSource, project: &str, defects: &mut [Defect]) {
    let keys: Vec<_> = defects
        .iter()
        .flat_map(|defect| &defect.owners)
        .filter(|person| person.avatar.is_none())
        .map(|person| person.id.as_str())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let mut avatars = BTreeMap::new();
    for chunk in keys.chunks(50) {
        let args = json!({"project_key":project, "user_keys":chunk});
        let result = client
            .call_tool("search_user_info", args.as_object().unwrap())
            .await
            .and_then(|payload| parse_tool_json("search_user_info", &payload));
        let Ok(users) = result else { continue };
        for user in users.as_array().into_iter().flatten() {
            if let (Some(id), Some(avatar)) = (detail::text(&user["user_key"]), user_avatar(user)) {
                avatars.insert(id, avatar);
            }
        }
    }
    for person in defects.iter_mut().flat_map(|defect| &mut defect.owners) {
        if person.avatar.is_none() {
            person.avatar = avatars.get(&person.id).cloned();
        }
    }
}

async fn load_project(
    client: &dyn TodoSource,
    project: &str,
    max_pages: u32,
) -> Result<Vec<Defect>, BackendError> {
    let space = identifier(project)?;
    let query = format!("SELECT `work_item_id`, `name`, `current_status_operator`, `work_item_status`, `archiving_status`, `priority` FROM {space}.`{TYPE}` WHERE `archiving_status` = false");
    let invalid = || BackendError::parse("缺陷清单", "查询结果或分页不完整");
    let mut cursor = None;
    let mut group = None;
    let mut total = 0;
    let mut seen = BTreeSet::new();
    let mut defects = Vec::new();
    for page in crate::config::page_numbers(max_pages) {
        let args = if page == 1 {
            json!({"project_key":project,"mql":query})
        } else {
            json!({"project_key":project,"session_id":cursor,"group_pagination_list":[{"group_id":group,"page_num":page}]})
        };
        let value = parse_tool_json(
            TOOL,
            &client.call_tool(TOOL, args.as_object().unwrap()).await?,
        )?;
        if page == 1 {
            cursor = detail::text(&value["session_id"]);
            if value.get("list") == Some(&Value::Null)
                && value["data"]
                    .as_object()
                    .is_some_and(|data| data.is_empty())
                && cursor.is_some()
                && value.get("search_status_info") == Some(&Value::Null)
                && value.get("extra_info") == Some(&Value::Null)
            {
                return Ok(defects);
            }
            let list = value["list"]
                .as_array()
                .filter(|list| list.len() == 1)
                .ok_or_else(invalid)?;
            total = list[0]["count"].as_u64().ok_or_else(invalid)?;
            if total == 0 {
                return Ok(defects);
            }
            let groups = list[0]["group_infos"]
                .as_array()
                .filter(|groups| groups.len() == 1)
                .ok_or_else(invalid)?;
            group = detail::text(&groups[0]["group_id"]);
        }
        let rows = group
            .as_ref()
            .and_then(|group| value["data"].get(group))
            .and_then(Value::as_array)
            .filter(|rows| !rows.is_empty())
            .ok_or_else(invalid)?;
        for row in rows {
            let fields = row["moql_field_list"].as_array().ok_or_else(invalid)?;
            let id = fields
                .iter()
                .find(|field| field["key"] == "work_item_id")
                .map(|field| &field["value"])
                .ok_or_else(invalid)?;
            let item = detail::text(&id["long_value"])
                .or_else(|| detail::text(&id["string_value"]))
                .ok_or_else(invalid)?;
            if !seen.insert(item.clone()) {
                return Err(invalid());
            }
            if let Some(defect) = parse_defect(project, item, fields)? {
                defects.push(defect);
            }
        }
        let received = seen.len() as u64;
        if received == total {
            return Ok(defects);
        }
        if received > total || cursor.is_none() {
            return Err(invalid());
        }
    }
    Err(invalid())
}

fn parse_defect(
    project: &str,
    item: String,
    fields: &[Value],
) -> Result<Option<Defect>, BackendError> {
    let field = |key: &str| {
        fields
            .iter()
            .find(|field| field["key"] == key)
            .map(|field| &field["value"])
            .unwrap_or(&Value::Null)
    };
    if field("archiving_status")["bool_value"] == true {
        return Ok(None);
    }
    let status = &field("work_item_status")["key_label_value_list"][0];
    let key = detail::text(&status["key"]).unwrap_or_default();
    let label = detail::text(&status["label"])
        .ok_or_else(|| BackendError::parse("缺陷清单", "缺少缺陷状态"))?;
    // 已解决可能尚未归档。状态标签也用于识别不同模板中的关闭与终止状态。
    if matches!(key.as_str(), "RESOLVED" | "CLOSED" | "ABORTED")
        || matches!(label.as_str(), "已解决" | "已关闭" | "已终止" | "已完成")
    {
        return Ok(None);
    }
    let title = detail::text(&field("name")["string_value"])
        .ok_or_else(|| BackendError::parse("缺陷清单", "缺少缺陷名称"))?;
    let owner_field = &field("current_status_operator")["user_value_list"];
    let mut owners = BTreeMap::new();
    for owner in owner_field.as_array().into_iter().flatten() {
        let Some(id) = detail::text(&owner["user_key"]) else {
            continue;
        };
        let name = user_name(owner);
        owners.entry(id.clone()).or_insert_with(|| Person {
            id,
            name,
            avatar: user_avatar(owner),
        });
    }
    Ok(Some(Defect {
        project: project.to_owned(),
        item,
        title,
        status: label,
        priority: detail::text(&field("priority")["key_label_value"]["label"]),
        owners: owners.into_values().collect(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp::{ConnectionInfo, ToolResultPayload};
    use async_trait::async_trait;
    use serde_json::Map;

    struct Pages {
        duplicate: bool,
    }

    fn row(id: u64, key: &str, label: &str, archived: bool) -> Value {
        json!({"moql_field_list":[
            {"key":"work_item_id","value":{"long_value":id}},
            {"key":"name","value":{"string_value":format!("缺陷 {id}")}},
            {"key":"work_item_status","value":{"key_label_value_list":[{"key":key,"label":label}]}},
            {"key":"archiving_status","value":{"bool_value":archived}},
            {"key":"current_status_operator","value":{"user_value_list":[
                {"user_key":"me","name_cn":"本人"},{"user_key":"peer","name_cn":"同事"},{"user_key":"me","name_cn":"本人"}
            ]}},
            {"key":"priority","value":{"key_label_value":{"key":"1","label":"P1"}}}
        ]})
    }

    #[async_trait]
    impl TodoSource for Pages {
        async fn describe(&self) -> Result<ConnectionInfo, BackendError> {
            unreachable!()
        }
        async fn close(&mut self) {}
        async fn call_tool(
            &self,
            tool: &str,
            args: &Map<String, Value>,
        ) -> Result<ToolResultPayload, BackendError> {
            assert_eq!(args["project_key"], "space");
            if tool == "search_user_info" {
                assert_eq!(args["user_keys"], json!(["me", "peer"]));
                return Ok(ToolResultPayload::from_json(
                    json!([{"user_key":"peer","avatar_url":"https://example.com/avatar.png"}]),
                ));
            }
            assert_eq!(tool, TOOL);
            let response = if let Some(query) = args.get("mql") {
                assert!(query
                    .as_str()
                    .unwrap()
                    .contains("FROM `space`.`issue` WHERE `archiving_status` = false"));
                json!({"session_id":"cursor","list":[{"count":4,"group_infos":[{"group_id":"group"}]}],
                    "data":{"group":[row(1,"OPEN","待处理",false), row(2,"RESOLVED","已解决",false)]}})
            } else {
                assert_eq!(args["session_id"], "cursor");
                assert_eq!(
                    args["group_pagination_list"],
                    json!([{"group_id":"group","page_num":2}])
                );
                json!({"data":{"group":[row(if self.duplicate { 1 } else { 3 },"REOPENED","重新打开",false), row(4,"OTHER","已终止",true)]}})
            };
            Ok(ToolResultPayload::from_json(response))
        }
    }

    #[tokio::test]
    async fn reads_all_pages_and_keeps_only_unresolved_defects_with_unique_owners() {
        let client = Pages { duplicate: false };
        let mut result = load_project(&client, "space", 5).await.unwrap();
        assert_eq!(
            result
                .iter()
                .map(|defect| defect.item.as_str())
                .collect::<Vec<_>>(),
            ["1", "3"]
        );
        assert_eq!(result[0].status, "待处理");
        assert_eq!(result[0].priority.as_deref(), Some("P1"));
        assert_eq!(
            result[0]
                .owners
                .iter()
                .map(|owner| owner.id.as_str())
                .collect::<Vec<_>>(),
            ["me", "peer"]
        );
        fill_owner_avatars(&client, "space", &mut result).await;
        assert_eq!(result[0].owners[0].avatar, None);
        assert_eq!(
            result[0].owners[1].avatar.as_deref(),
            Some("https://example.com/avatar.png")
        );
        assert!(load_project(&Pages { duplicate: true }, "space", 5)
            .await
            .is_err());
        assert!(load_project(&Pages { duplicate: false }, "space", 1)
            .await
            .is_err());
    }
}
