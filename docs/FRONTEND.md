# 前端架构

基于 Next.js 14 App Router + React 18 + SWR 的单页体验。本文件列出路由、组件、状态、样式与扩展约定。

## 1. 目录结构

```text
apps/web/src/
├── app/                   # App Router 页面
│   ├── layout.tsx         # 全局外壳：AppShell + PageTransition
│   ├── globals.css        # 全局变量与工具类
│   ├── page.tsx           # 首页
│   ├── login/             # 登录
│   ├── register/          # 注册
│   ├── circles/           # 圈子（公共 Feed）
│   ├── write/             # 发帖
│   ├── messages/          # 消息中心（聊天 + 系统）
│   ├── me/                # 我的主页（含 layout 与 favorites 子路由）
│   │   └── favorites/     # 我的收藏
│   ├── user/[userId]/     # 他人主页
│   └── posts/[id]/        # 帖子详情（预留）
├── components/
│   ├── AppShell.tsx       # 顶层布局（Header + 主区）
│   ├── Header.tsx         # 顶部导航 + 未读红点 + 退出登录
│   ├── PageTransition.tsx # 路由切换动画
│   ├── PostCard.tsx       # 帖子卡片（Feed / 主页 / 收藏复用）
│   ├── AddFriendButton.tsx# 好友申请按钮（依关系状态切换）
│   └── UserProfileLink.tsx# 用户名跳转
└── lib/
    ├── http.ts            # apiFetch（带 401 auto refresh）
    ├── token.ts           # Access/Refresh/用户名持久化
    ├── config.ts          # API_BASE_URL
    ├── commentTree.ts     # 与后端 commentTree 对齐的层级构建
    ├── replyDisplay.ts    # 回复展示辅助
    └── unread.ts          # 未读红点状态（lastSeen + unread + 订阅）
```

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

## 6. 新增页面 Checklist

1. 在 `app/<route>/page.tsx` 创建组件，默认标记 `'use client'`（需交互）或服务端组件（纯展示）。
2. 如需登录：组件内调用 `getTokens()` 判断并跳转。
3. 数据：`useSWR` + `apiFetch`；避免直接 `fetch` 丢失鉴权逻辑。
4. 交互：必须包含 Loading / Empty / Error 三态。
5. 样式：`style={{}}` 或 `globals.css` 已有类。
6. 若新增文案/提示，保持中文；错误映射参考 [`docs/API.md`](./API.md) 的错误码。
7. 更新本文档「目录结构」与「路由与登录拦截」相关段落。

## 7. 组件复用要点

| 组件 | 要点 |
| --- | --- |
| `PostCard` | Feed / 我的 / 收藏 / 作者页复用，通过 props 决定显示「置顶」「删除」入口 |
| `AddFriendButton` | 依赖 `/social/friends/relationship/:userId` 返回的 `kind` 动态渲染 |
| `UserProfileLink` | 统一用户名跳转，避免各页面重复 `href` 拼写 |
| `PageTransition` | 路由切换淡入动画，放在根 layout 内 |

## 8. 性能 / UX 注意事项

- SWR 默认 `focus revalidate`，顶栏轮询设置了 `refreshWhenHidden: true` 以保证红点实时性。
- 列表接口目前服务端限流（30 / 50 / 200 条），无分页；大列表需求请先与后端商讨游标分页再实现前端加载更多。
- 上传媒体一次最多 3 个文件；前端提交前可在 `write/page.tsx` 做数量 & 大小预校验，避免后端 `MulterError` 绕远。

> 文档随页面或核心组件变更同步更新；删除 / 重命名组件时，务必同步本文件与相关截图（如有）。
