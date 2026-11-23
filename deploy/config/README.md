# config/ —— 运行时配置

部署时**只改 `.env`**，其它文件交给脚本处理。

```
config/
├─ .env.example                    # 配置样例，复制成 .env 后填真实值
├─ application-local.yaml.example  # 模板：用 ${KEY:default} 引用 .env 里的变量
├─ render-config.sh                # 扫描 .env → 生成 application-local.yaml
└─ start.sh                        # 渲染 + 导出环境变量 + 启动 ja
```

## 首次部署

```bash
cp config/.env.example config/.env
chmod 600 config/.env
vi config/.env           # 填数据库密码、令牌密钥等
```

## 启动

```bash
bash config/start.sh
```

脚本会：

1. 扫描 `config/.env`（没有就找项目根目录 `.env`）；
2. 用里面的值渲染 `config/application-local.yaml`（权限 600，不提交）；
3. 把 `.env` 逐行 `export` 成环境变量，再带
   `--spring.profiles.active=prod,local` 与
   `--spring.config.additional-location=file:config/` 启动。

systemd 只需要把 `ExecStart` 指向 `config/start.sh`：

```ini
[Service]
WorkingDirectory=/home/ubuntu/veryal
ExecStart=/home/ubuntu/veryal/config/start.sh
```

## 约定

- `.env` 与 `application-local.yaml` 都在 `.gitignore` 里，**不要提交**。
- 模板里写成 `${KEY:default}`：`.env` 有 `KEY` 就替换，没有就保留占位符，
  由 Spring 用 `default` 解析。所以 `.env` 只写要覆盖的项即可，
  生成后仍残留的占位符会在 stderr 里列出来，方便核对。
- 想加新配置：在 `.env.example` 加一行，再在
  `application-local.yaml.example` 里用 `${KEY:default}` 引用。
- 改完 `.env` 重启服务即可，不需要重新打包。
