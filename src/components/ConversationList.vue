<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Search, Plus, Pin, Bell, BellOff, UserPlus, Users, MailOpen, EyeOff, Trash2, PinOff } from 'lucide-vue-next'
import AppAvatar from './AppAvatar.vue'
import { trackSpotlight } from '../composables/usePointerFx'
import { api, type Id } from '../api/client'
import { initialsOf, toneOfPerson } from '../utils/present'
import { groupAvatarSrc, userAvatarSrc } from '../utils/avatar'
import type { Conversation } from '../types/chat'

const props = defineProps<{
  conversations: Conversation[]
  activeId: string | null
}>()

const menuOpen = ref(false)

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'new-chat'): void
  (e: 'new-group'): void
  (e: 'pin', id: string, pinned: boolean): void
  (e: 'unread', id: string): void
  (e: 'mute', id: string, muted: boolean): void
  (e: 'hide', id: string): void
  (e: 'remove', id: string): void
  (e: 'open-contact', userId: Id, name: string): void
}>()

type Filter = 'all' | 'unread'
const filter = ref<Filter>('all')
const keyword = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

/** 搜索框同时查联系人：第一次输入时懒加载好友列表 */
type Contact = { friendId: Id; nickname: string; remark?: string | null; avatar?: string | null; online?: boolean }
const contacts = ref<Contact[]>([])
let contactsLoaded = false

async function ensureContacts() {
  if (contactsLoaded) return
  contactsLoaded = true
  try {
    const data = await api.get<{ friends?: Contact[] }>('/contacts')
    contacts.value = Array.isArray(data?.friends) ? data.friends : []
  } catch {
    contactsLoaded = false
  }
}

watch(keyword, (value) => {
  if (value.trim()) void ensureContacts()
})

/** 已经有会话的联系人会出现在上面的会话列表里，这里只补还没聊过的人 */
const contactHits = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return []
  const chatted = new Set(
    props.conversations.map((item) => item.peerId).filter(Boolean).map(String),
  )
  return contacts.value
    .filter((friend) => {
      const label = (friend.remark?.trim() || friend.nickname || '').toLowerCase()
      return label.includes(kw) || friend.nickname.toLowerCase().includes(kw)
    })
    .filter((friend) => !chatted.has(String(friend.friendId)))
    .slice(0, 8)
})

function contactName(friend: Contact): string {
  return friend.remark?.trim() || friend.nickname
}

function focusSearch() {
  searchInput.value?.focus()
}

defineExpose({ focusSearch })

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
const filterIndex = computed(() => (filter.value === 'all' ? 0 : 1))

function closeMenu() {
  menuOpen.value = false
}

/* ---------- 会话右键菜单 ---------- */
type ConvMenuState = { x: number; y: number; item: Conversation }

const MENU_WIDTH = 172
const MENU_HEIGHT = 5 * 34 + 8
const convMenu = ref<ConvMenuState | null>(null)
/** 待确认删除的会话：删除会清空自己这边的聊天记录 */
const deleteTarget = ref<Conversation | null>(null)

function openConvMenu(event: MouseEvent, item: Conversation) {
  event.preventDefault()
  menuOpen.value = false
  convMenu.value = {
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - MENU_WIDTH - 8)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - MENU_HEIGHT - 8)),
    item,
  }
}

function closeConvMenu() {
  convMenu.value = null
}

function onDocPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('.conv-menu')) return
  closeConvMenu()
}

function pick(action: (item: Conversation) => void) {
  const item = convMenu.value?.item
  convMenu.value = null
  if (item) action(item)
}

function askDelete() {
  const item = convMenu.value?.item
  convMenu.value = null
  if (item) deleteTarget.value = item
}

function confirmDelete() {
  const item = deleteTarget.value
  deleteTarget.value = null
  if (item) emit('remove', item.id)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  convMenu.value = null
  deleteTarget.value = null
}

onMounted(() => {
  document.addEventListener('click', closeMenu)
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('pointerdown', onDocPointerDown, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', closeMenu)
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('pointerdown', onDocPointerDown, true)
})
</script>

<template>
  <section class="list-pane" aria-label="会话列表">
    <header class="list-head">
      <div class="list-title-row">
        <h1 class="list-title">消息</h1>
        <div class="new-wrap">
          <button class="icon-btn glide" aria-label="新建会话" @click.stop="menuOpen = !menuOpen">
            <Plus :size="18" :stroke-width="2" />
          </button>
          <Transition name="fade">
            <div v-if="menuOpen" class="new-menu" @click.stop>
              <button
                class="new-item"
                @click="
                  menuOpen = false;
                  emit('new-chat')
                "
              >
                <UserPlus :size="14" :stroke-width="1.9" />
                发起私聊
              </button>
              <button
                class="new-item"
                @click="
                  menuOpen = false;
                  emit('new-group')
                "
              >
                <Users :size="14" :stroke-width="1.9" />
                创建群聊
              </button>
            </div>
          </Transition>
        </div>
      </div>

      <label class="search">
        <Search class="search-icon" :size="15" :stroke-width="2" />
        <input
          ref="searchInput"
          v-model="keyword"
          type="search"
          placeholder="搜索会话、联系人"
          aria-label="搜索会话、联系人"
        />
      </label>

      <!-- Rubber Segment -->
      <div
        class="seg"
        :style="{ '--idx': filterIndex }"
        role="tablist"
        aria-label="会话筛选"
      >
        <span class="seg-thumb" aria-hidden="true" />
        <button
          role="tab"
          :class="{ on: filter === 'all' }"
          :aria-selected="filter === 'all'"
          @click="filter = 'all'"
        >
          全部
          <span class="seg-count num">{{ conversations.length }}</span>
        </button>
        <button
          role="tab"
          :class="{ on: filter === 'unread' }"
          :aria-selected="filter === 'unread'"
          @click="filter = 'unread'"
        >
          未读
          <span class="seg-count num">{{ totalUnread }}</span>
        </button>
      </div>
    </header>

    <div class="list-scroll">
      <template v-if="pinned.length">
        <p class="list-group-label">置顶</p>
        <button
          v-for="(item, index) in pinned"
          :key="item.id"
          class="conv spot"
          :class="{ active: item.id === activeId }"
          :style="{ animationDelay: `${index * 26}ms` }"
          @pointermove="trackSpotlight"
          @click="emit('select', item.id)"
          @contextmenu.prevent="openConvMenu($event, item)"
        >
          <AppAvatar
            :initials="item.initials"
            :tone="item.tone"
            :presence="item.presence"
            :rounded="item.kind === 'group'"
            :src="item.kind === 'group' ? groupAvatarSrc(item.id) : userAvatarSrc(item.peerId)"
            size="md"
          />
          <span class="conv-main">
            <span class="conv-top">
              <span class="conv-name">{{ item.name }}</span>
              <Pin
                :size="10"
                :stroke-width="2.4"
                style="color: var(--ink-4); flex-shrink: 0"
              />
              <BellOff
                v-if="item.muted"
                :size="10"
                :stroke-width="2.4"
                style="color: var(--ink-4); flex-shrink: 0"
              />
            </span>
            <span class="conv-preview">{{ item.preview }}</span>
          </span>
          <span class="conv-meta">
            <span class="conv-time num">{{ item.time }}</span>
            <span
              v-if="item.unread"
              class="unread"
              :class="{ muted: item.muted }"
            >
              <span :key="item.unread">{{ item.unread > 99 ? '99+' : item.unread }}</span>
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
        class="conv spot"
        :class="{ active: item.id === activeId }"
        :style="{ animationDelay: `${index * 26}ms` }"
        @pointermove="trackSpotlight"
        @click="emit('select', item.id)"
        @contextmenu.prevent="openConvMenu($event, item)"
      >
        <AppAvatar
          :initials="item.initials"
          :tone="item.tone"
          :presence="item.presence"
          :rounded="item.kind === 'group'"
          :src="item.kind === 'group' ? groupAvatarSrc(item.id) : userAvatarSrc(item.peerId)"
          size="md"
        />
        <span class="conv-main">
          <span class="conv-top">
            <span class="conv-name">{{ item.name }}</span>
            <span v-if="item.kind === 'group'" class="conv-flag">
              {{ item.members }}
            </span>
            <BellOff
              v-if="item.muted"
              :size="10"
              :stroke-width="2.4"
              style="color: var(--ink-4); flex-shrink: 0"
            />
          </span>
          <span class="conv-preview">{{ item.preview }}</span>
        </span>
        <span class="conv-meta">
          <span class="conv-time num">{{ item.time }}</span>
          <span v-if="item.unread" class="unread" :class="{ muted: item.muted }">
            <span :key="item.unread">{{ item.unread > 99 ? '99+' : item.unread }}</span>
          </span>
        </span>
      </button>

      <template v-if="contactHits.length">
        <p class="list-group-label">联系人</p>
        <button
          v-for="friend in contactHits"
          :key="`contact-${friend.friendId}`"
          class="conv spot"
          @pointermove="trackSpotlight"
          @click="emit('open-contact', friend.friendId, contactName(friend))"
        >
          <AppAvatar
            :initials="initialsOf(contactName(friend))"
            :tone="toneOfPerson(friend.friendId)"
            :presence="friend.online ? 'online' : 'offline'"
            :src="friend.avatar || userAvatarSrc(friend.friendId)"
            size="md"
          />
          <span class="conv-main">
            <span class="conv-top">
              <span class="conv-name">{{ contactName(friend) }}</span>
            </span>
            <span class="conv-preview">联系人 · 点击发起聊天</span>
          </span>
        </button>
      </template>

      <p v-if="!visible.length && !contactHits.length" class="empty-text">
        {{ keyword.trim() ? '没有找到相关会话或联系人，换个关键词试试。' : '还没有会话' }}
      </p>
    </div>

    <!-- 会话右键菜单 -->
    <Teleport to="body">
      <div
        v-if="convMenu"
        class="conv-menu"
        role="menu"
        :style="{ left: `${convMenu.x}px`, top: `${convMenu.y}px` }"
        @contextmenu.prevent
        @pointerdown.stop
      >
        <button class="conv-menu-item" role="menuitem" @click.stop="pick((item) => emit('pin', item.id, !item.pinned))">
          <PinOff v-if="convMenu.item.pinned" :size="14" :stroke-width="1.9" />
          <Pin v-else :size="14" :stroke-width="1.9" />
          {{ convMenu.item.pinned ? '取消置顶' : '置顶' }}
        </button>
        <button class="conv-menu-item" role="menuitem" @click.stop="pick((item) => emit('unread', item.id))">
          <MailOpen :size="14" :stroke-width="1.9" />
          标为未读
        </button>
        <button class="conv-menu-item" role="menuitem" @click.stop="pick((item) => emit('mute', item.id, !item.muted))">
          <Bell v-if="convMenu.item.muted" :size="14" :stroke-width="1.9" />
          <BellOff v-else :size="14" :stroke-width="1.9" />
          {{ convMenu.item.muted ? '允许消息通知' : '消息免打扰' }}
        </button>
        <button class="conv-menu-item" role="menuitem" @click.stop="pick((item) => emit('hide', item.id))">
          <EyeOff :size="14" :stroke-width="1.9" />
          不显示
        </button>
        <div class="conv-menu-sep" />
        <button class="conv-menu-item danger" role="menuitem" @click.stop="askDelete">
          <Trash2 :size="14" :stroke-width="1.9" />
          删除
        </button>
      </div>
    </Teleport>

    <!-- 删除确认 -->
    <Teleport to="body">
      <div v-if="deleteTarget" class="confirm-veil" @click.self="deleteTarget = null">
        <div class="confirm-card" role="dialog" aria-modal="true" aria-labelledby="conv-del-title">
          <h2 id="conv-del-title" class="confirm-title">
            删除与“{{ deleteTarget.name }}”的聊天？
          </h2>
          <p class="confirm-text">删除聊天后，聊天记录也将被清空。</p>
          <div class="confirm-actions">
            <button class="confirm-btn danger" @click="confirmDelete">删除</button>
            <button class="confirm-btn" @click="deleteTarget = null">取消</button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.new-wrap {
  position: relative;
}

.new-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 20;
  min-width: 132px;
  padding: 4px;
  border-radius: var(--r-sm);
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-pop);
  animation: pop-in 160ms var(--ease-spring);
}

.new-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 9px;
  border-radius: var(--r-xs);
  font-size: 12.5px;
  font-weight: 550;
  color: var(--ink-2);
  text-align: left;
}

.new-item:hover {
  background: var(--surface-hover);
  color: var(--ink);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 140ms var(--ease-out);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ---------- 会话右键菜单 ---------- */
.conv-menu {
  position: fixed;
  z-index: 60;
  min-width: 172px;
  padding: 4px;
  border-radius: var(--r-sm);
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-pop);
  animation: pop-in 140ms var(--ease-spring);
}

.conv-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 0 9px;
  border-radius: var(--r-xs);
  font-size: 12.5px;
  font-weight: 550;
  color: var(--ink-2);
  text-align: left;
}

.conv-menu-item:hover {
  background: var(--surface-hover);
  color: var(--ink);
}

.conv-menu-item.danger {
  color: var(--danger);
}

.conv-menu-item.danger:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.conv-menu-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--line);
}

/* ---------- 删除确认 ---------- */
.confirm-veil {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(14, 16, 18, 0.34);
  backdrop-filter: blur(2px);
  animation: fade-in 160ms var(--ease-out);
}

.confirm-card {
  width: min(340px, 100%);
  padding: 20px 20px 16px;
  border-radius: var(--r-md);
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-pop);
  animation: pop-in 180ms var(--ease-spring);
}

.confirm-title {
  margin: 0 0 8px;
  font-size: 14.5px;
  font-weight: 640;
  color: var(--ink);
  text-align: center;
}

.confirm-text {
  margin: 0 0 18px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--ink-3);
  text-align: center;
}

.confirm-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.confirm-btn {
  height: 34px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-2);
}

.confirm-btn:hover {
  background: var(--surface-hover);
  color: var(--ink);
}

.confirm-btn.danger {
  background: var(--danger-soft);
  color: var(--danger);
}

.confirm-btn.danger:hover {
  background: var(--danger);
  color: #fff;
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.empty-text {
  padding: 40px 12px;
  text-align: center;
  font-size: 12.5px;
  color: var(--ink-3);
}

/* 新建按钮：悬停轻微上浮 */
.glide {
  transition: background var(--dur-1) var(--ease-out),
    color var(--dur-1) var(--ease-out), transform var(--dur-2) var(--ease-spring);
}

.glide:hover {
  transform: translateY(-1px) rotate(90deg);
}
</style>
