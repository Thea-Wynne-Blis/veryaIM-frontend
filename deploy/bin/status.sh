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

echo "──── 服务状态 ────"
printf '%-16s %s\n' "backend"       "$(systemctl is-active $UNIT 2>/dev/null)"
printf '%-16s %s\n' "nginx"         "$(systemctl is-active nginx 2>/dev/null)"
printf '%-16s %s\n' "docker mysql"  "$(docker inspect -f '{{.State.Status}}' veryal-mysql 2>/dev/null)"
printf '%-16s %s\n' "docker redis"  "$(docker inspect -f '{{.State.Status}}' veryal-redis 2>/dev/null)"
printf '%-16s %s\n' "docker rabbit" "$(docker inspect -f '{{.State.Status}}' veryal-rabbitmq 2>/dev/null)"

echo
echo "──── 健康检查 ────"
h=$(health) && echo "backend  $h" || echo "backend  不可达"

echo
echo "──── 端口监听 ────"
ss -lntp 2>/dev/null | grep -E ":(${WEB_PORT}|${APP_PORT})\b" || echo "未监听"

echo
echo "──── 资源 ────"
ps -o pid,rss,etime,cmd -C java --no-headers 2>/dev/null \
  | awk '{printf "PID %s  内存 %.0fMB  运行 %s\n", $1, $2/1024, $3}'

echo
echo "──── 入口 ────"
printf '页面   HTTP %s\n' "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${WEB_PORT}/ || echo 000)"
printf 'API    HTTP %s\n' "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${WEB_PORT}/api/v1/auth/login || echo 000)"
printf '健康   HTTP %s\n' "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${WEB_PORT}/actuator/health || echo 000)"

echo
echo "──── 日志体积 ────"
du -sh "${APP_HOME}/logs" 2>/dev/null | cut -f1