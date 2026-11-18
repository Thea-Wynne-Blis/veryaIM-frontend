<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { messageOf } from '../utils/error'
import { X, Search, Loader2, MessageSquarePlus } from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { api, sameId, type Id } from '../api/client'
import { useChatStore } from '../stores/chat'
import { initialsOf, toneOf } from '../utils/present'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', conversationId: string): void
}>()

type UserHit = { userId: Id; nickname: string; username: string }

const chat = useChatStore()
const keyword = ref('')
const hits = ref<UserHit[]>([])
const loading = ref(false)
const error = ref('')
const creating = ref<Id | null>(null)

const canSearch = computed(() => keyword.value.trim().length >= 1)

let seq = 0

async function search() {
  const kw = keyword.value.trim()
  if (!kw) {
    hits.value = []
    loading.value = false
    return
  }
  const current = ++seq
  loading.value = true
  error.value = ''
  try {
    const result = await api.get<unknown>(
      `/users/search?keyword=${encodeURIComponent(kw)}&limit=20`,
    )
    if (current !== seq) return // 关键词已变，丢弃过期结果
    const list = Array.isArray(result) ? result : []
    hits.value = (list as Record<string, unknown>[])
      .map((item) => ({
        userId: String(item.userId ?? ''),
        nickname: String(item.nickname ?? item.username ?? '用户'),
        username: String(item.username ?? ''),
      }))
      .filter((item) => item.userId && item.userId !== '0')
  } catch (e) {
    if (current !== seq) return
    error.value = messageOf(e, '搜索失败')
    hits.value = []
  } finally {
    if (current === seq) loading.value = false
  }
}

let timer: number | null = null
watch(keyword, () => {
  if (timer) window.clearTimeout(timer)
  if (!canSearch.value) {
    seq++
    hits.value = []
    loading.value = false
    return
  }
  timer = window.setTimeout(search, 320)
})

watch(
  () => props.open,
  (open) => {
    if (!open) {
      if (timer) window.clearTimeout(timer)
      seq++
      keyword.value = ''
      hits.value = []
      error.value = ''
      loading.value = false
    }
  },
)

async function pick(hit: UserHit) {
  creating.value = hit.userId
  error.value = ''
  try {
    const conversationId = await chat.createPrivate(hit.userId)
    emit('created', conversationId)
  } catch (e) {
    error.value = messageOf(e, '创建会话失败')
  } finally {
    creating.value = null
  }
}
</script>

<template>
  <Transition name="dlg">
    <div v-if="open" class="dlg-mask" @click.self="emit('close')">
      <div class="dlg" role="dialog" aria-label="发起新会话">
        <header class="dlg-head">
          <div>
            <p class="eyebrow">新建会话</p>
            <h2 class="dlg-title">找人开始聊天</h2>
          </div>
          <button class="icon-btn sm" aria-label="关闭" @click="emit('close')">
            <X :size="15" :stroke-width="2" />
          </button>
        </header>

        <label class="search" style="margin: 0 14px">
          <Search class="search-icon" :size="15" :stroke-width="2" />
          <input
            v-model="keyword"
            type="search"
            placeholder="输入用户名或昵称"
            autofocus
          />
          <Loader2 v-if="loading" :size="13" class="spin" style="color: var(--ink-3)" />
        </label>

        <div class="dlg-body">
          <p v-if="error" class="dlg-error">{{ error }}</p>

          <button
            v-for="hit in hits"
            :key="hit.userId"
            class="hit"
            :disabled="creating !== null"
            @click="pick(hit)"
          >
            <AppAvatar
              :initials="initialsOf(hit.nickname)"
              :tone="toneOf(hit.userId)"
              size="md"
            />
            <span class="hit-main">
              <span class="hit-name">{{ hit.nickname }}</span>
              <span class="hit-sub">@{{ hit.username }}</span>
            </span>
            <Loader2
              v-if="sameId(creating, hit.userId)"
              :size="15"
              class="spin"
              style="color: var(--accent)"
            />
            <MessageSquarePlus
              v-else
              :size="15"
              :stroke-width="1.9"
              style="color: var(--ink-3)"
            />
          </button>

          <div v-if="!hits.length && !loading" class="dlg-empty">
            <Search :size="20" :stroke-width="1.6" style="color: var(--ink-4)" />
            <p>{{ canSearch ? '没有找到匹配的用户' : '输入关键词搜索用户' }}</p>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.dlg-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, var(--ink) 26%, transparent);
  backdrop-filter: blur(6px);
  animation: fade-in 160ms var(--ease-out);
}

.dlg {
  width: 100%;
  max-width: 420px;
  max-height: min(560px, 80vh);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 0 6px;
  border-radius: var(--r-lg);
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--frame-ring), var(--shadow-lg);
  animation: pop-in 220ms var(--ease-spring);
}

.dlg-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 0 14px;
}

.dlg-title {
  font-size: 16px;
  font-weight: 660;
  letter-spacing: -0.3px;
  margin-top: 2px;
}

.dlg-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px 10px;
}

.hit {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 8px;
  border-radius: var(--r-md);
  text-align: left;
  transition: background var(--dur-1) var(--ease-out),
    transform var(--dur-1) var(--ease-out);
}

.hit:hover {
  background: var(--surface-hover);
}

.hit:active {
  transform: scale(0.99);
}

.hit:disabled {
  opacity: 0.6;
  cursor: default;
}

.hit-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.hit-name {
  font-size: 13.5px;
  font-weight: 600;
}

.hit-sub {
  font-size: 11px;
  color: var(--ink-3);
}

.dlg-error {
  margin: 4px 8px 8px;
  padding: 7px 10px;
  border-radius: var(--r-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 11.5px;
}

.dlg-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 34px 16px;
  font-size: 12px;
  color: var(--ink-3);
}

.spin {
  animation: tick-spin 900ms linear infinite;
}

.dlg-enter-active,
.dlg-leave-active {
  transition: opacity 160ms var(--ease-out);
}
.dlg-enter-from,
.dlg-leave-to {
  opacity: 0;
}
</style>
