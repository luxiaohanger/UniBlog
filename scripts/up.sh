#!/usr/bin/env bash
# 一键启动：Docker Compose（Postgres + API + Web）。本机仅需 Docker（含 compose）与 bash，无需 Node。
# 用法见 scripts/README.md
#
#   已在仓库根:     bash scripts/up.sh
#   可选克隆后启动: bash scripts/up.sh <Git URL> [本地目录名]
#   或:             UNIBLOG_GIT_URL=... UNIBLOG_CLONE_DIR=uniblog bash scripts/up.sh
set -euo pipefail

# 宿主机端口：在区间内用 port_free 选首个空闲端口，写入 .dev-logs/ports.env；docker/compose.yml 不设默认值，须依赖该文件或等价环境变量。
PG_PORT_LO=5432
PG_PORT_HI=5449
API_PORT_LO=4000
API_PORT_HI=4099
WEB_PORT_LO=3000
WEB_PORT_HI=3099

SOURCE="${BASH_SOURCE[0]:-$0}"
SCRIPTS_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
ROOT_DIR="$(cd "$SCRIPTS_DIR/.." && pwd)"

clone_and_enter() {
  local url="$1"
  local target="${2:-uniblog}"
  if ! command -v git >/dev/null 2>&1; then
    cat <<'EOF' >&2
未找到 git。请安装 git 后重试，或下载源码 zip 解压，进入目录后执行: bash scripts/up.sh
EOF
    exit 1
  fi
  if [[ -e "$target" ]]; then
    echo "错误: 已存在: $target" >&2
    exit 1
  fi
  echo "==> git clone $url -> $target"
  git clone "$url" "$target"
  cd "$target"
  ROOT_DIR="$(pwd)"
  SCRIPTS_DIR="$ROOT_DIR/scripts"
}

if [[ -f "$ROOT_DIR/docker/compose.yml" ]] && [[ -f "$SCRIPTS_DIR/up.sh" ]]; then
  cd "$ROOT_DIR"
elif [[ -n "${1:-}" ]]; then
  clone_and_enter "$1" "${2:-uniblog}"
elif [[ -n "${UNIBLOG_GIT_URL:-}" ]]; then
  clone_and_enter "$UNIBLOG_GIT_URL" "${UNIBLOG_CLONE_DIR:-uniblog}"
else
  cat <<'EOF' >&2
用法:
  • 在仓库根目录:  bash scripts/up.sh
  • 先克隆再启动:  bash scripts/up.sh <Git 仓库 URL> [目录名]

完整说明: scripts/README.md
EOF
  exit 1
fi

COMPOSE_FILE="$ROOT_DIR/docker/compose.yml"
LOG_DIR="$ROOT_DIR/.dev-logs"
mkdir -p "$LOG_DIR"
PORTS_FILE="$LOG_DIR/ports.env"

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "错误：未找到 docker。" >&2
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "错误：Docker 未运行。" >&2
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    echo "错误：需要 Docker Compose V2（docker compose）。" >&2
    exit 1
  fi
}

port_free() {
  local p="$1"
  if command -v lsof >/dev/null 2>&1; then
    ! lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v ss >/dev/null 2>&1; then
    ! ss -tln 2>/dev/null | grep -qE "[.:]${p}\$"
  else
    return 0
  fi
}

choose_port() {
  local start="$1" end="$2" name="$3"
  local p
  for p in $(seq "$start" "$end"); do
    if port_free "$p"; then
      echo "$p"
      return 0
    fi
  done
  echo "错误：${start}-${end} 无可用端口（${name}）。" >&2
  exit 1
}

# 若无 apps/api/.env 则从 .env.example 创建；若已存在则把模板里尚未出现的 KEY= 行追加到末尾（不覆盖已有值）
ensure_api_env() {
  local env_file="$ROOT_DIR/apps/api/.env"
  local example="$ROOT_DIR/apps/api/.env.example"
  local lock_dir="$LOG_DIR/.ensure_api_env.lock"
  local waited=0
  [[ -f "$example" ]] || return 0

  until mkdir "$lock_dir" 2>/dev/null; do
    if [[ "$waited" -ge 300 ]]; then
      echo "错误：等待 apps/api/.env 合并锁超时，请删除目录后重试: $lock_dir" >&2
      exit 1
    fi
    sleep 0.1
    waited=$((waited + 1))
  done
  trap 'rmdir "$lock_dir" 2>/dev/null || true' RETURN

  if [[ ! -f "$env_file" ]]; then
    cp "$example" "$env_file"
    echo "==> 已根据 apps/api/.env.example 创建 apps/api/.env，请按需修改 JWT_ACCESS_SECRET、SMTP 等。"
    return 0
  fi

  if [[ ! -s "$env_file" ]]; then
    cp "$example" "$env_file"
    echo "==> apps/api/.env 为空，已用 .env.example 填充。"
    return 0
  fi

  local merged=0 line key last
  last=$(tail -c1 "$env_file" || true)
  if [[ -n "$last" && "$last" != $'\n' ]]; then
    echo >> "$env_file"
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line//[[:space:]]}" ]] && continue
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)= ]]; then
      key="${BASH_REMATCH[1]}"
      if ! grep -qE "^[[:space:]]*${key}=" "$env_file"; then
        printf '%s\n' "$line" >> "$env_file"
        merged=1
      fi
    fi
  done < "$example"

  if [[ "$merged" -eq 1 ]]; then
    echo "==> 已向 apps/api/.env 合并 .env.example 中的新增变量（已有键未覆盖，请按需核对）。"
  fi
}

require_docker
ensure_api_env

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "提示（可选）: 本机可 npm install 仅改善编辑器；运行时依赖在容器内安装。"
  echo ""
fi

echo "==> 探测宿主机可用端口（区间内首个空闲端口）"
UNIBLOG_PG_PORT="$(choose_port "$PG_PORT_LO" "$PG_PORT_HI" postgres)"
UNIBLOG_API_PORT="$(choose_port "$API_PORT_LO" "$API_PORT_HI" api)"
UNIBLOG_WEB_PORT="$(choose_port "$WEB_PORT_LO" "$WEB_PORT_HI" web)"

cat >"$PORTS_FILE" <<EOF
# 由 scripts/up.sh 生成，供 down.sh / docker compose 使用
UNIBLOG_PG_PORT=${UNIBLOG_PG_PORT}
UNIBLOG_API_PORT=${UNIBLOG_API_PORT}
UNIBLOG_WEB_PORT=${UNIBLOG_WEB_PORT}
EOF

echo "    Postgres → ${UNIBLOG_PG_PORT}（容器内 5432）"
echo "    API      → ${UNIBLOG_API_PORT}"
echo "    Web      → ${UNIBLOG_WEB_PORT}"

echo "==> 清理残留同名容器"
if docker ps -a --format '{{.Names}}' | grep -qE '^(uniblog_postgres|uniblog_api_dev|uniblog_web_dev)$'; then
  docker rm -f uniblog_web_dev uniblog_api_dev uniblog_postgres >/dev/null 2>&1 || true
fi

echo "==> docker compose up -d（首次可能较慢）"
docker compose -f "$COMPOSE_FILE" --env-file "$PORTS_FILE" up -d

cat <<EOF

==> 已启动（容器内）
  前端 http://localhost:${UNIBLOG_WEB_PORT}
  API  http://localhost:${UNIBLOG_API_PORT}  /health
  端口: ${PORTS_FILE}

  停止: bash scripts/down.sh
  仅看日志: docker compose -f docker/compose.yml --env-file ${PORTS_FILE} logs -f api web

----------------------------------------
EOF

trap 'echo; echo "(已退出日志跟随；容器仍在运行)"; exit 0' INT TERM
docker compose -f "$COMPOSE_FILE" --env-file "$PORTS_FILE" logs -f api web
