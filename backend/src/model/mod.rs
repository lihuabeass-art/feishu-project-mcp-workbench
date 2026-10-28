//! 数据模型分层。
//!
//! - [`raw`]：飞书接口侧结构，按响应原样承接，不做业务补全。
//! - [`domain`]：应用内部模型，保存身份、空间、类型、名称、排期与流程信息，
//!   并保留节点流与状态流的差异。
//! - [`source`]：工作来源配置；本轮只有「个人待办」一种来源可执行，
//!   其余只保留模型边界。
//!
//! 分层理由与字段取舍见 `docs/数据模型与接口契约.md`。

pub mod domain;
pub mod raw;
pub mod source;

pub use domain::{to_work_item, FlowInfo, FlowKind, RejectReason, Schedule, WorkItem, WorkItemId};
pub use raw::{RawTodoItem, RawTodoPage, RawTodoRecord};
pub use source::{PersonalTodoQuery, SourceKind, TodoAction, TodoScope, WorkSource};
