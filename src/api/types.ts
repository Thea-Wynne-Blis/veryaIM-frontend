/**
 * 接口返回的业务视图模型。
 *
 * <p>和 `http.ts` 里的传输层类型（`ApiEnvelope` / `AuthUser` / `LoginResult`）分开放：
 * 这里只有数据结构、没有任何运行时依赖，改动一个字段不会牵到请求逻辑。</p>
 */
import type { Id } from './http'

export type ConversationCard = {
  conversationId: string
  type: 'PRIVATE' | 'GROUP'
  title: string
  peerUserId: Id
  memberCount: number
  lastReadSeq: number
  lastSeq: number
  unreadCount: number
  lastMessageType: string | null
  lastMessagePreview: string
  lastMessageAt: string | null
  updatedAt: string
  /** 最后一条真实消息的发送者；没有消息时为 0 / null。群聊预览用「姓名：内容」。 */
  lastMessageSenderId: Id
  lastMessageSenderName: string | null
  /** 当前用户是否置顶了该会话 */
  pinned: boolean
  /** 当前用户是否对会话开启了消息免打扰 */
  muted: boolean
  /** 当前用户是否把会话设为「不显示」（收到新消息后会自动恢复） */
  hidden: boolean
}

/** 会话列表项设置：只提交要改的那一项。 */
export type ConversationPrefs = {
  pinned?: boolean
  muted?: boolean
  hidden?: boolean
  unread?: boolean
}

export type MessageView = {
  messageId: Id
  conversationId: string
  senderId: Id
  clientMsgId?: string
  /** 后端返回 sequence，前端统一成 seq。 */
  seq: number
  sequence?: number
  type: string
  content: string
  contentEncoding?: string
  createdAt: string
  recalled?: boolean
  recalledAt?: string | null
  /** 引用的原消息 ID，未引用时为空 */
  replyToId?: Id | null
  /** 被引用消息的发送者 ID */
  replySenderId?: Id | null
  /** 被引用消息的文本快照（发送时生成，原消息撤回后仍可读） */
  replyPreview?: string | null
  /** 发送中占位消息（乐观渲染），收到服务端确认后移除 */
  pending?: boolean
}

export type MessagePage = {
  messages: MessageView[]
  nextCursor: string | number | null
  hasMore: boolean
}

export type ConversationSearchHit = {
  messageId: Id
  seq: number
  senderId: Id
  senderName: string
  type: string
  text: string
  createdAt: string
  fileId: Id | null
  fileName: string | null
  sizeBytes: number | null
  contentType: string | null
}

export type ConversationSearchPage = {
  messages: ConversationSearchHit[]
  nextCursor: string | null
  hasMore: boolean
}

export type ContactView = {
  userId: Id
  nickname: string
  username?: string
  remark?: string | null
  avatar?: string | null
}

export type FileRow = {
  fileId: Id
  name: string
  contentType: string
  sizeBytes: number
  sha256?: string
  storageType?: string
  createdAt: string
}

export type ReadReceipt = { userId: Id; readSequence: number }

/** 会话文件：图片 / 文件 / 语音 / 视频消息里的附件。 */
export type ConversationFile = {
  fileId: Id
  messageId: Id
  type: 'IMAGE' | 'FILE' | 'AUDIO' | 'VIDEO' | string
  name: string
  sizeBytes: number
  contentType: string
  senderId: Id
  senderName: string
  createdAt: string
}

/** 收藏项：文本消息带 text，附件消息带 fileId/fileName。 */
export type Favorite = {
  id: Id
  conversationId: string
  messageId: Id
  type: string
  text?: string | null
  fileId?: Id | null
  fileName?: string | null
  sizeBytes?: number | null
  contentType?: string | null
  senderId: Id
  senderName: string
  conversationTitle: string
  createdAt: string
}

/** 全局搜索结果。 */
export type SearchResults = {
  contacts: Array<{
    userId: Id
    name: string
    nickname: string
    remark?: string | null
    avatar?: string | null
    online: boolean
  }>
  groups: Array<{ conversationId: string; title: string; memberCount: number }>
  messages: Array<{
    messageId: Id
    conversationId: string
    conversationTitle: string
    senderId: Id
    senderName: string
    text: string
    createdAt: string
  }>
  files: Array<{
    fileId: Id
    messageId: Id
    conversationId: string
    conversationTitle: string
    name: string
    type: string
    sizeBytes: number
    contentType: string
    senderId: Id
    senderName: string
    createdAt: string
  }>
}

export type GroupDetail = {
  groupId: string
  name: string
  ownerId: Id
  memberIds: Id[]
  createdAt?: string
  updatedAt: string
}

export type GroupModeration = {
  groupId: string
  announcement?: string | null
  muteAll: boolean
  mutedUntil?: string | null
  mutedPermanently?: boolean
}

export type UserProfile = {
  userId: Id
  username: string
  nickname: string
  avatar?: string | null
  /** 所在地区 */
  region?: string | null
  /** 个性签名 */
  signature?: string | null
  online?: boolean
  createdAt?: string
}

export type UserPrivacy = {
  searchByPhone: boolean
  searchByUsername: boolean
  friendPolicy: string
  showOnline: boolean
  readReceipt: boolean
  invitedToGroup: boolean
  updatedAt?: string
}

export type DeviceInfo = {
  deviceId: string
  platform: string
  deviceName?: string
  lastLoginAt?: string
  /** 同平台同名的登录记录条数（后端已把重复记录合并）。 */
  deviceCount?: number
  /** 是否是当前浏览器登录的设备。 */
  current?: boolean
}

export type TranslateResult = {
  from: string
  to: string
  text: string
}
