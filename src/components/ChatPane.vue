<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import MessageAttachment from './MessageAttachment.vue'
import { resetMagnet, trackMagnet, trackSpotlight } from '../composables/usePointerFx'
import { useChatStore } from '../stores/chat'
import type { ChatMessage, Conversation } from '../data/workspace'
import type { MessageView } from '../api/client'
import { clockTime } from '../utils/present'

const props = defineProps<{
  conversation: Conversation | null
  messages: ChatMessage[]
  detailOpen: boolean
  error?: string | null
  loading?: boolean
  members?: { userId: string | number; nickname: string }[]
}>()

const emit = defineEmits<{
  (e: 'send', text: string): void
  (e: 'attach', file: File): void
  (e: 'toggle-detail'): void
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

const grouping = computed(() =>
  props.messages.map((message, index) => {
    const prev = props.messages[index - 1]
    const grouped =
      !!prev &&
      prev.side === message.side &&
      prev.author === message.author &&
      !prev.attachment &&
      !message.attachment
    return { message, grouped }
  }),
)

function showNotice(text: string) {
  notice.value = text
  if (noticeTimer) window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => (notice.value = ''), 2600)
}

function send() {
  if (!canSend.value) return
  emit('send', draft.value.trim())
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
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight <= 48
}

/** 图片/附件加载后高度会变化，贴底时重新对齐。 */
function onContentLoad() {
  scrollToBottom(false)
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  const el = scroller.value
  if (!el || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => scrollToBottom(false))
  resizeObserver.observe(el)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (noticeTimer) window.clearTimeout(noticeTimer)
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
  if (message.type === 'FILE') return '[文件]'
  return `[${message.type}]`
}

watch(() => props.messages.length, () => scrollToBottom())
watch(
  () => props.conversation?.id,
  () => {
    stickToBottom.value = true
    scrollToBottom(true)
  },
  { immediate: true },
)
</script>

<template>
  <section class="chat-pane" aria-label="聊天窗口">
    <template v-if="conversation">
      <header class="chat-head">
        <AppAvatar
          :initials="conversation.initials"
          :tone="conversation.tone"
          :presence="conversation.presence"
          :rounded="conversation.kind === 'group'"
          size="sm"
        />
        <div class="chat-head-main">
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

        <div v-if="loading && !messages.length" class="msg-loading">
          <Loader2 :size="16" class="spin" />
          正在加载消息…
        </div>

        <div
          v-for="({ message, grouped }, index) in grouping"
          :key="message.id"
          class="msg"
          :class="{ out: message.side === 'out', grouped }"
          :data-mid="message.id"
          :style="{ animationDelay: `${Math.min(index * 24, 260)}ms` }"
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
              <MessageAttachment
                v-if="message.attachment"
                :attachment="message.attachment"
              />

              <div v-else-if="message.recalled" class="bubble recalled">消息已撤回</div>

              <div v-else class="bubble">{{ message.text }}</div>

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

        <p v-if="!loading && !messages.length" class="messages-empty">
          还没有消息，发一句问候吧。
        </p>
      </div>

      <div class="composer-wrap">
        <p v-if="error" class="send-error">{{ error }}</p>
        <p v-if="notice" class="send-notice">{{ notice }}</p>

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
            <button class="icon-btn sm" aria-label="图片" @click="pickAttachment('image')">
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
              accept="image/*"
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
              支持发送图片与文件
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