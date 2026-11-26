use super::*;

pub(super) fn scope(session: &Session, connection: &str) -> Result<String, BackendError> {
    use crate::model::source::SourceKind;
    let mut sources = session
        .config
        .sources
        .iter()
        .filter(|source| source.enabled)
        .collect::<Vec<_>>();
    sources.sort_by(|a, b| a.id.cmp(&b.id));
    let mut configuration = Vec::with_capacity(sources.len());
    for source in sources {
        let types = session.source_type_scope(&source.id)?;
        let target = match &source.kind {
            SourceKind::PersonalTodo => json!(source.todo),
            SourceKind::WorkItemType {
                project_key,
                type_key,
            } => json!([project_key, type_key, source.association_rule]),
            SourceKind::View {
                project_key,
                view_id,
            } => json!([project_key, view_id]),
        };
        configuration.push(json!([
            source.id,
            source.kind.name(),
            target,
            types.as_ref().map(|scope| scope.schedule_cache_signature())
        ]));
    }
    Ok(format!(
        "{:x}",
        Sha256::digest(json!([connection, configuration]).to_string())
    ))
}

pub fn read_cached_people(session: &Session) -> Result<Option<Value>, BackendError> {
    session
        .store
        .read_schedule_cache(&people_cache_scope(session)?, "recent")
}

pub fn people_cache_scope(session: &Session) -> Result<String, BackendError> {
    scope(session, &fingerprint(session)?)
}

pub fn save_cached_people(session: &Session, scope: &str, view: &LoadResult, observed_at: i64) {
    if !view.people_loaded
        || view.current_user.is_empty()
        || view.account_error.is_some()
        || view.failed_items > 0
        || !view
            .sources
            .iter()
            .all(|source| source.complete && source.error.is_none())
    {
        return;
    }
    let save = || -> Result<(), BackendError> {
        if self::scope(session, &view.connection)? != scope {
            return Ok(());
        }
        let mut snapshot = serde_json::to_value(view)?;
        snapshot["session_id"] = json!("");
        snapshot["read_requests"] = json!(0);
        let people: BTreeMap<_, _> = view
            .people
            .iter()
            .map(|entry| ((&entry.project, &entry.person.id), entry))
            .collect();
        snapshot["people"] = json!(people.values().collect::<Vec<_>>());
        session
            .store
            .save_schedule_cache(scope, "recent", observed_at, snapshot)
    };
    let _ = save();
}

pub(super) fn known_people(session: &Session, connection: &str, user: &str) -> Vec<ScopedPerson> {
    let Ok(scope) = scope(session, connection) else {
        return Vec::new();
    };
    let Ok(Some(mut snapshot)) = session.store.read_schedule_cache_header(&scope, "recent") else {
        return Vec::new();
    };
    if snapshot["current_user"].as_str() != Some(user) {
        return Vec::new();
    }
    serde_json::from_value(snapshot["people"].take()).unwrap_or_default()
}
