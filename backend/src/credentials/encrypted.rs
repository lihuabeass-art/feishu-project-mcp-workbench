//! 操作系统管理凭证密钥，不与数据库一起保存。
#[cfg(not(target_os = "macos"))]
use crate::error::BackendError;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(any(target_os = "macos", test))]
mod key_cache;
#[cfg(any(target_os = "macos", test))]
mod sealed;

#[cfg(target_os = "macos")]
pub(super) use macos::{protect, unprotect};

#[cfg(windows)]
pub(super) fn protect(data: &[u8]) -> Result<Vec<u8>, BackendError> {
    transform(data, true)
}

#[cfg(windows)]
pub(super) fn unprotect(data: &[u8]) -> Result<Vec<u8>, BackendError> {
    transform(data, false)
}

#[cfg(windows)]
fn transform(data: &[u8], encrypt: bool) -> Result<Vec<u8>, BackendError> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let input = CRYPT_INTEGER_BLOB {
        cbData: data.len().try_into().map_err(|_| BackendError::credential("凭证内容过长"))?,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB { cbData: 0, pbData: null_mut() };
    // SAFETY: input 指向本次调用期间有效的字节，output 由 DPAPI 分配并在复制后 LocalFree。
    // 不设置 CRYPTPROTECT_LOCAL_MACHINE，密文绑定当前 Windows 用户。
    let success = unsafe {
        if encrypt {
            CryptProtectData(&input, null(), null(), null(), null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        } else {
            CryptUnprotectData(&input, null_mut(), null(), null(), null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        }
    };
    if success == 0 {
        return Err(BackendError::credential(if encrypt {
            "Windows 凭证加密失败，未保存 token"
        } else {
            "无法解密本地凭证，请使用原 Windows 用户登录或重新保存 token"
        }));
    }
    // SAFETY: 成功的 DPAPI 输出有效，复制后清除原缓冲区，避免解密原文留在系统分配内存中。
    let result = unsafe {
        let bytes = std::slice::from_raw_parts_mut(output.pbData, output.cbData as usize);
        let result = bytes.to_vec();
        for byte in bytes {
            std::ptr::write_volatile(byte, 0);
        }
        LocalFree(output.pbData.cast());
        result
    };
    Ok(result)
}

#[cfg(not(any(windows, target_os = "macos")))]
pub(super) fn protect(_: &[u8]) -> Result<Vec<u8>, BackendError> {
    Err(BackendError::credential("本地加密凭证目前仅支持 Windows 和 macOS"))
}

#[cfg(not(any(windows, target_os = "macos")))]
pub(super) fn unprotect(_: &[u8]) -> Result<Vec<u8>, BackendError> {
    Err(BackendError::credential("本地加密凭证目前仅支持 Windows 和 macOS"))
}
