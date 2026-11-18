import {
  ApiError,
  seedFilePreview,
  uploadFile,
  type Id,
  type MessageView,
} from '../../api/client'
import { messageOf } from '../../utils/error'
import { audioDurationOf, imageSizeOf, mediaKindOf, videoMetaOf } from '../../utils/media'
import { SEED_PREVIEW_MAX_BYTES, baseNameOf, type State, type UploadTask } from './helpers'

/** 上传模块对 store 的最小依赖。 */
export interface UploadHost extends State {
  sendRaw(
    type: string,
    content: string,
    preview: string,
    targetId?: string,
    reply?: { messageId: string; senderId: string; preview: string } | null,
  ): Promise<MessageView>
  dropUpload(taskId: string): void
}

/** AbortController 不能进 Pinia state，放模块级 Map。 */
const uploadControllers = new Map<string, AbortController>()

/**
 * 上传附件并以对应消息类型发送：图片 / GIF → IMAGE，视频 → VIDEO，
 * 音频 → AUDIO，其余 → FILE。
 *
 * <p>上传走 XHR 以回报字节进度（fetch 没有上传进度事件），超过 8MB 自动分片；
 * 任务同时写进 `uploads`，由输入区渲染细线进度条，可中途取消。</p>
 *
 * <p>视频的宽高、时长与封面全部在客户端生成：服务端没有 ffmpeg。
 * 封面作为独立图片文件上传，通过 {@code coverFileId} 挂在视频消息上。</p>
 */
export async function sendAttachment(host: UploadHost, file: File) {
  const conversationId = host.activeId
  if (!conversationId) throw new Error('没有选中的会话')
  host.error = null

  const kind = await mediaKindOf(file)
  const isImage = kind === 'image' || kind === 'gif'
  const taskId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const controller = new AbortController()
  uploadControllers.set(taskId, controller)

  const task: UploadTask = {
    id: taskId,
    conversationId,
    name: file.name,
    sizeBytes: file.size,
    progress: 0,
    phase: kind === 'video' ? 'prepare' : 'upload',
    kind,
    previewUrl: isImage ? URL.createObjectURL(file) : undefined,
  }
  host.uploads.push(task)
  // 从 state 里取回响应式代理，否则直接改进度不会触发视图更新
  const live = host.uploads[host.uploads.length - 1]!

  let width: number | undefined
  let height: number | undefined
  let duration = 0
  let coverFileId: Id | undefined

  try {
    if (isImage) {
      const size = await imageSizeOf(file)
      if (size) {
        width = size.width
        height = size.height
        live.width = width
        live.height = height
      }
    } else if (kind === 'video') {
      const meta = await videoMetaOf(file)
      if (meta) {
        width = meta.width || undefined
        height = meta.height || undefined
        duration = meta.duration
        live.width = width
        live.height = height
        live.duration = duration
      }
      if (meta?.poster) {
        live.previewUrl = URL.createObjectURL(meta.poster)
        try {
          const cover = await uploadFile(
            new File([meta.poster], `${baseNameOf(file.name)}-cover.jpg`,
              { type: 'image/jpeg' }),
            conversationId,
            { signal: controller.signal },
          )
          coverFileId = cover.fileId
          // 封面已经在本机，直接塞进缓存，气泡不必再回源
          seedFilePreview(cover.fileId, URL.createObjectURL(meta.poster))
        } catch (e) {
          if (e instanceof ApiError && e.code === -2) throw e
          // 封面失败不影响视频本身，气泡会回退到深色占位
        }
      }
      live.phase = 'upload'
    } else if (kind === 'audio') {
      duration = await audioDurationOf(file)
      live.duration = duration
    }

    const uploaded = await uploadFile(file, conversationId, {
      signal: controller.signal,
      onProgress: (ratio) => {
        live.progress = ratio
      },
    })

    const payload: Record<string, unknown> = {
      fileId: uploaded.fileId,
      fileName: uploaded.name || file.name,
      sizeBytes: uploaded.sizeBytes,
      contentType: uploaded.contentType || file.type,
    }
    if (width && height) {
      payload.width = width
      payload.height = height
    }
    if (duration > 0) {
      payload.durationSeconds = Math.max(1, Math.round(duration))
    }
    if (coverFileId) {
      payload.coverFileId = coverFileId
    }

    live.phase = 'send'
    live.progress = 1
    // 自己刚传的图片：把本地预览塞进缓存，气泡立即显示，不必等服务端缩略图
    if (isImage && live.previewUrl && file.size <= SEED_PREVIEW_MAX_BYTES) {
      seedFilePreview(uploaded.fileId, live.previewUrl)
      live.previewUrl = undefined
    }

    const type = kind === 'video'
      ? 'VIDEO'
      : kind === 'audio'
        ? 'AUDIO'
        : isImage
          ? 'IMAGE'
          : 'FILE'
    const preview = kind === 'video'
      ? '[视频]'
      : kind === 'audio'
        ? '[语音]'
        : isImage
          ? '[图片]'
          : `[文件] ${uploaded.name || file.name}`
    return await host.sendRaw(type, JSON.stringify(payload), preview, conversationId)
  } catch (e) {
    // code -2 = 用户取消，不当作错误提示
    const cancelled = e instanceof ApiError && e.code === -2
    if (!cancelled) {
      host.error = messageOf(e, '上传失败')
    }
    throw e
  } finally {
    uploadControllers.delete(taskId)
    host.dropUpload(taskId)
  }
}

/** 移除上传任务并释放本地预览 URL。 */
export function dropUpload(host: UploadHost, taskId: string) {
  const index = host.uploads.findIndex((item) => item.id === taskId)
  if (index < 0) return
  const [removed] = host.uploads.splice(index, 1)
  if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
}

/** 取消上传/发送中的附件任务。 */
export function cancelUpload(host: UploadHost, taskId: string) {
  uploadControllers.get(taskId)?.abort()
  uploadControllers.delete(taskId)
  dropUpload(host, taskId)
}

/** 登出 / 切换账号时中止所有任务并释放预览。 */
export function resetUploads(host: UploadHost) {
  for (const controller of uploadControllers.values()) controller.abort()
  uploadControllers.clear()
  for (const task of host.uploads) {
    if (task.previewUrl) URL.revokeObjectURL(task.previewUrl)
  }
  host.uploads = []
}
