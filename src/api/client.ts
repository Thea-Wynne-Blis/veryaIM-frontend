import JSONBigFactory from 'json-bigint'

const TOKEN_KEY = 'veryal.token'
const USER_KEY = 'veryal.user'
const DEVICE_KEY = 'veryal.deviceId'

/** 后端 ID 是 19 位雪花号，超过 JS 安全整数，统一按字符串处理。 */
export type Id = string | number

export function sameId(a: Id | null | undefined, b: Id | null | undefined): boolean {
  return a != null && b != null && String(a) === String(b)
}

/**
 * 后端 JSON 直接返回长整型 ID（如 380621349644668928）。
 * 原生 JSON.parse 会四舍五入成 380621349644668900，导致接口按错误 ID 查询。
 * storeAsString 让超出安全范围的整数保留为字符串，小整数仍为 number。
 */
const JSONBig = JSONBigFactory({ storeAsString: true })

export function parseJson<T>(text: string): T {
  return JSONBig.parse(text) as T
}

export type ApiEnvelope<T> = {
  code: number
  message: string
  data: T
  traceId?: string
}

export type AuthUser = {
  userId: Id
  username: string
  nickname: string
  avatar?: string | null
  createdAt?: string
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

export function updateStoredUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

const BASE = '/api/v1'

/**
 * 无损 JSON 解析。
 *
 * 后端使用雪花 ID（18 位），超出 JS 安全整数范围（2^53≈9e15），
 * 直接 JSON.parse 会被截断（...928 → ...900），导致「user not found」。
 * 这里把对象字段位置与数组元素位置上超过 16 位的整数先加引号，
 * 使其以字符串形式保留精度；seq / count / size 等小整数仍是 number。
 */
export function parseLossless<T>(text: string): T {
  const inObjectField = /("(?:[A-Za-z_][A-Za-z0-9_]*)"\s*:\s*)(-?\d{16,})(?=\s*[,}\]])/g
  const inArray = /([\[,]\s*)(-?\d{16,})(?=\s*[,\]])/g
  const safe = text.replace(inObjectField, '$1"$2"').replace(inArray, '$1"$2"')
  return JSON.parse(safe) as T
}

function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return headers
}

function onUnauthorized(): void {
  clearSession()
  // 让页面层统一跳转，避免 401 后仍停留在工作区。
  window.dispatchEvent(new CustomEvent('veryal:unauthorized'))
}

function parseBody<T>(status: number, text: string): ApiEnvelope<T> | null {
  if (!text) return null
  try {
    return parseJson<ApiEnvelope<T>>(text)
  } catch {
    throw new ApiError(status, -1, text.slice(0, 200) || '响应格式错误')
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = authHeaders(init.headers)
  if (!(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, -1, '网络连接失败，请检查后端是否已启动')
  }

  const text = await response.text()
  const body = parseBody<T>(response.status, text)

  if (response.status === 401) onUnauthorized()
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.code ?? response.status,
      body?.message ?? `请求失败 (${response.status})`,
    )
  }
  if (body && body.code !== 0 && body.code != null) {
    throw new ApiError(response.status, body.code, body.message || '请求失败')
  }
  // 204 / 空响应（例如退出登录）不算错误。
  if (!body) return undefined as T
  return body.data
}

/** 带鉴权直接取二进制（文件下载 / 图片预览）。 */
export async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: authHeaders(init.headers),
  })
  if (response.status === 401) onUnauthorized()
  if (!response.ok) {
    let message = `请求失败 (${response.status})`
    try {
      const body = parseBody<unknown>(response.status, await response.text())
      if (body?.message) message = body.message
    } catch {
      /* 忽略解析失败 */
    }
    throw new ApiError(response.status, response.status, message)
  }
  return response
}

/** 下载文件：必须带 Bearer Token，window.open 无法携带请求头。 */
export async function downloadFile(fileId: Id, filename: string): Promise<void> {
  const response = await authorizedFetch(`/files/${fileId}/content`)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename || `file-${fileId}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 图片等需要鉴权的资源转成本地 object URL。调用方负责 revoke。 */
export async function fileObjectUrl(fileId: Id): Promise<string> {
  const response = await authorizedFetch(`/files/${fileId}/content`)
  return URL.createObjectURL(await response.blob())
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** multipart/form-data 上传；不要手动设置 Content-Type。 */
  upload: <T>(path: string, form: FormData) =>
    request<T>(path, { method: 'POST', body: form }),
}

/* ---------- 业务模型 ---------- */

export type ConversationCard = {
  conversationId: string
  type: 'PRIVATE' | 'GROUP'
  title: string
  peerUserId: Id
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
  messageId: Id
  conversationId: string
  senderId: Id
  clientMsgId?: string
  /** 后端返回 sequence，前端统一成 seq。 */
  seq: number
  sequence?: number
  type: string
  content: string
  contentEncoding?: string
  createdAt: string
  recalled?: boolean
  recalledAt?: string | null
}

export type MessagePage = {
  messages: MessageView[]
  nextCursor: string | number | null
  hasMore: boolean
}

export type ContactView = {
  userId: Id
  nickname: string
  username?: string
  remark?: string | null
  avatar?: string | null
}

export type FileRow = {
  fileId: Id
  name: string
  contentType: string
  sizeBytes: number
  sha256?: string
  storageType?: string
  createdAt: string
}

export type ReadReceipt = { userId: Id; readSequence: number }

export type GroupDetail = {
  groupId: string
  name: string
  ownerId: Id
  memberIds: Id[]
  createdAt?: string
  updatedAt: string
}

export type GroupModeration = {
  groupId: string
  announcement?: string | null
  muteAll: boolean
  mutedUntil?: string | null
}

export type UserProfile = {
  userId: Id
  username: string
  nickname: string
  avatar?: string | null
  online?: boolean
  createdAt?: string
}

export type UserPrivacy = {
  searchByPhone: boolean
  searchByUsername: boolean
  friendPolicy: string
  showOnline: boolean
  readReceipt: boolean
  invitedToGroup: boolean
  updatedAt?: string
}

export type DeviceInfo = {
  deviceId: string
  platform: string
  deviceName?: string
  lastLoginAt?: string
  /** 同平台同名的登录记录条数（后端已把重复记录合并）。 */
  deviceCount?: number
  /** 是否是当前浏览器登录的设备。 */
  current?: boolean
}

let cachedDeviceId: string | null = null

function ensureDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId
  let stored = localStorage.getItem(DEVICE_KEY)
  if (!stored) {
    stored = `web-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(DEVICE_KEY, stored)
  }
  cachedDeviceId = stored
  return stored
}

/** 当前浏览器的设备标识；持久化，避免每次刷新都新增一条设备记录。 */
export function deviceHeaders() {
  return {
    deviceId: ensureDeviceId(),
    platform: 'WEB',
    deviceName: 'Browser',
  }
}

/** 设备被绑定到其他账号时，换一个设备标识重试。 */
export function resetDeviceId(): void {
  cachedDeviceId = `web-${Math.random().toString(36).slice(2, 10)}`
  localStorage.setItem(DEVICE_KEY, cachedDeviceId)
}
