//! 本地文件位置解析。
//!
//! 配置与凭证都不进仓库：默认落在用户目录（Windows 用 `%APPDATA%` / `%LOCALAPPDATA%`），
//! 仓库内只保留 `config.example.toml` 这种不含真实凭证的样例。

use std::path::{Path, PathBuf};

use crate::error::BackendError;

/// 应用标识，用于拼接用户目录下的默认文件名。
pub const APP_DIR_NAME: &str = "FSTODO";

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
    Ok(base.join(APP_DIR_NAME))
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
    fn ensure_parent_dir_creates_tree() {
        let root = std::env::temp_dir().join(format!("fstodo-paths-{}", std::process::id()));
        let file = root.join("nested").join("x.db");
        ensure_parent_dir(&file).expect("应能创建父目录");
        assert!(root.join("nested").is_dir());
        let _ = std::fs::remove_dir_all(&root);
    }
}
