//! 创建入口按真实空间/类型定位；本机开关不替代飞书权限。
use crate::{
    api::Session,
    association::identifier,
    detail::{self, ItemDetail},
    error::BackendError,
    mcp::feishu::TOOL_CREATE_WORKITEM,
    model::WorkItemId,
    store::ActionRecord,
};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub mod images;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Target {
    pub source_id: String,
    pub project_key: String,
    pub type_key: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionValue {
    pub value: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LookupResult {
    pub options: Vec<OptionValue>,
    pub warning: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelatedType {
    pub project_key: String,
    pub type_key: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Field {
    pub key: String,
    pub label: String,
    pub kind: String,
    pub required: bool,
    pub multiple: bool,
    pub initial: Value,
    pub options: Vec<OptionValue>,
    pub related: Vec<RelatedType>,
    pub remote_type: String,
    #[serde(default)]
    pub role_id: Option<String>,
    #[serde(default)]
    pub reporter_self: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Form {
    pub target: Target,
    pub context: String,
    pub version: String,
    pub fields: Vec<Field>,
    pub pending: Option<Pending>,
    #[serde(default)]
    pub role_requirements_complete: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pending {
    pub request: Request,
    pub result: ResultView,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
    pub target: Target,
    pub request_id: String,
    pub version: String,
    pub fields: BTreeMap<String, Value>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResultView {
    pub outcome: String,
    pub message: String,
    pub request_id: String,
    pub item_id: Option<WorkItemId>,
    pub can_verify: bool,
}

pub fn pending_forms(session: &Session) -> Result<Vec<Form>, BackendError> {
    let records = session.store.pending_creations()?;
    if records.is_empty() {
        return Ok(Vec::new());
    }
    let context = account(session)?;
    let mut forms = Vec::new();
    for record in records {
        let target: Target = serde_json::from_str(&record.target)?;
        if record.item_id != ledger_key(&target, &context) {
            continue;
        }
        let saved: Value = serde_json::from_str(record.detail.as_deref().unwrap_or("{}"))?;
        let request: Request = serde_json::from_value(saved["request"].clone())?;
        let id = serde_json::from_value(saved["item_id"].clone())?;
        let mut form: Form = serde_json::from_value(saved["form"].clone())?;
        form.pending = Some(Pending {
            result: result(&request, id, false),
            request,
        });
        forms.push(form);
    }
    Ok(forms)
}

fn text(v: &Value) -> String {
    detail::text(v).unwrap_or_default()
}
fn digest(v: &impl Serialize) -> String {
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(v).expect("serializable creation data"))
    )
}
struct CurrentUser {
    key: String,
    name: String,
}
fn current_user(session: &Session) -> Result<CurrentUser, BackendError> {
    let value = session.call_read_tool(
        "search_user_info",
        json!({"user_keys":["current_login_user()"]})
            .as_object()
            .unwrap(),
    )?;
    let users = value
        .as_array()
        .filter(|u| u.len() == 1)
        .ok_or_else(|| BackendError::validation("未能确认当前飞书账号，请检查连接后重试"))?;
    let key = text(&users[0]["user_key"]);
    if key.is_empty() {
        return Err(BackendError::validation("当前飞书账号缺少身份标识"));
    }
    let name = text(&users[0]["name_cn"]);
    Ok(CurrentUser { key, name })
}
fn account_context(session: &Session, user: &CurrentUser) -> String {
    // 同一账号轮换 Token 不丢待核验记录；本机数据库分别保存草稿与动作台账。
    digest(&(
        session.config.endpoint.as_str(),
        &user.key,
        &session.config.db_path,
    ))
}
fn account(session: &Session) -> Result<String, BackendError> {
    Ok(account_context(session, &current_user(session)?))
}
fn ledger_key(target: &Target, account: &str) -> String {
    format!(
        "create|{}",
        digest(&(&target.project_key, &target.type_key, account))
    )
}
fn permitted(session: &Session, target: &Target) -> Result<(), BackendError> {
    let source = session
        .config
        .sources
        .iter()
        .find(|s| s.id == target.source_id && s.enabled)
        .ok_or_else(|| BackendError::validation("当前工作来源已停用或不存在"))?;
    if !session
        .store
        .source_types(&source.id)?
        .iter()
        .any(|t| t.project_key == target.project_key && t.type_key == target.type_key)
    {
        return Err(BackendError::validation(
            "未在当前来源发现此类型，请重新发现类型",
        ));
    }
    match &source.kind {
        crate::SourceKind::WorkItemType {
            project_key,
            type_key,
        } => {
            if project_key
                .as_ref()
                .is_some_and(|p| p != &target.project_key)
                || type_key.as_ref().is_some_and(|k| k != &target.type_key)
            {
                return Err(BackendError::validation("创建位置不属于当前工作来源"));
            }
        }
        crate::SourceKind::View { project_key, .. }
            if project_key
                .as_ref()
                .is_some_and(|p| p != &target.project_key) =>
        {
            return Err(BackendError::validation("创建空间不属于当前工作来源"));
        }
        _ => {}
    }
    let preferences = session.store.source_type_preferences()?.unwrap_or_default();
    if !preferences
        .get(&target.source_id)
        .and_then(|p| p.get(&target.type_key))
        .is_some_and(|p| p.create_enabled)
    {
        return Err(BackendError::validation(
            "此类型尚未开启新建，请在工作类型设置中开启",
        ));
    }
    Ok(())
}
fn field_options(config: &Value) -> Vec<OptionValue> {
    config["option"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|o| o["disabled"] != true)
        .filter_map(|o| {
            let value = text(&o["option_id"]);
            let label = text(&o["option_name"]);
            (!value.is_empty() && !label.is_empty()).then_some(OptionValue {
                value,
                label,
                color: o.get("color").and_then(Value::as_str).map(str::to_owned),
            })
        })
        .collect()
}
fn default_value(meta: &Value) -> Value {
    if meta["default_value"]["default_appear"] != 1 {
        return Value::Null;
    }
    let raw = &meta["default_value"]["value"];
    let decoded = raw
        .as_str()
        .and_then(|v| base64::engine::general_purpose::STANDARD.decode(v).ok())
        .and_then(|v| serde_json::from_slice::<Value>(&v).ok())
        .unwrap_or_else(|| raw.clone());
    decoded.get("value").cloned().unwrap_or(decoded)
}
fn field(meta: &Value, config: &Value) -> Field {
    let key = text(&meta["field_key"]);
    let label = text(&meta["field_name"]);
    let remote = config["field_type"]
        .as_str()
        .or_else(|| meta["field_type_key"].as_str())
        .unwrap_or("");
    let multiple = matches!(
        remote,
        "multi-user"
            | "multi_user"
            | "multi-select"
            | "workitem_related_multi_select"
            | "work_item_related_multi_select"
    );
    let kind = match remote {
        "text" | "_name" | "link" | "multi-pure-text" => "text",
        "multi-text" | "multi_text" => "textarea",
        "select" | "radio" | "_business" | "_work_item_template" | "work_item_template" | "multi-select" => {
            "select"
        }
        "user" | "multi-user" | "multi_user" => "people",
        "workitem_related_select"
        | "work_item_related_select"
        | "workitem_related_multi_select"
        | "work_item_related_multi_select" => "relation",
        "number" => "number",
        "bool" => "bool",
        "date" => "date",
        _ => "unsupported",
    }
    .to_string();
    let options = field_options(config);
    let mut initial = default_value(meta);
    if kind == "date" && initial.as_i64().is_some() {
        initial = chrono::DateTime::from_timestamp_millis(initial.as_i64().unwrap())
            .map(|d| {
                json!(d
                    .with_timezone(&chrono::FixedOffset::east_opt(8 * 3600).unwrap())
                    .format("%Y-%m-%d")
                    .to_string())
            })
            .unwrap_or(Value::Null);
    }
    if kind == "select" {
        if key == "template" && options.len() == 1 {
            initial = json!(options[0].value);
        } else if !multiple && !initial.is_null() {
            initial = json!(text(&initial));
        }
        if !multiple && !initial.is_null() && !options.iter().any(|o| o.value == text(&initial)) {
            initial = Value::Null;
        }
    }
    let related = config["related_work_item_info"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|r| {
            let project_key = text(&r["project_key"]);
            let type_key = text(&r["work_item_type"]);
            (!project_key.is_empty() && !type_key.is_empty()).then_some(RelatedType {
                project_key,
                type_key,
            })
        })
        .collect();
    Field {
        key,
        label,
        kind,
        required: meta["is_required"] == 1 || meta["is_required"] == true,
        multiple,
        initial,
        options,
        related,
        remote_type: remote.into(),
        role_id: None,
        reporter_self: false,
    }
}
fn role_fields(roles: &[Value]) -> Result<Vec<Field>, BackendError> {
    let mut fields = Vec::new();
    for role in roles {
        let id = text(&role["role_id"]);
        let label = text(&role["role_name"]);
        if id.is_empty()
            || label.is_empty()
            || fields
                .iter()
                .any(|f: &Field| f.role_id.as_deref() == Some(&id))
        {
            return Err(BackendError::parse("创建角色配置", "角色标识缺失或重复"));
        }
        fields.push(Field {
            key: format!("role:{id}"),
            label,
            kind: "people".into(),
            required: role["is_required"] == 1 || role["is_required"] == true,
            multiple: role["is_member_multi"] != false,
            initial: Value::Null,
            options: vec![],
            related: vec![],
            remote_type: "role_owners".into(),
            role_id: Some(id),
            reporter_self: false,
        });
    }
    Ok(fields)
}
pub fn discover(session: &Session, target: &Target) -> Result<Form, BackendError> {
    // 恢复已有结果不依赖新建开关、来源可用性或当前字段配置。
    if let Some(form) = pending_forms(session)?.into_iter().find(|f| {
        f.target.project_key == target.project_key && f.target.type_key == target.type_key
    }) {
        return Ok(form);
    }
    discover_fresh(session, target)
}

fn discover_fresh(session: &Session, target: &Target) -> Result<Form, BackendError> {
    permitted(session, target)?;
    let args = json!({"project_key":target.project_key,"work_item_type":target.type_key});
    let meta = session.call_read_tool("get_workitem_field_meta", args.as_object().unwrap())?;
    let required = meta["FieldConfList"]
        .as_array()
        .ok_or_else(|| BackendError::parse("创建表单", "缺少字段定义"))?;
    let configs = crate::remote::runtime()?.block_on(session.field_metadata(
        "list_workitem_field_config",
        &target.project_key,
        &target.type_key,
        true,
    ))?;
    // 创建工具要求读取角色配置；角色名称不决定谁能新建。
    let roles = crate::remote::runtime()?.block_on(session.field_metadata(
        "list_workitem_role_config",
        &target.project_key,
        &target.type_key,
        true,
    ))?;
    // 必填元数据不是完整表单；可选业务字段必须从完整字段配置补齐。
    let mut metas = required.clone();
    for config in &configs {
        let key = text(&config["field_key"]);
        // 以下稳定系统 Key 由飞书维护，不属于创建时填写的业务字段。
        if matches!(key.as_str(),
            "start_time" | "owner" | "owned_project" | "work_item_id"
                | "current_status_operator" | "work_item_type_key" | "updated_by"
                | "updated_at" | "auto_number" | "is_frozen" | "template_version"
                | "finish_time" | "finish_status" | "abort_reason" | "abort_detail"
                | "work_item_status"
        ) {
            continue;
        }
        if !metas.iter().any(|m| m["field_key"] == key) {
            let mut meta = config.clone();
            if key == "name" {
                meta["is_required"] = json!(1);
            }
            metas.push(meta);
        }
    }
    if !metas.iter().any(|m| m["field_key"] == "template") {
        return Err(BackendError::validation(
            "暂未取得可用的创建模板，请在飞书项目中检查此类型配置",
        ));
    }
    let mut fields = Vec::new();
    for meta in metas {
        let key = text(&meta["field_key"]);
        if key.is_empty() || fields.iter().any(|f: &Field| f.key == key) {
            return Err(BackendError::parse("创建表单", "字段标识缺失或重复"));
        }
        let config = configs
            .iter()
            .find(|c| c["field_key"] == key)
            .unwrap_or(&Value::Null);
        let mut f = field(&meta, config);
        if f.key == "template" {
            f.required = true;
        }
        fields.push(f);
    }
    fields.sort_by_key(|f| match f.key.as_str() {
        "name" => 0,
        "template" => 1,
        "description" => 2,
        _ => 3,
    });
    let mut personnel = role_fields(&roles)?;
    // 飞书缺陷的内置报告人字段与 reporter 角色共用一个人员槽；按系统 Key 合并。
    if let (Some(index), Some(role)) = (
        fields.iter().position(|f| f.key == "issue_reporter"),
        personnel
            .iter_mut()
            .find(|f| f.role_id.as_deref() == Some("reporter")),
    ) {
        let field = fields.remove(index);
        role.required |= field.required;
        role.initial = field.initial;
        role.multiple = field.multiple;
    }
    fields.extend(personnel);
    let user = current_user(session)?;
    let context = account_context(session, &user);
    for field in &mut fields {
        // 系统角色/字段 Key 才能确认报告人，中文同名字段不能触发此默认。
        let reporter = field.role_id.as_deref() == Some("reporter")
            || (field.role_id.is_none() && field.key == "issue_reporter");
        if field.kind == "people" && reporter {
            field.reporter_self = true;
            field.initial = if field.multiple {
                json!([&user.key])
            } else {
                json!(&user.key)
            };
            field.options = vec![OptionValue {
                value: user.key.clone(),
                label: if user.name.is_empty() { user.key.clone() } else { user.name.clone() },
                color: None,
            }];
        }
    }
    let version = digest(&(target, &context, &fields));
    let role_requirements_complete = roles.iter().all(|r| r.get("is_required").is_some());
    Ok(Form {
        target: target.clone(),
        context,
        version,
        fields,
        pending: None,
        role_requirements_complete,
    })
}
pub fn lookup(
    session: &Session,
    target: &Target,
    field_key: &str,
    query: &str,
) -> Result<LookupResult, BackendError> {
    let form = discover(session, target)?;
    let f = form
        .fields
        .iter()
        .find(|f| f.key == field_key)
        .ok_or_else(|| BackendError::validation("所选字段已变化，请重新打开表单"))?;
    if query.chars().count() > 100 {
        return Err(BackendError::validation("搜索内容过长"));
    }
    if f.kind == "people" {
        let mut known = session
            .store
            .creation_people(&form.context, &target.project_key)?;
        for snapshot in session
            .store
            .creation_people_snapshots(&target.project_key)?
        {
            collect_people(&snapshot, &mut known);
        }
        let keys = if query.trim().is_empty() {
            vec!["current_login_user()"]
        } else {
            vec![query.trim()]
        };
        let response = session.call_read_tool(
            "search_user_info",
            json!({"project_key":target.project_key,"user_keys":keys})
                .as_object()
                .unwrap(),
        );
        let mut remote_ids = std::collections::BTreeSet::new();
        let mut failure = None;
        match response {
            Ok(value) => {
                let users = value
                    .as_array()
                    .ok_or_else(|| BackendError::parse("人员搜索", "响应不是人员列表"))?;
                for user in users {
                    let key = text(&user["user_key"]);
                    let label = text(&user["name_cn"]);
                    if !key.is_empty() && !label.is_empty() {
                        remote_ids.insert(key.clone());
                        known.insert(key, label);
                    }
                }
            }
            Err(error) => failure = Some(error),
        }
        session
            .store
            .save_creation_people(&form.context, &target.project_key, &known)?;
        let query = query.trim().to_lowercase();
        let mut options = known
            .into_iter()
            .filter(|(id, name)| {
                query.is_empty() || name.to_lowercase().contains(&query) || remote_ids.contains(id)
            })
            .map(|(value, label)| OptionValue { value, label, color: None })
            .collect::<Vec<_>>();
        options.sort_by(|a, b| a.label.cmp(&b.label).then_with(|| a.value.cmp(&b.value)));
        if options.is_empty() {
            if let Some(error) = failure {
                return Err(error);
            }
        }
        return Ok(LookupResult {
            options,
            warning: failure.map(|_| "在线查询暂不可用，当前仅显示本机已知人员。".into()),
        });
    }
    if f.kind != "relation" {
        return Err(BackendError::validation("此字段不支持搜索"));
    }
    let escaped = query
        .trim()
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace(['\r', '\n'], " ");
    let mut found = Vec::new();
    for related in &f.related {
        let mql = format!(
            "SELECT `work_item_id`, `name` FROM {}.{}{} LIMIT 20",
            identifier(&related.project_key)?,
            identifier(&related.type_key)?,
            if escaped.is_empty() {
                String::new()
            } else {
                format!(" WHERE `name` like '%{escaped}%'")
            }
        );
        let value = session.call_read_tool(
            "search_by_mql",
            json!({"project_key":related.project_key,"mql":mql})
                .as_object()
                .unwrap(),
        )?;
        if value["data"].is_null() && value["total"] == 0 {
            continue;
        }
        let data = value["data"]
            .as_object()
            .ok_or_else(|| BackendError::parse("关联事项", "缺少查询数据"))?;
        for row in data.values().filter_map(Value::as_array).flatten() {
            let fields = row["moql_field_list"]
                .as_array()
                .ok_or_else(|| BackendError::parse("关联事项", "缺少查询字段"))?;
            let id = fields
                .iter()
                .find(|v| v["key"] == "work_item_id")
                .map(|v| text(&v["value"]["long_value"]))
                .unwrap_or_default();
            let name = fields
                .iter()
                .find(|v| v["key"] == "name")
                .map(|v| text(&v["value"]["string_value"]))
                .unwrap_or_default();
            if !id.is_empty() && !name.is_empty() {
                found.push(OptionValue {
                    value: id,
                    label: name,
                    color: None,
                });
            }
        }
    }
    Ok(LookupResult {
        options: found,
        warning: None,
    })
}

fn collect_people(value: &Value, people: &mut BTreeMap<String, String>) {
    fn visit(value: &Value, people: &mut BTreeMap<String, String>, person: bool, role: bool) {
        match value {
            Value::Array(values) => {
                for value in values {
                    visit(value, people, person, role);
                }
            }
            Value::Object(object) => {
                // 角色成员、负责人可能只有 key＋name；一般关联事项/空间的同形对象不能当成人。
                let id = object
                    .get("user_key")
                    .or_else(|| {
                        (person || object.contains_key("email"))
                            .then(|| object.get("key"))
                            .flatten()
                    })
                    .map(text)
                    .unwrap_or_default();
                let name = object
                    .get("name_cn")
                    .or_else(|| object.get("name"))
                    .map(text)
                    .unwrap_or_default();
                if !id.is_empty() && !name.is_empty() {
                    people.insert(id, name);
                }
                for (key, value) in object {
                    visit(value, people, key == "owners" || (role && key == "members"), key == "role_members");
                }
            }
            _ => {}
        }
    }
    visit(value, people, false, false);
}
fn empty(value: &Value) -> bool {
    value.is_null()
        || value.as_str().is_some_and(|s| s.trim().is_empty())
        || value.as_array().is_some_and(Vec::is_empty)
}
fn encode(f: &Field, value: &Value) -> Result<Value, BackendError> {
    let fail = || BackendError::validation(format!("请检查「{}」的填写内容", f.label));
    match f.kind.as_str() {
        "text" | "textarea" => {
            let input = value.as_str().ok_or_else(fail)?;
            if input.contains("fstodo-image:") {
                return Err(BackendError::validation(format!("「{}」还有未上传的图片，请先上传图片后再创建", f.label)));
            }
            Ok(json!(if f.kind == "textarea" { input } else { input.trim() }))
        }
        "select" if f.multiple => {
            let list = value.as_array().ok_or_else(fail)?;
            let values = list
                .iter()
                .map(|v| {
                    let id = v.as_str().ok_or_else(fail)?;
                    if !f.options.iter().any(|o| o.value == id) {
                        return Err(fail());
                    }
                    Ok(json!({"option_id":id}))
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(json!(values))
        }
        "select" => {
            let v = value.as_str().ok_or_else(fail)?;
            if !f.options.iter().any(|o| o.value == v) {
                return Err(fail());
            }
            if f.key == "template" {
                return v
                    .parse::<u64>()
                    .ok()
                    .filter(|v| *v > 0)
                    .map(|v| json!(v))
                    .ok_or_else(fail);
            }
            Ok(json!(v))
        }
        "people" | "relation" => {
            let values = if f.multiple {
                value.as_array().cloned().ok_or_else(fail)?
            } else {
                vec![value.clone()]
            };
            let values = values
                .iter()
                .map(|v| {
                    let id = v.as_str().ok_or_else(fail)?;
                    if id.trim().is_empty() {
                        return Err(fail());
                    }
                    Ok(if f.kind == "relation" {
                        json!(id
                            .parse::<u64>()
                            .ok()
                            .filter(|id| *id > 0)
                            .ok_or_else(fail)?)
                    } else {
                        json!(id)
                    })
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(if f.multiple {
                json!(values)
            } else {
                values[0].clone()
            })
        }
        "number" => {
            let n = value
                .as_str()
                .and_then(|s| s.parse::<f64>().ok())
                .or_else(|| value.as_f64())
                .filter(|n| n.is_finite())
                .ok_or_else(fail)?;
            Ok(json!(n))
        }
        "bool" => value.as_bool().map(|v| json!(v)).ok_or_else(fail),
        "date" => {
            use chrono::TimeZone;
            let date =
                chrono::NaiveDate::parse_from_str(value.as_str().ok_or_else(fail)?, "%Y-%m-%d")
                    .map_err(|_| fail())?;
            let ms = chrono::FixedOffset::east_opt(8 * 3600)
                .unwrap()
                .from_local_datetime(&date.and_hms_opt(0, 0, 0).unwrap())
                .single()
                .ok_or_else(fail)?
                .timestamp_millis();
            Ok(json!(ms))
        }
        _ => Err(BackendError::validation(format!(
            "「{}」暂不能在此填写，请前往飞书项目创建",
            f.label
        ))),
    }
}
fn plan(form: &Form, request: &Request) -> Result<Vec<Value>, BackendError> {
    if request
        .fields
        .keys()
        .any(|key| !form.fields.iter().any(|f| &f.key == key))
    {
        return Err(BackendError::validation(
            "提交包含表单以外的字段，请重新核对",
        ));
    }
    let mut fields = Vec::new();
    let mut role_owners = Vec::new();
    for f in &form.fields {
        let v = request.fields.get(&f.key).unwrap_or(&Value::Null);
        if f.kind == "unsupported" && !f.required {
            continue;
        }
        if empty(v) {
            if f.required {
                return Err(BackendError::validation(format!("请填写「{}」", f.label)));
            }
            continue;
        }
        let encoded = encode(f, v)?;
        if let Some(role) = &f.role_id {
            let owners = if f.multiple {
                encoded
            } else {
                json!([encoded])
            };
            role_owners.push(json!({"role":role,"owners":owners}));
        } else {
            fields.push(json!({"field_key":f.key,"field_value":encoded}));
        }
    }
    if !role_owners.is_empty() {
        fields.push(json!({"field_key":"role_owners","field_value":role_owners}));
    }
    Ok(fields)
}
fn remote_value(data: &Value, key: &str) -> Value {
    let a = &data["work_item_attribute"];
    match key {
        "name" => a["work_item_name"].clone(),
        "template" => a["template"]["id"].clone(),
        _ => data["work_item_fields"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|f| f["key"] == key)
            .map(|f| f["value"].clone())
            .unwrap_or(Value::Null),
    }
}
fn id_values(v: &Value) -> Vec<String> {
    let list = if let Some(list) = v.as_array() {
        list.clone()
    } else {
        vec![v.clone()]
    };
    let mut values = list
        .iter()
        .map(|v| {
            if v.is_object() {
                ["id", "key", "user_key", "option_id", "value"]
                    .iter()
                    .find_map(|key| v.get(*key).and_then(detail::text))
                    .unwrap_or_default()
            } else {
                text(v)
            }
        })
        .collect::<Vec<_>>();
    values.sort();
    values.dedup();
    values
}
fn matches_fields(form: &Form, request: &Request, detail: &ItemDetail) -> Result<(), BackendError> {
    for f in &form.fields {
        let input = request.fields.get(&f.key).unwrap_or(&Value::Null);
        if empty(input) {
            continue;
        }
        if f.kind == "unsupported" && !f.required {
            continue;
        }
        let submitted = encode(f, input)?;
        let remote = if let Some(role) = &f.role_id {
            detail.data["work_item_attribute"]["role_members"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|r| r["key"] == *role || r["role_id"] == *role || r["role"] == *role)
                .map(|r| r["members"].clone())
                .unwrap_or(Value::Null)
        } else {
            remote_value(&detail.data, &f.key)
        };
        let equal = match f.kind.as_str() {
            "select" | "people" | "relation" => id_values(&submitted) == id_values(&remote),
            "text" => {
                submitted.as_str().map(str::trim) == remote.as_str().map(str::trim)
            }
            "textarea" => submitted.as_str() == remote.as_str(),
            "number" => submitted.as_f64() == remote.as_f64(),
            "date" => submitted == remote["timestamp"] || submitted == remote,
            _ => submitted == remote,
        };
        if !equal {
            return Err(BackendError::validation(format!(
                "「{}」尚未与提交值一致",
                f.label
            )));
        }
    }
    Ok(())
}
fn result(request: &Request, item_id: Option<WorkItemId>, verified: bool) -> ResultView {
    ResultView {
        outcome: if verified { "verified" } else { "unknown" }.into(),
        message: if verified {
            "工作事项已创建，并已从飞书回读确认。"
        } else {
            "创建结果不确定，草稿已保留。请先核对飞书，避免重复创建。"
        }
        .into(),
        request_id: request.request_id.clone(),
        can_verify: !verified,
        item_id,
    }
}
fn not_submitted(request: &Request) -> ResultView {
    ResultView {
        outcome: "not_submitted".into(),
        message: "此请求未发往飞书，草稿已恢复。请核对后重新创建。".into(),
        request_id: request.request_id.clone(),
        item_id: None,
        can_verify: false,
    }
}
pub fn execute(session: &Session, request: &Request) -> Result<ResultView, BackendError> {
    if request.request_id.trim().is_empty() || request.request_id.len() > 128 {
        return Err(BackendError::validation("创建请求标识无效"));
    }
    if let Some(record) = session.store.action_by_request(&request.request_id)? {
        let saved: Value = serde_json::from_str(record.detail.as_deref().unwrap_or("{}"))?;
        if record.action_kind != "create_workitem"
            || record.item_id != ledger_key(&request.target, &account(session)?)
            || saved["request"] != serde_json::to_value(request)?
        {
            return Err(BackendError::conflict(
                "请求标识已被使用，请重新读取创建记录",
            ));
        }
        if saved["cancelled_before_write"] == true {
            return Ok(not_submitted(request));
        }
        return Ok(result(
            request,
            serde_json::from_value(saved["item_id"].clone())?,
            record.verified,
        ));
    }
    let form = discover(session, &request.target)?;
    if form.version != request.version {
        return Err(BackendError::conflict(
            "创建配置或当前账号已变化，请重新读取并核对草稿",
        ));
    }
    let fields = plan(&form, request)?;
    let saved = json!({"request":request,"item_id":null,"form":form}).to_string();
    let record = ActionRecord {
        request_id: request.request_id.clone(),
        item_id: ledger_key(&request.target, &form.context),
        action_kind: "create_workitem".into(),
        target: serde_json::to_string(&request.target)?,
        version: request.version.clone(),
        status: "pending".into(),
        verified: false,
        detail: Some(saved),
        created_at: crate::sync::now_ms(),
        finished_at: None,
    };
    if !session.store.begin_action(&record)? {
        return Err(BackendError::conflict(
            "此位置有待核对的创建记录，请重新读取表单后核对结果",
        ));
    }
    let receipt=session.call_tool_any(TOOL_CREATE_WORKITEM,json!({"project_key":request.target.project_key,"work_item_type":request.target.type_key,"fields":fields}).as_object().unwrap(),true);
    let id = receipt
        .as_ref()
        .ok()
        .and_then(|v| detail::text(&v["work_item_id"]))
        .filter(|id| id.parse::<u64>().is_ok_and(|n| n > 0))
        .map(|work_item_id| WorkItemId {
            project_key: Some(request.target.project_key.clone()),
            work_item_type_key: Some(request.target.type_key.clone()),
            work_item_id,
        });
    // 编号先落盘：详情回读期间退出也能恢复，并且只重新读取、不重发创建。
    let _ = session.store.save_creation_detail(
        &request.request_id,
        &json!({"request":request,"item_id":id,"form":form}).to_string(),
    );
    let check = id.as_ref().map(|id| {
        session
            .refresh_item_detail_fresh(id)
            .and_then(|detail| matches_fields(&form, request, &detail))
    });
    let verified = matches!(&check, Some(Ok(())));
    let secret = session
        .credential()
        .ok()
        .map(|c| c.token().expose().to_owned());
    let diagnostic = receipt
        .err()
        .map(|e| e.safe_message(secret.as_deref()))
        .or_else(|| {
            check
                .and_then(Result::err)
                .map(|e| e.safe_message(secret.as_deref()))
        });
    let detail =
        json!({"request":request,"item_id":id,"form":form,"diagnostic":diagnostic}).to_string();
    let mut result = result(request, id, verified);
    if session
        .store
        .finish_action(
            &request.request_id,
            if verified { "verified" } else { "unknown" },
            verified,
            Some(&detail),
            crate::sync::now_ms(),
        )
        .is_err()
    {
        result
            .message
            .push_str("本地提交记录未能更新，请保留此窗口核对结果。");
    }
    Ok(result)
}
pub fn verify(
    session: &Session,
    request_id: &str,
    item_number: Option<&str>,
    local_request: Option<&Request>,
) -> Result<ResultView, BackendError> {
    if session.store.action_by_request(request_id)?.is_none() {
        let request = local_request
            .filter(|r| {
                r.request_id == request_id
                    && !request_id.trim().is_empty()
                    && request_id.len() <= 128
            })
            .ok_or_else(|| BackendError::validation("未找到创建记录，请保留草稿后重新读取"))?;
        let context = account(session)?;
        // 原子写入未发送标记：即使旧调用迟到，也不能越过该标记发送创建。
        let record = ActionRecord {
            request_id: request_id.into(),
            item_id: ledger_key(&request.target, &context),
            action_kind: "create_workitem".into(),
            target: serde_json::to_string(&request.target)?,
            version: request.version.clone(),
            status: "failed".into(),
            verified: false,
            detail: Some(
                json!({"request":request,"item_id":null,"cancelled_before_write":true}).to_string(),
            ),
            created_at: crate::sync::now_ms(),
            finished_at: Some(crate::sync::now_ms()),
        };
        session.store.cancel_unregistered_creation(&record)?;
    }
    let record = session
        .store
        .action_by_request(request_id)?
        .ok_or_else(|| BackendError::validation("创建记录读取失败，请稍后重试"))?;
    if record.action_kind != "create_workitem" {
        return Err(BackendError::validation("这不是创建记录"));
    }
    let saved: Value = serde_json::from_str(record.detail.as_deref().unwrap_or("{}"))?;
    let request: Request = serde_json::from_value(saved["request"].clone())
        .map_err(|_| BackendError::validation("创建记录尚未完整保存，请在飞书核对"))?;
    if ledger_key(&request.target, &account(session)?) != record.item_id {
        return Err(BackendError::validation("请使用提交时的账号核对创建结果"));
    }
    if saved["cancelled_before_write"] == true {
        return Ok(not_submitted(&request));
    }
    let id: Option<WorkItemId> = serde_json::from_value(saved["item_id"].clone())?;
    if record.verified {
        return Ok(result(&request, id, true));
    }
    let manual = id.is_none();
    let id = id
        .or_else(|| {
            item_number
                .filter(|n| n.parse::<u64>().is_ok_and(|n| n > 0))
                .map(|n| WorkItemId {
                    project_key: Some(request.target.project_key.clone()),
                    work_item_type_key: Some(request.target.type_key.clone()),
                    work_item_id: n.into(),
                })
        })
        .ok_or_else(|| BackendError::validation("请填写在飞书中找到的新事项编号，再回读核对"))?;
    let form: Form = serde_json::from_value(saved["form"].clone())?;
    let detail = session.refresh_item_detail_fresh(&id)?;
    matches_fields(&form, &request, &detail)?;
    if manual {
        let created = detail.data["work_item_attribute"]["create_time"]
            .as_i64()
            .or_else(|| detail.data["work_item_attribute"]["create_time"]["timestamp"].as_i64())
            .ok_or_else(|| {
                BackendError::validation(
                    "飞书未返回创建时间，暂无法确认该编号属于本次创建，请在飞书核对",
                )
            })?;
        if created < record.created_at.saturating_sub(60_000) {
            return Err(BackendError::validation(
                "该事项早于本次提交创建，请核对新事项编号",
            ));
        }
    }
    let mut saved = saved;
    saved["item_id"] = serde_json::to_value(&id)?;
    session
        .store
        .save_creation_detail(request_id, &saved.to_string())?;
    session.store.verify_created_action(request_id)?;
    Ok(result(&request, Some(id), true))
}

#[cfg(test)]
#[path = "creation_tests.rs"]
mod tests;
