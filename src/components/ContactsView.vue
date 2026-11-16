<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Users, Search, MessageSquarePlus, Loader2, UserPlus,
  Check, X, Pencil, Inbox, Hash, Send,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { api } from '../api/client'
import { useChatStore } from '../stores/chat'
import { initialsOf, relativeTime, toneOf } from '../utils/present'

type Friend = { userId: number; nickname: string; username?: string; remark?: string | null }
type GroupItem = { groupId: string; name: string }
type Contacts = { friends: Friend[]; groups: GroupItem[]; pendingRequests: number }
type Request = {
  requestId: number
  fromUserId: number
  toUserId: number
  fromNickname: string
  toNickname: string
  message?: string
  status: string
  createdAt: string
}

const chat = useChatStore()
const data = ref<Contacts>({ friends: [], groups: [], pendingRequests: 0 })
const requests = ref<Request[]>([])
const loading = ref(false)
const error = ref('')
const notice = ref('')
const keyword = ref('')
const selected = ref<Friend | null>(null)
const opening = ref<number | null>(null)
const tab = ref<'friends' | 'groups' | 'requests'>('friends')
const editingRemark = ref<number | null>(null)
const remarkDraft = ref('')

/* 添加好友弹窗 */
const addOpen = ref(false)
const addKeyword = ref('')
const addHits = ref<{ userId: number; nickname: string; username: string }[]>([])
const addMessage = ref('')
const addBusy = ref<number | null>(null)

const tabIndex = computed(() => {
  if (tab.value === "friends") return 0
  if (tab.value === "groups") return 1
  return 2
})

function spot(event: PointerEvent) {
  const el = event.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  el.style.setProperty("--spot-x", `${event.clientX - rect.left}px`)
  el.style.setProperty("--spot-y", `${event.clientY - rect.top}px`)
}

const pendingRequests = computed(() =>
  requests.value.filter((r) => r.status === 'PENDING'),
)

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
    const [c, r] = await Promise.all([
      api.get<Contacts>('/contacts'),
      api.get<Request[]>('/friends/requests').catch(() => [] as Request[]),
    ])
    data.value = c
    requests.value = Array.isArray(r) ? r : []
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载通讯录失败'
  } finally {
    loading.value = false
  }
}

async function openChat(friend: Friend) {
  opening.value = friend.userId
  error.value = ''
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

function startEditRemark(friend: Friend) {
  editingRemark.value = friend.userId
  remarkDraft.value = friend.remark ?? ''
}

async function saveRemark(friend: Friend) {
  const remark = remarkDraft.value.trim()
  editingRemark.value = null
  try {
    await api.put(`/friends/${friend.userId}`, { remark })
    friend.remark = remark || null
    notice.value = '备注已保存'
    setTimeout(() => (notice.value = ''), 2000)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '备注保存失败'
  }
}

async function decide(request: Request, action: 'accept' | 'reject') {
  error.value = ''
  try {
    await api.post(`/friends/requests/${request.requestId}/${action}`)
    notice.value = action === 'accept' ? '已添加为好友' : '已拒绝'
    setTimeout(() => (notice.value = ''), 2000)
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

let addTimer: number | null = null
function onAddKeyword() {
  if (addTimer) window.clearTimeout(addTimer)
  addTimer = window.setTimeout(searchUsers, 320)
}

async function searchUsers() {
  const kw = addKeyword.value.trim()
  if (!kw) {
    addHits.value = []
    return
  }
  try {
    const result = await api.get<unknown>(
      `/users/search?keyword=${encodeURIComponent(kw)}&limit=20`,
    )
    const list = Array.isArray(result) ? result : (result as { items?: unknown[] })?.items ?? []
    addHits.value = (list as Record<string, unknown>[]).map((i) => ({
      userId: Number(i.userId ?? i.id ?? 0),
      nickname: String(i.nickname ?? i.username ?? '用户'),
      username: String(i.username ?? ''),
    }))
  } catch {
    addHits.value = []
  }
}

async function sendRequest(hit: { userId: number; nickname: string }) {
  addBusy.value = hit.userId
  error.value = ''
  try {
    await api.post('/friends/requests', {
      toUserId: hit.userId,
      message: addMessage.value.trim() || undefined,
    })
    notice.value = `已向 ${hit.nickname} 发送好友申请`
    setTimeout(() => (notice.value = ''), 2500)
    addOpen.value = false
    addKeyword.value = ''
    addHits.value = []
    addMessage.value = ''
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发送申请失败'
  } finally {
    addBusy.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="view">
    <aside class="view-list">
      <header class="view-head">
        <h1 class="view-title">通讯录</h1>
        <button class="icon-btn sm" title="添加好友" @click="addOpen = true">
          <UserPlus :size="15" :stroke-width="2" />
        </button>
      </header>

      <div class="seg seg-tabs" :style="{ '--idx': tabIndex }" role="tablist">
        <span class="seg-thumb" aria-hidden="true" />
        <button :class="{ on: tab === 'friends' }" role="tab" :aria-selected="tab === 'friends'" @click="tab = 'friends'">
          好友<span class="seg-count num">{{ data.friends.length }}</span>
        </button>
        <button :class="{ on: tab === 'groups' }" role="tab" :aria-selected="tab === 'groups'" @click="tab = 'groups'">
          群聊<span class="seg-count num">{{ data.groups.length }}</span>
        </button>
        <button :class="{ on: tab === 'requests' }" role="tab" :aria-selected="tab === 'requests'" @click="tab = 'requests'">
          申请
          <span v-if="pendingRequests.length" class="dot-badge num">{{ pendingRequests.length }}</span>
        </button>
      </div>

      <label v-if="tab === 'friends'" class="search" style="margin: 0 12px 8px">
        <Search class="search-icon" :size="15" :stroke-width="2" />
        <input v-model="keyword" type="search" placeholder="搜索好友" />
        <Loader2 v-if="loading" :size="13" class="spin" style="color: var(--ink-3)" />
      </label>

      <div class="view-scroll">
        <p v-if="error" class="view-error">{{ error }}</p>
        <p v-if="notice" class="view-notice">{{ notice }}</p>

        <!-- 好友 -->
        <template v-if="tab === 'friends'">
          <div
            v-for="f in friends"
            :key="f.userId"
            class="row spot"
            :class="{ on: selected?.userId === f.userId }"
            @pointermove="spot"
            @click="selected = f"
          >
            <AppAvatar :initials="initialsOf(f.remark || f.nickname)" :tone="toneOf(f.userId)" size="md" />
            <span class="row-main">
              <span class="row-name">
                {{ f.remark || f.nickname }}
              </span>
              <span class="row-sub">@{{ f.username || f.userId }}</span>
            </span>
            <input
              v-if="editingRemark === f.userId"
              v-model="remarkDraft"
              class="remark-input"
              placeholder="备注名"
              @click.stop
              @keydown.enter="saveRemark(f)"
              @blur="saveRemark(f)"
            />
            <button
              v-else
              class="row-action"
              title="设置备注"
              @click.stop="startEditRemark(f)"
            >
              <Pencil :size="13" :stroke-width="1.9" />
            </button>
            <button class="row-action" title="发消息" :disabled="opening !== null" @click.stop="openChat(f)">
              <Loader2 v-if="opening === f.userId" :size="13" class="spin" />
              <MessageSquarePlus v-else :size="13" :stroke-width="1.9" />
            </button>
          </div>
          <p v-if="!friends.length && !loading" class="view-empty-sm">
            还没有好友。点右上角图标搜索用户发起申请。
          </p>
        </template>

        <!-- 群聊 -->
        <template v-else-if="tab === 'groups'">
          <div v-for="g in data.groups" :key="g.groupId" class="row static spot" @pointermove="spot">
            <AppAvatar :initials="initialsOf(g.name)" :tone="toneOf(g.groupId)" size="md" rounded />
            <span class="row-main">
              <span class="row-name">{{ g.name }}</span>
              <span class="row-sub">{{ g.groupId }}</span>
            </span>
            <Hash :size="13" :stroke-width="1.9" style="color: var(--ink-4)" />
          </div>
          <p v-if="!data.groups.length && !loading" class="view-empty-sm">还没有加入任何群</p>
        </template>

        <!-- 申请 -->
        <template v-else>
          <div v-for="r in requests" :key="r.requestId" class="req spot" @pointermove="spot">
            <AppAvatar :initials="initialsOf(r.fromNickname)" :tone="toneOf(r.fromUserId)" size="md" />
            <span class="req-main">
              <span class="row-name">{{ r.fromNickname }}</span>
              <span class="row-sub">
                {{ r.message || '请求添加你为好友' }} · {{ relativeTime(r.createdAt) }}
              </span>
            </span>
            <template v-if="r.status === 'PENDING'">
              <button class="mini ok" title="同意" @click="decide(r, 'accept')">
                <Check :size="13" :stroke-width="2.4" />
              </button>
              <button class="mini no" title="拒绝" @click="decide(r, 'reject')">
                <X :size="13" :stroke-width="2.4" />
              </button>
            </template>
            <span v-else class="req-status">{{ r.status === 'ACCEPTED' ? '已同意' : '已拒绝' }}</span>
          </div>
          <div v-if="!requests.length && !loading" class="view-empty-sm">
            <Inbox :size="13" :stroke-width="1.9" style="display: inline; vertical-align: -1px" />
            暂无好友申请
          </div>
        </template>
      </div>
    </aside>

    <section class="view-main">
      <div v-if="selected" class="profile-card glare">
        <AppAvatar :initials="initialsOf(selected.remark || selected.nickname)" :tone="toneOf(selected.userId)" size="xl" />
        <h2 class="profile-name">{{ selected.remark || selected.nickname }}</h2>
        <p class="profile-sub">
          @{{ selected.username }} · ID {{ selected.userId }}
        </p>
        <p v-if="selected.remark" class="profile-remark">备注：{{ selected.remark }}</p>
        <button class="primary" :disabled="opening !== null" @click="openChat(selected)">
          <MessageSquarePlus :size="14" :stroke-width="2" />
          发消息
        </button>
        <button class="ghost" @click="startEditRemark(selected)">
          <Pencil :size="13" :stroke-width="2" />
          修改备注
        </button>
      </div>

      <div v-else class="empty">
        <div class="empty-mark"><Users :size="22" :stroke-width="1.6" /></div>
        <h3 class="empty-title">通讯录</h3>
        <p class="empty-text">
          左侧选择好友查看资料，行尾图标可直接发消息或改备注。右上角可以搜索用户添加好友。
        </p>
      </div>
    </section>

    <!-- 添加好友 -->
    <Transition name="fade">
      <div v-if="addOpen" class="mask" @click.self="addOpen = false">
        <div class="dialog">
          <header class="dialog-head">
            <div>
              <p class="eyebrow">添加好友</p>
              <h2 class="dialog-title">搜索用户</h2>
            </div>
            <button class="icon-btn sm" @click="addOpen = false"><X :size="15" /></button>
          </header>

          <label class="search" style="margin: 0 14px">
            <Search class="search-icon" :size="15" :stroke-width="2" />
            <input
              v-model="addKeyword"
              type="search"
              placeholder="输入用户名或昵称"
              @input="onAddKeyword"
            />
          </label>

          <input
            v-model="addMessage"
            class="add-msg"
            placeholder="验证消息（可选）"
          />

          <div class="dialog-body">
            <div v-for="hit in addHits" :key="hit.userId" class="row static">
              <AppAvatar :initials="initialsOf(hit.nickname)" :tone="toneOf(hit.userId)" size="md" />
              <span class="row-main">
                <span class="row-name">{{ hit.nickname }}</span>
                <span class="row-sub">@{{ hit.username }}</span>
              </span>
              <button class="mini ok" :disabled="addBusy !== null" @click="sendRequest(hit)">
                <Loader2 v-if="addBusy === hit.userId" :size="13" class="spin" />
                <Send v-else :size="13" :stroke-width="2" />
              </button>
            </div>
            <p v-if="!addHits.length" class="view-empty-sm" style="text-align: center">
              {{ addKeyword ? '没有找到匹配用户' : '输入关键词开始搜索' }}
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.view { display: grid; grid-template-columns: 320px minmax(0, 1fr); min-width: 0; height: 100%; background: var(--surface); }
.view-list { display: flex; flex-direction: column; min-width: 0; border-right: 1px solid var(--line); }
.view-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 14px 10px; }
.view-title { font-size: 19px; font-weight: 680; letter-spacing: -0.5px; }
.seg-tabs { --n: 3; margin: 0 12px 10px; height: 32px; }


.dot-badge { min-width: 15px; height: 15px; padding: 0 4px; border-radius: var(--r-full); background: var(--danger); color: #fff; font-size: 9.5px; font-weight: 700; line-height: 15px; }
.view-scroll { flex: 1; overflow-y: auto; padding: 0 8px 18px; }
.view-error { margin: 6px 6px; padding: 7px 10px; border-radius: var(--r-sm); background: var(--danger-soft); color: var(--danger); font-size: 11.5px; }
.view-notice { margin: 6px 6px; padding: 7px 10px; border-radius: var(--r-sm); background: var(--accent-soft); color: var(--accent-ink); font-size: 11.5px; }
.row { display: flex; align-items: center; gap: 9px; width: 100%; padding: 8px 8px; border-radius: var(--r-md); text-align: left; transition: background var(--dur-1) var(--ease-out); }
.row:hover { background: var(--surface-hover); }
.row.on { background: var(--accent-soft); }
.row.static { cursor: default; }
.row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.row-name { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-sub { font-size: 10.5px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-action { width: 26px; height: 26px; border-radius: var(--r-xs); display: grid; place-items: center; color: var(--ink-3); flex-shrink: 0; }
.row-action:hover { background: var(--accent-soft); color: var(--accent); }
.remark-input { width: 70px; height: 24px; padding: 0 6px; border-radius: var(--r-xs); border: 1px solid var(--accent); font-size: 11.5px; background: var(--surface); }
.req { display: flex; align-items: center; gap: 9px; padding: 9px 8px; border-radius: var(--r-md); }
.req:hover { background: var(--surface-hover); }
.req-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.req-status { font-size: 10.5px; color: var(--ink-4); }
.mini { width: 26px; height: 26px; border-radius: var(--r-xs); display: grid; place-items: center; flex-shrink: 0; transition: all var(--dur-1); }
.mini.ok { background: var(--accent-soft); color: var(--accent-ink); }
.mini.ok:hover { background: var(--accent); color: #fff; }
.mini.no { background: var(--surface-3); color: var(--ink-3); }
.mini.no:hover { background: var(--danger-soft); color: var(--danger); }
.view-empty-sm { padding: 14px 9px; font-size: 11.5px; color: var(--ink-4); }
.view-main { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; background: var(--canvas); }
.profile-card { display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 24px 30px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow-sm); min-width: 300px; }
.profile-name { font-size: 17px; font-weight: 680; letter-spacing: -0.3px; }
.profile-sub { font-size: 11.5px; color: var(--ink-3); }
.profile-remark { font-size: 11.5px; color: var(--ink-2); }
.primary, .ghost { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 34px; padding: 0 16px; border-radius: var(--r-sm); font-size: 12.5px; font-weight: 620; width: 100%; }
.primary { background: var(--accent-grad); color: #fff; box-shadow: 0 3px 12px -5px var(--accent); margin-top: 4px; }
.ghost { border: 1px solid var(--line); color: var(--ink-2); background: var(--surface-2); }
.mask { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 24px; background: color-mix(in srgb, var(--ink) 26%, transparent); backdrop-filter: blur(6px); }
.dialog { width: 100%; max-width: 420px; max-height: min(560px, 82vh); display: flex; flex-direction: column; gap: 10px; padding: 16px 0 8px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow-lg); animation: pop-in 200ms var(--ease-spring); }
.dialog-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 0 14px; }
.dialog-title { font-size: 16px; font-weight: 660; letter-spacing: -0.3px; }
.dialog-body { flex: 1; overflow-y: auto; padding: 4px 8px 8px; }
.add-msg { margin: 0 14px; height: 32px; padding: 0 11px; border-radius: var(--r-sm); background: var(--surface-3); font-size: 12.5px; }
.spin { animation: tick-spin 900ms linear infinite; }
.fade-enter-active, .fade-leave-active { transition: opacity 160ms var(--ease-out); }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .view { grid-template-columns: minmax(0, 1fr); }
  .view-list { border-right: 0; }
  .view-main { display: none; }
}
</style>
