# 后端能力 ↔ 前端原型对照

依据后端仓库 `docs/FRONTEND-ARCHITECTURE.md`、`docs/DEVELOPMENT-STATUS.md` 与 `veryal-access` 的 HTTP Controller 整理。
后端已推进到 Flyway V23（含 Web Push 订阅），前端目前是**本地演示数据原型**。

| 领域 | 后端已实现 | 当前原型 |
|---|---|---|
| 账号 | 注册、登录、当前用户、设备、审计 | 未接入；用固定演示账号 |
| 会话 | 会话列表、创建单聊、详情、读游标、未读聚合 | 会话列表 + 未读角标 + 筛选（本地数据） |
| 消息 | 发送、历史游标、搜索、撤回、已读回执、离线同步 | 消息流、本地发送、已读勾、输入中提示 |
| 多消息类型 | TEXT / EMOJI / IMAGE / AUDIO / VIDEO / FILE / SYSTEM | 文本、文件卡片、图片占位 |
| 实时 | WebSocket 长连接、心跳、重连、Server/Delivery/Read ACK | 未接入 |
| 群聊 | 建群、成员与角色、公告、全员/成员禁言、@ 成员 | 群成员九宫格、群公告卡片 |
| 好友 | 申请、接受/拒绝/取消、备注、删除、黑名单、通讯录 | 未做主流程页（导航位已留） |
| 隐私 | 搜索开关、加好友策略（REJECT/VERIFY/DIRECT）、在线展示、已读开关 | 未接入 |
| 举报 | 举报用户/群/消息、我的举报记录 | 未接入 |
| 文件 | 上传、分片续传、图片压缩、会话内文件访问 | 文件卡片展示、共享文件列表 |
| 运营后台 | 用户封禁/禁言、群解散、举报处理、敏感词、审计 | 未做（独立应用） |
| 推送 | 设备 token、FCM、APNs、浏览器 Web Push（VAPID） | 未接入 |
| 限流 | 策略化限流 + `@RateLimit` 注解 | 未接入 |

---

## 前端待接入的优先级

按"用户能立刻感知"排序：

1. **登录态 + 会话列表**：`POST /auth/login` → `GET /conversations`
2. **WebSocket 实时消息**：`MESSAGE_NOTIFY` / `SERVER_ACK` / `READ_NOTIFY`
3. **发送消息**：`POST /conversations/{id}/messages`，失败重试与本地待发队列
4. **历史与同步**：`GET /conversations/{id}/messages`、`GET /sync/messages`
5. **好友与通讯录**：申请流、通讯录聚合
6. **Web Push**：`GET /push/web/config` → 订阅 → `POST /push/web/subscriptions`
7. **文件上传**：普通上传 + 分片续传

后端接口清单见后端仓库 `README.md` 的接口表。
