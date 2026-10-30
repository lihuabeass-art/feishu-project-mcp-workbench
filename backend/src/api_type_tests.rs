use super::*;
use serde_json::json;

fn cached(project: &str, name: &str) -> CachedType {
    CachedType { project_key: project.into(), project_name: project.into(), type_key: "703000000001".into(),
        type_name: name.into(), discovered_at_ms: 1 }
}

#[test]
fn type_names_upgrade_rename_and_persist_without_changing_work_or_preferences() {
    let path = std::env::temp_dir().join(format!("fstodo-type-names-{}-{}.db",
        std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap()));
    {
        let store = Store::open(&path).unwrap();
        store.save_source_types("a", &[cached("space", "703000000001")], 1).unwrap();
        store.set_source_type_scope("a", &[], 1).unwrap();
        let preferences = std::collections::BTreeMap::from([("703000000001".into(),
            crate::store::TypePreference { enabled: false, alias: "我的名称".into() })]);
        store.set_source_type_preferences("a", &preferences).unwrap();
        store.set_type_order(&["703000000001".into()]).unwrap();
        let raw = json!({"project_key":"space", "work_item_info":{
            "work_item_id":"1", "work_item_type_key":"703000000001", "work_item_name":"反馈事项"}});
        let item = crate::model::domain::to_work_item(&crate::model::raw::RawTodoRecord {
            item: serde_json::from_value(raw.clone()).unwrap(), raw,
        }).unwrap();
        let run = store.begin_run("todo", None, RunTrigger::Manual, Some("a"), 1).unwrap();
        store.upsert_items(run, &[item], 1).unwrap();
        let runs = serde_json::to_value(store.recent_runs(10).unwrap()).unwrap();
        let before = store.query_items(&ItemFilter::default()).unwrap();
        for (now, name) in [(2, "需求反馈"), (3, "产品反馈")] {
            let result = refresh_type_snapshot(&store, "a", &[("space".into(), "空间".into())], now, None,
                |_| Ok(json!({"list":[{"type_key":"703000000001","name":name}]}))).unwrap();
            assert!(result.failed.is_empty());
            assert_eq!(store.source_types("a").unwrap()[0].type_name, name);
            assert!(!store.source_type_scope("a").unwrap().unwrap().allows("space", "703000000001"));
            assert_eq!(store.source_type_preferences().unwrap().unwrap()["a"], preferences);
            let patch = cache_patch(&before, &store.query_items(&ItemFilter::default()).unwrap()).unwrap();
            assert_eq!(patch, json!({"added":[],"modified":[],"removed":[],"updated_count":0}));
            assert_eq!(serde_json::to_value(store.recent_runs(10).unwrap()).unwrap(), runs);
            assert_eq!(store.type_order().unwrap(), ["703000000001"]);
        }
    }
    {
        let store = Store::open(&path).unwrap();
        assert_eq!(store.source_types("a").unwrap()[0].type_name, "产品反馈");
    }
    std::fs::remove_file(path).unwrap();
}

#[test]
fn partial_type_discovery_preserves_failed_and_empty_spaces_with_their_timestamps() {
    let store = Store::in_memory().unwrap();
    store.save_source_types("a", &[cached("good", "旧名称"), cached("failed", "失败空间旧名称"),
        cached("empty", "空响应旧名称")], 1).unwrap();
    store.save_source_types("b", &[cached("good", "其他来源名称")], 1).unwrap();
    let projects = ["good", "failed", "empty"].map(|s| (s.into(), s.into()));
    let result = refresh_type_snapshot(&store, "a", &projects, 2, Some("test-secret"), |key| match key {
        "good" => Ok(json!({"list":[{"type_key":"703000000001","name":"新名称"}]})),
        "empty" => Ok(json!({"list":[]})),
        _ => Err(BackendError::Permission { detail: "test-secret 读取失败".into() }),
    }).unwrap();
    assert_eq!(result.types.len(), 1);
    assert_eq!(result.failed.len(), 1);
    assert_eq!(result.failure_kinds, ["permission"]);
    assert!(!result.failed[0].1.contains("test-secret"));
    let saved = store.source_types("a").unwrap();
    for (key, name, at) in [("good", "新名称", 2), ("failed", "失败空间旧名称", 1), ("empty", "空响应旧名称", 1)] {
        let kind = saved.iter().find(|t| t.project_key == key).unwrap();
        assert_eq!(kind.type_name, name);
        assert_eq!(kind.discovered_at_ms, at);
    }
    assert_eq!(store.source_types("b").unwrap()[0].type_name, "其他来源名称");
}

#[test]
fn failed_malformed_or_empty_type_reads_do_not_erase_names_and_can_recover() {
    let store = Store::in_memory().unwrap();
    store.save_source_types("a", &[cached("space", "旧名称")], 1).unwrap();
    let projects = [("space".into(), "空间".into())];
    for response in [json!({}), json!({"list":null}), json!({"list":[]}),
        json!({"list":[{"name":"没有标识"}]}),
        json!({"list":[{"type_key":"703000000001","name":"  "}]})] {
        let _ = refresh_type_snapshot(&store, "a", &projects, 2, None, |_| Ok(response.clone()));
        assert_eq!(store.source_types("a").unwrap()[0].type_name, "旧名称");
    }
    let error = refresh_type_snapshot(&store, "a", &projects, 3, None,
        |_| Err(BackendError::validation("暂时失败"))).unwrap_err();
    assert_eq!(error.kind(), crate::error::ErrorKind::Validation);
    refresh_type_snapshot(&store, "a", &projects, 4, None,
        |_| Ok(json!({"list":[{"type_key":"703000000001","name":"恢复后名称"}]}))).unwrap();
    assert_eq!(store.source_types("a").unwrap()[0].type_name, "恢复后名称");
}

#[test]
fn all_failed_spaces_keep_actionable_errors_even_when_a_transient_error_arrives_first() {
    use crate::error::ErrorKind;
    for kind in [ErrorKind::Auth, ErrorKind::Credential, ErrorKind::Permission, ErrorKind::Config] {
        for reverse in [false, true] {
            let store = Store::in_memory().unwrap();
            store.save_source_types("a", &[cached("temporary", "旧名称甲"), cached("action", "旧名称乙")], 1).unwrap();
            let mut projects = vec![("temporary".into(), "甲空间".into()), ("action".into(), "乙空间".into())];
            if reverse { projects.reverse(); }
            let error = refresh_type_snapshot(&store, "a", &projects, 2, None, |project| {
                Err(if project == "temporary" {
                    BackendError::Connection { endpoint: "fake://local".into(), detail: "暂时断开".into() }
                } else {
                    match kind {
                        ErrorKind::Auth => BackendError::Auth { endpoint: "fake://local".into(), challenge: None, detail: "需要认证".into() },
                        ErrorKind::Credential => BackendError::Credential { message: "需要凭证".into() },
                        ErrorKind::Permission => BackendError::Permission { detail: "需要权限".into() },
                        _ => BackendError::config("需要配置"),
                    }
                })
            }).unwrap_err();
            assert_eq!(error.kind(), kind);
            let saved = store.source_types("a").unwrap();
            assert_eq!(saved.len(), 2);
            assert!(saved.iter().all(|t| t.discovered_at_ms == 1));
        }
    }
}
