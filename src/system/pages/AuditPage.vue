<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, errorMessage, formatTime, type Id } from '../api'

type AuditLog = {
  adminId: Id
  action: string
  targetType: string
  targetId: string
  detail: string | null
  createdAt: string
}

const logs = ref<AuditLog[]>([])
const limit = ref(100)
const loading = ref(false)
const error = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    logs.value = await api.get<AuditLog[]>(`/platform/audit-logs?limit=${limit.value}`)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="card">
    <div class="toolbar">
      <select v-model.number="limit" @change="load">
        <option :value="50">最近 50 条</option>
        <option :value="100">最近 100 条</option>
        <option :value="200">最近 200 条</option>
      </select>
      <button class="btn btn-sm" :disabled="loading" @click="load">
        {{ loading ? '加载中…' : '刷新' }}
      </button>
      <div class="spacer" />
      <span class="tag-note">记录运营侧全部写操作</span>
    </div>

    <div v-if="error" class="error-bar">{{ error }}</div>

    <table class="table">
      <thead>
        <tr>
          <th style="width: 150px">时间</th>
          <th style="width: 170px">操作人</th>
          <th style="width: 200px">动作</th>
          <th style="width: 120px">对象类型</th>
          <th style="width: 190px">对象 ID</th>
          <th>详情</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(log, index) in logs" :key="`${log.adminId}-${log.createdAt}-${index}`">
          <td class="muted">{{ formatTime(log.createdAt) }}</td>
          <td class="mono">{{ log.adminId }}</td>
          <td><span class="badge blue">{{ log.action }}</span></td>
          <td>{{ log.targetType }}</td>
          <td class="mono">{{ log.targetId }}</td>
          <td class="muted">{{ log.detail || '—' }}</td>
        </tr>
        <tr v-if="!logs.length">
          <td colspan="6" class="empty">{{ loading ? '加载中…' : '暂无审计记录' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
