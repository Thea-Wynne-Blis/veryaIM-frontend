/**
 * 笔记列表的分组与默认标题。
 *
 * <p>列表按「最后修改日期」分组，日期分隔线上写 `2026/11/23`；
 * 新建时没写标题的笔记用「笔记 HH:mm:ss」命名，配合日期分组就能看出
 * 这是哪一天几点记的。纯函数，便于单测。</p>
 */
import type { NoteSummary } from '../api/notes'

export type NoteGroup = {
  /** 分组键：`2026/11/23`，无日期时为 `unknown` */
  key: string
  /** 分隔线上显示的文案 */
  label: string
  items: NoteSummary[]
}

const UNKNOWN_KEY = 'unknown'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 把时间转成本地日期键 `2026/11/23`。 */
export function dayKeyOf(iso: string | null | undefined): string {
  if (!iso) return UNKNOWN_KEY
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return UNKNOWN_KEY
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
}

/** 按最后修改日期分组，保持接口返回的先后顺序。 */
export function groupNotesByDay(items: NoteSummary[]): NoteGroup[] {
  const groups: NoteGroup[] = []
  const byKey = new Map<string, NoteGroup>()

  for (const item of items) {
    const key = dayKeyOf(item.updatedAt)
    let group = byKey.get(key)
    if (!group) {
      group = { key, label: key === UNKNOWN_KEY ? '更早' : key, items: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.items.push(item)
  }

  return groups
}

/** 没有标题时的默认名称：「笔记 19:50:39」。 */
export function defaultNoteTitle(date = new Date()): string {
  return `笔记 ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
