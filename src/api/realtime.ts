import { api } from './client'

/** 下行帧：与后端 `Connection.sendJson` 一致，`seq` 单调递增。 */
export type RealtimeFrame<T = unknown> = {
  cmd: string
  seq: number
  data: T
  ts: number
}

type TicketResponse = {
  ticket: string
  expiresInSeconds: number
  deviceId: string
  path: string
}

type RealtimeOptions = {
  onFrame: (frame: RealtimeFrame) => void
  onStateChange?: (connected: boolean) => void
  /** 每次重连前都会重新换票，失败时用于上报。 */
  onError?: (error: unknown) => void
  /** 会话被服务端终止（登出、封禁、设备下线）：不要再重连。 */
  onTerminated?: (reason: string) => void
}

const PING_INTERVAL_MS = 25_000
const PONG_TIMEOUT_MS = 60_000
const MAX_BACKOFF_MS = 15_000
/** 与服务端 `Connection.CLOSE_SESSION_TERMINATED` 一致。 */
const CLOSE_SESSION_TERMINATED = 4001

/** 票据接口返回的 path 可能已带查询串（`/ws?format=json`），这里统一拼接，避免出现两个 `?`。 */
function wsUrl(ticket: string, path: string): string {
  const base = (import.meta.env.VITE_WS_BASE as string | undefined)?.trim()
  const prefix = base
    ? base.replace(/\/$/, '')
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
  const separator = path.includes('?') ? '&' : '?'
  const params = new URLSearchParams({ ticket })
  if (!/(?:^|[?&])format=/.test(path)) params.set('format', 'json')
  return `${prefix}${path}${separator}${params.toString()}`
}

/**
 * 浏览器实时通道。
 *
 * <p>浏览器不能给 WebSocket 握手设置 Authorization 头，所以每次建连前先用
 * Bearer Token 换一张 60 秒、一次性的 ticket。断线重连会重新换票。</p>
 */
export class RealtimeClient {
  private readonly options: RealtimeOptions
  private socket: WebSocket | null = null
  private retryTimer: number | null = null
  private pingTimer: number | null = null
  private pongTimer: number | null = null
  private retries = 0
  private stopped = false
  private lastReceivedAt = 0

  constructor(options: RealtimeOptions) {
    this.options = options
  }

  start(): void {
    this.stopped = false
    void this.connect()
  }

  close(): void {
    this.stopped = true
    this.clearTimers()
    this.socket?.close()
    this.socket = null
    this.options.onStateChange?.(false)
  }

  private async connect(): Promise<void> {
    if (this.stopped) return
    try {
      const ticket = await api.post<TicketResponse>('/auth/ws-ticket')
      if (this.stopped) return
      const socket = new WebSocket(wsUrl(ticket.ticket, ticket.path || '/ws'))
      this.socket = socket
      socket.onopen = () => {
        this.retries = 0
        this.lastReceivedAt = Date.now()
        this.startHeartbeat()
      }
      socket.onmessage = (event) => {
        this.lastReceivedAt = Date.now()
        this.clearPongTimer()
        if (typeof event.data !== 'string') return
        let frame: RealtimeFrame
        try {
          frame = JSON.parse(event.data) as RealtimeFrame
        } catch {
          return
        }
        if (frame.cmd === 'ready') {
          this.options.onStateChange?.(true)
        }
        this.options.onFrame(frame)
      }
      socket.onclose = (event) => {
        this.clearTimers()
        this.options.onStateChange?.(false)
        if (event.code === CLOSE_SESSION_TERMINATED) {
          // 服务端主动终止（登出/封禁/设备下线）：重连也会被拒，直接停在终止态。
          this.stopped = true
          this.options.onTerminated?.('session-terminated')
          return
        }
        this.scheduleRetry()
      }
      socket.onerror = () => {
        /* onclose 会紧跟其后，统一在那里重连 */
      }
    } catch (error) {
      if ((error as { status?: number })?.status === 401) {
        // Token 已失效（在别处登出）：换票注定失败，不再空转重试。
        this.stopped = true
        this.options.onTerminated?.('unauthorized')
        return
      }
      this.options.onError?.(error)
      this.scheduleRetry()
    }
  }

  private scheduleRetry(): void {
    if (this.stopped) return
    const delay = Math.min(1000 * 2 ** Math.min(this.retries, 4), MAX_BACKOFF_MS)
    this.retries += 1
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer)
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null
      void this.connect()
    }, delay)
  }

  private startHeartbeat(): void {
    this.clearTimers()
    this.pingTimer = window.setInterval(() => {
      const socket = this.socket
      if (!socket || socket.readyState !== WebSocket.OPEN) return
      socket.send(JSON.stringify({ cmd: 'ping', seq: Date.now() }))
      if (this.pongTimer === null) {
        this.pongTimer = window.setTimeout(() => {
          // 服务端长时间不回 pong：认为半死连接，主动断开触发重连。
          this.socket?.close()
        }, PONG_TIMEOUT_MS)
      }
    }, PING_INTERVAL_MS)
  }

  private clearPongTimer(): void {
    if (this.pongTimer !== null) {
      window.clearTimeout(this.pongTimer)
      this.pongTimer = null
    }
  }

  private clearTimers(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    this.clearPongTimer()
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  healthy(): boolean {
    return Date.now() - this.lastReceivedAt < PONG_TIMEOUT_MS
  }
}
