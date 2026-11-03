use super::*;
use std::os::windows::fs::OpenOptionsExt;
use tempfile::TempDir;

fn version() -> Version {
    Version::parse("0.6.2").unwrap()
}

fn package(root: &Path, version: &str) -> PathBuf {
    let directory = root.join(format!("FSTODO-{version}-updater-aB123z"));
    fs::create_dir(&directory).unwrap();
    let file = directory.join(format!("FSTODO-{version}-installer.exe"));
    fs::write(&file, b"test installer").unwrap();
    file
}

#[test]
fn first_launch_cleans_legacy_packages_and_same_version_never_scans_again() {
    let root = TempDir::new().unwrap();
    let data = TempDir::new().unwrap();
    let installer = package(root.path(), "0.6.1");
    let first = prepare_cleanup(root.path(), data.path(), &version())
        .unwrap()
        .unwrap();
    assert_eq!(first.len(), 1);
    assert!(cleanup_pass(first).is_empty());
    assert!(!installer.exists());
    // A non-existent temp root proves subsequent launches skip the scan itself.
    assert!(
        prepare_cleanup(&root.path().join("absent"), data.path(), &version())
            .unwrap()
            .is_none()
    );
}

#[test]
fn a_new_version_reuses_the_marker_and_cleans_historical_leftovers() {
    let root = TempDir::new().unwrap();
    let data = TempDir::new().unwrap();
    let preferences = data.path().join("preferences.json");
    fs::write(&preferences, b"preserve preferences").unwrap();
    let previous = Version::parse("0.6.1").unwrap();
    let first = prepare_cleanup(root.path(), data.path(), &previous)
        .unwrap()
        .unwrap();
    assert!(first.is_empty());
    package(root.path(), "0.4.9");
    package(root.path(), "0.6.2");
    let next = prepare_cleanup(root.path(), data.path(), &version())
        .unwrap()
        .unwrap();
    assert_eq!(next.len(), 2);
    assert!(cleanup_pass(next).is_empty());
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
    assert_eq!(
        fs::read_to_string(data.path().join("updater-cleanup-version")).unwrap(),
        "0.6.2"
    );
    assert_eq!(fs::read(preferences).unwrap(), b"preserve preferences");
}

#[test]
fn a_busy_file_is_retried_in_the_current_run_without_scheduling_on_later_launches() {
    let root = TempDir::new().unwrap();
    let data = TempDir::new().unwrap();
    let installer = package(root.path(), "0.6.2");
    let lock = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&installer)
        .unwrap();
    let first = prepare_cleanup(root.path(), data.path(), &version())
        .unwrap()
        .unwrap();
    let pending = cleanup_pass(first);
    assert_eq!(pending.len(), 1);
    assert!(prepare_cleanup(root.path(), data.path(), &version())
        .unwrap()
        .is_none());
    drop(lock);
    assert!(cleanup_pass(pending).is_empty());
    assert!(!installer.exists());
}

#[test]
fn downgrade_and_reinstall_do_not_restart_cleanup() {
    let root = TempDir::new().unwrap();
    let data = TempDir::new().unwrap();
    prepare_cleanup(root.path(), data.path(), &version())
        .unwrap()
        .unwrap();
    for current in ["0.6.1", "0.6.2", "0.6.2+rebuild.1"] {
        assert!(prepare_cleanup(
            &root.path().join("absent"),
            data.path(),
            &Version::parse(current).unwrap()
        )
        .unwrap()
        .is_none());
    }
}

#[test]
fn two_simultaneous_launches_schedule_only_one_cleanup_run() {
    let root = TempDir::new().unwrap();
    let data = TempDir::new().unwrap();
    let barrier = std::sync::Barrier::new(2);
    let scheduled = std::thread::scope(|scope| {
        let start = || {
            barrier.wait();
            match prepare_cleanup(root.path(), data.path(), &version()) {
                Ok(Some(_)) => 1,
                Ok(None) => 0,
                Err(error) if error.raw_os_error() == Some(32) => 0, // ERROR_SHARING_VIOLATION
                Err(error) => panic!("unexpected marker error: {error}"),
            }
        };
        let first = scope.spawn(start);
        let second = scope.spawn(start);
        first.join().unwrap() + second.join().unwrap()
    });
    assert_eq!(scheduled, 1);
}

#[test]
fn invalid_marker_is_replaced_without_resetting_other_data() {
    let root = TempDir::new().unwrap();
    let data = TempDir::new().unwrap();
    fs::write(
        data.path().join("updater-cleanup-version"),
        "invalid version",
    )
    .unwrap();
    assert!(prepare_cleanup(root.path(), data.path(), &version())
        .unwrap()
        .is_some());
    assert!(prepare_cleanup(root.path(), data.path(), &version())
        .unwrap()
        .is_none());
}

#[test]
fn cleans_historical_and_current_installers_without_old_version_metadata() {
    let root = TempDir::new().unwrap();
    for old in ["0.4.9", "0.5.0", "0.5.1", "0.6.0", "0.6.1", "0.6.2"] {
        package(root.path(), old);
    }
    let candidates = collect_candidates(root.path(), &version()).unwrap();
    assert_eq!(candidates.len(), 6);
    assert!(cleanup_pass(candidates).is_empty());
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
    assert!(collect_candidates(root.path(), &version())
        .unwrap()
        .is_empty());
}

#[test]
fn keeps_future_installers_using_semver_precedence() {
    let root = TempDir::new().unwrap();
    let future = package(root.path(), "0.6.10");
    let next = package(root.path(), "0.6.3-beta.1");
    assert!(collect_candidates(root.path(), &version())
        .unwrap()
        .is_empty());
    assert!(future.is_file());
    assert!(next.is_file());
    assert!(installer_name(
        "FSTODO-0.6.2-updater-aB123z",
        &Version::parse("0.6.2-beta.1").unwrap()
    )
    .is_none());
    assert!(installer_name("FSTODO-0.6.2-beta.1-updater-aB123z", &version()).is_some());
    assert!(installer_name("FSTODO-0.6.2+build.1-updater-aB123z", &version()).is_some());
}

#[test]
fn leaves_manual_downloads_other_applications_and_malformed_names_alone() {
    let root = TempDir::new().unwrap();
    for name in [
        "Other-0.6.1-updater-aB123z",
        "FSTODO-backup-updater-aB123z",
        "FSTODO-0.6.1-updater-aB123z-extra",
        "FSTODO-0.6.1-updater-abc_12",
        "FSTODO-0.6.1-updater-",
    ] {
        let directory = root.path().join(name);
        fs::create_dir(&directory).unwrap();
        fs::write(directory.join("FSTODO-0.6.1-installer.exe"), b"keep").unwrap();
    }
    let download = root.path().join("FSTODO_0.6.1_x64-setup.exe");
    fs::write(&download, b"manual download").unwrap();
    assert!(collect_candidates(root.path(), &version())
        .unwrap()
        .is_empty());
    assert!(download.is_file());
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 6);
}

#[test]
fn keeps_entire_directory_when_it_has_unrecognized_content() {
    let root = TempDir::new().unwrap();
    let installer = package(root.path(), "0.6.1");
    let extra = installer.parent().unwrap().join("user-data.txt");
    fs::write(&extra, b"keep").unwrap();
    assert!(cleanup_pass(collect_candidates(root.path(), &version()).unwrap()).is_empty());
    assert!(installer.is_file());
    assert_eq!(fs::read(&extra).unwrap(), b"keep");
}

#[test]
fn keeps_a_mismatched_installer_and_a_directory_named_as_the_installer() {
    let root = TempDir::new().unwrap();
    let installer = package(root.path(), "0.6.1");
    let wrong = installer.with_file_name("FSTODO-0.6.0-installer.exe");
    fs::rename(&installer, &wrong).unwrap();
    let nested = package(root.path(), "0.6.0");
    fs::remove_file(&nested).unwrap();
    fs::create_dir(&nested).unwrap();
    assert!(cleanup_pass(collect_candidates(root.path(), &version()).unwrap()).is_empty());
    assert!(wrong.is_file());
    assert!(nested.is_dir());
}

#[test]
fn removes_empty_legacy_directory() {
    let root = TempDir::new().unwrap();
    let installer = package(root.path(), "0.5.1");
    fs::remove_file(&installer).unwrap();
    assert!(cleanup_pass(collect_candidates(root.path(), &version()).unwrap()).is_empty());
    assert!(!installer.parent().unwrap().exists());
}

#[test]
fn locked_installer_is_preserved_and_removed_on_a_later_pass() {
    let root = TempDir::new().unwrap();
    let installer = package(root.path(), "0.6.2");
    let lock = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&installer)
        .unwrap();
    let pending = cleanup_pass(collect_candidates(root.path(), &version()).unwrap());
    assert_eq!(pending.len(), 1);
    assert!(installer.is_file());
    drop(lock);
    assert!(cleanup_pass(pending).is_empty());
    assert!(!installer.parent().unwrap().exists());
}

#[test]
fn running_executable_is_preserved_until_the_process_exits() {
    use std::{
        os::windows::process::CommandExt,
        process::{Child, Command, Stdio},
    };

    struct RunningInstaller(Child);
    impl Drop for RunningInstaller {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }

    let root = TempDir::new().unwrap();
    let installer = package(root.path(), "0.6.2");
    // Run an inert Windows utility under the updater's expected file name;
    // this exercises an actual executable image mapping without installing.
    let system_root = PathBuf::from(std::env::var_os("SystemRoot").unwrap());
    fs::copy(system_root.join("System32/ping.exe"), &installer).unwrap();
    let mut running = RunningInstaller(
        Command::new(&installer)
            .args(["-n", "60", "127.0.0.1"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(0x08000000)
            .spawn()
            .unwrap(),
    );
    assert!(running.0.try_wait().unwrap().is_none());
    let pending = cleanup_pass(collect_candidates(root.path(), &version()).unwrap());
    assert!(
        installer.is_file(),
        "the executing installer must be preserved"
    );
    assert_eq!(pending.len(), 1);
    drop(running);
    assert!(cleanup_pass(pending).is_empty());
    assert!(!installer.parent().unwrap().exists());
}

#[test]
fn retries_do_not_discover_new_update_directories() {
    let root = TempDir::new().unwrap();
    let installer = package(root.path(), "0.6.1");
    let lock = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&installer)
        .unwrap();
    let pending = cleanup_pass(collect_candidates(root.path(), &version()).unwrap());
    let new_installer = package(root.path(), "0.6.2");
    drop(lock);
    assert!(cleanup_pass(pending).is_empty());
    assert!(new_installer.is_file());
}

#[test]
fn rechecks_directory_contents_before_retrying_a_locked_installer() {
    let root = TempDir::new().unwrap();
    let installer = package(root.path(), "0.6.1");
    let lock = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&installer)
        .unwrap();
    let pending = cleanup_pass(collect_candidates(root.path(), &version()).unwrap());
    let extra = installer.parent().unwrap().join("new-file.txt");
    fs::write(&extra, b"keep").unwrap();
    drop(lock);
    assert!(cleanup_pass(pending).is_empty());
    assert!(installer.is_file());
    assert!(extra.is_file());
}

#[test]
fn tolerates_another_process_already_cleaning_the_candidate() {
    let root = TempDir::new().unwrap();
    let installer = package(root.path(), "0.6.1");
    let candidates = collect_candidates(root.path(), &version()).unwrap();
    fs::remove_file(&installer).unwrap();
    fs::remove_dir(installer.parent().unwrap()).unwrap();
    assert!(cleanup_pass(candidates).is_empty());
}

fn junction(link: &Path, target: &Path) {
    use std::{os::windows::process::CommandExt, process::Command};
    let output = Command::new("cmd.exe")
        .args(["/D", "/C", "mklink", "/J"])
        .arg(link)
        .arg(target)
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "junction creation failed: {output:?}"
    );
}

#[test]
fn never_follows_a_directory_junction_outside_the_temp_root() {
    let root = TempDir::new().unwrap();
    let outside = TempDir::new().unwrap();
    let installer = outside.path().join("FSTODO-0.6.1-installer.exe");
    fs::write(&installer, b"keep").unwrap();
    let link = root.path().join("FSTODO-0.6.1-updater-aB123z");
    junction(&link, outside.path());
    assert!(collect_candidates(root.path(), &version())
        .unwrap()
        .is_empty());
    assert_eq!(fs::read(&installer).unwrap(), b"keep");
    fs::remove_dir(link).unwrap();
}

#[test]
fn rechecks_for_a_junction_replacing_a_candidate_between_passes() {
    let root = TempDir::new().unwrap();
    let outside = TempDir::new().unwrap();
    let installer = package(root.path(), "0.6.1");
    let candidates = collect_candidates(root.path(), &version()).unwrap();
    let directory = installer.parent().unwrap();
    fs::remove_file(&installer).unwrap();
    fs::remove_dir(directory).unwrap();
    let external = outside.path().join("FSTODO-0.6.1-installer.exe");
    fs::write(&external, b"keep").unwrap();
    junction(directory, outside.path());
    assert!(cleanup_pass(candidates).is_empty());
    assert_eq!(fs::read(external).unwrap(), b"keep");
    fs::remove_dir(directory).unwrap();
}
