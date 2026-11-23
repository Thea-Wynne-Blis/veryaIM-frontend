/**
 * 编辑器的输入增强：括号配对、列表续写、缩进与快捷键。
 *
 * <p>像 Typora 一样边写边得到帮助，但逻辑全部是纯函数：
 * 组件只负责把结果写回 textarea 并恢复选区，因此这些行为可以单测。</p>
 */
import { indentSelection, insertLink, toggleWrap, type EditResult } from './markdownEdit'
import type { TextSelection } from './markdownSnippet'

export type TypingKey = {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

type Pair = { open: string; close: string }

const BRACKET_PAIRS: Pair[] = [
  { open: '(', close: ')' },
  { open: '[', close: ']' },
  { open: '{', close: '}' },
]

const QUOTE_PAIRS: Pair[] = [
  { open: '"', close: '"' },
  { open: "'", close: "'" },
  { open: '`', close: '`' },
]

const ALL_PAIRS = [...BRACKET_PAIRS, ...QUOTE_PAIRS]

type LinePrefix = {
  /** 行首缩进 */
  indent: string
  /** 回车后下一行应使用的前缀 */
  next: string
  /** 前缀在行首的长度 */
  length: number
}

const TASK_LINE = /^(\s*)([-*+])\s+\[([ xX])\]\s+/
const BULLET_LINE = /^(\s*)([-*+])\s+(?!\[[ xX]\])/
const ORDERED_LINE = /^(\s*)(\d+)([.)])\s+/
const QUOTE_LINE = /^(\s*)>\s?/
const CODE_INDENT = /^\s*/

function clamp(value: string, caret: number): number {
  if (!Number.isFinite(caret)) return value.length
  return Math.min(Math.max(Math.trunc(caret), 0), value.length)
}

function lineAround(value: string, caret: number): { from: number; to: number; line: string } {
  const from = value.lastIndexOf('\n', Math.max(0, caret - 1)) + 1
  const next = value.indexOf('\n', caret)
  const to = next === -1 ? value.length : next
  return { from, to, line: value.slice(from, to) }
}

function prefixOf(line: string): LinePrefix | null {
  const task = TASK_LINE.exec(line)
  if (task) return { indent: task[1], next: `${task[1]}${task[2]} [ ] `, length: task[0].length }
  const bullet = BULLET_LINE.exec(line)
  if (bullet) return { indent: bullet[1], next: `${bullet[1]}${bullet[2]} `, length: bullet[0].length }
  const ordered = ORDERED_LINE.exec(line)
  if (ordered) {
    const nextNumber = Number(ordered[2]) + 1
    return { indent: ordered[1], next: `${ordered[1]}${nextNumber}${ordered[3]} `, length: ordered[0].length }
  }
  const quote = QUOTE_LINE.exec(line)
  if (quote) return { indent: quote[1], next: `${quote[1]}> `, length: quote[0].length }
  return null
}

/** 光标是否落在代码围栏内部（不含围栏行本身）。 */
function insideFence(value: string, caret: number): boolean {
  const lines = value.slice(0, caret).split('\n')
  let fence: string | null = null
  // 最后一行是光标所在行，不参与围栏判定
  for (const line of lines.slice(0, -1)) {
    const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (!match) continue
    if (!fence) fence = match[1]
    else if (match[1][0] === fence[0] && match[1].length >= fence.length) fence = null
  }
  return fence !== null
}

function advance(value: string, caret: number): EditResult {
  return { value, start: caret + 1, end: caret + 1 }
}

/** 自动配对的条件：后面是空白/收尾符号，前面不是单词字符（避免 don't 变成 don''t）。 */
function quoteCanPair(value: string, caret: number): boolean {
  const next = value[caret]
  const prev = value[caret - 1]
  const nextOk = !next || /[\s,.;:!?，。；：！？、)\]}>]/.test(next)
  const prevOk = !prev || /[\s([{（【《"'`]/.test(prev)
  return nextOk && prevOk
}

function handleEnter(selection: TextSelection): EditResult | null {
  const { value, start, end } = selection
  if (start !== end) return null
  const { from, line } = lineAround(value, start)

  if (insideFence(value, start)) {
    const indent = CODE_INDENT.exec(line)?.[0] ?? ''
    const caret = start + 1 + indent.length
    return {
      value: `${value.slice(0, start)}\n${indent}${value.slice(start)}`,
      start: caret,
      end: caret,
    }
  }

  const prefix = prefixOf(line)
  if (!prefix) return null

  const content = line.slice(prefix.length)
  if (!content.trim()) {
    const caret = from
    return {
      value: value.slice(0, from) + value.slice(start),
      start: caret,
      end: caret,
    }
  }

  const caret = start + 1 + prefix.next.length
  return {
    value: `${value.slice(0, start)}\n${prefix.next}${value.slice(start)}`,
    start: caret,
    end: caret,
  }
}

function handleBackspace(selection: TextSelection): EditResult | null {
  const { value, start, end } = selection
  if (start !== end || start === 0) return null
  const pair = ALL_PAIRS.find(
    (item) => value[start - 1] === item.open && value[start] === item.close,
  )
  if (!pair) return null
  const caret = start - 1
  return {
    value: value.slice(0, caret) + value.slice(caret + 2),
    start: caret,
    end: caret,
  }
}

function handleCharacter(selection: TextSelection, key: string): EditResult | null {
  const { value, start, end } = selection
  const emptySelection = start === end

  if (emptySelection && value[start] === key) {
    const pair = ALL_PAIRS.find((item) => item.close === key)
    if (pair) return advance(value, start)
  }

  const bracket = BRACKET_PAIRS.find((item) => item.open === key)
  if (bracket) {
    return wrapSelectionLike(value, start, end, bracket)
  }

  const quote = QUOTE_PAIRS.find((item) => item.open === key)
  if (quote) {
    if (emptySelection && !quoteCanPair(value, start)) return null
    return wrapSelectionLike(value, start, end, quote)
  }

  return null
}

function wrapSelectionLike(
  value: string,
  start: number,
  end: number,
  pair: Pair,
): EditResult {
  const selected = value.slice(start, end)
  const nextValue = value.slice(0, start) + pair.open + selected + pair.close + value.slice(end)
  const innerStart = start + pair.open.length
  return { value: nextValue, start: innerStart, end: innerStart + selected.length }
}

/**
 * 处理编辑器的 keydown。
 *
 * <p>返回 null 表示交给浏览器默认行为（普通字符、方向键、删除…）。
 * 返回结果时调用方需要 preventDefault 并把 value / 选区写回。</p>
 */
export function applyTypingKey(selection: TextSelection, key: TypingKey): EditResult | null {
  const value = selection.value
  const start = clamp(value, selection.start)
  const end = clamp(value, Math.max(selection.end, start))
  const normalized: TextSelection = { value, start, end }

  if (key.altKey) return null

  if (key.ctrlKey || key.metaKey) {
    const lower = key.key.toLowerCase()
    if (lower === 'b') return toggleWrap(normalized, '**', '**')
    if (lower === 'i') return toggleWrap(normalized, '*', '*')
    if (lower === 'k') return insertLink(normalized)
    return null
  }

  if (key.key === 'Tab') return indentSelection(normalized, key.shiftKey ? -1 : 1)
  if (key.key === 'Enter') return handleEnter(normalized)
  if (key.key === 'Backspace') return handleBackspace(normalized)
  if (key.key.length !== 1) return null
  return handleCharacter(normalized, key.key)
}
