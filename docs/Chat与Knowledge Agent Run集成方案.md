# Chat 与 Knowledge Agent Run 集成方案

状态：设计阶段  
版本：v2  
日期：2026-08-01

## 1. 决策

Chat 不直接实现 Agent Run，也不直接调用 Warehouse 的 Agent API。

Chat 负责：

- 用户交互和技能入口。
- 模型调用和流式输出。
- 工具调用生命周期。
- 选择哪些文件、检索结果和产物属于本次任务。

Knowledge 负责：

- `AgentRun` 生命周期。
- `ServicePrincipal` 认证。
- Context 引用和 ServiceGrant 校验。
- Artifact 元数据和 provenance。
- manifest 生成、同步和重试。
- 通过 Warehouse Gateway 保存文件和 manifest。

Warehouse 负责：

- 文件/对象内容。
- WebDAV/S3、上传、checksum、权限、配额和复制。

调用关系：

```text
Chat -> Knowledge Agent Run API -> Knowledge ServicePrincipal
                                  -> Knowledge Warehouse Gateway
                                  -> Warehouse
```

Chat 不保存 Warehouse 凭证，不保存 Knowledge service key，也不把这些密钥发给浏览器。

## 2. 验证范围

首个验证场景固定为 Chat 的多文件研究与报告生成技能。普通闲聊、图片生成、实时语音和历史会话迁移不接入 run。

验证内容：

- 创建一次 run。
- 记录输入文件引用。
- 关联 Knowledge service search 产生的 retrieval log。
- 记录实际使用的 context。
- 上传最终报告 artifact。
- 完成或失败 run。
- 在 Knowledge 管理侧查看 run 和 provenance。

不在首轮做：

- Chat 全量会话迁移。
- 将所有消息复制到 Knowledge。
- Chat 直接访问 Warehouse `/services`。
- MCP server 产品化。
- 向量搜索或长期 memory 重构。

## 3. 重要前置限制：用户身份

当前 Chat 的 Next 服务端主要处理 access code、模型 API key 和代理请求，浏览器侧保存 UCAN/中心化授权；服务端没有一个可以稳定映射到 Knowledge `wallet_address` 的通用用户会话。

因此分两阶段：

### P0：单一服务身份内部验证

部署一个 Knowledge `ServicePrincipal`，例如：

```text
service_id = community-chat-research
```

Chat standalone 服务端通过环境变量使用：

```text
KNOWLEDGE_BASE_URL=https://knowledge.example.com
KNOWLEDGE_SERVICE_API_KEY=svc_...
KNOWLEDGE_RESEARCH_SKILL_ID=...
```

所有 P0 run 归属这个社区服务身份的 owner，适合内部测试和验证产品闭环，不代表最终多用户归属模型。

### P1：多用户生产接入

需要增加一种明确的用户授权方式，三选一后才能上线：

1. Chat 建立自己的服务端用户会话，并映射到 Knowledge wallet。
2. Chat 将用户的 Knowledge JWT/授权票据安全转发给 Knowledge，由 Knowledge 交换短期 delegated run token。
3. Knowledge 为每个用户签发短期、限制 run/project 的 delegated token。

不能让浏览器携带全局 service key，也不能根据 Chat session id 猜测 wallet。P0 代码和 API 设计必须为 P1 保留 `owner` 和 delegation 字段，但不能伪造它们。

## 4. 研究技能识别

Chat 只通过稳定技能 ID 判断是否开启 run，不使用中文名称、英文名称或 UI 文案。

配置：

```text
KNOWLEDGE_RESEARCH_SKILL_ID=<稳定技能ID>
```

启动时校验该技能是否存在；配置缺失或技能不存在时，普通 Chat 继续工作，但研究 run 集成关闭并记录一次配置错误。

技能必须显式声明：

- 需要文件输入。
- 允许知识检索。
- 允许 artifact 输出。
- run 失败时的用户提示策略。

## 5. Run 生命周期

```text
not_started
  -> creating
  -> running
  -> completed

creating/running -> failed
creating/running -> cancelled
```

Chat 本地只保存 `runId` 和同步状态，不复制 Knowledge 的完整 run 对象。

### 5.1 创建

用户发送研究技能的第一条任务消息后，Chat 服务端调用：

```http
POST /service/runs
X-Service-Api-Key: <server-only-key>
Content-Type: application/json

{
  "session_id": "<chat-session-id>",
  "external_id": "<chat-session-id>:<user-message-id>",
  "run_type": "research",
  "inputs": [],
  "metadata": {
    "skill_id": "<stable-skill-id>",
    "client": "chat-web"
  }
}
```

`external_id` 是幂等键。网络重试不能创建两个 run。

### 5.2 输入文件

Chat 现有附件上传链路保持不变。上传完成后只向 Knowledge 传递已确认的逻辑引用：

```json
{
  "kind": "warehouse_asset",
  "role": "source",
  "warehousePath": "/apps/<chat-app-id>/...",
  "sha256": "...",
  "size": 73400320,
  "contentType": "application/pdf"
}
```

Chat 不把用户文件内容再次上传给 Knowledge。Knowledge 不因收到路径就获得读取权限；真正读取仍由原有 Warehouse UCAN/凭证边界保护。

P0 如果 Knowledge 无法读取用户附件，只记录引用，不伪造可读状态。需要服务端解析文件时，进入 P1 delegated authorization 设计。

### 5.3 检索和 context

Chat 调用 Knowledge：

```http
POST /service/search
X-Service-Api-Key: <server-only-key>
```

Knowledge 已经记录 `RetrievalLog`。后续 Chat 更新 context：

```http
PUT /service/runs/<run-id>/context
X-Service-Api-Key: <server-only-key>
Content-Type: application/json

{
  "context": [
    {
      "kind": "retrieval_log",
      "referenceId": "123",
      "role": "citation"
    },
    {
      "kind": "warehouse_asset",
      "warehousePath": "/apps/<chat-app-id>/context/summary.md",
      "role": "summary",
      "sha256": "..."
    }
  ]
}
```

Knowledge 校验 retrieval log 所属 principal、run 归属和 KB grant。Chat 不自行判断授权是否有效。

### 5.4 Artifact

最终报告通过 Knowledge 上传：

```http
POST /service/runs/<run-id>/artifacts
X-Service-Api-Key: <server-only-key>
Content-Type: multipart/form-data

artifact_key=final-report
artifact_type=report
role=report
status=final
file=<report.md>
```

Knowledge 负责：

- 生成 `/apps/knowledge.yeying.pub/runs/<run-id>/artifacts/` 下的路径。
- 计算 SHA-256、大小和 MIME。
- 防止重复 artifact key。
- 登记 `AgentRunArtifact`。
- 重建 manifest。

Chat 现有 Cloudflare KV artifact 先保留，避免首轮影响既有分享链接。Knowledge artifact 是新的可审计来源。P0 验证通过后再决定是否统一存储。

### 5.5 结束和失败

成功：

```http
POST /service/runs/<run-id>/complete
X-Service-Api-Key: <server-only-key>
```

失败：

```http
POST /service/runs/<run-id>/fail
X-Service-Api-Key: <server-only-key>
Content-Type: application/json

{"error_summary":"sanitized failure summary"}
```

错误摘要不能包含 API key、UCAN、完整 prompt、完整模型响应或用户文件内容。

## 6. Chat 代码接入点

### 6.1 服务端 client

新增 Chat 服务端模块：

```text
app/utils/knowledge-agent.ts
```

职责：

- 读取服务端环境变量。
- 调用 Knowledge `/service/runs*`。
- 设置 `X-Service-Api-Key`。
- 设置超时、重试和错误归类。
- 不向客户端返回 service key。

该模块只能被 `app/api/knowledge-agent/*` 或服务端 route 使用，禁止从 React 客户端 import。

### 6.2 Chat API 代理

新增内部 route：

```text
app/api/knowledge-agent/runs/route.ts
app/api/knowledge-agent/runs/[runId]/context/route.ts
app/api/knowledge-agent/runs/[runId]/artifacts/route.ts
app/api/knowledge-agent/runs/[runId]/complete/route.ts
app/api/knowledge-agent/runs/[runId]/fail/route.ts
```

这些 route 只做 Chat 到 Knowledge 的适配，不重新实现 run 规则。P0 只能允许配置的 research skill 使用，不能让浏览器提交任意 `run_type`、`owner`、`warehousePath` 或 Knowledge endpoint。

### 6.3 Chat store 生命周期

首轮接入点：

| 位置 | 处理 |
| --- | --- |
| `app/store/chat.ts:onUserInput` | 判断研究技能、创建 run、保存 runId |
| `onBeforeTool` | 只收集工具名称和结果 ID，不保存敏感参数 |
| `onAfterTool` | 追加结构化 tool summary |
| `onFinish` | 上传最终 artifact，完成 run |
| `onError` | 脱敏记录失败并关闭 run |
| `onController` | 取消时调用 Knowledge cancel |

run 调用失败不能阻断普通模型请求。Chat 需要区分：

- `run unavailable`：Knowledge 不可用，继续 Chat，UI 显示未记录。
- `model failed`：模型失败，run 标记 failed。
- `artifact failed`：模型成功但 artifact 保存失败，run 标记 failed 或 `degraded`，不能显示为完整成功。

## 7. 浏览器、网页端和桌面端边界

```text
Browser/Desktop -> Chat same-origin API -> Knowledge
```

- 浏览器和 Tauri 都不持有 Knowledge service key。
- Chat 服务端环境变量适用于 standalone/Next server。
- Tauri 静态导出没有可靠的服务端密钥能力，P0 不在 Tauri 开启 Agent Run。
- 网页版先验证；桌面版等 P0 稳定后通过同一 Chat API 或专用安全代理接入。
- 不能把 service key 写入 `runtime.ts` 返回的公开配置。

## 8. UI

首轮只增加低成本状态：

- 研究任务结果显示 run 状态。
- 成功时显示“查看运行记录/报告”。
- artifact 提供打开或下载入口。
- Knowledge 不可用时显示“本次任务未记录运行资产”，不影响回答展示。
- 普通聊天不显示 run UI。

完整 run、context 和 provenance 审查放在 Knowledge 管理台，不在 Chat 重做。

## 9. 安全边界

- `KNOWLEDGE_SERVICE_API_KEY` 只能服务端读取。
- Chat route 不接受用户提交的 Knowledge URL、owner、principal 或 Warehouse 路径。
- external id 使用 session/message 标识，但不作为权限依据。
- Knowledge 始终从 service key 派生 owner/principal。
- artifact 文件名、路径和 key 由 Knowledge 校验和生成。
- Chat 工具摘要默认只保留名称、状态、引用 ID 和脱敏错误。
- 任何用户授权交换必须是短期、单用途、可撤销 token，不能把长期凭证透传给 Chat。

## 10. P0 验收

开始实现前必须固定并记录：Knowledge 部署地址、P0 `ServicePrincipal` 的 owner、研究技能稳定 ID，以及仅在 standalone 网页端启用的部署范围。任一项缺失时只允许完成服务端 client 测试，不接入 Chat 主流程。

至少完成 20 次研究任务，记录：

- run 创建成功率。
- external id 幂等率。
- context 更新成功率。
- artifact 上传成功率。
- manifest 同步成功率。
- failed/degraded 任务可定位率。
- 额外延迟 P50/P95。
- Chat 普通聊天回归情况。

必须满足：

- service key 没有出现在浏览器网络响应和持久化数据中。
- Knowledge 能通过 manifest 找回 artifact 和检索记录。
- 撤销 principal 后新 run 被拒绝。
- artifact 真实 hash 与 manifest 一致。
- Chat 服务端重试不会产生重复 run。
- Knowledge 不可用时普通 Chat 仍能完成回答。

## 11. P1 多用户验收

P0 通过后再实现：

1. Chat 用户身份与 Knowledge wallet 的明确绑定。
2. delegated run token 或服务端用户会话。
3. 用户附件读取授权交换。
4. 每个用户的 run owner 和 Warehouse root 隔离。
5. Chat 管理台只能看到当前用户授权的 run。

在 P1 完成前，不能把 P0 的社区 service owner 方案宣称为多租户生产方案。

## 12. 回退

run 集成是旁路能力。删除 Chat 的 Knowledge adapter 后：

- 现有会话、模型调用、WebDAV 同步和 Cloudflare artifact 继续工作。
- Knowledge 已创建的 run 和 Warehouse 文件保留，不影响 Chat 主链路。
- 不需要迁移 ChatMessage 或重写附件数据。
