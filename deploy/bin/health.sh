#!/usr/bin/env bash
# VERYAL 运维脚本
set -uo pipefail

APP_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT=veryal-backend
APP_PORT=8080
WEB_PORT=8899

c_ok()  { printf '\033[1;32m%s\033[0m\n' "$*"; }
c_inf() { printf '\033[1;36m%s\033[0m\n' "$*"; }
c_err() { printf '\033[1;31m%s\033[0m\n' "$*"; }

health() { curl -fsS -m 3 "http://127.0.0.1:${APP_PORT}/actuator/health" 2>/dev/null; }

wait_ready() {
  local max="${1:-90}"
  for i in $(seq 1 "$max"); do
    if health >/dev/null; then
      c_ok "后端就绪（约 $((i * 2))s）"
      return 0
    fi
    sleep 2
  done
  c_err "启动超时，查看日志: ${APP_HOME}/logs/error.log"
  return 1
}

H=$(curl -s -m 5 "http://127.0.0.1:${APP_PORT}/actuator/health" 2>/dev/null)
if [ -z "$H" ]; then
  c_err "后端不可达"
  exit 1
fi
echo "backend  $H"

for path in "/" "/api/v1/auth/login" "/actuator/health"; do
  code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:${WEB_PORT}${path}")
  printf '%-28s %s\n' "$path" "$code"
done

echo
echo "数据库:"
DB_PASS="$(awk -F= '/^VERYAL_DB_PASSWORD=/{sub(/^[^=]*=/, ""); gsub(/^["\x27]|["\x27]$/, ""); print; exit}' \
  "${APP_HOME}/config/.env" 2>/dev/null)"
DB_USER="$(awk -F= '/^VERYAL_DB_USER=/{sub(/^[^=]*=/, ""); gsub(/^["\x27]|["\x27]$/, ""); print; exit}' \
  "${APP_HOME}/config/.env" 2>/dev/null)"
docker exec veryal-mysql mysql -u"${DB_USER:-veryal}" -p"${DB_PASS:-veryal}" -N -e 'select 1' veryal_im 2>/dev/null \
  | head -1 | sed 's/^1$/  OK 可连接/' || echo "  连接失败"