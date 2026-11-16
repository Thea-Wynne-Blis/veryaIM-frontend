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

c_inf "停止后端…"
sudo systemctl stop "$UNIT"
c_ok "后端已停止（nginx 仍在运行）"