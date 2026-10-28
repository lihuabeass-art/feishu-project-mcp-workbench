//! macOS 凭证密文格式；密钥由钥匙串提供。
use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng, Payload};
use aes_gcm::{Aes256Gcm, Nonce};

use crate::error::BackendError;

const HEADER: &[u8] = b"FSTODO-MAC-1";
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;

pub(super) fn protect(key: &[u8], data: &[u8]) -> Result<Vec<u8>, BackendError> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| BackendError::credential("macOS 钥匙串中的凭证密钥无效"))?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher.encrypt(&nonce, Payload { msg: data, aad: HEADER })
        .map_err(|_| BackendError::credential("macOS 凭证加密失败，未保存 token"))?;
    Ok([HEADER, nonce.as_slice(), &ciphertext].concat())
}

pub(super) fn unprotect(key: &[u8], data: &[u8]) -> Result<Vec<u8>, BackendError> {
    if data.len() < HEADER.len() + NONCE_LEN + TAG_LEN || !data.starts_with(HEADER) {
        return Err(BackendError::credential("本地凭证格式无效，请重新保存 token"));
    }
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| BackendError::credential("macOS 钥匙串中的凭证密钥无效"))?;
    let nonce = Nonce::from_slice(&data[HEADER.len()..HEADER.len() + NONCE_LEN]);
    cipher.decrypt(nonce, Payload { msg: &data[HEADER.len() + NONCE_LEN..], aad: HEADER })
        .map_err(|_| BackendError::credential("无法解密本地凭证，请使用原 macOS 用户登录或重新保存 token"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ciphertext_round_trips_with_unique_nonces_and_no_plaintext() {
        let key = [7; 32];
        let token = b"test-only-mcp-token-not-for-production";
        let first = protect(&key, token).unwrap();
        let second = protect(&key, token).unwrap();
        assert_ne!(first, second);
        assert!(!first.windows(token.len()).any(|bytes| bytes == token));
        assert_eq!(unprotect(&key, &first).unwrap(), token);
        assert_eq!(unprotect(&key, &second).unwrap(), token);
    }

    #[test]
    fn wrong_key_tampering_and_truncated_envelopes_are_rejected() {
        let blob = protect(&[7; 32], b"test-token").unwrap();
        assert!(unprotect(&[8; 32], &blob).is_err());
        for length in 0..blob.len() {
            assert!(unprotect(&[7; 32], &blob[..length]).is_err());
        }
        for index in 0..blob.len() {
            let mut changed = blob.clone();
            changed[index] ^= 1;
            assert!(unprotect(&[7; 32], &changed).is_err());
        }
        assert!(protect(&[0; 31], b"test-token").is_err());
        assert!(unprotect(&[0; 31], &blob).is_err());
    }
}
