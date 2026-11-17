<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Check, Loader2, Search, Send, X } from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { useChatStore } from '../stores/chat'
import { initialsOf, toneOf } from '../utils/present'
import type { ChatMessage } from '../data/workspace'

const props = defineProps<{
  open: boolean
  message: ChatMessage | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'forwarded', conversationId: string): void
}>()

const chat = useChatStore()
const keyword = ref('')
const sending = ref<string | null>(null)
const error = ref('')
const sentTo = ref('')
let doneTimer: number | null = null

const targets = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return chat.cards
    .filter((card) => card.conversationId !== chat.activeId)
    .filter((card) => !kw || card.title.toLowerCase().includes(kw))
})

/** 转发时保留原消息类型；附件消息受「文件必须属于发送者」限制。 */
function payloadOf(message: ChatMessage): { type: string; content: string; preview: string } | null {
  if (!message.raw) return null
  if (message.recalled) return null
  const type = message.type ?? 'TEXT'
  if (message.attachment) {
    if (!message.mine) return null
    const name = message.attachment.name
    return {
      type,
      content: message.raw,
      preview: message.attachment.kind === 'image' ? '[图片]' : `[文件] ${name}`,
    }
  }
  return { type, content: message.raw, preview: message.text }
}

const blockedReason = computed(() => {
  const message = props.message
  if (!message) return ''
  if (message.recalled) return '已撤回的消息不能转发'
  if (message.pending) return '消息还在发送中，请稍后再试'
  if (!message.raw) return '这条消息缺少原始内容，无法转发'
  if (message.attachment && !message.mine) {
    return '后端只允许引用发送者本人的文件，别人的图片/文件暂不能转发'
  }
  return ''
})

const preview = computed(() => {
  const message = props.message
  if (!message) return ''
  if (message.attachment) return `${message.attachment.kind === 'image' ? '图片' : '文件'} · ${message.attachment.name}`
  return message.text
})

async function pick(conversationId: string) {
  const message = props.message
  if (!message || blockedReason.value || sentTo.value) return
  const payload = payloadOf(message)
  if (!payload) {
    error.value = '这条消息无法转发'
    return
  }
  sending.value = conversationId
  error.value = ''
  try {
    await chat.forwardMessage(conversationId, payload.type, payload.content, payload.preview)
    sentTo.value = chat.cards.find((card) => card.conversationId === conversationId)?.title ?? ''
    const target = conversationId
    if (doneTimer) window.clearTimeout(doneTimer)
    doneTimer = window.setTimeout(() => {
      emit('forwarded', target)
      emit('close')
    }, 700)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '转发失败'
    sending.value = null
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      keyword.value = ''
      error.value = ''
      sending.value = null
      sentTo.value = ''
    }
  },
)

onBeforeUnmount(() => {
  if (doneTimer) window.clearTimeout(doneTimer)
})
</script>

<template>
  <Transition name="dlg">
    <div v-if="open" class="dlg-mask" @click.self="emit('close')">
      <div class="dlg" role="dialog" aria-label="转发消息">
        <header class="dlg-head">
          <div>
            <p class="eyebrow">转发</p>
            <h2 class="dlg-title">选择会话</h2>
          </div>
          <button class="icon-btn sm" aria-label="关闭" @click="emit('close')">
            <X :size="15" :stroke-width="2" />
          </button>
        </header>

        <div class="forward-preview" :class="{ blocked: !!blockedReason }">
          <span class="forward-tag">{{ blockedReason ? '不可转发' : '内容' }}</span>
          <p class="forward-text">{{ blockedReason || preview }}</p>
        </div>

        <label class="search" style="margin: 0 14px">
          <Search class="search-icon" :size="15" :stroke-width="2" />
          <input v-model="keyword" type="search" placeholder="搜索会话" />
          <Loader2 v-if="sending" :size="13" class="spin" style="color: var(--ink-3)" />
        </label>

        <div class="dlg-body">
          <p v-if="sentTo" class="dlg-done">
            <Check :size="13" :stroke-width="2.6" />
            已转发到 {{ sentTo }}
          </p>
          <p v-if="error" class="dlg-error">{{ error }}</p>

          <button
            v-for="card in targets"
            :key="card.conversationId"
            class="hit"
            :disabled="!!blockedReason || sending !== null || !!sentTo"
            @click="pick(card.conversationId)"
          >
            <AppAvatar
              :initials="initialsOf(card.title)"
              :tone="toneOf(card.conversationId)"
              :rounded="card.type === 'GROUP'"
              size="md"
            />
            <span class="hit-main">
              <span class="hit-name">{{ card.title }}</span>
              <span class="hit-sub">
                {{ card.type === 'GROUP' ? `群聊 · ${card.memberCount} 人` : '单聊' }}
              </span>
            </span>
            <Loader2
              v-if="sending === card.conversationId"
              :size="15"
              class="spin"
              style="color: var(--accent)"
            />
            <Send v-else :size="15" :stroke-width="1.9" style="color: var(--ink-3)" />
          </button>

          <div v-if="!targets.length" class="dlg-empty">
            <Search :size="20" :stroke-width="1.6" style="color: var(--ink-4)" />
            <p>没有可选的会话</p>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.dlg-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, var(--ink) 26%, transparent);
  backdrop-filter: blur(6px);
  animation: fade-in 160ms var(--ease-out);
}

.dlg {
  width: 100%;
  max-width: 420px;
  max-height: min(560px, 80vh);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 0 6px;
  border-radius: var(--r-lg);
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--frame-ring), var(--shadow-lg);
  animation: pop-in 220ms var(--ease-spring);
}

.dlg-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 0 14px;
}

.dlg-title {
  font-size: 16px;
  font-weight: 660;
  letter-spacing: -0.3px;
  margin-top: 2px;
}

.dlg-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px 10px;
}

.forward-preview {
  margin: 0 14px;
  padding: 8px 10px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  box-shadow: inset 0 0 0 1px var(--line);
}

.forward-preview.blocked {
  background: var(--danger-soft);
  box-shadow: none;
}

.forward-tag {
  font-size: 9.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-4);
}

.forward-text {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--ink-2);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
}

.forward-preview.blocked .forward-text {
  color: var(--danger);
}

.hit {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 8px;
  border-radius: var(--r-md);
  text-align: left;
  transition: background var(--dur-1) var(--ease-out),
    transform var(--dur-1) var(--ease-out);
}

.hit:hover {
  background: var(--surface-hover);
}

.hit:active {
  transform: scale(0.99);
}

.hit:disabled {
  opacity: 0.55;
  cursor: default;
}

.hit-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.hit-name {
  font-size: 13.5px;
  font-weight: 600;
}

.hit-sub {
  font-size: 11px;
  color: var(--ink-3);
}

.dlg-error {
  margin: 4px 8px 8px;
  padding: 7px 10px;
  border-radius: var(--r-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 11.5px;
}

.dlg-done {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 8px 8px;
  padding: 7px 10px;
  border-radius: var(--r-sm);
  background: var(--accent-soft, color-mix(in srgb, var(--accent) 12%, transparent));
  color: var(--accent);
  font-size: 11.5px;
  font-weight: 560;
  animation: menu-in 140ms var(--ease-out);
}

.dlg-empty {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 36px 12px;
  font-size: 12px;
  color: var(--ink-3);
}
</style>
