# FSTODO 本地数据层（后端）

Rust 本地后端：飞书项目 MCP 接入 → 内部模型 → SQLite 缓存 → 本地查询，外加节点/状态流程动作。同步与动作发现是只读的；流程写入需明确确认。CLI 同时要求 `workflow_enabled = true` 与 `--yes`，桌面端默认启用流程能力并通过界面核对和二次确认执行。

产品介绍见[项目首页](../README.md)，当前说明与历史记录入口见[文档索引](../docs/README.md)。软件根基见[产品定位与演进方向](../docs/design/产品定位与演进方向.md)。

工作来源现已支持个人待办、按类型与人员/自定义关联规则查询、普通已保存视图；每条事项补全全部逻辑字段。配置方法、数据结构及范围见 [工作来源与详情补全](docs/工作来源与详情补全.md)。

节点表单支持估分、设计文档、实际工时、排期与进度；状态流支持在本端补填基础字段及单选必填项。桌面修改自动保存本机草稿，经过内容核对和二次确认后才提交飞书并推进。字段归属、提交顺序及限制见 [流转填写与草稿](docs/节点填写与草稿.md)。

## 目录

| 路径 | 内容 |
|---|---|
| `src/config.rs` | 配置加载与校验（未知键拒绝、https 强制） |
| `src/credentials.rs` | 凭证来源与脱敏（`SecretToken` 永不打印原文） |
| `src/mcp/feishu.rs` | `rmcp` 官方 SDK 客户端（`X-Mcp-Token` 头、错误分类） |
| `src/mcp/parse.rs` | `list_todo` 返回载荷 → 接口侧结构（与 SDK 无关，可离线测） |
| `src/model/` | 接口侧原始结构（raw）/ 内部模型（domain）/ 工作来源配置（source） |
| `src/sync.rs` | 翻页驱动、终止判据、失败记账 |
| `src/store.rs` | SQLite 缓存（UPSERT、运行台账，无任何删除入口） |
| `src/api.rs` | 阻塞式门面：`check_connection` / `sync_personal_todos` / `query_cached_items` |
| `src/workflow.rs` / `src/workflow_fields.rs` | 远端动作发现、节点表单、字段更新与核验、必填检查、幂等与事项互斥、流程推进与回读 |
| `src/credentials/encrypted.rs` | DPAPI（当前用户）加解密，密文进 `credential` 表 |
| `src/bin/fstodo.rs` | 验证用 CLI |
| `tests/` | fixtures 与「同步+缓存」集成测试 |

## 快速开始

```powershell
cd backend
cargo build

# 可先在桌面「连接与配置」中保存 token；未设置时支持环境变量或 token_file
$env:FSTODO_MCP_TOKEN = "<你的 MCP token>"

fstodo doctor      # 本地自检（不联网）：配置、路径、缓存库、凭证来源
fstodo check       # 连接自检（联网）：建立 MCP 会话并回读服务端信息
fstodo sync        # 同步唯一可执行来源；多个来源时指定 --source 或使用 --all
fstodo sync --all  # 同步全部已启用来源，各来源分别记录运行结果
fstodo detail <事项号> --project <空间key> --type <类型key>  # 联网补全详情，--cached 只读缓存
fstodo list        # 查询缓存（离线，不联网）
fstodo last-sync   # 最近一次【成功】同步的信息
fstodo runs        # 最近若干次同步运行（含失败）
fstodo types refresh   # 发现各空间的可见工作项类型（只读联网）
fstodo types list      # 已保存的类型快照与当前生效的同步范围
fstodo types use --type-key <k>   # 记下同步范围（--source 缺省用默认来源；type_key 必须已在类型快照里；--clear 回到全量）
fstodo workflow actions <事项号>   # 只读发现流程动作：版本指纹 + 可执行/不可用及原因
fstodo workflow run <事项号> --action <id> --version <v> --yes   # 真写：既要 --yes，也要配置里 workflow_enabled = true（设为 false 时直接拒，退出码 6，不发请求）
fstodo actions <事项号>            # 该事项的动作流水（含结果不明的记录）
```

默认路径：配置 `%APPDATA%\FSTODO\config.toml`（可缺省，内置默认值可跑），
缓存 `%LOCALAPPDATA%\FSTODO\fstodo.db`。全局参数 `--config` / `--db` 可覆盖。
配置样例见 [`config.example.toml`](config.example.toml)。
桌面应用从同一配置位置读取数据库、凭证来源与工作来源等设置，但接管完整翻页、台账保留和流程启用策略；`workflow_enabled` 只约束 CLI，不关闭桌面端流程能力。

桌面设置的 token 使用 Windows 当前用户 DPAPI 或 macOS 钥匙串保护，SQLite 只保存加密后的密文，并优先于环境变量/外部凭证文件。回显仅给来源和长度，原文不写配置、业务表或日志；数据库自动迁移时保留原有缓存与历史。更换系统用户或电脑后需重新配置凭证。

## 验证命令（可复现）

```powershell
cargo test              # 当前测试以实际运行输出为准
cargo clippy --all-targets
```

## 文档

- [运行与验证](docs/运行与验证.md) —— 命令、退出码、真实读取步骤
- [数据模型与接口契约](docs/数据模型与接口契约.md) —— schema、字段依据、接口定义
- [验收与限制（历史轮次）](docs/验收与限制.md) —— 保留旧任务书对照和风险；旧范围不代表当前功能
- [写侧验收手册](docs/写侧验收手册.md) —— 真写由使用者本人执行的用例、命令与判据
