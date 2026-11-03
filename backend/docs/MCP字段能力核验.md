# MCP 字段能力核验记录（2026-11-03）

飞书官方 CLI 文档与当前 MCP 服务存在能力描述冲突。文档用于定位协议，字段是否可写必须结合当前连接的工具声明、真实配置和相同业务范围的写后回读判断；禁止仅根据文档黑名单撤掉本地已有能力。维护要求见仓库 `AGENTS.md` 的“字段能力以当前连接的实测为准”。

## 本次排查范围与证据

对用户指定的两个已缓存事项分别读取完整的两页节点详情，均为 21 个节点，并核对当前进行中节点的未完成必填项、字段配置和 `tools/list`。两项模板的字段分布一致：8 个设计／研发／测试节点涉及工时等排期指标，8 个评审／发布／验收节点涉及系统负责人完成信息，其余 5 个节点涉及需求名称／图文、版本、迭代和人员角色。历史台账仅用于定位已有行为，不能把一次整体动作成功推断成每个字段都写入成功。

本次修复期间的真实远端操作均为读取。新增写入路径用隔离的模拟连接验证协议、回读和阻断行为，未对用户事项做试写、上传或流程推进；真实业务提交仍以运行时的同范围回读为最终依据。

| 字段／范围 | 官方说明与当前证据 | 本地处理 |
| --- | --- | --- |
| 实际工时 `actual_work_time` | 节点 SOP §4.3 列为不可写；当前 `update_node` schema 却明确声明 `node_schedule.actual_work_time`、`schedules[].actual_work_time`，旧版已有对应编辑及核验路径 | 恢复非负数字编辑和旧草稿身份；按真实负责人增量更新并回读，不能列入页面专有黑名单 |
| 系统 `owners_finished_info` 及负责人完成结论／意见 | 真实历史调用拒绝 `invalid owners_finished_info value`，官方也列为页面填写 | 只读，仍缺必填时引导飞书；不把限制扩大到普通复合字段或工时 |
| 节点整体 `node_finished_conclusion`／`node_finished_opinion` | SOP §4.2 提供更新协议，并提示合并更新可能只写第一项 | 两字段分别调用，均须回读；与负责人完成信息区分 |
| 富文本 `multi-text` | 字段协议支持扩展 Markdown；当前图片协议保留 `![名称](url)<!--file_token-->` | 图文编辑、稳定草稿、实际事项／字段上传与预览；未知结构保留只读原值 |
| 关联单选／多选 | 真实字段配置给出目标空间和类型；官方字段协议分别使用 ID 字符串、数字 ID 数组的 JSON 字符串 | 配置范围内搜索和名称选择，禁止关联自己；回读核对 ID |
| 人员与角色 | `user`／`multi-user` 使用用户 Key；角色用 `role_operate` | 人员选择；角色按成员 add/remove 差异，不清空其他角色或删除角色定义 |
| 普通多人复合字段 | 当前服务声明按负责人增量操作，不能套用系统完成信息的限制 | 保留 `operation_type=1` 与完整父路径、负责人回读规则 |

`tools/list` 只证明服务声明了参数，模拟通过只证明本地行为符合所测契约，`success` 只证明收到成功回执；均不能替代真实字段回读。无法核验时保留草稿与待核实状态，不自动重发写请求。

## 官方调查入口

- [节点流转 SOP](https://github.com/larksuite/meegle-cli/blob/main/skills/meegle/references/sop-transition-node.md)：§4.2 的整体节点完成字段与 §4.3 的禁止名单须交叉核对，工时名单已与当前工具声明冲突。
- [工作项更新 SOP](https://github.com/larksuite/meegle-cli/blob/main/skills/meegle/references/sop-update-workitem.md)：工作项字段与角色更新入口。
- [字段值格式](https://github.com/larksuite/meegle-cli/blob/main/skills/meegle/SKILL.md#字段值格式field_value)：人员、关联、多选、图文等编码参考。

后续发现冲突时，在此记录具体字段、接口参数、核验日期和证据等级。新增示例、回归及公开文档不得复制真实事项 ID、账号、凭证、业务正文或 log ID。
