import { nextTick, onBeforeUnmount, watch, type ObjectDirective } from 'vue'

/**
 * 切换会话时的「逐条入场」动画门控。
 *
 * <p>桌面端与移动端原本各抄了一份一模一样的 arm/disarm、指令与长度监听：
 * 消息节点只在挂载时决定要不要播动画，切会话后 1.2s 内到达的消息算入场，
 * 之后的实时消息直接出现。</p>
 *
 * <p>两边只需要在切会话时调用 {@link arm}，其余由这里统一处理。</p>
 */
export function useEnterAnimation(messageCount: () => number) {
  let armed = false
  let timer: number | null = null

  function arm() {
    armed = true
    if (timer !== null) window.clearTimeout(timer)
    // 空会话或加载很慢时兜底：超过 1.2s 到达的消息按普通实时消息处理
    timer = window.setTimeout(disarm, 1200)
  }

  function disarm() {
    armed = false
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
  }

  /** 只在节点挂载时打上 enter 类，并按序号触发一次「逐条流动」。 */
  const vEnter: ObjectDirective<HTMLElement, { order?: number; skip?: boolean }> = {
    mounted(el, binding) {
      if (!armed || binding.value?.skip) return
      el.style.setProperty('--enter-order', String(binding.value?.order ?? 0))
      el.classList.add('enter')
    },
  }

  // 需要异步加载的会话：等首批消息真正渲染完再收门控
  watch(messageCount, (len) => {
    if (!armed || !len) return
    // 指令的 mounted 在 post 队列里，必须等整个 flush 结束（nextTick）再关门控
    void nextTick(disarm)
  })

  onBeforeUnmount(disarm)

  return { arm, disarm, vEnter }
}
