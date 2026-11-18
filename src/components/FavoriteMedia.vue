<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ImageOff, Loader2 } from 'lucide-vue-next'
import { fileObjectUrl, thumbObjectUrl, type Id } from '../api/client'

const props = defineProps<{ fileId: Id; name: string; full?: boolean }>()
const root = ref<HTMLElement | null>(null)
const url = ref('')
const failed = ref(false)
const loading = ref(false)
let observer: IntersectionObserver | undefined
let active = true

async function load() {
  observer?.disconnect()
  loading.value = true
  try {
    const image = await (props.full ? fileObjectUrl(props.fileId) : thumbObjectUrl(props.fileId))
    if (active) url.value = image
  } catch { if (active) failed.value = true }
  finally { if (active) loading.value = false }
}

onMounted(() => {
  if (props.full || typeof IntersectionObserver === 'undefined') { void load(); return }
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) void load()
  }, { rootMargin: '100px' })
  if (root.value) observer.observe(root.value)
})
onBeforeUnmount(() => { active = false; observer?.disconnect() })
</script>

<template>
  <span ref="root" class="favorite-media" :class="{ full }">
    <img v-if="url && !failed" :src="url" :alt="name" decoding="async" @error="failed = true" />
    <span v-else class="media-state"><Loader2 v-if="loading" :size="22" class="spin" /><ImageOff v-else :size="24" :stroke-width="1.5" /><span v-if="failed">图片暂不可用</span></span>
  </span>
</template>

<style scoped>
.favorite-media { display: flex; align-items: center; justify-content: center; width: 108px; height: 108px; flex-shrink: 0; border-radius: 8px; overflow: hidden; background: var(--surface-3); color: var(--ink-3); }
img { display: block; width: 100%; height: 100%; object-fit: cover; }
.full { width: 100%; height: auto; min-height: 180px; }
.full img { max-height: 470px; object-fit: contain; }
.media-state { display: flex; align-items: center; flex-direction: column; gap: 10px; font-size: 12px; padding: 24px; }
.spin { animation: tick-spin 900ms linear infinite; }
</style>
