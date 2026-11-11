use super::Store;
use crate::BackendError;
use rusqlite::{params, OptionalExtension};
use serde_json::Value;

pub(super) const SCHEMA: &str = "CREATE TABLE IF NOT EXISTS detail_display_preferences (
    account_key TEXT NOT NULL, project_key TEXT NOT NULL, type_key TEXT NOT NULL,
    document_json TEXT NOT NULL, PRIMARY KEY(account_key, project_key, type_key)
);";

impl Store {
    pub fn detail_display(&self, account: &str, project: &str, kind: &str) -> Result<Option<Value>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let value: Option<String> = conn.query_row(
            "SELECT document_json FROM detail_display_preferences WHERE account_key=?1 AND project_key=?2 AND type_key=?3",
            params![account, project, kind], |row| row.get(0)).optional()?;
        value.map(|value| serde_json::from_str(&value).map_err(BackendError::from)).transpose()
    }

    pub fn set_detail_display(&self, account: &str, project: &str, kind: &str, document: &Value) -> Result<(), BackendError> {
        self.conn.lock().expect("store mutex poisoned").execute(
            "INSERT INTO detail_display_preferences(account_key, project_key, type_key, document_json) VALUES (?1,?2,?3,?4)
            ON CONFLICT(account_key, project_key, type_key) DO UPDATE SET document_json=excluded.document_json",
            params![account, project, kind, serde_json::to_string(document)?])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reopen_preserves_keys_and_isolates_account_space_and_type() {
        let path = std::env::temp_dir().join(format!("fstodo-detail-{}-{}.db", std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        let document = serde_json::json!({"schemaVersion":1,"pinnedKeys":["field_code","field_doc"]});
        {
            let store = Store::open(&path).unwrap();
            store.set_detail_display("a", "space", "story", &document).unwrap();
        }
        {
            let store = Store::open(&path).unwrap();
            assert_eq!(store.detail_display("a", "space", "story").unwrap(), Some(document));
            for (account, space, kind) in [("b", "space", "story"), ("a", "other", "story"), ("a", "space", "issue")] {
                assert_eq!(store.detail_display(account, space, kind).unwrap(), None);
            }
        }
        std::fs::remove_file(path).unwrap();
    }
}
