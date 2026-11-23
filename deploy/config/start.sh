#!/usr/bin/env bash
#
# VERYAL 后端启动入口：
#   1. 读取 config/.env（或仓库根目录 .env），渲染 config/application-local.yaml；
#   2. 把 .env 里的 KEY=VALUE 导出成环境变量（logback 等直接读环境变量）；
#   3. 带 prod,local profile 启动 jar，配置文件额外从 config/ 目录加载。
#
# 用法：
#   bash config/start.sh                  # 前台启动
#   JAR=/path/to.jar bash config/start.sh
#
# systemd 里把 ExecStart 指到本脚本即可，改配置只需要动 .env。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

JAR="${JAR:-$ROOT/veryal-bootstrap/target/veryal-bootstrap-1.0.0-SNAPSHOT.jar}"
if [ ! -f "$JAR" ]; then
  # 线上布局：/home/ubuntu/veryal/backend/veryal-bootstrap.ja
  if [ -f "$ROOT/backend/veryal-bootstrap.jar" ]; then
    JAR="$ROOT/backend/veryal-bootstrap.jar"
  fi
fi
if [ ! -f "$JAR" ]; then
  echo "[start] 找不到 jar：$JAR" >&2
  exit 1
fi

ENV_FILE="${CONFIG_ENV_FILE:-}"
if [ -z "$ENV_FILE" ]; then
  if [ -f "$HERE/.env" ]; then
    ENV_FILE="$HERE/.env"
  elif [ -f "$ROOT/.env" ]; then
    ENV_FILE="$ROOT/.env"
  fi
fi

CONFIG_ENV_FILE="${ENV_FILE:-}" bash "$HERE/render-config.sh"

# 逐行解析再 export：不走 source，密码里的 & $ 空格都不会被当成 shell 语法。
if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
  while IFS= read -r raw || [ -n "$raw" ]; do
    line="${raw%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    case "$line" in
      ''|'#'*) continue ;;
      *=*) ;;
      *) continue ;;
    esac
    key="${line%%=*}"
    case "$key" in
      ''|[0-9]*|*[!A-Za-z0-9_]*) continue ;;
    esac
    value="${line#*=}"
    case "$value" in
      \"*\") value="${value#\"}" ; value="${value%\"}" ;;
      \'*\') value="${value#\'}" ; value="${value%\'}" ;;
    esac
    export "$key=$value"
  done < "$ENV_FILE"
fi

WORK_DIR="${WORK_DIR:-$ROOT}"
mkdir -p "$WORK_DIR/logs"

JAVA_OPTS="${JAVA_OPTS:--Xms320m -Xmx768m -XX:+UseG1GC -XX:MaxGCPauseMillis=120 -XX:+ExitOnOutOfMemoryError -Duser.timezone=UTC -Dfile.encoding=UTF-8}"

cd "$WORK_DIR"
echo "[start] jar=$JAR profiles=${SPRING_PROFILES_ACTIVE:-prod,local} config=$HERE cwd=$WORK_DIR"
exec java $JAVA_OPTS \
  -jar "$JAR" \
  --spring.profiles.active="${SPRING_PROFILES_ACTIVE:-prod,local}" \
  --spring.config.additional-location="file:$HERE/"
