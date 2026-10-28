use aes_gcm::aead::{rand_core::RngCore, OsRng};
use security_framework::os::macos::keychain::SecKeychain;

use crate::error::BackendError;

const SERVICE: &str = "cn.fstodo.desktop.credentials";
const ACCOUNT: &str = "token-encryption-key-v1";
const ITEM_NOT_FOUND: i32 = -25300;
const DUPLICATE_ITEM: i32 = -25299;

// 桌面 IPC 会反复新建 Session，密钥缓存必须由整个进程共享。
static KEY_CACHE: super::key_cache::KeyCache = super::key_cache::KeyCache::new();

pub(in crate::credentials) fn protect(data: &[u8]) -> Result<Vec<u8>, BackendError> {
    super::sealed::protect(&load_key(true)?, data)
}

pub(in crate::credentials) fn unprotect(data: &[u8]) -> Result<Vec<u8>, BackendError> {
    super::sealed::unprotect(&load_key(false)?, data)
}

fn load_key(create_if_missing: bool) -> Result<[u8; 32], BackendError> {
    KEY_CACHE.get_or_load(|| load_key_from_keychain(create_if_missing))
}

fn load_key_from_keychain(create_if_missing: bool) -> Result<Vec<u8>, BackendError> {
    let keychain = SecKeychain::default().map_err(keychain_error)?;
    match keychain.find_generic_password(SERVICE, ACCOUNT) {
        Ok((password, _)) => return Ok(password.as_ref().to_vec()),
        Err(error) if error.code() == ITEM_NOT_FOUND && create_if_missing => {}
        Err(error) => return Err(keychain_error(error)),
    }

    let mut key = [0; 32];
    OsRng.try_fill_bytes(&mut key)
        .map_err(|_| BackendError::credential("无法生成 macOS 凭证密钥，未保存 token"))?;
    // 仅新增，不覆盖：并发首次保存时由钥匙串决定唯一密钥，避免旧密文失效。
    match keychain.add_generic_password(SERVICE, ACCOUNT, &key) {
        Ok(()) => Ok(key.to_vec()),
        Err(error) if error.code() == DUPLICATE_ITEM => {
            let (password, _) = keychain.find_generic_password(SERVICE, ACCOUNT).map_err(keychain_error)?;
            Ok(password.as_ref().to_vec())
        }
        Err(error) => Err(keychain_error(error)),
    }
}

fn keychain_error(error: security_framework::base::Error) -> BackendError {
    BackendError::credential(format!(
        "无法访问 macOS 钥匙串（错误码 {}），请允许 FSTODO 访问钥匙串后重试；若密钥已删除，请重新保存 token",
        error.code()
    ))
}
