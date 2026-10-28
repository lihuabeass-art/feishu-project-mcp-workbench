//! 工作来源配置模型（对应设计文档「核心模型 1：工作来源配置」）。
//!
//! 支持个人待办、空间中的工作项类型以及已保存的普通视图。
//! 类型来源的关联规则编译成远端 MQL；视图沿用飞书已保存的筛选条件。

use serde::{Deserialize, Serialize};

use crate::error::BackendError;

/// `list_todo` 的 `action` 取值。
///
/// 来源：`tools/list` 元数据（调查结论 3 节），必填，取值 `todo|done|overdue|this_week`。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TodoAction {
    Todo,
    Done,
    Overdue,
    ThisWeek,
}

impl TodoAction {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Todo => "todo",
            Self::Done => "done",
            Self::Overdue => "overdue",
            Self::ThisWeek => "this_week",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "todo" => Some(Self::Todo),
            "done" => Some(Self::Done),
            "overdue" => Some(Self::Overdue),
            "this_week" => Some(Self::ThisWeek),
            _ => None,
        }
    }

    pub const ALL: [Self; 4] = [Self::Todo, Self::Done, Self::Overdue, Self::ThisWeek];
}

/// `list_todo` 的 `todo_scope` 取值（可选）。
///
/// 元数据描述「未强调时默认传 `in_progress`」。执行路径只发配置里明确写了的参数，不偷偷补；
/// 内置默认配置（首次运行、未落盘）会显式带 in_progress，`fstodo config` 可见可改。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TodoScope {
    All,
    InProgress,
    NotStarted,
}

impl TodoScope {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::InProgress => "in_progress",
            Self::NotStarted => "not_started",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "all" => Some(Self::All),
            "in_progress" => Some(Self::InProgress),
            "not_started" => Some(Self::NotStarted),
            _ => None,
        }
    }
}

/// 个人待办查询参数（本轮唯一具备执行能力的来源参数）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PersonalTodoQuery {
    pub action: TodoAction,
    pub todo_scope: Option<TodoScope>,
    /// 元数据称「仅报错时按报错内容传」。**该路径未实测**（调查结论 3 节）。
    /// 本轮只做原样透传：由用户在配置里填，程序不猜、也不自动重试。
    pub asset_key: Option<String>,
}

impl PersonalTodoQuery {
    /// 转成 `tools/call` 的参数对象。未设置的可选参数**不出现**在请求里。
    pub fn to_arguments(&self, page_num: u32) -> serde_json::Map<String, serde_json::Value> {
        let mut args = serde_json::Map::new();
        args.insert("action".into(), self.action.as_str().into());
        if let Some(scope) = self.todo_scope {
            args.insert("todo_scope".into(), scope.as_str().into());
        }
        if let Some(key) = self.asset_key.as_ref().filter(|s| !s.trim().is_empty()) {
            args.insert("asset_key".into(), key.clone().into());
        }
        // 调查结论 6.4：描述称每页固定 50 条，需自行翻页。页码从 1 起。
        args.insert("page_num".into(), serde_json::Value::from(page_num));
        args
    }
}

/// 工作来源类型。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SourceKind {
    /// 当前登录用户的个人待办（`list_todo`）。
    PersonalTodo,
    /// 按空间 + 工作项类型与关联规则查询。
    WorkItemType { project_key: Option<String>, type_key: Option<String> },
    /// 按空间 + 已保存视图取数。
    View { project_key: Option<String>, view_id: Option<String> },
}

impl SourceKind {
    pub fn name(&self) -> &'static str {
        match self {
            Self::PersonalTodo => "personal_todo",
            Self::WorkItemType { .. } => "work_item_type",
            Self::View { .. } => "view",
        }
    }
}

/// 一个工作来源。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkSource {
    pub id: String,
    pub kind: SourceKind,
    pub enabled: bool,
    /// 仅 [`SourceKind::PersonalTodo`] 需要。
    pub todo: Option<PersonalTodoQuery>,
    /// 类型来源的 AssociationRule JSON，或 MQL WHERE 条件。
    pub association_rule: Option<String>,
}

impl WorkSource {
    /// 该来源能否在本轮被执行。不可执行时给出明确原因，绝不静默跳过。
    pub fn ensure_executable(&self) -> Result<(), BackendError> {
        if !matches!(self.kind, SourceKind::WorkItemType {..})
            && self.association_rule.as_ref().is_some_and(|s| !s.trim().is_empty()) {
            return Err(BackendError::validation("人员或自定义关联规则请配置在按类型查询的来源；个人待办由飞书判定，视图使用飞书已保存的条件"));
        }
        match &self.kind {
            SourceKind::PersonalTodo => {
                if self.todo.is_none() {
                    return Err(BackendError::config(format!(
                        "来源 {} 为 personal_todo 但缺少 action 等必要查询参数",
                        self.id
                    )));
                }
                Ok(())
            }
            SourceKind::WorkItemType {project_key,type_key} => {
                let p=project_key.as_deref().ok_or_else(||BackendError::validation("按类型查询需要 project_key"))?;
                let t=type_key.as_deref().ok_or_else(||BackendError::validation("按类型查询需要 work_item_type_key"))?;
                crate::association::AssociationRule::parse(self.association_rule.as_deref())?.query(p,t)?;
                Ok(())
            },
            SourceKind::View {project_key,view_id} => {
                if project_key.as_ref().is_none_or(|s|s.trim().is_empty()) || view_id.as_ref().is_none_or(|s|s.trim().is_empty()) {
                    return Err(BackendError::validation("视图查询需要 project_key 和 view_id"));
                }
                Ok(())
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source(kind: SourceKind, rule: Option<&str>) -> WorkSource {
        WorkSource {
            id: "s1".into(),
            kind,
            enabled: true,
            todo: None,
            association_rule: rule.map(str::to_owned),
        }
    }

    #[test]
    fn type_and_view_sources_require_complete_identity() {
        let wi = source(
            SourceKind::WorkItemType { project_key: Some("b".into()), type_key: Some("story".into()) },
            None,
        );
        wi.ensure_executable().unwrap();

        let v = source(SourceKind::View { project_key: Some("b".into()), view_id: None }, None);
        assert_eq!(v.ensure_executable().unwrap_err().kind(), crate::error::ErrorKind::Validation);
    }

    #[test]
    fn association_rule_is_never_silently_ignored() {
        let s = WorkSource {
            todo: Some(PersonalTodoQuery { action: TodoAction::Todo, todo_scope: None, asset_key: None }),
            ..source(SourceKind::PersonalTodo, Some("backend_dev contains me"))
        };
        let e = s.ensure_executable().unwrap_err();
        assert_eq!(e.kind(), crate::error::ErrorKind::Validation);
        assert!(e.to_string().contains("按类型查询"));
    }

    #[test]
    fn personal_todo_without_query_is_a_config_error() {
        let s = source(SourceKind::PersonalTodo, None);
        assert_eq!(s.ensure_executable().unwrap_err().kind(), crate::error::ErrorKind::Config);
    }

    #[test]
    fn arguments_omit_unset_optionals() {
        let q = PersonalTodoQuery { action: TodoAction::Todo, todo_scope: None, asset_key: None };
        let args = q.to_arguments(1);
        assert_eq!(args.len(), 2, "只应出现 action 与 page_num，实际 {args:?}");
        assert_eq!(args["action"], serde_json::json!("todo"));
        assert_eq!(args["page_num"], serde_json::json!(1));
        assert!(!args.contains_key("todo_scope"), "未配置的可选参数不得凭空补上");
        assert!(!args.contains_key("asset_key"));

        let q = PersonalTodoQuery {
            action: TodoAction::Overdue,
            todo_scope: Some(TodoScope::All),
            asset_key: Some("  ".to_string()),
        };
        let args = q.to_arguments(3);
        assert!(args.contains_key("todo_scope"));
        assert!(!args.contains_key("asset_key"), "只有空白的 asset_key 视为未配置");
    }
}
