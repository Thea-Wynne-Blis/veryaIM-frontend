/**
 * 笔记的 Markdown 语法速查数据与插入逻辑。
 *
 * <p>书本图标打开的帮助面板按「文字 / 段落 / 代码 / 表格与链接」分组展示，
 * 这里只放纯数据与纯函数：面板与工具栏都复用同一份定义，插入行为便于单测，
 * NotesView 里不再拼接 Markdown 字符串。</p>
 */

export type MarkdownSnippet = {
  /** 面板里展示的语法示例 */
  syntax: string
  /** 中文名称 */
  label: string
  /** 插入内容 */
  before: string
  /** 包裹选中文字时追加在后面的标记 */
  after?: string
  /** 块级语法插在行首，不包裹选中内容 */
  block?: boolean
  /** 面板里的一句说明 */
  tip?: string
  /** 帮助面板里展示的快捷键 */
  shortcut?: string
}

export type MarkdownSnippetGroup = {
  title: string
  items: MarkdownSnippet[]
}

export type TextSelection = {
  value: string
  start: number
  end: number
}

export type InsertResult = {
  value: string
  /** 插入后应恢复的光标区间 */
  start: number
  end: number
}

export const MARKDOWN_GROUPS: MarkdownSnippetGroup[] = [
  {
    title: '文字格式',
    items: [
      { syntax: '**加粗**', label: '加粗', before: '**', after: '**', shortcut: 'Ctrl + B' },
      { syntax: '*斜体*', label: '斜体', before: '*', after: '*', shortcut: 'Ctrl + I' },
      { syntax: '~~删除线~~', label: '删除线', before: '~~', after: '~~', tip: '给选中的文字划线' },
      { syntax: '`行内代码`', label: '行内代码', before: '`', after: '`', tip: '适合函数名、命令' },
    ],
  },
  {
    title: '段落与列表',
    items: [
      { syntax: '# 标题', label: '标题', before: '# 标题', block: true, tip: '最多六级，也可用上方「正文」下拉' },
      { syntax: '- 列表项', label: '无序列表', before: '- 列表项', block: true },
      { syntax: '1. 列表项', label: '有序列表', before: '1. 列表项', block: true },
      { syntax: '- [ ] 待办', label: '待办', before: '- [ ] 待办事项', block: true, tip: '回车会自动续下一项' },
      { syntax: '> 引用内容', label: '引用', before: '> 引用内容', block: true },
      { syntax: '---', label: '分割线', before: '---', block: true },
    ],
  },
  {
    title: '代码',
    items: [
      { syntax: '```\n代码\n```', label: '代码块', before: '```\n代码\n```', block: true, tip: '工具栏可按语言插入' },
      {
        syntax: '```java\n代码\n```',
        label: '带语言代码块',
        before: '```java\n代码\n```',
        block: true,
        tip: '预览里会按语言高亮，并可切换语言',
      },
    ],
  },
  {
    title: '表格与链接',
    items: [
      {
        syntax: '| 列 1 | 列 2 |',
        label: '表格',
        before: '| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |',
        block: true,
      },
      {
        syntax: '[文字](https://)',
        label: '链接',
        before: '[',
        after: '](https://)',
        shortcut: 'Ctrl + K',
        tip: '预览里新窗口打开',
      },
      { syntax: '![说明](图片地址)', label: '图片', before: '![', after: '](图片地址)' },
    ],
  },
]

export const MARKDOWN_SNIPPETS: MarkdownSnippet[] = MARKDOWN_GROUPS.flatMap(
  (group) => group.items,
)

/** 没有选中文本时，包裹类语法默认放进去的占位文字。 */
const PLACEHOLDER = '文字'

/**
 * 把一条语法应用到正文：块级语法插在光标所在行行首，
 * 其余用前后标记包住选中的文字。
 */
export function insertMarkdownSnippet(
  selection: TextSelection,
  snippet: MarkdownSnippet,
): InsertResult {
  const { value } = selection
  const start = Math.min(Math.max(selection.start, 0), value.length)
  const end = Math.min(Math.max(selection.end, start), value.length)

  if (snippet.block) {
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const inserted = snippet.before
    return {
      value: value.slice(0, lineStart) + inserted + value.slice(lineStart),
      start: lineStart + inserted.length,
      end: lineStart + inserted.length,
    }
  }

  const selected = value.slice(start, end) || PLACEHOLDER
  const before = snippet.before
  const after = snippet.after ?? ''
  return {
    value: value.slice(0, start) + before + selected + after + value.slice(end),
    start: start + before.length,
    end: start + before.length + selected.length,
  }
}
