import type { Id } from '../api/client'

const AVATAR_BASE = '/api/v1/avatars'

/**
 * 头像地址由 ID 推导，后端提供公开只读接口。
 *
 * <p>未设置头像时接口返回 404，`AppAvatar` 会回退到文字头像，
 * 因此调用方不需要先查一次「有没有头像」。</p>
 */
export function userAvatarSrc(
  userId?: Id | string | null,
  version?: string | number | null,
): string | null {
  if (userId === null || userId === undefined || userId === '' || userId === 0) return null
  const suffix = version ? `?v=${encodeURIComponent(String(version))}` : ''
  return `${AVATAR_BASE}/user/${encodeURIComponent(String(userId))}${suffix}`
}

export function groupAvatarSrc(
  groupId?: string | null,
  version?: string | number | null,
): string | null {
  if (!groupId) return null
  const suffix = version ? `?v=${encodeURIComponent(String(version))}` : ''
  return `${AVATAR_BASE}/group/${encodeURIComponent(groupId)}${suffix}`
}

/** 头像统一裁成正方形再上传：服务端不必解码原图，列表也不会加载几 MB 的大图。 */
export const AVATAR_SIDE = 512

/**
 * 居中裁成正方形并压成 JPEG。
 *
 * <p>动图头像会失去动画（社交产品里头像本来就是静态展示），
 * 换来的是 30~80KB 的上传体积和稳定的服务端校验。</p>
 */
export async function squareAvatarFile(file: File, side = AVATAR_SIDE): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = side
    canvas.height = side
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前浏览器不支持头像裁剪')
    const scale = Math.max(side / bitmap.width, side / bitmap.height)
    const width = bitmap.width * scale
    const height = bitmap.height * scale
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, (side - width) / 2, (side - height) / 2, width, height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.88),
    )
    if (!blob) throw new Error('头像生成失败，请换一张图片')
    return new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
  } finally {
    bitmap.close()
  }
}
