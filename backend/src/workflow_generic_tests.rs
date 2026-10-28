use super::*;

fn compound(key: &str, children: Vec<Value>) -> Value {
    json!({"field_key":key,"field_name":"评审信息","field_type":"multi_user_compound_field","compound_field_info":children})
}

fn select(key: &str) -> Value {
    json!({"field_key":key,"field_name":"结论","field_type":"select","option":[
        {"option_id":"pass","option_name":"已通过"},{"option_id":"reject","option_name":"未通过"}
    ]})
}

fn review_config() -> Value {
    compound(
        "review",
        vec![
            select("decision"),
            json!({"field_key":"opinion","field_name":"意见","field_type":"multi-pure-text"}),
        ],
    )
}

fn node(value: Value) -> Value {
    json!({"assignees":{"owners":[{"user_key":"a","name":"甲"},{"user_key":"b","name":"乙"}]},
        "form_items":[{"field_key":"review","form_item_type":"node_field","value":value}]})
}

fn required(keys: &[&str]) -> Value {
    json!({"node_fields":keys.iter().map(|key| json!({"field_key":key,"finished":false,"not_finished_owner":["a"]})).collect::<Vec<_>>()})
}

fn find<'a>(form: &'a NodeForm, owner: &str, field: &str) -> &'a WorkflowField {
    &form
        .inputs
        .iter()
        .find(|i| {
            matches!(&i.route, Route::Compound { path, field: key, .. }
        if path.last().unwrap().owner == owner && key == field)
        })
        .unwrap()
        .field
}

#[test]
fn node_and_state_share_basic_types_remote_options_and_valid_zero_values() {
    let configs = vec![
        select("choice"),
        json!({"field_key":"due","field_type":"date"}),
        json!({"field_key":"flag","field_type":"bool"}),
        json!({"field_key":"note","field_type":"multi-pure-text"}),
        json!({"field_key":"count","field_type":"number"}),
        json!({"field_key":"radio","field_type":"radio","option":[{"option_id":12,"option_name":"十二"}]}),
    ];
    let remote = json!({"choice":{"label":"已通过","value":"pass"},"due":1792425600000i64,
        "flag":false,"note":"第一行\n第二行","count":0,"radio":"12"});
    let rows: Vec<Value> = configs.iter().map(|c| json!({"field_key":c["field_key"],"value":remote[c["field_key"].as_str().unwrap()]})).collect();
    let node_form = NodeForm::build(
        &json!({"form_items":rows}),
        &json!({}),
        &configs,
        &[],
        &json!({}),
    )
    .unwrap();
    let work = json!({"work_item_fields":configs.iter().map(|c| json!({"key":c["field_key"],"value":remote[c["field_key"].as_str().unwrap()]})).collect::<Vec<_>>()});
    let state = NodeForm::build_state(&json!({"confirm_form":configs.iter().map(|c| json!({"class":"field","key":c["field_key"]})).collect::<Vec<_>>()}), &json!({}), &configs, &work).unwrap();
    assert!(node_form.blocked.is_empty() && state.blocked.is_empty());
    for form in [&node_form, &state] {
        let field = |key: &str| {
            form.inputs
                .iter()
                .find(|i| match &i.route {
                    Route::Node(k) | Route::WorkItem(k) => k == key,
                    _ => false,
                })
                .unwrap()
        };
        assert_eq!(
            field("flag").field.settings.initial_value.as_deref(),
            Some("false")
        );
        assert_eq!(
            field("count").field.settings.initial_value.as_deref(),
            Some("0")
        );
        assert_eq!(field("note").field.kind, FieldKind::Textarea);
        assert_eq!(
            field("due").field.settings.initial_value.as_deref(),
            Some("2026-10-20")
        );
        assert_eq!(field("choice").field.options[1].label, "未通过");
        assert_eq!(field("radio").field.options[0].value, "12");
        let values = BTreeMap::from([
            (field("choice").field.key.clone(), "reject".into()),
            (field("flag").field.key.clone(), "true".into()),
        ]);
        assert_eq!(form.plan(&values).unwrap().calls("p", "1", "n").len(), 1);
        let mut expected = remote.clone();
        expected["choice"] = json!("reject");
        expected["flag"] = json!(true);
        let n = json!({"form_items":configs.iter().map(|c| json!({"field_key":c["field_key"],"value":expected[c["field_key"].as_str().unwrap()]})).collect::<Vec<_>>()});
        let w = json!({"work_item_fields":configs.iter().map(|c| json!({"key":c["field_key"],"value":expected[c["field_key"].as_str().unwrap()]})).collect::<Vec<_>>()});
        assert!(form.verify(&n, Some(&w), &values).is_ok());
    }
}

#[test]
fn observed_acceptance_subfields_are_discovered_without_top_level_configs() {
    let config = compound(
        "owners_finished_info",
        vec![
            json!({"field_key":"owners_node_finished_conclusion","field_name":"负责人完成结论","field_type":"select","option":[{"option_id":"system_passed","option_name":"已通过"}]}),
            json!({"field_key":"owners_node_finished_opinion","field_name":"负责人完成意见","field_type":"text"}),
        ],
    );
    let node = json!({"assignees":{"owners":[{"user_key":"a","name":"甲"}]},"form_items":[
        {"field_key":"owners_finished_info","form_item_type":"node_field","value":"{\"a\":[{\"field_key\":\"created_at\",\"field_value\":123}]}"}
    ]});
    let form = NodeForm::build(
        &node,
        &required(&[
            "owners_node_finished_conclusion",
            "owners_node_finished_opinion",
        ]),
        &[config],
        &[],
        &json!({}),
    )
    .unwrap();
    assert!(form.blocked.is_empty());
    assert_eq!(form.fields().len(), 2);
    assert!(form
        .fields()
        .iter()
        .all(|f| f.required && f.settings.scope.as_deref() == Some("assignee")));
    assert!(form
        .fields()
        .iter()
        .any(|f| f.label.contains("负责人完成结论") && f.options[0].label == "已通过"));
    assert!(form.plan(&BTreeMap::new()).is_err());
    let values = form
        .fields()
        .iter()
        .map(|f| {
            (
                f.key.clone(),
                if f.kind == FieldKind::Select {
                    "system_passed"
                } else {
                    "验收通过"
                }
                .into(),
            )
        })
        .collect();
    let calls = form.plan(&values).unwrap().calls("p", "1", "n");
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].0, "update_node");
    assert_eq!(calls[0].1["fields"][0]["field_key"], "owners_finished_info");
    let patch: Value =
        serde_json::from_str(calls[0].1["fields"][0]["field_value"].as_str().unwrap()).unwrap();
    assert_eq!(patch["operation_type"], 1);
    assert_eq!(patch["group_editor"], "a");
    assert_eq!(patch["sub_field_value"].as_array().unwrap().len(), 2);
    assert!(!calls[0].1.contains_key("node_owners"));
}

#[test]
fn compound_patch_only_changes_selected_owner_and_subfield_and_checks_that_owner() {
    let original = json!({"a":[{"field_key":"decision","field_value":"pass"}],
        "b":[{"field_key":"opinion","field_value":"保留乙的意见"}]});
    let form = NodeForm::build(
        &node(json!(original.to_string())),
        &required(&["opinion"]),
        &[review_config()],
        &[],
        &json!({}),
    )
    .unwrap();
    assert!(form.blocked.is_empty());
    assert!(find(&form, "a", "opinion").required);
    assert!(!find(&form, "b", "opinion").required);
    assert_eq!(
        find(&form, "b", "opinion")
            .settings
            .initial_value
            .as_deref(),
        Some("保留乙的意见")
    );
    let values = BTreeMap::from([(find(&form, "a", "opinion").key.clone(), "甲的意见".into())]);
    let plan = form.plan(&values).unwrap();
    let calls = plan.calls("p", "1", "n");
    let patch: Value =
        serde_json::from_str(calls[0].1["fields"][0]["field_value"].as_str().unwrap()).unwrap();
    assert_eq!(
        patch,
        json!({"operation_type":1,"group_editor":"a","sub_field_value":[
        {"field_key":"opinion","field_value":"甲的意见","field_type":"multi-pure-text"}]})
    );
    assert_eq!(plan.fields, values);
    assert!(form.verify(&node(original.clone()), None, &values).is_err());
    let mut applied = original;
    applied["a"]
        .as_array_mut()
        .unwrap()
        .push(json!({"field_key":"opinion","field_value":"甲的意见"}));
    assert!(form
        .verify(&node(json!(applied.to_string())), None, &values)
        .is_ok());
    applied["a"][1]["field_value"] = json!("另一个值");
    applied["b"][0]["field_value"] = json!("甲的意见");
    assert!(form.verify(&node(applied), None, &values).is_err());
}

#[test]
fn each_owner_gets_a_separate_incremental_call_and_unchanged_values_are_not_written() {
    let form = NodeForm::build(
        &node(json!({})),
        &json!({}),
        &[review_config()],
        &[],
        &json!({}),
    )
    .unwrap();
    let values = BTreeMap::from([
        (find(&form, "a", "decision").key.clone(), "pass".into()),
        (find(&form, "b", "decision").key.clone(), "reject".into()),
    ]);
    let calls = form.plan(&values).unwrap().calls("p", "1", "n");
    assert_eq!(calls.len(), 2);
    for (index, (_, args)) in calls.iter().enumerate() {
        assert_eq!(args["fields"].as_array().unwrap().len(), 1);
        let patch: Value =
            serde_json::from_str(args["fields"][0]["field_value"].as_str().unwrap()).unwrap();
        assert_eq!(patch["group_editor"], if index == 0 { "a" } else { "b" });
    }
    assert!(form
        .plan(&BTreeMap::new())
        .unwrap()
        .calls("p", "1", "n")
        .is_empty());
}

#[test]
fn nested_work_compounds_keep_paths_owner_constraints_and_work_item_route() {
    let config = compound("team", vec![compound("review", vec![select("decision")])]);
    let value = json!({"a":[{"field_key":"review","field_value":{"b":[{"field_key":"decision","field_value":"pass"}]}}]});
    let work = json!({"work_item_fields":[{"key":"team","value":value}]});
    let required = json!({"form_items":[{"key":"team","class":"field","sub_field":[
        {"field_key":"review","sub_field":[{"field_key":"decision","not_finished_owner":["b"]}]}
    ]}]});
    let form = NodeForm::build_state(&json!({}), &required, &[config.clone()], &work).unwrap();
    assert!(form.blocked.is_empty());
    let field = find(&form, "b", "decision");
    assert!(field.required);
    let values = BTreeMap::from([(field.key.clone(), "reject".into())]);
    let plan = form.plan(&values).unwrap();
    assert!(plan.has_work_fields());
    let calls = plan.calls("p", "1", "DONE");
    assert_eq!(calls[0].0, "update_field");
    assert!(!calls[0].1.contains_key("node_id"));
    let outer: Value =
        serde_json::from_str(calls[0].1["fields"][0]["field_value"].as_str().unwrap()).unwrap();
    assert_eq!(outer["group_editor"], "a");
    let inner: Value =
        serde_json::from_str(outer["sub_field_value"][0]["field_value"].as_str().unwrap()).unwrap();
    assert_eq!(inner["group_editor"], "b");
    let applied = json!({"work_item_fields":[{"key":"team","value":{"a":[{"field_key":"review","field_value":{"b":[{"field_key":"decision","field_value":"reject"}]}}]}}]});
    assert!(form.verify(&Value::Null, Some(&applied), &values).is_ok());
    let mut renamed = config;
    renamed["field_name"] = json!("改名后的组");
    let next = NodeForm::build_state(&json!({}), &required, &[renamed], &work).unwrap();
    assert_eq!(find(&next, "b", "decision").key, field.key);
}

#[test]
fn missing_metadata_invalid_options_and_unknown_owners_stay_blocked() {
    let mut config = review_config();
    config["compound_field_info"][0]["option"] = json!([]);
    let form = NodeForm::build(
        &node(json!({})),
        &required(&["decision"]),
        &[config],
        &[],
        &json!({}),
    )
    .unwrap();
    assert!(form
        .blocked
        .iter()
        .any(|s| s.contains("结论") && s.contains("选项配置不完整")));
    let mut bad = review_config();
    bad["compound_field_info"][1]["field_type"] = json!("unknown");
    let form = NodeForm::build(
        &node(json!({})),
        &required(&["opinion"]),
        &[bad],
        &[],
        &json!({}),
    )
    .unwrap();
    assert!(form
        .blocked
        .iter()
        .any(|s| s.contains("意见") && s.contains("unknown")));
    let req = json!({"node_fields":[{"field_key":"opinion","not_finished_owner":["outsider"]}]});
    let form =
        NodeForm::build(&node(json!({})), &req, &[review_config()], &[], &json!({})).unwrap();
    assert!(form
        .blocked
        .iter()
        .any(|s| s.contains("不是当前节点负责人")));
    assert!(NodeForm::build(
        &node(json!("broken JSON")),
        &required(&["opinion"]),
        &[review_config()],
        &[],
        &json!({})
    )
    .is_err());
    let duplicate = compound("other", vec![select("decision")]);
    assert!(NodeForm::build(
        &node(json!({})),
        &required(&["decision"]),
        &[review_config(), duplicate],
        &[],
        &json!({})
    )
    .is_err());
}

#[test]
fn complete_paths_allow_repeated_leaf_keys_and_keep_nested_owner_constraints() {
    let config = compound("team", vec![compound("review", vec![select("decision")])]);
    let value = json!({"a":[{"field_key":"review","field_value":{"b":[]}}],
        "c":[{"field_key":"review","field_value":{"b":[]}}]});
    let required = json!({"form_items":[{"key":"team","class":"field","not_finished_owner":["a"],"sub_field":[
        {"field_key":"review","sub_field":[{"field_key":"decision","not_finished_owner":["b"]}]}
    ]}]});
    let work = json!({"work_item_fields":[{"key":"team","value":value}]});
    let form = NodeForm::build_state(&json!({}), &required, &[config], &work).unwrap();
    assert!(form.blocked.is_empty());
    assert_eq!(form.inputs.len(), 2);
    assert_eq!(
        form.inputs
            .iter()
            .filter(|input| input.field.required)
            .count(),
        1
    );
    let target = form.inputs.iter().find(|i| i.field.required).unwrap();
    assert!(
        matches!(&target.route,Route::Compound { path, .. } if path[0].owner=="a" && path[1].owner=="b")
    );
    assert_ne!(
        form.inputs[0].field.settings.column,
        form.inputs[1].field.settings.column
    );

    let configs = [
        compound("first", vec![select("decision")]),
        compound("second", vec![select("decision")]),
    ];
    let req = json!({"form_items":configs.iter().map(|c|json!({"key":c["field_key"],"class":"field",
        "sub_field":[{"field_key":"decision","not_finished_owner":["a"]}]})).collect::<Vec<_>>()});
    let form = NodeForm::build_state(&json!({}), &req, &configs, &json!({})).unwrap();
    assert!(form.blocked.is_empty());
    assert_eq!(form.fields().len(), 2);
    assert!(form.fields().iter().all(|f| f.required));
    assert_ne!(form.fields()[0].key, form.fields()[1].key);
}

#[test]
fn field_scope_and_inherited_non_field_class_cannot_change_write_ownership() {
    let configs = [review_config()];
    let req = json!({"node_fields":[{"field_key":"opinion","not_finished_owner":["a"]}],
        "form_items":[{"key":"review","class":"field","sub_field":[{"field_key":"opinion","not_finished_owner":["b"]}]}]});
    let form = NodeForm::build(&node(json!({})), &req, &configs, &configs, &json!({})).unwrap();
    assert!(form.blocked.is_empty());
    let needed: Vec<_> = form.inputs.iter().filter(|i| i.field.required).collect();
    assert_eq!(needed.len(), 2);
    for input in needed {
        assert!(
            matches!(&input.route,Route::Compound { work_item, path, .. }
            if path[0].owner==if *work_item { "b" } else { "a" })
        );
    }
    let req = json!({"form_items":[{"key":"review","class":"role","sub_field":[{"field_key":"opinion","not_finished_owner":["a"]}]}]});
    assert!(
        !NodeForm::build_state(&json!({}), &req, &configs, &json!({}))
            .unwrap()
            .blocked
            .is_empty()
    );
    assert!(
        !NodeForm::build(&node(json!({})), &req, &[], &configs, &json!({}))
            .unwrap()
            .blocked
            .is_empty()
    );
}

#[test]
fn required_paths_with_missing_configs_or_unsupported_parents_are_always_blocked() {
    let unknown = json!({"field_key":"review","field_type":"unknown","compound_field_info":[select("decision")]});
    for (config, path) in [
        (review_config(), vec!["review", "missing"]),
        (unknown.clone(), vec!["decision"]),
        (unknown.clone(), vec!["review", "decision"]),
        (
            compound("team", vec![unknown]),
            vec!["team", "review", "decision"],
        ),
    ] {
        let mut leaf = json!({"field_key":path.last().unwrap(),"not_finished_owner":["a"]});
        for parent in path[..path.len() - 1].iter().rev() {
            leaf = json!({"field_key":parent,"sub_field":[leaf]});
        }
        let required = json!({"node_fields":[leaf.clone()]});
        let form = NodeForm::build(
            &node(json!({})),
            &required,
            &[config.clone()],
            &[],
            &json!({}),
        )
        .unwrap();
        assert!(
            !form.blocked.is_empty(),
            "节点必填路径 {path:?} 不得静默丢弃"
        );
        leaf["class"] = json!("field");
        let required = json!({"form_items":[leaf]});
        let form =
            NodeForm::build_state(&json!({}), &required, &[config.clone()], &json!({})).unwrap();
        assert!(
            !form.blocked.is_empty(),
            "状态必填路径 {path:?} 不得静默丢弃"
        );
        if path.len() > 1 {
            let configs = [config.clone(), select(path.last().unwrap())];
            let form = NodeForm::build_state(&json!({}), &required, &configs, &json!({})).unwrap();
            assert!(!form.blocked.is_empty(), "完整路径不得回退为同名顶层字段");
            assert!(form.inputs.is_empty(), "不得生成归属错误的顶层字段输入");
            let required = json!({"node_fields": required["form_items"]});
            let form =
                NodeForm::build(&node(json!({})), &required, &configs, &[], &json!({})).unwrap();
            assert!(!form.blocked.is_empty());
            assert!(!form
                .inputs
                .iter()
                .any(|i| matches!(&i.route, Route::Node(key) if key == path.last().unwrap())));
        }
    }
}

#[test]
fn flat_keys_include_unknown_parent_positions_when_checking_ambiguity() {
    let unknown = json!({"field_key":"unknown_parent","field_type":"unknown",
        "compound_field_info":[select("decision")]});
    let configs = [unknown.clone(), select("decision")];
    assert!(NodeForm::build(
        &node(json!({})),
        &required(&["decision"]),
        &configs,
        &[],
        &json!({})
    )
    .is_err());
    assert!(NodeForm::build_state(
        &json!({}),
        &json!({"form_items":[{"key":"decision","class":"field"}]}),
        &configs,
        &json!({})
    )
    .is_err());

    // 远端提供完整且可写的父路径时，同名的未知父路径不影响该字段。
    let configs = [unknown, review_config()];
    let required = json!({"form_items":[{"key":"review","class":"field","sub_field":[
        {"field_key":"decision","not_finished_owner":["a"]}]}]});
    let form = NodeForm::build_state(&json!({}), &required, &configs, &json!({})).unwrap();
    assert!(form.blocked.is_empty());
    assert!(find(&form, "a", "decision").required);
}
