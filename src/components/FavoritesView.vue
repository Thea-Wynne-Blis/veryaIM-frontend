<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { messageOf } from '../utils/error'
import { useToast } from '../composables/useToast'
import {
  Star, Search, Loader2, RefreshCw, Download, Trash2,
  FileText, Image as ImageIcon, Film, Mic, CornerDownLeft,
} from 'lucide-vue-next'
import { api, downloadFile, type Favorite, type Id } from '../api/client'
import { humanBytes, listTime } from '../utils/present'

const emit = defineEmits<{
  (e: 'open-conversation', conversationId: string, messageId?: string): void
}>()

const rows = ref<Favorite[]>([])
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const downloading = ref<Id | null>(null)
const removing = ref<Id | null>(null)
const { message: notice, show: flash } = useToast()

const filtered = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return rows.value
  return rows.value.filter((row) =>
    [row.fileName, row.text, row.senderName, row.conversationTitle]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  )
})

function iconOf(type: string) {
  if (type === 'IMAGE') return ImageIcon
  if (type === 'VIDEO') return Film
  if (type === 'AUDIO') return Mic
  return type === 'FILE' ? FileText : Star
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.get<Favorite[]>('/favorites?limit=200')
    rows.value = Array.isArray(data) ? data : []
  } catch (e) {
    error.value = messageOf(e, '加载收藏失败')
  } finally {
    loading.value = false
  }
}

async function download(row: Favorite) {
  if (!row.fileId) return
  downloading.value = row.fileId
  try {
    await downloadFile(row.fileId, row.fileName || '收藏文件')
  } catch (e) {
    error.value = messageOf(e, '下载失败')
  } finally {
    downloading.value = null
  }
}

async function remove(row: Favorite) {
  removing.value = row.id
  error.value = ''
  try {
    await api.delete<null>(`/favorites/${row.id}`)
    rows.value = rows.value.filter((item) => item.id !== row.id)
    flash('已取消收藏')
  } catch (e) {
    error.value = messageOf(e, '取消收藏失败')
  } finally {
    removing.value = null
  }
}

function open(row: Favorite) {
  emit('open-conversation', row.conversationId, String(row.messageId))
}

onMounted(load)
</script>

<template>
  <div class="favorites">
    <header class="fav-head">
      <div>
        <p class="eyebrow">收藏</p>
        <h1 class="fav-title">我的收藏</h1>
      </div>
      <div class="head-right">
        <label class="search fav-search">
          <Search class="search-icon" :size="14" :stroke-width="2" />
          <input
            v-model="keyword"
            type="search"
            placeholder="搜索收藏"
            aria-label="搜索收藏"
          />
        </label>
        <div class="stat-chip">{{ rows.length }} 条</div>
        <button class="icon-btn sm" title="刷新" :disabled="loading" @click="load">
          <Loader2 v-if="loading" :size="14" class="spin" />
          <RefreshCw v-else :size="14" :stroke-width="2" />
        </button>
      </div>
    </header>

    <div class="fav-body">
      <p v-if="error" class="fav-error">{{ error }}</p>
      <p v-if="notice" class="fav-notice">{{ notice }}</p>

      <div v-if="filtered.length" class="fav-card">
        <div
          v-for="(row, index) in filtered"
          :key="row.id"
          class="fav-row"
          :style="{ animation: `fade-up 320ms var(--ease-out) ${index * 22}ms backwards` }"
        >
          <span class="fav-icon">
            <component :is="iconOf(row.type)" :size="15" :stroke-width="1.9" />
          </span>
          <button class="fav-main" @click="open(row)">
            <span class="fav-name">
              {{ row.type === 'TEXT' || row.type === 'EMOJI' ? row.text : row.fileName || '[附件]' }}
            </span>
            <span class="fav-sub">
              {{ row.senderName }} · {{ row.conversationTitle }}
              <span v-if="row.sizeBytes" class="num">· {{ humanBytes(row.sizeBytes) }}</span>
            </span>
            <span class="fav-time num">{{ listTime(row.createdAt) }}</span>
          </button>
          <button
            v-if="row.fileId"
            class="fav-action"
            title="下载"
            :disabled="downloading !== null"
            @click="download(row)"
          >
            <Loader2 v-if="downloading === row.fileId" :size="14" class="spin" />
            <Download v-else :size="14" :stroke-width="1.9" />
          </button>
          <button
            class="fav-action"
            title="回到原会话"
            @click="open(row)"
          >
            <CornerDownLeft :size="14" :stroke-width="1.9" />
          </button>
          <button
            class="fav-action danger"
            title="取消收藏"
            :disabled="removing !== null"
            @click="remove(row)"
          >
            <Loader2 v-if="removing === row.id" :size="14" class="spin" />
            <Trash2 v-else :size="14" :stroke-width="1.9" />
          </button>
        </div>
      </div>

      <div v-else-if="!loading" class="empty">
        <div class="empty-mark"><Star :size="22" :stroke-width="1.6" /></div>
        <h3 class="empty-title">{{ keyword.trim() ? '没有匹配的收藏' : '还没有收藏' }}</h3>
        <p class="empty-text">
          在聊天里右键消息（或长按）选「收藏」，之后就能在这里随时找回来。
          原消息被撤回也不影响查看。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.favorites {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--canvas);
  overflow: hidden;
}
.fav-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px 13px;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--canvas) 84%, transparent);
  backdrop-filter: blur(14px);
}
.fav-title { font-size: 18px; font-weight: 690; letter-spacing: -0.4px; margin-top: 2px; }
.head-right { display: flex; align-items: center; gap: 6px; }
.fav-search { width: 190px; }
.fav-body { flex: 1; overflow-y: auto; padding: 16px 22px 30px; }
.fav-error {
  margin-bottom: 12px;
  padding: 8px 11px;
  border-radius: var(--r-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 11.5px;
}
.fav-notice {
  margin-bottom: 12px;
  padding: 8px 11px;
  border-radius: var(--r-sm);
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: 11.5px;
}
.fav-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}
.fav-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  text-align: left;
}
.fav-row + .fav-row { border-top: 1px solid var(--line); }
.fav-row:hover { background: var(--surface-hover); }
.fav-icon {
  width: 34px;
  height: 34px;
  border-radius: var(--r-sm);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--accent-ink);
  background: var(--accent-soft);
}
.fav-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}
.fav-name {
  font-size: 13px;
  font-weight: 570;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fav-sub {
  font-size: 10.5px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fav-time { font-size: 9.5px; color: var(--ink-3); }
.fav-action {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: var(--r-xs);
  color: var(--ink-3);
  flex-shrink: 0;
}
.fav-action:hover { background: var(--accent-soft); color: var(--accent); }
.fav-action.danger:hover { background: var(--danger-soft); color: var(--danger); }
.spin { animation: tick-spin 900ms linear infinite; }
</style>
