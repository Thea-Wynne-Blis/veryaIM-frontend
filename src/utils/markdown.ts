import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import { CODE_LANGUAGES, normalizeLanguage } from './markdownCode'

/**
 * Markdown 渲染。
 *
 * <p>笔记正文来自用户自己输入，虽然只对自己可见，仍然统一过一遍 DOMPurify：
 * 粘贴进来的 HTML、`javascript:` 链接都会被清掉。外链一律新窗口打开。</p>
 *
 * <p>代码块交给 highlight.js 上色，并按 Typora 的样子加一条语言栏：
 * 预览里可以直接切换语言，切换后由笔记页把源码围栏改掉。</p>
 */

const LANGUAGES: Record<string, typeof java> = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  dockerfile,
  go,
  java,
  javascript,
  json,
  kotlin,
  markdown,
  php,
  python,
  ruby,
  rust,
  sql,
  swift,
  typescript,
  xml,
  yaml,
}

Object.entries(LANGUAGES).forEach(([name, language]) => {
  hljs.registerLanguage(name, language)
})
hljs.registerAliases(['html', 'htm', 'svg'], { languageName: 'xml' })

/** 渲染时每遇到一个代码块就递增，作为预览里切换语言的定位序号。 */
let fenceIndex = 0

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char)
}

function highlight(code: string, language: string): string {
  if (!language || !hljs.getLanguage(language)) return escapeHtml(code)
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value
  } catch {
    return escapeHtml(code)
  }
}

function languageOptions(current: string): string {
  return CODE_LANGUAGES.map((item) => {
    const selected = item.value === current ? ' selected' : ''
    return `<option value="${item.value}"${selected}>${item.label}</option>`
  }).join('')
}

const notesMarked = new Marked({ gfm: true, breaks: true })

notesMarked.use({
  renderer: {
    code({ text, lang }) {
      const language = normalizeLanguage((lang ?? '').split(/\s+/)[0] ?? '')
      const index = fenceIndex
      fenceIndex += 1
      const className = language ? ` class="hljs language-${language}"` : ' class="hljs"'
      return [
        `<div class="md-code" data-fence="${index}">`,
        '<div class="md-code-bar">',
        `<select class="md-code-lang" data-fence="${index}" aria-label="代码语言">${languageOptions(language)}</select>`,
        '<button type="button" class="md-code-copy" data-copy>复制</button>',
        '</div>',
        `<pre><code${className}>${highlight(text, language)}</code></pre>`,
        '</div>\n',
      ].join('')
    },
  },
})

let hooksInstalled = false

function installHooks() {
  if (hooksInstalled) return
  hooksInstalled = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

/** 把 Markdown 原文渲染成可直接 v-html 的安全 HTML。 */
export function renderMarkdown(source: string): string {
  if (!source) return ''
  installHooks()
  fenceIndex = 0
  const html = notesMarked.parse(source, { async: false })
  return DOMPurify.sanitize(html)
}
