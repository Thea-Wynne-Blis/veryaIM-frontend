<script setup lang="ts">
import { ref } from 'vue'
import { X } from 'lucide-vue-next'
import StickerPicker from './StickerPicker.vue'
import { EMOJIS, loadRecentEmojis, rememberEmoji } from '../utils/emoji'

/**
 * 表情面板：内置表情 + 网络斗图。
 *
 * <p>桌面端与移动端原先各写了一份相同的页签 / 关闭 / 表情网格，改一处要改两遍；
 * 现在共用这个组件，只通过 `variant` 区分触控尺寸与排版。</p>
 */
const props = defineProps<{
  conversationId: string
  /** 面板 DOM id，父组件用它写 aria-controls。 */
  panelId: string
  variant?: 'desktop' | 'mobile'
}>()

const emit = defineEmits<{
  (e: 'pick', emoji: string): void
  (e: 'close'): void
  (e: 'sent'): void
}>()

const tab = ref<'emoji' | 'sticker'>('emoji')
/** 最近使用：本地记录，打开面板时读一次。 */
const recent = ref<string[]>(loadRecentEmojis())

function pick(emoji: string) {
  recent.value = rememberEmoji(emoji)
  emit('pick', emoji)
}
</script>

<template>
  <div
    :id="panelId"
    class="emoji-panel"
    :class="`emoji-panel--${props.variant ?? 'desktop'}`"
    role="group"
    aria-label="选择表情"
  >
    <div class="emoji-tabs">
      <button
        class="emoji-tab"
        type="button"
        :class="{ active: tab === 'emoji' }"
        @click="tab = 'emoji'"
      >
        表情
      </button>
      <button
        class="emoji-tab"
        type="button"
        :class="{ active: tab === 'sticker' }"
        @click="tab = 'sticker'"
      >
        斗图
      </button>
      <button
        class="emoji-close"
        type="button"
        aria-label="关闭表情面板"
        title="关闭表情面板"
        @click="emit('close')"
      >
        <X :size="props.variant === 'mobile' ? 16 : 13" :stroke-width="2" />
      </button>
    </div>

    <div v-if="tab === 'emoji'" class="emoji-scroll">
      <section v-if="recent.length" class="emoji-section">
        <p class="emoji-caption">最近使用</p>
        <div class="emoji-grid">
          <button
            v-for="emoji in recent"
            :key="`recent-${emoji}`"
            class="emoji"
            type="button"
            :aria-label="`插入 ${emoji}`"
            @click="pick(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </section>

      <section class="emoji-section">
        <p class="emoji-caption">所有表情</p>
        <div class="emoji-grid">
          <button
            v-for="emoji in EMOJIS"
            :key="emoji"
            class="emoji"
            type="button"
            :aria-label="`插入 ${emoji}`"
            @click="pick(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </section>
    </div>

    <StickerPicker
      v-else
      :conversation-id="conversationId"
      @sent="emit('sent')"
    />
  </div>
</template>

<style scoped>
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

/* 表情很多，面板自身滚动，不把输入框顶出屏幕 */
.emoji-scroll {
  max-height: 226px;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 2px;
}

.emoji-section {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.emoji-caption {
  padding: 0 2px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--ink-4);
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

/* ---------- 移动端：更大的触控区，铺满 8 列 ---------- */
.emoji-panel--mobile {
  margin-bottom: 0;
  padding: 8px 6px 4px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.emoji-panel--mobile .emoji-tabs {
  padding: 0 2px 6px;
}

.emoji-panel--mobile .emoji-tab {
  height: auto;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12.5px;
}

.emoji-panel--mobile .emoji-scroll {
  max-height: 46vh;
  gap: 10px;
  padding-right: 0;
}

.emoji-panel--mobile .emoji-section {
  gap: 4px;
}

.emoji-panel--mobile .emoji-caption {
  padding: 0 2px;
  font-size: 11.5px;
}

.emoji-panel--mobile .emoji-close {
  width: 30px;
  height: 30px;
  border-radius: 8px;
}

.emoji-panel--mobile .emoji-close:active {
  background: var(--surface-active);
  color: var(--ink);
}

.emoji-panel--mobile .emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 3px;
  padding-top: 6px;
}

.emoji-panel--mobile .emoji {
  width: auto;
  height: auto;
  min-height: 44px;
  border-radius: 8px;
  font-size: 25px;
}

.emoji-panel--mobile .emoji:active {
  background: var(--surface-active);
}

.emoji-panel--mobile :deep(.sticker-picker) {
  width: 100%;
  padding-top: 8px;
}

.emoji-panel--mobile :deep(.sticker-body) {
  max-height: 42vh;
}
</style>
