<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, adminAuth, errorMessage, formatTime, type Id } from '../api'

type Admin = {
  adminId: Id
  username: string
  displayName: string
  role: string
  status: string
  createdAt: string
  lastLoginAt: string | null
}

const admins = ref<Admin[]>([])
const loading = ref(false)
const error = ref('')
const showCreate = ref(false)
const form = ref({ username: '', password: '', displayName: '', role: 'SUPPORT' })
const busy = ref(false)

const selfId = adminAuth.profile()?.adminId

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    admins.value = await api.get<Admin[]>('/platform/admins')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

async function create(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    await api.post('/platform/admins', {
      username: form.value.username.trim(),
      password: form.value.password,
      displayName: form.value.displayName.trim() || undefined,
      role: form.value.role,
    })
    form.value = { username: '', password: '', displayName: '', role: 'SUPPORT' }
    showCreate.value = false
    await load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

async function toggle(admin: Admin): Promise<void> {
  const disable = admin.status === 'ACTIVE'
  if (!window.confirm(`确认${disable ? '停用' : '启用'}管理员「${admin.username}」？`)) return
  error.value = ''
  try {
    await api.post(`/platform/admins/${admin.adminId}/${disable ? 'disable' : 'enable'}`)
    await load()
  } catch (e) {
    error.value = errorMessage(e)
  }
}

async function resetPassword(admin: Admin): Promise<void> {
  const password = window.prompt(`为「${admin.username}」设置新密码（8-64 位）`, '')
  if (!password) return
  error.value = ''
  try {
    await api.post(`/platform/admins/${admin.adminId}/password`, { password })
    window.alert('密码已重置')
  } catch (e) {
    error.value = errorMessage(e)
  }
}

async function changeRole(admin: Admin): Promise<void> {
  const next = window.prompt('输入新角色：PLATFORM_ADMIN（全部权限）或 SUPPORT（只读）', admin.role)
  if (!next) return
  error.value = ''
  try {
    await api.post(`/platform/admins/${admin.adminId}/role`, { role: next.trim().toUpperCase() })
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
        <button class="btn btn-primary" @click="showCreate = !showCreate">
          {{ showCreate ? '取消' : '新建管理员' }}
        </button>
        <div class="spacer" />
        <span class="tag-note">共 {{ admins.length }} 个运营账号</span>
      </div>

      <div v-if="showCreate" class="form-inline">
        <div class="field">
          <span>用户名</span>
          <input v-model="form.username" type="text" placeholder="3-32 位字母数字下划线" />
        </div>
        <div class="field">
          <span>初始密码</span>
          <input v-model="form.password" type="password" placeholder="8-64 位" />
        </div>
        <div class="field">
          <span>显示名</span>
          <input v-model="form.displayName" type="text" placeholder="可留空" />
        </div>
        <div class="field">
          <span>角色</span>
          <select v-model="form.role">
            <option value="SUPPORT">SUPPORT（只读）</option>
            <option value="PLATFORM_ADMIN">PLATFORM_ADMIN（全部）</option>
          </select>
        </div>
        <button class="btn btn-primary" :disabled="busy" @click="create">创建</button>
      </div>

      <div v-if="error" class="error-bar">{{ error }}</div>

      <table class="table">
        <thead>
          <tr>
            <th style="width: 190px">管理员 ID</th>
            <th>用户名</th>
            <th>显示名</th>
            <th style="width: 150px">角色</th>
            <th style="width: 90px">状态</th>
            <th style="width: 150px">最后登录</th>
            <th style="width: 220px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="admin in admins" :key="admin.adminId">
            <td class="mono">{{ admin.adminId }}</td>
            <td>
              {{ admin.username }}
              <span v-if="String(admin.adminId) === String(selfId)" class="badge blue">当前</span>
            </td>
            <td>{{ admin.displayName || '—' }}</td>
            <td><span class="badge" :class="admin.role === 'PLATFORM_ADMIN' ? 'blue' : ''">{{ admin.role }}</span></td>
            <td>
              <span class="badge" :class="admin.status === 'ACTIVE' ? 'green' : 'red'">
                {{ admin.status === 'ACTIVE' ? '启用' : '停用' }}
              </span>
            </td>
            <td class="muted">{{ formatTime(admin.lastLoginAt) }}</td>
            <td>
              <div class="row-actions">
                <button
                  class="btn btn-sm"
                  :disabled="String(admin.adminId) === String(selfId)"
                  @click="toggle(admin)"
                >
                  {{ admin.status === 'ACTIVE' ? '停用' : '启用' }}
                </button>
                <button class="btn btn-sm" @click="resetPassword(admin)">重置密码</button>
                <button
                  class="btn btn-sm"
                  :disabled="String(admin.adminId) === String(selfId)"
                  @click="changeRole(admin)"
                >
                  改角色
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!admins.length">
            <td colspan="7" class="empty">{{ loading ? '加载中…' : '暂无管理员' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
