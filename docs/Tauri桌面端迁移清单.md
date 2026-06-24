# Tauri 桌面端打包发布说明

本文档只覆盖桌面端开发、打包和本地发布链路，不替换现有 Web 开发和 Web 生产部署方式。

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

1. `npm run mask`
2. `npx tauri build --bundles app`
3. 在 macOS 上调用 Tauri 生成的 `bundle_dmg.sh`
4. 手动生成 `.dmg`
5. 清理 `rw.*.dmg` 临时镜像文件

这样做的原因是：默认的 Tauri DMG 流程在本机环境下会卡在 Finder AppleScript 美化阶段，自定义收尾脚本可以稳定完成构建。

正式发布模式下，脚本会临时生成一份仅用于本次构建的 Tauri 配置覆盖文件，通过 `--config` 合并：

- `bundle.createUpdaterArtifacts = true`

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
  - [src-tauri/target/release/bundle/macos/Chat_2.16.1_aarch64.dmg](../src-tauri/target/release/bundle/macos/Chat_2.16.1_aarch64.dmg)

说明：

- 产物文件名由 `productName`、`version` 和当前架构决定
- Apple Silicon 下当前文件名后缀是 `aarch64`
- 再次构建时会覆盖同名 `.dmg`
- 该命令默认不生成 updater 签名产物

### 生成正式发布产物

```bash
npm run app:build:release
```

该命令用于正式发布，和 `app:build` 的区别是：

- 临时开启 `bundle.createUpdaterArtifacts`
- 强校验签名环境变量
- 用于生成可进入自动更新分发链路的产物

要求存在以下环境变量之一：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PATH`

并且还需要：

- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

## 环境要求

当前已验证环境：

- macOS 15.4.1
- Node `24.13.0`
- npm `11.6.2`
- Rust `1.86.0`

### Tauri / Rust 版本策略

当前仓库使用 **Tauri v2.9** 这一条兼容线，而不是更高的 v2.11+。

原因：

- 更高版本的 Tauri 依赖链会要求 Rust `1.88+`
- 当前本地环境是 Rust `1.86.0`
- 为了保持“只用 V2、不兼容 V1”同时又让现有机器可构建，当前版本固定在 v2.9 系列

如果后续升级 Rust 工具链，可以再评估是否整体升到更高的 Tauri v2 次版本。

## 已知限制

### 1. 桌面端是静态导出产物

这意味着桌面构建不能直接依赖 Next Route Handlers 或 Server Actions。

当前已经通过导出脚本规避，但结论仍然成立：

- 桌面端要尽量依赖前端运行时能力和 Tauri 原生能力
- 任何新的服务端路由能力，如果桌面也要用，需要单独设计替代方案

### 2. DMG 是“可安装优先”的朴素版

当前 DMG 生成时使用了 `--skip-jenkins`，因此：

- 可以稳定生成并安装
- 不再执行 Finder AppleScript 布局
- 不保证有自定义背景、图标摆位和窗口美化

这是一个稳定性优先的取舍。

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
npx @tauri-apps/cli@2.10.1 signer generate -w ~/.tauri/chat-updater.key -p
```

说明：

- `~/.tauri/chat-updater.key` 是私钥文件
- 生成时会输出对应公钥
- 公钥写入 [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json) 的 `plugins.updater.pubkey`
- 私钥不能提交到仓库

### 为什么建议用较新的 CLI 生成

当前仓库锁定的是 `@tauri-apps/cli 2.9.6`。

Tauri 官方在 `2.10.1` 的 release note 中说明，`2.9.3` 到 `2.10.0` 之间生成的“空密码私钥”存在问题。因此：

- 生成密钥时建议设置非空密码
- 更稳妥的做法是直接用 `2.10.1+` 的 CLI 生成

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

当前 CI 至少需要配置以下 secrets：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

如果要继续接入 macOS 签名和 notarization，再额外配置：

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

macOS CI 上传的关键产物包括：

- `.dmg`
- `.app.tar.gz`
- `.app.tar.gz.sig`
- `latest.json`

其中 `latest.json` 由 [scripts/generate-updater-manifest.mjs](../scripts/generate-updater-manifest.mjs) 生成，供 updater 静态分发使用。

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

如果后续要进入正式桌面发布流程，建议补以下内容：

1. macOS 签名与 notarization
2. Windows 签名
3. Ubuntu `.deb` / `.AppImage` 产物的实际 CI 验证
4. updater 私钥注入与 `latest.json` 产物发布
5. CI 中按平台拆分构建任务
6. 发布产物命名、归档和校验流程

## 故障排查

### `next build` 在 export 模式报 `reading 'tap'`

已知根因是 export 模式下启用了 chunk 限制插件。

当前修正：

- [next.config.mjs](../next.config.mjs) 中只在显式设置 `DISABLE_CHUNK` 时启用相关插件

如果这个报错再次出现，先检查是否有人恢复了“export 模式默认禁 chunk”的旧逻辑。

### `tauri build` 卡在 DMG 阶段

已知原因是 macOS Finder AppleScript 布局流程不稳定。

当前修正：

- `app:build` 不直接依赖默认 DMG bundling
- 改为先生成 `.app`，再手动调用 `bundle_dmg.sh --skip-jenkins`

### 构建时提示 updater 签名缺失

先检查：

- 当前执行的是不是 `npm run app:build:release`
- 当前环境是否注入了 `TAURI_SIGNING_PRIVATE_KEY` 或 `TAURI_SIGNING_PRIVATE_KEY_PATH`
- 当前环境是否注入了 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

本地构建若不做自动更新发布，继续使用 `npm run app:build` 即可。

## 后续维护原则

后续所有桌面端改动，优先遵守这几条：

- 不破坏 `npm run dev`
- 不破坏 `npm run build && npm run start`
- 不恢复 Tauri v1 兼容逻辑
- 不重新引入 `window.__TAURI__` 全局依赖
- 桌面专用逻辑优先集中在 `app/tauri.ts` 和 `scripts/` 下收口

如果要继续演进，下一阶段最合理的方向是：

1. 补桌面发版脚本拆分，比如 `app:build:app` / `app:build:dmg`
2. 接 CI 构建
3. 接签名和自动更新
