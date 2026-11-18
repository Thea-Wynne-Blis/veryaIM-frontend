import { describe, expect, it } from 'vitest'
import { messageOf } from '../error'

describe('messageOf', () => {
  it('优先返回异常自身的文案', () => {
    expect(messageOf(new Error('network down'), '操作失败')).toBe('network down')
  })

  it('非 Error 的字符串也当作文案', () => {
    expect(messageOf('出错了', '操作失败')).toBe('出错了')
  })

  it('空异常退回调用方兜底', () => {
    expect(messageOf(new Error(''), '操作失败')).toBe('操作失败')
    expect(messageOf(undefined, '操作失败')).toBe('操作失败')
    expect(messageOf({}, '新建会话失败')).toBe('新建会话失败')
  })

  it('不传兜底时给通用文案', () => {
    expect(messageOf(null)).toBe('操作失败')
  })

  it('群禁言统一成明确的中文提示', () => {
    // 后端 GROUP_MUTED = 40306；不论定时还是永久禁言，用户只需要知道「发不出去」。
    expect(messageOf({ code: 40306, message: 'you are muted until 2026-01-01T00:00:00Z' }))
      .toBe('你已被禁言，请联系管理员')
    expect(messageOf({ code: 40306, message: 'group is muted' }))
      .toBe('你已被禁言，请联系管理员')
  })
})
