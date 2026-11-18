<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  X, Loader2, Users, Megaphone, Shield, UserMinus, Crown,
  BellOff, Bell, LogOut, Trash2, Save, UserPlus, UserCheck, Clock, Check,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import {
  groupsApi,
  type GroupDetail,
  type GroupMemberProfile,
  type GroupModeration,
  type GroupMuteDuration,
} from '../api/groups'
import { ApiError, api, type Id } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { initialsOf, toneOf } from '../utils/present'

const props = defineProps<{ open: boolean; groupId: string | null }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'changed'): void
  (e: 'removed'): void
}>()

const auth = useAuthStore()

const detail = ref<GroupDetail | null>(null)
const moderation = ref<GroupModeration | null>(null)
const members = ref<GroupMemberProfile[]>([])
const name = ref('')
const announcement = ref('')
const loading = ref(false)
const refreshing = ref(false)
const busy = ref('')
const error = ref('')
const notice = ref('')
const confirmDisband = ref(false)
const confirmLeave = ref(false)
const pending = ref('')
/** 已是好友 / 好友申请已发出的成员，用于把「添加好友」图标换成状态。 */
const friendIds = ref<Set<string>>(new Set())
const requestedIds = ref<Set<string>>(new Set())

let noticeTimer: number | undefined
let pendingTimer: number | undefined

const myId = computed(() => String(auth.user?.userId ?? ''))
const role = computed(() => detail.value?.roleInGroup ?? null)
const isOwner = computed(
  () => role.value === 'OWNER' || String(detail.value?.ownerId ?? '') === myId.value,
)
const isAdmin = computed(() => !isOwner.value && role.value === 'ADMIN')
const canManage = computed(() => isOwner.value || isAdmin.value)

const MUTE_OPTIONS: { value: GroupMuteDuration; label: string }[] = [
  { value: 'MUTE_7M', label: '禁言 7 分钟' },
  { value: 'MUTE_30M', label: '禁言 30 分钟' },
  { value: 'MUTE_FOREVER', label: '永久禁言' },
]

function flash(msg: string) {
  notice.value = msg
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => (notice.value = ''), 2400)
}

/** 首屏加载才显示整页 loading；操作后的刷新走静默模式，避免整个弹窗闪一下。 */
async function load(silent = false) {
  const gid = props.groupId
  if (!gid) return
  if (silent) {
    refreshing.value = true
  } else {
    loading.value = true
  }
  error.value = ''
  try {
    const [d, m, list] = await Promise.all([
      groupsApi.detail(gid),
      groupsApi.moderation(gid).catch(() => null),
      groupsApi.members(gid),
    ])
    detail.value = d
    moderation.value = m
    members.value = list
    // 静默刷新不覆盖正在编辑的群名/公告
    if (!silent) {
      name.value = d.name
      announcement.value = m?.announcement ?? ''
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载群信息失败'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

async function run(key: string, fn: () => Promise<unknown>, successMsg: string) {
  busy.value = key
  error.value = ''
  try {
    await fn()
    flash(successMsg)
    await load(true)
    emit('changed')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    busy.value = ''
  }
}

const saveName = () => {
  const n = name.value.trim()
  if (!n || n === detail.value?.name) return
  run('name', () => groupsApi.rename(props.groupId!, n), '群名称已更新')
}

const saveAnnouncement = () =>
  run('ann', () => groupsApi.setAnnouncement(props.groupId!, announcement.value), '群公告已保存')

const toggleMuteAll = () =>
  run(
    'muteAll',
    () => groupsApi.setMuteAll(props.groupId!, !moderation.value?.muteAll),
    moderation.value?.muteAll ? '已解除全员禁言' : '已开启全员禁言',
  )

const muteMember = (userId: string | number, duration: GroupMuteDuration) =>
  run(
    `mute-${userId}`,
    () => groupsApi.muteMember(props.groupId!, userId, duration),
    duration === 'UNMUTE' ? '已解除禁言' : '已禁言该成员',
  )

const toggleAdmin = (userId: string | number, isAdminNow: boolean) =>
  run(
    `role-${userId}`,
    () => groupsApi.changeRole(props.groupId!, userId, isAdminNow ? 'MEMBER' : 'ADMIN'),
    isAdminNow ? '已取消管理员' : '已设为管理员',
  )

const kick = (userId: string | number) =>
  run(`kick-${userId}`, () => groupsApi.kick(props.groupId!, userId), '已移出群聊')

const transfer = (userId: string | number) =>
  run(`transfer-${userId}`, () => groupsApi.transfer(props.groupId!, userId), '群主已转让')

/** 踢人、转让需要二次点击确认，避免误触。 */
function confirmThen(key: string, action: () => void) {
  if (pending.value !== key) {
    pending.value = key
    window.clearTimeout(pendingTimer)
    pendingTimer = window.setTimeout(() => (pending.value = ''), 3000)
    return
  }
  pending.value = ''
  window.clearTimeout(pendingTimer)
  action()
}

function onMuteSelect(userId: string | number, event: Event) {
  const select = event.target as HTMLSelectElement
  const value = select.value as GroupMuteDuration | ''
  select.value = ''
  if (value) muteMember(userId, value)
}

function isMuted(member: GroupMemberProfile): boolean {
  if (member.mutedPermanently) return true
  if (!member.mutedUntil) return false
  return new Date(member.mutedUntil).getTime() > Date.now()
}

function mutedLabel(member: GroupMemberProfile): string {
  if (member.mutedPermanently) return '永久禁言'
  if (!isMuted(member)) return ''
  const until = new Date(member.mutedUntil!)
  const pad = (value: number) => String(value).padStart(2, '0')
  const time = `${pad(until.getHours())}:${pad(until.getMinutes())}`
  const today = new Date().toDateString() === until.toDateString()
  return `禁言至 ${today ? time : `${until.getMonth() + 1}-${until.getDate()} ${time}`}`
}

// 权限矩阵与后端一致：禁言、设撤管理员、转让、解散仅群主；
// 踢人方面群主可踢管理员与成员，管理员只能踢普通成员。
const canKick = (member: GroupMemberProfile) => {
  if (member.userId === myId.value || member.role === 'OWNER') return false
  if (isOwner.value) return true
  return isAdmin.value && member.role === 'MEMBER'
}
const canMute = (member: GroupMemberProfile) =>
  isOwner.value && member.userId !== myId.value && member.role !== 'OWNER'
const canGrantAdmin = (member: GroupMemberProfile) =>
  isOwner.value && member.userId !== myId.value && member.role !== 'OWNER'
const canTransfer = (member: GroupMemberProfile) =>
  isOwner.value && member.userId !== myId.value && member.role !== 'OWNER'

const isSelf = (member: GroupMemberProfile) => String(member.userId) === myId.value
const isFriend = (member: GroupMemberProfile) => friendIds.value.has(String(member.userId))
const friendRequested = (member: GroupMemberProfile) =>
  requestedIds.value.has(String(member.userId))

/** 好友列表只用于渲染图标状态，取不到也不影响群管理。 */
async function loadFriends() {
  try {
    const list = await api.get<{ friendId: Id }[]>('/friends')
    friendIds.value = new Set((list ?? []).map((item) => String(item.friendId)))
  } catch {
    /* 忽略：图标退化为「添加好友」 */
  }
}

/** 群成员里的加好友入口，复用通讯录的申请逻辑，不改变群内关系。 */
async function addFriend(member: GroupMemberProfile) {
  const id = String(member.userId)
  if (isSelf(member) || isFriend(member) || friendRequested(member) || busy.value) return
  busy.value = `friend-${id}`
  error.value = ''
  try {
    const result = await api.post<{ status?: string }>('/friends/requests', {
      toUserId: member.userId,
    })
    if (result?.status === 'ACCEPTED') {
      friendIds.value = new Set(friendIds.value).add(id)
      flash(`你和 ${member.nickname} 已成为好友`)
    } else {
      requestedIds.value = new Set(requestedIds.value).add(id)
      flash(`已向 ${member.nickname} 发送好友申请`)
    }
  } catch (e) {
    if (e instanceof ApiError && e.code === 40905) {
      friendIds.value = new Set(friendIds.value).add(id)
      flash('你们已经是好友')
    } else if (e instanceof ApiError && e.code === 40904) {
      requestedIds.value = new Set(requestedIds.value).add(id)
      flash('好友申请已发送，等待对方处理')
    } else if (e instanceof ApiError && e.code === 40305) {
      error.value = '对方已拒收消息，暂时无法添加'
    } else if (e instanceof Error && /rejects friend requests/i.test(e.message)) {
      error.value = `${member.nickname} 不接受好友申请`
    } else {
      error.value = e instanceof Error ? e.message : '发送好友申请失败'
    }
  } finally {
    busy.value = ''
  }
}

async function leave() {
  if (isOwner.value) {
    error.value = '你是群主，不能直接退出：请先转让群主，或解散群聊。'
    return
  }
  if (!confirmLeave.value) {
    confirmLeave.value = true
    window.setTimeout(() => (confirmLeave.value = false), 3000)
    return
  }
  busy.value = 'leave'
  try {
    await groupsApi.leave(props.groupId!)
    emit('removed')
  } catch (e) {
    const msg = e instanceof Error ? e.message : '退出失败'
    error.value = /owner cannot leave/i.test(msg)
      ? '你是群主，不能直接退出：请先转让群主，或解散群聊。'
      : msg
  } finally {
    busy.value = ''
  }
}

async function disband() {
  if (!confirmDisband.value) {
    confirmDisband.value = true
    window.setTimeout(() => (confirmDisband.value = false), 3000)
    return
  }
  busy.value = 'disband'
  try {
    await groupsApi.disband(props.groupId!)
    emit('removed')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '解散失败'
  } finally {
    busy.value = ''
  }
}

watch(
  [() => props.open, () => props.groupId],
  ([open]) => {
    window.clearTimeout(pendingTimer)
    pending.value = ''
    confirmDisband.value = false
    confirmLeave.value = false
    error.value = ''
    notice.value = ''
    if (open) {
      load()
      loadFriends()
    } else {
      detail.value = null
      moderation.value = null
      members.value = []
      name.value = ''
      announcement.value = ''
      friendIds.value = new Set()
      requestedIds.value = new Set()
    }
  },
)

onBeforeUnmount(() => {
  window.clearTimeout(noticeTimer)
  window.clearTimeout(pendingTimer)
})
</script>

<template>
  <Transition name="fade">
    <div v-if="props.open" class="mask" @click.self="emit('close')">
      <div class="dialog" role="dialog" aria-label="群管理">
        <header class="dialog-head">
          <div>
            <p class="eyebrow">群管理</p>
            <h2 class="dialog-title">{{ detail?.name || '加载中…' }}</h2>
          </div>
          <div class="head-actions">
            <Loader2 v-if="refreshing" :size="13" class="spin muted-icon" />
            <button class="icon-btn sm" aria-label="关闭" @click="emit('close')">
              <X :size="15" :stroke-width="2" />
            </button>
          </div>
        </header>

        <div v-if="loading" class="dialog-loading">
          <Loader2 :size="16" class="spin" /> 正在加载群信息…
        </div>

        <div v-else class="dialog-body">
          <p v-if="error" class="dialog-error">{{ error }}</p>

          <!-- 群名称 -->
          <section class="block">
            <p class="block-label">群名称</p>
            <div class="inline-row">
              <input v-model="name" class="field-input" maxlength="128" :disabled="!canManage" />
              <button
                v-if="canManage"
                class="icon-btn sm"
                :disabled="busy === 'name'"
                title="保存群名称"
                @click="saveName"
              >
                <Loader2 v-if="busy === 'name'" :size="13" class="spin" />
                <Save v-else :size="13" :stroke-width="2" />
              </button>
            </div>
          </section>

          <!-- 群公告 -->
          <section class="block">
            <p class="block-label"><Megaphone :size="10" :stroke-width="2.6" /> 群公告</p>
            <template v-if="canManage">
              <textarea
                v-model="announcement"
                class="field-textarea"
                rows="3"
                maxlength="2000"
                placeholder="写点什么，让成员都知道"
              />
              <button class="mini-btn" :disabled="busy === 'ann'" @click="saveAnnouncement">
                <Loader2 v-if="busy === 'ann'" :size="12" class="spin" />
                <Save v-else :size="12" :stroke-width="2" />
                保存公告
              </button>
            </template>
            <p v-else class="field-readonly">{{ announcement || '暂无群公告' }}</p>
          </section>

          <!-- 全员禁言：仅群主 -->
          <section v-if="isOwner" class="block row-between">
            <div>
              <p class="block-label" style="margin: 0">全员禁言</p>
              <p class="block-hint">开启后仅群主与管理员可发言</p>
            </div>
            <button
              class="switch-btn"
              :class="{ on: moderation?.muteAll }"
              :disabled="busy === 'muteAll'"
              @click="toggleMuteAll"
            >
              <BellOff v-if="moderation?.muteAll" :size="13" :stroke-width="2.2" />
              <Bell v-else :size="13" :stroke-width="2.2" />
              {{ moderation?.muteAll ? '已开启' : '已关闭' }}
            </button>
          </section>

          <!-- 成员 -->
          <section class="block">
            <p class="block-label">
              <Users :size="10" :stroke-width="2.6" /> 成员 · {{ members.length }}
            </p>
            <div class="member-list">
              <div v-for="m in members" :key="m.userId" class="member-row">
                <AppAvatar :initials="initialsOf(m.nickname)" :tone="toneOf(m.userId)" size="sm" />
                <span class="member-main">
                  <span class="member-name">
                    {{ m.nickname }}
                    <span v-if="m.role === 'OWNER'" class="tag owner">群主</span>
                    <span v-else-if="m.role === 'ADMIN'" class="tag admin">管理员</span>
                    <span v-if="isSelf(m)" class="tag me">我</span>
                  </span>
                  <span class="member-sub">
                    <template v-if="pending === `kick-${m.userId}`">再点一次确认移出</template>
                    <template v-else-if="pending === `transfer-${m.userId}`">
                      再点一次确认转让群主
                    </template>
                    <template v-else>ID {{ m.userId }}</template>
                  </span>
                </span>

                <span v-if="mutedLabel(m)" class="tag muted" :title="mutedLabel(m)">
                  {{ mutedLabel(m) }}
                </span>

                <div class="member-actions">
                  <button
                    v-if="isFriend(m)"
                    class="icon-mini friend"
                    title="已是好友"
                    disabled
                  >
                    <UserCheck :size="13" :stroke-width="2" />
                  </button>
                  <button
                    v-else-if="friendRequested(m)"
                    class="icon-mini pending"
                    title="好友申请等待对方通过"
                    disabled
                  >
                    <Clock :size="13" :stroke-width="2" />
                  </button>
                  <button
                    v-else-if="!isSelf(m)"
                    class="icon-mini"
                    title="添加好友"
                    :disabled="Boolean(busy)"
                    @click="addFriend(m)"
                  >
                    <Loader2
                      v-if="busy === `friend-${m.userId}`"
                      :size="13"
                      class="spin"
                    />
                    <UserPlus v-else :size="13" :stroke-width="2" />
                  </button>

                  <select
                    v-if="canMute(m)"
                    class="mini-select"
                    title="禁言"
                    :disabled="Boolean(busy)"
                    @change="onMuteSelect(m.userId, $event)"
                  >
                    <option value="" selected>禁言</option>
                    <option v-for="o in MUTE_OPTIONS" :key="o.value" :value="o.value">
                      {{ o.label }}
                    </option>
                    <option v-if="isMuted(m)" value="UNMUTE">解除禁言</option>
                  </select>

                  <button
                    v-if="canGrantAdmin(m)"
                    class="icon-mini"
                    :class="{ active: m.role === 'ADMIN' }"
                    :title="m.role === 'ADMIN' ? '取消管理员' : '设为管理员'"
                    :disabled="Boolean(busy)"
                    @click="toggleAdmin(m.userId, m.role === 'ADMIN')"
                  >
                    <Shield :size="13" :stroke-width="2" />
                  </button>

                  <button
                    v-if="canTransfer(m)"
                    class="icon-mini"
                    :class="{ armed: pending === `transfer-${m.userId}` }"
                    title="转让群主"
                    :disabled="Boolean(busy)"
                    @click="confirmThen(`transfer-${m.userId}`, () => transfer(m.userId))"
                  >
                    <Crown :size="13" :stroke-width="2" />
                  </button>

                  <button
                    v-if="canKick(m)"
                    class="icon-mini danger"
                    :class="{ armed: pending === `kick-${m.userId}` }"
                    title="移出群聊"
                    :disabled="Boolean(busy)"
                    @click="confirmThen(`kick-${m.userId}`, () => kick(m.userId))"
                  >
                    <UserMinus :size="13" :stroke-width="2" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- 危险区 -->
          <section class="block danger-zone">
            <p class="block-label" style="margin: 0">危险操作</p>
            <p v-if="isOwner" class="danger-hint">
              你是群主，不能直接退出。请先在成员右侧点
              <Crown :size="11" :stroke-width="2.4" class="danger-hint-icon" />
              转让群主，或直接解散群聊。
            </p>
            <div class="danger-actions">
              <button v-if="!isOwner" class="danger-btn" :disabled="Boolean(busy)" @click="leave">
                <LogOut :size="13" :stroke-width="2" />
                {{ confirmLeave ? '再点一次确认退出' : '退出群聊' }}
              </button>
              <button
                v-if="isOwner"
                class="danger-btn solid"
                :disabled="Boolean(busy)"
                @click="disband"
              >
                <Trash2 :size="13" :stroke-width="2" />
                {{ confirmDisband ? '再点一次确认解散' : '解散群聊' }}
              </button>
            </div>
          </section>
        </div>
      </div>

      <!-- 操作反馈：顶部悬浮小提示，不占正文空间、不把内容顶下去 -->
      <Transition name="toast">
        <div v-if="notice" class="toast" role="status" aria-live="polite">
          <Check :size="13" :stroke-width="2.6" />
          {{ notice }}
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
.mask {
  position: fixed; inset: 0; z-index: 60;
  display: grid; place-items: center; padding: 24px;
  background: color-mix(in srgb, var(--ink) 26%, transparent);
  backdrop-filter: blur(6px);
}
.dialog {
  width: 100%; max-width: 480px; max-height: min(680px, 86vh);
  display: flex; flex-direction: column;
  border-radius: var(--r-lg);
  background: var(--surface); border: 1px solid var(--line);
  box-shadow: var(--frame-ring), var(--shadow-lg);
  animation: pop-in 200ms var(--ease-spring);
  overflow: hidden;
}
.dialog-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 15px 14px 10px; border-bottom: 1px solid var(--line); }
.head-actions { display: flex; align-items: center; gap: 6px; }
.muted-icon { color: var(--ink-4); }
.dialog-title { font-size: 16px; font-weight: 660; letter-spacing: -0.3px; margin-top: 2px; }
.dialog-loading { display: flex; align-items: center; gap: 8px; justify-content: center; padding: 50px; font-size: 12.5px; color: var(--ink-3); }
.dialog-body { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 16px; }
.dialog-error { margin: 0; padding: 7px 10px; border-radius: var(--r-sm); background: var(--danger-soft); color: var(--danger); font-size: 11.5px; }
.toast {
  position: fixed; top: 18px; left: 50%;
  z-index: 2;
  display: inline-flex; align-items: center; gap: 6px;
  max-width: min(420px, 82vw);
  padding: 8px 15px;
  border-radius: var(--r-full);
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  border: 1px solid var(--line);
  box-shadow: var(--frame-ring), var(--shadow-md);
  backdrop-filter: blur(10px);
  font-size: 12px; font-weight: 560; color: var(--ink);
  pointer-events: none;
  transform: translateX(-50%);
}
.toast svg { color: var(--accent-ink); flex: none; }
.toast-enter-active { transition: opacity 180ms var(--ease-out), transform 300ms var(--ease-spring); }
.toast-leave-active { transition: opacity 220ms var(--ease-out), transform 180ms var(--ease-out); }
.toast-enter-from, .toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px) scale(0.94);
}
.block { display: flex; flex-direction: column; gap: 7px; }
.block.row-between { flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; }
.block-label { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 660; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink-3); }
.block-hint { font-size: 11px; color: var(--ink-4); margin-top: 2px; }
.inline-row { display: flex; align-items: center; gap: 6px; }
.field-input { flex: 1; height: 34px; padding: 0 11px; border-radius: var(--r-sm); background: var(--surface-3); border: 1px solid transparent; font-size: 13px; }
.field-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); background: var(--surface); }
.field-input:disabled { color: var(--ink-3); }
.field-textarea { width: 100%; padding: 9px 11px; border-radius: var(--r-sm); background: var(--surface-3); border: 1px solid transparent; font-size: 12.5px; line-height: 1.6; resize: vertical; }
.field-textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); background: var(--surface); }
.field-textarea:disabled { color: var(--ink-3); }
.field-readonly { margin: 0; padding: 9px 11px; border-radius: var(--r-sm); background: var(--surface-2); border: 1px solid var(--line); font-size: 12.5px; line-height: 1.6; color: var(--ink-2); white-space: pre-wrap; }
.mini-btn { align-self: flex-start; display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 11px; border-radius: var(--r-xs); background: var(--surface-3); border: 1px solid var(--line); font-size: 11.5px; font-weight: 560; color: var(--ink-2); }
.mini-btn:hover { background: var(--surface-hover); color: var(--ink); }
.switch-btn { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 11px; border-radius: var(--r-full); border: 1px solid var(--line); background: var(--surface-2); font-size: 11.5px; font-weight: 560; color: var(--ink-2); }
.switch-btn.on { background: var(--danger-soft); border-color: color-mix(in srgb, var(--danger) 34%, transparent); color: var(--danger); }
.member-list { display: flex; flex-direction: column; gap: 2px; max-height: 280px; overflow-y: auto; }
.member-row { display: flex; align-items: center; gap: 9px; padding: 6px 4px; border-radius: var(--r-sm); }
.member-row:hover { background: var(--surface-hover); }
.member-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.member-name { font-size: 12.5px; font-weight: 560; display: flex; align-items: center; gap: 5px; }
.member-sub { font-size: 10px; color: var(--ink-4); }
.tag { font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px; background: var(--surface-3); color: var(--ink-3); border: 1px solid var(--line); white-space: nowrap; }
.tag.owner { background: var(--accent-soft); color: var(--accent-ink); border-color: transparent; }
.tag.admin { background: var(--accent-soft); color: var(--accent-ink); border-color: transparent; opacity: 0.82; }
.tag.me { background: var(--surface-3); color: var(--ink-4); }
.tag.muted { background: var(--danger-soft); color: var(--danger); border-color: transparent; font-weight: 600; }
.member-actions { display: flex; align-items: center; gap: 2px; }
.mini-select { height: 24px; border-radius: var(--r-xs); border: 1px solid var(--line); background: var(--surface-2); font-size: 10.5px; color: var(--ink-2); }
.icon-mini { width: 24px; height: 24px; border-radius: var(--r-xs); display: grid; place-items: center; color: var(--ink-3); }
.icon-mini:hover:not(:disabled) { background: var(--surface-3); color: var(--ink); }
.icon-mini.active { background: var(--accent-soft); color: var(--accent-ink); }
.icon-mini.danger:hover:not(:disabled), .icon-mini.armed { background: var(--danger-soft); color: var(--danger); }
.icon-mini.armed { animation: pulse-armed 1s ease-in-out infinite; }
.icon-mini:disabled { opacity: 0.35; cursor: not-allowed; }
.icon-mini.friend:disabled { opacity: 1; color: var(--accent-ink); background: var(--accent-soft); cursor: default; }
.icon-mini.pending:disabled { opacity: 0.8; color: var(--ink-3); cursor: default; }
.danger-zone { border-top: 1px solid var(--line); padding-top: 12px; }
.danger-hint { display: flex; align-items: center; flex-wrap: wrap; gap: 3px; margin: 0; font-size: 11px; line-height: 1.6; color: var(--ink-3); }
.danger-hint-icon { color: var(--accent-ink); }
.danger-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.danger-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 14px; border-radius: var(--r-sm); font-size: 12px; font-weight: 600; border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent); background: var(--danger-soft); color: var(--danger); }
.danger-btn.solid { background: var(--danger); color: #fff; border-color: transparent; }
.spin { animation: tick-spin 900ms linear infinite; }
.fade-enter-active, .fade-leave-active { transition: opacity 160ms var(--ease-out); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
@keyframes pulse-armed { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
</style>
