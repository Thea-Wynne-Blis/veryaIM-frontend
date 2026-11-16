<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Download, FileText, ImageOff, Loader2 } from 'lucide-vue-next'
import { downloadFile, fileObjectUrl } from '../api/client'
import type { Attachment } from '../data/workspace'

const props = defineProps<{ attachment: Attachment }>()

const preview = ref('')
const loading = ref(false)
const failed = ref(false)
const downloading = ref(false)

const isImage = props.attachment.kind === 'image'

async function loadPreview() {
  if (!isImage || !props.attachment.fileId) return
  loading.value = true
  try {
    preview.value = await fileObjectUrl(props.attachment.fileId)
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

async function download() {
  if (!props.attachment.fileId) return
  downloading.value = true
  try {
    await downloadFile(props.attachment.fileId, props.attachment.name)
  } finally {
    downloading.value = false
  }
}

function openPreview() {
  if (preview.value) window.open(preview.value, '_blank')
}

onMounted(loadPreview)
onBeforeUnmount(() => {
  if (preview.value) URL.revokeObjectURL(preview.value)
})
</script>

<template>
  <div v-if="isImage" class="bubble media">
    <button class="image-wrap" type="button" title="打开原图" @click="openPreview">
      <img v-if="preview" :src="preview" :alt="attachment.name" />
      <span v-else class="media-ph">
        <Loader2 v-if="loading" :size="18" class="spin" />
        <template v-else>
          <ImageOff :size="20" :stroke-width="1.6" />
          <span style="margin-top: 6px">图片加载失败</span>
        </template>
      </span>
    </button>
    <button
      class="image-download"
      type="button"
      title="下载图片"
      :disabled="downloading"
      @click.stop="download"
    >
      <Loader2 v-if="downloading" :size="13" class="spin" />
      <Download v-else :size="13" :stroke-width="2" />
    </button>
  </div>

  <div v-else class="bubble" style="padding: 9px">
    <button class="attach" type="button" :disabled="downloading" @click="download">
      <span class="attach-icon">
        <Loader2 v-if="downloading" :size="16" class="spin" />
        <FileText v-else :size="17" :stroke-width="1.8" />
      </span>
      <span class="attach-meta">
        <span class="attach-name">{{ attachment.name }}</span>
        <span class="attach-size">{{ attachment.size }}</span>
      </span>
      <Download :size="14" :stroke-width="1.9" class="attach-download" />
    </button>
  </div>
</template>

<style scoped>
.image-wrap {
  display: block;
  padding: 0;
  border: 0;
  background: none;
  cursor: zoom-in;
}

.image-wrap img {
  display: block;
  width: 258px;
  max-height: 260px;
  object-fit: cover;
  border-radius: calc(var(--r-md) - 3px);
}

.image-download {
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: var(--r-full);
  background: color-mix(in srgb, var(--ink) 58%, transparent);
  color: #fff;
  opacity: 0;
  transition: opacity var(--dur-1) var(--ease-out);
}

.bubble.media:hover .image-download {
  opacity: 1;
}

.bubble.media {
  position: relative;
}

.attach {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 224px;
  width: 100%;
  text-align: left;
}

.attach-download {
  margin-left: auto;
  color: var(--ink-3);
  flex-shrink: 0;
}

.spin {
  animation: tick-spin 900ms linear infinite;
}
</style>
