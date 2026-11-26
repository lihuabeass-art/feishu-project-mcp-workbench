use super::*;
use std::{sync::{Arc, Mutex}, time::{Duration, Instant}};

type ItemKey = (String, String, String);
type NodeKey = (String, String, String, String);
type Required = BTreeMap<NodeKey, Option<Value>>;

#[derive(Default)]
struct Checkpoint {
    items: BTreeMap<ItemKey, Vec<Target>>,
    required: Required,
    configs: ScheduleConfigs,
}
struct Saved {
    completed_at: Option<Instant>,
    generation: u64,
    data: Arc<Checkpoint>,
}
static RECOVERY: Mutex<BTreeMap<String, Saved>> = Mutex::new(BTreeMap::new());

#[derive(Default)]
pub(super) struct RepairRound {
    key: Option<(String, u64)>,
    previous: Arc<Checkpoint>,
    pub required: Required,
}

impl RepairRound {
    pub fn start(session: &Session, connection: &str, user: &str, resume: bool) -> Self {
        if user.is_empty() { return Self::default(); }
        let Ok(configuration) = cache::scope(session, connection) else { return Self::default() };
        let scope = json!([session.config.db_path, configuration, user]).to_string();
        let mut slots = RECOVERY.lock().unwrap_or_else(|e| e.into_inner());
        slots.retain(|_, s| s.completed_at.is_none_or(|t| t.elapsed() < Duration::from_secs(300)));
        let prior = slots.get(&scope).filter(|_| resume);
        let previous = prior.map(|s| s.data.clone()).unwrap_or_default();
        let generation = NEXT.fetch_add(1, Ordering::Relaxed);
        slots.insert(scope.clone(), Saved { completed_at: None, generation, data: previous.clone() });
        Self { key: Some((scope, generation)), previous, required: Required::new() }
    }

    // 只在本轮查询再次返回同一事项和来源时复用只读节点。可编辑节点仍走会话读取和核验。
    pub fn restore(&mut self, item: &ExtraItem, current_user: &str, members: Option<&BTreeMap<String, BTreeSet<String>>>,
        configs: &mut ScheduleConfigs, out: &mut Vec<Target>) -> bool {
        let key = item.id.key_tuple();
        let Some(rows) = self.previous.items.get(&key) else { return false };
        if !rows.iter().all(|r| r.sources.iter().eq(item.sources.iter())) { return false; }
        let associated = item.sources.contains(people::ASSOCIATED_SOURCE_ID);
        if associated && rows.iter().any(|r| r.item_closed != Some(item.finished)) { return false; }
        if !associated && !members.and_then(|m| m.get(&key.0)).is_some_and(|known|
            rows.iter().flat_map(|r| &r.owners).any(|p| p.id != current_user && known.contains(&p.id))) { return false; }
        let space_type = (key.0.clone(), key.1.clone());
        if let Some(value) = self.previous.configs.get(&space_type) { configs.entry(space_type).or_insert(*value); }
        for row in rows {
            let node = (key.0.clone(), key.1.clone(), key.2.clone(), row.identity.node.clone());
            if let Some(value) = self.previous.required.get(&node) {
                self.required.insert(node, value.clone());
            }
        }
        out.extend_from_slice(rows);
        true
    }

    pub fn finish(&self, view: &LoadResult, configs: &ScheduleConfigs, required: &Required) {
        let Some((scope, generation)) = &self.key else { return };
        let mut slots = RECOVERY.lock().unwrap_or_else(|e| e.into_inner());
        let Some(saved) = slots.get_mut(scope).filter(|s| s.generation == *generation) else { return };
        if view.item_errors.is_empty() || view.account_error.is_some() {
            slots.remove(scope);
            return;
        }
        let failed: HashSet<_> = view.item_errors.iter().map(|e| (&e.project, &e.r#type, &e.item)).collect();
        let mut data = Checkpoint::default();
        data.configs.clone_from(configs);
        for row in &view.targets {
            let id = &row.identity;
            if !row.people_only || row.sources.len() != 1 || !matches!(row.sources[0].as_str(), people::ASSOCIATED_SOURCE_ID | people::SOURCE_ID)
                || failed.contains(&(&id.project, &id.r#type, &id.item))
                || configs.get(&(id.project.clone(), id.r#type.clone())).is_some_and(Result::is_err) { continue; }
            let node = (id.project.clone(), id.r#type.clone(), id.item.clone(), id.node.clone());
            if let Some(Some(value)) = required.get(&node) { data.required.insert(node, Some(value.clone())); }
            data.items.entry((id.project.clone(), id.r#type.clone(), id.item.clone())).or_default().push(row.clone());
        }
        saved.data = Arc::new(data);
        saved.completed_at = Some(Instant::now());
    }
}
