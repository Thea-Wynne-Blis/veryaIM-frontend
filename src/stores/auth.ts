import { defineStore } from 'pinia'
import {
  api,
  clearSession,
  deviceHeaders,
  resetDeviceId,
  getStoredUser,
  getToken,
  saveSession,
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

    async logout() {
      try {
        await api.post('/auth/logout')
      } catch {
        /* 令牌可能已失效，本地仍然清理 */
      }
      this.token = null
      this.user = null
      clearSession()
    },
  },
})
