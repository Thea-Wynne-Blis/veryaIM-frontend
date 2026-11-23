/**
 * 输入框插入相关的小工具。
 *
 * <p>表情、@ 提及、快捷短语都是「往草稿里塞一段文本」，之前各个聊天组件各写一份，
 * 行为还不完全一致（有的替换末尾的 @，有的直接追加）。统一到这里，配套单测。</p>
 */

/** 在光标处插入片段，返回新草稿和插入后的光标位置。选区被片段替换。 */
export function insertAtCursor(
  value: string,
  snippet: string,
  start = value.length,
  end = start,
): { value: string; caret: number } {
  const from = Math.max(0, Math.min(start, value.length))
  const to = Math.max(from, Math.min(end, value.length))
  return {
    value: value.slice(0, from) + snippet + value.slice(to),
    caret: from + snippet.length,
  }
}

/**
 * 选择 @ 候选后的效果：用户刚敲的尾随 `@` 换成人名，否则直接追加。
 * 两种情况都补一个空格，方便继续打字。
 */
export function appendMention(value: string, label: string): string {
  const head = value.endsWith('@') ? value.slice(0, -1) : value
  return `${head}@${label} `
}
