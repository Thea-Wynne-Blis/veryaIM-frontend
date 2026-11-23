import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../types/chat'
import { canRecallAt, copyTextOf, decodeMessageContent, midOf, quotePreviewOf, RECALL_WINDOW_MS, stableMessageKey } from '../message'

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
