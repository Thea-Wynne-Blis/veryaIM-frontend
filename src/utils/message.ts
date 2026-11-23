import type { ChatMessage } from '../types/chat'

/** 服务端撤回窗口，与后端保持一致。 */
export const RECALL_WINDOW_MS = 2 * 60 * 1000

/**
 * 解码 base64 文本；非法数据返回空串。
 *
 * <p>消息内容、推送预览都可能是 base64（附件消息的 content 是 base64 后的 JSON），
 * 桌面聊天、移动端与实时预览共用这一份实现。</p>
 */
export function decodeBase64Text(value: string): string {
  try {
    const binary = atob(value)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

/** 按消息声明的编码解码正文：`base64` 走解码，其它编码原样返回。 */
export function decodeMessageContent(
  content: string | null | undefined,
  encoding?: string | null,
): string {
  const raw = content ?? ''
  return encoding === 'base64' ? decodeBase64Text(raw) : raw
}

/** 消息在接口层的唯一标识：优先用服务端 messageId，本地占位消息退回 id。 */
export function midOf(message: ChatMessage): string {
  return String(message.messageId ?? message.id)
}

/**
 * 列表渲染的稳定 key：乐观占位与服务端消息共用 clientMsgId，
 * 确认到达时 Vue 复用同一个节点，不会重建重排（否则会重播入场动画）。
 */
export function stableMessageKey(
  message: ChatMessage,
  index: number,
  used: Set<string>,
): string {
  let key = message.clientMsgId ? `c:${message.clientMsgId}` : `s:${message.id}`
  if (used.has(key)) key = `s:${message.id}:${index}`
  used.add(key)
  return key
}

/** 消息所属自然日（用于「今天 / 昨天」分组）；无法解析时返回空串。 */
export function messageDayOf(message: ChatMessage | undefined): string {
  const date = message?.createdAt ? new Date(message.createdAt) : null
  return date && !Number.isNaN(date.getTime()) ? date.toDateString() : ''
}

/**
 * 日期分隔条文案：今天 / 昨天 / 5月20日（跨年带上年份）。
 *
 * <p>桌面端不显示分隔条，移动端只在跨天时显示；两端共用这一份格式化。</p>
 */
export function dayLabelOf(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const day = date.toDateString()
  if (day === now.toDateString()) return '今天'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (day === yesterday.toDateString()) return '昨天'
  return date.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
  })
}

export type MessageGroupOptions = {
  /** 是否输出跨天分隔条（移动端需要，桌面端不需要） */
  withDay?: boolean
  /** 同一个人连续消息合并的最大间隔；0 表示不限（桌面端） */
  mergeWindowMs?: number
  /** 用 senderId 判断是否同一个人（移动端）；默认用显示名 */
  matchBySenderId?: boolean
}

export type MessageGroup<T extends ChatMessage = ChatMessage> = {
  message: T
  grouped: boolean
  key: string
  /** 跨天分隔条文案；不需要或未跨天时为空串 */
  day: string
  enterOrder: number
  pending?: boolean
}

/**
 * 消息分组：连续同一人、都没有附件、间隔不超过窗口时，后一条不再重复头像与作者名。
 *
 * <p>桌面端用显示名判断，移动端用 senderId 并按 5 分钟窗口合并；
 * 两个组件原来各写一份，改规则要同步改两处。</p>
 */
export function groupMessages<T extends ChatMessage>(
  messages: T[],
  options: MessageGroupOptions = {},
): MessageGroup<T>[] {
  const { withDay = false, mergeWindowMs = 0, matchBySenderId = false } = options
  const usedKeys = new Set<string>()
  return messages.map((message, index) => {
    const prev = messages[index - 1]
    const day = withDay && (index === 0 || messageDayOf(prev) !== messageDayOf(message))
      // 时间缺失（极少见的本地脏数据）时仍给个分组标题，避免消息挤在一起
      ? dayLabelOf(message.createdAt) || '聊天记录'
      : ''
    let grouped = false
    if (prev && !day && prev.side === message.side && !prev.attachment && !message.attachment) {
      if (matchBySenderId) {
        const prevAt = prev.createdAt ? new Date(prev.createdAt).getTime() : 0
        const nextAt = message.createdAt ? new Date(message.createdAt).getTime() : 0
        grouped = (prev.senderId ?? prev.author) === (message.senderId ?? message.author)
          && !!prevAt && !!nextAt
          && nextAt - prevAt < mergeWindowMs
      } else {
        grouped = prev.author === message.author
      }
    }
    const key = stableMessageKey(message, index, usedKeys)
    return { message, grouped, key, day, enterOrder: index, pending: message.pending }
  })
}

/** 复制时给的纯文本：附件用「文件名 (大小)」占位。 */
export function copyTextOf(message: ChatMessage): string {
  if (message.recalled) return ''
  if (message.attachment) {
    const { name, size } = message.attachment
    return size ? `${name} (${size})` : name
  }
  return message.text
}

/** 引用快照：文本截断、附件转成占位词，与后端 replyPreview 保持一致。 */
export function quotePreviewOf(message: ChatMessage): string {
  if (message.recalled) return '消息已撤回'
  if (message.attachment) {
    const kind = message.attachment.kind
    if (kind === 'image') return '[图片]'
    if (kind === 'video') return '[视频]'
    if (kind === 'audio') return '[语音]'
    return '[文件]'
  }
  const text = message.text.replace(/\s+/g, ' ').trim()
  if (!text) return '消息'
  return text.length <= 120 ? text : `${text.slice(0, 120)}…`
}

/** 能否走服务端撤回：自己的消息、未撤回、未在发送中、且在窗口内。 */
export function canRecallAt(message: ChatMessage, now = Date.now()): boolean {
  if (!message.mine || message.recalled || message.pending) return false
  const createdAt = message.createdAt ? new Date(message.createdAt).getTime() : 0
  return !!createdAt && now - createdAt <= RECALL_WINDOW_MS
}
