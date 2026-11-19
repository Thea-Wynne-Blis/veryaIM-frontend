<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ImageOff, Play } from 'lucide-vue-next'
import { momentThumbUrl, type MomentMediaItem } from '../../api/moments'
import type { Id } from '../../api/client'

/**
 * 动态配图：1 / 2 / 3 / 4 / 5-9 张各用一种版式。
 *
 * <p>缩略图要带 Bearer Token，只能先拉成 object URL；按 (动态, 文件) 缓存，
 * 切页回来不会重复下载。视频没有服务端缩略图（缩略图只支持图片），
 * 用统一占位卡 + 时长，播放放到灯箱里。</p>
 *
 * <p>进入视口前 400px 才开始拉图：信息流一屏可能有几十张图，
 * 全部在挂载时发起会把可见区域自己的请求挤到 6 条连接后面。</p>
 */
const props = defineProps<{
  momentId: Id
  media: MomentMediaItem[]
}>()

const emit = defineEmits<{ (e: 'open', index: number): void }>()

const grid = ref<HTMLElement | null>(null)
const thumbs = ref<Record<string, string>>({})
const failed = ref<Record<string, boolean>>({})
const visible = ref(false)
let disposed = false
let observer: IntersectionObserver | null = null

/** 按版式选宽度：多图格子约 120px，320 够 2 倍屏；单图最宽要 640。 */
const thumbWidth = computed(() => {
  const count = props.media.length
  if (count <= 1) return 640
  if (count === 2 || count === 4) return 480
  return 320
})

watch(
  () => props.media,
  () => {
    void loadThumbs()
  },
)

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') {
    reveal()
    return
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    observer?.disconnect()
    observer = null
    reveal()
  }, { rootMargin: '400px 0px' })
  if (grid.value) observer.observe(grid.value)
  else reveal()
})

onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  observer = null
})

function reveal() {
  if (visible.value) return
  visible.value = true
  void loadThumbs()
}

async function loadThumbs() {
  if (!visible.value) return
  const width = thumbWidth.value
  for (const item of props.media) {
    if (item.kind !== 'IMAGE') continue
    const key = String(item.fileId)
    if (thumbs.value[key] || failed.value[key]) continue
    try {
      const url = await momentThumbUrl(props.momentId, item.fileId, width)
      if (!disposed) thumbs.value = { ...thumbs.value, [key]: url }
    } catch {
      if (!disposed) failed.value = { ...failed.value, [key]: true }
    }
  }
}

function thumbOf(item: MomentMediaItem): string | undefined {
  return thumbs.value[String(item.fileId)]
}

function ratioOf(item: MomentMediaItem): number {
  if (item.width > 0 && item.height > 0) {
    return Math.min(2.2, Math.max(0.62, item.width / item.height))
  }
  return 4 / 3
}

function durationOf(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return ''
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}
</script>

<template>
  <div ref="grid" class="mm-grid" :class="`count-${Math.min(media.length, 9)}`">
    <button
      v-for="(item, index) in media"
      :key="String(item.fileId)"
      type="button"
      class="mm-cell"
      :class="{ video: item.kind === 'VIDEO', single: media.length === 1 }"
      :style="media.length === 1 ? { '--mm-ratio': ratioOf(item) } : undefined"
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
      <span v-else-if="item.kind === 'IMAGE'" class="mm-placeholder" aria-hidden="true">
        <ImageOff v-if="failed[String(item.fileId)]" :size="22" :stroke-width="1.5" />
      </span>
      <span v-if="item.kind === 'VIDEO'" class="mm-play"><Play :size="16" fill="currentColor" /></span>
      <span v-if="item.kind === 'VIDEO' && durationOf(item.durationSeconds)" class="mm-duration num">
        {{ durationOf(item.durationSeconds) }}
      </span>
    </button>
  </div>
</template>

<style scoped>
.mm-grid {
  --mm-default-width: 420px;
  --mm-default-single: 360px;
  display: grid;
  gap: var(--mm-gap, 6px);
  margin-top: var(--mm-top, 14px);
  max-width: var(--mm-max-width, var(--mm-default-width));
}
.mm-grid.count-1 { max-width: var(--mm-single-width, var(--mm-default-single)); grid-template-columns: minmax(0, 1fr); }
.mm-grid.count-2,
.mm-grid.count-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: min(var(--mm-pair-width, var(--mm-default-width)), 540px); }
.mm-grid.count-3,
.mm-grid.count-5,
.mm-grid.count-6,
.mm-grid.count-7,
.mm-grid.count-8,
.mm-grid.count-9 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.mm-grid.count-5,
.mm-grid.count-6,
.mm-grid.count-7,
.mm-grid.count-8,
.mm-grid.count-9 { max-width: min(var(--mm-max-width, var(--mm-default-width)), 540px); }

.mm-cell {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--mm-radius, var(--r-sm));
  background: var(--surface-3);
  box-shadow: inset 0 0 0 1px var(--hairline);
}
.mm-grid.count-2 .mm-cell,
.mm-grid.count-4 .mm-cell { aspect-ratio: var(--mm-pair-ratio, 4 / 3); }
.mm-cell.single { max-width: calc(var(--mm-single-height, 310px) * var(--mm-ratio)); aspect-ratio: var(--mm-ratio); }
.mm-cell.video { background: radial-gradient(ellipse at 50% 40%, #3a4b52, #182226 76%); }
.mm-cell:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.mm-image { width: 100%; height: 100%; object-fit: cover; transition: filter var(--dur-2); }
.mm-cell:hover .mm-image { filter: brightness(.94); }
.mm-placeholder { display: grid; place-items: center; width: 100%; height: 100%; color: var(--ink-3); background: linear-gradient(135deg, var(--surface-2), var(--surface-3)); }
.mm-play { position: absolute; top: 50%; left: 50%; display: grid; place-items: center; width: 40px; height: 40px; transform: translate(-50%, -50%); border: 1px solid #ffffff55; border-radius: 50%; color: #fff; background: #0c10186b; transition: background var(--dur-2); }
.mm-cell:hover .mm-play { background: #0c1018b3; }
.mm-play > svg { margin-left: 2px; }
.mm-duration { position: absolute; right: 6px; bottom: 6px; padding: 1px 5px; border-radius: 4px; font-size: 11px; color: #fff; background: rgba(12, 16, 18, 0.62); }
@media (max-width: 768px) {
  .mm-grid { --mm-default-width: 100%; --mm-default-single: 100%; gap: var(--mm-gap, 5px); margin-top: var(--mm-top, 12px); }
}
</style>
