/**
 * 光标所在行的 Markdown 上下文。
 *
 * <p>工具栏要知道光标是不是在标题、列表、引用或代码围栏里：
 * 「正文」下拉显示当前级别，列表按钮也能高亮。纯函数，便于单测。</p>
 */
import { scanFences } from './markdownCode'

export type LineContext = {
  /** 行号（从 0 开始） */
  lineIndex: number
  /** 当前行起始偏移 */
  lineStart: number
  /** 当前行结束偏移（不含换行符） */
  lineEnd: number
  /** 标题级别，0 表示普通段落 */
  heading: number
  quote: boolean
  bullet: boolean
  ordered: boolean
  task: boolean
  /** 光标在代码围栏内部时，该围栏的语言标注；否则为 null */
  fenceLanguage: string | null
}

const HEADING = /^ {0,3}(#{1,6})\s+/
const TASK = /^ {0,3}[-*+]\s+\[[ xX]\]\s+/
const BULLET = /^ {0,3}[-*+]\s+/
const ORDERED = /^ {0,3}\d+[.)]\s+/
const QUOTE = /^ {0,3}>\s?/

function clampCaret(value: string, caret: number): number {
  if (!Number.isFinite(caret)) return value.length
  return Math.min(Math.max(Math.trunc(caret), 0), value.length)
}

export function lineContextAt(value: string, caret: number): LineContext {
  const offset = clampCaret(value, caret)
  const lineStart = value.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  const nextBreak = value.indexOf('\n', offset)
  const lineEnd = nextBreak === -1 ? value.length : nextBreak
  const lineIndex = value.slice(0, lineStart).split('\n').length - 1
  const line = value.slice(lineStart, lineEnd)

  const fence = scanFences(value).find(
    (item) => item.line < lineIndex && lineIndex < item.endLine,
  )

  const heading = HEADING.exec(line)
  const task = TASK.test(line)
  const bullet = !task && BULLET.test(line)

  return {
    lineIndex,
    lineStart,
    lineEnd,
    heading: heading ? heading[1].length : 0,
    quote: QUOTE.test(line),
    bullet,
    ordered: !task && !bullet && ORDERED.test(line),
    task,
    fenceLanguage: fence ? fence.language : null,
  }
}
