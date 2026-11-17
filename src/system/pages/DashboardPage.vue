<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { api, errorMessage, formatTime } from '../api'

type Dashboard = {
  users: number | string
  groups: number | string
  messages: number | string
  pendingReports: number | string
}

const stats = ref<Dashboard | null>(null)
const loading = ref(false)
const error = ref('')
const refreshedAt = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    stats.value = await api.get<Dashboard>('/platform/ops/dashboard')
    refreshedAt.value = formatTime(new Date().toISOString())
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)

const cards = [
  { key: 'users', label: '注册用户', hint: '全平台累计' },
  { key: 'groups', label: '群组', hint: '当前存活群' },
  { key: 'messages', label: '消息', hint: '历史落库总量' },
  { key: 'pendingReports', label: '待处理举报', hint: '需要人工介入' },
] as const
</script>

<template>
  <div class="page-grid">
    <div v-if="error" class="error-bar" style="margin: 0">{{ error }}</div>

    <div class="grid-stats">
      <div v-for="card in cards" :key="card.key" class="card stat">
        <div class="stat-label">{{ card.label }}</div>
        <div class="stat-value">{{ stats ? stats[card.key] : '—' }}</div>
        <div class="stat-hint">{{ card.hint }}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>数据概览</h2>
        <span class="tag-note">请求时快照，不做实时推送</span>
        <div style="flex: 1" />
        <span v-if="refreshedAt" class="tag-note">更新于 {{ refreshedAt }}</span>
        <button class="btn btn-sm" :disabled="loading" @click="load">
          <RefreshCw :size="14" style="vertical-align: -2px" />
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </div>
      <div class="card-body muted" style="font-size: 13px; line-height: 1.8">
        当前页面一次性拉取统计；后续若需要「在线人数 / 吞吐曲线」这类持续变化的数据，
        再接入 SSE 只读流（不占用 IM 的 WebSocket 通道）。
      </div>
    </div>
  </div>
</template>
