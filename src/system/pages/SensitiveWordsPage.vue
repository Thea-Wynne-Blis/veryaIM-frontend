<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, errorMessage, formatTime, type Id } from '../api'

type SensitiveWord = { id: Id; word: string; createdAt: string }

const words = ref<SensitiveWord[]>([])
const draft = ref('')
const loading = ref(false)
const busy = ref(false)
const error = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    words.value = await api.get<SensitiveWord[]>('/platform/ops/sensitive-words?limit=200')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

async function add(): Promise<void> {
  const word = draft.value.trim()
  if (!word) return
  busy.value = true
  error.value = ''
  try {
    await api.post('/platform/ops/sensitive-words', { word })
    draft.value = ''
    await load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

async function remove(entry: SensitiveWord): Promise<void> {
  if (!window.confirm(`确认删除敏感词「${entry.word}」？`)) return
  error.value = ''
  try {
    await api.del(`/platform/ops/sensitive-words/${entry.id}`)
    await load()
  } catch (e) {
    error.value = errorMessage(e)
  }
}

onMounted(load)
</script>

<template>
  <div class="card">
    <div class="form-inline">
      <div class="field" style="flex: 1; min-width: 220px">
        <span>新增敏感词（写入后立即生效，命中直接拒绝发送）</span>
        <input v-model="draft" type="text" maxlength="64" placeholder="例如：违禁词" @keyup.enter="add" />
      </div>
      <button class="btn btn-primary" :disabled="busy || !draft.trim()" @click="add">添加</button>
    </div>

    <div v-if="error" class="error-bar">{{ error }}</div>

    <table class="table">
      <thead>
        <tr>
          <th style="width: 190px">ID</th>
          <th>敏感词</th>
          <th style="width: 170px">创建时间</th>
          <th style="width: 90px">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in words" :key="entry.id">
          <td class="mono">{{ entry.id }}</td>
          <td>{{ entry.word }}</td>
          <td class="muted">{{ formatTime(entry.createdAt) }}</td>
          <td>
            <button class="btn btn-sm btn-danger" @click="remove(entry)">删除</button>
          </td>
        </tr>
        <tr v-if="!words.length">
          <td colspan="4" class="empty">{{ loading ? '加载中…' : '词库为空' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
