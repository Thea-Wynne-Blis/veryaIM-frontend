import { api, authorizedObjectUrl, uploadFile, type Id } from './client'
import { shrinkImage } from './image-upload'

/**
 * 朋友圈 API 与数据模型。
 *
 * <p>媒体内容不能走 `/files/{id}/content`：可见性由动态、好友关系与可见名单
 * 共同决定，只有 `/moments/{momentId}/media/{fileId}` 能做出正确判断。
 * 图片/视频必须先 `fetch` 成 blob，再交给 `<img>` / `<video>`。</p>
 */

export type MomentAuthor = {
  userId: Id
  nickname: string
  avatar?: string | null
  /** 好友备注；为空时展示 nickname */
  remark?: string | null
}

export type MomentMediaItem = {
  fileId: Id
  kind: 'IMAGE' | 'VIDEO'
  sortOrder: number
  width: number
  height: number
  durationSeconds?: number | null
}

export type MomentComment = {
  id: Id
  author: MomentAuthor
  content: string
  replyToId: Id | null
  replyToUserId: Id | null
  replyToName: string | null
  createdAt: string
  /** 是否当前用户发表；只有自己的评论可以删除（作者也可删） */
  mine: boolean
}

export type Moment = {
  id: Id
  author: MomentAuthor
  content: string
  visibility: MomentVisibility
  media: MomentMediaItem[]
  likeCount: number
  commentCount: number
  /** 最近点赞的人，最多 8 个 */
  likers: MomentAuthor[]
  /** 最早评论预览，最多 5 条 */
  comments: MomentComment[]
  liked: boolean
  mine: boolean
  /** 被运营下架：仅作者可见，界面给出提示 */
  hidden: boolean
  createdAt: string
}

export type MomentNotice = {
  id: Id
  type: 'LIKE' | 'COMMENT' | 'REPLY'
  actor: MomentAuthor
  momentId: Id
  commentId: Id | null
  momentPreview: string
  read: boolean
  createdAt: string
}

export type MomentSettings = {
  /** 好友可见天数：0 表示全部 */
  visibleDays: number
  /** 上次浏览到的最新动态 ID，用于「有新动态」提示 */
  lastReadMomentId: Id
  supportedDays: number[]
}

export type MomentVisibility = 'ALL_FRIENDS' | 'PRIVATE' | 'PARTIAL' | 'EXCLUDE'

export type MomentPage<T = Moment> = {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

export type PublishMomentPayload = {
  content: string
  visibility: MomentVisibility
  /** PARTIAL / EXCLUDE 时必填：好友用户 ID */
  audienceUserIds?: Id[]
  media: Array<{
    fileId: Id
    kind?: 'IMAGE' | 'VIDEO'
    width?: number
    height?: number
    durationSeconds?: number | null
  }>
}

export const VISIBILITY_LABEL: Record<MomentVisibility, string> = {
  ALL_FRIENDS: '所有朋友可见',
  PRIVATE: '仅自己可见',
  PARTIAL: '部分朋友可见',
  EXCLUDE: '不给谁看',
}

/* ---------- 媒体 ---------- */

/** 列表缩略图：服务端等比缩放到 w 内并转 JPEG。 */
export function momentThumbUrl(momentId: Id, fileId: Id, width = 640): Promise<string> {
  return authorizedObjectUrl(
    `/moments/${momentId}/media/${fileId}/thumb?w=${width}`,
    `moment-thumb:${momentId}:${fileId}:${width}`,
  )
}

/** 原图 / 视频：带 Range 与 inline，交给 `<img>` / `<video>` 播放。 */
export function momentMediaUrl(momentId: Id, fileId: Id): Promise<string> {
  return authorizedObjectUrl(
    `/moments/${momentId}/media/${fileId}?disposition=inline`,
    `moment-full:${momentId}:${fileId}`,
  )
}

/** 发布前上传：朋友圈文件不挂在会话上，conversationId 传 null。 */
export async function uploadMomentFile(file: File, onProgress?: (ratio: number) => void) {
  // 先压缩再上传：压缩阶段占前 10%，其余按已发送字节推进
  onProgress?.(0.02)
  const prepared = await shrinkImage(file)
  onProgress?.(0.1)
  return uploadFile(prepared, null, {
    onProgress: (ratio) => onProgress?.(0.1 + ratio * 0.9),
  })
}

/* ---------- 接口 ---------- */

function page<T>(path: string): Promise<MomentPage<T>> {
  return api.get<MomentPage<T>>(path)
}

export const momentsApi = {
  feed(cursor?: string | null, limit = 10) {
    return page<Moment>(`/moments/feed?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`)
  },
  mine(cursor?: string | null, limit = 10) {
    return page<Moment>(`/moments/mine?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`)
  },
  byAuthor(authorId: Id, cursor?: string | null, limit = 10) {
    return page<Moment>(
      `/moments/users/${authorId}?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    )
  },
  detail(momentId: Id) {
    return api.get<Moment>(`/moments/${momentId}`)
  },
  publish(payload: PublishMomentPayload) {
    return api.post<Moment>('/moments', payload)
  },
  remove(momentId: Id) {
    return api.delete<void>(`/moments/${momentId}`)
  },
  like(momentId: Id, liked: boolean) {
    return api.post<Moment>(`/moments/${momentId}/like`, { liked })
  },
  comments(momentId: Id, cursor?: string | null, limit = 20) {
    return page<MomentComment>(
      `/moments/${momentId}/comments?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    )
  },
  comment(momentId: Id, content: string, replyToCommentId?: Id | null) {
    return api.post<MomentComment>(`/moments/${momentId}/comments`, {
      content,
      replyToCommentId: replyToCommentId ?? undefined,
    })
  },
  deleteComment(commentId: Id) {
    return api.delete<void>(`/moments/comments/${commentId}`)
  },
  notices(cursor?: string | null, limit = 20) {
    return page<MomentNotice>(`/moments/notices?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`)
  },
  unreadNotices() {
    return api.get<number | string>('/moments/notices/unread')
  },
  readNotices() {
    return api.post<void>('/moments/notices/read')
  },
  settings() {
    return api.get<MomentSettings>('/moments/settings')
  },
  updateSettings(visibleDays: number) {
    return api.put<MomentSettings>('/moments/settings', { visibleDays })
  },
  markFeedRead(momentId: Id) {
    return api.post<void>('/moments/feed/read', { momentId })
  },
}

/** 显示名：好友备注优先。 */
export function authorName(author: MomentAuthor | null | undefined): string {
  if (!author) return '未知用户'
  const remark = author.remark?.trim()
  return remark || author.nickname?.trim() || '未知用户'
}
