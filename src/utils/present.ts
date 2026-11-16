const TONES = ['jade', 'rose', 'sand', 'sky', 'violet', 'amber'] as const

/** 由用户/会话 id 稳定映射到一个头像配色，保证同一对象颜色不变。 */
export function toneOf(seed: number | string | null | undefined): string {
  if (seed === null || seed === undefined || seed === '') return TONES[0]
  const value =
    typeof seed === 'number'
      ? seed
      : Array.from(String(seed)).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  if (!Number.isFinite(value)) return TONES[0]
  return TONES[Math.abs(value) % TONES.length]
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
