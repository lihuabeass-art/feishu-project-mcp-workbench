use super::*;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HistoryScope {
    pub project: String,
    pub work_item_type: String,
    pub users: Vec<String>,
}

#[derive(Debug)]
struct HistoryResult {
    targets: Vec<Target>,
    complete: bool,
}

#[derive(Debug, Serialize)]
pub struct CalendarResult {
    targets: Vec<Target>,
    complete: bool,
    connection: String,
    current_user: String,
}

fn people_cache_key(
    session: &Session,
    connection: Option<&str>,
    current_user: Option<&str>,
    range: &Dates,
    scopes: &[HistoryScope],
) -> Result<Option<(String, String)>, BackendError> {
    let Some((connection, user)) = connection.zip(current_user) else { return Ok(None) };
    if user.is_empty() || scopes.is_empty() || fingerprint(session)? != connection {
        return Ok(None);
    }
    let mut normalized = BTreeMap::<_, BTreeSet<_>>::new();
    for scope in scopes {
        normalized.entry((&scope.project, &scope.work_item_type)).or_default()
            .extend(scope.users.iter().filter(|member| member.as_str() != user));
    }
    let page = json!([user, range, normalized.into_iter().collect::<Vec<_>>()]);
    Ok(Some((cache::scope(session, connection)?, page.to_string())))
}

pub fn read_cached_people_calendar(
    session: &Session,
    connection: Option<&str>,
    current_user: Option<&str>,
    range: &Dates,
    scopes: &[HistoryScope],
) -> Result<Option<Value>, BackendError> {
    let Some((scope, page)) = people_cache_key(session, connection, current_user, range, scopes)? else { return Ok(None) };
    session.store.read_schedule_cache(&scope, &page)
}

pub fn load_people_calendar(
    session: &Session,
    connection: Option<&str>,
    current_user: Option<&str>,
    range: &Dates,
    scopes: Vec<HistoryScope>,
) -> Result<CalendarResult, BackendError> {
    let observed_at = crate::sync::now_ms();
    let key = people_cache_key(session, connection, current_user, range, &scopes).ok().flatten();
    let result = load_calendar(session, connection, current_user, range, scopes)?;
    if result.complete {
        if let Some((scope, page)) = key {
            if let Ok(snapshot) = serde_json::to_value(&result) {
                let _ = session.store.save_schedule_cache(&scope, &page, observed_at, snapshot);
            }
        }
    }
    Ok(result)
}

async fn discover_calendar_scopes(
    session: &Session,
    client: &dyn TodoSource,
) -> Result<(Vec<HistoryScope>, bool), BackendError> {
    let mut scopes = Vec::new();
    let mut source_filters = Vec::new();
    for source in session.config.sources.iter().filter(|source| {
        source.enabled
            && source.ensure_executable().is_ok()
            && matches!(source.kind, crate::model::source::SourceKind::PersonalTodo)
    }) {
        let filter = session.source_type_scope(&source.id)?;
        for kind in session.source_types(&source.id)? {
            if filter
                .as_ref()
                .is_none_or(|scope| scope.allows(&kind.project_key, &kind.type_key))
            {
                add_history_scope(
                    &mut scopes,
                    &kind.project_key,
                    &kind.type_key,
                    std::iter::empty(),
                );
            }
        }
        source_filters.push(filter);
    }
    if !scopes.is_empty() || source_filters.is_empty() {
        return Ok((scopes, true));
    }

    // 初次进入时从空间和类型目录确定范围，不等待待办页及事项详情。
    let mut spaces = session.store.workspace_catalog()?;
    if spaces.is_empty() {
        spaces = crate::catalog::discover_spaces(client, Vec::new(), session.config.max_pages)
            .await?
            .spaces;
    }
    let mut types = stream::iter(spaces)
        .map(|space| async move {
            let tool = crate::mcp::feishu::TOOL_LIST_WORKITEM_TYPES;
            let args = json!({"project_key": space.project_key});
            let result = client
                .call_tool(tool, args.as_object().unwrap())
                .await
                .and_then(|payload| parse_tool_json(tool, &payload));
            (space.project_key, result)
        })
        .buffered(4);
    let mut complete = true;
    while let Some((project, response)) = types.next().await {
        let Ok(response) = response else {
            complete = false;
            continue;
        };
        let Some(kinds) = response["list"].as_array() else {
            complete = false;
            continue;
        };
        for kind in kinds {
            let Some(kind) = kind["type_key"].as_str().filter(|kind| !kind.is_empty()) else {
                complete = false;
                continue;
            };
            if source_filters.iter().any(|filter| {
                filter
                    .as_ref()
                    .is_none_or(|scope| scope.allows(&project, kind))
            }) {
                add_history_scope(&mut scopes, &project, kind, std::iter::empty());
            }
        }
    }
    Ok((scopes, complete))
}

pub fn load_calendar(
    session: &Session,
    connection: Option<&str>,
    current_user: Option<&str>,
    range: &Dates,
    mut scopes: Vec<HistoryScope>,
) -> Result<CalendarResult, BackendError> {
    match (date_ms(&range.start), date_ms(&range.end)) {
        (Some(start), Some(end)) if (0..14 * 86_400_000).contains(&(end - start)) => {}
        _ => return Err(BackendError::validation("日历排期日期范围无效")),
    }
    let credential = session.credential()?;
    let fingerprint = connection_fingerprint(&session.config.endpoint, credential.token().expose());
    if connection.is_some_and(|expected| expected != fingerprint) {
        return Err(BackendError::conflict("飞书连接已变化，请重新读取排期"));
    }
    let client = crate::remote::shared(&session.config, &credential);
    let (current_user, mut result) = crate::remote::runtime()?.block_on(async {
        let client = client.as_ref();
        let current_user =
            match current_user.filter(|user| connection.is_some() && !user.is_empty()) {
                Some(user) => user.to_owned(),
                None => txt(&read_schedule_account(client).await?["user_key"]),
            };
        let mut complete = true;
        if scopes.is_empty() {
            (scopes, complete) = discover_calendar_scopes(session, client).await?;
        }
        for scope in &mut scopes {
            scope.users.push(current_user.clone());
            scope.users.sort();
            scope.users.dedup();
        }
        let requests = scopes
            .iter()
            .flat_map(|scope| scope.users.chunks(3).map(move |users| (scope, users)));
        let mut pages = stream::iter(requests)
            .map(|(scope, users)| {
                read_people(
                    client,
                    &fingerprint,
                    range,
                    scope,
                    users,
                    session.config.max_pages,
                )
            })
            .buffered(4);
        let mut result = HistoryResult {
            targets: Vec::new(),
            complete,
        };
        while let Some(batch) = pages.next().await {
            result.complete &= batch.complete;
            result.targets.extend(batch.targets);
        }
        Ok::<_, BackendError>((current_user, result))
    })?;
    let mut details = HashMap::new();
    for target in &mut result.targets {
        let identity = &target.identity;
        let metadata = details
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
                session.store.item_detail(&id).ok().flatten().map(|detail| (
                    crate::workflow::item_url(&session.config.endpoint, &id, &detail.data),
                    crate::catalog::related_projects(&detail.data),
                ))
            });
        if let Some((url, projects)) = metadata {
            target.item_url.clone_from(url);
            target.related_projects = Some(projects.clone());
        }
    }
    Ok(CalendarResult {
        targets: result.targets,
        complete: result.complete,
        connection: fingerprint,
        current_user,
    })
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
                "state":{"state_id":"state_0", "state_name":"开发", "passed":true}, "page_context_only":false,
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
            assert_eq!(target.identity.node, "state_0");
            assert_eq!(target.node_id, "node_state_0_10");
            assert!(target.read_only_reason.is_some());
        }
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
    let node_uuid = entity_key
        .splitn(3, ':')
        .nth(2)
        .filter(|key| key.starts_with("node_"))
        .unwrap_or_default();
    let state_key = entity["state"]["state_id"].as_str().unwrap_or_default();
    // get_node_detail exposes both forms. Verify the UUID belongs to this item
    // before using the same node key as the editable schedule session.
    let node = if !state_key.is_empty() && node_uuid == format!("node_{state_key}_{item}") {
        state_key
    } else {
        node_uuid
    };
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
        node_id: node_uuid.to_owned(),
        identity: Identity {
            connection: connection.to_owned(),
            project: scope.project.clone(),
            r#type: scope.work_item_type.clone(),
            item: item.to_owned(),
            node: node.to_owned(),
            scope: "owner".into(),
            owner: Some(owner.id.clone()),
        },
        title: title.to_owned(),
        node_name,
        node_status: String::new(),
        item_closed: None,
        node_started_at_ms: None,
        node_order: 0,
        schedule_required: false,
        owner_name: owner.name.clone(),
        owners: vec![owner.clone()],
        unknown_owner: false,
        item_url: None,
        related_projects: None,
        sources: Vec::new(),
        baseline,
        read_only_reason: Some("历史排期，仅供查看".into()),
        source_aggregate: false,
        people_only: false,
        cache_kind: "node",
        start_state: "value",
        end_state: "value",
        fetched_at_ms: None,
    }))
}
