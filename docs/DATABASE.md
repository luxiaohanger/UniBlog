# 数据库设计

Schema 源：[`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma)。本文件维护模型关系、索引策略、级联规则、迁移流程。

## 1. 连接

- DBMS：PostgreSQL 16
- 默认 DSN：`postgresql://postgres:postgres@localhost:5432/uniblog`
- 连接通过 `DATABASE_URL` 注入，本地由 `docker-compose.yml` 提供。

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
| `username` | `String` | `UNIQUE` | 展示用户名 |
| `passwordHash` | `String` |  | bcrypt 10 轮 |
| `role` | `String` | 默认 `"user"` | `user` / `admin` |
| `createdAt` | `DateTime` | 默认 `now()` | |

### 3.2 `RefreshToken`

| 字段 | 约束 | 说明 |
| --- | --- | --- |
| `tokenHash` | `sha256` | 原 token 不入库 |
| `expiresAt` |  | 过期时间 |
| `revokedAt` | nullable | 登出时填充当前时间 |
| FK `userId → User.id` | `ON DELETE CASCADE` | |

索引：`userId`、`tokenHash`。

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
4. 团队拉取后：`npm run dev:up`（内部 `migrate deploy`）。
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

## 6. 规范

- **不要**在代码里手写 SQL 修改 schema；一律走 Prisma 迁移。
- 索引变更需说明理由（查询路径 / 数据规模）。
- 新增字段**必须**更新本文件 & `docs/API.md`（若影响响应结构）。
- 删除字段需评估对历史迁移的影响，尽量「先兼容、再清理」。

> **变更约定**：Schema 任何修改必须在同一 PR 中更新本文件的「模型详解」与「迁移流程 · 已有迁移」。
