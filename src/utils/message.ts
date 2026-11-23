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
