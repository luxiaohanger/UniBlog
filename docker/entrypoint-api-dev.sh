#!/usr/bin/env bash
# API 开发容器：安装依赖（仅本容器首次/锁文件变更）、编译 shared、Prisma、迁移后启动 tsx watch
set -euo pipefail
cd /app

STAMP=/app/node_modules/.uniblog-docker-npm-stamp

need_install() {
  if [[ ! -d /app/node_modules ]]; then return 0; fi
  if [[ ! -f "$STAMP" ]]; then return 0; fi
  if [[ /app/package-lock.json -nt "$STAMP" ]]; then return 0; fi
  return 1
}

if need_install; then
  echo "[uniblog/api] 正在安装依赖（npm ci，首次可能较慢）…"
  npm ci
  touch "$STAMP"
fi

echo "[uniblog/api] 编译 @uniblog/shared …"
npm run build -w @uniblog/shared

echo "[uniblog/api] Prisma generate / migrate deploy …"
npm exec -w @uniblog/api prisma generate
npm exec -w @uniblog/api prisma migrate deploy

echo "[uniblog/api] 启动开发服务 …"
exec npm run dev -w @uniblog/api
