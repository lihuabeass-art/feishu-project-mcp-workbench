use super::*;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub(super) const SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS schedule_cache (
        scope TEXT NOT NULL, page TEXT NOT NULL, observed_at INTEGER NOT NULL,
        header TEXT NOT NULL, PRIMARY KEY(scope, page)
    );
    CREATE TABLE IF NOT EXISTS schedule_cache_target (
        scope TEXT NOT NULL, page TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY(scope, page, id),
        FOREIGN KEY(scope, page) REFERENCES schedule_cache(scope, page) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS schedule_profiles (
        scope TEXT NOT NULL, id TEXT NOT NULL, profile TEXT NOT NULL, saved_at INTEGER NOT NULL,
        PRIMARY KEY(scope,id)
    );
    CREATE TABLE IF NOT EXISTS schedule_avatar_cache (
        scope TEXT NOT NULL, image_key TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL,
        saved_at INTEGER NOT NULL, PRIMARY KEY(scope, image_key)
    );";

impl TypeScope {
    pub(crate) fn schedule_cache_signature(&self) -> (bool, BTreeSet<&str>) {
        let keys = self.disabled_types.as_ref().unwrap_or(&self.keys);
        (
            self.disabled_types.is_some(),
            keys.iter().map(String::as_str).collect(),
        )
    }
}

impl Store {
    pub(crate) fn schedule_profiles(&self, scope: &str, ids: &BTreeSet<String>, since: i64)
        -> Result<BTreeMap<String, crate::schedule::Person>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let mut stmt = conn.prepare("SELECT profile FROM schedule_profiles WHERE scope=?1 AND id=?2 AND saved_at>=?3")?;
        let mut result = BTreeMap::new();
        for id in ids {
            let raw: Option<String> = stmt.query_row(params![scope,id,since], |row| row.get(0)).optional()?;
            if let Some(raw) = raw { result.insert(id.clone(), serde_json::from_str(&raw)?); }
        }
        Ok(result)
    }

    pub(crate) fn save_schedule_profiles(&self, scope: &str, profiles: &[crate::schedule::Person], now: i64) -> Result<(), BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let tx = Transaction::new_unchecked(&conn, TransactionBehavior::Immediate)?;
        for person in profiles {
            tx.execute("INSERT INTO schedule_profiles VALUES (?1,?2,?3,?4)
                ON CONFLICT(scope,id) DO UPDATE SET profile=excluded.profile,saved_at=excluded.saved_at
                WHERE excluded.saved_at >= schedule_profiles.saved_at",
                params![scope,person.id,serde_json::to_string(person)?,now])?;
        }
        tx.execute("DELETE FROM schedule_profiles WHERE saved_at < ?1", [now - 30 * 86_400_000])?;
        tx.commit()?;
        Ok(())
    }

    pub(crate) fn read_schedule_cache_header(
        &self,
        scope: &str,
        page: &str,
    ) -> Result<Option<Value>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let header: Option<String> = conn
            .query_row(
                "SELECT header FROM schedule_cache WHERE scope=?1 AND page=?2",
                params![scope, page],
                |row| row.get(0),
            )
            .optional()?;
        Ok(header
            .map(|value| serde_json::from_str(&value))
            .transpose()?)
    }

    pub(crate) fn read_schedule_avatar(
        &self,
        scope: &str,
        key: &str,
    ) -> Result<Option<(String, Vec<u8>)>, BackendError> {
        let connection = self.conn.lock().expect("store mutex poisoned");
        Ok(connection
            .query_row(
                "SELECT mime,data FROM schedule_avatar_cache WHERE scope=?1 AND image_key=?2",
                params![scope, key],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?)
    }

    pub(crate) fn save_schedule_avatar(
        &self,
        scope: &str,
        key: &str,
        mime: &str,
        bytes: &[u8],
    ) -> Result<(), BackendError> {
        let connection = self.conn.lock().expect("store mutex poisoned");
        let tx = Transaction::new_unchecked(&connection, TransactionBehavior::Immediate)?;
        tx.execute(
            "INSERT OR IGNORE INTO schedule_avatar_cache(scope,image_key,mime,data,saved_at) VALUES(?1,?2,?3,?4,?5)",
            params![scope, key, mime, bytes, crate::sync::now_ms()],
        )?;
        tx.execute("DELETE FROM schedule_avatar_cache WHERE rowid IN (
            SELECT rowid FROM schedule_avatar_cache ORDER BY saved_at DESC,rowid DESC LIMIT -1 OFFSET 256
        )", [])?;
        tx.commit()?;
        Ok(())
    }

    pub(crate) fn read_schedule_cache(
        &self,
        scope: &str,
        page: &str,
    ) -> Result<Option<Value>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let tx = Transaction::new_unchecked(&conn, TransactionBehavior::Deferred)?;
        let header: Option<String> = tx
            .query_row(
                "SELECT header FROM schedule_cache WHERE scope=?1 AND page=?2",
                params![scope, page],
                |row| row.get(0),
            )
            .optional()?;
        let Some(header) = header else {
            return Ok(None);
        };
        let mut result: Value = serde_json::from_str(&header)?;
        let mut statement = tx.prepare(
            "SELECT data FROM schedule_cache_target WHERE scope=?1 AND page=?2 ORDER BY id",
        )?;
        let targets = statement
            .query_map(params![scope, page], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        result["targets"] = Value::Array(
            targets
                .iter()
                .map(|raw| serde_json::from_str(raw))
                .collect::<Result<_, _>>()?,
        );
        Ok(Some(result))
    }

    #[cfg(test)]
    pub(crate) fn save_schedule_cache(
        &self,
        scope: &str,
        page: &str,
        observed_at: i64,
        snapshot: Value,
    ) -> Result<(), BackendError> {
        self.merge_schedule_cache(scope, page, observed_at, snapshot, true)
    }

    pub(crate) fn merge_schedule_cache(
        &self, scope: &str, page: &str, observed_at: i64, mut snapshot: Value, complete: bool,
    ) -> Result<(), BackendError> {
        let Some(Value::Array(targets)) = snapshot
            .as_object_mut()
            .and_then(|object| object.remove("targets"))
        else {
            return Err(BackendError::validation("本地排期缓存缺少目标列表"));
        };
        let item_key = |value: &Value| {
            Some((value["project"].as_str()?.to_owned(), value["type"].as_str()?.to_owned(), value["item"].as_str()?.to_owned()))
        };
        let mut confirmed_items = BTreeSet::new();
        let mut keep_previous = BTreeSet::new();
        if !complete && page == "recent" {
            confirmed_items.extend(targets.iter().filter_map(|row| item_key(&row["identity"])));
            let failed: BTreeSet<_> = snapshot["item_errors"].as_array().into_iter().flatten().filter_map(item_key).collect();
            confirmed_items.retain(|item| !failed.contains(item));
            for row in &targets {
                if item_key(&row["identity"]).is_some_and(|item| failed.contains(&item)) {
                    if let Some(id) = row["id"].as_str() { keep_previous.insert(id.to_owned()); }
                }
            }
        }
        let targets = targets
            .into_iter()
            .map(|target| {
                let id = target["id"]
                    .as_str()
                    .ok_or_else(|| BackendError::validation("本地排期缓存缺少目标标识"))?;
                Ok((id.to_owned(), serde_json::to_string(&target)?))
            })
            .collect::<Result<BTreeMap<_, _>, BackendError>>()?;
        let conn = self.conn.lock().expect("store mutex poisoned");
        let tx = Transaction::new_unchecked(&conn, TransactionBehavior::Immediate)?;
        let previous_user: Option<String> = tx.query_row(
            "SELECT json_extract(header,'$.current_user') FROM schedule_cache WHERE scope=?1 AND page=?2",
            params![scope, page], |row| row.get(0),
        ).optional()?.flatten();
        let replace = complete || previous_user.as_deref() != snapshot["current_user"].as_str();
        let accepted = tx.execute(
            "INSERT INTO schedule_cache(scope,page,observed_at,header) VALUES(?1,?2,?3,?4)
             ON CONFLICT(scope,page) DO UPDATE SET observed_at=excluded.observed_at,header=excluded.header
             WHERE schedule_cache.observed_at <= excluded.observed_at",
            params![scope, page, observed_at, serde_json::to_string(&snapshot)?],
        )?;
        if accepted == 0 {
            return Ok(());
        }
        {
            let mut statement = tx.prepare("SELECT id, CASE WHEN ?3 THEN NULL ELSE json_extract(data,'$.identity') END
                FROM schedule_cache_target WHERE scope=?1 AND page=?2")?;
            let mut rows = statement.query(params![scope, page, replace])?;
            let mut remove = Vec::new();
            while let Some(row) = rows.next()? {
                let id: String = row.get(0)?;
                if targets.contains_key(&id) { continue; }
                let identity: Option<String> = row.get(1)?;
                let key = identity.and_then(|raw| serde_json::from_str(&raw).ok()).as_ref().and_then(item_key);
                if replace || key.is_some_and(|key| confirmed_items.contains(&key)) { remove.push(id); }
            }
            drop(rows);
            for id in remove {
                tx.execute("DELETE FROM schedule_cache_target WHERE scope=?1 AND page=?2 AND id=?3", params![scope, page, id])?;
            }
        }
        {
            let mut upsert = tx.prepare(
                "INSERT INTO schedule_cache_target(scope,page,id,data) VALUES(?1,?2,?3,?4)
                 ON CONFLICT(scope,page,id) DO UPDATE SET data=excluded.data
                 WHERE ?5 AND schedule_cache_target.data <> excluded.data",
            )?;
            for (id, data) in targets {
                upsert.execute(params![scope, page, id, data, replace || !keep_previous.contains(&id)])?;
            }
        }
        tx.execute(
            "DELETE FROM schedule_cache WHERE observed_at < ?1 OR (scope=?2 AND page IN (
                SELECT page FROM schedule_cache WHERE scope=?2 AND page <> 'recent'
                ORDER BY observed_at DESC, page LIMIT -1 OFFSET 12
            ))",
            params![observed_at - 30 * 86_400_000, scope],
        )?;
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn partial_team_cache_replaces_confirmed_items_and_preserves_unread_items_only_in_same_account() {
        let store = Store::in_memory().unwrap();
        let row = |item, id| json!({"id":id,"identity":{"project":"p","type":"story","item":item}});
        let a = row("a", "old");
        let b = row("b", "b");
        let next = row("a", "new");
        store.save_schedule_cache("scope", "recent", 1, json!({"current_user":"me","targets":[a,b]})).unwrap();
        store.merge_schedule_cache("scope", "recent", 3, json!({"current_user":"me","targets":[next],
            "item_errors":[{"project":"p","type":"story","item":"b"}]}), false).unwrap();
        store.save_schedule_cache("scope", "recent", 2, json!({"current_user":"me","targets":[]})).unwrap();
        assert_eq!(store.read_schedule_cache("scope", "recent").unwrap().unwrap()["targets"], json!([b,next]));
        store.merge_schedule_cache("scope", "recent", 4, json!({"current_user":"other","targets":[a]}), false).unwrap();
        assert_eq!(store.read_schedule_cache("scope", "recent").unwrap().unwrap()["targets"], json!([a]));
    }

    #[test]
    fn only_changed_targets_are_written_and_late_reads_cannot_revert_them() {
        let store = Store::in_memory().unwrap();
        let a = json!({"id":"a","date":"2026-11-26"});
        let b = json!({"id":"b","date":"2026-11-27"});
        let changed = json!({"id":"b","date":""});
        let first = json!({"targets":[a,b]});
        store
            .save_schedule_cache("account", "recent", 1, first.clone())
            .unwrap();
        store
            .conn
            .lock()
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER reject_unchanged BEFORE UPDATE ON schedule_cache_target
             WHEN OLD.data = NEW.data BEGIN SELECT RAISE(ABORT, 'unchanged row'); END;",
            )
            .unwrap();
        store
            .save_schedule_cache("account", "recent", 2, json!({"targets":[changed,a]}))
            .unwrap();
        store
            .save_schedule_cache("account", "recent", 1, first)
            .unwrap();
        assert_eq!(
            store.read_schedule_cache("account", "recent").unwrap(),
            Some(json!({"targets":[a,changed]}))
        );
        assert!(store
            .read_schedule_cache("other", "recent")
            .unwrap()
            .is_none());
        store
            .save_schedule_cache("account", "recent", 3, json!({"targets":[changed]}))
            .unwrap();
        assert_eq!(
            store.read_schedule_cache("account", "recent").unwrap(),
            Some(json!({"targets":[changed]}))
        );
    }

    #[test]
    fn avatar_bytes_survive_reopening_and_are_isolated_by_connection() {
        let path = std::env::temp_dir().join(format!(
            "fstodo-avatar-{}-{}.db",
            std::process::id(),
            crate::sync::now_ms()
        ));
        let bytes = [1, 2, 3];
        let store = Store::open(&path).unwrap();
        store
            .save_schedule_avatar("account", "image", "image/png", &bytes)
            .unwrap();
        drop(store);
        let reopened = Store::open(&path).unwrap();
        assert_eq!(
            reopened.read_schedule_avatar("account", "image").unwrap(),
            Some(("image/png".into(), bytes.to_vec()))
        );
        assert!(reopened
            .read_schedule_avatar("other", "image")
            .unwrap()
            .is_none());
        drop(reopened);
        std::fs::remove_file(path).unwrap();
    }
}
