import { defineStore } from 'pinia'
import {
  api,
  type ConversationCard,
  type MessagePage,
  type MessageView,
} from '../api/client'
import { useAuthStore } from './auth'

const PAGE_SIZE = 60

type State = {
  cards: ConversationCard[]
  messages: Record<string, MessageView[]>
  activeId: string | null
  loadingCards: boolean
  loadingMessages: boolean
  error: string | null
  pollTimer: number | null
}

/** 后端字段名是 sequence，前端统一用 seq */
function normalize(raw: MessageView & { sequence?: number }): MessageView {
  return { ...raw, seq: raw.seq ?? raw.sequence ?? 0 }
}

export const useChatStore = defineStore('chat', {
  state: (): State => ({
    cards: [],
    messages: {},
    activeId: null,
    loadingCards: false,
    loadingMessages: false,
    error: null,
    pollTimer: null,
  }),

  getters: {
    myId(): number {
      return useAuthStore().user?.userId ?? 0
    },
    activeCard(state): ConversationCard | null {
      return state.cards.find((item) => item.conversationId === state.activeId) ?? null
    },
    activeMessages(state): MessageView[] {
      return state.activeId ? state.messages[state.activeId] ?? [] : []
    },
    totalUnread(state): number {
      return state.cards.reduce((sum, item) => sum + item.unreadCount, 0)
    },
  },

  actions: {
    async loadCards() {
      this.loadingCards = true
      this.error = null
      try {
        this.cards = await api.get<ConversationCard[]>('/conversations/cards')
      } catch (e) {
        this.error = e instanceof Error ? e.message : '加载会话失败'
      } finally {
        this.loadingCards = false
      }
    },

    async open(conversationId: string) {
      this.activeId = conversationId
      const card = this.cards.find((item) => item.conversationId === conversationId)
      const lastSeq = card?.lastSeq ?? 0
      const afterSeq = Math.max(0, lastSeq - PAGE_SIZE)
      await this.loadMessages(conversationId, afterSeq)
      await this.markRead(conversationId)

      // 新消息到达提示
      const before = card?.unreadCount ?? 0
      if (card && before > 0) card.unreadCount = 0
    },

    async loadMessages(conversationId: string, afterSeq: number) {
      this.loadingMessages = true
      try {
        let cursor = afterSeq
        const collected: MessageView[] = []
        for (let i = 0; i < 5; i++) {
          const page = await api.get<MessagePage>(
            `/conversations/${conversationId}/messages?cursor=${cursor}&limit=100`,
          )
          collected.push(...page.messages.map(normalize))
          if (!page.hasMore || page.messages.length === 0) break
          cursor = page.nextCursor
        }
        this.messages[conversationId] = collected
      } catch (e) {
        this.error = e instanceof Error ? e.message : '加载消息失败'
      } finally {
        this.loadingMessages = false
      }
    },

    async refreshMessages(conversationId: string) {
      const list = this.messages[conversationId] ?? []
      const lastSeq = list.length ? list[list.length - 1]!.seq : 0
      try {
        const page = await api.get<MessagePage>(
          `/conversations/${conversationId}/messages?cursor=${lastSeq}&limit=100`,
        )
        if (page.messages.length) {
          const merged = [...list, ...page.messages.map(normalize)]
          const seen = new Set<number>()
          this.messages[conversationId] = merged.filter((m) =>
            seen.has(m.messageId) ? false : (seen.add(m.messageId), true),
          )
        }
      } catch {
        /* 轮询失败静默，等下一轮 */
      }
    },

    async send(text: string) {
      const conversationId = this.activeId
      if (!conversationId || !text.trim()) return
      const clientMsgId = `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      try {
        // 后端返回 { message: {...}, duplicate }, 需取内层
        const resp = await api.post<{
          message: {
            messageId: number
            sequence: number
            createdAt: string
          }
          duplicate: boolean
        }>(
          `/conversations/${conversationId}/messages`,
          {
            conversationId,
            clientMessageId: clientMsgId,
            type: 'TEXT',
            content: text.trim(),
          },
        )
        const sent = resp.message
        const list = this.messages[conversationId] ?? (this.messages[conversationId] = [])
        list.push({
          messageId: sent.messageId,
          conversationId,
          senderId: this.myId,
          clientMsgId,
          seq: sent.sequence,
          type: 'TEXT',
          content: text.trim(),
          createdAt: sent.createdAt,
        })
        const card = this.cards.find((item) => item.conversationId === conversationId)
        if (card) {
          card.lastMessagePreview = text.trim()
          card.lastMessageAt = sent.createdAt
          card.lastSeq = sent.sequence
        }
      } catch (e) {
        this.error = e instanceof Error ? e.message : '发送失败'
        throw e
      }
    },

    async markRead(conversationId: string) {
      const card = this.cards.find((item) => item.conversationId === conversationId)
      if (!card) return
      try {
        await api.post(`/conversations/${conversationId}/read`, {
          readSequence: card.lastSeq,
        })
        card.lastReadSeq = card.lastSeq
        card.unreadCount = 0
      } catch {
        /* 已读失败不阻塞 */
      }
    },

    async createPrivate(peerUserId: number): Promise<string> {
      const created = await api.post<{ conversationId: string }>('/conversations', {
        peerUserId,
      })
      await this.loadCards()
      return created.conversationId
    },

    startPolling(intervalMs = 3000) {
      this.stopPolling()
      this.pollTimer = window.setInterval(async () => {
        const activeBefore = this.activeId
        await this.loadCards()
        if (activeBefore && activeBefore === this.activeId) {
          await this.refreshMessages(activeBefore)
          const card = this.cards.find((item) => item.conversationId === activeBefore)
          if (card && card.unreadCount > 0) await this.markRead(activeBefore)
        }
      }, intervalMs)
    },

    stopPolling() {
      if (this.pollTimer !== null) {
        window.clearInterval(this.pollTimer)
        this.pollTimer = null
      }
    },

    reset() {
      this.stopPolling()
      this.cards = []
      this.messages = {}
      this.activeId = null
      this.error = null
    },
  },
})
