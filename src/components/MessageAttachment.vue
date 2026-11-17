<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Download,
  FileText,
  ImageOff,
  Loader2,
  Pause,
  Play,
  Volume2,
} from 'lucide-vue-next'
import { downloadFile, fileObjectUrl, thumbObjectUrl } from '../api/client'
import type { Attachment } from '../data/workspace'
import { formatDuration } from '../utils/media'

const props = defineProps<{ attachment: Attachment }>()

/** 气泡里显示缩略图/封面；原图、视频、音频都只在点开时才下载。 */
const thumb = ref('')
const loading = ref(false)
const failed = ref(false)
const downloading = ref(false)
const opening = ref(false)

/* ---------- 图片 ---------- */
const isImage = computed(() => props.attachment.kind === 'image')

/**
 * 用消息里记录的宽高先占位，图片/视频到达前后高度一致，列表不会跳动。
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
    // GIF 动图必须用原图：服务端缩略图会把动图压成静态首帧
    thumb.value = props.attachment.animated
      ? await fileObjectUrl(fileId)
      : await thumbObjectUrl(fileId)
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

/* ---------- 视频 ---------- */
const isVideo = computed(() => props.attachment.kind === 'video')
const poster = ref('')
const playing = ref(false)
const videoUrl = ref('')
const videoEl = ref<HTMLVideoElement | null>(null)

const durationLabel = computed(() =>
  props.attachment.duration ? formatDuration(props.attachment.duration) : '',
)

async function loadPoster() {
  const posterId = props.attachment.posterId
  if (!isVideo.value || !posterId) return
  try {
    poster.value = await thumbObjectUrl(posterId)
  } catch {
    try {
      poster.value = await fileObjectUrl(posterId)
    } catch {
      poster.value = ''
    }
  }
}

async function openVideo() {
  const fileId = props.attachment.fileId
  if (!fileId || opening.value) return
  opening.value = true
  try {
    if (!videoUrl.value) videoUrl.value = await fileObjectUrl(fileId)
    playing.value = true
    await nextTick()
    await videoEl.value?.play().catch(() => {
      /* 自动播放被拦截时用户可点原生控件 */
    })
  } catch {
    failed.value = true
  } finally {
    opening.value = false
  }
}

/* ---------- 音频 ---------- */
const isAudio = computed(() => props.attachment.kind === 'audio')
const audioUrl = ref('')
const audioEl = ref<HTMLAudioElement | null>(null)
const audioPlaying = ref(false)
const audioLoading = ref(false)
const audioCurrent = ref(0)
const audioTotal = ref(0)

const audioProgress = computed(() => {
  const total = audioTotal.value || props.attachment.duration || 0
  if (!total) return 0
  return Math.min(1, audioCurrent.value / total)
})

const audioLabel = computed(() => {
  const total = audioTotal.value || props.attachment.duration || 0
  return formatDuration(total)
})

async function toggleAudio() {
  if (audioPlaying.value) {
    audioEl.value?.pause()
    return
  }
  if (!audioUrl.value) {
    const fileId = props.attachment.fileId
    if (!fileId) return
    audioLoading.value = true
    try {
      audioUrl.value = await fileObjectUrl(fileId)
    } catch {
      failed.value = true
      return
    } finally {
      audioLoading.value = false
    }
    await nextTick()
  }
  try {
    await audioEl.value?.play()
  } catch {
    failed.value = true
  }
}

function seekAudio(event: MouseEvent) {
  const el = event.currentTarget as HTMLElement
  const total = audioTotal.value || props.attachment.duration || 0
  if (!el || !total) return
  const rect = el.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  audioCurrent.value = total * ratio
  if (audioEl.value) audioEl.value.currentTime = total * ratio
}

function onAudioTime() {
  audioCurrent.value = audioEl.value?.currentTime ?? 0
}

function onAudioMeta() {
  const duration = audioEl.value?.duration ?? 0
  if (Number.isFinite(duration) && duration > 0) audioTotal.value = duration
}

/* ---------- 通用 ---------- */
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

onMounted(() => {
  void loadThumb()
  void loadPoster()
})

onBeforeUnmount(() => {
  audioEl.value?.pause()
  videoEl.value?.pause()
})

// 虚拟列表复用组件时 fileId 会变，缩略图跟着换
watch(
  () => props.attachment.fileId,
  () => {
    thumb.value = ''
    poster.value = ''
    playing.value = false
    videoUrl.value = ''
    audioUrl.value = ''
    audioPlaying.value = false
    audioCurrent.value = 0
    audioTotal.value = 0
    failed.value = false
    void loadThumb()
    void loadPoster()
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

  <div v-else-if="isVideo" class="bubble media">
    <video
      v-if="playing"
      ref="videoEl"
      class="video-player"
      :src="videoUrl"
      controls
      playsinline
      :style="ratioStyle"
    />
    <button v-else class="image-wrap video-wrap" type="button" title="播放视频" @click="openVideo">
      <img v-if="poster" :src="poster" :alt="attachment.name" :style="ratioStyle" />
      <span v-else class="media-ph video-ph" :style="ratioStyle">
        <Loader2 v-if="opening" :size="18" class="spin" />
        <Play v-else :size="22" :stroke-width="1.6" />
      </span>
      <span v-if="!opening" class="video-play" aria-hidden="true">
        <Play :size="18" :stroke-width="2" />
      </span>
      <span v-if="durationLabel" class="video-badge num">{{ durationLabel }}</span>
    </button>
    <button
      class="image-download"
      type="button"
      title="下载视频"
      :disabled="downloading"
      @click.stop="download"
    >
      <Loader2 v-if="downloading" :size="13" class="spin" />
      <Download v-else :size="13" :stroke-width="2" />
    </button>
  </div>

  <div v-else-if="isAudio" class="bubble audio">
    <button class="audio-play" type="button" :disabled="audioLoading" @click="toggleAudio">
      <Loader2 v-if="audioLoading" :size="15" class="spin" />
      <Pause v-else-if="audioPlaying" :size="14" :stroke-width="2" />
      <Play v-else :size="15" :stroke-width="2" />
    </button>
    <div class="audio-main">
      <div class="audio-title truncate">{{ attachment.name }}</div>
      <div class="audio-track" @click="seekAudio">
        <span class="audio-fill" :style="{ width: `${audioProgress * 100}%` }" />
      </div>
      <div class="audio-meta num">
        <Volume2 :size="10" :stroke-width="2" />
        {{ formatDuration(audioCurrent) }} / {{ audioLabel }}
      </div>
    </div>
    <button
      class="audio-download"
      type="button"
      title="下载音频"
      :disabled="downloading"
      @click.stop="download"
    >
      <Loader2 v-if="downloading" :size="13" class="spin" />
      <Download v-else :size="13" :stroke-width="1.9" />
    </button>
    <audio
      v-if="audioUrl"
      ref="audioEl"
      :src="audioUrl"
      preload="auto"
      @play="audioPlaying = true"
      @pause="audioPlaying = false"
      @ended="audioPlaying = false"
      @timeupdate="onAudioTime"
      @loadedmetadata="onAudioMeta"
    />
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

/* ---------- 视频 ---------- */
.video-wrap {
  position: relative;
  cursor: pointer;
}

.media-ph.video-ph {
  display: grid;
  place-items: center;
  height: auto;
  min-height: 120px;
  border-radius: calc(var(--r-md) - 3px);
  background: color-mix(in srgb, var(--ink) 12%, transparent);
  color: var(--ink-3);
}

.video-play {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 44px;
  height: 44px;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  border-radius: var(--r-full);
  background: color-mix(in srgb, var(--ink) 52%, transparent);
  color: #fff;
  padding-left: 2px;
  transition: background var(--dur-1) var(--ease-out);
}

.video-wrap:hover .video-play {
  background: color-mix(in srgb, var(--ink) 68%, transparent);
}

.video-badge {
  position: absolute;
  left: 10px;
  bottom: 10px;
  padding: 1px 6px;
  border-radius: var(--r-full);
  background: color-mix(in srgb, var(--ink) 58%, transparent);
  color: #fff;
  font-size: 10px;
  line-height: 16px;
}

.video-player {
  display: block;
  width: 258px;
  max-height: 320px;
  border-radius: calc(var(--r-md) - 3px);
  background: #000;
}

/* ---------- 音频 ---------- */
.bubble.audio {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  min-width: 224px;
}

.audio-play {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: var(--r-full);
  background: color-mix(in srgb, var(--ink) 7%, transparent);
  color: var(--ink);
  transition: background var(--dur-1) var(--ease-out);
}

.audio-play:hover {
  background: color-mix(in srgb, var(--ink) 12%, transparent);
}

.audio-main {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  flex: 1;
}

.audio-title {
  font-size: 12.5px;
  color: var(--ink-2);
}

.audio-track {
  position: relative;
  height: 3px;
  border-radius: var(--r-full);
  background: color-mix(in srgb, var(--ink) 12%, transparent);
  cursor: pointer;
}

.audio-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: var(--ink-3);
}

.audio-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--ink-3);
}

.audio-download {
  flex-shrink: 0;
  color: var(--ink-3);
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: var(--r-full);
}

.audio-download:hover {
  background: color-mix(in srgb, var(--ink) 8%, transparent);
}

/* 自己发的消息底色是强调色渐变，文字/轨道要反色 */
.msg.out .audio-title {
  color: rgba(255, 255, 255, 0.92);
}

.msg.out .audio-meta {
  color: rgba(255, 255, 255, 0.74);
}

.msg.out .audio-track {
  background: rgba(255, 255, 255, 0.3);
}

.msg.out .audio-fill {
  background: #fff;
}

.msg.out .audio-play {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}

.msg.out .audio-play:hover {
  background: rgba(255, 255, 255, 0.26);
}

.msg.out .audio-download {
  color: rgba(255, 255, 255, 0.82);
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
