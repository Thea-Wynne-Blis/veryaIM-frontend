import { defineStore } from 'pinia'
import {
  api,
  clearFileCache,
  clearSession,
  deviceHeaders,
  resetDeviceId,
  getStoredUser,
  getToken,
  saveSession,
  updateStoredUser,
  type AuthUser,
  type LoginResult,
} from '../api/client'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: getStoredUser() as AuthUser | null,
    token: getToken(),
    loading: false,
  }),

  getters: {
    loggedIn: (state): boolean => !!state.token,
  },

  actions: {
    async login(username: string, password: string) {
      this.loading = true
      try {
        const result = await this.doLogin(username, password)
        this.token = result.token
        this.user = result.user
        saveSession(result.token, result.user)
        return result
      } finally {
        this.loading = false
      }
    },

    /** 403 device is bound to another user 时换设备号重试一次 */
    async doLogin(username: string, password: string): Promise<LoginResult> {
      try {
        return await api.post<LoginResult>('/auth/login', {
          username,
          password,
          ...deviceHeaders(),
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (msg.includes('device is bound')) {
          resetDeviceId()
          return await api.post<LoginResult>('/auth/login', {
            username,
            password,
            ...deviceHeaders(),
          })
        }
        throw e
      }
    },

    async register(username: string, password: string, nickname: string) {
      await api.post('/auth/register', { username, password, nickname })
      return this.login(username, password)
    },

    /** 刷新页面后用后端资料覆盖本地缓存，避免昵称/头像过期。 */
    async refresh() {
      if (!this.token) return
      try {
        const user = await api.get<AuthUser>('/auth/me')
        this.user = user
        updateStoredUser(user)
      } catch (e) {
        // 令牌失效由 api 层清空并派发 veryal:unauthorized。
        if (e instanceof Error && e.message.includes('会话')) {
          this.token = null
          this.user = null
        }
      }
    },

    /** 修改资料后同步 Pinia 与 localStorage。 */
    updateUser(patch: Partial<AuthUser>) {
      if (!this.user) return
      this.user = { ...this.user, ...patch }
      updateStoredUser(this.user)
    },

    async logout() {
      try {
        await api.post('/auth/logout')
      } catch {
        /* 令牌可能已失效，本地仍然清理 */
      }
      this.token = null
      this.user = null
      clearFileCache()
      clearSession()
    },
  },
})
