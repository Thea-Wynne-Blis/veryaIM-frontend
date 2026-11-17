import { defineStore } from 'pinia'
import {
  ApiError,
  api,
  clearConversation,
  getToken,
  sameId,
  seedFilePreview,
  updateConversationPrefs,
  uploadFile,
  type ConversationCard,
  type GroupDetail,
  type Id,
  type MessagePage,
  type MessageView,
  type ReadReceipt,
  type UserProfile,
} from '../api/client'
import { audioDurationOf, imageSizeOf, mediaKindOf, videoMetaOf } from '../utils/media'
import { useAuthStore } from './auth'

const PAGE_SIZE = 60
const PREFS_KEY = 'veryal.chatPrefs'
const REALTIME_HEALTHY_MS = 45_000
const BACKGROUND_SYNC_MS = 60_000
const REALTIME_COALESCE_MS = 120
const MARK_READ_THROTTLE_MS = 1000

let realtimeAbort: AbortController | null = null
let realtimeRetryTimer: number | null = null
let visibilityHandler: (() => void) | null = null
const realtimeCoalesceTimers = new Map<string, number>()
const lastMarkReadAt = new Map<string, number>()

type RealtimePayload = {
  kind?: string
  conversationId?: string
  messageId?: string | null
  seq?: number
  senderId?: string
  clientMsgId?: string | null
  messageType?: string | null
  content?: string | null
  contentEncoding?: string | null
  createdAt?: string | null
  replyToId?: string | null
  replySenderId?: string | null
  replyPreview?: string | null
}

function previewOf(payload: RealtimePayload): string {
  if (payload.messageType === 'IMAGE') return '[图片]'
  if (payload.messageType === 'VIDEO') return '[视频]'
  if (payload.messageType === 'AUDIO') return '[语音]'
  if (payload.messageType === 'FILE') return '[文件]'
  return payload.content ?? ''
}

export type ChatMember = {
  userId: Id
  nickname: string
  avatar?: string | null
  online?: boolean
  role?: string
}

/** 上传统计：准备 / 上传 / 发送，供输入区渲染进度条。 */
export type UploadTask = {
  id: string
  conversationId: string
  name: string
  sizeBytes: number
  /** 0~1 的字节传输进度 */
  progress: number
  /** prepare：客户端生成封面/读时长；upload：传输字节；send：等服务端确认 */
  phase: 'prepare' | 'upload' | 'send'
  /** 附件类型，决定进度条缩略图与提示文案 */
  kind?: 'image' | 'gif' | 'video' | 'audio' | 'file'
  /** 图片/视频封面本地预览（object URL，任务结束时 revoke） */
  previewUrl?: string
  width?: number
  height?: number
  /** 视频/音频时长（秒） */
  duration?: number
}

/** AbortController 不能进 Pinia state，放模块级 Map。 */
const uploadControllers = new Map<string, AbortController>()

/** 超过这个大小的图片不再把本地预览塞进缓存，避免几十张原图把内存顶爆。 */
const SEED_PREVIEW_MAX_BYTES = 3 * 1024 * 1024

/** `a/b.mp4` → `a/b`（封面文件命名用）。 */
function baseNameOf(name: string): string {
  const slash = name.lastIndexOf('/')
  const base = slash >= 0 ? name.slice(slash + 1) : name
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

type Prefs = { pinned: string[]; muted: string[]; hidden: Record<string, string[]> }

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { pinned: [], muted: [], hidden: {} }
    const parsed = JSON.parse(raw) as Partial<Prefs>
    return {
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
      muted: Array.isArray(parsed.muted) ? parsed.muted : [],
      hidden:
        parsed.hidden && typeof parsed.hidden === 'object' && !Array.isArray(parsed.hidden)
          ? parsed.hidden
          : {},
    }
  } catch {
    return { pinned: [], muted: [], hidden: {} }
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
  /** 仅本机删除（服务端无删除接口），按会话记录被隐藏的消息 id */
  hiddenIds: Record<string, string[]>
  /** 正在上传/发送的附件任务 */
  uploads: UploadTask[]
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
      hiddenIds: prefs.hidden,
      uploads: [],
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
      const list = state.activeId ? state.messages[state.activeId] ?? [] : []
      const hidden = state.activeId ? state.hiddenIds[state.activeId] ?? [] : []
      const visible = hidden.length
        ? list.filter((item) => item.pending || !hidden.includes(String(item.messageId)))
        : list
      if (!visible.some((item) => item.pending)) return visible
      // 发送中的占位消息固定排在末尾，避免 seq=0 把顺序打乱
      return [
        ...visible.filter((item) => !item.pending),
        ...visible.filter((item) => item.pending),
      ]
    },
    totalUnread(state): number {
      return state.cards.reduce((sum, item) => sum + item.unreadCount, 0)
    },
    /** 会话列表：跳过自己设为「不显示」的会话（新消息到达时服务端会把它带回）。 */
    visibleCards(state): ConversationCard[] {
      return state.cards.filter((item) => !item.hidden)
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
        JSON.stringify({
          pinned: this.pinnedIds,
          muted: this.mutedIds,
          hidden: this.hiddenIds,
        }),
      )
    },

    /** 本机删除单条消息（服务端仍保留，重新登录或清缓存后可见）。 */
    hideMessage(conversationId: string, messageId: string) {
      const list = this.hiddenIds[conversationId] ?? (this.hiddenIds[conversationId] = [])
      const key = String(messageId)
      if (!list.includes(key)) list.push(key)
      this.savePrefs()
    },

    /** 置顶 / 免打扰 / 不显示：写服务端，本地先乐观更新，失败回滚。 */
    async setPinned(conversationId: string, pinned: boolean) {
      await this.applyPrefs(conversationId, { pinned }, () => {
        this.pinnedIds = pinned
          ? [...new Set([...this.pinnedIds, conversationId])]
          : this.pinnedIds.filter((id) => id !== conversationId)
      }, () => {
        this.pinnedIds = !pinned
          ? [...new Set([...this.pinnedIds, conversationId])]
          : this.pinnedIds.filter((id) => id !== conversationId)
      })
    },

    async setMuted(conversationId: string, muted: boolean) {
      await this.applyPrefs(conversationId, { muted }, () => {
        this.mutedIds = muted
          ? [...new Set([...this.mutedIds, conversationId])]
          : this.mutedIds.filter((id) => id !== conversationId)
      }, () => {
        this.mutedIds = !muted
          ? [...new Set([...this.mutedIds, conversationId])]
          : this.mutedIds.filter((id) => id !== conversationId)
      })
    },

    /** 「不显示」：从列表里移除，收到新消息后会由服务端重新带回。 */
    async hideConversation(conversationId: string) {
      const card = this.cards.find((item) => item.conversationId === conversationId)
      if (card) card.hidden = true
      try {
        await updateConversationPrefs(conversationId, { hidden: true })
      } catch (e) {
        if (card) card.hidden = false
        this.error = e instanceof Error ? e.message : '操作失败'
        throw e
      }
    },

    /** 标为未读：服务端记标记，本地立刻把未读数顶到 1。 */
    async markUnread(conversationId: string) {
      const card = this.cards.find((item) => item.conversationId === conversationId)
      const previous = card?.unreadCount ?? 0
      if (card) card.unreadCount = Math.max(1, previous)
      try {
        await updateConversationPrefs(conversationId, { unread: true })
      } catch (e) {
        if (card) card.unreadCount = previous
        this.error = e instanceof Error ? e.message : '操作失败'
        throw e
      }
    },

    /**
     * 删除聊天记录：只清空自己这边，对方不受影响。
     * 服务端抬高本人可见水位并设为不显示，本地同步清掉消息缓存。
     */
    async deleteConversation(conversationId: string) {
      await clearConversation(conversationId)
      delete this.messages[conversationId]
      const card = this.cards.find((item) => item.conversationId === conversationId)
      if (card) {
        card.hidden = true
        card.pinned = false
        card.unreadCount = 0
        card.lastMessagePreview = ''
      }
      this.pinnedIds = this.pinnedIds.filter((id) => id !== conversationId)
      if (this.activeId === conversationId) this.activeId = null
    },

    async applyPrefs(
      conversationId: string,
      prefs: { pinned?: boolean; muted?: boolean; hidden?: boolean },
      apply: () => void,
      rollback: () => void,
    ) {
      apply()
      const card = this.cards.find((item) => item.conversationId === conversationId)
      const previousCard = card
        ? { pinned: card.pinned, muted: card.muted, hidden: card.hidden }
        : null
      if (card) {
        if (prefs.pinned !== undefined) card.pinned = prefs.pinned
        if (prefs.muted !== undefined) card.muted = prefs.muted
        if (prefs.hidden !== undefined) card.hidden = prefs.hidden
      }
      try {
        await updateConversationPrefs(conversationId, prefs)
        this.savePrefs()
      } catch (e) {
        rollback()
        if (card && previousCard) {
          card.pinned = previousCard.pinned
          card.muted = previousCard.muted
          card.hidden = previousCard.hidden
        }
        this.error = e instanceof Error ? e.message : '操作失败'
        throw e
      }
    },

    /** 快捷方式：详情面板的置顶 / 免打扰按钮。 */
    togglePin(conversationId: string) {
      void this.setPinned(conversationId, !this.pinnedIds.includes(conversationId))
    },

    toggleMute(conversationId: string) {
      void this.setMuted(conversationId, !this.mutedIds.includes(conversationId))
    },

    async loadCards() {
      this.loadingCards = true
      try {
        this.cards = await api.get<ConversationCard[]>('/conversations/cards')
        // 置顶 / 免打扰以服务端为准，换设备登录也能保持一致。
        this.pinnedIds = this.cards.filter((item) => item.pinned).map((item) => item.conversationId)
        this.mutedIds = this.cards.filter((item) => item.muted).map((item) => item.conversationId)
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
      const existing = (this.messages[conversationId] ?? []).filter((item) => !item.pending)
      if (!existing.length) {
        // 首次打开：拉最近一页，显示骨架
        await this.loadMessages(conversationId, Math.max(0, lastSeq - PAGE_SIZE))
      } else if (lastSeq > existing[existing.length - 1]!.seq) {
        // 有缓存：只补离开期间的新消息，不整页重拉、也不切加载态
        void this.refreshMessages(conversationId)
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
        const pending = (this.messages[conversationId] ?? []).filter((item) => item.pending)
        this.messages[conversationId] = [...dedupe(collected), ...pending]
      } catch (e) {
        this.error = e instanceof Error ? e.message : '加载消息失败'
      } finally {
        this.loadingMessages = false
      }
    },

    async refreshMessages(conversationId: string) {
      const all = this.messages[conversationId] ?? []
      const pending = all.filter((item) => item.pending)
      const list = all.filter((item) => !item.pending)
      let cursor = list.length ? list[list.length - 1]!.seq : 0
      try {
        for (let i = 0; i < 3; i++) {
          const page: MessagePage = await api.get<MessagePage>(
            `/conversations/${conversationId}/messages?cursor=${cursor}&limit=100`,
          )
          if (!page.messages.length) break
          const merged = dedupe([...list, ...page.messages.map(normalize)])
          this.messages[conversationId] = [...merged, ...pending]
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

    /** 引用信息：只带原消息 id；发送者和原文快照由服务端回查后写入。 */
    async sendRaw(
      type: string,
      content: string,
      preview: string,
      targetId?: string,
      reply?: { messageId: string; senderId: string; preview: string } | null,
    ) {
      const conversationId = targetId ?? this.activeId
      if (!conversationId) throw new Error('没有选中的会话')
      const clientMessageId = `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      this.error = null
      // 乐观渲染：先插入占位消息，发送方无需等待服务端往返
      const optimistic: MessageView = {
        messageId: clientMessageId,
        conversationId,
        senderId: this.myId,
        clientMsgId: clientMessageId,
        seq: 0,
        type,
        content,
        contentEncoding: type === 'TEXT' ? 'utf8' : 'base64',
        createdAt: new Date().toISOString(),
        replyToId: reply?.messageId ?? null,
        replySenderId: reply?.senderId ?? null,
        replyPreview: reply?.preview ?? null,
        pending: true,
      }
      const optimisticList = this.messages[conversationId]
        ?? (this.messages[conversationId] = [])
      optimisticList.push(optimistic)
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
          ...(reply?.messageId ? { replyToId: reply.messageId } : {}),
        })
        const sent = normalize({ ...resp.message, clientMsgId: clientMessageId })
        const list = this.messages[conversationId] ?? (this.messages[conversationId] = [])
        // 原地确认乐观占位：数组里始终留着这条消息，列表节点不会被销毁重建
        // （否则气泡会先消失再重新播放入场动画，看起来“卡一下”）
        const placeholder = list.find((item) => item.clientMsgId === clientMessageId)
        if (placeholder) {
          Object.assign(placeholder, sent)
          placeholder.pending = false
          list.sort((a, b) => a.seq - b.seq)
        } else if (!list.some((item) => sameId(item.messageId, sent.messageId))) {
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
        this.messages[conversationId] = (this.messages[conversationId] ?? [])
          .filter((item) => !(item.pending && item.clientMsgId === clientMessageId))
        this.error = e instanceof Error ? e.message : '发送失败'
        throw e
      }
    },

    async send(text: string, reply?: { messageId: string; senderId: string; preview: string } | null) {
      const value = text.trim()
      if (!this.activeId || !value) return
      return this.sendRaw('TEXT', value, value, undefined, reply)
    },

    /**
     * 转发：把原消息的 type + 原始 content 再发到目标会话。
     * 后端没有独立转发接口，复用发送消息（幂等由新的 clientMessageId 保证）。
     * 附件消息会携带原 fileId，后端只允许引用发送者自己的文件，
     * 因此转发别人的图片/文件会失败，调用方需先拦截。
     */
    async forwardMessage(
      conversationId: string,
      type: string,
      content: string,
      preview: string,
    ) {
      const clientMessageId = `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
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
      const list = this.messages[conversationId]
      if (list && !list.some((item) => sameId(item.messageId, sent.messageId))) {
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
    },

    /** 撤回：仅发送者本人、2 分钟窗口内，服务端保留占位。 */
    async recallMessage(conversationId: string, messageId: string) {
      const resp = await api.post<MessageView>(
        `/conversations/${conversationId}/messages/${messageId}/recall`,
      )
      const list = this.messages[conversationId]
      const target = list?.find((item) => sameId(item.messageId, messageId))
      if (target) {
        target.recalled = true
        target.recalledAt = resp?.recalledAt ?? new Date().toISOString()
      }
      const card = this.cards.find((item) => item.conversationId === conversationId)
      if (card && target && card.lastSeq === target.seq) {
        card.lastMessagePreview = '[消息已撤回]'
      }
      return resp
    },

    /**
     * 上传附件并以对应消息类型发送：图片 / GIF → IMAGE，视频 → VIDEO，
     * 音频 → AUDIO，其余 → FILE。
     *
     * <p>上传走 XHR 以回报字节进度（fetch 没有上传进度事件），超过 8MB 自动分片；
     * 任务同时写进 `uploads`，由输入区渲染细线进度条，可中途取消。</p>
     *
     * <p>视频的宽高、时长与封面全部在客户端生成：服务端没有 ffmpeg。
     * 封面作为独立图片文件上传，通过 {@code coverFileId} 挂在视频消息上。</p>
     */
    async sendAttachment(file: File) {
      const conversationId = this.activeId
      if (!conversationId) throw new Error('没有选中的会话')
      this.error = null

      const kind = await mediaKindOf(file)
      const isImage = kind === 'image' || kind === 'gif'
      const taskId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const controller = new AbortController()
      uploadControllers.set(taskId, controller)

      const task: UploadTask = {
        id: taskId,
        conversationId,
        name: file.name,
        sizeBytes: file.size,
        progress: 0,
        phase: kind === 'video' ? 'prepare' : 'upload',
        kind,
        previewUrl: isImage ? URL.createObjectURL(file) : undefined,
      }
      this.uploads.push(task)
      // 从 state 里取回响应式代理，否则直接改进度不会触发视图更新
      const live = this.uploads[this.uploads.length - 1]!

      let width: number | undefined
      let height: number | undefined
      let duration = 0
      let coverFileId: Id | undefined

      try {
        if (isImage) {
          const size = await imageSizeOf(file)
          if (size) {
            width = size.width
            height = size.height
            live.width = width
            live.height = height
          }
        } else if (kind === 'video') {
          const meta = await videoMetaOf(file)
          if (meta) {
            width = meta.width || undefined
            height = meta.height || undefined
            duration = meta.duration
            live.width = width
            live.height = height
            live.duration = duration
          }
          if (meta?.poster) {
            live.previewUrl = URL.createObjectURL(meta.poster)
            try {
              const cover = await uploadFile(
                new File([meta.poster], `${baseNameOf(file.name)}-cover.jpg`,
                  { type: 'image/jpeg' }),
                conversationId,
                { signal: controller.signal },
              )
              coverFileId = cover.fileId
              // 封面已经在本机，直接塞进缓存，气泡不必再回源
              seedFilePreview(cover.fileId, URL.createObjectURL(meta.poster))
            } catch (e) {
              if (e instanceof ApiError && e.code === -2) throw e
              // 封面失败不影响视频本身，气泡会回退到深色占位
            }
          }
          live.phase = 'upload'
        } else if (kind === 'audio') {
          duration = await audioDurationOf(file)
          live.duration = duration
        }

        const uploaded = await uploadFile(file, conversationId, {
          signal: controller.signal,
          onProgress: (ratio) => {
            live.progress = ratio
          },
        })

        const payload: Record<string, unknown> = {
          fileId: uploaded.fileId,
          fileName: uploaded.name || file.name,
          sizeBytes: uploaded.sizeBytes,
          contentType: uploaded.contentType || file.type,
        }
        if (width && height) {
          payload.width = width
          payload.height = height
        }
        if (duration > 0) {
          payload.durationSeconds = Math.max(1, Math.round(duration))
        }
        if (coverFileId) {
          payload.coverFileId = coverFileId
        }

        live.phase = 'send'
        live.progress = 1
        // 自己刚传的图片：把本地预览塞进缓存，气泡立即显示，不必等服务端缩略图
        if (isImage && live.previewUrl && file.size <= SEED_PREVIEW_MAX_BYTES) {
          seedFilePreview(uploaded.fileId, live.previewUrl)
          live.previewUrl = undefined
        }

        const type = kind === 'video'
          ? 'VIDEO'
          : kind === 'audio'
            ? 'AUDIO'
            : isImage
              ? 'IMAGE'
              : 'FILE'
        const preview = kind === 'video'
          ? '[视频]'
          : kind === 'audio'
            ? '[语音]'
            : isImage
              ? '[图片]'
              : `[文件] ${uploaded.name || file.name}`
        return await this.sendRaw(type, JSON.stringify(payload), preview, conversationId)
      } catch (e) {
        // code -2 = 用户取消，不当作错误提示
        const cancelled = e instanceof ApiError && e.code === -2
        if (!cancelled) {
          this.error = e instanceof Error ? e.message : '上传失败'
        }
        throw e
      } finally {
        uploadControllers.delete(taskId)
        this.dropUpload(taskId)
      }
    },

    /** 移除上传任务并释放本地预览 URL。 */
    dropUpload(taskId: string) {
      const index = this.uploads.findIndex((item) => item.id === taskId)
      if (index < 0) return
      const [removed] = this.uploads.splice(index, 1)
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
    },

    /** 取消上传/发送中的附件任务。 */
    cancelUpload(taskId: string) {
      uploadControllers.get(taskId)?.abort()
      uploadControllers.delete(taskId)
      this.dropUpload(taskId)
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
      realtimeCoalesceTimers.forEach((timer) => window.clearTimeout(timer))
      realtimeCoalesceTimers.clear()
      lastMarkReadAt.clear()
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
      let payload: RealtimePayload
      try {
        payload = JSON.parse(dataLines.join('\n')) as RealtimePayload
      } catch {
        return
      }
      const conversationId = payload.conversationId
      if (!conversationId) return

      // 大群只推游标：合并窗口内拉一次增量，避免每条事件一次请求
      if (payload.kind === 'cursor' || !payload.messageId) {
        this.scheduleRealtimeRefresh(conversationId)
        return
      }
      this.applyRealtimeMessage(payload)
    },

    /** 推送已带消息体：直接落地，不再回查消息接口。 */
    applyRealtimeMessage(payload: RealtimePayload) {
      const conversationId = String(payload.conversationId)
      const messageId = String(payload.messageId)
      const clientMsgId = payload.clientMsgId ?? undefined
      const mine = sameId(payload.senderId ?? '', this.myId)
      const list = this.messages[conversationId] ?? (this.messages[conversationId] = [])
      const existing = list.find(
        (item) =>
          sameId(item.messageId, messageId)
          || (!!clientMsgId && item.clientMsgId === clientMsgId),
      )
      if (!existing) {
        const view = normalize({
          messageId,
          conversationId,
          senderId: payload.senderId ?? '',
          clientMsgId,
          seq: payload.seq ?? 0,
          type: payload.messageType ?? 'TEXT',
          content: payload.content ?? '',
          contentEncoding: payload.contentEncoding ?? undefined,
          createdAt: payload.createdAt ?? new Date().toISOString(),
          replyToId: payload.replyToId ?? null,
          replySenderId: payload.replySenderId ?? null,
          replyPreview: payload.replyPreview ?? null,
        })
        list.push(view)
        list.sort((a, b) => a.seq - b.seq)
      } else if (existing.pending) {
        // 推送先于发送响应到达：直接把乐观占位升级成服务端消息，
        // 不要先删掉再插入，否则这条气泡会闪一下（节点重建会重播入场动画）。
        existing.messageId = messageId
        existing.seq = payload.seq ?? existing.seq
        existing.senderId = payload.senderId ?? existing.senderId
        existing.type = payload.messageType ?? existing.type
        existing.content = payload.content ?? existing.content
        existing.contentEncoding = payload.contentEncoding ?? existing.contentEncoding
        existing.createdAt = payload.createdAt ?? existing.createdAt
        existing.replyToId = payload.replyToId ?? existing.replyToId
        existing.replySenderId = payload.replySenderId ?? existing.replySenderId
        existing.replyPreview = payload.replyPreview ?? existing.replyPreview
        existing.clientMsgId = existing.clientMsgId ?? clientMsgId ?? undefined
        existing.pending = false
        list.sort((a, b) => a.seq - b.seq)
      }

      const card = this.cards.find((item) => item.conversationId === conversationId)
      if (card) {
        if ((payload.seq ?? 0) > card.lastSeq) {
          card.lastSeq = payload.seq ?? card.lastSeq
          card.lastMessageAt = payload.createdAt ?? card.lastMessageAt
          card.lastMessageType = payload.messageType ?? card.lastMessageType
          card.lastMessagePreview = previewOf(payload)
          // 新消息比「不显示」的时间更晚：会话重新出现，与服务端卡片接口的判定一致。
          card.hidden = false
        }
        if (conversationId === this.activeId) {
          card.unreadCount = 0
        } else if (!mine) {
          card.unreadCount = (card.unreadCount ?? 0) + 1
        }
      } else {
        // 新会话（首次私聊/被拉群）：卡片信息不在本地，拉一次列表
        void this.loadCards()
      }

      this.lastSync = Date.now()
      if (conversationId === this.activeId) {
        this.markReadThrottled(conversationId)
        void this.loadReceipts(conversationId)
      }
    },

    /** 游标事件合并：120ms 窗口内同一会话只处理一次。 */
    scheduleRealtimeRefresh(conversationId: string) {
      const existing = realtimeCoalesceTimers.get(conversationId)
      if (existing !== undefined) window.clearTimeout(existing)
      const timer = window.setTimeout(() => {
        realtimeCoalesceTimers.delete(conversationId)
        void (async () => {
          if (conversationId === this.activeId) {
            await this.refreshMessages(conversationId)
            this.markReadThrottled(conversationId)
            void this.loadReceipts(conversationId)
          } else {
            await this.loadCards()
          }
          this.lastSync = Date.now()
        })()
      }, REALTIME_COALESCE_MS)
      realtimeCoalesceTimers.set(conversationId, timer)
    },

    /** 已读上报节流：高频群聊下避免每条消息一次写库。 */
    markReadThrottled(conversationId: string) {
      const now = Date.now()
      const last = lastMarkReadAt.get(conversationId) ?? 0
      if (now - last < MARK_READ_THROTTLE_MS) return
      lastMarkReadAt.set(conversationId, now)
      void this.markRead(conversationId)
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
      for (const controller of uploadControllers.values()) controller.abort()
      uploadControllers.clear()
      for (const task of this.uploads) {
        if (task.previewUrl) URL.revokeObjectURL(task.previewUrl)
      }
      this.uploads = []
      this.cards = []
      this.messages = {}
      this.receipts = {}
      this.members = {}
      this.activeId = null
      this.error = null
    },
  },
})
