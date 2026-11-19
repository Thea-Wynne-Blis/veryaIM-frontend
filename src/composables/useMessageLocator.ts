import { nextTick, onBeforeUnmount } from 'vue'
import { centerMessage } from '../utils/scroll'

/** 搜索和收藏共用定位行为，先停止自动贴底，再立即定位并高亮。 */
export function useMessageLocator(scroller: () => HTMLElement | null, beforeLocate: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let highlighted: HTMLElement | null = null

  onBeforeUnmount(() => clearTimeout(timer))

  return async function focusMessage(messageId: string): Promise<boolean> {
    await nextTick()
    const container = scroller()
    const target = container?.querySelector<HTMLElement>(`[data-mid="${CSS.escape(messageId)}"]`)
    if (!container || !target) return false
    beforeLocate()
    clearTimeout(timer)
    highlighted?.classList.remove('flash')
    target.classList.remove('enter')
    centerMessage(container, target)
    target.classList.add('flash')
    highlighted = target
    timer = setTimeout(() => target.classList.remove('flash'), 1600)
    return true
  }
}
