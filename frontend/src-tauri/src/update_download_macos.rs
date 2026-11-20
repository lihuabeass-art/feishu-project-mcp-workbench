//! Install the already verified archive using a same-volume atomic swap.
//! The swap strategy follows tauri-plugin-updater 2.13.2,
//! Copyright (c) 2017 - Present Tauri Apps Contributors.
//! Its MIT notice is included in THIRD_PARTY_NOTICES.md.

use std::io;

fn manual_install_message(error: &io::Error) -> String {
    format!("无法在当前位置自动安装更新（{error}），请从下载页面获取 DMG 并手动安装。")
}

#[cfg(target_os = "macos")]
fn swap_bundle(target: &std::path::Path, staged: &std::path::Path) -> io::Result<()> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    let target = CString::new(target.as_os_str().as_bytes())?;
    let staged = CString::new(staged.as_os_str().as_bytes())?;
    // RENAME_SWAP either exchanges both paths or leaves both unchanged.
    if unsafe { libc::renamex_np(staged.as_ptr(), target.as_ptr(), libc::RENAME_SWAP) } == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(target_os = "macos")]
pub(super) fn install(bytes: &[u8]) -> Result<(), String> {
    use std::{fs, os::unix::fs::MetadataExt};

    let executable = std::env::current_exe().map_err(|e| manual_install_message(&e))?;
    let target = executable
        .ancestors()
        .find(|path| path.extension().is_some_and(|ext| ext == "app"))
        .ok_or("无法确定当前应用的位置，请从下载页面获取 DMG 并手动安装。")?;
    let parent = target
        .parent()
        .ok_or("无法确定应用目录，请从下载页面获取 DMG 并手动安装。")?;
    let device = fs::symlink_metadata(target)
        .map_err(|e| manual_install_message(&e))?
        .dev();
    let system_temp = std::env::temp_dir();
    let stage_dir = [system_temp.as_path(), parent]
        .into_iter()
        .filter(|dir| {
            dir.metadata()
                .is_ok_and(|metadata| metadata.dev() == device)
        })
        .find_map(|dir| {
            tempfile::Builder::new()
                .prefix("fstodo-update-")
                .tempdir_in(dir)
                .ok()
        })
        .ok_or("无法在应用所在磁盘创建更新临时目录，请从下载页面获取 DMG 并手动安装。")?;

    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(bytes));
    archive
        .unpack(stage_dir.path())
        .map_err(|e| format!("解压更新包失败：{e}"))?;
    let mut bundles = fs::read_dir(stage_dir.path())
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .path()
                .extension()
                .is_some_and(|extension| extension == "app")
        });
    let staged = bundles.next().ok_or("更新包缺少应用")?.path();
    if bundles.next().is_some() || !staged.join("Contents/MacOS").is_dir() {
        return Err("更新包中的应用结构无效".into());
    }
    swap_bundle(target, &staged).map_err(|error| manual_install_message(&error))?;
    let _ = std::process::Command::new("touch").arg(target).status();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn swap_failure_explains_manual_installation() {
        let error = io::Error::new(io::ErrorKind::PermissionDenied, "permission denied");
        assert!(manual_install_message(&error).contains("DMG"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn atomic_swap_preserves_original_on_failure_and_replaces_on_success() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("target.app");
        let staged = dir.path().join("staged.app");
        std::fs::create_dir(&target).unwrap();
        std::fs::write(target.join("version"), b"old").unwrap();
        assert!(swap_bundle(&target, &staged).is_err());
        assert_eq!(std::fs::read(target.join("version")).unwrap(), b"old");
        std::fs::create_dir(&staged).unwrap();
        std::fs::write(staged.join("version"), b"new").unwrap();
        swap_bundle(&target, &staged).unwrap();
        assert_eq!(std::fs::read(target.join("version")).unwrap(), b"new");
        assert_eq!(std::fs::read(staged.join("version")).unwrap(), b"old");
    }
}
