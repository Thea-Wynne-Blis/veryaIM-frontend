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

WHICH="${1:-info}"
LINES="${2:-120}"

case "$WHICH" in
  error|err)  FILE="$APP_HOME/logs/error.log" ;;
  warn)       FILE="$APP_HOME/logs/warn.log" ;;
  stdout|out) FILE="$APP_HOME/logs/stdout.log" ;;
  info)       FILE="$APP_HOME/logs/info.log" ;;
  list|ls)
      echo "──── 日志文件 ────"
      find "$APP_HOME/logs" -maxdepth 1 -type f -name '*.log' -printf '%-24f %8s\n' 2>/dev/null
      echo
      echo "归档: $(find "$APP_HOME/logs/archive" -type f 2>/dev/null | wc -l) 个"
      echo "总占用: $(du -sh "$APP_HOME/logs" 2>/dev/null | cut -f1)"
      exit 0
      ;;
  *)
      echo "用法: logs.sh [类型] [行数]"
      echo "  类型: info（默认）| warn | error | stdout | list"
      exit 1
      ;;
esac

[ -f "$FILE" ] || { c_err "日志文件不存在: $FILE"; exit 1; }
c_inf "跟踪 $FILE（Ctrl+C 退出）"
tail -n "$LINES" -f "$FILE"