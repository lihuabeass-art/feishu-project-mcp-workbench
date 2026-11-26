use super::*;
use std::time::Duration;

#[derive(Serialize)]
pub struct ScheduleProgress {
    pub connection: String,
    pub current_user: String,
    pub targets: Vec<Target>,
}

pub type ProgressSink<'a> = Option<&'a (dyn Fn(ScheduleProgress) + Sync)>;

pub fn load_profiles(session: &Session, connection: &str, user: &str, ids: Vec<String>, cached_only: bool) -> Result<Vec<Person>, BackendError> {
    if fingerprint(session)? != connection || user.trim().is_empty() {
        return Err(BackendError::conflict("排期账号已变化"));
    }
    let ids: BTreeSet<_> = ids.into_iter().filter(|id| !id.trim().is_empty()).collect();
    if ids.len() > 50 { return Err(BackendError::validation("每次最多读取 50 位成员")); }
    let scope = format!("{connection}/{user}");
    let now = crate::sync::now_ms();
    let since = now - if cached_only { 30 * 86_400_000 } else { 15 * 60_000 };
    let mut profiles = session.store.schedule_profiles(&scope, &ids, since)?;
    if cached_only { return Ok(profiles.into_values().collect()); }
    let missing: Vec<_> = ids.iter().filter(|id| !profiles.contains_key(*id)).collect();
    if !missing.is_empty() {
        let client = crate::remote::shared(&session.config, &session.credential()?);
        let args = json!({ "user_keys": missing });
        let payload = crate::remote::runtime()?.block_on(client.call_tool("search_user_info", args.as_object().unwrap()))?;
        let response = parse_tool_json("search_user_info", &payload)?;
        let users = response.as_array().ok_or_else(|| BackendError::parse("search_user_info", "缺少人员资料"))?;
        let mut learned = Vec::new();
        for value in users {
            let id = txt(&value["user_key"]);
            if !missing.contains(&&id) { continue; }
            learned.push(Person { name: user_name(value), avatar: user_avatar(value), id });
        }
        session.store.save_schedule_profiles(&scope, &learned, now)?;
        profiles.extend(learned.into_iter().map(|person| (person.id.clone(), person)));
    }
    Ok(profiles.into_values().collect())
}

pub(super) fn publish(sink: ProgressSink, connection: &str, user: &str, targets: &[Target]) {
    let Some(send) = sink else { return };
    if user.is_empty() || targets.is_empty() { return; }
    let mut targets = targets.to_vec();
    identify_targets(&mut targets);
    send(ScheduleProgress { connection: connection.into(), current_user: user.into(), targets });
}

fn can_recheck(error: &BackendError) -> bool {
    matches!(error, BackendError::Connection { .. } | BackendError::Parse { .. })
        || crate::mcp::feishu::is_read_throttle(error)
}

pub(super) async fn read_item(
    client: &dyn TodoSource, connection: &str, id: &WorkItemId,
    cached_detail: Option<detail::ItemDetail>, associated: Option<bool>, team: bool, max_pages: u32,
) -> (Result<Vec<Value>, BackendError>, Option<detail::ItemDetail>) {
    let (mut nodes, mut detail) = if let Some(finished) = associated {
        people::read_associated_nodes(client, connection, id, finished, max_pages).await
    } else {
        read_nodes_and_detail(client, id, cached_detail, max_pages).await
    };
    let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
    for delay in [1, 4] {
        let closed = detail.as_ref().is_some_and(|item| is_completed_or_aborted_detail(&item.data));
        if detail.as_ref().is_some_and(|item| is_state_flow_detail(&item.data)) || (closed && associated.is_none()) {
            break;
        }
        let retry_nodes = match &nodes {
            Err(error) if !can_recheck(error) => break,
            Err(_) => true,
            Ok(rows) => (!closed && rows.is_empty()) || rows.iter().any(node_data_incomplete),
        };
        let retry_detail = detail.is_none() && (associated.is_some() || team);
        if !retry_nodes && !retry_detail { break; }
        let retry = async {
            tokio::time::sleep(Duration::from_secs(delay)).await;
            if retry_detail {
                match detail::fetch(client, id, max_pages).await {
                    Ok(item) => detail = Some(item),
                    Err(error) => return can_recheck(&error),
                }
            }
            if retry_nodes && !detail.as_ref().is_some_and(|item| is_state_flow_detail(&item.data)) {
                let next = fetch_nodes(client, id, max_pages).await;
                // 一次补读失败不能抹掉之前取得的节点。
                let usable = |rows: &Vec<Value>| rows.iter().filter(|row| !node_data_incomplete(row)).count();
                if nodes.as_ref().map_or(true, |prior| next.as_ref().is_ok_and(|rows| usable(rows) >= usable(prior))) {
                    nodes = next;
                }
            }
            true
        };
        if !matches!(tokio::time::timeout_at(deadline, retry).await, Ok(true)) { break; }
    }
    (nodes, detail)
}
