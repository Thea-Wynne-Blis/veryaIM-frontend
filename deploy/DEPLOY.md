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
  ├── /            → /var/www/veryal    前端静态文件
  ├── /api/        → 127.0.0.1:8080     Spring Boot
  ├── /ws          → 127.0.0.1:8080     WebSocket（Upgrade）
  └── /actuator/   → 127.0.0.1:8080     健康检查
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   MySQL :13306      Redis :16379     RabbitMQ :5672
   （Docker）         （Docker）        （Docker，默认关闭）
```

Docker 只负责数据中间件，Nginx 与后端都跑在宿主机。

---

## 三、目录

```text
/opt/veryal/
├── backend/
│   ├── veryal-bootstrap.jar   后端程序
│   └── veryal.env             运行时环境变量（600 权限）
├── bin/
│   └── veryal                 运维脚本（已软链到 /usr/local/bin/veryal）
├── logs/
│   └── backend.log            应用日志
└── data/
    ├── files/                 本地文件存储
    ├── uploads/               分片上传暂存
    └── vapid-keys.json        Web Push 密钥（开启后生成）

/var/www/veryal/               前端静态文件（www-data 所有）
/etc/nginx/sites-available/veryal.conf
/etc/systemd/system/veryal-backend.service
```

---

## 四、日常运维

```bash
veryal status     # 查看全部服务状态（默认命令）
veryal start      # 启动后端 + nginx
veryal stop       # 停止后端（nginx 保留）
veryal restart    # 重启后端
veryal logs 200   # 跟踪最后 200 行日志
```

等价的原生命令：

```bash
sudo systemctl status veryal-backend
sudo systemctl restart veryal-backend
sudo tail -f /opt/veryal/logs/backend.log
sudo nginx -t && sudo systemctl reload nginx
```

---

## 五、更新部署

### 只更新前端

```bash
npm run build
tar -czf dist.tar.gz -C dist .
scp dist.tar.gz ubuntu@82.157.47.151:/tmp/
ssh ubuntu@82.157.47.151 'cd /tmp && rm -rf distx && mkdir distx \
  && tar -xzf dist.tar.gz -C distx \
  && sudo rm -rf /var/www/veryal && sudo mkdir -p /var/www/veryal \
  && sudo cp -r distx/. /var/www/veryal \
  && sudo chown -R www-data:www-data /var/www/veryal'
```

无需重启 Nginx。

### 只更新后端

```bash
mvn -DskipTests package
scp veryal-bootstrap/target/veryal-bootstrap-1.0.0-SNAPSHOT.jar \
    ubuntu@82.157.47.151:/tmp/
ssh ubuntu@82.157.47.151 'sudo install -m 0644 /tmp/veryal-bootstrap-1.0.0-SNAPSHOT.jar \
    /opt/veryal/backend/veryal-bootstrap.jar && sudo systemctl restart veryal-backend'
```

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

全部集中在 `/opt/veryal/backend/veryal.env`，改动后 `sudo systemctl restart veryal-backend`。

| 变量 | 说明 |
|---|---|
| `VERYAL_DB_URL` / `USER` / `PASSWORD` | MySQL 连接 |
| `VERYAL_TOKEN_SECRET` | JWT 签名密钥，**上线务必更换** |
| `VERYAL_REDIS_ENABLED` | 在线状态与路由缓存 |
| `VERYAL_MQ_ENABLED` | 单节点保持 `false`，多实例时改 `true` |
| `VERYAL_STORAGE_TYPE` | `local` / `minio` / `oss` |
| `VERYAL_PUSH_WEB_PUSH_ENABLED` | 浏览器推送开关，开启后自动生成 VAPID 密钥 |
| `VERYAL_PLATFORM_BOOTSTRAP_*` | 运营后台初始账号 |

---

## 七、注意事项

1. **安全组/防火墙**：云厂商安全组需放行 TCP 8899。宿主机 ufw 当前为 inactive。
2. **端口暴露**：MySQL/Redis/RabbitMQ 都只绑定 `127.0.0.1`，不对外。
3. **Nginx 为系统安装版**，容器版 `nginx:latest` 镜像已删除；`sites-enabled/default`（80 端口）也已移除。
4. **首次启动较慢**：Flyway 迁移到 V23 约 20–30 秒，期间 `/actuator/health` 不可用属正常。
5. **实时消息为轮询实现**：前端每 4 秒拉一次会话卡片与增量消息。WebSocket 通道已由 Nginx 代理就绪，后续切换为长连接无需改代理。
6. **中文编码**：JSON 接口未声明 charset，浏览器按 UTF-8 解析正常；非浏览器客户端（如 PowerShell 的 `Invoke-RestMethod`）可能按 Latin-1 解码出现乱码，属客户端问题。

---

## 八、故障排查

```bash
# 后端起不来
veryal logs 100
sudo journalctl -u veryal-backend -n 100 --no-pager

# 502 / 页面能开但接口报错
curl -s http://127.0.0.1:8080/actuator/health
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8899/api/v1/auth/login

# 数据库连通性
docker exec veryal-mysql mysql -uveryal -pveryal123 -e 'select 1' veryal_im

# Nginx 配置
sudo nginx -t
sudo tail -50 /var/log/nginx/veryal.error.log
```
