<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { LogOut, Save, Shield, Smartphone, Loader2, Trash2, User } from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import {
  api,
  type DeviceInfo,
  type UserPrivacy,
  type UserProfile,
} from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'
import { initialsOf, relativeTime } from '../utils/present'

const auth = useAuthStore()
const chat = useChatStore()

const profile = ref<UserProfile | null>(null)
const privacy = ref<UserPrivacy | null>(null)
const devices = ref<DeviceInfo[]>([])
const nickname = ref('')
const loading = ref(true)
const saving = ref(false)
const privacyBusy = ref(false)
const removingDevice = ref<string | null>(null)
const message = ref('')
const error = ref('')

const policyLabel: Record<string, string> = {
  REJECT: '拒绝所有人',
  VERIFY: '需要验证',
  DIRECT: '直接通过',
}

function spot(event: PointerEvent) {
  const el = event.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--spot-x', `${event.clientX - rect.left}px`)
  el.style.setProperty('--spot-y', `${event.clientY - rect.top}px`)
}

function flash(text: string) {
  message.value = text
  window.setTimeout(() => (message.value = ''), 2200)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [p, pr, d] = await Promise.all([
      api.get<UserProfile>('/users/me'),
      api.get<UserPrivacy>('/users/me/privacy'),
      api.get<DeviceInfo[]>('/users/me/devices').catch(() => [] as DeviceInfo[]),
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
  const value = nickname.value.trim()
  if (!value || value === profile.value?.nickname) return
  saving.value = true
  error.value = ''
  try {
    // 修改资料只支持 PUT /users/me。
    const updated = await api.put<UserProfile>('/users/me', { nickname: value })
    profile.value = updated
    nickname.value = updated.nickname
    auth.updateUser({ nickname: updated.nickname, avatar: updated.avatar ?? auth.user?.avatar })
    flash('昵称已更新')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function savePrivacy(patch: Partial<UserPrivacy>) {
  if (!privacy.value || privacyBusy.value) return
  const before = privacy.value
  privacy.value = { ...before, ...patch } // 乐观更新
  privacyBusy.value = true
  error.value = ''
  try {
    const updated = await api.put<UserPrivacy>('/users/me/privacy', patch)
    privacy.value = updated
    flash('隐私设置已保存')
  } catch (e) {
    privacy.value = before // 失败回滚
    error.value = e instanceof Error ? e.message : '隐私设置保存失败'
  } finally {
    privacyBusy.value = false
  }
}

async function logout() {
  chat.reset()
  await auth.logout()
  window.location.href = '/login'
}

async function removeDevice(d: DeviceInfo) {
  if (d.current || removingDevice.value) return
  removingDevice.value = d.deviceId
  error.value = ''
  try {
    const removed = await api.delete<number>(`/users/me/devices/${encodeURIComponent(d.deviceId)}`)
    devices.value = devices.value.filter((item) => item.deviceId !== d.deviceId)
    flash(typeof removed === 'number' && removed > 1 ? `已移除 ${removed} 条设备记录` : '已移除该设备')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '移除设备失败'
  } finally {
    removingDevice.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="me">
    <div class="me-scroll">
      <div class="me-inner">
        <div v-if="loading" class="me-loading">
          <Loader2 :size="18" class="spin" style="color: var(--ink-3)" />
          正在加载…
        </div>

        <template v-else>
          <div v-if="error" class="toast-err" style="margin-bottom: 2px">{{ error }}</div>

          <div class="me-card hero glare">
            <AppAvatar :initials="initialsOf(profile?.nickname || '我')" tone="jade" size="xl" />
            <div class="hero-text">
              <p class="hero-name">{{ profile?.nickname }}</p>
              <p class="hero-sub">@{{ profile?.username }} · ID {{ profile?.userId }}</p>
              <p class="hero-sub">{{ profile?.online ? '在线' : '离线' }}</p>
            </div>
          </div>

          <div class="me-card spot" @pointermove="spot">
            <p class="card-label"><User :size="11" :stroke-width="2.4" /> 个人资料</p>
            <label class="field">
              <span class="field-label">昵称</span>
              <input
                v-model="nickname"
                class="field-input"
                placeholder="输入新昵称"
                maxlength="32"
                @keydown.enter="saveNickname"
              />
            </label>
            <button
              class="primary"
              :disabled="saving || !nickname.trim() || nickname.trim() === profile?.nickname"
              @click="saveNickname"
            >
              <Loader2 v-if="saving" :size="13" class="spin" />
              <Save v-else :size="13" :stroke-width="2" />
              保存昵称
            </button>
          </div>

          <div v-if="privacy" class="me-card" :class="{ busy: privacyBusy }">
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
              <span>允许按手机号搜索到我</span>
              <input
                type="checkbox"
                class="switch"
                :checked="privacy.searchByPhone"
                @change="savePrivacy({ searchByPhone: ($event.target as HTMLInputElement).checked })"
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
              <span>允许被邀请进群</span>
              <input
                type="checkbox"
                class="switch"
                :checked="privacy.invitedToGroup"
                @change="savePrivacy({ invitedToGroup: ($event.target as HTMLInputElement).checked })"
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

          <div class="me-card spot" @pointermove="spot">
            <p class="card-label"><Smartphone :size="11" :stroke-width="2.4" /> 登录设备 · {{ devices.length }}</p>
            <div v-for="d in devices" :key="d.deviceId" class="device-row">
              <span class="device-main">
                <span class="device-name">
                  {{ d.deviceName || d.deviceId }}
                  <span v-if="d.current" class="device-badge">当前设备</span>
                </span>
                <span class="device-sub">
                  {{ d.platform }} · 最近登录 {{ relativeTime(d.lastLoginAt ?? null) }}
                  <template v-if="(d.deviceCount ?? 1) > 1"> · {{ d.deviceCount }} 条记录</template>
                </span>
              </span>
              <button
                v-if="!d.current"
                class="device-remove"
                title="移除该设备"
                :disabled="removingDevice === d.deviceId"
                @click="removeDevice(d)"
              >
                <Loader2 v-if="removingDevice === d.deviceId" :size="12" class="spin" />
                <Trash2 v-else :size="13" :stroke-width="2" />
              </button>
            </div>
            <p v-if="!devices.length" class="device-empty">暂无设备记录</p>
          </div>

          <p v-if="message" class="toast-ok">{{ message }}</p>

          <button class="danger" @click="logout">
            <LogOut :size="14" :stroke-width="2" />
            退出登录
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.me { height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--canvas); }
.me-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.me-inner { max-width: 560px; margin: 0 auto; padding: 26px 20px 40px; display: flex; flex-direction: column; gap: 14px; }
.me-loading { display: flex; align-items: center; gap: 8px; justify-content: center; padding: 60px; color: var(--ink-3); font-size: 12.5px; }
.me-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.me-card.busy { opacity: 0.7; pointer-events: none; }
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
.device-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; border-top: 1px solid var(--line); }
.device-row:first-of-type { border-top: 0; }
.device-main { display: flex; flex-direction: column; min-width: 0; }
.device-name { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 560; }
.device-badge { font-size: 9.5px; font-weight: 650; letter-spacing: 0.04em; color: var(--accent-ink); background: var(--accent-soft); padding: 1px 6px; border-radius: var(--r-full); }
.device-sub { font-size: 10.5px; color: var(--ink-3); }
.device-remove { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; flex-shrink: 0; border-radius: var(--r-sm); color: var(--ink-3); transition: background var(--dur-2) var(--ease-out), color var(--dur-2) var(--ease-out); }
.device-remove:hover { background: var(--danger-soft); color: var(--danger); }
.device-remove:disabled { opacity: 0.5; cursor: default; background: none; color: var(--ink-3); }
.device-empty { font-size: 11.5px; color: var(--ink-4); }
.primary, .danger { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; border-radius: var(--r-sm); font-size: 13px; font-weight: 620; }
.primary { background: var(--accent-grad); color: #fff; box-shadow: 0 3px 12px -5px var(--accent); }
.primary:disabled { opacity: 0.55; box-shadow: none; cursor: default; }
.danger { background: var(--danger-soft); color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger) 26%, transparent); }
.toast-ok { font-size: 11.5px; color: var(--accent-ink); background: var(--accent-soft); padding: 7px 10px; border-radius: var(--r-sm); }
.toast-err { font-size: 11.5px; color: var(--danger); background: var(--danger-soft); padding: 7px 10px; border-radius: var(--r-sm); }
.spin { animation: tick-spin 900ms linear infinite; }
</style>
