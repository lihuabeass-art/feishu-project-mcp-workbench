//! 凭证读取与脱敏。
//!
//! 页面设置的 token 使用 Windows DPAPI 或 macOS 钥匙串密钥加密，仅密文写入 SQLite 凭证表。
//! 优先使用已保存凭证，其次沿用环境变量、仓库外凭证文件；不写原文到配置或日志。

mod encrypted;

use std::path::{Path, PathBuf};

use crate::error::BackendError;
use crate::store::Store;

/// 凭证值包装：`Debug`/`Display` 永不携带原文。
#[derive(Clone, PartialEq, Eq)]
pub struct SecretToken(String);

impl SecretToken {
    pub fn new(raw: impl Into<String>) -> Self {
        Self(raw.into())
    }

    /// 原文仅供请求头、加密和错误脱敏使用，不通过 IPC 回传。
    pub fn expose(&self) -> &str {
        &self.0
    }

    pub fn len(&self) -> usize {
        self.0.chars().count()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// 可安全展示的摘要：只给长度，不给任何字符片段。
    pub fn masked(&self) -> String {
        format!("***（长度 {} 字符）", self.len())
    }
}

impl std::fmt::Debug for SecretToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "SecretToken({})", self.masked())
    }
}

impl std::fmt::Display for SecretToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("***")
    }
}

/// 凭证从哪来。排查时只暴露来源，不暴露值。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CredentialSource {
    Database,
    Env(String),
    File(PathBuf),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Credential {
    token: SecretToken,
    pub source: CredentialSource,
}

impl Credential {
    /// 构造请求头用的原文。
    pub fn token(&self) -> &SecretToken {
        &self.token
    }

    pub fn describe(&self) -> String {
        match &self.source {
            CredentialSource::Database => format!("本地加密凭证（{}）", self.token.masked()),
            CredentialSource::Env(name) => format!("环境变量 {name}（{}）", self.token.masked()),
            CredentialSource::File(p) => format!("凭证文件 {}（{}）", p.display(), self.token.masked()),
        }
    }
}

pub fn resolve_with_store(
    store: &Store,
    token_env: &str,
    token_file: Option<&Path>,
) -> Result<Credential, BackendError> {
    if let Some(ciphertext) = store.load_token_ciphertext()? {
        let plaintext = encrypted::unprotect(&ciphertext)?;
        let raw = String::from_utf8(plaintext)
            .map_err(|_| BackendError::credential("本地凭证内容损坏，请重新保存 token"))?;
        validate_token(&raw)?;
        return Ok(Credential { token: SecretToken::new(raw), source: CredentialSource::Database });
    }
    resolve(token_env, token_file)
}

pub fn save_token(store: &Store, raw: &str) -> Result<String, BackendError> {
    let token = raw.trim();
    validate_token(token)?;
    let ciphertext = encrypted::protect(token.as_bytes())?;
    store.save_token_ciphertext(&ciphertext)?;
    Ok(Credential { token: SecretToken::new(token), source: CredentialSource::Database }.describe())
}

fn validate_token(raw: &str) -> Result<(), BackendError> {
    if raw.is_empty() {
        return Err(BackendError::credential("token 不能为空"));
    }
    http::HeaderValue::from_str(raw)
        .map_err(|_| BackendError::credential("token 含有无效字符，请粘贴完整的 MCP token"))?;
    Ok(())
}

/// 解析凭证。找不到时给出的提示只讲怎么配置，不含任何猜测值。
pub fn resolve(token_env: &str, token_file: Option<&Path>) -> Result<Credential, BackendError> {
    if let Some(value) = std::env::var(token_env).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty()) {
        return Ok(Credential { token: SecretToken::new(value), source: CredentialSource::Env(token_env.into()) });
    }

    if let Some(path) = token_file {
        reject_unsafe_token_file(path)?;
        let text = std::fs::read_to_string(path).map_err(|e| {
            BackendError::credential(format!("读取凭证文件 {} 失败: {e}", path.display()))
        })?;
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Err(BackendError::credential(format!("凭证文件 {} 内容为空", path.display())));
        }
        return Ok(Credential {
            token: SecretToken::new(trimmed.to_string()),
            source: CredentialSource::File(path.to_path_buf()),
        });
    }

    let mut hint = format!("未找到凭证。请在「连接与配置」中保存 token，或设置环境变量 {token_env}");
    if token_file.is_none() {
        hint.push_str("，或在配置里设置 token_file 指向仓库外的凭证文件");
    }
    Err(BackendError::credential(hint))
}

/// 拒绝放在当前工作目录（典型即仓库目录）里的凭证文件。
///
/// 这是对「凭证不写入仓库」的机器兜底：仓库会被 `git add`、被打包、被贴进 issue，
/// 凭证文件一旦落在里面，泄露只是时间问题。
fn reject_unsafe_token_file(path: &Path) -> Result<(), BackendError> {
    let abs = path
        .canonicalize()
        .map_err(|e| BackendError::credential(format!("凭证文件 {} 无法定位: {e}", path.display())))?;

    let cwd = std::env::current_dir().ok().and_then(|c| c.canonicalize().ok());
    if let Some(cwd) = cwd {
        if abs.starts_with(&cwd) {
            return Err(BackendError::credential(format!(
                "凭证文件 {} 位于当前工作目录 {} 之内，可能随仓库一起提交；请把文件移到工作目录之外",
                abs.display(),
                cwd.display()
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(any(windows, target_os = "macos"))]
    #[test]
    #[cfg_attr(target_os = "macos", ignore = "需要可写且已解锁的默认钥匙串，CI 使用临时钥匙串执行")]
    fn encrypted_token_survives_reopen_and_overrides_external_credentials() {
        let dir = std::env::temp_dir().join(format!("fstodo-encrypted-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("credentials.db");
        let key = "FSTODO_ENCRYPTED_PRECEDENCE_TEST";
        std::env::set_var(key, "old-env-token");
        let raw = "test-only-token-never-store-as-plaintext";
        {
            let store = Store::open(&path).unwrap();
            let description = save_token(&store, &format!("  {raw}  ")).unwrap();
            assert!(!description.contains(raw));
            assert!(description.contains("***"));
            let ciphertext = store.load_token_ciphertext().unwrap().unwrap();
            assert!(!ciphertext.windows(raw.len()).any(|w| w == raw.as_bytes()));
            assert!(save_token(&store, "\r\n").is_err());
            assert!(save_token(&store, "bad\nheader").is_err());
        }
        let store = Store::open(&path).unwrap();
        let credential = resolve_with_store(&store, key, None).unwrap();
        assert_eq!(credential.token().expose(), raw);
        assert_eq!(credential.source, CredentialSource::Database);
        save_token(&store, "replacement-token").unwrap();
        assert_eq!(resolve_with_store(&store, key, None).unwrap().token().expose(), "replacement-token");
        store.save_token_ciphertext(b"corrupted encrypted blob").unwrap();
        assert!(resolve_with_store(&store, key, None).is_err(), "损坏凭证不得静默退回旧环境变量");
        drop(store);
        let db_bytes = std::fs::read(&path).unwrap();
        assert!(!db_bytes.windows(raw.len()).any(|w| w == raw.as_bytes()));
        std::env::remove_var(key);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn secret_never_prints_itself() {
        let s = SecretToken::new("super-secret-token-value");
        assert!(!format!("{s:?}").contains("super-secret"));
        assert!(!s.to_string().contains("super-secret"));
        assert_eq!(s.expose(), "super-secret-token-value");
        assert_eq!(s.len(), 24);
        assert!(s.masked().contains("24"), "摘要只给长度: {}", s.masked());
        assert!(!s.masked().contains("secret"), "摘要也不得含任何片段: {}", s.masked());
    }

    #[test]
    fn env_is_preferred_and_trimmed() {
        let key = "FSTODO_TEST_TOKEN_ENV_PRECEDENCE";
        std::env::set_var(key, "  token-from-env\n");
        let c = resolve(key, None).unwrap();
        assert_eq!(c.token().expose(), "token-from-env");
        assert!(matches!(c.source, CredentialSource::Env(_)));
        assert!(!c.describe().contains("token-from-env"), "描述信息不得回显凭证: {}", c.describe());
        std::env::remove_var(key);
    }

    #[test]
    fn missing_credential_is_explicit() {
        let e = resolve("FSTODO_DEFINITELY_UNSET_TOKEN", None).unwrap_err();
        assert_eq!(e.kind(), crate::error::ErrorKind::Credential);
        let msg = e.to_string();
        assert!(msg.contains("FSTODO_DEFINITELY_UNSET_TOKEN"), "提示要给出可操作的变量名: {msg}");
    }

    #[test]
    fn empty_credential_file_is_an_error() {
        let dir = std::env::temp_dir().join(format!("fstodo-cred-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("token.txt");
        std::fs::write(&file, "\n   \n").unwrap();
        // 临时目录不在当前工作目录内，因此这里测的是「空内容」而不是「位置不安全」
        let e = resolve("FSTODO_UNSET_TOKEN_FOR_FILE_TEST", Some(&file)).unwrap_err();
        assert_eq!(e.kind(), crate::error::ErrorKind::Credential);
        assert!(e.to_string().contains("内容为空"), "应报空内容: {e}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn credential_file_inside_cwd_is_rejected() {
        let file = std::env::current_dir().unwrap().join("fstodo-token-inside-cwd.txt");
        std::fs::write(&file, "x").unwrap();
        let e = resolve("FSTODO_UNSET_TOKEN_FOR_CWD_TEST", Some(&file)).unwrap_err();
        assert_eq!(e.kind(), crate::error::ErrorKind::Credential);
        assert!(e.to_string().contains("当前工作目录"), "应说明位置风险: {e}");
        let _ = std::fs::remove_file(&file);
    }
}
