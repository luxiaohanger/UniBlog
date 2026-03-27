#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

LOG_DIR="$ROOT_DIR/.dev-logs"
mkdir -p "$LOG_DIR"

echo "==> 启动/确保 PostgreSQL 容器"
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

echo "==> 同步 Prisma 变更"
npm exec -w "@uniblog/api" prisma generate
npm exec -w "@uniblog/api" prisma migrate deploy

echo "==> 停止旧的前后端进程（3000/4000）"
for port in 3000 4000; do
  pids="$(lsof -tiTCP:${port} -sTCP:LISTEN || true)"
  if [ -n "${pids}" ]; then
    echo "释放端口 ${port}: ${pids}"
    kill -9 ${pids} || true
  fi
done

echo "==> 后台启动后端与前端"
nohup npm run dev:api >"$LOG_DIR/dev-api.log" 2>&1 &
echo $! >"$LOG_DIR/dev-api.pid"
nohup npm run dev:web >"$LOG_DIR/dev-web.log" 2>&1 &
echo $! >"$LOG_DIR/dev-web.pid"

echo "完成。"
echo "后端日志: $LOG_DIR/dev-api.log"
echo "前端日志: $LOG_DIR/dev-web.log"
echo "如需查看日志: tail -f \"$LOG_DIR/dev-api.log\" \"$LOG_DIR/dev-web.log\""
