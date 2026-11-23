#!/usr/bin/env bash
#
# 扫描 .env，把值填进 application-local.yaml。
#
#   bash config/render-config.sh            # 用 config/.env
#   CONFIG_ENV_FILE=/path/to/.env bash config/render-config.sh
#
# 规则：
#   - .env 优先，其次仓库根目录的 .env；
#   - 只替换 .env 里真实存在的 KEY，模板里剩下的 ${KEY:default} 原样保留，
#     交给 Spring 自己按默认值解析（所以 .env 可以只写要覆盖的项）；
#   - 生成的 yaml 含密码，权限固定 600；
#   - 没有模板或没有 .env 时直接跳过（退出码 0），不阻断启动。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

TEMPLATE="${CONFIG_TEMPLATE:-$HERE/application-local.yaml.example}"
OUTPUT="${CONFIG_OUTPUT:-$HERE/application-local.yaml}"

ENV_FILE="${CONFIG_ENV_FILE:-}"
if [ -z "$ENV_FILE" ]; then
  if [ -f "$HERE/.env" ]; then
    ENV_FILE="$HERE/.env"
  elif [ -f "$ROOT/.env" ]; then
    ENV_FILE="$ROOT/.env"
  fi
fi

if [ -z "$ENV_FILE" ] || [ ! -f "$ENV_FILE" ]; then
  echo "[config] 没有找到 .env，跳过 application-local.yaml 生成" >&2
  exit 0
fi

if [ ! -f "$TEMPLATE" ]; then
  echo "[config] 没有找到模板 $TEMPLATE，跳过生成" >&2
  exit 0
fi

# 变量名是否合法
is_key() {
  case "$1" in
    ''|[0-9]*|*[!A-Za-z0-9_]*) return 1 ;;
    *) return 0 ;;
  esac
}

# ---- 1. 解析 .env（只认 KEY=VALUE，不执行任何内容）----
declare -A VALUES=()
while IFS= read -r raw || [ -n "$raw" ]; do
  line="${raw%$'\r'}"
  line="${line#"${line%%[![:space:]]*}"}"
  case "$line" in
    ''|'#'*) continue ;;
    *=*) ;;
    *) continue ;;
  esac
  key="${line%%=*}"
  is_key "$key" || continue
  value="${line#*=}"
  # 去掉包裹的引号：KEY="v" / KEY='v'
  case "$value" in
    \"*\") value="${value#\"}" ; value="${value%\"}" ;;
    \'*\') value="${value#\'}" ; value="${value%\'}" ;;
  esac
  VALUES["$key"]="$value"
done < "$ENV_FILE"

# ---- 2. 模板替换（单次从左到右，未知占位符原样保留）----
PH='${'
OPEN='}'
substitute() {
  local rest="$1" out="" head tail inner key
  while [[ "$rest" == *"$PH"* ]]; do
    head="${rest%%"$PH"*}"
    tail="${rest#*"$PH"}"
    out+="$head"
    # tail 形如 KEY} / KEY:default}
    if [[ "$tail" == *"$OPEN"* ]]; then
      inner="${tail%%$OPEN*}"
      key="${inner%%:*}"
      if is_key "$key"; then
        if [ -n "${VALUES[$key]+set}" ]; then
          out+="${VALUES[$key]}"
        else
          out+="$PH$inner$OPEN"
        fi
        rest="${tail:${#inner}+1}"
        continue
      fi
    fi
    # 不是变量占位符：原样输出 ${
    out+="$PH"
    rest="$tail"
  done
  printf '%s' "$out$rest"
}

rendered=()
while IFS= read -r raw || [ -n "$raw" ]; do
  rendered+=("$(substitute "${raw%$'\r'}")")
done < "$TEMPLATE"

mkdir -p "$(dirname "$OUTPUT")"
printf '%s\n' "${rendered[@]}" > "$OUTPUT"
chmod 600 "$OUTPUT"

echo "[config] 已生成 $OUTPUT（来源：$ENV_FILE）"

# 生成后仍残留的占位符 = .env 没定义的项，交给 Spring 用模板里的默认值。
leftover="$(awk '
  {
    sub(/\r$/, "")
    if ($0 ~ /^[[:space:]]*#/) next
    rest = $0
    while (match(rest, /\$\{[A-Za-z_][A-Za-z0-9_]*/)) {
      print substr(rest, RSTART + 2, RLENGTH - 2)
      rest = substr(rest, RSTART + RLENGTH)
    }
  }
' "$OUTPUT" | sort -u | tr '\n' ' ')"
if [ -n "$leftover" ]; then
  printf '[config] 以下变量未在 .env 中定义，保留模板默认值：%s\n' "$leftover" >&2
fi
