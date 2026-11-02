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
fn rich_text_is_readonly_in_both_flows_and_only_unfinished_requirements_require_feishu() {
    let configs = [json!({"field_key":"description","field_name":"说明","field_type":"multi-text"})];
    let node = json!({"form_items":[{"field_key":"description","form_item_type":"field"}]});
    let transition = json!({"confirm_form":[{"key":"description","class":"field"}]});
    for remote in ["", "已有文字", "说明\n\n![](https://project.feishu.cn/example.png)<!-- image:{\"width\":408} -->"] {
        for finished in [None, Some(true), Some(false)] {
            let required = finished.map(|done| json!({"form_items":[
                {"key":"description","class":"field","finished":done}
            ]})).unwrap_or(json!({}));
            let work = json!({"work_item_fields":[{"key":"description","value":remote}]});
            for form in [
                NodeForm::build(&node, &required, &[], &configs, &work).unwrap(),
                NodeForm::build_state(&transition, &required, &configs, &work).unwrap(),
            ] {
                assert_eq!(form.requires_feishu(), finished == Some(false));
                assert_eq!(form.requires_manual_fill(), finished == Some(false));
                assert_eq!(!form.blocked.is_empty(), finished == Some(false));
                let field = &form.fields()[0];
                assert_eq!(field.settings.read_only, Some(true));
                assert!(!field.required);
                assert_eq!(field.settings.initial_value.as_deref(), Some(remote));
                assert_eq!(field.settings.rich_text.as_ref().unwrap().image_field_key.as_deref(), Some("description"));
                assert_ne!(field.key, serde_json::to_string(&Route::WorkItem("description".into())).unwrap(),
                    "只读身份不能自动恢复旧可编辑草稿");
                assert!(form.plan(&BTreeMap::from([(field.key.clone(), "替换图片内容".into())])).is_err());
                assert!(form.plan(&BTreeMap::new()).unwrap().calls("p", "1", "n").is_empty());
            }
        }
    }
}

#[test]
fn rich_text_structured_values_keep_their_original_shape_for_readonly_preview() {
    let content = json!([
        {"type":"paragraph","content":[{"type":"text","text":"图文说明"}]},
        {"type":"image","attrs":{"src":"https://project.feishu.cn/example.png"}}
    ]);
    for value in [json!({"type":"doc","content":content}), content] {
        let form = NodeForm::build_state(&json!({"confirm_form":[{"key":"description","class":"field"}]}),
            &json!({}), &[json!({"field_key":"description","field_type":"multi-text"})],
            &json!({"work_item_fields":[{"key":"description","value":value}]})).unwrap();
        let field = &form.fields()[0];
        assert!(!form.requires_feishu());
        assert_eq!(field.settings.read_only, Some(true));
        assert_eq!(field.settings.initial_value, Some(value.to_string()));
        assert_eq!(field.settings.rich_text.as_ref().unwrap().structured_value.as_ref(), Some(&value));
        assert!(form.plan(&BTreeMap::new()).unwrap().calls("p", "1", "n").is_empty());
    }
}

#[test]
fn rich_text_preview_uses_its_work_item_root_and_never_guesses_node_image_ownership() {
    let config = compound("review", vec![json!({"field_key":"note","field_type":"multi-text"})]);
    let value = json!({"a":[{"field_key":"note","field_value":"![](https://project.feishu.cn/example.png)"}]});
    let work = json!({"work_item_fields":[{"key":"review","value":value}]});
    for work_item in [false, true] {
        let form = if work_item {
            NodeForm::build_state(&json!({"confirm_form":[{"key":"review","class":"field"}]}),
                &json!({}), &[config.clone()], &work).unwrap()
        } else {
            NodeForm::build(&node(value.clone()), &json!({}), &[config.clone()], &[], &json!({})).unwrap()
        };
        assert!(!form.requires_feishu());
        let field = find(&form, "a", "note");
        assert_eq!(field.settings.read_only, Some(true));
        assert_eq!(field.settings.rich_text.as_ref().unwrap().image_field_key.as_deref(), work_item.then_some("review"));
        assert!(form.plan(&BTreeMap::new()).unwrap().calls("p", "1", "n").is_empty());
    }
    let form = NodeForm::build(&json!({"form_items":[{"field_key":"note","form_item_type":"node_field","value":"云端图文"}]}),
        &json!({}), &[json!({"field_key":"note","field_type":"multi-text"})], &[], &json!({})).unwrap();
    assert!(form.fields()[0].settings.rich_text.as_ref().unwrap().image_field_key.is_none());
}

#[test]
fn system_acceptance_fields_require_feishu_page_even_with_generic_compound_metadata() {
    let config = compound(
        "owners_finished_info",
        vec![
            json!({"field_key":"owners_node_finished_conclusion","field_name":"负责人完成结论","field_type":"select","option":[{"option_id":"system_passed","option_name":"已通过"}]}),
            json!({"field_key":"owners_node_finished_opinion","field_name":"负责人完成意见","field_type":"text"}),
        ],
    );
    let node = json!({"assignees":{"owners":[{"user_key":"a","name":"甲"},{"user_key":"b","name":"乙"}]},"form_items":[
        {"field_key":"owners_finished_info","form_item_type":"node_field","value":json!({
            "a":[{"field_key":"created_at","field_value":123},{"field_key":"owners_node_finished_conclusion","field_value":"system_passed"}],
            "b":[{"field_key":"created_at","field_value":124}]
        }).to_string()}
    ]});
    for req in [
        required(&["owners_node_finished_conclusion", "owners_node_finished_opinion"]),
        required(&["owners_finished_info"]),
        json!({"node_fields":[{"field_key":"owners_finished_info","sub_field":[
            {"field_key":"owners_node_finished_conclusion","not_finished_owner":["a"]}
        ]}]}),
    ] {
        // 包含无父配置的旧快照；系统字段不因元数据形态不同而开放写入。
        for configs in [vec![config.clone()], vec![]] {
            let form = NodeForm::build(&node, &req, &configs, &[], &json!({})).unwrap();
            assert!(form.fields().iter().all(|field| field.settings.read_only == Some(true)));
            assert!(!form.blocked.is_empty());
            assert!(form.requires_manual_fill());
            assert!(form.requires_feishu());
            assert!(form.node_block_reason("评审").unwrap().contains("由于该字段类型不支持自动化补充，请您在飞书项目页面手动填写后，再通知我继续流转。"));
            assert!(form.plan(&BTreeMap::new()).unwrap().calls("p", "1", "n").is_empty());
        }
    }
    // 系统必填项已在飞书满足后，可以继续推进，不重写已有负责人信息。
    let form = NodeForm::build(&node, &json!({}), &[config], &[], &json!({})).unwrap();
    assert!(form.blocked.is_empty());
    assert!(!form.requires_manual_fill());
    assert!(!form.requires_feishu(), "已满足的只读字段沿用云端，不要求到飞书完成流程");
    assert_eq!(form.fields().len(), 4);
    assert!(form.fields().iter().any(|field| field.settings.initial_value.as_deref() == Some("system_passed")));
    assert!(form.fields().iter().all(|field| field.settings.read_only == Some(true) && !field.required));
    assert!(form.plan(&BTreeMap::new()).unwrap().calls("p", "1", "n").is_empty());
    let attempted = BTreeMap::from([(form.fields()[0].key.clone(), "system_passed".into())]);
    assert!(form.plan(&attempted).is_err(), "只读云端快照不得进入写入计划");
    let old_snapshot = NodeForm::build(&node, &json!({}), &[], &[], &json!({})).unwrap();
    assert!(!old_snapshot.requires_feishu(), "系统字段缺少本地控件配置时也不能凭字段存在阻断流程");
    assert!(!old_snapshot.requires_manual_fill());
    assert_eq!(old_snapshot.fields().len(), 1, "缺少子字段配置时保留整个云端只读快照");
    assert_eq!(old_snapshot.fields()[0].settings.read_only, Some(true));
    assert_eq!(old_snapshot.fields()[0].settings.initial_value.as_deref(), node["form_items"][0]["value"].as_str());
}

#[test]
fn page_only_fields_block_only_unfinished_required_values_with_official_node_message() {
    for (key, kind, label) in [
        ("actual_work_time", "number", "实际工时"),
        ("vote", "vote-boolean", "是否同意"),
        ("vote", "vote-option", "评审投票"),
        ("vote", "vote-option-multi", "多选投票"),
    ] {
        let node = json!({"form_items":[{"field_key":key,"field_name":label,"form_item_type":"node_field","value":0}],"schedule":{"actual_work_time":0}});
        let configs = vec![json!({"field_key":key,"field_name":label,"field_type":kind})];
        for required in [json!({}), json!({"node_fields":[{"field_key":key,"finished":true}]})] {
            let form = NodeForm::build(&node, &required, &configs, &[], &json!({})).unwrap();
            assert!(form.node_block_reason("验收").is_none(), "非必填或已完成值不能拦截流转");
            assert!(!form.requires_manual_fill());
            assert!(!form.requires_feishu(), "可选或已满足的只读字段不能要求跳转飞书");
            assert_eq!(form.fields().len(), 1);
            assert_eq!(form.fields()[0].settings.read_only, Some(true));
            assert_eq!(form.fields()[0].settings.initial_value.as_deref(), Some("0"));
            assert!(form.plan(&BTreeMap::new()).unwrap().calls("p", "1", "n").is_empty());
        }
        let required = json!({"node_fields":[{"field_key":key,"finished":false}]});
        let form = NodeForm::build(&node, &required, &configs, &[], &json!({})).unwrap();
        assert!(form.requires_manual_fill());
        assert!(form.requires_feishu());
        let expected_kind = if key == "actual_work_time" { key } else { kind };
        assert_eq!(form.node_block_reason("验收").unwrap(), format!(
            "节点流转失败。当前节点【验收】设置了必须填写【{label}】（类型：{expected_kind}）才能流转。由于该字段类型不支持自动化补充，请您在飞书项目页面手动填写后，再通知我继续流转。"
        ));
    }
}

#[test]
fn nested_vote_snapshots_keep_cloud_content_and_distinct_required_field_identities() {
    let remote = json!({"votes":[{"option_id":"pass","count":2}],"extra":true});
    let config = compound("review", vec![
        json!({"field_key":"decision","field_name":"评审确认","field_type":"vote-option"}),
        json!({"field_key":"approval","field_name":"评审确认","field_type":"vote-boolean"}),
    ]);
    let node = node(json!({"a":[
        {"field_key":"decision","field_value":remote},
        {"field_key":"approval","field_value":false}
    ]}));
    let required = required(&["decision", "approval"]);
    let form = NodeForm::build(&node, &required, &[config.clone()], &[], &json!({})).unwrap();
    assert!(form.requires_manual_fill());
    assert!(form.requires_feishu());
    let reason = form.node_block_reason("评审").unwrap();
    let template = |kind| format!("节点流转失败。当前节点【评审】设置了必须填写【评审确认】（类型：{kind}）才能流转。由于该字段类型不支持自动化补充，请您在飞书项目页面手动填写后，再通知我继续流转。");
    assert!(reason.contains(&template("vote-option")) && reason.contains(&template("vote-boolean")));
    assert_eq!(reason.lines().count(), 2, "同名不同类型的缺项不能互相覆盖或追加通用错误");
    assert_eq!(find(&form, "a", "decision").settings.initial_value, Some(remote.to_string()));
    assert_eq!(find(&form, "a", "approval").settings.initial_value.as_deref(), Some("false"));
    assert!(form.fields().iter().all(|field| field.settings.read_only == Some(true)));
    assert!(form.plan(&BTreeMap::new()).unwrap().calls("p", "1", "n").is_empty());
    let attempted = BTreeMap::from([(find(&form, "a", "decision").key.clone(), "different".into())]);
    assert!(form.plan(&attempted).is_err());
    assert!(serde_json::to_string(&form).is_ok(), "完整身份必须可进入动作指纹");
    for required in [json!({}), json!({"node_fields":[{"field_key":"review","finished":true}]})] {
        let form = NodeForm::build(&node, &required, &[config.clone()], &[], &json!({})).unwrap();
        assert!(form.node_block_reason("评审").is_none());
        assert!(!form.requires_manual_fill());
        assert!(!form.requires_feishu());
        assert_eq!(find(&form, "a", "decision").settings.initial_value, Some(remote.to_string()));
    }
}

#[test]
fn unsupported_types_offer_manual_fill_only_for_unfinished_required_fields() {
    let configs = [json!({"field_key":"attachment","field_name":"附件","field_type":"file"})];
    let node = json!({"form_items":[{"field_key":"attachment","form_item_type":"node_field"}]});
    let transition = json!({"confirm_form":[{"class":"field","key":"attachment"}]});
    for finished in [None, Some(true), Some(false)] {
        let node_required = finished.map(|done| json!({"node_fields":[{"field_key":"attachment","finished":done}]})).unwrap_or(json!({}));
        let state_required = finished.map(|done| json!({"form_items":[{"key":"attachment","class":"field","finished":done}]})).unwrap_or(json!({}));
        let forms = [
            NodeForm::build(&node, &node_required, &configs, &[], &json!({})).unwrap(),
            NodeForm::build_state(&transition, &state_required, &configs, &json!({})).unwrap(),
            NodeForm::build_state(&transition, &state_required, &[], &json!({})).unwrap(),
        ];
        for form in forms {
            assert_eq!(form.requires_manual_fill(), finished == Some(false));
            assert_eq!(!form.blocked.is_empty(), finished == Some(false));
            assert_eq!(form.requires_feishu(), finished == Some(false), "只有未完成且本地无法补填的必填项才转到飞书");
        }
    }
}

#[test]
fn related_release_fields_require_feishu_only_when_still_unfinished() {
    let config = json!({"field_key":"release","field_name":"上车版本","field_type":"workitem_related_select"});
    let node = json!({"form_items":[{"field_key":"release","field_name":"上车版本","form_item_type":"field"}]});
    let transition = json!({"confirm_form":[{"key":"release","name":"上车版本","class":"field"}]});
    for remote in [Value::Null, json!({"work_item_id":"2","name":"云端发布版本"})] {
        let work = json!({"work_item_fields":[{"key":"release","value":remote}]});
        for finished in [None, Some(true), Some(false)] {
            let required = finished.map(|done| json!({"form_items":[
                {"key":"release","class":"field","finished":done}
            ]})).unwrap_or(json!({}));
            for form in [
                NodeForm::build(&node, &required, &[], &[config.clone()], &work).unwrap(),
                NodeForm::build_state(&transition, &required, &[config.clone()], &work).unwrap(),
            ] {
                assert_eq!(form.requires_feishu(), finished == Some(false));
                assert_eq!(form.requires_manual_fill(), finished == Some(false));
                assert_eq!(!form.blocked.is_empty(), finished == Some(false));
                let fields = form.fields();
                assert_eq!(fields.len(), 1, "关联字段仍需完整核对云端值");
                assert_eq!(fields[0].settings.read_only, Some(true));
                assert!(!fields[0].required);
                if remote.is_null() {
                    assert_eq!(fields[0].settings.initial_value.as_deref(), Some(""));
                } else {
                    assert_eq!(serde_json::from_str::<Value>(fields[0].settings.initial_value.as_deref().unwrap()).unwrap(), remote);
                    assert_eq!(fields[0].options[0].label, "云端发布版本");
                }
                assert!(form.plan(&BTreeMap::from([(fields[0].key.clone(), "3".into())])).is_err(),
                    "即使伪造请求也不能写入只读关联字段");
                assert!(form.plan(&BTreeMap::new()).unwrap().calls("p", "1", "n").is_empty(),
                    "沿用云端关联值不能发送字段更新");
            }
        }
    }
}

#[test]
fn optional_readonly_and_compound_fields_preserve_local_workflow_actions() {
    let configs = [
        json!({"field_key":"note","field_type":"text"}),
        json!({"field_key":"actual_work_time","field_type":"number"}),
        json!({"field_key":"unrelated_file","field_type":"file"}),
    ];
    let node = json!({"form_items":[{"field_key":"note","form_item_type":"node_field"}]});
    let form = NodeForm::build(&node, &json!({}), &configs, &[], &json!({})).unwrap();
    assert!(!form.requires_feishu(), "空间配置不等于当前动作字段");
    let with_work_time = json!({"form_items":node["form_items"],"schedule":{"actual_work_time":0}});
    let form = NodeForm::build(&with_work_time, &json!({}), &configs, &[], &json!({})).unwrap();
    assert!(!form.requires_feishu(), "只读零值沿用云端，不要求跳转飞书");
    assert!(!form.requires_manual_fill());
    let state = NodeForm::build_state(&json!({"confirm_form":[{"class":"field","key":"note"}]}),
        &json!({}), &configs, &json!({})).unwrap();
    assert!(!state.requires_feishu());

    let config = compound("review", vec![json!({"field_key":"attachment","field_type":"file"})]);
    let state = NodeForm::build_state(&json!({"confirm_form":[{"class":"field","key":"review"}]}),
        &json!({}), &[config], &json!({})).unwrap();
    assert!(state.fields().is_empty());
    assert!(!state.requires_feishu(), "没有未完成必填项时，可选复合字段子项不改变操作地点");
    assert!(!state.requires_manual_fill());
}

#[test]
fn page_fields_with_other_unavailable_required_configuration_still_open_same_item_page() {
    let configs = [json!({"field_key":"file","field_type":"file"}),
        json!({"field_key":"choice","field_type":"select","option":[]})];
    let node_required = json!({"node_fields":[{"field_key":"file"},{"field_key":"choice"}]});
    let state_required = json!({"form_items":[{"key":"file","class":"field"},{"key":"choice","class":"field"}]});
    for form in [
        NodeForm::build(&json!({}), &node_required, &configs, &[], &json!({})).unwrap(),
        NodeForm::build_state(&json!({}), &state_required, &configs, &json!({})).unwrap(),
    ] {
        assert!(form.requires_manual_fill());
        assert_eq!(form.blocked.len(), 2);
        assert!(form.requires_feishu(), "混合字段配置异常不阻止打开同一事项，API写入阻断仍保留");
    }
}

#[test]
fn missing_required_metadata_opens_page_while_preserving_api_block() {
    let node_required = json!({"node_fields":[{"field_key":"missing"}]});
    let state_required = json!({"form_items":[{"key":"missing","class":"field"}]});
    for form in [
        NodeForm::build(&json!({}), &node_required, &[], &[], &json!({})).unwrap(),
        NodeForm::build_state(&json!({}), &state_required, &[], &json!({})).unwrap(),
    ] {
        assert!(form.requires_manual_fill());
        assert!(form.requires_feishu());
        assert_eq!(form.blocked.len(), 1);
        assert_eq!(form.fields().len(), 1);
        assert_eq!(form.fields()[0].settings.read_only, Some(true), "缺配置只保留快照，不生成API填写控件");
    }
}

#[test]
fn missing_metadata_keeps_readonly_cloud_values_for_node_and_state_review() {
    for remote in [json!(0), json!(false), json!("云端内容"), json!({"id":2,"name":"云端事项"})] {
        let node = json!({"form_items":[
            {"field_key":"node-value","field_name":"节点内容","form_item_type":"node_field","value":remote},
            {"field_key":"work-value","field_name":"事项内容","form_item_type":"field"}
        ]});
        let work = json!({"work_item_fields":[{"key":"work-value","value":remote}]});
        let transition = json!({"confirm_form":[{"key":"work-value","name":"事项内容","class":"field"}]});
        for finished in [None, Some(true), Some(false)] {
            let work_required = finished.map(|done| json!({"form_items":[
                {"key":"work-value","class":"field","finished":done}
            ]})).unwrap_or(json!({}));
            let mut node_required = work_required.clone();
            if let Some(done) = finished {
                node_required["node_fields"] = json!([{ "field_key":"node-value","finished":done }]);
            }
            for (form, count) in [
                (NodeForm::build(&node, &node_required, &[], &[], &work).unwrap(), 2),
                (NodeForm::build_state(&transition, &work_required, &[], &work).unwrap(), 1),
            ] {
                assert_eq!(form.requires_feishu(), finished == Some(false));
                let fields = form.fields();
                assert_eq!(fields.len(), count);
                for field in fields {
                    assert_eq!(field.settings.read_only, Some(true));
                    let expected = remote.as_str().map(str::to_owned).unwrap_or_else(|| remote.to_string());
                    assert_eq!(field.settings.initial_value.as_deref(), Some(expected.as_str()));
                    assert!(form.plan(&BTreeMap::from([(field.key, "替换值".into())])).is_err());
                }
                assert!(form.plan(&BTreeMap::new()).unwrap().calls("p", "1", "n").is_empty());
            }
        }
    }
}

#[test]
fn missing_metadata_preserves_form_values_without_overwriting_explicit_cloud_clears() {
    let fallback = json!({"id":2,"name":"表单中的关联事项"});
    let node = json!({"form_items":[{"field_key":"release","field_name":"上车版本",
        "form_item_type":"field","value":fallback}]});
    let transition = json!({"confirm_form":[{"key":"release","name":"上车版本","class":"field","value":fallback}]});
    for work in [json!({}), json!({"work_item_fields":[{"key":"release","value":null}]})] {
        let expected = if work.get("work_item_fields").is_some() { String::new() } else { fallback.to_string() };
        for form in [
            NodeForm::build(&node, &json!({}), &[], &[], &work).unwrap(),
            NodeForm::build_state(&transition, &json!({}), &[], &work).unwrap(),
        ] {
            assert!(!form.requires_feishu());
            let fields = form.fields();
            assert_eq!(fields.len(), 1);
            assert_eq!(fields[0].settings.read_only, Some(true));
            assert_eq!(fields[0].settings.initial_value.as_deref(), Some(expected.as_str()));
            assert!(form.plan(&BTreeMap::new()).unwrap().calls("p", "1", "n").is_empty());
        }
    }
}

#[test]
fn missing_schedule_metadata_keeps_summary_or_personal_values_readonly() {
    for personal in [false, true] {
        let mut node = json!({"form_items":[
            {"field_key":"actual_work_time","field_name":"实际工时","form_item_type":"node_field"},
            {"field_key":"point","field_name":"估分","form_item_type":"node_field"},
            {"field_key":"schedule","field_name":"排期","form_item_type":"node_field"}
        ],"schedule":{"actual_work_time":99,"points":99,
            "estimate_start_time":1704211200000i64,"estimate_finish_time":1704297600000i64}});
        if personal {
            node["assignees"] = json!({"owners":[{"user_key":"a","name":"甲"}]});
            node["assignee_schedule_list"] = json!([{"assignee":{"user_key":"a"},"schedule_info":{
                "actual_work_time":0,"points":3,"estimate_start_time":1704038400000i64,"estimate_finish_time":1704124800000i64
            }}]);
        }
        let form = NodeForm::build(&node, &json!({}), &[], &[], &json!({})).unwrap();
        assert!(!form.requires_feishu());
        let fields = form.fields();
        assert_eq!(fields.len(), 4);
        for (label, expected) in [
            ("实际工时", if personal { "0" } else { "99" }),
            ("估分", if personal { "3" } else { "99" }),
            ("排期 · 开始日期", if personal { "2024-01-01" } else { "2024-01-03" }),
            ("排期 · 结束日期", if personal { "2024-01-02" } else { "2024-01-04" }),
        ] {
            let field = fields.iter().find(|field| field.label == label).unwrap();
            assert_eq!(field.settings.initial_value.as_deref(), Some(expected));
            assert_eq!(field.settings.owner.as_deref(), personal.then_some("甲"));
            assert_eq!(field.settings.read_only, Some(true));
            assert!(form.plan(&BTreeMap::from([(field.key.clone(), "替换值".into())])).is_err());
        }
        assert!(form.schedule_only().is_none(), "缺配置的只读日期不能生成独立同步动作");
        assert!(form.progress_only().is_none());
        assert!(form.plan(&BTreeMap::new()).unwrap().calls("p", "1", "n").is_empty());
    }
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
