use super::*;
use crate::mcp::{ConnectionInfo, TodoSource, ToolResultPayload};
use async_trait::async_trait;
use std::sync::{Arc, atomic::{AtomicUsize, Ordering}};

struct Source {
    kind: &'static str,
    failure: &'static str,
    value: Mutex<Value>,
    writes: AtomicUsize,
    transitions: AtomicUsize,
}

impl Source {
    fn key(&self) -> &str {
        match self.kind { "hours" => "actual_work_time", "role" => "role_supported_story_server", _ => "field" }
    }
    fn form(&self) -> Value {
        json!({"field_key":self.key(),"form_item_type":match self.kind {"hours"=>"node_field","role"=>"role",_=>"field"}})
    }
}

#[async_trait]
impl TodoSource for Arc<Source> {
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> { unreachable!() }
    async fn close(&mut self) {}
    async fn call_tool(&self, tool: &str, args: &Map<String,Value>) -> Result<ToolResultPayload,BackendError> {
        let written=self.writes.load(Ordering::SeqCst)>0;
        if written && self.failure=="read" && matches!(tool,"get_workitem_brief"|"get_node_detail") {
            return Err(BackendError::conflict("模拟字段回读失败"));
        }
        let value=self.value.lock().unwrap().clone();
        let body=match tool {
            "get_workitem_brief"=>json!({"work_item_attribute":{"work_item_id":"1","owned_project":{"key":"supported","simple_name":"supported"},"work_item_type":{"key":"story"},"work_item_mod":"节点流","role_members":[{"key":"server","members":value}]},"work_item_fields":[{"key":"field","value":value}],"pagination":{"has_more":false}}),
            "get_node_detail"=>json!({"list":[{"basic":{"node_key":"n","name":"研发","status":if self.transitions.load(Ordering::SeqCst)>0{"finished"}else{"doing"}},"assignees":{"owners":[{"user_key":"a","name":"甲"}]},"assignee_schedule_list":if self.kind=="hours"{vec![json!({"assignee":{"user_key":"a"},"schedule_info":{"actual_work_time":value}})]}else{vec![]},"form_items":[self.form()]}],"pagination":{"has_more":false}}),
            "get_transition_required"=>if written && self.failure!="remaining" {json!({})} else if self.kind=="hours" {json!({"node_fields":[{"field_key":"actual_work_time","not_finished_owner":["a"]}]})} else {json!({"form_items":[{"key":self.key(),"class":if self.kind=="role"{"role"}else{"field"}}]})},
            "list_node_field_config"=>json!({"list":if self.kind=="hours"{vec![json!({"field_key":"actual_work_time","field_name":"实际工时","field_type":"number"})]}else{vec![]},"pagination":{"has_more":false}}),
            "list_workitem_field_config"=>json!({"list":[{"field_key":"field","field_name":"填写内容","field_type":self.kind,"related_work_item_info":[{"project_key":"supported","work_item_type":"version"}]}],"pagination":{"has_more":false}}),
            "list_workitem_role_config"=>json!({"list":[{"role_id":"server","role_name":"研发负责人"}],"pagination":{"has_more":false}}),
            "search_user_info"=>json!([{"user_key":"test-user","name_cn":"测试账号"}]),
            "update_field"|"update_node"=>{
                self.writes.fetch_add(1,Ordering::SeqCst);
                assert_eq!(tool,if self.kind=="hours"{"update_node"}else{"update_field"});
                let next=if self.kind=="hours" {
                    assert_eq!(args["schedules"],json!([{"owners":["a"],"actual_work_time":2.5,"clear_schedule":false,"is_auto":false}]));
                    json!(2.5)
                } else if self.kind=="role" {
                    assert_eq!(args["role_operate"],json!([{"op":"remove","role_key":"server","user_keys":["a"]},{"op":"add","role_key":"server","user_keys":["b"]}]));
                    assert!(!args.contains_key("fields"));
                    json!([{"key":"b","name":"乙"}])
                } else {
                    let wire=args["fields"][0]["field_value"].as_str().unwrap();
                    assert_eq!(wire,match self.kind{"multi-text"=>"    研发说明\n","workitem_related_select"=>"13",_=>"[13,14]"});
                    match self.kind {"multi-text"=>json!(wire),"workitem_related_select"=>json!({"work_item_id":"13","name":"版本"}),_=>json!([{"work_item_id":"14"},{"work_item_id":"13"}])}
                };
                if self.failure!="mismatch" { *self.value.lock().unwrap()=next; }
                return Ok(if self.failure=="receipt" {ToolResultPayload::err("unknown receipt")} else if self.kind=="hours" {ToolResultPayload::from_text("success\nlog_id: fixture-hours")} else {ToolResultPayload::from_json(json!({}))});
            },
            "transition_node"=>{
                assert_eq!(self.failure,"none","字段尚未核验时不得推进");
                self.transitions.fetch_add(1,Ordering::SeqCst);
                return Ok(ToolResultPayload::from_text("success"));
            },
            _=>return Err(BackendError::validation("模拟连接不提供其他能力")),
        };
        Ok(ToolResultPayload::from_json(body))
    }
}

#[test]
fn supported_fields_complete_only_after_exact_readback_and_never_repeat_uncertain_writes() {
    static NEXT:AtomicUsize=AtomicUsize::new(0);
    for kind in ["hours","multi-text","workitem_related_select","workitem_related_multi_select","role"] {
        for failure in ["none","mismatch","read","remaining","receipt"] {
            let dir=std::env::temp_dir().join(format!("fstodo-supported-{}-{}",std::process::id(),NEXT.fetch_add(1,Ordering::SeqCst)));
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join("token"),"supported-test-token").unwrap();
            std::fs::write(dir.join("config.toml"),format!("token_env='FSTODO_ABSENT_SUPPORTED_TEST_TOKEN'\ntoken_file='{}'\n",dir.join("token").display().to_string().replace('\\',"/"))).unwrap();
            let session=Session::open(crate::Config::load(Some(&dir.join("config.toml")),Some(&dir.join("cache.db"))).unwrap()).unwrap();
            let source=Arc::new(Source{kind,failure,value:Mutex::new(match kind {"hours"=>json!(1),"role"=>json!([{"key":"a"}]),_=>Value::Null}),writes:AtomicUsize::new(0),transitions:AtomicUsize::new(0)});
            let installed=crate::remote::install_test_client(&session.config,&session.credential().unwrap(),Box::new(source.clone()));
            let id=WorkItemId{project_key:Some("supported".into()),work_item_type_key:Some("story".into()),work_item_id:"1".into()};
            let options=fresh_actions(&session,&id).unwrap();
            let action=options.actions.iter().find(|a|a.id=="node:confirm:n").unwrap();
            assert!(action.disabled_reason.is_none(),"{kind}: {:?}",action.disabled_reason);
            let field=&action.fields[0];
            assert_ne!(field.settings.read_only,Some(true));
            let raw=match kind {"hours"=>"2.5","role"=>"[\"b\"]","multi-text"=>"    研发说明\n","workitem_related_select"=>"13",_=>"[\"13\",\"14\"]"};
            let request=WorkflowRequest{item_id:id.clone(),action_id:action.id.clone(),version:options.version,request_id:format!("supported-{kind}-{failure}"),fields:BTreeMap::from([(field.key.clone(),raw.into())])};
            let result=execute(&session,&request).unwrap();
            assert_eq!(result.verified,failure=="none","{kind}/{failure}: {}",result.message);
            assert_eq!(source.transitions.load(Ordering::SeqCst),usize::from(failure=="none"));
            assert!(execute(&session,&request).is_err());
            assert_eq!(source.writes.load(Ordering::SeqCst),1);
            if kind=="multi-text" && failure=="none" {
                let context=editor::context(&session,&id).unwrap();
                assert!(editor::upload(&session,&id,&action.id,&field.key,"wrong-context",&"a".repeat(64)).is_err());
                assert!(editor::upload(&session,&id,"node:confirm:missing",&field.key,&context.context,&"a".repeat(64)).is_err());
            }
            drop(installed);drop(session);let _=std::fs::remove_dir_all(dir);
        }
    }
}
