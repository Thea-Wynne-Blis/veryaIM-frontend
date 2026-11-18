<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { messageOf } from '../utils/error'
import { useToast } from '../composables/useToast'
import {
  Users, Search, MessageSquarePlus, Loader2, UserPlus,
  Check, X, Pencil, Inbox, Hash, Send, Trash2,
  MapPin, PenLine, CalendarClock, UserRound,
} from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import UserProfileDialog from './UserProfileDialog.vue'
import { useIsMobile } from '../composables/useIsMobile'
import { api, sameId, type Id } from '../api/client'
import { useChatStore } from '../stores/chat'
import { initialsOf, relativeTime, toneOf } from '../utils/present'

/** 后端 /contacts 的 friends 只有 friendId，没有 userId / username。 */
type Friend = {
  friendId: Id
  nickname: string
  avatar?: string | null
  region?: string | null
  signature?: string | null
  remark?: string | null
  online?: boolean
  /** 成为好友的时间，后端取自 im_friend.created_at。 */
  createdAt?: string
}
type GroupItem = { groupId: string; name: string }
type Contacts = { friends: Friend[]; groups: GroupItem[]; pendingRequests: number }
type Request = {
  requestId: number
  fromUserId: Id
  toUserId: Id
  fromNickname: string
  toNickname: string
  message?: string
  status: string
  createdAt: string
}

const chat = useChatStore()
const isMobile = useIsMobile(768)
const data = ref<Contacts>({ friends: [], groups: [], pendingRequests: 0 })
const requests = ref<Request[]>([])
const loading = ref(false)
const error = ref('')
const { message: notice, show: flash } = useToast()
const keyword = ref('')
const selected = ref<Friend | null>(null)
const opening = ref<Id | null>(null)
const openingGroup = ref<string | null>(null)
const tab = ref<'friends' | 'groups' | 'requests'>('friends')
const editingRemark = ref<Id | null>(null)
const remarkDraft = ref('')

/* 添加好友弹窗 */
const addOpen = ref(false)
const addKeyword = ref('')
const addHits = ref<{ userId: Id; nickname: string; username: string }[]>([])
const addMessage = ref('')
const addBusy = ref<Id | null>(null)

/** 资料卡：从搜索结果点开的是陌生人，从群成员点开的是好友/陌生人。 */
const profileOpen = ref(false)
/** 点哪一行，卡片就贴着哪一行弹出 */
const profileAnchor = ref<HTMLElement | null>(null)
const profileId = ref<Id | null>(null)
const profileFallback = ref<{ nickname?: string; avatar?: string | null } | null>(null)

const tabIndex = computed(() => {
  if (tab.value === 'friends') return 0
  if (tab.value === 'groups') return 1
  return 2
})

function spot(event: PointerEvent) {
  const el = event.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--spot-x', `${event.clientX - rect.left}px`)
  el.style.setProperty('--spot-y', `${event.clientY - rect.top}px`)
}

const pendingRequests = computed(() =>
  requests.value.filter((r) => r.status === 'PENDING'),
)

const friends = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return data.value.friends
  return data.value.friends.filter((f) =>
    [f.nickname, f.remark].filter(Boolean).some((v) =>
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
    data.value = {
      friends: Array.isArray(c?.friends) ? c.friends : [],
      groups: Array.isArray(c?.groups) ? c.groups : [],
      pendingRequests: c?.pendingRequests ?? 0,
    }
    requests.value = Array.isArray(r) ? r : []
    // 选中的好友可能已被删除，同步清理。
    if (selected.value) {
      selected.value =
        data.value.friends.find((f) => sameId(f.friendId, selected.value?.friendId)) ?? null
    }
  } catch (e) {
    error.value = messageOf(e, '加载通讯录失败')
  } finally {
    loading.value = false
  }
}

async function openChat(friend: Friend) {
  opening.value = friend.friendId
  error.value = ''
  try {
    const conversationId = await chat.createPrivate(friend.friendId)
    await chat.loadCards()
    await chat.open(conversationId)
    // 从「添加好友」搜索结果里点进来时，顺带关掉弹窗
    addOpen.value = false
    window.dispatchEvent(new CustomEvent('veryal:open-chat', { detail: conversationId }))
  } catch (e) {
    error.value = messageOf(e, '发起会话失败')
  } finally {
    opening.value = null
  }
}

/**
 * 桌面端点好友行只是选中；移动端没有右侧详情栏，
 * 点整行就直接进入聊天，和「发消息」按钮等价。
 */
function pickFriend(friend: Friend) {
  selected.value = friend
  if (!isMobile.value || opening.value !== null) return
  void openChat(friend)
}

/** 搜索命中的用户如果已经是好友，直接给「发消息」，不用再发好友申请。 */
function friendOf(userId: Id): Friend | null {
  return data.value.friends.find((f) => sameId(f.friendId, userId)) ?? null
}

function chatWithHit(hit: { userId: Id; nickname: string }) {
  const friend = friendOf(hit.userId)
  if (friend) void openChat(friend)
}

/** 打开统一资料卡：搜索结果里的陌生人也能看地区、签名并直接加好友。 */
function openUserProfile(
  hit: { userId: Id; nickname?: string; avatar?: string | null },
  event?: MouseEvent,
) {
  profileId.value = hit.userId
  profileAnchor.value = (event?.currentTarget as HTMLElement) ?? null
  profileFallback.value = { nickname: hit.nickname, avatar: hit.avatar ?? null }
  profileOpen.value = true
}

function onProfileChat(userId: Id) {
  const friend = friendOf(userId)
  if (friend) void openChat(friend)
}

/** 添加时间按「2026年11月18日」展示。 */
function fullDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

async function openGroup(group: GroupItem) {
  openingGroup.value = group.groupId
  error.value = ''
  try {
    if (!chat.cards.length) await chat.loadCards()
    await chat.open(group.groupId)
    window.dispatchEvent(new CustomEvent('veryal:open-chat', { detail: group.groupId }))
  } catch (e) {
    error.value = messageOf(e, '打开群聊失败')
  } finally {
    openingGroup.value = null
  }
}

function startEditRemark(friend: Friend) {
  editingRemark.value = friend.friendId
  remarkDraft.value = friend.remark ?? ''
}

async function saveRemark(friend: Friend) {
  if (!sameId(editingRemark.value, friend.friendId)) return
  const remark = remarkDraft.value.trim()
  editingRemark.value = null
  if ((friend.remark ?? '') === remark) return
  try {
    await api.put(`/friends/${friend.friendId}`, { remark })
    friend.remark = remark || null
    flash('备注已保存')
    // 备注会改会话标题：列表 / 聊天头部立刻跟手，再拉一次卡片兜底。
    chat.renameFriend(friend.friendId, friend.remark)
  } catch (e) {
    error.value = messageOf(e, '备注保存失败')
  }
}

async function removeFriend(friend: Friend) {
  if (!window.confirm(`确定删除好友「${friend.remark || friend.nickname}」吗？`)) return
  error.value = ''
  try {
    await api.delete(`/friends/${friend.friendId}`)
    if (selected.value && sameId(selected.value.friendId, friend.friendId)) selected.value = null
    flash('已删除好友')
    await load()
  } catch (e) {
    error.value = messageOf(e, '删除好友失败')
  }
}

async function decide(request: Request, action: 'accept' | 'reject') {
  error.value = ''
  try {
    await api.post(`/friends/requests/${request.requestId}/${action}`)
    flash(action === 'accept' ? '已添加为好友' : '已拒绝')
    await load()
  } catch (e) {
    error.value = messageOf(e, '操作失败')
  }
}

let addTimer: number | null = null
let addSearchSeq = 0
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
  const seq = ++addSearchSeq
  try {
    const result = await api.get<unknown>(
      `/users/search?keyword=${encodeURIComponent(kw)}&limit=20`,
    )
    if (seq !== addSearchSeq) return // 丢弃过期响应
    const list = Array.isArray(result) ? result : []
    addHits.value = (list as Record<string, unknown>[])
      .map((i) => ({
        userId: String(i.userId ?? ''),
        nickname: String(i.nickname ?? i.username ?? '用户'),
        username: String(i.username ?? ''),
      }))
      .filter((i) => i.userId && i.userId !== '0')
  } catch {
    if (seq === addSearchSeq) addHits.value = []
  }
}

async function sendRequest(hit: { userId: Id; nickname: string }) {
  addBusy.value = hit.userId
  error.value = ''
  try {
    await api.post('/friends/requests', {
      toUserId: hit.userId,
      message: addMessage.value.trim() || undefined,
    })
    flash(`已向 ${hit.nickname} 发送好友申请`)
    addOpen.value = false
    addKeyword.value = ''
    addHits.value = []
    addMessage.value = ''
    await load()
  } catch (e) {
    error.value = messageOf(e, '发送申请失败')
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
            :key="f.friendId"
            class="row spot"
            :class="{ on: sameId(selected?.friendId, f.friendId) }"
            @pointermove="spot"
            @click="pickFriend(f)"
          >
            <span class="avatar-wrap">
              <AppAvatar :initials="initialsOf(f.remark || f.nickname)" :tone="toneOf(f.friendId)" size="md" />
              <span v-if="f.online" class="online-dot" title="在线" />
            </span>
            <span class="row-main">
              <span class="row-name">{{ f.remark || f.nickname }}</span>
              <span class="row-sub">{{ f.nickname }} · {{ f.online ? '在线' : '离线' }}</span>
            </span>
            <input
              v-if="sameId(editingRemark, f.friendId)"
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
              <Loader2 v-if="sameId(opening, f.friendId)" :size="13" class="spin" />
              <MessageSquarePlus v-else :size="13" :stroke-width="1.9" />
            </button>
          </div>
          <p v-if="!friends.length && !loading" class="view-empty-sm">
            还没有好友。点右上角图标搜索用户发起申请。
          </p>
        </template>

        <!-- 群聊 -->
        <template v-else-if="tab === 'groups'">
          <div
            v-for="g in data.groups"
            :key="g.groupId"
            class="row spot"
            @pointermove="spot"
            @click="openGroup(g)"
          >
            <AppAvatar :initials="initialsOf(g.name)" :tone="toneOf(g.groupId)" size="md" rounded />
            <span class="row-main">
              <span class="row-name">{{ g.name }}</span>
              <span class="row-sub">群聊</span>
            </span>
            <Loader2 v-if="openingGroup === g.groupId" :size="13" class="spin" />
            <Hash v-else :size="13" :stroke-width="1.9" style="color: var(--ink-4)" />
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
        <div class="profile-head">
          <span class="profile-avatar">
            <AppAvatar
              :initials="initialsOf(selected.remark || selected.nickname)"
              :tone="toneOf(selected.friendId)"
              size="xl"
            />
            <span v-if="selected.online" class="online-dot" title="在线" />
          </span>
          <h2 class="profile-name">{{ selected.remark || selected.nickname }}</h2>
          <p class="profile-sub">
            {{ selected.nickname }} · {{ selected.online ? '在线' : '离线' }}
          </p>
        </div>

        <p class="profile-signature" :class="{ empty: !selected.signature }">
          {{ selected.signature || '这个人很神秘，还没有写个性签名。' }}
        </p>

        <dl class="profile-meta">
          <div class="meta-row">
            <dt><MapPin :size="13" :stroke-width="1.9" /> 地区</dt>
            <dd>{{ selected.region || '未填写' }}</dd>
          </div>
          <div class="meta-row">
            <dt><PenLine :size="13" :stroke-width="1.9" /> 个性签名</dt>
            <dd :class="{ muted: !selected.signature }">{{ selected.signature || '未填写' }}</dd>
          </div>
          <div class="meta-row">
            <dt><CalendarClock :size="13" :stroke-width="1.9" /> 添加时间</dt>
            <dd>{{ fullDate(selected.createdAt) }}</dd>
          </div>
          <div class="meta-row">
            <dt><UserRound :size="13" :stroke-width="1.9" /> 用户 ID</dt>
            <dd class="mono">{{ selected.friendId }}</dd>
          </div>
        </dl>

        <button class="primary" :disabled="opening !== null" @click="openChat(selected)">
          <Loader2 v-if="sameId(opening, selected.friendId)" :size="14" class="spin" />
          <MessageSquarePlus v-else :size="14" :stroke-width="2" />
          发消息
        </button>
        <div v-if="sameId(editingRemark, selected.friendId)" class="remark-box">
          <input
            v-model="remarkDraft"
            class="remark-input wide"
            placeholder="给 TA 设置一个备注名"
            maxlength="64"
            @keydown.enter="saveRemark(selected)"
          />
          <button class="mini" title="保存备注" @click="saveRemark(selected)">
            <Check :size="13" :stroke-width="2.6" />
          </button>
        </div>
        <button v-else class="ghost" @click="startEditRemark(selected)">
          <Pencil :size="13" :stroke-width="2" />
          修改备注
        </button>
        <button class="ghost danger-text" @click="removeFriend(selected)">
          <Trash2 :size="13" :stroke-width="2" />
          删除好友
        </button>
      </div>

      <div v-else class="empty">
        <div class="empty-mark"><Users :size="22" :stroke-width="1.6" /></div>
        <h3 class="empty-title">通讯录</h3>
        <p class="empty-text">
          左侧选择好友查看资料，行尾图标可直接发消息或改备注。群聊页点击群可直接进入会话，右上角可以搜索用户添加好友。
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
            <div
              v-for="hit in addHits"
              :key="hit.userId"
              class="row clickable"
              title="查看资料"
              @click="openUserProfile(hit, $event)"
            >
              <AppAvatar :initials="initialsOf(hit.nickname)" :tone="toneOf(hit.userId)" size="md" />
              <span class="row-main">
                <span class="row-name">{{ hit.nickname }}</span>
                <span class="row-sub">
                  @{{ hit.username }}<template v-if="friendOf(hit.userId)"> · 已是好友</template>
                </span>
              </span>
              <button
                v-if="friendOf(hit.userId)"
                class="mini ok"
                title="发消息"
                :disabled="opening !== null"
                @click="chatWithHit(hit)"
              >
                <Loader2 v-if="sameId(opening, hit.userId)" :size="13" class="spin" />
                <MessageSquarePlus v-else :size="13" :stroke-width="1.9" />
              </button>
              <button v-else class="mini ok" :disabled="addBusy !== null" @click="sendRequest(hit)">
                <Loader2 v-if="sameId(addBusy, hit.userId)" :size="13" class="spin" />
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

    <!-- 用户资料卡：搜索结果里的陌生人 / 已经是好友的人 -->
    <UserProfileDialog
      :open="profileOpen"
      :user-id="profileId"
      :fallback="profileFallback"
      :anchor="profileAnchor"
      @close="profileOpen = false"
      @changed="load"
      @chat="onProfileChat"
      @settings="profileOpen = false"
    />
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
.row { display: flex; align-items: center; gap: 9px; width: 100%; padding: 8px 8px; border-radius: var(--r-md); text-align: left; cursor: pointer; transition: background var(--dur-1) var(--ease-out); }
.row:hover { background: var(--surface-hover); }
.row.on { background: var(--accent-soft); }
.row.static { cursor: default; }
.row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.row-name { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-sub { font-size: 10.5px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.avatar-wrap { position: relative; flex-shrink: 0; display: inline-flex; }
.online-dot { position: absolute; right: -1px; bottom: -1px; width: 9px; height: 9px; border-radius: 50%; background: var(--ok, #22c55e); border: 2px solid var(--surface); }
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
.profile-card { display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding: 22px 24px 20px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--line); box-shadow: var(--frame-ring), var(--shadow-sm); width: min(360px, 100%); }
.profile-head { display: flex; flex-direction: column; align-items: center; text-align: center; }
.profile-avatar { position: relative; margin-bottom: 8px; }
.profile-name { font-size: 17px; font-weight: 680; letter-spacing: -0.3px; }
.profile-sub { font-size: 11.5px; color: var(--ink-3); }
.profile-signature { margin: 4px 0 0; text-align: center; font-size: 12.5px; line-height: 1.65; color: var(--ink-2); }
.profile-signature.empty { color: var(--ink-4); }
.profile-meta { margin: 6px 0 2px; padding-top: 10px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 7px; }
.meta-row { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }
.meta-row dt { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; font-size: 11px; color: var(--ink-3); }
.meta-row dd { min-width: 0; margin: 0; font-size: 12px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta-row dd.muted { color: var(--ink-4); }
.mono { font-family: var(--mono); font-size: 11px; color: var(--ink-2); }
.remark-box { display: flex; align-items: center; gap: 6px; }
.remark-input.wide { flex: 1; width: auto; height: 34px; }
.mini { width: 34px; height: 34px; flex-shrink: 0; border-radius: var(--r-sm); display: grid; place-items: center; background: var(--accent-soft); color: var(--accent-ink); }
.row.clickable { cursor: pointer; }
.primary, .ghost { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 34px; padding: 0 16px; border-radius: var(--r-sm); font-size: 12.5px; font-weight: 620; width: 100%; }
.primary { background: var(--accent-grad); color: #fff; box-shadow: 0 3px 12px -5px var(--accent); margin-top: 4px; }
.ghost { border: 1px solid var(--line); color: var(--ink-2); background: var(--surface-2); }
.ghost.danger-text { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 26%, transparent); }
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
