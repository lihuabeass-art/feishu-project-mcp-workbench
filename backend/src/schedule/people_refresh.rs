use super::*;

#[derive(Deserialize, Serialize)]
pub struct PeopleItem {
    pub id: WorkItemId,
    #[serde(default)]
    pub sources: Vec<String>,
}

#[derive(Serialize)]
pub struct PeopleItemDiscovery {
    pub items: Vec<PeopleItem>,
    pub complete: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_kind: Option<&'static str>,
}

#[derive(Serialize)]
pub struct PeopleItemRefresh {
    pub targets: Vec<Target>,
    pub current_user: String,
    pub closed: bool,
    pub complete: bool,
}

fn check_connection(session: &Session, connection: &str) -> Result<(), BackendError> {
    if fingerprint(session)? != connection {
        return Err(BackendError::conflict("排期连接已变化"));
    }
    Ok(())
}

pub(super) fn discovery_issue(error: &BackendError) -> Option<ErrorKind> {
    let kind = error.kind();
    matches!(kind, ErrorKind::Auth | ErrorKind::Credential | ErrorKind::Config | ErrorKind::Permission).then_some(kind)
}

/// 仅发现事项身份，节点与排期由各事项自己的读取补齐。
pub fn discover_people_items(
    session: &Session,
    connection: &str,
    current_user: &str,
    scopes: Vec<HistoryScope>,
) -> Result<PeopleItemDiscovery, BackendError> {
    check_connection(session, connection)?;
    let client = crate::remote::shared(&session.config, &session.credential()?);
    let max_pages = session.config.max_pages;
    crate::remote::runtime()?.block_on(async {
        let mut items = HashMap::<WorkItemId, BTreeSet<String>>::new();
        let mut complete;
        let mut issue = None;
        let mut add = |stories: Vec<people::Story>, source: &str| {
            for story in stories.into_iter().filter(|story| !story.finished) {
                items.entry(story.id).or_default().insert(source.to_owned());
            }
        };
        match crate::catalog::discover_spaces(client.as_ref(), Vec::new(), max_pages).await {
            Ok(discovery) => {
                let (stories, all_read, associated_issue) = people::associated_stories(client.as_ref(), &discovery.spaces, max_pages).await;
                add(stories, people::ASSOCIATED_SOURCE_ID);
                complete = all_read;
                issue = associated_issue;
            }
            Err(error) if discovery_issue(&error).is_some() => return Err(error),
            Err(_) => complete = false,
        }
        let scopes: Vec<_> = scopes.into_iter().filter(|scope| scope.work_item_type == "story")
            .map(|mut scope| {
                scope.users.retain(|id| !id.is_empty() && id != current_user);
                scope
            }).collect();
        let queries = scopes.iter().flat_map(|scope| {
            scope.users.chunks(people::MEMBERS_PER_QUERY).map(move |users| (scope, users))
        });
        let mut reads = stream::iter(queries).map(|(scope, users)| {
            people::current_stories(client.as_ref(), scope, users, max_pages)
        }).buffer_unordered(3);
        while let Some(result) = reads.next().await {
            match result {
                Ok(stories) => add(stories, people::SOURCE_ID),
                Err(error) => {
                    complete = false;
                    issue = discovery_issue(&error).or(issue);
                }
            }
        }
        let mut todo_sources = personal_todo_statuses(session)?;
        match read_todo_index(session, client.as_ref(), &mut todo_sources).await {
            Ok(todos) => {
                for (id, _, sources, _) in todos.into_values() {
                    items.entry(id).or_default().extend(sources);
                }
                complete &= todo_sources.iter().all(|status| status.complete && status.error.is_none());
            }
            Err(error) => {
                complete = false;
                issue = discovery_issue(&error).or(issue);
            }
        }
        let mut items: Vec<_> = items.into_iter().map(|(id, sources)| PeopleItem { id, sources: sources.into_iter().collect() }).collect();
        items.sort_by_cached_key(|item| item.id.key_tuple());
        Ok(PeopleItemDiscovery { items, complete, error_kind: issue.map(ErrorKind::as_str) })
    })
}

pub fn refresh_people_item(
    session: &Session,
    connection: &str,
    current_user: &str,
    item: PeopleItem,
) -> Result<PeopleItemRefresh, BackendError> {
    check_connection(session, connection)?;
    let (project, kind, number) = item.id.key_tuple();
    if [project.as_str(), kind.as_str(), number.as_str(), current_user].iter().any(|part| part.trim().is_empty()) {
        return Err(BackendError::validation("缺少排期事项或账号标识"));
    }
    let client = crate::remote::shared(&session.config, &session.credential()?);
    let max_pages = session.config.max_pages;
    crate::remote::runtime()?.block_on(async {
        let detail = detail::fetch(client.as_ref(), &item.id, max_pages).await?;
        let closed = is_completed_or_aborted_detail(&detail.data);
        let state_flow = is_state_flow_detail(&detail.data);
        let nodes = if state_flow { Ok(Vec::new()) } else { fetch_nodes(client.as_ref(), &item.id, max_pages).await };
        let nodes = match nodes {
            Ok(nodes) => nodes,
            Err(_) if closed => return Ok(PeopleItemRefresh { targets: Vec::new(), current_user: current_user.to_owned(), closed, complete: false }),
            Err(error) => return Err(error),
        };
        if !closed && !state_flow && (nodes.is_empty() || nodes.iter().any(|node| normalized_node_status(node).is_empty())) {
            return Err(BackendError::parse("节点", "未确认事项的当前节点状态"));
        }
        let complete_nodes = !nodes.iter().any(node_data_incomplete);
        let sources = item.sources.into_iter().collect();
        let mut targets = Vec::new();
        let mut names = BTreeMap::new();
        let mut avatars = BTreeMap::new();
        let mut errors = Vec::new();
        append_extra_targets(session, connection, "", current_user, None, &mut names, &mut avatars,
            &mut errors, &mut targets, vec![(item.id, String::new(), sources, Some(detail), Ok(nodes))], true);
        let complete = complete_nodes && errors.is_empty();
        if !complete {
            if !closed { return Err(BackendError::parse("人员排期", "该事项的节点或排期未读完整")); }
            targets.clear();
        }
        targets.retain(|target| target.cache_kind == "associated_item" || target.node_status == "doing" || has_complete_schedule_dates(&target.baseline));
        let mut configs = ScheduleConfigs::new();
        if !closed && targets.iter().any(|target| target.node_status == "doing" && !has_complete_schedule_dates(&target.baseline)) {
            read_schedule_configs(client.as_ref(), max_pages, &mut configs, BTreeSet::from([(project, kind)])).await;
            resolve_schedule_required_remote(client.as_ref(), &mut targets, &configs, &mut BTreeMap::new()).await;
        }
        finish_person_names_with_details(session, current_user, "", None, &names, &avatars, &mut targets);
        identify_targets(&mut targets);
        Ok(PeopleItemRefresh { targets, current_user: current_user.to_owned(), closed, complete })
    })
}
