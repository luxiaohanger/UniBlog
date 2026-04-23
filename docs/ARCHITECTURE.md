# 架构总览

本文档描述 UniBlog 的整体架构、模块职责与请求流程，服务于新加入开发者的快速上手与重构决策。

## 1. 整体拓扑

```text
 ┌──────────────┐    HTTP/JSON     ┌──────────────┐    Prisma     ┌──────────────┐
 │  Web (3000)  │ ───────────────► │  API (4000)  │ ────────────► │ Postgres(5432)│
 │  Next.js 14  │ ◄─────────────── │  Express 4   │ ◄──────────── │  uniblog DB   │
 └──────────────┘   JWT Bearer     └──────────────┘               └──────────────┘
        │                                  │
        │ /uploads/*（静态媒体）           │ 本地磁盘：apps/api/uploads
        └──────────────────────────────────┘
```

- 前后端完全分离，通过 JSON over HTTP 通信。
- Access Token 随 `Authorization: Bearer` 请求头发送；Refresh Token 由前端持有并在 401 时自动刷新一次。
- 媒体附件直接落盘到 `apps/api/uploads/`，由 Express static 暴露为 `/uploads/*`。

## 2. Monorepo 布局

```text
uniblog/
├── apps/
│   ├── api/                 # 后端包 @uniblog/api（含 prisma/、docs/：API / DB / 开发指南）
│   └── web/                 # 前端包 @uniblog/web（含 docs/：前端说明）
├── packages/
│   └── shared/              # @uniblog/shared（评论树、错误码常量等）
├── scripts/                 # up.sh / down.sh + README（Bash 启停 Compose）
├── docs/                    # 架构、CHANGELOG、CONTRIBUTING、索引（本目录）
├── docker/                  # compose.yml、入口脚本 + README
├── package.json             # npm workspaces 根
└── .cursorrules             # 工作空间开发规范
```

使用 `npm workspaces` 管理包；**一键启停**用 `bash scripts/up.sh` / `down.sh`（见 [scripts/README.md](../scripts/README.md)）。根 `package.json` 另有 `build` / `lint` / `test` / `prisma:validate`（CI 与本地校验，不替代 Docker 运行全栈）。

## 3. 后端架构（@uniblog/api）

### 3.1 分层

```text
src/
├── index.ts          # 启动 HTTP 服务（环境变量由 lib/config 加载 apps/api/.env）
├── app.ts            # Express 装配：CORS / JSON / cookie / 静态资源 / 路由 / 错误兜底
├── routes/           # 薄路由：鉴权 / multer / zod 解析 / 调 services
│   ├── auth.ts
│   ├── posts.ts
│   ├── social.ts
│   └── reports.ts
├── services/         # 用例与 Prisma 编排（auth / posts / social / reports）
├── validators/       # zod Schema（与 routes 一一对应）
├── middleware/
│   └── auth.ts       # requireAuth() —— JWT 校验并注入 req.user
├── lib/
│   ├── prisma.ts     # 全局单例 PrismaClient
│   ├── auth.ts       # sign/verify access、createRefreshToken、hashToken
│   ├── config.ts     # 集中环境变量
│   ├── logger.ts     # pino 实例
│   ├── serviceError.ts / routeError.ts / parseRequest.ts
│   ├── uploads.ts    # 上传目录与安全 unlink
│   └── roles.ts      # isUserAdmin()
└── prisma/
    ├── schema.prisma # 数据模型
    └── migrations/   # 迁移文件（提交进仓库）
```

评论树构建见 monorepo 包 `@uniblog/shared`（`buildCommentTree`），前后端共用同一实现。

### 3.2 设计约束

- **错误语义**：所有失败路径返回 `{ error: '<snake_case_code>' }`，HTTP 状态码承担粗粒度分类。前端据此切换 UI 文案。
- **鉴权**：受保护的路由统一用 `requireAuth()` 中间件；管理员操作通过 `isUserAdmin(userId)` 二次校验。
- **文件上传**：`multer` 磁盘存储，`uploads/<timestamp>-<rand><ext>` 命名；删除帖子时级联删除文件。
- **CORS**：开发环境放行任意 `http://localhost:*`；生产用 `CORS_ORIGIN` 白名单覆盖。
- **Prisma 单例**：`globalThis.prisma` 避免 `tsx watch` 热重启时建立多条连接。

### 3.3 评论分层模型

见 `packages/shared` 中 `buildCommentTree`：

- 顶层评论（层主）：`layerMainId === null`。
- 同层回复：`layerMainId` 指向层主；写入时由 `/social/posts/:postId/comments` 校验层主合法性。
- 兼容历史数据：若 `layerMainId` 为空但以 `@用户名` 开头，则按「@层主用户名 + 创建时间」推断层号，仅影响展示层。

## 4. 前端架构（@uniblog/web）

### 4.1 页面路由（App Router）

```text
src/app/
├── page.tsx              # 首页
├── login / register      # 账户
├── circles/              # 圈子（公共 Feed + 管理员置顶）
├── messages/             # 聊天与系统消息
├── write/                # 发帖
├── user/[userId]/        # 他人主页
├── me/                   # 我的主页（layout + favorites）
│   └── favorites/        # 我的收藏
└── admin/reports/        # 管理员举报审核队列
```

### 4.2 关键约定

- **状态 / 请求**：统一走 `src/lib/http.ts`（封装 401 自动刷新）+ SWR；业务侧推荐从 `src/features/client/http` 引用以便按域演进。
- **共用领域逻辑**：`src/features/shared` 再导出 `@uniblog/shared`（如 `buildCommentTree`、`ApiErrors`）。
- **鉴权**：Token 存 `localStorage`（见 `lib/token.ts`）。`http.ts` 收到 401 时先尝试 `refresh`，仍失败再 `clearTokens()`。**401 不会自动跳转**，需要登录拦截的页面需在组件内自行处理。
- **样式**：优先内联 `style={{}}`；复用动画/交互类放在 `src/app/globals.css`。**严禁新增 `*.module.css`**（见 [.cursorrules](../.cursorrules)）。
- **未读红点**：`lib/unread.ts` 本地维护 `lastSeen / unread` 映射；`Header.tsx` 轮询消息和通知并驱动根节点红点。

### 4.3 典型请求流

```text
Page (SWR) ──► apiFetch('/auth/me') ──► fetch(Bearer AT) ──► API
                    │ 401
                    ▼
               try refresh
                    │ 成功
                    ▼
             setTokens & 重试一次
```

## 5. 数据层

- Postgres 16（Docker 本地卷 `postgres_data`）。
- Prisma 负责 Schema 定义、迁移、类型生成。
- 所有结构变更通过迁移落库：`prisma migrate dev --name <change>`，并提交到 `apps/api/prisma/migrations/`。
- 详细表结构、索引、级联策略见 [DATABASE.md](../apps/api/docs/DATABASE.md)。

## 6. 本地编排

默认通过 **Docker Compose**（[`docker/compose.yml`](../docker/compose.yml)）在容器内运行 Postgres、API（`docker/entrypoint-api-dev.sh`）与 Web（`docker/entrypoint-web-dev.sh`）。**启停**由 Bash 脚本完成，见 [scripts/README.md](../scripts/README.md)（`scripts/up.sh`、`scripts/down.sh`）：检查 Docker、探测宿主机端口、写入 `.dev-logs/ports.env`、`docker compose -f docker/compose.yml up`、跟随日志；`down.sh` 执行 `compose down` 并保留卷。容器与排错见 [docker/README.md](../docker/README.md)。

## 7. 扩展点与未来方向

| 方向 | 说明 |
| --- | --- |
| 对象存储 | 将 `uploads/` 迁移到 S3 / OSS，`PostMedia.path` 保留相对路径 |
| 通知持久化 | 当前点赞/收藏通知由查询聚合而来，可迁移到 `SystemNotification` 表 |
| 实时消息 | 引入 WebSocket（Socket.IO）替代当前 3s 轮询 |
| 测试 | 补充 Vitest / Supertest，覆盖鉴权与评论树核心用例 |
| CI | 可选接入 GitHub Actions；当前仓库未提交 workflow，用根目录 `npm run lint` / `test` / `build` 做本地与 PR 前校验 |

> 本文件随架构变更同步更新。新增模块或改变请求流时，请同步调整第 3 / 4 节。
