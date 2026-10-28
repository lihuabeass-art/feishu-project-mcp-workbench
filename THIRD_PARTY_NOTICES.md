# Third-party notices / 第三方软件声明

FSTODO 原创代码以仓库根目录 LICENSE 中的 MIT 许可证发布，版权归 2026 lihuabeass-art。第三方组件保留各自版权和许可证，项目 MIT 许可证不替换这些条款。

核对日期：2026-10-28。范围是 frontend/package-lock.json 中 163 个非 dev npm 包，以及 frontend/src-tauri/Cargo.lock 经 Windows x86_64、macOS aarch64 和 x86_64 分别解析后的 430 个第三方 Rust crate 的并集。此清单包含构建所需组件，是安装包实际使用组件的保守上集；两种 macOS 架构均已核对。Linux、Android、iOS 和仅 npm 开发/测试工具不属于本次桌面分发范围。依赖变化后须重新核对，不能把本清单视为未来版本的自动许可保证。

MIT / Apache-2.0 等 OR（以及旧式斜杠表示的二选一）许可在允许时按 MIT 使用；含 AND 的组合许可须同时遵守，原文均保留在后文。收集到的上游 NOTICE、COPYRIGHT、嵌套许可和第三方代码许可一并保留；相同文本只存一份，各组件通过下表引用。未随 crate 携带完整许可的组件使用已标明的上游原始文本，或其元数据声明的 MIT 标准条款并保留作者信息；没有为第三方虚构版权年份。

## MPL-2.0 组件及源码获取

以下组件保持 MPL-2.0。当前未修改其上游源码；它们与 FSTODO 的 MIT 文件组合不会把 FSTODO 原创文件改为 MPL。外部分发时可在以下固定版本页面取得完整源代码（页面的 Download 链接提供原始 .crate）；接收方保有 MPL 对这些组件的权利。若以后修改这些组件文件，应同时向接收方提供对应修改源码。

| 组件 | 版本 | 对应版本源代码 |
| --- | --- | --- |
| cssparser | 0.35.0 | [cssparser 0.35.0](https://crates.io/crates/cssparser/0.35.0) |
| cssparser | 0.36.0 | [cssparser 0.36.0](https://crates.io/crates/cssparser/0.36.0) |
| cssparser-macros | 0.6.1 | [cssparser-macros 0.6.1](https://crates.io/crates/cssparser-macros/0.6.1) |
| dtoa-short | 0.3.5 | [dtoa-short 0.3.5](https://crates.io/crates/dtoa-short/0.3.5) |
| option-ext | 0.2.0 | [option-ext 0.2.0](https://crates.io/crates/option-ext/0.2.0) |
| selectors | 0.31.0 | [selectors 0.31.0](https://crates.io/crates/selectors/0.31.0) |
| selectors | 0.36.1 | [selectors 0.36.1](https://crates.io/crates/selectors/0.36.1) |

## 系统组件与分发范围

Windows WebView2 Runtime 由系统/微软安装程序提供，并受微软自身条款约束；macOS 的 WebKit、系统框架及构建时 Xcode SDK 受 Apple 对应条款约束。它们不因本项目 MIT 许可证而改为 MIT。Rust objc2 系列上游关于 Apple SDK 的原说明也保留在下文。NSIS 安装器由 Tauri 打包工具生成；若发行包额外包含 WebView2 离线运行时、其他系统运行时、字体或新的媒体素材，还需同步保留其分发条款。

## 组件索引

| 生态 | 组件 | 版本 | 上游声明的许可证 | 平台 | 原许可 / 通知文本 |
| --- | --- | --- | --- | --- | --- |
| npm | [@floating-ui/core](https://www.npmjs.com/package/@floating-ui/core/v/1.8.0) | 1.8.0 | MIT | Windows, macOS frontend | [notice-6c1117dc530c](#notice-6c1117dc530c) |
| npm | [@floating-ui/dom](https://www.npmjs.com/package/@floating-ui/dom/v/1.8.0) | 1.8.0 | MIT | Windows, macOS frontend | [notice-6c1117dc530c](#notice-6c1117dc530c) |
| npm | [@floating-ui/react-dom](https://www.npmjs.com/package/@floating-ui/react-dom/v/2.1.9) | 2.1.9 | MIT | Windows, macOS frontend | [notice-6c1117dc530c](#notice-6c1117dc530c) |
| npm | [@floating-ui/utils](https://www.npmjs.com/package/@floating-ui/utils/v/0.2.12) | 0.2.12 | MIT | Windows, macOS frontend | [notice-6c1117dc530c](#notice-6c1117dc530c) |
| npm | [@radix-ui/primitive](https://www.npmjs.com/package/@radix-ui/primitive/v/1.2.0) | 1.2.0 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-arrow](https://www.npmjs.com/package/@radix-ui/react-arrow/v/1.1.17) | 1.1.17 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-collection](https://www.npmjs.com/package/@radix-ui/react-collection/v/1.2.0) | 1.2.0 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-compose-refs](https://www.npmjs.com/package/@radix-ui/react-compose-refs/v/1.1.5) | 1.1.5 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-context](https://www.npmjs.com/package/@radix-ui/react-context/v/1.3.0) | 1.3.0 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-direction](https://www.npmjs.com/package/@radix-ui/react-direction/v/1.2.0) | 1.2.0 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-dismissable-layer](https://www.npmjs.com/package/@radix-ui/react-dismissable-layer/v/1.2.1) | 1.2.1 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-dropdown-menu](https://www.npmjs.com/package/@radix-ui/react-dropdown-menu/v/2.2.1) | 2.2.1 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-focus-guards](https://www.npmjs.com/package/@radix-ui/react-focus-guards/v/1.2.0) | 1.2.0 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-focus-scope](https://www.npmjs.com/package/@radix-ui/react-focus-scope/v/1.3.1) | 1.3.1 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-id](https://www.npmjs.com/package/@radix-ui/react-id/v/1.1.4) | 1.1.4 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-menu](https://www.npmjs.com/package/@radix-ui/react-menu/v/2.2.1) | 2.2.1 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-popper](https://www.npmjs.com/package/@radix-ui/react-popper/v/1.4.0) | 1.4.0 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-portal](https://www.npmjs.com/package/@radix-ui/react-portal/v/1.2.0) | 1.2.0 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-presence](https://www.npmjs.com/package/@radix-ui/react-presence/v/1.1.11) | 1.1.11 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-primitive](https://www.npmjs.com/package/@radix-ui/react-primitive/v/2.2.0) | 2.2.0 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-roving-focus](https://www.npmjs.com/package/@radix-ui/react-roving-focus/v/1.2.1) | 1.2.1 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-slot](https://www.npmjs.com/package/@radix-ui/react-slot/v/1.5.0) | 1.5.0 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-use-callback-ref](https://www.npmjs.com/package/@radix-ui/react-use-callback-ref/v/1.1.5) | 1.1.5 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-use-controllable-state](https://www.npmjs.com/package/@radix-ui/react-use-controllable-state/v/1.3.0) | 1.3.0 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-use-effect-event](https://www.npmjs.com/package/@radix-ui/react-use-effect-event/v/0.0.5) | 0.0.5 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-use-is-hydrated](https://www.npmjs.com/package/@radix-ui/react-use-is-hydrated/v/0.1.3) | 0.1.3 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-use-layout-effect](https://www.npmjs.com/package/@radix-ui/react-use-layout-effect/v/1.1.4) | 1.1.4 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-use-rect](https://www.npmjs.com/package/@radix-ui/react-use-rect/v/1.1.4) | 1.1.4 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/react-use-size](https://www.npmjs.com/package/@radix-ui/react-use-size/v/1.1.5) | 1.1.5 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@radix-ui/rect](https://www.npmjs.com/package/@radix-ui/rect/v/1.1.3) | 1.1.3 | MIT | Windows, macOS frontend | [notice-74144f6a3a6c](#notice-74144f6a3a6c) |
| npm | [@tauri-apps/api](https://www.npmjs.com/package/@tauri-apps/api/v/2.11.1) | 2.11.1 | Apache-2.0 OR MIT | Windows, macOS frontend | [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-89ff9689dcf9](#notice-89ff9689dcf9) |
| npm | [@tauri-apps/plugin-process](https://www.npmjs.com/package/@tauri-apps/plugin-process/v/2.3.0) | 2.3.0 | MIT OR Apache-2.0 | Windows, macOS frontend | [notice-eb8a6c846304](#notice-eb8a6c846304), [notice-89ff9689dcf9](#notice-89ff9689dcf9) |
| npm | [@tauri-apps/plugin-updater](https://www.npmjs.com/package/@tauri-apps/plugin-updater/v/2.9.0) | 2.9.0 | MIT OR Apache-2.0 | Windows, macOS frontend | [notice-eb8a6c846304](#notice-eb8a6c846304), [notice-89ff9689dcf9](#notice-89ff9689dcf9) |
| npm | [@types/debug](https://www.npmjs.com/package/@types/debug/v/4.1.13) | 4.1.13 | MIT | Windows, macOS frontend | [notice-ff82c90f8494](#notice-ff82c90f8494) |
| npm | [@types/estree](https://www.npmjs.com/package/@types/estree/v/1.0.9) | 1.0.9 | MIT | Windows, macOS frontend | [notice-ff82c90f8494](#notice-ff82c90f8494) |
| npm | [@types/estree-jsx](https://www.npmjs.com/package/@types/estree-jsx/v/1.0.5) | 1.0.5 | MIT | Windows, macOS frontend | [notice-ff82c90f8494](#notice-ff82c90f8494) |
| npm | [@types/hast](https://www.npmjs.com/package/@types/hast/v/3.0.5) | 3.0.5 | MIT | Windows, macOS frontend | [notice-ff82c90f8494](#notice-ff82c90f8494) |
| npm | [@types/mdast](https://www.npmjs.com/package/@types/mdast/v/4.0.4) | 4.0.4 | MIT | Windows, macOS frontend | [notice-ff82c90f8494](#notice-ff82c90f8494) |
| npm | [@types/ms](https://www.npmjs.com/package/@types/ms/v/2.1.0) | 2.1.0 | MIT | Windows, macOS frontend | [notice-ff82c90f8494](#notice-ff82c90f8494) |
| npm | [@types/react](https://www.npmjs.com/package/@types/react/v/19.3.0) | 19.3.0 | MIT | Windows, macOS frontend | [notice-ff82c90f8494](#notice-ff82c90f8494) |
| npm | [@types/react-dom](https://www.npmjs.com/package/@types/react-dom/v/19.3.0) | 19.3.0 | MIT | Windows, macOS frontend | [notice-ff82c90f8494](#notice-ff82c90f8494) |
| npm | [@types/unist](https://www.npmjs.com/package/@types/unist/v/3.0.3) | 3.0.3 | MIT | Windows, macOS frontend | [notice-ff82c90f8494](#notice-ff82c90f8494) |
| npm | [@ungap/structured-clone](https://www.npmjs.com/package/@ungap/structured-clone/v/1.4.0) | 1.4.0 | ISC | Windows, macOS frontend | [notice-22fc2b0e60ba](#notice-22fc2b0e60ba) |
| npm | [aria-hidden](https://www.npmjs.com/package/aria-hidden/v/1.2.6) | 1.2.6 | MIT | Windows, macOS frontend | [notice-07dfb46d2e36](#notice-07dfb46d2e36) |
| npm | [bail](https://www.npmjs.com/package/bail/v/2.0.2) | 2.0.2 | MIT | Windows, macOS frontend | [notice-c37a32dd1cd4](#notice-c37a32dd1cd4) |
| npm | [ccount](https://www.npmjs.com/package/ccount/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-c37a32dd1cd4](#notice-c37a32dd1cd4) |
| npm | [character-entities](https://www.npmjs.com/package/character-entities/v/2.0.2) | 2.0.2 | MIT | Windows, macOS frontend | [notice-c37a32dd1cd4](#notice-c37a32dd1cd4) |
| npm | [character-entities-html4](https://www.npmjs.com/package/character-entities-html4/v/2.1.0) | 2.1.0 | MIT | Windows, macOS frontend | [notice-c37a32dd1cd4](#notice-c37a32dd1cd4) |
| npm | [character-entities-legacy](https://www.npmjs.com/package/character-entities-legacy/v/3.0.0) | 3.0.0 | MIT | Windows, macOS frontend | [notice-c37a32dd1cd4](#notice-c37a32dd1cd4) |
| npm | [character-reference-invalid](https://www.npmjs.com/package/character-reference-invalid/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-c37a32dd1cd4](#notice-c37a32dd1cd4) |
| npm | [comma-separated-tokens](https://www.npmjs.com/package/comma-separated-tokens/v/2.0.3) | 2.0.3 | MIT | Windows, macOS frontend | [notice-d9c32f07344c](#notice-d9c32f07344c) |
| npm | [csstype](https://www.npmjs.com/package/csstype/v/3.2.3) | 3.2.3 | MIT | Windows, macOS frontend | [notice-6a972b33787e](#notice-6a972b33787e) |
| npm | [debug](https://www.npmjs.com/package/debug/v/4.4.3) | 4.4.3 | MIT | Windows, macOS frontend | [notice-d9e5aa2747f3](#notice-d9e5aa2747f3) |
| npm | [decode-named-character-reference](https://www.npmjs.com/package/decode-named-character-reference/v/1.3.0) | 1.3.0 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [dequal](https://www.npmjs.com/package/dequal/v/2.0.3) | 2.0.3 | MIT | Windows, macOS frontend | [notice-d0a8e5996a99](#notice-d0a8e5996a99) |
| npm | [detect-node-es](https://www.npmjs.com/package/detect-node-es/v/1.1.0) | 1.1.0 | MIT | Windows, macOS frontend | [notice-5dd2a43c0ed6](#notice-5dd2a43c0ed6) |
| npm | [devlop](https://www.npmjs.com/package/devlop/v/1.1.0) | 1.1.0 | MIT | Windows, macOS frontend | [notice-189cbd7c4b22](#notice-189cbd7c4b22) |
| npm | [escape-string-regexp](https://www.npmjs.com/package/escape-string-regexp/v/5.0.0) | 5.0.0 | MIT | Windows, macOS frontend | [notice-1529f88b3675](#notice-1529f88b3675) |
| npm | [estree-util-is-identifier-name](https://www.npmjs.com/package/estree-util-is-identifier-name/v/3.0.0) | 3.0.0 | MIT | Windows, macOS frontend | [notice-0e99f2710dd2](#notice-0e99f2710dd2) |
| npm | [extend](https://www.npmjs.com/package/extend/v/3.0.2) | 3.0.2 | MIT | Windows, macOS frontend | [notice-b079b743d39a](#notice-b079b743d39a) |
| npm | [get-nonce](https://www.npmjs.com/package/get-nonce/v/1.0.1) | 1.0.1 | MIT | Windows, macOS frontend | [notice-a05c505267a8](#notice-a05c505267a8) |
| npm | [hast-util-from-parse5](https://www.npmjs.com/package/hast-util-from-parse5/v/8.0.3) | 8.0.3 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [hast-util-parse-selector](https://www.npmjs.com/package/hast-util-parse-selector/v/4.0.0) | 4.0.0 | MIT | Windows, macOS frontend | [notice-d9c32f07344c](#notice-d9c32f07344c) |
| npm | [hast-util-raw](https://www.npmjs.com/package/hast-util-raw/v/9.1.0) | 9.1.0 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [entities](https://www.npmjs.com/package/entities/v/6.0.1) | 6.0.1 | BSD-2-Clause | Windows, macOS frontend | [notice-0e57eeaccc07](#notice-0e57eeaccc07) |
| npm | [parse5](https://www.npmjs.com/package/parse5/v/7.3.0) | 7.3.0 | MIT | Windows, macOS frontend | [notice-2c01a01133de](#notice-2c01a01133de) |
| npm | [hast-util-sanitize](https://www.npmjs.com/package/hast-util-sanitize/v/5.0.2) | 5.0.2 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [hast-util-to-jsx-runtime](https://www.npmjs.com/package/hast-util-to-jsx-runtime/v/2.3.6) | 2.3.6 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [hast-util-to-parse5](https://www.npmjs.com/package/hast-util-to-parse5/v/8.0.1) | 8.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [hast-util-whitespace](https://www.npmjs.com/package/hast-util-whitespace/v/3.0.0) | 3.0.0 | MIT | Windows, macOS frontend | [notice-d9c32f07344c](#notice-d9c32f07344c) |
| npm | [hastscript](https://www.npmjs.com/package/hastscript/v/9.0.1) | 9.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [html-url-attributes](https://www.npmjs.com/package/html-url-attributes/v/3.0.1) | 3.0.1 | MIT | Windows, macOS frontend | [notice-2cf2d507c76c](#notice-2cf2d507c76c) |
| npm | [html-void-elements](https://www.npmjs.com/package/html-void-elements/v/3.0.0) | 3.0.0 | MIT | Windows, macOS frontend | [notice-d9c32f07344c](#notice-d9c32f07344c) |
| npm | [inline-style-parser](https://www.npmjs.com/package/inline-style-parser/v/0.2.7) | 0.2.7 | MIT | Windows, macOS frontend | [notice-9cac2500def4](#notice-9cac2500def4) |
| npm | [is-alphabetical](https://www.npmjs.com/package/is-alphabetical/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-d9c32f07344c](#notice-d9c32f07344c) |
| npm | [is-alphanumerical](https://www.npmjs.com/package/is-alphanumerical/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-d9c32f07344c](#notice-d9c32f07344c) |
| npm | [is-decimal](https://www.npmjs.com/package/is-decimal/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-d9c32f07344c](#notice-d9c32f07344c) |
| npm | [is-hexadecimal](https://www.npmjs.com/package/is-hexadecimal/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-d9c32f07344c](#notice-d9c32f07344c) |
| npm | [is-plain-obj](https://www.npmjs.com/package/is-plain-obj/v/4.1.0) | 4.1.0 | MIT | Windows, macOS frontend | [notice-1529f88b3675](#notice-1529f88b3675) |
| npm | [longest-streak](https://www.npmjs.com/package/longest-streak/v/3.1.0) | 3.1.0 | MIT | Windows, macOS frontend | [notice-4be46afa7981](#notice-4be46afa7981) |
| npm | [lucide-react](https://www.npmjs.com/package/lucide-react/v/0.468.0) | 0.468.0 | ISC | Windows, macOS frontend | [notice-092a9de2ea14](#notice-092a9de2ea14), [notice-baf59c76fb66](#notice-baf59c76fb66) |
| npm | [markdown-table](https://www.npmjs.com/package/markdown-table/v/3.0.4) | 3.0.4 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [mdast-util-find-and-replace](https://www.npmjs.com/package/mdast-util-find-and-replace/v/3.0.3) | 3.0.3 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [mdast-util-from-markdown](https://www.npmjs.com/package/mdast-util-from-markdown/v/2.1.0) | 2.1.0 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [mdast-util-gfm](https://www.npmjs.com/package/mdast-util-gfm/v/3.1.0) | 3.1.0 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [mdast-util-gfm-autolink-literal](https://www.npmjs.com/package/mdast-util-gfm-autolink-literal/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-0e99f2710dd2](#notice-0e99f2710dd2) |
| npm | [mdast-util-gfm-footnote](https://www.npmjs.com/package/mdast-util-gfm-footnote/v/2.1.0) | 2.1.0 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [mdast-util-gfm-strikethrough](https://www.npmjs.com/package/mdast-util-gfm-strikethrough/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [mdast-util-gfm-table](https://www.npmjs.com/package/mdast-util-gfm-table/v/2.0.0) | 2.0.0 | MIT | Windows, macOS frontend | [notice-0e99f2710dd2](#notice-0e99f2710dd2) |
| npm | [mdast-util-gfm-task-list-item](https://www.npmjs.com/package/mdast-util-gfm-task-list-item/v/2.0.0) | 2.0.0 | MIT | Windows, macOS frontend | [notice-0e99f2710dd2](#notice-0e99f2710dd2) |
| npm | [mdast-util-mdx-expression](https://www.npmjs.com/package/mdast-util-mdx-expression/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-0e99f2710dd2](#notice-0e99f2710dd2) |
| npm | [mdast-util-mdx-jsx](https://www.npmjs.com/package/mdast-util-mdx-jsx/v/3.2.0) | 3.2.0 | MIT | Windows, macOS frontend | [notice-0e99f2710dd2](#notice-0e99f2710dd2) |
| npm | [mdast-util-mdxjs-esm](https://www.npmjs.com/package/mdast-util-mdxjs-esm/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-0e99f2710dd2](#notice-0e99f2710dd2) |
| npm | [mdast-util-phrasing](https://www.npmjs.com/package/mdast-util-phrasing/v/4.1.0) | 4.1.0 | MIT | Windows, macOS frontend | [notice-e11634cfe7bf](#notice-e11634cfe7bf) |
| npm | [mdast-util-to-hast](https://www.npmjs.com/package/mdast-util-to-hast/v/13.2.1) | 13.2.1 | MIT | Windows, macOS frontend | [notice-d9c32f07344c](#notice-d9c32f07344c) |
| npm | [mdast-util-to-markdown](https://www.npmjs.com/package/mdast-util-to-markdown/v/2.2.0) | 2.2.0 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [mdast-util-to-string](https://www.npmjs.com/package/mdast-util-to-string/v/4.0.0) | 4.0.0 | MIT | Windows, macOS frontend | [notice-c37a32dd1cd4](#notice-c37a32dd1cd4) |
| npm | [micromark](https://www.npmjs.com/package/micromark/v/4.0.3) | 4.0.3 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-core-commonmark](https://www.npmjs.com/package/micromark-core-commonmark/v/2.0.4) | 2.0.4 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-extension-gfm](https://www.npmjs.com/package/micromark-extension-gfm/v/3.0.0) | 3.0.0 | MIT | Windows, macOS frontend | [notice-0e99f2710dd2](#notice-0e99f2710dd2) |
| npm | [micromark-extension-gfm-autolink-literal](https://www.npmjs.com/package/micromark-extension-gfm-autolink-literal/v/2.1.0) | 2.1.0 | MIT | Windows, macOS frontend | [notice-0e99f2710dd2](#notice-0e99f2710dd2) |
| npm | [micromark-extension-gfm-footnote](https://www.npmjs.com/package/micromark-extension-gfm-footnote/v/2.1.0) | 2.1.0 | MIT | Windows, macOS frontend | [notice-59e8b888f1d3](#notice-59e8b888f1d3) |
| npm | [micromark-extension-gfm-strikethrough](https://www.npmjs.com/package/micromark-extension-gfm-strikethrough/v/2.1.0) | 2.1.0 | MIT | Windows, macOS frontend | [notice-0e99f2710dd2](#notice-0e99f2710dd2) |
| npm | [micromark-extension-gfm-table](https://www.npmjs.com/package/micromark-extension-gfm-table/v/2.1.2) | 2.1.2 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-extension-gfm-tagfilter](https://www.npmjs.com/package/micromark-extension-gfm-tagfilter/v/2.0.0) | 2.0.0 | MIT | Windows, macOS frontend | [notice-0e99f2710dd2](#notice-0e99f2710dd2) |
| npm | [micromark-extension-gfm-task-list-item](https://www.npmjs.com/package/micromark-extension-gfm-task-list-item/v/2.1.0) | 2.1.0 | MIT | Windows, macOS frontend | [notice-0e99f2710dd2](#notice-0e99f2710dd2) |
| npm | [micromark-factory-destination](https://www.npmjs.com/package/micromark-factory-destination/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-factory-label](https://www.npmjs.com/package/micromark-factory-label/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-factory-space](https://www.npmjs.com/package/micromark-factory-space/v/2.1.0) | 2.1.0 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-factory-title](https://www.npmjs.com/package/micromark-factory-title/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-factory-whitespace](https://www.npmjs.com/package/micromark-factory-whitespace/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-util-character](https://www.npmjs.com/package/micromark-util-character/v/2.1.1) | 2.1.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-util-chunked](https://www.npmjs.com/package/micromark-util-chunked/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-util-classify-character](https://www.npmjs.com/package/micromark-util-classify-character/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-util-combine-extensions](https://www.npmjs.com/package/micromark-util-combine-extensions/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-util-decode-numeric-character-reference](https://www.npmjs.com/package/micromark-util-decode-numeric-character-reference/v/2.0.2) | 2.0.2 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-util-decode-string](https://www.npmjs.com/package/micromark-util-decode-string/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-util-edit-map](https://www.npmjs.com/package/micromark-util-edit-map/v/1.0.0) | 1.0.0 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-util-encode](https://www.npmjs.com/package/micromark-util-encode/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-util-html-tag-name](https://www.npmjs.com/package/micromark-util-html-tag-name/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-util-normalize-identifier](https://www.npmjs.com/package/micromark-util-normalize-identifier/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-util-resolve-all](https://www.npmjs.com/package/micromark-util-resolve-all/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-util-sanitize-uri](https://www.npmjs.com/package/micromark-util-sanitize-uri/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-util-subtokenize](https://www.npmjs.com/package/micromark-util-subtokenize/v/2.1.0) | 2.1.0 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-util-symbol](https://www.npmjs.com/package/micromark-util-symbol/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [micromark-util-types](https://www.npmjs.com/package/micromark-util-types/v/2.0.3) | 2.0.3 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [ms](https://www.npmjs.com/package/ms/v/2.1.3) | 2.1.3 | MIT | Windows, macOS frontend | [notice-e91069c31b4e](#notice-e91069c31b4e) |
| npm | [parse-entities](https://www.npmjs.com/package/parse-entities/v/4.0.2) | 4.0.2 | MIT | Windows, macOS frontend | [notice-c74f9c5a522f](#notice-c74f9c5a522f) |
| npm | [@types/unist](https://www.npmjs.com/package/@types/unist/v/2.0.11) | 2.0.11 | MIT | Windows, macOS frontend | [notice-ff82c90f8494](#notice-ff82c90f8494) |
| npm | [property-information](https://www.npmjs.com/package/property-information/v/7.2.0) | 7.2.0 | MIT | Windows, macOS frontend | [notice-c74f9c5a522f](#notice-c74f9c5a522f) |
| npm | [react](https://www.npmjs.com/package/react/v/19.3.1) | 19.3.1 | MIT | Windows, macOS frontend | [notice-cf9b17822d1f](#notice-cf9b17822d1f) |
| npm | [react-dom](https://www.npmjs.com/package/react-dom/v/19.3.1) | 19.3.1 | MIT | Windows, macOS frontend | [notice-cf9b17822d1f](#notice-cf9b17822d1f) |
| npm | [react-markdown](https://www.npmjs.com/package/react-markdown/v/10.1.0) | 10.1.0 | MIT | Windows, macOS frontend | [notice-b7972f57b949](#notice-b7972f57b949) |
| npm | [react-remove-scroll](https://www.npmjs.com/package/react-remove-scroll/v/2.7.2) | 2.7.2 | MIT | Windows, macOS frontend | [notice-07dfb46d2e36](#notice-07dfb46d2e36) |
| npm | [react-remove-scroll-bar](https://www.npmjs.com/package/react-remove-scroll-bar/v/2.3.8) | 2.3.8 | MIT | Windows, macOS frontend | [notice-ceedc02ca6ec](#notice-ceedc02ca6ec) |
| npm | [react-style-singleton](https://www.npmjs.com/package/react-style-singleton/v/2.2.3) | 2.2.3 | MIT | Windows, macOS frontend | [notice-07dfb46d2e36](#notice-07dfb46d2e36) |
| npm | [rehype-raw](https://www.npmjs.com/package/rehype-raw/v/7.0.0) | 7.0.0 | MIT | Windows, macOS frontend | [notice-d9c32f07344c](#notice-d9c32f07344c) |
| npm | [rehype-sanitize](https://www.npmjs.com/package/rehype-sanitize/v/6.0.0) | 6.0.0 | MIT | Windows, macOS frontend | [notice-d9c32f07344c](#notice-d9c32f07344c) |
| npm | [remark-gfm](https://www.npmjs.com/package/remark-gfm/v/4.0.1) | 4.0.1 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [remark-parse](https://www.npmjs.com/package/remark-parse/v/11.0.0) | 11.0.0 | MIT | Windows, macOS frontend | [notice-f78777570e32](#notice-f78777570e32) |
| npm | [remark-rehype](https://www.npmjs.com/package/remark-rehype/v/11.1.2) | 11.1.2 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [remark-stringify](https://www.npmjs.com/package/remark-stringify/v/11.0.0) | 11.0.0 | MIT | Windows, macOS frontend | [notice-f78777570e32](#notice-f78777570e32) |
| npm | [scheduler](https://www.npmjs.com/package/scheduler/v/0.28.0) | 0.28.0 | MIT | Windows, macOS frontend | [notice-cf9b17822d1f](#notice-cf9b17822d1f) |
| npm | [space-separated-tokens](https://www.npmjs.com/package/space-separated-tokens/v/2.0.2) | 2.0.2 | MIT | Windows, macOS frontend | [notice-d9c32f07344c](#notice-d9c32f07344c) |
| npm | [stringify-entities](https://www.npmjs.com/package/stringify-entities/v/4.0.4) | 4.0.4 | MIT | Windows, macOS frontend | [notice-4be46afa7981](#notice-4be46afa7981) |
| npm | [style-to-js](https://www.npmjs.com/package/style-to-js/v/1.1.21) | 1.1.21 | MIT | Windows, macOS frontend | [notice-bdda7d25f6d1](#notice-bdda7d25f6d1) |
| npm | [style-to-object](https://www.npmjs.com/package/style-to-object/v/1.0.14) | 1.0.14 | MIT | Windows, macOS frontend | [notice-20b25fb4d9ba](#notice-20b25fb4d9ba) |
| npm | [trim-lines](https://www.npmjs.com/package/trim-lines/v/3.0.1) | 3.0.1 | MIT | Windows, macOS frontend | [notice-4be46afa7981](#notice-4be46afa7981) |
| npm | [trough](https://www.npmjs.com/package/trough/v/2.2.0) | 2.2.0 | MIT | Windows, macOS frontend | [notice-e1da326aaf68](#notice-e1da326aaf68) |
| npm | [tslib](https://www.npmjs.com/package/tslib/v/2.8.1) | 2.8.1 | 0BSD | Windows, macOS frontend | [notice-0e8d2550baea](#notice-0e8d2550baea) |
| npm | [unified](https://www.npmjs.com/package/unified/v/11.0.5) | 11.0.5 | MIT | Windows, macOS frontend | [notice-e453dafb35c9](#notice-e453dafb35c9) |
| npm | [unist-util-is](https://www.npmjs.com/package/unist-util-is/v/6.0.1) | 6.0.1 | MIT | Windows, macOS frontend | [notice-a1563f431b1f](#notice-a1563f431b1f) |
| npm | [unist-util-position](https://www.npmjs.com/package/unist-util-position/v/5.0.0) | 5.0.0 | MIT | Windows, macOS frontend | [notice-c37a32dd1cd4](#notice-c37a32dd1cd4) |
| npm | [unist-util-stringify-position](https://www.npmjs.com/package/unist-util-stringify-position/v/4.0.0) | 4.0.0 | MIT | Windows, macOS frontend | [notice-d9c32f07344c](#notice-d9c32f07344c) |
| npm | [unist-util-visit](https://www.npmjs.com/package/unist-util-visit/v/5.1.0) | 5.1.0 | MIT | Windows, macOS frontend | [notice-c37a32dd1cd4](#notice-c37a32dd1cd4) |
| npm | [unist-util-visit-parents](https://www.npmjs.com/package/unist-util-visit-parents/v/6.0.2) | 6.0.2 | MIT | Windows, macOS frontend | [notice-d9c32f07344c](#notice-d9c32f07344c) |
| npm | [use-callback-ref](https://www.npmjs.com/package/use-callback-ref/v/1.3.3) | 1.3.3 | MIT | Windows, macOS frontend | [notice-07dfb46d2e36](#notice-07dfb46d2e36) |
| npm | [use-sidecar](https://www.npmjs.com/package/use-sidecar/v/1.1.3) | 1.1.3 | MIT | Windows, macOS frontend | [notice-07dfb46d2e36](#notice-07dfb46d2e36) |
| npm | [vfile](https://www.npmjs.com/package/vfile/v/6.0.3) | 6.0.3 | MIT | Windows, macOS frontend | [notice-e453dafb35c9](#notice-e453dafb35c9) |
| npm | [vfile-location](https://www.npmjs.com/package/vfile-location/v/5.0.3) | 5.0.3 | MIT | Windows, macOS frontend | [notice-d9c32f07344c](#notice-d9c32f07344c) |
| npm | [vfile-message](https://www.npmjs.com/package/vfile-message/v/4.0.3) | 4.0.3 | MIT | Windows, macOS frontend | [notice-ea559213e0e9](#notice-ea559213e0e9) |
| npm | [web-namespaces](https://www.npmjs.com/package/web-namespaces/v/2.0.1) | 2.0.1 | MIT | Windows, macOS frontend | [notice-d9c32f07344c](#notice-d9c32f07344c) |
| npm | [zwitch](https://www.npmjs.com/package/zwitch/v/2.0.4) | 2.0.4 | MIT | Windows, macOS frontend | [notice-d9c32f07344c](#notice-d9c32f07344c) |
| crate | [adler2](https://crates.io/crates/adler2/2.0.1) | 2.0.1 | 0BSD OR MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-a21c914647d3](#notice-a21c914647d3), [notice-1bc86297d032](#notice-1bc86297d032), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [aead](https://crates.io/crates/aead/0.5.2) | 0.5.2 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-e8541ea93f02](#notice-e8541ea93f02), [notice-b38f573d5bc8](#notice-b38f573d5bc8) |
| crate | [aes](https://crates.io/crates/aes/0.8.4) | 0.8.4 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-e8541ea93f02](#notice-e8541ea93f02), [notice-33e996382660](#notice-33e996382660) |
| crate | [aes-gcm](https://crates.io/crates/aes-gcm/0.10.3) | 0.10.3 | Apache-2.0 OR MIT | macOS Apple Silicon, macOS Intel | [notice-e8541ea93f02](#notice-e8541ea93f02), [notice-e90ad0f8f6fe](#notice-e90ad0f8f6fe) |
| crate | [aho-corasick](https://crates.io/crates/aho-corasick/1.1.5) | 1.1.5 | Unlicense OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-65314a6c9668](#notice-65314a6c9668), [notice-154c1af2b38e](#notice-154c1af2b38e) |
| crate | [alloc-no-stdlib](https://crates.io/crates/alloc-no-stdlib/2.0.4) | 2.0.4 | BSD-3-Clause | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6c91ec82929f](#notice-6c91ec82929f) |
| crate | [alloc-stdlib](https://crates.io/crates/alloc-stdlib/0.2.4) | 0.2.4 | BSD-3-Clause | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6c91ec82929f](#notice-6c91ec82929f) |
| crate | [anstream](https://crates.io/crates/anstream/1.0.0) | 1.0.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [anstyle](https://crates.io/crates/anstyle/1.0.14) | 1.0.14 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [anstyle-parse](https://crates.io/crates/anstyle-parse/1.0.0) | 1.0.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [anstyle-query](https://crates.io/crates/anstyle-query/1.1.5) | 1.1.5 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [anstyle-wincon](https://crates.io/crates/anstyle-wincon/3.0.11) | 3.0.11 | MIT OR Apache-2.0 | Windows x86_64 | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [anyhow](https://crates.io/crates/anyhow/1.0.104) | 1.0.104 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [async-trait](https://crates.io/crates/async-trait/0.1.92) | 0.1.92 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [atomic-waker](https://crates.io/crates/atomic-waker/1.1.2) | 1.1.2 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a), [notice-20746cc8a2fd](#notice-20746cc8a2fd) |
| crate | [autocfg](https://crates.io/crates/autocfg/1.5.1) | 1.5.1 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-99afaa30c178](#notice-99afaa30c178) |
| crate | [base64](https://crates.io/crates/base64/0.21.7) | 0.21.7 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-6a8da4c78c72](#notice-6a8da4c78c72) |
| crate | [base64](https://crates.io/crates/base64/0.22.1) | 0.22.1 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-6a8da4c78c72](#notice-6a8da4c78c72) |
| crate | [base64](https://crates.io/crates/base64/0.23.1) | 0.23.1 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-2ff8d9734312](#notice-2ff8d9734312) |
| crate | [bit-set](https://crates.io/crates/bit-set/0.8.0) | 0.8.0 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-7e1b38c60796](#notice-7e1b38c60796), [notice-4c4e6eed8b86](#notice-4c4e6eed8b86) |
| crate | [bit-vec](https://crates.io/crates/bit-vec/0.8.0) | 0.8.0 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-7e1b38c60796](#notice-7e1b38c60796), [notice-4c4e6eed8b86](#notice-4c4e6eed8b86) |
| crate | [bitflags](https://crates.io/crates/bitflags/1.3.2) | 1.3.2 | MIT/Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-14435fbcd271](#notice-14435fbcd271) |
| crate | [bitflags](https://crates.io/crates/bitflags/2.13.2) | 2.13.2 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-14435fbcd271](#notice-14435fbcd271) |
| crate | [block-buffer](https://crates.io/crates/block-buffer/0.10.4) | 0.10.4 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-e8541ea93f02](#notice-e8541ea93f02), [notice-5ff5253f2cb9](#notice-5ff5253f2cb9) |
| crate | [block2](https://crates.io/crates/block2/0.6.2) | 0.6.2 | MIT | macOS Apple Silicon, macOS Intel | [notice-1aa0a3422448](#notice-1aa0a3422448), [notice-c435050845f9](#notice-c435050845f9) |
| crate | [brotli](https://crates.io/crates/brotli/8.0.4) | 8.0.4 | BSD-3-Clause AND MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6c91ec82929f](#notice-6c91ec82929f), [notice-2a57418d6b10](#notice-2a57418d6b10) |
| crate | [brotli-decompressor](https://crates.io/crates/brotli-decompressor/5.0.3) | 5.0.3 | BSD-3-Clause/MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6c91ec82929f](#notice-6c91ec82929f) |
| crate | [bs58](https://crates.io/crates/bs58/0.5.1) | 0.5.1 | MIT/Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-67047503c71f](#notice-67047503c71f) |
| crate | [byteorder](https://crates.io/crates/byteorder/1.5.0) | 1.5.0 | Unlicense OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-65314a6c9668](#notice-65314a6c9668), [notice-154c1af2b38e](#notice-154c1af2b38e) |
| crate | [bytes](https://crates.io/crates/bytes/1.12.1) | 1.12.1 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-51f778ffff2c](#notice-51f778ffff2c) |
| crate | [camino](https://crates.io/crates/camino/1.2.6) | 1.2.6 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [cargo_metadata](https://crates.io/crates/cargo_metadata/0.19.2) | 0.19.2 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [cargo_toml](https://crates.io/crates/cargo_toml/0.22.3) | 0.22.3 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-fa4363848a0f](#notice-fa4363848a0f) |
| crate | [cargo-platform](https://crates.io/crates/cargo-platform/0.1.9) | 0.1.9 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-1bc86297d032](#notice-1bc86297d032), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [cc](https://crates.io/crates/cc/1.8.0) | 1.8.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-84e1bbfebd74](#notice-84e1bbfebd74) |
| crate | [cfb](https://crates.io/crates/cfb/0.7.3) | 0.7.3 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-3ce3e2561c6a](#notice-3ce3e2561c6a) |
| crate | [cfg_aliases](https://crates.io/crates/cfg_aliases/0.2.2) | 0.2.2 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-48513346d335](#notice-48513346d335) |
| crate | [cfg-if](https://crates.io/crates/cfg-if/1.0.5) | 1.0.5 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-84e1bbfebd74](#notice-84e1bbfebd74) |
| crate | [chacha20](https://crates.io/crates/chacha20/0.10.2) | 0.10.2 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-e8541ea93f02](#notice-e8541ea93f02), [notice-1038b7737a0a](#notice-1038b7737a0a) |
| crate | [chrono](https://crates.io/crates/chrono/0.4.45) | 0.4.45 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-ce4a94c006fa](#notice-ce4a94c006fa) |
| crate | [cipher](https://crates.io/crates/cipher/0.4.4) | 0.4.4 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-e8541ea93f02](#notice-e8541ea93f02), [notice-92f01fc7ca90](#notice-92f01fc7ca90) |
| crate | [clap](https://crates.io/crates/clap/4.6.7) | 4.6.7 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-9b689eac99cd](#notice-9b689eac99cd), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [clap_builder](https://crates.io/crates/clap_builder/4.6.7) | 4.6.7 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-9b689eac99cd](#notice-9b689eac99cd), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [clap_derive](https://crates.io/crates/clap_derive/4.6.7) | 4.6.7 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-9b689eac99cd](#notice-9b689eac99cd), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [clap_lex](https://crates.io/crates/clap_lex/1.1.1) | 1.1.1 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-9b689eac99cd](#notice-9b689eac99cd), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [colorchoice](https://crates.io/crates/colorchoice/1.0.5) | 1.0.5 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [cookie](https://crates.io/crates/cookie/0.18.2) | 0.18.2 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-c859d211879e](#notice-c859d211879e), [notice-47c8d25246e6](#notice-47c8d25246e6) |
| crate | [core_detect](https://crates.io/crates/core_detect/1.0.0) | 1.0.0 | MIT/Apache-2.0 | Windows x86_64, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-57895cdbc8fe](#notice-57895cdbc8fe) |
| crate | [core-foundation](https://crates.io/crates/core-foundation/0.10.1) | 0.10.1 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-3bfacc197ff2](#notice-3bfacc197ff2) |
| crate | [core-foundation-sys](https://crates.io/crates/core-foundation-sys/0.8.7) | 0.8.7 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-3bfacc197ff2](#notice-3bfacc197ff2) |
| crate | [core-graphics](https://crates.io/crates/core-graphics/0.25.0) | 0.25.0 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-537db9073524](#notice-537db9073524), [notice-954f335b8baf](#notice-954f335b8baf), [notice-3bfacc197ff2](#notice-3bfacc197ff2) |
| crate | [core-graphics-types](https://crates.io/crates/core-graphics-types/0.2.0) | 0.2.0 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-3bfacc197ff2](#notice-3bfacc197ff2) |
| crate | [cpufeatures](https://crates.io/crates/cpufeatures/0.2.17) | 0.2.17 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-e8541ea93f02](#notice-e8541ea93f02), [notice-6334e52844d6](#notice-6334e52844d6) |
| crate | [cpufeatures](https://crates.io/crates/cpufeatures/0.3.1) | 0.3.1 | MIT OR Apache-2.0 | Windows x86_64, macOS Intel | [notice-e8541ea93f02](#notice-e8541ea93f02), [notice-ea753cf1e3ec](#notice-ea753cf1e3ec) |
| crate | [crc32fast](https://crates.io/crates/crc32fast/1.5.2) | 1.5.2 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-9599127e421e](#notice-9599127e421e) |
| crate | [crossbeam-channel](https://crates.io/crates/crossbeam-channel/0.5.17) | 0.5.17 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-5a7d13c6710c](#notice-5a7d13c6710c), [notice-d10fa7c720bc](#notice-d10fa7c720bc) |
| crate | [crossbeam-utils](https://crates.io/crates/crossbeam-utils/0.8.23) | 0.8.23 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-5a7d13c6710c](#notice-5a7d13c6710c) |
| crate | [crypto-common](https://crates.io/crates/crypto-common/0.1.7) | 0.1.7 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-e8541ea93f02](#notice-e8541ea93f02), [notice-692b1604961d](#notice-692b1604961d) |
| crate | [cssparser](https://crates.io/crates/cssparser/0.35.0) | 0.35.0 | MPL-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4b89d4518bd1](#notice-4b89d4518bd1) |
| crate | [cssparser](https://crates.io/crates/cssparser/0.36.0) | 0.36.0 | MPL-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4b89d4518bd1](#notice-4b89d4518bd1) |
| crate | [cssparser-macros](https://crates.io/crates/cssparser-macros/0.6.1) | 0.6.1 | MPL-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4b89d4518bd1](#notice-4b89d4518bd1) |
| crate | [ctor](https://crates.io/crates/ctor/0.8.0) | 0.8.0 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-bccaa8b6c09f](#notice-bccaa8b6c09f) |
| crate | [ctor-proc-macro](https://crates.io/crates/ctor-proc-macro/0.0.7) | 0.0.7 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-bccaa8b6c09f](#notice-bccaa8b6c09f) |
| crate | [ctr](https://crates.io/crates/ctr/0.9.2) | 0.9.2 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-e8541ea93f02](#notice-e8541ea93f02), [notice-f3bd9e2e7745](#notice-f3bd9e2e7745) |
| crate | [darling](https://crates.io/crates/darling/0.24.1) | 0.24.1 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cc8f3c8ab396](#notice-cc8f3c8ab396) |
| crate | [darling_core](https://crates.io/crates/darling_core/0.24.1) | 0.24.1 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cc8f3c8ab396](#notice-cc8f3c8ab396) |
| crate | [darling_macro](https://crates.io/crates/darling_macro/0.24.1) | 0.24.1 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cc8f3c8ab396](#notice-cc8f3c8ab396) |
| crate | [defmt](https://crates.io/crates/defmt/1.2.0) | 1.2.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-7e1b38c60796](#notice-7e1b38c60796), [notice-2710a622a896](#notice-2710a622a896) |
| crate | [defmt-macros](https://crates.io/crates/defmt-macros/1.2.0) | 1.2.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-7e1b38c60796](#notice-7e1b38c60796), [notice-2710a622a896](#notice-2710a622a896) |
| crate | [defmt-parser](https://crates.io/crates/defmt-parser/1.1.0) | 1.1.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-7e1b38c60796](#notice-7e1b38c60796), [notice-2710a622a896](#notice-2710a622a896) |
| crate | [deranged](https://crates.io/crates/deranged/0.5.9) | 0.5.9 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-b4839ecf405b](#notice-b4839ecf405b), [notice-1b66e3be6894](#notice-1b66e3be6894) |
| crate | [derive_more](https://crates.io/crates/derive_more/2.1.1) | 2.1.1 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4a4d43f3f90d](#notice-4a4d43f3f90d) |
| crate | [derive_more-impl](https://crates.io/crates/derive_more-impl/2.1.1) | 2.1.1 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4a4d43f3f90d](#notice-4a4d43f3f90d) |
| crate | [digest](https://crates.io/crates/digest/0.10.7) | 0.10.7 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-e8541ea93f02](#notice-e8541ea93f02), [notice-9c5127ab88e8](#notice-9c5127ab88e8) |
| crate | [dirs](https://crates.io/crates/dirs/6.0.0) | 6.0.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-74f1c9127a52](#notice-74f1c9127a52), [notice-f25a5b606859](#notice-f25a5b606859) |
| crate | [dirs-sys](https://crates.io/crates/dirs-sys/0.5.0) | 0.5.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-74f1c9127a52](#notice-74f1c9127a52), [notice-f25a5b606859](#notice-f25a5b606859) |
| crate | [dispatch2](https://crates.io/crates/dispatch2/0.3.1) | 0.3.1 | Zlib OR Apache-2.0 OR MIT | macOS Apple Silicon, macOS Intel | [notice-1aa0a3422448](#notice-1aa0a3422448), [notice-c435050845f9](#notice-c435050845f9) |
| crate | [displaydoc](https://crates.io/crates/displaydoc/0.2.7) | 0.2.7 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [dom_query](https://crates.io/crates/dom_query/0.27.0) | 0.27.0 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-8f8eade124ab](#notice-8f8eade124ab) |
| crate | [dpi](https://crates.io/crates/dpi/0.1.2) | 0.1.2 | Apache-2.0 AND MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-e07664cb9e31](#notice-e07664cb9e31) |
| crate | [dtoa](https://crates.io/crates/dtoa/1.0.11) | 1.0.11 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [dtoa-short](https://crates.io/crates/dtoa-short/0.3.5) | 0.3.5 | MPL-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4b89d4518bd1](#notice-4b89d4518bd1) |
| crate | [dtor](https://crates.io/crates/dtor/0.3.0) | 0.3.0 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-bccaa8b6c09f](#notice-bccaa8b6c09f) |
| crate | [dtor-proc-macro](https://crates.io/crates/dtor-proc-macro/0.0.6) | 0.0.6 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-bccaa8b6c09f](#notice-bccaa8b6c09f) |
| crate | [dunce](https://crates.io/crates/dunce/1.0.5) | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6d489af62926](#notice-6d489af62926) |
| crate | [dyn-clone](https://crates.io/crates/dyn-clone/1.0.20) | 1.0.20 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [ego-tree](https://crates.io/crates/ego-tree/0.10.0) | 0.10.0 | ISC | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-f95a80c3167d](#notice-f95a80c3167d) |
| crate | [embed_plist](https://crates.io/crates/embed_plist/1.2.2) | 1.2.2 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-283ea6cc2997](#notice-283ea6cc2997), [notice-a29c4d8a8e7c](#notice-a29c4d8a8e7c) |
| crate | [embed-resource](https://crates.io/crates/embed-resource/3.0.12) | 3.0.12 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-c4be15bd543a](#notice-c4be15bd543a) |
| crate | [encoding_rs](https://crates.io/crates/encoding_rs/0.8.42) | 0.8.42 | (Apache-2.0 OR MIT) AND BSD-3-Clause | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-1961703c2782](#notice-1961703c2782), [notice-283ea6cc2997](#notice-283ea6cc2997), [notice-7dc2f6402447](#notice-7dc2f6402447), [notice-b1d6d97b0476](#notice-b1d6d97b0476) |
| crate | [equivalent](https://crates.io/crates/equivalent/1.0.3) | 1.0.3 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-4428cd87371a](#notice-4428cd87371a) |
| crate | [erased-serde](https://crates.io/crates/erased-serde/0.4.10) | 0.4.10 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [errno](https://crates.io/crates/errno/0.3.14) | 0.3.14 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-7f91c2a4eddb](#notice-7f91c2a4eddb) |
| crate | [fallible-iterator](https://crates.io/crates/fallible-iterator/0.3.0) | 0.3.0 | MIT/Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-2ff0b8901359](#notice-2ff0b8901359) |
| crate | [fallible-streaming-iterator](https://crates.io/crates/fallible-streaming-iterator/0.1.9) | 0.1.9 | MIT/Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-dfc632cd74cc](#notice-dfc632cd74cc) |
| crate | [fastrand](https://crates.io/crates/fastrand/2.5.0) | 2.5.0 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [fdeflate](https://crates.io/crates/fdeflate/0.3.7) | 0.3.7 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-77949ead506e](#notice-77949ead506e) |
| crate | [filetime](https://crates.io/crates/filetime/0.2.29) | 0.2.29 | MIT/Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-84e1bbfebd74](#notice-84e1bbfebd74) |
| crate | [find-msvc-tools](https://crates.io/crates/find-msvc-tools/0.1.14) | 0.1.14 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-84e1bbfebd74](#notice-84e1bbfebd74) |
| crate | [flate2](https://crates.io/crates/flate2/1.1.10) | 1.1.10 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-1b7402ea003f](#notice-1b7402ea003f) |
| crate | [fnv](https://crates.io/crates/fnv/1.0.7) | 1.0.7 | Apache-2.0 / MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-c48b7333c00b](#notice-c48b7333c00b) |
| crate | [foldhash](https://crates.io/crates/foldhash/0.1.5) | 0.1.5 | Zlib | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-b1181a40b2a7](#notice-b1181a40b2a7) |
| crate | [foldhash](https://crates.io/crates/foldhash/0.2.0) | 0.2.0 | Zlib | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-b1181a40b2a7](#notice-b1181a40b2a7) |
| crate | [foreign-types](https://crates.io/crates/foreign-types/0.5.0) | 0.5.0 | MIT/Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-c9067b1cc20b](#notice-c9067b1cc20b) |
| crate | [foreign-types-macros](https://crates.io/crates/foreign-types-macros/0.2.4) | 0.2.4 | MIT/Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-c9067b1cc20b](#notice-c9067b1cc20b) |
| crate | [foreign-types-shared](https://crates.io/crates/foreign-types-shared/0.3.1) | 0.3.1 | MIT/Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-c9067b1cc20b](#notice-c9067b1cc20b) |
| crate | [form_urlencoded](https://crates.io/crates/form_urlencoded/1.2.2) | 1.2.2 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-33ed9a8ecf55](#notice-33ed9a8ecf55) |
| crate | [futf](https://crates.io/crates/futf/0.1.5) | 0.1.5 | MIT / Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-dfa7fbad0178](#notice-dfa7fbad0178) |
| crate | [futures](https://crates.io/crates/futures/0.3.34) | 0.3.34 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-27480f391bd9](#notice-27480f391bd9), [notice-b420d8add23b](#notice-b420d8add23b) |
| crate | [futures-channel](https://crates.io/crates/futures-channel/0.3.34) | 0.3.34 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-27480f391bd9](#notice-27480f391bd9), [notice-b420d8add23b](#notice-b420d8add23b) |
| crate | [futures-core](https://crates.io/crates/futures-core/0.3.34) | 0.3.34 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-27480f391bd9](#notice-27480f391bd9), [notice-b420d8add23b](#notice-b420d8add23b) |
| crate | [futures-executor](https://crates.io/crates/futures-executor/0.3.34) | 0.3.34 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-27480f391bd9](#notice-27480f391bd9), [notice-b420d8add23b](#notice-b420d8add23b) |
| crate | [futures-io](https://crates.io/crates/futures-io/0.3.34) | 0.3.34 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-27480f391bd9](#notice-27480f391bd9), [notice-b420d8add23b](#notice-b420d8add23b) |
| crate | [futures-macro](https://crates.io/crates/futures-macro/0.3.34) | 0.3.34 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-27480f391bd9](#notice-27480f391bd9), [notice-b420d8add23b](#notice-b420d8add23b) |
| crate | [futures-sink](https://crates.io/crates/futures-sink/0.3.34) | 0.3.34 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-27480f391bd9](#notice-27480f391bd9), [notice-b420d8add23b](#notice-b420d8add23b) |
| crate | [futures-task](https://crates.io/crates/futures-task/0.3.34) | 0.3.34 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-27480f391bd9](#notice-27480f391bd9), [notice-b420d8add23b](#notice-b420d8add23b) |
| crate | [futures-util](https://crates.io/crates/futures-util/0.3.34) | 0.3.34 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-27480f391bd9](#notice-27480f391bd9), [notice-b420d8add23b](#notice-b420d8add23b) |
| crate | [fxhash](https://crates.io/crates/fxhash/0.2.1) | 0.2.1 | Apache-2.0/MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4fa4efc31359](#notice-4fa4efc31359), [notice-c435050845f9](#notice-c435050845f9) |
| crate | [generic-array](https://crates.io/crates/generic-array/0.14.7) | 0.14.7 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-ad4fcfaf8d5b](#notice-ad4fcfaf8d5b) |
| crate | [getrandom](https://crates.io/crates/getrandom/0.2.17) | 0.2.17 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-e7330bf53074](#notice-e7330bf53074), [notice-478d530cbce7](#notice-478d530cbce7) |
| crate | [getrandom](https://crates.io/crates/getrandom/0.3.4) | 0.3.4 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-e7330bf53074](#notice-e7330bf53074), [notice-73af2019a565](#notice-73af2019a565) |
| crate | [getrandom](https://crates.io/crates/getrandom/0.4.3) | 0.4.3 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-e7330bf53074](#notice-e7330bf53074), [notice-94b1870d380c](#notice-94b1870d380c) |
| crate | [ghash](https://crates.io/crates/ghash/0.5.1) | 0.5.1 | Apache-2.0 OR MIT | macOS Apple Silicon, macOS Intel | [notice-e8541ea93f02](#notice-e8541ea93f02), [notice-fc15b628f1c4](#notice-fc15b628f1c4) |
| crate | [glob](https://crates.io/crates/glob/0.3.4) | 0.3.4 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-14435fbcd271](#notice-14435fbcd271) |
| crate | [hashbrown](https://crates.io/crates/hashbrown/0.12.3) | 0.12.3 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-ae9791f02f2b](#notice-ae9791f02f2b) |
| crate | [hashbrown](https://crates.io/crates/hashbrown/0.15.5) | 0.15.5 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-ae9791f02f2b](#notice-ae9791f02f2b) |
| crate | [hashbrown](https://crates.io/crates/hashbrown/0.17.1) | 0.17.1 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-ae9791f02f2b](#notice-ae9791f02f2b) |
| crate | [hashlink](https://crates.io/crates/hashlink/0.10.0) | 0.10.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-7e1b38c60796](#notice-7e1b38c60796), [notice-e915669a595b](#notice-e915669a595b) |
| crate | [heck](https://crates.io/crates/heck/0.5.0) | 0.5.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-033a9383ff21](#notice-033a9383ff21) |
| crate | [hex](https://crates.io/crates/hex/0.4.3) | 0.4.3 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-9dde4a6ad496](#notice-9dde4a6ad496) |
| crate | [html5ever](https://crates.io/crates/html5ever/0.35.0) | 0.35.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-35af0fd88338](#notice-35af0fd88338) |
| crate | [html5ever](https://crates.io/crates/html5ever/0.38.0) | 0.38.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-35af0fd88338](#notice-35af0fd88338) |
| crate | [http](https://crates.io/crates/http/1.5.0) | 1.5.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-881c9fe2d29b](#notice-881c9fe2d29b), [notice-f47894ff9c86](#notice-f47894ff9c86) |
| crate | [http-body](https://crates.io/crates/http-body/1.1.0) | 1.1.0 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-57f841bc9767](#notice-57f841bc9767) |
| crate | [http-body-util](https://crates.io/crates/http-body-util/0.1.5) | 0.1.5 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-57f841bc9767](#notice-57f841bc9767) |
| crate | [httparse](https://crates.io/crates/httparse/1.10.1) | 1.10.1 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-8502803cebb3](#notice-8502803cebb3) |
| crate | [hyper](https://crates.io/crates/hyper/1.12.0) | 1.12.0 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-05f344491a7d](#notice-05f344491a7d) |
| crate | [hyper-rustls](https://crates.io/crates/hyper-rustls/0.27.10) | 0.27.10 | Apache-2.0 OR ISC OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-af6da3f3f6b4](#notice-af6da3f3f6b4), [notice-a3320aa8d192](#notice-a3320aa8d192) |
| crate | [hyper-tls](https://crates.io/crates/hyper-tls/0.6.0) | 0.6.0 | MIT/Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-ef31af832fed](#notice-ef31af832fed) |
| crate | [hyper-util](https://crates.io/crates/hyper-util/0.1.21) | 0.1.21 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-e7d622e4783e](#notice-e7d622e4783e) |
| crate | [iana-time-zone](https://crates.io/crates/iana-time-zone/0.1.65) | 0.1.65 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-793420c92f3c](#notice-793420c92f3c), [notice-3444712f3370](#notice-3444712f3370) |
| crate | [ico](https://crates.io/crates/ico/0.5.0) | 0.5.0 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-95573f040b56](#notice-95573f040b56) |
| crate | [icu_collections](https://crates.io/crates/icu_collections/2.3.0) | 2.3.0 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [icu_locale_core](https://crates.io/crates/icu_locale_core/2.3.0) | 2.3.0 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [icu_normalizer](https://crates.io/crates/icu_normalizer/2.3.0) | 2.3.0 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [icu_normalizer_data](https://crates.io/crates/icu_normalizer_data/2.3.0) | 2.3.0 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [icu_properties](https://crates.io/crates/icu_properties/2.3.0) | 2.3.0 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [icu_properties_data](https://crates.io/crates/icu_properties_data/2.3.0) | 2.3.0 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [icu_provider](https://crates.io/crates/icu_provider/2.3.1) | 2.3.1 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [ident_case](https://crates.io/crates/ident_case/1.0.1) | 1.0.1 | MIT/Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-1847e0e06981](#notice-1847e0e06981) |
| crate | [idna](https://crates.io/crates/idna/1.1.0) | 1.1.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-7a8093fb4a93](#notice-7a8093fb4a93) |
| crate | [idna_adapter](https://crates.io/crates/idna_adapter/1.2.2) | 1.2.2 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-0d8a0aecbcba](#notice-0d8a0aecbcba) |
| crate | [indexmap](https://crates.io/crates/indexmap/1.9.3) | 1.9.3 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-4f2ac128e429](#notice-4f2ac128e429) |
| crate | [indexmap](https://crates.io/crates/indexmap/2.14.2) | 2.14.2 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-4f2ac128e429](#notice-4f2ac128e429) |
| crate | [infer](https://crates.io/crates/infer/0.19.0) | 0.19.0 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-7804ded9273b](#notice-7804ded9273b) |
| crate | [inout](https://crates.io/crates/inout/0.1.4) | 0.1.4 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-e8541ea93f02](#notice-e8541ea93f02), [notice-71366a4092ad](#notice-71366a4092ad) |
| crate | [ipnet](https://crates.io/crates/ipnet/2.12.2) | 2.12.2 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-9d8e882729a5](#notice-9d8e882729a5), [notice-c935506fff2e](#notice-c935506fff2e) |
| crate | [is_terminal_polyfill](https://crates.io/crates/is_terminal_polyfill/1.70.2) | 1.70.2 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [itoa](https://crates.io/crates/itoa/1.0.18) | 1.0.18 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [jiff](https://crates.io/crates/jiff/0.2.38) | 0.2.38 | Unlicense OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-65314a6c9668](#notice-65314a6c9668), [notice-154c1af2b38e](#notice-154c1af2b38e) |
| crate | [jiff-core](https://crates.io/crates/jiff-core/0.1.1) | 0.1.1 | Unlicense OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-65314a6c9668](#notice-65314a6c9668), [notice-154c1af2b38e](#notice-154c1af2b38e) |
| crate | [jiff-tzdb](https://crates.io/crates/jiff-tzdb/0.1.9) | 0.1.9 | Unlicense OR MIT | Windows x86_64 | [notice-65314a6c9668](#notice-65314a6c9668), [notice-154c1af2b38e](#notice-154c1af2b38e) |
| crate | [jiff-tzdb-platform](https://crates.io/crates/jiff-tzdb-platform/0.1.3) | 0.1.3 | Unlicense OR MIT | Windows x86_64 | [notice-65314a6c9668](#notice-65314a6c9668), [notice-154c1af2b38e](#notice-154c1af2b38e) |
| crate | [json-patch](https://crates.io/crates/json-patch/3.0.1) | 3.0.1 | MIT/Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-19328c46c44f](#notice-19328c46c44f) |
| crate | [jsonptr](https://crates.io/crates/jsonptr/0.6.3) | 0.6.3 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-5f89ce4ac63b](#notice-5f89ce4ac63b), [notice-055a17110636](#notice-055a17110636) |
| crate | [keyboard-types](https://crates.io/crates/keyboard-types/0.7.0) | 0.7.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-31dbbab009f1](#notice-31dbbab009f1) |
| crate | [libc](https://crates.io/crates/libc/0.2.191) | 0.2.191 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-c96302294382](#notice-c96302294382) |
| crate | [libsqlite3-sys](https://crates.io/crates/libsqlite3-sys/0.35.0) | 0.35.0 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6061b8ea5b16](#notice-6061b8ea5b16), [notice-40fa3316ba32](#notice-40fa3316ba32), [notice-93c0285e8414](#notice-93c0285e8414) |
| crate | [litemap](https://crates.io/crates/litemap/0.8.3) | 0.8.3 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [lock_api](https://crates.io/crates/lock_api/0.4.14) | 0.4.14 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-8d1f81ea4e87](#notice-8d1f81ea4e87) |
| crate | [log](https://crates.io/crates/log/0.4.34) | 0.4.34 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-14435fbcd271](#notice-14435fbcd271) |
| crate | [lru-slab](https://crates.io/crates/lru-slab/0.1.3) | 0.1.3 | MIT OR Apache-2.0 OR Zlib | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-283ea6cc2997](#notice-283ea6cc2997), [notice-c9cf4d18fd9d](#notice-c9cf4d18fd9d), [notice-cebce11166dc](#notice-cebce11166dc) |
| crate | [mac](https://crates.io/crates/mac/0.1.1) | 0.1.1 | MIT/Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-c435050845f9](#notice-c435050845f9) |
| crate | [macro_rules_attribute](https://crates.io/crates/macro_rules_attribute/0.2.3) | 0.2.3 | Apache-2.0 OR MIT OR Zlib | Windows x86_64 | [notice-7e8d5ce7222b](#notice-7e8d5ce7222b), [notice-87bdea8dbd05](#notice-87bdea8dbd05), [notice-5ebb9a84cad5](#notice-5ebb9a84cad5) |
| crate | [macro_rules_attribute-proc_macro](https://crates.io/crates/macro_rules_attribute-proc_macro/0.2.3) | 0.2.3 | Apache-2.0 OR MIT OR Zlib | Windows x86_64 | [notice-7e8d5ce7222b](#notice-7e8d5ce7222b), [notice-87bdea8dbd05](#notice-87bdea8dbd05), [notice-5ebb9a84cad5](#notice-5ebb9a84cad5) |
| crate | [markup5ever](https://crates.io/crates/markup5ever/0.35.0) | 0.35.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-35af0fd88338](#notice-35af0fd88338) |
| crate | [markup5ever](https://crates.io/crates/markup5ever/0.38.0) | 0.38.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-35af0fd88338](#notice-35af0fd88338) |
| crate | [match_token](https://crates.io/crates/match_token/0.35.0) | 0.35.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-35af0fd88338](#notice-35af0fd88338) |
| crate | [memchr](https://crates.io/crates/memchr/2.8.3) | 2.8.3 | Unlicense OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-65314a6c9668](#notice-65314a6c9668), [notice-154c1af2b38e](#notice-154c1af2b38e) |
| crate | [mime](https://crates.io/crates/mime/0.3.17) | 0.3.17 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-a302dc760d97](#notice-a302dc760d97) |
| crate | [minisign-verify](https://crates.io/crates/minisign-verify/0.2.5) | 0.2.5 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-58f66933c7bb](#notice-58f66933c7bb) |
| crate | [miniz_oxide](https://crates.io/crates/miniz_oxide/0.8.9) | 0.8.9 | MIT OR Zlib OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-7427abc63036](#notice-7427abc63036), [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-ac9859ce4e9a](#notice-ac9859ce4e9a), [notice-eac3911cc3d4](#notice-eac3911cc3d4) |
| crate | [miniz_oxide](https://crates.io/crates/miniz_oxide/0.9.1) | 0.9.1 | MIT OR Zlib OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-7427abc63036](#notice-7427abc63036), [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-ac9859ce4e9a](#notice-ac9859ce4e9a), [notice-eac3911cc3d4](#notice-eac3911cc3d4) |
| crate | [mio](https://crates.io/crates/mio/1.2.4) | 1.2.4 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-c804065b0956](#notice-c804065b0956) |
| crate | [muda](https://crates.io/crates/muda/0.19.3) | 0.19.3 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-859a90323b68](#notice-859a90323b68), [notice-b99f9d43803f](#notice-b99f9d43803f) |
| crate | [multiversion_no_op](https://crates.io/crates/multiversion_no_op/1.0.0) | 1.0.0 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-e08d6d9195b9](#notice-e08d6d9195b9), [notice-283ea6cc2997](#notice-283ea6cc2997), [notice-7dc2f6402447](#notice-7dc2f6402447) |
| crate | [native-tls](https://crates.io/crates/native-tls/0.2.18) | 0.2.18 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-d826e1bb47ee](#notice-d826e1bb47ee) |
| crate | [new_debug_unreachable](https://crates.io/crates/new_debug_unreachable/1.0.6) | 1.0.6 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-42d8a095dbff](#notice-42d8a095dbff) |
| crate | [num-conv](https://crates.io/crates/num-conv/0.2.2) | 0.2.2 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-4d83b119f786](#notice-4d83b119f786) |
| crate | [num-traits](https://crates.io/crates/num-traits/0.2.19) | 0.2.19 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-14435fbcd271](#notice-14435fbcd271) |
| crate | [objc2](https://crates.io/crates/objc2/0.6.5) | 0.6.5 | MIT | macOS Apple Silicon, macOS Intel | [notice-1aa0a3422448](#notice-1aa0a3422448), [notice-c435050845f9](#notice-c435050845f9) |
| crate | [objc2-app-kit](https://crates.io/crates/objc2-app-kit/0.3.2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | macOS Apple Silicon, macOS Intel | [notice-1aa0a3422448](#notice-1aa0a3422448), [notice-c435050845f9](#notice-c435050845f9) |
| crate | [objc2-core-foundation](https://crates.io/crates/objc2-core-foundation/0.3.2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | macOS Apple Silicon, macOS Intel | [notice-1aa0a3422448](#notice-1aa0a3422448), [notice-c435050845f9](#notice-c435050845f9) |
| crate | [objc2-core-graphics](https://crates.io/crates/objc2-core-graphics/0.3.2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | macOS Apple Silicon, macOS Intel | [notice-1aa0a3422448](#notice-1aa0a3422448), [notice-c435050845f9](#notice-c435050845f9) |
| crate | [objc2-encode](https://crates.io/crates/objc2-encode/4.1.0) | 4.1.0 | MIT | macOS Apple Silicon, macOS Intel | [notice-1aa0a3422448](#notice-1aa0a3422448), [notice-c435050845f9](#notice-c435050845f9) |
| crate | [objc2-exception-helper](https://crates.io/crates/objc2-exception-helper/0.1.1) | 0.1.1 | Zlib OR Apache-2.0 OR MIT | macOS Apple Silicon, macOS Intel | [notice-1aa0a3422448](#notice-1aa0a3422448), [notice-c435050845f9](#notice-c435050845f9) |
| crate | [objc2-foundation](https://crates.io/crates/objc2-foundation/0.3.2) | 0.3.2 | MIT | macOS Apple Silicon, macOS Intel | [notice-1aa0a3422448](#notice-1aa0a3422448), [notice-c435050845f9](#notice-c435050845f9) |
| crate | [objc2-io-surface](https://crates.io/crates/objc2-io-surface/0.3.2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | macOS Apple Silicon, macOS Intel | [notice-1aa0a3422448](#notice-1aa0a3422448), [notice-c435050845f9](#notice-c435050845f9) |
| crate | [objc2-osa-kit](https://crates.io/crates/objc2-osa-kit/0.3.2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | macOS Apple Silicon, macOS Intel | [notice-1aa0a3422448](#notice-1aa0a3422448), [notice-c435050845f9](#notice-c435050845f9) |
| crate | [objc2-web-kit](https://crates.io/crates/objc2-web-kit/0.3.2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | macOS Apple Silicon, macOS Intel | [notice-1aa0a3422448](#notice-1aa0a3422448), [notice-c435050845f9](#notice-c435050845f9) |
| crate | [once_cell](https://crates.io/crates/once_cell/1.21.4) | 1.21.4 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [once_cell_polyfill](https://crates.io/crates/once_cell_polyfill/1.70.2) | 1.70.2 | MIT OR Apache-2.0 | Windows x86_64 | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [opaque-debug](https://crates.io/crates/opaque-debug/0.3.1) | 0.3.1 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-e8541ea93f02](#notice-e8541ea93f02), [notice-7873dbb4b866](#notice-7873dbb4b866) |
| crate | [open](https://crates.io/crates/open/5.4.4) | 5.4.4 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-c3ca23514163](#notice-c3ca23514163) |
| crate | [option-ext](https://crates.io/crates/option-ext/0.2.0) | 0.2.0 | MPL-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-86cf9656479f](#notice-86cf9656479f) |
| crate | [osakit](https://crates.io/crates/osakit/0.3.1) | 0.3.1 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-6ca34f7d0a42](#notice-6ca34f7d0a42) |
| crate | [parking_lot](https://crates.io/crates/parking_lot/0.12.5) | 0.12.5 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-8d1f81ea4e87](#notice-8d1f81ea4e87) |
| crate | [parking_lot_core](https://crates.io/crates/parking_lot_core/0.9.12) | 0.9.12 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-8d1f81ea4e87](#notice-8d1f81ea4e87) |
| crate | [pastey](https://crates.io/crates/pastey/0.2.3) | 0.2.3 | MIT OR Apache-2.0 | Windows x86_64 | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [percent-encoding](https://crates.io/crates/percent-encoding/2.3.2) | 2.3.2 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-7a8093fb4a93](#notice-7a8093fb4a93) |
| crate | [phf](https://crates.io/crates/phf/0.11.3) | 0.11.3 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-ec5d7c323662](#notice-ec5d7c323662) |
| crate | [phf](https://crates.io/crates/phf/0.13.1) | 0.13.1 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-ec5d7c323662](#notice-ec5d7c323662) |
| crate | [phf_codegen](https://crates.io/crates/phf_codegen/0.11.3) | 0.11.3 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-ec5d7c323662](#notice-ec5d7c323662) |
| crate | [phf_codegen](https://crates.io/crates/phf_codegen/0.13.1) | 0.13.1 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-ec5d7c323662](#notice-ec5d7c323662) |
| crate | [phf_generator](https://crates.io/crates/phf_generator/0.11.3) | 0.11.3 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-ec5d7c323662](#notice-ec5d7c323662) |
| crate | [phf_generator](https://crates.io/crates/phf_generator/0.13.1) | 0.13.1 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-ec5d7c323662](#notice-ec5d7c323662) |
| crate | [phf_macros](https://crates.io/crates/phf_macros/0.11.3) | 0.11.3 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-ec5d7c323662](#notice-ec5d7c323662) |
| crate | [phf_macros](https://crates.io/crates/phf_macros/0.13.1) | 0.13.1 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-ec5d7c323662](#notice-ec5d7c323662) |
| crate | [phf_shared](https://crates.io/crates/phf_shared/0.11.3) | 0.11.3 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-ec5d7c323662](#notice-ec5d7c323662) |
| crate | [phf_shared](https://crates.io/crates/phf_shared/0.13.1) | 0.13.1 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-ec5d7c323662](#notice-ec5d7c323662) |
| crate | [pin-project-lite](https://crates.io/crates/pin-project-lite/0.2.17) | 0.2.17 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [pkg-config](https://crates.io/crates/pkg-config/0.3.34) | 0.3.34 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-84e1bbfebd74](#notice-84e1bbfebd74) |
| crate | [plist](https://crates.io/crates/plist/1.10.1) | 1.10.1 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-5b0ae40d1a35](#notice-5b0ae40d1a35) |
| crate | [png](https://crates.io/crates/png/0.17.16) | 0.17.16 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-80cdd90699e4](#notice-80cdd90699e4) |
| crate | [png](https://crates.io/crates/png/0.18.1) | 0.18.1 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-80cdd90699e4](#notice-80cdd90699e4) |
| crate | [polyval](https://crates.io/crates/polyval/0.6.2) | 0.6.2 | Apache-2.0 OR MIT | macOS Apple Silicon, macOS Intel | [notice-e8541ea93f02](#notice-e8541ea93f02), [notice-3dad7b797447](#notice-3dad7b797447) |
| crate | [potential_utf](https://crates.io/crates/potential_utf/0.1.6) | 0.1.6 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [powerfmt](https://crates.io/crates/powerfmt/0.2.1) | 0.2.1 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4b05c4b43039](#notice-4b05c4b43039), [notice-6e972f314e81](#notice-6e972f314e81) |
| crate | [precomputed-hash](https://crates.io/crates/precomputed-hash/0.1.1) | 0.1.1 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-695de7436b47](#notice-695de7436b47) |
| crate | [proc-macro2](https://crates.io/crates/proc-macro2/1.0.107) | 1.0.107 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [quick-xml](https://crates.io/crates/quick-xml/0.42.0) | 0.42.0 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-12bfa73c9eac](#notice-12bfa73c9eac) |
| crate | [quinn](https://crates.io/crates/quinn/0.11.12) | 0.11.12 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-283ea6cc2997](#notice-283ea6cc2997), [notice-05fa1ba3228a](#notice-05fa1ba3228a) |
| crate | [quinn-proto](https://crates.io/crates/quinn-proto/0.11.19) | 0.11.19 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-283ea6cc2997](#notice-283ea6cc2997), [notice-05fa1ba3228a](#notice-05fa1ba3228a) |
| crate | [quinn-udp](https://crates.io/crates/quinn-udp/0.5.16) | 0.5.16 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-283ea6cc2997](#notice-283ea6cc2997), [notice-05fa1ba3228a](#notice-05fa1ba3228a) |
| crate | [quote](https://crates.io/crates/quote/1.0.47) | 1.0.47 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [rand](https://crates.io/crates/rand/0.10.3) | 0.10.3 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-2411d70acb18](#notice-2411d70acb18), [notice-fee4d7ce394c](#notice-fee4d7ce394c), [notice-cc367a7134c2](#notice-cc367a7134c2) |
| crate | [rand](https://crates.io/crates/rand/0.8.8) | 0.8.8 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-2411d70acb18](#notice-2411d70acb18), [notice-fee4d7ce394c](#notice-fee4d7ce394c), [notice-cc367a7134c2](#notice-cc367a7134c2) |
| crate | [rand_core](https://crates.io/crates/rand_core/0.10.1) | 0.10.1 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-c9027c55c930](#notice-c9027c55c930), [notice-179c83ef07a5](#notice-179c83ef07a5), [notice-704f0e5f1c84](#notice-704f0e5f1c84) |
| crate | [rand_core](https://crates.io/crates/rand_core/0.6.4) | 0.6.4 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-2411d70acb18](#notice-2411d70acb18), [notice-179c83ef07a5](#notice-179c83ef07a5), [notice-cc367a7134c2](#notice-cc367a7134c2) |
| crate | [rand_pcg](https://crates.io/crates/rand_pcg/0.10.2) | 0.10.2 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-2411d70acb18](#notice-2411d70acb18), [notice-179c83ef07a5](#notice-179c83ef07a5), [notice-c3df7fccc8e5](#notice-c3df7fccc8e5) |
| crate | [raw-window-handle](https://crates.io/crates/raw-window-handle/0.6.2) | 0.6.2 | MIT OR Apache-2.0 OR Zlib | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-aa69fda6dd94](#notice-aa69fda6dd94), [notice-81976b4834c3](#notice-81976b4834c3) |
| crate | [ref-cast](https://crates.io/crates/ref-cast/1.0.27) | 1.0.27 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [ref-cast-impl](https://crates.io/crates/ref-cast-impl/1.0.27) | 1.0.27 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [regex](https://crates.io/crates/regex/1.13.1) | 1.13.1 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-14435fbcd271](#notice-14435fbcd271) |
| crate | [regex-automata](https://crates.io/crates/regex-automata/0.4.18) | 0.4.18 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-14435fbcd271](#notice-14435fbcd271) |
| crate | [regex-syntax](https://crates.io/crates/regex-syntax/0.8.11) | 0.8.11 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-14435fbcd271](#notice-14435fbcd271), [notice-ea8df489e83b](#notice-ea8df489e83b) |
| crate | [reqwest](https://crates.io/crates/reqwest/0.12.28) | 0.12.28 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-5c3866f31ed2](#notice-5c3866f31ed2), [notice-54987d63f266](#notice-54987d63f266) |
| crate | [reqwest](https://crates.io/crates/reqwest/0.13.5) | 0.13.5 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-5c3866f31ed2](#notice-5c3866f31ed2), [notice-bde59a7e336f](#notice-bde59a7e336f) |
| crate | [ring](https://crates.io/crates/ring/0.17.14) | 0.17.14 | Apache-2.0 AND ISC | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-edb9c6dbff46](#notice-edb9c6dbff46), [notice-473867fcf89f](#notice-473867fcf89f), [notice-07414b6c33f3](#notice-07414b6c33f3), [notice-954f335b8baf](#notice-954f335b8baf), [notice-740a360e4d9c](#notice-740a360e4d9c), [notice-f1954d2b51ee](#notice-f1954d2b51ee) |
| crate | [rmcp](https://crates.io/crates/rmcp/3.5.1) | 3.5.1 | Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-f5854c00454b](#notice-f5854c00454b) |
| crate | [rusqlite](https://crates.io/crates/rusqlite/0.37.0) | 0.37.0 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6061b8ea5b16](#notice-6061b8ea5b16) |
| crate | [rustc_version](https://crates.io/crates/rustc_version/0.4.1) | 0.4.1 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-8d1f81ea4e87](#notice-8d1f81ea4e87) |
| crate | [rustc-hash](https://crates.io/crates/rustc-hash/2.1.3) | 2.1.3 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [rustix](https://crates.io/crates/rustix/1.1.5) | 1.1.5 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | macOS Apple Silicon, macOS Intel | [notice-fde2a68c47d2](#notice-fde2a68c47d2), [notice-954f335b8baf](#notice-954f335b8baf), [notice-2f213ec6b135](#notice-2f213ec6b135), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [rustls](https://crates.io/crates/rustls/0.23.46) | 0.23.46 | Apache-2.0 OR ISC OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-af6da3f3f6b4](#notice-af6da3f3f6b4), [notice-a3320aa8d192](#notice-a3320aa8d192) |
| crate | [rustls-pki-types](https://crates.io/crates/rustls-pki-types/1.15.1) | 1.15.1 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-430e912c26ce](#notice-430e912c26ce), [notice-c5e7f780f961](#notice-c5e7f780f961) |
| crate | [rustls-webpki](https://crates.io/crates/rustls-webpki/0.103.16) | 0.103.16 | ISC | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-3ac27594ed56](#notice-3ac27594ed56) |
| crate | [rustversion](https://crates.io/crates/rustversion/1.0.23) | 1.0.23 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [ryu](https://crates.io/crates/ryu/1.0.23) | 1.0.23 | Apache-2.0 OR BSL-1.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-8d8291caf1ce](#notice-8d8291caf1ce) |
| crate | [same-file](https://crates.io/crates/same-file/1.0.6) | 1.0.6 | Unlicense/MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-65314a6c9668](#notice-65314a6c9668), [notice-739620ea44ad](#notice-739620ea44ad) |
| crate | [schannel](https://crates.io/crates/schannel/0.1.30) | 0.1.30 | MIT | Windows x86_64 | [notice-1ecbb241444a](#notice-1ecbb241444a) |
| crate | [schemars](https://crates.io/crates/schemars/0.8.22) | 0.8.22 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-1ddb39b2b497](#notice-1ddb39b2b497) |
| crate | [schemars](https://crates.io/crates/schemars/0.9.0) | 0.9.0 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-1ddb39b2b497](#notice-1ddb39b2b497) |
| crate | [schemars](https://crates.io/crates/schemars/1.2.3) | 1.2.3 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-1ddb39b2b497](#notice-1ddb39b2b497) |
| crate | [schemars_derive](https://crates.io/crates/schemars_derive/0.8.22) | 0.8.22 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-1ddb39b2b497](#notice-1ddb39b2b497) |
| crate | [scopeguard](https://crates.io/crates/scopeguard/1.2.0) | 1.2.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-1a6aa2616e74](#notice-1a6aa2616e74) |
| crate | [scraper](https://crates.io/crates/scraper/0.24.0) | 0.24.0 | ISC | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-1480f3f404a7](#notice-1480f3f404a7) |
| crate | [security-framework](https://crates.io/crates/security-framework/3.7.0) | 3.7.0 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-37412fff76e3](#notice-37412fff76e3) |
| crate | [security-framework-sys](https://crates.io/crates/security-framework-sys/2.17.0) | 2.17.0 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-37412fff76e3](#notice-37412fff76e3) |
| crate | [selectors](https://crates.io/crates/selectors/0.31.0) | 0.31.0 | MPL-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-86cf9656479f](#notice-86cf9656479f) |
| crate | [selectors](https://crates.io/crates/selectors/0.36.1) | 0.36.1 | MPL-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-86cf9656479f](#notice-86cf9656479f) |
| crate | [semver](https://crates.io/crates/semver/1.0.28) | 1.0.28 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [serde](https://crates.io/crates/serde/1.0.229) | 1.0.229 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [serde_core](https://crates.io/crates/serde_core/1.0.229) | 1.0.229 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [serde_derive](https://crates.io/crates/serde_derive/1.0.229) | 1.0.229 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [serde_derive_internals](https://crates.io/crates/serde_derive_internals/0.29.1) | 0.29.1 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [serde_json](https://crates.io/crates/serde_json/1.0.154) | 1.0.154 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [serde_repr](https://crates.io/crates/serde_repr/0.1.21) | 0.1.21 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [serde_spanned](https://crates.io/crates/serde_spanned/1.1.2) | 1.1.2 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-9b689eac99cd](#notice-9b689eac99cd), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [serde_urlencoded](https://crates.io/crates/serde_urlencoded/0.7.1) | 0.7.1 | MIT/Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-b5dae9532426](#notice-b5dae9532426) |
| crate | [serde_with](https://crates.io/crates/serde_with/3.24.0) | 3.24.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-fdd1c2117bcf](#notice-fdd1c2117bcf) |
| crate | [serde_with_macros](https://crates.io/crates/serde_with_macros/3.24.0) | 3.24.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-fdd1c2117bcf](#notice-fdd1c2117bcf) |
| crate | [serde-untagged](https://crates.io/crates/serde-untagged/0.1.9) | 0.1.9 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [serialize-to-javascript](https://crates.io/crates/serialize-to-javascript/0.1.2) | 0.1.2 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-283ea6cc2997](#notice-283ea6cc2997), [notice-777eb7417541](#notice-777eb7417541) |
| crate | [serialize-to-javascript-impl](https://crates.io/crates/serialize-to-javascript-impl/0.1.2) | 0.1.2 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-283ea6cc2997](#notice-283ea6cc2997), [notice-777eb7417541](#notice-777eb7417541) |
| crate | [servo_arc](https://crates.io/crates/servo_arc/0.4.3) | 0.4.3 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [sha2](https://crates.io/crates/sha2/0.10.9) | 0.10.9 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-e8541ea93f02](#notice-e8541ea93f02), [notice-4031faf6212e](#notice-4031faf6212e) |
| crate | [shlex](https://crates.io/crates/shlex/2.0.1) | 2.0.1 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-a759ce38c686](#notice-a759ce38c686), [notice-cc5ba5589dfb](#notice-cc5ba5589dfb) |
| crate | [simd-adler32](https://crates.io/crates/simd-adler32/0.3.10) | 0.3.10 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-627eff66d6c4](#notice-627eff66d6c4) |
| crate | [simdutf8](https://crates.io/crates/simdutf8/0.1.5) | 0.1.5 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-1847e0e06981](#notice-1847e0e06981) |
| crate | [siphasher](https://crates.io/crates/siphasher/1.0.4) | 1.0.4 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-24e26e8fb783](#notice-24e26e8fb783), [notice-283ea6cc2997](#notice-283ea6cc2997), [notice-21a2121221d2](#notice-21a2121221d2) |
| crate | [slab](https://crates.io/crates/slab/0.4.12) | 0.4.12 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-12c7116c4425](#notice-12c7116c4425) |
| crate | [smallvec](https://crates.io/crates/smallvec/1.16.3) | 1.16.3 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-7f194ae45c25](#notice-7f194ae45c25) |
| crate | [socket2](https://crates.io/crates/socket2/0.6.5) | 0.6.5 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-84e1bbfebd74](#notice-84e1bbfebd74) |
| crate | [softbuffer](https://crates.io/crates/softbuffer/0.4.8) | 0.4.8 | MIT OR Apache-2.0 | Windows x86_64 | [notice-1fc3bc7f4a1b](#notice-1fc3bc7f4a1b), [notice-f8babf2965a4](#notice-f8babf2965a4) |
| crate | [sse-stream](https://crates.io/crates/sse-stream/0.2.6) | 0.2.6 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-283ea6cc2997](#notice-283ea6cc2997), [notice-dd81a81bc100](#notice-dd81a81bc100) |
| crate | [stable_deref_trait](https://crates.io/crates/stable_deref_trait/1.2.1) | 1.2.1 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-5e05b024f653](#notice-5e05b024f653) |
| crate | [string_cache](https://crates.io/crates/string_cache/0.8.9) | 0.8.9 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-3bfacc197ff2](#notice-3bfacc197ff2) |
| crate | [string_cache](https://crates.io/crates/string_cache/0.9.0) | 0.9.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-3bfacc197ff2](#notice-3bfacc197ff2) |
| crate | [string_cache_codegen](https://crates.io/crates/string_cache_codegen/0.5.4) | 0.5.4 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-3bfacc197ff2](#notice-3bfacc197ff2) |
| crate | [string_cache_codegen](https://crates.io/crates/string_cache_codegen/0.6.1) | 0.6.1 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-3bfacc197ff2](#notice-3bfacc197ff2) |
| crate | [strsim](https://crates.io/crates/strsim/0.11.1) | 0.11.1 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-8fd8980cab89](#notice-8fd8980cab89) |
| crate | [subtle](https://crates.io/crates/subtle/2.6.1) | 2.6.1 | BSD-3-Clause | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-24fa06d8eae3](#notice-24fa06d8eae3) |
| crate | [swift-rs](https://crates.io/crates/swift-rs/1.0.9) | 1.0.9 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-d588236a8ad8](#notice-d588236a8ad8), [notice-7593ea50d2d4](#notice-7593ea50d2d4) |
| crate | [syn](https://crates.io/crates/syn/2.0.119) | 2.0.119 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [syn](https://crates.io/crates/syn/3.0.9) | 3.0.9 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [sync_wrapper](https://crates.io/crates/sync_wrapper/1.0.2) | 1.0.2 | Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4bf96504d6e8](#notice-4bf96504d6e8) |
| crate | [synstructure](https://crates.io/crates/synstructure/0.14.0) | 0.14.0 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-3a036676ec8c](#notice-3a036676ec8c) |
| crate | [tao](https://crates.io/crates/tao/0.35.3) | 0.35.3 | Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-28694f36acab](#notice-28694f36acab) |
| crate | [tar](https://crates.io/crates/tar/0.4.46) | 0.4.46 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-e6e853531994](#notice-e6e853531994) |
| crate | [tauri](https://crates.io/crates/tauri/2.11.6) | 2.11.6 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-89ff9689dcf9](#notice-89ff9689dcf9) |
| crate | [tauri-build](https://crates.io/crates/tauri-build/2.6.3) | 2.6.3 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-89ff9689dcf9](#notice-89ff9689dcf9) |
| crate | [tauri-codegen](https://crates.io/crates/tauri-codegen/2.6.3) | 2.6.3 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-89ff9689dcf9](#notice-89ff9689dcf9) |
| crate | [tauri-macros](https://crates.io/crates/tauri-macros/2.6.3) | 2.6.3 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-89ff9689dcf9](#notice-89ff9689dcf9) |
| crate | [tauri-plugin](https://crates.io/crates/tauri-plugin/2.6.3) | 2.6.3 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-89ff9689dcf9](#notice-89ff9689dcf9) |
| crate | [tauri-plugin-opener](https://crates.io/crates/tauri-plugin-opener/2.5.4) | 2.5.4 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-eb8a6c846304](#notice-eb8a6c846304), [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-89ff9689dcf9](#notice-89ff9689dcf9) |
| crate | [tauri-plugin-process](https://crates.io/crates/tauri-plugin-process/2.3.0) | 2.3.0 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-eb8a6c846304](#notice-eb8a6c846304), [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-89ff9689dcf9](#notice-89ff9689dcf9) |
| crate | [tauri-plugin-updater](https://crates.io/crates/tauri-plugin-updater/2.9.0) | 2.9.0 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-eb8a6c846304](#notice-eb8a6c846304), [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-89ff9689dcf9](#notice-89ff9689dcf9) |
| crate | [tauri-runtime](https://crates.io/crates/tauri-runtime/2.11.3) | 2.11.3 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-89ff9689dcf9](#notice-89ff9689dcf9) |
| crate | [tauri-runtime-wry](https://crates.io/crates/tauri-runtime-wry/2.11.4) | 2.11.4 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-89ff9689dcf9](#notice-89ff9689dcf9) |
| crate | [tauri-utils](https://crates.io/crates/tauri-utils/2.9.3) | 2.9.3 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-89ff9689dcf9](#notice-89ff9689dcf9) |
| crate | [tauri-winres](https://crates.io/crates/tauri-winres/0.3.6) | 0.3.6 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-a2c382fbddcc](#notice-a2c382fbddcc) |
| crate | [tempfile](https://crates.io/crates/tempfile/3.27.0) | 3.27.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-7bdd5c5e8ad0](#notice-7bdd5c5e8ad0) |
| crate | [tendril](https://crates.io/crates/tendril/0.4.3) | 0.4.3 | MIT/Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-dfa7fbad0178](#notice-dfa7fbad0178) |
| crate | [tendril](https://crates.io/crates/tendril/0.5.1) | 0.5.1 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-dfa7fbad0178](#notice-dfa7fbad0178) |
| crate | [thiserror](https://crates.io/crates/thiserror/1.0.69) | 1.0.69 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [thiserror](https://crates.io/crates/thiserror/2.0.21) | 2.0.21 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [thiserror-impl](https://crates.io/crates/thiserror-impl/1.0.69) | 1.0.69 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [thiserror-impl](https://crates.io/crates/thiserror-impl/2.0.21) | 2.0.21 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [time](https://crates.io/crates/time/0.3.55) | 0.3.55 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-7fdbca77dec6](#notice-7fdbca77dec6) |
| crate | [time-core](https://crates.io/crates/time-core/0.1.9) | 0.1.9 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-7fdbca77dec6](#notice-7fdbca77dec6) |
| crate | [time-macros](https://crates.io/crates/time-macros/0.2.32) | 0.2.32 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-4bf96504d6e8](#notice-4bf96504d6e8), [notice-7fdbca77dec6](#notice-7fdbca77dec6) |
| crate | [tinystr](https://crates.io/crates/tinystr/0.8.4) | 0.8.4 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [tinyvec](https://crates.io/crates/tinyvec/1.13.3) | 1.13.3 | Zlib OR Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-283ea6cc2997](#notice-283ea6cc2997), [notice-bccaa8b6c09f](#notice-bccaa8b6c09f), [notice-943f36fd309f](#notice-943f36fd309f) |
| crate | [tokio](https://crates.io/crates/tokio/1.53.3) | 1.53.3 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-3e1bef82aa0d](#notice-3e1bef82aa0d) |
| crate | [tokio-macros](https://crates.io/crates/tokio-macros/2.7.2) | 2.7.2 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-c0fdcda1a4ff](#notice-c0fdcda1a4ff) |
| crate | [tokio-native-tls](https://crates.io/crates/tokio-native-tls/0.3.1) | 0.3.1 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-c1e08ee9a728](#notice-c1e08ee9a728) |
| crate | [tokio-rustls](https://crates.io/crates/tokio-rustls/0.26.6) | 0.26.6 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-acddfb05f07a](#notice-acddfb05f07a), [notice-1b0258c48739](#notice-1b0258c48739) |
| crate | [tokio-stream](https://crates.io/crates/tokio-stream/0.1.19) | 0.1.19 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-3e1bef82aa0d](#notice-3e1bef82aa0d) |
| crate | [tokio-util](https://crates.io/crates/tokio-util/0.7.20) | 0.7.20 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-3e1bef82aa0d](#notice-3e1bef82aa0d) |
| crate | [toml](https://crates.io/crates/toml/0.9.12+spec-1.1.0) | 0.9.12+spec-1.1.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [toml](https://crates.io/crates/toml/1.1.8+spec-1.1.0) | 1.1.8+spec-1.1.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-9b689eac99cd](#notice-9b689eac99cd), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [toml_datetime](https://crates.io/crates/toml_datetime/0.7.5+spec-1.1.0) | 0.7.5+spec-1.1.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6dc0e068dcf3](#notice-6dc0e068dcf3), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [toml_datetime](https://crates.io/crates/toml_datetime/1.1.2+spec-1.1.0) | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-9b689eac99cd](#notice-9b689eac99cd), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [toml_parser](https://crates.io/crates/toml_parser/1.1.5+spec-1.1.0) | 1.1.5+spec-1.1.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-9b689eac99cd](#notice-9b689eac99cd), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [toml_writer](https://crates.io/crates/toml_writer/1.1.3+spec-1.1.0) | 1.1.3+spec-1.1.0 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-9b689eac99cd](#notice-9b689eac99cd), [notice-4498464c2864](#notice-4498464c2864) |
| crate | [tower](https://crates.io/crates/tower/0.5.3) | 0.5.3 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-da6b30502bad](#notice-da6b30502bad) |
| crate | [tower-http](https://crates.io/crates/tower-http/0.6.11) | 0.6.11 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-edd4b164997f](#notice-edd4b164997f) |
| crate | [tower-layer](https://crates.io/crates/tower-layer/0.3.3) | 0.3.3 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-da6b30502bad](#notice-da6b30502bad) |
| crate | [tower-service](https://crates.io/crates/tower-service/0.3.3) | 0.3.3 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-da6b30502bad](#notice-da6b30502bad) |
| crate | [tracing](https://crates.io/crates/tracing/0.1.44) | 0.1.44 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-c1e08ee9a728](#notice-c1e08ee9a728) |
| crate | [tracing-attributes](https://crates.io/crates/tracing-attributes/0.1.31) | 0.1.31 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-c1e08ee9a728](#notice-c1e08ee9a728) |
| crate | [tracing-core](https://crates.io/crates/tracing-core/0.1.36) | 0.1.36 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-c1e08ee9a728](#notice-c1e08ee9a728), [notice-6ac8711fb340](#notice-6ac8711fb340) |
| crate | [tray-icon](https://crates.io/crates/tray-icon/0.24.2) | 0.24.2 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-859a90323b68](#notice-859a90323b68), [notice-6c1e5d0ccf5e](#notice-6c1e5d0ccf5e) |
| crate | [try-lock](https://crates.io/crates/try-lock/0.2.5) | 0.2.5 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-381f992f70f7](#notice-381f992f70f7) |
| crate | [typeid](https://crates.io/crates/typeid/1.0.3) | 1.0.3 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [typenum](https://crates.io/crates/typenum/1.20.1) | 1.20.1 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-db11fec99467](#notice-db11fec99467), [notice-65dc2a869ff7](#notice-65dc2a869ff7), [notice-87ebb37988ef](#notice-87ebb37988ef) |
| crate | [unic-char-property](https://crates.io/crates/unic-char-property/0.9.0) | 0.9.0 | MIT/Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-30fefc3a7d6a](#notice-30fefc3a7d6a), [notice-c193d216d646](#notice-c193d216d646) |
| crate | [unic-char-range](https://crates.io/crates/unic-char-range/0.9.0) | 0.9.0 | MIT/Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-30fefc3a7d6a](#notice-30fefc3a7d6a), [notice-c193d216d646](#notice-c193d216d646) |
| crate | [unic-common](https://crates.io/crates/unic-common/0.9.0) | 0.9.0 | MIT/Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-30fefc3a7d6a](#notice-30fefc3a7d6a), [notice-c193d216d646](#notice-c193d216d646) |
| crate | [unic-ucd-ident](https://crates.io/crates/unic-ucd-ident/0.9.0) | 0.9.0 | MIT/Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-30fefc3a7d6a](#notice-30fefc3a7d6a), [notice-c193d216d646](#notice-c193d216d646) |
| crate | [unic-ucd-version](https://crates.io/crates/unic-ucd-version/0.9.0) | 0.9.0 | MIT/Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-30fefc3a7d6a](#notice-30fefc3a7d6a), [notice-c193d216d646](#notice-c193d216d646) |
| crate | [unicode-ident](https://crates.io/crates/unicode-ident/1.0.27) | 1.0.27 | (MIT OR Apache-2.0) AND Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a), [notice-361d79129578](#notice-361d79129578) |
| crate | [unicode-segmentation](https://crates.io/crates/unicode-segmentation/1.13.3) | 1.13.3 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-20cec30ad778](#notice-20cec30ad778), [notice-954f335b8baf](#notice-954f335b8baf), [notice-033a9383ff21](#notice-033a9383ff21) |
| crate | [universal-hash](https://crates.io/crates/universal-hash/0.5.1) | 0.5.1 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-e8541ea93f02](#notice-e8541ea93f02), [notice-7cfd98aeed13](#notice-7cfd98aeed13) |
| crate | [untrusted](https://crates.io/crates/untrusted/0.9.0) | 0.9.0 | ISC | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-a1fff3442978](#notice-a1fff3442978) |
| crate | [url](https://crates.io/crates/url/2.5.8) | 2.5.8 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-7a8093fb4a93](#notice-7a8093fb4a93) |
| crate | [urlpattern](https://crates.io/crates/urlpattern/0.3.0) | 0.3.0 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-f2459c4b106b](#notice-f2459c4b106b) |
| crate | [utf-8](https://crates.io/crates/utf-8/0.7.6) | 0.7.6 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |
| crate | [utf8_iter](https://crates.io/crates/utf8_iter/1.0.4) | 1.0.4 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-76c0e37c107d](#notice-76c0e37c107d), [notice-283ea6cc2997](#notice-283ea6cc2997), [notice-7dc2f6402447](#notice-7dc2f6402447) |
| crate | [utf8parse](https://crates.io/crates/utf8parse/0.2.2) | 0.2.2 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-85ad950cce87](#notice-85ad950cce87), [notice-db2c904eb568](#notice-db2c904eb568) |
| crate | [uuid](https://crates.io/crates/uuid/1.26.1) | 1.26.1 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-11cd7e6caed4](#notice-11cd7e6caed4) |
| crate | [vcpkg](https://crates.io/crates/vcpkg/0.2.15) | 0.2.15 | MIT/Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-6196143cbaf5](#notice-6196143cbaf5) |
| crate | [version_check](https://crates.io/crates/version_check/0.9.5) | 0.9.5 | MIT/Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-ed2fda479dac](#notice-ed2fda479dac) |
| crate | [vswhom](https://crates.io/crates/vswhom/0.1.0) | 0.1.0 | MIT | Windows x86_64 | [notice-b9720ca7a91f](#notice-b9720ca7a91f) |
| crate | [vswhom-sys](https://crates.io/crates/vswhom-sys/0.1.3) | 0.1.3 | MIT | Windows x86_64 | [notice-b9720ca7a91f](#notice-b9720ca7a91f) |
| crate | [walkdir](https://crates.io/crates/walkdir/2.5.0) | 2.5.0 | Unlicense/MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-65314a6c9668](#notice-65314a6c9668), [notice-154c1af2b38e](#notice-154c1af2b38e) |
| crate | [want](https://crates.io/crates/want/0.3.2) | 0.3.2 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-f7dfffe03f9f](#notice-f7dfffe03f9f) |
| crate | [web_atoms](https://crates.io/crates/web_atoms/0.1.3) | 0.1.3 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-35af0fd88338](#notice-35af0fd88338) |
| crate | [web_atoms](https://crates.io/crates/web_atoms/0.2.6) | 0.2.6 | MIT OR Apache-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-35af0fd88338](#notice-35af0fd88338) |
| crate | [webpki-roots](https://crates.io/crates/webpki-roots/1.0.11) | 1.0.11 | CDLA-Permissive-2.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-d30183ec6610](#notice-d30183ec6610) |
| crate | [webview2-com](https://crates.io/crates/webview2-com/0.38.2) | 0.38.2 | MIT | Windows x86_64 | [notice-008f1b11c6d1](#notice-008f1b11c6d1) |
| crate | [webview2-com-macros](https://crates.io/crates/webview2-com-macros/0.8.1) | 0.8.1 | MIT | Windows x86_64 | [notice-008f1b11c6d1](#notice-008f1b11c6d1) |
| crate | [webview2-com-sys](https://crates.io/crates/webview2-com-sys/0.38.2) | 0.38.2 | MIT | Windows x86_64 | [notice-008f1b11c6d1](#notice-008f1b11c6d1) |
| crate | [winapi-util](https://crates.io/crates/winapi-util/0.1.11) | 0.1.11 | Unlicense OR MIT | Windows x86_64 | [notice-65314a6c9668](#notice-65314a6c9668), [notice-739620ea44ad](#notice-739620ea44ad) |
| crate | [window-vibrancy](https://crates.io/crates/window-vibrancy/0.6.0) | 0.6.0 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-b46700117441](#notice-b46700117441), [notice-bb8278137f73](#notice-bb8278137f73) |
| crate | [windows](https://crates.io/crates/windows/0.58.0) | 0.58.0 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows](https://crates.io/crates/windows/0.61.3) | 0.61.3 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows_x86_64_msvc](https://crates.io/crates/windows_x86_64_msvc/0.52.6) | 0.52.6 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows_x86_64_msvc](https://crates.io/crates/windows_x86_64_msvc/0.53.1) | 0.53.1 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-collections](https://crates.io/crates/windows-collections/0.2.0) | 0.2.0 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-core](https://crates.io/crates/windows-core/0.58.0) | 0.58.0 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-core](https://crates.io/crates/windows-core/0.61.2) | 0.61.2 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-future](https://crates.io/crates/windows-future/0.2.1) | 0.2.1 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-implement](https://crates.io/crates/windows-implement/0.58.0) | 0.58.0 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-implement](https://crates.io/crates/windows-implement/0.60.2) | 0.60.2 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-interface](https://crates.io/crates/windows-interface/0.58.0) | 0.58.0 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-interface](https://crates.io/crates/windows-interface/0.59.3) | 0.59.3 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-link](https://crates.io/crates/windows-link/0.1.3) | 0.1.3 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-link](https://crates.io/crates/windows-link/0.2.1) | 0.2.1 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-numerics](https://crates.io/crates/windows-numerics/0.2.0) | 0.2.0 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-result](https://crates.io/crates/windows-result/0.2.0) | 0.2.0 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-result](https://crates.io/crates/windows-result/0.3.4) | 0.3.4 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-strings](https://crates.io/crates/windows-strings/0.1.0) | 0.1.0 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-strings](https://crates.io/crates/windows-strings/0.4.2) | 0.4.2 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-sys](https://crates.io/crates/windows-sys/0.59.0) | 0.59.0 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-sys](https://crates.io/crates/windows-sys/0.60.2) | 0.60.2 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-sys](https://crates.io/crates/windows-sys/0.61.2) | 0.61.2 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-targets](https://crates.io/crates/windows-targets/0.52.6) | 0.52.6 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-targets](https://crates.io/crates/windows-targets/0.53.5) | 0.53.5 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-threading](https://crates.io/crates/windows-threading/0.1.0) | 0.1.0 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [windows-version](https://crates.io/crates/windows-version/0.1.7) | 0.1.7 | MIT OR Apache-2.0 | Windows x86_64 | [notice-783829b43aac](#notice-783829b43aac), [notice-ff82c90f8494](#notice-ff82c90f8494) |
| crate | [winnow](https://crates.io/crates/winnow/0.7.15) | 0.7.15 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-8793aa4141de](#notice-8793aa4141de) |
| crate | [winnow](https://crates.io/crates/winnow/1.0.4) | 1.0.4 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-8793aa4141de](#notice-8793aa4141de) |
| crate | [winreg](https://crates.io/crates/winreg/0.56.0) | 0.56.0 | MIT | Windows x86_64 | [notice-d9ba37d9bbdf](#notice-d9ba37d9bbdf) |
| crate | [winvd](https://crates.io/crates/winvd/0.0.49) | 0.0.49 | MIT | Windows x86_64 | [notice-1b4e6722da7c](#notice-1b4e6722da7c) |
| crate | [writeable](https://crates.io/crates/writeable/0.6.4) | 0.6.4 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [wry](https://crates.io/crates/wry/0.55.1) | 0.55.1 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-86eb6a41ef64](#notice-86eb6a41ef64), [notice-26235c41e314](#notice-26235c41e314) |
| crate | [xattr](https://crates.io/crates/xattr/1.6.1) | 1.6.1 | MIT OR Apache-2.0 | macOS Apple Silicon, macOS Intel | [notice-954f335b8baf](#notice-954f335b8baf), [notice-7bdd5c5e8ad0](#notice-7bdd5c5e8ad0) |
| crate | [yoke](https://crates.io/crates/yoke/0.8.3) | 0.8.3 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [yoke-derive](https://crates.io/crates/yoke-derive/0.8.4) | 0.8.4 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [zerofrom](https://crates.io/crates/zerofrom/0.1.8) | 0.1.8 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [zerofrom-derive](https://crates.io/crates/zerofrom-derive/0.1.8) | 0.1.8 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [zeroize](https://crates.io/crates/zeroize/1.9.1) | 1.9.1 | Apache-2.0 OR MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-283ea6cc2997](#notice-283ea6cc2997), [notice-836ed921bbad](#notice-836ed921bbad) |
| crate | [zerotrie](https://crates.io/crates/zerotrie/0.2.5) | 0.2.5 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [zerovec](https://crates.io/crates/zerovec/0.11.8) | 0.11.8 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [zerovec-derive](https://crates.io/crates/zerovec-derive/0.11.6) | 0.11.6 | Unicode-3.0 | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-cde87abe221f](#notice-cde87abe221f) |
| crate | [zip](https://crates.io/crates/zip/4.6.1) | 4.6.1 | MIT | Windows x86_64 | [notice-04dc52136d82](#notice-04dc52136d82) |
| crate | [zlib-rs](https://crates.io/crates/zlib-rs/0.6.8) | 0.6.8 | Zlib | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-6ddf0fba55d4](#notice-6ddf0fba55d4) |
| crate | [zmij](https://crates.io/crates/zmij/1.0.23) | 1.0.23 | MIT | Windows x86_64, macOS Apple Silicon, macOS Intel | [notice-30fefc3a7d6a](#notice-30fefc3a7d6a) |

## 作者与来源记录

作者名称来自已锁定 npm 包 / Cargo metadata；许可文本中的版权声明具有其原本含义。

- npm @floating-ui/core@1.8.0 — atomiks — https://github.com/floating-ui/floating-ui.git
- npm @floating-ui/dom@1.8.0 — atomiks — https://github.com/floating-ui/floating-ui.git
- npm @floating-ui/react-dom@2.1.9 — atomiks — https://github.com/floating-ui/floating-ui.git
- npm @floating-ui/utils@0.2.12 — atomiks — https://github.com/floating-ui/floating-ui.git
- npm @radix-ui/primitive@1.2.0 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-arrow@1.1.17 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-collection@1.2.0 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-compose-refs@1.1.5 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-context@1.3.0 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-direction@1.2.0 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-dismissable-layer@1.2.1 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-dropdown-menu@2.2.1 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-focus-guards@1.2.0 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-focus-scope@1.3.1 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-id@1.1.4 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-menu@2.2.1 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-popper@1.4.0 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-portal@1.2.0 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-presence@1.1.11 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-primitive@2.2.0 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-roving-focus@1.2.1 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-slot@1.5.0 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-use-callback-ref@1.1.5 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-use-controllable-state@1.3.0 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-use-effect-event@0.0.5 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-use-is-hydrated@0.1.3 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-use-layout-effect@1.1.4 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-use-rect@1.1.4 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/react-use-size@1.1.5 — https://github.com/radix-ui/primitives.git
- npm @radix-ui/rect@1.1.3 — https://github.com/radix-ui/primitives.git
- npm @tauri-apps/api@2.11.1 — https://github.com/tauri-apps/tauri.git
- npm @tauri-apps/plugin-process@2.3.0 — https://github.com/tauri-apps/plugins-workspace
- npm @tauri-apps/plugin-updater@2.9.0 — https://github.com/tauri-apps/plugins-workspace
- npm @types/debug@4.1.13 — https://github.com/DefinitelyTyped/DefinitelyTyped.git
- npm @types/estree@1.0.9 — https://github.com/DefinitelyTyped/DefinitelyTyped.git
- npm @types/estree-jsx@1.0.5 — https://github.com/DefinitelyTyped/DefinitelyTyped.git
- npm @types/hast@3.0.5 — https://github.com/DefinitelyTyped/DefinitelyTyped.git
- npm @types/mdast@4.0.4 — https://github.com/DefinitelyTyped/DefinitelyTyped.git
- npm @types/ms@2.1.0 — https://github.com/DefinitelyTyped/DefinitelyTyped.git
- npm @types/react@19.3.0 — https://github.com/DefinitelyTyped/DefinitelyTyped.git
- npm @types/react-dom@19.3.0 — https://github.com/DefinitelyTyped/DefinitelyTyped.git
- npm @types/unist@3.0.3 — https://github.com/DefinitelyTyped/DefinitelyTyped.git
- npm @ungap/structured-clone@1.4.0 — Andrea Giammarchi — https://github.com/ungap/structured-clone.git
- npm aria-hidden@1.2.6 — Anton Korzunov <thekashey@gmail.com> — https://github.com/theKashey/aria-hidden.git
- npm bail@2.0.2 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/bail
- npm ccount@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/ccount
- npm character-entities@2.0.2 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/character-entities
- npm character-entities-html4@2.1.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/character-entities-html4
- npm character-entities-legacy@3.0.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/character-entities-legacy
- npm character-reference-invalid@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/character-reference-invalid
- npm comma-separated-tokens@2.0.3 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/comma-separated-tokens
- npm csstype@3.2.3 — Fredrik Nicol <fredrik.nicol@gmail.com> — https://github.com/frenic/csstype
- npm debug@4.4.3 — Josh Junon (https://github.com/qix-) — git://github.com/debug-js/debug.git
- npm decode-named-character-reference@1.3.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/decode-named-character-reference
- npm dequal@2.0.3 — Luke Edwards — lukeed/dequal
- npm detect-node-es@1.1.0 — Ilya Kantor — https://github.com/thekashey/detect-node
- npm devlop@1.1.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/devlop
- npm escape-string-regexp@5.0.0 — Sindre Sorhus — sindresorhus/escape-string-regexp
- npm estree-util-is-identifier-name@3.0.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/estree-util-is-identifier-name
- npm extend@3.0.2 — Stefan Thomas <justmoon@members.fsf.org> (http://www.justmoon.net) — https://github.com/justmoon/node-extend.git
- npm get-nonce@1.0.1 — Anton Korzunov <thekashey@gmail.com> — git@github.com:theKashey/get-nonce.git
- npm hast-util-from-parse5@8.0.3 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/hast-util-from-parse5
- npm hast-util-parse-selector@4.0.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/hast-util-parse-selector
- npm hast-util-raw@9.1.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/hast-util-raw
- npm entities@6.0.1 — Felix Boehm <me@feedic.com> — git://github.com/fb55/entities.git
- npm parse5@7.3.0 — Ivan Nikulin <ifaaan@gmail.com> (https://github.com/inikulin) — git://github.com/inikulin/parse5.git
- npm hast-util-sanitize@5.0.2 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/hast-util-sanitize
- npm hast-util-to-jsx-runtime@2.3.6 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/hast-util-to-jsx-runtime
- npm hast-util-to-parse5@8.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/hast-util-to-parse5
- npm hast-util-whitespace@3.0.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/hast-util-whitespace
- npm hastscript@9.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/hastscript
- npm html-url-attributes@3.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/rehypejs/rehype-minify/tree/main/packages/html-url-attributes
- npm html-void-elements@3.0.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/html-void-elements
- npm inline-style-parser@0.2.7 — https://github.com/remarkablemark/inline-style-parser.git
- npm is-alphabetical@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/is-alphabetical
- npm is-alphanumerical@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/is-alphanumerical
- npm is-decimal@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/is-decimal
- npm is-hexadecimal@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/is-hexadecimal
- npm is-plain-obj@4.1.0 — Sindre Sorhus — sindresorhus/is-plain-obj
- npm longest-streak@3.1.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/longest-streak
- npm lucide-react@0.468.0 — Eric Fennis — https://github.com/lucide-icons/lucide.git
- npm markdown-table@3.0.4 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/markdown-table
- npm mdast-util-find-and-replace@3.0.3 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/mdast-util-find-and-replace
- npm mdast-util-from-markdown@2.1.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/mdast-util-from-markdown
- npm mdast-util-gfm@3.1.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/mdast-util-gfm
- npm mdast-util-gfm-autolink-literal@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/mdast-util-gfm-autolink-literal
- npm mdast-util-gfm-footnote@2.1.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/mdast-util-gfm-footnote
- npm mdast-util-gfm-strikethrough@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/mdast-util-gfm-strikethrough
- npm mdast-util-gfm-table@2.0.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/mdast-util-gfm-table
- npm mdast-util-gfm-task-list-item@2.0.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/mdast-util-gfm-task-list-item
- npm mdast-util-mdx-expression@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/mdast-util-mdx-expression
- npm mdast-util-mdx-jsx@3.2.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/mdast-util-mdx-jsx
- npm mdast-util-mdxjs-esm@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/mdast-util-mdxjs-esm
- npm mdast-util-phrasing@4.1.0 — Victor Felder <victor@draft.li> (https://draft.li) — syntax-tree/mdast-util-phrasing
- npm mdast-util-to-hast@13.2.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/mdast-util-to-hast
- npm mdast-util-to-markdown@2.2.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/mdast-util-to-markdown
- npm mdast-util-to-string@4.0.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/mdast-util-to-string
- npm micromark@4.0.3 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark
- npm micromark-core-commonmark@2.0.4 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-core-commonmark
- npm micromark-extension-gfm@3.0.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — micromark/micromark-extension-gfm
- npm micromark-extension-gfm-autolink-literal@2.1.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — micromark/micromark-extension-gfm-autolink-literal
- npm micromark-extension-gfm-footnote@2.1.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — micromark/micromark-extension-gfm-footnote
- npm micromark-extension-gfm-strikethrough@2.1.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — micromark/micromark-extension-gfm-strikethrough
- npm micromark-extension-gfm-table@2.1.2 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — micromark/micromark-extension-gfm-table
- npm micromark-extension-gfm-tagfilter@2.0.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — micromark/micromark-extension-gfm-tagfilter
- npm micromark-extension-gfm-task-list-item@2.1.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — micromark/micromark-extension-gfm-task-list-item
- npm micromark-factory-destination@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-factory-destination
- npm micromark-factory-label@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-factory-label
- npm micromark-factory-space@2.1.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-factory-space
- npm micromark-factory-title@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-factory-title
- npm micromark-factory-whitespace@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-factory-whitespace
- npm micromark-util-character@2.1.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-util-character
- npm micromark-util-chunked@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-util-chunked
- npm micromark-util-classify-character@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-util-classify-character
- npm micromark-util-combine-extensions@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-util-combine-extensions
- npm micromark-util-decode-numeric-character-reference@2.0.2 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-util-decode-numeric-character-reference
- npm micromark-util-decode-string@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-util-decode-string
- npm micromark-util-edit-map@1.0.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-util-edit-map
- npm micromark-util-encode@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-util-encode
- npm micromark-util-html-tag-name@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-util-html-tag-name
- npm micromark-util-normalize-identifier@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-util-normalize-identifier
- npm micromark-util-resolve-all@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-util-resolve-all
- npm micromark-util-sanitize-uri@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-util-sanitize-uri
- npm micromark-util-subtokenize@2.1.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-util-subtokenize
- npm micromark-util-symbol@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-util-symbol
- npm micromark-util-types@2.0.3 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/micromark/micromark/tree/main/packages/micromark-util-types
- npm ms@2.1.3 — vercel/ms
- npm parse-entities@4.0.2 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/parse-entities
- npm @types/unist@2.0.11 — https://github.com/DefinitelyTyped/DefinitelyTyped.git
- npm property-information@7.2.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/property-information
- npm react@19.3.1 — https://github.com/react/react.git
- npm react-dom@19.3.1 — https://github.com/react/react.git
- npm react-markdown@10.1.0 — Espen Hovlandsdal <espen@hovlandsdal.com> — remarkjs/react-markdown
- npm react-remove-scroll@2.7.2 — Anton Korzunov <thekashey@gmail.com> — https://github.com/theKashey/react-remove-scroll
- npm react-remove-scroll-bar@2.3.8 — Anton Korzunov <thekashey@gmail.com> — https://github.com/theKashey/react-remove-scroll-bar
- npm react-style-singleton@2.2.3 — Anton Korzunov (thekashey@gmail.com) — https://github.com/theKashey/react-style-singleton
- npm rehype-raw@7.0.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — rehypejs/rehype-raw
- npm rehype-sanitize@6.0.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — rehypejs/rehype-sanitize
- npm remark-gfm@4.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — remarkjs/remark-gfm
- npm remark-parse@11.0.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/remarkjs/remark/tree/main/packages/remark-parse
- npm remark-rehype@11.1.2 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — remarkjs/remark-rehype
- npm remark-stringify@11.0.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — https://github.com/remarkjs/remark/tree/main/packages/remark-stringify
- npm scheduler@0.28.0 — https://github.com/react/react.git
- npm space-separated-tokens@2.0.2 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/space-separated-tokens
- npm stringify-entities@4.0.4 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/stringify-entities
- npm style-to-js@1.1.21 — Mark <mark@remarkablemark.org> — https://github.com/remarkablemark/style-to-js.git
- npm style-to-object@1.0.14 — Mark <mark@remarkablemark.org> — https://github.com/remarkablemark/style-to-object.git
- npm trim-lines@3.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/trim-lines
- npm trough@2.2.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/trough
- npm tslib@2.8.1 — Microsoft Corp. — https://github.com/Microsoft/tslib.git
- npm unified@11.0.5 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — unifiedjs/unified
- npm unist-util-is@6.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/unist-util-is
- npm unist-util-position@5.0.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/unist-util-position
- npm unist-util-stringify-position@4.0.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/unist-util-stringify-position
- npm unist-util-visit@5.1.0 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/unist-util-visit
- npm unist-util-visit-parents@6.0.2 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — syntax-tree/unist-util-visit-parents
- npm use-callback-ref@1.3.3 — theKashey <thekashey@gmail.com> — https://github.com/theKashey/use-callback-ref/
- npm use-sidecar@1.1.3 — theKashey <thekashey@gmail.com> — https://github.com/theKashey/use-sidecar
- npm vfile@6.0.3 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — vfile/vfile
- npm vfile-location@5.0.3 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — vfile/vfile-location
- npm vfile-message@4.0.3 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — vfile/vfile-message
- npm web-namespaces@2.0.1 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/web-namespaces
- npm zwitch@2.0.4 — Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) — wooorm/zwitch
- crate adler2@2.0.1 — Jonas Schievink <jonasschievink@gmail.com>; oyvindln <oyvindln@users.noreply.github.com> — https://github.com/oyvindln/adler2
- crate aead@0.5.2 — RustCrypto Developers — https://github.com/RustCrypto/traits
- crate aes@0.8.4 — RustCrypto Developers — https://github.com/RustCrypto/block-ciphers
- crate aes-gcm@0.10.3 — RustCrypto Developers — https://github.com/RustCrypto/AEADs
- crate aho-corasick@1.1.5 — Andrew Gallant <jamslam@gmail.com> — https://github.com/BurntSushi/aho-corasick
- crate alloc-no-stdlib@2.0.4 — Daniel Reiter Horn <danielrh@dropbox.com> — https://github.com/dropbox/rust-alloc-no-stdlib
- crate alloc-stdlib@0.2.4 — Daniel Reiter Horn <danielrh@dropbox.com> — https://github.com/dropbox/rust-alloc-no-stdlib
- crate anstream@1.0.0 — https://github.com/rust-cli/anstyle.git
- crate anstyle@1.0.14 — https://github.com/rust-cli/anstyle.git
- crate anstyle-parse@1.0.0 — https://github.com/rust-cli/anstyle.git
- crate anstyle-query@1.1.5 — https://github.com/rust-cli/anstyle.git
- crate anstyle-wincon@3.0.11 — https://github.com/rust-cli/anstyle.git
- crate anyhow@1.0.104 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/anyhow
- crate async-trait@0.1.92 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/async-trait
- crate atomic-waker@1.1.2 — Stjepan Glavina <stjepang@gmail.com>; Contributors to futures-rs — https://github.com/smol-rs/atomic-waker
- crate autocfg@1.5.1 — Josh Stone <cuviper@gmail.com> — https://github.com/cuviper/autocfg
- crate base64@0.21.7 — Alice Maz <alice@alicemaz.com>; Marshall Pierce <marshall@mpierce.org> — https://github.com/marshallpierce/rust-base64
- crate base64@0.22.1 — Marshall Pierce <marshall@mpierce.org> — https://github.com/marshallpierce/rust-base64
- crate base64@0.23.1 — Marshall Pierce <marshall@mpierce.org> — https://github.com/marshallpierce/rust-base64
- crate bit-set@0.8.0 — Alexis Beingessner <a.beingessner@gmail.com> — https://github.com/contain-rs/bit-set
- crate bit-vec@0.8.0 — Alexis Beingessner <a.beingessner@gmail.com> — https://github.com/contain-rs/bit-vec
- crate bitflags@1.3.2 — The Rust Project Developers — https://github.com/bitflags/bitflags
- crate bitflags@2.13.2 — The Rust Project Developers — https://github.com/bitflags/bitflags
- crate block-buffer@0.10.4 — RustCrypto Developers — https://github.com/RustCrypto/utils
- crate block2@0.6.2 — Mads Marquart <mads@marquart.dk> — https://github.com/madsmtm/objc2
- crate brotli@8.0.4 — Daniel Reiter Horn <danielrh@dropbox.com>; The Brotli Authors — https://github.com/dropbox/rust-brotli
- crate brotli-decompressor@5.0.3 — Daniel Reiter Horn <danielrh@dropbox.com>; The Brotli Authors — https://github.com/dropbox/rust-brotli-decompressor
- crate bs58@0.5.1 — https://github.com/Nullus157/bs58-rs
- crate byteorder@1.5.0 — Andrew Gallant <jamslam@gmail.com> — https://github.com/BurntSushi/byteorder
- crate bytes@1.12.1 — Carl Lerche <me@carllerche.com>; Sean McArthur <sean@seanmonstar.com> — https://github.com/tokio-rs/bytes
- crate camino@1.2.6 — Without Boats <saoirse@without.boats>; Ashley Williams <ashley666ashley@gmail.com>; Steve Klabnik <steve@steveklabnik.com>; Rain <rain@sunshowers.io> — https://github.com/camino-rs/camino
- crate cargo_metadata@0.19.2 — Oliver Schneider <git-spam-no-reply9815368754983@oli-obk.de> — https://github.com/oli-obk/cargo_metadata
- crate cargo_toml@0.22.3 — Kornel <kornel@geekhood.net> — https://gitlab.com/lib.rs/cargo_toml
- crate cargo-platform@0.1.9 — https://github.com/rust-lang/cargo
- crate cc@1.8.0 — https://github.com/rust-lang/cc-rs
- crate cfb@0.7.3 — Matthew D. Steele <mdsteele@alum.mit.edu> — https://github.com/mdsteele/rust-cfb
- crate cfg_aliases@0.2.2 — Zicklag <zicklag@katharostech.com> — https://github.com/katharostech/cfg_aliases
- crate cfg-if@1.0.5 — Alex Crichton <alex@alexcrichton.com> — https://github.com/rust-lang/cfg-if
- crate chacha20@0.10.2 — RustCrypto Developers — https://github.com/RustCrypto/stream-ciphers
- crate chrono@0.4.45 — https://github.com/chronotope/chrono
- crate cipher@0.4.4 — RustCrypto Developers — https://github.com/RustCrypto/traits
- crate clap@4.6.7 — https://github.com/clap-rs/clap
- crate clap_builder@4.6.7 — https://github.com/clap-rs/clap
- crate clap_derive@4.6.7 — https://github.com/clap-rs/clap
- crate clap_lex@1.1.1 — https://github.com/clap-rs/clap
- crate colorchoice@1.0.5 — https://github.com/rust-cli/anstyle.git
- crate cookie@0.18.2 — Sergio Benitez <sb@sergio.bz>; Alex Crichton <alex@alexcrichton.com> — https://github.com/SergioBenitez/cookie-rs
- crate core_detect@1.0.0 — Thom Chiovoloni <chiovolonit@gmail.com> — https://github.com/thomcc/core_detect
- crate core-foundation@0.10.1 — The Servo Project Developers — https://github.com/servo/core-foundation-rs
- crate core-foundation-sys@0.8.7 — The Servo Project Developers — https://github.com/servo/core-foundation-rs
- crate core-graphics@0.25.0 — The Servo Project Developers — https://github.com/servo/core-foundation-rs
- crate core-graphics-types@0.2.0 — The Servo Project Developers — https://github.com/servo/core-foundation-rs
- crate cpufeatures@0.2.17 — RustCrypto Developers — https://github.com/RustCrypto/utils
- crate cpufeatures@0.3.1 — RustCrypto Developers — https://github.com/RustCrypto/utils
- crate crc32fast@1.5.2 — Sam Rijs <srijs@airpost.net>; Alex Crichton <alex@alexcrichton.com> — https://github.com/srijs/rust-crc32fast
- crate crossbeam-channel@0.5.17 — https://github.com/crossbeam-rs/crossbeam
- crate crossbeam-utils@0.8.23 — https://github.com/crossbeam-rs/crossbeam
- crate crypto-common@0.1.7 — RustCrypto Developers — https://github.com/RustCrypto/traits
- crate cssparser@0.35.0 — Simon Sapin <simon.sapin@exyr.org> — https://github.com/servo/rust-cssparser
- crate cssparser@0.36.0 — Simon Sapin <simon.sapin@exyr.org> — https://github.com/servo/rust-cssparser
- crate cssparser-macros@0.6.1 — Simon Sapin <simon.sapin@exyr.org> — https://github.com/servo/rust-cssparser
- crate ctor@0.8.0 — Matt Mastracci <matthew@mastracci.com> — https://github.com/mmastrac/rust-ctor
- crate ctor-proc-macro@0.0.7 — Matt Mastracci <matthew@mastracci.com> — https://github.com/mmastrac/rust-ctor
- crate ctr@0.9.2 — RustCrypto Developers — https://github.com/RustCrypto/block-modes
- crate darling@0.24.1 — Ted Driggs <ted.driggs@outlook.com> — https://github.com/TedDriggs/darling
- crate darling_core@0.24.1 — Ted Driggs <ted.driggs@outlook.com> — https://github.com/TedDriggs/darling
- crate darling_macro@0.24.1 — Ted Driggs <ted.driggs@outlook.com> — https://github.com/TedDriggs/darling
- crate defmt@1.2.0 — The Knurling-rs developers — https://github.com/knurling-rs/defmt
- crate defmt-macros@1.2.0 — The Knurling-rs developers — https://github.com/knurling-rs/defmt
- crate defmt-parser@1.1.0 — The Knurling-rs developers — https://github.com/knurling-rs/defmt
- crate deranged@0.5.9 — Jacob Pratt <jacob@jhpratt.dev> — https://github.com/jhpratt/deranged
- crate derive_more@2.1.1 — Jelte Fennema <github-tech@jeltef.nl> — https://github.com/JelteF/derive_more
- crate derive_more-impl@2.1.1 — Jelte Fennema <github-tech@jeltef.nl> — https://github.com/JelteF/derive_more
- crate digest@0.10.7 — RustCrypto Developers — https://github.com/RustCrypto/traits
- crate dirs@6.0.0 — Simon Ochsenreither <simon@ochsenreither.de> — https://github.com/soc/dirs-rs
- crate dirs-sys@0.5.0 — Simon Ochsenreither <simon@ochsenreither.de> — https://github.com/dirs-dev/dirs-sys-rs
- crate dispatch2@0.3.1 — Mads Marquart <mads@marquart.dk>; Mary <mary@mary.zone> — https://github.com/madsmtm/objc2
- crate displaydoc@0.2.7 — Jane Lusby <jlusby@yaah.dev> — https://github.com/yaahc/displaydoc
- crate dom_query@0.27.0 — niklak <morgenpurple@gmail.com>; importcjj <importcjj@gmail.com> — https://github.com/niklak/dom_query
- crate dpi@0.1.2 — https://github.com/rust-windowing/winit
- crate dtoa@1.0.11 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/dtoa
- crate dtoa-short@0.3.5 — Xidorn Quan <me@upsuper.org> — https://github.com/upsuper/dtoa-short
- crate dtor@0.3.0 — Matt Mastracci <matthew@mastracci.com> — https://github.com/mmastrac/rust-ctor
- crate dtor-proc-macro@0.0.6 — Matt Mastracci <matthew@mastracci.com> — https://github.com/mmastrac/rust-ctor
- crate dunce@1.0.5 — Kornel <kornel@geekhood.net> — https://gitlab.com/kornelski/dunce
- crate dyn-clone@1.0.20 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/dyn-clone
- crate ego-tree@0.10.0 — June McEnroe <june@causal.agency>; Carlo Federico Vescovo <vescovocarlofederico@gmail.com> — https://github.com/rust-scraper/ego-tree
- crate embed_plist@1.2.2 — Nikolai Vazquez <hello@nikolaivazquez.com> — https://github.com/nvzqz/embed-plist-rs
- crate embed-resource@3.0.12 — наб <nabijaczleweli@nabijaczleweli.xyz>; Cat Plus Plus <piotrlegnica@piotrl.pl>; Liigo <liigo@qq.com>; azyobuzin <azyobuzin@users.sourceforge.jp>; Peter Atashian <retep998@gmail.com>; pravic <ehysta@gmail.com>; Gabriel Majeri <gabriel.majeri6@gmail.com>; SonnyX; Johan Andersson <repi@repi.se>; Jordan Poles <jpdev.noreply@gmail.com>; MSxDOS <melcodos@gmail.com>; Jim McGrath <jimmc2@gmail.com>; roblabla <unfiltered@roblab.la>; Jasper Bekkers <jasper@traverseresearch.nl>; Richard Markiewicz <rmarkiewicz@devolutions.net>; Emerson de Freitas Barcelos <emersonfxbx@gmail.com>; Li Keqing <me@kaze.ai>; Alexis Bourget <alexis.bourget@gmail.com>; Michael Farrell <micolous+git@gmail.com>; Jacob Okamoto <oko@oko.io>; Marijn Suijten <marijn@traverseresearch.nl>; Lucas Nogueira <lucas@tauri.app>; CharlesChen0823 <yongchen0823@gmail.com>; Daniel Schaefer <dhs@frame.work>; Rene Leonhardt; ssrlive; Kan-Ru Chen <kanru@kanru.info>; Tony <legendmastertony@gmail.com>; Berrysoft <Strawberry_Str@hotmail.com>; Marcus Ahlberg <marcus.ahlberg@kvaser.com>; Thomas Eizinger <thomas@eizinger.io> — https://github.com/nabijaczleweli/rust-embed-resource
- crate encoding_rs@0.8.42 — Henri Sivonen <hsivonen@hsivonen.fi> — https://github.com/hsivonen/encoding_rs
- crate equivalent@1.0.3 — https://github.com/indexmap-rs/equivalent
- crate erased-serde@0.4.10 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/erased-serde
- crate errno@0.3.14 — Chris Wong <lambda.fairy@gmail.com>; Dan Gohman <dev@sunfishcode.online> — https://github.com/lambda-fairy/rust-errno
- crate fallible-iterator@0.3.0 — Steven Fackler <sfackler@gmail.com> — https://github.com/sfackler/rust-fallible-iterator
- crate fallible-streaming-iterator@0.1.9 — Steven Fackler <sfackler@gmail.com> — https://github.com/sfackler/fallible-streaming-iterator
- crate fastrand@2.5.0 — Stjepan Glavina <stjepang@gmail.com> — https://github.com/smol-rs/fastrand
- crate fdeflate@0.3.7 — The image-rs Developers — https://github.com/image-rs/fdeflate
- crate filetime@0.2.29 — Alex Crichton <alex@alexcrichton.com> — https://github.com/alexcrichton/filetime
- crate find-msvc-tools@0.1.14 — https://github.com/rust-lang/cc-rs
- crate flate2@1.1.10 — Alex Crichton <alex@alexcrichton.com>; Josh Triplett <josh@joshtriplett.org> — https://github.com/rust-lang/flate2-rs
- crate fnv@1.0.7 — Alex Crichton <alex@alexcrichton.com> — https://github.com/servo/rust-fnv
- crate foldhash@0.1.5 — Orson Peters <orsonpeters@gmail.com> — https://github.com/orlp/foldhash
- crate foldhash@0.2.0 — Orson Peters <orsonpeters@gmail.com> — https://github.com/orlp/foldhash
- crate foreign-types@0.5.0 — Steven Fackler <sfackler@gmail.com> — https://github.com/sfackler/foreign-types
- crate foreign-types-macros@0.2.4 — Steven Fackler <sfackler@gmail.com> — https://github.com/sfackler/foreign-types
- crate foreign-types-shared@0.3.1 — Steven Fackler <sfackler@gmail.com> — https://github.com/sfackler/foreign-types
- crate form_urlencoded@1.2.2 — The rust-url developers — https://github.com/servo/rust-url
- crate futf@0.1.5 — Keegan McAllister <kmcallister@mozilla.com> — https://github.com/servo/futf
- crate futures@0.3.34 — https://github.com/rust-lang/futures-rs
- crate futures-channel@0.3.34 — https://github.com/rust-lang/futures-rs
- crate futures-core@0.3.34 — https://github.com/rust-lang/futures-rs
- crate futures-executor@0.3.34 — https://github.com/rust-lang/futures-rs
- crate futures-io@0.3.34 — https://github.com/rust-lang/futures-rs
- crate futures-macro@0.3.34 — https://github.com/rust-lang/futures-rs
- crate futures-sink@0.3.34 — https://github.com/rust-lang/futures-rs
- crate futures-task@0.3.34 — https://github.com/rust-lang/futures-rs
- crate futures-util@0.3.34 — https://github.com/rust-lang/futures-rs
- crate fxhash@0.2.1 — cbreeden <github@u.breeden.cc> — https://github.com/cbreeden/fxhash
- crate generic-array@0.14.7 — Bartłomiej Kamiński <fizyk20@gmail.com>; Aaron Trent <novacrazy@gmail.com> — https://github.com/fizyk20/generic-array.git
- crate getrandom@0.2.17 — The Rand Project Developers — https://github.com/rust-random/getrandom
- crate getrandom@0.3.4 — The Rand Project Developers — https://github.com/rust-random/getrandom
- crate getrandom@0.4.3 — The Rand Project Developers — https://github.com/rust-random/getrandom
- crate ghash@0.5.1 — RustCrypto Developers — https://github.com/RustCrypto/universal-hashes
- crate glob@0.3.4 — The Rust Project Developers — https://github.com/rust-lang/glob
- crate hashbrown@0.12.3 — Amanieu d'Antras <amanieu@gmail.com> — https://github.com/rust-lang/hashbrown
- crate hashbrown@0.15.5 — Amanieu d'Antras <amanieu@gmail.com> — https://github.com/rust-lang/hashbrown
- crate hashbrown@0.17.1 — https://github.com/rust-lang/hashbrown
- crate hashlink@0.10.0 — kyren <kerriganw@gmail.com> — https://github.com/kyren/hashlink
- crate heck@0.5.0 — https://github.com/withoutboats/heck
- crate hex@0.4.3 — KokaKiwi <kokakiwi@kokakiwi.net> — https://github.com/KokaKiwi/rust-hex
- crate html5ever@0.35.0 — The html5ever Project Developers — https://github.com/servo/html5ever
- crate html5ever@0.38.0 — The html5ever Project Developers — https://github.com/servo/html5ever
- crate http@1.5.0 — Alex Crichton <alex@alexcrichton.com>; Carl Lerche <me@carllerche.com>; Sean McArthur <sean@seanmonstar.com> — https://github.com/hyperium/http
- crate http-body@1.1.0 — Carl Lerche <me@carllerche.com>; Lucio Franco <luciofranco14@gmail.com>; Sean McArthur <sean@seanmonstar.com> — https://github.com/hyperium/http-body
- crate http-body-util@0.1.5 — Carl Lerche <me@carllerche.com>; Lucio Franco <luciofranco14@gmail.com>; Sean McArthur <sean@seanmonstar.com> — https://github.com/hyperium/http-body
- crate httparse@1.10.1 — Sean McArthur <sean@seanmonstar.com> — https://github.com/seanmonstar/httparse
- crate hyper@1.12.0 — Sean McArthur <sean@seanmonstar.com> — https://github.com/hyperium/hyper
- crate hyper-rustls@0.27.10 — https://github.com/rustls/hyper-rustls
- crate hyper-tls@0.6.0 — Sean McArthur <sean@seanmonstar.com> — https://github.com/hyperium/hyper-tls
- crate hyper-util@0.1.21 — Sean McArthur <sean@seanmonstar.com> — https://github.com/hyperium/hyper-util
- crate iana-time-zone@0.1.65 — Andrew Straw <strawman@astraw.com>; René Kijewski <rene.kijewski@fu-berlin.de>; Ryan Lopopolo <rjl@hyperbo.la> — https://github.com/strawlab/iana-time-zone
- crate ico@0.5.0 — Matthew D. Steele <mdsteele@alum.mit.edu> — https://github.com/mdsteele/rust-ico
- crate icu_collections@2.3.0 — The ICU4X Project Developers — https://github.com/unicode-org/icu4x
- crate icu_locale_core@2.3.0 — The ICU4X Project Developers — https://github.com/unicode-org/icu4x
- crate icu_normalizer@2.3.0 — The ICU4X Project Developers — https://github.com/unicode-org/icu4x
- crate icu_normalizer_data@2.3.0 — The ICU4X Project Developers — https://github.com/unicode-org/icu4x
- crate icu_properties@2.3.0 — The ICU4X Project Developers — https://github.com/unicode-org/icu4x
- crate icu_properties_data@2.3.0 — The ICU4X Project Developers — https://github.com/unicode-org/icu4x
- crate icu_provider@2.3.1 — The ICU4X Project Developers — https://github.com/unicode-org/icu4x
- crate ident_case@1.0.1 — Ted Driggs <ted.driggs@outlook.com> — https://github.com/TedDriggs/ident_case
- crate idna@1.1.0 — The rust-url developers — https://github.com/servo/rust-url/
- crate idna_adapter@1.2.2 — The rust-url developers — https://github.com/hsivonen/idna_adapter
- crate indexmap@1.9.3 — https://github.com/bluss/indexmap
- crate indexmap@2.14.2 — https://github.com/indexmap-rs/indexmap
- crate infer@0.19.0 — Bojan <dbojan@gmail.com> — https://github.com/bojand/infer
- crate inout@0.1.4 — RustCrypto Developers — https://github.com/RustCrypto/utils
- crate ipnet@2.12.2 — Kris Price <kris@krisprice.nz> — https://github.com/krisprice/ipnet
- crate is_terminal_polyfill@1.70.2 — https://github.com/polyfill-rs/is_terminal_polyfill
- crate itoa@1.0.18 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/itoa
- crate jiff@0.2.38 — Andrew Gallant <jamslam@gmail.com> — https://github.com/BurntSushi/jiff
- crate jiff-core@0.1.1 — Andrew Gallant <jamslam@gmail.com> — https://github.com/BurntSushi/jiff
- crate jiff-tzdb@0.1.9 — Andrew Gallant <jamslam@gmail.com> — https://github.com/BurntSushi/jiff
- crate jiff-tzdb-platform@0.1.3 — Andrew Gallant <jamslam@gmail.com> — https://github.com/BurntSushi/jiff
- crate json-patch@3.0.1 — Ivan Dubrov <dubrov.ivan@gmail.com> — https://github.com/idubrov/json-patch
- crate jsonptr@0.6.3 — chance dinkins; André Sá de Mello <codasm@pm.me> — https://github.com/chanced/jsonptr
- crate keyboard-types@0.7.0 — Pyfisch <pyfisch@posteo.org> — https://github.com/pyfisch/keyboard-types
- crate libc@0.2.191 — https://github.com/rust-lang/libc
- crate libsqlite3-sys@0.35.0 — The rusqlite developers — https://github.com/rusqlite/rusqlite
- crate litemap@0.8.3 — The ICU4X Project Developers — https://github.com/unicode-org/icu4x
- crate lock_api@0.4.14 — Amanieu d'Antras <amanieu@gmail.com> — https://github.com/Amanieu/parking_lot
- crate log@0.4.34 — The Rust Project Developers — https://github.com/rust-lang/log
- crate lru-slab@0.1.3 — Benjamin Saunders <ben.e.saunders@gmail.com> — https://github.com/Ralith/lru-slab
- crate mac@0.1.1 — Jonathan Reem <jonathan.reem@gmail.com> — https://github.com/reem/rust-mac.git
- crate macro_rules_attribute@0.2.3 — Daniel Henry-Mantilla <daniel.henry.mantilla@gmail.com> — https://github.com/danielhenrymantilla/macro_rules_attribute-rs
- crate macro_rules_attribute-proc_macro@0.2.3 — Daniel Henry-Mantilla <daniel.henry.mantilla@gmail.com> — https://github.com/danielhenrymantilla/macro_rules_attribute-rs
- crate markup5ever@0.35.0 — The html5ever Project Developers — https://github.com/servo/html5ever
- crate markup5ever@0.38.0 — The html5ever Project Developers — https://github.com/servo/html5ever
- crate match_token@0.35.0 — The html5ever Project Developers — https://github.com/servo/html5ever
- crate memchr@2.8.3 — Andrew Gallant <jamslam@gmail.com>; bluss — https://github.com/BurntSushi/memchr
- crate mime@0.3.17 — Sean McArthur <sean@seanmonstar.com> — https://github.com/hyperium/mime
- crate minisign-verify@0.2.5 — Frank Denis <github@pureftpd.org> — https://github.com/jedisct1/rust-minisign-verify
- crate miniz_oxide@0.8.9 — Frommi <daniil.liferenko@gmail.com>; oyvindln <oyvindln@users.noreply.github.com>; Rich Geldreich richgel99@gmail.com — https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide
- crate miniz_oxide@0.9.1 — Frommi <daniil.liferenko@gmail.com>; oyvindln <oyvindln@users.noreply.github.com>; Rich Geldreich richgel99@gmail.com — https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide
- crate mio@1.2.4 — Carl Lerche <me@carllerche.com>; Thomas de Zeeuw <thomasdezeeuw@gmail.com>; Tokio Contributors <team@tokio.rs> — https://github.com/tokio-rs/mio
- crate muda@0.19.3 — https://github.com/tauri-apps/muda
- crate multiversion_no_op@1.0.0 — Henri Sivonen <hsivonen@hsivonen.fi> — https://github.com/hsivonen/multiversion_no_op
- crate native-tls@0.2.18 — Steven Fackler <sfackler@gmail.com> — https://github.com/rust-native-tls/rust-native-tls
- crate new_debug_unreachable@1.0.6 — Matt Brubeck <mbrubeck@limpet.net>; Jonathan Reem <jonathan.reem@gmail.com> — https://github.com/mbrubeck/rust-debug-unreachable
- crate num-conv@0.2.2 — Jacob Pratt <jacob@jhpratt.dev> — https://github.com/jhpratt/num-conv
- crate num-traits@0.2.19 — The Rust Project Developers — https://github.com/rust-num/num-traits
- crate objc2@0.6.5 — Mads Marquart <mads@marquart.dk> — https://github.com/madsmtm/objc2
- crate objc2-app-kit@0.3.2 — https://github.com/madsmtm/objc2
- crate objc2-core-foundation@0.3.2 — https://github.com/madsmtm/objc2
- crate objc2-core-graphics@0.3.2 — https://github.com/madsmtm/objc2
- crate objc2-encode@4.1.0 — Mads Marquart <mads@marquart.dk> — https://github.com/madsmtm/objc2
- crate objc2-exception-helper@0.1.1 — Mads Marquart <mads@marquart.dk> — https://github.com/madsmtm/objc2
- crate objc2-foundation@0.3.2 — https://github.com/madsmtm/objc2
- crate objc2-io-surface@0.3.2 — https://github.com/madsmtm/objc2
- crate objc2-osa-kit@0.3.2 — https://github.com/madsmtm/objc2
- crate objc2-web-kit@0.3.2 — https://github.com/madsmtm/objc2
- crate once_cell@1.21.4 — Aleksey Kladov <aleksey.kladov@gmail.com> — https://github.com/matklad/once_cell
- crate once_cell_polyfill@1.70.2 — https://github.com/polyfill-rs/once_cell_polyfill
- crate opaque-debug@0.3.1 — RustCrypto Developers — https://github.com/RustCrypto/utils
- crate open@5.4.4 — Sebastian Thiel <byronimo@gmail.com> — https://github.com/Byron/open-rs
- crate option-ext@0.2.0 — Simon Ochsenreither <simon@ochsenreither.de> — https://github.com/soc/option-ext.git
- crate osakit@0.3.1 — Marat Dulin <mdevils@gmail.com> — https://github.com/mdevils/rust-osakit
- crate parking_lot@0.12.5 — Amanieu d'Antras <amanieu@gmail.com> — https://github.com/Amanieu/parking_lot
- crate parking_lot_core@0.9.12 — Amanieu d'Antras <amanieu@gmail.com> — https://github.com/Amanieu/parking_lot
- crate pastey@0.2.3 — Aditya Kumar <git@adityais.dev>; David Tolnay <dtolnay@gmail.com> — https://github.com/as1100k/pastey
- crate percent-encoding@2.3.2 — The rust-url developers — https://github.com/servo/rust-url/
- crate phf@0.11.3 — Steven Fackler <sfackler@gmail.com> — https://github.com/rust-phf/rust-phf
- crate phf@0.13.1 — Steven Fackler <sfackler@gmail.com> — https://github.com/rust-phf/rust-phf
- crate phf_codegen@0.11.3 — Steven Fackler <sfackler@gmail.com> — https://github.com/rust-phf/rust-phf
- crate phf_codegen@0.13.1 — Steven Fackler <sfackler@gmail.com> — https://github.com/rust-phf/rust-phf
- crate phf_generator@0.11.3 — Steven Fackler <sfackler@gmail.com> — https://github.com/rust-phf/rust-phf
- crate phf_generator@0.13.1 — Steven Fackler <sfackler@gmail.com> — https://github.com/rust-phf/rust-phf
- crate phf_macros@0.11.3 — Steven Fackler <sfackler@gmail.com> — https://github.com/rust-phf/rust-phf
- crate phf_macros@0.13.1 — Steven Fackler <sfackler@gmail.com> — https://github.com/rust-phf/rust-phf
- crate phf_shared@0.11.3 — Steven Fackler <sfackler@gmail.com> — https://github.com/rust-phf/rust-phf
- crate phf_shared@0.13.1 — Steven Fackler <sfackler@gmail.com> — https://github.com/rust-phf/rust-phf
- crate pin-project-lite@0.2.17 — https://github.com/taiki-e/pin-project-lite
- crate pkg-config@0.3.34 — Alex Crichton <alex@alexcrichton.com> — https://github.com/rust-lang/pkg-config-rs
- crate plist@1.10.1 — Ed Barnard <eabarnard@gmail.com> — https://github.com/ebarnard/rust-plist/
- crate png@0.17.16 — The image-rs Developers — https://github.com/image-rs/image-png
- crate png@0.18.1 — The image-rs Developers — https://github.com/image-rs/image-png
- crate polyval@0.6.2 — RustCrypto Developers — https://github.com/RustCrypto/universal-hashes
- crate potential_utf@0.1.6 — The ICU4X Project Developers — https://github.com/unicode-org/icu4x
- crate powerfmt@0.2.1 — Jacob Pratt <jacob@jhpratt.dev> — https://github.com/jhpratt/powerfmt
- crate precomputed-hash@0.1.1 — Emilio Cobos Álvarez <emilio@crisal.io> — https://github.com/emilio/precomputed-hash
- crate proc-macro2@1.0.107 — David Tolnay <dtolnay@gmail.com>; Alex Crichton <alex@alexcrichton.com> — https://github.com/dtolnay/proc-macro2
- crate quick-xml@0.42.0 — https://github.com/tafia/quick-xml
- crate quinn@0.11.12 — https://github.com/quinn-rs/quinn
- crate quinn-proto@0.11.19 — https://github.com/quinn-rs/quinn
- crate quinn-udp@0.5.16 — https://github.com/quinn-rs/quinn
- crate quote@1.0.47 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/quote
- crate rand@0.10.3 — The Rand Project Developers; The Rust Project Developers — https://github.com/rust-random/rand
- crate rand@0.8.8 — The Rand Project Developers; The Rust Project Developers — https://github.com/rust-random/rand
- crate rand_core@0.10.1 — The Rand Project Developers — https://github.com/rust-random/rand_core
- crate rand_core@0.6.4 — The Rand Project Developers; The Rust Project Developers — https://github.com/rust-random/rand
- crate rand_pcg@0.10.2 — The Rand Project Developers — https://github.com/rust-random/rngs
- crate raw-window-handle@0.6.2 — Osspial <osspial@gmail.com> — https://github.com/rust-windowing/raw-window-handle
- crate ref-cast@1.0.27 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/ref-cast
- crate ref-cast-impl@1.0.27 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/ref-cast
- crate regex@1.13.1 — The Rust Project Developers; Andrew Gallant <jamslam@gmail.com> — https://github.com/rust-lang/regex
- crate regex-automata@0.4.18 — The Rust Project Developers; Andrew Gallant <jamslam@gmail.com> — https://github.com/rust-lang/regex
- crate regex-syntax@0.8.11 — The Rust Project Developers; Andrew Gallant <jamslam@gmail.com> — https://github.com/rust-lang/regex
- crate reqwest@0.12.28 — Sean McArthur <sean@seanmonstar.com> — https://github.com/seanmonstar/reqwest
- crate reqwest@0.13.5 — Sean McArthur <sean@seanmonstar.com> — https://github.com/seanmonstar/reqwest
- crate ring@0.17.14 — https://github.com/briansmith/ring
- crate rmcp@3.5.1 — https://github.com/modelcontextprotocol/rust-sdk/
- crate rusqlite@0.37.0 — The rusqlite developers — https://github.com/rusqlite/rusqlite
- crate rustc_version@0.4.1 — https://github.com/djc/rustc-version-rs
- crate rustc-hash@2.1.3 — The Rust Project Developers — https://github.com/rust-lang/rustc-hash
- crate rustix@1.1.5 — Dan Gohman <dev@sunfishcode.online>; Jakub Konka <kubkon@jakubkonka.com> — https://github.com/bytecodealliance/rustix
- crate rustls@0.23.46 — https://github.com/rustls/rustls
- crate rustls-pki-types@1.15.1 — https://github.com/rustls/pki-types
- crate rustls-webpki@0.103.16 — https://github.com/rustls/webpki
- crate rustversion@1.0.23 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/rustversion
- crate ryu@1.0.23 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/ryu
- crate same-file@1.0.6 — Andrew Gallant <jamslam@gmail.com> — https://github.com/BurntSushi/same-file
- crate schannel@0.1.30 — Steven Fackler <sfackler@gmail.com>; Steffen Butzer <steffen.butzer@outlook.com> — https://github.com/steffengy/schannel-rs
- crate schemars@0.8.22 — Graham Esau <gesau@hotmail.co.uk> — https://github.com/GREsau/schemars
- crate schemars@0.9.0 — Graham Esau <gesau@hotmail.co.uk> — https://github.com/GREsau/schemars
- crate schemars@1.2.3 — Graham Esau <gesau@hotmail.co.uk> — https://github.com/GREsau/schemars
- crate schemars_derive@0.8.22 — Graham Esau <gesau@hotmail.co.uk> — https://github.com/GREsau/schemars
- crate scopeguard@1.2.0 — bluss — https://github.com/bluss/scopeguard
- crate scraper@0.24.0 — June McEnroe <june@causal.agency> — https://github.com/causal-agent/scraper
- crate security-framework@3.7.0 — Steven Fackler <sfackler@gmail.com>; Kornel <kornel@geekhood.net> — https://github.com/kornelski/rust-security-framework
- crate security-framework-sys@2.17.0 — Steven Fackler <sfackler@gmail.com>; Kornel <kornel@geekhood.net> — https://github.com/kornelski/rust-security-framework
- crate selectors@0.31.0 — The Servo Project Developers — https://github.com/servo/stylo
- crate selectors@0.36.1 — The Servo Project Developers — https://github.com/servo/stylo
- crate semver@1.0.28 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/semver
- crate serde@1.0.229 — Erick Tryzelaar <erick.tryzelaar@gmail.com>; David Tolnay <dtolnay@gmail.com> — https://github.com/serde-rs/serde
- crate serde_core@1.0.229 — Erick Tryzelaar <erick.tryzelaar@gmail.com>; David Tolnay <dtolnay@gmail.com> — https://github.com/serde-rs/serde
- crate serde_derive@1.0.229 — Erick Tryzelaar <erick.tryzelaar@gmail.com>; David Tolnay <dtolnay@gmail.com> — https://github.com/serde-rs/serde
- crate serde_derive_internals@0.29.1 — Erick Tryzelaar <erick.tryzelaar@gmail.com>; David Tolnay <dtolnay@gmail.com> — https://github.com/serde-rs/serde
- crate serde_json@1.0.154 — https://github.com/serde-rs/json
- crate serde_repr@0.1.21 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/serde-repr
- crate serde_spanned@1.1.2 — https://github.com/toml-rs/toml
- crate serde_urlencoded@0.7.1 — Anthony Ramine <n.oxyde@gmail.com> — https://github.com/nox/serde_urlencoded
- crate serde_with@3.24.0 — Jonas Bushart; Marcin Kaźmierczak — https://github.com/jonasbb/serde_with/
- crate serde_with_macros@3.24.0 — Jonas Bushart — https://github.com/jonasbb/serde_with/
- crate serde-untagged@0.1.9 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/serde-untagged
- crate serialize-to-javascript@0.1.2 — Chip Reed <chip@chip.sh> — https://github.com/chippers/serialize-to-javascript
- crate serialize-to-javascript-impl@0.1.2 — Chip Reed <chip@chip.sh> — https://github.com/chippers/serialize-to-javascript
- crate servo_arc@0.4.3 — The Servo Project Developers — https://github.com/servo/stylo
- crate sha2@0.10.9 — RustCrypto Developers — https://github.com/RustCrypto/hashes
- crate shlex@2.0.1 — comex <comexk@gmail.com>; Fenhl <fenhl@fenhl.net>; Adrian Taylor <adetaylor@chromium.org>; Alex Touchet <alextouchet@outlook.com>; Daniel Parks <dp+git@oxidized.org>; Garrett Berg <googberg@gmail.com> — https://github.com/comex/rust-shlex
- crate simd-adler32@0.3.10 — Marvin Countryman <me@maar.vin> — https://github.com/mcountryman/simd-adler32
- crate simdutf8@0.1.5 — Hans Kratz <hans@appfour.com> — https://github.com/rusticstuff/simdutf8
- crate siphasher@1.0.4 — Frank Denis <github@pureftpd.org> — https://github.com/jedisct1/rust-siphash
- crate slab@0.4.12 — Carl Lerche <me@carllerche.com> — https://github.com/tokio-rs/slab
- crate smallvec@1.16.3 — The Servo Project Developers — https://github.com/servo/rust-smallvec
- crate socket2@0.6.5 — Alex Crichton <alex@alexcrichton.com>; Thomas de Zeeuw <thomasdezeeuw@gmail.com> — https://github.com/rust-lang/socket2
- crate softbuffer@0.4.8 — https://github.com/rust-windowing/softbuffer
- crate sse-stream@0.2.6 — 4t145 <u4t145@163.com> — https://github.com/4t145/sse-stream/
- crate stable_deref_trait@1.2.1 — Robert Grosse <n210241048576@gmail.com> — https://github.com/storyyeller/stable_deref_trait
- crate string_cache@0.8.9 — The Servo Project Developers — https://github.com/servo/string-cache
- crate string_cache@0.9.0 — The Servo Project Developers — https://github.com/servo/string-cache
- crate string_cache_codegen@0.5.4 — The Servo Project Developers — https://github.com/servo/string-cache
- crate string_cache_codegen@0.6.1 — The Servo Project Developers — https://github.com/servo/string-cache
- crate strsim@0.11.1 — Danny Guo <danny@dannyguo.com>; maxbachmann <oss@maxbachmann.de> — https://github.com/rapidfuzz/strsim-rs
- crate subtle@2.6.1 — Isis Lovecruft <isis@patternsinthevoid.net>; Henry de Valence <hdevalence@hdevalence.ca> — https://github.com/dalek-cryptography/subtle
- crate swift-rs@1.0.9 — The swift-rs contributors — https://github.com/Brendonovich/swift-rs
- crate syn@2.0.119 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/syn
- crate syn@3.0.9 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/syn
- crate sync_wrapper@1.0.2 — Actyx AG <developer@actyx.io> — https://github.com/Actyx/sync_wrapper
- crate synstructure@0.14.0 — Nika Layzell <nika@thelayzells.com> — https://github.com/mystor/synstructure
- crate tao@0.35.3 — Tauri Programme within The Commons Conservancy; The winit contributors — https://github.com/tauri-apps/tao
- crate tar@0.4.46 — Alex Crichton <alex@alexcrichton.com> — https://github.com/composefs/tar-rs
- crate tauri@2.11.6 — Tauri Programme within The Commons Conservancy — https://github.com/tauri-apps/tauri
- crate tauri-build@2.6.3 — Tauri Programme within The Commons Conservancy — https://github.com/tauri-apps/tauri
- crate tauri-codegen@2.6.3 — Tauri Programme within The Commons Conservancy — https://github.com/tauri-apps/tauri
- crate tauri-macros@2.6.3 — Tauri Programme within The Commons Conservancy — https://github.com/tauri-apps/tauri
- crate tauri-plugin@2.6.3 — Tauri Programme within The Commons Conservancy — https://github.com/tauri-apps/tauri
- crate tauri-plugin-opener@2.5.4 — Tauri Programme within The Commons Conservancy — https://github.com/tauri-apps/plugins-workspace
- crate tauri-plugin-process@2.3.0 — Tauri Programme within The Commons Conservancy — https://github.com/tauri-apps/plugins-workspace
- crate tauri-plugin-updater@2.9.0 — Tauri Programme within The Commons Conservancy — https://github.com/tauri-apps/plugins-workspace
- crate tauri-runtime@2.11.3 — Tauri Programme within The Commons Conservancy — https://github.com/tauri-apps/tauri
- crate tauri-runtime-wry@2.11.4 — Tauri Programme within The Commons Conservancy — https://github.com/tauri-apps/tauri
- crate tauri-utils@2.9.3 — Tauri Programme within The Commons Conservancy — https://github.com/tauri-apps/tauri
- crate tauri-winres@0.3.6 — Tauri Programme within The Commons Conservancy; Max Resch <resch.max@gmail.com> — https://github.com/tauri-apps/winres
- crate tempfile@3.27.0 — Steven Allen <steven@stebalien.com>; The Rust Project Developers; Ashley Mannix <ashleymannix@live.com.au>; Jason White <me@jasonwhite.io> — https://github.com/Stebalien/tempfile
- crate tendril@0.4.3 — Keegan McAllister <mcallister.keegan@gmail.com>; Simon Sapin <simon.sapin@exyr.org>; Chris Morgan <me@chrismorgan.info> — https://github.com/servo/tendril
- crate tendril@0.5.1 — Keegan McAllister <mcallister.keegan@gmail.com>; Simon Sapin <simon.sapin@exyr.org>; Chris Morgan <me@chrismorgan.info> — https://github.com/servo/html5ever
- crate thiserror@1.0.69 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/thiserror
- crate thiserror@2.0.21 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/thiserror
- crate thiserror-impl@1.0.69 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/thiserror
- crate thiserror-impl@2.0.21 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/thiserror
- crate time@0.3.55 — Jacob Pratt <open-source@jhpratt.dev>; Time contributors — https://github.com/time-rs/time
- crate time-core@0.1.9 — Jacob Pratt <open-source@jhpratt.dev>; Time contributors — https://github.com/time-rs/time
- crate time-macros@0.2.32 — Jacob Pratt <open-source@jhpratt.dev>; Time contributors — https://github.com/time-rs/time
- crate tinystr@0.8.4 — The ICU4X Project Developers — https://github.com/unicode-org/icu4x
- crate tinyvec@1.13.3 — Lokathor <zefria@gmail.com> — https://github.com/Lokathor/tinyvec
- crate tokio@1.53.3 — Tokio Contributors <team@tokio.rs> — https://github.com/tokio-rs/tokio
- crate tokio-macros@2.7.2 — Tokio Contributors <team@tokio.rs> — https://github.com/tokio-rs/tokio
- crate tokio-native-tls@0.3.1 — Tokio Contributors <team@tokio.rs> — https://github.com/tokio-rs/tls
- crate tokio-rustls@0.26.6 — https://github.com/rustls/tokio-rustls
- crate tokio-stream@0.1.19 — Tokio Contributors <team@tokio.rs> — https://github.com/tokio-rs/tokio
- crate tokio-util@0.7.20 — Tokio Contributors <team@tokio.rs> — https://github.com/tokio-rs/tokio
- crate toml@0.9.12+spec-1.1.0 — https://github.com/toml-rs/toml
- crate toml@1.1.8+spec-1.1.0 — https://github.com/toml-rs/toml
- crate toml_datetime@0.7.5+spec-1.1.0 — https://github.com/toml-rs/toml
- crate toml_datetime@1.1.2+spec-1.1.0 — https://github.com/toml-rs/toml
- crate toml_parser@1.1.5+spec-1.1.0 — https://github.com/toml-rs/toml
- crate toml_writer@1.1.3+spec-1.1.0 — https://github.com/toml-rs/toml
- crate tower@0.5.3 — Tower Maintainers <team@tower-rs.com> — https://github.com/tower-rs/tower
- crate tower-http@0.6.11 — Tower Maintainers <team@tower-rs.com> — https://github.com/tower-rs/tower-http
- crate tower-layer@0.3.3 — Tower Maintainers <team@tower-rs.com> — https://github.com/tower-rs/tower
- crate tower-service@0.3.3 — Tower Maintainers <team@tower-rs.com> — https://github.com/tower-rs/tower
- crate tracing@0.1.44 — Eliza Weisman <eliza@buoyant.io>; Tokio Contributors <team@tokio.rs> — https://github.com/tokio-rs/tracing
- crate tracing-attributes@0.1.31 — Tokio Contributors <team@tokio.rs>; Eliza Weisman <eliza@buoyant.io>; David Barsky <dbarsky@amazon.com> — https://github.com/tokio-rs/tracing
- crate tracing-core@0.1.36 — Tokio Contributors <team@tokio.rs> — https://github.com/tokio-rs/tracing
- crate tray-icon@0.24.2 — https://github.com/tauri-apps/tray-icon
- crate try-lock@0.2.5 — Sean McArthur <sean@seanmonstar.com> — https://github.com/seanmonstar/try-lock
- crate typeid@1.0.3 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/typeid
- crate typenum@1.20.1 — https://github.com/paholg/typenum
- crate unic-char-property@0.9.0 — The UNIC Project Developers — https://github.com/open-i18n/rust-unic/
- crate unic-char-range@0.9.0 — The UNIC Project Developers — https://github.com/open-i18n/rust-unic/
- crate unic-common@0.9.0 — The UNIC Project Developers — https://github.com/open-i18n/rust-unic/
- crate unic-ucd-ident@0.9.0 — The UNIC Project Developers — https://github.com/open-i18n/rust-unic/
- crate unic-ucd-version@0.9.0 — The UNIC Project Developers — https://github.com/open-i18n/rust-unic/
- crate unicode-ident@1.0.27 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/unicode-ident
- crate unicode-segmentation@1.13.3 — kwantam <kwantam@gmail.com>; Manish Goregaokar <manishsmail@gmail.com> — https://github.com/unicode-rs/unicode-segmentation
- crate universal-hash@0.5.1 — RustCrypto Developers — https://github.com/RustCrypto/traits
- crate untrusted@0.9.0 — Brian Smith <brian@briansmith.org> — https://github.com/briansmith/untrusted
- crate url@2.5.8 — The rust-url developers — https://github.com/servo/rust-url
- crate urlpattern@0.3.0 — the Deno authors; crowlKats <crowlkats@toaxl.com> — https://github.com/denoland/rust-urlpattern
- crate utf-8@0.7.6 — Simon Sapin <simon.sapin@exyr.org> — https://github.com/SimonSapin/rust-utf8
- crate utf8_iter@1.0.4 — Henri Sivonen <hsivonen@hsivonen.fi> — https://github.com/hsivonen/utf8_iter
- crate utf8parse@0.2.2 — Joe Wilm <joe@jwilm.com>; Christian Duerr <contact@christianduerr.com> — https://github.com/alacritty/vte
- crate uuid@1.26.1 — Ashley Mannix<ashleymannix@live.com.au>; Dylan DPC<dylan.dpc@gmail.com>; Hunar Roop Kahlon<hunar.roop@gmail.com> — https://github.com/uuid-rs/uuid
- crate vcpkg@0.2.15 — Jim McGrath <jimmc2@gmail.com> — https://github.com/mcgoo/vcpkg-rs
- crate version_check@0.9.5 — Sergio Benitez <sb@sergio.bz> — https://github.com/SergioBenitez/version_check
- crate vswhom@0.1.0 — nabijaczleweli <nabijaczleweli@gmail.com> — https://github.com/nabijaczleweli/vswhom.rs
- crate vswhom-sys@0.1.3 — наб <nabijaczleweli@nabijaczleweli.xyz>; forrestsmithfb <forrest.smith@fb.com> — https://github.com/nabijaczleweli/vswhom-sys.rs
- crate walkdir@2.5.0 — Andrew Gallant <jamslam@gmail.com> — https://github.com/BurntSushi/walkdir
- crate want@0.3.2 — Sean McArthur <sean@seanmonstar.com> — https://github.com/seanmonstar/want
- crate web_atoms@0.1.3 — The html5ever Project Developers — https://github.com/servo/html5ever
- crate web_atoms@0.2.6 — The html5ever Project Developers — https://github.com/servo/html5ever
- crate webpki-roots@1.0.11 — https://github.com/rustls/webpki-roots
- crate webview2-com@0.38.2 — https://github.com/wravery/webview2-rs
- crate webview2-com-macros@0.8.1 — https://github.com/wravery/webview2-rs
- crate webview2-com-sys@0.38.2 — https://github.com/wravery/webview2-rs
- crate winapi-util@0.1.11 — Andrew Gallant <jamslam@gmail.com> — https://github.com/BurntSushi/winapi-util
- crate window-vibrancy@0.6.0 — Tauri Programme within The Commons Conservancy — https://github.com/tauri-apps/tauri-plugin-vibrancy
- crate windows@0.58.0 — Microsoft — https://github.com/microsoft/windows-rs
- crate windows@0.61.3 — Microsoft — https://github.com/microsoft/windows-rs
- crate windows_x86_64_msvc@0.52.6 — Microsoft — https://github.com/microsoft/windows-rs
- crate windows_x86_64_msvc@0.53.1 — https://github.com/microsoft/windows-rs
- crate windows-collections@0.2.0 — https://github.com/microsoft/windows-rs
- crate windows-core@0.58.0 — Microsoft — https://github.com/microsoft/windows-rs
- crate windows-core@0.61.2 — Microsoft — https://github.com/microsoft/windows-rs
- crate windows-future@0.2.1 — https://github.com/microsoft/windows-rs
- crate windows-implement@0.58.0 — Microsoft — https://github.com/microsoft/windows-rs
- crate windows-implement@0.60.2 — https://github.com/microsoft/windows-rs
- crate windows-interface@0.58.0 — Microsoft — https://github.com/microsoft/windows-rs
- crate windows-interface@0.59.3 — https://github.com/microsoft/windows-rs
- crate windows-link@0.1.3 — Microsoft — https://github.com/microsoft/windows-rs
- crate windows-link@0.2.1 — https://github.com/microsoft/windows-rs
- crate windows-numerics@0.2.0 — https://github.com/microsoft/windows-rs
- crate windows-result@0.2.0 — Microsoft — https://github.com/microsoft/windows-rs
- crate windows-result@0.3.4 — Microsoft — https://github.com/microsoft/windows-rs
- crate windows-strings@0.1.0 — Microsoft — https://github.com/microsoft/windows-rs
- crate windows-strings@0.4.2 — Microsoft — https://github.com/microsoft/windows-rs
- crate windows-sys@0.59.0 — Microsoft — https://github.com/microsoft/windows-rs
- crate windows-sys@0.60.2 — Microsoft — https://github.com/microsoft/windows-rs
- crate windows-sys@0.61.2 — https://github.com/microsoft/windows-rs
- crate windows-targets@0.52.6 — Microsoft — https://github.com/microsoft/windows-rs
- crate windows-targets@0.53.5 — https://github.com/microsoft/windows-rs
- crate windows-threading@0.1.0 — Microsoft — https://github.com/microsoft/windows-rs
- crate windows-version@0.1.7 — https://github.com/microsoft/windows-rs
- crate winnow@0.7.15 — https://github.com/winnow-rs/winnow
- crate winnow@1.0.4 — https://github.com/winnow-rs/winnow
- crate winreg@0.56.0 — Igor Shaula <gentoo90@gmail.com> — https://github.com/gentoo90/winreg-rs
- crate winvd@0.0.49 — Jari Otto Oskari Pennanen — https://github.com/ciantic/VirtualDesktopAccessor/tree/rust/
- crate writeable@0.6.4 — The ICU4X Project Developers — https://github.com/unicode-org/icu4x
- crate wry@0.55.1 — Tauri Programme within The Commons Conservancy — https://github.com/tauri-apps/wry
- crate xattr@1.6.1 — Steven Allen <steven@stebalien.com> — https://github.com/Stebalien/xattr
- crate yoke@0.8.3 — Manish Goregaokar <manishsmail@gmail.com> — https://github.com/unicode-org/icu4x
- crate yoke-derive@0.8.4 — Manish Goregaokar <manishsmail@gmail.com> — https://github.com/unicode-org/icu4x
- crate zerofrom@0.1.8 — The ICU4X Project Developers — https://github.com/unicode-org/icu4x
- crate zerofrom-derive@0.1.8 — Manish Goregaokar <manishsmail@gmail.com> — https://github.com/unicode-org/icu4x
- crate zeroize@1.9.1 — The RustCrypto Project Developers — https://github.com/RustCrypto/utils
- crate zerotrie@0.2.5 — The ICU4X Project Developers — https://github.com/unicode-org/icu4x
- crate zerovec@0.11.8 — The ICU4X Project Developers — https://github.com/unicode-org/icu4x
- crate zerovec-derive@0.11.6 — Manish Goregaokar <manishsmail@gmail.com> — https://github.com/unicode-org/icu4x
- crate zip@4.6.1 — Mathijs van de Nes <git@mathijs.vd-nes.nl>; Marli Frost <marli@frost.red>; Ryan Levick <ryan.levick@gmail.com>; Chris Hennick <hennickc@amazon.com> — https://github.com/zip-rs/zip2.git
- crate zlib-rs@0.6.8 — https://github.com/trifectatechfoundation/zlib-rs
- crate zmij@1.0.23 — David Tolnay <dtolnay@gmail.com> — https://github.com/dtolnay/zmij

## 原许可与通知全文

<a id="notice-c435050845f9"></a>

### notice-c435050845f9

来源：

- MIT standard terms (SPDX license-list-data; author attribution remains package-specific)

``````text
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-86cf9656479f"></a>

### notice-86cf9656479f

来源：

- https://raw.githubusercontent.com/spdx/license-list-data/main/text/MPL-2.0.txt
- crate option-ext@0.2.0: LICENSE.txt

``````text
Mozilla Public License Version 2.0
==================================

1. Definitions
--------------

1.1. "Contributor"
    means each individual or legal entity that creates, contributes to
    the creation of, or owns Covered Software.

1.2. "Contributor Version"
    means the combination of the Contributions of others (if any) used
    by a Contributor and that particular Contributor's Contribution.

1.3. "Contribution"
    means Covered Software of a particular Contributor.

1.4. "Covered Software"
    means Source Code Form to which the initial Contributor has attached
    the notice in Exhibit A, the Executable Form of such Source Code
    Form, and Modifications of such Source Code Form, in each case
    including portions thereof.

1.5. "Incompatible With Secondary Licenses"
    means

    (a) that the initial Contributor has attached the notice described
        in Exhibit B to the Covered Software; or

    (b) that the Covered Software was made available under the terms of
        version 1.1 or earlier of the License, but not also under the
        terms of a Secondary License.

1.6. "Executable Form"
    means any form of the work other than Source Code Form.

1.7. "Larger Work"
    means a work that combines Covered Software with other material, in
    a separate file or files, that is not Covered Software.

1.8. "License"
    means this document.

1.9. "Licensable"
    means having the right to grant, to the maximum extent possible,
    whether at the time of the initial grant or subsequently, any and
    all of the rights conveyed by this License.

1.10. "Modifications"
    means any of the following:

    (a) any file in Source Code Form that results from an addition to,
        deletion from, or modification of the contents of Covered
        Software; or

    (b) any new file in Source Code Form that contains any Covered
        Software.

1.11. "Patent Claims" of a Contributor
    means any patent claim(s), including without limitation, method,
    process, and apparatus claims, in any patent Licensable by such
    Contributor that would be infringed, but for the grant of the
    License, by the making, using, selling, offering for sale, having
    made, import, or transfer of either its Contributions or its
    Contributor Version.

1.12. "Secondary License"
    means either the GNU General Public License, Version 2.0, the GNU
    Lesser General Public License, Version 2.1, the GNU Affero General
    Public License, Version 3.0, or any later versions of those
    licenses.

1.13. "Source Code Form"
    means the form of the work preferred for making modifications.

1.14. "You" (or "Your")
    means an individual or a legal entity exercising rights under this
    License. For legal entities, "You" includes any entity that
    controls, is controlled by, or is under common control with You. For
    purposes of this definition, "control" means (a) the power, direct
    or indirect, to cause the direction or management of such entity,
    whether by contract or otherwise, or (b) ownership of more than
    fifty percent (50%) of the outstanding shares or beneficial
    ownership of such entity.

2. License Grants and Conditions
--------------------------------

2.1. Grants

Each Contributor hereby grants You a world-wide, royalty-free,
non-exclusive license:

(a) under intellectual property rights (other than patent or trademark)
    Licensable by such Contributor to use, reproduce, make available,
    modify, display, perform, distribute, and otherwise exploit its
    Contributions, either on an unmodified basis, with Modifications, or
    as part of a Larger Work; and

(b) under Patent Claims of such Contributor to make, use, sell, offer
    for sale, have made, import, and otherwise transfer either its
    Contributions or its Contributor Version.

2.2. Effective Date

The licenses granted in Section 2.1 with respect to any Contribution
become effective for each Contribution on the date the Contributor first
distributes such Contribution.

2.3. Limitations on Grant Scope

The licenses granted in this Section 2 are the only rights granted under
this License. No additional rights or licenses will be implied from the
distribution or licensing of Covered Software under this License.
Notwithstanding Section 2.1(b) above, no patent license is granted by a
Contributor:

(a) for any code that a Contributor has removed from Covered Software;
    or

(b) for infringements caused by: (i) Your and any other third party's
    modifications of Covered Software, or (ii) the combination of its
    Contributions with other software (except as part of its Contributor
    Version); or

(c) under Patent Claims infringed by Covered Software in the absence of
    its Contributions.

This License does not grant any rights in the trademarks, service marks,
or logos of any Contributor (except as may be necessary to comply with
the notice requirements in Section 3.4).

2.4. Subsequent Licenses

No Contributor makes additional grants as a result of Your choice to
distribute the Covered Software under a subsequent version of this
License (see Section 10.2) or under the terms of a Secondary License (if
permitted under the terms of Section 3.3).

2.5. Representation

Each Contributor represents that the Contributor believes its
Contributions are its original creation(s) or it has sufficient rights
to grant the rights to its Contributions conveyed by this License.

2.6. Fair Use

This License is not intended to limit any rights You have under
applicable copyright doctrines of fair use, fair dealing, or other
equivalents.

2.7. Conditions

Sections 3.1, 3.2, 3.3, and 3.4 are conditions of the licenses granted
in Section 2.1.

3. Responsibilities
-------------------

3.1. Distribution of Source Form

All distribution of Covered Software in Source Code Form, including any
Modifications that You create or to which You contribute, must be under
the terms of this License. You must inform recipients that the Source
Code Form of the Covered Software is governed by the terms of this
License, and how they can obtain a copy of this License. You may not
attempt to alter or restrict the recipients' rights in the Source Code
Form.

3.2. Distribution of Executable Form

If You distribute Covered Software in Executable Form then:

(a) such Covered Software must also be made available in Source Code
    Form, as described in Section 3.1, and You must inform recipients of
    the Executable Form how they can obtain a copy of such Source Code
    Form by reasonable means in a timely manner, at a charge no more
    than the cost of distribution to the recipient; and

(b) You may distribute such Executable Form under the terms of this
    License, or sublicense it under different terms, provided that the
    license for the Executable Form does not attempt to limit or alter
    the recipients' rights in the Source Code Form under this License.

3.3. Distribution of a Larger Work

You may create and distribute a Larger Work under terms of Your choice,
provided that You also comply with the requirements of this License for
the Covered Software. If the Larger Work is a combination of Covered
Software with a work governed by one or more Secondary Licenses, and the
Covered Software is not Incompatible With Secondary Licenses, this
License permits You to additionally distribute such Covered Software
under the terms of such Secondary License(s), so that the recipient of
the Larger Work may, at their option, further distribute the Covered
Software under the terms of either this License or such Secondary
License(s).

3.4. Notices

You may not remove or alter the substance of any license notices
(including copyright notices, patent notices, disclaimers of warranty,
or limitations of liability) contained within the Source Code Form of
the Covered Software, except that You may alter any license notices to
the extent required to remedy known factual inaccuracies.

3.5. Application of Additional Terms

You may choose to offer, and to charge a fee for, warranty, support,
indemnity or liability obligations to one or more recipients of Covered
Software. However, You may do so only on Your own behalf, and not on
behalf of any Contributor. You must make it absolutely clear that any
such warranty, support, indemnity, or liability obligation is offered by
You alone, and You hereby agree to indemnify every Contributor for any
liability incurred by such Contributor as a result of warranty, support,
indemnity or liability terms You offer. You may include additional
disclaimers of warranty and limitations of liability specific to any
jurisdiction.

4. Inability to Comply Due to Statute or Regulation
---------------------------------------------------

If it is impossible for You to comply with any of the terms of this
License with respect to some or all of the Covered Software due to
statute, judicial order, or regulation then You must: (a) comply with
the terms of this License to the maximum extent possible; and (b)
describe the limitations and the code they affect. Such description must
be placed in a text file included with all distributions of the Covered
Software under this License. Except to the extent prohibited by statute
or regulation, such description must be sufficiently detailed for a
recipient of ordinary skill to be able to understand it.

5. Termination
--------------

5.1. The rights granted under this License will terminate automatically
if You fail to comply with any of its terms. However, if You become
compliant, then the rights granted under this License from a particular
Contributor are reinstated (a) provisionally, unless and until such
Contributor explicitly and finally terminates Your grants, and (b) on an
ongoing basis, if such Contributor fails to notify You of the
non-compliance by some reasonable means prior to 60 days after You have
come back into compliance. Moreover, Your grants from a particular
Contributor are reinstated on an ongoing basis if such Contributor
notifies You of the non-compliance by some reasonable means, this is the
first time You have received notice of non-compliance with this License
from such Contributor, and You become compliant prior to 30 days after
Your receipt of the notice.

5.2. If You initiate litigation against any entity by asserting a patent
infringement claim (excluding declaratory judgment actions,
counter-claims, and cross-claims) alleging that a Contributor Version
directly or indirectly infringes any patent, then the rights granted to
You by any and all Contributors for the Covered Software under Section
2.1 of this License shall terminate.

5.3. In the event of termination under Sections 5.1 or 5.2 above, all
end user license agreements (excluding distributors and resellers) which
have been validly granted by You or Your distributors under this License
prior to termination shall survive termination.

************************************************************************
*                                                                      *
*  6. Disclaimer of Warranty                                           *
*  -------------------------                                           *
*                                                                      *
*  Covered Software is provided under this License on an "as is"       *
*  basis, without warranty of any kind, either expressed, implied, or  *
*  statutory, including, without limitation, warranties that the       *
*  Covered Software is free of defects, merchantable, fit for a        *
*  particular purpose or non-infringing. The entire risk as to the     *
*  quality and performance of the Covered Software is with You.        *
*  Should any Covered Software prove defective in any respect, You     *
*  (not any Contributor) assume the cost of any necessary servicing,   *
*  repair, or correction. This disclaimer of warranty constitutes an   *
*  essential part of this License. No use of any Covered Software is   *
*  authorized under this License except under this disclaimer.         *
*                                                                      *
************************************************************************

************************************************************************
*                                                                      *
*  7. Limitation of Liability                                          *
*  --------------------------                                          *
*                                                                      *
*  Under no circumstances and under no legal theory, whether tort      *
*  (including negligence), contract, or otherwise, shall any           *
*  Contributor, or anyone who distributes Covered Software as          *
*  permitted above, be liable to You for any direct, indirect,         *
*  special, incidental, or consequential damages of any character      *
*  including, without limitation, damages for lost profits, loss of    *
*  goodwill, work stoppage, computer failure or malfunction, or any    *
*  and all other commercial damages or losses, even if such party      *
*  shall have been informed of the possibility of such damages. This   *
*  limitation of liability shall not apply to liability for death or   *
*  personal injury resulting from such party's negligence to the       *
*  extent applicable law prohibits such limitation. Some               *
*  jurisdictions do not allow the exclusion or limitation of           *
*  incidental or consequential damages, so this exclusion and          *
*  limitation may not apply to You.                                    *
*                                                                      *
************************************************************************

8. Litigation
-------------

Any litigation relating to this License may be brought only in the
courts of a jurisdiction where the defendant maintains its principal
place of business and such litigation shall be governed by laws of that
jurisdiction, without reference to its conflict-of-law provisions.
Nothing in this Section shall prevent a party's ability to bring
cross-claims or counter-claims.

9. Miscellaneous
----------------

This License represents the complete agreement concerning the subject
matter hereof. If any provision of this License is held to be
unenforceable, such provision shall be reformed only to the extent
necessary to make it enforceable. Any law or regulation which provides
that the language of a contract shall be construed against the drafter
shall not be used to construe this License against a Contributor.

10. Versions of the License
---------------------------

10.1. New Versions

Mozilla Foundation is the license steward. Except as provided in Section
10.3, no one other than the license steward has the right to modify or
publish new versions of this License. Each version will be given a
distinguishing version number.

10.2. Effect of New Versions

You may distribute the Covered Software under the terms of the version
of the License under which You originally received the Covered Software,
or under the terms of any subsequent version published by the license
steward.

10.3. Modified Versions

If you create software not governed by this License, and you want to
create a new license for such software, you may create and use a
modified version of this License if you rename the license and remove
any references to the name of the license steward (except to note that
such modified license differs from this License).

10.4. Distributing Source Code Form that is Incompatible With Secondary
Licenses

If You choose to distribute Source Code Form that is Incompatible With
Secondary Licenses under the terms of this version of the License, the
notice described in Exhibit B of this License must be attached.

Exhibit A - Source Code Form License Notice
-------------------------------------------

  This Source Code Form is subject to the terms of the Mozilla Public
  License, v. 2.0. If a copy of the MPL was not distributed with this
  file, You can obtain one at https://mozilla.org/MPL/2.0/.

If it is not possible or desirable to put the notice in a particular
file, then You may include the notice in a location (such as a LICENSE
file in a relevant directory) where a recipient would be likely to look
for such a notice.

You may add additional accurate notices of copyright ownership.

Exhibit B - "Incompatible With Secondary Licenses" Notice
---------------------------------------------------------

  This Source Code Form is "Incompatible With Secondary Licenses", as
  defined by the Mozilla Public License, v. 2.0.
``````

<a id="notice-6c1117dc530c"></a>

### notice-6c1117dc530c

来源：

- npm @floating-ui/core@1.8.0: LICENSE
- npm @floating-ui/dom@1.8.0: LICENSE
- npm @floating-ui/react-dom@2.1.9: LICENSE
- npm @floating-ui/utils@0.2.12: LICENSE

``````text
MIT License

Copyright (c) 2021-present Floating UI contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-74144f6a3a6c"></a>

### notice-74144f6a3a6c

来源：

- npm @radix-ui/primitive@1.2.0: LICENSE
- npm @radix-ui/react-arrow@1.1.17: LICENSE
- npm @radix-ui/react-collection@1.2.0: LICENSE
- npm @radix-ui/react-compose-refs@1.1.5: LICENSE
- npm @radix-ui/react-context@1.3.0: LICENSE
- npm @radix-ui/react-direction@1.2.0: LICENSE
- npm @radix-ui/react-dismissable-layer@1.2.1: LICENSE
- npm @radix-ui/react-dropdown-menu@2.2.1: LICENSE
- npm @radix-ui/react-focus-guards@1.2.0: LICENSE
- npm @radix-ui/react-focus-scope@1.3.1: LICENSE
- npm @radix-ui/react-id@1.1.4: LICENSE
- npm @radix-ui/react-menu@2.2.1: LICENSE
- npm @radix-ui/react-popper@1.4.0: LICENSE
- npm @radix-ui/react-portal@1.2.0: LICENSE
- npm @radix-ui/react-presence@1.1.11: LICENSE
- npm @radix-ui/react-primitive@2.2.0: LICENSE
- npm @radix-ui/react-roving-focus@1.2.1: LICENSE
- npm @radix-ui/react-slot@1.5.0: LICENSE
- npm @radix-ui/react-use-callback-ref@1.1.5: LICENSE
- npm @radix-ui/react-use-controllable-state@1.3.0: LICENSE
- npm @radix-ui/react-use-effect-event@0.0.5: LICENSE
- npm @radix-ui/react-use-is-hydrated@0.1.3: LICENSE
- npm @radix-ui/react-use-layout-effect@1.1.4: LICENSE
- npm @radix-ui/react-use-rect@1.1.4: LICENSE
- npm @radix-ui/react-use-size@1.1.5: LICENSE
- npm @radix-ui/rect@1.1.3: LICENSE

``````text
MIT License

Copyright (c) 2022 WorkOS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-4bf96504d6e8"></a>

### notice-4bf96504d6e8

来源：

- npm @tauri-apps/api@2.11.1: LICENSE_APACHE-2.0
- crate fdeflate@0.3.7: LICENSE-APACHE
- crate miniz_oxide@0.8.9: LICENSE-APACHE.md
- crate miniz_oxide@0.9.1: LICENSE-APACHE.md
- crate num-conv@0.2.2: LICENSE-Apache
- crate pin-project-lite@0.2.17: LICENSE-APACHE
- crate raw-window-handle@0.6.2: LICENSE-APACHE.md
- crate simdutf8@0.1.5: LICENSE-Apache
- crate sync_wrapper@1.0.2: LICENSE
- crate tauri@2.11.6: LICENSE_APACHE-2.0
- crate tauri-build@2.6.3: LICENSE_APACHE-2.0
- crate tauri-codegen@2.6.3: LICENSE_APACHE-2.0
- crate tauri-macros@2.6.3: LICENSE_APACHE-2.0
- crate tauri-plugin-opener@2.5.4: LICENSE_APACHE-2.0
- crate tauri-plugin-process@2.3.0: LICENSE_APACHE-2.0
- crate tauri-plugin-updater@2.9.0: LICENSE_APACHE-2.0
- crate tauri-runtime@2.11.3: LICENSE_APACHE-2.0
- crate tauri-runtime-wry@2.11.4: LICENSE_APACHE-2.0
- crate tauri-utils@2.9.3: LICENSE_APACHE-2.0
- crate time@0.3.55: LICENSE-Apache
- crate time-core@0.1.9: LICENSE-Apache
- crate time-macros@0.2.32: LICENSE-Apache

``````text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS
``````

<a id="notice-89ff9689dcf9"></a>

### notice-89ff9689dcf9

来源：

- npm @tauri-apps/api@2.11.1: LICENSE_MIT
- npm @tauri-apps/plugin-process@2.3.0: upstream Tauri LICENSE_MIT
- npm @tauri-apps/plugin-updater@2.9.0: upstream Tauri LICENSE_MIT
- crate tauri@2.11.6: LICENSE_MIT
- crate tauri-build@2.6.3: LICENSE_MIT
- crate tauri-codegen@2.6.3: LICENSE_MIT
- crate tauri-macros@2.6.3: LICENSE_MIT
- https://raw.githubusercontent.com/tauri-apps/tauri/6f6ab1207bb3923c2721fbc67d2fdb1c8deb0c7a/LICENSE_MIT
- crate tauri-plugin-opener@2.5.4: LICENSE_MIT
- crate tauri-plugin-process@2.3.0: LICENSE_MIT
- crate tauri-plugin-updater@2.9.0: LICENSE_MIT
- crate tauri-runtime@2.11.3: LICENSE_MIT
- crate tauri-runtime-wry@2.11.4: LICENSE_MIT
- crate tauri-utils@2.9.3: LICENSE_MIT

``````text
MIT License

Copyright (c) 2017 - Present Tauri Apps Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-eb8a6c846304"></a>

### notice-eb8a6c846304

来源：

- npm @tauri-apps/plugin-process@2.3.0: LICENSE.spdx
- npm @tauri-apps/plugin-updater@2.9.0: LICENSE.spdx
- crate tauri-plugin-opener@2.5.4: LICENSE.spdx
- crate tauri-plugin-process@2.3.0: LICENSE.spdx
- crate tauri-plugin-updater@2.9.0: LICENSE.spdx

``````text
SPDXVersion: SPDX-2.1
DataLicense: CC0-1.0
PackageName: tauri
DataFormat: SPDXRef-1
PackageSupplier: Organization: The Tauri Programme in the Commons Conservancy
PackageHomePage: https://tauri.app
PackageLicenseDeclared: Apache-2.0
PackageLicenseDeclared: MIT
PackageCopyrightText: 2019-2022, The Tauri Programme in the Commons Conservancy
PackageSummary: <text>Tauri is a rust project that enables developers to make secure
and small desktop applications using a web frontend.
                </text>
PackageComment: <text>The package includes the following libraries; see
Relationship information.
                </text>
Created: 2019-05-20T09:00:00Z
PackageDownloadLocation: git://github.com/tauri-apps/tauri
PackageDownloadLocation: git+https://github.com/tauri-apps/tauri.git
PackageDownloadLocation: git+ssh://github.com/tauri-apps/tauri.git
Creator: Person: Daniel Thompson-Yvetot
``````

<a id="notice-ff82c90f8494"></a>

### notice-ff82c90f8494

来源：

- npm @types/debug@4.1.13: LICENSE
- npm @types/estree@1.0.9: LICENSE
- npm @types/estree-jsx@1.0.5: LICENSE
- npm @types/hast@3.0.5: LICENSE
- npm @types/mdast@4.0.4: LICENSE
- npm @types/ms@2.1.0: LICENSE
- npm @types/react@19.3.0: LICENSE
- npm @types/react-dom@19.3.0: LICENSE
- npm @types/unist@3.0.3: LICENSE
- npm @types/unist@2.0.11: LICENSE
- crate windows@0.58.0: license-mit
- crate windows@0.61.3: license-mit
- crate windows_x86_64_msvc@0.52.6: license-mit
- crate windows_x86_64_msvc@0.53.1: license-mit
- crate windows-collections@0.2.0: license-mit
- crate windows-core@0.58.0: license-mit
- crate windows-core@0.61.2: license-mit
- crate windows-future@0.2.1: license-mit
- crate windows-implement@0.58.0: license-mit
- crate windows-implement@0.60.2: license-mit
- crate windows-interface@0.58.0: license-mit
- crate windows-interface@0.59.3: license-mit
- crate windows-link@0.1.3: license-mit
- crate windows-link@0.2.1: license-mit
- crate windows-numerics@0.2.0: license-mit
- crate windows-result@0.2.0: license-mit
- crate windows-result@0.3.4: license-mit
- crate windows-strings@0.1.0: license-mit
- crate windows-strings@0.4.2: license-mit
- crate windows-sys@0.59.0: license-mit
- crate windows-sys@0.60.2: license-mit
- crate windows-sys@0.61.2: license-mit
- crate windows-targets@0.52.6: license-mit
- crate windows-targets@0.53.5: license-mit
- crate windows-threading@0.1.0: license-mit
- crate windows-version@0.1.7: license-mit

``````text
MIT License

    Copyright (c) Microsoft Corporation.

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE
``````

<a id="notice-22fc2b0e60ba"></a>

### notice-22fc2b0e60ba

来源：

- npm @ungap/structured-clone@1.4.0: LICENSE

``````text
ISC License

Copyright (c) 2021, Andrea Giammarchi, @WebReflection

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE
OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
``````

<a id="notice-07dfb46d2e36"></a>

### notice-07dfb46d2e36

来源：

- npm aria-hidden@1.2.6: LICENSE
- npm react-remove-scroll@2.7.2: LICENSE
- npm react-style-singleton@2.2.3: LICENSE
- npm use-callback-ref@1.3.3: LICENSE
- npm use-sidecar@1.1.3: LICENSE

``````text
MIT License

Copyright (c) 2017 Anton Korzunov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-c37a32dd1cd4"></a>

### notice-c37a32dd1cd4

来源：

- npm bail@2.0.2: license
- npm ccount@2.0.1: license
- npm character-entities@2.0.2: license
- npm character-entities-html4@2.1.0: license
- npm character-entities-legacy@3.0.0: license
- npm character-reference-invalid@2.0.1: license
- npm mdast-util-to-string@4.0.0: license
- npm unist-util-position@5.0.0: license
- npm unist-util-visit@5.1.0: license

``````text
(The MIT License)

Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-d9c32f07344c"></a>

### notice-d9c32f07344c

来源：

- npm comma-separated-tokens@2.0.3: license
- npm hast-util-parse-selector@4.0.0: license
- npm hast-util-whitespace@3.0.0: license
- npm html-void-elements@3.0.0: license
- npm is-alphabetical@2.0.1: license
- npm is-alphanumerical@2.0.1: license
- npm is-decimal@2.0.1: license
- npm is-hexadecimal@2.0.1: license
- npm mdast-util-to-hast@13.2.1: license
- npm rehype-raw@7.0.0: license
- npm rehype-sanitize@6.0.0: license
- npm space-separated-tokens@2.0.2: license
- npm unist-util-stringify-position@4.0.0: license
- npm unist-util-visit-parents@6.0.2: license
- npm vfile-location@5.0.3: license
- npm web-namespaces@2.0.1: license
- npm zwitch@2.0.4: license

``````text
(The MIT License)

Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-6a972b33787e"></a>

### notice-6a972b33787e

来源：

- npm csstype@3.2.3: LICENSE

``````text
Copyright (c) 2017-2018 Fredrik Nicol

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-d9e5aa2747f3"></a>

### notice-d9e5aa2747f3

来源：

- npm debug@4.4.3: LICENSE

``````text
(The MIT License)

Copyright (c) 2014-2017 TJ Holowaychuk <tj@vision-media.ca>
Copyright (c) 2018-2021 Josh Junon

Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the 'Software'), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-ea559213e0e9"></a>

### notice-ea559213e0e9

来源：

- npm decode-named-character-reference@1.3.0: license
- npm hast-util-from-parse5@8.0.3: license
- npm hast-util-raw@9.1.0: license
- npm hast-util-sanitize@5.0.2: license
- npm hast-util-to-jsx-runtime@2.3.6: license
- npm hast-util-to-parse5@8.0.1: license
- npm hastscript@9.0.1: license
- npm markdown-table@3.0.4: license
- npm mdast-util-find-and-replace@3.0.3: license
- npm mdast-util-from-markdown@2.1.0: license
- npm mdast-util-gfm@3.1.0: license
- npm mdast-util-gfm-footnote@2.1.0: license
- npm mdast-util-gfm-strikethrough@2.0.1: license
- npm mdast-util-to-markdown@2.2.0: license
- npm micromark@4.0.3: license
- npm micromark-core-commonmark@2.0.4: license
- npm micromark-extension-gfm-table@2.1.2: license
- npm micromark-factory-destination@2.0.1: license
- npm micromark-factory-label@2.0.1: license
- npm micromark-factory-space@2.1.0: license
- npm micromark-factory-title@2.0.1: license
- npm micromark-factory-whitespace@2.0.1: license
- npm micromark-util-character@2.1.1: license
- npm micromark-util-chunked@2.0.1: license
- npm micromark-util-classify-character@2.0.1: license
- npm micromark-util-combine-extensions@2.0.1: license
- npm micromark-util-decode-numeric-character-reference@2.0.2: license
- npm micromark-util-decode-string@2.0.1: license
- npm micromark-util-edit-map@1.0.0: license
- npm micromark-util-encode@2.0.1: license
- npm micromark-util-html-tag-name@2.0.1: license
- npm micromark-util-normalize-identifier@2.0.1: license
- npm micromark-util-resolve-all@2.0.1: license
- npm micromark-util-sanitize-uri@2.0.1: license
- npm micromark-util-subtokenize@2.1.0: license
- npm micromark-util-symbol@2.0.1: license
- npm micromark-util-types@2.0.3: license
- npm remark-gfm@4.0.1: license
- npm remark-rehype@11.1.2: license
- npm vfile-message@4.0.3: license

``````text
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-d0a8e5996a99"></a>

### notice-d0a8e5996a99

来源：

- npm dequal@2.0.3: license

``````text
The MIT License (MIT)

Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-5dd2a43c0ed6"></a>

### notice-5dd2a43c0ed6

来源：

- npm detect-node-es@1.1.0: LICENSE

``````text
MIT License

Copyright (c) 2017 Ilya Kantor

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-189cbd7c4b22"></a>

### notice-189cbd7c4b22

来源：

- npm devlop@1.1.0: license

``````text
(The MIT License)

Copyright (c) 2023 Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-1529f88b3675"></a>

### notice-1529f88b3675

来源：

- npm escape-string-regexp@5.0.0: license
- npm is-plain-obj@4.1.0: license

``````text
MIT License

Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-0e99f2710dd2"></a>

### notice-0e99f2710dd2

来源：

- npm estree-util-is-identifier-name@3.0.0: license
- npm mdast-util-gfm-autolink-literal@2.0.1: license
- npm mdast-util-gfm-table@2.0.0: license
- npm mdast-util-gfm-task-list-item@2.0.0: license
- npm mdast-util-mdx-expression@2.0.1: license
- npm mdast-util-mdx-jsx@3.2.0: license
- npm mdast-util-mdxjs-esm@2.0.1: license
- npm micromark-extension-gfm@3.0.0: license
- npm micromark-extension-gfm-autolink-literal@2.1.0: license
- npm micromark-extension-gfm-strikethrough@2.1.0: license
- npm micromark-extension-gfm-tagfilter@2.0.0: license
- npm micromark-extension-gfm-task-list-item@2.1.0: license

``````text
(The MIT License)

Copyright (c) 2020 Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-b079b743d39a"></a>

### notice-b079b743d39a

来源：

- npm extend@3.0.2: LICENSE

``````text
The MIT License (MIT)

Copyright (c) 2014 Stefan Thomas

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-a05c505267a8"></a>

### notice-a05c505267a8

来源：

- npm get-nonce@1.0.1: LICENSE

``````text
MIT License

Copyright (c) 2020 Anton Korzunov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-0e57eeaccc07"></a>

### notice-0e57eeaccc07

来源：

- npm entities@6.0.1: LICENSE

``````text
Copyright (c) Felix Böhm
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS,
EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
``````

<a id="notice-2c01a01133de"></a>

### notice-2c01a01133de

来源：

- npm parse5@7.3.0: LICENSE

``````text
Copyright (c) 2013-2019 Ivan Nikulin (ifaaan@gmail.com, https://github.com/inikulin)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-2cf2d507c76c"></a>

### notice-2cf2d507c76c

来源：

- npm html-url-attributes@3.0.1: license

``````text
(The MIT License)

Copyright (c) Titus Wormer

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-9cac2500def4"></a>

### notice-9cac2500def4

来源：

- npm inline-style-parser@0.2.7: LICENSE

``````text
(The MIT License)

Copyright (c) 2012 TJ Holowaychuk <tj@vision-media.ca>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-4be46afa7981"></a>

### notice-4be46afa7981

来源：

- npm longest-streak@3.1.0: license
- npm stringify-entities@4.0.4: license
- npm trim-lines@3.0.1: license

``````text
(The MIT License)

Copyright (c) 2015 Titus Wormer <mailto:tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-092a9de2ea14"></a>

### notice-092a9de2ea14

来源：

- npm lucide-react@0.468.0: LICENSE

``````text
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
``````

<a id="notice-baf59c76fb66"></a>

### notice-baf59c76fb66

来源：

- npm lucide-react@0.468.0: dist/esm/icons/copyright.js.map

``````text
{"version":3,"file":"copyright.js","sources":["../../../src/icons/copyright.ts"],"sourcesContent":["import createLucideIcon from '../createLucideIcon';\n\n/**\n * @component @name Copyright\n * @description Lucide SVG icon component, renders SVG Element with children.\n *\n * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgLz4KICA8cGF0aCBkPSJNMTQuODMgMTQuODNhNCA0IDAgMSAxIDAtNS42NiIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/copyright\n * @see https://lucide.dev/guide/packages/lucide-react - Documentation\n *\n * @param {Object} props - Lucide icons props and any valid SVG attribute\n * @returns {JSX.Element} JSX Element\n *\n */\nconst Copyright = createLucideIcon('Copyright', [\n  ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],\n  ['path', { d: 'M14.83 14.83a4 4 0 1 1 0-5.66', key: '1i56pz' }],\n]);\n\nexport default Copyright;\n"],"names":[],"mappings":";;;;;;;;;AAaM,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAY,iBAAiB,WAAa,CAAA,CAAA,CAAA;AAAA,CAC9C,CAAA,CAAC,QAAU,CAAA,CAAA,CAAA,CAAE,EAAI,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,EAAM,CAAI,CAAA,CAAA,CAAA,IAAA,CAAM,CAAA,CAAG,EAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAM,GAAK,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,EAAU,CAAA,CAAA;AAAA,CAAA,CACzD,CAAC,CAAA,CAAA,CAAA,CAAA,CAAA,CAAQ,CAAA,CAAA,CAAA,CAAE,GAAG,CAAiC,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAK,UAAU,CAAA;AAChE,CAAC,CAAA,CAAA;;"}
``````

<a id="notice-e11634cfe7bf"></a>

### notice-e11634cfe7bf

来源：

- npm mdast-util-phrasing@4.1.0: license

``````text
(The MIT License)

Copyright (c) 2017 Titus Wormer <tituswormer@gmail.com>
Copyright (c) 2017 Victor Felder <victor@draft.li>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-59e8b888f1d3"></a>

### notice-59e8b888f1d3

来源：

- npm micromark-extension-gfm-footnote@2.1.0: license

``````text
(The MIT License)

Copyright (c) 2021 Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-e91069c31b4e"></a>

### notice-e91069c31b4e

来源：

- npm ms@2.1.3: license.md

``````text
The MIT License (MIT)

Copyright (c) 2020 Vercel, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-c74f9c5a522f"></a>

### notice-c74f9c5a522f

来源：

- npm parse-entities@4.0.2: license
- npm property-information@7.2.0: license

``````text
(The MIT License)

Copyright (c) Titus Wormer <mailto:tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-cf9b17822d1f"></a>

### notice-cf9b17822d1f

来源：

- npm react@19.3.1: LICENSE
- npm react-dom@19.3.1: LICENSE
- npm scheduler@0.28.0: LICENSE

``````text
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-b7972f57b949"></a>

### notice-b7972f57b949

来源：

- npm react-markdown@10.1.0: license

``````text
The MIT License (MIT)

Copyright (c) Espen Hovlandsdal

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-ceedc02ca6ec"></a>

### notice-ceedc02ca6ec

来源：

- https://raw.githubusercontent.com/theKashey/react-remove-scroll-bar/master/LICENSE

``````text
MIT License

Copyright (c) 2025 Anton Korzunov <thekashey@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-f78777570e32"></a>

### notice-f78777570e32

来源：

- npm remark-parse@11.0.0: license
- npm remark-stringify@11.0.0: license

``````text
(The MIT License)

Copyright (c) 2014 Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-bdda7d25f6d1"></a>

### notice-bdda7d25f6d1

来源：

- npm style-to-js@1.1.21: LICENSE

``````text
The MIT License (MIT)

Copyright (c) 2020 Menglin "Mark" Xu <mark@remarkablemark.org>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-20b25fb4d9ba"></a>

### notice-20b25fb4d9ba

来源：

- npm style-to-object@1.0.14: LICENSE

``````text
The MIT License (MIT)

Copyright (c) 2017 Menglin "Mark" Xu <mark@remarkablemark.org>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-e1da326aaf68"></a>

### notice-e1da326aaf68

来源：

- npm trough@2.2.0: license

``````text
(The MIT License)

Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-0e8d2550baea"></a>

### notice-0e8d2550baea

来源：

- npm tslib@2.8.1: LICENSE.txt

``````text
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
``````

<a id="notice-e453dafb35c9"></a>

### notice-e453dafb35c9

来源：

- npm unified@11.0.5: license
- npm vfile@6.0.3: license

``````text
(The MIT License)

Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-a1563f431b1f"></a>

### notice-a1563f431b1f

来源：

- npm unist-util-is@6.0.1: license

``````text
(The MIT license)

Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-a21c914647d3"></a>

### notice-a21c914647d3

来源：

- crate adler2@2.0.1: LICENSE-0BSD

``````text
Copyright (C) Jonas Schievink <jonasschievink@gmail.com>

Permission to use, copy, modify, and/or distribute this software for
any purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN
AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT
OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
``````

<a id="notice-1bc86297d032"></a>

### notice-1bc86297d032

来源：

- crate adler2@2.0.1: LICENSE-APACHE
- crate cargo-platform@0.1.9: LICENSE-APACHE

``````text
Apache License
                        Version 2.0, January 2004
                     https://www.apache.org/licenses/LICENSE-2.0

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
``````

<a id="notice-30fefc3a7d6a"></a>

### notice-30fefc3a7d6a

来源：

- crate adler2@2.0.1: LICENSE-MIT
- crate anyhow@1.0.104: LICENSE-MIT
- crate async-trait@0.1.92: LICENSE-MIT
- crate atomic-waker@1.1.2: LICENSE-MIT
- crate camino@1.2.6: LICENSE-MIT
- crate cargo_metadata@0.19.2: LICENSE-MIT
- crate cargo-platform@0.1.9: LICENSE-MIT
- crate displaydoc@0.2.7: LICENSE-MIT
- crate dtoa@1.0.11: LICENSE-MIT
- crate dyn-clone@1.0.20: LICENSE-MIT
- crate erased-serde@0.4.10: LICENSE-MIT
- crate fastrand@2.5.0: LICENSE-MIT
- crate itoa@1.0.18: LICENSE-MIT
- crate once_cell@1.21.4: LICENSE-MIT
- crate pastey@0.2.3: LICENSE-MIT
- crate pin-project-lite@0.2.17: LICENSE-MIT
- crate proc-macro2@1.0.107: LICENSE-MIT
- crate quote@1.0.47: LICENSE-MIT
- crate ref-cast@1.0.27: LICENSE-MIT
- crate ref-cast-impl@1.0.27: LICENSE-MIT
- crate rustc-hash@2.1.3: LICENSE-MIT
- crate rustix@1.1.5: LICENSE-MIT
- crate rustversion@1.0.23: LICENSE-MIT
- crate semver@1.0.28: LICENSE-MIT
- crate serde@1.0.229: LICENSE-MIT
- crate serde_core@1.0.229: LICENSE-MIT
- crate serde_derive@1.0.229: LICENSE-MIT
- crate serde_derive_internals@0.29.1: LICENSE-MIT
- crate serde_json@1.0.154: LICENSE-MIT
- crate serde_repr@0.1.21: LICENSE-MIT
- crate serde-untagged@0.1.9: LICENSE-MIT
- crate servo_arc@0.4.3: LICENSE-MIT
- crate syn@2.0.119: LICENSE-MIT
- crate syn@3.0.9: LICENSE-MIT
- crate thiserror@1.0.69: LICENSE-MIT
- crate thiserror@2.0.21: LICENSE-MIT
- crate thiserror-impl@1.0.69: LICENSE-MIT
- crate thiserror-impl@2.0.21: LICENSE-MIT
- crate typeid@1.0.3: LICENSE-MIT
- https://raw.githubusercontent.com/open-i18n/rust-unic/5878605364af97a3358368a6eaef02104af2e016/LICENSE-MIT
- crate unicode-ident@1.0.27: LICENSE-MIT
- crate utf-8@0.7.6: LICENSE-MIT
- crate zmij@1.0.23: LICENSE-MIT

``````text
Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-e8541ea93f02"></a>

### notice-e8541ea93f02

来源：

- crate aead@0.5.2: LICENSE-APACHE
- crate aes@0.8.4: LICENSE-APACHE
- crate aes-gcm@0.10.3: LICENSE-APACHE
- crate block-buffer@0.10.4: LICENSE-APACHE
- crate chacha20@0.10.2: LICENSE-APACHE
- crate cipher@0.4.4: LICENSE-APACHE
- crate cpufeatures@0.2.17: LICENSE-APACHE
- crate cpufeatures@0.3.1: LICENSE-APACHE
- crate crypto-common@0.1.7: LICENSE-APACHE
- crate ctr@0.9.2: LICENSE-APACHE
- crate digest@0.10.7: LICENSE-APACHE
- crate ghash@0.5.1: LICENSE-APACHE
- crate inout@0.1.4: LICENSE-APACHE
- crate opaque-debug@0.3.1: LICENSE-APACHE
- crate polyval@0.6.2: LICENSE-APACHE
- crate sha2@0.10.9: LICENSE-APACHE
- crate universal-hash@0.5.1: LICENSE-APACHE

``````text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
``````

<a id="notice-b38f573d5bc8"></a>

### notice-b38f573d5bc8

来源：

- crate aead@0.5.2: LICENSE-MIT

``````text
Copyright (c) 2019 The RustCrypto Project Developers
Copyright (c) 2019 MobileCoin, LLC

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-33e996382660"></a>

### notice-33e996382660

来源：

- crate aes@0.8.4: LICENSE-MIT

``````text
Copyright (c) 2018 Artyom Pavlov

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-e90ad0f8f6fe"></a>

### notice-e90ad0f8f6fe

来源：

- crate aes-gcm@0.10.3: LICENSE-MIT

``````text
Copyright (c) 2019 The RustCrypto Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-65314a6c9668"></a>

### notice-65314a6c9668

来源：

- crate aho-corasick@1.1.5: COPYING
- crate byteorder@1.5.0: COPYING
- crate jiff@0.2.38: COPYING
- crate jiff-core@0.1.1: COPYING
- crate jiff-tzdb@0.1.9: COPYING
- crate jiff-tzdb-platform@0.1.3: COPYING
- crate memchr@2.8.3: COPYING
- crate same-file@1.0.6: COPYING
- crate walkdir@2.5.0: COPYING
- crate winapi-util@0.1.11: COPYING

``````text
This project is dual-licensed under the Unlicense and MIT licenses.

You may use this code under the terms of either license.
``````

<a id="notice-154c1af2b38e"></a>

### notice-154c1af2b38e

来源：

- crate aho-corasick@1.1.5: LICENSE-MIT
- crate byteorder@1.5.0: LICENSE-MIT
- crate jiff@0.2.38: LICENSE-MIT
- crate jiff-core@0.1.1: LICENSE-MIT
- crate jiff-tzdb@0.1.9: LICENSE-MIT
- crate jiff-tzdb-platform@0.1.3: LICENSE-MIT
- crate memchr@2.8.3: LICENSE-MIT
- crate walkdir@2.5.0: LICENSE-MIT

``````text
The MIT License (MIT)

Copyright (c) 2015 Andrew Gallant

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-6c91ec82929f"></a>

### notice-6c91ec82929f

来源：

- crate alloc-no-stdlib@2.0.4: LICENSE
- https://raw.githubusercontent.com/dropbox/rust-alloc-no-stdlib/ae42d22078b98549e987d2f03d12df7b984fde47/LICENSE
- crate brotli@8.0.4: LICENSE.BSD-3-Clause
- crate brotli-decompressor@5.0.3: LICENSE

``````text
Copyright (c) 2016 Dropbox, Inc.
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
``````

<a id="notice-6dc0e068dcf3"></a>

### notice-6dc0e068dcf3

来源：

- crate anstream@1.0.0: LICENSE-APACHE
- crate anstyle@1.0.14: LICENSE-APACHE
- crate anstyle-parse@1.0.0: LICENSE-APACHE
- crate anstyle-query@1.1.5: LICENSE-APACHE
- crate anstyle-wincon@3.0.11: LICENSE-APACHE
- crate colorchoice@1.0.5: LICENSE-APACHE
- crate crc32fast@1.5.2: LICENSE-APACHE
- crate ctor@0.8.0: LICENSE-APACHE
- crate ctor-proc-macro@0.0.7: LICENSE-APACHE
- crate dpi@0.1.2: LICENSE
- crate dtor@0.3.0: LICENSE-APACHE
- crate dtor-proc-macro@0.0.6: LICENSE-APACHE
- crate fallible-iterator@0.3.0: LICENSE-APACHE
- crate fallible-streaming-iterator@0.1.9: LICENSE-APACHE
- crate foreign-types@0.5.0: LICENSE-APACHE
- crate foreign-types-macros@0.2.4: LICENSE-APACHE
- crate foreign-types-shared@0.3.1: LICENSE-APACHE
- crate hex@0.4.3: LICENSE-APACHE
- crate is_terminal_polyfill@1.70.2: LICENSE-APACHE
- crate json-patch@3.0.1: LICENSE-APACHE
- crate native-tls@0.2.18: LICENSE-APACHE
- crate once_cell_polyfill@1.70.2: LICENSE-APACHE
- crate tao@0.35.3: LICENSE
- crate toml@0.9.12+spec-1.1.0: LICENSE-APACHE
- crate toml_datetime@0.7.5+spec-1.1.0: LICENSE-APACHE

``````text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "{}"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright {yyyy} {name of copyright owner}

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
``````

<a id="notice-4498464c2864"></a>

### notice-4498464c2864

来源：

- crate anstream@1.0.0: LICENSE-MIT
- crate anstyle@1.0.14: LICENSE-MIT
- crate anstyle-parse@1.0.0: LICENSE-MIT
- crate anstyle-query@1.1.5: LICENSE-MIT
- crate anstyle-wincon@3.0.11: LICENSE-MIT
- crate clap@4.6.7: LICENSE-MIT
- crate clap_builder@4.6.7: LICENSE-MIT
- crate clap_derive@4.6.7: LICENSE-MIT
- crate clap_lex@1.1.1: LICENSE-MIT
- crate colorchoice@1.0.5: LICENSE-MIT
- crate is_terminal_polyfill@1.70.2: LICENSE-MIT
- crate once_cell_polyfill@1.70.2: LICENSE-MIT
- crate serde_spanned@1.1.2: LICENSE-MIT
- crate toml@0.9.12+spec-1.1.0: LICENSE-MIT
- crate toml@1.1.8+spec-1.1.0: LICENSE-MIT
- crate toml_datetime@0.7.5+spec-1.1.0: LICENSE-MIT
- crate toml_datetime@1.1.2+spec-1.1.0: LICENSE-MIT
- crate toml_parser@1.1.5+spec-1.1.0: LICENSE-MIT
- crate toml_writer@1.1.3+spec-1.1.0: LICENSE-MIT

``````text
Copyright (c) Individual contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-85ad950cce87"></a>

### notice-85ad950cce87

来源：

- crate anyhow@1.0.104: LICENSE-APACHE
- crate async-trait@0.1.92: LICENSE-APACHE
- crate dtoa@1.0.11: LICENSE-APACHE
- crate dyn-clone@1.0.20: LICENSE-APACHE
- crate erased-serde@0.4.10: LICENSE-APACHE
- crate itoa@1.0.18: LICENSE-APACHE
- crate libc@0.2.191: LICENSE-APACHE
- crate osakit@0.3.1: LICENSE-APACHE
- crate pastey@0.2.3: LICENSE-APACHE
- crate proc-macro2@1.0.107: LICENSE-APACHE
- crate quote@1.0.47: LICENSE-APACHE
- crate ref-cast@1.0.27: LICENSE-APACHE
- crate ref-cast-impl@1.0.27: LICENSE-APACHE
- crate rustc-hash@2.1.3: LICENSE-APACHE
- crate rustversion@1.0.23: LICENSE-APACHE
- crate ryu@1.0.23: LICENSE-APACHE
- crate semver@1.0.28: LICENSE-APACHE
- crate serde@1.0.229: LICENSE-APACHE
- crate serde_core@1.0.229: LICENSE-APACHE
- crate serde_derive@1.0.229: LICENSE-APACHE
- crate serde_derive_internals@0.29.1: LICENSE-APACHE
- crate serde_json@1.0.154: LICENSE-APACHE
- crate serde_repr@0.1.21: LICENSE-APACHE
- crate serde_urlencoded@0.7.1: LICENSE-APACHE
- crate serde-untagged@0.1.9: LICENSE-APACHE
- crate syn@2.0.119: LICENSE-APACHE
- crate syn@3.0.9: LICENSE-APACHE
- crate thiserror@1.0.69: LICENSE-APACHE
- crate thiserror@2.0.21: LICENSE-APACHE
- crate thiserror-impl@1.0.69: LICENSE-APACHE
- crate thiserror-impl@2.0.21: LICENSE-APACHE
- crate typeid@1.0.3: LICENSE-APACHE
- crate unicode-ident@1.0.27: LICENSE-APACHE
- crate utf-8@0.7.6: LICENSE-APACHE
- crate utf8parse@0.2.2: LICENSE-APACHE

``````text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS
``````

<a id="notice-954f335b8baf"></a>

### notice-954f335b8baf

来源：

- crate atomic-waker@1.1.2: LICENSE-APACHE
- crate autocfg@1.5.1: LICENSE-APACHE
- crate base64@0.21.7: LICENSE-APACHE
- crate base64@0.22.1: LICENSE-APACHE
- crate base64@0.23.1: LICENSE-APACHE
- crate bitflags@1.3.2: LICENSE-APACHE
- crate bitflags@2.13.2: LICENSE-APACHE
- crate bs58@0.5.1: LICENSE-APACHE
- crate camino@1.2.6: LICENSE-APACHE
- crate cc@1.8.0: LICENSE-APACHE
- crate cfg-if@1.0.5: LICENSE-APACHE
- crate core_detect@1.0.0: LICENSE-APACHE
- crate core-foundation@0.10.1: LICENSE-APACHE
- crate core-foundation-sys@0.8.7: LICENSE-APACHE
- crate core-graphics@0.25.0: LICENSE-APACHE
- crate core-graphics-types@0.2.0: LICENSE-APACHE
- crate crossbeam-channel@0.5.17: LICENSE-APACHE
- crate crossbeam-utils@0.8.23: LICENSE-APACHE
- crate displaydoc@0.2.7: LICENSE-APACHE
- crate equivalent@1.0.3: LICENSE-APACHE
- crate errno@0.3.14: LICENSE-APACHE
- crate fastrand@2.5.0: LICENSE-APACHE
- crate filetime@0.2.29: LICENSE-APACHE
- crate find-msvc-tools@0.1.14: LICENSE-APACHE
- crate flate2@1.1.10: LICENSE-APACHE
- crate fnv@1.0.7: LICENSE-APACHE
- crate form_urlencoded@1.2.2: LICENSE-APACHE
- crate futf@0.1.5: LICENSE-APACHE
- crate glob@0.3.4: LICENSE-APACHE
- crate hashbrown@0.12.3: LICENSE-APACHE
- crate hashbrown@0.15.5: LICENSE-APACHE
- crate hashbrown@0.17.1: LICENSE-APACHE
- crate heck@0.5.0: LICENSE-APACHE
- crate html5ever@0.35.0: LICENSE-APACHE
- crate html5ever@0.38.0: LICENSE-APACHE
- crate httparse@1.10.1: LICENSE-APACHE
- crate hyper-rustls@0.27.10: LICENSE-APACHE
- crate hyper-tls@0.6.0: LICENSE-APACHE
- crate idna@1.1.0: LICENSE-APACHE
- crate idna_adapter@1.2.2: LICENSE-APACHE
- crate indexmap@1.9.3: LICENSE-APACHE
- crate indexmap@2.14.2: LICENSE-APACHE
- crate keyboard-types@0.7.0: LICENSE-APACHE
- crate lock_api@0.4.14: LICENSE-APACHE
- crate log@0.4.34: LICENSE-APACHE
- crate markup5ever@0.35.0: LICENSE-APACHE
- crate markup5ever@0.38.0: LICENSE-APACHE
- crate mime@0.3.17: LICENSE-APACHE
- crate muda@0.19.3: LICENSE-APACHE
- crate num-traits@0.2.19: LICENSE-APACHE
- crate once_cell@1.21.4: LICENSE-APACHE
- crate parking_lot@0.12.5: LICENSE-APACHE
- crate parking_lot_core@0.9.12: LICENSE-APACHE
- crate percent-encoding@2.3.2: LICENSE-APACHE
- crate pkg-config@0.3.34: LICENSE-APACHE
- crate png@0.17.16: LICENSE-APACHE
- crate png@0.18.1: LICENSE-APACHE
- crate regex@1.13.1: LICENSE-APACHE
- crate regex-automata@0.4.18: LICENSE-APACHE
- crate regex-syntax@0.8.11: LICENSE-APACHE
- crate ring@0.17.14: src/polyfill/once_cell/LICENSE-APACHE
- crate rustc_version@0.4.1: LICENSE-APACHE
- crate rustix@1.1.5: LICENSE-APACHE
- crate rustls@0.23.46: LICENSE-APACHE
- crate scopeguard@1.2.0: LICENSE-APACHE
- crate security-framework@3.7.0: LICENSE-APACHE
- crate security-framework-sys@2.17.0: LICENSE-APACHE
- crate serde_with@3.24.0: LICENSE-APACHE
- crate serde_with_macros@3.24.0: LICENSE-APACHE
- crate servo_arc@0.4.3: LICENSE-APACHE
- crate smallvec@1.16.3: LICENSE-APACHE
- crate socket2@0.6.5: LICENSE-APACHE
- crate stable_deref_trait@1.2.1: LICENSE-APACHE
- crate string_cache@0.8.9: LICENSE-APACHE
- crate string_cache@0.9.0: LICENSE-APACHE
- crate string_cache_codegen@0.5.4: LICENSE-APACHE
- crate string_cache_codegen@0.6.1: LICENSE-APACHE
- crate tar@0.4.46: LICENSE-APACHE
- crate tempfile@3.27.0: LICENSE-APACHE
- crate tendril@0.4.3: LICENSE-APACHE
- crate tendril@0.5.1: LICENSE-APACHE
- crate tray-icon@0.24.2: LICENSE-APACHE
- crate unicode-segmentation@1.13.3: LICENSE-APACHE
- crate url@2.5.8: LICENSE-APACHE
- crate uuid@1.26.1: LICENSE-APACHE
- crate vcpkg@0.2.15: LICENSE-APACHE
- crate version_check@0.9.5: LICENSE-APACHE
- crate web_atoms@0.1.3: LICENSE-APACHE
- crate web_atoms@0.2.6: LICENSE-APACHE
- crate window-vibrancy@0.6.0: LICENSE-APACHE
- crate wry@0.55.1: LICENSE-APACHE
- crate xattr@1.6.1: LICENSE-APACHE

``````text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
``````

<a id="notice-20746cc8a2fd"></a>

### notice-20746cc8a2fd

来源：

- crate atomic-waker@1.1.2: LICENSE-THIRD-PARTY

``````text
===============================================================================

Copyright (c) 2016 Alex Crichton
Copyright (c) 2017 The Tokio Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

===============================================================================

Copyright (c) 2016 Alex Crichton
Copyright (c) 2017 The Tokio Authors

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-99afaa30c178"></a>

### notice-99afaa30c178

来源：

- crate autocfg@1.5.1: LICENSE-MIT

``````text
Copyright (c) 2018 Josh Stone

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-6a8da4c78c72"></a>

### notice-6a8da4c78c72

来源：

- crate base64@0.21.7: LICENSE-MIT
- crate base64@0.22.1: LICENSE-MIT

``````text
The MIT License (MIT)

Copyright (c) 2015 Alice Maz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-2ff8d9734312"></a>

### notice-2ff8d9734312

来源：

- crate base64@0.23.1: LICENSE-MIT

``````text
The MIT License (MIT)

Copyright (c) 2025 Alice Maz, Marshall Pierce

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-7e1b38c60796"></a>

### notice-7e1b38c60796

来源：

- crate bit-set@0.8.0: LICENSE-APACHE
- crate bit-vec@0.8.0: LICENSE-APACHE
- crate defmt@1.2.0: LICENSE-APACHE
- crate defmt-macros@1.2.0: LICENSE-APACHE
- crate defmt-parser@1.1.0: LICENSE-APACHE
- crate hashlink@0.10.0: LICENSE-APACHE

``````text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
``````

<a id="notice-4c4e6eed8b86"></a>

### notice-4c4e6eed8b86

来源：

- crate bit-set@0.8.0: LICENSE-MIT
- crate bit-vec@0.8.0: LICENSE-MIT

``````text
Copyright (c) 2023 The Rust Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-14435fbcd271"></a>

### notice-14435fbcd271

来源：

- crate bitflags@1.3.2: LICENSE-MIT
- crate bitflags@2.13.2: LICENSE-MIT
- crate glob@0.3.4: LICENSE-MIT
- crate log@0.4.34: LICENSE-MIT
- crate num-traits@0.2.19: LICENSE-MIT
- crate regex@1.13.1: LICENSE-MIT
- crate regex-automata@0.4.18: LICENSE-MIT
- crate regex-syntax@0.8.11: LICENSE-MIT

``````text
Copyright (c) 2014 The Rust Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-5ff5253f2cb9"></a>

### notice-5ff5253f2cb9

来源：

- crate block-buffer@0.10.4: LICENSE-MIT

``````text
Copyright (c) 2018-2019 The RustCrypto Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-1aa0a3422448"></a>

### notice-1aa0a3422448

来源：

- https://raw.githubusercontent.com/madsmtm/objc2/7b1abfd750a2cacaea71d6a56ecfb83cb7de560b/LICENSE.md

``````text
# License

The licensing of these crates is a bit complicated:
- The crates `objc2`, `block2`, `objc2-foundation` and `objc2-encode` are
  [currently][#23] licensed under [the MIT license][MIT].
- All other crates are trio-licensed under the [Zlib], [Apache-2.0] or [MIT]
  license, at your option.

Furthermore, the crates are (usually automatically) derived from Apple SDKs,
and that may have implications for licensing, see below for details.

[#23]: https://github.com/madsmtm/objc2/issues/23
[MIT]: https://opensource.org/license/MIT
[Zlib]: https://zlib.net/zlib_license.html
[Apache-2.0]: https://www.apache.org/licenses/LICENSE-2.0


## Apple SDKs

These crates are derived from Apple SDKs shipped with Xcode. You can obtain a
copy of the Xcode license at:

https://www.apple.com/legal/sla/docs/xcode.pdf

Or by typing `xcodebuild -license` in your terminal.

From reading the license, it is unclear whether distributing derived works
such as these crates are allowed?

But in any case, to practically use these crates, you will have to link, and
that only works when you have the correct Xcode SDK available to provide the
required `.tbd` files, which is why we choose to still use the normal SPDX
identifiers in the crates (Xcode is required to use the crates, and when using
Xcode you have already agreed to the Xcode license).
``````

<a id="notice-2a57418d6b10"></a>

### notice-2a57418d6b10

来源：

- crate brotli@8.0.4: LICENSE.MIT

``````text
Copyright (c) 2009, 2010, 2013-2016 by the Brotli Authors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-67047503c71f"></a>

### notice-67047503c71f

来源：

- crate bs58@0.5.1: LICENSE-MIT

``````text
MIT License
Copyright (c) 2016 The roaring-rs developers.

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-51f778ffff2c"></a>

### notice-51f778ffff2c

来源：

- crate bytes@1.12.1: LICENSE

``````text
Copyright (c) 2018 Carl Lerche

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-fa4363848a0f"></a>

### notice-fa4363848a0f

来源：

- crate cargo_toml@0.22.3: LICENSE

``````text
© Kornel Lesiński

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

----

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-84e1bbfebd74"></a>

### notice-84e1bbfebd74

来源：

- crate cc@1.8.0: LICENSE-MIT
- crate cfg-if@1.0.5: LICENSE-MIT
- crate filetime@0.2.29: LICENSE-MIT
- crate find-msvc-tools@0.1.14: LICENSE-MIT
- crate pkg-config@0.3.34: LICENSE-MIT
- crate socket2@0.6.5: LICENSE-MIT

``````text
Copyright (c) 2014 Alex Crichton

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-3ce3e2561c6a"></a>

### notice-3ce3e2561c6a

来源：

- crate cfb@0.7.3: LICENSE

``````text
MIT License

Copyright (c) 2017 Matthew D. Steele

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-48513346d335"></a>

### notice-48513346d335

来源：

- crate cfg_aliases@0.2.2: LICENSE

``````text
MIT License

Copyright (c) 2020 Katharos Technology

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-1038b7737a0a"></a>

### notice-1038b7737a0a

来源：

- crate chacha20@0.10.2: LICENSE-MIT

``````text
Copyright (c) 2019-2026 The RustCrypto Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-ce4a94c006fa"></a>

### notice-ce4a94c006fa

来源：

- crate chrono@0.4.45: LICENSE.txt

``````text
Rust-chrono is dual-licensed under The MIT License [1] and
Apache 2.0 License [2]. Copyright (c) 2014--2026, Kang Seonghoon and
contributors.

Nota Bene: This is same as the Rust Project's own license.


[1]: <http://opensource.org/licenses/MIT>, which is reproduced below:

~~~~
The MIT License (MIT)

Copyright (c) 2014, Kang Seonghoon.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
~~~~


[2]: <http://www.apache.org/licenses/LICENSE-2.0>, which is reproduced below:

~~~~
                              Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
~~~~
``````

<a id="notice-92f01fc7ca90"></a>

### notice-92f01fc7ca90

来源：

- crate cipher@0.4.4: LICENSE-MIT

``````text
Copyright (c) 2016-2020 RustCrypto Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-9b689eac99cd"></a>

### notice-9b689eac99cd

来源：

- crate clap@4.6.7: LICENSE-APACHE
- crate clap_builder@4.6.7: LICENSE-APACHE
- crate clap_derive@4.6.7: LICENSE-APACHE
- crate clap_lex@1.1.1: LICENSE-APACHE
- crate serde_spanned@1.1.2: LICENSE-APACHE
- crate toml@1.1.8+spec-1.1.0: LICENSE-APACHE
- crate toml_datetime@1.1.2+spec-1.1.0: LICENSE-APACHE
- crate toml_parser@1.1.5+spec-1.1.0: LICENSE-APACHE
- crate toml_writer@1.1.3+spec-1.1.0: LICENSE-APACHE

``````text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "{}"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright Individual contributors

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
``````

<a id="notice-c859d211879e"></a>

### notice-c859d211879e

来源：

- crate cookie@0.18.2: LICENSE-APACHE

``````text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright 2017 Sergio Benitez
Copyright 2014 Alex Chricton

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
``````

<a id="notice-47c8d25246e6"></a>

### notice-47c8d25246e6

来源：

- crate cookie@0.18.2: LICENSE-MIT

``````text
Copyright (c) 2017 Sergio Benitez
Copyright (c) 2014 Alex Crichton

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-57895cdbc8fe"></a>

### notice-57895cdbc8fe

来源：

- crate core_detect@1.0.0: LICENSE-MIT

``````text
Copyright (c) 2017-2020 The Rust Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-3bfacc197ff2"></a>

### notice-3bfacc197ff2

来源：

- crate core-foundation@0.10.1: LICENSE-MIT
- crate core-foundation-sys@0.8.7: LICENSE-MIT
- crate core-graphics@0.25.0: LICENSE-MIT
- crate core-graphics-types@0.2.0: LICENSE-MIT
- crate string_cache@0.8.9: LICENSE-MIT
- crate string_cache@0.9.0: LICENSE-MIT
- crate string_cache_codegen@0.5.4: LICENSE-MIT
- crate string_cache_codegen@0.6.1: LICENSE-MIT

``````text
Copyright (c) 2012-2013 Mozilla Foundation

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-537db9073524"></a>

### notice-537db9073524

来源：

- crate core-graphics@0.25.0: COPYRIGHT

``````text
Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
<LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
option. All files in the project carrying such notice may not be
copied, modified, or distributed except according to those terms.
``````

<a id="notice-6334e52844d6"></a>

### notice-6334e52844d6

来源：

- crate cpufeatures@0.2.17: LICENSE-MIT

``````text
Copyright (c) 2020-2025 The RustCrypto Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-ea753cf1e3ec"></a>

### notice-ea753cf1e3ec

来源：

- crate cpufeatures@0.3.1: LICENSE-MIT

``````text
Copyright (c) 2020-2026 The RustCrypto Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-9599127e421e"></a>

### notice-9599127e421e

来源：

- crate crc32fast@1.5.2: LICENSE-MIT

``````text
MIT License

Copyright (c) 2018 Sam Rijs, Alex Crichton and contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-5a7d13c6710c"></a>

### notice-5a7d13c6710c

来源：

- crate crossbeam-channel@0.5.17: LICENSE-MIT
- crate crossbeam-utils@0.8.23: LICENSE-MIT

``````text
The MIT License (MIT)

Copyright (c) 2019 The Crossbeam Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-d10fa7c720bc"></a>

### notice-d10fa7c720bc

来源：

- crate crossbeam-channel@0.5.17: LICENSE-THIRD-PARTY

``````text
===============================================================================

matching.go
https://creativecommons.org/licenses/by/3.0/legalcode

Creative Commons Legal Code

Attribution 3.0 Unported

    CREATIVE COMMONS CORPORATION IS NOT A LAW FIRM AND DOES NOT PROVIDE
    LEGAL SERVICES. DISTRIBUTION OF THIS LICENSE DOES NOT CREATE AN
    ATTORNEY-CLIENT RELATIONSHIP. CREATIVE COMMONS PROVIDES THIS
    INFORMATION ON AN "AS-IS" BASIS. CREATIVE COMMONS MAKES NO WARRANTIES
    REGARDING THE INFORMATION PROVIDED, AND DISCLAIMS LIABILITY FOR
    DAMAGES RESULTING FROM ITS USE.

License

THE WORK (AS DEFINED BELOW) IS PROVIDED UNDER THE TERMS OF THIS CREATIVE
COMMONS PUBLIC LICENSE ("CCPL" OR "LICENSE"). THE WORK IS PROTECTED BY
COPYRIGHT AND/OR OTHER APPLICABLE LAW. ANY USE OF THE WORK OTHER THAN AS
AUTHORIZED UNDER THIS LICENSE OR COPYRIGHT LAW IS PROHIBITED.

BY EXERCISING ANY RIGHTS TO THE WORK PROVIDED HERE, YOU ACCEPT AND AGREE
TO BE BOUND BY THE TERMS OF THIS LICENSE. TO THE EXTENT THIS LICENSE MAY
BE CONSIDERED TO BE A CONTRACT, THE LICENSOR GRANTS YOU THE RIGHTS
CONTAINED HERE IN CONSIDERATION OF YOUR ACCEPTANCE OF SUCH TERMS AND
CONDITIONS.

1. Definitions

 a. "Adaptation" means a work based upon the Work, or upon the Work and
    other pre-existing works, such as a translation, adaptation,
    derivative work, arrangement of music or other alterations of a
    literary or artistic work, or phonogram or performance and includes
    cinematographic adaptations or any other form in which the Work may be
    recast, transformed, or adapted including in any form recognizably
    derived from the original, except that a work that constitutes a
    Collection will not be considered an Adaptation for the purpose of
    this License. For the avoidance of doubt, where the Work is a musical
    work, performance or phonogram, the synchronization of the Work in
    timed-relation with a moving image ("synching") will be considered an
    Adaptation for the purpose of this License.
 b. "Collection" means a collection of literary or artistic works, such as
    encyclopedias and anthologies, or performances, phonograms or
    broadcasts, or other works or subject matter other than works listed
    in Section 1(f) below, which, by reason of the selection and
    arrangement of their contents, constitute intellectual creations, in
    which the Work is included in its entirety in unmodified form along
    with one or more other contributions, each constituting separate and
    independent works in themselves, which together are assembled into a
    collective whole. A work that constitutes a Collection will not be
    considered an Adaptation (as defined above) for the purposes of this
    License.
 c. "Distribute" means to make available to the public the original and
    copies of the Work or Adaptation, as appropriate, through sale or
    other transfer of ownership.
 d. "Licensor" means the individual, individuals, entity or entities that
    offer(s) the Work under the terms of this License.
 e. "Original Author" means, in the case of a literary or artistic work,
    the individual, individuals, entity or entities who created the Work
    or if no individual or entity can be identified, the publisher; and in
    addition (i) in the case of a performance the actors, singers,
    musicians, dancers, and other persons who act, sing, deliver, declaim,
    play in, interpret or otherwise perform literary or artistic works or
    expressions of folklore; (ii) in the case of a phonogram the producer
    being the person or legal entity who first fixes the sounds of a
    performance or other sounds; and, (iii) in the case of broadcasts, the
    organization that transmits the broadcast.
 f. "Work" means the literary and/or artistic work offered under the terms
    of this License including without limitation any production in the
    literary, scientific and artistic domain, whatever may be the mode or
    form of its expression including digital form, such as a book,
    pamphlet and other writing; a lecture, address, sermon or other work
    of the same nature; a dramatic or dramatico-musical work; a
    choreographic work or entertainment in dumb show; a musical
    composition with or without words; a cinematographic work to which are
    assimilated works expressed by a process analogous to cinematography;
    a work of drawing, painting, architecture, sculpture, engraving or
    lithography; a photographic work to which are assimilated works
    expressed by a process analogous to photography; a work of applied
    art; an illustration, map, plan, sketch or three-dimensional work
    relative to geography, topography, architecture or science; a
    performance; a broadcast; a phonogram; a compilation of data to the
    extent it is protected as a copyrightable work; or a work performed by
    a variety or circus performer to the extent it is not otherwise
    considered a literary or artistic work.
 g. "You" means an individual or entity exercising rights under this
    License who has not previously violated the terms of this License with
    respect to the Work, or who has received express permission from the
    Licensor to exercise rights under this License despite a previous
    violation.
 h. "Publicly Perform" means to perform public recitations of the Work and
    to communicate to the public those public recitations, by any means or
    process, including by wire or wireless means or public digital
    performances; to make available to the public Works in such a way that
    members of the public may access these Works from a place and at a
    place individually chosen by them; to perform the Work to the public
    by any means or process and the communication to the public of the
    performances of the Work, including by public digital performance; to
    broadcast and rebroadcast the Work by any means including signs,
    sounds or images.
 i. "Reproduce" means to make copies of the Work by any means including
    without limitation by sound or visual recordings and the right of
    fixation and reproducing fixations of the Work, including storage of a
    protected performance or phonogram in digital form or other electronic
    medium.

2. Fair Dealing Rights. Nothing in this License is intended to reduce,
limit, or restrict any uses free from copyright or rights arising from
limitations or exceptions that are provided for in connection with the
copyright protection under copyright law or other applicable laws.

3. License Grant. Subject to the terms and conditions of this License,
Licensor hereby grants You a worldwide, royalty-free, non-exclusive,
perpetual (for the duration of the applicable copyright) license to
exercise the rights in the Work as stated below:

 a. to Reproduce the Work, to incorporate the Work into one or more
    Collections, and to Reproduce the Work as incorporated in the
    Collections;
 b. to create and Reproduce Adaptations provided that any such Adaptation,
    including any translation in any medium, takes reasonable steps to
    clearly label, demarcate or otherwise identify that changes were made
    to the original Work. For example, a translation could be marked "The
    original work was translated from English to Spanish," or a
    modification could indicate "The original work has been modified.";
 c. to Distribute and Publicly Perform the Work including as incorporated
    in Collections; and,
 d. to Distribute and Publicly Perform Adaptations.
 e. For the avoidance of doubt:

     i. Non-waivable Compulsory License Schemes. In those jurisdictions in
        which the right to collect royalties through any statutory or
        compulsory licensing scheme cannot be waived, the Licensor
        reserves the exclusive right to collect such royalties for any
        exercise by You of the rights granted under this License;
    ii. Waivable Compulsory License Schemes. In those jurisdictions in
        which the right to collect royalties through any statutory or
        compulsory licensing scheme can be waived, the Licensor waives the
        exclusive right to collect such royalties for any exercise by You
        of the rights granted under this License; and,
   iii. Voluntary License Schemes. The Licensor waives the right to
        collect royalties, whether individually or, in the event that the
        Licensor is a member of a collecting society that administers
        voluntary licensing schemes, via that society, from any exercise
        by You of the rights granted under this License.

The above rights may be exercised in all media and formats whether now
known or hereafter devised. The above rights include the right to make
such modifications as are technically necessary to exercise the rights in
other media and formats. Subject to Section 8(f), all rights not expressly
granted by Licensor are hereby reserved.

4. Restrictions. The license granted in Section 3 above is expressly made
subject to and limited by the following restrictions:

 a. You may Distribute or Publicly Perform the Work only under the terms
    of this License. You must include a copy of, or the Uniform Resource
    Identifier (URI) for, this License with every copy of the Work You
    Distribute or Publicly Perform. You may not offer or impose any terms
    on the Work that restrict the terms of this License or the ability of
    the recipient of the Work to exercise the rights granted to that
    recipient under the terms of the License. You may not sublicense the
    Work. You must keep intact all notices that refer to this License and
    to the disclaimer of warranties with every copy of the Work You
    Distribute or Publicly Perform. When You Distribute or Publicly
    Perform the Work, You may not impose any effective technological
    measures on the Work that restrict the ability of a recipient of the
    Work from You to exercise the rights granted to that recipient under
    the terms of the License. This Section 4(a) applies to the Work as
    incorporated in a Collection, but this does not require the Collection
    apart from the Work itself to be made subject to the terms of this
    License. If You create a Collection, upon notice from any Licensor You
    must, to the extent practicable, remove from the Collection any credit
    as required by Section 4(b), as requested. If You create an
    Adaptation, upon notice from any Licensor You must, to the extent
    practicable, remove from the Adaptation any credit as required by
    Section 4(b), as requested.
 b. If You Distribute, or Publicly Perform the Work or any Adaptations or
    Collections, You must, unless a request has been made pursuant to
    Section 4(a), keep intact all copyright notices for the Work and
    provide, reasonable to the medium or means You are utilizing: (i) the
    name of the Original Author (or pseudonym, if applicable) if supplied,
    and/or if the Original Author and/or Licensor designate another party
    or parties (e.g., a sponsor institute, publishing entity, journal) for
    attribution ("Attribution Parties") in Licensor's copyright notice,
    terms of service or by other reasonable means, the name of such party
    or parties; (ii) the title of the Work if supplied; (iii) to the
    extent reasonably practicable, the URI, if any, that Licensor
    specifies to be associated with the Work, unless such URI does not
    refer to the copyright notice or licensing information for the Work;
    and (iv) , consistent with Section 3(b), in the case of an Adaptation,
    a credit identifying the use of the Work in the Adaptation (e.g.,
    "French translation of the Work by Original Author," or "Screenplay
    based on original Work by Original Author"). The credit required by
    this Section 4 (b) may be implemented in any reasonable manner;
    provided, however, that in the case of a Adaptation or Collection, at
    a minimum such credit will appear, if a credit for all contributing
    authors of the Adaptation or Collection appears, then as part of these
    credits and in a manner at least as prominent as the credits for the
    other contributing authors. For the avoidance of doubt, You may only
    use the credit required by this Section for the purpose of attribution
    in the manner set out above and, by exercising Your rights under this
    License, You may not implicitly or explicitly assert or imply any
    connection with, sponsorship or endorsement by the Original Author,
    Licensor and/or Attribution Parties, as appropriate, of You or Your
    use of the Work, without the separate, express prior written
    permission of the Original Author, Licensor and/or Attribution
    Parties.
 c. Except as otherwise agreed in writing by the Licensor or as may be
    otherwise permitted by applicable law, if You Reproduce, Distribute or
    Publicly Perform the Work either by itself or as part of any
    Adaptations or Collections, You must not distort, mutilate, modify or
    take other derogatory action in relation to the Work which would be
    prejudicial to the Original Author's honor or reputation. Licensor
    agrees that in those jurisdictions (e.g. Japan), in which any exercise
    of the right granted in Section 3(b) of this License (the right to
    make Adaptations) would be deemed to be a distortion, mutilation,
    modification or other derogatory action prejudicial to the Original
    Author's honor and reputation, the Licensor will waive or not assert,
    as appropriate, this Section, to the fullest extent permitted by the
    applicable national law, to enable You to reasonably exercise Your
    right under Section 3(b) of this License (right to make Adaptations)
    but not otherwise.

5. Representations, Warranties and Disclaimer

UNLESS OTHERWISE MUTUALLY AGREED TO BY THE PARTIES IN WRITING, LICENSOR
OFFERS THE WORK AS-IS AND MAKES NO REPRESENTATIONS OR WARRANTIES OF ANY
KIND CONCERNING THE WORK, EXPRESS, IMPLIED, STATUTORY OR OTHERWISE,
INCLUDING, WITHOUT LIMITATION, WARRANTIES OF TITLE, MERCHANTIBILITY,
FITNESS FOR A PARTICULAR PURPOSE, NONINFRINGEMENT, OR THE ABSENCE OF
LATENT OR OTHER DEFECTS, ACCURACY, OR THE PRESENCE OF ABSENCE OF ERRORS,
WHETHER OR NOT DISCOVERABLE. SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION
OF IMPLIED WARRANTIES, SO SUCH EXCLUSION MAY NOT APPLY TO YOU.

6. Limitation on Liability. EXCEPT TO THE EXTENT REQUIRED BY APPLICABLE
LAW, IN NO EVENT WILL LICENSOR BE LIABLE TO YOU ON ANY LEGAL THEORY FOR
ANY SPECIAL, INCIDENTAL, CONSEQUENTIAL, PUNITIVE OR EXEMPLARY DAMAGES
ARISING OUT OF THIS LICENSE OR THE USE OF THE WORK, EVEN IF LICENSOR HAS
BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

7. Termination

 a. This License and the rights granted hereunder will terminate
    automatically upon any breach by You of the terms of this License.
    Individuals or entities who have received Adaptations or Collections
    from You under this License, however, will not have their licenses
    terminated provided such individuals or entities remain in full
    compliance with those licenses. Sections 1, 2, 5, 6, 7, and 8 will
    survive any termination of this License.
 b. Subject to the above terms and conditions, the license granted here is
    perpetual (for the duration of the applicable copyright in the Work).
    Notwithstanding the above, Licensor reserves the right to release the
    Work under different license terms or to stop distributing the Work at
    any time; provided, however that any such election will not serve to
    withdraw this License (or any other license that has been, or is
    required to be, granted under the terms of this License), and this
    License will continue in full force and effect unless terminated as
    stated above.

8. Miscellaneous

 a. Each time You Distribute or Publicly Perform the Work or a Collection,
    the Licensor offers to the recipient a license to the Work on the same
    terms and conditions as the license granted to You under this License.
 b. Each time You Distribute or Publicly Perform an Adaptation, Licensor
    offers to the recipient a license to the original Work on the same
    terms and conditions as the license granted to You under this License.
 c. If any provision of this License is invalid or unenforceable under
    applicable law, it shall not affect the validity or enforceability of
    the remainder of the terms of this License, and without further action
    by the parties to this agreement, such provision shall be reformed to
    the minimum extent necessary to make such provision valid and
    enforceable.
 d. No term or provision of this License shall be deemed waived and no
    breach consented to unless such waiver or consent shall be in writing
    and signed by the party to be charged with such waiver or consent.
 e. This License constitutes the entire agreement between the parties with
    respect to the Work licensed here. There are no understandings,
    agreements or representations with respect to the Work not specified
    here. Licensor shall not be bound by any additional provisions that
    may appear in any communication from You. This License may not be
    modified without the mutual written agreement of the Licensor and You.
 f. The rights granted under, and the subject matter referenced, in this
    License were drafted utilizing the terminology of the Berne Convention
    for the Protection of Literary and Artistic Works (as amended on
    September 28, 1979), the Rome Convention of 1961, the WIPO Copyright
    Treaty of 1996, the WIPO Performances and Phonograms Treaty of 1996
    and the Universal Copyright Convention (as revised on July 24, 1971).
    These rights and subject matter take effect in the relevant
    jurisdiction in which the License terms are sought to be enforced
    according to the corresponding provisions of the implementation of
    those treaty provisions in the applicable national law. If the
    standard suite of rights granted under applicable copyright law
    includes additional rights not granted under this License, such
    additional rights are deemed to be included in the License; this
    License is not intended to restrict the license of any rights under
    applicable law.


Creative Commons Notice

    Creative Commons is not a party to this License, and makes no warranty
    whatsoever in connection with the Work. Creative Commons will not be
    liable to You or any party on any legal theory for any damages
    whatsoever, including without limitation any general, special,
    incidental or consequential damages arising in connection to this
    license. Notwithstanding the foregoing two (2) sentences, if Creative
    Commons has expressly identified itself as the Licensor hereunder, it
    shall have all rights and obligations of Licensor.

    Except for the limited purpose of indicating to the public that the
    Work is licensed under the CCPL, Creative Commons does not authorize
    the use by either party of the trademark "Creative Commons" or any
    related trademark or logo of Creative Commons without the prior
    written consent of Creative Commons. Any permitted use will be in
    compliance with Creative Commons' then-current trademark usage
    guidelines, as may be published on its website or otherwise made
    available upon request from time to time. For the avoidance of doubt,
    this trademark restriction does not form part of this License.

    Creative Commons may be contacted at https://creativecommons.org/.

===============================================================================

The Go Programming Language
https://golang.org/LICENSE

Copyright (c) 2009 The Go Authors. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

   * Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.
   * Redistributions in binary form must reproduce the above
copyright notice, this list of conditions and the following disclaimer
in the documentation and/or other materials provided with the
distribution.
   * Neither the name of Google Inc. nor the names of its
contributors may be used to endorse or promote products derived from
this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

===============================================================================

The Rust Programming Language
https://github.com/rust-lang/rust/blob/master/LICENSE-MIT

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.

===============================================================================

The Rust Programming Language
https://github.com/rust-lang/rust/blob/master/LICENSE-APACHE

                              Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
``````

<a id="notice-692b1604961d"></a>

### notice-692b1604961d

来源：

- crate crypto-common@0.1.7: LICENSE-MIT

``````text
Copyright (c) 2021 RustCrypto Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-4b89d4518bd1"></a>

### notice-4b89d4518bd1

来源：

- crate cssparser@0.35.0: LICENSE
- crate cssparser@0.36.0: LICENSE
- crate cssparser-macros@0.6.1: LICENSE
- crate dtoa-short@0.3.5: LICENSE

``````text
Mozilla Public License Version 2.0
==================================

1. Definitions
--------------

1.1. "Contributor"
    means each individual or legal entity that creates, contributes to
    the creation of, or owns Covered Software.

1.2. "Contributor Version"
    means the combination of the Contributions of others (if any) used
    by a Contributor and that particular Contributor's Contribution.

1.3. "Contribution"
    means Covered Software of a particular Contributor.

1.4. "Covered Software"
    means Source Code Form to which the initial Contributor has attached
    the notice in Exhibit A, the Executable Form of such Source Code
    Form, and Modifications of such Source Code Form, in each case
    including portions thereof.

1.5. "Incompatible With Secondary Licenses"
    means

    (a) that the initial Contributor has attached the notice described
        in Exhibit B to the Covered Software; or

    (b) that the Covered Software was made available under the terms of
        version 1.1 or earlier of the License, but not also under the
        terms of a Secondary License.

1.6. "Executable Form"
    means any form of the work other than Source Code Form.

1.7. "Larger Work"
    means a work that combines Covered Software with other material, in
    a separate file or files, that is not Covered Software.

1.8. "License"
    means this document.

1.9. "Licensable"
    means having the right to grant, to the maximum extent possible,
    whether at the time of the initial grant or subsequently, any and
    all of the rights conveyed by this License.

1.10. "Modifications"
    means any of the following:

    (a) any file in Source Code Form that results from an addition to,
        deletion from, or modification of the contents of Covered
        Software; or

    (b) any new file in Source Code Form that contains any Covered
        Software.

1.11. "Patent Claims" of a Contributor
    means any patent claim(s), including without limitation, method,
    process, and apparatus claims, in any patent Licensable by such
    Contributor that would be infringed, but for the grant of the
    License, by the making, using, selling, offering for sale, having
    made, import, or transfer of either its Contributions or its
    Contributor Version.

1.12. "Secondary License"
    means either the GNU General Public License, Version 2.0, the GNU
    Lesser General Public License, Version 2.1, the GNU Affero General
    Public License, Version 3.0, or any later versions of those
    licenses.

1.13. "Source Code Form"
    means the form of the work preferred for making modifications.

1.14. "You" (or "Your")
    means an individual or a legal entity exercising rights under this
    License. For legal entities, "You" includes any entity that
    controls, is controlled by, or is under common control with You. For
    purposes of this definition, "control" means (a) the power, direct
    or indirect, to cause the direction or management of such entity,
    whether by contract or otherwise, or (b) ownership of more than
    fifty percent (50%) of the outstanding shares or beneficial
    ownership of such entity.

2. License Grants and Conditions
--------------------------------

2.1. Grants

Each Contributor hereby grants You a world-wide, royalty-free,
non-exclusive license:

(a) under intellectual property rights (other than patent or trademark)
    Licensable by such Contributor to use, reproduce, make available,
    modify, display, perform, distribute, and otherwise exploit its
    Contributions, either on an unmodified basis, with Modifications, or
    as part of a Larger Work; and

(b) under Patent Claims of such Contributor to make, use, sell, offer
    for sale, have made, import, and otherwise transfer either its
    Contributions or its Contributor Version.

2.2. Effective Date

The licenses granted in Section 2.1 with respect to any Contribution
become effective for each Contribution on the date the Contributor first
distributes such Contribution.

2.3. Limitations on Grant Scope

The licenses granted in this Section 2 are the only rights granted under
this License. No additional rights or licenses will be implied from the
distribution or licensing of Covered Software under this License.
Notwithstanding Section 2.1(b) above, no patent license is granted by a
Contributor:

(a) for any code that a Contributor has removed from Covered Software;
    or

(b) for infringements caused by: (i) Your and any other third party's
    modifications of Covered Software, or (ii) the combination of its
    Contributions with other software (except as part of its Contributor
    Version); or

(c) under Patent Claims infringed by Covered Software in the absence of
    its Contributions.

This License does not grant any rights in the trademarks, service marks,
or logos of any Contributor (except as may be necessary to comply with
the notice requirements in Section 3.4).

2.4. Subsequent Licenses

No Contributor makes additional grants as a result of Your choice to
distribute the Covered Software under a subsequent version of this
License (see Section 10.2) or under the terms of a Secondary License (if
permitted under the terms of Section 3.3).

2.5. Representation

Each Contributor represents that the Contributor believes its
Contributions are its original creation(s) or it has sufficient rights
to grant the rights to its Contributions conveyed by this License.

2.6. Fair Use

This License is not intended to limit any rights You have under
applicable copyright doctrines of fair use, fair dealing, or other
equivalents.

2.7. Conditions

Sections 3.1, 3.2, 3.3, and 3.4 are conditions of the licenses granted
in Section 2.1.

3. Responsibilities
-------------------

3.1. Distribution of Source Form

All distribution of Covered Software in Source Code Form, including any
Modifications that You create or to which You contribute, must be under
the terms of this License. You must inform recipients that the Source
Code Form of the Covered Software is governed by the terms of this
License, and how they can obtain a copy of this License. You may not
attempt to alter or restrict the recipients' rights in the Source Code
Form.

3.2. Distribution of Executable Form

If You distribute Covered Software in Executable Form then:

(a) such Covered Software must also be made available in Source Code
    Form, as described in Section 3.1, and You must inform recipients of
    the Executable Form how they can obtain a copy of such Source Code
    Form by reasonable means in a timely manner, at a charge no more
    than the cost of distribution to the recipient; and

(b) You may distribute such Executable Form under the terms of this
    License, or sublicense it under different terms, provided that the
    license for the Executable Form does not attempt to limit or alter
    the recipients' rights in the Source Code Form under this License.

3.3. Distribution of a Larger Work

You may create and distribute a Larger Work under terms of Your choice,
provided that You also comply with the requirements of this License for
the Covered Software. If the Larger Work is a combination of Covered
Software with a work governed by one or more Secondary Licenses, and the
Covered Software is not Incompatible With Secondary Licenses, this
License permits You to additionally distribute such Covered Software
under the terms of such Secondary License(s), so that the recipient of
the Larger Work may, at their option, further distribute the Covered
Software under the terms of either this License or such Secondary
License(s).

3.4. Notices

You may not remove or alter the substance of any license notices
(including copyright notices, patent notices, disclaimers of warranty,
or limitations of liability) contained within the Source Code Form of
the Covered Software, except that You may alter any license notices to
the extent required to remedy known factual inaccuracies.

3.5. Application of Additional Terms

You may choose to offer, and to charge a fee for, warranty, support,
indemnity or liability obligations to one or more recipients of Covered
Software. However, You may do so only on Your own behalf, and not on
behalf of any Contributor. You must make it absolutely clear that any
such warranty, support, indemnity, or liability obligation is offered by
You alone, and You hereby agree to indemnify every Contributor for any
liability incurred by such Contributor as a result of warranty, support,
indemnity or liability terms You offer. You may include additional
disclaimers of warranty and limitations of liability specific to any
jurisdiction.

4. Inability to Comply Due to Statute or Regulation
---------------------------------------------------

If it is impossible for You to comply with any of the terms of this
License with respect to some or all of the Covered Software due to
statute, judicial order, or regulation then You must: (a) comply with
the terms of this License to the maximum extent possible; and (b)
describe the limitations and the code they affect. Such description must
be placed in a text file included with all distributions of the Covered
Software under this License. Except to the extent prohibited by statute
or regulation, such description must be sufficiently detailed for a
recipient of ordinary skill to be able to understand it.

5. Termination
--------------

5.1. The rights granted under this License will terminate automatically
if You fail to comply with any of its terms. However, if You become
compliant, then the rights granted under this License from a particular
Contributor are reinstated (a) provisionally, unless and until such
Contributor explicitly and finally terminates Your grants, and (b) on an
ongoing basis, if such Contributor fails to notify You of the
non-compliance by some reasonable means prior to 60 days after You have
come back into compliance. Moreover, Your grants from a particular
Contributor are reinstated on an ongoing basis if such Contributor
notifies You of the non-compliance by some reasonable means, this is the
first time You have received notice of non-compliance with this License
from such Contributor, and You become compliant prior to 30 days after
Your receipt of the notice.

5.2. If You initiate litigation against any entity by asserting a patent
infringement claim (excluding declaratory judgment actions,
counter-claims, and cross-claims) alleging that a Contributor Version
directly or indirectly infringes any patent, then the rights granted to
You by any and all Contributors for the Covered Software under Section
2.1 of this License shall terminate.

5.3. In the event of termination under Sections 5.1 or 5.2 above, all
end user license agreements (excluding distributors and resellers) which
have been validly granted by You or Your distributors under this License
prior to termination shall survive termination.

************************************************************************
*                                                                      *
*  6. Disclaimer of Warranty                                           *
*  -------------------------                                           *
*                                                                      *
*  Covered Software is provided under this License on an "as is"       *
*  basis, without warranty of any kind, either expressed, implied, or  *
*  statutory, including, without limitation, warranties that the       *
*  Covered Software is free of defects, merchantable, fit for a        *
*  particular purpose or non-infringing. The entire risk as to the     *
*  quality and performance of the Covered Software is with You.        *
*  Should any Covered Software prove defective in any respect, You     *
*  (not any Contributor) assume the cost of any necessary servicing,   *
*  repair, or correction. This disclaimer of warranty constitutes an   *
*  essential part of this License. No use of any Covered Software is   *
*  authorized under this License except under this disclaimer.         *
*                                                                      *
************************************************************************

************************************************************************
*                                                                      *
*  7. Limitation of Liability                                          *
*  --------------------------                                          *
*                                                                      *
*  Under no circumstances and under no legal theory, whether tort      *
*  (including negligence), contract, or otherwise, shall any           *
*  Contributor, or anyone who distributes Covered Software as          *
*  permitted above, be liable to You for any direct, indirect,         *
*  special, incidental, or consequential damages of any character      *
*  including, without limitation, damages for lost profits, loss of    *
*  goodwill, work stoppage, computer failure or malfunction, or any    *
*  and all other commercial damages or losses, even if such party      *
*  shall have been informed of the possibility of such damages. This   *
*  limitation of liability shall not apply to liability for death or   *
*  personal injury resulting from such party's negligence to the       *
*  extent applicable law prohibits such limitation. Some               *
*  jurisdictions do not allow the exclusion or limitation of           *
*  incidental or consequential damages, so this exclusion and          *
*  limitation may not apply to You.                                    *
*                                                                      *
************************************************************************

8. Litigation
-------------

Any litigation relating to this License may be brought only in the
courts of a jurisdiction where the defendant maintains its principal
place of business and such litigation shall be governed by laws of that
jurisdiction, without reference to its conflict-of-law provisions.
Nothing in this Section shall prevent a party's ability to bring
cross-claims or counter-claims.

9. Miscellaneous
----------------

This License represents the complete agreement concerning the subject
matter hereof. If any provision of this License is held to be
unenforceable, such provision shall be reformed only to the extent
necessary to make it enforceable. Any law or regulation which provides
that the language of a contract shall be construed against the drafter
shall not be used to construe this License against a Contributor.

10. Versions of the License
---------------------------

10.1. New Versions

Mozilla Foundation is the license steward. Except as provided in Section
10.3, no one other than the license steward has the right to modify or
publish new versions of this License. Each version will be given a
distinguishing version number.

10.2. Effect of New Versions

You may distribute the Covered Software under the terms of the version
of the License under which You originally received the Covered Software,
or under the terms of any subsequent version published by the license
steward.

10.3. Modified Versions

If you create software not governed by this License, and you want to
create a new license for such software, you may create and use a
modified version of this License if you rename the license and remove
any references to the name of the license steward (except to note that
such modified license differs from this License).

10.4. Distributing Source Code Form that is Incompatible With Secondary
Licenses

If You choose to distribute Source Code Form that is Incompatible With
Secondary Licenses under the terms of this version of the License, the
notice described in Exhibit B of this License must be attached.

Exhibit A - Source Code Form License Notice
-------------------------------------------

  This Source Code Form is subject to the terms of the Mozilla Public
  License, v. 2.0. If a copy of the MPL was not distributed with this
  file, You can obtain one at http://mozilla.org/MPL/2.0/.

If it is not possible or desirable to put the notice in a particular
file, then You may include the notice in a location (such as a LICENSE
file in a relevant directory) where a recipient would be likely to look
for such a notice.

You may add additional accurate notices of copyright ownership.

Exhibit B - "Incompatible With Secondary Licenses" Notice
---------------------------------------------------------

  This Source Code Form is "Incompatible With Secondary Licenses", as
  defined by the Mozilla Public License, v. 2.0.
``````

<a id="notice-bccaa8b6c09f"></a>

### notice-bccaa8b6c09f

来源：

- crate ctor@0.8.0: LICENSE-MIT
- crate ctor-proc-macro@0.0.7: LICENSE-MIT
- crate dtor@0.3.0: LICENSE-MIT
- crate dtor-proc-macro@0.0.6: LICENSE-MIT
- crate tinyvec@1.13.3: LICENSE-MIT.md

``````text
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-f3bd9e2e7745"></a>

### notice-f3bd9e2e7745

来源：

- crate ctr@0.9.2: LICENSE-MIT

``````text
Copyright (c) 2018-2022 RustCrypto Developers
Copyright (c) 2018 Artyom Pavlov

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-cc8f3c8ab396"></a>

### notice-cc8f3c8ab396

来源：

- crate darling@0.24.1: LICENSE
- crate darling_core@0.24.1: LICENSE
- crate darling_macro@0.24.1: LICENSE

``````text
MIT License

Copyright (c) 2017 Ted Driggs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-2710a622a896"></a>

### notice-2710a622a896

来源：

- crate defmt@1.2.0: LICENSE-MIT
- crate defmt-macros@1.2.0: LICENSE-MIT
- crate defmt-parser@1.1.0: LICENSE-MIT

``````text
Copyright (c) Ferrous Systems

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-b4839ecf405b"></a>

### notice-b4839ecf405b

来源：

- crate deranged@0.5.9: LICENSE-Apache

``````text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright 2024 Jacob Pratt et al.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
``````

<a id="notice-1b66e3be6894"></a>

### notice-1b66e3be6894

来源：

- crate deranged@0.5.9: LICENSE-MIT

``````text
Copyright (c) 2024 Jacob Pratt et al.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-4a4d43f3f90d"></a>

### notice-4a4d43f3f90d

来源：

- crate derive_more@2.1.1: LICENSE
- crate derive_more-impl@2.1.1: LICENSE

``````text
The MIT License (MIT)

Copyright (c) 2016 Jelte Fennema

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-9c5127ab88e8"></a>

### notice-9c5127ab88e8

来源：

- crate digest@0.10.7: LICENSE-MIT

``````text
Copyright (c) 2017 Artyom Pavlov

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-74f1c9127a52"></a>

### notice-74f1c9127a52

来源：

- crate dirs@6.0.0: LICENSE-APACHE
- crate dirs-sys@0.5.0: LICENSE-APACHE

``````text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.
``````

<a id="notice-f25a5b606859"></a>

### notice-f25a5b606859

来源：

- crate dirs@6.0.0: LICENSE-MIT
- crate dirs-sys@0.5.0: LICENSE-MIT

``````text
Copyright (c) 2018-2019 dirs-rs contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-8f8eade124ab"></a>

### notice-8f8eade124ab

来源：

- crate dom_query@0.27.0: LICENSE

``````text
MIT License

Copyright (c) 2023 Mykola Humanov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

This project contains portions of code and architectural concepts originally
derived from the "nipper" project (https://github.com/importcjj/nipper),
developed by Chen Jiaju, licensed under the MIT License and the Apache License 2.0 (dual licensed).
``````

<a id="notice-e07664cb9e31"></a>

### notice-e07664cb9e31

来源：

- crate dpi@0.1.2: LICENSE-LIBM-MIT

``````text
rust-lang/libm as a whole is available for use under the MIT license:

------------------------------------------------------------------------------
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
------------------------------------------------------------------------------

This Rust library contains the following copyrights:

    Copyright (c) 2018 Jorge Aparicio

Portions of this software are derived from third-party works licensed under
terms compatible with the above MIT license:

* musl libc https://www.musl-libc.org/. This library contains the following
  copyright:

      Copyright © 2005-2020 Rich Felker, et al.

* The CORE-MATH project https://core-math.gitlabpages.inria.fr/. CORE-MATH
  routines are available under the MIT license on a per-file basis.

The musl libc COPYRIGHT file also includes the following notice relevant to
math portions of the library:

------------------------------------------------------------------------------
Much of the math library code (src/math/* and src/complex/*) is
Copyright © 1993,2004 Sun Microsystems or
Copyright © 2003-2011 David Schultz or
Copyright © 2003-2009 Steven G. Kargl or
Copyright © 2003-2009 Bruce D. Evans or
Copyright © 2008 Stephen L. Moshier or
Copyright © 2017-2018 Arm Limited
and labelled as such in comments in the individual source files. All
have been licensed under extremely permissive terms.
------------------------------------------------------------------------------
``````

<a id="notice-6d489af62926"></a>

### notice-6d489af62926

来源：

- crate dunce@1.0.5: LICENSE

``````text
Creative Commons Legal Code

CC0 1.0 Universal

    CREATIVE COMMONS CORPORATION IS NOT A LAW FIRM AND DOES NOT PROVIDE
    LEGAL SERVICES. DISTRIBUTION OF THIS DOCUMENT DOES NOT CREATE AN
    ATTORNEY-CLIENT RELATIONSHIP. CREATIVE COMMONS PROVIDES THIS
    INFORMATION ON AN "AS-IS" BASIS. CREATIVE COMMONS MAKES NO WARRANTIES
    REGARDING THE USE OF THIS DOCUMENT OR THE INFORMATION OR WORKS
    PROVIDED HEREUNDER, AND DISCLAIMS LIABILITY FOR DAMAGES RESULTING FROM
    THE USE OF THIS DOCUMENT OR THE INFORMATION OR WORKS PROVIDED
    HEREUNDER.

Statement of Purpose

The laws of most jurisdictions throughout the world automatically confer
exclusive Copyright and Related Rights (defined below) upon the creator
and subsequent owner(s) (each and all, an "owner") of an original work of
authorship and/or a database (each, a "Work").

Certain owners wish to permanently relinquish those rights to a Work for
the purpose of contributing to a commons of creative, cultural and
scientific works ("Commons") that the public can reliably and without fear
of later claims of infringement build upon, modify, incorporate in other
works, reuse and redistribute as freely as possible in any form whatsoever
and for any purposes, including without limitation commercial purposes.
These owners may contribute to the Commons to promote the ideal of a free
culture and the further production of creative, cultural and scientific
works, or to gain reputation or greater distribution for their Work in
part through the use and efforts of others.

For these and/or other purposes and motivations, and without any
expectation of additional consideration or compensation, the person
associating CC0 with a Work (the "Affirmer"), to the extent that he or she
is an owner of Copyright and Related Rights in the Work, voluntarily
elects to apply CC0 to the Work and publicly distribute the Work under its
terms, with knowledge of his or her Copyright and Related Rights in the
Work and the meaning and intended legal effect of CC0 on those rights.

1. Copyright and Related Rights. A Work made available under CC0 may be
protected by copyright and related or neighboring rights ("Copyright and
Related Rights"). Copyright and Related Rights include, but are not
limited to, the following:

  i. the right to reproduce, adapt, distribute, perform, display,
     communicate, and translate a Work;
 ii. moral rights retained by the original author(s) and/or performer(s);
iii. publicity and privacy rights pertaining to a person's image or
     likeness depicted in a Work;
 iv. rights protecting against unfair competition in regards to a Work,
     subject to the limitations in paragraph 4(a), below;
  v. rights protecting the extraction, dissemination, use and reuse of data
     in a Work;
 vi. database rights (such as those arising under Directive 96/9/EC of the
     European Parliament and of the Council of 11 March 1996 on the legal
     protection of databases, and under any national implementation
     thereof, including any amended or successor version of such
     directive); and
vii. other similar, equivalent or corresponding rights throughout the
     world based on applicable law or treaty, and any national
     implementations thereof.

2. Waiver. To the greatest extent permitted by, but not in contravention
of, applicable law, Affirmer hereby overtly, fully, permanently,
irrevocably and unconditionally waives, abandons, and surrenders all of
Affirmer's Copyright and Related Rights and associated claims and causes
of action, whether now known or unknown (including existing as well as
future claims and causes of action), in the Work (i) in all territories
worldwide, (ii) for the maximum duration provided by applicable law or
treaty (including future time extensions), (iii) in any current or future
medium and for any number of copies, and (iv) for any purpose whatsoever,
including without limitation commercial, advertising or promotional
purposes (the "Waiver"). Affirmer makes the Waiver for the benefit of each
member of the public at large and to the detriment of Affirmer's heirs and
successors, fully intending that such Waiver shall not be subject to
revocation, rescission, cancellation, termination, or any other legal or
equitable action to disrupt the quiet enjoyment of the Work by the public
as contemplated by Affirmer's express Statement of Purpose.

3. Public License Fallback. Should any part of the Waiver for any reason
be judged legally invalid or ineffective under applicable law, then the
Waiver shall be preserved to the maximum extent permitted taking into
account Affirmer's express Statement of Purpose. In addition, to the
extent the Waiver is so judged Affirmer hereby grants to each affected
person a royalty-free, non transferable, non sublicensable, non exclusive,
irrevocable and unconditional license to exercise Affirmer's Copyright and
Related Rights in the Work (i) in all territories worldwide, (ii) for the
maximum duration provided by applicable law or treaty (including future
time extensions), (iii) in any current or future medium and for any number
of copies, and (iv) for any purpose whatsoever, including without
limitation commercial, advertising or promotional purposes (the
"License"). The License shall be deemed effective as of the date CC0 was
applied by Affirmer to the Work. Should any part of the License for any
reason be judged legally invalid or ineffective under applicable law, such
partial invalidity or ineffectiveness shall not invalidate the remainder
of the License, and in such case Affirmer hereby affirms that he or she
will not (i) exercise any of his or her remaining Copyright and Related
Rights in the Work or (ii) assert any associated claims and causes of
action with respect to the Work, in either case contrary to Affirmer's
express Statement of Purpose.

4. Limitations and Disclaimers.

 a. No trademark or patent rights held by Affirmer are waived, abandoned,
    surrendered, licensed or otherwise affected by this document.
 b. Affirmer offers the Work as-is and makes no representations or
    warranties of any kind concerning the Work, express, implied,
    statutory or otherwise, including without limitation warranties of
    title, merchantability, fitness for a particular purpose, non
    infringement, or the absence of latent or other defects, accuracy, or
    the present or absence of errors, whether or not discoverable, all to
    the greatest extent permissible under applicable law.
 c. Affirmer disclaims responsibility for clearing rights of other persons
    that may apply to the Work or any use thereof, including without
    limitation any person's Copyright and Related Rights in the Work.
    Further, Affirmer disclaims responsibility for obtaining any necessary
    consents, permissions or other rights required for any use of the
    Work.
 d. Affirmer understands and acknowledges that Creative Commons is not a
    party to this document and has no duty or obligation with respect to
    this CC0 or use of the Work.
``````

<a id="notice-f95a80c3167d"></a>

### notice-f95a80c3167d

来源：

- crate ego-tree@0.10.0: LICENSE

``````text
Copyright © 2016, June McEnroe <june@causal.agency>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
``````

<a id="notice-283ea6cc2997"></a>

### notice-283ea6cc2997

来源：

- crate embed_plist@1.2.2: LICENSE-APACHE
- crate encoding_rs@0.8.42: LICENSE-APACHE
- crate lru-slab@0.1.3: LICENSE-APACHE
- crate multiversion_no_op@1.0.0: LICENSE-APACHE
- crate quinn@0.11.12: LICENSE-APACHE
- crate quinn-proto@0.11.19: LICENSE-APACHE
- crate quinn-udp@0.5.16: LICENSE-APACHE
- crate serialize-to-javascript@0.1.2: LICENSE-APACHE
- crate serialize-to-javascript-impl@0.1.2: LICENSE-APACHE
- crate siphasher@1.0.4: LICENSE-APACHE
- crate sse-stream@0.2.6: LICENSE-APACHE
- crate tinyvec@1.13.3: LICENSE-APACHE.md
- crate utf8_iter@1.0.4: LICENSE-APACHE
- crate zeroize@1.9.1: LICENSE-APACHE

``````text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
``````

<a id="notice-a29c4d8a8e7c"></a>

### notice-a29c4d8a8e7c

来源：

- crate embed_plist@1.2.2: LICENSE-MIT

``````text
MIT License

Copyright (c) 2020 Nikolai Vazquez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-c4be15bd543a"></a>

### notice-c4be15bd543a

来源：

- crate embed-resource@3.0.12: LICENSE

``````text
The MIT License (MIT)

Copyright (c) 2017 nabijaczleweli

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-1961703c2782"></a>

### notice-1961703c2782

来源：

- crate encoding_rs@0.8.42: COPYRIGHT

``````text
encoding_rs is copyright Mozilla Foundation.

Licensed under the Apache License, Version 2.0
<LICENSE-APACHE or
https://www.apache.org/licenses/LICENSE-2.0> or the MIT
license <LICENSE-MIT or https://opensource.org/licenses/MIT>,
at your option. All files in the project carrying such
notice may not be copied, modified, or distributed except
according to those terms.

This crate includes data derived from the data files supplied
with the WHATWG Encoding Standard, which, when incorporated into
source code, are licensed under the BSD 3-Clause License
<LICENSE-WHATWG>.

Test code within encoding_rs is dedicated to the Public Domain when so
designated (see the individual files for PD/CC0-dedicated sections).
``````

<a id="notice-7dc2f6402447"></a>

### notice-7dc2f6402447

来源：

- crate encoding_rs@0.8.42: LICENSE-MIT
- crate multiversion_no_op@1.0.0: LICENSE-MIT
- crate utf8_iter@1.0.4: LICENSE-MIT

``````text
Copyright Mozilla Foundation

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-b1d6d97b0476"></a>

### notice-b1d6d97b0476

来源：

- crate encoding_rs@0.8.42: LICENSE-WHATWG

``````text
Copyright © WHATWG (Apple, Google, Mozilla, Microsoft).

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
``````

<a id="notice-4428cd87371a"></a>

### notice-4428cd87371a

来源：

- crate equivalent@1.0.3: LICENSE-MIT

``````text
Copyright (c) 2016--2023

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-7f91c2a4eddb"></a>

### notice-7f91c2a4eddb

来源：

- crate errno@0.3.14: LICENSE-MIT

``````text
Copyright (c) 2014 Chris Wong

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-2ff0b8901359"></a>

### notice-2ff0b8901359

来源：

- crate fallible-iterator@0.3.0: LICENSE-MIT

``````text
Copyright (c) 2015 The rust-openssl-verify Developers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-dfc632cd74cc"></a>

### notice-dfc632cd74cc

来源：

- crate fallible-streaming-iterator@0.1.9: LICENSE-MIT

``````text
Copyright (c) 2016 The fallible-streaming-iterator Developers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-77949ead506e"></a>

### notice-77949ead506e

来源：

- crate fdeflate@0.3.7: LICENSE-MIT

``````text
MIT License

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-1b7402ea003f"></a>

### notice-1b7402ea003f

来源：

- crate flate2@1.1.10: LICENSE-MIT

``````text
Copyright (c) 2014-2026 Alex Crichton

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-c48b7333c00b"></a>

### notice-c48b7333c00b

来源：

- crate fnv@1.0.7: LICENSE-MIT

``````text
Copyright (c) 2017 Contributors

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-b1181a40b2a7"></a>

### notice-b1181a40b2a7

来源：

- crate foldhash@0.1.5: LICENSE
- crate foldhash@0.2.0: LICENSE

``````text
Copyright (c) 2024 Orson Peters

This software is provided 'as-is', without any express or implied warranty. In
no event will the authors be held liable for any damages arising from the use of
this software.

Permission is granted to anyone to use this software for any purpose, including
commercial applications, and to alter it and redistribute it freely, subject to
the following restrictions:

1. The origin of this software must not be misrepresented; you must not claim
    that you wrote the original software. If you use this software in a product,
    an acknowledgment in the product documentation would be appreciated but is
    not required.

2. Altered source versions must be plainly marked as such, and must not be
    misrepresented as being the original software.

3. This notice may not be removed or altered from any source distribution.
``````

<a id="notice-c9067b1cc20b"></a>

### notice-c9067b1cc20b

来源：

- crate foreign-types@0.5.0: LICENSE-MIT
- crate foreign-types-macros@0.2.4: LICENSE-MIT
- crate foreign-types-shared@0.3.1: LICENSE-MIT

``````text
Copyright (c) 2017 The foreign-types Developers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-33ed9a8ecf55"></a>

### notice-33ed9a8ecf55

来源：

- crate form_urlencoded@1.2.2: LICENSE-MIT

``````text
Copyright (c) 2013-2016 The rust-url developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-dfa7fbad0178"></a>

### notice-dfa7fbad0178

来源：

- crate futf@0.1.5: LICENSE-MIT
- crate tendril@0.4.3: LICENSE-MIT
- crate tendril@0.5.1: LICENSE-MIT

``````text
Copyright (c) 2015 Keegan McAllister

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-27480f391bd9"></a>

### notice-27480f391bd9

来源：

- crate futures@0.3.34: LICENSE-APACHE
- crate futures-channel@0.3.34: LICENSE-APACHE
- crate futures-core@0.3.34: LICENSE-APACHE
- crate futures-executor@0.3.34: LICENSE-APACHE
- crate futures-io@0.3.34: LICENSE-APACHE
- crate futures-macro@0.3.34: LICENSE-APACHE
- crate futures-sink@0.3.34: LICENSE-APACHE
- crate futures-task@0.3.34: LICENSE-APACHE
- crate futures-util@0.3.34: LICENSE-APACHE

``````text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright (c) 2016 Alex Crichton
Copyright (c) 2017 The Tokio Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
``````

<a id="notice-b420d8add23b"></a>

### notice-b420d8add23b

来源：

- crate futures@0.3.34: LICENSE-MIT
- crate futures-channel@0.3.34: LICENSE-MIT
- crate futures-core@0.3.34: LICENSE-MIT
- crate futures-executor@0.3.34: LICENSE-MIT
- crate futures-io@0.3.34: LICENSE-MIT
- crate futures-macro@0.3.34: LICENSE-MIT
- crate futures-sink@0.3.34: LICENSE-MIT
- crate futures-task@0.3.34: LICENSE-MIT
- crate futures-util@0.3.34: LICENSE-MIT

``````text
Copyright (c) 2016 Alex Crichton
Copyright (c) 2017 The Tokio Authors

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-4fa4efc31359"></a>

### notice-4fa4efc31359

来源：

- crate fxhash@0.2.1: lib.rs original copyright/license header

``````text
// Copyright 2015 The Rust Project Developers. See the COPYRIGHT
// file at the top-level directory of this distribution and at
// http://rust-lang.org/COPYRIGHT.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.
``````

<a id="notice-ad4fcfaf8d5b"></a>

### notice-ad4fcfaf8d5b

来源：

- crate generic-array@0.14.7: LICENSE

``````text
The MIT License (MIT)

Copyright (c) 2015 Bartłomiej Kamiński

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-e7330bf53074"></a>

### notice-e7330bf53074

来源：

- crate getrandom@0.2.17: LICENSE-APACHE
- crate getrandom@0.3.4: LICENSE-APACHE
- crate getrandom@0.4.3: LICENSE-APACHE

``````text
Apache License
                        Version 2.0, January 2004
                     https://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
``````

<a id="notice-478d530cbce7"></a>

### notice-478d530cbce7

来源：

- crate getrandom@0.2.17: LICENSE-MIT

``````text
Copyright (c) 2018-2024 The rust-random Project Developers
Copyright (c) 2014 The Rust Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-73af2019a565"></a>

### notice-73af2019a565

来源：

- crate getrandom@0.3.4: LICENSE-MIT

``````text
Copyright (c) 2018-2025 The rust-random Project Developers
Copyright (c) 2014 The Rust Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-94b1870d380c"></a>

### notice-94b1870d380c

来源：

- crate getrandom@0.4.3: LICENSE-MIT

``````text
Copyright (c) 2018-2026 The rust-random Project Developers
Copyright (c) 2014 The Rust Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-fc15b628f1c4"></a>

### notice-fc15b628f1c4

来源：

- crate ghash@0.5.1: LICENSE-MIT

``````text
Copyright (c) 2019 RustCrypto Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-ae9791f02f2b"></a>

### notice-ae9791f02f2b

来源：

- crate hashbrown@0.12.3: LICENSE-MIT
- crate hashbrown@0.15.5: LICENSE-MIT
- crate hashbrown@0.17.1: LICENSE-MIT

``````text
Copyright (c) 2016 Amanieu d'Antras

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-e915669a595b"></a>

### notice-e915669a595b

来源：

- crate hashlink@0.10.0: LICENSE-MIT

``````text
This work is derived in part from the `linked-hash-map` crate, Copyright (c)
2015 The Rust Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-033a9383ff21"></a>

### notice-033a9383ff21

来源：

- crate heck@0.5.0: LICENSE-MIT
- crate unicode-segmentation@1.13.3: LICENSE-MIT

``````text
Copyright (c) 2015 The Rust Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-9dde4a6ad496"></a>

### notice-9dde4a6ad496

来源：

- crate hex@0.4.3: LICENSE-MIT

``````text
Copyright (c) 2013-2014 The Rust Project Developers.
Copyright (c) 2015-2020 The rust-hex Developers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-35af0fd88338"></a>

### notice-35af0fd88338

来源：

- crate html5ever@0.35.0: LICENSE-MIT
- crate html5ever@0.38.0: LICENSE-MIT
- crate markup5ever@0.35.0: LICENSE-MIT
- crate markup5ever@0.38.0: LICENSE-MIT
- https://raw.githubusercontent.com/servo/html5ever/6db7bbf1c4dfaecd28731950d427e40c8b911bef/LICENSE-MIT
- crate web_atoms@0.1.3: LICENSE-MIT
- crate web_atoms@0.2.6: LICENSE-MIT

``````text
Copyright (c) 2014 The html5ever Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-881c9fe2d29b"></a>

### notice-881c9fe2d29b

来源：

- crate http@1.5.0: LICENSE-APACHE

``````text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright 2017 http-rs authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
``````

<a id="notice-f47894ff9c86"></a>

### notice-f47894ff9c86

来源：

- crate http@1.5.0: LICENSE-MIT

``````text
Copyright (c) 2017 http-rs authors

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-57f841bc9767"></a>

### notice-57f841bc9767

来源：

- crate http-body@1.1.0: LICENSE
- crate http-body-util@0.1.5: LICENSE

``````text
Copyright (c) 2019-2026 Sean McArthur & Hyper Contributors

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-8502803cebb3"></a>

### notice-8502803cebb3

来源：

- crate httparse@1.10.1: LICENSE-MIT

``````text
Copyright (c) 2015-2025 Sean McArthur

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-05f344491a7d"></a>

### notice-05f344491a7d

来源：

- crate hyper@1.12.0: LICENSE

``````text
Copyright (c) 2014-2026 Sean McArthur

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-af6da3f3f6b4"></a>

### notice-af6da3f3f6b4

来源：

- crate hyper-rustls@0.27.10: LICENSE-ISC
- crate rustls@0.23.46: LICENSE-ISC

``````text
ISC License (ISC)
Copyright (c) 2016, Joseph Birr-Pixton <jpixton@gmail.com>

Permission to use, copy, modify, and/or distribute this software for
any purpose with or without fee is hereby granted, provided that the
above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL
WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL
DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR
PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS
ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
``````

<a id="notice-a3320aa8d192"></a>

### notice-a3320aa8d192

来源：

- crate hyper-rustls@0.27.10: LICENSE-MIT
- crate rustls@0.23.46: LICENSE-MIT

``````text
Copyright (c) 2016 Joseph Birr-Pixton <jpixton@gmail.com>

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-ef31af832fed"></a>

### notice-ef31af832fed

来源：

- crate hyper-tls@0.6.0: LICENSE-MIT

``````text
Copyright (c) 2017 Sean McArthur

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-e7d622e4783e"></a>

### notice-e7d622e4783e

来源：

- crate hyper-util@0.1.21: LICENSE

``````text
Copyright (c) 2023-2025 Sean McArthur

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-793420c92f3c"></a>

### notice-793420c92f3c

来源：

- crate iana-time-zone@0.1.65: LICENSE-APACHE

``````text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright 2020 Andrew Straw

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
``````

<a id="notice-3444712f3370"></a>

### notice-3444712f3370

来源：

- crate iana-time-zone@0.1.65: LICENSE-MIT

``````text
Copyright (c) 2020 Andrew D. Straw

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-95573f040b56"></a>

### notice-95573f040b56

来源：

- crate ico@0.5.0: LICENSE

``````text
MIT License

Copyright (c) 2018 Matthew D. Steele

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-cde87abe221f"></a>

### notice-cde87abe221f

来源：

- crate icu_collections@2.3.0: LICENSE
- crate icu_locale_core@2.3.0: LICENSE
- crate icu_normalizer@2.3.0: LICENSE
- crate icu_normalizer_data@2.3.0: LICENSE
- crate icu_properties@2.3.0: LICENSE
- crate icu_properties_data@2.3.0: LICENSE
- crate icu_provider@2.3.1: LICENSE
- crate litemap@0.8.3: LICENSE
- crate potential_utf@0.1.6: LICENSE
- crate tinystr@0.8.4: LICENSE
- crate writeable@0.6.4: LICENSE
- crate yoke@0.8.3: LICENSE
- crate yoke-derive@0.8.4: LICENSE
- crate zerofrom@0.1.8: LICENSE
- crate zerofrom-derive@0.1.8: LICENSE
- crate zerotrie@0.2.5: LICENSE
- crate zerovec@0.11.8: LICENSE
- crate zerovec-derive@0.11.6: LICENSE

``````text
UNICODE LICENSE V3

COPYRIGHT AND PERMISSION NOTICE

Copyright © 2020-2024 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY
DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.

SPDX-License-Identifier: Unicode-3.0

—

Portions of ICU4X may have been adapted from ICU4C and/or ICU4J.
ICU 1.8.1 to ICU 57.1 © 1995-2016 International Business Machines Corporation and others.
``````

<a id="notice-1847e0e06981"></a>

### notice-1847e0e06981

来源：

- crate ident_case@1.0.1: LICENSE
- crate simdutf8@0.1.5: LICENSE-MIT

``````text
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-7a8093fb4a93"></a>

### notice-7a8093fb4a93

来源：

- crate idna@1.1.0: LICENSE-MIT
- crate percent-encoding@2.3.2: LICENSE-MIT
- crate url@2.5.8: LICENSE-MIT

``````text
Copyright (c) 2013-2025 The rust-url developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-0d8a0aecbcba"></a>

### notice-0d8a0aecbcba

来源：

- crate idna_adapter@1.2.2: LICENSE-MIT

``````text
Copyright (c) The rust-url developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-4f2ac128e429"></a>

### notice-4f2ac128e429

来源：

- crate indexmap@1.9.3: LICENSE-MIT
- crate indexmap@2.14.2: LICENSE-MIT

``````text
Copyright (c) 2016--2017

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-7804ded9273b"></a>

### notice-7804ded9273b

来源：

- crate infer@0.19.0: LICENSE

``````text
MIT License

Copyright (c) 2019 Bojan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-71366a4092ad"></a>

### notice-71366a4092ad

来源：

- crate inout@0.1.4: LICENSE-MIT

``````text
Copyright (c) 2022 The RustCrypto Project Developers
Copyright (c) 2022 Artyom Pavlov

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-9d8e882729a5"></a>

### notice-9d8e882729a5

来源：

- crate ipnet@2.12.2: LICENSE-APACHE

``````text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "{}"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright 2017 Juniper Networks, Inc.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
``````

<a id="notice-c935506fff2e"></a>

### notice-c935506fff2e

来源：

- crate ipnet@2.12.2: LICENSE-MIT

``````text
Copyright 2017 Juniper Networks, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-19328c46c44f"></a>

### notice-19328c46c44f

来源：

- crate json-patch@3.0.1: LICENSE-MIT

``````text
MIT License

Copyright (c) 2017 Ivan Dubrov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-5f89ce4ac63b"></a>

### notice-5f89ce4ac63b

来源：

- crate jsonptr@0.6.3: LICENSE-APACHE

``````text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

    "License" shall mean the terms and conditions for use, reproduction,
    and distribution as defined by Sections 1 through 9 of this document.

    "Licensor" shall mean the copyright owner or entity authorized by
    the copyright owner that is granting the License.

    "Legal Entity" shall mean the union of the acting entity and all
    other entities that control, are controlled by, or are under common
    control with that entity. For the purposes of this definition,
    "control" means (i) the power, direct or indirect, to cause the
    direction or management of such entity, whether by contract or
    otherwise, or (ii) ownership of fifty percent (50%) or more of the
    outstanding shares, or (iii) beneficial ownership of such entity.

    "You" (or "Your") shall mean an individual or Legal Entity
    exercising permissions granted by this License.

    "Source" form shall mean the preferred form for making modifications,
    including but not limited to software source code, documentation
    source, and configuration files.

    "Object" form shall mean any form resulting from mechanical
    transformation or translation of a Source form, including but
    not limited to compiled object code, generated documentation,
    and conversions to other media types.

    "Work" shall mean the work of authorship, whether in Source or
    Object form, made available under the License, as indicated by a
    copyright notice that is included in or attached to the work
    (an example is provided in the Appendix below).

    "Derivative Works" shall mean any work, whether in Source or Object
    form, that is based on (or derived from) the Work and for which the
    editorial revisions, annotations, elaborations, or other modifications
    represent, as a whole, an original work of authorship. For the purposes
    of this License, Derivative Works shall not include works that remain
    separable from, or merely link (or bind by name) to the interfaces of,
    the Work and Derivative Works thereof.

    "Contribution" shall mean any work of authorship, including
    the original version of the Work and any modifications or additions
    to that Work or Derivative Works thereof, that is intentionally
    submitted to Licensor for inclusion in the Work by the copyright owner
    or by an individual or Legal Entity authorized to submit on behalf of
    the copyright owner. For the purposes of this definition, "submitted"
    means any form of electronic, verbal, or written communication sent
    to the Licensor or its representatives, including but not limited to
    communication on electronic mailing lists, source code control systems,
    and issue tracking systems that are managed by, or on behalf of, the
    Licensor for the purpose of discussing and improving the Work, but
    excluding communication that is conspicuously marked or otherwise
    designated in writing by the copyright owner as "Not a Contribution."

    "Contributor" shall mean Licensor and any individual or Legal Entity
    on behalf of whom a Contribution has been received by Licensor and
    subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

    (a) You must give any other recipients of the Work or
    Derivative Works a copy of this License; and

    (b) You must cause any modified files to carry prominent notices
    stating that You changed the files; and

    (c) You must retain, in the Source form of any Derivative Works
    that You distribute, all copyright, patent, trademark, and
    attribution notices from the Source form of the Work,
    excluding those notices that do not pertain to any part of
    the Derivative Works; and

    (d) If the Work includes a "NOTICE" text file as part of its
    distribution, then any Derivative Works that You distribute must
    include a readable copy of the attribution notices contained
    within such NOTICE file, excluding those notices that do not
    pertain to any part of the Derivative Works, in at least one
    of the following places: within a NOTICE text file distributed
    as part of the Derivative Works; within the Source form or
    documentation, if provided along with the Derivative Works; or,
    within a display generated by the Derivative Works, if and
    wherever such third-party notices normally appear. The contents
    of the NOTICE file are for informational purposes only and
    do not modify the License. You may add Your own attribution
    notices within Derivative Works that You distribute, alongside
    or as an addendum to the NOTICE text from the Work, provided
    that such additional attribution notices cannot be construed
    as modifying the License.

    You may add Your own copyright statement to Your modifications and
    may provide additional or different license terms and conditions
    for use, reproduction, or distribution of Your modifications, or
    for any such Derivative Works as a whole, provided Your use,
    reproduction, and distribution of the Work otherwise complies with
    the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

Copyright 2024 Chance Dinkins

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
``````

<a id="notice-055a17110636"></a>

### notice-055a17110636

来源：

- crate jsonptr@0.6.3: LICENSE-MIT

``````text
MIT License

Copyright (c) 2022 Chance Dinkins

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-31dbbab009f1"></a>

### notice-31dbbab009f1

来源：

- crate keyboard-types@0.7.0: LICENSE-MIT

``````text
Copyright (c) 2017 Pyfisch

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-c96302294382"></a>

### notice-c96302294382

来源：

- crate libc@0.2.191: LICENSE-MIT

``````text
Copyright (c) The Rust Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-6061b8ea5b16"></a>

### notice-6061b8ea5b16

来源：

- crate libsqlite3-sys@0.35.0: LICENSE
- crate rusqlite@0.37.0: LICENSE

``````text
Copyright (c) 2014 The rusqlite developers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-40fa3316ba32"></a>

### notice-40fa3316ba32

来源：

- crate libsqlite3-sys@0.35.0: sqlcipher/LICENSE

``````text
Copyright (c) 2008-2020 Zetetic LLC
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
    * Neither the name of the ZETETIC LLC nor the
      names of its contributors may be used to endorse or promote products
      derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY ZETETIC LLC ''AS IS'' AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL ZETETIC LLC BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
``````

<a id="notice-93c0285e8414"></a>

### notice-93c0285e8414

来源：

- Bundled SQLite: sqlite3/sqlite3.h public-domain dedication and blessing

``````text
/*
** 2001-09-15
**
** The author disclaims copyright to this source code.  In place of
** a legal notice, here is a blessing:
**
**    May you do good and not evil.
**    May you find forgiveness for yourself and forgive others.
**    May you share freely, never taking more than you give.
**
*************************************************************************
** This header file defines the interface that the SQLite library
** presents to client programs.  If a C-function, structure, datatype,
** or constant definition does not appear in this file, then it is
** not a published API of SQLite, is subject to change without
** notice, and should not be referenced by programs that use SQLite.
**
** Some of the definitions that are in this file are marked as
** "experimental".  Experimental interfaces are normally new
** features recently added to SQLite.  We do not anticipate changes
``````

<a id="notice-8d1f81ea4e87"></a>

### notice-8d1f81ea4e87

来源：

- crate lock_api@0.4.14: LICENSE-MIT
- crate parking_lot@0.12.5: LICENSE-MIT
- crate parking_lot_core@0.9.12: LICENSE-MIT
- crate rustc_version@0.4.1: LICENSE-MIT

``````text
Copyright (c) 2016 The Rust Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-c9cf4d18fd9d"></a>

### notice-c9cf4d18fd9d

来源：

- crate lru-slab@0.1.3: LICENSE-MIT

``````text
Copyright (c) 2024 The lru-slab Developers

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-cebce11166dc"></a>

### notice-cebce11166dc

来源：

- crate lru-slab@0.1.3: LICENSE-ZLIB

``````text
Copyright (c) 2024 The lru-slab Developers

This software is provided 'as-is', without any express or implied warranty. In
no event will the authors be held liable for any damages arising from the use of
this software.

Permission is granted to anyone to use this software for any purpose, including
commercial applications, and to alter it and redistribute it freely, subject to
the following restrictions:

1. The origin of this software must not be misrepresented; you must not claim
   that you wrote the original software. If you use this software in a product, an
   acknowledgment in the product documentation would be appreciated but is not
   required.

2. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.

3. This notice may not be removed or altered from any source distribution.
``````

<a id="notice-7e8d5ce7222b"></a>

### notice-7e8d5ce7222b

来源：

- crate macro_rules_attribute@0.2.3: LICENSE-APACHE
- crate macro_rules_attribute-proc_macro@0.2.3: LICENSE-APACHE

``````text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright 2019 Daniel Henry-Mantilla <daniel.henry.mantilla@gmail.com>

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
``````

<a id="notice-87bdea8dbd05"></a>

### notice-87bdea8dbd05

来源：

- crate macro_rules_attribute@0.2.3: LICENSE-MIT
- crate macro_rules_attribute-proc_macro@0.2.3: LICENSE-MIT

``````text
MIT License

Copyright (c) 2019 Daniel Henry-Mantilla <daniel.henry.mantilla@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-5ebb9a84cad5"></a>

### notice-5ebb9a84cad5

来源：

- crate macro_rules_attribute@0.2.3: LICENSE-ZLIB
- crate macro_rules_attribute-proc_macro@0.2.3: LICENSE-ZLIB

``````text
zlib License

(C) 2019 Daniel Henry-Mantilla <daniel.henry.mantilla@gmail.com>

This software is provided 'as-is', without any express or implied
warranty.  In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not
   claim that you wrote the original software. If you use this software
   in a product, an acknowledgment in the product documentation would be
   appreciated but is not required.
2. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.
3. This notice may not be removed or altered from any source distribution.
``````

<a id="notice-a302dc760d97"></a>

### notice-a302dc760d97

来源：

- crate mime@0.3.17: LICENSE-MIT

``````text
Copyright (c) 2014 Sean McArthur

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-58f66933c7bb"></a>

### notice-58f66933c7bb

来源：

- crate minisign-verify@0.2.5: LICENSE

``````text
Copyright (c) 2019-2025 Frank Denis

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.

--

Code in the src/crypto folder is derived from the rust-crypto project:
https://github.com/DaGenix/rust-crypto

Original ISC license follows:

Copyright (c) 2006-2009 Graydon Hoare
Copyright (c) 2009-2013 Mozilla Foundation

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-7427abc63036"></a>

### notice-7427abc63036

来源：

- crate miniz_oxide@0.8.9: LICENSE
- crate miniz_oxide@0.9.1: LICENSE

``````text
MIT License

Copyright 2013-2014 RAD Game Tools and Valve Software
Copyright 2010-2014 Rich Geldreich and Tenacious Software LLC
Copyright (c) 2017 Frommi
Copyright (c) 2017-2024 oyvindln


Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-ac9859ce4e9a"></a>

### notice-ac9859ce4e9a

来源：

- crate miniz_oxide@0.8.9: LICENSE-MIT.md
- crate miniz_oxide@0.9.1: LICENSE-MIT.md

``````text
MIT License

Copyright 2013-2014 RAD Game Tools and Valve Software
Copyright 2010-2014 Rich Geldreich and Tenacious Software LLC
Copyright (c) 2017 Frommi
Copyright (c) 2017-2024 oyvindln

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-eac3911cc3d4"></a>

### notice-eac3911cc3d4

来源：

- crate miniz_oxide@0.8.9: LICENSE-ZLIB.md
- crate miniz_oxide@0.9.1: LICENSE-ZLIB.md

``````text
Copyright 2013-2014 RAD Game Tools and Valve Software
Copyright 2010-2014 Rich Geldreich and Tenacious Software LLC
Copyright (c) 2020 Frommi
Copyright (c) 2017-2024 oyvindln

This software is provided 'as-is', without any express or implied warranty. In no event will the authors be held liable for any damages arising from the use of this software.

Permission is granted to anyone to use this software for any purpose, including commercial applications, and to alter it and redistribute it freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not claim that you wrote the original software. If you use this software in a product, an acknowledgment in the product documentation would be appreciated but is not required.

2. Altered source versions must be plainly marked as such, and must not be misrepresented as being the original software.

3. This notice may not be removed or altered from any source distribution.
``````

<a id="notice-c804065b0956"></a>

### notice-c804065b0956

来源：

- crate mio@1.2.4: LICENSE

``````text
Copyright (c) 2014 Carl Lerche and other MIO contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-859a90323b68"></a>

### notice-859a90323b68

来源：

- crate muda@0.19.3: LICENSE-MIT
- crate tray-icon@0.24.2: LICENSE-MIT

``````text
MIT License

Copyright (c) 2022-2022 Tauri Programme within The Commons Conservancy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-b99f9d43803f"></a>

### notice-b99f9d43803f

来源：

- crate muda@0.19.3: LICENSE.spdx

``````text
SPDXVersion: SPDX-2.1
DataLicense: CC0-1.0
PackageName: muda
DataFormat: SPDXRef-1
PackageSupplier: Organization: The Tauri Programme in the Commons Conservancy
PackageHomePage: https://tauri.app
PackageLicenseDeclared: Apache-2.0
PackageLicenseDeclared: MIT
PackageCopyrightText: 2020-2022, The Tauri Programme in the Commons Conservancy
PackageSummary: <text>Menu Utilities for Desktop Applications.
                </text>
PackageComment: <text>The package includes the following libraries; see
Relationship information.
                </text>
Created: 2022-12-05T09:00:00Z
PackageDownloadLocation: git://github.com/tauri-apps/muda
PackageDownloadLocation: git+https://github.com/tauri-apps/muda.git
PackageDownloadLocation: git+ssh://github.com/tauri-apps/muda.git
Creator: Person: Daniel Thompson-Yvetot
``````

<a id="notice-e08d6d9195b9"></a>

### notice-e08d6d9195b9

来源：

- crate multiversion_no_op@1.0.0: COPYRIGHT

``````text
Copyright Mozilla Foundation

Licensed under the Apache License (Version 2.0), or the MIT license,
(the "Licenses") at your option. You may not use this file except in
compliance with one of the Licenses. You may obtain copies of the
Licenses at:

   https://www.apache.org/licenses/LICENSE-2.0
   https://opensource.org/licenses/MIT

Unless required by applicable law or agreed to in writing, software
distributed under the Licenses is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the Licenses for the specific language governing permissions and
limitations under the Licenses.
``````

<a id="notice-d826e1bb47ee"></a>

### notice-d826e1bb47ee

来源：

- crate native-tls@0.2.18: LICENSE-MIT

``````text
Copyright (c) 2016 The rust-native-tls Developers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-42d8a095dbff"></a>

### notice-42d8a095dbff

来源：

- crate new_debug_unreachable@1.0.6: LICENSE-MIT

``````text
Copyright (c) 2015 Jonathan Reem

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-4d83b119f786"></a>

### notice-4d83b119f786

来源：

- crate num-conv@0.2.2: LICENSE-MIT

``````text
Copyright (c) Jacob Pratt

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-7873dbb4b866"></a>

### notice-7873dbb4b866

来源：

- crate opaque-debug@0.3.1: LICENSE-MIT

``````text
Copyright (c) 2018-2024 The RustCrypto Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-c3ca23514163"></a>

### notice-c3ca23514163

来源：

- crate open@5.4.4: LICENSE.md

``````text
The MIT License (MIT)
=====================

Copyright © `2015` `Sebastian Thiel`

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the “Software”), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-6ca34f7d0a42"></a>

### notice-6ca34f7d0a42

来源：

- crate osakit@0.3.1: LICENSE-MIT

``````text
Copyright (c) 2024 Marat Dulin

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-ec5d7c323662"></a>

### notice-ec5d7c323662

来源：

- crate phf@0.11.3: LICENSE
- crate phf@0.13.1: LICENSE
- crate phf_codegen@0.11.3: LICENSE
- crate phf_codegen@0.13.1: LICENSE
- crate phf_generator@0.11.3: LICENSE
- crate phf_generator@0.13.1: LICENSE
- crate phf_macros@0.11.3: LICENSE
- crate phf_macros@0.13.1: LICENSE
- crate phf_shared@0.11.3: LICENSE
- crate phf_shared@0.13.1: LICENSE

``````text
The MIT License (MIT)

Copyright (c) 2014-2022 Steven Fackler, Yuki Okushi

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-5b0ae40d1a35"></a>

### notice-5b0ae40d1a35

来源：

- crate plist@1.10.1: LICENCE

``````text
Copyright (c) 2015 Edward Barnard

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-80cdd90699e4"></a>

### notice-80cdd90699e4

来源：

- crate png@0.17.16: LICENSE-MIT
- crate png@0.18.1: LICENSE-MIT

``````text
Copyright (c) 2015 nwin

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-3dad7b797447"></a>

### notice-3dad7b797447

来源：

- crate polyval@0.6.2: LICENSE-MIT

``````text
Copyright (c) 2019-2023 RustCrypto Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-4b05c4b43039"></a>

### notice-4b05c4b43039

来源：

- crate powerfmt@0.2.1: LICENSE-Apache

``````text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright 2023 Jacob Pratt et al.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
``````

<a id="notice-6e972f314e81"></a>

### notice-6e972f314e81

来源：

- crate powerfmt@0.2.1: LICENSE-MIT

``````text
Copyright (c) 2023 Jacob Pratt et al.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-695de7436b47"></a>

### notice-695de7436b47

来源：

- crate precomputed-hash@0.1.1: LICENSE

``````text
MIT License

Copyright (c) 2017 Emilio Cobos Álvarez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-12bfa73c9eac"></a>

### notice-12bfa73c9eac

来源：

- crate quick-xml@0.42.0: LICENSE-MIT.md

``````text
The MIT License (MIT)

Copyright (c) 2016 Johann Tuffe

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:


The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.


THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-05fa1ba3228a"></a>

### notice-05fa1ba3228a

来源：

- crate quinn@0.11.12: LICENSE-MIT
- crate quinn-proto@0.11.19: LICENSE-MIT
- crate quinn-udp@0.5.16: LICENSE-MIT

``````text
Copyright (c) 2018 The quinn Developers

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-2411d70acb18"></a>

### notice-2411d70acb18

来源：

- crate rand@0.10.3: COPYRIGHT
- crate rand@0.8.8: COPYRIGHT
- crate rand_core@0.6.4: COPYRIGHT
- crate rand_pcg@0.10.2: COPYRIGHT

``````text
Copyrights in the Rand project are retained by their contributors. No
copyright assignment is required to contribute to the Rand project.

For full authorship information, see the version control history.

Except as otherwise noted (below and/or in individual files), Rand is
licensed under the Apache License, Version 2.0 <LICENSE-APACHE> or
<http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
<LICENSE-MIT> or <http://opensource.org/licenses/MIT>, at your option.

The Rand project includes code from the Rust project
published under these same licenses.
``````

<a id="notice-fee4d7ce394c"></a>

### notice-fee4d7ce394c

来源：

- crate rand@0.10.3: LICENSE-APACHE
- crate rand@0.8.8: LICENSE-APACHE

``````text
Apache License
                        Version 2.0, January 2004
                     https://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS
``````

<a id="notice-cc367a7134c2"></a>

### notice-cc367a7134c2

来源：

- crate rand@0.10.3: LICENSE-MIT
- crate rand@0.8.8: LICENSE-MIT
- crate rand_core@0.6.4: LICENSE-MIT

``````text
Copyright 2018 Developers of the Rand project
Copyright (c) 2014 The Rust Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-c9027c55c930"></a>

### notice-c9027c55c930

来源：

- crate rand_core@0.10.1: COPYRIGHT

``````text
Copyrights in the Rand project are retained by their contributors. No
copyright assignment is required to contribute to the Rand project.

For full authorship information, see the version control history.

Except as otherwise noted (below and/or in individual files), Rand is
licensed under the Apache License, Version 2.0 <LICENSE-APACHE> or
<http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
<LICENSE-MIT> or <http://opensource.org/licenses/MIT>, at your option.
``````

<a id="notice-179c83ef07a5"></a>

### notice-179c83ef07a5

来源：

- crate rand_core@0.10.1: LICENSE-APACHE
- crate rand_core@0.6.4: LICENSE-APACHE
- crate rand_pcg@0.10.2: LICENSE-APACHE

``````text
Apache License
                        Version 2.0, January 2004
                     https://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.
``````

<a id="notice-704f0e5f1c84"></a>

### notice-704f0e5f1c84

来源：

- crate rand_core@0.10.1: LICENSE-MIT

``````text
Copyright (c) 2018-2026 The Rand Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-c3df7fccc8e5"></a>

### notice-c3df7fccc8e5

来源：

- crate rand_pcg@0.10.2: LICENSE-MIT

``````text
Copyright (c) 2014-2017 Melissa O'Neill and PCG Project contributors
Copyright 2018 Developers of the Rand project

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-aa69fda6dd94"></a>

### notice-aa69fda6dd94

来源：

- crate raw-window-handle@0.6.2: LICENSE-MIT.md

``````text
MIT License

Copyright (c) 2019 Osspial

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-81976b4834c3"></a>

### notice-81976b4834c3

来源：

- crate raw-window-handle@0.6.2: LICENSE-ZLIB.md

``````text
Copyright (c) 2020 Osspial

This software is provided 'as-is', without any express or implied warranty. In no event will the authors be held liable for any damages arising from the use of this software.

Permission is granted to anyone to use this software for any purpose, including commercial applications, and to alter it and redistribute it freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not claim that you wrote the original software. If you use this software in a product, an acknowledgment in the product documentation would be appreciated but is not required.

2. Altered source versions must be plainly marked as such, and must not be misrepresented as being the original software.

3. This notice may not be removed or altered from any source distribution.
``````

<a id="notice-ea8df489e83b"></a>

### notice-ea8df489e83b

来源：

- crate regex-syntax@0.8.11: src/unicode_tables/LICENSE-UNICODE

``````text
UNICODE, INC. LICENSE AGREEMENT - DATA FILES AND SOFTWARE

Unicode Data Files include all data files under the directories
http://www.unicode.org/Public/, http://www.unicode.org/reports/,
http://www.unicode.org/cldr/data/, http://source.icu-project.org/repos/icu/, and
http://www.unicode.org/utility/trac/browser/.

Unicode Data Files do not include PDF online code charts under the
directory http://www.unicode.org/Public/.

Software includes any source code published in the Unicode Standard
or under the directories
http://www.unicode.org/Public/, http://www.unicode.org/reports/,
http://www.unicode.org/cldr/data/, http://source.icu-project.org/repos/icu/, and
http://www.unicode.org/utility/trac/browser/.

NOTICE TO USER: Carefully read the following legal agreement.
BY DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING UNICODE INC.'S
DATA FILES ("DATA FILES"), AND/OR SOFTWARE ("SOFTWARE"),
YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT.
IF YOU DO NOT AGREE, DO NOT DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE
THE DATA FILES OR SOFTWARE.

COPYRIGHT AND PERMISSION NOTICE

Copyright © 1991-2018 Unicode, Inc. All rights reserved.
Distributed under the Terms of Use in http://www.unicode.org/copyright.html.

Permission is hereby granted, free of charge, to any person obtaining
a copy of the Unicode data files and any associated documentation
(the "Data Files") or Unicode software and any associated documentation
(the "Software") to deal in the Data Files or Software
without restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, and/or sell copies of
the Data Files or Software, and to permit persons to whom the Data Files
or Software are furnished to do so, provided that either
(a) this copyright and permission notice appear with all copies
of the Data Files or Software, or
(b) this copyright and permission notice appear in associated
Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT OF THIRD PARTY RIGHTS.
IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS
NOTICE BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL
DAMAGES, OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE,
DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THE DATA FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder
shall not be used in advertising or otherwise to promote the sale,
use or other dealings in these Data Files or Software without prior
written authorization of the copyright holder.
``````

<a id="notice-5c3866f31ed2"></a>

### notice-5c3866f31ed2

来源：

- crate reqwest@0.12.28: LICENSE-APACHE
- crate reqwest@0.13.5: LICENSE-APACHE

``````text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright 2016 Sean McArthur

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
``````

<a id="notice-54987d63f266"></a>

### notice-54987d63f266

来源：

- crate reqwest@0.12.28: LICENSE-MIT

``````text
Copyright (c) 2016-2025 Sean McArthur

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-bde59a7e336f"></a>

### notice-bde59a7e336f

来源：

- crate reqwest@0.13.5: LICENSE-MIT

``````text
Copyright (c) 2016-2026 Sean McArthur

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-edb9c6dbff46"></a>

### notice-edb9c6dbff46

来源：

- crate ring@0.17.14: LICENSE

``````text
*ring* uses an "ISC" license, like BoringSSL used to use, for new code
files. See LICENSE-other-bits for the text of that license.

See LICENSE-BoringSSL for code that was sourced from BoringSSL under the
Apache 2.0 license. Some code that was sourced from BoringSSL under the ISC
license. In each case, the license info is at the top of the file.

See src/polyfill/once_cell/LICENSE-APACHE and src/polyfill/once_cell/LICENSE-MIT
for the license to code that was sourced from the once_cell project.
``````

<a id="notice-473867fcf89f"></a>

### notice-473867fcf89f

来源：

- crate ring@0.17.14: LICENSE-BoringSSL

``````text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.


Licenses for support code
-------------------------

Parts of the TLS test suite are under the Go license. This code is not included
in BoringSSL (i.e. libcrypto and libssl) when compiled, however, so
distributing code linked against BoringSSL does not trigger this license:

Copyright (c) 2009 The Go Authors. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

   * Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.
   * Redistributions in binary form must reproduce the above
copyright notice, this list of conditions and the following disclaimer
in the documentation and/or other materials provided with the
distribution.
   * Neither the name of Google Inc. nor the names of its
contributors may be used to endorse or promote products derived from
this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


BoringSSL uses the Chromium test infrastructure to run a continuous build,
trybots etc. The scripts which manage this, and the script for generating build
metadata, are under the Chromium license. Distributing code linked against
BoringSSL does not trigger this license.

Copyright 2015 The Chromium Authors. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

   * Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.
   * Redistributions in binary form must reproduce the above
copyright notice, this list of conditions and the following disclaimer
in the documentation and/or other materials provided with the
distribution.
   * Neither the name of Google Inc. nor the names of its
contributors may be used to endorse or promote products derived from
this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
``````

<a id="notice-07414b6c33f3"></a>

### notice-07414b6c33f3

来源：

- crate ring@0.17.14: LICENSE-other-bits

``````text
Copyright 2015-2025 Brian Smith.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
``````

<a id="notice-740a360e4d9c"></a>

### notice-740a360e4d9c

来源：

- crate ring@0.17.14: src/polyfill/once_cell/LICENSE-MIT

``````text
Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHOR OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-f1954d2b51ee"></a>

### notice-f1954d2b51ee

来源：

- crate ring@0.17.14: third_party/fiat/LICENSE

``````text
The Apache License, Version 2.0 (Apache-2.0)

Copyright 2015-2020 the fiat-crypto authors (see the AUTHORS file)

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
``````

<a id="notice-f5854c00454b"></a>

### notice-f5854c00454b

来源：

- https://raw.githubusercontent.com/modelcontextprotocol/rust-sdk/79437f291b2c44053d00dcd5db969fd0cca7c887/LICENSE

``````text
The MCP project is undergoing a licensing transition from the MIT License to the Apache License, Version 2.0 ("Apache-2.0"). All new code and specification contributions to the project are licensed under Apache-2.0. Documentation contributions (excluding specifications) are licensed under CC-BY-4.0.

Contributions for which relicensing consent has been obtained are licensed under Apache-2.0. Contributions made by authors who originally licensed their work under the MIT License and who have not yet granted explicit permission to relicense remain licensed under the MIT License.

No rights beyond those granted by the applicable original license are conveyed for such contributions.

---

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to the Licensor for inclusion in the Work by the copyright
      owner or by an individual or Legal Entity authorized to submit on behalf
      of the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

---

MIT License

Copyright (c) 2024-2025 Model Context Protocol a Series of LF Projects, LLC.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

Creative Commons Attribution 4.0 International (CC-BY-4.0)

Documentation in this project (excluding specifications) is licensed under
CC-BY-4.0. See https://creativecommons.org/licenses/by/4.0/legalcode for
the full license text.
``````

<a id="notice-fde2a68c47d2"></a>

### notice-fde2a68c47d2

来源：

- crate rustix@1.1.5: COPYRIGHT

``````text
Short version for non-lawyers:

`rustix` is triple-licensed under Apache 2.0 with the LLVM Exception,
Apache 2.0, and MIT terms.


Longer version:

Copyrights in the `rustix` project are retained by their contributors.
No copyright assignment is required to contribute to the `rustix`
project.

Some files include code derived from Rust's `libstd`; see the comments in
the code for details.

Except as otherwise noted (below and/or in individual files), `rustix`
is licensed under:

 - the Apache License, Version 2.0, with the LLVM Exception
   <LICENSE-Apache-2.0_WITH_LLVM-exception> or
   <http://llvm.org/foundation/relicensing/LICENSE.txt>
 - the Apache License, Version 2.0
   <LICENSE-APACHE> or
   <http://www.apache.org/licenses/LICENSE-2.0>,
 - or the MIT license
   <LICENSE-MIT> or
   <http://opensource.org/licenses/MIT>,

at your option.
``````

<a id="notice-2f213ec6b135"></a>

### notice-2f213ec6b135

来源：

- crate rustix@1.1.5: LICENSE-Apache-2.0_WITH_LLVM-exception

``````text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.


--- LLVM Exceptions to the Apache 2.0 License ----

As an exception, if, as a result of your compiling your source code, portions
of this Software are embedded into an Object form of such source code, you
may redistribute such embedded portions in such Object form without complying
with the conditions of Sections 4(a), 4(b) and 4(d) of the License.

In addition, if you combine or link compiled forms of this Software with
software that is licensed under the GPLv2 ("Combined Software") and if a
court of competent jurisdiction determines that the patent provision (Section
3), the indemnity provision (Section 9) or other Section of the License
conflicts with the conditions of the GPLv2, you may retroactively and
prospectively choose to deem waived or otherwise exclude such Section(s) of
the License, but only in their entirety and only with respect to the Combined
Software.
``````

<a id="notice-430e912c26ce"></a>

### notice-430e912c26ce

来源：

- crate rustls-pki-types@1.15.1: LICENSE-APACHE

``````text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright 2023 Dirkjan Ochtman

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
``````

<a id="notice-c5e7f780f961"></a>

### notice-c5e7f780f961

来源：

- crate rustls-pki-types@1.15.1: LICENSE-MIT

``````text
Copyright (c) 2023 Dirkjan Ochtman <dirkjan@ochtman.nl>

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-3ac27594ed56"></a>

### notice-3ac27594ed56

来源：

- crate rustls-webpki@0.103.16: LICENSE

``````text
Except as otherwise noted, this project is licensed under the following
(ISC-style) terms:

Copyright 2015 Brian Smith.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHORS DISCLAIM ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

The files under third-party/chromium are licensed as described in
third-party/chromium/LICENSE.
``````

<a id="notice-8d8291caf1ce"></a>

### notice-8d8291caf1ce

来源：

- crate ryu@1.0.23: LICENSE-BOOST

``````text
Boost Software License - Version 1.0 - August 17th, 2003

Permission is hereby granted, free of charge, to any person or organization
obtaining a copy of the software and accompanying documentation covered by
this license (the "Software") to use, reproduce, display, distribute,
execute, and transmit the Software, and to prepare derivative works of the
Software, and to permit third-parties to whom the Software is furnished to
do so, all subject to the following:

The copyright notices in the Software and this entire statement, including
the above license grant, this restriction and the following disclaimer,
must be included in all copies of the Software, in whole or in part, and
all derivative works of the Software, unless such copies or derivative
works are solely in the form of machine-executable object code generated by
a source language processor.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. IN NO EVENT
SHALL THE COPYRIGHT HOLDERS OR ANYONE DISTRIBUTING THE SOFTWARE BE LIABLE
FOR ANY DAMAGES OR OTHER LIABILITY, WHETHER IN CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-739620ea44ad"></a>

### notice-739620ea44ad

来源：

- crate same-file@1.0.6: LICENSE-MIT
- crate winapi-util@0.1.11: LICENSE-MIT

``````text
The MIT License (MIT)

Copyright (c) 2017 Andrew Gallant

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-1ecbb241444a"></a>

### notice-1ecbb241444a

来源：

- crate schannel@0.1.30: LICENSE.md

``````text
Copyright (c) 2015 steffengy

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-1ddb39b2b497"></a>

### notice-1ddb39b2b497

来源：

- crate schemars@0.8.22: LICENSE
- crate schemars@0.9.0: LICENSE
- crate schemars@1.2.3: LICENSE
- crate schemars_derive@0.8.22: LICENSE

``````text
MIT License

Copyright (c) 2019 Graham Esau

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-1a6aa2616e74"></a>

### notice-1a6aa2616e74

来源：

- crate scopeguard@1.2.0: LICENSE-MIT

``````text
Copyright (c) 2016-2019 Ulrik Sverdrup "bluss" and scopeguard developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-1480f3f404a7"></a>

### notice-1480f3f404a7

来源：

- crate scraper@0.24.0: LICENSE

``````text
Copyright © 2016, June McEnroe <june@causal.agency>
Copyright © 2017, Vivek Kushwaha <yoursvivek@gmail.com>
Copyright © 2024-2025, rust-scraper Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
``````

<a id="notice-37412fff76e3"></a>

### notice-37412fff76e3

来源：

- crate security-framework@3.7.0: LICENSE-MIT
- crate security-framework-sys@2.17.0: LICENSE-MIT

``````text
The MIT License (MIT)

Copyright (c) 2015 Steven Fackler

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-b5dae9532426"></a>

### notice-b5dae9532426

来源：

- crate serde_urlencoded@0.7.1: LICENSE-MIT

``````text
Copyright (c) 2016 Anthony Ramine

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-fdd1c2117bcf"></a>

### notice-fdd1c2117bcf

来源：

- crate serde_with@3.24.0: LICENSE-MIT
- crate serde_with_macros@3.24.0: LICENSE-MIT

``````text
Copyright (c) 2015

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-777eb7417541"></a>

### notice-777eb7417541

来源：

- crate serialize-to-javascript@0.1.2: LICENSE-MIT
- crate serialize-to-javascript-impl@0.1.2: LICENSE-MIT

``````text
MIT License

Copyright (c) 2021 Chip Reed

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-4031faf6212e"></a>

### notice-4031faf6212e

来源：

- crate sha2@0.10.9: LICENSE-MIT

``````text
Copyright (c) 2006-2009 Graydon Hoare
Copyright (c) 2009-2013 Mozilla Foundation
Copyright (c) 2016 Artyom Pavlov

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-a759ce38c686"></a>

### notice-a759ce38c686

来源：

- crate shlex@2.0.1: LICENSE-APACHE

``````text
Copyright 2015 Nicholas Allegra (comex).

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
``````

<a id="notice-cc5ba5589dfb"></a>

### notice-cc5ba5589dfb

来源：

- crate shlex@2.0.1: LICENSE-MIT

``````text
The MIT License (MIT)

Copyright (c) 2015 Nicholas Allegra (comex).

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-627eff66d6c4"></a>

### notice-627eff66d6c4

来源：

- crate simd-adler32@0.3.10: LICENSE.md

``````text
MIT License

Copyright (c) [2021] [Marvin Countryman]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-24e26e8fb783"></a>

### notice-24e26e8fb783

来源：

- crate siphasher@1.0.4: COPYING

``````text
Copyright 2012-2016 The Rust Project Developers.
Copyright 2016-2026 Frank Denis.

Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
<LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
option.
``````

<a id="notice-21a2121221d2"></a>

### notice-21a2121221d2

来源：

- crate siphasher@1.0.4: LICENSE-MIT

``````text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-12c7116c4425"></a>

### notice-12c7116c4425

来源：

- crate slab@0.4.12: LICENSE

``````text
Copyright (c) 2019 Carl Lerche

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-7f194ae45c25"></a>

### notice-7f194ae45c25

来源：

- crate smallvec@1.16.3: LICENSE-MIT

``````text
Copyright (c) 2018 The Servo Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-1fc3bc7f4a1b"></a>

### notice-1fc3bc7f4a1b

来源：

- crate softbuffer@0.4.8: LICENSE-APACHE

``````text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "{}"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright 2022 Kirill Chibisov

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
``````

<a id="notice-f8babf2965a4"></a>

### notice-f8babf2965a4

来源：

- crate softbuffer@0.4.8: LICENSE-MIT

``````text
Copyright 2022 Kirill Chibisov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-dd81a81bc100"></a>

### notice-dd81a81bc100

来源：

- crate sse-stream@0.2.6: LICENSE-MIT

``````text
MIT License

Copyright (c) 2024 4t145

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-5e05b024f653"></a>

### notice-5e05b024f653

来源：

- crate stable_deref_trait@1.2.1: LICENSE-MIT

``````text
Copyright (c) 2017 Robert Grosse

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-8fd8980cab89"></a>

### notice-8fd8980cab89

来源：

- crate strsim@0.11.1: LICENSE

``````text
The MIT License (MIT)

Copyright (c) 2015 Danny Guo
Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com>
Copyright (c) 2018 Akash Kurdekar

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-24fa06d8eae3"></a>

### notice-24fa06d8eae3

来源：

- crate subtle@2.6.1: LICENSE

``````text
Copyright (c) 2016-2017 Isis Agora Lovecruft, Henry de Valence. All rights reserved.
Copyright (c) 2016-2024 Isis Agora Lovecruft. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

1. Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright
notice, this list of conditions and the following disclaimer in the
documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
contributors may be used to endorse or promote products derived from
this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
``````

<a id="notice-d588236a8ad8"></a>

### notice-d588236a8ad8

来源：

- crate swift-rs@1.0.9: LICENSE-APACHE

``````text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "{}"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright 2023 The swift-rs developers

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
``````

<a id="notice-7593ea50d2d4"></a>

### notice-7593ea50d2d4

来源：

- crate swift-rs@1.0.9: LICENSE-MIT

``````text
Copyright (c) 2023 The swift-rs Developers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-3a036676ec8c"></a>

### notice-3a036676ec8c

来源：

- crate synstructure@0.14.0: LICENSE

``````text
Copyright 2016 Nika Layzell

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-28694f36acab"></a>

### notice-28694f36acab

来源：

- crate tao@0.35.3: LICENSE.spdx

``````text
SPDXVersion: SPDX-2.1
DataLicense: CC0-1.0
PackageName: tao
DataFormat: SPDXRef-1
PackageSupplier: Organization: The Tauri Programme in the Commons Conservancy
PackageHomePage: https://tauri.app
PackageLicenseDeclared: Apache-2.0
PackageCopyrightText: 2021-2023, The Tauri Programme in the Commons Conservancy
PackageSummary: <text>Tao is the official, rust-based window manager for Wry.
                </text>
PackageComment: <text>The package includes the following libraries; see
Relationship information.
                </text>
Created: 2020-05-20T09:00:00Z
PackageDownloadLocation: git://github.com/tauri-apps/tao
PackageDownloadLocation: git+https://github.com/tauri-apps/tao.git
PackageDownloadLocation: git+ssh://github.com/tauri-apps/tao.git
Creator: Person: Daniel Thompson-Yvetot
``````

<a id="notice-e6e853531994"></a>

### notice-e6e853531994

来源：

- crate tar@0.4.46: LICENSE-MIT

``````text
Copyright (c) The tar-rs Project Contributors

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-a2c382fbddcc"></a>

### notice-a2c382fbddcc

来源：

- crate tauri-winres@0.3.6: LICENSE

``````text
The MIT License (MIT)

Copyright (c) 2023 - Present Tauri Apps Contributors
Copyright (c) 2016 Max Resch

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-7bdd5c5e8ad0"></a>

### notice-7bdd5c5e8ad0

来源：

- crate tempfile@3.27.0: LICENSE-MIT
- crate xattr@1.6.1: LICENSE-MIT

``````text
Copyright (c) 2015 Steven Allen

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-7fdbca77dec6"></a>

### notice-7fdbca77dec6

来源：

- crate time@0.3.55: LICENSE-MIT
- crate time-core@0.1.9: LICENSE-MIT
- crate time-macros@0.2.32: LICENSE-MIT

``````text
Copyright (c) Jacob Pratt et al.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-943f36fd309f"></a>

### notice-943f36fd309f

来源：

- crate tinyvec@1.13.3: LICENSE-ZLIB.md

``````text
Copyright (c) 2019 Daniel "Lokathor" Gee.

This software is provided 'as-is', without any express or implied warranty. In no event will the authors be held liable for any damages arising from the use of this software.

Permission is granted to anyone to use this software for any purpose, including commercial applications, and to alter it and redistribute it freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not claim that you wrote the original software. If you use this software in a product, an acknowledgment in the product documentation would be appreciated but is not required.

2. Altered source versions must be plainly marked as such, and must not be misrepresented as being the original software.

3. This notice may not be removed or altered from any source distribution.
``````

<a id="notice-3e1bef82aa0d"></a>

### notice-3e1bef82aa0d

来源：

- crate tokio@1.53.3: LICENSE
- crate tokio-stream@0.1.19: LICENSE
- crate tokio-util@0.7.20: LICENSE

``````text
MIT License

Copyright (c) Tokio Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-c0fdcda1a4ff"></a>

### notice-c0fdcda1a4ff

来源：

- crate tokio-macros@2.7.2: LICENSE

``````text
MIT License

Copyright (c) 2019 Yoshua Wuyts
Copyright (c) Tokio Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-c1e08ee9a728"></a>

### notice-c1e08ee9a728

来源：

- crate tokio-native-tls@0.3.1: LICENSE
- crate tracing@0.1.44: LICENSE
- crate tracing-attributes@0.1.31: LICENSE
- crate tracing-core@0.1.36: LICENSE

``````text
Copyright (c) 2019 Tokio Contributors

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-acddfb05f07a"></a>

### notice-acddfb05f07a

来源：

- crate tokio-rustls@0.26.6: LICENSE-APACHE

``````text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright 2017 quininer kel

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
``````

<a id="notice-1b0258c48739"></a>

### notice-1b0258c48739

来源：

- crate tokio-rustls@0.26.6: LICENSE-MIT

``````text
Copyright (c) 2017 quininer kel

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-da6b30502bad"></a>

### notice-da6b30502bad

来源：

- crate tower@0.5.3: LICENSE
- crate tower-layer@0.3.3: LICENSE
- crate tower-service@0.3.3: LICENSE

``````text
Copyright (c) 2019 Tower Contributors

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-edd4b164997f"></a>

### notice-edd4b164997f

来源：

- crate tower-http@0.6.11: LICENSE

``````text
Copyright (c) 2019-2021 Tower Contributors

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-6ac8711fb340"></a>

### notice-6ac8711fb340

来源：

- crate tracing-core@0.1.36: src/spin/LICENSE

``````text
The MIT License (MIT)

Copyright (c) 2014 Mathijs van de Nes

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-6c1e5d0ccf5e"></a>

### notice-6c1e5d0ccf5e

来源：

- crate tray-icon@0.24.2: LICENSE.spdx

``````text
SPDXVersion: SPDX-2.1
DataLicense: CC0-1.0
PackageName: tray-icon
DataFormat: SPDXRef-1
PackageSupplier: Organization: The Tauri Programme in the Commons Conservancy
PackageHomePage: https://tauri.app
PackageLicenseDeclared: Apache-2.0
PackageLicenseDeclared: MIT
PackageCopyrightText: 2020-2022, The Tauri Programme in the Commons Conservancy
PackageSummary: <text>Create tray icons for desktop applications.
                </text>
PackageComment: <text>The package includes the following libraries; see
Relationship information.
                </text>
Created: 2022-12-05T09:00:00Z
PackageDownloadLocation: git://github.com/tauri-apps/tray-icon
PackageDownloadLocation: git+https://github.com/tauri-apps/tray-icon.git
PackageDownloadLocation: git+ssh://github.com/tauri-apps/tray-icon.git
Creator: Person: Daniel Thompson-Yvetot
``````

<a id="notice-381f992f70f7"></a>

### notice-381f992f70f7

来源：

- crate try-lock@0.2.5: LICENSE

``````text
Copyright (c) 2018-2023 Sean McArthur
Copyright (c) 2016 Alex Crichton

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-db11fec99467"></a>

### notice-db11fec99467

来源：

- crate typenum@1.20.1: LICENSE

``````text
MIT OR Apache-2.0
``````

<a id="notice-65dc2a869ff7"></a>

### notice-65dc2a869ff7

来源：

- crate typenum@1.20.1: LICENSE-APACHE

``````text
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright 2014 Paho Lurie-Gregg

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
``````

<a id="notice-87ebb37988ef"></a>

### notice-87ebb37988ef

来源：

- crate typenum@1.20.1: LICENSE-MIT

``````text
The MIT License (MIT)

Copyright (c) 2014 Paho Lurie-Gregg

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-c193d216d646"></a>

### notice-c193d216d646

来源：

- https://raw.githubusercontent.com/open-i18n/rust-unic/5878605364af97a3358368a6eaef02104af2e016/COPYRIGHT.md

``````text
* Copyright 2011-2015 The Rust Project developers.
* Copyright 2013-2016 The rust-url developers.
* Copyright 2015-2017 The Servo Project developers.
* Copyright 2017 The UNIC Project developers.

See [AUTHORS](AUTHORS) for the list of developers.

Licensed under the Apache License, Version 2.0
([LICENSE-APACHE](LICENSE-APACHE) or
<http://www.apache.org/licenses/LICENSE-2.0>) or the MIT license
([LICENSE-MIT](LICENSE-MIT) or <http://opensource.org/licenses/MIT>), at your
option.  All files in the project carrying such notice may not be copied,
modified, or distributed except according to those terms.
``````

<a id="notice-361d79129578"></a>

### notice-361d79129578

来源：

- crate unicode-ident@1.0.27: LICENSE-UNICODE

``````text
UNICODE LICENSE V3

COPYRIGHT AND PERMISSION NOTICE

Copyright © 1991-2023 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY
DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.
``````

<a id="notice-20cec30ad778"></a>

### notice-20cec30ad778

来源：

- crate unicode-segmentation@1.13.3: COPYRIGHT

``````text
Licensed under the Apache License, Version 2.0
<LICENSE-APACHE or
http://www.apache.org/licenses/LICENSE-2.0> or the MIT
license <LICENSE-MIT or http://opensource.org/licenses/MIT>,
at your option. All files in the project carrying such
notice may not be copied, modified, or distributed except
according to those terms.
``````

<a id="notice-7cfd98aeed13"></a>

### notice-7cfd98aeed13

来源：

- crate universal-hash@0.5.1: LICENSE-MIT

``````text
Copyright (c) 2019-2020 RustCrypto Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-a1fff3442978"></a>

### notice-a1fff3442978

来源：

- crate untrusted@0.9.0: LICENSE.txt

``````text
// Copyright 2015-2016 Brian Smith.
//
// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHORS DISCLAIM ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
``````

<a id="notice-f2459c4b106b"></a>

### notice-f2459c4b106b

来源：

- crate urlpattern@0.3.0: LICENSE

``````text
MIT License

Copyright (c) 2021 the Deno authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-76c0e37c107d"></a>

### notice-76c0e37c107d

来源：

- crate utf8_iter@1.0.4: COPYRIGHT

``````text
Copyright Mozilla Foundation

Licensed under the Apache License (Version 2.0), or the MIT license,
(the "Licenses") at your option. You may not use this file except in
compliance with one of the Licenses. You may obtain copies of the
Licenses at:

   https://www.apache.org/licenses/LICENSE-2.0
   https://opensource.org/licenses/MIT

Unless required by applicable law or agreed to in writing, software
distributed under the Licenses is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the Licenses for the specific language governing permissions and
limitations under the Licenses.

--

Test code is dedicated to the Public Domain when so designated (see
the individual files for PD/CC0-dedicated sections).

--

The implementation for Utf8CharIndices was adapted from the
CharIndices implementation of the Rust standard library at revision
ab32548539ec38a939c1b58599249f3b54130026
(https://github.com/rust-lang/rust/blob/ab32548539ec38a939c1b58599249f3b54130026/library/core/src/str/iter.rs).

Excerpt from https://github.com/rust-lang/rust/blob/ab32548539ec38a939c1b58599249f3b54130026/COPYRIGHT ,
which refers to
https://github.com/rust-lang/rust/blob/ab32548539ec38a939c1b58599249f3b54130026/LICENSE-APACHE
and
https://github.com/rust-lang/rust/blob/ab32548539ec38a939c1b58599249f3b54130026/LICENSE-MIT
:

For full authorship information, see the version control history or
https://thanks.rust-lang.org

Except as otherwise noted (below and/or in individual files), Rust is
licensed under the Apache License, Version 2.0 <LICENSE-APACHE> or
<http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
<LICENSE-MIT> or <http://opensource.org/licenses/MIT>, at your option.
``````

<a id="notice-db2c904eb568"></a>

### notice-db2c904eb568

来源：

- crate utf8parse@0.2.2: LICENSE-MIT

``````text
Copyright (c) 2016 Joe Wilm

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-11cd7e6caed4"></a>

### notice-11cd7e6caed4

来源：

- crate uuid@1.26.1: LICENSE-MIT

``````text
Copyright (c) 2014 The Rust Project Developers
Copyright (c) 2018 Ashley Mannix, Christopher Armstrong, Dylan DPC, Hunar Roop Kahlon

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-6196143cbaf5"></a>

### notice-6196143cbaf5

来源：

- crate vcpkg@0.2.15: LICENSE-MIT

``````text
Copyright (c) 2017 Jim McGrath

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-ed2fda479dac"></a>

### notice-ed2fda479dac

来源：

- crate version_check@0.9.5: LICENSE-MIT

``````text
The MIT License (MIT)
Copyright (c) 2017-2018 Sergio Benitez

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-b9720ca7a91f"></a>

### notice-b9720ca7a91f

来源：

- crate vswhom@0.1.0: LICENSE
- crate vswhom-sys@0.1.3: LICENSE

``````text
The MIT License (MIT)

Copyright (c) 2019 nabijaczleweli

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-f7dfffe03f9f"></a>

### notice-f7dfffe03f9f

来源：

- crate want@0.3.2: LICENSE

``````text
Copyright (c) 2018-2019 Sean McArthur

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-d30183ec6610"></a>

### notice-d30183ec6610

来源：

- crate webpki-roots@1.0.11: LICENSE

``````text
# Community Data License Agreement - Permissive - Version 2.0

This is the Community Data License Agreement - Permissive, Version
2.0 (the "agreement"). Data Provider(s) and Data Recipient(s) agree
as follows:

## 1. Provision of the Data

1.1. A Data Recipient may use, modify, and share the Data made
available by Data Provider(s) under this agreement if that Data
Recipient follows the terms of this agreement.

1.2. This agreement does not impose any restriction on a Data
Recipient's use, modification, or sharing of any portions of the
Data that are in the public domain or that may be used, modified,
or shared under any other legal exception or limitation.

## 2. Conditions for Sharing Data

2.1. A Data Recipient may share Data, with or without modifications, so
long as the Data Recipient makes available the text of this agreement
with the shared Data.

## 3. No Restrictions on Results

3.1. This agreement does not impose any restriction or obligations
with respect to the use, modification, or sharing of Results.

## 4. No Warranty; Limitation of Liability

4.1. All Data Recipients receive the Data subject to the following
terms:

THE DATA IS PROVIDED ON AN "AS IS" BASIS, WITHOUT REPRESENTATIONS,
WARRANTIES OR CONDITIONS OF ANY KIND, EITHER EXPRESS OR IMPLIED
INCLUDING, WITHOUT LIMITATION, ANY WARRANTIES OR CONDITIONS OF TITLE,
NON-INFRINGEMENT, MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.

NO DATA PROVIDER SHALL HAVE ANY LIABILITY FOR ANY DIRECT, INDIRECT,
INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING
WITHOUT LIMITATION LOST PROFITS), HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE DATA OR RESULTS,
EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

## 5. Definitions

5.1. "Data" means the material received by a Data Recipient under
this agreement.

5.2. "Data Provider" means any person who is the source of Data
provided under this agreement and in reliance on a Data Recipient's
agreement to its terms.

5.3. "Data Recipient" means any person who receives Data directly
or indirectly from a Data Provider and agrees to the terms of this
agreement.

5.4. "Results" means any outcome obtained by computational analysis
of Data, including for example machine learning models and models'
insights.
``````

<a id="notice-008f1b11c6d1"></a>

### notice-008f1b11c6d1

来源：

- https://raw.githubusercontent.com/wravery/webview2-rs/b74dc5e2b394044bea5191052868ce7a106c202c/LICENSE
- https://raw.githubusercontent.com/wravery/webview2-rs/dffa41a8a46d3f5565eefbff2de57d38d399f158/LICENSE

``````text
MIT License

Copyright (c) 2021 Bill Avery

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-b46700117441"></a>

### notice-b46700117441

来源：

- crate window-vibrancy@0.6.0: LICENSE-MIT

``````text
MIT License

Copyright (c) 2020-2022 Tauri Programme within The Commons Conservancy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-bb8278137f73"></a>

### notice-bb8278137f73

来源：

- crate window-vibrancy@0.6.0: LICENSE.spdx

``````text
SPDXVersion: SPDX-2.1
DataLicense: CC0-1.0
PackageName: window-vibrancy
DataFormat: SPDXRef-1
PackageSupplier: Organization: The Tauri Programme in the Commons Conservancy
PackageHomePage: https://tauri.app
PackageLicenseDeclared: Apache-2.0
PackageLicenseDeclared: MIT
PackageCopyrightText: 2020-2022, The Tauri Programme in the Commons Conservancy
PackageSummary: <text>Make your windows vibrant.
                </text>
PackageComment: <text>The package includes the following libraries; see
Relationship information.
                </text>
Created: 2020-05-20T09:00:00Z
PackageDownloadLocation: git://github.com/tauri-apps/window-vibrancy
PackageDownloadLocation: git+https://github.com/tauri-apps/window-vibrancy.git
PackageDownloadLocation: git+ssh://github.com/tauri-apps/window-vibrancy.git
Creator: Person: Daniel Thompson-Yvetot
``````

<a id="notice-783829b43aac"></a>

### notice-783829b43aac

来源：

- crate windows@0.58.0: license-apache-2.0
- crate windows@0.61.3: license-apache-2.0
- crate windows_x86_64_msvc@0.52.6: license-apache-2.0
- crate windows_x86_64_msvc@0.53.1: license-apache-2.0
- crate windows-collections@0.2.0: license-apache-2.0
- crate windows-core@0.58.0: license-apache-2.0
- crate windows-core@0.61.2: license-apache-2.0
- crate windows-future@0.2.1: license-apache-2.0
- crate windows-implement@0.58.0: license-apache-2.0
- crate windows-implement@0.60.2: license-apache-2.0
- crate windows-interface@0.58.0: license-apache-2.0
- crate windows-interface@0.59.3: license-apache-2.0
- crate windows-link@0.1.3: license-apache-2.0
- crate windows-link@0.2.1: license-apache-2.0
- crate windows-numerics@0.2.0: license-apache-2.0
- crate windows-result@0.2.0: license-apache-2.0
- crate windows-result@0.3.4: license-apache-2.0
- crate windows-strings@0.1.0: license-apache-2.0
- crate windows-strings@0.4.2: license-apache-2.0
- crate windows-sys@0.59.0: license-apache-2.0
- crate windows-sys@0.60.2: license-apache-2.0
- crate windows-sys@0.61.2: license-apache-2.0
- crate windows-targets@0.52.6: license-apache-2.0
- crate windows-targets@0.53.5: license-apache-2.0
- crate windows-threading@0.1.0: license-apache-2.0
- crate windows-version@0.1.7: license-apache-2.0

``````text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright (c) Microsoft Corporation.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
``````

<a id="notice-8793aa4141de"></a>

### notice-8793aa4141de

来源：

- crate winnow@0.7.15: LICENSE-MIT
- crate winnow@1.0.4: LICENSE-MIT

``````text
Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-d9ba37d9bbdf"></a>

### notice-d9ba37d9bbdf

来源：

- crate winreg@0.56.0: LICENSE

``````text
Copyright (c) 2015 Igor Shaula

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
``````

<a id="notice-1b4e6722da7c"></a>

### notice-1b4e6722da7c

来源：

- crate winvd@0.0.49: LICENSE.txt

``````text
Copyright (c) 2015-2023 Jari Otto Oskari Pennanen

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
``````

<a id="notice-86eb6a41ef64"></a>

### notice-86eb6a41ef64

来源：

- crate wry@0.55.1: LICENSE-MIT

``````text
MIT License

Copyright (c) 2020-2023 Ngo Iok Ui & Tauri Programme within The Commons Conservancy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
``````

<a id="notice-26235c41e314"></a>

### notice-26235c41e314

来源：

- crate wry@0.55.1: LICENSE.spdx

``````text
SPDXVersion: SPDX-2.1
DataLicense: CC0-1.0
PackageName: wry
DataFormat: SPDXRef-1
PackageSupplier: Organization: The Tauri Programme in the Commons Conservancy
PackageHomePage: https://tauri.app
PackageLicenseDeclared: Apache-2.0
PackageLicenseDeclared: MIT
PackageCopyrightText: 2020-2023, The Tauri Programme in the Commons Conservancy
PackageSummary: <text>Wry is the official, rust-based webview
windowing service for Tauri.
                </text>
PackageComment: <text>The package includes the following libraries; see
Relationship information.
                </text>
Created: 2020-05-20T09:00:00Z
PackageDownloadLocation: git://github.com/tauri-apps/wry
PackageDownloadLocation: git+https://github.com/tauri-apps/wry.git
PackageDownloadLocation: git+ssh://github.com/tauri-apps/wry.git
Creator: Person: Daniel Thompson-Yvetot
``````

<a id="notice-836ed921bbad"></a>

### notice-836ed921bbad

来源：

- crate zeroize@1.9.1: LICENSE-MIT

``````text
Copyright (c) 2018-2026 The RustCrypto Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
``````

<a id="notice-04dc52136d82"></a>

### notice-04dc52136d82

来源：

- crate zip@4.6.1: LICENSE

``````text
The MIT License (MIT)

Copyright (c) 2014 Mathijs van de Nes

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Some files in the "tests/data" subdirectory of this repository are under other
licences; see files named LICENSE.*.txt for details.
``````

<a id="notice-6ddf0fba55d4"></a>

### notice-6ddf0fba55d4

来源：

- crate zlib-rs@0.6.8: LICENSE

``````text
(C) 2024 Trifecta Tech Foundation

This software is provided 'as-is', without any express or implied
warranty. In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not
   claim that you wrote the original software. If you use this software
   in a product, an acknowledgment in the product documentation would be
   appreciated but is not required.

2. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.

3. This notice may not be removed or altered from any source distribution.
``````

