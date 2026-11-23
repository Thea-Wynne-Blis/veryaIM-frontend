import { api, type ConversationCard, type Id, type MessagePage, type MessageView } from '../../api/client'
import { decodeBase64Text } from '../../utils/message'

/** 每次拉消息的页大小。 */
export const PAGE_SIZE = 60
/** 置顶 / 免打扰 / 本机隐藏的 localStorage key。 */
export const PREFS_KEY = 'veryal.chatPrefs'
/** 长连接多久没有心跳就认为不健康，轮询恢复全量同步。 */
export const REALTIME_HEALTHY_MS = 45_000
/** 长连接健康时，后台全量同步的最低间隔。 */
export const BACKGROUND_SYNC_MS = 60_000
/** 游标事件合并窗口。 */
export const REALTIME_COALESCE_MS = 120
/** 已读上报节流窗口。 */
export const MARK_READ_THROTTLE_MS = 1000
/** 成员列表缓存时长：在线状态靠它保持新鲜，同时避免频繁重拉。 */
export const MEMBERS_TTL_MS = 30_000

/** 超过这个大小的图片不再把本地预览塞进缓存，避免几十张原图把内存顶爆。 */
export const SEED_PREVIEW_MAX_BYTES = 3 * 1024 * 1024

export type ChatMember = {
  userId: Id
  nickname: string
  /** 我给这个成员设的好友备注；展示名优先用它 */
  remark?: string | null
  avatar?: string | null
  online?: boolean
  role?: string
}

/** 群成员在界面上的显示名：好友备注优先，没设备注才用群昵称。 */
export function memberDisplayName(member: Pick<ChatMember, 'nickname' | 'remark'>): string {
  const remark = member.remark?.trim()
  return remark ? remark : member.nickname
}

/** 上传统计：准备 / 上传 / 发送，供输入区渲染进度条。 */
export type UploadTask = {
  id: string
  conversationId: string
  name: string
  sizeBytes: number
  /** 0~1 的字节传输进度 */
  progress: number
  /** prepare：客户端生成封面/读时长；upload：传输字节；send：等服务端确认 */
  phase: 'prepare' | 'upload' | 'send'
  /** 附件类型，决定进度条缩略图与提示文案 */
  kind?: 'image' | 'gif' | 'video' | 'audio' | 'file'
  /** 图片/视频封面本地预览（object URL，任务结束时 revoke） */
  previewUrl?: string
  width?: number
  height?: number
  /** 视频/音频时长（秒） */
  duration?: number
}

export type Prefs = { pinned: string[]; muted: string[]; hidden: Record<string, string[]> }

/** 实时事件里前端用得上的字段（其它字段忽略）。 */
export type RealtimePayload = {
  kind?: string
  conversationId?: string
  messageId?: string | null
  seq?: number
  senderId?: string
  clientMsgId?: string | null
  messageType?: string | null
  content?: string | null
  contentEncoding?: string | null
  createdAt?: string | null
  replyToId?: string | null
  replySenderId?: string | null
  replyPreview?: string | null
}

export type State = {
  cards: ConversationCard[]
  messages: Record<string, MessageView[]>
  receipts: Record<string, Record<string, number>>
  members: Record<string, ChatMember[]>
  /** 成员列表的加载时间，用于给在线状态设一个短 TTL。 */
  membersLoadedAt: Record<string, number>
  activeId: string | null
  loadingCards: boolean
  loadingMessages: boolean
  error: string | null
  pollTimer: number | null
  pollingBusy: boolean
  realtimeConnected: boolean
  realtimeLastPing: number
  lastSync: number
  pinnedIds: string[]
  mutedIds: string[]
  /** 仅本机删除（服务端无删除接口），按会话记录被隐藏的消息 id */
  hiddenIds: Record<string, string[]>
  /** 正在上传/发送的附件任务 */
  uploads: UploadTask[]
}

function decodeText(value: string): string {
  return decodeBase64Text(value) || value
}

export function previewOf(payload: RealtimePayload): string {
  // 系统提示（禁言等）不占用会话列表的预览位，前端保持上一条真实消息。
  if (payload.messageType === 'SYSTEM') return ''
  if (payload.messageType === 'IMAGE') return '[图片]'
  if (payload.messageType === 'VIDEO') return '[视频]'
  if (payload.messageType === 'AUDIO') return '[语音]'
  if (payload.messageType === 'FILE') return '[文件]'
  if (payload.messageType === 'EMOJI') return '[表情]'
  if (payload.contentEncoding === 'base64' && payload.content) {
    return decodeText(payload.content)
  }
  return payload.content ?? ''
}

/** 后端字段名是 sequence，前端统一用 seq */
export function normalize(raw: MessageView & { sequence?: number }): MessageView {
  return { ...raw, seq: raw.seq ?? raw.sequence ?? 0 }
}

export function dedupe(list: MessageView[]): MessageView[] {
  const seen = new Set<string>()
  return list
    .filter((item) => {
      const key = String(item.messageId)
      return seen.has(key) ? false : (seen.add(key), true)
    })
    .sort((a, b) => a.seq - b.seq)
}

/**
 * 从 `afterSeq` 往后连续翻页，最多取 `maxPages` 页。
 *
 * <p>首次打开会话（替换列表）与补拉增量（合并列表）只需要各自的合并策略，
 * 分页循环本身是同一套，放在这里避免两份几乎相同的实现继续漂移。</p>
 */
export async function fetchMessagePages(
  conversationId: string,
  afterSeq: number,
  maxPages: number,
  pageSize = 100,
): Promise<MessageView[]> {
  const collected: MessageView[] = []
  let cursor = afterSeq
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const page = await api.get<MessagePage>(
      `/conversations/${conversationId}/messages?cursor=${cursor}&limit=${pageSize}`,
    )
    collected.push(...page.messages.map(normalize))
    if (!page.hasMore || page.messages.length === 0 || page.nextCursor == null) break
    cursor = Number(page.nextCursor)
  }
  return collected
}

export function emptyPrefs(): Prefs {
  return { pinned: [], muted: [], hidden: {} }
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return emptyPrefs()
    const parsed = JSON.parse(raw) as Partial<Prefs>
    return {
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
      muted: Array.isArray(parsed.muted) ? parsed.muted : [],
      hidden:
        parsed.hidden && typeof parsed.hidden === 'object' && !Array.isArray(parsed.hidden)
          ? parsed.hidden
          : {},
    }
  } catch {
    return emptyPrefs()
  }
}

/** `a/b.mp4` → `a/b`（封面文件命名用）。 */
export function baseNameOf(name: string): string {
  const slash = name.lastIndexOf('/')
  const base = slash >= 0 ? name.slice(slash + 1) : name
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}
