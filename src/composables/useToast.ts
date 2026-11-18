import { onBeforeUnmount, ref } from 'vue'

/**
 * 轻量操作反馈：一条自动消失的提示。
 *
 * <p>原先每个组件各自维护 `notice` + `noticeTimer`，时长从 2200ms 到 2600ms 不等，
 * 这里统一成同一个默认时长，且卸载时自动清定时器，避免内存里留着已销毁组件的定时任务。</p>
 */
export function useToast(durationMs = 2400) {
  const message = ref('')
  let timer: number | undefined

  function clear() {
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timer = undefined
    }
    message.value = ''
  }

  function show(text: string) {
    message.value = text
    if (timer !== undefined) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      message.value = ''
      timer = undefined
    }, durationMs)
  }

  onBeforeUnmount(clear)

  return { message, show, clear }
}
