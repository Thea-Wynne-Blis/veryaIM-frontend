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
  Smile,
  AtSign,
  Loader2,
  Copy,
  Languages,
  Quote,
  Share2,
  Trash2,
  X,
  MailOpen,
  EyeOff,
  MoreHorizontal,
  Pin,
  BellOff,
  Star,
  Camera,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import ContactsView from './ContactsView.vue'
import MeView from './MeView.vue'
import MessageContent from './MessageContent.vue'
import EmojiPanel from './EmojiPanel.vue'
import DetailPanel from './DetailPanel.vue'
import FavoritesView from './FavoritesView.vue'
import MomentsView from './moments/MomentsView.vue'
import { useMessageLocator } from '../composables/useMessageLocator'
import { useTranslatePrefs } from '../composables/useTranslatePrefs'
import { useEnterAnimation } from '../composables/useEnterAnimation'
import { useStickyScroll } from '../composables/useStickyScroll'
import { useChatStore } from '../stores/chat'
import { useAuthStore } from '../stores/auth'
import { useMomentsStore } from '../stores/moments'
import type { ChatMessage, Conversation } from '../types/chat'
import { stableMessageKey } from '../utils/message'
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
  initialView?: string
  locateFavoriteMessage: (conversationId: string, messageId: string, signal?: AbortSignal) => Promise<void>
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
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

type Tab = 'chat' | 'contacts' | 'moments' | 'favorites' | 'me'

/** 支持 ?tab=favorites 直接落地到指定页，便于演示与截图。 */
const initialTab = (() => {
  const value = new URLSearchParams(window.location.search).get('tab') ?? props.initialView
  return value === 'contacts' || value === 'me' || value === 'favorites' || value === 'moments'
    ? (value as Tab)
    : 'chat'
})()

const tab = ref<Tab>(initialTab)
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
const bodyScrolled = ref(false)
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

const tabs = [
  { key: 'chat', label: '消息', icon: MessageCircle },
  { key: 'contacts', label: '通讯录', icon: Users },
  { key: 'moments', label: '朋友圈', icon: Camera },
  { key: 'me', label: '我的', icon: User },
] as const

const totalUnread = computed(() =>
  props.conversations.reduce((sum, item) => sum + item.unread, 0),
)

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

const tabTitle = computed(
  () =>
    ({
      chat: '消息',
      contacts: '通讯录',
      moments: '朋友圈',
      favorites: '收藏',
      me: '我的',
    })[tab.value],
)

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
    // 缓存的会话同步渲染；异步加载由 useEnterAnimation 的长度监听收门控
    nextTick(() => {
      if (currentMessages.value.length) disarmEnter()
    })
  },
)

function onBodyScroll(event: Event) {
  const el = event.target as HTMLElement
  bodyScrolled.value = el.scrollTop > 6
}

/** 消息不播「新消息」入场动画（同 ChatPane），只给每条一个稳定 key：乐观占位确认后复用同一节点 */
function messageDay(message: ChatMessage | undefined) {
  const date = message?.createdAt ? new Date(message.createdAt) : null
  return date && !Number.isNaN(date.getTime()) ? date.toDateString() : ''
}

function dayLabel(message: ChatMessage) {
  const day = messageDay(message)
  if (!day) return '聊天记录'
  const today = new Date()
  if (day === today.toDateString()) return '今天'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (day === yesterday.toDateString()) return '昨天'
  return new Date(message.createdAt!).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric',
    ...(new Date(message.createdAt!).getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}) })
}

function grouping(messages: ChatMessage[]) {
  const usedKeys = new Set<string>()
  return messages.map((message, index) => {
    const prev = messages[index - 1]
    const day = index === 0 || messageDay(prev) !== messageDay(message) ? dayLabel(message) : ''
    const grouped =
      !!prev &&
      !day &&
      prev.side === message.side &&
      (prev.senderId ?? prev.author) === (message.senderId ?? message.author) &&
      !!prev.createdAt && !!message.createdAt &&
      new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000 &&
      !prev.attachment &&
      !message.attachment
    const key = stableMessageKey(message, index, usedKeys)
    return { message, grouped, key, day, enterOrder: index, pending: message.pending }
  })
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

/* ---------- 会话列表右滑操作 ---------- */
const SWIPE_WIDTH = 198
const SWIPE_TRIGGER_PX = 48

/** 当前展开操作栏的会话 */
const swipeId = ref<string | null>(null)
/** 正在跟手的会话（滑动过程中不播过渡） */
const draggingId = ref<string | null>(null)
const dragOffset = ref(0)
/** 点了「删除」后展开的二级确认：「清空记录同时不显示聊天」 */
const deleteArmedId = ref<string | null>(null)

type SwipeTrack = {
  id: string
  startX: number
  startY: number
  from: number
  active: boolean
}

let track: SwipeTrack | null = null
let lastSwipeAt = 0

function resetSwipe() {
  swipeId.value = null
  deleteArmedId.value = null
}

/** 行的横向位移：跟手 > 二级确认 > 展开 > 复位。 */
function rowStyle(id: string): Record<string, string> | undefined {
  if (draggingId.value === id) {
    return { transform: `translateX(${dragOffset.value}px)` }
  }
  if (deleteArmedId.value === id) {
    return { transform: `translateX(-${SWIPE_WIDTH}px)` }
  }
  if (swipeId.value === id) {
    return { transform: `translateX(-${SWIPE_WIDTH}px)` }
  }
  return undefined
}

function onConvPointerDown(event: PointerEvent, id: string) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  // 按住另一行时先收起已展开的行
  if (swipeId.value && swipeId.value !== id) resetSwipe()
  track = {
    id,
    startX: event.clientX,
    startY: event.clientY,
    from: swipeId.value === id ? -SWIPE_WIDTH : 0,
    active: false,
  }
}

function onConvPointerMove(event: PointerEvent) {
  if (!track) return
  const dx = event.clientX - track.startX
  const dy = event.clientY - track.startY
  if (!track.active) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
    // 竖向手势是滚动列表，交还给浏览器
    if (Math.abs(dy) > Math.abs(dx)) {
      track = null
      return
    }
    track.active = true
    draggingId.value = track.id
    deleteArmedId.value = null
  }
  if (Math.abs(dx) > 10) lastSwipeAt = Date.now()
  dragOffset.value = Math.min(0, Math.max(-SWIPE_WIDTH, track.from + dx))
}

function onConvPointerEnd() {
  if (!track) return
  const { id, active } = track
  track = null
  if (!active) return
  draggingId.value = null
  if (dragOffset.value <= -SWIPE_TRIGGER_PX) swipeId.value = id
  else resetSwipe()
  dragOffset.value = 0
}

function onRowClick(id: string) {
  // 刚滑完浏览器还会补一个 click，别把它当成「打开会话」
  if (Date.now() - lastSwipeAt < 320) return
  // 已有展开的操作栏：这一下只负责收起
  if (swipeId.value) {
    resetSwipe()
    return
  }
  open(id)
}

function swipeUnread(id: string) {
  resetSwipe()
  emit('mark-unread', id)
}

function swipeHide(id: string) {
  resetSwipe()
  emit('hide', id)
}

function armDelete(id: string) {
  swipeId.value = id
  deleteArmedId.value = id
}

function confirmSwipeDelete(id: string) {
  resetSwipe()
  emit('delete', id)
}

/** 点空白处收起展开的操作栏 */
function onDocSwipeReset(event: PointerEvent) {
  if (!swipeId.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('.m-swipe')) return
  resetSwipe()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('pointerdown', onDocSwipeReset, true)
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
  document.removeEventListener('pointerdown', onDocSwipeReset, true)
})
</script>

<template>
  <div class="m-shell" :style="{ height: `${viewportHeight}px` }">
    <header v-if="tab === 'chat'" class="m-head" :class="{ scrolled: bodyScrolled }" :inert="!!current">
      <div class="m-title-row">
        <h1 class="m-title">{{ tabTitle }}</h1>
        <button v-if="tab === 'chat'" class="icon-btn" aria-label="新建会话" @click="emit('new-chat')">
          <Plus :size="19" :stroke-width="2" />
        </button>
      </div>
      <button class="m-search-entry" @click="emit('global-search')">
        <Search class="search-icon" :size="15" :stroke-width="2" />
        搜索联系人、群聊和聊天记录
      </button>
    </header>

    <div class="m-body" :class="{ embedded: tab !== 'chat' }" :inert="!!current" @scroll.passive="onBodyScroll">
      <template v-if="tab === 'chat'">
        <p v-if="error" class="m-error" role="alert">{{ error }}</p>
        <div
          v-for="(item, index) in conversations"
          :key="item.id"
          class="m-swipe"
          :style="{
            animation: `fade-up 320ms var(--ease-out) ${Math.min(index * 30, 180)}ms backwards`,
          }"
        >
          <div class="m-swipe-actions" :class="{ armed: deleteArmedId === item.id }">
            <template v-if="deleteArmedId === item.id">
              <button
                class="m-swipe-btn danger wide"
                @click.stop="confirmSwipeDelete(item.id)"
              >
                <Trash2 :size="17" :stroke-width="1.9" />
                清空记录同时不显示聊天
              </button>
            </template>
            <template v-else>
              <button class="m-swipe-btn mark" @click.stop="swipeUnread(item.id)">
                <MailOpen :size="17" :stroke-width="1.9" />
                标为未读
              </button>
              <button class="m-swipe-btn hide" @click.stop="swipeHide(item.id)">
                <EyeOff :size="17" :stroke-width="1.9" />
                不显示
              </button>
              <button class="m-swipe-btn danger" @click.stop="armDelete(item.id)">
                <Trash2 :size="17" :stroke-width="1.9" />
                删除
              </button>
            </template>
          </div>
          <button
            class="m-conv"
            :class="{ swiping: draggingId === item.id, pinned: item.pinned }"
            :aria-label="`${item.name}${item.unread ? `，${item.unread} 条未读消息` : ''}`"
            :style="rowStyle(item.id)"
            @pointerdown="onConvPointerDown($event, item.id)"
            @pointermove="onConvPointerMove"
            @pointerup="onConvPointerEnd"
            @pointercancel="onConvPointerEnd"
            @click="onRowClick(item.id)"
          >
            <AppAvatar
              :initials="item.initials"
              :tone="item.tone"
              :presence="item.presence"
              :rounded="item.kind === 'group'"
              :src="item.kind === 'group' ? groupAvatarSrc(item.id) : userAvatarSrc(item.peerId)"
              size="lg"
            />
            <span class="m-conv-main">
              <span class="m-conv-top">
                <span class="m-conv-name">{{ item.name }}</span>
                <Pin v-if="item.pinned" :size="12" class="m-conv-status" aria-label="已置顶" />
              </span>
              <span class="m-conv-preview">{{ item.preview }}</span>
            </span>
            <span class="m-conv-meta">
              <span class="conv-time num">{{ item.time }}</span>
              <BellOff v-if="item.muted && !item.unread" :size="13" class="m-conv-status" aria-label="消息免打扰" />
              <span v-if="item.unread" class="unread" :class="{ muted: item.muted }">
                <span :key="item.unread">{{ item.unread > 99 ? '99+' : item.unread }}</span>
              </span>
            </span>
          </button>
        </div>

        <div v-if="!conversations.length && !error" class="m-list-empty">
          <MessageCircle :size="38" :stroke-width="1.2" />
          <p>还没有聊天</p><span>从通讯录选择好友，或发起新的会话</span>
          <button @click="emit('new-chat')">发起聊天</button>
        </div>
      </template>

      <ContactsView v-else-if="tab === 'contacts'" class="m-embed" />
      <MomentsView
        v-else-if="tab === 'moments'"
        class="m-embed"
        mobile
        @profile="(userId, anchor) => emit('profile', String(userId), anchor)"
      />
      <FavoritesView v-else-if="tab === 'favorites'" class="m-embed" mobile :locate-message="locateFavoriteMessage" @back="tab = 'me'" />
      <MeView v-else class="m-embed" show-favorites @favorites="tab = 'favorites'" />
    </div>

    <nav class="m-tabs" aria-label="主导航" :inert="!!current">
      <button
        v-for="item in tabs"
        :key="item.key"
        class="m-tab"
        :class="{ active: tab === item.key || (item.key === 'me' && tab === 'favorites') }"
        :aria-current="tab === item.key || (item.key === 'me' && tab === 'favorites') ? 'page' : undefined"
        @click="tab = item.key; bodyScrolled = false; resetSwipe()"
      >
        <span class="m-tab-icon">
          <component :is="item.icon" :size="20" :stroke-width="1.85" />
          <span v-if="item.key === 'chat' && totalUnread" class="m-tab-dot">
            {{ totalUnread > 99 ? '99+' : totalUnread }}
          </span>
          <span v-else-if="item.key === 'moments' && moments.unread" class="m-tab-dot">
            {{ moments.unread > 99 ? '99+' : moments.unread }}
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
          <div :key="current.id" class="m-chat-title enter">
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
            <button class="icon-btn" aria-label="提及成员" :aria-expanded="mentionOpen" @click="toggleMention">
              <AtSign :size="20" :stroke-width="1.9" />
            </button>
            <button class="icon-btn" aria-label="表情" :aria-expanded="emojiOpen" aria-controls="mobile-emoji-picker" @click="emojiOpen = !emojiOpen; mentionOpen = false; composerInput?.blur()">
              <Smile :size="20" :stroke-width="1.9" />
            </button>
            <textarea
              ref="composerInput"
              v-model="draft"
              class="m-input"
              rows="1"
              placeholder="发消息…"
              aria-label="输入消息"
              @focus="emojiOpen = false; mentionOpen = false"
              @input="mentionOpen = draft.endsWith('@')"
              @compositionstart="composing = true"
              @compositionend="composing = false"
              @keydown.ctrl.enter.exact="sendShortcut"
              @keydown.meta.enter.exact="sendShortcut"
            />
            <button v-if="!canSend" class="icon-btn" aria-label="附件" @click="triggerAttach">
              <Paperclip :size="20" :stroke-width="1.9" />
            </button>
            <button v-else class="m-send" aria-label="发送" @click="send">
              发送
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
      <div
        v-if="menu"
        class="msg-menu"
        role="menu"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        @contextmenu.prevent
        @pointerdown.stop
      >
        <button class="msg-menu-item" role="menuitem" @click="copyMessage(menu.message)">
          <Copy :size="15" :stroke-width="1.9" />
          复制
        </button>
        <button
          class="msg-menu-item"
          role="menuitem"
          :disabled="menu.message.recalled || !!menu.message.attachment"
          @click="translateMessage(menu.message)"
        >
          <Languages :size="15" :stroke-width="1.9" />
          {{ translationOf(menu.message) ? '收起译文' : '翻译' }}
          <span class="msg-menu-tag">{{ translateLabel }}</span>
        </button>
        <button class="msg-menu-item" role="menuitem" @click="forwardMessage(menu.message)">
          <Share2 :size="15" :stroke-width="1.9" />
          转发
        </button>
        <button class="msg-menu-item" role="menuitem" :disabled="menu.message.recalled || menu.message.pending || !menu.message.messageId" @click="favoriteMessage(menu.message)"><Star :size="15" :stroke-width="1.9" />收藏</button>
        <button
          class="msg-menu-item"
          role="menuitem"
          :disabled="!canQuote(menu.message)"
          @click="quoteMessage(menu.message)"
        >
          <Quote :size="15" :stroke-width="1.9" />
          引用
        </button>
        <div class="msg-menu-sep" />
        <button class="msg-menu-item danger" role="menuitem" @click="deleteMessage(menu.message)">
          <Trash2 :size="15" :stroke-width="1.9" />
          删除
          <span v-if="!canRecall(menu.message)" class="msg-menu-tag">仅本机</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.m-shell { max-height: 100dvh; }
.m-shell .icon-btn { width: 44px; height: 44px; flex-shrink: 0; }
.m-head { padding: calc(env(safe-area-inset-top, 0px) + 8px) 16px 12px; gap: 8px; background: var(--canvas); }
.m-title { font-size: 25px; letter-spacing: -0.5px; }
.m-search-entry { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 42px; border-radius: 8px; background: var(--surface-3); color: var(--ink-3); font-size: 14px; }
.m-body { min-height: 0; padding-bottom: 0; overscroll-behavior: contain; }
.m-body.embedded { display: flex; flex-direction: column; overflow: hidden; padding-top: env(safe-area-inset-top, 0px); }
.m-conv { min-height: 84px; padding: 14px 16px; background: var(--surface); border-bottom: 1px solid var(--line); }
.m-conv.pinned { background: color-mix(in srgb, var(--surface) 95%, var(--accent)); }
.m-conv-top { min-width: 0; }
.m-conv-name { font-size: 16px; font-weight: 600; }
.m-conv-preview { font-size: 13px; margin-top: 3px; }
.m-conv-status { flex-shrink: 0; color: var(--ink-3); }
.m-conv-meta { align-self: stretch; justify-content: space-between; padding: 2px 0; }
.m-list-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 80px 24px; color: var(--ink-3); text-align: center; }
.m-list-empty p { font-size: 16px; color: var(--ink-2); }
.m-list-empty span { font-size: 13px; }
.m-list-empty button { padding: 10px 18px; border-radius: 8px; color: var(--accent-ink); background: var(--accent-soft); margin-top: 6px; }
.m-tabs { position: relative; flex-shrink: 0; background: var(--surface); padding: 7px 8px calc(env(safe-area-inset-bottom, 0px) + 7px); }
.m-tab { min-height: 48px; font-size: 11px; }
.m-chat-head { min-height: 60px; gap: 6px; padding: calc(env(safe-area-inset-top, 0px) + 3px) 8px 3px; background: var(--canvas); }
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
.m-composer-wrap { padding: 8px 8px calc(env(safe-area-inset-bottom, 0px) + 8px); background: var(--canvas); }
.m-composer { gap: 6px; align-items: flex-end; }
.m-input { min-width: 0; min-height: 44px; max-height: 136px; padding: 10px 12px; border-radius: 8px; background: var(--surface); border: 1px solid var(--line); font-size: 16px; line-height: 1.45; }
.m-input:focus { box-shadow: none; }
.m-input:focus-visible { outline: none; }
.m-send { min-width: 54px; width: auto; height: 44px; padding: 0 12px; border-radius: 7px; background: var(--accent); box-shadow: none; font-size: 14px; font-weight: 600; }
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

.msg-menu-item:disabled {
  color: var(--ink-4);
  cursor: not-allowed;
}

.msg-menu-item:disabled:hover {
  background: transparent;
  color: var(--ink-4);
}

.spin {
  animation: tick-spin 900ms linear infinite;
}

.m-chat-enter-active,
.m-chat-leave-active {
  transition: transform 280ms var(--ease-out), opacity 200ms var(--ease-out);
}
.m-chat-enter-from,
.m-chat-leave-to {
  transform: translateX(26px);
  opacity: 0;
}
</style>
