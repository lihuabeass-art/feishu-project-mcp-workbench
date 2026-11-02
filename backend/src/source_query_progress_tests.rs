use super::*;
use crate::{model::source::{PersonalTodoQuery, TodoAction}, store::{RunTrigger, RunStatus}, sync::{sync_personal_todos, SyncContext}};
use std::sync::atomic::{AtomicBool, AtomicUsize};
use tokio::sync::Notify;

struct Pipeline {
    second_page: AtomicBool,
    detail_released: AtomicBool,
    release: Notify,
    page_ready: Notify,
    fail_second: bool,
    rows: usize,
}

#[async_trait]
impl TodoSource for Pipeline {
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> { unreachable!() }
    async fn close(&mut self) {}
    async fn call_tool(&self, tool: &str, args: &Map<String, Value>) -> Result<ToolResultPayload, BackendError> {
        if tool == "list_todo" {
            let page = args["page_num"].as_u64().unwrap();
            assert!(page <= 2, "最多只预取下一页，不能越过 total");
            if page == 2 {
                assert!(!self.detail_released.load(Ordering::SeqCst), "下一页不等待最慢详情");
                self.second_page.store(true, Ordering::SeqCst);
                self.page_ready.notify_one();
                if self.fail_second { return Err(BackendError::parse("测试分页", "离线第二页失败")); }
            }
            let ids: Vec<_> = if page == 1 { (1..=self.rows).collect() } else { vec![self.rows + 1] };
            let rows: Vec<_> = ids.into_iter().map(|n| json!({"project_key":"p", "work_item_info":{
                "work_item_type_key":"story","work_item_id":n.to_string()}})).collect();
            return Ok(ToolResultPayload::from_json(json!({"list":rows,"total":self.rows + 1})));
        }
        assert_eq!(tool, "get_workitem_brief");
        let id = args["work_item_id"].as_str().unwrap();
        if id == "1" {
            self.release.notified().await;
            self.page_ready.notified().await;
            self.detail_released.store(true, Ordering::SeqCst);
        }
        Ok(ToolResultPayload::from_json(json!({"work_item_attribute":{
            "owned_project":{"key":"p","name":"演示"},"work_item_id":id,
            "work_item_type":{"key":"story"},"work_item_name":format!("事项{id}"),"work_item_mod":"节点流"},
            "work_item_fields":[],"work_item_current_node":[],"pagination":{"has_more":false}})))
    }
}

#[tokio::test(start_paused = true)]
async fn next_page_overlaps_slow_detail_and_batches_arrive_before_completion() {
    for (fail_second, write_during_batch, rows) in [(false, false, 9), (true, false, 9), (false, true, 9), (false, false, 2)] {
        let fake = Pipeline { second_page: AtomicBool::new(false), detail_released: AtomicBool::new(false), release: Notify::new(), page_ready: Notify::new(), fail_second, rows };
        let store = Store::in_memory().unwrap();
        let source = WorkSource { id: "a".into(), kind: SourceKind::PersonalTodo, enabled: true,
            todo: None, association_rule: None };
        let query = PersonalTodoQuery { action: TodoAction::Todo, todo_scope: None, asset_key: None };
        let batches = AtomicUsize::new(0);
        let progress = || {
            let batch = batches.fetch_add(1, Ordering::SeqCst);
            if batch == 0 {
                assert!(!fake.detail_released.load(Ordering::SeqCst));
                assert_eq!(store.count_items().unwrap(), (rows - 1) as i64, "不足8条也应定时发布，不能等待最慢详情");
                let rows = store.query_items(&Default::default()).unwrap();
                assert!(rows.iter().all(|row| store.item_detail(&row.item.id).unwrap().is_some()));
                if write_during_batch {
                    let id = WorkItemId { project_key: Some("p".into()), work_item_type_key: Some("story".into()), work_item_id: "2".into() };
                    let mut detail = store.item_detail(&id).unwrap().unwrap();
                    store.mark_detail_refresh(&id).unwrap();
                    detail.data["work_item_attribute"]["work_item_name"] = json!("写后已核验的名称");
                    store.save_item_detail(&detail).unwrap();
                }
                // next 在 join 的另一分支执行；让慢详情等到预取被轮询。
                fake.release.notify_one();
            }
        };
        let mut reader = SourceReader::new(&fake, &source, &store, None, 3).with_progress(Some(&progress));
        let clock = tokio::time::Instant::now();
        let result = tokio::time::timeout(std::time::Duration::from_secs(2), sync_personal_todos(&mut reader,
            &store, &query, 3, None, SyncContext { trigger: RunTrigger::Manual, source_id: Some("a"), type_scope: None })).await.unwrap();
        assert!(fake.second_page.load(Ordering::SeqCst));
        assert!(batches.load(Ordering::SeqCst) >= 2);
        assert_eq!(clock.elapsed(), std::time::Duration::from_millis(if rows < 8 { 100 } else { 0 }),
            "定时发布不足一批的结果，结束时不再等待下一周期");
        if fail_second || write_during_batch {
            assert!(result.is_err());
            assert_eq!(store.count_items().unwrap(), rows as i64);
            assert_eq!(store.recent_runs(1).unwrap()[0].status, RunStatus::Failed);
            assert!(store.last_successful_sync().unwrap().is_none());
            if write_during_batch {
                let rows = store.query_items(&Default::default()).unwrap();
                assert_eq!(rows.iter().find(|row| row.item.id.work_item_id == "2").unwrap().item.name.as_deref(), Some("写后已核验的名称"));
            }
        } else {
            let report = result.unwrap();
            assert!(report.complete);
            assert_eq!(report.items_inserted, rows + 1);
            assert_eq!(store.count_items().unwrap(), (rows + 1) as i64);
        }
    }
}
