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
  MoreHorizontal,
  CheckCheck,
  Check,
  Loader2,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import ContactsView from './ContactsView.vue'
import FilesView from './FilesView.vue'
import MeView from './MeView.vue'
import MessageAttachment from './MessageAttachment.vue'
import type { ChatMessage, Conversation } from '../data/workspace'

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
  (e: 'send', payload: { conversationId: string; text: string }): void
  (e: 'attach', payload: { conversationId: string; file: File }): void
  (e: 'close'): void
  (e: 'new-chat'): void
}>()

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
}

function close() {
  emit('close')
}

function send() {
  if (!canSend.value || !props.activeId) return
  disarmEnter()
  emit('send', { conversationId: props.activeId, text: draft.value.trim() })
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

onBeforeUnmount(disarmEnter)

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
                  v-if="message.attachment && !message.recalled"
                  :attachment="message.attachment"
                />
                <div v-else class="bubble" :class="{ recalled: message.recalled }">
                  {{ message.text }}
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
