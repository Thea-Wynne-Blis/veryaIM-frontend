<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  X, Users, Loader2, Megaphone, Search, ChevronRight, ChevronDown, Image as ImageIcon,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import ChatBackgroundDialog from './ChatBackgroundDialog.vue'
import { trackSpotlight } from '../composables/usePointerFx'
import { api, type GroupModeration } from '../api/client'
import type { ChatMember } from '../stores/chat'
import { useAuthStore } from '../stores/auth'
import { initialsOf, toneOfPerson } from '../utils/present'
import { groupAvatarSrc, userAvatarSrc } from '../utils/avatar'
import type { Conversation } from '../types/chat'

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
  (e: 'open-search'): void
  (e: 'profile', userId: string, anchor?: HTMLElement): void
}>()

const isGroup = computed(() => props.conversation.kind === 'group')
const auth = useAuthStore()
/** 自己的头像固定品牌绿，和聊天里的「我」保持一致。 */
const myId = computed(() => auth.user?.userId)

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
/** 聊天背景选择器：每个会话单独设置，优先于「我的 → 外观」里的全局背景。 */
const backgroundOpen = ref(false)

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
  moderation.value = null
  if (!isGroup.value) { loadingModeration.value = false; return }
  const id = props.conversation.id
  loadingModeration.value = true
  try {
    const data = await api.get<GroupModeration>(
      `/groups/${id}/moderation`,
    )
    if (id === props.conversation.id) moderation.value = data
  } catch {
    if (id === props.conversation.id) moderation.value = null
  } finally {
    if (id === props.conversation.id) loadingModeration.value = false
  }
}

watch(
  () => [props.conversation.id, isGroup.value] as const,
  () => loadModeration(),
  { immediate: true },
)

const memberKeyword = ref('')
const expanded = ref(false)
const filteredMembers = computed(() => {
  const query = memberKeyword.value.trim().toLowerCase()
  return memberList.value.filter(member => !query ||
    `${member.remark ?? ''} ${member.nickname}`.toLowerCase().includes(query))
})
const visibleMembers = computed(() => expanded.value || memberKeyword.value.trim()
  ? filteredMembers.value : filteredMembers.value.slice(0, 12))
watch(() => props.conversation.id, () => {
  memberKeyword.value = ''
  expanded.value = false
})
</script>

<template>
  <aside class="detail-pane" aria-label="会话详情">
    <header class="detail-head">
      <h2 class="detail-title">{{ isGroup ? '群聊信息' : '聊天信息' }}</h2>
      <button class="icon-btn sm" aria-label="关闭详情" @click="emit('close')">
        <X :size="15" :stroke-width="2" />
      </button>
    </header>

    <div class="detail-scroll settings-scroll">
      <div v-if="!isGroup" class="detail-hero settings-hero">
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
            :src="isGroup
              ? groupAvatarSrc(conversation.id)
              : userAvatarSrc(conversation.peerId)"
            size="xl"
          />
        </button>
        <div>
          <p class="detail-name">{{ conversation.name }}</p>
          <p class="detail-caption">{{ conversation.context }}</p>
        </div>
      </div>

      <div
        v-if="isGroup"
        class="card spot members-card"
        @pointermove="trackSpotlight"
      >
        <p class="card-label">
          <Users :size="11" :stroke-width="2.4" />
          成员 · {{ memberCount }}<span class="online-count">{{ onlineCount }} 人在线</span>
        </p>
        <label class="search member-search">
          <Search :size="14" class="search-icon" />
          <input v-model="memberKeyword" type="search" placeholder="搜索群成员" aria-label="搜索群成员" />
        </label>
        <div v-if="visibleMembers.length" class="member-grid">
          <div
            v-for="member in visibleMembers"
            :key="member.userId"
            class="member tip"
            :data-tip="`${member.remark?.trim() || member.nickname}${member.role ? ' · ' + member.role : ''}`"
          >
            <button
              class="member-avatar"
              type="button"
              :aria-label="`查看 ${member.remark?.trim() || member.nickname} 的资料`"
              @click="openUser(member.userId, $event)"
            >
              <AppAvatar
                :initials="initialsOf(member.remark?.trim() || member.nickname)"
                :tone="toneOfPerson(member.userId, myId)"
                :src="member.avatar || userAvatarSrc(member.userId)"
                size="sm"
                :presence="member.online ? 'online' : 'offline'"
              />
            </button>
            <span class="member-name">{{ member.remark?.trim() || member.nickname }}</span>
          </div>
        </div>
        <p v-else class="card-text muted-line">{{ memberKeyword ? '未找到相关成员' : '暂无成员资料' }}</p>
        <button v-if="!memberKeyword.trim() && filteredMembers.length > 12" class="show-members" @click="expanded = !expanded">
          {{ expanded ? '收起成员' : `查看全部 ${memberCount} 位成员` }}
          <ChevronDown :size="13" :class="{ expanded }" />
        </button>
      </div>

      <div v-if="isGroup" class="card group-name-card">
        <p class="card-label">群聊名称</p>
        <p class="card-text">{{ conversation.name }}</p>
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

      <div class="settings-section">
        <button v-if="isGroup" class="settings-row" @click="emit('manage')">
          <span>群管理</span><ChevronRight :size="16" />
        </button>
        <button class="settings-row find-content" @click="emit('open-search')">
          <span><Search :size="16" />查找聊天内容</span><ChevronRight :size="16" />
        </button>
        <button class="settings-row" @click="backgroundOpen = true">
          <span><ImageIcon :size="16" />聊天背景</span><ChevronRight :size="16" />
        </button>
      </div>
      <div class="settings-section">
        <button class="settings-row" role="switch" :aria-checked="!!muted" aria-label="消息免打扰" @click="emit('toggle-mute')">
          <span>消息免打扰</span><span class="setting-switch" :class="{ on: muted }" aria-hidden="true" />
        </button>
        <button class="settings-row" role="switch" :aria-checked="!!pinned" aria-label="置顶聊天" @click="emit('toggle-pin')">
          <span>置顶聊天</span><span class="setting-switch" :class="{ on: pinned }" aria-hidden="true" />
        </button>
      </div>
    </div>
  </aside>

  <ChatBackgroundDialog
    v-if="backgroundOpen"
    :conversation-id="conversation.id"
    @close="backgroundOpen = false"
  />
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

.settings-scroll { gap: 0; padding: 20px 18px; }
.settings-hero { padding: 4px 0 0; }
.settings-scroll > .card { border: 0; border-radius: 0; padding: 16px 0; background: none; border-top: 1px solid var(--line); }
.settings-scroll > .members-card { padding-top: 0; border-top: 0; }
.online-count { margin-left: auto; font-size: 10px; font-weight: 400; }
.settings-section { padding: 10px 0; border-top: 1px solid var(--line); }
.settings-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 48px; padding: 8px 4px; background: none; text-align: left; color: var(--ink); font-size: 13px; border-radius: var(--r-sm); }
.settings-row > span:first-child { display: flex; align-items: center; gap: 10px; }
.settings-row > svg { color: var(--ink-3); }
.settings-row:hover { background: var(--surface-hover); }
.find-content > span > svg { color: var(--ink-3); }
.setting-switch { width: 30px; height: 18px; border-radius: 20px; background: var(--line-strong); padding: 2px; flex-shrink: 0; transition: background 150ms; }
.setting-switch::after { content: ''; display: block; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px #0002; transition: transform 150ms; }
.setting-switch.on { background: var(--accent); }
.setting-switch.on::after { transform: translateX(12px); }
.member-search { margin-bottom: 16px; }
.member-search input { width: 100%; min-width: 0; }
.show-members { display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%; padding: 14px 0 0; background: none; font-size: 11px; color: var(--ink-3); }
.show-members .expanded { transform: rotate(180deg); }
.muted-line { display: flex; align-items: center; gap: 6px; color: var(--ink-3); }
.card-warn { font-size: 11px; color: var(--danger); }
.spin { animation: tick-spin 900ms linear infinite; }
</style>
