import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../markdown'

describe('renderMarkdown', () => {
  it('代码块带语言栏、语言选择与高亮', () => {
    const html = renderMarkdown('```java\npublic class A {}\n```')
    expect(html).toContain('class="md-code"')
    expect(html).toContain('md-code-lang')
    expect(html).toContain('md-code-copy')
    expect(html).toContain('language-java')
    expect(html).toContain('hljs-keyword')
    expect(html).toContain('data-fence="0"')
  })

  it('多个代码块的序号依次递增', () => {
    const html = renderMarkdown('```\na\n```\n\n```js\nb\n```')
    expect(html).toContain('data-fence="0"')
    expect(html).toContain('data-fence="1"')
  })

  it('未知语言按纯文本输出，不注入 HTML', () => {
    const html = renderMarkdown('```nope\n<b>x</b>\n```')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(html).not.toContain('<b>x</b>')
  })

  it('外链强制新窗口打开，脚本会被清理', () => {
    const html = renderMarkdown('[站点](https://example.com)\n\n<script>alert(1)</script>')
    expect(html).toContain('target="_blank"')
    expect(html).not.toContain('<script')
  })
})
