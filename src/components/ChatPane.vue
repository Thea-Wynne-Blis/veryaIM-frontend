<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  Search,
  Phone,
  Video,
  Info,
  Paperclip,
  Smile,
  Image as ImageIcon,
  Mic,
  Send,
  FileText,
  Check,
  CheckCheck,
  Sparkles,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import type { ChatMessage, Conversation } from '../data/workspace'

const props = defineProps<{
  conversation: Conversation | null
  messages: ChatMessage[]
  detailOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'send', text: string): void
  (e: 'toggle-detail'): void
}>()

const draft = ref('')
const scroller = ref<HTMLElement | null>(null)
const canSend = computed(() => draft.value.trim().length > 0)

const grouping = computed(() =>
  props.messages.map((message, index) => {
    const prev = props.messages[index - 1]
    const grouped =
      !!prev &&
      prev.side === message.side &&
      prev.author === message.author &&
      prev.attachment === undefined &&
      message.attachment === undefined
    return { message, grouped }
  }),
)

function send() {
  if (!canSend.value) return
  emit('send', draft.value.trim())
  draft.value = ''
  autoGrow()
}

function autoGrow() {
  const el = document.getElementById('composer-input') as HTMLTextAreaElement | null
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 168)}px`
}

function scrollToBottom() {
  nextTick(() => {
    const el = scroller.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

watch(() => props.messages.length, scrollToBottom)
watch(() => props.conversation?.id, scrollToBottom, { immediate: true })

function onEnter(event: KeyboardEvent) {
  if (event.shiftKey) return
  event.preventDefault()
  send()
}
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
            <span
              v-if="conversation.kind === 'group'"
              class="chip"
              style="height: 20px; font-size: 10.5px; padding: 0 8px"
            >
              {{ conversation.members }} 人
            </span>
          </h2>
          <p class="chat-sub">
            <span v-if="conversation.presence === 'online'" class="dot" style="background: #25b47a" />
            <span v-else-if="conversation.presence === 'away'" class="dot" style="background: var(--warn)" />
            {{ conversation.context }}
          </p>
        </div>

        <div class="chat-actions">
          <button class="icon-btn" aria-label="搜索聊天记录">
            <Search :size="17" :stroke-width="1.9" />
          </button>
          <button class="icon-btn" aria-label="语音通话">
            <Phone :size="17" :stroke-width="1.9" />
          </button>
          <button class="icon-btn" aria-label="视频通话">
            <Video :size="17" :stroke-width="1.9" />
          </button>
          <button
            class="icon-btn"
            :class="{ active: detailOpen }"
            :style="
              detailOpen
                ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                : undefined
            "
            aria-label="会话详情"
            :aria-pressed="detailOpen"
            @click="emit('toggle-detail')"
          >
            <Info :size="17" :stroke-width="1.9" />
          </button>
        </div>
      </header>

      <div ref="scroller" class="messages">
        <p class="day-divider">今天</p>

        <div
          v-for="({ message, grouped }, index) in grouping"
          :key="message.id"
          class="msg"
          :class="{ out: message.side === 'out', grouped }"
          :style="{ animationDelay: `${Math.min(index * 24, 260)}ms` }"
        >
          <div class="msg-avatar-slot">
            <AppAvatar
              v-if="!grouped"
              :initials="message.initials"
              :tone="message.tone"
              size="sm"
            />
          </div>

          <div class="msg-body">
            <span v-if="!grouped && message.side === 'in'" class="msg-author">
              {{ message.author }}
            </span>

            <div v-if="message.image" class="bubble media">
              <div class="media-ph">
                <ImageIcon :size="22" :stroke-width="1.6" />
                <span style="margin-top: 6px">图片预览</span>
              </div>
            </div>

            <div
              v-else-if="message.attachment"
              class="bubble"
              style="padding: 10px"
            >
              <div class="attach">
                <span class="attach-icon">
                  <FileText :size="18" :stroke-width="1.8" />
                </span>
                <span class="attach-meta">
                  <span class="attach-name">{{ message.attachment.name }}</span>
                  <span class="attach-size">{{ message.attachment.size }}</span>
                </span>
              </div>
            </div>

            <div v-else class="bubble">{{ message.text }}</div>

            <div class="msg-foot">
              <span class="tabular">{{ message.time }}</span>
              <template v-if="message.side === 'out'">
                <CheckCheck
                  v-if="message.read"
                  class="msg-tick"
                  :size="13"
                  :stroke-width="2.2"
                />
                <Check v-else :size="13" :stroke-width="2.2" />
              </template>
            </div>
          </div>
        </div>

        <div class="msg in" style="animation: none">
          <div class="msg-avatar-slot">
            <AppAvatar initials="夏" tone="rose" size="sm" />
          </div>
          <div class="msg-body">
            <div class="bubble" style="padding: 6px 12px">
              <span class="typing"><i /><i /><i /></span>
            </div>
          </div>
        </div>
      </div>

      <div class="composer-wrap">
        <div class="composer">
          <div class="composer-tools">
            <button class="icon-btn sm" aria-label="附件">
              <Paperclip :size="16" :stroke-width="1.9" />
            </button>
            <button class="icon-btn sm" aria-label="表情">
              <Smile :size="16" :stroke-width="1.9" />
            </button>
            <button class="icon-btn sm" aria-label="图片">
              <ImageIcon :size="16" :stroke-width="1.9" />
            </button>
            <button class="icon-btn sm" aria-label="语音">
              <Mic :size="16" :stroke-width="1.9" />
            </button>
          </div>

          <textarea
            id="composer-input"
            v-model="draft"
            class="composer-input"
            rows="1"
            placeholder="输入消息，Enter 发送，Shift + Enter 换行"
            aria-label="输入消息"
            @input="autoGrow"
            @keydown.enter.exact.prevent="onEnter"
          />

          <div class="composer-bar">
            <span class="composer-hint">
              <Sparkles :size="11" :stroke-width="2" style="display: inline; vertical-align: -1px" />
              快捷回复 · 支持粘贴图片
            </span>
            <button class="send-btn" :disabled="!canSend" @click="send">
              <Send :size="13" :stroke-width="2.2" />
              发送
            </button>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="empty">
      <div class="empty-mark">
        <Search :size="24" :stroke-width="1.6" />
      </div>
      <h3 class="empty-title">选择一个会话</h3>
      <p class="empty-text">从左侧列表挑一个对话，或者新建一个开始聊天。</p>
    </div>
  </section>
</template>
