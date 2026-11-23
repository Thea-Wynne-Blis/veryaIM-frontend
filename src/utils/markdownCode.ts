/**
 * 代码块语言清单，以及预览里切换语言时改写源码围栏。
 *
 * <p>预览的代码块下方有一个语言下拉框（和 Typora 一样），选中后要把
 * 对应 ```java 围栏的 info 字符串改掉，同时保留正文。这里按「第几个围栏」
 * 定位，序号由渲染器在生成 HTML 时写入，纯函数便于单测。</p>
 */

export type CodeLanguage = {
  /** 写进围栏 info 字符串的值，空字符串表示纯文本 */
  value: string
  label: string
}

/** 工具栏与预览下拉共用的语言清单。 */
export const CODE_LANGUAGES: CodeLanguage[] = [
  { value: '', label: '纯文本' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'swift', label: 'Swift' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Shell' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'xml', label: 'XML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'diff', label: 'Diff' },
]

/** 用户手写的简写（js、py、sh…）统一到高亮器认识的语言名。 */
const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  python3: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  golang: 'go',
  rs: 'rust',
  'c++': 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  kt: 'kotlin',
  yml: 'yaml',
  md: 'markdown',
  htm: 'xml',
  svg: 'xml',
  postgres: 'sql',
  mysql: 'sql',
  text: '',
  txt: '',
  plaintext: '',
}

export function normalizeLanguage(raw: string | null | undefined): string {
  const value = (raw ?? '').trim().toLowerCase().split(/\s+/)[0] ?? ''
  if (value in LANGUAGE_ALIASES) return LANGUAGE_ALIASES[value]
  return value
}

export function languageLabel(value: string | null | undefined): string {
  const normalized = normalizeLanguage(value)
  if (!normalized) return '纯文本'
  const found = CODE_LANGUAGES.find((item) => item.value === normalized)
  return found?.label ?? normalized
}

export type FenceInfo = {
  /** 第几个围栏（从 0 开始） */
  index: number
  /** 开围栏所在行号（从 0 开始） */
  line: number
  /** 闭围栏所在行号；没有闭合时等于最后一行 */
  endLine: number
  /** 缩进 */
  indent: string
  /** 围栏标记，例如 ``` */
  marker: string
  /** 语言标注 */
  language: string
}

const FENCE_PATTERN = /^(\s{0,3})(`{3,}|~{3,})(.*)$/

/**
 * 扫描一遍源码，返回每个围栏的开围栏信息。
 *
 * <p>围栏内部的 ``` 也会算作闭合围栏，所以「第几个围栏」与渲染器给出的
 * 序号一致：渲染器每渲染一个代码块就递增一次。</p>
 */
export function scanFences(source: string): FenceInfo[] {
  const lines = source.split('\n')
  const fences: FenceInfo[] = []
  let open: { index: number; line: number; indent: string; marker: string } | null = null
  let index = 0

  lines.forEach((line, lineNo) => {
    const match = FENCE_PATTERN.exec(line)
    if (!open) {
      if (!match) return
      open = { index, line: lineNo, indent: match[1], marker: match[2] }
      fences.push({
        index,
        line: lineNo,
        endLine: lines.length - 1,
        indent: match[1],
        marker: match[2],
        language: match[3].trim(),
      })
      index += 1
      return
    }
    if (
      match &&
      match[2][0] === open.marker[0] &&
      match[2].length >= open.marker.length &&
      match[3].trim() === ''
    ) {
      fences[fences.length - 1].endLine = lineNo
      open = null
    }
  })

  return fences
}

/** 改写第 index 个代码围栏的语言标注；找不到时原样返回。 */
export function updateFenceLanguage(
  source: string,
  index: number,
  language: string,
): string {
  const lines = source.split('\n')
  const fence = scanFences(source)[index]
  if (!fence) return source
  lines[fence.line] = `${fence.indent}${fence.marker}${normalizeLanguage(language)}`
  return lines.join('\n')
}
