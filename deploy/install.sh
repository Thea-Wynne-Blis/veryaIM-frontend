#!/usr/bin/env bash
# ============================================================
# VERYAL 一键安装 / 迁移部署
#   部署根目录: /home/ubuntu/veryal
#   用法: bash install.sh
#   前置: /tmp/veryal-upload/ 下有 jar、dist、config/、配置、脚本
# ============================================================
set -euo pipefail

APP_HOME=/home/ubuntu/veryal
WEB_ROOT=$APP_HOME/web
NGINX_SITE=/etc/nginx/sites-available/veryal.conf
PORT=8899
APP_PORT=8080
UNIT=veryal-backend

info() { printf '\033[1;36m[veryal]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ ok ]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }

UP=/tmp/veryal-upload
[ -d "$UP" ] || { echo "缺少 $UP"; exit 1; }

# ---------- 0. 清理旧部署 ----------
info "清理旧部署（/opt/veryal、/var/www/veryal）"
sudo systemctl stop "$UNIT" 2>/dev/null || true
sudo systemctl disable "$UNIT" 2>/dev/null || true
sudo rm -f /etc/systemd/system/"$UNIT".service
sudo systemctl daemon-reload
sudo rm -rf /opt/veryal /var/www/veryal
ok "旧目录已删除"

# ---------- 1. 目录 ----------
info "创建新目录 $APP_HOME"
mkdir -p "$APP_HOME"/{backend,bin,logs,web}
mkdir -p "$APP_HOME"/data/{files,uploads}
chmod 0755 "$APP_HOME"

# ---------- 2. 后端 ----------
info "安装后端"
install -m 0644 "$UP/veryal-bootstrap.jar" "$APP_HOME/backend/veryal-bootstrap.jar"
touch "$APP_HOME/logs/backend.log"

# ---------- 2.1 运行时配置 ----------
# config/.env 与生成的 application-local.yaml 含密码，不进版本库：
# 上传包里从不包含它们，重装只覆盖脚本与模板，保留服务器上已有的 .env。
info "安装运行时配置"
mkdir -p "$APP_HOME/config"
for f in start.sh render-config.sh; do
  install -m 0755 "$UP/config/$f" "$APP_HOME/config/$f"
done
for f in README.md .env.example application-local.yaml.example; do
  install -m 0644 "$UP/config/$f" "$APP_HOME/config/$f"
done
if [ -f "$APP_HOME/config/.env" ]; then
  chmod 600 "$APP_HOME/config/.env"
  ok "保留现有 config/.env"
else
  warn "缺少 config/.env：请先 cp config/.env.example config/.env 并填真实值，否则后端无法启动"
fi

# ---------- 3. 前端 ----------
# web 目录属于 www-data（nginx 用户），后端部署脚本以 ubuntu 运行，
# 所以清空、拷贝、改权限都要 sudo。
info "安装前端静态文件"
sudo rm -rf "${WEB_ROOT:?}"/*
sudo cp -r "$UP/dist/." "$WEB_ROOT"/
sudo find "$WEB_ROOT" -type d -exec chmod 0755 {} +
sudo find "$WEB_ROOT" -type f -exec chmod 0644 {} +
sudo chown -R www-data:www-data "$WEB_ROOT"
ok "前端文件数: $(find "$WEB_ROOT" -type f | wc -l)"

# Nginx 以 www-data 运行，需要能穿过家目录读到静态文件
sudo chmod o+x /home/ubuntu 2>/dev/null || true

# ---------- 4. 运维脚本 ----------
info "安装运维脚本"
sudo rm -f /usr/local/bin/veryal "$APP_HOME/bin/veryal"
for script in "$UP"/bin/*.sh; do
  install -m 0755 "$script" "$APP_HOME/bin/$(basename "$script")"
done
ok "已安装: $(ls -1 "$APP_HOME"/bin/*.sh | xargs -n1 basename | tr '\n' ' ')"

# ---------- 5. systemd ----------
info "注册 systemd 服务"
sudo install -m 0644 "$UP/veryal-backend.service" /etc/systemd/system/"$UNIT".service
sudo systemctl daemon-reload
sudo systemctl enable "$UNIT" >/dev/null

# ---------- 6. nginx ----------
info "配置 nginx"
if ! command -v nginx >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y nginx
fi
sudo install -m 0644 "$UP/veryal.conf" "$NGINX_SITE"
sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/veryal.conf
if [ -e /etc/nginx/sites-enabled/default ]; then
  sudo rm -f /etc/nginx/sites-enabled/default
fi
sudo nginx -t
sudo systemctl enable nginx >/dev/null
sudo systemctl restart nginx
ok "nginx 已重启，监听 ${PORT}"

# ---------- 7. 清理容器版 nginx ----------
info "清理容器版 nginx"
if docker image inspect nginx:latest >/dev/null 2>&1; then
  ids=$(docker ps -aq --filter ancestor=nginx:latest || true)
  [ -n "$ids" ] && docker rm -f $ids >/dev/null 2>&1 || true
  docker rmi nginx:latest >/dev/null 2>&1 && ok "已删除 nginx:latest 镜像" || warn "删除镜像失败"
else
  ok "无 nginx 镜像"
fi

# ---------- 8. 启动后端 ----------
info "启动后端"
sudo systemctl restart "$UNIT"

info "等待后端就绪（最多 180s）"
ready=0
for i in $(seq 1 90); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${APP_PORT}/actuator/health" 2>/dev/null; then
    ok "健康检查通过（约 $((i*2))s）"
    ready=1
    break
  fi
  sleep 2
done
if [ "$ready" -eq 0 ]; then
  warn "健康检查未通过，最后 50 行日志："
  tail -50 "$APP_HOME/logs/backend.log" || true
fi

# ---------- 9. 验证 ----------
info "验证入口"
printf '  前端页面    HTTP %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/" || echo 000)"
printf '  API 代理    HTTP %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/v1/auth/login" || echo 000)"
printf '  健康检查    HTTP %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/actuator/health" || echo 000)"

ok "部署完成 → http://<服务器IP>:${PORT}/"
