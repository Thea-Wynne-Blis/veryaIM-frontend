<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  X, Loader2, MapPin, PenLine, CalendarClock, MessageSquarePlus, UserPlus,
  Clock, Check, Pencil, Trash2, UserRound, Settings2,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { api, ApiError, type Id } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { initialsOf, toneOf } from '../utils/present'

/**
 * 统一的用户资料卡：好友、陌生人、自己三种形态共用一套展示。
 * 地区 / 个性签名 / 添加时间（im_friend.created_at）都由 /users/{id}/profile 一次返回。
 */
type UserCard = {
  userId: Id
  username: string
  nickname: string
  avatar?: string | null
  region?: string | null
  signature?: string | null
  online?: boolean
  createdAt?: string | null
  friend: boolean
  friendSince?: string | null
  remark?: string | null
  pendingOutgoing: boolean
  pendingIncoming: boolean
}

const props = defineProps<{
  open: boolean
  userId: Id | null
  /** 列表里已有昵称/头像时先渲染，避免打开瞬间空白。 */
  fallback?: { nickname?: string; avatar?: string | null } | null
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'changed'): void
  (e: 'chat', userId: Id): void
  (e: 'settings'): void
}>()

const auth = useAuthStore()
const card = ref<UserCard | null>(null)
const loading = ref(false)
const busy = ref('')
const error = ref('')
const notice = ref('')

const editingRemark = ref(false)
const remarkDraft = ref('')

let noticeTimer: number | undefined

const myId = computed(() => String(auth.user?.userId ?? ''))
const isSelf = computed(() => Boolean(props.userId) && String(props.userId) === myId.value)
const displayName = computed(
  () => card.value?.remark || card.value?.nickname || props.fallback?.nickname || '用户',
)
const avatarSeed = computed(() => card.value?.userId ?? props.userId ?? '')

function flash(text: string) {
  notice.value = text
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => (notice.value = ''), 2400)
}

/** 添加时间按「2026年11月18日」展示，比相对时间更适合资料卡。 */
function fullDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

async function load() {
  if (!props.userId) return
  loading.value = !card.value
  error.value = ''
  editingRemark.value = false
  try {
    card.value = await api.get<UserCard>(`/users/${props.userId}/profile`)
    remarkDraft.value = card.value.remark ?? ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载资料失败'
  } finally {
    loading.value = false
  }
}

function close() {
  emit('close')
}

function startChat() {
  if (!props.userId) return
  emit('chat', props.userId)
  close()
}

async function addFriend() {
  const current = card.value
  if (!current || busy.value) return
  busy.value = 'friend'
  error.value = ''
  try {
    const result = await api.post<{ status?: string; createdAt?: string }>(
      '/friends/requests',
      { toUserId: current.userId },
    )
    if (result?.status === 'ACCEPTED') {
      current.friend = true
      current.friendSince = result.createdAt ?? new Date().toISOString()
      flash('你们已经成为好友')
    } else {
      current.pendingOutgoing = true
      flash('好友申请已发送')
    }
    emit('changed')
  } catch (e) {
    if (e instanceof ApiError && e.code === 40905) {
      current.friend = true
      flash('你们已经是好友')
    } else if (e instanceof ApiError && e.code === 40904) {
      current.pendingOutgoing = true
      flash('好友申请已发送，等待对方处理')
    } else if (e instanceof ApiError && e.code === 40305) {
      error.value = '对方已拒收消息，暂时无法添加'
    } else if (e instanceof Error && /rejects friend requests/i.test(e.message)) {
      error.value = '对方不接受好友申请'
    } else {
      error.value = e instanceof Error ? e.message : '发送好友申请失败'
    }
  } finally {
    busy.value = ''
  }
}

async function saveRemark() {
  const current = card.value
  if (!current || busy.value) return
  const value = remarkDraft.value.trim()
  editingRemark.value = false
  if ((current.remark ?? '') === value) return
  busy.value = 'remark'
  error.value = ''
  try {
    await api.put(`/friends/${current.userId}`, { remark: value })
    current.remark = value || null
    flash(value ? '备注已保存' : '备注已清除')
    emit('changed')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '备注保存失败'
  } finally {
    busy.value = ''
  }
}

async function removeFriend() {
  const current = card.value
  if (!current || busy.value) return
  if (!window.confirm(`确定删除好友「${displayName.value}」吗？`)) return
  busy.value = 'remove'
  error.value = ''
  try {
    await api.delete(`/friends/${current.userId}`)
    emit('changed')
    close()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除好友失败'
  } finally {
    busy.value = ''
  }
}

watch(
  () => [props.open, String(props.userId ?? '')],
  ([open]) => {
    if (open) {
      card.value = null
      void load()
    } else {
      card.value = null
      error.value = ''
      notice.value = ''
      editingRemark.value = false
      window.clearTimeout(noticeTimer)
    }
  },
)
</script>

<template>
  <Transition name="fade">
    <div v-if="props.open" class="mask" @click.self="close">
      <div class="card" role="dialog" aria-label="用户资料">
        <button class="close" aria-label="关闭" @click="close">
          <X :size="15" :stroke-width="2" />
        </button>

        <div class="cover" aria-hidden="true" />

        <div v-if="loading" class="loading">
          <Loader2 :size="16" class="spin" /> 正在加载资料…
        </div>

        <div v-else class="body">
          <div class="avatar-slot">
            <AppAvatar
              :initials="initialsOf(displayName)"
              :tone="toneOf(avatarSeed)"
              size="xl"
            />
            <span v-if="card?.online" class="online-dot" title="在线" />
          </div>

          <h2 class="name">{{ displayName }}</h2>
          <p class="handle">
            @{{ card?.username || '—' }}
            <template v-if="card?.remark && card?.nickname"> · 昵称 {{ card.nickname }}</template>
          </p>

          <div class="chips">
            <span v-if="card?.online" class="chip online">在线</span>
            <span v-else class="chip">离线</span>
            <span v-if="isSelf" class="chip me">我自己</span>
            <span v-else-if="card?.friend" class="chip friend">好友</span>
            <span v-else class="chip">还不是好友</span>
          </div>

          <p class="signature" :class="{ empty: !card?.signature }">
            {{ card?.signature || '这个人很神秘，还没有写个性签名。' }}
          </p>

          <p v-if="error" class="error">{{ error }}</p>

          <dl class="meta">
            <div class="meta-row">
              <dt><MapPin :size="13" :stroke-width="1.9" /> 地区</dt>
              <dd>{{ card?.region || '未填写' }}</dd>
            </div>
            <div class="meta-row">
              <dt><PenLine :size="13" :stroke-width="1.9" /> 个性签名</dt>
              <dd :class="{ muted: !card?.signature }">{{ card?.signature || '未填写' }}</dd>
            </div>
            <div v-if="card?.friend" class="meta-row">
              <dt><CalendarClock :size="13" :stroke-width="1.9" /> 添加时间</dt>
              <dd>{{ fullDate(card.friendSince) }}</dd>
            </div>
            <div class="meta-row">
              <dt><UserRound :size="13" :stroke-width="1.9" /> 用户 ID</dt>
              <dd class="mono">{{ card?.userId }}</dd>
            </div>
          </dl>

          <!-- 好友：发消息 / 改备注 / 删除 -->
          <div v-if="card?.friend" class="actions">
            <button class="primary" :disabled="Boolean(busy)" @click="startChat">
              <MessageSquarePlus :size="14" :stroke-width="2" />
              发消息
            </button>
            <div class="row-actions">
              <button class="ghost" :disabled="Boolean(busy)" @click="editingRemark = !editingRemark">
                <Pencil :size="13" :stroke-width="2" />
                修改备注
              </button>
              <button class="ghost danger" :disabled="Boolean(busy)" @click="removeFriend">
                <Loader2 v-if="busy === 'remove'" :size="13" class="spin" />
                <Trash2 v-else :size="13" :stroke-width="2" />
                删除好友
              </button>
            </div>
            <div v-if="editingRemark" class="remark-box">
              <input
                v-model="remarkDraft"
                class="remark-input"
                placeholder="给 TA 设置一个备注名"
                maxlength="64"
                @keydown.enter="saveRemark"
              />
              <button class="mini" :disabled="busy === 'remark'" @click="saveRemark">
                <Loader2 v-if="busy === 'remark'" :size="12" class="spin" />
                <Check v-else :size="13" :stroke-width="2.6" />
              </button>
            </div>
          </div>

          <!-- 自己：跳设置页 -->
          <div v-else-if="isSelf" class="actions">
            <button class="primary" @click="emit('settings')">
              <Settings2 :size="14" :stroke-width="2" />
              编辑我的资料
            </button>
          </div>

          <!-- 陌生人：添加好友 / 状态 -->
          <div v-else class="actions">
            <button
              v-if="card?.pendingOutgoing"
              class="primary pending"
              disabled
            >
              <Clock :size="14" :stroke-width="2" />
              好友申请已发送
            </button>
            <button
              v-else-if="card?.pendingIncoming"
              class="primary"
              @click="flash('去「通讯录 · 申请」里同意即可成为好友')"
            >
              <Check :size="14" :stroke-width="2.4" />
              对方已申请，去处理
            </button>
            <button v-else class="primary" :disabled="busy === 'friend'" @click="addFriend">
              <Loader2 v-if="busy === 'friend'" :size="14" class="spin" />
              <UserPlus v-else :size="14" :stroke-width="2" />
              添加好友
            </button>
          </div>
        </div>

        <Transition name="toast">
          <div v-if="notice" class="toast" role="status" aria-live="polite">
            <Check :size="13" :stroke-width="2.6" />
            {{ notice }}
          </div>
        </Transition>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.mask {
  position: fixed; inset: 0; z-index: 70;
  display: grid; place-items: center; padding: 24px;
  background: color-mix(in srgb, var(--ink) 28%, transparent);
  backdrop-filter: blur(6px);
}
.card {
  position: relative;
  width: 100%; max-width: 360px;
  border-radius: var(--r-lg);
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--frame-ring), var(--shadow-lg);
  animation: pop-in 220ms var(--ease-spring);
  overflow: hidden;
}
.close {
  position: absolute; top: 10px; right: 10px; z-index: 2;
  width: 26px; height: 26px; border-radius: var(--r-xs);
  display: grid; place-items: center;
  color: var(--ink-3);
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  transition: background var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out);
}
.close:hover { background: var(--surface-3); color: var(--ink); }
.cover {
  height: 76px;
  background:
    radial-gradient(120% 140% at 12% 0%, var(--accent-soft-2) 0%, transparent 58%),
    linear-gradient(135deg, var(--accent-soft) 0%, var(--surface-3) 100%);
}
.body {
  display: flex; flex-direction: column; align-items: center;
  padding: 0 22px 18px; text-align: center;
}
.avatar-slot { position: relative; margin-top: -34px; margin-bottom: 8px; }
.avatar-slot :deep(.avatar) { box-shadow: 0 0 0 4px var(--surface), var(--shadow-sm); }
.online-dot {
  position: absolute; right: 2px; bottom: 2px;
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--accent-2); border: 2.5px solid var(--surface);
}
.name { font-size: 17px; font-weight: 680; letter-spacing: -0.3px; }
.handle { margin-top: 2px; font-size: 11.5px; color: var(--ink-3); }
.chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; margin-top: 8px; }
.chip {
  font-size: 9.5px; font-weight: 640; letter-spacing: 0.03em;
  padding: 2px 7px; border-radius: var(--r-full);
  background: var(--surface-3); color: var(--ink-3);
}
.chip.online { background: var(--accent-soft); color: var(--accent-ink); }
.chip.friend { background: var(--accent-soft); color: var(--accent-ink); }
.chip.me { background: var(--surface-3); color: var(--ink-4); }
.signature {
  margin-top: 12px; max-width: 280px;
  font-size: 12.5px; line-height: 1.65; color: var(--ink-2);
}
.signature.empty { color: var(--ink-4); }
.error {
  width: 100%; margin-top: 10px; padding: 7px 10px;
  border-radius: var(--r-sm);
  background: var(--danger-soft); color: var(--danger); font-size: 11.5px;
}
.meta {
  width: 100%; margin-top: 14px; padding-top: 12px;
  border-top: 1px solid var(--line);
  display: flex; flex-direction: column; gap: 7px;
}
.meta-row { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }
.meta-row dt {
  display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
  font-size: 11px; color: var(--ink-3);
}
.meta-row dd {
  min-width: 0; margin: 0; font-size: 12px; color: var(--ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.meta-row dd.muted { color: var(--ink-4); }
.mono { font-family: var(--mono); font-size: 11px; color: var(--ink-2); }
.actions { width: 100%; margin-top: 16px; display: flex; flex-direction: column; gap: 8px; }
.row-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.primary, .ghost {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 34px; padding: 0 14px; border-radius: var(--r-sm);
  font-size: 12.5px; font-weight: 620;
}
.primary { background: var(--accent-grad); color: #fff; box-shadow: 0 3px 12px -5px var(--accent); }
.primary.pending { background: var(--surface-3); color: var(--ink-3); box-shadow: none; cursor: default; }
.primary:disabled { opacity: 0.65; box-shadow: none; }
.ghost { border: 1px solid var(--line); color: var(--ink-2); background: var(--surface-2); }
.ghost:hover { background: var(--surface-hover); color: var(--ink); }
.ghost.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 26%, transparent); }
.remark-box { display: flex; align-items: center; gap: 6px; }
.remark-input {
  flex: 1; height: 32px; padding: 0 10px;
  border-radius: var(--r-sm); background: var(--surface-3);
  border: 1px solid transparent; font-size: 12.5px;
}
.remark-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); background: var(--surface); }
.mini {
  width: 32px; height: 32px; flex-shrink: 0;
  border-radius: var(--r-sm); display: grid; place-items: center;
  background: var(--accent-soft); color: var(--accent-ink);
}
.loading { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 34px 0 40px; font-size: 12.5px; color: var(--ink-3); }
.toast {
  position: absolute; left: 50%; bottom: 14px; z-index: 2;
  display: inline-flex; align-items: center; gap: 6px;
  max-width: 88%; padding: 7px 14px;
  border-radius: var(--r-full);
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  border: 1px solid var(--line);
  box-shadow: var(--frame-ring), var(--shadow-md);
  backdrop-filter: blur(10px);
  font-size: 11.5px; font-weight: 560; color: var(--ink);
  pointer-events: none;
  transform: translateX(-50%);
}
.toast svg { color: var(--accent-ink); flex: none; }
.toast-enter-active { transition: opacity 180ms var(--ease-out), transform 300ms var(--ease-spring); }
.toast-leave-active { transition: opacity 200ms var(--ease-out), transform 160ms var(--ease-out); }
.toast-enter-from, .toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px) scale(0.94);
}
.spin { animation: tick-spin 900ms linear infinite; }
.fade-enter-active, .fade-leave-active { transition: opacity 160ms var(--ease-out); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
