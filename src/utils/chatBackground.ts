import type { ChatBackgroundItem } from '../api/chatBackgrounds'

/**
 * 内置聊天背景。
 *
 * <p>预设只存一个 ID，具体渐变写在前端；这样换配色不需要改历史数据。
 * 这里的 ID 必须与后端 {@code ChatBackgroundPresets} 的白名单保持一致。</p>
 */
export type ChatBackgroundPreset = {
  id: string
  name: string
  /** 直接用于 background-image 的 CSS 渐变 */
  css: string
}

export const CHAT_BACKGROUND_PRESETS: ChatBackgroundPreset[] = [
  { id: 'mist', name: '薄雾', css: 'linear-gradient(160deg, #f6f9fd 0%, #e4ecf7 100%)' },
  { id: 'sand', name: '暖沙', css: 'linear-gradient(160deg, #fbf4e9 0%, #f0e1cc 100%)' },
  { id: 'sage', name: '青苔', css: 'linear-gradient(160deg, #eef5ec 0%, #dce9d8 100%)' },
  { id: 'blush', name: '樱粉', css: 'linear-gradient(160deg, #fdf1f3 0%, #f5dde3 100%)' },
  { id: 'dusk', name: '暮蓝', css: 'linear-gradient(160deg, #eef1fa 0%, #dde2f3 100%)' },
  { id: 'graphite', name: '石墨', css: 'linear-gradient(160deg, #2f3442 0%, #3d4353 100%)' },
]

export const EMPTY_CHAT_BACKGROUND: ChatBackgroundItem = { fileId: null, preset: null }

export function presetById(id?: string | null): ChatBackgroundPreset | null {
  if (!id) return null
  return CHAT_BACKGROUND_PRESETS.find((preset) => preset.id === id) ?? null
}

/** 只要图片或预设任一存在，就视为设置过背景。 */
export function hasChatBackground(item?: ChatBackgroundItem | null): boolean {
  return Boolean(item && (item.fileId || item.preset))
}

/** 把选择转成 background-image 的一层；图片需要先换成带鉴权的 object URL。 */
export function chatBackgroundLayer(
  item: ChatBackgroundItem | null | undefined,
  imageUrl: string | null,
): string | null {
  if (item?.fileId && imageUrl) return `url("${imageUrl}")`
  return presetById(item?.preset)?.css ?? null
}
