import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 响应式断点。移动端判定：宽度 <= 768 或粗指针（触屏）且窄屏。
 */
export function useIsMobile(breakpoint = 768) {
  const isMobile = ref(false)

  const update = () => {
    isMobile.value = window.innerWidth <= breakpoint
  }

  onMounted(() => {
    update()
    window.addEventListener('resize', update, { passive: true })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', update)
  })

  return isMobile
}
