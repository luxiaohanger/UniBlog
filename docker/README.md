# Docker 一体化开发环境

UniBlog 通过 **Docker Compose** 在容器内运行 **PostgreSQL 16**、**API** 与 **Web**。  
**如何启动 / 停止** 一律使用 Bash 脚本，见 **[scripts/README.md](../scripts/README.md)**（`bash scripts/up.sh`、`bash scripts/down.sh`）。

下文说明容器行为、网络与排错。

**Compose 文件**为仓库内 [`docker/compose.yml`](./compose.yml)（相对仓库根的绑定挂载为 `..:/app`）。宿主机端口变量**无默认值**，须与 `bash scripts/up.sh` 生成的 `.dev-logs/ports.env` 一致。手动执行 `docker compose` 时请使用 `-f docker/compose.yml --env-file .dev-logs/ports.env`（`up.sh` / `down.sh` 已自动传入）。

## 前置条件

- Docker Desktop 或 Docker Engine + **Compose V2**（`docker compose`）
- 可选：本机 `npm install` 仅服务编辑器；**运行时依赖在容器内 `npm ci`**（卷 `uniblog_node_modules`）

## 容器与数据

| 服务 | 镜像 | 说明 |
|------|------|------|
| postgres | `postgres:16` | 健康检查通过后 API 才执行迁移 |
| api | `node:20-bookworm` | `docker/entrypoint-api-dev.sh`：`npm ci`（按需）→ 构建 shared → `prisma generate` / `migrate deploy` → `tsx watch` |
| web | `node:20-bookworm` | `docker/entrypoint-web-dev.sh`：API **healthy** 后 `next dev -H 0.0.0.0 -p 3000` |

宿主机端口由 **`scripts/up.sh`** 探测并写入 `.dev-logs/ports.env`（Postgres 5432–5449，API 4000–4099，Web 3000–3099）。

## 环境变量与连接

- **容器内 API** 的 `DATABASE_URL`：`postgresql://postgres:postgres@postgres:5432/uniblog`（与宿主机映射端口无关）
- **宿主机**连库：`postgresql://postgres:postgres@localhost:<UNIBLOG_PG_PORT>/uniblog`（见 `ports.env`）
- **JWT / SMTP**：`apps/api/.env`（绑定挂载）；Compose 注入的 `DATABASE_URL` 优先于 `.env` 中的 localhost
- **浏览器调 API**：`NEXT_PUBLIC_API_BASE_URL=http://localhost:<UNIBLOG_API_PORT>`（由 Compose 根据 `ports.env` 代入）

## 常用命令

```bash
docker compose -f docker/compose.yml --env-file .dev-logs/ports.env ps
docker compose -f docker/compose.yml --env-file .dev-logs/ports.env logs -f api web
docker compose -f docker/compose.yml --env-file .dev-logs/ports.env restart api
```

## 故障排查

- **拉取镜像失败**（如 `docker.m.daocloud.io`…`EOF`、`connection reset`）：多为 **Docker 镜像加速** 不稳定。可在 Docker Desktop → **Settings** → **Docker Engine** 中暂时去掉或更换 `registry-mirrors`，**Apply & restart** 后执行 `docker pull node:20-bookworm`、`docker pull postgres:16`，再 `bash scripts/up.sh`。
- **API unhealthy**：首次 `npm ci` 较慢；`docker compose -f docker/compose.yml --env-file .dev-logs/ports.env logs api`
- **端口占满**：改 `scripts/up.sh` 中 `choose_port` 区间或释放端口
- **热更新慢**：挂载为 `:cached`（macOS）
- **CORS**：开发环境对 `http://localhost:*` 放行

## 与生产的区别

本文档仅描述**本地一体化开发**。生产请单独构建镜像、管理密钥与反向代理，勿直接沿用 `entrypoint-*-dev.sh`。
