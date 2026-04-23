# 前端架构

基于 Next.js 14 App Router + React 18 + SWR 的单页体验。本文件列出路由、组件、状态、样式与扩展约定。

## 1. 目录结构

```text
apps/web/src/
├── app/                   # App Router 页面
│   ├── layout.tsx         # 全局外壳：AppShell + PageTransition
│   ├── globals.css        # 全局变量与工具类
│   ├── page.tsx           # 首页
│   ├── login/             # 登录（含「忘记密码」入口）
│   ├── register/          # 注册（邮箱验证码 + 60s 倒计时）
│   ├── forgot-password/   # 找回密码（邮箱验证码 → 新密码）
│   ├── circles/           # 圈子（公共 Feed）
│   ├── write/             # 发帖
│   ├── messages/          # 消息中心（聊天 + 系统）
│   ├── me/                # 我的主页（含 layout / favorites / settings 子路由）
│   │   ├── favorites/     # 我的收藏
│   │   └── settings/      # 资料设置（展示名 / 简介 / 头像）
│   ├── user/[userId]/     # 他人主页
│   └── admin/reports/     # 管理员审核队列（仅 role=admin 可访问）
├── components/
│   ├── AppShell.tsx       # 顶层布局（Header + 主区）
│   ├── Header.tsx         # 顶部导航 + 未读红点 + 退出登录
│   ├── PageTransition.tsx # 路由切换动画
│   ├── PostCard.tsx       # 帖子卡片（Feed / 主页 / 收藏复用）
│   ├── Avatar.tsx         # 统一头像（有 avatarUrl 显示图片，否则首字母渐变圆）
│   ├── AddFriendButton.tsx# 好友申请按钮（依关系状态切换）
│   ├── ReportButton.tsx   # 通用举报入口（帖子 / 评论 / 用户，弹窗填写理由）
│   ├── Modal.tsx          # 统一弹窗（Portal 渲染到 body，规避 backdrop-filter 截断）
│   └── UserProfileLink.tsx# 用户名跳转（接收 displayName，优先展示）
├── features/
│   ├── client/            # 统一入口：http / token / config（再导出 lib/*）
│   └── shared/            # 再导出 @uniblog/shared（buildCommentTree、ApiErrors）
└── lib/
    ├── http.ts            # apiFetch（带 401 auto refresh）
    ├── token.ts           # Access/Refresh/用户名持久化
    ├── config.ts          # API_BASE_URL（须 NEXT_PUBLIC_API_BASE_URL，Docker 由 compose 注入）
    ├── replyDisplay.ts    # 回复展示辅助
    └── unread.ts          # 未读红点状态（lastSeen + unread + 订阅）
```

评论层级构建已迁入 monorepo 包 `@uniblog/shared`，前端通过 `features/shared` 或直连包名引用。

### 1.1 公开路由（无需登录）

`AppShell.tsx` 里的 `isPublicPath` 定义了可匿名访问的白名单：

- `/`、`/login`、`/register`、`/forgot-password`

其它路由均需要登录，未持有 token 会被统一跳转到 `/login`。

## 2. 路由与登录拦截

App Router 中，**路由跳转不会自动处理 401**。业务页面如需拦截：

```tsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getTokens } from '@/lib/token';

export default function ProtectedPage() {
  const router = useRouter();
  useEffect(() => {
    if (!getTokens()) router.replace('/login');
  }, [router]);
  // ...
}
```

或在 SWR fetcher 中捕获 `apiFetch` 抛出的错误，按 `Error.message === 'unauthorized'` 判断。

## 3. 数据获取

统一通过 `apiFetch<T>(path, { method, body, headers })`：

- 自动附加 `Authorization: Bearer <accessToken>`（登录/注册路径除外）。
- 收到 401 时尝试刷新一次；失败再清除 token。
- `FormData` 请求由调用方自行传 body；其它类型会 JSON 序列化并补 `content-type`。

配合 SWR：

```tsx
const { data } = useSWR<Feed>(
  '/posts/feed',
  () => apiFetch<Feed>('/posts/feed'),
  { refreshInterval: 15000 }
);
```

## 4. 未读与通知

`lib/unread.ts` 提供：

- `getUnreadMap()`：`{ [friendId]: ISOString, system: ISOString }`。
- `setUnread(key, createdAt)` / `clearUnread(key)`。
- `getLastSeenMap()` / `setLastSeen()`：用户查看后写入。
- `subscribeUnreadChanged(cb)`：跨组件订阅。

`Header.tsx` 实现：

- 轮询 `/social/friends/list` + 每位好友的 `/social/messages/:friendId` 判定聊天未读。
- 轮询 `/social/notifications?take=20` 配合 `getSystemReadKeySet()` 判断系统未读。
- 轮询 `/social/friends/requests/pending` 作为申请未读。
- 综合三路未读 → 渲染导航「消息」节点红点。

## 5. 样式约定

- 优先 `style={{...}}` 内联样式。
- 全局设计令牌 / 类放 `app/globals.css`（如 `var(--brand-500)` / `.nav-link` / `.btn-primary`）。
- **严禁新建 `*.module.css`**（见 [.cursorrules](../.cursorrules) 第 2 条）。
- 新增动画/复杂类时，在 `globals.css` 内用语义类名，加注释说明使用场景。
- `.text-line-fit` 仅钳制「阅读态」文字节点（标题、正文、用户名）的最大宽度；**作用到 `<input>/<textarea>` 时已在 CSS 里被重置为 `max-width: none`**，避免表单控件视觉上比布局窄一截。

## 6. 新增页面 Checklist

1. 在 `app/<route>/page.tsx` 创建组件，默认标记 `'use client'`（需交互）或服务端组件（纯展示）。
2. 如需登录：组件内调用 `getTokens()` 判断并跳转。
3. 数据：`useSWR` + `apiFetch`；避免直接 `fetch` 丢失鉴权逻辑。
4. 交互：必须包含 Loading / Empty / Error 三态。
5. 样式：`style={{}}` 或 `globals.css` 已有类。
6. 若新增文案/提示，保持中文；错误映射参考 [`API.md`](../../api/docs/API.md) 的错误码。
7. 更新本文档「目录结构」与「路由与登录拦截」相关段落。

## 7. 组件复用要点

| 组件 | 要点 |
| --- | --- |
| `PostCard` | Feed / 我的 / 收藏 / 作者页复用，通过 props 决定显示「置顶」「删除」入口；点击评论图标即在卡片内联切换展开/折叠评论区；头部展示 `Avatar` + `displayName`；非作者登录用户可从「⋮」菜单举报帖子，评论行尾内联显示「举报」 |
| `ReportButton` | 通用举报入口，支持 `targetType=post/comment/user`；未登录点击跳转 `/login`；触发后弹窗收集 ≤ 200 字理由并调用 `POST /social/reports` |
| `Modal` | 统一弹窗容器，`createPortal` 到 `document.body`，避免被祖先 `backdrop-filter / transform` 生成的 containing block 截断；提供 `title / description / children / footer` 统一结构，所有确认/表单类弹窗（退出登录、删除帖子、举报、审核）都走此组件 |
| `Avatar` | 统一头像组件，入参 `avatarUrl / username / displayName / size`；为空时回退到「首字母渐变圆」 |
| `AddFriendButton` | 依赖 `/social/friends/relationship/:userId` 返回的 `kind` 动态渲染 |
| `UserProfileLink` | 统一用户名跳转，优先显示 `displayName`，悬浮 title 提示 `@username` |
| `PageTransition` | 路由切换淡入动画，放在根 layout 内 |

### 7.1 个人资料 / 头像

- `/me/settings` 页面集成两段式表单：**头像** 与 **基础资料**。
  - 头像：`<input type="file">` 隐藏，点击「更换头像」按钮触发；提交到 `POST /auth/me/avatar`，成功后刷新本地 `user` 与 Avatar 预览。客户端前置校验（≤ 5 MB、jpg/png/webp/gif）与后端保持一致。
  - 资料：`PATCH /auth/me` 更新 `displayName` / `bio`；两字段都可清空（空字符串或未填均视为 `null`）。保存成功后同步 `setStoredDisplayUsername`，顶栏「主页」文案即时刷新。
- 所有渲染用户的位置（`Header` / `PostCard` 作者 + 评论作者 / 消息中心好友行、活动消息发起人 / `user/[userId]` 主页）统一走 `Avatar` 组件，避免每个页面手写「首字母圆」样式。
- 展示名回退规则：`displayName?.trim() || username`。

### 7.2 PostCard 评论区展开

- 所有使用 `PostCard` 的页面（Feed / 我的 / 收藏 / 作者页）行为一致：点击评论图标即在卡片内联展开/折叠评论区（未缓存时调用 `GET /posts/:id` 拉取 `comments` 并构建层级）。
- `focusCommentId` 传入时会自动展开评论并滚动到对应评论（用于消息中心通知跳转，以及 `/circles?postId=&commentId=` 外链跳转）。
- 管理员在 `/admin/reports` 审核卡片里点击「查看详情 / 跳转所在帖子」会跳到 `/circles?postId=<postId>&commentId=<commentId?>`，复用同一套定位逻辑。

### 7.3 举报与管理员审核

- 入口：
  - **帖子**：`PostCard` 头部「⋮」菜单的「举报」（仅对非作者、已登录用户可见）。
  - **评论**：评论操作行尾内联「举报」按钮，只要登录且不是自己的评论即可点击。
  - **用户**：他人主页标题旁的「举报该用户」按钮。
- 举报提交：`POST /social/reports`，同一目标同一举报人仅允许一条 `open`，再次点击会提示「已提交过」。
- 管理员审核：
  - `/admin/reports` 页面，按 `open/resolved/rejected/all` 切换 Tab（默认 `open`）。
  - 每条举报卡片展示举报人、被举报用户、理由、目标内容快照（帖子正文 / 评论正文 / 用户主页链接）。
  - 「通过并处置」→ 调 `PATCH /social/admin/reports/:id action=resolve`；帖子 / 评论会被同步删除并给作者发送 `report_resolved` 系统通知。用户类举报仅标记为 `resolved`，不自动处置。
  - 「驳回」→ `action=reject`，仅关闭该条举报。
  - 任一操作都可选填 ≤ 500 字的审核留言。
- `Header` 在 `role=admin` 时会多一个「管理」导航项，并轮询 `open` 举报数量展示红点。

## 8. 性能 / UX 注意事项

- SWR 默认 `focus revalidate`，顶栏轮询设置了 `refreshWhenHidden: true` 以保证红点实时性。
- 列表接口目前服务端限流（30 / 50 / 200 条），无分页；大列表需求请先与后端商讨游标分页再实现前端加载更多。
- 上传媒体一次最多 3 个文件；前端提交前可在 `write/page.tsx` 做数量 & 大小预校验，避免后端 `MulterError` 绕远。

> 文档随页面或核心组件变更同步更新；删除 / 重命名组件时，务必同步本文件与相关截图（如有）。
