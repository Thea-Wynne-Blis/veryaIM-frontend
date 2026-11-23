<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useToast } from '../composables/useToast'
import { useMessageActions } from '../composables/useMessageActions'
import {
  MessageCircle,
  Users,
  User,
  Search,
  Plus,
  ArrowLeft,
  Paperclip,
  ArrowUp,
  Smile,
  AtSign,
  Loader2,
  Quote,
  X,
  MoreHorizontal,
  Camera,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import ContactsView from './ContactsView.vue'
import MessageActionMenu from './MessageActionMenu.vue'
import MeView from './MeView.vue'
import MessageContent from './MessageContent.vue'
import EmojiPanel from './EmojiPanel.vue'
import MobileConversationList from './MobileConversationList.vue'
import DetailPanel from './DetailPanel.vue'
import FavoritesView from './FavoritesView.vue'
import NotesView from './NotesView.vue'
import MomentsView from './moments/MomentsView.vue'
import { useMessageLocator } from '../composables/useMessageLocator'
import { useTranslatePrefs } from '../composables/useTranslatePrefs'
import { useEnterAnimation } from '../composables/useEnterAnimation'
import { useStickyScroll } from '../composables/useStickyScroll'
import { useChatBackground } from '../composables/useChatBackground'
import { useChatStore } from '../stores/chat'
import { useAuthStore } from '../stores/auth'
import { useMomentsStore } from '../stores/moments'
import type { ChatMessage, Conversation } from '../types/chat'
import { groupMessages } from '../utils/message'
import { appendMention, insertAtCursor } from '../utils/composer'
import { mentionCandidates } from '../utils/mention'
import { groupAvatarSrc, userAvatarSrc } from '../utils/avatar'

type ReplyRef = { messageId: string; senderId: string; preview: string }

const props = defineProps<{
  conversations: Conversation[]
  /** 被「不显示」但当前正在打开的会话（通讯录点进来时），列表里没有它 */
  activeConversation?: Conversation | null
  messagesOf: (id: string) => ChatMessage[]
  activeId: string | null
  me?: string
  error?: string | null
  loading?: boolean
  initialView?: Tab
  locateFavoriteMessage: (conversationId: string, messageId: string, signal?: AbortSignal) => Promise<void>
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'navigate', view: Tab): void
  (e: 'send', payload: { conversationId: string; text: string; reply?: ReplyRef }): void
  (e: 'attach', payload: { conversationId: string; file: File }): void
  (e: 'forward', message: ChatMessage): void
  (e: 'favorite', message: ChatMessage): void
  (e: 'close'): void
  (e: 'new-chat'): void
  (e: 'open-search'): void
  (e: 'global-search'): void
  (e: 'manage'): void
  (e: 'mark-unread', id: string): void
  (e: 'hide', id: string): void
  (e: 'delete', id: string): void
  (e: 'profile', userId: string, anchor?: HTMLElement): void
}>()

const chat = useChatStore()
const auth = useAuthStore()
const moments = useMomentsStore()

type Tab = 'chat' | 'contacts' | 'moments' | 'favorites' | 'notes' | 'me'

/** 支持 ?tab=favorites 直接落地到指定页，便于演示与截图。 */
const initialTab = (() => {
  const value = new URLSearchParams(window.location.search).get('tab') ?? props.initialView
  return value === 'contacts' || value === 'me' || value === 'favorites' || value === 'notes' || value === 'moments'
    ? (value as Tab)
    : 'chat'
})()

const tab = ref<Tab>(initialTab)

watch(() => props.initialView, (view) => {
  if (view) tab.value = view
})

function navigateTab(view: Tab) {
  if (tab.value === view) return
  tab.value = view
  emit('navigate', view)
}
const drafts = ref<Record<string, string>>({})
const draft = computed({
  get: () => props.activeId ? drafts.value[props.activeId] ?? '' : '',
  set: (value: string) => { if (props.activeId) drafts.value[props.activeId] = value },
})
const composerInput = ref<HTMLTextAreaElement | null>(null)
const composing = ref(false)
const infoOpen = ref(false)
const infoBack = ref<HTMLButtonElement | null>(null)
const infoButton = ref<HTMLButtonElement | null>(null)
const emojiOpen = ref(false)
const viewportHeight = ref(window.visualViewport?.height ?? window.innerHeight)
const scroller = ref<HTMLElement | null>(null)
const unreadOnly = ref(false)
const visibleConversations = computed(() =>
  unreadOnly.value ? props.conversations.filter((item) => item.unread > 0) : props.conversations,
)
/** 贴底滚动与桌面端共用一份实现；这里沿用 scrollBottom 这个名字，调用点不用改。 */
const {
  stick: stickToBottom,
  invalidate: invalidateScroll,
  scrollToBottom: scrollBottom,
  syncStick,
} = useStickyScroll(() => scroller.value)
const focusMessage = useMessageLocator(() => scroller.value, () => {
  invalidateScroll()
  stickToBottom.value = false
  infoOpen.value = false
  emojiOpen.value = false
  mentionOpen.value = false
})
defineExpose({ focusMessage })
const fileInput = ref<HTMLInputElement | null>(null)

const totalUnread = computed(() =>
  props.conversations.reduce((sum, item) => sum + item.unread, 0),
)
const tabs = computed(() => [
  { key: 'chat', label: '消息', icon: MessageCircle, unread: totalUnread.value },
  { key: 'contacts', label: '通讯录', icon: Users, unread: 0 },
  { key: 'moments', label: '朋友圈', icon: Camera, unread: moments.unread },
  { key: 'me', label: '我的', icon: User, unread: 0 },
] as const)

const dockTab = computed(() => (tab.value === 'favorites' || tab.value === 'notes') ? 'me' : tab.value)
const dockIndex = computed(() => tabs.value.findIndex(({ key }) => key === dockTab.value))

const current = computed(() => {
  if (!props.activeId) return null
  const visible = props.conversations.find((item) => item.id === props.activeId)
  if (visible) return visible
  // 「不显示」的会话不在列表里，但仍可以从通讯录打开
  return props.activeConversation?.id === props.activeId ? props.activeConversation : null
})

const currentMessages = computed(() =>
  props.activeId ? props.messagesOf(props.activeId) : [],
)

/** 手机端聊天背景：与桌面端共用同一份 store 与回退规则。 */
const backgroundTarget = computed(() => current.value?.id ?? null)
const {
  hasBackground,
  style: backgroundStyle,
} = useChatBackground(backgroundTarget)

/** @ 提及面板：单聊只有对端一个候选，群聊按成员列表。 */
const mentionOpen = ref(false)
const mentionPeople = computed(() =>
  mentionCandidates(current.value, chat.members[current.value?.id ?? ''] ?? [], String(auth.user?.userId ?? '')),
)

function toggleMention() {
  mentionOpen.value = !mentionOpen.value
  if (mentionOpen.value) {
    emojiOpen.value = false
    // 群聊成员列表可能还没拉过；点开 @ 时补一次，别让面板空着。
    // 单聊不需要额外请求：候选直接取会话对端。
    if (current.value?.kind === 'group' && props.activeId) {
      void chat.loadMembers(props.activeId)
    }
  }
  composerInput.value?.blur()
}

function insertMention(label: string) {
  draft.value = appendMention(draft.value, label)
  mentionOpen.value = false
  nextTick(focusComposerAtEnd)
}

const canSend = computed(() => draft.value.trim().length > 0)
const uploads = computed(() => chat.uploads.filter(task => task.conversationId === props.activeId))

function resizeInput() {
  const input = composerInput.value
  if (!input) return
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, 136)}px`
}
watch(draft, () => nextTick(resizeInput))

/** 插入表情 / @ 之后把焦点和光标还给输入框。 */
function focusComposerAtEnd() {
  const input = composerInput.value
  if (!input) return
  input.focus()
  input.setSelectionRange(input.value.length, input.value.length)
}

function updateViewport() {
  if (window.visualViewport && window.visualViewport.scale !== 1) return
  viewportHeight.value = window.visualViewport?.height ?? window.innerHeight
  document.documentElement.style.setProperty('--mobile-viewport-height', `${viewportHeight.value}px`)
  if (stickToBottom.value) scrollBottom()
}

async function openInfo() {
  closeMenu()
  emojiOpen.value = false
  mentionOpen.value = false
  infoOpen.value = true
  if (props.activeId) void chat.loadMembers(props.activeId)
  await nextTick()
  infoBack.value?.focus()
}

async function closeInfo() {
  infoOpen.value = false
  await nextTick()
  infoButton.value?.focus()
}

async function toggleSetting(setting: 'pin' | 'mute') {
  const id = props.activeId
  if (!id) return
  try {
    if (setting === 'pin') await chat.setPinned(id, !chat.isPinned(id))
    else await chat.setMuted(id, !chat.isMuted(id))
  } catch (e) { showNotice(e instanceof Error ? e.message : '设置失败，请重试') }
}

function insertEmoji(emoji: string) {
  const input = composerInput.value
  const start = input?.selectionStart ?? draft.value.length
  const next = insertAtCursor(draft.value, emoji, start, input?.selectionEnd ?? start)
  draft.value = next.value
  nextTick(() => input?.setSelectionRange(next.caret, next.caret))
}

function sendShortcut(event: KeyboardEvent) {
  if (event.isComposing || composing.value) return
  event.preventDefault()
  send()
}

function triggerAttach() {
  fileInput.value?.click()
}

function onFilePicked(event: Event) {
  const el = event.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (!file || !props.activeId) return
  emit('attach', { conversationId: props.activeId, file })
}

function open(id: string) {
  emit('select', id)
  replyTo.value = null
}

function close() {
  emit('close')
}

function send() {
  if (!canSend.value || !props.activeId || composing.value) return
  disarmEnter()
  const reply = replyTo.value
    ? {
        messageId: replyTo.value.messageId,
        senderId: replyTo.value.senderId,
        preview: replyTo.value.preview,
      }
    : undefined
  emit('send', { conversationId: props.activeId, text: draft.value.trim(), reply })
  replyTo.value = null
  draft.value = ''
  emojiOpen.value = false
  mentionOpen.value = false
  stickToBottom.value = true
  scrollBottom(true)
}

function onMessageScroll() {
  syncStick()
}

watch(() => currentMessages.value.length, () => scrollBottom())

/* ---------- 切换会话的入场动效（与桌面端同一套门控） ---------- */
const { arm: armEnter, disarm: disarmEnter, vEnter } = useEnterAnimation(
  () => currentMessages.value.length,
)

watch(
  () => props.activeId,
  (id) => {
    invalidateScroll()
    infoOpen.value = false
    emojiOpen.value = false
    mentionOpen.value = false
    replyTo.value = null
    composing.value = false
    stickToBottom.value = true
    scrollBottom(true)
    if (!id) {
      disarmEnter()
      return
    }
    armEnter()
    // 打开会话后把焦点落在输入框；触屏设备不主动弹软键盘，避免一进来就挡住消息
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
    // 缓存的会话同步渲染；异步加载由 useEnterAnimation 的长度监听收门控
    nextTick(() => {
      if (!coarsePointer) focusComposerAtEnd()
      if (currentMessages.value.length) disarmEnter()
    })
  },
)

/** 消息不播「新消息」入场动画（同 ChatPane），只给每条一个稳定 key：乐观占位确认后复用同一节点 */
function grouping(messages: ChatMessage[]) {
  return groupMessages(messages, { withDay: true, mergeWindowMs: 5 * 60_000, matchBySenderId: true })
}

/* ---------- 长按菜单（移动端没有右键） ---------- */
type MenuState = { x: number; y: number; message: ChatMessage }

const MENU_WIDTH = 176
const MENU_HEIGHT = 288

const menu = ref<MenuState | null>(null)
const { message: notice, show: showNotice } = useToast()

function openMenuAt(x: number, y: number, message: ChatMessage) {
  menu.value = {
    x: Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - MENU_HEIGHT - 8)),
    message,
  }
}

function closeMenu() {
  menu.value = null
}

function favoriteMessage(message: ChatMessage) {
  closeMenu()
  emit('favorite', message)
}

/**
 * 长按 480ms 弹出菜单；手指滑动超过 10px 视为滚动，取消长按。
 * 用 pointer 事件统一鼠标与触摸，避免 click 与 contextmenu 各来一次。
 */
type PressState = {
  x: number
  y: number
  startX: number
  startY: number
  timer: number
}

let press: PressState | null = null
/** 长按弹菜单的那一下不要再触发「点头像看资料」。 */
let suppressTap = false

function cancelPress() {
  if (!press) return
  window.clearTimeout(press.timer)
  press = null
}

function openProfile(userId?: string | null, event?: MouseEvent) {
  if (!userId || suppressTap) return
  emit('profile', String(userId), (event?.currentTarget as HTMLElement) ?? undefined)
}

function beginPress(event: PointerEvent, message: ChatMessage) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  cancelPress()
  suppressTap = false
  const state: PressState = {
    x: event.clientX,
    y: event.clientY,
    startX: event.clientX,
    startY: event.clientY,
    timer: 0,
  }
  state.timer = window.setTimeout(() => {
    press = null
    suppressTap = true
    if (navigator.vibrate) navigator.vibrate(12)
    openMenuAt(state.x, state.y, message)
  }, 480)
  press = state
}

function movePress(event: PointerEvent) {
  if (!press) return
  if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > 10) {
    cancelPress()
  }
}

function onDocPointerDown(event: PointerEvent) {
  if (!menu.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('.msg-menu')) return
  closeMenu()
}

/* ---------- 消息操作（复制/引用/撤回/删除/定位/翻译）与桌面端共用一份实现 ---------- */
const {
  replyTo, translatingId, midOf, copyMessage,
  canRecall, deleteMessage, canQuote, quoteMessage, cancelQuote,
  locateMessage, translationOf, translateMessage, forwardMessage,
} = useMessageActions({
  conversationId: () => props.activeId ?? undefined,
  scroller: () => scroller.value,
  myId: () => String(chat.myId),
  closeMenu,
  showNotice,
  recall: (conversationId, messageId) => chat.recallMessage(conversationId, messageId),
  hideMessage: (conversationId, messageId) => chat.hideMessage(conversationId, messageId),
  forward: (message) => emit('forward', message),
})

/* ---------- 翻译目标语言（菜单文案用） ---------- */
const { label: translateLabel } = useTranslatePrefs()

/* ---------- 会话列表 ---------- */
// 左滑操作与列表行都在 MobileConversationList 里，这里只负责把事件转给页面。

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  window.visualViewport?.addEventListener('resize', updateViewport, { passive: true })
  window.addEventListener('resize', updateViewport, { passive: true })
  updateViewport()
  scrollBottom(true)
})

onBeforeUnmount(() => {
  cancelPress()
  window.visualViewport?.removeEventListener('resize', updateViewport)
  window.removeEventListener('resize', updateViewport)
  document.documentElement.style.removeProperty('--mobile-viewport-height')
  document.removeEventListener('pointerdown', onDocPointerDown, true)
})

</script>

<template>
  <main class="m-shell" :style="{ height: `${viewportHeight}px` }">
    <header v-if="tab === 'chat'" class="m-head" :inert="!!current">
      <div class="m-title-row">
        <h1 class="m-title">消息</h1>
        <button class="new-conversation" aria-label="新建会话" @click="emit('new-chat')">
          <Plus :size="17" :stroke-width="2" aria-hidden="true" />
          新建
        </button>
      </div>
      <button class="m-search-entry" @click="emit('global-search')">
        <Search class="search-icon" :size="15" :stroke-width="2" />
        搜索联系人、群聊和聊天记录
      </button>
      <div class="seg m-seg" :style="{ '--idx': unreadOnly ? 1 : 0 }" role="group" aria-label="会话筛选">
        <span class="seg-thumb" aria-hidden="true" />
        <button :class="{ on: !unreadOnly }" :aria-pressed="!unreadOnly" @click="unreadOnly = false">
          全部 <span class="seg-count num">{{ conversations.length }}</span>
        </button>
        <button :class="{ on: unreadOnly }" :aria-pressed="unreadOnly" @click="unreadOnly = true">
          未读 <span class="seg-count num">{{ totalUnread }}</span>
        </button>
      </div>
    </header>

    <div class="m-body" :class="{ embedded: tab !== 'chat' }" :inert="!!current">
      <template v-if="tab === 'chat'">
        <p v-if="error" class="m-error" role="alert">{{ error }}</p>
        <MobileConversationList
          :conversations="visibleConversations"
          :unread-only="unreadOnly"
          @select="open"
          @new-chat="emit('new-chat')"
          @mark-unread="(id) => emit('mark-unread', id)"
          @hide="(id) => emit('hide', id)"
          @delete="(id) => emit('delete', id)"
        />
      </template>

      <ContactsView v-else-if="tab === 'contacts'" class="m-embed" />
      <MomentsView
        v-else-if="tab === 'moments'"
        class="m-embed"
        mobile
        @profile="(userId, anchor) => emit('profile', String(userId), anchor)"
      />
      <FavoritesView v-else-if="tab === 'favorites'" class="m-embed" mobile :locate-message="locateFavoriteMessage" @back="navigateTab('me')" />
      <NotesView v-else-if="tab === 'notes'" class="m-embed" mobile @back="navigateTab('me')" />
      <MeView v-else class="m-embed" show-favorites show-notes @favorites="navigateTab('favorites')" @notes="navigateTab('notes')" />
    </div>

    <nav class="m-tabs" :style="{ '--dock-index': dockIndex }" aria-label="主导航" :inert="!!current">
      <button
        v-for="item in tabs"
        :key="item.key"
        class="m-tab"
        :class="{ active: dockTab === item.key }"
        :aria-current="dockTab === item.key ? 'page' : undefined"
        :aria-label="item.label"
        :aria-description="item.unread ? item.unread + ' 条未读' : undefined"
        @click="navigateTab(item.key)"
      >
        <span class="m-tab-icon">
          <component :is="item.icon" :size="20" :stroke-width="1.85" />
          <span v-if="item.unread" class="m-tab-dot" aria-hidden="true">
            {{ item.unread > 99 ? '99+' : item.unread }}
          </span>
        </span>
        {{ item.label }}
      </button>
    </nav>

    <!-- 聊天页 -->
    <Transition name="m-chat">
      <section v-if="current" class="m-chat" aria-label="聊天">
        <header class="m-chat-head" :inert="infoOpen">
          <button class="icon-btn" aria-label="返回" @click="close">
            <ArrowLeft :size="20" :stroke-width="2" />
          </button>
          <AppAvatar
            :key="current.id"
            :initials="current.initials"
            :tone="current.tone"
            :presence="current.presence"
            :rounded="current.kind === 'group'"
            :src="current.kind === 'group' ? groupAvatarSrc(current.id) : userAvatarSrc(current.peerId)"
            size="sm"
          />
          <div :key="'title-' + current.id" class="m-chat-title enter">
            <span class="m-chat-name">{{ current.name }}</span>
            <span class="m-chat-sub">{{ current.context }}</span>
          </div>
          <button ref="infoButton" class="icon-btn" aria-label="聊天信息" @click="openInfo">
            <MoreHorizontal :size="23" :stroke-width="2" />
          </button>
        </header>

        <div
          ref="scroller"
          class="m-messages"
          :class="{ 'has-bg': hasBackground }"
          :style="backgroundStyle"
          :inert="infoOpen"
          @scroll.passive="onMessageScroll"
          @load.capture="scrollBottom(false)"
        >
          <p v-if="error" class="m-error">{{ error }}</p>
          <template
            v-for="({ message, grouped, key, day, enterOrder, pending }) in grouping(currentMessages)"
            :key="key"
          >
          <p v-if="day" class="day-divider">{{ day }}</p>
          <div
            v-if="message.type === 'SYSTEM'"
            class="sys-msg"
            :data-mid="message.id"
          >
            {{ message.text }}
          </div>
          <div
            v-else
            v-enter="{ order: enterOrder, skip: pending }"
            class="msg"
            :class="{ out: message.side === 'out', grouped }"
            :data-mid="message.id"
            @pointerdown="beginPress($event, message)"
            @pointerup="cancelPress"
            @pointermove="movePress"
            @pointercancel="cancelPress"
            @contextmenu.prevent
          >
            <MessageContent
              :message="message"
              :grouped="grouped"
              variant="mobile"
              :translate-label="translateLabel"
              :translation="translationOf(message)"
              :translating="translatingId === midOf(message)"
              @locate="locateMessage"
              @profile="openProfile"
            />
          </div>
          </template>
          <p v-if="loading && !currentMessages.length" :key="`l-${current.id}`" class="m-loading enter">
            <Loader2 :size="15" class="spin" /> 正在加载消息…
          </p>
          <p v-else-if="!currentMessages.length" :key="`e-${current.id}`" class="m-loading enter">
            还没有消息，发一条试试
          </p>
        </div>

        <div class="m-composer-wrap" :inert="infoOpen">
          <p v-if="notice" class="m-notice">{{ notice }}</p>
          <div v-if="replyTo" class="m-quote-bar">
            <Quote :size="13" :stroke-width="2" />
            <span class="m-quote-bar-main">
              <span class="m-quote-bar-author">引用 {{ replyTo.author }}</span>
              <span class="m-quote-bar-text">{{ replyTo.preview }}</span>
            </span>
            <button class="icon-btn" type="button" aria-label="取消引用" @click="cancelQuote">
              <X :size="14" :stroke-width="2" />
            </button>
          </div>
          <div v-if="uploads.length" class="m-uploads" aria-live="polite">
            <div v-for="task in uploads" :key="task.id" class="m-upload">
              <Loader2 :size="15" class="spin" />
              <span>{{ task.name }}</span>
              <progress :value="task.progress" max="1" :aria-label="`${task.name} 上传进度`" />
              <button class="icon-btn" :aria-label="`取消上传 ${task.name}`" @click="chat.cancelUpload(task.id)"><X :size="16" /></button>
            </div>
          </div>
          <div class="m-composer">
            <button class="icon-btn" aria-label="附件" @click="triggerAttach">
              <Paperclip :size="20" :stroke-width="1.9" />
            </button>
            <textarea
              ref="composerInput"
              v-model="draft"
              class="m-input"
              rows="1"
              placeholder="发消息…"
              aria-label="输入消息"
              @focus="emojiOpen = false; mentionOpen = false"
              @input="mentionOpen = current?.kind === 'group' && draft.endsWith('@')"
              @compositionstart="composing = true"
              @compositionend="composing = false"
              @keydown.ctrl.enter.exact="sendShortcut"
              @keydown.meta.enter.exact="sendShortcut"
            />
            <button v-if="current?.kind === 'group'" class="icon-btn" aria-label="提及成员" :aria-expanded="mentionOpen" @click="toggleMention">
              <AtSign :size="20" :stroke-width="1.9" />
            </button>
            <button class="icon-btn" aria-label="表情" :aria-expanded="emojiOpen" aria-controls="mobile-emoji-picker" @click="emojiOpen = !emojiOpen; mentionOpen = false; composerInput?.blur()">
              <Smile :size="20" :stroke-width="1.9" />
            </button>
            <button class="m-send" aria-label="发送" :disabled="!canSend" @click="send">
              <ArrowUp :size="21" :stroke-width="2.3" aria-hidden="true" />
            </button>
            <input ref="fileInput" type="file" hidden @change="onFilePicked" />
          </div>
          <div v-if="mentionOpen" class="m-mention" role="group" aria-label="选择要提及的人">
            <button
              v-for="person in mentionPeople"
              :key="person.id"
              type="button"
              class="m-mention-item"
              @click="insertMention(person.label)"
            >
              @{{ person.label }}
            </button>
            <p v-if="!mentionPeople.length" class="m-mention-empty">成员资料还没加载好，稍后再试</p>
          </div>
          <EmojiPanel
            v-if="emojiOpen && current"
            panel-id="mobile-emoji-picker"
            variant="mobile"
            :conversation-id="current.id"
            @pick="insertEmoji"
            @close="emojiOpen = false"
            @sent="emojiOpen = false"
          />
        </div>

        <section v-if="infoOpen" class="m-info-page" aria-label="聊天信息" @keydown.esc.stop.prevent="closeInfo">
          <header class="m-info-head">
            <button ref="infoBack" class="icon-btn" aria-label="返回聊天" @click="closeInfo"><ArrowLeft :size="22" /></button>
            <h2>{{ current.kind === 'group' ? '群聊信息' : '聊天信息' }}</h2>
            <span class="m-head-spacer" aria-hidden="true" />
          </header>
          <p v-if="notice" class="m-notice" role="status">{{ notice }}</p>
          <DetailPanel
            class="m-info-content"
            :conversation="current"
            :members="chat.members[current.id] ?? []"
            :pinned="chat.isPinned(current.id)" :muted="chat.isMuted(current.id)"
            @close="closeInfo" @toggle-pin="toggleSetting('pin')" @toggle-mute="toggleSetting('mute')"
            @open-search="infoOpen = false; emit('open-search')" @manage="emit('manage')"
            @profile="(id, anchor) => emit('profile', id, anchor)" />
        </section>
      </section>
    </Transition>

    <Teleport to="body">
      <MessageActionMenu
        v-if="menu"
        :message="menu.message"
        :x="menu.x"
        :y="menu.y"
        :translate-label="translateLabel"
        :translated="!!translationOf(menu.message)"
        :quotable="canQuote(menu.message)"
        :recallable="canRecall(menu.message)"
        :icon-size="15"
        @copy="copyMessage(menu.message)"
        @translate="translateMessage(menu.message)"
        @forward="forwardMessage(menu.message)"
        @favorite="favoriteMessage(menu.message)"
        @quote="quoteMessage(menu.message)"
        @delete="deleteMessage(menu.message)"
      />
    </Teleport>
  </main>
</template>

<style scoped>
.m-shell { max-height: 100dvh; }
.m-shell .icon-btn { width: 44px; height: 44px; flex-shrink: 0; }
.m-head { padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px 12px; gap: 10px; }
.m-title { font-size: var(--view-title-size); letter-spacing: -0.5px; }
.new-conversation { min-height: 44px; padding-inline: 14px; }
.m-search-entry { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 44px; padding-inline: 12px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface-3); color: var(--ink-3); font-size: 14px; text-align: left; }
.m-seg { height: 46px; }
.m-seg button { font-size: 13px; }
.m-body { min-height: 0; padding-bottom: 0; overscroll-behavior: contain; }
.m-body.embedded { display: flex; flex-direction: column; overflow: hidden; padding-top: env(safe-area-inset-top, 0px); }

.m-tabs {
  position: relative;
  flex-shrink: 0;
  margin: 4px 10px max(7px, env(safe-area-inset-bottom, 0px));
  padding: 5px 6px;
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.m-tabs::before {
  content: "";
  position: absolute;
  inset: 5px auto 5px 6px;
  width: calc((100% - 12px) / 4);
  border-radius: var(--r-md);
  background: var(--accent-soft);
  transform: translateX(calc(100% * var(--dock-index, 0)));
  transition: transform 240ms var(--ease-out);
  pointer-events: none;
}

.m-tab {
  position: relative;
  min-height: 48px;
  border-radius: var(--r-md);
  font-size: 11px;
}

.m-tab.active .m-tab-dot {
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.m-chat-head { min-height: 62px; gap: 8px; padding: calc(env(safe-area-inset-top, 0px) + 4px) 8px 4px; background: var(--surface); }
.m-chat-name { font-size: 16px; font-weight: 600; }
.m-chat-sub { font-size: 11px; }
.m-chat :deep(.bubble) { font-size: 16px; line-height: 1.6; padding: 10px 13px; overflow-wrap: anywhere; white-space: pre-wrap; }
.m-chat :deep(.msg-main) { min-width: 0; }
.m-chat :deep(.bubble.media) { width: min(258px, calc(100vw - 104px)); max-width: 100%; padding: 4px; }
.m-chat :deep(.image-wrap), .m-chat :deep(.image-wrap img), .m-chat :deep(.video-player), .m-chat :deep(.media-ph) { width: 100%; max-width: 100%; }
.m-chat :deep(.media-ph) { height: auto; }
.m-chat :deep(.bubble.audio) { min-width: 0; width: min(260px, calc(100vw - 104px)); }
.m-chat :deep(.attach) { min-width: 0; }
.m-chat :deep(.image-download) { width: 44px; height: 44px; opacity: 1; }
.m-chat :deep(.audio-play), .m-chat :deep(.audio-download) { min-width: 40px; min-height: 40px; }
.m-composer-wrap {
  padding: 6px 8px max(8px, env(safe-area-inset-bottom, 0px));
  border: 0;
  background: var(--surface);
}

.m-composer {
  align-items: flex-end;
  gap: 0;
  padding: 2px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-xl);
  background: var(--surface-3);
}

.m-composer:focus-within {
  border-color: var(--accent);
}

.m-composer .icon-btn {
  border-radius: var(--r-full);
}

.m-input {
  min-width: 0;
  min-height: 44px;
  max-height: 136px;
  padding: 10px 2px;
  border: 0;
  background: transparent;
  font-size: 16px;
  line-height: 1.45;
}

.m-input:focus,
.m-input:focus-visible {
  outline: none;
  box-shadow: none;
}

.m-send:disabled {
  color: var(--ink-3);
  background: var(--surface-active);
  opacity: 1;
}

.m-send {
  width: 44px;
  height: 44px;
  border-radius: var(--r-full);
  background: var(--primary);
  color: var(--primary-foreground);
  box-shadow: none;
}
.m-mention { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 2px 2px; }
.m-mention-item { min-height: 36px; padding: 0 12px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); font-size: 13px; }
.m-mention-item:active { background: var(--surface-active); }
.m-mention-empty { padding: 6px 4px; font-size: 12.5px; color: var(--ink-3); }
.m-upload { display: flex; align-items: center; gap: 8px; padding-left: 6px; font-size: 12px; color: var(--ink-3); }
.m-upload > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.m-upload progress { width: 56px; height: 5px; accent-color: var(--accent); }
.m-info-page { position: absolute; inset: 0; z-index: 8; display: flex; flex-direction: column; background: var(--surface); }
.m-info-head { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding: calc(env(safe-area-inset-top, 0px) + 4px) 8px 4px; border-bottom: 1px solid var(--line); background: var(--canvas); }
.m-info-head h2 { font-size: 16px; font-weight: 600; }
.m-head-spacer { width: 44px; }
.m-info-content { display: flex; flex: 1; min-height: 0; border: 0; animation: none; }
.m-info-content :deep(.detail-head) { display: none; }
.m-info-content :deep(.settings-scroll) { padding: 22px 20px calc(env(safe-area-inset-bottom, 0px) + 24px); }
.m-info-content :deep(.settings-row) { min-height: 58px; font-size: 16px; }
.m-info-content :deep(.card-label) { font-size: 12px; letter-spacing: 0; }
.m-info-content :deep(.card-text) { font-size: 14px; }
.m-info-content :deep(.member-name) { font-size: 12px; }
.m-info-content :deep(.member-avatar) { padding: 5px; }
.m-info-content :deep(.member-grid) { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px 8px; }
.m-info-content :deep(.member-search) { min-height: 44px; }
.m-info-content :deep(input) { font-size: 16px; }
.m-info-content :deep(.member-search input:focus-visible) { outline: none; }
.m-info-content :deep(.setting-switch) { width: 38px; height: 23px; padding: 3px; }
.m-info-content :deep(.setting-switch::after) { width: 17px; height: 17px; }
.m-info-content :deep(.setting-switch.on::after) { transform: translateX(15px); }
.m-info-content :deep(.show-members) { min-height: 44px; font-size: 13px; }
.m-embed :deep(input), .m-embed :deep(textarea), .m-embed :deep(select) { font-size: 16px; }
.m-embed :deep(.file-action), .m-embed :deep(.row-action) { width: 40px; height: 44px; }
.m-embed :deep(.files-head) { gap: 12px; flex-wrap: wrap; padding: 16px; }
.m-embed :deep(.head-right) { margin-left: auto; }
.m-embed :deep(.files-body) { padding: 16px 16px 24px; }

.m-embed {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.m-error {
  margin: 8px 12px;
  padding: 7px 10px;
  border-radius: var(--r-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 11.5px;
}

.m-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 26px 16px;
  font-size: 12px;
  color: var(--ink-3);
}

/* 长按选中时不弹系统文本选择菜单 */
.m-chat .msg {
  -webkit-touch-callout: none;
  user-select: none;
}

.m-quote-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 10px 6px;
  padding: 6px 8px;
  border-radius: var(--r-sm);
  border-left: 2px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 7%, transparent);
  color: var(--ink-3);
}

.m-quote-bar-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.m-quote-bar-author {
  font-size: 10px;
  font-weight: 640;
  color: var(--ink-2);
}

.m-quote-bar-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}

.m-notice {
  margin: 0 12px 6px;
  padding: 5px 9px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  color: var(--ink-2);
  font-size: 11px;
}



.spin {
  animation: tick-spin 900ms linear infinite;
}

.m-chat-enter-active,
.m-chat-leave-active {
  transition: transform 240ms var(--ease-out), opacity 180ms var(--ease-out);
}
.m-chat-enter-from,
.m-chat-leave-to {
  transform: translateX(26px);
  opacity: 0;
}
</style>
