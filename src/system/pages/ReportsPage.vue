<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, errorMessage, formatTime, type Id } from '../api'

type Report = {
  reportId: Id
  reporterId: Id
  targetType: string
  targetId: string
  reason: string
  detail: string | null
  status: string
  handledBy: Id | null
  handledAt: string | null
  createdAt: string
}

const status = ref('PENDING')
const reports = ref<Report[]>([])
const loading = ref(false)
const error = ref('')

const statusLabel: Record<string, string> = {
  PENDING: '待处理',
  PROCESSING: '处理中',
  HANDLED: '已处理',
  REJECTED: '已驳回',
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const query = status.value ? `?status=${status.value}&limit=50` : '?limit=50'
    reports.value = await api.get<Report[]>(`/platform/ops/reports${query}`)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

async function handle(report: Report, target: 'HANDLED' | 'REJECTED'): Promise<void> {
  const note = window.prompt(
    target === 'HANDLED' ? '处理结论（可留空）' : '驳回理由（可留空）',
    '',
  )
  if (note === null) return
  error.value = ''
  try {
    await api.post(`/platform/ops/reports/${report.reportId}/handle`, { status: target, note })
    await load()
  } catch (e) {
    error.value = errorMessage(e)
  }
}

onMounted(load)
</script>

<template>
  <div class="card">
    <div class="toolbar">
      <select v-model="status" @change="load">
        <option value="PENDING">待处理</option>
        <option value="PROCESSING">处理中</option>
        <option value="HANDLED">已处理</option>
        <option value="REJECTED">已驳回</option>
        <option value="">全部</option>
      </select>
      <span class="tag-note">共 {{ reports.length }} 条（最多 50 条）</span>
    </div>

    <div v-if="error" class="error-bar">{{ error }}</div>

    <table class="table">
      <thead>
        <tr>
          <th style="width: 150px">工单号</th>
          <th style="width: 110px">状态</th>
          <th style="width: 110px">对象类型</th>
          <th style="width: 190px">对象 ID</th>
          <th>举报原因</th>
          <th style="width: 150px">提交时间</th>
          <th style="width: 170px">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="report in reports" :key="report.reportId">
          <td class="mono">{{ report.reportId }}</td>
          <td>
            <span class="badge" :class="report.status === 'PENDING' ? 'amber' : 'green'">
              {{ statusLabel[report.status] ?? report.status }}
            </span>
          </td>
          <td>{{ report.targetType }}</td>
          <td class="mono">{{ report.targetId }}</td>
          <td>
            {{ report.reason }}
            <div v-if="report.detail" class="tag-note">{{ report.detail }}</div>
          </td>
          <td class="muted">{{ formatTime(report.createdAt) }}</td>
          <td>
            <div v-if="report.status === 'PENDING' || report.status === 'PROCESSING'" class="row-actions">
              <button class="btn btn-sm btn-primary" @click="handle(report, 'HANDLED')">已处理</button>
              <button class="btn btn-sm" @click="handle(report, 'REJECTED')">驳回</button>
            </div>
            <span v-else class="tag-note">处理人 {{ report.handledBy ?? '—' }}</span>
          </td>
        </tr>
        <tr v-if="!reports.length">
          <td colspan="7" class="empty">{{ loading ? '加载中…' : '当前筛选条件下没有工单' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
