export type Presence = 'online' | 'away' | 'offline'

export type Conversation = {
  id: string
  name: string
  initials: string
  kind: 'direct' | 'group'
  tone: string
  presence: Presence
  unread: number
  time: string
  preview: string
  pinned?: boolean
  members?: number
  context: string
  muted?: boolean
}

export type Attachment = {
  name: string
  size: string
  kind: 'file' | 'image'
  /** 雪花 ID 超出 JS 安全整数，可能以 string 形式存在。 */
  fileId?: string | number
  /** 图片原始像素，用于气泡占位，避免加载后跳动 */
  width?: number
  height?: number
}

export type ChatMessage = {
  id: string
  author: string
  initials: string
  tone: string
  side: 'in' | 'out'
  time: string
  text: string
  attachment?: Attachment
  image?: boolean
  read?: boolean
  recalled?: boolean
  /** 以下字段供右键菜单（复制 / 转发 / 删除）使用 */
  messageId?: string
  type?: string
  /** 服务端存储的原始 content：文本为明文，附件为 JSON 字符串 */
  raw?: string
  seq?: number
  mine?: boolean
  createdAt?: string
  pending?: boolean
}

export const conversations: Conversation[] = [
  {
    id: 'design',
    name: '产品设计小组',
    initials: '设',
    kind: 'group',
    tone: 'jade',
    presence: 'online',
    unread: 3,
    time: '10:42',
    preview: '林知夏：新版留白可以再松一点',
    pinned: true,
    members: 8,
    context: '产品体验 · 8 位成员',
  },
  {
    id: 'lin',
    name: '林知夏',
    initials: '夏',
    kind: 'direct',
    tone: 'rose',
    presence: 'online',
    unread: 0,
    time: '09:58',
    preview: '好呀，我下午把稿子发你',
    context: '产品设计组 · 在线',
  },
  {
    id: 'launch',
    name: 'Verall 上线筹备',
    initials: '上',
    kind: 'group',
    tone: 'sand',
    presence: 'away',
    unread: 1,
    time: '昨天',
    preview: '许卓：灰度发布先开 10%',
    members: 12,
    context: '项目空间 · 12 位成员',
  },
  {
    id: 'chen',
    name: '陈一鸣',
    initials: '鸣',
    kind: 'direct',
    tone: 'sky',
    presence: 'away',
    unread: 0,
    time: '昨天',
    preview: '收到，接口我来跟进',
    context: '前端工程组 · 暂时离开',
  },
  {
    id: 'week',
    name: '周会纪要',
    initials: '周',
    kind: 'group',
    tone: 'violet',
    presence: 'offline',
    unread: 0,
    time: '周一',
    preview: '本周重点：消息同步与文件预览',
    members: 6,
    muted: true,
    context: '项目空间 · 6 位成员',
  },
  {
    id: 'xu',
    name: '许卓',
    initials: '卓',
    kind: 'direct',
    tone: 'amber',
    presence: 'offline',
    unread: 0,
    time: '周一',
    preview: '压测报告我整理好了',
    context: '后端工程组 · 离线',
  },
]

export const initialMessages: Record<string, ChatMessage[]> = {
  design: [
    {
      id: 'd1',
      author: '林知夏',
      initials: '夏',
      tone: 'rose',
      side: 'in',
      time: '09:28',
      text: '早上好，我把聊天主界面的交互稿更新了。会话列表、未读提醒和文件入口都收在同一条浏览路径上。',
    },
    {
      id: 'd2',
      author: '林知夏',
      initials: '夏',
      tone: 'rose',
      side: 'in',
      time: '09:29',
      text: '',
      attachment: { name: 'Verall · 会话交互 v3.fig', size: '8.4 MB', kind: 'file' },
    },
    {
      id: 'd3',
      author: '我',
      initials: '我',
      tone: 'jade',
      side: 'out',
      time: '09:41',
      text: '收到了，我先看一遍。最重要的是让聊天内容一眼就能读懂。',
      read: true,
    },
    {
      id: 'd4',
      author: '许卓',
      initials: '卓',
      tone: 'amber',
      side: 'in',
      time: '10:03',
      text: '我也看了稿子。群成员和共享文件放在右侧详情里很顺手。',
    },
    {
      id: 'd5',
      author: '我',
      initials: '我',
      tone: 'jade',
      side: 'out',
      time: '10:24',
      text: '同意。消息预览、已读状态和发送操作的层级现在清楚多了。',
      read: true,
    },
    {
      id: 'd6',
      author: '许卓',
      initials: '卓',
      tone: 'amber',
      side: 'in',
      time: '10:31',
      text: '移动端的会话切换也一起收进这次稿子里了吗？',
    },
    {
      id: 'd7',
      author: '林知夏',
      initials: '夏',
      tone: 'rose',
      side: 'in',
      time: '10:42',
      text: '新版留白可以再松一点，我把窄屏状态也补上了。',
    },
  ],
  lin: [
    {
      id: 'l1',
      author: '我',
      initials: '我',
      tone: 'jade',
      side: 'out',
      time: '09:43',
      text: '这版会话列表我已经合进交互稿，今天一起过一下？',
      read: true,
    },
    {
      id: 'l2',
      author: '林知夏',
      initials: '夏',
      tone: 'rose',
      side: 'in',
      time: '09:58',
      text: '好呀，我下午把稿子发你。顺便把深色模式也补一版。',
    },
  ],
  launch: [
    {
      id: 'n1',
      author: '许卓',
      initials: '卓',
      tone: 'amber',
      side: 'in',
      time: '昨天 18:20',
      text: '灰度发布先开 10%，观察四小时再放到一半。',
    },
    {
      id: 'n2',
      author: '我',
      initials: '我',
      tone: 'jade',
      side: 'out',
      time: '昨天 18:24',
      text: '可以。我盯一下消息投递的延迟曲线。',
      read: true,
    },
  ],
  chen: [
    {
      id: 'c1',
      author: '陈一鸣',
      initials: '鸣',
      tone: 'sky',
      side: 'in',
      time: '昨天 16:02',
      text: '收到，接口我来跟进，明天给你联调结果。',
    },
  ],
  week: [
    {
      id: 'w1',
      author: '我',
      initials: '我',
      tone: 'jade',
      side: 'out',
      time: '周一 10:00',
      text: '本周重点：消息同步与文件预览。',
      read: true,
    },
  ],
  xu: [
    {
      id: 'x1',
      author: '许卓',
      initials: '卓',
      tone: 'amber',
      side: 'in',
      time: '周一 14:10',
      text: '压测报告我整理好了，峰值 QPS 和 P99 都在里面。',
    },
  ],
}

export const groupMembers = [
  { name: '林知夏', initials: '夏', tone: 'rose', role: '群主' },
  { name: '许卓', initials: '卓', tone: 'amber', role: '管理员' },
  { name: '我', initials: '我', tone: 'jade', role: '成员' },
  { name: '陈一鸣', initials: '鸣', tone: 'sky', role: '成员' },
  { name: '周予安', initials: '安', tone: 'violet', role: '成员' },
  { name: '苏木', initials: '苏', tone: 'sand', role: '成员' },
]

export const sharedFiles = [
  { name: '会话交互 v3.fig', size: '8.4 MB' },
  { name: '交互走查清单.md', size: '24 KB' },
  { name: '移动端原型.mp4', size: '42 MB' },
]
