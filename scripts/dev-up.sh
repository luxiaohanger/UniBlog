#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

LOG_DIR="$ROOT_DIR/.dev-logs"
mkdir -p "$LOG_DIR"

echo "==> 启动/确保 PostgreSQL 容器"
# 若存在同名但非当前 compose 管理的残留容器，先清理，避免命名冲突
if ! docker compose up -d 2>/dev/null; then
  if docker ps -a --format '{{.Names}}' | grep -q '^uniblog_postgres$'; then
    echo "检测到同名残留容器 uniblog_postgres，正在移除..."
    docker rm -f uniblog_postgres >/dev/null
  fi
  docker compose up -d
fi

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

echo "==> 释放旧的前后端进程（3000/4000）"
for port in 3000 4000; do
  pids="$(lsof -tiTCP:${port} -sTCP:LISTEN || true)"
  if [ -n "${pids}" ]; then
    echo "释放端口 ${port}: ${pids}"
    kill -9 ${pids} >/dev/null 2>&1 || true
  fi
done

# 清空上一次日志，避免 tail 显示陈旧内容
: > "$LOG_DIR/dev-api.log"
: > "$LOG_DIR/dev-web.log"

echo "==> 后台启动后端与前端"
nohup npm run dev:api >"$LOG_DIR/dev-api.log" 2>&1 &
echo $! >"$LOG_DIR/dev-api.pid"
nohup npm run dev:web >"$LOG_DIR/dev-web.log" 2>&1 &
echo $! >"$LOG_DIR/dev-web.pid"

cat <<EOF

==> 服务已在后台启动
  后端日志: $LOG_DIR/dev-api.log
  前端日志: $LOG_DIR/dev-web.log

提示: Ctrl+C 仅退出日志跟随，前后端继续在后台运行
      停止服务请执行: npm run dev:stop

----------------------------------------
EOF

# 实时跟随日志；Ctrl+C 只结束 tail，不影响后台进程
trap 'echo; echo "(已退出日志跟随；服务仍在后台运行)"; exit 0' INT TERM
exec tail -n +1 -F "$LOG_DIR/dev-api.log" "$LOG_DIR/dev-web.log"
