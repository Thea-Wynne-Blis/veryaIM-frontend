import { describe, expect, it } from 'vitest'
import { highlightParts } from '../search'

describe('搜索关键词高亮', () => {
  it('忽略英文大小写，保留原文并高亮所有匹配', () => {
    expect(highlightParts('Plan plan', ' PLAN ')).toEqual([
      { text: 'Plan', match: true }, { text: ' ', match: false }, { text: 'plan', match: true },
    ])
  })
  it('把通配符、正则和 HTML 作为普通文本处理', () => {
    expect(highlightParts('<img> 100% [a]', '[a]')).toEqual([
      { text: '<img> 100% ', match: false }, { text: '[a]', match: true },
    ])
    expect(highlightParts('100%完成', '%')[1]).toEqual({ text: '%', match: true })
  })
  it('支持中文、空查询和无匹配', () => {
    expect(highlightParts('设计方案设计', '设计').filter(part => part.match)).toHaveLength(2)
    expect(highlightParts('方案', '')).toEqual([{ text: '方案', match: false }])
    expect(highlightParts('方案', '文件')).toEqual([{ text: '方案', match: false }])
  })
})
