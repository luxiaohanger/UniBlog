# 开发指南

本文档覆盖本地开发、环境变量、常用工作流、调试技巧。

## 1. 先决条件

| 工具 | 版本 | 备注 |
| --- | --- | --- |
| Node.js | ≥ 18（建议 20 LTS） | 需 `npm ≥ 9`（workspaces） |
| Docker Desktop | 最新版 | 用于本地 Postgres |
| OpenSSL（可选） | 任意 | 生成 JWT Secret |

## 2. 首次初始化

```bash
git clone <repo>
cd uniblog
npm install
cp apps/api/.env.example apps/api/.env
# 编辑 apps/api/.env，至少确认 DATABASE_URL 与 JWT_ACCESS_SECRET
npm run dev:up
```

首次运行 `dev:up` 会：

1. 启动 `uniblog_postgres` 容器。
2. 执行 Prisma 迁移（`migrate deploy`）。
3. 拉起 Web（3000）与 API（4000）。

> 访问 <http://localhost:3000> 注册第一个账号即可。

## 3. 日常命令

| 场景 | 命令 |
| --- | --- |
| 一键启动前后端 + 数据库 | `npm run dev:up` |
| 停止由 `dev:up` 拉起的进程 | `npm run dev:stop` |
| 仅调试后端 | `npm run dev:api` |
| 仅调试前端 | `npm run dev:web` |
| 构建生产产物 | `npm run build` |
| Lint | `npm run lint` |
| 新建数据库迁移 | `npm exec -w "@uniblog/api" prisma migrate dev --name <change>` |
| 执行已提交迁移 | `npm exec -w "@uniblog/api" prisma migrate deploy` |
| 打开 Prisma Studio | `npm exec -w "@uniblog/api" prisma studio` |
| 重新生成 Prisma Client | `npm exec -w "@uniblog/api" prisma generate` |

> 涉及 API / 数据库的命令请统一通过 `npm exec -w "@uniblog/api" <cmd>` 执行（见 [.cursorrules](../.cursorrules)）。

## 4. 环境变量

### 后端 `apps/api/.env`

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/uniblog` | Prisma 连接串 |
| `PORT` | `4000` | HTTP 端口 |
| `JWT_ACCESS_SECRET` | `dev_access_secret` | Access Token 签名密钥，**生产必改** |
| `JWT_ACCESS_EXPIRES_IN` | `24h` | 例：`15m` / `2h` / `7d` |
| `JWT_REFRESH_EXPIRES_DAYS` | `30` | Refresh Token 过期天数 |
| `CORS_ORIGIN` | 空 | 逗号分隔；空则开发默认放行 `localhost:*` |
| `PRISMA_LOG` | 空 | 任意非空值开启 `query + error` 日志 |

### 前端（Next.js 编译期）

通过 `.env.local`（未提交）或部署平台注入：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:4000` | 前端 fetch 的 API 基址 |

## 5. 数据库工作流

1. 修改 `apps/api/prisma/schema.prisma`。
2. 运行 `npm exec -w "@uniblog/api" prisma migrate dev --name <change>` 生成迁移。
3. 迁移文件自动进入 `apps/api/prisma/migrations/`，务必 `git add`。
4. 如需种子/回滚，手动写 SQL 脚本或通过 Prisma Studio 操作。
5. 团队成员拉取代码后执行 `npm run dev:up`（内含 `migrate deploy`）。

### 数据重置

```bash
# 清空并重建数据库（慎用：会销毁本地数据）
npm exec -w "@uniblog/api" prisma migrate reset
```

### 授予管理员

```bash
npm exec -w "@uniblog/api" prisma studio
# 在 User 表手动将目标账号的 role 改为 'admin'
```

或直接 SQL：

```sql
UPDATE "User" SET role = 'admin' WHERE username = '<你的用户名>';
```

## 6. 目录规范

- 后端路由按业务域拆分：`auth` / `posts` / `social`；新增域请新建同名文件并在 `app.ts` 挂载。
- 前端页面位于 `apps/web/src/app/<route>/page.tsx`；可复用组件放在 `apps/web/src/components/`。
- 共享工具放在各自包的 `src/lib/`，**不要**跨包 import 源码，避免 tsc 编译边界问题。

## 7. 代码规范

- TypeScript 严格模式，禁用 `any`（确需使用时显式注释原因）。
- 样式：内联 `style={{}}` 优先；全局类放 `apps/web/src/app/globals.css`；禁止 `*.module.css`。
- 所有交互必须有 Loading / Error 状态（见 [.cursorrules](../.cursorrules)）。
- API 响应遵循 `{ error: 'snake_case_code' }` 失败语义。

## 8. 调试技巧

| 场景 | 方法 |
| --- | --- |
| 查看 API 实时日志 | `tail -F .dev-logs/dev-api.log` |
| 查看 Web 实时日志 | `tail -F .dev-logs/dev-web.log` |
| 端口被占用 | `npm run dev:stop` 或 `lsof -i :4000` |
| Prisma Client 不同步 | `npm exec -w "@uniblog/api" prisma generate` |
| 容器连不上 | `docker compose ps`，必要时 `docker rm -f uniblog_postgres` 重来 |
| Token 失效乱跳 | 打开 DevTools → LocalStorage 清 `accessToken / refreshToken` |

## 9. 常见问题（FAQ）

**Q: 启动时报 `CORS` 被拒？**
A: 确认前端访问的协议/端口为 `http://localhost:<port>`；或在 API 端设置 `CORS_ORIGIN=http://localhost:3000`。

**Q: 上传文件 400 `LIMIT_FILE_SIZE`？**
A: 单文件上限 50 MB，见 `apps/api/src/routes/posts.ts`。

**Q: 401 后没有跳转登录？**
A: 这是有意的（见 [.cursorrules](../.cursorrules) 第 4 条）。业务页面需自行 `getTokens()` 判空并手动 `router.replace('/login')`。

**Q: 评论显示「层」错乱？**
A: 新数据依赖 `layerMainId`；历史数据靠开头 `@用户名` 兼容。若两边同时修改了 `commentTree.ts`，请保证**前后端语义一致**。

## 10. 部署（简述）

- 后端：`npm run build -w "@uniblog/api"` 产物在 `apps/api/dist/`，运行 `node dist/index.js`；需 Node ≥ 18、可达 Postgres、持久化 `uploads/` 目录。
- 前端：`npm run build -w "@uniblog/web"` 后 `next start -p 3000`；或部署到 Vercel，设置 `NEXT_PUBLIC_API_BASE_URL` 指向生产 API。
- 生产 **必须** 修改 `JWT_ACCESS_SECRET`、启用 HTTPS、收紧 `CORS_ORIGIN`。

> 文档随环境或脚本调整同步更新。
