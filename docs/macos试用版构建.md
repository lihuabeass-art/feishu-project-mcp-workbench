# macOS 按 Git tag 构建

安装包为 Universal DMG，同时包含 Apple Silicon（arm64）与 Intel（x86_64），最低系统版本为 macOS 13，以满足现有前端的 WebKit API 要求。Mac 使用系统自带的 WKWebView，安装使用无需 Node.js、Rust 或 Windows WebView2。

## GitHub Actions 构建

1. 仅在用户明确要求发版时，先由用户指定版本号，再按[发版流程](release-process.md)确认提交、生成记录并交付 tag。
2. 推送版本 tag 会触发 **Actions → Build macOS**；手动运行或重跑时填写已有 tag。Windows 使用同一 tag 在本机构建，未打版本 tag 的分支不能发版。
3. 等待测试、通用应用构建、架构与签名校验成功。
4. 在本次运行的 **Artifacts** 下载 `FSTODO-版本号-macos-universal`，解压获得 DMG 与 `RELEASE_NOTES.md`。产物保留 14 天，下载并完成安装核验后，将文件直接发给群友；使用者在软件内离线查看记录。

构建配置位于 `.github/workflows/build-macos.yml`，只编译和保存产物，不创建 GitHub Release。CI 使用临时钥匙串验证 Token 保存、数据库重新打开后读取、替换及损坏凭证报错，不接触真实账号 Token。

## 安装与首次连接

打开 DMG，把 FSTODO 拖入「应用程序」，再从「应用程序」启动。首次连接需填写使用者自己的飞书项目 MCP Token；密钥保存在当前 macOS 用户的默认钥匙串中，数据库仅保存加密后的 Token。系统询问钥匙串访问权限时，输入该钥匙串的密码（通常是 Mac 登录密码），并选择「始终允许」；「允许一次」只授权当前这次访问。

FSTODO 成功读取密钥后，会在当前进程内复用，刷新、检查连接、读取详情和替换 Token 无需再次访问钥匙串，并发读取也共用同一次成功授权。缓存只存在于内存，退出进程后失效；访问失败或密钥无效时不缓存，可在解锁钥匙串或重新授权后重试。

当前包采用 ad-hoc 签名，未使用 Apple Developer ID 签名或公证。首次打开如被 Gatekeeper 拦截，可在「系统设置 → 隐私与安全性」中对 FSTODO 选择「仍要打开」；公开分发前需要补齐 Developer ID 签名与公证。进程内缓存只解决本次运行中的重复访问，安装新的 ad-hoc 构建后，系统仍可能要求重新授权钥匙串；跨版本授权连续性需要稳定的代码签名身份。

## 本机重建

需要 Mac、Xcode Command Line Tools、Node.js 24 和 Rust 1.88.0：

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
cd frontend
npm ci
npm run build:macos  # 版本取自当前提交的 tag，例如 v0.5.0
```

输出位于 `frontend/src-tauri/target/universal-apple-darwin/release/bundle/dmg/`。macOS 的窗口、图标与打包设置由 `tauri.macos.conf.json` 自动覆盖，不影响 Windows NSIS 配置。
