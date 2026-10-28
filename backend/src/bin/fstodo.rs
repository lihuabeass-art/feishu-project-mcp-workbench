//! `fstodo` 命令行入口。
//!
//! 用途是把本地数据层的三个接口（连接自检 / 同步个人待办 / 查询缓存）
//! 直接暴露成可复现的验证命令——**不引入 HTTP 服务、不引入界面**（任务书二.6）。
//!
//! 退出码约定（脚本据此区分「该看凭证」和「该看网络」）：
//!
//! | 码 | 含义 |
//! |---|---|
//! | 0 | 成功 |
//! | 1 | 未细分类的失败（本轮不出现，保留给未来） |
//! | 3 / 4 | 连接失败 / 鉴权失败（`ErrorKind::exit_code`） |
//! | 5 / 8 | 工具调用失败 / 数据解析失败 |
//! | 6 / 7 | 配置错误 / 凭证错误 |
//! | 9 / 10 | 本地缓存错误 / 能力未实现 |
//! | 11 | 同步未完成（触到 `max_pages`，数据不完整） |
//! | 12–15 | 冲突 / 参数不合法 / 无权限 / 写入结果不确定（`ErrorKind::exit_code`） |
//! | 16 / 17 | 动作明确失败 / 动作结果不确定（`17` 必须先去飞书核对，不要直接重试） |

use std::collections::BTreeMap;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use fstodo_backend::api::Session;
use fstodo_backend::config::Config;
use fstodo_backend::error::BackendError;
use fstodo_backend::model::domain::{FlowKind, WorkItemId};
use fstodo_backend::store::{ItemFilter, RunTrigger, StopReason};
use fstodo_backend::workflow::{self, ActionOutcome, WorkflowRequest};
use fstodo_backend::{CachedItem, SyncReport, SyncRun};

/// 同步未完成（数据不完整）专用退出码。
const EXIT_INCOMPLETE: u8 = 11;
/// 动作结论为 `failed` 时的退出码。**当前执行路径不会产出该结论**（见
/// [`fstodo_backend::workflow::ActionOutcome`]：写请求一旦发出就只有 verified/unknown），
/// 留着是为了将来若引入「发送前即可断定未生效」的分类时不必重新分配码位。
const EXIT_ACTION_FAILED: u8 = 16;
/// 动作结果不确定：写请求可能已生效。**先去飞书核对，别直接重试。**
const EXIT_ACTION_UNKNOWN: u8 = 17;

#[derive(Parser)]
#[command(name = "fstodo", version, about = "飞书个人工作台本地数据层（待办同步 + 缓存 + 流程动作发现与执行）")]
struct Cli {
    /// 配置文件路径；缺省用 %APPDATA%\FSTODO\config.toml，不存在则用内置默认值
    #[arg(long, global = true)]
    config: Option<std::path::PathBuf>,

    /// 覆盖配置里的缓存库路径
    #[arg(long, global = true)]
    db: Option<std::path::PathBuf>,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// 打印当前生效配置（不含任何凭证）
    Config,
    /// 本地自检：配置、路径、缓存库、凭证来源（不联网）
    Doctor,
    /// 连接自检：建立 MCP 会话并回读服务端信息（联网）
    Check,
    /// 录入测试事项上已采集的五类版本变更证据（仅写本地验证记录）
    VerifyVersions {
        #[arg(long)]
        source: String,
        #[arg(long)]
        field: String,
        #[arg(long)]
        evidence: std::path::PathBuf,
    },
    /// 同步工作来源及完整逻辑字段到本地缓存
    Sync {
        /// 指定来源 id；配置里有多个可执行来源时必须指定
        #[arg(long)]
        source: Option<String>,
        /// 记为自动触发：只影响台账里的 trigger 字段，行为完全不变
        #[arg(long)]
        auto: bool,
        /// 依次同步所有已启用来源
        #[arg(long, conflicts_with = "source")]
        all: bool,
    },
    /// 读取单条工作项的完整逻辑字段（默认联网补全，--cached 只读缓存）
    Detail {
        work_item_id: String,
        #[arg(long)]
        project: Option<String>,
        #[arg(long)]
        r#type: Option<String>,
        #[arg(long)]
        cached: bool,
    },
    /// 查询本地缓存
    List {
        /// 按 project_key 精确过滤
        #[arg(long)]
        project: Option<String>,
        /// 按 work_item_type_key 精确过滤
        #[arg(long)]
        r#type: Option<String>,
        /// 按流程模型过滤：node | state | both | none
        #[arg(long)]
        flow: Option<String>,
        /// 工作项名称模糊匹配
        #[arg(long)]
        text: Option<String>,
        #[arg(long, default_value_t = 50)]
        limit: i64,
        #[arg(long, default_value_t = 0)]
        offset: i64,
    },
    /// 最近一次**成功**同步的信息
    LastSync,
    /// 最近若干次同步运行（含失败），排查用
    Runs {
        #[arg(long, default_value_t = 10)]
        limit: i64,
    },
    /// 工作项类型的发现与同步范围设定
    Types {
        #[command(subcommand)]
        action: TypesAction,
    },
    /// 流程动作：发现（只读）与执行（真写）
    Workflow {
        #[command(subcommand)]
        action: WorkflowCmd,
    },
    /// 某个事项最近的动作执行流水（排障用）
    Actions {
        /// 工作项 id
        work_item_id: String,
        /// 空间 key（复合主键之一；跨空间撞 id 时务必给出）
        #[arg(long)]
        project: Option<String>,
        /// 工作项类型 key（复合主键之一）
        #[arg(long)]
        r#type: Option<String>,
        #[arg(long, default_value_t = 10)]
        limit: i64,
    },
}

#[derive(Subcommand)]
enum TypesAction {
    /// 从飞书发现类型并写入本地快照（只读，不改动飞书任何数据）
    Refresh {
        /// 快照挂在哪个来源 id 上；缺省用默认来源
        #[arg(long)]
        source: Option<String>,
    },
    /// 打印类型快照与当前范围（不联网）
    List {
        #[arg(long)]
        source: Option<String>,
    },
    /// 设定该来源的同步类型范围（下次 sync 起生效）
    Use {
        /// 作用哪个来源 id；缺省用默认来源（与 types refresh / list 一致）
        #[arg(long)]
        source: Option<String>,
        /// 要同步的类型 key，可重复
        #[arg(long = "type-key")]
        type_keys: Vec<String>,
        /// 清除已确认的范围，回到「未确认 = 全量同步」
        #[arg(long)]
        clear: bool,
    },
}

#[derive(Subcommand)]
enum WorkflowCmd {
    /// 列出该事项当前真正可用的动作（含不可用的原因）
    Actions {
        /// 工作项 id
        work_item_id: String,
        #[arg(long)]
        project: Option<String>,
        #[arg(long)]
        r#type: Option<String>,
    },
    /// 执行一个动作：**会真的改动飞书数据**，必须加 --yes
    Run {
        /// 工作项 id
        work_item_id: String,
        #[arg(long)]
        project: Option<String>,
        #[arg(long)]
        r#type: Option<String>,
        /// 动作 id，来自 `fstodo workflow actions`
        #[arg(long)]
        action: String,
        /// 动作清单版本，须与 `workflow actions` 输出一致，否则拒绝执行
        #[arg(long)]
        version: String,
        /// 幂等键；缺省自动生成。同一 request_id 重复提交只生效一次
        #[arg(long)]
        request_id: Option<String>,
        /// 动作要求的字段值，写成 key=value，可重复
        #[arg(long = "field")]
        fields: Vec<String>,
        /// 确认这是一次真写
        #[arg(long)]
        yes: bool,
    },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let (config_arg, db_arg) = (cli.config.clone(), cli.db.clone());
    match run(cli) {
        Ok(code) => ExitCode::from(code),
        Err(e) => {
            // 构造侧（feishu/credentials）已保证凭证不进错误文本；
            // 打印前尽力再用实际凭证擦一遍，作为第二道防线。
            let secret = Config::load(config_arg.as_deref(), db_arg.as_deref())
                .ok()
                .and_then(|c| Session::open(c).ok())
                .and_then(|session| session.credential().ok())
                .map(|cred| cred.token().expose().to_string());
            eprintln!("{}", e.safe_message(secret.as_deref()));
            ExitCode::from(e.kind().exit_code().clamp(0, 255) as u8)
        }
    }
}

/// 会失败的逻辑都收在这里，用 `?` 冒泡到 `main`，由退出码区分故障大类。
fn run(cli: Cli) -> Result<u8, BackendError> {
    let config = Config::load(cli.config.as_deref(), cli.db.as_deref())?;

    match cli.command {
        Command::Config => {
            print!("{}", config.redacted_summary());
            Ok(0)
        }
        Command::Doctor => run_doctor(&config),
        Command::Check => {
            let session = Session::open(config)?;
            let info = session.check_connection()?;
            println!("连接成功: {info}");
            Ok(0)
        }
        Command::VerifyVersions { source, field, evidence } => {
            let raw = std::fs::read_to_string(&evidence)
                .map_err(|e|BackendError::validation(format!("无法读取版本证据文件: {e}")))?;
            let samples = serde_json::from_str(raw.trim_start_matches('\u{feff}'))
                .map_err(|e|BackendError::parse("版本证据",format!("{e}")))?;
            Session::open(config)?.verify_source_versions(&source,&field,&samples)?;
            println!("来源 {source} 的版本证据已绑定当前配置；后续同步按已验证字段比较，字段缺失时回退详情。");
            Ok(0)
        }
        Command::Sync { source, auto, all } => {
            let session = Session::open(config)?;
            // 自动与手动跑的是同一段代码，差别只落进台账的 trigger 字段。
            let trigger = if auto { RunTrigger::Automatic } else { RunTrigger::Manual };
            let report = if all {session.sync_enabled_sources(trigger)?}else{session.sync_personal_todos(source.as_deref(), trigger)?};
            print_report(&report);
            Ok(if report.is_success() { 0 } else { EXIT_INCOMPLETE })
        }
        Command::Detail {work_item_id,project,r#type,cached} => {
            let session=Session::open(config)?;
            let identity=resolve_identity(&session,project,r#type,work_item_id)?;
            let detail=if cached{session.cached_item_detail(&identity)?}else{Some(session.refresh_item_detail(&identity)?)};
            println!("{}",serde_json::to_string_pretty(&detail).map_err(|e|BackendError::parse("详情输出",e.to_string()))?);
            Ok(0)
        }
        Command::List { project, r#type, flow, text, limit, offset } => {
            let filter = ItemFilter {
                project_key: non_empty(project),
                type_key: non_empty(r#type),
                flow: match flow.as_deref() {
                    Some(v) => Some(FlowKind::parse(v).ok_or_else(|| {
                        BackendError::config(format!(
                            "flow={v} 非法；取值 node | state | both | none（含义见 docs/数据模型与接口契约.md）"
                        ))
                    })?),
                    None => None,
                },
                text: non_empty(text),
                limit: Some(limit),
                offset: Some(offset),
            };
            let session = Session::open(config)?;
            let items = session.query_cached_items(&filter)?;
            print_items(&items, limit, offset);
            Ok(0)
        }
        Command::LastSync => {
            let session = Session::open(config)?;
            match session.last_successful_sync()? {
                Some(run) => print_run(&run, "最近一次成功同步"),
                None => println!(
                    "尚无成功同步记录。先跑 `fstodo check` 确认连接与凭证，再跑 `fstodo sync`。\n\
                     注意：失败的同步不会被算作成功记录，即使它已经写入了部分缓存。"
                ),
            }
            Ok(0)
        }
        Command::Runs { limit } => {
            let session = Session::open(config)?;
            let runs = session.recent_runs(limit)?;
            if runs.is_empty() {
                println!("尚无同步记录。");
            }
            for run in runs {
                print_run(&run, "运行记录");
            }
            Ok(0)
        }
        Command::Types { action } => run_types(&config, action),
        Command::Workflow { action } => run_workflow(&config, action),
        Command::Actions { work_item_id, project, r#type, limit } => {
            let session = Session::open(config)?;
            let identity = resolve_identity(&session, project, r#type, work_item_id)?;
            let rows = session.recent_actions(&identity, limit)?;
            if rows.is_empty() {
                println!("该事项还没有动作执行记录。");
            }
            for row in rows {
                println!(
                    "[{}] {}→{} | {} | 核验={} | 请求 {} | {}",
                    row.created_at,
                    row.action_kind,
                    row.target,
                    row.status,
                    row.verified,
                    row.request_id,
                    row.detail.as_deref().unwrap_or("-")
                );
            }
            Ok(0)
        }
    }
}


fn non_empty(v: Option<String>) -> Option<String> {
    v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// 类型快照和动作台账都要挂在「同一个来源 id」上，所以复用 sync 的来源选择规则。
fn source_for(config: &Config, explicit: Option<&str>) -> Result<String, BackendError> {
    Ok(config.select_todo_source(explicit)?.id.clone())
}

/// CLI 用的幂等键：进程号 + 纳秒时间戳，够区分「同一条命令被手跑两次」。
fn new_request_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("cli-{}-{:x}", std::process::id(), nanos)
}

/// 类型的发现 / 查看 / 范围设定。这几条命令本身都不写飞书。
fn run_types(config: &Config, action: TypesAction) -> Result<u8, BackendError> {
    let session = Session::open(config.clone())?;
    match action {
        TypesAction::Refresh { source } => {
            let source_id = source_for(config, source.as_deref())?;
            let discovery = session.refresh_source_types(&source_id)?;
            println!(
                "来源 {source_id}：发现 {} 个类型（枚举范围 = 本地缓存里出现过的空间）",
                discovery.types.len()
            );
            let mut last_project = "";
            for found in &discovery.types {
                if found.project_key != last_project {
                    println!("  空间 {}（{}）", found.project_name, found.project_key);
                    last_project = &found.project_key;
                }
                println!(
                    "    {} | type_key={} | 可执行={}",
                    found.type_name, found.type_key, found.executable
                );
            }
            if discovery.types.is_empty() {
                // 原因不能写死成「每个空间都没返回 type_key」：有空间读失败时真正的原因在下面那份
                // 清单里，这里再断言一次就成了自相矛盾的两句。
                println!(
                    "  （本次没有发现任何带 type_key 的类型：{}；已有快照原样保留）",
                    if discovery.failed.is_empty() {
                        "可读空间都返回了空清单"
                    } else {
                        "原因见下面的「没读到」清单"
                    }
                );
            }
            // 清单少了一个空间是必须让用户看见的：拿半份清单去选同步范围，
            // 选中的就是错的。
            if !discovery.failed.is_empty() {
                println!("  以下 {} 个空间没读到，上面的清单不完整：", discovery.failed.len());
                for (project_key, reason) in &discovery.failed {
                    println!("    {project_key} —— {reason}");
                }
            }
        }
        TypesAction::List { source } => {
            let source_id = source_for(config, source.as_deref())?;
            let snapshot = session.source_types(&source_id)?;
            let scope = session.source_type_scope(&source_id)?;
            match &scope {
                None => println!("来源 {source_id}：还没确认过类型范围 —— 同步按全量执行（与升级前一致）"),
                Some(s) if s.is_empty() => {
                    println!("来源 {source_id}：已确认范围为**空** —— 同步将不拉取任何类型")
                }
                Some(s) => {
                    println!("来源 {source_id}：已确认范围，共 {} 个（空间, 类型）组合", s.len())
                }
            }
            if snapshot.is_empty() {
                println!("（本地还没有类型快照：先跑 `fstodo types refresh`）");
                return Ok(0);
            }
            for cached in &snapshot {
                let picked = scope
                    .as_ref()
                    .is_some_and(|s| s.allows(&cached.project_key, &cached.type_key));
                println!(
                    "  [{}] {} / {} | type_key={} | 发现于 {}ms",
                    if picked { "选" } else { " " },
                    cached.project_name,
                    cached.type_name,
                    cached.type_key,
                    cached.discovered_at_ms
                );
            }
        }
        TypesAction::Use { source, type_keys, clear } => {
            // 来源 id 必须真的存在：拼错了还能「已记录」、下次同步却按真实来源照常全量，
            // 这种静默不生效最难查。refresh / list 都过这道校验，use 没理由不过。
            let source = source_for(config, source.as_deref())?;
            if clear && !type_keys.is_empty() {
                // 两者语义相反：--clear 回到全量，--type-key 收窄范围。同时给出时不猜意图，
                // 更不能让「先清除」把用户点名的类型悄悄丢掉。
                return Err(BackendError::config(
                    "--clear 与 --type-key 不能同时给：前者回到全量，后者只拉点名的类型。请只留一个",
                ));
            }
            if clear {
                let had = session.clear_source_type_scope(&source)?;
                println!(
                    "{}来源 {source} 的类型范围已清除：下次 sync 起按全量执行（与升级前一致）。",
                    if had { "" } else { "（本来也没配置过，行为不变）" }
                );
                return Ok(0);
            }
            if type_keys.is_empty() {
                return Err(BackendError::config(
                    "types use 需要至少一个 --type-key；要回到全量同步请用 --clear",
                ));
            }
            // 绝不悄悄丢掉用户敲出来的 --type-key：夹一个空白就当成没敲，全都空白时更会滑进
            // 「确认过：什么都不拉」那个语义相反的方向。
            if let Some(blank) = type_keys.iter().find(|k| k.trim().is_empty()) {
                return Err(BackendError::config(format!(
                    "--type-key 不能是空白（收到 {blank:?}）；要回到全量同步请用 --clear"
                )));
            }
            let keys: Vec<String> = type_keys.iter().map(|k| k.trim().to_string()).collect();
            let pairs = session.set_source_type_scope(&source, &keys)?;
            println!(
                "已记录来源 {source} 的类型范围：{keys:?} → {pairs} 个（空间, 类型）组合；下次 sync 起生效。"
            );
        }
    }
    Ok(0)
}


/// 用户只敲事项编号时，用本地缓存补齐 project_key / work_item_type_key。
///
/// 显式给的 `--project` / `--type` 永远优先；缓存里没有就原样留着，
/// 让下游的错误继续如实说明缺哪一段，这里不编造身份。
///
/// 缓存读失败**照实上抛**：把「库打不开」当成「缓存里没有身份」，下游就会报一句
/// 「缺少 project_key」，真故障永远看不见。同一编号属于多个空间时
/// `cached_identity` 报冲突，这里同样原样传出去，不替用户猜一个身份去写。
fn resolve_identity(
    session: &Session,
    project: Option<String>,
    r#type: Option<String>,
    work_item_id: String,
) -> Result<WorkItemId, BackendError> {
    let project_key = non_empty(project);
    let work_item_type_key = non_empty(r#type);
    if project_key.is_some() && work_item_type_key.is_some() {
        return Ok(WorkItemId { project_key, work_item_type_key, work_item_id });
    }
    let (cached_project, cached_type) = session
        .store
        .cached_identity(&work_item_id)?
        .unwrap_or_default();
    Ok(WorkItemId {
        project_key: project_key.or(Some(cached_project).filter(|v| !v.is_empty())),
        work_item_type_key: work_item_type_key.or(Some(cached_type).filter(|v| !v.is_empty())),
        work_item_id,
    })
}

/// 动作的发现与执行。`Run` 是**真写**：不加 `--yes` 只打印将要提交的请求。
fn run_workflow(config: &Config, action: WorkflowCmd) -> Result<u8, BackendError> {
    let session = Session::open(config.clone())?;
    match action {
        WorkflowCmd::Actions { work_item_id, project, r#type } => {
            let id = resolve_identity(&session, project, r#type, work_item_id)?;
            let options = workflow::actions(&session, &id)?;
            println!("动作清单版本：{}", options.version);
            if options.actions.is_empty() {
                println!("（服务端没有给出任何可用动作）");
            }
            for item in &options.actions {
                match &item.disabled_reason {
                    Some(reason) => println!("  [不可用] {} —— {reason}", item.label),
                    None => println!("  [可执行] {} (id={})", item.label, item.id),
                }
                if let Some(desc) = &item.description {
                    println!("      {desc}");
                }
                for field in &item.fields {
                    println!(
                        "      需填：{}（key={}，{}）",
                        field.label,
                        field.key,
                        if field.required { "必填" } else { "可选" }
                    );
                }
            }
        }
        WorkflowCmd::Run {
            work_item_id,
            project,
            r#type,
            action,
            version,
            request_id,
            fields,
            yes,
        } => {
            let mut values = BTreeMap::new();
            for raw in &fields {
                let (key, value) = raw.split_once('=').ok_or_else(|| {
                    BackendError::config(format!("--field 必须写成 key=value，收到的是 `{raw}`"))
                })?;
                values.insert(key.trim().to_string(), value.to_string());
            }
            // 身份补齐失败（缓存读不出、同一编号跨空间撞号）必须在这里就停下：
            // 带着猜出来的身份去写，改的可能根本不是用户要改的那条事项。
            let item_id = resolve_identity(&session, project, r#type, work_item_id)?;
            let request = WorkflowRequest {
                item_id,
                action_id: action,
                version,
                request_id: non_empty(request_id).unwrap_or_else(new_request_id),
                fields: values,
            };
            if !yes {
                println!("这是写操作，会真的改动飞书数据。核对下面每一项，再加 --yes 重跑（本轮没有发出任何请求）：");
                println!("  action_id  = {}", request.action_id);
                println!("  version    = {}", request.version);
                println!("  request_id = {}", request.request_id);
                if request.fields.is_empty() {
                    println!("  fields     = （无）");
                }
                for (key, value) in &request.fields {
                    println!("  field {key} = {value}");
                }
                if !config.workflow_enabled {
                    println!("  （当前 workflow_enabled = false：即使加 --yes 也会被拒绝，需要先改配置）");
                }
                return Ok(0);
            }
            if !config.workflow_enabled {
                // 桌面壳有 ensure_workflow_enabled 这道闸门，CLI 不能成为绕过它的后门：
                // 文档写的是「--yes + workflow_enabled 两道闸门」，那 CLI 就得真的认第二道。
                return Err(BackendError::config(
                    "配置中 workflow_enabled = false，本端拒绝发出写请求。确认要做这次写操作后，在配置文件里写入 workflow_enabled = true 再重跑",
                ));
            }
            let result = workflow::execute(&session, &request)?;
            println!(
                "结论：{}｜已回读核验={}｜本地缓存已刷新={}",
                result.outcome.as_str(),
                result.verified,
                result.resynced
            );
            println!("{}", result.message);
            return Ok(match result.outcome {
                ActionOutcome::Verified => 0,
                ActionOutcome::Failed => EXIT_ACTION_FAILED,
                ActionOutcome::Unknown => EXIT_ACTION_UNKNOWN,
            });
        }
    }
    Ok(0)
}

/// 本地自检：只碰文件系统与 SQLite，凭证只报来源不报值。
fn run_doctor(config: &Config) -> Result<u8, BackendError> {
    println!("配置: {}", match &config.loaded_from {
        Some(p) => format!("已加载 {}", p.display()),
        None => format!("未创建（使用内置默认值；默认位置 {}）", config.default_config_path.display()),
    });
    println!("端点: {}（必须是 https，凭证走请求头）", config.endpoint);
    println!("缓存库: {}", config.db_path.display());

    let session = Session::open(config.clone())?;
    println!(
        "缓存库: 可读写（schema 就绪，当前 {} 条工作项）",
        session.count_cached_items()?
    );

    match session.describe_credential() {
        Ok(describe) => println!("凭证: 已获取（{describe}）"),
        Err(e) if e.kind() == fstodo_backend::error::ErrorKind::Credential => {
            println!("凭证: 未就绪 —— {}", e.safe_message(None));
        }
        Err(e) => return Err(e),
    }

    match session.last_successful_sync()? {
        Some(run) => {
            println!(
                "最近成功同步: #{} {}（{} 页 / {} 条，结束原因 {}）",
                run.id,
                format_ms(run.finished_at_ms.unwrap_or(run.started_at_ms)),
                run.pages_fetched,
                run.items_upserted,
                run.stop_reason.map(|s| s.as_str()).unwrap_or("<未记录>")
            );
        }
        None => println!("最近成功同步: 无"),
    }

    println!("本轮能力边界: 只有 kind=personal_todo 的来源可执行；\n\
              work_item_type / view 与 association_rule 已预留但不可执行（原因见 docs/验收与限制.md）。");
    Ok(0)
}

fn print_report(report: &SyncReport) {
    print_performance(&report.performance);
    let verdict = if report.is_success() { "成功" } else { "未完成" };
    println!(
        "同步{}: 运行 #{}，action={}{}，翻页 {} 次",
        verdict,
        report.run_id,
        report.action,
        report.todo_scope.as_ref().map(|s| format!("，scope={s}")).unwrap_or_default(),
        report.pages_fetched
    );
    println!(
        "  收到 {} 条，落库 {} 条（新增 {} / 更新 {}），拒绝 {} 条",
        report.items_received, report.items_upserted, report.items_inserted, report.items_updated, report.items_rejected
    );
    println!(
        "  结束原因: {}（{}）",
        report.stop_reason.as_str(),
        describe_stop(report.stop_reason)
    );
    if let Some(total) = report.remote_total {
        let flag = if total == report.items_received as i64 { "一致" } else { "不一致，以实际取到的条数为准" };
        println!("  响应 total={total}，实际收到 {} 条（{flag}）", report.items_received);
    } else {
        println!("  响应未提供 total（不凭空推断数据是否完整）");
    }
    for r in &report.rejections {
        println!("  拒绝 {} 条: {} —— {}", r.count, r.code, r.sample);
    }
    if !report.complete {
        eprintln!("警告: 本次数据不完整，未记为成功同步；已有缓存保持不变。");
    }
}

fn describe_stop(reason: StopReason) -> &'static str {
    match reason {
        StopReason::ShortPage => "本页不足每页假定条数，按末页处理",
        StopReason::TotalReached => "累计条数已达响应 total",
        StopReason::EmptyPage => "某页返回 0 条",
        StopReason::MaxPages => "触到 max_pages 上限，数据可能不完整",
        StopReason::Error => "中途出错，数据不完整",
    }
}

fn print_items(items: &[CachedItem], limit: i64, offset: i64) {
    if items.is_empty() {
        println!(
            "本地缓存没有符合条件的工作项（offset={offset}，limit={limit}）。\n\
             提示：空缓存不代表远端没有待办，先跑 `fstodo sync`；\
             `fstodo list` 只读缓存，不联网。"
        );
        return;
    }
    println!("本地缓存（本页 {} 条，offset={offset}，limit={limit}）:", items.len());
    for item in items {
        let w = &item.item;
        println!(
            "  [{}] {} | 类型 {} / 空间 {} | 流程 {}{} | 排期 {} ~ {} | 第 {} 次见到",
            w.id.work_item_id,
            w.name.as_deref().unwrap_or("<响应未提供名称>"),
            w.id.work_item_type_key.as_deref().unwrap_or("<响应未提供类型>"),
            match (&w.id.project_key, &w.project_name) {
                (Some(k), Some(n)) => format!("{n}({k})"),
                (Some(k), None) => k.clone(),
                (None, Some(n)) => format!("{n}<缺 project_key>"),
                (None, None) => "<响应未提供空间>".to_string(),
            },
            w.flow.kind.as_str(),
            match w.flow.kind {
                FlowKind::Node => format!("[节点 {}]", w.flow.node_name.as_deref().or(w.flow.node_state_key.as_deref()).unwrap_or("<未提供>")),
                // Both：两组流程信息都要出现在输出里，差异不得因打印端收敛而丢失
                FlowKind::Both => format!(
                    "[节点 {}][状态 {} → {}]",
                    w.flow.node_name.as_deref().or(w.flow.node_state_key.as_deref()).unwrap_or("<未提供>"),
                    w.flow.start_state_key_name.as_deref().unwrap_or("<未提供>"),
                    w.flow.end_state_key_name.as_deref().unwrap_or("<未提供>")
                ),
                FlowKind::State => format!(
                    "[状态 {} → {}]",
                    w.flow.start_state_key_name.as_deref().unwrap_or("<未提供>"),
                    w.flow.end_state_key_name.as_deref().unwrap_or("<未提供>")
                ),
                FlowKind::None => "<响应未提供流程信息>".to_string(),
            },
            w.schedule.start_raw.as_deref().unwrap_or("<无>"),
            w.schedule.end_raw.as_deref().unwrap_or("<无>"),
            item.seen_count,
        );
        if !item.identity_missing_flags.is_empty() {
            println!("      身份缺段: {}（主键以空串占位，见 docs/数据模型与接口契约.md）",
                item.identity_missing_flags.join(", "));
        }
    }
}

fn print_run(run: &SyncRun, label: &str) {
    if let Some(performance) = &run.performance { print_performance(performance); }
    println!(
        "{label} #{}: {}，{} 页，收到 {} / 落库 {} / 拒绝 {}，结束原因 {}",
        run.id,
        run.status.as_str(),
        run.pages_fetched,
        run.items_received,
        run.items_upserted,
        run.items_rejected,
        run.stop_reason.map(|s| s.as_str()).unwrap_or("<未记录>"),
    );
    println!(
        "  {} ~ {}，action={}{}",
        format_ms(run.started_at_ms),
        match run.finished_at_ms {
            Some(ms) => format_ms(ms),
            None => "<未结束>".to_string(),
        },
        run.action,
        run.todo_scope.as_ref().map(|s| format!("，scope={s}")).unwrap_or_default(),
    );
    if let (Some(kind), Some(message)) = (&run.error_kind, &run.error_message) {
        println!("  错误[{kind}]: {message}");
    }
    if let Some(detail) = &run.rejection_detail {
        println!("  拒绝明细: {detail}");
    }
}

fn print_performance(p: &fstodo_backend::sync_metrics::SyncPerformance) {
    println!("同步耗时: {} ms（清单/校验 {}，详情 {}，详情写库 {}，摘要写库 {}）；详情取得 {} / 同轮复用 {}，请求峰值 {}",
        p.elapsed_ms, p.query_ms, p.details_ms, p.detail_store_ms, p.summary_store_ms,
        p.detail_items_fetched, p.detail_cache_hits, p.peak_in_flight);
    for (tool, timing) in &p.requests {
        println!("  {tool}: {} 次，累计 {} ms，失败 {} / 取消 {}", timing.count, timing.elapsed_ms, timing.failed, timing.cancelled);
    }
}

fn format_ms(ms: i64) -> String {
    chrono::DateTime::<chrono::Utc>::from_timestamp_millis(ms)
        .map(|dt| dt.with_timezone(&chrono::Local).format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| format!("<异常时间戳 {ms}>"))
}
