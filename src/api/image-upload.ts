/**
 * 上传前把图片缩到展示尺寸。
 *
 * <p>手机照片动辄 4000×3000、4~10MB，直接上传要让网速和服务端都陪着受罪：
 * 传输时间按体积线性增长，服务端还得完整解码一次再缩放。
 * 朋友圈最大展示宽度只有 1920，先在浏览器里用 canvas 压到同一尺寸，
 * 一张 4MB 的照片通常只剩 300~600KB。</p>
 *
 * <p>压缩在 worker 里做：单张大图编码要几百毫秒，放主线程里连选 9 张会把页面卡死；
 * 两个 worker 并行还能把多图的总耗时压下来。环境不支持时退回主线程。</p>
 *
 * <p>以下情况原样返回，不做任何处理：</p>
 * <ul>
 *   <li>GIF（保持动图）、HEIC 等浏览器解不了的格式；</li>
 *   <li>本来就小于 {@link ShrinkImageOptions.minBytes} 的图，重编码只会更糊；</li>
 *   <li>编码失败或压缩后反而更大。</li>
 * </ul>
 */
export type ShrinkImageOptions = {
  /** 长边上限，默认 1920，与服务端压缩尺寸保持一致。 */
  maxSide?: number
  /** JPEG 质量，默认 0.85。 */
  quality?: number
  /** 小于这个体积直接原样上传，默认 320KB。 */
  minBytes?: number
}

const DEFAULT_MAX_SIDE = 1920
const DEFAULT_QUALITY = 0.85
const DEFAULT_MIN_BYTES = 320 * 1024
/** 浏览器 canvas 的像素上限各不相同，过大的图直接放弃压缩。 */
const MAX_SOURCE_PIXELS = 64 * 1000 * 1000
const SHRINKABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

type ShrinkResult = { blob: Blob }

type PendingTask = {
  resolve: (result: ShrinkResult) => void
  reject: (error: Error) => void
}

type WorkerSlot = {
  worker: Worker
  pending: Map<number, PendingTask>
}

let slots: WorkerSlot[] | null = null
let nextTaskId = 1
let nextSlot = 0

export async function shrinkImage(file: File, options: ShrinkImageOptions = {}): Promise<File> {
  const maxSide = options.maxSide ?? DEFAULT_MAX_SIDE
  const quality = options.quality ?? DEFAULT_QUALITY
  const minBytes = options.minBytes ?? DEFAULT_MIN_BYTES
  if (!SHRINKABLE_TYPES.has(file.type) || file.size <= minBytes) return file

  let result: ShrinkResult | null = null
  try {
    result = await shrinkInWorker(file, maxSide, quality)
  } catch {
    result = await shrinkOnMainThread(file, maxSide, quality)
  }
  if (!result || result.blob.size === 0 || result.blob.size >= file.size) return file
  return new File([result.blob], jpegName(file.name), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  })
}

/* ---------- worker 池 ---------- */

function workerPool(): WorkerSlot[] | null {
  if (slots) return slots
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null
  const size = Math.max(1, Math.min(2, navigator.hardwareConcurrency ?? 2))
  try {
    slots = Array.from({ length: size }, createSlot)
    return slots
  } catch {
    slots = null
    return null
  }
}

function createSlot(): WorkerSlot {
  const worker = new Worker(new URL('./shrink.worker.ts', import.meta.url), { type: 'module' })
  const pending = new Map<number, PendingTask>()
  worker.onmessage = (event: MessageEvent<{ id: number; blob?: Blob; error?: string }>) => {
    const { id, blob, error } = event.data
    const task = pending.get(id)
    if (!task) return
    pending.delete(id)
    if (error || !blob) task.reject(new Error(error ?? 'shrink failed'))
    else task.resolve({ blob })
  }
  worker.onerror = () => {
    for (const task of pending.values()) task.reject(new Error('shrink worker crashed'))
    pending.clear()
    // 下次调用重新建池，避免一直往坏掉的 worker 里投任务
    slots = null
  }
  return { worker, pending }
}

function shrinkInWorker(file: File, maxSide: number, quality: number): Promise<ShrinkResult> {
  const pool = workerPool()
  if (!pool) return Promise.reject(new Error('worker is not supported'))
  const slot = pool[nextSlot++ % pool.length]
  const id = nextTaskId++
  return new Promise<ShrinkResult>((resolve, reject) => {
    slot.pending.set(id, { resolve, reject })
    slot.worker.postMessage({ id, file, maxSide, quality })
  })
}

/* ---------- 主线程兜底 ---------- */

type DecodedImage = {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

async function shrinkOnMainThread(file: File, maxSide: number, quality: number): Promise<ShrinkResult | null> {
  const decoded = await decode(file)
  if (!decoded) return null
  try {
    if (decoded.width <= 0 || decoded.height <= 0) return null
    if (decoded.width * decoded.height > MAX_SOURCE_PIXELS) return null
    const scale = Math.min(1, maxSide / Math.max(decoded.width, decoded.height))
    const width = Math.max(1, Math.round(decoded.width * scale))
    const height = Math.max(1, Math.round(decoded.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return null
    context.imageSmoothingQuality = 'high'
    // 透明 PNG 转 JPEG 会有黑底，先铺白底
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(decoded.source, 0, 0, width, height)
    const blob = await encode(canvas, quality)
    return blob ? { blob } : null
  } finally {
    decoded.release()
  }
}

async function decode(file: File): Promise<DecodedImage | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      // imageOrientation: 让浏览器按 EXIF 把手机照片转正，避免上传后横躺
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }
    } catch {
      /* 老浏览器或解不了的格式，退回 <img> */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('image decode failed'))
      element.src = url
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    }
  } catch {
    URL.revokeObjectURL(url)
    return null
  }
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

function jpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '')
  return `${base || 'image'}.jpg`
}
