import { api, type Id } from './client'

/**
 * 聊天背景 API。
 *
 * <p>不传 `conversationId` 时操作的是当前用户的全局背景，
 * 传了就是该会话的覆盖；会话级为空时前端自动回退到全局。</p>
 */
export type ChatBackgroundItem = {
  fileId: Id | null
  preset: string | null
}

export type ChatBackgrounds = {
  global: ChatBackgroundItem
  conversations: Record<string, ChatBackgroundItem>
}

const BASE = '/chat-backgrounds'

export const chatBackgroundsApi = {
  view: () => api.get<ChatBackgrounds>(BASE),
  setPreset: (preset: string, conversationId?: string | null) =>
    api.put<ChatBackgroundItem>(`${BASE}/preset`, {
      conversationId: conversationId ?? null,
      preset,
    }),
  upload: (file: File, conversationId?: string | null) => {
    const form = new FormData()
    form.append('file', file)
    if (conversationId) form.append('conversationId', conversationId)
    return api.upload<ChatBackgroundItem>(`${BASE}/upload`, form)
  },
  clear: (conversationId?: string | null) => {
    const query = conversationId
      ? `?conversationId=${encodeURIComponent(conversationId)}`
      : ''
    return api.delete<ChatBackgroundItem>(`${BASE}${query}`)
  },
}
