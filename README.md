# VERYAL Frontend

面向个人用户的即时通讯客户端原型，**Web 与移动端同一套代码、两套布局**。

技术栈：Vue 3 · TypeScript · Vite · Pinia · Vue Router · Lucide Icons

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 类型检查 + 生产构建
npm run preview
```

---

## 设计方向

参考两个站点各自的优点，做了取舍：

| 参考 | 取什么 | 不取什么 |
|---|---|---|
| [BoardUI](https://www.boardui.com/zh-hans) | 克制的层级、细边框、小号大写标签、数据密度、低对比阴影 | 仪表盘式的卡片堆叠、图表占比 |
| [bencho.dev](https://bencho.dev/) | 微交互质感：按下回弹、悬停浮起、气泡入场、未读弹出 | 大量炫技动效（IM 需要长时间使用，动效要收敛） |

结论：**结构学 BoardUI，手感学 Bencho。**

### 视觉基调

- **墨色 + 玉色**：正文 `#16181A`，主色 `#12876F`（不用企业蓝，也不照搬微信绿）
- **暖中性底**：画布 `#F5F5F2`，不用纯灰，长时间阅读更柔和
- **渐进圆角**：6 → 9 → 13 → 18 → 24 → 32，按元素层级递增
- **低对比阴影**：只用 5%~8% 透明度的多层阴影，避免"浮夸卡片"
- **气泡不对称圆角**：靠近发送者一侧收窄到 6px，形成指向感
- **头像与气泡对齐**：头像在气泡外侧、与气泡垂直居中（多行气泡也居中，不再沉到气泡底部）；悬停显示的时间与已读状态挂在气泡下方，不占布局高度，因此不会把头像往下拽
- **输入区不画框**：`.composer` 无背景、无边框、无圆角、无阴影，聚焦也不出光环，文字直接浮在画布上；唯一的分隔是 `.composer-wrap` 顶部 1px 的 `--hairline` 细线

### 深色模式

完整令牌覆盖，不是简单反色：

```css
[data-theme="dark"] { --canvas: #0D0F10; --accent: #2EC4A0; ... }
```

访问 `?theme=dark` 可直接进入深色，或点左栏底部的月亮按钮切换。

---

## 布局

### Web（≥ 768px）

```
┌──────┬──────────────┬──────────────────────────┬────────────┐
│ rail │  会话列表     │  聊天主区                 │  详情       │
│ 68px │  348px       │  flex                     │  306px     │
└──────┴──────────────┴──────────────────────────┴────────────┘
```

- **rail**：图标导航，激活项有左侧 3px 指示条 + 白色浮起背景；未读红点带描边
- **会话列表**：置顶分组、未读筛选 chips、搜索框聚焦时主色描边 + 3px 光晕
- **聊天主区**：毛玻璃吸顶头部、消息按作者分组、头像与气泡垂直居中、悬停才显示时间与已读状态
- **详情**：群公告、成员九宫格、共享文件；可折叠（点击头部 info 图标）

响应式收敛：

| 宽度 | 行为 |
|---|---|
| > 1180px | 四栏完整 |
| ≤ 1180px | 隐藏详情栏，列表收窄到 290px |
| ≤ 900px | 列表 260px，内边距压缩 |
| ≤ 768px | 切换为移动端布局 |

### 移动端（≤ 768px）

```
┌─────────────────────┐     ┌─────────────────────┐
│  消息      ＋        │     │ ← 林知夏       ⋯    │
│  [ 搜索 ]           │     │─────────────────────│
│─────────────────────│     │  · 消息流            │
│ ◯ 会话  时间  未读   │ ──▶ │                     │
│ ◯ 会话  时间  未读   │     │─────────────────────│
│─────────────────────│     │ [输入框]      ●     │
│ 消息 通讯录 文件 我的 │     └─────────────────────┘
└─────────────────────┘
```

- 底部标签栏：毛玻璃 + 安全区适配 `env(safe-area-inset-bottom)`
- 聊天页覆盖式进入，带 `translateX` 滑入 + 淡入
- 消息气泡最大宽度 76%，字号提到 14px
- 发送按钮：有内容时才替换附件按钮，减少视觉噪音

---

## 设计令牌

全部集中在 `src/styles/tokens.css`，组件里不写死颜色。

```css
--canvas / --surface / --surface-2 / --surface-3   背景层级
--ink / --ink-2 / --ink-3 / --ink-4                文字层级
--line / --line-strong                              分隔线与描边
--accent / --accent-soft / --accent-ink            主色三档
--r-xs … --r-2xl                                    圆角梯度
--shadow-xs … --shadow-lg                           阴影梯度
--ease-out / --ease-spring / --dur-1 … --dur-3      动效曲线与时长
```

改主题只改这一个文件。

---

## 目录

```
src/
├─ styles/
│  ├─ tokens.css        设计令牌（浅色 + 深色）
│  ├─ base.css          重置、排版、滚动条、关键帧
│  └─ app.css           布局与组件样式
├─ components/
│  ├─ AppAvatar.vue     头像：配色、在线点、圆/方
│  ├─ NavRail.vue       Web 左导航
│  ├─ ConversationList.vue
│  ├─ ChatPane.vue      Web 聊天区（头部 + 消息 + 输入）
│  ├─ DetailPanel.vue   右侧详情
│  └─ MobileWorkspace.vue  移动端完整页面
├─ composables/
│  └─ useIsMobile.ts    断点监听
├─ data/workspace.ts    演示数据
├─ pages/WorkspacePage.vue  布局切换入口
├─ stores/chat.ts       Pinia 会话状态
└─ router/index.ts
```

---

## 动效清单

| 位置 | 动效 | 时长 |
|---|---|---|
| 会话项入场 | `fade-up`，按索引错开 26ms | 320ms |
| 消息气泡 | 无入场动画：发送后同帧出现（见下） | — |
| 未读角标 | `pop-in`：缩放 0.94 → 1 | 200ms |
| 按钮按下 | `scale(0.9~0.96)` | 120ms |
| 头像悬停 | `scale(1.06) rotate(-3deg)` | 200ms 弹性 |
| 在线状态点 | `pulse-ring` 呼吸 2.4s 循环 | — |
| 移动聊天页 | 滑入 22px + 淡入 | 280ms |
| 正在输入 | 三点错峰弹跳 | 1.3s 循环 |

全部尊重 `prefers-reduced-motion`。

消息气泡刻意**不做**逐条淡入：曾经按列表下标给 `bubble-in` 加 `animation-delay`（末尾消息 260ms），
按下回车后气泡要先空白 260ms 再淡入 320ms；服务端确认时又因为 key 变化重建节点，整套动画再播一次，
看起来就是“发消息卡一下”。现在改为：

- 列表 key 用 `clientMsgId`（乐观占位与服务端消息共用），确认到达时**原地升级**，节点不重建；
- 气泡不再有过场动画，按下回车到文字可读约 10ms。

---

## 无障碍

- 导航、图标按钮均有 `aria-label`
- 当前页用 `aria-current="page"`
- 筛选 chips 用 `role="tablist"` + `aria-selected`
- 焦点可见环：`2px solid var(--accent)`，偏移 2px
- 表单输入有 `aria-label`

---

## 消息右键菜单

桌面端右键任意消息会弹出六项操作，能力与后端支持的对应关系如下：

| 菜单项 | 实现方式 | 后端支持 | 说明 |
|---|---|---|---|
| 复制 | 前端 `navigator.clipboard`（失败回退 `execCommand`） | 不需要 | 附件消息复制「文件名 (大小)」，已撤回消息无可复制内容 |
| 翻译 | 菜单保留入口但置灰，点击提示「后端暂无此接口」 | ❌ 没有 | 需要接入翻译服务（本地模型或第三方 API），并新增 `/messages/{id}/translate` 一类接口 |
| 转发 | 读出原消息的 `type` + 原始 `content`，调用发送接口发到目标会话 | ✅ 复用发送接口 | 后端没有独立转发接口，`forwardMessage` 用新的 `clientMessageId` 保证幂等；附件消息带原 `fileId`，受「文件必须属于发送者」校验限制，**别人的图片/文件不能转发到其它会话**，弹窗会直接拦截并说明原因 |
| 多选 | 纯前端状态 + 底部选择条 | 不需要 | 支持批量复制与批量删除 |
| 引用 | 菜单保留入口但置灰 | ❌ 没有 | `im_message` 没有 `reply_to` / `quote_id` 字段，历史消息接口也不返回引用信息，需要后端加列与接口 |
| 删除 | 自己的消息且 2 分钟内 → 调撤回接口；其它情况 → 仅本机隐藏（`localStorage`） | ✅ 仅撤回；❌ 无删除接口 | 删除菜单项会对不可撤回的消息标注「仅本机」，避免误以为全员删除 |

撤回的服务端规则：仅发送者本人、`RECALL_WINDOW` 2 分钟内，撤回后保留占位并写 `recalled_at`，前端渲染为「消息已撤回」。

「仅本机删除」记录在 `localStorage` 的 `veryal.chatPrefs.hidden`（按会话存消息 ID），换设备或清缓存后会重新出现——这是当前后端没有删除接口时的折中。

---

## 附件上传与媒体浏览

目标有两个：切会话不再像重新加载；所有文件类型（图片、GIF、视频、音频、大文件、SVG/HEIC 这类不能内联的格式）都能上传并正确渲染，而不是坏图或空白气泡。

### 上传

| 环节 | 优化前 | 现在 |
|---|---|---|
| 上传反馈 | `fetch` 没有进度事件，点完只能等 | `XMLHttpRequest` 回报字节进度，输入区上方一条 2px 细线进度条（本地缩略图 / 文件名 / 大小 / 阶段 / 取消） |
| 大文件 | 单次 multipart，超过 20MB 直接 413 | 超过 8MB 自动切片（`uploadFile` → `uploadChunked`），服务端逐片落盘后流式合并；实测 20.4MB 视频 4 片约 7 秒，帧率稳定在 14%→26%→44%→67%→93% |
| 进度语义 | 只有上传中 / 发送中 | `prepare`（客户端读尺寸、抓视频封面）→ `upload`（百分比）→ `send`（等服务端确认） |
| 服务端处理 | 2.4MB PNG 也完整解码 + 重编码，约 500ms | 只读图片头判断尺寸，未超 1920px 的 PNG 原样入库；实测 470–580ms → 90–130ms |

### 按类型渲染

| 附件 | 判定方式 | 气泡 |
|---|---|---|
| 图片 | `createImageBitmap` 能解码 | 先取 `/files/{id}/thumb?w=480`（约 33KB），点开才取原图 |
| GIF | `.gif` / `image/gif` | 仍归 `IMAGE`，但必须走原图（`/content`），否则动图变静态首帧 |
| SVG | `.svg` / `image/svg+xml` | 一律文件卡片：可执行脚本的 XML 文档不内联、不生成缩略图 |
| HEIC/TIFF 等 | `createImageBitmap` 失败 | 降级为文件卡片，而不是坏图 |
| 视频 | `video/*` 或扩展名兜底 | 封面 + 播放按钮 + 时长角标；点击后才把视频载入 `<video controls>` 内联播放 |
| 音频 | `audio/*` 或扩展名兜底 | 自定义播放器：播放/暂停、细线进度、点击 seek、`当前 / 总时长` |

视频的宽高、时长、封面全部在浏览器里生成（服务端没有 ffmpeg）：`<video>` 元数据拿宽高与时长，seek 到 10% 处用 canvas 抓一帧 JPEG（≤480px），作为普通图片文件上传后通过 `coverFileId` 挂在视频消息上。抓帧有超时兜底，解不开的容器（如部分 mkv）会退化成深色占位 + 播放按钮，不阻塞上传。

### 缓存与滚动

| 环节 | 优化前 | 现在 |
|---|---|---|
| 切走再回来 | 组件重新挂载 → 重新下载 + 解码 | object URL 按 `fileId` 缓存（LRU 48 条），直接命中，不发请求 |
| 滚动位置 | 每次进入都强制贴底 | 按会话记住 `scrollTop`，切回来停在原处；只有首次打开才贴底 |
| 布局跳动 | 图片加载完才撑开气泡 | 消息 `content` 记录 `width/height`，用 `aspect-ratio` 先占位（老消息回退 3:2），视频同理 |

服务端对 `/content` 与 `/thumb` 都返回 `ETag` + `Cache-Control: private, max-age=31536000, immutable`，支持 `If-None-Match` → `304`；缩略图首次生成后落盘缓存（`<objectKey>.thumb-480.jpg`）。`/content` 支持 `Range`/`206`，视频拖动进度时只回传需要的区间；`?disposition=inline` 仅对音视频、图片、PDF 生效，SVG 始终按下载处理。

自己刚上传的图片（≤3MB）会把本地 object URL 直接塞进缓存，气泡立即显示，不用等服务端生成缩略图；更大的图片走服务端缩略图，避免原图长期占内存。视频封面同理，上传封面后立即 `seedFilePreview`，气泡不再回源。

实现位置：`src/utils/media.ts`（`mediaKindOf` / `videoMetaOf` / `audioDurationOf`）、`src/api/client.ts`（`uploadFile` / `uploadChunked` / `thumbObjectUrl` / object URL 缓存）、`src/stores/chat.ts`（`uploads` 任务、`sendAttachment`、`open()` 增量刷新）、`src/components/MessageAttachment.vue`、`src/components/ChatPane.vue`。

已知取舍：`/content` 需要 Bearer 头，`<video src>` 带不上，所以播放时先 `fetch` 成 object URL 再交给 `<video>`——慢网络下 20MB 视频要等整份下载完成（实测 600KB/s 约 33 秒）。要改成边下边播，需要后端为本地存储补一个短时效签名直链（`presignedUrl` 目前只对 MinIO/OSS 生效），再让 `<video src>` 直接指向它，由浏览器按 `Range` 拉流。

---

## 当前状态

已接入真实后端（`/api/v1`，Bearer 鉴权），不再是本地演示数据：

- ✅ 已完成：Web 三栏 + 移动端布局、深浅色、会话筛选/搜索、消息发送、详情面板、微交互
- ✅ 已接入：真实 API、登录态与多设备管理、文件上传、消息增量同步
- ✅ 实时消息：`GET /api/v1/events`（SSE 长连接）
  - 事件携带完整消息体时**直接插入列表**，不再回查消息接口
  - 大群推送只带 `seq` 游标，按 120ms 窗口合并后增量拉取
  - 发送采用**乐观渲染**：本地先显示占位消息，服务端推送/响应到达时**原地升级**占位（不是先删后插），
    列表 key 用 `clientMsgId`，因此气泡不会闪一下或重播动画；按 `messageId` / `clientMsgId` 去重
  - 已读上报节流 1s；断线按 1s→15s 指数退避自动重连
  - 轮询保留为兜底：SSE 健康时 60 秒一次全量同步，未连接时回到 3 秒
- ⏳ 未接入：Web Push 订阅

实现位置：`src/stores/chat.ts` 的 `startRealtime` / `handleRealtimeChunk` / `applyRealtimeMessage`。

接口设计见后端仓库 `docs/FRONTEND-ARCHITECTURE.md`。
