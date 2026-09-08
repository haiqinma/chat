# scripts 目录脚本说明

本文档说明 `scripts/` 目录下脚本、配置模板和辅助文件的主要用途，便于开发、打包、部署和运维时快速定位入口。

## 开发与本地调试

| 文件 | 用途 |
| --- | --- |
| `dev-marketplace.sh` | 启动本地 marketplace 预览服务，并将 Chat 的 marketplace 数据源环境变量指向本地服务；通常通过 `npm run dev:marketplace` 调用。 |
| `serve-marketplace.mjs` | 提供一个带 CORS 响应头的静态文件服务，用于本地预览相邻 `marketplace` 仓库中的包清单和资源文件。 |
| `sync-marketplace-snapshot.sh` | 将相邻 `marketplace` 仓库中的 `packages.json` 和 `tools/packages.json` 同步到 `public/marketplace`，作为内置兜底快照。 |
| `init-proxy.sh` | 根据 `/etc/resolv.conf` 中的 nameserver 生成 `scripts/proxychains.conf`，用于代理本地开发请求。 |
| `proxychains.template.conf` | `init-proxy.sh` 使用的 proxychains 配置模板。 |

## 构建与发包

| 文件 | 用途 |
| --- | --- |
| `package.sh` | 统一打包入口，支持 `standalone`、`export`、`app`、`app-release` 等模式；负责加载环境变量、执行构建、整理产物并输出到 `output/` 或指定目录。 |
| `export-app.mjs` | 静态导出构建辅助脚本，会临时禁用 Next.js API route 并切换工具 actions 文件，完成 export 模式构建后恢复现场。 |
| `tauri-build-app.mjs` | Tauri 桌面端构建入口，读取 `.env` 和 `.env.build`，生成临时 Tauri 配置并执行桌面端构建；release 模式下处理 updater 相关配置。 |
| `generate-updater-manifest.mjs` | 根据 release tag、仓库地址和 Tauri updater 签名产物生成 `latest.json`，供桌面端自动更新使用。 |
| `fetch-prompts.mjs` | 从外部 prompt 数据源抓取中英文提示词，过滤不需要的内容后生成 `public/prompts.json`。 |

## 部署与运行

| 文件 | 用途 |
| --- | --- |
| `starter.sh` | standalone 部署包的服务启停脚本，支持 `start`、`stop`、`restart`；会加载部署目录下的 `.env` 并启动 `server.js`。 |
| `health-check.sh` | 服务健康检查脚本，支持 liveness、readiness、dependency、all 等检查级别，可输出文本或 JSON，供部署平台或运维脚本调用。 |
| `start-nginx.sh` | 本地或服务器上启动 nginx 的辅助脚本，会释放 80/443 端口、复制 nginx 配置并用指定配置启动 nginx。 |
| `http.conf` | nginx HTTP 配置文件。 |
| `https.conf` | nginx HTTPS 配置文件，当前 `start-nginx.sh` 会复制该文件作为 nginx 启动配置。 |

## 配置备份与升级

| 文件 | 用途 |
| --- | --- |
| `config_backup.sh` | 备份当前部署目录的 `.env`，并在存在时一起备份 `/etc/nginx/conf.d/chat.conf`、`/etc/nginx/conf.d/test-chat.conf`；产物会使用 GPG 加密后写入 `/opt/backup`。 |
| `copy-for-upgrade.sh` | 升级过程中将当前版本的配置复制到目标版本目录；目前会把与 `scripts` 同级的 `.env` 复制到目标目录并覆盖目标 `.env`，成功返回 `0`。 |
| `backup.conf.template` | `config_backup.sh` 的备份配置模板，用于控制是否启用配置备份、备份文件名前缀和后缀。 |
| `.passphrase-file.template` | `config_backup.sh` 使用的 GPG passphrase 文件模板，实际使用时应复制为 `.passphrase-file` 并填写加密口令。 |

## Git 与发布辅助

| 文件 | 用途 |
| --- | --- |
| `sync.sh` | Git 仓库同步脚本，用于同步 upstream 和当前分支，并按配置推送到 origin。 |
| `pr.sh` | GitHub PR 创建辅助脚本，支持检查 GitHub CLI、推送当前分支并创建 Pull Request。 |
| `delete-deployment-preview.sh` | 通过 Vercel API 按 `META_TAG` 筛选并删除对应 preview deployments，需要 `VERCEL_PROJECT_ID`、`VERCEL_ORG_ID`、`VERCEL_TOKEN` 等环境变量。 |

## 目录约定

- Shell 脚本通常可直接执行，新增脚本应使用明确的参数校验和非零错误返回码。
- `.mjs` 脚本通常由 `package.json` 中的 npm scripts 调用，也可以在满足依赖和环境变量后直接用 `node` 执行。
- 部署、备份和升级脚本依赖部署目录中的 `.env`，执行前应确认目标目录和权限正确。
- 生产相关脚本涉及 `/opt/logs`、`/opt/backup`、`/etc/nginx` 等系统路径时，调用方需要具备相应读写权限。
