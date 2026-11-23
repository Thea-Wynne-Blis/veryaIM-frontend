/**
 * 文件上传：带进度的 multipart 与大文件分片续传。
 *
 * <p>从 `client.ts` 拆出——这里约 180 行，只关心「怎么把一个 File 传上去」，
 * 和业务接口无关。小文件一次提交，大文件自动切片。</p>
 */
import {
  ApiError,
  BASE,
  getToken,
  onUnauthorized,
  parseBody,
  request,
  type ApiEnvelope,
  type Id,
} from './http'
import type { FileRow } from './types'

export type UploadOptions = {
  onProgress?: (ratio: number) => void
  signal?: AbortSignal
}

/**
 * multipart 上传并回报进度。
 *
 * <p>fetch 没有上传进度事件，这里退到 XMLHttpRequest；其它请求仍走 fetch。</p>
 */
export function uploadWithProgress<T>(
  path: string,
  form: FormData,
  options: UploadOptions = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}${path}`, true)
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.responseType = 'text'

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(Math.min(1, event.loaded / event.total))
      }
    }

    xhr.onload = () => {
      let body: ApiEnvelope<T> | null = null
      try {
        body = parseBody<T>(xhr.status, xhr.responseText)
      } catch (error) {
        reject(error instanceof Error ? error : new ApiError(xhr.status, -1, '响应格式错误'))
        return
      }
      if (xhr.status === 401) onUnauthorized()
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ApiError(
          xhr.status,
          body?.code ?? xhr.status,
          body?.message ?? `上传失败 (${xhr.status})`,
        ))
        return
      }
      if (body && body.code !== 0 && body.code != null) {
        reject(new ApiError(xhr.status, body.code, body.message || '上传失败'))
        return
      }
      resolve((body ? body.data : undefined) as T)
    }

    xhr.onerror = () => reject(new ApiError(0, -1, '网络连接失败，请检查网络'))
    xhr.ontimeout = () => reject(new ApiError(0, -1, '上传超时'))
    xhr.onabort = () => reject(new ApiError(0, -2, '已取消'))

    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort()
        return
      }
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }

    xhr.send(form)
  })
}

/**
 * 小文件表单上传（头像、表情包等）：直接 POST/PUT 一个 FormData。
 *
 * <p>大文件请走 `uploadFile`（带进度、断点续传）；这里只处理几十 KB 的场景，
 * 不需要进度条，也不需要分片。</p>
 */
export function uploadForm<T>(
  path: string,
  form: FormData,
  method: 'POST' | 'PUT' = 'POST',
): Promise<T> {
  return request<T>(path, { method, body: form })
}

/* ---------- 大文件分片上传 ---------- */

/** 超过这个体积改走分片：单次 multipart 上限 32MB，且只有分片才能断点续传。 */
export const CHUNKED_UPLOAD_THRESHOLD = 8 * 1024 * 1024
/** 分片并发数：3 路足以吃满常见上行，又不至于占满浏览器连接数。 */
const CHUNK_UPLOAD_CONCURRENCY = 3

export type UploadSession = {
  uploadId: Id
  chunkSize: number
  totalChunks: number
  uploadedChunks: number[]
  status: string
  fileId: Id | null
}

/**
 * 统一上传入口：小文件一次提交，大文件自动切片。
 *
 * <p>切片的另一个好处是进度按「已落盘字节」推进，25MB 视频不会出现
 * 「99% 卡住等服务器合并」的观感。</p>
 */
export async function uploadFile(
  file: File,
  conversationId: string | null,
  options: UploadOptions = {},
): Promise<FileRow> {
  if (file.size <= CHUNKED_UPLOAD_THRESHOLD) {
    const form = new FormData()
    form.append('file', file)
    if (conversationId) form.append('conversationId', conversationId)
    return uploadWithProgress<FileRow>('/files', form, options)
  }
  return uploadChunked(file, conversationId, options)
}

async function uploadChunked(
  file: File,
  conversationId: string | null,
  options: UploadOptions,
): Promise<FileRow> {
  const { signal, onProgress } = options
  const session = await request<UploadSession>('/files/uploads', {
    method: 'POST',
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      conversationId: conversationId ?? undefined,
    }),
  })
  const chunkSize = Math.max(1, Number(session.chunkSize) || CHUNKED_UPLOAD_THRESHOLD)
  const totalChunks = Number(session.totalChunks) || Math.ceil(file.size / chunkSize)
  const uploaded = new Set((session.uploadedChunks ?? []).map((index) => Number(index)))
  const chunkLength = (index: number) =>
    index === totalChunks - 1 ? file.size - chunkSize * index : chunkSize

  let uploadedBytes = 0
  for (const index of uploaded) uploadedBytes += chunkLength(index)
  onProgress?.(Math.min(1, uploadedBytes / Math.max(1, file.size)))

  const totalBytes = Math.max(1, file.size)
  const inflight = new Map<number, number>()
  const report = () => {
    let loaded = uploadedBytes
    for (const value of inflight.values()) loaded += value
    onProgress?.(Math.min(1, loaded / totalBytes))
  }

  const jobs: number[] = []
  for (let index = 0; index < totalChunks; index++) {
    if (!uploaded.has(index)) jobs.push(index)
  }
  let cursor = 0

  try {
    // 3 路并发：单路 PUT 在弱网下吃不满上行，串行传 25MB 视频会明显慢
    const worker = async (): Promise<void> => {
      while (cursor < jobs.length) {
        if (signal?.aborted) throw new ApiError(0, -2, '已取消')
        const index = jobs[cursor++]
        const start = index * chunkSize
        const blob = file.slice(start, start + chunkLength(index))
        inflight.set(index, 0)
        await putChunk(session.uploadId, index, blob, {
          signal,
          onProgress: (loaded) => {
            inflight.set(index, Math.min(loaded, chunkLength(index)))
            report()
          },
        })
        inflight.delete(index)
        uploadedBytes += chunkLength(index)
        report()
      }
    }
    const workers = Math.min(CHUNK_UPLOAD_CONCURRENCY, Math.max(1, jobs.length))
    await Promise.all(Array.from({ length: workers }, worker))
    return await request<FileRow>(`/files/uploads/${session.uploadId}/complete`, {
      method: 'POST',
    })
  } catch (error) {
    inflight.clear()
    // 只有主动取消才丢弃暂存分片；网络抖动时保留，重试可以续传
    if (signal?.aborted) {
      void request(`/files/uploads/${session.uploadId}`, { method: 'DELETE' }).catch(() => {})
    }
    throw error
  }
}

function putChunk(
  uploadId: Id,
  index: number,
  blob: Blob,
  options: { signal?: AbortSignal; onProgress?: (loaded: number) => void },
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', `${BASE}/files/uploads/${uploadId}/chunks/${index}`, true)
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.responseType = 'text'

    xhr.upload.onprogress = (event) => options.onProgress?.(event.loaded)

    xhr.onload = () => {
      if (xhr.status === 401) onUnauthorized()
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
        return
      }
      let message = `分片上传失败 (${xhr.status})`
      try {
        const body = parseBody<unknown>(xhr.status, xhr.responseText)
        if (body?.message) message = body.message
      } catch {
        /* 忽略解析失败 */
      }
      reject(new ApiError(xhr.status, xhr.status, message))
    }
    xhr.onerror = () => reject(new ApiError(0, -1, '网络连接失败，请检查网络'))
    xhr.onabort = () => reject(new ApiError(0, -2, '已取消'))

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new ApiError(0, -2, '已取消'))
        return
      }
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }
    xhr.send(blob)
  })
}
