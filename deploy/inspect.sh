#!/usr/bin/env bash
# 部署前环境巡检
set -uo pipefail

echo "===== Docker 容器 ====="
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null || echo "docker 不可用"

echo
echo "===== nginx 镜像 ====="
docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -i nginx || echo "无 nginx 镜像"

echo
echo "===== 系统 nginx ====="
if command -v nginx >/dev/null 2>&1; then
  echo "已安装: $(nginx -v 2>&1)"
  echo "状态: $(systemctl is-active nginx 2>/dev/null || echo unknown)"
else
  echo "未安装"
fi

echo
echo "===== Java ====="
java -version 2>&1 | head -1

echo
echo "===== 监听端口 ====="
ss -lntp 2>/dev/null | grep -E ':(80|8080|8899|3306|6379|5672)\b' || echo "无匹配"

echo
echo "===== 资源 ====="
df -h / | tail -1
free -m | head -2

echo
echo "===== MySQL 容器信息 ====="
docker inspect veryal-mysql --format '{{range .NetworkSettings.Ports}}{{end}}{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep -E 'MYSQL_(DATABASE|USER|ROOT_PASSWORD)' || echo "未取到"

echo
echo "===== 既有 veryal 进程 ====="
ps -ef | grep -E 'veryal.*\.jar' | grep -v grep || echo "无"

echo
echo "===== 防火牆 ====="
sudo ufw status 2>/dev/null | head -5 || echo "ufw 不可用"
