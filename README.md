# 项目名称

Chat（UCAN 定制版）

# 项目简介

一款 AI 聊天工具，包含 UCAN/钱包鉴权与 Router/WebDAV 代理。

# 功能特性

- 与多家大模型聊天（OpenAI/Gemini/Anthropic/Volcengine 等）
- UCAN + 钱包登录（可选）
- Router/WebDAV 代理转发

# 文档索引

- 用户使用手册：`docs/用户使用手册.md`
- 常见问题：`docs/常见问题.md`
- 架构 / 部署 / 安全清单：`docs/架构部署安全清单.md`
- 运行时配置与发包：`docs/运行时配置与发包.md`
- 模型端点选择与支持机制：`docs/模型端点选择与支持机制.md`
- 容器与布局样式方案：`docs/容器与布局样式方案.md`
- 用户登录方案：`docs/用户登录方案.md`
- 数据同步：`docs/数据同步方案.md`
- Cloudflare Pages 部署指南：`docs/CloudflarePages部署指南.md`
- Vercel 使用说明：`docs/Vercel使用说明.md`
- 文生图与上传图片聊天工作流实现说明：`docs/文生图与上传图片聊天工作流实现说明.md`
- MCP 启用机制与演进：`docs/MCP启用机制与演进.md`
- 新增翻译指南：`docs/新增翻译指南.md`

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

1) **统一使用 npm 安装依赖**。
2) 配置运行期环境变量（`.env`）：
   - `ROUTER_BACKEND_URL`：router 鉴权后端地址  
   - `CENTRAL_UCAN_APP_ID`：中心化 UCAN 应用 AppId（在 Node 应用市场发布后获得）
   - `UCAN_LOGIN_FORCE_MODE`：登录路径强制模式（`auto`/`wallet`/`central`，默认 `auto`）
   - `WEBDAV_BACKEND_BASE_URL`：WebDAV 后端基础地址（按需配置，不含路径）
   - `WEBDAV_BACKEND_PREFIX`：WebDAV 路径前缀（默认 `/dav`，可选修改）
   - 以及你实际使用的 provider 配置（如 OpenAI / Gemini / Anthropic / Volcengine 等）
3) 如需调整构建细节变量，配置 `.env.build`：
   - `DISABLE_CHUNK`
   - Tauri 签名相关变量

## 推荐发包方式（standalone）

推荐直接使用仓库脚本生成 standalone 部署包：

```bash
cp .env.template .env
cp .env.build.template .env.build
bash scripts/package.sh standalone
```

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
ss -ltnp | rg -n ":3020"
curl -s -o /dev/null -w "http=%{http_code} time=%{time_total}\n" http://127.0.0.1:3020/
```

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

# MCP

如需启用 MCP：

1. 在 `.env` 中设置 `ENABLE_MCP=1`
2. 确保运行环境允许启动外部命令
3. 确保服务进程对 `app/mcp/mcp_config.json` 可读写

更完整的说明见：`docs/MCP启用机制与演进.md`

# 贡献指南

欢迎提交 issue 与 PR。
