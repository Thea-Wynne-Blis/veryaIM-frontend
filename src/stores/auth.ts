import { defineStore } from 'pinia'
import {
  api,
  clearSession,
  deviceHeaders,
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
        const result = await api.post<LoginResult>('/auth/login', {
          username,
          password,
          ...deviceHeaders(),
        })
        this.token = result.token
        this.user = result.user
        saveSession(result.token, result.user)
        return result
      } finally {
        this.loading = false
      }
    },

    async register(username: string, password: string, nickname: string) {
      await api.post('/auth/register', { username, password, nickname })
      return this.login(username, password)
    },

    logout() {
      this.token = null
      this.user = null
      clearSession()
    },
  },
})
