use super::*;
use std::{collections::VecDeque, sync::Mutex};
use async_trait::async_trait;
use crate::mcp::{ConnectionInfo, ToolResultPayload};

struct Fake(Mutex<VecDeque<(&'static str, Value)>>);
#[async_trait]
impl TodoSource for Fake {
    async fn describe(&self) -> Result<ConnectionInfo, BackendError> { unreachable!() }
    async fn close(&mut self) {}
    async fn call_tool(&self, tool: &str, args: &serde_json::Map<String, Value>) -> Result<ToolResultPayload, BackendError> {
        let (expected, value) = self.0.lock().unwrap().pop_front().expect("unexpected request");
        assert_eq!(tool, expected, "目录只能发出预期的读取请求");
        if tool == "search_by_mql" {
            assert_eq!(args["project_key"], "p");
            if args.get("mql").is_some() { assert_eq!(args["mql"], "SELECT `work_item_id`, `name` FROM `p`.`projects`"); }
            else { assert_eq!(args["group_pagination_list"][0]["page_num"], 2); }
        }
        Ok(ToolResultPayload::from_json(value))
    }
}
fn fields() -> Value { json!({"list":[{"field_name":"所属项目","field_key":"custom-project",
    "field_type":"workitem_related_select","related_work_item_info":[{"project_key":"p","work_item_type":"projects"}]}],
    "pagination":{"has_more":false}}) }
fn page(ids: &[u32]) -> Value { json!({"session_id":"s","list":[{"count":3,"group_infos":[{"group_id":"g"}]}],
    "data":{"g":ids.iter().map(|id|json!({"moql_field_list":[{"key":"work_item_id","value":{"long_value":id}},
    {"key":"name","value":{"string_value":format!("项目{id}")}}]})).collect::<Vec<_>>()}}) }

#[test]
fn project_relationship_is_independent_of_space_name_and_supports_multiple_values() {
    let data=json!({"work_item_attribute":{"owned_project":{"name":"不能当作项目"}},"work_item_fields":[
        {"name":"所属项目","key":"custom-project","value":[{"id":1,"name":"项目甲"},{"id":"2","name":"项目乙"}]},
        {"name":"其他关联","key":"other","value":{"id":3,"name":"其他"}}]});
    let refs=related_projects(&data);
    assert_eq!(refs.len(),2);
    assert_eq!(refs[0].id,"1");
    assert_eq!(refs[1].name,"项目乙");
    assert!(related_projects(&json!({"work_item_attribute":{"owned_project":{"name":"空间"}}})).is_empty());
}

#[test]
fn collection_relationship_is_a_project_but_other_relationships_are_not() {
    let data=json!({"work_item_fields":[
        {"name":"所属合集","key":"collection","value":{"id":9,"name":"项目甲"}},
        {"name":"所属需求","key":"story","value":{"id":10,"name":"需求甲"}},
        {"name":"所属模块","key":"module","value":[{"label":"模块甲","value":"m"}]},
        {"name":"所属项目","key":"empty","value":null}]});
    assert_eq!(related_projects(&data),vec![RelatedProject {
        field_key:"collection".into(),id:"9".into(),name:"项目甲".into() }]);
}

#[tokio::test]
async fn collection_directory_includes_projects_without_current_items() {
    let mut config=fields();
    config["list"][0]["field_name"]=json!("所属合集");
    config["list"][0]["field_key"]=json!("collection");
    let fake=Fake(Mutex::new(VecDeque::from([("list_workitem_field_config",config),
        ("search_by_mql",page(&[1,2,3]))])));
    let options=project_options(&fake,"p","story",3).await.unwrap();
    assert_eq!(options.len(),3);
    assert!(options.iter().all(|p|p.project.field_key=="collection"));
}

#[tokio::test]
async fn space_name_requires_matching_identity_and_reads_later_pages() {
    let fake=Fake(Mutex::new(VecDeque::from([
        ("search_project_info",json!({"projects":[{"project_key":"other","name":"同名其他空间"}],"pagination":{"has_more":true}})),
        ("search_project_info",json!({"projects":[{"project_key":"p","name":"正式空间名","simple_name":"alias"}],"pagination":{"has_more":false}})),
    ])));
    assert_eq!(resolve_space(&fake,"p",&BTreeSet::from(["项目名".into()]),3).await.unwrap().1,"正式空间名");
}

#[tokio::test]
async fn project_directory_reads_all_records_even_without_matching_todos() {
    let fake=Fake(Mutex::new(VecDeque::from([("list_workitem_field_config",fields()),
        ("search_by_mql",page(&[1,2])),("search_by_mql",page(&[3]))])));
    let options=project_options(&fake,"p","story",3).await.unwrap();
    assert_eq!(options.iter().map(|p|p.project.id.as_str()).collect::<Vec<_>>(),["1","2","3"]);
    assert!(options.iter().all(|p|p.type_key=="story" && p.project.field_key=="custom-project"));
}

#[tokio::test]
async fn incomplete_or_duplicate_project_pages_are_not_successful_directories() {
    for next in [page(&[]),page(&[2])] {
        let fake=Fake(Mutex::new(VecDeque::from([("list_workitem_field_config",fields()),
            ("search_by_mql",page(&[1,2])),("search_by_mql",next)])));
        assert!(project_options(&fake,"p","story",3).await.is_err());
    }
}

#[tokio::test]
async fn alias_and_canonical_inputs_merge_new_options_for_all_types() {
    let identity = json!({"projects":[{"project_key":"p","simple_name":"alias","name":"正式空间"}],"pagination":{"has_more":false}});
    let fake=Fake(Mutex::new(VecDeque::from([
        ("search_project_info",identity.clone()), ("list_workitem_field_config",fields()), ("search_by_mql",page(&[1,2,3])),
        ("search_project_info",identity), ("list_workitem_field_config",fields()), ("search_by_mql",page(&[1,2,3])),
    ])));
    let inputs = std::collections::BTreeMap::from([
        ("alias".into(),CatalogInput { types:BTreeSet::from(["story".into()]), ..Default::default() }),
        ("p".into(),CatalogInput { types:BTreeSet::from(["issue".into()]), ..Default::default() }),
    ]);
    let result=refresh_catalog(&fake,inputs,Vec::new(),3,None).await.unwrap();
    assert!(result.warnings.is_empty());
    assert_eq!(result.spaces.len(),1);
    let projects=&result.spaces[0].projects;
    assert_eq!(projects.len(),6);
    assert_eq!(projects.iter().filter(|p|p.type_key=="story").count(),3);
    assert_eq!(projects.iter().filter(|p|p.type_key=="issue").count(),3);
}

#[test]
fn catalog_rejects_late_results_after_a_new_refresh_or_credential_change() {
    let path=std::env::temp_dir().join(format!("fstodo-catalog-{}-{}.db",std::process::id(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
    {
        let first=crate::store::Store::open(&path).unwrap();
        let second=crate::store::Store::open(&path).unwrap();
        let old=first.begin_workspace_catalog_refresh().unwrap();
        let latest=second.begin_workspace_catalog_refresh().unwrap();
        let space=SpaceCatalog { project_key:"p".into(), name:Some("新目录".into()), simple_name:None, projects:Vec::new() };
        assert!(second.save_workspace_catalog(latest,&[space]).unwrap());
        assert!(!first.save_workspace_catalog(old,&[]).unwrap());
        assert_eq!(first.workspace_catalog().unwrap()[0].name.as_deref(),Some("新目录"));
        let before_token=first.begin_workspace_catalog_refresh().unwrap();
        second.save_token_ciphertext(b"test-ciphertext").unwrap();
        assert!(!first.save_workspace_catalog(before_token,&[]).unwrap());
        assert_eq!(second.workspace_catalog().unwrap().len(),1);
    }
    std::fs::remove_file(path).unwrap();
}

#[tokio::test]
async fn alias_only_cached_options_survive_failed_refresh_during_canonical_merge() {
    for input_key in ["alias","p"] {
    for space_read_ok in [true,false] {
    let fake=Fake(Mutex::new(VecDeque::from([
        ("search_project_info",if space_read_ok {
            json!({"projects":[{"project_key":"p","simple_name":"alias","name":"正式空间"}],"pagination":{"has_more":false}})
        } else { json!({"unrecognized":"response"}) }),
        ("list_workitem_field_config",json!({"unrecognized":"response"})),
    ])));
    let option=|kind: &str| ProjectOption { type_key:kind.into(), project:RelatedProject {
        field_key:"custom".into(), id:kind.into(), name:kind.into() } };
    let cached=vec![
        SpaceCatalog { project_key:"p".into(), name:Some("正式空间".into()), simple_name:Some("alias".into()), projects:vec![option("issue")] },
        SpaceCatalog { project_key:"alias".into(), name:None, simple_name:None, projects:vec![option("story")] },
    ];
    let inputs=std::collections::BTreeMap::from([(input_key.into(),CatalogInput {
        types:BTreeSet::from(["story".into()]), ..Default::default() })]);
    let result=refresh_catalog(&fake,inputs,cached,3,None).await.unwrap();
    assert_eq!(result.warnings.len(),if space_read_ok { 1 } else { 2 });
    assert_eq!(result.spaces.len(),1);
    assert_eq!(result.spaces[0].project_key,"p");
    assert_eq!(result.spaces[0].projects.len(),2);
    }
    }
}
