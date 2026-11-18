import type { Favorite } from '../api/client'

export type FavoriteKind = 'TEXT' | 'FILE' | 'MEDIA' | 'LINK' | 'AUDIO'

export function favoriteKind(row: Favorite): FavoriteKind {
  if (row.type === 'IMAGE' || row.type === 'VIDEO') return 'MEDIA'
  if (row.type === 'FILE') return 'FILE'
  if (row.type === 'AUDIO') return 'AUDIO'
  if (row.type === 'TEXT' && /https?:\/\//i.test(row.text ?? '')) return 'LINK'
  return 'TEXT'
}

export function favoriteTitle(row: Favorite): string {
  if (row.type === 'TEXT' || row.type === 'EMOJI') return row.text?.trim() || '表情'
  return row.fileName?.trim() || ({ IMAGE: '图片', VIDEO: '视频', AUDIO: '语音' }[row.type] ?? '文件')
}

/** 让较长收藏中的关键词也出现在卡片摘要内。 */
export function favoriteExcerpt(text: string, keyword: string): string {
  const query = keyword.trim().toLowerCase()
  const index = query ? text.toLowerCase().indexOf(query) : -1
  const start = index > 80 ? index - 50 : 0
  const end = Math.max(start + 220, index + query.length)
  return `${start ? '…' : ''}${text.slice(start, end)}${text.length > end ? '…' : ''}`
}
