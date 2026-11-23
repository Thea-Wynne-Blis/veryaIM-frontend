import { describe, expect, it } from 'vitest'
import type { Favorite } from '../../api/client'
import { favoriteExcerpt, favoriteKind, favoriteLink, favoriteTitle, visibleFavorites } from '../favorites'

const row = (extra: Partial<Favorite> = {}): Favorite => ({ id: '390000000000000001', messageId: '380000000000000012', conversationId: 'group', type: 'TEXT', senderId: '102', senderName: '陈一', conversationTitle: '设计组', createdAt: '2026-11-18T08:00:00Z', ...extra })

describe('收藏内容展示', () => {
  it('把文本中的 HTTP(S) 链接归入链接分类，忽略大小写', () => {
    expect(favoriteKind(row({ text: '参考 HTTPS://example.com/design' }))).toBe('LINK')
    expect(favoriteKind(row({ text: '设计说明' }))).toBe('TEXT')
    expect(favoriteKind(row({ type: 'FILE', fileName: 'https说明.pdf' }))).toBe('FILE')
  })
  it('裸域名也识别为链接，并能取出整条收藏的链接', () => {
    expect(favoriteKind(row({ text: 'www.baidu.com' }))).toBe('LINK')
    expect(favoriteKind(row({ text: 'baidu.com' }))).toBe('LINK')
    expect(favoriteLink(row({ text: 'www.baidu.com' }))).toMatchObject({
      href: 'https://www.baidu.com/',
      domain: 'baidu.com',
    })
    expect(favoriteLink(row({ text: '看这个 www.baidu.com' }))).toBeNull()
  })
  it('图片视频归为媒体，语音收藏不再展示', () => {
    expect(favoriteKind(row({ type: 'IMAGE' }))).toBe('MEDIA')
    expect(favoriteKind(row({ type: 'VIDEO' }))).toBe('MEDIA')
    expect(visibleFavorites([
      row({ type: 'AUDIO' }),
      row({ type: 'TEXT' }),
      row({ type: 'FILE', fileName: '设计.pdf' }),
    ]).map((item) => item.type)).toEqual(['TEXT', 'FILE'])
  })
  it('没有文件名时按类型显示，完整保留多行文字', () => {
    expect(favoriteTitle(row({ type: 'IMAGE' }))).toBe('图片')
    expect(favoriteTitle(row({ text: '第一行\n第二行' }))).toBe('第一行\n第二行')
    expect(favoriteTitle(row({ type: 'FILE', fileName: '设计.pdf' }))).toBe('设计.pdf')
  })
  it('摘要包含长文本后面的搜索命中，并保留完整的长关键词', () => {
    const text = '前文'.repeat(200) + '关键交付说明' + '后文'.repeat(200)
    const excerpt = favoriteExcerpt(text, '关键交付说明')
    expect(excerpt).toContain('关键交付说明')
    expect(excerpt.startsWith('…')).toBe(true)
    expect(excerpt.endsWith('…')).toBe(true)
    const longQuery = '说明'.repeat(160)
    expect(favoriteExcerpt('开头' + longQuery + '结束', longQuery)).toContain(longQuery)
  })
})
