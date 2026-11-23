import { describe, expect, it } from 'vitest'
import {
  indentSelection,
  insertBlock,
  insertCodeBlock,
  insertImage,
  insertLink,
  insertTable,
  setHeading,
  toggleLinePrefix,
  toggleWrap,
  wrapSelection,
} from '../markdownEdit'

const selection = (value: string, start = value.length, end = start) => ({ value, start, end })

describe('Markdown 工具栏动作', () => {
  it('包裹选中文字，光标停在文字内', () => {
    const result = wrapSelection(selection('这里是重点内容', 2, 5), '**', '**')
    expect(result.value).toBe('这里**是重点**内容')
    expect(result.value.slice(result.start, result.end)).toBe('是重点')
  })

  it('再点一次同样的格式取消包裹', () => {
    const result = toggleWrap(selection('**加粗**', 2, 4), '**', '**')
    expect(result.value).toBe('加粗')
    expect(result.start).toBe(0)
    expect(result.end).toBe(2)
  })

  it('标题按行生效，取消后回到正文', () => {
    const heading = setHeading(selection('标题内容', 4), 2)
    expect(heading.value).toBe('## 标题内容')
    expect(heading.start).toBe(7)

    const mixed = setHeading(selection('标题内容', 2), 1)
    expect(mixed.start).toBe(4)

    const plain = setHeading(selection('## 标题内容', 7), 0)
    expect(plain.value).toBe('标题内容')
  })

  it('多行选区的标题不为空行加标记', () => {
    const result = setHeading(selection('第一行\n\n第二行', 0, 10), 1)
    expect(result.value).toBe('# 第一行\n\n# 第二行')
  })

  it('无序列表可以再点一次取消', () => {
    const list = toggleLinePrefix(selection('苹果\n香蕉', 0, 5), 'bullet')
    expect(list.value).toBe('- 苹果\n- 香蕉')

    const plain = toggleLinePrefix({ value: list.value, start: 0, end: list.value.length }, 'bullet')
    expect(plain.value).toBe('苹果\n香蕉')
  })

  it('有序列表连续编号，并保持缩进', () => {
    const result = toggleLinePrefix(selection('  一\n  二\n  三', 3, 12), 'ordered')
    expect(result.value).toBe('  1. 一\n  2. 二\n  3. 三')
  })

  it('待办与其它列表互相转换，不会叠出双重标记', () => {
    const result = toggleLinePrefix(selection('1. 一\n1. 二', 4, 10), 'task')
    expect(result.value).toBe('- [ ] 一\n- [ ] 二')
  })

  it('代码块有选区时把整行放进去，光标选在代码上', () => {
    const result = insertCodeBlock(selection('前\nint a = 1;\n后', 2, 11), 'java')
    expect(result.value).toBe('前\n```java\nint a = 1;\n```\n后')
    expect(result.value.slice(result.start, result.end)).toBe('int a = 1;')
  })

  it('空选区插入代码块，光标落在空代码行', () => {
    const result = insertCodeBlock(selection('', 0), '')
    expect(result.value).toBe('```\n\n```')
    expect(result.start).toBe(4)
  })

  it('插入表格并选中第一列表头', () => {
    const result = insertTable(selection('', 0), 2, 1)
    expect(result.value.split('\n')).toHaveLength(3)
    expect(result.value.startsWith('| 列 1 | 列 2 |')).toBe(true)
    expect(result.value.slice(result.start, result.end)).toBe('列 1')
  })

  it('分割线插在空行位置，前后不会粘在一起', () => {
    const result = insertBlock(selection('正文\n\n', 4), '---')
    expect(result.value).toBe('正文\n\n---')
  })

  it('链接与图片选中 URL 方便直接粘贴', () => {
    const link = insertLink(selection('看这里', 0, 3))
    expect(link.value).toBe('[看这里](https://)')
    expect(link.value.slice(link.start, link.end)).toBe('https://')

    const image = insertImage(selection('', 0))
    expect(image.value).toBe('![图片说明](图片地址)')
    expect(image.value.slice(image.start, image.end)).toBe('图片地址')
  })

  it('Tab 缩进与 Shift+Tab 回缩', () => {
    const indented = indentSelection(selection('一\n二', 0, 3), 1)
    expect(indented.value).toBe('  一\n  二')

    const back = indentSelection({ value: indented.value, start: 0, end: indented.value.length }, -1)
    expect(back.value).toBe('一\n二')
  })

  it('行内没有选区时 Tab 插入两个空格', () => {
    const result = indentSelection(selection('ab', 1), 1)
    expect(result.value).toBe('a  b')
    expect(result.start).toBe(3)
  })
})
