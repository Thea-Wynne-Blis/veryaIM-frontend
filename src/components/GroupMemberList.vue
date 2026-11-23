<script setup lang="ts">
/**
 * 群成员列表：一行的展示 + 权限矩阵（禁言 / 设撤管理员 / 转让 / 移出）。
 *
 * <p>从 GroupManageDialog 抽出来。这个弹窗原来同时管群资料、头像、公告、
 * 成员和危险操作，成员行一段就占了 120 行模板和 150 行权限判断。</p>
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { Clock, Crown, Loader2, Shield, UserCheck, UserMinus, UserPlus, Users } from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { initialsOf, toneOfPerson } from '../utils/present'
import { userAvatarSrc } from '../utils/avatar'
import type { GroupMemberProfile, GroupMuteDuration } from '../api/groups'
import type { Id } from '../api/client'

const props = defineProps<{
  members: GroupMemberProfile[]
  myId: string
  isOwner: boolean
  isAdmin: boolean
  /** 正在进行的操作 key（与弹窗其它操作共用一个 busy） */
  busy: string
  friendIds: Set<string>
  requestedIds: Set<string>
}>()

const emit = defineEmits<{
  (e: 'profile', member: GroupMemberProfile, event: MouseEvent): void
  (e: 'friend', member: GroupMemberProfile): void
  (e: 'mute', userId: Id, duration: GroupMuteDuration): void
  (e: 'admin', userId: Id, isAdminNow: boolean): void
  (e: 'kick', userId: Id): void
  (e: 'transfer', userId: Id): void
}>()

const MUTE_OPTIONS: { value: GroupMuteDuration; label: string }[] = [
  { value: 'MUTE_7M', label: '禁言 7 分钟' },
  { value: 'MUTE_30M', label: '禁言 30 分钟' },
  { value: 'MUTE_FOREVER', label: '永久禁言' },
]

/* ---------- 二次确认（踢人 / 转让群主） ---------- */
const pending = ref('')
let pendingTimer: number | undefined

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

onBeforeUnmount(() => {
  window.clearTimeout(pendingTimer)
})

/* ---------- 权限与状态判断 ---------- */
// 权限矩阵与后端一致：禁言、设撤管理员、转让、解散仅群主；
// 踢人方面群主可踢管理员与成员，管理员只能踢普通成员。
const canKick = (member: GroupMemberProfile) => {
  if (member.userId === props.myId || member.role === 'OWNER') return false
  if (props.isOwner) return true
  return props.isAdmin && member.role === 'MEMBER'
}
const canMute = (member: GroupMemberProfile) =>
  props.isOwner && member.userId !== props.myId && member.role !== 'OWNER'
const canGrantAdmin = (member: GroupMemberProfile) =>
  props.isOwner && member.userId !== props.myId && member.role !== 'OWNER'
const canTransfer = (member: GroupMemberProfile) =>
  props.isOwner && member.userId !== props.myId && member.role !== 'OWNER'

const isSelf = (member: GroupMemberProfile) => String(member.userId) === props.myId
const isFriend = (member: GroupMemberProfile) => props.friendIds.has(String(member.userId))
const friendRequested = (member: GroupMemberProfile) =>
  props.requestedIds.has(String(member.userId))

/** 群成员显示名：好友备注优先。 */
function nameOf(member: GroupMemberProfile): string {
  return member.remark?.trim() || member.nickname
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

function onMuteSelect(userId: Id, event: Event) {
  const select = event.target as HTMLSelectElement
  const value = select.value as GroupMuteDuration | ''
  select.value = ''
  if (value) emit('mute', userId, value)
}

/** 成员有变化（人数）时列表标题跟着更新。 */
const title = computed(() => `成员 · ${props.members.length}`)
</script>

<template>
  <section class="block">
    <p class="block-label">
      <Users :size="10" :stroke-width="2.6" /> {{ title }}
    </p>
    <div class="member-list">
      <div v-for="m in members" :key="m.userId" class="member-row">
        <button
          class="member-open"
          type="button"
          :title="`查看 ${nameOf(m)} 的资料`"
          @click="emit('profile', m, $event)"
        >
          <AppAvatar
            :initials="initialsOf(nameOf(m))"
            :tone="toneOfPerson(m.userId, myId)"
            :src="m.avatar || userAvatarSrc(m.userId)"
            size="sm"
          />
          <span class="member-main">
            <span class="member-name">
              {{ nameOf(m) }}
              <span v-if="m.role === 'OWNER'" class="tag owner">群主</span>
              <span v-else-if="m.role === 'ADMIN'" class="tag admin">管理员</span>
              <span v-if="isSelf(m)" class="tag me">我</span>
            </span>
            <span class="member-sub">
              <template v-if="pending === `kick-${m.userId}`">再点一次确认移出</template>
              <template v-else-if="pending === `transfer-${m.userId}`">再点一次确认转让群主</template>
              <template v-else>ID {{ m.userId }}</template>
            </span>
          </span>
        </button>

        <span v-if="mutedLabel(m)" class="tag muted" :title="mutedLabel(m)">
          {{ mutedLabel(m) }}
        </span>

        <div class="member-actions">
          <button v-if="isFriend(m)" class="icon-mini friend" title="已是好友" disabled>
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
            @click="emit('friend', m)"
          >
            <Loader2 v-if="busy === `friend-${m.userId}`" :size="13" class="spin" />
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
            @click="emit('admin', m.userId, m.role === 'ADMIN')"
          >
            <Shield :size="13" :stroke-width="2" />
          </button>

          <button
            v-if="canTransfer(m)"
            class="icon-mini"
            :class="{ armed: pending === `transfer-${m.userId}` }"
            title="转让群主"
            :disabled="Boolean(busy)"
            @click="confirmThen(`transfer-${m.userId}`, () => emit('transfer', m.userId))"
          >
            <Crown :size="13" :stroke-width="2" />
          </button>

          <button
            v-if="canKick(m)"
            class="icon-mini danger"
            :class="{ armed: pending === `kick-${m.userId}` }"
            title="移出群聊"
            :disabled="Boolean(busy)"
            @click="confirmThen(`kick-${m.userId}`, () => emit('kick', m.userId))"
          >
            <UserMinus :size="13" :stroke-width="2" />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.block { display: flex; flex-direction: column; gap: 7px; }
.block-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 660;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.member-list { display: flex; flex-direction: column; gap: 2px; max-height: 280px; overflow-y: auto; }
.member-row { display: flex; align-items: center; gap: 9px; padding: 6px 4px; border-radius: var(--r-sm); }
.member-row:hover { background: var(--surface-hover); }
.member-open { display: flex; align-items: center; gap: 9px; flex: 1; min-width: 0; text-align: left; background: none; border: 0; padding: 0; cursor: pointer; }
.member-open:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 2px; border-radius: var(--r-xs); }
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
.spin { animation: tick-spin 900ms linear infinite; }
@keyframes pulse-armed { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
</style>
