#!/usr/bin/env bash
# ============================================================
# VERYAL 一键安装 / 更新（在服务器上执行）
#   用法: bash install.sh
# 前置: /tmp/veryal-upload/ 下已有 jar、dist、配置文件
# ============================================================
set -euo pipefail

APP_HOME=/opt/veryal
WEB_ROOT=/var/www/veryal
NGINX_SITE=/etc/nginx/sites-available/veryal.conf
PORT=8899

info() { printf '\033[1;36m[veryal]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ ok ]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }

UP=/tmp/veryal-upload
[ -d "$UP" ] || { echo "缺少 $UP"; exit 1; }

# ---------- 1. 目录 ----------
info "准备目录"
sudo mkdir -p "$APP_HOME"/{backend,logs,data/files,data/uploads,bin}
sudo mkdir -p "$WEB_ROOT"
sudo chown -R "$USER":"$USER" "$APP_HOME"
sudo chown -R www-data:www-data "$WEB_ROOT"

# ---------- 2. 后端 jar 与环境文件 ----------
info "安装后端"
install -m 0644 "$UP/veryal-bootstrap.jar" "$APP_HOME/backend/veryal-bootstrap.jar"
install -m 0600 "$UP/veryal.env" "$APP_HOME/backend/veryal.env"
touch "$APP_HOME/logs/backend.log"

# ---------- 3. 前端静态文件 ----------
info "安装前端静态文件"
sudo rm -rf "$WEB_ROOT"/*
sudo cp -r "$UP/dist/." "$WEB_ROOT"/
sudo chown -R www-data:www-data "$WEB_ROOT"
ok "前端文件数: $(find "$WEB_ROOT" -type f | wc -l)"

# ---------- 4. systemd ----------
info "注册 systemd 服务"
sudo install -m 0644 "$UP/veryal-backend.service" /etc/systemd/system/veryal-backend.service
sudo systemctl daemon-reload
sudo systemctl enable veryal-backend >/dev/null

# ---------- 5. nginx（系统安装版，非容器） ----------
info "配置 nginx"
if ! command -v nginx >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y nginx
fi

sudo install -m 0644 "$UP/veryal.conf" "$NGINX_SITE"
sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/veryal.conf

# 默认站点占用 80，避免与 8899 冲突或抢流量，直接移除
if [ -L /etc/nginx/sites-enabled/default ] || [ -f /etc/nginx/sites-enabled/default ]; then
  sudo rm -f /etc/nginx/sites-enabled/default
  warn "已移除 nginx 默认站点"
fi

sudo nginx -t
sudo systemctl enable nginx >/dev/null
sudo systemctl restart nginx
ok "nginx 已重启，监听 ${PORT}"

# ---------- 6. 清理 docker 版 nginx ----------
info "清理容器版 nginx"
if docker image inspect nginx:latest >/dev/null 2>&1; then
  ids=$(docker ps -aq --filter ancestor=nginx:latest || true)
  if [ -n "$ids" ]; then
    docker rm -f $ids >/dev/null 2>&1 || true
    warn "已删除使用 nginx 镜像的容器"
  fi
  docker rmi nginx:latest >/dev/null 2>&1 && ok "已删除 nginx:latest 镜像" || warn "删除镜像失败"
else
  ok "无 nginx 镜像"
fi

# ---------- 7. 启动后端 ----------
info "启动后端"
sudo systemctl restart veryal-backend

info "等待后端就绪（最多 150s）"
for i in $(seq 1 75); do
  if curl -fsS -o /dev/null "http://127.0.0.1:8080/actuator/health" 2>/dev/null; then
    ok "后端健康检查通过（${i}0% 用时约 $((i*2))s）"
    break
  fi
  if [ "$i" -eq 75 ]; then
    warn "健康检查未通过，最后 40 行日志："
    tail -40 "$APP_HOME/logs/backend.log" || true
  fi
  sleep 2
done

# ---------- 8. 端到端验证 ----------
info "验证入口"
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/" || echo 000)
echo "  前端页面 HTTP ${code}"
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/v1/push/web/config" || echo 000)
echo "  API 代理   HTTP ${code}（401/404 也说明代理已通）"

ok "部署完成 → http://<服务器IP>:${PORT}/"
