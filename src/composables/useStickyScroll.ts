import { nextTick, ref } from 'vue'

/**
 * 消息区的「贴底」滚动。
 *
 * <p>桌面与移动端原先各写了一份：状态、nextTick 守卫、贴底判断都重复。
 * 这里统一成一份，配套的约定是——</p>
 *
 * <ul>
 *   <li>用户往上翻历史时不打断（`stick` 变 false）；</li>
 *   <li>切会话 / 自己发消息时强制回到底部；</li>
 *   <li>每次滚动任务都带 token，切会话或定位消息后旧任务自动失效，</li>
 *   <li>不会出现「旧会话的滚动把新会话滚走」。</li>
 * </ul>
 */
export function useStickyScroll(getEl: () => HTMLElement | null) {
  /** 是否贴住底部。 */
  const stick = ref(true)
  let token = 0

  /** 让之前排队但还没执行的滚动任务失效（切会话、定位消息时调用）。 */
  function invalidate() {
    token += 1
  }

  /** 滚到底；`force` 忽略当前是否贴底（自己发消息 / 切会话）。 */
  function scrollToBottom(force = false) {
    if (!force && !stick.value) return
    const mine = token
    nextTick(() => {
      if (mine !== token || (!force && !stick.value)) return
      const el = getEl()
      if (!el) return
      el.scrollTop = el.scrollHeight
      stick.value = true
    })
  }

  /** 滚到指定位置；`null` 表示底部。用于「记住每个会话的滚动位置」。 */
  function scrollTo(top: number | null) {
    invalidate()
    const mine = token
    nextTick(() => {
      if (mine !== token) return
      const el = getEl()
      if (!el) return
      el.scrollTop =
        top == null ? el.scrollHeight : Math.min(top, Math.max(0, el.scrollHeight - el.clientHeight))
    })
  }

  /** 用户滚动后同步「是否贴底」。 */
  function syncStick() {
    const el = getEl()
    if (!el) return
    stick.value = el.scrollHeight - el.scrollTop - el.clientHeight <= 48
  }

  return { stick, invalidate, scrollToBottom, scrollTo, syncStick }
}
