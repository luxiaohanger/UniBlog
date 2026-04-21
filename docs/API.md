# API 参考

基于 `apps/api/src/routes/*` 的当前实现整理，MVP 阶段全量接口列表。

- **Base URL**（开发）：`http://localhost:4000`
- **鉴权**：受保护接口需要 `Authorization: Bearer <accessToken>`。
- **响应约定**：成功返回业务 JSON；失败返回 `{ error: '<snake_case_code>' }`，HTTP 状态码承担分类。
- **时间字段**：ISO 8601 字符串（由 Prisma Date 序列化）。
- **媒体 URL**：相对 `/uploads/<file>`，拼接 Base URL 即可访问。

## 约定与错误码

| 状态 | 常见 `error` | 说明 |
| --- | --- | --- |
| 400 | `missing_*` / `invalid_*` | 参数缺失或非法 |
| 401 | `missing_authorization` / `invalid_or_expired_token` / `unauthorized` | 需要登录 |
| 403 | `forbidden_not_author` / `forbidden_admin_only` / `forbidden_not_friends` | 权限不足 |
| 404 | `*_not_found` | 资源不存在 |
| 409 | `email_exists` / `already_friends` / `request_already_sent` | 业务冲突 |
| 500 | `*_failed` / `internal_error` | 服务器内部异常 |

## 健康检查

### `GET /health`

```json
{ "ok": true }
```

---

## 鉴权 `/auth`

### `POST /auth/register`

注册新用户。

**Body**

```json
{
  "email": "a@b.com",
  "username": "alice",
  "password": "at-least-6-chars"
}
```

**201 Response**

```json
{ "user": { "id": "...", "email": "...", "username": "...", "role": "user" } }
```

### `POST /auth/login`

**Body**（`account` / `email` / `username` 任一作为标识）

```json
{ "account": "alice", "password": "..." }
```

**200 Response**

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<hex>",
  "user": { "id": "...", "email": "...", "username": "...", "role": "user" }
}
```

### `POST /auth/refresh`

**Body**：`{ "refreshToken": "..." }`

**200**：返回新 `accessToken` 与 `user`。Refresh Token 仍然有效且未吊销。

### `POST /auth/logout`

**Body**：`{ "refreshToken": "..." }` → 吊销对应 token。

### `GET /auth/me` 🔒

返回当前登录用户信息。

---

## 帖子 `/posts`

### `POST /posts` 🔒（`multipart/form-data`）

创建帖子，最多 3 个 `media` 附件（图片 / 视频，单文件 ≤ 50MB）。

**Form 字段**

- `content`：文本正文，必填。
- `media`：文件（0~3 个）。

**201**：`{ post: { ..., media: [{ id, kind, path }] } }`

### `GET /posts/feed`

圈子 Feed（无需登录），按 `pinnedInFeedAt DESC NULLS LAST, createdAt DESC`，默认取 30 条。

### `GET /posts/mine` 🔒

当前用户自己的帖子，按 `pinnedInProfileAt DESC NULLS LAST, createdAt DESC`，默认 50 条。

### `GET /posts/favorites` 🔒

当前用户收藏过的帖子。

### `GET /posts/author/:authorId`

指定作者的公开帖子。

### `GET /posts/:postId`

帖子详情，包含 `comments`、`counts`（comments/likes/favorites/shares）。

### `PATCH /posts/:postId/pin` 🔒

**Body**

```json
{ "scope": "profile" | "feed", "pinned": true }
```

- `scope=profile`：作者本人置顶，限 3 篇。
- `scope=feed`：仅管理员，全局限 3 篇。

### `DELETE /posts/:postId` 🔒

作者或管理员可删。管理员删他人帖会发 `post_deleted_by_admin` 系统通知。

**帖子对象（serializePost）**

```jsonc
{
  "id": "...",
  "content": "...",
  "createdAt": "2026-04-21T...",
  "author": { "id": "...", "username": "..." },
  "media": [{ "id": "...", "kind": "image|video", "url": "/uploads/xxx.jpg" }],
  "isPinned": true,
  "counts": { "comments": 0, "likes": 0, "favorites": 0, "shares": 0 }
}
```

---

## 社交 `/social`

### 评论

#### `POST /social/posts/:postId/comments` 🔒

**Body**

```json
{ "content": "文本", "layerMainId": "<层主评论ID，可选>" }
```

- `layerMainId` 为空：新建层主评论。
- `layerMainId` 非空：必须指向同一帖子下 `layerMainId === null` 的层主。

#### `DELETE /social/posts/:postId/comments/layer/:mainCommentId` 🔒

删除整「层」（层主 + 同层回复），仅管理员。向受影响评论作者发送 `comment_deleted_by_admin` 通知。

#### `DELETE /social/posts/:postId/comments/:commentId` 🔒

删除单条评论，仅管理员。

### 互动

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/social/posts/:postId/likes` 🔒 | 点赞（幂等） |
| `DELETE` | `/social/posts/:postId/likes` 🔒 | 取消点赞 |
| `POST` | `/social/posts/:postId/favorites` 🔒 | 收藏（幂等） |
| `DELETE` | `/social/posts/:postId/favorites` 🔒 | 取消收藏 |
| `POST` | `/social/posts/:postId/share` 🔒 | 转发（幂等） |
| `DELETE` | `/social/posts/:postId/share` 🔒 | 取消转发 |
| `GET` | `/social/posts/:postId/states` 🔒 | 返回 `{ liked, favorited, shared }` |

### 好友关系

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/social/friends/relationship/:userId` 🔒 | 返回 `{ relationship: { kind: 'SELF'\|'NONE'\|'PENDING'\|'INCOMING'\|'FRIENDS', requestId? } }` |
| `POST` | `/social/friends/request/:userId` 🔒 | 发送好友申请；已 DECLINED 的记录复用并翻转 |
| `GET` | `/social/friends/requests/pending` 🔒 | 收到的待处理申请 |
| `PATCH` | `/social/friends/request/:requestId` 🔒 | `{ status: 'ACCEPTED'\|'DECLINED' }`（仅接收者） |
| `GET` | `/social/friends/list` 🔒 | 联系人列表（`ACCEPTED` + 历史 `DECLINED`） |
| `DELETE` | `/social/friends/:friendId` 🔒 | 解除关系（改为 `DECLINED`，保留历史消息） |

### 私信

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/social/messages/:friendId` 🔒 | 历史消息（双向，最多 200 条）；非好友但有历史消息仍可读，不能发 |
| `POST` | `/social/messages/:friendId` 🔒 | `{ content }`，需 `ACCEPTED` |

消息对象：

```json
{ "id": "...", "content": "...", "senderId": "...", "receiverId": "...", "createdAt": "..." }
```

### 通知

#### `GET /social/notifications?take=50` 🔒

聚合通知流（默认 50 条，1~50）。类型：

| kind | 触发 |
| --- | --- |
| `post_commented` | 我发的帖子被顶层评论 |
| `comment_replied` | 我的评论被回复（基于 `@用户名` 前缀匹配） |
| `post_liked` | 我发的帖子被点赞 |
| `post_favorited` | 我发的帖子被收藏 |
| `post_deleted_by_admin` | 我的帖子被管理员删除 |
| `comment_deleted_by_admin` | 我的评论被管理员删除 |

响应：

```jsonc
{
  "notifications": [
    {
      "kind": "post_commented",
      "createdAt": "...",
      "actor": { "id": "...", "username": "..." },
      "post": { "id": "...", "content": "..." },
      "comment": { "id": "...", "content": "..." }
    }
    // ... 其他类型结构见上表，字段略有差异
  ]
}
```

---

## 静态媒体

### `GET /uploads/:filename`

上传后的图片/视频静态文件。返回 404 时 Express 会交还给错误处理。

---

## 变更约定

> **任何路由新增 / 修改 / 删除都必须同步更新本文件**，并在 [CHANGELOG.md](../CHANGELOG.md) 添加一条记录（见 [CONTRIBUTING.md](../CONTRIBUTING.md)）。
