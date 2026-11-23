<script setup lang="ts">
/**
 * 笔记的实时预览面板。
 *
 * <p>渲染好的 HTML 交给 v-html，这里只做两件交互：
 * 代码块语言下拉（改源码围栏）和「复制」按钮（复制代码文本）。
 * 与编辑区的分屏尺寸由 NotesView 控制，本组件只管内容。</p>
 */
import { ref } from 'vue'

withDefaults(defineProps<{
  /** renderMarkdown 的输出 */
  html: string
  /** 正文为空时的提示 */
  emptyText?: string
}>(), { emptyText: '在左侧输入 Markdown，右侧实时预览。' })

const emit = defineEmits<{
  (e: 'language', fence: number, language: string): void
  (e: 'copy', code: string): void
}>()

const root = ref<HTMLElement | null>(null)

function onCopy(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return
  const button = target.closest<HTMLElement>('.md-code-copy')
  if (!button) return
  const code = button.closest('.md-code')?.querySelector('pre code')?.textContent ?? ''
  emit('copy', code)
}

function onLanguage(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLSelectElement) || !target.classList.contains('md-code-lang')) return
  const fence = Number(target.dataset.fence)
  if (!Number.isInteger(fence)) return
  emit('language', fence, target.value)
}
</script>

<template>
  <div ref="root" class="md-pane">
    <!-- eslint-disable vue/no-v-html -->
    <div
      v-if="html"
      class="md-body"
      @click="onCopy"
      @change="onLanguage"
      v-html="html"
    />
    <p v-else class="md-empty">{{ emptyText }}</p>
    <!-- eslint-enable vue/no-v-html -->
  </div>
</template>

<style scoped>
.md-pane {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 22px var(--view-gutter) 40px;
  background: color-mix(in srgb, var(--ink) 2.5%, var(--surface));
}

.md-body {
  font-size: 15px;
  line-height: 1.85;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.md-empty {
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-4);
}

/* ---------- 渲染后的 Markdown ---------- */
.md-body :deep(h1),
.md-body :deep(h2),
.md-body :deep(h3),
.md-body :deep(h4) {
  margin: 1.4em 0 0.6em;
  font-weight: 680;
  line-height: 1.35;
  letter-spacing: -0.3px;
}

.md-body :deep(h1) { font-size: 25px; }
.md-body :deep(h2) { font-size: 21px; }
.md-body :deep(h3) { font-size: 17.5px; }
.md-body :deep(h4) { font-size: 15.5px; }

.md-body :deep(h1:first-child),
.md-body :deep(h2:first-child),
.md-body :deep(h3:first-child),
.md-body :deep(p:first-child) {
  margin-top: 0;
}

.md-body :deep(p) {
  margin: 0 0 0.9em;
}

.md-body :deep(ul),
.md-body :deep(ol) {
  margin: 0 0 0.9em;
  padding-left: 1.5em;
}

.md-body :deep(li) {
  margin: 0.25em 0;
}

.md-body :deep(blockquote) {
  margin: 0 0 0.9em;
  padding: 2px 0 2px 13px;
  border-left: 3px solid var(--line-strong);
  color: var(--ink-2);
}

.md-body :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.md-body :deep(code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--surface-3);
  font-family: var(--mono);
  font-size: 0.88em;
}

.md-body :deep(hr) {
  margin: 1.4em 0;
  border: 0;
  border-top: 1px solid var(--line);
}

.md-body :deep(table) {
  width: 100%;
  margin: 0 0 1em;
  border-collapse: collapse;
  font-size: 13.5px;
}

.md-body :deep(th),
.md-body :deep(td) {
  padding: 6px 10px;
  border: 1px solid var(--line);
  text-align: left;
}

.md-body :deep(th) {
  background: var(--surface-2);
  font-weight: 620;
}

.md-body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: var(--r-sm);
}

.md-body :deep(input[type="checkbox"]) {
  margin-right: 5px;
}

/* ---------- 代码块：语言栏 + 高亮 ---------- */
.md-body :deep(.md-code) {
  margin: 0 0 1em;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface-2);
  overflow: hidden;
}

.md-body :deep(.md-code-bar) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px 4px 6px;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--ink) 3%, var(--surface-2));
}

.md-body :deep(.md-code-lang) {
  max-width: 60%;
  height: 24px;
  padding: 0 22px 0 7px;
  border: 1px solid transparent;
  border-radius: var(--r-xs);
  background-color: transparent;
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--ink-3);
  cursor: pointer;
  color-scheme: inherit;
}

.md-body :deep(.md-code-lang:hover),
.md-body :deep(.md-code-lang:focus-visible) {
  border-color: var(--line-strong);
  background-color: var(--surface);
  color: var(--ink);
}

.md-body :deep(.md-code-copy) {
  flex-shrink: 0;
  height: 24px;
  padding: 0 8px;
  border-radius: var(--r-xs);
  font-size: 11px;
  color: var(--ink-4);
  opacity: 0;
  transition: opacity var(--dur-1) var(--ease-out), background var(--dur-1) var(--ease-out);
}

.md-body :deep(.md-code:hover .md-code-copy),
.md-body :deep(.md-code-copy:focus-visible) {
  opacity: 1;
}

.md-body :deep(.md-code-copy:hover) {
  background: var(--surface-hover);
  color: var(--ink-2);
}

.md-body :deep(.md-code pre) {
  margin: 0;
  padding: 12px 14px;
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow-x: auto;
}

.md-body :deep(.md-code pre code) {
  display: block;
  padding: 0;
  background: transparent;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--ink-2);
}

/* highlight.js 的 token 配色，跟随主题令牌 */
.md-body :deep(.hljs-keyword),
.md-body :deep(.hljs-selector-tag),
.md-body :deep(.hljs-built_in),
.md-body :deep(.hljs-name) {
  color: var(--code-keyword);
}

.md-body :deep(.hljs-string),
.md-body :deep(.hljs-regexp),
.md-body :deep(.hljs-addition),
.md-body :deep(.hljs-symbol),
.md-body :deep(.hljs-bullet) {
  color: var(--code-string);
}

.md-body :deep(.hljs-number),
.md-body :deep(.hljs-literal) {
  color: var(--code-number);
}

.md-body :deep(.hljs-comment),
.md-body :deep(.hljs-quote),
.md-body :deep(.hljs-meta) {
  color: var(--code-comment);
  font-style: italic;
}

.md-body :deep(.hljs-title),
.md-body :deep(.hljs-section),
.md-body :deep(.hljs-function) {
  color: var(--code-function);
}

.md-body :deep(.hljs-type),
.md-body :deep(.hljs-class),
.md-body :deep(.hljs-title.class_) {
  color: var(--code-type);
}

.md-body :deep(.hljs-attr),
.md-body :deep(.hljs-attribute),
.md-body :deep(.hljs-variable),
.md-body :deep(.hljs-template-variable),
.md-body :deep(.hljs-params) {
  color: var(--code-attr);
}

.md-body :deep(.hljs-tag),
.md-body :deep(.hljs-selector-id),
.md-body :deep(.hljs-selector-class),
.md-body :deep(.hljs-deletion) {
  color: var(--code-tag);
}

.md-body :deep(.hljs-emphasis) {
  font-style: italic;
}

.md-body :deep(.hljs-strong) {
  font-weight: 680;
}
</style>
