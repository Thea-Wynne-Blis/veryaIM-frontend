<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import NavRail from '../components/NavRail.vue'
import ConversationList from '../components/ConversationList.vue'
import ChatPane from '../components/ChatPane.vue'
import DetailPanel from '../components/DetailPanel.vue'
import MobileWorkspace from '../components/MobileWorkspace.vue'
import { useIsMobile } from '../composables/useIsMobile'
import {
  conversations as seed,
  initialMessages,
  type ChatMessage,
  type Conversation,
} from '../data/workspace'

const isMobile = useIsMobile(768)

/** 支持 ?theme=dark 直接进入深色，便于演示与截图。 */
const initialTheme: 'light' | 'dark' =
  new URLSearchParams(window.location.search).get('theme') === 'dark'
    ? 'dark'
    : 'light'

const conversationList = ref<Conversation[]>(
  seed.map((item) => ({ ...item })),
)
const messages = ref<Record<string, ChatMessage[]>>(
  JSON.parse(JSON.stringify(initialMessages)),
)

const activeId = ref<string | null>(conversationList.value[0]?.id ?? null)
const detailOpen = ref(true)
const theme = ref<'light' | 'dark'>(initialTheme)
const navActive = ref('chat')

const activeConversation = computed(
  () => conversationList.value.find((item) => item.id === activeId.value) ?? null,
)

function messagesOf(id: string): ChatMessage[] {
  return messages.value[id] ?? []
}

function select(id: string) {
  activeId.value = id
  const target = conversationList.value.find((item) => item.id === id)
  if (target) target.unread = 0
}

function closeMobileChat() {
  activeId.value = null
}

function send(conversationId: string, text: string) {
  const list = messages.value[conversationId] ?? (messages.value[conversationId] = [])
  const now = new Date()
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes(),
  ).padStart(2, '0')}`
  list.push({
    id: `local-${Date.now()}`,
    author: '我',
    initials: '我',
    tone: 'jade',
    side: 'out',
    time,
    text,
    read: false,
  })
  const target = conversationList.value.find((item) => item.id === conversationId)
  if (target) {
    target.preview = `我：${text}`
    target.time = time
  }
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = theme.value
}

onMounted(() => {
  document.documentElement.dataset.theme = theme.value
})
</script>

<template>
  <MobileWorkspace
    v-if="isMobile"
    :conversations="conversationList"
    :messages-of="messagesOf"
    :active-id="activeId"
    @select="select"
    @close="closeMobileChat"
    @send="(payload) => send(payload.conversationId, payload.text)"
  />

  <div v-else class="shell" :class="{ 'detail-open': detailOpen }">
    <NavRail
      v-model:active="navActive"
      :unread="conversationList.reduce((sum, item) => sum + item.unread, 0)"
      :theme="theme"
      @toggle-theme="toggleTheme"
    />

    <ConversationList
      :conversations="conversationList"
      :active-id="activeId"
      @select="select"
    />

    <ChatPane
      :conversation="activeConversation"
      :messages="activeId ? messagesOf(activeId) : []"
      :detail-open="detailOpen"
      @send="(text) => activeId && send(activeId, text)"
      @toggle-detail="detailOpen = !detailOpen"
    />

    <DetailPanel
      v-if="detailOpen && activeConversation"
      :conversation="activeConversation"
      @close="detailOpen = false"
    />
  </div>
</template>
