<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useToast } from '../composables/useToast'
import { useMessageActions } from '../composables/useMessageActions'
import { useMessageLocator } from '../composables/useMessageLocator'
import { useEnterAnimation } from '../composables/useEnterAnimation'
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
  Star,
  Trash2,
  CircleAlert,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import MessageAttachment from './MessageAttachment.vue'
import StickerPicker from './StickerPicker.vue'
import { resetMagnet, trackMagnet, trackSpotlight } from '../composables/usePointerFx'
import { useTranslatePrefs } from '../composables/useTranslatePrefs'
import { useChatStore } from '../stores/chat'
import { useAuthStore } from '../stores/auth'
import type { ChatMessage, Conversation } from '../types/chat'
import { groupAvatarSrc, userAvatarSrc } from '../utils/avatar'
import { humanBytes } from '../utils/present'
import { stableMessageKey } from '../utils/message'

const props = defineProps<{
  conversation: Conversation | null
  messages: ChatMessage[]
  detailOpen: boolean
  error?: string | null
  loading?: boolean
  members?: { userId: string | number; nickname: string; remark?: string | null; online?: boolean }[]
}>()

const emit = defineEmits<{
  (e: 'send', text: string, reply?: { messageId: string; senderId: string; preview: string }): void
  (e: 'attach', file: File): void
  (e: 'toggle-detail'): void
  (e: 'favorite', message: ChatMessage): void
  (e: 'forward', message: ChatMessage): void
  (e: 'profile', userId: string, anchor?: HTMLElement): void
}>()

const chat = useChatStore()
const auth = useAuthStore()
const draft = ref('')
const mentionOpen = ref(false)
/**
 * 可提及的人：群聊取成员列表（去掉自己）；单聊不需要额外请求，
 * 直接把对端当成唯一的候选——之前单聊没加载成员，@ 面板永远是空的。
 */
const mentionMembers = computed(() => {
  const selfId = String(auth.user?.userId ?? '')
  const loaded = (props.members ?? []).filter(
    (member) => String(member.userId) !== selfId,
  )
  if (loaded.length) return loaded
  const conversation = props.conversation
  if (conversation?.kind === 'direct' && conversation.name) {
    return [
      {
        userId: conversation.peerId ?? 'peer',
        nickname: conversation.name,
        remark: null as string | null,
      },
    ]
  }
  return []
})

/**
 * 聊天里点头像 / 昵称看资料：单聊是对方，群聊是发言人，自己就是自己。
 * 多选状态下点击仍然交给消息本体处理，用来勾选而不是弹资料卡。
 */
function openProfile(userId?: string | null, event?: MouseEvent) {
  if (!userId) return
  emit('profile', String(userId), (event?.currentTarget as HTMLElement) ?? undefined)
}

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
  // 鼠标点候选会把焦点留在按钮上；把光标放回输入框末尾，接着打字即可。
  nextTick(focusComposer)
}
const scroller = ref<HTMLElement | null>(null)
/** 是否贴住底部。用户主动往上翻历史时不打断；切会话/自己发消息时强制回到底部。 */
const stickToBottom = ref(true)
let scrollEpoch = 0
const focusMessage = useMessageLocator(() => scroller.value, () => {
  ++scrollEpoch
  stickToBottom.value = false
})
defineExpose({ focusMessage })
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
const { message: notice, show: showNotice } = useToast()

/* 消息级操作（复制/引用/撤回/删除/定位/翻译）与移动端共用一份实现。 */
const {
  replyTo, translatingId, midOf, copyText, copyTextOf, copyMessage,
  canRecall, deleteMessage, canQuote, quoteMessage, cancelQuote,
  locateMessage, translationOf, translateMessage, forwardMessage,
} = useMessageActions({
  conversationId: () => props.conversation?.id,
  scroller: () => scroller.value,
  myId: () => String(chat.myId),
  closeMenu,
  showNotice,
  recall: (conversationId, messageId) => chat.recallMessage(conversationId, messageId),
  hideMessage: (conversationId, messageId) => chat.hideMessage(conversationId, messageId),
  forward: (message) => emit('forward', message),
  focusComposer: () => document.getElementById('composer-input')?.focus(),
})

/* ---------- 表情 ---------- */
const emojiOpen = ref(false)
/** 表情面板两个页签：内置表情 / 搜网络表情包。 */
const emojiTab = ref<'emoji' | 'sticker'>('emoji')
const emojis = ['😀', '😄', '😊', '🥰', '😎', '🤔', '👍', '👏', '🙏', '🎉', '❤️', '🔥']

/** 群聊在线人数：直接数成员在线状态（由成员接口与实时刷新维护），不再按人数估算。 */
const onlineCount = computed(() =>
  props.conversation?.kind === 'group'
    ? (props.members ?? []).filter((member) => member.online).length
    : 0,
)

/* ---------- 切换会话的入场动效（桌面端与移动端共用门控） ---------- */
const { arm: armEnter, disarm: disarmEnter, vEnter } = useEnterAnimation(
  () => props.messages.length,
)

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
    const key = stableMessageKey(message, index, usedKeys)
    return { message, grouped, key, enterOrder: index, pending: message.pending }
  })
})

/* ---------- 消息右键菜单 / 多选 ---------- */
type MenuState = { x: number; y: number; message: ChatMessage }

const MENU_WIDTH = 178
const MENU_HEIGHT = 232

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
  const target = event.target as HTMLElement | null
  if (menu.value && !target?.closest('.msg-menu')) closeMenu()
  // 面板和它的开关按钮不算「外面」：点别处（消息、会话列表）就收起来
  if (
    (emojiOpen.value || mentionOpen.value) &&
    !target?.closest('.emoji-panel, .mention-pop, [aria-label="表情"], [aria-label="提及成员"]')
  ) {
    emojiOpen.value = false
    mentionOpen.value = false
  }
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  closeMenu()
  emojiOpen.value = false
  mentionOpen.value = false
  if (selecting.value) exitSelect()
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

/* ---------- 翻译目标语言（菜单文案用） ---------- */
const { label: translateLabel } = useTranslatePrefs()

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

/** 插入表情 / @ 之后把焦点和光标还给输入框，避免用户还要再点一下。 */
function focusComposer() {
  const el = document.getElementById('composer-input') as HTMLTextAreaElement | null
  if (!el) return
  el.focus()
  el.setSelectionRange(el.value.length, el.value.length)
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
  nextTick(focusComposer)
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
  const epoch = ++scrollEpoch
  const saved = scrollMemory.get(conversationId)
  stickToBottom.value = saved ? saved.stick : true
  const target = saved && !saved.stick ? saved.top : null
  nextTick(() => {
    if (epoch !== scrollEpoch) return
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
  const epoch = scrollEpoch
  nextTick(() => {
    if (epoch !== scrollEpoch || (!force && !stickToBottom.value)) return
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
  disarmEnter()
})

/** 收藏走全局接口：侧边栏的「收藏」里能重新点回这条消息。 */
function favoriteMessage(message: ChatMessage) {
  closeMenu()
  emit('favorite', message)
}

// 会话切换必须先于消息长度监听执行，否则离开时会以新内容的高度覆盖旧的滚动位置
watch(
  () => props.conversation?.id,
  (newId, oldId) => {
    rememberScroll(oldId)
    closeMenu()
    exitSelect()
    // 切换会话时收掉浮层：表情面板和 @ 候选都是针对上一个会话的
    emojiOpen.value = false
    mentionOpen.value = false
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

// 需要异步加载的会话：首批消息真正渲染完后收门控（逻辑在 useEnterAnimation 内）
watch(() => props.messages.length, () => scrollToBottom())
</script>

<template>
  <section class="chat-pane" aria-label="聊天窗口">
    <template v-if="conversation">
      <header class="chat-head">
        <button
          :key="conversation.id"
          class="head-avatar enter"
          type="button"
          :disabled="conversation.kind !== 'direct' || !conversation.peerId"
          :title="conversation.kind === 'direct' ? `查看 ${conversation.name} 的资料` : undefined"
          :aria-label="conversation.kind === 'direct' ? `查看 ${conversation.name} 的资料` : undefined"
          @click="!selecting && openProfile(conversation.peerId, $event)"
        >
          <AppAvatar
            :initials="conversation.initials"
            :tone="conversation.tone"
            :presence="conversation.presence"
            :rounded="conversation.kind === 'group'"
            :src="conversation.kind === 'group'
              ? groupAvatarSrc(conversation.id)
              : userAvatarSrc(conversation.peerId)"
            size="sm"
          />
        </button>
        <div
          :key="conversation.id"
          class="chat-head-main enter"
        >
          <h2 class="chat-title">
            {{ conversation.name }}
            <span v-if="conversation.kind === 'group'" class="stat-chip">
              <Users :size="9" :stroke-width="2.4" />
              {{ conversation.members }}
            </span>
            <span v-if="onlineCount > 0" class="stat-chip live">
              {{ onlineCount }} 在线
            </span>
          </h2>
          <p class="chat-sub truncate">{{ conversation.context }}</p>
        </div>

        <div class="chat-actions">
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

        <template v-for="({ message, grouped, key, enterOrder, pending }) in grouping" :key="key">
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
              <button
                v-if="!grouped"
                class="avatar-btn"
                type="button"
                :title="`查看 ${message.author} 的资料`"
                @click="selecting ? toggleSelect(message) : openProfile(message.senderId, $event)"
              >
                <AppAvatar
                  :initials="message.initials"
                  :tone="message.tone"
                  :src="userAvatarSrc(message.senderId)"
                  size="sm"
                />
              </button>
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
        </template>

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

        <p v-if="error" class="send-error" role="alert">
          <CircleAlert :size="13" :stroke-width="2.2" />
          {{ error }}
        </p>
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

        <div v-if="emojiOpen" id="chat-emoji-panel" class="emoji-panel">
          <div class="emoji-tabs">
            <button
              class="emoji-tab"
              type="button"
              :class="{ active: emojiTab === 'emoji' }"
              @click="emojiTab = 'emoji'"
            >
              表情
            </button>
            <button
              class="emoji-tab"
              type="button"
              :class="{ active: emojiTab === 'sticker' }"
              @click="emojiTab = 'sticker'"
            >
              斗图
            </button>
            <button
              class="emoji-close"
              type="button"
              aria-label="关闭表情面板"
              title="关闭表情面板"
              @click="emojiOpen = false"
            >
              <X :size="13" :stroke-width="2" />
            </button>
          </div>

          <div v-if="emojiTab === 'emoji'" class="emoji-grid">
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

          <StickerPicker
            v-else
            :conversation-id="conversation.id"
            @sent="emojiOpen = false"
          />
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
            <button v-for="m in mentionMembers" :key="m.userId" class="mention-item" @click="insertMention(m.remark?.trim() || m.nickname)">
              {{ m.remark?.trim() || m.nickname }}
            </button>
            <p v-if="!mentionMembers.length" class="mention-empty">成员资料还没加载好，稍后再试</p>
          </div>

          <div class="composer-tools">
            <button
              class="icon-btn sm"
              aria-label="提及成员"
              :class="{ on: mentionOpen }"
              :aria-expanded="mentionOpen"
              @click="mentionOpen = !mentionOpen; emojiOpen = false"
            >
              <AtSign :size="15" :stroke-width="1.9" />
            </button>
            <button class="icon-btn sm" aria-label="附件" @click="pickAttachment('file')">
              <Paperclip :size="15" :stroke-width="1.9" />
            </button>
            <button
              class="icon-btn sm"
              aria-label="表情"
              :class="{ on: emojiOpen }"
              :aria-expanded="emojiOpen"
              aria-controls="chat-emoji-panel"
              @click="emojiOpen = !emojiOpen; mentionOpen = false"
            >
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
          :disabled="menu.message.recalled"
          @click="favoriteMessage(menu.message)"
        >
          <Star :size="14" :stroke-width="1.9" />
          收藏
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
/* ---------- 点头像看资料 ---------- */
.head-avatar {
  display: flex;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: none;
  border-radius: var(--r-full);
  transition: transform var(--dur-1) var(--ease-out);
}

.head-avatar:not(:disabled) {
  cursor: pointer;
}

.head-avatar:not(:disabled):hover {
  transform: scale(1.05);
}

.head-avatar.enter {
  animation: surface-rise 280ms var(--ease-out) both;
}

.avatar-btn {
  display: flex;
  padding: 0;
  border: 0;
  background: none;
  border-radius: var(--r-full);
  cursor: pointer;
}

.avatar-btn :deep(.avatar) {
  transition: transform var(--dur-1) var(--ease-out);
}

.avatar-btn:hover :deep(.avatar) {
  transform: scale(1.08);
}

.send-error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  padding: 7px 10px;
  border-radius: var(--r-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 11.5px;
  font-weight: 600;
  box-shadow: 0 8px 20px color-mix(in srgb, var(--danger) 18%, transparent);
  animation: send-error-in 200ms var(--ease-out) both;
}

.send-error :deep(svg) {
  flex: none;
}

@keyframes send-error-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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

.emoji-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 6px;
  padding: 8px;
  border-radius: var(--r-md);
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.emoji-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--line);
}

.emoji-close {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  margin-left: auto;
  border-radius: var(--r-xs);
  color: var(--ink-3);
}

.emoji-close:hover {
  background: var(--surface-hover);
  color: var(--ink);
}

.emoji-tab {
  height: 24px;
  padding: 0 10px;
  border-radius: var(--r-xs);
  font-size: 11.5px;
  font-weight: 560;
  color: var(--ink-3);
}

.emoji-tab:hover {
  background: var(--surface-hover);
  color: var(--ink);
}

.emoji-tab.active {
  background: var(--accent-soft);
  color: var(--accent);
}

.emoji-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
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
