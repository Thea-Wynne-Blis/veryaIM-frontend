<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { FileText, Download, FolderOpen, Loader2, HardDrive, RefreshCw } from 'lucide-vue-next'
import { api } from '../api/client'
import { listTime, toneOf } from '../utils/present'

type FileRow = {
  fileId: number
  name: string
  contentType: string
  sizeBytes: number
  createdAt: string
}

const rows = ref<FileRow[]>([])
const loading = ref(false)
const error = ref('')
const downloading = ref<number | null>(null)

const totalSize = computed(() =>
  rows.value.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0),
)

function human(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function kindOf(contentType: string): string {
  if (!contentType) return 'FILE'
  if (contentType.startsWith('image/')) return 'IMG'
  if (contentType.startsWith('video/')) return 'VID'
  if (contentType.startsWith('audio/')) return 'AUD'
  if (contentType.includes('pdf')) return 'PDF'
  return 'FILE'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.get<FileRow[]>('/files/mine')
    rows.value = Array.isArray(data) ? data : []
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载文件失败'
  } finally {
    loading.value = false
  }
}

async function download(row: FileRow) {
  downloading.value = row.fileId
  try {
    const res = await api.get<{ url: string }>(`/files/${row.fileId}/url`)
    if (res?.url) window.open(res.url, '_blank')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '获取下载地址失败'
  } finally {
    downloading.value = null
  }
}

/** ReactBits Spotlight：指针位置写入 CSS 变量 */
function spot(event: PointerEvent) {
  const el = event.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--spot-x', `${event.clientX - rect.left}px`)
  el.style.setProperty('--spot-y', `${event.clientY - rect.top}px`)
}

onMounted(load)
</script>

<template>
  <div class="files">
    <header class="files-head">
      <div>
        <p class="eyebrow">文件</p>
        <h1 class="files-title">我的文件</h1>
      </div>
      <div class="head-right">
        <div class="stat-chip">
          <HardDrive :size="9" :stroke-width="2.4" />
          {{ human(totalSize) }}
        </div>
        <div class="stat-chip">{{ rows.length }} 个</div>
        <button class="icon-btn sm" title="刷新" @click="load">
          <Loader2 v-if="loading" :size="14" class="spin" />
          <RefreshCw v-else :size="14" :stroke-width="2" />
        </button>
      </div>
    </header>

    <div class="files-body">
      <p v-if="error" class="files-error">{{ error }}</p>

      <div v-if="rows.length" class="files-card">
        <button
          v-for="(f, index) in rows"
          :key="f.fileId"
          class="file-row spot glare"
          :style="{ animation: `fade-up 320ms var(--ease-out) ${index * 22}ms backwards` }"
          @pointermove="spot"
          @click="download(f)"
        >
          <span class="file-icon" :class="`tone-${toneOf(f.fileId)}`">
            <FileText :size="15" :stroke-width="1.9" />
          </span>
          <span class="file-main">
            <span class="file-name">{{ f.name }}</span>
            <span class="file-sub">
              <span class="file-kind">{{ kindOf(f.contentType) }}</span>
              {{ human(f.sizeBytes) }} · {{ listTime(f.createdAt) }}
            </span>
          </span>
          <span class="file-action">
            <Loader2 v-if="downloading === f.fileId" :size="14" class="spin" />
            <Download v-else :size="14" :stroke-width="1.9" />
          </span>
        </button>
      </div>

      <div v-else-if="!loading" class="empty">
        <div class="empty-mark"><FolderOpen :size="22" :stroke-width="1.6" /></div>
        <h3 class="empty-title">还没有上传过文件</h3>
        <p class="empty-text">
          在聊天里发送图片或附件后，你上传的文件会出现在这里，可直接下载。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.files { height: 100%; display: flex; flex-direction: column; background: var(--canvas); overflow: hidden; }
.files-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 22px 13px;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--canvas) 84%, transparent);
  backdrop-filter: blur(14px);
}
.files-title { font-size: 18px; font-weight: 690; letter-spacing: -0.4px; margin-top: 2px; }
.head-right { display: flex; align-items: center; gap: 6px; }
.files-body { flex: 1; overflow-y: auto; padding: 16px 22px 30px; }
.files-error { margin-bottom: 12px; padding: 8px 11px; border-radius: var(--r-sm); background: var(--danger-soft); color: var(--danger); font-size: 11.5px; }
.files-card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-md); overflow: hidden;
  box-shadow: var(--shadow-xs);
}
.file-row {
  display: flex; align-items: center; gap: 11px; width: 100%;
  padding: 10px 12px; text-align: left;
  transition: background var(--dur-1) var(--ease-out);
}
.file-row + .file-row { border-top: 1px solid var(--line); }
.file-row:hover { background: var(--surface-hover); }
.file-icon {
  width: 34px; height: 34px; border-radius: var(--r-sm);
  display: grid; place-items: center; color: #fff; flex-shrink: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
}
.file-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.file-name { font-size: 13px; font-weight: 570; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-sub { font-size: 10.5px; color: var(--ink-3); display: flex; align-items: center; gap: 5px; font-variant-numeric: tabular-nums; }
.file-kind {
  font-size: 9px; font-weight: 700; letter-spacing: 0.06em;
  padding: 1px 4px; border-radius: 3px;
  background: var(--surface-3); color: var(--ink-3);
  border: 1px solid var(--line);
}
.file-action { width: 26px; height: 26px; display: grid; place-items: center; color: var(--ink-3); flex-shrink: 0; }
.spin { animation: tick-spin 900ms linear infinite; }
</style>
