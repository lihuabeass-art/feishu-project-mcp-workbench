use fstodo_backend::{api::Session, schedule::ScheduleSession, Config};

#[test]
fn missing_credentials_report_incomplete_instead_of_claiming_cached_data_is_current() {
    let dir = std::env::temp_dir().join(format!("schedule-offline-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
    std::fs::create_dir_all(&dir).unwrap();
    let config = dir.join("config.toml");
    std::fs::write(&config, "token_env='MISSING_SCHEDULE_TEST_TOKEN'
[[source]]
id='a'
kind='personal_todo'
action='todo'
enabled=true
[[source]]
id='other'
kind='work_item_type'
project_key='p'
work_item_type_key='story'
enabled=true
").unwrap();
    let session = Session::open(Config::load(Some(&config), Some(&dir.join("cache.db"))).unwrap()).unwrap();
    let view = ScheduleSession::load(&session).unwrap().view;
    assert!(view.account_error.is_some());
    assert_eq!(view.read_requests, 0);
    assert_eq!(view.sources.len(), 1);
    assert_eq!(view.sources[0].id, "a");
    assert!(!view.sources[0].complete && view.sources[0].error.is_some());
    assert!(view.targets.is_empty());
    drop(session); std::fs::remove_dir_all(dir).unwrap();
}
