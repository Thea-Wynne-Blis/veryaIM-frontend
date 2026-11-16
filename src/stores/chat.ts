import { defineStore } from 'pinia'
import {
  conversations as seedConversations,
  initialMessages,
  type ChatMessage,
  type Conversation,
} from '../data/workspace'

type State = {
  conversations: Conversation[]
  messages: Record<string, ChatMessage[]>
  currentConversationId: string | null
}

export const useChatStore = defineStore('chat', {
  state: (): State => ({
    conversations: seedConversations.map((item) => ({ ...item })),
    messages: JSON.parse(JSON.stringify(initialMessages)),
    currentConversationId: seedConversations[0]?.id ?? null,
  }),

  getters: {
    currentConversation(state): Conversation | null {
      return (
        state.conversations.find(
          (item) => item.id === state.currentConversationId,
        ) ?? null
      )
    },
    currentMessages(state): ChatMessage[] {
      return state.currentConversationId
        ? state.messages[state.currentConversationId] ?? []
        : []
    },
    unreadTotal(state): number {
      return state.conversations.reduce((sum, item) => sum + item.unread, 0)
    },
  },

  actions: {
    select(id: string) {
      this.currentConversationId = id
      const target = this.conversations.find((item) => item.id === id)
      if (target) target.unread = 0
      if (!this.messages[id]) this.messages[id] = []
    },

    send(id: string, text: string) {
      const body = text.trim()
      if (!body) return
      const now = new Date()
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes(),
      ).padStart(2, '0')}`
      const list = this.messages[id] ?? (this.messages[id] = [])
      list.push({
        id: `local-${Date.now()}`,
        author: '我',
        initials: '我',
        tone: 'jade',
        side: 'out',
        time,
        text: body,
        read: false,
      })
      const target = this.conversations.find((item) => item.id === id)
      if (target) {
        target.preview = `我：${body}`
        target.time = time
      }
    },
  },
})
