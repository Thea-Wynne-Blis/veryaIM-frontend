<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Search, X, ArrowLeft, CornerDownLeft, Loader2, FileText, Image as ImageIcon, Film, Mic, MessageSquare, RotateCcw } from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import SearchHighlight from './SearchHighlight.vue'
import { api, type ConversationSearchHit, type ConversationSearchPage } from '../api/client'
import { useFilePreview } from '../composables/useFilePreview'
import { useAuthStore } from '../stores/auth'
import type { ChatMember } from '../stores/chat'
import type { Conversation } from '../types/chat'
import { humanBytes, initialsOf, toneOfPerson } from '../utils/present'
import { userAvatarSrc } from '../utils/avatar'

const props = defineProps<{ conversation: Conversation; members: ChatMember[] }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'locate', conversationId: string, messageId: string, seq: number): void
}>()
const auth = useAuthStore()
const { openFilePreview } = useFilePreview()
const dialog = ref<HTMLDialogElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const keyword = ref('')
const category = ref('ALL')
const senderId = ref('')
const date = ref('')
const rows = ref<ConversationSearchHit[]>([])
const cursor = ref<string | null>(null)
const hasMore = ref(false)
const loading = ref(true)
const error = ref('')
const composing = ref(false)
const results = ref<HTMLElement | null>(null)
let debounce: ReturnType<typeof setTimeout> | undefined
let version = 0
const tabs = [
  { key: 'ALL', label: '全部' },
  { key: 'FILE', label: '文件' },
  { key: 'MEDIA', label: '图片与视频' },
  { key: 'LINK', label: '链接' },
  { key: 'AUDIO', label: '语音' },
] as const
const filtered = computed(() => !!(keyword.value.trim() || senderId.value || date.value || category.value !== 'ALL'))

function parameters() {
  const params = new URLSearchParams({ keyword: keyword.value.trim(), category: category.value, limit: '30' })
  if (senderId.value) params.set('senderId', senderId.value)
  if (date.value) {
    const start = new Date(`${date.value}T00:00:00`)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    params.set('from', start.toISOString())
    params.set('to', end.toISOString())
  }
  return params
}

async function run(append = false) {
  clearTimeout(debounce)
  if (append && (loading.value || !hasMore.value)) return
  const request = ++version
  const params = parameters()
  if (append && cursor.value) params.set('cursor', cursor.value)
  loading.value = true
  error.value = ''
  if (!append) {
    rows.value = []
    hasMore.value = false
    cursor.value = null
    results.value?.scrollTo({ top: 0 })
  }
  try {
    const page = await api.get<ConversationSearchPage>(`/conversations/${props.conversation.id}/search?${params}`)
    if (request !== version) return
    rows.value = append ? [...rows.value, ...page.messages] : page.messages
    cursor.value = page.nextCursor
    hasMore.value = page.hasMore
  } catch (e) {
    if (request === version) error.value = e instanceof Error ? e.message : '搜索失败，请重试'
  } finally {
    if (request === version) loading.value = false
  }
}

function schedule() {
  ++version // 立刻使旧请求失效，避免 A → B → A 时结果串台。
  clearTimeout(debounce)
  rows.value = []
  hasMore.value = false
  error.value = ''
  loading.value = true
  if (!composing.value) debounce = setTimeout(() => void run(), 240)
}

watch(keyword, schedule, { flush: 'sync' })
watch([category, senderId, date, () => props.conversation.id], () => void run())

function reset() {
  keyword.value = ''
  category.value = 'ALL'
  senderId.value = ''
  date.value = ''
  input.value?.focus()
}

function icon(type: string) {
  return type === 'IMAGE' ? ImageIcon : type === 'VIDEO' ? Film : type === 'AUDIO' ? Mic : FileText
}

function timestamp(value: string) {
  return new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

function openResult(row: ConversationSearchHit) {
  if (row.fileId != null) openFilePreview({ fileId: row.fileId, name: row.fileName || '附件', contentType: row.contentType, sizeBytes: row.sizeBytes })
  else emit('locate', props.conversation.id, String(row.messageId), row.seq)
}

onMounted(() => {
  dialog.value?.showModal()
  input.value?.focus()
  void run()
})
onBeforeUnmount(() => {
  ++version
  clearTimeout(debounce)
  dialog.value?.close()
})
</script>

<template>
  <dialog ref="dialog" class="history-dialog" aria-labelledby="history-title" @cancel.prevent="emit('close')" @click.self="emit('close')">
    <div class="history-window">
      <header class="history-head">
        <div class="history-heading">
          <h2 id="history-title">“{{ conversation.name }}”的聊天记录</h2>
          <p>查找聊天内容</p>
        </div>
        <button class="icon-btn history-close" aria-label="关闭聊天记录" @click="emit('close')"><X class="desktop-close" :size="19" /><ArrowLeft class="mobile-close" :size="22" /></button>
      </header>
      <div class="history-controls">
        <label class="history-search">
          <Search :size="19" />
          <input
            ref="input"
            v-model="keyword"
            maxlength="64"
            type="search"
            placeholder="搜索聊天内容或文件名"
            aria-label="搜索聊天内容或文件名"
            @compositionstart="composing = true" @compositionend="composing = false; schedule()"
            @keydown.enter.prevent="!composing && run()" />
          <Loader2 v-if="loading" :size="17" class="spin" />
        </label>
        <div class="history-tabs" role="group" aria-label="聊天内容分类">
          <button v-for="tab in tabs" :key="tab.key" :class="{ on: category === tab.key }" :aria-pressed="category === tab.key" @click="category = tab.key">{{ tab.label }}</button>
        </div>
        <div class="history-filters">
          <label><span>发送人</span><select v-model="senderId" aria-label="按发送人筛选">
            <option value="">全部成员</option>
            <option v-for="member in members" :key="member.userId" :value="String(member.userId)">{{ String(member.userId) === String(auth.user?.userId) ? '我' : member.remark?.trim() || member.nickname }}</option>
          </select></label>
          <label><span>日期</span><input v-model="date" type="date" aria-label="按日期筛选" /></label>
          <button v-if="filtered" class="history-reset" @click="reset"><RotateCcw :size="12" />重置</button>
        </div>
      </div>
      <div ref="results" class="history-results" :aria-busy="loading">
        <div class="history-count" role="status" aria-live="polite">{{ loading && !rows.length ? '正在查找…' : `${filtered ? '找到' : '最近'} ${rows.length}${hasMore ? '+' : ''} 条记录` }}<span v-if="rows.length">按时间从新到旧排列 · 点击查看上下文</span></div>
        <article v-for="row in rows" :key="String(row.messageId)" class="history-hit">
          <button class="history-hit-main" :aria-label="row.fileId != null ? `预览 ${row.fileName}` : `定位 ${row.senderName} 的消息：${row.text}`" @click="openResult(row)">
            <AppAvatar :initials="initialsOf(row.senderName)" :tone="toneOfPerson(row.senderId, auth.user?.userId)" :src="userAvatarSrc(row.senderId)" size="md" />
            <span class="history-hit-content">
              <span class="history-hit-meta"><span>{{ row.senderName }}</span><time :datetime="row.createdAt">{{ timestamp(row.createdAt) }}</time></span>
              <span v-if="row.fileId != null" class="history-file">
                <span class="history-file-icon"><component :is="icon(row.type)" :size="25" :stroke-width="1.5" /></span>
                <span class="history-file-info"><SearchHighlight class="history-file-name" :text="row.fileName || '附件'" :keyword="keyword" /><span>{{ ({ IMAGE: '图片', VIDEO: '视频', AUDIO: '语音', FILE: '文件' } as Record<string, string>)[row.type] }} · {{ humanBytes(row.sizeBytes ?? 0) }}</span></span>
              </span>
              <SearchHighlight v-else class="history-message" :text="row.text" :keyword="keyword" />
            </span>
          </button>
          <button v-if="row.fileId != null" class="icon-btn history-download" :aria-label="`查看原消息：${row.fileName}`" @click="emit('locate', conversation.id, String(row.messageId), row.seq)"><CornerDownLeft :size="17" /></button>
        </article>
        <div v-if="!rows.length && !loading && !error" class="history-empty"><MessageSquare :size="34" :stroke-width="1.2" /><p>{{ filtered ? '没有找到相关聊天内容' : '暂无聊天记录' }}</p><span>{{ filtered ? '试试其他关键词，或调整分类、发送人与日期' : '聊天中的文字、文件和图片都会出现在这里' }}</span><button v-if="filtered" @click="reset">清除筛选</button></div>
        <div v-if="error" class="history-error" role="alert"><p>{{ error }}</p><button @click="run(rows.length > 0)">重试</button></div>
        <button v-else-if="hasMore || (loading && rows.length)" class="history-more" :disabled="loading" @click="run(true)"><Loader2 v-if="loading" :size="15" class="spin" />{{ loading ? '正在加载…' : '加载更多记录' }}</button>
        <div v-else-if="loading" class="history-empty"><Loader2 :size="24" class="spin" /><p>正在查找聊天记录</p></div>
        <p v-else-if="rows.length" class="history-end">已显示全部结果</p>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.history-dialog { width: min(760px, calc(100vw - 48px)); max-width: none; max-height: none; height: min(780px, calc(100dvh - 80px)); margin: auto; padding: 0; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--surface); color: var(--ink); box-shadow: 0 24px 80px #0003; }
.history-dialog::backdrop { background: #101b243d; backdrop-filter: blur(2px); }
.history-window { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.history-head { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 20px 24px 16px; }
.history-heading { min-width: 0; }
.history-head h2 { font-size: 16px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-head p { font-size: 11px; color: var(--ink-3); margin-top: 4px; }
.mobile-close { display: none; }
.history-controls { padding: 0 24px; border-bottom: 1px solid var(--line); }
.history-search { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid var(--line-strong); border-radius: 7px; color: var(--ink-3); background: var(--surface-2); }
.history-search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.history-search input { width: 100%; min-width: 0; border: 0; outline: none; background: none; color: var(--ink); font-size: 14px; }
.history-tabs { display: flex; gap: 24px; padding-top: 8px; overflow-x: auto; }
.history-tabs button { flex-shrink: 0; padding: 12px 0 11px; border-bottom: 2px solid transparent; background: none; font-size: 13px; color: var(--ink-3); }
.history-tabs button.on { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.history-tabs button:hover { color: var(--accent); }
.history-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 18px; padding: 12px 0; }
.history-filters label { display: flex; align-items: center; gap: 7px; color: var(--ink-3); font-size: 11px; }
.history-filters select, .history-filters input { max-width: 158px; height: 28px; padding: 2px 7px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 4px; color: var(--ink-2); font-size: 11px; }
.history-reset { display: flex; align-items: center; gap: 4px; padding: 5px 0; margin-left: auto; background: none; color: var(--ink-3); font-size: 11px; }
.history-results { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 24px 16px; }
.history-count { display: flex; justify-content: space-between; gap: 8px; padding: 16px 0 8px; color: var(--ink-3); font-size: 11px; }
.history-count > span { font-size: 10px; }
.history-hit { display: flex; align-items: center; position: relative; border-radius: 6px; }
.history-hit:hover, .history-hit:focus-within { background: var(--surface-hover); }
.history-hit-main { flex: 1; display: flex; gap: 12px; min-width: 0; padding: 16px 8px; background: none; text-align: left; color: inherit; }
.history-hit-content { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.history-hit-meta { display: flex; justify-content: space-between; gap: 12px; color: var(--ink-3); font-size: 12px; }
.history-hit-meta > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-hit-meta time { flex-shrink: 0; font-size: 11px; font-variant-numeric: tabular-nums; }
.history-message { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; white-space: pre-wrap; font-size: 14px; line-height: 1.7; }
.history-file { display: flex; align-items: center; gap: 12px; max-width: 360px; padding: 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-2); }
.history-file-icon { color: var(--accent); flex-shrink: 0; }
.history-file-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; font-size: 10px; color: var(--ink-3); }
.history-file-name { color: var(--ink); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-download { margin-right: 8px; flex-shrink: 0; }
.history-empty { display: flex; align-items: center; flex-direction: column; gap: 12px; padding: 64px 12px; color: var(--ink-3); text-align: center; font-size: 13px; }
.history-empty > span { font-size: 12px; }
.history-empty button, .history-error button { padding: 6px 12px; border-radius: 4px; background: var(--surface-2); color: var(--accent); }
.history-error { padding: 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--danger); font-size: 12px; }
.history-more { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 14px; background: none; color: var(--accent); font-size: 12px; }
.history-end { padding: 20px 0 4px; text-align: center; font-size: 11px; color: var(--ink-3); }
.spin { animation: tick-spin 900ms linear infinite; }
@media (max-width: 768px) {
  .history-dialog { width: 100vw; height: var(--mobile-viewport-height, 100dvh); border: 0; border-radius: 0; }
  .history-head { padding: calc(env(safe-area-inset-top, 0px) + 4px) 12px 8px; gap: 8px; justify-content: flex-start; }
  .history-head h2 { font-size: 15px; }
  .history-head p { display: none; }
  .history-close { order: -1; min-width: 44px; min-height: 44px; }
  .desktop-close { display: none; }
  .mobile-close { display: block; }
  .history-controls { padding: 0 16px; }
  .history-search { min-height: 48px; padding: 10px 12px; }
  .history-search input { font-size: 16px; }
  .history-results { padding: 0 12px calc(env(safe-area-inset-bottom, 0px) + 20px); }
  .history-tabs { gap: 22px; }
  .history-tabs button { min-height: 46px; font-size: 14px; }
  .history-filters { gap: 8px 12px; padding: 8px 0 12px; }
  .history-filters input, .history-filters select { height: 38px; max-width: 145px; font-size: 14px; }
  .history-filters label { font-size: 12px; }
  .history-hit-meta { flex-wrap: wrap; gap: 4px; }
  .history-hit-meta time { font-size: 11px; }
  .history-message { font-size: 15px; }
  .history-hit-main { padding: 16px 4px; gap: 10px; }
  .history-download { min-width: 44px; min-height: 44px; margin-right: 0; }
  .history-file { max-width: 100%; padding: 10px; gap: 10px; }
  .history-file-name { font-size: 14px; }
  .history-more, .history-reset { min-height: 44px; }
  .history-count > span { display: none; }
}
</style>
