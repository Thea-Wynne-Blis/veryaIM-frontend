import { ref } from 'vue'

export type Theme = 'light' | 'dark'

const THEME_KEY = 'veryal.theme'

function initialTheme(): Theme {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  }
  const fromUrl = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('theme')
    : null
  return fromUrl === 'dark' ? 'dark' : 'light'
}

/**
 * 主题是全局设置，不再是侧栏上的快捷开关：
 * 「我的 → 外观」里调整，同一设备记住选择。
 */
const theme = ref<Theme>(initialTheme())

export function useTheme() {
  function apply() {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme.value
      document.querySelector('meta[name="theme-color"]')?.setAttribute(
        'content',
        getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
      )
    }
  }

  function setTheme(next: Theme) {
    theme.value = next
    if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, next)
    apply()
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return { theme, setTheme, toggleTheme, apply }
}
