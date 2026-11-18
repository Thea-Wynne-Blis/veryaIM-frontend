import { describe, expect, it } from 'vitest'
import { conversationPreview, toneOf, toneOfConversation, toneOfPerson } from '../present'

/** 演示数据里的真实 id，用来回归「同一个人在任何界面同色」。 */
const BOB = '380621339972603904'
const GROUP = '380624008229425152'

describe('toneOf', () => {
  it('同一 id 每次取到同一个颜色', () => {
    expect(toneOf(BOB)).toBe(toneOf(BOB))
  })

  it('空值回退到第一个配色', () => {
    expect(toneOf(null)).toBe('jade')
    expect(toneOf('')).toBe('jade')
  })
})

describe('toneOfPerson', () => {
  it('自己的头像固定品牌绿', () => {
    expect(toneOfPerson(BOB, BOB)).toBe('jade')
  })

  it('数字与字符串形式的同一个 id 视为同一人', () => {
    expect(toneOfPerson(42, '42')).toBe('jade')
  })

  it('其他人按 userId 取色，和 toneOf 一致', () => {
    expect(toneOfPerson(BOB, '999')).toBe(toneOf(BOB))
  })

  it('没有自己的 id 时不影响别人取色', () => {
    expect(toneOfPerson(BOB)).toBe(toneOf(BOB))
  })
})

describe('toneOfConversation', () => {
  it('单聊按对方 userId 取色，与消息头像同色', () => {
    expect(
      toneOfConversation({
        type: 'PRIVATE',
        conversationId: `p_380621333131694080_${BOB}`,
        peerUserId: BOB,
      }),
    ).toBe(toneOf(BOB))
  })

  it('群聊按 groupId 取色，与通讯录里的群同色', () => {
    expect(
      toneOfConversation({
        type: 'GROUP',
        conversationId: `g_${GROUP}`,
        peerUserId: '',
      }),
    ).toBe(toneOf(GROUP))
  })

  it('缺少 peerUserId 时退回会话 id，不会抛错', () => {
    expect(
      toneOfConversation({ type: 'PRIVATE', conversationId: 'p_1_2' }),
    ).toBe(toneOf('p_1_2'))
  })
})

describe('conversationPreview', () => {
  it('没有真实消息时返回空串，不显示占位文案', () => {
    expect(conversationPreview('direct', '')).toBe('')
    expect(conversationPreview('group', null, '爱丽丝')).toBe('')
    expect(conversationPreview('direct', '   ')).toBe('')
  })

  it('私聊直接显示消息原文', () => {
    expect(conversationPreview('direct', '晚上一起吃饭吗')).toBe('晚上一起吃饭吗')
  })

  it('群聊显示「姓名：内容」', () => {
    expect(conversationPreview('group', '明天上线', '鲍勃')).toBe('鲍勃：明天上线')
  })

  it('群里自己发的显示「我：内容」', () => {
    expect(conversationPreview('group', '收到', '爱丽丝', true)).toBe('我：收到')
  })

  it('群聊拿不到发送者昵称时只显示内容', () => {
    expect(conversationPreview('group', '收到', null)).toBe('收到')
  })
})
