//! 由操作系统持有执行占用：进程退出会释放占用，但不抹去未核验的业务结果。
use std::{fs::{File, OpenOptions}, path::Path};

use fs2::FileExt;
use sha2::{Digest, Sha256};

use crate::{error::BackendError, store::Store};

pub(super) const OWNER_MARKER: &str = "workflow-execution:v1";

pub(super) struct ExecutionLease(Option<File>);

impl ExecutionLease {
    pub fn acquire(path: Option<&Path>, item: &str) -> Result<Self, BackendError> {
        let Some(path) = path else { return Ok(Self(None)); };
        let path = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        let root = path.with_extension("workflow-locks");
        std::fs::create_dir_all(&root).map_err(|_| BackendError::conflict("无法建立流程提交占用，本次未发送写入"))?;
        let file = OpenOptions::new().create(true).truncate(false).read(true).write(true)
            .open(root.join(format!("{:x}.lock", Sha256::digest(item.as_bytes()))))
            .map_err(|_| BackendError::conflict("无法建立流程提交占用，本次未发送写入"))?;
        file.try_lock_exclusive().map_err(|_| BackendError::conflict("该事项仍有流程提交正在执行，请等待结果后再操作"))?;
        Ok(Self(Some(file)))
    }
}

impl Drop for ExecutionLease {
    fn drop(&mut self) {
        if let Some(file) = &self.0 { let _ = FileExt::unlock(file); }
    }
}

/// 正常返回、错误返回或 panic 均收尾；进程被终止时由下次持有占用的请求恢复。
pub(super) struct PendingAction<'a> {
    pub store: &'a Store,
    pub request_id: &'a str,
}

impl Drop for PendingAction<'_> {
    fn drop(&mut self) {
        let _ = self.store.finish_action(self.request_id, "unknown", false,
            Some("提交执行已中断，结果尚未确认；请重新读取云端并核对草稿后再操作"), super::now_ms());
    }
}
