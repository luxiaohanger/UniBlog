#!/usr/bin/env bash
# Web 开发容器：依赖由 api 容器先行安装；此处仅启动 Next（须等 api healthy 后再调度）
set -euo pipefail
cd /app

if [[ ! -d /app/node_modules ]]; then
  echo "[uniblog/web] 错误：未找到 node_modules，请确认 api 服务已成功启动并完成 npm ci。" >&2
  exit 1
fi

echo "[uniblog/web] 启动 Next.js …"
exec npm run dev -w @uniblog/web
