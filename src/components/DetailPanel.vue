<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  X, Pin, PinOff, Users, BellOff, Bell, Loader2, Megaphone,
  FileText, Image as ImageIcon, Film, Mic, Download, RefreshCw,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { trackSpotlight } from '../composables/usePointerFx'
import { api, downloadFile, type ConversationFile, type GroupModeration, type Id } from '../api/client'
import type { ChatMember } from '../stores/chat'
import { useAuthStore } from '../stores/auth'
import { humanBytes, initialsOf, listTime, toneOfPerson } from '../utils/present'
import type { Conversation } from '../types/chat'

const props = defineProps<{
  conversation: Conversation
  members?: ChatMember[]
  pinned?: boolean
  muted?: boolean
  /** 打开面板时默认停在哪个页签 */
  initialTab?: 'detail' | 'files'
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'toggle-pin'): void
  (e: 'toggle-mute'): void
  (e: 'manage'): void
  (e: 'profile', userId: string, anchor?: HTMLElement): void
}>()

/** 详情 / 文件两个页签共用这一栏，切换不会压缩聊天区。 */
const tab = ref<'detail' | 'files'>(props.initialTab ?? 'detail')

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

/* ---------- 会话文件（私聊 / 群聊共用） ---------- */
const files = ref<ConversationFile[]>([])
const filesLoading = ref(false)
const filesError = ref('')
const downloading = ref<Id | null>(null)
const fileFilter = ref<'ALL' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE'>('ALL')

const fileTabs = [
  { key: 'ALL', label: '全部' },
  { key: 'IMAGE', label: '图片' },
  { key: 'VIDEO', label: '视频' },
  { key: 'AUDIO', label: '语音' },
  { key: 'FILE', label: '文件' },
] as const

const visibleFiles = computed(() =>
  fileFilter.value === 'ALL'
    ? files.value
    : files.value.filter((file) => file.type === fileFilter.value),
)

/** 文件分类计数：为空的分组直接不显示，避免出现一排 0。 */
function countOf(type: string): number {
  return files.value.filter((file) => file.type === type).length
}

async function loadFiles() {
  if (filesLoading.value) return
  filesLoading.value = true
  filesError.value = ''
  try {
    const data = await api.get<ConversationFile[]>(
      `/conversations/${props.conversation.id}/files`,
    )
    files.value = Array.isArray(data) ? data : []
  } catch (e) {
    filesError.value = e instanceof Error ? e.message : '加载会话文件失败'
    files.value = []
  } finally {
    filesLoading.value = false
  }
}

async function download(row: ConversationFile) {
  downloading.value = row.fileId
  filesError.value = ''
  try {
    // 下载接口需要 Bearer Token，window.open 带不上请求头。
    await downloadFile(row.fileId, row.name)
  } catch (e) {
    filesError.value = e instanceof Error ? e.message : '下载失败'
  } finally {
    downloading.value = null
  }
}

function iconOf(type: string) {
  if (type === 'IMAGE') return ImageIcon
  if (type === 'VIDEO') return Film
  if (type === 'AUDIO') return Mic
  return FileText
}

watch(
  () => props.conversation.id,
  () => {
    files.value = []
    filesError.value = ''
    fileFilter.value = 'ALL'
    if (tab.value === 'files') loadFiles()
  },
)

watch(tab, (value, previous) => {
  if (value === 'files' && previous !== 'files' && !files.value.length) loadFiles()
})
</script>

<template>
  <aside class="detail-pane" aria-label="会话详情">
    <header class="detail-head">
      <div class="detail-tabs" role="tablist" aria-label="右侧面板">
        <button
          class="detail-tab"
          role="tab"
          :class="{ on: tab === 'detail' }"
          :aria-selected="tab === 'detail'"
          @click="tab = 'detail'"
        >
          详情
        </button>
        <button
          class="detail-tab"
          role="tab"
          :class="{ on: tab === 'files' }"
          :aria-selected="tab === 'files'"
          @click="tab = 'files'"
        >
          文件
        </button>
      </div>
      <button class="icon-btn sm" aria-label="关闭详情" @click="emit('close')">
        <X :size="15" :stroke-width="2" />
      </button>
    </header>

    <div v-if="tab === 'detail'" class="detail-scroll">
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
                size="sm"
                :presence="member.online ? 'online' : 'offline'"
              />
            </button>
            <span class="member-name">{{ member.remark?.trim() || member.nickname }}</span>
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

    <div v-else class="detail-scroll files-scroll">
      <div class="file-filters">
        <button
          v-for="item in fileTabs"
          :key="item.key"
          class="file-chip"
          :class="{ on: fileFilter === item.key }"
          @click="fileFilter = item.key"
        >
          {{ item.label }}
          <span v-if="item.key !== 'ALL'" class="num">{{ countOf(item.key) }}</span>
        </button>
        <button
          class="icon-btn sm file-refresh"
          aria-label="刷新文件列表"
          :disabled="filesLoading"
          @click="loadFiles"
        >
          <RefreshCw :size="13" :stroke-width="2" :class="{ spin: filesLoading }" />
        </button>
      </div>

      <p v-if="filesError" class="file-error">{{ filesError }}</p>
      <p v-if="filesLoading && !files.length" class="files-empty">
        <Loader2 :size="14" class="spin" /> 正在加载…
      </p>
      <p v-else-if="!visibleFiles.length" class="files-empty">
        {{ fileFilter === 'ALL' ? '这个会话还没有文件' : '这一类暂时没有文件' }}
      </p>

      <button
        v-for="file in visibleFiles"
        :key="file.messageId"
        class="file-row"
        :disabled="downloading === file.fileId"
        :title="`下载 ${file.name}`"
        @click="download(file)"
      >
        <span class="file-icon">
          <component :is="iconOf(file.type)" :size="15" :stroke-width="1.9" />
        </span>
        <span class="file-main">
          <span class="file-name">{{ file.name }}</span>
          <span class="file-meta">
            {{ humanBytes(file.sizeBytes) }} · {{ file.senderName }} ·
            {{ listTime(file.createdAt) }}
          </span>
        </span>
        <Loader2 v-if="downloading === file.fileId" :size="14" class="spin" />
        <Download v-else :size="14" :stroke-width="1.9" class="file-dl" />
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

/* ---------- 详情 / 文件 页签 ---------- */
.detail-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
}

.detail-tab {
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--r-sm);
  background: none;
  font-size: 12px;
  font-weight: 560;
  color: var(--ink-3);
  transition: background var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out);
}

.detail-tab:hover {
  color: var(--ink);
}

.detail-tab.on {
  background: var(--surface-2);
  color: var(--ink);
}

/* ---------- 会话文件 ---------- */
.files-scroll {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
}

.file-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}

.file-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 25px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: var(--r-full);
  background: var(--surface-2);
  font-size: 11.5px;
  font-weight: 550;
  color: var(--ink-2);
  transition: background var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out),
    border-color var(--dur-1) var(--ease-out);
}

.file-chip:hover {
  border-color: var(--line-strong);
  color: var(--ink);
}

.file-chip.on {
  background: var(--accent-soft);
  border-color: var(--accent-ring);
  color: var(--accent-ink);
}

.file-chip .num {
  font-size: 10px;
  color: var(--ink-3);
}

.file-chip.on .num {
  color: var(--accent-ink);
}

.file-refresh {
  margin-left: auto;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 9px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: var(--surface-2);
  text-align: left;
  transition: background var(--dur-1) var(--ease-out), border-color var(--dur-1) var(--ease-out);
}

.file-row:hover:not(:disabled) {
  background: var(--surface-hover);
  border-color: var(--line);
}

.file-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: var(--r-sm);
  background: var(--canvas);
  color: var(--ink-2);
}

.file-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.file-name {
  font-size: 12.5px;
  font-weight: 550;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  font-size: 10.5px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-dl {
  flex-shrink: 0;
  color: var(--ink-3);
}

.file-row:hover .file-dl {
  color: var(--accent);
}

.file-error {
  font-size: 11.5px;
  color: var(--danger);
}

.files-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 26px 8px;
  font-size: 11.5px;
  color: var(--ink-3);
}
</style>
