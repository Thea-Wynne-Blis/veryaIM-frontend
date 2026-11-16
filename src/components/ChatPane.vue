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
  Users,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { resetMagnet, trackMagnet, trackSpotlight } from '../composables/usePointerFx'
import type { ChatMessage, Conversation } from '../data/workspace'

const props = defineProps<{
  conversation: Conversation | null
  messages: ChatMessage[]
  detailOpen: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  (e: 'send', text: string): void
  (e: 'toggle-detail'): void
}>()

const draft = ref('')
const scroller = ref<HTMLElement | null>(null)
const canSend = computed(() => draft.value.trim().length > 0)

/** 已读人数：演示数据里 out 消息全部已读，用于头部统计 */
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
  el.style.height = `${Math.min(el.scrollHeight, 164)}px`
}

function scrollToBottom() {
  nextTick(() => {
    const el = scroller.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

watch(() => props.messages.length, scrollToBottom)
watch(() => props.conversation?.id, scrollToBottom, { immediate: true })
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
          <button class="icon-btn" aria-label="搜索聊天记录">
            <Search :size="16" :stroke-width="1.9" />
          </button>
          <button class="icon-btn" aria-label="语音通话">
            <Phone :size="16" :stroke-width="1.9" />
          </button>
          <button class="icon-btn" aria-label="视频通话">
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
                <ImageIcon :size="20" :stroke-width="1.6" />
                <span style="margin-top: 6px">图片预览</span>
              </div>
            </div>

            <div v-else-if="message.attachment" class="bubble" style="padding: 9px">
              <div class="attach">
                <span class="attach-icon">
                  <FileText :size="17" :stroke-width="1.8" />
                </span>
                <span class="attach-meta">
                  <span class="attach-name">{{ message.attachment.name }}</span>
                  <span class="attach-size">{{ message.attachment.size }}</span>
                </span>
              </div>
            </div>

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

        <div class="msg in" style="animation: none">
          <div class="msg-avatar-slot">
            <AppAvatar initials="夏" tone="rose" size="sm" />
          </div>
          <div class="msg-body">
            <div class="bubble" style="padding: 5px 11px">
              <span class="typing"><i /><i /><i /></span>
            </div>
          </div>
        </div>
      </div>

      <div class="composer-wrap">
        <p v-if="error" class="send-error">{{ error }}</p>
        <div
          class="composer spot"
          style="--spot-size: 420px"
          @pointermove="trackSpotlight"
        >
          <div class="composer-tools">
            <button class="icon-btn sm" aria-label="附件">
              <Paperclip :size="15" :stroke-width="1.9" />
            </button>
            <button class="icon-btn sm" aria-label="表情">
              <Smile :size="15" :stroke-width="1.9" />
            </button>
            <button class="icon-btn sm" aria-label="图片">
              <ImageIcon :size="15" :stroke-width="1.9" />
            </button>
            <button class="icon-btn sm" aria-label="语音">
              <Mic :size="15" :stroke-width="1.9" />
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
            @keydown.enter.exact.prevent="send"
          />

          <div class="composer-bar">
            <span class="composer-hint">
              <Sparkles :size="10" :stroke-width="2.2" />
              快捷回复 · 支持粘贴图片
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
</style>