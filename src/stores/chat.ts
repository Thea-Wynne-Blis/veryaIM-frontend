import { defineStore } from 'pinia'
import {
  api,
  clearConversation,
  sameId,
  updateConversationPrefs,
  type ConversationCard,
  type Id,
  type MessagePage,
  type MessageView,
  type ReadReceipt,
  type UserProfile,
} from '../api/client'
import { groupsApi } from '../api/groups'
import type { RealtimeFrame } from '../api/realtime'
import { messageOf } from '../utils/error'
import { useAuthStore } from './auth'
import {
  MEMBERS_TTL_MS,
  PAGE_SIZE,
  PREFS_KEY,
  dedupe,
  fetchMessagePages,
  loadPrefs,
  normalize,
  type ChatMember,
  type RealtimePayload,
  type State,
  type UploadTask,
} from './chat/helpers'
import {
  applyMessage,
  handleFrame,
  markReadThrottled,
  scheduleRefresh,
  startPolling,
  startRealtime,
  stopPolling,
  stopRealtime,
} from './chat/realtime'
import {
  cancelUpload,
  dropUpload,
  resetUploads,
  sendAttachment,
} from './chat/upload'

// 组件一直从 store 入口导入这两个类型，保持原路径不变。
export type { ChatMember, UploadTask }

/** 发送成功后同步会话卡片：预览、序号与本人已读水位一起前进。 */
function markCardSent(
  card: ConversationCard | undefined,
  type: string,
  preview: string,
  sent: MessageView,
  senderId: Id,
): void {
  if (!card) return
  card.lastMessagePreview = preview
  card.lastMessageType = type
  card.lastMessageAt = sent.createdAt
  card.lastSeq = sent.seq
  card.lastReadSeq = sent.seq
  card.lastMessageSenderId = senderId
  card.lastMessageSenderName = null
  // 从通讯录打开「不显示」的会话并发出消息后，会话回到聊天列表
  card.hidden = false
}

export const useChatStore = defineStore('chat', {
  state: (): State => {
    const prefs = loadPrefs()
    return {
      cards: [],
      messages: {},
      receipts: {},
      members: {},
      membersLoadedAt: {},
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

    /** 「不显示」：本次从列表移开；重新打开会话或收到新消息后会恢复显示。 */
    async hideConversation(conversationId: string) {
      const card = this.cards.find((item) => item.conversationId === conversationId)
      if (card) card.hidden = true
      try {
        await updateConversationPrefs(conversationId, { hidden: true })
      } catch (e) {
        if (card) card.hidden = false
        this.error = messageOf(e, '操作失败')
        throw e
      }
    },

    /** 「不显示」只是本次从列表移开：重新打开会话就恢复显示。 */
    async restoreConversation(conversationId: string) {
      const card = this.cards.find((item) => item.conversationId === conversationId)
      if (!card?.hidden) return
      card.hidden = false
      try {
        await updateConversationPrefs(conversationId, { hidden: false })
      } catch (e) {
        card.hidden = true
        this.error = messageOf(e, '恢复会话显示失败')
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
        this.error = messageOf(e, '操作失败')
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

    /**
     * 好友备注改完了：先把列表里对应单聊的标题就地改掉，界面立刻跟手；
     * 再拉一次卡片，清空备注时用真实昵称兜底。
     */
    renameFriend(userId: Id, remark: string | null) {
      const title = (remark ?? '').trim()
      if (title) {
        for (const card of this.cards) {
          if (card.type === 'PRIVATE' && sameId(card.peerUserId ?? '', userId)) {
            card.title = title
          }
        }
      }
      void this.loadCards()
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
        this.error = messageOf(e, '操作失败')
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
        this.error = messageOf(e, '加载会话失败')
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
        // 从通讯录/搜索重新打开「不显示」的会话时，让它回到聊天列表
        this.restoreConversation(conversationId),
      ])

      if (card && card.unreadCount > 0) card.unreadCount = 0
    },

    async loadMessages(conversationId: string, afterSeq: number) {
      this.loadingMessages = true
      this.error = null
      try {
        const collected = await fetchMessagePages(conversationId, afterSeq, 5)
        const pending = (this.messages[conversationId] ?? []).filter((item) => item.pending)
        this.messages[conversationId] = [...dedupe(collected), ...pending]
      } catch (e) {
        this.error = messageOf(e, '加载消息失败')
      } finally {
        this.loadingMessages = false
      }
    },

    async refreshMessages(conversationId: string) {
      const all = this.messages[conversationId] ?? []
      const pending = all.filter((item) => item.pending)
      const list = all.filter((item) => !item.pending)
      const cursor = list.length ? list[list.length - 1]!.seq : 0
      try {
        const fresh = await fetchMessagePages(conversationId, cursor, 3)
        if (fresh.length) {
          this.messages[conversationId] = [...dedupe([...list, ...fresh]), ...pending]
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

    /**
     * 在线状态是短周期数据，用 TTL 控制刷新节奏：
     * 实时重连、切回页面、后台同步都走这里，避免短时间内重复拉同一个群的成员。
     */
    refreshMembersIfStale(conversationId: string, minAgeMs = MEMBERS_TTL_MS) {
      const loadedAt = this.membersLoadedAt[conversationId] ?? 0
      if (Date.now() - loadedAt < minAgeMs) return
      void this.loadMembers(conversationId, true)
    },

    /** 加载会话成员资料，用于群聊作者名和详情面板。 */
    async loadMembers(conversationId: string, force = false) {
      const cached = this.members[conversationId]
      const loadedAt = this.membersLoadedAt[conversationId] ?? 0
      // 在线状态会变，成员资料不能永久缓存：超过 TTL 就重新拉一次。
      if (!force && cached && Date.now() - loadedAt < MEMBERS_TTL_MS) return cached
      const card = this.cards.find((item) => item.conversationId === conversationId)
      if (!card) return []
      try {
        // 群成员一次取回昵称、角色与在线状态：此前是「群详情 + N 个 profile」，
        // 一个 50 人群打开详情要发 51 个请求，是群管理卡顿的主要来源。
        if (card.type === 'GROUP') {
          const list = await groupsApi.members(conversationId)
          const members: ChatMember[] = list.map((member) => ({
            userId: member.userId,
            nickname: member.nickname,
            remark: member.remark ?? null,
            avatar: member.avatar,
            online: member.online,
            role:
              member.role === 'OWNER'
                ? '群主'
                : member.role === 'ADMIN'
                  ? '管理员'
                  : undefined,
          }))
          this.members[conversationId] = members
          this.membersLoadedAt[conversationId] = Date.now()
          return members
        }

        const detail = await api.get<{ memberIds: Id[] }>(
          `/conversations/${conversationId}`,
        )
        const profiles = await Promise.all(
          (detail.memberIds ?? []).map((id) =>
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
        }))
        this.members[conversationId] = members
        this.membersLoadedAt[conversationId] = Date.now()
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
        markCardSent(card, type, preview, sent, this.myId)
        return sent
      } catch (e) {
        this.messages[conversationId] = (this.messages[conversationId] ?? [])
          .filter((item) => !(item.pending && item.clientMsgId === clientMessageId))
        this.error = messageOf(e, '发送失败')
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
      markCardSent(card, type, preview, sent, this.myId)
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

    /** 附件上传的实现在 ./chat/upload.ts，这里只做转发。 */
    sendAttachment(file: File) {
      return sendAttachment(this, file)
    },

    dropUpload(taskId: string) {
      dropUpload(this, taskId)
    },

    cancelUpload(taskId: string) {
      cancelUpload(this, taskId)
    },


    async loadMessageContext(conversationId: string, messageId: string) {
      const page = await api.get<MessagePage>(
        `/conversations/${conversationId}/messages/${messageId}/context`,
      )
      this.applyMessageContext(conversationId, page.messages)
    },

    applyMessageContext(conversationId: string, messages: MessageView[]) {
      this.messages[conversationId] = dedupe([
        ...messages.map(normalize), ...(this.messages[conversationId] ?? []),
      ])
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

    /* 实时连接、推送落地与轮询的实现都在 ./chat/realtime.ts，动作签名保持不变。 */
    startRealtime() {
      startRealtime(this)
    },

    stopRealtime() {
      stopRealtime(this)
    },

    handleRealtimeFrame(frame: RealtimeFrame) {
      handleFrame(this, frame)
    },

    applyRealtimeMessage(payload: RealtimePayload) {
      applyMessage(this, payload)
    },

    scheduleRealtimeRefresh(conversationId: string) {
      scheduleRefresh(this, conversationId)
    },

    markReadThrottled(conversationId: string) {
      markReadThrottled(this, conversationId)
    },

    startPolling(intervalMs = 3000) {
      startPolling(this, intervalMs)
    },

    stopPolling() {
      stopPolling(this)
    },

    reset() {
      this.stopPolling()
      this.stopRealtime()
      resetUploads(this)
      this.cards = []
      this.messages = {}
      this.receipts = {}
      this.members = {}
      this.membersLoadedAt = {}
      this.activeId = null
      this.error = null
    },
  },
})
