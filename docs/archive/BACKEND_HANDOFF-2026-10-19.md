# 后端接口补充交接 · 2026-10-19

> 历史交接记录：保留 2026-10-19 至 2026-10-20 的提案、实现与验收过程，旧接口范围、配置闸门和测试数量不作为当前行为说明。当前入口见[文档索引](../README.md)。

> 2026-10-20 后续实现：新增 `cached_item_detail({itemId})`、`refresh_item_detail({itemId})`、`discover_source_fields({projectKey,typeKey})`、`save_work_source({source})`，快照能力位增加 `source_queries` / `details`；`sync_todos` 的 sourceId 为 `*` 时同步所有已启用来源。类型/普通视图来源与人员、自定义关联规则已执行落地，契约与实测结果见 [工作来源与详情补全](../../backend/docs/工作来源与详情补全.md)。

> 节点填写后续实现：字段 kind 增加 `number` / `date`，并增加可选 `initial_value` / `hint` / `min` / `max`。本机自动草稿、提交内容核对、显式二次确认，以及字段更新后再推进已实现；此前只支持回滚原因的限制以 [节点填写与草稿](../../backend/docs/节点填写与草稿.md) 为准。真实写入尚未验收。

本轮需求：用户自主选择类型、类型可重命名但只作显示别名；详情支持实际流程操作；每 2 分钟自动同步；去掉同步记录页面、统计卡片和「栖」字；手动同步成功用 5 秒悬浮提示，自动同步成功静默，失败持久提示并限制重试。本文是前后端接入约定提案，不代表写侧已实测。

## 现状与职责

前端只修改 `frontend/src` 及前端文档，不修改后端库或 Tauri Rust 桥接。现有 IPC 为 `load_snapshot`、`sync_todos({ sourceId })`、`check_connection`、`save_token({ token })`。现有 `sync_todos` 可直接供自动同步复用；`Ok(report)` 不等于成功，需同时满足 `status === "success" && complete && items_rejected === 0` 才恢复正常周期。

> 本节及以下 P0/P1 小节是**交接当时**的现状与提案，最终实现结果见文末「后端实现结果（同日，2026-10-19）」——三项都已落地，本节保留作契约与验收口径的来源。

交接当时的现状：后端只执行 personal_todo；`work_item_type` / `view` 虽可配置但不可执行。流程没有读动作或执行动作接口，缓存也没有可靠 node_id、transition_id。因此前端不能根据节点名称猜出写入参数。

## P0：流程动作（前端已按下述契约预接入）

`load_snapshot` 增加可选字段 `capabilities: { workflow: boolean }`。只有可用且完成写侧验证时才返回 true；旧后端不返回该字段时前端保留可读详情并显示简短接入状态，不发不存在的 IPC。

### `get_workflow_actions({ itemId })`

`itemId` 使用缓存原始复合身份：`{ project_key: string, work_item_type_key: string, work_item_id: string }`，不可接受别名代替类型 key。返回：

```ts
interface WorkflowOptions {
  version: string; // 本次远端流程快照版本，供执行时检查冲突
  actions: Array<{
    id: string; // 后端生成的不透明动作标识，绑定节点/状态与实际操作参数
    label: string; // 具体含义，例如「完成研发节点」「转为修复中」
    kind: "node" | "state";
    description?: string;
    disabled_reason?: string; // 没权限等；不可用动作不允许执行
    fields: Array<{
      key: string;
      label: string;
      kind: "text" | "textarea" | "select";
      required: boolean;
      options?: Array<{ value: string; label: string }>;
    }>;
  }>;
}
```

节点流需从真实详情取得 node_id 和允许的 action；状态流通过 `get_transitable_states` 取得 transition_id，并核对必填信息。名称不作 ID；`both` 不能合成一个“完成”动作。没有动作返回空数组。暂不支持的复杂字段应把动作标为 disabled 并说明原因，不能丢弃必填字段后执行。

### `execute_workflow_action({ request })`

```ts
interface WorkflowRequest {
  item_id: { project_key: string; work_item_type_key: string; work_item_id: string };
  action_id: string;
  version: string;
  request_id: string; // 单次提交的幂等键
  fields: Record<string, string>;
}
interface WorkflowResult {
  verified: boolean; // 只有远端成功且回读核验成功才为 true
  message: string;   // 已脱敏、可直接展示的结果
}
```

后端必须：检查身份、动作权限、必填字段及 version；绑定动作实际 MCP 参数；同 request_id 不重复写；成功后回读事项并更新缓存，才能返回 verified=true。写入成功但回读失败/网络超时结果不明时，返回明确的结果不明信息（verified=false 或结构化错误），不要宣称失败后自动重试写操作。流程操作不进入自动同步重试逻辑。前端一次只发一笔、用户在内联确认页核对具体动作后提交，返回后重读缓存和动作；结果不明后关闭本次提交入口，必须重新读取动作再操作。

Tauri command 参数用 camelCase（`itemId`），request 内部字段按上述 snake_case 序列化。错误延续 `{ kind, message }` 并脱敏，可补充 `conflict` / `validation` / `permission` / `unknown_result` 分类。

## P0：类型发现与真实同步范围（需后端补充，前端当前仅管理显示范围）

本轮前端使用本机 localStorage 保存缓存类型的 enabled/alias，原始 key 及缓存不变。勾选决定列表/侧栏展示，不会假装缩小远端抓取范围。所有已知类型都取消后展示空态；新出现类型默认显示。别名留空恢复默认显示名。

真正支持“自行选择远端工作类型”需要：

1. `list_work_item_types({ projectKey })` → `{ project_key, types: [{ key, name, executable, reason }] }`：从真实可访问空间发现类型（包含尚无缓存的类型），不能硬编码仅 story/issue。
2. `save_source_types({ sourceId, selections })`，selections 为 `[{ project_key, work_item_type_key }]`：持久化同步范围，验证空间和类型权限并返回更新后的 Source。不能把展示别名写入源 key；明确空选择表示不抓取，禁止退化成“全部”。
3. `load_snapshot.sources` 增加真实选中范围；同步按范围请求/筛选，并保持“与我相关”的已验证语义。若不同空间同 key 类型含义不同，发现/范围按 `(project_key, work_item_type_key)` 区分。

别名目前以原始 type key 为本机显示偏好，若需要跨窗口共享或随数据库迁移，可后续提供 `load_type_preferences` / `save_type_preferences`（enabled、alias 与原始身份分开）。不要让该增强阻塞当前显示别名。

## P1：同步日志、诊断与服务端互斥

移除的是用户界面的“同步记录”入口和列表，不删除现有 SQLite sync_run。请保留每次同步的统计、结束原因、脱敏错误，供诊断使用；建议增加 trigger（manual/automatic）、source_id、run_id，以及日志轮转/保留上限，避免每 2 分钟运行导致无限增长。现阶段前端不新增日志 IPC，继续使用已有运行记录作为后端诊断数据。

自动同步在前端窗口存活且凭证就绪、选中可执行来源时启用；首次等 2 分钟，单次完成后再计时，不重叠、不补跑错过周期。正常 2 分钟；失败后 4、8 分钟；连续第 3 次失败暂停。auth/credential/config/not_implemented 立即暂停。失败/未完成/拒绝条目/回读缓存失败均按失败处理；失败状态按来源保存在本机，重启不绕过暂停。用户手动同步成功才清除暂停并恢复正常周期；来源切换使用各自状态。自动成功不弹提示，手动完整成功悬浮 5 秒；失败保持页面内单条提示可关闭，暂停状态仍在同步区可见。

前端仅保证单窗口互斥；请后端按账户/来源保证跨窗口/CLI 同步互斥并对远端调用设置合理超时。未来如需关闭窗口后同步，应转由后端调度，届时关闭前端定时器，避免双重调度。

## 联调验收

- 用真实节点流、状态流分别验证动作、权限不足、必填原因、并发版本冲突；写后回读一致才显示完成；结果不明不自动重复写。
- 新类型无缓存也能发现并纳入来源，别名修改前后请求的类型 key 完全一致。
- 自动同步正常/未完成/异常/鉴权失败各有诊断记录；没有同步历史 UI；自动成功没有 toast，手动成功 5 秒消失，失败按退避/暂停规则处理。
- 旧 snapshot 缺少 capabilities 时界面正常，不调用不存在的流程命令。

---

# 后端实现结果（同日，2026-10-19）

三项都已完成，只读侧用真实凭据测过；**写侧一次都没执行**，验收手册在
[`backend/docs/写侧验收手册.md`](../../backend/docs/写侧验收手册.md)。

## 已注册的 IPC

| 命令 | 参数 | 返回 |
|---|---|---|
| `get_workflow_actions` | `{ itemId }`（缓存原始复合身份） | `{ version, actions[] }` |
| `execute_workflow_action` | `{ request }` | `{ outcome, verified, message, request_id, action_id, resynced }` |

`load_snapshot` 现在恒返回 `capabilities: { workflow: boolean }`，取值就是 `config.workflow_enabled`，
**默认 true**。关闭时上面两个命令本身就会返回配置错误（不是只靠前端不调用），
所以配置设为 false 后，界面无论怎么点都改不到飞书数据。在
`%APPDATA%\FSTODO\config.toml` 写 `workflow_enabled = true` 并重启即可打开。

## 与本提案的差异（以代码为准）

1. `WorkflowResult` 比提案多了 `outcome`（`verified|failed|unknown`）、`request_id`、`action_id`、
   `resynced`。`outcome` 才是结论；`verified` 保留是给只认这一个字段的老调用方。
   写请求一旦发出就只有 `verified` 与 `unknown` 两种产出——把「不知道改没改成」说成
   `failed` 等于催用户重试写。`failed` 变体保留给台账里的历史/人工行。
   前端 `types.ts` / `api.ts` / `App.tsx` 已按此对齐（unknown 走错误条 + 「不要直接重试」）。
2. **类型发现与同步范围没有做成 IPC**。提案里的 `list_work_item_types` / `save_source_types`
   以后端方法 + CLI 形式落地：`fstodo types refresh|list|use`（`api::Session::refresh_source_types`
   / `source_types` / `source_type_scope` / `set_source_type_scope`）。
   界面上的类型勾选仍是本机显示偏好（localStorage，原始 key 不变），**不改变远端抓取范围**。
   要给界面加「管理同步范围」时，后端已就绪，只缺一层薄 IPC 和 `load_snapshot` 的范围字段。
3. 空间清单只能从**本地缓存里出现过的 `project_key`** 枚举——MCP 没有「列出我有权限的全部空间」
   的工具（`search_project_info` 必须给空间名）。所以新空间要先同步到它的事项，才会出现在类型清单里。
4. 范围筛选发生在**本地**（`list_todo` 取回之后再筛），被筛掉的数量单独记成 `items_out_of_scope`，
   与 `items_rejected` 分开；「确认过但选了空集」不会被当成「没配置」而退化成全量。
5. 同步日志：`sync_run` 增加 `trigger`（manual/automatic）、`source_id`，`run_id` 即行 id；
   轮转按 `sync_run_retention`（默认 200，0/负数=不清理）。前端未新增日志 IPC（与提案一致）。
6. 动作 id 的拼法（不透明串，前端只回传不解析）：`node:confirm:<node_key>`、
   `node:rollback:<node_key>`、`state:<transition_id>:<target_key>`；
   `version` 是覆盖「动作集合 + 各自写参数」的指纹 `v1:<16 位 hex>`，不匹配就在写之前拒绝。
7. `fields` 支持节点表单及状态流缺失必填项，前端复用本机草稿、字段校验及二次确认。
   状态流单选选项来自远端 `option_id/option_name`；控件和核对页展示名称，请求传 ID。
   后端先更新并回读字段、检查必填及原流转仍可用，再推进流程；不支持的类型带
   `disabled_reason`。字段已保存而流转结果不明时保留草稿和提交标记，不直接重试。
8. 旧后端不返回 `capabilities` 时前端行为不变（保留只读详情，不发不存在的 IPC）。
9. 写闸门 `workflow_enabled` 由 **CLI 与桌面端共用**，默认 true；显式设为 false 时 `fstodo workflow run --yes`
   与两个流程 IPC 都直接返回配置错误（CLI 退出码 6），不发请求也不落台账。干跑（不带 `--yes`）
   不需要开开关。写侧验收步骤见[写侧验收手册](../../backend/docs/写侧验收手册.md)。

## 只读实测（真实凭据）

> 公开整理说明：下述真实只读实测中的远端标识已匿名化；`STORY_EXAMPLE_ID`、`ISSUE_EXAMPLE_ID`、`state_example` 及 `10001` / `10002` 均是说明用示例，不可用于真实调用。

节点流 `STORY_EXAMPLE_ID`：21 个节点分 2 页取回，进行中节点 `state_example` 缺 `schedule`/`point`/`actual_work_time`
⇒「完成节点」DISABLED 并列出这三个字段；10 个已完成节点各出一条回滚动作。
状态流 `ISSUE_EXAMPLE_ID`：`10001→CLOSED`（缺必填「详情描述」⇒ DISABLED）、`10002→REOPENED`（可执行）。
类型发现：13 个类型，`is_disable` 恒为 `2`（语义未验证 ⇒ 不参与过滤）。
完整事实与判定依据见 [`backend/docs/运行与验证.md`](../../backend/docs/运行与验证.md) 第 6 节。

---

# 前端桌面接入结果（2026-10-20）

已复用上述后端方法补齐薄 IPC，前文「尚未接入」描述保留作交接时点记录。后端库与流程写闸门未改动。

| 命令 | 参数 | 返回 |
|---|---|---|
| `refresh_source_types` | `{ sourceId }` | `{ discovered_count, failed: [[project_key, message]] }` |
| `save_source_types` | `{ sourceId, typeKeys: string[] }`（原始类型 key） | 保存的空间与类型组合数；空数组明确表示不接收新事项 |
| `clear_source_types` | `{ sourceId }` | 是否清除了已配置范围；恢复接收全部类型 |
| `sync_todos` | `{ sourceId, automatic?: boolean }` | 原同步报告；缺省为手动，自动任务显式传 true |

`load_snapshot.sources[].type_scope` 现在返回 `configured`、`selected_count`、`types[]`；
类型条目含 `project_key`、`project_name`、`type_key`、`type_name`、`selected`。
`configured=false` 与 `configured=true, selected_count=0` 分别表示全部与明确选空。

「工作来源」可发现并保存所选来源的范围；相同原始类型 key 跨已发现空间一并选择，
不宣称支持任意空间与类型组合。发现仅覆盖缓存中已出现的空间，筛选不减少远端请求，
历史缓存继续保留。显示勾选、别名与同步选择合并在同一个「工作类型」列表中；显示勾选与别名仍是独立的本机偏好，别名不会写入同步范围。侧栏、清单与详情复用发现的类型名称，自定义别名优先；所有保存与筛选仍使用原始类型 key。
部分发现失败保留已发现清单并提示失败空间；保存失败保留草稿。流程写侧仍遵循原验收手册，
本轮前端接入不执行真实流程写请求。
