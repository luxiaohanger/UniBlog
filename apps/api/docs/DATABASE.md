# 数据库设计

Schema 源：[`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma)。本文件维护模型关系、索引策略、级联规则、迁移流程。

## 1. 连接

- DBMS：PostgreSQL 16
- 默认 DSN：`postgresql://postgres:postgres@localhost:5432/uniblog`
- 连接通过 `DATABASE_URL` 注入，本地由 `docker/compose.yml`（Compose 栈）提供。

## 2. 模型总览

```text
User ─┬─< Post ─┬─< PostMedia
      │         ├─< Comment (self-ref via layerMainId)
      │         ├─< PostLike
      │         ├─< PostFavorite
      │         └─< PostShare
      ├─< RefreshToken
      ├─< Friendship (Sender / Receiver)
      ├─< ChatMessage (Sender / Receiver)
      └─< SystemNotification (Recipient / Actor)
```

## 3. 表详解

### 3.1 `User`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `cuid` | PK | |
| `email` | `String` | `UNIQUE` | 登录标识 |
| `username` | `String` | `UNIQUE` | 唯一用户名，注册后不可修改 |
| `passwordHash` | `String` |  | bcrypt 10 轮 |
| `role` | `String` | 默认 `"user"` | `user` / `admin` |
| `createdAt` | `DateTime` | 默认 `now()` | |
| `displayName` | `String?` | ≤ 40 字（业务层） | 展示名，为空时前端回退到 `username` |
| `bio` | `String?` | ≤ 200 字（业务层） | 个人简介 |
| `avatarPath` | `String?` |  | 头像相对路径，形如 `uploads/avatar-<ts>-<rand>.<ext>`；接口返回时序列化为 `avatarUrl: "/uploads/..."` |

> API 层通过 `apps/api/src/lib/serializeUser.ts` 中的 `publicUserSelect` / `serializePublicUser` 统一输出「公开用户」结构 `{ id, username, displayName, avatarUrl }`，所有 `author` / `sender` / `receiver` / `actor` / `user` 字段都遵循这一结构。

### 3.2 `RefreshToken`

| 字段 | 约束 | 说明 |
| --- | --- | --- |
| `tokenHash` | `sha256` | 原 token 不入库 |
| `expiresAt` |  | 过期时间 |
| `revokedAt` | nullable | 登出时填充当前时间 |
| FK `userId → User.id` | `ON DELETE CASCADE` | |

索引：`userId`、`tokenHash`。

### 3.2.1 `EmailVerification`

用于注册 / 找回密码的邮箱验证码。不与 `User` 关联（注册时用户尚不存在，重置时以邮箱为准）。

| 字段 | 说明 |
| --- | --- |
| `email` | 验证码针对的邮箱（存入前统一小写 + trim） |
| `codeHash` | 6 位数字验证码的 `sha256`，原码不落库 |
| `purpose` | `register` / `reset_password` |
| `attempts` | 错误尝试次数，≥ 5 即整条作废 |
| `expiresAt` | 过期时间（默认生成后 10 分钟） |
| `consumedAt` | 消费时间；成功校验 / 被新码作废 / 错误超限 时写入 |

索引：`(email, purpose, createdAt)`、`expiresAt`。

业务约束：
- 同 `(email, purpose)` 始终只有一条「活码」（`consumedAt IS NULL` 且未过期）；发新码前会把旧的置为已消费。
- 发码冷却期 60 秒（业务层判断 `createdAt`），超限返回 `429 code_cooldown`。
- 详细流程见 `apps/api/src/lib/verification.ts`。

### 3.3 `Post`

| 字段 | 说明 |
| --- | --- |
| `authorId` FK → `User.id`（`ON DELETE CASCADE`） | |
| `content` | 文本正文 |
| `pinnedInFeedAt` | 圈子置顶时间（管理员操作），`NULL` 表示未置顶 |
| `pinnedInProfileAt` | 作者主页置顶时间（作者操作），`NULL` 未置顶 |

索引：`pinnedInFeedAt`、复合 `(authorId, pinnedInProfileAt)`。

> 置顶排序策略：`ORDER BY pinned*At DESC NULLS LAST, createdAt DESC`。每个维度全局/每作者最多 3 篇（业务层校验）。

### 3.4 `PostMedia`

- `kind`：`image` / `video`（简单字符串，由 MIME 前缀推断）。
- `path`：相对项目的本地路径，形如 `uploads/<name>`；前端访问拼接 `API_BASE_URL + '/' + path`。
- 帖子删除时级联删除，并在应用层清理磁盘文件。

### 3.5 `Comment`

| 字段 | 说明 |
| --- | --- |
| `postId` FK → `Post.id`（级联删） | |
| `authorId` FK → `User.id`（级联删） | |
| `layerMainId` FK → `Comment.id`（`ON DELETE SET NULL`） | 顶层评论为 `NULL` |

索引：`postId`、`layerMainId`。

> 评论语义：`layerMainId === NULL` 为层主，否则为同层回复。同层展示顺序：按 `createdAt` 升序。

### 3.6 `PostLike` / `PostFavorite` / `PostShare`

- 都包含 `(postId, userId/sharerId)` 的 `UNIQUE` 约束，保证幂等。
- 均级联删除。
- `PostShare` 的唯一键字段为 `sharerId`。

### 3.7 `Friendship`

```prisma
enum FriendshipStatus { PENDING ACCEPTED DECLINED }
```

- `(senderId, receiverId)` `UNIQUE`。
- `status` 生命周期：`PENDING → ACCEPTED` / `DECLINED`；`DECLINED` 可被复用（复发申请时翻转为 `PENDING`）。
- 解除好友 = `ACCEPTED → DECLINED`（保留历史联系人/私信）。

索引：`senderId`、`receiverId`、`status`。

### 3.8 `ChatMessage`

- `(senderId, receiverId, createdAt)` 复合索引双向查询。
- 删除好友不影响历史消息。
- 无删除消息接口（MVP）。

### 3.9 `SystemNotification`

- `kind`：当前使用 `post_deleted_by_admin` / `comment_deleted_by_admin`；其余类型（点赞/评论/回复/收藏）由 `/social/notifications` 聚合查询实时拼装，不落此表。
- `actorId` `SET NULL`：管理员账号删除后仍能保留通知（匿名）。
- 索引：`(recipientId, createdAt)`、`postId`、`commentId`。

### 3.10 `Report`

```prisma
enum ReportTargetType { post comment user }
enum ReportStatus     { open resolved rejected }
```

| 字段 | 说明 |
| --- | --- |
| `reporterId` FK → `User.id`（`CASCADE`） | 举报人 |
| `targetType` / `targetId` | 目标类型与对应 id（`post` → Post.id，`comment` → Comment.id，`user` → User.id） |
| `targetUserId` FK → `User.id`（`SET NULL`） | 冗余存储：被举报的用户（帖子/评论的作者），便于按人聚合；用户删除时置空 |
| `reason` | 举报原因文案，业务层约束 ≤ 200 字 |
| `status` | 默认 `open`；管理员审核后切换为 `resolved`（通过 = 目标被处理）或 `rejected`（驳回） |
| `reviewerId` FK → `User.id`（`SET NULL`） | 审核人（管理员） |
| `reviewerNote` | 审核留言（可空） |
| `reviewedAt` | 审核时间 |

索引：`(status, createdAt)` / `(targetType, targetId)` / `(reporterId, createdAt)` / `(targetUserId, status)`。

业务约束（应用层）：
- 同一举报人对同一 `(targetType, targetId)` 只允许存在一条 `status=open` 的举报；二次提交会被 `409 already_reported` 拒绝。
- 管理员审核 `resolved` 会联动调用删帖（`targetType=post`）或删单条评论（`targetType=comment`）的逻辑，并写入 `SystemNotification.kind = report_resolved`（被处理者接收）。

## 4. 级联与一致性

| 父表 | 子表 | 行为 |
| --- | --- | --- |
| User | Post / Comment / PostLike / PostFavorite / PostShare / RefreshToken / Friendship / ChatMessage | `CASCADE` |
| User（Actor） | SystemNotification.actorId | `SET NULL` |
| Post | PostMedia / Comment / PostLike / PostFavorite / PostShare | `CASCADE` |
| Comment（父层） | Comment.layerMainId | `SET NULL` |

应用层补偿：

- 删除 Post：级联清理数据库，但**磁盘媒体文件**需手动 `fs.unlink`（`posts.ts#unlinkStoredMediaFile`）。
- 删除 Comment：在管理员场景中额外清理相关 `SystemNotification` 记录。

## 5. 迁移流程

1. 修改 `schema.prisma`。
2. 生成迁移：
   ```bash
   npm exec -w "@uniblog/api" prisma migrate dev --name <change>
   ```
3. 提交 `apps/api/prisma/migrations/<timestamp>_<change>/` 整个目录。
4. 团队拉取后：`bash scripts/up.sh`（内部 `migrate deploy`）。
5. CI / 生产部署前执行 `prisma migrate deploy`。

### 已有迁移（截至文档撰写时）

| 目录 | 含义 |
| --- | --- |
| `20260325111410_testapp_migration` | 初始模型 |
| `20260326120000_add_user_role` | 新增 `User.role` |
| `20260327100000_comment_layer_main` | 新增 `Comment.layerMainId` |
| `20260327124105` / `20260327124608_111` | 辅助迁移（媒体/索引） |
| `20260327153000_add_post_pinning` | 新增置顶字段 |
| `20260327190000_add_system_notifications` | 新增系统通知表 |
| `20260421124503_add_email_verification` | 新增邮箱验证码表（注册 / 找回密码） |
| `20260421132650_add_user_profile` | 新增 `User.displayName` / `User.bio` / `User.avatarPath` |
| `20260421134003_add_report` | 新增 `Report` 表与 `ReportTargetType` / `ReportStatus` 枚举 |

## 6. 规范

- **不要**在代码里手写 SQL 修改 schema；一律走 Prisma 迁移。
- 索引变更需说明理由（查询路径 / 数据规模）。
- 新增字段**必须**更新本文件 & [`API.md`](./API.md)（若影响响应结构）。
- 删除字段需评估对历史迁移的影响，尽量「先兼容、再清理」。

> **变更约定**：Schema 任何修改必须在同一 PR 中更新本文件的「模型详解」与「迁移流程 · 已有迁移」。
