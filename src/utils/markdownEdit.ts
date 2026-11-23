/**
 * 笔记工具栏的编辑动作。
 *
 * <p>全部是纯函数：输入当前正文与光标/选区，输出新的正文与光标位置，
 * 事件绑定与 DOM 操作留在组件里。这样标题、列表、代码块、表格、链接
 * 都能单独测试，NotesView 不再堆一长串字符串拼接。</p>
 */
import { normalizeLanguage } from './markdownCode'
import type { InsertResult, TextSelection } from './markdownSnippet'

export type EditResult = InsertResult

export type LinePrefixKind = 'bullet' | 'ordered' | 'task' | 'quote'

const HEADING_PREFIX = /^(\s*)#{1,6}\s+/
const TASK_PREFIX = /^(\s*)[-*+]\s+\[[ xX]\]\s+/
const BULLET_PREFIX = /^(\s*)[-*+]\s+(?!\[[ xX]\])/
const ORDERED_PREFIX = /^(\s*)\d+[.)]\s+/
const QUOTE_PREFIX = /^(\s*)>\s?/
const PLAIN_INDENT = /^\s*/

const TARGET_PATTERNS: Record<LinePrefixKind, RegExp> = {
  bullet: BULLET_PREFIX,
  ordered: ORDERED_PREFIX,
  task: TASK_PREFIX,
  quote: QUOTE_PREFIX,
}

function clamp(value: string, caret: number): number {
  if (!Number.isFinite(caret)) return value.length
  return Math.min(Math.max(Math.trunc(caret), 0), value.length)
}

function normalizeSelection(selection: TextSelection): TextSelection {
  const start = clamp(selection.value, selection.start)
  const end = clamp(selection.value, Math.max(selection.end, start))
  return { value: selection.value, start, end }
}

function lineStartOf(value: string, offset: number): number {
  return value.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
}

function lineEndOf(value: string, offset: number): number {
  const next = value.indexOf('\n', offset)
  return next === -1 ? value.length : next
}

/**
 * 对选区覆盖的整行做变换，并按每行的长度变化修正光标。
 *
 * <p>标题、列表、缩进都按「整行」生效，但用户的光标通常停在行中间，
 * 所以不能在变换后把光标丢到行尾：按该行前缀增删的长度平移即可。</p>
 */
function editLines(
  selection: TextSelection,
  transform: (lines: string[]) => string[],
): EditResult {
  const { value, start, end } = normalizeSelection(selection)
  const from = lineStartOf(value, start)
  const to = lineEndOf(value, end)
  const lines = value.slice(from, to).split('\n')
  const next = transform(lines)

  const originalStarts: number[] = []
  const nextStarts: number[] = []
  let original = from
  let shifted = from
  lines.forEach((line, index) => {
    originalStarts.push(original)
    nextStarts.push(shifted)
    original += line.length + 1
    shifted += (next[index]?.length ?? 0) + 1
  })

  /** 把旧偏移映射到新正文：列号加上这一行前缀的增减量。 */
  const mapOffset = (offset: number): number => {
    let index = 0
    while (index + 1 < lines.length && originalStarts[index + 1] <= offset) index += 1
    const line = lines[index] ?? ''
    const nextLine = next[index] ?? ''
    const column = offset - originalStarts[index]
    const delta = nextLine.length - line.length
    const mapped = Math.min(Math.max(column + delta, 0), nextLine.length)
    return nextStarts[index] + mapped
  }

  const nextStart = mapOffset(start)
  const nextEnd = end > start ? mapOffset(end) : nextStart

  return {
    value: value.slice(0, from) + next.join('\n') + value.slice(to),
    start: nextStart,
    end: Math.max(nextStart, nextEnd),
  }
}

/** 用前后标记包住选中文字；没有选中时放入占位文字并选中它。 */
export function wrapSelection(
  selection: TextSelection,
  before: string,
  after: string,
  placeholder = '文字',
): EditResult {
  const { value, start, end } = normalizeSelection(selection)
  const selected = value.slice(start, end) || placeholder
  const nextValue = value.slice(0, start) + before + selected + after + value.slice(end)
  const innerStart = start + before.length
  return { value: nextValue, start: innerStart, end: innerStart + selected.length }
}

/** 再点一次同样的格式：取消包裹。 */
export function toggleWrap(
  selection: TextSelection,
  before: string,
  after: string,
  placeholder = '文字',
): EditResult {
  const { value, start, end } = normalizeSelection(selection)
  if (start === end) {
    // 光标正好夹在一对标记之间（例如 **|**）时，把这一对删掉
    if (
      value.slice(start - before.length, start) === before &&
      value.slice(start, start + after.length) === after
    ) {
      return {
        value: value.slice(0, start - before.length) + value.slice(start + after.length),
        start: start - before.length,
        end: start - before.length,
      }
    }
    return wrapSelection(selection, before, after, placeholder)
  }

  const selected = value.slice(start, end)
  const wrappedOutside =
    value.slice(start - before.length, start) === before &&
    value.slice(end, end + after.length) === after
  const wrappedInside =
    selected.length >= before.length + after.length &&
    selected.startsWith(before) &&
    selected.endsWith(after)

  if (wrappedOutside) {
    return {
      value: value.slice(0, start - before.length) + selected + value.slice(end + after.length),
      start: start - before.length,
      end: end - before.length,
    }
  }
  if (wrappedInside) {
    const inner = selected.slice(before.length, selected.length - after.length)
    return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length }
  }
  return wrapSelection(selection, before, after, placeholder)
}

/** 把选中的行设成指定级别的标题；level 为 0 时还原成正文。 */
export function setHeading(selection: TextSelection, level: 0 | 1 | 2 | 3 | 4 | 5 | 6): EditResult {
  const prefix = level > 0 ? `${'#'.repeat(level)} ` : ''
  return editLines(selection, (lines) =>
    lines.map((line) => {
      if (!line.trim()) return line
      const match = HEADING_PREFIX.exec(line)
      const indent = match ? match[1] : (PLAIN_INDENT.exec(line)?.[0] ?? '')
      const body = match ? line.slice(match[0].length) : line.slice(indent.length)
      return `${indent}${prefix}${body}`
    }),
  )
}

/** 去掉行首的标题 / 列表 / 待办 / 引用标记，保留缩进。 */
function stripBlockPrefix(line: string): { indent: string; body: string } {
  const marker = HEADING_PREFIX.exec(line)
    ?? TASK_PREFIX.exec(line)
    ?? ORDERED_PREFIX.exec(line)
    ?? BULLET_PREFIX.exec(line)
    ?? QUOTE_PREFIX.exec(line)
  if (marker) {
    return { indent: marker[1], body: line.slice(marker[0].length) }
  }
  const indent = PLAIN_INDENT.exec(line)?.[0] ?? ''
  return { indent, body: line.slice(indent.length) }
}

/**
 * 列表 / 引用开关：选中的行都已经是该形式时取消，否则统一改成该形式。
 *
 * <p>不同列表之间会互相转换（例如有序列表点「待办」直接变成复选框），
 * 不会叠出 `- 1. ` 这种双重标记。</p>
 */
export function toggleLinePrefix(
  selection: TextSelection,
  kind: LinePrefixKind,
): EditResult {
  const { value, start, end } = normalizeSelection(selection)
  const from = lineStartOf(value, start)
  const to = lineEndOf(value, end)
  const lines = value.slice(from, to).split('\n')
  const meaningful = lines.filter((line) => line.trim().length > 0)
  const pattern = TARGET_PATTERNS[kind]
  const allMatched = meaningful.length > 0 && meaningful.every((line) => pattern.test(line))

  let counter = 0
  const next = lines.map((line) => {
    if (!line.trim()) return line
    const { indent, body } = stripBlockPrefix(line)
    if (allMatched) return `${indent}${body}`
    counter += 1
    const prefix = kind === 'ordered' ? `${counter}. ` : kind === 'bullet' ? '- ' : kind === 'task' ? '- [ ] ' : '> '
    return `${indent}${prefix}${body}`
  })

  return editLines(selection, () => next)
}

/** Tab / Shift+Tab：整段缩进或回缩两个空格。 */
export function indentSelection(selection: TextSelection, direction: 1 | -1): EditResult {
  const { value, start, end } = normalizeSelection(selection)
  if (start === end && direction === 1 && lineStartOf(value, start) !== start) {
    const offset = start
    return {
      value: value.slice(0, offset) + '  ' + value.slice(offset),
      start: offset + 2,
      end: offset + 2,
    }
  }

  return editLines(selection, (lines) =>
    lines.map((line) => {
      if (!line.trim()) return line
      if (direction === 1) return `  ${line}`
      return line.startsWith('  ') ? line.slice(2) : line.replace(/^[ \t]{1,2}/, '')
    }),
  )
}

function padBlankLines(value: string, offset: number): { lead: string; tail: string } {
  return {
    lead: offset > 0 && value[offset - 1] !== '\n' ? '\n' : '',
    tail: offset < value.length && value[offset] !== '\n' ? '\n' : '',
  }
}

/** 插入一段独立成块的 Markdown（表格、分割线…），光标落在块的开头。 */
export function insertBlock(selection: TextSelection, block: string): EditResult {
  const { value, start, end } = normalizeSelection(selection)
  const from = lineStartOf(value, start)
  const lineEnd = lineEndOf(value, end)
  const lineIsBlank = value.slice(from, lineEnd).trim() === ''

  if (lineIsBlank) {
    const tail = lineEnd < value.length ? '\n' : ''
    return {
      value: value.slice(0, from) + block + tail + value.slice(lineEnd + (tail ? 1 : 0)),
      start: from,
      end: from + block.length,
    }
  }

  const { tail } = padBlankLines(value, from)
  const inserted = `${block}${tail || '\n'}`
  return {
    value: value.slice(0, from) + inserted + value.slice(from),
    start: from,
    end: from + block.length,
  }
}

/** 插入围栏代码块；有选中文字时把它放进去，没有时留一行空代码。 */
export function insertCodeBlock(selection: TextSelection, language: string): EditResult {
  const { value, start, end } = normalizeSelection(selection)
  const lang = normalizeLanguage(language)
  const open = '```' + lang

  if (start !== end) {
    const from = lineStartOf(value, start)
    const to = lineEndOf(value, end)
    const inner = value.slice(from, to)
    const block = `${open}\n${inner}\n\`\`\``
    const innerStart = from + open.length + 1
    return {
      value: value.slice(0, from) + block + value.slice(to),
      start: innerStart,
      end: innerStart + inner.length,
    }
  }

  const { lead, tail } = padBlankLines(value, start)
  const body = `${lead}${open}\n\n\`\`\`${tail ? '\n' : ''}`
  const caret = start + lead.length + open.length + 1
  return {
    value: value.slice(0, start) + body + value.slice(start),
    start: caret,
    end: caret,
  }
}

/** 插入表格，默认三列两行内容，并选中第一列表头方便直接改写。 */
export function insertTable(selection: TextSelection, columns = 3, rows = 2): EditResult {
  const count = Math.min(Math.max(Math.trunc(columns), 1), 8)
  const rowsCount = Math.min(Math.max(Math.trunc(rows), 1), 12)
  const header = `| ${Array.from({ length: count }, (_, i) => `列 ${i + 1}`).join(' | ')} |`
  const divider = `| ${Array.from({ length: count }, () => '---').join(' | ')} |`
  const body = Array.from(
    { length: rowsCount },
    () => `| ${Array.from({ length: count }, () => '内容').join(' | ')} |`,
  )
  const block = [header, divider, ...body].join('\n')
  const result = insertBlock(selection, block)
  const cellStart = result.start + 2
  return { ...result, start: cellStart, end: cellStart + 3 }
}

/** 插入链接：有选中文字时当作链接文字，没有时用占位文字。 */
export function insertLink(selection: TextSelection): EditResult {
  const { value, start, end } = normalizeSelection(selection)
  const text = value.slice(start, end) || '文字'
  const url = 'https://'
  const inserted = `[${text}](${url})`
  const urlStart = start + text.length + 3
  return {
    value: value.slice(0, start) + inserted + value.slice(end),
    start: urlStart,
    end: urlStart + url.length,
  }
}

/** 插入图片：选中文字当作替代说明。 */
export function insertImage(selection: TextSelection): EditResult {
  const { value, start, end } = normalizeSelection(selection)
  const alt = value.slice(start, end) || '图片说明'
  const url = '图片地址'
  const inserted = `![${alt}](${url})`
  const urlStart = start + alt.length + 4
  return {
    value: value.slice(0, start) + inserted + value.slice(end),
    start: urlStart,
    end: urlStart + url.length,
  }
}
