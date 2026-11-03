use super::*;

fn form(config: Value, current: Value, required: bool) -> NodeForm {
    NodeForm::build_state(&json!({"confirm_form":[{"key":"field","class":"field"}]}),
        &if required { json!({"form_items":[{"key":"field","class":"field","finished":false}]}) } else { json!({}) },
        &[config], &json!({"work_item_fields":[{"key":"field","value":current}]})).unwrap()
}

#[test]
fn people_relations_and_multi_select_write_typed_values_and_verify_ids_not_labels() {
    for (kind, current, submitted, wire, actual) in [
        ("user", json!({"key":"a","name":"甲"}), "b", "b", json!({"user_key":"b","name":"乙"})),
        ("multi-user", json!([{ "key":"a","name":"甲" }]), "[\"b\",\"a\"]", "[\"b\",\"a\"]", json!([{ "key":"a" },{ "key":"b" }])),
        ("workitem_related_select", json!({"work_item_id":"12","name":"旧版本"}), "13", "13", json!({"work_item_id":"13","name":"新版本"})),
        ("workitem_related_multi_select", json!([{ "work_item_id":"12","name":"旧迭代" }]), "[\"13\",\"14\"]", "[13,14]", json!([{ "work_item_id":"14" },{ "work_item_id":"13" }])),
        ("multi-select", json!([{ "option_id":"a" }]), "[\"b\"]", "[{\"option_id\":\"b\"}]", json!([{ "option_id":"b","label":"乙" }])),
    ] {
        let config = json!({"field_key":"field","field_name":"选择","field_type":kind,
            "related_work_item_info":[{"project_key":"p","work_item_type":"version"}],
            "option":[{"option_id":"a","option_name":"甲"},{"option_id":"b","option_name":"乙"}]});
        let form = form(config, current, true);
        assert!(form.blocked.is_empty(), "{kind}");
        let field = &form.fields()[0];
        assert_ne!(field.settings.read_only, Some(true));
        let values = BTreeMap::from([(field.key.clone(), submitted.into())]);
        let plan = form.plan(&values).unwrap();
        assert_eq!(plan.work_fields[0]["field_value"], wire, "{kind}");
        assert!(form.verify(&Value::Null, Some(&json!({"work_item_fields":[{"key":"field","value":actual}]})), &values).is_ok());
        assert!(form.verify(&Value::Null, Some(&json!({"work_item_fields":[]})), &values).is_err());
        assert!(form.verify(&Value::Null, Some(&json!({"work_item_fields":[{"key":"field","value":"different"}]})), &values).is_err());
    }
}

#[test]
fn multi_selection_validates_empty_required_and_only_writes_real_set_changes() {
    let config = json!({"field_key":"field","field_type":"multi-user"});
    let original = json!([{ "key":"a","name":"甲" },{ "key":"b","name":"乙" }]);
    let required = form(config.clone(), original.clone(), true);
    let key = required.fields()[0].key.clone();
    assert!(required.plan(&BTreeMap::from([(key.clone(), "[]".into())])).is_err());
    assert!(required.plan(&BTreeMap::from([(key.clone(), "[\"b\",\"a\"]".into())])).unwrap().calls("p","1","n").is_empty());
    let optional = form(config, original, false);
    let cleared = BTreeMap::from([(key, "[]".into())]);
    assert_eq!(optional.plan(&cleared).unwrap().work_fields[0]["field_value"], "[]");
    assert!(optional.verify(&Value::Null, Some(&json!({"work_item_fields":[{"key":"field","value":null}]})), &cleared).is_ok());
    assert!(optional.verify(&Value::Null, Some(&json!({"work_item_fields":[]})), &cleared).is_err());
}

#[test]
fn roles_use_member_deltas_and_keep_role_definition_and_other_roles() {
    let key = "role_p_story_server";
    let configs = [json!({"field_key":key,"field_name":"研发负责人","field_type":"multi-user","_role_key":"server"})];
    let work = json!({"work_item_attribute":{"role_members":[
        {"key":"server","members":[{"key":"a","name":"甲"},{"key":"b","name":"乙"}]},
        {"key":"pm","members":[{"key":"pm","name":"产品"}]}
    ]}});
    let node = json!({"form_items":[{"field_key":key,"form_item_type":"role"}]});
    let required = json!({"form_items":[{"key":key,"class":"role","finished":false}]});
    for form in [NodeForm::build(&node,&required,&[],&configs,&work).unwrap(),
        NodeForm::build_state(&json!({"confirm_form":[{"key":key,"class":"role"}]}),&required,&configs,&work).unwrap()] {
        assert!(form.blocked.is_empty());
        let field = &form.fields()[0];
        assert_eq!(field.settings.initial_value.as_deref(), Some("[\"a\",\"b\"]"));
        let values = BTreeMap::from([(field.key.clone(), "[\"b\",\"c\"]".into())]);
        let calls = form.plan(&values).unwrap().calls("p","1","n");
        assert_eq!(calls[0].0, "update_field");
        assert!(!calls[0].1.contains_key("fields"));
        assert_eq!(calls[0].1["role_operate"], json!([
            {"op":"remove","role_key":"server","user_keys":["a"]},
            {"op":"add","role_key":"server","user_keys":["c"]}
        ]));
        assert!(form.verify(&node,Some(&work),&values).is_err());
        let mut after = work.clone();
        after["work_item_attribute"]["role_members"][0]["members"] = json!([{ "key":"c" },{ "key":"b" }]);
        assert!(form.verify(&node,Some(&after),&values).is_ok());
    }
}

#[test]
fn overall_node_conclusion_and_opinion_are_written_separately() {
    let configs = [json!({"field_key":"node_finished_conclusion","field_type":"select","option":[{"option_id":"pass","option_name":"通过"}]}),
        json!({"field_key":"node_finished_opinion","field_type":"multi-pure-text"})];
    let node = json!({"form_items":configs.iter().map(|c| json!({"field_key":c["field_key"],"form_item_type":"node_field"})).collect::<Vec<_>>()});
    let form = NodeForm::build(&node,&json!({}),&configs,&[],&json!({})).unwrap();
    let values = form.fields().iter().map(|f| (f.key.clone(), if f.kind == FieldKind::Select {"pass"} else {"完成核对"}.into())).collect();
    let calls = form.plan(&values).unwrap().calls("p","1","n");
    assert_eq!(calls.len(),2);
    assert!(calls.iter().all(|(tool,args)| *tool=="update_node" && args["fields"].as_array().unwrap().len()==1));
}

#[test]
fn clearing_role_requires_a_complete_role_members_readback() {
    let config = json!({"field_key":"role_p_story_server","field_type":"multi-user","_role_key":"server"});
    let node = json!({"form_items":[{"field_key":"role_p_story_server","form_item_type":"role"}]});
    let work = json!({"work_item_attribute":{"role_members":[{"key":"server","members":[{"key":"a"}]}]}});
    let form = NodeForm::build(&node,&json!({}),&[],&[config],&work).unwrap();
    let values = BTreeMap::from([(form.fields()[0].key.clone(), "[]".into())]);
    assert!(form.verify(&node,Some(&json!({"work_item_attribute":{}})),&values).is_err());
    assert!(form.verify(&node,Some(&json!({"work_item_attribute":{"role_members":[]}})),&values).is_ok());
}

#[test]
fn title_uses_item_attribute_and_rich_text_preserves_indentation_and_local_image_guard() {
    let title = NodeForm::build_state(&json!({"confirm_form":[{"key":"name","class":"field"}]}),&json!({}),
        &[json!({"field_key":"name","field_type":"_name"})],&json!({"work_item_attribute":{"work_item_name":"旧标题"}})).unwrap();
    assert_eq!(title.fields()[0].settings.initial_value.as_deref(),Some("旧标题"));
    let changed = BTreeMap::from([(title.fields()[0].key.clone(),"新标题".into())]);
    assert!(title.verify(&Value::Null,Some(&json!({"work_item_attribute":{"work_item_name":"新标题"}})),&changed).is_ok());
    let rich = form(json!({"field_key":"field","field_type":"multi-text"}),json!("旧正文"),true);
    let key=rich.fields()[0].key.clone();
    let value="  保留缩进\n\n第二段  ";
    assert_eq!(rich.plan(&BTreeMap::from([(key.clone(),value.into())])).unwrap().work_fields[0]["field_value"],value);
    assert!(rich.plan(&BTreeMap::from([(key,"![图片](fstodo-image:pending)".into())])).is_err());
}
