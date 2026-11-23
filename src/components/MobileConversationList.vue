<script setup lang="ts">
/**
 * 移动端会话列表：左滑操作（标为未读 / 不显示 / 删除）与列表行。
 *
 * <p>从 MobileWorkspace 抽出来。原来这个文件同时管「会话列表 + 聊天页 + 输入区 +
 * 信息页」，滑动手势的状态和模板占了近 300 行，和聊天本身没有关系。</p>
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { MessageCircle, Pin, BellOff, MailOpen, EyeOff, Trash2 } from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { groupAvatarSrc, userAvatarSrc } from '../utils/avatar'
import type { Conversation } from '../types/chat'

defineProps<{ conversations: Conversation[]; unreadOnly: boolean }>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'new-chat'): void
  (e: 'mark-unread', id: string): void
  (e: 'hide', id: string): void
  (e: 'delete', id: string): void
}>()

const SWIPE_WIDTH = 198
const SWIPE_TRIGGER_PX = 48

/** 当前展开操作栏的会话 */
const swipeId = ref<string | null>(null)
/** 正在跟手的会话（滑动过程中不播过渡） */
const draggingId = ref<string | null>(null)
const dragOffset = ref(0)
/** 点了「删除」后展开的二级确认：「清空记录同时不显示聊天」 */
const deleteArmedId = ref<string | null>(null)

type SwipeTrack = {
  id: string
  startX: number
  startY: number
  from: number
  active: boolean
}

let track: SwipeTrack | null = null
let lastSwipeAt = 0

function resetSwipe() {
  swipeId.value = null
  deleteArmedId.value = null
}

/** 行的横向位移：跟手 > 二级确认 > 展开 > 复位。 */
function rowStyle(id: string): Record<string, string> | undefined {
  if (draggingId.value === id) {
    return { transform: `translateX(${dragOffset.value}px)` }
  }
  if (deleteArmedId.value === id || swipeId.value === id) {
    return { transform: `translateX(-${SWIPE_WIDTH}px)` }
  }
  return undefined
}

function onConvPointerDown(event: PointerEvent, id: string) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  // 新的按下是主动点击，前一次滑动只拦截它自己产生的点击。
  lastSwipeAt = 0
  // 按住另一行时先收起已展开的行
  if (swipeId.value && swipeId.value !== id) resetSwipe()
  track = {
    id,
    startX: event.clientX,
    startY: event.clientY,
    from: swipeId.value === id ? -SWIPE_WIDTH : 0,
    active: false,
  }
}

function onConvPointerMove(event: PointerEvent) {
  if (!track) return
  const dx = event.clientX - track.startX
  const dy = event.clientY - track.startY
  if (!track.active) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
    // 竖向手势是滚动列表，交还给浏览器
    if (Math.abs(dy) > Math.abs(dx)) {
      track = null
      return
    }
    track.active = true
    draggingId.value = track.id
    deleteArmedId.value = null
  }
  if (Math.abs(dx) > 10) lastSwipeAt = Date.now()
  dragOffset.value = Math.min(0, Math.max(-SWIPE_WIDTH, track.from + dx))
}

function onConvPointerEnd() {
  if (!track) return
  const { id, active } = track
  track = null
  if (!active) return
  draggingId.value = null
  if (dragOffset.value <= -SWIPE_TRIGGER_PX) swipeId.value = id
  else resetSwipe()
  dragOffset.value = 0
}

function onRowClick(id: string) {
  // 刚滑完浏览器还会补一个 click，别把它当成「打开会话」
  if (Date.now() - lastSwipeAt < 320) return
  // 已有展开的操作栏：这一下只负责收起
  if (swipeId.value) {
    resetSwipe()
    return
  }
  emit('select', id)
}

function swipeUnread(id: string) {
  resetSwipe()
  emit('mark-unread', id)
}

function swipeHide(id: string) {
  resetSwipe()
  emit('hide', id)
}

function armDelete(id: string) {
  swipeId.value = id
  deleteArmedId.value = id
}

function confirmSwipeDelete(id: string) {
  resetSwipe()
  emit('delete', id)
}

/** 点空白处收起展开的操作栏 */
function onDocPointerDown(event: PointerEvent) {
  if (!swipeId.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('.m-swipe')) return
  resetSwipe()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
})

defineExpose({ resetSwipe })
</script>

<template>
  <div
    v-for="item in conversations"
    :key="item.id"
    class="m-swipe"
  >
    <div
      class="m-swipe-actions"
      :class="{ armed: deleteArmedId === item.id, revealed: swipeId === item.id || draggingId === item.id }"
      :inert="swipeId !== item.id"
    >
      <template v-if="deleteArmedId === item.id">
        <button class="m-swipe-btn danger wide" @click.stop="confirmSwipeDelete(item.id)">
          <Trash2 :size="17" :stroke-width="1.9" />
          清空记录同时不显示聊天
        </button>
      </template>
      <template v-else>
        <button class="m-swipe-btn mark" @click.stop="swipeUnread(item.id)">
          <MailOpen :size="17" :stroke-width="1.9" />
          标为未读
        </button>
        <button class="m-swipe-btn hide" @click.stop="swipeHide(item.id)">
          <EyeOff :size="17" :stroke-width="1.9" />
          不显示
        </button>
        <button class="m-swipe-btn danger" @click.stop="armDelete(item.id)">
          <Trash2 :size="17" :stroke-width="1.9" />
          删除
        </button>
      </template>
    </div>
    <button
      class="m-conv"
      :class="{ swiping: draggingId === item.id, pinned: item.pinned }"
      :aria-label="`${item.name}${item.unread ? `，${item.unread} 条未读消息` : ''}`"
      :style="rowStyle(item.id)"
      @pointerdown="onConvPointerDown($event, item.id)"
      @pointermove="onConvPointerMove"
      @pointerup="onConvPointerEnd"
      @pointercancel="onConvPointerEnd"
      @click="onRowClick(item.id)"
    >
      <AppAvatar
        :initials="item.initials"
        :tone="item.tone"
        :presence="item.presence"
        :rounded="item.kind === 'group'"
        :src="item.kind === 'group' ? groupAvatarSrc(item.id) : userAvatarSrc(item.peerId)"
        size="lg"
      />
      <span class="m-conv-main">
        <span class="m-conv-top">
          <span class="m-conv-name">{{ item.name }}</span>
          <Pin v-if="item.pinned" :size="12" class="m-conv-status" aria-label="已置顶" />
        </span>
        <span class="m-conv-preview">{{ item.preview }}</span>
      </span>
      <span class="m-conv-meta">
        <span class="conv-time num">{{ item.time }}</span>
        <BellOff v-if="item.muted && !item.unread" :size="13" class="m-conv-status" aria-label="消息免打扰" />
        <span v-if="item.unread" class="unread" :class="{ muted: item.muted }">
          <span :key="item.unread">{{ item.unread > 99 ? '99+' : item.unread }}</span>
        </span>
      </span>
    </button>
  </div>

  <div v-if="!conversations.length" class="m-list-empty">
    <div class="empty-mark"><MessageCircle :size="24" :stroke-width="1.7" aria-hidden="true" /></div>
    <p>{{ unreadOnly ? '没有未读消息' : '还没有聊天' }}</p>
    <template v-if="!unreadOnly">
      <span>从通讯录选择好友，或发起新的会话</span>
      <button @click="emit('new-chat')">发起聊天</button>
    </template>
  </div>
</template>

<style scoped>
.m-swipe { margin-inline: 12px; isolation: isolate; }
.m-swipe-actions { visibility: hidden; transition: visibility 220ms; }
.m-swipe-actions.revealed { visibility: visible; transition: none; }
.m-swipe:first-of-type { margin-top: 10px; border-radius: var(--r-md) var(--r-md) 0 0; }
.m-swipe:last-of-type { margin-bottom: 12px; border-radius: 0 0 var(--r-md) var(--r-md); }
.m-swipe:only-of-type { border-radius: var(--r-md); }
.m-conv { min-height: 73px; padding: 11px 10px; background: var(--surface); border-bottom: 1px solid var(--line); }
.m-conv.pinned { background: var(--surface-2); }
.m-conv-top { min-width: 0; }
.m-conv-name { font-size: 15px; font-weight: 620; }
.m-conv-preview { font-size: 13px; margin-top: 3px; }
.m-conv-status { flex-shrink: 0; color: var(--ink-3); }
.m-conv-meta { align-self: stretch; justify-content: space-between; padding: 2px 0; }
.m-list-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 60px 24px; color: var(--ink-3); text-align: center; }
.m-list-empty p { font-size: 16px; color: var(--ink-2); }
.m-list-empty span { font-size: 13px; }
.m-list-empty button { min-height: 44px; padding: 0 16px; border-radius: var(--r-sm); color: var(--accent-ink); background: var(--accent-soft); margin-top: 6px; }
</style>
