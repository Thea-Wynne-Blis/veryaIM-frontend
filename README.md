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
- **聊天主区**：毛玻璃吸顶头部、消息按作者分组、悬停才显示时间与已读状态
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
| 消息气泡 | `bubble-in`：上移 10px + 缩放 0.97 | 320ms |
| 未读角标 | `pop-in`：缩放 0.94 → 1 | 200ms |
| 按钮按下 | `scale(0.9~0.96)` | 120ms |
| 头像悬停 | `scale(1.06) rotate(-3deg)` | 200ms 弹性 |
| 在线状态点 | `pulse-ring` 呼吸 2.4s 循环 | — |
| 移动聊天页 | 滑入 22px + 淡入 | 280ms |
| 正在输入 | 三点错峰弹跳 | 1.3s 循环 |

全部尊重 `prefers-reduced-motion`。

---

## 无障碍

- 导航、图标按钮均有 `aria-label`
- 当前页用 `aria-current="page"`
- 筛选 chips 用 `role="tablist"` + `aria-selected`
- 焦点可见环：`2px solid var(--accent)`，偏移 2px
- 表单输入有 `aria-label`

---

## 当前状态

这是**纯前端原型**，数据来自 `src/data/workspace.ts` 的本地演示数据：

- ✅ 已完成：Web 三栏 + 移动端布局、深浅色、会话筛选/搜索、消息发送、详情面板、微交互
- ⏳ 未接入：真实 API、WebSocket 实时消息、登录态、Web Push 订阅、文件上传

接口设计见后端仓库 `docs/FRONTEND-ARCHITECTURE.md`。
