const TOKEN_KEY = 'veryal.token'
const USER_KEY = 'veryal.user'

export type ApiEnvelope<T> = {
  code: number
  message: string
  data: T
  traceId?: string
}

export type AuthUser = {
  userId: number
  username: string
  nickname: string
  avatar?: string | null
}

export type LoginResult = {
  token: string
  expiresInSeconds: number
  deviceId: string
  scope: string
  role?: string
  user: AuthUser
}

export class ApiError extends Error {
  status: number
  code: number
  constructor(status: number, code: number, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function saveSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

const BASE = '/api/v1'

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${BASE}${path}`, { ...init, headers })
  const text = await response.text()
  const body = text ? (JSON.parse(text) as ApiEnvelope<T>) : null

  if (response.status === 401) {
    clearSession()
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.code ?? response.status,
      body?.message ?? `请求失败 (${response.status})`,
    )
  }
  if (!body) throw new ApiError(response.status, -1, '空响应')
  return body.data
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

/* ---------- 业务模型 ---------- */

export type ConversationCard = {
  conversationId: string
  type: 'PRIVATE' | 'GROUP'
  title: string
  peerUserId: number
  memberCount: number
  lastReadSeq: number
  lastSeq: number
  unreadCount: number
  lastMessageType: string | null
  lastMessagePreview: string
  lastMessageAt: string | null
  updatedAt: string
}

export type MessageView = {
  messageId: number
  conversationId: string
  senderId: number
  clientMsgId: string
  seq: number
  type: string
  content: string
  createdAt: string
  recalledAt?: string | null
}

export type MessagePage = {
  messages: MessageView[]
  nextCursor: number
  hasMore: boolean
}

export type ContactView = {
  userId: number
  nickname: string
  username: string
  remark?: string | null
  avatar?: string | null
}

let cachedDeviceId: string | null = null

/** 当前浏览器的设备标识；换账号登录时会被重置。 */
export function deviceHeaders() {
  if (!cachedDeviceId) {
    cachedDeviceId = `web-${Math.random().toString(36).slice(2, 10)}`
  }
  const deviceId = cachedDeviceId
  return { deviceId, platform: 'WEB', deviceName: 'Browser' }
}

/** 设备被绑定到其他账号时，换一个设备标识重试。 */
export function resetDeviceId(): void {
  cachedDeviceId = null
}
