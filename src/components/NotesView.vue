<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ArrowLeft, Plus, Search, X, Loader2, RefreshCw, NotebookPen, Save, Trash2, BookOpen,
} from 'lucide-vue-next'
import { notesApi, type Note, type NoteSummary } from '../api/notes'
import { useToast } from '../composables/useToast'
import { useNoteLayout } from '../composables/useNoteLayout'
import { messageOf } from '../utils/error'
import { renderMarkdown } from '../utils/markdown'
import { insertMarkdownSnippet, type MarkdownSnippet } from '../utils/markdownSnippet'
import { defaultNoteTitle, groupNotesByDay } from '../utils/noteGroups'
import { scanFences, updateFenceLanguage } from '../utils/markdownCode'
import { lineContextAt, type LineContext } from '../utils/markdownBlock'
import {
  insertBlock,
  insertCodeBlock,
  insertImage,
  insertLink,
  insertTable,
  setHeading,
  toggleLinePrefix,
  toggleWrap,
  type EditResult,
} from '../utils/markdownEdit'
import { applyTypingKey } from '../utils/markdownTyping'
import type { NotesCommand, NotesHelpTab } from '../types/notes'
import PaneSplitter from './PaneSplitter.vue'
import NotesToolbar from './NotesToolbar.vue'
import MarkdownHelpPanel from './MarkdownHelpPanel.vue'
import NotePreview from './NotePreview.vue'

const props = withDefaults(defineProps<{ mobile?: boolean }>(), { mobile: false })
const emit = defineEmits<{ (e: 'back'): void }>()

const items = ref<NoteSummary[]>([])
const loading = ref(true)
const error = ref('')
const keyword = ref('')
const activeId = ref<string | null>(null)
const note = ref<Note | null>(null)
const title = ref('')
const content = ref('')
const loadingNote = ref(false)
const saving = ref(false)
const deleting = ref(false)
const mode = ref<'edit' | 'preview'>('edit')
/** Markdown 帮助面板：书本图标打开，默认停在语法页。 */
const helpOpen = ref(false)
const helpTab = ref<NotesHelpTab>('syntax')
/** 光标所在行的上下文：工具栏据此显示标题级别、列表与代码语言。 */
const blockContext = ref<LineContext>(lineContextAt('', 0))
/** 是否有正在编写的笔记（新建或打开），用来决定编辑器还是占位图。 */
const composing = ref(false)
/** 移动端：列表与编辑器之间的切换。 */
const editing = ref(false)
const editor = ref<HTMLTextAreaElement | null>(null)
const { message: notice, show: flash } = useToast()

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((item) =>
    `${item.title}\n${item.excerpt}`.toLowerCase().includes(q),
  )
})
/** 按最后修改日期分组：每天一组，列表里用日期分隔线隔开。 */
const grouped = computed(() => groupNotesByDay(filtered.value))
const dirty = computed(() => {
  if (!note.value) return composing.value && (title.value.trim().length > 0 || content.value.trim().length > 0)
  return title.value !== note.value.title || content.value !== note.value.content
})
const previewHtml = computed(() => renderMarkdown(content.value))
const displayTitle = computed(() => title.value.trim() || note.value?.title || '未命名笔记')

function fullTime(value: string | null | undefined) {
  if (!value) return ''
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await notesApi.list()
    items.value = Array.isArray(data) ? data : []
  } catch (e) {
    error.value = messageOf(e, '加载笔记失败')
  } finally {
    loading.value = false
  }
}

function resetEditor() {
  activeId.value = null
  note.value = null
  title.value = ''
  content.value = ''
  mode.value = 'edit'
  composing.value = false
  blockContext.value = lineContextAt('', 0)
}

/** 有未保存内容时切换笔记要确认，避免一键丢掉草稿。 */
function confirmDiscard() {
  if (!dirty.value) return true
  return window.confirm('当前笔记还有未保存的修改，确定放弃吗？')
}

async function open(item: NoteSummary) {
  if (!confirmDiscard()) return
  activeId.value = String(item.id)
  loadingNote.value = true
  mode.value = 'edit'
  try {
    const data = await notesApi.get(item.id)
    note.value = data
    title.value = data.title
    content.value = data.content
    composing.value = true
    editing.value = true
  } catch (e) {
    error.value = messageOf(e, '打开笔记失败')
    resetEditor()
    editing.value = false
  } finally {
    loadingNote.value = false
  }
}

async function startNew() {
  if (!confirmDiscard()) return
  resetEditor()
  composing.value = true
  editing.value = true
  title.value = defaultNoteTitle()
  await nextTick()
  editor.value?.focus()
  syncContext()
}

/** 移动端从编辑器返回列表：草稿保留在内存里，不主动丢弃。 */
function backToList() {
  editing.value = false
}

async function save() {
  if (saving.value) return
  const head = title.value.trim() || defaultNoteTitle()
  const body = content.value
  if (!head && !body.trim()) {
    flash('写点内容再保存吧')
    return
  }
  saving.value = true
  error.value = ''
  const creating = !activeId.value
  try {
    const saved = activeId.value
      ? await notesApi.update(activeId.value, { title: head, content: body })
      : await notesApi.create({ title: head, content: body })
    activeId.value = String(saved.id)
    note.value = saved
    title.value = saved.title
    content.value = saved.content
    composing.value = true
    editing.value = true
    await load()
    flash(creating ? '笔记已保存' : '已保存')
  } catch (e) {
    error.value = messageOf(e, '保存笔记失败')
  } finally {
    saving.value = false
  }
}

async function remove() {
  const id = activeId.value
  if (!id || deleting.value) return
  if (!window.confirm(`删除「${displayTitle.value}」？删除后无法恢复。`)) return
  deleting.value = true
  error.value = ''
  try {
    await notesApi.remove(id)
    items.value = items.value.filter((item) => String(item.id) !== id)
    resetEditor()
    editing.value = false
    flash('笔记已删除')
  } catch (e) {
    error.value = messageOf(e, '删除笔记失败')
  } finally {
    deleting.value = false
  }
}

/* ---------- 编辑器动作 ---------- */

/** 当前选区；textarea 未挂载时退回正文末尾。 */
function currentSelection() {
  const el = editor.value
  const start = el?.selectionStart ?? content.value.length
  return { value: content.value, start, end: el?.selectionEnd ?? start }
}

/** 写回正文并恢复选区，再刷新工具栏上下文。 */
function applyEdit(result: EditResult) {
  content.value = result.value
  void nextTick(() => {
    const el = editor.value
    if (!el) return
    el.focus()
    el.setSelectionRange(result.start, result.end)
    syncContext()
  })
}

function syncContext() {
  const el = editor.value
  blockContext.value = lineContextAt(content.value, el?.selectionStart ?? 0)
}

function openHelp(tab: NotesHelpTab) {
  helpTab.value = tab
  helpOpen.value = true
}

/** 把帮助面板选中的语法插入正文，光标停在可继续输入的位置。 */
function applySnippet(snippet: MarkdownSnippet) {
  if (mode.value !== 'edit') mode.value = 'edit'
  applyEdit(insertMarkdownSnippet(currentSelection(), snippet))
  helpOpen.value = false
}

function applyWrap(mark: 'bold' | 'italic' | 'strike' | 'code') {
  const marks: Record<typeof mark, [string, string]> = {
    bold: ['**', '**'],
    italic: ['*', '*'],
    strike: ['~~', '~~'],
    code: ['`', '`'],
  }
  const [before, after] = marks[mark]
  applyEdit(toggleWrap(currentSelection(), before, after))
}

/** 光标在代码围栏里时，把语言下拉的选择写回围栏。 */
function applyFenceLanguage(language: string) {
  const fence = scanFences(content.value).find(
    (item) => item.line <= blockContext.value.lineIndex && blockContext.value.lineIndex <= item.endLine,
  )
  if (!fence) return
  const caret = editor.value?.selectionStart ?? 0
  content.value = updateFenceLanguage(content.value, fence.index, language)
  void nextTick(() => {
    const el = editor.value
    if (!el) return
    el.focus()
    el.setSelectionRange(caret, caret)
    syncContext()
  })
}

function applyCommand(command: NotesCommand) {
  if (mode.value !== 'edit' || !composing.value) return
  const selection = currentSelection()
  switch (command.kind) {
    case 'heading':
      applyEdit(setHeading(selection, command.level))
      break
    case 'wrap':
      applyWrap(command.mark)
      break
    case 'prefix':
      applyEdit(toggleLinePrefix(selection, command.prefix))
      break
    case 'codeBlock':
      applyEdit(insertCodeBlock(selection, command.language))
      break
    case 'fenceLanguage':
      applyFenceLanguage(command.language)
      break
    case 'table':
      applyEdit(insertTable(selection))
      break
    case 'link':
      applyEdit(insertLink(selection))
      break
    case 'image':
      applyEdit(insertImage(selection))
      break
    case 'rule':
      applyEdit(insertBlock(selection, '---'))
      break
  }
}

/** 编辑器的输入增强：括号配对、列表续写、缩进、Ctrl+B/I/K。 */
function onEditorKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key === 'Process') return
  const result = applyTypingKey(currentSelection(), event)
  if (!result) return
  event.preventDefault()
  applyEdit(result)
}

/** 大纲跳转：把光标移到对应行，并大致滚到可见位置。 */
function jumpToLine(line: number) {
  const offset = content.value
    .split('\n')
    .slice(0, Math.max(0, line))
    .reduce((total, item) => total + item.length + 1, 0)
  mode.value = 'edit'
  helpOpen.value = false
  void nextTick(() => {
    const el = editor.value
    if (!el) return
    el.focus()
    el.setSelectionRange(offset, offset)
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 28
    el.scrollTop = Math.max(0, line * lineHeight - el.clientHeight / 3)
    syncContext()
  })
}

/** 预览里切换代码块语言 / 复制代码。 */
function onCodeLanguage(fence: number, language: string) {
  content.value = updateFenceLanguage(content.value, fence, language)
}

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    flash('代码已复制')
  } catch {
    flash('复制失败，请手动选择文本')
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!composing.value) return
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void save()
  }
}

/* ---------- 三栏宽度拖拽：列表 | 编辑器 | 预览 ---------- */

const {
  bodyEl,
  areaEl,
  listWidth,
  split,
  bodyStyle,
  areaStyle,
  beginDrag,
  dragBy,
  endDrag,
  nudge,
  reset,
} = useNoteLayout(() => props.mobile)

onMounted(() => {
  void load()
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <section class="notes" :class="{ mobile }" aria-label="我的笔记">
    <header class="notes-head">
      <button v-if="mobile" class="icon-btn notes-back" aria-label="返回我的" @click="emit('back')">
        <ArrowLeft :size="22" />
      </button>
      <div class="notes-heading">
        <h1>我的笔记</h1>
        <p>{{ items.length }} 篇笔记 · 支持 Markdown</p>
      </div>
      <button class="icon-btn notes-refresh" :disabled="loading" aria-label="刷新笔记" @click="load">
        <Loader2 v-if="loading" :size="18" class="spin" />
        <RefreshCw v-else :size="18" :stroke-width="1.7" />
      </button>
      <button class="notes-new" @click="startNew">
        <Plus :size="16" :stroke-width="2.2" />新建笔记
      </button>
    </header>

    <p v-if="notice" class="notes-notice" role="status">{{ notice }}</p>
    <p v-if="error" class="notes-error" role="alert">{{ error }}</p>

    <div ref="bodyEl" class="notes-body" :style="bodyStyle">
      <aside v-if="!mobile || !editing" class="notes-list" aria-label="笔记列表">
        <div class="notes-search" role="search">
          <Search :size="16" aria-hidden="true" />
          <input v-model="keyword" type="search" placeholder="搜索标题或摘要" aria-label="搜索笔记" maxlength="128" />
          <button v-if="keyword" class="icon-btn" aria-label="清空搜索" @click="keyword = ''"><X :size="15" /></button>
        </div>
        <div class="notes-scroll" :aria-busy="loading">
          <div v-if="loading && !items.length" class="notes-skeleton">
            <span v-for="i in 5" :key="i" />
          </div>
          <p v-else-if="!filtered.length" class="notes-list-empty">
            {{ items.length ? '没有匹配的笔记' : '还没有笔记，点右上角新建' }}
          </p>
          <template v-for="group in grouped" :key="group.key">
            <div class="note-day" role="separator" :aria-label="group.label">{{ group.label }}</div>
            <button
              v-for="item in group.items"
              :key="String(item.id)"
              class="note-row"
              :class="{ active: String(item.id) === activeId }"
              @click="open(item)"
            >
              <span class="note-row-title">{{ item.title }}</span>
            </button>
          </template>
        </div>
      </aside>

      <!-- 列表 / 编辑器之间的拖拽分隔条 -->
      <PaneSplitter
        v-if="!mobile"
        label="拖拽调整笔记列表宽度"
        offset="calc(var(--notes-list-width, 290px) - 3px)"
        :value="listWidth ?? undefined"
        @start="beginDrag('list')"
        @offset="dragBy('list', $event)"
        @end="endDrag"
        @nudge="nudge('list', $event)"
        @reset="reset('list')"
      />

      <div v-if="!mobile || editing" class="notes-editor" :aria-busy="loadingNote">
        <template v-if="composing">
          <header class="editor-head">
            <button v-if="mobile" class="icon-btn" aria-label="返回笔记列表" @click="backToList">
              <ArrowLeft :size="20" />
            </button>
            <input v-model="title" class="editor-title" placeholder="无标题笔记" maxlength="200" aria-label="笔记标题" />
            <div class="editor-actions">
              <button
                class="icon-btn md-help-btn"
                :class="{ on: helpOpen }"
                :aria-expanded="helpOpen"
                aria-controls="md-help"
                aria-label="Markdown 帮助"
                title="Markdown 帮助与大纲"
                @click="helpOpen ? (helpOpen = false) : openHelp('syntax')"
              >
                <BookOpen :size="17" :stroke-width="1.8" />
              </button>
              <div class="mode-switch" role="group" aria-label="编辑或预览">
                <button
                  :class="{ on: mode === 'edit' }"
                  :aria-pressed="mode === 'edit'"
                  @click="mode = 'edit'"
                >
                  编辑
                </button>
                <button
                  :class="{ on: mode === 'preview' }"
                  :aria-pressed="mode === 'preview'"
                  @click="mode = 'preview'"
                >
                  预览
                </button>
              </div>
              <button class="save-btn" :disabled="saving || !dirty" @click="save">
                <Loader2 v-if="saving" :size="15" class="spin" />
                <Save v-else :size="15" />
                {{ saving ? '保存中' : '保存' }}
              </button>
              <button
                v-if="activeId"
                class="icon-btn danger"
                :disabled="deleting"
                aria-label="删除笔记"
                @click="remove"
              >
                <Loader2 v-if="deleting" :size="17" class="spin" />
                <Trash2 v-else :size="17" />
              </button>
            </div>
          </header>

          <!-- 工具栏：标题级别 / 文字格式 / 列表 / 代码 / 表格 / 链接 / 大纲 -->
          <NotesToolbar
            v-if="mode === 'edit'"
            :heading="blockContext.heading"
            :context="blockContext"
            @command="applyCommand"
            @outline="openHelp('outline')"
          />

          <Transition name="cheat">
            <MarkdownHelpPanel
              v-if="helpOpen"
              id="md-help"
              :key="helpTab"
              :content="content"
              :initial-tab="helpTab"
              @pick="applySnippet"
              @jump="jumpToLine"
              @close="helpOpen = false"
            />
          </Transition>

          <div
            ref="areaEl"
            class="editor-area"
            :class="{ 'is-split': mode === 'edit' }"
            :style="areaStyle"
          >
            <textarea
              v-if="mode === 'edit'"
              ref="editor"
              v-model="content"
              class="md-input"
              placeholder="# 小标题&#10;&#10;用 Markdown 记录想法，支持列表、引用、代码块…"
              spellcheck="false"
              aria-label="Markdown 正文"
              @keydown="onEditorKeydown"
              @input="syncContext"
              @select="syncContext"
              @click="syncContext"
            />
            <!-- 桌面端编辑时右侧实时预览；手机端切到「预览」时整页阅读。 -->
            <NotePreview
              v-if="!mobile || mode === 'preview'"
              :html="previewHtml"
              @language="onCodeLanguage"
              @copy="copyCode"
            />

            <!-- 编辑 / 预览之间的拖拽分隔条 -->
            <PaneSplitter
              v-if="!mobile && mode === 'edit'"
              label="拖拽调整编辑与预览宽度"
              offset="calc(var(--notes-split, 50%) - 3px)"
              :value="Math.round(split * 100)"
              @start="beginDrag('split')"
              @offset="dragBy('split', $event)"
              @end="endDrag"
              @nudge="nudge('split', $event)"
              @reset="reset('split')"
            />
          </div>

          <footer class="editor-foot">
            <span class="num">{{ content.length }} 字</span>
            <span v-if="dirty" class="dirty">· 有未保存的修改</span>
            <span v-else-if="note" class="saved">· 已保存 {{ fullTime(note.updatedAt) }}</span>
            <span class="foot-spacer" />
            <span>Ctrl / ⌘ + S 保存</span>
          </footer>
        </template>

        <div v-else class="notes-placeholder">
          <span class="notes-placeholder-icon"><NotebookPen :size="24" :stroke-width="1.7" /></span>
          <h2>选一篇笔记，或新建</h2>
          <p>笔记只保存在你自己的账号下，正文用 Markdown 编写。</p>
          <button class="notes-new" @click="startNew"><Plus :size="16" />新建笔记</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.notes {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--canvas);
}

.notes-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px var(--view-gutter) 13px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}

.notes-heading {
  flex: 1;
  min-width: 0;
}

.notes-heading h1 {
  font-size: var(--view-title-size);
  font-weight: 680;
  letter-spacing: -0.6px;
}

.notes-heading p {
  margin-top: 5px;
  font-size: 12px;
  color: var(--ink-3);
}

.notes-refresh {
  width: 38px;
  height: 38px;
  color: var(--ink-3);
}

.notes-new {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 13px;
  border-radius: var(--r-sm);
  background: var(--primary);
  color: var(--primary-foreground);
  font-size: 13px;
  font-weight: 580;
  white-space: nowrap;
}

.notes-new:hover {
  filter: brightness(1.06);
}

.notes-notice,
.notes-error {
  flex-shrink: 0;
  margin: 10px var(--view-gutter) 0;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  font-size: 12.5px;
}

.notes-notice {
  color: var(--accent-ink);
  background: var(--accent-soft);
}

.notes-error {
  color: var(--danger);
  background: var(--danger-soft);
}

/* 两条可拖拽分隔条由 PaneSplitter.vue 提供，这里只声明分栏尺寸变量 */
.notes-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: var(--notes-list-width, minmax(220px, 290px)) minmax(0, 1fr);
}

.notes-list {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--line);
  background: var(--surface);
}

.notes-search {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 12px 8px;
  padding: 0 12px;
  min-height: 40px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-md);
  background: var(--surface);
  box-shadow: var(--shadow-xs);
  color: var(--ink-3);
  transition: border-color var(--dur-2) var(--ease-out),
    box-shadow var(--dur-2) var(--ease-out);
}

.notes-search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
}

.notes-search input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
}

.notes-search input:focus-visible {
  outline: none;
}

.notes-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 8px 16px;
}

.notes-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px;
}

.notes-skeleton span {
  height: 54px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  animation: skeleton-pulse 1.6s ease-in-out infinite;
}

.notes-list-empty {
  padding: 32px 14px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--ink-3);
  text-align: center;
}

/* 每天一组：分隔线 + 日期，两侧各一条细线 */
.note-day {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 9px 6px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2px;
  color: var(--ink-4);
  user-select: none;
}

.note-day::before,
.note-day::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--line);
}

.note-day:first-child {
  padding-top: 4px;
}

.note-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 11px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  text-align: left;
  transition: background var(--dur-1) var(--ease-out), border-color var(--dur-1) var(--ease-out);
}

.note-row:hover {
  background: var(--surface-hover);
}

.note-row.active {
  border-color: color-mix(in srgb, var(--accent) 32%, transparent);
  background: var(--accent-soft);
}

.note-row-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13.5px;
  font-weight: 620;
  color: var(--ink);
}

.notes-editor {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--surface);
}

.editor-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
}

.editor-title {
  flex: 1;
  min-width: 0;
  font-size: 19px;
  font-weight: 660;
  letter-spacing: -0.3px;
  background: transparent;
}

.editor-title:focus-visible {
  outline: none;
}

.editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 编辑 / 预览小开关 */
.mode-switch {
  display: inline-flex;
  align-items: center;
  padding: 3px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  border: 1px solid var(--line);
}

.mode-switch button {
  min-width: 42px;
  height: 26px;
  padding: 0 9px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 560;
  color: var(--ink-3);
  transition: background var(--dur-1) var(--ease-out),
    color var(--dur-1) var(--ease-out), box-shadow var(--dur-1) var(--ease-out);
}

.mode-switch button:hover {
  color: var(--ink);
}

.mode-switch button.on {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-xs);
}

.save-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 34px;
  padding: 0 10px;
  border-radius: var(--r-sm);
  font-size: 12.5px;
  color: var(--ink-2);
  border: 1px solid var(--line);
}

.save-btn {
  border-color: transparent;
  background: var(--primary);
  color: var(--primary-foreground);
  font-weight: 580;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.icon-btn.danger:hover {
  color: var(--danger);
  background: var(--danger-soft);
}

/* Markdown 速查面板的打开/关闭动效（面板本体在 MarkdownCheatSheet.vue） */
.cheat-enter-active,
.cheat-leave-active {
  transition: opacity var(--dur-1) var(--ease-out), transform var(--dur-1) var(--ease-out);
}

.cheat-enter-from,
.cheat-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.99);
}

.editor-area {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  overflow: hidden;
}

/* 桌面端编辑时左右分屏：左侧写 Markdown，右侧实时预览。 */
.editor-area.is-split {
  grid-template-columns: minmax(0, var(--notes-split, 50%)) minmax(0, 1fr);
}

.editor-area.is-split .md-input {
  border-right: 1px solid var(--line);
}

.md-input {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 22px var(--view-gutter) 30px;
  border: 0;
  background: transparent;
  font-size: 15px;
  line-height: 1.9;
  color: var(--ink);
  resize: none;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.md-input:focus-visible {
  outline: none;
}

.editor-foot {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  border-top: 1px solid var(--line);
  font-size: 11.5px;
  color: var(--ink-4);
}

.editor-foot .dirty {
  color: var(--warn);
}

.foot-spacer {
  flex: 1;
}

.notes-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 24px;
  text-align: center;
}

.notes-placeholder-icon {
  display: grid;
  place-items: center;
  width: 62px;
  height: 62px;
  margin-bottom: 6px;
  border-radius: 18px;
  background: var(--accent-soft);
  color: var(--accent);
}

.notes-placeholder h2 {
  font-size: 17px;
  font-weight: 620;
}

.notes-placeholder p {
  max-width: 320px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--ink-3);
}

.notes-placeholder .notes-new {
  margin-top: 8px;
}

.spin {
  animation: tick-spin 900ms linear infinite;
}

/* ---------- 移动端 ---------- */
@media (max-width: 768px) {
  .notes-head {
    gap: 6px;
    padding: 8px 12px 10px;
  }

  .notes-heading {
    order: 1;
  }

  .notes-heading h1 {
    font-size: 22px;
  }

  .notes-heading p {
    margin-top: 2px;
    font-size: 11px;
  }

  .notes-back {
    order: 0;
    width: 44px;
    height: 44px;
    margin-left: -6px;
  }

  .notes-refresh {
    order: 2;
    width: 44px;
    height: 44px;
  }

  .notes-new {
    order: 3;
    min-height: 40px;
    padding: 0 10px;
    font-size: 12.5px;
  }

  .notes-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .notes-list {
    border-right: 0;
  }

  .notes-search {
    margin: 10px 12px 6px;
    min-height: 44px;
  }

  .notes-search input {
    font-size: 16px;
  }

  .notes-scroll {
    padding: 2px 6px calc(env(safe-area-inset-bottom, 0px) + 16px);
  }

  .note-row {
    padding: 12px 11px;
  }

  .note-row-title {
    font-size: 15px;
  }

  .editor-head {
    gap: 6px;
    padding: 8px 12px;
  }

  .editor-head .icon-btn {
    width: 40px;
    height: 40px;
  }

  .editor-title {
    font-size: 17px;
  }

  .mode-switch {
    padding: 2px;
  }

  .mode-switch button {
    min-width: 38px;
    height: 26px;
    padding: 0 7px;
    font-size: 11.5px;
  }

  .save-btn {
    min-height: 38px;
  }

  /* 手机窄屏不分屏：编辑只显示输入框，预览只显示渲染结果。 */
  .editor-area.is-split {
    grid-template-columns: minmax(0, 1fr);
  }

  .editor-area.is-split .md-input {
    border-right: 0;
  }

  .md-input {
    padding: 16px 14px calc(env(safe-area-inset-bottom, 0px) + 28px);
    font-size: 16px;
  }

  .editor-foot {
    padding: 6px 12px;
  }
}
</style>
