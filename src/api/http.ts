/**
 * 传输层：会话存放、鉴权头、统一错误、request 与设备标识。
 *
 * <p>从 `client.ts` 拆出来，让「怎么发请求」和「有哪些业务接口」分开。
 * 这里不含任何业务模型，只认 ApiEnvelope。</p>
 */
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

export const BASE = '/api/v1'

export function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return headers
}

export function onUnauthorized(): void {
  clearSession()
  // 让页面层统一跳转，避免 401 后仍停留在工作区。
  window.dispatchEvent(new CustomEvent('veryal:unauthorized'))
}

export function parseBody<T>(status: number, text: string): ApiEnvelope<T> | null {
  if (!text) return null
  try {
    return parseJson<ApiEnvelope<T>>(text)
  } catch {
    throw new ApiError(status, -1, text.slice(0, 200) || '响应格式错误')
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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

/* ---------- 设备标识 ---------- */

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
