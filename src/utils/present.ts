const TONES = ['jade', 'rose', 'sand', 'sky', 'violet', 'amber'] as const

type ToneSeed = number | string | null | undefined

function isSameSeed(a: ToneSeed, b: ToneSeed): boolean {
  return a !== null && a !== undefined && a !== '' && String(a) === String(b)
}

/** 由用户/会话 id 稳定映射到一个头像配色，保证同一对象颜色不变。 */
export function toneOf(seed: ToneSeed): string {
  if (seed === null || seed === undefined || seed === '') return TONES[0]
  const value =
    typeof seed === 'number'
      ? seed
      : Array.from(String(seed)).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  if (!Number.isFinite(value)) return TONES[0]
  return TONES[Math.abs(value) % TONES.length]
}

/**
 * 人的头像配色：自己的头像是品牌绿，其他人的按 userId 取色。
 * 消息头像、成员列表、通讯录、资料卡都走这里，同一个人在任何界面同色。
 */
export function toneOfPerson(userId: ToneSeed, selfId?: ToneSeed): string {
  if (isSameSeed(userId, selfId)) return 'jade'
  return toneOf(userId)
}

/** 会话卡片的默认形状，用于给头像取色（避免这里依赖 api 类型）。 */
export type ToneSeedConversation = {
  type: 'PRIVATE' | 'GROUP'
  conversationId: string
  peerUserId?: ToneSeed
}

/**
 * 会话头像配色：单聊跟对方 userId 走，群聊跟 groupId 走。
 *
 * <p>会话 id 本身不能当种子：单聊是 `p_<a>_<b>`、群聊是 `g_<id>`，
 * 直接哈希会和聊天里的消息头像、通讯录里的同一个人/同一个群不同色。</p>
 */
export function toneOfConversation(conversation: ToneSeedConversation): string {
  if (conversation.type === 'PRIVATE' && conversation.peerUserId) {
    return toneOf(conversation.peerUserId)
  }
  return toneOf(String(conversation.conversationId).replace(/^g_/, ''))
}

/** 取名字最后一个字作为头像字符（中文更自然）。 */
export function initialsOf(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return '?'
  return trimmed.slice(-1)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 会话列表第二行。
 *
 * <p>系统提示（禁言等）不进来这里——后端查询已经跳过，前端再兜一层；
 * 没有真实消息时返回空串，列表不显示「还没有消息」这类占位。
 * 群聊按「姓名：内容」展示，自己发的显示「我」；两行都靠 CSS 单行省略截断。</p>
 */
export function conversationPreview(
  kind: 'group' | 'direct',
  preview: string | null | undefined,
  senderName?: string | null,
  mine = false,
): string {
  const text = (preview ?? '').trim()
  if (!text) return ''
  if (kind !== 'group') return text
  const name = mine ? '我' : (senderName ?? '').trim()
  return name ? `${name}：${text}` : text
}

/** 会话列表时间：今天显示 HH:mm，昨天显示「昨天」，更早显示 M/D。 */
export function listTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) return `${pad(date.getHours())}:${pad(date.getMinutes())}`

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return '昨天'
  }
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/** 消息气泡时间：HH:mm */
export function clockTime(iso: string): string {
  const date = new Date(iso)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 文件大小：42 B / 1.2 KB / 8.4 MB。 */
export function humanBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let index = 0
  let value = bytes
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index++
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

/** 相对时间，用于「最后消息」等次要信息。 */
export function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const minute = 60_000
  if (diff < minute) return '刚刚'
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`
  return `${Math.floor(diff / (24 * 60 * minute))} 天前`
}
