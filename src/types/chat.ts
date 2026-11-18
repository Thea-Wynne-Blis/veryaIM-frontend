/**
 * 聊天界面使用的视图模型（不是接口 DTO）：接口层类型在 api/client.ts，这里只描述渲染需要的样子。
 */

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
  /** 单聊对方的用户 ID：点聊天里的头像时用它打开资料卡 */
  peerId?: string
}

export type Attachment = {
  name: string
  size: string
  kind: 'file' | 'image' | 'video' | 'audio'
  /** 雪花 ID 超出 JS 安全整数，可能以 string 形式存在。 */
  fileId?: string | number
  /** 图片原始像素，用于气泡占位，避免加载后跳动 */
  width?: number
  height?: number
  /** 视频封面文件（客户端抓帧后单独上传） */
  posterId?: string | number
  /** 视频/语音时长（秒） */
  duration?: number
  /** 服务端记录的内容类型，用于判断是否需要缩略图 */
  contentType?: string
  /** GIF 等动图：缩略图会退化成静态首帧，必须走原图 */
  animated?: boolean
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
  /** 发送者 ID（引用时回填 senderId，避免依赖昵称反查） */
  senderId?: string
  type?: string
  /** 服务端存储的原始 content：文本为明文，附件为 JSON 字符串 */
  raw?: string
  /** 发送方生成的幂等 id：乐观占位与服务端消息共用，用作列表 key 保持节点不重建 */
  clientMsgId?: string | null
  seq?: number
  mine?: boolean
  createdAt?: string
  pending?: boolean
  /** 引用块：原消息 id、发送者昵称、文本快照 */
  replyTo?: {
    messageId: string
    author: string
    preview: string
  } | null
}
