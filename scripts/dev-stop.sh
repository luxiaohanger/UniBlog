#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.dev-logs"

stop_by_pid_file() {
  local name="$1"
  local file="$2"
  if [ -f "$file" ]; then
    local pid
    pid="$(cat "$file" 2>/dev/null || true)"
    if [ -n "${pid:-}" ] && kill -0 "$pid" >/dev/null 2>&1; then
      echo "停止 ${name} 进程: ${pid}"
      kill "$pid" >/dev/null 2>&1 || true
      sleep 1
      if kill -0 "$pid" >/dev/null 2>&1; then
        kill -9 "$pid" >/dev/null 2>&1 || true
      fi
    fi
    rm -f "$file"
  fi
}

echo "==> 停止 dev:refresh 启动的进程"
stop_by_pid_file "API" "$LOG_DIR/dev-api.pid"
stop_by_pid_file "Web" "$LOG_DIR/dev-web.pid"

echo "==> 兜底清理 3000/4000 端口占用"
for port in 3000 4000; do
  pids="$(lsof -tiTCP:${port} -sTCP:LISTEN || true)"
  if [ -n "${pids}" ]; then
    echo "释放端口 ${port}: ${pids}"
    kill -9 ${pids} >/dev/null 2>&1 || true
  fi
done

echo "完成。前后端开发服务已停止。"
