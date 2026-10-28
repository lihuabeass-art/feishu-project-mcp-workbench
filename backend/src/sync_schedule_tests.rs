use super::*;
use crate::{detail::{self, ItemDetail}, model::{domain::{Schedule, WorkItem, to_work_item}, raw::RawTodoRecord}};
use serde_json::json;

fn item(raw: Value) -> WorkItem {
    to_work_item(&RawTodoRecord { item:serde_json::from_value(raw.clone()).unwrap(),raw }).unwrap()
}

fn fixture() -> (Store, ItemDetail, WorkItem, WorkItem, i64, i64) {
    let store=Store::in_memory().unwrap();
    let personal=item(json!({"project_key":"p","project_name":"空间",
        "work_item_info":{"work_item_id":"1","work_item_type_key":"story","work_item_name":"共同事项"},
        "node_info":{"node_name":"研发","node_state_key":"dev"},
        "schedule":{"start_time":"2026-10-19","end_time":"2026-10-23"}}));
    let detail=ItemDetail { id:personal.id.clone(),fetched_at_ms:1,pages:vec![],data:json!({
        "work_item_attribute":{"owned_project":{"name":"空间"},"work_item_name":"共同事项"},
        "work_item_current_node":[{"id":"dev","name":"研发"}],"work_item_fields":[] }) };
    let related=item(detail::summary(&detail,Value::Null));
    store.save_item_detail(&detail).unwrap();
    let a=store.begin_run("todo",None,RunTrigger::Manual,Some("personal"),1).unwrap();
    let b=store.begin_run("work_item_type",None,RunTrigger::Manual,Some("related"),1).unwrap();
    store.upsert_items(a,&[personal.clone()],1).unwrap();
    store.upsert_items(b,&[related.clone()],1).unwrap();
    (store,detail,personal,related,a,b)
}

#[test]
fn overlapping_sources_never_overwrite_item_schedule_with_node_schedule() {
    let (store,_,personal,related,a,b)=fixture();
    let before=store.query_items(&ItemFilter::default()).unwrap();
    assert_eq!(before[0].item.schedule,Schedule::default());
    assert_eq!(before[0].personal_schedules["personal"],personal.schedule);
    for order in [[a,b],[b,a],[a,b]] {
        for run in order {
            let row=if run==a { &personal } else { &related };
            assert_eq!(store.upsert_items(run,std::slice::from_ref(row),2).unwrap().updated,0);
        }
        let after=store.query_items(&ItemFilter::default()).unwrap();
        let patch=cache_patch(&before,&after).unwrap();
        assert_eq!(patch["modified"],json!([]));
        assert_eq!(patch["updated_count"],0);
        assert_eq!(after.len(),1);
        assert_eq!(after[0].source_ids.len(),2);
    }
}

#[test]
fn real_node_and_item_schedule_changes_each_count_once_including_date_removal() {
    let (store,mut detail,mut personal,_,a,b)=fixture();
    let mut before=store.query_items(&ItemFilter::default()).unwrap();
    for schedule in [Schedule { start_raw:Some("2026-10-20".into()),end_raw:Some("2026-10-25".into()) },Schedule::default()] {
        personal.schedule=schedule;
        assert_eq!(store.upsert_items(a,&[personal.clone()],2).unwrap().updated,1);
        let after=store.query_items(&ItemFilter::default()).unwrap();
        let patch=cache_patch(&before,&after).unwrap();
        assert_eq!(patch["modified"].as_array().unwrap().len(),1);
        assert_eq!(patch["updated_count"],1);
        assert_eq!(after[0].item.schedule,Schedule::default());
        before=after;
    }
    detail.data["work_item_fields"]=json!([{"key":"schedule","value":{"start_time":"2026-11-01","end_time":"2026-11-02"}}]);
    store.save_item_detail(&detail).unwrap();
    let related=item(detail::summary(&detail,Value::Null));
    store.upsert_items(b,&[related],3).unwrap();
    store.upsert_items(a,&[personal.clone()],3).unwrap();
    let after=store.query_items(&ItemFilter::default()).unwrap();
    assert_eq!(cache_patch(&before,&after).unwrap()["updated_count"],1);
    assert_eq!(after[0].item.schedule.start_raw.as_deref(),Some("2026-11-01"));
    assert_eq!(after[0].personal_schedules["personal"],Schedule::default());

    personal.schedule=Schedule { start_raw:Some("2026-12-01".into()),end_raw:Some("2026-12-02".into()) };
    store.upsert_items(a,&[personal.clone()],4).unwrap();
    let before=store.query_items(&ItemFilter::default()).unwrap();
    detail.data["work_item_fields"]=json!([]);
    store.save_item_detail(&detail).unwrap();
    let related=item(detail::summary(&detail,Value::Null));
    store.upsert_items(b,&[related.clone()],5).unwrap();
    store.upsert_items(a,&[personal.clone()],5).unwrap();
    let after=store.query_items(&ItemFilter::default()).unwrap();
    assert_eq!(cache_patch(&before,&after).unwrap()["updated_count"],1);
    assert_eq!(after[0].item.schedule,Schedule::default());
    assert_eq!(after[0].personal_schedules["personal"],personal.schedule);
    store.upsert_items(a,&[personal],6).unwrap();
    store.upsert_items(b,&[related],6).unwrap();
    let repeated=store.query_items(&ItemFilter::default()).unwrap();
    assert_eq!(cache_patch(&after,&repeated).unwrap()["updated_count"],0);
    assert_eq!(cache_patch(&after,&repeated).unwrap()["modified"],json!([]));
}

#[test]
fn initial_missing_schedule_context_updates_ui_without_claiming_a_remote_change() {
    let (store,_,_,_,_,_)=fixture();
    let after=store.query_items(&ItemFilter::default()).unwrap();
    let mut before=after.clone();
    before[0].personal_schedules.clear();
    let patch=cache_patch(&before,&after).unwrap();
    assert_eq!(patch["modified"].as_array().unwrap().len(),1);
    assert_eq!(patch["updated_count"],0);
    let mut genuinely_changed=after.clone();
    genuinely_changed[0].item.name=Some("真实改名".into());
    assert_eq!(cache_patch(&before,&genuinely_changed).unwrap()["updated_count"],1);
}
