import type { Favorite } from '../api/client'
import { findLinks, singleLink, type LinkParts } from './link'

export type FavoriteKind = 'TEXT' | 'FILE' | 'MEDIA' | 'LINK'

export function favoriteKind(row: Favorite): FavoriteKind {
  if (row.type === 'IMAGE' || row.type === 'VIDEO') return 'MEDIA'
  if (row.type === 'FILE') return 'FILE'
  // 与聊天共用同一套识别：裸域名（www.baidu.com）也算链接，不再只认 http(s)://
  if (row.type === 'TEXT' && findLinks(row.text ?? '').length > 0) return 'LINK'
  return 'TEXT'
}

/** 当前产品不做语音：历史遗留的语音收藏直接不出现在列表里。 */
export function visibleFavorites(rows: Favorite[]): Favorite[] {
  return rows.filter((row) => row.type !== 'AUDIO')
}

/** 整条收藏就是一个链接时返回它，列表和详情都渲染成链接卡片。 */
export function favoriteLink(row: Favorite): LinkParts | null {
  if (row.type !== 'TEXT') return null
  return singleLink(row.text ?? '')
}

export function favoriteTitle(row: Favorite): string {
  if (row.type === 'TEXT' || row.type === 'EMOJI') return row.text?.trim() || '表情'
  return row.fileName?.trim() || ({ IMAGE: '图片', VIDEO: '视频' }[row.type] ?? '文件')
}

/** 让较长收藏中的关键词也出现在卡片摘要内。 */
export function favoriteExcerpt(text: string, keyword: string): string {
  const query = keyword.trim().toLowerCase()
  const index = query ? text.toLowerCase().indexOf(query) : -1
  const start = index > 80 ? index - 50 : 0
  const end = Math.max(start + 220, index + query.length)
  return `${start ? '…' : ''}${text.slice(start, end)}${text.length > end ? '…' : ''}`
}
