import { describe, expect, it } from 'vitest'
import { insertMarkdownSnippet, MARKDOWN_SNIPPETS, type MarkdownSnippet } from '../markdownSnippet'

const snippet = (label: string): MarkdownSnippet => {
  const found = MARKDOWN_SNIPPETS.find((item) => item.label === label)
  if (!found) throw new Error(`missing snippet: ${label}`)
  return found
}

describe('Markdown 语法速查', () => {
  it('包裹类语法会包住选中的文字，光标停在文字内', () => {
    const result = insertMarkdownSnippet(
      { value: '这里是重点内容', start: 2, end: 5 },
      snippet('加粗'),
    )
    expect(result.value).toBe('这里**是重点**内容')
    expect(result.value.slice(result.start, result.end)).toBe('是重点')
  })

  it('没有选中文字时插入占位文字，方便直接改写', () => {
    const result = insertMarkdownSnippet(
      { value: '开头', start: 2, end: 2 },
      snippet('链接'),
    )
    expect(result.value).toBe('开头[文字](https://)')
    expect(result.value.slice(result.start, result.end)).toBe('文字')
  })

  it('块级语法插在当前行行首，不会打断已有段落', () => {
    const result = insertMarkdownSnippet(
      { value: '第一行\n第二行', start: 5, end: 5 },
      snippet('无序列表'),
    )
    expect(result.value).toBe('第一行\n- 列表项第二行')
    expect(result.start).toBe(9)
  })

  it('表格与代码块保留换行', () => {
    const table = insertMarkdownSnippet({ value: '', start: 0, end: 0 }, snippet('表格'))
    expect(table.value.split('\n')).toHaveLength(3)
    expect(table.value.startsWith('| 列 1 | 列 2 |')).toBe(true)

    const code = insertMarkdownSnippet({ value: '', start: 0, end: 0 }, snippet('代码块'))
    expect(code.value).toBe('```\n代码\n```')
  })

  it('越界的光标位置会被夹回正文范围内', () => {
    const result = insertMarkdownSnippet(
      { value: 'ab', start: 99, end: 120 },
      snippet('斜体'),
    )
    expect(result.value).toBe('ab*文字*')
  })
})
