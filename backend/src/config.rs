//! 本地配置。
//!
//! 配置文件默认在用户目录（`%APPDATA%\FSTODO\config.toml`），仓库里只放
//! `config.example.toml`。格式见该样例与 `docs/运行与验证.md`。
//!
//! 两条硬约束：
//!
//! - **不允许出现未知键**（`deny_unknown_fields`）：写错的键要立刻报错，
//!   不能像「静默忽略」那样把配置缺陷留到线上；
//! - **凭证不进配置文件**：这里只能声明凭证的*来源*（`token_env` / `token_file`），
//!   见 [`crate::credentials`]。

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::BackendError;
use crate::model::source::{PersonalTodoQuery, SourceKind, TodoAction, TodoScope, WorkSource};
use crate::paths;

mod settings;
mod sources;
pub use settings::ConnectionSettings;

/// 飞书项目官方 MCP 端点（调查结论 1 节，实测）。
pub const DEFAULT_ENDPOINT: &str = "https://project.feishu.cn/mcp_server/v1";

/// 默认凭证环境变量名。
pub const DEFAULT_TOKEN_ENV: &str = "FSTODO_MCP_TOKEN";

/// 0 表示自动翻页直到取完；正数仅供 CLI 显式限制页数。
pub const DEFAULT_MAX_PAGES: u32 = 0;

/// 默认永久保留同步台账。
pub const DEFAULT_SYNC_RUN_RETENTION: i64 = 0;

/// 分页协议使用 u32 页码；0 不设置业务上限，按远端 total / has_more 收尾。
pub(crate) fn page_numbers(max_pages: u32) -> impl Iterator<Item = u32> {
    (1..=u32::MAX).take_while(move |page| max_pages == 0 || *page <= max_pages)
}

/// 配置文件里的一个 `[[source]]` 段。
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(deny_unknown_fields, default)]
pub struct SourceTable {
    pub id: String,
    /// `personal_todo` | `work_item_type` | `view`。
    pub kind: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub project_key: Option<String>,
    pub work_item_type_key: Option<String>,
    pub view_id: Option<String>,
    pub action: Option<String>,
    pub todo_scope: Option<String>,
    pub asset_key: Option<String>,
    /// 类型来源的关联规则 JSON 或 MQL WHERE 条件。
    pub association_rule: Option<String>,
    /// 内置目录标识；缺省表示用户自定义来源。
    pub builtin_key: Option<String>,
    /// 显示名与稳定的来源 ID 分离，编辑名称不丢失缓存归属。
    pub display_name: Option<String>,
}

fn default_true() -> bool {
    true
}

/// 配置文件整体形状。
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct ConfigFile {
    pub endpoint: String,
    pub token_env: String,
    pub token_file: Option<String>,
    pub db_path: Option<String>,
    pub max_pages: u32,
    /// 同步台账轮转保留条数（见 [`Config::sync_run_retention`]）。
    pub sync_run_retention: i64,
    /// 见 [`Config::workflow_enabled`]：默认开启；可在配置中显式关闭。
    pub workflow_enabled: bool,
    #[serde(default)]
    pub source: Vec<SourceTable>,
}

impl Default for ConfigFile {
    fn default() -> Self {
        Self {
            endpoint: DEFAULT_ENDPOINT.to_string(),
            token_env: DEFAULT_TOKEN_ENV.to_string(),
            token_file: None,
            db_path: None,
            max_pages: DEFAULT_MAX_PAGES,
            sync_run_retention: DEFAULT_SYNC_RUN_RETENTION,
            workflow_enabled: true,
            source: vec![sources::builtin_source("todo", "personal-todo", None)
                .expect("known builtin")],
        }
    }
}

/// 运行期配置：配置文件的值 + 命令行覆盖 + 已解析的路径。
#[derive(Debug, Clone)]
pub struct Config {
    /// 实际读取的配置文件；未落盘时使用内置默认值，此处为 `None`。
    pub loaded_from: Option<PathBuf>,
    /// 默认配置文件位置（`config show` 用）。
    pub default_config_path: PathBuf,
    pub endpoint: String,
    pub token_env: String,
    pub token_file: Option<PathBuf>,
    pub db_path: PathBuf,
    pub max_pages: u32,
    /// `sync_run` 台账保留多少条**已结束**的运行记录；0 或负数 = 不清理。
    pub sync_run_retention: i64,
    /// 是否允许桌面界面发起流程写操作。**默认 true。**
    ///
    /// 后端已能发现并执行流程动作，但「点了按钮真改飞书数据」这条路径只有
    /// 桌面 IPC 没有 CLI 那道 `--yes` 闸门，因此保留配置开关，供使用者显式关闭。
    /// 关闭时 `load_snapshot` 的 `capabilities.workflow` 为 false，
    /// 且 `get_workflow_actions` / `execute_workflow_action` 直接拒绝（不靠前端自觉）。
    pub workflow_enabled: bool,
    pub sources: Vec<WorkSource>,
}

impl Config {
    /// 桌面端接管技术策略；保留既有数据库、凭证来源和用户选择的工作范围。
    pub fn for_desktop(mut self) -> Self {
        self.max_pages = 0;
        self.sync_run_retention = 0;
        self.workflow_enabled = true;
        self
    }

    /// 加载配置。
    ///
    /// - `Some(path)`：文件必须存在，否则报配置错误（避免「以为生效其实没生效」）。
    /// - `None`：默认路径存在则读取；不存在则用内置默认值（首次运行可用）。
    /// - `db_override`：命令行 `--db` 覆盖。
    pub fn load(explicit: Option<&Path>, db_override: Option<&Path>) -> Result<Self, BackendError> {
        let default_config_path = paths::default_config_path()?;
        let (path, file) = match explicit {
            Some(p) => {
                let text = std::fs::read_to_string(p).map_err(|e| {
                    BackendError::config(format!("读取配置文件 {} 失败: {e}", p.display()))
                })?;
                let file: ConfigFile = parse_toml(&text, p)?;
                (Some(p.to_path_buf()), file)
            }
            None if default_config_path.is_file() => {
                let text = std::fs::read_to_string(&default_config_path).map_err(|e| {
                    BackendError::config(format!(
                        "读取配置文件 {} 失败: {e}",
                        default_config_path.display()
                    ))
                })?;
                let file: ConfigFile = parse_toml(&text, &default_config_path)?;
                (Some(default_config_path.clone()), file)
            }
            None => (None, ConfigFile::default()),
        };

        Self::from_file(file, path, db_override, default_config_path)
    }

    fn from_file(
        file: ConfigFile,
        loaded_from: Option<PathBuf>,
        db_override: Option<&Path>,
        default_config_path: PathBuf,
    ) -> Result<Self, BackendError> {
        let endpoint = file.endpoint.trim().to_string();
        // 凭证只走 HTTPS 头，明文 HTTP 会把 token 裸奔出去，直接拒绝。
        if !endpoint.starts_with("https://") {
            return Err(BackendError::config(format!(
                "endpoint 必须是 https:// 地址（当前: {endpoint}）；凭证以 HTTP 头传递，不接受明文传输"
            )));
        }

        let token_env = non_empty(file.token_env, "token_env")?;
        let token_file = file
            .token_file
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(PathBuf::from);

        let db_path = match db_override {
            Some(p) => p.to_path_buf(),
            None => match file.db_path.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
                Some(s) => PathBuf::from(s),
                None => paths::default_db_path()?,
            },
        };

        let mut seen: Vec<String> = Vec::new();
        let mut sources = Vec::new();
        for table in file.source {
            if seen.contains(&table.id) {
                return Err(BackendError::config(format!("存在重复的来源 id: {}", table.id)));
            }
            seen.push(table.id.clone());
            sources.push(build_source(table)?);
        }

        Ok(Self {
            loaded_from,
            default_config_path,
            endpoint,
            token_env,
            token_file,
            db_path,
            max_pages: file.max_pages,
            sync_run_retention: file.sync_run_retention,
            workflow_enabled: file.workflow_enabled,
            sources,
        })
    }


    /// 选出本次要同步的个人待办来源。
    ///
    /// 指定 id 时按 id 精确取；未指定时要求「恰好一个已启用的可执行来源」，
    /// 有多个就要求显式指定——不猜用户想同步哪个范围。
    pub fn select_todo_source(&self, id: Option<&str>) -> Result<&WorkSource, BackendError> {
        if let Some(id) = id {
            let found = self
                .sources
                .iter()
                .find(|s| s.id == id)
                .ok_or_else(|| BackendError::config(format!("配置中没有 id 为 {id} 的来源")))?;
            found.ensure_executable()?;
            return Ok(found);
        }

        let mut candidates = Vec::new();
        for s in self.sources.iter().filter(|s| s.enabled) {
            if s.ensure_executable().is_ok() {
                candidates.push(s);
            }
        }
        match candidates.len() {
            0 => Err(BackendError::config(
                "没有可执行来源：请启用并配置一个个人待办、工作项类型或视图来源",
            )),
            1 => Ok(candidates.remove(0)),
            n => Err(BackendError::config(format!(
                "有 {n} 个已启用的来源，请用 --source 明确指定其中一个 id"
            ))),
        }
    }

    /// 给 `config show` 用的可安全打印视图（不含任何凭证）。
    pub fn redacted_summary(&self) -> String {
        let mut out = String::new();
        out.push_str(&format!("配置文件: {}\n", match &self.loaded_from {
            Some(p) => p.display().to_string(),
            None => format!("（未创建，使用内置默认值；默认位置 {}）", self.default_config_path.display()),
        }));
        out.push_str(&format!("endpoint: {}\n", self.endpoint));
        out.push_str(&format!("token_env: {}（配置项，不代表已设置）\n", self.token_env));
        out.push_str(&format!(
            "token_file: {}\n",
            match &self.token_file {
                Some(p) => p.display().to_string(),
                None => "<未配置>".to_string(),
            }
        ));
        out.push_str(&format!("db_path: {}\n", self.db_path.display()));
        out.push_str(&format!("max_pages: {}\n", self.max_pages));
        out.push_str("请求调度: 自动调整并发、退避与超时\n");
        out.push_str(&format!("sync_run_retention: {}\n", self.sync_run_retention));
        out.push_str(&format!("workflow_enabled: {}（false 可关闭流程操作）\n", self.workflow_enabled));
        out.push_str(&format!("每页条数（按元数据假定）: {}\n", crate::sync::PAGE_SIZE_ASSUMED));
        out.push_str(&format!("来源数: {}\n", self.sources.len()));
        for s in &self.sources {
            let exec = match s.ensure_executable() {
                Ok(()) => "可执行".to_string(),
                Err(e) => format!("不可执行（{}）", e.kind().as_str()),
            };
            out.push_str(&format!(
                "  - id={} kind={} enabled={} {}{}\n",
                s.id,
                s.kind.name(),
                s.enabled,
                exec,
                match &s.todo {
                    Some(q) => format!(" action={} scope={}", q.action.as_str(),
                        q.todo_scope.map(|x| x.as_str()).unwrap_or("<未设置>")),
                    None => String::new(),
                }
            ));
        }
        out
    }
}

fn non_empty(value: String, field: &str) -> Result<String, BackendError> {
    let v = value.trim().to_string();
    if v.is_empty() {
        return Err(BackendError::config(format!("{field} 不能为空")));
    }
    Ok(v)
}

fn parse_toml(text: &str, path: &Path) -> Result<ConfigFile, BackendError> {
    toml::from_str(text).map_err(|e| {
        BackendError::config(format!("配置文件 {} 解析失败: {e}", path.display()))
    })
}

fn build_source(t: SourceTable) -> Result<WorkSource, BackendError> {
    sources::validate_builtin(&t)?;
    let id = non_empty(t.id, "source.id")?;
    if id=="*" {return Err(BackendError::config("来源名称 * 保留给所有已启用来源"));}
    if t.kind=="work_item_type" && t.view_id.is_some() {
        return Err(BackendError::config("按类型查询不能配置 view_id"));
    }
    if t.kind=="view" && t.work_item_type_key.is_some() {
        return Err(BackendError::config("视图来源不能配置 work_item_type_key"));
    }
    let kind = match t.kind.trim() {
        "" => return Err(BackendError::config(format!("来源 {id} 缺少 kind"))),
        "personal_todo" => {
            if t.project_key.is_some() || t.view_id.is_some() || t.work_item_type_key.is_some() {
                return Err(BackendError::config(format!(
                    "来源 {id} 是 personal_todo，不需要 project_key / work_item_type_key / view_id；\
                     个人待办由服务端按当前用户过滤，写这些字段不会生效"
                )));
            }
            SourceKind::PersonalTodo
        }
        "work_item_type" => SourceKind::WorkItemType {
            project_key: opt_str(&t.project_key),
            type_key: opt_str(&t.work_item_type_key),
        },
        "view" => SourceKind::View {
            project_key: opt_str(&t.project_key),
            view_id: opt_str(&t.view_id),
        },
        other => {
            return Err(BackendError::config(format!(
                "来源 {id} 的 kind={other} 无法识别；支持 personal_todo / work_item_type / view"
            )))
        }
    };

    let todo = match &kind {
        SourceKind::PersonalTodo => {
            let action_raw = t
                .action
                .as_ref()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    BackendError::config(format!(
                        "来源 {id} 缺少 action（必填，取值 todo/done/overdue/this_week）"
                    ))
                })?;
            let action = TodoAction::parse(&action_raw).ok_or_else(|| {
                BackendError::config(format!(
                    "来源 {id} 的 action={action_raw} 非法；取值来自 tools/list 元数据: \
                     todo | done | overdue | this_week"
                ))
            })?;
            let todo_scope = match t.todo_scope.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
                Some(raw) => Some(TodoScope::parse(raw).ok_or_else(|| {
                    BackendError::config(format!(
                        "来源 {id} 的 todo_scope={raw} 非法；可选 all | in_progress | not_started"
                    ))
                })?),
                None => None,
            };
            Some(PersonalTodoQuery { action, todo_scope, asset_key: opt_str(&t.asset_key) })
        }
        _ => {
            if t.action.is_some() || t.todo_scope.is_some() || t.asset_key.is_some() {
                return Err(BackendError::config(format!(
                    "来源 {id} 不是 personal_todo，却配置了 action/todo_scope/asset_key；这些参数只属于 list_todo"
                )));
            }
            None
        }
    };

    Ok(WorkSource { id, kind, enabled: t.enabled, todo, association_rule: opt_str(&t.association_rule) })
}

fn opt_str(v: &Option<String>) -> Option<String> {
    v.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    const MINIMAL: &str = r#"
endpoint = "https://project.feishu.cn/mcp_server/v1"
token_env = "FSTODO_MCP_TOKEN"
db_path = "X:/tmp/fstodo-test.db"

[[source]]
id = "personal-todo"
kind = "personal_todo"
enabled = true
action = "todo"
todo_scope = "in_progress"
"#;

    fn load(text: &str) -> Result<Config, BackendError> {
        let file: ConfigFile = parse_toml(text, Path::new("<test>")).unwrap();
        Config::from_file(file, None, None, PathBuf::from("<default>"))
    }

    #[test]
    fn minimal_config_round_trips() {
        let c = load(MINIMAL).expect("应能解析最小配置");
        assert_eq!(c.endpoint, DEFAULT_ENDPOINT);
        assert_eq!(c.max_pages, DEFAULT_MAX_PAGES);
        assert_eq!(c.sources.len(), 1);
        let s = c.select_todo_source(None).unwrap();
        assert_eq!(s.todo.as_ref().unwrap().action, TodoAction::Todo);
        assert_eq!(s.todo.as_ref().unwrap().todo_scope, Some(TodoScope::InProgress));
        assert!(c.db_path.to_string_lossy().contains("fstodo-test.db"));
    }

    #[test]
    fn desktop_uses_full_sync_and_keeps_existing_storage_and_credentials() {
        let text = format!("max_pages = 20\nsync_run_retention = 200\nworkflow_enabled = false\n{MINIMAL}");
        let original = load(&text).unwrap();
        let desktop = original.clone().for_desktop();
        assert_eq!(desktop.max_pages, 0);
        assert_eq!(desktop.sync_run_retention, 0);
        assert!(desktop.workflow_enabled);
        assert_eq!(desktop.db_path, original.db_path);
        assert_eq!(desktop.token_env, original.token_env);
        assert_eq!(desktop.token_file, original.token_file);
        assert_eq!(ConfigFile::default().sync_run_retention, 0);
    }

    /// 默认配置与缺省配置项都应启用流程操作；用户可以显式关闭。
    #[test]
    fn workflow_writes_are_enabled_by_default_and_can_be_disabled() {
        let unset = Config::from_file(ConfigFile::default(), None, None, PathBuf::from("<default>"))
            .expect("空配置应当可用");
        assert!(unset.workflow_enabled, "默认值必须是开");
        assert!(
            load(MINIMAL).unwrap().workflow_enabled,
            "TOML 里没有这一项时应采用开启默认值"
        );
        let disabled = format!("workflow_enabled = false\n{MINIMAL}");
        assert!(!load(&disabled).unwrap().workflow_enabled);
        // 顶层键必须写在任何 [表] 之前，否则会被解析进上一个表里。
        let text = format!("workflow_enabled = true\n{MINIMAL}");
        assert!(
            load(&text).unwrap().workflow_enabled,
            "TOML 里打开了要真的传到 Config，否则开关是假的"
        );
    }

    #[test]
    fn default_config_has_only_executable_personal_todo() {
        let file = ConfigFile::default();
        let c = Config::from_file(file, None, None, PathBuf::from("<default>")).unwrap();
        assert_eq!(c.endpoint, DEFAULT_ENDPOINT);
        assert_eq!(c.token_env, DEFAULT_TOKEN_ENV);
        assert!(c.select_todo_source(None).is_ok());
        assert_eq!(c.sources.len(), 1);
        assert_eq!(c.sources[0].id, "personal-todo");
        assert!(c.sources[0].ensure_executable().is_ok());
        assert!(c.loaded_from.is_none());
    }

    #[test]
    fn unknown_keys_are_rejected() {
        let bad = format!("{MINIMAL}\nmax_page = 5\n");
        let err = toml::from_str::<ConfigFile>(&bad).unwrap_err();
        assert!(err.to_string().contains("max_page"), "要指出是哪个键: {err}");
    }

    #[test]
    fn plain_http_endpoint_is_rejected() {
        let bad = MINIMAL.replace("https://project.feishu.cn", "http://project.feishu.cn");
        let e = load(&bad).unwrap_err();
        assert_eq!(e.kind(), crate::error::ErrorKind::Config);
        assert!(e.to_string().contains("https"));
    }

    #[test]
    fn invalid_enum_values_are_rejected_with_allowed_set() {
        let bad = MINIMAL.replace(r#"action = "todo""#, r#"action = "myToDo""#);
        let e = load(&bad).unwrap_err();
        let msg = e.to_string();
        assert!(msg.contains("this_week"), "应列出合法取值: {msg}");

        let bad = MINIMAL.replace(r#"todo_scope = "in_progress""#, r#"todo_scope = "all_tasks""#);
        assert!(load(&bad).unwrap_err().to_string().contains("not_started"));
    }

    #[test]
    fn personal_todo_rejects_fields_that_would_be_ignored() {
        let bad = format!("{MINIMAL}\n");
        let mut file: ConfigFile = parse_toml(&bad, Path::new("<t>")).unwrap();
        file.source[0].project_key = Some("b".into());
        let e = Config::from_file(file, None, None, PathBuf::from("<d>")).unwrap_err();
        assert!(e.to_string().contains("不会生效"), "要说明为什么拒绝: {e}");
    }

    #[test]
    fn configured_view_is_default_selectable() {
        let text = r#"
endpoint = "https://project.feishu.cn/mcp_server/v1"

[[source]]
id = "story-view"
kind = "view"
enabled = true
project_key = "b"
view_id = "v1"
"#;
        let c = load(text).expect("视图来源应能被保存");
        assert_eq!(c.sources[0].kind.name(), "view");
        assert_eq!(c.select_todo_source(None).unwrap().id,"story-view");
        assert_eq!(c.select_todo_source(Some("story-view")).unwrap().kind.name(),"view");
    }

    #[test]
    fn ambiguous_default_source_requires_explicit_choice() {
        let one = ConfigFile::default();
        let mut two = ConfigFile::default();
        two.source.push(SourceTable {
            id: "done".into(),
            kind: "personal_todo".into(),
            enabled: true,
            action: Some("done".into()),
            ..Default::default()
        });
        let c = Config::from_file(two, None, None, PathBuf::from("<d>")).unwrap();
        let e = c.select_todo_source(None).unwrap_err();
        assert_eq!(e.kind(), crate::error::ErrorKind::Config);
        assert!(e.to_string().contains("--source"));
        assert_eq!(c.select_todo_source(Some("done")).unwrap().todo.as_ref().unwrap().action, TodoAction::Done);
        let _ = one;
    }

    #[test]
    fn duplicate_source_id_is_rejected() {
        let mut file = ConfigFile::default();
        file.source.push(SourceTable { id: "personal-todo".into(), ..Default::default() });
        let e = Config::from_file(file, None, None, PathBuf::from("<d>")).unwrap_err();
        assert!(e.to_string().contains("重复"));
    }

    #[test]
    fn redacted_summary_has_no_secret_material() {
        let c = load(MINIMAL).unwrap();
        let s = c.redacted_summary();
        assert!(s.contains("FSTODO_MCP_TOKEN"));
        assert!(!s.contains("token ="), "摘要不应输出 token 值: {s}");
    }
}
