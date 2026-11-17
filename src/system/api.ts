import JSONBigFactory from 'json-bigint'

/**
 * 运营后台 API 客户端。
 *
 * <p>与 IM 前端完全独立：令牌放在独立 key，认证走 `/api/v1/platform/auth/*`，
 * 请求头同样是 Bearer，但作用域是 PLATFORM。</p>
 *
 * <p>雪花 ID 超过 2^53，必须用 json-bigint 解析并转成字符串，
 * 否则用户 ID 会被 JS 精度截断，导致操作到错误的账号。</p>
 */

const JSONBig = JSONBigFactory({ storeAsString: true })
const BASE = '/api/v1'
const TOKEN_KEY = 'veryal.admin.token'
const REFRESH_KEY = 'veryal.admin.refresh'
const PROFILE_KEY = 'veryal.admin.profile'

export type Id = string

export type AdminProfile = {
  adminId: Id
  username: string
  displayName: string
  role: string
  scope: string
}

export class AdminApiError extends Error {
  readonly status: number
  readonly code: number

  constructor(status: number, code: number, message: string) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
    this.code = code
  }
}

type Envelope<T> = { code: number; message?: string; data?: T }

function parse<T>(text: string): Envelope<T> | null {
  if (!text) return null
  try {
    return JSONBig.parse(text) as Envelope<T>
  } catch {
    throw new AdminApiError(200, -1, '响应格式错误')
  }
}

let unauthorizedHandler: (() => void) | null = null

export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler
}

export const adminAuth = {
  token(): string {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  },
  refreshToken(): string {
    return localStorage.getItem(REFRESH_KEY) ?? ''
  },
  profile(): AdminProfile | null {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as AdminProfile
    } catch {
      return null
    }
  },
  save(payload: {
    token: string
    refreshToken: string
    adminId: Id
    username: string
    displayName: string
    role: string
    scope: string
  }): void {
    localStorage.setItem(TOKEN_KEY, payload.token)
    localStorage.setItem(REFRESH_KEY, payload.refreshToken ?? '')
    const profile: AdminProfile = {
      adminId: payload.adminId,
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role,
      scope: payload.scope,
    }
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  },
  clear(): void {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(PROFILE_KEY)
  },
}

async function send<T>(path: string, init: RequestInit, token: string): Promise<T> {
  const headers = new Headers(init.headers)
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers })
  } catch {
    throw new AdminApiError(0, -1, '网络连接失败')
  }
  const body = parse<T>(await response.text())
  if (!response.ok) {
    throw new AdminApiError(response.status, body?.code ?? response.status,
      body?.message ?? `请求失败 (${response.status})`)
  }
  if (body && body.code !== 0) {
    throw new AdminApiError(response.status, body.code, body.message || '请求失败')
  }
  return (body?.data ?? undefined) as T
}

type TokenPayload = {
  token: string
  refreshToken: string
  adminId: Id
  username: string
  displayName: string
  role: string
  scope: string
}

async function refresh(): Promise<boolean> {
  const refreshToken = adminAuth.refreshToken()
  if (!refreshToken) return false
  try {
    const payload = await send<TokenPayload>('/platform/auth/refresh',
      { method: 'POST', body: JSON.stringify({ refreshToken }) }, '')
    adminAuth.save(payload)
    return true
  } catch {
    return false
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await send<T>(path, init, adminAuth.token())
  } catch (error) {
    const status = (error as AdminApiError)?.status
    if (status !== 401) throw error
    // 访问令牌 2 小时过期：先用 refresh token 换一张再重试一次。
    if (await refresh()) {
      return await send<T>(path, init, adminAuth.token())
    }
    adminAuth.clear()
    unauthorizedHandler?.()
    throw error
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export function errorMessage(error: unknown): string {
  if (error instanceof AdminApiError) return error.message
  if (error instanceof Error) return error.message
  return '操作失败'
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
