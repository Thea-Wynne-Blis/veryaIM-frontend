/**
 * 前端访问后端的统一入口。
 *
 * <p>对外仍然是 `import { api, ... } from '../api/client'`，内部按关注点拆成了几块：</p>
 *
 * <ul>
 *   <li>`http`   —— 会话、鉴权头、错误、request、设备标识（传输层）</li>
 *   <li>`files`  —— 文件下载与鉴权图片的 object URL 缓存</li>
 *   <li>`uploads`—— 带进度的 multipart 与大文件分片续传</li>
 *   <li>`types`  —— 接口返回的业务视图模型（纯类型）</li>
 * </ul>
 *
 * <p>这里只保留最薄的接口对象与少量端点封装，具体实现都在上面的模块里。
 * 其余模块继续从 `client` 引入也能拿到，不需要逐个改 import。</p>
 */
import { request } from './http'
import type { ConversationPrefs, TranslateResult } from './types'

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

/* ---------- 翻译 ---------- */

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

/* ---------- 兼容导出 ---------- */
// 调用方一直是从 client 引这些名字，继续透出，避免为拆文件改 30 处 import。
export * from './http'
export * from './files'
export * from './uploads'
export * from './types'
