import { describe, expect, it } from 'vitest'
import { appendMention, insertAtCursor } from '../composer'

describe('insertAtCursor', () => {
  it('没有光标信息时追加到末尾', () => {
    expect(insertAtCursor('你好', '😀')).toEqual({ value: '你好😀', caret: 4 })
  })

  it('插到光标处，光标落在片段之后', () => {
    expect(insertAtCursor('你好世界', '!', 2)).toEqual({ value: '你好!世界', caret: 3 })
  })

  it('有选区时替换选区内容', () => {
    expect(insertAtCursor('你好世界', '呀', 2, 4)).toEqual({ value: '你好呀', caret: 3 })
  })

  it('越界的光标会被夹到合法范围', () => {
    expect(insertAtCursor('ab', 'X', 99, 200)).toEqual({ value: 'abX', caret: 3 })
    expect(insertAtCursor('ab', 'X', -5)).toEqual({ value: 'Xab', caret: 1 })
  })
})

describe('appendMention', () => {
  it('替换用户刚敲下的尾随 @', () => {
    expect(appendMention('你好 @', '小明')).toBe('你好 @小明 ')
  })

  it('没有尾随 @ 时直接追加', () => {
    expect(appendMention('你好', '小明')).toBe('你好@小明 ')
  })

  it('只有 @ 时也能得到合法草稿', () => {
    expect(appendMention('@', '小明')).toBe('@小明 ')
  })
})
