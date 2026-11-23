<script setup lang="ts">
import { computed } from 'vue'
import { Check, CheckCheck, Languages, Loader2 } from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import MessageAttachment from './MessageAttachment.vue'
import type { ChatMessage } from '../types/chat'
import { userAvatarSrc } from '../utils/avatar'

/**
 * 一条消息的内部渲染：作者名、头像、引用块、附件/气泡、译文、时间和已读状态。
 *
 * <p>桌面 ChatPane 与移动 MobileWorkspace 的这段结构原本各写一份，改一次要同步改两遍，
 * 还慢慢长出了不同的分支（一边看 `recalled` 优先、一边看 `attachment` 优先）。
 * 现在共用这一份，只保留外层 `.msg` 容器和交互差异（右键菜单 / 长按）在各自组件里。</p>
 *
 * <p>文案与字号按 `variant` 微调，移动端触控下用更紧凑的引用块和译文。</p>
 */
const props = defineProps<{
  message: ChatMessage
  grouped: boolean
  variant?: 'desktop' | 'mobile'
  /** 多选模式（仅桌面端）：显示勾选圈 */
  selecting?: boolean
  selected?: boolean
  translateLabel?: string
  translation?: { text: string } | null
  translating?: boolean
}>()

const emit = defineEmits<{
  (e: 'locate', messageId: string): void
  (e: 'profile', senderId: string | undefined, event: MouseEvent): void
  (e: 'toggle', message: ChatMessage): void
}>()

const mobile = computed(() => props.variant === 'mobile')

/** 头像在选中模式下变成勾选热区，和点击整行一致。 */
function onAvatarClick(event: MouseEvent) {
  if (props.selecting) emit('toggle', props.message)
  else emit('profile', props.message.senderId, event)
}
</script>

<template>
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
        :aria-label="`查看 ${message.author} 的资料`"
        @click.stop="onAvatarClick"
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
        <Check v-if="selected" :size="11" :stroke-width="3.2" />
      </span>

      <button
        v-if="message.replyTo"
        class="quote-block"
        :class="{ compact: mobile }"
        type="button"
        :title="`定位到 ${message.replyTo.author} 的消息`"
        @click.stop="emit('locate', message.replyTo.messageId)"
      >
        <span class="quote-block-author">{{ message.replyTo.author }}</span>
        <span class="quote-block-text">{{ message.replyTo.preview }}</span>
      </button>

      <MessageAttachment
        v-if="message.attachment && !message.recalled"
        :attachment="message.attachment"
      />
      <div v-else class="bubble" :class="{ recalled: message.recalled, compact: mobile }">
        {{ message.recalled ? '消息已撤回' : message.text }}
      </div>

      <div v-if="translation" class="bubble translation" :class="{ compact: mobile }">
        <span class="translation-head">
          <Languages :size="mobile ? 10 : 11" :stroke-width="2" />
          译文 · {{ translateLabel }}
        </span>
        <span class="translation-text">{{ translation.text }}</span>
      </div>
      <div
        v-else-if="translating"
        class="bubble translation pending"
        :class="{ compact: mobile }"
      >
        <Loader2 :size="mobile ? 11 : 12" class="spin" />
        翻译中…
      </div>

      <div class="msg-foot">
        <span class="num">{{ message.time }}</span>
        <template v-if="message.side === 'out'">
          <span class="tick" :class="message.read ? 'read' : 'sent'">
            <CheckCheck v-if="message.read" :size="mobile ? 11 : 12" :stroke-width="2.4" />
            <Check v-else :size="mobile ? 11 : 12" :stroke-width="2.4" />
          </span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
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

/* ---------- 引用块 ---------- */
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

/* ---------- 撤回 ---------- */
.bubble.recalled {
  color: var(--ink-3);
  font-style: italic;
  background: var(--surface-3);
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

/* ---------- 移动端：更紧凑的引用块与译文 ---------- */
.quote-block.compact {
  padding: 4px 8px;
  background: color-mix(in srgb, var(--ink) 5%, transparent);
}

.quote-block.compact .quote-block-author {
  font-size: 10px;
}

.quote-block.compact .quote-block-text {
  font-size: 11px;
}

.bubble.recalled.compact {
  background: transparent;
  border: 1px dashed var(--line-strong);
  font-size: 11.5px;
}

.bubble.translation.compact {
  gap: 3px;
  font-size: 13px;
}

.bubble.translation.compact .translation-head {
  gap: 4px;
  font-size: 9.5px;
}

.bubble.translation.compact .translation-text {
  font-size: inherit;
  line-height: inherit;
}

.bubble.translation.compact.pending {
  gap: 5px;
  font-size: 11px;
}

.spin {
  animation: tick-spin 900ms linear infinite;
}
</style>
