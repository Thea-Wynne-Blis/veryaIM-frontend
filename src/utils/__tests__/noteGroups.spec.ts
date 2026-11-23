import { describe, expect, it } from 'vitest'
import { defaultNoteTitle, dayKeyOf, groupNotesByDay } from '../noteGroups'
import type { NoteSummary } from '../../api/notes'

function note(id: string, updatedAt: string): NoteSummary {
  return { id, title: id, excerpt: '', createdAt: updatedAt, updatedAt }
}

describe('笔记按天分组', () => {
  it('同一天的笔记归为一组，保持原有顺序', () => {
    const groups = groupNotesByDay([
      note('a', '2026-11-23T19:50:39+08:00'),
      note('b', '2026-11-23T08:10:00+08:00'),
      note('c', '2026-11-22T23:59:00+08:00'),
    ])
    expect(groups.map((group) => group.label)).toEqual(['2026/11/23', '2026/11/22'])
    expect(groups[0].items.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('没有时间或时间非法的笔记归到「更早」', () => {
    const groups = groupNotesByDay([note('a', ''), note('b', 'not-a-date')])
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('更早')
  })

  it('日期键使用本地日期的年月日', () => {
    expect(dayKeyOf('2026-01-02T10:00:00+08:00')).toBe('2026/01/02')
    expect(dayKeyOf(undefined)).toBe('unknown')
  })

  it('默认标题是「笔记 时:分:秒」', () => {
    expect(defaultNoteTitle(new Date(2026, 10, 23, 9, 5, 7))).toBe('笔记 09:05:07')
  })
})
