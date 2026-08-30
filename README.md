# 项目名称

Chat（UCAN 定制版）

# 项目简介

一款 AI 聊天工具，包含 UCAN/钱包鉴权与 Router/WebDAV 代理。

# 功能特性

- 与多家大模型聊天（OpenAI/Gemini/Anthropic/Volcengine 等）
- UCAN + 钱包登录（可选）
- Router/WebDAV 代理转发

# 文档索引

完整文档索引和治理建议见：`docs/README.md`

高频入口：

- 用户使用手册：`docs/用户使用手册.md`
- 常见问题：`docs/常见问题.md`
- AI Native 能力分层架构：`docs/AI-Native能力分层架构.md`
- 运行时配置与发包：`docs/运行时配置与发包.md`
- Tauri 桌面端打包发布说明：`docs/Tauri桌面端迁移清单.md`
- Skill / Tool 运行机制：`docs/Chat Skill与Tool运行机制.md`

# 环境要求

- Node.js 18+（建议使用 LTS）
- npm（项目统一使用 npm 安装依赖与运行脚本）

# 本地开发

## 本地启动

```bash
cp .env.template .env
npm install
npm run dev
```

默认端口：`3020`

如需调整构建细节变量，例如 `DISABLE_CHUNK`，请使用：

```bash
cp .env.build.template .env.build
```

然后再执行对应构建或打包命令。

# 配置模型

当前仓库把配置分成两类文件：

- `.env.template` / `.env`
  - 运行期配置
  - 服务启动时读取
  - 修改后通常需要重启服务，前端公开配置还需要刷新页面
- `.env.build.template` / `.env.build`
  - 构建期配置
  - 用于控制构建细节，例如 `DISABLE_CHUNK`
  - 不再手工配置 `BUILD_MODE` / `BUILD_APP`

更完整的配置说明见：`docs/运行时配置与发包.md`

# 生产部署

## 部署前准备

1. **统一使用 npm 安装依赖**。
2. 配置运行期环境变量（`.env`）：
   - `ROUTER_BACKEND_URL`：router 鉴权后端地址
   - `ROUTER_PORTAL_URL`：Router 管理中心地址（可选，默认 `https://router.yeying.pub`）
   - `ROUTER_PORTAL_TOKEN_URL`：Router 令牌页地址（可选，默认继承 `ROUTER_PORTAL_URL`）
   - `ROUTER_PORTAL_RECHARGE_URL`：Router 充值页地址（可选，默认继承 `ROUTER_PORTAL_TOKEN_URL`）
   - `CENTRAL_UCAN_APP_ID`：中心化 UCAN 应用 AppId（在 Node 应用市场发布后获得）
   - `CENTRAL_UCAN_REDIRECT_URI`：中心化 UCAN 授权回调地址；Tauri 本地包通常是 `http://tauri.localhost/central-ucan-callback.html`
   - `UCAN_LOGIN_FORCE_MODE`：登录路径强制模式（`auto`/`wallet`/`central`，默认 `auto`）
   - `WEBDAV_BACKEND_BASE_URL`：WebDAV 后端基础地址（按需配置，不含路径）
   - `WEBDAV_BACKEND_PREFIX`：WebDAV 路径前缀（默认 `/dav`，可选修改）
   - `WEBDAV_APP_ID`：WebDAV/UCAN 应用空间 ID；桌面包如需复用本地 web 版数据，通常设置为 `localhost-3020`
   - 以及你实际使用的 provider 配置（如 OpenAI / Gemini / Anthropic / Volcengine 等）
3. 如需调整构建细节变量，配置 `.env.build`：
   - `DISABLE_CHUNK`
   - Tauri 签名相关变量

## 推荐发包方式（standalone）

推荐直接使用仓库脚本生成 standalone 部署包：

```bash
cp .env.template .env
cp .env.build.template .env.build
bash scripts/package.sh standalone
```

如果希望给环境保留可覆盖的默认打包模式，可以保留仓库里的 `build.mode.template` 作为示例，并在本地创建 `build.mode`。
`bash scripts/package.sh` 在未显式传入 `MODE` 时会优先读取 `build.mode`；如果该文件不存在，就直接使用默认值 `standalone`。
脚本执行时会先同步依赖：存在 `package-lock.json` 时运行 `npm ci`，否则运行 `npm install`。

默认会在仓库下的 `output/` 生成产物；如需指定输出目录：

```bash
bash scripts/package.sh standalone --output-dir ./dist
```

产物内会包含：

- `server.js`
- `.env.template`
- `.env.build.template`
- `scripts/starter.sh`
- Next standalone 运行依赖与静态资源

## 直接部署步骤（standalone）

```bash
cp .env.template .env
npm install
npm run build
PORT=3020 npm run start
```

默认端口：`3020`

更推荐使用打包产物内的启动脚本：

```bash
bash scripts/starter.sh start
```

## 反代配置（如需公网）

将 Nginx 反代指向 `127.0.0.1:3020`。  
若使用仓库脚本：`scripts/start-nginx.sh`（会复制 `scripts/https.conf`）。

## 健康检查

```bash
scripts/health-check.sh
scripts/health-check.sh --level liveness
scripts/health-check.sh --level all --base-url http://127.0.0.1:3020
scripts/health-check.sh --level readiness --format json
```

默认无参数等同于 `--level readiness`，服务地址默认读取 `HEALTH_BASE_URL`，未设置时使用 `http://127.0.0.1:${PORT:-3020}`。

- `liveness`：检查 `.chat.pid` / 本地监听进程，必要时回退到 HTTP 根路径。
- `readiness`：在存活检查基础上检查 `GET /` 和 `GET /health/ready`。
- `dependency`：检查 `ROUTER_BACKEND_URL` 与 `WEBDAV_BACKEND_BASE_URL`；未配置时标记 `SKIP`，配置后不可达标记 `FAIL`。
- `all`：按 `liveness -> readiness -> dependency` 顺序执行完整检查。

常用参数：`--timeout <seconds>`、`--retries <count>`、`--interval <seconds>`、`--wait <seconds>`、`--config <path>`、`--format text|json`、`--quiet`。

验证静态资源缓存（生产应为长缓存）：

```bash
curl -I -k https://<你的域名>/_next/static/chunks/webpack-*.js | sed -n '1,15p'
```

# 打包模式

当前 `scripts/package.sh` 支持以下模式：

- `standalone`：Node 服务部署包
- `export`：静态导出包
- `app`：桌面端构建产物包
- `app-release`：桌面端 updater release 产物包

示例：

```bash
bash scripts/package.sh standalone
bash scripts/package.sh export v1.2.3
bash scripts/package.sh app
bash scripts/package.sh app-release
```

# 桌面本地包快速验证

本地桌面包依赖 Node / Router / Warehouse 三个外部服务，不是离线后端。常用本地配置如下：

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

修改这些前端公开配置后，需要重新打包桌面应用：

```bash
npm run app:build
open src-tauri/target/release/bundle/macos/Chat.app
```

本地验证顺序：

1. 登录后确认能拿到 Router 令牌，并能正常调用大模型。
2. 进入发现页的云端存储，点击“检查连接”和“立即同步”。
3. 回到聊天首页，确认左侧会话列表能从 Warehouse/WebDAV 恢复。

如果云端存储正常但会话列表为空，优先检查 `WEBDAV_APP_ID` 是否和网页版同一个应用空间一致，例如 `localhost-3020`。如果桌面端 WebDAV 请求失败，优先确认 Warehouse CORS 是否允许 `tauri://localhost`。

完整说明见：`docs/Tauri桌面端迁移清单.md`

# 工具

工具层当前只适用于 `standalone` 部署或本地 `npm run dev` 这种有 Next Node 进程的运行方式，底层主要通过 MCP 协议承载。Tauri 桌面端当前走静态导出，构建时会使用禁用版 tool actions，不读取 `data/tool_config.json`。

standalone 如需启用工具能力：

1. 在 `.env` 中设置 `ENABLE_TOOLS=1`
2. 确保运行环境允许启动外部命令
3. 确保服务进程对 `data/tool_config.json` 可读写

`marketplace` 仓库管理 Tool/Skill 的可发现定义，例如名称、描述、启动命令和配置项 schema。standalone 当前实例的工具启用状态、用户自带 Key 和运行时参数写入 `data/tool_config.json`，也可以通过 `TOOL_CONFIG_PATH` 指定自定义路径。真实 Key 不应放进源码目录或 marketplace 数据。

更完整的说明见：

- `docs/Chat Skill与Tool运行机制.md`
- `docs/工具启用机制与演进.md`

# 贡献指南

欢迎提交 issue 与 PR。
