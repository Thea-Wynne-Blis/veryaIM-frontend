/**
 * 从 Markdown 正文里提取标题大纲。
 *
 * <p>帮助面板的「大纲」页用它列出当前笔记的各级标题，点击可以跳回正文位置。
 * 代码围栏里的 `# 注释` 不算标题，因此扫描时先跳过围栏。</p>
 */

export type OutlineItem = {
  level: number
  text: string
  /** 标题所在行号（从 0 开始） */
  line: number
}

const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const FENCE = /^\s{0,3}(`{3,}|~{3,})/

/** 去掉标题里的行内标记，只留下可读文字。 */
export function plainInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/(^|[\s(])[*_]([^*_]+)[*_]/g, '$1$2')
    .trim()
}

export function outlineOf(source: string): OutlineItem[] {
  const items: OutlineItem[] = []
  let fence: string | null = null

  source.split('\n').forEach((line, index) => {
    const fenceMatch = FENCE.exec(line)
    if (fenceMatch) {
      if (!fence) {
        fence = fenceMatch[1]
      } else if (fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        fence = null
      }
      return
    }
    if (fence) return

    const match = HEADING.exec(line)
    if (!match) return
    const text = plainInline(match[2])
    if (!text) return
    items.push({ level: match[1].length, text, line: index })
  })

  return items
}
