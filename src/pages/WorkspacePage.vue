<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { messageOf } from '../utils/error'
import { useRoute, useRouter } from 'vue-router'
import NavRail from '../components/NavRail.vue'
import ConversationList from '../components/ConversationList.vue'
import ChatPane from '../components/ChatPane.vue'
import DetailPanel from '../components/DetailPanel.vue'
import SearchPanel from '../components/SearchPanel.vue'
import ConversationSearchDialog from '../components/ConversationSearchDialog.vue'
import MobileWorkspace from '../components/MobileWorkspace.vue'
import ContactsView from '../components/ContactsView.vue'
import FilesView from '../components/FilesView.vue'
import FavoritesView from '../components/FavoritesView.vue'
import MeView from '../components/MeView.vue'
import NewChatDialog from '../components/NewChatDialog.vue'
import CreateGroupDialog from '../components/CreateGroupDialog.vue'
import GroupManageDialog from '../components/GroupManageDialog.vue'
import ForwardDialog from '../components/ForwardDialog.vue'
import UserProfileDialog from '../components/UserProfileDialog.vue'
import { useIsMobile } from '../composables/useIsMobile'
import { useTheme } from '../composables/useTheme'
import { useToast } from '../composables/useToast'
import { useChatStore } from '../stores/chat'
import { useAuthStore } from '../stores/auth'
import type { Attachment, ChatMessage, Conversation } from '../types/chat'
import { parseJson, sameId, api, ApiError, type ConversationCard, type Id, type MessageView, type MessagePage } from '../api/client'
import { clockTime, conversationPreview, humanBytes, initialsOf, listTime, toneOf, toneOfConversation } from '../utils/present'

const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile(768)
const { apply: applyTheme } = useTheme()
const chat = useChatStore()
const auth = useAuthStore()

const detailOpen = ref(true)
/** 全局搜索面板与详情面板共用右侧栏位，互斥显示。 */
const searchOpen = ref(false)
const historyConversation = ref<Conversation | null>(null)
const chatPane = ref<InstanceType<typeof ChatPane> | null>(null)
const mobileWorkspace = ref<InstanceType<typeof MobileWorkspace> | null>(null)
let navigationVersion = 0
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

/** 当前一级导航：chat / contacts / files / favorites / me */
const view = computed(() => {
  const name = String(route.name ?? 'chat')
  if (name === 'contacts' || name === 'files' || name === 'favorites' || name === 'me') {
    return name
  }
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
  const group = card.type === 'GROUP'
  return {
    id: card.conversationId,
    name: card.title,
    initials: initialsOf(card.title),
    kind: group ? 'group' : 'direct',
    tone: toneOfConversation(card),
    presence: 'offline',
    unread: card.unreadCount,
    time: listTime(card.lastMessageAt ?? card.updatedAt),
    preview: conversationPreview(
      group ? 'group' : 'direct',
      card.lastMessageType === 'SYSTEM' ? '' : card.lastMessagePreview,
      card.lastMessageSenderName,
      sameId(card.lastMessageSenderId ?? '', auth.user?.userId ?? ''),
    ),
    members: card.memberCount,
    context: group ? `群聊 · ${card.memberCount} 位成员` : '单聊',
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
    const member = activeMembers.value.find((entry) => sameId(entry.userId, item.senderId))
    return member ? member.remark?.trim() || member.nickname : `成员 ${item.senderId}`
  }
  return activeCard.value?.title ?? '对方'
}

/** 引用块显示被引用消息的发送者：单聊里只有「我 / 对方」。 */
function senderNameOf(id: Id): string {
  if (sameId(id, chat.myId)) return '我'
  if (activeCard.value?.type === 'GROUP') {
    const member = activeMembers.value.find((entry) => sameId(entry.userId, id))
    return member ? member.remark?.trim() || member.nickname : `成员 ${id}`
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

async function select(id: string, updateRoute = true, locationRequest?: number) {
  const request = locationRequest ?? ++navigationVersion
  if (!chat.cards.some((card) => card.conversationId === id)) {
    await chat.loadCards()
  }
  if (request !== navigationVersion) return
  // 路由监听与点击共用这个入口，先更新选中态以避免重复打开同一会话。
  chat.activeId = id
  if (updateRoute) {
    if (view.value !== 'chat' || (isMobile.value && !route.params.conversationId)) {
      await router.push({ name: 'conversation', params: { conversationId: id } })
    } else {
      await router.replace({ name: 'conversation', params: { conversationId: id } })
    }
  }
  if (request !== navigationVersion) return
  await chat.open(id)
  if (activeCard.value?.type === 'GROUP') {
    // 打开会话时强制刷新一次成员，避免面板沿用 30s TTL 内的旧在线状态。
    await chat.loadMembers(id, true)
  }
}

async function closeMobileChat() {
  ++navigationVersion
  if (!route.params.conversationId) { chat.activeId = null; return }
  if (['/app/chat', '/app/favorites'].includes(String(router.options.history.state.back))) router.back()
  else await router.replace({ name: 'chat' })
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
  searchOpen.value = false
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
  ++navigationVersion
  const map: Record<string, string> = {
    chat: '/app/chat',
    contacts: '/app/contacts',
    files: '/app/files',
    favorites: '/app/favorites',
    me: '/app/me',
  }
  router.push(map[target] ?? '/app/chat')
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

/* ---------- 搜索 / 收藏 ---------- */
const { message: toast, show: showToast } = useToast()

function openSearch() {
  searchOpen.value = true
}

function openConversationSearch() {
  if (!activeConversation.value) return
  historyConversation.value = activeConversation.value
  void chat.loadMembers(activeConversation.value.id)
}

function closeSearch() {
  searchOpen.value = false
}

/** 先验证原消息可访问，再切换页面；失败时保留收藏预览和搜索结果。 */
async function locateConversationMessage(conversationId: string, messageId: string, signal?: AbortSignal) {
  const request = ++navigationVersion
  const context = await api.get<MessagePage>(
    `/conversations/${conversationId}/messages/${messageId}/context`, { signal },
  )
  signal?.throwIfAborted()
  if (request !== navigationVersion) return
  if (!chat.cards.some(card => card.conversationId === conversationId)) await chat.loadCards()
  signal?.throwIfAborted()
  if (request !== navigationVersion) return
  if (!chat.cards.some(card => card.conversationId === conversationId)) throw new Error('来源会话暂不可用，请稍后重试。')
  if ((chat.hiddenIds[conversationId] ?? []).includes(messageId)) throw new Error('这条消息已在本机删除')
  searchOpen.value = false
  historyConversation.value = null
  await select(conversationId, true, request)
  if (request !== navigationVersion || chat.activeId !== conversationId) return
  chat.applyMessageContext(conversationId, context.messages)
  await nextTick()
  const pane = isMobile.value ? mobileWorkspace.value : chatPane.value
  if (!await pane?.focusMessage(messageId)) throw new Error('这条消息暂不可见，请稍后重试')
}

async function openFavoriteMessage(conversationId: string, messageId: string, signal?: AbortSignal) {
  try { await locateConversationMessage(conversationId, messageId, signal) }
  catch (e) {
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
      throw new Error(e.status === 403 ? '原会话已不可访问，收藏内容仍可查看。'
        : '原消息已撤回、清空或不可访问，收藏内容仍可查看。')
    }
    if (e instanceof Error && e.message === '这条消息已在本机删除') throw new Error(`${e.message}，收藏内容仍可查看。`)
    throw e
  }
}

/** 全局搜索和聊天内搜索复用相同的定位流程。 */
async function openFromSearch(conversationId: string, messageId?: string) {
  try {
    if (messageId) await locateConversationMessage(conversationId, messageId)
    else { searchOpen.value = false; historyConversation.value = null; await select(conversationId) }
  } catch (e) {
    showToast(messageOf(e, '定位消息失败，请重试'))
  }
}

/** 搜索里点联系人：有会话就直接进，没有就现建一个。 */
async function openUserChat(userId: Id) {
  closeSearch()
  try {
    const conversationId = await chat.createPrivate(userId)
    await chat.loadCards()
    await select(conversationId)
  } catch (e) {
    showToast(messageOf(e, '发起会话失败'))
  }
}

function onToggleDetail() {
  searchOpen.value = false
  detailOpen.value = !detailOpen.value
}

/** 聊天里右键「收藏」：后端存的是消息快照，撤回后仍可在收藏页查看。 */
async function onFavorite(message: ChatMessage) {
  if (!chat.activeId) return
  try {
    await api.post('/favorites', {
      conversationId: chat.activeId,
      // messageId 是字符串（雪花 ID 超过 2^53），直接透传，别用 Number 丢精度。
      messageId: message.messageId,
    })
    showToast(isMobile.value ? '已收藏，可在“我的 → 我的收藏”中查看' : '已收藏，可在左侧“收藏”里查看')
  } catch (e) {
    showToast(messageOf(e, '收藏失败'))
  }
}

/** ⌘K / Ctrl+K 打开搜索，和会话列表里的提示一致。 */
function onGlobalKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f' && view.value === 'chat' && activeConversation.value) {
    event.preventDefault()
    openConversationSearch()
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    if (view.value !== 'chat') return
    event.preventDefault()
    openSearch()
  }
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
    else if (!id && isMobile.value && route.name === 'chat') chat.activeId = null
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
  applyTheme()
  window.addEventListener('veryal:open-chat', onOpenChatRequest)
  window.addEventListener('veryal:unauthorized', onUnauthorized)
  document.addEventListener('keydown', onGlobalKeydown)
  await Promise.allSettled([chat.loadCards(), auth.refresh()])
  if (view.value === 'chat') {
    const fromRoute = route.params.conversationId as string | undefined
    const first = fromRoute ?? (isMobile.value ? null : chat.visibleCards[0]?.conversationId ?? null)
    if (first && first !== chat.activeId) await select(first, false)
  }
  chat.startPolling(3000)
  chat.startRealtime()
})

onBeforeUnmount(() => {
  window.removeEventListener('veryal:open-chat', onOpenChatRequest)
  window.removeEventListener('veryal:unauthorized', onUnauthorized)
  document.removeEventListener('keydown', onGlobalKeydown)
  chat.stopRealtime()
  chat.stopPolling()
})
</script>

<template>
  <MobileWorkspace
    v-if="isMobile"
    ref="mobileWorkspace"
    :initial-view="view"
    :locate-favorite-message="openFavoriteMessage"
    :conversations="conversations"
    :active-conversation="activeHiddenConversation"
    :messages-of="messagesOf"
    :active-id="view === 'chat' ? chat.activeId : null"
    :me="auth.user?.nickname ?? '我'"
    :error="chat.error"
    :loading="chat.loadingMessages"
    :inert="searchOpen"
    @select="select"
    @close="closeMobileChat"
    @send="(payload) => send(payload.conversationId, payload.text, payload.reply)"
    @attach="(payload) => attach(payload.conversationId, payload.file)"
    @forward="onForward"
    @favorite="onFavorite"
    @new-chat="dialogOpen = true"
    @open-search="openConversationSearch"
    @global-search="openSearch"
    @manage="manageOpen = true"
    @mark-unread="onConvUnread"
    @hide="onConvHide"
    @delete="onConvDelete"
    @profile="(id, anchor) => openProfile(id, anchor)"
  />

  <div v-else class="stage">
    <div class="aura" aria-hidden="true"><i /><i /><i /></div>
    <div class="grain" aria-hidden="true" />

    <!-- 聊天：四栏 -->
    <div v-if="view === 'chat'" class="frame" :class="{ 'detail-open': detailOpen || searchOpen }">
      <NavRail
        :active="view"
        :unread="chat.totalUnread"
        @navigate="navigate"
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
        @open-search="openSearch"
      />

      <ChatPane
        ref="chatPane"
        :conversation="activeConversation"
        :messages="messages"
        :detail-open="detailOpen"
        :error="chat.error"
        :members="activeMembers"
        :loading="chat.loadingMessages"
        @send="(text, reply) => chat.activeId && send(chat.activeId, text, reply)"
        @attach="(file) => chat.activeId && attach(chat.activeId, file)"
        @toggle-detail="onToggleDetail"
        @favorite="onFavorite"
        @forward="onForward"
        @profile="(id, anchor) => openProfile(id, anchor)"
      />

      <SearchPanel
        v-if="searchOpen"
        @close="closeSearch"
        @open-conversation="openFromSearch"
        @open-user-chat="openUserChat"
        @profile="(id, anchor) => openProfile(id, anchor)"
      />

      <DetailPanel
        v-else-if="detailOpen && activeConversation"
        :conversation="activeConversation"
        :members="activeMembers"
        :pinned="chat.isPinned(activeConversation.id)"
        :muted="chat.isMuted(activeConversation.id)"
        @manage="manageOpen = true"
        @open-search="openConversationSearch"
        @close="detailOpen = false"
        @toggle-pin="onTogglePin"
        @toggle-mute="onToggleMute"
        @profile="(id, anchor) => openProfile(id, anchor)"
      />
    </div>

    <!-- 通讯录 / 文件 / 收藏 / 我的：两栏 -->
    <div v-else class="frame single">
      <NavRail
        :active="view"
        :unread="chat.totalUnread"
        @navigate="navigate"
      />
      <ContactsView v-if="view === 'contacts'" />
      <FilesView v-else-if="view === 'files'" />
      <FavoritesView v-else-if="view === 'favorites'" :locate-message="openFavoriteMessage" />
      <MeView v-else />
    </div>
  </div>

  <SearchPanel
    v-if="isMobile && searchOpen"
    mobile
    @close="closeSearch"
    @open-conversation="openFromSearch"
    @open-user-chat="openUserChat"
    @profile="(id, anchor) => openProfile(id, anchor)"
  />

  <ConversationSearchDialog
    v-if="historyConversation"
    :key="historyConversation.id"
    :conversation="historyConversation"
    :members="chat.members[historyConversation.id] ?? []"
    @close="historyConversation = null"
    @locate="openFromSearch"
  />

  <Transition name="fade">
    <div v-if="toast" class="app-toast" role="status">{{ toast }}</div>
  </Transition>

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

<style scoped>
/* 全局操作反馈：浮动 toast，和聊天里的错误条互补。 */
.app-toast {
  position: fixed;
  left: 50%;
  bottom: 34px;
  z-index: 80;
  transform: translateX(-50%);
  padding: 9px 16px;
  border-radius: var(--r-full);
  background: var(--ink);
  color: var(--canvas);
  font-size: 12px;
  font-weight: 550;
  box-shadow: var(--shadow-sm, 0 8px 24px rgba(0, 0, 0, 0.18));
  pointer-events: none;
  white-space: nowrap;
}
</style>
