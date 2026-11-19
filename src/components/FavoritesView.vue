<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Star, Search, Loader2, RefreshCw, Download, FileText, Image as ImageIcon, Film, Mic, ArrowUpRight, X, ArrowLeft, Link, MessageSquare, BookmarkMinus } from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import FavoriteMedia from './FavoriteMedia.vue'
import SearchHighlight from './SearchHighlight.vue'
import FilePreviewContent from './FilePreviewContent.vue'
import { api, downloadFile, type Favorite, type Id } from '../api/client'
import { useToast } from '../composables/useToast'
import { messageOf } from '../utils/error'
import { humanBytes, initialsOf, listTime, toneOfPerson } from '../utils/present'
import { favoriteExcerpt, favoriteKind, favoriteTitle, type FavoriteKind } from '../utils/favorites'
import type { PreviewFile } from '../utils/filePreview'

const props = withDefaults(defineProps<{
  mobile?: boolean
  locateMessage: (conversationId: string, messageId: string, signal?: AbortSignal) => Promise<void>
}>(), { mobile: false })
const emit = defineEmits<{ (e: 'back'): void }>()
const rows = ref<Favorite[]>([])
const loading = ref(true)
const error = ref('')
const keyword = ref('')
const category = ref<FavoriteKind | 'ALL'>('ALL')
const selected = ref<Favorite | null>(null)
const dialog = ref<HTMLDialogElement | null>(null)
const detailError = ref('')
const downloading = ref<Id | null>(null)
const removing = ref(false)
const locating = ref(false)
const { message: notice, show: flash } = useToast()
let locationRequest: AbortController | undefined
const categories = [
  { key: 'ALL', label: '全部', icon: Star },
  { key: 'TEXT', label: '文字', icon: MessageSquare },
  { key: 'FILE', label: '文件', icon: FileText },
  { key: 'MEDIA', label: '图片与视频', icon: ImageIcon },
  { key: 'LINK', label: '链接', icon: Link },
  { key: 'AUDIO', label: '语音', icon: Mic },
] as const
const query = computed(() => keyword.value.trim())
const filtered = computed(() => rows.value.filter(row =>
  (category.value === 'ALL' || favoriteKind(row) === category.value) &&
  [row.fileName, row.text, row.senderName, row.conversationTitle].some(value =>
    value?.toLowerCase().includes(query.value.toLowerCase())),
))
const narrowed = computed(() => !!query.value || category.value !== 'ALL')
const attachment = computed<PreviewFile | null>(() => selected.value?.fileId ? {
  fileId: selected.value.fileId,
  name: selected.value.fileName || '收藏附件',
  sizeBytes: selected.value.sizeBytes,
  contentType: selected.value.contentType || (selected.value.type === 'IMAGE' ? 'image/jpeg' : selected.value.type === 'AUDIO' ? 'audio/webm' : selected.value.type === 'VIDEO' ? 'video/mp4' : undefined),
} : null)

function iconOf(row: Favorite) {
  if (row.type === 'VIDEO') return Film
  return categories.find(item => item.key === favoriteKind(row))?.icon || MessageSquare
}
function labelOf(row: Favorite) {
  return row.type === 'IMAGE' ? '图片' : row.type === 'VIDEO' ? '视频'
    : row.type === 'EMOJI' ? '表情' : categories.find(item => item.key === favoriteKind(row))?.label || '文字'
}
function extension(row: Favorite) {
  const name = row.fileName ?? ''
  return name.includes('.') ? name.split('.').at(-1)!.slice(0, 8).toUpperCase() : 'FILE'
}
function fullTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}
function reset() { keyword.value = ''; category.value = 'ALL' }
async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.get<Favorite[]>('/favorites?limit=200')
    rows.value = Array.isArray(data) ? data : []
  } catch (e) { error.value = messageOf(e, '加载收藏失败') }
  finally { loading.value = false }
}
async function preview(row: Favorite) {
  selected.value = row
  detailError.value = ''
  await nextTick()
  dialog.value?.showModal()
}
function closeDetail() {
  locationRequest?.abort()
  dialog.value?.close()
  selected.value = null
  detailError.value = ''
  locating.value = false
}
async function locate() {
  const row = selected.value
  if (!row || locating.value) return
  locationRequest = new AbortController()
  const signal = locationRequest.signal
  locating.value = true
  detailError.value = ''
  try { await props.locateMessage(row.conversationId, String(row.messageId), signal); closeDetail() }
  catch (e) { if (!signal.aborted) detailError.value = messageOf(e, '无法查看原消息，请重试') }
  finally { locating.value = false }
}
async function download() {
  const row = selected.value
  if (row?.fileId == null || downloading.value != null) return
  downloading.value = row.fileId
  detailError.value = ''
  try { await downloadFile(row.fileId, row.fileName || '收藏文件') }
  catch (e) { detailError.value = messageOf(e, '附件暂不可下载，请重试') }
  finally { downloading.value = null }
}
async function remove() {
  const row = selected.value
  if (!row || removing.value) return
  removing.value = true
  detailError.value = ''
  try {
    await api.delete(`/favorites/${row.id}`)
    rows.value = rows.value.filter(item => String(item.id) !== String(row.id))
    closeDetail()
    flash('已取消收藏')
  } catch (e) { detailError.value = messageOf(e, '取消收藏失败，请重试') }
  finally { removing.value = false }
}
onMounted(load)
onBeforeUnmount(() => { locationRequest?.abort(); dialog.value?.close() })
</script>

<template>
  <section class="favorites" :class="{ mobile }" aria-label="我的收藏">
    <header class="fav-head">
      <button v-if="mobile" class="icon-btn fav-back" aria-label="返回我的" @click="emit('back')"><ArrowLeft :size="22" /></button>
      <div class="fav-heading"><h1>我的收藏</h1><p>{{ rows.length }} 条收藏<span v-if="rows.length === 200"> · 最近 200 条</span></p></div>
      <button class="icon-btn fav-refresh" :disabled="loading" aria-label="刷新收藏" @click="load"><Loader2 v-if="loading" :size="18" class="spin" /><RefreshCw v-else :size="18" :stroke-width="1.7" /></button>
    </header>
    <div class="fav-controls">
      <label class="fav-search"><Search :size="18" /><input v-model="keyword" type="search" placeholder="搜索收藏内容、文件名或来源" aria-label="搜索收藏" maxlength="128" /><button v-if="keyword" class="icon-btn" aria-label="清空收藏搜索" @click="keyword = ''"><X :size="16" /></button></label>
      <div class="fav-categories" role="group" aria-label="收藏分类"><button v-for="item in categories" :key="item.key" :class="{ active: category === item.key }" :aria-pressed="category === item.key" @click="category = item.key"><component :is="item.icon" :size="15" />{{ item.label }}</button></div>
    </div>
    <div class="fav-scroll" :aria-busy="loading">
      <div class="fav-container">
        <div v-if="error" class="fav-error" role="alert"><span>{{ error }}</span><button @click="load">重新加载</button></div>
        <p v-if="notice" class="fav-notice" role="status">{{ notice }}</p>
        <p v-if="filtered.length" class="fav-section-label">{{ narrowed ? `找到 ${filtered.length} 条收藏` : '最近收藏' }}<span>按收藏时间排列</span></p>
        <div v-if="loading && !rows.length" class="fav-grid" aria-label="正在加载收藏"><div v-for="i in 4" :key="i" class="fav-skeleton"><span /><span /><span /></div></div>
        <div v-else-if="filtered.length" class="fav-grid">
          <article v-for="row in filtered" :key="String(row.id)" class="fav-card">
            <button class="fav-preview" :aria-label="`查看收藏：${favoriteTitle(row)}`" @click="preview(row)">
              <span class="fav-card-head"><span class="fav-kind"><component :is="iconOf(row)" :size="15" />{{ labelOf(row) }}</span><time :datetime="row.createdAt" :title="fullTime(row.createdAt)">{{ listTime(row.createdAt) }}</time></span>
              <span class="fav-content">
                <FavoriteMedia v-if="row.type === 'IMAGE' && row.fileId" :file-id="row.fileId" :name="favoriteTitle(row)" />
                <span v-else-if="row.type === 'FILE'" class="fav-document"><FileText :size="28" :stroke-width="1.4" /><span>{{ extension(row) }}</span></span>
                <span v-else-if="row.type === 'VIDEO' || row.type === 'AUDIO'" class="fav-media-icon"><component :is="row.type === 'VIDEO' ? Film : Mic" :size="30" :stroke-width="1.4" /></span>
                <span class="fav-copy"><SearchHighlight class="fav-text" :class="{ filename: !!row.fileId }" :text="favoriteExcerpt(favoriteTitle(row), query)" :keyword="query" /><span v-if="row.fileId" class="fav-file-meta">{{ row.type === 'FILE' ? extension(row) : labelOf(row) }}<template v-if="row.sizeBytes != null"> · {{ humanBytes(row.sizeBytes) }}</template></span></span>
              </span>
              <span class="fav-source"><AppAvatar :initials="initialsOf(row.senderName)" :tone="toneOfPerson(row.senderId)" size="sm" /><SearchHighlight :text="`${row.senderName} · ${row.conversationTitle}`" :keyword="query" /></span>
            </button>
          </article>
        </div>
        <div v-else-if="!loading && !error" class="fav-empty"><span class="fav-empty-icon"><Search v-if="narrowed" :size="30" :stroke-width="1.3" /><Star v-else :size="30" :stroke-width="1.3" /></span><h2>{{ narrowed ? '没有找到相关收藏' : '把重要的内容收藏在这里' }}</h2><p>{{ narrowed ? '试试其他关键词，或切换内容分类。' : '在聊天中右键或长按消息，选择“收藏”。' }}</p><button v-if="narrowed" @click="reset">清除筛选</button></div>
      </div>
    </div>
    <dialog v-if="selected" ref="dialog" class="favorite-dialog" aria-labelledby="favorite-detail-title" @cancel.prevent="closeDetail" @click.self="closeDetail">
      <div class="favorite-detail">
        <header class="favorite-detail-head"><span class="favorite-bookmark"><Star :size="20" :stroke-width="1.7" /></span><h2 id="favorite-detail-title">收藏详情</h2><button class="icon-btn" aria-label="关闭收藏详情" @click="closeDetail"><X :size="20" /></button></header>
        <div class="favorite-detail-body">
          <div class="favorite-origin"><AppAvatar :initials="initialsOf(selected.senderName)" :tone="toneOfPerson(selected.senderId)" size="md" /><div><p>{{ selected.senderName }}<span> · {{ selected.conversationTitle }}</span></p><time :datetime="selected.createdAt">收藏于 {{ fullTime(selected.createdAt) }}</time></div></div>
          <FilePreviewContent v-if="attachment" :key="String(selected.id)" :file="attachment" />
          <p v-else class="favorite-full-text">{{ favoriteTitle(selected) }}</p>
          <p v-if="detailError" class="favorite-detail-error" role="alert">{{ detailError }}</p>
        </div>
        <footer class="favorite-detail-actions"><button class="favorite-remove" :disabled="removing || locating" @click="remove"><Loader2 v-if="removing" :size="16" class="spin" /><BookmarkMinus v-else :size="16" />取消收藏</button><span class="action-spacer" /><button v-if="selected.fileId" class="favorite-download" :disabled="downloading != null || removing" @click="download"><Loader2 v-if="downloading != null" :size="16" class="spin" /><Download v-else :size="16" />下载</button><button class="favorite-locate" :disabled="locating || removing" @click="locate"><Loader2 v-if="locating" :size="16" class="spin" /><ArrowUpRight v-else :size="16" />{{ locating ? '正在定位…' : '查看原消息' }}</button></footer>
      </div>
    </dialog>
  </section>
</template>

<style scoped>
.favorites { height: 100%; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--canvas); overflow: hidden; }
.fav-head { display: flex; align-items: center; gap: 12px; padding: 28px 32px 22px; background: var(--surface); }
.fav-heading { flex: 1; }
.fav-heading h1 { font-size: 24px; font-weight: 650; letter-spacing: -.6px; }
.fav-heading p { margin-top: 5px; font-size: 12px; color: var(--ink-3); }
.fav-refresh { width: 38px; height: 38px; color: var(--ink-3); }
.fav-controls { padding: 0 32px; border-bottom: 1px solid var(--line); background: var(--surface); }
.fav-search { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 4px 12px; max-width: 480px; background: var(--surface-3); border: 1px solid transparent; border-radius: 7px; color: var(--ink-3); }
.fav-search:focus-within { border-color: var(--accent); background: var(--surface); }
.fav-search input { flex: 1; min-width: 0; font-size: 13px; }
.fav-search input:focus-visible { outline: none; }
.fav-search .icon-btn { height: 30px; width: 30px; }
.fav-categories { display: flex; gap: 24px; padding-top: 14px; overflow-x: auto; scrollbar-width: none; }
.fav-categories button { display: flex; align-items: center; flex-shrink: 0; gap: 7px; padding: 12px 0 14px; border-bottom: 2px solid transparent; font-size: 13px; color: var(--ink-3); }
.fav-categories button.active { color: var(--accent); border-color: var(--accent); font-weight: 600; }
.fav-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.fav-container { max-width: 1160px; margin: 0 auto; padding: 24px 32px 40px; }
.fav-section-label { display: flex; justify-content: space-between; margin-bottom: 14px; font-size: 12px; color: var(--ink-2); }
.fav-section-label > span { color: var(--ink-3); font-size: 11px; }
.fav-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.fav-card { min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; transition: border-color 150ms; }
.fav-card:hover { border-color: var(--line-strong); }
.fav-preview { display: flex; flex-direction: column; width: 100%; height: 100%; text-align: left; padding: 18px; }
.fav-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; font-size: 11px; color: var(--ink-3); }
.fav-kind { display: flex; align-items: center; gap: 6px; }
.fav-card-head time { white-space: nowrap; font-variant-numeric: tabular-nums; }
.fav-content { display: flex; align-items: center; gap: 16px; width: 100%; min-height: 132px; padding: 16px 0; }
.fav-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.fav-text { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; font-size: 15px; line-height: 1.75; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--ink); }
.fav-text.filename { font-weight: 550; -webkit-line-clamp: 2; }
.fav-file-meta { color: var(--ink-3); font-size: 11px; }
.fav-document { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; width: 58px; height: 72px; flex-shrink: 0; background: var(--accent-soft); color: var(--accent); border-radius: 8px; }
.fav-document > span { font-size: 9px; font-weight: 700; letter-spacing: .04em; }
.fav-media-icon { display: grid; place-items: center; width: 72px; height: 72px; flex-shrink: 0; border-radius: 8px; background: var(--surface-3); color: var(--ink-3); }
.fav-source { display: flex; align-items: center; gap: 8px; width: 100%; margin-top: auto; padding-top: 12px; border-top: 1px solid var(--line); font-size: 11px; color: var(--ink-3); }
.fav-source :deep(.avatar) { width: 24px; height: 24px; font-size: 10px; flex-shrink: 0; }
.fav-source > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fav-empty { display: flex; align-items: center; flex-direction: column; gap: 12px; padding: 80px 16px; text-align: center; }
.fav-empty-icon { display: grid; place-items: center; width: 68px; height: 68px; border-radius: 20px; background: var(--accent-soft); color: var(--accent); margin-bottom: 8px; }
.fav-empty h2 { font-size: 18px; font-weight: 600; }
.fav-empty p { max-width: 320px; color: var(--ink-3); font-size: 13px; line-height: 1.7; }
.fav-empty > button { padding: 10px 16px; color: var(--accent); font-size: 13px; }
.fav-error, .fav-notice { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; margin-bottom: 16px; font-size: 12px; border-radius: 6px; }
.fav-error { color: var(--danger); background: var(--danger-soft); }
.fav-error button { text-decoration: underline; }
.fav-notice { color: var(--accent-ink); background: var(--accent-soft); }
.fav-skeleton { display: flex; flex-direction: column; gap: 20px; padding: 24px; height: 210px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.fav-skeleton span { height: 14px; border-radius: 4px; background: var(--surface-3); }
.fav-skeleton span:first-child { width: 35%; }
.fav-skeleton span:last-child { width: 65%; }
.favorite-dialog { width: min(660px, calc(100vw - 48px)); max-width: none; max-height: none; height: min(700px, calc(100dvh - 80px)); padding: 0; margin: auto; border: 1px solid var(--line-strong); border-radius: 12px; color: var(--ink); background: var(--surface); box-shadow: 0 24px 80px #0003; }
.favorite-dialog::backdrop { background: #101b2445; backdrop-filter: blur(2px); }
.favorite-detail { display: flex; flex-direction: column; height: 100%; }
.favorite-detail-head { display: flex; align-items: center; gap: 10px; padding: 18px 24px; border-bottom: 1px solid var(--line); }
.favorite-bookmark { color: var(--accent); display: flex; }
.favorite-detail-head h2 { flex: 1; font-size: 16px; font-weight: 600; }
.favorite-detail-head .icon-btn { width: 36px; height: 36px; }
.favorite-detail-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 24px; }
.favorite-origin { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
.favorite-origin > div { min-width: 0; }
.favorite-origin p { font-size: 13px; overflow-wrap: anywhere; }
.favorite-origin p > span { color: var(--ink-3); }
.favorite-origin time { display: block; margin-top: 4px; font-size: 11px; color: var(--ink-3); }
.favorite-full-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 16px; line-height: 1.9; user-select: text; }
.favorite-file-detail { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 40px 20px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-2); text-align: center; }
.favorite-file-detail h3 { max-width: 100%; font-size: 16px; font-weight: 550; overflow-wrap: anywhere; }
.favorite-file-detail > p { font-size: 12px; color: var(--ink-3); }
.favorite-detail-error { margin-top: 24px; padding: 12px; border-radius: 6px; background: var(--danger-soft); color: var(--danger); font-size: 13px; line-height: 1.7; }
.favorite-detail-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--line); }
.favorite-detail-actions > button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; padding: 0 12px; border-radius: 6px; font-size: 12px; }
.favorite-remove { color: var(--ink-3); }
.favorite-remove:hover { color: var(--danger); background: var(--danger-soft); }
.favorite-download { color: var(--ink-2); border: 1px solid var(--line); }
.favorite-locate { color: #fff; background: var(--accent); }
.action-spacer { flex: 1; }
.favorite-player :deep(.video-player) { width: 100%; max-width: 100%; }
.favorite-player :deep(.bubble) { max-width: 100%; }
.spin { animation: tick-spin 900ms linear infinite; }
@media (max-width: 1050px) { .fav-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 768px) {
  .fav-head { padding: 8px 16px 12px; gap: 6px; }
  .fav-heading h1 { font-size: 20px; }
  .fav-heading p { font-size: 11px; margin-top: 2px; }
  .fav-back { width: 44px; height: 44px; margin-left: -8px; }
  .fav-refresh { width: 44px; height: 44px; }
  .fav-controls { padding: 0 16px; }
  .fav-search { min-height: 46px; max-width: none; }
  .fav-search input { font-size: 16px; }
  .fav-categories { gap: 22px; padding-top: 8px; }
  .fav-categories button { min-height: 48px; font-size: 14px; }
  .fav-categories button > svg { display: none; }
  .fav-container { padding: 18px 16px 30px; }
  .fav-section-label { font-size: 12px; }
  .fav-grid { gap: 12px; }
  .fav-preview { padding: 16px; }
  .fav-content { min-height: 112px; gap: 12px; }
  .fav-text { font-size: 15px; }
  .fav-source { font-size: 11px; }
  .favorite-dialog { width: 100vw; height: var(--mobile-viewport-height, 100dvh); max-height: none; border: 0; border-radius: 0; }
  .favorite-detail-head { padding: calc(env(safe-area-inset-top, 0px) + 6px) 16px 6px; }
  .favorite-detail-head .icon-btn { width: 44px; height: 44px; }
  .favorite-detail-body { padding: 20px 16px; }
  .favorite-detail-actions { padding: 12px 12px calc(env(safe-area-inset-bottom, 0px) + 12px); gap: 6px; }
  .favorite-detail-actions > button { min-height: 44px; font-size: 13px; padding: 0 10px; }
  .favorite-origin { gap: 10px; }
  .favorite-origin p { font-size: 13px; }
}
</style>
