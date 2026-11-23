import { describe, expect, it } from 'vitest'
import { mentionCandidates } from '../mention'
import type { Conversation } from '../../types/chat'

const group = { id: 'g1', name: '产品组', kind: 'group' } as Conversation
const direct = { id: 'p1', name: 'rosy大王', kind: 'direct', peerId: 'u2' } as Conversation

const members = [
  { userId: 1, nickname: '我', remark: null },
  { userId: 2, nickname: '小明', remark: null },
  { userId: 3, nickname: '小红', remark: '红红' },
]

describe('mentionCandidates', () => {
  it('群聊按成员列表，排除自己，备注优先', () => {
    expect(mentionCandidates(group, members, '1')).toEqual([
      { id: '2', label: '小明' },
      { id: '3', label: '红红' },
    ])
  })

  it('成员的 id 是数字时也能和字符串形式的自己匹配', () => {
    expect(mentionCandidates(group, members, '')).toHaveLength(3)
    expect(mentionCandidates(group, members, '1')).toHaveLength(2)
  })

  it('单聊没有成员时用会话对端兜底', () => {
    expect(mentionCandidates(direct, [], '1')).toEqual([{ id: 'u2', label: 'rosy大王' }])
  })

  it('群聊成员还没加载好时返回空数组', () => {
    expect(mentionCandidates(group, [], '1')).toEqual([])
  })

  it('没有会话时返回空数组', () => {
    expect(mentionCandidates(null, [], '1')).toEqual([])
  })
})
