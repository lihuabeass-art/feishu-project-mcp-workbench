//! 规则只编译为远端 MQL，不能用待办列表上的本地过滤冒充完整关联查询。
use crate::error::BackendError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum AssociationRule {
    AllParticipants,
    CurrentParticipants,
    Personnel {
        fields: Vec<String>,
        roles: Vec<String>,
        #[serde(default)]
        match_all: bool,
    },
    Custom {
        expression: String,
    },
}

pub fn identifier(s: &str) -> Result<String, BackendError> {
    if s.trim().is_empty() || s.contains(['`', '\n', '\r', '\0']) {
        return Err(BackendError::validation(
            "空间、类型和字段标识不能为空或含反引号、换行",
        ));
    }
    Ok(format!("`{s}`"))
}

impl AssociationRule {
    pub fn parse(raw: Option<&str>) -> Result<Self, BackendError> {
        match raw.map(str::trim).filter(|s| !s.is_empty()) {
            None => Ok(Self::AllParticipants),
            Some(s) if s.starts_with('{') => serde_json::from_str(s)
                .map_err(|e| BackendError::validation(format!("关联规则 JSON 无效: {e}"))),
            Some(s) => Ok(Self::Custom {
                expression: s.to_owned(),
            }),
        }
    }

    pub fn expression(&self) -> Result<String, BackendError> {
        Ok(match self {
            Self::AllParticipants => {
                "array_contains(all_participate_persons(), current_login_user())".into()
            }
            Self::CurrentParticipants => {
                "array_contains(participate_persons(), current_login_user())".into()
            }
            Self::Personnel {
                fields,
                roles,
                match_all,
            } => {
                let mut terms = Vec::new();
                for field in fields {
                    terms.push(format!(
                        "array_contains({}, current_login_user())",
                        identifier(field)?
                    ));
                }
                for role in roles {
                    terms.push(format!(
                        "array_contains({}, current_login_user())",
                        identifier(&format!("__{role}"))?
                    ));
                }
                if terms.is_empty() {
                    return Err(BackendError::validation("请至少选择一个人员字段或角色"));
                }
                format!(
                    "({})",
                    terms.join(if *match_all { " AND " } else { " OR " })
                )
            }
            Self::Custom { expression } => {
                validate_expression(expression)?;
                expression.trim().to_owned()
            }
        })
    }

    pub fn query(&self, project: &str, type_key: &str) -> Result<String, BackendError> {
        Ok(format!(
            "SELECT `work_item_id`, `name` FROM {}.{} WHERE {}",
            identifier(project)?,
            identifier(type_key)?,
            self.expression()?
        ))
    }
}

/// 只接受 WHERE 表达式；不能通过 LIMIT 等语句改变同步的完整性。
fn validate_expression(expression: &str) -> Result<(), BackendError> {
    let invalid =
        || BackendError::validation("自定义规则只允许 WHERE 条件，不允许查询子句、注释或分号");
    if expression.trim().is_empty() {
        return Err(invalid());
    }
    let mut quote = None;
    let mut depth = 0usize;
    let mut word = String::new();
    let mut chars = expression.chars().peekable();
    let forbidden = |s: &str| {
        matches!(
            s.to_ascii_lowercase().as_str(),
            "select"
                | "from"
                | "where"
                | "limit"
                | "offset"
                | "group"
                | "order"
                | "having"
                | "union"
                | "join"
                | "into"
        )
    };
    while let Some(c) = chars.next() {
        if let Some(q) = quote {
            if c == '\\' {
                if chars.next().is_none() {
                    return Err(invalid());
                }
            } else if c == q {
                if chars.peek() == Some(&q) {
                    chars.next();
                } else {
                    quote = None;
                }
            }
            continue;
        }
        if c.is_alphanumeric() || c == '_' {
            word.push(c);
            continue;
        }
        if forbidden(&word) {
            return Err(invalid());
        }
        word.clear();
        match c {
            '\'' | '"' | '`' => quote = Some(c),
            ';' | '#' | '\0' => return Err(invalid()),
            '-' if chars.peek() == Some(&'-') => return Err(invalid()),
            '/' if chars.peek() == Some(&'*') => return Err(invalid()),
            '(' => depth += 1,
            ')' => {
                depth = depth.checked_sub(1).ok_or_else(invalid)?;
            }
            _ => {}
        }
    }
    if quote.is_some() || depth != 0 || forbidden(&word) {
        return Err(invalid());
    }
    Ok(())
}
