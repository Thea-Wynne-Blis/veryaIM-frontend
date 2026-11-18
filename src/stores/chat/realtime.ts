import { getToken, sameId, type Id } from '../../api/client'
import { RealtimeClient, type RealtimeFrame } from '../../api/realtime'
import {
  BACKGROUND_SYNC_MS,
  MARK_READ_THROTTLE_MS,
  REALTIME_COALESCE_MS,
  REALTIME_HEALTHY_MS,
  normalize,
  previewOf,
  type RealtimePayload,
  type State,
} from './helpers'

/**
 * 实时模块对 store 的最小依赖。
 *
 * 只声明用到的字段与方法，避免 `ReturnType<typeof useChatStore>` 造成的类型环。
 */
export interface RealtimeHost extends State {
  myId: Id
  loadCards(): Promise<void>
  refreshMessages(conversationId: string): Promise<void>
  loadReceipts(conversationId: string): Promise<void>
  refreshMembersIfStale(conversationId: string, minAgeMs?: number): void
  markRead(conversationId: string): Promise<void>
  markReadThrottled(conversationId: string): void
}

let realtimeClient: RealtimeClient | null = null
let visibilityHandler: (() => void) | null = null
const coalesceTimers = new Map<string, number>()
const lastMarkReadAt = new Map<string, number>()

/**
 * 订阅 Netty WebSocket 实时事件：先 HTTP 换一次性 ticket，再建立长连接。
 * 轮询保留为兜底（见 startPolling），长连接健康时降频为 60 秒一次全量同步。
 */
export function startRealtime(host: RealtimeHost) {
  stopRealtime(host)
  if (!getToken()) return

  const client = new RealtimeClient({
    onStateChange: (connected) => {
      host.realtimeConnected = connected
      // 刚连上实时通道时强制补拉一次成员：登录瞬间服务端可能还没写在线状态，
      // 走默认 TTL 会命中旧缓存，详情面板的「在线」就一直停留在 0。
      if (connected && host.activeId) host.refreshMembersIfStale(host.activeId, 0)
    },
    onError: () => {
      /* 换票失败也会自动重试，不打断轮询兜底 */
    },
    onTerminated: () => {
      // 服务端已终止会话（登出/封禁/设备下线）：回到登录页，不再重连。
      stopRealtime(host)
      window.dispatchEvent(new CustomEvent('veryal:unauthorized'))
    },
    onFrame: (frame) => handleFrame(host, frame),
  })
  realtimeClient = client
  client.start()

  if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler)
  visibilityHandler = () => {
    if (document.visibilityState !== 'visible') return
    void host.loadCards()
    if (host.activeId) {
      void host.refreshMessages(host.activeId)
      host.refreshMembersIfStale(host.activeId)
    }
  }
  document.addEventListener('visibilitychange', visibilityHandler)
}

export function stopRealtime(host: RealtimeHost) {
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler)
    visibilityHandler = null
  }
  realtimeClient?.close()
  realtimeClient = null
  coalesceTimers.forEach((timer) => window.clearTimeout(timer))
  coalesceTimers.clear()
  lastMarkReadAt.clear()
  host.realtimeConnected = false
}

export function handleFrame(host: RealtimeHost, frame: RealtimeFrame) {
  host.realtimeLastPing = Date.now()
  if (frame.cmd !== 'message' || !frame.data) return
  const payload = frame.data as RealtimePayload
  const conversationId = payload.conversationId
  if (!conversationId) return

  // 大群只推游标：合并窗口内拉一次增量，避免每条事件一次请求
  if (payload.kind === 'cursor' || !payload.messageId) {
    scheduleRefresh(host, conversationId)
    return
  }
  applyMessage(host, payload)
}

/** 推送已带消息体：直接落地，不再回查消息接口。 */
export function applyMessage(host: RealtimeHost, payload: RealtimePayload) {
  const conversationId = String(payload.conversationId)
  const messageId = String(payload.messageId)
  const clientMsgId = payload.clientMsgId ?? undefined
  const mine = sameId(payload.senderId ?? '', host.myId)
  const list = host.messages[conversationId] ?? (host.messages[conversationId] = [])
  const existing = list.find(
    (item) =>
      sameId(item.messageId, messageId)
      || (!!clientMsgId && item.clientMsgId === clientMsgId),
  )
  if (!existing) {
    list.push(normalize({
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
    }))
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

  const card = host.cards.find((item) => item.conversationId === conversationId)
  if (card) {
    if ((payload.seq ?? 0) > card.lastSeq) {
      card.lastSeq = payload.seq ?? card.lastSeq
      card.lastMessageAt = payload.createdAt ?? card.lastMessageAt
      card.lastMessageType = payload.messageType ?? card.lastMessageType
      card.lastMessagePreview = previewOf(payload)
      // 新消息比「不显示」的时间更晚：会话重新出现，与服务端卡片接口的判定一致。
      card.hidden = false
    }
    if (conversationId === host.activeId) {
      card.unreadCount = 0
    } else if (!mine) {
      card.unreadCount = (card.unreadCount ?? 0) + 1
    }
  } else {
    // 新会话（首次私聊/被拉群）：卡片信息不在本地，拉一次列表
    void host.loadCards()
  }

  host.lastSync = Date.now()
  if (conversationId === host.activeId) {
    host.markReadThrottled(conversationId)
    void host.loadReceipts(conversationId)
  }
}

/** 游标事件合并：120ms 窗口内同一会话只处理一次。 */
export function scheduleRefresh(host: RealtimeHost, conversationId: string) {
  const existing = coalesceTimers.get(conversationId)
  if (existing !== undefined) window.clearTimeout(existing)
  const timer = window.setTimeout(() => {
    coalesceTimers.delete(conversationId)
    void (async () => {
      if (conversationId === host.activeId) {
        await host.refreshMessages(conversationId)
        host.markReadThrottled(conversationId)
        void host.loadReceipts(conversationId)
      } else {
        await host.loadCards()
      }
      host.lastSync = Date.now()
    })()
  }, REALTIME_COALESCE_MS)
  coalesceTimers.set(conversationId, timer)
}

/** 已读上报节流：高频群聊下避免每条消息一次写库。 */
export function markReadThrottled(host: RealtimeHost, conversationId: string) {
  const now = Date.now()
  const last = lastMarkReadAt.get(conversationId) ?? 0
  if (now - last < MARK_READ_THROTTLE_MS) return
  lastMarkReadAt.set(conversationId, now)
  void host.markRead(conversationId)
}

export function startPolling(host: RealtimeHost, intervalMs = 3000) {
  stopPolling(host)
  host.pollTimer = window.setInterval(async () => {
    const realtimeHealthy = host.realtimeConnected
      && Date.now() - host.realtimeLastPing < REALTIME_HEALTHY_MS
    if (realtimeHealthy && Date.now() - host.lastSync < BACKGROUND_SYNC_MS) return
    if (host.pollingBusy) return
    host.pollingBusy = true
    try {
      const activeBefore = host.activeId
      await host.loadCards()
      if (activeBefore && activeBefore === host.activeId) {
        await Promise.allSettled([
          host.refreshMessages(activeBefore),
          host.loadReceipts(activeBefore),
          // 后台全量同步顺带刷新成员在线状态，群详情里的「在线」不会长期停在旧值。
          Promise.resolve(host.refreshMembersIfStale(activeBefore)),
        ])
        const card = host.cards.find((item) => item.conversationId === activeBefore)
        if (card && card.unreadCount > 0) await host.markRead(activeBefore)
      }
      host.lastSync = Date.now()
    } finally {
      host.pollingBusy = false
    }
  }, intervalMs)
}

export function stopPolling(host: RealtimeHost) {
  if (host.pollTimer !== null) {
    window.clearInterval(host.pollTimer)
    host.pollTimer = null
  }
}
