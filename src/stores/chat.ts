import { defineStore } from 'pinia'
import {
  api,
  getToken,
  sameId,
  type ConversationCard,
  type FileRow,
  type GroupDetail,
  type Id,
  type MessagePage,
  type MessageView,
  type ReadReceipt,
  type UserProfile,
} from '../api/client'
import { useAuthStore } from './auth'

const PAGE_SIZE = 60
const PREFS_KEY = 'veryal.chatPrefs'
const REALTIME_HEALTHY_MS = 45_000
const BACKGROUND_SYNC_MS = 30_000

let realtimeAbort: AbortController | null = null
let realtimeRetryTimer: number | null = null
let visibilityHandler: (() => void) | null = null

export type ChatMember = {
  userId: Id
  nickname: string
  avatar?: string | null
  online?: boolean
  role?: string
}

type Prefs = { pinned: string[]; muted: string[] }

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { pinned: [], muted: [] }
    const parsed = JSON.parse(raw) as Partial<Prefs>
    return {
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
      muted: Array.isArray(parsed.muted) ? parsed.muted : [],
    }
  } catch {
    return { pinned: [], muted: [] }
  }
}

type State = {
  cards: ConversationCard[]
  messages: Record<string, MessageView[]>
  receipts: Record<string, Record<string, number>>
  members: Record<string, ChatMember[]>
  activeId: string | null
  loadingCards: boolean
  loadingMessages: boolean
  error: string | null
  pollTimer: number | null
  pollingBusy: boolean
  realtimeConnected: boolean
  realtimeLastPing: number
  lastSync: number
  pinnedIds: string[]
  mutedIds: string[]
}

/** 后端字段名是 sequence，前端统一用 seq */
function normalize(raw: MessageView & { sequence?: number }): MessageView {
  return { ...raw, seq: raw.seq ?? raw.sequence ?? 0 }
}

function dedupe(list: MessageView[]): MessageView[] {
  const seen = new Set<string>()
  return list
    .filter((item) => {
      const key = String(item.messageId)
      return seen.has(key) ? false : (seen.add(key), true)
    })
    .sort((a, b) => a.seq - b.seq)
}

export const useChatStore = defineStore('chat', {
  state: (): State => {
    const prefs = loadPrefs()
    return {
      cards: [],
      messages: {},
      receipts: {},
      members: {},
      activeId: null,
      loadingCards: false,
      loadingMessages: false,
      error: null,
      pollTimer: null,
      pollingBusy: false,
      realtimeConnected: false,
      realtimeLastPing: 0,
      lastSync: 0,
      pinnedIds: prefs.pinned,
      mutedIds: prefs.muted,
    }
  },

  getters: {
    myId(): Id {
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
    isPinned: (state) => (conversationId: string) => state.pinnedIds.includes(conversationId),
    isMuted: (state) => (conversationId: string) => state.mutedIds.includes(conversationId),
    /** 对方（群聊为已读人数最多的成员）已读到的最大 seq。 */
    peerReadSeq: (state) => (conversationId: string) => {
      const map = state.receipts[conversationId]
      if (!map) return 0
      return Object.entries(map).reduce((max, [userId, seq]) => {
        return sameId(userId, useAuthStore().user?.userId) ? max : Math.max(max, seq)
      }, 0)
    },
  },

  actions: {
    savePrefs() {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ pinned: this.pinnedIds, muted: this.mutedIds }),
      )
    },

    togglePin(conversationId: string) {
      this.pinnedIds = this.pinnedIds.includes(conversationId)
        ? this.pinnedIds.filter((id) => id !== conversationId)
        : [...this.pinnedIds, conversationId]
      this.savePrefs()
    },

    toggleMute(conversationId: string) {
      this.mutedIds = this.mutedIds.includes(conversationId)
        ? this.mutedIds.filter((id) => id !== conversationId)
        : [...this.mutedIds, conversationId]
      this.savePrefs()
    },

    async loadCards() {
      this.loadingCards = true
      try {
        this.cards = await api.get<ConversationCard[]>('/conversations/cards')
        if (this.error === '加载会话失败') this.error = null
      } catch (e) {
        this.error = e instanceof Error ? e.message : '加载会话失败'
      } finally {
        this.loadingCards = false
      }
    },

    async open(conversationId: string) {
      this.activeId = conversationId
      this.error = null
      const card = this.cards.find((item) => item.conversationId === conversationId)

      const lastSeq = card?.lastSeq ?? 0
      const existing = this.messages[conversationId] ?? []
      const loadedSeq = existing.length ? existing[existing.length - 1]!.seq : -1
      if (!existing.length || loadedSeq < lastSeq) {
        await this.loadMessages(conversationId, Math.max(0, lastSeq - PAGE_SIZE))
      }

      await Promise.allSettled([
        this.markRead(conversationId),
        this.loadReceipts(conversationId),
      ])

      if (card && card.unreadCount > 0) card.unreadCount = 0
    },

    async loadMessages(conversationId: string, afterSeq: number) {
      this.loadingMessages = true
      this.error = null
      try {
        let cursor: string | number = afterSeq
        const collected: MessageView[] = []
        for (let i = 0; i < 5; i++) {
          const page: MessagePage = await api.get<MessagePage>(
            `/conversations/${conversationId}/messages?cursor=${cursor}&limit=100`,
          )
          collected.push(...page.messages.map(normalize))
          if (!page.hasMore || page.messages.length === 0 || page.nextCursor == null) break
          cursor = Number(page.nextCursor)
        }
        this.messages[conversationId] = dedupe(collected)
      } catch (e) {
        this.error = e instanceof Error ? e.message : '加载消息失败'
      } finally {
        this.loadingMessages = false
      }
    },

    async refreshMessages(conversationId: string) {
      const list = this.messages[conversationId] ?? []
      let cursor = list.length ? list[list.length - 1]!.seq : 0
      try {
        for (let i = 0; i < 3; i++) {
          const page: MessagePage = await api.get<MessagePage>(
            `/conversations/${conversationId}/messages?cursor=${cursor}&limit=100`,
          )
          if (!page.messages.length) break
          const merged = dedupe([...list, ...page.messages.map(normalize)])
          this.messages[conversationId] = merged
          if (!page.hasMore || page.nextCursor == null) break
          cursor = Number(page.nextCursor)
        }
      } catch {
        /* 轮询失败静默，等下一轮 */
      }
    },

    async loadReceipts(conversationId: string) {
      try {
        const list = await api.get<ReadReceipt[]>(
          `/conversations/${conversationId}/read-receipts`,
        )
        const map: Record<string, number> = {}
        for (const item of list) map[String(item.userId)] = item.readSequence
        this.receipts[conversationId] = map
      } catch {
        /* 已读回执失败不阻塞聊天 */
      }
    },

    /** 加载会话成员资料，用于群聊作者名和详情面板。 */
    async loadMembers(conversationId: string, force = false) {
      if (!force && this.members[conversationId]) return this.members[conversationId]
      const card = this.cards.find((item) => item.conversationId === conversationId)
      if (!card) return []
      try {
        let ids: Id[] = []
        let ownerId: Id = 0
        if (card.type === 'GROUP') {
          const group = await api.get<GroupDetail>(`/groups/${conversationId}`)
          ids = group.memberIds ?? []
          ownerId = group.ownerId
        } else {
          const detail = await api.get<{ memberIds: Id[] }>(
            `/conversations/${conversationId}`,
          )
          ids = detail.memberIds ?? []
        }

        const profiles = await Promise.all(
          ids.map((id) =>
            api
              .get<UserProfile>(`/users/${id}/profile`)
              .catch(() => ({ userId: id, nickname: `用户 ${id}` }) as UserProfile),
          ),
        )
        const members: ChatMember[] = profiles.map((profile) => ({
          userId: profile.userId,
          nickname: profile.nickname,
          avatar: profile.avatar,
          online: profile.online,
          role: ownerId && sameId(profile.userId, ownerId) ? '群主' : undefined,
        }))
        this.members[conversationId] = members
        return members
      } catch {
        return []
      }
    },

    async sendRaw(type: string, content: string, preview: string) {
      const conversationId = this.activeId
      if (!conversationId) throw new Error('没有选中的会话')
      const clientMessageId = `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      this.error = null
      try {
        // 后端返回 { message: {...}, duplicate }, 需取内层
        const resp = await api.post<{
          message: MessageView & { sequence?: number }
          duplicate: boolean
        }>(`/conversations/${conversationId}/messages`, {
          conversationId,
          clientMessageId,
          type,
          content,
        })
        const sent = normalize({ ...resp.message, clientMsgId: clientMessageId })
        const list = this.messages[conversationId] ?? (this.messages[conversationId] = [])
        if (!list.some((item) => sameId(item.messageId, sent.messageId))) {
          list.push(sent)
          list.sort((a, b) => a.seq - b.seq)
        }
        const card = this.cards.find((item) => item.conversationId === conversationId)
        if (card) {
          card.lastMessagePreview = preview
          card.lastMessageType = type
          card.lastMessageAt = sent.createdAt
          card.lastSeq = sent.seq
          card.lastReadSeq = sent.seq
        }
        return sent
      } catch (e) {
        this.error = e instanceof Error ? e.message : '发送失败'
        throw e
      }
    },

    async send(text: string) {
      const value = text.trim()
      if (!this.activeId || !value) return
      return this.sendRaw('TEXT', value, value)
    },

    /** 先上传文件，再以 IMAGE / FILE 消息发送。 */
    async sendAttachment(file: File) {
      if (!this.activeId) throw new Error('没有选中的会话')
      this.error = null
      const form = new FormData()
      form.append('file', file)
      form.append('conversationId', this.activeId)
      try {
        const uploaded = await api.upload<FileRow>('/files', form)
        const image = (file.type || uploaded.contentType || '').startsWith('image/')
        const content = JSON.stringify({
          fileId: uploaded.fileId,
          fileName: uploaded.name || file.name,
          sizeBytes: uploaded.sizeBytes,
          contentType: uploaded.contentType,
        })
        const preview = image ? '[图片]' : `[文件] ${uploaded.name || file.name}`
        return await this.sendRaw(image ? 'IMAGE' : 'FILE', content, preview)
      } catch (e) {
        this.error = e instanceof Error ? e.message : '上传失败'
        throw e
      }
    },

    async searchMessages(conversationId: string, keyword: string): Promise<MessageView[]> {
      const kw = keyword.trim()
      if (!kw) return []
      const page = await api.get<MessagePage>(
        `/conversations/${conversationId}/messages/search?keyword=${encodeURIComponent(kw)}&limit=50`,
      )
      return page.messages.map(normalize)
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

    async createPrivate(peerUserId: Id): Promise<string> {
      const created = await api.post<{ conversationId: string }>('/conversations', {
        peerUserId,
      })
      if (!this.cards.some((item) => item.conversationId === created.conversationId)) {
        await this.loadCards()
      }
      return created.conversationId
    },

    /**
     * 订阅服务端 SSE 实时事件：新消息到达即增量同步，断线自动重连。
     * 轮询保留为兜底（见 startPolling），长连接健康时降频为 30 秒一次全量同步。
     */
    startRealtime() {
      this.stopRealtime()
      const token = getToken()
      if (!token) return

      const controller = new AbortController()
      realtimeAbort = controller
      let retries = 0

      const connect = async (): Promise<void> => {
        try {
          const response = await fetch('/api/v1/events', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'text/event-stream',
            },
            signal: controller.signal,
          })
          if (response.status === 401) return
          if (!response.ok || !response.body) throw new Error(`realtime ${response.status}`)

          retries = 0
          this.realtimeConnected = true
          this.realtimeLastPing = Date.now()
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          while (!controller.signal.aborted) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
            let boundary = buffer.indexOf('\n\n')
            while (boundary >= 0) {
              this.handleRealtimeChunk(buffer.slice(0, boundary))
              buffer = buffer.slice(boundary + 2)
              boundary = buffer.indexOf('\n\n')
            }
          }
        } catch {
          /* 断线后走下面的重连 */
        } finally {
          this.realtimeConnected = false
          if (!controller.signal.aborted) {
            const delay = Math.min(1000 * 2 ** Math.min(retries, 4), 15000)
            retries += 1
            if (realtimeRetryTimer !== null) window.clearTimeout(realtimeRetryTimer)
            realtimeRetryTimer = window.setTimeout(() => {
              realtimeRetryTimer = null
              if (!controller.signal.aborted) void connect()
            }, delay)
          }
        }
      }

      if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = () => {
        if (document.visibilityState !== 'visible') return
        void this.loadCards()
        if (this.activeId) void this.refreshMessages(this.activeId)
      }
      document.addEventListener('visibilitychange', visibilityHandler)

      void connect()
    },

    stopRealtime() {
      if (realtimeRetryTimer !== null) {
        window.clearTimeout(realtimeRetryTimer)
        realtimeRetryTimer = null
      }
      if (visibilityHandler) {
        document.removeEventListener('visibilitychange', visibilityHandler)
        visibilityHandler = null
      }
      realtimeAbort?.abort()
      realtimeAbort = null
      this.realtimeConnected = false
    },

    handleRealtimeChunk(raw: string) {
      let eventName = 'message'
      const dataLines: string[] = []
      for (const line of raw.split('\n')) {
        if (line.startsWith(':')) continue
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      }
      this.realtimeLastPing = Date.now()
      if (eventName !== 'message' || !dataLines.length) return
      let conversationId = ''
      try {
        conversationId = String(
          (JSON.parse(dataLines.join('\n')) as { conversationId?: string }).conversationId ?? '',
        )
      } catch {
        return
      }
      if (!conversationId) return
      const sync = async () => {
        if (conversationId === this.activeId) {
          await this.refreshMessages(conversationId)
          await this.markRead(conversationId)
          await this.loadReceipts(conversationId)
        } else {
          await this.loadCards()
        }
        this.lastSync = Date.now()
      }
      void sync()
    },

    startPolling(intervalMs = 3000) {
      this.stopPolling()
      this.pollTimer = window.setInterval(async () => {
        const realtimeHealthy = this.realtimeConnected
          && Date.now() - this.realtimeLastPing < REALTIME_HEALTHY_MS
        if (realtimeHealthy && Date.now() - this.lastSync < BACKGROUND_SYNC_MS) return
        if (this.pollingBusy) return
        this.pollingBusy = true
        try {
          const activeBefore = this.activeId
          await this.loadCards()
          if (activeBefore && activeBefore === this.activeId) {
            await Promise.allSettled([
              this.refreshMessages(activeBefore),
              this.loadReceipts(activeBefore),
            ])
            const card = this.cards.find((item) => item.conversationId === activeBefore)
            if (card && card.unreadCount > 0) await this.markRead(activeBefore)
          }
          this.lastSync = Date.now()
        } finally {
          this.pollingBusy = false
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
      this.stopRealtime()
      this.cards = []
      this.messages = {}
      this.receipts = {}
      this.members = {}
      this.activeId = null
      this.error = null
    },
  },
})
