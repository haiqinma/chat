# 项目名称

Chat（UCAN 定制版）

# 项目简介

一款 AI 聊天工具，包含 UCAN/钱包鉴权与 Router/WebDAV 代理。

# 功能特性

- 与多家大模型聊天（OpenAI/Gemini/Anthropic 等）
- UCAN + 钱包登录（可选）
- Router/WebDAV 代理转发

# 文档索引

- 用户手册（中文）：`docs/user-manual-cn.md`
- User Manual (EN)：`docs/user-manual-en.md`
- FAQ（中文）：`docs/faq-cn.md`
- FAQ (EN)：`docs/faq-en.md`
- Cloudflare Pages（中文）：`docs/cloudflare-pages-cn.md`
- Cloudflare Pages (EN)：`docs/cloudflare-pages-en.md`
- 同步聊天记录（中文）：`docs/synchronise-chat-logs-cn.md`
- Sync Chat Logs (EN)：`docs/synchronise-chat-logs-en.md`
- 架构 / 部署 / 安全（中文）：`docs/architecture-cn.md`
- Architecture / Deployment / Security (EN)：`docs/architecture-en.md`
- Router/WebDAV 集成（中文）：`docs/router-webdav-integration-cn.md`
- Router/WebDAV Integration (EN)：`docs/router-webdav-integration-en.md`
- WebDAV 同步方案（中文）：`docs/webdav-sync-plan-cn.md`
- WebDAV Sync Plan (EN)：`docs/webdav-sync-plan-en.md`
- 部署（中文，Vercel）：`docs/vercel-cn.md`
- Translation Guide (EN)：`docs/translation.md`

# 环境要求

- Node.js 18+（建议使用 LTS）
- npm（项目统一使用 npm 安装依赖与运行脚本）

# 本地开发

## 本地启动

```bash
cp .env.template .env
# 确保本地 router 地址指向 3011（示例）
# ROUTER_BACKEND_URL=http://localhost:3011/
# 如使用 WebDAV 代理，请设置 WEBDAV_BACKEND_BASE_URL（仅填基础地址，不含路径）
npm install
npm run dev
```

默认端口：`3020`

## 测试机器启动

```bash
bash scripts/start-all.sh
```

# 生产部署

## 部署前准备

1) **统一使用 npm 安装依赖**。
2) 配置环境变量（`.env`）：
   - `ROUTER_BACKEND_URL`：router 鉴权后端地址  
   - `WEBDAV_BACKEND_BASE_URL`：WebDAV 后端基础地址（**不设会导致 build 失败**，不含路径）
   - `WEBDAV_BACKEND_PREFIX`：WebDAV 路径前缀（默认 `/dav`，可选修改）

## 部署步骤（standalone）

```bash
npm install
npm run build
nohup npm start > /home/ubuntu/code/chat_UCAN/next-start.log 2>&1 &
```

默认端口：`3020`

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

# 贡献指南

欢迎提交 issue 与 PR。
