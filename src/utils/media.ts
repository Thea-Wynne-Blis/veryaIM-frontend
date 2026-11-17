/**
 * 附件媒体探测：只依赖浏览器自带的解码能力，不引入第三方库。
 *
 * <p>服务端没有 ffmpeg，视频封面/宽高/时长只能在客户端取；
 * 图片格式也以「浏览器能不能真的解码」为准——HEIC、TIFF 这类
 * 长得像图片但解不开的文件应该退化成文件卡片，而不是坏图。</p>
 */

export type MediaKind = 'image' | 'gif' | 'video' | 'audio' | 'file'

const GIF_EXT = /\.gif$/i
const SVG_EXT = /\.svg$/i
const VIDEO_EXT = /\.(mp4|m4v|webm|ogv|mov)$/i
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|flac|opus|oga)$/i
const IMAGE_EXT = /\.(jpe?g|png|webp|avif|bmp|tiff?|heic|heif)$/i

async function canDecodeImage(file: File): Promise<boolean> {
  if (typeof createImageBitmap !== 'function') return true
  try {
    const bitmap = await createImageBitmap(file)
    bitmap.close()
    return true
  } catch {
    return false
  }
}

/**
 * 判定附件按哪种气泡渲染。
 *
 * <p>GIF 单独一类：缩略图会把动图压成静态首帧，所以 GIF 直接走原图。
 * SVG 归到文件：它是可执行脚本的 XML 文档，不能当图片内联打开。</p>
 */
export async function mediaKindOf(file: File): Promise<MediaKind> {
  const type = (file.type || '').toLowerCase()
  const name = file.name || ''

  if (SVG_EXT.test(name) || type.includes('svg')) return 'file'
  if (GIF_EXT.test(name) || type === 'image/gif') return 'gif'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('image/')) {
    return (await canDecodeImage(file)) ? 'image' : 'file'
  }
  // 部分系统拖拽/复制过来的文件没有 MIME，只能按扩展名兜底
  if (VIDEO_EXT.test(name)) return 'video'
  if (AUDIO_EXT.test(name)) return 'audio'
  if (IMAGE_EXT.test(name)) {
    return (await canDecodeImage(file)) ? 'image' : 'file'
  }
  return 'file'
}

/** 读本地图片尺寸，用于气泡占位，避免加载完成后撑开导致跳动。 */
export async function imageSizeOf(
  file: File,
): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== 'function') return null
  try {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return null
  }
}

export type VideoMeta = {
  width: number
  height: number
  /** 秒，0 表示探测失败 */
  duration: number
  /** 首帧封面，上传后作为视频消息的 coverFileId */
  poster?: Blob
}

function revokeSoon(url: string) {
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * 用 `<video>` 元数据事件拿宽高与时长，再 seek 到 10% 处抓一帧当封面。
 *
 * <p>整个流程有超时兜底：解不开的容器（如部分 mkv）不应该卡住上传。</p>
 */
export function videoMetaOf(file: File, timeoutMs = 6000): Promise<VideoMeta | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    let settled = false

    const finish = (meta: VideoMeta | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      video.removeAttribute('src')
      try {
        video.load()
      } catch {
        /* 忽略 */
      }
      revokeSoon(url)
      resolve(meta)
    }

    const timer = window.setTimeout(() => finish(null), timeoutMs)
    video.onerror = () => finish(null)
    video.onloadedmetadata = () => {
      const width = video.videoWidth || 0
      const height = video.videoHeight || 0
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
      void grabPoster(video, width, height)
        .catch(() => undefined)
        .then((poster) => finish({ width, height, duration, poster }))
    }
    video.src = url
  })
}

async function grabPoster(
  video: HTMLVideoElement,
  width: number,
  height: number,
): Promise<Blob | undefined> {
  const target = Math.min(1, Math.max(0.1, (video.duration || 1) * 0.1))
  await new Promise<void>((resolve) => {
    let done = false
    const settle = () => {
      if (done) return
      done = true
      video.removeEventListener('seeked', settle)
      resolve()
    }
    video.addEventListener('seeked', settle, { once: true })
    window.setTimeout(settle, 1500)
    try {
      video.currentTime = target
    } catch {
      settle()
    }
  })
  if (!video.videoWidth || !video.videoHeight) return undefined
  const maxSide = Math.max(width, height, 1)
  const scale = Math.min(1, 480 / maxSide)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  if (!context) return undefined
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise<Blob | undefined>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/jpeg', 0.82)
  })
}

/** 音频时长（语音气泡显示秒数用）。 */
export function audioDurationOf(file: File, timeoutMs = 3000): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    let settled = false
    const finish = (duration: number) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      audio.removeAttribute('src')
      revokeSoon(url)
      resolve(duration)
    }
    const timer = window.setTimeout(() => finish(0), timeoutMs)
    audio.onerror = () => finish(0)
    audio.onloadedmetadata = () =>
      finish(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0)
    audio.src = url
  })
}

/** 00:12 / 1:05:00 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`
}
