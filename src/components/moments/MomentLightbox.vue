<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-vue-next'
import { momentMediaUrl, type MomentMediaItem } from '../../api/moments'
import type { Id } from '../../api/client'

/**
 * 图片 / 视频灯箱。
 *
 * <p>原图与视频都必须带 Token 才能读，这里在切到某一张时才拉取，
 * 并复用全局 object URL 缓存；关闭后不 revoke，切回来仍然秒开。</p>
 */
const props = defineProps<{
  momentId: Id
  media: MomentMediaItem[]
  startIndex: number
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const dialog = ref<HTMLDialogElement | null>(null)
const index = ref(Math.min(Math.max(0, props.startIndex), Math.max(0, props.media.length - 1)))
const urls = ref<Record<string, string>>({})
const failedItems = ref(new Set<string>())
const pendingItems = new Set<string>()

const current = computed(() => props.media[index.value])
const currentKey = computed(() => current.value ? String(current.value.fileId) : '')
const currentUrl = computed(() => urls.value[currentKey.value])
const failed = computed(() => failedItems.value.has(currentKey.value))
const loading = computed(() => Boolean(current.value && !currentUrl.value && !failed.value))
const hasPrev = computed(() => index.value > 0)
const hasNext = computed(() => index.value < props.media.length - 1)

onMounted(() => {
  dialog.value?.showModal()
  window.addEventListener('keydown', onKeydown)
  void ensure(index.value)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  dialog.value?.close()
})

watch(index, (value) => { void ensure(value) })

async function ensure(target: number) {
  const item = props.media[target]
  if (!item) return
  const key = String(item.fileId)
  if (urls.value[key] || pendingItems.has(key)) return
  pendingItems.add(key)
  failedItems.value.delete(key)
  try {
    const url = await momentMediaUrl(props.momentId, item.fileId)
    urls.value = { ...urls.value, [key]: url }
  } catch {
    failedItems.value.add(key)
  } finally {
    pendingItems.delete(key)
  }
}

function go(step: number) {
  const next = index.value + step
  if (next < 0 || next >= props.media.length) return
  index.value = next
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
  else if (event.key === 'ArrowLeft') go(-1)
  else if (event.key === 'ArrowRight') go(1)
}

function close() {
  emit('close')
}
</script>

<template>
  <dialog ref="dialog" class="lightbox" aria-label="动态媒体预览" @cancel.prevent="close" @click="close">
    <div class="lightbox-stage" @click.stop>
      <button type="button" class="lightbox-close" aria-label="关闭" @click="close"><X :size="20" /></button>
      <button v-if="hasPrev" type="button" class="lightbox-nav prev" aria-label="上一张" @click="go(-1)"><ChevronLeft :size="22" /></button>
      <div class="lightbox-media">
        <p v-if="loading" class="lightbox-hint"><Loader2 :size="22" class="spin" /></p>
        <p v-else-if="failed" class="lightbox-hint">暂时无法加载这项媒体</p>
        <video v-else-if="current?.kind === 'VIDEO' && currentUrl" :src="currentUrl" controls autoplay playsinline />
        <img v-else-if="currentUrl" :src="currentUrl" alt="" />
      </div>
      <button v-if="hasNext" type="button" class="lightbox-nav next" aria-label="下一张" @click="go(1)"><ChevronRight :size="22" /></button>
      <p v-if="media.length > 1" class="lightbox-count num">{{ index + 1 }} / {{ media.length }}</p>
    </div>
  </dialog>
</template>

<style scoped>
.lightbox { width: 100vw; height: 100dvh; max-width: none; max-height: none; padding: 0; border: 0; color: #fff; background: rgba(8, 10, 12, 0.92); }
.lightbox::backdrop { background: rgba(8, 10, 12, 0.92); }
.lightbox-stage { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; padding: 56px 64px; }
.lightbox-media { display: flex; align-items: center; justify-content: center; max-width: 100%; max-height: 100%; }
.lightbox-media img,
.lightbox-media video { max-width: min(100%, 1200px); max-height: calc(100dvh - 112px); border-radius: var(--r-sm); object-fit: contain; }
.lightbox-hint { display: grid; place-items: center; gap: 10px; font-size: 13px; color: rgba(255, 255, 255, 0.7); }
.lightbox-close { position: absolute; top: 16px; right: 16px; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; color: #fff; background: rgba(255, 255, 255, 0.12); }
.lightbox-close:hover { background: rgba(255, 255, 255, 0.2); }
.lightbox-nav { position: absolute; top: 50%; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; color: #fff; background: rgba(255, 255, 255, 0.12); transform: translateY(-50%); }
.lightbox-nav:hover { background: rgba(255, 255, 255, 0.22); }
.lightbox-nav.prev { left: 14px; }
.lightbox-nav.next { right: 14px; }
.lightbox-count { position: absolute; bottom: 20px; left: 50%; padding: 4px 10px; border-radius: var(--r-full); font-size: 12px; color: rgba(255, 255, 255, 0.85); background: rgba(255, 255, 255, 0.12); transform: translateX(-50%); }
.spin { animation: tick-spin 900ms linear infinite; }
@media (max-width: 768px) {
  .lightbox-stage { padding: 52px 8px calc(env(safe-area-inset-bottom, 0px) + 48px); }
  .lightbox-media img,
  .lightbox-media video { max-height: calc(var(--mobile-viewport-height, 100dvh) - 120px); }
  .lightbox-nav { top: auto; bottom: calc(env(safe-area-inset-bottom, 0px) + 12px); transform: none; }
  .lightbox-count { bottom: calc(env(safe-area-inset-bottom, 0px) + 22px); }
}
</style>
