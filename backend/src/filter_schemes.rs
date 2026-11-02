//! Personal, local saved filters. Schema version belongs to the document, not the app.
use crate::{api::Session, BackendError};
use serde::Serialize;
use serde_json::{json, Value};

#[derive(Serialize)]
pub struct FilterSchemePreferences {
    pub account: String,
    pub document: Option<Value>,
}

pub fn account(session: &Session) -> Result<String, BackendError> {
    let value = session.call_read_tool("search_user_info", json!({"user_keys":["current_login_user()"]}).as_object().unwrap())?;
    let users = value.as_array().filter(|users| users.len() == 1)
        .ok_or_else(|| BackendError::validation("未能确认当前飞书账号，请检查连接后重试"))?;
    let key = users[0]["user_key"].as_str().filter(|key| !key.trim().is_empty())
        .ok_or_else(|| BackendError::validation("当前飞书账号缺少身份标识"))?;
    Ok(format!("feishu-project:{key}"))
}

pub fn load(session: &Session) -> Result<FilterSchemePreferences, BackendError> {
    let account = account(session)?;
    let document = session.store.filter_schemes(&account)?;
    Ok(FilterSchemePreferences { account, document })
}

pub fn save(session: &Session, expected_account: &str, document: &Value) -> Result<(), BackendError> {
    if account(session)? != expected_account {
        return Err(BackendError::validation("飞书账号已变化，请重新加载筛选方案"));
    }
    session.store.set_filter_schemes(expected_account, document)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp::{ConnectionInfo, TodoSource, ToolResultPayload};
    use async_trait::async_trait;
    use std::sync::{Arc, Mutex};

    struct Identity(Mutex<Option<String>>);
    #[async_trait]
    impl TodoSource for Arc<Identity> {
        async fn describe(&self) -> Result<ConnectionInfo, BackendError> { unreachable!() }
        async fn close(&mut self) {}
        async fn call_tool(&self, tool: &str, args: &serde_json::Map<String, Value>) -> Result<ToolResultPayload, BackendError> {
            assert_eq!(tool, "search_user_info");
            assert_eq!(args, json!({"user_keys":["current_login_user()"]}).as_object().unwrap());
            let key = self.0.lock().unwrap().clone().ok_or_else(|| BackendError::validation("身份读取失败"))?;
            Ok(ToolResultPayload { is_error: false, structured: Some(json!([{"user_key":key,"name_cn":"显示名不参与归属"}])), text_blocks: vec![] })
        }
    }

    #[test]
    fn identity_contract_rotation_isolation_and_write_guard() {
        let dir = std::env::temp_dir().join(format!("fstodo-filter-account-{}-{}", std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("token"), "filter-account-original-token").unwrap();
        std::fs::write(dir.join("config.toml"), format!("token_env='FSTODO_ABSENT_FILTER_TEST_TOKEN'\ntoken_file='{}'\n[[source]]\nid='personal'\nkind='personal_todo'\nenabled=true\naction='todo'\n", dir.join("token").display().to_string().replace('\\', "/"))).unwrap();
        let session = Session::open(crate::Config::load(Some(&dir.join("config.toml")), Some(&dir.join("cache.db"))).unwrap()).unwrap();
        let identity = Arc::new(Identity(Mutex::new(Some("user-a".into()))));
        let remote = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(identity.clone()));
        let original = json!({"schemaVersion":1,"schemes":[{"id":"a","name":"甲"},{"id":"b","name":"乙"}],"defaultId":"b"});
        let first = load(&session).unwrap();
        assert_eq!(first.account, "feishu-project:user-a");
        assert_eq!(first.document, None);
        save(&session, &first.account, &original).unwrap();

        std::fs::write(dir.join("token"), "filter-account-rotated-token").unwrap();
        let rotated = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(identity.clone()));
        let restored = load(&session).unwrap();
        assert_eq!(restored.account, first.account);
        assert_eq!(restored.document, Some(original.clone()));

        *identity.0.lock().unwrap() = Some("user-b".into());
        assert_eq!(load(&session).unwrap().document, None);
        assert!(save(&session, &first.account, &json!({"wrong":"account"})).is_err());
        assert_eq!(session.store.filter_schemes(&first.account).unwrap(), Some(original.clone()));
        assert_eq!(session.store.filter_schemes("feishu-project:user-b").unwrap(), None);

        *identity.0.lock().unwrap() = None;
        assert!(load(&session).is_err());
        assert!(save(&session, &first.account, &json!({"identity":"unconfirmed"})).is_err());
        assert_eq!(session.store.filter_schemes(&first.account).unwrap(), Some(original));
        drop(rotated); drop(remote); drop(session);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
