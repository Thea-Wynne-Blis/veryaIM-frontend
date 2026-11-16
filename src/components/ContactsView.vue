<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Users, Search, MessageSquarePlus, Loader2, UserPlus, Hash } from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { api } from '../api/client'
import { useChatStore } from '../stores/chat'
import { initialsOf, toneOf } from '../utils/present'

type Friend = {
  userId: number
  nickname: string
  username?: string
  remark?: string | null
  avatar?: string | null
}
type GroupItem = { groupId: string; name: string }
type Contacts = { friends: Friend[]; groups: GroupItem[]; pendingRequests: number }

const chat = useChatStore()
const data = ref<Contacts>({ friends: [], groups: [], pendingRequests: 0 })
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const selected = ref<Friend | null>(null)
const opening = ref<number | null>(null)

const friends = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return data.value.friends
  return data.value.friends.filter((f) =>
    [f.nickname, f.username, f.remark].filter(Boolean).some((v) =>
      String(v).toLowerCase().includes(kw),
    ),
  )
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await api.get<Contacts>('/contacts')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载通讯录失败'
  } finally {
    loading.value = false
  }
}

async function openChat(friend: Friend) {
  opening.value = friend.userId
  try {
    const conversationId = await chat.createPrivate(friend.userId)
    await chat.loadCards()
    await chat.open(conversationId)
    window.dispatchEvent(new CustomEvent('veryal:open-chat', { detail: conversationId }))
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发起会话失败'
  } finally {
    opening.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="view">
    <aside class="view-list">
      <header class="view-head">
        <h1 class="view-title">通讯录</h1>
        <span v-if="data.pendingRequests" class="badge num">
          {{ data.pendingRequests }} 待处理
        </span>
      </header>

      <label class="search" style="margin: 0 14px 10px">
        <Search class="search-icon" :size="15" :stroke-width="2" />
        <input v-model="keyword" type="search" placeholder="搜索好友" />
        <Loader2 v-if="loading" :size="13" class="spin" style="color: var(--ink-3)" />
      </label>

      <div class="view-scroll">
        <p v-if="error" class="view-error">{{ error }}</p>

        <p class="list-group-label">好友 · {{ friends.length }}</p>
        <button
          v-for="f in friends"
          :key="f.userId"
          class="row"
          :class="{ on: selected?.userId === f.userId }"
          @click="selected = f"
        >
          <AppAvatar :initials="initialsOf(f.remark || f.nickname)" :tone="toneOf(f.userId)" size="md" />
          <span class="row-main">
            <span class="row-name">{{ f.remark || f.nickname }}</span>
            <span class="row-sub">@{{ f.username || f.userId }}</span>
          </span>
          <button
            class="row-action"
            :disabled="opening !== null"
            title="发消息"
            @click.stop="openChat(f)"
          >
            <Loader2 v-if="opening === f.userId" :size="14" class="spin" />
            <MessageSquarePlus v-else :size="14" :stroke-width="1.9" />
          </button>
        </button>

        <p v-if="!friends.length && !loading" class="view-empty-sm">
          还没有好友，用「+」搜索用户发起会话后可添加
        </p>

        <p class="list-group-label">群聊 · {{ data.groups.length }}</p>
        <div v-for="g in data.groups" :key="g.groupId" class="row static">
          <AppAvatar :initials="initialsOf(g.name)" :tone="toneOf(g.groupId)" size="md" rounded />
          <span class="row-main">
            <span class="row-name">{{ g.name }}</span>
            <span class="row-sub">群 ID {{ g.groupId }}</span>
          </span>
        </div>
        <p v-if="!data.groups.length && !loading" class="view-empty-sm">还没有加入任何群</p>
      </div>
    </aside>

    <section class="view-main">
      <div v-if="selected" class="profile-card">
        <AppAvatar :initials="initialsOf(selected.remark || selected.nickname)" :tone="toneOf(selected.userId)" size="xl" />
        <h2 class="profile-name">{{ selected.remark || selected.nickname }}</h2>
        <p class="profile-sub">@{{ selected.username }} · ID {{ selected.userId }}</p>
        <button class="primary" :disabled="opening !== null" @click="openChat(selected)">
          <MessageSquarePlus :size="14" :stroke-width="2" />
          发消息
        </button>
        <button class="ghost">
          <UserPlus :size="14" :stroke-width="2" />
          加好友 / 备注
        </button>
      </div>

      <div v-else class="empty">
        <div class="empty-mark"><Users :size="22" :stroke-width="1.6" /></div>
        <h3 class="empty-title">通讯录</h3>
        <p class="empty-text">左侧选择一位好友查看资料，或点击行尾的图标直接发起会话。</p>
        <p class="empty-text" style="margin-top: 6px">
          <Hash :size="11" :stroke-width="2" style="display: inline; vertical-align: -1px" />
          群聊也可以从会话列表进入
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.view { display: grid; grid-template-columns: 320px minmax(0, 1fr); min-width: 0; background: var(--surface); }
.view-list { display: flex; flex-direction: column; min-width: 0; border-right: 1px solid var(--line); }
.view-head { display: flex; align-items: center; justify-content: space-between; padding: 17px 16px 12px; }
.view-title { font-size: 19px; font-weight: 680; letter-spacing: -0.5px; }
.badge { font-size: 10.5px; font-weight: 680; padding: 2px 7px; border-radius: var(--r-full); background: var(--danger-soft); color: var(--danger); }
.view-scroll { flex: 1; overflow-y: auto; padding: 0 10px 18px; }
.view-error { margin: 6px 8px; padding: 7px 10px; border-radius: var(--r-sm); background: var(--danger-soft); color: var(--danger); font-size: 11.5px; }
.row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px; border-radius: var(--r-md); text-align: left; transition: background var(--dur-1) var(--ease-out); }
.row:hover { background: var(--surface-hover); }
.row.on { background: var(--accent-soft); }
.row.static { cursor: default; }
.row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.row-name { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-sub { font-size: 11px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-action { width: 28px; height: 28px; border-radius: var(--r-sm); display: grid; place-items: center; color: var(--ink-3); transition: all var(--dur-1); }
.row-action:hover { background: var(--accent-soft); color: var(--accent); }
.view-empty-sm { padding: 10px 9px; font-size: 11.5px; color: var(--ink-4); }
.view-main { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; background: var(--canvas); }
.profile-card { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 26px 30px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow-sm); min-width: 300px; }
.profile-name { font-size: 17px; font-weight: 680; letter-spacing: -0.3px; }
.profile-sub { font-size: 11.5px; color: var(--ink-3); }
.primary, .ghost { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 34px; padding: 0 16px; border-radius: var(--r-sm); font-size: 12.5px; font-weight: 620; margin-top: 4px; width: 100%; }
.primary { background: var(--accent-grad); color: #fff; box-shadow: 0 3px 12px -5px var(--accent); }
.ghost { border: 1px solid var(--line); color: var(--ink-2); background: var(--surface-2); }
.spin { animation: tick-spin 900ms linear infinite; }
</style>
