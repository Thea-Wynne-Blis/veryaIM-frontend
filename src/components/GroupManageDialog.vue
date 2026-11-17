<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  X, Loader2, Users, Megaphone, Shield, UserMinus, Crown,
  BellOff, Bell, LogOut, Trash2, Save,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { api } from '../api/client'
import { groupsApi, type GroupDetail, type GroupModeration, type GroupMemberProfile } from '../api/groups'
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
const busy = ref('')
const error = ref('')
const notice = ref('')
const confirmDisband = ref(false)
const confirmLeave = ref(false)

const myId = computed(() => String(auth.user?.userId ?? ''))
const role = computed(() => detail.value?.roleInGroup ?? null)
const isOwner = computed(
  () => role.value === 'OWNER' || String(detail.value?.ownerId ?? '') === myId.value,
)
const canManage = computed(() => isOwner.value || role.value === 'ADMIN')

const MUTE_OPTIONS = [
  { label: '解除禁言', minutes: 0 },
  { label: '10 分钟', minutes: 10 },
  { label: '1 小时', minutes: 60 },
  { label: '1 天', minutes: 1440 },
  { label: '7 天', minutes: 10080 },
]

function flash(msg: string) {
  notice.value = msg
  window.setTimeout(() => (notice.value = ''), 2200)
}

async function load() {
  const gid = props.groupId
  if (!gid) return
  loading.value = true
  error.value = ''
  try {
    const [d, m] = await Promise.all([
      groupsApi.detail(gid),
      groupsApi.moderation(gid).catch(() => null),
    ])
    detail.value = d
    moderation.value = m
    name.value = d.name
    announcement.value = m?.announcement ?? ''

    const profiles = await Promise.all(
      (d.memberIds ?? []).map((id) =>
        api
          .get<{ userId: number; nickname: string; online?: boolean }>(`/users/${id}/profile`)
          .catch(() => ({ userId: id, nickname: `用户 ${id}`, online: false })),
      ),
    )
    members.value = profiles.map((p) => ({
      userId: p.userId,
      nickname: p.nickname,
      online: p.online,
      role:
        p.userId === d.ownerId
          ? '群主'
          : d.roleInGroup && p.userId === myId.value
            ? '我'
            : undefined,
    }))
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载群信息失败'
  } finally {
    loading.value = false
  }
}

async function run(key: string, fn: () => Promise<unknown>, successMsg: string) {
  busy.value = key
  error.value = ''
  try {
    await fn()
    flash(successMsg)
    await load()
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

const muteMember = (userId: string | number, minutes: number) =>
  run(
    `mute-${userId}`,
    () => groupsApi.muteMember(props.groupId!, userId, minutes),
    minutes === 0 ? '已解除禁言' : '已禁言该成员',
  )

const toggleAdmin = (userId: string | number, isAdmin: boolean) =>
  run(
    `role-${userId}`,
    () => groupsApi.changeRole(props.groupId!, userId, isAdmin ? 'MEMBER' : 'ADMIN'),
    isAdmin ? '已取消管理员' : '已设为管理员',
  )

const kick = (userId: string | number) =>
  run(`kick-${userId}`, () => groupsApi.kick(props.groupId!, userId), '已移出群聊')

const transfer = (userId: string | number) =>
  run(`transfer-${userId}`, () => groupsApi.transfer(props.groupId!, userId), '群主已转让')

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
  () => [props.open, props.groupId] as const,
  ([open]) => {
    if (open) {
      confirmDisband.value = false
      confirmLeave.value = false
      load()
    } else {
      detail.value = null
      moderation.value = null
      members.value = []
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
          <button class="icon-btn sm" aria-label="关闭" @click="emit('close')">
            <X :size="15" :stroke-width="2" />
          </button>
        </header>

        <div v-if="loading" class="dialog-loading">
          <Loader2 :size="16" class="spin" /> 正在加载群信息…
        </div>

        <div v-else class="dialog-body">
          <p v-if="error" class="dialog-error">{{ error }}</p>
          <p v-if="notice" class="dialog-notice">{{ notice }}</p>

          <!-- 群名称 -->
          <section class="block">
            <p class="block-label">群名称</p>
            <div class="inline-row">
              <input v-model="name" class="field-input" maxlength="128" :disabled="!canManage" />
              <button class="icon-btn sm" :disabled="!canManage || busy === 'name'" @click="saveName">
                <Loader2 v-if="busy === 'name'" :size="13" class="spin" />
                <Save v-else :size="13" :stroke-width="2" />
              </button>
            </div>
          </section>

          <!-- 群公告 -->
          <section class="block">
            <p class="block-label"><Megaphone :size="10" :stroke-width="2.6" /> 群公告</p>
            <textarea
              v-model="announcement"
              class="field-textarea"
              rows="3"
              maxlength="2000"
              placeholder="写点什么，让成员都知道"
              :disabled="!canManage"
            />
            <button
              v-if="canManage"
              class="mini-btn"
              :disabled="busy === 'ann'"
              @click="saveAnnouncement"
            >
              <Loader2 v-if="busy === 'ann'" :size="12" class="spin" />
              <Save v-else :size="12" :stroke-width="2" />
              保存公告
            </button>
          </section>

          <!-- 全员禁言 -->
          <section v-if="canManage" class="block row-between">
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
            <p class="block-label"><Users :size="10" :stroke-width="2.6" /> 成员 · {{ members.length }}</p>
            <div class="member-list">
              <div v-for="m in members" :key="m.userId" class="member-row">
                <AppAvatar :initials="initialsOf(m.nickname)" :tone="toneOf(m.userId)" size="sm" />
                <span class="member-main">
                  <span class="member-name">
                    {{ m.nickname }}
                    <span v-if="m.userId === detail?.ownerId" class="tag owner">群主</span>
                    <span v-else-if="m.userId === myId" class="tag">我</span>
                  </span>
                  <span class="member-sub">ID {{ m.userId }}</span>
                </span>

                <div v-if="canManage && m.userId !== myId" class="member-actions">
                  <select
                    class="mini-select"
                    title="禁言时长"
                    :disabled="Boolean(busy)"
                    @change="muteMember(m.userId, Number(($event.target as HTMLSelectElement).value))"
                  >
                    <option value="" selected disabled>禁言</option>
                    <option v-for="o in MUTE_OPTIONS" :key="o.minutes" :value="o.minutes">
                      {{ o.label }}
                    </option>
                  </select>

                  <button
                    v-if="m.userId !== detail?.ownerId"
                    class="icon-mini"
                    :title="'设为/取消管理员'"
                    :disabled="!isOwner || Boolean(busy)"
                    @click="toggleAdmin(m.userId, false)"
                  >
                    <Shield :size="13" :stroke-width="2" />
                  </button>

                  <button
                    v-if="isOwner && m.userId !== detail?.ownerId"
                    class="icon-mini"
                    title="转让群主"
                    :disabled="Boolean(busy)"
                    @click="transfer(m.userId)"
                  >
                    <Crown :size="13" :stroke-width="2" />
                  </button>

                  <button
                    v-if="m.userId !== detail?.ownerId"
                    class="icon-mini danger"
                    title="移出群聊"
                    :disabled="Boolean(busy)"
                    @click="kick(m.userId)"
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
.dialog-title { font-size: 16px; font-weight: 660; letter-spacing: -0.3px; margin-top: 2px; }
.dialog-loading { display: flex; align-items: center; gap: 8px; justify-content: center; padding: 50px; font-size: 12.5px; color: var(--ink-3); }
.dialog-body { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 16px; }
.dialog-error { margin: 0; padding: 7px 10px; border-radius: var(--r-sm); background: var(--danger-soft); color: var(--danger); font-size: 11.5px; }
.dialog-notice { margin: 0; padding: 7px 10px; border-radius: var(--r-sm); background: var(--accent-soft); color: var(--accent-ink); font-size: 11.5px; }
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
.mini-btn { align-self: flex-start; display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 11px; border-radius: var(--r-xs); background: var(--surface-3); border: 1px solid var(--line); font-size: 11.5px; font-weight: 560; color: var(--ink-2); }
.mini-btn:hover { background: var(--surface-hover); color: var(--ink); }
.switch-btn { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 11px; border-radius: var(--r-full); border: 1px solid var(--line); background: var(--surface-2); font-size: 11.5px; font-weight: 560; color: var(--ink-2); }
.switch-btn.on { background: var(--danger-soft); border-color: color-mix(in srgb, var(--danger) 34%, transparent); color: var(--danger); }
.member-list { display: flex; flex-direction: column; gap: 2px; max-height: 260px; overflow-y: auto; }
.member-row { display: flex; align-items: center; gap: 9px; padding: 6px 4px; border-radius: var(--r-sm); }
.member-row:hover { background: var(--surface-hover); }
.member-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.member-name { font-size: 12.5px; font-weight: 560; display: flex; align-items: center; gap: 5px; }
.member-sub { font-size: 10px; color: var(--ink-4); }
.tag { font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px; background: var(--surface-3); color: var(--ink-3); border: 1px solid var(--line); }
.tag.owner { background: var(--accent-soft); color: var(--accent-ink); border-color: transparent; }
.member-actions { display: flex; align-items: center; gap: 2px; }
.mini-select { height: 24px; border-radius: var(--r-xs); border: 1px solid var(--line); background: var(--surface-2); font-size: 10.5px; color: var(--ink-2); }
.icon-mini { width: 24px; height: 24px; border-radius: var(--r-xs); display: grid; place-items: center; color: var(--ink-3); }
.icon-mini:hover:not(:disabled) { background: var(--surface-3); color: var(--ink); }
.icon-mini.danger:hover:not(:disabled) { background: var(--danger-soft); color: var(--danger); }
.icon-mini:disabled { opacity: 0.35; cursor: not-allowed; }
.danger-zone { border-top: 1px solid var(--line); padding-top: 12px; }
.danger-hint { display: flex; align-items: center; flex-wrap: wrap; gap: 3px; margin: 0; font-size: 11px; line-height: 1.6; color: var(--ink-3); }
.danger-hint-icon { color: var(--accent-ink); }
.danger-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.danger-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 14px; border-radius: var(--r-sm); font-size: 12px; font-weight: 600; border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent); background: var(--danger-soft); color: var(--danger); }
.danger-btn.solid { background: var(--danger); color: #fff; border-color: transparent; }
.spin { animation: tick-spin 900ms linear infinite; }
.fade-enter-active, .fade-leave-active { transition: opacity 160ms var(--ease-out); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
