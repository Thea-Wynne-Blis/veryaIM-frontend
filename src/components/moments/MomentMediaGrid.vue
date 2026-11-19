<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Film, Play } from 'lucide-vue-next'
import { momentThumbUrl, type MomentMediaItem } from '../../api/moments'
import type { Id } from '../../api/client'

/**
 * 动态配图：1 / 2 / 3 / 4 / 5-9 张各用一种版式。
 *
 * <p>缩略图要带 Bearer Token，只能先拉成 object URL；按 (动态, 文件) 缓存，
 * 切页回来不会重复下载。视频没有服务端缩略图（缩略图只支持图片），
 * 用统一占位卡 + 时长，播放放到灯箱里。</p>
 */
const props = defineProps<{
  momentId: Id
  media: MomentMediaItem[]
}>()

const emit = defineEmits<{ (e: 'open', index: number): void }>()

const thumbs = ref<Record<string, string>>({})
const failed = ref<Record<string, boolean>>({})
let disposed = false

watch(
  () => props.media,
  (items) => {
    for (const item of items) {
      if (item.kind !== 'IMAGE') continue
      const key = String(item.fileId)
      if (thumbs.value[key] || failed.value[key]) continue
      momentThumbUrl(props.momentId, item.fileId)
        .then((url) => {
          if (!disposed) thumbs.value = { ...thumbs.value, [key]: url }
        })
        .catch(() => {
          if (!disposed) failed.value = { ...failed.value, [key]: true }
        })
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  disposed = true
})

function thumbOf(item: MomentMediaItem): string | undefined {
  return thumbs.value[String(item.fileId)]
}

function ratioOf(item: MomentMediaItem): string {
  if (!item.width || !item.height) return '4 / 3'
  const ratio = item.width / item.height
  return `${Math.min(2.2, Math.max(0.62, ratio))}`
}

function durationOf(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return ''
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}
</script>

<template>
  <div class="mm-grid" :class="`count-${Math.min(media.length, 9)}`">
    <button
      v-for="(item, index) in media"
      :key="String(item.fileId)"
      type="button"
      class="mm-cell"
      :class="{ video: item.kind === 'VIDEO', single: media.length === 1 }"
      :style="media.length === 1 ? { aspectRatio: ratioOf(item) } : undefined"
      :aria-label="item.kind === 'VIDEO' ? '播放视频' : '查看大图'"
      @click="emit('open', index)"
    >
      <img
        v-if="item.kind === 'IMAGE' && thumbOf(item)"
        class="mm-image"
        :src="thumbOf(item)"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <span v-else-if="item.kind === 'IMAGE'" class="mm-placeholder" :class="{ failed: failed[String(item.fileId)] }" />
      <span v-else class="mm-placeholder video-track">
        <Film :size="22" :stroke-width="1.4" />
      </span>
      <span v-if="item.kind === 'VIDEO'" class="mm-play"><Play :size="16" fill="currentColor" /></span>
      <span v-if="item.kind === 'VIDEO' && durationOf(item.durationSeconds)" class="mm-duration num">
        {{ durationOf(item.durationSeconds) }}
      </span>
    </button>
  </div>
</template>

<style scoped>
.mm-grid { display: grid; gap: 6px; margin-top: 12px; max-width: 420px; }
.mm-grid.count-1 { grid-template-columns: minmax(0, 320px); }
.mm-grid.count-2,
.mm-grid.count-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.mm-grid.count-3,
.mm-grid.count-5,
.mm-grid.count-6,
.mm-grid.count-7,
.mm-grid.count-8,
.mm-grid.count-9 { grid-template-columns: repeat(3, minmax(0, 1fr)); }

.mm-cell {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 8px;
  background: var(--surface-3);
  border: 1px solid var(--hairline);
  transition: transform var(--dur-2) var(--ease-out);
}
.mm-cell.single { aspect-ratio: 4 / 3; }
.mm-cell:hover { transform: translateY(-1px); }
.mm-cell:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.mm-image { width: 100%; height: 100%; object-fit: cover; display: block; }
.mm-placeholder { display: grid; place-items: center; width: 100%; height: 100%; color: var(--ink-3); background: linear-gradient(135deg, var(--surface-2), var(--surface-3)); }
.mm-placeholder.failed { background: var(--danger-soft); color: var(--danger); }
.mm-placeholder.video-track { background: linear-gradient(135deg, #202628, #101416); color: #cfd6d9; }
.mm-play { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; }
.mm-play > svg { display: grid; place-items: center; width: 34px; height: 34px; padding: 9px; border-radius: 50%; background: rgba(12, 16, 18, 0.55); backdrop-filter: blur(2px); }
.mm-duration { position: absolute; right: 6px; bottom: 6px; padding: 1px 5px; border-radius: 4px; font-size: 11px; color: #fff; background: rgba(12, 16, 18, 0.62); }
@media (max-width: 768px) {
  .mm-grid { max-width: none; }
  .mm-grid.count-1 { grid-template-columns: minmax(0, 1fr); }
  .mm-cell.single { max-height: 320px; }
}
</style>
