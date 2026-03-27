#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> 启动 PostgreSQL 容器"
docker compose up -d

echo "==> 等待数据库就绪"
for i in {1..30}; do
  if docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
  echo "数据库未就绪，请检查 Docker 状态。"
  exit 1
fi

echo "==> 执行 Prisma 迁移"
npm exec -w "@uniblog/api" prisma migrate deploy

echo "==> 启动后端与前端（Ctrl+C 结束）"
cleanup() {
  jobs -p | xargs -r kill >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

npm run dev:api &
npm run dev:web &
wait
