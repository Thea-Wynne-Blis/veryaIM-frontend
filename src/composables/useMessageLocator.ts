import { nextTick, onBeforeUnmount } from 'vue'

/** 搜索和收藏共用定位行为，先停止自动贴底，再立即定位并高亮。 */
export function useMessageLocator(scroller: () => HTMLElement | null, beforeLocate: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let highlighted: HTMLElement | null = null

  onBeforeUnmount(() => clearTimeout(timer))

  return async function focusMessage(messageId: string): Promise<boolean> {
    await nextTick()
    const target = scroller()?.querySelector<HTMLElement>(`[data-mid="${CSS.escape(messageId)}"]`)
    if (!target) return false
    beforeLocate()
    clearTimeout(timer)
    highlighted?.classList.remove('flash')
    target.scrollIntoView({ block: 'center', behavior: 'auto' })
    target.classList.add('flash')
    highlighted = target
    timer = setTimeout(() => target.classList.remove('flash'), 1600)
    return true
  }
}
