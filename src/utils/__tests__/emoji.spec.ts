import { beforeEach, describe, expect, it } from 'vitest'
import { EMOJIS, loadRecentEmojis, rememberEmoji } from '../emoji'

describe('表情面板数据', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('内置表情数量足够并且没有重复', () => {
    expect(EMOJIS.length).toBeGreaterThan(150)
    expect(new Set(EMOJIS).size).toBe(EMOJIS.length)
  })

  it('最近使用去重并置顶，最多保留 20 个', () => {
    expect(rememberEmoji('😀')[0]).toBe('😀')
    const next = rememberEmoji('👍')
    expect(next.slice(0, 2)).toEqual(['👍', '😀'])
    expect(next.filter((item) => item === '👍')).toHaveLength(1)

    for (let i = 0; i < 30; i += 1) rememberEmoji(String.fromCodePoint(0x1f600 + i))
    expect(loadRecentEmojis()).toHaveLength(20)
  })

  it('本地数据损坏时返回空列表而不是抛错', () => {
    window.localStorage.setItem('veryal.recentEmojis', '{not json')
    expect(loadRecentEmojis()).toEqual([])
  })
})
