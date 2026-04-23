# Changelog

本文件遵循 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/) 约定，版本号遵循 [Semantic Versioning 2.0.0](https://semver.org/lang/zh-CN/)。

> **变更类别**：`Added`（新增）/ `Changed`（变更）/ `Deprecated`（弃用）/ `Removed`（移除）/ `Fixed`（修复）/ `Security`（安全）

## [Unreleased]

### Changed
- **README**：「快速开始」增加 macOS / Linux / Windows 对照说明；Windows 须使用 **Git Bash** 执行 `bash scripts/up.sh` / `down.sh`。
- **scripts/README.md**：新增「各系统安装 Docker（简引）」表（macOS / Windows / Linux 官方文档入口与要点）；删「裸机仅有 Docker + git」长段，改为最简流程中简述须 `git clone`（或 zip）后进入根目录再 `up.sh`。
- **宿主机端口**：`docker/compose.yml` 中 `UNIBLOG_*_PORT` 与 `NEXT_PUBLIC_API_BASE_URL` 不再设默认值，必须由 `scripts/up.sh` 写入的 `.dev-logs/ports.env`（或等价环境变量）提供；`up.sh` 在文件顶部集中定义探测区间，统一用 `choose_port` 选首个空闲端口。`down.sh` 在无 `ports.env` 时按容器名删除栈。前端移除 `localhost:4000` 硬编码，统一使用 `NEXT_PUBLIC_API_BASE_URL`（`PostCard` 媒体 URL 等）。
- **仓库根目录精简**：开发用 Compose 迁至 [`docker/compose.yml`](../docker/compose.yml)（绑定挂载 `..:/app`）；`CHANGELOG.md` 与 `CONTRIBUTING.md` 迁至 `docs/`；`scripts/up.sh`、`down.sh` 使用 `docker compose -f docker/compose.yml`。
- **脚本与 Docker 工作流**：`scripts/` 仅保留 `up.sh`、`down.sh`（Bash）；合并原 `dev-up.sh`、可选 `git clone`、原 `dev-stop.sh`；删除 `dev-up.sh`、`dev-stop.sh`、`docker-oneclick.sh`。根 `package.json` 移除 `dev:up` / `dev:stop`。说明迁至 [scripts/README.md](../scripts/README.md)；容器细节见 [docker/README.md](../docker/README.md)。Compose 栈仍为 Postgres + API + Web（`node:20-bookworm`）、`docker/entrypoint-*-dev.sh`、`.dev-logs/ports.env` 端口探测。
- **文档目录**：`API.md` / `DATABASE.md` 迁至 `apps/api/docs/`；`FRONTEND.md` 迁至 `apps/web/docs/`；开发指南迁至 `apps/api/docs/DEVELOPMENT.md`；根目录新增 [docs/README.md](./README.md) 索引；移除根目录 `docs/SCRIPTS.md`、`docs/DOCKER.md` 等重复文件。**开发与本地全栈运行**统一为 Docker 一键；根 `package.json` 移除 `dev:api` / `dev:web`。

### Removed
- **GitHub Actions**：仓库内移除 `.github/workflows/ci.yml`（此前为新增文件；无该文件时 HTTPS PAT 无需 `workflow` scope 即可推送）。本地与 PR 前仍请执行 `npm run lint` / `test` / `build`。

### Added
- **Monorepo 共享包**：新增 `@uniblog/shared`（`packages/shared`），收录 `buildCommentTree` 与 `ApiErrors` 等前后端共用逻辑；根 `workspaces` 纳入 `packages/*`。
- **API 分层**：`routes` 薄化，业务迁入 `services/*`；请求体验证使用 `zod`（`validators/*`）；统一 `ServiceError` + `sendRouteError` 映射 JSON 错误。
- **配置与日志**：`lib/config.ts` 集中读取环境变量（含在模块内加载 `apps/api/.env`）；`pino` 结构化日志用于路由错误与 Express 兜底处理器。
- **前端 features**：`src/features/client/*` 作为 HTTP / Token / Config 的统一入口；`src/features/shared` 再导出 `@uniblog/shared`；`tsconfig` 增加 `@/*` 路径别名。
- **测试与 CI**：`vitest` 覆盖 `commentTree` 单元与 `GET /health` 集成 smoke；根脚本 `test`、`prisma:validate`（GitHub Actions 工作流可后续按需加回）。

## [1.4.0] - 2026-04-21

### Added
- **举报与管理员审核**：新增 `Report` 模型与 `ReportTargetType` / `ReportStatus` 枚举（迁移 `20260421134003_add_report`）；接口新增 `POST /social/reports`（帖子 / 评论 / 用户三类举报，同目标单举报人仅允许一条 open）、`GET /social/admin/reports`、`PATCH /social/admin/reports/:reportId`。审核通过（resolve）时自动联动删帖 / 删评论、清理对应 `SystemNotification`，并写入 `report_resolved` 通知给被处理者；同目标的其它 open 举报会自动置为 resolved。
- **前端举报入口 & 管理页**：新增 `ReportButton` 组件，接入 `PostCard` 的「⋮」菜单（帖子举报）、评论行尾（评论举报）与他人主页（用户举报）；新增 `/admin/reports` 管理员审核页（按 `open/resolved/rejected/all` 筛选，支持通过/驳回并填写留言）；`Header` 在 `role=admin` 时显示「管理」导航并轮询 open 举报红点；消息中心新增 `report_resolved` 通知文案。
- **个人资料**：`User` 模型新增 `displayName` / `bio` / `avatarPath` 三个字段（迁移 `20260421132650_add_user_profile`）。API 侧新增 `PATCH /auth/me`（更新展示名/简介）与 `POST /auth/me/avatar`（multipart 头像上传，≤ 5 MB，jpg/png/webp/gif；上传成功后异步清理旧文件）。所有返回 `author / user / sender / receiver / actor` 的接口统一改走 `serializePublicUser`，响应附带 `displayName` 与 `avatarUrl`。
- **资料设置页**：新增 `apps/web/src/app/me/settings/page.tsx`，集成头像上传与展示名/简介表单；字段长度与后端约束对齐（展示名 ≤ 40 字，简介 ≤ 200 字）。`/me` 侧栏追加「资料设置」入口。
- **统一头像展示**：新增 `apps/web/src/components/Avatar.tsx`，Header 个人主页提示、PostCard 帖子作者与评论作者、他人主页 `/user/[userId]`、消息中心好友列表/聊天标题、好友申请与系统通知均改用 `Avatar` + `displayName` 回退 `username` 渲染，确保站内所有用户引用风格一致。
- **帖子编辑**：新增 `PATCH /posts/:postId`，作者可在发帖后 3 天内修改正文，超期返回 `403 edit_window_expired`；不支持修改媒体。PostCard 作者态「⋮」菜单新增「编辑」入口支持内联编辑，`Ctrl/Cmd + Enter` 保存、`Esc` 取消。
- **AppShell 公开路由扩展**：`isPublicPath` 新增 `/forgot-password`。
- **邮箱验证码注册**：注册流程增加 6 位邮箱验证码校验，新增 `POST /auth/email/send-code`（`purpose=register|reset_password`），`POST /auth/register` 需额外携带 `code` 字段；前端 `apps/web/src/app/register/page.tsx` 增加「获取验证码」按钮与 60 秒倒计时。
- **找回密码**：新增 `POST /auth/password/reset` 以及 `apps/web/src/app/forgot-password/page.tsx` 页面，登录页增加「忘记密码？」入口；重置成功后自动吊销该用户全部 Refresh Token。
- **SMTP 发件能力**：新增 `apps/api/src/lib/mailer.ts`（Nodemailer 单例）与 `apps/api/src/lib/verification.ts`（验证码签发 / 消费 / 冷却 / 错误计数）；验证码 SHA-256 哈希后入库，10 分钟过期，错误上限 5 次，同邮箱 60 秒发送冷却。
- **数据库迁移**：新增 `EmailVerification` 表与索引，迁移 `20260421124503_add_email_verification`。
- **环境变量**：`apps/api/.env.example` 新增 `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`。

### Changed
- **安全策略**：`/auth/email/send-code` 在 `purpose=reset_password` 场景下，即使邮箱未注册也统一返回 `{ ok: true }`，避免用户枚举。
- **前端 HTTP 封装**：`apps/web/src/lib/http.ts` 将 `/auth/email/send-code` 与 `/auth/password/reset` 加入「无需 Bearer」白名单。
- **取消独立帖子详情页**：移除 `apps/web/src/app/posts/[id]/` 路由与 `PostCard.isDetailView` 模式，统一恢复为「点击评论图标在卡片内联展开/折叠」。`AppShell.isPublicPath` 同步移除 `/posts/*` 白名单；`/admin/reports` 的「查看详情」跳转改为 `/circles?postId=<id>[&commentId=<id>]`，复用 `focusCommentId` 滚动定位逻辑。

### Fixed
- **弹窗穿透 / 被截断**：新增统一 `Modal` 组件，通过 `createPortal` 渲染到 `document.body`，修复举报弹窗在 PostCard 的「⋮」`.glass` 菜单内被 `backdrop-filter` 生成的 containing block 截断的问题；退出登录、删除帖子、举报、审核留言等对话框全部迁移到 `Modal`，遮罩与圆角/阴影/按钮布局保持一致。
- **评论框与正文宽度不一致**：`.text-line-fit` 原本对 `<input>/<textarea>` 也生效，导致 PostCard 评论输入、登录/注册/发帖等表单控件被钳制到 32em 以内，视觉上比父容器窄一截。现已在 `globals.css` 显式将表单控件的 `max-width` 重置为 `none`，表单跟随容器宽度对齐。
- **举报通过层主评论时回复错位**：审核通过（`PATCH /social/admin/reports/:reportId action=resolve`）针对「层主评论」目标时，此前只删层主，同层回复的 `layerMainId` 会因 Prisma `onDelete: SetNull` 变为 `null`，前端 `buildCommentTree` 回退到 `@用户名` 启发式后容易把它们错位归到另一位同名用户的主评论下。现已改为：若目标为层主，连同同层回复一并删除，并向回复作者下发 `comment_deleted_by_admin`。同时 `DELETE /social/posts/:postId/comments/:commentId` 增加拦截：若目标是含同层回复的层主，返回 `400 comment_has_replies_use_layer_endpoint`，强制走 `/comments/layer/:mainCommentId` 整层删除。

---

## [1.3.0] - 2026-04-21

### Added
- **消息中心**：重构 `apps/web/src/app/friends/` → `apps/web/src/app/messages/`，统一承载好友列表、一对一私信、系统通知，并提供未读徽标。
- **未读红点体系**：`Header.tsx` 定时轮询聊天、系统通知、好友申请，聚合为导航「消息」节点的红点；新增 `apps/web/src/lib/unread.ts` 维护本地 `lastSeen / unread` 映射与订阅机制。
- **帖子置顶**：`PATCH /posts/:postId/pin` 支持 `scope=profile`（作者本人主页，上限 3）与 `scope=feed`（仅管理员，圈子全局上限 3）；Feed/主页/作者页排序按置顶时间降序并 `NULLS LAST`。
- **管理员系统通知落库**：管理员删帖 / 删评论会写入 `SystemNotification` 表，并生成 `post_deleted_by_admin` / `comment_deleted_by_admin` 聚合通知。
- **项目文档体系**：新增 `README.md`、`docs/ARCHITECTURE.md`、`docs/DEVELOPMENT.md`、`docs/API.md`、`docs/DATABASE.md`、`docs/FRONTEND.md`、`CONTRIBUTING.md`、`CHANGELOG.md`。
- **环境变量模板**：新增 `apps/api/.env.example`，并在 `.gitignore` 中放行。
- **退出登录确认弹窗**：`Header.tsx` 新增退出二次确认。
- **滚动态 Header**：滚动超过阈值自动添加阴影。

### Changed
- **圈子 Feed / 个人主页 / 他人主页 / 收藏夹**：`PostCard` 重写，统一交互（点赞/收藏/转发/评论/置顶/删除）与视觉；圈子页支持管理员全局置顶。
- **写帖页**：`apps/web/src/app/write/page.tsx` 支持最多 3 个媒体附件预览与上传，统一错误提示。
- **登录 / 注册 / 个人中心 / 用户主页**：样式与布局刷新，保持跨页一致性。
- **评论分层**：前后端 `commentTree.ts` 语义对齐，新写入强制使用 `layerMainId`，兼容历史 `@用户名` 旧数据。
- **启动脚本**：合并 `scripts/dev-refresh.sh` 到 `scripts/dev-up.sh`，支持容器冲突自愈、自动释放 3000/4000 端口、后台启动并 `tail -F` 日志；根 `package.json` 新增 `dev:stop`。
- **`.cursorrules`**：新增第 6 章「文档同步规范」，强制 Agent 在代码变更时同步 README/docs/CHANGELOG。
- **`.gitignore`**：新增 `.dev-logs/`、`*.tsbuildinfo`、`*.log`、`coverage/`、`.vscode/`、`.idea/`、`Thumbs.db` 等忽略规则，加入 `!apps/api/.env.example` 例外放行。

### Removed
- 删除 `scripts/dev-refresh.sh`（功能并入 `dev-up.sh`）。
- 删除 `apps/web/src/app/friends/page.tsx`（迁移至 `messages/page.tsx`）。

---

## [1.2.0] - 2026-03-28

### Added
- **好友系统**：好友申请 / 接受 / 拒绝 / 解除、关系状态查询、联系人列表；在他人主页点击用户名即可发起添加。
- **一对一私信**：好友之间可发送文本消息，支持历史消息查看（非好友但存在历史消息可只读）。
- **通知中心**：聚合点赞 / 收藏 / 评论 / 回复 / 好友申请等事件的消息提示。

---

## [1.1.0] - 2026-03-27

### Added
- **用户角色**：新增 `admin` 角色，管理员可删除任意帖子与评论。
- **多图发帖**：支持单帖最多 3 个图片/视频附件。

### Fixed
- 评论区无法换行、回车误触发送的问题。

---

## [1.0.0] - 2026-03-26

UniBlog 第一代版本正式推出，极简风格的博客平台。

### Added
- **账户体系**：注册 / 登录（邮箱或用户名）/ 登出 / 刷新 Token / `/auth/me`；JWT Access + Refresh，bcrypt 密码哈希。
- **发帖**：文本 + 图片 / 视频附件，Multer 磁盘存储。
- **信息流**：公开圈子 Feed、我的帖子、他人作者页。
- **评论与互动**：评论、点赞、收藏、转发（均支持取消 / 去重）。
- **个人中心**：我的主页、收藏夹。
- **基础设施**：Docker Postgres、Prisma 迁移、npm workspaces。

### Security
- Refresh Token 仅以 SHA-256 哈希入库。
- 开发环境 CORS 默认放行 `http://localhost:*`，生产需通过 `CORS_ORIGIN` 限制。

[Unreleased]: https://example.com/uniblog/compare/v1.3.0...HEAD
[1.3.0]: https://example.com/uniblog/compare/v1.2.0...v1.3.0
[1.2.0]: https://example.com/uniblog/compare/v1.1.0...v1.2.0
[1.1.0]: https://example.com/uniblog/compare/v1.0.0...v1.1.0
[1.0.0]: https://example.com/uniblog/releases/tag/v1.0.0
