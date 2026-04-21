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
| 403 | `forbidden_not_author` / `forbidden_admin_only` / `forbidden_not_friends` / `edit_window_expired` | 权限不足或超出编辑窗 |
| 404 | `*_not_found` | 资源不存在 |
| 409 | `email_exists` / `already_friends` / `request_already_sent` | 业务冲突 |
| 429 | `code_cooldown` | 验证码发送过于频繁 |
| 500 | `*_failed` / `internal_error` / `mailer_not_configured` | 服务器内部异常 |
| 502 | `mail_send_failed` | SMTP 发送失败 |

## 健康检查

### `GET /health`

```json
{ "ok": true }
```

---

## 鉴权 `/auth`

### `POST /auth/email/send-code`

发送邮箱验证码。复用在「注册」与「找回密码」两种场景，通过 `purpose` 区分。

- 注册用途：邮箱已注册时返回 `409 email_exists`。
- 找回密码用途：邮箱是否已注册都统一返回 `{ ok: true }`，不做账户枚举提示。
- 同邮箱 + 同用途存在未消费验证码时，60 秒内不得重发（`429 code_cooldown`）。
- 服务器未配置 SMTP 时返回 `500 mailer_not_configured`。

**Body**

```json
{ "email": "a@b.com", "purpose": "register" }
```

`purpose` 仅支持 `"register"` 或 `"reset_password"`。

**200 Response**

```json
{ "ok": true }
```

### `POST /auth/register`

注册新用户。需先通过 `/auth/email/send-code` 获取 `purpose=register` 的验证码。

**Body**

```json
{
  "email": "a@b.com",
  "username": "alice",
  "password": "at-least-6-chars",
  "code": "123456"
}
```

**201 Response**

```json
{ "user": { "id": "...", "email": "...", "username": "...", "role": "user" } }
```

**常见错误**：`missing_code` / `invalid_code` / `code_expired` / `email_exists` / `username_exists`。

### `POST /auth/password/reset`

通过邮箱验证码重置密码。需先通过 `/auth/email/send-code` 获取 `purpose=reset_password` 的验证码。
成功后会吊销该用户全部 Refresh Token，已登录的其他会话将需要重新登录。

**Body**

```json
{
  "email": "a@b.com",
  "code": "123456",
  "newPassword": "at-least-6-chars"
}
```

**200 Response**

```json
{ "ok": true }
```

**常见错误**：`missing_code` / `invalid_code`（含邮箱未注册）/ `code_expired` / `password_too_short`。

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
  "user": {
    "id": "...",
    "email": "...",
    "username": "...",
    "role": "user",
    "displayName": null,
    "avatarUrl": null
  }
}
```

> `user` 统一遵循「公开用户」结构：`id / username / displayName / avatarUrl` 四件套；`displayName` 为空时前端回退到 `username`，`avatarUrl` 为空时回退到「首字母渐变圆」。`/auth/me` 额外返回 `email / role / bio`。

### `POST /auth/refresh`

**Body**：`{ "refreshToken": "..." }`

**200**：返回新 `accessToken` 与 `user`（含 `displayName` / `avatarUrl`）。Refresh Token 仍然有效且未吊销。

### `POST /auth/logout`

**Body**：`{ "refreshToken": "..." }` → 吊销对应 token。

### `GET /auth/me` 🔒

返回当前登录用户信息：`{ user: { id, email, username, role, displayName, avatarUrl, bio } }`。

### `PATCH /auth/me` 🔒

更新当前用户资料。字段均可选；传 `null` 或 `""` 视为清空。

**Body**

```json
{ "displayName": "Alice", "bio": "hello world" }
```

**200**：`{ user: <公开用户 + email + role> }`

**常见错误**

| 状态 | error | 说明 |
| --- | --- | --- |
| 400 | `display_name_too_long` | `displayName` 超过 40 字 |
| 400 | `bio_too_long` | `bio` 超过 200 字 |
| 400 | `invalid_display_name` / `invalid_bio` | 非字符串类型 |

### `POST /auth/me/avatar` 🔒（`multipart/form-data`）

上传/替换头像。字段名 `file`；允许 `image/jpeg|png|webp|gif`；单文件 ≤ 5 MB。上传成功后旧头像文件会被异步清理。

**200**：`{ user: <公开用户 + email + role> }`，其中 `avatarUrl` 指向新文件。

**常见错误**

| 状态 | error | 说明 |
| --- | --- | --- |
| 400 | `missing_file` | 没有上传 `file` 字段 |
| 400 | `invalid_avatar_mime` | 文件类型不支持 |
| 400 | `avatar_too_large` | 文件超过 5 MB |
| 500 | `avatar_upload_failed` | 落盘或入库失败（会尝试清理刚上传的临时文件） |

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

### `PATCH /posts/:postId` 🔒

作者在发布后 **3 天内**可以编辑帖子正文；超期返回 `403 edit_window_expired`。本期仅支持修改正文，不支持增删媒体。

**Body**

```json
{ "content": "更新后的正文" }
```

**200**：`{ post: <serializePost> }`（不含 scope，因此 `isPinned=false`；前端合并时请仅取 `content` 避免覆盖作用域状态）

**常见错误**

| 状态 | error | 说明 |
| --- | --- | --- |
| 400 | `missing_content` | 正文 trim 后为空 |
| 403 | `forbidden_not_author` | 非作者编辑他人帖 |
| 403 | `edit_window_expired` | 距发布已超过 3 天 |
| 404 | `post_not_found` | 帖子不存在或已删 |

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

删除单条评论，仅管理员。若目标为「层主评论」且存在同层回复，拒绝删除并返回 `comment_has_replies_use_layer_endpoint`（应改用上面的 `/comments/layer/:mainCommentId` 整层删除，避免孤儿回复因 `layerMainId` 被 `SetNull` 而错位到其它层）。

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
| `report_resolved` | 我的帖子/评论因举报被管理员删除 |

响应：

```jsonc
{
  "notifications": [
    {
      "kind": "post_commented",
      "createdAt": "...",
      "actor": { "id": "...", "username": "...", "displayName": null, "avatarUrl": null },
      "post": { "id": "...", "content": "..." },
      "comment": { "id": "...", "content": "..." }
    }
    // ... 其他类型结构见上表，字段略有差异
  ]
}
```

> 所有 `actor / sender / receiver / author` 字段统一使用「公开用户」结构 `{ id, username, displayName, avatarUrl }`（见 `/auth` 段落说明）。

### 举报

#### `POST /social/reports` 🔒

对帖子 / 评论 / 用户发起举报。同一举报人对同一目标仅允许一条 `open` 状态的举报。

**Body**

```json
{ "targetType": "post" | "comment" | "user", "targetId": "<id>", "reason": "最多 200 字" }
```

**201**：`{ report: { id, targetType, targetId, status, createdAt } }`

**常见错误**

| 状态 | error | 说明 |
| --- | --- | --- |
| 400 | `invalid_target_type` | 目标类型非法 |
| 400 | `missing_target_id` / `missing_reason` | 参数缺失 |
| 400 | `reason_too_long` | 理由超过 200 字 |
| 400 | `cannot_report_self` | 举报对象是本人（帖子/评论的作者或 user 本人） |
| 404 | `target_not_found` | 目标不存在或已删除 |
| 409 | `already_reported` | 同目标已有 open 举报 |

#### `GET /social/admin/reports?status=open&take=50` 🔒（管理员）

- `status` 可选：`open`（默认）/ `resolved` / `rejected` / `all`。
- `take`：1~100，默认 50。
- 非管理员返回 `403 forbidden_admin_only`。

**200**

```jsonc
{
  "reports": [
    {
      "id": "...",
      "targetType": "post",
      "targetId": "...",
      "reason": "...",
      "status": "open",
      "reviewerNote": null,
      "reviewedAt": null,
      "createdAt": "...",
      "reporter": { "id": "...", "username": "...", "displayName": null, "avatarUrl": null },
      "targetUser": { "id": "...", "username": "...", "displayName": null, "avatarUrl": null },
      "reviewer": null,
      "targetSnapshot": { "kind": "post", "content": "帖子正文摘要" }
    }
  ]
}
```

- `targetSnapshot.kind`：`post` / `post_deleted` / `comment` / `comment_deleted` / `user`，用于前端展示上下文；已删目标只下发类型标记。

#### `PATCH /social/admin/reports/:reportId` 🔒（管理员）

**Body**

```json
{ "action": "resolve" | "reject", "note": "审核留言（可选，<=500 字）" }
```

- `action=resolve`：标记通过。
  - `targetType=post`：同步删除帖子（级联清理媒体），并给作者下发 `report_resolved` 系统通知；同目标的其它 `open` 举报也被置为 `resolved`。
  - `targetType=comment`：同步删除这一条评论，向作者下发 `report_resolved`；**若目标是「层主评论」，会连同同层回复一并删除**，并向同层回复作者下发 `comment_deleted_by_admin`（避免回复在前端回落到 `@用户名` 启发式被错位）。同目标其它 `open` 联动 `resolved`。
  - `targetType=user`：仅标记为 `resolved`，不自动执行任何处置，管理员需在后台另行处理。
- `action=reject`：仅更新状态与留言，不触及目标。
- 只能处理 `status=open` 的举报；否则 `409 report_not_open`。

**200**：`{ report: <展开的 report，含 reporter/targetUser/reviewer> }`

**常见错误**

| 状态 | error | 说明 |
| --- | --- | --- |
| 400 | `invalid_action` | `action` 不是 `resolve` / `reject` |
| 400 | `reviewer_note_too_long` | 留言超过 500 字 |
| 403 | `forbidden_admin_only` | 非管理员 |
| 404 | `report_not_found` | 举报不存在 |
| 409 | `report_not_open` | 举报已不是 `open` 状态 |

---

## 静态媒体

### `GET /uploads/:filename`

上传后的图片/视频静态文件。返回 404 时 Express 会交还给错误处理。

---

## 变更约定

> **任何路由新增 / 修改 / 删除都必须同步更新本文件**，并在 [CHANGELOG.md](../CHANGELOG.md) 添加一条记录（见 [CONTRIBUTING.md](../CONTRIBUTING.md)）。
