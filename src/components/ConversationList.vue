<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search, Plus, Pin, BellOff } from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import type { Conversation } from '../data/workspace'

const props = defineProps<{
  conversations: Conversation[]
  activeId: string | null
}>()

const emit = defineEmits<{ (e: 'select', id: string): void }>()

type Filter = 'all' | 'unread'
const filter = ref<Filter>('all')
const keyword = ref('')

const totalUnread = computed(() =>
  props.conversations.reduce((sum, item) => sum + item.unread, 0),
)

const visible = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return props.conversations.filter((item) => {
    if (filter.value === 'unread' && item.unread === 0) return false
    if (!kw) return true
    return (
      item.name.toLowerCase().includes(kw) ||
      item.preview.toLowerCase().includes(kw)
    )
  })
})

const pinned = computed(() => visible.value.filter((item) => item.pinned))
const rest = computed(() => visible.value.filter((item) => !item.pinned))
</script>

<template>
  <section class="list-pane" aria-label="会话列表">
    <header class="list-head">
      <div class="list-title-row">
        <h1 class="list-title">
          消息
          <span
            v-if="totalUnread"
            class="unread"
            style="margin-left: 6px; vertical-align: 3px"
          >
            {{ totalUnread }}
          </span>
        </h1>
        <button class="icon-btn" aria-label="新建会话">
          <Plus :size="18" :stroke-width="2" />
        </button>
      </div>

      <label class="search">
        <Search class="search-icon" :size="15" :stroke-width="2" />
        <input
          v-model="keyword"
          type="search"
          placeholder="搜索会话、联系人"
          aria-label="搜索会话"
        />
        <kbd>⌘K</kbd>
      </label>

      <div class="chips" role="tablist" aria-label="会话筛选">
        <button
          class="chip"
          :class="{ active: filter === 'all' }"
          role="tab"
          :aria-selected="filter === 'all'"
          @click="filter = 'all'"
        >
          全部
        </button>
        <button
          class="chip"
          :class="{ active: filter === 'unread' }"
          role="tab"
          :aria-selected="filter === 'unread'"
          @click="filter = 'unread'"
        >
          未读
          <template v-if="totalUnread"> · {{ totalUnread }}</template>
        </button>
      </div>
    </header>

    <div class="list-scroll">
      <template v-if="pinned.length">
        <p class="list-group-label">置顶</p>
        <button
          v-for="(item, index) in pinned"
          :key="item.id"
          class="conv"
          :class="{ active: item.id === activeId }"
          :style="{ animationDelay: `${index * 26}ms` }"
          @click="emit('select', item.id)"
        >
          <AppAvatar
            :initials="item.initials"
            :tone="item.tone"
            :presence="item.presence"
            :rounded="item.kind === 'group'"
          />
          <span class="conv-main">
            <span class="conv-top">
              <span class="conv-name">{{ item.name }}</span>
              <Pin :size="11" :stroke-width="2.2" style="color: var(--ink-4)" />
              <BellOff
                v-if="item.muted"
                :size="11"
                :stroke-width="2.2"
                style="color: var(--ink-4)"
              />
            </span>
            <span class="conv-preview">{{ item.preview }}</span>
          </span>
          <span class="conv-meta">
            <span class="conv-time tabular">{{ item.time }}</span>
            <span
              v-if="item.unread"
              class="unread"
              :class="{ muted: item.muted }"
            >
              {{ item.unread > 99 ? '99+' : item.unread }}
            </span>
          </span>
        </button>
      </template>

      <p v-if="rest.length" class="list-group-label">
        {{ pinned.length ? '其他会话' : '全部会话' }}
      </p>
      <button
        v-for="(item, index) in rest"
        :key="item.id"
        class="conv"
        :class="{ active: item.id === activeId }"
        :style="{ animationDelay: `${index * 26}ms` }"
        @click="emit('select', item.id)"
      >
        <AppAvatar
          :initials="item.initials"
          :tone="item.tone"
          :presence="item.presence"
          :rounded="item.kind === 'group'"
        />
        <span class="conv-main">
          <span class="conv-top">
            <span class="conv-name">{{ item.name }}</span>
            <BellOff
              v-if="item.muted"
              :size="11"
              :stroke-width="2.2"
              style="color: var(--ink-4)"
            />
          </span>
          <span class="conv-preview">{{ item.preview }}</span>
        </span>
        <span class="conv-meta">
          <span class="conv-time tabular">{{ item.time }}</span>
          <span v-if="item.unread" class="unread" :class="{ muted: item.muted }">
            {{ item.unread > 99 ? '99+' : item.unread }}
          </span>
        </span>
      </button>

      <p v-if="!visible.length" class="empty-text">
        没有匹配的会话，换个关键词试试。
      </p>
    </div>
  </section>
</template>

<style scoped>
.empty-text {
  padding: 40px 12px;
  text-align: center;
  font-size: 12.5px;
  color: var(--ink-3);
}
</style>
