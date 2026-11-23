/**
 * 鉴权文件的下载与图片 object URL 缓存。
 *
 * <p>图片必须带 Bearer Token 才能取，无法直接给 `<img src>`，只能 fetch 成 blob
 * 再转 object URL；这里负责缓存与 LRU 回收。</p>
 */
import { authorizedFetch, type Id } from './http'

/** 下载文件：必须带 Bearer Token，window.open 无法携带请求头。 */
export async function downloadFile(fileId: Id, filename: string): Promise<void> {
  const response = await authorizedFetch(`/files/${fileId}/content`)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename || `file-${fileId}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 切换会话时组件会重新挂载，如果每次都重新下载 2MB 原图，
 * 体验就是「每切一次都在重新加载」。这里按 fileId 缓存 object URL
 * （LRU，最多 48 张），切回来直接命中。
 */
const MAX_CACHED_OBJECT_URLS = 48
const objectUrlCache = new Map<string, Promise<string>>()

function rememberObjectUrl(key: string, task: Promise<string>): Promise<string> {
  objectUrlCache.delete(key)
  objectUrlCache.set(key, task)
  task.catch(() => {
    if (objectUrlCache.get(key) === task) objectUrlCache.delete(key)
  })
  while (objectUrlCache.size > MAX_CACHED_OBJECT_URLS) {
    const oldest = objectUrlCache.keys().next().value as string | undefined
    if (oldest === undefined) break
    const stale = objectUrlCache.get(oldest)
    objectUrlCache.delete(oldest)
    stale?.then((url) => URL.revokeObjectURL(url)).catch(() => {})
  }
  return task
}

function cachedObjectUrl(path: string, cacheKey: string): Promise<string> {
  const hit = objectUrlCache.get(cacheKey)
  if (hit) return rememberObjectUrl(cacheKey, hit)
  const task = authorizedFetch(path)
    .then((response) => response.blob())
    .then((blob) => URL.createObjectURL(blob))
  return rememberObjectUrl(cacheKey, task)
}

/**
 * 任意需要鉴权的二进制资源 → 缓存 object URL。
 *
 * <p>朋友圈媒体走独立的可见性校验地址，不能复用 `fileObjectUrl`；
 * 但缓存与 LRU 回收逻辑完全一样，这里对外暴露同一套实现。</p>
 */
export function authorizedObjectUrl(path: string, cacheKey: string): Promise<string> {
  return cachedObjectUrl(path, cacheKey)
}

/** 原图（点击放大、下载用）。 */
export function fileObjectUrl(fileId: Id): Promise<string> {
  return cachedObjectUrl(`/files/${fileId}/content`, `full:${fileId}`)
}

/** 图片消息气泡用的缩略图（服务端缩到 480px，通常几十 KB）。 */
export function thumbObjectUrl(fileId: Id): Promise<string> {
  return cachedObjectUrl(`/files/${fileId}/thumb?w=480`, `thumb:${fileId}`)
}

/** 退出登录时清掉缓存，避免下一个账号看到上一个人的图片。 */
export function clearFileCache(): void {
  for (const task of objectUrlCache.values()) {
    task.then((url) => URL.revokeObjectURL(url)).catch(() => {})
  }
  objectUrlCache.clear()
}

/**
 * 自己刚上传的图片：本地已有 File，直接把这个 object URL 放进缓存，
 * 气泡和“看大图”都用它，省掉一次服务端缩略图生成（约 0.5s）与下载。
 *
 * <p>调用后这个 URL 归缓存所有，调用方不要再 revoke。</p>
 */
export function seedFilePreview(fileId: Id, url: string): void {
  for (const cacheKey of [`thumb:${fileId}`, `full:${fileId}`]) {
    if (objectUrlCache.has(cacheKey)) continue
    rememberObjectUrl(cacheKey, Promise.resolve(url))
  }
}
