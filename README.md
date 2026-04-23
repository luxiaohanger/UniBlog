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
- [环境变量](#环境变量)
- [文档索引](#文档索引)（[脚本 / 一键启动](./scripts/README.md)、[Docker 细节](./docker/README.md)）
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
- **开发体验**：Docker Compose 一键启动（Postgres + API + Web 均在容器内）、自动探测可用端口、日志跟随。

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
│   │   ├── docs/          # API / 数据库 / 开发指南
│   │   ├── prisma/        # 数据库 Schema 与迁移
│   │   ├── src/
│   │   │   ├── app.ts     # Express 应用装配
│   │   │   ├── index.ts   # 启动入口
│   │   │   ├── lib/       # prisma / auth / config / logger / uploads 等
│   │   │   ├── services/  # 领域用例（auth / posts / social / reports）
│   │   │   ├── validators/# zod 校验
│   │   │   ├── middleware # 鉴权中间件
│   │   │   └── routes/    # 薄路由
│   │   └── uploads/       # 本地上传目录（不入库）
│   └── web/               # 前端应用 (@uniblog/web)
│       ├── docs/          # 前端文档
│       └── src/
│           ├── app/       # App Router 页面
│           ├── components # 复用组件
│           ├── features/  # client（http/token/config）与 shared 再导出
│           └── lib/       # http / token / 工具（features 聚合引用）
├── packages/
│   └── shared/            # @uniblog/shared（评论树等前后端共用）
├── docker/                # compose.yml、容器入口脚本与 README
├── scripts/               # up.sh / down.sh（Bash，一键 Compose）+ README
├── docs/                  # 架构、CHANGELOG、CONTRIBUTING、文档索引
└── package.json           # npm workspaces 根
```

## 快速开始

**全栈开发**：依赖 **Docker**（含 Compose V2）、**bash** 与 **[`scripts/up.sh`](./scripts/up.sh)**。脚本说明见 **[scripts/README.md](./scripts/README.md)**，容器与卷见 [docker/README.md](./docker/README.md)。

### 各操作系统

| 系统 | Docker | 终端 / Shell |
| --- | --- | --- |
| **macOS** | [Docker Desktop](https://www.docker.com/products/docker-desktop/) | 系统自带「终端」或其它已安装 `bash` 的终端即可。 |
| **Linux** | [Docker Engine](https://docs.docker.com/engine/install/) + [Compose 插件](https://docs.docker.com/compose/install/linux/)（或 Docker Desktop for Linux） | 常见发行版默认 `bash`；确保 `docker compose version` 可用。 |
| **Windows** | [Docker Desktop](https://www.docker.com/products/docker-desktop/) | **请使用 [Git Bash](https://git-scm.com/download/win)**（安装 Git for Windows 时勾选 Git Bash）。在本仓库中执行 `bash scripts/up.sh` / `bash scripts/down.sh`。**勿用 CMD 或 PowerShell 直接运行** `.sh`（脚本仅按 Bash 编写与验证）。 |

1. **按上表安装并启动 Docker**，等待引擎就绪（例如 Docker Desktop 托盘图标显示运行中）。
2. **按上表打开对应终端**，`cd` 到本仓库**根目录**（包含 `docker/compose.yml` 与 `scripts/` 的那一层）。

首次执行 `up.sh` 时会**自动**根据 `apps/api/.env.example` 创建或**合并** `apps/api/.env`（仅追加模板里尚未出现的变量，不覆盖已有值）。变量说明见下文 [环境变量](#环境变量) 与 [`apps/api/docs/DEVELOPMENT.md`](./apps/api/docs/DEVELOPMENT.md)。

### 一键启动与停止

```bash
bash scripts/up.sh
```

```bash
bash scripts/down.sh
```

更多说明见 **[scripts/README.md](./scripts/README.md)**。

## 环境变量

详细清单见 [`apps/api/docs/DEVELOPMENT.md`](./apps/api/docs/DEVELOPMENT.md#环境变量)。核心变量：

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/uniblog` | Prisma 连接串 |
| `JWT_ACCESS_SECRET` | `dev_access_secret` | Access Token 签名密钥（**生产必改**） |
| `JWT_ACCESS_EXPIRES_IN` | `24h` | Access Token 过期 |
| `JWT_REFRESH_EXPIRES_DAYS` | `30` | Refresh Token 过期天数 |
| `PORT` | `4000` | API **容器内**监听端口（宿主机映射见 `UNIBLOG_API_PORT`） |
| `CORS_ORIGIN` | 未设置则允许任意 localhost | 逗号分隔的白名单 |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:<API 端口>` | 由 `up.sh` 写入的 `UNIBLOG_API_PORT` 与 Compose 对齐 |

## 文档索引

完整地图见 [docs/README.md](./docs/README.md)。

| 文档 | 说明 |
| --- | --- |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 架构总览、模块划分、请求流程 |
| [scripts/README.md](./scripts/README.md) | **一键启停**（`scripts/up.sh` / `down.sh`） |
| [docker/README.md](./docker/README.md) | 容器架构、卷、环境变量与排错 |
| [apps/api/docs/DEVELOPMENT.md](./apps/api/docs/DEVELOPMENT.md) | Docker 开发流程、环境变量、常见问题 |
| [apps/api/docs/API.md](./apps/api/docs/API.md) | 全部 REST 接口说明与响应格式 |
| [apps/api/docs/DATABASE.md](./apps/api/docs/DATABASE.md) | 数据模型、索引、迁移约定 |
| [apps/web/docs/FRONTEND.md](./apps/web/docs/FRONTEND.md) | 前端页面与组件结构 |
| [docs/CHANGELOG.md](./docs/CHANGELOG.md) | 版本变更记录 |
| [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) | 贡献规范与「代码 + 文档同步」约定 |

## 变更日志

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，见 [docs/CHANGELOG.md](./docs/CHANGELOG.md)。

## 贡献指南

请先阅读 [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md)。核心约定：

> **任何代码变更都必须同步更新相关文档**（README / docs / app docs / CHANGELOG）。

## License

ISC © UniBlog contributors
