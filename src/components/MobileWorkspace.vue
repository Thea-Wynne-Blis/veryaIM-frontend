<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type ObjectDirective } from 'vue'
import { useToast } from '../composables/useToast'
import { useMessageActions } from '../composables/useMessageActions'
import {
  MessageCircle,
  Users,
  FolderOpen,
  User,
  Search,
  Plus,
  ArrowLeft,
  Paperclip,
  Smile,
  Send,
  CheckCheck,
  Check,
  Loader2,
  MoreHorizontal,
  Copy,
  Languages,
  Quote,
  Share2,
  Trash2,
  X,
  MailOpen,
  EyeOff,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import ContactsView from './ContactsView.vue'
import FilesView from './FilesView.vue'
import MeView from './MeView.vue'
import MessageAttachment from './MessageAttachment.vue'
import { useTranslatePrefs } from '../composables/useTranslatePrefs'
import { useChatStore } from '../stores/chat'
import type { ChatMessage, Conversation } from '../types/chat'

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
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'send', payload: { conversationId: string; text: string; reply?: ReplyRef }): void
  (e: 'attach', payload: { conversationId: string; file: File }): void
  (e: 'forward', message: ChatMessage): void
  (e: 'close'): void
  (e: 'new-chat'): void
  (e: 'mark-unread', id: string): void
  (e: 'hide', id: string): void
  (e: 'delete', id: string): void
  (e: 'profile', userId: string, anchor?: HTMLElement): void
}>()

const chat = useChatStore()

type Tab = 'chat' | 'contacts' | 'files' | 'me'

/** 支持 ?tab=files 直接落地到指定页，便于演示与截图。 */
const initialTab = (() => {
  const value = new URLSearchParams(window.location.search).get('tab')
  return value === 'contacts' || value === 'files' || value === 'me'
    ? (value as Tab)
    : 'chat'
})()

const tab = ref<Tab>(initialTab)
const keyword = ref('')
const draft = ref('')
const scroller = ref<HTMLElement | null>(null)
const bodyScrolled = ref(false)
const stickToBottom = ref(true)
const fileInput = ref<HTMLInputElement | null>(null)

const tabs = [
  { key: 'chat', label: '消息', icon: MessageCircle },
  { key: 'contacts', label: '通讯录', icon: Users },
  { key: 'files', label: '文件', icon: FolderOpen },
  { key: 'me', label: '我的', icon: User },
] as const

const totalUnread = computed(() =>
  props.conversations.reduce((sum, item) => sum + item.unread, 0),
)

const list = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return props.conversations
  return props.conversations.filter(
    (item) =>
      item.name.toLowerCase().includes(kw) ||
      item.preview.toLowerCase().includes(kw),
  )
})

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

const canSend = computed(() => draft.value.trim().length > 0)

const tabTitle = computed(
  () =>
    ({
      chat: '消息',
      contacts: '通讯录',
      files: '文件',
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
  draft.value = ''
  replyTo.value = null
}

function close() {
  emit('close')
}

function send() {
  if (!canSend.value || !props.activeId) return
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
  stickToBottom.value = true
  scrollBottom(true)
}

function scrollBottom(force = false) {
  if (!force && !stickToBottom.value) return
  nextTick(() => {
    const el = scroller.value
    if (!el) return
    el.scrollTop = el.scrollHeight
    stickToBottom.value = true
  })
}

function onMessageScroll() {
  const el = scroller.value
  if (!el) return
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight <= 48
}

watch(() => currentMessages.value.length, () => scrollBottom())

/* ---------- 切换会话的入场动效（与桌面端同一套语义） ---------- */
let enterArmed = false
let enterTimer: number | null = null

function armEnter() {
  enterArmed = true
  if (enterTimer !== null) window.clearTimeout(enterTimer)
  enterTimer = window.setTimeout(disarmEnter, 1200)
}

function disarmEnter() {
  enterArmed = false
  if (enterTimer !== null) {
    window.clearTimeout(enterTimer)
    enterTimer = null
  }
}

/** 只在节点挂载时打上 enter 类，并按序号触发一次「逐条流动」。 */
const vEnter: ObjectDirective<HTMLElement, { order?: number; skip?: boolean }> = {
  mounted(el, binding) {
    if (!enterArmed || binding.value?.skip) return
    el.style.setProperty('--enter-order', String(binding.value?.order ?? 0))
    el.classList.add('enter')
  },
}

watch(
  () => props.activeId,
  (id) => {
    stickToBottom.value = true
    scrollBottom(true)
    if (!id) {
      disarmEnter()
      return
    }
    armEnter()
    // 缓存的会话同步渲染；异步加载由下面的长度监听收门控
    nextTick(() => {
      if (currentMessages.value.length) disarmEnter()
    })
  },
  { immediate: true },
)

watch(
  () => currentMessages.value.length,
  (len) => {
    if (!enterArmed || !len) return
    // 指令的 mounted 在 post 队列里，等整个 flush 结束再关门控
    nextTick(disarmEnter)
  },
)

function onBodyScroll(event: Event) {
  const el = event.target as HTMLElement
  bodyScrolled.value = el.scrollTop > 6
}

/** 消息不播「新消息」入场动画（同 ChatPane），只给每条一个稳定 key：乐观占位确认后复用同一节点 */
function grouping(messages: ChatMessage[]) {
  const usedKeys = new Set<string>()
  return messages.map((message, index) => {
    const prev = messages[index - 1]
    const grouped =
      !!prev &&
      prev.side === message.side &&
      prev.author === message.author &&
      !prev.attachment &&
      !message.attachment
    let key = message.clientMsgId ? `c:${message.clientMsgId}` : `s:${message.id}`
    if (usedKeys.has(key)) key = `s:${message.id}:${index}`
    usedKeys.add(key)
    return { message, grouped, key, enterOrder: index, pending: message.pending }
  })
}

/* ---------- 长按菜单（移动端没有右键） ---------- */
type MenuState = { x: number; y: number; message: ChatMessage }

const MENU_WIDTH = 176
const MENU_HEIGHT = 244

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

document.addEventListener('pointerdown', onDocSwipeReset, true)

onBeforeUnmount(() => {
  cancelPress()
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('pointerdown', onDocSwipeReset, true)
})

document.addEventListener('pointerdown', onDocPointerDown, true)
</script>

<template>
  <div class="m-shell">
    <header class="m-head" :class="{ scrolled: bodyScrolled }">
      <div class="m-title-row">
        <h1 class="m-title">{{ tabTitle }}</h1>
        <button v-if="tab === 'chat'" class="icon-btn" aria-label="新建会话" @click="emit('new-chat')">
          <Plus :size="19" :stroke-width="2" />
        </button>
      </div>
      <label v-if="tab === 'chat'" class="search">
        <Search class="search-icon" :size="15" :stroke-width="2" />
        <input v-model="keyword" type="search" placeholder="搜索" aria-label="搜索" />
      </label>
    </header>

    <div class="m-body" @scroll.passive="onBodyScroll">
      <template v-if="tab === 'chat'">
        <div
          v-for="(item, index) in list"
          :key="item.id"
          class="m-swipe"
          :style="{
            animation: `fade-up 320ms var(--ease-out) ${index * 30}ms backwards`,
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
            :class="{ swiping: draggingId === item.id }"
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
              size="lg"
            />
            <span class="m-conv-main">
              <span class="m-conv-top">
                <span class="m-conv-name">{{ item.name }}</span>
              </span>
              <span class="m-conv-preview">{{ item.preview }}</span>
            </span>
            <span class="m-conv-meta">
              <span class="conv-time num">{{ item.time }}</span>
              <span v-if="item.unread" class="unread" :class="{ muted: item.muted }">
                <span :key="item.unread">{{ item.unread > 99 ? '99+' : item.unread }}</span>
              </span>
            </span>
          </button>
        </div>

        <p
          v-if="!list.length"
          style="padding: 48px 24px; text-align: center; color: var(--ink-3); font-size: 13px"
        >
          没有匹配的会话
        </p>
      </template>

      <!-- 文件 -->
      <FilesView v-else-if="tab === 'files'" class="m-embed" />

      <ContactsView v-else-if="tab === 'contacts'" class="m-embed" />
      <MeView v-else class="m-embed" />
    </div>

    <nav class="m-tabs" aria-label="主导航">
      <button
        v-for="item in tabs"
        :key="item.key"
        class="m-tab"
        :class="{ active: tab === item.key }"
        :aria-current="tab === item.key ? 'page' : undefined"
        @click="tab = item.key"
      >
        <span class="m-tab-icon">
          <component :is="item.icon" :size="20" :stroke-width="1.85" />
          <span v-if="item.key === 'chat' && totalUnread" class="m-tab-dot">
            {{ totalUnread > 99 ? '99+' : totalUnread }}
          </span>
        </span>
        {{ item.label }}
      </button>
    </nav>

    <!-- 聊天页 -->
    <Transition name="m-chat">
      <section v-if="current" class="m-chat" aria-label="聊天">
        <header class="m-chat-head">
          <button class="icon-btn" aria-label="返回" @click="close">
            <ArrowLeft :size="20" :stroke-width="2" />
          </button>
          <div :key="current.id" class="m-chat-title enter">
            <span class="m-chat-name">{{ current.name }}</span>
            <span class="m-chat-sub">{{ current.context }}</span>
          </div>
          <button class="icon-btn" aria-label="更多">
            <MoreHorizontal :size="20" :stroke-width="2" />
          </button>
        </header>

        <div
          ref="scroller"
          class="m-messages"
          @scroll.passive="onMessageScroll"
          @load.capture="scrollBottom(false)"
        >
          <p v-if="error" class="m-error">{{ error }}</p>
          <p class="day-divider">今天</p>
          <template
            v-for="({ message, grouped, key, enterOrder, pending }) in grouping(currentMessages)"
            :key="key"
          >
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
            <span v-if="!grouped && message.side === 'in'" class="msg-author">
              {{ message.author }}
            </span>
            <div class="msg-body">
              <div class="msg-avatar-slot">
                <button
                  v-if="!grouped"
                  class="avatar-btn"
                  type="button"
                  :aria-label="`查看 ${message.author} 的资料`"
                  @click.stop="openProfile(message.senderId, $event)"
                >
                  <AppAvatar
                    :initials="message.initials"
                    :tone="message.tone"
                    size="sm"
                  />
                </button>
              </div>
              <div class="msg-main">
                <div v-if="message.replyTo" class="m-quote" @click.stop="locateMessage(message.replyTo.messageId)">
                  <span class="m-quote-author">{{ message.replyTo.author }}</span>
                  <span class="m-quote-text">{{ message.replyTo.preview }}</span>
                </div>
                <MessageAttachment
                  v-if="message.attachment && !message.recalled"
                  :attachment="message.attachment"
                />
                <div v-else class="bubble" :class="{ recalled: message.recalled }">
                  {{ message.text }}
                </div>
                <div v-if="translationOf(message)" class="bubble m-translation">
                  <span class="m-translation-head">
                    <Languages :size="10" :stroke-width="2.2" />
                    译文 · {{ translateLabel }}
                  </span>
                  <span>{{ translationOf(message)?.text }}</span>
                </div>
                <div v-else-if="translatingId === midOf(message)" class="bubble m-translation pending">
                  <Loader2 :size="11" class="spin" />
                  翻译中…
                </div>
                <div class="msg-foot">
                  <span class="num">{{ message.time }}</span>
                  <template v-if="message.side === 'out'">
                    <span class="tick" :class="message.read ? 'read' : 'sent'">
                      <CheckCheck v-if="message.read" :size="11" :stroke-width="2.4" />
                      <Check v-else :size="11" :stroke-width="2.4" />
                    </span>
                  </template>
                </div>
              </div>
            </div>
          </div>
          </template>
          <p v-if="loading && !currentMessages.length" :key="`l-${current.id}`" class="m-loading enter">
            <Loader2 :size="15" class="spin" /> 正在加载消息…
          </p>
          <p v-else-if="!currentMessages.length" :key="`e-${current.id}`" class="m-loading enter">
            还没有消息，发一条试试
          </p>
        </div>

        <div class="m-composer-wrap">
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
          <div class="m-composer">
            <button class="icon-btn" aria-label="表情">
              <Smile :size="20" :stroke-width="1.9" />
            </button>
            <textarea
              v-model="draft"
              class="m-input"
              rows="1"
              placeholder="发消息…"
              aria-label="输入消息"
              @keydown.enter.exact.prevent="send"
            />
            <button v-if="!canSend" class="icon-btn" aria-label="附件" @click="triggerAttach">
              <Paperclip :size="20" :stroke-width="1.9" />
            </button>
            <button v-else class="m-send" aria-label="发送" @click="send">
              <Send :size="17" :stroke-width="2.2" />
            </button>
            <input ref="fileInput" type="file" hidden @change="onFilePicked" />
          </div>
        </div>
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
/* 点头像 / 昵称看资料 */
.avatar-btn {
  display: flex;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

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

.bubble.recalled {
  background: transparent;
  border: 1px dashed var(--line-strong);
  color: var(--ink-3);
  font-size: 11.5px;
  font-style: italic;
}

.m-quote {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-width: 100%;
  margin-bottom: 4px;
  padding: 4px 8px;
  border-left: 2px solid var(--accent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ink) 5%, transparent);
}

.m-quote-author {
  font-size: 10px;
  font-weight: 640;
  color: var(--ink-2);
}

.m-quote-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--ink-3);
}

/* 长按选中时不弹系统文本选择菜单 */
.m-chat .msg {
  -webkit-touch-callout: none;
  user-select: none;
}

.msg.flash .msg-main {
  border-radius: 14px;
  animation: msg-flash 1.1s var(--ease-out);
}

@keyframes msg-flash {
  0% {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
  }
  100% {
    box-shadow: 0 0 0 2px transparent;
  }
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

.bubble.m-translation {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 4px;
  border-style: dashed;
  background: color-mix(in srgb, var(--accent) 5%, transparent);
  font-size: 13px;
}

.bubble.m-translation.pending {
  flex-direction: row;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--ink-3);
}

.m-translation-head {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 9.5px;
  color: var(--ink-4);
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
