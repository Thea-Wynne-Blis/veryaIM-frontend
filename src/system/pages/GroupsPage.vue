<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Search } from 'lucide-vue-next'
import { api, errorMessage, formatTime, type Id } from '../api'

type Group = {
  groupId: Id
  name: string
  ownerId: Id
  memberCount: number | string
  createdAt: string
}

type Member = { userId: Id; nickname: string; avatar: string | null; role: string; joinedAt: string }
type GroupDetail = { groupId: Id; name: string; ownerId: Id; createdAt: string; members: Member[] }

const keyword = ref('')
const groups = ref<Group[]>([])
const loading = ref(false)
const error = ref('')
const detail = ref<GroupDetail | null>(null)
const detailId = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    groups.value = await api.get<Group[]>(
      `/platform/ops/groups?keyword=${encodeURIComponent(keyword.value.trim())}&limit=50`,
    )
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

async function open(group: Group): Promise<void> {
  if (detailId.value === String(group.groupId)) {
    detail.value = null
    detailId.value = ''
    return
  }
  error.value = ''
  try {
    detail.value = await api.get<GroupDetail>(`/platform/ops/groups/${group.groupId}`)
    detailId.value = String(group.groupId)
  } catch (e) {
    error.value = errorMessage(e)
  }
}

async function disband(group: Group): Promise<void> {
  if (!window.confirm(`确认强制解散群「${group.name}」？该操作不可撤销。`)) return
  error.value = ''
  try {
    await api.post(`/platform/ops/groups/${group.groupId}/disband`, { reason: '运营后台强制解散' })
    if (detailId.value === String(group.groupId)) {
      detail.value = null
      detailId.value = ''
    }
    await load()
  } catch (e) {
    error.value = errorMessage(e)
  }
}

onMounted(load)
</script>

<template>
  <div class="page-grid">
    <div class="card">
      <div class="toolbar">
        <input
          v-model="keyword"
          type="text"
          placeholder="按群名搜索"
          style="width: 240px"
          @keyup.enter="load"
        />
        <button class="btn btn-primary" :disabled="loading" @click="load">
          <Search :size="14" style="vertical-align: -2px" />
          {{ loading ? '查询中…' : '搜索' }}
        </button>
        <div class="spacer" />
        <span class="tag-note">共 {{ groups.length }} 条（最多 50 条）</span>
      </div>

      <div v-if="error" class="error-bar">{{ error }}</div>

      <table class="table">
        <thead>
          <tr>
            <th style="width: 190px">群 ID</th>
            <th>群名</th>
            <th style="width: 190px">群主 ID</th>
            <th style="width: 80px">成员数</th>
            <th style="width: 150px">创建时间</th>
            <th style="width: 180px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="group in groups" :key="group.groupId">
            <td class="mono">{{ group.groupId }}</td>
            <td>{{ group.name }}</td>
            <td class="mono">{{ group.ownerId }}</td>
            <td>{{ group.memberCount }}</td>
            <td class="muted">{{ formatTime(group.createdAt) }}</td>
            <td>
              <div class="row-actions">
                <button class="btn btn-sm" @click="open(group)">
                  {{ detailId === String(group.groupId) ? '收起' : '成员' }}
                </button>
                <button class="btn btn-sm btn-danger" @click="disband(group)">解散</button>
              </div>
            </td>
          </tr>
          <tr v-if="!groups.length">
            <td colspan="6" class="empty">{{ loading ? '加载中…' : '没有匹配的群组' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="detail" class="card">
      <div class="card-head">
        <h2>{{ detail.name }} · 成员（{{ detail.members.length }}）</h2>
        <div style="flex: 1" />
        <span class="tag-note mono">{{ detail.groupId }}</span>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th style="width: 190px">用户 ID</th>
            <th>昵称</th>
            <th style="width: 120px">群内角色</th>
            <th style="width: 150px">加入时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="member in detail.members" :key="member.userId">
            <td class="mono">{{ member.userId }}</td>
            <td>{{ member.nickname || '—' }}</td>
            <td><span class="badge blue">{{ member.role }}</span></td>
            <td class="muted">{{ formatTime(member.joinedAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
