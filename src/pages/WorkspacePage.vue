<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import NavRail from '../components/NavRail.vue'
import ConversationList from '../components/ConversationList.vue'
import ChatPane from '../components/ChatPane.vue'
import DetailPanel from '../components/DetailPanel.vue'
import MobileWorkspace from '../components/MobileWorkspace.vue'
import NewChatDialog from '../components/NewChatDialog.vue'
import { useIsMobile } from '../composables/useIsMobile'
import { useChatStore } from '../stores/chat'
import { useAuthStore } from '../stores/auth'
import type { ChatMessage, Conversation } from '../data/workspace'
import { clockTime, initialsOf, listTime, toneOf } from '../utils/present'

const route = useRoute()
const isMobile = useIsMobile(768)
const chat = useChatStore()
const auth = useAuthStore()

const detailOpen = ref(true)
const theme = ref<'light' | 'dark'>(
  new URLSearchParams(window.location.search).get('theme') === 'dark' ? 'dark' : 'light',
)
const navActive = ref('chat')
const dialogOpen = ref(false)

/** 后端卡片 → 组件使用的视图模型 */
const conversations = computed<Conversation[]>(() =>
  chat.cards.map((card) => ({
    id: card.conversationId,
    name: card.title,
    initials: initialsOf(card.title),
    kind: card.type === 'GROUP' ? 'group' : 'direct',
    tone: toneOf(card.conversationId),
    presence: 'offline',
    unread: card.unreadCount,
    time: listTime(card.lastMessageAt ?? card.updatedAt),
    preview: card.lastMessagePreview || '还没有消息',
    members: card.memberCount,
    context:
      card.type === 'GROUP'
        ? `群聊 · ${card.memberCount} 位成员`
        : '单聊',
  })),
)

const activeCard = computed(() => chat.activeCard)
const activeConversation = computed(
  () => conversations.value.find((item) => item.id === chat.activeId) ?? null,
)

const messages = computed<ChatMessage[]>(() =>
  chat.activeMessages.map((item) => {
    const mine = item.senderId === chat.myId
    const author = mine ? '我' : activeCard.value?.title ?? '对方'
    return {
      id: String(item.messageId),
      author,
      initials: mine ? '我' : initialsOf(author),
      tone: mine ? 'jade' : toneOf(item.senderId),
      side: mine ? 'out' : 'in',
      time: clockTime(item.createdAt),
      text: item.type === 'TEXT' ? item.content : `[${item.type}]`,
      read: false,
    }
  }),
)

function messagesOf(id: string): ChatMessage[] {
  if (id !== chat.activeId) return []
  return messages.value
}

async function select(id: string) {
  chat.activeId = id
  await chat.open(id)
}

function closeMobileChat() {
  chat.activeId = null
}

async function send(conversationId: string, text: string) {
  if (conversationId !== chat.activeId) chat.activeId = conversationId
  await chat.send(text)
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = theme.value
}

async function handleCreated(conversationId: string) {
  dialogOpen.value = false
  await chat.loadCards()
  await select(conversationId)
}

onMounted(async () => {
  document.documentElement.dataset.theme = theme.value
  await chat.loadCards()
  const fromRoute = route.params.conversationId as string | undefined
  const first = fromRoute ?? chat.cards[0]?.conversationId ?? null
  if (first) await select(first)
  chat.startPolling(4000)
})

onBeforeUnmount(() => chat.stopPolling())
</script>

<template>
  <MobileWorkspace
    v-if="isMobile"
    :conversations="conversations"
    :messages-of="messagesOf"
    :active-id="chat.activeId"
    :me="auth.user?.nickname ?? '我'"
    @select="select"
    @close="closeMobileChat"
    @send="(payload) => send(payload.conversationId, payload.text)"
    @new-chat="dialogOpen = true"
  />

  <div v-else class="stage">
    <div class="aura" aria-hidden="true"><i /><i /><i /></div>
    <div class="grain" aria-hidden="true" />

    <div class="frame" :class="{ 'detail-open': detailOpen }">
      <NavRail
        v-model:active="navActive"
        :unread="chat.totalUnread"
        :theme="theme"
        @toggle-theme="toggleTheme"
      />

      <ConversationList
        :conversations="conversations"
        :active-id="chat.activeId"
        @select="select"
        @new-chat="dialogOpen = true"
      />

      <ChatPane
        :conversation="activeConversation"
        :messages="messages"
        :detail-open="detailOpen"
        @send="(text) => chat.activeId && send(chat.activeId, text)"
        @toggle-detail="detailOpen = !detailOpen"
      />

      <DetailPanel
        v-if="detailOpen && activeConversation"
        :conversation="activeConversation"
        @close="detailOpen = false"
      />
    </div>
  </div>

  <NewChatDialog
    :open="dialogOpen"
    @close="dialogOpen = false"
    @created="handleCreated"
  />
</template>
