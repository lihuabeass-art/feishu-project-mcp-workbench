//! Retire Windows updater installers after the installed application starts.
//! The 2.9.0 plugin leaves these directories behind when it exits to run NSIS.
use semver::Version;
use std::{
    fs::{self, Metadata, OpenOptions},
    io::{self, Read, Seek, SeekFrom, Write},
    os::windows::fs::{MetadataExt, OpenOptionsExt},
    path::{Path, PathBuf},
};

#[derive(Debug)]
struct Candidate {
    directory: PathBuf,
    installer_name: String,
}

/// Debug builds must not clean up a user's installed application's updates.
#[cfg(not(debug_assertions))]
pub fn schedule(current_version: Version, data_dir: PathBuf) {
    use std::time::Duration;

    tauri::async_runtime::spawn(async move {
        // Capture once, before waiting: a later update in this run must not
        // become a cleanup candidate, even when an earlier installer is busy.
        let Ok(Ok(Some(mut pending))) = tauri::async_runtime::spawn_blocking(move || {
            prepare_cleanup(&std::env::temp_dir(), &data_dir, &current_version)
        })
        .await
        else {
            return;
        };
        for delay in [5, 15, 60] {
            if pending.is_empty() {
                break;
            }
            // NSIS can relaunch the application just before releasing its exe.
            tokio::time::sleep(Duration::from_secs(delay)).await;
            let Ok(remaining) =
                tauri::async_runtime::spawn_blocking(move || cleanup_pass(pending)).await
            else {
                return;
            };
            pending = remaining;
        }
        // Remaining busy/inaccessible files wait until the next new version.
        // Ordinary launches of this version never scan the temp directory again.
    });
}

fn prepare_cleanup(
    root: &Path,
    data_dir: &Path,
    current_version: &Version,
) -> io::Result<Option<Vec<Candidate>>> {
    fs::create_dir_all(data_dir)?;
    // A stable per-user marker survives upgrades. Exclusive sharing prevents
    // simultaneous launches from scheduling duplicate cleanup runs.
    let mut marker = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .share_mode(0)
        .open(data_dir.join("updater-cleanup-version"))?;
    let mut saved = String::new();
    marker.read_to_string(&mut saved)?;
    if Version::parse(saved.trim())
        .is_ok_and(|previous| !current_version.cmp_precedence(&previous).is_gt())
    {
        return Ok(None);
    }
    let candidates = collect_candidates(root, current_version)?;
    // Record that this version has scheduled its one cleanup run, including
    // when there are no leftovers. Closing early must not trigger another scan.
    marker.set_len(0)?;
    marker.seek(SeekFrom::Start(0))?;
    marker.write_all(current_version.to_string().as_bytes())?;
    marker.sync_data()?;
    Ok(Some(candidates))
}

fn installer_name(directory_name: &str, current_version: &Version) -> Option<String> {
    let (version, random) = directory_name
        .strip_prefix("FSTODO-")?
        .rsplit_once("-updater-")?;
    // tempfile's historical and current directory suffix is six ASCII bytes.
    if random.len() != 6 || !random.bytes().all(|byte| byte.is_ascii_alphanumeric()) {
        return None;
    }
    let parsed = Version::parse(version).ok()?;
    if parsed.cmp_precedence(current_version).is_gt() {
        return None;
    }
    Some(format!("FSTODO-{version}-installer.exe"))
}

fn is_reparse_point(metadata: &Metadata) -> bool {
    // Includes directory junctions as well as file/directory symbolic links.
    metadata.file_attributes() & 0x400 != 0 // FILE_ATTRIBUTE_REPARSE_POINT
}

fn collect_candidates(root: &Path, current_version: &Version) -> io::Result<Vec<Candidate>> {
    // All deletion paths are direct children of the resolved system temp root.
    let root = fs::canonicalize(root)?;
    let mut candidates = Vec::new();
    for entry in fs::read_dir(&root)? {
        let Ok(entry) = entry else { continue };
        let name = entry.file_name();
        let Some(installer_name) = name
            .to_str()
            .and_then(|name| installer_name(name, current_version))
        else {
            continue;
        };
        let Ok(metadata) = fs::symlink_metadata(entry.path()) else {
            continue;
        };
        if metadata.is_dir() && !is_reparse_point(&metadata) {
            candidates.push(Candidate {
                directory: root.join(name),
                installer_name,
            });
        }
    }
    Ok(candidates)
}

fn cleanup_pass(candidates: Vec<Candidate>) -> Vec<Candidate> {
    candidates
        .into_iter()
        .filter(|candidate| cleanup(candidate).is_err())
        .collect()
}

fn ignore_missing(result: io::Result<()>) -> io::Result<()> {
    result.or_else(|error| {
        if error.kind() == io::ErrorKind::NotFound {
            Ok(())
        } else {
            Err(error)
        }
    })
}

fn cleanup(candidate: &Candidate) -> io::Result<()> {
    let directory = &candidate.directory;
    let metadata = match fs::symlink_metadata(directory) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    // Recheck on every retry, including links installed after the initial scan.
    if !metadata.is_dir()
        || is_reparse_point(&metadata)
        || fs::canonicalize(directory)? != *directory
    {
        return Ok(());
    }
    let entries = fs::read_dir(directory)?.collect::<io::Result<Vec<_>>>()?;
    match entries.as_slice() {
        [] => {}
        [entry] if entry.file_name() == candidate.installer_name.as_str() => {
            let file = entry.path();
            let metadata = fs::symlink_metadata(&file)?;
            if !metadata.is_file() || is_reparse_point(&metadata) {
                return Ok(());
            }
            // No recursive deletion or reboot-time removal: Windows refuses to
            // delete an executing installer or a file opened without delete sharing.
            ignore_missing(fs::remove_file(file))?;
        }
        // Unknown content makes the whole directory ineligible for this run.
        _ => return Ok(()),
    }
    ignore_missing(fs::remove_dir(directory))
}

#[cfg(test)]
#[path = "update_cleanup_tests.rs"]
mod tests;
