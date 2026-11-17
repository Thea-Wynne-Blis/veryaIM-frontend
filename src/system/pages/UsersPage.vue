<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Search } from 'lucide-vue-next'
import { api, errorMessage, formatTime, type Id } from '../api'

type OpsUser = {
  userId: Id
  username: string
  nickname: string
  avatar: string | null
  status: string
  createdAt: string
}

const keyword = ref('')
const users = ref<OpsUser[]>([])
const loading = ref(false)
const error = ref('')
const acting = ref<string>('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const query = keyword.value.trim()
    users.value = await api.get<OpsUser[]>(
      `/platform/ops/users?keyword=${encodeURIComponent(query)}&limit=50`,
    )
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

async function act(user: OpsUser, path: string, label: string): Promise<void> {
  if (!window.confirm(`确认对「${user.nickname || user.username}」执行${label}？`)) return
  acting.value = String(user.userId)
  error.value = ''
  try {
    await api.post(`/platform/ops/users/${user.userId}${path}`, {})
    await load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    acting.value = ''
  }
}

async function mute(user: OpsUser): Promise<void> {
  const raw = window.prompt('禁言时长（分钟）', '60')
  if (raw === null) return
  const minutes = Number(raw)
  if (!Number.isFinite(minutes) || minutes <= 0) {
    error.value = '禁言时长必须是正整数分钟'
    return
  }
  acting.value = String(user.userId)
  error.value = ''
  try {
    await api.post(`/platform/ops/users/${user.userId}/mute`, { minutes, reason: '运营后台手动禁言' })
    await load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    acting.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="card">
    <div class="toolbar">
      <input
        v-model="keyword"
        type="text"
        placeholder="按用户名 / 昵称搜索"
        style="width: 240px"
        @keyup.enter="load"
      />
      <button class="btn btn-primary" :disabled="loading" @click="load">
        <Search :size="14" style="vertical-align: -2px" />
        {{ loading ? '查询中…' : '搜索' }}
      </button>
      <div class="spacer" />
      <span class="tag-note">共 {{ users.length }} 条（最多 50 条）</span>
    </div>

    <div v-if="error" class="error-bar">{{ error }}</div>

    <table class="table">
      <thead>
        <tr>
          <th style="width: 190px">用户 ID</th>
          <th>用户名</th>
          <th>昵称</th>
          <th style="width: 90px">状态</th>
          <th style="width: 150px">注册时间</th>
          <th style="width: 260px">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="user in users" :key="user.userId">
          <td class="mono">{{ user.userId }}</td>
          <td>{{ user.username }}</td>
          <td>{{ user.nickname || '—' }}</td>
          <td>
            <span class="badge" :class="user.status === 'ACTIVE' ? 'green' : 'red'">
              {{ user.status === 'ACTIVE' ? '正常' : '已封禁' }}
            </span>
          </td>
          <td class="muted">{{ formatTime(user.createdAt) }}</td>
          <td>
            <div class="row-actions">
              <button
                v-if="user.status === 'ACTIVE'"
                class="btn btn-sm btn-danger"
                :disabled="acting === String(user.userId)"
                @click="act(user, '/ban', '封禁')"
              >
                封禁
              </button>
              <button
                v-else
                class="btn btn-sm"
                :disabled="acting === String(user.userId)"
                @click="act(user, '/unban', '解封')"
              >
                解封
              </button>
              <button class="btn btn-sm" :disabled="acting === String(user.userId)" @click="mute(user)">
                禁言
              </button>
              <button
                class="btn btn-sm"
                :disabled="acting === String(user.userId)"
                @click="act(user, '/unmute', '解除禁言')"
              >
                解禁
              </button>
            </div>
          </td>
        </tr>
        <tr v-if="!users.length">
          <td colspan="6" class="empty">{{ loading ? '加载中…' : '没有匹配的用户' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
