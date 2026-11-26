//! 本地文件位置解析。
//!
//! 配置与凭证都不进仓库：默认落在用户目录（Windows 用 `%APPDATA%` / `%LOCALAPPDATA%`），
//! 仓库内只保留 `config.example.toml` 这种不含真实凭证的样例。

use std::{path::{Path, PathBuf}, sync::OnceLock};

use crate::error::BackendError;

/// 应用标识，用于拼接用户目录下的默认文件名。
pub const APP_DIR_NAME: &str = "FSTODO";
const DEV_APP_DIR_NAME: &str = "FSTODO-dev";
static APP_DIRECTORY: OnceLock<&'static str> = OnceLock::new();

/// The desktop development binary selects its own storage before starting any application work.
pub fn use_development_data_directory() {
    assert_eq!(*APP_DIRECTORY.get_or_init(|| DEV_APP_DIR_NAME), DEV_APP_DIR_NAME);
}

pub(crate) fn uses_development_data_directory() -> bool {
    APP_DIRECTORY.get() == Some(&DEV_APP_DIR_NAME)
}

/// 配置文件默认名。
pub const CONFIG_FILE_NAME: &str = "config.toml";

/// 缓存库默认名。
pub const DB_FILE_NAME: &str = "fstodo.db";

/// 返回某类文件所在的用户目录。
///
/// Windows：优先 `%LOCALAPPDATA%`（数据库）与 `%APPDATA%`（配置）。
/// 其他平台：XDG 环境变量，缺失时退回 `~/.config`。
/// 这里刻意不引入 `directories` 依赖，逻辑足够小且可单测。
fn user_dir(kind: DirKind) -> Result<PathBuf, BackendError> {
    let env_first = |names: &[&str]| -> Option<PathBuf> {
        names
            .iter()
            .filter_map(std::env::var_os)
            .map(PathBuf::from)
            .find(|p| !p.as_os_str().is_empty())
    };
    let base = match kind {
        DirKind::Config => env_first(&[
            "APPDATA",
            "XDG_CONFIG_HOME",
        ])
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
        .or_else(|| std::env::var_os("USERPROFILE").map(|h| PathBuf::from(h).join("AppData").join("Roaming"))),
        DirKind::Data => env_first(&[
            "LOCALAPPDATA",
            "XDG_DATA_HOME",
        ])
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("share")))
        .or_else(|| std::env::var_os("USERPROFILE").map(|h| PathBuf::from(h).join("AppData").join("Local"))),
    };
    let base = base.ok_or_else(|| {
        BackendError::config("无法确定用户目录（APPDATA/LOCALAPPDATA/HOME 均不可用），请显式指定 --config/--db")
    })?;
    Ok(base.join(APP_DIRECTORY.get_or_init(|| APP_DIR_NAME)))
}

#[derive(Clone, Copy)]
enum DirKind {
    Config,
    Data,
}

/// 默认配置文件路径：`<用户配置目录>/FSTODO/config.toml`。
pub fn default_config_path() -> Result<PathBuf, BackendError> {
    Ok(user_dir(DirKind::Config)?.join(CONFIG_FILE_NAME))
}

/// 默认缓存库路径：`<用户数据目录>/FSTODO/fstodo.db`。
pub fn default_db_path() -> Result<PathBuf, BackendError> {
    Ok(user_dir(DirKind::Data)?.join(DB_FILE_NAME))
}

/// 若父目录不存在则创建，供 SQLite 打开前调用。
pub fn ensure_parent_dir(path: &Path) -> Result<(), BackendError> {
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent)
            .map_err(|e| BackendError::Store { detail: format!("无法创建目录 {}: {e}", parent.display()) })?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_paths_are_absolute_when_env_present() {
        // 本机（Windows/Linux/macOS）应能解析出绝对路径；纯环境变量缺失的环境由调用方兜底
        if std::env::var_os("LOCALAPPDATA").is_some() || std::env::var_os("XDG_DATA_HOME").is_some() {
            let p = default_db_path().expect("默认库路径可解析");
            assert!(p.is_absolute(), "默认库路径应为绝对路径: {}", p.display());
            assert!(p.ends_with(DB_FILE_NAME));
        }
    }

    #[test]
    fn desktop_development_storage_uses_a_separate_directory() {
        const TEST_DATA: &str = "FSTODO_DEVELOPMENT_STORAGE_TEST_ROOT";
        if let Some(root) = std::env::var_os(TEST_DATA) {
            let root = PathBuf::from(root);
            use_development_data_directory();
            let config = crate::Config::load(None, None).unwrap();
            assert_eq!(config.default_config_path, root.join("config/FSTODO-dev/config.toml"));
            assert_eq!(config.db_path, root.join("data/FSTODO-dev/fstodo.db"));
            assert!(config.loaded_from.is_none());
            assert_eq!(default_db_path().unwrap(), config.db_path);
            let release_db = root.join("data/FSTODO/fstodo.db");
            config.save_connection_settings(&crate::config::ConnectionSettings {
                endpoint: "https://example.com/test-mcp".into(),
            }).unwrap();
            assert_eq!(crate::Config::load(None, None).unwrap().endpoint, "https://example.com/test-mcp");
            let configured_path = release_db.to_string_lossy().replace('\\', "/");
            let release_config = root.join("config/FSTODO/config.toml");
            let configured_token_file = release_config.to_string_lossy().replace('\\', "/");
            let debug_toml = format!("db_path = {configured_path:?}\ntoken_file = {configured_token_file:?}\ntoken_env = {:?}\n", crate::DEFAULT_TOKEN_ENV);
            std::fs::write(&config.default_config_path, debug_toml).unwrap();
            let config = crate::Config::load(None, None).unwrap();
            assert_eq!(config.db_path, default_db_path().unwrap());
            assert_eq!(config.token_env, crate::config::DEVELOPMENT_TOKEN_ENV);
            assert!(config.token_file.is_none());
            let development = crate::api::Session::open(config).unwrap();
            assert!(development.config.db_path.is_file());
            assert_eq!(development.credential().unwrap_err().kind(), crate::ErrorKind::Credential);
            return;
        }

        let root = std::env::temp_dir().join(format!("fstodo-development-storage-{}", std::process::id()));
        std::fs::create_dir_all(root.join("config/FSTODO")).unwrap();
        std::fs::create_dir_all(root.join("data/FSTODO")).unwrap();
        std::fs::write(root.join("config/FSTODO/config.toml"), b"invalid release configuration").unwrap();
        let release = rusqlite::Connection::open(root.join("data/FSTODO/fstodo.db")).unwrap();
        release.execute_batch("CREATE TABLE fixture (value TEXT); INSERT INTO fixture VALUES ('release cache'); PRAGMA user_version=18;").unwrap();
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "paths::tests::desktop_development_storage_uses_a_separate_directory"])
            .env(TEST_DATA, &root)
            .env("APPDATA", root.join("config"))
            .env("LOCALAPPDATA", root.join("data"))
            .env(crate::DEFAULT_TOKEN_ENV, "release-fixture-token")
            .env_remove(crate::config::DEVELOPMENT_TOKEN_ENV)
            .output().unwrap();
        assert!(output.status.success(), "{}\n{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr));
        assert!(root.join("data/FSTODO-dev/fstodo.db").is_file());
        assert_eq!(release.query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0)).unwrap(), 18);
        assert_eq!(release.query_row("SELECT value FROM fixture", [], |row| row.get::<_, String>(0)).unwrap(), "release cache");
        assert_eq!(std::fs::read(root.join("config/FSTODO/config.toml")).unwrap(), b"invalid release configuration");
        drop(release);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn ensure_parent_dir_creates_tree() {
        let root = std::env::temp_dir().join(format!("fstodo-paths-{}", std::process::id()));
        let file = root.join("nested").join("x.db");
        ensure_parent_dir(&file).expect("应能创建父目录");
        assert!(root.join("nested").is_dir());
        let _ = std::fs::remove_dir_all(&root);
    }
}
