//! 同事项的后台详情读取与流程写入互斥；不同事项仍并行调度。
use std::{collections::HashMap, sync::{Arc, Mutex, OnceLock, Weak}};

use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};

use crate::{model::WorkItemId, store::Store};

#[derive(Hash, PartialEq, Eq)]
enum CacheIdentity {
    File(std::path::PathBuf),
    Memory(usize),
}

pub(crate) struct ItemAccess {
    guard: Option<OwnedMutexGuard<()>>,
    item: Arc<ItemLock>,
    writing: bool,
    pub waited_for_write: bool,
}

#[derive(Default)]
struct WriteState {
    revision: u64,
    active: bool,
}

#[derive(Default)]
struct ItemLock {
    gate: Arc<AsyncMutex<()>>,
    state: Mutex<WriteState>,
}

impl Drop for ItemAccess {
    fn drop(&mut self) {
        if self.writing {
            let mut state = self.item.state.lock().expect("item access state poisoned");
            state.active = false;
            // 与读取方的状态快照及 try_lock 同步，不能留下“写锁仍在但 active 已清空”的窗口。
            drop(self.guard.take());
        }
    }
}

pub(crate) async fn lock(store: &Store, id: &WorkItemId) -> ItemAccess {
    access(store, id, false).await
}

pub(crate) async fn lock_workflow(store: &Store, id: &WorkItemId) -> ItemAccess {
    access(store, id, true).await
}

async fn access(store: &Store, id: &WorkItemId, writing: bool) -> ItemAccess {
    static ITEMS: OnceLock<Mutex<HashMap<(CacheIdentity, WorkItemId), Weak<ItemLock>>>> = OnceLock::new();
    let cache = match &store.path {
        Some(path) => CacheIdentity::File(std::fs::canonicalize(path).unwrap_or_else(|_| path.clone())),
        None => CacheIdentity::Memory(store as *const Store as usize),
    };
    let key = (cache, id.clone());
    let item = {
        let mut items = ITEMS.get_or_init(Mutex::default).lock().expect("item access mutex poisoned");
        items.retain(|_, item| item.strong_count() > 0);
        match items.get(&key).and_then(Weak::upgrade) {
            Some(item) => item,
            None => {
                let item = Arc::new(ItemLock::default());
                items.insert(key, Arc::downgrade(&item));
                item
            }
        }
    };
    let (revision, active, ready) = {
        let state = item.state.lock().expect("item access state poisoned");
        (state.revision, state.active, item.gate.clone().try_lock_owned().ok())
    };
    let guard = match ready {
        Some(guard) => guard,
        None => item.gate.clone().lock_owned().await,
    };
    let waited_for_write = {
        let mut state = item.state.lock().expect("item access state poisoned");
        let crossed_write = active || revision != state.revision;
        if writing {
            state.revision += 1;
            state.active = true;
        }
        crossed_write
    };
    ItemAccess { guard: Some(guard), item, writing, waited_for_write }
}
