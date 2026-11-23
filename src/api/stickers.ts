import { api } from './client'

/** 网络表情包搜索：`items` 是第三方图片地址，通过 `/stickers/image` 同源中转展示。 */
export type StickerSearchResult = {
  keyword: string
  page: number
  items: string[]
}

/** 已收藏到本站的表情文件：拿 `fileId` 直接发 IMAGE 消息。 */
export type StickerFile = {
  fileId: number
  name: string
  contentType: string
  sizeBytes: number
  width: number
  height: number
}

export function searchStickers(keyword: string, page = 1): Promise<StickerSearchResult> {
  return api.get<StickerSearchResult>(
    `/stickers/search?keyword=${encodeURIComponent(keyword)}&page=${page}`,
  )
}

/**
 * 收藏表情并立即发送：
 *
 * <p>服务端下载第三方图片、校验类型与体积后落进本站文件子系统，
 * 返回的 fileId 属于当前用户，可以直接作为 IMAGE 消息内容发出。</p>
 */
export function collectSticker(url: string, conversationId: string): Promise<StickerFile> {
  return api.post<StickerFile>('/stickers/collect', { url, conversationId })
}
