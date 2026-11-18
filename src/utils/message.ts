import type { ChatMessage } from '../types/chat'

/** 服务端撤回窗口，与后端保持一致。 */
export const RECALL_WINDOW_MS = 2 * 60 * 1000

/** 消息在接口层的唯一标识：优先用服务端 messageId，本地占位消息退回 id。 */
export function midOf(message: ChatMessage): string {
  return String(message.messageId ?? message.id)
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
