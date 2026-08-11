# Tauri 桌面端打包发布说明

本文档只覆盖桌面端开发、打包和本地发布链路，不替换现有 Web 开发和 Web 生产部署方式。

桌面版与网页版的产品定位和能力边界见 [网页版与桌面版产品定位](./网页版与桌面版产品定位.md)。

当前结论：

- Web 主链保持原状：`npm run dev`、`npm run build && npm start` 继续可用
- 桌面端采用 **Tauri v2**
- 当前仓库只维护 **V2**，不再兼容 Tauri v1
- macOS 本地已验证 `npm run app:build` 可以稳定产出 `.app` 和 `.dmg`
- GitHub Actions 已补入 Windows / Ubuntu 桌面构建验证链路，但尚未作为正式发布平台对外分发

## 目标边界

桌面端是一个额外交付形态，不是新的主运行模式。

- Web 本地开发：继续走 Next.js
- Web 生产部署：继续走现有构建与部署
- 桌面端开发：走 `tauri dev`
- 桌面端打包：走 `tauri build` + 自定义 DMG 收尾脚本

这套方案的核心要求是：桌面端问题只在 `app:dev` / `app:build` 这条链路内处理，不把桌面约束反向污染 Web 主链。

## 当前脚本

见 [package.json](../package.json)。

- `npm run dev`
  - Web 本地开发
  - 启动 `next dev --webpack -p 3020`

- `npm run build`
  - Web 生产构建
  - 输出 standalone 产物

- `npm run start`
  - Web 生产启动

- `npm run export`
  - 桌面端静态导出
  - 实际执行 [scripts/export-app.mjs](../scripts/export-app.mjs)

- `npm run export:dev`
  - 桌面端开发前置导出模式

- `npm run app:dev`
  - 桌面端本地开发
  - 启动 Tauri dev，并连接 `http://localhost:3020`

- `npm run app:build`
  - 桌面端生产打包
  - 实际执行 [scripts/tauri-build-app.mjs](../scripts/tauri-build-app.mjs)

- `npm run app:build:release`
  - 桌面端正式发布打包
  - 启用 updater 签名产物
  - 要求提前注入签名环境变量

## 当前实现概览

### 1. Tauri 配置

见 [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json)。

关键点：

- `build.devUrl` 指向 `http://localhost:3020`
- `build.frontendDist` 指向 `../out`
- `beforeDevCommand` 使用 `npm run export:dev`
- `beforeBuildCommand` 使用 `npm run export`
- `app.withGlobalTauri` 为 `false`

这意味着前端不再依赖旧的 `window.__TAURI__` 全局注入方式，而是统一走模块化 API。

### 2. 前端 Tauri 桥接

见 [app/tauri.ts](../app/tauri.ts)。

当前桌面能力通过 `@tauri-apps/api` 和 v2 插件包统一暴露，包括：

- `invoke`
- `event.listen`
- 剪贴板
- 文件保存
- 文件写入
- 通知权限与通知发送
- 应用更新检查

运行时判断使用 `isTauri()`，避免 Web 环境误走桌面 API。

### 3. 桌面导出链路

见 [scripts/export-app.mjs](../scripts/export-app.mjs)。

因为桌面端当前采用 Next 静态导出，而仓库里仍存在 Route Handlers 和 Server Actions，直接 `next build` 用于 export 会冲突，所以导出脚本在构建期间会做两件事：

1. 临时隐藏所有 `app/**/route.ts`
2. 将 `app/tools/actions.ts` 暂时替换为 [app/tools/actions.export.ts](../app/tools/actions.export.ts)

构建结束后会自动恢复原文件。

这个处理只影响桌面导出链路，不影响 Web 开发与 Web 生产运行。

当前桌面端工具运行时是显式禁用状态：`actions.export.ts` 不会读取 `data/tool_config.json`，也不会启动 stdio 工具进程。后续如果要支持本地工具运行时，应使用 Tauri 用户数据目录保存本机配置，并单独设计权限提示、命令白名单和密钥存储，不复用 standalone 的部署目录配置文件。

### 4. 桌面打包链路

见 [scripts/tauri-build-app.mjs](../scripts/tauri-build-app.mjs)。

当前打包流程：

1. `npm run skill`
2. `npx tauri build --bundles app`
3. 在 macOS 上校验 `.app` 签名；本地构建会补 ad-hoc 签名，release 构建会用 Developer ID 重签 `.app`
4. release 构建会基于签名后的 `.app` 重建 `.app.tar.gz` 并重新生成 `.sig`
5. 在 macOS 上生成 `.dmg`
6. 校验 DMG；release 构建会签名、notarize、staple 并做 Gatekeeper 校验

这样做的原因是：Tauri 2.11 的 `--bundles app` 不再稳定提供旧的 `bundle_dmg.sh`，自定义收尾逻辑可以在本地和 CI 中稳定生成安装包。

正式发布模式下，脚本会临时生成一份仅用于本次构建的 Tauri 配置覆盖文件，通过 `--config` 合并：

- `bundle.createUpdaterArtifacts = true`
- 当前 release tag 对应的 `version`

这样可以把“本地构建”和“正式发版”分开，不需要手工修改仓库里的 [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json)。

## 本地开发

### Web 开发

```bash
npm run dev
```

访问：

- `http://localhost:3020`

### 桌面开发

```bash
npm run app:dev
```

说明：

- Tauri 会连接本地 `http://localhost:3020`
- 前端页面仍然是 Web 页面，只是运行容器改成桌面壳
- 桌面专用能力通过 `app/tauri.ts` 提供

## 桌面本地包依赖服务配置

桌面端本地包不是一套新的后端。它是一个静态 Tauri 前端，登录、模型调用和云端同步仍然依赖外部服务：

| 服务 | 本地常用地址 | 作用 |
| --- | --- | --- |
| Node / central UCAN | `http://127.0.0.1:8100` | 处理中心化登录、动态验证码、授权回调和 UCAN 换发 |
| Router | `http://127.0.0.1:3011` | 校验 Router audience/capability，并转发大模型调用 |
| Warehouse | `http://127.0.0.1:6065` | 校验 WebDAV audience/capability，保存同步快照和媒体文件 |
| Chat Desktop | `tauri://localhost` | 承载前端 UI；不是 API 服务 |

本地桌面包推荐 `.env` 配置：

```dotenv
ROUTER_BACKEND_URL=http://127.0.0.1:3011
WEBDAV_BACKEND_BASE_URL=http://127.0.0.1:6065
WEBDAV_BACKEND_PREFIX=/dav
WEBDAV_APP_ID=localhost-3020
CENTRAL_UCAN_AUTH_BASE_URL=http://127.0.0.1:8100
CENTRAL_UCAN_APP_ID=<Node 中发布的 Chat 应用 ID>
CENTRAL_UCAN_REDIRECT_URI=http://tauri.localhost/central-ucan-callback.html
UCAN_LOGIN_FORCE_MODE=auto
```

注意：

- 桌面包的前端公开配置会在 `npm run app:build` 时写入 `out/`，再进入 `.app`
- 修改 `.env` 后，已经打出的 `Chat.app` 不会自动读取新值，需要重新执行 `npm run app:build`
- `CENTRAL_UCAN_REDIRECT_URI` 必须和 Node 中 Chat 应用配置的 `redirectUri` 完全一致
- 桌面本地包的回调地址是 `http://tauri.localhost/central-ucan-callback.html`，不是 `http://127.0.0.1:8100`
- `WEBDAV_APP_ID=localhost-3020` 用来复用 web 版 `http://localhost:3020` 的云端同步目录；如果留空，桌面端会按 Tauri origin 推导出不同目录

Warehouse 本地 CORS 至少应允许桌面 origin 和本地 Web origin：

```yaml
cors:
  enabled: true
  credentials: true
  allowed_origins:
    - "tauri://localhost"
    - "http://tauri.localhost"
    - "http://127.0.0.1:3020"
    - "http://localhost:3020"
```

改完 Warehouse 配置后需要重启 Warehouse。可以用下面命令检查桌面 origin 是否已允许：

```bash
curl -i -sS -X OPTIONS 'http://127.0.0.1:6065/api/v1/public/webdav/quota' \
  -H 'Origin: tauri://localhost' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

期望至少看到：

- `Access-Control-Allow-Origin: tauri://localhost`
- `Access-Control-Allow-Headers` 包含 `Authorization, Content-Type, Depth, Destination, Overwrite`
- `Access-Control-Allow-Methods` 包含 `GET, POST, PUT, DELETE, OPTIONS, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE`

## 本地打包

### 生成桌面应用

```bash
npm run app:build
```

当前在 macOS 上已验证成功。

构建产物：

- `.app`：
  - [src-tauri/target/release/bundle/macos/Chat.app](../src-tauri/target/release/bundle/macos/Chat.app)
- `.dmg`：
  - `src-tauri/target/release/bundle/macos/Chat_<version>_<arch>.dmg`

说明：

- 产物文件名由 `productName`、`version` 和当前架构决定
- Apple Silicon 下当前文件名后缀是 `aarch64`
- 再次构建时会覆盖同名 `.dmg`
- 该命令默认不生成 updater 签名产物
- 本地 macOS 产物使用 ad-hoc 签名兜底，可用于本机验证；公开分发必须使用 `app:build:release`

### 本地包验证流程

打包后可以先直接验证 `.app`：

```bash
open src-tauri/target/release/bundle/macos/Chat.app
```

推荐按下面顺序验收：

1. 用固定钱包地址登录，例如 `0x...`
2. 如果启用了动态验证码，使用当前绑定的 Authenticator 生成 TOTP
3. 登录成功后确认能拿到 Router 令牌，并能正常调用大模型
4. 打开发现页，进入云端存储
5. 点击“检查连接”，确认 WebDAV / Warehouse 连通
6. 点击“立即同步”，确认同步任务成功
7. 回到聊天首页，确认左侧会话列表可以从云端恢复

如果“检查连接”和“立即同步”都成功，但左侧会话仍为空，优先检查两点：

- `WEBDAV_APP_ID` 是否和网页版使用的应用空间一致，例如本地 web 版通常是 `localhost-3020`
- 当前登录模式是否是中心化 UCAN；中心化模式下不应再因为 `hasConnectedWallet=false` 隐藏会话列表

### 生成正式发布产物

```bash
npm run app:build:release
```

该命令用于正式发布，和 `app:build` 的区别是：

- 临时开启 `bundle.createUpdaterArtifacts`
- 强校验 updater 签名环境变量
- macOS 下强校验 Apple Developer ID 签名和 notarization 环境变量
- 用于生成可进入自动更新分发链路的产物

要求存在以下环境变量之一：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PATH`

并且还需要：

- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

macOS release 还要求：

- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

CI 中还需要 `APPLE_CERTIFICATE` 和 `APPLE_CERTIFICATE_PASSWORD`，用于把 Developer ID 证书导入 runner keychain。

## 环境要求

当前已验证环境：

- macOS 15.4.1
- Node `24.13.0`
- npm `11.6.2`
- Rust `1.97.1`

### Tauri / Rust 版本策略

当前仓库使用 **Tauri v2.11**：

- JS 侧 `@tauri-apps/cli` 为 `2.11.3`
- Rust 侧 `tauri` 当前解析到 `2.11.5`
- CI 使用 Rust stable，避免再次被固定旧 Rust 工具链卡住

## 已知限制

### 1. 桌面端是静态导出产物

这意味着桌面构建不能直接依赖 Next Route Handlers 或 Server Actions。

当前已经通过导出脚本规避，但结论仍然成立：

- 桌面端要尽量依赖前端运行时能力和 Tauri 原生能力
- 任何新的服务端路由能力，如果桌面也要用，需要单独设计替代方案

### 2. 本地 DMG 是“可安装优先”的朴素版

当前本地 DMG 生成优先保证稳定产出，因此：

- 可以稳定生成并安装
- 不再执行 Finder AppleScript 布局
- 不保证有自定义背景、图标摆位和窗口美化
- 不经过 Apple notarization，不能作为公开分发包

正式 release 构建会对 DMG 做 Developer ID 签名、notarization、staple 和 Gatekeeper 校验。

### 3. 本地构建默认关闭 updater 签名产物

见 [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json)：

- `bundle.createUpdaterArtifacts = false`

原因：

- 本地构建环境未提供 `TAURI_SIGNING_PRIVATE_KEY`
- 若开启 updater 产物生成，会在打包阶段因为缺少私钥而失败

这不会影响本地 `.app` / `.dmg` 生成，但意味着当前 `app:build` 不产出可直接用于自动更新分发的签名更新元数据。

## Updater 密钥管理

### 密钥从哪里来

`TAURI_SIGNING_PRIVATE_KEY` 不是第三方平台下发的，而是项目自己生成的一把 updater 私钥。

建议使用较新的 Tauri CLI 生成，并设置非空密码：

```bash
npx tauri signer generate -w ~/.tauri/chat-updater.key -p
```

说明：

- `~/.tauri/chat-updater.key` 是私钥文件
- 生成时会输出对应公钥
- 公钥写入 [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json) 的 `plugins.updater.pubkey`
- 私钥不能提交到仓库

### 为什么建议用较新的 CLI 生成

当前仓库锁定的是 `@tauri-apps/cli 2.11.3`。

Tauri 官方在 `2.10.1` 的 release note 中说明，`2.9.3` 到 `2.10.0` 之间生成的“空密码私钥”存在问题。因此：

- 生成密钥时必须设置非空密码
- 使用仓库当前锁定的 `2.11.3` CLI 生成即可，不要回退到有问题的旧 CLI

### 公钥如何落仓库

将生成出来的公钥写入：

- [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json)

对应字段：

- `plugins.updater.pubkey`

公钥可以提交到仓库。

### 私钥如何保存

建议分两层保存：

1. 团队主副本
   - 存在 1Password / Bitwarden / Vault / 云密钥管理服务
2. 发布环境副本
   - CI Secret
   - 受控发布机上的 `~/.tauri/chat-updater.key`

必须同时保管好：

- 私钥文件或私钥内容
- 私钥密码

如果私钥丢失，就无法给已经发布出去的桌面客户端继续走同一条 updater 更新链。

### 本地如何注入

如果使用私钥内容：

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/chat-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your-password"
npm run app:build:release
```

如果使用私钥文件路径：

```bash
export TAURI_SIGNING_PRIVATE_KEY_PATH="$HOME/.tauri/chat-updater.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your-password"
npm run app:build:release
```

当前发布脚本支持两种方式，满足其一即可：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PATH`

但 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 必须存在。

### CI 如何注入

推荐在 CI Secret 中保存：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

`TAURI_SIGNING_PRIVATE_KEY` 必须只保存生成出来的私钥字符串本身，例如：

```bash
cat ~/.tauri/chat-updater.key
```

不要包含以下内容：

- `TAURI_SIGNING_PRIVATE_KEY=` 或 `export TAURI_SIGNING_PRIVATE_KEY=...`
- `#` 注释或任何说明文字
- `Private:` / `Public:` 等命令输出标签
- 公钥内容或对私钥文件再次执行 base64 后的内容

如果 CI 报 `failed to decode base64 key: Invalid symbol 35`，其中 `35` 是 `#` 的字符码，通常表示 GitHub Secret 里在私钥字符串后面混入了 `#...` 注释。

发布任务中注入环境变量后，再执行：

```bash
npm run app:build:release
```

如果 CI 不方便直接注入私钥内容，也可以先写入临时文件，再设置 `TAURI_SIGNING_PRIVATE_KEY_PATH`。

### 当前 GitHub Actions 约定

见工作流：

- [.github/workflows/app.yml](../.github/workflows/app.yml)

当前 GitHub Actions 已拆成三条桌面链路：

- macOS：正式发布链路
- Windows：构建验证链路
- Ubuntu：构建验证链路

具体约定如下：

- `workflow_dispatch`
  - 运行 macOS 正式发布构建
  - 运行 Windows 构建验证
  - 运行 Ubuntu 构建验证
  - 上传 workflow artifacts
- `release.published`
  - 运行 macOS 正式发布构建
  - 运行 Windows 构建验证
  - 运行 Ubuntu 构建验证
  - 生成 macOS `latest.json`
  - 上传 macOS release assets

版本约定：

- `release.published` 时，GitHub release tag 会作为桌面构建版本
- `scripts/tauri-build-app.mjs` 会将该版本写入临时 Tauri 配置，不需要手工修改仓库里的 `src-tauri/tauri.conf.json`
- `scripts/generate-updater-manifest.mjs` 生成的 `latest.json` 使用 release tag 作为 updater 版本
- 本地临时验证可显式设置 `BUILD_VERSION=v<major>.<minor>.<patch>`

当前 CI 至少需要配置以下 secrets：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

其中 `APPLE_CERTIFICATE` 是 Developer ID Application 证书的 base64 p12 内容，`APPLE_SIGNING_IDENTITY` 是对应的签名身份名称。

macOS CI 上传的关键产物包括：

- 已签名并 notarized 的 `.dmg`
- 基于 Developer ID 签名后 `.app` 重建的 `.app.tar.gz`
- `.app.tar.gz.sig`
- `latest.json`

其中 `latest.json` 由 [scripts/generate-updater-manifest.mjs](../scripts/generate-updater-manifest.mjs) 生成，供 updater 静态分发使用。CI 还会对 `.app` 做 `codesign --verify`，对 DMG 做 `hdiutil verify` 和 `spctl` 校验。

Windows 验证链路当前上传的产物包括：

- `chat.exe`
- Tauri 在 `bundle/` 下生成的 Windows 安装包或可执行产物
- 对应签名产物（若生成）

当前 Windows 仍属于“构建验证”，还没有接入正式 release asset 分发、代码签名和 Windows updater 发布说明。

Ubuntu 验证链路当前上传的产物包括：

- `chat`
- Tauri 在 `bundle/` 下生成的 `.deb`
- Tauri 在 `bundle/` 下生成的 `.AppImage`
- 对应签名产物（若生成）

当前 Ubuntu 的目标策略已经收敛为：

- `.deb`：Ubuntu 安装分发
- `.AppImage`：Linux updater 相关产物

但 Ubuntu 仍属于“构建验证”，还没有接入正式 release asset 分发和 Ubuntu updater 发布说明。

## 发布建议

### 本地测试发布

适合当前阶段：

1. 执行 `npm run app:build`
2. 使用生成的 `.app` 做本机自测
3. 使用生成的 `.dmg` 做分发安装测试

### 正式发布前需要补的能力

macOS 主链已经具备 release 构建、updater manifest、DMG 签名、公证和 release asset 上传流程。继续进入全平台正式发布前，建议补以下内容：

1. Windows 代码签名和正式 release asset 上传
2. Ubuntu `.deb` / `.AppImage` 正式 release asset 上传
3. Windows / Linux updater manifest 合并发布
4. 发布产物命名、归档和校验流程
5. release 后安装与自动更新冒烟测试清单

## 故障排查

### `next build` 在 export 模式报 `reading 'tap'`

已知根因是 export 模式下启用了 chunk 限制插件。

当前修正：

- [next.config.mjs](../next.config.mjs) 中只在显式设置 `DISABLE_CHUNK` 时启用相关插件

如果这个报错再次出现，先检查是否有人恢复了“export 模式默认禁 chunk”的旧逻辑。

### `tauri build` 卡在 DMG 阶段

已知原因是 macOS Finder AppleScript 布局流程不稳定，以及 Tauri 2.11 的 `--bundles app` 不再保证生成旧的 `bundle_dmg.sh`。

当前修正：

- `app:build` 不直接依赖默认 DMG bundling
- 优先使用旧 `bundle_dmg.sh`；不存在时用 `ditto` staging + `hdiutil create` 生成 DMG

### 构建时提示 updater 签名缺失

先检查：

- 当前执行的是不是 `npm run app:build:release`
- 当前环境是否注入了 `TAURI_SIGNING_PRIVATE_KEY` 或 `TAURI_SIGNING_PRIVATE_KEY_PATH`
- 当前环境是否注入了 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

本地构建若不做自动更新发布，继续使用 `npm run app:build` 即可。

### 登录回调地址错误

如果中心化登录后提示回调失败，或“返回应用 / 重新发起”没有反应，优先检查：

- `.env` 中 `CENTRAL_UCAN_REDIRECT_URI` 是否为 `http://tauri.localhost/central-ucan-callback.html`
- Node 中 Chat 应用配置的 `redirectUri` 是否和它完全一致
- 修改 `.env` 后是否重新执行了 `npm run app:build`
- 当前打开的是否是重新打包后的 `Chat.app`

`CENTRAL_UCAN_AUTH_BASE_URL=http://127.0.0.1:8100` 是认证服务地址，不能当成桌面回调地址使用。

### 动态验证码失败

动态验证码失败通常和桌面包本身无关，先检查：

- Authenticator 中是否绑定了当前 Node 里这个账户的 TOTP secret
- 验证码是否已经过期，TOTP 通常只有很短的有效窗口
- Node 重启后，TOTP master key 和数据库中的 TOTP 数据是否仍然匹配
- 是否在旧授权请求页面里输入了新验证码，必要时重新发起登录

正常情况下，单纯重启 Node 不应该让已绑定的 TOTP 失效；如果重启后必须重新扫码，优先检查 Node 的 `totpMasterKey` 或存储数据是否发生变化。

### 云端存储异常

发现页里的云端存储如果显示异常，先按顺序检查：

1. Warehouse 是否已经启动，并监听 `WEBDAV_BACKEND_BASE_URL`
2. `.env` 中 `WEBDAV_BACKEND_BASE_URL` 和 `WEBDAV_BACKEND_PREFIX` 是否指向同一套 Warehouse
3. Warehouse CORS 是否允许 `tauri://localhost`
4. 修改 Chat `.env` 后是否重新执行 `npm run app:build`
5. 修改 Warehouse 配置后是否重启 Warehouse

如果 `curl` 直连 Warehouse 成功，但桌面应用里失败，重点看 CORS。桌面端发出的请求 origin 是 `tauri://localhost`。

### 云端存储正常但会话列表为空

这种情况通常不是 Router 问题。Router 令牌正常只说明模型调用链路可用，不代表 WebDAV 同步目录一定和网页版一致。

优先检查：

1. `WEBDAV_APP_ID` 是否固定为网页版同一个应用空间，例如 `localhost-3020`
2. Warehouse 中是否确实存在 `/apps/<WEBDAV_APP_ID>` 下的同步数据
3. 登录地址是否和网页版使用的是同一个账户地址
4. 当前打包产物是否包含中心化 UCAN 模式下不依赖钱包连接状态显示会话列表的修复

如果 `WEBDAV_APP_ID` 留空，桌面端会按 Tauri origin 推导应用空间，表现上就是云端存储可连接、立即同步也能成功，但读到的是另一个空目录。

## 后续维护原则

后续所有桌面端改动，优先遵守这几条：

- 不破坏 `npm run dev`
- 不破坏 `npm run build && npm run start`
- 不恢复 Tauri v1 兼容逻辑
- 不重新引入 `window.__TAURI__` 全局依赖
- 桌面专用逻辑优先集中在 `app/tauri.ts` 和 `scripts/` 下收口

如果要继续演进，下一阶段最合理的方向是：

1. 把 Windows / Ubuntu 从验证链路提升为 release asset 链路
2. 生成跨平台 updater manifest
3. 增加 release 后安装和自动更新冒烟测试脚本
