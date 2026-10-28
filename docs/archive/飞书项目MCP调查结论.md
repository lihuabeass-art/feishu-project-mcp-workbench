# 飞书项目 MCP 调查结论（仅事实记录，不含设计方案）

> 历史调查记录：保留当时的原始证据、纠错与未决问题，不代表当前功能或今天的远端状态。后续写回执、流程与同步规则以 [AGENTS.md](../../AGENTS.md) 及[现行业务文档](../README.md)为准。正文中的代码路径以仓库根目录为起点。

调查时间：2026-10-19
调查人：PI-Desktop（AI）
工作区根目录：`C:\Projects\FSTODO`（本文档落点：`C:\Projects\FSTODO\飞书项目MCP调查结论.md`）
原始需求出处：`C:\Projects\FSTODO\设计思路.md`（4 行）。**同名需求文件存在两份内容不同的副本**，详见第 13 节第 2 条。
本版为经独立审查（checkai）复核后的修订版，修订记录见第 11 节。

## 0. 证据等级图例

| 标记 | 含义 |
|---|---|
| 【实测·接口】 | 本次实际发起网络请求并拿到响应，有状态码或返回体为证（见第 12 节证据附录） |
| 【实测·界面】 | 在已登录的真实页面 DOM 上直接读到的文本/控件，非推断 |
| 【元数据】 | 从服务端自报的 `tools/list` 清单中读出（含 description 正文），**未实测该工具的执行行为** |
| 【官方文档】 | 摘自飞书/Lark 官方页面或官方文档站正文 |
| 【推断】 | 由上述事实推导，服务端**未提供任何直接依据**，不可当结论使用 |
| 【未验证】 | 明确未查证 |

> 修订说明：初版把 `tools/list` 派生内容和页面观察都标成【实测】，与自身定义冲突，本版已全部按上述口径重分级。

---

## 1. 核心事实：飞书项目自带官方 MCP Server

| 项 | 值 | 等级 |
|---|---|---|
| MCP 端点 | `https://project.feishu.cn/mcp_server/v1` | 【实测·接口】 |
| 服务端自报名 | `Meego MCP Server`，version `1.0.0` | 【实测·接口】 |
| 协商协议版本 | 我方请求 `2024-11-05`，服务端回 `2025-03-26` | 【实测·接口】 |
| 声明能力 | `capabilities: { logging: {}, tools: { listChanged: true } }` | 【实测·接口】 |
| 会话机制 | 响应头 `Mcp-Session-Id`，需在后续请求回传 | 【实测·接口】 |
| 工具总数 | **48 个** | 【元数据】（`tools/list` 顶层计数，已复核 = 48） |
| 鉴权头名 | `X-Mcp-Token` | 【实测·接口】该头可通过鉴权 +【实测·界面】页面原文「Header 为「X-Mcp-Token」」 |
| 三种连接模式 | HTTP OAuth / HTTP Header / Stdio | 【实测·界面】tab 标签；Stdio 内容未点开 |
| 数据授权范围 | 存在两个勾选项「允许查看数据信息」「允许创建或修改数据信息」及一个总开关 | 【实测·界面】**仅证明控件存在，当前勾选状态未确认** |
| 页面警示原文 | 「配置中包含您的个人身份，该身份信息将长期有效，请勿泄露给他人」 | 【实测·界面】 |
| Token 管理动作 | 复制 URL / 复制 Token / 重置 Token | 【实测·界面】 |
| 配置页位置 | 飞书项目 → 空间 `b` → 左侧「MCP 配置」，URL `project.feishu.cn/b/mcp` | 【实测·界面】 |
| CLI 安装命令 | `npx -y @lark-project/meegle@latest install` | 【实测·界面】页面正文；**该 npm 包与仓库存在性未验证** |
| CLI 仓库 | `https://github.com/larksuite/meegle-cli` | 【实测·界面】页面正文，**未验证** |

`initialize` 返回原文【实测·接口】：

```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26","capabilities":{"logging":{},"tools":{"listChanged":true}},"serverInfo":{"name":"Meego MCP Server","version":"1.0.0"}}}
```

## 2. 鉴权：两条独立体系并存

### 2.1 MCP 侧（本次打通）

【实测·接口】无凭证 POST 返回 **401**，并给出标准 OAuth 挑战头：

```
WWW-Authenticate: Bearer resource_metadata="https://project.feishu.cn/.well-known/oauth-protected-resource"
```

【实测·接口】`/.well-known/oauth-protected-resource` 返回：
`resource=https://project.feishu.cn/mcp_server/v1`、`authorization_servers=["https://project.feishu.cn"]`、`bearer_methods_supported=[]`、`scopes_supported=[]`

【实测·接口】`/.well-known/oauth-authorization-server` 返回：

| 项 | 值 |
|---|---|
| issuer | `https://project.feishu.cn` |
| authorization_endpoint | `https://project.feishu.cn/b/auth/mcp` |
| registration_endpoint | `https://project.feishu.cn/mcp_server/oauth/register` |
| token_endpoint | `https://project.feishu.cn/mcp_server/oauth/token` |
| device_authorization_endpoint | `https://project.feishu.cn/goapi/v5/mcp_server/oauth/device_code` |
| grant_types_supported | `authorization_code`、`refresh_token`、`urn:ietf:params:oauth:grant-type:device_code` |
| code_challenge_methods | `S256`、`plain` |
| scopes_supported | 空数组 |

【实测·接口】动态客户端注册（DCR）可用：POST `mcp_server/oauth/register` 返回 200 并发放 `client_id`/`client_secret`。

【实测·接口】用用户手动复制的 `X-Mcp-Token` 走 HTTP Header 模式，`initialize`、`tools/list`、`tools/call` 均成功。

【未验证】`X-Mcp-Token` 确切有效期（页面仅「长期有效」，无数值）；token 权限上界；Stdio 模式内容。

### 2.2 老 OpenAPI 侧（并存，非本次主链路）

【实测·接口】仅探测端点存活，**未获取凭证、未取任何数据**：

| 端点 | 结果 |
|---|---|
| `POST /open_api/authen/plugin_token`（假凭证） | **401** |
| `POST /open_api/authen/plugin_token`（空 body） | **400** |
| `POST /open_api/projects` | **403** |
| `POST /open_api/ai_os/work_item/filter` | **403** |
| `POST /open_api/ai_os/work_item/story/search/params` | **403** |
| `GET /open_api/ai_os/fix_view/123` | **403** |

【实测·接口】鉴权头 `X-PLUGIN-TOKEN` + `X-USER-KEY`（均 required），与 MCP 的 `X-Mcp-Token` 属两套凭证。

【实测·接口】官方 API 文档站 `https://s.apifox.cn/apidoc/docs-site/2823507`，其 `llms.txt` 已下载留存（全文 66 行，其中 markdown 链接条目 **63 条**，按 `](https://` 行计数）。

【官方文档】`project_key` = 双击空间名称复制；`user_key` = 双击左下角小头像复制。

## 3. 「抓取我自己的」这条链路：读侧已实测跑通

【元数据】`list_todo` 参数（`tools/list` schema，已逐字复核）：

| 参数 | 必填 | 取值 |
|---|---|---|
| `action` | **是** | `todo` / `done` / `overdue` / `this_week` |
| `todo_scope` | 否 | `all` / `in_progress` / `not_started`；描述「未强调时默认传 in_progress」 |
| `page_num` | 否 | 从 1 递增，描述称**每页固定 50 条** |
| `asset_key` | 否 | 描述称仅报错时按报错内容传 |

【元数据】官方工具描述原文（关键句，与 JSON 逐字一致）：「**按当前用户**与工作类型（action）查询其相关工作项列表，支持查询我的待办/已办」「与 search_by_mql 需要精确入参查询语句不同，本工具可以精确查询当前用户的待办和已办」。

【实测·接口】真实调用成功，返回 `total=8`。单条返回结构：

```
work_item_info { work_item_id, work_item_type_key, work_item_name }
project_key / project_name
schedule { start_time, end_time }
node_info { node_name, node_state_key }
state_info { start_state_key_name, end_state_key_name }
```

【实测·接口】该次返回中出现过的 `work_item_type_key` **仅 `story` 与 `issue` 两种**。是否还会返回 `sub_task` 等其他类型，未观测到，【未验证】。

【实测·接口】本次 8 条恰好全部属于同一个 `project_key`，且 `action` / `todo_scope` 实际入参组合未完整覆盖，因此**不能据此断言跨空间聚合能力**（见 10.4）。

【元数据】`search_user_info.user_keys` 的 schema 描述支持特殊值 `current_login_user()` 代表"我"（JSON 逐字：「userkey支持传入current_login_user()，代表当前人（我）」）。

【实测·接口】该值实际调用成功，返回体中包含当前用户的 user_key、email、中文名、英文名、状态字段。返回值属个人数据，本文档不记录具体值。

## 4. 已证实的关键结构：两种流程模型并存

【实测·接口】依据——上述真实返回体中，同一批数据里：

- `work_item_type_key = "story"`（需求）→ `node_info` 有值（节点名 + `node_state_key`），`state_info` 两字段均为空字符串
- `work_item_type_key = "issue"`（缺陷）→ `node_info` 为空，`state_info.start_state_key_name` 有值（如"待处理"）

【元数据】对应工具及其**真实必填项**（已逐项比对 `required` 数组）：

| 模型 | 工具 | required |
|---|---|---|
| 节点流 | `transition_node` | `project_key`、`work_item_id`、`node_id`、`action`（`rollback_reason` 仅回滚时） |
| 状态流 | `get_transitable_states` | `project_key`、`work_item_id` |
| 状态流 | `get_transition_required` | `state_key` |
| 状态流 | `transition_state` | `project_key`、`work_item_id`、`transition_id` |

【元数据】`transition_state.transition_id` 描述逐字写明「可以通过get_transitable_states来获取」——**这一条前置关系是服务端自述的**。

【推断】其余调用先后顺序（如"必须先 `get_node_detail` 才能拿 `node_id`"、"`transition_state` 前必须先调 `get_transition_required`"）**服务端未提供任何依据**，纯属我按必填参数来源反推，不可当结论。

【元数据】`get_transition_required` 描述为「获取指定节点/状态流转所必填信息」——说明流转**可能需要填字段**，但具体触发条件未实测。

【未验证】我**没有执行过任何写操作**。两种流转能否成功、写权限是否已开启，均未知。

## 5. 「显示」「推进」相关工具：存在性与参数已核对，行为未实测

下表均【元数据】，**每个工具的实际执行行为我一个都没调用过**。`required` 列已与 JSON 逐项比对。

| 用途 | 工具 | required | schema 额外约束（易踩） |
|---|---|---|---|
| 单条概况 | `get_workitem_brief` | 无顶层 required | 描述要求 `work_item_id` 与 `name` **二选一**，并非可空调用 |
| 节点+子任务 | `get_node_detail` | 无顶层 required | 有 `need_sub_task`、`field_key_list` |
| 字段元数据 | `list_workitem_field_config` | `project_key`、`work_item_type` | — |
| 类型清单 | `list_workitem_types` | 无顶层 required | — |
| 评论 | `list_workitem_comments` | `project_key`、`work_item_id` | — |
| 附件下载 | `get_download_url` | `project_key`、`work_item_id`、`file_url` | 描述要求 GET 时加 header **`X-Meego-File-Sign`**（value=返回的 sign）；并按 `is_multipart` 判断是否分片，分片时用 `part_index` 替换 URL 中 `part_number`，`start_byte`/`end_byte` 控制分片区间 |
| 个人排期 | `list_schedule` | `project_key`、`user_keys`、`start_time`、`end_time` | — |
| 视图详情 | `get_view_detail` | 无顶层 required | `view_id`/`project_key`/`fields`/`url` |
| 按标题找视图 | `search_view_by_title` | `project_key`、`view_scope`、`key_word` | — |
| 全景视图 | `list_multi_project_view_workitems` | `project_key`、`view_id` | — |
| MQL 查询 | `search_by_mql` | **仅 `project_key`** | `mql` 为**可选**（描述表明翻页场景可不传） |
| 改字段/角色 | `update_field` | `work_item_id` | `fields`、`role_operate` 可选 |
| 改节点/排期 | `update_node` | 无顶层 required | 嵌套 `schedules[].clear_schedule` 描述称"要求清空时必须显式传入"，按"全可选"理解会误清空排期 |
| 子任务增改 | `update_node_subtask` | **`node_id`、`action`** | `project_key` 为**可选** |
| 加评论 | `add_comment` | `work_item_id`、`project_key` | 仅全文评论 |
| 建工作项 | `create_workitem` | `project_key`、`work_item_type`、`fields` | 描述要求先用 `list_workitem_field_config` 取字段 |

## 6. 已证实的约束与缺口

| # | 事实 | 等级 |
|---|---|---|
| 6.1 | `tools/list` 返回的 48 个工具，其**名称与描述全文**中不含任何 `webhook` / 订阅 / 推送 / 回调 / subscribe 字样（正则计数全部为 **0**）。限定：**仅 tools 层面**，不代表整个服务（见 10.7） | 【元数据】 |
| 6.2 | `initialize` 声明能力仅 `logging` 与 `tools.listChanged`；后者指**工具列表**变更，不是业务数据变更 | 【实测·接口】 |
| 6.3 | 官方 FAQ 原文：「Webhook 能否通过 Open API 配置？暂不支持。」「使用的是动态IP，无法获取到服务器IP」——**针对 OpenAPI 侧，非 MCP** | 【官方文档】 |
| 6.4 | `list_todo` 每页固定 50 条，需自行翻页至不足 50 条 | 【元数据】描述原文 |
| 6.5 | 官方 FAQ 原文：「视图中设置筛选条件后点击"保存变更"……通过 API 获取视图数据与实际数据相同」 | 【官方文档】 |
| 6.6 | 官方 FAQ 原文：「api 返回的数据，不包含控件数据，但是会包含[拉群方式选择]、[角色与人员]的信息」 | 【官方文档】 |
| 6.7 | 官方 FAQ 原文：「出于安全考虑，新版本对返回的字段信息做了严格的管控」 | 【官方文档】 |
| 6.8 | 官方 FAQ 原文：「调接口更新工作项会存在一定程度的时延」 | 【官方文档】 |
| 6.9 | 官方 FAQ 原文：已终止需求需在 `sub_stages` 加 `["closed"]`（针对 OpenAPI） | 【官方文档】 |
| 6.10 | 无任何限流/QPS 文档，我也未测出速率上限 | 【未验证】 |
| 6.11 | 网页端「复制 Token」在本环境**取不到值**：JS 合成点击与 CDP 真实点击各一次，系统剪贴板内容均未更新；最终由用户在客户端手动复制提供 | 【实测·界面】 |

## 7. 已排除的三条路径（附排除依据）

| 路径 | 排除依据 | 等级 |
|---|---|---|
| 飞书 MCP（`mcp.feishu.cn` / `open.feishu.cn` 那套） | 官方文档在 `fetch-doc`/`create-doc` 功能限制中列明「暂不支持多维表格、电子表格、OKR、任务、群名片、日程、**飞书项目**中的内容」；MCP 概述写「当前支持「云文档」场景」 | 【官方文档】 |
| 飞书 CLI `@larksuite/cli` | 扫描其仓库 git tree 全部 3669 个路径与 28 个 Skill 目录，无 project / meego 业务域（仅命中无关文件 `internal/recovery/projector.go`、`shortcuts/mail/draft/projection.go`）；npm 最新 1.0.98，仓库 17724 stars | 【实测·接口】 |
| 盲猜 MCP 端点路径 | 试过的 10 个候选（`/b/mcp` POST、`/b/mcp/sse`、`/b/mcp/streamable`、`/mcp`、`/api/mcp`、`/open_api/mcp`、`/b/settings/mcp` 等）全部 **404** | 【实测·接口】 |

## 8. 我自己说错、已推翻的三处结论（备查）

| 错误结论 | 错在哪 | 纠正依据 |
|---|---|---|
| 「飞书项目没有 MCP，只能走 OpenAPI」 | **错**。存在官方 `mcp_server/v1`，48 工具，读链路已打通。原因是我只探测了 `/open_api/` 路径族 | 用户指出 `project.feishu.cn/b/mcp` 后实测推翻 |
| 「`mcp.project.feishu.cn` 有独立 DNS 解析，很可能是真实 MCP 主机」 | **错**。本机走 fake-IP 代理，**任意域名都返回 `198.18.x.x`**——我故意编造的不存在域名同样"解析成功"。本环境 DNS 成功不构成任何证据 | 对照实验 |
| 「`list_todo` 跨空间自动聚合」 | **过度断言**。本次 8 条恰好同属一个空间，无多空间样本，不能证明 | 见 10.4，已降级为未验证 |

环境事实【实测·接口】：本机域名解析结果全部落在 `198.18.0.0/16` 保留段（`project.feishu.cn`→198.18.0.81、`mcp.project.feishu.cn`→198.18.2.200）。`open.project.feishu.cn` 虽解析但 TLS 连接失败（「基础连接已经关闭」），未连通。

## 9. 我造成的副作用（纯事实）

1. 【实测·接口】原调查在 `mcp_server/oauth/register` 注册了一个 OAuth 客户端，获发 `client_id` 及对应 `client_secret`（客户端标识在公开整理时省略，secret 未写入本文档）。该注册在调查当时未删除；当前状态未重新核验。
2. 【实测·接口】用户提供的 `X-Mcp-Token` 出现在本次若干命令行明文里（shell 历史可见）。未写入任何文件。
3. 一次抓取全量待办明细并落盘的命令被用户中止（`TOOL_ABORTED`），未写出文件；事后核实目标目录不存在。
4. 本次留存的**全部**文件（均在 scratch 目录，非工作区）：
   - `meegle-mcp-tools.json` —— 48 个工具的名称、描述、入参 schema，纯元数据
   - `feishu-project-llms.txt` —— 飞书项目 OpenAPI 文档站 `llms.txt` 原文（接口清单索引）
   - 无任何业务数据文件。

## 10. 未决问题（本文档不作为结论）

1. 「允许创建或修改数据信息」当前是否勾选 → 直接决定写操作能否成功。【未验证】
2. **全部写操作的实际行为与错误语义一次未测**。按名称前缀（`create`/`update`/`transition`/`add`/`delete`/`remove`/`edit`/`publish`/`reset`/`upload`）统计，48 个工具中的写类工具共 **15 个**（含 `transition_node`、`transition_state`、`update_field`、`update_node`、`update_node_subtask`、`add_comment`、`create_workitem`、`upload_file`、WBS 草稿系列、固定视图系列等，完整清单见 `meegle-mcp-tools.json`），全部未实测。注意：评论的更新与删除**不是**独立工具，由 `add_comment` 的 `action` 参数承担。【未验证】
3. `search_by_mql` 的 MQL 语法与可用性，未测。【未验证】
4. `list_todo` 是否跨空间聚合、是否返回 `sub_task` 等任务类型：本次样本 8 条且单一 `action` 组合，均未覆盖。【未验证】
5. Meegle CLI（`@lark-project/meegle` / `larksuite/meegle-cli`）是否真实存在、与 MCP 的关系。【未验证】
6. `X-Mcp-Token` 确切有效期、可否多端并发。【未验证】
7. 该 MCP 是否另提供 `resources` / `prompts` 能力：我只调过 `tools/list`，**未调 `resources/list`、`prompts/list`**。因此 6.1 的"无数据变更类能力"结论**仅限 tools 层面**。【未验证】
8. 各工具的分页上限、字段返回管控的具体边界。【未验证】

## 11. checkai 修订记录（本次独立审查后的处置）

### 11.1 第一轮审查与处置

独立审查第一轮（`code-reviewer` 子代理，只读）实际送达 **20 项**：缺陷 17 项 + 超纲 2 项 + 需求疑点 1 项（其报告末段因输出上限截断，未送达部分见第 11.2 节）。主 Agent 逐条读原始 JSON 与原始响应复核后：

- **确认属实并已处置 19 项**（缺陷 17 + 超纲 2）：其中 18 项直接改写文档，1 项（"【实测】条目未附原始响应"）以新增第 12 节证据附录的方式补足。关键 7 项：
  1. `search_by_mql` 我曾把 `mql` 写成必填，实际 `required` 仅 `project_key` → 已改
  2. `update_node_subtask` 我多写 `project_key` 必填，实际仅 `node_id`、`action` → 已改
  3. `transition_state` 必填原写少，实为三项 → 已补
  4. 结论曾把"抓取需求、缺陷、**任务**"并列，但返回体只出现过 `story`/`issue` → 已收窄，任务移入 10.4
  5. 结论曾把"无数据变更推送"上升为服务级硬约束，与 10.7 冲突 → 已限定为 tools 层面
  6. `get_download_url` 漏记 `X-Meego-File-Sign` 与 `is_multipart`/`part_number` 分片机制 → 已补
  7. 「必须按某顺序调用」曾被标【元数据】，实为我方推断 → 已改标【推断】并说明服务端只自述了 `transition_id` 一条
  余 11 条为证据等级内部一致性（页面观察/`tools/list` 派生内容误标【实测】）、"留存唯一文件"与 `llms.txt` 矛盾、§8 口径"两处"实为三处、§7 与 §9 残留行动建议 → 已分别按第 0 节新分级重标、补全文件清单、补齐第三处、删除建议句。
- **假阳性归属澄清**：`add_comment` / `search_view_by_title` / `transition_node` 三项的必填差异**并非审查提出**——审查者当时把这三项列在"已核对无误"清单中。该差异来自主 Agent 自查脚本 `Compare-Object -SyncWindow 0` 的顺序敏感比较，属我自己的工具假阳性，复核后确认三者集合完全一致，未采信、未改文档。
- **列入疑点交用户 1 条**：`client_id` 是否算个人数据，见第 13 节。
- **审查自身局限**：审查子代理无 shell 权限，仅能复核 `meegle-mcp-tools.json`；对 HTTP 状态码、页面观察、仓库扫描类条目声明"无法独立复核"。其报告末尾在【需求疑点】(a) 段被输出上限截断，(b) 段（§8 自相矛盾专项）未送达，但等价问题已由"§8 口径不一致"一条覆盖并已修。

### 11.2 第二轮复查与本轮处置

第二轮抽查上述 7 项，判定**全部已修**（①–⑦ 逐项对照 JSON 通过，§4/§5 的 required 列亦无残留不符）。但第二轮指出主 Agent 在修订过程中**新引入 5 条缺陷**：

| 编号 | 第二轮指出的问题 | 我的复核结果 | 处置 |
|---|---|---|---|
| N1 | §10.2 出现不存在的工具 `update_comment`，且"所有写操作"仅列 5 个，与 §5 自相矛盾 | **属实**：JSON 中 `update_comment` 命中 **0**（评论更新实为 `add_comment` 的 `action`）；名称以 `create/update/transition/add/delete/remove/edit/publish/reset/upload` 开头的写类工具实为 **15 个** | 已改写：按名称前缀界定，完整清单指向 §5 与 JSON |
| N2 | §6.11 剪贴板观察标【实测·接口】，按 §0 定义应属【实测·界面】 | **属实**，本次重分级漏改该条 | 已改为【实测·界面】 |
| N3 | §11 自述"22 条 / 18 修 / 1 假阳性 / 1 疑点"，相加仅 20 且与审查实际条数不符 | **属实**：审查第一轮实际送达 **17 缺陷 + 2 超纲 + 1 疑点 = 20 项** | 已按 20 项重写统计 |
| N4 | §11 把主 Agent 自查脚本的顺序敏感假阳性，记成了"审查提出的假阳性" | **属实**：审查者当时把 `add_comment`/`search_view_by_title`/`transition_node` 列在"已核对无误"清单，从未报为缺陷 | 已改写澄清归属，未改文档正文 |
| N5 | §2.2 称 `llms.txt` 60 条，按其自述的链接计数口径实算不是 60 | **属实**：markdown 链接行实测 **63** 行（文件共 66 行） | 已改为 63 并注明计数口径 |

第二轮总判定为"仍需修 N1–N4，N5 择机"，本轮 **N1–N5 全部修毕**。修毕后未再发起第三轮独立复查（见第 14 节）。

## 12. 证据附录（关键【实测·接口】条目的原始响应）

| 请求 | 原始结果 |
|---|---|
| POST `mcp_server/v1`（无鉴权头） | `401`，`WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource"` |
| POST `mcp_server/v1` `initialize`（带 `X-Mcp-Token`） | `200`，返回体见第 1 节原文；响应头 `Mcp-Session-Id` |
| POST `mcp_server/v1` `tools/list` | `200`，body 121660 字节，解析后 `tools.Count = 48` |
| `tools/call list_todo {action:"todo",page_num:1}` | 返回 `{"total":8,"list":[...]}`，首条含 `work_item_id`/`work_item_type_key`/`project_key`/`node_info` |
| `tools/call search_user_info {user_keys:["current_login_user()"]}` | 返回单元素数组，含 user_key / email / name_cn / name_en / status=`activated` |
| GET `.well-known/oauth-authorization-server` | `200`，JSON 见 2.1 |
| POST `mcp_server/oauth/register` | `200`，返回 `client_id`/`client_secret` |
| POST `open_api/authen/plugin_token`（假凭证 / 空 body） | `401` / `400` |
| 4 个 `open_api/*` 端点（假 `X-PLUGIN-TOKEN`） | 全部 `403` |
| 10 个猜测的 MCP 路径 POST | 全部 `404` |
| `GET open.project.feishu.cn/` | 连接异常「基础连接已经关闭」，未连通 |

## 13. 需求疑点（需你定夺，我不擅自处理）

> 公开整理说明：原始输入文件的摘要前缀与粘贴副本标识已省略，保留两份输入不一致的调查结论。

1. **历史疑点，公开整理已处理**：原第 9 节第 1 条曾记录绑定账号下注册的 `client_id`（`client_secret` 未记录），当时讨论是否遮蔽。2026-10-28 公开整理已省略该标识，此处保留当时的问题背景，不再作为当前待确认项。
2. **需求文件存在两份内容不同的副本**（【实测】已核对 hash 与时间戳）：
   - A `C:\Projects\FSTODO\设计思路.md` — 318 B，2026-10-19 10:32:09，SHA256 前缀 `<原文件摘要已省略>`，第 4 行「具体要实现的功能：抓取，显示，流程推进（**可以操作飞书项目上的节点**）」
   - B `<scratch>\pasted\<粘贴副本标识>-设计思路.md` — 285 B，2026-10-19 10:31:28，SHA256 前缀 `<副本摘要已省略>`，第 4 行「以一个最小mvp为闭环目标，抓取，显示，流程推进」
   第 1–3 行完全相同，**仅第 4 行不同**，A 比 B 晚 41 秒。本文档按 A（工作区版）理解。两问待你定：① 以哪份为准；② A 的括号「可以操作飞书项目上的节点」是**需求**还是**实现约束**——若为需求，则流程推进的范围被限定为节点流（对应本文档第 4 节），状态流（缺陷）是否纳入即随之改变。
3. 原始需求写的是"通过**飞书cli**"，而第 7 节已证实 `@larksuite/cli` 不覆盖飞书项目。需求里"cli"一词所指为何（Meegle CLI？还是泛指命令行方式？），需求本身未澄清。

---

## 14. 交付状态与剩余局限

1. **checkai 已跑两轮**：第一轮 20 项已全部处置（见 11.1），第二轮新发现的 N1–N5 已全部修毕（见 11.2）。**第三轮独立复查未发起**，因此本轮修复后的文档未经独立验证——仅由我自行以 grep 与逐项比对 JSON 复核。
2. **独立审查的证据覆盖面有限**：审查子代理无 shell 权限，只能复核 `meegle-mcp-tools.json`。文中所有 HTTP 状态码、页面观察、仓库扫描类条目**全程无第二方复核**，属我单方记录。
3. 本文档按约定不含设计方案、选型建议与行动安排；若后续需要，需另行发起。
4. 需求侧存在两版副本（见第 13 节第 2 条）与一处用词未澄清（第 13 节第 3 条），**在澄清前，第 4 节"两种流程模型"哪一侧属于需求范围尚不能定**。
5. 第 10 节 8 项未验证，其中第 10 节第 1 项（写权限开关是否勾选）只能由你在 MCP 配置页确认，我无法代查。

## 结论（严格限定在已证实范围内）

- 飞书项目**确实存在官方 MCP Server**：`https://project.feishu.cn/mcp_server/v1`，服务端自报 48 个工具，`X-Mcp-Token` 鉴权，**读链路已实测打通**（`initialize` / `tools/list` / `list_todo` / `search_user_info`）。
- 「抓取专属于我的需求、缺陷」**已实测可用**，依据 `list_todo`（必填仅 `action`，服务端按当前用户过滤）。**任务类是否覆盖未证实**。
- 「显示」「流程推进」所需工具**存在性与参数契约已逐项核对**（第 5 节），但**执行行为全部未实测**；写操作一次都没跑过，且写权限开关状态未知。
- 已证实的硬约束（**限定 tools 层面**）：48 个工具中无任何数据变更推送/订阅类工具（第 6 节 6.1、6.2 两行），服务端侧 webhook 亦被官方 FAQ 明确"暂不支持"（第 6 节 6.3 行，属 OpenAPI 侧）。`resources`/`prompts` 能力未探测（第 10 节第 7 项）。
- 其余全部列于第 10 节，不作为结论。
