<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { messageOf } from '../utils/error'
import { useRoute, useRouter } from 'vue-router'
import NavRail from '../components/NavRail.vue'
import ConversationList from '../components/ConversationList.vue'
import ChatPane from '../components/ChatPane.vue'
import DetailPanel from '../components/DetailPanel.vue'
import MobileWorkspace from '../components/MobileWorkspace.vue'
import ContactsView from '../components/ContactsView.vue'
import FilesView from '../components/FilesView.vue'
import MeView from '../components/MeView.vue'
import NewChatDialog from '../components/NewChatDialog.vue'
import CreateGroupDialog from '../components/CreateGroupDialog.vue'
import GroupManageDialog from '../components/GroupManageDialog.vue'
import ForwardDialog from '../components/ForwardDialog.vue'
import UserProfileDialog from '../components/UserProfileDialog.vue'
import { useIsMobile } from '../composables/useIsMobile'
import { useChatStore } from '../stores/chat'
import { useAuthStore } from '../stores/auth'
import type { Attachment, ChatMessage, Conversation } from '../types/chat'
import { parseJson, sameId, type ConversationCard, type Id, type MessageView } from '../api/client'
import { clockTime, humanBytes, initialsOf, listTime, toneOf, toneOfConversation } from '../utils/present'

const THEME_KEY = 'veryal.theme'

const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile(768)
const chat = useChatStore()
const auth = useAuthStore()

const detailOpen = ref(true)
const theme = ref<'light' | 'dark'>(
  (localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null) ??
    (new URLSearchParams(window.location.search).get('theme') === 'dark' ? 'dark' : 'light'),
)
const dialogOpen = ref(false)
const createGroupOpen = ref(false)
const manageOpen = ref(false)
/** 聊天里点任意头像打开的资料卡 */
const profileOpen = ref(false)
const profileId = ref<Id | null>(null)
const profileFallback = ref<{ nickname: string } | null>(null)
/** 被点的头像元素：资料卡贴着它弹出 */
const profileAnchor = ref<HTMLElement | null>(null)
/** 右键「转发」选中的消息 */
const forwardTarget = ref<ChatMessage | null>(null)

/** 建群成功后直接进入该群会话 */
async function onGroupCreated(groupId: string) {
  createGroupOpen.value = false
  await chat.loadCards()
  await select(groupId)
}

/** 群信息变更后刷新列表与成员 */
async function onGroupChanged() {
  await chat.loadCards()
  if (chat.activeId) await chat.loadMembers(chat.activeId, true)
}

/** 退群或解散后清空当前会话 */
async function onGroupRemoved() {
  manageOpen.value = false
  chat.activeId = null
  await chat.loadCards()
}

/** 当前一级导航：chat / contacts / files / me */
const view = computed(() => {
  const name = String(route.name ?? 'chat')
  if (name === 'contacts' || name === 'files' || name === 'me') return name
  return 'chat'
})

function timeOfCard(card: { lastMessageAt: string | null; updatedAt: string }): number {
  return new Date(card.lastMessageAt ?? card.updatedAt).getTime() || 0
}

const sortedCards = computed(() =>
  [...chat.visibleCards].sort((a, b) => {
    const pinnedA = chat.pinnedIds.includes(a.conversationId) ? 1 : 0
    const pinnedB = chat.pinnedIds.includes(b.conversationId) ? 1 : 0
    if (pinnedA !== pinnedB) return pinnedB - pinnedA
    return timeOfCard(b) - timeOfCard(a)
  }),
)

function toConversation(card: ConversationCard): Conversation {
  return {
    id: card.conversationId,
    name: card.title,
    initials: initialsOf(card.title),
    kind: card.type === 'GROUP' ? 'group' : 'direct',
    tone: toneOfConversation(card),
    presence: 'offline',
    unread: card.unreadCount,
    time: listTime(card.lastMessageAt ?? card.updatedAt),
    preview: card.lastMessagePreview || '还没有消息',
    members: card.memberCount,
    context: card.type === 'GROUP' ? `群聊 · ${card.memberCount} 位成员` : '单聊',
    pinned: chat.pinnedIds.includes(card.conversationId),
    muted: chat.mutedIds.includes(card.conversationId),
    peerId: card.type === 'PRIVATE' && card.peerUserId ? String(card.peerUserId) : undefined,
  }
}

const conversations = computed<Conversation[]>(() => sortedCards.value.map(toConversation))

/**
 * 当前打开但被「不显示」的会话：聊天列表里没有它，
 * 但通讯录里点「发消息」后仍要能正常进入聊天页。
 */
const activeHiddenConversation = computed<Conversation | null>(() => {
  const id = chat.activeId
  if (!id || conversations.value.some((item) => item.id === id)) return null
  const card = chat.cards.find((item) => item.conversationId === id)
  return card ? toConversation(card) : null
})

const activeCard = computed(() => chat.activeCard)
const activeConversation = computed(
  () =>
    // 被「不显示」的会话不在列表，但通讯录/搜索进来后仍要能看历史和发消息
    conversations.value.find((item) => item.id === chat.activeId) ?? activeHiddenConversation.value,
)
const activeMembers = computed(() =>
  chat.activeId ? chat.members[chat.activeId] ?? [] : [],
)

function decodeContent(item: MessageView): string {
  if (item.contentEncoding !== 'base64') return item.content ?? ''
  try {
    const binary = atob(item.content ?? '')
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

function attachmentOf(item: MessageView): Attachment | undefined {
  if (item.recalled) return undefined
  if (item.type === 'TEXT' || item.type === 'EMOJI' || item.type === 'SYSTEM') return undefined
  const content = decodeContent(item)
  const kindOfType = (): Attachment['kind'] => {
    if (item.type === 'IMAGE') return 'image'
    if (item.type === 'VIDEO') return 'video'
    if (item.type === 'AUDIO') return 'audio'
    return 'file'
  }
  try {
    const data = parseJson<{
      fileId?: Id
      fileName?: string
      name?: string
      sizeBytes?: number
      width?: number
      height?: number
      contentType?: string
      coverFileId?: Id
      thumbnailFileId?: Id
      durationSeconds?: number
    }>(content)
    const fileId = data.fileId ? String(data.fileId) : undefined
    const name = data.fileName || data.name || `文件 ${fileId || ''}`.trim()
    const kind = kindOfType()
    const poster = data.coverFileId ?? data.thumbnailFileId
    return {
      name,
      size: humanBytes(Number(data.sizeBytes ?? 0)),
      kind,
      fileId,
      width: Number(data.width) || undefined,
      height: Number(data.height) || undefined,
      posterId: poster ? String(poster) : undefined,
      duration: Number(data.durationSeconds) || undefined,
      contentType: data.contentType,
      animated: kind === 'image' && (data.contentType ?? '').toLowerCase() === 'image/gif',
    }
  } catch {
    const kind = kindOfType()
    return {
      name: kind === 'image' ? '图片' : kind === 'video' ? '视频' : kind === 'audio' ? '语音' : '文件',
      size: '',
      kind,
    }
  }
}

function authorOf(item: MessageView): string {
  if (sameId(item.senderId, chat.myId)) return '我'
  if (activeCard.value?.type === 'GROUP') {
    return activeMembers.value.find((member) => sameId(member.userId, item.senderId))?.nickname
      ?? `成员 ${item.senderId}`
  }
  return activeCard.value?.title ?? '对方'
}

/** 引用块显示被引用消息的发送者：单聊里只有「我 / 对方」。 */
function senderNameOf(id: Id): string {
  if (sameId(id, chat.myId)) return '我'
  if (activeCard.value?.type === 'GROUP') {
    return activeMembers.value.find((member) => sameId(member.userId, id))?.nickname
      ?? `成员 ${id}`
  }
  return activeCard.value?.title ?? '对方'
}

function replyOf(item: MessageView): ChatMessage['replyTo'] {
  if (!item.replyToId || !item.replyPreview) return null
  return {
    messageId: String(item.replyToId),
    author: senderNameOf(item.replySenderId ?? ''),
    preview: item.replyPreview,
  }
}

const messages = computed<ChatMessage[]>(() =>
  chat.activeMessages.map((item) => {
    const mine = sameId(item.senderId, chat.myId)
    const author = authorOf(item)
    const peerReadSeq = chat.peerReadSeq(item.conversationId)
    const attachment = attachmentOf(item)
    return {
      id: String(item.messageId),
      author,
      initials: mine ? '我' : initialsOf(author),
      tone: mine ? 'jade' : toneOf(item.senderId),
      side: mine ? 'out' : 'in',
      time: clockTime(item.createdAt),
      text: item.recalled ? '消息已撤回' : decodeContent(item),
      attachment,
      image: attachment?.kind === 'image',
      read: mine && !!peerReadSeq && item.seq <= peerReadSeq,
      recalled: !!item.recalled,
      messageId: String(item.messageId),
      clientMsgId: item.clientMsgId ?? null,
      senderId: String(item.senderId),
      type: item.type,
      raw: decodeContent(item),
      seq: item.seq,
      mine,
      createdAt: item.createdAt,
      pending: item.pending,
      replyTo: replyOf(item),
    }
  }),
)

function messagesOf(id: string): ChatMessage[] {
  return id === chat.activeId ? messages.value : []
}

async function select(id: string, updateRoute = true) {
  if (!chat.cards.some((card) => card.conversationId === id)) {
    await chat.loadCards()
  }
  if (updateRoute) {
    if (view.value !== 'chat') {
      await router.push({ name: 'conversation', params: { conversationId: id } })
    } else {
      await router.replace({ name: 'conversation', params: { conversationId: id } })
    }
  }
  await chat.open(id)
  if (activeCard.value?.type === 'GROUP') {
    // 打开会话时强制刷新一次成员，避免面板沿用 30s TTL 内的旧在线状态。
    await chat.loadMembers(id, true)
  }
}

async function closeMobileChat() {
  chat.activeId = null
}

async function send(
  conversationId: string,
  text: string,
  reply?: { messageId: string; senderId: string; preview: string } | null,
) {
  if (conversationId !== chat.activeId) chat.activeId = conversationId
  await chat.send(text, reply)
}

async function attach(conversationId: string, file: File) {
  if (conversationId !== chat.activeId) chat.activeId = conversationId
  try {
    await chat.sendAttachment(file)
  } catch {
    /* 错误已在 store 中展示 */
  }
}

function onForward(message: ChatMessage) {
  forwardTarget.value = message
}

/** 聊天里点头像打开资料卡，好友、陌生人、自己走同一个组件。 */
function openProfile(userId: Id | string, anchor?: HTMLElement | null, nickname?: string) {
  if (!userId) return
  profileId.value = String(userId)
  profileAnchor.value = anchor ?? null
  profileFallback.value = nickname ? { nickname } : null
  profileOpen.value = true
}

/** 资料卡里点「发消息」：建私聊并直接切过去。 */
async function profileChat(userId: Id) {
  profileOpen.value = false
  try {
    const conversationId = await chat.createPrivate(userId)
    await chat.loadCards()
    await select(conversationId)
  } catch (e) {
    chat.error = messageOf(e, '发起会话失败')
  }
}

/** 资料卡里点「编辑我的资料」：切到设置页。 */
function openMySettings() {
  profileOpen.value = false
  navigate('me')
}

function navigate(target: string) {
  const map: Record<string, string> = {
    chat: '/app/chat',
    contacts: '/app/contacts',
    files: '/app/files',
    me: '/app/me',
  }
  router.push(map[target] ?? '/app/chat')
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = theme.value
  localStorage.setItem(THEME_KEY, theme.value)
}

async function handleCreated(conversationId: string) {
  dialogOpen.value = false
  await chat.loadCards()
  await select(conversationId)
}

/** 通讯录里点「发消息」时跳回聊天 */
function onOpenChatRequest(event: Event) {
  const id = (event as CustomEvent<string>).detail
  if (id) select(id)
}

function onUnauthorized() {
  chat.reset()
  if (route.name !== 'login') {
    router.replace({ name: 'login', query: { redirect: route.fullPath } })
  }
}

function onTogglePin() {
  if (chat.activeId) chat.togglePin(chat.activeId)
}

function onToggleMute() {
  if (chat.activeId) chat.toggleMute(chat.activeId)
}

/* ---------- 会话列表右键 / 左滑操作 ---------- */
function onConvPin(id: string, pinned: boolean) {
  void chat.setPinned(id, pinned).catch(reportActionError)
}

function onConvMute(id: string, muted: boolean) {
  void chat.setMuted(id, muted).catch(reportActionError)
}

function onConvUnread(id: string) {
  void chat.markUnread(id).catch(reportActionError)
}

function onConvHide(id: string) {
  if (chat.activeId === id) {
    chat.activeId = null
    if (route.params.conversationId) router.replace({ name: 'chat' })
  }
  void chat.hideConversation(id).catch(reportActionError)
}

async function onConvDelete(id: string) {
  if (chat.activeId === id) {
    chat.activeId = null
    if (route.params.conversationId) router.replace({ name: 'chat' })
  }
  try {
    await chat.deleteConversation(id)
  } catch (e) {
    reportActionError(e)
  }
}

function reportActionError(e: unknown) {
  chat.error = messageOf(e, '操作失败')
}

watch(
  () => route.params.conversationId as string | undefined,
  (id) => {
    if (id && id !== chat.activeId) select(id, false)
  },
)

watch(
  () => route.name,
  (name) => {
    if (name !== 'chat' && name !== 'conversation') return
    const fromRoute = route.params.conversationId as string | undefined
    if (fromRoute && fromRoute !== chat.activeId) {
      select(fromRoute, false)
    } else if (!isMobile.value && !chat.activeId && chat.visibleCards[0]) {
      // 移动端进入消息页应先看到会话列表，而不是自动打开第一个会话。
      select(chat.visibleCards[0].conversationId)
    }
  },
)

/**
 * 右侧详情描述的是「当前这个会话」：切到别的会话时收起，
 * 否则新会话会继承上一个会话的置顶/免打扰/成员状态，看起来像串台。
 */
watch(
  () => chat.activeId,
  (next, prev) => {
    if (prev && next !== prev) detailOpen.value = false
  },
)

onMounted(async () => {
  document.documentElement.dataset.theme = theme.value
  window.addEventListener('veryal:open-chat', onOpenChatRequest)
  window.addEventListener('veryal:unauthorized', onUnauthorized)
  await Promise.allSettled([chat.loadCards(), auth.refresh()])
  if (view.value === 'chat') {
    const fromRoute = route.params.conversationId as string | undefined
    const first = fromRoute ?? (isMobile.value ? null : chat.visibleCards[0]?.conversationId ?? null)
    if (first) await select(first, false)
  }
  chat.startPolling(3000)
  chat.startRealtime()
})

onBeforeUnmount(() => {
  window.removeEventListener('veryal:open-chat', onOpenChatRequest)
  window.removeEventListener('veryal:unauthorized', onUnauthorized)
  chat.stopRealtime()
  chat.stopPolling()
})
</script>

<template>
  <MobileWorkspace
    v-if="isMobile"
    :conversations="conversations"
    :active-conversation="activeHiddenConversation"
    :messages-of="messagesOf"
    :active-id="chat.activeId"
    :me="auth.user?.nickname ?? '我'"
    :error="chat.error"
    :loading="chat.loadingMessages"
    @select="select"
    @close="closeMobileChat"
    @send="(payload) => send(payload.conversationId, payload.text, payload.reply)"
    @attach="(payload) => attach(payload.conversationId, payload.file)"
    @forward="onForward"
    @new-chat="dialogOpen = true"
    @mark-unread="onConvUnread"
    @hide="onConvHide"
    @delete="onConvDelete"
    @profile="(id, anchor) => openProfile(id, anchor)"
  />

  <div v-else class="stage">
    <div class="aura" aria-hidden="true"><i /><i /><i /></div>
    <div class="grain" aria-hidden="true" />

    <!-- 聊天：四栏 -->
    <div v-if="view === 'chat'" class="frame" :class="{ 'detail-open': detailOpen }">
      <NavRail
        :active="view"
        :unread="chat.totalUnread"
        :theme="theme"
        @navigate="navigate"
        @toggle-theme="toggleTheme"
      />

      <ConversationList
        :conversations="conversations"
        :active-id="chat.activeId"
        @select="select"
        @new-chat="dialogOpen = true"
        @new-group="createGroupOpen = true"
        @pin="onConvPin"
        @unread="onConvUnread"
        @mute="onConvMute"
        @hide="onConvHide"
        @remove="onConvDelete"
      />

      <ChatPane
        :conversation="activeConversation"
        :messages="messages"
        :detail-open="detailOpen"
        :error="chat.error"
        :members="activeMembers"
        :loading="chat.loadingMessages"
        @send="(text, reply) => chat.activeId && send(chat.activeId, text, reply)"
        @attach="(file) => chat.activeId && attach(chat.activeId, file)"
        @toggle-detail="detailOpen = !detailOpen"
        @forward="onForward"
        @profile="(id, anchor) => openProfile(id, anchor)"
      />

      <DetailPanel
        v-if="detailOpen && activeConversation"
        :conversation="activeConversation"
        :members="activeMembers"
        :pinned="chat.isPinned(activeConversation.id)"
        :muted="chat.isMuted(activeConversation.id)"
        @manage="manageOpen = true"
        @close="detailOpen = false"
        @toggle-pin="onTogglePin"
        @toggle-mute="onToggleMute"
        @profile="(id, anchor) => openProfile(id, anchor)"
      />
    </div>

    <!-- 通讯录 / 文件 / 我的：两栏 -->
    <div v-else class="frame single">
      <NavRail
        :active="view"
        :unread="chat.totalUnread"
        :theme="theme"
        @navigate="navigate"
        @toggle-theme="toggleTheme"
      />
      <ContactsView v-if="view === 'contacts'" />
      <FilesView v-else-if="view === 'files'" />
      <MeView v-else />
    </div>
  </div>

  <NewChatDialog
    :open="dialogOpen"
    @close="dialogOpen = false"
    @created="handleCreated"
  />

  <CreateGroupDialog
    :open="createGroupOpen"
    @close="createGroupOpen = false"
    @created="onGroupCreated"
  />

  <GroupManageDialog
    :open="manageOpen"
    :group-id="chat.activeId"
    @close="manageOpen = false"
    @changed="onGroupChanged"
    @removed="onGroupRemoved"
  />

  <UserProfileDialog
    :open="profileOpen"
    :user-id="profileId"
    :fallback="profileFallback"
    :anchor="profileAnchor"
    @close="profileOpen = false"
    @changed="onGroupChanged"
    @chat="profileChat"
    @settings="openMySettings"
  />

  <ForwardDialog
    :open="!!forwardTarget"
    :message="forwardTarget"
    @close="forwardTarget = null"
    @forwarded="forwardTarget = null"
  />
</template>
