use super::Store;
use crate::BackendError;
use rusqlite::{params, OptionalExtension};
use serde_json::Value;

pub(super) const SCHEMA: &str = "CREATE TABLE IF NOT EXISTS filter_scheme_preferences (
    account_key TEXT PRIMARY KEY, document_json TEXT NOT NULL
);";

impl Store {
    pub fn filter_schemes(&self, account: &str) -> Result<Option<Value>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let value: Option<String> = conn.query_row("SELECT document_json FROM filter_scheme_preferences WHERE account_key=?1", [account], |row| row.get(0)).optional()?;
        value.map(|value| serde_json::from_str(&value).map_err(BackendError::from)).transpose()
    }
    pub fn set_filter_schemes(&self, account: &str, document: &Value) -> Result<(), BackendError> {
        self.conn.lock().expect("store mutex poisoned").execute(
            "INSERT INTO filter_scheme_preferences(account_key, document_json) VALUES (?1,?2) ON CONFLICT(account_key) DO UPDATE SET document_json=excluded.document_json",
            params![account, serde_json::to_string(document)?])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn current_version_missing_scheme_table_is_repaired_on_open_without_losing_preferences() {
        let path = std::env::temp_dir().join(format!("fstodo-filter-upgrade-{}-{}.db", std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        let preferences = std::collections::BTreeMap::from([("issue".into(), super::super::TypePreference {
            enabled: true, alias: "缺陷".into(), create_enabled: true,
        })]);
        {
            let store = Store::open(&path).unwrap();
            store.set_source_type_preferences("personal", &preferences).unwrap();
            store.conn.lock().unwrap().execute_batch("DROP TABLE filter_scheme_preferences;").unwrap();
        }
        let document = json!({"schemaVersion":1,"schemes":[{"id":"saved","name":"个人方案"}],"defaultId":"saved"});
        for reopen in 0..2 {
            let store = Store::open(&path).unwrap();
            assert!(super::super::schema_is_current(&store.conn.lock().unwrap()).unwrap());
            assert_eq!(store.conn.lock().unwrap().query_row::<i64, _, _>("PRAGMA user_version", [], |row| row.get(0)).unwrap(), super::super::SCHEMA_VERSION);
            assert_eq!(store.source_type_preferences().unwrap().unwrap()["personal"], preferences);
            assert_eq!(store.filter_schemes("feishu-project:other").unwrap(), None);
            if reopen == 0 {
                assert_eq!(store.filter_schemes("feishu-project:owner").unwrap(), None);
                store.set_filter_schemes("feishu-project:owner", &document).unwrap();
            }
            assert_eq!(store.filter_schemes("feishu-project:owner").unwrap(), Some(document.clone()));
        }
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn upgrade_reopen_preserves_all_schemes_and_default_and_account_isolation() {
        let path = std::env::temp_dir().join(format!("fstodo-filter-{}-{}.db", std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        let filters = json!({"query":"", "space":["space-a","space-b"],"spaceLabel":{"space-a":"空间甲"},
            "type":["story","issue"],"typeLabel":{"story":"需求"},"project":["space-a|project-1"],"projectLabel":{"space-a|project-1":"项目甲"},
            "flowKind":["node","state"],"nodeName":["研发","测试"],"stateName":["待处理"]});
        let mut searched_filters = filters.clone();
        searched_filters["query"] = json!("已保存关键词");
        let document = json!({"schemaVersion":1,"schemes":[
            {"id":"a","name":"A","includeQuery":false,"filters":filters},
            {"id":"b","name":"B","includeQuery":true,"filters":searched_filters}
        ],"defaultId":"b"});
        {
            let store = Store::open(&path).unwrap();
            store.set_filter_schemes("feishu-project:one", &document).unwrap();
            assert_eq!(store.filter_schemes("feishu-project:two").unwrap(), None);
            store.set_filter_schemes("feishu-project:two", &json!({"schemes":[]})).unwrap();
        }
        for _ in 0..2 {
            let store = Store::open(&path).unwrap();
            assert_eq!(store.filter_schemes("feishu-project:one").unwrap(), Some(document.clone()));
        }
        std::fs::remove_file(path).unwrap();
    }
}
