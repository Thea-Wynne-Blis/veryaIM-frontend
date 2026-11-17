<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  FileText, Download, FolderOpen, Loader2, HardDrive, RefreshCw, Upload, Trash2,
} from 'lucide-vue-next'
import { api, downloadFile, sameId, uploadFile, type FileRow, type Id } from '../api/client'
import { humanBytes, listTime, toneOf } from '../utils/present'

const rows = ref<FileRow[]>([])
const loading = ref(false)
const error = ref('')
const notice = ref('')
const downloading = ref<Id | null>(null)
const deleting = ref<Id | null>(null)
const uploading = ref(false)
const input = ref<HTMLInputElement | null>(null)

const totalSize = computed(() =>
  rows.value.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0),
)

function kindOf(contentType: string): string {
  if (!contentType) return 'FILE'
  if (contentType.startsWith('image/')) return 'IMG'
  if (contentType.startsWith('video/')) return 'VID'
  if (contentType.startsWith('audio/')) return 'AUD'
  if (contentType.includes('pdf')) return 'PDF'
  return 'FILE'
}

function flash(text: string) {
  notice.value = text
  window.setTimeout(() => (notice.value = ''), 2200)
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
  error.value = ''
  try {
    // 下载接口需要 Bearer Token，window.open 带不上请求头。
    await downloadFile(row.fileId, row.name)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '下载失败'
  } finally {
    downloading.value = null
  }
}

async function onPick(event: Event) {
  const el = event.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (!file) return
  uploading.value = true
  error.value = ''
  try {
    // 大文件自动分片，与聊天里的附件上传保持一致
    await uploadFile(file, null)
    flash('上传成功')
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '上传失败'
  } finally {
    uploading.value = false
  }
}

async function remove(row: FileRow) {
  if (!window.confirm(`确定删除「${row.name}」吗？`)) return
  deleting.value = row.fileId
  error.value = ''
  try {
    await api.delete(`/files/${row.fileId}`)
    rows.value = rows.value.filter((f) => !sameId(f.fileId, row.fileId))
    flash('文件已删除')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  } finally {
    deleting.value = null
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
          {{ humanBytes(totalSize) }}
        </div>
        <div class="stat-chip">{{ rows.length }} 个</div>
        <button class="icon-btn sm" title="上传文件" :disabled="uploading" @click="input?.click()">
          <Loader2 v-if="uploading" :size="14" class="spin" />
          <Upload v-else :size="14" :stroke-width="2" />
        </button>
        <button class="icon-btn sm" title="刷新" :disabled="loading" @click="load">
          <Loader2 v-if="loading" :size="14" class="spin" />
          <RefreshCw v-else :size="14" :stroke-width="2" />
        </button>
        <input ref="input" type="file" hidden @change="onPick" />
      </div>
    </header>

    <div class="files-body">
      <p v-if="error" class="files-error">{{ error }}</p>
      <p v-if="notice" class="files-notice">{{ notice }}</p>

      <div v-if="rows.length" class="files-card">
        <div
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
              {{ humanBytes(f.sizeBytes) }} · {{ listTime(f.createdAt) }}
            </span>
          </span>
          <button
            class="file-action"
            title="下载"
            :disabled="downloading !== null"
            @click.stop="download(f)"
          >
            <Loader2 v-if="sameId(downloading, f.fileId)" :size="14" class="spin" />
            <Download v-else :size="14" :stroke-width="1.9" />
          </button>
          <button
            class="file-action danger"
            title="删除"
            :disabled="deleting !== null"
            @click.stop="remove(f)"
          >
            <Loader2 v-if="sameId(deleting, f.fileId)" :size="14" class="spin" />
            <Trash2 v-else :size="14" :stroke-width="1.9" />
          </button>
        </div>
      </div>

      <div v-else-if="!loading" class="empty">
        <div class="empty-mark"><FolderOpen :size="22" :stroke-width="1.6" /></div>
        <h3 class="empty-title">还没有上传过文件</h3>
        <p class="empty-text">
          点右上角上传按钮添加文件，或在聊天里发送图片/附件。这里可以直接下载或删除。
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
.files-notice { margin-bottom: 12px; padding: 8px 11px; border-radius: var(--r-sm); background: var(--accent-soft); color: var(--accent-ink); font-size: 11.5px; }
.files-card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-md); overflow: hidden;
  box-shadow: var(--shadow-xs);
}
.file-row {
  display: flex; align-items: center; gap: 11px; width: 100%;
  padding: 10px 12px; text-align: left; cursor: pointer;
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
.file-action { width: 26px; height: 26px; display: grid; place-items: center; border-radius: var(--r-xs); color: var(--ink-3); flex-shrink: 0; }
.file-action:hover { background: var(--accent-soft); color: var(--accent); }
.file-action.danger:hover { background: var(--danger-soft); color: var(--danger); }
.spin { animation: tick-spin 900ms linear infinite; }
</style>
