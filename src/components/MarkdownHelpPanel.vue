<script setup lang="ts">
/**
 * 笔记的 Markdown 帮助面板。
 *
 * <p>书本图标打开的「大面板」，分「语法 / 大纲 / 快捷键」三页：
 * 语法页按分组展示全部常用写法，点一行就插入；大纲页列出当前笔记的标题，
 * 点击跳回正文；快捷键页汇总编辑器支持的键位。</p>
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { BookOpen, Clock, ListTree, MousePointerClick, X } from 'lucide-vue-next'
import { MARKDOWN_GROUPS, type MarkdownSnippet } from '../utils/markdownSnippet'
import { outlineOf } from '../utils/markdownOutline'
import type { NotesHelpTab } from '../types/notes'

const props = withDefaults(defineProps<{
  /** 当前正文，用于生成大纲 */
  content: string
  /** 打开时停在那一页，默认语法 */
  initialTab?: NotesHelpTab
}>(), { initialTab: 'syntax' })

const emit = defineEmits<{
  (e: 'pick', snippet: MarkdownSnippet): void
  (e: 'jump', line: number): void
  (e: 'close'): void
}>()

const tabs: Array<{ id: NotesHelpTab; label: string }> = [
  { id: 'syntax', label: '语法' },
  { id: 'outline', label: '大纲' },
  { id: 'shortcuts', label: '快捷键' },
]

const tab = ref<NotesHelpTab>(props.initialTab)
const outline = computed(() => outlineOf(props.content))

const shortcuts: Array<{ keys: string; label: string }> = [
  { keys: 'Ctrl / ⌘ + B', label: '加粗选中文字' },
  { keys: 'Ctrl / ⌘ + I', label: '斜体' },
  { keys: 'Ctrl / ⌘ + K', label: '插入链接' },
  { keys: 'Ctrl / ⌘ + S', label: '保存笔记' },
  { keys: 'Enter', label: '列表 / 待办 / 引用自动续写' },
  { keys: 'Tab', label: '整段缩进两个空格' },
  { keys: 'Shift + Tab', label: '取消缩进' },
  { keys: 'Backspace', label: '删除空的一对括号' },
]

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="md-help" role="dialog" aria-label="Markdown 帮助">
    <header class="help-head">
      <span class="help-title">
        <BookOpen :size="15" :stroke-width="2" />
        Markdown 帮助
      </span>
      <button class="icon-btn" aria-label="关闭帮助面板" @click="emit('close')">
        <X :size="15" />
      </button>
    </header>

    <nav class="help-tabs" role="tablist" aria-label="帮助分类">
      <button
        v-for="item in tabs"
        :key="item.id"
        type="button"
        class="help-tab"
        :class="{ on: tab === item.id }"
        role="tab"
        :aria-selected="tab === item.id"
        @click="tab = item.id"
      >
        <ListTree v-if="item.id === 'outline'" :size="13" :stroke-width="1.9" />
        <Clock v-else-if="item.id === 'shortcuts'" :size="13" :stroke-width="1.9" />
        {{ item.label }}
        <span v-if="item.id === 'outline' && outline.length" class="help-count">{{ outline.length }}</span>
      </button>
    </nav>

    <div class="help-body">
      <template v-if="tab === 'syntax'">
        <section v-for="group in MARKDOWN_GROUPS" :key="group.title" class="help-group">
          <h3>{{ group.title }}</h3>
          <button
            v-for="item in group.items"
            :key="item.label"
            type="button"
            class="help-row"
            @click="emit('pick', item)"
          >
            <code class="help-syntax">{{ item.syntax }}</code>
            <span class="help-meta">
              <span class="help-label">
                {{ item.label }}
                <kbd v-if="item.shortcut">{{ item.shortcut }}</kbd>
              </span>
              <span v-if="item.tip" class="help-tip">{{ item.tip }}</span>
            </span>
            <MousePointerClick :size="13" class="help-insert" aria-hidden="true" />
          </button>
        </section>
        <p class="help-foot">点击任意一行，语法会插入到光标处并选中可改写的部分。</p>
      </template>

      <template v-else-if="tab === 'outline'">
        <p v-if="!outline.length" class="help-empty">
          正文里还没有标题。用 <code># 标题</code> 或用工具栏的「正文」下拉添加，
          这里会自动生成大纲。
        </p>
        <button
          v-for="item in outline"
          :key="`${item.line}-${item.text}`"
          type="button"
          class="outline-row"
          :class="`lv${item.level}`"
          :style="{ paddingLeft: `${10 + (item.level - 1) * 14}px` }"
          @click="emit('jump', item.line)"
        >
          <span class="outline-level">H{{ item.level }}</span>
          <span class="outline-text">{{ item.text }}</span>
        </button>
      </template>

      <template v-else>
        <dl class="shortcut-list">
          <template v-for="item in shortcuts" :key="item.keys">
            <dt><kbd>{{ item.keys }}</kbd></dt>
            <dd>{{ item.label }}</dd>
          </template>
        </dl>
        <p class="help-foot">
          括号、引号会自动配对：输入 <code>(</code> 得到 <code>()</code>，
          再输入 <code>)</code> 会直接跳过已有的右括号。
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.md-help {
  position: absolute;
  top: 58px;
  right: 12px;
  z-index: 8;
  width: min(560px, calc(100% - 24px));
  max-height: min(74vh, 520px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-md);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.help-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 10px 10px 14px;
  border-bottom: 1px solid var(--line);
}

.help-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 640;
  color: var(--ink);
}

.help-title svg {
  color: var(--accent);
}

.help-tabs {
  flex-shrink: 0;
  display: flex;
  gap: 2px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
}

.help-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: var(--r-xs);
  font-size: 12px;
  color: var(--ink-3);
}

.help-tab:hover {
  background: var(--surface-hover);
  color: var(--ink);
}

.help-tab.on {
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-weight: 600;
}

.help-count {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--r-full);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}

.help-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px 8px 10px;
}

.help-group {
  padding-top: 6px;
}

.help-group h3 {
  padding: 4px 8px 5px;
  font-size: 11px;
  font-weight: 640;
  letter-spacing: 0.4px;
  color: var(--ink-4);
}

.help-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 7px 9px;
  border-radius: var(--r-sm);
  text-align: left;
}

.help-row:hover {
  background: var(--surface-hover);
}

.help-syntax {
  flex-shrink: 0;
  width: 148px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: pre;
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--ink);
}

.help-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.help-label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  color: var(--ink-2);
}

.help-label kbd,
.shortcut-list kbd {
  padding: 1px 5px;
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  background: var(--surface-2);
  font-family: var(--mono);
  font-size: 10px;
  color: var(--ink-3);
  white-space: nowrap;
}

.help-tip {
  overflow: hidden;
  font-size: 11px;
  color: var(--ink-4);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.help-insert {
  flex-shrink: 0;
  color: var(--ink-4);
  opacity: 0;
  transition: opacity var(--dur-1) var(--ease-out);
}

.help-row:hover .help-insert {
  opacity: 1;
}

.help-foot {
  margin: 8px 8px 2px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
  font-size: 11px;
  line-height: 1.7;
  color: var(--ink-4);
}

.help-foot code,
.help-empty code {
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--surface-3);
  font-family: var(--mono);
  font-size: 10.5px;
}

.help-empty {
  padding: 26px 16px;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--ink-3);
  text-align: center;
}

.outline-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 32px;
  padding: 4px 10px;
  border-radius: var(--r-xs);
  text-align: left;
}

.outline-row:hover {
  background: var(--surface-hover);
}

.outline-level {
  flex-shrink: 0;
  width: 20px;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--ink-4);
}

.outline-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  color: var(--ink-2);
}

.outline-row.lv1 .outline-text { font-size: 14px; font-weight: 640; color: var(--ink); }
.outline-row.lv2 .outline-text { font-weight: 600; color: var(--ink); }
.outline-row.lv3 .outline-text { font-weight: 560; }
.outline-row.lv4 .outline-text,
.outline-row.lv5 .outline-text,
.outline-row.lv6 .outline-text { color: var(--ink-3); }

.shortcut-list {
  display: grid;
  grid-template-columns: minmax(0, 128px) minmax(0, 1fr);
  gap: 2px 12px;
  align-items: center;
  padding: 8px;
  margin: 0;
}

.shortcut-list dt {
  text-align: right;
}

.shortcut-list dd {
  margin: 0;
  padding: 5px 0;
  font-size: 12.5px;
  color: var(--ink-2);
}

@media (max-width: 768px) {
  .md-help {
    top: 54px;
    right: 8px;
    width: calc(100% - 16px);
    max-height: min(70vh, 480px);
  }

  .help-syntax {
    width: 96px;
  }

  .help-tip {
    display: none;
  }

  .help-row {
    min-height: 42px;
  }
}
</style>
