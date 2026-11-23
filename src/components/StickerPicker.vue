<script setup lang="ts">
import { ref } from 'vue'
import { Search, Loader2, Sparkles } from 'lucide-vue-next'
import { collectSticker, searchStickers } from '../api/stickers'
import { useChatStore } from '../stores/chat'
import { messageOf } from '../utils/error'

const props = defineProps<{
  /** 目标会话；表情入库后直接发到这个会话。 */
  conversationId: string
}>()

const emit = defineEmits<{ (e: 'sent'): void }>()

const chat = useChatStore()
const keyword = ref('')
const items = ref<string[]>([])
const loading = ref(false)
const sendingUrl = ref('')
const error = ref('')
const searched = ref(false)
/** 图源站偶尔有单张图拿不到（挂起/过期），失败的格子直接不显示，别留破图。 */
const failed = ref<string[]>([])

/** 常见搜索词：让第一次点开的人不必猜搜什么。 */
const hotWords = ['无语', '哈哈', '猫', '打脸', '加油', '狗头']

let searchSeq = 0

/**
 * 预览图走本站中转：部分网络直连图源 CDN 会长时间挂住，
 * 面板看起来像一直在转圈；服务端有连接复用和预取缓存。
 */
function previewSrc(url: string): string {
  return `/api/v1/stickers/image?url=${encodeURIComponent(url)}`
}

function markFailed(url: string) {
  if (!failed.value.includes(url)) failed.value.push(url)
}

async function runSearch(word?: string) {
  const query = (word ?? keyword.value).trim()
  if (!query || loading.value) return
  keyword.value = query
  const seq = ++searchSeq
  loading.value = true
  error.value = ''
  try {
    const result = await searchStickers(query)
    if (seq !== searchSeq) return
    items.value = Array.isArray(result?.items) ? result.items : []
    failed.value = []
    searched.value = true
  } catch (e) {
    if (seq !== searchSeq) return
    items.value = []
    error.value = messageOf(e, '搜索失败，请稍后再试')
  } finally {
    if (seq === searchSeq) loading.value = false
  }
}

/**
 * 点选一张网络表情：先由服务端下载入库（校验域名、类型、体积），
 * 再用返回的 fileId 发送 IMAGE 消息，历史记录不依赖第三方站点是否存活。
 */
async function send(url: string) {
  if (sendingUrl.value) return
  sendingUrl.value = url
  error.value = ''
  try {
    const file = await collectSticker(url, props.conversationId)
    await chat.sendSticker(file, props.conversationId)
    emit('sent')
  } catch (e) {
    error.value = messageOf(e, '表情发送失败，请换一张试试')
  } finally {
    sendingUrl.value = ''
  }
}
</script>

<template>
  <div class="sticker-picker">
    <form class="sticker-search" @submit.prevent="runSearch()">
      <Search :size="13" :stroke-width="2" class="sticker-search-icon" />
      <input
        v-model="keyword"
        class="sticker-input"
        type="search"
        maxlength="30"
        placeholder="搜网络表情，如「无语」「猫」"
        aria-label="搜索网络表情包"
      />
      <button
        class="sticker-search-btn"
        type="submit"
        :disabled="loading || !keyword.trim()"
      >
        <Loader2 v-if="loading" :size="13" class="spin" />
        <span v-else>搜索</span>
      </button>
    </form>

    <div class="sticker-hot">
      <button
        v-for="word in hotWords"
        :key="word"
        class="sticker-hot-chip"
        type="button"
        :disabled="loading"
        @click="runSearch(word)"
      >
        {{ word }}
      </button>
    </div>

    <div class="sticker-body">
      <div v-if="loading && !items.length" class="sticker-state">
        <Loader2 :size="14" class="spin" />
        正在搜索…
      </div>
      <div v-else-if="error" class="sticker-state error">{{ error }}</div>
      <div v-else-if="items.length" class="sticker-grid">
        <button
          v-for="(url, index) in items"
          v-show="!failed.includes(url)"
          :key="url"
          class="sticker-item"
          type="button"
          :disabled="!!sendingUrl"
          :class="{ sending: sendingUrl === url }"
          title="点击发送这张表情"
          @click="send(url)"
        >
          <img
            :src="previewSrc(url)"
            alt=""
            :loading="index < 12 ? 'eager' : 'lazy'"
            decoding="async"
            referrerpolicy="no-referrer"
            @error="markFailed(url)"
          />
          <span v-if="sendingUrl === url" class="sticker-sending">
            <Loader2 :size="14" class="spin" />
          </span>
        </button>
      </div>
      <div v-else-if="searched" class="sticker-state">没有找到相关表情，换个关键词试试</div>
      <div v-else class="sticker-state">
        <Sparkles :size="13" :stroke-width="2" />
        输入关键词或点上面的热词，点图片即可发送
      </div>
    </div>
  </div>
</template>

<style scoped>
.sticker-picker { display: flex; flex-direction: column; gap: 8px; width: min(430px, 72vw); }
.sticker-search {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 6px 0 9px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  border: 1px solid transparent;
}
.sticker-search:focus-within { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-ring); }
.sticker-search-icon { color: var(--ink-4); flex-shrink: 0; }
.sticker-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  background: transparent;
  border: 0;
  font-size: 12.5px;
  color: var(--ink);
}
.sticker-search-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 46px;
  height: 24px;
  padding: 0 9px;
  border-radius: var(--r-xs);
  background: var(--accent);
  color: #fff;
  font-size: 11.5px;
  font-weight: 600;
}
.sticker-search-btn:disabled { opacity: 0.55; }
.sticker-hot { display: flex; flex-wrap: wrap; gap: 5px; }
.sticker-hot-chip {
  height: 22px;
  padding: 0 9px;
  border-radius: var(--r-full);
  background: var(--surface-3);
  border: 1px solid var(--line);
  font-size: 11px;
  color: var(--ink-3);
}
.sticker-hot-chip:hover { color: var(--ink); background: var(--surface-hover); }
.sticker-body { max-height: 232px; overflow-y: auto; overscroll-behavior: contain; }
.sticker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 6px; }
.sticker-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  overflow: hidden;
}
.sticker-item img { width: 100%; height: 100%; object-fit: contain; display: block; }
.sticker-item:hover { outline: 2px solid var(--accent); outline-offset: -2px; }
.sticker-item.sending { opacity: 0.7; }
.sticker-sending {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  background: rgba(8, 14, 18, 0.45);
}
.sticker-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 84px;
  padding: 10px;
  font-size: 11.5px;
  color: var(--ink-4);
  text-align: center;
}
.sticker-state.error { color: var(--danger); }
.spin { animation: sticker-spin 900ms linear infinite; }
@keyframes sticker-spin { to { transform: rotate(360deg); } }
</style>
