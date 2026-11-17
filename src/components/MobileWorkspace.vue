<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type ObjectDirective } from 'vue'
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
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import ContactsView from './ContactsView.vue'
import FilesView from './FilesView.vue'
import MeView from './MeView.vue'
import MessageAttachment from './MessageAttachment.vue'
import { useTranslatePrefs } from '../composables/useTranslatePrefs'
import { useChatStore } from '../stores/chat'
import { translateText } from '../api/client'
import type { ChatMessage, Conversation } from '../data/workspace'

type ReplyRef = { messageId: string; senderId: string; preview: string }

const props = defineProps<{
  conversations: Conversation[]
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

const current = computed(
  () => props.conversations.find((item) => item.id === props.activeId) ?? null,
)

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
const RECALL_WINDOW_MS = 2 * 60 * 1000

const menu = ref<MenuState | null>(null)
const notice = ref('')
let noticeTimer: number | null = null

function showNotice(text: string) {
  notice.value = text
  if (noticeTimer !== null) window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => (notice.value = ''), 2200)
}

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

function cancelPress() {
  if (!press) return
  window.clearTimeout(press.timer)
  press = null
}

function beginPress(event: PointerEvent, message: ChatMessage) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  cancelPress()
  const state: PressState = {
    x: event.clientX,
    y: event.clientY,
    startX: event.clientX,
    startY: event.clientY,
    timer: 0,
  }
  state.timer = window.setTimeout(() => {
    press = null
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

function midOf(message: ChatMessage): string {
  return String(message.messageId ?? message.id)
}

/* ---------- 复制 / 删除 ---------- */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.top = '-1000px'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

function copyMessage(message: ChatMessage) {
  closeMenu()
  if (message.recalled) {
    showNotice('这条消息没有可复制的内容')
    return
  }
  const text = message.attachment
    ? message.attachment.size
      ? `${message.attachment.name} (${message.attachment.size})`
      : message.attachment.name
    : message.text
  void copyText(text).then((ok) => showNotice(ok ? '已复制' : '复制失败'))
}

function canRecall(message: ChatMessage): boolean {
  if (!message.mine || message.recalled || message.pending) return false
  const createdAt = message.createdAt ? new Date(message.createdAt).getTime() : 0
  return !!createdAt && Date.now() - createdAt <= RECALL_WINDOW_MS
}

async function deleteMessage(message: ChatMessage) {
  closeMenu()
  const conversationId = props.activeId
  if (!conversationId) return
  if (message.pending) {
    showNotice('消息还在发送中')
    return
  }
  const messageId = midOf(message)
  if (canRecall(message)) {
    try {
      await chat.recallMessage(conversationId, messageId)
      showNotice('已撤回')
    } catch (e) {
      showNotice(e instanceof Error ? e.message : '撤回失败')
    }
    return
  }
  chat.hideMessage(conversationId, messageId)
  showNotice('已从本机删除')
}

/* ---------- 引用 ---------- */
const replyTo = ref<(ReplyRef & { author: string }) | null>(null)

function quotePreviewOf(message: ChatMessage): string {
  if (message.recalled) return '消息已撤回'
  if (message.attachment) {
    const kind = message.attachment.kind
    if (kind === 'image') return '[图片]'
    if (kind === 'video') return '[视频]'
    if (kind === 'audio') return '[语音]'
    return '[文件]'
  }
  const text = message.text.replace(/\s+/g, ' ').trim()
  if (!text) return '消息'
  return text.length <= 120 ? text : `${text.slice(0, 120)}…`
}

function canQuote(message: ChatMessage): boolean {
  return !message.recalled && !message.pending
}

function quoteMessage(message: ChatMessage) {
  closeMenu()
  if (!canQuote(message)) {
    showNotice('这条消息不能引用')
    return
  }
  replyTo.value = {
    messageId: midOf(message),
    senderId: String(message.mine ? chat.myId : (message.senderId ?? '')),
    author: message.author,
    preview: quotePreviewOf(message),
  }
}

function cancelQuote() {
  replyTo.value = null
}

function locateMessage(messageId: string) {
  const el = scroller.value?.querySelector<HTMLElement>(`[data-mid="${messageId}"]`)
  if (!el) {
    showNotice('原消息不在当前已加载的记录里')
    return
  }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.classList.add('flash')
  window.setTimeout(() => el.classList.remove('flash'), 1200)
}

/* ---------- 翻译 ---------- */
const { target: translateTarget, label: translateLabel } = useTranslatePrefs()
const translations = ref<Record<string, { text: string; to: string }>>({})
const translatingId = ref<string | null>(null)

function translationOf(message: ChatMessage) {
  return translations.value[midOf(message)]
}

async function translateMessage(message: ChatMessage) {
  closeMenu()
  const id = midOf(message)
  if (translations.value[id]) {
    const next = { ...translations.value }
    delete next[id]
    translations.value = next
    return
  }
  if (message.recalled) {
    showNotice('已撤回的消息不能翻译')
    return
  }
  if (message.attachment) {
    showNotice('暂不支持翻译附件消息')
    return
  }
  const text = message.text.trim()
  if (!text) return
  translatingId.value = id
  try {
    const result = await translateText(text, translateTarget.value)
    translations.value = { ...translations.value, [id]: { text: result.text, to: result.to } }
  } catch (e) {
    showNotice(e instanceof Error ? e.message : '翻译失败')
  } finally {
    translatingId.value = null
  }
}

function forwardMessage(message: ChatMessage) {
  closeMenu()
  emit('forward', message)
}

onBeforeUnmount(() => {
  cancelPress()
  if (noticeTimer !== null) window.clearTimeout(noticeTimer)
  document.removeEventListener('pointerdown', onDocPointerDown, true)
})

document.addEventListener('pointerdown', onDocPointerDown, true)
</script>

<template>
  <div class="m-shell">
    <header class="m-head" :class="{ scrolled: bodyScrolled }">
      <div class="m-title-row">
        <h1 class="m-title">
          {{ tabTitle }}
          <span v-if="tab === 'chat' && totalUnread" class="list-count num">
            {{ totalUnread }}
          </span>
        </h1>
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
        <button
          v-for="(item, index) in list"
          :key="item.id"
          class="m-conv"
          :style="{
            animation: `fade-up 320ms var(--ease-out) ${index * 30}ms backwards`,
          }"
          @click="open(item.id)"
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
          <div
            v-for="({ message, grouped, key, enterOrder, pending }) in grouping(currentMessages)"
            :key="key"
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
                <AppAvatar
                  v-if="!grouped"
                  :initials="message.initials"
                  :tone="message.tone"
                  size="sm"
                />
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
