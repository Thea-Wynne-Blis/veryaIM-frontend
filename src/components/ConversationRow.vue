<script setup lang="ts">
/**
 * 会话列表的一行。
 *
 * <p>置顶区和普通区之前各写了一份几乎一样的模板，只有「置顶图标 / 群人数」这一处不同；
 * 抽成组件后差异收在 `item.pinned` 的一个分支里，样式仍走全局 app.css。</p>
 */
import { BellOff, Pin } from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { trackSpotlight } from '../composables/usePointerFx'
import { groupAvatarSrc, userAvatarSrc } from '../utils/avatar'
import type { Conversation } from '../types/chat'

defineProps<{
  item: Conversation
  active: boolean
  /** 入场动画的错峰序号 */
  index?: number
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'menu', event: MouseEvent, item: Conversation): void
}>()
</script>

<template>
  <button
    class="conv spot"
    :class="{ active }"
    :style="index === undefined ? undefined : { animationDelay: `${index * 26}ms` }"
    @pointermove="trackSpotlight"
    @click="emit('select', item.id)"
    @contextmenu.prevent="emit('menu', $event, item)"
  >
    <AppAvatar
      :initials="item.initials"
      :tone="item.tone"
      :presence="item.presence"
      :rounded="item.kind === 'group'"
      :src="item.kind === 'group' ? groupAvatarSrc(item.id) : userAvatarSrc(item.peerId)"
      size="md"
    />
    <span class="conv-main">
      <span class="conv-top">
        <span class="conv-name">{{ item.name }}</span>
        <Pin v-if="item.pinned" :size="10" :stroke-width="2.4" class="conv-mark" />
        <span v-else-if="item.kind === 'group'" class="conv-flag">{{ item.members }}</span>
        <BellOff v-if="item.muted" :size="10" :stroke-width="2.4" class="conv-mark" />
      </span>
      <span class="conv-preview">{{ item.preview }}</span>
    </span>
    <span class="conv-meta">
      <span class="conv-time num">{{ item.time }}</span>
      <span v-if="item.unread" class="unread" :class="{ muted: item.muted }">
        <span :key="item.unread">{{ item.unread > 99 ? '99+' : item.unread }}</span>
      </span>
    </span>
  </button>
</template>

<style scoped>
.conv-mark {
  flex-shrink: 0;
  color: var(--ink-4);
}
</style>
