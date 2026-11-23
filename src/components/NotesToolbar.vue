<script setup lang="ts">
/**
 * 笔记的 Markdown 格式工具栏。
 *
 * <p>按 Typora 的习惯排布：左侧「正文」下拉切换标题级别，中间是文字格式、
 * 列表、引用、代码、表格、链接等按钮，最右侧「大纲」打开帮助面板。
 * 组件只发出命令，正文的改动由 {@link applyTypingKey} / markdownEdit 完成。</p>
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, ChevronDown, ListTree } from 'lucide-vue-next'
import { CODE_LANGUAGES, languageLabel } from '../utils/markdownCode'
import type { LineContext } from '../utils/markdownBlock'
import type { NotesCommand } from '../types/notes'

const props = withDefaults(defineProps<{
  /** 当前光标所在行的标题级别，0 表示正文 */
  heading: number
  /** 光标所在行的上下文，用于按钮高亮与代码语言判断 */
  context: LineContext
  disabled?: boolean
}>(), { disabled: false })

const emit = defineEmits<{
  (e: 'command', command: NotesCommand): void
  (e: 'outline'): void
}>()

type Menu = 'heading' | 'code' | null
const menu = ref<Menu>(null)
const root = ref<HTMLElement | null>(null)

const headingLabel = computed(() => (props.heading > 0 ? `标题 ${props.heading}` : '正文'))

const headingLevels = [0, 1, 2, 3, 4, 5, 6] as const

const inCodeBlock = computed(() => props.context.fenceLanguage !== null)

const inlineActions: Array<{
  label: string
  hint: string
  mark: 'bold' | 'italic' | 'strike' | 'code'
}> = [
  { label: '粗体', hint: 'Ctrl + B', mark: 'bold' },
  { label: '斜体', hint: 'Ctrl + I', mark: 'italic' },
  { label: '删除线', hint: '删除线 ~~文字~~', mark: 'strike' },
  { label: '行内代码', hint: '行内代码 `文字`', mark: 'code' },
]

function toggleMenu(name: Exclude<Menu, null>) {
  menu.value = menu.value === name ? null : name
}

function applyInline(mark: 'bold' | 'italic' | 'strike' | 'code') {
  menu.value = null
  emit('command', { kind: 'wrap', mark })
}

function chooseHeading(level: 0 | 1 | 2 | 3 | 4 | 5 | 6) {
  menu.value = null
  emit('command', { kind: 'heading', level })
}

function chooseLanguage(language: string) {
  menu.value = null
  emit('command', inCodeBlock.value
    ? { kind: 'fenceLanguage', language }
    : { kind: 'codeBlock', language })
}

function applyPrefix(prefix: 'bullet' | 'ordered' | 'task' | 'quote') {
  menu.value = null
  emit('command', { kind: 'prefix', prefix })
}

function applyTable() {
  menu.value = null
  emit('command', { kind: 'table' })
}

function insertLink() {
  menu.value = null
  emit('command', { kind: 'link' })
}

function insertImage() {
  menu.value = null
  emit('command', { kind: 'image' })
}

function insertRule() {
  menu.value = null
  emit('command', { kind: 'rule' })
}

function onDocumentPointer(event: PointerEvent) {
  if (!menu.value) return
  const target = event.target
  if (target instanceof Node && root.value?.contains(target)) return
  menu.value = null
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') menu.value = null
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointer)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointer)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="root" class="notes-toolbar" role="toolbar" aria-label="Markdown 格式">
    <div class="tb-group tb-heading">
      <button
        type="button"
        class="tb-btn tb-heading-btn"
        :class="{ open: menu === 'heading' }"
        :disabled="disabled"
        aria-haspopup="menu"
        :aria-expanded="menu === 'heading'"
        title="段落样式（正文 / 标题 1-6）"
        @click="toggleMenu('heading')"
      >
        <span>{{ headingLabel }}</span>
        <ChevronDown :size="13" :stroke-width="2.2" />
      </button>

      <div v-if="menu === 'heading'" class="tb-menu" role="menu" aria-label="段落样式">
        <button
          v-for="item in headingLevels"
          :key="item"
          type="button"
          class="tb-menu-item"
          :class="{ on: item === heading }"
          role="menuitemradio"
          :aria-checked="item === heading"
          @click="chooseHeading(item)"
        >
          <span class="tb-menu-text" :class="`h${item}`">{{ item === 0 ? '正文' : `标题 ${item}` }}</span>
          <Check v-if="item === heading" :size="13" />
        </button>
      </div>
    </div>

    <div class="tb-cluster">
      <span class="tb-divider" aria-hidden="true" />

      <button
        v-for="action in inlineActions"
        :key="action.mark"
        type="button"
        class="tb-btn"
        :disabled="disabled"
        :title="action.hint"
        @click="applyInline(action.mark)"
      >
        {{ action.label }}
      </button>
    </div>

    <div class="tb-cluster">
      <span class="tb-divider" aria-hidden="true" />

      <button
        type="button"
        class="tb-btn"
        :class="{ on: context.bullet }"
        :disabled="disabled"
        title="无序列表"
        @click="applyPrefix('bullet')"
      >
        无序列表
      </button>
      <button
        type="button"
        class="tb-btn"
        :class="{ on: context.ordered }"
        :disabled="disabled"
        title="有序列表"
        @click="applyPrefix('ordered')"
      >
        有序列表
      </button>
      <button
        type="button"
        class="tb-btn"
        :class="{ on: context.task }"
        :disabled="disabled"
        title="待办事项，回车自动续写"
        @click="applyPrefix('task')"
      >
        待办
      </button>
      <button
        type="button"
        class="tb-btn"
        :class="{ on: context.quote }"
        :disabled="disabled"
        title="引用"
        @click="applyPrefix('quote')"
      >
        引用
      </button>
    </div>

    <div class="tb-cluster">
      <span class="tb-divider" aria-hidden="true" />

      <div class="tb-group">
        <button
          type="button"
          class="tb-btn tb-code-btn"
          :class="{ open: menu === 'code', on: inCodeBlock }"
          :disabled="disabled"
          aria-haspopup="menu"
          :aria-expanded="menu === 'code'"
          :title="inCodeBlock ? '切换当前代码块语言' : '插入代码块并选择语言'"
          @click="toggleMenu('code')"
        >
          <span>代码块</span>
          <ChevronDown :size="13" :stroke-width="2.2" />
        </button>

        <div v-if="menu === 'code'" class="tb-menu tb-lang-menu" role="menu" aria-label="代码语言">
          <p class="tb-menu-title">{{ inCodeBlock ? '切换当前代码块语言' : '插入代码块' }}</p>
          <div class="tb-lang-grid">
            <button
              v-for="language in CODE_LANGUAGES"
              :key="language.value"
              type="button"
              class="tb-menu-item"
              :class="{ on: inCodeBlock && context.fenceLanguage === language.value }"
              role="menuitemradio"
              :aria-checked="inCodeBlock && context.fenceLanguage === language.value"
              @click="chooseLanguage(language.value)"
            >
              <span class="tb-menu-text">{{ language.label }}</span>
              <Check v-if="inCodeBlock && context.fenceLanguage === language.value" :size="13" />
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="tb-btn"
        :disabled="disabled"
        title="插入表格"
        @click="applyTable"
      >
        表格
      </button>
      <button
        type="button"
        class="tb-btn"
        :disabled="disabled"
        title="插入链接 Ctrl + K"
        @click="insertLink"
      >
        链接
      </button>
      <button
        type="button"
        class="tb-btn"
        :disabled="disabled"
        title="插入图片"
        @click="insertImage"
      >
        图片
      </button>
      <button
        type="button"
        class="tb-btn"
        :disabled="disabled"
        title="插入分割线"
        @click="insertRule"
      >
        分割线
      </button>
    </div>

    <span class="tb-spacer" />

    <button
      type="button"
      class="tb-btn tb-outline"
      :disabled="disabled"
      :title="inCodeBlock ? `当前代码块：${languageLabel(context.fenceLanguage)}` : '查看标题大纲'"
      @click="emit('outline')"
    >
      <ListTree :size="14" :stroke-width="1.9" />
      大纲
    </button>
  </div>
</template>

<style scoped>
.notes-toolbar {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
}

.tb-group {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

/* 一组按钮整体换行，避免把「表格 链接 图片」拆到两行 */
.tb-cluster {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.tb-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 9px;
  border-radius: var(--r-xs);
  font-size: 12px;
  font-weight: 520;
  color: var(--ink-2);
  white-space: nowrap;
  transition: background var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out);
}

.tb-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--ink);
}

.tb-btn.on,
.tb-btn.open {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.tb-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tb-heading-btn {
  min-width: 74px;
  font-weight: 600;
}

.tb-divider {
  flex-shrink: 0;
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--line);
}

.tb-spacer {
  flex: 1;
  min-width: 8px;
}

.tb-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 9;
  min-width: 132px;
  padding: 5px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.tb-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 30px;
  padding: 3px 8px;
  border-radius: var(--r-xs);
  font-size: 12.5px;
  color: var(--ink-2);
  text-align: left;
}

.tb-menu-item:hover {
  background: var(--surface-hover);
}

.tb-menu-item.on {
  color: var(--accent-ink);
  background: var(--accent-soft);
}

.tb-menu-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tb-menu-text.h1 { font-size: 16px; font-weight: 680; }
.tb-menu-text.h2 { font-size: 15px; font-weight: 660; }
.tb-menu-text.h3 { font-size: 14px; font-weight: 640; }

.tb-lang-menu {
  width: 300px;
  padding: 7px;
}

.tb-menu-title {
  padding: 2px 6px 7px;
  font-size: 11px;
  color: var(--ink-4);
}

.tb-lang-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  max-height: 264px;
  overflow-y: auto;
}

@media (max-width: 768px) {
  .notes-toolbar {
    padding: 5px 8px;
  }

  .tb-btn {
    min-height: 34px;
    padding: 0 8px;
  }

  .tb-lang-menu {
    width: min(78vw, 300px);
  }
}
</style>
