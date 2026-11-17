<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ObjectDirective } from 'vue'
import {
  Search,
  Phone,
  Video,
  Info,
  Paperclip,
  AtSign,
  Smile,
  Image as ImageIcon,
  Mic,
  Send,
  Check,
  CheckCheck,
  Sparkles,
  Users,
  Loader2,
  X,
  FileText,
  Copy,
  Languages,
  Share2,
  ListChecks,
  Quote,
  Trash2,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import MessageAttachment from './MessageAttachment.vue'
import { resetMagnet, trackMagnet, trackSpotlight } from '../composables/usePointerFx'
import { useTranslatePrefs } from '../composables/useTranslatePrefs'
import { useChatStore } from '../stores/chat'
import type { ChatMessage, Conversation } from '../data/workspace'
import { translateText, type MessageView } from '../api/client'
import { clockTime, humanBytes } from '../utils/present'

const props = defineProps<{
  conversation: Conversation | null
  messages: ChatMessage[]
  detailOpen: boolean
  error?: string | null
  loading?: boolean
  members?: { userId: string | number; nickname: string }[]
}>()

const emit = defineEmits<{
  (e: 'send', text: string, reply?: { messageId: string; senderId: string; preview: string }): void
  (e: 'attach', file: File): void
  (e: 'toggle-detail'): void
  (e: 'forward', message: ChatMessage): void
}>()

const chat = useChatStore()
const draft = ref('')
const mentionOpen = ref(false)
const mentionMembers = computed(() => props.members ?? [])

function onInput() {
  autoGrow()
  mentionOpen.value = draft.value.endsWith('@')
}

function insertMention(nickname: string) {
  const value = draft.value
  draft.value = value.endsWith('@')
    ? `${value.slice(0, -1)}@${nickname} `
    : `${value}@${nickname} `
  mentionOpen.value = false
  autoGrow()
}
const scroller = ref<HTMLElement | null>(null)
/** 是否贴住底部。用户主动往上翻历史时不打断；切会话/自己发消息时强制回到底部。 */
const stickToBottom = ref(true)
const attachmentInput = ref<HTMLInputElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const canSend = computed(() => draft.value.trim().length > 0)

/** 当前会话正在上传/发送的附件任务 */
const activeUploads = computed(() => {
  const id = props.conversation?.id
  if (!id) return []
  return chat.uploads.filter((task) => task.conversationId === id)
})

function cancelUpload(taskId: string) {
  chat.cancelUpload(taskId)
}
const notice = ref('')
let noticeTimer: number | null = null

/* ---------- 消息搜索 ---------- */
const searchOpen = ref(false)
const searchKeyword = ref('')
const searchResults = ref<MessageView[]>([])
const searching = ref(false)
const searchError = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

/* ---------- 表情 ---------- */
const emojiOpen = ref(false)
const emojis = ['😀', '😄', '😊', '🥰', '😎', '🤔', '👍', '👏', '🙏', '🎉', '❤️', '🔥']

/** 已读人数：群聊按成员数估算在线展示。 */
const onlineCount = computed(() =>
  props.conversation?.kind === 'group'
    ? Math.max(2, Math.round((props.conversation.members ?? 6) * 0.5))
    : 0,
)

/* ---------- 切换会话的入场动效 ---------- */
/**
 * 消息节点「首次挂载」时才决定要不要播入场动画：
 * - 切换会话后的一小段时间内、且不是发送中的占位消息 → 播；
 * - 自己发消息、以及之后到达的实时消息 → 直接出现，不做动画。
 * 用指令而不是 class 绑定，动画跑起来之后门控关掉也不会把 class 摘掉。
 */
let enterArmed = false
let enterTimer: number | null = null

function armEnter() {
  enterArmed = true
  if (enterTimer !== null) window.clearTimeout(enterTimer)
  // 空会话或加载很慢时兜底：超过 1.2s 到达的消息按普通实时消息处理
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

/**
 * 消息气泡本身不做「新消息」入场动画：自己发的消息应该在按下回车的下一帧就出现。
 * 这里负责分组，以及给每条消息一个稳定 key —— 乐观占位与服务端消息共用
 * clientMsgId，确认到达时 Vue 复用同一个节点，不会重建重排。
 */
const grouping = computed(() => {
  const usedKeys = new Set<string>()
  return props.messages.map((message, index) => {
    const prev = props.messages[index - 1]
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
})

function showNotice(text: string) {
  notice.value = text
  if (noticeTimer) window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => (notice.value = ''), 2600)
}

/* ---------- 消息右键菜单 / 多选 ---------- */
type MenuState = { x: number; y: number; message: ChatMessage }

const MENU_WIDTH = 178
const MENU_HEIGHT = 232
/** 后端撤回窗口：发送者本人 2 分钟内 */
const RECALL_WINDOW_MS = 2 * 60 * 1000

const menu = ref<MenuState | null>(null)
const selecting = ref(false)
const selected = ref<string[]>([])

const selectedMessages = computed(() =>
  props.messages.filter((message) => selected.value.includes(message.id)),
)

function openMenu(event: MouseEvent, message: ChatMessage) {
  if (selecting.value) return
  const x = Math.max(8, Math.min(event.clientX, window.innerWidth - MENU_WIDTH - 8))
  const y = Math.max(8, Math.min(event.clientY, window.innerHeight - MENU_HEIGHT - 8))
  menu.value = { x, y, message }
}

function closeMenu() {
  menu.value = null
}

function onGlobalPointerDown(event: PointerEvent) {
  if (!menu.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('.msg-menu')) return
  closeMenu()
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  closeMenu()
  if (selecting.value) exitSelect()
}

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

function copyTextOf(message: ChatMessage): string {
  if (message.recalled) return ''
  if (message.attachment) {
    const { name, size } = message.attachment
    return size ? `${name} (${size})` : name
  }
  return message.text
}

async function copyMessage(message: ChatMessage) {
  closeMenu()
  const text = copyTextOf(message)
  if (!text) {
    showNotice('这条消息没有可复制的内容')
    return
  }
  showNotice((await copyText(text)) ? '已复制' : '复制失败，请手动选择文本')
}

function startSelect(message: ChatMessage) {
  selecting.value = true
  selected.value = [message.id]
  closeMenu()
}

function isSelected(message: ChatMessage) {
  return selected.value.includes(message.id)
}

function toggleSelect(message: ChatMessage) {
  selected.value = isSelected(message)
    ? selected.value.filter((id) => id !== message.id)
    : [...selected.value, message.id]
}

function exitSelect() {
  selecting.value = false
  selected.value = []
}

async function copySelected() {
  const text = selectedMessages.value.map(copyTextOf).filter(Boolean).join('\n')
  if (!text) {
    showNotice('所选消息没有可复制的内容')
    return
  }
  const count = selectedMessages.value.length
  const ok = await copyText(text)
  exitSelect()
  showNotice(ok ? `已复制 ${count} 条` : '复制失败，请手动选择文本')
}

/**
 * 能否走服务端撤回：自己的消息、未撤回、未在发送中、且 2 分钟窗口内。
 */
function canRecall(message: ChatMessage): boolean {
  if (!message.mine || message.recalled || message.pending) return false
  const createdAt = message.createdAt ? new Date(message.createdAt).getTime() : 0
  return !!createdAt && Date.now() - createdAt <= RECALL_WINDOW_MS
}

/**
 * 删除：自己的消息先尝试服务端撤回（2 分钟内），
 * 其余情况（超出窗口 / 别人的消息 / 已撤回）只在本机隐藏。
 */
async function deleteMessage(message: ChatMessage) {
  closeMenu()
  const conversationId = props.conversation?.id
  if (!conversationId) return
  if (message.pending) {
    showNotice('消息还在发送中，请稍后再删除')
    return
  }
  const messageId = String(message.messageId ?? message.id)

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

async function deleteSelected() {
  const list = selectedMessages.value.filter((message) => !message.pending)
  const skipped = selectedMessages.value.length - list.length
  if (!list.length) {
    exitSelect()
    showNotice(skipped ? '发送中的消息不能删除' : '没有可删除的消息')
    return
  }
  exitSelect()
  for (const message of list) await deleteMessage(message)
  showNotice(
    skipped ? `已删除 ${list.length} 条，${skipped} 条发送中已跳过` : `已删除 ${list.length} 条`,
  )
}

function forwardMessage(message: ChatMessage) {
  closeMenu()
  emit('forward', message)
}

/* ---------- 引用 ---------- */
type ReplyDraft = { messageId: string; senderId: string; author: string; preview: string }

const replyTo = ref<ReplyDraft | null>(null)

/** 引用快照：文本截断、附件转成占位词，与后端 replyPreview 保持一致。 */
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
  const senderId = String(message.mine ? chat.myId : (message.senderId ?? ''))
  replyTo.value = {
    messageId: String(message.messageId ?? message.id),
    senderId,
    author: message.author,
    preview: quotePreviewOf(message),
  }
  nextTick(() => document.getElementById('composer-input')?.focus())
}

function cancelQuote() {
  replyTo.value = null
}

/** 点击引用块定位原消息；不在已加载范围时给出提示。 */
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

/** 译文按消息 id 存；切换会话不清空，回来还能看到。 */
const translations = ref<Record<string, { text: string; to: string }>>({})
const translatingId = ref<string | null>(null)

function midOf(message: ChatMessage): string {
  return String(message.messageId ?? message.id)
}

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

function send() {
  if (!canSend.value) return
  disarmEnter()
  const reply = replyTo.value
    ? {
        messageId: replyTo.value.messageId,
        senderId: replyTo.value.senderId,
        preview: replyTo.value.preview,
      }
    : undefined
  emit('send', draft.value.trim(), reply)
  replyTo.value = null
  draft.value = ''
  emojiOpen.value = false
  autoGrow()
  stickToBottom.value = true
  scrollToBottom(true)
}

function autoGrow() {
  const el = document.getElementById('composer-input') as HTMLTextAreaElement | null
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 164)}px`
}

function pickAttachment(kind: 'file' | 'image') {
  if (kind === 'image') imageInput.value?.click()
  else attachmentInput.value?.click()
}

function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('attach', file)
  input.value = ''
}

function insertEmoji(emoji: string) {
  draft.value += emoji
  emojiOpen.value = false
  autoGrow()
}

/**
 * 每个会话记住自己的滚动位置：切走再切回来应该停在原处，
 * 而不是重新拉到最底部（那会看起来像整页重新加载）。
 */
const scrollMemory = new Map<string, { top: number; stick: boolean }>()

function rememberScroll(conversationId?: string | null) {
  const el = scroller.value
  if (!conversationId || !el) return
  scrollMemory.set(conversationId, { top: el.scrollTop, stick: stickToBottom.value })
  if (scrollMemory.size > 60) {
    const oldest = scrollMemory.keys().next().value
    if (oldest !== undefined) scrollMemory.delete(oldest)
  }
}

function restoreScroll(conversationId: string) {
  const saved = scrollMemory.get(conversationId)
  stickToBottom.value = saved ? saved.stick : true
  const target = saved && !saved.stick ? saved.top : null
  nextTick(() => {
    const el = scroller.value
    if (!el) return
    if (target == null) {
      el.scrollTop = el.scrollHeight
      return
    }
    el.scrollTop = Math.min(target, Math.max(0, el.scrollHeight - el.clientHeight))
  })
}

function scrollToBottom(force = false) {
  if (!force && !stickToBottom.value) return
  nextTick(() => {
    const el = scroller.value
    if (!el) return
    el.scrollTop = el.scrollHeight
    stickToBottom.value = true
  })
}

function onScroll() {
  const el = scroller.value
  if (!el) return
  closeMenu()
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight <= 48
}

/** 图片/附件加载后高度会变化，贴底时重新对齐。 */
function onContentLoad() {
  scrollToBottom(false)
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  document.addEventListener('pointerdown', onGlobalPointerDown, true)
  document.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('blur', closeMenu)

  const el = scroller.value
  if (!el || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => scrollToBottom(false))
  resizeObserver.observe(el)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onGlobalPointerDown, true)
  document.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('blur', closeMenu)
  resizeObserver?.disconnect()
  resizeObserver = null
  if (noticeTimer) window.clearTimeout(noticeTimer)
  disarmEnter()
})

function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (searchOpen.value) {
    nextTick(() => searchInput.value?.focus())
  } else {
    searchKeyword.value = ''
    searchResults.value = []
    searchError.value = ''
  }
}

async function runSearch() {
  const keyword = searchKeyword.value.trim()
  if (!keyword || !props.conversation) return
  searching.value = true
  searchError.value = ''
  try {
    searchResults.value = await chat.searchMessages(props.conversation.id, keyword)
  } catch (e) {
    searchError.value = e instanceof Error ? e.message : '搜索失败'
    searchResults.value = []
  } finally {
    searching.value = false
  }
}

function jumpTo(message: MessageView) {
  const el = scroller.value?.querySelector<HTMLElement>(`[data-mid="${message.messageId}"]`)
  if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  searchOpen.value = false
}

function previewText(message: MessageView): string {
  if (message.recalled) return '消息已撤回'
  if (message.type === 'TEXT') return message.content
  if (message.type === 'IMAGE') return '[图片]'
  if (message.type === 'VIDEO') return '[视频]'
  if (message.type === 'AUDIO') return '[语音]'
  if (message.type === 'FILE') return '[文件]'
  return `[${message.type}]`
}

// 会话切换必须先于消息长度监听执行，否则离开时会以新内容的高度覆盖旧的滚动位置
watch(
  () => props.conversation?.id,
  (newId, oldId) => {
    rememberScroll(oldId)
    closeMenu()
    exitSelect()
    if (!newId) {
      disarmEnter()
      return
    }
    armEnter()
    restoreScroll(newId)
    // 有缓存的会话是同步渲染的：这一帧结束就收掉门控，避免把下一帧的实时消息也带上动画
    nextTick(() => {
      if (props.messages.length) disarmEnter()
    })
  },
  { immediate: true },
)

// 需要异步加载的会话：等首批消息真正渲染完再收门控
watch(
  () => props.messages.length,
  (len) => {
    if (!enterArmed || !len) return
    // 指令的 mounted 在 post 队列里，必须等整个 flush 结束（nextTick）再关门控
    nextTick(disarmEnter)
  },
)

watch(() => props.messages.length, () => scrollToBottom())
</script>

<template>
  <section class="chat-pane" aria-label="聊天窗口">
    <template v-if="conversation">
      <header class="chat-head">
        <AppAvatar
          :key="conversation.id"
          class="enter"
          :initials="conversation.initials"
          :tone="conversation.tone"
          :presence="conversation.presence"
          :rounded="conversation.kind === 'group'"
          size="sm"
        />
        <div :key="conversation.id" class="chat-head-main enter">
          <h2 class="chat-title">
            {{ conversation.name }}
            <span v-if="conversation.kind === 'group'" class="stat-chip">
              <Users :size="9" :stroke-width="2.4" />
              {{ conversation.members }}
            </span>
            <span v-if="conversation.presence === 'online'" class="stat-chip live">
              {{ onlineCount || 1 }} 在线
            </span>
          </h2>
          <p class="chat-sub truncate">{{ conversation.context }}</p>
        </div>

        <div class="chat-actions">
          <button
            class="icon-btn"
            :class="{ on: searchOpen }"
            aria-label="搜索聊天记录"
            @click="toggleSearch"
          >
            <Search :size="16" :stroke-width="1.9" />
          </button>
          <button class="icon-btn" aria-label="语音通话" @click="showNotice('语音通话暂未开放')">
            <Phone :size="16" :stroke-width="1.9" />
          </button>
          <button class="icon-btn" aria-label="视频通话" @click="showNotice('视频通话暂未开放')">
            <Video :size="16" :stroke-width="1.9" />
          </button>
          <button
            class="icon-btn"
            :class="{ on: detailOpen }"
            aria-label="会话详情"
            :aria-pressed="detailOpen"
            @click="emit('toggle-detail')"
          >
            <Info :size="16" :stroke-width="1.9" />
          </button>
        </div>
      </header>

      <div v-if="searchOpen" class="chat-search">
        <label class="search">
          <Search class="search-icon" :size="14" :stroke-width="2" />
          <input
            ref="searchInput"
            v-model="searchKeyword"
            type="search"
            placeholder="搜索聊天记录，回车开始"
            @keydown.enter.prevent="runSearch"
          />
        </label>
        <button class="icon-btn sm" aria-label="关闭搜索" @click="toggleSearch">
          <X :size="14" :stroke-width="2" />
        </button>
        <div v-if="searchKeyword.trim()" class="search-results">
          <p v-if="searchError" class="search-error">{{ searchError }}</p>
          <p v-else-if="searching" class="search-empty">搜索中…</p>
          <button
            v-for="item in searchResults"
            :key="item.messageId"
            class="search-hit"
            @click="jumpTo(item)"
          >
            <span class="search-hit-main">{{ previewText(item) }}</span>
            <span class="search-hit-meta num">
              #{{ item.seq }} · {{ clockTime(item.createdAt) }}
            </span>
          </button>
          <p v-if="!searching && !searchError && !searchResults.length" class="search-empty">
            没有找到相关消息
          </p>
        </div>
      </div>

      <div
        ref="scroller"
        class="messages"
        @scroll.passive="onScroll"
        @load.capture="onContentLoad"
      >
        <p class="day-divider">聊天记录</p>

        <div v-if="loading && !messages.length" :key="conversation.id" class="msg-loading enter">
          <Loader2 :size="16" class="spin" />
          正在加载消息…
        </div>

        <div
          v-for="({ message, grouped, key, enterOrder, pending }) in grouping"
          :key="key"
          v-enter="{ order: enterOrder, skip: pending }"
          class="msg"
          :class="{ out: message.side === 'out', grouped, selecting, selected: isSelected(message) }"
          :data-mid="message.id"
          @contextmenu.prevent="openMenu($event, message)"
          @click="selecting && toggleSelect(message)"
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
              <span v-if="selecting" class="msg-check">
                <Check v-if="isSelected(message)" :size="11" :stroke-width="3.2" />
              </span>

              <button
                v-if="message.replyTo"
                class="quote-block"
                type="button"
                :title="`定位到 ${message.replyTo.author} 的消息`"
                @click.stop="locateMessage(message.replyTo.messageId)"
              >
                <span class="quote-block-author">{{ message.replyTo.author }}</span>
                <span class="quote-block-text">{{ message.replyTo.preview }}</span>
              </button>

              <MessageAttachment
                v-if="message.attachment"
                :attachment="message.attachment"
              />

              <div v-else-if="message.recalled" class="bubble recalled">消息已撤回</div>

              <div v-else class="bubble">{{ message.text }}</div>

              <div v-if="translationOf(message)" class="bubble translation">
                <span class="translation-head">
                  <Languages :size="11" :stroke-width="2" />
                  译文 · {{ translateLabel }}
                </span>
                <span class="translation-text">{{ translationOf(message)?.text }}</span>
              </div>
              <div v-else-if="translatingId === midOf(message)" class="bubble translation pending">
                <Loader2 :size="12" class="spin" />
                翻译中…
              </div>

              <div class="msg-foot">
                <span class="num">{{ message.time }}</span>
                <template v-if="message.side === 'out'">
                  <span class="tick" :class="message.read ? 'read' : 'sent'">
                    <CheckCheck v-if="message.read" :size="12" :stroke-width="2.4" />
                    <Check v-else :size="12" :stroke-width="2.4" />
                  </span>
                </template>
              </div>
            </div>
          </div>
        </div>

        <p
          v-if="!loading && !messages.length"
          :key="conversation.id"
          class="messages-empty enter"
        >
          还没有消息，发一句问候吧。
        </p>
      </div>

      <div class="composer-wrap">
        <div v-if="selecting" class="msg-select-bar">
          <span>已选 <strong>{{ selected.length }}</strong> 条</span>
          <span class="spacer" />
          <button class="select-btn" @click="copySelected">复制</button>
          <button class="select-btn danger" @click="deleteSelected">删除</button>
          <button class="select-btn" @click="exitSelect">取消</button>
        </div>

        <p v-if="error" class="send-error">{{ error }}</p>
        <p v-if="notice" class="send-notice">{{ notice }}</p>

        <!-- 上传进度：细线、低对比，传完即消失 -->
        <div v-if="activeUploads.length" class="upload-list">
          <div v-for="task in activeUploads" :key="task.id" class="upload-item">
            <span class="upload-thumb">
              <img v-if="task.previewUrl" :src="task.previewUrl" alt="" />
              <FileText v-else :size="13" :stroke-width="1.8" />
            </span>
            <span class="upload-main">
              <span class="upload-head">
                <span class="upload-name truncate">{{ task.name }}</span>
                <span class="upload-size num">{{ humanBytes(task.sizeBytes) }}</span>
                <span class="upload-pct num">
                  <template v-if="task.phase === 'prepare'">处理中</template>
                  <template v-else-if="task.phase === 'send'">发送中</template>
                  <template v-else>{{ Math.round(task.progress * 100) }}%</template>
                </span>
              </span>
              <span class="upload-track">
                <span
                  class="upload-fill"
                  :class="{ done: task.phase === 'send' }"
                  :style="{ width: `${Math.max(2, Math.round(task.progress * 100))}%` }"
                />
              </span>
            </span>
            <button
              class="upload-cancel"
              type="button"
              aria-label="取消上传"
              @click="cancelUpload(task.id)"
            >
              <X :size="12" :stroke-width="2" />
            </button>
          </div>
        </div>

        <div v-if="emojiOpen" class="emoji-panel">
          <button
            v-for="emoji in emojis"
            :key="emoji"
            class="emoji"
            type="button"
            @click="insertEmoji(emoji)"
          >
            {{ emoji }}
          </button>
        </div>

        <div v-if="replyTo" class="quote-bar">
          <Quote :size="13" :stroke-width="2" />
          <span class="quote-bar-main">
            <span class="quote-bar-author">引用 {{ replyTo.author }}</span>
            <span class="quote-bar-text">{{ replyTo.preview }}</span>
          </span>
          <button class="icon-btn sm" type="button" aria-label="取消引用" @click="cancelQuote">
            <X :size="13" :stroke-width="2" />
          </button>
        </div>

        <div
          class="composer spot"
          style="--spot-size: 420px"
          @pointermove="trackSpotlight"
        >
          <div v-if="mentionOpen" class="mention-pop">
            <p class="mention-title">选择要提及的成员</p>
            <button v-for="m in mentionMembers" :key="m.userId" class="mention-item" @click="insertMention(m.nickname)">
              {{ m.nickname }}
            </button>
            <p v-if="!mentionMembers.length" class="mention-empty">暂无成员资料</p>
          </div>

          <div class="composer-tools">
            <button class="icon-btn sm" aria-label="提及成员" @click="mentionOpen = !mentionOpen">
              <AtSign :size="15" :stroke-width="1.9" />
            </button>
            <button class="icon-btn sm" aria-label="附件" @click="pickAttachment('file')">
              <Paperclip :size="15" :stroke-width="1.9" />
            </button>
            <button class="icon-btn sm" aria-label="表情" @click="emojiOpen = !emojiOpen">
              <Smile :size="15" :stroke-width="1.9" />
            </button>
            <button class="icon-btn sm" aria-label="图片、视频或音频" @click="pickAttachment('image')">
              <ImageIcon :size="15" :stroke-width="1.9" />
            </button>
            <button class="icon-btn sm" aria-label="语音" @click="showNotice('语音消息暂未开放')">
              <Mic :size="15" :stroke-width="1.9" />
            </button>
            <input
              ref="attachmentInput"
              type="file"
              hidden
              @change="onFilePicked"
            />
            <input
              ref="imageInput"
              type="file"
              accept="image/*,video/*,audio/*"
              hidden
              @change="onFilePicked"
            />
          </div>

          <textarea
            id="composer-input"
            v-model="draft"
            class="composer-input"
            rows="1"
            placeholder="输入消息，Enter 发送，Shift + Enter 换行"
            aria-label="输入消息"
            @input="onInput"
            @keydown.enter.exact.prevent="send"
          />

          <div class="composer-bar">
            <span class="composer-hint">
              <Sparkles :size="10" :stroke-width="2.2" />
              支持发送图片、视频与文件
            </span>
            <button
              class="send-btn"
              :disabled="!canSend"
              @pointermove="(e) => canSend && trackMagnet(e, 0.14)"
              @pointerleave="resetMagnet"
              @click="send"
            >
              <Send :size="12" :stroke-width="2.3" />
              发送
            </button>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="empty">
      <div class="empty-mark">
        <Search :size="22" :stroke-width="1.6" />
      </div>
      <h3 class="empty-title">选择一个会话</h3>
      <p class="empty-text">从左侧列表挑一个对话，或者新建一个开始聊天。</p>
    </div>

    <Teleport to="body">
      <div
        v-if="menu"
        class="msg-menu"
        role="menu"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        @contextmenu.prevent
      >
        <button class="msg-menu-item" role="menuitem" @click="copyMessage(menu.message)">
          <Copy :size="14" :stroke-width="1.9" />
          复制
        </button>
        <button
          class="msg-menu-item"
          role="menuitem"
          :disabled="menu.message.recalled || !!menu.message.attachment"
          @click="translateMessage(menu.message)"
        >
          <Languages :size="14" :stroke-width="1.9" />
          {{ translationOf(menu.message) ? '收起译文' : '翻译' }}
          <span class="msg-menu-tag">{{ translateLabel }}</span>
        </button>
        <button class="msg-menu-item" role="menuitem" @click="forwardMessage(menu.message)">
          <Share2 :size="14" :stroke-width="1.9" />
          转发
        </button>
        <button class="msg-menu-item" role="menuitem" @click="startSelect(menu.message)">
          <ListChecks :size="14" :stroke-width="1.9" />
          多选
        </button>
        <button
          class="msg-menu-item"
          role="menuitem"
          :disabled="!canQuote(menu.message)"
          @click="quoteMessage(menu.message)"
        >
          <Quote :size="14" :stroke-width="1.9" />
          引用
        </button>
        <div class="msg-menu-sep" />
        <button
          class="msg-menu-item danger"
          role="menuitem"
          @click="deleteMessage(menu.message)"
        >
          <Trash2 :size="14" :stroke-width="1.9" />
          删除
          <span v-if="!canRecall(menu.message)" class="msg-menu-tag">仅本机</span>
        </button>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.send-error {
  margin: 0 0 6px;
  padding: 6px 10px;
  border-radius: var(--r-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 11.5px;
}

.send-notice {
  margin: 0 0 6px;
  padding: 6px 10px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  color: var(--ink-2);
  font-size: 11.5px;
}

/* ---------- 引用 ---------- */
.quote-bar {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 6px 6px;
  padding: 6px 9px;
  border-radius: var(--r-sm);
  border-left: 2px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 7%, transparent);
  color: var(--ink-3);
}

.quote-bar-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.quote-bar-author {
  font-size: 10.5px;
  font-weight: 640;
  color: var(--ink-2);
}

.quote-bar-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
}

.quote-block {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-width: 100%;
  margin-bottom: 4px;
  padding: 5px 9px;
  border: 0;
  border-left: 2px solid var(--accent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ink) 4%, transparent);
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-1) var(--ease-out);
}

.quote-block:hover {
  background: color-mix(in srgb, var(--ink) 7%, transparent);
}

.quote-block-author {
  font-size: 10.5px;
  font-weight: 640;
  color: var(--ink-2);
}

.quote-block-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--ink-3);
}

/* 定位原消息时闪一下描边，不动画布局。 */
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

/* ---------- 译文 ---------- */
.bubble.translation {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 4px;
  border-style: dashed;
  background: color-mix(in srgb, var(--accent) 5%, transparent);
}

.translation-head {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: var(--ink-4);
}

.translation-text {
  font-size: 13px;
  line-height: 1.6;
}

.bubble.translation.pending {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  color: var(--ink-3);
  font-size: 11.5px;
}

.msg-menu-item:disabled {
  color: var(--ink-4);
  cursor: not-allowed;
}

.msg-menu-item:disabled:hover {
  background: transparent;
  color: var(--ink-4);
}

.msg-loading,
.messages-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 28px 12px;
  color: var(--ink-3);
  font-size: 12px;
}

.bubble.recalled {
  color: var(--ink-3);
  font-style: italic;
  background: var(--surface-3);
}

.chat-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}

.chat-search .search {
  flex: 1;
}

.search-results {
  position: absolute;
  top: calc(100% + 4px);
  left: 14px;
  right: 14px;
  z-index: 20;
  max-height: 320px;
  overflow-y: auto;
  padding: 6px;
  border-radius: var(--r-md);
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.search-hit {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 9px;
  border-radius: var(--r-sm);
  text-align: left;
}

.search-hit:hover {
  background: var(--surface-hover);
}

.search-hit-main {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
}

.search-hit-meta {
  font-size: 10.5px;
  color: var(--ink-3);
  flex-shrink: 0;
}

.search-empty,
.search-error {
  padding: 12px;
  text-align: center;
  font-size: 11.5px;
  color: var(--ink-3);
}

.search-error {
  color: var(--danger);
}

.emoji-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
  padding: 8px;
  border-radius: var(--r-md);
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.emoji {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: var(--r-xs);
  font-size: 17px;
}

.emoji:hover {
  background: var(--surface-hover);
}

.spin {
  animation: tick-spin 900ms linear infinite;
}
</style>

<style scoped>
.mention-pop {
  position: absolute;
  left: 10px;
  bottom: calc(100% + 8px);
  z-index: 20;
  min-width: 172px;
  max-height: 220px;
  overflow-y: auto;
  padding: 6px;
  border-radius: var(--r-sm);
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-pop);
  animation: pop-in 160ms var(--ease-spring);
}

.mention-title {
  font-size: 9.5px;
  font-weight: 660;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-3);
  padding: 2px 6px 5px;
}

.mention-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  border-radius: var(--r-xs);
  font-size: 12.5px;
  color: var(--ink-2);
}

.mention-item:hover {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.mention-empty {
  padding: 8px;
  font-size: 11.5px;
  color: var(--ink-4);
}
</style>