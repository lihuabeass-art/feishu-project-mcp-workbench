use fstodo_backend::detail::ItemDetail;
use fstodo_backend::model::domain::to_work_item;
use fstodo_backend::model::raw::RawTodoRecord;
use fstodo_backend::store::{ItemFilter, RunTrigger, Store};
use serde_json::json;

#[test]
fn flow_filter_and_pagination_use_nodes_from_the_latest_cached_detail() {
    use fstodo_backend::model::domain::FlowKind;
    let store = Store::in_memory().unwrap();
    let run = store.begin_run("todo", None, RunTrigger::Manual, Some("todo"), 1).unwrap();
    for (id, original_kind, nodes) in [
        ("upgraded", "none", json!([{"id":"dev","name":"研发中"}])),
        ("cleared", "node", json!([])),
        ("changed-state", "state", json!([{"id":"dev","name":"研发中"}])),
    ] {
        let raw = json!({"project_key":"space", "work_item_info":{
            "work_item_id":id, "work_item_type_key":"story", "work_item_name":id},
            "node_info": if original_kind == "node" {json!({"node_name":"旧节点"})} else {json!(null)},
            "state_info": if original_kind == "state" {json!({"start_state_key_name":"旧状态"})} else {json!(null)}});
        let item = to_work_item(&RawTodoRecord { item:serde_json::from_value(raw.clone()).unwrap(), raw }).unwrap();
        store.upsert_items(run, std::slice::from_ref(&item), 1).unwrap();
        store.save_item_detail(&ItemDetail { id:item.id.clone(), fetched_at_ms:2, pages:vec![],
            data:json!({"work_item_attribute":{"work_item_mod":"节点流"}, "work_item_current_node":nodes}) }).unwrap();
    }
    let node = ItemFilter { flow:Some(FlowKind::Node), ..Default::default() };
    let rows = store.query_items(&node).unwrap();
    assert_eq!(rows.iter().map(|row| row.item.id.work_item_id.as_str()).collect::<Vec<_>>(), ["changed-state", "upgraded"]);
    assert!(rows.iter().all(|row| row.item.flow.node_name.as_deref() == Some("研发中") && row.item.flow.start_state_key_name.is_none()));
    let page = store.query_items(&ItemFilter { limit:Some(1), offset:Some(1), ..node }).unwrap();
    assert_eq!(page.len(), 1);
    assert_eq!(page[0].item.id.work_item_id, "upgraded");
    let cleared = store.query_items(&ItemFilter { flow:Some(FlowKind::None), ..Default::default() }).unwrap();
    assert_eq!(cleared.len(), 1);
    assert_eq!(cleared[0].item.id.work_item_id, "cleared");
    assert!(store.query_items(&ItemFilter { flow:Some(FlowKind::State), ..Default::default() }).unwrap().is_empty());
}

#[test]
fn existing_detail_cache_exposes_atomic_nodes_without_splitting_labels_or_duplicating_items() {
    let path = std::env::temp_dir().join(format!("fstodo-node-filter-{}-{}.db", std::process::id(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
    let raw = json!({"project_key":"space", "work_item_info":{
        "work_item_id":"1", "work_item_type_key":"story", "work_item_name":"共同需求"},
        "node_info":{"node_name":"后端代码合入","node_state_key":"backend"}});
    let personal = to_work_item(&RawTodoRecord { item:serde_json::from_value(raw.clone()).unwrap(), raw }).unwrap();
    let mut detail = ItemDetail { id: personal.id.clone(), fetched_at_ms:1, pages:vec![],
        data:json!({"work_item_attribute":{"work_item_name":"共同需求"}, "work_item_current_node":[
            {"id":"front","name":"前端代码合入"}, {"id":"back","name":"后端代码合入"},
            {"id":"back2","name":"后端代码合入"}, {"id":"review","name":"评审 / 修订"},
            {"id":"blank","name":"  "}
        ]}) };
    {
        let store = Store::open(&path).unwrap();
        let a = store.begin_run("todo", None, RunTrigger::Manual, Some("todo"), 1).unwrap();
        store.upsert_items(a, std::slice::from_ref(&personal), 1).unwrap();
        assert_eq!(store.query_items(&ItemFilter::default()).unwrap()[0].current_node_names, None);
        // 使用升级前已经保存的详情格式，不添加新列或重新请求远端。
        store.save_item_detail(&detail).unwrap();
        let summary = fstodo_backend::detail::summary(&detail, serde_json::Value::Null);
        let related = to_work_item(&RawTodoRecord { item:serde_json::from_value(summary.clone()).unwrap(), raw:summary }).unwrap();
        let b = store.begin_run("work_item_type", None, RunTrigger::Manual, Some("stories"), 1).unwrap();
        for order in [[a, b], [b, a], [a, b]] {
            for run in order {
                let row = if run == a { &personal } else { &related };
                assert_eq!(store.upsert_items(run, std::slice::from_ref(row), 2).unwrap().updated, 0);
            }
        }
    }
    let store = Store::open(&path).unwrap();
    let items = store.query_items(&ItemFilter::default()).unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].source_ids.len(), 2);
    assert_eq!(items[0].current_node_names, Some(vec!["前端代码合入".into(), "后端代码合入".into(), "评审 / 修订".into()]));
    assert_eq!(items[0].item.flow.node_name.as_deref(), Some("前端代码合入 / 后端代码合入 / 评审 / 修订"));
    assert_eq!(items[0].personal_flows["todo"].node_name.as_deref(), Some("后端代码合入"));
    detail.data["work_item_current_node"] = json!([{"id":"testing","name":"需求测试"}]);
    store.save_item_detail(&detail).unwrap();
    let changed = store.query_items(&ItemFilter::default()).unwrap();
    assert_eq!(changed[0].current_node_names, Some(vec!["需求测试".into()]));
    assert_eq!(changed[0].item.flow.node_name.as_deref(), Some("需求测试"));
    assert_eq!(changed[0].item.flow.node_state_key.as_deref(), Some("testing"));
    detail.data["work_item_current_node"] = json!([]);
    store.save_item_detail(&detail).unwrap();
    let cleared = store.query_items(&ItemFilter::default()).unwrap();
    assert_eq!(cleared[0].current_node_names, Some(vec![]));
    assert_eq!(cleared[0].item.flow.node_name, None);
    assert_eq!(cleared[0].item.flow.node_state_key, None);
    assert_eq!(cleared[0].item.flow.kind, fstodo_backend::model::domain::FlowKind::None);
    drop(store);
    std::fs::remove_file(path).unwrap();
}
