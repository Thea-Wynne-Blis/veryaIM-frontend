<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { messageOf } from '../utils/error'
import { useToast } from '../composables/useToast'
import {
  X, Loader2, Megaphone, BellOff, Bell, LogOut, Trash2, Save, Camera, Crown, Check,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import GroupMemberList from './GroupMemberList.vue'
import UserProfileDialog from './UserProfileDialog.vue'
import {
  groupsApi,
  type GroupDetail,
  type GroupMemberProfile,
  type GroupModeration,
  type GroupMuteDuration,
} from '../api/groups'
import { ApiError, api, uploadForm, type Id } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'
import { initialsOf } from '../utils/present'
import { groupAvatarSrc, squareAvatarFile } from '../utils/avatar'

const props = defineProps<{ open: boolean; groupId: string | null }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'changed'): void
  (e: 'removed'): void
}>()

const auth = useAuthStore()
const chat = useChatStore()

const detail = ref<GroupDetail | null>(null)
const moderation = ref<GroupModeration | null>(null)
const members = ref<GroupMemberProfile[]>([])
const name = ref('')
const announcement = ref('')
const loading = ref(false)
const refreshing = ref(false)
const busy = ref('')
const error = ref('')
const { message: notice, show: flash } = useToast()
const confirmDisband = ref(false)
const confirmLeave = ref(false)
/** 已是好友 / 好友申请已发出的成员，用于把「添加好友」图标换成状态。 */
const friendIds = ref<Set<string>>(new Set())
const requestedIds = ref<Set<string>>(new Set())

/** 点成员头像/昵称查看资料卡：好友、陌生人、自己共用同一个组件。 */
const profileOpen = ref(false)
const profileId = ref<Id | null>(null)
const profileName = ref('')
/** 被点的那一行，资料卡贴着它弹出 */
const profileAnchor = ref<HTMLElement | null>(null)

const myId = computed(() => String(auth.user?.userId ?? ''))
const role = computed(() => detail.value?.roleInGroup ?? null)
const isOwner = computed(
  () => role.value === 'OWNER' || String(detail.value?.ownerId ?? '') === myId.value,
)
const isAdmin = computed(() => !isOwner.value && role.value === 'ADMIN')
const canManage = computed(() => isOwner.value || isAdmin.value)

/* ---------- 群头像 ---------- */
const avatarInput = ref<HTMLInputElement | null>(null)
/** 上传后加一个版本号，绕过浏览器对旧头像的短缓存。 */
const avatarVersion = ref(0)
const avatarBusy = computed(() => busy.value === 'avatar')
const avatarSrc = computed(() =>
  groupAvatarSrc(props.groupId, avatarVersion.value || undefined),
)

function pickGroupAvatar() {
  if (canManage.value && !avatarBusy.value) avatarInput.value?.click()
}

async function onGroupAvatarPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const groupId = props.groupId
  if (!file || !groupId || avatarBusy.value) return
  if (!file.type.startsWith('image/')) {
    error.value = '请选择图片文件'
    return
  }
  busy.value = 'avatar'
  error.value = ''
  try {
    const cropped = await squareAvatarFile(file)
    const form = new FormData()
    form.append('file', cropped)
    detail.value = await uploadForm<GroupDetail>(`/groups/${groupId}/avatar`, form, 'PUT')
    avatarVersion.value = Date.now()
    flash('群头像已更新')
    emit('changed')
  } catch (e) {
    error.value = messageOf(e, '群头像上传失败')
  } finally {
    busy.value = ''
  }
}

async function removeGroupAvatar() {
  const groupId = props.groupId
  if (!groupId || busy.value) return
  busy.value = 'avatar'
  error.value = ''
  try {
    detail.value = await api.delete<GroupDetail>(`/groups/${groupId}/avatar`)
    avatarVersion.value = 0
    flash('群头像已移除')
    emit('changed')
  } catch (e) {
    error.value = messageOf(e, '移除群头像失败')
  } finally {
    busy.value = ''
  }
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
    error.value = messageOf(e, '加载群信息失败')
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
    error.value = messageOf(e, '操作失败')
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

/** 好友列表只用于渲染图标状态，取不到也不影响群管理。 */
async function loadFriends() {
  try {
    const list = await api.get<{ friendId: Id }[]>('/friends')
    friendIds.value = new Set((list ?? []).map((item) => String(item.friendId)))
  } catch {
    /* 忽略：图标退化为「添加好友」 */
  }
}

/** 群成员显示名：好友备注优先。 */
function nameOf(member: GroupMemberProfile): string {
  return member.remark?.trim() || member.nickname
}

/** 群成员里的加好友入口，复用通讯录的申请逻辑，不改变群内关系。 */
async function addFriend(member: GroupMemberProfile) {
  const id = String(member.userId)
  if (id === myId.value || friendIds.value.has(id) || requestedIds.value.has(id) || busy.value) return
  busy.value = `friend-${id}`
  error.value = ''
  try {
    const result = await api.post<{ status?: string }>('/friends/requests', {
      toUserId: member.userId,
    })
    if (result?.status === 'ACCEPTED') {
      friendIds.value = new Set(friendIds.value).add(id)
      flash(`你和 ${nameOf(member)} 已成为好友`)
    } else {
      requestedIds.value = new Set(requestedIds.value).add(id)
      flash(`已向 ${nameOf(member)} 发送好友申请`)
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
      error.value = `${nameOf(member)} 不接受好友申请`
    } else {
      error.value = messageOf(e, '发送好友申请失败')
    }
  } finally {
    busy.value = ''
  }
}

function openProfile(member: GroupMemberProfile, event?: MouseEvent) {
  profileId.value = member.userId
  profileName.value = nameOf(member)
  profileAnchor.value = (event?.currentTarget as HTMLElement) ?? null
  profileOpen.value = true
}

/** 资料卡里点「发消息」：建私聊并跳过去，群管理弹窗顺势关闭。 */
async function chatFromProfile(userId: Id) {
  busy.value = 'profile-chat'
  error.value = ''
  try {
    const conversationId = await chat.createPrivate(userId)
    await chat.loadCards()
    await chat.open(conversationId)
    emit('close')
    window.dispatchEvent(new CustomEvent('veryal:open-chat', { detail: conversationId }))
  } catch (e) {
    error.value = messageOf(e, '发起会话失败')
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
    const msg = messageOf(e, '退出失败')
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
    error.value = messageOf(e, '解散失败')
  } finally {
    busy.value = ''
  }
}

watch(
  [() => props.open, () => props.groupId],
  ([open]) => {
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
      profileOpen.value = false
      profileId.value = null
      profileName.value = ''
      profileAnchor.value = null
    }
  },
)
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

          <!-- 群头像 -->
          <section class="block">
            <p class="block-label">群头像</p>
            <div class="avatar-row">
              <button
                class="group-avatar-btn"
                type="button"
                :disabled="!canManage || avatarBusy"
                :aria-label="canManage ? '更换群头像' : '群头像'"
                @click="pickGroupAvatar"
              >
                <AppAvatar
                  :initials="initialsOf(detail?.name || '群')"
                  :src="avatarSrc"
                  tone="jade"
                  size="xl"
                  rounded
                />
                <span v-if="canManage" class="group-avatar-mask">
                  <Loader2 v-if="avatarBusy" :size="16" class="spin" />
                  <Camera v-else :size="16" :stroke-width="2" />
                </span>
              </button>
              <div class="avatar-hint">
                <p class="block-hint">
                  {{ canManage ? '点击头像上传，自动裁成正方形' : '群主和管理员可以修改群头像' }}
                </p>
                <button
                  v-if="canManage"
                  class="mini-btn"
                  type="button"
                  :disabled="avatarBusy"
                  @click="removeGroupAvatar"
                >
                  移除群头像
                </button>
              </div>
            </div>
            <input
              ref="avatarInput"
              type="file"
              accept="image/*"
              hidden
              @change="onGroupAvatarPicked"
            />
          </section>

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

          <!-- 成员：权限矩阵与二次确认都在 GroupMemberList 里 -->
          <GroupMemberList
            :members="members"
            :my-id="myId"
            :is-owner="isOwner"
            :is-admin="isAdmin"
            :busy="busy"
            :friend-ids="friendIds"
            :requested-ids="requestedIds"
            @profile="openProfile"
            @friend="addFriend"
            @mute="muteMember"
            @admin="toggleAdmin"
            @kick="kick"
            @transfer="transfer"
          />

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

      <UserProfileDialog
        :open="profileOpen"
        :user-id="profileId"
        :fallback="{ nickname: profileName }"
        :anchor="profileAnchor"
        @close="profileOpen = false"
        @changed="loadFriends"
        @chat="chatFromProfile"
        @settings="profileOpen = false"
      />

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
.avatar-row { display: flex; align-items: center; gap: 14px; }
.avatar-hint { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; }
.group-avatar-btn { position: relative; flex-shrink: 0; border-radius: var(--r-md); }
.group-avatar-btn:disabled { cursor: default; }
.group-avatar-mask {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: var(--r-md);
  color: #fff;
  background: rgba(8, 14, 18, 0.52);
  opacity: 0;
  transition: opacity var(--dur-2) var(--ease-out);
}
.group-avatar-btn:hover .group-avatar-mask,
.group-avatar-btn:focus-visible .group-avatar-mask,
.group-avatar-btn:disabled .group-avatar-mask { opacity: 1; }
.group-avatar-btn :deep(.avatar) { box-shadow: var(--shadow-xs); }
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
