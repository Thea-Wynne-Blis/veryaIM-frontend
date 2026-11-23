/** 链接识别与拆分的纯函数，聊天气泡和收藏预览共用。 */

export type LinkParts = {
  /** 可直接用于 href 的完整地址 */
  href: string
  /** 站点域名（去掉 www.） */
  domain: string
  /** 域名之后的路径、查询参数与锚点 */
  path: string
}

export type LinkSegment =
  | { type: 'text'; text: string }
  | { type: 'link'; text: string; link: LinkParts }

/**
 * 末尾经常被句子标点粘住（例如“请看 https://a.com/x。”），
 * 这些字符不属于地址，解析前先剥掉。
 */
const TRAILING_PUNCTUATION = /[.,;:!?'"`，。；：！？、）】》\]}>]+$/

/** 常见后缀，避免把 README.md、BUG.doc 之类的文件名当成网址。 */
const DOMAIN_TAIL = 'com|cn|net|org|io|dev|app|me|co|info|top|xyz|edu|gov|cc|tv'

const LINK_SOURCE =
  `(?:https?:\\/\\/|www\\.)[^\\s<>"'，。；：！？、）】》]+` +
  `|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${DOMAIN_TAIL})(?::\\d+)?(?:\\/[^\\s<>"'，。；：！？、）】》]*)?`

const LINK_RE = new RegExp(LINK_SOURCE, 'gi')

function trimTrailing(value: string): string {
  return value.replace(TRAILING_PUNCTUATION, '')
}

function withProtocol(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

/** 解析一段地址；不是合法的 http(s) 链接时返回 null。 */
export function parseLink(value: string): LinkParts | null {
  const raw = trimTrailing(value.trim())
  if (!raw) return null
  try {
    const url = new URL(withProtocol(raw))
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null
    return {
      href: url.href,
      domain: url.hostname.replace(/^www\./i, ''),
      path: `${url.pathname === '/' ? '' : url.pathname}${url.search}${url.hash}`,
    }
  } catch {
    return null
  }
}

/** 找出文本里的所有链接，返回原始文本片段与解析后的地址。 */
export function findLinks(text: string): Array<{ index: number; text: string; link: LinkParts }> {
  const found: Array<{ index: number; text: string; link: LinkParts }> = []
  LINK_RE.lastIndex = 0
  for (let match = LINK_RE.exec(text); match; match = LINK_RE.exec(text)) {
    const index = match.index
    // 邮箱里的域名（foo@example.com）不是链接
    if (index > 0 && text[index - 1] === '@') continue
    const raw = trimTrailing(match[0])
    const link = parseLink(raw)
    if (!link) continue
    found.push({ index, text: raw, link })
    if (raw.length !== match[0].length) LINK_RE.lastIndex = index + raw.length
  }
  return found
}

/**
 * 整条消息就是一个链接时返回它，用来渲染成卡片；
 * 链接夹在文字里则仍走普通气泡。
 */
export function singleLink(text: string): LinkParts | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const links = findLinks(trimmed)
  if (links.length !== 1) return null
  const [only] = links
  return only.index === 0 && only.text.length === trimmed.length ? only.link : null
}

/** 把文本拆成普通文字与可点击链接，渲染时不需要 v-html。 */
export function linkSegments(text: string): LinkSegment[] {
  const links = findLinks(text)
  if (!links.length) return [{ type: 'text', text }]
  const segments: LinkSegment[] = []
  let cursor = 0
  for (const item of links) {
    if (item.index > cursor) segments.push({ type: 'text', text: text.slice(cursor, item.index) })
    segments.push({ type: 'link', text: item.text, link: item.link })
    cursor = item.index + item.text.length
  }
  if (cursor < text.length) segments.push({ type: 'text', text: text.slice(cursor) })
  return segments
}
