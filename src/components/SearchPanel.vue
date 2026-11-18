<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Search, X, Loader2, Users, MessageSquare, FileText,
  Image as ImageIcon, Film, Mic, Download, CornerDownLeft,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import SearchHighlight from './SearchHighlight.vue'
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
let requestVersion = 0
const composing = ref(false)
const category = ref('all')
const categories = [
  { key: 'all', label: '全部' }, { key: 'contacts', label: '联系人' },
  { key: 'groups', label: '群聊' }, { key: 'messages', label: '聊天记录' },
  { key: 'files', label: '文件' },
] as const
const atLimit = computed(() => result.value && Object.values(result.value).some(rows => rows.length >= 15))

const trimmed = computed(() => keyword.value.trim())

const totalHits = computed(() => {
  const data = result.value
  if (!data) return 0
  return category.value === 'all'
    ? data.contacts.length + data.groups.length + data.messages.length + data.files.length
    : data[category.value as keyof SearchResults].length
})

const hasHits = computed(() => totalHits.value > 0)

function iconOf(type: string) {
  if (type === 'IMAGE') return ImageIcon
  if (type === 'VIDEO') return Film
  if (type === 'AUDIO') return Mic
  return FileText
}

async function run() {
  if (debounce !== null) window.clearTimeout(debounce)
  const version = ++requestVersion
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
    if (version === requestVersion) result.value = data
  } catch (e) {
    if (version === requestVersion) {
      error.value = e instanceof Error ? e.message : '搜索失败'
      result.value = null
    }
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

function schedule() {
  ++requestVersion
  if (debounce !== null) window.clearTimeout(debounce)
  result.value = null
  error.value = ''
  loading.value = !!trimmed.value
  if (!trimmed.value || composing.value) return
  debounce = window.setTimeout(() => {
    debounce = null
    void run()
  }, 240)
}
watch(keyword, schedule, { flush: 'sync' })

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
  ++requestVersion
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
          maxlength="64"
          placeholder="搜索联系人、群聊、聊天记录、文件"
          aria-label="搜索"
          @keydown.esc.prevent="emit('close')"
          @keydown.enter.prevent="!composing && run()"
          @compositionstart="composing = true"
          @compositionend="composing = false; schedule()"
        />
        <Loader2 v-if="loading" :size="14" class="spin search-spin" />
      </label>
      <p class="search-hint">
        只搜索我的联系人和我参与的会话
        <span v-if="trimmed && !loading" class="num">· {{ totalHits }} 条结果</span>
      </p>
      <div class="search-categories" role="group" aria-label="搜索结果分类">
        <button v-for="item in categories" :key="item.key" :class="{ on: category === item.key }" :aria-pressed="category === item.key" @click="category = item.key">{{ item.label }}</button>
      </div>
      <p v-if="atLimit" class="search-hint">每类最多展示 15 条，请细化关键词；聊天内可继续翻页查找</p>
    </div>

    <div class="detail-scroll search-body">
      <p v-if="error" class="search-error" role="alert">{{ error }} <button @click="run">重试</button></p>

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
        <section v-if="result?.contacts.length && (category === 'all' || category === 'contacts')" class="hit-group">
          <p class="hit-label"><Users :size="11" :stroke-width="2.4" /> 联系人</p>
          <div
            v-for="hit in result.contacts"
            :key="hit.userId"
            class="hit-row"
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
            <button class="hit-main as-button" @click="emit('open-user-chat', hit.userId)">
              <SearchHighlight class="hit-name" :text="hit.name" :keyword="keyword" />
              <span v-if="hit.remark" class="hit-sub">昵称 {{ hit.nickname }}</span>
            </button>
            <CornerDownLeft :size="13" class="hit-go" />
          </div>
        </section>

        <section v-if="result?.groups.length && (category === 'all' || category === 'groups')" class="hit-group">
          <p class="hit-label"><Users :size="11" :stroke-width="2.4" /> 群聊</p>
          <button
            v-for="hit in result.groups"
            :key="hit.conversationId"
            class="hit-row"
            @click="openConversation(hit.conversationId)"
          >
            <span class="hit-icon"><Users :size="15" :stroke-width="1.9" /></span>
            <span class="hit-main">
              <SearchHighlight class="hit-name" :text="hit.title" :keyword="keyword" />
              <span class="hit-sub">{{ hit.memberCount }} 位成员</span>
            </span>
            <CornerDownLeft :size="13" class="hit-go" />
          </button>
        </section>

        <section v-if="result?.messages.length && (category === 'all' || category === 'messages')" class="hit-group">
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
                {{ hit.senderName }}：<SearchHighlight :text="hit.text" :keyword="keyword" />
              </span>
              <span class="hit-time num">{{ listTime(hit.createdAt) }}</span>
            </span>
            <CornerDownLeft :size="13" class="hit-go" />
          </button>
        </section>

        <section v-if="result?.files.length && (category === 'all' || category === 'files')" class="hit-group">
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
              <SearchHighlight class="hit-name" :text="hit.name" :keyword="keyword" />
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
.search-categories { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 12px; }
.search-categories button { padding: 5px 7px; border-radius: 4px; background: none; color: var(--ink-3); font-size: 11px; }
.search-categories button.on { color: var(--accent-ink); background: var(--accent-soft); }
.search-error button { color: var(--accent); background: none; text-decoration: underline; }
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
