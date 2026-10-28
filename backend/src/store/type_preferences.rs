use std::collections::BTreeMap;

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};

use super::Store;
use crate::error::BackendError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TypePreference {
    pub enabled: bool,
    pub alias: String,
}

pub type TypePreferences = BTreeMap<String, TypePreference>;
pub type SourceTypePreferences = BTreeMap<String, TypePreferences>;

pub(super) const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS source_type_preferences (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    preferences_json TEXT NOT NULL
);";

fn read(conn: &Connection) -> Result<Option<SourceTypePreferences>, BackendError> {
    let json: Option<String> = conn
        .query_row(
            "SELECT preferences_json FROM source_type_preferences WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    json.map(|value| serde_json::from_str(&value).map_err(BackendError::from))
        .transpose()
}

impl Store {
    /// None 表示尚未迁移；已保存的空配置也必须优先于旧界面缓存。
    pub fn source_type_preferences(&self) -> Result<Option<SourceTypePreferences>, BackendError> {
        read(&self.conn.lock().expect("store mutex poisoned"))
    }

    /// 多窗口首次启动时只迁移一次，返回数据库中最终生效的配置。
    pub fn initialize_source_type_preferences(
        &self,
        preferences: &SourceTypePreferences,
    ) -> Result<SourceTypePreferences, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let tx = Transaction::new_unchecked(&conn, TransactionBehavior::Immediate)?;
        tx.execute(
            "INSERT OR IGNORE INTO source_type_preferences (id, preferences_json) VALUES (1, ?1)",
            [serde_json::to_string(preferences)?],
        )?;
        let saved = read(&tx)?.expect("preferences initialized in transaction");
        tx.commit()?;
        Ok(saved)
    }

    /// 只替换本次编辑的来源，避免其他窗口保存时覆盖无关来源。
    pub fn set_source_type_preferences(
        &self,
        source_id: &str,
        preferences: &TypePreferences,
    ) -> Result<(), BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let tx = Transaction::new_unchecked(&conn, TransactionBehavior::Immediate)?;
        let mut saved = read(&tx)?.unwrap_or_default();
        saved.insert(source_id.to_owned(), preferences.clone());
        tx.execute(
            "INSERT INTO source_type_preferences (id, preferences_json) VALUES (1, ?1)
             ON CONFLICT(id) DO UPDATE SET preferences_json = excluded.preferences_json",
            params![serde_json::to_string(&saved)?],
        )?;
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn preferences(enabled: bool, alias: &str) -> TypePreferences {
        BTreeMap::from([(
            "story".into(),
            TypePreference {
                enabled,
                alias: alias.into(),
            },
        )])
    }

    #[test]
    fn type_preferences_survive_upgrade_reopen_and_source_edits() {
        let path = std::env::temp_dir().join(format!(
            "fstodo-preferences-{}-{}.db",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        {
            let store = Store::open(&path).unwrap();
            store
                .conn
                .lock()
                .unwrap()
                .execute_batch("DROP TABLE source_type_preferences; PRAGMA user_version=15;")
                .unwrap();
        }
        let legacy = BTreeMap::from([
            ("a".into(), preferences(false, "甲需求")),
            ("b".into(), preferences(true, "乙需求")),
        ]);
        {
            let store = Store::open(&path).unwrap();
            assert_eq!(store.source_type_preferences().unwrap(), None);
            assert_eq!(
                store.initialize_source_type_preferences(&legacy).unwrap(),
                legacy
            );
            store
                .set_source_type_preferences("a", &preferences(true, ""))
                .unwrap();
        }
        for _ in 0..2 {
            let store = Store::open(&path).unwrap();
            let saved = store.initialize_source_type_preferences(&legacy).unwrap();
            assert_eq!(saved["a"], preferences(true, ""));
            assert_eq!(saved["b"], preferences(true, "乙需求"));
            assert!(!saved.contains_key("new-source"));
        }
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn empty_preferences_are_initialized_and_cannot_be_overwritten_by_legacy_cache() {
        let store = Store::in_memory().unwrap();
        store
            .initialize_source_type_preferences(&BTreeMap::new())
            .unwrap();
        let legacy = BTreeMap::from([("a".into(), preferences(false, "过时名称"))]);
        assert_eq!(
            store.initialize_source_type_preferences(&legacy).unwrap(),
            BTreeMap::new()
        );
        store
            .set_source_type_preferences("a", &preferences(false, ""))
            .unwrap();
        store
            .set_source_type_preferences("b", &preferences(true, "乙"))
            .unwrap();
        store
            .set_source_type_preferences("a", &BTreeMap::new())
            .unwrap();
        let saved = store.source_type_preferences().unwrap().unwrap();
        assert!(saved["a"].is_empty());
        assert_eq!(saved["b"], preferences(true, "乙"));
    }
}
