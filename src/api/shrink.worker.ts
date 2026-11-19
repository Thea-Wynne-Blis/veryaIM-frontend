/// <reference lib="webworker" />

/**
 * 图片压缩 worker：解码、缩放、JPEG 编码都在这里做。
 *
 * <p>4000×3000 的照片编码一次要几百毫秒，放在主线程里连选 9 张会把页面卡住；
 * 挪到 worker 后界面照常响应，两张 worker 还能并行。</p>
 */
type ShrinkRequest = {
  id: number
  file: File
  maxSide: number
  quality: number
}

type ShrinkResponse =
  | { id: number; blob: Blob; width: number; height: number }
  | { id: number; error: string }

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = async (event: MessageEvent<ShrinkRequest>) => {
  const { id, file, maxSide, quality } = event.data
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    try {
      // 与主线程兜底保持一致：超过 6400 万像素直接放弃，交给原图上传
      if (bitmap.width * bitmap.height > 64 * 1000 * 1000) {
        throw new Error('image is too large to shrink')
      }
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('offscreen canvas is not available')
      context.imageSmoothingQuality = 'high'
      // 透明 PNG 转 JPEG 会有黑底，先铺白底
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      context.drawImage(bitmap, 0, 0, width, height)
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
      const response: ShrinkResponse = { id, blob, width, height }
      scope.postMessage(response)
    } finally {
      bitmap.close()
    }
  } catch (error) {
    const response: ShrinkResponse = {
      id,
      error: error instanceof Error ? error.message : 'shrink failed',
    }
    scope.postMessage(response)
  }
}
