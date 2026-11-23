<script setup lang="ts">
/**
 * 消息操作菜单（桌面右键 / 移动端长按）。
 *
 * <p>两端原来是两份几乎一样的 Teleport 模板，只有图标尺寸和「多选」入口不同；
 * 这里收成一份，父组件只负责算位置和接事件。</p>
 */
import { Copy, Languages, ListChecks, Quote, Share2, Star, Trash2 } from 'lucide-vue-next'
import type { ChatMessage } from '../types/chat'

withDefaults(
  defineProps<{
    message: ChatMessage
    /** 菜单左上角坐标（已由父组件夹到视口内） */
    x: number
    y: number
    translateLabel: string
    /** 是否已经展示译文（决定菜单显示「翻译 / 收起译文」） */
    translated: boolean
    quotable: boolean
    /** 能否走服务端撤回，否则删除仅对本机生效 */
    recallable: boolean
    /** 桌面右键菜单带「多选」；移动端长按菜单没有 */
    selectable?: boolean
    /** 图标尺寸：桌面 14、移动端 15 */
    iconSize?: number
  }>(),
  { selectable: false, iconSize: 14 },
)

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'translate'): void
  (e: 'forward'): void
  (e: 'select'): void
  (e: 'favorite'): void
  (e: 'quote'): void
  (e: 'delete'): void
}>()
</script>

<template>
  <div
    class="msg-menu"
    role="menu"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @contextmenu.prevent
    @pointerdown.stop
  >
    <button class="msg-menu-item" role="menuitem" @click="emit('copy')">
      <Copy :size="iconSize" :stroke-width="1.9" />
      复制
    </button>
    <button
      class="msg-menu-item"
      role="menuitem"
      :disabled="message.recalled || !!message.attachment"
      @click="emit('translate')"
    >
      <Languages :size="iconSize" :stroke-width="1.9" />
      {{ translated ? '收起译文' : '翻译' }}
      <span class="msg-menu-tag">{{ translateLabel }}</span>
    </button>
    <button class="msg-menu-item" role="menuitem" @click="emit('forward')">
      <Share2 :size="iconSize" :stroke-width="1.9" />
      转发
    </button>
    <button v-if="selectable" class="msg-menu-item" role="menuitem" @click="emit('select')">
      <ListChecks :size="iconSize" :stroke-width="1.9" />
      多选
    </button>
    <button
      class="msg-menu-item"
      role="menuitem"
      :disabled="message.recalled || message.pending || !message.messageId"
      @click="emit('favorite')"
    >
      <Star :size="iconSize" :stroke-width="1.9" />
      收藏
    </button>
    <button
      class="msg-menu-item"
      role="menuitem"
      :disabled="!quotable"
      @click="emit('quote')"
    >
      <Quote :size="iconSize" :stroke-width="1.9" />
      引用
    </button>
    <div class="msg-menu-sep" />
    <button class="msg-menu-item danger" role="menuitem" @click="emit('delete')">
      <Trash2 :size="iconSize" :stroke-width="1.9" />
      删除
      <span v-if="!recallable" class="msg-menu-tag">仅本机</span>
    </button>
  </div>
</template>

<style scoped>
.msg-menu-item:disabled {
  color: var(--ink-4);
  cursor: not-allowed;
}
.msg-menu-item:disabled:hover {
  background: transparent;
  color: var(--ink-4);
}
</style>
