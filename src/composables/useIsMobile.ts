import { onBeforeUnmount, onMounted, ref } from 'vue'

/** 与 CSS 共用宽度断点，只在跨越断点时更新布局。 */
export function useIsMobile(breakpoint = 768) {
  const media = typeof window === 'undefined' ? null : window.matchMedia(`(max-width: ${breakpoint}px)`)
  const isMobile = ref(media?.matches ?? false)

  const update = (event: MediaQueryListEvent) => {
    isMobile.value = event.matches
  }

  onMounted(() => media?.addEventListener('change', update))
  onBeforeUnmount(() => media?.removeEventListener('change', update))

  return isMobile
}
