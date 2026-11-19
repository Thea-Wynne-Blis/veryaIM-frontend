<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { FileText, Loader2, ZoomIn, ZoomOut, RotateCcw, FolderOpen, FileQuestion } from 'lucide-vue-next'
import { authorizedFetch } from '../api/client'
import { humanBytes } from '../utils/present'
import { decodePreviewText, previewKind, readOfficePreview, type OfficePreview, type PreviewFile } from '../utils/filePreview'

const props = defineProps<{ file: PreviewFile }>()
const kind = computed(() => previewKind(props.file))
const loading = ref(false)
const error = ref('')
const url = ref('')
const text = ref('')
const limited = ref(false)
const office = ref<OfficePreview | null>(null)
const sheet = ref(0)
const zoom = ref(1)
let request: AbortController | undefined
let version = 0

async function readBytes(response: Response, limit: number) {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    return { bytes: bytes.subarray(0, limit), truncated: bytes.length > limit }
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let truncated = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const remaining = limit - size
      if (value.length > remaining) { chunks.push(value.subarray(0, remaining)); size = limit; truncated = true; await reader.cancel(); break }
      chunks.push(value); size += value.length
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return { bytes, truncated }
}

function release() {
  request?.abort()
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = ''
}

async function load() {
  release()
  const current = ++version
  const controller = new AbortController()
  request = controller
  const format = kind.value
  error.value = ''; text.value = ''; office.value = null; limited.value = false; sheet.value = 0; zoom.value = 1
  loading.value = format !== 'unsupported'
  if (format === 'unsupported') return
  const document = ['docx', 'xlsx', 'pptx', 'zip'].includes(format)
  if (document && (props.file.sizeBytes ?? 0) > 20 * 1024 * 1024) {
    error.value = '文件较大，请下载后查看完整内容'; loading.value = false; return
  }
  try {
    const response = await authorizedFetch(`/files/${props.file.fileId}/content?disposition=inline`, { signal: controller.signal })
    if (format === 'text' || document) {
      const { bytes, truncated } = await readBytes(response, format === 'text' ? 512 * 1024 : 20 * 1024 * 1024)
      if (current !== version || controller.signal.aborted) return
      if (document && truncated) throw new Error('文件较大，请下载后查看完整内容')
      if (format === 'text') { text.value = decodePreviewText(bytes); limited.value = truncated }
      else {
        const result = await readOfficePreview(bytes, format as 'docx' | 'xlsx' | 'pptx' | 'zip', controller.signal)
        if (current === version && !controller.signal.aborted) office.value = result
      }
    } else {
      const blob = await response.blob()
      if (current !== version || controller.signal.aborted) return
      const fallback = format === 'pdf' ? 'application/pdf' : format === 'video' ? 'video/mp4' : format === 'audio' ? 'audio/mpeg' : 'image/png'
      const mime = format === 'pdf' ? 'application/pdf' : blob.type && blob.type !== 'application/octet-stream' ? blob.type : fallback
      url.value = URL.createObjectURL(new Blob([blob], { type: mime }))
    }
  } catch (e) {
    if (current === version && !controller.signal.aborted) error.value = e instanceof Error ? e.message : '预览加载失败，请重试'
  } finally { if (current === version) loading.value = false }
}

function columnName(index: number) {
  let value = index + 1
  let name = ''
  while (value > 0) { value--; name = String.fromCharCode(65 + value % 26) + name; value = Math.floor(value / 26) }
  return name
}
const currentSheet = computed(() => office.value?.sheets?.[sheet.value])
const columns = computed(() => Math.max(1, ...(currentSheet.value?.rows.map(row => row.length) ?? [0])))

watch(() => [props.file.fileId, props.file.name, props.file.contentType], () => void load(), { immediate: true })
onBeforeUnmount(() => { ++version; release() })
</script>

<template>
  <div class="file-preview-content" :class="`file-kind-${kind}`" :aria-busy="loading">
    <div v-if="loading" class="preview-state" role="status"><Loader2 :size="28" class="spin" /><p>正在加载预览…</p></div>
    <div v-else-if="error" class="preview-state preview-error" role="alert"><FileQuestion :size="34" :stroke-width="1.3" /><p>{{ error }}</p><button @click="load">重新加载</button></div>
    <template v-else-if="kind === 'image' && url">
      <div class="preview-image-controls"><button :disabled="zoom <= .5" aria-label="缩小图片" @click="zoom = Math.max(.5, zoom - .25)"><ZoomOut :size="17" /></button><span>{{ Math.round(zoom * 100) }}%</span><button :disabled="zoom >= 3" aria-label="放大图片" @click="zoom = Math.min(3, zoom + .25)"><ZoomIn :size="17" /></button><button aria-label="图片适合窗口" @click="zoom = 1"><RotateCcw :size="16" /></button></div>
      <div class="preview-image-canvas"><div class="preview-image-stage" :style="{ width: `${zoom * 100}%` }"><img :src="url" :alt="file.name" :class="{ fitted: zoom === 1 }" @error="error = '此图片暂无法显示，可以下载后查看'" /></div></div>
    </template>
    <iframe v-else-if="kind === 'pdf' && url" class="preview-pdf" :src="url" title="PDF 文件预览" referrerpolicy="no-referrer" />
    <video v-else-if="kind === 'video' && url" class="preview-video" :src="url" controls playsinline preload="metadata" @error="error = '浏览器暂不能播放此视频编码，可以下载后查看'" />
    <div v-else-if="kind === 'audio' && url" class="preview-audio"><FileText :size="44" :stroke-width="1.3" /><p>{{ file.name }}</p><audio :src="url" controls preload="metadata" @error="error = '浏览器暂不能播放此音频编码，可以下载后查看'" /></div>
    <template v-else-if="kind === 'text'"><p v-if="limited" class="preview-note">预览前 512 KB，完整内容可下载查看。</p><pre v-if="text" class="preview-text">{{ text }}</pre><div v-else class="preview-state"><FileText :size="32" :stroke-width="1.3" /><p>这是一个空文件</p></div></template>
    <template v-else-if="office">
      <p class="preview-note">{{ kind === 'zip' ? '压缩包内容列表' : '内容预览 · 文字与表格为主，原始版式以文件为准' }}<span v-if="office.limited"> · 内容较多，已展示部分</span></p>
      <div v-if="office.paragraphs" class="preview-document"><p v-for="(paragraph, index) in office.paragraphs" :key="index" :class="{ heading: paragraph.heading }">{{ paragraph.text }}</p><p v-if="!office.paragraphs.length" class="preview-no-text">此文档没有可提取的文字内容。</p></div>
      <template v-if="office.sheets"><div class="preview-sheet-tabs" role="group" aria-label="工作表"><button v-for="(item, index) in office.sheets" :key="index" :aria-pressed="sheet === index" :class="{ on: sheet === index }" @click="sheet = index">{{ item.name }}</button></div><div class="preview-table-scroll"><table class="preview-table"><thead><tr><th>#</th><th v-for="column in columns" :key="column">{{ columnName(column - 1) }}</th></tr></thead><tbody><tr v-for="(row, index) in currentSheet?.rows" :key="index"><th>{{ index + 1 }}</th><td v-for="column in columns" :key="column">{{ row[column - 1] }}</td></tr></tbody></table><p v-if="!currentSheet?.rows.length" class="preview-no-text">工作表没有内容。</p></div></template>
      <div v-if="office.slides" class="preview-slides"><article v-for="(slide, index) in office.slides" :key="index"><span>第 {{ index + 1 }} 页</span><p v-for="(line, lineIndex) in slide" :key="lineIndex">{{ line }}</p><p v-if="!slide.length" class="preview-no-text">这一页没有可提取的文字内容。</p></article></div>
      <div v-if="office.entries" class="preview-archive"><p v-if="!office.entries.length" class="preview-no-text">压缩包中没有文件。</p><div v-for="entry in office.entries" :key="entry.name"><FolderOpen :size="17" /><span>{{ entry.name }}</span><small>{{ humanBytes(entry.size) }}</small></div></div>
    </template>
    <div v-else class="preview-state"><FileQuestion :size="40" :stroke-width="1.2" /><h3>此格式暂不支持在线展开</h3><p>{{ file.name }}</p><span>可以下载后，使用对应的应用打开。</span></div>
  </div>
</template>

<style scoped>
.file-preview-content { display: flex; flex-direction: column; min-width: 0; min-height: 260px; height: 100%; color: var(--ink); }
.preview-state { display: flex; flex: 1; align-items: center; justify-content: center; flex-direction: column; gap: 14px; min-height: 260px; padding: 32px 20px; text-align: center; color: var(--ink-3); }
.preview-state p { font-size: 14px; overflow-wrap: anywhere; }
.preview-state h3 { font-size: 16px; font-weight: 550; color: var(--ink-2); }
.preview-state > span { font-size: 12px; }
.preview-state button { padding: 8px 14px; background: var(--surface-3); border-radius: 6px; color: var(--accent); }
.preview-error { color: var(--danger); }
.preview-image-controls { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 6px 10px; background: var(--surface-2); border-bottom: 1px solid var(--line); }
.preview-image-controls button { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 5px; }
.preview-image-controls button:hover { background: var(--surface-hover); }
.preview-image-controls span { min-width: 42px; font-size: 12px; text-align: center; color: var(--ink-3); }
.preview-image-canvas { flex: 1; min-height: 220px; max-height: 65dvh; overflow: auto; padding: 16px; background: var(--surface-3); }
.preview-image-stage { display: flex; justify-content: center; margin: auto; min-height: 0; }
.preview-image-stage img { display: block; width: 100%; height: auto; object-fit: contain; }
.preview-image-stage img.fitted { max-height: 55dvh; }
.preview-pdf { flex: 1; display: block; width: 100%; min-height: 420px; border: 0; background: var(--surface-3); }
.preview-video { display: block; width: 100%; max-height: 65dvh; min-height: 240px; background: #111; }
.preview-audio { display: flex; flex: 1; min-height: 260px; align-items: center; justify-content: center; flex-direction: column; gap: 24px; padding: 24px; background: var(--surface-2); color: var(--ink-3); }
.preview-audio p { font-size: 15px; color: var(--ink); overflow-wrap: anywhere; }
.preview-audio audio { width: min(420px, 100%); }
.preview-text { flex: 1; min-height: 260px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; padding: 24px; font: 13px/1.85 var(--mono, monospace); user-select: text; }
.preview-note { padding: 10px 14px; font-size: 11px; line-height: 1.6; color: var(--ink-3); background: var(--surface-2); border-bottom: 1px solid var(--line); }
.preview-document { padding: 28px; background: var(--surface); }
.preview-document p { margin-bottom: 12px; font-size: 15px; line-height: 1.9; overflow-wrap: anywhere; white-space: pre-wrap; }
.preview-document .heading { font-size: 20px; font-weight: 600; margin: 12px 0 20px; }
.preview-sheet-tabs { display: flex; gap: 6px; padding: 10px; overflow-x: auto; }
.preview-sheet-tabs button { flex-shrink: 0; padding: 8px 12px; border-radius: 5px; font-size: 12px; color: var(--ink-3); }
.preview-sheet-tabs button.on { color: var(--accent-ink); background: var(--accent-soft); }
.preview-table-scroll { flex: 1; min-height: 200px; overflow: auto; }
.preview-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.preview-table td, .preview-table th { padding: 10px 14px; border: 1px solid var(--line); text-align: left; min-width: 90px; max-width: 360px; overflow-wrap: anywhere; white-space: pre-wrap; }
.preview-table th { background: var(--surface-2); color: var(--ink-3); font-size: 11px; font-weight: 500; }
.preview-table th:first-child { min-width: 36px; width: 36px; }
.preview-slides { padding: 16px; background: var(--canvas); }
.preview-slides article { padding: 24px; border: 1px solid var(--line); border-radius: 8px; margin-bottom: 14px; background: var(--surface); }
.preview-slides article > span { display: block; color: var(--ink-3); font-size: 11px; margin-bottom: 20px; }
.preview-slides p { font-size: 15px; line-height: 1.8; margin: 10px 0; overflow-wrap: anywhere; }
.preview-archive { padding: 8px 16px; }
.preview-archive > div { display: flex; align-items: center; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--line); color: var(--ink-3); }
.preview-archive span { min-width: 0; flex: 1; font-size: 13px; color: var(--ink); overflow-wrap: anywhere; }
.preview-archive small { flex-shrink: 0; font-size: 11px; }
.preview-no-text { padding: 24px; color: var(--ink-3); font-size: 13px; }
.spin { animation: tick-spin 900ms linear infinite; }
@media (max-width: 768px) { .preview-text { padding: 18px 16px; font-size: 13px; } .preview-document { padding: 20px 16px; } .preview-image-controls button { width: 44px; height: 44px; } .preview-image-canvas { max-height: 65dvh; padding: 10px; } }
</style>
