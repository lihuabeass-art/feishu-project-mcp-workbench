use super::*;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HistoryScope {
    pub project: String,
    pub work_item_type: String,
    pub users: Vec<String>,
}

pub(super) async fn prioritize_recent_todos(
    client: &dyn TodoSource,
    range: &Dates,
    current_user: &str,
    items: Vec<TodoItem>,
    max_pages: u32,
) -> (Vec<TodoItem>, Vec<TodoItem>, BTreeSet<String>) {
    if current_user.is_empty() {
        return (items, Vec::new(), BTreeSet::new());
    }
    let (mut current, dated): (Vec<_>, Vec<_>) =
        items.into_iter().partition(|(_, _, _, rows, _)| {
            rows.is_empty()
                || rows.iter().any(|(_, row)| {
                    let start = date(&row["schedule"]["start_time"]).unwrap_or_default();
                    let end = date(&row["schedule"]["end_time"]).unwrap_or_default();
                    !(Dates { start, end }).outside(range)
                })
        });
    let (in_range, deferred, failed) =
        matching_recent_todos(client, range, dated, max_pages, |_| {
            vec![current_user.to_owned()]
        })
        .await;
    current.extend(in_range);
    (current, deferred, failed)
}

pub(super) async fn matching_recent_todos(
    client: &dyn TodoSource,
    range: &Dates,
    items: Vec<TodoItem>,
    max_pages: u32,
    users_for_project: impl Fn(&str) -> Vec<String>,
) -> (Vec<TodoItem>, Vec<TodoItem>, BTreeSet<String>) {
    let mut groups: BTreeMap<(String, String), Vec<TodoItem>> = BTreeMap::new();
    for item in items {
        let (project, kind, _) = item.0.key_tuple();
        groups.entry((project, kind)).or_default().push(item);
    }
    let mut checked = stream::iter(groups)
        .map(|((project, work_item_type), items)| {
            let users = users_for_project(&project);
            async move {
                let scope = HistoryScope {
                    project,
                    work_item_type,
                    users,
                };
                let mut matches = HashSet::new();
                let mut complete = true;
                for users in scope.users.chunks(3) {
                    let result = read_people(client, "", range, &scope, users, max_pages).await;
                    complete &= result.complete;
                    matches.extend(
                        result
                            .targets
                            .into_iter()
                            .map(|target| target.identity.item),
                    );
                }
                (items, matches, complete)
            }
        })
        .buffered(4);
    let mut current = Vec::new();
    let mut deferred = Vec::new();
    let mut failed = BTreeSet::new();
    while let Some((items, matching_items, complete)) = checked.next().await {
        for item in items {
            // Out-of-range summary dates alone cannot rule out a different personal node date.
            if !complete {
                failed.extend(item.2.iter().cloned());
            }
            if matching_items.contains(&item.0.work_item_id) {
                current.push(item);
            } else {
                deferred.push(item);
            }
        }
    }
    (current, deferred, failed)
}

#[derive(Debug, Serialize)]
pub struct HistoryResult {
    pub targets: Vec<Target>,
    pub complete: bool,
}

pub fn load_history(
    session: &Session,
    connection: &str,
    range: &Dates,
    scopes: Vec<HistoryScope>,
) -> Result<HistoryResult, BackendError> {
    match (date_ms(&range.start), date_ms(&range.end)) {
        (Some(start), Some(end)) if (0..14 * 86_400_000).contains(&(end - start)) => {}
        _ => return Err(BackendError::conflict("历史排期日期范围无效")),
    }
    let credential = session.credential()?;
    if connection_fingerprint(&session.config.endpoint, credential.token().expose()) != connection {
        return Err(BackendError::conflict("飞书连接已变化，请重新读取排期"));
    }
    let client = crate::remote::shared(&session.config, &credential);
    let requests = scopes
        .iter()
        .flat_map(|scope| scope.users.chunks(3).map(move |users| (scope, users)));
    let mut result = crate::remote::runtime()?.block_on(async {
        let mut pages = stream::iter(requests)
            .map(|(scope, users)| {
                read_people(
                    client.as_ref(),
                    connection,
                    range,
                    scope,
                    users,
                    session.config.max_pages,
                )
            })
            .buffered(4);
        let mut result = HistoryResult {
            targets: Vec::new(),
            complete: true,
        };
        while let Some(batch) = pages.next().await {
            result.complete &= batch.complete;
            result.targets.extend(batch.targets);
        }
        result
    });
    let mut urls = HashMap::new();
    for target in &mut result.targets {
        let identity = &target.identity;
        target.item_url = urls
            .entry((
                identity.project.clone(),
                identity.r#type.clone(),
                identity.item.clone(),
            ))
            .or_insert_with(|| {
                let id = WorkItemId {
                    project_key: Some(identity.project.clone()),
                    work_item_type_key: Some(identity.r#type.clone()),
                    work_item_id: identity.item.clone(),
                };
                let detail = session.store.item_detail(&id).ok().flatten()?;
                crate::workflow::item_url(&session.config.endpoint, &id, &detail.data)
            })
            .clone();
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp::{ConnectionInfo, ToolResultPayload};
    use serde_json::Map;

    struct Pages {
        fail_next: bool,
    }

    #[async_trait::async_trait]
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
            assert_eq!(tool, "list_schedule");
            let owner = args["user_keys"][0].as_str().unwrap();
            assert!(matches!(owner, "me" | "peer"));
            assert_eq!(args["work_item_type_keys"], json!(["story"]));
            assert_eq!(args["start_time"], "2026-10-05");
            let second = args.get("cursor").is_some();
            if second {
                assert_eq!(args["cursor"], "second-page");
                if self.fail_next {
                    return Err(BackendError::parse("list_schedule", "测试续页失败"));
                }
            }
            let row = json!({"entity_key":"3:10:node_state_0_10", "work_item_info":{"id":10, "name":"示例需求"},
                "state":{"state_name":"开发", "passed":true}, "page_context_only":false,
                "time":{"start":"2026-09-30 00:00:00", "end":"2026-10-06 23:59:59"}});
            let context_only = json!({"page_context_only":true, "time":{"start":"2026-10-05", "end":"2026-10-05"}});
            Ok(ToolResultPayload::from_json(json!({
                "user_workload_list":[{"user_info":{"userKey":owner, "name":"成员"}, "tasks":[row, context_only]}],
                "pagination":{"has_more":!second, "next_cursor":"second-page"}
            })))
        }
    }

    #[tokio::test]
    async fn history_keeps_overlapping_completed_nodes_and_partial_pages_without_duplicates() {
        let range = Dates {
            start: "2026-10-05".into(),
            end: "2026-10-11".into(),
        };
        let scope = HistoryScope {
            project: "p".into(),
            work_item_type: "story".into(),
            users: vec!["me".into()],
        };
        for fail_next in [false, true] {
            let result =
                read_people(&Pages { fail_next }, "c", &range, &scope, &scope.users, 3).await;
            assert_eq!(result.complete, !fail_next);
            assert_eq!(result.targets.len(), 1);
            let target = &result.targets[0];
            assert_eq!(target.baseline.start, "2026-09-30");
            assert_eq!(target.baseline.end, "2026-10-06");
            assert_eq!(target.identity.owner.as_deref(), Some("me"));
            assert_eq!(target.identity.node, "node_state_0_10");
            assert!(target.read_only_reason.is_some());
        }
    }

    #[tokio::test]
    async fn date_outside_summary_only_opens_details_when_recent_person_or_team_query_matches() {
        let range = Dates {
            start: "2026-10-05".into(),
            end: "2026-10-18".into(),
        };
        let todo = |id: &str, start: &str, end: &str| {
            let id = WorkItemId {
                project_key: Some("p".into()),
                work_item_type_key: Some("story".into()),
                work_item_id: id.into(),
            };
            let row = json!({"schedule":{"start_time":start, "end_time":end}});
            (
                id,
                String::new(),
                BTreeSet::from(["todo".into()]),
                vec![("todo".into(), row)],
                None,
            )
        };
        let items = vec![
            todo("10", "2026-09-01", "2026-09-02"),
            todo("20", "2026-09-01", "2026-09-02"),
            todo("30", "", ""),
            todo("40", "2026-10-01", "2026-10-05"),
        ];
        let client = Pages { fail_next: false };
        let (current, deferred, failed) =
            prioritize_recent_todos(&client, &range, "me", items, 3).await;
        assert!(failed.is_empty());
        assert_eq!(
            current
                .iter()
                .map(|item| item.0.work_item_id.as_str())
                .collect::<BTreeSet<_>>(),
            BTreeSet::from(["10", "30", "40"])
        );
        assert_eq!(deferred.len(), 1);
        let (team, still_outside, failed) =
            matching_recent_todos(&client, &range, deferred, 3, |_| vec!["peer".into()]).await;
        assert!(team.is_empty() && failed.is_empty());
        assert_eq!(still_outside[0].0.work_item_id, "20");
    }
}

async fn read_people(
    client: &dyn TodoSource,
    connection: &str,
    range: &Dates,
    scope: &HistoryScope,
    users: &[String],
    max_pages: u32,
) -> HistoryResult {
    let mut result = HistoryResult {
        targets: Vec::new(),
        complete: false,
    };
    let mut args = json!({
        "project_key": scope.project,
        "work_item_type_keys": [scope.work_item_type],
        "user_keys": users,
        "start_time": range.start,
        "end_time": range.end,
    });
    let mut cursors = HashSet::new();
    let mut seen = HashSet::new();
    let mut valid = true;
    for _ in crate::config::page_numbers(max_pages) {
        let Ok(data) = client
            .call_tool("list_schedule", args.as_object().unwrap())
            .await
            .and_then(|payload| parse_tool_json("list_schedule", &payload))
        else {
            break;
        };
        let Some(people) = data["user_workload_list"].as_array() else {
            break;
        };
        for person in people {
            let owner = txt(&person["user_info"]["userKey"]);
            if !users.contains(&owner) {
                valid = false;
                continue;
            }
            let mut name = txt(&person["user_info"]["name"]);
            if name.is_empty() {
                name = owner.clone();
            }
            let tasks = match person.get("tasks") {
                Some(Value::Array(tasks)) => tasks,
                Some(Value::Null) => continue,
                _ => {
                    valid = false;
                    continue;
                }
            };
            for task in tasks {
                let item = txt(&task["work_item_info"]["id"]);
                let title = txt(&task["work_item_info"]["name"]);
                let person = Person {
                    id: owner.clone(),
                    name: name.clone(),
                    avatar: None,
                };
                let mut entities = vec![task];
                while let Some(entity) = entities.pop() {
                    if let Some(children) = entity["subtasks"].as_array() {
                        entities.extend(children.iter().rev());
                    }
                    match history_target(entity, connection, range, scope, &person, &item, &title) {
                        Ok(Some(target)) if seen.insert(target.id.clone()) => {
                            result.targets.push(target)
                        }
                        Ok(_) => {}
                        Err(()) => valid = false,
                    }
                }
            }
        }
        match data["pagination"]["has_more"].as_bool() {
            Some(false) => {
                result.complete = valid;
                break;
            }
            Some(true) => {
                let Some(cursor) = data["pagination"]["next_cursor"]
                    .as_str()
                    .filter(|cursor| !cursor.is_empty() && cursors.insert(cursor.to_string()))
                else {
                    break;
                };
                args["cursor"] = json!(cursor);
            }
            None => break,
        }
    }
    result
}

fn history_target(
    entity: &Value,
    connection: &str,
    range: &Dates,
    scope: &HistoryScope,
    owner: &Person,
    item: &str,
    title: &str,
) -> Result<Option<Target>, ()> {
    if entity["page_context_only"].as_bool() == Some(true) || entity["time"].is_null() {
        return Ok(None);
    }
    let read_date = |field: &str| {
        let value = entity["time"][field].as_str()?;
        let date = value.split_once(' ').map_or(value, |(date, _)| date);
        date_ms(date).map(|_| date.to_owned())
    };
    let baseline = Dates {
        start: read_date("start").ok_or(())?,
        end: read_date("end").ok_or(())?,
    };
    if baseline.start > baseline.end {
        return Err(());
    }
    if baseline.start > range.end || baseline.end < range.start {
        return Ok(None);
    }
    let entity_key = entity["entity_key"]
        .as_str()
        .filter(|key| !key.is_empty())
        .ok_or(())?;
    if item.is_empty() || title.is_empty() {
        return Err(());
    }
    let node = entity_key
        .splitn(3, ':')
        .nth(2)
        .filter(|key| key.starts_with("node_"))
        .unwrap_or_default()
        .to_owned();
    let node_name = entity["state"]["state_name"]
        .as_str()
        .or(entity["name"].as_str())
        .unwrap_or_default()
        .to_owned();
    Ok(Some(Target {
        id: format!(
            "history:{}",
            json!([
                connection,
                scope.project,
                scope.work_item_type,
                owner.id,
                entity_key
            ])
        ),
        node_id: node.clone(),
        identity: Identity {
            connection: connection.to_owned(),
            project: scope.project.clone(),
            r#type: scope.work_item_type.clone(),
            item: item.to_owned(),
            node,
            scope: "owner".into(),
            owner: Some(owner.id.clone()),
        },
        title: title.to_owned(),
        node_name,
        node_status: String::new(),
        node_started_at_ms: None,
        node_order: 0,
        schedule_required: false,
        owner_name: owner.name.clone(),
        owners: vec![owner.clone()],
        unknown_owner: false,
        item_url: None,
        sources: Vec::new(),
        baseline,
        read_only_reason: Some("历史排期，仅供查看".into()),
        source_aggregate: false,
        cache_kind: "node",
        start_state: "value",
        end_state: "value",
        fetched_at_ms: None,
    }))
}
