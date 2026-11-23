import { defineStore } from 'pinia'
import { chatBackgroundsApi, type ChatBackgroundItem } from '../api/chatBackgrounds'
import { shrinkImage } from '../api/image-upload'
import { hasChatBackground } from '../utils/chatBackground'

type State = {
  global: ChatBackgroundItem
  conversations: Record<string, ChatBackgroundItem>
  loaded: boolean
  loading: boolean
}

function emptyChoice(): ChatBackgroundItem {
  return { fileId: null, preset: null }
}

/**
 * 聊天背景：全局一份 + 会话级覆盖。
 *
 * <p>读取时按「会话覆盖 → 全局」回退；写入接口直接返回新值，
 * 所以不需要为了刷新一张背景重新拉整份列表。</p>
 */
export const useChatBackgroundStore = defineStore('chatBackground', {
  state: (): State => ({
    global: emptyChoice(),
    conversations: {},
    loaded: false,
    loading: false,
  }),

  getters: {
    /** 某个会话最终生效的背景；没有覆盖时回退到全局。 */
    choiceFor: (state) => (conversationId?: string | null): ChatBackgroundItem => {
      const own = conversationId ? state.conversations[conversationId] : null
      return hasChatBackground(own) ? (own as ChatBackgroundItem) : state.global
    },
  },

  actions: {
    /** 首次进入聊天或「我的」时拉一次；失败静默，保持默认背景。 */
    async load(force = false) {
      if (this.loading || (this.loaded && !force)) return
      this.loading = true
      try {
        const data = await chatBackgroundsApi.view()
        this.global = data.global ?? emptyChoice()
        this.conversations = data.conversations ?? {}
        this.loaded = true
      } finally {
        this.loading = false
      }
    },

    apply(conversationId: string | null | undefined, item: ChatBackgroundItem) {
      if (conversationId) {
        this.conversations = { ...this.conversations, [conversationId]: item }
      } else {
        this.global = item
      }
    },

    async setPreset(preset: string, conversationId?: string | null) {
      const item = await chatBackgroundsApi.setPreset(preset, conversationId)
      this.apply(conversationId, item)
      return item
    },

    async upload(file: File, conversationId?: string | null) {
      // 手机原图动辄几 MB，先在浏览器里压到 1920px，再交给服务端。
      const compressed = await shrinkImage(file, {
        maxSide: 1920,
        quality: 0.86,
        minBytes: 480 * 1024,
      })
      const item = await chatBackgroundsApi.upload(compressed, conversationId)
      this.apply(conversationId, item)
      return item
    },

    async clear(conversationId?: string | null) {
      const item = await chatBackgroundsApi.clear(conversationId)
      this.apply(conversationId, item)
      return item
    },

    /** 退出登录时清空，避免下一个账号看到上一个人的背景。 */
    reset() {
      this.global = emptyChoice()
      this.conversations = {}
      this.loaded = false
      this.loading = false
    },
  },
})
