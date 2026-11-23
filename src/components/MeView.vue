<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { messageOf } from '../utils/error'
import {
  LogOut, Save, Shield, Smartphone, Loader2, User, Languages,
  MapPin, PenLine, Moon, Sun, Star, ChevronRight, Camera, NotebookPen, Github,
  Image as ImageIcon,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import ChatBackgroundDialog from './ChatBackgroundDialog.vue'
import {
  api,
  uploadForm,
  type DeviceInfo,
  type UserPrivacy,
  type UserProfile,
} from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'
import { useTranslatePrefs } from '../composables/useTranslatePrefs'
import { useTheme } from '../composables/useTheme'
import { initialsOf, relativeTime } from '../utils/present'
import { squareAvatarFile, userAvatarSrc } from '../utils/avatar'

withDefaults(defineProps<{ showFavorites?: boolean; showNotes?: boolean }>(), {
  showFavorites: false,
  showNotes: false,
})
const emit = defineEmits<{ (e: 'favorites'): void; (e: 'notes'): void }>()

const auth = useAuthStore()
const chat = useChatStore()
const { theme, setTheme } = useTheme()
const {
  target: translateTarget,
  languages: translateLanguages,
  setTarget: setTranslateTarget,
} = useTranslatePrefs()

const profile = ref<UserProfile | null>(null)
const privacy = ref<UserPrivacy | null>(null)
const devices = ref<DeviceInfo[]>([])
const nickname = ref('')
const region = ref('')
const signature = ref('')
const loading = ref(true)
const saving = ref(false)
const privacyBusy = ref(false)
const message = ref('')
const error = ref('')
const avatarInput = ref<HTMLInputElement | null>(null)
const avatarBusy = ref(false)
/** 全局聊天背景：所有没有单独设置的会话都用它。 */
const backgroundOpen = ref(false)

/** 登录设备只展示当前设备，历史登录记录不在用户侧暴露。 */
const currentDevice = computed(() => devices.value.find((d) => d.current) ?? null)

/** 资料卡在线状态：后端 presence 与实时连接任一为真即视为在线。 */
const isOnline = computed(() => Boolean(profile.value?.online || chat.realtimeConnected))

/** 头像地址优先用后端返回的（带 ?v= 版本号），其次按用户 ID 推导。 */
const avatarSrc = computed(() => profile.value?.avatar || userAvatarSrc(profile.value?.userId))

/** 资料有改动才允许保存，避免无意义的请求。 */
const profileDirty = computed(() => {
  if (!profile.value) return false
  return (
    nickname.value.trim() !== (profile.value.nickname ?? '') ||
    region.value.trim() !== (profile.value.region ?? '') ||
    signature.value.trim() !== (profile.value.signature ?? '')
  )
})

const policyLabel: Record<string, string> = {
  REJECT: '拒绝所有人',
  VERIFY: '需要验证',
  DIRECT: '直接通过',
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
    region.value = p.region ?? ''
    signature.value = p.signature ?? ''
    privacy.value = pr
    devices.value = Array.isArray(d) ? d : []
  } catch (e) {
    error.value = messageOf(e, '加载失败')
  } finally {
    loading.value = false
  }
}

/** 资料卡、输入框与登录态一起更新，避免侧栏头像和设置页不一致。 */
function applyProfile(updated: UserProfile) {
  profile.value = updated
  nickname.value = updated.nickname
  region.value = updated.region ?? ''
  signature.value = updated.signature ?? ''
  auth.updateUser({
    nickname: updated.nickname,
    avatar: updated.avatar,
    region: updated.region,
    signature: updated.signature,
  })
}

/** 昵称、地区、个性签名一起提交，资料卡和设置页始终一致。 */
async function saveProfile() {
  const name = nickname.value.trim()
  if (!name || !profileDirty.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const updated = await api.put<UserProfile>('/users/me', {
      nickname: name,
      region: region.value.trim(),
      signature: signature.value.trim(),
    })
    applyProfile(updated)
    flash('个人资料已保存')
  } catch (e) {
    error.value = messageOf(e, '保存失败')
  } finally {
    saving.value = false
  }
}

function pickAvatar() {
  if (!avatarBusy.value) avatarInput.value?.click()
}

/** 选图后在浏览器里居中裁成 512 见方并压成 JPEG，服务端只做校验与落盘。 */
async function onAvatarPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || avatarBusy.value) return
  if (!file.type.startsWith('image/')) {
    error.value = '请选择图片文件'
    return
  }
  avatarBusy.value = true
  error.value = ''
  try {
    const cropped = await squareAvatarFile(file)
    const form = new FormData()
    form.append('file', cropped)
    applyProfile(await uploadForm<UserProfile>('/users/me/avatar', form))
    flash('头像已更新')
  } catch (e) {
    error.value = messageOf(e, '头像上传失败')
  } finally {
    avatarBusy.value = false
  }
}

async function removeAvatar() {
  if (avatarBusy.value) return
  avatarBusy.value = true
  error.value = ''
  try {
    await api.delete('/users/me/avatar')
    if (profile.value) profile.value = { ...profile.value, avatar: null }
    auth.updateUser({ avatar: null })
    flash('头像已移除')
  } catch (e) {
    error.value = messageOf(e, '移除头像失败')
  } finally {
    avatarBusy.value = false
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
    error.value = messageOf(e, '隐私设置保存失败')
  } finally {
    privacyBusy.value = false
  }
}

function chooseTranslateTarget(event: Event) {
  setTranslateTarget((event.target as HTMLSelectElement).value)
  flash('翻译语言已更新')
}

async function logout() {
  chat.reset()
  await auth.logout()
  window.location.href = '/login'
}

onMounted(load)
</script>

<template>
  <div class="me">
    <header class="me-head">
      <h1 class="me-title">我的</h1>
    </header>
    <div class="me-scroll">
      <div class="me-inner">
        <div v-if="loading" class="me-loading">
          <Loader2 :size="18" class="spin" style="color: var(--ink-3)" />
          正在加载…
        </div>

        <template v-else>
          <div v-if="error" class="toast-err" style="margin-bottom: 2px">{{ error }}</div>

          <div class="me-card hero">
            <div class="hero-avatar">
              <button
                class="hero-avatar-btn"
                type="button"
                :disabled="avatarBusy"
                :aria-label="profile?.avatar ? '更换头像' : '上传头像'"
                @click="pickAvatar"
              >
                <AppAvatar
                  :initials="initialsOf(profile?.nickname || '我')"
                  :src="avatarSrc"
                  tone="jade"
                  size="xl"
                />
                <span class="hero-avatar-mask">
                  <Loader2 v-if="avatarBusy" :size="16" class="spin" />
                  <Camera v-else :size="16" :stroke-width="2" />
                </span>
              </button>
              <input
                ref="avatarInput"
                type="file"
                accept="image/*"
                hidden
                @change="onAvatarPicked"
              />
            </div>
            <div class="hero-text">
              <p class="hero-name">{{ profile?.nickname }}</p>
              <p class="hero-sub">@{{ profile?.username }} · ID {{ profile?.userId }}</p>
              <p class="hero-bio" :class="{ placeholder: !profile?.signature }">
                {{ profile?.signature || '未设置个性签名' }}
              </p>
              <p class="hero-meta">
                <MapPin :size="11" :stroke-width="2" />
                {{ profile?.region || '未填写地区' }}
                <span class="dot">·</span>
                {{ isOnline ? '在线' : '离线' }}
                <button
                  v-if="profile?.avatar"
                  class="hero-remove"
                  type="button"
                  :disabled="avatarBusy"
                  @click="removeAvatar"
                >
                  移除头像
                </button>
              </p>
            </div>
          </div>

          <button v-if="showFavorites" class="me-favorites" @click="emit('favorites')"><Star :size="19" /><span>我的收藏</span><ChevronRight :size="18" /></button>
          <button v-if="showNotes" class="me-favorites" @click="emit('notes')"><NotebookPen :size="19" /><span>我的笔记</span><ChevronRight :size="18" /></button>
          <a v-if="showNotes" class="me-favorites" href="https://github.com/Thea-Wynne-Blis/veryaIM" target="_blank" rel="noopener noreferrer"><Github :size="19" /><span>GitHub 仓库</span><ChevronRight :size="18" /></a>

          <div class="me-settings">
            <div class="me-settings-stack">
              <div class="me-card">
                <p class="card-label"><User :size="11" :stroke-width="2.4" /> 个人资料</p>
                <label class="field">
                  <span class="field-label">昵称</span>
                  <input
                    v-model="nickname"
                    class="field-input"
                    placeholder="输入昵称"
                    maxlength="32"
                  />
                </label>
                <label class="field">
                  <span class="field-label"><MapPin :size="10" :stroke-width="2.4" /> 地区</span>
                  <input
                    v-model="region"
                    class="field-input"
                    placeholder="例如：北京 · 朝阳"
                    maxlength="64"
                  />
                </label>
                <label class="field">
                  <span class="field-label"><PenLine :size="10" :stroke-width="2.4" /> 个性签名</span>
                  <textarea
                    v-model="signature"
                    class="field-textarea"
                    rows="3"
                    maxlength="255"
                    placeholder="一句话介绍自己，好友点开你的资料卡就能看到"
                  />
                  <span class="field-count">{{ signature.length }}/255</span>
                </label>
                <button
                  class="primary"
                  :disabled="saving || !nickname.trim() || !profileDirty"
                  @click="saveProfile"
                >
                  <Loader2 v-if="saving" :size="13" class="spin" />
                  <Save v-else :size="13" :stroke-width="2" />
                  保存资料
                </button>
              </div>

              <div class="me-card">
                <h2 class="card-label">外观</h2>
                <div class="theme-options" role="group" aria-label="外观主题">
                  <button type="button" :aria-pressed="theme === 'light'" @click="setTheme('light')">
                    <Sun :size="17" aria-hidden="true" /> 浅色
                  </button>
                  <button type="button" :aria-pressed="theme === 'dark'" @click="setTheme('dark')">
                    <Moon :size="17" aria-hidden="true" /> 深色
                  </button>
                </div>
                <button type="button" class="appearance-row" @click="backgroundOpen = true">
                  <span><ImageIcon :size="16" />聊天背景</span>
                  <ChevronRight :size="16" />
                </button>
                <p class="card-hint">默认应用在所有聊天；单个会话可以在「聊天信息」里单独设置。</p>
              </div>

              <div class="me-card">
                <p class="card-label"><Languages :size="11" :stroke-width="2.4" /> 翻译</p>
                <label class="switch-row">
                  <span>译文目标语言</span>
                  <select class="select" :value="translateTarget" @change="chooseTranslateTarget">
                    <option v-for="lang in translateLanguages" :key="lang.code" :value="lang.code">
                      {{ lang.label }}
                    </option>
                  </select>
                </label>
                <p class="card-hint">在聊天里右键消息选「翻译」，译文按这里的语言显示。</p>
              </div>
            </div>
            <div class="me-settings-stack">
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

              <div class="me-card">
                <p class="card-label"><Smartphone :size="11" :stroke-width="2.4" /> 登录设备</p>
                <div v-if="currentDevice" class="device-row">
                  <span class="device-main">
                    <span class="device-name">
                      {{ currentDevice.deviceName || currentDevice.deviceId }}
                      <span class="device-badge">当前设备</span>
                    </span>
                    <span class="device-sub">
                      {{ currentDevice.platform }} · 最近登录 {{ relativeTime(currentDevice.lastLoginAt ?? null) }}
                    </span>
                  </span>
                </div>
                <p v-else class="device-empty">暂无设备记录</p>
              </div>
            </div>
          </div>

          <p v-if="message" class="toast-ok">{{ message }}</p>

          <button class="danger logout" @click="logout">
            <LogOut :size="14" :stroke-width="2" />
            退出登录
          </button>
        </template>
      </div>
    </div>
  </div>

  <ChatBackgroundDialog v-if="backgroundOpen" :conversation-id="null" @close="backgroundOpen = false" />
</template>

<style scoped>
.me-favorites { display: flex; align-items: center; gap: 12px; min-height: 58px; padding: 0 16px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); text-align: left; font-size: 15px; color: var(--ink); text-decoration: none; }
.me-favorites > svg:first-child { color: var(--accent); }
.me-favorites > span { flex: 1; }
.me-favorites > svg:last-child { color: var(--ink-3); }
.me { height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--canvas); }
.me-head { flex-shrink: 0; padding: 16px var(--view-gutter); border-bottom: 1px solid var(--line); background: var(--surface); }
.me-title { max-width: 880px; margin-inline: auto; font-size: var(--view-title-size); font-weight: 700; letter-spacing: -0.5px; }
.me-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.me-inner { max-width: 952px; margin: 0 auto; padding: 18px var(--view-gutter) 36px; display: flex; flex-direction: column; gap: 14px; }
.me-settings { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; gap: 14px; }
.me-settings-stack { display: flex; min-width: 0; flex-direction: column; gap: 14px; }
.me-loading { display: flex; align-items: center; gap: 8px; justify-content: center; padding: 60px; color: var(--ink-3); font-size: 12.5px; }
.me-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); min-width: 0; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.me-card.busy { opacity: 0.7; pointer-events: none; }
.me-card.hero { flex-direction: row; align-items: center; gap: 16px; padding: 19px; background: linear-gradient(115deg, var(--surface) 56%, var(--accent-soft)); }
.hero-avatar { position: relative; flex-shrink: 0; }
.hero-avatar-btn { position: relative; display: block; border-radius: var(--r-full); }
.hero-avatar-btn:disabled { cursor: default; }
.hero-avatar-mask {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: var(--r-full);
  color: #fff;
  background: rgba(8, 14, 18, 0.52);
  opacity: 0;
  transition: opacity var(--dur-2) var(--ease-out);
}
.hero-avatar-btn:hover .hero-avatar-mask,
.hero-avatar-btn:focus-visible .hero-avatar-mask,
.hero-avatar-btn:disabled .hero-avatar-mask { opacity: 1; }
.hero-remove {
  margin-left: 8px;
  padding: 0;
  font-size: 10.5px;
  color: var(--ink-3);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.hero-remove:hover { color: var(--danger); }
.hero-text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.hero-name { font-size: 21px; font-weight: 700; letter-spacing: -0.3px; }
.hero-sub { font-size: 11.5px; color: var(--ink-3); }
.hero-bio { margin-top: 5px; font-size: 12.5px; line-height: 1.55; color: var(--ink-2); }
.hero-bio.placeholder { color: var(--ink-4); }
.hero-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 4px; font-size: 10.5px; color: var(--ink-3); }
.hero-meta .dot { color: var(--ink-4); }
.card-label { display: flex; align-items: center; gap: 7px; font-size: 15px; font-weight: 660; color: var(--ink); }
.card-label svg { color: var(--accent); }
.theme-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.theme-options button { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 8px; border: 1px solid var(--line); border-radius: var(--r-sm); color: var(--ink-2); transition: background var(--dur-1), border-color var(--dur-1); }
.theme-options button:hover { background: var(--surface-hover); }
.theme-options button[aria-pressed="true"] { border-color: var(--accent-2); background: var(--accent-soft); color: var(--accent-ink); }
.appearance-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 44px; padding: 0 11px; border: 1px solid var(--line); border-radius: var(--r-sm); color: var(--ink-2); font-size: 13px; transition: background var(--dur-1); }
.appearance-row:hover { background: var(--surface-hover); }
.appearance-row > span { display: flex; align-items: center; gap: 9px; }
.appearance-row svg { color: var(--ink-3); }
.card-hint { margin: 0; font-size: 11px; line-height: 1.5; color: var(--ink-4); }
.field { display: flex; flex-direction: column; gap: 5px; position: relative; }
.field-label { display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 620; color: var(--ink-3); }
.field-input { height: 40px; padding: 0 11px; border-radius: var(--r-sm); background: var(--surface-3); border: 1px solid transparent; font-size: 13.5px; }
.field-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); background: var(--surface); }
.field-textarea { width: 100%; padding: 9px 11px 20px; border-radius: var(--r-sm); background: var(--surface-3); border: 1px solid transparent; font-size: 13px; line-height: 1.6; resize: vertical; }
.field-textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); background: var(--surface); }
.field-count { position: absolute; right: 9px; bottom: 7px; font-size: 10px; color: var(--ink-4); pointer-events: none; }
.switch-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; padding: 4px 0; }
.switch { appearance: none; width: 38px; height: 22px; border-radius: var(--r-full); background: var(--line-strong); position: relative; cursor: pointer; transition: background var(--dur-2) var(--ease-out); flex-shrink: 0; }
.switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: var(--shadow-xs); transition: transform var(--dur-2) var(--ease-spring); }
.switch:checked { background: var(--primary); }
.switch:checked::after { transform: translateX(16px); }
.select { height: 30px; padding: 0 8px; border-radius: var(--r-sm); border: 1px solid var(--line); background: var(--surface-2); font-size: 12px; }
.device-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; border-top: 1px solid var(--line); }
.device-row:first-of-type { border-top: 0; }
.device-main { display: flex; flex-direction: column; min-width: 0; }
.device-name { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 560; }
.device-badge { font-size: 9.5px; font-weight: 650; letter-spacing: 0.04em; color: var(--accent-ink); background: var(--accent-soft); padding: 1px 6px; border-radius: var(--r-full); }
.device-sub { font-size: 10.5px; color: var(--ink-3); }
.device-empty { font-size: 11.5px; color: var(--ink-4); }
.primary, .danger { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; border-radius: var(--r-sm); font-size: 13px; font-weight: 620; }
.primary { background: var(--primary); color: var(--primary-foreground); }
.primary:disabled { color: var(--ink-3); background: var(--surface-3); cursor: default; }
.danger { background: var(--danger-soft); color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger) 26%, transparent); }
.logout { align-self: flex-start; padding-inline: 14px; }
.toast-ok { font-size: 11.5px; color: var(--accent-ink); background: var(--accent-soft); padding: 7px 10px; border-radius: var(--r-sm); }
.toast-err { font-size: 11.5px; color: var(--danger); background: var(--danger-soft); padding: 7px 10px; border-radius: var(--r-sm); }
.spin { animation: tick-spin 900ms linear infinite; }

@media (max-width: 900px) {
  .me-settings { grid-template-columns: minmax(0, 1fr); }
  .me-inner { max-width: 600px; }
  .me-title { max-width: calc(600px - 2 * var(--view-gutter)); }
}

@media (max-width: 768px) {
  .me-head { padding-block: 12px; }
  .field-input, .primary, .danger, .select, .switch-row { min-height: 44px; }
  .logout { align-self: stretch; }
}
</style>
