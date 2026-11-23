import { describe, expect, it } from 'vitest'
import {
  languageLabel,
  normalizeLanguage,
  scanFences,
  updateFenceLanguage,
} from '../markdownCode'

describe('代码块语言', () => {
  it('常见简写会归一化', () => {
    expect(normalizeLanguage('JS')).toBe('javascript')
    expect(normalizeLanguage('py')).toBe('python')
    expect(normalizeLanguage('sh')).toBe('bash')
    expect(normalizeLanguage('')).toBe('')
  })

  it('语言标签找不到时退回原始值', () => {
    expect(languageLabel('java')).toBe('Java')
    expect(languageLabel('')).toBe('纯文本')
    expect(languageLabel('brainfuck')).toBe('brainfuck')
  })

  it('扫描围栏时忽略未闭合与嵌套代码', () => {
    const source = ['```java', 'int a = 1;', '```', '', '~~~', 'plain', '~~~', '', '```', 'tail'].join('\n')
    const fences = scanFences(source)
    expect(fences).toHaveLength(3)
    expect(fences[0]).toMatchObject({ line: 0, endLine: 2, language: 'java' })
    expect(fences[1]).toMatchObject({ line: 4, endLine: 6, language: '' })
    expect(fences[2]).toMatchObject({ line: 8, endLine: 9 })
  })

  it('切换第 N 个代码块的语言只改围栏行', () => {
    const source = '说明\n```java\nint a = 1;\n```\n\n```\nplain\n```'
    const next = updateFenceLanguage(source, 1, 'python')
    expect(next).toBe('说明\n```java\nint a = 1;\n```\n\n```python\nplain\n```')
    expect(updateFenceLanguage(source, 9, 'go')).toBe(source)
  })
})
