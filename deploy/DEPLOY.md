# VERYAL 部署手册

生产环境：`82.157.47.151` · Ubuntu · Java 21 · Nginx 1.24（**系统安装，非容器**）

对外只暴露一个端口：**8899**。前端静态文件、`/api`、`/ws` 全部由同一个 Nginx 站点代理。

---

## 一、访问入口

| 用途 | 地址 |
|---|---|
| 应用 | http://82.157.47.151:8899/ |
| 健康检查 | http://82.157.47.151:8899/actuator/health |

首次使用在登录页点「注册」创建账号即可。

运营后台默认账号（首次启动自动创建）：

```text
用户名：platform_admin
密码：  Veryal@2026
```

---

## 二、架构

```
浏览器
  │  :8899
  ▼
Nginx（系统服务）
  ├── /            → /home/ubuntu/veryal/web   前端静态文件
  ├── /api/        → 127.0.0.1:8080            Spring Boot
  ├── /ws          → 127.0.0.1:8080            WebSocket（Upgrade）
  └── /actuator/   → 127.0.0.1:8080            健康检查
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   MySQL :13306      Redis :16379     RabbitMQ :5672
   （Docker）         （Docker）        （Docker，应用侧默认关闭）
```

Docker 只负责数据中间件，Nginx 与后端都跑在宿主机。

---

## 三、目录

```text
/home/ubuntu/veryal/              部署根目录（属主 ubuntu）
├── backend/
│   ├── veryal-bootstrap.jar      后端程序
│   └── veryal.env                运行时环境变量（root 所有，0644）
├── web/                          前端静态文件（www-data 所有）
├── bin/
│   └── *.sh                      运维脚本（status / start-up / stop / restart / logs / health）
├── logs/                         info.log / warn.log / error.log / stdout.log / archive/
└── data/
    ├── files/                    本地文件存储
    ├── uploads/                  分片上传暂存
    └── vapid-keys.json           Web Push 密钥（开启后生成）

/etc/nginx/sites-available/veryal.conf     站点配置（root 指向 /home/ubuntu/veryal/web）
/etc/systemd/system/veryal-backend.service 后端服务
```

> 早期版本使用的 `/opt/veryal`、`/var/www/veryal` 已废弃；`install.sh` 重装时会自动清除。

---

## 四、日常运维

```bash
/home/ubuntu/veryal/bin/status.sh      # 服务状态 + 健康检查 + 端口 + 入口
/home/ubuntu/veryal/bin/start-up.sh    # 启动后端 + nginx
/home/ubuntu/veryal/bin/stop.sh        # 停止后端（nginx 保留）
/home/ubuntu/veryal/bin/restart.sh     # 重启后端并等待就绪
/home/ubuntu/veryal/bin/health.sh      # 健康检查 + 入口 + 数据库连通
/home/ubuntu/veryal/bin/logs.sh        # 跟踪日志，默认 info 120 行
```

`logs.sh` 用法：`logs.sh [info|warn|error|stdout] [行数]`，例如
`/home/ubuntu/veryal/bin/logs.sh error 200`。脚本内部只在 systemctl 相关操作上用 `sudo`，日常执行无需提权。

等价的原生命令：

```bash
sudo systemctl status veryal-backend
sudo systemctl restart veryal-backend
sudo tail -f /home/ubuntu/veryal/logs/error.log
sudo nginx -t && sudo systemctl reload nginx
```

---

## 五、更新部署

### 只更新前端

```bash
npm run build
tar -czf dist.tar.gz -C dist .
scp dist.tar.gz ubuntu@82.157.47.151:/tmp/
ssh ubuntu@82.157.47.151 'rm -rf /tmp/distx && mkdir -p /tmp/distx \
  && tar -xzf /tmp/dist.tar.gz -C /tmp/distx \
  && sudo rsync -a /tmp/distx/ /home/ubuntu/veryal/web/ \
  && sudo chown -R www-data:www-data /home/ubuntu/veryal/web \
  && sudo find /home/ubuntu/veryal/web -type d -exec chmod 0755 {} + \
  && sudo find /home/ubuntu/veryal/web -type f -exec chmod 0644 {} +'
```

`rsync` 默认保留旧 hash 资源，避免正在使用的页面缓存 404；如需彻底清空，先
`sudo rm -rf /home/ubuntu/veryal/web/*` 再同步。静态文件更新无需重启 Nginx。

### 只更新后端

```bash
mvn -DskipTests package
scp veryal-bootstrap/target/veryal-bootstrap-1.0.0-SNAPSHOT.jar \
    ubuntu@82.157.47.151:/tmp/
ssh ubuntu@82.157.47.151 'sudo install -m 0644 /tmp/veryal-bootstrap-1.0.0-SNAPSHOT.jar \
    /home/ubuntu/veryal/backend/veryal-bootstrap.jar && sudo systemctl restart veryal-backend'
```

### 图片缩略图

图片消息的气泡只请求 `GET /api/v1/files/{id}/thumb?w=480`（约 30–60KB），
首次访问时生成，落在原文件旁边：`<objectKey>.thumb-480.jpg`。
`/content` 与 `/thumb` 都带 `ETag` 和 `Cache-Control: private, max-age=31536000, immutable`，
浏览器回访不会重复下载。

删除文件时后端会连带删除默认缩略图。手工清数据时可以直接清理：

```bash
sudo find /home/ubuntu/veryal/data/files -name '*.thumb-*.jpg' -delete
```

删掉后下次访问会重新生成（单张约 0.5s，之后走缓存）。

### 完整重装

```bash
tar -czf veryal-deploy.tar.gz -C deploy/out/stage .
scp veryal-deploy.tar.gz ubuntu@82.157.47.151:/tmp/
ssh ubuntu@82.157.47.151 'rm -rf /tmp/veryal-upload && mkdir -p /tmp/veryal-upload \
  && tar -xzf /tmp/veryal-deploy.tar.gz -C /tmp/veryal-upload \
  && bash /tmp/veryal-upload/install.sh'
```

`install.sh` 是幂等的：重跑会覆盖程序与配置、重建 systemd 与 nginx 站点、重启服务。

---

## 六、配置项

全部集中在 `/home/ubuntu/veryal/backend/veryal.env`，改动后 `sudo systemctl restart veryal-backend`。

| 变量 | 说明 |
|---|---|
| `VERYAL_DB_URL` / `USER` / `PASSWORD` | MySQL 连接 |
| `VERYAL_TOKEN_SECRET` | JWT 签名密钥，**上线务必更换** |
| `VERYAL_REDIS_ENABLED` | 在线状态与路由缓存 |
| `VERYAL_MQ_ENABLED` | 单节点保持 `false`，多实例时改 `true` |
| `VERYAL_STORAGE_TYPE` | `local` / `minio` / `oss` |
| `VERYAL_PUSH_WEB_PUSH_ENABLED` | 浏览器推送开关，开启后自动生成 VAPID 密钥 |
| `VERYAL_LOG_PATH` | 日志目录，生产为 `/home/ubuntu/veryal/logs` |
| `VERYAL_PLATFORM_BOOTSTRAP_*` | 运营后台初始账号 |
| `VERYAL_RATE_LIMIT_ENABLED` | 限流总开关，默认 `true`；压测时设 `false` |
| `VERYAL_RATE_LIMIT_MESSAGE_PERMITS` / `_REFILL` | 发消息令牌桶，默认 `30` 容量 / `15` 条每秒 |

### MySQL 持久化与性能

线上保持**严格持久化**：

```sql
innodb_flush_log_at_trx_commit = 1
sync_binlog                    = 1
```

即每次提交都 fsync redo + binlog，**进程崩溃或断电都不丢已提交消息**。

实测（单会话、同机压测）：改成 `2 / 1000` 只在低并发有收益（顺序发送 p50 22ms → 12ms），16 并发以上吞吐持平（约 185–210 QPS），因为 InnoDB binlog group commit 已经把 fsync 摊薄。所以**不建议为吞吐放宽**；只有在明确接受「断电丢最近约 1 秒已提交事务」时才改：

```bash
docker exec -it veryal-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" \
  -e "SET PERSIST innodb_flush_log_at_trx_commit=2; SET PERSIST sync_binlog=1000;"'
```

验证：

```bash
docker exec -it veryal-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N \
  -e "select @@innodb_flush_log_at_trx_commit, @@sync_binlog;"'
```

压测前记得关限流，否则 429 会让数据失真：

```bash
sudo mkdir -p /etc/systemd/system/veryal-backend.service.d
printf '[Service]\nEnvironment=VERYAL_RATE_LIMIT_ENABLED=false\n' \
  | sudo tee /etc/systemd/system/veryal-backend.service.d/zz-bench.conf >/dev/null
sudo systemctl daemon-reload && sudo systemctl restart veryal-backend
# 压测结束：删除该文件、daemon-reload、重启
```

---

## 七、注意事项

1. **安全组/防火墙**：云厂商安全组需放行 TCP 8899。宿主机 ufw 当前为 inactive。
2. **端口暴露**：MySQL/Redis/RabbitMQ 都只绑定 `127.0.0.1`，不对外。
3. **Nginx 为系统安装版**，容器版 `nginx:latest` 镜像已删除；`sites-enabled/default`（80 端口）也已移除。
4. **Nginx 读取家目录**：站点 root 在 `/home/ubuntu` 下，故 `/home/ubuntu` 需保持 `o+x`（`install.sh` 已处理）。
5. **首次启动较慢**：Flyway 迁移到 V23 约 20–30 秒，期间 `/actuator/health` 不可用属正常。
6. **实时消息为 WebSocket 长连接**：前端先 `POST /api/v1/auth/ws-ticket` 换一次性 ticket，再连 `/ws?ticket=...&format=json`；Nginx 需对 `/ws` 开启 Upgrade 头透传与长连接超时。低频轮询仅作兜底。
7. **中文编码**：JSON 接口未声明 charset，浏览器按 UTF-8 解析正常；非浏览器客户端（如 PowerShell 的 `Invoke-RestMethod`）可能按 Latin-1 解码出现乱码，属客户端问题。

---

## 八、故障排查

```bash
# 后端起不来
/home/ubuntu/veryal/bin/logs.sh error 100
sudo journalctl -u veryal-backend -n 100 --no-pager
sudo tail -100 /home/ubuntu/veryal/logs/error.log

# 502 / 页面能开但接口报错
curl -s http://127.0.0.1:8080/actuator/health
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8899/api/v1/auth/login

# 数据库连通性
docker exec veryal-mysql mysql -uveryal -pveryal123 -e 'select 1' veryal_im

# Nginx 配置
sudo nginx -t
sudo tail -50 /var/log/nginx/veryal.error.log
```
