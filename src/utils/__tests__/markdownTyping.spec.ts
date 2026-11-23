import { describe, expect, it } from 'vitest'
import { applyTypingKey } from '../markdownTyping'

const at = (value: string, start = value.length, end = start) => ({ value, start, end })

describe('编辑器输入增强', () => {
  it('输入左括号自动补右括号', () => {
    const result = applyTypingKey(at('', 0), { key: '(', shiftKey: true })
    expect(result?.value).toBe('()')
    expect(result?.start).toBe(1)
  })

  it('已有右括号时直接跳过', () => {
    const result = applyTypingKey(at('()', 1), { key: ')' })
    expect(result?.value).toBe('()')
    expect(result?.start).toBe(2)
  })

  it('有选中文字时用括号包住', () => {
    const result = applyTypingKey(at('abc', 1, 2), { key: '[' })
    expect(result?.value).toBe('a[b]c')
    expect(result?.value.slice(result!.start, result!.end)).toBe('b')
  })

  it('引号只在空白或行尾处自动配对', () => {
    const paired = applyTypingKey(at('say ', 4), { key: '"' })
    expect(paired?.value).toBe('say ""')

    const typedInWord = applyTypingKey(at('don', 3), { key: "'" })
    expect(typedInWord).toBeNull()
  })

  it('Backspace 删除空的一对括号', () => {
    const result = applyTypingKey(at('()', 1), { key: 'Backspace' })
    expect(result?.value).toBe('')
    expect(result?.start).toBe(0)
  })

  it('回车续写无序列表与待办', () => {
    const bullet = applyTypingKey(at('- 第一项', 5), { key: 'Enter' })
    expect(bullet?.value).toBe('- 第一项\n- ')
    expect(bullet?.start).toBe(8)

    const task = applyTypingKey(at('- [x] 做完了', 10), { key: 'Enter' })
    expect(task?.value).toBe('- [x] 做完了\n- [ ] ')
  })

  it('有序列表回车后编号加一', () => {
    const result = applyTypingKey(at('3. 第三项', 7), { key: 'Enter' })
    expect(result?.value).toBe('3. 第三项\n4. ')
  })

  it('空列表项回车退出列表', () => {
    const result = applyTypingKey(at('- ', 2), { key: 'Enter' })
    expect(result?.value).toBe('')
    expect(result?.start).toBe(0)
  })

  it('代码块内回车保持当前缩进', () => {
    const value = '```java\n    int a = 1;'
    const result = applyTypingKey(at(value, value.length), { key: 'Enter' })
    expect(result?.value).toBe('```java\n    int a = 1;\n    ')
  })

  it('Ctrl+B / Ctrl+I 切换加粗与斜体', () => {
    const bold = applyTypingKey(at('重点', 0, 2), { key: 'b', ctrlKey: true })
    expect(bold?.value).toBe('**重点**')

    const italic = applyTypingKey(at('斜体', 0, 2), { key: 'i', metaKey: true })
    expect(italic?.value).toBe('*斜体*')
  })

  it('Ctrl+K 插入链接并选中网址', () => {
    const result = applyTypingKey(at('看这里', 0, 3), { key: 'k', ctrlKey: true })
    expect(result?.value).toBe('[看这里](https://)')
    expect(result?.value.slice(result!.start, result!.end)).toBe('https://')
  })

  it('Tab 缩进整行', () => {
    const result = applyTypingKey(at('第一行\n第二行', 0, 7), { key: 'Tab', shiftKey: true })
    expect(result?.value).toBe('第一行\n第二行')
  })

  it('普通字符交给浏览器处理', () => {
    expect(applyTypingKey(at('abc', 3), { key: 'd' })).toBeNull()
  })
})
