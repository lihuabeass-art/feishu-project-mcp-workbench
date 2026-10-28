//! 仅在进程内复用成功读取的 macOS 凭证密钥，避免每次解密都触发系统授权。
use std::sync::Mutex;

use crate::error::BackendError;

pub(super) struct KeyCache(Mutex<Option<[u8; 32]>>);

impl KeyCache {
    pub(super) const fn new() -> Self {
        Self(Mutex::new(None))
    }

    pub(super) fn get_or_load(
        &self,
        load: impl FnOnce() -> Result<Vec<u8>, BackendError>,
    ) -> Result<[u8; 32], BackendError> {
        // 持锁完成首次读取，让并发刷新共用一次成功授权。
        let mut cached = self.0.lock()
            .map_err(|_| BackendError::credential("macOS 凭证密钥缓存不可用，请重新打开 FSTODO"))?;
        if let Some(key) = *cached {
            return Ok(key);
        }
        // 失败或无效的密钥不缓存，用户解锁或重新授权后仍可重试。
        let key: [u8; 32] = load()?.try_into()
            .map_err(|_| BackendError::credential("macOS 钥匙串中的凭证密钥无效"))?;
        *cached = Some(key);
        Ok(key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Barrier};

    #[test]
    fn repeated_token_reads_and_replacement_share_one_keychain_access() {
        let cache = KeyCache::new();
        let accesses = AtomicUsize::new(0);
        let load = || {
            accesses.fetch_add(1, Ordering::SeqCst);
            Ok(vec![7; 32])
        };
        let first = super::super::sealed::protect(&cache.get_or_load(load).unwrap(), b"first-token").unwrap();
        for _ in 0..5 {
            assert_eq!(super::super::sealed::unprotect(&cache.get_or_load(load).unwrap(), &first).unwrap(), b"first-token");
        }
        let replacement = super::super::sealed::protect(&cache.get_or_load(load).unwrap(), b"replacement-token").unwrap();
        assert_eq!(super::super::sealed::unprotect(&cache.get_or_load(load).unwrap(), &replacement).unwrap(), b"replacement-token");
        assert!(super::super::sealed::unprotect(&cache.get_or_load(load).unwrap(), b"corrupted").is_err());
        assert_eq!(accesses.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn concurrent_first_reads_share_one_keychain_access() {
        let cache = Arc::new(KeyCache::new());
        let accesses = Arc::new(AtomicUsize::new(0));
        let start = Arc::new(Barrier::new(8));
        let threads: Vec<_> = (0..8).map(|_| {
            let cache = Arc::clone(&cache);
            let accesses = Arc::clone(&accesses);
            let start = Arc::clone(&start);
            std::thread::spawn(move || {
                start.wait();
                cache.get_or_load(|| {
                    accesses.fetch_add(1, Ordering::SeqCst);
                    Ok(vec![7; 32])
                }).unwrap()
            })
        }).collect();
        for thread in threads {
            assert_eq!(thread.join().unwrap(), [7; 32]);
        }
        assert_eq!(accesses.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn denied_or_invalid_keychain_reads_can_be_retried() {
        let cache = KeyCache::new();
        assert!(cache.get_or_load(|| Err(BackendError::credential("访问被拒绝"))).is_err());
        assert!(cache.get_or_load(|| Ok(vec![7; 31])).is_err());
        assert_eq!(cache.get_or_load(|| Ok(vec![8; 32])).unwrap(), [8; 32]);
        assert_eq!(cache.get_or_load(|| panic!("授权成功后不应再次访问钥匙串")).unwrap(), [8; 32]);
    }
}
