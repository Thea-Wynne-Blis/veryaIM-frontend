import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../types/chat'
import {
  canRecallAt,
  copyTextOf,
  dayLabelOf,
  decodeMessageContent,
  groupMessages,
  midOf,
  quotePreviewOf,
  RECALL_WINDOW_MS,
  stableMessageKey,
} from '../message'

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'local-1',
    author: '爱丽丝',
    initials: 'A',
    tone: 'blue',
    side: 'out',
    time: '10:00',
    text: 'hello',
    ...overrides,
  }
}

describe('midOf', () => {
  it('优先使用服务端 messageId', () => {
    expect(midOf(message({ id: 'local-1', messageId: '9001' }))).toBe('9001')
  })

  it('没有 messageId 时退回本地 id', () => {
    expect(midOf(message())).toBe('local-1')
  })
})

describe('copyTextOf', () => {
  it('普通文本直接复制正文', () => {
    expect(copyTextOf(message({ text: '早' }))).toBe('早')
  })

  it('附件用「文件名 (大小)」占位', () => {
    expect(
      copyTextOf(
        message({
          text: '',
          attachment: { name: '需求.pdf', size: '12 KB', kind: 'file' },
        }),
      ),
    ).toBe('需求.pdf (12 KB)')
  })

  it('没有大小时只给文件名', () => {
    expect(
      copyTextOf(message({ text: '', attachment: { name: 'a.png', size: '', kind: 'image' } })),
    ).toBe('a.png')
  })

  it('已撤回的消息没有可复制内容', () => {
    expect(copyTextOf(message({ recalled: true }))).toBe('')
  })
})

describe('quotePreviewOf', () => {
  it('折叠空白并截断到 120 字', () => {
    const text = `${'a'.repeat(118)}  b`
    const preview = quotePreviewOf(message({ text }))
    expect(preview).toBe(`${'a'.repeat(118)} b`)
    expect(preview).toHaveLength(120)
    expect(quotePreviewOf(message({ text: 'x'.repeat(200) }))).toHaveLength(121)
    expect(quotePreviewOf(message({ text: 'x'.repeat(200) })).endsWith('…')).toBe(true)
  })

  it('空文本给「消息」', () => {
    expect(quotePreviewOf(message({ text: '   ' }))).toBe('消息')
  })

  it('附件按类型给占位词', () => {
    const cases = [
      ['image', '[图片]'],
      ['video', '[视频]'],
      ['audio', '[语音]'],
      ['file', '[文件]'],
    ] as const
    for (const [kind, expected] of cases) {
      expect(
        quotePreviewOf(message({ text: '', attachment: { name: 'f', size: '1 KB', kind } })),
      ).toBe(expected)
    }
  })

  it('已撤回的消息给固定文案', () => {
    expect(quotePreviewOf(message({ recalled: true }))).toBe('消息已撤回')
  })
})

describe('stableMessageKey', () => {
  it('优先用 clientMsgId，保证占位消息确认后复用同一节点', () => {
    const used = new Set<string>()
    expect(stableMessageKey(message({ clientMsgId: 'w-1' }), 0, used)).toBe('c:w-1')
    expect(stableMessageKey(message({ id: '9' }), 1, used)).toBe('s:9')
  })

  it('重复 key 追加下标，避免 v-for 冲突', () => {
    const used = new Set<string>()
    const first = message({ id: '1', clientMsgId: 'c-1' })
    expect(stableMessageKey(first, 0, used)).toBe('c:c-1')
    expect(stableMessageKey({ ...first }, 1, used)).toBe('s:1:1')
  })
})

describe('decodeMessageContent', () => {
  it('base64 编码按 UTF-8 解码', () => {
    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode('你好')))
    expect(decodeMessageContent(encoded, 'base64')).toBe('你好')
  })

  it('非法 base64 返回空串，其它编码原样返回', () => {
    expect(decodeMessageContent('%%%', 'base64')).toBe('')
    expect(decodeMessageContent('plain', 'utf8')).toBe('plain')
    expect(decodeMessageContent(null)).toBe('')
  })
})

describe('canRecallAt', () => {
  const created = '2026-01-01T00:00:00.000Z'
  const base = new Date(created).getTime()

  it('窗口内自己的消息可撤回', () => {
    expect(canRecallAt(message({ mine: true, createdAt: created }), base + 1000)).toBe(true)
  })

  it('刚好到窗口边界仍可撤回', () => {
    expect(canRecallAt(message({ mine: true, createdAt: created }), base + RECALL_WINDOW_MS)).toBe(
      true,
    )
  })

  it('超出窗口不可撤回', () => {
    expect(canRecallAt(message({ mine: true, createdAt: created }), base + RECALL_WINDOW_MS + 1)).toBe(
      false,
    )
  })

  it('别人的、已撤回、发送中的消息都不可撤回', () => {
    expect(canRecallAt(message({ mine: false, createdAt: created }), base + 1)).toBe(false)
    expect(canRecallAt(message({ mine: true, recalled: true, createdAt: created }), base + 1)).toBe(
      false,
    )
    expect(canRecallAt(message({ mine: true, pending: true, createdAt: created }), base + 1)).toBe(
      false,
    )
  })

  it('缺少创建时间时不可撤回', () => {
    expect(canRecallAt(message({ mine: true }), base)).toBe(false)
  })
})

describe('dayLabelOf', () => {
  const now = new Date('2026-05-20T12:00:00')

  it('今天 / 昨天 / 更早的日期分开显示', () => {
    expect(dayLabelOf('2026-05-20T09:00:00', now)).toBe('今天')
    expect(dayLabelOf('2026-05-19T23:00:00', now)).toBe('昨天')
    expect(dayLabelOf('2026-05-02T09:00:00', now)).toBe('5月2日')
  })

  it('跨年带上年份，非法时间返回空串', () => {
    expect(dayLabelOf('2025-12-31T09:00:00', now)).toContain('2025')
    expect(dayLabelOf(null, now)).toBe('')
    expect(dayLabelOf('not-a-date', now)).toBe('')
  })
})

describe('groupMessages', () => {
  /** 相对今天构造时间，避免测试依赖运行日期。 */
  const at = (daysAgo: number, hour: number, minute = 0) => {
    const date = new Date()
    date.setDate(date.getDate() - daysAgo)
    date.setHours(hour, minute, 0, 0)
    return date.toISOString()
  }

  it('桌面端：连续同一作者合并，附件消息不合并', () => {
    const groups = groupMessages([
      message({ id: 'a', author: '爱丽丝', createdAt: at(0, 10) }),
      message({ id: 'b', author: '爱丽丝', createdAt: at(0, 10, 1) }),
      message({ id: 'c', author: '鲍勃', createdAt: at(0, 10, 2) }),
    ])
    expect(groups.map((item) => item.grouped)).toEqual([false, true, false])
    // 桌面端不输出日期分隔条
    expect(groups.every((item) => item.day === '')).toBe(true)
  })

  it('附件消息打断合并', () => {
    const groups = groupMessages([
      message({ id: 'a', author: '爱丽丝', createdAt: at(0, 10) }),
      message({ id: 'b', author: '爱丽丝', attachment: { name: 'a.png', size: '1 KB', kind: 'image' } }),
      message({ id: 'c', author: '爱丽丝', createdAt: at(0, 10, 2) }),
    ])
    expect(groups.map((item) => item.grouped)).toEqual([false, false, false])
  })

  it('移动端：按 senderId 合并且超过 5 分钟断开', () => {
    const options = { withDay: true, mergeWindowMs: 5 * 60_000, matchBySenderId: true }
    const groups = groupMessages(
      [
        message({ id: 'a', author: '爱丽丝', senderId: '1', createdAt: at(0, 10) }),
        message({ id: 'b', author: '爱丽丝', senderId: '1', createdAt: at(0, 10, 3) }),
        message({ id: 'c', author: '爱丽丝', senderId: '1', createdAt: at(0, 10, 9) }),
      ],
      options,
    )
    expect(groups.map((item) => item.grouped)).toEqual([false, true, false])
    expect(groups.map((item) => item.day)).toEqual(['今天', '', ''])
  })

  it('跨天时插入日期分隔条并断开合并', () => {
    const groups = groupMessages(
      [
        message({ id: 'a', author: '爱丽丝', createdAt: at(1, 10) }),
        message({ id: 'b', author: '爱丽丝', createdAt: at(0, 10) }),
      ],
      { withDay: true },
    )
    expect(groups.map((item) => item.grouped)).toEqual([false, false])
    expect(groups[0].day).toBe('昨天')
    expect(groups[1].day).toBe('今天')
  })

  it('时间缺失时给「聊天记录」标题，key 仍稳定', () => {
    const first = message({ id: 'a', author: '爱丽丝' })
    const groups = groupMessages([first, message({ id: 'b', author: '爱丽丝' })], { withDay: true })
    expect(groups[0].day).toBe('聊天记录')
    expect(groups[0].key).toBe('s:a')
    expect(groups[1].day).toBe('')
    expect(groups[1].key).toBe('s:b')
  })
})
