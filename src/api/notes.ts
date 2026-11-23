import { api, type Id } from './client'

/**
 * 个人笔记 API 与数据模型。
 *
 * <p>正文按 Markdown 原文保存，列表接口只返回标题与摘要；
 * 打开某条笔记时再单独请求完整正文。</p>
 */

export type NoteSummary = {
  id: Id
  title: string
  excerpt: string
  createdAt: string
  updatedAt: string
}

export type Note = NoteSummary & {
  content: string
}

export type NoteInput = {
  title?: string
  content?: string
}

export const notesApi = {
  list: (keyword?: string) => {
    const q = keyword?.trim()
    return api.get<NoteSummary[]>(`/notes?limit=200${q ? `&keyword=${encodeURIComponent(q)}` : ''}`)
  },
  get: (id: Id) => api.get<Note>(`/notes/${id}`),
  create: (input: NoteInput) => api.post<Note>('/notes', input),
  update: (id: Id, input: NoteInput) => api.put<Note>(`/notes/${id}`, input),
  remove: (id: Id) => api.delete<void>(`/notes/${id}`),
}
