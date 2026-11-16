<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { LogOut, Save, Shield, Smartphone, Loader2, User } from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'
import { initialsOf, relativeTime } from '../utils/present'

type Profile = { userId: number; username: string; nickname: string; avatar?: string | null; createdAt?: string }
type Privacy = {
  searchByPhone: boolean
  searchByUsername: boolean
  friendPolicy: string
  showOnline: boolean
  readReceipt: boolean
  invitedToGroup: boolean
}
type Device = { deviceId: string; platform: string; deviceName?: string; lastActiveAt?: string }

const auth = useAuthStore()
const chat = useChatStore()

const profile = ref<Profile | null>(null)
const privacy = ref<Privacy | null>(null)
const devices = ref<Device[]>([])
const nickname = ref('')
const loading = ref(true)
const saving = ref(false)
const message = ref('')
const error = ref('')

const policyLabel: Record<string, string> = {
  REJECT: '拒绝所有人',
  VERIFY: '需要验证',
  DIRECT: '直接通过',
}

async function load() {
  loading.value = true
  try {
    const [p, pr, d] = await Promise.all([
      api.get<Profile>('/users/me'),
      api.get<Privacy>('/users/me/privacy'),
      api.get<Device[]>('/users/me/devices').catch(() => [] as Device[]),
    ])
    profile.value = p
    nickname.value = p.nickname
    privacy.value = pr
    devices.value = Array.isArray(d) ? d : []
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function saveNickname() {
  if (!nickname.value.trim() || nickname.value === profile.value?.nickname) return
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    await api.post('/users/me', { nickname: nickname.value.trim() })
    message.value = '昵称已更新'
    if (profile.value) profile.value.nickname = nickname.value.trim()
  } catch (e) {
    // PUT 才是正确方法，失败时回退
    try {
      await fetch('/api/v1/users/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('veryal.token') ?? ''}`,
        },
        body: JSON.stringify({ nickname: nickname.value.trim() }),
      })
      message.value = '昵称已更新'
      if (profile.value) profile.value.nickname = nickname.value.trim()
    } catch {
      error.value = e instanceof Error ? e.message : '保存失败'
    }
  } finally {
    saving.value = false
  }
}

async function savePrivacy(patch: Partial<Privacy>) {
  if (!privacy.value) return
  const next = { ...privacy.value, ...patch }
  privacy.value = next
  try {
    await fetch('/api/v1/users/me/privacy', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('veryal.token') ?? ''}`,
      },
      body: JSON.stringify(patch),
    })
    message.value = '隐私设置已保存'
  } catch {
    error.value = '隐私设置保存失败'
  }
}

function logout() {
  chat.reset()
  auth.logout()
  window.location.href = '/login'
}

onMounted(load)
</script>

<template>
  <div class="me">
    <div class="me-inner">
      <div v-if="loading" class="me-loading">
        <Loader2 :size="18" class="spin" style="color: var(--ink-3)" />
        正在加载…
      </div>

      <template v-else>
        <div class="me-card hero">
          <AppAvatar :initials="initialsOf(profile?.nickname || '我')" tone="jade" size="xl" />
          <div class="hero-text">
            <p class="hero-name">{{ profile?.nickname }}</p>
            <p class="hero-sub">@{{ profile?.username }} · ID {{ profile?.userId }}</p>
          </div>
        </div>

        <div class="me-card">
          <p class="card-label"><User :size="11" :stroke-width="2.4" /> 个人资料</p>
          <label class="field">
            <span class="field-label">昵称</span>
            <input v-model="nickname" class="field-input" placeholder="输入新昵称" />
          </label>
          <button class="primary" :disabled="saving" @click="saveNickname">
            <Loader2 v-if="saving" :size="13" class="spin" />
            <Save v-else :size="13" :stroke-width="2" />
            保存昵称
          </button>
        </div>

        <div v-if="privacy" class="me-card">
          <p class="card-label"><Shield :size="11" :stroke-width="2.4" /> 隐私设置</p>

          <label class="switch-row">
            <span>允许按用户名搜索到我</span>
            <input
              type="checkbox"
              class="switch"
              :checked="privacy.searchByUsername"
              @change="savePrivacy({ searchByUsername: ($event.target as HTMLInputElement).checked })"
            />
          </label>

          <label class="switch-row">
            <span>展示在线状态</span>
            <input
              type="checkbox"
              class="switch"
              :checked="privacy.showOnline"
              @change="savePrivacy({ showOnline: ($event.target as HTMLInputElement).checked })"
            />
          </label>

          <label class="switch-row">
            <span>发送已读回执</span>
            <input
              type="checkbox"
              class="switch"
              :checked="privacy.readReceipt"
              @change="savePrivacy({ readReceipt: ($event.target as HTMLInputElement).checked })"
            />
          </label>

          <label class="switch-row">
            <span>加好友策略</span>
            <select
              class="select"
              :value="privacy.friendPolicy"
              @change="savePrivacy({ friendPolicy: ($event.target as HTMLSelectElement).value })"
            >
              <option v-for="(label, key) in policyLabel" :key="key" :value="key">
                {{ label }}
              </option>
            </select>
          </label>
        </div>

        <div class="me-card">
          <p class="card-label"><Smartphone :size="11" :stroke-width="2.4" /> 登录设备 · {{ devices.length }}</p>
          <div v-for="d in devices" :key="d.deviceId" class="device-row">
            <span class="device-main">
              <span class="device-name">{{ d.deviceName || d.deviceId }}</span>
              <span class="device-sub">{{ d.platform }} · {{ relativeTime(d.lastActiveAt ?? null) }}</span>
            </span>
          </div>
          <p v-if="!devices.length" class="device-empty">暂无设备记录</p>
        </div>

        <p v-if="message" class="toast-ok">{{ message }}</p>
        <p v-if="error" class="toast-err">{{ error }}</p>

        <button class="danger" @click="logout">
          <LogOut :size="14" :stroke-width="2" />
          退出登录
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.me { height: 100%; overflow-y: auto; background: var(--canvas); }
.me-inner { max-width: 560px; margin: 0 auto; padding: 26px 20px 40px; display: flex; flex-direction: column; gap: 14px; }
.me-loading { display: flex; align-items: center; gap: 8px; justify-content: center; padding: 60px; color: var(--ink-3); font-size: 12.5px; }
.me-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.me-card.hero { flex-direction: row; align-items: center; gap: 14px; }
.hero-name { font-size: 17px; font-weight: 680; letter-spacing: -0.3px; }
.hero-sub { font-size: 11.5px; color: var(--ink-3); }
.card-label { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 660; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink-3); }
.field { display: flex; flex-direction: column; gap: 5px; }
.field-label { font-size: 10.5px; font-weight: 640; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
.field-input { height: 36px; padding: 0 11px; border-radius: var(--r-sm); background: var(--surface-3); border: 1px solid transparent; font-size: 13.5px; }
.field-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); background: var(--surface); }
.switch-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; padding: 4px 0; }
.switch { appearance: none; width: 38px; height: 22px; border-radius: var(--r-full); background: var(--line-strong); position: relative; cursor: pointer; transition: background var(--dur-2) var(--ease-out); flex-shrink: 0; }
.switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: var(--shadow-xs); transition: transform var(--dur-2) var(--ease-spring); }
.switch:checked { background: var(--accent); }
.switch:checked::after { transform: translateX(16px); }
.select { height: 30px; padding: 0 8px; border-radius: var(--r-sm); border: 1px solid var(--line); background: var(--surface-2); font-size: 12px; }
.device-row { display: flex; align-items: center; padding: 6px 0; border-top: 1px solid var(--line); }
.device-row:first-of-type { border-top: 0; }
.device-main { display: flex; flex-direction: column; }
.device-name { font-size: 12.5px; font-weight: 560; }
.device-sub { font-size: 10.5px; color: var(--ink-3); }
.device-empty { font-size: 11.5px; color: var(--ink-4); }
.primary, .danger { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; border-radius: var(--r-sm); font-size: 13px; font-weight: 620; }
.primary { background: var(--accent-grad); color: #fff; box-shadow: 0 3px 12px -5px var(--accent); }
.danger { background: var(--danger-soft); color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger) 26%, transparent); }
.toast-ok { font-size: 11.5px; color: var(--accent-ink); background: var(--accent-soft); padding: 7px 10px; border-radius: var(--r-sm); }
.toast-err { font-size: 11.5px; color: var(--danger); background: var(--danger-soft); padding: 7px 10px; border-radius: var(--r-sm); }
.spin { animation: tick-spin 900ms linear infinite; }
</style>
