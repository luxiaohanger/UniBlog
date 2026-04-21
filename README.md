# UniBlog

> 一个基于 Next.js + Express + Prisma + PostgreSQL 的轻量社交博客平台（Monorepo）。
> 支持发帖（图文 / 视频）、分层级评论、点赞 / 收藏 / 转发、好友关系、私信、系统通知、管理员与帖子置顶等能力。

![status](https://img.shields.io/badge/status-MVP-blue)
![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![stack](https://img.shields.io/badge/stack-Next.js%2014%20%7C%20Express%20%7C%20Prisma-purple)

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [常用脚本](#常用脚本)
- [环境变量](#环境变量)
- [文档索引](#文档索引)
- [变更日志](#变更日志)
- [贡献指南](#贡献指南)

---

## 功能特性

- **账户体系**：邮箱/用户名登录、JWT Access + 一次性 Refresh Token、密码哈希（bcrypt）。
- **内容发布**：富文本正文 + 最多 3 个媒体附件（图片/视频，50 MB 上限），作者主页 & 圈子页双维度置顶（每维度最多 3 篇）。
- **评论互动**：支持「层主 + 同层回复」的两级评论结构，兼容历史 `@用户名` 旧数据。
- **社交行为**：点赞、收藏、转发、已读/未读红点、好友申请/解除、一对一私信。
- **通知中心**：评论、回复、点赞、收藏、管理员删除行为的聚合通知流。
- **管理员能力**：删任意帖、删任意评论（单条 / 整层）、全局置顶。
- **开发体验**：根目录一键启动（Docker Postgres + API + Web）、统一日志、热重启。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Next.js 14（App Router）、React 18、SWR、TypeScript |
| 后端 | Express 4、TypeScript、JWT、Multer |
| 数据 | PostgreSQL 16、Prisma 6 ORM |
| 基建 | Docker Compose、npm workspaces |
| 样式 | 内联 `style={{...}}` + `globals.css` 全局类（见 [.cursorrules](./.cursorrules)） |

## 项目结构

```text
uniblog/
├── apps/
│   ├── api/               # 后端服务 (@uniblog/api)
│   │   ├── prisma/        # 数据库 Schema 与迁移
│   │   ├── src/
│   │   │   ├── app.ts     # Express 应用装配
│   │   │   ├── index.ts   # 启动入口
│   │   │   ├── lib/       # 基础设施（prisma / auth / roles / commentTree）
│   │   │   ├── middleware # 鉴权中间件
│   │   │   └── routes/    # 路由：auth / posts / social
│   │   └── uploads/       # 本地上传目录（不入库）
│   └── web/               # 前端应用 (@uniblog/web)
│       └── src/
│           ├── app/       # App Router 页面
│           ├── components # 复用组件
│           └── lib/       # http / token / 工具
├── scripts/               # dev-up / dev-stop 脚本
├── docker-compose.yml     # 本地 Postgres
└── docs/                  # 架构、API、数据库、前端等详细文档
```

## 快速开始

### 1. 先决条件

- Node.js ≥ 18（建议 20 LTS）
- npm ≥ 9（仓库使用 npm workspaces）
- Docker Desktop（用于运行 Postgres 容器）

### 2. 安装依赖

```bash
# 在仓库根目录执行
npm install
```

### 3. 配置后端环境变量

```bash
cp apps/api/.env.example apps/api/.env
# 按需修改 DATABASE_URL / JWT_ACCESS_SECRET 等
```

### 4. 启动全部服务

```bash
npm run dev:up
```

脚本会自动完成：

1. 启动 / 复用 `uniblog_postgres` 容器（5432 端口）。
2. 等待数据库就绪后执行 `prisma generate` + `prisma migrate deploy`。
3. 释放 3000 / 4000 端口后台启动 Web 与 API，并 tail 日志。

启动完成后：

- 前端：<http://localhost:3000>
- API：<http://localhost:4000>（健康检查 `/health`）

停止服务：

```bash
npm run dev:stop
```

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev:up` | 启动 Postgres + API + Web，并实时 tail 日志 |
| `npm run dev:stop` | 停止由 `dev:up` 拉起的前后端进程并清理端口 |
| `npm run dev:api` | 仅启动后端（`tsx watch`） |
| `npm run dev:web` | 仅启动前端（`next dev`） |
| `npm run build` | 构建前后端产物 |
| `npm run lint` | 运行前后端 Lint |
| `npm exec -w "@uniblog/api" prisma migrate dev` | 创建新迁移（修改 schema 后使用） |

> 数据库相关命令请统一使用 `npm exec -w "@uniblog/api" <cmd>`（见 [.cursorrules](./.cursorrules)）。

## 环境变量

详细清单见 [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md#环境变量)。核心变量：

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/uniblog` | Prisma 连接串 |
| `JWT_ACCESS_SECRET` | `dev_access_secret` | Access Token 签名密钥（**生产必改**） |
| `JWT_ACCESS_EXPIRES_IN` | `24h` | Access Token 过期 |
| `JWT_REFRESH_EXPIRES_DAYS` | `30` | Refresh Token 过期天数 |
| `PORT` | `4000` | API 端口 |
| `CORS_ORIGIN` | 未设置则允许任意 localhost | 逗号分隔的白名单 |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:4000` | 前端访问 API 的基址 |

## 文档索引

| 文档 | 说明 |
| --- | --- |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 架构总览、模块划分、请求流程 |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) | 开发流程、脚本、环境变量、常见问题 |
| [docs/API.md](./docs/API.md) | 全部 REST 接口说明与响应格式 |
| [docs/DATABASE.md](./docs/DATABASE.md) | 数据模型、索引、迁移约定 |
| [docs/FRONTEND.md](./docs/FRONTEND.md) | 前端页面与组件结构 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本变更记录 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 贡献规范与「代码 + 文档同步」约定 |

## 变更日志

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，见 [CHANGELOG.md](./CHANGELOG.md)。

## 贡献指南

请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。核心约定：

> **任何代码变更都必须同步更新相关文档**（README / docs/\* / CHANGELOG）。

## License

ISC © UniBlog contributors
