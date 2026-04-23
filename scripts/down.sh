#!/usr/bin/env bash
# 停止 Compose 栈（保留数据卷）。用法见 scripts/README.md
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker/compose.yml"
LOG_DIR="$ROOT_DIR/.dev-logs"
PORTS_FILE="$LOG_DIR/ports.env"

cd "$ROOT_DIR"

if [[ -f "$PORTS_FILE" ]]; then
  echo "==> docker compose down（保留 postgres_data、uniblog_node_modules 等卷）"
  docker compose -f "$COMPOSE_FILE" --env-file "$PORTS_FILE" down
else
  echo "==> 未找到 $PORTS_FILE（无法解析 compose 中的宿主机端口变量）"
  echo "    将按固定容器名停止并删除：uniblog_web_dev / uniblog_api_dev / uniblog_postgres"
  docker rm -f uniblog_web_dev uniblog_api_dev uniblog_postgres 2>/dev/null || true
fi

echo "完成。删库卷请: docker volume ls | grep uniblog"
