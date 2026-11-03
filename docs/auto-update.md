# 完整安装包自动更新

FSTODO 使用 Tauri 2 官方 Updater 选择平台与版本、执行系统安装；原生下载层检查公开 GitHub Release 的更新包，分段下载完整内容并验证 updater 签名，准备好后提示，由用户确认重启安装。此功能不进行增量补丁更新，也不在用户确认前安装。

## 用户体验

默认在启动后和使用期间定期检查，发现新版后自动下载。自动检查、下载和就绪提示不打开模态窗口、不抢焦点，用户可以继续处理工作；需要时打开更新详情查看进度、版本说明或失败原因，再决定何时安装。手动检查发现新版也会开始下载，下载或验签失败保留重试入口，不自动安装。

更新仅供正式安装版使用。`npm run dev` 的 Vite 开发模式禁用自动检查、手动检查、下载和安装，设置中显示开发模式说明；Tauri debug 构建不注册官方 updater 插件，避免替换正在开发的程序。此限制不修改自动更新偏好，正式版仍沿用用户原有设置。

用户可在「软件更新」关闭后续自动检查与下载，之后仍可手动检查；已经开始的下载会继续完成。下载好后必须点击确认安装；关闭窗口或正常退出不会自动安装。已下载的包仅保留在本次运行中，退出后需要重新检查和下载。安装前会核对同步、保存、流程提交和未保存设置，条件不满足时提示先处理，避免中断当前操作。Windows 安装阶段使用无需逐步点击的进度窗口；macOS 安装替换后尝试重启，系统授权提示仍取决于签名与本机环境。

## 下载中断与恢复

安装包按 512 KiB 的 HTTP Range 顺序下载，每次从固定版本的 Release URL 获取，避免整包长连接卡住，也避免重用过期的临时跳转地址。连接超时为 15 秒，连续 20 秒未收到数据会中断当前请求；单次请求最多 120 秒。每段最多尝试 3 次，间隔 1 秒、2 秒，界面会显示自动重试状态；达到上限后显示失败和手动重试入口，不无限等待。

仅完整接收的分段计入进度并保留在内存中。手动重试从本次运行中已完成的分段继续，重新检查更新或退出应用后清除；不支持跨重启续传。服务器不支持 Range 时可回退到有超时的完整下载，成功后整体替换，不能把完整响应拼到已有分段后面。分段范围、长度或总大小异常时丢弃缓存；完整包必须按内置公钥通过与官方插件相同的 minisign 校验，验签失败时清空内容并拒绝安装。Windows 与 macOS 共用这套下载逻辑，仍分别由官方插件执行安装。

此修复不会改变已经安装的 0.4.8 / 0.4.9 客户端；它们下载卡住时，可退出应用后手动下载安装含修复的新版本。GitHub 本身不可达时，超时和重试会给出失败结果，仍需恢复网络后重试。

## Windows 更新安装包清理

正式 Windows 客户端仅在安装新版本后的首次启动安排一轮后台清理，清除系统临时目录中由 FSTODO 更新器留下的安装包。识别沿用旧版命名：`%TEMP%\FSTODO-<版本>-updater-<六位随机字符>\FSTODO-<版本>-installer.exe`，无需旧版预先登记，因此其他用户第一次升级到包含此功能的版本后，也能清理之前多个版本的残留。仅处理版本不高于当前运行版本的目录；开发构建不执行清理。

用户数据目录使用固定文件 `updater-cleanup-version` 记录已安排清理的版本，跨版本保留；同版本再次启动、重装或回退到旧版时只检查记录，不扫描临时目录。同时启动多个应用实例也只安排一轮；新用户没有历史记录时自动兼容处理，其他偏好、配置和草稿不受影响。

当轮只收集一次候选目录，在第 5 秒执行首轮清理，仍被占用或无权删除的文件在之后 15 秒、60 秒各重试一次。安装程序仍在运行时由 Windows 文件占用规则保护，不强制删除、不安排系统重启时删除，也不阻塞启动或弹出提示。后续本次运行中新产生的更新目录不纳入重试扫描；达到重试上限或应用提前退出后剩余的文件，等下次安装更新版本时再处理，同版本日常启动不重新安排清理。

清理只删除匹配版本和名称的单个安装包，再移除空目录，不进行递归删除。遇到未知文件、嵌套目录、符号链接或目录联接时保留整个目录；浏览器下载的安装包、用户数据、配置与草稿均不在清理范围内。macOS 继续由官方更新插件管理安装过程，本节清理仅针对 Windows 的历史临时安装包。

## 更新源配置

公开源码与 Release 分发统一使用 `lihuabeass-art/feishu-project-mcp-workbench`。客户端使用的 Release 仓库和资源必须允许匿名下载，客户端不携带 GitHub Token；公开仓库存在并不代表已发布可用的更新清单，每次正式发布后仍须完成匿名下载验收。

`frontend/update-config.json` 的 `repository` 使用 `lihuabeass-art/feishu-project-mcp-workbench`，也可为明确授权的构建设置 `FSTODO_UPDATE_REPOSITORY=OWNER/REPO`。环境变量优先于文件配置。首次交付带 updater 的版本前须核对实际构建地址；未配置时应用显示更新源未配置，不能检查更新。

应用使用的清单地址为：

```text
https://github.com/lihuabeass-art/feishu-project-mcp-workbench/releases/latest/download/latest.json
```

`latest` 用于正式版本。GitHub 的草稿和预发布 Release 不会作为该入口的正式更新发布；预发布测试应使用独立测试分发安排，不能只上传预发布包就声称正式入口已更新。

清单中的包 URL 始终指向固定 tag 的 `releases/download/<tag>/<文件名>`，避免检查后下载时跟随 `latest` 跳至另一版本。更换公开仓库时应同时修改应用构建配置和清单生成参数，已有客户端仍会查询其安装版本内保存的旧地址。

更新检查和分段下载共用 reqwest 0.12 与同一套代理策略，启用 `system-proxy` 和 SOCKS 支持。Windows 使用 WinHTTP 读取当前用户的代理配置，兼容单地址、`http=…;https=…` 分协议代理及显式 SOCKS 地址；PAC / WPAD 交由 Windows 原生接口按目标服务器解析，重定向到 Release 附件服务器时重新选择对应代理。PAC 返回 `DIRECT` 时保留直连，解析失败时允许使用配置中的静态代理。代理环境变量优先，保留 `NO_PROXY` 和系统代理绕过规则；每次重新检查或手动重试下载都会重新读取配置，不扫描本机端口，也不修改用户的系统代理。

Windows PAC 按服务器地址（协议、主机、端口）选择，与 Chromium 对 HTTPS URL 的处理边界一致，不承诺按下载路径分流或多个代理自动切换。同步的 WinHTTP 解析在单独的有界工作队列中执行，每次最多等待 3 秒，超时使用静态代理或直连；重试不会无限创建解析线程。macOS 沿用 reqwest 的系统 HTTP(S) 代理支持；本轮 Windows PAC 适配不代表 macOS PAC 已支持。macOS 从图形界面启动时通常不继承终端代理环境变量，因此不能只验证终端可访问 GitHub；实机验收还须覆盖使用系统代理获取清单和下载更新包。

重新检查／下载重试会重读静态代理地址、绕过规则与 PAC URL，并新建解析会话；同一 PAC URL 下的脚本内容缓存仍由 Windows AutoProxy 服务管理，不承诺重试会强制重新下载该脚本。应用不清空整台电脑的代理缓存，不自动发送 Windows 登录凭证。修改了 PAC 脚本而仍使用旧规则时，可在代理软件中切换到静态系统代理完成更新，或使用浏览器下载安装入口。[Windows 官方缓存说明](https://learn.microsoft.com/en-us/windows/win32/winhttp/autoproxy-cache)。

### Windows 能访问 GitHub，但软件更新失败

浏览器与 Rust 更新器使用不同的网络客户端，浏览器可访问仓库页面不等于更新器可读取 Release 附件。`latest.json` 和安装包还会从 `github.com` 重定向至 GitHub 的附件域名（例如 `release-assets.githubusercontent.com`），代理规则和公司网络须允许整条下载链路。

0.5.0 未启用 Windows 系统代理读取；Clash / v2ray 开启系统代理而未开启 TUN 时，浏览器可能正常、软件更新却连接失败。`684f286` 中的基础修复已进入 0.5.1，但不会改变仍在运行的 0.5.0。受影响用户可先通过浏览器打开本仓库的正式 Release，下载 Windows 安装包，退出 FSTODO 后覆盖安装，无需卸载或删除本机数据；也可临时使用原有代理软件的 TUN 模式完成这一次更新。后续更新由已安装的新客户端执行。

失败提示与更新详情提供浏览器下载安装包的入口，地址跟随同次构建的更新仓库配置；不会自动打开浏览器或安装。若浏览器也无法下载安装包，需要先恢复 GitHub 附件域名的访问；重试、分段下载和代理适配不能替代可用的网络。当前没有独立镜像源。

Windows 代理回归应覆盖：关闭 TUN 后仅使用系统 HTTP 代理、分协议代理、环境变量覆盖与 `NO_PROXY`、PAC 对更新源和重定向附件分别选择代理、PAC `DIRECT`、PAC 故障后静态代理回退、重新配置后手动重试，以及失败后从浏览器下载安装。自动化测试使用独立的本地代理和 PAC 服务，不改动本机系统设置；受影响机器的实际网络仍须验收。

## 签名与 macOS 兼容

有两种不同用途的签名：

- **Updater 包签名**：使用 Tauri 的 updater 私钥对完整包签名，应用内只保存公钥；下载后验证，失败时拒绝安装。私钥应留在本机忽略目录或 CI Secret，不能提交至 Git，也不能作为 Release 附件上传。
- **操作系统代码签名**：Windows 证书、Apple Developer ID 与公证用于系统信任、Gatekeeper 和身份连续性。Updater 签名不能替代它们。

当前配置的公钥对应维护者本机忽略目录 `.local/updater/fstodo.key` 中的 updater 私钥。此私钥须另行安全备份；Windows 签名构建将 `TAURI_SIGNING_PRIVATE_KEY` 设置为该文件的绝对路径，macOS Actions 的同名 Secret 填写该文件内容，密码变量与密钥生成时保持一致。不要把私钥粘贴到代码、日志或 Release；丢失私钥会导致已安装客户端无法继续验证后续更新，不能通过换一把私钥直接恢复。

当前 macOS 沿用 ad-hoc 签名（`signingIdentity: "-"`），不要求 Apple Developer 账号。Universal 更新归档同时服务 Apple Silicon 和 Intel，最低系统仍是 macOS 13。手动首次安装使用 DMG，应用内更新使用 `.app.tar.gz`；DMG 仍可随 Release 提供给首次安装或手动恢复的用户。

ad-hoc 构建的首次打开仍可能被 Gatekeeper 拦截，需要用户在系统设置中允许。安装新版本后，钥匙串可能再次请求授权；Updater 包签名不会提供稳定的 Apple 代码签名身份。本次实现不绕过 Gatekeeper、不自动删除隔离属性；macOS 的安装替换、重新启动和钥匙串行为需要用真实 Mac 验收。

## 构建与产物

普通构建没有 `TAURI_SIGNING_PRIVATE_KEY` 时仍可生成原有 Windows NSIS 或 macOS DMG，不能宣称已有可用的签名更新包。配置了该环境变量时，构建包装脚本开启 updater 产物生成。可选密码变量为 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。

Windows 在本机使用已有构建命令：

```sh
cd frontend
npm run build:windows
```

签名更新所需文件为同次构建生成的 `FSTODO_<版本>_x64-setup.exe` 与相邻的 `.exe.sig`。保留同次构建的 `artifacts/release/release.json`，用于生成更新清单。

macOS `Build macOS` 工作流从 GitHub Secrets 读取 `TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。有私钥时收集 Universal `.app.tar.gz` 与 `.app.tar.gz.sig`；没有私钥时仍只交付 DMG，日志会明确没有自动更新包，此时不满足在线更新发布要求。Actions Artifact 同时携带 `release.json` 和 `RELEASE_NOTES.md`；工作流负责构建并上传 Artifact，待收齐 Windows 与 macOS 产物后再统一准备草稿和发布正式 GitHub Release。

两端必须基于同一版本 tag、同一提交构建，使用同一 updater 密钥。macOS 归档文件名通常不包含版本号，必须保留对应 Mac 构建携带的 `release.json`，不可拿其他版本的归档搭配新的记录。

## 生成完整更新清单

只有用户明确要求发版并指定版本号和代码范围后，才执行实际版本 tag、构建与发布。正式发版请求按[发版流程](release-process.md)一并授权推送已确认的代码及 tag、创建并发布 GitHub Release 和发布后的匿名验收，不在编译结束后另行等待发布指令；用户明确要求“只编译”“不发布”等范围限制时按其限制执行。维护本说明或更新能力本身不代表获准发版，代码提交的审查与确认仍遵循原有规则。

收齐 Windows 和 macOS 的签名完整包及各自的 `release.json` 后，在 `frontend` 目录运行：

```sh
node scripts/update-manifest.mjs \
  --version 0.5.0 \
  --repo lihuabeass-art/feishu-project-mcp-workbench \
  --windows '/path/windows/FSTODO_0.5.0_x64-setup.exe' \
  --macos '/path/macos/FSTODO.app.tar.gz' \
  --notes '/path/windows/release.json' \
  --macos-notes '/path/macos/release.json' \
  --output '/path/release/latest.json'
```

`0.5.0` 只是参数示例，不是指定本项目的下一个版本。参数要求如下：

| 参数 | 含义 |
| --- | --- |
| `--version` | 用户已确定的语义版本，不带 `v` 前缀 |
| `--repo` | 必填，允许匿名下载资源的公开分发仓库 `OWNER/REPO`，必须与客户端构建配置相同 |
| `--windows` | 完整 Windows x64 NSIS 包，文件名结尾为 `_<版本>_x64-setup.exe`，旁边必须有 `.sig` |
| `--macos` | Universal `.app.tar.gz`，旁边必须有 `.sig` |
| `--notes` | Windows 同次构建的 `release.json`，清单正文和日期沿用此文件 |
| `--macos-notes` | macOS 同次构建的 `release.json`，核对两端 `version`、`tag`、`commit` 一致 |
| `--output` | 待上传的 `latest.json` 路径 |

脚本会校验所有输入后再原子写入清单。缺任一平台、签名缺失或为空、签名填成路径、版本/tag/提交不一致、Windows 文件名版本不一致时均报错，并保留已有清单；它把 `.sig` 文件的 Base64 内容写入 JSON，实际密码学验签由客户端 updater 执行。

完成受控发布时，同一公开 Release 至少需要以下五个更新文件，另可提供 DMG 和更新说明：

```text
latest.json
FSTODO_<版本>_x64-setup.exe
FSTODO_<版本>_x64-setup.exe.sig
FSTODO.app.tar.gz
FSTODO.app.tar.gz.sig
```

先完成两个平台构建与核验，再把全部文件放入 `lihuabeass-art/feishu-project-mcp-workbench` 的同一 tag 草稿 Release，另附 DMG、`RELEASE_NOTES.md`、`LICENSE` 和 `THIRD_PARTY_NOTICES.md`；确认资源、版本与许可完整后，最后作为正式 Release 一次发布。不要先发布只包含一个平台的清单，也不要把测试中的较旧版本设为最新版本。草稿只用于发布前汇总附件；匿名下载验收须在正式发布后以未登录状态验证 `latest.json` 与其中两个固定版本下载 URL 均可访问，避免拿登录后的维护者权限当作客户端可用证明。

## 安装与在线更新验收

验证代码、成功构建、公开下载和真实安装是不同的结果，应分别记录：

- **GitHub 匿名访问**：未登录获取正式 Release 的 `latest.json`，确认版本、三个目标平台键（Windows x64、macOS Intel、macOS Apple Silicon）及签名存在；两个 Mac 键应共用同一个 Universal 包。清单中的 Windows 与 Mac 固定 tag 资源均须可匿名下载。
- **Windows 旧版到新版**：先手动安装一个已包含正确更新源与公钥的旧版本，再发布较高的已授权版本。真实验证自动检查和后台完整下载不抢焦点、下载验签后就绪提示、手动检查、关闭自动更新、失败重试、稍后安装与确认重启安装；确认前不得触发安装。重新打开后核对目标版本、离线更新记录、本机配置与缓存保留，并检查安装过程没有中断正在提交或未保存的编辑。
- **macOS Actions 构建**：记录工作流 tag、提交、Universal 架构、DMG、更新归档、updater 签名与记录核验结果。此项成功不代表已经验证 Gatekeeper、钥匙串或替换正在运行的应用。
- **macOS 实机**：分别记录首次 DMG 安装、旧版到新版的应用内下载/确认/替换/重启、Gatekeeper 提示、钥匙串授权与数据保留。没有真实 Mac 执行时写明“实机待验收”，不要将 Actions 通过表述为端到端更新通过。

若公开清单或任一平台下载不可用，不能宣称在线更新可交付。安装结果不确定时先检查实际安装版本与本机状态，不自动重复安装。验收记录应填写实际版本和结果；本文的 `0.5.0` 仅为命令示例，不表示任何版本已经完成发布或实机验证。

旧版本没有 updater，不能自动获得本功能。用户需要手动安装第一个包含 updater、正确更新源和公钥的版本；后续才可从软件内确认安装更新。
