import { describe, expect, it } from 'vitest'
import { outlineOf, plainInline } from '../markdownOutline'

describe('笔记大纲', () => {
  it('提取各级标题与行号', () => {
    const source = '# 一级\n正文\n## 二级\n### 三级'
    expect(outlineOf(source)).toEqual([
      { level: 1, text: '一级', line: 0 },
      { level: 2, text: '二级', line: 2 },
      { level: 3, text: '三级', line: 3 },
    ])
  })

  it('跳过代码围栏里的注释', () => {
    const source = '# 真标题\n```bash\n# 注释\n```\n## 另一个'
    expect(outlineOf(source).map((item) => item.text)).toEqual(['真标题', '另一个'])
  })

  it('标题里的行内标记会去掉', () => {
    expect(plainInline('**加粗** 与 `代码` 和 [链接](https://a)')).toBe('加粗 与 代码 和 链接')
  })
})
