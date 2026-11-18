<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { X, Pin, PinOff, Users, BellOff, Bell, Loader2, Megaphone } from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { trackSpotlight } from '../composables/usePointerFx'
import { api, type GroupModeration } from '../api/client'
import type { ChatMember } from '../stores/chat'
import { initialsOf, toneOf } from '../utils/present'
import type { Conversation } from '../data/workspace'

const props = defineProps<{
  conversation: Conversation
  members?: ChatMember[]
  pinned?: boolean
  muted?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'toggle-pin'): void
  (e: 'toggle-mute'): void
  (e: 'manage'): void
  (e: 'profile', userId: string, anchor?: HTMLElement): void
}>()

const isGroup = computed(() => props.conversation.kind === 'group')

/** 点谁的头像就带着这个元素当锚点，资料卡贴着它弹出。 */
function openUser(userId: string | number, event: MouseEvent) {
  emit('profile', String(userId), event.currentTarget as HTMLElement)
}
const memberList = computed(() => props.members ?? [])
const memberCount = computed(() => props.conversation.members ?? memberList.value.length)
const onlineCount = computed(
  () => memberList.value.filter((member) => member.online).length,
)

const moderation = ref<GroupModeration | null>(null)
const loadingModeration = ref(false)

const myMuteLabel = computed(() => {
  const state = moderation.value
  if (!state) return ''
  if (state.mutedPermanently) return '你已被永久禁言'
  if (!state.mutedUntil) return ''
  const until = new Date(state.mutedUntil)
  if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) return ''
  return `你已被禁言至 ${until.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
})

async function loadModeration() {
  if (!isGroup.value) return
  loadingModeration.value = true
  try {
    moderation.value = await api.get<GroupModeration>(
      `/groups/${props.conversation.id}/moderation`,
    )
  } catch {
    moderation.value = null
  } finally {
    loadingModeration.value = false
  }
}

watch(
  () => [props.conversation.id, isGroup.value] as const,
  () => loadModeration(),
  { immediate: true },
)
</script>

<template>
  <aside class="detail-pane" aria-label="会话详情">
    <header class="detail-head">
      <h2 class="detail-title">会话详情</h2>
      <button class="icon-btn sm" aria-label="关闭详情" @click="emit('close')">
        <X :size="15" :stroke-width="2" />
      </button>
    </header>

    <div class="detail-scroll">
      <div class="detail-hero">
        <button
          class="hero-avatar"
          type="button"
          :disabled="isGroup || !conversation.peerId"
          :title="!isGroup && conversation.peerId ? `查看 ${conversation.name} 的资料` : undefined"
          :aria-label="!isGroup && conversation.peerId ? `查看 ${conversation.name} 的资料` : undefined"
          @click="!isGroup && conversation.peerId && openUser(conversation.peerId, $event)"
        >
          <AppAvatar
            :initials="conversation.initials"
            :tone="conversation.tone"
            :rounded="isGroup"
            size="xl"
          />
        </button>
        <div>
          <p class="detail-name">{{ conversation.name }}</p>
          <p class="detail-caption">{{ conversation.context }}</p>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat-cell">
          <p class="stat-value">{{ memberCount }}</p>
          <p class="stat-label">成员</p>
        </div>
        <div class="stat-cell">
          <p class="stat-value" style="color: var(--accent)">{{ onlineCount }}</p>
          <p class="stat-label">在线</p>
        </div>
        <div class="stat-cell">
          <p class="stat-value">{{ isGroup ? '群聊' : '单聊' }}</p>
          <p class="stat-label">类型</p>
        </div>
      </div>

      <div v-if="isGroup" class="card spot glare" @pointermove="trackSpotlight">
        <p class="card-label">
          <Megaphone :size="11" :stroke-width="2.4" />
          群公告
        </p>
        <p v-if="loadingModeration" class="card-text muted-line">
          <Loader2 :size="12" class="spin" /> 加载中…
        </p>
        <p v-else class="card-text">
          {{ moderation?.announcement || '暂无群公告' }}
        </p>
        <p v-if="moderation?.muteAll" class="card-warn">全员禁言中</p>
        <p v-if="myMuteLabel" class="card-warn">{{ myMuteLabel }}</p>
      </div>

      <div
        v-if="isGroup"
        class="card spot"
        @pointermove="trackSpotlight"
      >
        <p class="card-label">
          <Users :size="11" :stroke-width="2.4" />
          成员 · {{ memberList.length || memberCount }}
        </p>
        <div v-if="memberList.length" class="member-grid">
          <div
            v-for="member in memberList"
            :key="member.userId"
            class="member tip"
            :data-tip="`${member.nickname}${member.role ? ' · ' + member.role : ''}`"
          >
            <button
              class="member-avatar"
              type="button"
              :aria-label="`查看 ${member.nickname} 的资料`"
              @click="openUser(member.userId, $event)"
            >
              <AppAvatar
                :initials="initialsOf(member.nickname)"
                :tone="toneOf(member.userId)"
                size="sm"
                :presence="member.online ? 'online' : 'offline'"
              />
            </button>
            <span class="member-name">{{ member.nickname }}</span>
          </div>
        </div>
        <p v-else class="card-text muted-line">暂无成员资料</p>
      </div>

      <button v-if="isGroup" class="action-btn" @click="emit('manage')">
        <Users :size="13" :stroke-width="2" />
        群管理
      </button>

      <button class="action-btn" @click="emit('toggle-pin')">
        <PinOff v-if="pinned" :size="13" :stroke-width="2" />
        <Pin v-else :size="13" :stroke-width="2" />
        {{ pinned ? '取消置顶' : '置顶会话' }}
      </button>

      <button class="action-btn" @click="emit('toggle-mute')">
        <Bell v-if="muted" :size="13" :stroke-width="2" />
        <BellOff v-else :size="13" :stroke-width="2" />
        {{ muted ? '开启消息提醒' : '消息免打扰' }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
/* 只有头像可点：昵称保持纯文本。 */
.hero-avatar {
  display: flex;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: none;
  border-radius: var(--r-full);
}

.hero-avatar:not(:disabled) {
  cursor: pointer;
}

.hero-avatar:not(:disabled):hover :deep(.avatar) {
  transform: scale(1.04);
}

.member-avatar {
  display: flex;
  padding: 0;
  border: 0;
  background: none;
  border-radius: var(--r-full);
  cursor: pointer;
}

.member-avatar:focus-visible,
.hero-avatar:focus-visible {
  outline: 2px solid var(--accent-ring);
  outline-offset: 2px;
}

.member.tip::after {
  left: 50%;
  top: -6px;
  transform: translate(-50%, -100%) scale(0.96);
}

.member.tip:hover::after {
  transform: translate(-50%, -100%) scale(1);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 33px;
  border-radius: var(--r-sm);
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-size: 12px;
  font-weight: 550;
  color: var(--ink-2);
  transition: background var(--dur-1) var(--ease-out),
    color var(--dur-1) var(--ease-out), border-color var(--dur-1) var(--ease-out);
}

.action-btn:hover {
  background: var(--surface-hover);
  border-color: var(--line-strong);
  color: var(--ink);
}

.muted-line {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-3);
}

.card-warn {
  font-size: 10.5px;
  color: var(--danger);
}

.spin {
  animation: tick-spin 900ms linear infinite;
}
</style>
