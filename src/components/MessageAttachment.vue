<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Download, FileText, ImageOff, Loader2 } from 'lucide-vue-next'
import { downloadFile, fileObjectUrl, thumbObjectUrl } from '../api/client'
import type { Attachment } from '../data/workspace'

const props = defineProps<{ attachment: Attachment }>()

/** 气泡里显示缩略图；原图只在点开时才下载。 */
const thumb = ref('')
const loading = ref(false)
const failed = ref(false)
const downloading = ref(false)
const opening = ref(false)

const isImage = computed(() => props.attachment.kind === 'image')

/**
 * 用消息里记录的宽高先占位，图片到达前后高度一致，列表不会跳动。
 * 没有记录（老消息）时退回 3:2，接近常见截图比例。
 */
const ratioStyle = computed(() => {
  const width = Number(props.attachment.width) || 0
  const height = Number(props.attachment.height) || 0
  if (width > 0 && height > 0) {
    return { aspectRatio: `${width} / ${height}` }
  }
  return { aspectRatio: '3 / 2' }
})

async function loadThumb() {
  const fileId = props.attachment.fileId
  if (!isImage.value || !fileId) return
  loading.value = true
  failed.value = false
  try {
    thumb.value = await thumbObjectUrl(fileId)
  } catch {
    // 缩略图生成失败（少见格式）时回退原图，至少能看
    try {
      thumb.value = await fileObjectUrl(fileId)
    } catch {
      failed.value = true
    }
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

/** 点击才取原图；object URL 由 api 层缓存，反复打开不会重复下载。 */
async function openPreview() {
  const fileId = props.attachment.fileId
  if (!fileId || opening.value) return
  opening.value = true
  try {
    const url = await fileObjectUrl(fileId)
    window.open(url, '_blank', 'noopener')
  } catch {
    failed.value = true
  } finally {
    opening.value = false
  }
}

onMounted(loadThumb)

// 虚拟列表复用组件时 fileId 会变，缩略图跟着换
watch(
  () => props.attachment.fileId,
  () => {
    thumb.value = ''
    void loadThumb()
  },
)
</script>

<template>
  <div v-if="isImage" class="bubble media">
    <button class="image-wrap" type="button" title="打开原图" @click="openPreview">
      <img
        v-if="thumb"
        :src="thumb"
        :alt="attachment.name"
        decoding="async"
        :style="ratioStyle"
      />
      <span v-else class="media-ph" :style="ratioStyle">
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

.media-ph {
  width: 258px;
  max-height: 260px;
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
