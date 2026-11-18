<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Search, X, Loader2, Users, MessageSquare, FileText,
  Image as ImageIcon, Film, Mic, Download, CornerDownLeft,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { api, downloadFile, type Id, type SearchResults } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { humanBytes, initialsOf, listTime, toneOfPerson } from '../utils/present'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open-conversation', conversationId: string, messageId?: string): void
  (e: 'open-user-chat', userId: Id): void
  (e: 'profile', userId: string, anchor?: HTMLElement): void
}>()

const auth = useAuthStore()
const keyword = ref('')
const loading = ref(false)
const error = ref('')
const result = ref<SearchResults | null>(null)
const input = ref<HTMLInputElement | null>(null)
const downloading = ref<Id | null>(null)
let debounce: number | null = null

const trimmed = computed(() => keyword.value.trim())

const totalHits = computed(() => {
  const data = result.value
  if (!data) return 0
  return data.contacts.length + data.groups.length + data.messages.length + data.files.length
})

const hasHits = computed(() => totalHits.value > 0)

function iconOf(type: string) {
  if (type === 'IMAGE') return ImageIcon
  if (type === 'VIDEO') return Film
  if (type === 'AUDIO') return Mic
  return FileText
}

async function run() {
  const query = trimmed.value
  if (!query) {
    result.value = null
    error.value = ''
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    // 搜索是「一边输入一边出结果」，所以只保留最后一次请求的结果。
    const data = await api.get<SearchResults>(`/search?keyword=${encodeURIComponent(query)}`)
    if (query === trimmed.value) result.value = data
  } catch (e) {
    if (query === trimmed.value) {
      error.value = e instanceof Error ? e.message : '搜索失败'
      result.value = null
    }
  } finally {
    if (query === trimmed.value) loading.value = false
  }
}

watch(keyword, () => {
  if (debounce !== null) window.clearTimeout(debounce)
  debounce = window.setTimeout(() => {
    debounce = null
    void run()
  }, 240)
})

function openConversation(conversationId: string, messageId?: string) {
  emit('open-conversation', conversationId, messageId)
}

function openUser(userId: Id, event: MouseEvent) {
  emit('profile', String(userId), event.currentTarget as HTMLElement)
}

async function download(fileId: Id, name: string) {
  downloading.value = fileId
  try {
    await downloadFile(fileId, name)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '下载失败'
  } finally {
    downloading.value = null
  }
}

onMounted(() => input.value?.focus())

onBeforeUnmount(() => {
  if (debounce !== null) window.clearTimeout(debounce)
})
</script>

<template>
  <aside class="detail-pane search-pane" aria-label="搜索">
    <header class="detail-head">
      <h2 class="detail-title">搜索</h2>
      <button class="icon-btn sm" aria-label="关闭搜索" @click="emit('close')">
        <X :size="15" :stroke-width="2" />
      </button>
    </header>

    <div class="search-top">
      <label class="search">
        <Search class="search-icon" :size="15" :stroke-width="2" />
        <input
          ref="input"
          v-model="keyword"
          type="search"
          placeholder="搜索联系人、群聊、聊天记录、文件"
          aria-label="搜索"
          @keydown.esc.prevent="emit('close')"
        />
        <Loader2 v-if="loading" :size="14" class="spin search-spin" />
      </label>
      <p class="search-hint">
        只搜索我的联系人和我参与的会话
        <span v-if="trimmed && !loading" class="num">· {{ totalHits }} 条结果</span>
      </p>
    </div>

    <div class="detail-scroll search-body">
      <p v-if="error" class="search-error">{{ error }}</p>

      <div v-else-if="!trimmed" class="search-idle">
        <MessageSquare :size="22" :stroke-width="1.6" />
        <p>输入关键词开始搜索</p>
        <p class="search-idle-sub">可以搜昵称、群名、聊天内容或文件名</p>
      </div>

      <p v-else-if="loading && !result" class="search-idle-sub center">
        <Loader2 :size="14" class="spin" /> 搜索中…
      </p>

      <p v-else-if="!hasHits" class="search-idle-sub center">没有找到相关内容</p>

      <template v-else>
        <section v-if="result?.contacts.length" class="hit-group">
          <p class="hit-label"><Users :size="11" :stroke-width="2.4" /> 联系人</p>
          <button
            v-for="hit in result.contacts"
            :key="hit.userId"
            class="hit-row"
            @click="emit('open-user-chat', hit.userId)"
          >
            <button
              class="hit-avatar"
              type="button"
              :aria-label="`查看 ${hit.name} 的资料`"
              @click.stop="openUser(hit.userId, $event)"
            >
              <AppAvatar
                :initials="initialsOf(hit.name)"
                :tone="toneOfPerson(hit.userId, auth.user?.userId)"
                size="sm"
                :presence="hit.online ? 'online' : 'offline'"
              />
            </button>
            <span class="hit-main">
              <span class="hit-name">{{ hit.name }}</span>
              <span v-if="hit.remark" class="hit-sub">昵称 {{ hit.nickname }}</span>
            </span>
            <CornerDownLeft :size="13" class="hit-go" />
          </button>
        </section>

        <section v-if="result?.groups.length" class="hit-group">
          <p class="hit-label"><Users :size="11" :stroke-width="2.4" /> 群聊</p>
          <button
            v-for="hit in result.groups"
            :key="hit.conversationId"
            class="hit-row"
            @click="openConversation(hit.conversationId)"
          >
            <span class="hit-icon"><Users :size="15" :stroke-width="1.9" /></span>
            <span class="hit-main">
              <span class="hit-name">{{ hit.title }}</span>
              <span class="hit-sub">{{ hit.memberCount }} 位成员</span>
            </span>
            <CornerDownLeft :size="13" class="hit-go" />
          </button>
        </section>

        <section v-if="result?.messages.length" class="hit-group">
          <p class="hit-label"><MessageSquare :size="11" :stroke-width="2.4" /> 聊天记录</p>
          <button
            v-for="hit in result.messages"
            :key="hit.messageId"
            class="hit-row"
            @click="openConversation(hit.conversationId, String(hit.messageId))"
          >
            <span class="hit-icon"><MessageSquare :size="15" :stroke-width="1.9" /></span>
            <span class="hit-main">
              <span class="hit-name">{{ hit.conversationTitle }}</span>
              <span class="hit-sub">
                {{ hit.senderName }}：{{ hit.text }}
              </span>
              <span class="hit-time num">{{ listTime(hit.createdAt) }}</span>
            </span>
            <CornerDownLeft :size="13" class="hit-go" />
          </button>
        </section>

        <section v-if="result?.files.length" class="hit-group">
          <p class="hit-label"><FileText :size="11" :stroke-width="2.4" /> 文件</p>
          <div
            v-for="hit in result.files"
            :key="hit.messageId"
            class="hit-row"
          >
            <span class="hit-icon">
              <component :is="iconOf(hit.type)" :size="15" :stroke-width="1.9" />
            </span>
            <button class="hit-main as-button" @click="openConversation(hit.conversationId, String(hit.messageId))">
              <span class="hit-name">{{ hit.name }}</span>
              <span class="hit-sub">
                {{ humanBytes(hit.sizeBytes) }} · {{ hit.senderName }} ·
                {{ hit.conversationTitle }}
              </span>
            </button>
            <button
              class="hit-download"
              type="button"
              :aria-label="`下载 ${hit.name}`"
              :disabled="downloading === hit.fileId"
              @click="download(hit.fileId, hit.name)"
            >
              <Loader2 v-if="downloading === hit.fileId" :size="14" class="spin" />
              <Download v-else :size="14" :stroke-width="1.9" />
            </button>
          </div>
        </section>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.search-top {
  padding: 12px;
  border-bottom: 1px solid var(--line);
}

.search-hint {
  margin-top: 7px;
  font-size: 10.5px;
  color: var(--ink-3);
}

.search-spin {
  flex-shrink: 0;
  color: var(--ink-3);
}

.search-body {
  padding: 10px 12px 18px;
}

.search-idle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 42px 10px;
  color: var(--ink-3);
  font-size: 12px;
  text-align: center;
}

.search-idle-sub {
  font-size: 11px;
  color: var(--ink-3);
}

.search-idle-sub.center {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 32px 8px;
}

.search-error {
  padding: 10px;
  font-size: 11.5px;
  color: var(--danger);
}

.hit-group {
  margin-bottom: 12px;
}

.hit-label {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 4px 2px 6px;
  font-size: 10.5px;
  font-weight: 620;
  letter-spacing: 0.04em;
  color: var(--ink-3);
}

.hit-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: none;
  text-align: left;
  transition: background var(--dur-1) var(--ease-out), border-color var(--dur-1) var(--ease-out);
}

.hit-row:hover {
  background: var(--surface-hover);
  border-color: var(--line);
}

.hit-avatar,
.hit-download {
  display: flex;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

.hit-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: var(--r-sm);
  background: var(--surface-2);
  color: var(--ink-2);
}

.hit-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.hit-main.as-button {
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}

.hit-name {
  font-size: 12.5px;
  font-weight: 560;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hit-sub {
  font-size: 10.5px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hit-time {
  font-size: 9.5px;
  color: var(--ink-4, var(--ink-3));
}

.hit-go {
  flex-shrink: 0;
  color: var(--ink-3);
  opacity: 0;
  transition: opacity var(--dur-1) var(--ease-out);
}

.hit-row:hover .hit-go {
  opacity: 1;
}

.hit-download {
  color: var(--ink-3);
}

.hit-download:hover {
  color: var(--accent);
}

.spin {
  animation: tick-spin 900ms linear infinite;
}
</style>
