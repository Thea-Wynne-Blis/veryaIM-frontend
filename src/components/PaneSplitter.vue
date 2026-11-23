<script setup lang="ts">
/**
 * 通用竖向拖拽分隔条。
 *
 * <p>只负责交互与视觉（指针、方向键、双击复位），不持有尺寸状态：
 * 父组件在 `@start` 记下起始尺寸，按 `@offset` 的位移算出新尺寸，
 * 再通过 `offset` 决定分隔条贴在哪条边线上。</p>
 */
import { onBeforeUnmount, ref } from 'vue'

withDefaults(defineProps<{
  /** 无障碍描述，例如「拖拽调整笔记列表宽度」 */
  label: string
  /** 分隔条中心的 CSS 位置，例如 calc(var(--notes-list-width) - 3px) */
  offset: string
  /** 当前尺寸，仅用于无障碍读数 */
  value?: number
}>(), { value: undefined })

const emit = defineEmits<{
  (e: 'start'): void
  (e: 'offset', deltaX: number): void
  (e: 'end'): void
  /** 按下左右方向键，参数为 -1 / 1 */
  (e: 'nudge', direction: number): void
  (e: 'reset'): void
}>()

const dragging = ref(false)
let startX = 0

function stop() {
  dragging.value = false
  document.body.classList.remove('is-resizing')
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onUp)
}

function onMove(event: PointerEvent) {
  if (!dragging.value) return
  emit('offset', event.clientX - startX)
}

function onUp() {
  if (!dragging.value) return
  stop()
  emit('end')
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  startX = event.clientX
  dragging.value = true
  document.body.classList.add('is-resizing')
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  emit('start')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  emit('nudge', event.key === 'ArrowRight' ? 1 : -1)
}

onBeforeUnmount(stop)
</script>

<template>
  <div
    class="pane-splitter"
    :class="{ active: dragging }"
    :style="{ left: offset }"
    role="separator"
    aria-orientation="vertical"
    :aria-label="label"
    :aria-valuenow="value"
    tabindex="0"
    @pointerdown="onPointerDown"
    @keydown="onKeydown"
    @dblclick="emit('reset')"
  />
</template>

<style scoped>
.pane-splitter {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 4;
  width: 7px;
  cursor: col-resize;
  touch-action: none;
  outline: none;
}

.pane-splitter::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background: transparent;
  transition: background var(--dur-1) var(--ease-out);
}

.pane-splitter:hover::after,
.pane-splitter:focus-visible::after,
.pane-splitter.active::after {
  background: var(--accent);
}
</style>
