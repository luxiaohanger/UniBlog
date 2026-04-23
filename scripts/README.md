# 脚本说明（Docker 一键启停）

仓库内**与启停相关的逻辑全部在 `scripts/` 的 Bash 脚本中**。日常只需 **Docker（含 Compose V2）** 与 **bash**；本机 **Node 可选**（仅编辑器 / CI 上执行 `npm run build` / `lint` / `test`、或 `npm exec -w "@uniblog/api" prisma …`）。

## 各系统安装 Docker（简引）

以下为官方入口与要点；装好后在终端执行 `docker version` 与 `docker compose version` 均应成功。

| 系统 | 推荐方式 | 说明 |
| --- | --- | --- |
| **macOS** | [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/) | Apple Silicon / Intel 按文档选择对应安装包；首次启动在菜单栏确认 Docker 已运行。 |
| **Windows** | [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) | 通常需启用 **WSL 2** 后端（安装向导会提示）。跑本仓库脚本请在 **Git Bash** 中执行 `bash scripts/up.sh`，见根目录 [README.md](../README.md#各操作系统)。 |
| **Linux** | [Docker Engine](https://docs.docker.com/engine/install/) + [Compose 插件](https://docs.docker.com/compose/install/linux/) | 按发行版选安装页（Ubuntu / Debian / Fedora 等）。非 root 用户可将账号加入 `docker` 组后重新登录：`sudo usermod -aG docker $USER`（以发行版文档为准）。 |

装好后若 `up.sh` 报「Docker 未运行」，请先打开 Docker Desktop（或启动 `docker` 服务）再重试。

## 脚本一览

| 文件 | 作用 |
|------|------|
| [`up.sh`](./up.sh) | 检查 Docker → **检查/合并** `apps/api/.env`（相对 `.env.example`）→ 分配宿主机端口 → 写入 `.dev-logs/ports.env` → `docker compose up -d` → 跟随 `api`/`web` 日志 |
| [`down.sh`](./down.sh) | `docker compose down`（保留卷），使用 `.dev-logs/ports.env` 中的端口变量 |

容器内行为（镜像、入口、环境变量）见 [docker/README.md](../docker/README.md)。

## 最简流程

请先用 **`git clone`** 获取源码并 **`cd` 到仓库根目录**（无 Git 时可下载 zip 解压后同样进入该目录），再执行：

```bash
bash scripts/up.sh
```

停止：

```bash
bash scripts/down.sh
```

`up.sh` 会在首次启动前自动从 `apps/api/.env.example` **创建** `apps/api/.env`，或在文件已存在时把模板里**尚未出现**的变量行**追加**进去（不覆盖已有键）。生产请自行改强密钥与 SMTP 等，说明见 [`apps/api/docs/DEVELOPMENT.md`](../apps/api/docs/DEVELOPMENT.md)。

## 端口说明

`up.sh` 在脚本顶部以 `PG_PORT_LO` / `API_PORT_LO` / `WEB_PORT_LO`（及对应 `_HI`）定义区间，用**同一套** `port_free` + `choose_port` 选取**首个空闲**宿主机端口，并写入 `.dev-logs/ports.env`。修改区间请只改 `scripts/up.sh` 顶部常量。

当前默认：Postgres 5432–5449，API 4000–4099，Web 3000–3099。

终端会打印实际 URL。前端通过 `NEXT_PUBLIC_API_BASE_URL` 指向 `http://localhost:<API 端口>`（由 Compose 注入）。

## 与 npm 的关系

根目录 `package.json` 保留 `build`、`test`、`lint`、`prisma:validate` 等，供 **CI 与本机工具链**（不启动独立 API/Web 进程）。**运行中的全栈**请只用 Docker + `scripts/up.sh` / `down.sh`。

## 生产部署

本脚本面向**本地/内网一体化开发**。生产请：多阶段构建镜像、密钥注入、反向代理、健康检查与数据备份等，勿直接沿用开发用 `docker/compose.yml` 与入口脚本。
