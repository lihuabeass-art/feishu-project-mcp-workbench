use tauri::{
    ipc::{Origin, RuntimeAuthority},
    utils::{acl::resolved::Resolved, platform::Target},
};

fn compiled_authority() -> RuntimeAuthority {
    let manifests = serde_json::from_str(include_str!(concat!(env!("OUT_DIR"), "/acl-manifests.json")))
        .expect("构建生成的权限清单必须可读");
    let capabilities = serde_json::from_str(include_str!(concat!(env!("OUT_DIR"), "/capabilities.json")))
        .expect("构建生成的窗口能力必须可读");
    let resolved = Resolved::resolve(&manifests, capabilities, Target::current())
        .expect("桌面权限必须能够解析");
    tauri::runtime_authority!(manifests, resolved)
}

#[test]
fn main_window_can_listen_and_unlisten_to_sync_progress() {
    let authority = compiled_authority();
    for command in ["plugin:event|listen", "plugin:event|unlisten"] {
        assert!(
            authority.resolve_access(command, "main", "main", &Origin::Local).is_some(),
            "渐进同步依赖主窗口权限：{command}"
        );
        assert!(
            authority.resolve_access(command, "other", "other", &Origin::Local).is_none(),
            "同步监听权限不应扩展到其他窗口"
        );
    }
    for command in ["plugin:event|emit", "plugin:event|emit_to"] {
        assert!(
            authority.resolve_access(command, "main", "main", &Origin::Local).is_none(),
            "同步读取不需要前端发送事件的权限"
        );
    }
}
