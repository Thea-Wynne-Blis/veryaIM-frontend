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
  /** 所在地区 */
  region?: string | null
  /** 个性签名 */
  signature?: string | null
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
  } catch (error) {
    if (init.signal?.aborted) throw error
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

/* ---------- 鉴权图片的内存缓存 ---------- */

/**
 * 图片必须带 Bearer Token 才能取，无法直接给 `<img src>`，
 * 只能 fetch 成 blob 再转 object URL。切换会话时组件会重新挂载，
 * 如果每次都重新下载 2MB 原图，体验就是「每切一次都在重新加载」。
 * 这里按 fileId 缓存 object URL（LRU，最多 48 张），切回来直接命中。
 */
const MAX_CACHED_OBJECT_URLS = 48
const objectUrlCache = new Map<string, Promise<string>>()

function rememberObjectUrl(key: string, task: Promise<string>): Promise<string> {
  objectUrlCache.delete(key)
  objectUrlCache.set(key, task)
  task.catch(() => {
    if (objectUrlCache.get(key) === task) objectUrlCache.delete(key)
  })
  while (objectUrlCache.size > MAX_CACHED_OBJECT_URLS) {
    const oldest = objectUrlCache.keys().next().value as string | undefined
    if (oldest === undefined) break
    const stale = objectUrlCache.get(oldest)
    objectUrlCache.delete(oldest)
    stale?.then((url) => URL.revokeObjectURL(url)).catch(() => {})
  }
  return task
}

function cachedObjectUrl(path: string, cacheKey: string): Promise<string> {
  const hit = objectUrlCache.get(cacheKey)
  if (hit) return rememberObjectUrl(cacheKey, hit)
  const task = authorizedFetch(path)
    .then((response) => response.blob())
    .then((blob) => URL.createObjectURL(blob))
  return rememberObjectUrl(cacheKey, task)
}

/**
 * 任意需要鉴权的二进制资源 → 缓存 object URL。
 *
 * <p>朋友圈媒体走独立的可见性校验地址，不能复用 `fileObjectUrl`；
 * 但缓存与 LRU 回收逻辑完全一样，这里对外暴露同一套实现。</p>
 */
export function authorizedObjectUrl(path: string, cacheKey: string): Promise<string> {
  return cachedObjectUrl(path, cacheKey)
}

/** 原图（点击放大、下载用）。 */
export function fileObjectUrl(fileId: Id): Promise<string> {
  return cachedObjectUrl(`/files/${fileId}/content`, `full:${fileId}`)
}

/** 图片消息气泡用的缩略图（服务端缩到 480px，通常几十 KB）。 */
export function thumbObjectUrl(fileId: Id): Promise<string> {
  return cachedObjectUrl(`/files/${fileId}/thumb?w=480`, `thumb:${fileId}`)
}

/** 退出登录时清掉缓存，避免下一个账号看到上一个人的图片。 */
export function clearFileCache(): void {
  for (const task of objectUrlCache.values()) {
    task.then((url) => URL.revokeObjectURL(url)).catch(() => {})
  }
  objectUrlCache.clear()
}

/**
 * 自己刚上传的图片：本地已有 File，直接把这个 object URL 放进缓存，
 * 气泡和“看大图”都用它，省掉一次服务端缩略图生成（约 0.5s）与下载。
 *
 * <p>调用后这个 URL 归缓存所有，调用方不要再 revoke。</p>
 */
export function seedFilePreview(fileId: Id, url: string): void {
  for (const cacheKey of [`thumb:${fileId}`, `full:${fileId}`]) {
    if (objectUrlCache.has(cacheKey)) continue
    rememberObjectUrl(cacheKey, Promise.resolve(url))
  }
}

/* ---------- 带进度的上传 ---------- */

export type UploadOptions = {
  onProgress?: (ratio: number) => void
  signal?: AbortSignal
}

/**
 * multipart 上传并回报进度。
 *
 * <p>fetch 没有上传进度事件，这里退到 XMLHttpRequest；其它请求仍走 fetch。</p>
 */
export function uploadWithProgress<T>(
  path: string,
  form: FormData,
  options: UploadOptions = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}${path}`, true)
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.responseType = 'text'

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(Math.min(1, event.loaded / event.total))
      }
    }

    xhr.onload = () => {
      let body: ApiEnvelope<T> | null = null
      try {
        body = parseBody<T>(xhr.status, xhr.responseText)
      } catch (error) {
        reject(error instanceof Error ? error : new ApiError(xhr.status, -1, '响应格式错误'))
        return
      }
      if (xhr.status === 401) onUnauthorized()
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ApiError(
          xhr.status,
          body?.code ?? xhr.status,
          body?.message ?? `上传失败 (${xhr.status})`,
        ))
        return
      }
      if (body && body.code !== 0 && body.code != null) {
        reject(new ApiError(xhr.status, body.code, body.message || '上传失败'))
        return
      }
      resolve((body ? body.data : undefined) as T)
    }

    xhr.onerror = () => reject(new ApiError(0, -1, '网络连接失败，请检查网络'))
    xhr.ontimeout = () => reject(new ApiError(0, -1, '上传超时'))
    xhr.onabort = () => reject(new ApiError(0, -2, '已取消'))

    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort()
        return
      }
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }

    xhr.send(form)
  })
}


/* ---------- 大文件分片上传 ---------- */

/** 超过这个体积改走分片：单次 multipart 上限 32MB，且只有分片才能断点续传。 */
export const CHUNKED_UPLOAD_THRESHOLD = 8 * 1024 * 1024

export type UploadSession = {
  uploadId: Id
  chunkSize: number
  totalChunks: number
  uploadedChunks: number[]
  status: string
  fileId: Id | null
}

/**
 * 统一上传入口：小文件一次提交，大文件自动切片。
 *
 * <p>切片的另一个好处是进度按「已落盘字节」推进，25MB 视频不会出现
 * 「99% 卡住等服务器合并」的观感。</p>
 */
export async function uploadFile(
  file: File,
  conversationId: string | null,
  options: UploadOptions = {},
): Promise<FileRow> {
  if (file.size <= CHUNKED_UPLOAD_THRESHOLD) {
    const form = new FormData()
    form.append('file', file)
    if (conversationId) form.append('conversationId', conversationId)
    return uploadWithProgress<FileRow>('/files', form, options)
  }
  return uploadChunked(file, conversationId, options)
}

async function uploadChunked(
  file: File,
  conversationId: string | null,
  options: UploadOptions,
): Promise<FileRow> {
  const { signal, onProgress } = options
  const session = await request<UploadSession>('/files/uploads', {
    method: 'POST',
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      conversationId: conversationId ?? undefined,
    }),
  })
  const chunkSize = Math.max(1, Number(session.chunkSize) || CHUNKED_UPLOAD_THRESHOLD)
  const totalChunks = Number(session.totalChunks) || Math.ceil(file.size / chunkSize)
  const uploaded = new Set((session.uploadedChunks ?? []).map((index) => Number(index)))
  const chunkLength = (index: number) =>
    index === totalChunks - 1 ? file.size - chunkSize * index : chunkSize

  let uploadedBytes = 0
  for (const index of uploaded) uploadedBytes += chunkLength(index)
  onProgress?.(Math.min(1, uploadedBytes / Math.max(1, file.size)))

  try {
    for (let index = 0; index < totalChunks; index++) {
      if (uploaded.has(index)) continue
      const start = index * chunkSize
      const blob = file.slice(start, start + chunkLength(index))
      await putChunk(session.uploadId, index, blob, {
        signal,
        onProgress: (loaded) => {
          onProgress?.(Math.min(1, (uploadedBytes + loaded) / Math.max(1, file.size)))
        },
      })
      uploadedBytes += chunkLength(index)
      onProgress?.(Math.min(1, uploadedBytes / Math.max(1, file.size)))
    }
    return await request<FileRow>(`/files/uploads/${session.uploadId}/complete`, {
      method: 'POST',
    })
  } catch (error) {
    // 只有主动取消才丢弃暂存分片；网络抖动时保留，重试可以续传
    if (signal?.aborted) {
      void request(`/files/uploads/${session.uploadId}`, { method: 'DELETE' }).catch(() => {})
    }
    throw error
  }
}

function putChunk(
  uploadId: Id,
  index: number,
  blob: Blob,
  options: { signal?: AbortSignal; onProgress?: (loaded: number) => void },
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', `${BASE}/files/uploads/${uploadId}/chunks/${index}`, true)
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.responseType = 'text'

    xhr.upload.onprogress = (event) => options.onProgress?.(event.loaded)

    xhr.onload = () => {
      if (xhr.status === 401) onUnauthorized()
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
        return
      }
      let message = `分片上传失败 (${xhr.status})`
      try {
        const body = parseBody<unknown>(xhr.status, xhr.responseText)
        if (body?.message) message = body.message
      } catch {
        /* 忽略解析失败 */
      }
      reject(new ApiError(xhr.status, xhr.status, message))
    }
    xhr.onerror = () => reject(new ApiError(0, -1, '网络连接失败，请检查网络'))
    xhr.onabort = () => reject(new ApiError(0, -2, '已取消'))

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new ApiError(0, -2, '已取消'))
        return
      }
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }
    xhr.send(blob)
  })
}

export const api = {
  get: <T>(path: string, options?: { signal?: AbortSignal }) => request<T>(path, options),
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
  /** 最后一条真实消息的发送者；没有消息时为 0 / null。群聊预览用「姓名：内容」。 */
  lastMessageSenderId: Id
  lastMessageSenderName: string | null
  /** 当前用户是否置顶了该会话 */
  pinned: boolean
  /** 当前用户是否对会话开启了消息免打扰 */
  muted: boolean
  /** 当前用户是否把会话设为「不显示」（收到新消息后会自动恢复） */
  hidden: boolean
}

/** 会话列表项设置：只提交要改的那一项。 */
export type ConversationPrefs = {
  pinned?: boolean
  muted?: boolean
  hidden?: boolean
  unread?: boolean
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
  /** 引用的原消息 ID，未引用时为空 */
  replyToId?: Id | null
  /** 被引用消息的发送者 ID */
  replySenderId?: Id | null
  /** 被引用消息的文本快照（发送时生成，原消息撤回后仍可读） */
  replyPreview?: string | null
  /** 发送中占位消息（乐观渲染），收到服务端确认后移除 */
  pending?: boolean
}

export type MessagePage = {
  messages: MessageView[]
  nextCursor: string | number | null
  hasMore: boolean
}

export type ConversationSearchHit = {
  messageId: Id
  seq: number
  senderId: Id
  senderName: string
  type: string
  text: string
  createdAt: string
  fileId: Id | null
  fileName: string | null
  sizeBytes: number | null
  contentType: string | null
}

export type ConversationSearchPage = {
  messages: ConversationSearchHit[]
  nextCursor: string | null
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

/** 会话文件：图片 / 文件 / 语音 / 视频消息里的附件。 */
export type ConversationFile = {
  fileId: Id
  messageId: Id
  type: 'IMAGE' | 'FILE' | 'AUDIO' | 'VIDEO' | string
  name: string
  sizeBytes: number
  contentType: string
  senderId: Id
  senderName: string
  createdAt: string
}

/** 收藏项：文本消息带 text，附件消息带 fileId/fileName。 */
export type Favorite = {
  id: Id
  conversationId: string
  messageId: Id
  type: string
  text?: string | null
  fileId?: Id | null
  fileName?: string | null
  sizeBytes?: number | null
  contentType?: string | null
  senderId: Id
  senderName: string
  conversationTitle: string
  createdAt: string
}

/** 全局搜索结果。 */
export type SearchResults = {
  contacts: Array<{
    userId: Id
    name: string
    nickname: string
    remark?: string | null
    avatar?: string | null
    online: boolean
  }>
  groups: Array<{ conversationId: string; title: string; memberCount: number }>
  messages: Array<{
    messageId: Id
    conversationId: string
    conversationTitle: string
    senderId: Id
    senderName: string
    text: string
    createdAt: string
  }>
  files: Array<{
    fileId: Id
    messageId: Id
    conversationId: string
    conversationTitle: string
    name: string
    type: string
    sizeBytes: number
    contentType: string
    senderId: Id
    senderName: string
    createdAt: string
  }>
}


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
  mutedPermanently?: boolean
}

export type UserProfile = {
  userId: Id
  username: string
  nickname: string
  avatar?: string | null
  /** 所在地区 */
  region?: string | null
  /** 个性签名 */
  signature?: string | null
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

/* ---------- 翻译 ---------- */

export type TranslateResult = {
  from: string
  to: string
  text: string
}

/** 服务端代理百度翻译，密钥不出后端；相同原文与目标语言会命中服务端缓存。 */
export function translateText(text: string, to: string): Promise<TranslateResult> {
  return api.post<TranslateResult>('/translate', { text, to })
}

/* ---------- 会话列表项设置 ---------- */

/** 置顶 / 免打扰 / 不显示 / 手动未读，只影响当前用户。 */
export function updateConversationPrefs(
  conversationId: string,
  prefs: ConversationPrefs,
): Promise<void> {
  return api.put<void>(`/conversations/${conversationId}/prefs`, prefs)
}

/**
 * 删除聊天记录：清空自己这边的记录并设为不显示。
 * 消息仍保留在服务端，会话另一方的记录不受影响。
 */
export function clearConversation(conversationId: string): Promise<void> {
  return api.post<void>(`/conversations/${conversationId}/clear`)
}
